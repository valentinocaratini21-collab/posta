'use strict';
/* =====================================================================
   LOTE PUERTA-OPERADOR (23/11 · prioridad N°1 del dueño: «sin eso no
   hay producto») — la puerta del operador recorre el camino completo.

   El defecto (equipo-posty/pruebas-onboarding-23nov/
   DEFECTO-PUERTA-OPERADOR.md): generar CON la llave no persistía
   nada — cada escritura de la semana estaba frenada por la condición
   de modo test y la marca no nacía — y aguas abajo todo consumía
   esa fila inexistente: guest/start 404 no_week, pieza-mano 409/404.

   La salida aprobada (tablero 23/11 14:29, salida 1): el generate
   con llave persiste la semana marcada, con el origen sellado
   ('operador' en el payload y en la marca), en la forma que
   guest/start y pieza-mano consumen. La puerta pública sigue en
   modo lista y las corridas del gate conservan su separación por
   la exclusión del reseteo.

   Qué prueba esta suite (server real, modo lista como producción):
   A · estática: los cuatro puntos de persistencia ya no exigen
       !testMode; trialCacheWriteWeb sin su freno; nace() con la
       excepción operador y el sello de origen; BUILD/sellos.
   B · el camino del operador, entero y contra el server real:
       modo con llave = normal · generate-stream con llave → la
       semana QUEDA en trial_cache con origen 'operador', la marca
       nace activa con origen 'operador' y el candado se registra ·
       sin llave la puerta sigue cerrada (modo lista) y no nace
       nada · con reseteo previo del operador, la semana persiste
       pero la marca NO nace (la exclusión se consume: el gate
       sigue separado) · guest/start con llave = 200 y la semana
       se ve en mi-plan · pieza-mano carga el posteo 1 sobre la
       semana del operador (ok, con posteo real en la cuenta).
   ===================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = 19777;
const BASE = 'http://127.0.0.1:' + PORT;
const KEY = 'puerta-key-qa';
const ADMIN = 'adm-puerta-qa';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'puerta-op-'));

let okN = 0, malN = 0;
function t(nombre, cond, extra) {
  if (cond) { okN++; console.log('  ✓ ' + nombre); }
  else { malN++; console.log('  ✗ MAL — ' + nombre + (extra ? ' :: ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seccionA() {
  console.log('\n== A · estática: la persistencia del operador ==');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const lm = fs.readFileSync(path.join(ROOT, 'linea-mano.js'), 'utf8');
  const idx = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  t('A1 los dos puntos «a mano» cachean sin exigir !testMode (con sello de origen)',
    (srv.match(/if \(igKey\) \{\n        try \{\n          if \(testMode && !outM\.origen\) outM\.origen = 'operador';/g) || []).length === 2);
  t('A2 los dos puntos finales cachean sin exigir !testMode (con sello de origen)',
    (srv.match(/if \(testMode && !out\.origen\) out\.origen = 'operador';/g) || []).length === 2);
  t('A3 ningún INSERT de la semana del generate queda gateado por testMode',
    (srv.match(/if \(!testMode && igKey\) \{\n        try \{\n          const payloadM/g) || []).length === 0
    && (srv.match(/if \(!testMode && igKey\) \{\n      try \{\n        const payload/g) || []).length === 0
    && (srv.match(/if \(!testMode\) trialCacheWriteWeb/g) || []).length === 0
    && (srv.match(/if \(!testMode\) trialLockRecordFor/g) || []).length === 0);
  t('A4 trialCacheWriteWeb ya no frena en modo test',
    srv.includes('if (!trialLock) return;') && !srv.includes('if (testMode || !trialLock) return;'));
  t('A5 los dos nacimientos de la marca pasan operador con la llave',
    (srv.match(/operador: !!testMode/g) || []).length === 2);
  t('A6 nace(): el test sigue sin marcar salvo operador, y la marca sella su origen',
    lm.includes('if (opts.testMode && !opts.operador)') && lm.includes("opts.operador ? 'operador' : ''")
    && lm.includes('ADD COLUMN origen'));
  t('A7 BUILD v1283 en server.js y app.js?v=912 en el index',
    srv.includes("BUILD_ID = '20261105-v1283'") && idx.includes('/app.js?v=912'));
}

function parseSSE(text) {
  const events = [];
  for (const block of String(text).split('\n\n')) {
    let ev = '', data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (ev) { let d = data; try { d = JSON.parse(data); } catch (e) {} events.push({ ev, d }); }
  }
  return events;
}

async function genStream(ig, conLlave) {
  const fd = new FormData();
  fd.append('business', 'Café Puerta QA');
  fd.append('ig', ig);
  fd.append('category', 'cafeteria');
  fd.append('country', 'AR');
  fd.append('tone', 'vos');
  fd.append('lang', 'es');
  const url = BASE + '/api/trial/generate-stream' + (conLlave ? '?test_key=' + KEY : '');
  const res = await fetch(url, { method: 'POST', body: fd });
  const text = await res.text();
  return { status: res.status, events: parseSSE(text), text };
}

async function seccionB() {
  console.log('\n== B · boot: el camino del operador, entero ==');
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: ADMIN, TRIAL_TEST_KEY: KEY, PUERTA_MODO: 'lista' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  const db = () => new DatabaseSync(path.join(TMP, 'posta.db'));
  try {
    let boot = false;
    for (let i = 0; i < 60 && !boot; i++) {
      try { const r = await fetch(BASE + '/api/version'); boot = r.ok; } catch (e) { await sleep(500); }
    }
    t('B0 el servidor levanta en modo lista', boot, log.slice(-300));
    if (!boot) return;

    const modoSin = await (await fetch(BASE + '/api/puerta/modo')).json();
    const modoCon = await (await fetch(BASE + '/api/puerta/modo?test_key=' + KEY)).json();
    t('B1 la puerta pública está en lista y con la llave es normal',
      modoSin.modo === 'lista' && modoCon.modo === 'normal', JSON.stringify({ modoSin, modoCon }));

    // — el generate del operador persiste —
    const g1 = await genStream('puerta.qa', true);
    const done1 = g1.events.find((e) => e.ev === 'done');
    t('B2 generate-stream con llave llega a done con la semana',
      !!done1 && done1.d.out && done1.d.out.ok === true && (done1.d.out.posts || []).length === 5,
      'status=' + g1.status + ' eventos=' + g1.events.map((e) => e.ev).join(','));
    {
      const d = db();
      const row = d.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get('puerta.qa');
      const payload = row && row.payload ? JSON.parse(row.payload) : null;
      t('B3 la semana del operador QUEDÓ en trial_cache, sellada origen=operador',
        !!payload && payload.origen === 'operador' && (payload.posts || []).length === 5);
      const marca = d.prepare('SELECT estado, origen FROM trial_linea_mano WHERE cache_key = ?').get('puerta.qa');
      t('B4 la marca nació activa y sellada origen=operador',
        !!marca && marca.estado === 'activa' && marca.origen === 'operador', JSON.stringify(marca));
      const lock = d.prepare('SELECT ig FROM trial_locks WHERE ig = ?').get('puerta.qa');
      t('B5 el candado de la prueba se registró', !!lock);
      d.close();
    }

    // — sin llave, la puerta sigue cerrada —
    const g2 = await genStream('cerrada.qa', false);
    const falloLista = g2.events.some((e) => e.ev === 'error' || e.ev === 'fail')
      || /modo_lista/.test(g2.text) || g2.status === 409;
    t('B6 sin llave el generate frena por modo lista', falloLista, 'status=' + g2.status);
    {
      const d = db();
      const row = d.prepare('SELECT ig FROM trial_cache WHERE ig = ?').get('cerrada.qa');
      const marca = d.prepare('SELECT cache_key FROM trial_linea_mano WHERE cache_key = ?').get('cerrada.qa');
      t('B7 sin llave no nace ni semana ni marca', !row && !marca);
      d.close();
    }

    // — la exclusión del reseteo sigue separando al gate —
    {
      const d = db();
      d.prepare('INSERT INTO trial_reset_log (kind, value, at, consumida) VALUES (?, ?, ?, 0)').run('ig', 'gate.qa', Date.now());
      d.close();
    }
    const g3 = await genStream('gate.qa', true);
    const done3 = g3.events.find((e) => e.ev === 'done');
    {
      const d = db();
      const row = d.prepare('SELECT ig FROM trial_cache WHERE ig = ?').get('gate.qa');
      const marca = d.prepare("SELECT cache_key FROM trial_linea_mano WHERE cache_key = ? AND estado = 'activa'").get('gate.qa');
      const ex = d.prepare("SELECT consumida FROM trial_reset_log WHERE kind = 'ig' AND value = 'gate.qa'").get();
      t('B8 corrida del gate: la semana persiste pero la marca NO nace (exclusión consumida)',
        !!done3 && !!row && !marca && !!ex && ex.consumida === 1,
        JSON.stringify({ done: !!done3, cache: !!row, marca: !!marca, ex }));
      d.close();
    }

    // — guest/start consume la semana del operador —
    const start = await fetch(BASE + '/api/guest/start?test_key=' + KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ig: 'puerta.qa', email: 'qa+o01@test.local', device: 'qa-device-1', lang: 'es' }),
    });
    const startJson = await start.json().catch(() => ({}));
    const cookie = (start.headers.get('set-cookie') || '').split(';')[0];
    t('B9 guest/start con llave encuentra la semana (202 week_pending, la respuesta de diseño de la línea a mano — no más 404 no_week)',
      start.status === 202 && startJson.week_pending === true && !startJson.no_week,
      'status=' + start.status + ' ' + JSON.stringify(startJson).slice(0, 160));
    t('B10 la entrada deja sesión de invitado', !!cookie && cookie.includes('='));

    const plan = await (await fetch(BASE + '/api/trial/mi-plan', { headers: { cookie } })).json().catch(() => ({}));
    t('B11 la semana se ve en mi-plan',
      plan.ok === true && !!plan.plan && Array.isArray(plan.plan.slots) && plan.plan.slots.length >= 1,
      JSON.stringify(plan).slice(0, 160));

    // — pieza-mano carga el posteo 1 sobre la semana del operador —
    const px = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString('base64');
    const pm = await fetch(BASE + '/api/admin/trial/pieza-mano?token=' + ADMIN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ig: 'puerta.qa', dia: 1, media: px, caption: 'Pieza QA del operador' }),
    });
    const pmJson = await pm.json().catch(() => ({}));
    t('B12 pieza-mano carga el posteo 1 (ok, sin sin_marca ni sin_semana)',
      pm.status === 200 && pmJson.ok === true && pmJson.cache_key === 'puerta.qa' && !!pmJson.user_id,
      'status=' + pm.status + ' ' + JSON.stringify(pmJson).slice(0, 160));
    {
      const d = db();
      const row = d.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get('puerta.qa');
      const payload = row && row.payload ? JSON.parse(row.payload) : null;
      const p0 = payload && payload.posts && payload.posts[0];
      t('B13 la pieza quedó cargada a mano en la semana (mano.cargada_at)',
        !!(p0 && p0.mano && p0.mano.cargada_at));
      d.close();
    }
    // — el gatillo admin importa la semana a la cuenta (el mismo
    // reimport que corre cuando el invitado vuelve a abrir la app) —
    const imp = await fetch(BASE + '/api/admin/trial/importar-semana?token=' + ADMIN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ig: 'puerta.qa' }),
    });
    const impJson = await imp.json().catch(() => ({}));
    t('B14 importar-semana importa la pieza a la cuenta del invitado',
      imp.status === 200 && impJson.ok === true && impJson.aplicado === true && (impJson.importados || 0) >= 1,
      'status=' + imp.status + ' ' + JSON.stringify(impJson).slice(0, 200));
    {
      const d = db();
      const post = d.prepare('SELECT id, caption, status FROM posts WHERE user_id = ? AND caption = ?')
        .get(pmJson.user_id, 'Pieza QA del operador');
      t('B15 el posteo real existe en la cuenta del invitado',
        !!post && !!post.id, JSON.stringify(post));
      d.close();
    }
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await sleep(300);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  seccionA();
  await seccionB();
  console.log('\nTOTAL: ' + okN + ' ok · ' + malN + ' MAL');
  process.exit(malN ? 1 : 0);
})().catch((e) => { console.error('suite explotó:', e); process.exit(1); });
