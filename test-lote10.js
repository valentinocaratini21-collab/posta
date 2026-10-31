/* test-lote10.js — LOTE 10 (2026-10-31): 4 reportes del build 3 +
 * renombre Análisis→Estrategia + carta simple + feed/chat blancos.
 * Corre con: node test-lote10.js (desde la raíz del repo).
 * Puro: lee los archivos del árbol, sin red ni servidor.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const APP = R('public/app.js');
const CH = R('public/chunk-analisis.js');
const CSS = R('public/styles.css');
const MOT = R('analysis-engine.js');
const SRV = R('server.js');
const IDX = R('public/index.html');
const IDXEN = R('public/en/index.html');
let okN = 0, failN = 0;
function ok(c, msg) {
  if (c) { okN++; }
  else { failN++; console.log('FALLA:', msg); }
}

// ---------- 1) Corazón visible debajo de cada tile ----------
ok(APP.includes('<span class="hf-cell"><span class="scf-mini-x hf-tile'),
  '1: la tile de posteo va envuelta en .hf-cell');
ok(APP.includes('data-hf-like') && APP.includes('class="hf-like"'),
  '1: fila de acciones con botón corazón data-hf-like (fuera de la tile)');
ok(APP.includes('function hfLikeBind(root)') && APP.includes("hfLikeBind(document.getElementById('inicioView'))"),
  '1: hfLikeBind definido y cableado en Inicio');
ok(APP.includes("closest('[data-hf-like]')") && APP.includes('f3HeartBurst(tile)') && APP.includes('hfTileApprove(tile, t.post)'),
  '1: el corazón hace burst + hfTileApprove (igual que detalle y doble toque)');
ok(APP.includes("cell0.outerHTML = homeTileHTML(t2, rec.i)") && APP.includes("fc.insertAdjacentHTML('beforebegin', homeTileHTML(t2, rec.i))"),
  '1: el parcheo en vivo reemplaza/inserta la celda entera, no la tile suelta');
ok(APP.includes('apv-like') && APP.includes('apvAccept'),
  '1: el corazón del detalle sigue presente (apv-like + apvAccept)');
ok(APP.includes('</span><div class="hf-cell-actions"><button type="button" class="hf-like" data-hf-like'),
  '1: la fila va DESPUÉS del cierre de la tile (fuera, nunca sobre la foto)');

// ---------- 2) Día + hora reales (programado o planificado) ----------
ok(APP.includes('function hfPlanChip(ymd)'),
  '2: hfPlanChip definido');
ok(APP.includes("hfWhenChip(p) || (p.status === 'draft' ? hfPlanChip(t.day) : '')"),
  '2: borrador sin scheduled_at muestra su día del plan');
ok(APP.includes('function hfWhenChip(post, now)') && APP.includes('post.scheduled_at'),
  '2: el camino scheduled_at real (hfWhenChip) queda intacto');
ok(APP.includes('function slotHour()'),
  '2: la hora del plan es slotHour (la misma política del servidor)');
// Funcional: hfPlanChip con stubs (extracción por ancla exacta, sin lexer).
(function () {
  const start = APP.indexOf('function hfPlanChip(ymd) {');
  const endMark = "return `${wd} ${dTxt} · ${hhTxt}`;\n  } catch (e) { return ''; }\n}";
  const end = APP.indexOf(endMark, start);
  ok(start >= 0 && end > start, '2: hfPlanChip extraíble del bundle');
  if (start < 0 || end <= start) return;
  const src = APP.slice(start, end + endMark.length);
  const fn = new Function('ME', 'pcTz', 'slotHour', src + '; return hfPlanChip;')(
    { lang: 'es' }, () => 'America/Argentina/Buenos_Aires', () => 19);
  const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
  const fmt = new Intl.DateTimeFormat('en-CA', Object.assign({ year: 'numeric', month: '2-digit', day: '2-digit' }, tz));
  const today = fmt.format(new Date());
  const tom = fmt.format(new Date(Date.now() + 86400000));
  const [y, m, d] = today.split('-').map(Number);
  const dtTxt = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-AR', Object.assign({ day: 'numeric', month: 'numeric' }, tz));
  ok(fn(today) === `Hoy ${dtTxt} · 19:00`, '2: hfPlanChip(hoy) = "Hoy D/M · 19:00", dio: ' + fn(today));
  const [y2, m2, d2] = tom.split('-').map(Number);
  const tomTxt = new Date(Date.UTC(y2, m2 - 1, d2, 12)).toLocaleDateString('es-AR', Object.assign({ day: 'numeric', month: 'numeric' }, tz));
  ok(fn(tom) === `Mañana ${tomTxt} · 19:00`, '2: hfPlanChip(mañana) = "Mañana D/M · 19:00", dio: ' + fn(tom));
  ok(fn('') === '' && fn('nope') === '' && fn(null) === '', '2: sin día no hay chapita (nunca inventada)');
  const wd = new Date(Date.UTC(2026, 10, 7, 12)).toLocaleDateString('es-AR', Object.assign({ weekday: 'short' }, tz)).replace(/\./g, '');
  const wdCap = wd.charAt(0).toUpperCase() + wd.slice(1);
  const d7 = new Date(Date.UTC(2026, 10, 7, 12)).toLocaleDateString('es-AR', Object.assign({ day: 'numeric', month: 'numeric' }, tz));
  ok(fn('2026-11-07') === `${wdCap} ${d7} · 19:00`, '2: hfPlanChip(día plan) = "DíaSem D/M · 19:00", dio: ' + fn('2026-11-07'));
})();

// ---------- 3) Voicenote: sin fix web inventado ----------
// El repo no trae el shell iOS (sin Info.plist): el crash de micrófono
// por falta de NSMicrophoneUsageDescription es un pendiente de build 4.
// Lo que sí se verifica acá: ningún camino de audio en la web crea
// reproductores fuera de los <audio controls> nativos ya existentes.
ok(!/new Audio\(/.test(APP), '3: la web no crea Audio() programático (solo <audio controls> nativos)');
ok(!fs.existsSync(path.join(__dirname, 'ios')), '3: el shell iOS no vive en este repo (pendiente build 4, no fix web)');

// ---------- 4) Chat fijo abajo: panel, no pantalla ----------
ok(CSS.includes('.mz-sheet{left:12px;right:12px;top:auto;bottom:calc(136px + env(safe-area-inset-bottom));background:transparent'),
  '4: .mz-sheet es panel compacto sobre la barra (sin inset:0 ni velo)');
ok(CSS.includes('.mz-sheet-card{height:min(54dvh,460px);border-radius:22px}'),
  '4: la tarjeta del panel es compacta (54dvh, no 92dvh)');
ok(!CSS.includes('body.mz-sheet-open{overflow:hidden}'),
  '4: sin bloqueo de scroll con el panel abierto (el feed sigue visible)');
ok(!APP.includes("document.body.classList.add('mz-sheet-open')"),
  '4: mzOpenSheet ya no marca scroll-lock');
ok(APP.includes('function mzCloseSheet()') && APP.includes("document.getElementById('chatInput')"),
  '4: cerrar + input del chat siguen existiendo');

// ---------- 5) Estrategia: renombre completo, lógica intacta ----------
ok(APP.includes("gzT('Estrategia', 'Strategy')"), '5: tab bb-shell Estrategia/Strategy');
ok(APP.includes("pzIc('stems'), 'Estrategia')"), '5: tab móvil Estrategia');
ok(APP.includes("data-tab=\"analisis\"") && APP.includes("pzIc('stems')}</span>Estrategia</button>"),
  '5: drawer Estrategia, ruta interna analisis intacta');
ok(APP.includes("tab === 'analisis'") && APP.includes("loadChunk('analisis')"),
  '5: la ruta #/app/analisis y el chunk no cambian (solo texto)');
ok(CH.includes('Próxima estrategia: ') && CH.includes('Next strategy: '),
  '5: línea próxima estrategia ES/EN');
ok(CH.includes("'Tu estrategia'") && CH.includes("'Your strategy'"),
  '5: título de sección Tu estrategia/Your strategy');
ok(CH.includes("'Ver mi estrategia completa'") && CH.includes('Actualizar estrategia') && CH.includes("'Armar mi estrategia'"),
  '5: botones de la sección en Estrategia');
for (const old of ['Próximo análisis', 'Next analysis', "'Tu análisis'", "'Your analysis'", "'Ver mi análisis", "'See my full analysis'", 'Actualizar análisis', 'Refresh analysis', "'Armar mi análisis'", "'Build my analysis'", "'Análisis #'", "'Analysis #'", 'Estoy armando tu análisis', 'Building your analysis']) {
  ok(!CH.includes(old), '5: sin resto visible "' + old + '" en chunk-analisis');
}
ok(!/gzT\('Análisis'/.test(APP), '5: sin tab Análisis en app.js');
ok(CH.includes('domingo 20:00') || CH.includes('20:00–22:59'),
  '5: la ventana domingo 20:00–22:59 sigue documentada (lógica intacta)');

// ---------- 6) Carta Estrategia: simple + primera línea exacta ----------
ok(CH.includes("anaT('la estrategia para esta semana', 'the strategy for this week')") && CH.includes('ana-ltr-first'),
  '6: primera línea exacta ES/EN con clase ana-ltr-first');
ok(CH.includes('if (carta) h += `<p class="ana-ltr-first"'),
  '6: la frase se antepone al cuerpo de la carta');
ok(MOT.includes("'. Sostenerlo y afinarlo es mi trabajo.'") && !MOT.includes('para eso estoy.'),
  '6: festejo sin cola larga (fuerte)');
ok(MOT.includes("'. Sobre eso construimos.'") && !MOT.includes('no partimos de cero.'),
  '6: festejo sin cola larga (normal)');
ok(MOT.includes("'De tu lado, esta semana: nada. El plan lo corro yo.'") && !MOT.includes('de verdad. El plan lo corro yo — vos seguí'),
  '6: pedido corto (prefijo pineado intacto)');
ok(MOT.includes('festejemos lo bueno, que es mérito tuyo') && MOT.includes('constancia la pongo yo'),
  '6: pines de la carta intactos (festejo + cierre de la casa)');
ok(MOT.includes('viven en tu vista Estrategia.') && MOT.includes('live in your Strategy view.'),
  '6: nota de mercado bloqueado apunta a la vista Estrategia');

// ---------- 7) Feed y chat TODO BLANCOS ----------
ok(CSS.includes('.hf-grid,.fp-grid{background:#fff}'),
  '7: grilla blanca en modo oscuro (override tras el bloque navy)');
ok(CSS.includes('.hf-wrap .mz-chatbar{background:#fff') && CSS.includes('.hf-wrap .mz-chatbar .mz-mic{color:#0A1E33}'),
  '7: barra de chat blanca en modo oscuro, micrófono oscuro legible');
ok(CSS.includes('#pzNivelStrip{background:#0A1E33'),
  '7: la tirita del jardín NO se toca (sigue navy en oscuro)');
ok(CSS.includes('.chat-msg.ai') && CSS.includes('.chat-msg.u'),
  '7: burbujas distinguibles Posty/usuario intactas');
ok(CSS.includes('.hf-like{') && CSS.includes('background:#fff'),
  '7: el corazón visible va sobre blanco');

// ---------- M78: funciones llamadas desde tarjetas/menús existen ----------
(function () {
  const defs = [];
  for (const src of [APP, CH]) {
    for (const m of src.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)) defs.push(m[1]);
  }
  const called = ['pzIc', 'f3HeartBurst', 'hfTileApprove', 'hfPlanChip', 'hfWhenChip', 'slotHour', 'pcTz', 'anaT', 'mzOpenSheet', 'mzCloseSheet', 'chatUpdateSendBtn', 'chatScroll'];
  const missing = called.filter((f) => !defs.includes(f));
  ok(!missing.length, 'M78: funciones auditadas ' + (called.length - missing.length) + '/' + called.length + (missing.length ? ' (faltan: ' + missing.join(', ') + ')' : ''));
})();

// ---------- Censo y versiones ----------
const cnt = (s, p) => (s.match(new RegExp(p, 'g')) || []).length;
ok(cnt(SRV, 'catsMatch') === 3 && cnt(SRV, 'week-redo') === 16 && cnt(SRV, 'first_week') === 3 && cnt(SRV, '/aprobar') === 16,
  'censo server 3/16/3/16 intacto');
ok(cnt(SRV, 'autofetch') === 0, 'censo autofetch 0');
ok(SRV.includes("const BUILD_ID = '20261031-v510'"), 'BUILD v510');
ok(IDX.includes('app.js?v=332') && IDX.includes('styles.css?v=20261053'), 'index ?v= app 332 + styles 20261053');
ok(IDXEN.includes('styles.css?v=20261053'), 'en/index styles 20261053');
ok(APP.includes("const CHUNK_V = '20261031-v510'"), 'CHUNK_V v510 (chunk-analisis cache-busteado)');

console.log(`\n== test-lote10: ${okN} ok · ${failN} fallas ==`);
process.exit(failN ? 1 : 0);
