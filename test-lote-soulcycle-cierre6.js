'use strict';
/* Suite LOTE SOULCYCLE-CIERRE-6 (CIERRE 6 de la re-corrida SoulCycle,
 * candidata 1 de 5 del gate, 15/11/2026) — PISO DE LA DUDA.
 * La re-corrida (contra v1104) frenó y preguntó por la estrella,
 * pero la semana igual salió del negocio equivocado: la
 * reconciliación IG↔web nunca existió (digest.reconciliacion: null)
 * porque la clasificación IG dio CONFIANZA 0 (evidencia [],
 * candidatas []) con necesita_pregunta prendido en el cls — y el
 * digest guardó rubro_id.needs_question en FALSE (resolveRubro lo
 * ata a que haya candidatas): sin candidatas no hubo pregunta de
 * rubro posible y la web construyó sola. Y el insumo de la web
 * canónica nunca llegó: el perfil vino con link: '' /
 * link_unread: true — el embed de IG no trae external_url (la
 * lectura muere en la fuente) y nadie reintentó desde otra fuente.
 * Dos partes:
 *  (a) EL LINK SE LEE DE VERDAD: parseProfilePageLink extrae el
 *      link desde la PÁGINA del perfil con la guarda de identidad
 *      de la casa (la misma de parseProfilePageVerified) y
 *      retryProfileLink lo reintenta; la ruta stream lo aplica
 *      ANTES de que el link se consuma (bio-link, web canónica,
 *      fundamento) y si el reintento también falla, la falla queda
 *      registrada (link_reintento_fallo) y viaja al fundamento
 *      (ig_link_unread / ig_link_reintento_fallo): escala como
 *      señal de duda, nunca se salta en silencio.
 *  (b) PISO DE LA DUDA: questionCandidatesOf nace la candidata
 *      sin_senal_ig desde el estado cero del rubro (confianza 0,
 *      sin candidatas, sin evidencia, no segura): pregunta con
 *      opciones AMPLIAS (la afirmación de la web primero si su
 *      texto determina un rubro, presentada como afirmación a
 *      confirmar) y trialQuestionFor la sirve con el texto honesto
 *      ES/EN. Con señal IG sana el piso no nace.
 * Uso: node test-lote-soulcycle-cierre6.js [--no-boot]
 * Control contra la base: LOTE_BASE_DIR=<árbol base v1105>. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
// Las cadenas de require del árbol pueden inicializar la DB en
// ./data relativo al cwd: la suite jamás ensucia el árbol.
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-soulcycle-c6-data-'));

const REL = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.resolve(REL, '..', 'base');
const rubro = require(path.join(REL, 'rubro-id'));
const cd = require(path.join(REL, 'client-digest'));
const fa = require(path.join(REL, 'feed-audit'));
const SERVER_SRC = fs.readFileSync(path.join(REL, 'server.js'), 'utf8');
const APPJS_SRC = fs.readFileSync(path.join(REL, 'public', 'app.js'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(REL, 'public', 'index.html'), 'utf8');
const CD_SRC = fs.readFileSync(path.join(REL, 'client-digest.js'), 'utf8');
const FA_SRC = fs.readFileSync(path.join(REL, 'feed-audit.js'), 'utf8');
const tieneBase = fs.existsSync(path.join(BASE, 'rubro-id.js'));
const rubroB = tieneBase ? require(path.join(BASE, 'rubro-id')) : null;
const cdB = tieneBase ? require(path.join(BASE, 'client-digest')) : null;
const faB = tieneBase ? require(path.join(BASE, 'feed-audit')) : null;
const SERVER_BASE = tieneBase ? fs.readFileSync(path.join(BASE, 'server.js'), 'utf8') : '';
const CD_BASE = tieneBase ? fs.readFileSync(path.join(BASE, 'client-digest.js'), 'utf8') : '';
const APPJS_BASE = tieneBase ? fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8') : '';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function seccion(s) { console.log('\n[' + s + ']'); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }

/* ------------------------------------------------ fixtures */
// La re-corrida reconstruida desde done-out.json / prefill.json de
// ~/workspace/soulcycle-corrida2-15nov: captions reales del feed, los
// servicios reales de la tienda BMX, el perfil sin link leído.
const CAPS_SC = [
  'Warming up for one of our favorite Thanksgiving traditions. 🦃 Turkey Burns are back',
  "It's never just been about the bike 💛 Your people are waiting. It's the final week",
  'The blind box of our bear-y wildest dreams.... (Just for fun 😉)',
  'Palm Beach, we’re coming for you. 🌴 Get ready to clip in at @thecolonypalmbeach',
];
const BMX_SERVICES = [
  'BMX Wheel Building (Custom Wheel Build )', 'Rotor Set Install', 'Bars Cutting',
  'General BMX Maintenance', 'HALLOWEEN RIDE-OUT 2026 💀', 'KINK 2027 COLLECTION',
  'WHEELS OF STEEL', 'NEW PRODUCTS FROM CULT&FRIENDS',
];
const WEB_BMX = { name: 'soulcyclebmx', description: 'Soulcycle is a BMX shop in Amsterdam', services: BMX_SERVICES, url: 'https://soulcycle.com/' };

function clsCorrida(mod) {
  // El voto combinado TAL CUAL lo corre resolveTrialRubro en la
  // generación: feed real + web BMX + formulario.
  return mod.classifyBusiness({
    jsonldType: '', catalogText: BMX_SERVICES.join(' · '),
    webText: 'soulcyclebmx Soulcycle is a BMX shop in Amsterdam',
    bio: '', fullName: 'SoulCycle', handle: 'soulcycle', captions: CAPS_SC, igCategory: '',
    formText: 'SoulCycle',
  });
}
function digestCorrida(mod, cdm, igLink) {
  const res = mod.resolveRubro({ cls: clsCorrida(mod), lang: 'en' });
  return cdm.buildFromParts({
    business: 'SoulCycle', category: res.category, rubroId: res.rubroId,
    web: WEB_BMX,
    feed: { bio: '', captions: CAPS_SC, name: 'SoulCycle', handle: 'soulcycle' },
    reconciliacion: null,
    ...(igLink ? { igLink } : {}),
  });
}
// Páginas de perfil sintéticas para el parser del link.
const PAGE_LINK_PLANO = '<html><head></head><body><script type="application/json">{"username":"soulcycle","full_name":"SoulCycle","biography":"Ride with us","external_url":"https://www.soulcycle.com/","is_verified":false,"edge_followed_by":{"count":380618}}</script></body></html>';
const PAGE_LINK_ESCAPADO = '<script>' + JSON.stringify({ username: 'soulcycle', external_url: 'https://soulcycle.com/clases', is_verified: false }).split('"').join('\\"').split('/').join('\\/') + '</script>';
const PAGE_LINK_BIO = '<script>{"username":"soulcycle","bio_links":[{"title":"","url":"https://l.instagram.com/?u=https%3A%2F%2Freservas.soulcycle.com%2Fbook&e=AT123"}],"external_url":null}</script>';
const PAGE_LINK_AJENO = '<script>{"username":"soulcycle","full_name":"SoulCycle","is_verified":false}</script>' + 'x'.repeat(4500) + '<script>{"username":"otra_cuenta","external_url":"https://ajeno.example.com/"}</script>';
const PAGE_SIN_HANDLE = '<script>{"username":"otra_cuenta","external_url":"https://ajeno.example.com/"}</script>';
const PAGE_SIN_LINK = '<script>{"username":"soulcycle","full_name":"SoulCycle","external_url":null,"is_verified":false}</script>';

/* --------------------------------------- A · el link se lee de verdad */
seccion('A · parseProfilePageLink / retryProfileLink — la página del perfil como fuente');
{
  ok(typeof fa.parseProfilePageLink === 'function', 'A1 existe parseProfilePageLink');
  ok(typeof fa.retryProfileLink === 'function', 'A2 existe retryProfileLink');
  ok(fa.parseProfilePageLink(PAGE_LINK_PLANO, 'soulcycle') === 'https://www.soulcycle.com/', 'A3 external_url propio (comillas planas) se lee', fa.parseProfilePageLink(PAGE_LINK_PLANO, 'soulcycle'));
  ok(fa.parseProfilePageLink(PAGE_LINK_ESCAPADO, 'soulcycle') === 'https://soulcycle.com/clases', 'A4 external_url escapado se lee y se desescapa', fa.parseProfilePageLink(PAGE_LINK_ESCAPADO, 'soulcycle'));
  ok(fa.parseProfilePageLink(PAGE_LINK_BIO, 'soulcycle') === 'https://reservas.soulcycle.com/book', 'A5 bio_links envuelto en l.instagram.com se desenvuelve al link real', fa.parseProfilePageLink(PAGE_LINK_BIO, 'soulcycle'));
  ok(fa.parseProfilePageLink(PAGE_LINK_AJENO, 'soulcycle') === null, 'A6 guarda de identidad: el link cuyo username cercano es OTRO no se afirma', fa.parseProfilePageLink(PAGE_LINK_AJENO, 'soulcycle'));
  ok(fa.parseProfilePageLink(PAGE_SIN_HANDLE, 'soulcycle') === null, 'A7 sin el handle en la página: null (no se inventa)', fa.parseProfilePageLink(PAGE_SIN_HANDLE, 'soulcycle'));
  ok(fa.parseProfilePageLink(PAGE_SIN_LINK, 'soulcycle') === null, 'A8 external_url null / sin link: null', fa.parseProfilePageLink(PAGE_SIN_LINK, 'soulcycle'));
}
(async () => {
  const rOk = await fa.retryProfileLink('soulcycle', { pageFetch: async () => PAGE_LINK_PLANO });
  ok(rOk && rOk.link === 'https://www.soulcycle.com/' && rOk.fallo === false, 'A9 reintento con página buena: link recuperado, sin fallo', rOk);
  const rNull = await fa.retryProfileLink('soulcycle', { pageFetch: async () => null });
  ok(rNull && rNull.link === null && rNull.fallo === true, 'A10 reintento sin página (caída/login): la falla queda registrada, no en silencio', rNull);
  const rSin = await fa.retryProfileLink('soulcycle', { pageFetch: async () => PAGE_SIN_LINK });
  ok(rSin && rSin.link === null && rSin.fallo === true, 'A11 reintento con página sin link: fallo registrado (escala como duda)', rSin);
  const rThrow = await fa.retryProfileLink('soulcycle', { pageFetch: async () => { throw new Error('red caída'); } });
  ok(rThrow && rThrow.link === null && rThrow.fallo === true, 'A12 reintento con error de red: fallo registrado, nunca lanza', rThrow);
})().then(() => {

/* --------------------------------------- B · el piso de la duda */
seccion('B · el fundamento registra la señal y la puerta pregunta (re-corrida) / no frena (sano)');
{
  const cls = clsCorrida(rubro);
  ok(cls.rubro === 'otro' && cls.confianza === 0 && cls.candidatas.length === 0 && cls.evidencia.length === 0, 'B1 fidelidad: el voto combinado de la re-corrida dio CERO (otro/0/[]/[])', { rubro: cls.rubro, confianza: cls.confianza, n: cls.candidatas.length });
  ok(cls.necesita_pregunta === true, 'B2 fidelidad: el cls sí traía necesita_pregunta prendido (!segura)', cls.necesita_pregunta);
  const res = rubro.resolveRubro({ cls, lang: 'en' });
  ok(res.rubroId.needs_question === false && res.rubroId.sin_confirmar === true, 'B3 fidelidad: en el digest needs_question quedó FALSE (la señal moría: sin candidatas no hay pregunta)', res.rubroId);

  // El fixture completo: link sin leer + reintento fallido.
  const d = digestCorrida(rubro, cd, { unread: true, reintentoFallo: true });
  ok(d.reconciliacion === null, 'B4 fidelidad: reconciliacion null (sin señal IG no hubo con qué contradecir)', d.reconciliacion);
  ok(d.ig_link_unread === true && d.ig_link_reintento_fallo === true, 'B5 el estado del link VIAJÓ al fundamento (unread + reintento fallido)', { u: d.ig_link_unread, f: d.ig_link_reintento_fallo });
  const candPiso = (d.question_candidates || []).find((c) => c.motivo === 'sin_senal_ig');
  ok(!!candPiso, 'B6 nace la candidata de piso sin_senal_ig', (d.question_candidates || []).map((c) => c.motivo || c.tipo));
  ok(!!candPiso && candPiso.sin_senal && candPiso.sin_senal.link_sin_leer === true && candPiso.sin_senal.link_reintento_fallo === true, 'B7 la candidata registra la señal del link (sin leer + reintento fallido)', candPiso && candPiso.sin_senal);
  ok(!!candPiso && candPiso.sin_senal.web && /BMX shop in Amsterdam/.test(candPiso.sin_senal.web.afirmacion), 'B8 la candidata registra la afirmación de la web (a confirmar, no como hecho)', candPiso && candPiso.sin_senal.web);
  ok(!!candPiso && Array.isArray(candPiso.opciones) && candPiso.opciones.length >= 4 && candPiso.opciones.some((o) => o.rubro === 'fitness'), 'B9 opciones amplias de un toque (incluyen fitness, el rubro real del negocio)', candPiso && candPiso.opciones);
  const idxPiso = (d.question_candidates || []).findIndex((c) => c.motivo === 'sin_senal_ig');
  const idxStar = (d.question_candidates || []).findIndex((c) => c.tipo === 'estrella');
  ok(idxPiso >= 0 && (idxStar < 0 || idxPiso < idxStar), 'B10 el piso va ANTES que la duda de estrella (el rubro es el primer dominó)', { idxPiso, idxStar });

  const q = cd.trialQuestionFor(d, { lang: 'en' });
  ok(!!q && q.tipo === 'rubro' && q.motivo === 'sin_senal_ig', 'B11 la puerta devuelve la pregunta de piso (EN) — pregunta, no fundamento construido', q);
  ok(!!q && /couldn't tell what your business is/i.test(q.texto) && /BMX shop in Amsterdam/.test(q.texto), 'B12 el texto EN dice la verdad: no supimos + la web afirma esto otro', q && q.texto);
  ok(!!q && /couldn't open the link/i.test(q.texto), 'B13 el texto EN nombra el link del perfil sin abrir (la falla escala, no se esconde)', q && q.texto);
  ok(!!q && q.opciones.some((o) => o.rubro === 'fitness' && /Fitness/i.test(o.label)), 'B14 las opciones EN salen rotuladas en inglés', q && q.opciones);
  const qEs = cd.trialQuestionFor(d, { lang: 'es' });
  ok(!!qEs && /No pudimos determinar/.test(qEs.texto) && /tu web dice/.test(qEs.texto) && /Tampoco pudimos abrir el link/.test(qEs.texto), 'B15 el texto ES dice la misma verdad completa', qEs && qEs.texto);
  const qResp = cd.trialQuestionFor(d, { lang: 'en', answered: { rubro: true } });
  ok(qResp === null || qResp.motivo !== 'sin_senal_ig', 'B16 lo respondido/salteado no se repregunta (la puerta respeta la respuesta del dueño)', qResp);

  // Sub-caso: el link sigue ilegible pero el reintento no aplicó
  // (unread sin fallo registrado): el piso nace igual y lo nombra.
  const d2 = digestCorrida(rubro, cd, { unread: true, reintentoFallo: false });
  const q2 = cd.trialQuestionFor(d2, { lang: 'en' });
  ok(!!q2 && q2.motivo === 'sin_senal_ig' && q2.sin_senal.link_sin_leer === true && q2.sin_senal.link_reintento_fallo === false, 'B17 sub-caso link ilegible persistente: el piso nace y la señal distingue unread de reintento fallido', q2 && q2.sin_senal);
  // Sin el dato del link en el fundamento, el piso nace igual del
  // rubro en cero (la duda no depende del link para frenar).
  const d3 = digestCorrida(rubro, cd, null);
  const q3 = cd.trialQuestionFor(d3, { lang: 'en' });
  ok(!!q3 && q3.motivo === 'sin_senal_ig' && q3.sin_senal.link_sin_leer === false && !/open the link/i.test(q3.texto), 'B18 sin el dato del link, el piso nace del rubro en cero y no inventa la frase del link', q3 && q3.texto);

  // Sanos: señal IG presente → el flujo de hoy, sin preguntas nuevas.
  const CAPS_CAFE = ['Espresso de origen único, recién molido', 'Filtrados V60 y Chemex toda la mañana', 'Café en grano de Etiopía, nuevo lote'];
  const resCafe = rubro.resolveRubro({ cls: rubro.classifyBusiness({ bio: 'Café de especialidad en Palermo. Espresso, filtrados y café en grano para tu casa.', fullName: 'Café Andino', handle: 'cafeandino', captions: CAPS_CAFE, igCategory: '' }), lang: 'es' });
  const dSano = cd.buildFromParts({
    business: 'Café Andino', category: resCafe.category, rubroId: resCafe.rubroId,
    web: { name: 'Café Andino', description: 'Café de especialidad. Espresso, filtrados y café en grano de origen.', services: ['Espresso', 'Filtrados', 'Café en grano'], url: 'https://cafeandino.com/' },
    feed: { bio: 'Café de especialidad en Palermo.', captions: CAPS_CAFE.slice(0, 2), name: 'Café Andino', handle: 'cafeandino' },
    igLink: { unread: true, reintentoFallo: true },
  });
  ok(!(dSano.question_candidates || []).some((c) => c.motivo === 'sin_senal_ig'), 'B19 sano: café con señal segura no gana candidata de piso (ni con el link sin leer)', (dSano.question_candidates || []).map((c) => c.motivo || c.tipo));
  const qSano = cd.trialQuestionFor(dSano, { lang: 'es', answered: { rubro: true, estrella: true } });
  ok(qSano === null, 'B20 sano: con lo de siempre respondido, el armado sigue sin preguntas nuevas', qSano);
  // Duda de rubro CON candidatas: la pregunta de siempre, no el piso.
  const dDuda = cd.buildFromParts({
    business: 'Luna', category: 'belleza',
    rubroId: { v: 1, rubro: 'belleza', subrubro: '', confianza: 0.5, candidatas: [{ rubro: 'belleza', subrubro: '', score: 5 }, { rubro: 'moda', subrubro: '', score: 4 }], evidencia: [{ texto: 'uñas', peso: 3 }], fuente: 'deteccion', segura: false, nivel_duda: 'rubro', needs_question: true, sin_confirmar: true },
    feed: { bio: 'Uñas y makeup', captions: ['Uñas esculpidas'], name: 'Luna', handle: 'luna' },
  });
  ok((dDuda.question_candidates || []).some((c) => c.tipo === 'rubro') && !(dDuda.question_candidates || []).some((c) => c.motivo === 'sin_senal_ig'), 'B21 duda con candidatas: nace la pregunta de rubro de siempre, NO el piso (son excluyentes)', (dDuda.question_candidates || []).map((c) => c.motivo || c.tipo));
  // Rubro confirmado por el dueño: jamás piso.
  const resConf = rubro.resolveRubro({ confirmed: { rubro: 'fitness', subrubro: '', fuente: 'pregunta' }, cls: clsCorrida(rubro), lang: 'en' });
  const dConf = cd.buildFromParts({ business: 'SoulCycle', category: resConf.category, rubroId: resConf.rubroId, web: WEB_BMX, feed: { bio: '', captions: CAPS_SC, name: 'SoulCycle', handle: 'soulcycle' }, igLink: { unread: true, reintentoFallo: true } });
  ok(!(dConf.question_candidates || []).some((c) => c.motivo === 'sin_senal_ig'), 'B22 rubro confirmado por el dueño (fuente pregunta): el piso no nace', (dConf.question_candidates || []).map((c) => c.motivo || c.tipo));
}

/* --------------------------------------- C · control contra la base */
seccion('C · control contra la base v1105 (la re-corrida construía en silencio)');
if (tieneBase) {
  ok(typeof faB.parseProfilePageLink !== 'function' && typeof faB.retryProfileLink !== 'function', 'C1 base: no existe la lectura del link desde la página ni su reintento');
  ok(count(CD_BASE, 'sin_senal_ig') === 0 && count(SERVER_BASE, 'retryProfileLink') === 0, 'C2 base: sin candidata de piso ni reintento en el código');
  const dB = digestCorrida(rubroB, cdB, { unread: true, reintentoFallo: true });
  ok(!(dB.question_candidates || []).some((c) => c.motivo === 'sin_senal_ig'), 'C3 base: el fixture de la re-corrida no produce candidata de piso', (dB.question_candidates || []).map((c) => c.motivo || c.tipo));
  ok(dB.ig_link_unread === undefined, 'C4 base: el estado del link ni siquiera viajaba al fundamento', dB.ig_link_unread);
  const qB = cdB.trialQuestionFor(dB, { lang: 'en', answered: { estrella: true } });
  ok(qB === null, 'C5 base: respondida la estrella, NADA frenaba por el rubro — el fundamento se construía desde la web sola (el fallo original)', qB);
  const dR = digestCorrida(rubro, cd, { unread: true, reintentoFallo: true });
  const qR = cd.trialQuestionFor(dR, { lang: 'en', answered: { estrella: true } });
  ok(!!qR && qR.motivo === 'sin_senal_ig', 'C6 release: con la misma respuesta de estrella, el piso SÍ frena y pregunta por el rubro', qR);
} else {
  console.log('  (sin LOTE_BASE_DIR: se salta el control)');
}

/* --------------------------------------- D · cableado y stamps */
seccion('D · cableado en server.js / client-digest / feed-audit y stamps de la cadena');
{
  ok(count(SERVER_SRC, 'feedAudit.retryProfileLink(ig)') === 1, 'D1 la ruta stream reintenta la lectura del link una vez');
  const iRetry = SERVER_SRC.indexOf('feedAudit.retryProfileLink(ig)');
  const iBioLink = SERVER_SRC.indexOf('trialBioLink(trialProfile && trialProfile.link)');
  const iCanon = SERVER_SRC.indexOf('webData = await trialWebCanonica(webData, webRaw, trialProfile && trialProfile.link)');
  ok(iRetry > 0 && iBioLink > iRetry && iCanon > iRetry, 'D2 el reintento corre ANTES de que el link se consuma (bio-link profundo y web canónica)', { iRetry, iBioLink, iCanon });
  ok(count(SERVER_SRC, 'if (!trialProfile) trialProfile = prof;') === 1, 'D3 el perfil completado es el que sigue viaje (trialProfile = prof)');
  ok(count(SERVER_SRC, 'igLinkState: trialProfile ?') === 1 && count(SERVER_SRC, 'igLinkState: igLinkStateSync') === 1, 'D4 el estado del link entra al digest en las DOS rutas (stream y sync)');
  ok(count(SERVER_SRC, 'igLink: igLinkState || null') === 1, 'D5 buildTrialDigest lo pasa a buildFromParts');
  ok(count(SERVER_SRC, 'trialPreguntaGate(trialDigest, fields, ocAns, lang)') === 2, 'D6 la puerta sigue cableada en las DOS rutas');
  ok(count(CD_SRC, 'sin_senal_ig') >= 3, 'D7 client-digest: la candidata de piso y su forma consumible existen', count(CD_SRC, 'sin_senal_ig'));
  ok(count(CD_SRC, 'RUBROS_AMPLIOS_PISO') >= 2 && count(CD_SRC, 'ig_link_unread') >= 2, 'D8 client-digest: opciones amplias + el hecho del link en el fundamento');
  ok(count(FA_SRC, 'function parseProfilePageLink') === 1 && count(FA_SRC, 'async function retryProfileLink') === 1, 'D9 feed-audit: parser y reintento definidos una vez');
  ok(count(SERVER_SRC, "const BUILD_ID = '20261105-v1106'") === 1, 'D10 BUILD_ID v1106');
  ok(count(APPJS_SRC, "const PZ_BUILD = '20261105-v1106'") === 1, 'D11 PZ_BUILD en paridad v1106');
  ok(count(INDEX_SRC, 'app.js?v=752') === 1, 'D12 index ES sirve app.js?v=752');
  if (tieneBase) {
    const defs = (src) => (src.match(/function [A-Za-z_$][A-Za-z0-9_$]*\s*\(/g) || []).sort().join('|');
    ok(defs(APPJS_SRC) === defs(APPJS_BASE), 'D13 funciones auditadas: las definiciones de app.js son idénticas a la base (solo cambió el stamp)');
  }
}

/* --------------------------------------- E · boot */
async function boot() {
  if (process.argv.includes('--no-boot')) { console.log('\n[E · boot] salteado por --no-boot'); return; }
  seccion('E · boot aislado del árbol final');
  const PORT = 34576;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-soulcycle-c6-boot-'));
  const nmSnapshot = path.join(os.homedir(), 'workspace', 'posta', 'node_modules');
  const nodePath = process.env.NODE_PATH || (fs.existsSync(nmSnapshot) ? nmSnapshot : '');
  const server = spawn('node', ['server.js'], {
    cwd: REL,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NODE_ENV: 'development', ...(nodePath ? { NODE_PATH: nodePath } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logBuf = '';
  server.stdout.on('data', (d) => { logBuf += d; });
  server.stderr.on('data', (d) => { logBuf += d; });
  const getJson = async (p) => {
    const r = await fetch('http://127.0.0.1:' + PORT + p);
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      try { const v = await getJson('/api/version'); up = v.status === 200; } catch (e) { /* todavía no */ }
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    ok(up, 'E1 el servidor levanta en el puerto aislado', logBuf.slice(-300));
    if (up) {
      const v = await getJson('/api/version');
      ok(v.body && v.body.build === '20261105-v1106', 'E2 /api/version del boot = v1106', v.body);
      const f = await getJson('/api/founders');
      ok(f.status === 200 && f.body && f.body.ok === true, 'E3 /api/founders responde 200 en el boot (sin regresión)', f);
    }
  } finally {
    try { server.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
    try { if (!server.killed) server.kill('SIGKILL'); } catch (e) {}
  }
}

boot().then(() => {
  console.log(`\n== test-lote-soulcycle-cierre6: ${pass} ok · ${fail} mal ==`);
  if (failures.length) console.log('fallaron:', failures.join(' | '));
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error('ERROR test:', e); process.exit(1); });
});
