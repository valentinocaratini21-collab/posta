// test-atencion-total.js — Build Atención Total (2026-10-20):
// plan-gate + booking + followups + payment-close + suggestReply con
// fundamento. Sin red real: fetch global stubbeado, DB SQLite temporal.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const PG = require('./plan-gate');
const BK = require('./booking');
const FU = require('./followups');
const PC = require('./payment-close');
const GEN = require('./generator');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atencion-'));
let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
}
function mkdb(file, ddl) {
  const db = new DatabaseSync(path.join(tmp, file));
  if (ddl) db.exec(ddl);
  return db;
}
const H = 3600000;

(async () => {
// ================= PLAN-GATE =================
const USERS_DDL = `CREATE TABLE users (id INTEGER PRIMARY KEY, plan TEXT DEFAULT 'trial', plan_status TEXT DEFAULT 'trial')`;
const dbg = mkdb('gate.db', USERS_DDL);
const addUser = (id, plan, status) => dbg.prepare('INSERT INTO users (id, plan, plan_status) VALUES (?,?,?)').run(id, plan, status);
addUser(1, 'total', 'trial');      // pagó? no: status manda → trial
addUser(2, 'esencial', 'active');
addUser(3, 'pro', 'active');
addUser(4, 'total', 'active');
addUser(5, 'free', 'active');

await t('gate: trial (aunque users.plan diga total) cae a esencial y NO pasa atención', () => {
  assert.strictEqual(PG.effectivePlanId(dbg, 1), 'esencial');
  const g = PG.planGate(dbg, 1, 'comentarios');
  assert.strictEqual(g.ok, false);
  assert.strictEqual(g.required, 'total');
  assert.ok(g.message.includes('plan Total'));
});
await t('gate: esencial activo no pasa atención ni análisis completo', () => {
  assert.strictEqual(PG.planGate(dbg, 2, 'dms').ok, false);
  assert.strictEqual(PG.planGate(dbg, 2, 'agenda').ok, false);
  assert.strictEqual(PG.planGate(dbg, 2, 'analisis_completo').ok, false);
});
await t('gate: pro pasa análisis completo pero NO atención', () => {
  assert.strictEqual(PG.planGate(dbg, 3, 'analisis_completo').ok, true);
  assert.strictEqual(PG.planGate(dbg, 3, 'seguimiento').ok, false);
  assert.strictEqual(PG.planGate(dbg, 3, 'cierre_pago').ok, false);
});
await t('gate: total pasa TODO lo de atención', () => {
  for (const f of ['atencion', 'comentarios', 'dms', 'resenas', 'agenda', 'seguimiento', 'cierre_pago']) {
    assert.strictEqual(PG.planGate(dbg, 4, f).ok, true, f);
  }
});
await t('gate: fundador (free) pasa como Total', () => {
  assert.strictEqual(PG.planGate(dbg, 5, 'comentarios').ok, true);
  assert.strictEqual(PG.planGate(dbg, 5, 'analisis_completo').ok, true);
});
await t('gate: usuario inexistente y feature desconocida → fail-closed', () => {
  assert.strictEqual(PG.planGate(dbg, 999, 'comentarios').ok, false);
  assert.strictEqual(PG.planGate(dbg, 4, 'feature_que_no_existe').ok, false);
});
await t('gate: middleware deja pasar al Total y 403 al Esencial', async () => {
  const mwT = PG.planGateMiddleware(dbg, 'comentarios');
  let nexted = false;
  mwT({ session: { userId: 4 } }, {}, () => { nexted = true; });
  assert.strictEqual(nexted, true);
  const mwE = PG.planGateMiddleware(dbg, 'comentarios');
  let status = 0, body = null;
  mwE({ session: { userId: 2 } }, { status(c) { status = c; return { json(b) { body = b; } }; } }, () => { throw new Error('no debió pasar'); });
  assert.strictEqual(status, 403);
  assert.strictEqual(body.error, 'feature_requires_plan');
});

// ================= BOOKING =================
const dbb = mkdb('booking.db');
const now = Date.now();
const in2h = new Date(now + 2 * H).toISOString();
const in3d = new Date(now + 72 * H).toISOString();

await t('booking: crear → pending, leer y listar', () => {
  const b = BK.createBooking(dbb, 7, { customer_name: 'María', service: 'Corte', starts_at: in2h });
  assert.ok(b.id > 0);
  assert.strictEqual(b.status, 'pending');
  assert.strictEqual(BK.getBooking(dbb, b.id, 7).service, 'Corte');
  assert.strictEqual(BK.listBookings(dbb, 7, { status: 'pending' }).length, 1);
  assert.strictEqual(BK.listBookings(dbb, 8, {}).length, 0); // otro usuario no lo ve
});
await t('booking: crear sin servicio o con fecha inválida → error', () => {
  assert.throws(() => BK.createBooking(dbb, 7, { starts_at: in2h }), /servicio/);
  assert.throws(() => BK.createBooking(dbb, 7, { service: 'Corte', starts_at: 'maniana a la tarde' }), /starts_at/);
});
await t('booking: confirmar y transiciones inválidas', () => {
  const b = BK.createBooking(dbb, 7, { service: 'Color', starts_at: in3d });
  const c = BK.confirmBooking(dbb, b.id, 7);
  assert.strictEqual(c.status, 'confirmed');
  const x = BK.cancelBooking(dbb, b.id, 7);
  assert.strictEqual(x.status, 'cancelled');
  assert.throws(() => BK.confirmBooking(dbb, b.id, 7), /no se puede pasar/);
  assert.throws(() => BK.markNoShow(dbb, b.id, 7), /no se puede pasar/);
});
await t('booking: reprogramar vuelve a pending, guarda la fecha anterior y resetea recordatorio', () => {
  const b = BK.createBooking(dbb, 7, { service: 'Peinado', starts_at: in2h, autoConfirm: true });
  assert.strictEqual(b.status, 'confirmed');
  BK.markReminderSent(dbb, b.id, 7);
  const r = BK.rescheduleBooking(dbb, b.id, 7, in3d);
  assert.strictEqual(r.status, 'pending');
  assert.strictEqual(r.previous_starts_at, b.starts_at);
  assert.strictEqual(r.starts_at, new Date(in3d).toISOString());
  assert.strictEqual(r.reminder_sent_at, '');
});
await t('booking: anti no-show — due solo confirmados dentro de 24 h sin recordatorio', () => {
  const a = BK.createBooking(dbb, 9, { service: 'Corte', starts_at: in2h, autoConfirm: true });
  BK.createBooking(dbb, 9, { service: 'Lejos', starts_at: in3d, autoConfirm: true });       // fuera de ventana
  BK.createBooking(dbb, 9, { service: 'Pendiente', starts_at: in2h });                     // no confirmado
  let due = BK.dueReminders(dbb, 9, {});
  assert.strictEqual(due.length, 1);
  assert.strictEqual(due[0].id, a.id);
  BK.markReminderSent(dbb, a.id, 9);
  due = BK.dueReminders(dbb, 9, {});
  assert.strictEqual(due.length, 0);
});
await t('booking: reminderText nombra servicio y cliente, sin inventar', () => {
  const txt = BK.reminderText({ customer_name: 'María José', service: 'Corte', starts_at: in2h }, 'Peluquería Ana');
  assert.ok(txt.includes('María'));
  assert.ok(txt.includes('Corte'));
  assert.ok(txt.includes('Peluquería Ana'));
  assert.ok(!/\$\s*\d/.test(txt));
});

// ================= FOLLOWUPS =================
const dbf = mkdb('followups.db');
const t0 = new Date('2026-10-20T12:00:00.000Z');

await t('followups: registrar abre con vencimiento a 24 h', () => {
  const f = FU.registerConversation(dbf, 3, { source: 'dm', conversationKey: 'conv1', username: 'juan', customerName: 'Juan', topic: 'precio del corte' }, { now: t0 });
  assert.strictEqual(f.status, 'open');
  assert.strictEqual(Number(f.followup_count), 0);
  assert.strictEqual(f.next_due_at, new Date(t0.getTime() + 24 * H).toISOString());
});
await t('followups: no vence antes de las 24 h, sí después', () => {
  assert.strictEqual(FU.dueFollowups(dbf, 3, new Date(t0.getTime() + 1 * H)).length, 0);
  assert.strictEqual(FU.dueFollowups(dbf, 3, new Date(t0.getTime() + 25 * H)).length, 1);
});
await t('followups: tope anti-spam = 2 (24 h y ~48 h), después exhausted', () => {
  const f = FU.listFollowups(dbf, 3, { status: 'open' })[0];
  const s1 = FU.recordFollowupSent(dbf, 3, f.id, { now: new Date(t0.getTime() + 24 * H), draft: 'hola' });
  assert.strictEqual(Number(s1.followup_count), 1);
  assert.strictEqual(s1.next_due_at, new Date(t0.getTime() + 48 * H).toISOString());
  assert.strictEqual(FU.dueFollowups(dbf, 3, new Date(t0.getTime() + 30 * H)).length, 0);
  const s2 = FU.recordFollowupSent(dbf, 3, f.id, { now: new Date(t0.getTime() + 48 * H), draft: 'último' });
  assert.strictEqual(Number(s2.followup_count), 2);
  assert.strictEqual(s2.status, 'exhausted');
  assert.throws(() => FU.recordFollowupSent(dbf, 3, f.id, { now: new Date(t0.getTime() + 72 * H) }), /no se sigue más|tope/);
});
await t('followups: conversación convertida no se sigue nunca', () => {
  FU.registerConversation(dbf, 3, { source: 'dm', conversationKey: 'conv2', username: 'ana', topic: 'turno' }, { now: t0 });
  const r = FU.closeConversation(dbf, 3, 'conv2', { converted: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.status, 'converted');
  assert.strictEqual(FU.dueFollowups(dbf, 3, new Date(t0.getTime() + 100 * H)).length, 0);
});
await t('followups: re-registrar la misma conversación no resetea el contador', () => {
  const a = FU.registerConversation(dbf, 4, { source: 'dm', conversationKey: 'k', topic: 'x' }, { now: t0 });
  FU.recordFollowupSent(dbf, 4, a.id, { now: new Date(t0.getTime() + 24 * H) });
  const b = FU.registerConversation(dbf, 4, { source: 'dm', conversationKey: 'k', topic: 'y' }, { now: t0 });
  assert.strictEqual(b.id, a.id);
  assert.strictEqual(Number(b.followup_count), 1);
});
await t('followups: borrador con precio REAL del fundamento (sin IA)', async () => {
  const fund = { servicios: [{ nombre: 'Corte', precio: '$15.000' }], productos: [], promos: [] };
  const r = await FU.draftFollowup({ fundamento: fund, customerName: 'Juan Pérez', topic: 'precio del corte', attempt: 1 });
  assert.strictEqual(r.via, 'template');
  assert.ok(r.draft.includes('$15.000'), r.draft);
  assert.ok(r.draft.includes('Juan'));
});
await t('followups: borrador con IA inyectada usa la IA y respeta el tope de caracteres', async () => {
  const r = await FU.draftFollowup({ business: 'Peluquería Ana', customerName: 'Ana', topic: 'color', attempt: 1, aiFn: async () => '¡Hola Ana! ¿Seguimos con lo del color?' });
  assert.strictEqual(r.via, 'ai');
  assert.ok(r.draft.length <= 300);
});

// ================= PAYMENT-CLOSE =================
const dbp = mkdb('pay.db');
await t('payment-close: config default — send_policy FIJA en approval', () => {
  const c = PC.getCareConfig(dbp, 1);
  assert.strictEqual(c.send_policy, 'approval');
  assert.strictEqual(c.payment_link, '');
});
await t('payment-close: la política NO se puede cambiar (regla fija, sin autopilot)', () => {
  assert.throws(() => PC.setCareConfig(dbp, 1, { send_policy: 'autopilot' }), /regla fija/);
  const c = PC.setCareConfig(dbp, 1, { send_policy: 'approval' });
  assert.strictEqual(c.send_policy, 'approval');
  dbp.prepare(`INSERT INTO care_config (user_id, payment_link, deposit_instructions, send_policy) VALUES (2, '', '', 'autopilot')`).run();
  assert.strictEqual(PC.getCareConfig(dbp, 2).send_policy, 'approval'); // fila vieja coercionada
});
await t('payment-close: link válido se guarda; basura se rechaza', () => {
  const c = PC.setCareConfig(dbp, 1, { payment_link: 'https://link.mercadopago.com.ar/peluana' });
  assert.strictEqual(c.payment_link, 'https://link.mercadopago.com.ar/peluana');
  assert.throws(() => PC.setCareConfig(dbp, 1, { payment_link: 'esto-no-es-url' }), /inválido/);
  assert.throws(() => PC.setCareConfig(dbp, 1, { payment_link: 'ftp://x.com' }), /inválido/);
});
await t('payment-close: cierre con link — textual, con ítem y precio pasados', () => {
  const r = PC.buildClose({ config: PC.getCareConfig(dbp, 1), customerName: 'María José', itemName: 'Corte', price: '$15.000' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.via, 'payment_link');
  assert.ok(r.message.includes('https://link.mercadopago.com.ar/peluana'));
  assert.ok(r.message.includes('$15.000'));
  assert.ok(r.message.includes('María'));
});
await t('payment-close: sin link pero con seña configurada → vía seña, textual', () => {
  const r = PC.buildClose({ config: { payment_link: '', deposit_instructions: 'alias: pelu.ana.mp (50% de seña)' }, customerName: 'Juan', itemName: 'Color' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.via, 'deposit');
  assert.ok(r.message.includes('alias: pelu.ana.mp (50% de seña)'));
});
await t('payment-close: sin link ni seña → needs_human, jamás inventa', () => {
  const r = PC.buildClose({ config: { payment_link: '', deposit_instructions: '' }, customerName: 'Juan', itemName: 'Corte', price: '$15.000' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.needsHuman, true);
  assert.strictEqual(r.message, '');
  const r2 = PC.buildClose({ config: { payment_link: 'https://pago.example.com/x', deposit_instructions: '' }, itemName: 'Corte' });
  assert.ok(!/\$\s*\d/.test(r2.message), 'sin precio pasado, el mensaje no puede tener montos: ' + r2.message);
});

// ================= SUGGESTREPLY CON FUNDAMENTO =================
let fetchCalls = 0;
let nextReply = '';
const realFetch = global.fetch;
global.fetch = async () => {
  fetchCalls++;
  return { ok: true, json: async () => ({ choices: [{ message: { content: nextReply } }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
};
const FUND = {
  business: 'Peluquería Ana', category: 'belleza', ciudad: 'Palermo', has_booking: true,
  servicios: [{ nombre: 'Corte', precio: '$15.000' }, { nombre: 'Color', precio: '$40.000' }],
  productos: [], promos: [], temas_feed: [],
};
const FUND_SIN_PRECIOS = { ...FUND, servicios: [{ nombre: 'Corte' }, { nombre: 'Color' }] };

await t('reply: intención factual detectada', () => {
  assert.strictEqual(GEN.replyIntent('¿cuánto sale el corte?').price, true);
  assert.strictEqual(GEN.replyIntent('¿a qué hora abren?').hours, true);
  assert.strictEqual(GEN.replyIntent('¡hermoso trabajo!').factual, false);
});
await t('reply: precio EN el fundamento → responde con el dato real', async () => {
  nextReply = '¡Hola! El corte está $15.000. ¿Te reservo un turno?';
  const before = fetchCalls;
  const r = await GEN.suggestReplyDetailed({ business: 'Peluquería Ana', category: 'belleza', username: 'juan', commentText: '¿cuánto sale el corte?', fundamento: FUND }, 'sk-test');
  assert.strictEqual(r.needsHuman, false, r.reason);
  assert.ok(r.reply.includes('$15.000'));
  assert.ok(r.factsUsed.includes('Corte'));
  assert.ok(fetchCalls > before);
});
await t('reply: precio SIN fundamento de precios → needs_human SIN llamar a la IA', async () => {
  const before = fetchCalls;
  const r = await GEN.suggestReplyDetailed({ business: 'Peluquería Ana', username: 'juan', commentText: '¿cuánto sale el corte?', fundamento: FUND_SIN_PRECIOS }, 'sk-test');
  assert.strictEqual(r.needsHuman, true);
  assert.ok(r.reason.includes('precio'), r.reason);
  assert.strictEqual(fetchCalls, before, 'no debió llamar a la IA');
});
await t('reply: horario sin horarios cargados → needs_human; con horarios → responde', async () => {
  const r1 = await GEN.suggestReplyDetailed({ business: 'Peluquería Ana', username: 'juan', commentText: '¿a qué hora abren?', fundamento: FUND }, 'sk-test');
  assert.strictEqual(r1.needsHuman, true);
  assert.ok(r1.reason.includes('horario'), r1.reason);
  nextReply = 'Abrimos de lunes a sábado de 9 a 19 🙌';
  const r2 = await GEN.suggestReplyDetailed({ business: 'Peluquería Ana', username: 'juan', commentText: '¿a qué hora abren?', fundamento: FUND, horarios: 'Lun a Sáb de 9 a 19' }, 'sk-test');
  assert.strictEqual(r2.needsHuman, false, r2.reason);
  assert.ok(r2.reply.includes('9 a 19'));
});
await t('reply: el modelo inventa un precio → candado lo caza y escala', async () => {
  nextReply = '¡Hola! Sale $99.999, una ganga.';
  const r = await GEN.suggestReplyDetailed({ business: 'Peluquería Ana', username: 'juan', commentText: '¿cuánto sale el corte?', fundamento: FUND }, 'sk-test');
  assert.strictEqual(r.needsHuman, true);
  assert.ok(r.reason.includes('precio_inventado'), r.reason);
  assert.strictEqual(r.reply, '');
});
await t('reply: comentario no factual con fundamento → respuesta normal', async () => {
  nextReply = '¡Gracias! Nos alegra un montón 🙌';
  const r = await GEN.suggestReplyDetailed({ business: 'Peluquería Ana', username: 'juan', commentText: '¡hermoso trabajo!', fundamento: FUND }, 'sk-test');
  assert.strictEqual(r.needsHuman, false);
  assert.ok(r.reply.includes('Gracias'));
});
await t('reply: compat — sin fundamento devuelve el string histórico', async () => {
  nextReply = '¡Gracias por escribirnos! Te respondemos por DM 🙌';
  const s = await GEN.suggestReply({ business: 'Peluquería Ana', category: 'belleza', tone: 'canchero', username: 'juan', commentText: '¿precio?' }, 'sk-test');
  assert.strictEqual(typeof s, 'string');
  assert.ok(s.includes('DM'));
  const s2 = await GEN.suggestReply({ business: 'X', username: 'j', commentText: 'hola' }, '');
  assert.strictEqual(s2, '¡Gracias por escribirnos! 🙌');
});
global.fetch = realFetch;

console.log(`\n== test-atencion-total: ${passed} passed, ${failed} failed ==`);
if (failures.length) { console.log(failures.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
})();
