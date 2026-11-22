// =====================================================================
// LOTE CAMPANA-BADGE — suite propia (estática + módulo + boot real +
// Chromium). La insignia de la campana de la barra viva: el número de
// ítems de acción de la bandeja (GET /api/bandeja/count) pintado
// sobre el botón, solo si es > 0, con el ritmo de refresco de la
// propia barra. Base: HEAD 7636fb2b (SUBIR-BOTON-FIX sobre v1222 · BANDEJA-RESPONDE) — re-base al cierre: el compare autenticado 17111240..7636fb2b probó app.js intacto y styles.css cambiado solo en la zona .bb-tab-subir (disjunta).
//
//   A · Estática — el pintor existe, sus llamadores existen (gate
//       M78), la semilla en el HTML de la barra, la clase CSS, y el
//       endpoint intacto (este lote no toca server.js ni bandeja.js).
//   B · Módulo bandeja.js con senders inyectados — la secuencia del
//       conteo al aprobar de verdad: 5 → 2 → 1 (lo que queda es el
//       ítem que espera su dato: la insignia cuenta acciones vivas).
//   C · Boot real HTTP — la puerta por sesión y el conteo exacto
//       por cliente (5 · 0 · 2) que la insignia debe reflejar.
//   D · Chromium 390px — cliente con acciones: la insignia con el
//       número exacto y el estilo de la casa; aprobar contra la
//       pared del permiso (token falso) deja el conteo honesto y la
//       insignia lo sigue; descartar baja el número y la insignia
//       se actualiza; descartar todo la hace desaparecer; cliente
//       en 0 sin insignia; la casa sin insignia y su campana
//       abriendo el Conserje.
//   E · Control contra la base v1222 — el endpoint ya vivía y
//       contaba 3, pero ninguna insignia se pinta jamás: el hueco
//       que este lote cierra, reproducido.
// =====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function buscarPuerto() {
  for (let p = 36400; p < 36600; p++) {
    try {
      const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
      if (!out.includes(':' + p + ' ')) return p;
    } catch (e) { return p; }
  }
  return 0;
}
function puertoLibre(p) {
  try {
    const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    return !out.includes(':' + p + ' ');
  } catch (e) { return true; }
}

// ---------------------------------------------------------------------
seccion('A · Estática');
const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')]); t('A0 node --check public/app.js', true); }
catch (e) { t('A0 node --check public/app.js', false, String(e.message).slice(0, 200)); }

const nuevas = ['pzCampanaBadgePintar', 'pzCampanaBadgeRefrescar'];
const faltan = nuevas.filter((f) => (appJs.match(new RegExp('function ' + f + '\\(', 'g')) || []).length !== 1);
t('A1 las 2 funciones del pintor existen definidas exactamente una vez', faltan.length === 0, faltan.join(','));
const familia = ['pzBarraCasaCache', 'pzBarraPuertaKick', 'pzBarraCampanaPintar', 'pzBarraCampana', 'pzShellHeadHTML'];
const famMal = familia.filter((f) => (appJs.match(new RegExp('function ' + f + '\\(', 'g')) || []).length !== 1);
t('A2 la familia de la campana sigue definida exactamente una vez', famMal.length === 0, famMal.join(','));
const sitiosRefresco = (appJs.match(/setTimeout\(\(\) => \{ try \{ pzCampanaBadgeRefrescar\(\); \} catch \(e\) \{\} \}, 0\);/g) || []).length;
t('A3 gate M78 — el refresco de la insignia está llamado en los dos shells (2 sitios, el ritmo de la barra)',
  sitiosRefresco === 2, 'sitios=' + sitiosRefresco);
t('A4 gate M78 — pzBarraCampanaPintar sincroniza la insignia al pintar la campana',
  appJs.includes('pzCampanaBadgePintar();'));
const headSlice = appJs.slice(appJs.indexOf('function pzShellHeadHTML'), appJs.indexOf('function pzShellDatosHoy'));
t('A5 la barra siembra la insignia desde la caché (__pzCampanaBadgeN) dentro del botón de la campana',
  headSlice.includes('pz-shell-bell-badge') && headSlice.includes('__pzCampanaBadgeN') && headSlice.includes('${badgeIni}'));
t('A6 el pintor lee el endpoint de la bandeja, una sola vez en todo el bundle',
  (appJs.match(/api\.get\('\/api\/bandeja\/count'\)/g) || []).length === 1);
t('A7 la casa no se consulta ni se pinta: la guarda de sesión está en el refresco',
  appJs.includes('if (casa === true)') && appJs.includes('pzBarraCasaCache() === true || !(n > 0)'));
t('A8 la clase de la insignia vive en styles.css con la lengua de las insignias de conteo (.bb-badge)',
  css.includes('.pz-shell-bell-badge{') && css.includes('#C2452D') && css.includes('.pz-shell-bell{position:relative}'));
t('A9 el endpoint y el motor quedan intactos (server.js/bandeja.js fuera del lote)',
  srv.includes("app.get('/api/bandeja/count'") && fs.existsSync(path.join(ROOT, 'bandeja.js')));

// ---------------------------------------------------------------------
seccion('B · Módulo — el conteo al aprobar de verdad (senders inyectados)');
const TMPB = fs.mkdtempSync(path.join(os.tmpdir(), 'campana-mod-'));
process.env.DATA_DIR = TMPB;
const dbM = require(path.join(ROOT, 'db'));
const BM = require(path.join(ROOT, 'bandeja'));
function seedUserM(email) {
  const r = dbM.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x');
  const uid = Number(r.lastInsertRowid);
  dbM.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
  dbM.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc')").run(uid);
  dbM.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
  dbM.prepare("INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)").run(uid, JSON.stringify({ horarios: 'Lun a Vie 9 a 20' }));
  return uid;
}
function makeWorldM() {
  const now = new Date().toISOString();
  const state = {
    comments: [
      { id: 'c1', text: 'ayer me cobraron dos veces el mismo café, ¿me lo devuelven?', username: 'martin.g', timestamp: now, replies: [] },
      { id: 'c2', text: '¿hasta qué hora abren hoy?', username: 'sofi.m', timestamp: now, replies: [] },
      { id: 'c3', text: 'el mejor café de la ciudad 😍', username: 'juanp', timestamp: now, replies: [] },
      { id: 'c5', text: '¿cuánto cuesta el flat white?', username: 'vale.r', timestamp: now, replies: [] },
    ],
    convs: [
      { id: 'cv1', participants: [{ id: 'IGBIZ', username: 'thecoffeebardc' }, { id: 'U900', username: 'sofi.m' }],
        messages: [{ id: 'm1', text: 'hola, ¿tienen algo sin tacc?', fromId: 'U900', fromUsername: 'sofi.m', created_time: now }] },
    ],
    sentReplies: [], sentDms: [],
  };
  const fetchers = {
    fetchMedia: async () => [{ id: 'POST1', caption: 'Classic Espresso, el de todos los días', thumb: 'https://example.com/t.jpg', timestamp: now }],
    fetchComments: async () => JSON.parse(JSON.stringify(state.comments)),
    fetchConversations: async () => JSON.parse(JSON.stringify(state.convs)),
    sendCommentReply: async (creds, commentId, text) => { state.sentReplies.push({ commentId, text }); return { id: 'r' + commentId }; },
    sendDm: async (creds, to, text) => { state.sentDms.push({ to, text }); return { id: 'dm1' }; },
    hideComment: async () => ({ ok: true }),
  };
  const suggestFn = () => async (args) => {
    const tx = String(args.commentText || '');
    if (/cuesta|precio/.test(tx)) return { reply: '', needsHuman: true, reason: 'dato_no_esta_en_el_fundamento:precio' };
    if (/cobraron/.test(tx)) return { reply: 'Hola Martín, perdón por eso. Pasá por el local con el comprobante y te lo resolvemos en el momento.', needsHuman: false, reason: '' };
    if (/hora/.test(tx)) return { reply: '¡Hola Sofi! Hoy estamos hasta las 20. Te esperamos.', needsHuman: false, reason: '' };
    return { reply: '¡Gracias por escribirnos! 🙌', needsHuman: false, reason: '' };
  };
  const deps = { credsOf: () => ({ igUserId: 'IGBIZ', accessToken: 'tok-falso', igUsername: 'thecoffeebardc' }), suggestFn, apiKeyOf: () => '', notify: () => {}, fetchers };
  return { state, deps };
}

// ---------------------------------------------------------------------
const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) { /* ya existe */ }
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
function usuario(id, email, plan, extra) {
  const e = extra || {};
  db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
    VALUES (?, ?, ?, ?, 'active', 0, 0, 0, NULL, NULL, 1, 'es', 1, '2026-09-01 10:00:00')\`).run(id, email, hash, plan);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (?, ?, ?, ?, 1)')
    .run(id, e.nombre || '', e.ig || '', 'café');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_user_id, ig_access_token) VALUES (?, 'America/New_York', 'IGBIZ', 'tok-falso')").run(id);
}
usuario(12, 'dueno@campana.test', 'posty', { nombre: 'Posty', ig: 'posty.communitymanager' });
usuario(601, 'acciones@campana.test', 'total', { nombre: 'The Coffee Bar', ig: 'thecoffeebardc' });
usuario(602, 'cero@campana.test', 'total', { nombre: 'Café Cero', ig: 'cafecero' });
usuario(603, 'descarta@campana.test', 'total', { nombre: 'Café Descarta', ig: 'cafedescarta' });
function tanda(uid, postId, caption, items) {
  const r = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, post_thumb, notified_at) VALUES (?, ?, 'post', ?, ?, '', datetime('now'))").run(uid, postId, postId, caption);
  const tid = Number(r.lastInsertRowid);
  const ins = db.prepare("INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato) VALUES (?, ?, 'comment', ?, ?, ?, ?, ?, ?, ?, 'pendiente', '')");
  for (const it of items) ins.run(tid, uid, it.cid, it.cid, it.cid, it.user, it.texto, it.draft, it.clase || 'normal');
  return tid;
}
// 601 · dos tandas: 3 + 2 = 5 acciones
tanda(601, 'POST1', 'Classic Espresso, el de todos los días', [
  { cid: 'c1', user: 'martin.g', texto: 'ayer me cobraron dos veces el mismo café, ¿me lo devuelven?', draft: 'Hola Martín, perdón por eso. Pasá por el local con el comprobante y te lo resolvemos en el momento.', clase: 'importante' },
  { cid: 'c2', user: 'sofi.m', texto: '¿hasta qué hora abren hoy?', draft: '¡Hola Sofi! Hoy estamos hasta las 20. Te esperamos.' },
  { cid: 'c3', user: 'juanp', texto: 'el mejor café de la ciudad', draft: '¡Gracias Juan! Es nuestro Classic Espresso, el de todos los días.' },
]);
tanda(601, 'POST2', 'Medialunas de la mañana', [
  { cid: 'c4', user: 'luis.f', texto: '¿abren los domingos?', draft: '¡Hola Luis! Los domingos abrimos de 9 a 14.' },
  { cid: 'c5', user: 'vale.r', texto: '¿tienen algo sin tacc?', draft: '¡Hola Vale! Sí, tenemos opciones sin tacc todos los días.' },
]);
// 603 · una tanda de 2 (para descartar entera)
tanda(603, 'POST9', 'Tostado de la casa', [
  { cid: 'c8', user: 'ana.p', texto: '¿tienen wifi?', draft: '¡Hola Ana! Sí, pedí la clave en la barra.' },
  { cid: 'c9', user: 'leo.m', texto: '¿hacen envíos?', draft: '¡Hola Leo! Hacemos envíos en el barrio.' },
]);
console.log('semilla ok');
`;

function arrancarBoot(root, puerto, tmpD) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(puerto), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-campana', DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += String(d); });
  child.stderr.on('data', (d) => { log += String(d); });
  return { child, pid: child.pid, log: () => log };
}
async function esperarUp(base) {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(base + '/api/version'); if (r.status === 200) return true; } catch (e) { /* todavía */ }
    await sleep(500);
  }
  return false;
}
async function matarBoot(b, puerto) {
  try { b.child.kill('SIGTERM'); } catch (e) { /* ya murió */ }
  await sleep(1200);
  let vivo = true;
  try { process.kill(b.pid, 0); } catch (e) { vivo = false; }
  if (vivo) { try { process.kill(b.pid, 'SIGKILL'); } catch (e) { /* nada */ } await sleep(400); vivo = false; try { process.kill(b.pid, 0); vivo = true; } catch (e) { vivo = false; } }
  return !vivo && puertoLibre(puerto);
}
async function login(base, email) {
  const r = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ClaveQA123' }),
  });
  const setCookie = r.headers.get('set-cookie') || '';
  const m = setCookie.match(/^([^=]+)=([^;]+)/);
  return { status: r.status, cookie: m ? { name: m[1], value: m[2] } : null, header: setCookie.split(';')[0] };
}
async function getJson(base, p, cookieHeader) {
  const r = await fetch(base + p, { headers: cookieHeader ? { Cookie: cookieHeader } : {} });
  let j = null; try { j = await r.json(); } catch (e) { /* no json */ }
  return { status: r.status, json: j };
}
function cargarPw() {
  for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
    path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { const pw = require(cand); if (pw) return pw; } catch (e) { /* siguiente */ }
  }
  return null;
}
function exeChromium() {
  const basePw = path.join(os.homedir(), '.cache/ms-playwright');
  for (const dir of fs.readdirSync(basePw)) {
    if (!dir.startsWith('chromium') || dir.includes('headless')) continue;
    for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const p = path.join(basePw, dir, sub);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

// ---------------------------------------------------------------------
async function main() {
  // ---- B · la secuencia del conteo al aprobar de verdad ----
  {
    const uid = seedUserM('modulo@campana.test');
    const { state, deps } = makeWorldM();
    await BM.pollBandeja(dbM, deps, { onlyUser: uid });
    const c0 = BM.countAcciones(dbM, uid);
    t('B1 el conteo nace en 5 (4 del posteo + 1 del DM)', c0 === 5, 'count=' + c0);
    const data = BM.getBandeja(dbM, uid);
    const tPost = data.tandas.find((x) => x.kind === 'post');
    const ap1 = await BM.approveTanda(dbM, uid, tPost.id, deps);
    const c1 = BM.countAcciones(dbM, uid);
    t('B2 aprobar la tanda del posteo baja el conteo a 2 (el DM + la que espera su dato)',
      ap1.enviadas === 3 && c1 === 2, 'enviadas=' + ap1.enviadas + ' count=' + c1);
    const tDm = BM.getBandeja(dbM, uid).tandas.find((x) => x.kind === 'dm');
    const ap2 = await BM.approveTanda(dbM, uid, tDm.id, deps);
    const c2 = BM.countAcciones(dbM, uid);
    t('B3 aprobar la del DM baja el conteo a 1: queda solo la que espera su dato (acción viva)',
      ap2.enviadas === 1 && c2 === 1, 'enviadas=' + ap2.enviadas + ' count=' + c2);
  }

  // ---- C · boot real HTTP ----
  seccion('C · Boot real + HTTP');
  const PORT = buscarPuerto();
  t('C0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'campana-boot-'));
  const seedFile = path.join(os.tmpdir(), 'campana-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });
  const boot = arrancarBoot(ROOT, PORT, tmpD);
  const base = 'http://127.0.0.1:' + PORT;
  try {
    const up = await esperarUp(base);
    t('C1 el servidor levanta en el puerto libre', up, boot.log().slice(-300));
    const sesCasa = await login(base, 'dueno@campana.test');
    const sesA = await login(base, 'acciones@campana.test');
    const sesB = await login(base, 'cero@campana.test');
    const sesC = await login(base, 'descarta@campana.test');
    t('C2 login de la casa y de los tres clientes', !!(sesCasa.cookie && sesA.cookie && sesB.cookie && sesC.cookie));
    const puertaCasa = await getJson(base, '/api/conserje/puerta', sesCasa.header);
    const puertaA = await getJson(base, '/api/conserje/puerta', sesA.header);
    t('C3 la puerta de la campana: la casa dice sí, el cliente dice no',
      puertaCasa.json && puertaCasa.json.casa === true && puertaA.json && puertaA.json.casa === false,
      JSON.stringify([puertaCasa.json, puertaA.json]));
    const cntA = await getJson(base, '/api/bandeja/count', sesA.header);
    const cntB = await getJson(base, '/api/bandeja/count', sesB.header);
    const cntC = await getJson(base, '/api/bandeja/count', sesC.header);
    t('C4 el conteo exacto que la insignia debe pintar: A=5 · B=0 · C=2',
      cntA.json && cntA.json.acciones === 5 && cntB.json && cntB.json.acciones === 0 && cntC.json && cntC.json.acciones === 2,
      JSON.stringify([cntA.json, cntB.json, cntC.json]));
  } catch (e) {
    t('C sin excepción', false, String(e && e.message || e));
  } finally {
    const murio = await matarBoot(boot, PORT);
    t('C5 el boot murió por su PID exacto y el puerto quedó libre', murio);
  }

  // ---- D · Chromium ----
  seccion('D · Chromium (390px)');
  const pw = cargarPw();
  t('D0 playwright-core disponible', !!pw);
  if (pw) {
    const tmpD2 = fs.mkdtempSync(path.join(os.tmpdir(), 'campana-ui-'));
    execFileSync(process.execPath, [seedFile, tmpD2, ROOT], { stdio: 'pipe' });
    const PORTD = buscarPuerto();
    const bootD = arrancarBoot(ROOT, PORTD, tmpD2);
    const baseD = 'http://127.0.0.1:' + PORTD;
    let browser = null;
    try {
      const up = await esperarUp(baseD);
      t('D1 el boot de UI levanta', up, bootD.log().slice(-200));
      const sesA = await login(baseD, 'acciones@campana.test');
      const sesB = await login(baseD, 'cero@campana.test');
      const sesC = await login(baseD, 'descarta@campana.test');
      const sesCasa = await login(baseD, 'dueno@campana.test');
      browser = await pw.chromium.launch({ executablePath: exeChromium() || undefined, args: ['--no-sandbox'] });
      const mkCtx = async (ses) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await ctx.addCookies([{ name: ses.cookie.name, value: ses.cookie.value, url: baseD }]);
        return ctx;
      };
      const esperarBadge = async (page, texto, ms) => {
        try {
          await page.waitForFunction((tx) => {
            const el = document.getElementById('pzShellBellBadge');
            return el && el.textContent.trim() === tx;
          }, texto, { timeout: ms || 25000 });
          return true;
        } catch (e) { return false; }
      };
      const esperarSinBadge = async (page, ms) => {
        try {
          await page.waitForFunction(() => !document.getElementById('pzShellBellBadge'), null, { timeout: ms || 25000 });
          return true;
        } catch (e) { return false; }
      };
      const conteoEnPagina = async (page) => page.evaluate(async () => {
        const r = await fetch('/api/bandeja/count');
        const j = await r.json();
        return j.acciones;
      });

      // — A · el número exacto, el estilo, sin desborde —
      const ctxA = await mkCtx(sesA);
      const pA = await ctxA.newPage();
      await pA.goto(baseD + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pA.waitForSelector('.pz-shell-head', { timeout: 20000 });
      t('D2 cliente con 5 acciones: la insignia aparece con el número exacto del endpoint',
        await esperarBadge(pA, '5'),
        await pA.evaluate(() => { const el = document.getElementById('pzShellBellBadge'); return el ? el.textContent : '(sin insignia)'; }));
      const estilo = await pA.evaluate(() => {
        const el = document.getElementById('pzShellBellBadge');
        const b = document.getElementById('pzShellBell');
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect(); const rb = b.getBoundingClientRect();
        return { bg: cs.backgroundColor, h: Math.round(r.height), minW: Math.round(r.width), color: cs.color,
          enLaCampana: b.contains(el), esquina: Math.abs((r.right) - (rb.right + 3)) <= 3 && Math.abs(r.top - (rb.top - 3)) <= 3,
          sw: document.documentElement.scrollWidth, iw: window.innerWidth };
      });
      t('D3 la insignia es la de la casa: píldora #C2452D de 17px sobre la esquina de la campana, sin desborde',
        estilo.bg === 'rgb(194, 69, 45)' && estilo.h === 17 && estilo.color === 'rgb(255, 255, 255)'
        && estilo.enLaCampana && estilo.esquina && estilo.sw <= estilo.iw + 1,
        JSON.stringify(estilo));

      // — A · aprobar contra la pared del permiso: el conteo no miente —
      await pA.click('#pzShellBell');
      await pA.waitForSelector('.pzb-banda', { timeout: 25000 });
      await pA.evaluate(() => {
        const cards = [...document.querySelectorAll('.pzb-card')];
        const card = cards.find((c) => c.textContent.includes('Classic Espresso'));
        const btn = [...card.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Revisar');
        btn.click();
      });
      await pA.waitForSelector('.pzb-item', { timeout: 25000 });
      await pA.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((x) => /Aprobar las/.test(x.textContent) && x.id.startsWith('pzbApr-'));
        btn.click();
      });
      await sleep(2500);
      const cntPostApr = await conteoEnPagina(pA);
      t('D4 aprobar con token falso: Meta corta y el conteo queda honesto (sin_permiso sigue contando: 5)',
        cntPostApr === 5, 'count=' + cntPostApr);
      await pA.evaluate(() => bbGo('#/app/inicio'));
      await pA.waitForSelector('.pz-shell-head', { timeout: 20000 });
      t('D5 tras aprobar, la insignia sigue al endpoint: muestra su número real (5), ni uno inventado',
        await esperarBadge(pA, '5'));

      // — A · descartar en la otra tanda: el número baja y la insignia sigue —
      await pA.click('#pzShellBell');
      await pA.waitForSelector('.pzb-banda', { timeout: 25000 });
      await pA.evaluate(() => {
        const cards = [...document.querySelectorAll('.pzb-card')];
        const card = cards.find((c) => c.textContent.includes('Medialunas'));
        const btn = [...card.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Revisar');
        btn.click();
      });
      await pA.waitForSelector('.pzb-item', { timeout: 25000 });
      for (const user of ['@luis.f', '@vale.r']) {
        await pA.evaluate((u) => {
          const item = [...document.querySelectorAll('.pzb-item')].find((i) => i.textContent.includes(u));
          const btn = [...item.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Descartar');
          btn.click();
        }, user);
        await sleep(1200);
      }
      const cntPostDesc = await conteoEnPagina(pA);
      t('D6 descartar las 2 de la otra tanda baja el conteo del endpoint a 3', cntPostDesc === 3, 'count=' + cntPostDesc);
      await pA.evaluate(() => bbGo('#/app/inicio'));
      await pA.waitForSelector('.pz-shell-head', { timeout: 20000 });
      t('D7 la insignia se actualiza al número nuevo: 3', await esperarBadge(pA, '3'));

      // — C · descartar todo: la insignia desaparece —
      const ctxC = await mkCtx(sesC);
      const pC = await ctxC.newPage();
      await pC.goto(baseD + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pC.waitForSelector('.pz-shell-head', { timeout: 20000 });
      t('D8 cliente con 2 acciones: su insignia nace en 2', await esperarBadge(pC, '2'));
      await pC.click('#pzShellBell');
      await pC.waitForSelector('.pzb-banda', { timeout: 25000 });
      await pC.evaluate(() => {
        const btn = [...document.querySelectorAll('.pzb-card button')].find((x) => x.textContent.trim() === 'Revisar');
        btn.click();
      });
      await pC.waitForSelector('.pzb-item', { timeout: 25000 });
      for (const user of ['@ana.p', '@leo.m']) {
        await pC.evaluate((u) => {
          const item = [...document.querySelectorAll('.pzb-item')].find((i) => i.textContent.includes(u));
          const btn = [...item.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Descartar');
          btn.click();
        }, user);
        await sleep(1200);
      }
      const cntC0 = await conteoEnPagina(pC);
      await pC.evaluate(() => bbGo('#/app/inicio'));
      await pC.waitForSelector('.pz-shell-head', { timeout: 20000 });
      const sinBadgeC = await esperarSinBadge(pC);
      t('D9 descartadas todas, el conteo es 0 y la insignia DESAPARECE',
        cntC0 === 0 && sinBadgeC, 'count=' + cntC0 + ' sinBadge=' + sinBadgeC);

      // — B · cero acciones: nunca hay insignia —
      const ctxB = await mkCtx(sesB);
      const pB = await ctxB.newPage();
      await pB.goto(baseD + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pB.waitForSelector('.pz-shell-head', { timeout: 20000 });
      let refrescoCorrio = false;
      try {
        await pB.waitForFunction(() => window.__pzCampanaBadgeN === 0, null, { timeout: 20000 });
        refrescoCorrio = true;
      } catch (e) { /* queda false */ }
      const hayBadgeB = await pB.evaluate(() => !!document.getElementById('pzShellBellBadge'));
      t('D10 cliente en 0: el refresco corrió (conteo conocido = 0) y NO se pinta insignia',
        refrescoCorrio && !hayBadgeB, 'refresco=' + refrescoCorrio + ' badge=' + hayBadgeB);

      // — la casa · sin insignia, la campana es el Conserje —
      const ctxCasa = await mkCtx(sesCasa);
      const pCasa = await ctxCasa.newPage();
      await pCasa.goto(baseD + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pCasa.waitForSelector('.pz-shell-head', { timeout: 20000 });
      let cloche = false;
      try {
        await pCasa.waitForFunction(() => {
          const b = document.getElementById('pzShellBell');
          return b && b.classList.contains('es-casa') && b.getAttribute('aria-label') === 'Conserje';
        }, null, { timeout: 15000 });
        cloche = true;
      } catch (e) { /* queda false */ }
      await sleep(1500);
      const casaBadge = await pCasa.evaluate(() => ({
        badge: !!document.getElementById('pzShellBellBadge'),
        pidioCount: window.__pzCampanaBadgeN,
      }));
      t('D11 la casa: su campana es el Conserje y NUNCA lleva insignia (su conteo no es el de la bandeja)',
        cloche && !casaBadge.badge, JSON.stringify(casaBadge));
      await pCasa.click('#pzShellBell');
      let urlCasa = '';
      try { await pCasa.waitForURL(/\/conserje/, { timeout: 15000 }); urlCasa = pCasa.url(); } catch (e) { urlCasa = pCasa.url(); }
      t('D12 la campana de la casa sigue abriendo el Conserje', urlCasa.includes('/conserje'), urlCasa);
      await pA.screenshot({ path: path.join(ROOT, 'qa-campana-badge-390.png') }).catch(() => {});
    } catch (e) {
      t('D sin excepción', false, String(e && e.message || e));
    } finally {
      if (browser) { try { await browser.close(); } catch (e) { /* nada */ } }
      const murio = await matarBoot(bootD, PORTD);
      t('D13 el boot de UI murió por su PID exacto y el puerto quedó libre', murio);
    }
  }

  // ---- E · control contra la base v1222 ----
  seccion('E · Control contra la base (sin el lote)');
  {
    const tmpE = fs.mkdtempSync(path.join(os.tmpdir(), 'campana-base-'));
    execFileSync(process.execPath, [seedFile, tmpE, BASE], { stdio: 'pipe' });
    const PORTE = buscarPuerto();
    const bootE = arrancarBoot(BASE, PORTE, tmpE);
    const baseE = 'http://127.0.0.1:' + PORTE;
    let browserE = null;
    try {
      const up = await esperarUp(baseE);
      t('E1 el boot de la base levanta', up, bootE.log().slice(-200));
      const sesA = await login(baseE, 'acciones@campana.test');
      const cntBase = await getJson(baseE, '/api/bandeja/count', sesA.header);
      t('E2 en la base el endpoint YA vivía y contaba 5 (el dato existía)',
        cntBase.json && cntBase.json.acciones === 5, JSON.stringify(cntBase.json));
      if (pw) {
        browserE = await pw.chromium.launch({ executablePath: exeChromium() || undefined, args: ['--no-sandbox'] });
        const ctx = await browserE.newContext({ viewport: { width: 390, height: 844 } });
        await ctx.addCookies([{ name: sesA.cookie.name, value: sesA.cookie.value, url: baseE }]);
        const page = await ctx.newPage();
        await page.goto(baseE + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pz-shell-head', { timeout: 20000 });
        await sleep(5000);
        const hay = await page.evaluate(() => ({
          badge: !!document.getElementById('pzShellBellBadge'),
          fn: typeof window.pzCampanaBadgeRefrescar,
        }));
        t('E3 en la base (con el hotfix del botón Subir, sin este lote) NINGUNA insignia se pinta jamás (el hueco reproducido)',
          !hay.badge && hay.fn === 'undefined', JSON.stringify(hay));
      }
    } catch (e) {
      t('E sin excepción', false, String(e && e.message || e));
    } finally {
      if (browserE) { try { await browserE.close(); } catch (e) { /* nada */ } }
      const murio = await matarBoot(bootE, PORTE);
      t('E4 el boot de la base murió por su PID exacto y el puerto quedó libre', murio);
    }
  }

  try { fs.unlinkSync(seedFile); } catch (e) { /* nada */ }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
}

main().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
