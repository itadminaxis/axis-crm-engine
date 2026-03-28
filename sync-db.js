/**
 * SYNC-DB.JS - AXIS CRM ENGINE ⚡
 * Carga el esquema industrial en la base de datos de Railway.
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function sync() {
  console.log('🛰️ Conectando con el Búnker en Railway para sincronizar esquema...');
  
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const schemaPath = path.join(__dirname, 'src/db/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('🔨 Ejecutando cimentación (schema.sql)...');
    await pool.query(sql);
    console.log('✅ Búnker sincronizado con éxito.');
    
  } catch (err) {
    console.error('❌ Error de sincronización:', err.message);
  } finally {
    await pool.end();
    process.exit();
  }
}

sync();
