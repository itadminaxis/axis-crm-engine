import { run } from 'graphile-worker';
import dotenv from 'dotenv';
import { processLead } from './tasks/process-lead.js';
import { semanticAnalysisTask } from './tasks/semantic-analysis.js';
import { sendInstantResponse } from './tasks/send-instant-response.js';
import { monthlyDigest } from './tasks/monthly-digest.js';

dotenv.config();

/**
 * MOTOR DE TRABAJADORES (WORKER) - AXIS CRM ENGINE 🚜
 * Copyright (c) 2026 Andres Abel Fuentes Esquivel.
 *
 * Tareas registradas:
 *   process-lead          — Procesamiento base de cada lead entrante
 *   semantic-analysis     — IA prescriptiva (análisis de perfil)
 *   send-instant-response — Speed to Lead (respuesta WhatsApp automática)
 *   monthly-digest        — Reporte mensual por email a cada tenant (día 1 a las 8am MTY)
 */
async function main() {
  console.log('Iniciando Graphile Worker... 🚜');

  const runner = await run({
    connectionString: process.env.DATABASE_URL,
    concurrency: 5,
    pollInterval: 1000,
    taskList: {
      'process-lead':          processLead,
      'semantic-analysis':     semanticAnalysisTask,
      'send-instant-response': sendInstantResponse,
      'monthly-digest':        monthlyDigest,
    },
    // ── CRON ─────────────────────────────────────────────────────────────────
    // Formato graphile-worker: [min] [hour] [day] [month] [weekday] [task]
    // @timezone aplica a todas las reglas del bloque.
    crontab: `
# @timezone America/Monterrey
# Digest mensual: día 1 de cada mes a las 8:00am hora Monterrey
0 8 1 * * monthly-digest ?max_attempts=3&backfillPeriod=2h
    `
  });

  console.log('Worker activo ✅  (Predictivo 🧠 · Speed-to-Lead ⚡ · Digest mensual 📊)');
  await runner.promise;
}

main().catch((err) => {
  console.error('Error fatal en el Worker:', err);
  process.exit(1);
});
