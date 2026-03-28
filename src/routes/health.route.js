import { Router } from 'express';
import pool from '../db/index.js';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Monitoreo de Salud del Búnker 📡
 *     description: Verifica la conexión a la DB y el estado general.
 *     responses:
 *       200: { description: Búnker operativo }
 *       503: { description: Búnker con fallos técnicos }
 */
router.get('/', async (req, res) => {
  try {
    // 1. Verificar conexión a PostgreSQL
    await pool.pool.query('SELECT 1');

    res.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      services: {
        database: 'CONNECTED',
        worker: 'ACTIVE' // El worker corre en paralelo
      }
    });
  } catch (error) {
    console.error('[HEALTH CHECK FAIL]:', error.message);
    res.status(503).json({
      status: 'DOWN',
      error: error.message
    });
  }
});

export default router;
