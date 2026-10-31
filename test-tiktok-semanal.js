'use strict';
/* test-tiktok-semanal.js — LOTE 7: TikTok semanal opt-in.
 * Corre: node test-tiktok-semanal.js
 * Cero red real: el módulo TikTok va por fake inyectado (deps.tiktok).
 * La puerta dura se prueba de verdad: sin TIKTOK_AUDITED=1 el camino
 * automático no toca la red (el fake cuenta llamadas) ni escribe filas.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const sem = require('./tiktok-semanal.js');

let pass = 0, fail = 0;
function t(nombre, fn) {
  try { fn(); pass++; console.log('PASS ' + nombre); }
  catch (e) { fail++; console.log('FAIL ' + nombre + ' :: ' + (e && e.message)); }
}
async function ta(nombre, fn) {
  try { await fn(); pass++; console.log('PASS ' + nombre); }
  catch (e) { fail++; console.log('FAIL ' + nombre + ' :: ' + (e && e.message)); }
}

function freshDb() {
  const db = new DatabaseSync(':memory:');
  sem.ensureTables(db);
  return db;
}

function fakeTt(opts) {
  const calls = { getAccount: 0, getValidToken: 0, publishVideo: 0 };
  return {
    calls,
    getAccount: (db, uid) => { calls.getAccount++; return (opts && opts.account) || null; },
    getValidToken: async (db, uid) => { calls.getValidToken++; return (opts && ('token' in opts)) ? opts.token : 'tok'; },
    publishVideo: async (a) => {
      calls.publishVideo++;
      if (opts && opts.publishError) throw new Error(opts.publishError);
      return { publishId: 'pub1', privacyLevel: (opts && opts.privacy) || 'PUBLIC_TO_EVERYONE' };
    },
  };
}

function rows(db) {
  return db.prepare('SELECT * FROM tiktok_publishes ORDER BY id').all();
}

const savedAudit = process.env.TIKTOK_AUDITED;

(async () => {
  // 1. Sin auditoría: nada hacia TikTok, ni siquiera una fila.
  await ta('sin_auditoria: skipped puro, cero llamadas, cero filas', async () => {
    delete process.env.TIKTOK_AUDITED;
    const db = freshDb();
    sem.setOptin(db, 1, true);
    const tt = fakeTt({ account: { access_token: 'x' } });
    const r = await sem.publishWeeklyBestEffort(db, { userId: 1, postId: 10, videoUrl: 'https://x/v.mp4', title: 't' }, { tiktok: tt });
    assert.equal(r.skipped, 'sin_auditoria');
    assert.equal(tt.calls.getAccount, 0);
    assert.equal(tt.calls.getValidToken, 0);
    assert.equal(tt.calls.publishVideo, 0);
    assert.equal(rows(db).length, 0);
  });

  // 2. Con auditoría, sin opt-in.
  await ta('audit + sin optin: skipped sin_optin + fila', async () => {
    process.env.TIKTOK_AUDITED = '1';
    const db = freshDb();
    const tt = fakeTt({ account: { access_token: 'x' } });
    const r = await sem.publishWeeklyBestEffort(db, { userId: 1, postId: 10, videoUrl: 'https://x/v.mp4', title: 't' }, { tiktok: tt });
    assert.equal(r.skipped, 'sin_optin');
    assert.equal(tt.calls.publishVideo, 0);
    assert.equal(rows(db).length, 1);
    assert.equal(rows(db)[0].status, 'skipped');
    assert.equal(rows(db)[0].error, 'sin_optin');
  });

  // 3. Opt-in, sin conexión.
  await ta('audit + optin + sin conexion: skipped sin_conexion', async () => {
    const db = freshDb();
    sem.setOptin(db, 1, true);
    const tt = fakeTt({ account: null });
    const r = await sem.publishWeeklyBestEffort(db, { userId: 1, postId: 10, videoUrl: 'https://x/v.mp4', title: 't' }, { tiktok: tt });
    assert.equal(r.skipped, 'sin_conexion');
    assert.equal(rows(db)[0].error, 'sin_conexion');
  });

  // 4. Opt-in, conexión, sin token.
  await ta('audit + optin + conexion + sin token: skipped sin_token', async () => {
    const db = freshDb();
    sem.setOptin(db, 1, true);
    const tt = fakeTt({ account: { access_token: 'x' }, token: null });
    const r = await sem.publishWeeklyBestEffort(db, { userId: 1, postId: 10, videoUrl: 'https://x/v.mp4', title: 't' }, { tiktok: tt });
    assert.equal(r.skipped, 'sin_token');
  });

  // 5. Camino feliz PUBLIC.
  await ta('audit + optin + conexion + token: published PUBLIC', async () => {
    const db = freshDb();
    sem.setOptin(db, 1, true);
    const tt = fakeTt({ account: { access_token: 'x' }, privacy: 'PUBLIC_TO_EVERYONE' });
    const r = await sem.publishWeeklyBestEffort(db, { userId: 1, postId: 10, videoUrl: 'https://x/v.mp4', title: 't' }, { tiktok: tt });
    assert.equal(r.ok, true);
    assert.equal(r.status, 'published');
    assert.equal(rows(db)[0].tiktok_publish_id, 'pub1');
  });

  // 6. Camino feliz SELF_ONLY → private.
  await ta('privacy SELF_ONLY: private', async () => {
    const db = freshDb();
    sem.setOptin(db, 1, true);
    const tt = fakeTt({ account: { access_token: 'x' }, privacy: 'SELF_ONLY' });
    const r = await sem.publishWeeklyBestEffort(db, { userId: 1, postId: 10, videoUrl: 'https://x/v.mp4', title: 't' }, { tiktok: tt });
    assert.equal(r.status, 'private');
  });

  // 7. Fallo de red → failed, sin lanzar.
  await ta('publish tira: failed + fila, nunca lanza', async () => {
    const db = freshDb();
    sem.setOptin(db, 1, true);
    const tt = fakeTt({ account: { access_token: 'x' }, publishError: 'boom red' });
    const r = await sem.publishWeeklyBestEffort(db, { userId: 1, postId: 10, videoUrl: 'https://x/v.mp4', title: 't' }, { tiktok: tt });
    assert.equal(r.failed, true);
    assert.equal(rows(db)[0].status, 'failed');
  });

  // 8. Tope diario.
  await ta('tope diario 15: skipped tope_diario', async () => {
    const db = freshDb();
    sem.setOptin(db, 1, true);
    for (let i = 0; i < 15; i++) {
      db.prepare(`INSERT INTO tiktok_publishes (user_id, post_id, status) VALUES (1, ?, 'published')`).run(100 + i);
    }
    const tt = fakeTt({ account: { access_token: 'x' } });
    const r = await sem.publishWeeklyBestEffort(db, { userId: 1, postId: 10, videoUrl: 'https://x/v.mp4', title: 't' }, { tiktok: tt });
    assert.equal(r.skipped, 'tope_diario');
    assert.equal(tt.calls.publishVideo, 0);
  });

  // 9. Sin video.
  await ta('sin videoUrl: skipped sin_video', async () => {
    const db = freshDb();
    sem.setOptin(db, 1, true);
    const tt = fakeTt({ account: { access_token: 'x' } });
    const r = await sem.publishWeeklyBestEffort(db, { userId: 1, postId: 10, videoUrl: '', title: 't' }, { tiktok: tt });
    assert.equal(r.skipped, 'sin_video');
  });

  // 10. Opt-in roundtrip + lastPublishes.
  t('setOptin/getOptin + lastPublishes orden', () => {
    const db = freshDb();
    assert.equal(sem.getOptin(db, 7), false);
    assert.equal(sem.setOptin(db, 7, true), true);
    assert.equal(sem.getOptin(db, 7), true);
    assert.equal(sem.setOptin(db, 7, false), false);
    assert.equal(sem.getOptin(db, 7), false);
    for (let i = 0; i < 7; i++) {
      db.prepare(`INSERT INTO tiktok_publishes (user_id, post_id, status) VALUES (7, ?, 'published')`).run(200 + i);
    }
    const last = sem.lastPublishes(db, 7, 5);
    assert.equal(last.length, 5);
    assert.equal(last[0].post_id, 206);
  });

  // 11. Cableado estático en el árbol.
  t('cableado: scheduler hook + rutas + UI semanal', () => {
    const srv = fs.readFileSync(__dirname + '/server.js', 'utf8');
    const sch = fs.readFileSync(__dirname + '/scheduler.js', 'utf8');
    const chk = fs.readFileSync(__dirname + '/public/chunk-ajustes.js', 'utf8');
    assert.ok(srv.includes("require('./tiktok-semanal')"), 'server require tiktok-semanal');
    assert.ok(srv.includes("app.post('/api/tiktok/optin'"), 'ruta optin');
    assert.ok(srv.includes('semanal'), 'status extiende semanal');
    assert.ok(sch.includes('publishWeeklyBestEffort'), 'scheduler hook');
    assert.ok(sch.includes("post.media_type === 'video'"), 'hook solo video');
    assert.ok(chk.includes('ttSemanal'), 'UI semanal en chunk-ajustes');
    assert.ok(chk.includes('/api/tiktok/optin'), 'UI llama optin');
  });

  if (savedAudit === undefined) delete process.env.TIKTOK_AUDITED;
  else process.env.TIKTOK_AUDITED = savedAudit;
  console.log(`\n${pass} ok, ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})();
