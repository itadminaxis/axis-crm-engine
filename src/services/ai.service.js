/**
 * CEREBRO PRESCRIPTIVO - AI SERVICE
 * Motor de análisis semántico, predictivo y PRESCRIPTIVO.
 * Powered by Anthropic Claude (claude-haiku-4-5) con fallback heurístico.
 * Copyright (c) 2026 Andres Abel Fuentes Esquivel.
 */

import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// HEURISTIC SCORING (fallback determinístico, sin aleatoriedad)
// ---------------------------------------------------------------------------

/**
 * Calcula un puntaje determinístico basado en señales del lead.
 * Se usa cuando ANTHROPIC_API_KEY no está configurada o la API falla.
 */
const computeHeuristicScore = (leadData) => {
  const { phone, nombre, email, source } = leadData;
  let score = 35; // base

  // Señal: fuente del lead
  const src = (source || '').toUpperCase();
  if (src.includes('WHATSAPP'))    score += 25;
  else if (src.includes('GOOGLE')) score += 20;
  else if (src.includes('LINKEDIN')) score += 15;
  else if (src.includes('MANUAL')) score -= 5;

  // Señal: hora del día (horario laboral 09:00–18:00 = +10)
  const hour = new Date().getHours();
  if (hour >= 9 && hour < 18) score += 10;

  // Señal: presencia de datos de contacto
  if (phone)  score += 15;
  if (email)  score += 10;
  if (nombre) score += 5;

  // Clamp 0–100
  return Math.min(100, Math.max(0, score));
};

// ---------------------------------------------------------------------------
// CLASSIFICATION HELPERS
// ---------------------------------------------------------------------------

const classifyScore = (score) => {
  if (score >= 80) return 'HOT';
  if (score >= 50) return 'WARM';
  return 'COLD';
};

const buildPrescription = (status) => {
  switch (status) {
    case 'HOT':
      return {
        action: 'DIRECT_CLOSING_CALL',
        channel: 'PHONE',
        urgency: 'IMMEDIATE',
        reason: 'Lead de alto interés con señales de compra inmediata.',
        hook_message: '¡Excelente elección! Tenemos una oferta exclusiva para esta unidad. ¿Te gustaría agendar un tour 3D ahora mismo?'
      };
    case 'WARM':
      return {
        action: 'WHATSAPP_FOLLOWUP',
        channel: 'WHATSAPP',
        urgency: 'HIGH',
        reason: 'Lead con interés moderado, requiere seguimiento en 2 horas.',
        hook_message: 'Hola, vimos que te interesó nuestra propiedad. Te compartimos información personalizada. ¿Tienes 5 minutos para platicar?'
      };
    default: // COLD
      return {
        action: 'NURTURE_CONTENT',
        channel: 'EMAIL',
        urgency: 'LOW',
        reason: 'Lead en etapa inicial, requiere maduración con contenido de valor.',
        hook_message: '¡Gracias por tu interés! Hemos preparado una guía exclusiva con las mejores opciones de inversión inmobiliaria para ti.'
      };
  }
};

// ---------------------------------------------------------------------------
// HEURISTIC FALLBACK
// ---------------------------------------------------------------------------

const heuristicAnalysis = (leadData) => {
  const score = computeHeuristicScore(leadData);
  const status = classifyScore(score);
  const prescription = buildPrescription(status);

  return {
    prediction: { score: score.toFixed(2), status },
    prescription,
    metadata: {
      analyzed_at: new Date().toISOString(),
      engine: 'heuristic'
    }
  };
};

// ---------------------------------------------------------------------------
// CLAUDE AI ANALYSIS
// ---------------------------------------------------------------------------

const claudeAnalysis = async (leadData) => {
  const { phone, nombre, email, source, project_id, custom_data } = leadData;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const hour = new Date().getHours();
  const businessHours = hour >= 9 && hour < 18;

  const prompt = `Eres un experto en calificación de leads inmobiliarios. Analiza este lead y responde SOLO con un JSON válido, sin texto adicional.

Lead:
- Nombre: ${nombre || 'No proporcionado'}
- Teléfono: ${phone ? 'Sí' : 'No'}
- Email: ${email ? 'Sí' : 'No'}
- Fuente: ${source || 'Desconocida'}
- Proyecto: ${project_id || 'No especificado'}
- Hora de contacto: ${hour}:00 (${businessHours ? 'horario laboral' : 'fuera de horario laboral'})
- Datos adicionales: ${custom_data ? JSON.stringify(custom_data).substring(0, 200) : 'Ninguno'}

Criterios de puntuación (0-100):
- Fuente: WHATSAPP +25, GOOGLE_ADS +20, LINKEDIN +15, MANUAL -5
- Horario laboral (09-18h): +10
- Tiene teléfono: +15
- Tiene email: +10
- Tiene nombre: +5

Clasificación: HOT (80-100), WARM (50-79), COLD (0-49)

Responde ÚNICAMENTE con este JSON:
{
  "score": <número 0-100>,
  "status": "<HOT|WARM|COLD>",
  "action": "<acción recomendada>",
  "reason": "<razón breve en español>",
  "hook_message": "<mensaje de enganche en español para sector inmobiliario>"
}`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }]
  });

  const rawText = message.content[0].text.trim();

  // Extract JSON — handle cases where the model wraps it in markdown
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate required fields
  const { score, status, action, reason, hook_message } = parsed;
  if (typeof score !== 'number' || !['HOT', 'WARM', 'COLD'].includes(status)) {
    throw new Error('Claude returned invalid score or status');
  }

  // Determine channel and urgency from status
  const basePrescription = buildPrescription(status);

  return {
    prediction: {
      score: parseFloat(score).toFixed(2),
      status
    },
    prescription: {
      action: action || basePrescription.action,
      channel: basePrescription.channel,
      urgency: basePrescription.urgency,
      reason: reason || basePrescription.reason,
      hook_message: hook_message || basePrescription.hook_message
    },
    metadata: {
      analyzed_at: new Date().toISOString(),
      engine: 'claude-haiku'
    }
  };
};

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Analiza un lead y genera una prescripción de próxima mejor acción.
 *
 * @param {Object} leadData - { phone, nombre, email, source, project_id, custom_data }
 * @returns {Object} { prediction, prescription, metadata }
 */
export const analyzeAndPrescribe = async (leadData) => {
  console.log('Ejecutando Inteligencia Prescriptiva...');

  // If no API key is configured, skip straight to heuristic
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY no configurada. Usando motor heurístico.');
    return heuristicAnalysis(leadData);
  }

  try {
    const result = await claudeAnalysis(leadData);
    console.log(`Analisis completado con Claude Haiku. Score: ${result.prediction.score} (${result.prediction.status})`);
    return result;
  } catch (err) {
    console.error(`Error en Claude API, usando fallback heurístico: ${err.message}`);
    return heuristicAnalysis(leadData);
  }
};

export default {
  analyzeAndPrescribe
};
