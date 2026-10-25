'use strict';
/* test-feed-priority.js — (ARMA TODO · Correcciones prioritarias 1 y 2)
 *
 * Corrección 1 · AL ENTRAR, EL FEED MANDA:
 *   - scheduleView: el contenido de la vista (homeWeekBlock: encabezado de
 *     perfil + pestañas Día/Semana/Mes/Feed + grilla/calendario) se concatena
 *     ANTES que todos los bloques secundarios; la tarjeta «Lo que vi de tu
 *     cuenta» (analysisSummaryBlock) ya NO existe en la función — eliminada
 *     el 2026-10-25 por Valentino: su contenido (week_summary) encabeza la
 *     ventana de Análisis; igBanner (tarjeta grande, 2 variantes) ya no
 *     existe en la función y su orden relativo entre bloques se conserva.
 *   - El estado IG vive como chip compacto en el encabezado del perfil
 *     (igHeadChipHTML): «Conectar Instagram» si !PROFILE.ig_connected y
 *     «Reconectar Instagram» si SETTINGS.ig_token_warning, ES/EN, en
 *     feedProfileHeadHTML (Feed de la agenda) y en homeHeadHTML (Inicio).
 *   - appShell ya NO antepone la tira de activación en inicio/schedule;
 *     cada vista la incluye tras su contenido (schedule: junto a los
 *     bloques secundarios; inicio: tras la grilla, antes del chat).
 *
 * Corrección 2 · UN SOLO CHAT:
 *   - La caja f3 desapareció: cero data-f3-form / data-f3-input en todo el
 *     bundle, cero definiciones/llamadas de f3ThreadHTML / f3PaintThreads /
 *     f3ThreadSend, y ningún call site en weekCardHTML ni approvalPostView.
 *   - En su lugar, el botón «💬 Pedir un cambio» / «💬 Ask for a change»
 *     (hfAskChangeBtnHTML) cableado por delegado (hfAskChangeBind, desde
 *     f3Init) a hfAskChange → cierra el detalle (scfClosePop /
 *     hfDetailClose / pcCloseSheet) y reutiliza hfOpenChatForPost
 *     (que ya hace hfSetAnchor + navegación al chat principal).
 *   - La chapita del ancla dice «Editando este posteo» / «Editing this post».
 *
 * Parte A: estáticos de orden/ausencia sobre app.js + index.html.
 * Parte B: comportamiento — se extraen las funciones REALES del bundle y
 *   se ejecutan con stubs (chip IG en sus 2 estados × 2 idiomas, encabezados,
 *   chapita del ancla y botón de cambio con su elegibilidad y registro).
 *
 * Uso: node test-feed-priority.js   (busca app.js junto al test o en public/)
 */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const here = __dirname;
const appPath = fs.existsSync(path.join(here, 'app.js')) ? path.join(here, 'app.js') : path.join(here, 'public', 'app.js');
const idxPath = fs.existsSync(path.join(here, 'index.html')) ? path.join(here, 'index.html') : path.join(here, 'public', 'index.html');
const appJs = fs.readFileSync(appPath, 'utf8');
const indexHtml = fs.readFileSync(idxPath, 'utf8');

/* ---------- util: extraer una función por balance de llaves ---------- */
// Mismo lexer mínimo de test-setup-checklist (código / template literal).
function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return null;
  const stack = [{ tpl: false, braces: 0 }];
  let begun = false;
  let i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    const c = src[i], top = stack[stack.length - 1];
    if (!top.tpl) {
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
      if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
      if (c === '`') { stack.push({ tpl: true, braces: 0 }); continue; }
      if (c === '{') { top.braces++; begun = true; continue; }
      if (c === '}') {
        top.braces--;
        if (begun && top.braces === 0 && stack.length === 1) return src.slice(start, i + 1);
        if (top.braces < 0) { stack.pop(); }
        continue;
      }
    } else {
      if (c === '\\') { i++; continue; }
      if (c === '`') { stack.pop(); continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push({ tpl: false, braces: 0 }); i++; continue; }
    }
  }
  return null;
}
const escStub = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Variante por firma exacta (para nombres que son prefijo de otros, p. ej.
// hfAskChange vs hfAskChangeBtnHTML) y corte por el return para funciones
// cuyo cuerpo trae regex literales con «//» (p. ej. homeHeadHTML), donde el
// lexer de llaves se confunde: se corta desde la firma hasta el cierre del
// template de su return final (`; + salto + }).
function extractFnSig(src, sig) {
  const start = src.indexOf(sig);
  if (start < 0) return null;
  const stack = [{ tpl: false, braces: 0 }];
  let begun = false;
  let i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    const c = src[i], top = stack[stack.length - 1];
    if (!top.tpl) {
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
      if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
      if (c === '`') { stack.push({ tpl: true, braces: 0 }); continue; }
      if (c === '{') { top.braces++; begun = true; continue; }
      if (c === '}') {
        top.braces--;
        if (begun && top.braces === 0 && stack.length === 1) return src.slice(start, i + 1);
        if (top.braces < 0) { stack.pop(); }
        continue;
      }
    } else {
      if (c === '\\') { i++; continue; }
      if (c === '`') { stack.pop(); continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push({ tpl: false, braces: 0 }); i++; continue; }
    }
  }
  return null;
}
function extractFnByReturn(src, sig, returnMarker) {
  const start = src.indexOf(sig);
  if (start < 0) return null;
  const r = src.indexOf(returnMarker, start);
  if (r < 0) return null;
  const end = src.indexOf('`;', r);
  if (end < 0) return null;
  return src.slice(start, end + 2) + '\n}';
}

/* ================= Parte A: estáticos ================= */
console.log('— A: orden en scheduleView (el feed manda)');
const schedStart = appJs.indexOf('async function scheduleView()');
ok(schedStart > -1, 'scheduleView existe');
const schedSlice = schedStart > -1 ? appJs.slice(schedStart, schedStart + 26000) : '';
ok(!schedSlice.includes('const igBanner'), 'scheduleView: igBanner ya no se computa');
ok(!schedSlice.includes('card card-hi-yl'), 'scheduleView: sin la tarjeta grande de IG (card-hi-yl)');
ok(!appJs.includes('const igBanner'), 'bundle: igBanner no existe en ninguna función');
ok(!schedSlice.includes('analysisSummaryBlock'), 'scheduleView: la tarjeta «Lo que vi de tu cuenta» ya no se computa (2026-10-25)');
ok(!appJs.includes('analysisSummaryBlock'), 'bundle: analysisSummaryBlock no existe en ninguna función');
ok(!schedSlice.includes("api.get('/api/analysis?peek=1')"), 'scheduleView: sin el fetch de peek que alimentaba la tarjeta');

const retStart = schedSlice.indexOf('return `<div id="schedView"');
ok(retStart > -1, 'scheduleView: se encontró su return');
const retSeg = retStart > -1 ? schedSlice.slice(retStart, retStart + 2200) : '';
const idxOf = (seg, tok) => seg.indexOf(tok);
ok(idxOf(retSeg, '${homeWeekBlock}') > -1, 'return: homeWeekBlock (contenido de la vista) está');
for (const tok of ['${trialBanner}', '${firstRedoBlock}', '${dogfoodBlock}', '${expBanner}', '${fpBlock}', '${ftBlock}', '${failedBlock}']) {
  ok(idxOf(retSeg, tok) > idxOf(retSeg, '${homeWeekBlock}'), `return: ${tok} va DESPUÉS del contenido de la vista`);
}
// Orden relativo original entre bloques secundarios (el de la base v431):
const relOrder = ['${trialBanner}', '${firstRedoBlock}', '${dogfoodBlock}', '${expBanner}', '${fpBlock}', '${ftBlock}', '${failedBlock}'];
ok(relOrder.every((tok, i) => i === 0 || idxOf(retSeg, tok) > idxOf(retSeg, relOrder[i - 1])), 'return: orden relativo entre bloques secundarios conservado');
ok(idxOf(retSeg, '${homeChatBlock}') > idxOf(retSeg, '${failedBlock}'), 'return: el chat sigue debajo de los bloques (como en la base)');
ok(idxOf(retSeg, '${setupChecklistHtml(undefined, { omitIg: true })}') > idxOf(retSeg, '${homeWeekBlock}'), 'scheduleView: la tira de activación va tras el contenido, junto a los bloques secundarios');

console.log('— A: appShell ya no antepone la tira en inicio/schedule');
const shellSrc = extractFn(appJs, 'appShell') || '';
ok(!!shellSrc, 'appShell se pudo extraer');
ok(shellSrc.includes("(tab === 'chat' || tab === 'inicio' || tab === 'schedule') ? '' : setupChecklistHtml(undefined)"), 'appShell: inicio/schedule (y chat) no reciben la tira antepuesta; las demás tabs la conservan');
ok((shellSrc.match(/setupChecklistHtml\(/g) || []).length === 1, 'appShell: una sola invocación de setupChecklistHtml (la de las demás tabs)');

console.log('— A: inicio incluye la tira tras la grilla, antes del chat');
const iniStart = appJs.indexOf('async function inicioView()');
ok(iniStart > -1, 'inicioView existe');
const iniRet = iniStart > -1 ? appJs.slice(appJs.indexOf('return `<div id="inicioView"', iniStart), appJs.indexOf('return `<div id="inicioView"', iniStart) + 2600) : '';
ok(idxOf(iniRet, '${gridHTML}') > -1 && idxOf(iniRet, 'setupChecklistHtml(undefined, { omitIg: true })') > idxOf(iniRet, '${gridHTML}'), 'inicioView: la tira va después de la grilla');
ok(idxOf(iniRet, 'setupChecklistHtml(undefined, { omitIg: true })') > -1 && idxOf(iniRet, 'setupChecklistHtml(undefined, { omitIg: true })') < idxOf(iniRet, 'id="mzChatBar"'), 'inicioView: la tira va antes de la barra del chat');
const refreshSrc = extractFn(appJs, 'refreshSetupChecklist') || '';
ok(refreshSrc.includes("card.closest('#schedView')"), 'refreshSetupChecklist: el refresh conserva omitIg también dentro de #schedView');

console.log('— A: chip IG en los encabezados');
const chipSrc = extractFn(appJs, 'igHeadChipHTML') || '';
ok(!!chipSrc, 'igHeadChipHTML existe');
ok(chipSrc.includes("'Conectar Instagram'") || chipSrc.includes('Conectar Instagram'), 'chip ES: «Conectar Instagram»');
ok(chipSrc.includes('Connect Instagram'), 'chip EN: «Connect Instagram»');
ok(chipSrc.includes('Reconectar Instagram'), 'chip ES: «Reconectar Instagram»');
ok(chipSrc.includes('Reconnect Instagram'), 'chip EN: «Reconnect Instagram»');
ok((chipSrc.match(/#\/app\/ajustes\?ig=1/g) || []).length === 2, 'chip: ambos estados enlazan a #/app/ajustes?ig=1');
ok(chipSrc.includes('ig-head-chip'), 'chip: elemento compacto con clase ig-head-chip');
ok(chipSrc.includes('!PROFILE.ig_connected') && chipSrc.includes('SETTINGS.ig_token_warning'), 'chip: estados desde PROFILE.ig_connected y SETTINGS.ig_token_warning');
const feedHeadSrc = extractFn(appJs, 'feedProfileHeadHTML') || '';
ok(feedHeadSrc.includes('igHeadChipHTML('), 'feedProfileHeadHTML (Feed de la agenda) pinta el chip');
const homeHeadSrc = extractFnByReturn(appJs, 'function homeHeadHTML(', 'return `<div class="hf-head">') || '';
ok(homeHeadSrc.includes('igHeadChipHTML(en)'), 'homeHeadHTML (Inicio) pinta el chip');

console.log('— A: la caja f3 desapareció (un solo chat)');
ok((appJs.match(/data-f3-form/g) || []).length === 0, 'bundle: cero data-f3-form');
ok((appJs.match(/data-f3-input/g) || []).length === 0, 'bundle: cero data-f3-input');
for (const fn of ['f3ThreadHTML', 'f3PaintThreads', 'f3ThreadSend', 'f3ThreadLoad', 'f3ThreadSave', 'f3ApplyEditedPost']) {
  ok(!appJs.includes('function ' + fn), `bundle: ${fn} ya no está definida`);
  ok(!(new RegExp(fn + '\\s*\\(').test(appJs.replace('function ' + fn, ''))), `bundle: sin llamadas a ${fn}`);
}
ok(!appJs.includes('data-f3-thread'), 'bundle: sin markup del hilo f3 (data-f3-thread)');
ok(appJs.includes('${hfAskChangeBtnHTML(d)}'), 'weekCardHTML: el botón reemplaza a la caja en la tarjeta/detalle');
ok(appJs.includes('${hfAskChangeBtnHTML(p)}'), 'approvalPostView: el botón reemplaza a la caja en el detalle');
ok((appJs.match(/\$\{hfAskChangeBtnHTML\(/g) || []).length === 2, 'exactamente 2 call sites del botón (weekCard + apv), los mismos que tenía la caja');
const f3InitSrc = extractFn(appJs, 'f3Init') || '';
ok(f3InitSrc.includes('hfAskChangeBind()'), 'f3Init cablea el botón único (hfAskChangeBind)');
ok(!f3InitSrc.includes("addEventListener('submit'"), 'f3Init: el submit delegado del formulario f3 ya no existe');
ok(!f3InitSrc.includes('f3PaintThreads'), 'f3Init: sin llamada a f3PaintThreads');

console.log('— A: botón «Pedir un cambio» y chapita del ancla');
const askBtnSrc = extractFn(appJs, 'hfAskChangeBtnHTML') || '';
ok(askBtnSrc.includes('Pedir un cambio') && askBtnSrc.includes('Ask for a change'), 'botón: textos ES/EN «💬 Pedir un cambio» / «💬 Ask for a change»');
ok(askBtnSrc.includes('data-hf-ask-change'), 'botón: lleva data-hf-ask-change con el id');
const askSrc = extractFnSig(appJs, 'function hfAskChange(post)') || '';
ok(askSrc.includes('scfClosePop()') && askSrc.includes('hfDetailClose()') && askSrc.includes('pcCloseSheet()'), 'hfAskChange: cierra el detalle por sus mecanismos existentes');
ok(askSrc.includes('hfOpenChatForPost(post)'), 'hfAskChange: reutiliza hfOpenChatForPost');
ok(askSrc.includes('HF_CHAT_OPEN_PENDING = true') && askSrc.includes('mzHomeHash()'), 'hfAskChange: sin chat en la vista (apv) navega a Inicio con apertura pendiente');
const openChatSrc = extractFn(appJs, 'hfOpenChatForPost') || '';
ok(openChatSrc.includes('hfSetAnchor(post)'), 'hfOpenChatForPost intacto: fija el ancla (hfSetAnchor)');
const askBindSrc = extractFn(appJs, 'hfAskChangeBind') || '';
ok(askBindSrc.includes('[data-hf-ask-change]') && askBindSrc.includes('hfAskChange(post)'), 'hfAskChangeBind: delegado global que resuelve el posteo y llama a hfAskChange');
const bindIniSrc = (() => { const i = appJs.indexOf('function bindInicio()'); return i > -1 ? appJs.slice(i, i + 5000) : ''; })();
ok(bindIniSrc.includes('HF_CHAT_OPEN_PENDING') && bindIniSrc.includes('mzOpenSheet(true)'), 'bindInicio: abre la hoja del chat único cuando el pedido vino del detalle standalone');
const anchorSrc = extractFn(appJs, 'hfAnchorBarHTML') || '';
ok(anchorSrc.includes('Editando este posteo') && anchorSrc.includes('Editing this post'), 'chapita: «Editando este posteo» / «Editing this post»');
ok(!appJs.includes('Estás hablando de este posteo') && !appJs.includes("You're talking about this post"), 'bundle: el rótulo viejo de la chapita ya no existe');
ok(appJs.includes('anchor_post_id') && appJs.includes('HF_CHAT_ANCHOR.id'), 'chat principal intacto: el envío sigue mandando anchor_post_id desde HF_CHAT_ANCHOR');

console.log('— A: index.html y CHUNK_V');
ok(indexHtml.includes('/app.js?v=273'), 'index.html: app.js bumpeado a ?v=273');
ok(!indexHtml.includes('/app.js?v=272'), 'index.html: sin ?v=272 residual');
ok(appJs.includes("const CHUNK_V = '20261025-v434';"), 'app.js: CHUNK_V bumpeado al build (esta tanda SÍ cambia chunk-analisis: la apertura por week_summary)');

/* ================= Parte B: comportamiento ================= */
console.log('— B: chip IG (extraído, 2 estados × 2 idiomas)');
{
  const mkChip = (PROFILE, SETTINGS) => new Function('PROFILE', 'SETTINGS', chipSrc + '\nreturn igHeadChipHTML;')(PROFILE, SETTINGS);
  const esOff = mkChip({ ig_connected: false }, {}) (false);
  ok(esOff.includes('Conectar Instagram') && esOff.includes('ig-head-chip') && esOff.includes('href="#/app/ajustes?ig=1"'), 'chip ES sin conectar: «Conectar Instagram» → ajustes?ig=1');
  const enOff = mkChip({ ig_connected: false }, {}) (true);
  ok(enOff.includes('Connect Instagram') && !enOff.includes('Conectar Instagram'), 'chip EN sin conectar: «Connect Instagram», sin español');
  const esWarn = mkChip({ ig_connected: true }, { ig_token_warning: true }) (false);
  ok(esWarn.includes('Reconectar Instagram'), 'chip ES con token vencido: «Reconectar Instagram»');
  const enWarn = mkChip({ ig_connected: true }, { ig_token_warning: true }) (true);
  ok(enWarn.includes('Reconnect Instagram') && !enWarn.includes('Reconectar Instagram'), 'chip EN con token vencido: «Reconnect Instagram», sin español');
  ok(mkChip({ ig_connected: true }, {}) (false) === '', 'chip: conectado y sin aviso → no se pinta');
  ok(mkChip({ ig_connected: false }, { ig_token_warning: true }) (false).includes('Conectar Instagram'), 'chip: sin conectar manda Conectar (precedencia de la base)');
}

console.log('— B: el chip vive en el HTML de los encabezados');
{
  const feedHead = new Function('esc', 'ME', 'PROFILE', 'SETTINGS', chipSrc + '\n' + feedHeadSrc + '\nreturn feedProfileHeadHTML;')(
    escStub, { lang: 'es' }, { ig_connected: false }, {});
  const fh = feedHead({ username: 'cafe.sur', name: 'Café Sur', followers: 1200 }, 'Café Sur', {});
  ok(fh.includes('cafe.sur') && fh.includes('ig-head-chip') && fh.includes('Conectar Instagram'), 'feedProfileHeadHTML: encabezado con @ + chip «Conectar Instagram»');
  const feedHeadEn = new Function('esc', 'ME', 'PROFILE', 'SETTINGS', chipSrc + '\n' + feedHeadSrc + '\nreturn feedProfileHeadHTML;')(
    escStub, { lang: 'en' }, { ig_connected: true }, { ig_token_warning: 1 });
  ok(feedHeadEn({ username: 'cafe.sur', name: 'Café Sur' }, 'Café Sur', {}).includes('Reconnect Instagram'), 'feedProfileHeadHTML EN: chip «Reconnect Instagram»');
  const homeHead = new Function('esc', 'ME', 'PROFILE', 'SETTINGS', 'assetLogo', chipSrc + '\n' + homeHeadSrc + '\nreturn homeHeadHTML;')(
    escStub, { lang: 'en' }, { ig_connected: false }, {}, () => null);
  const hh = homeHead({ username: 'cafe.sur', name: 'Café Sur', pic: 'https://x.example/p.jpg', posts_count: 3, followers: 10, following: 5 }, 'Café Sur', { en: true });
  ok(hh.includes('hf-head') && hh.includes('Connect Instagram') && hh.includes('ig-head-chip'), 'homeHeadHTML EN: el encabezado de Inicio pinta «Connect Instagram»');
}

console.log('— B: chapita del ancla (extraída)');
{
  const redoLeftSrc = extractFn(appJs, 'hfRedoLeft') || '';
  const redoLineSrc = extractFn(appJs, 'hfRedoLineHTML') || '';
  const anchor = new Function('esc', 'mv', redoLeftSrc + '\n' + redoLineSrc + '\n' + anchorSrc + '\nreturn hfAnchorBarHTML;')(escStub, (x) => x);
  const post = { id: 7, image_path: '/img/7.jpg', status: 'draft', media_type: 'image', redo_left: 2 };
  const es = anchor(post, false);
  ok(es.includes('Editando este posteo'), 'chapita ES: «Editando este posteo»');
  ok(es.includes('Te quedan 2 de 3 rehaces'), 'chapita ES: la línea de rehaces se queda');
  ok(es.includes('data-hf-anchor-x') && es.includes('hf-anchor-thumb'), 'chapita ES: miniatura y ✕ se quedan');
  ok(es.includes('Cambiar la foto') && es.includes('Cambiar el texto'), 'chapita ES: los chips rápidos se quedan');
  const en = anchor(post, true);
  ok(en.includes('Editing this post') && !en.includes('Editando'), 'chapita EN: «Editing this post», sin español');
}

console.log('— B: botón «Pedir un cambio» (extraído)');
{
  const built = new Function('esc', 'ME', 'var HF_ASK_POSTS = {};\nvar HF_CHAT_OPEN_PENDING = false;\n' + askBtnSrc + '\nreturn { f: hfAskChangeBtnHTML, reg: HF_ASK_POSTS };')(escStub, { lang: 'es' });
  const draft = { id: 7, image_path: '/img/7.jpg', status: 'draft', caption: 'hola', redo_left: 2, media_type: 'image' };
  const html = built.f(draft);
  ok(html.includes('💬 Pedir un cambio') && html.includes('data-hf-ask-change="7"'), 'botón ES en borrador con imagen');
  ok(!html.includes('data-f3-'), 'el HTML que produce el detalle no contiene ningún data-f3-* del hilo');
  ok(built.reg['7'] && built.reg['7'].image_path === '/img/7.jpg' && built.reg['7'].redo_left === 2, 'el posteo queda registrado por id para el handler delegado');
  ok(built.f({ id: 8, image_path: '/img/8.jpg', status: 'published' }) === '', 'publicado: sin botón (la caja tampoco existía)');
  ok(built.f({ id: 9, status: 'draft' }) === '', 'borrador sin imagen: sin botón (misma elegibilidad que la caja)');
  const builtEn = new Function('esc', 'ME', 'var HF_ASK_POSTS = {};\nvar HF_CHAT_OPEN_PENDING = false;\n' + askBtnSrc + '\nreturn { f: hfAskChangeBtnHTML };')(escStub, { lang: 'en' });
  ok(builtEn.f(draft).includes('💬 Ask for a change'), 'botón EN: «💬 Ask for a change»');
}

console.log(`\ntest-feed-priority: ${okN} ok, ${failN} fallas`);
process.exit(failN ? 1 : 0);
