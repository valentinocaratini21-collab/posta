'use strict';
/* test-lote-copy-2-reels.js — LOTE COPY-2-REELS (v732, rework) · 6/11
 * Decisión de Valentino 6/11 ~18:00 («hagamos 2 por semana para mi y para
 * los clientes!!» + «martes y jueves hay reels»): la promesa es 2 reels por
 * semana, martes y jueves, para Posty y para los clientes. Rework del lote
 * v732 copy-sin-reels (que había sacado la promesa falsa de «5 reels»):
 * el copy vuelve a prometer reels, pero 2/semana (martes y jueves), no 5.
 *
 * La prueba promete solo lo que entrega: la semana de prueba son 3 posteos
 * + 1 reel DE MUESTRA a pedido (/api/trial/sample-reel, 1 por IG, cacheado)
 * — no una cadencia semanal. (v736: la prueba son 3 posteos, no 5 — corrección
 * de Valentino 6/11 «la prueba son 3 posteos, porque son 3 dias!»; la sección 7
 * se actualizó de 5 a 3.) El plan (tras la prueba) es 7 posteos + 2 reels
 * por semana, martes y jueves. La corrección de las HISTORIAS del v732 se
 * mantiene: ninguna superficie promete historias con cantidad.
 *
 * Los campos reelsPerWeek/storiesPerWeek se KEEP como cupo de capacidad.
 * El Total (plan único) tiene reelsPerWeek = 2 — es la capacidad Y la
 * promesa, para que el autopilot (ME.reels_per_week) y el mix del plan
 * (pmMix) muestren 2 y no 5. Esencial (1) y Pro (3) son tiers legacy y
 * no se tocan. storiesPerWeek del Total queda en 7 (capacidad, no promesa).
 *
 * Uso: node test-lote-copy-2-reels.js            (árbol actual)
 *      BASE=/ruta/al/arbol node test-lote-copy-2-reels.js
 * En el árbol v732 (antes del rework) debe FALLAR (las aserciones de
 * «2 reels» no están). En el árbol del rework debe dar 0 fallos.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || __dirname;
let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');

const APP = read('public/app.js');
const EN = read('public/en/index.html');
const AJ = read('public/chunk-ajustes.js');
const PR = read('public/prueba.html');
const EPR = read('public/en-prueba.html');
const PLANS = read('config/plans.js');
const SRV = read('server.js');
const IDX = read('public/index.html');

// ---------- 1. Ninguna superficie promete 5, 3 ni 1 reels por semana ----------
const FALSE_REEL_PROMISES = [
  '5 reels por semana', '5 reels per week', '3 reels por semana', '3 reels per week',
  '1 reel por semana', '1 reel per week',
  '7 posteos + 5 reels', '7 posts + 5 reels',
  '7 posteos y 1 reel', '7 posts and 1 reel',
  '7 posteos + 1 reel por semana', '7 posts + 1 reel per week',
  '7 posteos por semana · 5 reels', '7 posts a week · 5 reels',
  'Te produzco 5 reels', 'Te produzco 3 reels', 'Te produzco 1 reel',
  'I produce 5 reels', 'I produce 3 reels', 'I produce 1 reel',
  'Sumo 1 reel por semana', 'I add 1 reel per week',
  'sale uno así cada semana', 'one like this comes out every week',
  '7 posteos + 5 reels + 7 historias',
];
for (const f of [APP, EN, AJ, PR, EPR, PLANS, SRV]) {
  for (const p of FALSE_REEL_PROMISES) {
    t(!f.includes(p), `sin promesa falsa «${p}»`);
  }
}

// ---------- 2. Ninguna superficie promete historias (cantidad) — igual que v732 ----------
const STORY_PROMISES = [
  'historias todos los días', 'stories every day', 'Daily stories',
  'historias por semana', 'stories per week',
  '7 historias', '7 stories',
  '3 historias por semana', '3 stories per week',
];
for (const f of [APP, EN, AJ, PR, EPR, PLANS, SRV]) {
  for (const p of STORY_PROMISES) {
    t(!f.includes(p), `sin promesa de historias «${p}»`);
  }
}

// ---------- 3. La promesa: 2 reels por semana, martes y jueves (ES = EN) ----------
t(PLANS.includes('2 reels por semana (martes y jueves)'), 'planes ES: feature 2 reels por semana (martes y jueves)');
t(PLANS.includes('2 reels per week (Tuesdays and Thursdays)'), 'planes EN: feature 2 reels per week (Tuesdays and Thursdays)');
t(PLANS.includes('Te produzco 2 reels por semana, martes y jueves'), 'planes ES: detail 2 reels martes y jueves');
t(PLANS.includes('I produce 2 reels per week, on Tuesdays and Thursdays'), 'planes EN: detail 2 reels Tuesdays and Thursdays');
t(APP.includes('7 posteos + 2 reels (martes y jueves)'), 'ES website: la semana es 7 posteos + 2 reels (martes y jueves)');
t(APP.includes('7 posteos por semana · 2 reels (martes y jueves)'), 'ES website: la comparación dice 2 reels (martes y jueves)');
t(APP.includes('7 posteos + 2 reels'), 'ES website: el stat es 7 posteos + 2 reels');
t(EN.includes('7 posts + 2 reels (Tuesdays and Thursdays)'), 'EN website: la semana es 7 posts + 2 reels (Tuesdays and Thursdays)');
t(EN.includes('7 posts a week · 2 reels (Tuesdays and Thursdays)'), 'EN website: la comparación dice 2 reels (Tuesdays and Thursdays)');
t(EN.includes('7 posts + 2 reels'), 'EN website: el stat es 7 posts + 2 reels');
t(SRV.includes('arma la semana (7 posteos + 2 reels por semana, martes y jueves)'), 'chat ES: (7 posteos + 2 reels por semana, martes y jueves)');
t(SRV.includes('builds the week (7 posts + 2 reels per week, on Tuesdays and Thursdays)'), 'chat EN: (7 posts + 2 reels per week, on Tuesdays and Thursdays)');
t(APP.includes('7 posteos por semana'), 'ES website: la promesa base sigue siendo 7 posteos por semana');
t(EN.includes('7 posts a week'), 'EN website: la promesa base sigue siendo 7 posts a week');

// ---------- 4. La sección Reels del landing vuelve, con 2 por semana (ES y EN) ----------
t(APP.includes('cap-kick">Reels'), 'ES landing: la sección Reels existe');
t(EN.includes('cap-kick">Reels'), 'EN landing: la sección Reels existe');
t(APP.includes('<li>2 por semana, martes y jueves</li>'), 'ES landing: «2 por semana, martes y jueves»');
t(EN.includes('<li>2 per week, Tuesdays and Thursdays</li>'), 'EN landing: «2 per week, Tuesdays and Thursdays»');
t(APP.includes('Salen publicados solos, martes y jueves'), 'ES landing: salen publicados solos, martes y jueves');
t(EN.includes('They post on their own, on Tuesdays and Thursdays'), 'EN landing: they post on their own, on Tuesdays and Thursdays');
t(!APP.includes('<li>5 por semana</li>'), 'ES landing: sin «5 por semana»');
t(!EN.includes('<li>5 per week</li>'), 'EN landing: sin «5 per week»');
t(APP.includes('posty-rubros-poster.jpg'), 'ES landing: la sección Reels usa la imagen real (el mp4 no existe en el árbol)');
t(EN.includes('posty-rubros-poster.jpg'), 'EN landing: la sección Reels usa la imagen real');
t(!APP.includes('posty-rubros.mp4'), 'ES landing: sin video roto (posty-rubros.mp4 no existe)');
t(!EN.includes('posty-rubros.mp4'), 'EN landing: sin video roto');
t(APP.includes('Los reels de la semana ya están listos'), 'ES website: la actividad muestra los reels de la semana');
t(EN.includes("This week\\'s reels are ready"), 'EN website: la actividad muestra los reels de la semana');

// ---------- 5. Planes: Total = 2 reels, ES = EN, campos kept ----------
const plans = require(path.join(BASE, 'config', 'plans.js'));
const totalFeatures = [
  ...plans.PLANS_AR.total.features,
  ...plans.PLANS_UY.total.features,
  ...plans.PLANS_US.total.features,
];
t(totalFeatures.filter((f) => /reel/i.test(f)).length === 3, 'Total: 1 línea de reels por moneda (AR, UY, US)');
t(totalFeatures.every((f) => !/historias|stories/i.test(f)), 'Total: features sin historias (la corrección del v732 se mantiene)');
t(totalFeatures.every((f) => !/5 reels|3 reels|1 reel/i.test(f)), 'Total: features sin 5/3/1 reels');
t(plans.PLAN_UNICO.reelsPerWeek === 2, 'PLAN_UNICO: reelsPerWeek = 2 (capacidad = promesa)');
t(plans.PLAN_UNICO.storiesPerWeek === 7, 'PLAN_UNICO: storiesPerWeek = 7 kept (capacidad, no promesa)');
t(plans.PLANS_AR.total.reelsPerWeek === 2 && plans.PLANS_UY.total.reelsPerWeek === 2 && plans.PLANS_US.total.reelsPerWeek === 2,
  'Total AR/UY/US: reelsPerWeek = 2 en los tres (antes 5/5/3, ES/EN alineados)');
t(plans.PLANS_AR.esencial.reelsPerWeek === 1 && plans.PLANS_AR.pro.reelsPerWeek === 3,
  'Esencial/Pro: reelsPerWeek intactos (1/3, tiers legacy)');
t(plans.PLAN_UNICO.features[1] === '2 reels por semana (martes y jueves)', 'PLAN_UNICO: segunda feature 2 reels (martes y jueves)');
t(plans.PLANS_US.total.features[1] === '2 reels per week (Tuesdays and Thursdays)', 'PLANS_US total: segunda feature 2 reels (Tuesdays and Thursdays)');
t(plans.PLAN_UNICO.detail[1] === 'Te produzco 2 reels por semana, martes y jueves, con el guión pensado para tu negocio.',
  'PLAN_UNICO: detail dice 2 reels martes y jueves');
t(plans.PLANS_US.total.detail[1] === 'I produce 2 reels per week, on Tuesdays and Thursdays, scripted for your business.',
  'PLANS_US total: detail dice 2 reels Tuesdays and Thursdays');
t(plans.PLANS_AR.esencial.detail.every((d) => !/reel/i.test(d)) && plans.PLANS_AR.pro.detail.every((d) => !/reel/i.test(d)),
  'Esencial/Pro: detail sin reels (solo el Total los promete)');

// ---------- 6. App: el mix del plan y la tarjeta autopilot muestran los 2 reels ----------
t(AJ.includes('reelsPerWeek') && !AJ.includes('storiesPerWeek'), 'chunk-ajustes: el mix lee reelsPerWeek (no storiesPerWeek)');
t(AJ.includes("pmMixItem(pzIc('reel'"), 'chunk-ajustes: pmMixHTML tiene el item de reels');
t(!AJ.includes("pmMixItem(pzIc('story'"), 'chunk-ajustes: pmMixHTML sin item de historias');
t(AJ.includes('Gratis para siempre · 7 posteos + 2 reels/semana'), 'chunk-ajustes: Founder dice 7 posteos + 2 reels/semana');
t(!AJ.includes('7 posteos + 5 reels'), 'chunk-ajustes: sin «7 posteos + 5 reels»');
t(APP.includes('ME.reels_per_week'), 'app.js: la tarjeta autopilot lee ME.reels_per_week (el campo del plan)');
t(APP.includes('Textos, diseños y reels con tus fotos'), 'app.js: autopilot dice «Textos, diseños y reels»');

// ---------- 7. La prueba: 3 posteos + 1 reel DE MUESTRA; el plan, 7 + 2 (martes y jueves) ----------
// La prueba genera 1 reel (el de muestra, a pedido, /api/trial/sample-reel, 1 por IG):
t(PR.includes('3 posteos + 1 reel de muestra'), 'prueba ES: el paso dice 3 posteos + 1 reel de muestra');
t(EPR.includes('3 posts + 1 sample reel'), 'prueba EN: el paso dice 3 posts + 1 sample reel');
t(PR.includes('Tus 3 posteos + 1 reel, ya creados'), 'prueba ES: la semana de prueba es 3 posteos + 1 reel');
t(EPR.includes('Your 3 posts + 1 reel, already created'), 'prueba EN: la semana de prueba es 3 posts + 1 reel');
t(PR.includes('Tu semana · 3 posteos + 1 reel'), 'prueba ES: la semana dice 3 posteos + 1 reel');
t(EPR.includes('Your week · 3 posts + 1 reel'), 'prueba EN: la semana dice 3 posts + 1 reel');
t(PR.includes('tus 3 posteos + 1 reel ya están creados'), 'prueba ES: el chat dice 3 posteos + 1 reel');
t(EPR.includes('your 3 posts + 1 reel are already created'), 'prueba EN: el chat dice 3 posts + 1 reel');
// El beneficio es la promesa del PLAN (tras la prueba): 7 + 2, martes y jueves:
t(PR.includes('7 posteos y 2 reels por semana, martes y jueves'), 'prueba ES: el beneficio promete 7 posteos y 2 reels por semana, martes y jueves');
t(EPR.includes('7 posts and 2 reels every week, on Tuesdays and Thursdays'), 'prueba EN: el beneficio promete 7 posts and 2 reels every week, on Tuesdays and Thursdays');
t(PR.includes('7 posteos + 2 reels (martes y jueves), armada y programada por mí'), 'prueba ES: la auditoría dice 7 posteos + 2 reels (martes y jueves)');
t(EPR.includes('7 posts + 2 reels (Tuesdays and Thursdays), built and scheduled by me'), 'prueba EN: la auditoría dice 7 posts + 2 reels (Tuesdays and Thursdays)');
t(PR.includes("re: /reels/i") && PR.includes('Sumo 2 reels por semana'), 'prueba ES: el paso de auditoría de reels dice 2 por semana');
t(EPR.includes("re: /reels/i") && EPR.includes('I add 2 reels per week'), 'prueba EN: el paso de auditoría de reels dice 2 per week');
// El reel de muestra a pedido sigue (capacidad) y su caption dice la verdad del plan:
t(PR.includes('id="reelRow"') && PR.includes('/api/trial/sample-reel'), 'prueba ES: el reel de muestra a pedido sigue (capacidad, no promesa semanal)');
t(EPR.includes('id="reelRow"') && EPR.includes('/api/trial/sample-reel'), 'prueba EN: el reel de muestra a pedido sigue');
t(PR.includes('En tu plan, salen 2 así por semana — martes y jueves —, solos'), 'prueba ES: el caption del reel de muestra dice 2 por semana, martes y jueves');
t(EPR.includes('On your plan, 2 like this come out every week — Tuesdays and Thursdays —, on their own'), 'prueba EN: el caption del reel de muestra dice 2 per week, Tuesdays and Thursdays');
t(APP.includes("/api/reels/armar"), 'app.js: el builder de reels a pedido sigue');

// ---------- 8. La sección Historias sigue (capacidad, abierta como seguimiento) ----------
t(APP.includes('cap-kick">Historias'), 'ES landing: la sección Historias sigue (capacidad; su «todos los días» es seguimiento aparte)');
t(EN.includes('cap-kick">Stories'), 'EN landing: la sección Stories sigue');

// ---------- 9. Bumps M78 / BUILD (re-pin v736: el BUILD y el ?v= avanzaron) ----------
t(SRV.includes("const BUILD_ID = '20261105-v736'"), 'BUILD v736');
t(IDX.includes('/app.js?v=493'), 'index ES: app.js?v=493');
t(!EN.includes('/app.js?v='), 'index EN: sin app.js?v= (la EN no carga app.js)');
t(APP.includes("const CHUNK_V = '20261105-v732'"), 'CHUNK_V 20261105-v732 (se mantiene)');

console.log(`\ntest-lote-copy-2-reels: ${okN} ok, ${badN} fallos`);
process.exit(badN ? 1 : 0);
