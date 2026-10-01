import 'dotenv/config';
import { createZernioInboxWorker } from './zernio-inbox-worker';
import { createZernioOutboundWorker } from './zernio-outbound-worker';
import { startWorkerLoop } from './worker-loop';

const startedAt = new Date().toISOString();
const worker = createZernioInboxWorker();
const outboundWorker = createZernioOutboundWorker();

async function drainInbox(): Promise<void> {
  await worker.drain();
  await outboundWorker.drain();
}

startWorkerLoop(drainInbox);

console.info(JSON.stringify({ event: 'worker.started', startedAt, mode: 'zernio_inbox_outbox' }));
