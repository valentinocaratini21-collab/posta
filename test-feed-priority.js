'use strict';
/* test-feed-priority.js — (ARMA TODO · Correcciones prioritarias 1 y 2)
 *
 * Corrección 1 · AL ENTRAR, EL FEED MANDA:
 *   - scheduleView: el contenido de la vista (homeWeekBlock: encabezado de
 *     perfil + grilla del feed) se concatena
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
 *     cada vista la incluye adentro (v440: como PRIMER elemento).
 *
 * TANDA v440 · SOLO FEED COMPLETO (decisión de Valentino 25/10 00:44 +
 * corrección 01:48: la tira «🚀 Te faltan N pasos» va «arriba de todo.
 * no abajo»):
 *   - scheduleView: return = tira PRIMERO → homeWeekBlock (perfil +
 *     grilla + píldora) → chat único → #hs-ideas → bloques secundarios
 *     relegados debajo de todo, en su orden relativo histórico
 *     (trial, firstRedo, dogfood, exp, fp, ft, failed) + slots + arm.
 *   - inicioView: return = tira PRIMERO → encabezado literal (con su
 *     chip IG y el toggle «ver como visitante» como acción chica) →
 *     historias → grilla + píldora → chat (barra + hoja) → #mzIdeasSlot
 *     debajo de todo. Fuera del flujo: igLine (mz-igbar; el estado IG
 *     vive en el chip del encabezado), prodash, kit, why.
 *
 * TANDA v442 · SIETE CORRECCIONES DE VALENTINO (25/10 02:13–02:20,
 * sobre la composición solo-feed de v441, que NO se desarma):
 *   1. La tira SALE del medio: en Inicio/Semana es la PÍLDORA compacta
 *      de setupMainHTML (arriba a un costado); tocarla despliega la
 *      tarjeta de siempre (setupChecklistHtml/bindSetupRows/
 *      refreshSetupChecklist intactos; al llegar a 0 se va la píldora).
 *   2. ELIMINADO el botón-anuncio de Ideas (mzIdeasGo + su slot); el
 *      conteo IDEAS_PENDING_COUNT se sigue computando.
 *   3. «Pedir un cambio» → MINI-CHAT inline en el detalle (línea de
 *      Posty + input del cliente); el submit abre el chat ÚNICO con el
 *      posteo anclado y el mensaje entregado (hfDeliverAskText →
 *      chatSend). Nada de hilos paralelos.
 *   4. La ampliación scf-pop va AL BODY (portal): el centrado fixed
 *      (50%/50%) es siempre el del viewport — dentro de la tile, los
 *      transforms de la grilla la corrían «a un costado». El rastreador
 *      geométrico cubre el viaje tile→centro con la caja envolvente.
 *   5. La burbuja de relación (#relacionSlot) ya no se monta en
 *      Inicio/Semana; el sistema de relación queda intacto.
 *   6. La zona relegada de Semana es UNA bandeja «Para vos»
 *      (pvTrayHTML): filas de una línea con el bloque original adentro
 *      (trial como fila-enlace; slots como filas auto-ocultas).
 *   7. El chat de la pantalla principal va SIN prólogo (mainScr en
 *      chatCardHTML): sin saludo, sin línea de la semana, sin el
 *      título «¿Cambiamos algo?» — historial + input.
 *
 * TANDA v436 · LA PANTALLA ES SOLAMENTE EL FEED (decisión de Valentino,
 * 25/10: «que sea solamente el feed»):
 *   - Fuera de scheduleView: el encabezado de marca «Posty. / Tu semana,
 *     lista sola» (hs-brand-head).
 *   - schedFilterBlockHTML compone SOLO el feed: perfil literal +
 *     grilla (feedPreviewHTML) + píldora flotante «Aceptar todo (N)»
 *     (acceptPillHTML, id hsAcceptAll) visible únicamente con borradores
 *     pendientes + #revMsg + hs-report + línea de generación +
 *     schedStaleHTML. Sin llamada a schedQuotaHTML (la cuota vive en Mi
 *     plan), sin barra de pestañas (data-scf-mode), sin navegación por
 *     período (scfNav), sin «Tu agenda».
 *   - Las vistas Día/Semana/Mes murieron: sus 12 funciones
 *     (schedDiaBodyHTML, schedSemanaBodyHTML, schedMesBodyHTML,
 *     schedMiniHTML, schedNavInfo, schedRangeLabel, schedMonthName,
 *     schedCap, schedDiffDays, schedSetMode, schedNavStep, schedJumpDay)
 *     salieron del bundle con CERO referencias; SCHED_MODE = 'feed'
 *     constante; la capa de ampliación ya no ofrece «Ver el día
 *     completo» (scf-pop-day); tocar un tile que se viene abre su
 *     detalle #/app/post/:id (bindSchedule y el espejo vivo).
 *   - Inicio: la franja de revisión (hf-review) salió; la píldora es la
 *     misma pieza (acceptPillHTML, id hfAcceptAll) y el #revMsg queda.
 *   - El aviso «la semana que viene ya está armada» vive en el saludo
 *     del chat: CHAT_NEXT_WEEK (lo cargan schedFilterBlockHTML e
 *     inicioView desde schedWeekCounts) y chatNextWeekHTML lo pinta
 *     dentro de chatCardHTML, ES/EN.
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
ok(!schedSlice.includes('hs-brand-head'), 'scheduleView (v436): el encabezado «Posty. / Tu semana, lista sola» salió');
ok(!appJs.includes('hs-brand-head'), 'bundle (v436): hs-brand-head no existe en ninguna función');

console.log('— A: (v436) la pantalla es solamente el feed');
const scfSrc = extractFn(appJs, 'schedFilterBlockHTML') || '';
ok(!!scfSrc, 'schedFilterBlockHTML se pudo extraer');
ok(scfSrc.includes('feedPreviewHTML(posts, tz'), 'schedFilterBlockHTML: el cuerpo es el feed literal (feedPreviewHTML)');
ok(scfSrc.includes("acceptPillHTML(drafts.length, 'hsAcceptAll')"), 'schedFilterBlockHTML: píldora flotante de aceptación total (id hsAcceptAll)');
ok(scfSrc.includes('drafts.length ?'), 'schedFilterBlockHTML: la píldora solo aparece con borradores pendientes');
ok(scfSrc.includes('id="revMsg"') && scfSrc.includes('id="hs-report"'), 'schedFilterBlockHTML: revMsg y hs-report se quedan');
ok(scfSrc.includes('schedStaleHTML(posts, tz)'), 'schedFilterBlockHTML: el aviso de semana vieja se queda');
ok(!scfSrc.includes('schedQuotaHTML('), 'schedFilterBlockHTML: sin línea de cupo (vive en Mi plan)');
ok(!scfSrc.includes('Tu agenda'), 'schedFilterBlockHTML: sin el título «Tu agenda»');
ok(!scfSrc.includes('scf-bar') && !scfSrc.includes('data-scf-mode') && !scfSrc.includes('scfNav'), 'schedFilterBlockHTML: sin barra de pestañas ni navegación por período');
ok(scfSrc.includes('CHAT_NEXT_WEEK =') && scfSrc.includes('schedWeekCounts(posts, tz, pl.proposals)'), 'schedFilterBlockHTML: carga CHAT_NEXT_WEEK con la cuenta de siempre (schedWeekCounts)');
ok(appJs.includes("const SCHED_MODE = 'feed'"), 'bundle: SCHED_MODE es constante «feed» (un modo viejo guardado no resucita vistas muertas)');
for (const fn of ['schedDiaBodyHTML', 'schedSemanaBodyHTML', 'schedMesBodyHTML', 'schedMiniHTML', 'schedNavInfo', 'schedRangeLabel', 'schedMonthName', 'schedCap', 'schedDiffDays', 'schedSetMode', 'schedNavStep', 'schedJumpDay']) {
  ok(!appJs.includes('function ' + fn), `bundle (v436): ${fn} retirada`);
  ok(!(new RegExp(fn + '\\s*\\(').test(appJs)), `bundle (v436): cero referencias a ${fn}`);
}
ok(!appJs.includes('data-scf-mode') && !appJs.includes('data-scf-day'), 'bundle (v436): sin markup de pestañas ni de saltos de día');
ok(!appJs.includes('scf-pop-day'), 'bundle (v436): la capa ya no ofrece «Ver el día completo»');
ok(appJs.includes('scf-pop-x'), 'bundle (v436): la capa conserva su ✕');
const pillSites = (appJs.match(/const id = b\.dataset\.postId; if \(id\) location\.hash = '#\/app\/post\/' \+ encodeURIComponent\(id\)/g) || []).length;
ok(pillSites === 2, 'tiles del feed → detalle #/app/post/:id cableado en bindSchedule y en el espejo vivo (2 sitios)');
const iniSrc436 = (() => { const i = appJs.indexOf('async function inicioView()'); return i > -1 ? appJs.slice(i, i + 26000) : ''; })();
ok(iniSrc436.includes("acceptPillHTML(drafts.length, 'hfAcceptAll')"), 'inicioView (v436): la píldora es la misma pieza (id hfAcceptAll)');
ok(!appJs.includes('hf-review') && !appJs.includes('hf-accept'), 'bundle (v436): la franja de revisión (hf-review/hf-accept) salió del markup');
ok(iniSrc436.includes('CHAT_NEXT_WEEK =') && iniSrc436.includes('id="revMsg"'), 'inicioView (v436): carga CHAT_NEXT_WEEK y conserva el #revMsg junto a la píldora');
ok(appJs.includes('let CHAT_NEXT_WEEK = null'), 'bundle (v436): el global CHAT_NEXT_WEEK existe');
const cardSrc = extractFn(appJs, 'chatCardHTML') || '';
ok(cardSrc.includes('chatNextWeekHTML()'), 'chatCardHTML (v436): el saludo incluye la línea de la semana que viene');
const nwSrc = extractFn(appJs, 'chatNextWeekHTML') || '';
ok(nwSrc.includes('ya están armados') && nwSrc.includes('de la semana que viene'), 'chatNextWeekHTML ES: «ya están armados X de Y de la semana que viene»');
ok(nwSrc.includes('already lined up'), 'chatNextWeekHTML EN: «posts for next week are already lined up»');

const retStart = schedSlice.indexOf('return `<div id="schedView"');
ok(retStart > -1, 'scheduleView: se encontró su return');
const retSeg = retStart > -1 ? schedSlice.slice(retStart, retStart + 2200) : '';
const idxOf = (seg, tok) => seg.indexOf(tok);
ok(idxOf(retSeg, '${homeWeekBlock}') > -1, 'return: homeWeekBlock (contenido de la vista) está');
// (v442) Los bloques relegados ya NO se interpolan sueltos en el
// return: componen la bandeja «Para vos» (${pvTray}) DESPUÉS de Ideas.
for (const tok of ['${trialBanner}', '${firstRedoBlock}', '${dogfoodBlock}', '${expBanner}', '${fpBlock}', '${ftBlock}', '${failedBlock}']) {
  ok(idxOf(retSeg, tok) === -1, `return (v442): ${tok} ya no va suelto — vive en la bandeja «Para vos»`);
}
// Orden relativo original entre bloques secundarios (el de la base
// v431), ahora dentro de la construcción de la bandeja:
const trayStart = schedSlice.indexOf('const pvTray = pvTrayHTML([');
const traySeg = trayStart > -1 ? schedSlice.slice(trayStart, schedSlice.indexOf('], enV)', trayStart)) : '';
ok(trayStart > -1, 'scheduleView (v442): la bandeja se construye con pvTrayHTML([...])');
const relOrder = ['trialBanner', 'firstRedoBlock', 'dogfoodBlock', 'expBanner', 'fpBlock', 'ftBlock', 'failedBlock'];
ok(relOrder.every((tok, i) => i === 0 || traySeg.indexOf(tok) > traySeg.indexOf(relOrder[i - 1])), 'bandeja (v442): orden relativo entre bloques secundarios conservado');
for (const slot of ['adsBoostSlot', 'hs-question', 'hs-showcase']) {
  ok(traySeg.includes(`slot: '${slot}'`), `bandeja (v442): el slot ${slot} entra como fila`);
}
ok(idxOf(retSeg, '${homeChatBlock}') > idxOf(retSeg, '${homeWeekBlock}') && idxOf(retSeg, '${homeChatBlock}') < idxOf(retSeg, '${pvTray}'), 'return (v442): el chat único va tras el feed y ANTES de la bandeja relegada');
ok(idxOf(retSeg, 'id="hs-ideas"') > idxOf(retSeg, '${homeChatBlock}') && idxOf(retSeg, 'id="hs-ideas"') < idxOf(retSeg, '${pvTray}'), 'return (v442): Ideas va debajo del chat y ANTES de la bandeja');
ok(idxOf(retSeg, '${armBlock}') > idxOf(retSeg, '${pvTray}'), 'return (v442): la tarjeta para armar la semana sigue tras la bandeja');
ok(idxOf(retSeg, '${setupMainHTML()}') > -1 && idxOf(retSeg, '${setupMainHTML()}') < idxOf(retSeg, '${homeWeekBlock}'), 'scheduleView (v442): la PÍLDORA de activación va PRIMERO, arriba a un costado (corrección 02:13)');
ok(retSeg.indexOf('${') === idxOf(retSeg, '${setupMainHTML()}'), 'scheduleView (v442): la píldora es la PRIMERA interpolación del return');
ok(!retSeg.includes('${setupChecklistHtml'), 'scheduleView (v442): la tarjeta de activación ya no se interpola como bloque en el return');

console.log('— A: appShell ya no antepone la tira en inicio/schedule');
const shellSrc = extractFn(appJs, 'appShell') || '';
ok(!!shellSrc, 'appShell se pudo extraer');
ok(shellSrc.includes("(tab === 'chat' || tab === 'inicio' || tab === 'schedule') ? '' : setupChecklistHtml(undefined)"), 'appShell: inicio/schedule (y chat) no reciben la tira antepuesta; las demás tabs la conservan');
ok((shellSrc.match(/setupChecklistHtml\(/g) || []).length === 1, 'appShell: una sola invocación de setupChecklistHtml (la de las demás tabs)');

console.log('— A: (v440) inicio: la tira va PRIMERO; prodash/kit/why/igLine fuera; ideas debajo de todo');
const iniStart = appJs.indexOf('async function inicioView()');
ok(iniStart > -1, 'inicioView existe');
const iniRet = iniStart > -1 ? appJs.slice(appJs.indexOf('return `<div id="inicioView"', iniStart), appJs.indexOf('return `<div id="inicioView"', iniStart) + 3200) : '';
ok(idxOf(iniRet, '${gridHTML}') > -1 && idxOf(iniRet, 'setupMainHTML()') > -1 && idxOf(iniRet, 'setupMainHTML()') < idxOf(iniRet, '${gridHTML}'), 'inicioView (v442): la PÍLDORA va PRIMERO, antes de la grilla (corrección 02:13)');
ok(idxOf(iniRet, 'setupMainHTML()') < idxOf(iniRet, '${homeHeadHTML'), 'inicioView (v442): la píldora va antes del encabezado del perfil');
ok(idxOf(iniRet, 'setupMainHTML()') < idxOf(iniRet, 'id="mzChatBar"'), 'inicioView (v442): la píldora va antes de la barra del chat');
ok(!iniRet.includes('${setupChecklistHtml'), 'inicioView (v442): la tarjeta de activación ya no se interpola como bloque en el return');
for (const tok of ['${igLine}', '${prodashHTML}', '${kitHTML}', '${whyHTML}', 'mz-igbar', 'hf-prodash', 'hf-kitnote', 'class="hf-why"']) {
  ok(!iniRet.includes(tok), `inicioView (v440): fuera del flujo principal — ${tok}`);
}
ok(!appJs.includes('class="mz-igbar"'), 'bundle (v440): el markup de la barra ancha de IG salió; el estado IG vive en el chip del encabezado');
ok(idxOf(iniRet, '${visitorToggleHTML}') > -1 && idxOf(iniRet, '${visitorToggleHTML}') < idxOf(iniRet, '${gridHTML}'), 'inicioView (v440): «ver como visitante» es acción chica en la zona del encabezado, no un bloque bajo la grilla');
ok(!iniRet.includes('mzIdeasSlot'), 'inicioView (v442): el slot del botón de Ideas salió de la pantalla principal (corrección 02:15)');
ok(!appJs.includes('id="mzIdeasGo"'), 'bundle (v442): el botón-anuncio «💡 Tenés N ideas nuevas» (mzIdeasGo) ya no se renderiza');
ok(appJs.includes('IDEAS_PENDING_COUNT = (r.ideas || []).length'), 'bundle (v442): el conteo de ideas se sigue computando (badge del chip y panel intactos)');
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
ok(appJs.includes('${hfAskChangeBtnHTML(d)}'), 'weekCardHTML: el mini-chat reemplaza a la caja en la tarjeta/detalle');
ok(appJs.includes('${hfAskChangeBtnHTML(p)}'), 'approvalPostView: el mini-chat reemplaza a la caja en el detalle');
ok((appJs.match(/\$\{hfAskChangeBtnHTML\(/g) || []).length === 2, 'exactamente 2 call sites del mini-chat (weekCard + apv), los mismos que tenía la caja');
const f3InitSrc = extractFn(appJs, 'f3Init') || '';
ok(f3InitSrc.includes('hfAskChangeBind()'), 'f3Init cablea el mini-chat único (hfAskChangeBind)');
ok(!f3InitSrc.includes('f3PaintThreads'), 'f3Init: sin llamada a f3PaintThreads');

console.log('— A: mini-chat del detalle (v442) y chapita del ancla');
const askBtnSrc = extractFn(appJs, 'hfAskChangeBtnHTML') || '';
ok(askBtnSrc.includes('qué le cambiamos a este posteo?') && askBtnSrc.includes('what do we change on this post?'), 'mini-chat: la línea de Posty ES/EN, en su voz (minúscula, corta)');
ok(askBtnSrc.includes('hf-ask-posty') && askBtnSrc.includes('ai-avatar.png'), 'mini-chat: la línea es DE Posty (su avatar)');
ok(askBtnSrc.includes('data-hf-ask-form') && askBtnSrc.includes('data-hf-ask-input'), 'mini-chat: form + input de una línea del cliente');
ok(!appJs.includes('data-hf-ask-change'), 'bundle (v442): el botón «Pedir un cambio» (data-hf-ask-change) ya no existe');
const askSrc = extractFnSig(appJs, 'function hfAskChange(post)') || '';
ok(askSrc.includes('scfClosePop()') && askSrc.includes('hfDetailClose()') && askSrc.includes('pcCloseSheet()'), 'hfAskChange: cierra el detalle por sus mecanismos existentes');
ok(askSrc.includes('hfOpenChatForPost(post)'), 'hfAskChange: reutiliza hfOpenChatForPost');
ok(askSrc.includes('HF_CHAT_OPEN_PENDING = true') && askSrc.includes('mzHomeHash()'), 'hfAskChange: sin chat en la vista (apv) navega a Inicio con apertura pendiente');
const openChatSrc = extractFn(appJs, 'hfOpenChatForPost') || '';
ok(openChatSrc.includes('hfSetAnchor(post)'), 'hfOpenChatForPost intacto: fija el ancla (hfSetAnchor)');
const askBindSrc = extractFn(appJs, 'hfAskChangeBind') || '';
ok(askBindSrc.includes("addEventListener('submit'") && askBindSrc.includes('hfAskForm') && askBindSrc.includes('hfAskChange(post)'), 'hfAskChangeBind: delegado global de submit que resuelve el posteo y abre el chat único (hfAskChange)');
ok(askBindSrc.includes('HF_ASK_TEXT_PENDING = text') && askBindSrc.includes('hfDeliverAskText()'), 'hfAskChangeBind: el mensaje del cliente queda pendiente y se entrega en el chat único');
const deliverSrc = extractFn(appJs, 'hfDeliverAskText') || '';
ok(deliverSrc.includes("getElementById('chatInput')") && deliverSrc.includes('chatSend()'), 'hfDeliverAskText: entrega por el camino de envío de siempre (chatSend sobre #chatInput)');
const bindIniSrc = (() => { const i = appJs.indexOf('function bindInicio()'); return i > -1 ? appJs.slice(i, i + 5000) : ''; })();
ok(bindIniSrc.includes('HF_CHAT_OPEN_PENDING') && bindIniSrc.includes('mzOpenSheet(true)'), 'bindInicio: abre la hoja del chat único cuando el pedido vino del detalle standalone');
const anchorSrc = extractFn(appJs, 'hfAnchorBarHTML') || '';
ok(anchorSrc.includes('Editando este posteo') && anchorSrc.includes('Editing this post'), 'chapita: «Editando este posteo» / «Editing this post»');
ok(!appJs.includes('Estás hablando de este posteo') && !appJs.includes("You're talking about this post"), 'bundle: el rótulo viejo de la chapita ya no existe');
ok(appJs.includes('anchor_post_id') && appJs.includes('HF_CHAT_ANCHOR.id'), 'chat principal intacto: el envío sigue mandando anchor_post_id desde HF_CHAT_ANCHOR');

console.log('— A: index.html y CHUNK_V');
ok(indexHtml.includes('/app.js?v=286'), 'index.html: app.js bumpeado a ?v=286 (v455)');
ok(!indexHtml.includes('/app.js?v=285'), 'index.html: sin ?v=285 residual');
ok(indexHtml.includes('/styles.css?v=20261027'), 'index.html: styles.css bumpeado a ?v=20261027 (v452)');
ok(appJs.includes("const CHUNK_V = '20261025-v436';"), 'app.js: CHUNK_V bumpeado al build v436');

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

console.log('— B: mini-chat del detalle (extraído)');
{
  const built = new Function('esc', 'ME', 'var HF_ASK_POSTS = {};\nvar HF_CHAT_OPEN_PENDING = false;\nvar HF_ASK_TEXT_PENDING = \'\';\n' + askBtnSrc + '\nreturn { f: hfAskChangeBtnHTML, reg: HF_ASK_POSTS };')(escStub, { lang: 'es' });
  const draft = { id: 7, image_path: '/img/7.jpg', status: 'draft', caption: 'hola', redo_left: 2, media_type: 'image' };
  const html = built.f(draft);
  ok(html.includes('qué le cambiamos a este posteo?') && html.includes('data-hf-ask-form="7"') && html.includes('data-hf-ask-input'), 'mini-chat ES en borrador con imagen: línea de Posty + form con el id + input');
  ok(html.includes('hf-ask-posty') && html.includes('escribile a Posty…'), 'mini-chat ES: línea de Posty con su avatar y placeholder en su voz');
  ok(!html.includes('data-f3-'), 'el HTML que produce el detalle no contiene ningún data-f3-* del hilo');
  ok(built.reg['7'] && built.reg['7'].image_path === '/img/7.jpg' && built.reg['7'].redo_left === 2, 'el posteo queda registrado por id para el handler delegado');
  ok(built.f({ id: 8, image_path: '/img/8.jpg', status: 'published' }) === '', 'publicado: sin mini-chat (la caja tampoco existía)');
  ok(built.f({ id: 9, status: 'draft' }) === '', 'borrador sin imagen: sin mini-chat (misma elegibilidad que la caja)');
  const builtEn = new Function('esc', 'ME', 'var HF_ASK_POSTS = {};\nvar HF_CHAT_OPEN_PENDING = false;\nvar HF_ASK_TEXT_PENDING = \'\';\n' + askBtnSrc + '\nreturn { f: hfAskChangeBtnHTML };')(escStub, { lang: 'en' });
  ok(builtEn.f(draft).includes('what do we change on this post?') && builtEn.f(draft).includes('message Posty…'), 'mini-chat EN: «what do we change on this post?» + placeholder EN');
}

console.log('— A: (v442) píldora, bandeja, peek centrado, chat sin prólogo, relación fuera');
const pillSrc = extractFn(appJs, 'setupMainHTML') || '';
ok(!!pillSrc, 'setupMainHTML existe (la forma principal de la tira)');
ok(pillSrc.includes('setupChecklistHtml(undefined, { omitIg: true })'), 'setupMainHTML compone LA tarjeta de siempre (mismas filas y binds)');
ok(pillSrc.includes('setup-pill') && pillSrc.includes('data-setup-pill') && pillSrc.includes('setup-pill-pop'), 'setupMainHTML: píldora compacta + despliegue de la tarjeta');
ok(pillSrc.includes('setup-title'), 'setupMainHTML: el rótulo sale del título real de la tarjeta (el número de toda la app)');
const refreshSrc2 = extractFn(appJs, 'refreshSetupChecklist') || '';
ok(refreshSrc2.includes('setup-pillwrap') && refreshSrc2.includes('pillwrap.remove()'), 'refreshSetupChecklist (v442): al llegar a 0 pasos se va la píldora entera');
ok(refreshSrc2.includes('data-setup-pill-label'), 'refreshSetupChecklist (v442): el rótulo de la píldora hereda el título refrescado');
ok(bindIniSrc.includes('bindSetupPill('), 'bindInicio cablea la píldora');
const bindSchedSrc = (() => { const i = appJs.indexOf('function bindSchedule()'); return i > -1 ? appJs.slice(i, i + 1500) : ''; })();
ok(bindSchedSrc.includes('bindSetupPill(') && bindSchedSrc.includes('bindPvTray('), 'bindSchedule cablea la píldora y la bandeja «Para vos»');
const traySrc = extractFn(appJs, 'pvTrayHTML') || '';
ok(!!traySrc && traySrc.includes('pv-tray') && traySrc.includes('Para vos') && traySrc.includes('For you'), 'pvTrayHTML: UNA bandeja «Para vos» / «For you»');
ok(traySrc.includes('pv-plain') && traySrc.includes('pv-slotrow') && traySrc.includes('data-pv-toggle'), 'pvTrayHTML: fila-enlace directa, filas de slot y filas desplegables');
ok(!shellSrc.includes('relacionSlot'), 'appShell (v442): la burbuja de relación ya no se monta en Inicio/Semana');
ok(appJs.includes('pzFillRelacion') && appJs.includes('/api/relacion/entry'), 'bundle (v442): el sistema de relación sigue intacto (endpoint y loader; solo murió su superficie)');
const scfOpenSrc = extractFn(appJs, 'scfOpenPop') || '';
ok(scfOpenSrc.includes('document.body.appendChild(pop)'), 'scfOpenPop (v442): la capa se monta en el BODY (portal) — el centrado fixed es el del viewport, no el de la tile');
ok(!scfOpenSrc.includes('wrap.appendChild(pop)'), 'scfOpenPop (v442): la capa ya no vive dentro de la tile (los transforms de la grilla la corrían a un costado)');
const scfWireSrc = extractFn(appJs, 'scfWireGlobals') || '';
ok(scfWireSrc.includes("!e.target.closest('.scf-pop')"), 'scfWireGlobals (v442): el click afuera no cierra cuando el click es DENTRO de la capa portal');
ok(scfWireSrc.includes('Math.min(wr.left, pr.left)'), 'scfWireGlobals (v442): el rastreador cubre el viaje tile→centro con la caja envolvente; salir de ella cierra en el acto');
ok(cardSrc.includes('mainScr') && cardSrc.includes('mainScr ? msgs'), 'chatCardHTML (v442): con mainScr el chat abre directo — historial + input, sin saludo ni línea de la semana');
ok((appJs.match(/chatCardHTML\(true, true, true, true, true\)/g) || []).length === 2, 'chatCardHTML (v442): las dos superficies de la pantalla principal (Semana y hoja de Inicio) piden mainScr');
ok(!schedSlice.includes('¿Cambiamos algo?') && !iniSrc436.includes('¿Cambiamos algo?'), 'pantalla principal (v442): el título «¿Cambiamos algo?» salió de Semana y de la hoja de Inicio');

console.log('— B: (v436) píldora de aceptación total (extraída)');
{
  const pillSrc = extractFn(appJs, 'acceptPillHTML') || '';
  const pill = new Function('ME', pillSrc + '\nreturn acceptPillHTML;')({ lang: 'es' });
  const es = pill(3, 'hsAcceptAll');
  ok(es.includes('✅ Aceptar todo (3)') && es.includes('id="hsAcceptAll"') && es.includes('accept-pill'), 'píldora ES: «✅ Aceptar todo (3)» con su id y clase flotante');
  const pillEn = new Function('ME', pillSrc + '\nreturn acceptPillHTML;')({ lang: 'en' });
  ok(pillEn(2, 'hfAcceptAll').includes('✅ Accept all (2)') && pillEn(2, 'hfAcceptAll').includes('id="hfAcceptAll"'), 'píldora EN: «✅ Accept all (2)»');
}

console.log('— B: (v436) línea de la semana que viene en el saludo (extraída)');
{
  const nwSrc2 = extractFn(appJs, 'chatNextWeekHTML') || '';
  const mk = (ME, CHAT_NEXT_WEEK) => new Function('ME', 'CHAT_NEXT_WEEK', nwSrc2 + '\nreturn chatNextWeekHTML;')(ME, CHAT_NEXT_WEEK);
  const es7 = mk({ lang: 'es' }, { n: 7, total: 7 })();
  ok(es7.includes('ya están armados <b>7 de 7</b> de la semana que viene'), 'saludo ES 7/7: la línea de la semana que viene, tal cual la decía la Agenda');
  const es9 = mk({ lang: 'es' }, { n: 9, total: 7 })();
  ok(es9.includes('<b>7 de 7</b>') && es9.includes('y <b>2 más</b> en espera'), 'saludo ES con excedente: «7 de 7» + «2 más en espera»');
  const en7 = mk({ lang: 'en' }, { n: 7, total: 7 })();
  ok(en7.includes('<b>7 of 7</b>') && en7.includes('already lined up') && !en7.includes('semana'), 'saludo EN 7/7: «7 of 7 … already lined up», sin español');
  ok(mk({ lang: 'es' }, null)() === '' && mk({ lang: 'es' }, { n: 0, total: 7 })() === '', 'sin armados de la que viene: no hay línea (nada se inventa)');
}

console.log('— B: (v436) schedFilterBlockHTML compone solo el feed (extraída, con stubs)');
{
  const scfSrc2 = extractFn(appJs, 'schedFilterBlockHTML') || '';
  const pillSrc2 = extractFn(appJs, 'acceptPillHTML') || '';
  let quotaCalled = false;
  const scope = `
    var CHAT_NEXT_WEEK = 'unset';
    function homeWeekHTML() { return 'EMPTYSTATE'; }
    function prefetchMedia() {}
    function schedPlacements() { return { proposals: [], list: [] }; }
    function schedWeekCounts() { return { nextDrafts: 5 }; }
    function schedQuotaHTML() { quotaFlag = true; return 'QUOTA'; }
    function feedPreviewHTML() { return 'FEEDBODY'; }
    function schedStaleHTML() { return ''; }
    var quotaFlag = false;
    ${pillSrc2}
    ${scfSrc2}
    return { f: schedFilterBlockHTML, nw: () => CHAT_NEXT_WEEK, quota: () => quotaFlag };`;
  const built = new Function('ME', scope)({ lang: 'es' });
  const posts = [{ id: 1, status: 'draft' }, { id: 2, status: 'draft' }, { id: 3, status: 'published' }];
  const html = built.f(posts, { limit: 7 }, false, false);
  ok(html.includes('FEEDBODY'), 'con posteos: el cuerpo es el feed');
  ok(html.includes('✅ Aceptar todo (2)') && html.includes('id="hsAcceptAll"'), 'con 2 borradores: píldora «Aceptar todo (2)»');
  ok(!html.includes('QUOTA') && built.quota() === false, 'sin la línea de cupo (schedQuotaHTML no se llama)');
  ok(built.nw() && built.nw().n === 5 && built.nw().total === 7, 'CHAT_NEXT_WEEK queda cargado (5 de 7) para el saludo del chat');
  const htmlPub = built.f([{ id: 3, status: 'published' }], { limit: 7 }, false, false);
  ok(!htmlPub.includes('Aceptar todo'), 'autopiloto (sin borradores): la píldora no aparece nunca');
  ok(built.f([], { limit: 7 }, false, false) === 'EMPTYSTATE', 'sin posteos: delega en los estados de siempre (homeWeekHTML)');
}

console.log(`\ntest-feed-priority: ${okN} ok, ${failN} fallas`);
process.exit(failN ? 1 : 0);
