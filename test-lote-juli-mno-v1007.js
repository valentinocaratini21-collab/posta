// LOTE JULI-MNO v1007 — suite de aceptación (Juli, 2026-11-13).
// Ítems M208.3: (o) GRITO-MARCA-ES · (m) EMPALME-EN posesivo+artículo y
// SPANISH_LEAK ampliado · (n) FALLBACK-VARIEDAD en resolveTrialCaption.
// Datos reales: ids 622/623/633/635 (fallback idéntico entre marcas),
// 624/636 (marca en mayúsculas en captions ES), 656 (empalme EN de la
// semana regenerada de VEJA), 644 (cuerpo ES en caption EN publicado).
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
let ok = 0, fail = 0;
function t(cond, label, extra) {
  if (cond) { ok++; console.log('  ok', label); }
  else { fail++; console.log('  FAIL', label, extra ? '— ' + extra : ''); }
}
const G = require(path.join(DIR, 'generator.js'));
const DC = require(path.join(DIR, 'demo-captions.js'));

// ---------- A. (o) GRITO-MARCA-ES ----------
const ES_BYREDO = 'El lado humano de BYREDO 🖤\n\nNuestro equipo trabaja detrás de escena para que cada detalle esté cuidado.\n\n¿Tenés dudas? Escribinos y te ayudamos 📩';
const ES_VEJA = 'Lo nuevo de VEJA ya llegó ✨\n\nCada modelo nace de un proceso cuidado, paso a paso.\n\nPasá por el local y probalo hoy 📩';
t(G.captionPasses(ES_BYREDO, { business: 'BYREDO' }).ok === true, 'A1 ES: caption limpio que nombra BYREDO pasa', JSON.stringify(G.captionPasses(ES_BYREDO, { business: 'BYREDO' })));
t(G.captionPasses(ES_VEJA, { business: 'VEJA' }).ok === true, 'A2 ES: caption limpio que nombra VEJA pasa', JSON.stringify(G.captionPasses(ES_VEJA, { business: 'VEJA' })));
const ES_GRITO = 'Llegó lo nuevo a la tienda ✨\n\nTodo con envío GRATIS esta semana, como siempre.\n\nPasá por el local y probalo hoy 📩';
const gGrito = G.captionPasses(ES_GRITO, { business: 'Tienda Sol' });
t(gGrito.ok === false && /grito/.test(gGrito.reason || ''), 'A3 ES control: énfasis en mayúsculas que NO es la marca sigue siendo grito', JSON.stringify(gGrito));
const ES_OTRA_MARCA = 'El lado humano de BYREDO 🖤\n\nNuestro equipo trabaja detrás de escena para que cada detalle esté cuidado.\n\n¿Tenés dudas? Escribinos y te ayudamos 📩';
const gOtra = G.captionPasses(ES_OTRA_MARCA, { business: 'Olive & June' });
t(gOtra.ok === false && /grito/.test(gOtra.reason || ''), 'A4 ES control: la exención es SOLO para el nombre del propio negocio', JSON.stringify(gOtra));
const EN_BYREDO = 'The human side of BYREDO 🖤\n\nOur team works behind the scenes so every detail is cared for.\n\nQuestions? DM us and we will help you 📩';
t(G.captionPassesEn(EN_BYREDO, { business: 'BYREDO' }).ok === true, 'A5 EN: la exención de marca sigue viva en la puerta EN', JSON.stringify(G.captionPassesEn(EN_BYREDO, { business: 'BYREDO' })));

// ---------- B. (m) EMPALME-EN + LEAK AMPLIADO ----------
const CAP_656 = "3 keys to choosing your the salar well 👇\n\nQuality, detail and the VEJA standard: that's how we do the salar.\n\nSave this post for when you need it 🔖";
const g656 = G.captionPassesEn(CAP_656, { business: 'VEJA' });
t(g656.ok === false && /spliced opening/.test(g656.reason || ''), 'B1 EN: el id real 656 («your the salar») se rechaza como apertura empalmada', JSON.stringify(g656));
const CAP_619 = "3 keys to choosing your scoopable cookie dough well 👇\n\nQuality, detail and the Crumbl standard: that's how we do scoopable cookie dough.\n\nSave this post for when you need it 🔖";
const g619 = G.captionPassesEn(CAP_619, { business: 'Crumbl' });
t(!/spliced opening/.test(g619.reason || ''), 'B2 EN control: la fórmula con tema limpio (619) NO se marca empalme', JSON.stringify(g619));
const EN_FIJATE = 'A tip that always works 👇\n\nFijate this one detail before you buy, it changes everything.\n\nSave this post 🔖';
const gFij = G.captionPassesEn(EN_FIJATE, { business: 'Crumbl' });
t(gFij.ok === false && /spanish leak/.test(gFij.reason || ''), 'B3 EN: «fijate» sin signos también es spanish leak', JSON.stringify(gFij));
const EN_PASAA = 'Our morning ritual ☕\n\nPasá a try the new blend this week, it is worth it.\n\nCome try it today 📍';
const gPasa = G.captionPassesEn(EN_PASAA, { business: 'Hungry Ghost Coffee' });
t(gPasa.ok === false && /spanish leak/.test(gPasa.reason || ''), 'B4 EN: «pasá a» también es spanish leak', JSON.stringify(gPasa));
const CAP_644 = 'We tried 12 versions of cafe until we got this one: Hungry Ghost Coffee\n\n¿Te imaginás un café que te hable al alma? ☕\nEn Hungry Ghost Coffee, cada taza es una experiencia. Desde el grano hasta la entrega, nos aseguramos de que cada sorbo sea lo mejor de lo mejor.\nPasá a probarlo hoy. ¡Te estamos esperando!';
const g644 = G.captionPassesEn(CAP_644, { business: 'Hungry Ghost Coffee' });
t(g644.ok === false && /spanish leak|wrong language/.test(g644.reason || ''), 'B5 EN: el id real 644 (publicado) la puerta lo rechaza — su ruta no la consultó', JSON.stringify(g644));

// ---------- C. (n) FALLBACK-VARIEDAD ----------
function fbFor(business, lang, prevCaptions) {
  const r = DC.resolveTrialCaption([], 'cafeteria', { business, tone: 'vos', country: 'AR', idx: 0, goalLine: '', lang, prevCaptions: prevCaptions || [], voiceLine: '' });
  return r.caption;
}
const stripBiz = (c, b) => c.split(b).join('{BIZ}');
const enBodies = ['BYREDO', 'VEJA', 'Crumbl', 'Philz Coffee'].map((b) => fbFor(b, 'en'));
t(new Set(enBodies.map((c, i) => stripBiz(c, ['BYREDO', 'VEJA', 'Crumbl', 'Philz Coffee'][i]))).size >= 2, 'C1 EN: el primer fallback ya no es la misma plantilla para todas las marcas', JSON.stringify(enBodies.map((c) => c.split('\n')[0])));
const esBodies = ['Café Sol', 'Panadería Luna', 'Barbería Norte', 'Tienda Río'].map((b) => fbFor(b, 'es'));
t(new Set(esBodies.map((c, i) => stripBiz(c, ['Café Sol', 'Panadería Luna', 'Barbería Norte', 'Tienda Río'][i]))).size >= 2, 'C2 ES: el primer fallback ya no es la misma plantilla para todas las marcas', JSON.stringify(esBodies.map((c) => c.split('\n')[0])));
const first = fbFor('BYREDO', 'en');
const second = fbFor('BYREDO', 'en', [first]);
t(second !== first, 'C3 EN: dentro de la semana, el fallback rota y no repite cuerpo');
const third = fbFor('BYREDO', 'en', [first, second]);
t(third !== first && third !== second, 'C4 EN: la tercera pieza cae a otro fallback libre');
t(!/in your words|as you asked/i.test(first), 'C5 EN: el fallback sigue sin meta-línea (v958 intacto)');
const gFbEn = G.captionPassesEn(first + '\n#coffee #sneakers', { business: 'BYREDO' });
t(gFbEn.ok === true, 'C6 EN: el fallback elegido pasa su propia puerta', JSON.stringify(gFbEn) + ' :: ' + first.split('\n')[0]);
const gFbEs = G.captionPasses(esBodies[0] + '\n#cafe #cafeteria', { business: 'Café Sol' });
t(gFbEs.ok === true, 'C7 ES: el fallback elegido pasa su propia puerta', JSON.stringify(gFbEs) + ' :: ' + esBodies[0].split('\n')[0]);
t(typeof DC.SAFE_FALLBACK_VARIANTS_ES === 'object' && typeof DC.SAFE_FALLBACK_VARIANTS_EN === 'object', 'C8: las tablas de variantes están exportadas');
t(Object.keys(DC.SAFE_FALLBACK_VARIANTS_ES).length === 6 && Object.keys(DC.SAFE_FALLBACK_VARIANTS_EN).length === 6, 'C9: hay variante para los 6 kinds en los dos idiomas');

// ---------- D. Estampado / checklist ----------
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
t(srv.includes('20261105-v1007'), 'D1: BUILD 20261105-v1007 en server.js');
const cs = fs.readFileSync(path.join(DIR, 'caption-style.js'), 'utf8');
t(cs.includes('27. LA MARCA EN MAYÚSCULAS NO ES GRITO'), 'D2: regla 27 en el checklist ES');
t(cs.includes('25. THE BRAND IN CAPS IS NOT SHOUTING'), 'D3: regla 25 en el checklist EN');
const gen = fs.readFileSync(path.join(DIR, 'generator.js'), 'utf8');
t(gen.includes('meta-line'), 'D4: la regla META-LÍNEA (v958) sigue presente en generator.js');

console.log(`\nRESULTADO: ${ok} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
