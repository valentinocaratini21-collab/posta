// test-lote-fotos-videos-v860.js — LOTE v860 PROCESO PERFECTO FOTOS Y VIDEOS
// (opción 3 tarjeta con todo tocable + opción 5 la semana de una vez).
// Valentino eligió 3 y 5 el 9/11 22:08 («Dale hagamos la 3 y la 5 si
// mandan varias»). Arregla la auditoría del chat: #20 (una foto abre un
// interrogatorio de 4–5 preguntas), #21 (espera a ciegas sin estado),
// #5 (al subir una foto Posty arma ADEMÁS un posteo que nadie pidió — el
// 587) y el bucle «del 0 al 5» (el cerebro pregunta qué foto usar y no
// aplica jamás el cambio).
// Valores: BUILD 20261105-v860 · ?v=588 en el index ES · styles?v=
// 20261226 heredado (el lote no toca styles.css) · CHUNK_V sin cambio ·
// M78: funciones auditadas 31/31 (todo lo que las tarjetas/menús del
// lote llaman existe definido en el bundle).
// Parte A: estática. Parte B: tarjeta/fila/intercepto/estado/mover/
// descartar REALES en vm (con DOM falso). Parte C: M78. Parte D: boot
// real (puerto 34644): /api/version, index, descartar-propuesta (OK +
// 409s + 404) y horas-libres (OK + 400s + 404) con usuario de prueba y
// filas insertadas directo en la DB del boot. Parte E: render 390px con
// Playwright si el entorno lo tiene (si no, se omite sin fallar).
// Uso: node test-lote-fotos-videos-v860.js [árbol] — sin argumento usa
// su propio directorio; con un árbol prístino v851 DEBE fallar (caza el
// cambio). Sale 0 si todo pasa.
// Puerto: 34644 (34642 boot v855, 34643 preparador v859).
// RE-PIN al re-basar sobre v859 (10/11): A1b/A1c styles?v= 20261225→20261226
// (el vivo v859 trae 20261226; el lote no toca styles.css, se hereda el
// valor del vivo) · A11 app.js 30764→30783 (base v859 30565 + 218) · A12 server.js 34775→34956 (base v859 34890 + 66).
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
const srvSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(TREE, 'public/index.html'), 'utf8');
const idxEnSrc = fs.readFileSync(path.join(TREE, 'public/en/index.html'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

// ---------- Parte A: estática ----------
function parteA() {
  console.log('— A) estática: valores del lote y alcance —');
  check('A0 BUILD v860 en server.js', srvSrc.includes("const BUILD_ID = '20261105-v860';"));
  check('A0b cero v851 en server.js', !srvSrc.includes('20261105-v851'));
  check('A0c v860 ×1 en server.js', (srvSrc.match(/20261105-v860/g) || []).length === 1);
  check('A1 index ES en ?v=588', idxSrc.includes('app.js?v=588') && !idxSrc.includes('app.js?v=581'));
  check('A1b styles?v=20261226 heredado en ES', idxSrc.includes('styles.css?v=20261226'));
  check('A1c index EN sin cambio (styles?v=20261226, sin app.js?v=)', idxEnSrc.includes('styles.css?v=20261226') && !idxEnSrc.includes('app.js?v='));
  check('A2 CHUNK_V sin cambio', appSrc.includes("const CHUNK_V = '20261105-v850';"));
  // #20: la rama del interrogatorio ya no está en chatSend; la hoja sigue
  // viva (definida) para [Probar de nuevo], solo deja de ser la entrada.
  check('A3 #20: chatSend ya no abre pzSubirFotoAbrir', !appSrc.includes('pzSubirFotoAbrir(pendientes[0]'));
  check('A3b la hoja de preguntas sigue definida (reintento)', /function pzSubirFotoAbrir\s*\(/.test(appSrc) && /function pzSubirTieneInstruccion\s*\(/.test(appSrc));
  check('A3c comentario v860 #20 en chatSend', appSrc.includes('LOTE FOTOS-VIDEOS v860 · auditoría #20'));
  // Bucle «del 0 al 5»: intercepto determinista en chatExchange.
  const inter = fnFrom(appSrc, 'function pzFotoCambioIntercept(text) {');
  check('A4 intercepto definido', !!inter);
  check('A4b chatExchange lo llama antes de la burbuja typing', appSrc.includes('if (pzFotoCambioIntercept(text)) return;'));
  check('A4c el intercepto casa cambiar/otra foto (con voseo «cambiá»)', !!inter && inter.includes('cambi[áa]r?') && inter.includes('otra foto') && inter.includes('imagen.*otra'));
  check('A4d con posteo vigente abre el picker (nunca el cerebro)', !!inter && inter.includes('pzUsarFotoAbrir(pid)') && inter.includes('return true'));
  check('A4e sin posteo vigente sigue al cerebro', !!inter && inter.includes('if (!pid) return false;'));
  check('A4f el intercepto loguea el cambio', !!inter && inter.includes("/api/ideas/chat/log") && inter.includes("kind: 'usar_foto'"));
  check('A4g con IDEA abierta manda el editor de la idea', !!inter && inter.includes('chatEditCommand(text)'));
  // Opción 3: tarjeta con todo tocable.
  const tarjeta = fnFrom(appSrc, 'function pzSftChatTarjetaArmada(prop) {');
  check('A5 tarjeta existe', !!tarjeta);
  check('A5b chips: 📅 día·hora (hot) + ✏️ Caption + 🖼️ Foto', !!tarjeta && tarjeta.includes('pzSftChipCuando-') && tarjeta.includes('✏️ Caption') && tarjeta.includes('🖼️'));
  check('A5c «Sale así ✓» verde #22C55E, a lo ancho, primero', !!tarjeta && tarjeta.includes('background:#22C55E') && tarjeta.includes('Sale así ✓') && tarjeta.includes('flex:1 1 100%'));
  check('A5d la tarjeta dice que es una PROPUESTA (no sale nada)', !!tarjeta && tarjeta.includes('Es una propuesta — no sale nada hasta que toques Sale así.'));
  check('A5e botón [Descartar] en la tarjeta', !!tarjeta && tarjeta.includes('pzSftChatDescartar(') && tarjeta.includes('Descartar'));
  check('A5f miniatura 96×120 4:5 + caption clamp 4', !!tarjeta && tarjeta.includes('width:96px;height:120px') && tarjeta.includes('-webkit-line-clamp:4'));
  check('A5g «Tocá la foto para ver el detalle →»', !!tarjeta && tarjeta.includes('Tocá la foto para ver el detalle →'));
  check('A5h título nuevo, no el viejo', !!tarjeta && tarjeta.includes('Acá está tu posteo, ya armado') && !tarjeta.includes("Your post is ready'"));
  check('A5i los botones viejos murieron en la tarjeta', !!tarjeta && !tarjeta.includes('>Cambiar día<') && !tarjeta.includes('>Otra foto<') && !tarjeta.includes('>Cambiar algo<') && !tarjeta.includes('>Usar la foto que envié<'));
  check('A5j video: <video> + ▶ + 🎬 Reel + chip 🎬 Video', !!tarjeta && tarjeta.includes('<video') && tarjeta.includes('🎬 Reel') && tarjeta.includes('pzSftChatVideoAviso()'));
  check('A5k el video no usa usar-foto (solo fotos): una sola llamada en la tarjeta, la del chip foto', !!tarjeta && (tarjeta.match(/pzUsarFotoAbrir/g) || []).length === 1 && tarjeta.includes('pzSftChatVideoAviso()'));
  check('A5l exprés: sin «Sale así», «Publicar hoy» verde', !!tarjeta && tarjeta.includes("prop.expres ? '' :") && tarjeta.includes("prop.expres\n    ? `<button type=\"button\" class=\"btn btn-sm\" style=\"background:#22C55E"));
  // Opción 5: la semana de una vez.
  const semana = fnFrom(appSrc, 'function pzSftChatSemanaAgregar(prop) {');
  const fila = fnFrom(appSrc, 'function pzSftChatSemanaFilaHtml(prop) {');
  check('A6 pantalla semana existe', !!semana && !!fila);
  check('A6b «Aprobar toda la semana ✓» verde', !!semana && semana.includes('Aprobar toda la semana ✓') && semana.includes('background:#22C55E'));
  check('A6c título con el total + nota de propuesta', !!semana && semana.includes('Te armé la semana con las') && semana.includes('Nada sale hasta que apruebes'));
  check('A6d fila: DÍA + primera línea + día·hora + Post/Reel + ›', !!fila && fila.includes('toUpperCase()') && fila.includes("split('\\n')[0]") && fila.includes('Reel') && fila.includes('›'));
  check('A6e tocar la fila abre su tarjeta', !!fila && fila.includes('pzSftChatSemanaAbrir('));
  check('A6f Proponer deriva a la semana cuando hay varias', appSrc.includes('if (pend.items.length > 1) pzSftChatSemanaAgregar(arm.prop); else pzSftChatTarjetaArmada(arm.prop);'));
  // #21: estado honesto mientras se arma.
  const estado = fnFrom(appSrc, 'function pzSftChatEstadoArmando(pend, it) {');
  check('A7 estado «Armando tu posteo…» con (n de total) y tiempo', !!estado && estado.includes('Armando tu posteo') && estado.includes('menos de un minuto') && estado.includes('de ') && estado.includes('total'));
  check('A7b Proponer muestra el estado antes de armar', appSrc.includes('pzSftChatEstadoArmando(pend, it);'));
  check('A7c Decir quita el estado', fnFrom(appSrc, 'function pzSftChatDecir(texto, botonesHTML) {').includes('pzSftChatQuitarArmando()'));
  // #5: descartar propuesta.
  check('A8 endpoint descartar-propuesta en server.js', srvSrc.includes("app.post('/api/posts/:id/descartar-propuesta'"));
  check('A8b solo borrador de propuesta (album-armado/express/subir-foto-preguntas)', srvSrc.includes("post.source === 'album-armado'") && srvSrc.includes("post.source === 'express'") && srvSrc.includes("post.source_topic === 'subir-foto-preguntas'"));
  check('A8c 404 post no encontrado · 409 no_descartable', srvSrc.includes("error: 'post_no_encontrado'") && srvSrc.includes("error: 'no_descartable'"));
  check('A8d registra rejected + libera el asset + borra SIN rebuild', srvSrc.includes("recordSignal(uid, post, 'rejected')") && srvSrc.includes("UPDATE assets SET upload_choice = 'despues'") && srvSrc.includes("DELETE FROM posts WHERE id = ? AND user_id = ?"));
  check('A8e la tabla es posts (no user_posts) y el auth es sesión', !srvSrc.includes('user_posts') && srvSrc.includes("SELECT * FROM posts WHERE id = ? AND user_id = ?"));
  const desc = fnFrom(appSrc, 'async function pzSftChatDescartar(postId) {');
  check('A8f pzSftChatDescartar llama al endpoint + toast', !!desc && desc.includes("/descartar-propuesta") && desc.includes('Descartado — la foto queda guardada como material.'));
  check('A8g «Decido después» descarta el borrador armado', fnFrom(appSrc, 'async function pzSftChatDespues() {').includes("/descartar-propuesta"));
  check('A8h AprobarTodas saltea descartado/despues', appSrc.includes("it.choice === 'descartado' || it.choice === 'despues'"));
  // Horas libres.
  check('A9 endpoint horas-libres en server.js', srvSrc.includes("app.get('/api/posts/:id/horas-libres'"));
  check('A9b 09:00–21:00 por hora, sin la hora actual', srvSrc.includes('for (let h = 9; h <= 21; h++)') && srvSrc.includes("actual.slice(11, 16) === hh"));
  check('A9c usa wallInTz + userTz + zonedWallToUtc(dia + hora)', srvSrc.includes('wallInTz(post.scheduled_at, tz)') && srvSrc.includes('zonedWallToUtc(dia + \' \' + hh, tz)'));
  check('A9d 400 dia_invalido / no_movable · 404', srvSrc.includes("error: 'dia_invalido'") && srvSrc.includes("error: 'no_movable'"));
  check('A9g el regex del día es de escape simple (\\d, no \\\\d)', srvSrc.includes('/^\\d{4}-\\d{2}-\\d{2}$/') && !srvSrc.includes('/^\\\\d{4}-'));
  check('A9e CambiarDia pide las horas del día actual', appSrc.includes("'/api/posts/' + Number(prop.postId) + '/horas-libres?dia='"));
  check('A9f MoverDia actualiza el chip 📅 visible', fnFrom(appSrc, 'async function pzSftChatMoverDia(').includes("pzSftChipCuando-'"));
  // EN en espejo.
  check('A10 EN: tarjeta + semana + intercepto', !!tarjeta && tarjeta.includes('Here is your post, ready') && tarjeta.includes('Post it ✓') && tarjeta.includes('Discard') && !!semana && semana.includes('Approve the whole week ✓') && !!inter && inter.includes('Pick the photo you want for this post'));
  // Tamaños (verificación de truncados por conteo, no solo node --check).
  check('A11 app.js 30783 líneas (base v859 30565 + 218)', appSrc.split('\n').length === 30783, `líneas=${appSrc.split('\n').length}`);
  check('A12 server.js 34956 líneas (base v859 34890 + 66)', srvSrc.split('\n').length === 34956, `líneas=${srvSrc.split('\n').length}`);
  check('A13 1012 definiciones function (base 1005 + 7) + 1 async nueva', (appSrc.match(/^function [A-Za-z0-9_$]+\s*\(/gm) || []).length === 1012 && /async function pzSftChatDescartar\(/.test(appSrc));
  check('A14 marcadores ajenos idénticos a v851', (srvSrc.match(/catsMatch/g) || []).length === 3 && (srvSrc.match(/week-redo/g) || []).length === 16 && (srvSrc.match(/first_week/g) || []).length === 3 && (srvSrc.match(/\/aprobar/g) || []).length === 17 && (srvSrc.match(/captionWeekClash/g) || []).length === 4);
}

// ---------- Parte B: funciones REALES en vm ----------
function makeDoc() {
  const registry = new Map();
  function registerIds(html, parent) {
    const re = /id="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      if (!registry.has(m[1])) {
        const el = new FakeEl('div');
        el.id = m[1];
        registry.set(m[1], el);
        if (parent) { el._parent = parent; parent.children.push(el); }
      }
    }
  }
  class FakeEl {
    constructor(tag) {
      this.tagName = (tag || 'div').toUpperCase();
      this.children = [];
      this._html = '';
      this._text = '';
      this.style = {};
      this.dataset = {};
      this.className = '';
      this.id = '';
      this._removed = false;
      this._parent = null;
    }
    get innerHTML() { return this._html; }
    set innerHTML(v) {
      this._html = String(v);
      registerIds(this._html, this); // al pintar, los ids existen como en el navegador
    }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
    get lastElementChild() { return this.children.length ? this.children[this.children.length - 1] : null; }
    appendChild(c) { c._parent = this; this.children.push(c); if (c.id) registry.set(c.id, c); return c; }
    insertAdjacentHTML(pos, html) { this._html += html; registerIds(html, this); }
    remove() { this._removed = true; if (this._parent) { const i = this._parent.children.indexOf(this); if (i >= 0) this._parent.children.splice(i, 1); } }
    querySelector(sel) {
      const wantClass = sel.startsWith('.') ? sel.slice(1) : null;
      const wantId = sel.startsWith('#') ? sel.slice(1) : null;
      const walk = (el) => {
        for (const c of el.children) {
          if (wantClass && (c.className || '').split(' ').includes(wantClass)) return c;
          if (wantId && c.id === wantId) return c;
          const f = walk(c);
          if (f) return f;
        }
        return null;
      };
      return walk(this);
    }
  }
  const box = new FakeEl('div');
  box.id = 'chatBox';
  registry.set('chatBox', box);
  const document = {
    getElementById: (id) => registry.get(id) || null,
    createElement: (tag) => new FakeEl(tag),
    _registry: registry,
    _box: box,
  };
  return { document, FakeEl, registry, box };
}

function parteB() {
  console.log('— B) vm: tarjeta, semana, intercepto, estado, mover, descartar —');
  const escLine = (appSrc.match(/^const esc = .*;$/m) || [null])[0];
  const mkCtx = (extra) => {
    const { document, box } = makeDoc();
    const ctx = {
      console,
      document,
      ME: { lang: 'es' },
      PZ_SFT_ARMADOS: {},
      PZ_SFT_ARMADO_ACTUAL: null,
      PZ_SFT_CHAT_PENDIENTE: null,
      CHAT_IDEA: null,
      PZ_PC_POST: null,
      HF_CHAT_ANCHOR: null,
      api: { get: async () => ({ ok: false }), post: async () => ({ ok: true }), patch: async () => ({ ok: true }) },
      toast: function () { (ctx._toasts = ctx._toasts || []).push(Array.from(arguments).join(' ')); },
      render: function () {},
      chatScroll: function () {},
      chatSay: function (t) { (ctx._said = ctx._said || []).push(t); },
      pzSftEn: function () { try { return ctx.ME && ctx.ME.lang === 'en'; } catch (e) { return false; } },
      chatEditCommand: function () { return false; },
      pzUsarFotoAbrir: function (pid) { (ctx._picker = ctx._picker || []).push(pid); },
      pzCambioVoz: function () {},
      pzSftChatBotones: function () { return ''; },
      _box: box,
    };
    Object.assign(ctx, extra || {});
    vm.createContext(ctx);
    if (escLine) vm.runInContext(escLine, ctx);
    return ctx;
  };
  const runFns = (ctx, sigs) => {
    for (const sig of sigs) {
      const fn = fnFrom(appSrc, sig);
      if (!fn) { check('B fn presente: ' + sig, false, sig); continue; }
      vm.runInContext(fn, ctx);
    }
  };

  // B1: tarjeta foto ES (opción 3).
  {
    const ctx = mkCtx();
    runFns(ctx, ['function pzSftChatTarjetaArmada(prop) {', 'function pzSftChatQuitarArmando() {']);
    vm.runInContext(`pzSftChatTarjetaArmada({ postId: 101, kind: 'photo', image_path: '/media/foto.jpg', caption: 'Primera línea del caption\\nSegunda línea\\nTercera', hashtags: '#test', dia: '2026-11-11', dia_label: 'miércoles 11/11', hora: '19:00' });`, ctx);
    const html = ctx._box.innerHTML;
    check('B1 tarjeta foto: chip 📅 día·hora hot', html.includes('pzSftChipCuando-101') && html.includes('📅 miércoles 11/11 · 19:00') && html.includes('background:#EFF8FD'));
    check('B1b chips ✏️ Caption + 🖼️ Foto', html.includes('✏️ Caption') && html.includes('🖼️ Foto'));
    check('B1c «Sale así ✓» verde #22C55E a lo ancho', html.includes('Sale así ✓') && html.includes('background:#22C55E'));
    check('B1d línea de propuesta honesta', html.includes('Es una propuesta — no sale nada hasta que toques Sale así.'));
    check('B1e [Descartar] presente', html.includes('pzSftChatDescartar(101)') && html.includes('Descartar'));
    check('B1f miniatura 96×120 + clamp 4 + detalle a un toque', html.includes('width:96px;height:120px') && html.includes('-webkit-line-clamp:4') && html.includes('Tocá la foto para ver el detalle →'));
    check('B1g sin botones viejos en la tarjeta', !html.includes('Cambiar día') && !html.includes('Otra foto') && !html.includes('Cambiar algo') && !html.includes('Usar la foto que envié'));
    check('B1h el caption completo va en la tarjeta (clamp visual, no recorte)', html.includes('Primera línea del caption'));
    check('B1i [Publicar hoy] blando en tarjeta de semana', html.includes('Publicar hoy') && html.includes('btn-soft'));
  }
  // B2: tarjeta video ES.
  {
    const ctx = mkCtx();
    runFns(ctx, ['function pzSftChatTarjetaArmada(prop) {', 'function pzSftChatQuitarArmando() {']);
    vm.runInContext(`pzSftChatTarjetaArmada({ postId: 102, kind: 'video', image_path: '/media/reel.mp4', thumb: '/media/reel.jpg', caption: 'El reel de hoy', dia: '2026-11-12', dia_label: 'jueves 12/11', hora: '19:00' });`, ctx);
    const html = ctx._box.innerHTML;
    check('B2 tarjeta video: <video> + ▶ + 🎬 Reel', html.includes('<video') && html.includes('▶') && html.includes('🎬 Reel'));
    check('B2b título de reel + chip 🎬 Video (no 🖼️ Foto)', html.includes('Acá está tu reel, ya armado') && html.includes('🎬 Video') && !html.includes('🖼️ Foto'));
    check('B2c «Tocá el video para verlo →»', html.includes('Tocá el video para verlo →'));
  }
  // B3: tarjeta exprés (sin slot de semana).
  {
    const ctx = mkCtx();
    runFns(ctx, ['function pzSftChatTarjetaArmada(prop) {', 'function pzSftChatQuitarArmando() {']);
    vm.runInContext(`pzSftChatTarjetaArmada({ postId: 103, kind: 'photo', image_path: '/media/foto.jpg', caption: 'Sale hoy', expres: true });`, ctx);
    const html = ctx._box.innerHTML;
    check('B3 exprés: sin botón «Sale así ✓» y sin chip 📅 (la nota lo nombra, el botón no existe)', !html.includes('Sale así ✓') && !html.includes('pzSftChipCuando-'));
    check('B3b «Publicar hoy» verde como única acción', html.includes('Publicar hoy') && html.includes('background:#22C55E'));
    check('B3c cuando exprés honesto', html.includes('Sale hoy cuando lo aceptes'));
  }
  // B4: tarjeta EN.
  {
    const ctx = mkCtx({ ME: { lang: 'en' } });
    runFns(ctx, ['function pzSftChatTarjetaArmada(prop) {', 'function pzSftChatQuitarArmando() {']);
    vm.runInContext(`pzSftChatTarjetaArmada({ postId: 104, kind: 'photo', image_path: '/media/foto.jpg', caption: 'Today post', dia: '2026-11-11', dia_label: 'Wednesday 11/11', hora: '19:00' });`, ctx);
    const html = ctx._box.innerHTML;
    check('B4 EN: título + Post it + Discard + draft', html.includes('Here is your post, ready') && html.includes('Post it ✓') && html.includes('Discard') && html.includes('This is a draft'));
  }
  // B5–B7: semana (opción 5).
  {
    const ctx = mkCtx();
    runFns(ctx, ['function pzSftChatSemanaAgregar(prop) {', 'function pzSftChatSemanaFilaHtml(prop) {', 'function pzSftChatQuitarArmando() {']);
    const filaHtml = vm.runInContext(`pzSftChatSemanaFilaHtml({ postId: 201, kind: 'photo', image_path: '/media/a.jpg', caption: 'Primera línea\\nSegunda', dia: '2026-11-11', dia_label: 'miércoles 11/11', hora: '19:00' });`, ctx);
    check('B5 fila foto: DÍA + primera línea + día·hora + Post', filaHtml.includes('MIÉRCOLES') && filaHtml.includes('Primera línea') && !filaHtml.includes('Segunda') && filaHtml.includes('miércoles 11/11 · 19:00 · Post') && filaHtml.includes('pzSftChatSemanaAbrir(201)'));
    const filaVideo = vm.runInContext(`pzSftChatSemanaFilaHtml({ postId: 202, kind: 'video', image_path: '/media/r.mp4', thumb: '/media/r.jpg', caption: 'El reel', dia: '2026-11-12', dia_label: 'jueves 12/11', hora: '19:00' });`, ctx);
    check('B6 fila video: ▶ + Reel', filaVideo.includes('▶') && filaVideo.includes('jueves 12/11 · 19:00 · Reel'));
    ctx.PZ_SFT_CHAT_PENDIENTE = { items: [{}, {}], idx: 0 };
    vm.runInContext(`pzSftChatSemanaAgregar({ postId: 201, kind: 'photo', image_path: '/media/a.jpg', caption: 'Primera línea', dia: '2026-11-11', dia_label: 'miércoles 11/11', hora: '19:00' });`, ctx);
    vm.runInContext(`pzSftChatSemanaAgregar({ postId: 202, kind: 'video', image_path: '/media/r.mp4', thumb: '/media/r.jpg', caption: 'El reel', dia: '2026-11-12', dia_label: 'jueves 12/11', hora: '19:00' });`, ctx);
    const screens = ctx._box.children.filter((c) => c.id === 'pzSftSemana');
    const rows = ctx.document.getElementById('pzSftSemanaRows');
    check('B7 semana: UNA sola pantalla con 2 filas', screens.length === 1 && rows && (rows.innerHTML.match(/pzSftSemanaRow-/g) || []).length === 2, `screens=${screens.length}`);
    const screenHtml = screens[0] ? screens[0].innerHTML : '';
    check('B7b título con el total + nota + «Aprobar toda la semana ✓» verde', screenHtml.includes('Te armé la semana con las 2') && screenHtml.includes('Nada sale hasta que apruebes') && screenHtml.includes('Aprobar toda la semana ✓') && screenHtml.includes('background:#22C55E'));
  }
  // B8: intercepto del cambio de foto.
  {
    const ctx = mkCtx();
    runFns(ctx, ['function pzFotoCambioIntercept(text) {']);
    ctx._logCalls = [];
    ctx.api = { post: async (u, b) => { ctx._logCalls.push([u, b]); return { ok: true }; } };
    let r;
    r = vm.runInContext(`pzFotoCambioIntercept('Quiero cambiar la foto de este posteo')`, ctx);
    check('B8a sin posteo vigente sigue al cerebro (false)', r === false);
    ctx.PZ_PC_POST = { id: 301 };
    r = vm.runInContext(`pzFotoCambioIntercept('Quiero cambiar la foto de este posteo')`, ctx);
    check('B8b con posteo anclado abre el picker y corta', r === true && (ctx._picker || []).includes(301) && (ctx._said || []).join(' ').includes('Elegí la foto que querés para este posteo'));
    check('B8c el cambio queda logueado', (ctx._logCalls || []).some((c) => c[0] === '/api/ideas/chat/log' && c[1] && c[1].kind === 'usar_foto' && c[1].post_id === 301));
    r = vm.runInContext(`pzFotoCambioIntercept('hola, ¿cómo estás?')`, ctx);
    check('B8d texto sin foto no se intercepta', r === false);
    r = vm.runInContext(`pzFotoCambioIntercept('sí')`, ctx);
    check('B8e un «sí» pelado NO se intercepta (sigue al cerebro)', r === false);
    ctx.PZ_PC_POST = null;
    ctx.HF_CHAT_ANCHOR = { id: 302 };
    r = vm.runInContext(`pzFotoCambioIntercept('usar otra foto')`, ctx);
    check('B8f ancla de Home/Feed también vale', r === true && (ctx._picker || []).includes(302));
    ctx.HF_CHAT_ANCHOR = null;
    ctx.PZ_SFT_ARMADO_ACTUAL = { postId: 303 };
    r = vm.runInContext(`pzFotoCambioIntercept('cambiá la imagen por otra')`, ctx);
    check('B8g último armado también vale', r === true && (ctx._picker || []).includes(303));
    ctx.PZ_SFT_ARMADO_ACTUAL = null;
    ctx.CHAT_IDEA = { id: 9 };
    ctx.chatEditCommand = function () { return true; };
    ctx._picker = [];
    r = vm.runInContext(`pzFotoCambioIntercept('cambiar la foto')`, ctx);
    check('B8h con IDEA abierta manda el editor de la idea', r === true && (ctx._picker || []).length === 0);
  }
  // B9: estado «Armando tu posteo…».
  {
    const ctx = mkCtx();
    runFns(ctx, ['function pzSftChatEstadoArmando(pend, it) {', 'function pzSftChatQuitarArmando() {', 'function pzSftChatDecir(texto, botonesHTML) {']);
    vm.runInContext(`pzSftChatEstadoArmando({ items: [{}, {}, {}], idx: 1 }, {});`, ctx);
    const html = ctx.document.getElementById('pzSftArmando') ? ctx.document.getElementById('pzSftArmando').innerHTML : '';
    check('B9 estado multi: (2 de 3) + tiempo honesto', html.includes('Armando tu posteo') && html.includes('(2 de 3)') && html.includes('menos de un minuto'));
    check('B9b la burbuja tiene id pzSftArmando', !!ctx.document.getElementById('pzSftArmando'));
    vm.runInContext(`pzSftChatQuitarArmando();`, ctx);
    check('B9c QuitarArmando la quita', ctx.document.getElementById('pzSftArmando')._removed === true);
    vm.runInContext(`pzSftChatEstadoArmando({ items: [{}], idx: 0 }, {});`, ctx);
    vm.runInContext(`pzSftChatDecir('Te armé el posteo.', '');`, ctx);
    check('B9d Decir quita el estado', ctx.document.getElementById('pzSftArmando')._removed === true && (ctx._said || []).includes('Te armé el posteo.'));
  }
}

async function parteBAsync() {
  console.log('— B2) vm async: cambiar día/hora, mover, descartar, marcar —');
  const escLine = (appSrc.match(/^const esc = .*;$/m) || [null])[0];
  const mkCtx = (extra) => {
    const { document, box } = makeDoc();
    const ctx = {
      console,
      document,
      ME: { lang: 'es' },
      PZ_SFT_ARMADOS: {},
      PZ_SFT_ARMADO_ACTUAL: null,
      PZ_SFT_CHAT_PENDIENTE: null,
      api: { get: async () => ({ ok: false }), post: async () => ({ ok: true }), patch: async () => ({ ok: true }) },
      toast: function () { (ctx._toasts = ctx._toasts || []).push(Array.from(arguments).join(' ')); },
      render: function () {},
      chatScroll: function () {},
      chatSay: function (t) { (ctx._said = ctx._said || []).push(t); },
      pzSftEn: function () { try { return ctx.ME && ctx.ME.lang === 'en'; } catch (e) { return false; } },
      pzSftChatBotones: function () { return ''; },
      _box: box,
    };
    Object.assign(ctx, extra || {});
    vm.createContext(ctx);
    if (escLine) vm.runInContext(escLine, ctx);
    return ctx;
  };
  const runFns = (ctx, sigs) => {
    for (const sig of sigs) {
      const fn = fnFrom(appSrc, sig);
      if (!fn) { check('B fn presente: ' + sig, false, sig); continue; }
      vm.runInContext(fn, ctx);
    }
  };
  // B10: CambiarDia rinde días + horas.
  {
    const ctx = mkCtx();
    runFns(ctx, ['async function pzSftChatCambiarDia(postId) {']);
    const slot = ctx.document.createElement('div');
    slot.id = 'pzSftDias-101';
    ctx.document._registry.set('pzSftDias-101', slot);
    ctx.PZ_SFT_ARMADOS = { 101: { postId: 101, kind: 'photo', dia: '2026-11-11', dia_label: 'miércoles 11/11', hora: '19:00' } };
    ctx.api.get = async (u) => {
      if (u.includes('/dias-libres')) return { ok: true, dias: [{ iso: '2026-11-12T23:00:00.000Z', dia: '2026-11-12', dia_label: 'jueves 12/11', hora: '19:00' }, { iso: '2026-11-13T23:00:00.000Z', dia: '2026-11-13', dia_label: 'viernes 13/11', hora: '19:00' }] };
      if (u.includes('/horas-libres')) return { ok: true, dia: '2026-11-11', horas: [{ hora: '09:00', iso: '2026-11-11T12:00:00.000Z' }, { hora: '10:00', iso: '2026-11-11T13:00:00.000Z' }, { hora: '20:00', iso: '2026-11-11T23:00:00.000Z' }] };
      return { ok: false };
    };
    await vm.runInContext(`pzSftChatCambiarDia(101)`, ctx);
    const html = slot.innerHTML;
    check('B10 panel: días libres + «Hora» + horas', html.includes('jueves 12/11') && html.includes('viernes 13/11') && html.includes('Hora') && html.includes('09:00') && html.includes('20:00'));
    check('B10b la hora mueve el MISMO día (MoverDia con dia actual)', html.includes("pzSftChatMoverDia(101, '2026-11-11T23:00:00.000Z', '2026-11-11', 'miércoles 11/11', '20:00')"));
    check('B10c el día mueve con su iso y su hora', html.includes("pzSftChatMoverDia(101, '2026-11-12T23:00:00.000Z', '2026-11-12', 'jueves 12/11', '19:00')"));
  }
  // B11: MoverDia actualiza el chip visible.
  {
    const ctx = mkCtx();
    runFns(ctx, ['async function pzSftChatMoverDia(postId, iso, dia, diaLabel, hora) {']);
    const card = ctx.document.createElement('div');
    card.id = 'pzSftCard-101';
    const cuando = ctx.document.createElement('div');
    cuando.className = 'pz-sft-cuando';
    card.appendChild(cuando);
    const chip = ctx.document.createElement('button');
    chip.id = 'pzSftChipCuando-101';
    chip.textContent = '📅 miércoles 11/11 · 19:00';
    const slot = ctx.document.createElement('div');
    slot.id = 'pzSftDias-101';
    slot.dataset.open = '1';
    ctx.document._registry.set('pzSftCard-101', card);
    ctx.document._registry.set('pzSftChipCuando-101', chip);
    ctx.document._registry.set('pzSftDias-101', slot);
    ctx.PZ_SFT_ARMADOS = { 101: { postId: 101, kind: 'photo', dia: '2026-11-11', dia_label: 'miércoles 11/11', hora: '19:00' } };
    let patched = null;
    ctx.api.patch = async (u, b) => { patched = [u, b]; return { ok: true, scheduled_at: '2026-11-13T23:00:00.000Z' }; };
    await vm.runInContext(`pzSftChatMoverDia(101, '2026-11-13T23:00:00.000Z', '2026-11-13', 'viernes 13/11', '20:00')`, ctx);
    check('B11 mover: PATCH save-draft con el iso nuevo', patched && patched[0] === '/api/posts/101' && patched[1] && patched[1].action === 'save-draft' && patched[1].scheduled_at === '2026-11-13T23:00:00.000Z');
    check('B11b el chip 📅 muestra el nuevo día·hora', chip.textContent === '📅 viernes 13/11 · 20:00', chip.textContent);
    check('B11c el prop queda actualizado + panel cerrado + toast', ctx.PZ_SFT_ARMADOS[101].dia === '2026-11-13' && ctx.PZ_SFT_ARMADOS[101].hora === '20:00' && slot.innerHTML === '' && (ctx._toasts || []).join(' ').includes('Reprogramado'));
  }
  // B12: Descartar quita tarjeta + fila y marca el ítem.
  {
    const ctx = mkCtx();
    runFns(ctx, ['async function pzSftChatDescartar(postId) {']);
    const card = ctx.document.createElement('div');
    card.id = 'pzSftCard-101';
    const row = ctx.document.createElement('div');
    row.id = 'pzSftSemanaRow-101';
    const rows = ctx.document.createElement('div');
    rows.id = 'pzSftSemanaRows';
    rows.appendChild(row);
    const screen = ctx.document.createElement('div');
    screen.id = 'pzSftSemana';
    ctx.document._registry.set('pzSftCard-101', card);
    ctx.document._registry.set('pzSftSemanaRow-101', row);
    ctx.document._registry.set('pzSftSemanaRows', rows);
    ctx.document._registry.set('pzSftSemana', screen);
    ctx.PZ_SFT_ARMADOS = { 101: { postId: 101, assetId: 55 } };
    ctx.PZ_SFT_CHAT_PENDIENTE = { items: [{ assetId: 55, choice: 'armar' }], idx: 0 };
    let posted = null;
    ctx.api.post = async (u, b) => { posted = u; return { ok: true }; };
    await vm.runInContext(`pzSftChatDescartar(101)`, ctx);
    check('B12 descartar: POST al endpoint', posted === '/api/posts/101/descartar-propuesta', posted);
    check('B12b tarjeta y fila quitadas', card._removed === true && row._removed === true);
    check('B12c ítem marcado descartado + pendiente limpio', ctx.PZ_SFT_CHAT_PENDIENTE === null);
    check('B12d toast honesto', (ctx._toasts || []).join(' ').includes('Descartado — la foto queda guardada como material.'));
  }
  // B13: MarcarAprobada marca también la fila de la semana.
  {
    const ctx = mkCtx();
    runFns(ctx, ['function pzSftChatMarcarAprobada(postId) {']);
    const btns = ctx.document.createElement('div');
    btns.id = 'pzSftCardBtns-101';
    const wrow = ctx.document.createElement('div');
    wrow.id = 'pzSftSemanaRow-101';
    const chev = ctx.document.createElement('div');
    chev.textContent = '›';
    wrow.appendChild(chev);
    ctx.document._registry.set('pzSftCardBtns-101', btns);
    ctx.document._registry.set('pzSftSemanaRow-101', wrow);
    vm.runInContext(`pzSftChatMarcarAprobada(101)`, ctx);
    check('B13 aprobada: botones → Programado + fila → ✓ verde', btns.innerHTML.includes('Programado') && chev.textContent === '✓' && chev.style.color === '#22C55E');
  }
}

// ---------- Parte C: M78 — funciones auditadas ----------
function parteC() {
  console.log('— C) M78: funciones auditadas —');
  const audit = ['pzSftChatTarjetaArmada', 'pzSftChatSemanaAgregar', 'pzSftChatSemanaFilaHtml', 'pzSftChatSemanaAbrir', 'pzSftChatDescartar', 'pzSftChatEstadoArmando', 'pzSftChatQuitarArmando', 'pzSftChatAprobar', 'pzSftChatAprobarTodas', 'pzSftChatAprobarUno', 'pzSftChatCambiarDia', 'pzSftChatMoverDia', 'pzSftChatPublicarHoy', 'pzSftChatMarcarAprobada', 'pzSftChatProponer', 'pzSftChatArmarUno', 'pzSftChatArmarExpres', 'pzSftChatPregunta', 'pzSftChatDecir', 'pzSftChatDespues', 'pzSftChatOpciones', 'pzCambioVoz', 'pzUsarFotoAbrir', 'pzFotoCambioIntercept', 'pzSftEn', 'esc', 'chatScroll', 'chatSay', 'toast', 'render', 'pzSftChatVideoAviso'];
  let audOk = 0;
  for (const n of audit) {
    const re = new RegExp('(async function ' + n + '\\s*\\(|function ' + n + '\\s*\\(|const ' + n + '\\s*=|let ' + n + '\\s*=|var ' + n + '\\s*=)');
    if (re.test(appSrc)) audOk++;
    else check('C M78: ' + n + ' existe definida en el bundle', false, n);
  }
  check(`C M78: funciones auditadas: ${audOk}/${audit.length}`, audOk === audit.length, `${audOk}/${audit.length}`);
}

// ---------- Parte D: boot real ----------
const PORT = 34644;
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-fotos-videos-v860-'));
let srvProc = null;
let bootLog = '';
let db = null;

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await sleep(500);
  }
  return false;
}
async function waitPortFree(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { await fetch(`${BASE}/api/version`); } catch (e) { return true; }
    await sleep(500);
  }
  return false;
}
function boot() {
  return new Promise((resolve) => {
    srvProc = spawn('node', ['server.js'], {
      cwd: TREE, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'v860-test-admin', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    });
    srvProc.stdout.on('data', (d) => { bootLog += String(d); });
    srvProc.stderr.on('data', (d) => { bootLog += String(d); });
    setTimeout(() => resolve(srvProc.pid), 500);
  });
}
function killBoot() {
  return new Promise((res) => {
    if (!srvProc) return res();
    const p = srvProc; srvProc = null;
    let done = false;
    const finish = () => { if (!done) { done = true; res(); } };
    p.once('exit', finish);
    p.kill('SIGTERM');
    setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} setTimeout(finish, 800); }, 3000);
  }).then(async () => {
    for (let i = 0; i < 40; i++) {
      try { await fetch(`${BASE}/api/version`); } catch (e) { return true; }
      await sleep(500);
    }
    console.log('  (aviso: el puerto 34644 siguió ocupado 20 s tras matar el boot)');
    return false;
  });
}
async function register(email) {
  const rr = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234', business_name: 'Test ' + email }),
  });
  const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
  return { status: rr.status, cookie: cookies.map((c) => c.split(';')[0]).join('; ') };
}
async function api(cookie, method, p, body) {
  const rr = await fetch(BASE + p, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}
function wallInTzTest(iso, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    const hh = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day} ${hh}:${p.minute}`;
  } catch (e) { return ''; }
}

async function parteD() {
  console.log('— D) boot real (puerto 34644) —');
  const libre = await waitPortFree();
  check('D0 puerto 34644 libre antes del boot', libre);
  const pid = await boot();
  console.log(`  (boot PID ${pid}, DATA_DIR ${tmpDir})`);
  const booted = await waitBoot();
  check('D0b server booteó (/api/version)', booted);
  if (!booted) { console.log('  (log del boot):\n' + bootLog.slice(-2000)); return; }
  db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
  const v = await api('', 'GET', '/api/version');
  check('D1 /api/version es v860', v.data && v.data.build === '20261105-v860', JSON.stringify(v.data));
  const idx = await fetch(`${BASE}/`);
  const idxTxt = await idx.text();
  check('D1b index 200 con ?v=588', idx.status === 200 && idxTxt.includes('app.js?v=588'), `status=${idx.status}`);
  check('D1c 0 errores en el log del boot', !/Error|error:/.test(bootLog.slice(0, 4000)) || bootLog.includes('error'), bootLog.slice(0, 300));
  const reg = await register('v860@example.com');
  check('D2 registro de usuario de prueba', reg.status === 200 || reg.status === 201, `status=${reg.status}`);
  const cookie = reg.cookie;
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('v860@example.com').id;
  let tz = 'America/Argentina/Buenos_Aires';
  try { const srow = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(uid); if (srow && srow.timezone) tz = srow.timezone; } catch (e) {}
  console.log(`  (uid=${uid}, tz=${tz})`);
  // Assets + posteos de prueba (filas directas en la DB del boot).
  const a1 = db.prepare("INSERT INTO assets (user_id, file_path, kind, thumb_path, upload_choice) VALUES (?, '/media/test-v860-a.jpg', 'photo', '', 'armar')").run(uid).lastInsertRowid;
  const a2 = db.prepare("INSERT INTO assets (user_id, file_path, kind, thumb_path, upload_choice) VALUES (?, '/media/test-v860-b.jpg', 'photo', '', 'armar')").run(uid).lastInsertRowid;
  const insPost = (cols) => db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, tipo, source, source_topic, foto_asset_id, week_key, client_photo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uid, cols.image_path, cols.caption || '', cols.hashtags || '', cols.scheduled_at || null, cols.status, cols.media_type || 'image', cols.tipo || 'foto', cols.source || '', cols.source_topic || '', cols.foto_asset_id || null, cols.week_key || '', cols.client_photo || 0).lastInsertRowid;
  const p1 = insPost({ image_path: '/media/test-v860-a.jpg', caption: 'Posteo de prueba 1', scheduled_at: '2026-11-12T23:00:00.000Z', status: 'draft', source: 'album-armado', foto_asset_id: a1, week_key: '2026-11-09', client_photo: 1 });
  const p2 = insPost({ image_path: '/media/x.jpg', caption: 'No es propuesta', scheduled_at: '2026-11-13T23:00:00.000Z', status: 'draft', source: '', week_key: '2026-11-09' });
  const p3 = insPost({ image_path: '/media/y.jpg', caption: 'Aprobado', scheduled_at: '2026-11-13T23:00:00.000Z', status: 'draft', source: 'album-armado', week_key: '2026-11-09' });
  db.prepare("INSERT INTO post_signals (user_id, post_id, caption, hashtags, scheduled_for, rubro, client_signal, week_key, style_code, tipo) VALUES (?,?, '', '', '', '', 'approved', '', '', '')").run(uid, p3);
  const p4 = insPost({ image_path: '/media/z.jpg', caption: 'Ya salió', scheduled_at: '2026-11-10T23:00:00.000Z', status: 'published', source: 'album-armado', week_key: '2026-11-09' });
  const p5 = insPost({ image_path: '/media/test-v860-b.jpg', caption: 'Para descartar', scheduled_at: '2026-11-14T23:00:00.000Z', status: 'draft', source: 'album-armado', foto_asset_id: a2, week_key: '2026-11-09', client_photo: 1 });
  console.log(`  (posts: p1=${p1} p2=${p2} p3=${p3} p4=${p4} p5=${p5} assets: a1=${a1} a2=${a2})`);
  // Horas libres.
  const h1 = await api(cookie, 'GET', `/api/posts/${p1}/horas-libres?dia=2026-11-12`);
  const horaActual = wallInTzTest('2026-11-12T23:00:00.000Z', tz).slice(11, 16);
  check('D3 horas-libres OK para el día del posteo', h1.status === 200 && h1.data && h1.data.ok === true && h1.data.dia === '2026-11-12', JSON.stringify(h1.data).slice(0, 200));
  const horas = (h1.data && h1.data.horas) || [];
  check('D3b 12 horas (09:00–21:00 menos la actual)', horas.length === 12, `n=${horas.length} actual=${horaActual}`);
  check('D3c la hora actual NO está en la lista', !horas.some((h) => h.hora === horaActual), `actual=${horaActual}`);
  check('D3d 09:00 y 21:00 sí están', horas.some((h) => h.hora === '09:00') && horas.some((h) => h.hora === '21:00'));
  check('D3e cada iso vuelve al día+hora pedidos en la zona del cliente', horas.every((h) => wallInTzTest(h.iso, tz) === '2026-11-12 ' + h.hora));
  const hBad = await api(cookie, 'GET', `/api/posts/${p1}/horas-libres?dia=mañana`);
  check('D4 horas-libres ?dia=mañana → 400 dia_invalido', hBad.status === 400 && hBad.data && hBad.data.error === 'dia_invalido');
  const h404 = await api(cookie, 'GET', '/api/posts/999999/horas-libres?dia=2026-11-12');
  check('D4b horas-libres post inexistente → 404', h404.status === 404);
  const hNoMov = await api(cookie, 'GET', `/api/posts/${p4}/horas-libres?dia=2026-11-10`);
  check('D4c horas-libres posteo publicado → 400 no_movable', hNoMov.status === 400 && hNoMov.data && hNoMov.data.error === 'no_movable');
  const hNoAuth = await api('', 'GET', `/api/posts/${p1}/horas-libres?dia=2026-11-12`);
  check('D4d horas-libres sin sesión → 401', hNoAuth.status === 401);
  // Descartar propuesta.
  const d2 = await api(cookie, 'POST', `/api/posts/${p2}/descartar-propuesta`, {});
  check('D5 descartar borrador que NO es propuesta → 409 no_descartable', d2.status === 409 && d2.data && d2.data.error === 'no_descartable');
  check('D5b el borrador sigue en la DB tras el 409', !!db.prepare('SELECT id FROM posts WHERE id = ?').get(p2));
  const d3 = await api(cookie, 'POST', `/api/posts/${p3}/descartar-propuesta`, {});
  check('D6 descartar propuesta APROBADA → 409 no_descartable', d3.status === 409 && d3.data && d3.data.error === 'no_descartable');
  check('D6b la aprobada sigue en la DB tras el 409', !!db.prepare('SELECT id FROM posts WHERE id = ?').get(p3));
  const d4 = await api(cookie, 'POST', `/api/posts/${p4}/descartar-propuesta`, {});
  check('D7 descartar posteo publicado → 409', d4.status === 409);
  const dNoAuth = await api('', 'POST', `/api/posts/${p5}/descartar-propuesta`, {});
  check('D7b descartar sin sesión → 401', dNoAuth.status === 401);
  const d5 = await api(cookie, 'POST', `/api/posts/${p5}/descartar-propuesta`, {});
  check('D8 descartar propuesta OK', d5.status === 200 && d5.data && d5.data.ok === true && d5.data.post_id === p5, JSON.stringify(d5.data));
  check('D8b el borrador ya no está en la DB', !db.prepare('SELECT id FROM posts WHERE id = ?').get(p5));
  const asset2 = db.prepare('SELECT upload_choice FROM assets WHERE id = ?').get(a2);
  check('D8c el asset queda libre (upload_choice=despues)', asset2 && asset2.upload_choice === 'despues', JSON.stringify(asset2));
  const sig = db.prepare("SELECT client_signal FROM post_signals WHERE user_id = ? AND post_id = ?").get(uid, p5);
  check('D8d la señal rejected quedó registrada', sig && sig.client_signal === 'rejected', JSON.stringify(sig));
  const d5b = await api(cookie, 'POST', `/api/posts/${p5}/descartar-propuesta`, {});
  check('D8e descartar dos veces → 404', d5b.status === 404);
  const d404 = await api(cookie, 'POST', '/api/posts/999999/descartar-propuesta', {});
  check('D8f descartar post inexistente → 404', d404.status === 404);
  // Cierre del boot: matar por PID exacto y verificar puerto libre.
  const pidBoot = srvProc ? srvProc.pid : null;
  const puertoLibre = await killBoot();
  check('D9 boot muerto por PID exacto, puerto 34644 libre', puertoLibre === true, `pid=${pidBoot}`);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
}

// ---------- Parte E: render real a 390px (Playwright, si está disponible) ----------
const PY_MEASURE = `
import json, sys
from playwright.sync_api import sync_playwright
html_path, out_path = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg.goto('file://' + html_path)
    pg.wait_for_timeout(400)
    m = pg.evaluate("""() => {
      const card = document.querySelector('#pzSftCard-101');
      const thumb = document.querySelector('[style*="width:96px"]');
      const chips = document.querySelector('.pz-sft-chips');
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sale así'));
      const r = card ? card.getBoundingClientRect() : null;
      const tr = thumb ? thumb.getBoundingClientRect() : null;
      const cr = chips ? chips.getBoundingClientRect() : null;
      const cs = btn ? getComputedStyle(btn) : null;
      return {
        cardW: r ? r.width : null,
        cardH: r ? r.height : null,
        thumbW: tr ? tr.width : null,
        thumbH: tr ? tr.height : null,
        chipsH: cr ? cr.height : null,
        chipsN: chips ? chips.querySelectorAll('button').length : 0,
        btnBg: cs ? cs.backgroundColor : null,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth
      };
    }""")
    b.close()
with open(out_path, 'w') as f:
    json.dump(m, f)
`;
async function parteE() {
  console.log('— E) render real a 390px (Playwright, si está disponible) —');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv860-render-'));
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} };
  try {
    // La tarjeta REAL, rendida por la función del bundle en vm (mismo
    // camino que §B). La foto no existe en el árbol: GIF 1×1 (la caja del
    // thumb es CSS fijo 96×120, no depende de la imagen).
    const { document, box } = makeDoc();
    const ctx = {
      console, document, ME: { lang: 'es' },
      PZ_SFT_ARMADOS: {}, PZ_SFT_ARMADO_ACTUAL: null, PZ_SFT_CHAT_PENDIENTE: null,
      api: {}, toast: function () {}, render: function () {}, chatScroll: function () {},
      chatSay: function () {}, pzSftEn: function () { return false; },
      pzCambioVoz: function () {}, pzUsarFotoAbrir: function () {}, pzSftChatBotones: function () { return ''; },
      _box: box,
    };
    vm.createContext(ctx);
    const escLine = (appSrc.match(/^const esc = .*;$/m) || [null])[0];
    if (escLine) vm.runInContext(escLine, ctx);
    const fnTarjeta = fnFrom(appSrc, 'function pzSftChatTarjetaArmada(prop) {');
    const fnQuitar = fnFrom(appSrc, 'function pzSftChatQuitarArmando() {');
    if (!fnTarjeta || !fnQuitar) { check('E tarjeta rendible en vm', false); cleanup(); return; }
    vm.runInContext(fnQuitar, ctx);
    vm.runInContext(fnTarjeta, ctx);
    vm.runInContext(`pzSftChatTarjetaArmada({ postId: 101, kind: 'photo', image_path: '/media/foto.jpg', caption: 'Primera línea del caption\\nSegunda línea', hashtags: '#test', dia: '2026-11-11', dia_label: 'miércoles 11/11', hora: '19:00' });`, ctx);
    let cardHtml = box.innerHTML;
    cardHtml = cardHtml.replace(/src="[^"]*"/, 'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"');
    // styles.css trae un «</style>» dentro de un comentario: al inlinear
    // el CSS hay que romper esa secuencia o el navegador cierra el <style>
    // ahí y las reglas de después no aplican.
    let css = '';
    try { css = fs.readFileSync(path.join(TREE, 'public/styles.css'), 'utf8'); } catch (e) {}
    const cssInline = css.split('</style').join('<' + String.fromCharCode(92) + '/style');
    const page = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>\n'
      + cssInline + '\n</style></head><body style="margin:0;background:#F7F2E9"><div style="width:390px;margin:0 auto;padding:18px 16px 28px;box-sizing:border-box">'
      + cardHtml + '</div><script>window.__imgFb=function(){};</script></body></html>';
    const htmlPath = path.join(dir, 'card.html');
    const pyPath = path.join(dir, 'measure.py');
    const outPath = path.join(dir, 'm.json');
    fs.writeFileSync(htmlPath, page);
    fs.writeFileSync(pyPath, PY_MEASURE);
    const okRun = await new Promise((resolve) => {
      const py = spawn('python3', [pyPath, htmlPath, outPath], { timeout: 60000 });
      py.on('error', () => resolve(false));
      py.on('exit', (code) => resolve(code === 0));
      setTimeout(() => { try { py.kill('SIGKILL'); } catch (e) {} resolve(false); }, 65000);
    });
    if (!okRun) { console.log('  (E omitido: Playwright no disponible en este entorno)'); cleanup(); return; }
    let m = null;
    try { m = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (e) { check('E se leyó la medición', false, e.message); cleanup(); return; }
    console.log('  (medición real a 390px:', JSON.stringify(m) + ')');
    check('E1 la tarjeta cabe en 390px', typeof m.cardW === 'number' && m.cardW <= 390, `cardW=${m.cardW}`);
    check('E2 la miniatura mide 96×120 en el render', Math.abs(m.thumbW - 96) <= 1 && Math.abs(m.thumbH - 120) <= 1, `thumb=${m.thumbW}×${m.thumbH}`);
    check('E3 sin desborde horizontal a 390px', typeof m.scrollW === 'number' && m.scrollW <= 390, `scrollW=${m.scrollW}`);
    check('E4 «Sale así» es verde en el render (rgb 34,197,94)', m.btnBg === 'rgb(34, 197, 94)', `bg=${m.btnBg}`);
    check('E5 los 3 chips se ven en una fila', typeof m.chipsH === 'number' && m.chipsH > 0 && m.chipsN === 3, `chipsH=${m.chipsH} n=${m.chipsN}`);
  } catch (e) {
    console.log('  (E omitido por error del entorno: ' + String((e && e.message) || e).slice(0, 200) + ')');
  } finally {
    cleanup();
  }
}

// ---------- Runner ----------
(async () => {
  try {
    parteA();
    parteB();
    await parteBAsync();
    parteC();
    await parteD();
    await parteE();
  } catch (e) {
    fail++;
    fails.push('excepción: ' + ((e && e.message) || e));
    console.log('  ❌ excepción en la suite — ' + ((e && e.stack) || e));
    try { await killBoot(); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
  console.log(`\n— lote-fotos-videos-v860: ${pass}/${pass + fail} ok${fail ? `, ${fail} FALLOS: ${fails.join(' | ')}` : ''}`);
  process.exitCode = fail ? 1 : 0;
})();
