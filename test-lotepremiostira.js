// test-lotepremiostira.js — R5 (8/11, decisión Valentino 01:54): la tira de
// Nivel ya no habla de premios ni de ropa. El lote PREMIOS-TIRA (ropa por
// nivel, «te faltan 3 posteos») queda SUPERSEDED: PZ_ROPA y pzRopaPorNivel
// salen, y pzProximoPremioTira pasa a XP: «Nivel N+1» + «te faltan N XP
// para el Nv N+1» (singular «te falta 1 XP…»), Nivel 50 → «nivel máximo».
// Extrae pzProximoPremioTira del bundle y la ejecuta con stubs mínimos.
// Node puro, lee el árbol. Uso: node test-lotepremiostira.js
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
const fn = sliceFn(src, 'pzProximoPremioTira', 'function mxTiraHTML');

let ME = { lang: 'es' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
eval(fn);

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('ok - ' + name);
  else { console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); fails++; }
}
const nv = (nivel, avance, nombre_siguiente) => ({ nivel, avance, nombre_siguiente });

// 0. Lo viejo fuera.
check('PZ_ROPA fuera', !src.includes('const PZ_ROPA = ['), src.slice(src.indexOf('PZ_ROPA'), src.indexOf('PZ_ROPA') + 40));
check('pzRopaPorNivel fuera', !src.includes('function pzRopaPorNivel('));
check('sin «Próximo premio» en app.js', !src.includes('Próximo premio') && !src.includes('próximo premio'));

// 1. Caso Valentino: Nv 2, avance 2/5 (XP 2/5 del nivel).
ME = { lang: 'es' };
let out = pzProximoPremioTira(nv(2, { hechos: 2, total: 5 }), 'posty');
check('próximo nivel ES', out.includes('Nivel 3'), out);
check('falta en XP ES', out.includes('te faltan 3 XP para el Nv 3'), out);
check('sin ropa ni posteos', !out.includes('ropa/') && !out.includes('posteos') && !out.includes('semana'), out);
check('sin copy viejo de premio', !out.includes('próximo premio') && !out.includes('Próximo premio') && !out.includes('>premio<'), out); // la clase mx-tira-premio lleva 'premio' en el nombre, no en el copy

// 2. EN.
ME = { lang: 'en' };
out = pzProximoPremioTira(nv(2, { hechos: 2, total: 5 }), 'posty');
check('próximo nivel EN', out.includes('Level 3'), out);
check('falta en XP EN', out.includes('3 XP to Level 3'), out);

// 3. Singular.
ME = { lang: 'es' };
out = pzProximoPremioTira(nv(2, { hechos: 4, total: 5 }), 'posty');
check('singular', out.includes('te falta 1 XP para el Nv 3'), out);

// 4. Sin avance en curso: próximo nivel sí, falta NO.
out = pzProximoPremioTira({ nivel: 6, avance: null }, 'posty');
check('sin avance: nivel sí', out.includes('Nivel 7'), out);
check('sin avance: falta no', !out.includes('te falt'), out);

// 5. Sin lista de faltantes: la falta sale del avance, no de la lista.
out = pzProximoPremioTira(nv(2, { hechos: 2, total: 5 }), 'posty');
check('sin lista: nivel sí', out.includes('Nivel 3'), out);
check('sin lista: falta sí por avance', out.includes('te faltan 3 XP para el Nv 3'), out);

// 6. Nombre del próximo nivel cuando viene.
out = pzProximoPremioTira(nv(3, { hechos: 0, total: 500 }, 'Negocio Visible'), 'posty');
check('nombre del próximo nivel', out.includes('Nivel 4: Negocio Visible'), out);
check('falta 500 XP', out.includes('te faltan 500 XP para el Nv 4'), out);

// 7. Bordes: 50, origen no-posty, sin nivel.
out = pzProximoPremioTira({ nivel: 50 }, 'posty');
check('nv50 nivel máximo sin img', out.includes('nivel máximo') && !out.includes('<img'), out);
check('origen no-posty vacío', pzProximoPremioTira(nv(2, { hechos: 1, total: 5 }), 'oficina') === '');
check('sin nivel vacío', pzProximoPremioTira({}, 'posty') === '');

// 8. Prohibidos intactos en el bundle parcheado.
for (const [n, re, min] of [
  ['guard echo', /pzHeadCollapseEcho/g, 7],
  ['DIAGNOSTICO2', /__pzDiag2/g, 1],
  ['FLIP v634', /pzHeadCollapseAnimate/g, 1],
  ['acceptCountSync', /pzAcceptCountSync/g, 1],
  // mzChatPlus: 0 también en base v793 (el nombre ya no existe en el árbol; fuera de esta suite).
]) {
  const c = (src.match(re) || []).length;
  check('intacto ' + n, c >= min, 'hallados ' + c);
}
check('intacto tope max-width v633', /#inicioView\{max-width:100%\}/.test(css));
// 9. CSS: reglas de la tira intactas.
check('CSS premio', css.includes('.mx-tira-premio{display:flex'));
check('CSS falta', css.includes('.mx-tira-falta{display:block'));
check('CSS viejo intacto', css.includes('.mx-tira-proximo{display:block') && css.includes('.mx-tira-barra i{background:linear-gradient(90deg,#2793C8,#FEC14D)'));

if (fails) { console.log('FALLARON ' + fails + ' checks'); process.exit(1); }
console.log('TODO OK');
