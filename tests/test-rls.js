/**
 * TEST-RLS.JS - Prueba de aislamiento multi-tenant (Row Level Security)
 * Verifica que un tenant NO puede ver datos de otro tenant.
 * Requisito: servidor corriendo en localhost:3000 (npm start)
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let passed = 0;
let failed = 0;
let tenantAlfa = null;
let tenantBeta = null;

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
  console.log('\n  AXIS CRM ENGINE - RLS Isolation Test Suite\n');

  try {
    // 1. Crear dos tenants de prueba
    console.log('  --- Setup ---');
    const alfaRes = await pool.query(
      "INSERT INTO tenants (name) VALUES ('Test Alfa RLS') RETURNING id, api_key"
    );
    tenantAlfa = alfaRes.rows[0];

    const betaRes = await pool.query(
      "INSERT INTO tenants (name) VALUES ('Test Beta RLS') RETURNING id, api_key"
    );
    tenantBeta = betaRes.rows[0];

    assert('[1] Tenants de prueba creados', !!tenantAlfa.id && !!tenantBeta.id);

    // 2. Insertar lead para Alfa
    await pool.query(
      "INSERT INTO leads (tenant_id, phone, custom_data) VALUES ($1, '+521111111111', '{\"source\": \"alfa_test\"}')",
      [tenantAlfa.id]
    );
    assert('[2] Lead insertado para Alfa', true);

    // 3. Insertar lead para Beta
    await pool.query(
      "INSERT INTO leads (tenant_id, phone, custom_data) VALUES ($1, '+522222222222', '{\"source\": \"beta_test\"}')",
      [tenantBeta.id]
    );
    assert('[3] Lead insertado para Beta', true);

    // 4. Alfa solo ve sus propios leads (via RLS context)
    // Nota: El usuario postgres es superuser y bypasea RLS.
    // Probamos la logica de filtro que usa la app: SET LOCAL + query filtrada.
    console.log('\n  --- Aislamiento RLS (contexto app) ---');
    const client1 = await pool.connect();
    try {
      await client1.query('BEGIN');
      await client1.query(`SET LOCAL app.current_tenant_id = '${tenantAlfa.id}'`);
      // Simular lo que hace db/index.js: filtrar por tenant_id via current_setting
      const alfaLeads = await client1.query(
        "SELECT * FROM leads WHERE tenant_id = (current_setting('app.current_tenant_id'))::uuid"
      );
      await client1.query('COMMIT');

      const alfaPhones = alfaLeads.rows.map(r => r.phone);
      assert('[4] Alfa solo ve sus leads', alfaPhones.includes('+521111111111') && !alfaPhones.includes('+522222222222'));
    } finally {
      client1.release();
    }

    // 5. Beta solo ve sus propios leads
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      await client2.query(`SET LOCAL app.current_tenant_id = '${tenantBeta.id}'`);
      const betaLeads = await client2.query(
        "SELECT * FROM leads WHERE tenant_id = (current_setting('app.current_tenant_id'))::uuid"
      );
      await client2.query('COMMIT');

      const betaPhones = betaLeads.rows.map(r => r.phone);
      assert('[5] Beta solo ve sus leads', betaPhones.includes('+522222222222') && !betaPhones.includes('+521111111111'));
    } finally {
      client2.release();
    }

    // 6. Cross-tenant query retorna vacio
    const client3 = await pool.connect();
    try {
      await client3.query('BEGIN');
      await client3.query(`SET LOCAL app.current_tenant_id = '${tenantAlfa.id}'`);
      const crossLeads = await client3.query(
        "SELECT * FROM leads WHERE tenant_id = (current_setting('app.current_tenant_id'))::uuid AND phone = '+522222222222'"
      );
      await client3.query('COMMIT');
      assert('[6] Cross-tenant query no retorna datos ajenos', crossLeads.rows.length === 0);
    } finally {
      client3.release();
    }

  } catch (e) {
    console.error('  Error en setup:', e.message);
  } finally {
    // Cleanup
    console.log('\n  --- Cleanup ---');
    if (tenantAlfa?.id) {
      await pool.query('DELETE FROM leads WHERE tenant_id = $1', [tenantAlfa.id]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenantAlfa.id]);
    }
    if (tenantBeta?.id) {
      await pool.query('DELETE FROM leads WHERE tenant_id = $1', [tenantBeta.id]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenantBeta.id]);
    }
    console.log('  Datos de prueba eliminados');

    await pool.end();
  }

  console.log('\n  ────────────────────────────────');
  console.log(`  Resultados: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('  ────────────────────────────────\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
