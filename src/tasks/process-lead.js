import { logEvent } from '../services/event.service.js';

/**
 * TAREA: PROCESAMIENTO DE LEADS
 * Se ejecuta en segundo plano cuando un lead entra al sistema.
 */
export const processLead = async (payload, helpers) => {
  const { leadId, tenantId, phone, source } = payload;
  const { logger } = helpers;

  logger.info(`Procesando Lead: ${leadId} [${source}]`);

  try {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // EVENT LOG
    await logEvent('lead.processed', 'lead', leadId, 'worker/process-lead', { phone, source }, tenantId);

    logger.info(`Lead ${leadId} procesado para Tenant ${tenantId}`);
  } catch (error) {
    logger.error(`Fallo procesamiento Lead ${leadId}: ${error.message}`);
    throw error;
  }
};
