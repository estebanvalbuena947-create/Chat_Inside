import 'dotenv/config';
import { createServerSupabaseClient, supabaseServerEnvironmentSchema } from '@chat-zernio/config';
import { createBotTransport, sendPendingBotDeliveries } from './bot-notifier';
import {
  createZernioTransport as createConversionTransport,
  sendPendingConversions
} from './conversion-sender';
import { createZernioInboxWorker } from './zernio-inbox-worker';
import { createZernioOutboundWorker } from './zernio-outbound-worker';
import { createTapNotificationWorker } from './tap-notification-worker';
import { startWorkerLoop } from './worker-loop';

const startedAt = new Date().toISOString();
const worker = createZernioInboxWorker();
const outboundWorker = createZernioOutboundWorker();
// Sin webhook configurado no hay despachador: los toques se guardan y el motivo queda registrado.
const tapWorker = createTapNotificationWorker();
// Sin llave del proveedor no hay a quien entregar las conversiones: se dejan en la cola, con su
// motivo, en lugar de fallar en cada ciclo.
const zernioApiKey = process.env.ZERNIO_API_KEY;
const conversionTransport = zernioApiKey ? createConversionTransport(zernioApiKey) : null;
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
  // Los avisos a n8n son un efecto distinto del envio: su cola se drena aparte.
  if (tapWorker) await tapWorker.drain();
  // Las conversiones hacia Meta son otro efecto distinto y otra cola: se drenan aqui para que el
  // hecho de negocio no espere nunca al proveedor, y su entrega no dependa de la bandeja.
  if (conversionTransport) {
    await sendPendingConversions({ supabase, transport: conversionTransport });
  }
  ciclosCompletados += 1;
  if (ciclosCompletados % CICLOS_ENTRE_TAREAS_DE_MAQUINA === 0) {
    await sendPendingBotDeliveries({ deliver: createBotTransport(), supabase });
  }
}

startWorkerLoop(drainInbox);

console.info(JSON.stringify({ event: 'worker.started', startedAt, mode: 'zernio_inbox_outbox' }));
