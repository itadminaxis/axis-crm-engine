/**
 * TEST-STREAM.JS - Suite de pruebas de Bidireccionalidad (SSE + Callbacks)
 * Verifica SSE, callbacks, y configuracion de URLs.
 * Requisito: servidor corriendo en localhost:3000 (npm start)
 */
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const BASE = 'http://localhost:3000';
const API_KEY = '93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6';
const PROJECT_TOKEN = '51d4b7c55cd96a520d3efabdecda0636';
const PROJECT_ID = 'c1c3632f-a72e-4724-b82a-fc33e7e96913';

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
  console.log('\n  AXIS CRM ENGINE - Bidireccionalidad Test Suite\n');

  // 1. SSE endpoint responde con content-type text/event-stream
  console.log('  --- SSE (Server-Sent Events) ---');
  try {
    const sseData = await new Promise((resolve, reject) => {
      const urlObj = new URL(`${BASE}/stream/live?x-api-key=${API_KEY}`);
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'GET'
      }, (res) => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
          // Cerramos después de recibir la primera data
          req.destroy();
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
        setTimeout(() => {
          req.destroy();
          resolve({ status: res.statusCode, headers: res.headers, data });
        }, 2000);
      });
      req.on('error', (e) => {
        if (e.code === 'ECONNRESET') resolve({ status: 200, headers: {}, data: '' });
        else reject(e);
      });
      req.end();
    });
    assert('[1] SSE endpoint retorna text/event-stream',
      sseData.status === 200 && (sseData.headers['content-type'] || '').includes('text/event-stream'));
  } catch (e) {
    assert('[1] SSE endpoint', false, e.message);
  }

  // 2. SSE sin auth → 401
  try {
    const r = await request(`${BASE}/stream/live`);
    assert('[2] SSE sin auth retorna 401', r.status === 401);
  } catch (e) {
    assert('[2] SSE sin auth', false, e.message);
  }

  // 3. SSE stats endpoint funciona
  try {
    const r = await request(`${BASE}/stream/stats`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[3] GET /stream/stats retorna stats', r.status === 200 && r.body.total !== undefined);
  } catch (e) {
    assert('[3] SSE stats', false, e.message);
  }

  // 4. Configurar callback URLs
  console.log('\n  --- Callbacks (Mothership to X-Wing) ---');
  try {
    const r = await request(`${BASE}/stream/callbacks/${PROJECT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ callback_urls: ['https://httpbin.org/post', 'https://example.com/webhook'] })
    });
    assert('[4] PUT /stream/callbacks/:id configura URLs',
      r.status === 200 && r.body.config?.callback_urls?.length === 2);
  } catch (e) {
    assert('[4] Configurar callbacks', false, e.message);
  }

  // 5. Leer callback URLs
  try {
    const r = await request(`${BASE}/stream/callbacks/${PROJECT_ID}`, {
      headers: { 'x-api-key': API_KEY }
    });
    assert('[5] GET /stream/callbacks/:id retorna URLs',
      r.status === 200 && r.body.callback_urls?.length === 2);
  } catch (e) {
    assert('[5] Leer callbacks', false, e.message);
  }

  // 6. Callback URLs invalidas → error
  try {
    const r = await request(`${BASE}/stream/callbacks/${PROJECT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ callback_urls: ['no-es-url'] })
    });
    assert('[6] URLs invalidas retorna error', r.status === 400);
  } catch (e) {
    assert('[6] URLs invalidas', false, e.message);
  }

  // 7. SSE recibe evento cuando se crea un lead
  console.log('\n  --- SSE Tiempo Real ---');
  try {
    const receivedEvents = [];

    // Conectar SSE
    const ssePromise = new Promise((resolve) => {
      const urlObj = new URL(`${BASE}/stream/live?x-api-key=${API_KEY}`);
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'GET'
      }, (res) => {
        res.on('data', chunk => {
          const text = chunk.toString();
          // Parse SSE events
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              receivedEvents.push(line.replace('event: ', ''));
            }
          }
        });

        // Dar tiempo para que el lead se cree y el evento llegue
        setTimeout(() => {
          req.destroy();
          resolve(receivedEvents);
        }, 3000);
      });
      req.on('error', () => resolve(receivedEvents));
      req.end();
    });

    // Esperar a que SSE se conecte
    await new Promise(r => setTimeout(r, 500));

    // Crear un lead para disparar evento
    const testPhone = `+52888${Date.now().toString().slice(-6)}`;
    await request(`${BASE}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-project-token': PROJECT_TOKEN },
      body: JSON.stringify({ phone: testPhone, source: 'TEST_SSE', nombre: 'SSE Test' })
    });

    const events = await ssePromise;
    const hasLeadEvent = events.some(e => e === 'lead.created' || e === 'lead.updated');
    assert('[7] SSE recibe evento lead.created/updated en tiempo real', hasLeadEvent);
  } catch (e) {
    assert('[7] SSE tiempo real', false, e.message);
  }

  // 8. Limpiar callbacks (dejar vacio)
  try {
    const r = await request(`${BASE}/stream/callbacks/${PROJECT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ callback_urls: [] })
    });
    assert('[8] Limpiar callback URLs', r.status === 200);
  } catch (e) {
    assert('[8] Limpiar callbacks', false, e.message);
  }

  // 9. Rutas de stream protegidas (stats sin auth)
  console.log('\n  --- Seguridad ---');
  try {
    const r = await request(`${BASE}/stream/stats`);
    assert('[9] /stream/stats sin auth retorna 401', r.status === 401);
  } catch (e) {
    assert('[9] Stream seguridad', false, e.message);
  }

  // 10. Callbacks sin auth → 401
  try {
    const r = await request(`${BASE}/stream/callbacks/${PROJECT_ID}`);
    assert('[10] /stream/callbacks sin auth retorna 401', r.status === 401);
  } catch (e) {
    assert('[10] Callbacks seguridad', false, e.message);
  }

  // Resumen
  console.log('\n  ────────────────────────────────');
  console.log(`  Resultados: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('  ────────────────────────────────\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
