// test-lote16.js — LOTE 16 · detalle del posteo + Inicio + chat.
// Valentino eligió del detalle 2, 3, 4, 5 (el 1, foto cortada, NO se
// toca) y los 4 de Inicio + rotación del placeholder del chat.
// Node puro, lee el árbol. Uso: node test-lote16.js
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
    document: { getElementById: () => null, activeElement: null, createElement: () => ({}) },
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

// ---------- Versiones + censo (referencia v517) ----------
t(srv.includes("const BUILD_ID = '20261101-v533'"), 'BUILD v522 en server.js');
t(idx.includes('app.js?v=355') && idx.includes('styles.css?v=20261074'), 'index: app 339 + styles 20261064');
t(idxEn.includes('styles.css?v=20261074') && !idxEn.includes('app.js?v='), 'en/index: styles 20261064, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v516 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- D2: una sola acción de aprobar en el detalle ----------
{
  const det = sliceFn(app, 'function hfDetailHTML', 'function hfDetailWire');
  t(det.length > 0, 'D2: hfDetailHTML existe');
  t(!det.includes('data-hfd-act="like"'), 'D2: corazón fuera de la barra del detalle');
  t(det.includes('data-revaccept'), 'D2: Aceptar sigue como única acción de aprobar');
  t(det.includes('data-hfd-act="comment"') && det.includes('data-hfd-act="share"')
    && det.includes('data-hfd-act="followers"') && det.includes('data-hfd-act="save"'),
    'D2: la fila conserva comentar/compartir/ojo/guardar');
  t(app.includes('hfLikeBind') && app.includes('data-hf-like'), 'D2: corazón sigue en tiles (hfLikeBind intacto)');
  t(app.includes('f3GestureApprove') && app.includes('hfTileApprove'), 'D2: doble toque sigue aprobando (gesto intacto)');
}

// ---------- D3: portada del reel solo si es reel ----------
{
  const det = sliceFn(app, 'function hfDetailHTML', 'function hfDetailWire');
  t(det.includes("isV && !o.visitor && p.status !== 'published'"), 'D3: fila de portada gateada por video + no visitante + no publicado');
  t(det.includes('Elegir la portada del reel') && det.includes('Choose the reel cover'), 'D3: texto de portada ES/EN presente');
  t(det.includes('Ver cómo se recorta') || det.includes('See how it crops'), 'D3: recorte no tocado');
}

// ---------- D4: etiquetas con la función real ----------
{
  const det = sliceFn(app, 'function hfDetailHTML', 'function hfDetailWire');
  t(det.includes('hf-d-lbl'), 'D4: etiquetas presentes en la barra');
  t(det.includes('Pedir cambio') && det.includes('Ask for change'), 'D4: comentar = pedir cambio');
  t(det.includes("hf-d-lbl\">${en ? 'Share' : 'Compartir'}"), 'D4: compartir');
  t(det.includes('Ver en el inicio') && det.includes('See in feed'), 'D4: ojo = ver en el inicio (cómo lo ven los seguidores)');
  t(det.includes("hf-d-lbl\">${en ? 'Save' : 'Guardar'}"), 'D4: guardar');
  t(css.includes('.hf-d-act{flex-direction:column') && css.includes('.hf-d-lbl{'), 'D4: CSS columna + etiqueta');
}

// ---------- D5: encabezado con día y hora ----------
{
  const open = sliceFn(app, 'function hfDetailOpen', 'function hfDetailWire');
  t(app.includes('function hfDetailTitleText'), 'D5: helper de título existe');
  t(open.includes('hfDetailTitleText(post, hfDetailOpts(post))'), 'D5: el título usa día y hora reales');
  t(open.includes('data-hfd-close'), 'D5: flecha atrás intacta');
  t(!open.includes("hf-d-title\">${hfIsEn() ? 'Post' : 'Publicación'}"), 'D5: título genérico fuera');
}

// ---------- I1: tira Nv 1-2 sin tierra (LOTE JARDÍN: SUPERSEDED — la
// miniatura ya no es el brote: es el bambusal completo en chico) ----------
{
  const tira = sliceFn(app, 'function mxTiraHTML', 'async function mxPortTop');
  t(tira.includes('jardin-bambu.webp') && tira.includes('mx-tira-lock') && tira.includes('nvTira < 6'), 'I1 (LOTE JARDÍN): tira = bambusal completo en chico, candadito si Nv<6');
  t(!tira.includes('mx-tira-brote-grande') && !tira.includes('MX_BROTE_SVG'), 'I1 (LOTE JARDÍN): brote dibujado fuera de la tira');
  t(tira.includes('mx-tira-foto'), 'I1: la tira sigue con foto');
  t(css.includes('.mx-tira-lock{'), 'I1 (LOTE JARDÍN): CSS candadito de la tira');
  t(app.includes('mx-jardin-vivo') && app.includes('mxJardinHTML'), 'I1: pantalla Jardín existe (el LOTE JARDÍN la rediseña: hero mosaico + slider)');
}

// ---------- I2: chapita sin mes, hora intacta ----------
{
  t(app.includes('function hfTileChipParts'), 'I2: helper de chapita existe');
  t(app.includes('hf-chip-day') && app.includes('hf-chip-hm'), 'I2: chapita partida en día/hora');
  t(css.includes('.hf-strip .hf-chip-day{') && css.includes('text-overflow:ellipsis'), 'I2: ellipsis solo en el día');
  t(css.includes('.hf-strip .hf-chip-hm{flex:0 0 auto'), 'I2: la hora no se achica');
  t(css.includes('.hf-strip{') && css.includes('gap:8px'), 'I2: gap fijo con el corazón intacto (Lote 13)');
}

// ---------- I3: reel sin cuadro ----------
{
  t(app.includes('window.__vidFb = function'), 'I3: fallback __vidFb existe');
  t(app.includes('onerror="__vidFb(this)"'), 'I3: video de tile con onerror al fallback');
  t(app.includes('data-ph='), 'I3: video lleva el texto del remedio en data-ph');
  const fb = sliceFn(app, 'window.__vidFb', '// Precarga silenciosa');
  t(fb.includes("className = 'hf-tile-under'"), 'I3: remedio con clase propia hf-tile-under');
  t(!fb.includes('hf-tile-ph'), 'I3: remedio NO usa hf-tile-ph (no activa el detector de generando)');
  t(css.includes('.hf-tile-under{'), 'I3: CSS del remedio');
  t(app.includes("querySelector('.hf-tile-ph')") || app.includes('hf-tile-ph'), 'I3: detector de generando sigue vigilando .hf-tile-ph');
}

// ---------- I4: corazones idénticos ----------
{
  t(css.includes('.hf-tile > .hf-like-in{') && css.includes('background:transparent'), 'I4: corazón de la tile en vidrio, botón transparente (CORAZÓN-ABAJO 1/11: abajo a la derecha, 26px en ::before)');
  t(css.includes('.hf-tile > .hf-like-in::before{') && css.includes('box-shadow:0 1px 6px'), 'I4: sombra sutil en el ::before de vidrio (CORAZÓN-ABAJO 1/11)');
  t(css.includes('.hf-like{') && app.includes("pzIc('heart', 20)"), 'I4: tamaño 34×34 e ícono intactos');
}

// ---------- C1: placeholder que rota ----------
{
  t(app.includes("es: ['escribile a posty…', 'preguntale por tu semana…', 'pedile una idea para hoy…', 'contale qué vendés…']"), 'C1: lista ES exacta (4, minúscula)');
  t(app.includes("en: ['write to posty…', 'ask about your week…', 'ask for an idea for today…', 'tell him what you sell…']"), 'C1: lista EN espejo');
  t(app.includes('function pzChatPhNext') && app.includes('function pzChatPhStart') && app.includes('function pzChatPhList'), 'C1: funciones de rotación existen');
  t(app.includes('setInterval(pzPhTick, 4000)'), 'C1 LOTE CHAT4S: intervalo 4 s (antes ~8 s)');
  const rot = sliceFn(app, 'const PZ_CHAT_PH', 'async function bindChatView');
  t(!rot.includes('activeElement'), 'C1 LOTE CHATTEXTO: el foco ya no bloquea la rotación (la guarda vieja dejaba el placeholder fijo en el celular)');
  t(app.includes('if (!PZ_PH_T) PZ_PH_T = setInterval(pzPhTick, 4000)'), 'C1 LOTE CHATTEXTO + CHAT4S: un solo intervalo, 4 s (antes 8 s)');
  const adv = sliceFn(app, 'function pzPhAdvanceOne', 'function pzPhKnown');
  t(adv.includes('el.value'), 'C1 LOTE CHATTEXTO: guarda de texto en el helper compartido');
  const bind = sliceFn(app, 'async function bindChatView', '// Nudge proactivo');
  t(bind.includes('pzChatPhStart()'), 'C1: arranque al final de bindChatView');
  t(app.includes('placeholder="escribile a posty…"'), 'C1: base del template intacta');
}

// ---------- Funcional: título del detalle ----------
{
  const sb = sandbox({ pcTz: () => 'America/Argentina/Buenos_Aires' });
  loadFns(sb, ['hfChipText', 'hfDetailTitleText']);
  const T = sb.hfDetailTitleText;
  t(T({ status: 'draft' }, { en: false, propIso: '2026-11-17T19:00:00Z' }) === 'Mar 17 · 16:00', 'título: borrador mar 17 · 16:00 (misma fuente que la chapita)');
  t(T({ status: 'scheduled', scheduled_at: '2026-11-20T21:00:00Z' }, { en: false }) === 'Vie 20 · 18:00', 'título: programado vie 20 · 18:00');
  t(T({ status: 'published', published_at: '2026-11-10T20:00:00Z' }, { en: false }) === 'Mar 10 · 17:00', 'título: publicado usa published_at');
  t(T({ status: 'draft' }, { en: false, propIso: null }) === 'Publicación', 'título: sin fecha, fallback Publicación');
  sb.ME.lang = 'en';
  t(T({ status: 'draft' }, { en: true, propIso: '2026-11-17T19:00:00Z' }) === 'Tue 17 · 16:00', 'título EN: Tue 17 · 16:00');
  t(T({ status: 'draft' }, { en: true, propIso: null }) === 'Post', 'título EN: sin fecha, fallback Post');
}

// ---------- Funcional: chapita partida ----------
{
  const sb = sandbox();
  loadFns(sb, ['hfTileChipParts']);
  const C = sb.hfTileChipParts;
  const a = C('Mar 17/11 · 19:00', false);
  t(a && a.day === 'Mar 17' && a.hm === '19:00', 'chapita: ES quita el mes, hora intacta');
  const b = C('Tue 11/17 · 7:00 PM', true);
  t(b && b.day === 'Tue 17' && b.hm === '7:00 PM', 'chapita: EN quita el mes inicial, hora intacta');
  t(C('Hoy · 18:00', false) && C('Hoy · 18:00', false).day === 'Hoy', 'chapita: sin mes no rompe nada');
  t(C('sin separador', false) === null, 'chapita: sin « · » devuelve null (render viejo)');
  t(C('', false) === null, 'chapita: vacío devuelve null');
}

// ---------- Funcional: detalle (barra + portada) ----------
{
  const sb = sandbox({
    pzIc: (n) => '<svg-' + n + '>',
    mv: (x) => x,
    pcTz: () => 'America/Argentina/Buenos_Aires',
    HF_D_COMMENT: '<svg-comment>', HF_D_SHARE: '<svg-share>',
    HF_D_SAVE: '<svg-save>', HF_D_SAVE_FULL: '<svg-save-full>',
    HF_D_HEART: '<svg-heart>', HF_D_HEART_FULL: '<svg-heart-full>',
    HF_CUR_PROF: {}, HF_PROPS: {}, HF_VISITOR: false,
  });
  loadFns(sb, ['hfChipText', 'hfRelShort', 'hfRedoLeft', 'hfRedoLineHTML', 'hfCoverState', 'hfCropPct', 'hfCropOverlayHTML', 'hfDetailOpts', 'hfDetailHTML']);
  const D = sb.hfDetailHTML;
  const opts = (o) => Object.assign({ en: false, visitor: false, propIso: '2026-11-17T19:00:00Z', user: '', pic: '', name: '', location: null }, o || {});
  const imgDraft = D({ id: 1, status: 'draft', media_type: 'image', image_path: 'foto.jpg', text: 'Hola mundo' }, opts());
  t(!imgDraft.includes('data-hfd-act="like"'), 'detalle: borrador imagen sin corazón en la barra');
  t(imgDraft.includes('Pedir cambio') && imgDraft.includes('Compartir') && imgDraft.includes('Ver en el inicio') && imgDraft.includes('Guardar'), 'detalle: etiquetas ES en la barra');
  t(imgDraft.includes('data-revaccept') && imgDraft.includes('Aceptar'), 'detalle: Aceptar presente');
  t(!imgDraft.includes('portada del reel'), 'detalle: foto sin fila de portada (D3)');
  const vidDraft = D({ id: 2, status: 'draft', media_type: 'video', image_path: 'reel.mp4', text: 'Reel' }, opts());
  t(vidDraft.includes('Elegir la portada del reel'), 'detalle: reel borrador con fila de portada');
  t(!vidDraft.includes('data-hfd-act="like"'), 'detalle: reel borrador sin corazón');
  const vidPub = D({ id: 3, status: 'published', media_type: 'video', image_path: 'reel.mp4', published_at: '2026-11-10T20:00:00Z' }, opts());
  t(!vidPub.includes('portada del reel'), 'detalle: reel publicado sin fila de portada');
  const vis = D({ id: 4, status: 'draft', media_type: 'image', image_path: 'foto.jpg' }, opts({ visitor: true }));
  t(!vis.includes('hf-d-bar'), 'detalle: visitante sin barra');
  sb.ME.lang = 'en';
  const imgEn = D({ id: 5, status: 'draft', media_type: 'image', image_path: 'foto.jpg' }, opts({ en: true }));
  t(imgEn.includes('Ask for change') && imgEn.includes('See in feed') && imgEn.includes('Save'), 'detalle EN: etiquetas espejo');
}

// ---------- Funcional: tiles (chapita + reel + sin imagen) ----------
{
  const sb = sandbox({
    pzIc: () => '<svg>',
    mv: (x) => x,
    hfWhenChip: () => 'Mar 17/11 · 19:00',
    hfPlanChip: () => '',
    HOME_PIN_SVG: '', HOME_REEL_SVG: '<svg-reel>', HOME_CAR_SVG: '',
  });
  loadFns(sb, ['hfTileChipParts', 'hfCoverState', 'homeTileHTML']);
  const tileImg = sb.homeTileHTML({ kind: 'post', post: { id: 7, status: 'draft', media_type: 'image', image_path: 'x.jpg', text: 'Hola' }, day: '2026-11-17' }, 0);
  t(tileImg.includes('hf-chip-day">Mar 17<') && tileImg.includes('hf-chip-hm"> · 19:00<'), 'tile: chapita sin mes, hora intacta');
  t(!tileImg.includes('17/11'), 'tile: el mes ya no aparece en la chapita');
  const tileReel = sb.homeTileHTML({ kind: 'post', post: { id: 8, status: 'draft', media_type: 'video', image_path: 'reel.mp4', caption: 'Mi reel de prueba con texto largo para el remedio' }, day: '2026-11-17' }, 1);
  t(tileReel.includes('onerror="__vidFb(this)"'), 'tile reel: video con fallback __vidFb');
  t(tileReel.includes('data-ph="Mi reel de prueba con texto largo para el remedio"'), 'tile reel: remedio lleva el texto del posteo');
  t(!tileReel.includes('hf-tile-ph'), 'tile reel: sin clase hf-tile-ph (no marca generando)');
  const tileEmpty = sb.homeTileHTML({ kind: 'post', post: { id: 9, status: 'draft', media_type: 'image', image_path: '', text: '' }, day: '2026-11-17' }, 2);
  t(tileEmpty.includes('hf-tile-ph-txt') && tileEmpty.includes('imagen en camino'), 'tile sin imagen: remedio Lote 13 intacto');
}

// ---------- Funcional: rotación del chat ----------
{
  const input = { value: '', placeholder: 'escribile a posty…', dataset: {} };
  let timers = [];
  const sb = sandbox({
    document: {
      getElementById: (id) => (id === 'chatInput' ? input : null),
      querySelectorAll: (sel) => (sel === '#chatInput' ? [input] : []),
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
    .replace('function pzChatPhStart', 'globalThis.pzChatPhStart = function');
  vm.runInContext(code, sb);
  t(sb.PZ_CHAT_PH.es.length === 4 && sb.PZ_CHAT_PH.en.length === 4, 'chat: 4 sugerencias por idioma');
  sb.pzChatPhStart();
  t(input.placeholder === 'preguntale por tu semana…' && timers.length === 1 && timers[0].ms === 4000, 'chat LOTE CHAT4S: al abrir avanza una y arma intervalo 4 s');
  timers[0].fn();
  t(input.placeholder === 'pedile una idea para hoy…', 'chat: tick en idle avanza');
  input.value = 'hola';
  timers[0].fn();
  t(input.placeholder === 'pedile una idea para hoy…', 'chat: con texto no rota');
  input.value = '';
  sb.document.activeElement = input;
  timers[0].fn();
  t(input.placeholder === 'contale qué vendés…', 'chat LOTE CHATTEXTO: con el campo enfocado y vacío el tick SÍ avanza');
  sb.document.activeElement = null;
  sb.pzChatPhStart();
  t(timers.length === 1, 'chat: reabrir no duplica el intervalo');
  sb.ME.lang = 'en';
  sb.pzChatPhNext();
  t(input.placeholder === 'write to posty…', 'chat EN: rota con la lista en inglés (índice compartido, vuelve a la base)');
}

console.log(`LOTE16: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
