import db from '../db/index.js';
import { tenantStorage } from '../middleware/tenant.middleware.js';
import { logEvent } from './event.service.js';
import { fireCallbacks } from './callback.service.js';
import { broadcast } from './sse.service.js';
import { notifyNewLead } from './notify.service.js';
import { quickAddJob } from 'graphile-worker';
import dotenv from 'dotenv';

dotenv.config();

/**
 * SERVICIO DE LEADS - AXIS CRM ENGINE 🏢
 * Copyright (c) 2026 Andres Abel Fuentes Esquivel.
 */

/**
 * Registra o actualiza un lead (Upsert).
 * Ahora es MODULAR: Solo dispara tareas si el proyecto las tiene encendidas.
 */
export const upsertLead = async (leadData) => {
  const store = tenantStorage.getStore();
  const tenantId = store?.tenantId;

  if (!tenantId) throw new Error('No se encontró el contexto del tenant');

  const { phone, source = 'Directo', project_id, ...otherData } = leadData;
  if (!phone) throw new Error('El teléfono es obligatorio');

  // 1. Obtener configuración modular del proyecto (si existe)
  let projectConfig = {
    enable_ai_prescriptive: true,
    enable_blockchain_seal: true,
    enable_instant_response: true
  };

  if (project_id) {
    const pResult = await db.query('SELECT * FROM projects WHERE id = $1', [project_id]);
    if (pResult.rows.length > 0) {
      projectConfig = pResult.rows[0];
    }
  }

  const interaction = { source, timestamp: new Date().toISOString(), data: otherData };

  const sql = `
    INSERT INTO leads (tenant_id, phone, project_id, custom_data)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (tenant_id, phone)
    DO UPDATE SET 
      project_id = EXCLUDED.project_id,
      custom_data = jsonb_set(
        leads.custom_data || EXCLUDED.custom_data, 
        '{history}', 
        coalesce(leads.custom_data->'history', '[]'::jsonb) || $5::jsonb
      ),
      updated_at = NOW()
    RETURNING id, phone, custom_data, created_at, updated_at;
  `;

  const initialCustomData = { 
    ...otherData, 
    source, 
    status: 'Nuevo', 
    history: [interaction],
    milestones: []
  };

  const result = await db.query(sql, [
    tenantId, 
    phone, 
    project_id || null, 
    JSON.stringify(initialCustomData), 
    JSON.stringify(interaction)
  ]);
  
  const lead = result.rows[0];

  // EVENT LOG: Registrar creación/actualización del lead
  const isNew = new Date(lead.created_at).getTime() === new Date(lead.updated_at).getTime();
  const eventType = isNew ? 'lead.created' : 'lead.updated';
  await logEvent(
    eventType,
    'lead', lead.id, source,
    { phone, project_id, source, metadata: otherData.metadata }
  );

  // FASE 4: SSE broadcast a dashboards conectados en tiempo real
  broadcast(tenantId, eventType, { lead_id: lead.id, phone, source, project_id });

  // NOTIFICACION: email al admin cuando entra un lead nuevo
  if (isNew) {
    let projectName = null;
    let tenantName  = null;
    if (project_id) {
      try {
        const pRes = await db.query(
          `SELECT p.name as project_name, t.name as tenant_name
           FROM projects p JOIN tenants t ON t.id = p.tenant_id
           WHERE p.id = $1`, [project_id]
        );
        if (pRes.rows.length > 0) {
          projectName = pRes.rows[0].project_name;
          tenantName  = pRes.rows[0].tenant_name;
        }
      } catch (_) {}
    }
    notifyNewLead({
      phone,
      source,
      projectName,
      tenantName,
      leadId:     lead.id,
      customData: lead.custom_data
    }).catch(() => {});
  }

  // FASE 4: Callback HTTP al X-Wing (si tiene URLs configuradas)
  if (project_id) {
    fireCallbacks(project_id, eventType, { lead_id: lead.id, phone, source }).catch(() => {});
  }

  // 2. DISPARO MODULAR DE TAREAS (ENCENDER/APAGAR)
  try {
    const workerConfig = { connectionString: process.env.DATABASE_URL };
    
    // Tarea base siempre activa
    await quickAddJob(workerConfig, 'process-lead', { leadId: lead.id, tenantId, phone: lead.phone, source });

    // Módulo IA Prescriptiva
    if (projectConfig.enable_ai_prescriptive) {
      await quickAddJob(workerConfig, 'semantic-analysis', { leadId: lead.id, tenantId, phone: lead.phone });
    }

    // Módulo Respuesta Instantánea
    if (projectConfig.enable_instant_response) {
      await quickAddJob(workerConfig, 'send-instant-response', { leadId: lead.id, phone: lead.phone, tenantId });
    }
    
    console.log(`Búnker Modular: Tareas procesadas para el Lead ${lead.id} 🚜`);
  } catch (err) {
    console.error('Error Worker Queue:', err.message);
  }
  
  return lead;
};

export const getLeads = async (filters = {}) => {
  const { limit = 50, offset = 0, search = '', project_id } = filters;
  let sql = `SELECT id, phone, custom_data, created_at, updated_at FROM leads WHERE 1=1`;
  const params = [];

  if (project_id) {
    params.push(project_id);
    sql += ` AND project_id = $${params.length}`;
  }

  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (phone ILIKE $${params.length} OR custom_data::text ILIKE $${params.length})`;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await db.query(sql, params);
  return result.rows;
};

export const getLeadById = async (id) => {
  const sql = `SELECT id, phone, custom_data, created_at, updated_at FROM leads WHERE id = $1`;
  const result = await db.query(sql, [id]);
  return result.rows[0];
};

/**
 * Registra un hito en el viaje del cliente (Timeline).
 */
export const addMilestone = async (leadId, type, details = {}) => {
  const milestone = { type, timestamp: new Date().toISOString(), details };
  const sql = `
    UPDATE leads 
    SET custom_data = jsonb_set(
      custom_data, 
      '{milestones}', 
      coalesce(custom_data->'milestones', '[]'::jsonb) || $2::jsonb
    ),
    updated_at = NOW()
    WHERE id = $1
    RETURNING id, custom_data->'milestones' as milestones;
  `;
  const result = await db.query(sql, [leadId, JSON.stringify(milestone)]);

  // EVENT LOG: Registrar milestone
  await logEvent('milestone.added', 'lead', leadId, 'leads/milestone', { type, details });

  return result.rows[0];
};

/**
 * Recupera el historial completo del lead.
 */
export const getClientJourney = async (leadId) => {
  const lead = await getLeadById(leadId);
  if (!lead) return null;
  return {
    phone: lead.phone,
    history: lead.custom_data.history || [],
    milestones: lead.custom_data.milestones || []
  };
};

export default { upsertLead, getLeads, getLeadById, addMilestone, getClientJourney };
