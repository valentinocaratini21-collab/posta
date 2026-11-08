// test-lote-subir-foto-directa.js — LOTE SUBIR-FOTO-DIRECTA + ÍCONO-ENVIAR (base v785).
// Reportado por Valentino 7/11 22:23 con video (flujo «Subir foto» del chat):
// (1) al tocar «Subir foto» no va directo a la galería: iOS muestra el menú
// del sistema (Photo Library / Take Photo or Video / Choose Files) y hay que
// tocar «Photo Library». Causa: #chatFile tenía accept combinado
// (image/*,video/*) y ningún camino de foto fijaba accept antes del click.
// iOS Safari, al ver foto Y video, muestra ese menú en vez de abrir la
// galería. El camino de video SÍ fijaba 'video/*' (y nunca lo restauraba:
// tras subir un video, un «Subir foto» posterior abriría el picker de
// video — bug latente, se corrige acá). Fix: accept EXPLÍCITO en cada
// disparo — 'image/*' en los 3 caminos de foto (dock +, camarita del
// composer, fallback del detalle) y 'video/*' en el de video. El atributo
// estático del input NO cambia (sigue image/*,video/* con multiple: el
// markup acepta ambos; lo que cambia es el accept efectivo en cada
// disparo — así la suite vecina subir-10-fotos D8 sigue válida).
// (2) Con fotos elegidas, el botón de enviar era un círculo celeste sólido
// sin ícono. Causa: chatUpdateSendBtn pone pzIc('send') (stroke celeste
// fijo #2793C8) dentro de .btn-primary (fondo celeste). Celeste sobre
// celeste = invisible. Fix: regla CSS con stroke blanco para los svg de
// pzIc dentro de los botones celestes (el CSS manda sobre el atributo de
// presentación), mismo patrón que ya tenían .hf-ask-send y .apv-accept.
// La auditoría encontró el mismo bug en otros 5 botones celestes con
// ícono (igmock-accept, igmock-accept-fixed, accept-pill, ag-upload-btn,
// pcard-approve, pcard-accept): la misma regla los cubre a todos.
// NO se toca: la lógica mic/enviar ni los estados de voz (VOICE_STATE),
// el layout del composer, el flujo del Álbum (#albumFile/#mediaFiles),
// ni chatUploadPhotos (sigue ruteando por tipo de archivo, no por accept).
// El cambio de accept NO se reproduce en navegador de escritorio: se
// verifica por código + vm (accept fijado ANTES del click, en orden) y el
// render (render-subir-foto-directa.py) verifica el ícono blanco en
// navegador real a 390px ES+EN.
// Uso: node test-lote-subir-foto-directa.js [dir-del-arbol] — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TREE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const DIR = TREE;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 500) : ''}`); }
}

const appSrc = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(DIR, 'public', 'styles.css'), 'utf8');

function sliceFn(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('no se encontró: ' + startMarker);
  const j = endMarker ? src.indexOf(endMarker, i + startMarker.length) : src.length;
  if (j < 0) throw new Error('no se encontró fin: ' + endMarker);
  return src.slice(i, j);
}

// ---------- Utilidades vm ----------
class FakeEl {
  constructor(sel) {
    this.sel = sel;
    this._accept = '';
    this.ops = [];
    this.value = '';
    this.files = [];
    this.onclick = null;
    this.onchange = null;
  }
  set accept(v) { this._accept = String(v); this.ops.push('accept=' + v); }
  get accept() { return this._accept; }
  click() { this.ops.push('click'); }
  focus() {}
  closest(sel) { return null; }
  querySelector(sel) { return null; }
  querySelectorAll() { return []; }
}

function buildSandbox(extraEls) {
  const els = extraEls || {};
  const timers = [];
  const getEl = (id) => {
    if (!els['#' + id]) els['#' + id] = new FakeEl('#' + id);
    return els['#' + id];
  };
  const sandbox = {
    console,
    document: {
      getElementById: (id) => getEl(id),
      querySelector: (sel) => (sel === '#chatFile' ? getEl('chatFile') : null),
      querySelectorAll: () => [],
      addEventListener: (type, fn) => { sandbox._listeners[type] = fn; },
    },
    window: {},
    setInterval: (fn) => { const id = timers.length + 1; timers.push({ id, fn, cleared: false }); return id; },
    clearInterval: (id) => { const t = timers.find((x) => x.id === id); if (t) t.cleared = true; },
    setTimeout: () => 0,
    chatSay: () => {},
    pzSftT: (es) => es,
    pzDockMasClose: () => {},
    pzPcRedo: () => {},
    pzPcReschedSheet: () => {},
    pzPostChatIsEn: () => false,
    HF_CHAT_ANCHOR: {},
    pzPcSendAnchored: () => { sandbox._anchored = true; },
    _listeners: {},
    _timers: timers,
    _els: els,
    _anchored: false,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}
function runTimers(sb) {
  // Dispara una vez cada intervalo pendiente (como si pasaran 150ms).
  for (const t of sb._timers) { if (!t.cleared) t.fn(); }
}

// ---------- Parte A: accept explícito ANTES del click, en vm ----------
function parteA() {
  console.log('— A) accept explícito antes del click (vm, orden real) —');
  const abrirSrc = sliceFn(appSrc, 'function pzSftChatAbrirYEnfocar() {', '/* Entrada del dock + y de cualquier picker');
  const fotoSrc = sliceFn(appSrc, 'function pzSftFotoAlChat() {', 'function pzSftMzPlus()');
  const videoSrc = sliceFn(appSrc, 'function pzDockMasVideo() {', '\nfunction appShell(');
  const chipSrc = sliceFn(appSrc, 'function pzPcChipAction(kind) {', 'function pzPcSendAnchored(text) {');
  const delegarSrc = sliceFn(appSrc, '(function chatPhotoDelegar() {', '})();') + '})();';

  // A1: camino foto del dock (+) → image/* ANTES del click.
  {
    const sb = buildSandbox();
    vm.runInContext(abrirSrc + '\n' + fotoSrc, sb);
    vm.runInContext('pzSftFotoAlChat()', sb);
    runTimers(sb);
    const cf = sb._els['#chatFile'];
    check('A1 pzSftFotoAlChat fija image/* ANTES del click', cf && cf.ops.join(',') === 'accept=image/*,click', JSON.stringify(cf ? cf.ops : null));
  }
  // A2: camino video del dock (+) → video/* ANTES del click.
  {
    const sb = buildSandbox();
    vm.runInContext(abrirSrc + '\n' + videoSrc, sb);
    vm.runInContext('pzDockMasVideo()', sb);
    runTimers(sb);
    const cf = sb._els['#chatFile'];
    check('A2 pzDockMasVideo fija video/* ANTES del click', cf && cf.ops.join(',') === 'accept=video/*,click', JSON.stringify(cf ? cf.ops : null));
  }
  // A3: bug latente — tras un video, una foto posterior vuelve a image/*.
  {
    const sb = buildSandbox();
    vm.runInContext(abrirSrc + '\n' + fotoSrc + '\n' + videoSrc, sb);
    vm.runInContext('pzDockMasVideo()', sb);
    runTimers(sb);
    const cf = sb._els['#chatFile'];
    cf.ops = [];
    vm.runInContext('pzSftFotoAlChat()', sb);
    runTimers(sb);
    check('A3 tras subir un video, «Subir foto» vuelve a image/* (no queda en video)', cf.accept === 'image/*' && cf.ops.join(',') === 'accept=image/*,click', JSON.stringify(cf.ops));
  }
  // A4: la camarita del composer (#chatPhotoBtn, delegado) → image/*.
  {
    const sb = buildSandbox();
    vm.runInContext(delegarSrc, sb);
    const btn = new FakeEl('#chatPhotoBtn');
    btn.closest = (sel) => (sel === '#chatPhotoBtn' ? btn : null);
    const ev = { target: btn };
    sb._listeners.click(ev);
    const picker = sb._els['#chatFile'];
    check('A4 click en #chatPhotoBtn fija image/* ANTES del click', picker && picker.ops.join(',') === 'accept=image/*,click', JSON.stringify(picker ? picker.ops : null));
  }
  // A5: fallback del detalle (sin #chatPhotoBtn) → image/*.
  {
    const sb = buildSandbox();
    // Sin chatCard ni chatPhotoBtn: getElementById devuelve FakeEl por
    // defecto, así que se fuerzan a null para tomar la rama fallback.
    sb.document.getElementById = (id) => {
      if (id === 'chatCard' || id === 'chatPhotoBtn') return null;
      return sb._els['#' + id] || (sb._els['#' + id] = new FakeEl('#' + id));
    };
    vm.runInContext(chipSrc, sb);
    vm.runInContext("pzPcChipAction('photo')", sb);
    const fl = sb._els['#chatFile'];
    check('A5 fallback del detalle fija image/* ANTES del click', fl && fl.ops.join(',') === 'accept=image/*,click', JSON.stringify(fl ? fl.ops : null));
  }
}

// ---------- Parte B: estáticos ----------
function parteB() {
  console.log('— B) estáticos: input, CSS, lógica intacta —');
  const chatFileTag = (appSrc.match(/<input[^>]*id="chatFile"[^>]*>/) || [''])[0];
  check('B1 el input #chatFile SIGUE con multiple + accept image/*,video/* (el markup acepta ambos; el accept por camino se fija en JS antes de cada click)', chatFileTag.includes('accept="image/*,video/*"') && chatFileTag.includes('multiple'), chatFileTag);
  const whiteRule = cssSrc.match(/([^{}]*\.btn-primary \.pz-ic svg[^{}]*)\{\s*stroke\s*:\s*#fff\s*\}/);
  check('B2 la regla CSS pone stroke blanco en .btn-primary .pz-ic svg', !!whiteRule);
  for (const cls of ['igmock-accept', 'igmock-accept-fixed', 'accept-pill', 'ag-upload-btn', 'pcard-approve', 'pcard-accept']) {
    check(`B2b la regla cubre .${cls} (mismo bug, auditoría)`, !!whiteRule && whiteRule[1].includes('.' + cls + ' .pz-ic svg'));
  }
  check('B3 chatUpdateSendBtn sigue: send + btn-primary + title Enviar', /b\.innerHTML = pzIc\('send', 16\); b\.className = 'btn btn-primary'; b\.title = 'Enviar'/.test(appSrc));
  check('B4 #obSend sigue btn-primary + pzIc(send)', /id="obSend"[^>]*>\$\{pzIc\('send', 16\)\}/.test(appSrc) || /class="btn btn-primary" id="obSend"[^>]*>\$\{pzIc\('send', 16\)\}/.test(appSrc));
  check('B5a .hf-ask-send ya tenía su regla blanca (sigue)', /\.hf-ask-send\s+\.pz-ic\s+svg\s*\{\s*stroke\s*:\s*#fff\s*\}/.test(cssSrc));
  check('B5b .apv-accept ya tenía su regla blanca (sigue)', /\.apv-accept\s+\.pz-ic\s+svg\s*\{\s*stroke\s*:\s*#fff\s*\}/.test(cssSrc));
  check('B6 pzIc sigue dibujando en celeste fijo por defecto (mic en btn-soft intacto)', /stroke=\\?"' \+ PZ_IC_CEL \+ '"/.test(appSrc) || appSrc.includes("stroke=\"' + PZ_IC_CEL + '\""));
  check('B7 chatUploadPhotos sigue ruteando por tipo (foto→/api/media?from=chat, video→/api/assets?kind=video)', /isVid \? '\/api\/assets\?kind=video' : '\/api\/media\?from=chat'/.test(appSrc));
  // B8: auditoría de llamadores — cada click sobre #chatFile fija accept antes.
  // (LOTE REDISEÑO R1 · 8/11) La hoja «Subir foto o video» de Hoy suma UN
  // click más (pzHoySubirPicker → cf.click()): 4→5. El sitio nuevo fija el
  // accept ANTES del click (cf.accept = accept, parámetro: 'image/*' en
  // Cámara, 'image/*,video/*' en Galería) — el regex de B8b no lo ve porque
  // el accept es parámetro, no literal; la regla se cumple igual.
  const clickSites = (appSrc.match(/(cf|picker|fl)\.click\(\)/g) || []).length;
  check('B8a hay 7 clicks sobre el input del chat (foto dock, video dock, camarita, fallback + hoja Hoy R1 + video R6 + subir-foto Cambialo)', clickSites === 7, 'clicks=' + clickSites);
  const imgSets = (appSrc.match(/(cf|picker|fl)\.accept = 'image\/\*'/g) || []).length;
  const vidSets = (appSrc.match(/(cf|picker)\.accept = 'video\/\*'/g) || []).length;
  check('B8b 4 sitios fijan image/* y 2 fijan video/*', imgSets === 4 && vidSets === 2, `image=${imgSets} video=${vidSets}`);
  const getFile = (appSrc.match(/getElementById\(["']chatFile["']\)/g) || []).length;
  const queryFile = (appSrc.match(/querySelector\(['"]#chatFile['"]\)/g) || []).length;
  check('B8c llamadores de #chatFile (7 getElementById + 2 querySelector; +2 R6: video y subir-foto Cambialo)', getFile === 7 && queryFile === 2, `get=${getFile} query=${queryFile}`);
  const albumTag = (appSrc.match(/<input[^>]*id="albumFile"[^>]*>/) || [''])[0];
  check('B9 el flujo del Álbum (#albumFile) NO se tocó (sigue image/*,video/*)', albumTag.includes('accept="image/*,video/*"'), albumTag);
}

// ---------- Parte C: auditoría de funciones ----------
function parteC() {
  console.log('— C) auditoría de funciones llamadas desde las superficies tocadas —');
  const fns = ['pzSftFotoAlChat', 'pzSftChatAbrirYEnfocar', 'pzDockMasFoto', 'pzDockMasVideo', 'pzDockMasClose', 'chatPhotoDelegar', 'pzPcChipAction', 'pzPcSendAnchored', 'chatUpdateSendBtn', 'chatSend', 'pzIc', 'chatUploadPhotos'];
  for (const fn of fns) {
    const defined = new RegExp('(function ' + fn + '\\s*\\(|\\(function ' + fn + '\\s*\\()').test(appSrc);
    check(`C ${fn} existe definida`, defined);
  }
  check("C el ícono 'send' existe en el mapa (paper-plane, 2 paths)", appSrc.includes('send: \'<path d="M22 2'));
  check('C PZ_IC_CEL es el celeste de marca #2793C8', /const PZ_IC_CEL = '#2793C8'/.test(appSrc));
}

parteA();
parteB();
parteC();
console.log(`\nSUBIR-FOTO-DIRECTA: ${pass} ok / ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
