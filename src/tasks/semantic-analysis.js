import { analyzeAndPrescribe } from '../services/ai.service.js';
import { logEvent } from '../services/event.service.js';
import db from '../db/index.js';

/**
 * TAREA: ANÁLISIS SEMÁNTICO Y PRESCRIPTIVO
 */
export const semanticAnalysisTask = async (payload, helpers) => {
  const { leadId, tenantId } = payload;
  const { logger } = helpers;

  logger.info(`Análisis Prescriptivo para Lead: ${leadId}`);

  try {
    const result = await db.query('SELECT custom_data FROM leads WHERE id = $1', [leadId]);
    const leadData = result.rows[0]?.custom_data;

    if (!leadData) throw new Error('Lead sin datos');

    const resultAI = await analyzeAndPrescribe(leadData);

    const sql = `
      UPDATE leads
      SET custom_data = custom_data || $1::jsonb,
          updated_at = NOW()
      WHERE id = $2;
    `;

    const enrichedData = {
      ai_insights: {
        prediction: resultAI.prediction,
        prescription: resultAI.prescription,
        metadata: resultAI.metadata
      }
    };

    await db.query(sql, [JSON.stringify(enrichedData), leadId]);

    // EVENT LOG
    await logEvent('ai.prescription', 'lead', leadId, 'worker/semantic-analysis', {
      prediction: resultAI.prediction,
      action: resultAI.prescription?.action
    }, tenantId);

    logger.info(`Lead ${leadId} analizado y prescrito`);
  } catch (error) {
    logger.error(`Fallo Prescriptivo: ${error.message}`);
    throw error;
  }
};
