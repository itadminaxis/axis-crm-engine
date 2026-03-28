/**
 * Google Ads Lead Form Extensions — Webhook Receiver
 * =====================================================
 * Prioridad: 🟠 Media
 *
 * Cómo funciona:
 * 1. En Google Ads > tu campaña > Lead Forms > Webhook
 * 2. Pones esta URL: https://TU-DOMINIO/api/integrations/google-ads?token=TU_PROJECT_TOKEN&secret=TU_SECRET
 * 3. Google envía un POST cuando alguien llena el formulario del anuncio
 *
 * Payload que manda Google Ads:
 * {
 *   "google_key": "...",
 *   "user_column_data": [
 *     { "column_name": "FULL_NAME", "string_value": "Juan Pérez" },
 *     { "column_name": "PHONE_NUMBER", "string_value": "+5210000000" },
 *     { "column_name": "EMAIL", "string_value": "juan@email.com" },
 *     { "column_name": "CITY", "string_value": "Monterrey" }
 *   ],
 *   "lead_id": "...",
 *   "campaign_id": "...",
 *   "campaign_name": "...",
 *   "adgroup_id": "...",
 *   "creative_id": "..."
 * }
 *
 * Seguridad:
 * - Se valida ?token= (project token público del X-Wing)
 * - Se valida ?secret= (secreto compartido configurado en Google Ads)
 * - El secreto se guarda como variable de entorno GOOGLE_ADS_WEBHOOK_SECRET
 *
 * Setup en Google Ads (sin código):
 * 1. Campañas > Extensiones de anuncio > Formularios de clientes potenciales
 * 2. Scroll hasta "Webhook" > pega la URL con tus parámetros
 * 3. Copia el "Google Key" que te da Google y guárdalo en Bitwarden
 */

import { Router } from 'express';
import db from '../db/index.js';
const { pool } = db;
import { upsertLead } from '../services/lead.service.js';
import { logEvent } from '../services/event.service.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';

const router = Router();

// Extrae el valor de una columna del payload de Google Ads
const extractField = (columns, fieldName) => {
  const col = columns.find(c => c.column_name === fieldName);
  return col?.string_value || null;
};

// Normaliza el teléfono para consistencia
const normalizePhone = (phone) => {
  if (!phone) return null;
  return phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
};

/**
 * POST /api/integrations/google-ads
 * Query params:
 *   ?token=PROJECT_TOKEN  (requerido - identifica el X-Wing)
 *   ?secret=WEBHOOK_SECRET (requerido - valida que viene de Google)
 */
router.post('/', async (req, res) => {
  try {
    // 1. Validar secret compartido
    const secret = req.query.secret;
    const expectedSecret = process.env.GOOGLE_ADS_WEBHOOK_SECRET;

    if (!secret || !expectedSecret || secret !== expectedSecret) {
      return res.status(403).json({ error: 'Webhook secret inválido' });
    }

    // 2. Validar project token
    const projectToken = req.query.token;
    if (!projectToken || !/^[a-f0-9]{32}$/.test(projectToken)) {
      return res.status(401).json({ error: 'Project token inválido o faltante' });
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

    // 4. Parsear payload de Google Ads
    const { user_column_data, lead_id, campaign_id, campaign_name, adgroup_id, creative_id } = req.body;

    if (!user_column_data || !Array.isArray(user_column_data)) {
      return res.status(400).json({ error: 'Payload de Google Ads inválido' });
    }

    // 5. Extraer campos del lead
    const fullName = extractField(user_column_data, 'FULL_NAME');
    const phone = normalizePhone(extractField(user_column_data, 'PHONE_NUMBER'));
    const email = extractField(user_column_data, 'EMAIL');
    const city = extractField(user_column_data, 'CITY');
    const postalCode = extractField(user_column_data, 'POSTAL_CODE');
    const country = extractField(user_column_data, 'COUNTRY');

    if (!phone) {
      return res.status(400).json({ error: 'Google Ads no envió número de teléfono' });
    }

    // 6. Crear lead en contexto del tenant correcto
    let lead;
    await tenantStorage.run({ tenantId: tenant_id }, async () => {
      lead = await upsertLead({
        phone,
        nombre: fullName,
        email,
        project_id,
        source: 'GOOGLE_ADS',
        custom_data: {
          fuente: 'Google Ads Lead Form',
          campaign_name,
          campaign_id,
          adgroup_id,
          creative_id,
          google_lead_id: lead_id,
          city,
          postal_code: postalCode,
          country,
          raw_columns: user_column_data
        }
      });

      // 7. Log de evento
      await logEvent(
        'lead.google_ads',
        'lead',
        lead.id,
        'integration/google-ads',
        { campaign_name, campaign_id, google_lead_id: lead_id },
        tenant_id
      );
    });

    // Google Ads espera HTTP 200 para confirmar recepción
    res.status(200).json({ message: 'Lead de Google Ads registrado', lead_id: lead.id });

  } catch (error) {
    console.error('[Google Ads Webhook]', error.message);
    res.status(500).json({ error: 'Error procesando webhook de Google Ads' });
  }
});

export default router;
