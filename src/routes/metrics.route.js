import express from 'express';
import { tenantStorage } from '../middleware/tenant.middleware.js';
import {
  getQualityMetrics,
  getDashboardMetrics,
  getAttributionMetrics,
  getAlerts,
} from '../services/metrics.service.js';

const router = express.Router();

/**
 * Resolve tenantId from context (AsyncLocalStorage) or fallback to ?tenant_id= query param.
 * Returns null if neither is available.
 */
const resolveTenantId = (req) => {
  const store = tenantStorage.getStore();
  if (store?.tenantId) return store.tenantId;
  if (req.query.tenant_id) return req.query.tenant_id;
  return null;
};

/**
 * Auth guard for protected metric endpoints.
 * Passes if:
 *   - x-api-key header matches API_SECRET (super-admin / health-check token), OR
 *   - a valid tenantId is already set in AsyncLocalStorage (tenant middleware ran upstream)
 */
const requireAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.API_SECRET) {
    return next();
  }
  const store = tenantStorage.getStore();
  if (store?.tenantId) {
    return next();
  }
  return res.status(401).json({ error: 'No autorizado. Se requiere x-api-key válida.' });
};

// ---------------------------------------------------------------------------
// GET /metrics
// System-wide ISO/IEC 25020 quality metrics — no auth required (Railway health checks)
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /metrics:
 *   get:
 *     summary: Métricas de calidad ISO/IEC 25020 del sistema
 *     description: Devuelve indicadores de fiabilidad, capacidad y densidad a nivel sistema. Sin autenticación requerida.
 *     responses:
 *       200:
 *         description: Métricas de calidad en formato JSON.
 */
router.get('/', async (req, res) => {
  try {
    const metrics = await getQualityMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error en GET /metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /metrics/dashboard
// Per-tenant dashboard — requires auth
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /metrics/dashboard:
 *   get:
 *     summary: Dashboard de métricas por tenant
 *     description: Leads hoy/semana/mes, desglose por fuente, proyecto y estado AI, hot leads y tasa de conversión.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: UUID del tenant (solo cuando se usa API_SECRET como x-api-key)
 *     responses:
 *       200:
 *         description: Métricas del dashboard del tenant.
 *       401:
 *         description: No autorizado.
 *       400:
 *         description: tenant_id no identificado.
 */
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'No se pudo identificar el tenant. Proporciona ?tenant_id= o usa tu x-api-key de tenant.' });
    }
    const metrics = await getDashboardMetrics(tenantId);
    res.json(metrics);
  } catch (error) {
    console.error('Error en GET /metrics/dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /metrics/attribution
// Source attribution analysis — requires auth
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /metrics/attribution:
 *   get:
 *     summary: Métricas de atribución por fuente
 *     description: Para cada fuente: conteo, porcentaje, score promedio, tendencia semana vs semana anterior. Mejor día y hora del día.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: UUID del tenant (solo cuando se usa API_SECRET como x-api-key)
 *     responses:
 *       200:
 *         description: Métricas de atribución del tenant.
 *       401:
 *         description: No autorizado.
 *       400:
 *         description: tenant_id no identificado.
 */
router.get('/attribution', requireAuth, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'No se pudo identificar el tenant. Proporciona ?tenant_id= o usa tu x-api-key de tenant.' });
    }
    const metrics = await getAttributionMetrics(tenantId);
    res.json(metrics);
  } catch (error) {
    console.error('Error en GET /metrics/attribution:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /metrics/alerts
// Tenant alert system — requires auth
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /metrics/alerts:
 *   get:
 *     summary: Alertas operativas del tenant
 *     description: Detecta caída de leads, días sin actividad y errores de webhook. Severidad warning/critical.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: UUID del tenant (solo cuando se usa API_SECRET como x-api-key)
 *     responses:
 *       200:
 *         description: Array de alertas activas.
 *       401:
 *         description: No autorizado.
 *       400:
 *         description: tenant_id no identificado.
 */
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'No se pudo identificar el tenant. Proporciona ?tenant_id= o usa tu x-api-key de tenant.' });
    }
    const result = await getAlerts(tenantId);
    res.json(result);
  } catch (error) {
    console.error('Error en GET /metrics/alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
