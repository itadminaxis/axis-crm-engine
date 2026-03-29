/**
 * X (Twitter) Ads — Lead Gen Cards Webhook
 * ==========================================
 * Prioridad: 🟡 Baja
 *
 * Cómo funciona:
 * X Ads permite conectar Lead Gen Cards a un webhook.
 * Cuando alguien llena el formulario nativo de X, manda un POST aquí.
 *
 * Setup en X Ads Manager:
 * 1. ads.twitter.com > Tools > Lead Generation
 * 2. Crea o edita una Lead Gen Card
 * 3. En "Webhook" pon: https://attractive-mindfulness-production.up.railway.app/api/integrations/x-ads?token=TU_PROJECT_TOKEN
 * 4. Copia el "Webhook Secret" → TWITTER_ADS_WEBHOOK_SECRET en Railway
 *
 * Payload que manda X:
 * {
 *   "card_uri": "card://...",
 *   "leads": [{
 *     "twitter_screen_name": "usuario",
 *     "email": "juan@email.com",
 *     "full_name": "Juan Pérez",
 *     "phone": "+5210000000",
 *     "custom_field_data": {}
 *   }]
 * }
 *
 * Nota: X no siempre manda teléfono — depende de los campos configurados en la Lead Gen Card.
 */

import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/index.js';
const { pool } = db;
import { upsertLead } from '../services/lead.service.js';
import { logEvent } from '../services/event.service.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';

const router = Router();

// Verifica firma HMAC-SHA256 de X Ads
const verifyXSignature = (req) => {
  const secret = process.env.TWITTER_ADS_WEBHOOK_SECRET;
  if (!secret) return true; // Sin secret, se omite
  const signature = req.headers['x-twitter-webhooks-signature'] ||
                    req.headers['x-signature'];
  if (!signature) return false;

  const payload = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
};

/**
 * GET /api/integrations/x-ads — CRC challenge de X (verificación inicial)
 * X llama a este endpoint para verificar que controlas el servidor
 */
router.get('/', (req, res) => {
  const crcToken = req.query.crc_token;
  const secret = process.env.TWITTER_ADS_WEBHOOK_SECRET || 'no-secret';

  if (!crcToken) {
    return res.status(400).json({ error: 'crc_token requerido' });
  }

  const hash = crypto
    .createHmac('sha256', secret)
    .update(crcToken)
    .digest('base64');

  res.status(200).json({ response_token: `sha256=${hash}` });
});

/**
 * POST /api/integrations/x-ads
 * Recibe leads de X Ads Lead Gen Cards
 */
router.post('/', async (req, res) => {
  try {
    // 1. Verificar firma
    if (!verifyXSignature(req)) {
      return res.status(403).json({ error: 'Firma X Ads inválida' });
    }

    // 2. Validar project token
    const projectToken = req.query.token;
    if (!projectToken || !/^[a-f0-9]{32}$/.test(projectToken)) {
      return res.status(401).json({ error: 'Project token inválido o faltante' });
    }

    // 3. Resolver tenant y proyecto
    const projectResult = await pool.query(
      `SELECT p.id as project_id, p.name as project_name,
              t.id as tenant_id, t.name as tenant_name
       FROM projects p
       JOIN tenants t ON t.id = p.tenant_id
       WHERE p.public_token = $1`,
      [projectToken]
    );

    if (projectResult.rows.length === 0) {
      return res.status(403).json({ error: 'Token de proyecto no encontrado' });
    }

    const { project_id, project_name, tenant_id } = projectResult.rows[0];

    // 4. Parsear payload de X Ads
    const leads = req.body.leads || [];
    const cardUri = req.body.card_uri || req.body.card_id || null;

    if (!leads.length) {
      return res.status(400).json({ error: 'No hay leads en el payload de X Ads' });
    }

    const results = [];

    for (const xLead of leads) {
      const { twitter_screen_name, email, full_name, phone, custom_field_data } = xLead;

      if (!phone && !email) {
        results.push({ twitter: twitter_screen_name, status: 'skipped', reason: 'sin teléfono ni email' });
        continue;
      }

      let lead;
      await tenantStorage.run({ tenantId: tenant_id }, async () => {
        lead = await upsertLead({
          phone: phone || null,
          nombre: full_name || twitter_screen_name || null,
          email: email || null,
          project_id,
          source: 'X_ADS',
          custom_data: {
            fuente: 'X (Twitter) Ads Lead Gen',
            twitter_screen_name,
            card_uri: cardUri,
            custom_fields: custom_field_data || {}
          }
        });

        await logEvent(
          'lead.x_ads',
          'lead',
          lead.id,
          'integration/x-ads',
          { twitter: twitter_screen_name, card_uri: cardUri, project_name },
          tenant_id
        );
      });

      results.push({ twitter: twitter_screen_name, lead_id: lead.id, status: 'ok' });
    }

    res.status(200).json({ message: 'Leads de X Ads procesados', results });

  } catch (error) {
    console.error('[X Ads Webhook]', error.message);
    res.status(500).json({ error: 'Error procesando webhook de X Ads' });
  }
});

export default router;
