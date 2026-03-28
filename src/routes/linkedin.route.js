/**
 * LinkedIn Lead Gen Forms — Webhook Receiver
 * ============================================
 * Prioridad: 🟠 Media
 *
 * Cómo funciona:
 * 1. En LinkedIn Campaign Manager > Lead Gen Forms > Integrations
 * 2. Seleccionas "Webhook" y pegas esta URL:
 *    https://TU-DOMINIO/api/integrations/linkedin?token=TU_PROJECT_TOKEN
 * 3. LinkedIn manda un POST firmado con HMAC-SHA256 cuando alguien llena el formulario
 *
 * Payload que manda LinkedIn:
 * {
 *   "firstName": "Juan",
 *   "lastName": "Pérez",
 *   "emailAddress": "juan@email.com",
 *   "phoneNumber": "+5210000000",
 *   "company": "Empresa SA",
 *   "jobTitle": "Director",
 *   "leadId": "urn:li:lead:...",
 *   "formId": "urn:li:leadGenForm:...",
 *   "campaignId": "urn:li:sponsoredCampaign:...",
 *   "submittedAt": 1234567890000
 * }
 *
 * Seguridad:
 * - Se valida firma HMAC-SHA256 en header x-li-signature
 * - El secreto se obtiene en LinkedIn Campaign Manager al configurar el webhook
 * - Guardar como LINKEDIN_WEBHOOK_SECRET en Railway variables
 *
 * Setup en LinkedIn (sin código):
 * 1. Campaign Manager > Account Assets > Lead Gen Forms
 * 2. Click en tu formulario > "Set up lead sync"
 * 3. Selecciona "Webhook" > pega URL > copia el "Client Secret"
 * 4. Guarda el Client Secret en Bitwarden y en Railway como LINKEDIN_WEBHOOK_SECRET
 */

import { Router } from 'express';
import { createHmac } from 'crypto';
import db from '../db/index.js';
const { pool } = db;
import { upsertLead } from '../services/lead.service.js';
import { logEvent } from '../services/event.service.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';

const router = Router();

// Verifica la firma HMAC que manda LinkedIn
const verifyLinkedInSignature = (payload, signature, secret) => {
  if (!signature || !secret) return false;
  // LinkedIn firma como: sha256=HASH
  const expectedSig = 'sha256=' + createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return signature === expectedSig;
};

// Normaliza el teléfono
const normalizePhone = (phone) => {
  if (!phone) return null;
  return phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
};

/**
 * POST /api/integrations/linkedin
 * Query params:
 *   ?token=PROJECT_TOKEN  (requerido - identifica el X-Wing)
 * Headers:
 *   x-li-signature: sha256=HASH (LinkedIn lo agrega automáticamente)
 */
router.post('/', async (req, res) => {
  try {
    // 1. Validar project token
    const projectToken = req.query.token;
    if (!projectToken || !/^[a-f0-9]{32}$/.test(projectToken)) {
      return res.status(401).json({ error: 'Project token inválido o faltante' });
    }

    // 2. Validar firma de LinkedIn (si el secret está configurado)
    const linkedInSecret = process.env.LINKEDIN_WEBHOOK_SECRET;
    if (linkedInSecret) {
      const signature = req.headers['x-li-signature'];
      if (!verifyLinkedInSignature(req.body, signature, linkedInSecret)) {
        return res.status(403).json({ error: 'Firma de LinkedIn inválida' });
      }
    }

    // 3. Resolver tenant y proyecto desde el token
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

    // 4. Parsear payload de LinkedIn
    const {
      firstName, lastName, emailAddress, phoneNumber,
      company, jobTitle, leadId, formId, campaignId, submittedAt
    } = req.body;

    const phone = normalizePhone(phoneNumber);
    const nombre = [firstName, lastName].filter(Boolean).join(' ') || null;

    if (!phone && !emailAddress) {
      return res.status(400).json({ error: 'LinkedIn no envió teléfono ni email' });
    }

    // Si no hay teléfono pero sí email, usamos email como identificador
    const phoneForLead = phone || emailAddress.replace('@', '_at_').replace(/\./g, '_');

    // 5. Crear lead en contexto del tenant correcto
    let lead;
    await tenantStorage.run({ tenantId: tenant_id }, async () => {
      lead = await upsertLead({
        phone: phoneForLead,
        nombre,
        email: emailAddress,
        project_id,
        source: 'LINKEDIN',
        custom_data: {
          fuente: 'LinkedIn Lead Gen Form',
          empresa: company,
          cargo: jobTitle,
          linkedin_lead_id: leadId,
          form_id: formId,
          campaign_id: campaignId,
          submitted_at: submittedAt ? new Date(submittedAt).toISOString() : null
        }
      });

      // 6. Log de evento
      await logEvent(
        'lead.linkedin',
        'lead',
        lead.id,
        'integration/linkedin',
        { campaign_id: campaignId, form_id: formId, linkedin_lead_id: leadId },
        tenant_id
      );
    });

    // LinkedIn espera HTTP 200
    res.status(200).json({ message: 'Lead de LinkedIn registrado', lead_id: lead.id });

  } catch (error) {
    console.error('[LinkedIn Webhook]', error.message);
    res.status(500).json({ error: 'Error procesando webhook de LinkedIn' });
  }
});

export default router;
