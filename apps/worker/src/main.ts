import 'dotenv/config';
import { createServerSupabaseClient, supabaseServerEnvironmentSchema } from '@chat-zernio/config';
import { createBotTransport, sendPendingBotDeliveries } from './bot-notifier';
import { createZernioInboxWorker } from './zernio-inbox-worker';
import { createZernioOutboundWorker } from './zernio-outbound-worker';
import { startWorkerLoop } from './worker-loop';

const startedAt = new Date().toISOString();
const worker = createZernioInboxWorker();
const outboundWorker = createZernioOutboundWorker();
const supabase = createServerSupabaseClient(supabaseServerEnvironmentSchema.parse(process.env));

/**
 * Cada cuantos ciclos rapidos se atienden las tareas de maquina.
 *
 * El bot es quien responde las conversaciones: la asesora solo entra cuando hay un problema. Eso
 * convierte su aviso en algo urgente, no en una cola de fondo. Por eso las tareas de maquina van en
 * CADA ciclo y el bot recibe el mensaje en unos cinco segundos.
 *
 * El ahorro de consultas se sostiene en otro sitio: el ciclo esta en 5 segundos en lugar de 2, y la
 * multimedia ya no se re-descarga. Espaciar estas tareas fue un error de criterio: medí el consumo
 * antes de entender como se usa la herramienta.
 */
const CICLOS_ENTRE_TAREAS_DE_MAQUINA = 1;
let ciclosCompletados = 0;

async function drainInbox(): Promise<void> {
  await worker.drain();
  await outboundWorker.drain();
  ciclosCompletados += 1;
  if (ciclosCompletados % CICLOS_ENTRE_TAREAS_DE_MAQUINA === 0) {
    await sendPendingBotDeliveries({ deliver: createBotTransport(), supabase });
  }
}

startWorkerLoop(drainInbox);

console.info(JSON.stringify({ event: 'worker.started', startedAt, mode: 'zernio_inbox_outbox' }));
