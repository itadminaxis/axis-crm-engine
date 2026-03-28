import express from 'express';
import { getEcosystemFlow } from '../services/flow.service.js';
import db from '../db/index.js';

const router = express.Router();

/**
 * @openapi
 * /flow:
 *   get:
 *     summary: Recupera el mapa dinámico del ecosistema (DAG) 🧬
 *     description: Devuelve nodos y conexiones basados en los proyectos reales del tenant.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Grafo del ecosistema en formato JSON para visualización.
 */
router.get('/', async (req, res) => {
  try {
    // 1. Obtener proyectos del tenant actual (RLS se encarga del filtrado)
    const projectsRes = await db.query('SELECT id, name FROM projects');
    const projects = projectsRes.rows;

    // 2. Generar el flujo dinámico
    const flow = getEcosystemFlow(projects);

    res.json(flow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
