/**
 * webhook.controller.js
 * Maneja webhooks de Meta: WhatsApp Business API y Facebook Lead Ads.
 *
 * Variables de entorno necesarias:
 *   META_VERIFY_TOKEN          — token de verificacion del webhook (ya existe)
 *   META_APP_SECRET            — app secret de tu Meta App (para verificar firma)
 *   META_PAGE_ACCESS_TOKEN     — page access token para llamar Graph API
 *   META_DEFAULT_PROJECT_TOKEN — public_token del proyecto donde caen los leads
 */

import crypto from 'node:crypto';
import axios  from 'axios';
import dotenv from 'dotenv';
import db     from '../db/index.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';
import { upsertLead }    from '../services/lead.service.js';
import { logEvent }      from '../services/event.service.js';

dotenv.config();

const { pool } = db;

// ── VERIFICACION DEL HUB TOKEN ────────────────────────────────────────────────
export const verifyMetaWebhook = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('[Meta Webhook] Verificado ✅');
    return res.status(200).send(challenge);
  }
  console.error('[Meta Webhook] Fallo de verificacion — token incorrecto');
  return res.sendStatus(403);
};

// ── VERIFICAR FIRMA X-Hub-Signature-256 ──────────────────────────────────────
const verifySignature = (req) => {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return true;

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const body     = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (_) {
    return false;
  }
};

// ── RESOLVER TENANT DESDE PROJECT TOKEN ──────────────────────────────────────
const resolveTenantFromToken = async (token) => {
  if (!token) return null;
  const res = await pool.query(
    `SELECT p.id as project_id, p.name as project_name,
            t.id as tenant_id, t.name as tenant_name
     FROM projects p
     JOIN tenants t ON t.id = p.tenant_id
     WHERE p.public_token = $1`,
    [token]
  );
  return res.rows[0] || null;
};

// ── OBTENER DATOS DEL LEAD DESDE GRAPH API ────────────────────────────────────
const fetchLeadFromGraph = async (leadgenId) => {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('[Meta Webhook] META_PAGE_ACCESS_TOKEN no configurado');
    return null;
  }
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v19.0/${leadgenId}`,
      { params: { access_token: accessToken }, timeout: 8000 }
    );
    return data;
  } catch (err) {
    console.error('[Meta Webhook] Error Graph API:', err.response?.data?.error?.message || err.message);
    return null;
  }
};

// ── PARSEAR CAMPOS DEL LEAD ───────────────────────────────────────────────────
const parseLeadFields = (fieldData = []) => {
  const result = {};
  const MAP = {
    phone_number: 'phone',
    full_name:    'nombre',
    email:        'email',
    first_name:   'first_name',
    last_name:    'last_name',
  };
  fieldData.forEach(({ name, values }) => {
    const key = MAP[name] || name;
    result[key] = values?.[0] || null;
  });
  if (!result.nombre && (result.first_name || result.last_name)) {
    result.nombre = [result.first_name, result.last_name].filter(Boolean).join(' ');
  }
  return result;
};

// ── HANDLER PRINCIPAL ─────────────────────────────────────────────────────────
export const handleWebhook = async (req, res) => {
  // Responder 200 inmediatamente (Meta reintenta si no recibe respuesta rapido)
  res.sendStatus(200);

  if (!verifySignature(req)) {
    console.error('[Meta Webhook] Firma invalida — payload descartado');
    return;
  }

  const body = req.body;
  if (!body || body.object !== 'page') return;

  const token   = req.query.token || process.env.META_DEFAULT_PROJECT_TOKEN;
  const context = await resolveTenantFromToken(token);

  if (!context) {
    console.error('[Meta Webhook] Tenant no resuelto. Configura META_DEFAULT_PROJECT_TOKEN en .env');
    return;
  }

  const { project_id, tenant_id } = context;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const field = change.field;
      const value = change.value;

      // LEAD ADS — formulario de Facebook/Instagram Ads
      if (field === 'leadgen') {
        const leadgenId = value?.leadgen_id;
        if (!leadgenId) continue;

        console.log(`[Meta Webhook] Lead Ad: ${leadgenId}`);

        const graphData  = await fetchLeadFromGraph(leadgenId);
        const leadFields = parseLeadFields(graphData?.field_data || []);
        const phone      = leadFields.phone;

        await tenantStorage.run({ tenantId: tenant_id }, async () => {
          await upsertLead({
            phone:       phone || `meta_${leadgenId}`,
            project_id,
            source:      'META_LEAD_ADS',
            custom_data: {
              nombre:     leadFields.nombre || null,
              email:      leadFields.email  || null,
              leadgen_id: leadgenId,
              form_id:    value.form_id     || null,
              ad_id:      value.ad_id       || null,
              page_id:    value.page_id     || null,
            }
          });
        });

        continue;
      }

      // WHATSAPP CONTACTS
      if (field === 'messages') {
        const contacts = value?.contacts || [];
        for (const contact of contacts) {
          const phone = contact.wa_id;
          if (!phone) continue;

          console.log(`[Meta Webhook] WhatsApp: ${phone}`);

          await tenantStorage.run({ tenantId: tenant_id }, async () => {
            await upsertLead({
              phone,
              project_id,
              source:      'WHATSAPP',
              custom_data: {
                nombre: contact.profile?.name || null,
              }
            });
          });
        }
        continue;
      }

      console.log(`[Meta Webhook] Campo no manejado: ${field}`);
    }
  }
};
