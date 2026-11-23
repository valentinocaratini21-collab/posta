// test-lote-respuesta-hilo-idea.js — LOTE RESPUESTA-HILO-IDEA
// (decisión del dueño 2026-11-23 04:03, sobre su captura de la
// pantalla Subir): hoy, cuando Posty responde una idea en «¿Tenés
// una idea?», el cliente solo puede «Escribir otra idea» — un
// callejón sin salida que rompe la conversación en tickets sueltos.
// El lote convierte esa tarjeta en un HILO que se sigue en el mismo
// lugar.
//
// El lote:
//  (1) La tarjeta pinta el hilo de la idea como conversación
//      (mensajes del cliente y respuestas de Posty en orden) y,
//      debajo de la última respuesta, un campo «Responder…» con su
//      botón — en ambos estados (recibida y resuelta). «Escribir
//      otra idea» queda SOLO para un tema nuevo.
//  (2) POST /api/subir/idea/responder agrega el mensaje AL MISMO
//      hilo: chat_messages hilo 'general' con el vínculo explícito
//      mensaje↔idea (la columna chat_messages.idea_id → subir_ideas,
//      el agregado mínimo y declarado del lote; el mensaje que abre
//      la idea y las respuestas del operador también quedan
//      estampados). Nada de tabla nueva.
//  (3) REAPERTURA: si la idea estaba resuelta, responder la reabre
//      (subir_ideas.estado vuelve a 'recibida', resuelta_at NULL) y
//      el mensaje nace pendiente en la cola del conserje
//      (pedidos-voz), cuyo ítem trae el hilo COMPLETO (idea_hilo)
//      para que quien responde tenga todo el contexto.
//  (4) El operador sigue resolviendo por resolver-idea — ahora
//      también desde el mensaje de seguimiento (la idea se encuentra
//      por el idea_id del mensaje) — y su respuesta cae estampada en
//      el mismo hilo del cliente. El push no cambia (doctrina:
//      resultado de un pedido).
//  (5) Paridad ES/EN en toda la copia nueva (Responder…/Reply…,
//      errores del compositor).
//
// CONTROL: en la base prístina v1253 los casos [FIX] fallan (la ruta
// /responder no existe: 404; el payload no trae hilo; la cola no
// trae idea_hilo; resolver-idea desde un seguimiento da 404).
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-respuesta-hilo-idea.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35491;
const ADMIN_TOKEN = ['lote', 'respuesta', 'hilo', 'rig'].join('-');
const TZ = 'America/New_York';

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');

// ---------- Estático ----------
console.log('== 1. Estático ==');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const appCode = stripComments(appSrc);
const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
const scSrc = fs.readFileSync(path.join(ROOT, 'support-cases.js'), 'utf8');
const cvSrc = fs.readFileSync(path.join(ROOT, 'conserje-vista.js'), 'utf8');
const cjSrc = fs.readFileSync(path.join(ROOT, 'public/conserje.js'), 'utf8');
const chSrc = fs.readFileSync(path.join(ROOT, 'public/conserje.html'), 'utf8');
const stSrc = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
{
  t(srvSrc.includes("app.post('/api/subir/idea/responder', requireAuth"), '1a [FIX] server: POST /api/subir/idea/responder');
  t(srvSrc.includes('function subirIdeaHilo(uid, row, lang, tz)') && srvSrc.includes('hilo: subirIdeaHilo(uid, row, lang, tz)'),
    '1b [FIX] server: el payload de la idea trae su hilo');
  t(srvSrc.includes('UPDATE chat_messages SET idea_id = ? WHERE id = ?'),
    '1c [FIX] server: el mensaje que abre la idea queda estampado con idea_id');
  t(dbSrc.includes('ALTER TABLE chat_messages ADD COLUMN idea_id INTEGER DEFAULT NULL') && dbSrc.includes('idx_chatmsg_idea'),
    '1d [FIX] db.js: la columna idea_id (el vínculo mínimo mensaje↔idea) y su índice');
  t(srvSrc.includes('const reabierta =') && srvSrc.includes("SET estado = 'recibida', resuelta_at = NULL"),
    '1e [FIX] server: responder en una idea resuelta la REABRE (recibida, resuelta_at NULL)');
  t(srvSrc.includes('SELECT idea_id FROM chat_messages WHERE id = ?'),
    '1f [FIX] server: resolver-idea encuentra la idea de un seguimiento por su idea_id');
  t(scSrc.includes('idea_hilo: ideaHilo') && scSrc.includes('idea_id: ideaRow ? Number(ideaRow.id) : 0'),
    '1g [FIX] la cola pedidos-voz trae idea_id y el hilo completo (idea_hilo)');
  t(scSrc.includes('SELECT id, estado FROM subir_ideas WHERE id = ?'),
    '1h [FIX] la cola encuentra la idea de un seguimiento por idea_id');
  t(cvSrc.includes('idea_hilo: p.idea_hilo || null'), '1i [FIX] la tarjeta de decisión del conserje hereda el hilo');
  t(cjSrc.includes('d.idea_hilo') && cjSrc.includes('d-hilo'), '1j [FIX] la consola pinta la conversación entera en la tarjeta');
  t(chSrc.includes('.d-hilo-m'), '1k [FIX] conserje.html: gramática del hilo en la tarjeta');
  t(appCode.includes('function pzIdeaHiloHTML(idea)') && appCode.includes('function pzIdeaResponderHTML(en)') && appCode.includes('async function pzIdeaResponder()'),
    '1l [FIX] app.js: existen el pintado del hilo, el compositor y pzIdeaResponder');
  t(appSrc.includes("'Responder…'") && appSrc.includes("'Reply…'") && appSrc.includes("'/api/subir/idea/responder'"),
    '1m [FIX] app.js: el campo «Responder…»/«Reply…» postea a la ruta del hilo');
  t(appSrc.includes('Escribí tu respuesta primero.') && appSrc.includes('Write your reply first.'),
    '1n [FIX] paridad ES/EN: el error de respuesta vacía');
  t(appSrc.includes('tu respuesta queda escrita acá; probá de nuevo.') && appSrc.includes('your reply stays written here; try again.'),
    '1o [FIX] paridad ES/EN: el error de envío conserva lo escrito');
  t(appSrc.includes('id="pzIdeaRespEnviar"') && appCode.includes('renv.onclick = () => pzIdeaResponder()'),
    '1p [FIX] el botón Responder está cableado a pzIdeaResponder');
  t((appCode.match(/pzIdeaHiloHTML\(idea\)/g) || []).length >= 2 && (appCode.match(/pzIdeaResponderHTML\(en\)/g) || []).length >= 2,
    '1q [FIX] hilo + compositor en AMBOS estados (recibida y resuelta)');
  t(stSrc.includes('.pz-subir .pz-idea-hilo{') && stSrc.includes('#pzIdeaRespTexto'),
    '1r [FIX] styles: la gramática del hilo y del compositor');
  const llamadas = ['pzIdeaPintar', 'pzIdeaEnviar', 'pzIdeaResponder', 'pzIdeaCargar', 'pzIdeaBind', 'pzIdeaHiloHTML', 'pzIdeaResponderHTML'];
  t(llamadas.every((f) => appCode.includes('function ' + f + '(') || appCode.includes('async function ' + f + '(')),
    '1s [FIX] auditoría M78: las 7 funciones de la tarjeta existen definidas (7/7)');
}

(async () => {
  // ---------- VM: la tarjeta se pinta y responde (cliente) ----------
  console.log('== 2. VM: pintado del hilo y clic en Responder ==');
  try {
    const i0 = appCode.indexOf('function pzIdeaHiloHTML');
    const iBind = appCode.indexOf('function pzIdeaBind()');
    const bloque = appCode.slice(i0, appCode.indexOf('\n', iBind) + 1);
    const els = {};
    const calls = [];
    let enFlag = false;
    let nextResp = null;
    const mkEl = (id) => ({ id, value: '', hidden: true, textContent: '', onclick: null, __present: false });
    const card = mkEl('pzIdeaCard');
    let cardHtml = '';
    Object.defineProperty(card, 'innerHTML', {
      get() { return cardHtml; },
      set(v) {
        cardHtml = String(v);
        for (const k of Object.keys(els)) els[k].__present = false;
        for (const m of cardHtml.matchAll(/id="([^"]+)"/g)) {
          const id = m[1];
          if (!els[id]) els[id] = mkEl(id);
          els[id].__present = true;
        }
      },
    });
    els.pzIdeaCard = card;
    const ctx = {
      console,
      PZ_IDEA: { idea: null, ejemplos: null, busy: false },
      esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      pzVozEn: () => enFlag,
      document: { getElementById: (id) => (id === 'pzIdeaCard' ? card : (els[id] && els[id].__present ? els[id] : null)) },
      sessionStorage: { setItem() {} },
      location: { hash: '' },
      api: {
        post: async (url, body) => { calls.push([url, body]); return nextResp; },
        get: async () => ({ ok: true, idea: null, ejemplos: null }),
      },
    };
    vm.createContext(ctx);
    vm.runInContext(bloque, ctx);
    t(['pzIdeaPintar', 'pzIdeaEnviar', 'pzIdeaResponder', 'pzIdeaCargar', 'pzIdeaBind', 'pzIdeaHiloHTML', 'pzIdeaResponderHTML']
      .every((f) => typeof ctx[f] === 'function'),
      '2a [FIX] VM: el bloque de la tarjeta evalúa y las 7 funciones quedan vivas');
    const ideaResuelta = {
      id: 7, texto: 'quiero avisar el 2×1 del martes', estado: 'resuelta', hora: '10:02',
      respuesta: '¿el 2×1 va en pizzas grandes o en todas?', posteo: null,
      hilo: [
        { rol: 'cliente', texto: 'quiero avisar el 2×1 del martes', hora: '09:58' },
        { rol: 'posty', texto: '¿el 2×1 va en pizzas grandes o en todas?', hora: '10:02' },
      ],
    };
    ctx.PZ_IDEA.idea = JSON.parse(JSON.stringify(ideaResuelta));
    vm.runInContext('pzIdeaPintar();', ctx);
    const html1 = card.innerHTML;
    const iCli = html1.indexOf('quiero avisar el 2×1');
    const iPos = html1.indexOf('pizzas grandes o en todas');
    t(iCli > -1 && iPos > iCli, '2b [FIX] VM: el hilo se pinta como conversación, en orden (cliente → Posty)');
    t(html1.includes('Responder…') && html1.includes('id="pzIdeaRespTexto"') && !!(els.pzIdeaRespEnviar && els.pzIdeaRespEnviar.__present) && typeof els.pzIdeaRespEnviar.onclick === 'function',
      '2c [FIX] VM: debajo de la respuesta de Posty va el campo «Responder…» con su botón cableado');
    t(html1.includes('Escribir otra idea'), '2d VM: «Escribir otra idea» sigue, solo para un tema nuevo');
    // El clic en Responder: postea al MISMO hilo y repinta con lo
    // que devuelve el servidor (la idea reabierta, con el mensaje).
    els.pzIdeaRespTexto.value = 'va en las grandes';
    nextResp = {
      ok: true, reabierta: true,
      idea: { ...ideaResuelta, estado: 'recibida', hilo: [...ideaResuelta.hilo, { rol: 'cliente', texto: 'va en las grandes', hora: '10:05' }] },
    };
    await els.pzIdeaRespEnviar.onclick();
    t(calls.length === 1 && calls[0][0] === '/api/subir/idea/responder' && calls[0][1].idea_id === 7 && calls[0][1].text === 'va en las grandes',
      '2e [FIX] VM: el clic postea la respuesta al hilo de ESA idea', JSON.stringify(calls).slice(0, 200));
    const html2 = card.innerHTML;
    t(html2.includes('va en las grandes') && html2.includes('Recibida') && html2.indexOf('pizzas grandes o en todas') < html2.indexOf('va en las grandes'),
      '2f [FIX] VM: la tarjeta repinta reabierta, con el mensaje al final del hilo');
    // Respuesta vacía en ES: error en el lugar, sin postear.
    els.pzIdeaRespTexto.value = '   ';
    await els.pzIdeaRespEnviar.onclick();
    t(calls.length === 1 && els.pzIdeaRespErr.textContent === 'Escribí tu respuesta primero.',
      '2g [FIX] VM: respuesta vacía → error en español, en el lugar, sin postear');
    // Paridad EN del compositor.
    enFlag = true;
    ctx.PZ_IDEA.idea = {
      id: 9, texto: 'please post the new menu', estado: 'recibida', hora: '9:14 AM', respuesta: '', posteo: null,
      hilo: [{ rol: 'cliente', texto: 'please post the new menu', hora: '9:14 AM' }],
    };
    vm.runInContext('pzIdeaPintar();', ctx);
    const htmlEn = card.innerHTML;
    t(htmlEn.includes('Reply…') && !htmlEn.includes('Responder…') && htmlEn.includes('Write another idea'),
      '2h [FIX] VM: paridad EN del compositor («Reply…», sin «Responder…»)');
    els.pzIdeaRespTexto.value = '';
    await els.pzIdeaRespEnviar.onclick();
    t(calls.length === 1 && els.pzIdeaRespErr.textContent === 'Write your reply first.',
      '2i [FIX] VM: respuesta vacía en EN → «Write your reply first.»');
  } catch (e) {
    t(false, '2z [FIX] VM: el bloque de la tarjeta no evalúa en este árbol', e && e.message);
  }

  // ---------- Boot real: el circuito completo del hilo ----------
  console.log('== 3. Boot: responder, reapertura y cola del conserje ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-respuesta-hilo-'));
  const dbPath = path.join(tmpDir, 'posta.db');
  function boot() {
    const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, ADMIN_TOKEN, NODE_PATH: NM };
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', (d) => { process.stderr.write('[srv] ' + d); });
    return child;
  }
  async function waitUp() {
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  function killPid(child) {
    return new Promise((resolve) => {
      if (!child || child.killed) return resolve();
      child.once('exit', () => resolve());
      try { child.kill('SIGTERM'); } catch (e) { resolve(); }
      setTimeout(resolve, 5000);
    });
  }
  async function req(method, p, body, cookie) {
    const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method, redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let json = null; try { json = JSON.parse(txt); } catch (e) {}
    return { status: r.status, json, text: txt, setCookie: r.headers.get('set-cookie') || '' };
  }
  function dbAll(sql, params) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try { return db.prepare(sql).all(...(params || [])); } catch (e) { return []; } finally { db.close(); }
  }
  function dbGet(sql, params) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try { return db.prepare(sql).get(...(params || [])); } catch (e) { return null; } finally { db.close(); }
  }
  const colaUrl = '/api/admin/support/conserje/pedidos-voz?limit=60&token=' + ADMIN_TOKEN;
  const resolverUrl = '/api/admin/support/conserje/pedidos-voz/resolver-idea?token=' + ADMIN_TOKEN;

  let child = boot();
  t(await waitUp(), 'B0 el servidor levanta');
  const users = {};
  for (const tag of ['a', 'e']) {
    const email = `hiloidea-${tag}@test.local`;
    const reg = await req('POST', '/api/auth/register', { email, password: 'secreta123' });
    users[tag] = { email, cookie: String(reg.setCookie).split(';')[0] };
    t(!!users[tag].cookie && reg.status < 300, `B1 registro ${tag} con sesión`, String(reg.status));
  }
  await killPid(child);
  {
    const db = new DatabaseSync(dbPath);
    for (const tag of ['a', 'e']) {
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(users[tag].email);
      users[tag].uid = Number(u && u.id);
      db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone').run(users[tag].uid, TZ);
    }
    // E es la cuenta en inglés: la paridad del mecanismo se ejerce
    // con SU idioma (users.lang), como lee langOfUser.
    db.prepare("UPDATE users SET lang = 'en' WHERE id = ?").run(users.e.uid);
    db.close();
  }
  t(users.a.uid > 0 && users.e.uid > 0, 'B2 semilla: usuarios y zona horaria (E en inglés)');

  child = boot();
  t(await waitUp(), 'B3 el servidor relee la semilla');

  // ── A abre su idea: el payload ya trae el hilo (1 mensaje) ──
  const ideaTxtA = 'quiero un posteo de la colección nueva que llegó';
  const envA = await req('POST', '/api/subir/idea', { text: ideaTxtA }, users.a.cookie);
  const ideaA = envA.json && envA.json.idea;
  t(!!ideaA && ideaA.estado === 'recibida' && Array.isArray(ideaA.hilo) && ideaA.hilo.length === 1
    && ideaA.hilo[0].rol === 'cliente' && ideaA.hilo[0].texto === ideaTxtA,
    'H1 [FIX] la idea nace con su hilo de 1 mensaje (el del cliente)', JSON.stringify(envA.json).slice(0, 240));
  const aperturaA = dbGet('SELECT cm.idea_id FROM chat_messages cm JOIN subir_ideas si ON si.message_id = cm.id WHERE si.id = ?', [ideaA && ideaA.id]);
  t(!!aperturaA && Number(aperturaA.idea_id) === Number(ideaA && ideaA.id),
    'H2 [FIX] el mensaje que abre la idea quedó estampado con su idea_id');
  const cola1 = await req('GET', colaUrl);
  const pedA = ((cola1.json && cola1.json.pedidos) || []).find((p) => p.user_id === users.a.uid);
  t(!!pedA && pedA.es_idea === true && Number(pedA.idea_id) === Number(ideaA && ideaA.id)
    && Array.isArray(pedA.idea_hilo) && pedA.idea_hilo.length === 1,
    'H3 [FIX] la cola muestra la idea con idea_id y su hilo', JSON.stringify(pedA || null).slice(0, 240));
  const midA = pedA && pedA.id;

  // ── El operador pregunta: la respuesta cae en el mismo hilo ──
  const pregOp = '¿la colección nueva es la de verano o la de invierno?';
  const resA = await req('POST', resolverUrl, { message_id: midA, texto: pregOp });
  t(!!resA.json && resA.json.ok === true, 'H4 resolver la idea con una pregunta: ok', JSON.stringify(resA.json).slice(0, 160));
  const getA1 = await req('GET', '/api/subir/idea', null, users.a.cookie);
  const hiloA1 = (getA1.json && getA1.json.idea && getA1.json.idea.hilo) || [];
  t(getA1.json.idea.estado === 'resuelta' && hiloA1.length === 2 && hiloA1[0].rol === 'cliente' && hiloA1[1].rol === 'posty' && hiloA1[1].texto === pregOp,
    'H5 [FIX] la tarjeta de A: resuelta, con la pregunta de Posty en el hilo', JSON.stringify(hiloA1).slice(0, 240));
  const asstA = dbGet("SELECT idea_id FROM chat_messages WHERE user_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1", [users.a.uid]);
  t(!!asstA && Number(asstA.idea_id) === Number(ideaA.id), 'H6 [FIX] la respuesta del operador quedó estampada con el idea_id');

  // ── A responde en el hilo RESUELTO: reapertura ──
  const respTxtA = 'la de verano, sale el viernes';
  const respA = await req('POST', '/api/subir/idea/responder', { idea_id: ideaA.id, text: respTxtA }, users.a.cookie);
  t(!!respA.json && respA.json.ok === true && respA.json.reabierta === true,
    'H7 [FIX] responder en el hilo resuelto: ok y reabierta=true', JSON.stringify(respA.json).slice(0, 200));
  const hiloA2 = (respA.json && respA.json.idea && respA.json.idea.hilo) || [];
  t(!!respA.json && !!respA.json.idea && respA.json.idea.estado === 'recibida' && hiloA2.length === 3 && hiloA2[2].rol === 'cliente' && hiloA2[2].texto === respTxtA,
    'H8 [FIX] la respuesta quedó AL FINAL del mismo hilo y la idea volvió a recibida', JSON.stringify(hiloA2).slice(0, 260));
  const filaA = dbGet('SELECT estado, resuelta_at FROM subir_ideas WHERE id = ?', [ideaA.id]);
  t(!!filaA && filaA.estado === 'recibida' && filaA.resuelta_at === null,
    'H9 [FIX] subir_ideas: estado recibida y resuelta_at NULL tras la reapertura');
  const totalMsgsA = dbGet('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?', [users.a.uid]);
  t(!!totalMsgsA && Number(totalMsgsA.n) === 3,
    'H10 [FIX] sin duplicados: el hilo de A tiene exactamente 3 mensajes', totalMsgsA && totalMsgsA.n);
  const replyRowA = dbGet("SELECT id, idea_id FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1", [users.a.uid]);
  t(!!replyRowA && Number(replyRowA.idea_id) === Number(ideaA.id), 'H11 [FIX] el seguimiento quedó estampado con el idea_id');
  const replyMidA = replyRowA && replyRowA.id;

  // ── La reapertura en la cola: pendiente, con el hilo completo ──
  const cola2 = await req('GET', colaUrl);
  const pedReap = ((cola2.json && cola2.json.pedidos) || []).find((p) => Number(p.id) === Number(replyMidA));
  t(!!pedReap && pedReap.es_idea === true && pedReap.idea_estado === 'recibida'
    && pedReap.revision && pedReap.revision.estado === 'pendiente',
    'H12 [FIX] la cola: el seguimiento aparece como idea REABIERTA y pendiente', JSON.stringify(pedReap || null).slice(0, 260));
  t(!!pedReap && Array.isArray(pedReap.idea_hilo) && pedReap.idea_hilo.length === 3
    && pedReap.idea_hilo[0].texto === ideaTxtA && pedReap.idea_hilo[1].texto === pregOp && pedReap.idea_hilo[2].texto === respTxtA,
    'H13 [FIX] la cola trae el hilo COMPLETO en orden (idea, pregunta, respuesta)', JSON.stringify((pedReap && pedReap.idea_hilo) || null).slice(0, 260));
  t(!!cola2.json && Number(cola2.json.pendientes) >= 1, 'H14 [FIX] el contador de pendientes incluye la reapertura');

  // ── El operador resuelve DESDE el seguimiento (no 404) ──
  const cierreOp = 'perfecto, queda armado para el viernes';
  const resA2 = await req('POST', resolverUrl, { message_id: replyMidA, texto: cierreOp });
  t(!!resA2.json && resA2.json.ok === true,
    'H15 [FIX] resolver-idea desde el mensaje de seguimiento: ok (la idea se halla por idea_id)', JSON.stringify(resA2.json).slice(0, 200));
  const getA2 = await req('GET', '/api/subir/idea', null, users.a.cookie);
  const hiloA3 = (getA2.json && getA2.json.idea && getA2.json.idea.hilo) || [];
  t(!!getA2.json && !!getA2.json.idea && getA2.json.idea.estado === 'resuelta' && hiloA3.length === 4 && hiloA3[3].rol === 'posty' && hiloA3[3].texto === cierreOp,
    'H16 [FIX] el cierre del operador aterriza en el mismo hilo del cliente', JSON.stringify(hiloA3).slice(0, 260));
  const revReap = dbGet('SELECT estado FROM support_voz_pedidos WHERE message_id = ?', [replyMidA]);
  t(!!revReap && revReap.estado === 'resuelto_mano', 'H17 la revisión del seguimiento quedó resuelta a mano');

  // ── «Escribir otra idea»: un hilo NUEVO, sin cruzar con el anterior ──
  const envB = await req('POST', '/api/subir/idea', { text: 'otra cosa: el aviso del local nuevo' }, users.a.cookie);
  const ideaB = envB.json && envB.json.idea;
  t(!!ideaB && Number(ideaB.id) !== Number(ideaA.id) && Array.isArray(ideaB.hilo) && ideaB.hilo.length === 1,
    'H18 [FIX] «Escribir otra idea» crea OTRA idea, con su propio hilo de 1', JSON.stringify(envB.json).slice(0, 200));
  const respB = await req('POST', '/api/subir/idea/responder', { idea_id: ideaB.id, text: 'el local nuevo abre el lunes' }, users.a.cookie);
  const hiloB = (respB.json && respB.json.idea && respB.json.idea.hilo) || [];
  t(!!respB.json && respB.json.reabierta === false && respB.json.idea.estado === 'recibida' && hiloB.length === 2,
    'H19 [FIX] responder en un hilo ABIERTO: se agrega sin duplicar y sin reapertura', JSON.stringify(respB.json).slice(0, 220));
  const cruzA = dbGet('SELECT COUNT(*) AS n FROM chat_messages WHERE idea_id = ?', [ideaA.id]);
  const cruzB = dbGet('SELECT COUNT(*) AS n FROM chat_messages WHERE idea_id = ?', [ideaB.id]);
  t(!!cruzA && Number(cruzA.n) === 4 && !!cruzB && Number(cruzB.n) === 2,
    'H20 [FIX] sin cruce de hilos: A conserva sus 4 mensajes y B tiene los suyos (2)',
    JSON.stringify({ a: cruzA && cruzA.n, b: cruzB && cruzB.n }));
  // Sin idea_id: la respuesta va a la ÚLTIMA idea (la tarjeta pinta esa).
  const respB2 = await req('POST', '/api/subir/idea/responder', { text: 'y el aviso va con la foto del frente' }, users.a.cookie);
  const hiloB2 = (respB2.json && respB2.json.idea && respB2.json.idea.hilo) || [];
  t(!!respB2.json && !!respB2.json.idea && Number(respB2.json.idea.id) === Number(ideaB && ideaB.id) && hiloB2.length === 3,
    'H21 [FIX] responder sin idea_id cae en la última idea del usuario', JSON.stringify(respB2.json).slice(0, 200));

  // ── Errores: nada se pierde ni se cuela ──
  const sinSesion = await req('POST', '/api/subir/idea/responder', { idea_id: ideaA.id, text: 'hola' });
  t(sinSesion.status === 401, 'H22 responder sin sesión: 401', String(sinSesion.status));
  const vacio = await req('POST', '/api/subir/idea/responder', { idea_id: ideaA.id, text: '   ' }, users.a.cookie);
  t(vacio.status === 400 && vacio.json && vacio.json.error === 'sin_texto', 'H23 responder vacío: 400 sin_texto', JSON.stringify(vacio.json).slice(0, 120));
  const ajena = await req('POST', '/api/subir/idea/responder', { idea_id: ideaA.id, text: 'me cuelo en el hilo de otro' }, users.e.cookie);
  t(ajena.status === 404, 'H24 responder en la idea de OTRO usuario: 404', String(ajena.status));
  const inexistente = await req('POST', '/api/subir/idea/responder', { idea_id: 999999, text: 'nadie' }, users.a.cookie);
  t(inexistente.status === 404, 'H25 responder a una idea inexistente: 404', String(inexistente.status));
  const totalTrasErrores = dbGet('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?', [users.a.uid]);
  t(!!totalTrasErrores && Number(totalTrasErrores.n) === 7,
    'H26 los errores no escriben nada: el chat de A sigue en 7 mensajes', totalTrasErrores && totalTrasErrores.n);

  // ── El mismo circuito, en inglés (paridad del mecanismo) ──
  const envE = await req('POST', '/api/subir/idea', { text: 'please post the new menu this week' }, users.e.cookie);
  const ideaE = envE.json && envE.json.idea;
  const colaE = await req('GET', colaUrl);
  const pedE = ((colaE.json && colaE.json.pedidos) || []).find((p) => p.user_id === users.e.uid);
  const resE = await req('POST', resolverUrl, { message_id: pedE && pedE.id, texto: 'which day should the menu go out?' });
  const respE = await req('POST', '/api/subir/idea/responder', { idea_id: ideaE && ideaE.id, text: 'friday please' }, users.e.cookie);
  const hiloE = (respE.json && respE.json.idea && respE.json.idea.hilo) || [];
  t(!!resE.json && resE.json.ok === true && !!respE.json && respE.json.reabierta === true
    && hiloE.length === 3 && hiloE.map((m) => m.rol).join(',') === 'cliente,posty,cliente',
    'H27 [FIX] el circuito completo también cierra en la cuenta EN (hilo de 3, reapertura)',
    JSON.stringify(respE.json).slice(0, 220));

  // ── Freno: el circuito del hilo no crea posteos ──
  const posteos = dbGet('SELECT COUNT(*) AS n FROM posts WHERE user_id IN (?, ?)', [users.a.uid, users.e.uid]);
  t(!!posteos && Number(posteos.n) === 0, 'H28 FRENO: ni la idea ni las respuestas crean posteos', posteos && posteos.n);

  await killPid(child);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

  console.log(`\n== RESUMEN: ${pass} ok / ${fail} MAL ==`);
  if (fails.length) { console.log('Fallaron:\n - ' + fails.join('\n - ')); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(2); });
