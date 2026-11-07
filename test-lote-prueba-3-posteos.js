'use strict';
/* test-lote-prueba-3-posteos.js — LOTE PRUEBA-3-POSTEOS · 6/11
 * Corrección de Valentino 6/11 ~18:30 («la prueba son 3 posteos, porque
 * son 3 dias!»). Tiene razón — la prueba dura 3 días, 1 posteo/día:
 * - TRIAL_DAYS = 3 (server.js:298).
 * - La entrada de invitado importa EXACTAMENTE 3 posteos:
 *   importTrialWeek(g.userId, igK, null, { limit: 3, cacheKey })
 *   (server.js:27242, «Importar exactamente 3 posteos»).
 * - El demo genera una semana de 5 (count: 5, server.js:27899), pero solo
 *   3 entran en la prueba.
 * - La misma prueba.html YA decía «tus 3 posteos ya mismo» (:1429, la
 *   vista del feed) — el copy era inconsistente consigo mismo.
 *
 * El v732 (en vivo desde ~18:28) decía «5 posteos + 1 reel de muestra»
 * en la prueba — promesa falsa. Este lote cambia el copy de la PRUEBA
 * de «5 posteos» a «3 posteos», manteniendo «+ 1 reel de muestra»
 * (el reel de muestra es real: 1 a pedido vía POST /api/trial/sample-reel).
 *
 * NO se toca el copy del PLAN («7 posteos + 2 reels por semana, martes y
 * jueves» es el plan DESPUÉS de la prueba). NO se toca app.js,
 * chunk-ajustes.js, plans.js, en/index.html ni index.html. BUILD sin
 * cambio (el preparador asigna el número).
 *
 * EXCEPCIÓN DELIBERADA (no es un olvido): el ejemplo @patitas.petshop
 * sigue diciendo «Su semana · 5 posteos + 1 reel» (prueba.html:1273,
 * en-prueba.html:1266) porque el feed de ejemplo renderiza EXAMPLE_WEEK,
 * que tiene EXACTAMENTE 5 ítems (Lun–Vie, gt-patitas-1..5). Es una
 * MUESTRA de la semana demo, no la entrega de la prueba; cambiar el
 * rótulo a 3 haría que mintiera sobre los 5 posteos visibles. Si el
 * ejemplo debe mostrar la semana de prueba (3), hay que recortar
 * EXAMPLE_WEEK a 3 ítems — cambio de producto aparte, no de copy.
 *
 * NOTA: esta suite SUPERSEDE la sección 7 de test-lote-copy-2-reels.js,
 * que afirmaba «5 posteos» en la prueba (era verdad en v732, ya no).
 * Esa suite vieja va a fallar en este árbol por sus aserciones de la
 * sección 7 — es el delta esperado, no una regresión.
 *
 * Uso: node test-lote-prueba-3-posteos.js            (árbol actual)
 *      BASE=/ruta/al/arbol node test-lote-prueba-3-posteos.js
 * En prístino v732 debe FALLAR (las aserciones de «3 posteos» no están).
 * En este árbol debe dar 0 fallos.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || __dirname;
let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');

const PR = read('public/prueba.html');
const EPR = read('public/en-prueba.html');
const SRV = read('server.js');
const APP = read('public/app.js');

// ---------- 1. La prueba dice «3 posteos» (ES) — las 7 superficies ----------
t(PR.includes('3 posteos + 1 reel de muestra'), 'prueba ES: el paso dice 3 posteos + 1 reel de muestra');
t(PR.includes('Tus 3 posteos + 1 reel, ya creados'), 'prueba ES: el lede dice Tus 3 posteos + 1 reel, ya creados');
t(PR.includes('Tu semana · 3 posteos + 1 reel'), 'prueba ES: la semana dice Tu semana · 3 posteos + 1 reel');
t(PR.includes('· 3 posteos + 1 reel: diseño, textos y hashtags, listos para publicar'), 'prueba ES: el rSub dice 3 posteos + 1 reel');
t(PR.includes('tus 3 posteos + 1 reel ya están creados'), 'prueba ES: el chat dice tus 3 posteos + 1 reel ya están creados');
t(PR.includes('Colores actualizados en tus 3 posteos'), 'prueba ES: el toast dice Colores actualizados en tus 3 posteos');
t(PR.includes('Tus 3 posteos quedan guardados en tu cuenta, listos para revisar'), 'prueba ES: el rgSub dice Tus 3 posteos quedan guardados');

// ---------- 2. La prueba dice «3 posts» (EN) — espejo exacto ----------
t(EPR.includes('3 posts + 1 sample reel'), 'prueba EN: el paso dice 3 posts + 1 sample reel');
t(EPR.includes('Your 3 posts + 1 reel, already created'), 'prueba EN: el lede dice Your 3 posts + 1 reel, already created');
t(EPR.includes('Your week · 3 posts + 1 reel'), 'prueba EN: la semana dice Your week · 3 posts + 1 reel');
t(EPR.includes('· 3 posts + 1 reel: design, copy and hashtags, ready to post'), 'prueba EN: el rSub dice 3 posts + 1 reel');
t(EPR.includes('your 3 posts + 1 reel are already created'), 'prueba EN: el chat dice your 3 posts + 1 reel are already created');
t(EPR.includes('Colors updated on your 3 posts'), 'prueba EN: el toast dice Colors updated on your 3 posts');
t(EPR.includes('Your 3 posts stay saved in your account, ready to review'), 'prueba EN: el rgSub dice Your 3 posts stay saved');

// ---------- 3. Cero «5 posteos» / «5 posts» como promesa de la prueba ----------
const TRIAL_FIVE_ES = [
  '5 posteos + 1 reel de muestra', 'Tus 5 posteos + 1 reel, ya creados',
  'Tu semana · 5 posteos + 1 reel', '· 5 posteos + 1 reel: diseño, textos y hashtags',
  'tus 5 posteos + 1 reel ya están creados', 'Colores actualizados en tus 5 posteos',
  'Tus 5 posteos quedan guardados',
];
for (const p of TRIAL_FIVE_ES) t(!PR.includes(p), `prueba ES: sin «${p}»`);
const TRIAL_FIVE_EN = [
  '5 posts + 1 sample reel', 'Your 5 posts + 1 reel, already created',
  'Your week · 5 posts + 1 reel', '· 5 posts + 1 reel: design, copy and hashtags',
  'your 5 posts + 1 reel are already created', 'Colors updated on your 5 posts',
  'Your 5 posts stay saved',
];
for (const p of TRIAL_FIVE_EN) t(!EPR.includes(p), `prueba EN: sin «${p}»`);

// ---------- 4. Excepción deliberada: el ejemplo sigue en 5 (EXAMPLE_WEEK tiene 5 ítems) ----------
t(PR.includes('Su semana · 5 posteos + 1 reel'), 'prueba ES: el ejemplo Patitas sigue diciendo 5 posteos (EXAMPLE_WEEK tiene 5 ítems, es muestra)');
t(EPR.includes('Its week · 5 posts + 1 reel'), 'prueba EN: el ejemplo Patitas sigue diciendo 5 posts (EXAMPLE_WEEK tiene 5 ítems, es muestra)');
t(PR.includes("const EXAMPLE_WEEK = [") && (PR.match(/gt-patitas-\d\.jpg/g) || []).length >= 5,
  'prueba ES: EXAMPLE_WEEK sigue con 5 posteos (Lun–Vie) — por eso el rótulo del ejemplo queda en 5');

// ---------- 5. Los prompts del chat de la prueba dicen 3 (ES + EN) ----------
t(SRV.includes('ALREADY has their 3 posts created'), 'server.js EN: el prompt dice ALREADY has their 3 posts created');
t(SRV.includes('YA tiene sus 3 posteos creados'), 'server.js ES: el prompt dice YA tiene sus 3 posteos creados');
t(!SRV.includes('ALREADY has their 5 posts created'), 'server.js EN: sin «ALREADY has their 5 posts created»');
t(!SRV.includes('YA tiene sus 5 posteos creados'), 'server.js ES: sin «YA tiene sus 5 posteos creados»');

// ---------- 6. Consistencia: la prueba ya decía 3 en la entrada de invitado ----------
t(PR.includes('tu feed con tus 3 posteos ya mismo'), 'prueba ES: la entrada directa ya decía tus 3 posteos ya mismo');
t(EPR.includes('your feed with your 3 posts, right now'), 'prueba EN: la entrada directa ya decía your 3 posts, right now');

// ---------- 7. El copy del PLAN queda intacto (NO se toca) ----------
t(PR.includes('7 posteos y 2 reels por semana, martes y jueves'), 'prueba ES: el beneficio del plan sigue diciendo 7 posteos y 2 reels por semana, martes y jueves');
t(EPR.includes('7 posts and 2 reels every week, on Tuesdays and Thursdays'), 'prueba EN: el beneficio del plan sigue diciendo 7 posts and 2 reels every week, on Tuesdays and Thursdays');
t(PR.includes('7 posteos + 2 reels (martes y jueves), armada y programada por mí'), 'prueba ES: la auditoría sigue diciendo 7 posteos + 2 reels (martes y jueves)');
t(EPR.includes('7 posts + 2 reels (Tuesdays and Thursdays), built and scheduled by me'), 'prueba EN: la auditoría sigue diciendo 7 posts + 2 reels (Tuesdays and Thursdays)');
t(APP.includes('7 posteos + 2 reels'), 'app.js: el plan sigue siendo 7 posteos + 2 reels (sin tocar)');
t(!APP.includes('7 posteos + 5 reels'), 'app.js: sin «7 posteos + 5 reels»');

// ---------- 8. El reel de muestra sigue mencionado (1 a pedido, no se toca) ----------
t(PR.includes('1 reel de muestra'), 'prueba ES: el reel de muestra sigue mencionado');
t(EPR.includes('1 sample reel'), 'prueba EN: el sample reel sigue mencionado');
t(PR.includes('/api/trial/sample-reel'), 'prueba ES: el endpoint del reel de muestra sigue');
t(EPR.includes('/api/trial/sample-reel'), 'prueba EN: el endpoint del reel de muestra sigue');
t(SRV.includes("app.post('/api/trial/sample-reel'"), 'server.js: el endpoint POST /api/trial/sample-reel sigue');

console.log(`\ntest-lote-prueba-3-posteos: ${okN} ok, ${badN} fallos`);
process.exit(badN ? 1 : 0);
