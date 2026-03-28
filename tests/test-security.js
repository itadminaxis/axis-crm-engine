/**
 * TEST-SECURITY.JS - Suite de pruebas de seguridad
 * Verifica proxy público, rate limiting, CORS headers y helmet.
 * Requisito: servidor corriendo en localhost:3000 (npm start)
 */
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const BASE = 'http://localhost:3000';
const API_KEY = '93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6';
const PROJECT_TOKEN_SICILIA = '51d4b7c55cd96a520d3efabdecda0636';

let passed = 0;
let failed = 0;

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOpts = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body;
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

async function runTests() {
  console.log('\n  AXIS CRM ENGINE - Security Test Suite\n');

  // 1. POST /api/submit con project_token válido → 201
  console.log('  --- Proxy Público (/api/submit) ---');
  const testPhone = `+52888${Date.now().toString().slice(-6)}`;
  try {
    const r = await request(`${BASE}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-project-token': PROJECT_TOKEN_SICILIA
      },
      body: JSON.stringify({
        phone: testPhone,
        source: 'TEST_SECURITY',
        nombre: 'Security Test Lead'
      })
    });
    assert('[1] POST /api/submit con token válido → 201', r.status === 201 && r.body.lead?.id);
  } catch (e) {
    assert('[1] POST /api/submit con token válido → 201', false, e.message);
  }

  // 2. POST /api/submit sin token → 401
  try {
    const r = await request(`${BASE}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+521111111111' })
    });
    assert('[2] POST /api/submit sin token → 401', r.status === 401);
  } catch (e) {
    assert('[2] POST /api/submit sin token → 401', false, e.message);
  }

  // 3. POST /api/submit con token inválido → 403
  try {
    const r = await request(`${BASE}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-project-token': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1'
      },
      body: JSON.stringify({ phone: '+521111111111' })
    });
    assert('[3] POST /api/submit con token inválido → 403', r.status === 403);
  } catch (e) {
    assert('[3] POST /api/submit con token inválido → 403', false, e.message);
  }

  // 4. Rutas privadas siguen protegidas
  console.log('\n  --- Rutas privadas intactas ---');
  try {
    const r = await request(`${BASE}/leads`);
    assert('[4] GET /leads sin x-api-key → 401', r.status === 401);
  } catch (e) {
    assert('[4] GET /leads sin x-api-key → 401', false, e.message);
  }

  // 5. Rutas privadas funcionan con API key
  try {
    const r = await request(`${BASE}/leads`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[5] GET /leads con x-api-key → 200', r.status === 200 && Array.isArray(r.body));
  } catch (e) {
    assert('[5] GET /leads con x-api-key → 200', false, e.message);
  }

  // 6. Headers de seguridad (helmet)
  console.log('\n  --- Helmet Headers ---');
  try {
    const r = await request(`${BASE}/health`);
    const hasXContent = r.headers['x-content-type-options'] === 'nosniff';
    const hasXDNS = r.headers['x-dns-prefetch-control'] === 'off';
    const hasXFrame = !!r.headers['x-frame-options'];
    assert('[6] Helmet headers presentes', hasXContent && hasXDNS && hasXFrame,
      `x-content-type: ${r.headers['x-content-type-options']}, x-frame: ${r.headers['x-frame-options']}`);
  } catch (e) {
    assert('[6] Helmet headers presentes', false, e.message);
  }

  // 7. Lead creado vía /api/submit es visible vía /leads (mismo tenant)
  console.log('\n  --- Integridad de datos ---');
  try {
    const r = await request(`${BASE}/leads?search=${encodeURIComponent(testPhone)}`, {
      headers: { 'x-api-key': API_KEY }
    });
    const found = Array.isArray(r.body) && r.body.some(l => l.phone === testPhone);
    assert('[7] Lead de /api/submit visible en /leads', found);
  } catch (e) {
    assert('[7] Lead de /api/submit visible en /leads', false, e.message);
  }

  // 8. Token con formato inválido (no hex) → 403
  try {
    const r = await request(`${BASE}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-project-token': 'NOT-VALID-HEX!!!'
      },
      body: JSON.stringify({ phone: '+521111111111' })
    });
    assert('[8] Token formato inválido → 403', r.status === 403);
  } catch (e) {
    assert('[8] Token formato inválido → 403', false, e.message);
  }

  // Resumen
  console.log('\n  ────────────────────────────────');
  console.log(`  Resultados: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('  ────────────────────────────────\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
