import { AsyncLocalStorage } from 'node:async_hooks';
import pool from '../db/index.js';

// Almacenamiento local asíncrono para mantener el contexto del tenant en todo el hilo de ejecución
export const tenantStorage = new AsyncLocalStorage();

/**
 * Middleware para identificar al tenant mediante la cabecera x-api-key.
 * Valida la existencia del tenant en la DB y guarda su ID en el contexto seguro.
 */
export const tenantMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'Falta la cabecera x-api-key' });
  }

  try {
    // Buscar el tenant por su API Key
    const result = await pool.query(
      'SELECT id, name FROM tenants WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'API Key inválida o negocio no registrado' });
    }

    const tenant = result.rows[0];

    // Ejecutar el resto de la petición dentro del contexto del AsyncLocalStorage
    tenantStorage.run({ tenantId: tenant.id, tenantName: tenant.name }, () => {
      next();
    });
  } catch (error) {
    console.error('Error en tenantMiddleware:', error);
    res.status(500).json({ error: 'Error interno al identificar el negocio' });
  }
};
