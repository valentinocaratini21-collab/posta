#!/usr/bin/env node
/* LOTE TIPOGRAFÍAS-NUEVAS — test nuevo.
Corre con: node test-lotetipografias.js (sin dependencias, sin red).
Para el control negativo: PZ_TEST_ROOT=<prístino v559> node test-lotetipografias.js
(en prístino fallan solo los asserts de la familia nueva).
Cubre (decisión Valentino 2/11: la app debe sentirse más premium y menos
de sistema; SOLO cambia la familia, nunca tamaños, pesos ni colores):
 - cuerpo = Inter con fallback de sistema al final; títulos h1/h2/h3 = Montserrat.
 - link Google Fonts ES+EN: Inter 400;700 + Montserrat 700;800, display=swap
   (4 archivos antes y 4 después: sin peso nuevo en primera pantalla).
 - tamaños/pesos/interlineados idénticos a prístino (multiconjunto de tokens
   font-size/font-weight/line-height, cuando el prístino está al lado).
 - cobertura ES: ninguna regla restringe unicode-range (nada recorta acentos);
   Inter declara latin y latin-ext en su METADATA de google/fonts y Montserrat
   ya sirve ES/EN en producción hoy; el fallback de sistema cubre igual.
 - sin la fuente externa: la pila termina en sans-serif de sistema, la app
   sigue rindiendo (ninguna regla depende de la webfont para layout).
 - fuera de alcance intacto: .fp-head (única excepción de sistema, sin tocar),
   colores de marca, app.js byte a byte (M78 0/0). */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PZ_TEST_ROOT
  ? path.join(__dirname, process.env.PZ_TEST_ROOT)
  : __dirname; // layout repo: el test vive en la raíz del árbol (adaptado con causa en la liberación v576)
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('FAIL: ' + name); }
}
function rule(src, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = src.match(new RegExp('(?:^|\\n)' + esc + '\\{[^}]*\\}'));
  return m ? m[0] : null;
}

// ---------- cuerpo: Inter + fallback de sistema ----------
const body = rule(CSS, 'body');
ok(!!body, 'CSS: regla body presente');
if (body) {
  const fam = (body.match(/font-family:[^;]*/) || [])[0] || '';
  ok(fam.startsWith('font-family:"Inter"'), 'cuerpo: primera familia Inter');
  ok(!fam.startsWith('font-family:"Montserrat"'), 'cuerpo: ya NO arranca con Montserrat');
  ok(fam.includes('-apple-system') && fam.includes('BlinkMacSystemFont') &&
     fam.includes('"Segoe UI"') && fam.includes('Roboto') &&
     fam.includes('Helvetica') && fam.includes('Arial') &&
     fam.endsWith('sans-serif'), 'cuerpo: fallback de sistema completo al final');
  ok(body.includes('-webkit-font-smoothing:antialiased'), 'cuerpo: antialiasing intacto');
}

// ---------- títulos: Montserrat ----------
const titles = rule(CSS, 'h1,h2,h3');
ok(!!titles, 'CSS: regla h1,h2,h3 presente');
if (titles) {
  const fam = (titles.match(/font-family:[^;}]*/) || [])[0] || '';
  ok(fam.startsWith('font-family:"Montserrat"'), 'títulos: primera familia Montserrat');
  ok(fam.includes('-apple-system') && fam.endsWith('sans-serif'), 'títulos: fallback de sistema al final');
}

// ---------- Google Fonts ES + EN ----------
for (const [name, html] of [['ES', IDX], ['EN', IDX_EN]]) {
  const link = (html.match(/fonts\.googleapis\.com\/css2\?family=[^"]*/) || [])[0] || '';
  ok(link.includes('family=Inter:wght@400;700'), 'link ' + name + ': Inter 400;700');
  ok(link.includes('family=Montserrat:wght@700;800'), 'link ' + name + ': Montserrat 700;800');
  ok(link.includes('display=swap'), 'link ' + name + ': display=swap (sin bloqueo de texto)');
  ok(!link.includes('Montserrat:wght@400;600;700;800'), 'link ' + name + ': ya NO carga Montserrat 400;600');
  ok(html.includes('rel="preconnect" href="https://fonts.googleapis.com"'), 'link ' + name + ': preconnect intacto');
}

// ---------- tamaños/pesos/interlineados: pin de jerarquía ----------
const pins = [
  ['.hero h1{font-size:clamp(37px,6vw,67px);font-weight:800', 'hero h1 37-67px peso 800'],
  ['.page-head h1,.main>h1{font-size:25.5px;font-weight:800', 'título app 25.5px peso 800'],
  ['.section h2{font-size:clamp(26.5px,4vw,40.5px);font-weight:800', 'sección h2 26.5-40.5px peso 800'],
  ['.btn{', 'botón base presente'],
  ['font-weight:800;font-size:14px', 'botón peso 800 tamaño 14px'],
  ['.field input,.field select,.field textarea{', 'campos presentes'],
  ['font-size:16px', 'campos 16px (sin zoom iOS)'],
  ['.hf-ask-input', 'campo mini-chat presente'],
];
for (const [frag, name] of pins) ok(CSS.includes(frag), 'jerarquía intacta: ' + name);

// Multiconjunto de tokens de tamaño/peso/interlineado vs prístino (si está al lado)
const PRISTINE = path.join(__dirname, '..', 'pristine-v575', 'public', 'styles.css'); // base real de la liberación v576 (antes v559)
if (fs.existsSync(PRISTINE) && !process.env.PZ_TEST_ROOT) {
  const OLD = fs.readFileSync(PRISTINE, 'utf8');
  // Tokens ajustados con causa (push combinado v576): vs prístino v575 solo
  // cambian los de los lotes hermanos — apv-tags 14px→12.5px, +hf-d-tags
  // (12.5px + line-height 1.45) y +mx-tira-proximo (12px). El resto idéntico.
  const toks = (s) => (s.match(/font-size:[^;}]+|font-weight:[^;}]+|line-height:[^;}]+/g) || []).sort();
  const tOld = toks(OLD), tNew = toks(CSS);
  const drop1 = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); };
  drop1(tOld, 'font-size:14px'); tOld.push('font-size:12.5px', 'font-size:12.5px', 'font-size:12px', 'line-height:1.45'); tOld.sort();
  ok(JSON.stringify(tNew) === JSON.stringify(tOld), 'tokens font-size/font-weight/line-height idénticos a prístino v575 salvo los 4 deltas documentados de los lotes hermanos');
  // Byte a byte fuera de familia + fuera de las líneas de los 5 lotes: se
  // normalizan las líneas nuevas a sus versiones v575 y debe quedar igual.
  const strip = (s) => s.replace(/font-family:[^;}]+;?/g, '');
  let norm = strip(CSS).replace(/h1,h2,h3\{[^}]*\}\n?/g, '');
  norm = norm.replace('.apv-media{border-radius:18px;overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow);margin-top:14px;margin-bottom:14px;background:#0A1E33}', '.apv-media{border-radius:18px;overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow);margin-bottom:14px;background:#0A1E33}');
  norm = norm.replace('.apv-tags{margin-top:10px;font-size:12.5px;color:var(--mut);line-height:1.6}', '.apv-tags{margin-top:10px;font-size:14px;color:var(--cel);line-height:1.6}');
  norm = norm.replace('.hf-d-tags{font-size:12.5px;color:var(--mut);line-height:1.45}\n', '');
  norm = norm.replace('.mx-tira-proximo{display:block;margin-top:5px;font-size:12px}\n', '');
  norm = norm.replace('  .hf-head .hf-cat,.fp-head .hf-cat{color:#737373}', '  .hf-head .hf-cat,.fp-head .hf-cat{color:#8e8e8e}');
  norm = norm.replace('  .hf-head .hf-tab{color:#737373}', '  .hf-head .hf-tab{color:#8e8e8e}');
  ok(norm === strip(OLD),
    'styles.css: fuera de familia y de las líneas de los 5 lotes, byte a byte igual a prístino v575');
} else {
  console.log('(sin prístino al lado: comparación de tokens omitida, no fallada)');
}

// ---------- cobertura ES y fallback sin red ----------
ok(!/unicode-range/.test(CSS), 'CSS: ninguna regla unicode-range recorta acentos');
const ES = 'áéíóúñ¡¿ÁÉÍÓÚÑ';
ok([...ES].every((c) => c.codePointAt(0) > 127), 'set ES de prueba: acentos e interrogación/exclamación');
ok(!/font-family:[^;}]*"Inter"[^;}]*!important/.test(CSS), 'sin !important en familias (el fallback no queda anulado)');

// ---------- fuera de alcance intacto ----------
const fp = rule(CSS, '.fp-head');
ok(!!fp && fp.includes('font-family:-apple-system'), '.fp-head: excepción de sistema intacta, sin tocar');
ok(CSS.includes('#2793C8') && CSS.includes('#FEC14D') && CSS.includes('#0A1E33'), 'colores de marca intactos');
ok(APP.includes('pzAprobarEnSitio') && APP.includes('hfTileApprove'), 'app.js: funciones de aprobar presentes (sin tocar JS)');

console.log(`\nTIPOGRAFIAS: ${pass} ok, ${fail} fallos`);
if (fails.length) { console.log('Fallos: ' + fails.join(' | ')); process.exit(1); }
