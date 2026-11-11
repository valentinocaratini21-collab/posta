'use strict';
// test-lote-caption-botones.js — LOTE CAPTION-BOTONES.
// Valentino 11/11 00:39: «A ese comentario que manda Posty le faltan dos
// botones que diga me gusta así o cambiar algo». Regla 11/11 00:36: la
// respuesta nunca es «dale, ya lo vi, te aviso en un rato»: cuando el cliente
// pide algo, se hace ahí mismo y la respuesta ES el resultado, con
// confirmación directa. Los botones son esa confirmación.
// La propuesta de caption vive en el mensaje (chat_messages.caption_post_id
// + caption_text + caption_estado) para que «Me gusta así» funcione aunque
// el cliente recargue. Entrada: dictado con caption_post_id + caption_text.
// Node puro: estáticos + VM (chatMsgHtml) + boot real.
// Uso: node test-lote-caption-botones.js
// TMPDIR en el scratch (no /tmp: tmpfs 512M).
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const SCRATCH = path.join(os.homedir(), 'workspace', '.lote-caption-botones');
const TREE = path.join(SCRATCH, 'release');
const TMP = fs.mkdtempSync(path.join(SCRATCH, '.tmp-test-'));
process.env.TMPDIR = TMP;

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
  t(srv.includes("const BUILD_ID = '20261105-v891';"), 'server: BUILD v891');
  t(cnt(srv, '20261105-v891') === 1, 'server: BUILD v891 ×1');
  t(!srv.includes('20261105-v879'), 'server: sin restos de v879');
  // No se tocan index ni styles en este lote: siguen en v890 (sin ?v= nuevo).
  t(idxES.includes('app.js?v=607'), 'index ES: app.js?v=607');
  t(cnt(idxES, 'app.js?v=607') === 1, 'index ES: app.js?v=607 ×1');
  t(!idxES.includes('app.js?v=598'), 'index ES: sin ?v=598');
  t(md5(idxEN) === '851632859bc66416e32ed9acbbba9732', 'index EN: intacto v890 (sin tocar)');
  t(md5(css) === 'eb672da5f96a25648a0629218bf9deb5', 'styles.css: intacto v890 (sin tocar)');

  // ---------- 2. Server estático ----------
  t(srv.includes("app.post('/api/posts/:id/caption-feedback'"), 'server: endpoint caption-feedback');
  t(srv.includes("caption_post_id, caption_text, caption_estado, created_at FROM chat_messages"), 'server: GET /api/ideas/chat devuelve las 3 columnas');
  t(srv.includes("caption_post_id: r.caption_post_id || null"), 'server: GET trial/chat-onboarding devuelve las 3 columnas');
  t(srv.includes('caption_attached'), 'server: dictar responde caption_attached');
  t(srv.includes('UPDATE posts SET caption = ? WHERE id = ? AND user_id = ?'), 'server: «Me gusta así» aplica el caption al posteo');
  t(srv.includes("UPDATE chat_messages SET caption_estado = 'gusta'"), 'server: «Me gusta así» marca caption_estado=gusta');
  t(srv.includes("UPDATE chat_messages SET caption_estado = 'cambiar'"), 'server: «Cambiar algo» marca caption_estado=cambiar');
  t(srv.includes('ya_respondido'), 'server: feedback idempotente (ya_respondido)');
  t(srv.includes('propuesta_no_encontrada'), 'server: propuesta inexistente → 404');
  t(srv.includes('post_no_encontrado'), 'server: posteo ajeno/inexistente → 404');
  t(srv.includes('en instagram se actualiza aparte'), 'server: publicado → avisa que IG se actualiza aparte');
  t(srv.includes('decime qué le cambio'), 'server: «Cambiar algo» pregunta qué cambiar');
  t(srv.includes('feedback_invalido'), 'server: feedback inválido → 400');
  t(!srv.includes("app.post('/api/posts/:id/video-feedback'"), 'server: sin código del lote video (sin lote video)');
  // DB.
  t(dbjs.includes('ALTER TABLE chat_messages ADD COLUMN caption_post_id INTEGER'), 'db: columna caption_post_id');
  t(dbjs.includes('ALTER TABLE chat_messages ADD COLUMN caption_text TEXT'), 'db: columna caption_text');
  t(dbjs.includes('ALTER TABLE chat_messages ADD COLUMN caption_estado TEXT'), 'db: columna caption_estado');
  // Las 3 ALTERs van DESPUÉS del cierre del db.exec que crea chat_messages.
  t(dbjs.indexOf('ADD COLUMN caption_post_id') > dbjs.indexOf('CREATE TABLE IF NOT EXISTS chat_messages'), 'db: ALTERs después del CREATE TABLE chat_messages');

  // ---------- 3. Cliente estático ----------
  t(app.includes('function chatMsgHtml(role, text, ts, id, reply, cap)'), 'app: chatMsgHtml con reply (5º, lote video) + cap (6º)');
  t(app.includes('pz-caption-propuesta'), 'app: rama caption-propuesta en chatMsgHtml');
  t(app.includes("onclick=\"pzCaptionFeedback(${capPostId}, ${capMsgId}, 'gusta', this)"), 'app: botón «Me gusta así» llama pzCaptionFeedback');
  t(app.includes("onclick=\"pzCaptionFeedback(${capPostId}, ${capMsgId}, 'cambiar', this)"), 'app: botón «Cambiar algo» llama pzCaptionFeedback');
  t(app.includes('Me gusta así'), 'app: etiqueta «Me gusta así»');
  t(app.includes('I like it like this'), 'app: etiqueta EN «I like it like this»');
  t(app.includes('function pzCaptionFeedback('), 'app: pzCaptionFeedback definida');
  t(app.includes("api.post(`/api/posts/${pid}/caption-feedback`"), 'app: pzCaptionFeedback POSTea a caption-feedback');
  t(app.includes('cap: (m.caption_post_id'), 'app: chatLoadHistory mapea cap');
  t(cnt(app, 'chatMsgHtml(m.role, m.text, m.ts, m.id, m.reply, m.cap)') === 2, 'app: los 2 renders del historial pasan m.reply + m.cap');
  t(app.includes("class=\"pz-caption-btns\""), 'app: la fila de botones tiene clase para reemplazarla al responder');

  // ---------- 4. VM: render de la rama caption ----------
  const chatFnSrc = extractFn(app, 'chatMsgHtml');
  t(chatFnSrc.length > 500, 'VM: chatMsgHtml extraída');
  const escFn = (s) => String(s ?? '').replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vmCtx = {
    chatStripCelebrate: (x) => String(x || ''),
    FP_MARKER_RE: /\[fp-never-match\]/,
    FOTO_MARKER_RE: /\[foto-never-match\]/,
    LC_MARKER_RE: /\[lc-never-match\]/,
    TRABAJO_MARKER_RE: /\[creando-imagen-never-match\]/,
    TRABAJO_FALLO_MARKER_RE: /\[trabajo-fallo-never-match\]/,
    chatStripFpMarker: (x) => x,
    chatStripLcMarker: (x) => x,
    chatStripTrabajoMarker: (x) => x,
    esc: escFn,
    linkifyEsc: escFn,
    chatHoraHtml: () => '',
    pzIc: () => '',
    gzT: (es) => es,
    ME: { lang: 'es' },
  };
  const render = vm.runInNewContext(chatFnSrc + '; chatMsgHtml;', vmCtx);
  const capPend = { post_id: 593, text: 'Así se mueve el color cuando posty lo postea.', estado: '', msg_id: 621 };
  const h1 = render('assistant', 'dale, acá va el nuevo caption para el video de hoy: Así se mueve el color cuando posty lo postea. ¿te gusta así o lo cambio?', 0, 621, undefined, capPend);
  t(h1.includes('Me gusta así'), 'VM: propuesta pendiente rinde «Me gusta así»');
  t(h1.includes('Cambiar algo'), 'VM: propuesta pendiente rinde «Cambiar algo»');
  t(h1.includes('pzCaptionFeedback(593, 621,'), 'VM: botones llaman pzCaptionFeedback(post, msg)');
  t(h1.includes('pz-caption-propuesta'), 'VM: la burbuja lleva la clase pz-caption-propuesta');
  t(!h1.includes('«Así se mueve el color cuando posty lo postea.»'), 'VM: caption ya en el texto no se duplica en cita');
  const h2 = render('assistant', 'dale, te propongo este caption:', 0, 622, undefined, { post_id: 594, text: 'Caption nuevo y profesional.', estado: '', msg_id: 622 });
  t(h2.includes('«Caption nuevo y profesional.»'), 'VM: caption fuera del texto se muestra en cita');
  const h3 = render('assistant', 'dale, acá va el nuevo caption: X', 0, 623, undefined, { post_id: 593, text: 'X', estado: 'gusta', msg_id: 623 });
  t(!h3.includes('pzCaptionFeedback'), 'VM: propuesta aceptada no rinde botones');
  t(h3.includes('Aplicado'), 'VM: propuesta aceptada muestra «Aplicado»');
  const h4 = render('assistant', 'dale, acá va el nuevo caption: X', 0, 624, undefined, { post_id: 593, text: 'X', estado: 'cambiar', msg_id: 624 });
  t(!h4.includes('pzCaptionFeedback'), 'VM: propuesta con cambio pedido no rinde botones');
  t(h4.includes('Pediste un cambio'), 'VM: propuesta con cambio pedido muestra el estado');
  const h5 = render('assistant', 'hola, ¿en qué te ayudo?', 0, 625, undefined, null);
  t(!h5.includes('pzCaptionFeedback'), 'VM: mensaje sin propuesta no rinde botones');
  const h6 = render('user', 'quiero cambiar el texto', 0, 626, undefined, { post_id: 593, text: 'X', estado: '', msg_id: 626 });
  t(!h6.includes('pzCaptionFeedback'), 'VM: mensaje del usuario no rinde botones');
  // EN.
  vmCtx.ME = { lang: 'en' };
  const renderEn = vm.runInNewContext(chatFnSrc + '; chatMsgHtml;', vmCtx);
  const h7 = renderEn('assistant', 'here is the new caption: X', 0, 627, undefined, { post_id: 593, text: 'X', estado: '', msg_id: 627 });
  t(h7.includes('I like it like this') && h7.includes('Change something'), 'VM: botones en EN');

  // ---------- 5. Boot real: flujo completo ----------
  const { spawn } = require('child_process');
  const BOOT = fs.mkdtempSync(path.join(SCRATCH, '.tmp-boot-'));
  const BOOT_DATA = path.join(BOOT, 'data');
  fs.mkdirSync(BOOT_DATA, { recursive: true });
  fs.cpSync(TREE, BOOT, { recursive: true });
  const PORT = 34740;
  const ADMIN_TOKEN = 'capbtn-test-token';
  const envBoot = Object.assign({}, process.env, {
    DATA_DIR: BOOT_DATA, PORT: String(PORT), ADMIN_TOKEN,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    TZ: 'America/Argentina/Buenos_Aires',
  });
  const child = spawn('node', ['server.js'], { cwd: BOOT, env: envBoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let version = null;
  for (let i = 0; i < 200 && !version; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
      if (r.ok) version = await r.json();
    } catch (e) { /* aún no levanta */ }
    if (!version) await sleep(500);
  }
  t(version && version.build === '20261105-v891', 'boot: /api/version = v891', JSON.stringify(version));
  const bootOk = !!version;
  if (bootOk) {
    const j = async (r) => { try { return await r.json(); } catch (e) { return {}; } };
    const reg = async (email) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'test123456', terms_accepted: true }),
      });
      const body = await j(r);
      return { ok: r.ok && body.ok === true, cookie: (r.headers.get('set-cookie') || '').split(';')[0], body };
    };
    const regA = await reg('capbtn-a@postyhacetodo.com');
    t(regA.ok && regA.cookie.length > 0, 'boot: registro usuario A');
    const regB = await reg('capbtn-b@postyhacetodo.com');
    t(regB.ok && regB.cookie.length > 0, 'boot: registro usuario B');
    // Seed directo en la DB del boot (el servidor ya levantó: tablas creadas).
    const db = new DatabaseSync(path.join(BOOT_DATA, 'posta.db'));
    const uidA = db.prepare('SELECT id FROM users WHERE email = ?').get('capbtn-a@postyhacetodo.com').id;
    const uidB = db.prepare('SELECT id FROM users WHERE email = ?').get('capbtn-b@postyhacetodo.com').id;
    t(Number(uidA) > 0 && Number(uidB) > 0 && uidA !== uidB, 'boot: ids de A y B distintos');
    const postSched = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, scheduled_at, media_type) VALUES (?, '/media/capbtn.jpg', 'caption viejo programado', 'scheduled', '2026-11-12 00:00:00', 'image')`).run(uidA).lastInsertRowid;
    const postPub = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, scheduled_at, published_at, media_type) VALUES (?, '/media/capbtn-pub.jpg', 'caption viejo publicado', 'published', '2026-11-11 00:00:00', '2026-11-11 00:00:12', 'image')`).run(uidA).lastInsertRowid;
    const postB = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type) VALUES (?, '/media/capbtn-b.jpg', 'caption de B', 'draft', 'image')`).run(uidB).lastInsertRowid;
    t(Number(postSched) > 0 && Number(postPub) > 0, 'boot: posteos semilla (programado + publicado)');
    const seedSup = () => db.prepare(`INSERT INTO supervision_pendientes (user_id, texto, estado) VALUES (?, 'quiero cambiar el texto', 'pendiente')`).run(uidA).lastInsertRowid;
    const chatOf = async (cookie) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/chat`, { headers: { cookie } });
      return j(r);
    };
    const dictar = async (userId, texto, capPost, capText) => {
      const body = { user_id: userId, texto };
      if (capPost) body.caption_post_id = capPost;
      if (capText) body.caption_text = capText;
      const r = await fetch(`http://127.0.0.1:${PORT}/api/admin/supervision/dictar?token=${ADMIN_TOKEN}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: r.status, body: await j(r) };
    };
    const fb = async (cookie, postId, payload) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/posts/${postId}/caption-feedback`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(payload),
      });
      return { status: r.status, body: await j(r) };
    };
    const postCap = (id) => db.prepare('SELECT caption FROM posts WHERE id = ?').get(id).caption;
    const msgRow = (id) => db.prepare('SELECT caption_post_id, caption_text, caption_estado FROM chat_messages WHERE id = ?').get(id);
    const chatCount = () => db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?').get(uidA).n;

    // 5a. Dictar con propuesta (posteo programado).
    seedSup();
    const d1 = await dictar(uidA, 'dale, acá va el nuevo caption para el video de hoy: Caption nuevo y profesional. ¿te gusta así o lo cambio?', postSched, 'Caption nuevo y profesional.');
    t(d1.status === 200 && d1.body.ok === true && d1.body.caption_attached === true, 'flujo: dictar con propuesta adjunta (caption_attached)', d1.status + ' ' + JSON.stringify(d1.body));
    const msgId1 = d1.body.reply_msg_id;
    t(Number(msgId1) > 0, 'flujo: dictar devuelve reply_msg_id');
    const m1 = msgRow(msgId1);
    t(m1 && Number(m1.caption_post_id) === Number(postSched) && m1.caption_text === 'Caption nuevo y profesional.' && m1.caption_estado === '', 'flujo: la propuesta quedó persistida en el mensaje');
    // 5b. El chat la devuelve (persistencia = la propuesta sobrevive a recargar).
    const c1 = await chatOf(regA.cookie);
    const prop1 = (c1.messages || []).find((m) => Number(m.id) === Number(msgId1));
    t(!!prop1 && Number(prop1.caption_post_id) === Number(postSched) && prop1.caption_text === 'Caption nuevo y profesional.' && prop1.caption_estado === '', 'flujo: GET /api/ideas/chat devuelve la propuesta pendiente');
    // 5c. «Me gusta así» aplica el caption al posteo programado.
    const n0 = chatCount();
    const f1 = await fb(regA.cookie, postSched, { feedback: 'gusta', msg_id: msgId1 });
    t(f1.status === 200 && f1.body.ok === true && f1.body.feedback === 'gusta' && f1.body.publicado === false, 'flujo: «Me gusta así» OK (programado, no publicado)', f1.status + ' ' + JSON.stringify(f1.body));
    t(Array.isArray(f1.body.messages) && f1.body.messages.length === 2, 'flujo: «Me gusta así» devuelve 2 mensajes (usuario + confirmación)');
    t(postCap(postSched) === 'Caption nuevo y profesional.', 'flujo: el caption del posteo programado es el propuesto');
    t(msgRow(msgId1).caption_estado === 'gusta', 'flujo: caption_estado=gusta tras aceptar');
    // 5d. Idempotencia: segundo «Me gusta así» no re-aplica ni duplica.
    const f1b = await fb(regA.cookie, postSched, { feedback: 'gusta', msg_id: msgId1 });
    t(f1b.status === 200 && f1b.body.ya_respondido === true && f1b.body.feedback === 'gusta', 'flujo: segundo «Me gusta así» → ya_respondido');
    t(chatCount() === n0 + 2, 'flujo: sin mensajes duplicados tras el segundo toque', 'antes=' + n0 + ' ahora=' + chatCount());
    t(postCap(postSched) === 'Caption nuevo y profesional.', 'flujo: el caption no cambió con el segundo toque');
    // 5e. Persistencia tras recargar: el chat muestra la propuesta respondida.
    const c2 = await chatOf(regA.cookie);
    const prop1b = (c2.messages || []).find((m) => Number(m.id) === Number(msgId1));
    t(!!prop1b && prop1b.caption_estado === 'gusta', 'flujo: tras recargar, la propuesta sigue con caption_estado=gusta');
    // 5f. «Cambiar algo»: no toca el caption y pregunta qué cambiar.
    seedSup();
    const d2 = await dictar(uidA, 'dale, te propongo otro caption: Segunda propuesta distinta. ¿te gusta así o lo cambio?', postSched, 'Segunda propuesta distinta.');
    t(d2.status === 200 && d2.body.caption_attached === true, 'flujo: segunda propuesta dictada con botones');
    const msgId2 = d2.body.reply_msg_id;
    const f2 = await fb(regA.cookie, postSched, { feedback: 'cambiar', msg_id: msgId2 });
    t(f2.status === 200 && f2.body.ok === true && f2.body.feedback === 'cambiar', 'flujo: «Cambiar algo» OK');
    t(postCap(postSched) === 'Caption nuevo y profesional.', 'flujo: «Cambiar algo» NO cambia el caption');
    t(msgRow(msgId2).caption_estado === 'cambiar', 'flujo: caption_estado=cambiar tras pedir cambio');
    t(Array.isArray(f2.body.messages) && f2.body.messages.length === 2 && String(f2.body.messages[1].text || '').includes('decime qué le cambio'), 'flujo: «Cambiar algo» pregunta qué cambiar');
    // 5g. Posteo publicado: actualiza la base y avisa que IG va aparte.
    seedSup();
    const d3 = await dictar(uidA, 'dale, acá va el nuevo caption: Caption pro para el publicado. ¿te gusta así o lo cambio?', postPub, 'Caption pro para el publicado.');
    t(d3.status === 200 && d3.body.caption_attached === true, 'flujo: propuesta para posteo publicado');
    const f3 = await fb(regA.cookie, postPub, { feedback: 'gusta', msg_id: d3.body.reply_msg_id });
    t(f3.status === 200 && f3.body.publicado === true, 'flujo: «Me gusta así» en publicado marca publicado=true');
    t(postCap(postPub) === 'Caption pro para el publicado.', 'flujo: el caption del publicado se actualiza en la base');
    t(Array.isArray(f3.body.messages) && String(f3.body.messages[1].text || '').includes('instagram se actualiza aparte'), 'flujo: en publicado, la confirmación avisa que IG va aparte');
    // 5h. Ownership y errores.
    const fB = await fb(regB.cookie, postSched, { feedback: 'gusta', msg_id: msgId1 });
    t(fB.status === 404, 'flujo: otro usuario no puede votar el posteo ajeno (404)', fB.status);
    const fBad = await fb(regA.cookie, postSched, { feedback: 'otro', msg_id: msgId1 });
    t(fBad.status === 400, 'flujo: feedback inválido → 400', fBad.status);
    const fNoMsg = await fb(regA.cookie, postSched, { feedback: 'gusta' });
    t(fNoMsg.status === 400, 'flujo: sin msg_id → 400', fNoMsg.status);
    const fNoPost = await fb(regA.cookie, 999999, { feedback: 'gusta', msg_id: msgId1 });
    t(fNoPost.status === 404, 'flujo: posteo inexistente → 404', fNoPost.status);
    // Mensaje sin propuesta → 404 propuesta_no_encontrada.
    const plainId = db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', 'hola, ¿en qué te ayudo?')`).run(uidA).lastInsertRowid;
    const fPlain = await fb(regA.cookie, postSched, { feedback: 'gusta', msg_id: plainId });
    t(fPlain.status === 404 && fPlain.body.error === 'propuesta_no_encontrada', 'flujo: mensaje sin propuesta → 404 propuesta_no_encontrada', fPlain.status + ' ' + JSON.stringify(fPlain.body));
    // Dictar con posteo ajeno → el mensaje sale pero sin propuesta.
    seedSup();
    const dB = await dictar(uidA, 'te propongo este caption para el posteo de otro.', postB, 'Caption ajeno.');
    t(dB.status === 200 && dB.body.ok === true && dB.body.caption_attached === false, 'flujo: dictar con posteo ajeno no adjunta la propuesta');
    // Endpoint registrado sin auth.
    const noAuth = await fetch(`http://127.0.0.1:${PORT}/api/posts/${postSched}/caption-feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    t(noAuth.status === 401, 'flujo: caption-feedback sin auth → 401', noAuth.status);
    try { db.close(); } catch (e) {}
  } else {
    t(false, 'boot: el servidor no levantó', bootLog.slice(0, 500));
  }
  const bootPid = child.pid;
  try { process.kill(bootPid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let stillAlive = true;
  try { process.kill(bootPid, 0); } catch (e) { stillAlive = false; }
  t(!stillAlive, 'boot: el servidor murió con SIGTERM');
  try { fs.rmSync(BOOT, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

  console.log(`\ntest-lote-caption-botones: ${ok} ok, ${bad} fallos${bad ? ' :: ' + FAILURES.join(' | ') : ''}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FALLO SUITE:', e); process.exit(1); });
