// test-lote-onboarding-divertido.js — LOTE v760 REDISEÑO DEL CHAT DE LA PRUEBA
// (mock prueba-chat-divertido aprobado por Valentino 7/11 «asi esta bien» +
// agregado Solo Hacienda Campos 7/11 14:06 «esto sigue estando mal»).
// 9 cambios del chat (video arriba de todo, avatar real, pregunta destacada,
// todas las opciones + libre, «Lo que ya sé de vos», rama honesta, volver
// robusto, momento «armando tu semana», 5 preguntas intactas) + el draft
// según el mock v2 aprobado 7/11 14:24 («dale. asi si»): 3 fotos DISTINTAS
// del mismo rubro, preview grande con la elegida, marca con logo encima de
// foto, paquete sin «?» + análisis en paralelo con perfil de estilo (E) +
// prompt por posteo desde el análisis (F) + entrada web igual que IG (G).
// SOLO aserciones sobre public/prueba.html, public/en-prueba.html y
// server.js + ejecución real de las funciones extraídas con stubs (mismo
// patrón que test-lote-pregunta-duplicada.js / test-lote-onboardingperfecto.js).
// Uso: node test-lote-onboarding-divertido.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function treeDir() {
  const here = __dirname;
  if (fs.existsSync(path.join(here, 'public', 'prueba.html'))) return here;
  if (fs.existsSync(path.join(here, 'work', 'public', 'prueba.html'))) return path.join(here, 'work');
  throw new Error('no se encontro public/prueba.html junto al test ni en work/');
}
const T = treeDir();
const es = fs.readFileSync(path.join(T, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(T, 'public', 'en-prueba.html'), 'utf8');
const srv = fs.readFileSync(path.join(T, 'server.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('OK  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); }
}
function count(h, s) { return h.split(s).length - 1; }
function has(h, s) { return h.indexOf(s) >= 0; }

// Extrae una función/objeto por conteo de llaves desde su firma. El cuerpo
// empieza en la primera '{' DESPUÉS de cerrar la lista de parámetros (un
// valor por defecto como opts = {} no debe cortar la extracción).
function fnFrom(html, sig) {
  const i = html.indexOf(sig);
  if (i < 0) return null;
  let j = i, dPar = 0, seenParen = false, bodyStart = -1;
  for (; j < html.length; j++) {
    const c = html[j];
    if (c === '(') { dPar++; seenParen = true; }
    else if (c === ')') dPar--;
    else if (c === '{' && (!seenParen || dPar === 0)) { bodyStart = j; break; }
  }
  if (bodyStart < 0) return null;
  let d = 0;
  for (j = bodyStart; j < html.length; j++) {
    if (html[j] === '{') d++;
    else if (html[j] === '}') { d--; if (d === 0) return html.slice(i, j + 1); }
  }
  return null;
}
// Extrae una sentencia `var/const X = [...];` (arrays con objetos dentro).
function stmtFrom(html, sig) {
  const i = html.indexOf(sig);
  if (i < 0) return null;
  let j = i, dSq = 0, dBr = 0, dPar = 0, q = null, esc = false, started = false;
  for (; j < html.length; j++) {
    const c = html[j];
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '[') { dSq++; started = true; }
    else if (c === ']') dSq--;
    else if (c === '{') { dBr++; started = true; }
    else if (c === '}') dBr--;
    else if (c === '(') { dPar++; started = true; }
    else if (c === ')') dPar--;
    else if (c === ';' && started && dSq === 0 && dBr === 0 && dPar === 0) return html.slice(i, j + 1);
  }
  return null;
}

// ---------- estático: estructura, textos, opciones, tracker, confetti ----------
console.log('— S) estático ES+EN —');
ok('S0 sin data/ en el árbol', !fs.existsSync(path.join(T, 'data')));
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  // (1) Video/imagen arriba de todo: primer elemento dentro de #v-onboarding > .wrap.
  ok(tag + ' (1) el workhero es lo primero dentro de .wrap', /<div class="wrap">\s*<section class="oc-workhero"/.test(html));
  ok(tag + ' (1) el workhero está antes del hero y del campo email/@', html.indexOf('oc-workhero') >= 0 && html.indexOf('oc-workhero') < html.indexOf('<div class="hero">') && html.indexOf('oc-workhero') < html.indexOf(tag === 'ES' ? '¡Hola! Soy Posty' : "Hi! I'm Posty") && html.indexOf('oc-workhero') < html.indexOf('id="f_ig"'));
  ok(tag + ' (1) pastilla «Posty está trabajando»', has(html, tag === 'ES' ? 'Posty está trabajando' : 'Posty is working'));
  ok(tag + ' (1) imagen real posty-disenando.webp en el hero', has(html, 'src="posty-disenando.webp"'));
  ok(tag + ' (1) tarjetas flotantes ☕🌿🌅', has(html, 'oc-float-card fc1') && has(html, 'oc-float-card fc2') && has(html, 'oc-float-card fc3'));
  // (2) Avatar real en cada burbuja (nunca regenerado).
  ok(tag + ' (2) avatar canónico en burbujas, tarjeta y hero', count(html, 'posty-con-placa.png') >= 4);
  ok(tag + ' (2) burbuja bot con .msg-ava', has(html, 'class="msg-ava"') || has(html, 'msg-ava oc-qava'));
  // (3) Pregunta destacada + (5) lo aprendido + (6) rama honesta: claves T.
  for (const k of ['qBadge:', 'qHint:', 'qBack:', 'qIntroQ1:', 'qIntroQ2:', 'qIntroQ3:', 'qIntroQ4:', 'qIntroQ5:',
    'qIntroRubro:', 'qIntroRubroBase:', 'qIntroUbicacionEmail:', 'qIntroUbicacionHonest:',
    'reactRubro:', 'reactUbicacion:', 'reactQ1:', 'reactQ2:', 'reactQ3:', 'reactQ4:', 'reactQ5:',
    'knownTitle:', 'knownSub:', 'knownFoot:', 'knownRubro:', 'knownCiudad:', 'knownProducto:',
    'honestTitle:', 'honestSub:', 'honestFoot:', 'honestIg:', 'honestIgMiss:', 'honestWeb:', 'honestWebMiss:', 'honestThen:', 'honestThenVal:',
    'chatJoinHonest:', 'chatJoinHonestWeb:', 'optsHead:', 'optsCount:',
    'draftNoPhoto:', 'draftSlotPending:',
    'draftFotoSub:', 'draftFotoChoose:', 'draftFotoGo:', 'draftFotoFoot:', 'draftPackSub:', 'draftPreviewAs:',
    'promptHow:', 'knownEstilo:', 'styleRhythm:', 'stylePalette:', 'styleCapShort:', 'styleCapMid:', 'styleCapLong:',
    'styleTags:', 'styleVos:', 'styleUsted:', 'promptFotoMarca:', 'promptPalette:', 'promptToneVos:', 'promptToneUsted:',
    'entryIgGo:', 'entryWebGo:', 'entryTrust:']) ok(tag + ' (3/5/6) T.' + k, has(html, k));
  ok(tag + ' (3) chapita «Pregunta X de Y»', has(html, tag === 'ES' ? 'Pregunta {n} de {total} · Posty te pregunta' : 'Question {n} of {total} · Posty asks you'));
  ok(tag + ' (3) pista «Elegí una tarjeta de abajo»', has(html, tag === 'ES' ? 'Elegí una tarjeta de abajo — están todas las opciones' : 'Pick a card below — all the options are there'));
  // (4) Todas las opciones + libre.
  const q2 = stmtFrom(html, 'var Q2_ALL = [');
  ok(tag + ' (4) Q2_ALL extraíble', !!q2);
  if (q2) for (const v of ['domicilio', 'turno', 'tienda', 'llamar']) ok(tag + ' (4) Q2_ALL tiene ' + v, has(q2, "'" + v + "'"));
  const q3 = stmtFrom(html, 'var Q3 = [');
  if (q3) for (const v of ['3x2', 'cuotas', 'regalo', 'combo', 'temporal']) ok(tag + ' (4) Q3 tiene ' + v, has(q3, "'" + v + "'"));
  const q4 = stmtFrom(html, 'var Q4 = [');
  if (q4) for (const v of ['inspirador', 'educativo', 'directo', 'canchero']) ok(tag + ' (4) Q4 tiene ' + v, has(q4, "'" + v + "'"));
  const q5 = stmtFrom(html, 'var Q5 = [');
  if (q5) for (const v of ['algunos', 'aveces']) ok(tag + ' (4) Q5 tiene ' + v, has(q5, "'" + v + "'"));
  ok(tag + ' (4) q2Options conserva emoji+sub', has(html, '.map((o) => ({ v: o.v, l: o.l, e: o.e, sub: o.sub'));
  ok(tag + ' (4) chatOptionsFor q3/q4/q5 agregan __libre__', has(html, "if (key === 'q3') { var o3 = Q3.slice(); o3.push({ v: '__libre__'") && has(html, "if (key === 'q4') { var o4 = Q4.slice(); o4.push({ v: '__libre__'") && has(html, "if (key === 'q5') { var o5 = Q5.slice(); o5.push({ v: '__libre__'"));
  ok(tag + ' (4) ubicación suma envíos/ferias/encargo/local+online', has(html, 'pushU(T.ubicEnvios') && has(html, 'pushU(T.ubicFerias') && has(html, 'pushU(T.ubicEncargo') && has(html, 'pushU(T.ubicLocalOnline'));
  const canon = fnFrom(html, 'const CANON = {');
  ok(tag + ' (4) CANON extraíble', !!canon);
  if (canon) for (const v of ['domicilio', '3x2', 'inspirador', 'algunos']) ok(tag + ' (4) CANON tiene ' + v, has(canon, "'" + v + "'"));
  // (7) Volver robusto + (8) momento armando + celebración.
  ok(tag + ' (7) chatClearFrom definida', count(html, 'function chatClearFrom(') === 1);
  ok(tag + ' (7) chatBack/chatBackTo usan chatClearFrom', has(html, 'chatClearFrom(S.qi);') && count(html, 'chatClearFrom(S.qi);') === 2);
  const nxt = fnFrom(html, 'function chatNext() {');
  ok(tag + ' (7) chatNext reconstruye antes de preguntar', !!nxt && has(nxt, 'chatRebuildLog();'));
  const tk = stmtFrom(html, 'const TK_STEPS = [');
  ok(tag + ' (8) TK_STEPS con 4 pasos en vivo', !!tk && has(tk, tag === 'ES' ? 'Mirando tus posteos' : 'Looking at your posts') && has(tk, tag === 'ES' ? 'Armando tu semana' : 'Putting your week together'));
  ok(tag + ' (8) estados del tracker', has(html, 'TK_STATE_QUEUED') && has(html, 'TK_STATE_NOW') && has(html, 'TK_STATE_DONE'));
  ok(tag + ' (8) pasos .bstep + imagen trabajando', has(html, 'bstep') && has(html, 'tk-work'));
  ok(tag + ' (8) píldora POSTY ESTÁ TRABAJANDO', has(html, tag === 'ES' ? 'POSTY ESTÁ TRABAJANDO' : 'POSTY IS WORKING'));
  ok(tag + ' (8) subtítulo con producto real', has(html, tag === 'ES' ? 'Con tu producto real, tus fotos y tu tono — nada genérico.' : 'With your real product, your photos and your tone — nothing generic.'));
  ok(tag + ' (8) título «Posty está armando tu semana»', has(html, tag === 'ES' ? "trackerStart('Posty está armando tu semana')" : "trackerStart('Posty is putting your week together')"));
  ok(tag + ' (8) confetti 42 piezas, colores Posty', has(html, 'function ocConfetti()') && has(html, 'for (var i = 0; i < 42; i++)') && has(html, "'#2793C8', '#FEC14D', '#2FBF71', '#FF7BAC', '#1668A0'"));
  const fin = fnFrom(html, 'function finishGeneration(data, genSecs) {');
  ok(tag + ' (8) finishGeneration celebra con confetti', !!fin && has(fin, 'ocConfetti();'));
  ok(tag + ' (8) .res-hero relativo + .oc-confetti absoluto', has(html, '.res-hero{position:relative}') && has(html, '.oc-confetti{position:absolute'));
  // Rama honesta, estudio, resume, render, pantallas.
  ok(tag + ' (6) buildPlan suma rubro+ubicación si el estudio falló', has(html, 'if (chatHonestNeeded()) {') && has(html, "if (plan.indexOf('rubro') < 0) plan.push('rubro');"));
  ok(tag + ' (6) banderas de estudio por fuente', ['S.igTried', 'S.igOk', 'S.webTried', 'S.webOk'].every((f) => count(html, f) >= 3));
  ok(tag + ' (6) resume guarda chatPushedQ + banderas', has(html, 'chatPushedQ: S.chatPushedQ || {}') && has(html, 'igTried: !!S.igTried'));
  ok(tag + ' (3) chatRenderOpts muestra encabezado + conteo', has(html, 'oc-opts-head') && has(html, 'T.optsHead'));
  ok(tag + ' (4) cardHTML con emoji y libre a lo ancho', has(html, 'oc-card-e') && has(html, "opt.v === '__libre__' ? ' oc-free'"));
  ok(tag + ' (4) pantallas con nombre q2-q5', ['function screenQ2(', 'function screenQ3(', 'function screenQ4(', 'function screenQ5('].every((f) => has(html, f)));
  // (9) Sin tocar: las 5 preguntas, su orden, la condicional de email, paridad.
  ok(tag + ' (9) plan de 8 preguntas en orden', has(html, "keys = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];"));
  ok(tag + ' (9) ubicación por email intacta', has(html, "if (S.source === 'email') { plan.push('rubro', 'donde'); }"));
  // Regresión v756 (el eco no vuelve): contadores del censo post-v756.
  ok(tag + ' (v756) chatIsScriptedQuestion sigue (2)', count(html, 'chatIsScriptedQuestion') === 2);
  ok(tag + ' (v756) S.chatLastId = 0 ausente', count(html, 'S.chatLastId = 0') === 0);
  const ask = fnFrom(html, 'function chatAskCurrent() {');
  ok(tag + ' (v756) push local guardado con chatPushedQ', !!ask && has(ask, 'if (!S.chatPushedQ[key])'));
}

// ---------- estático: servidor ----------
console.log('— S) estático servidor —');
ok('SRV INSERT INTO chat_messages sigue en 28 (v756 intacto)', count(srv, 'INSERT INTO chat_messages') === 28);
{
  const qi = srv.indexOf("if (kind === 'question') {");
  const ai = srv.indexOf("if (kind === 'answer') {", qi);
  const handler = qi >= 0 && ai > qi ? srv.slice(qi, ai) : '';
  ok('SRV kind question sigue sin INSERT (solo evento)', !!handler && !has(handler, 'INSERT INTO'));
}
const ocCta = stmtFrom(srv, 'const OC_CTA = [');
const ocPromo = stmtFrom(srv, 'const OC_PROMO = [');
const ocVoz = stmtFrom(srv, 'const OC_VOZ = [');
const ocPrecios = stmtFrom(srv, 'const OC_PRECIOS = [');
for (const v of ['domicilio', 'turno', 'tienda', 'llamar']) ok('SRV OC_CTA tiene ' + v, !!ocCta && has(ocCta, "'" + v + "'"));
for (const v of ['3x2', 'cuotas', 'regalo', 'combo', 'temporal']) ok('SRV OC_PROMO tiene ' + v, !!ocPromo && has(ocPromo, "'" + v + "'"));
for (const v of ['inspirador', 'educativo', 'directo', 'canchero']) ok('SRV OC_VOZ tiene ' + v, !!ocVoz && has(ocVoz, "'" + v + "'"));
for (const v of ['algunos', 'aveces']) ok('SRV OC_PRECIOS tiene ' + v, !!ocPrecios && has(ocPrecios, "'" + v + "'"));
ok('SRV clean 60 para cta/promo/voz/precios', has(srv, 'cta: clean(f.cta, 60),') && has(srv, 'promo: clean(f.promo, 60),') && has(srv, 'voz: clean(f.voz, 60),') && has(srv, 'precios: clean(f.precios, 60),'));
ok('SRV campos mix q2-q5', ['cta_mix:', 'promo_mix:', 'voz_mix:', 'precios_mix:'].every((f) => has(srv, f)));
ok('SRV gate acepta texto libre (mix libre)', has(srv, "a.cta_mix === 'libre'") && has(srv, "a.promo_mix === 'libre'") && has(srv, "a.voz_mix === 'libre'") && has(srv, "a.precios_mix === 'libre'"));
ok('SRV goal lines con valores nuevos', has(srv, 'pedidos a domicilio') && has(srv, 'cuotas sin interés') && has(srv, 'solo en algunos productos'));
ok('SRV goal lines con texto libre literal', has(srv, '(con sus palabras)') && has(srv, '(in their words)'));

// ---------- estático: draft Solo Hacienda Campos (mock v2 aprobado 7/11) ----------
// El fix mínimo (recortes de la misma foto) quedó SUPERSEDED por el mock v2:
// 3 FOTOS DISTINTAS del mismo rubro, diferencia MUY visible, vista previa
// grande con la foto de la opción elegida, marca con el logo ENCIMA de una
// foto distinta (nunca logo solo), paquete con fotos distintas sin repetir.
console.log('— S) estático draft (Solo Hacienda Campos, mock v2) —');
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  const pool = fnFrom(html, 'function draftPhotoPool() {');
  ok(tag + ' (draft) el pool NO incluye la foto de perfil (logo)', !!pool && !has(pool, 'PREFILL.photo'));
  const photoFor = fnFrom(html, 'function draftPhotoFor(');
  ok(tag + ' (draft) draftPhotoFor NO cae al logo', !!photoFor && !has(photoFor, 'PREFILL.photo'));
  ok(tag + ' (draft) draftLogoPhoto sigue (solo para la opción marca)', count(html, 'function draftLogoPhoto()') === 1);
  ok(tag + ' (draft) fuera DRAFT_CROPS / DRAFT_CROP_DESC / draftDedupePicks', !has(html, 'DRAFT_CROPS') && !has(html, 'DRAFT_CROP_DESC') && !has(html, 'draftDedupePicks') && !has(html, 'DRAFT_CHAMP_CROPS'));
  ok(tag + ' (draft) ningún recorte crop-* en el código', !has(html, 'crop-close') && !has(html, 'crop-action') && !has(html, 'crop-brand') && !has(html, 'img.crop-'));
  const cardPhoto = fnFrom(html, 'function draftCardPhoto(');
  ok(tag + ' (draft) draftCardPhoto devuelve {src, desc, logo} sin crop', !!cardPhoto && has(cardPhoto, 'draftPoolUnused') && has(cardPhoto, 'logo:') && !has(cardPhoto, 'crop'));
  ok(tag + ' (draft) marca = tercera foto distinta + logo encima', !!cardPhoto && has(cardPhoto, "return { src: unused[2] || null, desc: DRAFT_DESC.foto.marca, logo: logo }"));
  ok(tag + ' (draft) producto = primera sin usar, acción = segunda sin usar', !!cardPhoto && has(cardPhoto, 'unused[0]') && has(cardPhoto, 'unused[1]'));
  const ddesc = fnFrom(html, 'var DRAFT_DESC = {');
  ok(tag + ' (draft) DRAFT_DESC con rótulos del mock v2', !!ddesc && has(ddesc, tag === 'ES' ? "producto: 'Tu producto, enorme en la foto'" : "producto: 'Your product, huge in the photo'") && has(ddesc, tag === 'ES' ? "accion: 'En uso, con vida'" : "accion: 'In use, full of life'") && has(ddesc, tag === 'ES' ? "marca: 'Tu logo, grande y al centro'" : "marca: 'Your logo, big and front and center'"));
  const dprev = fnFrom(html, 'var DRAFT_PREVIEW_DESC = {');
  ok(tag + ' (draft) DRAFT_PREVIEW_DESC con 3 captions', !!dprev && has(dprev, 'producto:') && has(dprev, 'accion:') && has(dprev, 'marca:'));
  ok(tag + ' (draft) rótulos de opción del mock v2', has(html, tag === 'ES' ? "{ v: 'producto', l: 'Gigante' }" : "{ v: 'producto', l: 'Huge' }") && has(html, tag === 'ES' ? "{ v: 'accion', l: 'En acción' }" : "{ v: 'accion', l: 'In action' }") && has(html, tag === 'ES' ? "{ v: 'marca', l: 'Marca al frente' }" : "{ v: 'marca', l: 'Brand front and center' }"));
  ok(tag + ' (draft) copy sin «draft» en DRAFT_T.chat', has(html, tag === 'ES' ? "chat: 'Elegí tu favorita:" : "chat: 'Pick your favorite:"));
  const round = fnFrom(html, 'function draftShowRound(');
  ok(tag + ' (draft) ronda foto: preview grande + chip + botón Seguir', !!round && has(round, 'oc-draft-preview') && has(round, 'oc-draft-chip') && has(round, 'oc_foto_go') && has(round, 'oc-grid-3') && has(round, 'oc-pick-tick'));
  ok(tag + ' (draft) ronda foto: preview muestra la elegida y cambia al tocar', !!round && has(round, 'paintPreview') && has(round, 'draftFotoPreviewData'));
  ok(tag + ' (draft) ronda usa box local + stem + show + scroll (nunca DR.box)', !!round && has(round, 'var box = ocq();') && has(round, 'stemHTML()') && has(round, "show('v-ocq')") && !has(round, 'DR.box'));
  ok(tag + ' (draft) volver de ronda restaura la anterior (nunca draftBack)', !!round && has(round, 'DR.picks.length = round - 1') && !has(round, 'draftBack'));
  const champ = fnFrom(html, 'function draftShowChamp(');
  ok(tag + ' (draft) favorita: cierra con draftFinish + DR.champ + burst', !!champ && has(champ, 'draftFinish();') && has(champ, 'DR.champ = {') && has(champ, 'draftBurst(c)'));
  ok(tag + ' (draft) favorita: logo encima de la foto + prompt por tarjeta', !!champ && has(champ, 'oc-draft-logo-over') && has(champ, 'draftPromptFor(p)'));
  ok(tag + ' (draft) tarjeta de ronda envuelve la imagen en .oc-draft-img', has(html, '<span class="oc-draft-img"><img src="\' + esc(card.src)'));
  ok(tag + ' (draft) tarjeta de favorita envuelve la imagen en .oc-draft-img', has(html, '<span class="oc-draft-img"><img src="\' + esc(p.foto)'));
  ok(tag + ' (draft) sin foto hay estado honesto, no logo', has(html, 'oc-draft-nophoto') && has(html, 'T.draftNoPhoto'));
  ok(tag + ' (draft) la regla vieja .oc-draft-card img con altura fija ya no existe', !has(html, '.oc-draft-card img{width:100%;height:148px'));
  ok(tag + ' (draft) CSS .oc-draft-img relativo con overflow:hidden y 148px', has(html, '.oc-draft-img{position:relative;display:block;height:148px;overflow:hidden'));
  ok(tag + ' (draft) CSS .oc-draft-img img a lo alto del marco', has(html, '.oc-draft-img img{width:100%;height:100%;object-fit:cover;display:block}'));
  ok(tag + ' (draft) CSS preview grande + chip + botón seguir', has(html, '.oc-draft-img.big{height:260px}') && has(html, '.oc-draft-chip{') && has(html, '.oc-draft-go{'));
  const mini = fnFrom(html, 'function draftMiniHTML() {');
  ok(tag + ' (draft) el paquete NUNCA muestra «?»', !!mini && !has(mini, '">?</span>'));
  ok(tag + ' (draft) hueco sin pick = pendiente con puntos', !!mini && has(mini, 'oc-draft-slot pending') && has(mini, 'oc-slot-dots'));
  ok(tag + ' (draft) la mini ya no usa recortes con scale', !!mini && !has(mini, 'crop'));
  ok(tag + ' (draft) CSS pendiente + puntos de carga', has(html, '.oc-draft-slot.pending{') && has(html, '.oc-slot-dots i{') && has(html, '@keyframes oc-slot-dot'));
}

// ---------- estático: análisis en paralelo + perfil de estilo (E) ----------
console.log('— S) estático estilo (análisis en paralelo) —');
{
  const fa = fs.readFileSync(path.join(T, 'feed-audit.js'), 'utf8');
  ok('E0 feed-audit exporta el perfil de estilo', has(fa, 'trialStyleProfile') && has(fa, 'paletteProfileFromHexes') && has(fa, 'analyzePaletteBuckets') && has(fa, 'hueName') && has(fa, 'analyzePaletteBuckets,') && has(fa, 'trialStyleProfile,'));
  ok('E0 trialStyleProfile: ritmo, captions, hashtags, mejores, paleta', has(fa, 'posts_per_week') && has(fa, 'avg_caption_words') && has(fa, 'hashtags_top') && has(fa, 'best_posts') && has(fa, 'palette_names'));
  ok('E0 trialStyleProfile: mejores por likes, paleta con tope de tiempo', has(fa, 'b.likes - a.likes') && has(fa, '1500'));
  ok('E0 trialStyleProfile: sin posts ni paleta web devuelve null', has(fa, 'if (!list.length && !(opts && Array.isArray(opts.webPalette)'));
  ok('SRV prefill devuelve el estilo de IG', has(srv, 'style: styleIg,') && has(srv, 'trialStyleProfile('));
  ok('SRV web-prefill devuelve el estilo de la paleta web', has(srv, 'style: feedAudit.paletteProfileFromHexes(data.palette || []),'));
  ok('SRV parseTrialStyle + styleGoalLines definidos', has(srv, 'function parseTrialStyle(') && has(srv, 'function styleGoalLines('));
  ok('SRV styleGoalLines se suma al fundamento en las dos generaciones', count(srv, 'styleGoalLines(estilo, lang)') === 2);
  ok('SRV estilo se parsea en las dos generaciones', count(srv, 'parseTrialStyle(fields && fields.estilo)') === 2);
}
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  ok(tag + ' (E) buildGenFormData manda el estilo observado', has(html, "fd.append('estilo', JSON.stringify(S.style))"));
  ok(tag + ' (E) la generación espera el estudio (tope 15 s, nunca bloquea)', has(html, 'if (S.studyPromise)') && has(html, 'setTimeout(r, 15000)'));
  const sff = fnFrom(html, 'function startFromField(');
  ok(tag + ' (E) la entrada abre el chat ANTES del estudio', !!sff && sff.indexOf('buildPlan(); currentScreen();') >= 0 && sff.indexOf('buildPlan(); currentScreen();') < sff.indexOf('S.studyPromise = studyBoth'));
  const sb = fnFrom(html, 'function studyBoth(');
  ok(tag + ' (E) studyBoth ya no reconstruye el plan ni abre pantallas', !!sb && !has(sb, 'buildPlan()') && !has(sb, 'currentScreen()') && has(sb, 'studySoftApply();'));
  ok(tag + ' (E) studySoftApply + mergeStyle + chatStyleLine definidas', has(html, 'function studySoftApply() {') && has(html, 'function mergeStyle(') && has(html, 'function chatStyleLine() {'));
  const ssa = fnFrom(html, 'function studySoftApply() {');
  ok(tag + ' (E) studySoftApply no resetea el progreso (buildPlan solo si no hay plan)', !!ssa && has(ssa, "if (!S.plan || !S.plan.length) { buildPlan(); currentScreen(); return; }") && has(ssa, 'while (S.qi < S.plan.length') && has(ssa, "S.plan.splice(S.qi, 0, 'rubro')"));
  ok(tag + ' (E) estudio en silencio no pinta la pantalla «…» encima del chat', count(html, 'if (!quiet) renderStudy(T.studyIg);') === 1 && count(html, 'if (!quiet) renderStudy(T.studyWeb);') === 1);
  ok(tag + ' (E) el estilo del estudio se mezcla en S.style', count(html, 'if (d.style) S.style = mergeStyle(S.style, d.style);') === 2);
  ok(tag + ' (E) S guarda estilo + estado del estudio', has(html, 'style: null, studyPending: false, studyPromise: null'));
  ok(tag + ' (E) resume guarda el estilo', has(html, 'style: S.style || null,'));
}

// ---------- estático: prompt por posteo (F) ----------
console.log('— S) estático prompt por posteo —');
ok('SRV trialPostPrompt definido (palabras simples + detalle)', has(srv, 'function trialPostPrompt(o) {') && has(srv, 'prompt_simple') && has(srv, 'prompt_detalle'));
ok('SRV el prompt se adjunta en los 5 caminos (plantilla, IA, anclado, video, no-stream)', count(srv, 'trialPostPrompt(') === 6);
ok('SRV luz natural SOLO para piezas IA', has(srv, "if (post.ai) parts.push(T('foto realista con luz natural'"));
ok('SRV sin partes el prompt cae al fallback honesto', has(srv, 'hecho con tu producto y tu estilo'));
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  ok(tag + ' (F) la semana muestra prompt simple + detalle desplegable', has(html, 'oc-prompt') && has(html, 'T.promptHow') && has(html, 'prompt_simple'));
  ok(tag + ' (F) el lightbox muestra el prompt', has(html, "getElementById('lbPrompt')") && has(html, '<div id="lbPrompt" style="display:none"></div>'));
  const champF = fnFrom(html, 'function draftShowChamp(');
  ok(tag + ' (F) la favorita muestra el prompt por tarjeta', !!champF && has(champF, 'draftPromptFor(p)') && has(champF, 'oc-prompt'));
  ok(tag + ' (F) draftPromptFor definido (solo lo real)', has(html, 'function draftPromptFor('));
}

// ---------- estático: entrada web igual que IG (G) ----------
console.log('— S) estático entrada (web igual que IG) —');
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  ok(tag + ' (G) dos filas de entrada iguales (input + botón cada una)', count(html, '<div class="oc-entry-row">') === 2 && count(html, 'id="oc_go_ig"') === 1 && count(html, 'id="oc_go_web"') === 1);
  ok(tag + ' (G) sin escape «No tengo web» ni botón único', !has(html, 'oc_noweb') && !has(html, 'id="oc_go"'));
  ok(tag + ' (G) copy compartido arriba + confianza abajo', has(html, tag === 'ES' ? 'Pegá tu Instagram o tu web y mirá tu semana real, con tu marca ✌️' : 'Paste your Instagram or your website and see your real week, with your brand ✌️') && has(html, 'oc-trust'));
  ok(tag + ' (G) placeholders @ y web', has(html, tag === 'ES' ? "'@tu_negocio'" : "'@your_business'") && has(html, tag === 'ES' ? "'www.tunegocio.com.ar'" : "'www.yourbusiness.com'"));
  ok(tag + ' (G) sin framing «¿Preferís?» para la web', !has(html, '¿Preferís? Pegá la web'));
  ok(tag + ' (G) CSS filas iguales + confianza', has(html, '.oc-entry-row{margin-bottom:14px}') && has(html, '.oc-entry-row .oc-btn{margin-top:8px}') && has(html, '.oc-trust{'));
  const eb = fnFrom(html, 'function entryBusy(');
  ok(tag + ' (G) entryBusy desactiva los dos botones', !!eb && has(eb, "['oc_go_ig', 'oc_go_web']"));
  const sffG = fnFrom(html, 'function startFromField(');
  ok(tag + ' (G) startFromField distingue vía ig/web', !!sffG && has(sffG, "if (via === 'web' && !web)") && has(sffG, "if (via !== 'web' && !ig)"));
}

// ---------- cliente en vm ----------
const CLIENT_FNS = [
  'function esc(',
  'function chatQText(',
  'function chatAnswerLabel(',
  'function q2Options() {',
  'function chatOptionsFor(',
  'function chatLibrePh(',
  'function chatLibreHint(',
  'function chatLibre(',
  'function chatKnownRows() {',
  'function chatHonestNeeded() {',
  'function chatHonestRows() {',
  'function chatJoinHonestText() {',
  'function chatReactionFor(',
  'function chatQIntro(',
  'function chatRebuildLog() {',
  'function chatAskCurrent() {',
  'function chatNext() {',
  'function chatPick(',
  'function chatBack() {',
  'function chatBackTo(',
  'function chatClearFrom(',
  'function chatLogHTML(',
  'function buildPlan() {',
  'function dondeAprendido(',
  'function draftPhotoPool() {',
  'function draftPhotoFor(',
  'function draftStarName() {',
  'function draftLogoPhoto() {',
  'function draftCardPhoto(',
  'function draftMiniHTML() {',
  'function draftPoolUnused() {',
  'function mergeStyle(',
  'function studySoftApply() {',
  'function chatStyleLine() {',
  'function draftPromptFor(',
  'function draftFotoDefaultSel(',
  'function draftFotoPreviewData(',
  'function startFromField(',
];
const CLIENT_OBJS = ['var T = {', 'const CATS = {', 'var DYN_TARGET_TO_KEY = {', 'var DRAFT_DESC = {', 'var DRAFT_PREVIEW_DESC = {', 'var DRAFT_OPTS = {'];
const CLIENT_ARRS = ['var Q2_ALL = [', 'var Q3 = [', 'var Q4 = [', 'var Q5 = [', 'var DONDE = [', 'const cleanIg = '];

function loadClient(html) {
  const parts = [];
  for (const sig of CLIENT_FNS) {
    const s = fnFrom(html, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  for (const sig of CLIENT_OBJS) {
    const s = fnFrom(html, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  for (const sig of CLIENT_ARRS) {
    const s = stmtFrom(html, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  return { code: parts.join('\n') };
}

function makeCtx(loaded) {
  const posts = [];
  const calls = [];
  const fakeInput = { placeholder: '', focus() {} };
  const fakeHint = { textContent: '' };
  const ctx = {
    console, S: {},
    window: {},
    document: {
      documentElement: { lang: 'es' },
      getElementById: (id) => (id === 'oc_chat_in' ? fakeInput : id === 'oc_chat_hint' ? fakeHint : { appendChild() {}, scrollTop: 0, scrollHeight: 0 }),
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { add() {} } }),
      querySelector: () => null,
    },
    setTimeout: () => 0,
  };
  ctx.chatPost = (kind, p) => { posts.push({ kind, p }); return Promise.resolve({ ok: true, msg_id: 0 }); };
  ctx.chatSeenAdd = () => {};
  ctx.chatPollStop = () => calls.push('pollStop');
  ctx.chatRender = () => calls.push('render');
  ctx.chatRenderOpts = () => calls.push('renderOpts');
  ctx.chatScrollBottom = () => {};
  ctx.sprout = () => calls.push('sprout');
  ctx.goEntry = () => calls.push('goEntry');
  ctx.dondeFollow = () => calls.push('dondeFollow');
  ctx.opResumeSave = (st) => calls.push('resume:' + st);
  ctx.etapaDetectada = () => null;
  ctx.etapaLabel = (v) => v;
  ctx.chatGaps = () => ({ known: {}, needed: [] });
  vm.createContext(ctx);
  vm.runInContext(loaded.code, ctx);
  return { ctx, posts, calls, fakeInput, fakeHint };
}
function run(ctx, code) { return vm.runInContext(code, ctx); }
function setS(ctx, code) { vm.runInContext(code, ctx); }

function parteB() {
  console.log('— B) cliente en vm —');
  for (const [tag, html] of [['ES', es], ['EN', en]]) {
    const loaded = loadClient(html);
    ok(`B0 ${tag} se extraen las funciones del chat + draft`, !loaded.error, loaded.error || '');
    if (loaded.error) continue;
    const { ctx, posts, calls, fakeInput, fakeHint } = makeCtx(loaded);
    ctx.document.documentElement.lang = tag === 'EN' ? 'en' : 'es';
    const Tvm = run(ctx, 'T');

    // (4) Todas las opciones por pregunta + libre en las seis.
    // 'seguirme' solo aparece con señal de creador (filtro previo intacto).
    setS(ctx, `S = { facts: { _known: false, is_creator: true }, ans: {}, products: [] }; WEB = undefined;`);
    const q2all = run(ctx, 'q2Options()');
    ok(`B1 ${tag} q2 trae las 9 opciones (5 viejas + domicilio/turno/tienda/llamar)`, Array.isArray(q2all) && q2all.length === 10 && ['reservar', 'escribirte', 'local', 'comprar', 'seguirme', 'domicilio', 'turno', 'tienda', 'llamar'].every((v) => q2all.some((o) => o.v === v)), JSON.stringify(q2all));
    ok(`B1 ${tag} q2: cada opción con emoji+sub y __libre__ al final (sin emoji, con sub)`, q2all.filter((o) => o.v !== '__libre__').every((o) => o.e && o.sub) && q2all[q2all.length - 1].v === '__libre__' && q2all[q2all.length - 1].l === Tvm.libre && q2all[q2all.length - 1].sub === Tvm.libreSub, JSON.stringify(q2all));
    setS(ctx, `S = { facts: { _known: true, has_local: false, takes_reservations: true, sells_online: true, is_creator: false }, ans: { q1mix: 'uno' }, products: [] };`);
    const q2known = run(ctx, 'q2Options()');
    ok(`B1 ${tag} q2 con estudio: sin local ni seguirme (no se inventan)`, q2known.some((o) => o.v === 'reservar') && !q2known.some((o) => o.v === 'local') && !q2known.some((o) => o.v === 'seguirme'), JSON.stringify(q2known));
    for (const [key, vals, n] of [['q3', ['ninguna', 'porcentaje', '2x1', 'envio', '3x2', 'cuotas', 'regalo', 'combo', 'temporal'], 10], ['q4', ['cercano', 'profesional', 'divertido', 'elegante', 'inspirador', 'educativo', 'directo', 'canchero'], 9], ['q5', ['si', 'ofertas', 'no', 'algunos', 'aveces'], 6]]) {
      const opts = run(ctx, `chatOptionsFor('${key}')`);
      ok(`B1 ${tag} ${key}: todas las opciones (${n - 1}) + libre`, Array.isArray(opts) && opts.length === n && vals.every((v) => opts.some((o) => o.v === v)) && opts[opts.length - 1].v === '__libre__', JSON.stringify(opts));
      ok(`B1 ${tag} ${key}: cada opción con emoji+sub`, opts.filter((o) => o.v !== '__libre__').every((o) => o.e && o.sub), JSON.stringify(opts));
    }
    setS(ctx, `S = { facts: {}, ans: {}, products: [] }; WEB = { city: 'Palermo' };`);
    const ubic = run(ctx, `chatOptionsFor('ubicacion')`);
    ok(`B1 ${tag} ubicación: ciudad real primera + 6 genéricas + libre`, Array.isArray(ubic) && ubic.length === 8 && ubic[0].v === 'Palermo' && ubic[0].e === '📍' && [Tvm.ubicDomicilio, Tvm.ubicOnline, Tvm.ubicEnvios, Tvm.ubicFerias, Tvm.ubicEncargo, Tvm.ubicLocalOnline].every((l) => ubic.some((o) => o.l === l)) && ubic[ubic.length - 1].v === '__libre__', JSON.stringify(ubic));

    // (5) «Lo que ya sé de vos» + (6) rama honesta.
    setS(ctx, `S = { cat: 'cafeteria', facts: { address: 'Calle Falsa 123' }, products: [{ nombre: 'Café de especialidad' }], igTried: true, igOk: true, webTried: true, webOk: true }; WEB = { city: 'Palermo' };`);
    const known = run(ctx, 'chatKnownRows()');
    const catLabel = run(ctx, "CATS['cafeteria']");
    ok(`B2 ${tag} conocida: rubro + ciudad (web manda) + estrella`, known.length === 3 && known[0].v === catLabel && known[1].v === 'Palermo' && known[2].v === 'Café de especialidad', JSON.stringify(known));
    setS(ctx, `S = { cat: '', facts: {}, products: [], igTried: false, igOk: false, webTried: false, webOk: false }; WEB = undefined;`);
    ok(`B2 ${tag} conocida: sin nada aprendido no hay tarjeta`, run(ctx, 'chatKnownRows()').length === 0);
    setS(ctx, `S = { cat: '', facts: {}, products: [], igTried: true, igOk: false, webTried: false, webOk: false }; WEB = undefined;`);
    ok(`B3 ${tag} honesta: IG fallido → hace falta`, run(ctx, 'chatHonestNeeded()') === true);
    const hrows = run(ctx, 'chatHonestRows()');
    ok(`B3 ${tag} honesta: fila IG con ✕ + qué hago entonces`, hrows.length === 2 && hrows[0].l === Tvm.honestIg && hrows[0].mark === '✕' && hrows[1].l === Tvm.honestThen, JSON.stringify(hrows));
    ok(`B3 ${tag} honesta: saludo de frente (IG)`, run(ctx, 'chatJoinHonestText()') === Tvm.chatJoinHonest);
    setS(ctx, `S = { cat: '', facts: {}, products: [], igTried: true, igOk: true, webTried: true, webOk: false }; WEB = undefined;`);
    ok(`B3 ${tag} honesta: solo web fallida → saludo de web`, run(ctx, 'chatHonestNeeded()') === true && run(ctx, 'chatJoinHonestText()') === Tvm.chatJoinHonestWeb && run(ctx, 'chatHonestRows()')[0].l === Tvm.honestWeb);
    setS(ctx, `S = { cat: '', facts: {}, products: [], igTried: true, igOk: true, webTried: true, webOk: true }; WEB = undefined;`);
    ok(`B3 ${tag} honesta: estudio vacío (nada usable) también es honesta`, run(ctx, 'chatHonestNeeded()') === true);
    setS(ctx, `S = { cat: 'cafeteria', facts: { _known: true }, products: [{ nombre: 'Café' }], igTried: true, igOk: true, webTried: true, webOk: true }; WEB = { city: 'Palermo' };`);
    ok(`B3 ${tag} honesta: estudio bien leído → no hace falta`, run(ctx, 'chatHonestNeeded()') === false);
    setS(ctx, `S = { cat: '', facts: {}, products: [], igTried: false, igOk: false, webTried: false, webOk: false }; WEB = undefined;`);
    ok(`B3 ${tag} honesta: sin intento de estudio no hay rama`, run(ctx, 'chatHonestNeeded()') === false);

    // Rebuild: tarjeta conocida XOR honesta + reacciones + saludo.
    setS(ctx, `S = { source: 'ig', cat: 'cafeteria', facts: {}, products: [{ nombre: 'Café' }], ans: { rubro: 'cafeteria' }, plan: ['rubro', 'ubicacion', 'q1'], qi: 1, chatPushedQ: { q1: 1 }, igTried: true, igOk: true, webTried: true, webOk: true }; WEB = { city: 'Palermo' };`);
    run(ctx, 'chatRebuildLog()');
    let log = run(ctx, 'S.chatLog');
    ok(`B4 ${tag} rebuild: saludo + conocida (3 filas) + burbuja rubro + respuesta + reacción`, log.length === 5 && log[0].t === Tvm.chatJoin && log[1].known && log[1].known.length === 3 && log[2].w === 'bot' && log[3].w === 'user' && log[3].t === 'cafeteria' && log[4].reaction === 1 && log[4].t === Tvm.reactRubro, JSON.stringify(log));
    ok(`B4 ${tag} rebuild: resetea chatPushedQ`, Object.keys(run(ctx, 'S.chatPushedQ')).length === 0);
    setS(ctx, `S = { source: 'ig', cat: '', facts: {}, products: [], ans: {}, plan: ['rubro', 'ubicacion', 'q1'], qi: 0, chatPushedQ: {}, igTried: true, igOk: false, webTried: false, webOk: false }; WEB = undefined;`);
    run(ctx, 'chatRebuildLog()');
    log = run(ctx, 'S.chatLog');
    ok(`B4 ${tag} rebuild honesto: saludo honesto + tarjeta honesta, SIN conocida`, log.length === 2 && log[0].t === Tvm.chatJoinHonest && log[1].honest && log[1].honest.length === 2 && !log.some((m) => m.known), JSON.stringify(log));

    // (7) Volver: varias vueltas, cambio de respuesta, sin duplicados.
    setS(ctx, `S = { source: 'ig', ig: 'test', web: '', cat: '', facts: {}, products: [{ nombre: 'Café' }], ans: {}, plan: ['q1', 'q2', 'q3'], qi: 0, chatLog: [], chatPushedQ: {}, chatPostedQ: {}, chatJoined: true, igTried: true, igOk: true, webTried: true, webOk: true }; WEB = undefined;`);
    run(ctx, 'chatRebuildLog(); chatAskCurrent();');
    ok(`B5 ${tag} flujo: primera pregunta es tarjeta destacada q1`, run(ctx, 'S.chatLog').filter((m) => m.qcard).length === 1 && run(ctx, 'S.chatLog').some((m) => m.qcard === 'q1'));
    run(ctx, `chatPick('q1', 'Café');`);
    log = run(ctx, 'S.chatLog');
    ok(`B5 ${tag} flujo: responder q1 baja a burbuja + reacción y sube q2`, log.filter((m) => m.qcard).length === 1 && log.some((m) => m.qcard === 'q2') && log.some((m) => m.w === 'user' && m.t === 'Café') && log.some((m) => m.reaction === 1 && m.t === Tvm.reactQ1), JSON.stringify(log));
    run(ctx, `chatPick('q2', 'reservar');`);
    log = run(ctx, 'S.chatLog');
    ok(`B5 ${tag} flujo: responder q2 sube q3, dos respuestas en el hilo`, log.filter((m) => m.qcard).length === 1 && log.some((m) => m.qcard === 'q3') && log.filter((m) => m.w === 'user').length === 2, JSON.stringify(log));
    run(ctx, 'chatBack();');
    log = run(ctx, 'S.chatLog');
    const labelReservar = run(ctx, "Q2_ALL.filter(function(o){return o.v==='reservar'})[0].l");
    ok(`B5 ${tag} volver: borra q2 en adelante y re-muestra q2 fresca`, run(ctx, 'S.qi') === 1 && run(ctx, 'S.ans.q2') === undefined && log.filter((m) => m.qcard).length === 1 && log.some((m) => m.qcard === 'q2') && log.filter((m) => m.w === 'user').length === 1 && !log.some((m) => m.w === 'user' && m.t === labelReservar), JSON.stringify(log));
    run(ctx, `chatPick('q2', 'escribirte');`);
    log = run(ctx, 'S.chatLog');
    const labelEscribirte = run(ctx, "Q2_ALL.filter(function(o){return o.v==='escribirte'})[0].l");
    ok(`B5 ${tag} volver: cambiar la respuesta no duplica ni deja la vieja`, log.filter((m) => m.w === 'user').map((m) => m.t).join('|') === 'Café|' + labelEscribirte && log.filter((m) => m.qcard).length === 1, JSON.stringify(log));
    run(ctx, `chatBackTo('q1');`);
    log = run(ctx, 'S.chatLog');
    ok(`B5 ${tag} volver a q1: todo borrado, solo saludo + conocida + q1`, run(ctx, 'S.qi') === 0 && run(ctx, 'S.ans.q1') === undefined && log.filter((m) => m.w === 'user').length === 0 && log.filter((m) => m.qcard).length === 1 && log.some((m) => m.qcard === 'q1'), JSON.stringify(log));
    run(ctx, 'chatAskCurrent(); chatAskCurrent();');
    ok(`B5 ${tag} doble ask no duplica la tarjeta`, run(ctx, 'S.chatLog').filter((m) => m.qcard).length === 1);
    calls.length = 0;
    run(ctx, 'chatBack();');
    ok(`B5 ${tag} volver en q1=0 va a la entrada`, calls.includes('goEntry'));

    // Tarjeta destacada: chapita, intro, pregunta, pista, volver, avatar.
    setS(ctx, `S = { plan: ['q1', 'q2', 'q3'], qi: 1, ans: {}, products: [{ nombre: 'Café' }] };`);
    const qhtml = run(ctx, `chatLogHTML({ w: 'bot', qcard: 'q2' })`);
    const badge = Tvm.qBadge.replace('{n}', '2').replace('{total}', '3');
    ok(`B6 ${tag} qcard: chapita + intro + pregunta + pista + volver + avatar`, typeof qhtml === 'string' && qhtml.includes(badge) && qhtml.includes(Tvm.qIntroQ2) && qhtml.includes(Tvm.q2) && qhtml.includes(Tvm.qHint) && qhtml.includes('data-ocback') && qhtml.includes('posty-con-placa.png') && qhtml.includes('oc-qcard'), qhtml);
    setS(ctx, `S = { plan: ['q1', 'q2', 'q3'], qi: 0, ans: {}, products: [] };`);
    ok(`B6 ${tag} qcard en qi=0 no trae volver`, !run(ctx, `chatLogHTML({ w: 'bot', qcard: 'q1' })`).includes('data-ocback'));
    const botHtml = run(ctx, `chatLogHTML({ w: 'bot', t: 'hola' })`);
    ok(`B6 ${tag} burbuja bot con avatar real`, botHtml.includes('msg-row bot') && botHtml.includes('msg-ava') && botHtml.includes('posty-con-placa.png'), botHtml);
    const userHtml = run(ctx, `chatLogHTML({ w: 'user', t: 'Palermo' })`);
    ok(`B6 ${tag} burbuja user sin avatar`, userHtml.includes('msg-row user') && !userHtml.includes('posty-con-placa.png'), userHtml);
    setS(ctx, `S = { plan: ['q1'], qi: 0, ans: {}, products: [] };`);
    const knownHtml = run(ctx, `chatLogHTML({ w: 'bot', known: [{ e: '🏪', l: 'Tu rubro', v: 'Cafetería' }] })`);
    ok(`B6 ${tag} tarjeta conocida: título + fila + ✓ + avatar`, knownHtml.includes('known-card') && knownHtml.includes(Tvm.knownTitle) && knownHtml.includes('Cafetería') && knownHtml.includes('✓') && knownHtml.includes('posty-con-placa.png'), knownHtml);
    const honestHtml = run(ctx, `chatLogHTML({ w: 'bot', honest: [{ e: '📸', l: 'Tu Instagram', v: 'No lo pude abrir', mark: '✕', cls: 'miss' }] })`);
    ok(`B6 ${tag} tarjeta honesta: título + ✕`, honestHtml.includes('known-card') && honestHtml.includes(Tvm.honestTitle) && honestHtml.includes('✕'), honestHtml);
    const reactHtml = run(ctx, `chatLogHTML({ w: 'bot', t: '¡Anotado!', reaction: 1 })`);
    ok(`B6 ${tag} reacción como píldora`, reactHtml.includes('oc-reaction') && reactHtml.includes('¡Anotado!'), reactHtml);

    // Intros y reacciones por pregunta.
    setS(ctx, `S = { source: 'email', igTried: false, igOk: false, webTried: false, webOk: false, cat: '', facts: {}, products: [] }; WEB = undefined;`);
    ok(`B7 ${tag} intros: rubro base, ubicación email, q1-q5`, run(ctx, `chatQIntro('rubro')`) === Tvm.qIntroRubroBase && run(ctx, `chatQIntro('ubicacion')`) === Tvm.qIntroUbicacionEmail && run(ctx, `chatQIntro('q1')`) === Tvm.qIntroQ1 && run(ctx, `chatQIntro('q5')`) === Tvm.qIntroQ5 && run(ctx, `chatQIntro('q6')`) === '');
    setS(ctx, `S = { source: 'ig', igTried: true, igOk: false, webTried: false, webOk: false, cat: '', facts: {}, products: [] }; WEB = undefined;`);
    ok(`B7 ${tag} intros: rubro honesto cuando el estudio falló`, run(ctx, `chatQIntro('rubro')`) === Tvm.qIntroRubro);
    ok(`B7 ${tag} reacciones solo rubro/ubicación/q1-q5`, ['rubro', 'ubicacion', 'q1', 'q2', 'q3', 'q4', 'q5'].every((k) => run(ctx, `chatReactionFor('${k}')`)) && ['q6', 'q7', 'q8', 'donde', 'etapa'].every((k) => run(ctx, `chatReactionFor('${k}')`) === ''));

    // Texto libre en las seis preguntas.
    setS(ctx, `S = { source: 'ig', ig: 'test', web: '', cat: '', facts: {}, products: [{ nombre: 'Café' }], ans: {}, plan: ['q2', 'q3', 'q4', 'q5'], qi: 0, chatLog: [], chatPushedQ: {}, chatPostedQ: {}, chatJoined: true, igTried: true, igOk: true, webTried: true, webOk: true }; WEB = undefined;`);
    for (const k of ['q2', 'q3', 'q4', 'q5']) {
      run(ctx, `chatPick('${k}', '__libre__');`);
      ok(`B8 ${tag} libre ${k}: abre el campo con su placeholder`, run(ctx, 'S.chatLibreKey') === k && run(ctx, 'S.chatLibreMode') === 'libre' && fakeInput.placeholder === run(ctx, `chatLibrePh('${k}')`) && fakeHint.textContent === run(ctx, `chatLibreHint('${k}')`), 'ph=' + fakeInput.placeholder + ' hint=' + fakeHint.textContent);
      ok(`B8 ${tag} libre ${k}: placeholder y pista no vacíos`, !!run(ctx, `chatLibrePh('${k}')`) && !!run(ctx, `chatLibreHint('${k}')`));
    }

    // buildPlan: rama honesta suma rubro + ubicación.
    setS(ctx, `S = { source: 'ig', rubroOptions: null, facts: { _known: true }, ans: {}, igTried: true, igOk: false, webTried: false, webOk: false, cat: '', products: [] }; WEB = undefined;`);
    run(ctx, 'buildPlan()');
    const planH = run(ctx, 'S.plan');
    ok(`B9 ${tag} buildPlan honesto: rubro primero, luego ubicación`, Array.isArray(planH) && planH[0] === 'rubro' && planH.indexOf('ubicacion') > 0 && planH.indexOf('rubro') < planH.indexOf('ubicacion'), JSON.stringify(planH));
    setS(ctx, `S = { source: 'ig', rubroOptions: null, facts: { _known: true }, ans: {}, igTried: true, igOk: true, webTried: true, webOk: true, cat: '', products: [] }; WEB = undefined;`);
    run(ctx, 'buildPlan()');
    const planOk = run(ctx, 'S.plan');
    ok(`B9 ${tag} buildPlan sin falla: sin rubro, con ubicación por hueco`, Array.isArray(planOk) && !planOk.includes('rubro') && planOk.includes('ubicacion'), JSON.stringify(planOk));
    setS(ctx, `S = { source: 'email', rubroOptions: null, facts: null, ans: {}, igTried: false, igOk: false, webTried: false, webOk: false, cat: '', products: [] }; WEB = undefined;`);
    run(ctx, 'buildPlan()');
    ok(`B9 ${tag} buildPlan email: rubro, donde, etapa, q1-q8`, JSON.stringify(run(ctx, 'S.plan')) === JSON.stringify(['rubro', 'donde', 'etapa', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8']));

    // Draft (Solo Hacienda Campos, mock v2): 3 fotos DISTINTAS, sin recortes,
    // marca con logo ENCIMA de foto distinta, preview con la elegida.
    setS(ctx, `S = { ans: {}, products: [] }; PREFILL = { photo: 'LOGO-DATA' }; WEB = undefined; DR = { picks: [], champ: null };`);
    ok(`B10 ${tag} draft: sin fotos de producto el pool queda vacío (nunca el logo)`, JSON.stringify(run(ctx, 'draftPhotoPool()')) === '[]');
    ok(`B10 ${tag} draft: draftPhotoFor sin foto devuelve null (no el logo)`, run(ctx, `draftPhotoFor('Café')`) === null);
    const cProd0 = run(ctx, `draftCardPhoto('foto', { v: 'producto' }, 0)`);
    const cAcc0 = run(ctx, `draftCardPhoto('foto', { v: 'accion' }, 1)`);
    const cMarca0 = run(ctx, `draftCardPhoto('foto', { v: 'marca' }, 2)`);
    ok(`B10 ${tag} draft: sin fotos, producto/acción null y marca sin foto pero con logo`, cProd0.src === null && cAcc0.src === null && cMarca0.src === null && cMarca0.logo === 'LOGO-DATA' && !('crop' in cProd0) && !('crop' in cAcc0) && !('crop' in cMarca0), JSON.stringify([cProd0, cAcc0, cMarca0]));
    setS(ctx, `S = { ans: { q1: 'Café', q1mix: 'uno' }, products: [{ nombre: 'Café', foto: 'FOTO-CAFE' }, { nombre: 'Torta', foto: 'FOTO-TORTA' }, { nombre: 'Pan', foto: 'FOTO-PAN' }] }; PREFILL = { photo: 'LOGO-DATA' }; WEB = undefined; DR = { picks: [], champ: null };`);
    const pool3 = run(ctx, 'draftPhotoPool()');
    ok(`B10 ${tag} draft: pool con 3 fotos reales, sin logo`, JSON.stringify(pool3) === JSON.stringify(['FOTO-CAFE', 'FOTO-TORTA', 'FOTO-PAN']), JSON.stringify(pool3));
    const cProd = run(ctx, `draftCardPhoto('foto', { v: 'producto' }, 0)`);
    const cAcc = run(ctx, `draftCardPhoto('foto', { v: 'accion' }, 1)`);
    const cMarca = run(ctx, `draftCardPhoto('foto', { v: 'marca' }, 2)`);
    ok(`B10 ${tag} draft: las 3 tarjetas con 3 fotos DISTINTAS`, cProd.src === 'FOTO-CAFE' && cAcc.src === 'FOTO-TORTA' && cMarca.src === 'FOTO-PAN' && new Set([cProd.src, cAcc.src, cMarca.src]).size === 3, JSON.stringify([cProd, cAcc, cMarca]));
    ok(`B10 ${tag} draft: producto y acción son fotos reales, nunca el logo`, cProd.src !== 'LOGO-DATA' && cAcc.src !== 'LOGO-DATA' && cMarca.logo === 'LOGO-DATA');
    ok(`B10 ${tag} draft: ningún pick lleva crop (la diferencia la hace la foto)`, !('crop' in cProd) && !('crop' in cAcc) && !('crop' in cMarca));
    setS(ctx, `S = { ans: { q1: 'Café', q1mix: 'uno' }, products: [{ nombre: 'Café', foto: 'FOTO-CAFE' }] }; PREFILL = { photo: 'LOGO-DATA' }; WEB = undefined; DR = { picks: [], champ: null };`);
    const cProd1 = run(ctx, `draftCardPhoto('foto', { v: 'producto' }, 0)`);
    const cAcc1 = run(ctx, `draftCardPhoto('foto', { v: 'accion' }, 1)`);
    const cMarca1 = run(ctx, `draftCardPhoto('foto', { v: 'marca' }, 2)`);
    ok(`B10 ${tag} draft: con una sola foto, acción NO reusa la foto (null honesto)`, cProd1.src === 'FOTO-CAFE' && cAcc1.src === null && cMarca1.src === null && cMarca1.logo === 'LOGO-DATA', JSON.stringify([cProd1, cAcc1, cMarca1]));
    setS(ctx, `S = { ans: {}, products: [{ nombre: 'Torta', foto: 'FOTO-TORTA' }] }; PREFILL = { photo: 'LOGO-DATA' }; WEB = { photos: ['FOTO-WEB-1'] }; DR = { picks: [], champ: null };`);
    ok(`B10 ${tag} draft: la foto de la web sí entra al pool (es real)`, run(ctx, 'draftPhotoPool()').includes('FOTO-WEB-1') && !run(ctx, 'draftPhotoPool()').includes('LOGO-DATA'));
    // Picks de rondas distintas no repiten foto (pool sin usar).
    setS(ctx, `S = { ans: { q1: 'Café', q1mix: 'uno' }, products: [{ nombre: 'Café', foto: 'F1' }, { nombre: 'Torta', foto: 'F2' }, { nombre: 'Pan', foto: 'F3' }] }; PREFILL = { photo: 'LOGO-DATA' }; WEB = undefined; DR = { picks: [{ dim: 'foto', v: 'producto', foto: 'F1' }], champ: null };`);
    ok(`B10 ${tag} draft: la siguiente ronda no repite la foto ya elegida`, run(ctx, `draftCardPhoto('tema', { v: 'tip' }, 0).src`) === 'F2');
    // Vista previa: la elegida, con su rótulo y su caption.
    setS(ctx, `S = { ans: { q1: 'Café', q1mix: 'uno' }, products: [{ nombre: 'Café', foto: 'F1' }, { nombre: 'Torta', foto: 'F2' }, { nombre: 'Pan', foto: 'F3' }] }; PREFILL = { photo: 'LOGO-DATA' }; WEB = undefined; DR = { picks: [], champ: null };`);
    ok(`B10 ${tag} draft: default = primera opción con foto`, run(ctx, 'draftFotoDefaultSel("foto", DRAFT_OPTS.foto)') === 0);
    const pv = run(ctx, 'draftFotoPreviewData("foto", DRAFT_OPTS.foto[1], 1)');
    ok(`B10 ${tag} draft: preview de En acción = su foto + rótulo + caption`, pv.src === 'F2' && pv.label === (tag === 'ES' ? 'En acción' : 'In action') && typeof pv.caption === 'string' && pv.caption.length > 10 && pv.logo === null, JSON.stringify(pv));
    const pvMarca = run(ctx, 'draftFotoPreviewData("foto", DRAFT_OPTS.foto[2], 2)');
    ok(`B10 ${tag} draft: preview de Marca = foto distinta + logo encima`, pvMarca.src === 'F3' && pvMarca.logo === 'LOGO-DATA', JSON.stringify(pvMarca));
    setS(ctx, `S = { ans: {}, products: [] }; PREFILL = { photo: 'LOGO-DATA' }; WEB = undefined; DR = { picks: [], champ: null };`);
    ok(`B10 ${tag} draft: sin fotos el default es 0 y la preview es null honesto`, run(ctx, 'draftFotoDefaultSel("foto", DRAFT_OPTS.foto)') === 0 && run(ctx, 'draftFotoPreviewData("foto", DRAFT_OPTS.foto[0], 0)').src === null);
    // Paquete: imágenes reales o pendiente, nunca «?».
    setS(ctx, `DR = { picks: [], champ: null };`);
    const mini0 = run(ctx, 'draftMiniHTML()');
    ok(`B10 ${tag} draft: paquete vacío con 4 pendientes, sin «?»`, typeof mini0 === 'string' && !mini0.includes('?') && count(mini0, 'oc-draft-slot pending') === 4 && count(mini0, 'oc-slot-dots') === 4, mini0);
    setS(ctx, `DR = { picks: [{ l: 'El producto', foto: 'FOTO1' }], champ: null };`);
    const mini1 = run(ctx, 'draftMiniHTML()');
    ok(`B10 ${tag} draft: 1 pick real con imagen + 3 pendientes, sin «?»`, !mini1.includes('?') && mini1.includes('FOTO1') && count(mini1, 'oc-draft-slot pending') === 3 && count(mini1, 'filled') === 1, mini1);
    setS(ctx, `DR = { picks: [{ l: 'A', foto: 'F1' }, { l: 'B', foto: 'F2' }, { l: 'C', foto: 'F3' }, { l: 'D', foto: 'F4' }], champ: null };`);
    const mini4 = run(ctx, 'draftMiniHTML()');
    ok(`B10 ${tag} draft: 4 picks muestran sus 4 imágenes reales`, ['F1', 'F2', 'F3', 'F4'].every((f) => mini4.includes(f)) && !mini4.includes('oc-draft-slot pending'), mini4);
  }
}

// ---------- servidor en vm ----------
function loadServer() {
  const parts = [];
  for (const sig of ['const OC_CTA = [', 'const OC_PROMO = [', 'const OC_VOZ = [', 'const OC_PRECIOS = [', 'const OC_DONDE = [', 'const OC_ETAPA = [']) {
    const s = stmtFrom(srv, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  for (const sig of ['function onboardingAnswersFrom(fields) {', 'function onboardingAnswersOk(a, opts) {', 'function onboardingGoalLines(a, lang, detectados) {', 'function parseTrialStyle(v) {', 'function styleGoalLines(style, lang) {', 'function trialPostPrompt(o) {']) {
    const s = fnFrom(srv, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  {
    const s = stmtFrom(srv, 'const TRIAL_PROMPT_FRAMING = {');
    if (!s) return { error: 'falta TRIAL_PROMPT_FRAMING' };
    parts.push(s);
  }
  return { code: parts.join('\n') };
}
const RAW_BASE = {
  producto_estrella: 'Café', producto_mix: 'uno', cta: 'reservar', promo: 'ninguna',
  voz: 'cercano', precios: 'si', donde: 'whatsapp', etapa: '',
  audiencia: 'Vecinos', audiencia_mix: 'uno', diferencial: 'Hecho a mano', diferencial_mix: 'uno',
  lineas_rojas: '', lineas_rojas_mix: 'nada',
};
function parteC() {
  console.log('— C) servidor en vm —');
  const loaded = loadServer();
  ok('C0 se extraen OC_* + onboardingAnswers*', !loaded.error, loaded.error || '');
  if (loaded.error) return;
  const sctx = vm.createContext({ console });
  vm.runInContext(loaded.code, sctx);
  const from = (f) => vm.runInContext(`onboardingAnswersFrom(${JSON.stringify(f)})`, sctx);
  const isOk = (a, opts) => vm.runInContext(`onboardingAnswersOk(${JSON.stringify(a)}, ${JSON.stringify(opts || { ig: false, web: false })})`, sctx);
  const lines = (a, lang) => vm.runInContext(`onboardingGoalLines(${JSON.stringify(a)}, ${JSON.stringify(lang || 'es')}, [])`, sctx);
  const raw = (over) => Object.assign({}, RAW_BASE, over || {});

  for (const v of ['domicilio', 'turno', 'tienda', 'llamar']) ok('C1 gate acepta cta ' + v, isOk(from(raw({ cta: v }))));
  for (const v of ['3x2', 'cuotas', 'regalo', 'combo', 'temporal']) ok('C1 gate acepta promo ' + v, isOk(from(raw({ promo: v }))));
  for (const v of ['inspirador', 'educativo', 'directo', 'canchero']) ok('C1 gate acepta voz ' + v, isOk(from(raw({ voz: v }))));
  for (const v of ['algunos', 'aveces']) ok('C1 gate acepta precios ' + v, isOk(from(raw({ precios: v }))));
  ok('C1 gate sigue rechazando valores inventados', !isOk(from(raw({ cta: 'volar' }))) && !isOk(from(raw({ promo: 'sorteo' }))) && !isOk(from(raw({ voz: 'robot' }))) && !isOk(from(raw({ precios: 'gratis' }))));
  ok('C2 libre cta con texto pasa', isOk(from(raw({ cta: 'que me escriban por WhatsApp', cta_mix: 'libre' }))));
  ok('C2 libre cta sin texto no pasa', !isOk(from(raw({ cta: '', cta_mix: 'libre' }))));
  ok('C2 libre promo/voz/precios con texto pasan', isOk(from(raw({ promo: '2x1 solo esta semana', promo_mix: 'libre' }))) && isOk(from(raw({ voz: 'como un amigo', voz_mix: 'libre' }))) && isOk(from(raw({ precios: 'solo en el local', precios_mix: 'libre' }))));
  ok('C2 libre promo sin texto no pasa', !isOk(from(raw({ promo: '', promo_mix: 'libre' }))));
  const long = from(raw({ cta: 'x'.repeat(70), cta_mix: 'libre' }));
  ok('C2 texto libre se topa a 60 caracteres', long.cta.length === 60 && long.cta_mix === 'libre', 'len=' + long.cta.length);
  ok('C2 answersFrom conserva los mix', from(raw({ cta_mix: 'libre', promo_mix: 'libre', voz_mix: 'libre', precios_mix: 'libre' })).cta_mix === 'libre');
  const c3a = isOk(from(raw({ donde: '' })));
  const c3b = isOk(from(raw({ donde: '' })), { ig: true, web: false });
  ok('C3 donde obligatorio sin IG ni web (sin estudio no pasa)', c3a === false, 'ok=' + c3a);
  ok('C3 donde no obligatorio con IG estudiado (pasa)', c3b === true, 'ok=' + c3b);
  const gl1 = lines(from(raw({ cta: 'que me escriban por WhatsApp', cta_mix: 'libre' })));
  ok('C4 goal line libre cta con sus palabras', gl1.some((l) => l.includes('(con sus palabras)') && l.includes('que me escriban por WhatsApp')), JSON.stringify(gl1));
  const gl2 = lines(from(raw({ cta: 'domicilio', promo: 'cuotas', voz: 'inspirador', precios: 'algunos' })));
  ok('C4 goal lines con etiquetas nuevas', gl2.some((l) => l.includes('pedidos a domicilio')) && gl2.some((l) => l.includes('cuotas sin interés')) && gl2.some((l) => l.includes('inspirador')) && gl2.some((l) => l.includes('solo en algunos productos')), JSON.stringify(gl2));
  const gl3 = lines(from(raw({ promo: '2x1 solo hoy', promo_mix: 'libre' })), 'en');
  ok('C4 goal line libre en inglés', gl3.some((l) => l.includes('(in their words)') && l.includes('2x1 solo hoy')), JSON.stringify(gl3));

  // (F) Prompt por posteo: solo lo real, en palabras simples.
  const pp = (o) => vm.runInContext(`trialPostPrompt(${JSON.stringify(o)})`, sctx);
  const full = pp({ post: { ai: true, type: 'image', headline: 'Café de especialidad' }, specPost: { photo_product: 'Café', style: '/product', style_name: 'Producto estudio' }, paletteNames: ['verde', 'marrón'], tone: 'vos', lang: 'es' });
  const fullL = full.prompt_simple.toLowerCase();
  ok('F1 prompt completo: foto + encuadre + paleta + tono + luz natural', fullL.includes('tu foto de café') && fullL.includes('tu producto, grande en primer plano') && fullL.includes('con tu paleta verde y marrón') && fullL.includes('con tu tono cercano') && fullL.includes('luz natural'), JSON.stringify(full));
  ok('F1 prompt detalle: estilo, foto, paleta, tono, motor, titular', full.prompt_detalle.includes('Estilo: Producto estudio') && full.prompt_detalle.includes('Foto: Café') && full.prompt_detalle.includes('Paleta: verde, marrón') && full.prompt_detalle.includes('Tono: vos') && full.prompt_detalle.includes('Motor: IA') && full.prompt_detalle.includes('Titular: Café de especialidad'), JSON.stringify(full));
  const tpl = pp({ post: { ai: false, type: 'image' }, specPost: { photo: true, style: '/flatlay', style_name: 'Flat lay' }, paletteNames: [], tone: null, lang: 'es' });
  const tplL = tpl.prompt_simple.toLowerCase();
  ok('F1 prompt plantilla: sin luz natural, sin paleta, sin tono', !tplL.includes('luz natural') && !tplL.includes('paleta') && !tplL.includes('tono') && tplL.includes('tu foto del producto') && tplL.includes('desde arriba'), JSON.stringify(tpl));
  const nop = pp({ post: { ai: false, type: 'image' }, specPost: { style: '/quote', style_name: 'Frase' }, paletteNames: [], tone: null, lang: 'es' });
  const nopL = nop.prompt_simple.toLowerCase();
  ok('F1 prompt sin foto ni paleta: no inventa foto ni color', !nopL.includes('foto') && !nopL.includes('paleta') && nopL.includes('estilo «frase»'), JSON.stringify(nop));
  const vid = pp({ post: { ai: false, type: 'video' }, specPost: { photo_product: 'Café', style: '/lifestyle', style_name: 'Estilo de vida' }, paletteNames: ['verde'], tone: 'usted', lang: 'es' });
  ok('F1 prompt video: reel + tono formal', vid.prompt_simple.includes('tu reel') && vid.prompt_simple.includes('con tu tono formal'), JSON.stringify(vid));
  const enP = pp({ post: { ai: true, type: 'image' }, specPost: { photo_product: 'Coffee', style: '/macro', style_name: 'Macro detalle' }, paletteNames: ['green'], tone: 'vos', lang: 'en' });
  const enPL = enP.prompt_simple.toLowerCase();
  ok('F1 prompt en inglés: photo + palette + close-up + natural light', enPL.includes('your photo of coffee') && enPL.includes('close-up detail') && enPL.includes('with your palette of green') && enPL.includes('natural light'), JSON.stringify(enP));

  // (E) styleGoalLines + parseTrialStyle.
  const sgl = (s, lang) => vm.runInContext(`styleGoalLines(${JSON.stringify(s)}, ${JSON.stringify(lang || 'es')})`, sctx);
  const fullStyle = { posts_per_week: 4, avg_caption_words: 18, avg_hashtags: 3, hashtags_top: ['cafe', 'barista'], best_posts: [], palette_names: ['verde', 'marrón'], palette_names_en: ['green', 'brown'], tone: 'vos', formats: { images: 5, videos: 1, carousels: 0 } };
  const sl1 = sgl(fullStyle);
  ok('E4 styleGoalLines: ritmo + paleta + tono + hashtags, solo lo observado', sl1.some((l) => l.includes('4 veces por semana')) && sl1.some((l) => l.includes('verde')) && sl1.some((l) => l.includes('voseo')) && sl1.some((l) => l.includes('#cafe')), JSON.stringify(sl1));
  ok('E4 styleGoalLines: estilo vacío no agrega líneas', sgl(null).length === 0 && sgl({}).length === 0);
  ok('E4 styleGoalLines: tono neutral no agrega línea de tono', !sgl({ tone: 'neutral' }).some((l) => l.includes('tono')));
  const pts = (v) => vm.runInContext(`parseTrialStyle(${JSON.stringify(v)})`, sctx);
  ok('E4 parseTrialStyle: rechaza basura (string, número)', pts('basura') === null && pts(42) === null);
  ok('E4 parseTrialStyle: acepta válido y topa números fuera de rango', (() => { const p = pts({ posts_per_week: 4, avg_caption_words: 18, tone: 'vos', palette_names: ['verde'] }); return p && p.posts_per_week === 4 && p.tone === 'vos'; })());
  ok('E4 parseTrialStyle: todo fuera de rango devuelve null', pts({ posts_per_week: 9999, avg_caption_words: -5 }) === null);
  ok('E4 parseTrialStyle: parcial válido conserva lo válido y descarta lo demás', (() => { const p = pts({ posts_per_week: 9999, tone: 'vos' }); return p && p.posts_per_week === undefined && p.tone === 'vos'; })());
}

// ---------- assets canónicos ----------
function parteD() {
  console.log('— D) assets —');
  const md5 = (p) => { try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); } catch (e) { return 'FALTA'; } };
  ok('D avatar canónico posty-con-placa.png por md5', md5(path.join(T, 'public', 'posty-con-placa.png')) === 'd40b13eb69b3eda598ba75366f25506a', md5(path.join(T, 'public', 'posty-con-placa.png')));
  ok('D imagen trabajando canónica posty-disenando.webp por md5', md5(path.join(T, 'public', 'posty-disenando.webp')) === '1ca5946dc4bedd07330b4eade3f4b8ed', md5(path.join(T, 'public', 'posty-disenando.webp')));
}

// ---------- perfil de estilo en vm (E) ----------
async function parteE() {
  console.log('— E) perfil de estilo en vm —');
  const fa = fs.readFileSync(path.join(T, 'feed-audit.js'), 'utf8');
  const eparts = [];
  for (const sig of ['const HUE_NAMES_ES = [', 'const HUE_NAMES_EN = [']) {
    const s = stmtFrom(fa, sig);
    if (!s) { ok('E1 se extraen HUE_NAMES_ES/EN', false, sig); return; }
    eparts.push(s);
  }
  for (const sig of ['function hueName(', 'function paletteProfileFromHexes(', 'function hexToHueBucket(']) {
    const s = fnFrom(fa, sig);
    if (!s) { ok('E1 se extraen hueName + paletteProfileFromHexes', false, sig); return; }
    eparts.push(s);
  }
  const tsp = fnFrom(fa, 'async function trialStyleProfile(');
  if (!tsp) { ok('E1 se extrae trialStyleProfile', false); return; }
  eparts.push(tsp);
  const ectx = vm.createContext({
    console,
    computeSignals: () => ({ posts_per_week: 4, avg_caption_words: 18, avg_hashtags: 3, videos: 1, images: 5, carousels: 0 }),
    analyzePaletteBuckets: async (posts) => (posts && posts.length ? [3, 5] : []),
    setTimeout: (fn) => setTimeout(fn, 0),
  });
  vm.runInContext(eparts.join('\n'), ectx);
  const posts = [
    { caption: 'Nuestro café de hoy #cafe #barista', likes: 120, shortcode: 'AAA' },
    { caption: 'Torta casera #cafe', likes: 80, shortcode: 'BBB' },
    { caption: 'El local #barista #cafe', likes: 200, shortcode: 'CCC' },
    { caption: 'Sin hashtags ni likes', likes: 0, shortcode: 'DDD' },
  ];
  const prof = await vm.runInContext(`trialStyleProfile(${JSON.stringify(posts)}, {}, { tone: 'vos', lang: 'es' })`, ectx);
  ok('E1 perfil: ritmo + largo de captions + hashtags reales', prof && prof.posts_per_week === 4 && prof.avg_caption_words === 18 && JSON.stringify(prof.hashtags_top) === JSON.stringify(['cafe', 'barista']), JSON.stringify(prof));
  ok('E1 perfil: paleta real del feed (verde, azul) en ES y EN', prof && JSON.stringify(prof.palette_names) === JSON.stringify(['verde', 'azul']) && JSON.stringify(prof.palette_names_en) === JSON.stringify(['green', 'blue']), JSON.stringify(prof));
  ok('E1 perfil: mejores posteos por likes (CCC 200 primero)', prof && prof.best_posts.length === 3 && prof.best_posts[0].shortcode === 'CCC' && prof.best_posts[0].likes === 200 && prof.best_posts[1].shortcode === 'AAA', JSON.stringify(prof && prof.best_posts));
  ok('E1 perfil: tono observado (vos) + formatos', prof && prof.tone === 'vos' && prof.formats.images === 5 && prof.formats.videos === 1, JSON.stringify(prof));
  const profNull = await vm.runInContext('trialStyleProfile([], {}, {})', ectx);
  ok('E1 perfil: sin posts ni paleta web devuelve null (no inventa)', profNull === null);
  const profWeb = await vm.runInContext(`trialStyleProfile([], {}, { webPalette: ['#2793C8'], lang: 'es' })`, ectx);
  ok('E1 perfil: solo con paleta web también hay perfil', profWeb && profWeb.palette_names.length > 0 && profWeb.palette_buckets && profWeb.palette_buckets.length > 0, JSON.stringify(profWeb));
  // Cliente: mergeStyle + studySoftApply + fila de estilo (E5/E6).
  for (const [tag, html] of [['ES', es], ['EN', en]]) {
    const loaded = loadClient(html);
    ok(`E5 ${tag} se extraen las funciones del estudio`, !loaded.error, loaded.error || '');
    if (loaded.error) continue;
    const { ctx } = makeCtx(loaded);
    ctx.document.documentElement.lang = tag === 'EN' ? 'en' : 'es';
    const Tvm = run(ctx, 'T');
    const merged = run(ctx, `mergeStyle({ palette_names: ['verde'], tone: 'neutral', hashtags_top: ['cafe'] }, { palette_names: ['azul'], palette_names_en: ['blue'], tone: 'vos', hashtags_top: ['barista'], best_posts: [{ shortcode: 'X', likes: 5 }] })`);
    ok(`E5 ${tag} mergeStyle: une paletas y hashtags, gana el tono no neutral`, merged.palette_names.includes('verde') && merged.palette_names.includes('azul') && merged.tone === 'vos' && merged.hashtags_top.includes('cafe') && merged.hashtags_top.includes('barista'), JSON.stringify(merged));
    vm.runInContext(`chatGaps = function () { return { known: { q1: 'Café' }, needed: [] }; };`, ctx);
    setS(ctx, `S = { source: 'ig', ig: 'test', web: '', cat: '', facts: {}, products: [{ nombre: 'Café' }], ans: {}, plan: ['q1', 'q2'], qi: 0, chatLog: [], chatPushedQ: {}, chatPostedQ: {}, chatJoined: true, igTried: true, igOk: true, webTried: true, webOk: true, rubroOptions: null }; WEB = undefined;`);
    run(ctx, 'chatRebuildLog(); chatAskCurrent();');
    run(ctx, 'studySoftApply();');
    ok(`E5 ${tag} softApply: rellena lo sabido y avanza sin resetear el plan`, run(ctx, 'S.ans.q1') === 'Café' && run(ctx, 'S.qi') === 1 && JSON.stringify(run(ctx, 'S.plan')) === JSON.stringify(['q1', 'q2']), 'qi=' + run(ctx, 'S.qi') + ' plan=' + JSON.stringify(run(ctx, 'S.plan')));
    const logE5 = run(ctx, 'S.chatLog');
    ok(`E5 ${tag} softApply: q1 respondida baja a burbuja y q2 sube como tarjeta`, logE5.filter((m) => m.qcard).length === 1 && logE5.some((m) => m.qcard === 'q2') && logE5.some((m) => m.w === 'user' && m.t === 'Café'), JSON.stringify(logE5));
    vm.runInContext(`chatGaps = function () { return { known: {}, needed: [] }; };`, ctx);
    setS(ctx, `S = { source: 'ig', ig: 'test', web: '', cat: 'cafeteria', facts: {}, products: [], ans: {}, plan: ['q1', 'q2'], qi: 0, chatLog: [], chatPushedQ: {}, chatPostedQ: {}, chatJoined: true, igTried: true, igOk: true, webTried: true, webOk: true, rubroOptions: [{ v: 'cafeteria', l: 'Cafetería' }] }; WEB = undefined;`);
    run(ctx, 'studySoftApply();');
    ok(`E5 ${tag} softApply: inserta rubro en la posición actual cuando el estudio lo suma`, JSON.stringify(run(ctx, 'S.plan')) === JSON.stringify(['rubro', 'q1', 'q2']) && run(ctx, 'S.qi') === 0, JSON.stringify(run(ctx, 'S.plan')));
    setS(ctx, `S = { cat: 'cafeteria', facts: { address: 'Calle Falsa 123' }, products: [{ nombre: 'Café de especialidad' }], igTried: true, igOk: true, webTried: true, webOk: true, style: { posts_per_week: 4, avg_caption_words: 18, avg_hashtags: 3, hashtags_top: ['cafe'], palette_names: ['verde'], palette_names_en: ['green'], tone: 'vos' } }; WEB = { city: 'Palermo' };`);
    const knownSt = run(ctx, 'chatKnownRows()');
    const styleRow = knownSt.find((r) => r.l === Tvm.knownEstilo);
    ok(`E6 ${tag} conocida: fila de estilo con ritmo + paleta + tono`, !!styleRow && styleRow.v.includes('4') && styleRow.v.includes(tag === 'ES' ? 'verde' : 'green') && styleRow.v.includes('vos'), JSON.stringify(knownSt));
    setS(ctx, `S = { cat: 'cafeteria', facts: {}, products: [{ nombre: 'Café' }], igTried: true, igOk: true, webTried: true, webOk: true, style: null }; WEB = { city: 'Palermo' };`);
    ok(`E6 ${tag} conocida: sin estilo no hay fila de estilo`, !run(ctx, 'chatKnownRows()').some((r) => r.l === Tvm.knownEstilo));
  }
}

// ---------- prompt por posteo en vm (F) ----------
function parteF() {
  console.log('— F) prompt por posteo en vm —');
  for (const [tag, html] of [['ES', es], ['EN', en]]) {
    const loaded = loadClient(html);
    ok(`F2 ${tag} se extraen las funciones`, !loaded.error, loaded.error || '');
    if (loaded.error) continue;
    const { ctx } = makeCtx(loaded);
    ctx.document.documentElement.lang = tag === 'EN' ? 'en' : 'es';
    setS(ctx, `S = { products: [{ nombre: 'Café' }], style: { palette_names: ['verde'], palette_names_en: ['green'], tone: 'vos' } };`);
    const pr1 = run(ctx, `draftPromptFor({ dim: 'foto', v: 'producto', imgDesc: 'Tu producto, enorme en la foto' })`);
    ok(`F2 ${tag} prompt favorita: foto + paleta + tono, solo lo real`, pr1.includes('Tu producto, enorme en la foto') && pr1.includes(tag === 'ES' ? 'verde' : 'green') && pr1.includes(tag === 'ES' ? 'cercano' : 'close'), pr1);
    const prMarca = run(ctx, `draftPromptFor({ dim: 'foto', v: 'marca', foto: 'FOTO-PAN', logo: 'LOGO-DATA', imgDesc: 'Tu logo, grande y al centro' })`);
    ok(`F2 ${tag} prompt marca: logo encima de la foto de producto`, prMarca.includes(tag === 'ES' ? 'tu logo grande al centro' : 'your logo big front and center') && prMarca.includes('Café'), prMarca);
    setS(ctx, `S = { products: [], style: null };`);
    const pr0 = run(ctx, `draftPromptFor({ dim: 'tema', v: 'tip', imgDesc: 'Detalle de cerca' })`);
    ok(`F2 ${tag} prompt sin estilo: solo la descripción, sin paleta ni tono`, pr0 === 'Detalle de cerca', pr0);
    ok(`F2 ${tag} prompt sin pick: vacío`, run(ctx, 'draftPromptFor(null)') === '');
  }
}

// ---------- entrada en vm (G) ----------
function parteG() {
  console.log('— G) entrada en vm —');
  for (const [tag, html] of [['ES', es], ['EN', en]]) {
    const loaded = loadClient(html);
    ok(`G4 ${tag} se extraen startFromField + cleanIg`, !loaded.error, loaded.error || '');
    if (loaded.error) continue;
    const { ctx } = makeCtx(loaded);
    ctx.document.documentElement.lang = tag === 'EN' ? 'en' : 'es';
    const Tvm = run(ctx, 'T');
    const seen = { plan: 0, screen: 0, study: null, err: null };
    ctx.buildPlan = () => { seen.plan++; };
    ctx.currentScreen = () => { seen.screen++; };
    ctx.studyBoth = async (ig, web) => { seen.study = [ig, web]; return true; };
    ctx.entryErr = (m) => { seen.err = m; };
    const fakes = { oc_ig: { value: '' }, oc_web: { value: '' }, oc_field: { value: '' } };
    ctx.document.getElementById = (id) => fakes[id] || { value: '' };
    ok(`G4 ${tag} cleanIg quita @ y espacios`, run(ctx, `cleanIg('  @mi_negocio ')`) === 'mi_negocio');
    fakes.oc_web.value = 'www.tunegocio.com.ar'; fakes.oc_ig.value = '';
    seen.plan = 0; seen.screen = 0; seen.study = null; seen.err = null;
    run(ctx, `S = { source: null, ig: null, web: null, igTried: false, webTried: false, igOk: false, webOk: false, style: null, studyPending: false, studyPromise: null };`);
    run(ctx, `startFromField('web');`);
    ok(`G4 ${tag} entrar con web: chat abierto + estudio con (null, web)`, seen.plan === 1 && seen.screen === 1 && seen.study && seen.study[0] === null && seen.study[1] === 'https://www.tunegocio.com.ar' && seen.err === null && run(ctx, 'S.source') === 'web' && run(ctx, 'S.studyPending') === true, JSON.stringify(seen));
    fakes.oc_ig.value = '@mi_negocio'; fakes.oc_web.value = '';
    seen.plan = 0; seen.screen = 0; seen.study = null; seen.err = null;
    run(ctx, `startFromField('ig');`);
    ok(`G4 ${tag} entrar con IG: chat abierto + estudio con (ig, null)`, seen.plan === 1 && seen.screen === 1 && seen.study && seen.study[0] === 'mi_negocio' && seen.study[1] === null && seen.err === null && run(ctx, 'S.source') === 'ig', JSON.stringify(seen));
    fakes.oc_ig.value = 'mi_negocio'; fakes.oc_web.value = 'tunegocio.com';
    seen.study = null; seen.err = null;
    run(ctx, `startFromField('ig');`);
    ok(`G4 ${tag} IG + web: el estudio recibe las dos`, seen.study && seen.study[0] === 'mi_negocio' && seen.study[1] === 'https://tunegocio.com', JSON.stringify(seen));
    fakes.oc_ig.value = ''; fakes.oc_web.value = '';
    seen.plan = 0; seen.screen = 0; seen.study = null; seen.err = null;
    run(ctx, `startFromField('web');`);
    ok(`G4 ${tag} botón web sin web: error y sin estudio`, seen.err === Tvm.errWebEmpty && seen.study === null && seen.plan === 0, 'err=' + seen.err);
    seen.err = null;
    run(ctx, `startFromField('ig');`);
    ok(`G4 ${tag} botón IG sin IG: error y sin estudio`, seen.err === Tvm.errIgEmpty && seen.study === null && seen.plan === 0, 'err=' + seen.err);
    fakes.oc_field.value = 'dueno@negocio.com';
    seen.plan = 0; seen.screen = 0; seen.study = null; seen.err = null;
    run(ctx, `startFromField('email');`);
    ok(`G4 ${tag} entrar con email: plan + pantalla, sin estudio`, seen.plan === 1 && seen.screen === 1 && seen.study === null && seen.err === null && run(ctx, 'S.source') === 'email' && run(ctx, 'S.email') === 'dueno@negocio.com', JSON.stringify(seen));
    fakes.oc_field.value = 'no-es-email';
    seen.err = null; seen.plan = 0;
    run(ctx, `startFromField('email');`);
    ok(`G4 ${tag} email inválido: error y sin plan`, seen.err === Tvm.errEmail && seen.plan === 0, 'err=' + seen.err);
  }
}

(async () => {
  parteB();
  parteC();
  parteD();
  await parteE();
  parteF();
  parteG();
  console.log(`\n${pass} pasaron, ${fail} fallaron.`);
  if (fails.length) console.log('fallaron: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
