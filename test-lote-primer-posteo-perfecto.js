// test-lote-primer-posteo-perfecto.js
// LOTE PRIMER-POSTEO-PERFECTO — la vara completa del primer posteo
// (orden de Valentino 13/11 15:49: «es importantisimo el primer posteo
// que ven los clientes» · «tiene que ser perfecto») + addendums 1–7:
//   1 logo vía prompt (superseded en el mecanismo por el 7) · 2 LA
//   INSIGNIA (sin nombres propios, la foto califica por visión) · 3A
//   el transitorio no es el póster disfrazado · 3B puerta de precios
//   (diseño de la auditoría de origen: el $199 de Jeni's era real pero
//   de suscripción y sin calificador) · 4 perfección antes que
//   velocidad (la regla <30 s queda SIN EFECTO para el slot 0) · 5
//   LOGO SIEMPRE (regla absoluta, toda imagen) · 6A alcance de semana
//   entera · 6B una suscripción no es la estrella · 6C la clase de
//   fragmento también al arranque · 7 MÉTODO HÍBRIDO (escena por
//   prompt + logo REAL sellado desde su archivo).
// Se corre desde la raíz del release:
//   DATA_DIR=$(mktemp -d) NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-primer-posteo-perfecto.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DEMO = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const DEMOAI = fs.readFileSync(path.join(ROOT, 'demo-ai.js'), 'utf8');
const DIGEST_SRC = fs.readFileSync(path.join(ROOT, 'client-digest.js'), 'utf8');

const clientDigest = require('./client-digest');
const demoAi = require('./demo-ai');
const generator = require('./generator');
const demo = require('./demo');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }

/* ── A · LA CLASE DE TEXTO (pieza 4 + addendum 6C) ───────────────── */
console.log('\n[A] Clase de texto: subordinante colgante y arranque con fragmento');
{
  // Los dos textos exactos de la auditoría Veja #7 (posteo 659).
  eq(clientDigest.enSpliceLint('Try Salar, where today', ['Salar']), true, 'A1 «Try Salar, where today» frenado (nombre cortado con subordinante)');
  eq(clientDigest.enHangingTail('Salar, where'), 'where', 'A2 «Salar, where» — la cola colgante es la subordinante');
  eq(clientDigest.trimFunctionTail('Salar, where'), 'Salar', 'A3 el recorte deja el nombre limpio, sin coma colgando');
  const cap659 = 'Salar, where ✨\n\nMade our way.\n\nOrder yours today by DM 📩';
  eq(generator.captionPassesEn(cap659, { business: 'VEJA' }).ok, false, 'A4 la caption exacta del posteo 659 no pasa la puerta EN');
  const capBuena = 'Salar, back in stock ✨\n\nHandmade with recycled materials.\n\nOrder yours today by DM 📩';
  eq(generator.captionPassesEn(capBuena, { business: 'VEJA' }).ok, true, 'A5 una caption completa y sana pasa');
  eq(clientDigest.enSpliceLint('Try Salar today', ['Salar']), false, 'A6 «Try Salar today» no es fragmento');
  eq(clientDigest.enSpliceLint('Shake well before.', []), false, 'A7 «Shake well before.» (oración completa) no es falso positivo');
  // (ADDENDUM 6C) El fragmento también al ARRANQUE (posteo 666 de Jeni's).
  eq(clientDigest.enSpliceLint("From, another favorite at Jeni's…", []), true, 'A8 «From, another favorite…» frenado al arranque (enSpliceLint)');
  const cap666 = "From, another favorite at Jeni's ✨\n\nSmall-batch scoops, made fresh.\n\nOrder yours today by DM 📩";
  eq(generator.captionPassesEn(cap666, { business: "Jeni's" }).ok, false, 'A9 la caption que arranca con fragmento no pasa la puerta EN');
  // El detalle de fallback SIN SUJETO ya no se produce.
  const dgFallback = clientDigest.buildFromParts({ business: 'Taller Andante', category: 'servicios', web: { name: 'Taller Andante', description: '', services: ['Cambio de aceite', 'Alineación y balanceo'] }, feed: { bio: '', captions: [], name: 'Taller Andante', handle: 'taller', pic: '' }, form: { description: '' }, catalog: null, bioLink: null });
  const wowFb = clientDigest.deriveFirstPostWow(dgFallback, { category: 'servicios', lang: 'en' });
  ok(wowFb && !/Made our way\./.test(wowFb.caption || '') && /We make it our way\./.test(wowFb.caption || ''), 'A10 el detalle de fallback tiene sujeto («We make it our way.»)', wowFb && wowFb.caption);
}

/* ── B · FORMA VEJA (mapa vacío / packshots de otro modelo) ─────── */
console.log('\n[B] Forma Veja: la estrella manda y el slot 0 jamás es placa');
{
  const dg = clientDigest.buildFromParts({
    business: 'VEJA', category: 'moda',
    web: { name: 'VEJA', description: 'Sneakers en matériaux naturels et recyclés.', services: ['Esplar Leather White', 'V-10 Leather Extra White', 'Condor 2 Alveomesh'] },
    feed: { bio: '', captions: ['The Salar is back in stock.', 'Salar, our most loved style.', 'Everyone is asking for the Salar this week.'], name: 'VEJA', handle: 'veja', pic: '' },
    form: { description: '' },
    catalog: null, bioLink: null, photoEntries: null, brandPresence: null,
  });
  const spec = demo.buildDemoSpec({ business: 'VEJA', category: 'moda', country: 'US', tone: 'vos', photoPath: null, goal: '', goal_key: '', accent: '#8A6D4B', btn: '#3B2F2F', count: 5, bioText: 'Sneakers sustentables.', profilePicPath: '/media/veja-perfil.jpg', feedRegister: null, extraPhotos: [], digest: dg, lang: 'en', trialNoStock: true, draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null });
  const rec = spec.primer_posteo;
  ok(!!rec, 'B1 el spec trae el registro del gate de mostrar (spec.primer_posteo)');
  ok(rec && rec.estrella && rec.estrella.tema_final && clientDigest.sameItemName(rec.estrella.tema_final, 'Salar'), 'B2 el tema del slot 0 ES la estrella validada (Salar)', rec && rec.estrella);
  eq(spec.specPosts[0].photo_source, 'brand-poster', 'B3 sin foto real de la estrella, el ganador interno es el póster (dato interno)');
  eq(demo.firstPostNeedsGeneratedImage(spec), true, 'B4 el disparador del rescate generado detecta el póster');
  ok(rec && rec.veredicto && rec.veredicto.cadena === 'generada' && rec.veredicto.motivos.includes('placa-no-es-salida') && rec.veredicto.pasa === false, 'B5 el gate NO pasa con placa: la cadena es la generada', rec && rec.veredicto);
  ok(rec && rec.logo && rec.logo.requerido === true && rec.logo.metodo === 'hibrido-sello-real', 'B6 el registro exige el logo por el método híbrido', rec && rec.logo);
}

/* ── C · FORMA MEJURI (estrella nula → insignia, sin tema genérico)  */
console.log('\n[C] Forma Mejuri: sin estrella por nombre, manda la insignia');
{
  const dg = clientDigest.buildFromParts({
    business: 'Mejuri', category: 'joyeria',
    web: { name: 'Mejuri', description: 'Fine jewelry for every day.', services: [] },
    feed: { bio: '', captions: ['New drops every Monday.', 'Stack your favorites.'], name: 'Mejuri', handle: 'mejuri', pic: '' },
    form: { description: '' },
    catalog: null, bioLink: null, photoEntries: null, brandPresence: null,
  });
  dg.dueno = { estrella: null, mas_vendido: 'aros tubo de oro' };
  const ins = clientDigest.insigniaOf(dg);
  ok(ins && ins.frase === 'aros tubo de oro' && ins.fuente === 'dueno', 'C1 la insignia sale de la respuesta del dueño (Q1)', ins);
  const spec = demo.buildDemoSpec({ business: 'Mejuri', category: 'joyeria', country: 'US', tone: 'vos', photoPath: null, goal: '', goal_key: '', accent: '#8A6D4B', btn: '#3B2F2F', count: 5, bioText: 'Fine jewelry.', profilePicPath: '/media/mejuri-perfil.jpg', feedRegister: null, extraPhotos: [], digest: dg, lang: 'en', trialNoStock: true, draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null });
  const t0 = spec.topics[0] || {};
  ok(t0._insignia === 1 && t0.digest_anchor === 'aros tubo de oro', 'C2 el slot 0 se ancla a la insignia, no a un tema genérico', { anchor: t0.digest_anchor, ins: t0._insignia });
  ok(!/tube medium hoops/i.test(String(t0.headline || '') + ' ' + String(t0.digest_anchor || '')), 'C3 el síntoma «tube medium hoops» no aparece como tema');
  const rec = spec.primer_posteo;
  ok(rec && rec.estrella.modo === 'insignia' && rec.estrella.fuente === 'insignia:dueno', 'C4 el registro marca el modo insignia y su fuente', rec && rec.estrella);
}

/* ── D · GASTRONOMÍA SIN NOMBRES PROPIOS (la foto califica por visión) */
console.log('\n[D] Insignia gastronómica: la foto gana por imagen, sin cruce de nombres');
{
  const topicIns = { headline: 'Milanesas con fritas', caption: '', digest_anchor: 'milanesas con fritas', _insignia: 1 };
  const pool = [
    { path: '/media/foto-generica.jpg', producto: 'Ensalada César', temas: [], marca_visible: false },
    { path: '/media/foto-insignia.jpg', producto: 'Milanesa a la napolitana con papas fritas', temas: [], marca_visible: true },
  ];
  const pick = demo.pickFirstPostCandidates({ topic: topicIns, webPool: pool, used: new Set(), profilePicPath: '/media/perfil.jpg', ctx: {} });
  ok(pick && pick.winner === 'a' && pick.a && pick.a.photo_source === 'real-insignia' && pick.a.photo === '/media/foto-insignia.jpg', 'D1 la foto etiquetada por VISIÓN con la insignia gana (ningún nombre cruza exacto)', pick && pick.a);
  const rec = demo.primerPosteoGate({ star: 'milanesas con fritas', starSource: 'insignia:dueno', modo: 'insignia', temaFinal: 'milanesas con fritas', headline: 'Milanesas con fritas', caption: 'Las de siempre, recién hechas.', lang: 'es', photoSource: 'real-insignia', brandVisible: true, dominante: 'foto', formatoSlot0: 'foto', category: 'comida' });
  ok(rec.veredicto.pasa === true && rec.foto.cadena === 'foto-real' && rec.foto.via === 'vision-insignia', 'D2 el gate pasa con la foto de la insignia y registra la vía visión', rec.veredicto);
}

/* ── E/F · FOTO REAL DE LA ESTRELLA: con logo gana · sin logo no ── */
console.log('\n[E/F] Foto real de la estrella: el logo decide');
{
  const base = { star: 'Salar', starSource: 'inferred', temaFinal: 'Salar', headline: 'Try Salar today', caption: 'The one everyone asks for.', lang: 'en', dominante: 'foto', formatoSlot0: 'foto', category: 'moda' };
  const conLogo = demo.primerPosteoGate({ ...base, photoSource: 'real-product-brand', brandVisible: true });
  ok(conLogo.veredicto.pasa === true && conLogo.foto.cadena === 'foto-real' && conLogo.logo.estado === 'en-escena', 'E1 foto real con la marca en escena: pasa por la cadena foto-real', conLogo.veredicto);
  const sinLogo = demo.primerPosteoGate({ ...base, photoSource: 'real-product', brandVisible: false });
  ok(sinLogo.veredicto.pasa === false && sinLogo.veredicto.motivos.includes('logo-ausente') && sinLogo.foto.cadena === 'integracion-o-generada', 'F1 foto real SIN logo: no se muestra — entra a integración/generación', sinLogo.veredicto);
  const genSinQa = demo.primerPosteoGate({ ...base, photoSource: 'ai-generated' });
  ok(genSinQa.logo.estado === 'sellado-pendiente-de-qa', 'F2 la generada sin QA del logo queda pendiente de verificación (no es un pase)', genSinQa.logo);
}

/* ── G · EL PROMPT HÍBRIDO (addendum 7) ──────────────────────────── */
console.log('\n[G] Prompt de la escena: soporte listo, sin logo dibujado');
{
  const p = demo.buildNoPhotoBrandPrompt({ business: "Jeni's", category: 'heladeria', subcat: null, paletteHex: ['#112233'], paletteNames: null, description: 'Ice cream shop.', star: 'Salty Caramel Pint' });
  ok(/clean, empty and fully visible/.test(p), 'G1 el prompt deja el soporte limpio y vacío, listo para el logo real');
  ok(/do NOT draw any logo/i.test(p), 'G2 el prompt prohíbe dibujar el logo (lo sella el archivo real)');
  ok(/cup sleeve|paper bag|packaging|shop sign/.test(p), 'G3 el soporte natural del rubro viaja en el prompt', p.split('\n').slice(-3).join(' | '));
  eq(count(p, 'reads exactly'), 0, 'G4 la integración solo-por-prompt del addendum 1 quedó superseded');
  ok(/Salty Caramel Pint/.test(p), 'G5 la estrella protagoniza la escena');
}

/* ── H · QA DEL LOGO (aceptación de los addendums 5/7) ───────────── */
console.log('\n[H] QA del logo: deformado no pasa · correcto pasa · sin visión no pasa');
{
  const malo = demoAi.parseLogoQaContent(JSON.stringify({ logo_presente: true, integrado: false, legible: false, texto_visto: 'J3ni5', detalle: 'letras deformadas' }));
  ok(malo && malo.ok === false, 'H1 logo deformado/mal escrito → no pasa', malo);
  const bueno = demoAi.parseLogoQaContent(JSON.stringify({ logo_presente: true, integrado: true, legible: true, texto_visto: "Jeni's", detalle: 'envuelto en la pinta' }));
  ok(bueno && bueno.ok === true, 'H2 logo presente, integrado y legible → pasa', bueno);
  eq(demoAi.parseLogoQaContent('basura sin json'), null, 'H3 respuesta ilegible → null (nunca un pase)');
  const dir = demoAi.logoQaRetryDirective(malo, "Jeni's");
  ok(/FLAT, FRONT-FACING/.test(dir) && /real logo file is integrated/.test(dir) && /do not draw any logo/i.test(dir), 'H4 la directiva de reintento pide un soporte más plano y recuerda que el logo real se sella después', dir);
  ok(count(DEMOAI, "'--logo'"), 1, 'H5 compositeDemoPiece pasa --logo al composite (el sello del pipeline)');
}

/* ── I · PUERTA DE PRECIOS (addendum 3B + auditoría de origen) ───── */
console.log('\n[I] Puerta de precios: fuente, atribución y calificador');
{
  const dg = { business: "Jeni's", productos: [{ nombre: 'Salty Caramel Pint', precio: '$12.00' }, { nombre: 'Pint Club', precio: '$199.00' }], servicios: [], offerSheet: { productos: [], precios: [{ precio: '$199.00', contexto: 'Pint Club suscripción 3 meses' }] }, bio_link: null };
  const sinFuente = clientDigest.priceGateAnalyze('Yours for $45.00 today.', dg, 'Salty Caramel Pint');
  ok(sinFuente.ok === false && sinFuente.sin_fuente.length === 1, 'I1 precio fuera de los números del digest → frenado', sinFuente);
  const deOtro = clientDigest.priceGateAnalyze('Yours for $199.00, just like you see it.', dg, 'Salty Caramel Pint');
  ok(deOtro.ok === false && deOtro.sin_fuente.length === 1, 'I2 el precio de OTRO ítem pegado a este → frenado (atribución)', deOtro);
  const pelado = clientDigest.priceGateAnalyze('Yours for $199.00, just like you see it.', dg, 'Pint Club');
  ok(pelado.ok === false && pelado.sin_calificador.length === 1, 'I3 el precio de suscripción afirmado pelado → frenado (sin calificador)', pelado);
  const calificado = clientDigest.priceGateAnalyze('Yours for $199.00 — suscripción 3 meses.', dg, 'Pint Club');
  ok(calificado.ok === true, 'I4 el mismo precio CON su calificador real → pasa', calificado);
  const strip = clientDigest.stripPriceSentences("Try the Salty Caramel Pint ✨\n\nYours for $199.00, just like you see it.\n\nOrder yours today by DM 📩", clientDigest.sourcedPricesOf(dg, 'Salty Caramel Pint'), (v) => clientDigest.priceQualifierOf(dg, 'Salty Caramel Pint', v));
  ok(strip.quitados.length === 1 && !/\$199/.test(strip.text) && /Order yours today/.test(strip.text), 'I5 el strip saca la oración del precio y conserva el resto del caption', strip);
  // El parseo laxo de parsePrice quedó cortado (auditoría, precisión 2).
  const dgPrecios = clientDigest.buildFromParts({ business: 'Tienda', category: 'ropa', web: { name: 'Tienda', description: '', services: ['Remera $500 OFF', 'Pizza grande $1.200'] }, feed: { bio: '', captions: [], name: 'Tienda', handle: 'tienda', pic: '' }, form: { description: '' }, catalog: null, bioLink: null });
  const items = (dgPrecios.productos || []).map((x) => x.nombre + '|' + (x.precio || ''));
  ok(items.some((s) => s.startsWith('Remera $500 OFF|')), 'I6 «Remera $500 OFF» ya no promueve el $ del nombre a precio', items);
}

/* ── J · UNA SUSCRIPCIÓN NO ES LA ESTRELLA (addendum 6B) ─────────── */
console.log('\n[J] Guarda de la estrella: la suscripción redirige al producto real');
{
  const capsJ = ['Join the Pint Club: three months of pints at your door.', 'Pint Club members taste the new flavor first.', 'The Pint Club is the gift everyone asks for.'];
  const dg = clientDigest.buildFromParts({ business: "Jeni's", category: 'heladeria', web: { name: "Jeni's", description: 'Ice cream shop.', services: ['Salty Caramel Pint', 'Pint Club'] }, feed: { bio: '', captions: capsJ, name: "Jeni's", handle: 'jenis', pic: '' }, form: { description: '' }, catalog: null, bioLink: null, starSignals: { metrics: capsJ.map((c) => ({ text: c, likes: 50, comments: 5 })) } });
  const wow = clientDigest.deriveFirstPostWow(dg, { category: 'heladeria', lang: 'en' });
  ok(wow && wow.digest_anchor === 'Salty Caramel Pint' && String(wow._star_rechazada || '').startsWith('suscripcion:'), 'J1 «Pint Club» se rechaza como estrella y el wow ancla el sabor real', wow && { anchor: wow.digest_anchor, rechazada: wow._star_rechazada });
  ok(wow && !/Pint Club/.test(wow.headline || ''), 'J1b el titular tampoco corona la suscripción (la guarda manda sobre el léxico)', wow && wow.headline);
  eq(clientDigest.isSubscriptionLikeName('Pint Club'), true, 'J2 «Pint Club» es nombre de suscripción');
  eq(clientDigest.isSubscriptionLikeName('Club sandwich'), false, 'J3 «Club sandwich» es un producto, no una suscripción');
}

/* ── K · FORMATO CON GUARDA (pieza 5) ────────────────────────────── */
console.log('\n[K] Formato: dominante video sin video real → foto');
{
  const rec = demo.primerPosteoGate({ star: 'Salar', temaFinal: 'Salar', headline: 'Try Salar today', caption: 'The one everyone asks for.', lang: 'en', photoSource: 'real-product-brand', brandVisible: true, dominante: 'reel', formatoSlot0: 'foto', category: 'moda' });
  ok(rec.veredicto.pasa === true && /video-placa/.test(rec.formato.guarda || ''), 'K1 dominante reel: el slot 0 sale foto y la guarda queda registrada', rec.formato);
  const recV = demo.primerPosteoGate({ star: 'Salar', temaFinal: 'Salar', headline: 'Try Salar today', caption: 'The one everyone asks for.', lang: 'en', photoSource: 'real-product-brand', brandVisible: true, dominante: 'reel', formatoSlot0: 'video', category: 'moda' });
  ok(recV.veredicto.pasa === false && recV.veredicto.motivos.includes('formato-video-placa'), 'K2 un slot 0 en video-placa no pasa el gate', recV.veredicto);
}

/* ── L/M/N · PINS ESTRUCTURALES (semana entera · presencia completa ·
       transitorio honesto · registro en el payload) ─────────────── */
console.log('\n[L/M/N] Pins estructurales sobre server.js y demo.js');
{
  eq(count(SERVER, "20261105-v1020"), 1, 'M0 BUILD v1020 x1 en server.js (re-estampado del aterrizaje v1020)');
  eq(count(SERVER, 'await presenceJob.promise'), 2, 'M1 la presencia se espera COMPLETA en las dos rutas de prueba (pieza 3)');
  ok(count(SERVER, 'espera_completa: true') >= 2, 'M2 la espera completa queda registrada en foto_gate');
  ok(/if \(rescueIdxS\.has\(i\) \|\| \(i === 0 && classifyPromise\)\) return;/.test(SERVER), 'M3 (re-pin del aterrizaje v1020) el evento post de una pieza en rescate se RETIENE: la pieza 5 del lote ILUSTRADA-BAJO-LA-VARA reestructuró la línea a guardia+return con la misma semántica de retención, extendida al slot 0 con la clasificación en vuelo (el póster nunca se emite)');
  ok(count(SERVER, 'armando: true') >= 1 && count(DEMO, 'armando: true') >= 1, 'M4 las piezas sin rescatar salen en armado honesto en las dos superficies (stream y generateDemo)');
  ok(/rescuePieceWithSeal/.test(SERVER) && /qaGeneratedLogo/.test(SERVER), 'M5 la cadena de rescate sella con el logo real y lo verifica (QA del logo)');
  ok(/trialLogoAbsPath\(trialDigest\)/.test(SERVER), 'M6 el logo de la prueba sale del digest (logo-trial) por trialLogoAbsPath');
  ok(/scheduleWeekRescue\(/.test(SERVER), 'M7 el rescate de fondo de la semana está cableado en las rutas');
  ok(count(SERVER, 'ocAns.producto_estrella') >= 2, 'M8 la frase del dueño entra al vocabulario del mapa en las dos rutas (insignia por visión)');
  ok(/videoIdxEnArmado/.test(SERVER), 'M9 una pieza en armado nunca se convierte en video (addendum 6A)');
  ok(count(DEMO, 'armando: true') >= 1 && /rescate_semana/.test(DEMO), 'L1 generateDemo: armado honesto + registro del rescate de semana');
  ok(/primer_posteo: primerPosteo/.test(DEMO) && /primer_posteo: \(spec && spec.primer_posteo\)/.test(SERVER) && /primer_posteo: ppRecS/.test(SERVER), 'N1 el veredicto del gate viaja en el payload de las dos rutas');
  ok(!/timeoutMs \|\| 120000/.test(DEMO), 'M10 sin timeout de 120 s en la generación del slot 0 (addendum 4: perfección antes que velocidad)');
  ok(/logoPath: logoPath \|\| null/.test(DEMO), 'M11 generateDemo compone la generada con el sello del logo real');
}

/* ── O · PANTALLA DE ESPERA (addendum 8 — la vara es el mock v3) ── */
console.log('\n[O] Pantalla de espera aprobada: hitos reales, espejo real, nunca la placa');
{
  const PRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
  const ENPRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');
  ok(/id="fWait"/.test(PRUEBA) && /Lo estoy haciendo bien, no rápido\./.test(PRUEBA), 'O1 ES: la pantalla existe con la línea textual de Posty');
  ok(/LEÍ TU<br>INSTAGRAM/.test(PRUEBA) && /TU<br>ESTRELLA/.test(PRUEBA) && /LA<br>ESCENA/.test(PRUEBA) && /CHEQUEO<br>FINAL/.test(PRUEBA), 'O2 ES: los 4 medallones del mock, en orden');
  ok(/Andá tranquilo/.test(PRUEBA) && /te aviso cuando esté listo/.test(PRUEBA), 'O3 ES: la salida digna del mock');
  ok(/if \(post\.armando \|\| !post\.image\)/.test(PRUEBA), 'O4 ES: una pieza en armado jamás se renderiza como tarjeta (showFirstPostPreview)');
  ok(/ev === 'hito'/.test(PRUEBA) && /lightHito\(d\.hito\)/.test(PRUEBA) && /d\.index === 0/.test(PRUEBA), 'O5 ES: los medallones se encienden por evento hito y la vista previa es solo del índice 0');
  ok(/wMirror" hidden/.test(PRUEBA) && /best_post/.test(PRUEBA), 'O6 ES: el espejo nace oculto y se muestra solo con el dato real (best_post)');
  ok(/now - lastEventAt > L6_FIRST_POST_TIMEOUT_MS/.test(PRUEBA) && !/now - startedAt > L6_FIRST_POST_TIMEOUT_MS/.test(PRUEBA), 'O7 ES: el watchdog frena por silencio, no por reloj (addendum 4)');
  ok(/id="fWait"/.test(ENPRUEBA) && /I'm doing it well, not fast\./.test(ENPRUEBA) && /FINAL<br>CHECK/.test(ENPRUEBA) && /if \(post\.armando \|\| !post\.image\)/.test(ENPRUEBA) && /now - lastEventAt > L6_FIRST_POST_TIMEOUT_MS/.test(ENPRUEBA), 'O8 EN: paridad completa de la pantalla (mock, guarda y watchdog)');
  ok(count(SERVER, "send('hito'") >= 5, 'O9 el servidor emite los hitos reales (ig, estrella, escena y chequeo en sus dos caminos)');
  ok(/send\('hero'/.test(SERVER), 'O10 el héroe del revelado es la foto real del slot 0 (cadena foto-real)');
  const feedAudit = require('./feed-audit');
  const prof = feedAudit.trialProfileFromAudit({ ok: true, profile: { handle: 'cafe', name: 'Café', bio: '', pic: null }, posts: [
    { thumb: 'https://x.cdninstagram.com/a.jpg', caption: 'Medialuna de las 9', likes: 40 },
    { thumb: 'https://x.cdninstagram.com/b.jpg', caption: 'Torta de frutilla', likes: 120 },
    { thumb: 'https://x.cdninstagram.com/c.jpg', caption: 'Sin likes', likes: 0 },
  ] }, null);
  ok(prof && prof.best_post && prof.best_post.likes === 120 && /Torta/.test(prof.best_post.caption), 'O11 el espejo es el posteo con MÁS me gusta, con su foto y su caption', prof && prof.best_post);
  const profSin = feedAudit.trialProfileFromAudit({ ok: true, profile: { handle: 'cafe', name: 'Café', bio: '', pic: null }, posts: [{ thumb: 'https://x.cdninstagram.com/a.jpg', caption: 'Hola', likes: 0 }] }, null);
  ok(profSin && profSin.best_post === null, 'O12 sin dato real (sin likes), no hay espejo: el bloque no se muestra');
}

console.log(`\n== ${pass} ok · ${fail} mal ==`);
if (failures.length) { console.log('FALLOS:\n - ' + failures.join('\n - ')); }
process.exit(fail ? 1 : 0);
