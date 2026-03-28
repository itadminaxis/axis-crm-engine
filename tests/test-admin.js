/**
 * TEST-ADMIN.JS - Suite de pruebas del Panel Admin (El Estacionamiento)
 * Verifica CRUD de proyectos, toggles de modulos, stats y tokens.
 * Requisito: servidor corriendo en localhost:3000 (npm start)
 */
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const BASE = 'http://localhost:3000';
const API_KEY = '93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6';

let passed = 0;
let failed = 0;
let testProjectId = null;
let testProjectToken = null;

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
  console.log('\n  AXIS CRM ENGINE - Admin Panel Test Suite\n');

  // 1. GET /projects retorna array
  console.log('  --- CRUD de Proyectos (X-Wings) ---');
  try {
    const r = await request(`${BASE}/projects`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[1] GET /projects retorna array', r.status === 200 && Array.isArray(r.body));
  } catch (e) {
    assert('[1] GET /projects retorna array', false, e.message);
  }

  // 2. POST /projects crea nuevo X-Wing
  const testName = `Test Wing ${Date.now()}`;
  try {
    const r = await request(`${BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ name: testName, description: 'Proyecto de prueba automatica' })
    });
    testProjectId = r.body?.id;
    testProjectToken = r.body?.public_token;
    assert('[2] POST /projects crea X-Wing', r.status === 201 && !!testProjectId && !!testProjectToken);
  } catch (e) {
    assert('[2] POST /projects crea X-Wing', false, e.message);
  }

  // 3. GET /projects/:id retorna proyecto con stats
  if (testProjectId) {
    try {
      const r = await request(`${BASE}/projects/${testProjectId}`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[3] GET /projects/:id retorna detalle con stats',
        r.status === 200 && r.body.name === testName && r.body.total_leads !== undefined);
    } catch (e) {
      assert('[3] GET /projects/:id retorna detalle', false, e.message);
    }
  } else {
    assert('[3] GET /projects/:id retorna detalle', false, 'No se creo proyecto');
  }

  // 4. PUT /projects/:id actualiza nombre y modulos
  if (testProjectId) {
    try {
      const r = await request(`${BASE}/projects/${testProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({
          name: testName + ' Updated',
          enable_ai_prescriptive: false,
          enable_instant_response: false
        })
      });
      assert('[4] PUT /projects/:id actualiza config',
        r.status === 200 && r.body.enable_ai_prescriptive === false && r.body.enable_instant_response === false);
    } catch (e) {
      assert('[4] PUT /projects/:id actualiza config', false, e.message);
    }
  } else {
    assert('[4] PUT /projects/:id actualiza config', false, 'No se creo proyecto');
  }

  // 5. POST /projects/:id/regenerate-token genera nuevo token
  if (testProjectId) {
    try {
      const r = await request(`${BASE}/projects/${testProjectId}/regenerate-token`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY }
      });
      const newToken = r.body?.public_token;
      assert('[5] Regenerar token genera uno nuevo',
        r.status === 200 && !!newToken && newToken !== testProjectToken);
    } catch (e) {
      assert('[5] Regenerar token', false, e.message);
    }
  } else {
    assert('[5] Regenerar token', false, 'No se creo proyecto');
  }

  // 6. GET /projects/stats retorna estadisticas globales
  console.log('\n  --- Estadisticas ---');
  try {
    const r = await request(`${BASE}/projects/stats`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[6] GET /projects/stats retorna stats globales',
      r.status === 200 && r.body.total_projects !== undefined && r.body.total_leads !== undefined && r.body.total_events !== undefined);
  } catch (e) {
    assert('[6] GET /projects/stats', false, e.message);
  }

  // 7. El proyecto creado aparece en el listado
  try {
    const r = await request(`${BASE}/projects`, {
      headers: { 'x-api-key': API_KEY }
    });
    const found = Array.isArray(r.body) && r.body.some(p => p.id === testProjectId);
    assert('[7] Proyecto aparece en listado', found);
  } catch (e) {
    assert('[7] Proyecto aparece en listado', false, e.message);
  }

  // 8. El token generado funciona en /api/submit
  if (testProjectId) {
    try {
      // Get current token
      const proj = await request(`${BASE}/projects/${testProjectId}`, {
        headers: { 'x-api-key': API_KEY }
      });
      const currentToken = proj.body?.public_token;

      const testPhone = `+52555${Date.now().toString().slice(-6)}`;
      const r = await request(`${BASE}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-project-token': currentToken },
        body: JSON.stringify({ phone: testPhone, source: 'TEST_ADMIN', nombre: 'Admin Test Lead' })
      });
      assert('[8] Token del proyecto funciona en /api/submit', r.status === 201);
    } catch (e) {
      assert('[8] Token funciona en /api/submit', false, e.message);
    }
  } else {
    assert('[8] Token funciona en /api/submit', false, 'No se creo proyecto');
  }

  // 9. Proyectos sin auth → 401
  console.log('\n  --- Seguridad ---');
  try {
    const r = await request(`${BASE}/projects`);
    assert('[9] GET /projects sin auth retorna 401', r.status === 401);
  } catch (e) {
    assert('[9] GET /projects sin auth', false, e.message);
  }

  // 10. DELETE /projects/:id elimina el proyecto
  if (testProjectId) {
    try {
      const r = await request(`${BASE}/projects/${testProjectId}`, {
        method: 'DELETE',
        headers: { 'x-api-key': API_KEY }
      });
      assert('[10] DELETE /projects/:id elimina X-Wing', r.status === 200 && r.body.id === testProjectId);
    } catch (e) {
      assert('[10] DELETE /projects/:id', false, e.message);
    }
  } else {
    assert('[10] DELETE /projects/:id', false, 'No se creo proyecto');
  }

  // 11. Proyecto eliminado ya no aparece
  if (testProjectId) {
    try {
      const r = await request(`${BASE}/projects/${testProjectId}`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[11] Proyecto eliminado retorna 404', r.status === 404);
    } catch (e) {
      assert('[11] Proyecto eliminado', false, e.message);
    }
  } else {
    assert('[11] Proyecto eliminado', false, 'No se creo proyecto');
  }

  // 12. Dashboard admin.html accesible
  try {
    const r = await request(`${BASE}/dashboard/admin`);
    const isHtml = typeof r.body === 'string' && r.body.includes('Estacionamiento');
    assert('[12] Dashboard /dashboard/admin accesible', r.status === 200 && isHtml);
  } catch (e) {
    assert('[12] Dashboard admin accesible', false, e.message);
  }

  // Resumen
  console.log('\n  ────────────────────────────────');
  console.log(`  Resultados: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('  ────────────────────────────────\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
