'use strict';
/* test-lote-plan-posty-corregido.js — LOTE PLAN-POSTY-CORREGIDO (v734+, tras v733)
 * Decisión de Valentino 6/11 ~19:04 («Perfecto, así va»): la tarjeta «Plan
 * Posty» (USD 199/mes) prometía cosas que Posty NO hace. Auditoría en
 * ~/workspace/.lote-plan-posty-corregir-scratch/STATUS.md.
 *
 * FALSAS (se sacan): pauta gestionada · agenda turnos y reservas ·
 * seguimiento a quien preguntó y no cerró · cierre con link de pago o seña ·
 * reseñas de Google · carrusel hasta 2/semana (de la expandida) ·
 * radiografía de competencia (de la expandida).
 * PARCIALES (se reescriben): análisis «de tu competencia» → «semana a
 * semana» · estrategia «para diferenciarte de tu competencia» → «semanal
 * para tu negocio» · atención «las 24 horas… al instante» → sin latencia.
 *
 * Lista corta: 16 → 11 ítems. Lista expandida: 14 → 9 ítems (ES) / 9 (EN).
 * También se corrigen los 3 lugares más de la landing que prometían lo
 * mismo: tarjeta «Comunidad», tarjeta «Sigo cada consulta hasta el cierre»
 * (se borra) y FAQ (atención + publicidad), ES y EN espejados (incluido
 * el JSON-LD de la FAQ en EN).
 *
 * NO cambia: precio $199 · plan único · prueba 3 posteos · 2 reels
 * mar/jue · tiers esencial/pro (catálogo interno de facturación) ·
 * reelsPerWeek/carouselsPerWeek como cupo de capacidad.
 *
 * Uso: node test-lote-plan-posty-corregido.js            (árbol actual)
 *      BASE=/ruta/al/arbol node test-lote-plan-posty-corregido.js
 * En el árbol prístino v733 debe FALLAR (caza la promesa falsa).
 * En el árbol del lote debe dar 0 fallos.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || __dirname;
let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');

const APP = read('public/app.js');
const EN = read('public/en/index.html');
const PLANS = require(path.join(BASE, 'config/plans.js'));

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- 1. Lista corta ES: 16 → 11 (AR, UY y plan único) ----------
const CORTA_ES = [
  '7 posteos por semana, automáticos',
  '2 reels por semana (martes y jueves)',
  'Ideas estratégicas para tu negocio',
  'Diseños + captions + hashtags',
  'Publicación automática programada',
  'Análisis completo de tu cuenta, semana a semana',
  'Estrategia semanal para tu negocio',
  'Reporte semanal de resultados',
  'Atención al cliente en Instagram: Posty prepara y vos aprobás con un toque',
  'Responde con tus precios y servicios reales',
  'Comentarios respondidos (cada uno lo aprobás con un toque)',
];
t(eq(PLANS.PLANS_AR.total.features, CORTA_ES), 'corta AR total = 11 ítems corregidos, en orden');
t(eq(PLANS.PLANS_UY.total.features, CORTA_ES), 'corta UY total = 11 ítems corregidos, en orden');
t(eq(PLANS.PLAN_UNICO.features, CORTA_ES), 'plan único USD 199 = 11 ítems corregidos, en orden');
t(PLANS.PLANS_AR.total.features.length === 11, 'corta AR total tiene 11 (no 16)');
t(PLANS.PLANS_AR.total.features[1] === '2 reels por semana (martes y jueves)', 'corta: 2 reels mar/jue en posición 1');
const CORTA_FALSAS = ['Pauta gestionada', 'Agenda tus turnos', 'Seguimiento a quien', 'Cierre con link', 'Reseñas de Google', 'tu competencia'];
for (const f of CORTA_FALSAS) {
  t(!PLANS.PLANS_AR.total.features.join('|').includes(f), `corta AR sin «${f}»`);
  t(!PLANS.PLANS_UY.total.features.join('|').includes(f), `corta UY sin «${f}»`);
}

// ---------- 2. Lista corta EN: 15 → 11 (US y resto por spread) ----------
const CORTA_EN = [
  '7 posts per week, automatic',
  '2 reels per week (Tuesdays and Thursdays)',
  'Strategic ideas for your business',
  'Designs + captions + hashtags',
  'Scheduled automatic posting',
  'Full analysis of your account, week by week',
  'Weekly strategy for your business',
  'Weekly results report',
  'Customer care on Instagram: Posty drafts, you approve with one tap',
  'Replies with your real prices and services',
  'Comments answered (you approve each one with one tap)',
];
t(eq(PLANS.PLANS_US.total.features, CORTA_EN), 'corta US total = 11 ítems corregidos, en orden');
t(eq(PLANS.PLANS_GB.total.features, CORTA_EN), 'corta GB total = 11 (hereda de US)');
t(eq(PLANS.PLANS_EU.total.features, CORTA_EN), 'corta EU total = 11 (hereda de US)');
t(eq(PLANS.PLANS_CA.total.features, CORTA_EN), 'corta CA total = 11 (hereda de US)');
const CORTA_EN_FALSAS = ['Managed ads', 'appointments', 'Follows up with anyone', 'Closes with a payment', 'Google reviews', 'competitor'];
for (const f of CORTA_EN_FALSAS) {
  t(!PLANS.PLANS_US.total.features.join('|').includes(f), `corta US sin «${f}»`);
}

// ---------- 3. Lista expandida ES: 14 → 9 ----------
const EXP_ES = [
  'Te armo la semana completa: 7 posteos con tus fotos, tus colores y tu producto exacto — nada de plantillas genéricas.',
  'Te produzco 2 reels por semana, martes y jueves, con el guión pensado para tu negocio.',
  'Te escribo cada pie de foto en tu tono, con su intención de venta y sus hashtags.',
  'Publico todo solo, en el mejor horario — y te aviso 30 minutos antes por si querés frenar algo.',
  'Te armo la estrategia de cada semana, con el porqué de cada posteo.',
  'Cada semana te llega tu reporte de resultados: qué funcionó y qué sigue.',
  'Te preparo las respuestas a los comentarios y mensajes de Instagram, y vos las aprobás con un toque antes de que salgan — nada sale sin tu OK.',
  'Respondo con tus precios y servicios reales, no con frases genéricas.',
  'Vos solo mirás: pausás lo que no te guste en un toque o me pedís el cambio por chat, como a tu CM de siempre.',
];
const detES = PLANS.getPlan('total', 'AR').detail;
t(eq(detES, EXP_ES), 'expandida ES total = 9 ítems corregidos, en orden');
t(eq(PLANS.PLAN_UNICO.detail, EXP_ES), 'plan único detail = 9 ítems corregidos');
const EXP_ES_FALSAS = ['carrusel', 'radiografía', 'pauta', 'turnos', 'Seguimiento', 'link de pago', 'reseñas de Google', 'las 24 horas', 'al instante'];
for (const f of EXP_ES_FALSAS) {
  t(!detES.join('|').includes(f), `expandida ES sin «${f}»`);
}

// ---------- 4. Lista expandida EN: 14 → 9 ----------
const EXP_EN = [
  'I build your whole week: 7 posts with your photos, your colors and your exact product — no cookie-cutter templates.',
  'I produce 2 reels per week, on Tuesdays and Thursdays, scripted for your business.',
  'I write every caption in your voice, with its selling angle and its hashtags.',
  'I post everything on its own, at the best time — and I give you a heads-up 30 minutes before, in case you want to pause anything.',
  'I build your strategy for each week, with the why behind every post.',
  'Every week you get your results report: what worked and what\'s next.',
  'I draft the replies to your Instagram comments and messages, and you approve each one with one tap before it goes out — nothing goes out without your OK.',
  'I reply with your real prices and services, never generic lines.',
  'You just keep an eye on things: pause anything in one tap, or ask me for the change in the chat.',
];
const detEN = PLANS.getPlan('total', 'US').detail;
t(eq(detEN, EXP_EN), 'expandida EN total = 9 ítems corregidos, en orden');
const EXP_EN_FALSAS = ['carousel', 'competition', 'manage ads', 'appointments', 'follow up', 'payment or deposit link', 'Google reviews', 'around the clock', 'instantly'];
for (const f of EXP_EN_FALSAS) {
  t(!detEN.join('|').includes(f), `expandida EN sin «${f}»`);
}

// ---------- 5. Lo que NO cambia (guards) ----------
t(PLANS.PLAN_UNICO.price === 199 && PLANS.PLAN_UNICO.currency === 'USD', 'plan único sigue USD 199');
t(PLANS.PLANS_AR.total.reelsPerWeek === 2, 'Total reelsPerWeek sigue 2 (capacidad = promesa)');
t(PLANS.PLANS_AR.total.carouselsPerWeek === 2, 'Total carouselsPerWeek sigue 2 (cupo, no promesa)');
t(PLANS.PLANS_AR.pro.features.length === 8, 'Pro intacto (8 ítems, catálogo interno)');
t(PLANS.PLANS_AR.pro.features.includes('Pauta gestionada (fee 10%)'), 'Pro conserva «Pauta gestionada» (tier legacy, no se toca)');
t(PLANS.PLANS_AR.esencial.features.length === 5, 'Esencial intacto (5 ítems)');
t(PLANS.getPlan('total', 'AR').detail.length === 9, 'detail ES total = 9');
t(detES[1].includes('2 reels por semana, martes y jueves'), 'expandida ES conserva los 2 reels mar/jue');
t(detEN[1].includes('2 reels per week, on Tuesdays and Thursdays'), 'expandida EN conserva los 2 reels mar/jue');

// ---------- 6. Landing ES (app.js): las 3 tarjetas + tablas + FAQ ----------
const APP_FALSAS = [
  'atiende y vende por vos',
  'está atento las 24 horas',
  'La respuesta lista al instante, 24/7',
  'Agendo y confirmo tus turnos',
  'Sigo cada consulta hasta el cierre',
  'contesta tus reseñas de Google',
  'los potencia con pauta (vos fijás el tope)',
  'te propone potenciarlo con pauta',
  'Cada semana Posty mira tu competencia',
  'Desde tu competencia, tus ganadores',
  'analiza tu Instagram y tu competencia',
  'ideas desde tu competencia',
  'Gestionadas, con tu OK',
  'Potencia tu mejor posteo desde la app',
  'los turnos y reservas para confirmar, el seguimiento a quien preguntó y no cerró, y el cierre con link de pago o seña',
  'Cargás crédito en la app, fijás cuánto querés gastar',
];
for (const f of APP_FALSAS) {
  t(!APP.includes(f), `landing ES sin «${f}»`);
}
t(APP.includes('Posty también <span class="hl">atiende por vos</span>'), 'landing ES: título Atención «atiende por vos»');
t(APP.includes('La respuesta lista para tu OK'), 'landing ES: tarjeta 1 «La respuesta lista para tu OK»');
t(APP.includes('Posty detecta el posteo que mejor te está andando y te dice por qué rinde'), 'landing ES: cap Growth sin pauta');
t(APP.includes('Detecta tus posteos que mejor andan y te dice cuáles rinden más'), 'landing ES: tarjeta Crecimiento sin pauta');
t(APP.includes('Responde comentarios y mensajes (con tu OK en un toque), y arma historias'), 'landing ES: tarjeta Comunidad sin reseñas');
t(APP.includes('<div class="crit">Reseñas de Google</div><div>A mano, una por una</div><div>No suele incluirlas</div><div>Se cobra aparte</div><div class="win">—</div>'), 'landing ES: cmp4 Reseñas Posty «—»');
t(APP.includes('<div class="crit">Pauta publicitaria</div><div>La armás y la seguís vos</div><div>Honorarios aparte</div><div>Honorarios aparte</div><div class="win">—</div>'), 'landing ES: cmp4 Pauta Posty «—»');
t(APP.includes('<div class="crit">Cuida tus reseñas</div><div>✓</div><div class="win">—</div>'), 'landing ES: tabla CM Reseñas Posty «—»');
t(APP.includes('<div class="crit">Potencia lo que anda con pauta</div><div>✓</div><div class="win">—</div>'), 'landing ES: tabla CM Pauta Posty «—»');
t(APP.includes('¿Posty también atiende a mis clientes?</summary><p>Sí: Posty prepara las respuestas a tus mensajes y comentarios de Instagram, con tus precios y servicios reales.'), 'landing ES: FAQ atención reescrita');
t(APP.includes('¿Posty puede hacer publicidad de mis posteos?</summary><p>Todavía no: la publicidad con Meta todavía no está conectada.'), 'landing ES: FAQ publicidad honesta («Todavía no»)');
// Verdades in-app que se QUEDAN (no son promesas de la landing):
t(APP.includes('Está disponible</div><div>En su horario</div><div class="win">Todos los días, a toda hora</div>'), 'landing ES: fila disponibilidad se deja (no es latencia)');
t(APP.includes('El botón Frenar'), 'landing ES: botón Frenar intacto');

// ---------- 7. Landing EN (en/index.html): espejo exacto ----------
const EN_FALSAS = [
  'serves and sells for you',
  'is on watch 24/7',
  'Replies ready instantly, 24/7',
  'I book and confirm your appointments',
  'I follow every inquiry to the close',
  'replies to your Google reviews',
  'boosts them with ads (you set the cap)',
  'offers to boost it with ads',
  'Every week Posty looks at your competition',
  'From your competition, your winners',
  'analyzes your Instagram and your competition',
  'ideas from your competitors',
  'Managed, with your OK',
  'Boosts your best post from the app',
  'Bookings and confirmations, follow-ups for anyone who asked but didn\'t close, and closings with a payment or deposit link',
  'You load credit in the app, set how much you want to spend',
];
for (const f of EN_FALSAS) {
  t(!EN.includes(f), `landing EN sin «${f}»`);
}
t(EN.includes('Posty also <span class="hl">serves you</span>'), 'landing EN: título Atención «serves you»');
t(EN.includes('<h3>Replies ready for your OK</h3>'), 'landing EN: tarjeta 1 «Replies ready for your OK»');
t(EN.includes('Posty spots the post that\'s performing best for you and tells you why it works'), 'landing EN: cap Growth sin ads');
t(EN.includes('It spots your best-performing posts and tells you which ones work best'), 'landing EN: tarjeta Growth sin ads');
t(EN.includes('It answers comments and messages (with your OK in one tap), and creates stories'), 'landing EN: tarjeta Community sin Google reviews');
t(EN.includes('<div class="crit">Google reviews</div><div>By hand, one by one</div><div>Usually not included</div><div>Charged separately</div><div class="win">—</div>'), 'landing EN: cmp4 Google reviews Posty «—»');
t(EN.includes('<div class="crit">Ad spend</div><div>You build and babysit it</div><div>Extra fees</div><div>Extra fees</div><div class="win">—</div>'), 'landing EN: cmp4 Ad spend Posty «—»');
t(EN.includes('<div class="crit">Looks after your reviews</div><div>✓</div><div class="win">—</div>'), 'landing EN: tabla CM reviews Posty «—»');
t(EN.includes('<div class="crit">Boosts what works with ads</div><div>✓</div><div class="win">—</div>'), 'landing EN: tabla CM ads Posty «—»');
// Tarjeta EN-only «Your competition, mapped» (v737, extra del preparador):
// se reescribe a análisis semana a semana — sin mapa de competencia.
t(!EN.includes('Your competition, mapped'), 'landing EN: sin tarjeta «Your competition, mapped»');
t(!EN.includes('The full map is part of Growth'), 'landing EN: sin «The full map is part of Growth»');
t(EN.includes('<h3>Your account, analyzed week by week</h3>'), 'landing EN: tarjeta análisis semana a semana');
t(EN.includes('The full analysis is part of Growth'), 'landing EN: tarjeta análisis «The full analysis is part of Growth»');
t(EN.includes('Does Posty also serve my customers?</summary><p>Yes: Posty prepares the replies to your Instagram messages and comments, with your real prices and services.'), 'landing EN: FAQ atención reescrita');
t(EN.includes('Can Posty advertise my posts?</summary><p>Not yet: advertising with Meta isn\'t connected yet.'), 'landing EN: FAQ publicidad honesta («Not yet»)');
// Plan corto y expandido hardcodeados en la landing EN:
const mCorto = EN.match(/<ul><li>7 posts per week, automatic<\/li>([\s\S]*?)<\/ul>/);
t(!!mCorto && mCorto[0].split('<li>').length - 1 === 11, 'landing EN: plan corto = 11 ítems');
t(!!mCorto && !mCorto[0].includes('Managed ads') && !mCorto[0].includes('Google reviews'), 'landing EN: plan corto sin pauta ni reseñas');
const mExp = EN.match(/<ul class="pd-list">([\s\S]*?)<\/ul>/);
t(!!mExp && mExp[0].split('<li>').length - 1 === 9, 'landing EN: plan expandido = 9 ítems');
t(!!mExp && !mExp[0].includes('carousel') && !mExp[0].includes('competition') && !mExp[0].includes('Google reviews'), 'landing EN: plan expandido sin carrusel/competencia/reseñas');
// JSON-LD de la FAQ (mismo texto que el <details>):
const ld = EN.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
let faqOk = false, faqAdsOk = false;
if (ld) {
  try {
    const g = JSON.parse(ld[1]);
    const faq = (g['@graph'] || []).find((n) => n['@type'] === 'FAQPage');
    const byName = {};
    for (const q of (faq && faq.mainEntity) || []) byName[q.name] = q.acceptedAnswer.text;
    faqOk = (byName['Does Posty also serve my customers?'] || '').startsWith('Yes: Posty prepares the replies');
    faqAdsOk = (byName['Can Posty advertise my posts?'] || '').startsWith('Not yet: advertising with Meta');
  } catch (e) { /* JSON roto: las dos aserciones quedan en falso */ }
}
t(faqOk, 'JSON-LD: FAQ atención reescrita');
t(faqAdsOk, 'JSON-LD: FAQ publicidad honesta');

console.log(`\ntest-lote-plan-posty-corregido: ${okN} ok, ${badN} fallos`);
process.exit(badN ? 1 : 0);
