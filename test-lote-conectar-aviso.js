// test-lote-conectar-aviso.js — LOTE CONECTAR-AVISO (orden de
// Valentino 17/11 14:19: «dale, arma esas mejoras», sobre su video
// de reconexión de las 14:15: el login de Meta dentro del navegador
// le mostró DOS veces el «Something went wrong» de la passkey — la
// confirmación con cara/huella falló dentro del navegador — hasta
// que eligió «Try another way» → código por SMS y entró. Ese paso
// es de Meta; lo nuestro es preparar al cliente ANTES del salto y
// rescatarlo si vuelve sin conectar.)
//
// EL LOTE (solo public/app.js; server.js y chunk-ajustes.js intactos):
//  Pieza 1 — el aviso previo: TODOS los saltos a Meta pasan por
//    pzConectarConAviso: el OAuth de Instagram (igConnect — candado
//    de la casa, popup de primer ingreso, checklist, gate de la
//    semana, banner de reanudar y los botones de Ajustes vía
//    chunk-ajustes), el wow (pzWowGo) y el login unificado de Ads
//    (pzAdsAutorizarPagina / pzBoostConectarCuenta, vía connectUrl).
//    El aviso muestra los 3 contenidos (login de Meta · «Try another
//    way» → código por SMS si la passkey falla · elegir el portfolio
//    del negocio), ES/EN por ME.lang, y se ve UNA vez por sesión
//    (sessionStorage): quien ya lo vio salta directo. El salto en sí
//    es byte a byte el de siempre.
//  Pieza 2 — el rescate, dos capas sobre renderIgResume:
//    · ig_pending (la marca que el callback deja en el servidor,
//      ventana de 15 min): la copia del banner ahora dice por qué
//      suele pasar (Instagram pide un código) y su botón reintenta
//      por igConnect — o sea, pasando por el aviso.
//    · intento de ESTA sesión sin marca del callback (la marca
//      pz_ig_intento_ts que deja el salto real, ventana de 2 h): el
//      retorno que el servidor no puede ver (cerró el login de Meta
//      y volvió por su cuenta). Línea discreta con descarte propio.
//    Nada aparece para quien nunca intentó ni para quien conectó.
//
// Qué prueba:
//  A (estático): el embudo y sus llamadores, los textos ES/EN, las
//     dos capas del rescate y los invariantes (chunk-ajustes y
//     server.js byte a byte; sellos intactos).
//  B (VM con DOM mínimo): el aviso se muestra una vez y el salto
//     ocurre solo al confirmar (o directo si ya se vio); cancelar
//     no salta ni deja marcas colgadas (wow); igConnect salta a la
//     URL exacta de siempre y deja la marca de intento; los dos
//     botones de Ads pasan por el aviso con su destino exacto y su
//     botón se restaura al cancelar; el rescate pinta la capa que
//     corresponde (callback / sesión / ninguna / conectado) y su
//     reintento pasa por igConnect.
//  C (boot real): el servidor sirve el bundle con el aviso y el
//     build sigue siendo el de la base (el builder no estampa).
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-conectar-aviso.js
// (desde el árbol del lote; para el control, copiar a pristine/ y correr ahí.)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35311;

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let depth = 0, j = src.indexOf('{', i);
  const start = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return src.slice(i, start);
}

// ---------- A. Estático ----------
console.log('== A. Estático ==');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const appCode = stripComments(appSrc);
{
  const gate = fnFrom(appCode, 'function pzConectarConAviso(go, onCancel)');
  t(gate.length > 0, 'A1 [FIX] pzConectarConAviso existe (el embudo único del aviso)');
  t(gate.includes('pzIgAvisoYaVisto()') && fnFrom(appCode, 'function pzIgAvisoYaVisto()').includes('sessionStorage.getItem(PZ_IG_AVISO_KEY)'), 'A2 [FIX] la memoria del aviso vive en sessionStorage (una vez por sesión)');
  t(gate.includes("ov.id = 'pzConectarAvisoOv'"), 'A3 [FIX] el aviso es una tarjeta propia (pzConectarAvisoOv)');
  t(gate.includes('Entendido, conectar') && gate.includes('Got it, connect'), 'A4 [FIX] el confirmar es un solo toque («Entendido, conectar» / «Got it, connect»)');
  // Los 3 contenidos, ES y EN
  t(gate.includes('Meta te va a pedir entrar a tu cuenta de Instagram.') && gate.includes('Meta will ask you to log in to your Instagram account.'), 'A5 [FIX] contenido 1 ES/EN: Meta pide entrar a la cuenta');
  t(gate.includes('tocá «Try another way» y elegí el código por mensaje de texto.') && gate.includes('tap "Try another way" and choose the text-message code.'), 'A6 [FIX] contenido 2 ES/EN: si la cara/huella falla, «Try another way» → código por SMS');
  t(gate.includes('Si te muestra varios negocios, elegí el tuyo: el que tiene tu Instagram y tu Página.') && gate.includes('If it shows you more than one business, pick yours: the one with your Instagram and your Page.'), 'A7 [FIX] contenido 3 ES/EN: elegir el portfolio del negocio');
  t(gate.includes('Antes de conectar') && gate.includes('Before you connect'), 'A8 [FIX] el título del aviso en ES/EN');

  const igc = fnFrom(appCode, 'function igConnect(next)');
  t(igc.includes('pzConectarConAviso('), 'A9 [FIX] igConnect pasa por el aviso (cubre candado, popup, checklist, gate, banner y Ajustes)');
  t(igc.includes('pzIgIntentoMarcar()'), 'A10 [FIX] el salto real de igConnect deja la marca de intento de la sesión');
  t(igc.includes("location.href = '/api/ig/go' + (nx ? '?next=' + encodeURIComponent(nx) : '')"), 'A11 [INVARIANTE] el salto de igConnect es byte a byte el de siempre (/api/ig/go + next)');

  const wow = fnFrom(appCode, 'function pzWowGo()');
  t(wow.includes('pzConectarConAviso('), 'A12 [FIX] el wow también pasa por el aviso (antes saltaba directo)');
  t(wow.includes("sessionStorage.setItem('pz_wow_pending', '1')") && wow.indexOf("sessionStorage.setItem('pz_wow_pending', '1')") > wow.indexOf('pzConectarConAviso('), 'A13 [FIX] la marca del wow se deja dentro del salto confirmado (cancelar no deja marca)');
  t(wow.includes("'&wow=1'") || wow.includes('&wow=1'), 'A14 [INVARIANTE] la URL del wow conserva su marca wow=1');

  const adsTab = fnFrom(appCode, 'async function pzAdsAutorizarPagina(btn)');
  t(adsTab.includes('pzConectarConAviso('), 'A15 [FIX] el botón de Ads (tab) pasa por el aviso antes del login unificado');
  t(adsTab.includes('pzBoostState.connectUrl') && adsTab.includes("encodeURIComponent('/#/app/ads')"), 'A16 [INVARIANTE] el destino del tab sigue siendo connectUrl + next a Ads');
  const adsSheet = fnFrom(appCode, 'async function pzBoostConectarCuenta(btn)');
  t(adsSheet.includes('pzConectarConAviso('), 'A17 [FIX] el botón de Ads (hoja de Impulsar) pasa por el aviso');
  t(adsSheet.includes('pzBoostState.connectUrl') && adsSheet.includes('nextAds'), 'A18 [INVARIANTE] el destino de la hoja sigue siendo connectUrl + su next validado');

  const res = fnFrom(appCode, 'function renderIgResume()');
  t(res.includes('PROFILE.ig_pending'), 'A19 [INVARIANTE] la capa principal del rescate sigue siendo la marca del callback (ig_pending)');
  t(res.includes('Suele pasar cuando Instagram pide un código: al reintentar, elegí el código por mensaje de texto.') && res.includes('It usually happens when Instagram asks for a code: when you retry, choose the text-message code.'), 'A20 [FIX] la copia del banner ahora dice por qué suele pasar (el código), ES/EN');
  t(res.includes('pzIgIntentoReciente()') && res.includes("igRescueSesion"), 'A21 [FIX] la capa discreta de sesión existe (intento sin marca del callback)');
  t(res.includes('¿No se completó la conexión?') && res.includes("Connection didn't finish?"), 'A22 [FIX] la línea discreta en ES/EN');
  t(res.includes('pzIgIntentoLimpiar()'), 'A23 [FIX] el rescate se apaga al conectar y al descartar la línea discreta');

  // Invariantes del lote: superficies ajenas intactas, sin sellos tocados.
  // Si el árbol prístino hermano existe (workspace del builder), la
  // comparación es byte a byte; si no (árbol de liberación), cae a la
  // invariante que importa: el embudo sigue cubriendo Ajustes y la
  // señal del callback sigue existiendo del lado servidor.
  const readOrNull = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };
  const ajustesLote = fs.readFileSync(path.join(ROOT, 'public/chunk-ajustes.js'), 'utf8');
  const ajustesBase = readOrNull(path.join(ROOT, '..', 'pristine', 'public/chunk-ajustes.js'));
  t(ajustesBase !== null ? ajustesLote === ajustesBase : ajustesLote.includes('onclick = igConnect'),
    'A24 [INVARIANTE] chunk-ajustes.js intacto (Ajustes se cubre por el embudo igConnect, sin punto de montaje nuevo)');
  const srvLote = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const srvBase = readOrNull(path.join(ROOT, '..', 'pristine', 'server.js'));
  t(srvBase !== null ? srvLote === srvBase : srvLote.includes('igInterruptedAt'),
    'A25 [INVARIANTE] server.js intacto (el lote es solo cliente)');
  t(srvLote.includes("BUILD_ID = '20261105-v1161'"), 'A26 [INVARIANTE] BUILD_ID sigue en v1161 (el builder no estampa)');
  const idx = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  t(idx.includes('app.js?v=772'), 'A27 [INVARIANTE] el sello app.js?v=772 sigue como en la base');
}

// ---------- B. VM con DOM mínimo ----------
console.log('== B. VM ==');
function makeDom() {
  const byId = new Map();
  function makeEl(tag) {
    const el = {
      tagName: tag, id: '', className: '', style: {}, children: [], parent: null,
      _html: '', _listeners: {}, _subs: new Map(), onclick: null, disabled: false, textContent: '',
      addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
      querySelector(sel) { return this._subs.get(String(sel).replace(/^#/, '')) || null; },
      remove() {
        if (this.id) byId.delete(this.id);
        for (const k of this._subs.keys()) byId.delete(k);
        if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; }
      },
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return this._html; },
      set(v) {
        this._html = String(v);
        const re = /id="([^"]+)"/g; let m;
        while ((m = re.exec(this._html))) { const sub = makeEl('div'); sub.id = m[1]; this._subs.set(m[1], sub); byId.set(m[1], sub); }
      },
    });
    return el;
  }
  const body = makeEl('body');
  body.appendChild = function (child) { child.parent = body; body.children.push(child); if (child.id) byId.set(child.id, child); };
  const document = { body, createElement: (tag) => makeEl(tag), getElementById: (id) => byId.get(id) || null };
  return { document, byId, body };
}
function makeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _map: m };
}
const FN_SURTIDO = [
  'function pzIgAvisoYaVisto()', 'function pzIgAvisoMarcarVisto()', 'function pzIgIntentoMarcar()',
  'function pzIgIntentoReciente()', 'function pzIgIntentoLimpiar()', 'function pzConectarConAviso(go, onCancel)',
  'function igConnect(next)', 'function pzWowGo()', 'function renderIgResume()',
  'async function pzAdsAutorizarPagina(btn)', 'async function pzBoostConectarCuenta(btn)',
];
function makeCtx(lang) {
  const dom = makeDom();
  const store = makeStore();
  const loc = { href: '', hash: '#/app/inicio' };
  const pintadas = [];
  const ctx = {
    console, setTimeout, clearTimeout,
    document: dom.document, sessionStorage: store, localStorage: makeStore(),
    location: loc, window: { location: loc },
    ME: { lang: lang || 'es' }, PROFILE: { ig_connected: false, ig_pending: false },
    pzIc: (n, s) => '[ic:' + n + ']',
    pzBoostState: { connectUrl: 'https://meta.example/unified?x=1' },
    pzBoostLoad: async () => {},
    pzAdsPaginaSinAutorizar: () => true,
    pzBoostGate: () => ({ cerrado: true, motivo: 'sin_cuenta' }),
    pzAdsPintar: () => { pintadas.push(1); },
    pzBoostMotivo: () => 'motivo-de-prueba',
    gzT: (es, en) => ((lang === 'en') ? en : es),
  };
  vm.createContext(ctx);
  const consts = ((appSrc.match(/const PZ_IG_AVISO_KEY[^\n]*/) || [''])[0]) + '\n' + ((appSrc.match(/const PZ_IG_INTENTO_KEY[^\n]*/) || [''])[0]);
  const code = consts + '\n' + FN_SURTIDO.map((sig) => fnFrom(appSrc, sig)).join('\n');
  vm.runInContext(code, ctx);
  return { ctx, dom, store, loc, pintadas };
}
const faltaFn = (c, nombres) => nombres.some((n) => typeof c.ctx[n] !== 'function');

(async () => {
  // B1–B3: el embudo — se muestra una vez, salta al confirmar, cancelar no salta
  {
    const c = makeCtx('es');
    if (faltaFn(c, ['pzConectarConAviso'])) { t(false, 'B1 [FIX] VM: el aviso aparece antes del salto con los 3 contenidos (ES)'); t(false, 'B2 [FIX] VM: confirmar salta una sola vez y marca visto'); t(false, 'B3 [FIX] VM: la segunda vez salta directo / cancelar no salta'); }
    else {
      let saltos = 0;
      c.ctx.pzConectarConAviso(() => { saltos++; });
      const ov = c.dom.document.getElementById('pzConectarAvisoOv');
      t(!!ov && saltos === 0 && ov.innerHTML.includes('Antes de conectar') && ov.innerHTML.includes('entrar a tu cuenta de Instagram') && ov.innerHTML.includes('«Try another way»') && ov.innerHTML.includes('código por mensaje de texto') && ov.innerHTML.includes('varios negocios, elegí el tuyo') && ov.innerHTML.includes('Entendido, conectar'),
        'B1 [FIX] VM: el aviso aparece antes del salto con los 3 contenidos (ES)');
      ov.querySelector('#pzAvisoGo').onclick();
      t(saltos === 1 && !c.dom.document.getElementById('pzConectarAvisoOv') && c.store.getItem('pz_ig_aviso_v1') === '1',
        'B2 [FIX] VM: confirmar salta una sola vez, cierra el aviso y marca visto');
      c.ctx.pzConectarConAviso(() => { saltos++; });
      t(saltos === 2 && !c.dom.document.getElementById('pzConectarAvisoOv'),
        'B3 [FIX] VM: la segunda vez en la sesión salta directo, sin aviso');
    }
  }
  {
    const c = makeCtx('es');
    if (faltaFn(c, ['pzConectarConAviso'])) { t(false, 'B4 [FIX] VM: cancelar no salta, corre onCancel y el aviso no se repite'); }
    else {
      let saltos = 0, canceles = 0;
      c.ctx.pzConectarConAviso(() => { saltos++; }, () => { canceles++; });
      const ov = c.dom.document.getElementById('pzConectarAvisoOv');
      ov.querySelector('#pzAvisoNo').onclick();
      t(saltos === 0 && canceles === 1 && !c.dom.document.getElementById('pzConectarAvisoOv'),
        'B4a [FIX] VM: cancelar no salta, corre onCancel y cierra el aviso');
      c.ctx.pzConectarConAviso(() => { saltos++; });
      t(saltos === 1, 'B4b [FIX] VM: tras haberlo visto (aunque canceló), el próximo toque salta directo');
    }
  }
  // B5: el aviso en inglés
  {
    const c = makeCtx('en');
    if (faltaFn(c, ['pzConectarConAviso'])) { t(false, 'B5 [FIX] VM: el aviso en EN trae los 3 contenidos'); }
    else {
      c.ctx.pzConectarConAviso(() => {});
      const ov = c.dom.document.getElementById('pzConectarAvisoOv');
      t(!!ov && ov.innerHTML.includes('Before you connect') && ov.innerHTML.includes('log in to your Instagram account') && ov.innerHTML.includes('"Try another way"') && ov.innerHTML.includes('text-message code') && ov.innerHTML.includes('more than one business, pick yours') && ov.innerHTML.includes('Got it, connect'),
        'B5 [FIX] VM: el aviso en EN trae los 3 contenidos');
    }
  }
  // B6–B8: igConnect — URL exacta, marca de intento, aviso primero si no se vio
  {
    const c = makeCtx('es');
    if (faltaFn(c, ['igConnect', 'pzIgIntentoMarcar'])) { t(false, 'B6 [FIX] VM: igConnect salta a la URL de siempre y deja la marca de intento'); t(false, 'B7 [FIX] VM: igConnect con next conserva el next codificado'); t(false, 'B8 [FIX] VM: igConnect sin aviso visto no salta hasta confirmar'); }
    else {
      c.store.setItem('pz_ig_aviso_v1', '1');
      c.ctx.igConnect();
      t(c.loc.href === '/api/ig/go' && Number(c.store.getItem('pz_ig_intento_ts') || 0) > Date.now() - 5000,
        'B6 [FIX] VM: igConnect salta a /api/ig/go (la URL de siempre) y deja la marca de intento');
      c.ctx.igConnect('/#/app/ads');
      t(c.loc.href === '/api/ig/go?next=' + encodeURIComponent('/#/app/ads'),
        'B7 [FIX] VM: igConnect con next conserva el next codificado, como hoy');
      const c2 = makeCtx('es');
      c2.ctx.igConnect();
      const ovVisible = !!c2.dom.document.getElementById('pzConectarAvisoOv');
      t(ovVisible && c2.loc.href === '', 'B8a [FIX] VM: igConnect sin aviso visto NO salta hasta confirmar');
      c2.dom.document.getElementById('pzConectarAvisoOv').querySelector('#pzAvisoGo').onclick();
      t(c2.loc.href === '/api/ig/go', 'B8b [FIX] VM: al confirmar, igConnect salta a la misma URL');
    }
  }
  // B9: el wow — cancelar no deja marca; confirmar deja marca + URL del wow
  {
    const c = makeCtx('es');
    if (faltaFn(c, ['pzWowGo'])) { t(false, 'B9 [FIX] VM: el wow pasa por el aviso; cancelar no deja pz_wow_pending'); }
    else {
      c.ctx.pzWowGo();
      const ov = c.dom.document.getElementById('pzConectarAvisoOv');
      t(!!ov && c.loc.href === '', 'B9a [FIX] VM: el wow muestra el aviso antes de saltar');
      if (!ov) { t(false, 'B9b [FIX] VM: cancelar el aviso del wow no salta ni deja pz_wow_pending colgada'); t(false, 'B9c [FIX] VM: el wow confirmado salta a su URL de siempre (wow=1) y deja su marca'); }
      else {
        ov.querySelector('#pzAvisoNo').onclick();
        t(c.loc.href === '' && c.store.getItem('pz_wow_pending') === null,
          'B9b [FIX] VM: cancelar el aviso del wow no salta ni deja pz_wow_pending colgada');
        c.ctx.pzWowGo(); // ya visto: salta directo
        t(c.loc.href === '/api/ig/go?next=' + encodeURIComponent('/#/app/inicio') + '&wow=1' && c.store.getItem('pz_wow_pending') === '1',
          'B9c [FIX] VM: el wow confirmado salta a su URL de siempre (wow=1) y deja su marca');
      }
    }
  }
  // B10–B14: el rescate en sus capas
  {
    const c = makeCtx('es');
    if (faltaFn(c, ['renderIgResume', 'pzIgIntentoReciente'])) { t(false, 'B10 [FIX] VM: capa callback del rescate con la copia del código'); t(false, 'B11 [FIX] VM: capa de sesión discreta'); t(false, 'B12 [FIX] VM: negativas del rescate (sin intento / conectado)'); }
    else {
      // capa callback (ig_pending)
      c.ctx.PROFILE = { ig_connected: false, ig_pending: true };
      c.store.setItem('pz_ig_aviso_v1', '1'); // el reintento salta directo por igConnect
      c.ctx.renderIgResume();
      const b = c.dom.document.getElementById('igResumeBanner');
      t(!!b && b.innerHTML.includes('Suele pasar cuando Instagram pide un código') && b.innerHTML.includes('código por mensaje de texto') && !c.dom.document.getElementById('igRescueSesion'),
        'B10a [FIX] VM: con ig_pending aparece el banner con la copia del código (y no la capa de sesión)');
      c.ctx.renderIgResume();
      t(c.dom.body.children.filter((x) => x.id === 'igResumeBanner').length === 1,
        'B10b [INVARIANTE] VM: el banner de reanudar no se duplica entre renders');
      b.querySelector('#igResumeGo').onclick();
      t(c.loc.href === '/api/ig/go', 'B10c [FIX] VM: el reintento del banner pasa por igConnect (y su aviso)');
      // capa de sesión (intento sin marca del callback)
      const c2 = makeCtx('es');
      c2.ctx.PROFILE = { ig_connected: false, ig_pending: false };
      c2.store.setItem('pz_ig_intento_ts', String(Date.now()));
      c2.ctx.renderIgResume();
      const b2 = c2.dom.document.getElementById('igRescueSesion');
      t(!!b2 && b2.innerHTML.includes('¿No se completó la conexión?') && b2.innerHTML.includes('mensaje de texto') && !c2.dom.document.getElementById('igResumeBanner'),
        'B11a [FIX] VM: con intento de sesión y sin ig_pending aparece la línea discreta');
      b2.querySelector('#igRescueX').onclick();
      t(!c2.dom.document.getElementById('igRescueSesion') && c2.store.getItem('pz_ig_intento_ts') === null,
        'B11b [FIX] VM: descartar la línea discreta la saca y apaga la marca');
      c2.ctx.renderIgResume();
      t(!c2.dom.document.getElementById('igRescueSesion'), 'B11c [FIX] VM: tras el descarte, la línea no vuelve en la sesión');
      // negativas
      const c3 = makeCtx('es');
      c3.ctx.PROFILE = { ig_connected: false, ig_pending: false };
      c3.ctx.renderIgResume();
      t(!c3.dom.document.getElementById('igResumeBanner') && !c3.dom.document.getElementById('igRescueSesion'),
        'B12a [FIX] VM: quien nunca intentó no ve ningún rescate');
      const c4 = makeCtx('es');
      c4.ctx.PROFILE = { ig_connected: true, ig_pending: true };
      c4.store.setItem('pz_ig_intento_ts', String(Date.now()));
      c4.ctx.renderIgResume();
      t(!c4.dom.document.getElementById('igResumeBanner') && !c4.dom.document.getElementById('igRescueSesion') && c4.store.getItem('pz_ig_intento_ts') === null,
        'B12b [FIX] VM: quien ya conectó no ve rescate y la marca de intento se limpia');
      const c5 = makeCtx('es');
      c5.ctx.PROFILE = { ig_connected: false, ig_pending: false };
      c5.store.setItem('pz_ig_intento_ts', String(Date.now() - 3 * 60 * 60 * 1000));
      c5.ctx.renderIgResume();
      t(!c5.dom.document.getElementById('igRescueSesion'),
        'B12c [FIX] VM: un intento vencido (>2 h) no muestra la línea discreta');
    }
  }
  // B13–B14: los botones de Ads pasan por el aviso con su destino exacto
  {
    const c = makeCtx('es');
    if (faltaFn(c, ['pzAdsAutorizarPagina'])) { t(false, 'B13 [FIX] VM: el botón del tab Ads muestra el aviso y al cancelar restaura el botón'); }
    else {
      const btn = { disabled: false, textContent: 'Conectar mi cuenta publicitaria' };
      await c.ctx.pzAdsAutorizarPagina(btn);
      const ov = c.dom.document.getElementById('pzConectarAvisoOv');
      t(!!ov && c.loc.href === '' && btn.disabled === true,
        'B13a [FIX] VM: el botón del tab Ads muestra el aviso antes del login unificado (sin saltar)');
      if (!ov) {
        t(false, 'B13b [FIX] VM: cancelar el aviso restaura el botón del tab (habilitado y con su texto)');
        t(c.loc.href === 'https://meta.example/unified?x=1&next=' + encodeURIComponent('/#/app/ads'),
          'B13c [FIX] VM: con el aviso visto, el tab salta a connectUrl + next de Ads, como hoy');
      } else {
        ov.querySelector('#pzAvisoNo').onclick();
        t(btn.disabled === false && btn.textContent === 'Conectar mi cuenta publicitaria' && c.loc.href === '',
          'B13b [FIX] VM: cancelar el aviso restaura el botón del tab (habilitado y con su texto)');
        await c.ctx.pzAdsAutorizarPagina(btn); // ya visto: salta directo
        t(c.loc.href === 'https://meta.example/unified?x=1&next=' + encodeURIComponent('/#/app/ads'),
          'B13c [FIX] VM: con el aviso visto, el tab salta a connectUrl + next de Ads, como hoy');
      }
    }
  }
  {
    const c = makeCtx('es');
    if (faltaFn(c, ['pzBoostConectarCuenta'])) { t(false, 'B14 [FIX] VM: el botón de la hoja de Impulsar pasa por el aviso con su next'); }
    else {
      const btn = { disabled: false, textContent: 'Conectar mi cuenta publicitaria' };
      await c.ctx.pzBoostConectarCuenta(btn);
      const ov = c.dom.document.getElementById('pzConectarAvisoOv');
      t(!!ov && c.loc.href === '', 'B14a [FIX] VM: el botón de la hoja muestra el aviso antes del login unificado');
      if (!ov) { t(false, 'B14b [FIX] VM: al confirmar, la hoja salta a connectUrl + su next (la pantalla actual), como hoy'); }
      else {
        ov.querySelector('#pzAvisoGo').onclick();
        t(c.loc.href === 'https://meta.example/unified?x=1&next=' + encodeURIComponent('/#/app/inicio'),
          'B14b [FIX] VM: al confirmar, la hoja salta a connectUrl + su next (la pantalla actual), como hoy');
      }
    }
  }

  // ---------- C. Boot real ----------
  console.log('== C. Boot ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-conectar-aviso-'));
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, NODE_PATH: NM, OPENAI_API_KEY: 'sk-test-dummy' };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvErr = '';
  child.stderr.on('data', (d) => { srvErr += d; });
  const base = 'http://127.0.0.1:' + PORT;
  let version = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    try { const r = await fetch(base + '/api/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
    await new Promise((r) => setTimeout(r, 700));
  }
  t(!!version, 'C1 el servidor del árbol bootea y responde /api/version', srvErr.slice(-300));
  if (version) {
    t(version.build === '20261105-v1161', 'C2 [INVARIANTE] el build servido sigue siendo el de la base (v1161, sin estampar)', JSON.stringify(version).slice(0, 120));
    try {
      const r = await fetch(base + '/app.js?v=772');
      const js = await r.text();
      t(r.ok && js.includes('pzConectarConAviso') && js.includes('pzConectarAvisoOv') && js.includes('igRescueSesion') && js.includes('Try another way'),
        'C3 [FIX] el bundle servido trae el aviso previo y las dos capas del rescate');
    } catch (e) { t(false, 'C3 [FIX] el bundle servido trae el aviso previo y las dos capas del rescate', String(e)); }
  } else { t(false, 'C2 [INVARIANTE] el build servido sigue siendo el de la base'); t(false, 'C3 [FIX] el bundle servido trae el aviso previo'); }
  const pid = child.pid;
  try { process.kill(pid, 'SIGTERM'); } catch (e) {}
  await new Promise((r) => { child.on('exit', r); setTimeout(r, 5000); });
  let libre = false;
  try { await fetch(base + '/api/version', { signal: AbortSignal.timeout(1500) }); } catch (e) { libre = true; }
  t(libre, 'C4 el proceso del boot murió por su PID exacto (' + pid + ') y el puerto ' + PORT + ' quedó libre');
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

  console.log('\n== test-lote-conectar-aviso: ' + pass + ' ok / ' + fail + ' mal ==');
  if (fails.length) console.log('Fallas:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
