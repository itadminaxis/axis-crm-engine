import db from '../db/index.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';
import { broadcast } from './sse.service.js';

/**
 * SERVICIO DE EVENTOS - AXIS CRM ENGINE
 * Audit trail inmutable. Cada acción del sistema se registra aquí.
 * Fase 4: Cada evento registrado se transmite en tiempo real via SSE.
 */

/**
 * Registra un evento en el log.
 * Se puede llamar desde cualquier punto del sistema.
 * Obtiene el tenant_id del contexto async (AsyncLocalStorage).
 * Si se pasa tenantId explícito (ej. desde workers), lo usa directamente.
 */
export const logEvent = async (eventType, entityType, entityId, source, payload = {}, tenantIdOverride = null) => {
  try {
    const store = tenantStorage.getStore();
    const tenantId = tenantIdOverride || store?.tenantId;

    if (!tenantId) {
      console.warn('Event log: No tenant context, evento no registrado:', eventType);
      return null;
    }

    const sql = `
      INSERT INTO events (tenant_id, entity_type, entity_id, event_type, source, payload)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, event_type, created_at;
    `;

    const result = await db.query(sql, [
      tenantId,
      entityType,
      entityId || null,
      eventType,
      source || null,
      JSON.stringify(payload)
    ]);

    const event = result.rows[0];

    // FASE 4: Broadcast SSE en tiempo real a dashboards conectados
    if (event) {
      try {
        broadcast(tenantId, eventType, {
          id: event.id,
          event_type: eventType,
          entity_type: entityType,
          entity_id: entityId,
          source,
          payload,
          created_at: event.created_at
        });
      } catch (e) {
        // SSE no debe bloquear el flujo
      }
    }

    return event;
  } catch (error) {
    // No lanzar error para no romper el flujo principal
    console.error('Event log error:', error.message);
    return null;
  }
};

/**
 * Consulta eventos con filtros.
 */
export const getEvents = async (filters = {}) => {
  const { entity_id, entity_type, event_type, since, until, limit = 100, offset = 0 } = filters;

  let sql = 'SELECT id, entity_type, entity_id, event_type, source, payload, created_at FROM events WHERE 1=1';
  const params = [];

  if (entity_id) {
    params.push(entity_id);
    sql += ` AND entity_id = $${params.length}`;
  }

  if (entity_type) {
    params.push(entity_type);
    sql += ` AND entity_type = $${params.length}`;
  }

  if (event_type) {
    params.push(event_type);
    sql += ` AND event_type = $${params.length}`;
  }

  if (since) {
    params.push(since);
    sql += ` AND created_at >= $${params.length}`;
  }

  if (until) {
    params.push(until);
    sql += ` AND created_at <= $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await db.query(sql, params);
  return result.rows;
};

/**
 * Timeline completo de una entidad (lead, proyecto, etc).
 */
export const getEntityTimeline = async (entityId) => {
  const sql = `
    SELECT id, entity_type, event_type, source, payload, created_at
    FROM events
    WHERE entity_id = $1
    ORDER BY created_at ASC;
  `;

  const result = await db.query(sql, [entityId]);
  return result.rows;
};

export default { logEvent, getEvents, getEntityTimeline };
