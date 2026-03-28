import { Router } from 'express';
import { addClient, getStats } from '../services/sse.service.js';
import { setCallbackUrls, getCallbackUrls } from '../services/callback.service.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';
import pool from '../db/index.js';

const router = Router();

/**
 * @openapi
 * /stream/live:
 *   get:
 *     summary: Canal SSE en tiempo real (eventos del tenant)
 *     description: Abre una conexion SSE. Acepta x-api-key por header o query param.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Stream de eventos en formato SSE
 */
router.get('/live', async (req, res) => {
  // SSE: EventSource no soporta headers custom, aceptar api-key por query param tambien
  let tenantId = tenantStorage.getStore()?.tenantId;

  if (!tenantId && req.query['x-api-key']) {
    try {
      const result = await pool.query('SELECT id FROM tenants WHERE api_key = $1', [req.query['x-api-key']]);
      if (result.rows.length > 0) tenantId = result.rows[0].id;
    } catch {}
  }

  if (!tenantId) return res.status(401).json({ error: 'Sin contexto de tenant' });

  // Configurar headers SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Para nginx/Railway
  });

  // Enviar comentario de keepalive inicial
  res.write(`:connected to tenant ${tenantId}\n\n`);

  // Registrar cliente
  addClient(tenantId, res);

  // Keepalive cada 30 segundos
  const keepalive = setInterval(() => {
    try { res.write(':keepalive\n\n'); } catch { clearInterval(keepalive); }
  }, 30000);

  req.on('close', () => clearInterval(keepalive));
});

/**
 * @openapi
 * /stream/stats:
 *   get:
 *     summary: Estadisticas de conexiones SSE activas
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Conexiones activas por tenant
 */
router.get('/stats', (req, res) => {
  res.json(getStats());
});

/**
 * @openapi
 * /stream/callbacks/{projectId}:
 *   get:
 *     summary: Obtener callback URLs de un proyecto
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Lista de callback URLs }
 */
router.get('/callbacks/:projectId', async (req, res) => {
  try {
    const urls = await getCallbackUrls(req.params.projectId);
    res.json({ callback_urls: urls });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /stream/callbacks/{projectId}:
 *   put:
 *     summary: Configurar callback URLs de un proyecto (Mothership to X-Wing)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [callback_urls]
 *             properties:
 *               callback_urls:
 *                 type: array
 *                 items: { type: string, format: uri }
 *     responses:
 *       200: { description: Callbacks actualizados }
 */
router.put('/callbacks/:projectId', async (req, res) => {
  try {
    const { callback_urls } = req.body;
    const result = await setCallbackUrls(req.params.projectId, callback_urls);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
