#!/usr/bin/env node
// LOTE PRUEBA-CHAT (6/11) — onboarding de la prueba por chat con bamboo.
// Estudio → chat sin pantallas de preguntas; solo lo que no se supo con
// seguridad (huecos determinísticos, sin IA); nunca se adivina el rubro;
// opciones con un toque; los 3 posteos NO se generan antes del chat
// completo; acuse instantáneo; el chat llega al camino del conserje
// (caso + pendiente); guest/start reusa al invitado del chat; reaskQ1
// reabre el chat en q1. ES + EN espejados.
// Uso: node test-lote-prueba-chat.js
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = __dirname;
const es = fs.readFileSync(path.join(DIR, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(DIR, 'public', 'en-prueba.html'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const gapsMod = require('./preguntas-dinamicas.js');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
function count(h, s) { return h.split(s).length - 1; }
function has(h, s) { return h.indexOf(s) >= 0; }

// ---------- A) Estático: las 8 preguntas, verbatim, en ambos idiomas ----------
const Q_ES = [
  ['q1', '¿Qué es lo que más vendés?'],
  ['q2', '¿Qué querés que haga la gente cuando ve el posteo?'],
  ['q3', '¿Tenés alguna promo esta semana?'],
  ['q4', '¿Cómo le hablás a tus clientes?'],
  ['q5', '¿Mostramos los precios en los posteos?'],
  ['q6', '¿Quién es tu cliente?'],
  ['q7', '¿Qué te hace distinto?'],
  ['q8', '¿Qué no publico jamás?'],
];
const Q_EN = [
  ['q1', 'What do you sell most?'],
  ['q2', 'What do you want people to do when they see the post?'],
  ['q3', 'Do you have a promo this week?'],
  ['q4', 'How do you talk to your customers?'],
  ['q5', 'Do we show prices in the posts?'],
  ['q6', 'Who is your customer?'],
  ['q7', 'What makes you different?'],
  ['q8', 'What do I never post?'],
];
for (const [k, t] of Q_ES) ok('ES: ' + k + ' verbatim «' + t + '»', has(es, k + ": '" + t + "'"));
for (const [k, t] of Q_EN) ok('EN: ' + k + ' verbatim «' + t + '»', has(en, k + ": '" + t + "'"));
ok('ES: las 8 en T.q1..q8', Q_ES.every(([k]) => has(es, '    ' + k + ':')));
ok('EN: las 8 en T.q1..q8', Q_EN.every(([k]) => has(en, '    ' + k + ':')));

// Textos del chat en ambos T.
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  for (const k of ['chatJoin', 'chatJoinEmail', 'chatFreePh', 'chatFreeBamboo', 'chatWaiting', 'chatFollow', 'chatBlocked', 'chatErr', 'chatEntry']) {
    ok(tag + ': T.' + k, has(html, k + ':'));
  }
}

// ---------- B) Estático: el chat reemplaza las pantallas de preguntas ----------
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  ok(tag + ': currentScreen abre el chat', /function currentScreen\(\) \{\n    \/\/ \(LOTE PRUEBA-CHAT\)/.test(html) && has(html, 'chatOpen();'));
  ok(tag + ': currentScreen NO usa screenFor', !has(html, 'var fn = screenFor(S.plan[S.qi]);'));
  for (const fn of ['function chatOpen(', 'function chatRender(', 'function chatAskCurrent(', 'function chatPick(', 'function chatLibre(', 'function chatBindFree(', 'function chatNext(', 'function chatBack(', 'function chatBackTo(', 'function chatJoin(', 'function chatPost(', 'function chatPollStart(', 'function chatBlocked(', 'function dondeFollow(', 'function chatOptionsFor(', 'function chatRebuildLog(', 'function chatQText(', 'function chatAnswerLabel(']) {
    ok(tag + ': ' + fn, count(html, fn) === 1);
  }
  ok(tag + ': chat postea a /api/trial/chat-onboarding', has(html, "'/api/trial/chat-onboarding'"));
  ok(tag + ': sin POST /api/trial/questions (sin IA, sin endpoint de preguntas)', !has(html, '/api/trial/questions'));
  ok(tag + ': el chat no genera (sin trial/generate en el módulo del chat)', (() => {
    const i = html.indexOf('var CHAT_POLL_MS = 3000;');
    const j = html.indexOf('function buildPlan()', i);
    return i >= 0 && j > i && !html.slice(i, j).includes('/api/trial/generate');
  })());
  ok(tag + ': reaskQ1 reabre el chat en q1', has(html, 'S.chatOverride = { q1: T.chatQ1Need };') && has(html, 'S.chatRebuild = true;') && /function reaskQ1\(\) \{[\s\S]{0,600}chatOpen\(\);/.test(html));
  ok(tag + ': reaskQ1 NO llama screenQ1', !/function reaskQ1\(\) \{[\s\S]{0,600}screenQ1\(T\.chatQ1Need\)/.test(html));
  ok(tag + ': resume guarda el chat', has(html, 'chatLog: (S.chatLog || []).slice(-100)') && has(html, 'chatPostedQ: S.chatPostedQ || {}') && has(html, 'chatJoined: !!S.chatJoined') && has(html, 'chatLastId: S.chatLastId || 0') && has(html, 'chatPaused: !!S.chatPaused') && has(html, 'chatSeen: Object.keys(S.chatSeen || {})'));
  ok(tag + ': resume restaura el chat', has(html, 'S.chatLog = s.chatLog || []') && has(html, 'S.chatJoined = !!s.chatJoined') && has(html, 'S.chatSeen = {};'));
  ok(tag + ': CSS del chat', has(html, '.oc-chat-msgs') && has(html, '.oc-chat-free') && has(html, '.oc-chat-pause') && has(html, '.oc-chat-q'));
  ok(tag + ': sprout sin cambio (espejo tras el chat)', has(html, 'function sprout() {') && has(html, 'screenEspejo();'));
  ok(tag + ': buildPlan por gaps (sin push fijo de 5)', has(html, 'keys = [\'q1\', \'q2\', \'q3\', \'q4\', \'q5\', \'q6\', \'q7\', \'q8\'];') && has(html, 'chatGaps()') && has(html, 'DYN_TARGET_TO_KEY'));
  ok(tag + ': buildPlan pre-carga solo con estudio', has(html, "var studied = !!(S.facts && S.facts._known);"));
  ok(tag + ': estudio reconstruye el plan (email→IG/web)', count(html, '// (LOTE PRUEBA-CHAT) El chat reconstruye el plan de huecos tras') === 0 || true); // texto ES/EN distinto; se verifica abajo por idioma
}
// El comentario del estudio difiere por idioma: verificar cada uno.
ok('ES: estudio reconstruye el plan (comentario)', count(es, 'El chat reconstruye el plan de huecos tras') === 2);
ok('EN: estudio reconstruye el plan (comentario)', count(en, 'The chat rebuilds the gaps plan after') === 2);

// ---------- C) El bloque de gaps del IIFE es idéntico al módulo ----------
// (normalizado: sin indentación y sin el comentario de cabecera del módulo).
function normGaps(code) {
  return code.split('\n').map((l) => l.replace(/^\s+/, '')).join('\n').trim();
}
function gapsBlockFrom(html) {
  const i = html.indexOf('// Los 12 targets posibles.');
  const j = html.indexOf('  var DYN_TARGET_TO_KEY', i);
  // La línea de comentario del mapa target→llave no es parte del bloque.
  return html.slice(i, j).split('\n').filter((l) => !/\/\/ \(LOTE PRUEBA-CHAT\) (Del target|From the gap target)/.test(l)).join('\n');
}
function gapsBlockFromModule() {
  const src = fs.readFileSync(path.join(DIR, 'preguntas-dinamicas.js'), 'utf8');
  const i = src.indexOf('// Los 12 targets posibles.');
  const j = src.indexOf('// UMD.');
  return src.slice(i, j);
}
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  ok(tag + ': bloque gaps del IIFE idéntico a preguntas-dinamicas.js', normGaps(gapsBlockFrom(html)) === normGaps(gapsBlockFromModule()));
}

// ---------- D) Unit: huecos determinísticos (sin IA) ----------
const { preguntasDinamicasGaps, groundedOptionsFor, DYN_TARGETS, MAX_DYN_QUESTIONS } = gapsMod;
ok('módulo: sin llamada a OpenAI', (() => { const src = fs.readFileSync(path.join(DIR, 'preguntas-dinamicas.js'), 'utf8'); return !src.includes('api.openai.com') && !src.includes('generarPreguntasDinamicas(') && !src.includes('buildDynQuestionsPrompt('); })());
ok('módulo: exporta gaps + opciones', typeof preguntasDinamicasGaps === 'function' && typeof groundedOptionsFor === 'function');
ok('módulo: cap 8', MAX_DYN_QUESTIONS === 8 && DYN_TARGETS.length === 12);

// Café con estudio completo: solo estrella + objetivo + líneas rojas se preguntan.
const cafe = preguntasDinamicasGaps({
  facts: { _known: true, has_local: true, takes_reservations: false, sells_online: false, has_prices: true, has_promo: false, tone: 'vos', audience: ['vecinos del barrio'], diferencial: ['todo casero'], is_creator: false },
  productos: ['Café de especialidad'], category: 'cafeteria', lang: 'es',
});
const cafeTargets = cafe.needed.map((n) => n.target);
ok('gaps café: pregunta estrella (elegir entre detectados)', cafeTargets.includes('estrella'));
ok('gaps café: pregunta objetivo (lo elige el dueño)', cafeTargets.includes('objetivo'));
ok('gaps café: pregunta líneas rojas (las pone el dueño)', cafeTargets.includes('lineas_rojas'));
ok('gaps café: NO pregunta promo (ausente → ninguna)', !cafeTargets.includes('promo') && cafe.known.q3 && cafe.known.q3.value === 'ninguna');
ok('gaps café: NO pregunta tono (voseo → cercano)', !cafeTargets.includes('tono') && cafe.known.q4 && cafe.known.q4.value === 'cercano');
ok('gaps café: NO pregunta precios (publican → sí)', !cafeTargets.includes('precios') && cafe.known.q5 && cafe.known.q5.value === 'si');
ok('gaps café: NO pregunta audiencia (detectada)', !cafeTargets.includes('audiencia') && cafe.known.q6 && cafe.known.q6.value === 'vecinos del barrio');
ok('gaps café: NO pregunta diferencial (detectado)', !cafeTargets.includes('diferencial') && cafe.known.q7 && cafe.known.q7.value === 'todo casero');
ok('gaps café: ningún target inventa rubro', !('rubro' in cafe.known) && !cafeTargets.includes('rubro') && !('category' in cafe.known));

// Sin estudio (email): se pregunta todo lo que es decisión del dueño.
const sinEstudio = preguntasDinamicasGaps({ facts: {}, productos: [], category: '', lang: 'es' });
const seTargets = sinEstudio.needed.map((n) => n.target);
ok('gaps sin estudio: pregunta producto (sin detectados)', seTargets.includes('producto'));
ok('gaps sin estudio: pregunta objetivo/tono/precios/audiencia/diferencial/lineas_rojas', ['objetivo', 'tono', 'precios', 'audiencia', 'diferencial', 'lineas_rojas'].every((t) => seTargets.includes(t)));
ok('gaps: nunca más de 8', cafe.needed.length <= 8 && sinEstudio.needed.length <= 8);

// Opciones con respaldo para objetivo: solo lo evidenciado.
const optsLocal = groundedOptionsFor('objetivo', { facts: { _known: true, has_local: true, takes_reservations: false, sells_online: false }, productos: [], category: '', lang: 'es' }, cafe);
ok('opciones objetivo: local solo si hay local', optsLocal.some((o) => o.v === 'local'));
const optsSinLocal = groundedOptionsFor('objetivo', { facts: { _known: true, has_local: false, takes_reservations: false, sells_online: false }, productos: [], category: '', lang: 'es' }, cafe);
ok('opciones objetivo: sin local no ofrece ir al local', !optsSinLocal.some((o) => o.v === 'local'));
const optsOnline = groundedOptionsFor('objetivo', { facts: { _known: true, has_local: false, takes_reservations: false, sells_online: true }, productos: [], category: '', lang: 'es' }, cafe);
ok('opciones objetivo: online solo si vende online', optsOnline.some((o) => o.v === 'comprar'));
const optsEstrella = groundedOptionsFor('estrella', { facts: {}, productos: [], category: '', lang: 'es' }, { productos: ['Café de especialidad', 'Medialunas'] });
ok('opciones estrella: productos detectados primero', optsEstrella.length >= 2 && optsEstrella[0].v === 'Café de especialidad');

// ---------- E) Estático: servidor ----------
ok('server: POST /api/trial/chat-onboarding', has(srv, "app.post('/api/trial/chat-onboarding'"));
ok('server: GET /api/trial/chat-onboarding', has(srv, "app.get('/api/trial/chat-onboarding'"));
ok('server: chat usa CONCIERGE_ACK del módulo (no duplica el texto)', has(srv, 'supportCases.CONCIERGE_ACK'));
ok('server: join/question/answer/free', has(srv, "kind !== 'join' && kind !== 'question' && kind !== 'answer' && kind !== 'free'"));
ok('server: answer NO inserta chat_message (solo evento del caso)', (() => {
  const i = srv.indexOf("if (kind === 'answer') {");
  const j = srv.indexOf("// kind === 'free'", i);
  const block = srv.slice(i, j);
  return block.includes('divertToConcierge') && !block.includes('INSERT INTO chat_messages');
})());
ok('server: free inserta user + ACK', (() => {
  const i = srv.indexOf("// kind === 'free'");
  const block = srv.slice(i, i + 1200);
  return block.includes("'user', text") && block.includes("'assistant', ack");
})());
ok('server: guest/start reusa invitado con 0 posteos', has(srv, 'reuseGuest') && has(srv, "SELECT COUNT(*) AS n FROM posts WHERE user_id = ?"));
ok('server: guest/start bloquea invitado CON posteos', has(srv, 'if (nPosts > 0) return res.status(409)'));
ok('server: dispositivo del invitado reusado no es de otro', has(srv, 'String(du.user_id) === String(reuseGuest.userId)'));
ok('server: no borra la fila reusada si falla la importación', has(srv, 'if (!reuseGuest) { try { db.prepare(\'DELETE FROM users WHERE id = ?\')'));
ok('server: setConcierge solo si no lo es (sin spam de acciones)', has(srv, '!supportCases.isConcierge(db, uid)'));
ok('server: reloj de 3 días arranca en el chat (comentario de diseño)', has(srv, 'El reloj de 3 días arranca en el chat'));

// ---------- F) Boot: endpoints en vivo ----------
// (Salta si no hay node_modules: el preparador lo corre con deps.)
const PORT = 3997;
const BASE = `http://127.0.0.1:${PORT}`;
let booted = false;
try { require.resolve('express', { paths: [DIR] }); booted = true; } catch (e) { booted = false; }
if (!booted) {
  console.log('  -- boot: sin node_modules en el árbol, se salta (F1..F12) --');
  console.log(`\n${pass} ok · ${fail} fallas`);
  process.exit(fail ? 1 : 0);
}
const ACK = 'dale, ya lo vi 😄 te lo reviso y te escribo en un rato.';
async function runBoot() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-prueba-chat-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: DIR,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  // Mini jar de cookies (fetch de node no las guarda solo).
  const jars = new Map();
  async function req(jarKey, method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const jar = jars.get(jarKey);
    if (jar) headers.Cookie = jar;
    const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const setCookie = r.headers.get('set-cookie');
    if (setCookie) jars.set(jarKey, setCookie.split(';')[0]);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json, text };
  }
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    assert(up, 'el servidor no levantó:\n' + bootLog.slice(-1500));
    const ig = 'cafearoma';
    // F1: join crea el invitado temprano + conserje.
    const join = await req('a', 'POST', '/api/trial/chat-onboarding', { kind: 'join', ig, device: 'dvc-test-a' });
    ok('boot F1: join 200 + concierge', join.status === 200 && join.json && join.json.ok && join.json.concierge === true && Number(join.json.user_id) > 0, join.status + ' ' + join.text.slice(0, 160));
    const uid = join.json && join.json.user_id;
    // F2: el join no postea nada (el hilo arranca vacío).
    const poll0 = await req('a', 'GET', '/api/trial/chat-onboarding?after=0');
    ok('boot F2: tras join, el hilo está vacío', poll0.status === 200 && poll0.json && Array.isArray(poll0.json.messages) && poll0.json.messages.length === 0, poll0.status + ' ' + poll0.text.slice(0, 120));
    // F3: la pregunta guionada viaja como assistant.
    const q = await req('a', 'POST', '/api/trial/chat-onboarding', { kind: 'question', ig, device: 'dvc-test-a', question: 'q1', text: 'esto es lo que vi que vendés. ¿cuál es tu fuerte? ¿Qué es lo que más vendés?' });
    ok('boot F3: question 200 + msg_id', q.status === 200 && q.json && q.json.ok && Number(q.json.msg_id) > 0, q.status + ' ' + q.text.slice(0, 120));
    // F4: la respuesta guionada NO inserta chat_message (solo evento del caso).
    const a = await req('a', 'POST', '/api/trial/chat-onboarding', { kind: 'answer', ig, device: 'dvc-test-a', question: '¿Qué es lo que más vendés?', value: 'Café de especialidad' });
    ok('boot F4: answer 200 + caso_id', a.status === 200 && a.json && a.json.ok && Number(a.json.caso_id) > 0, a.status + ' ' + a.text.slice(0, 120));
    const poll1 = await req('a', 'GET', '/api/trial/chat-onboarding?after=0');
    ok('boot F4b: tras answer, el hilo sigue con 1 mensaje (la pregunta)', poll1.json && poll1.json.messages.length === 1 && poll1.json.messages[0].role === 'assistant', JSON.stringify(poll1.json && poll1.json.messages));
    // F5: texto libre → ACK instantáneo + user en el hilo (pendiente para bamboo).
    const f = await req('a', 'POST', '/api/trial/chat-onboarding', { kind: 'free', ig, device: 'dvc-test-a', text: 'hola, ¿puedo vender también tortas?' });
    ok('boot F5: free 200 + ACK instantáneo', f.status === 200 && f.json && f.json.ok && f.json.reply === ACK, f.status + ' ' + f.text.slice(0, 160));
    const poll2 = await req('a', 'GET', '/api/trial/chat-onboarding?after=0');
    ok('boot F5b: el hilo tiene pregunta + user + ACK, en orden', poll2.json && poll2.json.messages.length === 3
      && poll2.json.messages[0].role === 'assistant'
      && poll2.json.messages[1].role === 'user' && poll2.json.messages[1].text.includes('tortas')
      && poll2.json.messages[2].role === 'assistant' && poll2.json.messages[2].text === ACK,
      JSON.stringify(poll2.json && poll2.json.messages));
    // F6: el poll con after salta lo ya visto.
    const lastId = poll2.json.messages[2].id;
    const poll3 = await req('a', 'GET', '/api/trial/chat-onboarding?after=' + lastId);
    ok('boot F6: poll after=último devuelve vacío', poll3.json && poll3.json.messages.length === 0, JSON.stringify(poll3.json));
    // F7: segundo join con el mismo @ reusa al invitado (mismo user_id, 0 posteos).
    const join2 = await req('b', 'POST', '/api/trial/chat-onboarding', { kind: 'join', ig, device: 'dvc-test-a' });
    ok('boot F7: re-join mismo @ reusa (mismo user_id)', join2.status === 200 && join2.json && Number(join2.json.user_id) === Number(uid), join2.status + ' ' + join2.text.slice(0, 120));
    // F8: guest/start con el mismo @ NO da 409 (reusa; sin semana cacheada da 404).
    const gs = await req('b', 'POST', '/api/guest/start', { ig, device: 'dvc-test-a', lang: 'es' });
    ok('boot F8: guest/start reusa (404 sin semana, no 409)', gs.status === 404 && gs.json && gs.json.no_week === true, gs.status + ' ' + gs.text.slice(0, 160));
    // F9: otro @ desde el mismo dispositivo → 409 device_used.
    const joinOther = await req('c', 'POST', '/api/trial/chat-onboarding', { kind: 'join', ig: 'otrocafe', device: 'dvc-test-a' });
    ok('boot F9: otro @ mismo dispositivo → 409 device_used', joinOther.status === 409 && joinOther.json && joinOther.json.device_used === true, joinOther.status + ' ' + joinOther.text.slice(0, 160));
    // F10: mismo @ desde otro dispositivo → 200 (reuso, el dispositivo es del propio invitado).
    const joinOtherDev = await req('d', 'POST', '/api/trial/chat-onboarding', { kind: 'join', ig, device: 'dvc-test-otro' });
    ok('boot F10: mismo @ otro dispositivo → 200 reuso', joinOtherDev.status === 200 && joinOtherDev.json && Number(joinOtherDev.json.user_id) === Number(uid), joinOtherDev.status + ' ' + joinOtherDev.text.slice(0, 160));
    // F11: kind inválido → 400; sin identidad → 400.
    const badKind = await req('a', 'POST', '/api/trial/chat-onboarding', { kind: 'nada', ig, device: 'dvc-test-a' });
    ok('boot F11: kind inválido → 400', badKind.status === 400, badKind.status);
    const noId = await req('a', 'POST', '/api/trial/chat-onboarding', { kind: 'join', device: 'dvc-test-a' });
    ok('boot F11b: sin @ ni web → 400', noId.status === 400, noId.status);
    // F12: GET sin sesión → 401.
    const noSess = await req('z', 'GET', '/api/trial/chat-onboarding?after=0');
    ok('boot F12: GET sin sesión → 401', noSess.status === 401, noSess.status);
  } finally {
    child.kill('SIGKILL');
  }
  console.log(`\n${pass} ok · ${fail} fallas`);
  process.exit(fail ? 1 : 0);
}
runBoot().catch((e) => { console.error(e); process.exit(1); });
