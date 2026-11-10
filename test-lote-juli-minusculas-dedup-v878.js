#!/usr/bin/env node
// LOTE JULI-MINÚSCULAS-DEDUP v878 (10/11) — dos defectos reales de
// producción, auditoría 10/11 vía API admin:
// (1) FALSO EMPALME EN VOZ EN MINÚSCULA (hooks.js, LINT v10): los ids
//     592/593/594 (siembra nails, cuenta 12, textos EXACTOS aprobados por
//     Valentino) se marcaban captionOpenIsGarbled: true por la regla
//     «punto + minúscula» — son voz deliberada toda en minúscula, no
//     costuras. captionPasses los frenaba con «apertura empalmada».
//     Fix: la regla solo dispara cuando la línea MEZCLA mayúsculas
//     (evaluada sobre `masked`, para que un nombre propio no tape la
//     voz); el bloque bizRaw/masked subió arriba de las firmas.
// (2) DEDUP-7D SIN RE-CHEQUEO EN LA RUTA DE IDEAS (server.js): el id 589
//     (cuenta 87, Portrait Coffee, 10/11) es duplicado EXACTO del 571
//     (12/11, week_key VACÍO) — makeIdeaDraft no re-chequeaba antes de
//     insertar, porque weekPrevCaptions solo ve el MISMO week_key. Fix:
//     mismo re-chequeo que el worker de generateWeekDrafts (v845) justo
//     antes de los INSERTs (frescos de 7 días, sin mirar week_key) +
//     rama honesta 'dup' (409) en POST /api/ideas/:id/make.
// Uso: node test-lote-juli-minusculas-dedup-v878.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const gen = require('./generator');
const { captionOpenIsGarbled } = require('./hooks');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 400) : '')); }
}

// --- Captions reales de producción (10/11, vía API admin) ---
const CAP592 = 'este color no se elige en la vidriera. se elige en la mano. vení y probalo.';
const CAP593 = 'así cae el color antes de llegar a tus manos. mirá cómo se mueve.';
const CAP594 = 'las que vuelven no vuelven por el esmalte. vuelven por el color que les queda. pedilo por nombre.';
const CAP582 = 'sacale el jugo a tu contenido y dejame armar tu semana.';
const CAP565 = 'Probamos 12 versiones de Presentamos nuestro café especial del mes ☕ hasta dar con esta: Café de Prueba Bamboo';
const CAP589 = '3 claves para elegir bien en single origin coffees 👇\nCalidad, detalle y que sea de Portrait Coffee: así trabajamos single origin coffees.\nGuardá este posteo para cuando lo necesites 🔖';
const CAP571 = CAP589;
const CAP587 = '¿Cuántas veces te pasó de levantarte y no saber qué postear? 😅\nYo me encargo de eso: armando tu semana de contenido con diseños y textos que hablen de tu negocio. Y lo mejor, vos solo aprobás.\n¿Te animás a liberarte de ese stress? Comentame cómo manejás tus redes y te cuento más.';
const CAP580 = '¿Cuántas veces te pasó de mirar tu Instagram y no saber qué postear...? 😅\nCon Posty, no tenés que pensar más. Yo me encargo de crear tu semana de contenido atractivo y alineado a tu marca. \nProbalos gratis por 3 días y olvidate de la indecisión. ¡Escribime por DM!';
const CAP584 = '¿Cuántas veces te pasó de mirar tu Instagram y no saber qué postear...? 😅\nCon Posty, tu semana de contenido está armada y lista para que vos solo apruebes. Diseños, textos y hashtags pensados para tu negocio. Dejá que me encargue de todo y disfrutá del resultado.';
const CAP585 = '¿Cuántas veces te pasó de mirar tu Instagram y no saber qué postear...? 😅\nCon Posty, tu semana de contenido está armada y lista para que vos solo apruebes. Diseños, textos y hashtags pensados para tu negocio. Dejá que me encargue de todo y disfrutá del resultado.';
const CAP586 = '¿Cuántas veces te pasó que mirás tu Instagram y no sabés qué postear? 😅 \nEn Posty, me encargo de tu cuenta a diario: armando tu semana de posteos, diseños y textos con la onda de tu negocio. \nProbalo gratis por 3 días y olvidate de pensar en qué subir. ¡Escribime por DM!';
const CAP_OK = 'El flat white sale con el grano que tostamos hoy a la mañana. ☕\nVení a probarlo al local, estamos hasta las 20 h. Escribinos por DM y te lo dejamos listo.';
const CAP564 = '¿Cuál es tu café favorito de Bamboo? ☕\nAcá nos tomamos muy en serio el oficio del café de especialidad. Cada taza está hecha con la mejor selección de granos, porque un buen café es la base de un gran día.\nContanos en los comentarios cuál es tu favorito y vení a disfrutarlo con nosotros. ¡Te esperamos!';

console.log('== §A LINT v10 — la voz en minúscula ya no es empalme ==');
ok('592 no es empalme (voz minúscula, biz "Posty. ")', captionOpenIsGarbled(CAP592, 'Posty. ') === false);
ok('593 no es empalme (voz minúscula)', captionOpenIsGarbled(CAP593, 'Posty. ') === false);
ok('594 no es empalme (voz minúscula)', captionOpenIsGarbled(CAP594, 'Posty. ') === false);
ok('582 no es empalme (voz minúscula)', captionOpenIsGarbled(CAP582, 'Posty. ') === false);
ok('565 SÍ es empalme (costura con mayúsculas, no voz minúscula)', captionOpenIsGarbled(CAP565, 'Café de Prueba Bamboo') === true);
ok('costura con mayúsculas sigue cayendo ("El café está listo. vení a probarlo.")', captionOpenIsGarbled('El café está listo. vení a probarlo.', 'Café') === true);
ok('frase normal con mayúsculas no cae ("El café está listo. Vení a probarlo.")', captionOpenIsGarbled('El café está listo. Vení a probarlo.', 'Café') === false);
// TRADE-OFF DOCUMENTADO (LINT v10): una costura toda en minúscula ya no
// la caza la señal (b'). Sin mayúsculas no hay firma de capital que
// disparar: el empalme 565 en minúscula pasaría el lint. Quedan las otras
// redes (DEDUP, dispositivo, largo, CTA, frases quemadas).
ok('TRADE-OFF: costura en minúscula pasa el lint (documentado, no un bug)', captionOpenIsGarbled('probamos 12 versiones de presentamos nuestro café especial del mes hasta dar con esta', 'Café') === false);

console.log('== §B captionPasses — los nails ya no frenan por empalme ==');
const r592 = gen.captionPasses(CAP592, 'Posty. ');
ok('592 no frena por "apertura empalmada"', !String(r592.reason || '').includes('apertura empalmada'), r592.reason);
ok('592 frena solo por CTA (texto de siembra sin CTA, por diseño)', r592.ok === false && String(r592.reason || '').includes('llamado a la acción'), r592.reason);
const r594 = gen.captionPasses(CAP594, 'Posty. ');
ok('594 pasa entero (tiene CTA: "pedilo por nombre")', r594.ok === true, r594.reason);
const r565 = gen.captionPasses(CAP565, 'Café de Prueba Bamboo');
ok('565 sigue frenando por empalme', r565.ok === false && String(r565.reason || '').includes('apertura empalmada'), r565.reason);

console.log('== §C captionWeekClash — los duplicados reales siguen frenando ==');
ok('589 vs [571] frena DEDUP (duplicado exacto)', (() => { const r = gen.captionWeekClash(CAP589, [CAP571], 'Portrait Coffee'); return r.ok === false && String(r.reason).includes('DEDUP'); })());
ok('587 vs semana 12 frena M79 (dispositivo "cuantas-veces-te")', (() => { const r = gen.captionWeekClash(CAP587, [CAP580, CAP584, CAP585, CAP586], 'Posty. '); return r.ok === false && String(r.reason).includes('M79'); })());
ok('569 vs [564] frena DEDUP (duplicado exacto guest 85)', (() => { const r = gen.captionWeekClash(CAP564, [CAP564], 'Café de Prueba Bamboo'); return r.ok === false && String(r.reason).includes('DEDUP'); })());
ok('caption fresco pasa (control)', gen.captionWeekClash(CAP_OK, [CAP580, CAP584, CAP585, CAP586, CAP589], 'Portrait Coffee').ok === true);

console.log('== §D cableado — makeIdeaDraft re-chequea antes de insertar ==');
const serverSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const fnStart = serverSrc.indexOf('async function makeIdeaDraft');
ok('makeIdeaDraft existe en server.js', fnStart >= 0);
let fnBody = '';
if (fnStart >= 0) {
  const nextFn = serverSrc.indexOf('\nfunction ', fnStart + 1);
  const nextAsync = serverSrc.indexOf('\nasync function ', fnStart + 1);
  const end = Math.min(nextFn >= 0 ? nextFn : Infinity, nextAsync >= 0 ? nextAsync : Infinity);
  fnBody = serverSrc.slice(fnStart, isFinite(end) ? end : fnStart + 20000);
}
ok('makeIdeaDraft contiene captionWeekClash', fnBody.includes('captionWeekClash'));
ok('makeIdeaDraft loguea el freno "[ideas-loop] duplicado 7d"', fnBody.includes('[ideas-loop] duplicado 7d'));
ok('makeIdeaDraft devuelve reason "dup" al frenar', fnBody.includes("reason: 'dup'"));
ok('makeIdeaDraft consulta la semana viva (7 días, sin week_key)', fnBody.includes("datetime('now', '-7 days')") && !/week_key/.test(fnBody.split("datetime('now', '-7 days')")[0].slice(-400)));
ok('POST /api/ideas/:id/make responde 409 con reason "dup"', serverSrc.includes("r.reason === 'dup'") && serverSrc.includes('status(409)'));

console.log(`\nTOTAL: ${pass} ok, ${fail} fallas`);
if (fail) { console.log('FALLAS: ' + fails.join(' | ')); process.exit(1); }
