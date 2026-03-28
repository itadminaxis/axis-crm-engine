import db from '../db/index.js';
import { queryRaw } from '../db/index.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';
import { logEvent } from './event.service.js';
import crypto from 'crypto';

/**
 * ═══════════════════════════════════════════════════════════════════
 * SERVICIO DE FLOTA EXTERNA - AXIS CRM ENGINE
 * Gestiona tenants externos con 5 niveles de acceso.
 * Copyright (c) 2026 Andres Abel Fuentes Esquivel.
 * ═══════════════════════════════════════════════════════════════════
 *
 * COLORIMETRIA DE NIVELES (Mayor → Menor probabilidad de uso):
 *
 *   #2ECC71  SELF        Tu negocio. Siempre activo. No se crea via API.
 *   #00D1FF  MANAGED     Cliente que analizas. Acceso total a sus datos.
 *   #FF6B2B  HOSTED      Cliente SaaS. Solo metricas de uso, sin datos.
 *   #8E44AD  RESELLER    Aliado white-label. Crea sus propios sub-clientes.
 *   #F1C40F  CONTRACTOR  Te subcontratan. Acceso total pero temporal.
 *
 * ═══════════════════════════════════════════════════════════════════
 *
 * INSTRUCCIONES POR NIVEL:
 *
 * SELF (verde #2ECC71):
 *   - Es tu tenant raiz. Ya existe al instalar la plataforma.
 *   - No se crea via API. Es el punto de origen de toda la flota.
 *   - Tienes acceso total a todo: leads, eventos, proyectos, metricas.
 *
 * MANAGED (azul #00D1FF):
 *   - Crear: POST /admin/fleet { name: "X", access_level: "managed" }
 *   - Tu acceso: VES TODO (leads, custom_data, telefonos, eventos completos).
 *   - Su acceso: VE TODO lo suyo con su propia api_key.
 *   - Caso de uso: "Hazme una web y analiza mis leads de hamburguesas".
 *   - Consulta cross-tenant: GET /admin/fleet/:id/leads → datos completos.
 *
 * HOSTED (naranja #FF6B2B):
 *   - Crear: POST /admin/fleet { name: "X", access_level: "hosted" }
 *   - Tu acceso: SOLO METRICAS (conteos, actividad). NO ves datos.
 *   - Su acceso: VE TODO lo suyo con su propia api_key.
 *   - Caso de uso: "Solo quiero el tracking, mis datos son mios".
 *   - Consulta cross-tenant: GET /admin/fleet/:id/leads → telefonos enmascarados, sin custom_data.
 *
 * RESELLER (morado #8E44AD):
 *   - Crear: POST /admin/fleet { name: "X", access_level: "reseller", branding: {...} }
 *   - El reseller puede crear sus PROPIOS sub-clientes con SU api_key.
 *   - Tu acceso al reseller: SOLO METRICAS del reseller.
 *   - Tu acceso a clientes del reseller: NINGUNO.
 *   - El reseller tiene acceso a sus clientes segun el nivel que les asigne.
 *   - Caso de uso: "Agencia Digital X me pide la plataforma para sus 10 clientes".
 *   - White-label: campo branding { brand_name, logo_url, primary_color }.
 *   - El cliente final NUNCA sabe que Axis CRM existe.
 *
 * CONTRACTOR (dorado #F1C40F):
 *   - Crear: POST /admin/fleet { name: "X", access_level: "contractor", expires_in_days: 90 }
 *   - Tu acceso: TOTAL pero con FECHA DE EXPIRACION.
 *   - Despues de access_expires_at, tus consultas cross-tenant son rechazadas.
 *   - El cliente sigue operando normalmente; solo TU acceso expira.
 *   - Caso de uso: "Construyeme un CRM, tienes 3 meses de acceso".
 *   - Para renovar: PUT /admin/fleet/:id/access { access_level: "contractor", expires_in_days: 90 }
 *
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * Mapa de colores por nivel (para dashboards).
 */
export const ACCESS_LEVEL_COLORS = {
  self:       '#2ECC71',  // Verde    — Tu negocio
  managed:    '#00D1FF',  // Azul     — Cliente que analizas
  hosted:     '#FF6B2B',  // Naranja  — Cliente SaaS
  reseller:   '#8E44AD',  // Morado   — Aliado white-label
  contractor: '#F1C40F',  // Dorado   — Te subcontratan temporalmente
};

/**
 * Descripcion humana de cada nivel.
 */
export const ACCESS_LEVEL_DESCRIPTIONS = {
  self:       'Tu propio negocio. Acceso total permanente.',
  managed:    'Cliente que analizas. Ves todos sus datos.',
  hosted:     'Cliente SaaS. Solo metricas de uso, sin datos.',
  reseller:   'Aliado white-label. Crea sus propios sub-clientes.',
  contractor: 'Te subcontratan. Acceso total pero temporal.',
};

const VALID_LEVELS = ['managed', 'hosted', 'reseller', 'contractor'];

/**
 * Onboarding rapido: crea tenant + proyecto + token en un solo call.
 */
export const onboardClient = async ({ name, description = '', access_level = 'managed', expires_in_days = null, branding = null }) => {
  const store = tenantStorage.getStore();
  const adminTenantId = store?.tenantId;
  if (!adminTenantId) throw new Error('No se encontro el contexto del tenant admin');
  if (!name) throw new Error('El nombre del negocio es obligatorio');
  if (!VALID_LEVELS.includes(access_level)) throw new Error(`access_level debe ser: ${VALID_LEVELS.join(', ')}`);

  // Contractor requiere fecha de expiracion
  let expiresAt = null;
  if (access_level === 'contractor') {
    const days = expires_in_days || 90; // Default: 90 dias
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  // 1. Crear tenant
  const apiKey = crypto.randomBytes(32).toString('hex');
  const tenantSql = `
    INSERT INTO tenants (name, api_key, managed_by, access_level, access_expires_at, branding)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, name, api_key, managed_by, access_level, access_expires_at, branding, created_at;
  `;
  const tenantResult = await queryRaw(tenantSql, [
    name, apiKey, adminTenantId, access_level,
    expiresAt, branding ? JSON.stringify(branding) : null
  ]);
  const tenant = tenantResult.rows[0];

  // 2. Crear proyecto default para el nuevo tenant
  const publicToken = crypto.randomBytes(16).toString('hex');
  const projectSql = `
    INSERT INTO projects (tenant_id, name, description, public_token)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, public_token;
  `;
  const projectResult = await queryRaw(projectSql, [tenant.id, `${name} - Principal`, description, publicToken]);
  const project = projectResult.rows[0];

  // 3. Registrar evento
  await logEvent('fleet.onboarded', 'tenant', tenant.id, 'admin/fleet', {
    client_name: name,
    access_level,
    project_id: project.id,
    expires_at: expiresAt
  });

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      api_key: tenant.api_key,
      access_level: tenant.access_level,
      access_expires_at: tenant.access_expires_at,
      branding: tenant.branding,
      color: ACCESS_LEVEL_COLORS[access_level],
      description: ACCESS_LEVEL_DESCRIPTIONS[access_level]
    },
    project: {
      id: project.id,
      name: project.name,
      public_token: project.public_token
    },
    managed_by: adminTenantId
  };
};

/**
 * Lista todos los tenants de tu flota (managed_by = tu tenant).
 * Incluye color y descripcion del nivel.
 */
export const getFleet = async () => {
  const store = tenantStorage.getStore();
  const adminTenantId = store?.tenantId;
  if (!adminTenantId) throw new Error('No se encontro el contexto del tenant admin');

  const sql = `
    SELECT
      t.id, t.name, t.access_level, t.access_expires_at, t.branding,
      t.created_at, t.updated_at,
      (SELECT COUNT(*)::int FROM leads l
       JOIN projects p ON l.project_id = p.id
       WHERE p.tenant_id = t.id) AS total_leads,
      (SELECT COUNT(*)::int FROM projects p WHERE p.tenant_id = t.id) AS total_projects,
      (SELECT COUNT(*)::int FROM events e WHERE e.tenant_id = t.id) AS total_events,
      (SELECT MAX(l.created_at) FROM leads l
       JOIN projects p ON l.project_id = p.id
       WHERE p.tenant_id = t.id) AS last_lead_at
    FROM tenants t
    WHERE t.managed_by = $1
    ORDER BY
      CASE t.access_level
        WHEN 'managed' THEN 1
        WHEN 'hosted' THEN 2
        WHEN 'reseller' THEN 3
        WHEN 'contractor' THEN 4
      END,
      t.created_at DESC;
  `;
  const result = await queryRaw(sql, [adminTenantId]);

  // Enriquecer con color y descripcion
  return result.rows.map(t => ({
    ...t,
    color: ACCESS_LEVEL_COLORS[t.access_level],
    level_description: ACCESS_LEVEL_DESCRIPTIONS[t.access_level],
    is_expired: t.access_level === 'contractor' && t.access_expires_at && new Date(t.access_expires_at) < new Date()
  }));
};

/**
 * Detalle de un tenant de tu flota.
 */
export const getFleetTenant = async (tenantId) => {
  const store = tenantStorage.getStore();
  const adminTenantId = store?.tenantId;
  if (!adminTenantId) throw new Error('No se encontro el contexto del tenant admin');

  const sql = `
    SELECT id, name, api_key, access_level, managed_by, access_expires_at, branding, created_at, updated_at
    FROM tenants WHERE id = $1 AND managed_by = $2;
  `;
  const result = await queryRaw(sql, [tenantId, adminTenantId]);
  if (result.rows.length === 0) return null;

  const tenant = result.rows[0];

  // Stats
  const statsSql = `
    SELECT
      (SELECT COUNT(*)::int FROM leads l JOIN projects p ON l.project_id = p.id WHERE p.tenant_id = $1) AS total_leads,
      (SELECT COUNT(*)::int FROM leads l JOIN projects p ON l.project_id = p.id WHERE p.tenant_id = $1 AND l.created_at > NOW() - INTERVAL '24 hours') AS leads_today,
      (SELECT COUNT(*)::int FROM projects p WHERE p.tenant_id = $1) AS total_projects,
      (SELECT COUNT(*)::int FROM events e WHERE e.tenant_id = $1) AS total_events;
  `;
  const statsResult = await queryRaw(statsSql, [tenantId]);

  // Proyectos del tenant
  const projectsSql = `SELECT id, name, public_token, created_at FROM projects WHERE tenant_id = $1 ORDER BY created_at;`;
  const projectsResult = await queryRaw(projectsSql, [tenantId]);

  // Si es reseller, contar sus sub-clientes
  let subClients = null;
  if (tenant.access_level === 'reseller') {
    const subSql = `SELECT COUNT(*)::int as count FROM tenants WHERE managed_by = $1;`;
    const subResult = await queryRaw(subSql, [tenantId]);
    subClients = subResult.rows[0].count;
  }

  return {
    ...tenant,
    color: ACCESS_LEVEL_COLORS[tenant.access_level],
    level_description: ACCESS_LEVEL_DESCRIPTIONS[tenant.access_level],
    is_expired: tenant.access_level === 'contractor' && tenant.access_expires_at && new Date(tenant.access_expires_at) < new Date(),
    stats: statsResult.rows[0],
    projects: projectsResult.rows,
    sub_clients: subClients
  };
};

/**
 * Verifica si el acceso cross-tenant es valido.
 * Contractor: rechaza si expiro.
 * Reseller: rechaza acceso a datos de sub-clientes del reseller.
 */
function checkCrossTenantAccess(tenant) {
  if (tenant.access_level === 'contractor' && tenant.access_expires_at) {
    if (new Date(tenant.access_expires_at) < new Date()) {
      throw new Error('Acceso expirado. El contrato de este tenant ha vencido.');
    }
  }
}

/**
 * Cross-tenant: Lee los leads de un cliente.
 *
 * REGLAS POR NIVEL:
 *   managed    → Acceso full (phone, custom_data, todo)
 *   contractor → Acceso full SI no ha expirado
 *   hosted     → Solo datos enmascarados (phone parcial, sin custom_data)
 *   reseller   → Solo metricas (conteos), no datos individuales
 */
export const getFleetLeads = async (tenantId, filters = {}) => {
  const store = tenantStorage.getStore();
  const adminTenantId = store?.tenantId;
  if (!adminTenantId) throw new Error('No se encontro el contexto del tenant admin');

  // Verificar que es de tu flota
  const checkSql = `SELECT access_level, access_expires_at FROM tenants WHERE id = $1 AND managed_by = $2;`;
  const check = await queryRaw(checkSql, [tenantId, adminTenantId]);
  if (check.rows.length === 0) throw new Error('Tenant no pertenece a tu flota');

  const tenant = check.rows[0];
  checkCrossTenantAccess(tenant);

  const { limit = 50, offset = 0 } = filters;

  // MANAGED o CONTRACTOR (no expirado): acceso total
  if (tenant.access_level === 'managed' || tenant.access_level === 'contractor') {
    const sql = `
      SELECT l.id, l.phone, l.custom_data, l.created_at, l.updated_at, p.name as project_name
      FROM leads l
      JOIN projects p ON l.project_id = p.id
      WHERE p.tenant_id = $1
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const result = await queryRaw(sql, [tenantId, limit, offset]);
    return { access: 'full', leads: result.rows };
  }

  // HOSTED: datos enmascarados
  if (tenant.access_level === 'hosted') {
    const sql = `
      SELECT
        l.id,
        CONCAT(LEFT(l.phone, 4), '****', RIGHT(l.phone, 4)) AS phone,
        l.created_at, l.updated_at,
        p.name as project_name
      FROM leads l
      JOIN projects p ON l.project_id = p.id
      WHERE p.tenant_id = $1
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const result = await queryRaw(sql, [tenantId, limit, offset]);
    return { access: 'masked', leads: result.rows };
  }

  // RESELLER: solo conteos, NUNCA datos individuales
  if (tenant.access_level === 'reseller') {
    const sql = `
      SELECT
        COUNT(*)::int as total_leads,
        COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '24 hours' THEN 1 END)::int AS leads_today,
        COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '7 days' THEN 1 END)::int AS leads_week
      FROM leads l
      JOIN projects p ON l.project_id = p.id
      WHERE p.tenant_id = $1;
    `;
    const result = await queryRaw(sql, [tenantId]);
    return { access: 'stats_only', stats: result.rows[0] };
  }

  throw new Error('Nivel de acceso no reconocido');
};

/**
 * Cross-tenant: Lee los eventos de un cliente.
 *
 * REGLAS POR NIVEL:
 *   managed    → Eventos completos con payload
 *   contractor → Eventos completos SI no ha expirado
 *   hosted     → Solo resumen (conteos por tipo)
 *   reseller   → Solo resumen (conteos por tipo)
 */
export const getFleetEvents = async (tenantId, filters = {}) => {
  const store = tenantStorage.getStore();
  const adminTenantId = store?.tenantId;
  if (!adminTenantId) throw new Error('No se encontro el contexto del tenant admin');

  const checkSql = `SELECT access_level, access_expires_at FROM tenants WHERE id = $1 AND managed_by = $2;`;
  const check = await queryRaw(checkSql, [tenantId, adminTenantId]);
  if (check.rows.length === 0) throw new Error('Tenant no pertenece a tu flota');

  const tenant = check.rows[0];
  checkCrossTenantAccess(tenant);

  const { limit = 50 } = filters;

  // MANAGED o CONTRACTOR: acceso total a eventos
  if (tenant.access_level === 'managed' || tenant.access_level === 'contractor') {
    const sql = `
      SELECT id, entity_type, entity_id, event_type, source, payload, created_at
      FROM events WHERE tenant_id = $1
      ORDER BY created_at DESC LIMIT $2;
    `;
    const result = await queryRaw(sql, [tenantId, limit]);
    return { access: 'full', events: result.rows };
  }

  // HOSTED o RESELLER: solo resumen
  const sql = `
    SELECT event_type, COUNT(*)::int as count, MAX(created_at) as last_at
    FROM events WHERE tenant_id = $1
    GROUP BY event_type ORDER BY count DESC;
  `;
  const result = await queryRaw(sql, [tenantId]);
  return { access: 'summary', event_summary: result.rows };
};

/**
 * Actualiza el access_level de un tenant de tu flota.
 * Si cambia a contractor, se puede pasar expires_in_days.
 */
export const updateFleetAccess = async (tenantId, access_level, expires_in_days = null) => {
  const store = tenantStorage.getStore();
  const adminTenantId = store?.tenantId;
  if (!adminTenantId) throw new Error('No se encontro el contexto del tenant admin');
  if (!VALID_LEVELS.includes(access_level)) throw new Error(`access_level debe ser: ${VALID_LEVELS.join(', ')}`);

  let expiresAt = null;
  if (access_level === 'contractor') {
    const days = expires_in_days || 90;
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const sql = `
    UPDATE tenants SET access_level = $1, access_expires_at = $2, updated_at = NOW()
    WHERE id = $3 AND managed_by = $4
    RETURNING id, name, access_level, access_expires_at;
  `;
  const result = await queryRaw(sql, [access_level, expiresAt, tenantId, adminTenantId]);
  if (result.rows.length === 0) throw new Error('Tenant no pertenece a tu flota');

  await logEvent('fleet.access_changed', 'tenant', tenantId, 'admin/fleet', { access_level, expires_at: expiresAt });

  return {
    ...result.rows[0],
    color: ACCESS_LEVEL_COLORS[access_level],
    level_description: ACCESS_LEVEL_DESCRIPTIONS[access_level]
  };
};

/**
 * Actualiza el branding de un reseller (white-label).
 */
export const updateBranding = async (tenantId, branding) => {
  const store = tenantStorage.getStore();
  const adminTenantId = store?.tenantId;
  if (!adminTenantId) throw new Error('No se encontro el contexto del tenant admin');

  const sql = `
    UPDATE tenants SET branding = $1, updated_at = NOW()
    WHERE id = $2 AND managed_by = $3 AND access_level = 'reseller'
    RETURNING id, name, branding;
  `;
  const result = await queryRaw(sql, [JSON.stringify(branding), tenantId, adminTenantId]);
  if (result.rows.length === 0) throw new Error('Tenant no es un reseller de tu flota');

  await logEvent('fleet.branding_updated', 'tenant', tenantId, 'admin/fleet', { branding });

  return result.rows[0];
};

/**
 * Elimina un tenant de tu flota (y todos sus datos).
 */
export const removeFromFleet = async (tenantId) => {
  const store = tenantStorage.getStore();
  const adminTenantId = store?.tenantId;
  if (!adminTenantId) throw new Error('No se encontro el contexto del tenant admin');

  const checkSql = `SELECT id, name FROM tenants WHERE id = $1 AND managed_by = $2;`;
  const check = await queryRaw(checkSql, [tenantId, adminTenantId]);
  if (check.rows.length === 0) throw new Error('Tenant no pertenece a tu flota');

  // CASCADE elimina projects, leads, events
  const sql = `DELETE FROM tenants WHERE id = $1 RETURNING id, name;`;
  const result = await queryRaw(sql, [tenantId]);

  await logEvent('fleet.removed', 'tenant', tenantId, 'admin/fleet', { name: result.rows[0].name });

  return result.rows[0];
};

/**
 * Retorna el mapa completo de niveles con colores y descripciones.
 * Util para que los dashboards rendericen la UI correctamente.
 */
export const getAccessLevelMap = () => {
  return Object.keys(ACCESS_LEVEL_COLORS).map((level, index) => ({
    level,
    color: ACCESS_LEVEL_COLORS[level],
    description: ACCESS_LEVEL_DESCRIPTIONS[level],
    priority: index + 1, // 1 = mas probable, 5 = menos probable
    can_create_sub_clients: level === 'reseller',
    has_expiry: level === 'contractor',
    data_access: level === 'self' || level === 'managed' ? 'full'
               : level === 'contractor' ? 'full_temporal'
               : level === 'hosted' ? 'masked'
               : level === 'reseller' ? 'stats_only'
               : 'none'
  }));
};

export default {
  onboardClient, getFleet, getFleetTenant,
  getFleetLeads, getFleetEvents,
  updateFleetAccess, updateBranding, removeFromFleet,
  getAccessLevelMap,
  ACCESS_LEVEL_COLORS, ACCESS_LEVEL_DESCRIPTIONS
};
