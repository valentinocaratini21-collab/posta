'use strict';
// =====================================================================
// SUITE · MICRO-LOTE TARJETA-FANTASMA
//
// El defecto (Valentino, 16/11, con capturas de su cuenta 12): en
// Inicio, sobre «EL POSTEO DE HOY», aparecía una tarjeta sana con la
// foto de la torta de frutas, el caption «Ese momento en que mirás tu
// Instagram y solo ves un vacío… 😅» y la hora «Hoy 00:53». Era el
// posteo 682: status 'cancelled' (terminal), scheduled_at de hoy
// 05:53 UTC, nunca publicado — en la grilla/semana no aparece, como
// corresponde. La app contradiciendo la realidad en la pantalla del
// dueño (clase de su orden permanente del 15/11).
//
// El mecanismo: GET /api/posts devuelve TODOS los estados (cada
// consumidor filtra los suyos) y UNA sola selección no filtraba:
// pzHoyTiraDias (el posteo de cada día de la tira de Hoy) elegía por
// día al publicado o, en su defecto, al de scheduled_at más temprano
// SIN mirar el estado — el cancelado de las 00:53 le ganaba el día al
// programado de las 19:00, y pzHoyTiraDetalleHTML lo rendía como
// tarjeta normal (la supresión por duplicado solo cubre el posteo que
// ES el héroe). El arreglo: el posteo del día se elige solo entre
// borrador / programado / publicado — un terminal jamás es el posteo
// de su día, sea cual sea su scheduled_at.
//
// Lo que esta suite pincha (en VM, con las funciones reales del
// bundle):
//   · la forma exacta del caso: cancelado 00:53 + programado 19:00 →
//     el día es del programado y el detalle NO rinde tarjeta fantasma;
//   · día con SOLO un cancelado → sin posteo (invitación honesta);
//   · la grafía 'dismissed' (descartado) queda afuera igual;
//   · un 'failed' tampoco es el posteo de su día;
//   · lo sano no cambia: el publicado manda, el borrador de hoy sigue
//     siendo elegible, un día pasado con solo un cancelado no se
//     revela;
//   · censo de diff: app.js difiere del prístino SOLO en la guarda.
//
// Uso: node test-lote-tarjeta-fantasma.js
// Control: PZ_ROOT=<árbol prístino v1129> node test-lote-tarjeta-fantasma.js
//   (en el control, los pines del arreglo caen y el fantasma se
//   reproduce: el detalle rinde la tarjeta del cancelado).
// Censo: PZ_PRISTINE=<árbol prístino> en la corrida sobre el release.
// =====================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const PRISTINE = process.env.PZ_PRISTINE || '';
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const APPJS = read('public/app.js');

let nOk = 0, nMal = 0;
function ok(cond, nombre) {
  if (cond) { nOk++; console.log('  ok  ' + nombre); }
  else { nMal++; console.log('  MAL ' + nombre); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + ' = ' + JSON.stringify(b) + ']'); }
function seccion(t) { console.log('\n== ' + t); }

// Extracción de una función del bundle por nombre (mismo patrón que
// las suites hermanas: indexOf + balanceo de llaves).
function extraer(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return '';
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return '';
}

// ---------------------------------------------------------------------
seccion('A · pines estáticos');
ok(APPJS.length > 100000, 'el bundle se leyó');
const chk = spawnSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')], { encoding: 'utf8' });
eq(chk.status, 0, 'node --check del bundle');
const tiraSrc = extraer(APPJS, 'pzHoyTiraDias');
ok(tiraSrc.length > 500, 'pzHoyTiraDias extraíble del bundle');
ok(tiraSrc.includes('LOTE TARJETA-FANTASMA'), 'la guarda TARJETA-FANTASMA está en pzHoyTiraDias');
const idxGuarda = tiraSrc.indexOf("stDia !== 'published'");
const idxDiaKey = tiraSrc.indexOf('pzHoyPostDiaKey(p, tz)');
ok(idxGuarda >= 0 && idxDiaKey > idxGuarda, 'la guarda corre ANTES de ubicar el posteo en su día');

// ---------------------------------------------------------------------
seccion('B · VM con las funciones reales del bundle');
const sandbox = {
  console,
  PROFILE: { ig_connected: true },
  PZ_HOY_POST_ID: '',
  PZ_HOY_MEJOR: null,
  pzIc: () => '',
  pzIsGuest: () => false,
  __imgFb: () => {},
};
vm.createContext(sandbox);
// esc: la const flecha de la línea 4 del bundle, textual.
const escLinea = APPJS.split('\n').find((l) => l.startsWith('const esc = ')) || '';
ok(escLinea.length > 20, 'esc localizado en el bundle');
const piezas = ['mv', 'pcParseDate', 'schedDayKeyOf', 'pzIsPubReal', 'pzWhenRelDay',
  'pzHoyDiaKey', 'pzHoyMoverKey', 'pzHoyDowKey', 'pzHoyPostDiaKey', 'pzHoySemana',
  'pzHoyTiraDias', 'pzHoyTiraDetalleHTML', 'pzHoyHoraCorta', 'pzHoyCuandoPub',
  'pzHoyCuandoCorto', 'pzHoyPillSalida', 'pzHoyCuentaSaleTxt'];
let carga = escLinea + '\n';
for (const n of piezas) {
  const f = extraer(APPJS, n);
  if (!f) console.log('  (sin extraer: ' + n + ')');
  carga += f + '\n';
}
vm.runInContext(carga, sandbox, { filename: 'bundle-hoy.js' });
for (const n of ['pzHoyTiraDias', 'pzHoyTiraDetalleHTML', 'pzHoySemana', 'pzHoyDiaKey']) {
  eq(typeof sandbox[n], 'function', n + ' cargó en la VM');
}

const TZ = 'America/New_York';
const AHORA = new Date('2026-11-16T13:40:00.000Z'); // lunes 08:40 EST
const hoyKey = sandbox.pzHoyDiaKey(AHORA, TZ);
eq(hoyKey, '2026-11-16', 'hoyKey del fixture es el lunes 16/11');
const sem = sandbox.pzHoySemana([], TZ, AHORA);
eq(sem.dias.length, 7, 'la semana del fixture tiene 7 días');
eq(sem.dias[0].key, '2026-11-16', 'la semana arranca el lunes 16/11');

// La forma exacta del caso 682/688 (cuenta 12, 16/11).
const ghost682 = {
  id: 682, status: 'cancelled', media_type: 'image', image_path: '/media/torta-frutas.jpg',
  caption: '"Ese momento en que mirás tu Instagram y solo ves un vacío…" 😅\n\nNo te preocupes más, yo me encargo.',
  scheduled_at: '2026-11-16T05:53:00.000Z', created_at: '2026-11-15 04:23:37',
};
const volt688 = {
  id: 688, status: 'scheduled', approval: 'auto', media_type: 'image', image_path: '/media/volt.jpg',
  caption: 'Así queda un posteo de zapatillas cuando lo hace posty: la Volt, con su foto y su detalle.',
  scheduled_at: '2026-11-17T00:00:00.000Z', created_at: '2026-11-16 04:40:43',
};
const diaDe = (dias, k) => dias.find((d) => d.key === k) || null;

// ---------------------------------------------------------------------
seccion('C · la forma exacta del caso: el cancelado no es el posteo de hoy');
for (const orden of [[ghost682, volt688], [volt688, ghost682]]) {
  const dias = sandbox.pzHoyTiraDias(sem, orden, hoyKey, TZ);
  const hoy = diaDe(dias, hoyKey);
  ok(!!hoy, 'el día de hoy existe en la tira');
  eq(hoy.post && hoy.post.id, 688, 'el posteo de hoy es el programado de las 19:00, no el cancelado de las 00:53');
  sandbox.PZ_HOY_POST_ID = '688';
  const detalle = sandbox.pzHoyTiraDetalleHTML(hoy, { en: false, tz: TZ });
  eq(detalle, '', 'el detalle de hoy se suprime contra el héroe: ninguna tarjeta sobre «EL POSTEO DE HOY»');
  ok(!String(detalle).includes('Ese momento'), 'el caption del cancelado no aparece en el detalle');
}

// ---------------------------------------------------------------------
seccion('D · día con SOLO un cancelado: sin posteo, sin fantasma');
{
  const dias = sandbox.pzHoyTiraDias(sem, [ghost682], hoyKey, TZ);
  const hoy = diaDe(dias, hoyKey);
  eq(hoy.post, null, 'un día con solo un cancelado queda sin posteo');
  sandbox.PZ_HOY_POST_ID = '';
  const detalle = sandbox.pzHoyTiraDetalleHTML(hoy, { en: false, tz: TZ });
  ok(detalle.includes('Hoy todavía no hay posteo'), 'el detalle es la invitación honesta de día vacío');
  ok(!detalle.includes('Ese momento'), 'el caption del cancelado no se rinde');
  ok(!detalle.includes('00:53'), 'la hora del cancelado no se rinde');
}

// ---------------------------------------------------------------------
seccion('E · descartado (dismissed) y fallido: tampoco son el posteo del día');
{
  const dismissed = { ...ghost682, id: 700, status: 'dismissed', caption: 'DESCARTADO-MARKER', scheduled_at: '2026-11-16T06:30:00.000Z' };
  const dias = sandbox.pzHoyTiraDias(sem, [dismissed, volt688], hoyKey, TZ);
  eq(diaDe(dias, hoyKey).post.id, 688, 'un dismissed temprano no le gana el día al programado');
  const failed = { ...ghost682, id: 697, status: 'failed', caption: 'FALLIDO-MARKER', scheduled_at: '2026-11-16T06:00:00.000Z' };
  const dias2 = sandbox.pzHoyTiraDias(sem, [failed, volt688], hoyKey, TZ);
  eq(diaDe(dias2, hoyKey).post.id, 688, 'un failed temprano no le gana el día al programado');
}

// ---------------------------------------------------------------------
seccion('F · lo sano no cambia: publicado manda, borrador elegible, pasado sin revelar');
{
  const pub = {
    id: 690, status: 'published', media_type: 'image', image_path: '/media/pub.jpg',
    ig_media_id: '17900000000000000', caption: 'Ya salió, el de la mañana.',
    published_at: '2026-11-16T13:00:00.000Z', scheduled_at: '2026-11-16T13:00:00.000Z', created_at: '2026-11-15 10:00:00',
  };
  const dias = sandbox.pzHoyTiraDias(sem, [ghost682, volt688, pub], hoyKey, TZ);
  eq(diaDe(dias, hoyKey).post.id, 690, 'con un publicado en el día, el publicado sigue mandando');
  sandbox.PZ_HOY_POST_ID = '';
  const det = sandbox.pzHoyTiraDetalleHTML(diaDe(dias, hoyKey), { en: false, tz: TZ });
  ok(det.includes('Publicado'), 'el detalle del publicado dice Publicado');
  ok(!det.includes('Ese momento'), 'el cancelado no contamina el detalle del publicado');

  const draft = { id: 695, status: 'draft', media_type: 'image', image_path: '/media/d.jpg', caption: 'Borrador de hoy', scheduled_at: '2026-11-16T22:00:00.000Z', created_at: '2026-11-16 09:00:00' };
  const diasD = sandbox.pzHoyTiraDias(sem, [draft], hoyKey, TZ);
  eq(diaDe(diasD, hoyKey).post.id, 695, 'el borrador de hoy sigue siendo elegible como posteo del día');

  // Semana vista el miércoles: el lunes con SOLO un cancelado no se revela.
  const ahoraMi = new Date('2026-11-18T15:00:00.000Z');
  const hoyMi = sandbox.pzHoyDiaKey(ahoraMi, TZ);
  eq(hoyMi, '2026-11-18', 'hoyKey del miércoles es 18/11');
  const semMi = sandbox.pzHoySemana([], TZ, ahoraMi);
  const ghostLun = { ...ghost682, id: 681, scheduled_at: '2026-11-16T05:53:00.000Z' };
  const pubMar = { ...pub, id: 691, published_at: '2026-11-17T15:00:00.000Z', scheduled_at: '2026-11-17T15:00:00.000Z' };
  const diasMi = sandbox.pzHoyTiraDias(semMi, [ghostLun, pubMar], hoyMi, TZ);
  const lun = diaDe(diasMi, '2026-11-16');
  eq(lun.post, null, 'el lunes con solo un cancelado queda sin posteo');
  eq(lun.revelado, false, 'el lunes con solo un cancelado NO se revela');
  const mar = diaDe(diasMi, '2026-11-17');
  eq(mar.post && mar.post.id, 691, 'el martes publicado sigue con su posteo');
  eq(mar.revelado, true, 'el martes publicado se revela');
}

// ---------------------------------------------------------------------
if (PRISTINE && path.resolve(PRISTINE) !== path.resolve(ROOT)) {
  seccion('G · censo de diff contra el prístino');
  const appP = read.call(null, 'public/app.js'); // (ROOT) — placeholder, se lee abajo del prístino
  const srcP = fs.readFileSync(path.join(PRISTINE, 'public/app.js'), 'utf8');
  const lineas = APPJS.split('\n');
  const i0 = lineas.findIndex((l) => l.includes('// (LOTE TARJETA-FANTASMA)'));
  ok(i0 > 0, 'bloque del lote localizado en el release');
  let i1 = i0;
  while (i1 < lineas.length && !lineas[i1].includes("if (stDia !== 'published'")) i1++;
  ok(i1 > i0, 'línea de la guarda localizada en el release');
  const sinLote = lineas.slice(0, i0).concat(lineas.slice(i1 + 1)).join('\n');
  eq(sinLote, srcP, 'app.js sin el bloque del lote == prístino (diff = solo la guarda)');
  const serverIgual = fs.readFileSync(path.join(PRISTINE, 'server.js'), 'utf8') === read('server.js');
  ok(serverIgual, 'server.js no se toca');
  const cssIgual = fs.readFileSync(path.join(PRISTINE, 'public/styles.css'), 'utf8') === read('public/styles.css');
  ok(cssIgual, 'styles.css no se toca');
}

console.log('\n===============================================');
console.log('TOTAL: ' + nOk + ' ok · ' + nMal + ' mal');
process.exit(nMal ? 1 : 0);
