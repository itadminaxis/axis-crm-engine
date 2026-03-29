/**
 * Email Inbound — Receptor de leads por correo
 * =============================================
 * Prioridad: 🟡 Baja
 *
 * Cómo funciona:
 * Resend y SendGrid pueden reenviar emails entrantes como webhooks HTTP.
 * Este endpoint parsea el email y extrae nombre, teléfono y email del remitente.
 *
 * Setup con Resend (Email Routing):
 * 1. resend.com > Domains > tu dominio > Inbound
 * 2. Agrega regla: cuando llegue email a leads@tudominio.com
 * 3. Webhook URL: https://attractive-mindfulness-production.up.railway.app/api/integrations/email?token=TU_PROJECT_TOKEN
 *
 * Setup con SendGrid (Inbound Parse):
 * 1. SendGrid > Settings > Inbound Parse > Add Host & URL
 * 2. URL: https://attractive-mindfulness-production.up.railway.app/api/integrations/email?token=TU_PROJECT_TOKEN
 * 3. Activa "POST the raw, full MIME message"
 *
 * También funciona con cualquier servicio que haga POST con:
 * { "from": "juan@email.com", "subject": "...", "text": "...", "to": "..." }
 *
 * Seguridad:
 * - Validación por project token en URL
 * - Optional: EMAIL_INBOUND_SECRET para validar origen
 */

import { Router } from 'express';
import db from '../db/index.js';
const { pool } = db;
import { upsertLead } from '../services/lead.service.js';
import { logEvent } from '../services/event.service.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';

const router = Router();

// Extrae teléfono del texto del email (regex para formatos MX y US)
const extractPhone = (text) => {
  if (!text) return null;
  const patterns = [
    /\+52\s?[\d\s\-\.]{10,14}/g,   // México con +52
    /\b\d{10}\b/g,                   // 10 dígitos seguidos
    /\b\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4}\b/g,  // 555-555-5555
    /\b\d{2}[\s\-]\d{4}[\s\-]\d{4}\b/g       // 55 1234 5678
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[0]) {
      return match[0].replace(/[\s\-\.]/g, '');
    }
  }
  return null;
};

// Extrae nombre del "From" del email: "Juan Pérez <juan@email.com>"
const extractNameFromFrom = (from) => {
  if (!from) return null;
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return null;
};

// Extrae email limpio del "From"
const extractEmailFromFrom = (from) => {
  if (!from) return null;
  const angleMatch = from.match(/<([^>]+)>/);
  if (angleMatch) return angleMatch[1].trim();
  // Si no tiene <>, puede ser solo el email
  if (from.includes('@')) return from.trim();
  return null;
};

/**
 * POST /api/integrations/email
 * Compatible con Resend Inbound, SendGrid Inbound Parse, y webhooks genéricos
 */
router.post('/', async (req, res) => {
  try {
    // 1. Validar project token
    const projectToken = req.query.token;
    if (!projectToken || !/^[a-f0-9]{32}$/.test(projectToken)) {
      return res.status(401).json({ error: 'Project token inválido o faltante' });
    }

    // 2. Resolver tenant y proyecto
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

    // 3. Parsear payload del email
    // Soporta: Resend, SendGrid, y formato genérico
    const from = req.body.from || req.body.From || req.body.sender || '';
    const subject = req.body.subject || req.body.Subject || '';
    const bodyText = req.body.text || req.body.Text || req.body.plain ||
                     req.body['body-plain'] || req.body.body || '';
    const toAddress = req.body.to || req.body.To || req.body.recipient || '';

    if (!from) {
      return res.status(400).json({ error: 'Email sin campo "from"' });
    }

    // 4. Extraer datos del lead
    const email = extractEmailFromFrom(from);
    const nombre = extractNameFromFrom(from);
    const phone = extractPhone(bodyText) || extractPhone(subject);

    if (!email && !phone) {
      return res.status(400).json({ error: 'No se pudo extraer email ni teléfono del correo' });
    }

    // 5. Upsert lead en contexto del tenant
    let lead;
    await tenantStorage.run({ tenantId: tenant_id }, async () => {
      lead = await upsertLead({
        phone: phone || null,
        nombre: nombre || null,
        email: email || null,
        project_id,
        source: 'EMAIL',
        custom_data: {
          fuente: 'Email Inbound',
          from,
          subject,
          to: toAddress,
          body_preview: bodyText.substring(0, 500)
        }
      });

      await logEvent(
        'lead.email',
        'lead',
        lead.id,
        'integration/email',
        { from, subject, project_name },
        tenant_id
      );
    });

    // Resend y SendGrid esperan 200
    res.status(200).json({ message: 'Lead de email registrado', lead_id: lead.id });

  } catch (error) {
    console.error('[Email Inbound]', error.message);
    res.status(500).json({ error: 'Error procesando email entrante' });
  }
});

export default router;
