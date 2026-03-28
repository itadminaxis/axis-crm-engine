import pool from '../db/index.js';
import { tenantStorage } from './tenant.middleware.js';

/**
 * Middleware para el endpoint público /api/submit.
 * Valida el x-project-token (token público del proyecto),
 * resuelve el tenant_id y project_id internamente,
 * y ejecuta el request dentro del contexto del tenant.
 *
 * Esto permite que los X-Wings envíen leads SIN exponer la API key maestra.
 */
export const publicSubmitMiddleware = async (req, res, next) => {
  const projectToken = req.headers['x-project-token'];

  if (!projectToken) {
    return res.status(401).json({ error: 'Falta la cabecera x-project-token' });
  }

  // Validar formato: solo hex de 32 caracteres
  if (!/^[a-f0-9]{32}$/.test(projectToken)) {
    return res.status(403).json({ error: 'Token de proyecto inválido' });
  }

  try {
    const result = await pool.pool.query(
      'SELECT p.id as project_id, p.tenant_id, t.name as tenant_name FROM projects p JOIN tenants t ON t.id = p.tenant_id WHERE p.public_token = $1',
      [projectToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Token de proyecto no reconocido' });
    }

    const { project_id, tenant_id, tenant_name } = result.rows[0];

    // Inyectar project_id en el body para que upsertLead lo use
    req.body.project_id = project_id;

    // Ejecutar dentro del contexto del tenant (igual que tenantMiddleware)
    tenantStorage.run({ tenantId: tenant_id, tenantName: tenant_name }, () => {
      next();
    });
  } catch (error) {
    console.error('Error en publicSubmitMiddleware:', error);
    res.status(500).json({ error: 'Error interno al validar el token' });
  }
};
