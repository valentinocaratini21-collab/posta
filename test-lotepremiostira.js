// test-lotepremiostira.js — Lote PREMIOS-TIRA (node, sin DOM real).
// SOLO-POSTEOS (4/11): la falta ya no se cuenta en «cosas» de gate sino
// en posteos (avance.hechos/total); con avance presente, la falta se
// muestra aunque no venga lista de faltantes.
// Extrae pzProximoPremioTira + pzRopaPorNivel + PZ_ROPA del bundle
// parcheado y los ejecuta con stubs mínimos. Falla (exit 1) ante el
// primer check roto.
const fs = require('fs');
const src = fs.readFileSync('public/app.js', 'utf8');
const css = fs.readFileSync('public/styles.css', 'utf8');

function sliceFn(src, name, nextMarker) {
  const i = src.indexOf('function ' + name);
  if (i < 0) throw new Error('no existe ' + name);
  let j = nextMarker ? src.indexOf(nextMarker, i) : src.length;
  if (j < 0) j = src.length;
  return src.slice(i, j);
}
// PZ_ROPA: del 'const PZ_ROPA = [' al '];' que cierra el array.
const pi = src.indexOf('const PZ_ROPA = [');
const pe = src.indexOf('\n];', pi);
if (pi < 0 || pe < 0) throw new Error('PZ_ROPA no encontrada');
const prelude = src.slice(pi, pe + 3) + '\nlet PZ_ROPA_NIVEL = 1;\n';
const porNivel = sliceFn(src, 'pzRopaPorNivel', 'function pzRopaAvance');
const fn = sliceFn(src, 'pzProximoPremioTira', 'function mxTiraHTML');

let ME = { lang: 'es' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
eval(prelude + porNivel + fn);

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('ok - ' + name);
  else { console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); fails++; }
}
const nv = (falt, avance) => ({ nivel: 2, faltantes: falt, avance });
const f3 = [{ clave: 'a', falta: 'A' }, { clave: 'b', falta: 'B' }, { clave: 'c', falta: 'C' }];

// 1. Caso Valentino: Nv 2, avance 2/5, 3 pendientes.
ME = { lang: 'es' };
let out = pzProximoPremioTira(nv(f3, { hechos: 2, total: 5 }), 'posty');
check('mini real nivel 3', out.includes('ropa/ropa-03-mini.png'), out);
check('copy simple ES', out.includes('Nivel 3: Bufanda celeste'), out);
check('sin copy viejo', !out.includes('próximo:'), out);
check('falta 3 posteos', out.includes('te faltan 3 posteos'), out);
check('sin número inventado: no semanas', !out.includes('semana'), out);

// 2. EN.
ME = { lang: 'en' };
out = pzProximoPremioTira(nv(f3, { hechos: 2, total: 5 }), 'posty');
check('copy simple EN', out.includes('Level 3: Light blue scarf'), out);
check('falta EN', out.includes('3 posts left'), out);

// 3. Singular.
ME = { lang: 'es' };
out = pzProximoPremioTira(nv([{ clave: 'a', falta: 'A' }], { hechos: 4, total: 5 }), 'posty');
check('singular', out.includes('te falta 1 posteo'), out);

// 4. Sin avance en curso (Nv 5+): premio sí, falta NO.
out = pzProximoPremioTira({ nivel: 6, faltantes: f3, avance: null }, 'posty');
check('sin avance: premio sí', out.includes('Nivel 7: Sombrero de paja'), out);
check('sin avance: falta no', !out.includes('te falt'), out);

// 5. Sin lista de faltantes: premio sí, falta NO.
out = pzProximoPremioTira({ nivel: 2, avance: { hechos: 2, total: 5 } }, 'posty');
check('sin lista: premio sí', out.includes('Nivel 3: Bufanda celeste'), out);
check('sin lista: falta sí por avance', out.includes('te faltan 3 posteos'), out);

// 6. Bordes: 50, origen no-posty, sin nivel.
out = pzProximoPremioTira({ nivel: 50 }, 'posty');
check('nv50 sin img', out.includes('todos los premios desbloqueados') && !out.includes('<img'), out);
check('origen no-posty vacío', pzProximoPremioTira(nv(f3, { hechos: 1, total: 5 }), 'oficina') === '');
check('sin nivel vacío', pzProximoPremioTira({}, 'posty') === '');

// 7. Prohibidos intactos en el bundle parcheado.
for (const [n, re, min] of [
  ['guard echo', /pzHeadCollapseEcho/g, 7],
  ['DIAGNOSTICO2', /__pzDiag2/g, 1],
  ['FLIP v634', /pzHeadCollapseAnimate/g, 1],
  ['acceptCountSync', /pzAcceptCountSync/g, 1],
  ['mzChatPlus', /mzChatPlus/g, 1],
]) {
  const c = (src.match(re) || []).length;
  check('intacto ' + n, c >= min, 'hallados ' + c);
}
check('intacto tope max-width v633', /#inicioView\{max-width:100%\}/.test(css));
// 8. CSS: bloque nuevo + reglas viejas intactas.
check('CSS premio', css.includes('.mx-tira-premio{display:flex'));
check('CSS falta', css.includes('.mx-tira-falta{display:block'));
check('CSS viejo intacto', css.includes('.mx-tira-proximo{display:block') && css.includes('.mx-tira-barra i{background:linear-gradient(90deg,#2793C8,#FEC14D)'));

if (fails) { console.log('FALLARON ' + fails + ' checks'); process.exit(1); }
console.log('TODO OK');
