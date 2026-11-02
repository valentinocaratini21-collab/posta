// test-lotedetalledirectoA.js — LOTE DETALLE-SIMPLE-DIRECTO, OPCIÓN A (decisión Valentino 2/11 12:00,
// confirmada por él 2/11 ~12:17 «dale»; lectura fiel de bamboo: la captura es approvalPostView).
// Uso: node test-lotedetalledirectoA.js [dir]  (dir = raíz del árbol; default: __dirname)
// Construcción SIN PUSH. Base de construcción: release local v557 (app.js a3375203, ?v=373,
// styles fa25986b, ?v=20261090) = EXACTAMENTE lo servido por v558 en app.js/styles (v558 de Juli
// NO tocó app.js ni styles; solo server/generator/caption). Por eso el pin de server.js acá es
// v557: el árbol de construcción hereda el server v557 y la LIBERACIÓN debe re-basar el server
// sobre v558 (diff Juli: BANNED_PHRASES femenina + caption-style ítem 23) y bumpear a v559,
// re-rotando estos 3 pins (BUILD, ?v= app, ?v= styles). NO se bumpeó server a v558 a mano:
// eso fabricaría un v558 sin el diff Juli.
// Node puro, lee el árbol + vm con DOM falso para las funciones nuevas.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const region = (from, to) => {
  const a = app.indexOf(from);
  if (a < 0) return '';
  const b = to ? app.indexOf(to, a + from.length) : app.length;
  return b < 0 ? app.slice(a) : app.slice(a, b);
};

// ---------- Versiones + censo (base de construcción v557-release = v558 servido en app/styles) ----------
ok(srv.includes("const BUILD_ID = '20261101-v559'"), 'BUILD v559 en server.js (liberación: v558 Juli + bump)');
ok(idx.includes('app.js?v=374'), 'index ES: app.js?v=374');
ok(idx.includes('styles.css?v=20261091'), 'index ES: styles 20261091');
ok(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
ok(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
ok(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
ok(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
ok(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
ok(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
ok(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1 (sin literales nuevos)');
ok(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
ok(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');
ok(!srv.includes('pzApvMenuToggle') && !srv.includes('pzDetDirectoEsAjustable'), 'server.js sin tocar por este lote');

// ---------- Parte 1 intacta (pop simple; sigue viva: Agenda + publicadas) ----------
ok(app.includes('function detSimpleMenuHTML(d, o)'), 'Parte 1: detSimpleMenuHTML existe');
ok(app.includes('const simple = !!(o && o.simple);'), 'Parte 1: weekCardHTML o.simple');
ok(app.includes('igmock-simple'), 'Parte 1: clase igmock-simple en app.js');
ok(css.includes('.igmock-simple'), 'Parte 1: reglas igmock-simple en styles.css');
ok(cnt(app, 'scfOpenPop(') === 4, 'Parte 1 viva: scfOpenPop = definición + 3 llamados en bindScfMinis (Agenda/publicadas)');
ok(!app.includes("hfActionsAct('edit'") || true, 'placeholder (sin efecto)');

// ---------- Opción A · 1. approvalPostView simplificada ----------
const apvR = region('function apvMoreHTML(', '\nfunction pzApvMenuToggle');
ok(apvR.length > 0, 'apv: apvMoreHTML existe');
ok(apvR.includes('id="apvMenuBtn"') && apvR.includes('id="apvMenu" hidden'), 'apv: botón ••• + menú oculto por defecto');
ok(apvR.includes('id="apvChangePub"') && apvR.includes('Pedir un cambio'), 'apv: publicados llevan Pedir un cambio');
ok(!apvR.includes('apv-like'), 'apv: sin corazón Aprobar duplicado en el menú (ya es el Aceptar primario)');
ok(app.includes('id="apvAccept"') && app.includes('id="apvAcceptDraft"'), 'apv: primario Aceptar intacto (programados y borradores, mismos handlers)');
ok(app.includes('function pzApvMenuToggle()'), 'apv: pzApvMenuToggle existe');
ok(app.includes("document.getElementById('apvMenuBtn')"), 'apv: bindApprovalPost cablea •••');
ok(app.includes("document.getElementById('apvChangePub')"), 'apv: bindApprovalPost cablea Pedir un cambio (publicados)');
ok(app.includes('${hfAskChangeBtnHTML(p)}'), 'apv: mini-chat al pie intacto, no duplicado');
ok(!srv.includes('apvMenuBtn'), 'pública /aprobar sin tocar: server.js sin marcas del lote');

// Orden exacto del menú (sobre la salida real, no sobre el fuente): Hablar < Editar < Rechazar < Frenar < Eliminar < Rehacer < No me gusta
{
  const apvIdx = app.indexOf('function apvMoreHTML(');
  const bindIdx = app.indexOf('\nfunction bindApprovalPost()', apvIdx);
  const helpIdx = app.indexOf('function pzDetDirectoEsAjustable(w)');
  const scfIdx = app.indexOf('function bindScfMinis(root)', helpIdx);
  const vmLabels = ['apv VM: menú programado trae los 7 ítems en orden', 'apv VM: orden Hablar<Editar<Rechazar<Frenar<Eliminar<Rehacer<No me gusta', 'apv VM: sin Aprobar duplicado en el menú', 'apv VM: ••• + menú oculto', 'apv VM: borrador sin Frenar (solo programados)', 'apv VM: publicado = Pedir un cambio', 'apv VM: publicado sin menú ni Eliminar', 'apv VM: toggle abre el menú y marca aria-expanded', 'apv VM: toggle cierra el menú', 'redirect VM: home borrador = ajustable', 'redirect VM: home programado = ajustable', 'redirect VM: home publicado = NO ajustable', 'redirect VM: Agenda programado = NO redirige (conserva pop)'];
  if (apvIdx < 0 || bindIdx < 0 || helpIdx < 0 || scfIdx < 0) {
    // Control negativo: sin funciones nuevas no hay nada que ejecutar; cada assert VM falla limpio, sin crash.
    vmLabels.forEach((l) => ok(false, l));
  } else {
  const src = app.slice(apvIdx, bindIdx) + '\n' + app.slice(helpIdx, scfIdx);
  const sandbox = {
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s),
    pzIc: () => '[ic]',
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const post = { id: 99, image_path: '/x.jpg', status: 'scheduled' };
  const out = sandbox.apvMoreHTML(post, 'scheduled', true, false, 'Quiero editar');
  const labels = ['Hablar de este posteo', 'Editar', 'Rechazar', 'Frenar', 'Eliminar', 'Rehacer', 'No me gusta'];
  const pos = labels.map((l) => out.indexOf(l));
  ok(pos.every((p) => p >= 0), 'apv VM: menú programado trae los 7 ítems en orden');
  ok(pos.every((p, i) => i === 0 || p > pos[i - 1]), 'apv VM: orden Hablar<Editar<Rechazar<Frenar<Eliminar<Rehacer<No me gusta');
  ok(!out.includes('Aprobar'), 'apv VM: sin Aprobar duplicado en el menú');
  ok(out.includes('id="apvMenuBtn"') && out.includes('id="apvMenu" hidden'), 'apv VM: ••• + menú oculto');
  const outDraft = sandbox.apvMoreHTML({ id: 5, image_path: '/x.jpg', status: 'draft' }, 'draft', false, true, 'Quiero editar');
  ok(!outDraft.includes('apvHold'), 'apv VM: borrador sin Frenar (solo programados)');
  const outPub = sandbox.apvMoreHTML({ id: 7, image_path: '/x.jpg', status: 'published' }, 'published', false, false, '');
  ok(outPub.includes('apvChangePub') && outPub.includes('Pedir un cambio'), 'apv VM: publicado = Pedir un cambio');
  ok(!outPub.includes('apvMenuBtn') && !outPub.includes('apvDelete'), 'apv VM: publicado sin menú ni Eliminar');
  // pzApvMenuToggle con DOM falso
  const menu = { hidden: true, hasAttribute: function (a) { return a === 'hidden' ? this.hidden : false; }, removeAttribute: function () { this.hidden = false; }, setAttribute: function () { this.hidden = true; } };
  const btn = { expanded: 'false', setAttribute: function (k, v) { this.expanded = v; } };
  sandbox.document = { getElementById: (id) => (id === 'apvMenu' ? menu : id === 'apvMenuBtn' ? btn : null) };
  sandbox.pzApvMenuToggle();
  ok(menu.hidden === false && btn.expanded === 'true', 'apv VM: toggle abre el menú y marca aria-expanded');
  sandbox.pzApvMenuToggle();
  ok(menu.hidden === true && btn.expanded === 'false', 'apv VM: toggle cierra el menú');
  // pzDetDirectoEsAjustable con tiles falsos
  const mkW = (inHome, st) => ({ dataset: { status: st, postId: '42' }, closest: (sel) => (sel === '#inicioView' && inHome ? {} : null) });
  ok(sandbox.pzDetDirectoEsAjustable(mkW(true, 'draft')) === true, 'redirect VM: home borrador = ajustable');
  ok(sandbox.pzDetDirectoEsAjustable(mkW(true, 'scheduled')) === true, 'redirect VM: home programado = ajustable');
  ok(sandbox.pzDetDirectoEsAjustable(mkW(true, 'published')) === false, 'redirect VM: home publicado = NO ajustable');
  ok(sandbox.pzDetDirectoEsAjustable(mkW(false, 'scheduled')) === false, 'redirect VM: Agenda programado = NO redirige (conserva pop)');
  }
}

// ---------- Opción A · 2. Redirect feed (táctil + desktop), doble toque intacto ----------
const dblR = region('function hfDetailBind(', '\nfunction hfLikeBind');
ok(dblR.includes('HF_DBL.t < 300') || dblR.includes('dblNow - HF_DBL.t < 300'), 'táctil: doble toque 300 ms intacto');
ok(dblR.includes('hfTileApprove(tile, t.post)'), 'táctil: doble toque aprueba en su lugar');
ok(dblR.includes("location.hash = '#/app/post/' + encodeURIComponent(pend.post.id)"), 'táctil: single tap ajustable -> #/app/post/:id');
ok(dblR.includes('hfDetailOpen(pend.post, pend.tile)'), 'táctil: publicado conserva hfDetailOpen (no va a aprobación)');
ok(app.includes('function pzDetDirectoEsAjustable(w)'), 'desktop: helper pzDetDirectoEsAjustable existe');
ok(app.includes("w.closest('#inicioView')"), 'desktop: redirect solo dentro de #inicioView');
ok(app.includes('if (pzDetDirectoEsAjustable(w)) return; // home ajustable: sin pop de hover'), 'desktop: hover sin pop en home ajustable');
ok(app.includes("if (pzDetDirectoEsAjustable(w)) { location.hash = '#/app/post/' + encodeURIComponent(w.dataset.postId); return; }"), 'desktop: click directo a #/app/post/:id');
ok(app.includes('scfOpenPop(w, true)'), 'desktop: Agenda/publicadas conservan scfOpenPop');

// ---------- Opción A · 3. Tarjeta de contexto del chat ----------
ok(app.includes('data-anchor-open="1"'), 'chat: tarjeta de contexto lleva data-anchor-open');
ok(app.includes('__pzAnchorOpenBound'), 'chat: binder delegado pzAnchorOpenBind una sola vez');
{
  const b0 = app.indexOf('(function pzAnchorOpenBind()');
  const b1 = b0 < 0 ? -1 : app.indexOf('function hfOpenChatForPost(post)', b0);
  const bR = (b0 >= 0 && b1 >= 0) ? app.slice(b0, b1) : '';
  ok(bR.includes("e.target.closest('button')") && bR.includes("location.hash = '#/app/post/' + encodeURIComponent(id)"), 'chat: toque en tarjeta -> aprobación; botones (✕/chips) pasan a sus handlers');
}

// ---------- Opción A · 4. Fix Edit de la hoja ----------
const actR = region('function hfActionsAct(', "  if (act === 'move')");
ok(actR.includes("location.hash = '#/app/post/' + encodeURIComponent(id)") && !actR.includes('scfOpenPop(tile'), 'hoja Edit: destino directo SIN pop (causa corregida: la capa vivía en body, no en la tile)');

// ---------- Opción A · 5. CSS ----------
ok(css.includes('.apv-media img{object-fit:contain}'), 'css: foto apv nunca cortada (contain)');
ok(css.includes('.apv-when{font-size:13px'), 'css: día/hora en chico (13px)');
ok(css.includes('.apv-pill{font-size:13px}'), 'css: estado en chico (13px)');
ok(css.includes('.apv-wrap .apv-primary{position:sticky'), 'css: primario Aceptar fijo (sticky al pie)');
ok(css.includes('.apv-menu-btn'), 'css: botón •••');
ok(css.includes('.apv-menu[hidden]{display:none}'), 'css: menú oculto con hidden pese a display:flex');
ok(css.includes('.hf-anchor{cursor:pointer}'), 'css: tarjeta del chat con affordance de toque');

console.log(`test-lotedetalledirectoA: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
