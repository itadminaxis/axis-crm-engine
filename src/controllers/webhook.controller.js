import { upsertLead } from '../services/lead.service.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * CONTROLADOR DE WEBHOOKS - META (WhatsApp/Facebook)
 */

/**
 * Verificación del Hub Token (Requerido por Meta para activar el Webhook).
 */
export const verifyMetaWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      console.log('Webhook de Meta VERIFICADO ✅');
      return res.status(200).send(challenge);
    } else {
      console.error('Fallo en la verificación de Meta: Token incorrecto ❌');
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
};

/**
 * Procesamiento de eventos entrantes de Meta.
 */
export const handleWebhook = async (req, res) => {
  const webhookData = req.body;

  try {
    // Intentar extraer el teléfono del lead de la estructura de Meta
    const phone = webhookData.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id || webhookData.phone;

    if (phone) {
      await upsertLead({
        phone,
        source: 'Meta/WhatsApp',
        ...webhookData
      });
      console.log('Lead de Meta blindado ✅');
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error procesando webhook de Meta:', error.message);
    res.sendStatus(200); 
  }
};
