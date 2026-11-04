// test-lotepruebaproducto.js — LOTE PRUEBA-PRODUCTO-REAL (4/11, sin push).
// Tests sin red del lote: nombre web, guard del espejo, filtro de bio,
// rangos de foto de la prueba, porqué honesto y nombre IG.
// Uso: node test-lotepruebaproducto.js  (sale 0 solo si todo pasa)
'use strict';
const demo = require('./demo');
const webExtract = require('./web-extract');
const clientDigest = require('./client-digest');
const onboardingProducts = require('./onboarding-products');
const analysisEngine = require('./analysis-engine');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('OK  ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}

// 1) Nombre web: el hero problema-primero NO es nombre; <title> manda.
check('pickName hero rechazado, title Posty',
  webExtract.pickName(['', '', 'Posty — Tu community manager 🤖', '«Mi feed queda a medias y no me trae clientes», Posty postea por vos todos los días con tu producto real · Posty']) === 'Posty');
check('pickName og:title nombre real',
  webExtract.pickName(['', '', 'Inicio | Café Aurora', 'Café Aurora — Café de especialidad']) === 'Café Aurora');
check('pickName sin candidato = vacio (no inventa)',
  webExtract.pickName(['', '«Se me enfrían las consultas y pierdo ventas», Venty vende por vos', 'Inicio']) === '');
check('pickName JSON-LD manda',
  webExtract.pickName(['Café Aurora', 'Otro', 'Tercero', 'Cuarto']) === 'Café Aurora');
check('isNameLike frase larga = false',
  webExtract.isNameLike('Posty postea por vos todos los días con tu producto real') === false);
check('isNameLike Inicio = false', webExtract.isNameLike('Inicio') === false);
check('isNameLike Posty = true', webExtract.isNameLike('Posty') === true);

// 2) Guard del espejo: la etiqueta NO se mina como servicio.
const esp = 'Productos confirmados por el dueño en el espejo (usar EXACTAMENTE estos, nunca otros): Community manager: posteos diarios con tu producto real';
const mined = clientDigest.offeringsFromText(esp);
check('espejo no minado como servicio',
  !mined.items.some((x) => /confirmados por el due/i.test(x)), mined.items);
const espEn = 'Products confirmed by the owner in the mirror (use EXACTLY these, never others): Community manager: daily posts with your real product';
const minedEn = clientDigest.offeringsFromText(espEn);
check('espejo EN no minado como servicio',
  !minedEn.items.some((x) => /confirmed by the owner/i.test(x)), minedEn.items);
check('minado normal intacto',
  clientDigest.offeringsFromText('Cafetería de especialidad en Palermo. Brunch del fin de semana.').items.length >= 1);
check('minado sin basura de fecha',
  !clientDigest.offeringsFromText('Posty • Tu community manager. 🔜 Lanzamiento 1/2/2027').items.some((x) => /lanzamiento|2027/i.test(x)),
  clientDigest.offeringsFromText('Posty • Tu community manager. 🔜 Lanzamiento 1/2/2027').items);

// 3) Filtro de bio: basura de fecha fuera, oferta real dentro. Y el
// propio nombre no es producto (el prefill lo excluye).
check('bio con lanzamiento no da productos basura',
  JSON.stringify(onboardingProducts.detectProducts({ bio: 'Posty • Tu community manager. 🔜 Lanzamiento 1/2/2027', excludeNames: ['Posty', 'posty.communitymanager'] })) === '[]',
  onboardingProducts.detectProducts({ bio: 'Posty • Tu community manager. 🔜 Lanzamiento 1/2/2027', excludeNames: ['Posty', 'posty.communitymanager'] }));
check('bio con oferta real la conserva',
  onboardingProducts.detectProducts({ bio: 'Cafetería de especialidad. Brunch del fin de semana.' }).length >= 1);

// 4) Rangos de foto de la prueba (trialNoStock): marca sí, cualquiera no.
const pool = [
  { path: '/w/cafe.jpg', temas: ['cafe'], url: 'https://x/cafe.jpg' },
  { path: '/w/cover.jpg', temas: ['marca'], url: 'https://x/cover.jpg' },
];
const ctxTrial = demo.photoGateCtx({ category: 'profesionales', subcat: '', topic: { tema: 'horarios' }, trialNoStock: true });
const hitTrial = demo.pickWebPhoto({ tema: 'horarios' }, pool, new Set(), ctxTrial);
check('trial: elige marca, no cafe de ejemplo',
  hitTrial && hitTrial.path === '/w/cover.jpg', hitTrial);
const ctxNormal = demo.photoGateCtx({ category: 'profesionales', subcat: '', topic: { tema: 'horarios' } });
const hitNormal = demo.pickWebPhoto({ tema: 'horarios' }, pool, new Set(), ctxNormal);
check('no-trial: rango cualquiera intacto',
  hitNormal && hitNormal.path === '/w/cafe.jpg', hitNormal);
const hitExact = demo.pickWebPhoto({ tema: 'cafe' }, pool, new Set(), ctxTrial);
check('trial: match exacto de tema sigue mandando sobre marca',
  hitExact && hitExact.path === '/w/cafe.jpg', hitExact);

// 5) Porqué honesto: sin foto del producto, no se afirma «muestra X».
const digest = { productos: [{ nombre: 'Brunch del fin de semana' }], servicios: [] };
const whySin = analysisEngine.whyForPost({ tipo: '', formato: '', salesIntent: '', porque: '' }, { lang: 'es' }, digest, { sinMuestra: true });
check('sinMuestra: no afirma que muestra el producto',
  whySin && !/muestra Brunch/.test(whySin), whySin);
const whyCon = analysisEngine.whyForPost({ tipo: '', formato: '', salesIntent: '', porque: '' }, { lang: 'es' }, digest, {});
check('con foto: el candidato muestra sigue vivo',
  whyCon && /muestra Brunch/.test(whyCon), whyCon);

// 6) Nombre IG: escapes \uXXXX + corte en • (simple y doble escapado:
// el embed trae \\u2022, dos niveles).
check('decodeIgName Posty con bullet',
  demo.decodeIgName('Posty \\u2022 Tu community manager') === 'Posty');
check('decodeIgName Posty doble escapado (caso real del embed)',
  demo.decodeIgName('Posty \\\\u2022 Tu community manager') === 'Posty');
check('decodeIgName sin bullet intacto',
  demo.decodeIgName('Caf\\u00e9 Aurora') === 'Café Aurora');
check('decodeIgName simple intacto',
  demo.decodeIgName('Mili Makeup') === 'Mili Makeup');

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
