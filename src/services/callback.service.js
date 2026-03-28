import db from '../db/index.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';
import { logEvent } from './event.service.js';

/**
 * SERVICIO DE CALLBACKS - AXIS CRM ENGINE
 * Mothership → X-Wing: Notificaciones HTTP a URLs configuradas por proyecto.
 * Cada proyecto puede tener webhooks de salida en su config.callback_urls[].
 * Copyright (c) 2026 Andres Abel Fuentes Esquivel.
 */

/**
 * Envía un callback HTTP POST a las URLs configuradas en el proyecto.
 * No bloquea el flujo principal — errores se logean pero no se propagan.
 */
export const fireCallbacks = async (projectId, eventType, payload, tenantId = null) => {
  try {
    // Obtener las callback_urls del proyecto
    const result = await db.query(
      `SELECT config FROM projects WHERE id = $1`,
      [projectId]
    );

    if (result.rows.length === 0) return;

    const config = result.rows[0].config || {};
    const callbackUrls = config.callback_urls || [];

    if (callbackUrls.length === 0) return;

    const callbackPayload = JSON.stringify({
      event: eventType,
      project_id: projectId,
      timestamp: new Date().toISOString(),
      data: payload
    });

    // Disparar todos los callbacks en paralelo (fire-and-forget)
    const results = await Promise.allSettled(
      callbackUrls.map(url => sendCallback(url, callbackPayload))
    );

    // Logear resultado
    const summary = results.map((r, i) => ({
      url: callbackUrls[i],
      status: r.status,
      error: r.status === 'rejected' ? r.reason?.message : undefined
    }));

    const resolvedTenantId = tenantId || tenantStorage.getStore()?.tenantId;
    if (resolvedTenantId) {
      await logEvent('callback.fired', 'project', projectId, 'system/callbacks', {
        event: eventType,
        targets: summary
      }, resolvedTenantId);
    }

    return summary;
  } catch (error) {
    console.error('Callback service error:', error.message);
    return null;
  }
};

/**
 * Envía un HTTP POST a una URL con timeout de 5 segundos.
 */
async function sendCallback(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'AxisCRM/2.0' },
      body,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return { url, status: response.status, ok: response.ok };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * Registra/actualiza las callback URLs de un proyecto.
 */
export const setCallbackUrls = async (projectId, urls) => {
  if (!Array.isArray(urls)) throw new Error('callback_urls debe ser un array');

  // Validar que son URLs válidas
  for (const url of urls) {
    try { new URL(url); } catch { throw new Error(`URL invalida: ${url}`); }
  }

  const sql = `
    UPDATE projects
    SET config = jsonb_set(
      COALESCE(config, '{}'::jsonb),
      '{callback_urls}',
      $1::jsonb
    ),
    updated_at = NOW()
    WHERE id = $2
    RETURNING id, config;
  `;
  const result = await db.query(sql, [JSON.stringify(urls), projectId]);
  if (result.rows.length === 0) throw new Error('Proyecto no encontrado');

  await logEvent('project.callbacks_updated', 'project', projectId, 'admin/callbacks', { urls });

  return result.rows[0];
};

/**
 * Obtiene las callback URLs de un proyecto.
 */
export const getCallbackUrls = async (projectId) => {
  const result = await db.query('SELECT config FROM projects WHERE id = $1', [projectId]);
  if (result.rows.length === 0) throw new Error('Proyecto no encontrado');
  return result.rows[0].config?.callback_urls || [];
};

export default { fireCallbacks, setCallbackUrls, getCallbackUrls };
