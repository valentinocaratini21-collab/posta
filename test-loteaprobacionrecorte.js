// test-loteaprobacionrecorte.js — LOTE APROBACIÓN-RECORTE + CHAT-SIN-ZOOM
// Decisión Valentino 2/11 ~14:11 (reporte con captura):
//  · En la aprobación (#/app/post/:id, approvalPostView) el menú •••
//    abierto era una pared de botones. Salen SOLO dos entradas:
//    «Hablar de este posteo» (duplica el mini-chat al pie) y
//    «No me gusta» (se pisa con Rechazar).
//  · Al tocar para escribir en el chat, iOS agrandaba la pantalla y no
//    dejaba escribir: .hf-ask-input tenía 13.5px < 16px (zoom automático
//    de iOS) y los cierres no soltaban el foco.
// Fix:
//  · Menú •••: quedan Editar, Rechazar, Frenar (solo programados),
//    Eliminar, Rehacer, en ese orden. Aceptar fijo al pie y mini-chat
//    intactos. Handlers NO borrados (pzHablarClick y pcDislikeOpen
//    siguen vivos en otros caminos; los bindings guardados quedan no-op).
//  · Zoom: se reutiliza EXACTAMENTE el parche de salir-sin-zoom
//    (pzBlurActivo en los 3 cierres + .hf-ask-input y .hf-ed-field a
//    16px), texto idéntico, para que la liberación de cualquiera de los
//    dos lotes haga SKIP en el otro. Meta viewport NO se toca.
//  · La página pública /aprobar/:token NO comparte apvMoreHTML (único
//    llamador: approvalPostView) y NO se toca.
// Uso: node test-loteaprobacionrecorte.js [dir]  (dir = raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const fnBody = (src, name) => {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  let d = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(start, i + 1); } }
  return '';
};
const menu = fnBody(app, 'apvMoreHTML');

console.log('— 1. Menú ••• recortado: 5 opciones, en orden, sin pisarse —');
ok(menu.length > 0, 'apvMoreHTML extraíble');
ok(!menu.includes('id="apvTalk"'), 'sin botón Hablar (apvTalk) en el menú');
ok(!menu.includes('id="apvDislike"'), 'sin botón No me gusta (apvDislike) en el menú');
ok(cnt(menu, 'apv-sec-btn') === 5, 'exactamente 5 botones secundarios en el menú', cnt(menu, 'apv-sec-btn'));
const ord = ['id="apvEdit"', 'id="apvReject"', 'id="apvHold"', 'id="apvDelete"', 'id="apvRedo"'].map((id) => menu.indexOf(id));
ok(ord.every((i) => i >= 0) && ord.slice().sort((a, b) => a - b).join() === ord.join(), 'orden: Editar, Rechazar, Frenar, Eliminar, Rehacer', ord.join(','));
ok(/st === 'scheduled'\) b \+= `<button class="apv-sec-btn" id="apvHold"/.test(menu), 'Frenar solo en programados (condición st === scheduled)');
ok(menu.includes('apvChangePub') && menu.includes('Pedir un cambio'), 'rama publicados intacta (Ver en Instagram + Pedir un cambio)');
ok(app.includes('apvMoreHTML(p, st, canAct, isDraft, editPrompt)'), 'approvalPostView sigue llamando apvMoreHTML');
ok(app.includes('hfAskChangeBtnHTML(p)'), 'mini-chat al pie intacto como único camino de hablar');
ok(app.includes("getElementById('apvAccept')") || app.includes('apvAccept'), 'Aceptar (fijo al pie) intacto');

console.log('— 2. Zoom: letra ≥16px en el camino, viewport intacto —');
ok(/\.hf-ask-input\{[^}]*font-size:16px/.test(css), '.hf-ask-input a 16px');
ok(!/\.hf-ask-input\{[^}]*font-size:13\.5px/.test(css), '.hf-ask-input ya no tiene 13.5px');
ok(/\.hf-ed-field input\[type="text"\],\.hf-ed-field textarea\{[^}]*font-size:16px/.test(css), '.hf-ed-field a 16px');
ok(/\.chat-input-row \.in\{[^}]*font-size:17px/.test(css), 'chat principal escritorio 17px intacto');
ok(/\.chat-input-row \.in\{[^}]*font-size:16px/.test(css), 'chat principal móvil 16px intacto');
ok(!idx.includes('user-scalable=no') && idx.includes('width=device-width, initial-scale=1'), 'meta viewport ES intacto, sin user-scalable=no');
ok(!idxEn.includes('user-scalable=no') && idxEn.includes('width=device-width, initial-scale=1'), 'meta viewport EN intacto, sin user-scalable=no');
// Inventario <16px: solo .bb-* (ruta Bandeja, fuera del alcance, documentado)
// y selectores muertos (.f3-input, .rev-dt, sin uso en app.js ni chunks).
const small = [];
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = ruleRe.exec(cssNoComments)) !== null) {
  const fz = /font-size:(1[0-5](?:\.\d+)?)px/.exec(m[2]);
  if (fz && /(input|textarea|\.rev-dt|\.f3-input)/.test(m[1])) small.push(m[1].trim() + ' → ' + fz[1] + 'px');
}
const smallLive = small.filter((s) => !/\.bb-/.test(s) && !/\.f3-input/.test(s) && !/\.rev-dt/.test(s));
ok(smallLive.length === 0, 'ningún campo vivo del camino <16px (salvo .bb-* documentado)', small.join(' | '));
ok(cnt(app, 'class="f3-input"') === 0 && cnt(app, 'rev-dt"') === 0, '.f3-input y .rev-dt sin uso (selectores muertos, no se tocan)');

console.log('— 3. Blur ANTES de retirar/ocultar, en los 3 cierres —');
ok(cnt(app, 'function pzBlurActivo(') === 1, 'pzBlurActivo definido una sola vez');
ok(cnt(app, 'pzBlurActivo()') === 4, 'pzBlurActivo: 1 definición + 3 llamadas');
const mz = fnBody(app, 'mzCloseSheet');
ok(mz.indexOf('pzBlurActivo()') >= 0 && mz.indexOf('pzBlurActivo()') < mz.indexOf('sh.hidden'), 'mzCloseSheet: blur antes de ocultar');
const scf = fnBody(app, 'scfClosePop');
ok(scf.indexOf('pzBlurActivo()') >= 0 && scf.indexOf('pzBlurActivo()') < scf.indexOf('pop.remove()'), 'scfClosePop: blur antes de retirar el nodo');
const hfd = fnBody(app, 'hfDetailClose');
ok(hfd.indexOf('pzBlurActivo()') >= 0 && hfd.indexOf('pzBlurActivo()') < hfd.indexOf('ov.remove()'), 'hfDetailClose: blur antes de retirar el overlay');

console.log('— 4. Handlers vivos (M78): nada borrado que otro camino use —');
ok(cnt(app, 'function pzHablarClick(') === 1, 'pzHablarClick definido');
ok(app.includes('pzHablarClick(apvChangePub.dataset.apvid)') && app.includes('pzHablarClick(b.dataset.hfChat)'), 'pzHablarClick sigue llamado (publicados + tiles)');
ok(cnt(app, 'function pcDislikeOpen(') === 1 || app.includes('pcDislikeOpen ='), 'pcDislikeOpen definido');
ok(app.includes("data-revdislike") && app.includes("act === 'det-dislike'"), 'pcDislikeOpen sigue llamado (mini revisión + delegado det-dislike)');
ok(app.includes("if (tk) tk.onclick") && app.includes("if (apvDk) apvDk.onclick"), 'bindings apvTalk/apvDislike guardados (no-op sin el botón)');
ok(cnt(app, 'function pzApvMenuToggle(') === 1 && app.includes('pzApvMenuToggle()'), 'pzApvMenuToggle definido y llamado (botón •••)');
ok(app.includes('function pcHold(') && app.includes('function hfRedoPost('), 'pcHold y hfRedoPost definidos (Frenar y Rehacer del menú)');

console.log('— 5. Censo, server intacto, vm —');
ok(!srv.includes('APROBACIÓN-RECORTE') && !srv.includes('SALIR-SIN-ZOOM'), 'server.js sin tocar');
ok(cnt(srv, 'catsMatch') === 3 && cnt(srv, 'week-redo') === 16 && cnt(srv, 'first_week') === 3 && cnt(srv, '/' + 'aprobar') === 16, 'censo server 3/16/3/16');
ok(cnt(app, 'pzGoBack') === 4 && cnt(app, 'pz-detalle-setup') === 1 && cnt(app, '/' + 'aprobar') === 1 && cnt(app, 'autofetch') === 0 && cnt(app, 'pcDayKeyShift') === 7, 'censo app 4/1/1/0/7');
const body = fnBody(app, 'pzBlurActivo');
ok(body.length > 0, 'pzBlurActivo extraíble para vm');
function runBlur(active) {
  let called = 0;
  const doc = { activeElement: active ? { tagName: active, isContentEditable: false, blur: () => { called++; } } : null };
  const sandbox = { document: doc, console };
  vm.createContext(sandbox);
  vm.runInContext(body + '\npzBlurActivo();', sandbox);
  return called;
}
if (body) {
  ok(runBlur('INPUT') === 1, 'INPUT enfocado → blur 1 vez');
  ok(runBlur('TEXTAREA') === 1, 'TEXTAREA enfocada → blur 1 vez');
  ok(runBlur('DIV') === 0, 'DIV enfocado → sin blur');
  ok(runBlur(null) === 0, 'sin activeElement → no lanza, sin blur');
} else {
  ok(false, 'INPUT enfocado → blur 1 vez');
  ok(false, 'TEXTAREA enfocada → blur 1 vez');
  ok(false, 'DIV enfocado → sin blur');
  ok(false, 'sin activeElement → no lanza, sin blur');
}

console.log('\nTOTAL: ' + pass + ' OK, ' + fail + ' FALLOS');
process.exit(fail ? 1 : 0);
