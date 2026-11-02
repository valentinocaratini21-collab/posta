#!/usr/bin/env node
/* LOTE HABLAR-DE-ESTE-POSTEO — test nuevo.
Corre con: node test-lotehablarposteo.js (sin dependencias, sin red).
Cubre: botón 💬 en la tile solo en ajustables del dueño; tarjeta de
contexto con foto + texto; botón en detalle y aprobación; resolver +
abrir el chat principal con el posteo anclado; quitar la tarjeta
restaura el chat; voz hereda el contexto; sin contexto el chat es el
de hoy; y que nada de lo vigente se tocó (corazón, mini-chat,
«Pedir un cambio», orden, server intacto). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRATCH = fs.existsSync(path.join(__dirname, 'pristine-v546', 'public', 'app.js'))
  ? __dirname : path.join(__dirname, '..');
const ROOT = path.join(SCRATCH, 'work');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const APP_PRE = fs.readFileSync(path.join(SCRATCH, 'pristine-v546', 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'));
const SRV_PRE = fs.readFileSync(path.join(SCRATCH, 'pristine-v546', 'server.js'));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('FAIL: ' + name); }
}
function eq(a, b, name) { ok(a === b, name + ' (esperado ' + JSON.stringify(b) + ', visto ' + JSON.stringify(a) + ')'); }

// Extrae una función top-level por su declaración hasta su cierre en col 0.
function extract(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const j = src.indexOf('\n}\n', i);
  if (j < 0) return null;
  return src.slice(i, j + 3);
}

// ---------- estáticos: presencia ----------
for (const f of ['function pzHablarAjustable(', 'function pzHablarResolver(', 'function pzHablarDePosteo(', 'function pzHablarClick(', 'function hfChatBtnBind(']) {
  ok(APP.includes(f), 'presente ' + f);
}
ok(APP.includes("closest('[data-hf-chat]')"), 'binder busca [data-hf-chat]');
ok(APP.includes("if (e.target.closest && e.target.closest('[data-hf-chat]')) return; // (LOTE HABLAR-DE-ESTE-POSTEO) el botón"), 'guard scf click');
ok(APP.includes("e.target.closest('.hf-strip, [data-hf-like]') || e.target.closest('[data-hf-chat]')"), 'guard scf mousemove (cadena vieja intacta + chat con ||)');
ok(APP.includes("if (e.target && e.target.closest && e.target.closest('[data-hf-chat]')) return;"), 'guard capture hfDetailBind');
ok(APP.includes("if (e.target && e.target.closest && e.target.closest('[data-hf-chat]')) return; // (LOTE HABLAR-DE-ESTE-POSTEO) el botón 💬 no arma hold/peek/arrastre"), 'guard pointerdown tile');
ok(APP.includes('data-hfd-act="talk"'), 'detalle: botón talk en la barra');
ok(APP.includes("if (name === 'talk') {"), 'detalle: caso talk en act()');
ok(APP.includes('id="apvTalk"'), 'aprobación: botón apvTalk');
ok(APP.includes("document.getElementById('apvTalk')"), 'aprobación: binding apvTalk');
ok(APP.includes('pzHablarClick(tk.dataset.apvid)'), 'aprobación: binding llama a pzHablarClick');
ok(CSS.includes('.hf-tile-chat{'), 'CSS: .hf-tile-chat');
ok(CSS.includes('left:6px;bottom:38px'), 'CSS: talk abajo-izquierda sobre la foto (espejo del corazón)');
ok(CSS.includes('.hf-anchor-cap{'), 'CSS: .hf-anchor-cap');
ok(APP.includes('hf-anchor-cap'), 'tarjeta: línea de caption en la barra');
ok(SRV.equals(SRV_PRE), 'server.js byte-idéntico a prístino');

// ---------- estáticos: lo vigente NO se tocó ----------
for (const decl of ['function hfSetAnchor(', 'function hfOpenChatForPost(', 'function hfAskChangeBtnHTML(', 'function chatExchange(', 'function voiceSend(', 'function pcAskChange(']) {
  const a = extract(APP, decl), b = extract(APP_PRE, decl);
  ok(!!a && !!b && a === b, 'intacto ' + decl);
}
ok(APP.includes('data-pc-act="ask-change"'), 'weekCardHTML: «Pedir un cambio» intacto');
ok(APP.includes('data-hf-like'), 'corazón de la tile intacto');
ok(APP.includes('anchor_post_id'), 'chatExchange manda anchor_post_id');
{
  const ce = extract(APP, 'async function chatExchange(');
  ok(ce && ce.indexOf('anchor_post_id') < ce.indexOf('}, extra || {}))'), 'chatExchange: anchor antes del spread de extra (la voz no lo pisa)');
  const vs = extract(APP, 'async function voiceSend(');
  ok(vs && vs.includes("chatExchange({ text: '🎙️ Nota de voz', extra: { audio: dataUrl } })"), 'voz: voiceSend va por chatExchange con audio (hereda el contexto)');
  ok(ce && ce.includes('anchor_post_id: (typeof HF_CHAT_ANCHOR'), 'sin ancla: anchor_post_id undefined como hoy');
}

// ---------- censo (idéntico a prístino y a los valores del brief) ----------
function cnt(src, s) { return src.split(s).length - 1; }
for (const [s, v] of [['pzGoBack', 4], ['pz-detalle-setup', 1], ['/aprobar', 1], ['autofetch', 0], ['pcDayKeyShift', 7]]) {
  eq(cnt(APP, s), v, 'censo app ' + s);
  eq(cnt(APP, s), cnt(APP_PRE, s), 'censo app ' + s + ' igual a prístino');
}
{
  const srv = SRV.toString('utf8'), srvPre = SRV_PRE.toString('utf8');
  for (const [s, v] of [['catsMatch', 3], ['week-redo', 16], ['first_week', 3], ['/aprobar', 16]]) {
    eq(cnt(srv, s), v, 'censo server ' + s);
    eq(cnt(srv, s), cnt(srvPre, s), 'censo server ' + s + ' igual a prístino');
  }
}

// ---------- M78 del lote: todo lo llamado desde las superficies nuevas existe definido ----------
{
  const defs = new Set();
  const re = /(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m;
  while ((m = re.exec(APP)) !== null) defs.add(m[1]);
  const needed = ['pzHablarAjustable', 'pzHablarResolver', 'pzHablarDePosteo', 'pzHablarClick', 'hfChatBtnBind',
    'hfSetAnchor', 'hfOpenChatForPost', 'hfPaintAnchor', 'hfAskChange', 'pzIc', 'esc', 'mv', 'hfRedoLineHTML', 'hfRedoLeft'];
  const missing = needed.filter((n) => !defs.has(n) && !new RegExp('(?:const|let|var)\\s+' + n + '\\s*=').test(APP) && !APP.includes(n + ' = ('));
  eq(missing.length, 0, 'M78 lote: 0 faltantes en superficies nuevas (' + needed.length + '/' + needed.length + ')');
  const defsPre = new Set();
  const re2 = /(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((m = re2.exec(APP_PRE)) !== null) defsPre.add(m[1]);
  eq(defs.size - defsPre.size, 5, 'M78 delta: +5 funciones (pzHablarAjustable, pzHablarResolver, pzHablarDePosteo, pzHablarClick, hfChatBtnBind)');
}

// ---------- funcional: bloque HOME_FEED (tile + tarjeta + detalle) ----------
const TZ = 'America/Argentina/Buenos_Aires';
function mkSandbox(lang, appSrc) {
  const sb = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: (name) => '<svg data-ic="' + name + '"></svg>',
    mv: (p) => p,
    pcTz: () => TZ,
    pcParseDate: (s0) => { const s = String(s0 || ''); if (!s) return null; let x = s.replace(' ', 'T'); if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z'; const d = new Date(x); return isNaN(d) ? null : d; },
    ME: lang ? { lang } : undefined,
  };
  vm.createContext(sb);
  const a = appSrc.indexOf('const HOME_FEED_CAP');
  const b = appSrc.indexOf('/* ===== /HOME_FEED ===== */', a);
  vm.runInContext(appSrc.slice(a, b), sb);
  return sb;
}
const es = mkSandbox(null, APP);
const en = mkSandbox('en', APP);
ok(typeof es.homeTileHTML === 'function' && typeof es.hfAnchorBarHTML === 'function', 'bloque HOME_FEED carga');
const todayBA = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const todayIso = todayBA + 'T21:30:00.000Z';
const P = (extra) => Object.assign({ id: 1, status: 'scheduled', media_type: 'image', image_path: '/media/p1.jpg', caption: 'c' }, extra || {});
{
  const t = es.homeTileHTML({ kind: 'post', post: P({ id: 21, scheduled_at: todayIso }), day: todayBA, isNew: false }, 0);
  ok(t.includes('data-hf-chat="21"') && t.includes('hf-tile-chat'), 'tile programada del dueño: botón 💬 con data-hf-chat');
  ok(t.includes('Hablar de este posteo'), 'tile: aria-label «Hablar de este posteo»');
  ok(t.includes('data-hf-like'), 'tile: corazón intacto junto al botón');
  const tEn = en.homeTileHTML({ kind: 'post', post: P({ id: 22, scheduled_at: todayIso }), day: todayBA, isNew: false }, 0);
  ok(tEn.includes('Talk about this post'), 'tile EN: «Talk about this post»');
  const tDraft = es.homeTileHTML({ kind: 'post', post: P({ id: 23, status: 'draft', scheduled_at: todayIso }), day: todayBA, isNew: false }, 0);
  ok(tDraft.includes('data-hf-chat="23"'), 'tile borrador con imagen: botón 💬');
  const tDraftSin = es.homeTileHTML({ kind: 'post', post: P({ id: 24, status: 'draft', scheduled_at: null, image_path: '' }), day: todayBA, isNew: false }, 0);
  ok(!tDraftSin.includes('data-hf-chat'), 'tile borrador SIN imagen: sin botón');
  const tPub = es.homeTileHTML({ kind: 'post', post: P({ id: 25, status: 'published', published_at: '2026-10-20T15:00:00.000Z', scheduled_at: todayIso }), day: null, isNew: false }, 0);
  ok(!tPub.includes('data-hf-chat'), 'tile publicada: sin botón');
  const tVis = es.homeTileHTML({ kind: 'post', post: P({ id: 26, scheduled_at: todayIso }), day: todayBA, isNew: false, visitor: true }, 0);
  ok(!tVis.includes('data-hf-chat'), 'tile visitante: sin botón');
  const tArch = es.homeTileHTML({ kind: 'post', post: P({ id: 27, scheduled_at: todayIso }), day: todayBA, isNew: false, archivedExt: true }, 0);
  ok(!tArch.includes('data-hf-chat'), 'tile archivada: sin botón');
  const tIg = es.homeTileHTML({ kind: 'ig', img: '/r/1.jpg', type: 'image', taken_at: 1700000000, isNew: false }, 0);
  ok(!tIg.includes('data-hf-chat'), 'tile IG: sin botón');
}
{
  const bar = es.hfAnchorBarHTML({ id: 31, image_path: '/media/a31.jpg', caption: 'Mi sillón gris en oferta esta semana', status: 'draft', media_type: 'image', redo_left: 2 }, false);
  ok(bar.includes('hf-anchor-thumb') && bar.includes('/media/a31.jpg'), 'tarjeta: foto');
  ok(bar.includes('hf-anchor-cap') && bar.includes('Mi sillón gris en oferta esta semana'), 'tarjeta: texto del posteo');
  ok(bar.includes('data-hf-anchor-x'), 'tarjeta: ✕ para quitarla');
  ok(bar.includes('Cambiar la foto') && bar.includes('Cambiar el texto'), 'tarjeta: chips intactos');
  const barSin = es.hfAnchorBarHTML({ id: 32, image_path: '/media/a32.jpg', caption: '', status: 'draft', media_type: 'image', redo_left: 2 }, false);
  ok(!barSin.includes('hf-anchor-cap'), 'tarjeta sin caption: sin línea de texto (como hoy)');
  const barMal = es.hfAnchorBarHTML({ id: 33, image_path: '/media/a33.jpg', caption: '<script>alert(1)</script> hola', status: 'draft', media_type: 'image', redo_left: 2 }, false);
  ok(!barMal.includes('<script>') && barMal.includes('&lt;script&gt;'), 'tarjeta: caption escapado');
  const capLargo = 'x'.repeat(200);
  const barLargo = es.hfAnchorBarHTML({ id: 34, image_path: '/media/a34.jpg', caption: capLargo, status: 'draft', media_type: 'image', redo_left: 2 }, false);
  const capDiv = (barLargo.match(/hf-anchor-cap">([^<]*)</) || [])[1] || '';
  ok(capDiv.length === 140, 'tarjeta: caption recortado a 140');
  const barEn = en.hfAnchorBarHTML({ id: 35, image_path: '/media/a35.jpg', caption: 'hello world', status: 'draft', media_type: 'image', redo_left: 2 }, true);
  ok(barEn.includes('hello world') && barEn.includes('data-hf-anchor-x'), 'tarjeta EN: texto + ✕');
}
{
  const det = (sb, post, enFlag) => sb.hfDetailHTML(post, { en: enFlag, user: 'negocio', pic: '', name: 'Negocio', propIso: null, visitor: false });
  const d1 = det(es, P({ id: 41, status: 'draft', redo_left: 2, scheduled_at: todayIso }), false);
  ok(d1.includes('data-hfd-act="talk"') && d1.includes('Hablar de este posteo'), 'detalle borrador: botón «Hablar de este posteo»');
  const d2 = det(es, P({ id: 42, status: 'published', published_at: '2026-10-20T15:00:00.000Z', scheduled_at: todayIso }), false);
  ok(!d2.includes('data-hfd-act="talk"'), 'detalle publicado: sin botón');
  const d3 = det(en, P({ id: 43, status: 'scheduled', scheduled_at: todayIso }), true);
  ok(d3.includes('Talk about this post'), 'detalle EN: «Talk about this post»');
  const d4 = es.hfDetailHTML(P({ id: 44, status: 'draft', scheduled_at: todayIso }), { en: false, user: 'negocio', pic: '', name: 'Negocio', propIso: null, visitor: true });
  ok(!d4.includes('data-hfd-act="talk"'), 'detalle visitante: sin botón');
}

// ---------- funcional: apvMoreHTML extraído ----------
{
  const src = extract(APP, 'function apvMoreHTML(');
  ok(!!src, 'apvMoreHTML extraíble');
  const sb = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: (name) => '<svg data-ic="' + name + '"></svg>',
    ME: undefined, console,
  };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  const p = { id: 9, image_path: '/media/p9.jpg' };
  const rowSch = sb.apvMoreHTML(p, 'scheduled', true, false, '');
  ok(rowSch.includes('id="apvTalk"') && rowSch.includes('Hablar de este posteo'), 'aprobación programado: botón apvTalk');
  const rowSchSin = sb.apvMoreHTML({ id: 10, image_path: '' }, 'scheduled', true, false, '');
  ok(!rowSchSin.includes('id="apvTalk"'), 'aprobación programado sin imagen: sin botón');
  const rowPub = sb.apvMoreHTML({ id: 11, image_path: '/media/p11.jpg' }, 'published', false, false, '');
  eq(rowPub, '', 'aprobación publicado: sin fila (como hoy)');
  const rowDraft = sb.apvMoreHTML(p, 'draft', false, true, '');
  ok(rowDraft.includes('id="apvTalk"'), 'aprobación borrador: botón apvTalk');
}

// ---------- funcional: helpers extraídos (async) ----------
function runFn(src, sbExtra) {
  const sb = Object.assign({
    console,
    document: { getElementById: () => null, addEventListener: () => {} },
    window: {}, location: { hash: '' },
    toast: () => {}, api: { get: async () => [] },
    HF_TILES: [], HF_ASK_POSTS: {},
  }, sbExtra || {});
  vm.createContext(sb);
  vm.runInContext(src, sb);
  return sb;
}
(async () => {
  {
    const src = extract(APP, 'function pzHablarAjustable(');
    const sb = runFn(src + '\nthis.__t = pzHablarAjustable;');
    const f = sb.__t;
    ok(f({ id: 1, status: 'draft', image_path: '/a.jpg' }) === true, 'ajustable: borrador con imagen');
    ok(f({ id: 2, status: 'scheduled', image_path: '/a.jpg' }) === true, 'ajustable: programado con imagen');
    ok(f({ id: 3, status: 'published', image_path: '/a.jpg' }) === false, 'ajustable: publicado no');
    ok(f({ id: 4, status: 'draft', image_path: '' }) === false, 'ajustable: borrador sin imagen no');
    ok(f(null) === false && f({ status: 'draft' }) === false, 'ajustable: sin id no');
  }
  {
    const src = extract(APP, 'async function pzHablarResolver(');
    let apiCalls = 0;
    const sb1 = runFn(src, {
      HF_TILES: [{ kind: 'post', post: { id: 7, caption: 'de tiles', image_path: '/t.jpg', status: 'draft' } }],
      api: { get: async () => { apiCalls++; return []; } },
    });
    const p1 = await vm.runInContext('pzHablarResolver(7)', sb1);
    ok(p1 && p1.caption === 'de tiles' && apiCalls === 0, 'resolver: HF_TILES primero, sin llamada a la API');
    const sb2 = runFn(src, {
      HF_ASK_POSTS: { 8: { id: 8, caption: 'de registro', image_path: '/r.jpg', status: 'scheduled' } },
      api: { get: async () => { apiCalls++; return []; } },
    });
    const p2 = await vm.runInContext('pzHablarResolver(8)', sb2);
    ok(p2 && p2.caption === 'de registro', 'resolver: HF_ASK_POSTS segundo');
    const sb3 = runFn(src, {
      api: { get: async () => [{ id: 9, caption: 'de api', image_path: '/a.jpg', status: 'draft' }] },
    });
    const p3 = await vm.runInContext('pzHablarResolver(9)', sb3);
    ok(p3 && p3.caption === 'de api', 'resolver: fallback /api/posts');
    const sb4 = runFn(src, { api: { get: async () => [{ id: 10 }] } });
    const p4 = await vm.runInContext('pzHablarResolver(99)', sb4);
    ok(p4 === null, 'resolver: sin coincidencia → null (sin navegar, sin inventar)');
  }
  {
    const src = extract(APP, 'function pzHablarDePosteo(');
    let opened = null;
    const sb1 = runFn(src, {
      document: { getElementById: (id) => (id === 'mzSheet' ? {} : null) },
      hfOpenChatForPost: (p) => { opened = p; },
      scfClosePop: () => {}, hfDetailClose: () => {}, pcCloseSheet: () => {},
      mzHomeHash: () => '#/app/inicio', render: () => {},
    });
    vm.runInContext('pzHablarDePosteo({ id: 5, caption: "x", image_path: "/x.jpg", status: "draft" })', sb1);
    ok(opened && opened.id === 5, 'abrir: con hoja, abre el chat con el posteo');
    ok(sb1.HF_CHAT_OPEN_PENDING !== true, 'abrir: con hoja, sin pendiente');
    const loc2 = { hash: '#/app/post/5' };
    const sb2 = runFn(src, {
      document: { getElementById: () => null },
      location: loc2,
      hfOpenChatForPost: () => {},
      scfClosePop: () => {}, hfDetailClose: () => {}, pcCloseSheet: () => {},
      mzHomeHash: () => '#/app/inicio', render: () => {},
    });
    vm.runInContext('pzHablarDePosteo({ id: 5, caption: "x", image_path: "/x.jpg", status: "draft" })', sb2);
    ok(sb2.HF_CHAT_OPEN_PENDING === true, 'abrir: sin chat en el DOM, queda pendiente');
    ok(loc2.hash === '#/app/inicio', 'abrir: sin chat, navega a home');
  }
  {
    let listeners = [];
    let clicked = null;
    const sb = {
      window: {},
      document: { addEventListener: (ev, fn) => { listeners.push(fn); } },
      pzHablarClick: (id) => { clicked = id; },
      console,
    };
    vm.createContext(sb);
    const iife = APP.slice(APP.indexOf('(function hfChatBtnBind() {'), APP.indexOf('function hfOpenChatForPost(post) {'));
    vm.runInContext(iife, sb);
    eq(listeners.length, 1, 'binder: un solo listener');
    vm.runInContext(iife, sb);
    eq(listeners.length, 1, 'binder: segunda corrida no duplica (guard)');
    let stopped = 0, prevented = 0;
    const fakeBtn = { dataset: { hfChat: '42' } };
    const ev = {
      target: { closest: (sel) => (sel === '[data-hf-chat]' ? fakeBtn : null) },
      stopPropagation: () => { stopped++; },
      preventDefault: () => { prevented++; },
    };
    listeners[0](ev);
    eq(clicked, '42', 'binder: click en 💬 llama a pzHablarClick con el id');
    eq(stopped, 1, 'binder: stopPropagation (no abre el detalle)');
    eq(prevented, 1, 'binder: preventDefault');
    clicked = null; stopped = 0;
    listeners[0]({ target: { closest: () => null }, stopPropagation: () => { stopped++; }, preventDefault: () => {} });
    eq(clicked, null, 'binder: click fuera del botón no hace nada');
  }

  // ---------- control negativo en prístino ----------
  ok(!APP_PRE.includes('pzHablarDePosteo'), 'prístino: sin helpers nuevos');
  ok(!APP_PRE.includes('hf-anchor-cap'), 'prístino: tarjeta sin línea de texto');
  {
    const sbPre = mkSandbox(null, APP_PRE);
    const tPre = sbPre.homeTileHTML({ kind: 'post', post: P({ id: 21, scheduled_at: todayIso }), day: todayBA, isNew: false }, 0);
    ok(!tPre.includes('data-hf-chat'), 'prístino: tile sin botón 💬 (el lote lo trae de vuelta)');
  }

  console.log(`\ntest-lotehablarposteo: ${pass}/${pass + fail} OK`);
  if (fail) { console.log('FALLOS:'); fails.forEach((f) => console.log(' - ' + f)); process.exit(1); }
})().catch((e) => { console.error('ERROR DEL TEST:', e); process.exit(1); });
