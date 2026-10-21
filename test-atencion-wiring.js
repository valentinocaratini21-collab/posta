// test-atencion-wiring.js — E2E del CABLEADO de Atención Total (2026-10-21).
// Levanta el server real (proceso hijo) con la red simulada por
// test-care-stub.js (preload): Instagram Graph y OpenAI falsos, cada
// llamada registrada en un log JSONL. Verifica el flujo completo:
//   comentario llega → respuesta con datos del fundamento → cola de
//   aprobación → el dueño aprueba → sale por Instagram (simulado).
// Y los casos borde: dato faltante → needs_human · queja → needs_human ·
// envío sin aprobación del dueño → bloqueado · gate de plan Total.
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const PORT = 4317 + (process.pid % 400);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'atencion-wiring-'));
const LOG = path.join(DATA_DIR, 'stub.jsonl');

let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); console.log('  ✗ ' + name + ' — ' + e.message); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function stubLog() {
  try { return fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
  catch (e) { return []; }
}

let child = null;
let serverOut = '';
async function boot() {
  child = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR,
      NODE_OPTIONS: `--require ${path.join(__dirname, 'test-care-stub.js')}`,
      CARE_STUB_LOG: LOG, OPENAI_API_KEY: 'sk-stub',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { serverOut += d; });
  child.stderr.on('data', (d) => { serverOut += d; });
  for (let i = 0; i < 180; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(500);
  }
  throw new Error('el server no levantó. Salida:\n' + serverOut.slice(-3000));
}

function seed() {
  const db = new DatabaseSync(path.join(DATA_DIR, 'posta.db'));
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('test1234', 10);
  const insU = db.prepare('INSERT INTO users (email, password_hash, plan, plan_status, lang) VALUES (?,?,?,?,?)');
  const uT = Number(insU.run('total@test.local', hash, 'total', 'active', 'es').lastInsertRowid);
  const uT2 = Number(insU.run('total2@test.local', hash, 'total', 'active', 'es').lastInsertRowid);
  const uE = Number(insU.run('esencial@test.local', hash, 'esencial', 'active', 'es').lastInsertRowid);
  const insP = db.prepare('INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?,?,?,?,?,1)');
  insP.run(uT, 'Peluquería Ana', 'belleza', 'canchero', 'pelu.ana');
  insP.run(uT2, 'Barbería Sur', 'barberia', 'canchero', 'barberia.sur');
  insP.run(uE, 'Tienda Esencial', 'otro', 'canchero', 'tienda.esencial');
  const insS = db.prepare('INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?,?,?)');
  insS.run(uT, 'IGT', 'tok-fake'); insS.run(uT2, 'IGT2', 'tok-fake'); insS.run(uE, 'IGE', 'tok-fake');
  // ADN sin horarios cargados: la pregunta de horario tiene que escalar.
  db.prepare('INSERT INTO business_dna (user_id, dna_json) VALUES (?,?)').run(uT, JSON.stringify({ horarios: '' }));
  const clientDigest = require('./client-digest');
  clientDigest.saveDigest(db, uT, {
    business: 'Peluquería Ana', category: 'belleza', ciudad: 'Palermo', has_booking: true,
    servicios: [{ nombre: 'Corte', precio: '$15.000' }, { nombre: 'Color', precio: '$40.000' }],
    productos: [], promos: [], temas_feed: [],
  });
  clientDigest.saveDigest(db, uT2, {
    business: 'Barbería Sur', category: 'barberia', ciudad: 'Quilmes', has_booking: true,
    servicios: [{ nombre: 'Corte' }], productos: [], promos: [], temas_feed: [],
  });
  db.close();
  return { uT, uT2, uE };
}

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234' }),
  });
  assert.strictEqual(r.status, 200, 'login ' + email + ' → ' + r.status);
  const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookies, 'login sin cookie');
  return cookies;
}
async function api(cookie, method, p, body) {
  const r = await fetch(BASE + p, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

(async () => {
  const version = await boot();
  const ids = seed();
  const ckT = await login('total@test.local');
  const ckT2 = await login('total2@test.local');
  const ckE = await login('esencial@test.local');

  await t('boot: el server levantó con el BUILD del cableado', () => {
    assert.ok(String(version.build || '').includes('v310'), 'build=' + version.build);
  });

  await t('gate: Esencial recibe 403 feature_requires_plan en TODA la atención', async () => {
    for (const p of ['/api/comments', '/api/dms', '/api/reviews', '/api/community/pending', '/api/bookings', '/api/followups/due', '/api/care/config']) {
      const r = await api(ckE, 'GET', p);
      assert.strictEqual(r.status, 403, p + ' → ' + r.status);
      assert.strictEqual(r.body.error, 'feature_requires_plan', p);
      assert.strictEqual(r.body.required, 'total', p);
    }
  });

  await t('flujo: refresh de comentarios baja los 3 simulados', async () => {
    const r = await api(ckT, 'POST', '/api/comments/refresh', {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.fresh, 3);
  });

  let comments = [];
  await t('flujo: la respuesta usa el precio REAL del fundamento y queda pending', async () => {
    const r = await api(ckT, 'GET', '/api/comments');
    comments = r.body.comments;
    const price = comments.find((c) => c.text.includes('cuánto sale'));
    assert.ok(price, 'falta el comentario de precio');
    assert.strictEqual(price.status, 'pending');
    assert.ok(price.suggested.includes('$15.000'), 'sugerencia sin precio real: ' + price.suggested);
    const oa = stubLog().filter((e) => e.kind === 'openai');
    assert.ok(oa.some((e) => e.foundation), 'la IA nunca recibió el bloque del fundamento');
  });

  await t('borde: pregunta de horario SIN horarios cargados → needs_human, sin llamar a la IA', async () => {
    const hours = comments.find((c) => c.text.includes('hora abren'));
    assert.ok(hours, 'falta el comentario de horario');
    assert.strictEqual(hours.status, 'needs_human');
    assert.strictEqual(hours.suggested, '');
    const oa = stubLog().filter((e) => e.kind === 'openai' && e.user.includes('hora abren'));
    assert.strictEqual(oa.length, 0, 'se llamó a la IA para un dato que no existe');
  });

  await t('borde: queja → needs_human sin redactar nada', async () => {
    const q = comments.find((c) => c.text.includes('estafa'));
    assert.ok(q, 'falta la queja');
    assert.strictEqual(q.status, 'needs_human');
    assert.strictEqual(q.suggested, '');
  });

  await t('borde: NADA salió a Instagram sin aprobación del dueño', async () => {
    const sends = stubLog().filter((e) => e.kind === 'ig_reply' || e.kind === 'ig_dm');
    assert.strictEqual(sends.length, 0, 'hubo envíos sin aprobación: ' + JSON.stringify(sends));
  });

  let priceRow = null;
  await t('borde: otro usuario NO puede aprobar la respuesta ajena (404) y no sale nada', async () => {
    priceRow = comments.find((c) => c.text.includes('cuánto sale'));
    const r = await api(ckT2, 'POST', `/api/comments/${priceRow.id}/reply`, {});
    assert.strictEqual(r.status, 404);
    const noauth = await api('', 'POST', `/api/comments/${priceRow.id}/reply`, {});
    assert.ok(noauth.status >= 400, 'sin sesión respondió ' + noauth.status);
    assert.strictEqual(stubLog().filter((e) => e.kind === 'ig_reply').length, 0);
  });

  await t('flujo: el dueño aprueba con un toque → la respuesta SALE a Instagram', async () => {
    const r = await api(ckT, 'POST', `/api/comments/${priceRow.id}/reply`, {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const sends = stubLog().filter((e) => e.kind === 'ig_reply');
    assert.strictEqual(sends.length, 1);
    assert.ok(sends[0].message.includes('$15.000'));
    const after = await api(ckT, 'GET', '/api/comments');
    assert.ok(!after.body.comments.some((c) => c.id === priceRow.id), 'la fila aprobada sigue en la cola');
  });

  await t('flujo DM: llega, se registra el seguimiento y el dueño lo responde', async () => {
    const r = await api(ckT, 'POST', '/api/dms/refresh', {});
    assert.strictEqual(r.body.fresh, 1);
    const dms = (await api(ckT, 'GET', '/api/dms')).body.dms;
    assert.strictEqual(dms.length, 1);
    assert.strictEqual(dms[0].status, 'pending');
    const fu = (await api(ckT, 'GET', '/api/followups?status=open')).body.followups;
    assert.ok(fu.some((f) => f.conversation_key === 'conv1'), 'la conversación no quedó registrada para seguimiento');
    const send = await api(ckT, 'POST', `/api/dms/${dms[0].id}/reply`, {});
    assert.strictEqual(send.status, 200, JSON.stringify(send.body));
    assert.strictEqual(stubLog().filter((e) => e.kind === 'ig_dm').length, 1);
    const closed = (await api(ckT, 'GET', '/api/followups?status=closed')).body.followups;
    assert.ok(closed.some((f) => f.conversation_key === 'conv1'), 'al responder, el seguimiento no se cerró');
  });

  await t('seguimiento: vencida a las 24 h → borrador con precio real; /sent y /close andan', async () => {
    const db = new DatabaseSync(path.join(DATA_DIR, 'posta.db'));
    db.prepare(`INSERT INTO followups (user_id, source, conversation_key, customer_username, customer_name, topic, status, followup_count, next_due_at)
      VALUES (?, 'dm', 'convX', 'lu', 'Lu', 'precio del corte', 'open', 0, '2000-01-01T00:00:00.000Z')`).run(ids.uT);
    db.close();
    const due = (await api(ckT, 'GET', '/api/followups/due')).body.followups;
    const row = due.find((f) => f.conversation_key === 'convX');
    assert.ok(row, 'la conversación vencida no apareció en /due');
    assert.ok(row.draft.includes('$15.000'), 'borrador sin precio real: ' + row.draft);
    const sent = await api(ckT, 'POST', `/api/followups/${row.id}/sent`, { draft: row.draft });
    assert.strictEqual(sent.status, 200, JSON.stringify(sent.body));
    assert.strictEqual(Number(sent.body.followup.followup_count), 1);
    const close = await api(ckT, 'POST', '/api/followups/close', { conversation_key: 'convX', converted: true });
    assert.strictEqual(close.body.status, 'converted');
  });

  await t('agenda: crear → confirmar → recordatorio anti no-show → marcado', async () => {
    const in2h = new Date(Date.now() + 2 * 3600000).toISOString();
    const c = await api(ckT, 'POST', '/api/bookings', { customer_name: 'María', service: 'Corte', starts_at: in2h });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(c.body.booking.status, 'pending');
    const id = c.body.booking.id;
    const conf = await api(ckT, 'POST', `/api/bookings/${id}/confirm`, {});
    assert.strictEqual(conf.body.booking.status, 'confirmed');
    const rem = (await api(ckT, 'GET', '/api/bookings/reminders')).body.reminders;
    assert.strictEqual(rem.length, 1);
    assert.ok(rem[0].reminder_text.includes('Corte') && rem[0].reminder_text.includes('María'));
    await api(ckT, 'POST', `/api/bookings/${id}/reminder-sent`, {});
    const rem2 = (await api(ckT, 'GET', '/api/bookings/reminders')).body.reminders;
    assert.strictEqual(rem2.length, 0);
  });

  await t('cierre: config + link + precio del fundamento; precio inventado → 400; autopilot → 400', async () => {
    const cfg = await api(ckT, 'POST', '/api/care/config', { payment_link: 'https://link.mercadopago.com.ar/peluana' });
    assert.strictEqual(cfg.status, 200, JSON.stringify(cfg.body));
    assert.strictEqual(cfg.body.config.send_policy, 'approval');
    const auto = await api(ckT, 'POST', '/api/care/config', { send_policy: 'autopilot' });
    assert.strictEqual(auto.status, 400, 'send_policy autopilot aceptado');
    const close = await api(ckT, 'POST', '/api/care/close', { customerName: 'María', itemName: 'Corte', price: '$15.000' });
    assert.strictEqual(close.body.ok, true, JSON.stringify(close.body));
    assert.ok(close.body.message.includes('https://link.mercadopago.com.ar/peluana'));
    assert.ok(close.body.message.includes('$15.000'));
    const invented = await api(ckT, 'POST', '/api/care/close', { customerName: 'María', itemName: 'Corte', price: '$99.999' });
    assert.strictEqual(invented.status, 400, 'precio inventado aceptado en el cierre');
  });

  await t('cierre: sin link ni seña configurados → needs_human, jamás inventa', async () => {
    const close = await api(ckT2, 'POST', '/api/care/close', { customerName: 'Juan', itemName: 'Corte' });
    assert.strictEqual(close.body.ok, false);
    assert.strictEqual(close.body.needsHuman, true);
  });

  console.log(`\n== test-atencion-wiring: ${passed} passed, ${failed} failed ==`);
  if (failures.length) console.log(failures.map((f) => '  ✗ ' + f).join('\n'));
})().catch((e) => { console.error('ERROR FATAL:', e.message); failed++; })
  .finally(async () => {
    try { if (child) child.kill('SIGTERM'); } catch (e) {}
    await sleep(800);
    try { if (child) child.kill('SIGKILL'); } catch (e) {}
    if (!failed) { try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) {} }
    else console.log('DATA_DIR conservado para debug: ' + DATA_DIR);
    process.exit(failed ? 1 : 0);
  });
