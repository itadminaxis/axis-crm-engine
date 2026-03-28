import pg from 'pg';
import dotenv from 'dotenv';
import { AsyncLocalStorage } from 'node:async_hooks';

dotenv.config();

const { Pool } = pg;

// Importar el storage para obtener el tenantId del contexto actual
// Nota: Se importa aquí para evitar dependencia circular si se importa desde el middleware
// pero dado que AsyncLocalStorage se puede instanciar en un archivo aparte o usarse el de middleware.
import { tenantStorage } from '../middleware/tenant.middleware.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Wrapper para ejecutar consultas SQL.
 * Si existe un tenantId en el contexto actual (AsyncLocalStorage), 
 * lo inyecta en la sesión de Postgres para activar RLS automáticamente.
 */
export const query = async (text, params) => {
  const client = await pool.connect();
  try {
    const store = tenantStorage.getStore();
    const tenantId = store?.tenantId;

    if (tenantId) {
      // Validar que tenantId es un UUID válido antes de inyectarlo
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tenantId)) {
        throw new Error('tenantId inválido');
      }
      // SET LOCAL asegura que la variable solo viva durante la transacción actual
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    }
    
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
};

/**
 * Query sin inyeccion de RLS.
 * SOLO para operaciones cross-tenant controladas (fleet admin).
 * Siempre validar ownership antes de usar esto.
 */
export const queryRaw = async (text, params) => {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
};

export default {
  query,
  queryRaw,
  pool,
};
