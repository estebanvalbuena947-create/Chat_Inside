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
 * El ciclo rapido existe para la atencion al cliente: recibir y enviar. Las colas internas —el aviso
 * al bot, y mas adelante las conversiones— no son urgentes, y cada ciclo cuesta consultas en
 * Supabase (que ademas se registran). Atenderlas cada quince vueltas las reduce un 93% sin que nadie
 * note la diferencia: unos treinta segundos.
 */
const CICLOS_ENTRE_TAREAS_DE_MAQUINA = 15;
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
