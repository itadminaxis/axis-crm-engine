/**
 * INIT-PROJECTS.JS - AXIS CRM ENGINE 🏢
 * Registra al Tenant (Andres Abel) y sus dos proyectos iniciales (Casaya, Sicilia Plus).
 */
import db from './src/db/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function init() {
  console.log('🚀 Iniciando registro de Proyectos en el Búnker Axis...');

  try {
    // 1. Crear el Tenant (Si no existe)
    const tenantRes = await db.query(`
      INSERT INTO tenants (name) 
      VALUES ('Andres Abel Fuentes Esquivel') 
      ON CONFLICT DO NOTHING 
      RETURNING id, api_key;
    `);

    let tenantId, apiKey;
    
    if (tenantRes.rows.length > 0) {
      tenantId = tenantRes.rows[0].id;
      apiKey = tenantRes.rows[0].api_key;
      console.log('✅ Tenant registrado/identificado.');
    } else {
      // Si ya existía, lo buscamos
      const t = await db.query("SELECT id, api_key FROM tenants WHERE name = 'Andres Abel Fuentes Esquivel' LIMIT 1");
      tenantId = t.rows[0].id;
      apiKey = t.rows[0].api_key;
      console.log('ℹ️ El Tenant ya existía. Recuperando credenciales.');
    }

    // 2. Crear Proyecto: Casaya Main
    const casayaRes = await db.query(`
      INSERT INTO projects (tenant_id, name, description, enable_ai_prescriptive, enable_blockchain_seal)
      VALUES ($1, 'Casaya Main', 'Nave Institucional de branding y captación B2B', true, true)
      RETURNING id;
    `, [tenantId]);
    const casayaProjectId = casayaRes.rows[0].id;

    // 3. Crear Proyecto: Sicilia Plus
    const siciliaRes = await db.query(`
      INSERT INTO projects (tenant_id, name, description, enable_ai_prescriptive, enable_instant_response)
      VALUES ($1, 'Sicilia Plus', 'Caza de Combate para venta de departamentos en Atotonilco', true, true)
      RETURNING id;
    `, [tenantId]);
    const siciliaProjectId = siciliaRes.rows[0].id;

    console.log('\n--- 🔑 CREDENCIALES GENERADAS ---');
    console.log(`Tenant API Key: ${apiKey}`);
    console.log(`\n🛸 PROYECTO: Casaya Main`);
    console.log(`Project ID: ${casayaProjectId}`);
    console.log(`\n🛸 PROYECTO: Sicilia Plus`);
    console.log(`Project ID: ${siciliaProjectId}`);
    console.log('--------------------------------\n');
    console.log('⚠️ IMPORTANTE: Guarda estas llaves. Las usaremos para los conectores de las X-Wings.');

  } catch (err) {
    console.error('❌ Error al inicializar proyectos:', err.message);
  } finally {
    process.exit();
  }
}

init();
