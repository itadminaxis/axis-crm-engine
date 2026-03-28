import db from '../db/index.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';
import { logEvent } from './event.service.js';
import crypto from 'crypto';

/**
 * SERVICIO DE PROYECTOS (X-WINGS) - AXIS CRM ENGINE
 * CRUD completo + estadísticas por proyecto.
 * Copyright (c) 2026 Andres Abel Fuentes Esquivel.
 */

/**
 * Lista todos los proyectos del tenant con estadísticas de leads.
 */
export const getProjects = async () => {
  const sql = `
    SELECT
      p.id, p.name, p.description, p.public_token,
      p.enable_ai_prescriptive, p.enable_blockchain_seal,
      p.enable_3d_immersive, p.enable_payments, p.enable_instant_response,
      p.config, p.created_at, p.updated_at,
      COUNT(l.id)::int AS total_leads,
      COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '24 hours' THEN 1 END)::int AS leads_today,
      COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '7 days' THEN 1 END)::int AS leads_week
    FROM projects p
    LEFT JOIN leads l ON l.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC;
  `;
  const result = await db.query(sql);
  return result.rows;
};

/**
 * Obtiene un proyecto por ID con stats detalladas.
 */
export const getProjectById = async (id) => {
  const sql = `
    SELECT
      p.id, p.name, p.description, p.public_token,
      p.enable_ai_prescriptive, p.enable_blockchain_seal,
      p.enable_3d_immersive, p.enable_payments, p.enable_instant_response,
      p.config, p.created_at, p.updated_at,
      COUNT(l.id)::int AS total_leads,
      COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '24 hours' THEN 1 END)::int AS leads_today,
      COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '7 days' THEN 1 END)::int AS leads_week
    FROM projects p
    LEFT JOIN leads l ON l.project_id = p.id
    WHERE p.id = $1
    GROUP BY p.id;
  `;
  const result = await db.query(sql, [id]);
  return result.rows[0] || null;
};

/**
 * Crea un nuevo proyecto (X-Wing) y genera su public_token.
 */
export const createProject = async ({ name, description = '', config = {} }) => {
  const store = tenantStorage.getStore();
  const tenantId = store?.tenantId;
  if (!tenantId) throw new Error('No se encontro el contexto del tenant');
  if (!name) throw new Error('El nombre del proyecto es obligatorio');

  const publicToken = crypto.randomBytes(16).toString('hex');

  const sql = `
    INSERT INTO projects (tenant_id, name, description, public_token, config)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const result = await db.query(sql, [tenantId, name, description, publicToken, JSON.stringify(config)]);
  const project = result.rows[0];

  await logEvent('project.created', 'project', project.id, 'admin/projects', { name, description });

  return project;
};

/**
 * Actualiza la configuracion de modulos de un proyecto.
 */
export const updateProjectConfig = async (id, updates) => {
  const { name, description, enable_ai_prescriptive, enable_instant_response,
          enable_blockchain_seal, enable_3d_immersive, enable_payments, config } = updates;

  const fields = [];
  const params = [];
  let idx = 1;

  if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name); }
  if (description !== undefined) { fields.push(`description = $${idx++}`); params.push(description); }
  if (enable_ai_prescriptive !== undefined) { fields.push(`enable_ai_prescriptive = $${idx++}`); params.push(enable_ai_prescriptive); }
  if (enable_instant_response !== undefined) { fields.push(`enable_instant_response = $${idx++}`); params.push(enable_instant_response); }
  if (enable_blockchain_seal !== undefined) { fields.push(`enable_blockchain_seal = $${idx++}`); params.push(enable_blockchain_seal); }
  if (enable_3d_immersive !== undefined) { fields.push(`enable_3d_immersive = $${idx++}`); params.push(enable_3d_immersive); }
  if (enable_payments !== undefined) { fields.push(`enable_payments = $${idx++}`); params.push(enable_payments); }
  if (config !== undefined) { fields.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }

  if (fields.length === 0) throw new Error('No hay campos para actualizar');

  fields.push('updated_at = NOW()');
  params.push(id);

  const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *;`;
  const result = await db.query(sql, params);

  if (result.rows.length === 0) throw new Error('Proyecto no encontrado');

  await logEvent('project.updated', 'project', id, 'admin/projects', { updates: Object.keys(updates) });

  return result.rows[0];
};

/**
 * Regenera el public_token de un proyecto.
 */
export const regenerateToken = async (id) => {
  const newToken = crypto.randomBytes(16).toString('hex');
  const sql = `UPDATE projects SET public_token = $1, updated_at = NOW() WHERE id = $2 RETURNING id, public_token;`;
  const result = await db.query(sql, [newToken, id]);
  if (result.rows.length === 0) throw new Error('Proyecto no encontrado');

  await logEvent('project.token_regenerated', 'project', id, 'admin/projects', {});

  return result.rows[0];
};

/**
 * Elimina un proyecto.
 */
export const deleteProject = async (id) => {
  const sql = `DELETE FROM projects WHERE id = $1 RETURNING id, name;`;
  const result = await db.query(sql, [id]);
  if (result.rows.length === 0) throw new Error('Proyecto no encontrado');

  await logEvent('project.deleted', 'project', id, 'admin/projects', { name: result.rows[0].name });

  return result.rows[0];
};

/**
 * Stats globales del tenant (todos los proyectos).
 */
export const getTenantStats = async () => {
  const sql = `
    SELECT
      (SELECT COUNT(*)::int FROM projects) AS total_projects,
      (SELECT COUNT(*)::int FROM leads) AS total_leads,
      (SELECT COUNT(*)::int FROM leads WHERE created_at > NOW() - INTERVAL '24 hours') AS leads_today,
      (SELECT COUNT(*)::int FROM leads WHERE created_at > NOW() - INTERVAL '7 days') AS leads_week,
      (SELECT COUNT(*)::int FROM events) AS total_events;
  `;
  const result = await db.query(sql);
  return result.rows[0];
};

export default { getProjects, getProjectById, createProject, updateProjectConfig, regenerateToken, deleteProject, getTenantStats };
