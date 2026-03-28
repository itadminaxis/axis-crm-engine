import { logEvent } from '../services/event.service.js';
import db from '../db/index.js';

/**
 * TAREA: RESPUESTA INSTANTÁNEA (SPEED TO LEAD)
 */
export const sendInstantResponse = async (payload, helpers) => {
  const { leadId, phone, tenantId } = payload;
  const { logger } = helpers;

  logger.info(`Speed to Lead: Respondiendo a ${phone}...`);

  try {
    const result = await db.query('SELECT custom_data FROM leads WHERE id = $1', [leadId]);
    const leadData = result.rows[0]?.custom_data;
    const hookMessage = leadData?.ai_insights?.prescription?.hook_message || 'Hola, en un momento te contactamos.';

    // Aquí se integraría WhatsApp Business API (Meta Cloud API / Twilio)
    console.log(`[WHATSAPP SENT] -> ${phone}: "${hookMessage}"`);

    const updateSql = `
      UPDATE leads
      SET custom_data = jsonb_set(custom_data, '{first_response_sent}', 'true'),
          updated_at = NOW()
      WHERE id = $1;
    `;
    await db.query(updateSql, [leadId]);

    // EVENT LOG
    await logEvent('response.sent', 'lead', leadId, 'worker/instant-response', {
      phone, channel: 'whatsapp', message: hookMessage
    }, tenantId);

    logger.info(`Respuesta enviada a ${phone}`);
  } catch (error) {
    logger.error(`Fallo respuesta instantánea: ${error.message}`);
    throw error;
  }
};
