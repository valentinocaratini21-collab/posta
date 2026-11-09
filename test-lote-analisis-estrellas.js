// test-lote-analisis-estrellas.js — LOTE ANALISIS-ESTRELLAS + 1 DIA (v815).
// 1) Estrellitas «Ya salió» (Análisis): bindSignalBtns hacía POST y
//    después render() — re-render completo (el «refresco» + pérdida de
//    scroll) y nunca mostraba las estrellas llenas. Ahora actualiza
//    SOLO la fila en su lugar (estrellas 1..N llenas, 5 deshabilitadas,
//    gracias corto), sin render() ni navegación; si el POST falla,
//    re-habilita + toast. XP: +10 por posteo rateado, una sola vez por
//    posteo, derivado del lado del servidor (xp-nivel.js cuenta
//    post_signals con client_signal LIKE 'rating_%'; una fila por
//    (usuario, posteo), así que re-ratear no suma).
// 2) «1 día»: la píldora de racha, su título, la tarjeta de racha de
//    Nivel y el banner de ausencia pintaban «N días» sin singular
//    (N=1 → «🔥 1 días» / «1 days»). Ahora singular INLINE en cada
//    sitio («1 día» / «1 day» con N===1, plural el resto, ES + EN):
//    sin helper compartido, porque las suites vecinas extraen funciones
//    sueltas de app.js y las corren en VM sin stubs — un helper nuevo
//    rompería __pzNivelRachaCardHTML y __pzNivelPantallaHTML (lección
//    de la comparación con la base v805: 3 + 3 fallos).
// Rojo-primero: falla en base v805, pasa en el árbol del lote.
// Uso: node test-lote-analisis-estrellas.js [dir-del-arbol] — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
function sliceFn(src, from, to) {
  const a = src.indexOf(from); if (a === -1) throw new Error('no se encontró: ' + from);
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  if (b === -1) throw new Error('no se encontró fin: ' + to);
  return src.slice(a, b);
}
function sliceOk(src, from, to) {
  try { return sliceFn(src, from, to); } catch (e) { return ''; }
}

const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(TREE, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const xpn = fs.readFileSync(path.join(TREE, 'xp-nivel.js'), 'utf8');
const bindSlice = sliceOk(app, 'function bindSignalBtns()', '// Calendario comercial argentino');

// ---------- Parte 0: pines ----------
console.log('— 0) pines —');
check('0a app.js cambió vs base v805', md5(app) !== 'aaae05c2ddcc444b71c203daea11ff98', md5(app));
check('0b styles.css cambió vs base v805', md5(css) !== 'e1261ef04f791cec22e85513a95bd8fb', md5(css));
check('0c server.js = fusionado (BUILD v822 + A + CHAT-MUSE; el XP vive en xp-nivel.js, no acá)',
  md5(srv) === '1e0e70dcc918ee2b1f235586de3e2a40', md5(srv));
check('0d xp-nivel.js cambió vs base v805', md5(xpn) !== 'e28ccb63b0685d3f37210ef6186bb877', md5(xpn));

// ---------- Parte 1: estática — estrellitas ----------
console.log('— 1) estática: estrellitas «Ya salió» —');
check('1a bindSignalBtns existe y el rating NO llama render() (solo el camino no-rating, con guarda)',
  bindSlice.includes('function bindSignalBtns()') && cnt(bindSlice, 'render()') === 1
  && bindSlice.includes("if (!isRating) { render(); return; }"), `render() x${cnt(bindSlice, 'render()')}`);
check('1b tras POST ok: llena 1..N con starFill + clase .on',
  bindSlice.includes("pzIc('starFill', 18)") && bindSlice.includes("classList.add('on')"));
check('1c gracias corto en la fila (ES + EN)', bindSlice.includes('¡Gracias! Lo tengo en cuenta') && bindSlice.includes('Thanks! Noted.'));
check('1d si el POST falla: re-habilita los botones + toast (ES + EN)',
  bindSlice.includes('No se guardó, probá de nuevo') && bindSlice.includes("It didn\\'t save") && cnt(bindSlice, 'disabled = false') >= 1);
check('1e las estrellitas tienen type="button"',
  app.includes('<button type="button" class="btn btn-soft btn-sm star-btn" data-sig="rating_${n}"'));
check('1f CSS del gracias (.st-rate-gracias)', css.includes('.st-rate-gracias{'));
check('1g bindStats sigue pintando la tarjeta y cableando los botones',
  app.includes("rateBox.innerHTML = salioCardHTML(pub)") && app.includes('bindSignalBtns();'));

// ---------- Parte 2: estática — XP ----------
console.log('— 2) estática: XP por ratear —');
check('2a XP_RATING = 10 en xp-nivel.js', xpn.includes('const XP_RATING = 10;'));
check('2b avatarLevelData cuenta posteos rateados (LIKE rating_%) y suma',
  xpn.includes("client_signal LIKE 'rating_%'") && xpn.includes('xp += ratings * XP_RATING;'));
check('2c XP_RATING exportado', xpn.includes('XP_RATING, avatarNivelNombre'));
check('2d avatarLevelData devuelve ratings (tras rachaMax, para no romper el literal «respuestas, rachaMax» de r5/A36)', xpn.includes('respuestas, rachaMax, ratings, unseenLevels'));
check('2e el endpoint /api/posts/:id/signal acepta rating_1..5 (sin cambio)',
  srv.includes("'rating_1', 'rating_2', 'rating_3', 'rating_4', 'rating_5'"));

// ---------- Parte 3: estática — «1 día» ----------
console.log('— 3) estática: «1 día» —');
check('3a píldora del encabezado salió (PARTE 5): sin singular inline del cache', !app.includes("(rachaN === 1 ? (en ? '1 day' : '1 día')"));
check('3b título de la píldora salió (PARTE 5): sin título del cache', !app.includes("('Streak: ' + (rachaN === 1 ? '1 day' : rachaN + ' days') + ' posting')") && !app.includes("('Racha de ' + (rachaN === 1 ? '1 día' : rachaN + ' días') + ' publicando')"));
check('3c píldora del encabezado salió (PARTE 5): sin fill async de la píldora', !app.includes("const rachaTxt = '🔥 ' + (r.racha === 1 ? (en ? '1 day' : '1 día')"));
check('3d título de la píldora salió (PARTE 5): sin título del fill async', !app.includes("('Streak: ' + (r.racha === 1 ? '1 day' : r.racha + ' days') + ' posting')") && !app.includes("('Racha de ' + (r.racha === 1 ? '1 día' : r.racha + ' días') + ' publicando')"));
check('3f banner de ausencia de Nivel con singular inline (ES + EN)',
  app.includes("While you were away (${nv.ausencia.dias === 1 ? '1 day'") && app.includes("Mientras no estabas (${nv.ausencia.dias === 1 ? '1 día'"));
check('3g cero restos del plural sin singular',
  cnt(app, "'🔥 ' + rachaN + (en ? ' days'") === 0 && cnt(app, "'🔥 ' + r.racha + (en ? ' days'") === 0
  && cnt(app, "Racha de ' + rachaN + ' días") === 0 && cnt(app, "Racha de ' + r.racha + ' días") === 0
  && cnt(app, "Racha de ' + n + ' días publicando") === 0 && cnt(app, '(${nv.ausencia.dias} days)') === 0
  && cnt(app, '(${nv.ausencia.dias} días)') === 0);
check('3h sin helper compartido (cada función autocontenida: las suites vecinas extraen funciones sueltas en VM sin stubs)',
  !app.includes('pzDiasTxt'));

// ---------- Parte 4: VM — bindSignalBtns + pzDiasTxt ----------
console.log('— 4) VM: rating en su lugar + plural —');
let vmAsync = Promise.resolve();
{
  let bindSrc = '';
  try { bindSrc = sliceFn(app, 'function bindSignalBtns()', '// Calendario comercial argentino'); } catch (e) {}
  if (!bindSrc) {
    // Árbol sin parche (rojo-primero): los checks de VM no pueden correr; se reportan como fallos en vez de romper la suite.
    const names = ['4a click estrella 4: POST /api/posts/42/signal rating_4, UNA sola vez',
      '4b estrellas 1–4 llenas (starFill + .on), la 5ª queda vacía',
      '4c las 5 quedan deshabilitadas y NO hay render() (sin refresco)',
      '4d gracias corto en la fila («¡Gracias! Lo tengo en cuenta»)',
      '4e click estrella 1: solo la 1ª llena, resto vacío',
      '4f POST fallido: botones re-habilitados + toast «No se guardó, probá de nuevo»',
      '4g POST fallido: ninguna estrella se llena ni hay gracias',
      '4h EN: gracias «Thanks! Noted.»'];
    for (const n of names) check(n, false, 'árbol sin parche (bindSignalBtns/pzNivelRachaCardHTML ausente)');
  } else {
  function makeSandbox(failPost) {
    const posts = [];
    const toasts = [];
    let renderCalls = 0;
    const thanksEls = [];
    function makeStar(n) {
      return {
        dataset: { sig: 'rating_' + n, id: '42' },
        disabled: false, innerHTML: '<svg>star</svg>', className: 'star-btn',
        classList: { add(c) { this._cls = (this._cls || []).concat([c]); }, _cls: [] },
        closest: (sel) => (sel === '.st-rate-row' ? row : null),
        onclick: null,
      };
    }
    const stars = [1, 2, 3, 4, 5].map(makeStar);
    const body = {
      querySelector: () => null,
      appendChild: (el) => { thanksEls.push(el); },
    };
    const row = {
      querySelectorAll: (sel) => (sel === '.star-btn' ? stars : []),
      querySelector: (sel) => (sel === '.st-rate-body' ? body : null),
    };
    const sb = {
      console, setTimeout, clearTimeout,
      ME: { lang: 'es' },
      toast: (t) => { toasts.push(t); },
      api: { post: async (u, b) => { posts.push([u, b]); if (failPost) throw new Error('red caída'); return { ok: true }; } },
      document: { createElement: () => ({ className: '', textContent: '' }) },
      render: () => { renderCalls++; },
      pzIc: (name) => (name === 'starFill' ? '<svg>starFill</svg>' : '<svg>star</svg>'),
      $$: (sel) => (sel === '[data-sig]' ? stars : []),
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(bindSrc + '\nthis.__t = { bindSignalBtns };', sb);
    return { sb, stars, posts, toasts, thanksEls, renderCalls: () => renderCalls };
  }
  vmAsync = vmAsync.then(async () => {
    const t1 = makeSandbox(false);
    t1.sb.__t.bindSignalBtns();
    await t1.stars[3].onclick();
    check('4a click estrella 4: POST /api/posts/42/signal rating_4, UNA sola vez',
      t1.posts.length === 1 && t1.posts[0][0] === '/api/posts/42/signal' && t1.posts[0][1].signal === 'rating_4',
      JSON.stringify(t1.posts));
    check('4b estrellas 1–4 llenas (starFill + .on), la 5ª queda vacía',
      t1.stars.slice(0, 4).every((s) => s.innerHTML.includes('starFill') && (s.classList._cls || []).includes('on'))
      && !t1.stars[4].innerHTML.includes('starFill'), t1.stars.map((s) => s.innerHTML).join('|'));
    check('4c las 5 quedan deshabilitadas y NO hay render() (sin refresco)',
      t1.stars.every((s) => s.disabled === true) && t1.renderCalls() === 0, 'render x' + t1.renderCalls());
    check('4d gracias corto en la fila («¡Gracias! Lo tengo en cuenta»)',
      t1.thanksEls.length === 1 && t1.thanksEls[0].className === 'st-rate-gracias'
      && t1.thanksEls[0].textContent === '¡Gracias! Lo tengo en cuenta',
      JSON.stringify(t1.thanksEls.map((e) => e.textContent)));
    const t2 = makeSandbox(false);
    t2.sb.__t.bindSignalBtns();
    await t2.stars[0].onclick();
    check('4e click estrella 1: solo la 1ª llena, resto vacío',
      t2.stars[0].innerHTML.includes('starFill') && !t2.stars[1].innerHTML.includes('starFill'));
    const t3 = makeSandbox(true);
    t3.sb.__t.bindSignalBtns();
    await t3.stars[4].onclick();
    check('4f POST fallido: botones re-habilitados + toast «No se guardó, probá de nuevo»',
      t3.stars.every((s) => s.disabled === false) && t3.toasts.some((x) => String(x).includes('No se guardó, probá de nuevo')),
      JSON.stringify(t3.toasts));
    check('4g POST fallido: ninguna estrella se llena ni hay gracias',
      t3.stars.every((s) => !s.innerHTML.includes('starFill')) && t3.thanksEls.length === 0);
    const t4 = makeSandbox(false);
    t4.sb.ME = { lang: 'en' };
    t4.sb.__t.bindSignalBtns();
    await t4.stars[1].onclick();
    check('4h EN: gracias «Thanks! Noted.»',
      t4.thanksEls.length === 1 && t4.thanksEls[0].textContent === 'Thanks! Noted.',
      JSON.stringify(t4.thanksEls.map((e) => e.textContent)));
  });
  }
}

// ---------- Parte 5: boot real ----------
console.log('— 5) boot real —');
const PORT = 34575;
// Boot en el scratch (no en /tmp: el tmpfs es de 512M y se llena con los
// restos de corridas de test de otros lotes; el DATA_DIR no forma parte
// del árbol del push).
const tmpDir = fs.mkdtempSync(path.join(path.dirname(TREE), 'boot-tmp-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const TEST_KEY = 'boot-test-key-ae';

async function reqJson(method, p, body, cookie, contentType) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers, body: body === undefined ? undefined : (contentType ? body : JSON.stringify(body)) });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}

async function parteBoot() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    check('5a el servidor levanta con el lote', up);
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    check('5b /api/version = v822 (estampado)', ver && ver.build === '20261105-v833', JSON.stringify(ver));
    const appJs = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=567`)).text();
    check('5c el app.js servido trae el lote (starFill + gracias)',
      appJs.includes("pzIc('starFill', 18)") && appJs.includes('st-rate-gracias'), 'len ' + appJs.length);
    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'ae-test', device: 'test-device-ae' });
    check('5d join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';
    const uid = join.json.user_id;
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    try { db.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
    try { db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(uid); } catch (e) {}
    const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
    const postCols = db.prepare('PRAGMA table_info(posts)').all().map((c) => c.name);
    const pFields = ['user_id', 'image_path', 'caption', 'status', 'published_at', 'scheduled_at'];
    const pVals = [uid, '/media/ae-test.jpg', 'Posteo de hace dos días: café de especialidad', 'published', twoDaysAgo, twoDaysAgo];
    if (postCols.includes('media_type')) { pFields.push('media_type'); pVals.push('image'); }
    if (postCols.includes('approval')) { pFields.push('approval'); pVals.push('approved'); }
    if (postCols.includes('tipo')) { pFields.push('tipo'); pVals.push(''); }
    const insP = db.prepare(`INSERT INTO posts (${pFields.join(',')}) VALUES (${pFields.map(() => '?').join(',')})`).run(...pVals);
    const postId = Number(insP.lastInsertRowid);
    check('5e posteo publicado hace 2 días sembrado', postId > 0, `id=${postId}`);
    const lvl0 = await reqJson('GET', '/api/avatar-level', undefined, cookie);
    check('5f XP base: 1 posteo publicado imagen = 40 XP, 0 ratings',
      lvl0.status === 200 && lvl0.json && lvl0.json.xp === 40 && lvl0.json.ratings === 0, JSON.stringify(lvl0.json));
    const sigNoAuth = await reqJson('POST', '/api/posts/' + postId + '/signal', { signal: 'rating_4' });
    check('5g POST signal sin sesión → 401', sigNoAuth.status === 401, String(sigNoAuth.status));
    const sigBad = await reqJson('POST', '/api/posts/' + postId + '/signal', { signal: 'rating_9' }, cookie);
    check('5h POST signal inválida → 400', sigBad.status === 400, String(sigBad.status));
    const sig1 = await reqJson('POST', '/api/posts/' + postId + '/signal', { signal: 'rating_4' }, cookie);
    check('5i POST rating_4 → 200 ok', sig1.status === 200 && sig1.json && sig1.json.ok === true, JSON.stringify(sig1.json));
    const row1 = db.prepare('SELECT client_signal FROM post_signals WHERE user_id = ? AND post_id = ?').get(uid, postId);
    check('5j la señal quedó guardada (rating_4)', !!row1 && row1.client_signal === 'rating_4', JSON.stringify(row1));
    const lvl1 = await reqJson('GET', '/api/avatar-level', undefined, cookie);
    check('5k XP tras ratear: 40 + 10 = 50, ratings = 1',
      lvl1.status === 200 && lvl1.json && lvl1.json.xp === 50 && lvl1.json.ratings === 1, JSON.stringify(lvl1.json));
    const sig2 = await reqJson('POST', '/api/posts/' + postId + '/signal', { signal: 'rating_5' }, cookie);
    check('5l re-ratear (rating_5) → 200 ok', sig2.status === 200 && sig2.json && sig2.json.ok === true, JSON.stringify(sig2.json));
    const rows = db.prepare('SELECT COUNT(*) AS c FROM post_signals WHERE user_id = ? AND post_id = ?').get(uid, postId).c;
    const lvl2 = await reqJson('GET', '/api/avatar-level', undefined, cookie);
    check('5m segundo rating del MISMO posteo: una sola fila, XP sigue en 50 (sin doble XP)',
      rows === 1 && lvl2.json && lvl2.json.xp === 50 && lvl2.json.ratings === 1, `rows=${rows} xp=${lvl2.json && lvl2.json.xp}`);
    const row2 = db.prepare('SELECT client_signal FROM post_signals WHERE user_id = ? AND post_id = ?').get(uid, postId);
    check('5n el segundo rating pisa la señal (rating_5) sin duplicar', !!row2 && row2.client_signal === 'rating_5', JSON.stringify(row2));
  } finally { kill(); }
}

(async () => {
  try { await vmAsync; } catch (e) { check('4x VM sin excepción', false, e.message); }
  try { await parteBoot(); } catch (e) { check('5x boot sin excepción', false, e.message); }
  console.log(`\nlote-analisis-estrellas: ${pass} ok, ${fail} mal`);
  if (fails.length) console.log('fallos:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
