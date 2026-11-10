#!/usr/bin/env node
/* test-lote-puerta-supervision-v854.js — LOTE PUERTA DE SUPERVISIÓN v854:
   DIAGNÓSTICO + FIX.
   Diagnóstico (9/11, en vivo sobre v851): la puerta no retuvo NINGÚN mensaje
   de user 12 (22 mensajes, todos respondidos directo por el cerebro;
   pendientes 0). Tres pasos:
   (1) Los logs de Railway con '[supervision] puerta falló' NO son verificables
       desde acá (sin CLI ni endpoint de logs) Y la línea es código muerto en
       la práctica: puerta() nunca lanza (devuelve {ok:false}), así que el
       log del llamador no puede saltar ni aunque la puerta falle en cada
       turno. El fail-open era SILENCIOSO.
   (2) SUPERVISION_OFF no se lee (sin endpoint que lo exponga): queda como
       causa más probable por descarte; la observabilidad de este lote es lo
       que la hace determinable sin Railway.
   (3) business_dna de user 12 no se lee por endpoint admin (todas las rutas
       de ADN piden sesión de usuario). Evidencia conductual: el cerebro
       calcula needDna con EL MISMO chequeo sobre LA MISMA fila en el mismo
       flujo, y con needDna el prompt lleva la guía de entrevista obligatoria
       (una pregunta por mensaje); en 22 turnos el cerebro no hizo NI UNA
       pregunta de ADN (preguntó lo suyo, ej. la pregunta de los lunes) →
       ADN completo → la exención NO aplica. Causa descartada.
   Además se descartó el fail-open por tabla: db.js crea supervision_pendientes
   en el esquema de arranque (cada boot), así que la tabla existe en producción.
   Fix: (a) exención ADN ANGOSTADA — solo cuando la entrevista está EN CURSO
   en este turno (entrevistaEnCurso: sin mensaje previo del asistente, o el
   último mensaje del asistente preguntó por ADN); (b) el dueño (user 12)
   NUNCA está exento; (c) observabilidad: cada turno registra su decisión
   ('retenido' | 'exento_adn' | 'apagado_off' | 'fallo_puerta') en
   supervision_decisiones, legible en GET /api/admin/supervision/decisiones;
   (d) el fail-open ahora se registra Y se loguea (antes era silencioso).
   El drill en vivo antes del 1/12 es acción posterior, no código.

   Uso:  node test-lote-puerta-supervision-v854.js            (desde la raíz del árbol)
         node test-lote-puerta-supervision-v854.js <dir>      (dir con server.js en la raíz)
   Autónomo (patrón de las suites del repo): node:sqlite + spawn + fetch, sin
   harness externo. Bootea el server con DATA_DIR en /tmp (nunca producción).

   Parte 0: pines del árbol base (v851) + marcadores del lote.
   Partes 1-2: estáticas (servidor / módulo).
   Parte 3: boot aislado (gate ON) — puerta, exención angostada, dueño, decisiones, fail-open.
   Parte 4: boot con SUPERVISION_OFF=1 — bypass solo suites + decisión 'apagado_off'.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;

let fails = 0, total = 0;
const t = {
  check(id, msg, cond) {
    total++;
    if (cond) console.log('  ✓', id, msg);
    else { fails++; console.error('  ✗', id, msg); }
  },
  summary() {
    console.log(`\n— lote-puerta-supervision-v854: ${total - fails}/${total} ok${fails ? `, ${fails} FALLOS` : ''}`);
    process.exitCode = fails ? 1 : 0;
  },
};

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

// PINS — base v851 + lote v854 (se re-pinean al re-basar; el valor que importa
// es el BUILD estampado y que los archivos sean los del lote).
const PINS = {
  server: '3a7c112e8047e0cb7754a8152533bdbc',
  db: 'ce3e518b7a78c79a8dfd8bda05f95522',
  'supervision-chat': 'da3e47ee64b8d938bbe75d559b407275',
};
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');
const mod = fs.readFileSync(path.join(TREE, 'supervision-chat.js'), 'utf8');

t.check('0a', 'BUILD v854 (estampado)', srv.includes("const BUILD_ID = '20261105-v854'"));
t.check('0b', 'cero BUILD v851 en server.js', !srv.includes('20261105-v851'));
if (PINS.server) t.check('0c', 'md5 server.js', md5(path.join(TREE, 'server.js')) === PINS.server);
if (PINS.db) t.check('0d', 'md5 db.js', md5(path.join(TREE, 'db.js')) === PINS.db);
if (PINS['supervision-chat']) t.check('0e', 'md5 supervision-chat.js', md5(path.join(TREE, 'supervision-chat.js')) === PINS['supervision-chat']);

// ---- 1 · estáticas del servidor ----
t.check('1a', 'la puerta sigue cableada (server.js)', srv.includes('supervisionChat.puerta'));
t.check('1b', 'exención angostada: entrevistaEnCurso en el gate', srv.includes('supervisionChat.entrevistaEnCurso(clean, dnaEntrevista)'));
t.check('1c', 'dueño nunca exento (OWNER_USER_ID)', srv.includes('uidChat !== OWNER_USER_ID'));
t.check('1d', 'cada turno registra su decisión', srv.includes("registrarDecision(db, { userId: uidChat, decision: 'retenido'") && srv.includes("decision: 'exento_adn'") && srv.includes("decision: 'apagado_off'") && srv.includes("decision: 'fallo_puerta'"));
t.check('1e', 'fail-open con voz: ok:false se registra y se loguea', srv.includes("puerta no retuvo, sigue la IA"));
t.check('1f', 'ruta GET /api/admin/supervision/decisiones', srv.includes("app.get('/api/admin/supervision/decisiones'"));
t.check('1g', 'decisiones usa requireAdminToken', (() => { const i = srv.indexOf("app.get('/api/admin/supervision/decisiones'"); const seg = srv.slice(i, i + 400); return seg.includes('requireAdminToken'); })());
t.check('1h', 'la exención ancha v831 ya no está (dnaEntrevista sola no exime)', !srv.includes("SUPERVISION_OFF !== '1' && !dnaEntrevista"));

// ---- 2 · estáticas del módulo y del esquema ----
t.check('2a', 'el módulo exporta entrevistaEnCurso/preguntaADN/registrarDecision/resumenDecisiones', ['entrevistaEnCurso', 'preguntaADN', 'registrarDecision', 'resumenDecisiones'].every((f) => mod.includes(f)));
t.check('2b', 'entrevistaEnCurso: sin asistente previo → en curso', mod.includes('if (!asistentes.length) return true'));
t.check('2c', 'entrevistaEnCurso: último asistente preguntó ADN → en curso', mod.includes('if (preguntaADN(ultimo && ultimo.text)) return true'));
t.check('2d', 'entrevistaEnCurso: con >1 asistente y sin pregunta ADN → NO en curso', mod.includes('if (asistentes.length === 1) return true'));
t.check('2e', 'registrarDecision nunca lanza', mod.includes("function registrarDecision(db, o)") && mod.includes("console.error('[supervision] no se pudo registrar la decisión:'"));
t.check('2f', 'resumenDecisiones: conteo por día + recientes', mod.includes('GROUP BY fecha, decision') && mod.includes('ORDER BY id DESC LIMIT 50'));
t.check('2g', 'db.js: tabla supervision_decisiones en el esquema de arranque', dbjs.includes('CREATE TABLE IF NOT EXISTS supervision_decisiones'));
t.check('2h', 'db.js: índices de decisiones', dbjs.includes('idx_supervision_decisiones_dia') && dbjs.includes('idx_supervision_decisiones_usuario'));

// ---- 3 · boot aislado (gate ON) ----
const PORT = 34586;
const ADMIN_TOKEN = 'boot-test-token-v854';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-puerta-v854-'));
const BASE = `http://127.0.0.1:${PORT}`;
let db = null;
let srvProc = null;
let bootLog = '';

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function waitPortFree(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { await fetch(`${BASE}/api/version`); } catch (e) { return true; }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function boot(extraEnv) {
  return new Promise((resolve) => {
    srvProc = spawn('node', ['server.js'], {
      cwd: TREE, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN, SUPERVISION_HOOK_URL: '', ...extraEnv },
    });
    let out = '';
    srvProc.stdout.on('data', (d) => { out += String(d); bootLog += String(d); });
    srvProc.stderr.on('data', (d) => { out += String(d); bootLog += String(d); });
    setTimeout(() => resolve(out), 500);
  });
}
function killBoot() {
  return new Promise((res) => {
    if (!srvProc) return res();
    const p = srvProc; srvProc = null;
    let done = false;
    const finish = () => { if (!done) { done = true; res(); } };
    p.once('exit', finish);
    p.kill('SIGTERM');
    setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} setTimeout(finish, 800); }, 3000);
  }).then(async () => {
    for (let i = 0; i < 40; i++) {
      try { await fetch(`${BASE}/api/version`); } catch (e) { return; }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log('  (aviso: el puerto 34586 siguió ocupado 20 s tras matar el boot)');
  });
}
async function register(email) {
  const rr = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234', business_name: 'Test ' + email }),
  });
  const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
  return { status: rr.status, cookie: cookies.map((c) => c.split(';')[0]).join('; ') };
}
async function api(cookie, method, p, body) {
  const rr = await fetch(BASE + p, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}
const uidOf = (email) => { const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email); return row ? row.id : 0; };
const sqlGet = (q, ...a) => db.prepare(q).get(...a);
const decisionesDe = (uid) => {
  const row = sqlGet(`SELECT
    SUM(CASE WHEN decision = 'retenido' THEN 1 ELSE 0 END) AS retenido,
    SUM(CASE WHEN decision = 'exento_adn' THEN 1 ELSE 0 END) AS exento_adn,
    SUM(CASE WHEN decision = 'apagado_off' THEN 1 ELSE 0 END) AS apagado_off,
    SUM(CASE WHEN decision = 'fallo_puerta' THEN 1 ELSE 0 END) AS fallo_puerta,
    COUNT(*) AS total FROM supervision_decisiones WHERE user_id = ?`, uid);
  return row || { retenido: 0, exento_adn: 0, apagado_off: 0, fallo_puerta: 0, total: 0 };
};
const SALUDO = 'hola! 😄 con qué te ayudo hoy?';
const ACK = 'dale, ya lo vi 😄 te lo reviso y te escribo en un rato.';
const PREGUNTA_ADN = '¿cuál es tu producto o servicio estrella?';

(async () => {
  try {
    await waitPortFree();
    await boot({});
    const booted = await waitBoot();
    t.check('3boot', 'server booteó (/api/version v854)', booted);
    if (!booted) console.log('  (log del boot):\n' + bootLog.slice(-2000));
    db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const v = await api('', 'GET', '/api/version');
    t.check('3v', '/api/version es v854', v.data && v.data.build === '20261105-v854');

    // A: ADN completo → la puerta retiene (regresión: la puerta funciona).
    const a = await register('v854-a@example.com');
    const uidA = uidOf('v854-a@example.com');
    db.prepare('UPDATE users SET concierge=0, is_guest=0 WHERE id=?').run(uidA);
    const dnaCompleto = JSON.stringify({ producto_estrella: 'café de especialidad', cliente_ideal: 'vecinos del barrio', diferencial: 'tostado en casa', tono: 'cercano' });
    db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))`).run(uidA, dnaCompleto);
    const hA = await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    const rA = hA.data || {};
    t.check('3a', 'A (ADN completo): acuse + pending', rA.reply === ACK && rA.pending === true);
    t.check('3a2', 'A: decisión retenido registrada', Number(decisionesDe(uidA).retenido) === 1);

    // B: ADN parcial (falta tono). Turno 1 sin asistente previo → exento
    // (la entrevista está por arrancar). Turno 2 con solo el saludo previo
    // → exento (el cerebro aún no preguntó). Turno 3 con intercambio de
    // posteos y último asistente SIN pregunta ADN → RETENIDO (angostada:
    // en v831 este turno quedaba exento para siempre).
    const b = await register('v854-b@example.com');
    const uidB = uidOf('v854-b@example.com');
    db.prepare('UPDATE users SET concierge=0, is_guest=0 WHERE id=?').run(uidB);
    const dnaParcial = JSON.stringify({ producto_estrella: 'café de especialidad', cliente_ideal: 'vecinos del barrio', diferencial: 'tostado en casa' });
    db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))`).run(uidB, dnaParcial);
    const hB1 = await api(b.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    t.check('3b1', 'B turno 1 (sin asistente previo): saludo sin puerta', (hB1.data || {}).reply === SALUDO && !(hB1.data || {}).pending);
    const hB2 = await api(b.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'assistant', text: SALUDO }, { role: 'user', text: 'buenas' }] });
    t.check('3b2', 'B turno 2 (solo el saludo previo): saludo sin puerta', (hB2.data || {}).reply === SALUDO && !(hB2.data || {}).pending);
    const hB3 = await api(b.cookie, 'POST', '/api/ideas/chat', { messages: [
      { role: 'assistant', text: SALUDO },
      { role: 'user', text: 'quiero un posteo' },
      { role: 'assistant', text: 'dale, lo armamos ahora mismo' },
      { role: 'user', text: 'perfecto, ¿cuándo sale?' },
    ] });
    const rB3 = hB3.data || {};
    t.check('3b3', 'B turno 3 (último asistente SIN pregunta ADN): RETENIDO (angostada)', rB3.reply === ACK && rB3.pending === true);
    const decB = decisionesDe(uidB);
    t.check('3b4', 'B: decisiones exento_adn 2 + retenido 1', Number(decB.exento_adn) === 2 && Number(decB.retenido) === 1 && Number(decB.total) === 3);

    // C: ADN incompleto (sin fila) + último asistente preguntó ADN →
    // entrevista EN CURSO → exento (el usuario está contestando).
    const c = await register('v854-c@example.com');
    const uidC = uidOf('v854-c@example.com');
    db.prepare('UPDATE users SET concierge=0, is_guest=0 WHERE id=?').run(uidC);
    const hC = await api(c.cookie, 'POST', '/api/ideas/chat', { messages: [
      { role: 'assistant', text: PREGUNTA_ADN },
      { role: 'user', text: 'hola' },
    ] });
    t.check('3c', 'C (entrevista en curso): saludo sin puerta', (hC.data || {}).reply === SALUDO && !(hC.data || {}).pending);
    t.check('3c2', 'C: decisión exento_adn registrada', Number(decisionesDe(uidC).exento_adn) === 1);

    // D: DUEÑO (id 12) con ADN incompleto → NUNCA exento: la puerta retiene
    // hasta en el primer turno.
    for (let i = 0; i < 8; i++) await register(`v854-dummy${i}@example.com`);
    const dueno = await register('v854-dueno@example.com');
    const uidDueno = uidOf('v854-dueno@example.com');
    t.check('3d0', 'D: el dueño es el user id 12', uidDueno === 12);
    db.prepare('UPDATE users SET concierge=0, is_guest=0 WHERE id=?').run(uidDueno);
    db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))`).run(uidDueno, dnaParcial);
    const hD = await api(dueno.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    const rD = hD.data || {};
    t.check('3d', 'D (dueño, ADN parcial, primer turno): RETENIDO, no exento', rD.reply === ACK && rD.pending === true);
    t.check('3d2', 'D: decisión retenido (exento_adn 0)', Number(decisionesDe(uidDueno).retenido) === 1 && Number(decisionesDe(uidDueno).exento_adn) === 0);

    // E: endpoint de decisiones: conteo por día + recientes.
    const dec = await api('', 'GET', `/api/admin/supervision/decisiones?dias=7&token=${ADMIN_TOKEN}`);
    const decData = dec.data || {};
    const hoy = (decData.dias || []).find((d) => d.total > 0);
    t.check('3e', 'decisiones 200 con días', dec.status === 200 && Array.isArray(decData.dias));
    t.check('3e2', 'decisiones: retenido 3 (A, B3, D)', hoy && hoy.retenido === 3);
    t.check('3e3', 'decisiones: exento_adn 3 (B1, B2, C)', hoy && hoy.exento_adn === 3);
    t.check('3e4', 'decisiones: apagado_off 0 + fallo_puerta 0', hoy && hoy.apagado_off === 0 && hoy.fallo_puerta === 0);
    t.check('3e5', 'decisiones: recientes con filas (6 turnos hasta acá)', Array.isArray(decData.recientes) && decData.recientes.length >= 6);
    const decSinToken = await api('', 'GET', '/api/admin/supervision/decisiones?dias=7');
    t.check('3e6', 'decisiones sin token → 403', decSinToken.status === 403);

    // F: FAIL-OPEN CON VOZ: sin la tabla, el chat sigue con el cerebro Y la
    // decisión 'fallo_puerta' queda registrada (antes era silencio total).
    db.prepare('DROP TABLE supervision_pendientes').run();
    const hF = await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    const rF = hF.data || {};
    t.check('3f', 'F (sin tabla): el saludo sale igual que hoy', rF.reply === SALUDO && !rF.pending);
    t.check('3f2', 'F: decisión fallo_puerta registrada', Number(decisionesDe(uidA).fallo_puerta) === 1);
    await new Promise((r) => setTimeout(r, 500)); // deja llegar el stderr del log
    t.check('3f3', 'F: el log del boot trae la línea de fallo', bootLog.includes('[supervision] puerta no retuvo, sigue la IA:'));
    await killBoot();

    // ---- 4 · boot con SUPERVISION_OFF=1 (bypass solo suites) ----
    await boot({ SUPERVISION_OFF: '1' });
    t.check('4boot', 'server booteó con SUPERVISION_OFF=1', await waitBoot());
    const e = await register('v854-e@example.com');
    const uidE = uidOf('v854-e@example.com');
    db.prepare('UPDATE users SET concierge=0, is_guest=0 WHERE id=?').run(uidE);
    db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))`).run(uidE, dnaCompleto);
    const hOff = await api(e.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    const rOff = hOff.data || {};
    t.check('4a', 'SUPERVISION_OFF=1: el saludo sale sin puerta', rOff.reply === SALUDO && !rOff.pending);
    t.check('4a2', 'SUPERVISION_OFF=1: decisión apagado_off registrada', Number(decisionesDe(uidE).apagado_off) === 1 && Number(decisionesDe(uidE).retenido) === 0);
    await killBoot();
  } catch (e) {
    t.check('ZZ', 'boot: ' + (e && e.message), false);
    await killBoot();
  } finally {
    try { if (db) db.close(); } catch (e) {}
  }
  t.summary();
})();
