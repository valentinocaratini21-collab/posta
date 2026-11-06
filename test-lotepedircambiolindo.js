// test-lotepedircambiolindo.js — LOTE CHAT-POSTEO-REDISENO (6/11, SIN PUSH).
// Mock v1 aprobado por Valentino 6/11 01:08 («Perfectoooo»): en «¿Qué le
// cambio a este posteo?» (pzPostChat) el chat casi no se veía — foto
// gigante + 4 tarjetas 2×2 empujaban el hilo fuera de pantalla. Rediseño:
// tira compacta sticky arriba, pregunta como primera burbuja de Posty,
// 4 atajos en UNA fila horizontal de chips sobre el composer, hilo
// protagonista, píldora «Subir fotos o video» fuera del DOM en esta
// pantalla (ver test-lotechatideassacar.js para el ciclo abrir/cerrar).
// SUPERSEDE el mock v1 de pedir-cambio-lindo (2/11: hero sin cortar +
// tarjetas glass): la grilla 2×2 y la foto gigante salen.
// Node puro: asserts estáticos + VM con DOM falso sobre el bloque nuevo.
// Pines: re-base v712 (HEAD 3906a2ba; /api/version 20261105-v712 en ambos
// dominios; app.js 051782fa, styles 9671bbea) + lote, BUILD v713. El
// preparador actualizó estos pines al re-basar (eran v703).
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

// ---------- Versiones + censo (base v712 + lote, BUILD v713) ----------
t(srv.includes("const BUILD_ID = '20261105-v713'"), 'server del árbol: BUILD v713');
t(idx.includes('app.js?v=477'), 'index ES: app.js?v=477');
t(idx.includes('styles.css?v=20261162'), 'index ES: styles 20261162');
t(idxEn.includes('styles.css?v=20261162') && !idxEn.includes('app.js?v='), 'en/index: styles 20261162, sin app.js');
t(app.includes("const CHUNK_V = '20261105-v712'"), 'CHUNK_V sigue v712 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 17, 'censo server: marcador 17');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
t(!srv.includes('pzPcHero'), 'server.js sin tocar (sin pzPcHero)');

// ---------- Bloque nuevo: no duplica el chat ----------
t(block.length > 1000, 'bloque pedir-cambio-lindo presente');
t(!block.includes('chatCardHTML('), 'bloque: no renderiza un chat nuevo (reutiliza el #chatCard único)');
t(block.includes('function pzPcStripHTML') && block.includes('function pzPcHeroHTML')
  && block.includes('function pzPcChipRowHTML') && block.includes('function pzPcRenderHero')
  && block.includes('function pzPcChipRowClick') && block.includes('function pzPcClear')
  && block.includes('function pzPcNoteHTML') && block.includes('function pzPcStatusChip'),
  'bloque: 8 funciones pzPc definidas (tira, hero, fila, render, delegación, clear, nota, estado)');
t(block.includes('pzPcChipAction(b.dataset.pzPcChip)') && !block.includes('hfAnchorChip(b.dataset.pzPcChip)'),
  'delegación: los atajos llaman a pzPcChipAction por closest (no a hfAnchorChip)');
t(!block.includes("hero.querySelectorAll('[data-pz-pc-chip]')"),
  'delegación: el render ya no cablea por botón (el binding del hero murió con la grilla)');
t(block.includes("'/api/drafts/'") && block.includes('photo-restyle') && !block.includes('fetch('),
  'bloque: el único POST es el rehacer vigente (photo-restyle, sin fetch nuevo)');
t(openSlice.includes('pzPcRenderHero(post)'), 'Open: renderiza tira + pregunta + fila con el posteo');
t(openSlice.includes('PZ_PC_OPEN = true'), 'Open: marca PZ_PC_OPEN');
t(openSlice.includes('pzPcNoteHTML'), 'Open: agrega la nota bajo el campo');
t(openSlice.includes('PZ_PC_EDIT_PH'), 'Open: fija el placeholder de edición');
t(openSlice.includes('PZ_PC_UPROW'), 'Open: desmonta la píldora de subida (PZ_PC_UPROW)');
t(closeSlice.includes('PZ_PC_OPEN = false') && closeSlice.includes('pzPcClear()'), 'Close: limpia hero/fila/nota y baja el flag');
t(closeSlice.includes('PZ_PC_UPROW'), 'Close: re-inserta la píldora de subida (PZ_PC_UPROW)');
t(!closeSlice.includes('hfSetAnchor(null)'), 'Close: no borra el ancla (el chat principal queda con su contexto)');

// ---------- Placeholder fijo de edición (no lo pisa la rotación de 4 s) ----------
t(app.includes('PZ_PC_EDIT_PH'), 'placeholder de edición definido (ES/EN)');
t(sliceFn(app, 'function pzChatPhNext() {', 'function pzAskPhNext').includes('PZ_PC_OPEN')
  && sliceFn(app, 'function pzChatPhNext() {', 'function pzAskPhNext').includes('PZ_PC_EDIT_PH'),
  'pzChatPhNext: con la pantalla abierta fija el placeholder, no rota');

// ---------- CSS: rediseño 6/11 ----------
t(css.includes('.pz-pc-hero{flex:none'), 'css: hero flex:none (contenedor fijo, no scrollea)');
t(css.includes('.pz-pc-strip{') && css.includes('display:flex'), 'css: tira compacta flex');
t(css.includes('.pz-pc-strip-img{width:56px;height:56px') && css.includes('object-fit:cover'), 'css: miniatura 56×56 con cover');
t(css.includes('.pz-pc-qbubble'), 'css: burbuja de pregunta');
t(css.includes('.pz-pc-chiprow{') && css.includes('overflow-x:auto'), 'css: fila de chips con scroll horizontal');
t(css.includes('.pz-pc-chipbtn{') && css.includes('border-radius:999px'), 'css: chips en píldora');
t(css.includes('.pz-pc-chiprow') && css.includes('mask-image:linear-gradient(90deg,#000 88%,transparent)'), 'css: fade al borde derecho de la fila (el scroll se lee intencional)');
t(css.includes('.pz-postchat-body #chatAnchor{display:none}'), 'css: ancla original oculta SOLO dentro de .pz-postchat-body');
t(cnt(css, '#chatAnchor{display:none}') === 1, 'css: el ancla se oculta en UN solo lugar, con scope .pz-postchat-body (fuera de la pantalla vuelve a verse)');
t(css.includes('.pz-postchat-body .chat-input-row .in{font-size:14px'), 'css: campo 14px (placeholder entero a 390px; sin zoom iOS por maximum-scale=1)');
t(css.includes('.pz-postchat-body .chat-input-row .btn{width:38px;height:38px'), 'css: botones del composer 38px solo en esta pantalla');
t(css.includes('.pz-pc-note{text-align:center;font-size:11.5px'), 'css: nota de confianza 11.5px');
t(!css.includes('.pz-pc-grid{'), 'css: la grilla 2×2 salió');
t(!css.includes('.pz-pc-card{'), 'css: las tarjetas grandes salieron');
t(!css.includes('.pz-pc-hero-imgwrap'), 'css: la foto gigante salió');
t(!css.includes('.pz-pc-q{'), 'css: la pregunta fuera de burbuja salió');
t(!css.includes('.pz-pc-spark'), 'css: los destellos del hero salieron (el mock no los lleva en la tira)');
t(!css.includes('@keyframes pzPcSpark'), 'css: sin keyframes de destellos');
t(css.indexOf('.pz-pc-hero{') < css.indexOf('/* ============ LOTE CHAT SIMPLE'), 'css: bloque antes del marcador CHAT SIMPLE (fuera del slice CHAT4S)');

// ---------- M78: funciones nuevas llamadas desde tarjetas/menús ----------
for (const fn of ['pzPcStatusChip', 'pzPcStripHTML', 'pzPcHeroHTML', 'pzPcChipRowHTML', 'pzPcRenderHero', 'pzPcChipRowClick', 'pzPcClear', 'pzPcNoteHTML']) {
  t(cnt(app, 'function ' + fn) === 1 && cnt(app, fn) >= 2, 'M78: ' + fn + ' definida y llamada (sin llamadas desde tarjetas/menús nuevas)');
}
t(!app.includes('onclick="pzPc'), 'M78: ninguna tarjeta usa onclick con funciones nuevas (delegación por closest)');

// ---------- VM con DOM falso: tira + burbuja + fila ES / EN / sin foto / rehace 0 / clear ----------
function matchEl(el, sel) {
  if (!sel) return false;
  if (sel[0] === '#') return el.id === sel.slice(1);
  if (sel[0] === '.') return (el.className || '').split(' ').indexOf(sel.slice(1)) !== -1;
  if (sel[0] === '[') {
    const m = sel.match(/\[([^\]=]+)(?:="([^"]*)")?\]/);
    if (!m) return false;
    if (m[1] === 'data-pz-pc-chip') {
      return el.dataset && el.dataset.pzPcChip !== undefined && (m[2] === undefined || el.dataset.pzPcChip === m[2]);
    }
    return false;
  }
  return false;
}
function fakeEl(id) {
  const el = {
    id: id || '', className: '', hidden: false, style: {}, dataset: {}, parentNode: null,
    children: [], innerHTML: '', onclick: null, disabled: false, value: '', placeholder: '',
    _removed: false, _html: '',
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i !== -1) el.children.splice(i, 1); c.parentNode = null; return c; },
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = el; const i = el.children.indexOf(ref); if (i === -1) el.children.push(c); else el.children.splice(i, 0, c); return c; },
    remove() { el._removed = true; if (el.parentNode) el.parentNode.removeChild(el); el.parentNode = null; },
    insertAdjacentHTML(pos, html) {
      // Solo la fila de chips usa esto en el bloque: parse mínimo.
      if (!/id="pzPcChipRow"/.test(html)) { el._adj = (el._adj || '') + html; return; }
      const row = fakeEl('pzPcChipRow');
      row.className = 'pz-pc-chiprow';
      row._html = html;
      for (const m of html.matchAll(/data-pz-pc-chip="([^"]+)"([^>]*)>/g)) {
        const b = fakeEl('');
        b.dataset.pzPcChip = m[1];
        b.disabled = /disabled/.test(m[2]);
        b.onclick = null;
        row.appendChild(b);
      }
      if (pos === 'afterend' && el.parentNode) el.parentNode.insertBefore(row, el.nextSibling);
      else if (pos === 'beforebegin' && el.parentNode) el.parentNode.insertBefore(row, el);
      else el.appendChild(row);
    },
    insertAdjacentElement(pos, node) {
      if (pos === 'beforebegin' && el.parentNode) el.parentNode.insertBefore(node, el);
      else el.appendChild(node);
      return node;
    },
    querySelector(sel) {
      const all = el.querySelectorAll(sel);
      return all.length ? all[0] : null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        for (const c of n.children) { if (matchEl(c, sel)) out.push(c); walk(c); }
      };
      walk(el);
      return out;
    },
    closest(sel) {
      let n = el;
      while (n) { if (matchEl(n, sel)) return n; n = n.parentNode; }
      return null;
    },
  };
  Object.defineProperty(el, 'nextSibling', {
    get() {
      if (!el.parentNode) return null;
      const ch = el.parentNode.children;
      const i = ch.indexOf(el);
      return ch[i + 1] || null;
    },
    configurable: true,
  });
  return el;
}
function makeCtx(en) {
  const layer = fakeEl('pzPostChat');
  const body = fakeEl('pzPostChatBody');
  const card = fakeEl('chatCard');
  const anchor = fakeEl('chatAnchor');
  const row = fakeEl('row'); row.className = 'chat-input-row';
  card.appendChild(anchor);
  card.appendChild(row);
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
    __pzPcEn: en,
  };
  ctx.pzPostChatIsEn = () => ctx.__pzPcEn;
  vm.createContext(ctx);
  vm.runInContext(block + '\nthis.__pzPc = { pzPcHeroHTML, pzPcRenderHero, pzPcClear, pzPcStatusChip, pzPcStripHTML, pzPcChipRowHTML, pzPcChipRowClick };', ctx);
  // La delegación llama a pzPcChipAction: se stubbea tras cargar el bloque.
  ctx.pzPcChipAction = (kind) => { calls.chip.push(kind); };
  return { ctx, calls, layer, body, card, byId };
}
// ES: tira compacta + burbuja + fila de 4 chips, delegación funcional
{
  const { ctx, calls, card, byId } = makeCtx(false);
  ctx.pzPcRenderHero({ id: 7, image_path: '/media/foto.jpg', caption: 'Hola', scheduled_at: '2026-11-19T19:00:00Z', status: 'scheduled', redo_left: 2 });
  const hero = byId.pzPcHero;
  t(!!hero, 'VM ES: se crea #pzPcHero dentro de la capa');
  t(hero.innerHTML.includes('@1080.webp'), 'VM ES: tira usa la imagen grande (mv 1080), no la miniatura');
  t(hero.innerHTML.includes('pz-pc-strip'), 'VM ES: tira compacta presente');
  t(hero.innerHTML.includes('Posteo de hoy'), 'VM ES: tira dice Posteo de hoy');
  t(hero.innerHTML.includes('Jue 19/11'), 'VM ES: tira trae día/hora del posteo');
  t(hero.innerHTML.includes('Pendiente'), 'VM ES: tira trae estado Pendiente');
  t(hero.innerHTML.includes('¿Qué le cambio a este posteo?'), 'VM ES: pregunta como primera burbuja');
  t(hero.innerHTML.includes('WhatsApp'), 'VM ES: bajada de la pregunta');
  t(hero.innerHTML.includes('chat-msg ai'), 'VM ES: la pregunta es burbuja AI (avatar por CSS)');
  t(!hero.innerHTML.includes('pz-pc-grid') && !hero.innerHTML.includes('pz-pc-card') && !hero.innerHTML.includes('pz-pc-hero-imgwrap'),
    'VM ES: sin grilla, sin tarjetas, sin foto gigante');
  const rowEl = card.querySelector('#pzPcChipRow');
  t(!!rowEl, 'VM ES: fila de chips insertada en la tarjeta');
  const btns = rowEl ? rowEl.querySelectorAll('[data-pz-pc-chip]') : [];
  t(btns.length === 4, 'VM ES: 4 chips clicables');
  t(rowEl && rowEl._html.includes('Cambiar la foto') && rowEl._html.includes('Cambiar el texto')
    && rowEl._html.includes('Cambiar día y hora') && rowEl._html.includes('Rehacer'), 'VM ES: los 4 atajos presentes con sus textos');
  t(!rowEl._html.includes('disabled'), 'VM ES: rehacer habilitado con 2 rehaces');
  t(btns.every((b) => !b.onclick), 'VM ES: ningún chip cablea por botón (la delegación vive en la capa)');
  ctx.pzPcChipRowClick({ target: btns[0], stopPropagation() {} });
  t(calls.chip.join(',') === 'photo', 'VM ES: tocar el chip foto dispara pzPcChipAction(photo) por delegación');
  ctx.pzPcChipRowClick({ target: btns[3], stopPropagation() {} });
  t(calls.chip.join(',') === 'photo,redo', 'VM ES: tocar el chip Rehacer dispara pzPcChipAction(redo)');
  const other = fakeEl('x');
  ctx.pzPcChipRowClick({ target: other, stopPropagation() {} });
  t(calls.chip.join(',') === 'photo,redo', 'VM ES: tocar fuera de un chip no dispara nada');
}
// EN: espejo
{
  const { ctx, byId, card } = makeCtx(true);
  ctx.pzPcRenderHero({ id: 8, image_path: '/media/foto.jpg', scheduled_at: '2026-11-19T19:00:00Z', status: 'scheduled', redo_left: 1 });
  const h = byId.pzPcHero.innerHTML;
  t(h.includes('What do I change on this post?'), 'VM EN: pregunta en inglés');
  t(h.includes('Pending'), 'VM EN: estado Pending');
  t(h.includes("Today's post"), 'VM EN: tira dice Today\'s post');
  const r = card.querySelector('#pzPcChipRow');
  t(r && r._html.includes('Change the photo') && r._html.includes('Change the text') && r._html.includes('Change the day/time') && r._html.includes('Redo'), 'VM EN: 4 atajos en inglés');
}
// Sin foto: placeholder, sin img rota; rehace 0: chip deshabilitado; re-render sin duplicar la fila
{
  const { ctx, byId, card } = makeCtx(false);
  ctx.pzPcRenderHero({ id: 9, status: 'draft', redo_left: 0 });
  const h = byId.pzPcHero.innerHTML;
  t(!h.includes('<img'), 'VM sin foto: sin <img> roto (placeholder)');
  t(h.includes('pz-pc-strip-ph'), 'VM sin foto: placeholder de la tira');
  t(h.includes('Borrador'), 'VM sin foto: estado Borrador');
  const r1 = card.querySelector('#pzPcChipRow');
  t(r1 && /data-pz-pc-chip="redo"[^>]*disabled/.test(r1._html), 'VM rehace 0: chip Rehacer deshabilitado');
  ctx.pzPcRenderHero({ id: 9, image_path: '/media/foto.jpg', status: 'scheduled', redo_left: 2 });
  t(card.querySelectorAll('#pzPcChipRow').length === 1, 'VM re-render: sigue habiendo UNA sola fila de chips (la vieja se quita)');
  const r2 = card.querySelector('#pzPcChipRow');
  t(r2 && !/data-pz-pc-chip="redo"[^>]*disabled/.test(r2._html), 'VM re-render: Rehacer se rehabilita con 2 rehaces');
}
// Clear: vacía el hero y quita la fila
{
  const { ctx, byId, card } = makeCtx(false);
  ctx.pzPcRenderHero({ id: 7, image_path: '/media/foto.jpg', status: 'scheduled' });
  t(byId.pzPcHero.innerHTML.length > 0, 'VM clear: hero con contenido antes de limpiar');
  t(!!card.querySelector('#pzPcChipRow'), 'VM clear: fila presente antes de limpiar');
  ctx.pzPcClear();
  t(byId.pzPcHero.innerHTML === '', 'VM clear: hero vacío tras cerrar');
  t(!card.querySelector('#pzPcChipRow'), 'VM clear: fila quitada tras cerrar');
}

console.log('pedir-cambio-lindo: ' + ok + ' ok, ' + bad + ' mal');
process.exit(bad ? 1 : 0);
