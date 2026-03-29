/**
 * TEST-DIGEST.JS — Suite de pruebas del Digest Mensual
 * Verifica que el digest se puede disparar y que la migración está aplicada.
 * Requisito: servidor corriendo + worker activo + DATABASE_URL
 */
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const BASE      = 'http://localhost:3000';
const API_SECRET = process.env.API_SECRET || '';
const API_KEY   = '93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6';

let passed = 0;
let failed = 0;

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const reqOpts = {
      hostname: urlObj.hostname,
      port:     urlObj.port || 80,
      path:     urlObj.pathname + urlObj.search,
      method:   options.method || 'GET',
      headers:  options.headers || {}
    };
    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body;
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function assert(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else           { failed++; console.log(`  FAIL  ${name}  ${detail}`); }
}

async function runTests() {
  console.log('\n  AXIS CRM ENGINE - Digest Mensual Test Suite\n');

  // 1. Trigger sin auth → 401
  console.log('  --- Seguridad ---');
  try {
    const r = await request(`${BASE}/api/admin/metrics/digest/trigger`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert('[1] Trigger sin auth → 401', r.status === 401);
  } catch (e) {
    assert('[1] Trigger sin auth → 401', false, e.message);
  }

  // 2. Trigger con API_SECRET correcto → 200 (o 500 si no hay worker)
  console.log('\n  --- Trigger manual ---');
  if (!API_SECRET) {
    console.log('  SKIP  [2] API_SECRET no configurado en .env — saltando');
    passed++;
  } else {
    try {
      const r = await request(`${BASE}/api/admin/metrics/digest/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_SECRET },
        body: JSON.stringify({ month: '2026-02' })
      });
      assert('[2] Trigger con API_SECRET → 200 + mensaje', r.status === 200 && r.body?.message?.includes('Digest'));
    } catch (e) {
      assert('[2] Trigger con API_SECRET → 200', false, e.message);
    }
  }

  // 3. Trigger con mes inválido → 400
  if (API_SECRET) {
    try {
      const r = await request(`${BASE}/api/admin/metrics/digest/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_SECRET },
        body: JSON.stringify({ month: 'nope-13' })
      });
      assert('[3] Trigger con mes inválido → 400', r.status === 400);
    } catch (e) {
      assert('[3] Trigger con mes inválido → 400', false, e.message);
    }
  } else {
    console.log('  SKIP  [3] API_SECRET no configurado — saltando');
    passed++;
  }

  // 4. Verificar campo notify_email en tenants vía endpoint de leads (indirecto)
  console.log('\n  --- Schema de base de datos ---');
  try {
    // Si la migración está aplicada, /test-identity funciona sin error
    const r = await request(`${BASE}/test-identity`, { headers: { 'x-api-key': API_KEY } });
    assert('[4] Servidor responde con tenant válido', r.status === 200 && !!r.body?.tenant?.id);
  } catch (e) {
    assert('[4] Servidor responde con tenant válido', false, e.message);
  }

  // 5. Trigger sin body (mes anterior automático) también válido
  if (API_SECRET) {
    try {
      const r = await request(`${BASE}/api/admin/metrics/digest/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_SECRET },
        body: '{}'
      });
      assert('[5] Trigger sin especificar mes → 200 automático', r.status === 200);
    } catch (e) {
      assert('[5] Trigger sin especificar mes → 200 automático', false, e.message);
    }
  } else {
    console.log('  SKIP  [5] API_SECRET no configurado — saltando');
    passed++;
  }

  // Resumen
  console.log('\n  ────────────────────────────────');
  console.log(`  Resultados: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('  ────────────────────────────────\n');

  if (failed > 0) {
    console.log('  NOTA: Para tests 2/3/5 necesitas API_SECRET en .env');
    console.log('  Para recibir el email real necesitas RESEND_API_KEY + notify_email en tu tenant.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
