// LOTE ETIQUETA-SEMANA — suite nueva.
// Uso: node test-loteetiquetasemana.js [root]  (root por defecto: el arbol que contiene este archivo)
// Afirma que Inicio muestra arriba de la grilla la semana actual real
// (lunes–domingo en la zona de la cuenta), en ES y EN, sin inventar nada,
// y que el resto de Inicio queda intacto.
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readPristine = (p) => {
  try { return fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', p), 'utf8'); }
  catch (e) { return null; }
};

const app = read('public/app.js');
const css = read('public/styles.css');
const server = read('server.js');

// Extrae los 3 helpers del lote desde app.js y los evalua con un esc minimo.
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const start = app.indexOf('function pzSemanaLunDom');
const endMark = "  } catch (e) { return ''; }\n}";
const end = app.indexOf(endMark, app.indexOf('function pzSemanaEtiquetaHTML'));
if (start < 0 || end < 0) { console.log('FAIL: helpers no encontrados en app.js'); process.exit(1); }
const helpersSrc = app.slice(start, end + endMark.length);
eval(helpersSrc);

let ok = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { ok++; }
  else { fail++; console.log('FAIL: ' + name); }
};

const BA = 'America/Argentina/Buenos_Aires';
const NY = 'America/New_York';

// (a) Lunes–domingo correctos, incluidos bordes.
t('lun/dom semana 2-8 nov (miercoles 4/11)', JSON.stringify(pzSemanaLunDom(new Date('2026-11-04T12:00:00Z'), BA)) === JSON.stringify({ lun: '2026-11-02', dom: '2026-11-08' }));
t('lun/dom borde lunes 2/11', JSON.stringify(pzSemanaLunDom(new Date('2026-11-02T12:00:00Z'), BA)) === JSON.stringify({ lun: '2026-11-02', dom: '2026-11-08' }));
t('lun/dom borde domingo 8/11', JSON.stringify(pzSemanaLunDom(new Date('2026-11-08T12:00:00Z'), BA)) === JSON.stringify({ lun: '2026-11-02', dom: '2026-11-08' }));
t('lun/dom cruza de mes (28/10 -> 26/10-1/11)', JSON.stringify(pzSemanaLunDom(new Date('2026-10-28T12:00:00Z'), BA)) === JSON.stringify({ lun: '2026-10-26', dom: '2026-11-01' }));
t('lun/dom cruza de anio (30/12 -> 28/12-3/1)', JSON.stringify(pzSemanaLunDom(new Date('2026-12-30T12:00:00Z'), BA)) === JSON.stringify({ lun: '2026-12-28', dom: '2027-01-03' }));

// (b) Zona de la cuenta: mismo instante, distinta semana segun la zona.
t('zona BA: 2/11 04:00Z es lunes 2/11', JSON.stringify(pzSemanaLunDom(new Date('2026-11-02T04:00:00Z'), BA)) === JSON.stringify({ lun: '2026-11-02', dom: '2026-11-08' }));
t('zona NY: 2/11 04:00Z sigue domingo 1/11', JSON.stringify(pzSemanaLunDom(new Date('2026-11-02T04:00:00Z'), NY)) === JSON.stringify({ lun: '2026-10-26', dom: '2026-11-01' }));

// (c) Textos exactos ES y EN.
t('ES mismo mes: Semana del 2 al 8 de noviembre', pzSemanaEtiqueta(new Date('2026-11-04T12:00:00Z'), BA, false) === 'Semana del 2 al 8 de noviembre');
t('EN mismo mes: Week of November 2 to 8', pzSemanaEtiqueta(new Date('2026-11-04T12:00:00Z'), BA, true) === 'Week of November 2 to 8');
t('ES cruza de mes: Semana del 26 de octubre al 1 de noviembre', pzSemanaEtiqueta(new Date('2026-10-28T12:00:00Z'), BA, false) === 'Semana del 26 de octubre al 1 de noviembre');
t('EN cruza de mes: Week of October 26 to November 1', pzSemanaEtiqueta(new Date('2026-10-28T12:00:00Z'), BA, true) === 'Week of October 26 to November 1');
t('ES cruza de anio con anios', pzSemanaEtiqueta(new Date('2026-12-30T12:00:00Z'), BA, false) === 'Semana del 28 de diciembre de 2026 al 3 de enero de 2027');
t('EN cruza de anio con anios', pzSemanaEtiqueta(new Date('2026-12-30T12:00:00Z'), BA, true) === 'Week of December 28, 2026 to January 3, 2027');
t('ES ejemplo del encargo: Semana del 3 al 9 de noviembre', pzSemanaEtiqueta(new Date('2025-11-05T12:00:00Z'), BA, false) === 'Semana del 3 al 9 de noviembre');
t('EN ejemplo del encargo: Week of November 3 to 9', pzSemanaEtiqueta(new Date('2025-11-05T12:00:00Z'), BA, true) === 'Week of November 3 to 9');

// (d) Sin dato no se inventa nada.
t('fecha invalida -> etiqueta vacia', pzSemanaEtiqueta('nope', BA, false) === '');
t('fecha invalida -> lun/dom null', pzSemanaLunDom('nope', BA) === null);
t('zona invalida -> etiqueta vacia', pzSemanaEtiqueta(new Date('2026-11-04T12:00:00Z'), 'Zona/Inventada', false) === '');
t('HTML sin texto -> vacio', pzSemanaEtiquetaHTML('nope', BA, false) === '');

// (e) HTML: solo lectura, sin navegacion ni filtro.
const html = pzSemanaEtiquetaHTML(new Date('2026-11-04T12:00:00Z'), BA, false);
t('HTML rinde p.hf-semana con el texto', html === '<p class="hf-semana">Semana del 2 al 8 de noviembre</p>');
t('HTML no navega ni filtra', !/href|data-hf|onclick/i.test(html));

// (f) Cableado en inicioView: entre pestanas y grilla, no visitante.
const tpl = app.slice(app.indexOf('return `<div id="inicioView"'), app.indexOf('return `<div id="inicioView"') + 3000);
t('inicioView inserta la etiqueta', tpl.includes("pzSemanaEtiquetaHTML(new Date(), tz, enHome)"));
t('etiqueta solo fuera de visitante', tpl.includes("HF_VISITOR ? '' : pzSemanaEtiquetaHTML"));
t('etiqueta va despues de las pestanas', tpl.indexOf('hfTabsHTML') < tpl.indexOf('pzSemanaEtiquetaHTML'));
t('etiqueta va antes de la grilla', tpl.indexOf('pzSemanaEtiquetaHTML') < tpl.indexOf('${gridHTML}'));
t('chat y barra Aceptar intactos en la plantilla', tpl.includes('mz-bottomstack') && tpl.includes('pzAcceptWeekHTML') && tpl.includes('mzChatBar'));
t('cada helper definido una sola vez', (app.match(/function pzSemanaLunDom\(/g) || []).length === 1 && (app.match(/function pzSemanaEtiqueta\(/g) || []).length === 1 && (app.match(/function pzSemanaEtiquetaHTML\(/g) || []).length === 1);

// (g) CSS y resto intacto.
t('regla .hf-semana existe', /#inicioView \.hf-semana\{[^}]*font-size:13px[^}]*color:#737373/.test(css));
// (Liberación v588 · causa: la comparación contra prístino v559 ya no
// puede pasar — v560–v587 agregaron reglas legítimas; el hecho del lote
// es que SU regla está presente exactamente una vez.)
t('styles: regla del lote presente una vez', (() => {
  const rule = '#inicioView .hf-semana{font-size:13px;font-weight:600;color:#737373;line-height:1.5;padding:8px 16px;margin:0}';
  return css.split(rule).length - 1 === 1;
})());
// (Liberación v588 · causa: server.js ya no es byte-idéntico a v559
// por los BUILD v560–v587; el hecho del lote es que no lo toca.)
t('server.js sin marcas del lote', !server.includes('pzSemana'));
t('grilla, tira y tiles intactos en app.js', app.includes('homeGridCompose') && app.includes('pzNivelStripHTML') && app.includes('homeTileHTML') && app.includes('portTopInicio'));

console.log(`loteetiquetasemana: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
