import process from 'node:process';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers';
import { log } from 'node:console';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { build } = createRequire(createRequire(webRequire.resolve('vitest/config')).resolve('vite'))(
  'esbuild'
);
const { chromium } = require(process.argv[2] ?? 'playwright');
const root = process.cwd();
const out = path.join(os.tmpdir(), 'ui-chat-reservas-review');
fs.mkdirSync(out, { recursive: true });
const source = path.join(root, 'apps/web/app/reservas/page.tsx');
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import Panel from ${JSON.stringify(source)}; createRoot(document.getElementById('root')).render(React.createElement(Panel));`,
    resolveDir: path.join(root, 'apps/web'),
    loader: 'jsx'
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  plugins: [
    {
      name: 'navigation-fixture',
      setup(builder) {
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: 'navigation',
          namespace: 'fixture'
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `export const usePathname = () => '/';`
        }));
      }
    }
  ]
});
const drafts = [
  {
    id: 1,
    nombre: 'Pendiente de hoy',
    creadaEn: '2026-10-20T08:00:00Z',
    estado: 'pendiente_pago',
    estadoMostrado: 'pending'
  },
  {
    id: 2,
    nombre: 'Revisión de ayer',
    creadaEn: '2026-10-19T08:00:00Z',
    estado: 'requiere_revision_pago',
    estadoMostrado: 'review'
  },
  {
    id: 3,
    nombre: 'Cancelación de hoy',
    creadaEn: '2026-10-20T09:00:00Z',
    estado: 'cancelando_expirada',
    estadoMostrado: 'rejected',
    estadoEtiqueta: 'Cancelación por vencimiento'
  },
  {
    id: 4,
    nombre: 'Histórica sin creación',
    creadaEn: null,
    estado: 'pendiente_pago',
    estadoMostrado: 'pending'
  }
].map((row) => ({ ...row, servicio: 'Servicio de prueba', monto: 100, horarioProgramado: null }));
let fail = false;
const requests = [];
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/bundle.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(bundle.outputFiles[0].text);
    return;
  }
  if (url.pathname === '/style.css') {
    response.setHeader('content-type', 'text/css');
    response.end(fs.readFileSync('apps/web/app/globals.css'));
    return;
  }
  if (url.pathname === '/api/reservations/board') {
    requests.push(url.search);
    response.setHeader('content-type', 'application/json');
    const date = url.searchParams.get('date') ?? '2026-10-20';
    const all = url.searchParams.get('draftScope') === 'all';
    const ids = date === '2026-10-20' ? [1, 3] : date === '2026-10-19' ? [2] : [];
    const created = drafts.filter((row) => ids.includes(row.id));
    const manageable = (all ? drafts : created).filter((row) => [1, 2, 4].includes(row.id));
    const body = {
      actualizadoEn: '2026-10-20T18:00:00Z',
      operationalDate: date,
      draftScope: all ? 'all' : 'day',
      sinFechaCreacion: 1,
      preReservas: drafts,
      creadasHoy: created,
      porGestionar: manageable,
      confirmadas: [],
      confirmadasHoy: [],
      citasAgendadasFecha: [],
      comprobantes: [],
      decisiones: [],
      dailyDrafts: [{ date, total: created.length }],
      kpis: {
        porGestionar: manageable.length,
        confirmadasHoy: 0,
        montoConfirmadoHoy: 0,
        comprobantesPorRevisar: 0,
        retencionesPorVencer: []
      }
    };
    if (fail) {
      response.statusCode = 503;
      response.end(JSON.stringify({ error: 'Fallo de reservas de prueba' }));
      return;
    }
    setTimeout(() => response.end(JSON.stringify(body)), date === '2026-10-19' ? 180 : 0);
    return;
  }
  response.setHeader('content-type', 'text/html');
  response.end(
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    timezoneId: 'Asia/Tokyo'
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  const count = page
    .locator('.reservations-cards article')
    .filter({ hasText: 'Pre-reservas por gestionar' })
    .locator('strong');
  await count.filter({ hasText: /^1$/ }).waitFor();
  assert.equal(await page.locator('.reservations-table tbody tr').count(), 1);
  await page.screenshot({ path: path.join(out, 'reservas-hoy-desktop.png'), fullPage: true });
  await page.getByRole('checkbox', { name: 'Ver prerreservas de todos los días' }).check();
  await count.filter({ hasText: /^3$/ }).waitFor();
  await page.getByText('Sin fecha de creación', { exact: true }).waitFor();
  assert(requests.some((query) => query.includes('draftScope=all')));
  const calendar = page.locator('input[type=date]');
  const slowStarted = page.waitForRequest((request) => request.url().includes('date=2026-10-19'));
  await calendar.fill('2026-10-19');
  await slowStarted;
  await calendar.fill('2026-10-18');
  await count.filter({ hasText: /^0$/ }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await count.textContent(), '0');
  assert.equal(await page.locator('.reservations-table tbody tr').count(), 0);
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await count.filter({ hasText: /^1$/ }).waitFor();
  fail = true;
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Fallo de reservas de prueba' }).waitFor();
  fail = false;
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await count.filter({ hasText: /^1$/ }).waitFor();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: path.join(out, 'reservas-hoy-mobile.png'), fullPage: true });
  assert.equal(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth
    ),
    false
  );
  await page.getByRole('button', { name: 'Pre-reservas', exact: true }).click();
  await page.getByText('Cancelación por vencimiento', { exact: true }).waitFor();
  assert.equal(await count.textContent(), '1');
  assert.deepEqual(errors, []);
  log(
    `UI real verificada: Hoy, Todos los días, creación ausente, carrera de fechas, error/reintento, cancelación, zona Tokio y dos anchos. Capturas: ${out}`
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
