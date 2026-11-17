'use strict';
/* ════════════════════════════════════════════════════════════════════
 * LOTE SALTEO-RESUELVE — suite propia (2026-11-16)
 * Orden del tablero tras las corridas ×10 #5 y #6 de la noche.
 *
 * EL CASO (corrida #5, @adaptationfloraldesign, invitado 118): la
 * duda de conflicto de identidad (IG ↔ website «no describen el
 * mismo negocio») ofreció una sola opción — el rubro minado erróneo
 * del lado IG, «Food / Restaurant» para una florería — más el salteo
 * («skip it and I'll build with what I already know»). El ejecutor
 * salteó, como haría el dueño. Resultado: el invitado quedó con 0
 * posteos, identidad vacía y el Inicio en «Posty is finishing your
 * week» para siempre, con la pieza a mano cargada en su payload.
 *
 * MECANISMO (reproducido acá de punta a punta): el salteo viaja como
 * fields.pregunta_rubro='skip' (ambos frentes) y su ÚNICO consumidor
 * en el servidor era trialPreguntaGate (para no repreguntar). En
 * resolveTrialRubro — donde nace digest.reconciliacion — el salteo
 * no existía: la rama que lo esperaba leía rubro_src='skip', un
 * valor que ningún frente manda jamás. La contradicción quedaba en
 * pie sin resuelta_por y el guarda trialFundamentoContradice
 * (DESTRABE A4, intacto) frenaba importTrialWeek en 0 en cada
 * gatillo (la corrida 3, que RESPONDIÓ la misma duda, importó; la 4,
 * sin contradicción, importó; la 5 salteó y murió).
 *
 * EL ARREGLO (una sola costura, resolveTrialRubro): si el reenvío
 * trae el salteo de la duda de rubro Y hay una contradicción IG↔web
 * en pie, la identidad se resuelve con la clasificación del lado
 * WEBSITE (webCls, ya calculado en la misma función): el rubro
 * minado del lado IG se descarta, rubro_id.fuente queda 'skip' y la
 * contradicción queda estampada resuelta_por='salteo-web' — marca
 * propia, auditable, distinta de la palabra del dueño
 * ('confirmacion'). El payload guardado nace resuelto. El guarda NO
 * se toca: sin salteo ni confirmación, la contradicción frena igual.
 *
 * LOS TRES MUNDOS (fixtures forma-corrida-5):
 *  A · conflicto + SALTEO → importa; identidad = lado website; la
 *      contradicción queda registrada con resuelta_por 'salteo-web';
 *      el rubro minado del IG no sobrevive. [FIX]
 *  B · conflicto SIN confirmación y SIN salteo (payload crudo, el
 *      mundo de la corrida 7: las dudas jamás se tocaron) → la
 *      importación sigue en 0. La guarda intacta.
 *  C · conflicto + CONFIRMACIÓN del dueño (fuente pregunta/form) →
 *      importa como hoy, sin cambios.
 *
 * CENSO CORRIDA #6 (@acappellabooks, invitado 119) — DECLARADO, NO
 * CUBIERTO: su duda vino en la forma regular («Is your business
 * Fashion / Clothing store?», la candidata de rubro sin confirmar,
 * NO la de contradicción) y consume el MISMO field de salteo
 * (pregunta_rubro='skip': el frente no distingue el motivo, solo el
 * tipo 'rubro'). Pero su digest NO trae reconciliación (B14: la
 * clasificación del IG no determina nada — «vintage» en los captions
 * de una librería vota moda con score 2, bajo la barra de
 * determinación — y reconcileSources devuelve null): no hay registro
 * donde estampar. Su freno es OTRA rama del mismo guarda: la de
 * CONTENIDO (B15: payload.category='moda' sin confirmar contra la
 * oferta web de la librería → 'contenido-web_no_encaja'). Es una
 * segunda superficie: este lote no la toca; el tablero decide.
 *
 * SEGUNDA CARA (las opciones de la duda de conflicto) — DECLARADA:
 * questionCandidatesOf (client-digest.js) SÍ ofrece el rubro del
 * lado website cuando reconciliacion.web.rubro está determinado;
 * en la corrida 5 no estaba (motivo web_no_encaja: la clasificación
 * web en inglés de una florería no alcanza la barra de
 * determinación de rubroDeterminado), así que la duda salió con la
 * única opción del IG. Construir esa opción vive en
 * client-digest.js (questionCandidatesOf/trialQuestionFor), no en
 * la costura del salteo: no se toca en este lote.
 *
 * Correr:  node test-lote-salteo-resuelve.js [--no-boot]
 * Control prístino (v1146): copiar esta suite al árbol base y
 * correrla — los checks [FIX] del mundo A caen (la importación del
 * salteo queda en 0); los mundos B y C y los censos pasan igual.
 * ════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
// Las cadenas de require del árbol pueden inicializar la DB en
// ./data relativo al cwd: la suite jamás ensucia el árbol.
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-salteo-data-'));

const ROOT = __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const PRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
const ENPRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { DatabaseSync = null; }

let pass = 0, fail = 0;
const failures = [];
function ok(cond, nombre, extra) {
  if (cond) { pass++; console.log('  ✓ ' + nombre); }
  else { fail++; failures.push(nombre); console.log('  ✗ ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ']'); }
function seccion(t) { console.log('\n== ' + t); }

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/* ── A · Censo de cableado ───────────────────────────────────────── */
function seccionA() {
  seccion('A · censo de cableado (fuente)');
  const iR = SERVER.indexOf('function resolveTrialRubro(');
  const cuerpoR = iR >= 0 ? SERVER.slice(iR, iR + 9000) : '';
  ok(cuerpoR.includes("String(f.pregunta_rubro || '') === 'skip'") && cuerpoR.includes("resuelta_por: 'salteo-web'"),
    'A1 [FIX] resolveTrialRubro consume el salteo real (pregunta_rubro) y estampa la resolución del salteo');
  ok(cuerpoR.includes('resolveRubro({ cls: webCls, lang })'),
    'A2 [FIX] la identidad del salteo se resuelve con la clasificación del lado website (webCls)');
  const iG = SERVER.indexOf('function trialFundamentoContradice');
  const cuerpoG = iG >= 0 ? SERVER.slice(iG, iG + 3200) : '';
  ok(cuerpoG.includes("fuenteDg === 'pregunta' || fuenteDg === 'form'") && cuerpoG.includes('rec.contradiccion && !rec.resuelta_por') && !cuerpoG.includes('salteo'),
    'A3 el guarda NO se tocó: absuelve solo la palabra del dueño (pregunta/form), frena la reconciliación sin resuelta_por y no conoce la marca del salteo');
  const iI = SERVER.indexOf('function importTrialWeek(');
  const cuerpoI = iI >= 0 ? SERVER.slice(iI, iI + 1500) : '';
  ok(cuerpoI.includes('const contraImp = trialFundamentoContradice(out);') && cuerpoI.includes('if (contraImp)'),
    'A4 la importación sigue frenando ante la contradicción (la puerta de importTrialWeek es la de siempre)');
  ok(PRUEBA.includes("fd.append('pregunta_rubro', 'skip')") && ENPRUEBA.includes("fd.append('pregunta_rubro', 'skip')")
    && PRUEBA.includes("fd.append('rubro_src', 'pregunta')") && ENPRUEBA.includes("fd.append('rubro_src', 'pregunta')"),
    'A5 ambos frentes: el salteo viaja como pregunta_rubro=\'skip\' y la respuesta como rubro_src=\'pregunta\' (el campo que la base no consumía)');
  eq((SERVER.match(/resuelta_por: 'salteo-web'/g) || []).length, 1,
    'A6 [FIX] la marca del salteo nace en UN solo punto (la costura de resolveTrialRubro)');
  ok(SERVER.includes("resuelta_por: 'confirmacion'"),
    'A7 la marca de la confirmación del dueño sigue existiendo intacta');
}

/* ── B · VM funcional: los tres mundos sobre el fuente real ──────── */
let R = null, B = null, C = null, rubroId = null;
{
  let clientDigest = null;
  try { clientDigest = require(path.join(ROOT, 'client-digest.js')); } catch (e) {}
  try { rubroId = require(path.join(ROOT, 'rubro-id.js')); } catch (e) {}
  const slice = (a, b) => { const i = SERVER.indexOf(a), j = SERVER.indexOf(b); return (i >= 0 && j > i) ? SERVER.slice(i, j) : ''; };
  const code = slice('function resolveTrialRubro(', '/* (LOTE RUBRO-50-50)')
    + slice('// (LOTE DESTRABE-SOULCYCLE · piezas A1/A2/A4)', 'function trialCacheServe(')
    + slice('function applyTrialMasVendido', 'function trialPreguntaGate')
    + '\nthis.__R = resolveTrialRubro; this.__B = buildTrialDigest; this.__C = trialFundamentoContradice;';
  if (clientDigest && rubroId && code.includes('resolveTrialRubro') && code.includes('trialFundamentoContradice')) {
    try {
      const ctx = { console, clientDigest, rubroId };
      vm.createContext(ctx);
      vm.runInContext(code, ctx);
      R = ctx.__R; B = ctx.__B; C = ctx.__C;
    } catch (e) { R = null; B = null; C = null; }
  }
}

/* Fixtures forma-corrida-5: la cosecha real del negocio (su home
 * pública) y el feed sin señal de texto; el rubro «Food / Restaurant»
 * vivía solo en el puente del prefill (fields.category). */
const WEB5 = {
  name: 'Adaptation Floral Design',
  description: 'Flower delivery in the Greater Atlanta Area including a wide range outside the perimeter. Click below to Order Flowers, Candles and Gift Boxes Online for Pickup or Delivery. Adaptation Floral Design, 316 N. Highland Ave. Atlanta, GA, 30307',
  services: ['Flower Arrangements', 'Wedding Flowers', 'Event Flowers', 'Candles', 'Gift Boxes'],
  city: 'Atlanta', palette: [], url: 'http://www.adaptationfloraldesign.com/', categoryHint: '',
};
const WEB5_CLARA = { ...WEB5, categoryHint: 'Florist' };
const FEED5 = { bio: '', name: 'Adaptation Floral Design', handle: 'adaptationfloraldesign', pic: '', captions: [] };
const DEEP0 = { catalog: { items: [], pages: 0, pdfs: 0 }, bioLink: null, photoEntries: {}, brandPresence: null, logoIntegracion: null };

function cadena(fields, webData, feed, business) {
  const rubroRes = R({ fields, webData, feed, formText: '', catalogItems: [], lang: 'en' });
  const digest = B({
    business, category: rubroRes.category,
    webData, feed, formText: '', feedPalette: null, registro: null,
    deep: DEEP0, rubro: rubroRes, onboarding: null, draft: null, comments: null,
    offerSheet: null, feedMap: null, starSignals: null, feedPosts: null, igLinkState: null,
  });
  const payload = {
    engine: 25, business, category: rubroRes.category, lang: 'en', content_lang: 'en',
    ig: String((feed && feed.handle) || 'suite'),
    web_info: { name: webData.name, description: webData.description, services: webData.services, city: webData.city || '', palette: [], url: webData.url },
    digest,
    onboarding: { producto_estrella: 'Flower arrangements', producto_mix: 'libre' },
    posts: [{ armando: true, headline: 'Día 1' }, { armando: true, headline: 'Día 2' }, { armando: true, headline: 'Día 3' }],
  };
  return { rubroRes, digest, payload };
}
function categoriaWebEsperada(webData, feed) {
  // La clasificación del lado website, calculada con el módulo real
  // y las MISMAS señales que resolveTrialRubro le pasa a webCls.
  const webCls = rubroId.classifyBusiness({
    jsonldType: webData.categoryHint || '',
    catalogText: [(webData.services || []).join(' · '), ''].join(' '),
    webText: [webData.name || '', webData.description || ''].join(' '),
  });
  return rubroId.resolveRubro({ cls: webCls, lang: 'en' }).category;
}

function seccionB() {
  seccion('B · VM funcional (módulos y fuente reales): los tres mundos');
  ok(typeof R === 'function' && typeof B === 'function' && typeof C === 'function',
    'B0 resolveTrialRubro, buildTrialDigest y trialFundamentoContradice se extraen del fuente real');
  if (!R || !B || !C) return;

  /* — Mundo A (forma exacta de la corrida 5: web débil, web.rubro null) — */
  const espWeb = categoriaWebEsperada(WEB5, FEED5);
  const a = cadena({ category: 'gastronomia', pregunta_rubro: 'skip' }, WEB5, FEED5, 'Adaptation Floral Design');
  eq(a.rubroRes.reconciliacion && a.rubroRes.reconciliacion.resuelta_por, 'salteo-web',
    'B1 [FIX] A: el salteo estampa la resolución en la reconciliación al nacer (resolveTrialRubro)');
  eq(a.digest && a.digest.reconciliacion && a.digest.reconciliacion.resuelta_por, 'salteo-web',
    'B2 [FIX] A: el digest (y por tanto el payload guardado) nace resuelto');
  eq(a.digest && a.digest.rubro_id && a.digest.rubro_id.fuente, 'skip',
    'B3 [FIX] A: la fuente del rubro queda «skip» (auditable, distinta de pregunta/form)');
  ok(a.payload.category === espWeb && a.payload.category !== 'gastronomia'
    && a.digest.rubro_id.rubro !== 'gastronomia',
    'B4 [FIX] A: la identidad resultante es la del lado website [' + a.payload.category + ' = clasificación web] y el rubro minado del IG («gastronomia») no sobrevive',
    { cat: a.payload.category, esp: espWeb, rubro: a.digest.rubro_id.rubro });
  eq(C(a.payload), null, 'B5 [FIX] A: el guarda deja pasar el payload del salteo (la importación puede importar)');
  ok(a.digest.reconciliacion.contradiccion === true && a.digest.reconciliacion.ig.rubro === 'gastronomia'
    && a.digest.reconciliacion.motivo === 'web_no_encaja',
    'B6 A: la contradicción queda REGISTRADA con sus dos lados (la estampa no borra el registro)');

  /* — Mundo A, web clara (la web sí determina su rubro: flores) — */
  const a2 = cadena({ category: 'gastronomia', pregunta_rubro: 'skip' }, WEB5_CLARA, FEED5, 'Adaptation Floral Design');
  ok(a2.payload.category === 'flores' && a2.digest.reconciliacion.resuelta_por === 'salteo-web' && C(a2.payload) === null,
    'B7 [FIX] A (web clara): el salteo resuelve con el rubro determinado de la web («flores»), estampa y el guarda pasa',
    { cat: a2.payload.category, res: a2.digest.reconciliacion.resuelta_por, guarda: C(a2.payload) });

  /* — Mundo A, IG fuerte (el voto combinado lo ganaba el IG) — */
  const feedF = { bio: 'Gimnasio y entrenamiento funcional. Clases de spinning, musculación y cardio.', name: 'Power Gym', handle: 'powergym', pic: '', captions: ['Entrená con nosotros', 'Nueva sala de musculación'] };
  const webF = { name: 'Barbería Central', description: 'Barbería y peluquería. Cortes de pelo, arreglo de barba y coloración.', services: ['Corte de pelo', 'Arreglo de barba', 'Coloración'], city: '', palette: [], url: 'https://barberiacentral.example/', categoryHint: '' };
  const a3 = cadena({ category: 'fitness', pregunta_rubro: 'skip' }, webF, feedF, 'Power Gym');
  ok(a3.payload.category === 'belleza' && a3.digest.rubro_id.fuente === 'skip'
    && a3.digest.reconciliacion.resuelta_por === 'salteo-web' && C(a3.payload) === null,
    'B8 [FIX] A (IG fuerte): el rubro minado del IG («fitness», ganador del voto combinado) se descarta y manda el lado website («belleza»)',
    { cat: a3.payload.category, fuente: a3.digest.rubro_id.fuente, res: a3.digest.reconciliacion.resuelta_por, guarda: C(a3.payload) });

  /* — Mundo B (sin confirmación y sin salteo: la corrida 7 en vivo) — */
  const b = cadena({ category: 'gastronomia' }, WEB5, FEED5, 'Adaptation Floral Design');
  ok(b.digest && b.digest.reconciliacion && b.digest.reconciliacion.contradiccion === true
    && !b.digest.reconciliacion.resuelta_por && b.digest.rubro_id.fuente === 'deteccion',
    'B9 B: sin respuesta del dueño no hay estampa ni fuente skip — «sin respuesta» y «salteo» son estados distinguibles en el payload');
  eq(C(b.payload), 'reconciliacion-web_no_encaja',
    'B10 B: el guarda frena el payload crudo como siempre (la guarda intacta)');
  const b2 = cadena({ category: 'gastronomia', pregunta_estrella: 'skip' }, WEB5, FEED5, 'Adaptation Floral Design');
  ok(!b2.digest.reconciliacion.resuelta_por && C(b2.payload) === 'reconciliacion-web_no_encaja',
    'B11 B: el salteo de OTRA duda (la estrella) NO resuelve el conflicto de identidad — solo el salteo de ESTA duda estampa');

  /* — Mundo C (confirmación del dueño: como hoy) — */
  const c = cadena({ category: 'gastronomia', rubro_src: 'pregunta' }, WEB5, FEED5, 'Adaptation Floral Design');
  ok(c.digest.reconciliacion && c.digest.reconciliacion.resuelta_por === 'confirmacion' && c.digest.rubro_id.fuente === 'pregunta' && C(c.payload) === null,
    'B12 C: la confirmación (pregunta) importa como hoy, con su marca de siempre',
    { res: c.digest.reconciliacion && c.digest.reconciliacion.resuelta_por, fuente: c.digest.rubro_id.fuente, guarda: C(c.payload) });
  const c1 = cadena({ category: 'flores', rubro_src: 'pregunta' }, WEB5_CLARA, FEED5, 'Adaptation Floral Design');
  ok(c1.payload.category === 'flores' && c1.digest.rubro_id.fuente === 'pregunta' && C(c1.payload) === null
    && (!c1.digest.reconciliacion || c1.digest.reconciliacion.resuelta_por === 'confirmacion'),
    'B12b C (elige el lado web): la confirmación manda como hoy y el guarda pasa (con la categoría confirmada como puente, las fuentes ya no se contradicen)',
    { cat: c1.payload.category, fuente: c1.digest.rubro_id.fuente, guarda: C(c1.payload) });
  const c2 = cadena({ category: 'gastronomia', rubro_src: 'form' }, WEB5, FEED5, 'Adaptation Floral Design');
  ok(c2.digest.rubro_id.fuente === 'form' && C(c2.payload) === null,
    'B13 C: la confirmación por formulario (form) tampoco cambia');

  /* — Alcance quirúrgico — */
  const feedS = { bio: 'Hair salon', name: 'Glow Studio', handle: 'glowstudio', pic: '', captions: [] };
  const webS = { name: 'Glow Studio', description: 'Hair salon. Cuts and color.', services: ['Haircuts'], city: '', palette: [], url: 'https://glowstudio.example/', categoryHint: '' };
  const s1 = R({ fields: { category: 'otro' }, webData: webS, feed: feedS, formText: '', catalogItems: [], lang: 'en' });
  const s2 = R({ fields: { category: 'otro', pregunta_rubro: 'skip' }, webData: webS, feed: feedS, formText: '', catalogItems: [], lang: 'en' });
  ok(s2.reconciliacion === null && s2.rubroId.fuente === s1.rubroId.fuente && s2.category === s1.category,
    'B14 alcance: el salteo SIN contradicción en pie no cambia nada (sin registro que estampar, misma fuente, misma categoría)');

  /* — Censo corrida 6 (declarado, no cubierto) — */
  const feed6 = { bio: 'Independent bookstore in Inman Park, Atlanta', name: 'A Cappella Books', handle: 'acappellabooks', pic: '', captions: ['Vintage paperbacks and rare finds', 'Signed first editions club night'] };
  const web6 = { name: 'A Cappella Books', description: 'A Cappella Books is an independent bookstore in Inman Park, Atlanta. New, used and rare books, signed first editions, book clubs and author events.', services: ['Signed First Editions', 'Book Clubs', 'Author Events', 'Gift Certificates'], city: 'Atlanta', palette: [], url: 'https://www.acappellabooks.com/', categoryHint: '' };
  const r6 = R({ fields: { category: 'otro', pregunta_rubro: 'skip' }, webData: web6, feed: feed6, formText: '', catalogItems: [], lang: 'en' });
  ok(r6.reconciliacion === null && r6.category === 'moda' && r6.rubroId.needs_question === true,
    'B15 censo corrida 6: su forma (duda regular, «vintage» vota moda bajo la barra) NO produce reconciliación — la costura del salteo no la alcanza',
    { rec: r6.reconciliacion, cat: r6.category });
  const payload6 = {
    engine: 25, business: 'A Cappella Books', category: 'moda', lang: 'en', content_lang: 'en', ig: 'acappellabooks',
    web_info: { name: web6.name, description: web6.description, services: web6.services, city: 'Atlanta', palette: [], url: web6.url },
    digest: {
      business: 'A Cappella Books', category: 'moda', reconciliacion: null,
      rubro_id: { v: 1, rubro: 'moda', subrubro: '', confianza: 0.4, fuente: 'deteccion', segura: false, needs_question: true, candidatas: [{ rubro: 'moda', subrubro: '', score: 2 }] },
      servicios: [{ nombre: 'Signed First Editions', fuente: 'web' }, { nombre: 'Book Clubs', fuente: 'web' }, { nombre: 'Author Events', fuente: 'web' }],
      productos: [],
    },
    posts: [{ armando: true }],
  };
  eq(C(payload6), 'contenido-web_no_encaja',
    'B16 censo corrida 6: su freno es la rama de CONTENIDO del guarda (categoría sin confirmar contra la oferta web) — segunda superficie, intacta en este lote');
}

/* ── C · Boot HTTP: los tres mundos contra el servidor real ──────── */
async function seccionC() {
  seccion('C · boot aislado: salteo / sin respuesta / confirmación, de punta a punta');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!DatabaseSync) { ok(false, 'C0 node:sqlite disponible para sembrar'); return; }
  if (!R || !B) { ok(false, 'C0 la cadena VM está disponible para armar los payloads'); return; }
  const port = 19950 + Math.floor(Math.random() * 120);
  const ADMIN_TOK = 'token-suite';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-salteo-boot-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-salteo-boot-media-'));
  const childEnv = { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: ADMIN_TOK, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' };
  for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'FAL_API_KEY', 'REPLICATE_API_TOKEN']) delete childEnv[k];
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = 'http://127.0.0.1:' + port;
  let vivo = false;
  try {
    for (let i = 0; i < 60 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch(base + '/api/version').catch(() => null);
      if (resp && resp.status === 200) vivo = true;
    }
    ok(vivo, 'C1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    const dbPath = path.join(dataDir, 'posta.db');
    let db = null;
    for (let i = 0; i < 20 && !db; i++) {
      try { db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout = 5000'); } catch (e) { await new Promise((r) => setTimeout(r, 300)); }
    }
    ok(!!db, 'C2 la base del boot se puede abrir para sembrar');
    if (!db) return;
    const ahora = Date.now();
    const cookieDe = (r) => {
      const sc2 = (typeof r.headers.getSetCookie === 'function') ? r.headers.getSetCookie() : [];
      return sc2.map((c) => c.split(';')[0]).filter((c) => c.includes('=')).join('; ');
    };
    const filasDe = (uid) => db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id ASC').all(uid);
    const perfilDe = (uid) => db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(uid);
    const piezaMano = async (body) => {
      const r = await fetch(base + '/api/admin/trial/pieza-mano?token=' + ADMIN_TOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    };
    const CAPTION = 'flower arrangements, made to order in inman park';

    async function mundo(igKey, payload, device) {
      payload.ig = igKey;
      db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
        .run(igKey, JSON.stringify(payload), ahora);
      const gs = await fetch(base + '/api/guest/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: igKey, lang: 'en', tz: 'America/New_York', device }), signal: AbortSignal.timeout(90000) }).catch(() => null);
      const ck = gs ? cookieDe(gs) : '';
      const guest = db.prepare('SELECT id FROM users WHERE guest_ig = ?').get(igKey);
      const uid = guest ? Number(guest.id) : 0;
      if (uid) {
        db.prepare(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at) VALUES (?, ?, '', ?, 'activa', ?)`)
          .run(igKey, igKey, uid, ahora);
      }
      const pm = uid ? await piezaMano({ ig: igKey, dia: 1, media: PNG, caption: CAPTION, hashtags: '#adaptationfloral' }) : { status: 0, json: {} };
      const cacheRow = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(igKey);
      const payloadVivo = cacheRow ? JSON.parse(cacheRow.payload) : null;
      if (uid) await fetch(base + '/api/posts', { headers: { Cookie: ck } }).catch(() => null);
      return { status: gs && gs.status, uid, pm, payloadVivo, filas: uid ? filasDe(uid) : [], perfil: uid ? perfilDe(uid) : null };
    }

    /* Mundo A — conflicto + salteo (el payload lo arma la cadena del árbol) */
    const pA = cadena({ category: 'gastronomia', pregunta_rubro: 'skip' }, WEB5, FEED5, 'Adaptation Floral Design').payload;
    const mA = await mundo('salteo.suite', pA, 'suite-salteo-a');
    eq(mA.status, 202, 'C3 A: guest/start responde 202 (semana en armado) con el payload del salteo');
    ok(!!mA.uid, 'C4 A: el invitado del salteo existe');
    ok(mA.pm.status === 200 && mA.pm.json.ok === true, 'C5 A: la pieza a mano del día 1 carga en el payload');
    eq(mA.payloadVivo && mA.payloadVivo.digest && mA.payloadVivo.digest.reconciliacion && mA.payloadVivo.digest.reconciliacion.resuelta_por,
      'salteo-web', 'C6 [FIX] A: el payload GUARDADO (el que lee la importación) trae la resolución del salteo');
    eq(mA.filas.length, 1, 'C7 [FIX] A: el gatillo IMPORTA la pieza del día 1 (en la base el guarda la frena y queda en 0 para siempre)');
    if (mA.filas.length === 1) {
      eq(mA.filas[0].media_type, 'image', 'C8 [FIX] A: la fila importada es la foto del día 1 (pieza con medio)');
      eq(mA.filas[0].caption, CAPTION, 'C9 [FIX] A: el caption de la pieza llega exacto');
    } else { ok(false, 'C8 [FIX] A: la fila importada es la foto del día 1 (sin la fila)'); ok(false, 'C9 [FIX] A: el caption de la pieza llega exacto (sin la fila)'); }
    ok(!!mA.perfil && mA.perfil.business_name === 'Adaptation Floral Design' && mA.perfil.category !== 'gastronomia',
      'C10 [FIX] A: el cierre escribe la identidad del website (nombre real; el rubro minado del IG no llega al perfil)',
      mA.perfil && { n: mA.perfil.business_name, c: mA.perfil.category });

    /* Mundo B — conflicto sin respuesta (payload crudo) */
    const pB = cadena({ category: 'gastronomia' }, WEB5, FEED5, 'Adaptation Floral Design').payload;
    const mB = await mundo('sinresp.suite', pB, 'suite-salteo-b');
    eq(mB.status, 202, 'C11 B: guest/start responde 202 también sin respuesta');
    ok(mB.pm.status === 200 && mB.pm.json.ok === true, 'C12 B: su pieza a mano también carga en el payload');
    ok(!(mB.payloadVivo && mB.payloadVivo.digest && mB.payloadVivo.digest.reconciliacion && mB.payloadVivo.digest.reconciliacion.resuelta_por),
      'C13 B: el payload guardado NO trae ninguna resolución (sin respuesta ≠ salteo)');
    eq(mB.filas.length, 0, 'C14 B: GUARDA INTACTA en vivo — sin resolución del dueño, el gatillo NO importa');
    ok(!mB.perfil || !String(mB.perfil.business_name || '').trim(),
      'C15 B: y su perfil queda genérico: el cierre no corre sin importación');

    /* Mundo C — conflicto + confirmación del dueño */
    const pC = cadena({ category: 'flores', rubro_src: 'pregunta' }, WEB5_CLARA, FEED5, 'Adaptation Floral Design').payload;
    const mC = await mundo('confirma.suite', pC, 'suite-salteo-c');
    eq(mC.status, 202, 'C16 C: guest/start responde 202 con la semana confirmada');
    ok(mC.pm.status === 200 && mC.pm.json.ok === true, 'C17 C: su pieza a mano carga en el payload');
    eq(mC.filas.length, 1, 'C18 C: la confirmación importa como hoy (1 fila, la pieza del día 1)');
    ok(!!mC.perfil && mC.perfil.business_name === 'Adaptation Floral Design',
      'C19 C: el cierre escribe el perfil del negocio confirmado', mC.perfil && { n: mC.perfil.business_name, c: mC.perfil.category });
    try { db.close(); } catch (e) {}
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  seccionA();
  seccionB();
  await seccionC();
  console.log(`\n== SALTEO-RESUELVE: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
})();
