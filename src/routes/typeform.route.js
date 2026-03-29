/**
 * Typeform / Tally — Webhook Receiver
 * =====================================
 * Prioridad: ✅ Ya funciona con /api/submit, pero este endpoint
 * entiende el formato nativo de Typeform y Tally directamente.
 *
 * Setup en Typeform:
 * 1. Tu formulario > Connect > Webhooks > Add webhook
 * 2. URL: https://attractive-mindfulness-production.up.railway.app/api/integrations/typeform?token=TU_PROJECT_TOKEN
 * 3. Activa "Verified webhooks" y copia el secret → TYPEFORM_WEBHOOK_SECRET
 *
 * Setup en Tally:
 * 1. Tu formulario > Integrations > Webhooks > Add endpoint
 * 2. URL: https://attractive-mindfulness-production.up.railway.app/api/integrations/typeform?token=TU_PROJECT_TOKEN
 * (Tally no requiere secret, pero sí acepta el token en la URL)
 *
 * Payload Typeform:
 * { "form_id": "...", "token": "...", "answers": [...], "definition": { "fields": [...] } }
 *
 * Payload Tally:
 * { "formId": "...", "data": { "fields": [...] } }
 */

import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/index.js';
const { pool } = db;
import { upsertLead } from '../services/lead.service.js';
import { logEvent } from '../services/event.service.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';

const router = Router();

// Verifica firma HMAC de Typeform
const verifyTypeformSignature = (req) => {
  const secret = process.env.TYPEFORM_WEBHOOK_SECRET;
  if (!secret) return true; // Sin secret configurado, se omite verificación
  const signature = req.headers['typeform-signature'];
  if (!signature) return false;
  const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('base64');
  return signature === `sha256=${hash}`;
};

// Extrae campos del formato Typeform
const parseTypeform = (body) => {
  const answers = body.answers || [];
  const fields = body.definition?.fields || [];
  const result = {};

  answers.forEach((answer) => {
    const field = fields.find(f => f.id === answer.field?.id);
    const label = (field?.title || answer.field?.id || '').toLowerCase();
    const value = answer.text || answer.phone_number || answer.email ||
                  answer.choice?.label || answer.number || null;

    if (label.includes('teléfono') || label.includes('telefono') ||
        label.includes('phone') || label.includes('celular') ||
        answer.type === 'phone_number') {
      result.phone = value;
    } else if (label.includes('nombre') || label.includes('name')) {
      result.nombre = value;
    } else if (label.includes('email') || label.includes('correo') ||
               answer.type === 'email') {
      result.email = value;
    } else if (label.includes('proyecto') || label.includes('interés') ||
               label.includes('interes') || label.includes('desarrollo')) {
      result.interes = value;
    }
  });

  result.raw = answers;
  result.form_id = body.form_id;
  result.response_id = body.token;
  return result;
};

// Extrae campos del formato Tally
const parseTally = (body) => {
  const fields = body.data?.fields || [];
  const result = {};

  fields.forEach((field) => {
    const label = (field.label || '').toLowerCase();
    const value = Array.isArray(field.value)
      ? field.value.join(', ')
      : field.value;

    if (label.includes('teléfono') || label.includes('telefono') ||
        label.includes('phone') || label.includes('celular') || field.type === 'PHONE_NUMBER') {
      result.phone = value;
    } else if (label.includes('nombre') || label.includes('name')) {
      result.nombre = value;
    } else if (label.includes('email') || label.includes('correo') ||
               field.type === 'EMAIL') {
      result.email = value;
    } else if (label.includes('proyecto') || label.includes('interés') ||
               label.includes('interes')) {
      result.interes = value;
    }
  });

  result.raw = fields;
  result.form_id = body.formId || body.data?.formId;
  return result;
};

/**
 * POST /api/integrations/typeform
 * Compatible con Typeform y Tally
 */
router.post('/', async (req, res) => {
  try {
    // 1. Detectar si es Typeform o Tally
    const isTally = !!req.body.formId || !!req.body.data?.formId;
    const isTypeform = !!req.body.form_id || !!req.body.answers;

    if (!isTally && !isTypeform) {
      return res.status(400).json({ error: 'Payload no reconocido (no es Typeform ni Tally)' });
    }

    // 2. Verificar firma Typeform (si aplica)
    if (isTypeform && !verifyTypeformSignature(req)) {
      return res.status(403).json({ error: 'Firma Typeform inválida' });
    }

    // 3. Validar project token
    const projectToken = req.query.token;
    if (!projectToken || !/^[a-f0-9]{32}$/.test(projectToken)) {
      return res.status(401).json({ error: 'Project token inválido o faltante' });
    }

    // 4. Resolver tenant y proyecto
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

    // 5. Parsear payload según origen
    const parsed = isTally ? parseTally(req.body) : parseTypeform(req.body);
    const source = isTally ? 'TALLY' : 'TYPEFORM';

    if (!parsed.phone && !parsed.email) {
      return res.status(400).json({ error: 'El formulario no contiene teléfono ni email' });
    }

    // 6. Upsert lead en contexto del tenant
    let lead;
    await tenantStorage.run({ tenantId: tenant_id }, async () => {
      lead = await upsertLead({
        phone: parsed.phone || null,
        nombre: parsed.nombre || null,
        email: parsed.email || null,
        project_id,
        source,
        custom_data: {
          fuente: source,
          form_id: parsed.form_id,
          response_id: parsed.response_id,
          interes: parsed.interes,
          raw: parsed.raw
        }
      });

      await logEvent(
        `lead.${source.toLowerCase()}`,
        'lead',
        lead.id,
        `integration/${source.toLowerCase()}`,
        { form_id: parsed.form_id, project_name },
        tenant_id
      );
    });

    res.status(200).json({ message: `Lead de ${source} registrado`, lead_id: lead.id });

  } catch (error) {
    console.error('[Typeform/Tally Webhook]', error.message);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
});

export default router;
