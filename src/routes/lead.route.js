import { Router } from 'express';
import { upsertLead, getLeads, getLeadById, addMilestone, getClientJourney } from '../services/lead.service.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';
import db from '../db/index.js';
const { pool } = db;

const router = Router();

/**
 * @openapi
 * /leads:
 *   get:
 *     summary: Obtener lista de Leads
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200: { description: Lista de leads recuperada }
 */
router.get('/', async (req, res) => {
  const { limit, offset, search } = req.query;
  try {
    const leads = await getLeads({ limit, offset, search });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /leads/{id}/journey:
 *   get:
 *     summary: Obtener el Viaje del Cliente (CX) 🧭
 *     description: Retorna la línea de tiempo de hitos, acuerdos y citas del lead.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Viaje del cliente recuperado }
 */
router.get('/:id/journey', async (req, res) => {
  const { id } = req.params;
  try {
    const journey = await getClientJourney(id);
    if (!journey) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json(journey);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /leads/{id}/milestone:
 *   post:
 *     summary: Registrar un Hito en el Viaje (Cita, Acuerdo, Venta)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type: { type: string, enum: [CITA, ACUERDO, COTIZACION, VENTA] }
 *               details: { type: object }
 *     responses:
 *       201: { description: Hito registrado }
 */
router.post('/:id/milestone', async (req, res) => {
  const { id } = req.params;
  const { type, details } = req.body;
  try {
    const milestone = await addMilestone(id, type, details);
    res.status(201).json(milestone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const lead = await getLeadById(id);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /leads/manual:
 *   post:
 *     summary: Ingestión de Lead desde X-Wing (Manual) 🚀
 *     description: Punto de entrada para formularios web, landings y sensores externos.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, description: 'Número único del lead' }
 *               project_id: { type: string, format: uuid, description: 'ID del proyecto modular' }
 *               source: { type: string, description: 'Origen (Web, TikTok, etc)' }
 *               custom_data: { type: object, description: 'Datos elásticos JSONB' }
 *     responses:
 *       201:
 *         description: Lead registrado y procesado por el motor.
 *       400:
 *         description: Error en los datos enviados.
 */
router.post('/manual', async (req, res) => {
  const leadData = req.body;
  try {
    const lead = await upsertLead(leadData);
    res.status(201).json({ message: 'Lead registrado ✅', lead });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── EXPORTAR CSV ──────────────────────────────────────────────────────────────
// GET /leads/export?from=2026-03-01&to=2026-03-31
// requiere x-api-key de tenant (el middleware ya resolvio el tenantId)
router.get('/export', async (req, res) => {
  const store = tenantStorage.getStore();
  const tenantId = store?.tenantId;
  if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

  const { from, to } = req.query;

  let whereClauses = ['l.tenant_id = $1'];
  const params = [tenantId];

  if (from) {
    params.push(from);
    whereClauses.push(`l.created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    whereClauses.push(`l.created_at <= $${params.length}`);
  }

  try {
    const sql = `
      SELECT
        l.id,
        l.phone,
        l.custom_data->>'source'                       AS source,
        l.custom_data->>'status'                       AS status,
        l.custom_data->'custom_data'->>'nombre'        AS nombre,
        COALESCE(
          l.custom_data->'custom_data'->>'email',
          l.custom_data->>'email'
        )                                              AS email,
        p.name                                         AS proyecto,
        to_char(l.created_at AT TIME ZONE 'America/Monterrey', 'YYYY-MM-DD HH24:MI') AS fecha
      FROM leads l
      LEFT JOIN projects p ON p.id = l.project_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY l.created_at DESC
    `;

    const result = await pool.query(sql, params);
    const rows   = result.rows;

    const headers = ['id', 'telefono', 'nombre', 'email', 'fuente', 'estado', 'proyecto', 'fecha'];
    const escape  = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const csv = [
      headers.join(','),
      ...rows.map(r => [
        r.id, r.phone, r.nombre, r.email, r.source, r.status, r.proyecto, r.fecha
      ].map(escape).join(','))
    ].join('\n');

    const filename = `leads_${from || 'all'}_${to || 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM para que Excel lo abra bien
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
