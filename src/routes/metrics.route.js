import express from 'express';
import { getQualityMetrics } from '../services/metrics.service.js';

const router = express.Router();

/**
 * @openapi
 * /metrics:
 *   get:
 *     summary: Recupera indicadores de calidad ISO/IEC 25020 📊
 *     description: Devuelve métricas de eficiencia, fiabilidad y capacidad del ecosistema.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Métricas de calidad en formato JSON.
 */
router.get('/', async (req, res) => {
  try {
    const metrics = await getQualityMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
