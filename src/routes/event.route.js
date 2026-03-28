import { Router } from 'express';
import { getEvents, getEntityTimeline } from '../services/event.service.js';

const router = Router();

/**
 * @openapi
 * /events:
 *   get:
 *     summary: Consultar Event Log
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: entity_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: entity_type
 *         schema: { type: string }
 *       - in: query
 *         name: event_type
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: Lista de eventos
 */
router.get('/', async (req, res) => {
  try {
    const events = await getEvents(req.query);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /events/timeline/{entityId}:
 *   get:
 *     summary: Timeline completo de una entidad
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Timeline cronológico de eventos
 */
router.get('/timeline/:entityId', async (req, res) => {
  try {
    const timeline = await getEntityTimeline(req.params.entityId);
    res.json(timeline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
