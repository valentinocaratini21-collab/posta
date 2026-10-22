// test-ideas-email.js — Email "3 ideas para tu Instagram" (frente #2).
// Sin red real: fetch global stubbeado (captura los envíos a Resend).
// DB: node:sqlite en archivo temporal, DDL mínima (users) + la tabla
// real de ideas-email.js (ensureIdeasTables).
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
}

// ---------- stub de red (Resend) ----------
const sentMail = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('api.resend.com')) {
    sentMail.push(JSON.parse(opts.body));
    return { ok: true, status: 200, text: async () => '{"id":"test"}' };
  }
  throw new Error('red no esperada en test: ' + url);
};

// ---------- DB temporal ----------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideas-email-'));
const db = new DatabaseSync(path.join(tmpDir, 'test.db'));
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, email_opt_out INTEGER DEFAULT 0)`);

const IE = require('./ideas-email');
const { editionFor, segmentsWithEditions } = require('./ideas-editions');

function sub(email) {
  return db.prepare('SELECT * FROM ideas_subscribers WHERE email = ?').get(email);
}

(async () => {
  await t('ensureIdeasTables es idempotente', async () => {
    IE.ensureIdeasTables(db);
    IE.ensureIdeasTables(db);
    const cols = db.prepare("PRAGMA table_info(ideas_subscribers)").all().map((c) => c.name);
    for (const c of ['email', 'rubro', 'source', 'token', 'status', 'last_edition']) assert(cols.includes(c), 'falta columna ' + c);
  });

  await t('ediciones cargadas: 4 segmentos, edición 1 con 3 ideas completas', async () => {
    assert.deepStrictEqual(segmentsWithEditions().sort(), ['cafeteria', 'gimnasio', 'moda', 'peluqueria']);
    for (const seg of segmentsWithEditions()) {
      const ed = editionFor(seg, 1);
      assert(ed, 'sin edición 1 en ' + seg);
      assert.strictEqual(ed.ideas.length, 3);
      for (const it of ed.ideas) for (const k of ['titular', 'idea', 'imagen', 'caption', 'cuando', 'porque']) assert(it[k] && it[k].length > 3, `${seg}: idea sin ${k}`);
      assert.strictEqual(editionFor(seg, 2), null, seg + ': la edición 2 no debería existir todavía');
    }
  });

  await t('segmentFor: subrubro cae a la edición del padre; rubro propio manda', async () => {
    assert.strictEqual(IE.segmentFor('peluqueria'), 'peluqueria');
    assert.strictEqual(IE.segmentFor('cafe'), 'cafeteria'); // subrubro sin edición -> padre con edición
    assert.strictEqual(IE.segmentFor('moda'), 'moda');
    assert.strictEqual(IE.segmentFor(''), '');
  });

  await t('subscribe vía landing: captura SIMPLE — confirmed en el acto, sin email de confirmación (v321)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sentMail.length = 0;
    const r = await IE.subscribe(db, { email: 'Duenia@Ejemplo.com', rubro: 'peluqueria', source: 'landing' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.status, 'confirmed');
    const s = sub('duenia@ejemplo.com');
    assert(s && s.status === 'confirmed' && s.rubro === 'peluqueria' && s.token.length >= 32);
    assert(s.confirmed_at, 'confirmed_at cargado en el alta');
    assert.strictEqual(sentMail.length, 0, 'no sale ningún email de confirmación');
  });

  await t('subscribe repetido del mismo email: no duplica la fila', async () => {
    const before = db.prepare('SELECT COUNT(*) c FROM ideas_subscribers').get().c;
    const r = await IE.subscribe(db, { email: 'duenia@ejemplo.com', rubro: 'peluqueria', source: 'landing' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.already, true);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM ideas_subscribers').get().c, before);
  });

  await t('confirmByToken: token malo falla, token bueno confirma', async () => {
    assert.strictEqual(IE.confirmByToken(db, 'no-existe').ok, false);
    const s = sub('duenia@ejemplo.com');
    const r = IE.confirmByToken(db, s.token); // compat: ya está confirmed, devuelve ok
    assert.strictEqual(r.ok, true);
    assert.strictEqual(sub('duenia@ejemplo.com').status, 'confirmed');
    assert(sub('duenia@ejemplo.com').confirmed_at);
  });

  await t('subscribe con sesión (vía prueba): confirmado en el acto, sin email de confirmación', async () => {
    db.prepare('INSERT INTO users (email) VALUES (?)').run('cafe@ejemplo.com');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get('cafe@ejemplo.com');
    sentMail.length = 0;
    const r = await IE.subscribe(db, { rubro: 'cafeteria', source: 'prueba', ig_handle: '@cafedelelo' }, { sessionUser: user });
    assert.strictEqual(r.status, 'confirmed');
    assert.strictEqual(sentMail.length, 0);
    assert.strictEqual(sub('cafe@ejemplo.com').ig_handle, 'cafedelelo');
  });

  await t('subscribe: email inválido se rechaza; rubro no canónico no se adivina (queda vacío)', async () => {
    assert.strictEqual((await IE.subscribe(db, { email: 'no-es-email' })).ok, false);
    const r = await IE.subscribe(db, { email: 'raro@ejemplo.com', rubro: 'rubro-inventado', source: 'landing' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(sub('raro@ejemplo.com').rubro, '');
  });

  await t('job sin RESEND_API_KEY: omite en silencio y no marca ediciones', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await IE.sendIdeasEmails(db, { delayMs: 0 });
    assert.strictEqual(r.unconfigured, true);
    assert.strictEqual(sub('duenia@ejemplo.com').last_edition, 0);
  });

  await t('job: manda la edición 1 solo a confirmados con edición de su rubro', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    // gym confirmado; raro@ (confirmed pero sin rubro -> sin edición) no debe recibir
    db.prepare('INSERT INTO users (email) VALUES (?)').run('gym@ejemplo.com');
    const gymUser = db.prepare('SELECT * FROM users WHERE email = ?').get('gym@ejemplo.com');
    await IE.subscribe(db, { rubro: 'gimnasio', source: 'prueba' }, { sessionUser: gymUser });
    sentMail.length = 0;
    const r = await IE.sendIdeasEmails(db, { delayMs: 0 });
    assert.strictEqual(r.sent, 3, JSON.stringify(r)); // peluquería + cafetería + gimnasio
    const toPel = sentMail.find((m) => m.to[0] === 'duenia@ejemplo.com');
    assert(toPel.subject.includes('peluquería'), toPel.subject);
    assert(toPel.html.includes('Regalá un cambio de look'));
    assert(toPel.html.includes('Balayage: antes y después'));
    assert(toPel.html.includes('/api/ideas/unsubscribe?token=' + sub('duenia@ejemplo.com').token));
    assert(toPel.html.includes('/prueba'), 'el cierre lleva a la prueba gratuita');
    assert.strictEqual(sub('duenia@ejemplo.com').last_edition, 1);
    assert.strictEqual(sub('raro@ejemplo.com').last_edition, 0);
  });

  await t('job: segunda corrida no reenvía (no hay edición 2 todavía)', async () => {
    sentMail.length = 0;
    const r = await IE.sendIdeasEmails(db, { delayMs: 0 });
    assert.strictEqual(r.sent, 0);
    assert(r.skipped >= 3);
  });

  await t('baja en un clic: sale de ideas y marca email_opt_out en su cuenta', async () => {
    const s = sub('duenia@ejemplo.com');
    const r = IE.unsubscribeByToken(db, s.token);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(sub('duenia@ejemplo.com').status, 'unsubscribed');
    db.prepare('INSERT INTO users (email) VALUES (?)').run('duenia@ejemplo.com');
    IE.unsubscribeByToken(db, s.token); // idempotente; ahora sí propaga el opt-out
    assert.strictEqual(db.prepare('SELECT email_opt_out FROM users WHERE email = ?').get('duenia@ejemplo.com').email_opt_out, 1);
    sentMail.length = 0;
    const jr = await IE.sendIdeasEmails(db, { delayMs: 0 });
    assert(!sentMail.find((m) => m.to[0] === 'duenia@ejemplo.com'), 'un dado de baja no recibe');
    assert.strictEqual(jr.sent, 0);
  });

  await t('re-suscripción tras la baja: vuelve a confirmed en el acto (sin opt-in)', async () => {
    sentMail.length = 0;
    const r = await IE.subscribe(db, { email: 'duenia@ejemplo.com', rubro: 'peluqueria', source: 'landing' });
    assert.strictEqual(r.status, 'confirmed');
    assert.strictEqual(sub('duenia@ejemplo.com').status, 'confirmed');
    assert.strictEqual(sub('duenia@ejemplo.com').unsubscribed_at, '');
    assert.strictEqual(sentMail.length, 0, 'la re-alta tampoco manda confirmación');
    assert.strictEqual(IE.confirmByToken(db, sub('duenia@ejemplo.com').token).ok, true);
  });

  await t('rutas HTTP: subscribe/confirm/unsubscribe con páginas en tono Posty', async () => {
    const handlers = {};
    const fakeApp = {
      post: (p, h) => { handlers['POST ' + p] = h; },
      get: (p, h) => { handlers['GET ' + p] = h; },
    };
    IE.registerIdeasRoutes(fakeApp, db);
    const mkRes = () => ({
      code: 200, body: null,
      status(c) { this.code = c; return this; },
      json(o) { this.body = o; return this; },
      send(h) { this.body = h; return this; },
    });
    // subscribe público -> captura simple: confirmed al instante
    let res = mkRes();
    await handlers['POST /api/ideas/subscribe']({ body: { email: 'ruta@ejemplo.com', rubro: 'moda', source: 'landing' }, headers: {}, session: null }, res);
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.status, 'confirmed');
    assert(res.body.message.includes('3 ideas'));
    // confirm con el token real -> página de bienvenida
    const tok = sub('ruta@ejemplo.com').token;
    res = mkRes();
    handlers['GET /api/ideas/confirm']({ query: { token: tok } }, res);
    assert.strictEqual(res.code, 200);
    assert(res.body.includes('Ya estás adentro'));
    // confirm con token inválido -> 404
    res = mkRes();
    handlers['GET /api/ideas/confirm']({ query: { token: 'malo' } }, res);
    assert.strictEqual(res.code, 404);
    // unsubscribe -> página de despedida
    res = mkRes();
    handlers['GET /api/ideas/unsubscribe']({ query: { token: tok } }, res);
    assert.strictEqual(res.code, 200);
    assert(res.body.includes('no te escribimos más'));
    assert.strictEqual(sub('ruta@ejemplo.com').status, 'unsubscribed');
  });

  await t('migración v321: un lead de la tabla legada idea_subscribers pasa confirmed, con token, sin duplicar', async () => {
    // DDL idéntica a la del hotfix en producción (created_at epoch ms).
    db.exec(`CREATE TABLE IF NOT EXISTS idea_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
      ig_handle TEXT DEFAULT '', rubro TEXT DEFAULT '', business_name TEXT DEFAULT '',
      source TEXT DEFAULT '', created_at INTEGER NOT NULL)`);
    db.prepare('INSERT INTO idea_subscribers (email, rubro, source, created_at) VALUES (?, ?, ?, ?)')
      .run('Legado@Ejemplo.com', 'cafeteria', 'prueba', 1792576800000);
    IE.ensureIdeasTables(db);
    const s = sub('legado@ejemplo.com');
    assert(s, 'el lead legado no apareció en ideas_subscribers');
    assert.strictEqual(s.status, 'confirmed');
    assert.strictEqual(s.rubro, 'cafeteria');
    assert(String(s.created_at).includes('-'), 'created_at epoch convertido a fecha: ' + s.created_at);
    assert(s.token && s.token.length >= 32, 'token de baja generado para el migrado');
    const n = db.prepare('SELECT COUNT(*) c FROM ideas_subscribers').get().c;
    IE.ensureIdeasTables(db); // idempotente: correr de nuevo no duplica
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM ideas_subscribers').get().c, n);
  });

  global.fetch = realFetch;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  console.log(`\ntest-ideas-email: ${passed} ok, ${failed} fallidos`);
  if (failures.length) { console.log(failures.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
