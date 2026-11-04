// LOTE FOTO-MEJORA-PRUEBA — test del lote (node, sin dependencias).
// Uso: node test-lotefotomejoraprueba.js
// Verifica el parche contra la base v605: reconstrucción byte-exacta,
// camino de salto idéntico al viejo, DEMO rotulada, cero publicación sin
// toque, límites honestos y sintaxis de los scripts inline.
const fs = require('fs');
const path = require('path');

const SCRATCH = path.join(__dirname);
const WORK = path.join(SCRATCH, 'work');
const BASE = '/home/hatch/workspace/.lotepruebalogin-release-work/public';

const OLD_HANDLER = `    box.querySelector('#flOk').addEventListener('click', function () {
      window.OC_ESPEJO = { aprobado: 1, productos: FL_E.productos, vetos: FL_E.vetos };
      var b2 = ocq();
      b2.innerHTML = stemHTML() + '<p class="oc-chat">' + esc(T.sproutChat) + '</p><h2 class="oc-q">' + esc(T.sproutTitle) + '</h2>';
      show('v-ocq');
      setTimeout(function () { runGeneration(); }, reduced ? 300 : 900);
    });`;
const NEW_HANDLER = `    box.querySelector('#flOk').addEventListener('click', function () {
      window.OC_ESPEJO = { aprobado: 1, productos: FL_E.productos, vetos: FL_E.vetos };
      fmShow();
    });`;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function fmRegion(src) {
  let a = src.indexOf('// ---- LOTE FOTO-MEJORA-PRUEBA');
  if (a < 0) return null;
  a = src.lastIndexOf('\n', a) + 1; // incluir la indentación de la primera línea
  const b = src.indexOf('// ---- FIN LOTE FOTO-MEJORA-PRUEBA ----');
  if (b < 0) return null;
  return src.slice(a, src.indexOf('\n', b) + 1);
}
function scriptBlocks(src) {
  const out = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

for (const [file, lang] of [['prueba.html', 'ES'], ['en-prueba.html', 'EN']]) {
  console.log('== ' + file + ' (' + lang + ') ==');
  const patched = fs.readFileSync(path.join(WORK, file), 'utf8');
  const base = fs.readFileSync(path.join(BASE, file), 'utf8');
  const fm = fmRegion(patched);

  // A. Integridad del parche
  ok((patched.match(/LOTE FOTO-MEJORA-PRUEBA/g) || []).length === 2, 'bloque FM presente (inicio + fin)');
  ok(patched.includes(NEW_HANDLER), '#flOk llama a fmShow');
  ok(!patched.includes(OLD_HANDLER), 'handler viejo ya no está en #flOk');
  ok((patched.match(/setTimeout\(function \(\) \{ runGeneration\(\); \}, reduced \? 300 : 900\);/g) || []).length === 1,
    'la demora vieja vive solo en fmGoGenerate (1 vez)');
  // Reconstrucción byte-exacta: quitar FM + restaurar handler viejo == base
  const rebuilt = patched.replace(fm, '').replace(NEW_HANDLER, OLD_HANDLER);
  ok(rebuilt === base, 'reconstrucción sin FM == base v605 byte a byte');
  ok(patched.includes('function flRender()') && patched.includes('function screenEspejo()'),
    'espejo (flRender/screenEspejo) intacto');
  ok(patched.includes("'/api/trial/foto-vision'") || patched.includes('/api/trial/foto-vision'),
    'visión del espejo (flFoto) intacta');
  ok(patched.includes("fd.append('photo', OPT_PHOTO"), 'OPT_PHOTO sigue viajando a generación');

  // B. Comportamiento FM
  ok(!!fm, 'región FM extraíble');
  if (fm) {
    ok(fm.includes('fmSkip') && fm.includes("addEventListener('click', function () { fmGoGenerate(); })"),
      'Saltar con un toque → fmGoGenerate');
    ok(fm.includes('stemHTML()') && fm.includes('runGeneration()') && fm.includes('reduced ? 300 : 900'),
      'fmGoGenerate reproduce brote + demora del camino viejo');
    ok(fm.includes('grid-template-columns:1fr 1fr'), 'lado a lado en 2 columnas');
    ok((fm.match(/esc\(FM_URL\)/g) || []).length === 2, 'original y versión Posty usan la misma foto (2 imgs)');
    ok(fm.includes('DEMO'), 'versión Posty rotulada DEMO');
    ok(lang === 'ES' ? fm.includes('así se vería en tu feed') : fm.includes('how it would look in your feed'),
      'rótulo DEMO en ' + lang);
    ok((fm.match(/fetch\(/g) || []).length === 1 && fm.includes('/api/trial/foto-vision'),
      'único fetch del paso: foto-vision (lectura, no publicación)');
    for (const bad of ['/api/posts', '/api/week', '/aprobar', 'api.post', 'publish', 'scheduled']) {
      ok(!fm.includes(bad), 'sin ' + bad + ' en el paso (nada se postea)');
    }
    ok(fm.includes('OPT_PHOTO = FM_FILE'), '"Usar esta foto" fija OPT_PHOTO');
    ok(fm.includes("procedencia: 'foto'") && fm.includes('FM_PROD') && fm.includes('window.OC_ESPEJO'),
      '"Usar" agrega producto foto al espejo solo con visión real');
    ok(fm.includes('5 * 1024 * 1024'), 'límite 5 MB como la foto opcional existente');
    ok(fm.includes('FM_PEND') && (lang === 'ES' ? fm.includes('entra como prueba') : fm.includes('counts as proof')),
      'mensaje honesto si la visión no afirma nada');
    ok(fm.includes('.catch(function () { FM_PROD = null; FM_PEND = true; fmRenderDemo(); })'),
      'fallo de visión no frena la demo ni la prueba');
    ok(!fm.includes('qAnswer') && !fm.includes('TRIAL_QS'), 'sin preguntas nuevas obligatorias');
    for (const bad of ['USD', 'gesty', '2027', '1/2/']) {
      ok(!fm.toLowerCase().includes(bad.toLowerCase()),
        'sin ' + bad + ' en el paso (precios/fechas/Gesty intactos)');
    }
    ok(fm.includes("accept=\"image/*\""), 'input acepta imágenes');
  }

  // C. Sintaxis de los scripts inline (new Function = parseo sin ejecutar)
  const pb = scriptBlocks(patched), bb = scriptBlocks(base);
  ok(pb.length === bb.length, 'misma cantidad de scripts inline que la base (' + bb.length + ')');
  let pErr = 0, bErr = 0;
  pb.forEach((b, i) => { try { new Function(b); } catch (e) { pErr++; console.log('    script parcheado ' + i + ': ' + e.message); } });
  bb.forEach((b, i) => { try { new Function(b); } catch (e) { bErr++; console.log('    script base ' + i + ': ' + e.message); } });
  ok(pErr === 0 && bErr === 0, 'todos los scripts parsean (' + pb.length + ' bloques, 0 errores)');
}

console.log('\n' + pass + ' ok / ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
