/**
 * ADMIN-METRICS.ROUTE.JS — Super-admin cross-tenant metrics
 * Phase 7 - Real Observability
 *
 * Mount in server.js as:
 *   app.use('/api/admin/metrics', adminMetricsRoutes);
 *
 * All routes here require the API_SECRET header (x-api-key).
 * Uses queryRaw to bypass per-tenant RLS policies.
 */

import express from 'express';
import db from '../db/index.js';
import { quickAddJob } from 'graphile-worker';
import dotenv from 'dotenv';

dotenv.config();

const { queryRaw } = db;
const router = express.Router();

/**
 * Super-admin auth guard — x-api-key must equal API_SECRET env var.
 */
const requireSuperAdmin = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Acceso denegado. Se requiere API_SECRET.' });
  }
  next();
};

// Apply auth to every route in this router
router.use(requireSuperAdmin);

// ---------------------------------------------------------------------------
// GET /api/admin/metrics/all-tenants
// Aggregated metrics for every tenant — super-admin only
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/metrics/all-tenants:
 *   get:
 *     summary: Métricas agregadas para todos los tenants (super-admin)
 *     description: Devuelve un resumen por tenant con leads del mes, hot leads y fuente principal. Requiere API_SECRET.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Array de resúmenes por tenant.
 *       401:
 *         description: Acceso denegado.
 */
router.get('/all-tenants', async (req, res) => {
  try {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const weekAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

    // Leads this month + hot leads this week per tenant
    const summaryRes = await queryRaw(
      `SELECT
         t.id                                                              AS tenant_id,
         t.name                                                            AS tenant_name,
         COUNT(l.id) FILTER (WHERE l.created_at >= $1)                    AS leads_month,
         COUNT(l.id) FILTER (
           WHERE l.ai_status = 'HOT' AND l.created_at >= $2
         )                                                                 AS hot_leads
       FROM tenants t
       LEFT JOIN leads l ON l.tenant_id = t.id
       GROUP BY t.id, t.name
       ORDER BY leads_month DESC`,
      [monthAgo, weekAgo]
    );

    // Top source per tenant (last 30 days) — one query, pick max per group in JS
    const topSourceRes = await queryRaw(
      `SELECT
         tenant_id,
         source,
         COUNT(*) AS cnt
       FROM leads
       WHERE created_at >= $1
       GROUP BY tenant_id, source`,
      [monthAgo]
    );

    // Build a map: tenantId -> top source
    const sourceMap = {};
    for (const row of topSourceRes.rows) {
      const tid = row.tenant_id;
      const cnt = parseInt(row.cnt, 10);
      if (!sourceMap[tid] || cnt > sourceMap[tid].cnt) {
        sourceMap[tid] = { source: row.source, cnt };
      }
    }

    const tenants = summaryRes.rows.map(row => ({
      tenant_id:    row.tenant_id,
      name:         row.tenant_name,
      leads_month:  parseInt(row.leads_month, 10),
      hot_leads:    parseInt(row.hot_leads, 10),
      top_source:   sourceMap[row.tenant_id]?.source ?? null,
    }));

    res.json({
      timestamp: new Date().toISOString(),
      period: 'leads_month=last_30_days, hot_leads=last_7_days',
      total_tenants: tenants.length,
      tenants,
    });
  } catch (error) {
    console.error('Error en GET /api/admin/metrics/all-tenants:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/metrics/digest/trigger
// Dispara el digest mensual manualmente (para testing o envío urgente).
// Body opcional: { "month": "2026-02" } para un mes específico.
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/metrics/digest/trigger:
 *   post:
 *     summary: Disparar digest mensual manualmente (super-admin)
 *     description: Encola la tarea monthly-digest para ejecución inmediata. Útil para testing y reenvíos.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               month:
 *                 type: string
 *                 description: 'Mes a reportar en formato YYYY-MM (ej: 2026-02). Si se omite, usa el mes anterior.'
 *     responses:
 *       200:
 *         description: Tarea encolada correctamente.
 *       401:
 *         description: Acceso denegado.
 */
router.post('/digest/trigger', async (req, res) => {
  try {
    const workerConfig = { connectionString: process.env.DATABASE_URL };
    let override = null;

    // Si se especifica un mes (YYYY-MM), calcular el rango exacto
    if (req.body?.month) {
      const [year, month] = req.body.month.split('-').map(Number);
      if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Formato de mes inválido. Usa YYYY-MM (ej: 2026-02)' });
      }
      const from     = new Date(year, month - 1, 1).toISOString();
      const to       = new Date(year, month, 0, 23, 59, 59, 999).toISOString();
      const monthName = new Date(year, month - 1, 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' });
      override = { targetYear: year, targetMonth: month - 1, from, to, monthName };
    }

    await quickAddJob(workerConfig, 'monthly-digest', { override });

    res.json({
      message: 'Digest encolado ✅',
      period: override ? override.monthName : 'mes anterior (automático)',
      note: 'El worker enviará los emails en segundos si RESEND_API_KEY está configurado.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
