#!/usr/bin/env node
/* test-lote-supervision-chat.js — LOTE SUPERVISIÓN DEL CHAT (bamboo detrás de Posty).
   Decisión de Valentino 23:38: SIEMPRE, PARA TODOS — cuando un cliente escribe,
   Posty NO responde solo: el intercambio queda pendiente hasta que bamboo dicte.
   El cliente piensa que chatea con Posty (cara Posty, cabeza bamboo; nada en la
   superficie delata a bamboo). Velocidad comprometida: ~1 minuto.

   Uso:  node test-lote-supervision-chat.js            (desde la raíz del árbol)
         node test-lote-supervision-chat.js <dir>      (dir con server.js en la raíz)
   Autónomo (patrón de las suites del repo): node:sqlite + spawn + fetch, sin
   harness externo. Bootea el server con DATA_DIR en /tmp (nunca producción).

   Parte 0: pines del árbol base (v825, prístino) + marcadores del lote.
   Partes 1-3: estáticas (servidor / front / módulo).
   Parte 4: boot aislado con DB sembrada (SUPERVISION_OFF apagado) — la puerta,
   el acuse, la cola, el dictado, el borrador, conserje y el fail-open.
   Parte 5: boot con SUPERVISION_OFF=1 — el cerebro sigue como hoy (bypass solo
   para suites; en producción nunca se configura).

   NOTA: las suites vecinas de chat (chat-nuevo 9g, chat-mejora, chat-foto)
   esperan respuesta instantánea del cerebro/saludo. Con la puerta en vivo,
   ese comportamiento CAMBIA por decisión de Valentino (no es regresión): el
   preparador actualizará esas aserciones al flujo supervisado.
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
    console.log(`\n— lote-supervision-chat: ${total - fails}/${total} ok${fails ? `, ${fails} FALLOS` : ''}`);
    process.exitCode = fails ? 1 : 0;
  },
};

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

// PINS — base v825 PRÍSTINO (verificados en el árbol del fetch; 0 = sin pin todavía).
const PINS = {
  server: 'a794b626ff39c6ae774c3d146aedc7a7',
  app: '55175c23d4ee48404b2cd8cf52328f55',
  db: '9a4b369307118e5e95eafcb3ecdec19e',
  'support-cases': 'b8ca9921c828d21b2bed84a4e0ca37aa',
};
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');
const mod = fs.readFileSync(path.join(TREE, 'supervision-chat.js'), 'utf8');

const lotePresente = srv.includes('supervisionChat.puerta');

// ---- 0 · pines + marcadores del lote ----
t.check('0a', 'BUILD v849 (estampado)', srv.includes("BUILD_ID = '20261105-v849'"));
t.check('0b', 'server.js difiere del pin base', PINS.server === '00000000000000000000000000000000' ? (console.log('  (pin server.js sin rellenar)'), true) : md5(path.join(TREE, 'server.js')) !== PINS.server);
t.check('0c', 'app.js difiere del pin base', PINS.app === '00000000000000000000000000000000' ? (console.log('  (pin app.js sin rellenar)'), true) : md5(path.join(TREE, 'public', 'app.js')) !== PINS.app);
t.check('0d', 'db.js difiere del pin base', PINS.db === '00000000000000000000000000000000' ? (console.log('  (pin db.js sin rellenar)'), true) : md5(path.join(TREE, 'db.js')) !== PINS.db);
t.check('0e', 'support-cases.js sin tocar (pin)', PINS['support-cases'] === '00000000000000000000000000000000' ? (console.log('  (pin support-cases sin rellenar)'), true) : md5(path.join(TREE, 'support-cases.js')) === PINS['support-cases']);
t.check('0f', 'la puerta está cableada (server.js)', lotePresente);
t.check('0g', 'módulo supervision-chat.js existe', fs.existsSync(path.join(TREE, 'supervision-chat.js')));

// ---- 1 · servidor (estático) ----
t.check('1a', 'server.js requiere supervision-chat', srv.includes("require('./supervision-chat')"));
t.check('1b', 'la puerta se abre ANTES del desvío conserje, del saludo y del cerebro', (() => { const g = srv.indexOf('supervisionChat.puerta'); const dv = srv.indexOf("divertToConcierge(db, uidChat, lastUserText)"); const brain = srv.indexOf('out = await chatIdea('); return g > -1 && dv > g && brain > g; })());
t.check('1c', 'costos/rate movidos DESPUÉS de la puerta (no gastan IA supervisada)', (() => { const g = srv.indexOf('supervisionChat.puerta'); const c = srv.indexOf('assertAiOk(uidChat)'); return g > -1 && c > g; })());
t.check('1d', 'la puerta responde pending:true + exchange_id', srv.includes("pending: true") && srv.includes('supervision: { exchange_id'));
t.check('1e', 'la puerta devuelve el acuse fijo (sup.ack), no una respuesta generada', srv.includes('reply: sup.ack'));
t.check('1f', 'fail-open: la puerta rota sigue con la IA', srv.includes('puerta falló, sigue la IA'));
t.check('1g', 'SUPERVISION_OFF=1 existe (bypass solo suites)', srv.includes("SUPERVISION_OFF !== '1'"));
t.check('1h', 'ruta GET /api/admin/supervision/chat', srv.includes("app.get('/api/admin/supervision/chat'"));
t.check('1i', 'ruta GET /api/admin/supervision/pendientes', srv.includes("app.get('/api/admin/supervision/pendientes'"));
t.check('1j', 'ruta POST /api/admin/supervision/dictar', srv.includes("app.post('/api/admin/supervision/dictar'"));
t.check('1k', 'ruta POST /api/admin/supervision/borrador', srv.includes("app.post('/api/admin/supervision/borrador'"));
t.check('1l', 'las 4 rutas usan requireAdminToken', (() => { const i = srv.indexOf("app.get('/api/admin/supervision/chat'"); const seg = srv.slice(i, i + 3000); return (seg.match(/requireAdminToken/g) || []).length >= 4; })());
t.check('1m', 'GET /api/ideas/chat devuelve id', srv.includes('SELECT id, role, text, created_at FROM chat_messages'));
t.check('1n', 'el panel suma supervision_pendientes (sin tocar buildOwnerPanel)', srv.includes('panel.supervision_pendientes = supervisionChat.listarPendientes'));
t.check('1o', 'conserje sigue cableado: el pendiente también abre caso', srv.includes("divertToConcierge(db, uidChat, sup.texto)"));
t.check('1p', 'el desvío conserje viejo sigue intacto (fail-open)', srv.includes('CONCIERGE_ACK') || srv.includes("divertToConcierge(db, uidChat, lastUserText)"));
t.check('1q', 'EXENCIÓN ADN: turnos de entrevista (ADN incompleto) no pasan por la puerta', srv.includes('EXENCIÓN ADN') && srv.includes("SUPERVISION_OFF !== '1' && !dnaEntrevista"));
t.check('1r', 'la exención usa el mismo chequeo del cerebro (dnaMissingFields sobre business_dna)', srv.includes('dnaMissingFields(dna0).length > 0') && srv.includes('dnaRow0'));

// ---- 2 · front (estático) ----
t.check('2a', 'chatExchange arranca el poll cuando r.pending', app.includes('if (r && r.pending) { try { pzSupervisionPoll(); }'));
t.check('2b', 'hasPayload cuenta pending (no burbuja de error)', app.includes('|| (r && r.pending)'));
t.check('2c', 'pzSupervisionPoll existe y lee el historial cada 15 s', app.includes('async function pzSupervisionPoll()') && app.includes('}, 15000);'));
t.check('2d', 'el poll pinta la fila assistant nueva como burbuja normal', app.includes("chatMsgHtml('assistant', replyText, rts)")); // (FASE 2: fusión v847 chatMsgHtml(role,text,ts,id) — era la llamada de 2 args)
t.check('2e', 'el poll se frena al llegar la respuesta y tiene tope (10 min)', app.includes('clearInterval(PZ_SUP_POLL); PZ_SUP_POLL = null;') && app.includes('if (++n >= 40)'));
t.check('2f', 'el poll siembra el visto con el id máximo (no re-pinta el acuse)', app.includes('PZ_SUP_SEEN = msgs0.reduce'));
t.check('2g', 'el código de supervisión no muestra "bamboo" en la superficie (cada línea con "bamboo" es comentario o el "bamboo grove" preexistente del jardín)', (() => {
  const blines = app.split('\n').filter((l) => /bamboo(?!ty)/i.test(l));
  return blines.length > 0 && blines.every((l) => { const s = l.trim(); return s.startsWith('//') || /bamboo grove/i.test(s); });
})());
t.check('2h', 'el front no muestra "esperando a un humano" ni similar', !/esperando a un (humano|operador|persona)/i.test(app));

// ---- 3 · módulo (estático) ----
t.check('3a', 'el módulo exporta puerta/leerHilo/listarPendientes/dictar/guardarBorrador/setCaso', ['puerta', 'leerHilo', 'listarPendientes', 'dictar', 'guardarBorrador', 'setCaso'].every((f) => mod.includes(f)));
t.check('3b', 'la puerta NO llama al modelo (nunca genera una respuesta sola)', !mod.includes('chatIdea') && !mod.includes('generateIdeas') && !mod.includes('openai'));
t.check('3c', 'el dictado sale como Posty (replyAsPosty)', mod.includes('replyAsPosty'));
t.check('3d', 'el dictado sin ítem abierto es 404 sin_pendiente', mod.includes("error: 'sin_pendiente'"));
t.check('3e', 'texto vacío es 400 texto_vacio', mod.includes("error: 'texto_vacio'"));
t.check('3f', 'el hook es fire-and-forget con timeout (nunca bloquea)', mod.includes('SUPERVISION_HOOK_URL') && mod.includes('ctl.abort()') && mod.includes('}, 2000)'));
t.check('3g', 'el módulo no responde sin dictado: sin setTimeout de auto-respuesta', !/setTimeout\(\(\) =>[^{]*dictar/.test(mod));
t.check('3h', 'el módulo no delata a bamboo en la superficie: el ACK no lo menciona y los únicos "bamboo" fuera de comentarios son marcadores internos (actor/dictado_por)', (() => {
  if (!mod.includes("ACK_FALLBACK = 'dale, ya lo vi 😄 te lo reviso y te escribo en un rato.'")) return false;
  const noComent = mod.split('\n').filter((l) => !l.trim().startsWith('//'));
  const hits = noComent.filter((l) => /bamboo(?!ty)/i.test(l));
  return hits.every((l) => /actor: 'bamboo'|dictado_por = 'bamboo'/.test(l));
})());

// ---- 4 · boot aislado (gate ON) ----
const PORT = 34578;
const ADMIN_TOKEN = 'boot-test-token-sup';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-supervision-'));
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
    // Si no muere con SIGTERM en 3 s, SIGKILL. El proceso puede tardar
    // decenas de segundos en morir (estado D, I/O de SQLite): antes de
    // seguir se VERIFICA que el puerto quedó libre; si no, el próximo
    // boot habla con el servidor viejo y el register falla por email
    // duplicado (flake real visto el 9/11).
    setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} setTimeout(finish, 800); }, 3000);
  }).then(async () => {
    for (let i = 0; i < 40; i++) {
      try { await fetch(`${BASE}/api/version`); } catch (e) { return; }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log('  (aviso: el puerto 34578 siguió ocupado 20 s tras matar el boot)');
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
const sql = (q, ...a) => db.prepare(q).all(...a);
const sqlGet = (q, ...a) => db.prepare(q).get(...a);

(async () => {
  try {
    // Antes del primer boot: el puerto tiene que estar libre; un servidor de
    // una corrida anterior que sigue muriendo (lento, a veces girando al
    // 100% CPU) haría que waitBoot hable con el servidor viejo.
    await waitPortFree();
    await boot({});
    const booted = await waitBoot();
    t.check('4boot', 'server booteó (/api/version)', booted);
    if (!booted) console.log('  (log del boot):\n' + bootLog.slice(-2000));
    db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    // Dos clientes: A normal, B conserje (el cerebro pausado también por conserje).
    const a = await register('sup-a@example.com');
    const b = await register('sup-b@example.com');
    t.check('4a0', 'register A y B ok', (a.status === 200 || a.status === 201) && (b.status === 200 || b.status === 201));
    const uidA = uidOf('sup-a@example.com');
    const uidB = uidOf('sup-b@example.com');
    t.check('4a', 'join crea dos usuarios distintos', uidA !== uidB && uidA > 0 && uidB > 0);
    db.prepare('UPDATE users SET concierge=0, is_guest=0 WHERE id=?').run(uidA);
    db.prepare('UPDATE users SET concierge=1, is_guest=0 WHERE id=?').run(uidB);
    // ADN completo (EXENCIÓN ADN): A y B ya pasaron la entrevista, la puerta
    // aplica. Sin ADN, la exención los dejaría pasar y 4b no probaría la puerta.
    const dnaCompleto = JSON.stringify({ producto_estrella: 'café de especialidad', cliente_ideal: 'vecinos del barrio', diferencial: 'tostado en casa', tono: 'cercano' });
    db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))`).run(uidA, dnaCompleto);
    db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))`).run(uidB, dnaCompleto);

    // 4b — la puerta: 'hola' NO responde el saludo, devuelve el acuse + pending.
    const h1 = await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    const r1 = h1.data || {};
    t.check('4b', "POST 'hola' devuelve el acuse (no el saludo)", r1.reply === 'dale, ya lo vi 😄 te lo reviso y te escribo en un rato.' && r1.pending === true);
    t.check('4c', "el saludo del cerebro NO sale ('hola! 😄 con qué te ayudo' ausente)", !String(r1.reply || '').includes('con qué te ayudo'));
    t.check('4d', 'la respuesta no delata a bamboo (cliente)', !/bamboo/i.test(JSON.stringify(r1)));
    t.check('4e', 'el intercambio trae exchange_id', Number(r1.supervision && r1.supervision.exchange_id) > 0);
    const ex1 = Number(r1.supervision && r1.supervision.exchange_id);

    // 4f — lectura: el hilo trae el user + el acuse, y el ítem abierto.
    const hilo1 = await api('', 'GET', `/api/admin/supervision/chat?user_id=${uidA}&token=${ADMIN_TOKEN}`);
    t.check('4f', 'GET supervision/chat 200 con mensajes + pendiente', hilo1.status === 200 && Array.isArray(hilo1.data.mensajes) && hilo1.data.mensajes.length >= 2);
    t.check('4g', 'el hilo trae el mensaje del cliente y el acuse', (hilo1.data.mensajes || []).some((m) => m.role === 'user' && m.text === 'hola') && (hilo1.data.mensajes || []).some((m) => m.role === 'assistant' && /ya lo vi/.test(m.text)));
    t.check('4h', 'el ítem abierto es el mismo exchange_id', Number(hilo1.data.pendiente && hilo1.data.pendiente.id) === ex1);
    t.check('4i', 'el hilo trae el cliente (nombre)', /sup-a@example.com|Test sup-a/.test(hilo1.data.cliente || ''));

    // 4j — cola: 1 pendiente, con qué pidió y desde cuándo.
    const cola1 = await api('', 'GET', `/api/admin/supervision/pendientes?token=${ADMIN_TOKEN}`);
    t.check('4j', 'GET pendientes 200, total 1', cola1.status === 200 && cola1.data.total === 1);
    t.check('4k', 'la cola muestra quién, qué pidió y esperando_seg', cola1.data.pendientes && cola1.data.pendientes[0] && cola1.data.pendientes[0].user_id === uidA && /hola/.test(cola1.data.pendientes[0].ultimo_mensaje || '') && Number(cola1.data.pendientes[0].esperando_seg) >= 0);

    // 4l — segundo mensaje se ADJUNTA al mismo ítem (no abre otro).
    const h2 = await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'mostrame el posteo de fitness' }] });
    const r2 = h2.data || {};
    t.check('4l', 'el 2º mensaje devuelve pending con el MISMO exchange_id', r2.pending === true && Number(r2.supervision && r2.supervision.exchange_id) === ex1);
    const cola2 = await api('', 'GET', `/api/admin/supervision/pendientes?token=${ADMIN_TOKEN}`);
    t.check('4m', 'la cola sigue en 1 (adjunto, no nuevo ítem) con mensajes=2', cola2.data.total === 1 && cola2.data.pendientes[0].mensajes === 2);

    // 4n — sin token, 403.
    const sin = await api('', 'POST', '/api/admin/supervision/dictar', { user_id: uidA, texto: 'x' });
    t.check('4n', 'dictar sin token → 403', sin.status === 403);

    // 4o — el dictado: texto exacto, sale como Posty, cierra el ítem.
    const d1 = await api('', 'POST', `/api/admin/supervision/dictar?token=${ADMIN_TOKEN}`, { user_id: uidA, texto: 'dale, te lo muestro 👇' });
    t.check('4o', 'dictar 200 con reply_msg_id', d1.status === 200 && Number(d1.data.reply_msg_id) > 0);
    const hilo2 = await api('', 'GET', `/api/admin/supervision/chat?user_id=${uidA}&token=${ADMIN_TOKEN}`);
    t.check('4p', 'el hilo trae la respuesta dictada como assistant', (hilo2.data.mensajes || []).some((m) => m.role === 'assistant' && m.text === 'dale, te lo muestro 👇'));
    t.check('4q', 'la cola queda en 0', (await api('', 'GET', `/api/admin/supervision/pendientes?token=${ADMIN_TOKEN}`)).data.total === 0);
    t.check('4r', 'el ítem quedó respondido (dictado_por bamboo)', (() => { const it = sqlGet('SELECT * FROM supervision_pendientes WHERE id=?', ex1); return it && it.estado === 'respondido' && it.dictado_por === 'bamboo'; })());

    // 4s — dictar sin ítem abierto → 404 sin_pendiente; texto vacío → 400.
    const d2 = await api('', 'POST', `/api/admin/supervision/dictar?token=${ADMIN_TOKEN}`, { user_id: uidA, texto: 'otra vez' });
    t.check('4s', 'dictar sin pendiente → 404 sin_pendiente', d2.status === 404 && d2.data.error === 'sin_pendiente');
    await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'una pregunta más' }] });
    const d3 = await api('', 'POST', `/api/admin/supervision/dictar?token=${ADMIN_TOKEN}`, { user_id: uidA, texto: '   ' });
    t.check('4t', 'dictar con texto vacío → 400 texto_vacio', d3.status === 400 && d3.data.error === 'texto_vacio');
    await api('', 'POST', `/api/admin/supervision/dictar?token=${ADMIN_TOKEN}`, { user_id: uidA, texto: 'claro, te lo resuelvo' });

    // 4u — borrador: se guarda y se aprueba con usar_borrador (sin re-escribir).
    await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'otra pregunta' }] });
    const br = await api('', 'POST', `/api/admin/supervision/borrador?token=${ADMIN_TOKEN}`, { user_id: uidA, texto: 'te lo reviso y te escribo' });
    t.check('4u', 'borrador 200', br.status === 200);
    const d4 = await api('', 'POST', `/api/admin/supervision/dictar?token=${ADMIN_TOKEN}`, { user_id: uidA, usar_borrador: true });
    t.check('4v', 'dictar usar_borrador 200', d4.status === 200);
    const hilo3 = await api('', 'GET', `/api/admin/supervision/chat?user_id=${uidA}&token=${ADMIN_TOKEN}`);
    t.check('4w', 'el borrador aprobado salió como respuesta', (hilo3.data.mensajes || []).some((m) => m.role === 'assistant' && m.text === 'te lo reviso y te escribo'));

    // 4x — usar_borrador sin borrador guardado → 400 sin_borrador.
    await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'pregunta sin borrador' }] });
    const d5 = await api('', 'POST', `/api/admin/supervision/dictar?token=${ADMIN_TOKEN}`, { user_id: uidA, usar_borrador: true });
    t.check('4x', 'usar_borrador sin borrador → 400 sin_borrador', d5.status === 400 && d5.data.error === 'sin_borrador');
    await api('', 'POST', `/api/admin/supervision/dictar?token=${ADMIN_TOKEN}`, { user_id: uidA, texto: 'cerrado' });

    // 4y — conserje: el pendiente también abre caso (sin romper el flujo).
    const hB = await api(b.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola, necesito ayuda' }] });
    const rB = hB.data || {};
    t.check('4y', 'cliente conserje: también pending (puerta general)', rB.pending === true);
    const pendB = await api('', 'GET', `/api/admin/supervision/pendientes?token=${ADMIN_TOKEN}`);
    t.check('4z', 'la cola incluye al conserje', pendB.data.pendientes && pendB.data.pendientes.some((p) => p.user_id === uidB));
    const casoB = sqlGet("SELECT * FROM support_cases WHERE user_id=? AND tipo='conserje' ORDER BY id DESC LIMIT 1", uidB);
    t.check('4aa', 'el pendiente conserje abrió caso en support_cases', !!casoB);
    const hiloB = await api('', 'GET', `/api/admin/supervision/chat?user_id=${uidB}&token=${ADMIN_TOKEN}`);
    t.check('4ab', 'el ítem conserje registra el caso_id', Number(hiloB.data.pendiente && hiloB.data.pendiente.caso_id) === (casoB ? Number(casoB.id) : -1));
    await api('', 'POST', `/api/admin/supervision/dictar?token=${ADMIN_TOKEN}`, { user_id: uidB, texto: 'dale, te ayudo' });

    // 4ac — GET /api/ideas/chat trae id (lo usa el poll del front).
    const hGet = await api(a.cookie, 'GET', '/api/ideas/chat');
    t.check('4ac', 'GET historial trae id numérico', Array.isArray(hGet.data.messages) && hGet.data.messages.length > 0 && hGet.data.messages.every((m) => Number(m.id) > 0));

    // 4ad — el panel del dueño suma el bloque de supervisión.
    const panel = await api('', 'GET', `/api/admin/support/conserje/panel?token=${ADMIN_TOKEN}`);
    t.check('4ad', 'el panel trae supervision_pendientes', panel.status === 200 && panel.data && panel.data.supervision_pendientes && Array.isArray(panel.data.supervision_pendientes.pendientes));

    // 4af/4ag — EXENCIÓN ADN: usuario D sin ADN → la entrevista no pasa por
    // la puerta (el cerebro responde); con ADN completo → la puerta aplica.
    const d = await register('sup-d@example.com');
    const uidD = uidOf('sup-d@example.com');
    db.prepare('UPDATE users SET concierge=0, is_guest=0 WHERE id=?').run(uidD);
    const hD1 = await api(d.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    const rD1 = hD1.data || {};
    t.check('4af', 'EXENCIÓN ADN: sin ADN, el saludo sale sin puerta (no pending)', rD1.reply === 'hola! 😄 con qué te ayudo hoy?' && !rD1.pending);
    t.check('4af2', 'EXENCIÓN ADN: sin ADN, no se abre ítem de supervisión', (() => { const it = sqlGet('SELECT * FROM supervision_pendientes WHERE user_id=? AND estado=?', uidD, 'pendiente'); return !it; })());
    db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))`).run(uidD, dnaCompleto);
    const hD2 = await api(d.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola de nuevo' }] });
    const rD2 = hD2.data || {};
    t.check('4ag', 'EXENCIÓN ADN: con ADN completo, la puerta aplica (ACK + pending)', rD2.reply === 'dale, ya lo vi 😄 te lo reviso y te escribo en un rato.' && rD2.pending === true);

    // 4ae — FAIL-OPEN: sin la tabla, el chat sigue con el cerebro (saludo).
    db.prepare('DROP TABLE supervision_pendientes').run();
    const hFail = await api(a.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    const rFail = hFail.data || {};
    t.check('4ae', 'fail-open: sin tabla, el saludo sale igual que hoy', rFail.reply === 'hola! 😄 con qué te ayudo hoy?' && !rFail.pending);
    await killBoot();

    // ---- 5 · boot con SUPERVISION_OFF=1 (bypass solo suites) ----
    await boot({ SUPERVISION_OFF: '1' });
    t.check('5boot', 'server booteó con SUPERVISION_OFF=1', await waitBoot());
    const c = await register('sup-c@example.com');
    const uidC = uidOf('sup-c@example.com');
    db.prepare('UPDATE users SET concierge=0, is_guest=0 WHERE id=?').run(uidC);
    db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))`).run(uidC, dnaCompleto);
    const hOff = await api(c.cookie, 'POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'hola' }] });
    const rOff = hOff.data || {};
    t.check('5a', 'SUPERVISION_OFF=1: el saludo sale sin puerta', rOff.reply === 'hola! 😄 con qué te ayudo hoy?' && !rOff.pending);
    await killBoot();
  } catch (e) {
    t.check('ZZ', 'boot: ' + (e && e.message), false);
    await killBoot();
  } finally {
    try { if (db) db.close(); } catch (e) {}
  }
  t.summary();
})();
