#!/usr/bin/env node
/* test-lote-sacar-acuse-fijo.js — LOTE v916 SACAR-ACUSE-FIJO.
   Veto de Valentino 11/11 (respuesta inmediata): el acuse fijo
   «dale, ya lo vi, te lo reviso y te escribo en un rato» NO puede salir
   nunca más del chat. Estaba en tres caminos:
     1) La puerta de supervisión (POST /api/ideas/chat): retenía TODOS los
        mensajes y devolvía el acuse con pending:true; el cerebro solo
        respondía por dictado.
     2) El modo conserje (cerebro pausado por cliente): divertToConcierge
        devolvía CONCIERGE_ACK.
     3) Trial chat-onboarding (kind 'free'): mismo acuse de respaldo.
   El lote RETIRA la puerta (el cerebro responde en el acto) y en los dos
   caminos conserje la respuesta es lo que pasó de verdad, con contenido
   real (el caso #N). NO hay un nuevo texto fijo de espera: si el desvío
   falla en trial, 500 con el mensaje que ya usaba el catch.

   Uso:  node test-lote-sacar-acuse-fijo.js            (desde la raíz del árbol)
         node test-lote-sacar-acuse-fijo.js <dir>      (dir con server.js en la raíz)
   Autónomo (patrón de las suites del repo): node:sqlite + spawn + fetch, sin
   harness externo. Bootea el server con DATA_DIR en /tmp (nunca producción).

   Parte 0: estáticas — el acuse exacto y sus constantes ocurren ×0 en todo
   JS/HTML de producción (los test-*.js viejos que lo pinean son vecinos
   stale: test-lote-supervision-chat.js, test-lote-puerta-supervision-v854.js
   y test-lote-prueba-chat.js; les toca su propio lote).
   Parte 4: boot aislado — saludo en el acto sin SUPERVISION_OFF (antes era
   el acuse), conserje con caso # real, trial free con caso # real, y la
   consola de supervisión sigue viva (cola vacía, sin retenciones nuevas).
*/
'use strict';
// Los bare modules (express, etc.) viven en ~/workspace/posta/node_modules.
// release/ no lleva node_modules (no se pushea); el boot hereda NODE_PATH.
process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';
const fs = require('fs');
const path = require('path');
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
    console.log(`\n— lote-sacar-acuse-fijo: ${total - fails}/${total} ok${fails ? `, ${fails} FALLOS` : ''}`);
    process.exitCode = fails ? 1 : 0;
  },
};

const ACK = 'dale, ya lo vi 😄 te lo reviso y te escribo en un rato.';
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const supModSrc = fs.readFileSync(path.join(TREE, 'supervision-chat.js'), 'utf8');
const scSrc = fs.readFileSync(path.join(TREE, 'support-cases.js'), 'utf8');

// ---- 0 · estáticas: el acuse no existe en producción ----
function prodFiles() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'data' || e.name.startsWith('.git')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if ((e.name.endsWith('.js') || e.name.endsWith('.html')) && !e.name.startsWith('test-lote')) out.push(p);
    }
  })(TREE);
  return out;
}
const files = prodFiles();
const hits = (needle) => files.filter((p) => fs.readFileSync(p, 'utf8').includes(needle));
t.check('0a', 'el acuse exacto ocurre ×0 en JS/HTML de producción', hits(ACK).length === 0);
t.check('0b', 'CONCIERGE_ACK ocurre ×0 en producción', hits('CONCIERGE_ACK').length === 0);
t.check('0c', 'ACK_FALLBACK ocurre ×0 en producción', hits('ACK_FALLBACK').length === 0);
t.check('0d', '«te lo reviso» ocurre ×0 en producción', hits('te lo reviso').length === 0);
t.check('0e', '«ya lo reviso» / «lo estoy revisando» / «te respondo en un rato» ×0 en producción',
  ['ya lo reviso', 'lo estoy revisando', 'te respondo en un rato'].every((n) => hits(n).length === 0));
t.check('0f', 'server.js ya no llama a la puerta', !srv.includes('supervisionChat.puerta'));
t.check('0g', 'server.js ya no registra decisiones de supervisión en el chat', !srv.includes('registrarDecision'));
t.check('0h', 'BUILD v916 estampado ×1, v900 ×0', (srv.match(/20261105-v916/g) || []).length === 1 && !srv.includes('20261105-v900'));
t.check('0i', 'el módulo ya no define puerta/abrirOAdjuntar/setCaso', !supModSrc.includes('function puerta') && !supModSrc.includes('function abrirOAdjuntar') && !supModSrc.includes('function setCaso'));
t.check('0j', 'el módulo ya no exporta puerta/ACK', (() => {
  const m = require(path.join(TREE, 'supervision-chat.js'));
  return m.puerta === undefined && m.abrirOAdjuntar === undefined && m.setCaso === undefined && m.ACK === undefined && m.ACK_USUARIO === undefined
    && typeof m.leerHilo === 'function' && typeof m.listarPendientes === 'function'
    && typeof m.dictar === 'function' && typeof m.guardarBorrador === 'function' && typeof m.resumenDecisiones === 'function';
})());
t.check('0k', 'divertToConcierge devuelve reply con el caso # real (no ack)', scSrc.includes("reply: 'recibido — tu mensaje quedó en el caso #'") && !scSrc.includes('ack: CONCIERGE_ACK'));
t.check('0l', 'el camino conserje de /api/ideas/chat usa dv.reply', srv.includes('pzChatSaveReply(db, uidChat, dv.reply)') && srv.includes('return res.json({ reply: dv.reply, idea: null, concierge: true })'));
t.check('0m', 'trial chat-onboarding usa dv.reply y sin desvío da 500 (sin acuse)', srv.includes('reply = dv.reply') && srv.includes("if (!reply) return res.status(500).json({ ok: false, error: 'No pudimos abrir el chat todavía.' })"));
t.check('0n', 'la consola de supervisión sigue cableada (cola/hilo/dictar/borrador/decisiones)', srv.includes("app.get('/api/admin/supervision/pendientes'") && srv.includes("app.post('/api/admin/supervision/dictar'") && srv.includes('supervisionChat.listarPendientes') && srv.includes('supervisionChat.dictar'));

// ---- 4 · boot aislado ----
const PORT = 34980;
const ADMIN_TOKEN = 'test-admin-v916';
const TRIAL_TEST_KEY = 'test-v916';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-sacar-acuse-'));
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
      env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN, SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY, ...extraEnv },
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
    console.log('  (aviso: el puerto 34980 siguió ocupado 20 s tras matar el boot)');
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
async function api(cookie, method, p, body, timeoutMs = 45000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const rr = await fetch(BASE + p, {
      method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: ctl.signal,
    });
    let data = null; const raw = await rr.text();
    try { data = JSON.parse(raw); } catch (e) {}
    return { status: rr.status, data, raw };
  } catch (e) {
    return { status: 0, data: null, raw: 'FETCH_ERROR: ' + (e && e.message ? e.message : e) };
  } finally { clearTimeout(to); }
}
const uidOf = (email) => { const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email); return row ? row.id : 0; };
const countSup = (uid) => {
  try { const r = db.prepare('SELECT COUNT(*) AS n FROM supervision_pendientes WHERE user_id = ?').get(uid); return (r && r.n) || 0; }
  catch (e) { return 0; }
};
const ackInMsgs = (uid) => {
  try {
    const rows = db.prepare("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant'").all(uid);
    return rows.some((r) => String(r.text || '').includes('ya lo vi') || String(r.text || '').includes('te lo reviso'));
  } catch (e) { return false; }
};
const CASO_RE = /^recibido — tu mensaje quedó en el caso #\d+ y te respondemos en este chat\.$/;

(async () => {
  try {
    await waitPortFree();
    await boot({});
    const booted = await waitBoot();
    t.check('4boot', 'server booteó (/api/version)', booted);
    if (!booted) { console.log('  (log del boot):\n' + bootLog.slice(-2000)); t.summary(); return; }
    // /api/version v916 5/5.
    let okV = 0;
    for (let i = 0; i < 5; i++) {
      try { const v = await api('', 'GET', '/api/version'); if (i === 0) console.log('  (version[0]:', JSON.stringify(v.data), 'status', v.status + ')'); if (v.data && v.data.build === '20261105-v916') okV++; } catch (e) {}
    }
    t.check('4v', '/api/version v916 5/5', okV === 5);
    console.log('  (tmpDir:', tmpDir, '->', fs.readdirSync(tmpDir).join(', ') + ')');
    db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    console.log('  (tablas:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name).join(', ') + ')');

    // Camino 1 (antes: la puerta): saludo en el acto, SIN SUPERVISION_OFF.
    const a = await register('acuse-a@example.com');
    t.check('4a', 'register A ok', a.status === 200 || a.status === 201);
    const uidA = uidOf('acuse-a@example.com');
    t.check('4a1', 'uid A existe', uidA > 0);
    const h1 = await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    t.check('4b', '«hola» SIN SUPERVISION_OFF ya no es el acuse: sale el saludo del cerebro', h1.status === 200 && h1.data && h1.data.reply === 'hola! 😄 con qué te ayudo hoy?');
    t.check('4c', 'sin pending ni supervisión en la respuesta', h1.data && !h1.data.pending && !h1.data.supervision);
    t.check('4d', 'no se retuvo nada: 0 ítems de supervisión para A', countSup(uidA) === 0);
    t.check('4e', 'ninguna fila assistant de A contiene el acuse', !ackInMsgs(uidA));
    const hGet = await api(a.cookie, 'GET', '/api/ideas/chat');
    t.check('4f', 'el historial trae el saludo como assistant', hGet.status === 200 && hGet.data && JSON.stringify(hGet.data).includes('hola! 😄 con qué te ayudo hoy?'));

    // Camino 2 (antes: acuse conserje): caso # real.
    db.prepare('UPDATE users SET concierge = 1 WHERE id = ?').run(uidA);
    const h2 = await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'necesito ayuda con mi factura' }] });
    t.check('4g', 'conserje: 200 + concierge:true + reply con el caso # real', h2.status === 200 && h2.data && h2.data.concierge === true && typeof h2.data.reply === 'string' && CASO_RE.test(h2.data.reply));
    const casoId = h2.data && h2.data.reply ? Number((h2.data.reply.match(/#(\d+)/) || [])[1] || 0) : 0;
    t.check('4g1', 'el caso # existe en support_cases (dedup concierge:<uid>)', casoId > 0 && (() => {
      const row = db.prepare('SELECT * FROM support_cases WHERE id = ?').get(casoId);
      return !!row && row.user_id === uidA && row.dedup_key === 'concierge:' + uidA && String(row.detalle || '').includes('necesito ayuda con mi factura');
    })());
    t.check('4h', 'la respuesta conserje quedó guardada como assistant (no se perdió)', (() => {
      const row = db.prepare("SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").get(uidA);
      return !!row && CASO_RE.test(String(row.text || ''));
    })());
    t.check('4i', 'ninguna fila assistant de A contiene el acuse tras el conserje', !ackInMsgs(uidA));

    // Camino 3 (antes: acuse trial): chat-onboarding free con caso # real.
    const f = await api('', 'POST', '/api/trial/chat-onboarding?test_key=' + TRIAL_TEST_KEY, { kind: 'free', ig: 'cafefalso916', device: 'dvc-v916', text: 'hola, quiero probar' });
    t.check('4j', 'trial free: 200 + ok + reply con el caso # real', f.status === 200 && f.data && f.data.ok === true && typeof f.data.reply === 'string' && CASO_RE.test(f.data.reply));
    t.check('4k', 'trial free: caso_id > 0 y concierge:true', f.data && Number(f.data.caso_id) > 0 && f.data.concierge === true);
    const uidT = f.data ? Number(f.data.user_id) || 0 : 0;
    t.check('4l', 'trial free: el caso # existe y es del invitado', uidT > 0 && (() => {
      const row = db.prepare('SELECT * FROM support_cases WHERE id = ?').get(Number(f.data.caso_id));
      return !!row && row.user_id === uidT && row.dedup_key === 'concierge:' + uidT;
    })());

    // Ningún camino emite el acuse: un mensaje no-saludo (sin IA) tampoco.
    db.prepare('UPDATE users SET concierge = 0 WHERE id = ?').run(uidA);
    const h3 = await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'contame cómo va mi semana' }] });
    t.check('4m', 'mensaje no-saludo sin IA: la respuesta nunca contiene el acuse ni pending', !h3.raw.includes('ya lo vi') && !h3.raw.includes('te lo reviso') && !h3.raw.includes('"pending":true'));

    // La consola de supervisión sigue viva, con la cola vacía.
    const cola = await api('', 'GET', `/api/admin/supervision/pendientes?token=${ADMIN_TOKEN}`);
    t.check('4n', 'la cola de supervisión responde 200 con 0 pendientes', cola.status === 200 && cola.data && cola.data.ok === true && (cola.data.total === 0 || (Array.isArray(cola.data.pendientes) && cola.data.pendientes.length === 0)));
    const dec = await api('', 'GET', `/api/admin/supervision/decisiones?token=${ADMIN_TOKEN}`);
    t.check('4o', 'las decisiones históricas se leen (200)', dec.status === 200);
    // 0 errores en el log del boot.
    t.check('4p', 'boot sin errores (log sin "Error" ni "error" de arranque)', !/Error:|error:/i.test(bootLog) || /0 errors/i.test(bootLog));
  } catch (e) {
    console.error('  ✗ excepción en la suite:', e && e.stack ? e.stack : e);
    fails++;
  } finally {
    try { if (db) db.close(); } catch (e) {}
    await killBoot();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  t.summary();
})();
