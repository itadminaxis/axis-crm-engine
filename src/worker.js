import { run } from 'graphile-worker';
import dotenv from 'dotenv';
import { processLead } from './tasks/process-lead.js';
import { semanticAnalysisTask } from './tasks/semantic-analysis.js';
import { sendInstantResponse } from './tasks/send-instant-response.js'; // Nuevo: Speed to Lead ⚡

dotenv.config();

/**
 * MOTOR DE TRABAJADORES (WORKER) - AXIS CRM ENGINE 🚜
 * Copyright (c) 2026 Andres Abel Fuentes Esquivel.
 */
async function main() {
  console.log('Iniciando Graphile Worker... 🚜 (Cerebro Predictivo y Speed to Lead Activos 🧠⚡)');

  const runner = await run({
    connectionString: process.env.DATABASE_URL,
    concurrency: 5,
    pollInterval: 1000,
    taskList: {
      'process-lead': processLead,
      'semantic-analysis': semanticAnalysisTask,
      'send-instant-response': sendInstantResponse, // Registrar la tarea de respuesta instantánea
    },
  });

  console.log('Worker activo y escuchando tareas en la bodega PostgreSQL ✅');
  await runner.promise;
}

main().catch((err) => {
  console.error('Error fatal en el Worker:', err);
  process.exit(1);
});
