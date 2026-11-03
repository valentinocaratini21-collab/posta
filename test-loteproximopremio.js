// test-loteproximopremio.js — LOTE PRÓXIMO-PREMIO (decisión Valentino 2/11).
// La tira de Inicio (mxTiraHTML, origen 'posty') dice en palabras el
// próximo premio: primer nivel NO desbloqueado por encima del nivel real,
// nombre exacto de PZ_ROPA + nivel. Sin dato real no se inventa nada;
// en 50, todos desbloqueados. La pantalla del jardín NO se toca.
// Node puro, lee el árbol. Uso: node test-loteproximopremio.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const priApp = fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', 'public', 'app.js'), 'utf8');
const priSrv = fs.readFileSync(path.join(__dirname, '..', 'pristine-v575', 'server.js'), 'utf8'); // base real v575 (v559→v575 server cambió en v573)
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
// Extracción por balanceo de llaves (robusta ante templates con } dentro).
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  let i = src.indexOf('{', start);
  if (i < 0) return '';
  let depth = 0, inTpl = false, inStr = null, esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { if (inTpl || inStr) esc = true; continue; }
    if (inTpl) { if (c === '`') inTpl = false; continue; }
    if (inStr) { if (c === inStr) inStr = null; continue; }
    if (c === '`') { inTpl = true; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}
function sandbox(lang) {
  const sb = {
    console, ME: { lang: lang || 'es', id: '1' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    Intl, Date, Map, Set,
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  vm.createContext(sb);
  return sb;
}
function load(sb, names) {
  for (const n of names) {
    const code = extractFn(app, n);
    t(code.length > 0, 'existe ' + n);
    if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
  const a = app.indexOf('const PZ_ROPA');
  t(a >= 0, 'existe const PZ_ROPA');
  if (a >= 0) {
    const b = app.indexOf('];', a);
    vm.runInContext(app.slice(a, b + 2).replace('const PZ_ROPA =', 'globalThis.PZ_ROPA ='), sb);
  }
}
// Nombres ES exactos vigentes (decisión 2/11, 50 niveles).
const ES = ['Gorra celeste', 'Anteojos redondos', 'Bufanda celeste', 'Flor en la oreja', 'Hoja en el pelo', 'Conjunto Brote dorado', 'Sombrero de paja', 'Anteojos de sol', 'Moño dorado', 'Audífonos', 'Conjunto Raíz firme', 'Gorra dorada', 'Anteojos estrella', 'Pañuelo verde', 'Vincha deportiva', 'Conjunto Tallo alto', 'Boina verde', 'Anteojos corazón', 'Collar de flores', 'Aros dorados', 'Conjunto Copa verde', 'Galera celeste', 'Monóculo dorado', 'Bufanda rayada', 'Estrellita en la mejilla', 'Conjunto Flor del local', 'Gorro de lana', 'Anteojos de lectura', 'Corbata celeste', 'Mariposa', 'Conjunto Fruto de la casa', 'Sombrero explorador', 'Antiparras', 'Chal dorado', 'Cintillo de bambú', 'Conjunto Claro del bosque', 'Sombrero de fiesta', 'Anteojos de fiesta', 'Pañuelo de estrellas', 'Abeja dorada', 'Conjunto Leyenda del barrio', 'Sombrero vaquero', 'Anteojos con brillo', 'Collar de hojas', 'Broche de flor', 'Conjunto Maestro del jardín', 'Gorra marinera', 'Anteojos de maestro', 'Bufanda del maestro', 'Corona del maestro'];
const sb = sandbox('es');
load(sb, ['pzRopaPorNivel', 'pzProximoPremioTira']);
const sbEn = sandbox('en');
load(sbEn, ['pzRopaPorNivel', 'pzProximoPremioTira']);
const pp = (s, nv, origen) => s.pzProximoPremioTira(nv, origen === undefined ? 'posty' : origen);
const strip = (s) => s.replace(/<[^>]+>/g, '');
// (a) PZ_ROPA intacta y exacta
t(sb.PZ_ROPA.length === 50, 'PZ_ROPA tiene 50 entradas');
t(sb.PZ_ROPA.every((e, i) => e.nv === i + 1), 'PZ_ROPA nv 1..50 en orden');
t(sb.PZ_ROPA.every((e, i) => e.es === ES[i]), 'PZ_ROPA nombres ES exactos (50/50)');
t(sb.PZ_ROPA.every((e) => typeof e.en === 'string' && e.en.length > 0), 'PZ_ROPA nombres EN presentes (50/50)');
// (b) Próximo correcto, ES
t(strip(pp(sb, { nivel: 0 })) === 'próximo: Gorra celeste en nivel 1', 'nv0 → Gorra celeste nv1');
t(strip(pp(sb, { nivel: 1 })) === 'próximo: Anteojos redondos en nivel 2', 'nv1 → Anteojos redondos nv2');
t(strip(pp(sb, { nivel: 5 })) === 'próximo: Conjunto Brote dorado en nivel 6', 'nv5 → Conjunto Brote dorado nv6');
t(strip(pp(sb, { nivel: 11 })) === 'próximo: Gorra dorada en nivel 12', 'nv11 → Gorra dorada nv12');
t(strip(pp(sb, { nivel: 25 })) === 'próximo: Conjunto Flor del local en nivel 26', 'nv25 → Conjunto Flor del local nv26');
t(strip(pp(sb, { nivel: 49 })) === 'próximo: Corona del maestro en nivel 50', 'nv49 → Corona del maestro nv50');
t(!strip(pp(sb, { nivel: 49 })).includes('…'), 'nv49 sin puntos suspensivos');
t(strip(pp(sb, { nivel: 50 })) === 'todos los premios desbloqueados', 'nv50 → todos desbloqueados');
t(!strip(pp(sb, { nivel: 50 })).includes('próximo'), 'nv50 sin prefijo próximo');
t(strip(pp(sb, { nivel: 51 })) === 'todos los premios desbloqueados', 'nv51 → todos desbloqueados');
t(strip(pp(sb, { nivel: 5.9 })) === 'próximo: Conjunto Brote dorado en nivel 6', 'nv5.9 → piso a 5, próximo nv6');
// (c) EN
t(strip(pp(sbEn, { nivel: 5 })) === 'next: Golden sprout set at level 6', 'EN nv5 → Golden sprout set lv6');
t(strip(pp(sbEn, { nivel: 49 })) === 'next: Master crown at level 50', 'EN nv49 → Master crown lv50');
t(strip(pp(sbEn, { nivel: 50 })) === 'all rewards unlocked', 'EN nv50 → all rewards unlocked');
t(strip(pp(sbEn, { nivel: 1 })) === 'next: Round glasses at level 2', 'EN nv1 → Round glasses lv2');
// (d) Sin dato real: nada inventado
t(pp(sb, null) === '', 'sin dato: null → vacío');
t(pp(sb, {}) === '', 'sin dato: {} → vacío');
t(pp(sb, { nivel: 'x' }) === '', 'sin dato: nivel string → vacío');
t(pp(sb, { nivel: NaN }) === '', 'sin dato: nivel NaN → vacío');
t(pp(sb, { nivel: undefined }) === '', 'sin dato: nivel undefined → vacío');
t(!strip(pp(sb, {})).includes('Gorra'), 'sin dato: ningún nombre de premio');
// (e) Solo Inicio: la tira de la vista oficina no cambia
t(pp(sb, { nivel: 5 }, 'gesty') === '', 'origen gesty → vacío');
t(pp(sb, { nivel: 5 }, 'otro') === '', 'origen otro → vacío');
t(pp(sb, { nivel: 5 }) !== '', 'origen posty → línea');
// (f) Cableado en la tira viva
const tira = sliceFn(app, 'function mxTiraHTML', 'async function mxPortTop');
t(tira.includes('pzProximoPremioTira(nvP, origen)'), 'mxTiraHTML llama a pzProximoPremioTira(nvP, origen)');
t(tira.includes('El bambusal'), 'mxTiraHTML conserva El bambusal');
t(tira.includes('mxBarra(pzNivelAvance(nvP))'), 'mxTiraHTML conserva la barrita');
t(tira.includes("gzT('Mi jardín', 'My garden')"), 'mxTiraHTML conserva Mi jardín · Nv');
t(tira.includes('mx-chev'), 'mxTiraHTML conserva el chev');
t(tira.indexOf('pzProximoPremioTira(nvP, origen)') > tira.indexOf('mxBarra(pzNivelAvance(nvP))'), 'la línea va DESPUÉS de la barrita');
t((tira.match(/pzProximoPremioTira\(nvP, origen\)/g) || []).length === 1, 'un solo llamador de la línea dentro de la tira');
// (g) Jardín/Premios intacto
const jardinW = sliceFn(app, 'function mxJardinHTML', 'function mxJardinErrorHTML');
const jardinP = sliceFn(priApp, 'function mxJardinHTML', 'function mxJardinErrorHTML');
t(jardinW === jardinP, 'mxJardinHTML byte-idéntico a prístino');
t(!jardinW.includes('mx-tira-proximo'), 'jardín sin la línea de la tira');
// (h) CSS
t(css.includes('.mx-tira-proximo{display:block;margin-top:5px;font-size:12px}'), 'css .mx-tira-proximo en bloque bajo la barra');
// (i) Server intacto
t(srv.replace(/const BUILD_ID = '[^']*'/, 'BUILD') === priSrv.replace(/const BUILD_ID = '[^']*'/, 'BUILD') && srv.includes("const BUILD_ID = '20261101-v576'"), 'server.js: solo cambia la línea BUILD (v576) vs prístino (pin rotado con causa: liberación v576)');
// (j) M78: la función nueva existe definida y llamada
t((app.match(/function pzProximoPremioTira\(/g) || []).length === 1, 'M78: pzProximoPremioTira definida 1 vez');
t(app.includes('function pzRopaPorNivel('), 'M78: pzRopaPorNivel preexistente, no duplicada');
console.log(`loteproximopremio: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
