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

async function drainInbox(): Promise<void> {
  await worker.drain();
  await outboundWorker.drain();
  await sendPendingBotDeliveries({ deliver: createBotTransport(), supabase });
}

startWorkerLoop(drainInbox);

console.info(JSON.stringify({ event: 'worker.started', startedAt, mode: 'zernio_inbox_outbox' }));
