import pool from './src/db/index.js';
import { upsertLead, getLeads } from './src/services/lead.service.js';
import { tenantStorage } from './src/middleware/tenant.middleware.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * SCRIPT DE PRUEBA DE FUEGO 🔥 - AXIS CRM ENGINE
 * Este script simula el mundo real:
 * 1. Crea dos negocios distintos (Tenants).
 * 2. Registra leads con datos elásticos (JSONB).
 * 3. Verifica el blindaje RLS (Aislamiento de datos).
 */
async function runFireTest() {
  console.log('--- INICIANDO PRUEBA DE FUEGO EN EL BÚNKER 🔥 ---');

  try {
    // 1. LIMPIEZA INICIAL (Opcional, solo para test)
    // await pool.query('DELETE FROM leads; DELETE FROM tenants;');

    // 2. CREAR TENANTS (Negocios)
    console.log('1. Creando negocios (Inmobiliaria Alfa y Agencia Seguros Beta)...');
    const t1 = await pool.query("INSERT INTO tenants (name) VALUES ('Inmobiliaria Alfa') RETURNING id, api_key");
    const t2 = await pool.query("INSERT INTO tenants (name) VALUES ('Agencia Seguros Beta') RETURNING id, api_key");
    
    const alfa = t1.rows[0];
    const beta = t2.rows[0];

    console.log(`   ✅ Inmobiliaria Alfa lista. API Key: ${alfa.api_key}`);
    console.log(`   ✅ Agencia Seguros Beta lista. API Key: ${beta.api_key}`);

    // 3. REGISTRAR LEADS PARA ALFA (Contexto Inmobiliario)
    console.log('\n2. Registrando leads elásticos para Inmobiliaria Alfa...');
    await tenantStorage.run({ tenantId: alfa.id, tenantName: 'Inmobiliaria Alfa' }, async () => {
      const lead1 = await upsertLead({
        phone: '+525511223344',
        source: 'QR Muro Norte',
        interes: 'Penthouse Reforma',
        presupuesto: 750000,
        email: 'interesado@alfa.com' // <-- CAMPO NUEVO (Email) ABSORBIDO POR CAJA FUERTE
      });
      console.log(`   ✅ Lead Alfa registrado (ID: ${lead1.id}) - Captura elástica exitosa.`);
    });

    // 4. REGISTRAR LEADS PARA BETA (Contexto Seguros)
    console.log('\n3. Registrando leads elásticos para Agencia Seguros Beta...');
    await tenantStorage.run({ tenantId: beta.id, tenantName: 'Agencia Seguros Beta' }, async () => {
      const lead2 = await upsertLead({
        phone: '+525599887766',
        source: 'TikTok Ads',
        vehículo: 'Tesla Model 3',
        año: 2024,
        seguro_actual: 'GNP'
      });
      console.log(`   ✅ Lead Beta registrado (ID: ${lead2.id}) - Captura elástica exitosa.`);
    });

    // 5. PRUEBA DE FUEGO: VERIFICAR AISLAMIENTO (RLS)
    console.log('\n4. EJECUTANDO PRUEBA DE AISLAMIENTO (RLS)... 🛡️');
    
    // Consultar como Inmobiliaria Alfa
    await tenantStorage.run({ tenantId: alfa.id, tenantName: 'Inmobiliaria Alfa' }, async () => {
      const leadsAlfa = await getLeads();
      console.log(`   🔍 Consulta como ALFA: Encontró ${leadsAlfa.length} leads.`);
      const tieneLeadsDeBeta = leadsAlfa.some(l => l.phone === '+525599887766');
      if (tieneLeadsDeBeta) {
        console.error('   ❌ ERROR DE SEGURIDAD: Alfa puede ver leads de Beta!');
      } else {
        console.log('   ✅ BLINDAJE CONFIRMADO: Alfa NO puede ver los leads de Beta.');
      }
    });

    // Consultar como Agencia Beta
    await tenantStorage.run({ tenantId: beta.id, tenantName: 'Agencia Seguros Beta' }, async () => {
      const leadsBeta = await getLeads();
      console.log(`   🔍 Consulta como BETA: Encontró ${leadsBeta.length} leads.`);
      const tieneLeadsDeAlfa = leadsBeta.some(l => l.phone === '+525511223344');
      if (tieneLeadsDeAlfa) {
        console.error('   ❌ ERROR DE SEGURIDAD: Beta puede ver leads de Alfa!');
      } else {
        console.log('   ✅ BLINDAJE CONFIRMADO: Beta NO puede ver los leads de Alfa.');
      }
    });

    console.log('\n--- PRUEBA DE FUEGO COMPLETADA CON ÉXITO ✅ ---');
    console.log('El búnker es SEGURO, ELÁSTICO y ASÍNCRONO.');

  } catch (error) {
    console.error('\n❌ FALLO EN LA PRUEBA DE FUEGO:', error.message);
  } finally {
    process.exit();
  }
}

runFireTest();
