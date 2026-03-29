/**
 * notify.service.js
 * Notificaciones en tiempo real via Resend (email) cuando cae un lead.
 * No requiere paquete extra — usa axios que ya esta instalado.
 *
 * Variables de entorno necesarias:
 *   RESEND_API_KEY    — tu api key de resend.com
 *   NOTIFY_EMAIL      — tu email donde quieres recibir alertas
 *   NOTIFY_FROM       — "de" del email, ej: Axis CRM <notificaciones@tudominio.com>
 *                       si no tienes dominio propio usa: onboarding@resend.dev (solo modo prueba)
 */

import axios from 'axios';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL   = process.env.NOTIFY_EMAIL;
const NOTIFY_FROM    = process.env.NOTIFY_FROM || 'Axis CRM <onboarding@resend.dev>';

/**
 * Envia notificacion de nuevo lead al admin.
 * No bloquea — falla silenciosamente si no esta configurado.
 */
export const notifyNewLead = async ({ phone, source, projectName, tenantName, leadId, customData = {} }) => {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) return;

  const nombre  = customData?.custom_data?.nombre || customData?.nombre || 'Sin nombre';
  const email   = customData?.custom_data?.email  || customData?.email  || '—';
  const subject = `Nuevo lead: ${nombre !== 'Sin nombre' ? nombre : phone} via ${source}`;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#fff8f0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#FF2D7B,#FF6B2B);padding:20px 28px">
        <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">AXIS</div>
        <div style="font-size:13px;opacity:.8;margin-top:2px">Nuevo lead entrante</div>
      </div>
      <div style="padding:28px">
        <div style="font-size:28px;font-weight:700;margin-bottom:20px">${nombre}</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="color:#888;padding:6px 0;width:120px">Telefono</td><td style="color:#fff8f0;font-weight:600">${phone}</td></tr>
          <tr><td style="color:#888;padding:6px 0">Email</td><td style="color:#fff8f0">${email}</td></tr>
          <tr><td style="color:#888;padding:6px 0">Fuente</td><td style="color:#FF6B2B;font-weight:600">${source}</td></tr>
          <tr><td style="color:#888;padding:6px 0">Proyecto</td><td style="color:#fff8f0">${projectName || '—'}</td></tr>
          <tr><td style="color:#888;padding:6px 0">Tenant</td><td style="color:#fff8f0">${tenantName || '—'}</td></tr>
        </table>
        <div style="margin-top:24px;padding:14px;background:#161616;border-radius:8px;font-size:12px;color:#666">
          Lead ID: ${leadId}
        </div>
      </div>
    </div>
  `;

  try {
    await axios.post('https://api.resend.com/emails', {
      from:    NOTIFY_FROM,
      to:      [NOTIFY_EMAIL],
      subject,
      html
    }, {
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json'
      },
      timeout: 5000
    });
    console.log(`[Notify] Email enviado: ${subject}`);
  } catch (err) {
    console.error(`[Notify] Fallo envio email: ${err.response?.data?.message || err.message}`);
  }
};
