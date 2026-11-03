// test-lotepedircambiolindo.js — LOTE PEDIR-CAMBIO-LINDO (2/11, SIN PUSH).
// Mock v1 aprobado por Valentino 2/11 ~12:59 («claro, asi se ve mucho
// mas lindo!»): pedir un cambio en pantalla completa, posteo grande
// SIN CORTAR, pregunta en grande, 4 atajos en tarjetas glass celeste,
// campo grande arriba del teclado, deslizar abajo vuelve al posteo.
// Evolución visual de chat-posteo-pantalla + cambio-simple: NO es un
// tercer chat (reutiliza #pzPostChat, hfAnchorChip y el #chatCard único).
// Node puro: asserts estáticos + VM con DOM falso sobre el bloque nuevo.
// Pines: base = trabajo chat-posteo sobre v558 servido (app ?v=373,
// styles ?v=20261090); server del árbol = v557 (caveat: el v558 real
// de Juli no existe en ningún dir local; la liberación re-basa ANTES
// de bumpear).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
const block = sliceFn(app, '// (LOTE PEDIR-CAMBIO-LINDO', 'function pzPostChatOpen(post) {');
const openSlice = sliceFn(app, 'function pzPostChatOpen(post) {', 'function pzPostChatReturn()');
const closeSlice = sliceFn(app, 'function pzPostChatClose()', '// (Corrección grilla 2026-10-25)');

// ---------- Versiones + censo (base chat-posteo sobre v558) ----------
t(srv.includes("const BUILD_ID = '20261101-v572'"), 'server del árbol: BUILD v557 (caveat: re-basar a v558 real al liberar)');
t(idx.includes('app.js?v=383'), 'index ES: app.js?v=380');
t(idx.includes('styles.css?v=20261099'), 'index ES: styles 20261090');
t(idxEn.includes('styles.css?v=20261091') && !idxEn.includes('app.js?v='), 'en/index: styles 20261090, sin app.js (deriva preexistente)');
t(app.includes("const CHUNK_V = '20261101-v565'"), 'CHUNK_V sigue v556 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 4 (sin cambio)');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');
t(!srv.includes('pzPcHero'), 'server.js sin tocar (sin pzPcHero)');

// ---------- Bloque nuevo: no duplica el chat ----------
t(block.length > 1000, 'bloque pedir-cambio-lindo presente');
t(!block.includes('chatCardHTML('), 'bloque: no renderiza un chat nuevo (reutiliza el #chatCard único)');
t(block.includes('function pzPcHeroHTML') && block.includes('function pzPcRenderHero')
  && block.includes('function pzPcClear') && block.includes('function pzPcNoteHTML')
  && block.includes('function pzPcStatusChip'), 'bloque: 5 funciones pzPc definidas');
t(block.includes("hfAnchorChip(b.dataset.pzPcChip)"), 'tarjetas glass llaman a hfAnchorChip (mismo camino que los chips del ancla)');
t(!block.includes('api.post') && !block.includes('fetch('), 'bloque: no crea un camino de envío nuevo');
t(openSlice.includes('pzPcRenderHero(post)'), 'Open: renderiza el hero con el posteo');
t(openSlice.includes('PZ_PC_OPEN = true'), 'Open: marca PZ_PC_OPEN');
t(openSlice.includes("pzPcNoteHTML"), 'Open: agrega la nota bajo el campo');
t(openSlice.includes('PZ_PC_EDIT_PH'), 'Open: fija el placeholder de edición');
t(closeSlice.includes('PZ_PC_OPEN = false') && closeSlice.includes('pzPcClear()'), 'Close: limpia hero/nota y baja el flag');
t(!closeSlice.includes('hfSetAnchor(null)'), 'Close: no borra el ancla (el chat principal queda con su contexto)');

// ---------- Placeholder fijo de edición (no lo pisa la rotación de 4 s) ----------
t(app.includes('PZ_PC_EDIT_PH'), 'placeholder de edición definido (ES/EN)');
t(sliceFn(app, 'function pzChatPhNext() {', 'function pzAskPhNext').includes('PZ_PC_OPEN')
  && sliceFn(app, 'function pzChatPhNext() {', 'function pzAskPhNext').includes('PZ_PC_EDIT_PH'),
  'pzChatPhNext: con la pantalla abierta fija el placeholder, no rota');

// ---------- CSS: mock v1 ----------
t(css.includes('.pz-pc-hero-img{') && css.includes('object-fit:contain'), 'css: foto del hero con object-fit:contain (nunca cortada)');
t(css.includes('max-height:26vh'), 'css: hero topado a 26vh (sin scrollear se ven posteo, pregunta, atajos y campo)');
t(css.includes('.pz-pc-q{font-size:19px'), 'css: pregunta en grande (19px)');
t(css.includes('rgba(39,147,200,.28)') && css.includes('rgba(39,147,200,.12)'), 'css: tarjetas con degradado celeste opción 2');
t(css.includes('.pz-pc-card{') && css.includes('blur(18px) saturate(1.6)'), 'css: tarjetas glass blur 18 saturate 1.6');
t(css.includes('.pz-pc-card{') && css.includes('rgba(255,255,255,.85)'), 'css: tarjetas con borde blanco .85');
t(css.includes('.pz-pc-grid{display:grid;grid-template-columns:1fr 1fr'), 'css: 4 atajos en grilla 2x2');
t(css.includes('.pz-postchat-body #chatAnchor{display:none}'), 'css: ancla original oculta SOLO dentro de .pz-postchat-body');
t(cnt(css, '#chatAnchor{display:none}') === 1, 'css: el ancla se oculta en UN solo lugar, con scope .pz-postchat-body (fuera de la pantalla vuelve a verse)');
t(css.includes('.pz-postchat-body .chat-input-row .in{font-size:17px'), 'css: campo grande (17px, sin zoom iOS)');
t(css.includes('@keyframes pzPcSpark'), 'css: magia de entrada (destellos ✦ one-shot)');
t(css.includes('prefers-reduced-motion') && css.includes('.pz-pc-spark{display:none}'), 'css: reduced-motion anula la magia');
t(css.indexOf('.pz-pc-hero{') < css.indexOf('/* ============ LOTE CHAT SIMPLE'), 'css: bloque antes del marcador CHAT SIMPLE (fuera del slice CHAT4S)');

// ---------- M78: funciones nuevas llamadas desde tarjetas/menús ----------
for (const fn of ['pzPcStatusChip', 'pzPcHeroHTML', 'pzPcRenderHero', 'pzPcClear', 'pzPcNoteHTML']) {
  t(cnt(app, 'function ' + fn) === 1 && cnt(app, fn) >= 2, 'M78: ' + fn + ' definida y llamada (sin llamadas desde tarjetas/menús nuevas)');
}
t(!app.includes('onclick="pzPc'), 'M78: ninguna tarjeta usa onclick con funciones nuevas (onclick directo a hfAnchorChip existente)');

// ---------- VM con DOM falso: hero ES / EN / sin foto / rehace 0 / clear ----------
function fakeEl(id) {
  const el = {
    id: id || '', hidden: false, style: {}, dataset: {}, parentNode: null, nextSibling: null,
    children: [], innerHTML: '', onclick: null, disabled: false, value: '', placeholder: '',
    _removed: false,
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c, ref) { c.parentNode = el; const i = el.children.indexOf(ref); if (i === -1) el.children.push(c); else el.children.splice(i, 0, c); return c; },
    remove() { el._removed = true; el.parentNode = null; },
    querySelector(sel) {
      if (sel === '.chat-input-row') return el._row || null;
      if (sel === '.pz-pc-note') return el._note || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-pz-pc-chip]' && el._btns) return el._btns;
      if (sel === '[data-pz-pc-chip]' && typeof el.innerHTML === 'string') {
        const out = [];
        for (const m of el.innerHTML.matchAll(/data-pz-pc-chip="([^"]+)"/g)) {
          const b = fakeEl(''); b.dataset.pzPcChip = m[1];
          if (/data-pz-pc-chip="redo"[^>]*disabled/.test(el.innerHTML) && m[1] === 'redo') b.disabled = true;
          out.push(b);
        }
        el._btns = out;
        return out;
      }
      return [];
    },
  };
  return el;
}
function makeCtx(en) {
  const layer = fakeEl('pzPostChat');
  const body = fakeEl('pzPostChatBody');
  const card = fakeEl('chatCard');
  const row = fakeEl('row'); card._row = row;
  const byId = { pzPostChat: layer, pzPostChatBody: body, chatCard: card };
  const calls = { chip: [] };
  const doc = {
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => {
      const e = fakeEl('');
      Object.defineProperty(e, 'innerHTML', {
        get() { return e._html || ''; },
        set(v) { e._html = v; if (e.id === 'pzPcHero') byId.pzPcHero = e; },
        configurable: true,
      });
      e.insertAdjacentHTML = () => {};
      return e;
    },
    querySelector: () => null,
  };
  const ctx = {
    console,
    document: doc,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (src, w) => (typeof src === 'string' && src.indexOf('/media/') === 0 ? src.replace(/\.(jpe?g|png)$/i, '@' + w + '.webp') : src),
    hfWhenChip: (p) => (p && p.scheduled_at ? 'Jue 19/11 · 19:00' : ''),
    hfRedoLeft: (p) => {
      if (!p || p.status === 'published' || p.media_type === 'video') return null;
      const v = (p.redo_left === null || p.redo_left === undefined) ? 3 : Number(p.redo_left);
      return Math.max(0, Math.min(3, v));
    },
    hfAnchorChip: (kind) => { calls.chip.push(kind); },
    __pzPcEn: en,
  };
  ctx.pzPostChatIsEn = () => ctx.__pzPcEn;
  vm.createContext(ctx);
  vm.runInContext(block + '\nthis.__pzPc = { pzPcHeroHTML, pzPcRenderHero, pzPcClear, pzPcStatusChip };', ctx);
  return { ctx, calls, layer, body, card, byId };
}
// ES: hero completo, foto grande sin cortar, atajos clicables
{
  const { ctx, calls, layer, byId } = makeCtx(false);
  layer.insertBefore = function (c, ref) { c.parentNode = layer; layer.children.push(c); return c; };
  ctx.pzPcRenderHero({ id: 7, image_path: '/media/foto.jpg', caption: 'Hola', scheduled_at: '2026-11-19T19:00:00Z', status: 'scheduled', redo_left: 2 });
  const hero = byId.pzPcHero;
  t(!!hero, 'VM ES: se crea #pzPcHero dentro de la capa');
  t(hero.innerHTML.includes('@1080.webp'), 'VM ES: hero usa la imagen grande (mv 1080), no la miniatura');
  t(hero.innerHTML.includes('pz-pc-hero-img'), 'VM ES: hero con clase de imagen sin cortar');
  t(hero.innerHTML.includes('¿Qué le cambio a este posteo?'), 'VM ES: pregunta en grande');
  t(hero.innerHTML.includes('WhatsApp'), 'VM ES: bajada de la pregunta');
  t(hero.innerHTML.includes('Jue 19/11'), 'VM ES: chip día/hora del posteo');
  t(hero.innerHTML.includes('Pendiente'), 'VM ES: chip de estado Pendiente');
  t(hero.innerHTML.includes('Cambiar la foto') && hero.innerHTML.includes('Cambiar el texto')
    && hero.innerHTML.includes('Cambiar día y hora') && hero.innerHTML.includes('Rehacer'), 'VM ES: los 4 atajos presentes');
  t(!hero.innerHTML.includes('disabled'), 'VM ES: rehacer habilitado con 2 rehaces');
  const btns = hero.querySelectorAll('[data-pz-pc-chip]');
  t(btns.length === 4, 'VM ES: 4 tarjetas clicables');
  btns[0].onclick({ stopPropagation() {} });
  t(calls.chip.join(',') === 'photo', 'VM ES: tocar la tarjeta foto llama a hfAnchorChip(photo) (mismo camino)');
  btns[3].onclick({ stopPropagation() {} });
  t(calls.chip.join(',') === 'photo,redo', 'VM ES: tocar Rehacer llama a hfAnchorChip(redo)');
}
// EN: espejo
{
  const { ctx, byId } = makeCtx(true);
  ctx.document.getElementById = (id) => byId[id] || null;
  const layer = byId.pzPostChat;
  layer.insertBefore = function (c, ref) { c.parentNode = layer; layer.children.push(c); return c; };
  ctx.pzPcRenderHero({ id: 8, image_path: '/media/foto.jpg', scheduled_at: '2026-11-19T19:00:00Z', status: 'scheduled', redo_left: 1 });
  const h = byId.pzPcHero.innerHTML;
  t(h.includes('What do I change on this post?'), 'VM EN: pregunta en inglés');
  t(h.includes('Pending'), 'VM EN: estado Pending');
  t(h.includes('Change the photo') && h.includes('Change the text') && h.includes('Change the day/time') && h.includes('Redo'), 'VM EN: 4 atajos en inglés');
}
// Sin foto: placeholder, sin img rota; rehace 0: tarjeta deshabilitada
{
  const { ctx, byId } = makeCtx(false);
  const layer = byId.pzPostChat;
  layer.insertBefore = function (c, ref) { c.parentNode = layer; layer.children.push(c); return c; };
  ctx.pzPcRenderHero({ id: 9, status: 'draft', redo_left: 0 });
  const h = byId.pzPcHero.innerHTML;
  t(!h.includes('<img'), 'VM sin foto: sin <img> roto (placeholder)');
  t(h.includes('pz-pc-hero-ph'), 'VM sin foto: placeholder del hero');
  t(h.includes('Borrador'), 'VM sin foto: estado Borrador');
  t(/data-pz-pc-chip="redo"[^>]*disabled/.test(h), 'VM rehace 0: tarjeta Rehacer deshabilitada');
}
// Clear: vacía el hero
{
  const { ctx, byId, card } = makeCtx(false);
  const layer = byId.pzPostChat;
  layer.insertBefore = function (c, ref) { c.parentNode = layer; layer.children.push(c); return c; };
  ctx.pzPcRenderHero({ id: 7, image_path: '/media/foto.jpg', status: 'scheduled' });
  t(byId.pzPcHero.innerHTML.length > 0, 'VM clear: hero con contenido antes de limpiar');
  ctx.pzPcClear();
  t(byId.pzPcHero.innerHTML === '', 'VM clear: hero vacío tras cerrar');
}

console.log('pedir-cambio-lindo: ' + ok + ' ok, ' + bad + ' mal');
process.exit(bad ? 1 : 0);
