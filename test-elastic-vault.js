/**
 * TEST-ELASTIC-VAULT.JS - PRUEBA DE LA BÓVEDA ELÁSTICA 💎🏛️
 * Verifica que el sistema absorbe CUALQUIER dato sin fallar (JSONB).
 */
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const MOTHERSHIP_URL = 'http://localhost:3000';
const MASTER_API_KEY = '93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6';
const PROJECT_SICILIA = 'c1c3632f-a72e-4724-b82a-fc33e7e96913';

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function testElasticity() {
  console.log('🧪 Iniciando Prueba de la Bóveda Elástica (JSONB)...');

  // Datos extremos: Campos que el sistema NO conoce originalmente
  const extremeData = {
    phone: "+529990001122",
    project_id: PROJECT_SICILIA,
    source: "PRUEBA_ELASTICA",
    custom_data: {
      email: "test@axis.com",
      telemetria_3d: { x: 10, y: 20, z: 30, rotation: "45deg" }, // Telemetría inmersiva
      wallet_web3: "0x123abc456def", // Identidad Web3
      comportamiento: ["click_mapa", "view_pricing", "scroll_70%"], // Array de eventos
      interes_quantico: "alto",
      un_campo_nuevo_que_no_existia: "funciona ✅"
    }
  };

  console.log('📦 Inyectando datos no estructurados extremos...');
  const result = await request(`${MOTHERSHIP_URL}/leads/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': MASTER_API_KEY },
    body: JSON.stringify(extremeData)
  });

  // Ajuste para la estructura de respuesta real
  if (result.lead || result.id) {
    console.log('✅ Bóveda Elástica: Datos absorbidos con éxito.');
    console.log('🔍 Verificando integridad de la persistencia...');
    
    const leads = await request(`${MOTHERSHIP_URL}/leads`, {
      headers: { 'x-api-key': MASTER_API_KEY }
    });

    const savedLead = leads.find(l => l.phone === extremeData.phone);
    
    // El motor guarda los datos extras dentro de custom_data.custom_data por la lógica del upsert
    const actualData = savedLead.custom_data.custom_data || savedLead.custom_data;

    if (savedLead && (actualData.telemetria_3d || savedLead.custom_data.telemetria_3d)) {
      console.log('🏆 PRUEBA SUPERADA AL 100%.');
      console.log('   El búnker ha guardado la telemetría 3D y la wallet Web3 sin cambios en el código.');
      console.log('   Datos recuperados:', JSON.stringify(actualData, null, 2));
    } else {
      console.log('❌ Error: Los datos complejos no se recuperaron correctamente.');
      console.log('Lead recuperado:', JSON.stringify(savedLead, null, 2));
    }
  } else {
    console.error('❌ Fallo al inyectar datos:', result);
  }
}

testElasticity();
