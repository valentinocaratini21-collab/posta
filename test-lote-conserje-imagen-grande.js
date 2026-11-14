// test-lote-conserje-imagen-grande.js — LOTE v951 CONSERJE-IMAGEN-GRANDE
// (12/11, Valentino 11:42 «si, arma eso»): en Conserje, clickear una imagen
// la ve EN GRANDE ahí mismo, dentro del perfil, sin salir de Conserje ni
// perder el contexto; al cerrarla vuelve a donde estaba. Hoy al tocarla no
// pasa nada: las imágenes son <img> planos sin handler (portada 180px de
// la tarjeta, mini 96×96 del detalle, fotos del chat y fotos recientes).
// El fix (SOLO public/chunk-conserje.js + estampados): las 4 imágenes
// llevan data-cj-img; el handler de la tarjeta las atiende ANTES que
// data-cj y abre el visor (overlay en document.body, fuera de
// #conserjeCard para que ningún re-render lo borra); cerrar por X, por
// tocar fuera de la imagen o por Escape, sin tocar el scroll. En la lista,
// la foto abre el visor (el resto de la tarjeta sigue abriendo el detalle).
// CHUNK_V sube a v951 en app.js: loadChunk sirve
// /chunk-conserje.js?v=CHUNK_V — sin el bump, el chunk nuevo no llega
// a nadie (precedente v849). styles.css NO se toca (todo inline).
// Cubre, con public/chunk-conserje.js en vm (mismo patrón que
// test-lote-conserje-revision-v1.js, con DOM falso más rico para el
// overlay): A) marcado data-cj-img de las 4 imágenes; B) abrir el visor
// (en el mismo lugar, sin scroll ni re-render); C) cerrar por X / fuera /
// Escape / tecla que no es Escape; D) lista: foto → visor, resto → detalle;
// E) chat: las fotos del hilo abren el visor; F) regresiones Conserje
// (decidir, volver, arreglar); G) estampados BUILD/CHUNK_V/?v=; H) gate M78.
// Uso: node test-lote-conserje-imagen-grande.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const SRC = fs.readFileSync(path.join(__dirname, 'public', 'chunk-conserje.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const INDEX_ES = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const INDEX_EN = fs.readFileSync(path.join(__dirname, 'public', 'en', 'index.html'), 'utf8');
const STYLES = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const cnt = (s, sub) => s.split(sub).length - 1;
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

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
  return {
    ok: true, fecha: '2026-11-09', ventana: { estado: 'abierta', ahora: '19:42' },
    resumen: { total: 2, decididos: 0, pendientes: 2, necesitan_atencion: 1, atencion_sin_decidir: 1, sin_posteo: 0, todo_decidido: false },
    items: [ladyee, cafe], sin_posteo: [],
  };
}

// ---------- DOM falso con overlay (body, getElementById, keydown) ----------
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
  const server = { datos: fixtureDatos(), calls: [] };
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
    adminApi: async (endpoint, method, body) => {
      server.calls.push({ endpoint, method, body });
      if (endpoint === 'support/conserje/revision' && method === 'GET') return JSON.parse(JSON.stringify(server.datos));
      if (endpoint === 'support/conserje/revision/decidir' && method === 'POST') {
        const it = server.datos.items.find((x) => x.user_id === body.user_id);
        if (it) it.decision = { decision: body.decision, etiqueta: body.decision, nota: body.nota || '' };
        return { ok: true, decision: body.decision };
      }
      if (endpoint === 'support/conserje/revision/armar' && method === 'POST') return { ok: true, decision: 'pedir' };
      if (endpoint === 'support/conserje/nota' && method === 'POST') return { ok: true, nota: body.nota };
      if (/^support\/\d+\/journey$/.test(endpoint)) {
        return { ok: true, chat: [{ role: 'user', text: 'Mirá [foto:/media/foto-cliente.jpg] esta foto' }, { role: 'assistant', text: 'La veo, sale así.' }], fotos_recientes: [{ file_path: '/media/reciente-1.jpg' }] };
      }
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
    ctx: sandbox, card, els, server, capTxt, capMas, document, body, scrollCalls,
    html(expr) { return vm.runInContext(expr, sandbox); },
    async bind() { await vm.runInContext('bindConserje()', sandbox); },
    estado() { return vm.runInContext('conserjeEstado', sandbox); },
    overlay() { return document.getElementById('cjImgGrande'); },
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
function otherTarget() {
  return { getAttribute() { return null; }, closest() { return null; } };
}

(async () => {
  // ---------- A) marcado data-cj-img de las 4 imágenes ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const lista = t.html('conserjeCardHTML(' + JSON.stringify(d.items[1]) + ')');
    check('A1 portada de la tarjeta lleva data-cj-img', /<img[^>]*data-cj-img[^>]*\/media\/cafe-463\.jpg/.test(lista) || lista.includes('data-cj-img') && lista.includes('/media/cafe-463.jpg'));
    check('A2 portada con cursor:zoom-in (se ve clickeable)', lista.includes('cursor:zoom-in'));
    // RE-PIN DEL COMPUESTO (preparador conserje-compuesto, sobre v1045):
    // desde v906 la tarjeta de la lista usa la mini 96×96 contain (A1/A2 de
    // arriba la cubren) y la portada 180px cover vive en conserjeFotoHTML,
    // que este lote también marca: se rinde ESA función directo.
    const portada = t.html('conserjeFotoHTML(' + JSON.stringify(d.items[1]) + ')');
    check('A3 portada (conserjeFotoHTML) sigue 180px cover (sin recorte nuevo)', portada.includes('height:180px') && portada.includes('object-fit:cover') && portada.includes('data-cj-img'));
    const det = t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[1]) + ',' + JSON.stringify(d) + ')');
    check('A4 mini del detalle lleva data-cj-img', det.includes('data-cj-img') && det.includes('/media/cafe-463.jpg'));
    check('A5 mini sigue 96×96 contain', det.includes('width:96px;height:96px;object-fit:contain'));
    const imgs = [...det.matchAll(/<img[^>]*data-cj-img[^>]*>/g)];
    check('A6 ninguna imagen con data-cj-img lleva data-cj (no dispara la tarjeta)', imgs.length > 0 && imgs.every((m) => !m[0].includes('data-cj="')));
    check('A7 foto del chat ([foto:...]) lleva data-cj-img', SRC.split('\n').some((l) => l.includes('const img = fm ?') && l.includes('data-cj-img')));
    check('A8 fotos recientes del chat llevan data-cj-img', SRC.split('\n').some((l) => l.includes('fotos_recientes') && l.includes("'<img") && l.includes('data-cj-img')));
    const idxImg = SRC.indexOf("closest('img[data-cj-img]')");
    const idxCj = SRC.indexOf("closest('[data-cj]')");
    check('A9 la intercepción de la imagen va ANTES que la lectura de data-cj', idxImg > 0 && idxCj > 0 && idxImg < idxCj);
  }
  // ---------- B) abrir el visor en el mismo lugar ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click(btnTarget({ 'data-cj': 'ver', 'data-user': '84' }));
    check('B0 el detalle se abrió (vistaId 84)', t.estado().vistaId === '84');
    const htmlAntes = t.card.innerHTML;
    const scrollAntes = t.scrollCalls.length;
    await t.click(imgTarget('/media/cafe-463.jpg'));
    const over = t.overlay();
    check('B1 click en la mini abre el visor', !!over);
    check('B2 el visor vive en document.body (no dentro de #conserjeCard)', !!over && over.parentNode === t.body);
    check('B3 el visor muestra LA imagen clickeada en grande', !!over && over.innerHTML.includes('/media/cafe-463.jpg') && over.innerHTML.includes('max-height:86vh') && over.innerHTML.includes('object-fit:contain'));
    check('B4 el visor tiene botón X para cerrar', !!over && over.innerHTML.includes('data-cj-img-cerrar') && over.innerHTML.includes('✕'));
    check('B5 abrir no re-renderiza la vista (mismo innerHTML)', t.card.innerHTML === htmlAntes);
    check('B6 abrir no toca el scroll', t.scrollCalls.length === scrollAntes);
    check('B7 el visor es un dialog fijo con fondo oscuro', !!over && over.style.cssText.includes('position:fixed') && over.style.cssText.includes('z-index:9999'));
    // Abrir otra imagen reemplaza, no duplica.
    await t.click(imgTarget('/media/otra.jpg'));
    check('B8 segunda imagen reemplaza el visor (sigue habiendo UNO)', t.body.children.filter((c) => c.id === 'cjImgGrande').length === 1 && t.overlay().innerHTML.includes('/media/otra.jpg'));
  }
  // ---------- C) cerrar: X / fuera / Escape / otra tecla ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click(btnTarget({ 'data-cj': 'ver', 'data-user': '84' }));
    const htmlAntes = t.card.innerHTML;
    const scrollAntes = t.scrollCalls.length;
    // Cerrar tocando fuera (el fondo del overlay).
    await t.click(imgTarget('/media/cafe-463.jpg'));
    t.overlay().fire('click', { target: t.overlay() });
    check('C1 tocar fuera de la imagen cierra el visor', !t.overlay());
    // Click en la imagen misma NO cierra.
    await t.click(imgTarget('/media/cafe-463.jpg'));
    t.overlay().fire('click', { target: otherTarget() });
    check('C2 tocar la imagen grande NO cierra el visor', !!t.overlay());
    // Cerrar con la X.
    t.overlay().fire('click', { target: { getAttribute: (k) => (k === 'data-cj-img-cerrar' ? '' : null) } });
    check('C3 la X cierra el visor', !t.overlay());
    // Cerrar con Escape.
    await t.click(imgTarget('/media/cafe-463.jpg'));
    t.document.fireKey('Escape');
    check('C4 Escape cierra el visor', !t.overlay());
    // Otra tecla NO cierra y el listener se limpió al cerrar.
    await t.click(imgTarget('/media/cafe-463.jpg'));
    t.document.fireKey('Enter');
    check('C5 una tecla que no es Escape NO cierra', !!t.overlay());
    check('C6 el listener de Escape se quita al cerrar', (() => { t.document.fireKey('Escape'); return t.document.keydownCount() === 0; })());
    check('C7 tras cerrar, la vista sigue en el detalle (sin re-render)', t.card.innerHTML === htmlAntes);
    check('C8 cerrar no toca el scroll', t.scrollCalls.length === scrollAntes);
    // Cerrar sin visor no rompe.
    let ok = true;
    try { t.html('conserjeImgGrandeCerrar()'); } catch (e) { ok = false; }
    check('C9 cerrar sin visor abierto no rompe', ok && !t.overlay());
  }
  // ---------- D) lista: foto → visor, resto → detalle ----------
  {
    const t = makeCtx();
    await t.bind();
    const htmlAntes = t.card.innerHTML;
    await t.click(imgTarget('/media/cafe-463.jpg'));
    check('D1 en la lista, click en la foto abre el visor', !!t.overlay() && t.overlay().innerHTML.includes('/media/cafe-463.jpg'));
    check('D2 en la lista, la foto NO abre el detalle (vistaId sigue null)', t.estado().vistaId === null || t.estado().vistaId === undefined);
    check('D3 la lista sigue intacta detrás del visor', t.card.innerHTML === htmlAntes);
    t.document.fireKey('Escape');
    check('D4 tras cerrar, la lista sigue (vistaId null)', !t.overlay() && (t.estado().vistaId === null || t.estado().vistaId === undefined));
    await t.click(btnTarget({ 'data-cj': 'ver', 'data-user': '84' }));
    check('D5 click en el resto de la tarjeta SÍ abre el detalle', t.estado().vistaId === '84' && !t.overlay());
  }
  // ---------- E) chat: las fotos del hilo abren el visor ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click(btnTarget({ 'data-cj': 'ver', 'data-user': '84' }));
    await t.click(btnTarget({ 'data-cj': 'chat', 'data-user': '84' }, '💬 Ver el chat con Posty'));
    const box = t.els['#cjChat'].innerHTML;
    check('E1 el chat carga con la foto del mensaje', box.includes('/media/foto-cliente.jpg'));
    check('E2 la foto del mensaje lleva data-cj-img', /<img[^>]*data-cj-img[^>]*\/media\/foto-cliente\.jpg/.test(box) || (box.includes('data-cj-img') && box.includes('/media/foto-cliente.jpg')));
    check('E3 la foto reciente lleva data-cj-img', box.includes('data-cj-img') && box.includes('/media/reciente-1.jpg'));
    const htmlAntes = t.card.innerHTML;
    await t.click(imgTarget('/media/foto-cliente.jpg'));
    check('E4 click en la foto del chat abre el visor con esa foto', !!t.overlay() && t.overlay().innerHTML.includes('/media/foto-cliente.jpg'));
    check('E5 abrir desde el chat no re-renderiza (el hilo sigue)', t.card.innerHTML === htmlAntes);
    t.document.fireKey('Escape');
    check('E6 tras cerrar, el chat sigue cargado', t.els['#cjChat'].dataset.cjChat === '1');
  }
  // ---------- F) regresiones Conserje ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click(btnTarget({ 'data-cj': 'ver', 'data-user': '89' }));
    await t.click(btnTarget({ 'data-cj': 'decidir', 'data-decision': 'sale', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-09' }, '✓ Sale así'));
    const decidir = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('F1 «Sale así» sigue decidiendo "sale" con post_id', decidir.length === 1 && decidir[0].body.decision === 'sale' && decidir[0].body.post_id === 581);
    await t.click(btnTarget({ 'data-cj': 'volver' }));
    check('F2 «Volver» sigue volviendo a la lista', t.estado().vistaId === null);
    await t.click(btnTarget({ 'data-cj': 'ver', 'data-user': '89' }));
    await t.click(btnTarget({ 'data-cj': 'arreglar', 'data-user': '89' }, '✎ Editar'));
    check('F3 «Editar» sigue abriendo el campo de arreglo', t.els['#cjArreglo'].style.display === 'block');
    const det = t.html('conserjeDetalleHTML(' + JSON.stringify(fixtureDatos().items[0]) + ',' + JSON.stringify(fixtureDatos()) + ')');
    check('F4 ficha, chat, IG y «Qué pasó» intactos', det.includes('Ficha de Ladyee Boutique') && det.includes('Ver el chat con Posty') && det.includes('Ver el feed de Ladyee Boutique') && det.includes('Qué pasó'));
  }
  // ---------- G) estampados ----------
  {
    check('G1 BUILD_ID v1046 en server.js (re-pin del compuesto: era v951 provisorio)', SERVER.includes("const BUILD_ID = '20261105-v1046';"));
    check('G2 BUILD_ID v942 ya no está', !SERVER.includes('20261105-v942'));
    check('G3 CHUNK_V v1046 en app.js (re-pin del compuesto: era v951 provisorio)', APP.includes("const CHUNK_V = '20261105-v1046';"));
    check('G4 CHUNK_V v890 ya no está', !APP.includes("const CHUNK_V = '20261105-v890';"));
    check('G5 el bump lleva su comentario (v1046)', APP.includes('(v1046 · LOTE CONSERJE COMPUESTO AMPLIO) bump: chunk-conserje'));
    check('G6 CHUNK_V v1046 ×1 en app.js', cnt(APP, '20261105-v1046') === 1);
    check('G7 app.js?v=714 ×1 en index ES (re-pin del compuesto: era 661)', cnt(INDEX_ES, 'app.js?v=714') === 1);
    check('G8 app.js?v=652 ya no está en index ES', !INDEX_ES.includes('app.js?v=652'));
    check('G9 index EN sin app.js?v= (no lleva el bump)', !INDEX_EN.includes('app.js?v='));
    check('G10 styles.css byte-idéntico a la base del compuesto (v1045; era el md5 de v942)', md5(STYLES) === '10ce4845e800fb1c70a6d31b37fc793f');
    check('G11 index EN byte-idéntico a la base del compuesto (v1045; era el md5 de v942)', md5(INDEX_EN) === '1ffab92c0f397b30645e7de5d8343f3c');
    check('G12 server.js 41028 líneas en el compuesto (re-pin: 36827 era sobre v942; por esta capa solo cambia el BUILD)', SERVER.split('\n').length - 1 === 41028);
    check('G13 app.js 34452 líneas en el compuesto (re-pin: 32754 era sobre v942; por esta capa solo cambia el CHUNK_V)', APP.split('\n').length - 1 === 34452);
  }
  // ---------- H) gate M78: funciones llamadas existen ----------
  {
    const llamados = [...new Set([...SRC.matchAll(/\b(conserje[A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]))];
    const t = makeCtx();
    const faltan = llamados.filter((fn) => t.html('typeof ' + fn) === 'undefined');
    check('H1 toda función conserje* llamada existe definida (' + llamados.length + ')', faltan.length === 0, faltan.join(', '));
    check('H2 conserjeImgGrandeAbrir definida y llamada desde el handler', t.html('typeof conserjeImgGrandeAbrir') === 'function' && SRC.includes("if (img) { conserjeImgGrandeAbrir(img.getAttribute('src')); return; }"));
    check('H3 conserjeImgGrandeCerrar definida y llamada al abrir, al cerrar por X/fondo y por Escape', t.html('typeof conserjeImgGrandeCerrar') === 'function' && cnt(SRC, 'conserjeImgGrandeCerrar(') >= 4);
    check('H4 sin top-level let/const/var nuevos que choquen con app.js (solo functions + var existente)', !/^let conserje|^const conserje|^var conserje(?!Estado)/m.test(SRC));
  }

  console.log(`\nconserje-imagen-grande: ${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
