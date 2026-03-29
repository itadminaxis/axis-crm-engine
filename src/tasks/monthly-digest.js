import db from '../db/index.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * TAREA: DIGEST MENSUAL AUTOMÁTICO
 * Día 1 de cada mes a las 8am (Monterrey).
 * Envía a cada tenant activo con notify_email sus métricas del mes anterior.
 * Copyright (c) 2026 Andres Abel Fuentes Esquivel.
 */
export const monthlyDigest = async (payload, helpers) => {
  const { logger } = helpers;
  logger.info('📊 Iniciando Digest Mensual...');

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const NOTIFY_FROM    = process.env.NOTIFY_FROM || 'Axis CRM <onboarding@resend.dev>';
  const DASHBOARD_URL  = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'https://attractive-mindfulness-production.up.railway.app';

  if (!RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY no configurado — digest cancelado');
    return;
  }

  // Calcular rango: mes anterior completo (en calendario, no rolling 30 días)
  const { targetYear, targetMonth, from, to, monthName } = payload?.override
    ? payload.override                  // permite trigger manual con parámetros
    : calcLastMonthRange();

  // Obtener tenants activos con notify_email y digest_enabled
  const tenantsResult = await db.pool.query(
    `SELECT id, name, notify_email, digest_enabled
     FROM tenants
     WHERE active = true
       AND notify_email IS NOT NULL
       AND notify_email != ''
       AND (digest_enabled IS NULL OR digest_enabled = true)
     ORDER BY name`
  );

  logger.info(`Digest: ${tenantsResult.rows.length} tenant(s) con email configurado`);

  let sent = 0;
  let failed = 0;

  for (const tenant of tenantsResult.rows) {
    try {
      await sendDigestForTenant({ tenant, from, to, monthName, RESEND_API_KEY, NOTIFY_FROM, DASHBOARD_URL, logger });
      sent++;
    } catch (err) {
      logger.error(`Digest fallido para ${tenant.name}: ${err.message}`);
      failed++;
    }
  }

  logger.info(`Digest Mensual completado: ${sent} enviados, ${failed} fallidos ✅`);
};

// ── HELPERS ────────────────────────────────────────────────────────────────────

function calcLastMonthRange() {
  const now = new Date();
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1; // 0-indexed

  const from = new Date(year, month, 1).toISOString();
  const to   = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();
  const monthName = new Date(year, month, 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' });

  return { targetYear: year, targetMonth: month, from, to, monthName };
}

async function sendDigestForTenant({ tenant, from, to, monthName, RESEND_API_KEY, NOTIFY_FROM, DASHBOARD_URL, logger }) {
  const { pool } = db;

  // Mes de comparativa (mes anterior al que reportamos)
  const fromDate     = new Date(from);
  const prevYear     = fromDate.getMonth() === 0 ? fromDate.getFullYear() - 1 : fromDate.getFullYear();
  const prevMonth    = fromDate.getMonth() === 0 ? 11 : fromDate.getMonth() - 1;
  const prevFrom     = new Date(prevYear, prevMonth, 1).toISOString();
  const prevTo       = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999).toISOString();

  const [totalRes, sourceRes, projectRes, prevMonthRes, dailyRes] = await Promise.all([
    // Total del mes
    pool.query(
      'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3',
      [tenant.id, from, to]
    ),
    // Top fuentes (hasta 5)
    pool.query(
      `SELECT custom_data->>'source' AS source, COUNT(*) AS count
       FROM leads WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY custom_data->>'source'
       ORDER BY count DESC LIMIT 5`,
      [tenant.id, from, to]
    ),
    // Top proyectos (hasta 5)
    pool.query(
      `SELECT COALESCE(p.name, 'Sin proyecto') AS project_name, COUNT(*) AS count
       FROM leads l LEFT JOIN projects p ON p.id = l.project_id
       WHERE l.tenant_id = $1 AND l.created_at >= $2 AND l.created_at <= $3
       GROUP BY COALESCE(p.name, 'Sin proyecto')
       ORDER BY count DESC LIMIT 5`,
      [tenant.id, from, to]
    ),
    // Mes anterior para comparativa
    pool.query(
      'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3',
      [tenant.id, prevFrom, prevTo]
    ),
    // Promedio diario (leads / días del mes)
    pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) / GREATEST(EXTRACT(DAY FROM MAX(created_at) - MIN(created_at))::int + 1, 1) AS daily_avg
       FROM leads WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [tenant.id, from, to]
    )
  ]);

  const total     = parseInt(totalRes.rows[0].total, 10);
  const prevTotal = parseInt(prevMonthRes.rows[0].total, 10);
  const dailyAvg  = parseFloat(dailyRes.rows[0]?.daily_avg || 0).toFixed(1);

  // Delta vs mes anterior
  const delta     = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const deltaText = delta === null ? 'Primer mes de datos'
    : delta === 0 ? 'Sin cambio vs mes anterior'
    : delta > 0   ? `↑ +${delta}% vs mes anterior`
                  : `↓ ${delta}% vs mes anterior`;
  const deltaColor = delta === null || delta === 0 ? '#888' : delta > 0 ? '#2ECC71' : '#FF4444';

  // No enviar si no hay leads Y no hay historial (evita spam en tenants vacíos)
  if (total === 0 && prevTotal === 0) {
    logger.info(`Digest omitido para ${tenant.name}: sin actividad`);
    return;
  }

  // ── HTML ──────────────────────────────────────────────────────────────────
  const sourcesHTML = sourceRes.rows.length > 0
    ? sourceRes.rows.map(r => `
        <tr>
          <td style="padding:7px 0;color:#ccc;font-size:14px">${r.source || 'Directo'}</td>
          <td style="padding:7px 0;color:#FF6B2B;font-weight:700;text-align:right;font-size:14px">${r.count}</td>
        </tr>`
      ).join('')
    : '<tr><td colspan="2" style="color:#555;font-size:13px;padding:8px 0">Sin datos de fuentes</td></tr>';

  const projectsHTML = projectRes.rows.length > 0
    ? projectRes.rows.map(r => `
        <tr>
          <td style="padding:7px 0;color:#ccc;font-size:14px">${r.project_name}</td>
          <td style="padding:7px 0;color:#FF2D7B;font-weight:700;text-align:right;font-size:14px">${r.count}</td>
        </tr>`
      ).join('')
    : '<tr><td colspan="2" style="color:#555;font-size:13px;padding:8px 0">Sin proyectos activos</td></tr>';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff8f0;border-radius:16px;overflow:hidden">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#FF2D7B 0%,#FF6B2B 100%);padding:28px 32px">
        <div style="font-size:28px;font-weight:900;letter-spacing:-1px;margin-bottom:4px">AXIS</div>
        <div style="font-size:13px;opacity:.8">Reporte Mensual · ${tenant.name}</div>
      </div>

      <div style="padding:36px 32px 0">

        <!-- Hero: Total leads -->
        <div style="text-align:center;margin-bottom:36px;padding:28px;background:#111;border-radius:12px;border:1px solid #1e1e1e">
          <div style="font-size:72px;font-weight:900;line-height:1;background:linear-gradient(135deg,#FF2D7B,#FF6B2B);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${total}</div>
          <div style="font-size:15px;color:#888;margin-top:8px">leads en ${monthName}</div>
          <div style="font-size:13px;margin-top:8px;color:${deltaColor};font-weight:600">${deltaText}</div>
          <div style="font-size:12px;margin-top:6px;color:#555">Promedio diario: ${dailyAvg} leads/día</div>
        </div>

        <!-- Dos columnas -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px">

          <!-- Top Fuentes -->
          <div style="background:#111;border-radius:10px;padding:18px;border:1px solid #1e1e1e">
            <div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">Top Fuentes</div>
            <table style="width:100%;border-collapse:collapse">${sourcesHTML}</table>
          </div>

          <!-- Por Proyecto -->
          <div style="background:#111;border-radius:10px;padding:18px;border:1px solid #1e1e1e">
            <div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">Por Proyecto</div>
            <table style="width:100%;border-collapse:collapse">${projectsHTML}</table>
          </div>

        </div>

        <!-- CTA -->
        <div style="text-align:center;padding-bottom:36px">
          <a href="${DASHBOARD_URL}/dashboard/station.html"
             style="display:inline-block;background:linear-gradient(135deg,#FF2D7B,#FF6B2B);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:.3px">
            Abrir Dashboard
          </a>
          <div style="margin-top:12px;font-size:11px;color:#444">
            También puedes exportar el CSV en: ${DASHBOARD_URL}/dashboard/metrics.html
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;border-top:1px solid #141414;text-align:center">
        <div style="font-size:11px;color:#333">
          Axis CRM Engine · Reporte automático del ${monthName}<br>
          Para dejar de recibir este reporte, contacta a tu proveedor.
        </div>
      </div>

    </div>
  `;

  await axios.post('https://api.resend.com/emails', {
    from:    NOTIFY_FROM,
    to:      [tenant.notify_email],
    subject: `📊 ${total} leads en ${monthName} — ${tenant.name}`,
    html
  }, {
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json'
    },
    timeout: 8000
  });

  logger.info(`[Digest] Enviado a ${tenant.notify_email} — ${tenant.name} — ${total} leads`);
}
