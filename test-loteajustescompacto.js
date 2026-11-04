// LOTE AJUSTES-COMPACTO — test nuevo.
// Decisión Valentino 2/11 ~11:10: v551 plano pero "sigue demasiado grande".
// Misma pantalla, misma información, más compacta. Nada eliminado, el
// primario no se toca, vidrio intacto, contraste medido (no maquillado).
// Uso: node test-loteajustescompacto.js [baseDir]  (default: cwd)
// Contra prístino: los asserts del fix fallan; los de no-regresión pasan.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const base = process.argv[2] || process.cwd();
const chunk = fs.readFileSync(path.join(base, 'public/chunk-ajustes.js'), 'utf8');
const css = fs.readFileSync(path.join(base, 'public/styles.css'), 'utf8');
const app = fs.readFileSync(path.join(base, 'public/app.js'), 'utf8');
const server = fs.readFileSync(path.join(base, 'server.js'), 'utf8');

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.log('FAIL: ' + msg); }
  else console.log('ok: ' + msg);
}
function num(re, src, msg) {
  const m = src.match(re);
  ok(m !== null, msg + (m ? ' (' + m[1] + ')' : ' (ausente)'));
  return m ? parseFloat(m[1]) : NaN;
}

// ---------- 1. Bloque compacto presente ----------
ok(css.indexOf('LOTE AJUSTES-COMPACTO') !== -1, 'bloque CSS compacto presente');
ok(chunk.indexOf('page-head aj-head') !== -1, 'encabezado Ajustes con clase aj-head');
ok(chunk.indexOf('card aj-salir') !== -1, 'tarjeta Salir con clase aj-salir');

// ---------- 2. Nada eliminado: 29 ids de ajustes-simple ----------
const IDS29 = ['btnPushEnable', 'btnPreNotifyToggle', 'btnLetterToggle', 'btnFailToggle',
  'btnWaNotifyToggle', 'btnSaveProfile', 'btnSaveBrand', 'btnSavePage', 'btnCopyPage',
  'btnLogoutAj', 'btnPreview', 'planZone', 'founderZone', 'weekShareZone', 'refZone',
  'ttZone', 'ggZone', 'tnZone', 'styleGallery', 'brandPrev', 'brandPf', 'igMsg',
  'ajStAvisos', 'ajStAuto', 'ajStSemana', 's_waNotify', 's_slug', 's_whats', 's_pageon'];
for (const id of IDS29) ok(chunk.indexOf('id="' + id + '"') !== -1, 'id presente: ' + id);
// Re-base v598 (ajustes-simple-2 v590): las 5 filas Más pasaron a tarjetas dentro del desplegable «Más ajustes»; solo preview sigue siendo fila ajmas.
for (const c of ['ajsec-conex', 'ajsec-pagina', 'ajsec-semana', 'ajsec-marca', 'ajsec-referidos'])
  ok(chunk.indexOf('id="' + c + '"') !== -1, 'destino Más como tarjeta: ' + c);
ok(chunk.indexOf('data-ajmas="preview"') !== -1, 'fila Más: preview');
ok(chunk.indexOf('id="btnAjMas2"') !== -1 && chunk.indexOf('id="ajsec-mas2-wrap" hidden') !== -1, 'botón y desplegable «Más ajustes» presentes');
ok(chunk.indexOf('Configuración avanzada') !== -1, 'Configuración avanzada intacta');
ok(chunk.indexOf('id="gzAjustesBox"') !== -1, 'caja Gesty intacta');

// ---------- 3. Orden: Notificaciones primera, botón adentro ----------
// Re-base v598 (ajustes-simple-2 v590): Automático vive DENTRO del desplegable «Más ajustes», después de Mi plan.
const oNotif = chunk.indexOf('id="ajsec-notif"');
const oNeg = chunk.indexOf('id="ajsec-negocio"');
const oPlan = chunk.indexOf('id="ajsec-plan"');
const oMas = chunk.indexOf('id="ajsec-mas2"');
const oSalir = chunk.indexOf('id="btnLogoutAj"');
const oPosty = chunk.indexOf('id="ajsec-posty"');
ok(oNotif !== -1 && oNotif < oNeg && oNeg < oPlan && oPlan < oMas && oMas < oSalir && oSalir < oPosty,
  'orden: Notificaciones > Negocio > Plan > Más ajustes > Salir > tarjeta Posty');
ok(chunk.indexOf('id="btnPushEnable"') > oNotif && chunk.indexOf('id="btnPushEnable"') < oNeg,
  'botón push dentro de Notificaciones (arriba)');

// ---------- 4. Primario intacto: sin regla que lo achique ----------
ok(chunk.indexOf('class="btn btn-primary" id="btnPushEnable"') !== -1, 'botón push sigue btn-primary');
const block = css.slice(css.indexOf('LOTE AJUSTES-COMPACTO'));
ok(block.indexOf('btnPushEnable') === -1 && block.indexOf('btn-primary') === -1,
  'bloque compacto NO toca el botón primario (sigue 13px 24px en 480px)');
ok(block.indexOf('background') === -1 && block.indexOf('color:') === -1,
  'bloque compacto NO toca fondos ni colores (vidrio y grises intactos)');

// ---------- 5. Valores compactos < línea base v551 ----------
let v;
v = num(/\.card\.ajsec\.ajflat\{padding:(\d+)px/, block, 'card padding');
ok(v < 18, 'card padding ' + v + ' < 18 base');
v = num(/\.card\.ajsec\.ajflat\{[^}]*margin-bottom:(\d+)px/, block, 'card margin-bottom');
ok(v < 16, 'card margin-bottom ' + v + ' < 16 base');
v = num(/\.card\.ajsec\.ajflat>\.ajsec-h\{margin-bottom:(\d+)px/, block, 'header card margin');
ok(v < 14, 'ajsec-h margin ' + v + ' < 14 base');
v = num(/\.card\.ajsec h3\{font-size:(\d+)px/, block, 'h3 font');
ok(v < 16.5, 'h3 ' + v + ' < 16.5 base');
v = num(/\.ajmas-row\{padding:(\d+)px/, block, 'fila Más padding');
ok(v < 12, 'ajmas-row padding ' + v + ' < 12 base');
ok(block.indexOf('.ajmas-row{padding:9px 2px}') !== -1 && !/\.ajmas-row\{[^}]*font-size/.test(block),
  'fila Más conserva font 15px (solo se achica el padding)');
v = num(/\.card\.ajsec \.field\{margin-bottom:(\d+)px/, block, 'field margin');
ok(v < 18, 'field margin ' + v + ' < 18 base');
v = num(/\.aj-head\{margin-bottom:(\d+)px/, block, 'encabezado margin');
ok(v < 22, 'page-head margin ' + v + ' < 22 base');
v = num(/\.aj-head h1\{font-size:(\d+)px/, block, 'h1 font');
ok(v < 21, 'h1 ' + v + ' < 21 base');
v = num(/\.aj-head \.ph-ico\{width:(\d+)px/, block, 'icono encabezado');
ok(v < 46, 'ph-ico ' + v + ' < 46 base');
v = num(/\.card\.int-advanced\{padding:(\d+)px/, block, 'int-advanced padding');
ok(v < 18, 'int-advanced padding ' + v + ' < 18 base');
// Inline: ritmo Notificaciones + secundarios
ok(chunk.indexOf('id="avisosPushHint" style="margin-bottom:12px"') !== -1, 'hint push 16 -> 12px');
ok(!/margin:18px 0 8px/.test(chunk), 'etiquetas 18px 0 8px -> 12px 0 6px (0 restantes)');
const a = chunk.indexOf('function ajustesView()');
const b = chunk.indexOf('// TikTok semanal', a);
const span = chunk.slice(a, b);
ok(!span.includes('font-size:12.5px'), '0 secundarios 12.5px en ajustesView');
ok((span.match(/font-size:11\.5px/g) || []).length >= 24, 'secundarios 11.5px en ajustesView (>=24)');

// ---------- 6. Vidrio intacto ----------
ok(css.indexOf('.bb-app.bb-glass-pantallas .card.ajsec{background:rgba(255,255,255,.55)') !== -1,
  'receta vidrio .55 en tarjetas Ajustes intacta');

// ---------- 7. Contraste re-medido (WCAG, mezcla vidrio .55 sobre degradado) ----------
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255)
    .map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(fg, bg) {
  const l1 = lum(fg), l2 = lum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function blend(white, over) {
  const w = [255, 255, 255], o = [1, 3, 5].map(i => parseInt(over.substr(i, 2), 16));
  const r = w.map((x, i) => Math.round(0.55 * x + 0.45 * o[i]));
  return '#' + r.map(x => x.toString(16).padStart(2, '0')).join('');
}
const BACKGROUNDS = {
  'blanco': '#FFFFFF',
  'vidrio sobre azul #DFF1FA': blend(0, '#DFF1FA'),
  'vidrio sobre dorado #FDEEC2': blend(0, '#FDEEC2'),
};
for (const [name, bg] of Object.entries(BACKGROUNDS)) {
  const rn = ratio('#0A1E33', bg), rm = ratio('#47617A', bg);
  console.log('contraste sobre ' + name + ' (' + bg + '): navy ' + rn.toFixed(2) + ', mut ' + rm.toFixed(2));
  ok(rn >= 4.5, 'navy >= 4.5 sobre ' + name);
  ok(rm >= 4.5, 'mut >= 4.5 sobre ' + name);
}
ok(css.indexOf('--dim:#8CA3B8') !== -1, '--dim sin aclarar (preexistente bajo 4.5, no tocado)');

// ---------- 8. Sin cambios de comportamiento / sin funciones nuevas ----------
ok(chunk.indexOf('function ajPushNativeOn(r)') !== -1, 'ajPushNativeOn intacto');
ok(chunk.indexOf('loadNotifyPrefs') !== -1, 'loadNotifyPrefs intacto');
const nFn = (chunk.match(/^function |^async function /gm) || []).length;
console.log('funciones chunk: ' + nFn);
ok(nFn === 14, 'funciones chunk 14 = base v598 (sin nuevas; delta cero vs base)');
ok(app.indexOf('LOTE AJUSTES-COMPACTO') === -1, 'app.js sin tocar por este lote');

// ---------- 9. Censo (debe coincidir con prístino; se compara en el reporte) ----------
function cnt(src, re) { return (src.match(re) || []).length; }
console.log('censo server: catsMatch=' + cnt(server, /catsMatch/g) +
  ' week-redo=' + cnt(server, /week-redo/g) +
  ' first_week=' + cnt(server, /first_week/g) +
  ' /aprobar=' + cnt(server, /\/aprobar/g));
console.log('censo app: pzGoBack=' + cnt(app, /pzGoBack/g) +
  ' pz-detalle-setup=' + cnt(app, /pz-detalle-setup/g) +
  ' /aprobar=' + cnt(app, /\/aprobar/g) +
  ' autofetch=' + cnt(app, /autofetch/g) +
  ' pcDayKeyShift=' + cnt(app, /pcDayKeyShift/g));

console.log(fails === 0 ? 'TODOS OK' : fails + ' FALLOS');
process.exit(fails === 0 ? 0 : 1);
