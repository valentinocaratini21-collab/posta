'use strict';
// test-lote-banner-revision.js — BANNER-REVISION (12/11 · investigado 11/11
// 21:53): el banner «Tenés N posteos para revisar» contaba posteos que no
// se ven en ningún lado ni se pueden accionar (el «2» eran los borradores
// 591 — bloqueado por superlativo — y 584 — video viejo del 9/11 —,
// invisibles en el feed) y su botón llevaba al chat por construcción.
// El fix: el conteo es EXACTAMENTE lo que la lista de revisión muestra
// con acción visible (pzHoyRevisionContar: todos los borradores de
// /api/posts + programados pendientes en manual) y el botón lleva a ESA
// lista (#/app/schedule, «Revisá tu semana»), no al chat. Un borrador
// en revisión (needs_review=1) nunca llega al conteo: GET /api/posts lo
// filtra y PATCH lo rechaza con 403 in_review.
// Node puro: estáticos + VM (app.js) + boot real con siembra en SQLite.
// Uso: DATA_DIR temporal + NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-banner-revision.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

// El árbol es el directorio de la suite: el release del builder acá, la
// raíz del repo en main. Los temporales van FUERA del árbol.
const SCRATCH = __dirname;
const TREE = SCRATCH;
const TMPBASE = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(TMPBASE, '.tmp-test-'));
process.env.TMPDIR = TMP;

let ok = 0, bad = 0;
const FAILURES = [];
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; FAILURES.push(name); console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const idxES = fs.readFileSync(path.join(TREE, 'public/index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(TREE, 'public/en/index.html'), 'utf8');

// Extrae una function declaration por nombre (balanceo de llaves).
function extractFn(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i === -1) return '';
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let d = 0, j = src.indexOf('{', i);
  if (j === -1) return '';
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

(async () => {
  // ---------- 1. Estampado (provisional: el preparador re-numera) ----------
  t(srv.includes("const BUILD_ID = '20261105-v939';"), 'server: BUILD v891');
  t(cnt(srv, '20261105-v939') === 1, 'server: BUILD v891 ×1');
  t(!srv.includes('20261105-v938'), 'server: sin restos de v938');
  t(idxES.includes('/app.js?v=649'), 'index ES: app.js?v=649');
  t(cnt(idxES, 'app.js?v=649') === 1, 'index ES: app.js?v=649 ×1');
  t(idxES.includes('/styles.css?v=20261270'), 'index ES: styles?v=20261270 sin cambio (el lote no toca styles.css)');
  t(idxEN.includes('/styles.css?v=20261270'), 'index EN: styles?v=20261270 (mismo valor que ES)');
  t(!idxEN.includes('/app.js?v='), 'index EN: no carga app.js (landing)');
  t(!app.includes('20261105-v938') && !idxES.includes('v=648'), 'sin restos de v938 (?v=648)');

  // ---------- 2. Estáticos: el contrato conteo == lista ----------
  // La lista es #/app/schedule: reviewCardHTML lista los borradores con
  // Aceptar / Editar / No me gusta / Publicar ahora.
  t(app.includes('function reviewCardHTML(drafts, slots, title)'), 'schedule: reviewCardHTML existe');
  t(app.includes('data-revaccept='), 'schedule: la lista tiene Aceptar (data-revaccept)');
  t(app.includes('data-revedit='), 'schedule: la lista tiene Editar (data-revedit)');
  t(app.includes('data-revdislike='), 'schedule: la lista tiene No me gusta (data-revdislike)');
  t(app.includes("bbGo('#/app/schedule')") || app.includes("location.hash = '#/app/schedule'"), 'pzHoyBind: el botón de revisión lleva a #/app/schedule');
  // El botón del banner: cuando hay algo para revisar lleva a la lista,
  // no al chat.
  t(app.includes('data-pz-hoy-revision="1"'), 'banner: existe data-pz-hoy-revision');
  t(app.includes("root.querySelectorAll('[data-pz-hoy-revision]')"), 'pzHoyBind: cablea data-pz-hoy-revision');
  t(cnt(app, 'function pzHoyRevisionContar(') === 1, 'M78: pzHoyRevisionContar definida ×1');
  t(app.includes('pzHoyRevisionContar(allPosts, hoyKeyR1, tz, modoR1.manual)'), 'M78: el caller usa pzHoyRevisionContar');
  // El borrador bloqueado no se cuenta: GET /api/posts lo filtra y PATCH
  // lo rechaza — nunca llega al conteo ni a la lista.
  t(srv.includes('COALESCE(p.needs_review, 0) = 0'), 'server: GET /api/posts excluye needs_review=1 («en revisión no se muestra»)');
  t(srv.includes("error: 'in_review'"), 'server: PATCH rechaza el posteo en revisión con 403 in_review');
  // La tira NO es la lista: el detalle de un borrador no tiene aprobar.
  t(!/function pzHoyTiraDetalleHTML[\s\S]{0,4000}data-pz-hoy-aprobar/.test(app), 'tira: el detalle del día NO tiene botón aprobar (no es la lista)');

  // ---------- 3. VM: pzHoyRevisionContar ----------
  const pcParseDateStub = `(iso) => { try { const s = String(iso || '').replace(' ', 'T'); const d = new Date(/[zZ]$|[+-]\\d{2}:?\\d{2}$/.test(s) ? s : s + 'Z'); return isNaN(d) ? null : d; } catch (e) { return null; } }`;
  const contarSrc = extractFn(app, 'schedDayKeyOf') + '\n'
    + 'const pcParseDate = ' + pcParseDateStub + ';\n'
    + extractFn(app, 'pzHoyPostDiaKey') + '\n'
    + extractFn(app, 'pzHoyRevisionContar');
  t(contarSrc.includes('function pzHoyRevisionContar('), 'VM: pzHoyRevisionContar extraída');
  t(contarSrc.includes('function pzHoyPostDiaKey('), 'VM: pzHoyPostDiaKey extraída');
  const contarCtx = {};
  vm.createContext(contarCtx);
  vm.runInContext(contarSrc + '\nthis.__c = { pzHoyRevisionContar };', contarCtx);
  const contar = contarCtx.__c.pzHoyRevisionContar;
  const TZ = 'UTC', HOY = '2026-11-12';
  const d591 = { id: 591, status: 'draft', media_type: 'image', caption: 'x', week_key: '2026-11-09' };
  const d584 = { id: 584, status: 'draft', media_type: 'video', caption: 'y', week_key: '2026-11-09' };
  const dViejo = { id: 500, status: 'draft', media_type: 'image', caption: 'z', week_key: '2026-11-02' };
  const sManana = { id: 601, status: 'scheduled', approval: 'pending', scheduled_at: '2026-11-13T19:00:00Z' };
  const sHoy = { id: 602, status: 'scheduled', approval: 'pending', scheduled_at: '2026-11-12T19:00:00Z' };
  const sAprob = { id: 603, status: 'scheduled', approval: 'approved', scheduled_at: '2026-11-13T19:00:00Z' };
  const sPasado = { id: 604, status: 'scheduled', approval: 'pending', scheduled_at: '2026-11-10T19:00:00Z' };
  const sSinDia = { id: 605, status: 'scheduled', approval: 'pending' };
  const pub = { id: 610, status: 'published', published_at: '2026-11-11T19:00:00Z' };
  const story = { id: 620, status: 'draft', media_type: 'story' };
  // El caso exacto del 11/11: los 2 borradores cuentan (están en la lista).
  let r = contar([d591, d584], HOY, TZ, true);
  t(r.needOK === 2 && r.drafts.length === 2, 'conteo: el caso 11/11 (591+584) da 2', JSON.stringify(r));
  r = contar([d591, d584], HOY, TZ, false);
  t(r.needOK === 2 && r.schedSolo === 0, 'conteo: el caso 11/11 da 2 también en autopilot', JSON.stringify(r));
  // Mixto: borrador viejo SÍ cuenta (la lista lo muestra); aprobado,
  // publicado, pasado, sin día y la historia NO.
  const mixto = [d591, d584, dViejo, sManana, sHoy, sAprob, sPasado, sSinDia, pub, story];
  r = contar(mixto, HOY, TZ, true);
  t(r.needOK === 5 && r.drafts.length === 3 && r.schedPend.length === 2, 'conteo manual: 3 borradores + 2 programados pendientes = 5', JSON.stringify(r));
  t(r.schedSolo === 0, 'conteo manual: schedSolo 0');
  r = contar(mixto, HOY, TZ, false);
  t(r.needOK === 3 && r.schedSolo === 2, 'conteo autopilot: solo los 3 borradores; los 2 programados salen solos', JSON.stringify(r));
  r = contar([], HOY, TZ, true);
  t(r.needOK === 0 && r.schedSolo === 0, 'conteo: vacío da 0');
  r = contar([sAprob, pub], HOY, TZ, true);
  t(r.needOK === 0, 'conteo: solo aprobado/publicado da 0');
  r = contar([sSinDia], HOY, TZ, true);
  t(r.needOK === 0, 'conteo: programado sin día no cuenta (no se ve en el calendario)');
  r = contar(null, HOY, TZ, true);
  t(r.needOK === 0, 'conteo: sin datos no rompe (fail-closed 0)');

  // ---------- 4. VM: pzHoySpeechHTML ----------
  const speechSrc = extractFn(app, 'pzHoySpeechHTML');
  t(speechSrc.length > 500, 'VM: pzHoySpeechHTML extraída');
  // El texto de REVISIÓN (needOK > 0) ya no dice «en tu feed»: la frase
  // «los ves en tu feed» que queda es la del caso needOK=0 (autopilot,
  // programados que salen solos y sí se ven en la tira con su día).
  const revLines = speechSrc.split('\n').filter((l) => l.includes('para revisar') || l.includes('to review'));
  t(revLines.length > 0 && revLines.every((l) => !l.includes('feed')), 'banner: el texto de revisión ya no dice «en tu feed»', revLines.join(' | ').slice(0, 300));
  t(speechSrc.includes('en tu revisión') && speechSrc.includes('in your review'), 'banner: el texto dice «en tu revisión» (ES/EN)');
  const speechCtx = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    pzIsPubReal: (p) => !!(p && String(p.status || '') === 'published' && String(p.ig_media_id || '').indexOf('demo_') !== 0),
    pzHoyHoraCorta: () => '',
  };
  vm.createContext(speechCtx);
  vm.runInContext(speechSrc + '\nthis.__s = { pzHoySpeechHTML };', speechCtx);
  const speech = speechCtx.__s.pzHoySpeechHTML;
  let h = speech({ hoyPost: null, pendientes: 2, haySemana: true, en: false, tz: TZ, manual: false, needOK: 2, schedSolo: 0 });
  t(h.includes('data-pz-hoy-revision="1"'), 'banner needOK=2: el botón lleva a la lista (data-pz-hoy-revision)');
  t(!h.includes('data-pz-hoy-chat'), 'banner needOK=2: el botón NO lleva al chat');
  t(h.includes('2 posteos para revisar') && h.includes('en tu revisión'), 'banner needOK=2: texto «2 posteos para revisar en tu revisión»');
  t(!h.includes('«Dale»') && h.includes('aceptá'), 'banner needOK=2: dice «aceptá», no «dale Dale» (la lista tiene Aceptar)');
  h = speech({ hoyPost: null, pendientes: 1, haySemana: true, en: false, tz: TZ, manual: true, needOK: 1, schedSolo: 0 });
  t(h.includes('1 posteo para revisar') && h.includes('data-pz-hoy-revision="1"'), 'banner needOK=1: singular + botón a la lista');
  h = speech({ hoyPost: null, pendientes: 0, haySemana: true, en: false, tz: TZ, manual: false, needOK: 0, schedSolo: 0 });
  t(h.includes('data-pz-hoy-chat') && !h.includes('data-pz-hoy-revision'), 'banner needOK=0 (semana aprobada): el botón sigue al chat');
  t(h.includes('Tu semana ya está aprobada'), 'banner needOK=0: texto de semana aprobada');
  h = speech({ hoyPost: null, pendientes: 0, haySemana: false, en: false, tz: TZ, manual: false, needOK: 0, schedSolo: 0 });
  t(h.includes('data-pz-hoy-chat') && h.includes('¿Armamos tu semana?'), 'banner sin semana: invita al chat');
  h = speech({ hoyPost: { id: 610, status: 'published', published_at: '2026-11-11T19:00:00Z' }, pendientes: 2, haySemana: true, en: false, tz: TZ, manual: false, needOK: 2, schedSolo: 0 });
  t(h.includes('data-pz-hoy-revision="1"') && h.includes('en tu revisión'), 'banner hoy publicado + needOK=2: también lleva a la lista');
  h = speech({ hoyPost: null, pendientes: 2, haySemana: true, en: true, tz: TZ, manual: false, needOK: 2, schedSolo: 0 });
  t(h.includes('in your review') && !h.includes('in your feed') && h.includes('data-pz-hoy-revision="1"'), 'banner EN needOK=2: «in your review» + botón a la lista');

  // ---------- 5. Boot real + filtro needs_review en vivo ----------
  const BOOT = fs.mkdtempSync(path.join(TMPBASE, '.tmp-boot-'));
  const BOOT_DATA = path.join(BOOT, 'data');
  fs.mkdirSync(BOOT_DATA, { recursive: true });
  fs.cpSync(TREE, BOOT, { recursive: true });
  const PORT = 34711;
  const envBoot = Object.assign({}, process.env, {
    DATA_DIR: BOOT_DATA, PORT: String(PORT),
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    TZ: 'America/Argentina/Buenos_Aires',
  });
  const child = spawn('node', ['server.js'], { cwd: BOOT, env: envBoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let version = null;
  for (let i = 0; i < 160 && !version; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
      if (r.ok) version = await r.json();
    } catch (e) { /* aún no levanta */ }
    if (!version) await sleep(500);
  }
  t(version && version.build === '20261105-v939', 'boot: /api/version = v891', JSON.stringify(version));
  if (version) {
    let ok5 = 0;
    for (let i = 0; i < 5; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); const j = await r.json(); if (j && j.build === '20261105-v939') ok5++; } catch (e) {}
    }
    t(ok5 === 5, 'boot: /api/version 5/5', ok5 + '/5');
    const idx = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
    t(idx.includes('/app.js?v=649') && idx.includes('/styles.css?v=20261270'), 'boot: el index servido trae ?v=649 y styles?v=20261270');
    const bundle = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=649`)).text();
    t(bundle.includes('function pzHoyRevisionContar(') && bundle.includes('data-pz-hoy-revision'), 'boot: el bundle trae la función nueva y el botón a la lista');
    // Usuario de prueba + siembra: un borrador visible, uno bloqueado
    // (needs_review=1) y un programado pendiente.
    const reg = await fetch(`http://127.0.0.1:${PORT}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'banner-test@postyhacetodo.com', password: 'test123456', terms_accepted: true }),
    });
    const regJ = await reg.json().catch(() => ({}));
    const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
    t(reg.ok && regJ.ok === true && cookie.length > 0, 'boot: registro de usuario de prueba', reg.status + ' ' + JSON.stringify(regJ).slice(0, 200));
    if (reg.ok && cookie) {
      const dbFile = path.join(BOOT_DATA, 'posta.db');
      const db = new DatabaseSync(dbFile);
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get('banner-test@postyhacetodo.com');
      t(!!u && !!u.id, 'boot: el usuario de prueba existe en la DB', JSON.stringify(u));
      if (u && u.id) {
        const col = db.prepare("SELECT name FROM pragma_table_info('posts') WHERE name = 'needs_review'").get();
        t(!!col, 'boot: la columna needs_review existe en DB fresca');
        const ins = db.prepare('INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, needs_review, week_key, scheduled_at) VALUES (?,?,?,?,?,?,?,?,?)');
        const rVis = ins.run(u.id, '/media/test-visible.jpg', 'borrador visible', '', 'draft', 'image', 0, '2026-11-09', null);
        const rBloq = ins.run(u.id, '/media/test-bloqueado.jpg', 'borrador bloqueado por superlativo', '', 'draft', 'image', 1, '2026-11-09', null);
        const rProg = ins.run(u.id, '/media/test-programado.jpg', 'programado pendiente', '', 'scheduled', 'image', 0, '2026-11-09', '2026-11-13T19:00:00Z');
        const list = await (await fetch(`http://127.0.0.1:${PORT}/api/posts`, { headers: { cookie } })).json().catch(() => null);
        const ids = Array.isArray(list) ? list.map((p) => Number(p.id)) : [];
        t(ids.includes(Number(rVis.lastInsertRowid)), 'boot vivo: GET /api/posts trae el borrador visible', JSON.stringify(ids));
        t(ids.includes(Number(rProg.lastInsertRowid)), 'boot vivo: GET /api/posts trae el programado pendiente', JSON.stringify(ids));
        t(!ids.includes(Number(rBloq.lastInsertRowid)), 'boot vivo: GET /api/posts NO trae el borrador bloqueado (needs_review=1)', JSON.stringify(ids));
        const det = await fetch(`http://127.0.0.1:${PORT}/api/posts/${rBloq.lastInsertRowid}`, { headers: { cookie } });
        t(det.status === 404, 'boot vivo: GET /api/posts/:id del bloqueado da 404', det.status);
        const detOk = await fetch(`http://127.0.0.1:${PORT}/api/posts/${rVis.lastInsertRowid}`, { headers: { cookie } });
        t(detOk.status === 200, 'boot vivo: GET /api/posts/:id del visible da 200', detOk.status);
      }
      try { db.close(); } catch (e) {}
    }
  } else {
    t(false, 'boot: el servidor no levantó', bootLog.slice(0, 500));
  }
  // Matar por PID exacto y verificar que el puerto quedó libre.
  const bootPid = child.pid;
  try { process.kill(bootPid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let stillAlive = true;
  try { process.kill(bootPid, 0); } catch (e) { stillAlive = false; }
  if (stillAlive) { try { process.kill(bootPid, 'SIGKILL'); } catch (e) {} await sleep(800); }
  try { process.kill(bootPid, 0); stillAlive = true; } catch (e) { stillAlive = false; }
  t(!stillAlive, 'boot: el proceso murió por PID exacto', bootPid);
  let portFree = false;
  try {
    const ssOut = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    portFree = !ssOut.split('\n').some((l) => l.includes(':' + PORT + ' '));
  } catch (e) { portFree = true; }
  t(portFree, 'boot: el puerto ' + PORT + ' quedó libre');

  // ---------- Epílogo ----------
  console.log(`\ntest-lote-banner-revision: ${ok} OK, ${bad} FAIL`);
  if (bad) { console.log('FAILURES:'); FAILURES.forEach((f) => console.log('  -', f)); }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(BOOT, { recursive: true, force: true }); } catch (e) {}
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
