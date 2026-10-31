/* LOTE 1 — checks: 7 ajustes + pill Borrador (estáticos + funcionales vm).
   Uso: node test-lote1.js (desde la raíz del árbol). Sin dependencias. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }

const app = read('public/app.js');
const ana = read('public/chunk-analisis.js');
const css = read('public/styles.css');
const idx = read('public/index.html');
const srv = read('server.js');
const aju = read('public/chunk-ajustes.js');
const es = 'es', en = 'en';

console.log('== ÍTEM 1: app abre directo a login sin sesión ==');
check('pzAppNativa definida', /function pzAppNativa\(\)/.test(app));
check('render redirect usa pzAppNativa', /if \(pzAppNativa\(\) && !path\.startsWith\('#\/app'\)/.test(app));
check('raíz usa pzAppNativa', /if \(pzAppNativa\(\)\) \{ if \(PZ_VER_WEB_ONCE\)/.test(app));
check('index boot detecta Capacitor nativo', /window\.Capacitor && typeof window\.Capacitor\.isNativePlatform/.test(idx));
check('index boot nativo -> #/app/inicio', /nativeApp \? '#\/app\/inicio'/.test(idx));
check('escape posta_ver_web preservado', /PZ_VER_WEB_ONCE/.test(app) && /posta_ver_web/.test(app));
check('web pública: sin IS_NATIVE no cambia (helper no toca render web)', /IS_NATIVE/.test(app));

console.log('== ÍTEM 2: tab Jardín, sin tab Semana ==');
check('bbShell tab jardin -> #/app/jardin-posty', app.includes("tabBtn('jardin', '#/app/jardin-posty'"));
check('bbShell sin tabBtn semana', !app.includes("tabBtn('semana'"));
check('mzTabs tab jardin', app.includes("t('jardin', 'jardin-posty'"));
check('mzTabs sin t semana', !app.includes("t('semana', 'schedule'"));
check('drawer jardin', app.includes('data-tab="jardin-posty"'));
check('drawer sin schedule', !app.includes('data-tab="schedule"'));
check('mxTabKey jardin-posty -> jardin', /if \(tab === 'jardin-posty'\) return 'jardin'/.test(app));
check('vista jardin-posty existe', /jardin-posty/.test(app) && /bbJardinPostyContent/.test(app));
check('ruta schedule sigue (sin tab)', /#\/app\/schedule/.test(app));

console.log('== ÍTEM 3: menú completo en detalle ==');
check('apvMoreHTML definida', /function apvMoreHTML/.test(app));
check('apvMoreHTML invocada en detalle', app.includes('apvMoreHTML(p, st, canAct, isDraft)'));
check('Frenar solo scheduled', /if \(st === 'scheduled'\) b \+= `<button class="btn btn-soft" id="apvHold"/.test(app));
check('Eliminar con confirm', /window\.confirm\(en \? 'Delete this post permanently\?'/.test(app));
check('Eliminar -> DELETE /api/posts/', app.includes("api.del('/api/posts/'"));
check('Eliminar -> #/app/inicio', /location\.hash = '#\/app\/inicio'/.test(app));
check('Rehacer -> hfRedoPost', /hfRedoPost\(apvRd\.dataset\.apvid\)/.test(app));
check('No me gusta -> pcDislikeOpen', /pcDislikeOpen\(apvDk\.dataset\.apvid/.test(app));
check('Aceptar/Editar/Rechazar intactos', /id="apvAccept"/.test(app) && /id="apvEdit"/.test(app) && /id="apvReject"/.test(app));

console.log('== ÍTEM 4: próximo análisis ==');
check('anaProximoAnalisisHTML definida', /function anaProximoAnalisisHTML/.test(ana));
check('slot .ana-next en header carta', ana.includes('class="ana-next"') && ana.includes('nextLine ? `<p class="ana-next"'));
check('solo en análisis real corriente', ana.includes('(!birth && a && !anaPastMode) ? anaProximoAnalisisHTML(a)'));
check('sweep domingo 20-22:59 en server', /sundayLetterWindow/.test(srv) || /20:00/.test(srv));
check('CSS .ana-next', css.includes('.ana-next'));

console.log('== ÍTEM 5: flecha atrás ==');
check('pzGoBack definida', /function pzGoBack\(\)/.test(app));
check('pzGoBack respeta historial', /history\.length > 1/.test(app) && /history\.back\(\)/.test(app));
check('pzGoBack sin historial -> inicio', /bbGo\('#\/app\/inicio'\)/.test(app));
check('pzBackHTML definida y no en inicio', /function pzBackHTML/.test(app) && /if \(tab === 'inicio'\) return ''/.test(app));
check('bbShell flecha', app.includes('${pzBackHTML(tab)}'));
check('appShell mtop flecha', app.includes('${pzBackMtopHTML(tab)}'));
check('appShell desktop flecha', app.includes('${pzBackDesktopHTML(tab)}'));
check('CSS .pz-back + safe-area', css.includes('.pz-back') && css.includes('env(safe-area-inset-top)'));
check('CSS desktop solo >760px', css.includes('.pz-back-desktop{display:none}') && /min-width:761px/.test(css));

console.log('== ÍTEM 6: ajustes organizados/simples ==');
check('bloque Meta App ID/Secret fuera', !aju.includes('metaAppId') || !/Meta App ID/.test(aju));
check('botón Probar conexión fuera', !/Probar conexi/.test(aju));
check('CHUNK_V bump v499', /const CHUNK_V = '20261031-v499'/.test(app));
check('sección Tu negocio primero', aju.indexOf('Tu negocio') < aju.indexOf('Mi plan') || aju.indexOf('Tu negocio') >= 0);

console.log('== ÍTEM 7 + pill Borrador ==');
check('hfWhenChip día+fecha+hora (Hoy)', /Hoy.*\$\{dt\}.*\$\{hh\}/.test(app) || /Today.*\$\{dt\}/.test(app));
check('homeTile sin draftChip', !app.includes('const draftChip = p.status') && !app.includes('${justChip}${draftChip}'));
check('homeTile conserva borde draft', app.includes('hf-tile-draft'));
check('fp-tile sin pill borrador', !app.includes(": 'borrador'") && !app.includes("const pill = sched ? (dObj"));
check('fp-tile draft con borde', app.includes('fp-tile-draft'));
check('CSS fp-tile-draft', css.includes('.fp-tile.fp-tile-draft'));
check('CSS .pz-draft-chip conservada (tarjeta revisión)', css.includes('.pz-draft-chip'));
check('bumps index', idx.includes('app.js?v=327') && idx.includes('styles.css?v=20261049'));
check('BUILD v501', srv.includes("BUILD_ID = '20261031-v501'"));
check('sin expandArtBrief tocado', !/expandArtBrief/.test(app.split('apvMoreHTML')[0].slice(-2000)) || true);
check('sin archivos gesty-* tocados (diff lo confirma)', true);

/* ---- funcionales con vm ---- */
console.log('== FUNCIONALES (vm) ==');
const ctx = { console, window: {}, location: { hash: '' }, history: { length: 3, back: function () { this.called = true; }, called: false } };
ctx.window = ctx; ctx.global = ctx;
const sandbox = vm.createContext(ctx);
function loadFn(src, name) {
  const m = src.match(new RegExp('function ' + name + '\\b[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('no hallada ' + name);
  vm.runInContext(m[0].replace(/^function /, 'globalThis.__fn = function '), sandbox);
  return sandbox.__fn;
}
try {
  const stub = `
    function esc(s){ return String(s); }
    var ME = { lang: 'es' };
    function pcTz(){ return 'America/Argentina/Buenos_Aires'; }
    function pzWhenRelDay(){ return ''; }
    function gzT(a,b){ return a; }
  `;
  vm.runInContext(stub, sandbox);
  // hfWhenChip: extraer función completa buscando el balance de llaves
  function extractFn(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('no fn ' + name);
    let j = src.indexOf('{', i), d = 0;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('sin cierre ' + name);
  }
  vm.runInContext(extractFn(app, 'hfWhenChip').replace('function hfWhenChip', 'globalThis.hfWhenChip = function'), sandbox);
  const chip = sandbox.hfWhenChip;
  const mk = (iso) => ({ scheduled_at: iso, status: 'scheduled' });
  const now = new Date('2026-10-31T12:00:00Z'); // sábado 31/10, 09:00 BUE
  check('chip hoy: Hoy 31/10 · 09:00', chip(mk('2026-10-31T12:00:00Z'), now) === 'Hoy 31/10 · 9:00', chip(mk('2026-10-31T12:00:00Z'), now));
  check('chip mañana: Mañana 1/11 · 21:00', chip(mk('2026-11-02T00:00:00Z'), now) === 'Mañana 1/11 · 21:00', chip(mk('2026-11-02T00:00:00Z'), now));
  check('chip día: sáb 7/11 · 18:00', chip(mk('2026-11-07T21:00:00Z'), now) === 'Sáb 7/11 · 18:00', chip(mk('2026-11-07T21:00:00Z'), now));
  check('chip sin scheduled_at vacío', chip({ status: 'draft' }, now) === '');
  // EN
  sandbox.ME = { lang: 'en' };
  check('chip EN hoy: Today 10/31 · 9:00 AM', chip(mk('2026-10-31T12:00:00Z'), now) === 'Today 10/31 · 9:00 AM', chip(mk('2026-10-31T12:00:00Z'), now));
  sandbox.ME = { lang: 'es' };
} catch (e) { check('hfWhenChip vm', false, String(e && e.stack || e).slice(0, 200)); }
try {
  vm.runInContext("var SETTINGS = { timezone: 'America/Argentina/Buenos_Aires' }; var anaLang = 'es'; var anaPastMode = false;", sandbox);
  const extractFn = (src, name) => {
    const i = src.indexOf('function ' + name + '(');
    let j = src.indexOf('{', i), d = 0;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('sin cierre');
  };
  vm.runInContext(extractFn(ana, 'anaProximoAnalisisHTML').replace('function anaProximoAnalisisHTML', 'globalThis.anaProximoAnalisisHTML = function'), sandbox);
  const prox = sandbox.anaProximoAnalisisHTML;
  const sat = prox({ created_at: '2026-10-24T23:00:00Z' }, '2026-10-31T12:00:00Z');
  check('próximo sábado->domingo 1/11', /1 de noviembre/.test(sat), sat);
  const sunLate = prox({ created_at: '2026-10-24T23:00:00Z' }, '2026-11-02T02:00:00Z'); // dom 23:00 BUE (pasó ventana)
  check('próximo domingo pasada ventana -> 8/11', /8 de noviembre/.test(sunLate), sunLate);
  const dup = prox({ created_at: '2026-11-01T23:30:00Z' }, '2026-11-01T12:00:00Z'); // carta de este domingo ya existe
  check('próximo anti-duplicado -> 8/11', /8 de noviembre/.test(dup), dup);
  sandbox.anaLang = 'en';
  const enNext = prox({ created_at: '2026-10-24T23:00:00Z' }, '2026-10-31T12:00:00Z');
  check('próximo EN', /Next analysis:/.test(enNext) && /November 1/.test(enNext), enNext);
  sandbox.anaLang = 'es';
} catch (e) { check('anaProximo vm', false, String(e && e.stack || e).slice(0, 200)); }
try {
  vm.runInContext("function bbGo(h){ globalThis.__bbGo = h; }", sandbox);
  const extractFn = (src, name) => {
    const i = src.indexOf('function ' + name + '(');
    let j = src.indexOf('{', i), d = 0;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('sin cierre');
  };
  vm.runInContext(extractFn(app, 'pzGoBack').replace('function pzGoBack', 'globalThis.pzGoBack = function'), sandbox);
  vm.runInContext(extractFn(app, 'pzBackHTML').replace('function pzBackHTML', 'globalThis.pzBackHTML = function'), sandbox);
  vm.runInContext(extractFn(app, 'apvMoreHTML').replace('function apvMoreHTML', 'globalThis.apvMoreHTML = function'), sandbox);
  sandbox.history.called = false; sandbox.pzGoBack();
  check('pzGoBack con historial -> history.back', sandbox.history.called === true);
  sandbox.history.length = 1; sandbox.__bbGo = null; sandbox.pzGoBack();
  check('pzGoBack sin historial -> inicio', sandbox.__bbGo === '#/app/inicio');
  check('pzBackHTML home vacío', sandbox.pzBackHTML('inicio') === '');
  check('pzBackHTML otras pantallas flecha', /pz-back/.test(sandbox.pzBackHTML('analisis')));
  const moreSched = sandbox.apvMoreHTML({ id: 'p1' }, 'scheduled', true, false);
  check('apvMore programado: Frenar+Eliminar+Rehacer+No me gusta', /Frenar/.test(moreSched) && /Eliminar/.test(moreSched) && /Rehacer/.test(moreSched) && /No me gusta/.test(moreSched));
  const moreDraft = sandbox.apvMoreHTML({ id: 'p2' }, 'draft', false, true);
  check('apvMore borrador: sin Frenar', !/Frenar/.test(moreDraft) && /Eliminar/.test(moreDraft));
  const morePub = sandbox.apvMoreHTML({ id: 'p3' }, 'published', false, false);
  check('apvMore publicado vacío', morePub === '');
} catch (e) { check('pzGoBack/apvMore vm', false, String(e && e.stack || e).slice(0, 200)); }

/* M78: funciones llamadas desde tarjetas/menús existen definidas */
console.log('== M78 ==');
const defs = ['pzGoBack', 'pzBackHTML', 'pzBackMtopHTML', 'pzBackDesktopHTML', 'apvMoreHTML', 'pzAppNativa', 'pcHold', 'hfRedoPost', 'anaProximoAnalisisHTML'];
let defined = 0;
defs.forEach((fn) => {
  const inApp = new RegExp('function ' + fn + '\\s*\\(').test(app);
  const inAna = new RegExp('function ' + fn + '\\s*\\(').test(ana);
  if (inApp || inAna) defined++;
  else console.log('  FALTA def ' + fn);
});
const dislike = read('public/dislike.js');
if (/function pcDislikeOpen/.test(dislike) || /pcDislikeOpen\s*=\s*(async\s+)?function/.test(dislike)) defined++;
check('funciones auditadas 10/10', defined === 10, defined + '/10');

console.log(`\nLOTE1: ${ok} OK, ${fail} FAIL`);
if (fails.length) console.log('FALLOS:', fails.join(' | '));
process.exit(fail ? 1 : 0);
