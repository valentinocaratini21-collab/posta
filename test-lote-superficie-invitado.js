'use strict';
/* ════════════════════════════════════════════════════════════════════
 * LOTE SUPERFICIE DEL INVITADO — suite propia (2026-11-16)
 * Orden directa de Valentino tras la corrida ×10 #1 (@sottosottoatl,
 * invitado 113): la entrada fue limpia y la semana conocía al negocio,
 * pero el Inicio del invitado se veía como si nunca hubiera entrado
 * (perfil «Mi negocio»/«otro», hoy vacío, tarjeta «decime tu
 * Instagram») y la pieza del día 1 cargada por la palanca (200 OK)
 * NUNCA apareció en la misma sesión.
 *
 * DIAGNÓSTICO PROBADO (el mecanismo, no una hipótesis):
 * el dueño respondió la duda de identidad en la puerta
 * (digest.rubro_id.fuente = 'pregunta', confianza 1), pero la
 * reconciliación del digest quedó guardada SIN resuelta_por: en la
 * pasada confirmada, resolveTrialRubro no calcula reconciliación
 * (clasifica solo con el IG, que no determinaba nada) y el bloque de
 * recomputación de buildTrialDigest la recompone usando la categoría
 * confirmada como puente (fuente 'prefill'), perdiendo la resolución.
 * El guarda trialFundamentoContradice veía «contradicción sin
 * resolver» y TODA importación (guest/start, aterrizaje, gatillos de
 * la REIMPORTACIÓN v1135) devolvía 0 para siempre — sin filas no hay
 * cierre: ni perfil, ni siembra, ni agenda, ni tarjeta wow.
 *
 * EL ARREGLO (3 piezas de servidor + 2 de superficie):
 *  A · buildTrialDigest: la reconciliación recomputada nace con
 *      resuelta_por:'confirmacion' cuando el rubro vino confirmado
 *      por el dueño (fuente pregunta/form).
 *  B · trialFundamentoContradice: un fundamento cuyo rubro confirmó
 *      el dueño (fuente pregunta/form) NO contradice — cura también
 *      los payloads ya guardados sin la marca (el invitado 113).
 *      Sin confirmación, el DESTRABE queda intacto (B4/B6/B8, C14).
 *  E · homeProfileKit: el kit de nacimiento habla el idioma de la
 *      cuenta (users.lang), no español fijo.
 *  C/D · app.js: el modal de conexión genérico es bilingüe por
 *      ME.lang, y homeWeekHTML nunca le pide el @ a un invitado que
 *      ya entró con su @ (tarjeta de armado en su idioma); la tarjeta
 *      de pedir el @ (invitado sin @) también sigue el idioma.
 *
 * Correr:  node test-lote-superficie-invitado.js [--no-boot]
 * Control prístino (v1137): B1/B3/B7/B9 y C7/C9/C10 caen — el guarda
 * rechaza la semana confirmada y el Inicio queda genérico; el resto
 * pasa igual (las guardas del DESTRABE no se mueven).
 * ════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { DatabaseSync = null; }

let pass = 0, fail = 0;
const failures = [];
function ok(cond, nombre, extra) {
  if (cond) { pass++; console.log('  ✓ ' + nombre); }
  else { fail++; failures.push(nombre); console.log('  ✗ ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ']'); }
function seccion(t) { console.log('\n== ' + t); }

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const DIA = 24 * 3600 * 1000;

/* ── A · Censo de cableado ───────────────────────────────────────── */
function seccionA() {
  seccion('A · censo de cableado (fuente)');
  const iC = SERVER.indexOf('function trialFundamentoContradice');
  const cuerpoC = iC >= 0 ? SERVER.slice(iC, iC + 3200) : '';
  ok(cuerpoC.includes("fuenteDg === 'pregunta' || fuenteDg === 'form'"), 'A1 el guarda honra la confirmación del dueño (fuente pregunta/form)');
  ok(cuerpoC.indexOf("fuenteDg === 'pregunta'") >= 0 && cuerpoC.indexOf("fuenteDg === 'pregunta'") < cuerpoC.indexOf('rec.contradiccion'), 'A2 la confirmación se juzga ANTES que la reconciliación sin resolver');
  const iB = SERVER.indexOf('function buildTrialDigest');
  const cuerpoB = iB >= 0 ? SERVER.slice(iB, iB + 26000) : '';
  ok(cuerpoB.includes("resuelta_por: 'confirmacion'") && cuerpoB.includes("fuenteRec === 'pregunta' || fuenteRec === 'form'"), 'A3 la recomputación del digest estampa la resolución cuando el dueño confirmó');
  const iK = SERVER.indexOf('function homeProfileKit');
  const cuerpoK = iK >= 0 ? SERVER.slice(iK, iK + 1600) : '';
  ok(cuerpoK.includes('SELECT lang FROM users') && cuerpoK.includes('lang: kitLang') && !cuerpoK.includes("lang: 'es'"), 'A4 el kit de nacimiento usa el idioma de la cuenta (nunca español fijo)');
  const iP = APPJS.indexOf('function igPopupShow');
  const cuerpoP = iP >= 0 ? APPJS.slice(iP, iP + 3400) : '';
  ok(cuerpoP.includes('const enM = wowSub ? !!wowEn :') && cuerpoP.includes('ME.lang'), 'A5 el modal genérico toma el idioma de la cuenta (ME.lang) cuando no hay wow');
  ok(cuerpoP.includes('So Posty can get your week ready to publish.') && cuerpoP.includes('We never see or store your password.'), 'A6 el modal genérico tiene su versión en inglés completa');
  const iW = APPJS.indexOf('function homeWeekHTML');
  const cuerpoW = iW >= 0 ? APPJS.slice(iW, iW + 5200) : '';
  ok(cuerpoW.includes('guestIgHw') && cuerpoW.includes('Posty is finishing your week'), 'A7 el invitado CON @ ve la tarjeta de armado (nunca «decime tu Instagram»), en su idioma');
  ok(cuerpoW.includes('Tell me your Instagram so I can build your posts'), 'A8 la tarjeta de pedir el @ (invitado sin @) también sigue el idioma de la entrada');
  ok(APPJS.includes('pzWowConnectHTML({ post: wowPostR1'), 'A9 la tarjeta wow sigue anclada al posteo de hoy en el Inicio (CONEXIÓN-WOW intacta)');
  const mSrv = SERVER.match(/const BUILD_ID = '([^']+)'/);
  const mApp = APPJS.match(/const PZ_BUILD = '([^']+)'/);
  ok(!!mSrv && !!mApp && mSrv[1] === mApp[1], 'A10 estampas BUILD_ID/PZ_BUILD en paridad [' + (mSrv && mSrv[1]) + ' = ' + (mApp && mApp[1]) + ']');
  ok(/src="\/app\.js\?v=\d+"/.test(INDEX), 'A11 el index ES sirve app.js con ?v= bumpeado');
}

/* ── B · VM funcional: el guarda y el digest, fuente real ────────── */
let buildFn = null, contraFn = null;
{
  let clientDigest = null, rubroId = null;
  try { clientDigest = require(path.join(ROOT, 'client-digest.js')); } catch (e) {}
  try { rubroId = require(path.join(ROOT, 'rubro-id.js')); } catch (e) {}
  const iA0 = SERVER.indexOf('// (LOTE DESTRABE-SOULCYCLE · piezas A1/A2/A4)');
  const iA1 = SERVER.indexOf('function trialCacheServe(');
  const iB0 = SERVER.indexOf('function applyTrialMasVendido');
  const iB1 = SERVER.indexOf('function trialPreguntaGate');
  if (clientDigest && rubroId && iA0 >= 0 && iA1 > iA0 && iB0 >= 0 && iB1 > iB0) {
    try {
      const ctx = { console, clientDigest, rubroId };
      vm.createContext(ctx);
      vm.runInContext(SERVER.slice(iA0, iA1) + '\n' + SERVER.slice(iB0, iB1) + '\nthis.__B = buildTrialDigest; this.__C = trialFundamentoContradice;', ctx);
      buildFn = ctx.__B; contraFn = ctx.__C;
    } catch (e) { buildFn = null; contraFn = null; }
  }
}
const FEED_SOTTO = { bio: '', name: 'Sotto Sotto', handle: 'sottosottoatl', pic: '', captions: [] };
const WEB_SOTTO = { name: '', description: 'Sotto Sotto. 3130 Piedmont Road NE, Atlanta. Tuesday to Sunday from 5 pm. Reservations recommended. Valet parking available on site.', services: [], city: 'Atlanta', palette: [], url: 'https://sottosottoatl.com/', categoryHint: '' };
const REC_SOTTO = { contradiccion: true, motivo: 'web_no_encaja', ig: { rubro: 'gastronomia', fuente: 'prefill', confianza: 0.06 }, web: { rubro: null, nombre: '', url: 'https://sottosottoatl.com/' } };
function buildSotto(fuente) {
  return buildFn({
    business: 'Sotto Sotto', category: 'gastronomia',
    webData: WEB_SOTTO, feed: FEED_SOTTO, formText: '', feedPalette: null, registro: null,
    deep: { catalog: { items: [], pages: 0, pdfs: 0 }, bioLink: null, photoEntries: {}, brandPresence: null, logoIntegracion: null },
    rubro: { category: 'gastronomia', subcat: '', rubroId: { v: 1, rubro: 'gastronomia', subrubro: '', confianza: 1, fuente, segura: fuente === 'pregunta', needs_question: false, candidatas: [{ rubro: 'gastronomia', subrubro: '', score: 1 }] }, reconciliacion: null },
    onboarding: null, draft: null, comments: null, offerSheet: null, feedMap: null,
    starSignals: null, feedPosts: null, igLinkState: null,
  });
}
function payloadDe(fuente, rec) {
  return {
    business: 'Sotto Sotto', category: 'gastronomia',
    web_info: { url: 'https://sottosottoatl.com/', name: '', description: WEB_SOTTO.description },
    digest: { reconciliacion: rec, rubro_id: { v: 1, rubro: 'gastronomia', subrubro: '', confianza: 1, fuente, segura: true, needs_question: false }, servicios: [], dueno: { mas_vendido: 'Tortelli di Michelangelo' } },
    posts: [],
  };
}
function seccionB() {
  seccion('B · VM funcional (módulos reales): la semana confirmada no contradice');
  ok(typeof buildFn === 'function' && typeof contraFn === 'function', 'B0 buildTrialDigest y trialFundamentoContradice se extraen del fuente real');
  if (!buildFn || !contraFn) return;
  // LA FUENTE (fix A): la pasada confirmada recompone la reconciliación.
  const dgConf = buildSotto('pregunta');
  ok(!!dgConf && !!dgConf.reconciliacion && dgConf.reconciliacion.contradiccion === true, 'B1a la recomputación reproduce la contradicción del caso real (web_no_encaja)', dgConf && dgConf.reconciliacion);
  eq(dgConf && dgConf.reconciliacion && dgConf.reconciliacion.resuelta_por, 'confirmacion', 'B1 la reconciliación recomputada nace RESUELTA cuando el dueño confirmó (LA FUENTE: en el prístino nace sin marca)');
  const dgDet = buildSotto('deteccion');
  ok(!!dgDet && !!dgDet.reconciliacion && dgDet.reconciliacion.contradiccion === true && !dgDet.reconciliacion.resuelta_por, 'B2 sin confirmación, la recomputación deja la contradicción viva (DESTRABE intacto)', dgDet && dgDet.reconciliacion);
  // EL GUARDA (fix B): cura los payloads ya guardados sin la marca.
  eq(contraFn(payloadDe('pregunta', REC_SOTTO)), null, 'B3 confirmado + reconciliación sin marca → el guarda NO contradice (EL DEFECTO: el prístino devuelve reconciliacion-web_no_encaja)');
  eq(contraFn(payloadDe('form', REC_SOTTO)), null, 'B3b confirmado por formulario (fuente form) → tampoco contradice');
  eq(contraFn(payloadDe('deteccion', REC_SOTTO)), 'reconciliacion-web_no_encaja', 'B4 sin confirmación → el guarda frena como siempre');
  eq(contraFn(payloadDe('pregunta', { ...REC_SOTTO, resuelta_por: 'confirmacion' })), null, 'B5 confirmado + marca explícita → no contradice (comportamiento previo intacto)');
  eq(contraFn({ business: 'X', category: 'fitness', web_info: { url: '', name: '', description: '' }, digest: { reconciliacion: REC_SOTTO, servicios: [] }, posts: [] }), 'reconciliacion-web_no_encaja', 'B6 payload viejo sin rubro_id → el guarda frena como siempre');
  const payloadBMX = {
    business: 'SoulCycle', category: 'fitness',
    web_info: { url: 'https://soulcycle.com/', name: 'soulcyclebmx', description: 'Soulcycle is a BMX shop in Amsterdam' },
    digest: { reconciliacion: null, rubro_id: { v: 1, rubro: 'fitness', confianza: 1, fuente: 'pregunta', segura: true, needs_question: false }, servicios: [{ nombre: 'Rotor Set Install' }, { nombre: 'Bars Cutting' }], logo_file: '' },
    posts: [],
  };
  eq(contraFn(payloadBMX), null, 'B7 confirmado + contradicción por CONTENIDO (rama 2, web BMX) → no contradice');
  const bmDet = contraFn({ ...payloadBMX, digest: { ...payloadBMX.digest, rubro_id: { ...payloadBMX.digest.rubro_id, fuente: 'deteccion' } } });
  ok(typeof bmDet === 'string' && bmDet.indexOf('contenido-') === 0, 'B8 sin confirmación + contenido BMX → la rama 2 frena como siempre', bmDet);
  // LA CADENA ENTERA a nivel unidad: digest construido → payload → guarda.
  const payloadCadena = { business: 'Sotto Sotto', category: 'gastronomia', web_info: { url: 'https://sottosottoatl.com/', name: '', description: WEB_SOTTO.description }, digest: dgConf, posts: [] };
  eq(contraFn(payloadCadena), null, 'B9 el digest que buildTrialDigest entrega (pasada confirmada) pasa el guarda de importación');
}

/* ── C · Boot HTTP: la corrida ×10 #1 como fixture ───────────────── */
const PAYLOAD_SOTTO = {
  engine: 25, business: 'Sotto Sotto', category: 'gastronomia', lang: 'en', content_lang: 'en',
  ig: 'sottosotto.suite',
  web_info: { name: '', description: WEB_SOTTO.description, services: [], city: 'Atlanta', palette: [], url: 'https://sottosottoatl.com/' },
  digest: {
    business: 'Sotto Sotto', category: 'gastronomia',
    reconciliacion: REC_SOTTO,
    rubro_id: { v: 1, rubro: 'gastronomia', subrubro: '', confianza: 1, fuente: 'pregunta', segura: true, needs_question: false, candidatas: [{ rubro: 'gastronomia', subrubro: '', score: 1 }] },
    servicios: [], productos: [{ nombre: 'Tortelli di Michelangelo' }, { nombre: 'Branzino al forno' }],
    diferencial: 'Italian cooking in Atlanta since 1995', dueno: { mas_vendido: 'Tortelli di Michelangelo' },
  },
  onboarding: { producto_estrella: 'Tortelli di Michelangelo', producto_mix: 'libre' },
  posts: [{ armando: true, headline: 'Día 1' }, { armando: true, headline: 'Día 2' }, { armando: true, headline: 'Día 3' }],
};
async function seccionC() {
  seccion('C · boot aislado: la corrida ×10 #1 (@sottosottoatl) como fixture');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!DatabaseSync) { ok(false, 'C0 node:sqlite disponible para sembrar'); return; }
  const port = 19850 + Math.floor(Math.random() * 120);
  const ADMIN_TOK = 'token-suite';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-superficie-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-superficie-media-'));
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
    const CAPTION = 'tortelli di michelangelo, la pasta de la casa';

    // ===== El flujo de la corrida: entrada → marca → pieza → apertura =====
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
      .run('sottosotto.suite', JSON.stringify(PAYLOAD_SOTTO), ahora);
    const gs = await fetch(base + '/api/guest/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'sottosotto.suite', lang: 'en', tz: 'America/New_York', device: 'suite-superficie-1' }), signal: AbortSignal.timeout(90000) }).catch(() => null);
    const gsJ = gs ? await gs.json().catch(() => ({})) : {};
    eq(gs && gs.status, 202, 'C3 guest/start con la semana en armado responde 202 [' + (gs && gs.status) + ']');
    ok(gsJ.week_pending === true && gsJ.session === true, 'C4 el 202 declara week_pending CON sesión');
    const ck = gs ? cookieDe(gs) : '';
    const guest = db.prepare('SELECT id FROM users WHERE guest_ig = ?').get('sottosotto.suite');
    const uid = guest ? Number(guest.id) : 0;
    ok(!!uid, 'C5 el invitado de la corrida existe');
    eq(filasDe(uid).length, 0, 'C6 tras la entrada, 0 filas (la semana vive solo en el payload)');
    const perfAntes = perfilDe(uid);
    ok(!perfAntes || (!String(perfAntes.ig_username || '').trim() && !String(perfAntes.business_name || '').trim()), 'C7 antes de la importación no hay perfil del negocio (sin fila o fila vacía: la superficie genérica de la captura)', perfAntes);
    db.prepare(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at) VALUES (?, ?, '', ?, 'activa', ?)`)
      .run('sottosotto.suite', 'sottosotto.suite', uid, ahora);
    const pm = await piezaMano({ ig: 'sottosotto.suite', dia: 1, media: PNG, caption: CAPTION, hashtags: '#sottosotto' });
    ok(pm.status === 200 && pm.json.ok === true && !pm.json.post_id, 'C8 pieza-mano día 1 carga en el payload, sin fila (post_id null)');
    eq(filasDe(uid).length, 0, 'C9 con la pieza cargada, SIGUE en 0 filas (el hueco, antes del gatillo)');
    const ap1 = await fetch(base + '/api/posts', { headers: { Cookie: ck } }).catch(() => null);
    eq(ap1 && ap1.status, 200, 'C10 la apertura de la app (GET /api/posts) responde 200');
    const filas = filasDe(uid);
    eq(filas.length, 1, 'C11 EL GATILLO IMPORTA la pieza del día 1 (LA FALLA: en el prístino el guarda la rechaza y queda en 0 para siempre)');
    if (filas.length === 1) {
      eq(filas[0].caption, CAPTION, 'C12 el caption de la pieza llega exacto');
      eq(filas[0].media_type, 'image', 'C13 la fila es la foto del día 1');
      eq(filas[0].source, 'trial', 'C14 la fila nace de la importación de la prueba');
      ok(filas[0].status === 'draft' || filas[0].status === 'scheduled', 'C15 la fila queda en borrador o programada [' + filas[0].status + ']');
      if (filas[0].scheduled_at) {
        const hh = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(String(filas[0].scheduled_at).replace(' ', 'T')));
        eq(hh, '19:00', 'C16 programada, sale a las 19:00 de la zona del negocio [' + filas[0].scheduled_at + ' → ' + hh + ']');
      } else {
        console.log('  · C16 (sin scheduled_at: la agenda la pone la aprobación — la hora se verifica en la evidencia del liberador)');
      }
    } else { for (const n of ['C12', 'C13', 'C14', 'C15']) ok(false, n + ' (sin la fila importada)'); }
    const perf = perfilDe(uid);
    ok(!!perf && perf.ig_username === 'sottosotto.suite' && perf.business_name === 'Sotto Sotto' && perf.category === 'gastronomia',
      'C17 EL CIERRE ESCRIBE EL PERFIL: @, nombre real y rubro (nunca más «Mi negocio»/«otro»)', perf && { u: perf.ig_username, n: perf.business_name, c: perf.category });
    const hp = await fetch(base + '/api/home/profile', { headers: { Cookie: ck } }).catch(() => null);
    const hpJ = hp ? await hp.json().catch(() => ({})) : {};
    ok(!!hpJ && hpJ.name === 'Sotto Sotto' && hpJ.username === 'sottosotto.suite' && hpJ.category_en === 'Restaurant',
      'C18 /api/home/profile sirve el negocio real: nombre, @ y rubro en el idioma de la entrada', hpJ && { n: hpJ.name, u: hpJ.username, c: hpJ.category_en });
    const ap2 = await fetch(base + '/api/posts', { headers: { Cookie: ck } }).catch(() => null);
    eq(ap2 && ap2.status, 200, 'C19 la segunda apertura responde 200');
    eq(filasDe(uid).length, 1, 'C20 DOBLE CORRIDA: la segunda apertura no duplica la fila');
    const we = await fetch(base + '/api/week/ensure', { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
    const weJ = we ? await we.json().catch(() => ({})) : {};
    ok(weJ.reason !== 'no_dna', 'C21 con el fundamento sembrado, week/ensure ya no declara no_dna (la tarjeta «decime tu Instagram» no tiene de dónde salir)', weJ.reason);

    // ===== La guarda: la MISMA semana SIN confirmación del dueño =====
    const payloadSin = JSON.parse(JSON.stringify(PAYLOAD_SOTTO));
    payloadSin.ig = 'sinconfirma.suite';
    payloadSin.digest.rubro_id = { ...payloadSin.digest.rubro_id, fuente: 'deteccion', segura: false };
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
      .run('sinconfirma.suite', JSON.stringify(payloadSin), ahora);
    const gs2 = await fetch(base + '/api/guest/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'sinconfirma.suite', lang: 'en', tz: 'America/New_York', device: 'suite-superficie-2' }), signal: AbortSignal.timeout(90000) }).catch(() => null);
    eq(gs2 && gs2.status, 202, 'C22 la entrada sin confirmación también responde 202');
    const ck2 = gs2 ? cookieDe(gs2) : '';
    const guest2 = db.prepare('SELECT id FROM users WHERE guest_ig = ?').get('sinconfirma.suite');
    const uid2 = guest2 ? Number(guest2.id) : 0;
    ok(!!uid2, 'C23 el invitado sin confirmación existe');
    db.prepare(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at) VALUES (?, ?, '', ?, 'activa', ?)`)
      .run('sinconfirma.suite', 'sinconfirma.suite', uid2, ahora);
    const pm2 = await piezaMano({ ig: 'sinconfirma.suite', dia: 1, media: PNG, caption: CAPTION, hashtags: '#sottosotto' });
    ok(pm2.status === 200 && pm2.json.ok === true, 'C24 su pieza-mano también carga en el payload');
    await fetch(base + '/api/posts', { headers: { Cookie: ck2 } }).catch(() => null);
    eq(filasDe(uid2).length, 0, 'C25 GUARDA DESTRABE: sin la confirmación del dueño, el gatillo NO importa (la contradicción sigue frenando)');
    const perf2 = perfilDe(uid2);
    ok(!perf2 || (!String(perf2.ig_username || '').trim() && !String(perf2.business_name || '').trim()), 'C26 y su perfil queda genérico: el cierre no corre sin importación', perf2);
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
  console.log(`\n== SUPERFICIE DEL INVITADO: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
})();
