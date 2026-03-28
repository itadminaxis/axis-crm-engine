/**
 * TEST-CORE.JS - Suite de pruebas del core funcional
 * Verifica que todos los endpoints esenciales del CRM responden correctamente.
 * Requisito: servidor corriendo en localhost:3000 (npm start)
 */
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const BASE = 'http://localhost:3000';
const API_KEY = '93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6';
const PROJECT_SICILIA = 'c1c3632f-a72e-4724-b82a-fc33e7e96913';

let passed = 0;
let failed = 0;
let createdLeadId = null;

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
  console.log('\n  AXIS CRM ENGINE - Core Test Suite\n');

  // 1. Health check
  console.log('  --- Infraestructura ---');
  try {
    const r = await request(`${BASE}/health`);
    assert('[1] Health check retorna 200 + UP', r.status === 200 && r.body.status === 'UP');
  } catch (e) {
    assert('[1] Health check retorna 200 + UP', false, e.message);
  }

  // 2. Auth - sin API key
  console.log('\n  --- Autenticacion ---');
  try {
    const r = await request(`${BASE}/leads`);
    assert('[2] Sin x-api-key retorna 401', r.status === 401);
  } catch (e) {
    assert('[2] Sin x-api-key retorna 401', false, e.message);
  }

  // 3. Auth - API key invalida
  try {
    const r = await request(`${BASE}/leads`, {
      headers: { 'x-api-key': 'clave_falsa_12345' }
    });
    assert('[3] API key invalida retorna 403', r.status === 403);
  } catch (e) {
    assert('[3] API key invalida retorna 403', false, e.message);
  }

  // 4. Crear lead manual
  console.log('\n  --- Leads CRUD ---');
  const testPhone = `+52999${Date.now().toString().slice(-6)}`;
  try {
    const r = await request(`${BASE}/leads/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        phone: testPhone,
        project_id: PROJECT_SICILIA,
        source: 'TEST_CORE',
        nombre: 'Lead de Prueba'
      })
    });
    createdLeadId = r.body?.lead?.id || r.body?.id;
    assert('[4] POST /leads/manual retorna 201 con id', r.status === 201 && !!createdLeadId);
  } catch (e) {
    assert('[4] POST /leads/manual retorna 201 con id', false, e.message);
  }

  // 5. Listar leads
  try {
    const r = await request(`${BASE}/leads`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[5] GET /leads retorna array', r.status === 200 && Array.isArray(r.body));
  } catch (e) {
    assert('[5] GET /leads retorna array', false, e.message);
  }

  // 6. Obtener lead por ID
  if (createdLeadId) {
    try {
      const r = await request(`${BASE}/leads/${createdLeadId}`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[6] GET /leads/:id retorna lead', r.status === 200 && r.body.phone === testPhone);
    } catch (e) {
      assert('[6] GET /leads/:id retorna lead', false, e.message);
    }
  } else {
    assert('[6] GET /leads/:id retorna lead', false, 'No se creo lead en test 4');
  }

  // 7. Journey del lead
  if (createdLeadId) {
    try {
      const r = await request(`${BASE}/leads/${createdLeadId}/journey`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[7] GET /leads/:id/journey retorna timeline', r.status === 200 && r.body.phone === testPhone);
    } catch (e) {
      assert('[7] GET /leads/:id/journey retorna timeline', false, e.message);
    }
  } else {
    assert('[7] GET /leads/:id/journey retorna timeline', false, 'No se creo lead');
  }

  // 8. Agregar milestone
  if (createdLeadId) {
    try {
      const r = await request(`${BASE}/leads/${createdLeadId}/milestone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ type: 'test_milestone', details: { test: true } })
      });
      assert('[8] POST /leads/:id/milestone retorna exito', (r.status === 200 || r.status === 201) && r.body.milestones);
    } catch (e) {
      assert('[8] POST /leads/:id/milestone retorna exito', false, e.message);
    }
  } else {
    assert('[8] POST /leads/:id/milestone retorna exito', false, 'No se creo lead');
  }

  // 9. Flow canvas
  console.log('\n  --- Ecosistema ---');
  try {
    const r = await request(`${BASE}/flow`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[9] GET /flow retorna nodos y edges', r.status === 200 && r.body.nodes && r.body.edges);
  } catch (e) {
    assert('[9] GET /flow retorna nodos y edges', false, e.message);
  }

  // 10. Webhook Meta verification
  console.log('\n  --- Webhooks ---');
  try {
    const token = process.env.META_VERIFY_TOKEN || 'axis_crm_engine_verify_token';
    const challenge = 'test_challenge_123';
    const r = await request(`${BASE}/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=${challenge}`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[10] GET /webhook retorna challenge', r.status === 200 && r.body === challenge);
  } catch (e) {
    assert('[10] GET /webhook retorna challenge', false, e.message);
  }

  // 11. Metricas
  console.log('\n  --- Metricas ---');
  try {
    const r = await request(`${BASE}/metrics`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[11] GET /metrics retorna estructura ISO', r.status === 200 && r.body.metrics);
  } catch (e) {
    assert('[11] GET /metrics retorna estructura ISO', false, e.message);
  }

  // 12. Swagger docs
  console.log('\n  --- Documentacion ---');
  try {
    const r = await request(`${BASE}/api-docs/`);
    assert('[12] GET /api-docs responde 200', r.status === 200 || r.status === 301);
  } catch (e) {
    assert('[12] GET /api-docs responde 200', false, e.message);
  }

  // 13. Dashboard estatico
  try {
    const r = await request(`${BASE}/dashboard/`);
    const isHtml = typeof r.body === 'string' && r.body.includes('Torre de');
    assert('[13] GET /dashboard sirve HTML', r.status === 200 && isHtml);
  } catch (e) {
    assert('[13] GET /dashboard sirve HTML', false, e.message);
  }

  // Resumen
  console.log('\n  ────────────────────────────────');
  console.log(`  Resultados: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('  ────────────────────────────────\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
