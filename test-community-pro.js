// test-community-pro.js — Harness: stories + community + reactive.
// Sin red real ni API keys: todo con stubs inyectados.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const S = require('./stories');
const C = require('./community');
const R = require('./reactive');

const tmpMedia = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-'));
let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
}
function mkdb(file, ddl) {
  const db = new DatabaseSync(path.join(tmpMedia, file));
  db.exec(ddl);
  return db;
}
const POSTS_DDL = `CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT,
  status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image', tipo TEXT DEFAULT '',
  hook_id TEXT DEFAULT '', intent TEXT DEFAULT '', needs_image INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')))`;

(async () => {
// ================= STORIES =================
await t('story poll: headline + opciones A/B', () => {
  const c = S.buildStoryContent('poll', { pollA: 'Medialunas', pollB: 'Tostadas' });
  assert.ok(c.headline.length > 0);
  assert.ok(c.sub.includes('A) Medialunas') && c.sub.includes('B) Tostadas'));
});
await t('story question: pregunta custom', () => {
  const c = S.buildStoryContent('question', { question: '¿Dulce o salado?' });
  assert.strictEqual(c.headline, '¿Dulce o salado?');
});
await t('story countdown: FALTAN N DÍAS', () => {
  const d = new Date(); d.setDate(d.getDate() + 5);
  const ymd = d.toISOString().slice(0, 10);
  const c = S.buildStoryContent('countdown', { promoTitle: '2x1 en meriendas', eventDate: ymd });
  assert.strictEqual(c.headline, '2x1 en meriendas');
  assert.ok(c.sub.includes('FALTAN 5 DÍAS'), 'sub=' + c.sub);
});
await t('story countdown sin promo → null (cero relleno)', () => {
  assert.strictEqual(S.buildStoryContent('countdown', {}), null);
});
await t('story repost sin caption → null', () => {
  assert.strictEqual(S.buildStoryContent('repost', {}), null);
});
await t('renderStoryPng genera 1080×1920', () => {
  const p = S.renderStoryPng({ headline: '¿A o B?', sub: 'A) X  B) Y', business: 'Café Test',
    bgHex: '#0A1E33', textHex: '#FFFFFF', outDir: tmpMedia });
  assert.ok(p.startsWith('/media/'));
  const abs = path.join(tmpMedia, path.basename(p));
  assert.ok(fs.existsSync(abs), 'existe el PNG');
  const buf = fs.readFileSync(abs);
  assert.ok(buf.length > 10000, 'no es un PNG vacío');
});
await t('generateStory crea post media_type=story', () => {
  const db = mkdb('s1.db', POSTS_DDL);
  const out = S.generateStory({ db, uid: 1, type: 'question',
    ctx: { question: '¿Qué opinan?' }, brand: { business: 'T', bgHex: '#2793C8' }, mediaDir: tmpMedia });
  const row = db.prepare('SELECT media_type, tipo, status FROM posts WHERE id = ?').get(out.id);
  assert.strictEqual(row.media_type, 'story');
  assert.strictEqual(row.tipo, 'story');
  assert.strictEqual(row.status, 'draft');
  db.close();
});
await t('generateStory tipo inválido → throw', () => {
  const db = mkdb('s2.db', POSTS_DDL);
  assert.throws(() => S.generateStory({ db, uid: 1, type: 'nope', ctx: {}, brand: {}, mediaDir: tmpMedia }));
  db.close();
});

// ================= COMMUNITY =================
await t('classify: queja → needs_human', () => {
  assert.strictEqual(C.classifyComment('esto es una estafa, quiero mi devolución'), 'needs_human');
  assert.strictEqual(C.classifyComment('pésimo servicio, nunca más'), 'needs_human');
});
await t('classify: insulto/spam → troll', () => {
  assert.strictEqual(C.classifyComment('mirá mi onlyfans http://x.com'), 'troll');
});
await t('classify: comentario normal → ok', () => {
  assert.strictEqual(C.classifyComment('hola! qué precio tiene?'), 'ok');
  assert.strictEqual(C.classifyComment('hermoso lugar, vuelvo siempre'), 'ok');
});
await t('draftReply usa la voz del brief + estilo', async () => {
  let seenSystem = '';
  const aiFn = async ({ system }) => { seenSystem = system; return 'Gracias por escribirnos! Te respondemos por privado.'; };
  const r = await C.draftReplyText({ comment: { username: 'juan', text: 'precio?' },
    business: 'Café Test', briefBlock: 'VENDE medialunas', styleBlock: 'Tono: canchero', aiFn });
  assert.ok(r.reply.length > 0);
  assert.ok(seenSystem.includes('VENDE medialunas'), 'brief en el prompt');
  assert.ok(seenSystem.includes('canchero'), 'estilo en el prompt');
  assert.ok(!r.reply.includes('*'), 'sin asteriscos');
});
await t('draftReply sin IA → error, no throw', async () => {
  const r = await C.draftReplyText({ comment: { username: 'a', text: 'hola' }, business: 'T' });
  assert.ok(r.error, 'devuelve error');
});
await t('queueReplies: dedup por comment_id', () => {
  const db = mkdb('c1.db', 'CREATE TABLE x (i INT)');
  C.initCommunityTables(db);
  const item = { source: 'comment', postIgId: 'm1', commentId: 'c1', username: 'u1', text: 'hola', proposedReply: 'r', status: 'pending' };
  const a = C.queueReplies(db, 1, [item]);
  const b = C.queueReplies(db, 1, [item]);
  assert.strictEqual(a.queued, 1);
  assert.strictEqual(b.queued, 0, 'duplicado ignorado');
  db.close();
});
await t('queueReplies: no responde 2 veces al mismo usuario en el mismo post', () => {
  const db = mkdb('c2.db', 'CREATE TABLE x (i INT)');
  C.initCommunityTables(db);
  const mk = (cid) => ({ source: 'comment', postIgId: 'm1', commentId: cid, username: 'u1', text: 'otra', proposedReply: 'r', status: 'pending' });
  C.queueReplies(db, 1, [mk('c1')]);
  const r = C.queueReplies(db, 1, [mk('c2')]);
  assert.strictEqual(r.queued, 0, 'segundo comentario del mismo usuario: no se encola');
  db.close();
});
await t('NUNCA envía sin aprobación: queueReplies no toca sendFn', () => {
  const db = mkdb('c3.db', 'CREATE TABLE x (i INT)');
  C.initCommunityTables(db);
  let sent = 0;
  const sendFn = async () => { sent++; return { ok: true }; };
  // queueReplies ni siquiera acepta sendFn: la firma no lo permite
  C.queueReplies(db, 1, [{ source: 'comment', postIgId: 'm1', commentId: 'c9', username: 'u9', text: 'hola', proposedReply: 'r', status: 'pending' }]);
  assert.strictEqual(sent, 0, 'cero envíos al encolar');
  const row = db.prepare('SELECT status FROM comment_replies WHERE comment_id = ?').get('c9');
  assert.strictEqual(row.status, 'pending');
  db.close();
});
await t('approveAndSend: envía 1 vez y marca sent', async () => {
  const db = mkdb('c4.db', 'CREATE TABLE x (i INT)');
  C.initCommunityTables(db);
  C.queueReplies(db, 1, [{ source: 'comment', postIgId: 'm1', commentId: 'c1', username: 'u1', text: 'hola', proposedReply: 'Gracias!', status: 'pending' }]);
  let calls = 0;
  const sendFn = async ({ commentId, message }) => {
    calls++;
    assert.strictEqual(commentId, 'c1');
    assert.strictEqual(message, 'Gracias!');
    return { ok: true, id: 'ig_1' };
  };
  const out = await C.approveAndSend(db, 1, 1, { creds: {}, sendFn });
  assert.strictEqual(calls, 1);
  assert.strictEqual(out.igId, 'ig_1');
  const row = db.prepare('SELECT status FROM comment_replies WHERE id = 1').get();
  assert.strictEqual(row.status, 'sent');
  db.close();
});
await t('approveAndSend dos veces → throw', async () => {
  const db = mkdb('c5.db', 'CREATE TABLE x (i INT)');
  C.initCommunityTables(db);
  C.queueReplies(db, 1, [{ source: 'comment', postIgId: 'm1', commentId: 'c1', username: 'u1', text: 'h', proposedReply: 'r', status: 'pending' }]);
  await C.approveAndSend(db, 1, 1, { creds: {}, sendFn: async () => ({ ok: true }) });
  await assert.rejects(C.approveAndSend(db, 1, 1, { creds: {}, sendFn: async () => ({ ok: true }) }), /ya fue procesada/);
  db.close();
});
await t('dismissReply → dismissed', () => {
  const db = mkdb('c6.db', 'CREATE TABLE x (i INT)');
  C.initCommunityTables(db);
  C.queueReplies(db, 1, [{ source: 'comment', postIgId: 'm1', commentId: 'c1', username: 'u1', text: 'h', proposedReply: 'r', status: 'pending' }]);
  const r = C.dismissReply(db, 1, 1);
  assert.strictEqual(r.ok, true);
  const row = db.prepare('SELECT status FROM comment_replies WHERE id = 1').get();
  assert.strictEqual(row.status, 'dismissed');
  db.close();
});
await t('getPendingReplies lista pending + needs_human', () => {
  const db = mkdb('c7.db', 'CREATE TABLE x (i INT)');
  C.initCommunityTables(db);
  C.queueReplies(db, 1, [
    { source: 'comment', postIgId: 'm1', commentId: 'c1', username: 'u1', text: 'h', proposedReply: 'r', status: 'pending' },
    { source: 'comment', postIgId: 'm1', commentId: 'c2', username: 'u2', text: 'queja', proposedReply: '', status: 'needs_human', note: 'x' },
  ]);
  const list = C.getPendingReplies(db, 1, 50);
  assert.strictEqual(list.length, 2);
  db.close();
});

// ================= REACTIVE =================
const rainWeather = { temp: 8, precip: 5, weathercode: 61 };
await t('reactive: lluvia+gastronomía → rain-gastro', () => {
  const rule = R.evaluateTriggers({ weather: rainWeather, rubro: 'gastronomia', holiday: null, isWeekend: false });
  assert.ok(rule && rule.id === 'rain-gastro', 'rule=' + (rule && rule.id));
});
await t('reactive: tormenta aplica a cualquier rubro', () => {
  const rule = R.evaluateTriggers({ weather: { temp: 20, precip: 20, weathercode: 96 }, rubro: 'moda', holiday: null, isWeekend: false });
  assert.ok(rule && rule.id === 'storm-any');
});
await t('reactive: día normal sin trigger → null (cero relleno)', () => {
  // martes 2026-10-06, 22°, despejado, rubro moda: ninguna regla aplica
  const rule = R.evaluateTriggers({ weather: { temp: 22, precip: 0, weathercode: 1 }, rubro: 'moda', holiday: null, isWeekend: false });
  assert.strictEqual(rule, null);
});
await t('reactive: 14 reglas en el mapa', () => {
  assert.ok(R.REACTIVE_RULES.length >= 14, 'n=' + R.REACTIVE_RULES.length);
});
await t('isHolidayAR con stub', async () => {
  const stub = async () => ({ ok: true, json: async () => [{ date: '2026-05-01', localName: 'Día del Trabajador' }] });
  const h = await R.isHolidayAR('2026-05-01', stub);
  assert.ok(h && h.date === '2026-05-01');
  const no = await R.isHolidayAR('2026-05-02', stub);
  assert.strictEqual(no, null);
});
await t('buildReactiveCaption: hook + headline', () => {
  const rule = R.REACTIVE_RULES.find(r => r.id === 'rain-gastro');
  const { caption, hookId, intent } = R.buildReactiveCaption(rule, { business: 'Café Test' });
  assert.ok(caption.includes('Día de delivery'), 'lleva el headline');
  assert.ok(hookId && hookId.length > 0, 'guarda hook_id');
  assert.strictEqual(intent, 'promo');
});
await t('geocodeCity con stub', async () => {
  const stub = async () => ({ ok: true, json: async () => ({ results: [{ latitude: -34.6, longitude: -58.4, name: 'Buenos Aires' }] }) });
  const g = await R.geocodeCity('Buenos Aires', stub);
  assert.strictEqual(g.lat, -34.6);
});
const WEATHER_DDL = POSTS_DDL + `;
CREATE TABLE settings (user_id INTEGER PRIMARY KEY, reactive_enabled INTEGER DEFAULT 1,
  reactive_lat REAL DEFAULT 0, reactive_lon REAL DEFAULT 0, reactive_label TEXT DEFAULT '');
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT);`;
function weatherStub() {
  return async (url) => {
    const u = String(url);
    if (u.includes('geocoding-api')) return { ok: true, json: async () => ({ results: [{ latitude: -34.6, longitude: -58.4, name: 'Buenos Aires' }] }) };
    if (u.includes('api.open-meteo.com')) return { ok: true, json: async () => ({ current: { temperature_2m: 8, precipitation: 5, weathercode: 61 } }) };
    if (u.includes('date.nager.at')) return { ok: true, json: async () => ([]) };
    throw new Error('url inesperada: ' + u);
  };
}
function reactiveDeps(uid) {
  return {
    getRubro: () => 'gastronomia',
    getBusiness: () => 'Café Test',
    getBrand: () => ({ business: 'Café Test', bgHex: '#0A1E33', textHex: '#FFFFFF', logoAbs: null }),
    getLocText: () => 'Buenos Aires',
    fetchFn: weatherStub(),
    // nowFn sin stubear: usa la fecha real (el check máx 1/día compara contra created_at real)
    generateImage: null, // cae a tarjeta de marca (PIL)
    mediaDir: tmpMedia,
  };
}
await t('maybeCreateReactiveDraft: lluvia+gastro → borrador + aviso en chat', async () => {
  const db = mkdb('r1.db', WEATHER_DDL);
  db.prepare('INSERT INTO settings (user_id) VALUES (1)').run();
  const r = await R.maybeCreateReactiveDraft(db, 1, reactiveDeps(1));
  assert.strictEqual(r.created, true, JSON.stringify(r));
  assert.strictEqual(r.rule, 'rain-gastro');
  const post = db.prepare('SELECT tipo, media_type, status, hook_id, image_path FROM posts WHERE id = ?').get(r.postId);
  assert.strictEqual(post.tipo, 'reactive');
  assert.strictEqual(post.media_type, 'image');
  assert.strictEqual(post.status, 'draft');
  assert.ok(post.image_path.startsWith('/media/'), 'tiene imagen: ' + post.image_path);
  assert.ok(fs.existsSync(path.join(tmpMedia, path.basename(post.image_path))), 'la imagen existe');
  const msg = db.prepare(`SELECT text FROM chat_messages WHERE user_id = 1 ORDER BY id DESC LIMIT 1`).get();
  assert.ok(msg && msg.text.includes('🌧️'), 'aviso en el chat: ' + (msg && msg.text.slice(0, 60)));
  db.close();
});
await t('maybeCreateReactiveDraft: máx 1/día', async () => {
  const db = mkdb('r2.db', WEATHER_DDL);
  db.prepare('INSERT INTO settings (user_id) VALUES (1)').run();
  const a = await R.maybeCreateReactiveDraft(db, 1, reactiveDeps(1));
  assert.strictEqual(a.created, true);
  const b = await R.maybeCreateReactiveDraft(db, 1, reactiveDeps(1));
  assert.strictEqual(b.skipped, 'max_day');
  db.close();
});
await t('maybeCreateReactiveDraft: sin ubicación → skipped', async () => {
  const db = mkdb('r3.db', WEATHER_DDL);
  db.prepare('INSERT INTO settings (user_id) VALUES (1)').run();
  const d = reactiveDeps(1); d.getLocText = () => '';
  const r = await R.maybeCreateReactiveDraft(db, 1, d);
  assert.strictEqual(r.skipped, 'no_location');
  db.close();
});

console.log(`\ncommunity-pro: ${passed} pass, ${failed} fail`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
})();
