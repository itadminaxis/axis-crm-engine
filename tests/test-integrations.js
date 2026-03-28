/**
 * Tests: Integraciones Externas (Google Ads + LinkedIn)
 * =======================================================
 * Prioridad: 🟠 Media
 * Verifica que los webhooks reciben, validan y procesan leads correctamente.
 */

// fetch nativo de Node 18+

const BASE = 'http://localhost:3000';
const CASAYA_TOKEN = '531f7f7d8d3ed2925acbd97079f7c416';
const GOOGLE_SECRET = 'axis_google_ads_secret_change_this';

let passed = 0;
let failed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
};

const assert = (condition, msg) => { if (!condition) throw new Error(msg); };

// --- Google Ads ---
console.log('\n🔵 Google Ads Lead Form Webhook');

const googleAdsPayload = {
  google_key: 'test-google-key-123',
  lead_id: 'gads-lead-' + Date.now(),
  campaign_id: '12345678',
  campaign_name: 'Casaya - Leads Inmobiliarios',
  adgroup_id: '98765432',
  creative_id: '11111111',
  user_column_data: [
    { column_name: 'FULL_NAME', string_value: 'María Google Test' },
    { column_name: 'PHONE_NUMBER', string_value: '+52' + Math.floor(1000000000 + Math.random() * 9000000000) },
    { column_name: 'EMAIL', string_value: 'maria.google@test.com' },
    { column_name: 'CITY', string_value: 'Monterrey' }
  ]
};

await test('Google Ads: rechaza sin secret', async () => {
  const r = await fetch(`${BASE}/api/integrations/google-ads?token=${CASAYA_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googleAdsPayload)
  });
  assert(r.status === 403, `Expected 403, got ${r.status}`);
});

await test('Google Ads: rechaza con secret incorrecto', async () => {
  const r = await fetch(`${BASE}/api/integrations/google-ads?token=${CASAYA_TOKEN}&secret=wrong`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googleAdsPayload)
  });
  assert(r.status === 403, `Expected 403, got ${r.status}`);
});

await test('Google Ads: rechaza sin project token', async () => {
  const r = await fetch(`${BASE}/api/integrations/google-ads?secret=${GOOGLE_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googleAdsPayload)
  });
  assert(r.status === 401, `Expected 401, got ${r.status}`);
});

await test('Google Ads: rechaza con token de proyecto inválido', async () => {
  const r = await fetch(`${BASE}/api/integrations/google-ads?token=invalidtoken&secret=${GOOGLE_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googleAdsPayload)
  });
  assert(r.status === 401, `Expected 401, got ${r.status}`);
});

await test('Google Ads: procesa lead válido correctamente', async () => {
  const r = await fetch(`${BASE}/api/integrations/google-ads?token=${CASAYA_TOKEN}&secret=${GOOGLE_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googleAdsPayload)
  });
  assert(r.status === 200, `Expected 200, got ${r.status}`);
  const body = await r.json();
  assert(body.lead_id, 'No lead_id en respuesta');
});

await test('Google Ads: lead tiene source GOOGLE_ADS en custom_data', async () => {
  const uniquePhone = '+52' + Math.floor(1000000000 + Math.random() * 9000000000);
  const payload = {
    ...googleAdsPayload,
    user_column_data: [
      ...googleAdsPayload.user_column_data.filter(c => c.column_name !== 'PHONE_NUMBER'),
      { column_name: 'PHONE_NUMBER', string_value: uniquePhone }
    ]
  };
  const r = await fetch(`${BASE}/api/integrations/google-ads?token=${CASAYA_TOKEN}&secret=${GOOGLE_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert(r.status === 200, `Expected 200, got ${r.status}`);
});

await test('Google Ads: rechaza si no hay teléfono en user_column_data', async () => {
  const payloadSinPhone = {
    ...googleAdsPayload,
    user_column_data: [
      { column_name: 'FULL_NAME', string_value: 'Sin Teléfono' },
      { column_name: 'EMAIL', string_value: 'sintelefono@test.com' }
    ]
  };
  const r = await fetch(`${BASE}/api/integrations/google-ads?token=${CASAYA_TOKEN}&secret=${GOOGLE_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadSinPhone)
  });
  assert(r.status === 400, `Expected 400, got ${r.status}`);
});

// --- LinkedIn ---
console.log('\n🔵 LinkedIn Lead Gen Forms Webhook');

const linkedInPayload = {
  firstName: 'Carlos',
  lastName: 'LinkedIn Test',
  emailAddress: 'carlos.linkedin@empresa.com',
  phoneNumber: '+52' + Math.floor(1000000000 + Math.random() * 9000000000),
  company: 'Empresa Prueba SA',
  jobTitle: 'Director Comercial',
  leadId: 'urn:li:lead:' + Date.now(),
  formId: 'urn:li:leadGenForm:12345',
  campaignId: 'urn:li:sponsoredCampaign:67890',
  submittedAt: Date.now()
};

await test('LinkedIn: rechaza sin project token', async () => {
  const r = await fetch(`${BASE}/api/integrations/linkedin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(linkedInPayload)
  });
  assert(r.status === 401, `Expected 401, got ${r.status}`);
});

await test('LinkedIn: rechaza con token de proyecto inválido', async () => {
  const r = await fetch(`${BASE}/api/integrations/linkedin?token=notavalidtoken123`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(linkedInPayload)
  });
  assert(r.status === 401, `Expected 401, got ${r.status}`);
});

await test('LinkedIn: procesa lead válido (sin secret configurado = modo permisivo)', async () => {
  const payload = {
    ...linkedInPayload,
    phoneNumber: '+52' + Math.floor(1000000000 + Math.random() * 9000000000)
  };
  const r = await fetch(`${BASE}/api/integrations/linkedin?token=${CASAYA_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert(r.status === 200, `Expected 200, got ${r.status}`);
  const body = await r.json();
  assert(body.lead_id, 'No lead_id en respuesta');
});

await test('LinkedIn: acepta lead con solo email (sin teléfono)', async () => {
  const payloadSoloEmail = {
    firstName: 'Solo',
    lastName: 'Email',
    emailAddress: 'solo.email.' + Date.now() + '@linkedin.com',
    leadId: 'urn:li:lead:email-' + Date.now(),
    formId: 'urn:li:leadGenForm:12345',
    campaignId: 'urn:li:sponsoredCampaign:67890',
    submittedAt: Date.now()
  };
  const r = await fetch(`${BASE}/api/integrations/linkedin?token=${CASAYA_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadSoloEmail)
  });
  assert(r.status === 200, `Expected 200, got ${r.status}`);
});

await test('LinkedIn: rechaza si no hay ni teléfono ni email', async () => {
  const payloadVacio = {
    firstName: 'Sin',
    lastName: 'Contacto',
    leadId: 'urn:li:lead:vacio',
    formId: 'urn:li:leadGenForm:12345',
    campaignId: 'urn:li:sponsoredCampaign:67890'
  };
  const r = await fetch(`${BASE}/api/integrations/linkedin?token=${CASAYA_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadVacio)
  });
  assert(r.status === 400, `Expected 400, got ${r.status}`);
});

// --- Resumen ---
console.log(`\n📊 Integraciones: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
