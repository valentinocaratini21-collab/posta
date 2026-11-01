// test-lote17.js — LOTE 17 · vista de aprobación + tira de Inicio.
// Valentino: la vista de aprobación tiene que quedar perfecta (Aceptar
// sin desborde, acciones parejas, foto limpia, carrusel prolijo, flecha
// de enviar visible, «Semana» sin tapar) + tira sin banda navy y con
// barrita degradada + rotación del mini-chat de esa vista.
// Node puro, lee el árbol. Uso: node test-lote17.js
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
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
function sandbox(extra) {
  const sb = {
    console,
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: (n) => '<i>' + n + '</i>',
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, createElement: () => ({}) },
    Intl, Date, Map, Set,
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  Object.assign(sb, extra || {});
  vm.createContext(sb);
  return sb;
}
function loadFns(sb, names) {
  for (const n of names) {
    const code = extractFn(app, n);
    t(code.length > 0, 'existe ' + n);
    if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
}

// ---------- Versiones + censo (referencia v518) ----------
t(srv.includes("const BUILD_ID = '20261101-v532'"), 'BUILD v522 en server.js');
t(idx.includes('app.js?v=353') && idx.includes('styles.css?v=20261072'), 'index: app 340 + styles 20261064');
t(idxEn.includes('styles.css?v=20261072') && !idxEn.includes('app.js?v='), 'en/index: styles 20261064, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v516 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- A1/A2: Aceptar único + fila secundaria pareja ----------
{
  const apv = sliceFn(app, 'async function approvalPostView', 'function apvMoreHTML');
  const act = sliceFn(apv, 'const actions = canAct', 'const draftActions');
  const dra = sliceFn(apv, 'const draftActions = isDraft', 'const whenTxt');
  t(apv.length > 0, 'A1: approvalPostView existe');
  t(act.includes('apv-primary') && act.includes('id="apvAccept"'), 'A1: programado: Aceptar único en fila principal');
  t(!act.includes('apv-like') && !act.includes('id="apvEdit"') && !act.includes('id="apvReject"'), 'A1: programado: sin corazón/Editar/Rechazar en la fila principal');
  t(dra.includes('apv-primary') && dra.includes('id="apvAcceptDraft"'), 'A1: borrador: Aceptar único en fila principal');
  t(!dra.includes('apv-like') && !dra.includes('id="apvEdit"') && !dra.includes('id="apvReject"'), 'A1: borrador: sin corazón/Editar/Rechazar en la fila principal');
  t(cnt(act, 'Aceptar</button>') === 1 && cnt(dra, 'Aceptar</button>') === 1, 'A1: un solo Aceptar por variante');
  t(css.includes('.apv-primary .btn{width:100%;white-space:normal'), 'A1: CSS principal ancho completo sin nowrap');
  const more = sliceFn(app, 'function apvMoreHTML', 'function bindApprovalPost');
  t(more.includes('apv-sec') && more.includes('id="apvMore"'), 'A2: fila secundaria única con id apvMore');
  for (const b of ['apv-like', 'id="apvEdit"', 'id="apvReject"', 'id="apvDelete"', 'id="apvRedo"', 'id="apvDislike"'])
    t(more.includes(b), 'A2: secundaria trae ' + b);
  t(more.includes("st === 'scheduled'") && more.includes('id="apvHold"'), 'A2: Frenar solo para programados');
  for (const l of ['Aprobar', 'Editar', 'Rechazar', 'Frenar', 'Eliminar', 'Rehacer', 'No me gusta'])
    t(more.includes(l), 'A2: etiqueta ES ' + l);
  for (const l of ['Approve', 'Edit', 'Reject', 'Hold', 'Delete', 'Redo', 'Dislike'])
    t(more.includes(l), 'A2: etiqueta EN ' + l);
  t(more.includes('apv-sec-btn') && css.includes('.apv-sec-btn{flex:1;display:flex;flex-direction:column'), 'A2: CSS secundaria pareja (icono arriba, etiqueta abajo)');
  t(apv.includes('apvMoreHTML(p, st, canAct, isDraft, editPrompt)'), 'A2: Editar recibe su prefill en la secundaria');
  const bind = sliceFn(app, 'function bindApprovalPost', '/* ====');
  for (const id of ['apvAccept', 'apvAcceptDraft', 'apvEdit', 'apvReject', 'apvHold', 'apvDelete', 'apvRedo', 'apvDislike', 'apv-like', 'apvGate', 'apvConfirm', 'apvActions', 'apvMore'])
    t(bind.includes(id), 'A2: binding intacto ' + id);
  t(bind.includes("getElementById('apvMore')"), 'A2: confirmar rechazar también oculta la secundaria');
}

// ---------- A2 funcional: apvMoreHTML ----------
{
  const sb = sandbox();
  loadFns(sb, ['apvMoreHTML']);
  const M = sb.apvMoreHTML;
  const esD = M({ id: 7 }, 'draft', false, true, 'Quiero editar ese posteo');
  t(esD.includes('id="apvMore"') && esD.includes('apv-sec-btn'), 'A2f: borrador rinde la fila secundaria');
  t(!esD.includes('apvHold'), 'A2f: borrador sin Frenar (6 acciones)');
  t(esD.includes('data-apvedit="Quiero editar ese posteo"'), 'A2f: Editar lleva el prefill');
  const esS = M({ id: 7 }, 'scheduled', true, false, 'x');
  t(esS.includes('apvHold') && esS.includes('Frenar'), 'A2f: programado con Frenar (7 acciones)');
  t(!M({ id: 7 }, 'published', false, false, 'x'), 'A2f: publicado sin fila (nada que decidir)');
  sb.ME.lang = 'en';
  const enS = M({ id: 7 }, 'scheduled', true, false, 'x');
  t(enS.includes('Approve') && enS.includes('Hold') && enS.includes('Dislike'), 'A2f: EN con etiquetas cortas');
}

// ---------- A4: carrusel prolijo ----------
{
  const apv = sliceFn(app, 'async function approvalPostView', 'function apvMoreHTML');
  t(apv.includes('carousel_paths') && apv.includes('hf-d-track') && apv.includes('hf-d-dots') && apv.includes('hf-d-count'), 'A4: carrusel con track + puntitos + contador');
  t(apv.includes('apvIsCar'), 'A4: carrusel solo con más de un slide');
  t(apv.includes('<img src="${esc(p.image_path)}" alt="Posteo" loading="eager"'), 'A4: foto única sin carrusel intacta');
  t(apv.includes('<video src="${esc(p.image_path)}"'), 'A4: video intacto');
  t(css.includes('.apv-media .hf-d-slide img{height:auto;background:transparent}'), 'A4: slides sin bandas negras');
  const bind = sliceFn(app, 'function bindApprovalPost', '/* ====');
  t(bind.includes("querySelectorAll('.apv-media [data-lightbox]')"), 'A4: lightbox en todos los slides');
  t(bind.includes("querySelector('.apv-media .hf-d-track')") && bind.includes('hf-d-dots'), 'A4: puntitos y contador siguen el scroll');
}

// ---------- A3: foto limpia ----------
{
  t(css.includes('.apv-media{background:#fff}'), 'A3: media sin fondo navy');
  t(!css.includes('.apv-media::after') && !css.includes('.apv-media::before'), 'A3: sin overlay sobre la foto');
  const apv = sliceFn(app, 'async function approvalPostView', 'function apvMoreHTML');
  t(!apv.includes('ai-avatar'), 'A3: ningún avatar superpuesto en código (el círculo de la captura está horneado en la foto)');
}

// ---------- A5: flecha de enviar + iconos visibles ----------
{
  t(css.includes('.hf-ask-send .pz-ic svg{stroke:#fff}'), 'A5: flecha blanca sobre botón celeste');
  t(css.includes('.apv-accept .pz-ic svg{stroke:#fff}'), 'A5: check blanco en Aceptar');
  t(css.includes('.apv-sec-btn .pz-ic svg{stroke:currentColor}'), 'A5: iconos de la secundaria con el color del texto');
  t(app.includes("stroke=\"' + PZ_IC_CEL + '\""), 'A5: pzIc global sin tocar (el fix es contextual)');
}

// ---------- A6: atrás sin tapar «Semana» ----------
{
  for (const fn of ['pzBackHTML', 'pzBackMtopHTML', 'pzBackDesktopHTML']) {
    const s = sliceFn(app, 'function ' + fn, 'function bbHace');
    t(s.includes("tab === 'post'") && s.includes("tab === 'dogfood'"), 'A6: ' + fn + ' sin círculo en post/dogfood');
  }
  t(app.includes("if (tab === 'inicio') return ''"), 'A6: inicio sin círculo intacto');
  t(app.includes("if (tab === 'jardin-posty') return ''"), 'A6: jardín sin círculo intacto (Lote 10B)');
  const apv = sliceFn(app, 'async function approvalPostView', 'function apvMoreHTML');
  const dg = sliceFn(app, 'async function dogfoodView', 'async function approvalPostView');
  // A6 actualizado (Lote Glass refactorizó el atrás en el helper
  // pzApvBackHTML): la etiqueta Semana/Week vive en el helper y ambas
  // vistas lo usan; el intento (atrás sin tapar) queda cubierto igual.
  t(app.includes("key === '#/app/schedule' ? (en ? 'Week' : 'Semana')"), 'A6: helper pzApvBackHTML mapea Schedule → Semana/Week ES/EN');
  t(apv.includes('pzApvBackHTML') && dg.includes('pzApvBackHTML'), 'A6: aprobación y dogfood usan el helper (mismo atrás, sin tapar)');
}

// ---------- B7: banda navy fuera ----------
{
  t(css.includes('#inicioView.hf-wrap{background:#fff}'), 'B7: wrap de Inicio blanco en modo oscuro');
  t(css.includes('.hf-tile.hf-tile-draft{outline:2px dashed #2793C8'), 'B7: punteados de borradores QUEDAN');
  t(css.includes('.fp-tile.fp-tile-draft{outline:2px dashed #2793C8'), 'B7: punteados fp QUEDAN');
}

// ---------- B8: barrita degradada solo en la tira ----------
{
  t(app.includes('function mxBarra(pct)'), 'B8: mxBarra sin color plano');
  const tira = sliceFn(app, 'function mxTiraHTML', 'function mxTiraPostyHTML');
  t(tira.includes('mxBarra(pzNivelAvance(nvP))'), 'B8: la tira usa el degradado');
  t(cnt(app, 'mxBarra(') === 2, 'B8: mxBarra solo en definición + tira (nada en el jardín)');
  t(css.includes('.mx-tira-barra i{background:linear-gradient(90deg,#2793C8,#FEC14D)'), 'B8: degradado celeste → dorado');
  t(css.includes('.mx-tira-barra i::after'), 'B8: brillo suave');
  t(app.includes('mxJardinHTML') && app.includes('mx-jardin-vivo'), 'B8: pantalla Jardín existe (el LOTE JARDÍN la rediseña)');
}

// ---------- Mini-chat: rotación en la vista de aprobación ----------
{
  t(app.includes('function pzAskPhNext') && app.includes('function pzAskPhStart'), 'ASK: funciones de rotación existen');
  t(app.includes('placeholder="${enA ? \'write to posty…\' : \'escribile a posty…\'}"'), 'ASK: base en minúscula (sin la P mayúscula vieja)');
  const ask = sliceFn(app, 'function pzAskPhNext', 'async function bindChatView');
  t(ask.includes("pzPhEls('.hf-ask-input')"), 'ASK LOTE CHATTEXTO: rota TODOS los inputs de la vista (querySelectorAll, no solo el primero)');
  t(!ask.includes('activeElement'), 'ASK LOTE CHATTEXTO: el foco ya no bloquea (reversa de la guarda vieja)');
  t(app.includes('if (!PZ_PH_T) PZ_PH_T = setInterval(pzPhTick, 4000)'), 'ASK LOTE CHATTEXTO + CHAT4S: un solo intervalo, 4 s (antes 8 s)');
  t(ask.includes('setInterval(pzPhTick, 4000)'), 'ASK LOTE CHATTEXTO + CHAT4S: intervalo 4 s único');
  const advA = sliceFn(app, 'function pzPhAdvanceOne', 'function pzPhKnown');
  t(advA.includes('el.value'), 'ASK LOTE CHATTEXTO: guarda de texto en el helper compartido');
  const bind = sliceFn(app, 'function bindApprovalPost', '/* ====');
  t(bind.includes('pzAskPhStart()'), 'ASK: arranque al cablear la vista de aprobación');
  t(cnt(app, 'function pzAskPhStart') === 1 && cnt(app, 'function pzAskPhNext') === 1, 'M78: 2/2 funciones nuevas auditadas');
}

// ---------- ASK funcional: cambia sin escribir ----------
{
  const input = { value: '', placeholder: 'escribile a posty…', dataset: {} };
  let timers = [];
  const sb = sandbox({
    document: {
      getElementById: () => null,
      querySelector: (sel) => (sel === '.hf-ask-input' ? input : null),
      querySelectorAll: (sel) => (sel === '.hf-ask-input' ? [input] : []),
      activeElement: null,
    },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearInterval: (id) => { timers = timers.filter((_, i) => i + 1 !== id); },
  });
  let code = app.slice(app.indexOf('const PZ_CHAT_PH'), app.indexOf('async function bindChatView'));
  code = code.replace('const PZ_CHAT_PH', 'globalThis.PZ_CHAT_PH')
    .replace('let PZ_CHAT_PH_I', 'globalThis.PZ_CHAT_PH_I')
    .replace('let PZ_CHAT_PH_T', 'globalThis.PZ_CHAT_PH_T')
    .replace('function pzChatPhList', 'globalThis.pzChatPhList = function')
    .replace('function pzChatPhNext', 'globalThis.pzChatPhNext = function')
    .replace('function pzChatPhStart', 'globalThis.pzChatPhStart = function')
    .replace('let PZ_ASK_PH_I', 'globalThis.PZ_ASK_PH_I')
    .replace('let PZ_ASK_PH_T', 'globalThis.PZ_ASK_PH_T')
    .replace('function pzAskPhNext', 'globalThis.pzAskPhNext = function')
    .replace('function pzAskPhStart', 'globalThis.pzAskPhStart = function');
  vm.runInContext(code, sb);
  sb.pzAskPhStart();
  t(input.placeholder === 'preguntale por tu semana…' && timers.length === 1 && timers[0].ms === 4000, 'ASKf LOTE CHAT4S: al abrir avanza una y arma intervalo 4 s');
  timers[0].fn();
  t(input.placeholder === 'pedile una idea para hoy…', 'ASKf: tick en idle avanza sin escribir');
  input.value = 'hola';
  timers[0].fn();
  t(input.placeholder === 'pedile una idea para hoy…', 'ASKf: con texto no rota');
  input.value = '';
  sb.document.activeElement = input;
  timers[0].fn();
  t(input.placeholder === 'contale qué vendés…', 'ASKf LOTE CHATTEXTO: con el campo enfocado y vacío el tick SÍ avanza');
  sb.document.activeElement = null;
  sb.pzAskPhStart();
  t(timers.length === 1 && input.placeholder === 'contale qué vendés…', 'ASKf: reabrir no duplica el intervalo y avanza');
  sb.ME.lang = 'en';
  sb.pzAskPhNext();
  t(input.placeholder === 'write to posty…', 'ASKf: EN rota con la lista en inglés');
}

// ---------- Intactos ----------
{
  t(app.includes('Mi feed queda a medias y no me trae clientes'), 'INT: hero Lote 14 intacto');
  t(app.includes('hfWhenChip'), 'INT: hfWhenChip no tocado (fix DST aparte)');
}

console.log(`LOTE17: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
