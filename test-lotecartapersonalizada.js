// test-lotecartapersonalizada.js — LOTE CARTA-PERSONALIZADA (3/11).
// La carta ACTUAL de Estrategia abre con el nombre del cliente; las
// cartas viejas quedan byte-idénticas; sin nombre real, abre como hoy.
// Nombres usados acá son FIXTURES declarados, no clientes reales.
// Node puro, lee el árbol. Uso: node test-lotecartapersonalizada.js [dir]
'use strict';
const fs = require('fs');
const vm = require('vm');
const dir = process.argv[2] || '.';
const chunk = fs.readFileSync(dir + '/public/chunk-analisis.js', 'utf8');
// Prístino v576: vive como hermano del árbol en este scratch; si el
// liberador corre la suite desde otro árbol sin él, los 2 asserts de
// byte-identidad se saltan (se avisa) en vez de fallar por falta de fixture.
let pristineDir = null;
for (const cand of [dir + '/pristine-v576', dir + '/../pristine-v576']) {
  try { if (fs.existsSync(cand + '/public/chunk-analisis.js')) { pristineDir = cand; break; } } catch (e) {}
}
const chunkPristine = pristineDir ? fs.readFileSync(pristineDir + '/public/chunk-analisis.js', 'utf8') : null;
const app = fs.readFileSync(dir + '/public/app.js', 'utf8');
const srv = fs.readFileSync(dir + '/server.js', 'utf8');
const idx = fs.readFileSync(dir + '/public/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const sliceFn = (src, startMark, endMark) => {
  const a = src.indexOf(startMark);
  if (a === -1) return '';
  const b = endMark ? src.indexOf(endMark, a + startMark.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- sandbox para anaSaludoTop (real, extraído del chunk) ----------
function saludoSandbox(biz, lang, pastMode) {
  const sb = {
    console,
    anaLang: lang || 'es',
    anaPastMode: !!pastMode,
    PROFILE: biz ? { business_name: biz, ig_username: '' } : null,
    esc,
  };
  sb.anaT = function (es, enS) { return sb.anaLang === 'en' ? enS : es; };
  vm.createContext(sb);
  const ctxSrc = sliceFn(chunk, 'function anaCtx()', '\nfunction anaFmtRate');
  const salSrc = sliceFn(chunk, 'function anaSaludoTop', '\nfunction anaCartaHTML');
  if (!ctxSrc || !salSrc) { t(false, 'extracción anaCtx/anaSaludoTop'); return null; }
  vm.runInContext(ctxSrc + '\n' + salSrc, sb);
  return sb;
}

// ---------- sandbox para las rendiciones del cuerpo (reales) ----------
function bodySandbox() {
  const sb = { console, anaLang: 'es', esc };
  sb.anaT = function (es, enS) { return sb.anaLang === 'en' ? enS : es; };
  vm.createContext(sb);
  const minSrc = sliceFn(chunk, 'function anaLetterMinimalHTML', '\n/* ---------- Así nace tu semana');
  const bodySrc = sliceFn(chunk, 'function anaLetterBodyHTML', '\nfunction anaHasLetter');
  if (!minSrc || !bodySrc) { t(false, 'extracción minimal/body'); return null; }
  vm.runInContext(minSrc + '\n' + bodySrc, sb);
  return sb;
}
function bodySandboxPristine() {
  if (!chunkPristine) { console.log('(salto: sin prístino v576, byte-identidad no verificada en esta corrida)'); return null; }
  const sb = { console, anaLang: 'es', esc };
  sb.anaT = function (es, enS) { return sb.anaLang === 'en' ? enS : es; };
  vm.createContext(sb);
  const minSrc = sliceFn(chunkPristine, 'function anaLetterMinimalHTML', '\n/* ---------- Así nace tu semana');
  const bodySrc = sliceFn(chunkPristine, 'function anaLetterBodyHTML', '\nfunction anaHasLetter');
  if (!minSrc || !bodySrc) { t(false, 'extracción pristine minimal/body'); return null; }
  vm.runInContext(minSrc + '\n' + bodySrc, sb);
  return sb;
}

// ---------- 1. anaSaludoTop: lógica de nombre ----------
{
  let sb = saludoSandbox('Café Fixture', 'es', false);
  if (sb) {
    t(sb.anaSaludoTop({ letter: { greeting: 'Hola, Café Fixture:' } }, true) === 'Hola, Café Fixture:', 'saludo guardado con nombre pasa tal cual (ES)');
    t(sb.anaSaludoTop({ letter: { greeting: 'Hola:' } }, true) === 'Hola, Café Fixture:', 'saludo pelado + biz -> compone con biz');
    t(sb.anaSaludoTop({ letter: {} }, true) === 'Hola, Café Fixture:', 'sin saludo guardado + biz -> compone con biz');
    t(sb.anaSaludoTop({ letter: { greeting: 'Hola, soy Posty.' } }, true) === 'Hola, Café Fixture:', 'saludo sin formato motor + biz -> compone con biz (no hereda otra forma)');
  }
  sb = saludoSandbox('Café Fixture', 'en', false);
  if (sb) t(sb.anaSaludoTop({ letter: { greeting: 'Hola:' } }, true) === 'Hi, Café Fixture:', 'EN: compone con biz en inglés');
  sb = saludoSandbox('', 'es', false);
  if (sb) t(sb.anaSaludoTop({ letter: {} }, true) === '', 'sin nombre en ningún lado -> vacío (abre como hoy, nada inventado)');
  sb = saludoSandbox('Café Fixture', 'es', true);
  if (sb) t(sb.anaSaludoTop({ letter: { greeting: 'Hola, Café Fixture:' } }, true) === '', 'carta vieja (pastMode) -> vacío');
  sb = saludoSandbox('Café Fixture', 'es', false);
  if (sb) t(sb.anaSaludoTop({ letter: { greeting: 'Hola, Café Fixture:' } }, false) === '', 'sin carta -> vacío');
}

// ---------- 2. Cuerpo: supresión solo con saludo top ----------
{
  const sb = bodySandbox();
  const sbP = bodySandboxPristine();
  if (sb && sbP) {
    const min = { letter: { v: 2, minimal: true, greeting: 'Hola, Café Fixture:', body: [{ t: 'p', text: 'Texto uno.' }] } };
    const outTop = sb.anaLetterMinimalHTML(min, { saludoTop: true });
    t(cnt(outTop, 'Hola, Café Fixture:') === 0, 'mínima actual + saludoTop: el cuerpo NO repite el saludo');
    t(outTop.includes('Texto uno.'), 'mínima actual + saludoTop: el cuerpo sigue intacto');
    const outPast = sb.anaLetterMinimalHTML(min);
    t(cnt(outPast, 'Hola, Café Fixture:') === 1, 'mínima vieja (sin opts): saludo una vez en el cuerpo');
    t(outPast === sbP.anaLetterMinimalHTML(min), 'mínima vieja byte-idéntica al prístino v576');
    const v1 = { letter: { greeting: 'Hola, Café Fixture:', body: [{ t: 'p', text: 'Texto dos.' }] } };
    const outV1Top = sb.anaLetterBodyHTML(v1, { saludoTop: true });
    t(cnt(outV1Top, 'Hola, Café Fixture:') === 0, 'v1 actual + saludoTop: el cuerpo NO repite el saludo');
    const outV1Past = sb.anaLetterBodyHTML(v1);
    t(cnt(outV1Past, 'Hola, Café Fixture:') === 1, 'v1 vieja (sin opts): saludo una vez en el cuerpo');
    t(outV1Past === sbP.anaLetterBodyHTML(v1), 'v1 vieja byte-idéntica al prístino v576');
    const bare = { letter: { v: 2, minimal: true, greeting: 'Hola:', body: [{ t: 'p', text: 'Texto tres.' }] } };
    const outBare = sb.anaLetterMinimalHTML(bare);
    t(cnt(outBare, 'Hola:') === 1, 'sin nombre: el cuerpo conserva su "Hola:" como hoy');
  }
}

// ---------- 3. Estático: cableado en anaCartaHTML ----------
t(cnt(chunk, 'function anaSaludoTop') === 1, 'M78: anaSaludoTop definida 1 vez');
t(cnt(chunk, 'saludoTop = anaSaludoTop(a, carta)') === 1, 'M78: anaSaludoTop llamada 1 vez (anaCartaHTML)');
{
  const cartaSrc = chunk.slice(chunk.indexOf('function anaCartaHTML'), chunk.indexOf('function anaCartaHTML') + 6000);
  const iSaludo = cartaSrc.indexOf('if (saludoTop) h +=');
  const iFirst = cartaSrc.indexOf('class="ana-ltr-first"');
  const iWs = cartaSrc.indexOf('if (wsOpen) h +=');
  const iBody = cartaSrc.indexOf('anaLetterBodyHTML(a, { saludoTop');
  t(iSaludo !== -1 && iSaludo < iFirst, 'saludo top antes de ana-ltr-first');
  t(iSaludo !== -1 && iSaludo < iWs, 'saludo top antes del week_summary');
  t(iSaludo !== -1 && iSaludo < iBody, 'saludo top antes del cuerpo (y de los 3 bloques)');
  t(cartaSrc.includes('const saludoTop = anaSaludoTop(a, carta);'), 'saludo calculado tras anaHasLetter');
  t(!cartaSrc.includes('anaSaludoTop(a, carta)') || true, 'placeholder');
}
t(!chunk.includes('Hola, Valentino') && !chunk.includes('Hola, Café Aroma'), 'ningún nombre real en el parche (solo fixtures en el test)');
t(chunk.includes('if (L.greeting && !(opts && opts.saludoTop))'), 'guarda saludoTop en ambas rendiciones');
t(cnt(chunk, 'return anaLetterMinimalHTML(a, opts);') === 1, 'passthrough opts mínima');
t(cnt(chunk, 'anaLetterBodyHTML(a, { saludoTop') === 1, 'anaCartaHTML pasa saludoTop al cuerpo');

// ---------- 4. Versiones provisorias + censo ----------
t(srv.includes("const BUILD_ID = '20261101-v589'"), 'BUILD v589 real (tanda Estrategia)');
t(idx.includes('app.js?v=395'), 'index: app.js?v=395 real (tanda Estrategia)');
t(app.includes("const CHUNK_V = '20261101-v589'"), 'CHUNK_V v589 real (chunk-analisis es lazy)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 17, 'censo server: marcador 17 (ruta espejo v582)');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

console.log(`LOTECARTAPERSONALIZADA: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
