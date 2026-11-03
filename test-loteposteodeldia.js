// test-loteposteodeldia.js — LOTE POSTEO-DEL-DIA (corrección 2/11: sin semana visible).
// Ejecuta las funciones REALES extraídas de public/app.js con stubs mínimos.
// Uso: node test-loteposteodeldia.js
'use strict';
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };

const APP_PATH = __dirname + '/public/app.js';
const CSS_PATH = __dirname + '/public/styles.css';
const src = fs.readFileSync(APP_PATH, 'utf8');
const css = fs.readFileSync(CSS_PATH, 'utf8');

// Extracción por conteo de llaves (el código del lote no tiene llaves
// desbalanceadas en strings: todas las interpolaciones ${} cierran).
function extractFn(s, name) {
  const start = s.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('función no encontrada: ' + name);
  const open = s.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  throw new Error('cierre no encontrado: ' + name);
}

const FN_NAMES = ['pzDiaHoyKey', 'pzDiaClavePost', 'pzDiaEsFutura', 'pzDiaPostHoy',
  'pzDiaAprobado', 'pzDiaDismissKey', 'pzDiaDismissHoy', 'pzDiaHeroHTML'];
let code = '';
for (const n of FN_NAMES) code += extractFn(src, n) + '\n';

// Stubs mínimos.
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
global.pcParseDate = (s) => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? null : d; };
global.pcTz = () => 'America/Argentina/Buenos_Aires';
global.schedDayKeyOf = (dt, tz) => dt.toLocaleDateString('en-CA', { timeZone: tz });
global.pzAprobadoEs = (id) => String(id) === '99';
global.esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
global.pzIc = () => '';
global.hfWhenChip = () => 'Hoy 2/11 · 18:00';
(0, eval)(code);

const TZ = 'America/Argentina/Buenos_Aires';
// Lunes 2/11/2026 12:00 UTC = 09:00 BA (ventana de mañana, día real del lote).
const NOW = new Date('2026-11-02T12:00:00Z');
const P = (id, sched, status, extra) => Object.assign({ id, scheduled_at: sched, status: status || 'scheduled' }, extra || {});

// --- Hoy / selección del posteo ---
ok(pzDiaHoyKey(TZ, NOW) === '2026-11-02', 'hoy en zona cuenta = 2026-11-02');
ok(pzDiaPostHoy([
  P(1, '2026-11-03T21:00:00Z'),
  P(2, '2026-11-02T21:00:00Z'),
  P(3, '2026-11-02T20:00:00Z'),
  P(4, '2026-11-02T20:00:00Z', 'draft'),
  P(5, '2026-11-02T20:00:00Z', 'published'),
], TZ, NOW).id === 3, 'posteo de hoy = el más temprano del día, ignora draft/publicado/otro día');
ok(pzDiaPostHoy([P(1, '2026-11-03T21:00:00Z')], TZ, NOW) === null, 'sin posteo hoy → null (sin hero)');
ok(pzDiaPostHoy([], TZ, NOW) === null, 'sin posteos → null');

// --- Futura de la semana ---
ok(pzDiaEsFutura(P(1, '2026-11-03T21:00:00Z'), '2026-11-02', '2026-11-02') === true, 'martes misma semana = futura');
ok(pzDiaEsFutura(P(1, '2026-11-08T21:00:00Z'), '2026-11-02', '2026-11-02') === true, 'domingo misma semana (diff 6) = futura');
ok(pzDiaEsFutura(P(1, '2026-11-09T21:00:00Z'), '2026-11-02', '2026-11-02') === false, 'lunes siguiente = fuera de semana');
ok(pzDiaEsFutura(P(1, '2026-11-02T21:00:00Z'), '2026-11-02', '2026-11-02') === false, 'hoy no es futura');
ok(pzDiaEsFutura(P(1, '2026-11-01T21:00:00Z'), '2026-11-02', '2026-11-02') === false, 'ayer no es futura');
ok(pzDiaEsFutura(P(1, '2026-11-03T21:00:00Z', 'draft'), '2026-11-02', '2026-11-02') === false, 'borrador no es futura');
ok(pzDiaEsFutura(P(1, null), '2026-11-02', '2026-11-02') === false, 'sin fecha no es futura');
ok(pzDiaEsFutura(P(1, '2026-11-03T21:00:00Z'), '', '') === false, 'sin claves no es futura');

// --- Hero ---
const hero = pzDiaHeroHTML(P(7, '2026-11-02T21:00:00Z', 'scheduled', { image_path: 'fotos/a.jpg', caption: 'Hola' }), { en: false, aprobado: false, dismissed: false });
ok(hero.includes('data-pz-dia-accept="7"'), 'hero pendiente: botón Aceptar');
ok(hero.includes('data-pz-dia-cambiar="7"'), 'hero pendiente: botón Cambiar algo');
ok(hero.includes('data-pz-dia-x'), 'hero: X siempre visible');
ok(hero.includes('El posteo de hoy'), 'hero: título ES');
ok(hero.includes('Programado para hoy'), 'hero pendiente: estado');
ok(hero.includes('fotos/a.jpg'), 'hero: foto real');
ok((hero.match(/✦/g) || []).length === 5, 'hero: 5 destellos de magia');
const heroOk = pzDiaHeroHTML(P(7, '2026-11-02T21:00:00Z', 'scheduled', { image_path: 'fotos/a.jpg' }), { en: false, aprobado: true, dismissed: false });
ok(!heroOk.includes('data-pz-dia-accept'), 'hero aprobado: sin botón Aceptar');
ok(heroOk.includes('Listo, sale hoy'), 'hero aprobado: «Listo, sale hoy»');
ok(heroOk.includes('data-pz-dia-cambiar="7"'), 'hero aprobado: sigue Cambiar algo');
const heroVid = pzDiaHeroHTML(P(8, '2026-11-02T21:00:00Z', 'scheduled', { image_path: 'v.mp4', media_type: 'video' }), { en: false, aprobado: false });
ok(heroVid.includes('<video'), 'hero video: tag video');
const heroSin = pzDiaHeroHTML(P(9, '2026-11-02T21:00:00Z', 'scheduled', { caption: 'Mi texto real' }), { en: false, aprobado: false });
ok(heroSin.includes('Mi texto real'), 'hero sin imagen: texto real, nunca inventado');
ok(pzDiaHeroHTML(P(7, '2026-11-02T21:00:00Z'), { dismissed: true }) === '', 'hero descartado → vacío');
const heroEn = pzDiaHeroHTML(P(7, '2026-11-02T21:00:00Z', 'scheduled', { image_path: 'f.jpg' }), { en: true, aprobado: false });
ok(heroEn.includes("Today's post") && heroEn.includes('Accept') && heroEn.includes('Change something'), 'hero EN espejo');

// --- Aprobado / dismiss ---
ok(pzDiaAprobado({ id: 5, approval: 'approved' }) === true, 'approval approved → aprobado');
ok(pzDiaAprobado({ id: 99 }) === true, 'marca local pzAprobadoEs → aprobado');
ok(pzDiaAprobado({ id: 5, approval: 'pending' }) === false, 'pending sin marca → no aprobado');
ok(pzDiaDismissKey('2026-11-02') === 'posta-dia-hero-2026-11-02', 'clave dismiss por día');
ok(pzDiaDismissHoy('2026-11-02') === false, 'sin dismiss → hero visible');
store['posta-dia-hero-2026-11-02'] = '1';
ok(pzDiaDismissHoy('2026-11-02') === true, 'con dismiss → hero no vuelve ese día');

// --- Corrección 2/11 en el árbol: sin semana, sin aceptar-todo en Inicio ---
ok(!src.includes('pzDiaSemana'), 'sin función ni resto de «Esta semana» en app.js');
ok(!src.includes('data-pz-dia-semana'), 'sin toggle de semana en app.js');
ok(!css.includes('pz-dia-semana'), 'sin CSS de fila semana');
ok(src.includes('pz-dia-futura') && src.includes('diaFuturaCls'), 'marca futura en homeTileHTML');
ok(src.includes('pzDiaHeroHTML2') && src.includes('pzDiaDismissHoy'), 'hero cableado en inicioView');
ok(src.includes('data-pz-dia-accept') && src.includes('data-pz-dia-x') && src.includes('data-pz-dia-cambiar'), 'bindings del hero en bindInicio');
const bs = src.indexOf('id="mzBottomStack"');
const chatbar = src.indexOf('id="mzChatBar"', bs);
ok(bs > 0 && chatbar > bs && !src.slice(bs, chatbar).includes('pzAcceptWeekHTML'), 'bottomstack de Inicio sin barra Aceptar todo (la función queda en el código)');
ok((src.match(/hf-acceptbar-on/g) || []).length === 1, 'hf-acceptbar-on solo en la limpieza preexistente, no en la plantilla');
ok(css.includes('object-fit: contain'), 'CSS: foto del hero sin cortar (contain)');
ok(css.includes('#pzDiaHero') && hero.includes('pz-dia-hero'), 'CSS: hero presente (estilo por id, clase en el HTML)');
ok(css.includes('#inicioView .hf-cell.pz-dia-futura'), 'CSS: colapso incondicional de futuras');
ok(css.includes('prefers-reduced-motion'), 'CSS: magia anulada con reduced-motion');
ok(!css.includes('pz-dia-semana-row'), 'CSS: sin fila semana');

// --- M78: cada función nueva definida 1 vez y con llamador real ---
for (const n of FN_NAMES) {
  const defs = (src.match(new RegExp('function ' + n + '\\(', 'g')) || []).length;
  const uses = (src.match(new RegExp(n, 'g')) || []).length;
  ok(defs === 1 && uses >= 2, 'M78 ' + n + ' definida 1 vez, con llamador (' + uses + ' menciones)');
}

console.log(`\nRESULTADO: ${pass} ok / ${fail} fallos`);
process.exit(fail ? 1 : 0);
