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
 * se actualizó de 5 a 3.) El plan (tras la prueba) es 7 posteos por semana
 * (v761-detail-2: la semana = 7 posteos; el reel es muestra, no cadencia
 * semanal). La corrección de las HISTORIAS del v732 se
 * mantiene: ninguna superficie promete historias con cantidad.
 *
 * Los campos reelsPerWeek/storiesPerWeek se KEEP como cupo de capacidad.
 * El Total (plan único) tiene reelsPerWeek = 2 — cupo de capacidad de
 * generación, para que el autopilot (ME.reels_per_week) y el mix del plan
 * (pmMix) muestren 2 y no 5 (la promesa de 2/semana salió en v761).
 * Esencial (1) y Pro (3) son tiers legacy y no se tocan. storiesPerWeek
 * del Total queda en 7 (capacidad, no promesa).
 *
 * Uso: node test-lote-copy-2-reels.js            (árbol actual)
 *      BASE=/ruta/al/arbol node test-lote-copy-2-reels.js
 * En el árbol v732 (antes del rework) debe FALLAR (las aserciones de
 * «2 reels» no están). En el árbol del rework debe dar 0 fallos.
 *
 * v761 (website-copy, 7/11): el WEBSITE deja de prometer reels (0 publicados;
 * vuelve con reel-al-dia) y la sección Historias sale entera. Las secciones
 * 3/4/5/8 afirman ahora la AUSENCIA en el website. La capacidad sigue:
 * reelsPerWeek = 2 (generación), el builder de reels a pedido y la prueba
 * (3 posteos + 1 reel de muestra) no se tocan — secciones 6/7 intactas.
 * v761-detail (7/11 · Valentino «Alinealo en el v761»): el detail[] de
 * plans.js pasó de 9 a 6 ítems (fuera reels/comentarios/precios) y el
 * beneficio de /prueba ya no promete 2 reels. El expansor de Ajustes
 * (chunk-ajustes.js) lee p.detail dinámico: muestra los 6 sin tocar el chunk.
 * v761-detail-2 (7/11 · Valentino «Alinealo en el v761»): los 3 rincones
 * que quedaban en /prueba — AUD_STEP_MAP, caption del reel de muestra y
 * beneficio ✉️ — ya no prometen 2 reels/semana ni comentarios; la semana
 * es 7 posteos y el reel es muestra (3+1).
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

// ---------- 3. v761: el WEBSITE ya no promete reels (0 publicados; vuelve con reel-al-dia) ----------
t(!PLANS.includes('2 reels por semana (martes y jueves)'), 'planes ES: feature 2 reels por semana FUERA (v761: 0 publicados, vuelve con reel-al-dia)');
t(!PLANS.includes('2 reels per week (Tuesdays and Thursdays)'), 'planes EN: feature 2 reels per week FUERA (v761)');
t(!PLANS.includes('Te produzco 2 reels por semana, martes y jueves'), 'planes ES: detail sin «Te produzco 2 reels» (v761-detail)');
t(!PLANS.includes('I produce 2 reels per week, on Tuesdays and Thursdays'), 'planes EN: detail sin «I produce 2 reels» (v761-detail)');
t(!APP.includes('7 posteos + 2 reels (martes y jueves)'), 'ES website: la semana ya no dice 7 posteos + 2 reels (v761)');
t(!APP.includes('7 posteos por semana · 2 reels (martes y jueves)'), 'ES website: la comparación ya no dice 2 reels (v761)');
t(!APP.includes('7 posteos + 2 reels'), 'ES website: el stat ya no es 7 posteos + 2 reels (v761)');
t(!EN.includes('7 posts + 2 reels (Tuesdays and Thursdays)'), 'EN website: la semana ya no dice 7 posts + 2 reels (v761)');
t(!EN.includes('7 posts a week · 2 reels (Tuesdays and Thursdays)'), 'EN website: la comparación ya no dice 2 reels (v761)');
t(!EN.includes('7 posts + 2 reels'), 'EN website: el stat ya no es 7 posts + 2 reels (v761)');
t(!SRV.includes('arma la semana (7 posteos + 2 reels por semana, martes y jueves)'), 'chat ES: sin «7 posteos + 2 reels por semana» (v761-detail-3)');
t(SRV.includes('arma la semana (7 posteos por semana)'), 'chat ES: la semana es 7 posteos por semana (v761-detail-3)');
t(!SRV.includes('builds the week (7 posts + 2 reels per week, on Tuesdays and Thursdays)'), 'chat EN: sin «7 posts + 2 reels per week» (v761-detail-3)');
t(SRV.includes('builds the week (7 posts per week)'), 'chat EN: la semana es 7 posts per week (v761-detail-3)');
t(PLANS.includes('7 posteos por semana, automáticos'), 'ES website: la promesa base sigue siendo 7 posteos por semana (plan, v761)');
t(EN.includes('7 posts a week'), 'EN website: la promesa base sigue siendo 7 posts a week');

// ---------- 4. v761: la sección Reels del landing SALE (ES y EN) ----------
t(!APP.includes('cap-kick">Reels'), 'ES landing: la sección Reels SALE (v761)');
t(!EN.includes('cap-kick">Reels'), 'EN landing: la sección Reels SALE (v761)');
t(!APP.includes('<li>2 por semana, martes y jueves</li>'), 'ES landing: sin «2 por semana, martes y jueves» (v761)');
t(!EN.includes('<li>2 per week, Tuesdays and Thursdays</li>'), 'EN landing: sin «2 per week, Tuesdays and Thursdays» (v761)');
t(!APP.includes('Salen publicados solos, martes y jueves'), 'ES landing: sin «salen publicados solos» (v761)');
t(!EN.includes('They post on their own, on Tuesdays and Thursdays'), 'EN landing: sin «they post on their own» (v761)');
t(!APP.includes('<li>5 por semana</li>'), 'ES landing: sin «5 por semana»');
t(!EN.includes('<li>5 per week</li>'), 'EN landing: sin «5 per week»');
t(!APP.includes('posty-rubros-poster.jpg'), 'ES landing: sin sección Reels, sin poster (v761)');
t(!EN.includes('posty-rubros-poster.jpg'), 'EN landing: sin sección Reels, sin poster (v761)');
t(!APP.includes('posty-rubros.mp4'), 'ES landing: sin video roto (posty-rubros.mp4 no existe)');
t(!EN.includes('posty-rubros.mp4'), 'EN landing: sin video roto');
t(!APP.includes('Los reels de la semana ya están listos'), 'ES website: la actividad ya no muestra los reels (v761)');
t(!EN.includes("This week\\'s reels are ready"), 'EN website: la actividad ya no muestra los reels (v761)');

// ---------- 5. v761: Planes: Total sin reels, ES = EN, campos kept ----------
const plans = require(path.join(BASE, 'config', 'plans.js'));
const totalFeatures = [
  ...plans.PLANS_AR.total.features,
  ...plans.PLANS_UY.total.features,
  ...plans.PLANS_US.total.features,
];
t(totalFeatures.filter((f) => /reel/i.test(f)).length === 0, 'Total: 0 líneas de reels (v761: fuera del plan)');
t(totalFeatures.every((f) => !/historias|stories/i.test(f)), 'Total: features sin historias (la corrección del v732 se mantiene)');
t(totalFeatures.every((f) => !/5 reels|3 reels|1 reel/i.test(f)), 'Total: features sin 5/3/1 reels');
t(plans.PLAN_UNICO.reelsPerWeek === 2, 'PLAN_UNICO: reelsPerWeek = 2 (capacidad de generación, no promesa)');
t(plans.PLAN_UNICO.storiesPerWeek === 7, 'PLAN_UNICO: storiesPerWeek = 7 kept (capacidad, no promesa)');
t(plans.PLANS_AR.total.reelsPerWeek === 2 && plans.PLANS_UY.total.reelsPerWeek === 2 && plans.PLANS_US.total.reelsPerWeek === 2,
  'Total AR/UY/US: reelsPerWeek = 2 en los tres (antes 5/5/3, ES/EN alineados)');
t(plans.PLANS_AR.esencial.reelsPerWeek === 1 && plans.PLANS_AR.pro.reelsPerWeek === 3,
  'Esencial/Pro: reelsPerWeek intactos (1/3, tiers legacy)');
t(plans.PLAN_UNICO.features[1] === 'Ideas estratégicas para tu negocio', 'PLAN_UNICO: segunda feature Ideas (v761; 2 reels fuera)');
t(plans.PLANS_US.total.features[1] === 'Strategic ideas for your business', 'PLANS_US total: segunda feature Strategic ideas (v761)');
t(plans.PLAN_UNICO.detail.length === 6, 'PLAN_UNICO: detail = 6 ítems (v761-detail: fuera reels/comentarios/precios)');
t(plans.PLAN_UNICO.detail.every((d) => !/reel/i.test(d)), 'PLAN_UNICO: detail sin reels');
t(plans.PLAN_UNICO.detail[1] === 'Te escribo cada pie de foto en tu tono, con su intención de venta y sus hashtags.',
  'PLAN_UNICO: detail[1] es captions (reels fuera)');
t(plans.PLANS_US.total.detail.length === 6, 'PLANS_US total: detail = 6 ítems (v761-detail)');
t(plans.PLANS_US.total.detail.every((d) => !/reel/i.test(d)), 'PLANS_US total: detail sin reels');
t(plans.PLANS_US.total.detail[1] === 'I write every caption in your voice, with its selling angle and its hashtags.',
  'PLANS_US total: detail[1] is captions (reels out)');
t(plans.PLANS_AR.esencial.detail.every((d) => !/reel/i.test(d)) && plans.PLANS_AR.pro.detail.every((d) => !/reel/i.test(d)),
  'Esencial/Pro: detail sin reels (ahora ningún detail los promete)');

// ---------- 6. App: el mix del plan y la tarjeta autopilot muestran los 2 reels ----------
t(AJ.includes('reelsPerWeek') && !AJ.includes('storiesPerWeek'), 'chunk-ajustes: el mix lee reelsPerWeek (no storiesPerWeek)');
t(AJ.includes("pmMixItem(pzIc('reel'"), 'chunk-ajustes: pmMixHTML tiene el item de reels');
t(!AJ.includes("pmMixItem(pzIc('story'"), 'chunk-ajustes: pmMixHTML sin item de historias');
t(AJ.includes('Gratis para siempre · 7 posteos + 2 reels/semana'), 'chunk-ajustes: Founder dice 7 posteos + 2 reels/semana');
t(!AJ.includes('7 posteos + 5 reels'), 'chunk-ajustes: sin «7 posteos + 5 reels»');
t(APP.includes('ME.reels_per_week'), 'app.js: la tarjeta autopilot lee ME.reels_per_week (el campo del plan)');
t(APP.includes('Textos, diseños y reels con tus fotos'), 'app.js: autopilot dice «Textos, diseños y reels»');

// ---------- 7. La prueba: 3 posteos + 1 reel DE MUESTRA; el plan, 7 posteos por semana ----------
// La prueba genera 1 reel (el de muestra, a pedido, /api/trial/sample-reel, 1 por IG):
t(PR.includes('3 posteos + 1 reel de muestra'), 'prueba ES: el paso dice 3 posteos + 1 reel de muestra');
t(EPR.includes('3 posts + 1 sample reel'), 'prueba EN: el paso dice 3 posts + 1 sample reel');
t(PR.includes('Tus 3 posteos + 1 reel, ya creados'), 'prueba ES: la semana de prueba es 3 posteos + 1 reel');
t(EPR.includes('Your 3 posts + 1 reel, already created'), 'prueba EN: la semana de prueba es 3 posts + 1 reel');
t(PR.includes('Tu semana · 3 posteos + 1 reel'), 'prueba ES: la semana dice 3 posteos + 1 reel');
t(EPR.includes('Your week · 3 posts + 1 reel'), 'prueba EN: la semana dice 3 posts + 1 reel');
t(PR.includes('tus 3 posteos + 1 reel ya están creados'), 'prueba ES: el chat dice 3 posteos + 1 reel');
t(EPR.includes('your 3 posts + 1 reel are already created'), 'prueba EN: el chat dice 3 posts + 1 reel');
// El beneficio es la promesa del PLAN (tras la prueba): 7 posteos por semana
// (v761-detail: sin reels; v761-detail-2: la auditoría, el caption del reel
// de muestra y el beneficio ✉️ ya no prometen 2 reels ni comentarios):
t(PR.includes('7 posteos por semana, pensados para vender'), 'prueba ES: el beneficio promete 7 posteos por semana (v761-detail)');
t(!PR.includes('7 posteos y 2 reels por semana, martes y jueves'), 'prueba ES: el beneficio sin «7 posteos y 2 reels» (v761-detail)');
t(EPR.includes('7 posts every week, built to sell'), 'prueba EN: el beneficio promete 7 posts every week (v761-detail)');
t(!EPR.includes('7 posts and 2 reels every week, on Tuesdays and Thursdays'), 'prueba EN: el beneficio sin «7 posts and 2 reels» (v761-detail)');
t(PR.includes('Tu semana sale completa y pareja: 7 posteos, armada y programada por mí'), 'prueba ES: la auditoría dice 7 posteos, sin reels (v761-detail-2)');
t(!PR.includes('7 posteos + 2 reels (martes y jueves)'), 'prueba ES: la auditoría ya no dice 7 posteos + 2 reels (v761-detail-2)');
t(EPR.includes('Your week goes out complete and even: 7 posts, built and scheduled by me'), 'prueba EN: la auditoría dice 7 posts, sin reels (v761-detail-2)');
t(!EPR.includes('7 posts + 2 reels (Tuesdays and Thursdays)'), 'prueba EN: la auditoría ya no dice 7 posts + 2 reels (v761-detail-2)');
t(PR.includes("re: /reels/i") && PR.includes('Hago un reel de muestra con tu producto real'), 'prueba ES: el paso de auditoría de reels es un reel de muestra (v761-detail-2)');
t(!PR.includes('Sumo 2 reels por semana'), 'prueba ES: la auditoría ya no suma 2 reels por semana (v761-detail-2)');
t(EPR.includes("re: /reels/i") && EPR.includes('I make a sample reel with your real product'), 'prueba EN: el paso de auditoría de reels es un reel de muestra (v761-detail-2)');
t(!EPR.includes('I add 2 reels per week'), 'prueba EN: la auditoría ya no suma 2 reels por semana (v761-detail-2)');
// El reel de muestra a pedido sigue (capacidad) y su caption dice la verdad del plan:
t(PR.includes('id="reelRow"') && PR.includes('/api/trial/sample-reel'), 'prueba ES: el reel de muestra a pedido sigue (capacidad, no promesa semanal)');
t(EPR.includes('id="reelRow"') && EPR.includes('/api/trial/sample-reel'), 'prueba EN: el reel de muestra a pedido sigue');
t(PR.includes('Así se vería un reel tuyo, hecho por mí'), 'prueba ES: el caption del reel de muestra es muestra, no cadencia (v761-detail-2)');
t(!PR.includes('En tu plan, salen 2 así por semana'), 'prueba ES: el caption ya no dice 2 por semana (v761-detail-2)');
t(EPR.includes('This is what a reel of yours would look like, made by me'), 'prueba EN: el caption del reel de muestra es muestra, no cadencia (v761-detail-2)');
t(!EPR.includes('On your plan, 2 like this come out every week'), 'prueba EN: el caption ya no dice 2 por semana (v761-detail-2)');
// El beneficio ✉️ de comentarios salió de la tarjeta (v761-detail-2):
// la atención está gateada a total/free (plan-gate.js:32) y el plan vendido
// es el único — la tarjeta se muestra sin filtro al visitante de la prueba
// (renderBenefits, sin condición por tier):
t(!PR.includes('Respuestas a comentarios y mensajes con tu aprobación'), 'prueba ES: el beneficio ✉️ de comentarios fuera (v761-detail-2)');
t(!EPR.includes('Replies to comments and messages, with your approval'), 'prueba EN: el beneficio ✉️ de comentarios fuera (v761-detail-2)');
t((PR.match(/class="benefit"/g) || []).length === 10, 'prueba ES: la tarjeta tiene 10 beneficios (11 − ✉️) (v761-detail-2)');
t((EPR.match(/class="benefit"/g) || []).length === 10, 'prueba EN: la tarjeta tiene 10 beneficios (11 − ✉️) (v761-detail-2)');
t(PR.includes('Todo esto viene con tu cuenta') && PR.includes('Pauta sin tocar Ads Manager') && PR.includes('Sin permanencia: cancelás cuando quieras'), 'prueba ES: la tarjeta sigue intacta sin el ✉️ (v761-detail-2)');
t(EPR.includes('All of this comes with your account') && EPR.includes('Boosting without touching Ads Manager') && EPR.includes('No lock-in: cancel anytime'), 'prueba EN: la tarjeta sigue intacta sin el ✉️ (v761-detail-2)');
t(APP.includes("/api/reels/armar"), 'app.js: el builder de reels a pedido sigue');

// ---------- 8. v761: la sección Historias SALE entera (ES y EN) ----------
t(!APP.includes('cap-kick">Historias'), 'ES landing: la sección Historias SALE entera (v761)');
t(!EN.includes('cap-kick">Stories'), 'EN landing: la sección Stories SALE entera (v761)');

// ---------- 9. Bumps M78 / BUILD (re-pin v741: el BUILD y el ?v= avanzaron) ----------
t(SRV.includes("const BUILD_ID = '20261105-v764'"), 'BUILD v764 (base v763, este lote no re-estampa)');
t(IDX.includes('/app.js?v=504'), 'index ES: app.js?v=504');
t(!EN.includes('/app.js?v='), 'index EN: sin app.js?v= (la EN no carga app.js)');
t(APP.includes("const CHUNK_V = '20261105-v764'"), 'CHUNK_V 20261105-v764 (estudio-profundo M6: chunk-analisis.js cambió)');

console.log(`\ntest-lote-copy-2-reels: ${okN} ok, ${badN} fallos`);
process.exit(badN ? 1 : 0);
