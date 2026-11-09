// test-lote-imagen-chat-estado.js — LOTE v847 IMAGEN PEDIDA EN EL CHAT QUE NUNCA LLEGÓ.
// Incidente 9/11 12:13: Valentino pidió «arma eso y mándame la imagen del posteo»
// y Posty prometió «dame un momento. ¡ya vengo!» en texto — sin bloque de acción,
// sin trabajo y sin seguimiento. El lote pone la red anti-silencio: si el cliente
// pide la imagen y el turno no produjo ninguna, el SERVIDOR crea el trabajo +
// el estado «Creando tu imagen…» en el hilo, lo ejecuta en segundo plano y al
// terminar reemplaza el estado por la imagen (o avisa y ofrece reintentar).
// Push «La imagen que pediste está lista» con deep link al chat + ancla al mensaje.
// Parte A: estática (pins + marcadores). Parte B: cliente en vm (burbujas de
// estado/fallo, poller, ancla, reintentar). Parte C: servidor en vm con db
// stubbeada (detector, red, dedupe, ancla/cita, barrido, textos de fallo).
// Parte D: boot real de server.js en DATA_DIR temporal + HTTP (cookie de
// sesión) + conteo directo en posta.db. Sin clave OpenAI en el boot: el runner
// salda 'fallo'/'sin_clave' (el éxito con imagen real lo hace el preparador
// con el surrogado, como en el Lote A). Uso: node test-lote-imagen-chat-estado.js
// — sale 0 si todo pasa.
// Puertos: 34593 (34578 era chat-clicks; ads-pantalla usa 18754 fijo).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');

// ---------- extractores (fnFrom del chat-clicks no sirve para funciones con
// parámetros desestructurados: la llave del destructuring cierra el conteo) ----------
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function fnFrom2(src, sig) {
  // Como fnFrom, pero salta la lista de parámetros (con sus llaves) antes de
  // contar el cuerpo: para `function f({ a, b }) { ... }`.
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let j = src.indexOf('(', i);
  if (j < 0) return null;
  let pd = 0;
  for (; j < src.length; j++) {
    if (src[j] === '(') pd++;
    else if (src[j] === ')') { pd--; if (pd === 0) break; }
  }
  const b0 = src.indexOf('{', j);
  if (b0 < 0) return null;
  let d = 0;
  for (j = b0; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function reFrom(src, re) {
  const m = src.match(re);
  return m ? m[0] : null;
}

// ---------- Parte A: estática ----------
function parteA() {
  console.log('— A) estática: pins y marcadores del lote —');
  check('A0 BUILD v847 en server.js', srvSrc.includes("const BUILD_ID = '20261105-v847';"));
  check('A0b index ES con app.js?v=579 y styles?v=20261225 heredado de v846 (este lote no toca styles.css)', idxSrc.includes('app.js?v=579') && idxSrc.includes('styles.css?v=20261225') && !idxSrc.includes('app.js?v=576') && !idxSrc.includes('styles.css?v=20261223'));
  check('A0c app.js del lote (marcadores LOTE v847)', (appSrc.match(/LOTE v847/g) || []).length >= 7, `marcadores=${(appSrc.match(/LOTE v847/g) || []).length}`);
  // §1 servidor — funciones nuevas
  for (const f of ['function pzChatPideImagen(', 'function pzTrabajoPublico(', 'function pzTrabajoFalloAmable(', 'function pzTrabajoMarcarVencidos(', 'async function pzTrabajoChatImagenRun(', 'function pzChatImagenSiFalta(']) {
    check('A1 existe ' + f.replace('function ', '').replace('async ', '').replace('(', ''), srvSrc.includes(f), f);
  }
  // §1 la red anti-silencio: integración en el handler del chat
  check('A2 la red corre antes del res.json del chat', srvSrc.includes('pzChatImagenSiFalta({ uid, clean, out, createdApplied, editApplied, anchorId: Number(anchor_post_id || 0) })'));
  check('A2b la respuesta del chat trae `trabajo:`', srvSrc.includes('trabajo: trabajoImagen,'));
  check('A2c el barrido de vencidos corre en el arranque', srvSrc.includes('pzTrabajoMarcarVencidos(db);'));
  // §1 endpoints
  check('A3 existe GET /api/trabajos/:id', srvSrc.includes("app.get('/api/trabajos/:id'"));
  check('A3b existe POST /api/trabajos/:id/reintentar', srvSrc.includes("app.post('/api/trabajos/:id/reintentar'"));
  check('A3c el reintento solo actúa sobre fallo o creando-vencido', srvSrc.includes("error: 'no_reintentable'"));
  // §1 tabla trabajos
  check('A4 db.js crea la tabla trabajos', dbSrc.includes('CREATE TABLE IF NOT EXISTS trabajos') && dbSrc.includes("estado TEXT NOT NULL DEFAULT 'creando'"));
  check('A4b la tabla tiene índice por usuario+estado', dbSrc.includes('CREATE INDEX IF NOT EXISTS idx_trabajos_user_estado'));
  // §1 push al completar
  check('A5 la push dice «La imagen que pediste está lista»', srvSrc.includes("title: en ? 'The image you asked for is ready' : 'La imagen que pediste está lista'"));
  check('A5b la push lleva deep link al chat con ancla al mensaje', srvSrc.includes("url: '/#/app/chat?msg=' + finalId") && srvSrc.includes('data: { trabajo_id: job.id, msg_id: finalId }'));
  check('A5c la push lleva la imagen (rica)', srvSrc.includes('image: imgUrl,') && srvSrc.includes('const imgUrl = absImageUrl(uid, String(newPath));'));
  // §1 el runner salda siempre + QA gate
  check('A6 el runner tiene timeout propio de 4 min', srvSrc.includes('4 * 60 * 1000') && srvSrc.includes("new Error('tiempo_agotado')"));
  check('A6b el barrido salda los creando de >10 min', srvSrc.includes("datetime('now', '-10 minutes')"));
  check('A6c el QA gate / personaje manda a revisión, no a entrega', srvSrc.includes("settleFallo('revision')") && srvSrc.includes('needs_review = 1'));
  check('A6d el fallo por tope y sin clave tienen texto propio', srvSrc.includes("settleFallo('tope')") && srvSrc.includes("settleFallo('sin_clave')"));
  // §1 la red NO ata al borrador más nuevo sin evidencia
  check('A7 la red resuelve por ancla o cita, nunca por «el más nuevo»', srvSrc.includes('chatQuotedPostMatch(db, uid, lastText)') && srvSrc.includes('Number(anchorId || 0)'));
  const netSrc = fnFrom2(srvSrc, 'function pzChatImagenSiFalta(') || '';
  check('A7b la red no tiene SELECT de posts por id DESC (sin evidencia no ata)', !/FROM posts[^;]*ORDER BY id DESC LIMIT 1/.test(netSrc), netSrc.slice(0, 120));
  // §1 NO se agrega bloque ```imagen``` al cerebro (la red es determinista)
  check('A8 ningún bloque ```imagen``` nuevo en el cerebro', !srvSrc.includes('```imagen'));
  // §1 cliente — funciones y marcadores
  for (const f of ['const TRABAJO_MARKER_RE', 'const TRABAJO_FALLO_MARKER_RE', 'function chatStripTrabajoMarker(', 'function chatMsgHtml(role, text, ts, id)', 'function pzTrabajoPollStop(', 'function pzTrabajoPoller(', 'function pzTrabajoPollerRetomar(', 'function pzChatIrAlMensaje(', 'function pzChatAplicarAncla(']) {
    check('A9 existe ' + f.replace('const ', '').replace('function ', '').replace('(', ''), appSrc.includes(f), f);
  }
  check('A9b las burbujas llevan data-msg-id (ancla)', appSrc.includes('data-msg-id="${esc(String(id))}"') || appSrc.includes('data-msg-id='));
  check('A9c el fallo rinde el botón de reintentar', appSrc.includes('data-trabajo-retry='));
  check('A9d el poller pregunta cada 5 s', appSrc.includes('setInterval(tick, 5000)'));
  check('A9e el estado optimista nace desde r.trabajo en chatExchange', appSrc.includes('r.trabajo && r.trabajo.estado === \'creando\''));
  check('A9f el historial guarda el id del mensaje', appSrc.includes("ts: Date.parse(String(m.created_at || '')) || 0, id: Number(m.id) || 0"));
  // §1 textos del estado (ES+EN)
  check('A10 el estado dice «Creando tu imagen… suele tardar ~1 minuto»', srvSrc.includes('Creando tu imagen… suele tardar ~1 minuto') && srvSrc.includes('Creating your image… usually takes ~1 minute'));
  check('A10b la actualización honesta existe en el cliente', appSrc.includes('está tardando más de lo normal, sigo…'));
}

// ---------- Parte B: cliente en vm ----------
function extractClientChat() {
  // Bloque contiguo: marcadores + strips + chatMsgHtml.
  const start = appSrc.indexOf('const LC_MARKER_RE');
  const fn = fnFrom(appSrc, 'function chatMsgHtml(');
  if (start < 0 || !fn) return { error: 'falta chatMsgHtml' };
  const end = appSrc.indexOf(fn) + fn.length;
  const esc = reFrom(appSrc, /const esc = \(s\) =>[^\n]+/);
  if (!esc) return { error: 'falta esc' };
  return { code: esc + '\n' + appSrc.slice(start, end) };
}
function extractClientTrabajo() {
  const parts = [];
  for (const sig of ['function pzTrabajoPollStop(', 'function pzTrabajoPoller(', 'function pzTrabajoPollerRetomar(', 'function pzChatIrAlMensaje(', 'function pzChatAplicarAncla(']) {
    const s = fnFrom(appSrc, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  for (const v of ['let PZ_TRABAJO_POLL = null;', 'let PZ_TRABAJO_POLL_ID = null;']) {
    if (!appSrc.includes(v)) return { error: 'falta ' + v };
    parts.push(v);
  }
  return { code: parts.join('\n') };
}
function extractRetryListener() {
  const c = appSrc.indexOf('// Reintentar un trabajo fallido');
  if (c < 0) return { error: 'falta el comentario del reintento' };
  const a = appSrc.indexOf('document.addEventListener', c);
  if (a < 0) return { error: 'falta el listener del reintento' };
  const e = appSrc.indexOf('\n});', a);
  if (e < 0) return { error: 'falta el cierre del listener' };
  return { code: appSrc.slice(a, e + 4) };
}

async function parteB() {
  console.log('— B) cliente: burbujas de estado/fallo, poller, ancla, reintentar —');
  // B1–B4: chatMsgHtml con los marcadores nuevos (y la foto de siempre).
  {
    const loaded = extractClientChat();
    check('B0 se extrae chatMsgHtml con sus marcadores', !loaded.error, loaded.error || '');
    if (!loaded.error) {
      const ctx = {
        console, ME: { lang: 'es' },
        pzIc: () => '',
        linkifyEsc: (t) => ctx.esc ? ctx.esc(t) : String(t),
        gzT: (es) => es,
      };
      vm.createContext(ctx);
      vm.runInContext(loaded.code, ctx);
      const out1 = vm.runInContext("chatMsgHtml('assistant', '[creando-imagen:7] Creando tu imagen… suele tardar ~1 minuto', 1000, 42)", ctx);
      check('B1 el estado rinde burbuja viva con data-trabajo-id', String(out1).includes('pz-trabajo-estado') && String(out1).includes('data-trabajo-id="7"') && String(out1).includes('data-msg-id="42"'), String(out1).slice(0, 300));
      check('B1b el estado NO muestra el marcador en el texto', !String(out1).includes('[creando-imagen'), String(out1).slice(0, 300));
      check('B1c el estado dice «Creando tu imagen…»', String(out1).includes('Creando tu imagen…'), String(out1).slice(0, 200));
      const out2 = vm.runInContext("chatMsgHtml('assistant', '[trabajo-fallo:7] no pude generar la imagen — tocá reintentar y la armo de nuevo', 1000, 43)", ctx);
      check('B2 el fallo rinde burbuja con botón Reintentar', String(out2).includes('pz-trabajo-fallo') && String(out2).includes('data-trabajo-retry="7"') && String(out2).includes('Reintentar'), String(out2).slice(0, 300));
      check('B2b el fallo NO muestra el marcador en el texto', !String(out2).includes('[trabajo-fallo'), String(out2).slice(0, 300));
      const out3 = vm.runInContext("chatMsgHtml('assistant', 'Acá está la imagen de tu posteo 💪 [foto:/media/foto.png]', 1000, 44)", ctx);
      check('B3 la foto sigue rindiendo la imagen en la burbuja', String(out3).includes('<img') && String(out3).includes('/media/foto.png') && String(out3).includes('data-msg-id="44"'), String(out3).slice(0, 300));
      const out4 = vm.runInContext("chatMsgHtml('assistant', 'hola! 😄 con qué te ayudo hoy?', 1000, 45)", ctx);
      check('B4 un mensaje común lleva data-msg-id', String(out4).includes('data-msg-id="45"'), String(out4).slice(0, 200));
      const out5 = vm.runInContext("chatMsgHtml('assistant', 'sin id')", ctx);
      check('B5 sin id, la burbuja rinde igual que antes (sin data-msg-id)', String(out5).includes('chat-msg ai') && !String(out5).includes('data-msg-id'), String(out5).slice(0, 200));
    }
  }

  // B6–B9: poller + ancla con DOM falso.
  {
    const loaded = extractClientTrabajo();
    check('B6 se extraen el poller y el ancla', !loaded.error, loaded.error || '');
    if (!loaded.error) {
      const mkEl = () => ({ style: {}, textContent: '', scrolled: 0, scrollIntoView() { this.scrolled++; }, querySelector() { return null; } });
      const etaEl = { textContent: '' };
      const estadoEl = mkEl();
      estadoEl.querySelector = (sel) => (sel === '.pz-trabajo-eta' ? etaEl : null);
      const msgEl = mkEl();
      const chatBox = mkEl();
      const doc = {
        getElementById: (id) => (id === 'chatBox' ? chatBox : null),
        querySelector: (sel) => {
          if (sel === '[data-trabajo-id="7"]') return estadoEl;
          if (sel === '[data-msg-id="123"]') return msgEl;
          return null;
        },
      };
      const intervals = [], cleared = [];
      const loadedHist = [], scrolled = [];
      let nextTrabajo = { id: 7, estado: 'creando', estimado_seg: 60, mensaje_final_id: null, creado_en: new Date(Date.now() - 90 * 1000).toISOString().replace('T', ' ').slice(0, 19) };
      const gets = [];
      const ctx = {
        console, ME: { lang: 'es' },
        document: doc,
        location: { hash: '#/app/chat?msg=123' },
        URLSearchParams,
        api: { get: async (url) => { gets.push(url); return { ok: true, trabajo: { ...nextTrabajo } }; } },
        chatLoadHistory: async () => { loadedHist.push(1); },
        chatScroll: () => { scrolled.push(1); },
        setInterval: (fn, ms) => { intervals.push({ fn, ms }); return 999; },
        clearInterval: (id) => { cleared.push(id); },
      };
      vm.createContext(ctx);
      vm.runInContext(loaded.code, ctx);
      await vm.runInContext('pzTrabajoPoller(7)', ctx);
      await sleep(50);
      check('B6b el poller pregunta por el trabajo (GET /api/trabajos/7)', gets.includes('/api/trabajos/7'), gets.join(','));
      check('B6c el poller se programa cada 5 s', intervals.length === 1 && intervals[0].ms === 5000, JSON.stringify(intervals.map((i) => i.ms)));
      check('B6d la ETA honesta aparece cuando se pasa del estimado', /tardando más de lo normal/.test(etaEl.textContent), etaEl.textContent);
      // La imagen termina: el poller recarga el historial y baja al mensaje.
      nextTrabajo = { ...nextTrabajo, estado: 'lista', mensaje_final_id: 123 };
      await intervals[0].fn();
      await sleep(20);
      check('B7 al terminar, el poller recarga el historial', loadedHist.length >= 1, `recargas=${loadedHist.length}`);
      check('B7b al terminar, baja al mensaje final (ancla)', msgEl.scrolled >= 1, `scrolls=${msgEl.scrolled}`);
      check('B7c al terminar, el poller se detiene', cleared.includes(999), cleared.join(','));
      // Fallo: recarga y se detiene.
      const cleared2 = cleared.length;
      nextTrabajo = { id: 7, estado: 'fallo', estimado_seg: 60, mensaje_final_id: 123, creado_en: nextTrabajo.creado_en };
      await vm.runInContext('pzTrabajoPoller(7)', ctx);
      await sleep(20);
      await intervals[intervals.length - 1].fn();
      await sleep(20);
      check('B8 en fallo, el poller recarga el historial y se detiene', loadedHist.length >= 2 && cleared.length > cleared2, `recargas=${loadedHist.length} cleared=${cleared.length}`);
      // Ancla directa por ?msg=.
      msgEl.scrolled = 0;
      const okAncla = vm.runInContext('pzChatAplicarAncla()', ctx);
      check('B9 ?msg=123 baja al mensaje con el ancla', msgEl.scrolled >= 1, `scrolls=${msgEl.scrolled}`);
      check('B9b pzChatIrAlMensaje devuelve false sin mensaje', vm.runInContext('pzChatIrAlMensaje(999)', ctx) === false);
    }
  }

  // B10: el botón Reintentar dispara POST /api/trabajos/:id/reintentar y retoma el poller.
  {
    const loaded = extractRetryListener();
    check('B10 se extrae el listener de reintentar', !loaded.error, loaded.error || '');
    if (!loaded.error) {
      const handlers = {};
      const posted = [];
      const polled = [];
      const loadedHist = [];
      const ctx = {
        console,
        document: { addEventListener: (type, fn) => { handlers[type] = fn; } },
        api: { post: async (url) => { posted.push(url); return { ok: true, trabajo: { id: 7, estado: 'creando' } }; } },
        chatLoadHistory: async () => { loadedHist.push(1); },
        pzTrabajoPoller: (id) => { polled.push(id); },
      };
      vm.createContext(ctx);
      vm.runInContext(loaded.code, ctx);
      check('B10b el listener de click quedó registrado', typeof handlers.click === 'function');
      if (typeof handlers.click === 'function') {
        const btn = { getAttribute: () => '7', disabled: false };
        handlers.click({ target: { closest: (sel) => (sel === '[data-trabajo-retry]' ? btn : null) }, preventDefault: () => {} });
        await sleep(50);
        check('B10c el toque llama a POST /api/trabajos/7/reintentar', posted.includes('/api/trabajos/7/reintentar'), posted.join(','));
        check('B10d tras reintentar, recarga el historial y retoma el poller', loadedHist.length === 1 && polled.includes(7), `hist=${loadedHist.length} poll=${polled.join(',')}`);
      }
    }
  }
}

// ---------- Parte C: servidor en vm (db stubbeada) ----------
function extractServerTrabajo() {
  const parts = [];
  for (const [sig, use2] of [
    ['const PZ_CHAT_IMG_REQ_ES', false],
    ['const PZ_CHAT_IMG_REQ_EN', false],
    ['function pzChatPideImagen(', false],
    ['function pzTrabajoFalloAmable(', false],
    ['function pzTrabajoPublico(', false],
    ['function pzTrabajoMarcarVencidos(', false],
    ['function pzChatImagenSiFalta(', true],
  ]) {
    let s = null;
    if (sig.startsWith('const ')) {
      const m = srvSrc.match(new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' = [^\\n]+;'));
      s = m ? m[0] : null;
    } else if (use2) s = fnFrom2(srvSrc, sig);
    else s = fnFrom(srvSrc, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  return { code: parts.join('\n') };
}
function mkStubDb(seed) {
  const jobs = (seed && seed.jobs) ? seed.jobs.map((j) => ({ ...j })) : [];
  const msgs = [];
  const posts = (seed && seed.posts) ? seed.posts.map((p) => ({ ...p })) : [];
  const chatState = (seed && seed.chatState !== undefined) ? seed.chatState : null;
  let nextJob = 100, nextMsg = 500;
  const db = {
    _jobs: jobs, _msgs: msgs, _posts: posts,
    prepare(sql) {
      if (sql.includes("estado = 'creando'") && sql.includes('-3 minutes')) {
        return { get: (uid) => jobs.filter((j) => j.user_id === uid && j.estado === 'creando').sort((a, b) => b.id - a.id)[0] || null };
      }
      if (sql.includes('FROM chat_state')) return { get: () => chatState };
      if (sql.includes('FROM posts WHERE id = ?')) return { get: (id) => posts.find((p) => p.id === Number(id)) || null };
      if (sql.startsWith('INSERT INTO trabajos')) {
        return { run: (uid, tipo, estado, postId, titulo, caption, est) => {
          const j = { id: ++nextJob, user_id: uid, tipo, estado, post_id: postId, titulo, caption, estimado_seg: est, mensaje_id: null, mensaje_final_id: null, error: '', created_at: '2026-11-09 17:00:00' };
          jobs.push(j); return { lastInsertRowid: j.id };
        } };
      }
      if (sql.startsWith('INSERT INTO chat_messages')) {
        return { run: (uid, role, text) => { const m = { id: ++nextMsg, user_id: uid, role, text }; msgs.push(m); return { lastInsertRowid: m.id }; } };
      }
      if (sql.includes('SET mensaje_id = ?')) return { run: (mid, id) => { const j = jobs.find((x) => x.id === Number(id)); if (j) j.mensaje_id = mid; return { changes: j ? 1 : 0 }; } };
      if (sql.includes('FROM trabajos WHERE id = ?')) return { get: (id) => jobs.find((j) => j.id === Number(id)) || null };
      if (sql.includes("estado = 'creando'") && sql.includes('-10 minutes')) {
        return { all: () => jobs.filter((j) => j.estado === 'creando' && j._viejo) };
      }
      if (sql.includes("SET estado='fallo'")) {
        return { run: (id) => { const j = jobs.find((x) => x.id === Number(id)); if (j && j.estado === 'creando') { j.estado = 'fallo'; j.error = 'tiempo_agotado'; return { changes: 1 }; } return { changes: 0 }; } };
      }
      if (sql.includes('SET mensaje_final_id = ?')) return { run: (mid, id) => { const j = jobs.find((x) => x.id === Number(id)); if (j) j.mensaje_final_id = mid; return { changes: 1 }; } };
      throw new Error('SQL no stubbeado: ' + sql);
    },
  };
  return db;
}
const INCIDENTE_CLEAN = [
  { role: 'user', text: 'perfecto, me gusta esa idea de fitness' },
  { role: 'assistant', text: '¡Genial! Te propongo un posteo de fitness: una foto tuya entrenando al amanecer con el titular «Empezá el día con energía» y un caption corto que invite a moverse. El posteo saldría hoy a las 19:00 con tus colores y tu tono cercano. ¿Querés que lo arme?' },
  { role: 'user', text: 'Claro, ahí sí, me gusta. Perfecto, arma eso y mándame la imagen del posteo.' },
];
function parteC() {
  console.log('— C) servidor: detector, red anti-silencio, dedupe, ancla/cita, barrido —');
  const loaded = extractServerTrabajo();
  check('C0 se extraen las funciones del servidor', !loaded.error, loaded.error || '');
  if (loaded.error) return;
  const mkCtx = (seed) => {
    const scheduled = [];
    const db = mkStubDb(seed);
    return {
      console, db, scheduled,
      langOfUser: () => (seed && seed.lang) || 'es',
      chatQuotedPostMatch: (d, uid, text) => (seed && seed.quote) || null,
      setImmediate: (fn) => { scheduled.push(fn); },
    };
  };
  const runNet = (ctx, clean, out, extra) => vm.runInContext(
    `pzChatImagenSiFalta({ uid: 12, clean: ${JSON.stringify(clean)}, out: ${JSON.stringify(out)}, createdApplied: ${JSON.stringify((extra && extra.createdApplied) || null)}, editApplied: ${JSON.stringify((extra && extra.editApplied) || null)}, anchorId: ${(extra && extra.anchorId) || 0} })`,
    ctx);

  // C1: el detector entiende el pedido (ES+EN) y no dispara con otra cosa.
  {
    const ctx = mkCtx();
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const t = (s) => vm.runInContext(`pzChatPideImagen(${JSON.stringify(s)})`, ctx);
    check('C1 «mándame la imagen del posteo» es un pedido de imagen', t('Claro, ahí sí, me gusta. Perfecto, arma eso y mándame la imagen del posteo.') === true);
    check('C1b «show me the image» también (EN)', t('send me the image of the post please') === true);
    check('C1c «¿cómo va mi semana?» NO es pedido de imagen', t('¿cómo va mi semana?') === false);
    check('C1d «la imagen de ayer» sin verbo NO dispara', t('la imagen de ayer me gustó mucho') === false);
    check('C1e «mándame el posteo» sin imagen NO dispara', t('mándame el posteo cuando esté') === false);
  }

  // C2: el incidente — la red crea el trabajo + el estado en el hilo.
  {
    const ctx = mkCtx();
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const r = runNet(ctx, INCIDENTE_CLEAN, { reply: 'genial, voy a armar el posteo y te mando la imagen. dame un momento. ¡ya vengo!' });
    check('C2 el incidente crea el trabajo (estado creando, estimado 60)', r && r.estado === 'creando' && r.estimado_seg === 60, JSON.stringify(r));
    check('C2b el trabajo tiene id de mensaje de estado', r && r.mensaje_id > 0, JSON.stringify(r));
    check('C2c el estado en el hilo dice «Creando tu imagen…»', ctx.db._msgs.some((m) => /\[creando-imagen:\d+\] Creando tu imagen… suele tardar ~1 minuto/.test(m.text)), JSON.stringify(ctx.db._msgs));
    check('C2d la caption del trabajo es la propuesta del hilo (fitness)', ctx.db._jobs[0] && /fitness/.test(ctx.db._jobs[0].caption), (ctx.db._jobs[0] || {}).caption);
    check('C2e el trabajo se ejecuta en segundo plano (setImmediate)', ctx.scheduled.length === 1, `scheduled=${ctx.scheduled.length}`);
    check('C2f sin evidencia explícita NO se ata a ningún posteo', r && r.post_id === null, JSON.stringify(r));
  }

  // C3–C7: la red NO dispara cuando el turno ya produjo una imagen.
  {
    const ctx = mkCtx();
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    check('C3 con idea en el turno (pregen) NO se crea trabajo', runNet(ctx, INCIDENTE_CLEAN, { reply: 'acá va', idea: { titulo: 'Idea de fitness' } }) === null);
    const ctx2 = mkCtx({ chatState: { idea_json: JSON.stringify({ titulo: 'Idea abierta' }) } });
    vm.createContext(ctx2);
    vm.runInContext(loaded.code, ctx2);
    check('C4 con idea abierta en chat_state NO se crea trabajo', runNet(ctx2, INCIDENTE_CLEAN, { reply: 'dale' }) === null);
    check('C5 con create que ya trajo imagen NO se crea trabajo', runNet(ctx, INCIDENTE_CLEAN, { reply: 'listo' }, { createdApplied: { ok: [{ id: 5 }] } }) === null);
    check('C6 con edit con regeneración NO se crea trabajo', runNet(ctx, INCIDENTE_CLEAN, { reply: 'listo' }, { editApplied: { imageRegen: 1 } }) === null);
    check('C7 sin pedido de imagen NO se crea trabajo', runNet(ctx, [{ role: 'user', text: '¿cómo va mi semana?' }], { reply: 'va bien' }) === null);
  }

  // C8: dedupe — un trabajo creando reciente se devuelve, no se duplica.
  {
    const ctx = mkCtx({ jobs: [{ id: 55, user_id: 12, tipo: 'chat_imagen', estado: 'creando', post_id: null, titulo: 'x', caption: 'y', estimado_seg: 60, mensaje_id: 501, mensaje_final_id: null, error: '', created_at: '2026-11-09 17:00:00' }] });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const r = runNet(ctx, INCIDENTE_CLEAN, { reply: 'genial, voy…' });
    check('C8 doble envío devuelve el trabajo existente (id 55)', r && r.id === 55 && r.estado === 'creando', JSON.stringify(r));
    check('C8b no se insertó un segundo trabajo', ctx.db._jobs.length === 1, `jobs=${ctx.db._jobs.length}`);
  }

  // C9–C10: ancla y cita atan el trabajo al posteo correcto.
  {
    const ctx = mkCtx({ posts: [{ id: 583, caption: 'Posteo de fitness para hoy', status: 'draft', media_type: 'image' }] });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const r = runNet(ctx, INCIDENTE_CLEAN, { reply: 'genial, voy…' }, { anchorId: 583 });
    check('C9 con ancla al borrador, el trabajo se ata a ese posteo', r && r.post_id === 583, JSON.stringify(r));
    const ctx2 = mkCtx({ quote: { id: 580, caption: 'El posteo citado de café', status: 'scheduled' } });
    vm.createContext(ctx2);
    vm.runInContext(loaded.code, ctx2);
    const r2 = runNet(ctx2, [{ role: 'user', text: 'mándame la imagen del posteo «El posteo citado de café»' }], { reply: 'genial, voy…' });
    check('C10 con cita al posteo, el trabajo se ata a ese posteo', r2 && r2.post_id === 580, JSON.stringify(r2));
  }

  // C11: el barrido salda los creando viejos y deja los jóvenes.
  {
    const ctx = mkCtx({ jobs: [
      { id: 61, user_id: 12, tipo: 'chat_imagen', estado: 'creando', post_id: null, titulo: 'viejo', caption: 'c', estimado_seg: 60, mensaje_id: 601, mensaje_final_id: null, error: '', created_at: '2026-11-09 16:30:00', _viejo: true },
      { id: 62, user_id: 12, tipo: 'chat_imagen', estado: 'creando', post_id: null, titulo: 'joven', caption: 'c', estimado_seg: 60, mensaje_id: 602, mensaje_final_id: null, error: '', created_at: '2026-11-09 17:00:00' },
    ] });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    vm.runInContext('pzTrabajoMarcarVencidos(db)', ctx);
    const viejo = ctx.db._jobs.find((j) => j.id === 61);
    const joven = ctx.db._jobs.find((j) => j.id === 62);
    check('C11 el barrido salda el trabajo viejo como fallo/tiempo_agotado', viejo && viejo.estado === 'fallo' && viejo.error === 'tiempo_agotado', JSON.stringify(viejo));
    check('C11b el barrido avisa en el hilo con [trabajo-fallo:61]', ctx.db._msgs.some((m) => /\[trabajo-fallo:61\]/.test(m.text)), JSON.stringify(ctx.db._msgs));
    check('C11c el trabajo joven NO se toca', joven && joven.estado === 'creando', JSON.stringify(joven));
  }

  // C12: los textos de fallo son honestos, sin jerga técnica.
  {
    const ctx = mkCtx();
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const kinds = ['fallo', 'revision', 'tope', 'sin_clave', 'tiempo_agotado'];
    const textos = kinds.map((k) => vm.runInContext(`pzTrabajoFalloAmable(${JSON.stringify(k)}, false)`, ctx));
    check('C12 ningún texto de fallo tiene jerga (timeout/429/quota/error)', textos.every((t) => !/timeout|429|quota|error|Error/i.test(t)), textos.join(' | '));
    check('C12b el fallo genérico ofrece reintentar', /reintentar/.test(textos[0]), textos[0]);
    check('C12c el fallo por revisión dice que quedó en revisión', /revisión/.test(textos[1]), textos[1]);
    check('C12d el fallo por tope dice que es por hoy', /por hoy/.test(textos[2]), textos[2]);
  }
}

// ---------- Parte D: boot real ----------
const PORT = 34593;
const TEST_KEY = 'boot-test-key-imagen-chat';
const ADMIN_TOKEN = (() => { try { const m = fs.readFileSync(path.join(DIR, 'test-lote-chat-clicks.js'), 'utf8').match(/const ADMIN_TOKEN = '([^']+)';/); return m ? m[1] : ''; } catch (e) { return ''; } })();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagen-chat-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync(path.join(mediaDir, 'f1.png'), PNG_1X1);

async function reqJson(method, p, body, cookie) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  const setCookie = r.headers.get('set-cookie');
  return { status: r.status, json: j, setCookie };
}
function seedDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try {
    for (let i = 0; i < 10; i++) {
      try { fn(db); return; }
      catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
    }
  } finally { try { db.close(); } catch (e) {} }
}
function readDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return fn(db); }
  finally { try { db.close(); } catch (e) {} }
}
function trabajoRow(dbPath, id) {
  return readDb(dbPath, (db) => db.prepare('SELECT id, user_id, tipo, estado, post_id, mensaje_id, mensaje_final_id, error FROM trabajos WHERE id = ?').get(id));
}
function chatMsgs(dbPath, uid) {
  return readDb(dbPath, (db) => db.prepare('SELECT id, role, text FROM chat_messages WHERE user_id = ? ORDER BY id').all(uid));
}
async function bootServer() {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, ADMIN_TOKEN,
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  let up = false;
  for (let i = 0; i < 45; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
    await sleep(1000);
  }
  return { child, up, out: () => out };
}
async function killServer(child) {
  try { child.kill('SIGTERM'); } catch (e) {}
  await sleep(800);
  try { if (!child.killed) child.kill('SIGKILL'); } catch (e) {}
  await sleep(300);
}

async function parteD() {
  console.log('— D) boot real: trabajos, reintentar, barrido, historial con ids —');
  const dbPath = path.join(tmpDir, 'posta.db');
  // --- Boot 1: endpoints + runner sin clave ---
  const b1 = await bootServer();
  try {
    check('D0 el servidor levanta con el lote', b1.up);
    if (!b1.up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(b1.out().split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await reqJson('GET', '/api/version');
    check('D0b /api/version trae el BUILD v847', ver.status === 200 && ver.json && ver.json.build === '20261105-v847', JSON.stringify(ver.json));
    check('D0c la DB del boot existe en el DATA_DIR temporal', fs.existsSync(dbPath));
    check('D0d la tabla trabajos existe en la DB del boot', readDb(dbPath, (db) => { try { db.prepare('SELECT COUNT(*) c FROM trabajos').get(); return true; } catch (e) { return false; } }));

    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'join', ig: 'imagen-chat-test', device: 'test-device-imagen-chat' });
    check('D0e join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const uid = join.json.user_id;
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';

    // Semilla: cuenta completa + propuesta de fitness en el hilo + borrador
    // + un trabajo fallido (para reintentar), uno creando joven (para el 409)
    // y uno de otro usuario (para el 403).
    let d1 = 0, tFallo = 0, tCreando = 0, tOtro = 0, otroUid = 0;
    seedDb(dbPath, (db) => {
      db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(uid);
      otroUid = Number(db.prepare(`INSERT INTO users (email, password_hash) VALUES (?,?)`).run('otro@test.local', 'x').lastInsertRowid);
      db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'assistant', '¡Genial! Te propongo un posteo de fitness: una foto tuya entrenando al amanecer con el titular «Empezá el día con energía» y un caption corto que invite a moverse. El posteo saldría hoy a las 19:00 con tus colores y tu tono cercano. ¿Querés que lo arme?');
      db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'user', 'Claro, ahí sí, me gusta. Perfecto, arma eso y mándame la imagen del posteo.');
      d1 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uid, '/media/f1.png', 'Posteo de fitness para hoy', '', null, 'draft', 'image', 0).lastInsertRowid);
      tFallo = Number(db.prepare(`INSERT INTO trabajos (user_id, tipo, estado, post_id, titulo, caption, estimado_seg, error) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uid, 'chat_imagen', 'fallo', d1, 'Posteo de fitness', 'Posteo de fitness para hoy', 60, 'fallo').lastInsertRowid);
      tCreando = Number(db.prepare(`INSERT INTO trabajos (user_id, tipo, estado, post_id, titulo, caption, estimado_seg) VALUES (?,?,?,?,?,?,?)`)
        .run(uid, 'chat_imagen', 'creando', null, 'Otro posteo', 'Otro caption', 60).lastInsertRowid);
      tOtro = Number(db.prepare(`INSERT INTO trabajos (user_id, tipo, estado, post_id, titulo, caption, estimado_seg) VALUES (?,?,?,?,?,?,?)`)
        .run(otroUid, 'chat_imagen', 'fallo', null, 'Ajeno', 'Ajeno', 60).lastInsertRowid);
    });
    check('D0f semilla ok (borrador + 3 trabajos)', d1 > 0 && tFallo > 0 && tCreando > 0 && tOtro > 0, `d=${d1} t=${tFallo},${tCreando},${tOtro}`);

    // D1–D3: GET del trabajo (propio, ajeno, inexistente).
    const g1 = await reqJson('GET', `/api/trabajos/${tFallo}`, null, cookie);
    check('D1 GET del trabajo propio responde 200 con el estado', g1.status === 200 && g1.json && g1.json.ok === true && g1.json.trabajo && g1.json.trabajo.estado === 'fallo', JSON.stringify(g1.json));
    const g2 = await reqJson('GET', `/api/trabajos/${tOtro}`, null, cookie);
    check('D2 GET del trabajo ajeno es 403', g2.status === 403, JSON.stringify(g2.json));
    const g3 = await reqJson('GET', '/api/trabajos/987654321', null, cookie);
    check('D3 GET del trabajo inexistente es 404', g3.status === 404, JSON.stringify(g3.json));

    // D4: el historial trae ids (el ancla del deep link los necesita).
    const h = await reqJson('GET', '/api/ideas/chat', null, cookie);
    const hm = (h.json && h.json.messages) || [];
    check('D4 GET /api/ideas/chat trae los mensajes con id numérico', hm.length >= 2 && hm.every((m) => Number(m.id) > 0), JSON.stringify(hm.map((m) => m.id)));

    // D5: reintentar el fallido → creando + estado nuevo; sin clave, el
    // runner salda 'fallo' con mensaje honesto + marcador de reintento.
    const rt = await reqJson('POST', `/api/trabajos/${tFallo}/reintentar`, {}, cookie);
    check('D5 POST reintentar responde 200 con estado creando', rt.status === 200 && rt.json && rt.json.ok === true && rt.json.trabajo && rt.json.trabajo.estado === 'creando', JSON.stringify(rt.json));
    const msgs5 = chatMsgs(dbPath, uid);
    check('D5b el reintento crea un estado nuevo en el hilo', msgs5.some((m) => /\[creando-imagen:\d+\] Creando tu imagen de nuevo…/.test(m.text)), JSON.stringify(msgs5.map((m) => m.text.slice(0, 80))));
    let settled = null;
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      settled = trabajoRow(dbPath, tFallo);
      if (settled && settled.estado === 'fallo') break;
    }
    check('D5c sin clave, el runner salda el trabajo como fallo', settled && settled.estado === 'fallo', JSON.stringify(settled));
    check('D5d el error es sin_clave (o fallo genérico, nunca un cuelgue)', settled && (settled.error === 'sin_clave' || settled.error === 'fallo'), JSON.stringify(settled));
    const msgs5b = chatMsgs(dbPath, uid);
    const falloMsg = msgs5b.find((m) => m.text.includes('[trabajo-fallo:'));
    check('D5e el fallo avisa en el hilo con [trabajo-fallo] + motivo honesto', !!falloMsg && /no pude generar la imagen/.test(falloMsg.text) && !/timeout|429|quota/i.test(falloMsg.text), falloMsg ? falloMsg.text.slice(0, 200) : 'sin mensaje de fallo');
    check('D5f el trabajo fallido guarda el id del mensaje final', settled && Number(settled.mensaje_final_id) > 0, JSON.stringify(settled));

    // D6: reintentar un creando joven es 409 (no se duplica el trabajo).
    const rt2 = await reqJson('POST', `/api/trabajos/${tCreando}/reintentar`, {}, cookie);
    check('D6 reintentar un creando joven es 409 no_reintentable', rt2.status === 409 && rt2.json && rt2.json.error === 'no_reintentable', JSON.stringify(rt2.json));

    // D7: el POST del chat con el pedido de imagen no se cae sin clave
    // (la red vía POST con cerebro real la verifica el preparador con el
    // surrogado; acá se verifica que el handler no rompe con el lote).
    const ch = await reqJson('POST', '/api/ideas/chat', { messages: [
      { role: 'assistant', text: '¡Genial! Te propongo un posteo de fitness: una foto tuya entrenando al amanecer con el titular «Empezá el día con energía».' },
      { role: 'user', text: 'Claro, ahí sí, me gusta. Perfecto, arma eso y mándame la imagen del posteo.' },
    ] }, cookie);
    check('D7 POST /api/ideas/chat con el pedido responde 200 (reply o pending)', ch.status === 200 && ch.json && (typeof ch.json.reply === 'string' || ch.json.pending === true), JSON.stringify(ch.json).slice(0, 300));
  } catch (e) {
    console.log('error de la parte D (boot 1):', e.message);
    fail++;
  } finally {
    await killServer(b1.child);
  }

  // --- Boot 2: el barrido de arranque salda el creando viejo ---
  try {
    seedDb(dbPath, (db) => {
      db.prepare(`INSERT INTO trabajos (user_id, tipo, estado, post_id, titulo, caption, estimado_seg, created_at, updated_at) VALUES (?,?,?,?,?,?,?, datetime('now','-15 minutes'), datetime('now','-15 minutes'))`)
        .run(1, 'chat_imagen', 'creando', null, 'Trabajo viejo', 'Caption vieja', 60);
    });
    const viejoId = readDb(dbPath, (db) => db.prepare(`SELECT id FROM trabajos WHERE titulo = 'Trabajo viejo'`).get().id);
    const b2 = await bootServer();
    try {
      check('D8 el segundo boot levanta', b2.up);
      if (!b2.up) {
        console.log('--- salida del servidor (últimas 30 líneas) ---');
        console.log(b2.out().split('\n').slice(-30).join('\n'));
        throw new Error('no levanta el boot 2');
      }
      const row = trabajoRow(dbPath, viejoId);
      check('D8b el barrido saldó el creando viejo como fallo/tiempo_agotado', row && row.estado === 'fallo' && row.error === 'tiempo_agotado', JSON.stringify(row));
      const msgs8 = chatMsgs(dbPath, 1);
      check('D8c el barrido avisó en el hilo con [trabajo-fallo]', msgs8.some((m) => m.text.includes(`[trabajo-fallo:${viejoId}]`)), JSON.stringify(msgs8.map((m) => m.text.slice(0, 100))));
    } finally {
      await killServer(b2.child);
    }
  } catch (e) {
    console.log('error de la parte D (boot 2):', e.message);
    fail++;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  parteA();
  await parteB();
  parteC();
  await parteD();
  console.log(`\ntest-lote-imagen-chat-estado: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
