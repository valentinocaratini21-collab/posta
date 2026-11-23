'use strict';
// test-lote-recibo-lista.js — LOTE RECIBO-LISTA (asiento del tablero
// 2026-11-23 00:17, «dale, arma todo»): quien entra a la fila por la
// puerta en modo lista recibe EN EL MOMENTO su recibo por email (su
// lugar en la fila + qué pasa el 1° de febrero), y queda armado el
// único contacto intermedio: el toque de enero («tu lugar sigue
// reservado»), con su ventana, su audiencia y su freno anti-duplicado.
//
// Uso: node test-lote-recibo-lista.js [release|base]
//   release → el árbol del lote: todos los casos en verde.
//   base    → el árbol prístino v1243 (98fc4a63): control — el alta en
//             la lista NO emite ningún email y la tabla no conoce las
//             columnas del recibo.
//
// El correo se verifica contra un Resend falso local (RESEND_API_URL):
// ningún email real sale de esta suite. El stub acepta todo salvo las
// direcciones con «rebota», a las que responde 422 (el rechazo del
// proveedor al despachar).
//
// Casos (release):
//  (1) Alta ES: llega 1 recibo en el momento, en español, con el lugar
//      1 (el conteo real de la fila) y el 1° de febrero; la fila queda
//      recibo_estado='enviado'.
//  (2) Alta duplicada (misma identidad + email): sin segundo recibo,
//      sin segunda fila, el lugar no se mueve.
//  (3) Alta EN: el recibo sale en inglés con el lugar 2.
//  (4) Alta con dirección rechazada por el proveedor (422): la fila
//      queda 'rechazado' (terminal) y un alta posterior que dispara el
//      barrido NO lo reintenta.
//  (5) Toque de enero, contra la misma base ya sembrada, llamando al
//      barrido del módulo con la fecha inyectada: fuera de ventana no
//      sale nada; en ventana sale UNA vez a cada fila vigente (ES y
//      EN, con su lugar); la segunda corrida no manda nada (el freno);
//      con la puerta ya en modo normal tampoco sale, y al volver a
//      modo lista la fila que faltaba recibe el suyo.
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const WHICH = process.argv[2] === 'base' ? 'base' : 'release';
const ROOT = path.join(__dirname, WHICH);
const CONTROL = WHICH === 'base';
const NM = path.join(__dirname, 'release', 'node_modules');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fail++; failures.push(label); console.log('  ✗', label, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 300) : ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function api(port, method, p, body) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j, text };
}

async function waitUp(port, tries = 150) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/version`); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  return false;
}

// --- Resend falso: registra cada payload; 422 para «rebota» ---
const sent = [];
let stub = null, stubPort = 0;
function startStub() {
  return new Promise((resolve) => {
    stub = http.createServer((req, res) => {
      let buf = '';
      req.on('data', (d) => { buf += d; });
      req.on('end', () => {
        let payload = null; try { payload = JSON.parse(buf); } catch (e) {}
        if (payload) sent.push(payload);
        const to = payload && payload.to && payload.to[0] || '';
        res.setHeader('content-type', 'application/json');
        if (String(to).includes('rebota')) {
          res.statusCode = 422;
          res.end(JSON.stringify({ name: 'validation_error', message: 'The recipient address is invalid' }));
        } else {
          res.statusCode = 200;
          res.end(JSON.stringify({ id: 'stub-' + sent.length }));
        }
      });
    });
    stub.listen(0, '127.0.0.1', () => { stubPort = stub.address().port; resolve(); });
  });
}
const para = (addr) => sent.filter((p) => (p.to || []).includes(addr));
async function esperarEmails(addr, n, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (para(addr).length >= n) return true;
    await sleep(250);
  }
  return para(addr).length >= n;
}

let child = null;
async function boot(port) {
  if (!(await portFree(port))) throw new Error(`puerto ${port} ocupado antes del boot`);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `recibo-${WHICH}-`));
  const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: path.join(dataDir, 'media'), ADMIN_TOKEN: 'boot-test-token-recibo', NODE_PATH: NM, OPENAI_API_KEY: '', SESSION_SECRET: 'suite-secret-recibo-lista', DEMO_AI_DAILY_CAP_USD: '0', RESEND_API_KEY: 'suite-key-recibo', RESEND_API_URL: `http://127.0.0.1:${stubPort}/emails` };
  delete env.PUERTA_MODO; // modo lista activo por defecto, como en producción
  child = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));
  const up = await waitUp(port);
  if (!up) throw new Error('el servidor no levantó');
  return dataDir;
}

function killChild() {
  return new Promise((resolve) => {
    if (!child || !child.pid) { child = null; return resolve(); }
    const pid = child.pid;
    const done = () => { child = null; resolve(); };
    child.once('exit', done);
    try { process.kill(pid, 'SIGTERM'); } catch (e) { return done(); }
    setTimeout(() => { try { process.kill(pid, 'SIGKILL'); } catch (e) {} setTimeout(done, 500); }, 8000);
  });
}

(async () => {
  const P = CONTROL ? 34732 : 34731;
  console.log(`\n== LOTE RECIBO-LISTA · árbol ${WHICH} · puerto ${P} ==`);
  await startStub();
  const dataDir = await boot(P);
  const dbPath = path.join(dataDir, 'posta.db');
  try {
    // Vecina: la puerta sigue en modo lista y su mensaje no cambió.
    const modo = await api(P, 'GET', '/api/puerta/modo?lang=es');
    ok(modo.j && modo.j.modo === 'lista', '(0) la puerta sigue en modo lista', modo.j);
    ok((modo.j.mensaje || '').includes('Tu lugar en la fila quedó reservado'), '(0) el mensaje de la puerta es el de siempre (vecina intacta)', modo.j && modo.j.mensaje);

    // (1) Alta ES → recibo en el momento, lugar 1.
    const a1 = await api(P, 'POST', '/api/guest/start', { ig: '@NegocioUno', domain: 'negociouno.com', email: 'dueno@negociouno.com', lang: 'es' });
    ok(a1.j && a1.j.modo_lista === true, '(1) el alta ES entra en la lista', a1.j);
    if (!CONTROL) {
      ok(await esperarEmails('dueno@negociouno.com', 1), '(1) el recibo llega en el momento del alta');
      const m1 = para('dueno@negociouno.com')[0] || {};
      ok((m1.subject || '').includes('tu lugar es el 1'), '(1) el asunto dice el lugar 1', m1.subject);
      ok((m1.html || '').includes('Tu lugar en la fila es el 1'), '(1) el cuerpo dice el lugar en la fila (1)');
      ok((m1.html || '').includes('1° de febrero'), '(1) el cuerpo dice qué pasa el 1° de febrero');
      ok((m1.html || '').includes('Guardá este email: es tu recibo'), '(1) el cuerpo se presenta como recibo');
    }

    // (2) Alta duplicada → nada se duplica.
    const a1b = await api(P, 'POST', '/api/guest/start', { ig: '@NegocioUno', domain: 'negociouno.com', email: 'dueno@negociouno.com', lang: 'es' });
    ok(a1b.j && a1b.j.modo_lista === true, '(2) la re-anotación responde como siempre', a1b.j);
    await sleep(2500);
    {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const filas = db.prepare('SELECT * FROM lista_espera').all();
      ok(filas.length === 1, '(2) sigue habiendo UNA sola fila', filas.length);
      if (!CONTROL) {
        ok(filas[0].recibo_estado === 'enviado' && filas[0].recibo_at > 0, "(2) la fila quedó 'enviado' con su marca", filas[0]);
        ok(para('dueno@negociouno.com').length === 1, '(2) NO llegó un segundo recibo', para('dueno@negociouno.com').length);
      } else {
        const cols = db.prepare('PRAGMA table_info(lista_espera)').all().map((c) => c.name);
        ok(!cols.includes('recibo_estado'), '(2) BASE: la tabla no conoce las columnas del recibo (control)', cols);
        ok(sent.length === 0, '(2) BASE: el alta no emitió NINGÚN email (control)', sent.length);
      }
      db.close();
    }
    if (CONTROL) {
      console.log('\n== control base completo ==');
      return;
    }

    // (3) Alta EN → recibo en inglés, lugar 2.
    const a2 = await api(P, 'POST', '/api/guest/start', { ig: '@BizTwo', domain: 'biztwo.com', email: 'owner@biztwo.com', lang: 'en' });
    ok(a2.j && a2.j.modo_lista === true, '(3) el alta EN entra en la lista', a2.j);
    ok(await esperarEmails('owner@biztwo.com', 1), '(3) el recibo EN llega en el momento');
    const m2 = para('owner@biztwo.com')[0] || {};
    ok((m2.subject || '').includes('your place in line is 2'), '(3) el asunto EN dice el lugar 2', m2.subject);
    ok((m2.html || '').includes('Your place in line is 2') && (m2.html || '').includes('February 1'), '(3) el cuerpo EN dice el lugar y el 1° de febrero');

    // (4) Dirección rechazada por el proveedor → 'rechazado', terminal.
    const a3 = await api(P, 'POST', '/api/guest/start', { ig: '@NegocioTres', domain: 'negociotres.com', email: 'rebota@negociotres.com', lang: 'es' });
    ok(a3.j && a3.j.modo_lista === true, '(4) el alta del que rebota también entra en la lista', a3.j);
    {
      let estado = '';
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        const f = db.prepare('SELECT * FROM lista_espera WHERE email = ?').get('rebota@negociotres.com');
        db.close();
        estado = f ? f.recibo_estado : '';
        if (estado === 'rechazado') break;
        await sleep(300);
      }
      ok(estado === 'rechazado', "(4) el rechazo del proveedor queda 'rechazado' en la fila", estado);
      ok(para('rebota@negociotres.com').length === 1, '(4) hubo UN solo intento de envío al que rebota', para('rebota@negociotres.com').length);
    }

    // (5) Un alta nueva dispara el barrido: el rechazado NO se reintenta
    // y el nuevo recibe su recibo con el lugar 4 (la fila completa).
    const a4 = await api(P, 'POST', '/api/guest/start', { ig: '@NegocioCuatro', domain: 'negociocuatro.com', email: 'dueno@negociocuatro.com', lang: 'es' });
    ok(a4.j && a4.j.modo_lista === true, '(5) el alta 4 entra en la lista', a4.j);
    ok(await esperarEmails('dueno@negociocuatro.com', 1), '(5) el recibo del alta 4 llega');
    const m4 = para('dueno@negociocuatro.com')[0] || {};
    ok((m4.html || '').includes('Tu lugar en la fila es el 4'), '(5) el lugar es el conteo real de la fila (4)', m4.subject);
    await sleep(1500);
    ok(para('rebota@negociotres.com').length === 1, '(5) el barrido disparado NO reintentó al rechazado', para('rebota@negociotres.com').length);
  } finally {
    await killChild();
  }

  if (CONTROL) return;

  // (6) EL TOQUE DE ENERO — sobre la misma base sembrada, llamando al
  // barrido del módulo con la fecha inyectada (el servidor ya bajó: la
  // base es del módulo, sin contención).
  console.log('\n== fase enero: barrido del módulo con fecha inyectada ==');
  process.env.RESEND_API_KEY = 'suite-key-recibo';
  process.env.RESEND_API_URL = `http://127.0.0.1:${stubPort}/emails`;
  delete process.env.PUERTA_MODO;
  const rl = require(path.join(__dirname, 'release', 'recibo-lista.js'));
  const modoLista = require(path.join(__dirname, 'release', 'modo-lista.js'));
  const db = new DatabaseSync(dbPath);
  try {
    const ENERO = Date.UTC(2027, 0, 10, 15, 0, 0);
    const NOVIEMBRE = Date.UTC(2026, 10, 15, 15, 0, 0);
    const antes = sent.length;
    const r0 = await rl.barridoToqueEnero(db, { ahora: NOVIEMBRE });
    ok(r0.activo === false && r0.motivo === 'fuera_de_ventana', '(6) fuera de la ventana de enero el toque NO corre', r0);
    ok(sent.length === antes, '(6) fuera de ventana no salió ningún email', sent.length - antes);

    const r1 = await rl.barridoToqueEnero(db, { ahora: ENERO });
    ok(r1.activo === true && r1.enviados === 3 && r1.rechazados === 1, '(6) en ventana: 3 toques enviados y 1 rechazado (el que rebota)', r1);
    const t1 = para('dueno@negociouno.com').filter((p) => (p.subject || '').includes('sigue reservado'));
    ok(t1.length === 1 && (t1[0].html || '').includes('Es el 1'), '(6) el toque ES llegó una vez, con su lugar (1)', t1.map((p) => p.subject));
    const t2 = para('owner@biztwo.com').filter((p) => (p.subject || '').includes('still reserved'));
    ok(t2.length === 1 && (t2[0].html || '').includes('It is 2'), '(6) el toque EN llegó una vez, con su lugar (2)', t2.map((p) => p.subject));
    const t4 = para('dueno@negociocuatro.com').filter((p) => (p.subject || '').includes('sigue reservado'));
    ok(t4.length === 1 && (t4[0].html || '').includes('Es el 4'), '(6) el toque del alta 4 llegó una vez, con su lugar (4)');
    ok(para('rebota@negociotres.com').length === 2, '(6) al que rebota se le intentó el toque UNA vez (y rebotó)', para('rebota@negociotres.com').length);

    const r2 = await rl.barridoToqueEnero(db, { ahora: ENERO + 24 * 3600 * 1000 });
    ok(r2.activo === true && r2.candidatos === 0 && r2.enviados === 0, '(6) la segunda corrida no encuentra candidatas (el freno)', r2);
    ok(para('dueno@negociouno.com').length === 2, '(6) nadie recibió dos toques: recibo + toque, nada más', para('dueno@negociouno.com').length);

    // La audiencia es la fila VIGENTE: una fila que entra después (ya
    // dentro de enero) recibe el suyo en la próxima corrida; y con la
    // puerta ya normal, el toque se auto-frena.
    modoLista.registrar(db, { ig: 'negociocinco', domain: 'negociocinco.com', email: 'dueno@negociocinco.com', lang: 'es', sinWeb: 0 });
    rl.ensureSchema(db);
    process.env.PUERTA_MODO = 'normal';
    const r3 = await rl.barridoToqueEnero(db, { ahora: ENERO + 2 * 24 * 3600 * 1000 });
    ok(r3.activo === false && r3.motivo === 'puerta_normal', '(6) con la puerta ya normal el toque NO sale', r3);
    ok(para('dueno@negociocinco.com').length === 0, '(6) con la puerta normal la fila nueva no recibió toque');
    delete process.env.PUERTA_MODO;
    const r4 = await rl.barridoToqueEnero(db, { ahora: ENERO + 2 * 24 * 3600 * 1000 });
    ok(r4.activo === true && r4.enviados === 1, '(6) de vuelta en modo lista, la fila vigente que faltaba recibe su toque', r4);
    const t5 = para('dueno@negociocinco.com').filter((p) => (p.subject || '').includes('sigue reservado'));
    ok(t5.length === 1 && (t5[0].html || '').includes('Es el 5'), '(6) el toque de la fila 5 dice su lugar (5)');
    const f5 = db.prepare('SELECT * FROM lista_espera WHERE email = ?').get('dueno@negociocinco.com');
    ok(f5.recibo_estado === 'pendiente', '(6) la fila 5 solo recibió el toque: su recibo sigue pendiente para el disparo del alta (no se mezclan)', f5);
  } finally {
    db.close();
    if (stub) stub.close();
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
})().then(() => {
  console.log(`\n== RESULTADO ${WHICH}: ${pass} ok · ${fail} MAL ==`);
  if (failures.length) { console.log('fallaron:', failures.join(' | ')); }
  process.exit(fail ? 1 : 0);
}).catch(async (e) => {
  console.error('ERROR FATAL:', e);
  await killChild();
  process.exit(2);
});
