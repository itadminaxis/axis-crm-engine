/**
 * TEST-FLEET.JS - Suite de pruebas de Flota Externa (5 niveles)
 * Verifica: managed, hosted, reseller, contractor + colorimetria + seguridad.
 * Requisito: servidor corriendo en localhost:3000 (npm start)
 *
 * COLORIMETRIA DE NIVELES:
 *   #2ECC71  SELF        — Tu negocio (no se crea via API)
 *   #00D1FF  MANAGED     — Cliente que analizas (acceso full)
 *   #FF6B2B  HOSTED      — Cliente SaaS (solo metricas)
 *   #8E44AD  RESELLER    — Aliado white-label (crea sub-clientes)
 *   #F1C40F  CONTRACTOR  — Te subcontratan (acceso temporal)
 */
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const BASE = 'http://localhost:3000';
const API_KEY = '93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6';

let passed = 0;
let failed = 0;
let managedTenant = null;
let hostedTenant = null;
let resellerTenant = null;
let contractorTenant = null;

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
  console.log('\n  AXIS CRM ENGINE - Fleet Test Suite (5 Niveles)\n');

  // ═══ MAPA DE NIVELES ═══
  console.log('  --- Mapa de Niveles y Colorimetria ---');

  // 1. GET /admin/fleet/levels retorna mapa completo
  try {
    const r = await request(`${BASE}/admin/fleet/levels`, {
      headers: { 'x-api-key': API_KEY }
    });
    const levels = r.body;
    assert('[1] Mapa de niveles tiene 5 niveles',
      Array.isArray(levels) && levels.length === 5);
    assert('[2] Colores correctos por nivel',
      levels[0]?.color === '#2ECC71' &&  // self = verde
      levels[1]?.color === '#00D1FF' &&  // managed = azul
      levels[2]?.color === '#FF6B2B' &&  // hosted = naranja
      levels[3]?.color === '#8E44AD' &&  // reseller = morado
      levels[4]?.color === '#F1C40F');   // contractor = dorado
    assert('[3] Cada nivel tiene descripcion y data_access',
      levels.every(l => l.description && l.data_access));
  } catch (e) {
    assert('[1] Mapa de niveles', false, e.message);
    assert('[2] Colores', false, e.message);
    assert('[3] Descripciones', false, e.message);
  }

  // ═══ ONBOARDING 4 TIPOS ═══
  console.log('\n  --- Onboarding de los 4 Niveles ---');

  // 4. MANAGED (azul)
  try {
    const r = await request(`${BASE}/admin/fleet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ name: 'Hamburguesas Don Pepe', access_level: 'managed' })
    });
    managedTenant = r.body;
    assert('[4] Onboard MANAGED: color azul #00D1FF',
      r.status === 201 && managedTenant.tenant?.color === '#00D1FF' && managedTenant.tenant?.access_level === 'managed');
  } catch (e) {
    assert('[4] Onboard managed', false, e.message);
  }

  // 5. HOSTED (naranja)
  try {
    const r = await request(`${BASE}/admin/fleet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ name: 'Gym Norte Fitness', access_level: 'hosted' })
    });
    hostedTenant = r.body;
    assert('[5] Onboard HOSTED: color naranja #FF6B2B',
      r.status === 201 && hostedTenant.tenant?.color === '#FF6B2B' && hostedTenant.tenant?.access_level === 'hosted');
  } catch (e) {
    assert('[5] Onboard hosted', false, e.message);
  }

  // 6. RESELLER (morado) con branding
  try {
    const r = await request(`${BASE}/admin/fleet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        name: 'Digital Solutions MX',
        access_level: 'reseller',
        branding: { brand_name: 'DigiSolMX', logo_url: 'https://example.com/logo.png', primary_color: '#FF0000' }
      })
    });
    resellerTenant = r.body;
    assert('[6] Onboard RESELLER: color morado #8E44AD + branding',
      r.status === 201 && resellerTenant.tenant?.color === '#8E44AD' && resellerTenant.tenant?.branding?.brand_name === 'DigiSolMX');
  } catch (e) {
    assert('[6] Onboard reseller', false, e.message);
  }

  // 7. CONTRACTOR (dorado) con expiracion
  try {
    const r = await request(`${BASE}/admin/fleet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ name: 'Despacho Contable Lopez', access_level: 'contractor', expires_in_days: 30 })
    });
    contractorTenant = r.body;
    assert('[7] Onboard CONTRACTOR: color dorado #F1C40F + expiracion',
      r.status === 201 && contractorTenant.tenant?.color === '#F1C40F' && !!contractorTenant.tenant?.access_expires_at);
  } catch (e) {
    assert('[7] Onboard contractor', false, e.message);
  }

  // ═══ CREAR LEADS EN CADA TENANT ═══
  const tenants = [
    { label: 'managed', data: managedTenant },
    { label: 'hosted', data: hostedTenant },
    { label: 'reseller', data: resellerTenant },
    { label: 'contractor', data: contractorTenant }
  ];

  for (const t of tenants) {
    if (t.data?.project?.public_token) {
      const phone = `+52${Date.now().toString().slice(-10)}`;
      await request(`${BASE}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-project-token': t.data.project.public_token },
        body: JSON.stringify({ phone, source: `TEST_${t.label.toUpperCase()}`, nombre: `Test ${t.label}` })
      });
    }
  }
  await new Promise(r => setTimeout(r, 500));

  // ═══ CROSS-TENANT: MANAGED (acceso full) ═══
  console.log('\n  --- Cross-Tenant por Nivel ---');

  // 8. MANAGED: leads con acceso full
  if (managedTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet/${managedTenant.tenant.id}/leads`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[8] MANAGED leads: acceso full con custom_data',
        r.body.access === 'full' && r.body.leads?.[0]?.custom_data);
    } catch (e) { assert('[8] Managed leads', false, e.message); }
  } else { assert('[8] Managed leads', false, 'No se creo'); }

  // 9. HOSTED: leads enmascarados
  if (hostedTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet/${hostedTenant.tenant.id}/leads`, {
        headers: { 'x-api-key': API_KEY }
      });
      const lead = r.body.leads?.[0];
      assert('[9] HOSTED leads: masked, sin custom_data, phone con ****',
        r.body.access === 'masked' && !lead?.custom_data && lead?.phone?.includes('****'));
    } catch (e) { assert('[9] Hosted leads', false, e.message); }
  } else { assert('[9] Hosted leads', false, 'No se creo'); }

  // 10. RESELLER: solo stats, NUNCA datos individuales
  if (resellerTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet/${resellerTenant.tenant.id}/leads`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[10] RESELLER leads: stats_only, sin datos individuales',
        r.body.access === 'stats_only' && r.body.stats && !r.body.leads);
    } catch (e) { assert('[10] Reseller leads', false, e.message); }
  } else { assert('[10] Reseller leads', false, 'No se creo'); }

  // 11. CONTRACTOR: acceso full (no ha expirado)
  if (contractorTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet/${contractorTenant.tenant.id}/leads`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[11] CONTRACTOR leads: acceso full (no expirado)',
        r.body.access === 'full' && r.body.leads?.length > 0);
    } catch (e) { assert('[11] Contractor leads', false, e.message); }
  } else { assert('[11] Contractor leads', false, 'No se creo'); }

  // ═══ EVENTOS POR NIVEL ═══
  console.log('\n  --- Eventos Cross-Tenant ---');

  // 12. MANAGED eventos: full
  if (managedTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet/${managedTenant.tenant.id}/events`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[12] MANAGED eventos: acceso full con payload', r.body.access === 'full');
    } catch (e) { assert('[12] Managed eventos', false, e.message); }
  } else { assert('[12] Managed eventos', false, 'No se creo'); }

  // 13. HOSTED eventos: summary
  if (hostedTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet/${hostedTenant.tenant.id}/events`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[13] HOSTED eventos: solo summary', r.body.access === 'summary');
    } catch (e) { assert('[13] Hosted eventos', false, e.message); }
  } else { assert('[13] Hosted eventos', false, 'No se creo'); }

  // 14. RESELLER eventos: summary
  if (resellerTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet/${resellerTenant.tenant.id}/events`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[14] RESELLER eventos: solo summary', r.body.access === 'summary');
    } catch (e) { assert('[14] Reseller eventos', false, e.message); }
  } else { assert('[14] Reseller eventos', false, 'No se creo'); }

  // ═══ RESELLER WHITE-LABEL ═══
  console.log('\n  --- Reseller White-Label ---');

  // 15. Reseller puede crear sub-clientes con su propia api_key
  if (resellerTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': resellerTenant.tenant.api_key },
        body: JSON.stringify({ name: 'Pasteleria Rosa (cliente de DigiSol)', access_level: 'managed' })
      });
      assert('[15] Reseller crea sub-cliente con su api_key', r.status === 201 && !!r.body.tenant?.id);

      // Cleanup sub-cliente
      if (r.body.tenant?.id) {
        await request(`${BASE}/admin/fleet/${r.body.tenant.id}`, {
          method: 'DELETE',
          headers: { 'x-api-key': resellerTenant.tenant.api_key }
        });
      }
    } catch (e) { assert('[15] Reseller sub-cliente', false, e.message); }
  } else { assert('[15] Reseller sub-cliente', false, 'No se creo'); }

  // 16. Actualizar branding del reseller
  if (resellerTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet/${resellerTenant.tenant.id}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ brand_name: 'DigiSol Rebranded', primary_color: '#00FF00' })
      });
      assert('[16] Actualizar branding del reseller', r.status === 200 && r.body.branding?.brand_name === 'DigiSol Rebranded');
    } catch (e) { assert('[16] Branding', false, e.message); }
  } else { assert('[16] Branding', false, 'No se creo'); }

  // ═══ CONTRACTOR EXPIRACION ═══
  console.log('\n  --- Contractor Expiracion ---');

  // 17. Detalle contractor muestra is_expired = false
  if (contractorTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet/${contractorTenant.tenant.id}`, {
        headers: { 'x-api-key': API_KEY }
      });
      assert('[17] Contractor detalle: is_expired = false (no ha vencido)',
        r.status === 200 && r.body.is_expired === false && !!r.body.access_expires_at);
    } catch (e) { assert('[17] Contractor detalle', false, e.message); }
  } else { assert('[17] Contractor detalle', false, 'No se creo'); }

  // ═══ FLOTA ORDENADA ═══
  console.log('\n  --- Orden y Colorimetria ---');

  // 18. GET /admin/fleet retorna ordenado por prioridad de nivel
  try {
    const r = await request(`${BASE}/admin/fleet`, {
      headers: { 'x-api-key': API_KEY }
    });
    const levels = r.body.map(t => t.access_level);
    // managed debe venir antes que hosted, hosted antes que reseller, etc.
    const managedIdx = levels.indexOf('managed');
    const hostedIdx = levels.indexOf('hosted');
    const resellerIdx = levels.indexOf('reseller');
    const contractorIdx = levels.indexOf('contractor');
    const ordered = managedIdx < hostedIdx && hostedIdx < resellerIdx && resellerIdx < contractorIdx;
    assert('[18] Flota ordenada por prioridad de nivel', ordered);
    assert('[19] Cada tenant tiene color asignado', r.body.every(t => !!t.color));
  } catch (e) {
    assert('[18] Orden flota', false, e.message);
    assert('[19] Colores', false, e.message);
  }

  // ═══ SEGURIDAD ═══
  console.log('\n  --- Seguridad ---');

  // 20. Fleet sin auth → 401
  try {
    const r = await request(`${BASE}/admin/fleet`);
    assert('[20] /admin/fleet sin auth retorna 401', r.status === 401);
  } catch (e) { assert('[20] Sin auth', false, e.message); }

  // 21. Cliente managed no ve flota del admin
  if (managedTenant) {
    try {
      const r = await request(`${BASE}/admin/fleet`, {
        headers: { 'x-api-key': managedTenant.tenant.api_key }
      });
      assert('[21] Cliente managed no ve flota del admin', r.body.length === 0);
    } catch (e) { assert('[21] Aislamiento', false, e.message); }
  } else { assert('[21] Aislamiento', false, 'No se creo'); }

  // ═══ CLEANUP ═══
  console.log('\n  --- Cleanup ---');

  const toDelete = [managedTenant, hostedTenant, resellerTenant, contractorTenant];
  let cleanupOk = true;
  for (const t of toDelete) {
    if (t?.tenant?.id) {
      try {
        await request(`${BASE}/admin/fleet/${t.tenant.id}`, {
          method: 'DELETE', headers: { 'x-api-key': API_KEY }
        });
      } catch { cleanupOk = false; }
    }
  }
  assert('[22] Cleanup: todos los tenants eliminados', cleanupOk);

  // Verificar limpieza
  try {
    const r = await request(`${BASE}/admin/fleet`, { headers: { 'x-api-key': API_KEY } });
    const ids = [managedTenant, hostedTenant, resellerTenant, contractorTenant].map(t => t?.tenant?.id).filter(Boolean);
    const none = !r.body.some(t => ids.includes(t.id));
    assert('[23] Verificar: ningun tenant de test persiste', none);
  } catch (e) { assert('[23] Verificar limpieza', false, e.message); }

  // Resumen
  console.log('\n  ────────────────────────────────');
  console.log(`  Resultados: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('  ────────────────────────────────\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
