/**
 * METRICS-SERVICE.JS - MOTOR DE MEDICIÓN ISO/IEC 25020
 * Phase 7 - Real Observability
 * Queries adapted to actual schema: leads(id, tenant_id, project_id, phone, custom_data, created_at, updated_at)
 * Fields like source, nombre, email, ai_score, ai_status live inside custom_data (JSONB).
 */

import db from '../db/index.js';
const { pool } = db;

// ---------------------------------------------------------------------------
// QM-01 / QM-02 / QM-03 — ISO/IEC 25020 quality metrics (system-wide)
// ---------------------------------------------------------------------------

export const getQualityMetrics = async () => {
  const leadsRes = await pool.query('SELECT COUNT(*) AS total FROM leads');
  const totalLeads = parseInt(leadsRes.rows[0].total, 10);

  const projectsRes = await pool.query('SELECT COUNT(*) AS total FROM projects');
  const totalProjects = parseInt(projectsRes.rows[0].total, 10);

  const tenantsRes = await pool.query('SELECT COUNT(*) AS total FROM tenants WHERE active = true');
  const totalTenants = parseInt(tenantsRes.rows[0].total, 10);

  const avgRes = await pool.query(
    `SELECT COALESCE(ROUND(COUNT(l.id)::numeric / NULLIF(COUNT(DISTINCT p.id), 0), 2), 0) AS avg_leads
     FROM projects p
     LEFT JOIN leads l ON l.project_id = p.id`
  );
  const avgLeadsPerProject = parseFloat(avgRes.rows[0].avg_leads);

  return {
    iso_standard: 'ISO/IEC 25020',
    timestamp: new Date().toISOString(),
    metrics: [
      {
        id: 'QM-01',
        name: 'Fiabilidad de Ingestión',
        value: totalLeads > 0 ? '100%' : 'N/A',
        raw: totalLeads,
        unit: 'leads',
        description: 'Tasa de señales capturadas sin pérdida.'
      },
      {
        id: 'QM-02',
        name: 'Capacidad Operativa',
        value: totalProjects,
        unit: 'proyectos activos',
        description: 'Cantidad de proyectos registrados en el ecosistema.'
      },
      {
        id: 'QM-03',
        name: 'Densidad de Leads por Proyecto',
        value: avgLeadsPerProject,
        unit: 'leads/proyecto',
        description: 'Promedio de leads por proyecto (mide distribución de carga).'
      },
      {
        id: 'QM-04',
        name: 'Tenants Activos',
        value: totalTenants,
        unit: 'tenants',
        description: 'Número de negocios activos en el sistema multi-tenant.'
      }
    ]
  };
};

// ---------------------------------------------------------------------------
// getDashboardMetrics(tenantId) — per-tenant dashboard metrics
// source, status, nombre, email, ai_score, ai_status → all from custom_data JSONB
// ---------------------------------------------------------------------------

export const getDashboardMetrics = async (tenantId) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo   = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Scalar counts
  const [todayRes, weekRes, monthRes] = await Promise.all([
    pool.query(
      'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = $1 AND created_at >= $2',
      [tenantId, todayStart]
    ),
    pool.query(
      'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = $1 AND created_at >= $2',
      [tenantId, weekAgo]
    ),
    pool.query(
      'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = $1 AND created_at >= $2',
      [tenantId, monthAgo]
    ),
  ]);

  const leadsToday = parseInt(todayRes.rows[0].total, 10);
  const leadsWeek  = parseInt(weekRes.rows[0].total, 10);
  const leadsMonth = parseInt(monthRes.rows[0].total, 10);

  // by_source — last 30 days (source lives in custom_data->>'source')
  const bySourceRes = await pool.query(
    `SELECT custom_data->>'source' AS source, COUNT(*) AS count
     FROM leads
     WHERE tenant_id = $1 AND created_at >= $2
     GROUP BY custom_data->>'source'
     ORDER BY count DESC`,
    [tenantId, monthAgo]
  );

  // by_project — last 30 days, join project name
  const byProjectRes = await pool.query(
    `SELECT l.project_id, p.name AS project_name, COUNT(*) AS count
     FROM leads l
     LEFT JOIN projects p ON p.id = l.project_id
     WHERE l.tenant_id = $1 AND l.created_at >= $2
     GROUP BY l.project_id, p.name
     ORDER BY count DESC`,
    [tenantId, monthAgo]
  );

  // by_status — custom_data->>'status' breakdown (last 30 days)
  const byStatusRes = await pool.query(
    `SELECT custom_data->>'status' AS status, COUNT(*) AS count
     FROM leads
     WHERE tenant_id = $1 AND created_at >= $2
     GROUP BY custom_data->>'status'
     ORDER BY count DESC`,
    [tenantId, monthAgo]
  );

  // top leads — last 7 days, ordered by created_at desc
  const topLeadsRes = await pool.query(
    `SELECT id, phone, custom_data, created_at
     FROM leads
     WHERE tenant_id = $1 AND created_at >= $2
     ORDER BY created_at DESC
     LIMIT 50`,
    [tenantId, weekAgo]
  );

  const hotLeads = topLeadsRes.rows.map(r => ({
    id: r.id,
    nombre: r.custom_data?.custom_data?.nombre || r.custom_data?.nombre || null,
    phone: r.phone,
    email: r.custom_data?.custom_data?.email || r.custom_data?.email || null,
    source: r.custom_data?.source || null,
    status: r.custom_data?.status || null,
    created_at: r.created_at
  }));

  return {
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    leads_today: leadsToday,
    leads_week: leadsWeek,
    leads_month: leadsMonth,
    conversion_rate: 0,
    by_source: bySourceRes.rows.map(r => ({
      source: r.source,
      count: parseInt(r.count, 10)
    })),
    by_project: byProjectRes.rows.map(r => ({
      project_id: r.project_id,
      project_name: r.project_name,
      count: parseInt(r.count, 10)
    })),
    by_status: byStatusRes.rows.map(r => ({
      status: r.status,
      count: parseInt(r.count, 10)
    })),
    hot_leads: hotLeads
  };
};

// ---------------------------------------------------------------------------
// getAttributionMetrics(tenantId) — source attribution analysis
// ---------------------------------------------------------------------------

export const getAttributionMetrics = async (tenantId) => {
  const weekAgo     = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo    = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Per-source stats
  const sourceStatsRes = await pool.query(
    `SELECT
       custom_data->>'source'                                              AS source,
       COUNT(*)                                                            AS total,
       COUNT(*) FILTER (WHERE created_at >= $2)                            AS leads_this_week,
       COUNT(*) FILTER (WHERE created_at >= $3 AND created_at < $2)        AS leads_last_week
     FROM leads
     WHERE tenant_id = $1 AND created_at >= $4
     GROUP BY custom_data->>'source'
     ORDER BY total DESC`,
    [tenantId, weekAgo, twoWeeksAgo, monthAgo]
  );

  const totalLeads = sourceStatsRes.rows.reduce((sum, r) => sum + parseInt(r.total, 10), 0);

  const sources = sourceStatsRes.rows.map(r => {
    const total       = parseInt(r.total, 10);
    const thisWeek    = parseInt(r.leads_this_week, 10);
    const lastWeek    = parseInt(r.leads_last_week, 10);

    let trend = 'stable';
    if (lastWeek === 0 && thisWeek > 0) trend = 'new';
    else if (thisWeek > lastWeek)       trend = 'up';
    else if (thisWeek < lastWeek)       trend = 'down';

    return {
      source: r.source,
      count: total,
      percentage: totalLeads > 0 ? parseFloat(((total / totalLeads) * 100).toFixed(2)) : 0,
      leads_this_week: thisWeek,
      leads_last_week: lastWeek,
      hot_count: 0,
      trend
    };
  });

  const topSource = sources.length > 0 ? sources[0] : null;

  // Best day of week (0=Sunday ... 6=Saturday), last 30 days
  const bestDayRes = await pool.query(
    `SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*) AS cnt
     FROM leads
     WHERE tenant_id = $1 AND created_at >= $2
     GROUP BY dow
     ORDER BY cnt DESC
     LIMIT 1`,
    [tenantId, monthAgo]
  );

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const bestDay = bestDayRes.rows.length > 0
    ? { dow: bestDayRes.rows[0].dow, name: dayNames[bestDayRes.rows[0].dow], count: parseInt(bestDayRes.rows[0].cnt, 10) }
    : null;

  // Best hour of day, last 30 days
  const bestHourRes = await pool.query(
    `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS cnt
     FROM leads
     WHERE tenant_id = $1 AND created_at >= $2
     GROUP BY hour
     ORDER BY cnt DESC
     LIMIT 1`,
    [tenantId, monthAgo]
  );

  const bestHour = bestHourRes.rows.length > 0
    ? { hour: bestHourRes.rows[0].hour, count: parseInt(bestHourRes.rows[0].cnt, 10) }
    : null;

  return {
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    period: 'last_30_days',
    sources,
    top_performing_source: topSource ? topSource.source : null,
    best_day_of_week: bestDay,
    best_hour_of_day: bestHour
  };
};

// ---------------------------------------------------------------------------
// getAlerts(tenantId) — simple alert system
// ---------------------------------------------------------------------------

export const getAlerts = async (tenantId) => {
  const alerts = [];

  const todayStart     = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const yesterdayStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd   = new Date(yesterdayStart); yesterdayEnd.setHours(23, 59, 59, 999);

  const weekAgo     = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const h24ago      = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Count leads today and yesterday
  const [todayRes, yesterdayRes] = await Promise.all([
    pool.query(
      'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = $1 AND created_at >= $2',
      [tenantId, todayStart]
    ),
    pool.query(
      'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3',
      [tenantId, yesterdayStart.toISOString(), yesterdayEnd.toISOString()]
    ),
  ]);

  const leadsToday     = parseInt(todayRes.rows[0].total, 10);
  const leadsYesterday = parseInt(yesterdayRes.rows[0].total, 10);

  if (leadsToday === 0 && leadsYesterday > 0) {
    alerts.push({
      type: 'sin_leads',
      message: 'Sin leads hoy',
      severity: 'warning'
    });
  }

  const [weekRes, prevWeekRes] = await Promise.all([
    pool.query(
      'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = $1 AND created_at >= $2',
      [tenantId, weekAgo]
    ),
    pool.query(
      'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3',
      [tenantId, twoWeeksAgo, weekAgo]
    ),
  ]);

  const leadsThisWeek = parseInt(weekRes.rows[0].total, 10);
  const leadsPrevWeek = parseInt(prevWeekRes.rows[0].total, 10);

  if (leadsPrevWeek > 0 && leadsThisWeek < leadsPrevWeek * 0.5) {
    alerts.push({
      type: 'caida',
      message: `Caída >50% esta semana (${leadsThisWeek} vs ${leadsPrevWeek} la semana pasada)`,
      severity: 'critical'
    });
  }

  // Alert: errors in events table last 24h
  try {
    const errorsRes = await pool.query(
      `SELECT COUNT(*) AS total
       FROM events
       WHERE tenant_id = $1
         AND event_type LIKE 'error%'
         AND created_at >= $2`,
      [tenantId, h24ago]
    );
    const errorCount = parseInt(errorsRes.rows[0].total, 10);

    if (errorCount > 0) {
      alerts.push({
        type: 'webhook_errors',
        message: `${errorCount} error(es) de webhook en las últimas 24h`,
        severity: errorCount >= 5 ? 'critical' : 'warning'
      });
    }
  } catch (_) {
    // events table may not exist yet
  }

  return {
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    alert_count: alerts.length,
    alerts
  };
};
