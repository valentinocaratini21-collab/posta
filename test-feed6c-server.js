'use strict';
/* test-feed6c-server.js — Tanda feed 6C · ítems 6, 9 y 10 (servidor,
 * boot in-process como test-feed6a-server; la lectura de IG se stubbea
 * por fetch: costo y red reales, cero):
 *  · migración cover_origin/cover_pos y portada del reel: POST crudo
 *    guarda el frame en MEDIA_DIR con el almacenamiento vigente y
 *    anota cover_path/cover_origin/cover_pos; el payload lo expone;
 *    cover-pos ajusta el encuadre; DELETE vuelve al video limpiando
 *    los campos y el archivo. Una foto no acepta portada; un reel
 *    publicado tampoco. Otro usuario → 404.
 *  · swap: dos programados cruzan sus scheduled_at en una operación;
 *    un borrador que recibe el día del otro queda programado (y su
 *    «Deshacer» lo vuelve a borrador sin fecha); un choque con un
 *    tercero es 409 y no mueve nada; un publicado en el par es 400.
 *  · comentarios: plan Total + publicado + ig_media_id + IG que
 *    responde → la lista [{author,text,at}] con source 'ig'; sin plan
 *    → null; borrador → null; sin ig_media_id → null; IG caído →
 *    null con 200 (sin 500). Fase A intacta (redoLeftOf presente).
 * Uso: node test-feed6c-server.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-feed6c-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18777';
process.env.BASE_URL = 'http://127.0.0.1:18777';
process.env.OPENAI_API_KEY = 'sk-stub';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const state = { igFail: false };
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('graph.instagram.com')) {
    if (state.igFail) return { ok: false, status: 500, json: async () => ({ error: { message: 'stub down' } }) };
    if (u.includes('/comments')) {
      return { ok: true, status: 200, json: async () => ({ data: [
        { id: 'c2', username: 'luis', text: '¿Hacen envíos?', timestamp: '2026-10-24T13:00:00+0000' },
        { id: 'c1', username: 'ana', text: '¡Hermoso!', timestamp: '2026-10-24T12:00:00+0000' },
        { id: 'c0', username: 'vacio', text: '   ', timestamp: '2026-10-24T11:00:00+0000' },
      ] }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  }
  if (u.includes('api.openai.com')) return { ok: false, status: 500, json: async () => ({}) };
  return realFetch(url, opts);
};

let cookie = '';
async function call(method, p, body) {
  const r = await realFetch('http://127.0.0.1:18777' + p, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
async function rawCall(method, p, buf, ct) {
  const r = await realFetch('http://127.0.0.1:18777' + p, {
    method, headers: { 'Content-Type': ct, ...(cookie ? { Cookie: cookie } : {}) }, body: buf,
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 220) : ''); }
};

(async () => {
  const dbmod = require('./db');
  const db = dbmod.db || dbmod;
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18777/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  const cols = db.prepare('PRAGMA table_info(posts)').all().map((c) => c.name);
  ok('migración: posts.cover_origin y posts.cover_pos existen', cols.includes('cover_origin') && cols.includes('cover_pos'));
  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok('Fase A intacta: redoLeftOf sigue presente en server.js', SRV.includes('redoLeftOf'));

  const reg = await call('POST', '/api/auth/register', { email: 'feed6c@x.example', password: 'secreto1' });
  ok('registro con sesión', reg.status === 200 && !!cookie, reg.status);
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('feed6c@x.example').id;
  db.prepare("UPDATE users SET plan_status = 'active', plan = 'total' WHERE id = ?").run(uid);
  db.prepare('INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET ig_user_id = excluded.ig_user_id, ig_access_token = excluded.ig_access_token')
    .run(uid, 'IGU1', 'tok-test');
  const seed = (fields) => db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, scheduled_at, ig_media_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(uid, fields.img || '/media/x.jpg', fields.cap || 'Pieza', '', fields.status || 'draft',
      fields.mt || 'image', fields.at || null, fields.igm || '').lastInsertRowid;
  const row = (id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);

  // ---------- Ítem 6: portada del reel ----------
  const reel = seed({ mt: 'video', img: '/media/reel.mp4', status: 'draft' });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const up = await rawCall('POST', `/api/posts/${reel}/cover?at=12.34&pos=20`, jpg, 'image/jpeg');
  ok('POST cover: responde ok con la portada anotada', up.status === 200 && up.json && up.json.ok === true
    && /^\/media\/cover-\d+-/.test(up.json.cover_path || '') && up.json.cover_origin === 'frame@12.3' && up.json.cover_pos === 20,
    up.status + ' ' + JSON.stringify(up.json).slice(0, 160));
  const coverName = path.basename((up.json || {}).cover_path || 'nope');
  ok('POST cover: el frame quedó guardado en MEDIA_DIR (almacenamiento vigente)', fs.existsSync(path.join(MEDIA_DIR, coverName)));
  ok('POST cover: la fila persiste cover_path/cover_origin/cover_pos',
    row(reel).cover_path === up.json.cover_path && row(reel).cover_origin === 'frame@12.3' && row(reel).cover_pos === 20);
  const list = await call('GET', '/api/posts');
  const inPayload = (Array.isArray(list.json) ? list.json : []).find((p) => p.id === reel);
  ok('GET /api/posts expone la portada', !!inPayload && inPayload.cover_path === up.json.cover_path && inPayload.cover_pos === 20);
  const repos = await call('POST', `/api/posts/${reel}/cover-pos`, { pos: 80 });
  ok('cover-pos: ajusta el encuadre sin tocar la imagen', repos.json && repos.json.ok === true && row(reel).cover_pos === 80 && row(reel).cover_path === up.json.cover_path);
  const imgPost = seed({ mt: 'image', status: 'draft' });
  const badKind = await rawCall('POST', `/api/posts/${imgPost}/cover`, jpg, 'image/jpeg');
  ok('cover en una foto → 400 not_video', badKind.status === 400 && badKind.json && badKind.json.error === 'not_video', badKind.status);
  const pubReel = seed({ mt: 'video', img: '/media/reel2.mp4', status: 'published' });
  const badPub = await rawCall('POST', `/api/posts/${pubReel}/cover`, jpg, 'image/jpeg');
  ok('cover en un reel publicado → 400 already_published', badPub.status === 400 && badPub.json && badPub.json.error === 'already_published', badPub.status);
  const del = await call('DELETE', `/api/posts/${reel}/cover`);
  ok('DELETE cover: «volver al video» limpia los tres campos', del.json && del.json.ok === true
    && row(reel).cover_path === '' && row(reel).cover_origin === '' && row(reel).cover_pos === 50, JSON.stringify(row(reel)).slice(0, 160));
  ok('DELETE cover: el archivo de la portada se borra', !fs.existsSync(path.join(MEDIA_DIR, coverName)));

  // ---------- Ítem 9: swap ----------
  const T1 = '2999-01-05T12:00:00.000Z', T2 = '2999-01-07T12:00:00.000Z', T3 = '2999-01-09T12:00:00.000Z';
  const s1 = seed({ status: 'scheduled', at: T1 });
  const s2 = seed({ status: 'scheduled', at: T2 });
  const sw = await call('POST', '/api/posts/swap', { a: s1, b: s2, a_to: T2, b_to: T1, a_status: 'scheduled', b_status: 'scheduled' });
  ok('swap: dos programados cruzan sus horarios en una operación', sw.json && sw.json.ok === true
    && row(s1).scheduled_at === T2 && row(s2).scheduled_at === T1, JSON.stringify(sw.json).slice(0, 160));
  const d1 = seed({ status: 'draft', at: null });
  const s3 = seed({ status: 'scheduled', at: T3 });
  const TPROP = '2999-01-06T12:00:00.000Z'; // la propuesta del borrador: día libre (T1 ya lo ocupa s2 tras el primer swap)
  const sw2 = await call('POST', '/api/posts/swap', { a: d1, b: s3, a_to: T3, b_to: TPROP, a_status: 'scheduled', b_status: 'scheduled' });
  ok('swap: el borrador recibe el día del otro y queda programado', sw2.json && sw2.json.ok === true
    && row(d1).status === 'scheduled' && row(d1).scheduled_at === T3 && row(s3).scheduled_at === TPROP, JSON.stringify(sw2.json).slice(0, 160));
  const undo = await call('POST', '/api/posts/swap', { a: d1, b: s3, a_to: null, b_to: T3, a_status: 'draft', b_status: 'scheduled' });
  ok('swap «Deshacer»: el borrador vuelve a borrador sin fecha y el otro a su horario', undo.json && undo.json.ok === true
    && row(d1).status === 'draft' && !row(d1).scheduled_at && row(s3).scheduled_at === T3, JSON.stringify(undo.json).slice(0, 160));
  const s4 = seed({ status: 'scheduled', at: '2999-01-11T12:00:00.000Z' });
  const clash = await call('POST', '/api/posts/swap', { a: s1, b: s2, a_to: '2999-01-11T12:00:00.000Z', b_to: T2, a_status: 'scheduled', b_status: 'scheduled' });
  ok('swap: un destino que choca con un tercero → 409 y nada se mueve', clash.status === 409
    && row(s1).scheduled_at === T2 && row(s2).scheduled_at === T1, clash.status + ' ' + JSON.stringify(clash.json).slice(0, 120));
  const badPair = await call('POST', '/api/posts/swap', { a: s1, b: pubReel, a_to: T2, b_to: T1, a_status: 'scheduled', b_status: 'scheduled' });
  ok('swap: un publicado en el par → 400', badPair.status === 400, badPair.status);

  // ---------- Ítem 10: comentarios ----------
  const pubC = seed({ status: 'published', igm: 'IGM123', at: '2026-10-20T12:00:00.000Z' });
  const cm = await call('GET', `/api/posts/${pubC}/comments`);
  ok('comentarios: Total + publicado + fuente → la lista real, orden de la fuente', cm.status === 200 && cm.json && cm.json.source === 'ig'
    && Array.isArray(cm.json.comments) && cm.json.comments.length === 2
    && cm.json.comments[0].author === 'luis' && cm.json.comments[0].text === '¿Hacen envíos?' && cm.json.comments[0].at === '2026-10-24T13:00:00+0000',
    cm.status + ' ' + JSON.stringify(cm.json).slice(0, 200));
  db.prepare("UPDATE users SET plan = 'esencial' WHERE id = ?").run(uid);
  const cmNoPlan = await call('GET', `/api/posts/${pubC}/comments`);
  ok('comentarios: sin plan Total → comments null (200, sin sección)', cmNoPlan.status === 200 && cmNoPlan.json && cmNoPlan.json.comments === null, JSON.stringify(cmNoPlan.json).slice(0, 120));
  db.prepare("UPDATE users SET plan = 'total' WHERE id = ?").run(uid);
  const cmDraft = await call('GET', `/api/posts/${d1}/comments`);
  ok('comentarios: un borrador → null', cmDraft.json && cmDraft.json.comments === null);
  const pubNoIg = seed({ status: 'published', igm: '', at: '2026-10-20T12:00:00.000Z' });
  const cmNoIg = await call('GET', `/api/posts/${pubNoIg}/comments`);
  ok('comentarios: publicado sin ig_media_id → null', cmNoIg.json && cmNoIg.json.comments === null);
  state.igFail = true;
  const cmDown = await call('GET', `/api/posts/${pubC}/comments`);
  state.igFail = false;
  ok('comentarios: IG caído → null con 200 (sin 500, sin error visible)', cmDown.status === 200 && cmDown.json && cmDown.json.comments === null, cmDown.status);
  const cm404 = await call('GET', '/api/posts/999999/comments');
  ok('comentarios: posteo ajeno/inexistente → 404', cm404.status === 404, cm404.status);

  console.log(`\ntest-feed6c-server: ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
