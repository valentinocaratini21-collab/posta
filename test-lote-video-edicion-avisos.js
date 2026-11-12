'use strict';
// test-lote-video-edicion-avisos.js — LOTE VIDEO EN POSTY (edición automática
// + avisos + responder deslizando). Valentino 10/11 21:26 «dale, armalo».
// Parte A: el video del cliente se edita solo (ffmpeg local, USD 0) y Posty
// avisa en el chat cuando lo está editando (con el tiempo por duración) y
// cuando está listo (push + chat, con «Me gusta» / «Cambiar algo»). Si el
// cliente no responde, sale como está programado (piloto automático).
// Parte B: deslizar a la derecha sobre un mensaje de Posty = responderlo,
// con la cita arriba (como WhatsApp); vale para cualquier mensaje.
// Node puro: estáticos + VM (app.js) + módulo video-edicion.js + boot real.
// Uso: node test-lote-video-edicion-avisos.js
// TMPDIR en el scratch (no /tmp: tmpfs 512M, los renders lo llenan).
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// (RE-BASE v938) El árbol es el directorio de la suite: el release del
// preparador acá, la raíz del repo en main. El builder lo tenía hardcodeado
// a su scratch y la suite leía (y booteaba) el árbol viejo con los
// provisionales — por eso los pins de estampado fallaban sobre el fusionado.
const SCRATCH = __dirname;
const TREE = SCRATCH;
// (RE-BASE v938) Los temporales van FUERA del árbol: el boot copia el árbol
// entero y fs.cpSync se niega a copiar un directorio dentro de sí mismo.
const TMPBASE = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(TMPBASE, '.tmp-test-'));
process.env.TMPDIR = TMP;
const MEDIA = path.join(TMP, 'media');
fs.mkdirSync(MEDIA, { recursive: true });

let ok = 0, bad = 0;
const FAILURES = [];
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; FAILURES.push(name); console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(TREE, 'public/styles.css'), 'utf8');
const idxES = fs.readFileSync(path.join(TREE, 'public/index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(TREE, 'public/en/index.html'), 'utf8');
const dbjs = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');

// Extrae una function declaration por nombre (balanceo de llaves).
function extractFn(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i === -1) return '';
  // Si es `async function`, incluir el `async` (si no, el await interno
  // es SyntaxError en la VM).
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let d = 0, j = src.indexOf('{', i);
  if (j === -1) return '';
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

(async () => {
  // ---------- 1. Estampado (provisional: el tablero confirma el número) ----------
  t(srv.includes("const BUILD_ID = '20261105-v938';"), 'server: BUILD v938');
  t(cnt(srv, '20261105-v938') === 1, 'server: BUILD v938 ×1');
  t(!srv.includes('20261105-v879'), 'server: sin restos de v879');
  t(idxES.includes('/app.js?v=648'), 'index ES: app.js?v=648');
  t(idxES.includes('/styles.css?v=20261270'), 'index ES: styles?v=20261270');
  t(idxEN.includes('/styles.css?v=20261270'), 'index EN: styles?v=20261270 (mismo valor que ES)');
  t(!idxEN.includes('/app.js?v='), 'index EN: no carga app.js (landing)');
  t(!idxES.includes('v=598') && !idxES.includes('v=20261228'), 'index ES: sin ?v= viejos');

  // ---------- 2. Server estático: Parte A ----------
  t(srv.includes("const videoEdicion = require('./video-edicion');"), 'server: require video-edicion.js');
  t(fs.existsSync(path.join(TREE, 'video-edicion.js')), 'video-edicion.js existe en el árbol');
  t(srv.includes("if (media === 'video') {") && srv.includes('videoEditAvisoEditando(uid, en, durSec);'), 'server: rama de video en subirFotoGenerar con aviso «editando»');
  t(srv.includes('videoEdicion.editarVideoCliente({'), 'server: el hook llama a editarVideoCliente');
  t(srv.includes("applied.push('video-editado');"), 'server: el edit aplicado marca video-editado');
  t(srv.includes("notes.push('video-edicion');"), 'server: el fallo marca video-edicion (fail-closed)');
  t(srv.includes("UPDATE posts SET image_path = ?, prev_image_path = ?, cover_path = ? WHERE id = ?"), 'server: el edit actualiza image_path + cover_path');
  t(srv.includes("app.post('/api/posts/:id/video-feedback'"), 'server: endpoint video-feedback');
  t(srv.includes("'video-edicion': en ? 'I could not edit the video"), 'server: nota honesta video-edicion en /programar');
  t(srv.includes('function videoEditTiempoBucket(durSec)'), 'server: videoEditTiempoBucket definida');
  t(srv.includes('function videoEditAvisoEditando(') && srv.includes('function videoEditAvisoListo('), 'server: avisos editando/listo definidos');
  t(srv.includes('[video-listo:${postId}:${videoRel}]'), 'server: marcador [video-listo:ID:RUTA]');
  t(srv.includes("url: '/#/app/chat'"), 'server: la push «video listo» abre el chat');
  t(srv.includes('video_listo_aviso'), 'server: idempotencia del aviso (video_listo_aviso)');
  t(srv.includes("UPDATE posts SET video_feedback = ? WHERE id = ?"), 'server: el feedback queda en posts.video_feedback');
  t(srv.includes('decime qué querés cambiar'), 'server: «Cambiar algo» pregunta qué cambiar (recortar/música/portada)');
  // Parte B (server).
  t(srv.includes('function chatReplyFromBody(') && srv.includes('function chatInsertUser('), 'server: helpers de cita definidos');
  t(cnt(srv, 'chatInsertUser(db, uidChat, lastUserText, chatReply, JSON.stringify(userPhotos));') === 4, 'server: 4 inserts uidChat con cita en /api/ideas/chat');
  t(srv.includes('chatInsertUser(db, uid, lastUserText, chatReply, JSON.stringify(userPhotos));'), 'server: insert uid+lastUserText con cita');
  t(srv.includes('chatInsertUser(db, uid, clean[clean.length - 1].text, chatReply, JSON.stringify(userPhotos));'), 'server: camino principal con cita');
  t(srv.includes('chatInsertUser(db, req.session.userId, texto, chatReplyFromBody'), 'server: /api/oficina/chat guarda la cita');
  t(srv.includes('c.reply_to, c.reply_text, c.caption_post_id'), 'server: GET /api/ideas/chat devuelve reply_to/reply_text');
  t(srv.includes('reply_to: r.reply_to || null'), 'server: GET trial/chat-onboarding devuelve reply_to');
  // DB.
  t(dbjs.includes('ALTER TABLE chat_messages ADD COLUMN reply_to INTEGER'), 'db: columna reply_to');
  t(dbjs.includes('ALTER TABLE chat_messages ADD COLUMN reply_text TEXT'), 'db: columna reply_text');
  t(dbjs.includes('ALTER TABLE posts ADD COLUMN video_feedback TEXT'), 'db: columna video_feedback');
  t(dbjs.includes('ALTER TABLE posts ADD COLUMN video_listo_aviso INTEGER'), 'db: columna video_listo_aviso');

  // ---------- 3. Buckets de tiempo (de la duración medida, no inventados) ----------
  const bucketSrc = extractFn(srv, 'videoEditTiempoBucket');
  t(bucketSrc.length > 50, 'bucket: función extraída');
  const bucket = vm.runInNewContext(bucketSrc + '; videoEditTiempoBucket;', {});
  t(bucket(0).es === 'menos de un minuto', 'bucket: 0 s → menos de un minuto');
  t(bucket(10).es === 'menos de un minuto', 'bucket: 10 s → menos de un minuto (medido 11–15 s)');
  t(bucket(30).es === 'menos de un minuto', 'bucket: 30 s → menos de un minuto (límite)');
  t(bucket(31).es === 'alrededor de un minuto', 'bucket: 31 s → alrededor de un minuto');
  t(bucket(50).es === 'alrededor de un minuto', 'bucket: 50 s → alrededor de un minuto (medido 46 s)');
  t(bucket(60).es === 'alrededor de un minuto', 'bucket: 60 s → alrededor de un minuto (límite)');
  t(bucket(61).es === 'unos 2 minutos', 'bucket: 61 s → unos 2 minutos');
  t(bucket(120).es === 'unos 2 minutos', 'bucket: 120 s → unos 2 minutos (medido 102 s)');
  t(bucket(10).en === 'less than a minute' && bucket(120).en === 'about 2 minutes', 'bucket: versión EN');

  // ---------- 4. Helpers de cita (unidad, con DB falsa) ----------
  function fakeDb(opts) {
    const rows = [];
    const noReplyCols = !!(opts && opts.noReplyCols);
    return {
      rows,
      prepare(sql) {
        const hasReply = sql.includes('reply_to');
        return {
          get: (a, b) => rows.find((r) => r.id === a && r.user_id === b) || null,
          run: (...args) => {
            if (hasReply && noReplyCols) throw new Error('no such column: reply_to');
            if (hasReply) {
              const [uid, role, text, reply_to, reply_text] = args;
              const id = rows.length + 1;
              rows.push({ id, user_id: uid, role, text, reply_to, reply_text });
              return { lastInsertRowid: id };
            }
            const [uid, role, text] = args;
            const id = rows.length + 1;
            rows.push({ id, user_id: uid, role, text, reply_to: null, reply_text: '' });
            return { lastInsertRowid: id };
          },
        };
      },
    };
  }
  const replySrc = extractFn(srv, 'chatReplyFromBody') + '\n' + extractFn(srv, 'chatInsertUser');
  t(replySrc.includes('chatReplyFromBody') && replySrc.includes('chatInsertUser'), 'cita: funciones extraídas');
  const ctx = { db: null };
  vm.createContext(ctx);
  vm.runInContext(replySrc + '\nthis.__r = { chatReplyFromBody, chatInsertUser };', ctx);
  const R = ctx.__r;
  const fdb = fakeDb();
  fdb.rows.push({ id: 10, user_id: 7, role: 'assistant', text: 'tu video ya está listo', reply_to: null, reply_text: '' });
  fdb.rows.push({ id: 11, user_id: 8, role: 'assistant', text: 'de otro usuario', reply_to: null, reply_text: '' });
  const rp1 = R.chatReplyFromBody(fdb, 7, { reply_to: 10 });
  t(rp1 && rp1.to === 10 && rp1.text === 'tu video ya está listo', 'cita: reply_to válido del mismo usuario (usa el texto guardado)');
  const rp2 = R.chatReplyFromBody(fdb, 7, { reply_to: 10, reply_text: 'cita corta' });
  t(rp2 && rp2.text === 'cita corta', 'cita: reply_text del cliente manda sobre el guardado');
  t(R.chatReplyFromBody(fdb, 7, { reply_to: 11 }) === null, 'cita: reply_to de OTRO usuario → null (no cruza usuarios)');
  t(R.chatReplyFromBody(fdb, 7, { reply_to: 999 }) === null, 'cita: reply_to inexistente → null');
  t(R.chatReplyFromBody(fdb, 7, {}) === null, 'cita: sin reply_to → null');
  R.chatInsertUser(fdb, 7, 'cambialo por favor', rp1);
  const ins = fdb.rows[fdb.rows.length - 1];
  t(ins.role === 'user' && ins.text === 'cambialo por favor' && ins.reply_to === 10 && ins.reply_text === 'tu video ya está listo', 'cita: el insert guarda reply_to + reply_text');
  R.chatInsertUser(fdb, 7, 'hola', null);
  const ins2 = fdb.rows[fdb.rows.length - 1];
  t(ins2.reply_to === null && ins2.reply_text === '', 'cita: sin cita → reply_to null');
  const odb = fakeDb({ noReplyCols: true });
  odb.rows.push({ id: 10, user_id: 7, role: 'assistant', text: 'x', reply_to: null, reply_text: '' });
  R.chatInsertUser(odb, 7, 'no se pierde', { to: 10, text: 'x' });
  t(odb.rows.length === 2 && odb.rows[1].text === 'no se pierde', 'cita: sin columnas en la DB, el mensaje igual se guarda (fallback)');

  // ---------- 5. video-edicion.js (módulo, con video real) ----------
  process.env.DATA_DIR = TMP;
  const VE = require(path.join(TREE, 'video-edicion.js'));
  t(typeof VE.editarVideoCliente === 'function', 'VE: editarVideoCliente exportada');
  t(typeof VE.decidirReencuadre === 'function', 'VE: decidirReencuadre exportada');
  t(VE.decidirReencuadre({ width: 1280, height: 720 }).mode === 'pad', 'VE: paisaje 16:9 → pad (no corta el sujeto)');
  t(VE.decidirReencuadre({ width: 720, height: 720 }).mode === 'pad', 'VE: cuadrado → pad');
  t(VE.decidirReencuadre({ width: 720, height: 1280 }).mode === 'crop', 'VE: vertical 9:16 → crop con foco');
  t(VE.decidirReencuadre({ width: 864, height: 1080 }).mode === 'pad', 'VE: 4:5 → pad');
  t(VE.decidirReencuadre({ width: 0, height: 0 }).mode === 'pad', 'VE: sin dimensiones → pad (fail-safe)');
  const cafeClip = path.join(os.homedir(), 'workspace', 'posty-videos-premium', 'video-premium-cafe.mp4');
  if (fs.existsSync(cafeClip)) {
    const out = await VE.editarVideoCliente({ absPath: cafeClip, mediaDir: MEDIA, uid: 7, rubro: 'café', category: 'café', seed: '7:999', outBase: 'video-edit-999' });
    t(out && out.ok === true, 'VE: edit real del café → ok', out && out.reason);
    if (out && out.ok) {
      t(out.width === 720 && out.height === 1280, 'VE: salida 720×1280', out.width + 'x' + out.height);
      t(out.duration > 0 && out.duration <= 90, 'VE: duración ≤90 s', out.duration);
      t(fs.existsSync(path.join(MEDIA, 'video-edit-999.mp4')), 'VE: archivo de salida existe');
      t(typeof out.musicFile === 'string' && out.musicFile.length > 0, 'VE: música CC0 mezclada', out.musicFile);
      t(out.reframe === 'crop' || out.reframe === 'pad', 'VE: reframe informado', out.reframe);
      t(typeof out.coverRel === 'string', 'VE: portada informada', out.coverRel);
    }
    const badOut = await VE.editarVideoCliente({ absPath: path.join(TMP, 'no-existe.mp4'), mediaDir: MEDIA, uid: 7, outBase: 'video-edit-roto' });
    t(badOut && badOut.ok === false && badOut.reason === 'video_no_valido', 'VE: archivo inexistente → fail-closed video_no_valido');
    t(!fs.existsSync(path.join(MEDIA, 'video-edit-roto.mp4')), 'VE: el fallo no deja .mp4 parcial');
  } else {
    t(false, 'VE: clip de café presente para el edit real');
  }

  // ---------- 6. app.js en VM: cita + video-listo + swipe ----------
  const escStub = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const appLines = app.split('\n');
  // chatReplyQuoteHtml (9008) + chatMsgHtml (9016..9097, antes de logoCandidateRespond).
  const qStart = app.indexOf('function chatReplyQuoteHtml(reply) {');
  const mStart = app.indexOf('function chatMsgHtml(role, text, ts, id, reply) {');
  const mEnd = app.indexOf('async function logoCandidateRespond(', mStart);
  const chatSrc = app.slice(qStart, mEnd);
  t(chatSrc.includes('function chatMsgHtml(') && chatSrc.includes('VIDEO_LISTO_MARKER_RE'), 'VM: chatMsgHtml + video-listo extraídos');
  const vmCtx = {
    console, ME: { lang: 'es' },
    esc: escStub,
    linkifyEsc: (s) => escStub(s),
    chatHoraHtml: () => '<span class="chat-msg-hora">21:00</span>',
    chatStripCelebrate: (s) => String(s || ''),
    chatStripFpMarker: (s) => String(s || ''),
    pzIc: () => '',
    gzT: (es) => es,
    FOTO_MARKER_RE: /\[foto:([^\]]+)\]/,
    VIDEO_LISTO_MARKER_RE: /\[video-listo:(\d+):([^\]]+)\]/,
    LC_MARKER_RE: /\[logo-candidate(?::([^\]]+))?\]/,
    FP_MARKER_RE: /\[first-publish\]/,
    CELEBRATE_MARKER_G: /\[celebrate\]/gi,
  };
  vm.createContext(vmCtx);
  vm.runInContext(chatSrc, vmCtx);
  const htmlPlain = vmCtx.chatMsgHtml('assistant', 'hola, ¿cómo va?', 1000, 5);
  t(htmlPlain.includes('chat-msg ai') && htmlPlain.includes('hola, ¿cómo va?'), 'VM: burbuja normal sin cita');
  t(!htmlPlain.includes('pz-chat-quote'), 'VM: sin cita no hay bloque de cita');
  const htmlQuote = vmCtx.chatMsgHtml('user', 'cambialo por favor', 1001, 6, { to: 5, text: 'tu video ya está listo' });
  t(htmlQuote.includes('pz-chat-quote') && htmlQuote.includes('data-reply-to="5"') && htmlQuote.includes('tu video ya está listo'), 'VM: la respuesta muestra la cita con data-reply-to');
  t(htmlQuote.includes('cambialo por favor'), 'VM: la cita no se come el texto de la respuesta');
  const htmlListo = vmCtx.chatMsgHtml('assistant', 'tu video ya está listo [video-listo:42:/media/video-edit-42.mp4]', 1002, 7);
  t(htmlListo.includes('pz-video-listo') && htmlListo.includes('<video') && htmlListo.includes('/media/video-edit-42.mp4'), 'VM: video-listo renderiza el video');
  t(htmlListo.includes('pzVideoListoFeedback(42, \'gusta\'') && htmlListo.includes('pzVideoListoFeedback(42, \'cambiar\''), 'VM: video-listo tiene Me gusta / Cambiar algo con el postId');
  t(!htmlListo.includes('[video-listo:'), 'VM: el marcador no se ve en el texto');
  t(htmlListo.includes('tu video ya está listo'), 'VM: video-listo muestra el texto');
  const htmlListoUser = vmCtx.chatMsgHtml('user', 'tu video ya está listo [video-listo:42:/media/x.mp4]', 1003, 8);
  t(!htmlListoUser.includes('pz-video-listo'), 'VM: el marcador solo rinde en mensajes de Posty');
  t(vmCtx.chatReplyQuoteHtml(null) === '' && vmCtx.chatReplyQuoteHtml({}) === '', 'VM: chatReplyQuoteHtml sin cita → vacío');
  t(vmCtx.chatReplyQuoteHtml({ to: 9, text: 'hola' }).includes('data-reply-to="9"'), 'VM: chatReplyQuoteHtml con cita');

  // Swipe + barra + feedback (extraídos del app.js real).
  const swipeSrc = extractFn(app, 'pzChatReplySwipeInit') + '\n' + extractFn(app, 'pzChatReplySet') + '\n' + extractFn(app, 'pzChatReplyClear') + '\n' + extractFn(app, 'pzChatReplyBar') + '\n' + extractFn(app, 'pzVideoListoFeedback');
  t(swipeSrc.includes('pzChatReplySwipeInit') && swipeSrc.includes('pzVideoListoFeedback'), 'VM: funciones de swipe/feedback extraídas');
  // DOM falso mínimo.
  function fakeEl(tag, attrs) {
    const el = {
      tagName: (tag || 'DIV').toUpperCase(), style: {}, dataset: {},
      _attrs: Object.assign({}, attrs || {}), _listeners: {}, _children: [],
      textContent: '', innerHTML: '',
      getAttribute: (k) => (el._attrs[k] == null ? null : String(el._attrs[k])),
      setAttribute: (k, v) => { el._attrs[k] = String(v); },
      addEventListener: (ev, fn) => { (el._listeners[ev] = el._listeners[ev] || []).push(fn); },
      closest: (sel) => (sel === '.chat-msg.ai' && el._isAi ? el : null),
      querySelectorAll: () => [],
      querySelector: () => null,
      cloneNode: () => fakeEl(el.tagName, el._attrs),
      scrollIntoView: () => {},
    };
    return el;
  }
  const boxEl = fakeEl('div', { id: 'chatBox' });
  const barEl = fakeEl('div', { id: 'pzReplyBar' });
  barEl.hidden = true;
  const docStub = { getElementById: (id) => (id === 'chatBox' ? boxEl : id === 'pzReplyBar' ? barEl : null), querySelector: () => null };
  const swipeCtx = {
    console, document: docStub, ME: { lang: 'es' }, esc: escStub,
    CHAT: [], api: { post: async () => ({ ok: true, messages: [] }) },
    bbToast: () => {}, chatAppendMsg: () => {}, chatMsgHtml: vmCtx.chatMsgHtml, chatScroll: () => {},
    setTimeout: (fn) => 0,
  };
  vm.createContext(swipeCtx);
  vm.runInContext(swipeSrc + '\nthis.__x = { pzChatReplySwipeInit, pzChatReplySet, pzChatReplyClear, pzChatReplyBar, pzVideoListoFeedback };', swipeCtx);
  const X = swipeCtx.__x;
  X.pzChatReplySwipeInit();
  t((boxEl._listeners.touchstart || []).length === 1 && (boxEl._listeners.touchend || []).length === 1 && (boxEl._listeners.click || []).length === 1, 'VM: swipe registra touchstart/touchend/click en #chatBox');
  X.pzChatReplySwipeInit();
  t((boxEl._listeners.touchstart || []).length === 1, 'VM: swipe no se registra dos veces');
  // Simular deslizar a la derecha sobre una burbuja de Posty.
  const bubble = fakeEl('div', { 'data-msg-id': '77' });
  bubble._isAi = true;
  bubble.textContent = 'tu video ya está listo';
  bubble.cloneNode = () => { const c = fakeEl('div', { 'data-msg-id': '77' }); c.textContent = 'tu video ya está listo'; c.querySelectorAll = () => []; return c; };
  const fire = (ev, x, y) => {
    const t0 = { clientX: x, clientY: y, target: bubble };
    (boxEl._listeners[ev] || []).forEach((fn) => fn({ changedTouches: [t0] }));
  };
  const now0 = Date.now;
  fire('touchstart', 100, 200);
  fire('touchmove', 170, 205);
  fire('touchend', 180, 205);
  t(swipeCtx.PZ_CHAT_REPLY && swipeCtx.PZ_CHAT_REPLY.id === 77 && swipeCtx.PZ_CHAT_REPLY.text === 'tu video ya está listo', 'VM: deslizar a la derecha cita el mensaje', JSON.stringify(swipeCtx.PZ_CHAT_REPLY));
  t(barEl.hidden === false && barEl.innerHTML.includes('Respondiendo a'), 'VM: la barra de respuesta aparece con la cita');
  X.pzChatReplyClear();
  t(swipeCtx.PZ_CHAT_REPLY === null && barEl.hidden === true, 'VM: × limpia la cita y esconde la barra');
  // Deslizar a la izquierda NO cita.
  fire('touchstart', 180, 200);
  fire('touchmove', 110, 205);
  fire('touchend', 100, 205);
  t(swipeCtx.PZ_CHAT_REPLY === null, 'VM: deslizar a la izquierda no cita');
  // Deslizar sobre una burbuja propia NO cita.
  const own = fakeEl('div', { 'data-msg-id': '78' });
  own._isAi = false;
  own.closest = () => null;
  own.textContent = 'hola';
  const fireOwn = (ev, x, y) => {
    const t0 = { clientX: x, clientY: y, target: own };
    (boxEl._listeners[ev] || []).forEach((fn) => fn({ changedTouches: [t0] }));
  };
  fireOwn('touchstart', 100, 200);
  fireOwn('touchend', 180, 205);
  t(swipeCtx.PZ_CHAT_REPLY === null, 'VM: deslizar sobre un mensaje propio no cita');
  Date.now = now0;
  // Feedback del video listo (api stub).
  let posted = null;
  swipeCtx.api.post = async (url, body) => { posted = { url, body }; return { ok: true, postId: 42, feedback: body.feedback, messages: [{ id: 201, role: 'user', text: 'me gusta 👍' }, { id: 202, role: 'assistant', text: '¡genial! 😍' }] }; };
  const btnEl = fakeEl('button');
  btnEl.closest = () => null;
  await X.pzVideoListoFeedback(42, 'gusta', btnEl);
  t(posted && posted.url === '/api/posts/42/video-feedback' && posted.body.feedback === 'gusta', 'VM: Me gusta pega a /api/posts/:id/video-feedback');
  t(swipeCtx.CHAT.length === 2 && swipeCtx.CHAT[0].text === 'me gusta 👍', 'VM: el feedback agrega los mensajes al chat');
  posted = null;
  await X.pzVideoListoFeedback(42, 'cambiar', btnEl);
  t(posted && posted.body.feedback === 'cambiar', 'VM: Cambiar algo pega con feedback=cambiar');
  await X.pzVideoListoFeedback(0, 'gusta', btnEl);
  t(posted && posted.body.feedback === 'cambiar', 'VM: postId inválido no pega (no-op)');

  // ---------- 7. M78: funciones llamadas desde la UI existen ----------
  const need = ['pzVideoListoFeedback', 'pzChatReplyClear', 'pzChatReplySwipeInit', 'pzChatReplySet', 'pzChatReplyBar', 'chatReplyQuoteHtml', 'chatMsgHtml', 'videoEditAvisoEditando', 'videoEditAvisoListo', 'chatInsertUser', 'chatReplyFromBody'];
  for (const fn of need) t(app.includes('function ' + fn + '(') || srv.includes('function ' + fn + '('), 'M78: ' + fn + ' definida');
  t(cnt(app, 'pzVideoListoFeedback') >= 3, 'M78: pzVideoListoFeedback ×3+ (def + 2 botones)');
  t(cnt(app, 'pzChatReplyClear') >= 2, 'M78: pzChatReplyClear ×2+ (def + × de la barra)');
  t(cnt(app, 'pzChatReplySwipeInit') >= 3, 'M78: pzChatReplySwipeInit ×3+ (def + bindChatView + chatLoadHistory)');

  // ---------- 8. CSS ----------
  t(css.includes('.pz-chat-quote{'), 'styles: .pz-chat-quote');
  t(css.includes('.pz-reply-bar{'), 'styles: .pz-reply-bar');
  t(css.includes('.pz-reply-bar-x{'), 'styles: .pz-reply-bar-x');
  t(css.includes('.pz-video-listo video{'), 'styles: .pz-video-listo video');

  // ---------- 9. Avisos (VM, con DB falsa y push capturado) ----------
  const avisoSrc = extractFn(srv, 'videoEditTiempoBucket') + '\n' + extractFn(srv, 'videoEditAvisoEditando') + '\n' + extractFn(srv, 'videoEditAvisoListo');
  t(avisoSrc.includes('videoEditAvisoListo'), 'aviso: funciones extraídas');
  const pushCalls = [];
  const avisoDb = {
    messages: [],
    posts: { 55: { video_listo_aviso: 0 } },
    prepare(sql) {
      return {
        get: (a, b) => (sql.includes('FROM posts') ? (avisoDb.posts[a] || null) : null),
        run: (...args) => {
          if (sql.includes('INSERT INTO chat_messages')) avisoDb.messages.push({ uid: args[0], role: args[1], text: args[2] });
          if (sql.includes('UPDATE posts SET video_listo_aviso')) avisoDb.posts[args[0] || 55].video_listo_aviso = 1;
          return {};
        },
      };
    },
  };
  const avisoCtx = {
    console,
    db: avisoDb,
    require: (m) => {
      if (m === './push') return { sendPush: (uid, p) => { pushCalls.push({ uid, p }); return Promise.resolve(); } };
      throw new Error('require no permitido: ' + m);
    },
  };
  vm.createContext(avisoCtx);
  vm.runInContext(avisoSrc + '\nthis.__a = { videoEditAvisoEditando, videoEditAvisoListo };', avisoCtx);
  const A = avisoCtx.__a;
  const b10 = A.videoEditAvisoEditando(7, false, 10);
  t(b10.es === 'menos de un minuto', 'aviso: editando devuelve el bucket (10 s → menos de un minuto)');
  t(avisoDb.messages.length === 1 && avisoDb.messages[0].text === 'estoy editando tu video, lo tenés listo en menos de un minuto', 'aviso: «estoy editando» se inserta en el chat con el bucket');
  const b120 = A.videoEditAvisoEditando(7, false, 120);
  t(avisoDb.messages[1].text === 'estoy editando tu video, lo tenés listo en unos 2 minutos', 'aviso: 120 s → «unos 2 minutos»');
  const bEn = A.videoEditAvisoEditando(7, true, 50);
  t(avisoDb.messages[2].text === "i'm editing your video, it'll be ready in about a minute", 'aviso: versión EN');
  t(A.videoEditAvisoListo(7, false, 55, '/media/video-edit-55.mp4') === true, 'aviso: «listo» la primera vez → true');
  const listoMsg = avisoDb.messages[avisoDb.messages.length - 1];
  t(listoMsg.text === 'tu video ya está listo [video-listo:55:/media/video-edit-55.mp4]', 'aviso: «listo» lleva el marcador con postId y ruta');
  t(pushCalls.length === 1 && pushCalls[0].p.url === '/#/app/chat' && pushCalls[0].p.data.postId === 55, 'aviso: push con url al chat y data.postId', JSON.stringify(pushCalls[0]));
  t(A.videoEditAvisoListo(7, false, 55, '/media/video-edit-55.mp4') === false, 'aviso: «listo» la segunda vez → false (una sola vez)');
  t(avisoDb.messages.filter((m) => m.text.includes('[video-listo:')).length === 1, 'aviso: el mensaje «listo» está una sola vez en el chat');
  t(A.videoEditAvisoListo(7, false, 999, '/media/x.mp4') === false, 'aviso: post inexistente → false (no avisa)');

  // ---------- 10. Boot real + subida de video end-to-end ----------
  // (El /generar completo no corre en el sandbox: el caption necesita
  // OpenAI y no hay key acá. El hook + el edit + los avisos quedan
  // verificados en §2/§5/§9; el /generar end-to-end es chequeo manual
  // post-deploy para el tablero.)
  const { spawn } = require('child_process');
  const BOOT = fs.mkdtempSync(path.join(TMPBASE, '.tmp-boot-'));
  const BOOT_DATA = path.join(BOOT, 'data');
  fs.mkdirSync(BOOT_DATA, { recursive: true });
  fs.cpSync(TREE, BOOT, { recursive: true });
  const PORT = 34700;
  const envBoot = Object.assign({}, process.env, {
    DATA_DIR: BOOT_DATA, PORT: String(PORT),
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    TZ: 'America/Argentina/Buenos_Aires',
  });
  const child = spawn('node', ['server.js'], { cwd: BOOT, env: envBoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let version = null;
  // El servidor tarda ~55 s en levantar (módulos + migraciones). Esperar 80 s.
  for (let i = 0; i < 160 && !version; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
      if (r.ok) version = await r.json();
    } catch (e) { /* aún no levanta */ }
    if (!version) await sleep(500);
  }
  t(version && version.build === '20261105-v938', 'boot: /api/version = v938', JSON.stringify(version));
  if (version) {
    const idx = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
    t(idx.includes('/app.js?v=648') && idx.includes('/styles.css?v=20261270'), 'boot: el index servido trae ?v=648 y styles?v=20261270');
    const bundle = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=648`)).text();
    t(bundle.includes('function pzVideoListoFeedback(') && bundle.includes('function pzChatReplySwipeInit(') && bundle.includes('VIDEO_LISTO_MARKER_RE'), 'boot: el bundle trae las funciones nuevas y el marcador');
    const cssServed = await (await fetch(`http://127.0.0.1:${PORT}/styles.css?v=20261270`)).text();
    t(cssServed.includes('.pz-chat-quote{') && cssServed.includes('.pz-reply-bar{'), 'boot: el CSS servido trae la cita y la barra');
    const fb = await fetch(`http://127.0.0.1:${PORT}/api/posts/1/video-feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    t(fb.status === 401, 'boot: /api/posts/:id/video-feedback registrado (401 sin auth)', fb.status);
    const chatG = await fetch(`http://127.0.0.1:${PORT}/api/ideas/chat`);
    const chatGJ = await chatG.json().catch(() => ({}));
    // Ruta pública (sin requireAuth, igual que en v879): sin sesión devuelve
    // { messages: [], welcome }.
    t(chatG.status === 200 && Array.isArray(chatGJ.messages), 'boot: /api/ideas/chat registrado (200 sin auth, messages [])', chatG.status);
    // Registro + subida del video real por la puerta del álbum.
    const reg = await fetch(`http://127.0.0.1:${PORT}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'video-test@postyhacetodo.com', password: 'test123456', terms_accepted: true }),
    });
    const regJ = await reg.json().catch(() => ({}));
    const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
    t(reg.ok && regJ.ok === true && cookie.length > 0, 'boot: registro de usuario de prueba', reg.status + ' ' + JSON.stringify(regJ).slice(0, 200));
    if (reg.ok && cookie && fs.existsSync(cafeClip)) {
      const vid = fs.readFileSync(cafeClip);
      const up = await fetch(`http://127.0.0.1:${PORT}/api/album/photo`, {
        method: 'POST', headers: { 'content-type': 'video/mp4', cookie }, body: vid,
      });
      const upJ = await up.json().catch(() => ({}));
      t(up.ok && upJ.ok === true && upJ.kind === 'video' && typeof upJ.path === 'string' && upJ.path.startsWith('/media/'), 'boot: el video sube por /api/album/photo (kind video, /media/…) ', up.status + ' ' + JSON.stringify(upJ).slice(0, 300));
      if (up.ok && upJ.path) {
        const chatAfter = await fetch(`http://127.0.0.1:${PORT}/api/ideas/chat`, { headers: { cookie } });
        const chatJ = await chatAfter.json().catch(() => ({}));
        t(chatAfter.ok && Array.isArray(chatJ.messages), 'boot: el chat se lee con la sesión', chatAfter.status);
      }
    }
  } else {
    t(false, 'boot: el servidor no levantó', bootLog.slice(0, 500));
  }
  // Matar por PID exacto y verificar que el puerto quedó libre.
  const bootPid = child.pid;
  try { process.kill(bootPid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let stillAlive = true;
  try { process.kill(bootPid, 0); } catch (e) { stillAlive = false; }
  if (stillAlive) { try { process.kill(bootPid, 'SIGKILL'); } catch (e) {} await sleep(800); }
  try { process.kill(bootPid, 0); stillAlive = true; } catch (e) { stillAlive = false; }
  t(!stillAlive, 'boot: el proceso murió por PID exacto', bootPid);
  let portFree = false;
  try {
    const ssOut = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    portFree = !ssOut.split('\n').some((l) => l.includes(':' + PORT + ' '));
  } catch (e) { portFree = true; }
  t(portFree, 'boot: el puerto ' + PORT + ' quedó libre');

  // ---------- Epílogo ----------
  console.log(`\ntest-lote-video-edicion-avisos: ${ok} OK, ${bad} FAIL`);
  if (bad) { console.log('FAILURES:'); FAILURES.forEach((f) => console.log('  -', f)); }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(BOOT, { recursive: true, force: true }); } catch (e) {}
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
