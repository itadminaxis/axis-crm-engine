/**
 * SERVICIO SSE (Server-Sent Events) - AXIS CRM ENGINE
 * Canal en tiempo real: Mothership → Dashboards / X-Wings
 * Cada tenant tiene su propio canal aislado.
 * Copyright (c) 2026 Andres Abel Fuentes Esquivel.
 */

// Map<tenantId, Set<Response>>
const channels = new Map();

/**
 * Registra un cliente SSE en el canal de su tenant.
 */
export const addClient = (tenantId, res) => {
  if (!channels.has(tenantId)) {
    channels.set(tenantId, new Set());
  }
  channels.get(tenantId).add(res);

  // Limpiar cuando se desconecta
  res.on('close', () => {
    const set = channels.get(tenantId);
    if (set) {
      set.delete(res);
      if (set.size === 0) channels.delete(tenantId);
    }
  });
};

/**
 * Envía un evento a todos los clientes conectados de un tenant.
 * Formato SSE estándar: event + data + id.
 */
export const broadcast = (tenantId, eventType, data) => {
  const set = channels.get(tenantId);
  if (!set || set.size === 0) return 0;

  const payload = JSON.stringify(data);
  const message = `event: ${eventType}\ndata: ${payload}\nid: ${Date.now()}\n\n`;

  let sent = 0;
  for (const client of set) {
    try {
      client.write(message);
      sent++;
    } catch (e) {
      // Cliente muerto, limpiar
      set.delete(client);
    }
  }
  return sent;
};

/**
 * Cantidad de clientes conectados por tenant.
 */
export const getClientCount = (tenantId) => {
  return channels.get(tenantId)?.size || 0;
};

/**
 * Stats globales de conexiones SSE.
 */
export const getStats = () => {
  let total = 0;
  const tenants = [];
  for (const [tenantId, set] of channels) {
    total += set.size;
    tenants.push({ tenantId, clients: set.size });
  }
  return { total, tenants };
};

export default { addClient, broadcast, getClientCount, getStats };
