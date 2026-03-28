import { Router } from 'express';
import { upsertLead } from '../services/lead.service.js';
import { publicSubmitMiddleware } from '../middleware/publicSubmit.middleware.js';

const router = Router();

/**
 * @openapi
 * /api/submit:
 *   post:
 *     summary: Endpoint público para X-Wings (sin API key)
 *     description: |
 *       Los frontends envían leads usando un project token público.
 *       No expone la API key maestra del tenant.
 *     parameters:
 *       - in: header
 *         name: x-project-token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token público del proyecto (32 hex chars)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string }
 *               source: { type: string }
 *               nombre: { type: string }
 *               metadata: { type: object }
 *     responses:
 *       201:
 *         description: Lead registrado
 *       401:
 *         description: Falta x-project-token
 *       403:
 *         description: Token inválido
 *       429:
 *         description: Rate limit excedido
 */
router.post('/', publicSubmitMiddleware, async (req, res) => {
  try {
    const lead = await upsertLead(req.body);
    res.status(201).json({ message: 'Lead registrado', lead });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
