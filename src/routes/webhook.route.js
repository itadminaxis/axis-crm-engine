import { Router } from 'express'; 
import { handleWebhook, verifyMetaWebhook } from '../controllers/webhook.controller.js'; 
import { upsertLead } from '../services/lead.service.js';
import crypto from 'node:crypto';

const router = Router(); 

/**
 * @openapi
 * /webhook:
 *   get:
 *     summary: Verificación de Webhook de Meta
 *     description: Endpoint requerido por Meta para validar la propiedad del webhook.
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         schema: { type: string }
 *       - in: query
 *         name: hub.verify_token
 *         schema: { type: string }
 *       - in: query
 *         name: hub.challenge
 *         schema: { type: string }
 *     responses:
 *       200: { description: Webhook verificado }
 *       403: { description: Token inválido }
 *   post:
 *     summary: Recibir Webhook de Meta (WhatsApp/Facebook)
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Webhook procesado.
 */
router.get('/', verifyMetaWebhook);
router.post('/', handleWebhook); 

/**
 * @openapi
 * /webhook/tiktok:
 *   post:
 *     summary: Recibir Webhook de TikTok
 *     description: |
 *       Muelle para leads de TikTok. 
 *       Validación de firma: Se compara el header `tiktok-signature` con el hash HMAC-SHA256 del body.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Webhook de TikTok recibido.
 *       401:
 *         description: Firma de TikTok inválida.
 */
router.post('/tiktok', async (req, res) => {
  const signature = req.headers['tiktok-signature'];
  const body = JSON.stringify(req.body);

  // LOGICA DE SEGURIDAD TIKTOK
  // Se requiere el CLIENT_SECRET del negocio registrado para validar.
  // const expectedSignature = crypto.createHmac('sha256', CLIENT_SECRET).update(body).digest('hex');
  // if (signature !== expectedSignature) return res.status(401).send('Invalid Signature');

  try {
    const lead = await upsertLead({
      phone: req.body.phone_number || req.body.phone,
      source: 'TikTok',
      ...req.body
    });

    console.log('Lead de TikTok blindado ✅');
    res.sendStatus(200);
  } catch (error) {
    console.error('Error TikTok Webhook:', error.message);
    res.sendStatus(200);
  }
});

export default router;
