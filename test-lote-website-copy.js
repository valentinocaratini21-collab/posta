// test-lote-website-copy.js — LOTE WEBSITE COPY (directivas Valentino 7/11
// 14:33–14:41: equipo Posty+Valentino, fuera atención al cliente, Ads arriba
// del plan, «Nunca vemos tu contraseña» muy a la vista, reorden del website,
// tarjeta del plan auditada sin expansor).
// node, asserts estáticos + VM (sintaxis app.js) + boot real por HTTP con
// DATA_DIR aislada. Base release-v759, re-base del preparador (BUILD 20261105-v761).
// Uso: node test-lote-website-copy.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

let PASS = 0, FAIL = 0;
const fails = [];
function t(cond, name) {
  if (cond) { PASS++; }
  else { FAIL++; fails.push(name); console.log('FAIL: ' + name); }
}
function has(s, sub) { return s.indexOf(sub) !== -1; }
function count(s, sub) { return s.split(sub).length - 1; }
// Orden: cada marcador debe aparecer después del anterior.
function ordered(s, markers, label) {
  let pos = -1;
  for (const m of markers) {
    const i = s.indexOf(m, pos + 1);
    t(i > pos, label + ': orden, «' + m + '» después del anterior');
    if (i <= pos) return;
    pos = i;
  }
}

const appSrc = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const enSrc = fs.readFileSync(path.join(__dirname, 'public', 'en', 'index.html'), 'utf8');
const indexSrc = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const plans = require('./config/plans');

// Ámbito website ES: el cuerpo de landingView (4791–5339 en v756) + las
// funciones nuevas del website (lpAdsHTML, lpIdeasGrowthHTML).
function fnBody(src, name) {
  const i = src.indexOf('function ' + name);
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 1);
  return j < 0 ? src.slice(i) : src.slice(i, j);
}
const landing = fnBody(appSrc, 'landingView');
const adsES = fnBody(appSrc, 'lpAdsHTML');
const ideasES = fnBody(appSrc, 'lpIdeasGrowthHTML');
const websiteES = landing + '\n' + adsES + '\n' + ideasES;
// Orden real: la plantilla con las llamadas expandidas (la sección Ads vive
// en lpAdsHTML y la de Ideas+Crecimiento en lpIdeasGrowthHTML).
const renderedES = landing.replace('${lpAdsHTML()}', adsES).replace('${lpIdeasGrowthHTML()}', ideasES);
const planCards = fnBody(appSrc, 'planCardsHTML');

// ---------- 1. Plan auditado (config/plans.js, fuente de GET /api/billing/plans) ----------
const AUDIT_ES = [
  '7 posteos por semana, automáticos',
  'Ideas estratégicas para tu negocio',
  'Diseños + captions + hashtags',
  'Publicación automática programada',
  'Análisis completo de tu cuenta, semana a semana',
  'Estrategia semanal para tu negocio',
  'Reporte semanal de resultados',
];
const feats = (plans.PLANS_AR && plans.PLANS_AR.total && plans.PLANS_AR.total.features) || [];
t(Array.isArray(feats) && feats.length === 7, 'plan: 7 líneas auditadas (vinieron ' + feats.length + ')');
AUDIT_ES.forEach((f) => t(feats.indexOf(f) !== -1, 'plan: línea presente «' + f + '»'));
// (sin-repetidos · Valentino 7/11 «nada se repita dos veces»): Ads es billetera
// aparte, NO parte del plan — no va en features en ningún lado.
t(!feats.some((f) => /ads|billetera/i.test(f)), 'plan: Ads fuera de features (billetera aparte, no incluido)');
['reels', 'Reels', 'Atención al cliente', 'Responde con tus precios', 'Comentarios respondidos'].forEach((bad) => {
  t(!feats.some((f) => f.indexOf(bad) !== -1), 'plan: fuera «' + bad + '»');
});
t(plans.PLAN_UNICO && plans.PLAN_UNICO.features === plans.PLANS_AR.total.features,
  'plan: PLAN_UNICO usa las mismas features auditadas');

// ---------- 1b. Detail auditado (v761-detail · Valentino 7/11 «Alinealo en el v761») ----------
// El expansor de Ajustes (chunk-ajustes.js:1892-1895) y /prueba leen p.detail de la API:
// el detalle tiene que prometer solo lo entregado (7 posteos/semana).
const detES = plans.PLAN_UNICO.detail;
t(Array.isArray(detES) && detES.length === 6, 'detail: PLAN_UNICO = 6 ítems (vinieron ' + (detES && detES.length) + ')');
t(plans.PLAN_UNICO.detail === plans.PLANS_AR.total.detail, 'detail: PLAN_UNICO.detail es el del tier Total');
for (const c of ['AR', 'UY', 'US', 'GB', 'EU', 'CA']) {
  const d = plans.getPlans(c).total.detail;
  t(Array.isArray(d) && d.length === 6, 'detail: ' + c + ' total = 6 ítems (vinieron ' + (d && d.length) + ')');
}
['reels', 'Reels', '2 reels', 'comentarios', 'precios'].forEach((bad) => {
  t(!detES.some((d) => d.indexOf(bad) !== -1), 'detail ES: fuera «' + bad + '»');
});
const detEN = plans.PLANS_US.total.detail;
['reels', 'Reels', '2 reels', 'comments', 'prices'].forEach((bad) => {
  t(!detEN.some((d) => d.indexOf(bad) !== -1), 'detail EN: fuera «' + bad + '»');
});
t(detES[1] === 'Te escribo cada pie de foto en tu tono, con su intención de venta y sus hashtags.', 'detail ES: [1] es captions (reels fuera)');
t(detEN[1] === 'I write every caption in your voice, with its selling angle and its hashtags.', 'detail EN: [1] is captions (reels out)');
t(plans.PLAN_UNICO.reelsPerWeek === 2, 'detail: reelsPerWeek sigue 2 (capacidad, no promesa)');
t(plans.PLANS_AR.total.reelsPerWeek === 2 && plans.PLANS_UY.total.reelsPerWeek === 2 && plans.PLANS_US.total.reelsPerWeek === 2, 'detail: reelsPerWeek = 2 en AR/UY/US');

// ---------- 2. ES: orden nuevo (Ads ARRIBA del plan, 14:41) ----------
ordered(renderedES, [
  'Mi feed queda a medias',
  'lp-week-sec',
  'id="como-funciona"',
  'id="equipo"',
  'id="ads"',
  'id="planes"',
  'id="ideas"',
  'id="faq"',
  'lp-final',
], 'ES orden');

// ---------- 2b. ES: secciones eliminadas sin restos (ámbito website) ----------
['lpAnalisisHTML', 'lpAtencionHTML', 'lpCapSectionsHTML', 'gjSistemaHTML', 'lpGoAudit',
  'Comentarios y respuestas', 'atención al cliente', 'Atención al cliente',
  'atiende a mis clientes', 'responde a tus clientes', 'responde los comentarios',
  'Respuestas listas', '2 reels', 'reels por semana', 'Historias', 'Reels',
  'Tu tienda', 'lp-feed-sec', 'video premium', 'auditoria', 'gj-levels', 'gj-office',
  'id="cm"', 'id="fotos"', 'id="control"', 'id="diferencia"', 'id="herramienta"',
  'id="calculadora"', 'lp-stats', 'lpAtencion', 'reel',
].forEach((bad) => t(!has(websiteES, bad), 'ES website: fuera «' + bad + '»'));
// Las funciones borradas no quedan ni definidas en todo app.js.
['function lpAnalisisHTML', 'function lpAtencionHTML', 'function lpCapSectionsHTML',
  'function gjSistemaHTML', 'function lpGoAudit',
].forEach((bad) => t(!has(appSrc, bad), 'ES app: fuera «' + bad + '»'));
t(!has(ideasES, 'Tienda'), 'ES ideas+crecimiento: sin Tienda');
t(!has(ideasES, 'Comentarios'), 'ES ideas+crecimiento: sin Comentarios');
// El expansor del plan sale en TODA la app (website + modal de prueba vencida).
['Ver todo lo que hace por vos', 'togglePlanDetail', 'planDetailHTML', 'plan-more',
  'pz-exp-more', 'pz-exp-detail', 'data-exp-more',
].forEach((bad) => t(!has(appSrc, bad), 'ES app: fuera expansor «' + bad + '»'));
// La función del plan ya no existe como tal; el detalle no se renderiza.
t(!has(appSrc, 'function planDetailHTML'), 'ES app: sin planDetailHTML');

// ---------- 2c. ES: Ads (copy honesto del mock, arriba del plan) ----------
['Posty impulsa tus mejores posteos',
  'Cuando un posteo anda muy bien, Posty te lo marca y te propone potenciarlo.',
  'Tu mejor posteo, detectado solo.',
  'Vos ponés el monto, nada más.',
  'Posty hace el resto.',
  'Tu posteo con más llegada',
  '2× tu promedio',
  'Billetera $20',
  'Automática ON',
  'Impulsar con $20 · 7 días',
  'Posty elige el público y lo gestiona.',
  'Probalo 3 días gratis →',
].forEach((s) => t(has(adsES, s), 'ES Ads: «' + s + '»'));
t(has(adsES, 'ig-cafe.jpg'), 'ES Ads: foto real del café (ig-cafe.jpg)');
t(!has(adsES, 'alcance') && !has(adsES, 'garantiz'), 'ES Ads: sin promesas de alcance');
t(renderedES.indexOf('id="equipo"') < renderedES.indexOf('id="ads"') &&
  renderedES.indexOf('id="ads"') < renderedES.indexOf('id="planes"'),
  'ES Ads: entre Equipo y Plan (arriba del precio)');

// ---------- 2d. ES: Equipo Posty + Valentino ----------
['id="equipo"', 'Somos un equipo, Posty y yo', 'Valentino Caratini', 'Founder de Posty',
  'valentino-posty-fundador.jpg', 'Creé Posty porque identifiqué un problema',
  'él arma tu semana y yo reviso que cada posteo salga perfecto',
].forEach((s) => t(has(websiteES, s), 'ES Equipo: «' + s + '»'));
t(!has(websiteES, 'responde por'), 'ES Equipo: sin «responde por» (encuadre: monitorea/revisa)');

// ---------- 2e. ES: contraseña MUY A LA VISTA (entrada + plan + FAQ) ----------
t(count(websiteES, 'Nunca vemos tu contraseña') >= 3,
  'ES contraseña: «Nunca vemos tu contraseña» ≥3 veces (entrada + plan + FAQ), vinieron ' +
  count(websiteES, 'Nunca vemos tu contraseña'));
t(has(landing, 'Nunca vemos tu contraseña'), 'ES contraseña: en la entrada (hero)');
t(has(planCards, 'Nunca vemos tu contraseña'), 'ES contraseña: junto al plan (planCardsHTML)');
t(has(landing, 'No. Conectás tu cuenta con el login oficial de Meta, igual que cuando entrás con Google en otras apps. Nunca vemos tu contraseña: ni la pedimos ni la guardamos.'),
  'ES FAQ contraseña: respuesta exacta');
// FAQ Ads: la respuesta nueva, no la vieja.
t(has(landing, 'Sí. Cuando un posteo anda muy bien, Posty te lo marca y te propone potenciarlo: cargás crédito en tu billetera —aparte de la suscripción— y Posty elige el posteo, el público y lo gestiona, siempre con tu OK en un toque.'),
  'ES FAQ Ads: respuesta nueva honesta');
t(!has(landing, 'Todavía no: la publicidad'), 'ES FAQ Ads: fuera la respuesta vieja «Todavía no»');
// Cómo trabaja: ritmo de la mañana plegado acá.
t(has(landing, 'a la mañana ves el posteo, lo aprobás con un toque y a las 19:00 sale solo'),
  'ES cómo trabaja: ritmo de la mañana plegado');
// La prueba: entrada en la sección de la semana (no solo en el hero).
const weekES = landing.slice(landing.indexOf('lp-week-sec'), landing.indexOf('lp-view'));
t(has(weekES, 'Ver mi semana') && has(weekES, 'Nunca vemos tu contraseña'),
  'ES prueba: entrada «Ver mi semana» + contraseña en la sección');
// Ideas + Crecimiento quedan (los dos cap sections).
t(has(ideasES, 'Ideas semanales') && has(ideasES, 'Growth'), 'ES ideas+crecimiento: las dos secciones quedan');
// (sin-repetidos · Valentino 7/11 «nada se repita dos veces»): Crecimiento ya no
// re-vende Ads ni Ideas — ni el bullet detectado (verbo de Ads), ni la pauta con
// tope, ni el mock de propuesta de impulso; su visual es el foco mensual.
t(!has(ideasES, 'detectado solo') && !has(ideasES, 'Pauta con tu tope') && !has(ideasES, 'Propuesta de Posty'),
  'ES crecimiento: sin re-pitch de Ads (ni bullet, ni pauta, ni mock de propuesta)');
t(has(ideasES, 'Cada mes, ') && has(ideasES, 'Foco de este mes') && has(ideasES, 'Tu página pública lista, con WhatsApp directo'),
  'ES crecimiento: foco mensual + página pública');
// ---------- 2f. ES index.html: shell (meta + JSON-LD + nav + hero estático) ----------
t(count(indexSrc, 'Posty es tu community manager: publica todos los días con tu producto real e impulsa tus mejores posteos. Probalo 3 días gratis, sin tarjeta.') === 4,
  'ES index meta: descripción nueva ×4 (vinieron ' + count(indexSrc, 'Posty es tu community manager: publica todos los días con tu producto real e impulsa tus mejores posteos. Probalo 3 días gratis, sin tarjeta.') + ')');
t(!has(indexSrc, 'responde comentarios y mensajes, cuida tus reseñas'),
  'ES index meta: fuera la descripción vieja (responde/reseñas)');
t(!has(indexSrc, '¿Posty también atiende a mis clientes?'), 'ES index JSON-LD: fuera «atiende a mis clientes»');
t(!has(indexSrc, '¿Posty responde los comentarios y los mensajes de mi Instagram?'), 'ES index JSON-LD: fuera «responde los comentarios»');
t(has(indexSrc, 'Nunca vemos tu contraseña: ni la pedimos ni la guardamos.'), 'ES index JSON-LD: contraseña nueva');
t(has(indexSrc, 'Sí. Cuando un posteo anda muy bien, Posty te lo marca y te propone potenciarlo: cargás crédito en tu billetera —aparte de la suscripción— y Posty elige el posteo, el público y lo gestiona, siempre con tu OK en un toque.'), 'ES index JSON-LD: Ads nuevo');
t(!has(indexSrc, 'llega a mucha más gente'), 'ES index JSON-LD: fuera la promesa de alcance vieja');
t(has(indexSrc, 'publicar — con tu aprobación en un toque cuando hace falta criterio humano'), 'ES index JSON-LD: CM sin «responder» (re-pin v837: sin «promocionar y cuidar»)');
t(has(indexSrc, 'pienso las ideas, diseño y publico'), 'ES index JSON-LD: solo sin «respondo» (re-pin v837: sin «promociono»)');
t(has(indexSrc, 'href="#prueba"') && has(indexSrc, 'href="#equipo"') && has(indexSrc, 'href="#ads"') &&
  !has(indexSrc, 'href="#analisis"') && !has(indexSrc, 'href="#capacidades"'),
  'ES index nav: enlaces nuevos');
t(has(indexSrc, 'Nunca vemos tu contraseña'), 'ES index hero: contraseña en la entrada estática');
// ---------- 2g. ES: líneas vivas del hero (lp-live) honestas ----------
['dejó listas 3 respuestas a comentarios', 'Los reels de la semana ya están listos', 'Historia de la promo programada'].forEach((bad) => t(!has(appSrc, bad), 'ES lp-live: fuera «' + bad + '»'));
['propuso 3 ideas para la semana', 'marcó el posteo que más rindió', 'dejó lista la promo de hoy'].forEach((s) => t(has(appSrc, s), 'ES lp-live: «' + s + '»'));

// ---------- 2h. styles.css: anclas nuevas con scroll-margin (bajo nav sticky) ----------
const styles = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const smRules = [...styles.matchAll(/([^{}]+)\{scroll-margin-top:(\d+)px\}/g)];
t(smRules.length >= 2, 'styles: hay 2 reglas scroll-margin (desktop+mobile, hay ' + smRules.length + ')');
for (const m of smRules) {
  for (const id of ['#prueba', '#equipo', '#ads', '#ideas', '#crecimiento'])
    t(m[1].includes(id), 'styles scroll-margin ' + m[2] + 'px: ' + id);
  for (const id of ['#como-funciona', '#planes', '#faq'])
    t(m[1].includes(id), 'styles scroll-margin ' + m[2] + 'px: conserva ' + id);
}

// ---------- 3. EN: orden nuevo ----------
ordered(enSrc, [
  'My feed is half-done',
  'lp-week-sec',
  'id="como-funciona"',
  'id="equipo"',
  'id="ads"',
  'id="planes"',
  'id="ideas"',
  'id="faq"',
  'lp-final',
], 'EN orden');

// ---------- 3b. EN: secciones eliminadas sin restos (toda la página es website) ----------
['Customer care', 'customer care', 'serve my customers', 'answer my Instagram comments',
  'Comments and replies', 'See everything it does for you', 'plan-detail', 'plan-more',
  'data-plan-more', 'lpGoAudit', 'auditoria', '2 reels', 'Reels', 'Stories',
  'Reels that show your business', 'Your reels, ready and posted by themselves',
  'A premium video every week', 'Your store talks to your Instagram', 'atencion',
  'diferencia', 'lp-feed-sec', 'gj-levels',
  'gj-office', 'id="cm"', 'id="fotos"', 'id="control"', 'id="herramienta"',
  'id="calculadora"', 'lp-stats', 'Comments answered', 'Replies ready',
].forEach((bad) => t(!has(enSrc, bad), 'EN: fuera «' + bad + '»'));
// Lista del plan EN: las 8 auditadas, sin reels/atención/respuestas.
const AUDIT_EN = [
  '7 posts a week, automatic',
  'Strategic ideas for your business',
  'Designs + captions + hashtags',
  'Automatic scheduled posting',
  'Weekly insight in Today + the Sunday Letter',
  'Weekly strategy for your business',
  'Weekly results report',
];
AUDIT_EN.forEach((f) => t(has(enSrc, f), 'EN plan: línea presente «' + f + '»'));

// ---------- 3c. EN: Ads ----------
['Posty boosts your best posts',
  'When a post takes off, Posty flags it and proposes boosting it.',
  'Your best post, spotted on its own.',
  "You set the amount, that's it.",
  'Posty does the rest.',
  'Your top-performing post',
  '2× your average',
  'Wallet $20',
  'Auto top-up ON',
  'Boost with $20 · 7 days',
  'Posty picks the audience and runs it.',
  'Try it free for 3 days →',
].forEach((s) => t(has(enSrc, s), 'EN Ads: «' + s + '»'));
t(enSrc.indexOf('id="equipo"') < enSrc.indexOf('id="ads"') &&
  enSrc.indexOf('id="ads"') < enSrc.indexOf('id="planes"'),
  'EN Ads: entre Equipo y Plan (arriba del precio)');
// (sin-repetidos): Growth EN sin re-pitch de Ads ni de Ideas — su visual es
// el foco mensual, no la propuesta de impulso.
t(!has(enSrc, 'spotted automatically') && !has(enSrc, 'Ads with your cap') && !has(enSrc, "Posty's proposal:"),
  'EN crecimiento: sin re-pitch de Ads (ni bullet, ni pauta, ni mock de propuesta)');
t(has(enSrc, 'Every month, ') && has(enSrc, "This month's focus") && has(enSrc, 'Your public page, ready, with direct WhatsApp'),
  'EN crecimiento: foco mensual + página pública');

// ---------- 3d. EN: Equipo ----------
["We're a team, Posty and I", 'Valentino Caratini', 'Founder of Posty',
  'valentino-posty-fundador.jpg', 'I created Posty because I identified a problem',
  'he builds your week and I check that every post comes out perfect',
].forEach((s) => t(has(enSrc, s), 'EN Equipo: «' + s + '»'));
t(!has(enSrc, 'answers for'), 'EN Equipo: sin «responde por»');

// ---------- 3e. EN: contraseña MUY A LA VISTA (entrada + plan + FAQ) ----------
t(count(enSrc, 'We never see your password') >= 3,
  'EN contraseña: «We never see your password» ≥3 veces (entrada + plan + FAQ), vinieron ' +
  count(enSrc, 'We never see your password'));
t(has(enSrc, "No. You connect your account with Meta's official login, just like signing in with Google on other apps. We never see your password — we never ask for it or store it."),
  'EN FAQ contraseña: respuesta exacta (visible + JSON-LD)');
t(count(enSrc, "We never see your password — we never ask for it or store it.") >= 2,
  'EN FAQ contraseña: en FAQ visible Y en JSON-LD');
t(has(enSrc, 'Yes. When a post takes off, Posty flags it and proposes boosting it: you load credit into your wallet — separate from the subscription — and Posty picks the post, the audience and runs it, always with your one-tap OK.'),
  'EN FAQ Ads: respuesta nueva honesta');
t(count(enSrc, 'Yes. When a post takes off, Posty flags it and proposes boosting it: you load credit into your wallet — separate from the subscription — and Posty picks the post, the audience and runs it, always with your one-tap OK.') >= 2,
  'EN FAQ Ads: en FAQ visible Y en JSON-LD');
t(!has(enSrc, 'Not yet: advertising with Meta'), 'EN FAQ Ads: fuera la respuesta vieja «Not yet»');
t(has(enSrc, 'in the morning you see the post, approve it in one tap and at 7:00 PM it goes out on its own'),
  'EN cómo trabaja: ritmo de la mañana plegado');
const weekEN = enSrc.slice(enSrc.indexOf('lp-week-sec'), enSrc.indexOf('lp-view'));
t(has(weekEN, 'See my week') && has(weekEN, 'We never see your password'),
  'EN prueba: entrada «See my week» + contraseña en la sección');
// ---------- 3f. EN: meta + lp-live ----------
t(count(enSrc, "Posty is your AI community manager: it posts every day with your real product and boosts your best posts. Try it free for 3 days, no card required.") === 4,
  'EN meta: descripción nueva ×4 (vinieron ' + count(enSrc, "Posty is your AI community manager: it posts every day with your real product and boosts your best posts. Try it free for 3 days, no card required.") + ')');
t(!has(enSrc, 'replies to comments and messages, looks after your reviews'), 'EN meta: fuera la descripción vieja');
['left 3 comment replies ready', "This week\\'s reels are ready", 'Promo story scheduled'].forEach((bad) => t(!has(enSrc, bad), 'EN lp-live: fuera «' + bad + '»'));
['suggested 3 ideas for the week', 'flagged your top-performing post', "has today\\'s promo post ready"].forEach((s) => t(has(enSrc, s), 'EN lp-live: «' + s + '»'));

// ---------- 4. VM: app.js parsea ----------
try {
  new vm.Script(appSrc, { filename: 'app.js' });
  t(true, 'VM: app.js parsea');
} catch (e) { t(false, 'VM: app.js parsea (' + e.message + ')'); }


// ---------- 6. Agregados v761 (Valentino 7/11 15:14): precio USD 199 en
// /prueba + logo Posty en header/pie ----------
// Precio: SOLO LA VISTA cambia a USD 199; los precios cobrados NO se tocan
// (PLANS_AR.price 199999 ARS y PLAN_ANCHOR AR '$199.999' siguen).
const pruebaES = fs.readFileSync(path.join(__dirname, 'public', 'prueba.html'), 'utf8');
const pruebaEN = fs.readFileSync(path.join(__dirname, 'public', 'en-prueba.html'), 'utf8');
const plansSrc = fs.readFileSync(path.join(__dirname, 'config', 'plans.js'), 'utf8');
const stylesSrc = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
t(count(pruebaES, '199.999') === 0, 'precio: cero «199.999» en prueba.html');
t(count(pruebaEN, '199,999') === 0, 'precio: cero «199,999» en en-prueba.html');
t(count(pruebaES, '199999') === 1, 'precio: «199999» pelado queda 1x (JSON-LD, precio cobrado)');
t(has(pruebaES, 'Posty, desde USD 199.'), 'precio: contraste estático ES «Posty, desde USD 199.»');
t(has(pruebaEN, 'Posty, from USD 199.'), 'precio: contraste estático EN «Posty, from USD 199.»');
t(has(pruebaES, "let desdeU = 'USD 199'"), 'precio: fallback ES desdeU USD 199');
t(has(pruebaEN, "let desdeU = 'USD 199'"), 'precio: fallback EN desdeU USD 199');
t(has(pruebaES, '/api/billing/plans?unico=1'), 'precio: constructor ES pide unico=1');
t(has(pruebaEN, '/api/billing/plans?unico=1'), 'precio: constructor EN pide unico=1');
t(count(pruebaES, 'desdeU') >= 3, 'precio: anchor ES usa desdeU (declaración + fetch + anchor)');
t(count(pruebaEN, 'desdeU') >= 3, 'precio: anchor EN usa desdeU (declaración + fetch + anchor)');
t(has(pruebaES, 'Planes desde USD 199/mes — y tus primeros 3 días son gratis.'), 'precio: lede ES USD 199 sin cifra diaria');
t(!has(pruebaES, '9.997') && !has(pruebaES, '9,997'), 'precio: lede ES sin cifra diaria del Pro');
t(has(pruebaEN, 'Plans from USD 199/mo — and your first 3 days are free.'), 'precio: lede EN USD 199 sin cifra diaria');
t(!has(pruebaEN, '9.97'), 'precio: lede EN sin cifra diaria del Pro');
t(count(pruebaES, 'Desde USD 199/mes al terminar') === 3, 'precio: tinys ES USD 199 x3');
t(count(pruebaEN, 'From USD 199/mo when it ends') === 3, 'precio: tinys EN USD 199 x3');
// Beneficio /prueba (v761-detail): la promesa es 7 posteos/semana, sin reels.
t(has(pruebaES, '7 posteos por semana, pensados para vender: cada uno con su intención (reservas, consultas, ventas).'), 'beneficio: ES «7 posteos por semana, pensados para vender…»');
t(!has(pruebaES, '7 posteos y 2 reels por semana'), 'beneficio: ES sin «7 posteos y 2 reels por semana»');
t(has(pruebaEN, '7 posts every week, built to sell: each with its own intent (bookings, inquiries, sales).'), 'beneficio: EN «7 posts every week, built to sell…»');
t(!has(pruebaEN, '7 posts and 2 reels every week'), 'beneficio: EN sin «7 posts and 2 reels every week»');
// Hero / hace / meta de /prueba (v761-detail-3): el plan único no incluye
// respuestas a comentarios, DMs ni reseñas (plan-gate.js: comentarios/dms/resenas
// solo ['total','free']; GBP responde 503 «llega en poquito»).
t(has(pruebaES, 'Tu community manager completo: armo tu semana de posteos, la publico por vos y estudio tu negocio.'), 'hero: ES «armo tu semana, la publico y estudio tu negocio»');
t(!has(pruebaES, 'respondo tus comentarios y mensajes'), 'hero: ES sin «respondo tus comentarios y mensajes»');
t(!has(pruebaES, 'cuido tus reseñas'), 'hero: ES sin «cuido tus reseñas»');
t(has(pruebaEN, 'Your complete community manager: I build your week of posts, publish it for you and study your business.'), 'hero: EN «build your week, publish it and study your business»');
t(!has(pruebaEN, 'answer your comments and messages'), 'hero: EN sin «answer your comments and messages»');
t(!has(pruebaEN, 'look after your reviews'), 'hero: EN sin «look after your reviews»');
t(count(pruebaES, 'class="hace-item"') === 9, 'hace: ES 9 ítems (12 − 💬/📩/⭐, v761-detail-3)');
t(count(pruebaEN, 'class="hace-item"') === 9, 'hace: EN 9 ítems (12 − 💬/📩/⭐, v761-detail-3)');
t(!has(pruebaES, 'Responde tus comentarios'), 'hace: ES sin ítem 💬');
t(!has(pruebaES, 'Responde tus mensajes'), 'hace: ES sin ítem 📩');
t(!has(pruebaES, 'Cuida tus reseñas'), 'hace: ES sin ítem ⭐');
t(!has(pruebaEN, 'Answers your comments'), 'hace: EN sin ítem 💬');
t(!has(pruebaEN, 'Answers your messages'), 'hace: EN sin ítem 📩');
t(!has(pruebaEN, 'Looks after your reviews'), 'hace: EN sin ítem ⭐');
t(has(pruebaES, 'publica tu semana, estudia tu negocio y potencia tu contenido'), 'meta: ES descripción alineada');
t(!has(pruebaES, 'responde comentarios y mensajes'), 'meta: ES sin «responde comentarios y mensajes»');
t(!has(pruebaES, 'cuida tus reseñas'), 'meta: ES sin «cuida tus reseñas»');
t(has(pruebaEN, 'it posts your week, studies your business and boosts your content'), 'meta: EN descripción alineada');
t(!has(pruebaEN, 'replies to comments and messages'), 'meta: EN sin «replies to comments and messages»');
t(!has(pruebaEN, 'looks after your reviews'), 'meta: EN sin «looks after your reviews»');
// Resumen del plan en el prompt del chat (v761-detail-4): el plan único no
// incluye atención al cliente (oficio de Gesty; plan-gate.js: atencion solo
// ['total','free']). El resumen vende «community manager y growth» y nada
// más, en los dos prompts del chat (editor de la prueba sysEs/sysEn y chat
// público POSTY_CHAT_SYS[_EN]).
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
t(count(serverSrc, 'growth y atención al cliente') === 0, 'chat: ES cero «growth y atención al cliente» en el resumen del plan');
t(count(serverSrc, 'growth and customer care') === 0, 'chat: EN cero «growth and customer care» en el resumen del plan');
t(count(serverSrc, 'con todo incluido — community manager y growth, $6.63 por día') === 2, 'chat: ES resumen «community manager y growth» x2 (editor + público)');
t(count(serverSrc, 'everything included — community manager and growth, $6.63 a day') === 2, 'chat: EN resumen «community manager and growth» x2 (editor + público)');
t(has(pruebaES, 'Un community manager cobra desde $1.000.000 por mes'), 'precio: línea del CM queda (Valentino 24/10)');
t(has(plansSrc, 'price: 199999'), 'precio: PLANS_AR.price sigue 199999 ARS (cobro intacto)');
t(has(plansSrc, "desde: '$199.999'"), 'precio: PLAN_ANCHOR AR sigue $199.999 (app intacta)');
// Logo: asset 226x62 de Valentino, header+pie ES+EN, sello Bambooty fuera.
const logoPath = path.join(__dirname, 'public', 'posty-logo.png');
t(fs.existsSync(logoPath), 'logo: public/posty-logo.png existe');
const logoBuf = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : Buffer.alloc(0);
t(logoBuf.length > 0 && logoBuf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'logo: posty-logo.png es PNG válido');
t(logoBuf.length >= 24 && logoBuf.readUInt32BE(16) === 226 && logoBuf.readUInt32BE(20) === 62, 'logo: posty-logo.png 226x62 por cabecera IHDR');
t(count(indexSrc, 'posty-logo.png') === 1, 'logo: header ES shell referencia /posty-logo.png');
t(has(indexSrc, 'alt="Posty"'), 'logo: header ES alt Posty');
t(count(enSrc, 'posty-logo.png') === 2, 'logo: header+pie EN referencian /posty-logo.png');
t(count(appSrc, 'posty-logo.png') === 5, 'logo: posty-logo.png ×5 en app.js (landingView header + pie ES + 3 auth)');
t(count(indexSrc, 'logo-bambooty.png') === 0, 'logo: cero sello Bambooty en index.html');
t(count(enSrc, 'logo-bambooty.png') === 0, 'logo: cero sello Bambooty en en/index.html');
t(count(appSrc, 'logo-bambooty.png') === 0, 'logo: sello Bambooty en 0 en app.js (auth ahora usa posty-logo.png)');
t(has(stylesSrc, '.logo-img{height:34px'), 'logo: styles.css regla .logo-img');
t(has(stylesSrc, '.logo-img-foot{height:40px'), 'logo: styles.css regla .logo-img-foot');
t(has(stylesSrc, '@media(max-width:760px){.logo-img{height:28px}'), 'logo: styles.css .logo-img móvil');

// ---------- 7. Boot real ----------
(async () => {
  let booted = false;
  try { require.resolve('express', { paths: [__dirname] }); booted = true; } catch (e) {
    try { require.resolve('express', { paths: ['/home/hatch/workspace/posta/node_modules'] }); booted = true; } catch (e2) { booted = false; }
  }
  if (!booted) {
    console.log('boot: express no resuelve, sección omitida');
  } else {
    const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-website-copy-'));
    const PORT = 18755;
    const BASE = 'http://127.0.0.1:' + PORT;
    const waitBoot = async (tries = 60) => {
      for (let i = 0; i < tries; i++) {
        try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    };
    const srvProc = spawn('node', ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, NODE_PATH: '/home/hatch/workspace/posta/node_modules', DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-website-copy', OPENAI_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let srvLog = '';
    srvProc.stdout.on('data', (d) => { srvLog += d; });
    srvProc.stderr.on('data', (d) => { srvLog += d; });
    try {
      t(await waitBoot(), 'boot: server levanta');
      const ver = await (await fetch(BASE + '/api/version')).json();
      t(ver.build === '20261105-v837', 'boot: /api/version 20261105-v837 (vino ' + ver.build + ')');
      const plansRes = await (await fetch(BASE + '/api/billing/plans?unico=1')).json();
      const apiFeats = ((plansRes.plans || [])[0] && (plansRes.plans || [])[0].features) ||
        (plansRes.unico && plansRes.unico.features) || [];
      t(apiFeats.length === 7, 'boot: /api/billing/plans trae 7 features (vinieron ' + apiFeats.length + ')');
      const apiDetail = ((plansRes.plans || [])[0] && (plansRes.plans || [])[0].detail) ||
        (plansRes.unico && plansRes.unico.detail) || [];
      t(apiDetail.length === 6, 'boot: /api/billing/plans trae detail con 6 ítems (vinieron ' + apiDetail.length + ')');
      t(apiDetail.every((d) => !/reel/i.test(d)), 'boot: API detail sin reels');
      AUDIT_ES.forEach((f) => t(apiFeats.indexOf(f) !== -1, 'boot: API feature «' + f + '»'));
      // Lo servido: el index carga app.js?v=N; ese bundle es el del árbol.
      const home = await (await fetch(BASE + '/')).text();
      const m = home.match(/app\.js\?v=([\w.-]+)/);
      t(!!m, 'boot: home carga app.js versionado');
      t(!has(home, 'responde comentarios y mensajes, cuida tus reseñas'), 'boot: home servida sin meta vieja');
      t(has(home, 'Nunca vemos tu contraseña: ni la pedimos ni la guardamos.'), 'boot: home servida con JSON-LD nuevo');
      t(!has(home, '¿Posty también atiende a mis clientes?'), 'boot: home servida sin JSON-LD de atención');
      t(has(home, 'Nunca vemos tu contraseña'), 'boot: home servida con contraseña en la entrada');
      if (m) {
        const servedApp = await (await fetch(BASE + '/app.js?v=' + m[1])).text();
        t(has(servedApp, 'Posty impulsa tus mejores posteos'), 'boot: app.js servido trae Ads');
        t(has(servedApp, 'id="equipo"'), 'boot: app.js servido trae Equipo');
        t(has(servedApp, 'Nunca vemos tu contraseña'), 'boot: app.js servido trae contraseña');
        t(!has(servedApp, 'lpAtencionHTML'), 'boot: app.js servido sin lpAtencionHTML');
        t(!has(servedApp, 'Ver todo lo que hace por vos'), 'boot: app.js servido sin expansor');
        // Orden renderizado: en la plantilla, Equipo < llamada Ads < Plan <
        // llamada Ideas+Crecimiento < FAQ; las secciones viven en sus funciones.
        t(servedApp.indexOf('id="equipo"') < servedApp.indexOf('${lpAdsHTML()}') &&
          servedApp.indexOf('${lpAdsHTML()}') < servedApp.indexOf('id="planes"') &&
          servedApp.indexOf('id="planes"') < servedApp.indexOf('${lpIdeasGrowthHTML()}') &&
          servedApp.indexOf('${lpIdeasGrowthHTML()}') < servedApp.indexOf('id="faq"'),
          'boot: app.js servido con Equipo < Ads < Plan < Ideas < FAQ');
        t(has(servedApp, 'id="ads"'), 'boot: lpAdsHTML trae id="ads"');
      // styles.css servido (mismo archivo ES+EN): anclas nuevas con scroll-margin.
      const servedStyles = await (await fetch(BASE + '/styles.css')).text();
      for (const id of ['#prueba', '#equipo', '#ads', '#ideas', '#crecimiento'])
        t(servedStyles.includes(id), 'boot: styles.css servido con scroll-margin ' + id);
        t(has(servedApp, 'id="ideas"'), 'boot: lpIdeasGrowthHTML trae id="ideas"');
      }
      const enPage = await (await fetch(BASE + '/en/')).text();
      t(has(enPage, 'Posty boosts your best posts'), 'boot: /en/ servida trae Ads');
      t(has(enPage, 'We never see your password'), 'boot: /en/ servida trae contraseña');
      t(!has(enPage, 'Comments and replies'), 'boot: /en/ servida sin «Comments and replies»');
      t(!has(enPage, 'See everything it does for you'), 'boot: /en/ servida sin expansor');
      t(enPage.indexOf('id="equipo"') < enPage.indexOf('id="ads"') &&
        enPage.indexOf('id="ads"') < enPage.indexOf('id="planes"'),
        'boot: /en/ servida con Ads entre Equipo y Plan');
      // Agregados v761: logo servido + /prueba sin cifra vieja.
      const logoRes = await fetch(BASE + '/posty-logo.png');
      t(logoRes.status === 200, 'boot: GET /posty-logo.png 200 (vino ' + logoRes.status + ')');
      t((logoRes.headers.get('content-type') || '').indexOf('image/png') !== -1, 'boot: /posty-logo.png content-type image/png');
      t(has(home, 'posty-logo.png'), 'boot: home servida con posty-logo.png');
      const pruebaPage = await (await fetch(BASE + '/prueba.html')).text();
      t(!has(pruebaPage, '199.999'), 'boot: /prueba.html servida sin «199.999»');
      t(has(pruebaPage, 'desde USD 199'), 'boot: /prueba.html servida con USD 199');
      const pruebaENPage = await (await fetch(BASE + '/en/prueba')).text(); // ruta /en/prueba (sin .html)
      t(!has(pruebaENPage, '199,999'), 'boot: /en/prueba.html servida sin «199,999»');
      t(has(pruebaENPage, 'from USD 199'), 'boot: /en/prueba.html servida con USD 199');
      t(plansRes.anchor && plansRes.anchor.desde === 'USD 199', 'boot: /api/billing/plans?unico=1 anchor.desde USD 199');
    } catch (e) {
      t(false, 'boot: excepción ' + e.message);
    } finally {
      srvProc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 800));
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
      if (srvLog && FAIL > 0) console.log('--- server log (últimas líneas) ---\n' + srvLog.split('\n').slice(-25).join('\n'));
    }
  }
  console.log('\nwebsite-copy: ' + PASS + ' pass / ' + FAIL + ' fail');
  if (FAIL > 0) { console.log('FALLOS:\n' + fails.map((f) => ' - ' + f).join('\n')); }
  process.exit(FAIL > 0 ? 1 : 0);
})();
