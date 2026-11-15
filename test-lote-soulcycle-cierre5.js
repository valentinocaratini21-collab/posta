'use strict';
/* Suite LOTE SOULCYCLE-CIERRE-5 (CIERRE 5 de la corrida SoulCycle,
 * candidata 1 de 5 del gate, 15/11/2026) — LA PALABRA DEL DUEÑO MANDA.
 * En la re-corrida contra v1104 la puerta preguntó «Is Rotor Set
 * Install your star product?» y el dueño respondió por «Other» su
 * estrella real («The SoulCycle Ride — signature indoor cycling
 * class»): la respuesta quedó guardada en onboarding.producto_estrella
 * y en digest.dueno.mas_vendido, pero la resolución de estrella del
 * diseño aceptó por encima la minada sin confirmar («Rotor Set
 * Install», sin_confirmar: true, ok: true en el registro del gate de
 * mostrar, con esperada: null) y la semana salió entera del negocio
 * equivocado. La sustitución fue SILENCIOSA: ninguna superficie
 * comparaba la declaración con el ancla que el diseño iba a usar.
 * El cierre:
 *  (1) EL CONFLICTO SE DECLARA: declaración del dueño presente, sin
 *      calce con lo evidenciado (duenoStarEvidenceMatch, entera o su
 *      nombre-cabeza) y con nombre usable (barra de texto del dueño:
 *      no genérica, no fragmento de precio, no cromo/rol/sitio/
 *      suscripción) + ancla minada que el diseño usaría → nace la
 *      candidata estrella_dueno_sin_encaje (duenoStarConflictoOf) y
 *      la puerta pregunta con el conflicto nombrado, la palabra
 *      literal del dueño como primera opción. La candidata del ancla
 *      no nace (la del conflicto la subsume).
 *  (2) LA REAFIRMACIÓN MANDA: si el dueño, con el conflicto a la
 *      vista (estrella_conflicto_vista que el front devuelve),
 *      reafirma SU palabra, trialPreguntaGate sella
 *      dueno.estrella_vinculante y effectiveStarOf la consume como
 *      LA estrella (fuente 'dueno', con su nombre-cabeza): el wow
 *      ancla en ella y el gate de mostrar la registra como esperada.
 *  (3) LO DE SIEMPRE NO SE TOCA: la declaración que calza manda como
 *      hoy; la genérica sin calce («proyecto», «cafe», un fragmento
 *      de precio) sigue tratada como no declarada (L3); sin
 *      declaración, candidatas y diseño idénticos a la base.
 * Uso: node test-lote-soulcycle-cierre5.js [--no-boot]
 * Control contra la base: LOTE_BASE_DIR=<árbol base v1104>. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-soulcycle-c5-data-'));

const REL = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.resolve(REL, '..', 'base');
const cd = require(path.join(REL, 'client-digest'));
const demo = require(path.join(REL, 'demo'));
const CD_SRC = fs.readFileSync(path.join(REL, 'client-digest.js'), 'utf8');
const SERVER_SRC = fs.readFileSync(path.join(REL, 'server.js'), 'utf8');
const APPJS_SRC = fs.readFileSync(path.join(REL, 'public', 'app.js'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(REL, 'public', 'index.html'), 'utf8');
const PRUEBA_SRC = fs.readFileSync(path.join(REL, 'public', 'prueba.html'), 'utf8');
const EN_PRUEBA_SRC = fs.readFileSync(path.join(REL, 'public', 'en-prueba.html'), 'utf8');
const tieneBase = fs.existsSync(path.join(BASE, 'client-digest.js'));
const cdB = tieneBase ? require(path.join(BASE, 'client-digest')) : null;
const APPJS_BASE = tieneBase ? fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8') : '';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function eq(a, b, name) { ok(a === b, name, { got: a, want: b }); }
function seccion(s) { console.log('\n[' + s + ']'); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------ fixtures */
// El digest de la re-corrida, fiel a done-out.json (SoulCycle leído
// del negocio equivocado: la tienda BMX de Ámsterdam). La estrella
// débil que la puerta ofreció fue «Rotor Set Install» (productos[0]).
const DECL = 'The SoulCycle Ride — signature indoor cycling class';
function digestCorrida(extra) {
  const d = {
    business: 'SoulCycle', category: 'otro', subcat: '',
    diferencial: 'Soulcycle is a BMX shop in Amsterdam',
    productos: ['Rotor Set Install', 'Bars Cutting', 'General BMX Maintenance', 'HALLOWEEN RIDE-OUT 2026 💀', 'KINK 2027 COLLECTION', 'WHEELS OF STEEL',
      'Clip', 'Turn It Up', 'Booking', 'Link', 'Thanksgiving', 'Turkey Burns'].map((n) => ({ nombre: n })),
    servicios: [],
    productos_nombrados: [
      { nombre: 'Clip', fuente: 'caption', menciones: 3, clases: ['frase', 'repetida', 'sujeto'] },
      { nombre: 'Turn It Up', fuente: 'caption', menciones: 3, clases: ['frase', 'repetida'] },
      { nombre: 'Booking', fuente: 'caption', menciones: 2, clases: ['frase', 'repetida', 'sujeto'] },
      { nombre: 'Link', fuente: 'caption', menciones: 2, clases: ['frase', 'repetida', 'sujeto'] },
      { nombre: 'Thanksgiving', fuente: 'caption', menciones: 1, clases: ['frase'] },
      { nombre: 'Turkey Burns', fuente: 'caption', menciones: 1, clases: ['frase', 'sujeto'] },
      { nombre: 'Soul Early', fuente: 'caption', menciones: 1, clases: ['frase'] },
      { nombre: 'GO ALL IN', fuente: 'caption', menciones: 1, clases: ['frase', 'sujeto'] },
      { nombre: 'Palm Beach', fuente: 'caption', menciones: 1, clases: ['frase', 'sujeto'] },
      { nombre: 'Rotor Set Install', fuente: 'web', menciones: 1, clases: ['catalogo'] },
    ],
    temas_feed: [], inferred_star: null,
    rubro_id: { v: 1, rubro: 'otro', subrubro: '', confianza: 0, candidatas: [], evidencia: [], fuente: 'deteccion', segura: false, nivel_duda: 'rubro', needs_question: false, sin_confirmar: true },
  };
  return Object.assign(d, extra || {});
}
function conDeclaracion(declarada, extra) {
  return digestCorrida(Object.assign({
    dueno: { mas_vendido: declarada },
    onboarding: { producto_estrella: declarada, producto_mix: 'libre' },
  }, extra || {}));
}
function conCandidatas(d) { d.question_candidates = cd.questionCandidatesOf(d); return d; }

/* ------------------------------------------------ A · submit 1: sin declaración, el flujo de hoy */
seccion('A · sin declaración: la puerta pregunta por el ancla, como hoy');
{
  const d = conCandidatas(digestCorrida());
  const motivos = d.question_candidates.map((c) => c.motivo || c.tipo);
  // (ACTUALIZADO CON CAUSA — LOTE SOULCYCLE-CIERRE-6 · PISO DE LA
  // DUDA) El fixture de la corrida es TAMBIÉN el estado cero de
  // señal IG (rubro «otro», confianza 0, sin candidatas ni
  // evidencia): desde el cierre 6 nace PRIMERO la candidata de piso
  // (sin_senal_ig) y la puerta la sirve antes que la del ancla —
  // preguntar la estrella de un negocio que no se sabe qué es fue
  // el fallo de la re-corrida. A1/A2/B5/B6/D3 se ajustan a ese
  // orden; el ancla, el conflicto y su no-repregunta quedan
  // verificados un paso después, como en el cierre 2.
  ok(d.question_candidates.length === 2 && d.question_candidates[0].motivo === 'sin_senal_ig' && d.question_candidates[1].motivo === 'ancla_sin_confirmar' && d.question_candidates[1].item === 'Rotor Set Install',
    'A1 candidatas = el piso (sin_senal_ig) y el ancla sin confirmar (Rotor Set Install)', motivos);
  const q = cd.trialQuestionFor(d, { lang: 'en', answered: {} });
  ok(!!q && q.tipo === 'rubro' && q.motivo === 'sin_senal_ig', 'A2 la pregunta servida primero es la del piso (cierre 6)', q);
  const qAncla = cd.trialQuestionFor(d, { lang: 'en', answered: { rubro: true } });
  ok(!!qAncla && qAncla.tipo === 'estrella' && qAncla.item === 'Rotor Set Install' && !qAncla.motivo, 'A2b respondido el rubro, la pregunta servida es la del ancla', qAncla);
  eq(cd.duenoStarConflictoOf(digestCorrida()), null, 'A3 sin declaración no hay conflicto');
}

/* ------------------------------------------------ B · submit 2: la declaración contra el ancla */
seccion('B · la declaración del dueño no calza: el conflicto se declara y se pregunta');
{
  const d = conDeclaracion(DECL);
  const conf = cd.duenoStarConflictoOf(d);
  ok(!!conf, 'B1 duenoStarConflictoOf detecta el conflicto de la corrida');
  eq(conf && conf.declarada, DECL, 'B2 la declarada es la palabra literal del dueño');
  eq(conf && conf.nombre, 'The SoulCycle Ride', 'B3 el nombre es la cabeza (sin el descriptor)');
  eq(conf && conf.ancla, 'Rotor Set Install', 'B4 el ancla en disputa es la minada sin confirmar');
  // El recomputo de buildTrialDigest: finalize computó SIN la
  // declaración visible (solo el ancla); con la declaración mapeada,
  // las candidatas se recomputan y nace la del conflicto.
  const antes = cd.questionCandidatesOf(digestCorrida());
  const despues = cd.questionCandidatesOf(d);
  ok(antes.length === 2 && antes[0].motivo === 'sin_senal_ig' && antes[1].motivo === 'ancla_sin_confirmar', 'B5 antes de mapear la declaración: el piso y el ancla (con causa, cierre 6)');
  ok(despues.length === 2 && despues[0].motivo === 'sin_senal_ig' && despues[1].motivo === 'estrella_dueno_sin_encaje', 'B6 tras mapearla: el piso y el conflicto (el ancla no nace, queda subsumida)', despues.map((c) => c.motivo));
  conCandidatas(d);
  // La declaración presente NO marca la pregunta respondida (es su causa):
  const q = cd.trialQuestionFor(d, { lang: 'en', answered: { estrella: true, rubro: true } });
  ok(!!q && q.motivo === 'estrella_dueno_sin_encaje', 'B7 con estrella «respondida» la puerta igual sirve el conflicto', q);
  ok(!!q && /The SoulCycle Ride/.test(q.texto) && /Rotor Set Install/.test(q.texto), 'B8 el texto nombra las dos estrellas en disputa', q && q.texto);
  eq(q && q.opciones[0], DECL, 'B9 la primera opción es la palabra literal del dueño');
  ok(!!q && q.opciones.includes('Rotor Set Install'), 'B10 las opciones incluyen el ancla minada');
  eq(q && q.declarada, DECL, 'B11 la pregunta devuelve la declarada (la vista del conflicto)');
  const qEs = cd.trialQuestionFor(d, { lang: 'es', answered: { estrella: true, rubro: true } });
  ok(!!qEs && /Nos dijiste que tu estrella es/.test(qEs.texto), 'B12 el texto en español nombra el conflicto', qEs && qEs.texto);
  // Respondido el conflicto (skip o reafirmación, lo computa la ruta): no se repregunta.
  const q2 = cd.trialQuestionFor(d, { lang: 'en', answered: { estrella: true, rubro: true, estrella_conflicto: true } });
  eq(q2, null, 'B13 con el conflicto respondido, la puerta no repregunta');
}

/* ------------------------------------------------ C · la reafirmación manda */
seccion('C · el dueño reafirma con el conflicto a la vista: su estrella ES la estrella');
{
  const d = conDeclaracion(DECL, { dueno: { mas_vendido: DECL, estrella_vinculante: DECL } });
  eq(cd.duenoStarConflictoOf(d), null, 'C1 sellada la vinculante, el conflicto se cierra');
  const eff = cd.effectiveStarOf(d);
  ok(!!eff && eff.source === 'dueno', 'C2 effectiveStarOf la devuelve como fuente dueño', eff);
  eq(eff && eff.item, 'The SoulCycle Ride', 'C3 la estrella efectiva es el nombre del dueño');
  const wow = cd.deriveFirstPostWow(d, { category: 'otro', lang: 'en' });
  ok(!!wow && wow.digest_anchor === 'The SoulCycle Ride', 'C4 el wow ancla en la estrella del dueño', wow && wow.digest_anchor);
  ok(!!wow && wow._star === 1 && !wow.star_missing, 'C5 el wow la lleva como estrella (no star_missing)');
  eq(wow && wow._star_source, 'dueno', 'C6 la fuente registrada del wow es el dueño');
  const gate = demo.primerPosteoGate({
    star: eff.item, temaFinal: wow.digest_anchor, starMissing: !!wow.star_missing,
    headline: wow.headline, caption: wow.caption, lang: 'en', photoSource: 'ai-generated', digest: d, category: 'otro',
  });
  eq(gate.estrella.esperada, 'The SoulCycle Ride', 'C7 el gate de mostrar espera la estrella del dueño');
  eq(gate.estrella.tema_final, 'The SoulCycle Ride', 'C8 el tema final es la estrella del dueño');
  ok(gate.estrella.ok === true && gate.estrella.sin_confirmar === false, 'C9 el registro sale ok y confirmado (nunca más esperada null)');
  const cands = cd.questionCandidatesOf(d);
  ok(!cands.some((c) => c.tipo === 'estrella'), 'C10 sin candidatas de estrella: nada que volver a dudar', cands.map((c) => c.motivo || c.tipo));
}

/* ------------------------------------------------ D · casos sanos */
seccion('D · casos sanos: el flujo de hoy, sin frenos nuevos');
{
  // D1: el dueño confirma la minada (toca la opción / la nombra y calza).
  const dOk = conDeclaracion('Rotor Set Install');
  eq(cd.duenoStarConflictoOf(dOk), null, 'D1 confirmar la minada no es conflicto');
  const wowOk = cd.deriveFirstPostWow(dOk, { category: 'otro', lang: 'en' });
  ok(!!wowOk && wowOk.digest_anchor === 'Rotor Set Install' && wowOk._star === 1 && !wowOk.star_missing,
    'D2 el wow corona la minada confirmada, como hoy', wowOk && wowOk.digest_anchor);
  // D2: sin declaración, paridad total con la base.
  const dSin = digestCorrida();
  const candsSin = cd.questionCandidatesOf(dSin);
  const wowSin = cd.deriveFirstPostWow(dSin, { category: 'otro', lang: 'en' });
  if (cdB) {
    const candsSinB = cdB.questionCandidatesOf(digestCorrida());
    // (ACTUALIZADO CON CAUSA — cierre 6) la única diferencia contra
    // la base es la candidata de piso que abre la lista; el resto,
    // idéntico y en el mismo orden.
    eq(JSON.stringify(candsSin.slice(1)), JSON.stringify(candsSinB), 'D3 sin declaración: candidatas idénticas a la base salvo el piso del cierre 6 que abre');
    ok(candsSin.length === candsSinB.length + 1 && candsSin[0].motivo === 'sin_senal_ig', 'D3b la diferencia es exactamente la candidata de piso, primera');
    const wowSinB = cdB.deriveFirstPostWow(digestCorrida(), { category: 'otro', lang: 'en' });
    ok(!!wowSin && !!wowSinB && wowSin.digest_anchor === wowSinB.digest_anchor && !!wowSin.star_missing === !!wowSinB.star_missing,
      'D4 sin declaración: el wow de la base y el del lote coinciden', { rel: wowSin && wowSin.digest_anchor, base: wowSinB && wowSinB.digest_anchor });
  }
}

/* ------------------------------------------------ E · la declaración genérica no es conflicto (L3 intacto) */
seccion('E · declaración genérica o fragmento: L3 la trata como no declarada');
{
  for (const g of ['proyecto', 'cafe', 'running', 'From USD']) {
    eq(cd.duenoStarConflictoOf(conDeclaracion(g)), null, 'E · «' + g + '» no nace conflicto');
  }
  const candsGen = cd.questionCandidatesOf(conDeclaracion('proyecto'));
  ok(!candsGen.some((c) => c.motivo === 'estrella_dueno_sin_encaje'), 'E5 la genérica no produce la candidata del conflicto');
}

/* ------------------------------------------------ F · control contra la base v1104 */
seccion('F · control contra la base: la sustitución silenciosa se reproduce');
if (cdB) {
  eq(typeof cdB.duenoStarConflictoOf, 'undefined', 'F1 la base no conoce el conflicto (la clase no existía)');
  const dB = conDeclaracion(DECL);
  dB.question_candidates = cdB.questionCandidatesOf(dB);
  ok(!dB.question_candidates.some((c) => c.motivo === 'estrella_dueno_sin_encaje'), 'F2 la base no registra conflicto alguno', dB.question_candidates.map((c) => c.motivo || c.tipo));
  const qB = cdB.trialQuestionFor(dB, { lang: 'en', answered: { estrella: true, rubro: true } });
  eq(qB, null, 'F3 la base, con la respuesta guardada, no pregunta nada (el silencio de la corrida)');
  const wowB = cdB.deriveFirstPostWow(conDeclaracion(DECL), { category: 'otro', lang: 'en' });
  ok(!!wowB && wowB.digest_anchor === 'Rotor Set Install' && wowB.star_missing === true,
    'F4 la base diseña sobre la minada sin confirmar (la sustitución, reproducida)', wowB && wowB.digest_anchor);
} else {
  console.log('  (sin árbol base: control omitido)');
}

/* ------------------------------------------------ G · cableado y stamps (estática) */
seccion('G · cableado en server.js y en el front + stamps');
{
  ok(count(SERVER_SRC, 'estrella_vinculante') >= 2, 'G1 server.js sella la vinculante en la puerta');
  ok(SERVER_SRC.includes('estrella_conflicto_vista'), 'G2 server.js lee la vista del conflicto');
  ok(SERVER_SRC.includes('_trialDigestBuilt.question_candidates = clientDigest.questionCandidatesOf(_trialDigestBuilt)'),
    'G3 buildTrialDigest recomputa las candidatas con la declaración mapeada');
  ok(SERVER_SRC.includes("const BUILD_ID = '20261105-v1105';"), 'G4 BUILD_ID v1105');
  ok(PRUEBA_SRC.includes('askConflictoVista') && PRUEBA_SRC.includes("fd.append('estrella_conflicto_vista', askConflictoVista)"),
    'G5 prueba.html recuerda la vista y la devuelve en el reenvío');
  ok(EN_PRUEBA_SRC.includes('askConflictoVista') && EN_PRUEBA_SRC.includes("fd.append('estrella_conflicto_vista', askConflictoVista)"),
    'G6 en-prueba.html espeja el mismo cableado');
  ok(APPJS_SRC.includes("const PZ_BUILD = '20261105-v1105';"), 'G7 PZ_BUILD v1105 (paridad con BUILD)');
  ok(INDEX_SRC.includes('/app.js?v=751'), 'G8 el index ES sirve app.js?v=751');
  ok(count(CD_SRC, 'estrella_dueno_sin_encaje') >= 3, 'G9 la clase del conflicto vive en client-digest (candidata + puerta)');
  if (APPJS_BASE) {
    const defs = (s) => { const out = []; const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g; let m; while ((m = re.exec(s))) out.push(m[1]); return out.sort().join(','); };
    eq(defs(APPJS_SRC), defs(APPJS_BASE), 'G10 app.js: el set de definiciones es idéntico al de la base (solo cambia el stamp) — funciones auditadas 1/1');
  }
}

/* ------------------------------------------------ H · boot smoke */
async function boot() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 35800 + Math.floor(Math.random() * 150);
  const base = 'http://127.0.0.1:' + port;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-cierre5-'));
  const nmFallback = path.join(os.homedir(), 'workspace', 'posta', 'node_modules');
  const child = spawn('node', ['server.js'], {
    cwd: REL,
    env: {
      ...process.env, PORT: String(port), DATA_DIR: dataDir,
      NODE_PATH: process.env.NODE_PATH || (fs.existsSync(nmFallback) ? nmFallback : ''),
      ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    let version = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { const r = await fetch(base + '/api/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
      await sleep(1500);
    }
    ok(!!version, 'H1 el servidor botea y /api/version responde', version || out.slice(-300));
    eq(version && version.build, '20261105-v1105', 'H2 el build servido es el del lote');
    const rf = await fetch(base + '/api/founders');
    const jf = await rf.json().catch(() => null);
    ok(rf.status === 200 && !!jf && jf.ok === true, 'H3 /api/founders responde 200 ok', { status: rf.status, body: jf });
    const rp = await fetch(base + '/prueba');
    ok(rp.status === 200, 'H4 la página de la prueba sirve', { status: rp.status });
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  seccion('H · boot aislado');
  await boot();
  console.log('\n=== LOTE SOULCYCLE-CIERRE-5: ' + pass + ' ok · ' + fail + ' MAL ===');
  if (failures.length) console.log('Fallas: ' + failures.join(' | '));
  process.exit(fail ? 1 : 0);
})();
