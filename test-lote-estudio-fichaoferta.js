'use strict';
/* test-lote-estudio-fichaoferta.js — M3 ESTUDIO-PROFUNDO: FICHA DE OFERTA
 * CON FECHAS (7/11, Valentino «Perfecto! Arma todo»).
 *
 * Regla: un posteo solo puede mencionar un precio o una promo si existe
 * una oferta CON FECHA en el fundamento; una promo sin fecha de fin nunca
 * se presenta como vigente. Mata la clase de fallo del posteo 531 (tease
 * de promo sin términos).
 *
 * Uso: node test-lote-estudio-fichaoferta.js            (árbol actual)
 *      BASE=/ruta/al/arbol node test-lote-estudio-fichaoferta.js
 * En el árbol v760 (sin el lote) debe FALLAR (no existe study-offer.js).
 * Con el lote debe dar 0 fallos.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || __dirname;
let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; }
  else { badN++; console.log('✗', name, extra ? '(' + extra + ')' : ''); }
};
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');
const req = (rel) => require(path.join(BASE, rel));

// Hoy fijado para los fixtures: 7/11/2026 (sábado). Futuro: 30/11 y
// 20/12/2026; pasado: 4/11/2026.
const NOW = new Date('2026-11-07T12:00:00-03:00');
const TODAY = '2026-11-07';

let so = null;
try { so = req('study-offer.js'); } catch (e) { so = null; }
t(!!so, '1. existe study-offer.js', so ? '' : 'módulo ausente');
if (!so) {
  console.log(`\n${okN} pasaron, ${badN} fallaron. (módulo ausente: resto sin correr)`);
  process.exit(1);
}

// ---------- 1. Extracción estructurada (web + IG) ----------
const WEB_BF = [
  'Café Luna — café de especialidad en Palermo.',
  'Black Friday: 20% OFF en todo el café, hasta el 30/11/2026.',
  'Café de especialidad $ 12.500 el kilo. Medialunas caseras $ 3.200 la docena.',
  'Horarios: lunes a viernes de 8 a 18 hs. Estamos en Gorriti 1234, Palermo.',
].join('\n');
const sheetBF = so.extractOfferSheet({
  webText: WEB_BF, webUrl: 'https://cafeluna.com', items: ['Café de especialidad', 'Medialunas caseras'], now: NOW,
});
t(sheetBF && sheetBF.v === 1, '1.1 ficha con versión 1');
t(Array.isArray(sheetBF.promos) && sheetBF.promos.length === 1, '1.2 una promo extraída', JSON.stringify(sheetBF.promos));
const pBF = (sheetBF.promos || [])[0] || {};
t(pBF.ends_at === '2026-11-30', '1.3 promo con fecha de fin 2026-11-30', 'vino ' + pBF.ends_at);
t(pBF.vigente === true && pBF.status === 'vigente', '1.4 promo vigente', pBF.status);
t(/20\s?%/.test(pBF.titulo || '') || /20\s?%/.test(pBF.descuento || ''), '1.5 promo conserva el % OFF', pBF.titulo);
t(pBF.fuente === 'web' && typeof pBF.evidencia === 'string' && pBF.evidencia.length > 5, '1.6 promo con procedencia + evidencia');
const prodCafe = (sheetBF.productos || []).find((x) => /especialidad/i.test(x.nombre || ''));
t(!!prodCafe && /12.?500/.test(String(prodCafe.precio || '')), '1.7 producto con precio y fuente', JSON.stringify(prodCafe));
t(sheetBF.horarios && /8 a 18/.test(sheetBF.horarios.texto || ''), '1.8 horarios extraídos', JSON.stringify(sheetBF.horarios));
t(sheetBF.ubicacion && /Gorriti 1234/.test(sheetBF.ubicacion.texto || ''), '1.9 ubicación extraída', JSON.stringify(sheetBF.ubicacion));
t(sheetBF.compra && sheetBF.compra.vende_online !== undefined, '1.10 bloque compra presente');

const WEB_SIN_FECHA = 'Promo: 2x1 en cafés todos los días. Vení a probar nuestro café de especialidad.';
const sheetSinFecha = so.extractOfferSheet({ webText: WEB_SIN_FECHA, now: NOW });
const pSin = (sheetSinFecha.promos || [])[0] || {};
t(sheetSinFecha.promos.length === 1, '1.11 promo sin fecha extraída');
t(pSin.ends_at == null && pSin.vigente === false && pSin.status === 'sin_fecha', '1.12 promo sin fecha: vigente=false, status sin_fecha', pSin.status + '/' + pSin.ends_at);
t((sheetSinFecha.faltantes || []).includes('promo_con_fecha'), '1.13 faltante promo_con_fecha registrado');

const WEB_VENCIDA = 'Black Friday: 30% OFF hasta el 04/11/2026. Ya pasó, gracias a todos.';
const sheetVencida = so.extractOfferSheet({ webText: WEB_VENCIDA, now: NOW });
const pVen = (sheetVencida.promos || [])[0] || {};
t(pVen.status === 'vencida' && pVen.vigente === false, '1.14 promo vencida: vigente=false', pVen.status);

const sheetVacia = so.extractOfferSheet({ webText: 'Café Luna, café rico en Palermo.', now: NOW });
t(sheetVacia.promos.length === 0 && sheetVacia.productos.length === 0, '1.15 sin datos: ficha vacía honesta, sin inventar');
t((sheetVacia.faltantes || []).includes('precio'), '1.16 sin precio: faltante precio registrado');

const IG_TXT = 'Bio: cafetería en Palermo ☕ 2x1 en medialunas hasta el 20/12/2026, ¡te esperamos!';
const sheetIg = so.extractOfferSheet({ igText: IG_TXT, igHandle: 'cafeluna', now: NOW });
t(sheetIg.promos.length === 1 && sheetIg.promos[0].ends_at === '2026-12-20' && sheetIg.promos[0].fuente === 'ig', '1.17 IG también alimenta la ficha (fuente ig)', JSON.stringify(sheetIg.promos));

// Fechas en palabras + EN.
t(so.parseOfferDate('hasta el 15 de noviembre de 2026', NOW) === '2026-11-15', '1.18 fecha en palabras ES');
t(so.parseOfferDate('Valid until November 30, 2026', NOW) === '2026-11-30', '1.19 fecha EN');
t(so.parseOfferDate('hasta el 4 de noviembre', NOW) == null, '1.20 fecha sin año ya pasada: no se inventa año');
t(so.parseOfferDate('sin ninguna fecha acá', NOW) == null, '1.21 sin fecha: null');

// ---------- 2. Puerta: qué puede presentarse como vigente ----------
const vigente = so.currentOffer(sheetBF, NOW);
t(!!vigente && vigente.ends_at === '2026-11-30', '2.1 currentOffer: la vigente');
t(so.currentOffer(sheetSinFecha, NOW) == null, '2.2 currentOffer: sin fecha → null');
t(so.currentOffer(sheetVencida, NOW) == null, '2.3 currentOffer: vencida → null');

// ---------- 3. Generación: deriveTopics + buildDemoSpec ----------
// Digest con fundamento real + promo del dueño (ADN) + ficha del estudio.
const cd = req('client-digest.js');
function mkDigest(offerSheet) {
  const d = cd.buildFromParts({
    business: 'Café Luna',
    category: 'cafeteria',
    web: { name: 'Café Luna', description: 'Café de especialidad en Palermo.', services: ['Café de especialidad', 'Medialunas caseras'], city: 'Palermo', palette: [], url: 'https://cafeluna.com' },
    feed: { bio: 'Cafetería en Palermo', captions: ['Nuestro café de especialidad'], name: 'Café Luna', handle: 'cafeluna', pic: '' },
    dna: { promos_activas: [{ nombre: 'Black Friday 20% OFF' }] },
    offerSheet: offerSheet || null,
  });
  return d;
}
const dVigente = mkDigest(sheetBF);
t(dVigente.offerSheet && dVigente.offerSheet.v === 1, '3.1 digest lleva fundamento.offerSheet');
const topicsVigente = cd.deriveTopics(dVigente, { count: 5, category: 'cafeteria', lang: 'es' });
const promoTopic = topicsVigente.find((x) => x && x.kind === 'promo');
t(!!promoTopic, '3.2 promo CON fecha: la semana sí trae pieza promo');
t(promoTopic && promoTopic.offer_ends_at === '2026-11-30', '3.3 pieza promo lleva su fecha de fin', promoTopic && promoTopic.offer_ends_at);
t(promoTopic && /30\/11/.test(String(promoTopic.caption || '')) , '3.4 pieza promo menciona sus términos (fecha en caption)', promoTopic && String(promoTopic.caption || '').slice(0, 120));

const dSinFecha = mkDigest(sheetSinFecha);
const topicsSinFecha = cd.deriveTopics(dSinFecha, { count: 5, category: 'cafeteria', lang: 'es' });
t(!topicsSinFecha.some((x) => x && x.kind === 'promo'), '3.5 promo SIN fecha: NINGUNA pieza promo (clase 531 muerta)');
t(!topicsSinFecha.some((x) => /tiempo limitado/i.test(String((x && x.caption) || ''))), '3.6 promo sin fecha: ningún caption promete urgencia');

const dVencida = mkDigest(sheetVencida);
const topicsVencida = cd.deriveTopics(dVencida, { count: 5, category: 'cafeteria', lang: 'es' });
t(!topicsVencida.some((x) => x && x.kind === 'promo'), '3.7 promo VENCIDA: ninguna pieza promo');

// Sin ficha (digest legacy, estudio nunca corrió): comportamiento histórico.
const dLegacy = mkDigest(null);
const topicsLegacy = cd.deriveTopics(dLegacy, { count: 5, category: 'cafeteria', lang: 'es' });
t(topicsLegacy.some((x) => x && x.kind === 'promo'), '3.8 sin ficha: la promo del dueño sigue (el gate solo actúa con estudio)');

// Precio sin fuente no se menciona: número inventado en un tema promo.
t(so.priceMentionAllowed(dVigente, '$ 12.500') === true, '3.9 precio con fuente en ficha: permitido');
t(so.priceMentionAllowed(dVigente, '$ 99.999') === false, '3.10 precio sin fuente: no permitido');

// Puerta en demo.js (camino real de generación, defensa en profundidad):
// un specPost promo sin oferta vigente se reescribe, nunca sale como promo.
const demo = req('demo.js');
const fakeSp = { kind: 'promo', headline: 'Black Friday 20% OFF', subline: 'Hasta agotar stock', cta: 'Quiero aprovecharla', pill: 'PROMO', text_mode: 'text' };
const fakeTopic = { kind: 'promo', caption: 'Black Friday en Café Luna 🔥\n\nEs por tiempo limitado: cuando se termina, se termina.\n\nEscribinos y te lo reservamos 📩' };
const sanit = so.sanitizePromoPost(fakeSp, fakeTopic, dSinFecha, NOW);
t(sanit.post.kind !== 'promo', '3.11 demo-gate: promo sin fecha → el posteo deja de ser promo', sanit.post.kind);
t(!/tiempo limitado/i.test(String(sanit.topic.caption || '')), '3.12 demo-gate: el caption pierde la urgencia');
const sanitOk = so.sanitizePromoPost(fakeSp, fakeTopic, dVigente, NOW);
t(sanitOk.post.kind === 'promo', '3.13 demo-gate: promo con fecha vigente → pasa intacta');

// buildDemoSpec end-to-end: sin fecha, ningún specPost promo.
const specSin = demo.buildDemoSpec({ business: 'Café Luna', category: 'cafeteria', country: 'AR', tone: 'vos', goal: '', accent: '#2793C8', btn: '#FEC14D', count: 5, bioText: '', digest: dSinFecha, lang: 'es' });
t(Array.isArray(specSin.specPosts) && specSin.specPosts.length === 5, '3.14 buildDemoSpec arma 5 piezas');
t(!specSin.specPosts.some((p) => p && p.kind === 'promo'), '3.15 buildDemoSpec sin fecha: cero piezas promo');
const specVig = demo.buildDemoSpec({ business: 'Café Luna', category: 'cafeteria', country: 'AR', tone: 'vos', goal: '', accent: '#2793C8', btn: '#FEC14D', count: 5, bioText: '', digest: dVigente, lang: 'es' });
t(specVig.specPosts.some((p) => p && p.kind === 'promo'), '3.16 buildDemoSpec con fecha: la pieza promo existe');

// Los términos sobreviven al gate de captions: appendOfferTerms repone
// la fecha DESPUÉS del caption gateado, sin duplicarla.
const capConFecha = demo.appendOfferTerms('Black Friday en Café Luna 🔥\n\nEscribinos 📩', { kind: 'promo', offer_ends_at: '2026-11-30' }, 'es');
t(/30\/11\/2026/.test(capConFecha), '3.17 appendOfferTerms: la fecha vuelve al caption final');
t(demo.appendOfferTerms(capConFecha, { kind: 'promo', offer_ends_at: '2026-11-30' }, 'es') === capConFecha, '3.18 appendOfferTerms: no duplica la fecha');
t(demo.appendOfferTerms('Hola', { kind: 'novedad', offer_ends_at: '2026-11-30' }, 'es') === 'Hola', '3.19 appendOfferTerms: solo piezas promo');
t(/November 30, 2026/.test(demo.appendOfferTerms('Sale!', { kind: 'promo', offer_ends_at: '2026-11-30' }, 'en')), '3.20 appendOfferTerms: fecha en inglés');

// ---------- 4. Corrección del cliente (palabra del dueño) ----------
const corr = so.applyClientCorrection(sheetSinFecha, { campo: 'promo_ends_at', titulo: '2x1 en cafés', ends_at: '2026-12-20' }, NOW);
t(corr.ok === true, '4.1 corrección aceptada', corr.error || '');
const corrPromo = (corr.sheet.promos || [])[0] || {};
t(corrPromo.ends_at === '2026-12-20' && corrPromo.vigente === true, '4.2 corrección pone fecha y la promo pasa a vigente');
t(corrPromo.fuente === 'dueno' && corrPromo.corregido_por_cliente === true, '4.3 corrección marcada fuente=dueno');
t(Array.isArray(corr.sheet.correcciones_cliente) && corr.sheet.correcciones_cliente.length === 1
  && corr.sheet.correcciones_cliente[0].origen === 'dueno', '4.4 corrección queda en correcciones_cliente con origen dueno');
const dCorr = mkDigest(corr.sheet);
const topicsCorr = cd.deriveTopics(dCorr, { count: 5, category: 'cafeteria', lang: 'es' });
t(topicsCorr.some((x) => x && x.kind === 'promo'), '4.5 generación usa la corrección del cliente (promo vuelve)');
const corrBad = so.applyClientCorrection(sheetSinFecha, { campo: 'promo_ends_at', titulo: '2x1 en cafés', ends_at: 'no-una-fecha' }, NOW);
t(corrBad.ok === false, '4.6 fecha inválida: corrección rechazada, ficha intacta');

// Re-estudio (mejora 6) respeta la corrección: el fresco sin fecha no la pisa.
const merged = so.mergeOfferSheet(sheetSinFecha, corr.sheet, NOW);
const mergedPromo = (merged.promos || [])[0] || {};
t(mergedPromo.ends_at === '2026-12-20' && mergedPromo.vigente === true, '4.7 re-estudio respeta la corrección del cliente');
t((merged.correcciones_cliente || []).length === 1, '4.8 el merge conserva el registro de correcciones');

// applyDeepBlocks preserva la ficha y sus correcciones.
const stored = mkDigest(corr.sheet);
const fresh = mkDigest(sheetSinFecha);
const mergedDigest = cd.applyDeepBlocks(stored, fresh);
t(mergedDigest.offerSheet && (mergedDigest.offerSheet.promos || [])[0]
  && mergedDigest.offerSheet.promos[0].ends_at === '2026-12-20', '4.9 applyDeepBlocks: el refresco no pisa la ficha corregida');

// ---------- 5. Cableado servidor + UI ----------
// buildTrialDigest acepta offerSheet (server.js lo pasa a buildFromParts).
const SRV = read('server.js');
t(/offerSheet/.test(SRV) && /study-offer/.test(SRV), '5.1 server.js cablea study-offer + offerSheet');
t(/\/api\/trial\/offer-correct/.test(SRV), '5.2 endpoint POST /api/trial/offer-correct');
t(/offer_sheet/.test(SRV), '5.3 prefill/web-prefill devuelven offer_sheet');
const PR = read('public/prueba.html');
const EPR = read('public/en-prueba.html');
t(/offerSheetCard/.test(PR) && /renderOfferSheet/.test(PR), '5.4 /prueba muestra la ficha (tarjeta + render)');
t(/offerSheetCard/.test(EPR) && /renderOfferSheet/.test(EPR), '5.5 en-prueba espeja la ficha (paridad ES+EN)');
t(/offer-correct/.test(PR) && /offer-correct/.test(EPR), '5.6 ambas fichas corrigen con un toque (POST offer-correct)');
t(/digest\.offerSheet|offerSheet/.test(read('client-digest.js')), '5.7 client-digest guarda fundamento.offerSheet');
t(/study-offer/.test(read('demo.js')), '5.8 demo.js usa la puerta de study-offer');

console.log(`\n${okN} pasaron, ${badN} fallaron.`);
process.exit(badN ? 1 : 0);
