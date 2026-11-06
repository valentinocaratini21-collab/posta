// test-lotechatideassacar.js — SACAR «IDEAS» DEL CHAT (decisión Valentino 3/11)
// + CICLO DE LA PÍLDORA (LOTE CHAT-POSTEO-REDISENO 6/11, mock aprobado).
// Captura del chat de Posty 3/11: arriba del campo, dos píldoras («Subir
// fotos o video» e «Ideas» con contador). Valentino: «No quiero que
// aparezca mas». Fix: la píldora «Ideas» se ELIMINA por completo del
// render de la barra compartida (chatCardHTML, solo cuando schedMode):
// botón, ícono, texto y contador. NO se oculta con CSS: se saca el
// render, sus dos cableados (toggle en Semana y salto a Semana desde
// el chat full) y sus reglas CSS (.ideas-chip/.ideas-badge).
// ALCANCE DELIBERADO: el panel de ideas de Semana (hs-ideas, enhanceIdeas,
// Hacelo/Ahora no, competidores) NO se toca: es otra superficie y
// Valentino no pidió sacarlo. Consecuencia honesta: el panel queda sin
// botón que lo abra (IDEAS_PANEL_OPEN ya no puede pasar a true desde
// la UI); su código sigue, sin llamadores visibles, y el slot sigue
// pintándose cerrado. Si Valentino quiere sacar también el panel, es
// otro lote. «Subir fotos o video», campo, micrófono e historial:
// intactos. Node puro, lee el árbol + VM con DOM falso para el ciclo.
// Uso: node test-lotechatideassacar.js
// Pines de versión: re-base v712 (HEAD 3906a2ba; /api/version 20261105-v712
// en ambos dominios; app.js 051782fa, styles 9671bbea) + lote, BUILD v713.
// El preparador actualizó estos pines al re-basar (eran v703).
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

// ---------- Versiones + censo (base v712 + lote, BUILD v713) ----------
t(srv.includes("const BUILD_ID = '20261105-v713'"), 'BUILD v713 en server.js');
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

// ---------- La píldora Ideas NO se renderiza ----------
const card = sliceFn(app, 'function chatCardHTML(', '\n}\n');
t(card.length > 1000, 'chatCardHTML presente para auditar');
t(!card.includes('id="ideasChip"'), 'SACAR-IDEAS: chatCard sin id ideasChip');
t(!card.includes('id="ideasBadge"'), 'SACAR-IDEAS: chatCard sin id ideasBadge');
t(!card.includes('ideas-chip'), 'SACAR-IDEAS: chatCard sin clase ideas-chip');
t(!card.includes('ideas-badge'), 'SACAR-IDEAS: chatCard sin clase ideas-badge');
t(!card.includes('${ideasChip}'), 'SACAR-IDEAS: sin interpolación de la píldora');
t(!app.includes("$('#ideasChip')"), 'SACAR-IDEAS: sin cableados a #ideasChip en app.js');
t(!app.includes('ideasChipBtn'), 'SACAR-IDEAS: sin variable ideasChipBtn');
t(!css.includes('.ideas-chip'), 'SACAR-IDEAS: styles sin .ideas-chip');
t(!css.includes('.ideas-badge'), 'SACAR-IDEAS: styles sin .ideas-badge');
// El único rastro permitido: los getElementById guardados de
// paintIdeasChrome (sistema del panel, que se conserva) — nunca un render.
t(app.includes("document.getElementById('ideasChip')"), 'panel intacto: paintIdeasChrome conserva su lookup guardado');

// ---------- «Subir fotos o video» y el resto del chat, intactos ----------
t(card.includes('id="agUploadBtn"'), 'intacto: botón Subir fotos o video');
t(card.includes('Subir fotos o video'), 'intacto: texto Subir fotos o video');
t(card.includes('id="albumFile"'), 'intacto: input de álbum');
t(card.includes('id="chatInput"'), 'intacto: campo de entrada');
t(card.includes('id="chatBox"'), 'intacto: caja de mensajes');
t(card.includes('id="chatMicSend"'), 'intacto: micrófono');
t(card.includes('sched-up-row') || card.includes('sched-chips-row'), 'intacto: la fila de subida sigue existiendo');

// ---------- El panel de Semana NO se tocó (otra superficie) ----------
t(app.includes('function enhanceIdeas'), 'panel intacto: enhanceIdeas presente');
t(app.includes('function wireIdeasBlock'), 'panel intacto: wireIdeasBlock presente');
t(app.includes('function paintIdeasChrome'), 'panel intacto: paintIdeasChrome presente');
t(app.includes('id="hs-ideas"'), 'panel intacto: slot hs-ideas en Semana');
t(app.includes('/api/ideas'), 'panel intacto: /api/ideas sigue cableado');
t(css.includes('#hs-ideas.ideas-closed'), 'panel intacto: CSS de slot cerrado');

// ---------- VM con DOM falso: la píldora sale del DOM al abrir y vuelve al cerrar ----------
function matchOne(el, sel) {
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
function matchEl(el, sel) {
  // Soporta listas separadas por coma ('.sched-up-row, .sched-chips-row').
  return String(sel).split(',').some((part) => matchOne(el, part.trim()));
}
function fakeEl(id) {
  const el = {
    id: id || '', className: '', hidden: false, style: {}, dataset: {}, parentNode: null,
    children: [], innerHTML: '', onclick: null, disabled: false, value: '', placeholder: '',
    _removed: false, _html: '', isConnected: false,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    addEventListener() {},
    blur() {},
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i !== -1) el.children.splice(i, 1); c.parentNode = null; return c; },
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = el; const i = el.children.indexOf(ref); if (i === -1) el.children.push(c); else el.children.splice(i, 0, c); return c; },
    remove() { el._removed = true; if (el.parentNode) el.parentNode.removeChild(el); el.parentNode = null; },
    insertAdjacentHTML(pos, html) {
      if (/id="pzPcChipRow"/.test(html)) {
        const row = fakeEl('pzPcChipRow');
        row.className = 'pz-pc-chiprow';
        row._html = html;
        for (const m of html.matchAll(/data-pz-pc-chip="([^"]+)"([^>]*)>/g)) {
          const b = fakeEl('');
          b.dataset.pzPcChip = m[1];
          b.disabled = /disabled/.test(m[2]);
          row.appendChild(b);
        }
        if (pos === 'afterend' && el.parentNode) el.parentNode.insertBefore(row, el.nextSibling);
        else if (pos === 'beforebegin' && el.parentNode) el.parentNode.insertBefore(row, el);
        else el.appendChild(row);
        return;
      }
      // Nota de confianza y cualquier otro HTML mínimo: un elemento con su clase/id.
      const node = fakeEl((html.match(/id="([^"]*)"/) || [])[1] || '');
      node.className = (html.match(/class="([^"]*)"/) || [])[1] || '';
      node._html = html;
      if (pos === 'afterend' && el.parentNode) el.parentNode.insertBefore(node, el.nextSibling);
      else if (pos === 'beforebegin' && el.parentNode) el.parentNode.insertBefore(node, el);
      else el.appendChild(node);
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
function makeCycleCtx() {
  const home = fakeEl('home'); home.isConnected = true;
  const footer = fakeEl('footer');
  const card = fakeEl('chatCard');
  const upRow = fakeEl('upRow'); upRow.className = 'sched-up-row';
  const upBtn = fakeEl('agUploadBtn');
  const albumFile = fakeEl('albumFile');
  const albumMsg = fakeEl('albumMsg');
  upRow.appendChild(upBtn);
  upRow.appendChild(albumFile);
  upRow.appendChild(albumMsg);
  const anchor = fakeEl('chatAnchor');
  const chatBox = fakeEl('chatBox');
  const inputRow = fakeEl('inputRow'); inputRow.className = 'chat-input-row';
  const chatInput = fakeEl('chatInput');
  inputRow.appendChild(chatInput);
  card.appendChild(upRow);
  card.appendChild(anchor);
  card.appendChild(chatBox);
  card.appendChild(inputRow);
  home.appendChild(card);
  home.appendChild(footer);
  const bodyEl = fakeEl('body');
  const byId = { chatCard: card, chatInput, chatBox };
  const doc = {
    body: bodyEl,
    activeElement: null,
    getElementById: (id) => byId[id] || null,
    querySelector: () => null,
    addEventListener() {},
    createElement: (tag) => {
      const e = fakeEl('');
      Object.defineProperty(e, 'innerHTML', {
        get() { return e._html || ''; },
        set(v) { e._html = v; if (e.id === 'pzPcHero') byId.pzPcHero = e; },
        configurable: true,
      });
      return e;
    },
  };
  // document.body.insertAdjacentHTML('beforeend', pzPostChatLayerHTML()):
  // crea la capa con su cuerpo y su botón de volver, registrados en byId.
  bodyEl.insertAdjacentHTML = (pos, html) => {
    if (/id="pzPostChat"/.test(html)) {
      const layer = fakeEl('pzPostChat');
      layer.hidden = true;
      const lbody = fakeEl('pzPostChatBody');
      const back = fakeEl('pzPostChatBack');
      layer.appendChild(lbody);
      bodyEl.appendChild(layer);
      byId.pzPostChat = layer;
      byId.pzPostChatBody = lbody;
      byId.pzPostChatBack = back;
    }
  };
  const ctx = {
    console,
    document: doc,
    window: { innerHeight: 844, addEventListener() {}, scrollTo() {} },
    location: { hash: '' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (src, w) => (typeof src === 'string' && src.indexOf('/media/') === 0 ? src.replace(/\.(jpe?g|png)$/i, '@' + w + '.webp') : src),
    hfWhenChip: (p) => (p && p.scheduled_at ? 'Jue 19/11 · 19:00' : ''),
    hfRedoLeft: (p) => {
      if (!p || p.status === 'published' || p.media_type === 'video') return null;
      const v = (p.redo_left === null || p.redo_left === undefined) ? 3 : Number(p.redo_left);
      return Math.max(0, Math.min(3, v));
    },
    hfSetAnchor() {},
    hfPaintAnchor() {},
    pzChatPinArm() {},
    pzReducedMotion: () => false,
    render() {},
  };
  vm.createContext(ctx);
  const cycleSlice = sliceFn(app, 'var PZ_POSTCHAT_ORIGIN', '// (Corrección grilla 2026-10-25)');
  t(cycleSlice.length > 5000, 'VM ciclo: slice open/close presente');
  vm.runInContext(cycleSlice, ctx);
  return { ctx, home, card, upRow, byId };
}
{
  const { ctx, home, card, byId } = makeCycleCtx();
  const post = { id: 7, image_path: '/media/foto.jpg', scheduled_at: '2026-11-19T19:00:00Z', status: 'scheduled', redo_left: 2 };
  const countBtn = (root) => root.querySelectorAll('#agUploadBtn').length;
  const countRow = (root) => root.querySelectorAll('.sched-up-row').length;
  t(countBtn(card) === 1 && countRow(card) === 1, 'VM ciclo: antes de abrir, la píldora está en Inicio (1 botón, 1 fila)');
  t(card.children[0].className === 'sched-up-row', 'VM ciclo: la píldora es el primer hijo de la tarjeta en Inicio');
  for (let cycle = 1; cycle <= 3; cycle++) {
    t(ctx.pzPostChatOpen(post) === true, 'VM ciclo ' + cycle + ': pzPostChatOpen devuelve true');
    t(byId.chatInput.placeholder === 'qué le cambio a este posteo?', 'VM ciclo ' + cycle + ': al abrir, el placeholder de edición queda puesto');
    t(countBtn(card) === 0, 'VM ciclo ' + cycle + ': al abrir, #agUploadBtn AUSENTE del DOM de la tarjeta');
    t(countBtn(byId.pzPostChat) === 0, 'VM ciclo ' + cycle + ': al abrir, la píldora tampoco está dentro de la capa');
    t(countRow(card) === 0, 'VM ciclo ' + cycle + ': al abrir, la fila .sched-up-row salió del DOM');
    t(!!card.querySelector('#chatInput') && !!card.querySelector('#chatBox'), 'VM ciclo ' + cycle + ': al abrir, campo e historial siguen en la tarjeta');
    t(!!card.querySelector('#pzPcChipRow'), 'VM ciclo ' + cycle + ': al abrir, la fila de chips está');
    ctx.pzPostChatClose();
    t(countBtn(card) === 1, 'VM ciclo ' + cycle + ': al cerrar, #agUploadBtn vuelve (1 botón, sin duplicar)');
    t(countRow(card) === 1, 'VM ciclo ' + cycle + ': al cerrar, la fila .sched-up-row vuelve (1 fila)');
    t(card.children[0].className === 'sched-up-row', 'VM ciclo ' + cycle + ': al cerrar, la píldora vuelve a su lugar original (primer hijo)');
    t(card.parentNode === home, 'VM ciclo ' + cycle + ': al cerrar, la tarjeta vuelve a Inicio');
    t(!card.querySelector('#pzPcChipRow'), 'VM ciclo ' + cycle + ': al cerrar, la fila de chips se quita');
  }
}

console.log(`${ok} ok / ${bad} fallas`);
process.exit(bad ? 1 : 0);
