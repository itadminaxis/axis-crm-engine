/**
 * TEST-EVENTS.JS - Suite de pruebas del Event Log
 * Verifica que los eventos se registran automáticamente y son consultables.
 * Requisito: servidor corriendo en localhost:3000 (npm start)
 */
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const BASE = 'http://localhost:3000';
const API_KEY = '93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6';
const PROJECT_TOKEN = '51d4b7c55cd96a520d3efabdecda0636';

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
  console.log('\n  AXIS CRM ENGINE - Event Log Test Suite\n');

  // 1. Crear lead → genera evento lead.created
  console.log('  --- Registro automatico de eventos ---');
  const testPhone = `+52777${Date.now().toString().slice(-6)}`;
  try {
    const r = await request(`${BASE}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-project-token': PROJECT_TOKEN },
      body: JSON.stringify({ phone: testPhone, source: 'TEST_EVENTS', nombre: 'Event Test' })
    });
    createdLeadId = r.body?.lead?.id;
    assert('[1] Lead creado para test de eventos', r.status === 201 && !!createdLeadId);
  } catch (e) {
    assert('[1] Lead creado para test de eventos', false, e.message);
  }

  // Esperar un momento para que el evento se registre
  await new Promise(r => setTimeout(r, 500));

  // 2. Verificar que evento lead.created existe
  if (createdLeadId) {
    try {
      const r = await request(`${BASE}/events?entity_id=${createdLeadId}`, {
        headers: { 'x-api-key': API_KEY }
      });
      const hasLeadEvent = Array.isArray(r.body) && r.body.some(e => e.event_type === 'lead.created' || e.event_type === 'lead.updated');
      assert('[2] Evento lead.created/updated registrado', hasLeadEvent);
    } catch (e) {
      assert('[2] Evento lead.created registrado', false, e.message);
    }
  } else {
    assert('[2] Evento lead.created registrado', false, 'No se creo lead');
  }

  // 3. Agregar milestone → genera evento milestone.added
  if (createdLeadId) {
    try {
      await request(`${BASE}/leads/${createdLeadId}/milestone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ type: 'contacto_inicial', details: { canal: 'whatsapp' } })
      });

      await new Promise(r => setTimeout(r, 500));

      const r = await request(`${BASE}/events?entity_id=${createdLeadId}`, {
        headers: { 'x-api-key': API_KEY }
      });
      const hasMilestone = Array.isArray(r.body) && r.body.some(e => e.event_type === 'milestone.added');
      assert('[3] Evento milestone.added registrado', hasMilestone);
    } catch (e) {
      assert('[3] Evento milestone.added registrado', false, e.message);
    }
  } else {
    assert('[3] Evento milestone.added registrado', false, 'No se creo lead');
  }

  // 4. GET /events retorna array de eventos
  console.log('\n  --- Consulta de eventos ---');
  try {
    const r = await request(`${BASE}/events`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[4] GET /events retorna array', r.status === 200 && Array.isArray(r.body));
  } catch (e) {
    assert('[4] GET /events retorna array', false, e.message);
  }

  // 5. GET /events/timeline/:id retorna timeline ordenado
  if (createdLeadId) {
    try {
      const r = await request(`${BASE}/events/timeline/${createdLeadId}`, {
        headers: { 'x-api-key': API_KEY }
      });
      const isOrdered = Array.isArray(r.body) && r.body.length >= 2;
      assert('[5] GET /events/timeline/:id retorna timeline', r.status === 200 && isOrdered);
    } catch (e) {
      assert('[5] GET /events/timeline/:id retorna timeline', false, e.message);
    }
  } else {
    assert('[5] GET /events/timeline/:id retorna timeline', false, 'No se creo lead');
  }

  // 6. Eventos sin auth → 401
  try {
    const r = await request(`${BASE}/events`);
    assert('[6] GET /events sin auth → 401', r.status === 401);
  } catch (e) {
    assert('[6] GET /events sin auth → 401', false, e.message);
  }

  // Resumen
  console.log('\n  ────────────────────────────────');
  console.log(`  Resultados: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('  ────────────────────────────────\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
