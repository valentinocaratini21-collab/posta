// LOTE ESTRATEGIA-IMPULSAR — suite nueva (base v559).
// Se ejecuta con: node test-loteestrategiaimpulsar.js
// Lee chunk-analisis.js y styles.css del árbol donde vive el test y los
// compara con pristine-v559 (hermano del árbol de trabajo).
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const baseDir = path.join(dir, '..', '.loteinicio5-release-work');
const appB = fs.readFileSync(path.join(baseDir, 'public', 'app.js'), 'utf8');
const srvB = fs.readFileSync(path.join(baseDir, 'server.js'), 'utf8');
const chunkB = fs.readFileSync(path.join(baseDir, 'public', 'chunk-analisis.js'), 'utf8');
const chunk = fs.readFileSync(path.join(dir, 'public', 'chunk-analisis.js'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'public', 'styles.css'), 'utf8');
const prisDir = path.join(dir, '..', 'pristine-v559');
let chunkP = ''; try { chunkP = fs.readFileSync(path.join(prisDir, 'public', 'chunk-analisis.js'), 'utf8'); } catch (e) {}
const appW = fs.readFileSync(path.join(dir, 'public', 'app.js'), 'utf8');
let appP = ''; try { appP = fs.readFileSync(path.join(prisDir, 'public', 'app.js'), 'utf8'); } catch (e) {}
const srvW = fs.readFileSync(path.join(dir, 'server.js'), 'utf8');
let srvP = ''; try { srvP = fs.readFileSync(path.join(prisDir, 'server.js'), 'utf8'); } catch (e) {}

let ok = 0, bad = 0;
function t(name, cond) {
  if (cond) { ok++; }
  else { bad++; console.log('FAIL: ' + name); }
}

// --- Ejecución real de anaBoostRecHTML con stubs (ES) ---
const anaT = (es, en) => es;
const esc = (s) => String(s == null ? '' : s);
function loadBoth(src) {
  const cut = (name) => {
    const i = src.indexOf('function ' + name + '(');
    const j = src.indexOf('\n}\n', i);
    return src.slice(i, j + 3);
  };
  const code = cut('anaBoostRecPartes') + '\n' + cut('anaBoostRecHTML');
  return new Function('anaT', 'esc', code + '\nreturn {p: anaBoostRecPartes, h: anaBoostRecHTML};')(anaT, esc);
}
const { p: partes, h: htmlFn } = loadBoth(chunk);
const fixture = { mejor: { likes: 84, comments: 12, saved: 5, reach: 1200, image_path: 'foto.jpg', caption: 'Brunch Aroma para dos' }, boostHabilitado: true };
const out = htmlFn(fixture);
t('1. sección Impulsar presente', out.includes('>Impulsar<'));
t('2. saludo carta-impulsar ES exacto', out.includes('¡Hola! Te traigo una idea cortita:'));
t('3. título mejor posteo', out.includes('Tu mejor posteo de la semana'));
t('4. caption real', out.includes('Brunch Aroma para dos'));
t('5. porqué con datos reales (likes/comentarios/guardados/alcance)', out.includes('84 me gusta') && out.includes('12 comentarios') && out.includes('5 guardados') && out.includes('alcance 1200'));
t('6. foto real', out.includes('src="foto.jpg"'));
t('7. montos exactos $20/$50/$100', out.includes('>$20<') && out.includes('>$50<') && out.includes('>$100<'));
t('8. plazo 7 días', out.includes('Impulsalo por 7 días:'));
t('9. despedida — Posty', out.includes('— Posty'));
t('10. orden: sección, saludo, título, despedida al final', out.indexOf('Impulsar') < out.indexOf('idea cortita') && out.indexOf('idea cortita') < out.indexOf('Tu mejor posteo') && out.indexOf('Tu mejor posteo') < out.lastIndexOf('— Posty'));
const outSin = htmlFn({ mejor: { likes: 0, comments: 0, saved: 0, reach: 0, caption: 'Solo texto' }, boostHabilitado: false });
t('11. sin tarjeta guardada: nota honesta, sin montos', outSin.includes('todavía no está habilitado') && !outSin.includes('anaBoostRecElegir'));
t('12. sin datos de interacción: porqué sin números inventados', htmlFn({ mejor: {}, boostHabilitado: true }).includes('Fue tu posteo con más interacción esta semana.'));
const htmlEn = (() => {
  const anaTEn = (es, en) => en;
  const fn = new Function('anaT', 'esc', chunk.slice(chunk.indexOf('function anaBoostRecPartes('), chunk.indexOf('\n}\n', chunk.indexOf('function anaBoostRecHTML(')) + 3) + '\nreturn {p: anaBoostRecPartes, h: anaBoostRecHTML};')(anaTEn, esc);
  return fn.h({ mejor: { likes: 3, comments: 1, saved: 0, reach: 0, caption: 'Cap EN' }, boostHabilitado: true });
})();
t('13. EN: sección Boost + saludo + 7 days', htmlEn.includes('>Boost<') && htmlEn.includes('Hi! A quick idea for you:') && htmlEn.includes('Boost it for 7 days:'));

// --- Separación de la carta ---
const boostDivs = (chunk.match(/<div id="anaBoostRec"><\/div>/g) || []).length;
t('14. exactamente 2 anclas anaBoostRec (una por rama)', boostDivs === 2);
t('15. ningún div dentro de la tarjeta (antes del banner)', !chunk.includes('<div id="anaBoostRec"></div>`;\n    h += `<div class="ana-banner"') && !chunk.includes('<div id="anaBoostRec"></div>`;\n  h += `<div class="ana-banner"'));
t('16. sección hermana tras el cierre de la tarjeta (rama carta)', chunk.includes('h += `</div>`;\n    h += `<div id="anaBoostRec"></div>`;\n    return h;'));
t('17. sección hermana tras el cierre de la tarjeta (rama sin carta)', chunk.includes('h += `</div>`;\n  h += `<div id="anaBoostRec"></div>`;\n  return h;'));

// --- Sin dato: sin tarjeta ---
t('18. rama sin-dato deja el box vacío', /if \(!d\.mejor\) \{\s*box\.innerHTML = '';\s*return;\s*\}/.test(chunk));
t('19. rama sin-dato no dibuja nota ni título', !/if \(!d\.mejor\) \{[^}]*ana-boostrec-t/.test(chunk));

// --- Flujo y gates intactos ---
t('20. handlers Elegir/Confirmar/Load intactos', chunk.includes('function anaBoostRecElegir(') && chunk.includes('function anaBoostRecConfirmar(') && chunk.includes('function anaBoostRecLoad('));
t('21. endpoints intactos', chunk.includes('/api/estrategia/mejor-posteo') && chunk.includes('/api/destacado/impulsar'));
t('22. motivos honestos del servidor intactos (conversión, anuncio fallido)', chunk.includes('conversion_pendiente') && chunk.includes('anuncio_fallido') && chunk.includes('sin reembolso automático'));
t('23. sin PastMode no se muestra (cartas anteriores)', chunk.includes('if (!box || anaPastMode) return;'));
t('24. carta intacta (anaCartaHTML + minimal)', chunk.includes('function anaCartaHTML(') && chunk.includes('function anaLetterMinimalHTML('));
t('25. coordinación sin-audio: botón AUSENTE por sin-audio v565 (aterrizó antes que la tanda); impulsar no lo re-agrega', (chunk.match(/Escuchá tu carta/g) || []).length === 0);

// --- CSS ---
t('26. CSS sección Impulsar', css.includes('.ana-boostrec-sec{'));
t('27. CSS saludo (idéntico a carta-impulsar)', css.includes('.ana-boostrec-saludo{font-size:15px;font-weight:900'));
t('28. CSS despedida con filete dorado', css.includes('.ana-boostrec-despedida{') && css.includes('border-top:1px solid #FEC14D'));
t('29. CSS viejo del boost intacto', css.includes('.ana-boostrec{background:#fff;border:2px solid #FEC14D'));

// --- Sin cambios fuera de alcance ---
// TANDA (conciliación): contra la base v588 real, no contra prístino v559.
// app.js solo cambia la línea CHUNK_V; server.js solo BUILD + bloque
// aprende; el set ana* suma exactamente las 12 funciones de la tanda.
const _appDiff = appW.split('\n').filter((l, i) => l !== appB.split('\n')[i]);
t('30. app.js vs base v588: SOLO cambia la línea CHUNK_V', _appDiff.length === 1 && _appDiff[0].includes('CHUNK_V'));
const _srvLines = srvW.split('\n');
const _apStart = _srvLines.findIndex((l) => l.includes('LOTE ESTRATEGIA-APRENDE'));
const _apEnd = _srvLines.findIndex((l) => l.includes('} catch (e) { aprendizaje = null; }'));
const _srvRev = _srvLines.filter((_, i) => !(i >= _apStart && i <= _apEnd) && _.trim() !== 'aprendizaje,').join('\n').replace('20261101-v589', '20261101-v588');
t('31. server.js vs base v588: SOLO BUILD + bloque aprende', _srvRev === srvB);
const fns = (s) => (s.match(/function ana[A-Za-z0-9]+\(/g) || []).sort().join('|');
const _fnsW = new Set(fns(chunk).split('|').filter(Boolean));
const _fnsB = new Set(fns(chunkB).split('|').filter(Boolean));
const _tanda12 = ['function anaMagiaEntrada(', 'function anaWeekNumsTiles(', 'function anaWeekNumsLoad(', 'function anaNextStepPendientes(', 'function anaNextStepElegir(', 'function anaNextStepHTML(', 'function anaNextStepIrInicio(', 'function anaNextStepIrImpulsar(', 'function anaNextStepMount(', 'function anaNextStepLoad(', 'function anaAprendeHTML(', 'function anaSaludoTop('];
const _diffF = [..._fnsW].filter((f) => !_fnsB.has(f));
const _lostF = [..._fnsB].filter((f) => !_fnsW.has(f));
t('32. M78 tanda: set ana* = base + exactamente las 12 de la tanda, 0 perdidas', _diffF.length === 12 && _tanda12.every((f) => _diffF.includes(f)) && _lostF.length === 0);
t('33. resto de Estrategia: banner, firma y refresh intactos', chunk.includes('ana-banner') && chunk.includes('anaSignHTML') && chunk.includes('Actualizar estrategia'));

console.log(`loteestrategiaimpulsar: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
