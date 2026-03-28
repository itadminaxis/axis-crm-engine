import { Router } from 'express';
import {
  onboardClient, getFleet, getFleetTenant,
  getFleetLeads, getFleetEvents,
  updateFleetAccess, updateBranding, removeFromFleet,
  getAccessLevelMap
} from '../services/fleet.service.js';

const router = Router();

/**
 * @openapi
 * /admin/fleet/levels:
 *   get:
 *     summary: Mapa de niveles de acceso con colores y descripciones
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200: { description: Array de niveles con color, descripcion y permisos }
 */
router.get('/levels', (req, res) => {
  res.json(getAccessLevelMap());
});

/**
 * @openapi
 * /admin/fleet:
 *   get:
 *     summary: Listar toda tu Flota Externa
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200: { description: Lista de tenants con color y nivel }
 */
router.get('/', async (req, res) => {
  try {
    const fleet = await getFleet();
    res.json(fleet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /admin/fleet:
 *   post:
 *     summary: Onboarding rapido - Crear tenant + proyecto + token
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               access_level: { type: string, enum: [managed, hosted, reseller, contractor] }
 *               expires_in_days: { type: integer, description: Solo para contractor }
 *               branding: { type: object, description: Solo para reseller (white-label) }
 *     responses:
 *       201: { description: Cliente onboarded }
 */
router.post('/', async (req, res) => {
  try {
    const result = await onboardClient(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /admin/fleet/{tenantId}:
 *   get:
 *     summary: Detalle de un tenant de tu flota
 *     security:
 *       - ApiKeyAuth: []
 */
router.get('/:tenantId', async (req, res) => {
  try {
    const tenant = await getFleetTenant(req.params.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado en tu flota' });
    res.json(tenant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /admin/fleet/{tenantId}/leads:
 *   get:
 *     summary: Leads del cliente (acceso segun nivel)
 *     description: |
 *       managed/contractor: datos completos
 *       hosted: phone enmascarado, sin custom_data
 *       reseller: solo conteos
 *     security:
 *       - ApiKeyAuth: []
 */
router.get('/:tenantId/leads', async (req, res) => {
  try {
    const result = await getFleetLeads(req.params.tenantId, req.query);
    res.json(result);
  } catch (error) {
    const status = error.message.includes('expirado') ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * @openapi
 * /admin/fleet/{tenantId}/events:
 *   get:
 *     summary: Eventos del cliente (acceso segun nivel)
 *     description: |
 *       managed/contractor: eventos completos con payload
 *       hosted/reseller: solo resumen por tipo
 *     security:
 *       - ApiKeyAuth: []
 */
router.get('/:tenantId/events', async (req, res) => {
  try {
    const result = await getFleetEvents(req.params.tenantId, req.query);
    res.json(result);
  } catch (error) {
    const status = error.message.includes('expirado') ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * @openapi
 * /admin/fleet/{tenantId}/access:
 *   put:
 *     summary: Cambiar nivel de acceso
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             properties:
 *               access_level: { type: string, enum: [managed, hosted, reseller, contractor] }
 *               expires_in_days: { type: integer, description: Solo para contractor }
 */
router.put('/:tenantId/access', async (req, res) => {
  try {
    const result = await updateFleetAccess(req.params.tenantId, req.body.access_level, req.body.expires_in_days);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /admin/fleet/{tenantId}/branding:
 *   put:
 *     summary: Configurar branding white-label (solo reseller)
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             properties:
 *               brand_name: { type: string }
 *               logo_url: { type: string }
 *               primary_color: { type: string }
 */
router.put('/:tenantId/branding', async (req, res) => {
  try {
    const result = await updateBranding(req.params.tenantId, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /admin/fleet/{tenantId}:
 *   delete:
 *     summary: Eliminar un tenant de tu flota (CASCADE)
 *     security:
 *       - ApiKeyAuth: []
 */
router.delete('/:tenantId', async (req, res) => {
  try {
    const result = await removeFromFleet(req.params.tenantId);
    res.json({ message: 'Tenant eliminado de la flota', ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
