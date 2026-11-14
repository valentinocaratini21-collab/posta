// test-lote-semana-nunca-incompleta.js
// LOTE SEMANA-NUNCA-INCOMPLETA — corrección de Valentino (13/11 20:20,
// textual: «no se puede declarar incompleta / eso no puede suceder»)
// sobre los frenos de Tartine recién aterrizados (v1024, piezas P1/P2/P7):
//   La semana de prueba NUNCA se declara incompleta. «Incompleta» no
//   existe como resultado ni como estado para el cliente, en ninguna
//   superficie ni copy. La semana NO se entrega hasta estar completa
//   y la cadena SIGUE TRABAJANDO hasta completarla (la misma vara de
//   perfección antes que velocidad del primer posteo); mientras
//   tanto, la espera sigue siendo el estado de armado honesto.
// Qué cambia (solo server.js):
//   (a) Fuera la declaración: los eventos trial_import_incompleta y
//       trial_semana_incompleta y sus logs «INCOMPLETA visible» ya no
//       existen; quedan registros internos de diagnóstico del equipo
//       (trial_import_en_armado / trial_rescate_en_armado — ninguna
//       superficie del cliente los lee). El estado terminal
//       'frenada' de rescate_semana sale: la pieza sin logo queda
//       cadena 'en-rescate', estado 'en-armado', con su motivo.
//   (b) La cadena sigue trabajando: scheduleWeekRescue re-arma
//       pasadas (token por cadena, máx. SEMANA_REARME_MAX_PASADAS,
//       delay SEMANA_REARME_DELAY_MS) mientras queden piezas en
//       armado, re-resolviendo el logo del digest fresco en cada
//       pasada; cada intento sigue gateado por el tope de gasto
//       vigente (costs.demoAiCapOk en rescuePieceWithSeal).
//   (c) Queda intacto de Tartine: la creación tardía de posteos
//       (P1), el contador de entregables (P2), el héroe provisorio
//       (P3) y el freno fail-closed sin logo (P7: el gate y el
//       rescate siguen sin entregar ni gastar sin archivo de logo).
// Se corre desde la raíz del release:
//   DATA_DIR=$(mktemp -d) NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-semana-nunca-incompleta.js
// Control contra la base v1024: PZ_ROOT=<base> (las aserciones del
// comportamiento nuevo caen ahí: es la declaración vieja reproducida;
// las de «lo que queda de Tartine» pasan en ambos árboles).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DEMO = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const PRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
const ENPRUEBA = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

const demo = require(path.join(ROOT, 'demo'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
function seccion(s) { console.log('\n[' + s + ']'); }

const iRescate = SERVER.indexOf('async function scheduleWeekRescue');
const cuerpoRescate = iRescate >= 0 ? SERVER.slice(iRescate, iRescate + 20000) : '';
const iRescatePieza = SERVER.indexOf('async function rescuePieceWithSeal');
const cuerpoPieza = iRescatePieza >= 0 ? SERVER.slice(iRescatePieza, iRescatePieza + 4000) : '';

/* ── A · Censo cero de la declaración ──────────────────────────── */
seccion('A · ninguna superficie declara la semana incompleta');
{
  eq(count(SERVER, 'trial_import_incompleta'), 0, 'A1 el evento trial_import_incompleta ya no existe en server.js');
  eq(count(SERVER, 'trial_semana_incompleta'), 0, 'A2 el evento trial_semana_incompleta ya no existe en server.js');
  ok(!/INCOMPLETA visible|semana INCOMPLETA|semana importada INCOMPLETA/.test(SERVER), 'A3 ningún log declara la semana incompleta');
  eq(count(SERVER, "estado = 'frenada'"), 0, "A4 el estado terminal 'frenada' ya no se escribe en ninguna pieza");
  eq(count(SERVER, "estado: 'frenada'"), 0, "A5 tampoco existe 'frenada' como estado literal de payload");
  ok(SERVER.includes("evTrack(userId, 'trial_import_en_armado'"), 'A6 la importación registra piezas en armado como trabajo en curso (trial_import_en_armado)');
  ok(cuerpoRescate.includes("evTrack(ownerId, 'trial_rescate_en_armado'"), 'A7 el rescate registra pendientes como sigue-en-armado (trial_rescate_en_armado), diagnóstico interno');
  ok(!/incomplet/i.test(PRUEBA), 'A8 prueba.html: cero copy de incompletud');
  ok(!/incomplet/i.test(ENPRUEBA), 'A9 en-prueba.html: cero copy de incompletud');
  ok(!/semana incompleta|incomplete week|week is incomplete/i.test(APPJS), 'A10 app.js: ninguna superficie del cliente declara la semana incompleta (su unico «incompleta» es un comentario interno sobre una respuesta del servidor en la reconciliacion del feed — no es copy ni estado, y no es de la prueba)');
  // El estado honesto de armado NO se tocó: sigue existiendo como
  // estado de espera (no es declaración de resultado).
  ok(SERVER.includes('armando: true') || cuerpoRescate.includes('armando === true'), 'A11 el estado honesto «armando» sigue siendo el estado de espera');
}

/* ── B · La cadena sigue trabajando (re-arme de pasadas) ───────── */
seccion('B · re-arme de pasadas del rescate de fondo');
{
  ok(SERVER.includes('const SEMANA_REARME_MAX_PASADAS = 6;'), 'B1 la cadena de pasadas tiene su borne (6 pasadas)');
  ok(SERVER.includes('const SEMANA_REARME_DELAY_MS = 60 * 1000;'), 'B2 las pasadas se espacian (60 s)');
  ok(cuerpoRescate.includes('const tokenCadena = semanaRearmeToken(o.cacheKey, o.intento == null);'), 'B3 cada invocación fresca abre cadena (token) y las re-programadas lo heredan');
  ok(cuerpoRescate.includes('finR.posts[pc.idx | 0].armando === true'), 'B4 el re-arme mira las piezas que SIGUEN en armado en el caché fresco');
  ok(cuerpoRescate.includes('(o.intento | 0) + 1 <= SEMANA_REARME_MAX_PASADAS'), 'B5 el re-arme corta en el borne de pasadas (no es infinito)');
  ok(cuerpoRescate.includes('trialLogoAbsPath(finR.digest) || o.logoPath || null'), 'B6 el logo se re-resuelve del digest fresco en cada pasada');
  ok(cuerpoRescate.includes('if (!semanaRearmeVigente(o.cacheKey, tokenCadena)) return;'), 'B7 un timer de una cadena vieja no corre: manda la cadena más nueva');
  ok(cuerpoRescate.includes('scheduleWeekRescue({ ...o, pieces: pendR, logoPath: logoR, intento: intentoR })'), 'B8 la pasada siguiente re-invoca el rescate SOLO con las piezas pendientes');
  ok(cuerpoRescate.includes("semanaRearmeToken(o.cacheKey, true); // semana completa"), 'B9 con la semana completa la cadena se cierra (token invalidado)');
  // El gasto sigue gateado por el tope vigente y el freno de logo es
  // previo a cualquier generación (fail-closed intacto de Tartine).
  ok(cuerpoPieza.includes('if (!logoPath) return null;'), 'B10 sin archivo de logo el rescate frena ANTES de generar (fail-closed)');
  ok(cuerpoPieza.includes('costs.demoAiCapOk()'), 'B11 cada intento sigue gateado por el tope de gasto vigente (demoAiCapOk)');
  ok(cuerpoPieza.indexOf('if (!logoPath) return null;') < cuerpoPieza.indexOf('generateNoPhotoFirstPostImage'), 'B12 el freno de logo precede a la generación: sin logo, la pasada no gasta');

  // Unidad de los helpers de token (extraídos del fuente real y
  // evaluados en VM): la guarda anti-doble-cadena funciona.
  const iH = SERVER.indexOf('const SEMANA_REARME_MAX_PASADAS');
  const iF = SERVER.indexOf('function semanaRearmeVigente');
  let helpersOk = false, t1, t2, t3;
  if (iH >= 0 && iF > iH) {
    const bloque = SERVER.slice(iH, SERVER.indexOf('}', SERVER.indexOf('return semanaRearmeTokens.get(cacheKey) === token;', iF)) + 1);
    try {
      const ctx = { Map };
      vm.createContext(ctx);
      vm.runInContext(bloque + '\nthis.__t = { semanaRearmeToken, semanaRearmeVigente, MAX: SEMANA_REARME_MAX_PASADAS, DELAY: SEMANA_REARME_DELAY_MS };', ctx);
      const T = ctx.__t;
      t1 = T.semanaRearmeToken('ig-a', true);            // cadena 1
      const vigente1 = T.semanaRearmeVigente('ig-a', t1);
      t2 = T.semanaRearmeToken('ig-a', false);           // pasada: hereda
      t3 = T.semanaRearmeToken('ig-a', true);            // cadena nueva
      helpersOk = vigente1 === true && t2 === t1 && t3 !== t1
        && T.semanaRearmeVigente('ig-a', t1) === false   // la vieja ya no manda
        && T.semanaRearmeVigente('ig-a', t3) === true
        && T.MAX === 6 && T.DELAY === 60000;
    } catch (e) { helpersOk = false; }
  }
  ok(helpersOk, 'B13 unidad VM: el token invalida la cadena vieja y hereda en las pasadas', { t1, t2, t3 });

  // Contrato del filtro de pendientes: selecciona exactamente las
  // piezas que siguen en armado (la misma expresión del fuente).
  const postsFake = [{ armando: false }, { armando: true }, { armando: true }, {}];
  const piecesFake = [{ idx: 0 }, { idx: 1 }, { idx: 2 }, { idx: 3 }];
  const pendFake = piecesFake.filter((pc) => postsFake[pc.idx | 0] && postsFake[pc.idx | 0].armando === true).map((p) => p.idx);
  eq(JSON.stringify(pendFake), JSON.stringify([1, 2]), 'B14 el filtro de pendientes deja solo las piezas en armado');
}

/* ── C · Lo que queda de Tartine (el freno sin la declaración) ─── */
seccion('C · de Tartine queda todo lo que no declara');
{
  ok(!cuerpoRescate.includes("return { applied: false, reason: 'imported' }"), 'C1 el rescate sigue sin abortar cuando la semana se importó');
  ok(cuerpoRescate.includes('crearPosteoRescateTardio(ownerId, finP, idxP)'), 'C2 la creación tardía de posteos en la cuenta dueña sigue (P1)');
  ok(SERVER.includes("send('meta', { total: n })"), 'C3 el stream sigue emitiendo el total del spec (P2)');
  ok(PRUEBA.includes('countedIdx') && PRUEBA.includes('entregableTF'), 'C4 el contador del cliente sigue contando solo entregables (P2)');
  ok(SERVER.includes('provisorio: true'), 'C5 el héroe provisorio con foto real sigue (P3)');
  const base = { star: 'Morning Bun', temaFinal: 'Morning Bun', headline: 'Morning Bun', caption: 'Morning Bun at Tartine Bakery.', lang: 'en' };
  const gSin = typeof demo.primerPosteoGate === 'function' ? demo.primerPosteoGate({ ...base, photoSource: 'ai-generated', logoFileExists: false }) : null;
  ok(!!gSin && gSin.veredicto.pasa === false && gSin.veredicto.motivos.includes('sin-archivo-de-logo'), 'C6 el gate sigue fail-closed sin archivo de logo (P7: no se muestra)');
  ok(cuerpoRescate.includes("ent7.estado = 'en-armado'; ent7.motivo = 'sin-archivo-de-logo'"), 'C7 la pieza sin logo queda EN ARMADO con su motivo registrado, no frenada');
  ok(cuerpoRescate.includes("ent7.cadena = 'en-rescate'"), 'C8 la pieza sin logo sigue en la cadena de rescate');
}

/* ── D · Boot smoke ────────────────────────────────────────────── */
seccion('D · boot smoke del servidor');
async function bootSmoke() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 35650 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-nunca-incompleta-'));
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    const t0 = Date.now();
    let version = null;
    while (Date.now() - t0 < 90000) {
      try {
        const r = await fetch('http://127.0.0.1:' + port + '/api/version');
        if (r.ok) { version = await r.json(); break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    ok(!!version && !!version.build, 'D1 el servidor botea y /api/version responde', version || out.slice(-300));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await bootSmoke();
  console.log('\n════════════════════════════════════════════════════');
  console.log('LOTE SEMANA-NUNCA-INCOMPLETA: ' + pass + ' ok · ' + fail + ' MAL');
  if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})();
