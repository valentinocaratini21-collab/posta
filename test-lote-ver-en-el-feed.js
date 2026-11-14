// test-lote-ver-en-el-feed.js — LOTE VER-EN-EL-FEED (conserje)
// (13/11, Valentino 14:51): en la revisión del conserje, un botón
// «Ver en el feed» por tarjeta muestra el posteo puesto en la grilla
// espejo del perfil del cliente, en su posición final entre sus
// posteos reales, para juzgar el conjunto sin salir de Conserje.
// Aterriza COMPUESTO con CONSERJE-IMAGEN-GRANDE (v951): la base-fusión
// es su release verificado; este lote suma SOLO:
//   · server.js: GET /api/admin/support/conserje/feed — compone la
//     grilla con las mismas fuentes de la home del dueño (snapshot de
//     IG vía homeSnapshotGet + posteos de la cuenta) y el mismo
//     criterio de orden de homeGridCompose (Lote 12: fijados primero;
//     no publicados por fecha DESC; salidos por fecha DESC; dedupe por
//     shortcode; archivados fuera). Sin snapshot → disponible:false,
//     sin fabricar celdas.
//   · public/chunk-conserje.js: el botón en la tarjeta y en el detalle
//     (data-cj="feed") + el overlay en document.body (cjFeed) que rinde
//     la grilla con la celda en revisión marcada; cerrar (X / fuera /
//     Escape) vuelve exactamente a donde estaba.
// Cubre: A) el botón por tarjeta (y su ausencia sin posteo); B) abrir
// desde la lista: llamada, orden rendido, celda marcada, cerrar de las
// 3 maneras sin perder el lugar; C) abrir desde el detalle y volver;
// D) sin feed → línea honesta y CERO celdas; E) error de carga → aviso
// sin celdas; F) gate M78 (toda acción data-cj tiene su rama; las
// funciones nuevas existen); G) la pieza base intacta (visor) y el
// diff acotado a 2 archivos + esta suite, con los estampados del
// compuesto sin tocar; H) BOOT real: el endpoint compone la grilla con
// el orden del Lote 12 (fixture con publicados + semana + recientes),
// marca la celda en revisión, excluye duplicados/archivados/historias
// y responde disponible:false sin snapshot.
// Uso: node test-lote-ver-en-el-feed.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const ROOT = __dirname;
// RE-PIN DEL COMPUESTO (preparador conserje-compuesto, sobre v1045): la
// base de control se puede apuntar con LOTE_BASE_DIR (patrón de la casa);
// sin la variable, el default sigue siendo la base-fusión del builder.
const BASE = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base-fusion');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'chunk-conserje.js'), 'utf8');
const cnt = (s, sub) => s.split(sub).length - 1;
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const readRoot = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------- datos de ejemplo (forma de colaRevision) ----------
function ficha(uid, name) {
  return {
    ok: true, user_id: uid, business_name: name,
    vende: { estrella: 'Café de especialidad', rubro: 'Cafetería', productos: [], diferencial: '', objetivo: '' },
    gusta: { tono: 'Cercano', gustos: [], pidio_cambiar: [] },
    etapa: { color: 'verde', etiqueta: 'En ritmo' },
    lineas_rojas: [], paleta: [], plan: { plan: 'Posty', plan_status: 'active', desde: '2026-10-05' },
    estrategia: { linea: '' }, proximo_paso: { texto: '' }, historial: [],
    nota: { texto: '' }, faltantes: [],
  };
}
function fixtureDatos() {
  const cafe = {
    user_id: 84, business_name: 'Café Aroma', ig_username: 'cafearoma.palermo', origen: 'programado',
    necesita_atencion: false, motivo_atencion: '', decision: null,
    post: { id: 463, titulo: 'Medialunas como en casa', caption: 'Llegaron las medialunas.\nProbátelas calentitas.', image_url: '/media/cafe-463.jpg', tiene_foto: true, media_type: 'image', tipo: 'image', scheduled_at: '2026-11-09 19:00:00', status: 'scheduled', approval: 'pending', cuando: 'lun 9/11 · 19:00' },
    siguiente: null, ficha: ficha(84, 'Café Aroma'),
  };
  const ladyee = {
    user_id: 89, business_name: 'Ladyee Boutique', ig_username: 'ladyee.boutique', origen: 'programado',
    necesita_atencion: true, motivo_atencion: 'Dice «Shop now» en vez del producto', decision: null,
    post: { id: 581, titulo: 'Nueva colección: el vestido que pedían', caption: 'Llegó la nueva colección.', image_url: '/media/ladyee-581.jpg', tiene_foto: true, media_type: 'image', tipo: 'image', scheduled_at: '2026-11-08 17:00:00', status: 'scheduled', approval: 'pending', cuando: 'dom 8/11 · 17:00' },
    siguiente: null, ficha: ficha(89, 'Ladyee Boutique'),
  };
  const sinPost = {
    user_id: 91, business_name: 'Taller Ruiz', ig_username: '', origen: 'sin_posteo',
    necesita_atencion: false, motivo_atencion: '', decision: null, post: null,
    siguiente: null, ficha: ficha(91, 'Taller Ruiz'),
  };
  return {
    ok: true, fecha: '2026-11-09', ventana: { estado: 'abierta', ahora: '19:42' },
    resumen: { total: 2, decididos: 0, pendientes: 2, necesitan_atencion: 1, atencion_sin_decidir: 1, sin_posteo: 1, todo_decidido: false },
    items: [ladyee, cafe], sin_posteo: [sinPost],
  };
}
// Forma EXACTA de la respuesta del endpoint nuevo (orden ya compuesto
// por el servidor: fijado → no publicados DESC → salidos DESC).
function fixtureFeed(uid) {
  if (uid === '89') return { ok: true, disponible: false, motivo: 'sin_feed' };
  return {
    ok: true, disponible: true, user_id: 84, username: 'cafearoma.palermo', name: 'Café Aroma',
    pic: '/media/cafe-pic.jpg', revision_encontrada: true,
    tiles: [
      { kind: 'post', post_id: 470, img: '/media/cafe-470.jpg', media_type: 'image', status: 'published', es_revision: false, pinned: true },
      { kind: 'post', post_id: 466, img: '/media/cafe-466.jpg', media_type: 'image', status: 'scheduled', es_revision: false, pinned: false },
      { kind: 'post', post_id: 463, img: '/media/cafe-463.jpg', media_type: 'image', status: 'scheduled', es_revision: true, pinned: false },
      { kind: 'post', post_id: 455, img: '/media/cafe-455.jpg', media_type: 'carousel', status: 'published', es_revision: false, pinned: false },
      { kind: 'ig', post_id: null, img: '/media/ig-1.jpg', media_type: 'video', status: 'published', es_revision: false, pinned: false },
    ],
  };
}

// ---------- DOM falso con overlay (mismo patrón que imagen-grande) ----------
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: '', className: '', style: {},
    dataset: {}, children: [], parentNode: null, innerHTML: '', textContent: '',
    _attrs: {}, _handlers: {},
    setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
    addEventListener(t, fn) { (this._handlers[t] = this._handlers[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = this._handlers[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    fire(t, ev) { (this._handlers[t] || []).slice().forEach((fn) => fn(ev)); },
  };
  return el;
}

function makeCtx() {
  const server = { datos: fixtureDatos(), calls: [], feedFalla: false };
  const scrollCalls = [];
  const card = { innerHTML: '', __cjBound: false, style: {}, prepended: [],
    addEventListener(type, fn) { this.__handlers = this.__handlers || {}; this.__handlers[type] = fn; },
    prepend(node) { this.prepended.push(node); },
  };
  const els = {
    '#cjArreglo': { style: { display: 'none' }, dataset: {} },
    '#cjArregloNota': { value: '' },
    '#cjNota': { value: '' },
    '#cjNotaMsg': { textContent: '' },
    '#cjChat': { innerHTML: '', style: { display: '' }, dataset: {} },
    '#cjToken': { value: '' },
    '#cjTokenBtn': { onclick: null },
  };
  const capTxt = {
    _cls: new Set(),
    classList: {
      toggle(c) { if (capTxt._cls.has(c)) { capTxt._cls.delete(c); return false; } capTxt._cls.add(c); return true; },
      contains(c) { return capTxt._cls.has(c); },
    },
    scrollHeight: 200, clientHeight: 67, style: {},
  };
  const capMas = { style: { display: '' } };
  const body = makeEl('body');
  const docHandlers = {};
  const document = {
    body,
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => {
      const walk = (el) => { if (el.id === id) return el; for (const c of el.children) { const r = walk(c); if (r) return r; } return null; };
      return walk(body);
    },
    querySelector: (sel) => (sel === '.cj-cap-txt' ? capTxt : (sel === '[data-cj="cap-mas"]' ? capMas : null)),
    addEventListener: (t, fn) => { (docHandlers[t] = docHandlers[t] || []).push(fn); },
    removeEventListener: (t, fn) => { const a = docHandlers[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    fireKey: (key) => { (docHandlers.keydown || []).slice().forEach((fn) => fn({ key })); },
    keydownCount: () => (docHandlers.keydown || []).length,
  };
  const sandbox = {
    console, setTimeout, clearTimeout,
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    pzIc() { return ''; },
    $: (sel) => (sel === '#conserjeCard' ? card : (els[sel] || null)),
    loadChunk: async () => true,
    adminToken: () => 'tok',
    adminApi: async (endpoint, method, body2) => {
      server.calls.push({ endpoint, method, body: body2 });
      if (endpoint === 'support/conserje/revision' && method === 'GET') return JSON.parse(JSON.stringify(server.datos));
      const fm = /^support\/conserje\/feed\?user_id=(\d+)&post_id=(\d+)$/.exec(endpoint);
      if (fm && method === 'GET') {
        if (server.feedFalla) throw new Error('falla de red simulada');
        return fixtureFeed(fm[1]);
      }
      if (endpoint === 'support/conserje/revision/decidir' && method === 'POST') return { ok: true, decision: body2.decision };
      if (endpoint === 'support/conserje/revision/armar' && method === 'POST') return { ok: true, decision: 'pedir' };
      if (endpoint === 'support/conserje/nota' && method === 'POST') return { ok: true, nota: body2.nota };
      if (/^support\/\d+\/journey$/.test(endpoint)) return { ok: true, chat: [], fotos_recientes: [] };
      throw new Error('endpoint no stubbeado: ' + endpoint);
    },
    window: { scrollTo(...a) { scrollCalls.push(a); } },
    document,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'chunk-conserje.js' });
  return {
    ctx: sandbox, card, els, server, document, body, scrollCalls,
    html(expr) { return vm.runInContext(expr, sandbox); },
    async bind() { await vm.runInContext('bindConserje()', sandbox); },
    estado() { return vm.runInContext('conserjeEstado', sandbox); },
    feed() { return document.getElementById('cjFeed'); },
    feedBody() { const f = document.getElementById('cjFeed'); return f ? f.children[0].children[0] : null; },
    async flush() { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); },
    async click(target) {
      const h = card.__handlers && card.__handlers.click;
      if (!h) throw new Error('sin handler click');
      await h({ target });
    },
  };
}
function imgTarget(src) {
  return {
    getAttribute(k) { return k === 'src' ? src : null; },
    closest(sel) { return sel === 'img[data-cj-img]' ? this : null; },
  };
}
function btnTarget(attrs, text) {
  return {
    _attrs: attrs, textContent: text || '', disabled: false,
    getAttribute(k) { return this._attrs[k] !== undefined ? String(this._attrs[k]) : null; },
    closest(sel) { return sel === '[data-cj]' ? this : null; },
  };
}

(async () => {
  // ---------- A) el botón por tarjeta ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const cardCafe = t.html('conserjeCardHTML(' + JSON.stringify(d.items[1]) + ')');
    check('A1 la tarjeta con posteo lleva el botón «Ver en el feed»', cardCafe.includes('data-cj="feed"') && cardCafe.includes('Ver en el feed'));
    check('A2 el botón lleva user y post de ESA tarjeta', cardCafe.includes('data-user="84"') && cardCafe.includes('data-post="463"'));
    const cardLady = t.html('conserjeCardHTML(' + JSON.stringify(d.items[0]) + ')');
    check('A3 la tarjeta que necesita atención también lo lleva (post 581)', cardLady.includes('data-cj="feed"') && cardLady.includes('data-post="581"'));
    const cardSin = t.html('conserjeCardHTML(' + JSON.stringify(d.sin_posteo[0]) + ')');
    check('A4 la tarjeta SIN posteo no lleva botón (no hay nada que ubicar)', !cardSin.includes('data-cj="feed"'));
    const det = t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[1]) + ',' + JSON.stringify(d) + ')');
    check('A5 el detalle también lleva el botón, con el mismo post', det.includes('data-cj="feed"') && det.includes('data-post="463"') && det.includes('Ver en el feed'));
    check('A6 el botón NO es la foto: ninguna imagen lleva data-cj="feed"', ![...cardCafe.matchAll(/<img[^>]*>/g)].some((m) => m[0].includes('data-cj="feed"')));
  }
  // ---------- B) abrir desde la lista y cerrar sin perder el lugar ----------
  {
    const t = makeCtx();
    await t.bind();
    const htmlLista = t.card.innerHTML;
    const scrollAntes = t.scrollCalls.length;
    const clickP = t.click(btnTarget({ 'data-cj': 'feed', 'data-user': '84', 'data-post': '463' }, '🖼 Ver en el feed'));
    // Sin esperar: el DOM todavía muestra el estado de carga (la
    // respuesta del stub resuelve en microtask, después de este tick).
    const llamada = t.server.calls.find((c) => c.endpoint.startsWith('support/conserje/feed'));
    check('B1 tocar el botón pide el feed de ESE cliente y ESE posteo', !!llamada && llamada.endpoint === 'support/conserje/feed?user_id=84&post_id=463' && llamada.method === 'GET', llamada && llamada.endpoint);
    check('B2 el botón NO abre el detalle (vistaId sigue vacío)', !t.estado().vistaId);
    check('B3 el overlay se abre en document.body', !!t.feed() && t.feed().parentNode === t.body);
    check('B4 mientras carga, dice que está cargando (sin celdas)', t.feedBody().innerHTML.includes('Cargando el feed'));
    await clickP;
    await t.flush();
    const grid = t.feedBody().innerHTML;
    const orden = ['cafe-470.jpg', 'cafe-466.jpg', 'cafe-463.jpg', 'cafe-455.jpg', 'ig-1.jpg'].map((s) => grid.indexOf(s));
    check('B5 la grilla rinde las 5 celdas en el orden que vino del servidor', orden.every((i) => i >= 0) && orden.every((v, i, a) => i === 0 || a[i - 1] < v), orden.join(','));
    check('B6 la cabecera muestra el @ del cliente', grid.includes('@cafearoma.palermo') && grid.includes('cafe-pic.jpg'));
    check('B7 la celda en revisión está marcada (chip + anillo dorado)', grid.includes('En revisión') && grid.includes('outline:3px solid #FEC14D'));
    check('B8 el marcado es SOLO de la celda en revisión (un solo chip)', cnt(grid, 'En revisión') === 1);
    check('B9 el fijado lleva su marca y el video su ▶', grid.includes('📌 Fijado') && grid.includes('▶'));
    check('B10 la línea final dice que la marcada es donde va a salir', grid.includes('el posteo en revisión es la celda marcada'));
    check('B11 la lista detrás queda intacta (sin re-render)', t.card.innerHTML === htmlLista);
    check('B12 abrir no toca el scroll', t.scrollCalls.length === scrollAntes);
    // Cerrar con la X.
    t.feed().fire('click', { target: { getAttribute: (k) => (k === 'data-cj-feed-cerrar' ? '' : null) } });
    check('B13 la X cierra el feed y vuelvo a la lista intacta', !t.feed() && t.card.innerHTML === htmlLista);
    // Cerrar tocando fuera.
    await t.click(btnTarget({ 'data-cj': 'feed', 'data-user': '84', 'data-post': '463' }));
    await t.flush();
    t.feed().fire('click', { target: t.feed() });
    check('B14 tocar fuera cierra el feed', !t.feed());
    // Cerrar con Escape; otra tecla no; el listener se limpia.
    await t.click(btnTarget({ 'data-cj': 'feed', 'data-user': '84', 'data-post': '463' }));
    await t.flush();
    t.document.fireKey('Enter');
    check('B15 una tecla que no es Escape NO cierra', !!t.feed());
    t.document.fireKey('Escape');
    check('B16 Escape cierra y el listener se limpia', !t.feed() && t.document.keydownCount() === 0);
    check('B17 cerrar no toca el scroll', t.scrollCalls.length === scrollAntes);
  }
  // ---------- C) abrir desde el detalle y volver al detalle ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click(btnTarget({ 'data-cj': 'ver', 'data-user': '84' }));
    check('C0 estoy en el detalle de Café Aroma', t.estado().vistaId === '84');
    const htmlDet = t.card.innerHTML;
    await t.click(btnTarget({ 'data-cj': 'feed', 'data-user': '84', 'data-post': '463' }));
    await t.flush();
    check('C1 desde el detalle el feed abre con el posteo marcado', !!t.feed() && t.feedBody().innerHTML.includes('En revisión'));
    t.document.fireKey('Escape');
    check('C2 al cerrar sigo en el MISMO detalle (sin re-render ni cambio de vista)', !t.feed() && t.estado().vistaId === '84' && t.card.innerHTML === htmlDet);
  }
  // ---------- D) sin feed: línea honesta y CERO celdas ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click(btnTarget({ 'data-cj': 'feed', 'data-user': '89', 'data-post': '581' }));
    await t.flush();
    const h = t.feedBody().innerHTML;
    check('D1 sin snapshot, la vista lo dice en una línea honesta', h.includes('Todavía no tenemos el feed de este cliente'));
    check('D2 sin snapshot NO hay grilla ni una sola celda fabricada', !h.includes('cj-feed-grid') && !h.includes('<img'));
    check('D3 la línea no promete nada: no aparece ninguna foto del posteo', !h.includes('ladyee-581.jpg'));
  }
  // ---------- E) error de carga: aviso, sin celdas ----------
  {
    const t = makeCtx();
    t.server.feedFalla = true;
    await t.bind();
    await t.click(btnTarget({ 'data-cj': 'feed', 'data-user': '84', 'data-post': '463' }));
    await t.flush();
    const h = t.feedBody().innerHTML;
    check('E1 si la carga falla, avisa y no fabrica la grilla', h.includes('No se pudo cargar el feed') && !h.includes('cj-feed-grid'));
  }
  // ---------- F) gate M78: acciones y funciones ----------
  {
    const acciones = [...new Set([...SRC.matchAll(/data-cj="([a-z-]+)"/g)].map((m) => m[1]))];
    const sinRama = acciones.filter((a) => !SRC.includes("acc === '" + a + "'"));
    check('F1 toda acción data-cj del chunk tiene su rama en el handler (' + acciones.length + ' acciones)', sinRama.length === 0, sinRama.join(', '));
    const t = makeCtx();
    check('F2 las funciones nuevas existen definidas', ['conserjeFeedAbrir', 'conserjeFeedCerrar', 'conserjeFeedHTML', 'conserjeFeedTileHTML'].every((fn) => t.html('typeof ' + fn) === 'function'));
    check('F3 el handler llama a conserjeFeedAbrir con user y post', SRC.includes("if (acc === 'feed') { conserjeFeedAbrir(uid, t.getAttribute('data-post')); return; }"));
    const llamados = [...new Set([...SRC.matchAll(/\b(conserje[A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]))];
    const faltan = llamados.filter((fn) => t.html('typeof ' + fn) === 'undefined');
    check('F4 toda función conserje* llamada existe (' + llamados.length + ')', faltan.length === 0, faltan.join(', '));
  }
  // ---------- G) la pieza base intacta + diff acotado + estampados del compuesto ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click(imgTarget('/media/cafe-463.jpg'));
    const visorOk = (() => { const o = t.document.getElementById('cjImgGrande'); return !!o && o.innerHTML.includes('/media/cafe-463.jpg'); })();
    check('G1 el visor de imagen en grande (pieza base) sigue abriendo igual', visorOk);
    t.document.fireKey('Escape');
    check('G2 el visor sigue cerrando con Escape', !t.document.getElementById('cjImgGrande'));
    const difieren = [];
    // RE-PIN DEL COMPUESTO: en la fusión del builder solo diferían server.js
    // y el chunk; en el compuesto AMPLIO, app.js y el index ES difieren por
    // las capas hermanas (duda + CHUNK_V + ?v=) y la suite de la pieza base
    // fue re-pineada (su md5 lo cubre G7). Lo que ESTA capa no puede tocar y
    // ninguna otra toca sigue byte-idéntico: index EN y styles.css. La
    // igualdad total del compuesto la verifica el preparador por diff -rq.
    for (const rel of ['public/en/index.html', 'public/styles.css']) {
      const a = fs.readFileSync(path.join(ROOT, rel));
      const b = fs.readFileSync(path.join(BASE, rel));
      if (!a.equals(b)) difieren.push(rel);
    }
    check('G3 fuera de las capas del compuesto, NADA difiere de la base (index EN + styles byte-idénticos)', difieren.length === 0, difieren.join(', '));
    const SERVER = readRoot('server.js');
    check('G4 el endpoint nuevo está montado UNA vez, bajo requireAdminToken', cnt(SERVER, "'/api/admin/support/conserje/feed'") === 1 && SERVER.includes("app.get('/api/admin/support/conserje/feed', requireAdminToken"));
    check('G5 la composición usa la fuente de la home (homeSnapshotGet)', SERVER.includes('const snap = homeSnapshotGet(uid);'));
    check('G6 estampados del compuesto (re-pin: BUILD/CHUNK_V v1046, ?v=714; eran v951/661 provisorios)', SERVER.includes("const BUILD_ID = '20261105-v1046';") && readRoot('public/app.js').includes("const CHUNK_V = '20261105-v1046';") && readRoot('public/index.html').includes('app.js?v=714'));
    check('G7 la suite de la pieza base es la re-pineada por el preparador del compuesto (md5; era 324adb60 sin re-pins)', md5(readRoot('test-lote-conserje-imagen-grande.js')) === 'fb7cc51fe8a3c6324820bd8ce9a5b1db');
  }

  // ---------- H) BOOT real: el endpoint compone la grilla ----------
  await bootChecks();

  console.log(`\nver-en-el-feed: ${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- H: boot + siembra + GETs reales ----------
async function bootChecks() {
  const PORT = 35417;
  const TOKEN = 'feed-boot-token';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cjfeed-boot-'));
  const env = {
    ...process.env,
    PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: TOKEN, NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    OPENAI_API_KEY: '',
  };
  const getJson = async (p, token) => {
    const url = `http://127.0.0.1:${PORT}${p}${p.includes('?') ? '&' : '?'}token=${token === undefined ? TOKEN : token}`;
    const r = await fetch(url);
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    return { status: r.status, json: j };
  };
  const boot = async () => {
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { out += String(d); });
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) up = true; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!up) console.log('--- salida del servidor ---\n' + out.split('\n').slice(-25).join('\n'));
    return { child, up };
  };
  const stop = async (child) => {
    if (!child) return;
    const done = new Promise((r) => child.once('exit', r));
    try { child.kill('SIGTERM'); } catch (e) {}
    await Promise.race([done, new Promise((r) => setTimeout(r, 8000))]);
    try { child.kill('SIGKILL'); } catch (e) {}
  };
  let child = null;
  try {
    const b1 = await boot(); child = b1.child;
    check('H1 el servidor levanta (boot 1, crea la DB)', b1.up);
    if (!b1.up) throw new Error('no levanta');
    await stop(child); child = null;
    // Siembra directa en la DB recién creada (node:sqlite, sin módulos).
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const ts = (iso) => Math.floor(Date.parse(iso) / 1000);
    db.exec("INSERT INTO users (id, email, password_hash) VALUES (1, 'duena@cafe.test', 'x'), (2, 'otra@test.cafe', 'x')");
    const insPost = db.prepare('INSERT INTO posts (id, user_id, image_path, caption, status, scheduled_at, published_at, created_at, media_type, pinned, pinned_at, ig_permalink, ig_state) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    insPost.run(101, 1, '/media/p101.jpg', 'Fijado', 'published', null, '2026-11-01T15:00:00Z', '2026-10-30T10:00:00Z', 'image', 1, '2026-11-02T10:00:00Z', 'https://www.instagram.com/p/PINCODE1/', 'live');
    insPost.run(106, 1, '/media/p106.jpg', 'Semana que viene', 'scheduled', '2026-11-16T19:00:00Z', null, '2026-11-09T10:00:00Z', 'image', 0, '', '', 'live');
    insPost.run(102, 1, '/media/p102.jpg', 'EL DE LA REVISIÓN', 'scheduled', '2026-11-14T19:00:00Z', null, '2026-11-09T10:05:00Z', 'image', 0, '', '', 'live');
    insPost.run(107, 1, '/media/p107.jpg', 'Borrador sin fecha', 'draft', null, null, '2026-11-10T10:00:00Z', 'image', 0, '', '', 'live');
    insPost.run(108, 1, '/media/p108.jpg', 'Historia', 'scheduled', '2026-11-14T20:00:00Z', null, '2026-11-09T11:00:00Z', 'story', 0, '', '', 'live');
    insPost.run(103, 1, '/media/p103.jpg', 'Publicado duplicado en recents', 'published', null, '2026-11-12T19:00:00Z', '2026-11-08T10:00:00Z', 'image', 0, '', 'https://www.instagram.com/p/DUPCODE1/', 'live');
    insPost.run(104, 1, '/media/p104.jpg', 'Publicado viejo', 'published', null, '2026-11-05T19:00:00Z', '2026-11-01T10:00:00Z', 'image', 0, '', '', 'live');
    insPost.run(105, 1, '/media/p105.jpg', 'Archivado en IG', 'published', null, '2026-11-13T19:00:00Z', '2026-11-07T10:00:00Z', 'image', 0, '', 'https://www.instagram.com/p/ARCHCODE1/', 'archived_ext');
    const payload = {
      source: 'read', username: 'cafearoma.palermo', name: 'Café Aroma', pic: '/media/cafe-pic.jpg', highlights: [],
      recents: [
        { img: '/media/ig-nuevo.jpg', type: 'video', taken_at: ts('2026-11-13T19:00:00Z'), shortcode: 'IGNUEVO1' },
        { img: '/media/ig-dup.jpg', type: 'image', taken_at: ts('2026-11-12T19:00:00Z'), shortcode: 'DUPCODE1' },
        { img: '/media/ig-arch.jpg', type: 'image', taken_at: ts('2026-11-13T20:00:00Z'), shortcode: 'ARCHCODE1' },
        { img: '/media/ig-viejo.jpg', type: 'image', taken_at: ts('2026-11-03T19:00:00Z'), shortcode: 'IGVIEJO1' },
      ],
    };
    db.prepare('INSERT INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (?,?,?,?)')
      .run(1, 'cafearoma.palermo', JSON.stringify(payload), Date.now());
    db.close();
    const b2 = await boot(); child = b2.child;
    check('H2 el servidor levanta (boot 2, con la siembra)', b2.up);
    if (!b2.up) throw new Error('no levanta (2)');
    const sinTok = await getJson('/api/admin/support/conserje/feed?user_id=1&post_id=102', '');
    check('H3 sin token de admin → 403', sinTok.status === 403, String(sinTok.status));
    const r = await getJson('/api/admin/support/conserje/feed?user_id=1&post_id=102');
    check('H4 con token → disponible con el perfil del snapshot', r.status === 200 && r.json && r.json.ok === true && r.json.disponible === true && r.json.username === 'cafearoma.palermo' && r.json.pic === '/media/cafe-pic.jpg', JSON.stringify(r.json).slice(0, 200));
    const tiles = (r.json && r.json.tiles) || [];
    const ids = tiles.map((t) => (t.kind === 'post' ? 'p' + t.post_id : 'ig:' + t.img));
    const esperado = ['p101', 'p106', 'p102', 'p107', 'ig:/media/ig-nuevo.jpg', 'p103', 'p104', 'ig:/media/ig-viejo.jpg'];
    check('H5 el orden es el del Lote 12 (fijado → no publicados DESC → salidos DESC)', JSON.stringify(ids) === JSON.stringify(esperado), ids.join(' · '));
    const rev = tiles.find((t) => t.post_id === 102);
    check('H6 la celda en revisión es la del posteo 102 y viene marcada', !!rev && rev.es_revision === true && rev.img === '/media/p102.jpg' && r.json.revision_encontrada === true);
    check('H7 ninguna otra celda viene marcada como revisión', tiles.filter((t) => t.es_revision).length === 1);
    check('H8 afuera: el duplicado de recents, el archivado (y su recent) y la historia', !ids.some((x) => x.includes('ig-dup') || x.includes('ig-arch')) && !tiles.some((t) => t.post_id === 105 || t.post_id === 108));
    const r2 = await getJson('/api/admin/support/conserje/feed?user_id=2&post_id=102');
    check('H9 un cliente SIN snapshot → disponible:false y cero tiles', r2.status === 200 && r2.json && r2.json.disponible === false && !Array.isArray(r2.json.tiles), JSON.stringify(r2.json).slice(0, 160));
    const r3 = await getJson('/api/admin/support/conserje/feed?user_id=1');
    check('H10 sin post_id, la grilla sale igual y nada viene marcado', r3.status === 200 && r3.json && r3.json.disponible === true && r3.json.revision_encontrada === false && (r3.json.tiles || []).every((t) => !t.es_revision));
    const r4 = await getJson('/api/admin/support/conserje/feed');
    check('H11 sin user_id → 400', r4.status === 400, String(r4.status));
  } catch (e) {
    console.log('error del boot:', e.message);
    fail++;
  } finally {
    await stop(child);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}
