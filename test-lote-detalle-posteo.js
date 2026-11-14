'use strict';
/* test-lote-detalle-posteo.js — LOTE DETALLE-POSTEO (13/11, pedido de
 * Valentino): «Rehacer» de primer nivel + «Editar» el caption EN LA
 * MISMA PANTALLA, sobre la fila del héroe de Inicio
 * (Editar · Frenar · Eliminar de pzHoyCardHTML).
 *
 * Servidor (boot real, generación stubbeada por fetch como
 * test-feed6a-server: costo IA cero):
 *  · Rehacer de un PROGRAMADO (el endpoint que llama el botón vía
 *    hfRedoPost: POST /api/drafts/:id/photo-restyle): cambia SOLO la
 *    imagen; caption, hashtags, día y hora y estado intactos;
 *    contador redo_left 3 → 2. Al límite (0): redo_exhausted SIN
 *    generar y sin tocar la imagen.
 *  · Editar un PROGRAMADO por la vía nueva de usuario
 *    (POST /api/posts/:id/edit-caption, espejo del admin v965): SOLO
 *    cambia el caption (diff de fila completa), idempotente
 *    (ya_correcto), un programado en revisión sigue en revisión,
 *    guardas es_borrador / ya_publicado / falta caption / 404 de otro
 *    dueño / 402 de invitado (guestBackstop).
 *  · Editar un BORRADOR con la semántica de revisión vigente
 *    (PATCH action:'save-draft'): cambia el caption, sigue borrador.
 *
 * Cliente (vm, como test-lote-botones-inicio):
 *  · Render real de pzHoyCardHTML (héroe) con el DISEÑO APROBADO
 *    (13/11 13:17, mock mock-detalle-v1): la píldora de estado de UNA
 *    línea derivada del estado real («Agendado · hoy 19:00 — también
 *    sale como historia»), las CUATRO tarjetas blandas en orden
 *    Rehacer · Editar · Frenar · Eliminar con su gradiente (azul ·
 *    azul · amarillo · coral) y su data-* enganchado, sin el cartel
 *    verde de dos renglones ni la fila vieja. ADDENDUM V4 (13/11
 *    14:05, mock-detalle-v4): «Ver el posteo completo» NO va ni como
 *    botón ni como link — la FOTO del héroe (data-pz-hoy-detalle)
 *    abre la vista completa y el lugar bajo las acciones lo ocupa
 *    la TIRA DE VOZ (en el harness, stub pzVozStripHTML).
 *  · Rehacer habilitado con rehaces, deshabilitado a 0 con la línea
 *    «Ya usaste los 3 rehaces», ausente en video; en publicado,
 *    «Editar» conserva su camino al chat y no hay editor inline.
 *  · pzHoyEditarGuardar: programado → /edit-caption; borrador →
 *    save-draft; error del servidor → se lee en el editor y no cierra.
 *  · pzHoyRehacer: llama a hfRedoPost con el id y restaura el botón.
 *  · M78: las 7 funciones llamadas desde la fila/el editor existen.
 *
 * Uso: node test-lote-detalle-posteo.js   (puerto 18783)
 *
 * ADAPTACIÓN DEL PREPARADOR (aterrizaje v1021 sobre HEAD vivo v1020;
 * la suite nació contra v1007): estampas de la era fuera (la sección
 * servidor no pineaba BUILD/?v= y no se le agregan); C1 orden: el
 * eslabón final ya no es el link (ADDENDUM V4) sino la tira de voz,
 * con pins nuevos de foto-detalle y tira única; C11 re-pineado a la
 * composición con APROBAR-AUTO (v1010): approval='auto' ES pendiente
 * (sin píldora, con Aprobar) — la píldora «Sale solo» de la era del
 * lote queda supersedida por esa composición y la honestidad se
 * pinea como ausencia de píldora + ausencia de «Aprobado»/«Agendado»;
 * C11b NUEVO: la píldora compuesta con la pieza 7 de ILUSTRADA
 * (v1020) — sin Instagram conectado no promete la historia; C7: el
 * segmento de tarjetas se corta desde 'const pillEstado' (en la base
 * viva 'const redoLeft' colisiona con redoLeftD de apv y el corte
 * nacía antes del héroe) y el pin del CSS del link pasa a ser de
 * AUSENCIA de la regla (ADDENDUM V4). El resto, byte-idéntico.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-detalle-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18783';
process.env.BASE_URL = 'http://127.0.0.1:18783';
process.env.OPENAI_API_KEY = 'sk-stub-detalle';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- PNG sólido mínimo (mismo helper que test-feed6a-server) ---
function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function solidPng(w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3); raw[off] = 0;
    for (let x = 0; x < w; x++) { raw[off + 1 + x * 3] = rgb[0]; raw[off + 2 + x * 3] = rgb[1]; raw[off + 3 + x * 3] = rgb[2]; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}

// --- Stub de OpenAI: imágenes + QA del concept-shot (de feed6a) ---
const state = { genCalls: 0 };
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.includes('api.openai.com')) return realFetch(url, opts);
  const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };
  const chat = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }], usage }), text: async () => JSON.stringify(obj) });
  if (u.includes('/images/')) {
    state.genCalls++;
    const b64 = solidPng(1024, 1280, [44, 120, 220]).toString('base64');
    return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: b64 }] }), text: async () => '' };
  }
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  const msgs = body.messages || [];
  const sys = String((msgs[0] && msgs[0].content) || '');
  if (sys.includes('control de FIDELIDAD')) return chat({ fidelidad_ok: true, detalle: 'misma pieza' });
  if (sys.includes('FRENA EL SCROLL')) return chat({ single_subject: true, not_cluttered: true, readable_small: true, thumb_hook: true, detalle: 'ok' });
  if (sys.includes('control de calidad de una agencia')) return chat({ brand_ok: true, texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, headline_complete: true, headline_clear: true, anatomia_ok: true, contraste_ok: true, elementos_ok: true, detalle: 'pieza correcta' });
  if (sys.includes('guardián de marca')) return chat({ paleta_ok: true, logo_ok: true, linea_ok: true, detalle: 'ok' });
  if (sys.includes('DESLIZA')) return chat({ cover: 'El truco', slides: [{ title: 'Uno', text: 'Texto uno.' }, { title: 'Dos', text: 'Texto dos.' }, { title: 'Tres', text: 'Texto tres.' }] });
  return chat({ caption: 'Caption de prueba.', overlay: 'Prueba', hashtags: '#test' });
};

function makeCaller() {
  const jar = { cookie: '' };
  const call = async (method, p, body) => {
    const r = await realFetch('http://127.0.0.1:18783' + p, {
      method, headers: { 'Content-Type': 'application/json', ...(jar.cookie ? { Cookie: jar.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) jar.cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, json: j };
  };
  return call;
}
const call = makeCaller();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const occ = (txt, re) => (txt.match(re) || []).length;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 220) : ''); }
};

(async () => {
  const dbmod = require('./db');
  const db = dbmod.db || dbmod;
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18783/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }

  // ---------- Servidor ----------
  const reg = await call('POST', '/api/auth/register', { email: 'detalle@x.example', password: 'secreto1' });
  ok('S1: registro con sesión', reg.status === 200, reg.status);
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('detalle@x.example').id;
  db.prepare("UPDATE users SET plan_status = 'active', plan = 'total' WHERE id = ?").run(uid);
  const writeMedia = (name, rgb) => { fs.writeFileSync(path.join(MEDIA_DIR, name), solidPng(1024, 1280, rgb)); return '/media/' + name; };
  const WHEN = '2026-12-01T22:00:00.000Z';
  const imgS = writeMedia('det-s.png', [200, 60, 60]);
  const postS = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, scheduled_at, approval)
    VALUES (?,?,?,?,'scheduled','image','foto',?,'approved')`).run(uid, imgS, 'Caption original', '#orig', WHEN).lastInsertRowid;
  const rowOf = (id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);

  // — Rehacer un programado: solo cambia la imagen; contador 3 → 2 —
  const beforeRedo = rowOf(postS);
  ok('S2: el programado nace con redo_left = 3', beforeRedo.redo_left === 3, JSON.stringify(beforeRedo.redo_left));
  const rs = await call('POST', `/api/drafts/${postS}/photo-restyle`, {});
  const afterRedo = rowOf(postS);
  ok('S3: Rehacer (photo-restyle) responde ok', rs.json && rs.json.ok === true, JSON.stringify(rs.json).slice(0, 180));
  ok('S3: la imagen cambió y es la que devolvió el motor', afterRedo.image_path !== beforeRedo.image_path && rs.json.path === afterRedo.image_path, afterRedo.image_path);
  ok('S3: caption, hashtags, día/hora y estado INTACTOS',
    afterRedo.caption === 'Caption original' && afterRedo.hashtags === '#orig' && afterRedo.scheduled_at === WHEN && afterRedo.status === 'scheduled',
    JSON.stringify({ c: afterRedo.caption, h: afterRedo.hashtags, s: afterRedo.scheduled_at, st: afterRedo.status }));
  ok('S3: contador 3 → 2', afterRedo.redo_left === 2, String(afterRedo.redo_left));

  // — Al límite: no rehace y lo dice, sin generar —
  db.prepare('UPDATE posts SET redo_left = 0 WHERE id = ?').run(postS);
  const callsAtZero = state.genCalls;
  const rsBlocked = await call('POST', `/api/drafts/${postS}/photo-restyle`, {});
  const afterBlocked = rowOf(postS);
  ok('S4: a 0 rehaces, photo-restyle responde redo_exhausted', rsBlocked.json && rsBlocked.json.error === 'redo_exhausted', JSON.stringify(rsBlocked.json).slice(0, 160));
  ok('S4: a 0 no se generó nada ni cambió la imagen', state.genCalls === callsAtZero && afterBlocked.image_path === afterRedo.image_path && afterBlocked.redo_left === 0);

  // — Editar un programado por la vía nueva: SOLO el caption —
  const beforeEdit = rowOf(postS);
  const ed = await call('POST', `/api/posts/${postS}/edit-caption`, { caption: 'Caption nuevo' });
  const afterEdit = rowOf(postS);
  ok('S5: edit-caption responde ok con cambiado:true', ed.status === 200 && ed.json && ed.json.ok === true && ed.json.cambiado === true, ed.status + ' ' + JSON.stringify(ed.json).slice(0, 160));
  const diffKeys = Object.keys(beforeEdit).filter((k) => String(beforeEdit[k]) !== String(afterEdit[k]));
  ok('S5: la ÚNICA columna que cambió es caption', diffKeys.length === 1 && diffKeys[0] === 'caption', 'diff: ' + diffKeys.join(','));
  ok('S5: la respuesta confirma el mismo horario', ed.json.scheduled_at === WHEN && afterEdit.scheduled_at === WHEN);
  const ed2 = await call('POST', `/api/posts/${postS}/edit-caption`, { caption: 'Caption nuevo' });
  ok('S6: idempotente: mismo caption → ya_correcto:true, cambiado:false', ed2.json && ed2.json.ok === true && ed2.json.ya_correcto === true && ed2.json.cambiado === false, JSON.stringify(ed2.json).slice(0, 140));

  // — Programado en revisión: se edita y SIGUE en revisión (espejo admin) —
  db.prepare('UPDATE posts SET needs_review = 1 WHERE id = ?').run(postS);
  const ed3 = await call('POST', `/api/posts/${postS}/edit-caption`, { caption: 'Caption en revisión' });
  const afterRev = rowOf(postS);
  ok('S7: programado con needs_review=1: edita y la marca queda', ed3.json && ed3.json.ok === true && afterRev.caption === 'Caption en revisión' && Number(afterRev.needs_review) === 1, JSON.stringify({ ok: ed3.json && ed3.json.ok, nr: afterRev.needs_review }));
  db.prepare('UPDATE posts SET needs_review = 0 WHERE id = ?').run(postS);

  // — Guardas —
  const imgD = writeMedia('det-d.png', [60, 200, 60]);
  const postD = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo)
    VALUES (?,?,?,?,'draft','image','foto')`).run(uid, imgD, 'Borrador original', '#orig').lastInsertRowid;
  const edD = await call('POST', `/api/posts/${postD}/edit-caption`, { caption: 'X' });
  ok('S8: borrador por edit-caption → 400 es_borrador, sin tocar', edD.status === 400 && edD.json && edD.json.motivo === 'es_borrador' && rowOf(postD).caption === 'Borrador original', edD.status + ' ' + JSON.stringify(edD.json).slice(0, 140));
  const postP = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo)
    VALUES (?,?,?,?,'published','image','foto')`).run(uid, imgD, 'Ya salió', '#orig').lastInsertRowid;
  const edP = await call('POST', `/api/posts/${postP}/edit-caption`, { caption: 'X' });
  ok('S9: publicado por edit-caption → 400 ya_publicado', edP.status === 400 && edP.json && edP.json.motivo === 'ya_publicado', edP.status + ' ' + JSON.stringify(edP.json).slice(0, 140));
  const edEmpty = await call('POST', `/api/posts/${postS}/edit-caption`, { caption: '' });
  ok('S10: caption vacío → 400 falta caption', edEmpty.status === 400 && edEmpty.json && edEmpty.json.error === 'falta caption', edEmpty.status + ' ' + JSON.stringify(edEmpty.json).slice(0, 120));
  const edMissing = await call('POST', '/api/posts/999999/edit-caption', { caption: 'X' });
  ok('S10: posteo inexistente → 404', edMissing.status === 404, String(edMissing.status));
  const call2 = makeCaller();
  await call2('POST', '/api/auth/register', { email: 'otro@x.example', password: 'secreto1' });
  const edOther = await call2('POST', `/api/posts/${postS}/edit-caption`, { caption: 'Robado' });
  ok('S10: posteo de OTRO dueño → 404 y caption intacto', edOther.status === 404 && rowOf(postS).caption === 'Caption en revisión', edOther.status + ' ' + rowOf(postS).caption);
  const call3 = makeCaller();
  await call3('POST', '/api/auth/register', { email: 'guest@x.example', password: 'secreto1' });
  const uidG = db.prepare('SELECT id FROM users WHERE email = ?').get('guest@x.example').id;
  db.prepare('UPDATE users SET is_guest = 1 WHERE id = ?').run(uidG);
  const postG = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, scheduled_at)
    VALUES (?,?,?,?,'scheduled','image','foto',?)`).run(uidG, imgD, 'Del invitado', '#orig', WHEN).lastInsertRowid;
  const edG = await call3('POST', `/api/posts/${postG}/edit-caption`, { caption: 'X' });
  ok('S11: invitado → 402 guest_account_required (mismo corte que el PATCH)', edG.status === 402 && edG.json && edG.json.guest_account_required === true, edG.status + ' ' + JSON.stringify(edG.json).slice(0, 120));

  // — Editar un borrador: la edición en revisión vigente —
  const sv = await call('PATCH', `/api/posts/${postD}`, { action: 'save-draft', caption: 'Borrador editado' });
  const afterD = rowOf(postD);
  ok('S12: save-draft responde ok y guarda el caption', sv.status === 200 && afterD.caption === 'Borrador editado', sv.status + ' ' + JSON.stringify(sv.json).slice(0, 120));
  ok('S12: sigue borrador y sin horario nuevo', afterD.status === 'draft' && !afterD.scheduled_at, afterD.status + ' ' + String(afterD.scheduled_at));

  // ---------- Cliente (vm) ----------
  const APP = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
  const extractFn = (src, startMarker, endMarker) => {
    const a = src.indexOf(startMarker);
    if (a < 0) throw new Error('no start: ' + startMarker);
    const b = src.indexOf(endMarker, a);
    if (b < 0) throw new Error('no end: ' + endMarker);
    return src.slice(a, b);
  };
  const escFn = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const sandbox = {
    esc: escFn,
    mv: (x) => x,
    pzIc: (n) => `<i data-ic="${n}"></i>`,
    pzHoyPillSalida: () => '', pzHoyCuandoCorto: () => '', pzHoyCuentaSaleTxt: () => '',
    pzVozStripHTML: (p) => '<section class="pz-voz" data-pz-voz-stub="' + (p && p.id) + '"></section>',
    pcParseDate: (iso) => new Date(String(iso || '').replace(' ', 'T')),
    pzWhenRelDay: (d, tz, en) => (en ? 'today' : 'hoy'),
    pzHoyHoraCorta: () => '19:00',
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFn(APP, 'function hfRedoLeft(p) {', '// Línea del contador'), sandbox);
  vm.runInContext(extractFn(APP, 'function hfRedoLineHTML(p, en) {', '// (Tanda feed 6A · ítem 2)'), sandbox);
  vm.runInContext(extractFn(APP, 'function pzHoyCardHTML(p, o) {', '// (LOTE A · ítem 2)'), sandbox);
  const pzHoyCardHTML = vm.runInContext('pzHoyCardHTML', sandbox);
  const post = (over) => Object.assign({ id: 42, status: 'scheduled', approval: 'approved', media_type: 'image', image_path: '/media/x.jpg', caption: 'Tesora que todos piden', hashtags: '#t', scheduled_at: WHEN, redo_left: 2 }, over);

  const hSched = pzHoyCardHTML(post({}), { hero: true, en: false });
  ok('C1: píldora de UNA línea con el texto del mock para el agendado',
    hSched.includes('pz-hoy-pill-estado') && hSched.includes('Agendado · hoy 19:00 — también sale como historia'),
    hSched.slice(hSched.indexOf('pz-hoy-pill'), hSched.indexOf('pz-hoy-pill') + 220));
  ok('C1: sin el cartel verde de dos renglones ni la fila vieja en el héroe',
    !hSched.includes('pz-hoy-ok') && !hSched.includes('pz-hoy-tres') && !hSched.includes('Posty también lo sube como historia.'));
  ok('C1: las CUATRO tarjetas en orden Rehacer · Editar · Frenar · Eliminar, con su data-*',
    hSched.indexOf('data-pz-hoy-rehacer="42"') > -1 &&
    hSched.indexOf('data-pz-hoy-rehacer="42"') < hSched.indexOf('data-pz-hoy-editar="42"') &&
    hSched.indexOf('data-pz-hoy-editar="42"') < hSched.indexOf('data-pz-hoy-frenar="42"') &&
    hSched.indexOf('data-pz-hoy-frenar="42"') < hSched.indexOf('data-pz-hoy-eliminar="42"'),
    hSched.slice(hSched.indexOf('pz-hoy-acts'), hSched.indexOf('pz-hoy-acts') + 700));
  ok('C1: gradientes del mock: azul ×2 (Rehacer/Editar), amarillo (Frenar), coral (Eliminar)',
    occ(hSched, /pz-hoy-act-azul/g) === 2 && occ(hSched, /pz-hoy-act-amarillo/g) === 1 && occ(hSched, /pz-hoy-act-coral/g) === 1);
  ok('C1: Rehacer habilitado con rehaces que quedan',
    hSched.includes('data-pz-hoy-rehacer="42"') && !hSched.includes('data-pz-hoy-rehacer="42" disabled'));
  ok('C1: la línea del contador dice «Te quedan 2 de 3 rehaces» bajo las tarjetas',
    hSched.includes('Te quedan 2 de 3 rehaces') && hSched.indexOf('pz-hoy-acts') < hSched.indexOf('pz-hoy-redo-line'));
  ok('C1: editor inline con el caption completo y el estado scheduled',
    hSched.includes('data-pz-hoy-editbox="42"') && hSched.includes('data-pz-hoy-edit-status="scheduled"') &&
    hSched.includes('>Tesora que todos piden</textarea>') && hSched.includes('data-pz-hoy-edit-save="42"') && hSched.includes('data-pz-hoy-edit-cancel="42"'));
  ok('C1: orden de la zona: caption → píldora → tarjetas → tira de voz al final (ADDENDUM V4: sin link)',
    hSched.indexOf('pz-hoy-hero-caption') < hSched.indexOf('pz-hoy-pill-estado') &&
    hSched.indexOf('pz-hoy-pill-estado') < hSched.indexOf('pz-hoy-acts') &&
    hSched.indexOf('pz-hoy-acts') < hSched.indexOf('data-pz-voz-stub') &&
    !hSched.includes('Ver el posteo completo') && !hSched.includes('pz-hoy-hero-link'));
  ok('C1: la FOTO del héroe abre la vista completa (data-pz-hoy-detalle en la media — ADDENDUM V4)',
    hSched.includes('class="pz-hoy-hero-media" data-pz-hoy-detalle="42"'));
  ok('C1: la tira de voz aparece UNA sola vez en la tarjeta (sin duplicarla)',
    occ(hSched, /data-pz-voz-stub/g) === 1);
  const hZero = pzHoyCardHTML(post({ redo_left: 0 }), { hero: true, en: false });
  ok('C2: a 0 rehaces la tarjeta nace DESHABILITADA y la línea lo dice en el lugar',
    hZero.includes('data-pz-hoy-rehacer="42" disabled') && hZero.includes('Ya usaste los 3 rehaces de este posteo'));
  const hVid = pzHoyCardHTML(post({ media_type: 'video', image_path: '/media/v.mp4', cover_path: '/media/v.jpg' }), { hero: true, en: false });
  ok('C3: un reel NO ofrece Rehacer (su flujo es otro)', !hVid.includes('data-pz-hoy-rehacer') && !hVid.includes('pz-hoy-redo-line'));
  const hDraft = pzHoyCardHTML(post({ status: 'draft', approval: 'pending' }), { hero: true, en: false });
  ok('C4: borrador: editor con estado draft + tarjetas Rehacer/Editar/Eliminar, SIN Frenar y SIN píldora',
    hDraft.includes('data-pz-hoy-edit-status="draft"') && hDraft.includes('data-pz-hoy-rehacer="42"') && hDraft.includes('data-pz-hoy-eliminar="42"') &&
    !hDraft.includes('data-pz-hoy-frenar') && !hDraft.includes('pz-hoy-pill-estado'));
  const hPub = pzHoyCardHTML(post({ status: 'published' }), { hero: true, en: false });
  ok('C5: publicado: «Editar» conserva el camino al chat (data-pz-hoy-cambiar), SIN editor inline ni Rehacer/Frenar/Eliminar ni píldora',
    hPub.includes('data-pz-hoy-cambiar="42"') && !hPub.includes('data-pz-hoy-editbox') && !hPub.includes('data-pz-hoy-rehacer') &&
    !hPub.includes('data-pz-hoy-frenar') && !hPub.includes('data-pz-hoy-eliminar') && !hPub.includes('pz-hoy-pill-estado'));
  const hNoCap = pzHoyCardHTML(post({ caption: '' }), { hero: true, en: false });
  ok('C13: sin caption, las tarjetas y el editor rinden igual (el comportamiento que pineaba B8 de v914)',
    hNoCap.includes('data-pz-hoy-rehacer="42"') && hNoCap.includes('data-pz-hoy-frenar="42"') && hNoCap.includes('data-pz-hoy-editbox="42"'));
  const hAuto = pzHoyCardHTML(post({ approval: 'auto' }), { hero: true, en: false });
  ok('C11: autopiloto (approval=auto) ES pendiente con APROBAR-AUTO (v1010): SIN píldora, con «Dale, publicalo», jamás «Aprobado» ni «Agendado»',
    !hAuto.includes('pz-hoy-pill-estado') && hAuto.includes('data-pz-hoy-aprobar="42"') && !hAuto.includes('Aprobado') && !hAuto.includes('Agendado'),
    hAuto.slice(0, 400));
  sandbox.PROFILE = { ig_connected: 0 };
  const hNoIg = pzHoyCardHTML(post({}), { hero: true, en: false });
  ok('C11b: sin Instagram conectado, la píldora NO promete la historia: «sale cuando conectes tu Instagram» (pieza 7 de ILUSTRADA compuesta)',
    hNoIg.includes('Agendado · hoy 19:00 — sale cuando conectes tu Instagram') && !hNoIg.includes('también sale como historia'),
    hNoIg.slice(hNoIg.indexOf('pz-hoy-pill'), hNoIg.indexOf('pz-hoy-pill') + 220));
  delete sandbox.PROFILE;
  const hPend = pzHoyCardHTML(post({ approval: 'pending' }), { hero: true, en: false });
  ok('C12: programado pendiente: SIN píldora (su estado lo lleva «Dale, publicalo») y con Aprobar',
    !hPend.includes('pz-hoy-pill-estado') && hPend.includes('data-pz-hoy-aprobar="42"'));
  const hEn = pzHoyCardHTML(post({}), { hero: true, en: true });
  ok('C6: EN: píldora «Scheduled · today 19:00 — also shared as a story»',
    hEn.includes('Scheduled · today 19:00 — also shared as a story'));
  ok('C6: EN tarjetas Redo/Edit/Hold/Delete, línea y Save en inglés',
    hEn.includes('>Redo</button>') && hEn.includes('>Edit</button>') && hEn.includes('>Hold</button>') && hEn.includes('>Delete</button>') &&
    hEn.includes('You have 2 of 3 redos left') && hEn.includes('>Save</button>'));

  // — Cableado estático —
  ok('C7: pzHoyBind cablea los 4 atributos nuevos ×1',
    occ(APP, /querySelectorAll\('\[data-pz-hoy-editar\]'\)/g) === 1 &&
    occ(APP, /querySelectorAll\('\[data-pz-hoy-rehacer\]'\)/g) === 1 &&
    occ(APP, /querySelectorAll\('\[data-pz-hoy-edit-save\]'\)/g) === 1 &&
    occ(APP, /querySelectorAll\('\[data-pz-hoy-edit-cancel\]'\)/g) === 1);
  const saveSrc = extractFn(APP, 'async function pzHoyEditarGuardar(btn) {', '// «Rehacer» de primer nivel');
  ok('C7: Guardar usa /edit-caption para programados y save-draft para borradores',
    saveSrc.includes("'/edit-caption'") && saveSrc.includes("action: 'save-draft'") && saveSrc.includes("status === 'scheduled'"));
  const redoSrc = extractFn(APP, 'async function pzHoyRehacer(btn) {', '// Contador del conserje');
  ok('C7: pzHoyRehacer llama al flujo vigente hfRedoPost(id)', redoSrc.includes('hfRedoPost(id)'));
  const tresSeg = APP.slice(APP.indexOf('const pillEstado'), APP.indexOf('const editBox'));
  ok('C7: Editar inline (data-pz-hoy-editar) para borrador/programado; al chat SOLO en publicado (su tarjeta data-pz-hoy-cambiar)',
    tresSeg.includes('data-pz-hoy-editar') && tresSeg.includes("st === 'published'") && tresSeg.includes('data-pz-hoy-cambiar'));
  ok('C7: la fila vieja .pz-hoy-tres desapareció de app.js y llegaron las tarjetas .pz-hoy-acts',
    !APP.includes('pz-hoy-tres') && APP.includes('pz-hoy-acts') && APP.includes('pz-hoy-pill-estado'));
  const CSS = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
  ok('C7: CSS del diseño: tarjetas + píldora de una línea (nowrap); el link del héroe ya NO tiene regla (ADDENDUM V4) ni queda la fila vieja',
    CSS.includes('.pz-hoy-acts{') && CSS.includes('.pz-hoy-act-ic{') && CSS.includes('.pz-hoy-pill-estado span{white-space:nowrap') &&
    !CSS.includes('.pz-hoy-hero-link{') && !CSS.includes('.pz-hoy-tres{'));

  // — M78: funciones llamadas desde la fila/el editor, definidas —
  const fns = ['pzHoyEditarAbrir', 'pzHoyEditarCerrar', 'pzHoyEditarGuardar', 'pzHoyRehacer', 'hfRedoPost', 'hfRedoLeft', 'hfRedoLineHTML'];
  const missing = fns.filter((f) => !new RegExp('function ' + f + '\\(').test(APP));
  ok(`C8: M78 — funciones auditadas ${fns.length - missing.length}/${fns.length}`, missing.length === 0, 'faltan: ' + missing.join(','));

  // — Comportamiento de Guardar/Rehacer con DOM falso mínimo —
  const calls = { post: [], patch: [], toast: [] };
  let failNext = false;
  const sb2 = {
    ME: { lang: 'es' },
    api: {
      post: async (u, b) => { calls.post.push([u, b]); if (failNext) throw new Error('falta caption'); return { ok: true }; },
      patch: async (u, b) => { calls.patch.push([u, b]); if (failNext) throw new Error('freno'); return { ok: true }; },
    },
    toast: (m) => { calls.toast.push(m); },
    console,
  };
  vm.createContext(sb2);
  vm.runInContext(saveSrc, sb2);
  vm.runInContext(redoSrc, sb2);
  const guardar = vm.runInContext('pzHoyEditarGuardar', sb2);
  const fakeCard = (status, val) => {
    const ta = { value: val };
    const err = { hidden: true, textContent: '' };
    const cap = { textContent: '', style: {} };
    const box = {
      hidden: false,
      getAttribute: (k) => (k === 'data-pz-hoy-edit-status' ? status : null),
      querySelector: (s) => (s === 'textarea' ? ta : (s === '[data-pz-hoy-edit-err]' ? err : null)),
    };
    const card = { querySelector: (s) => (s === '[data-pz-hoy-editbox]' ? box : (s === '.pz-hoy-hero-caption' ? cap : (s === '[data-pz-hoy-edit-err]' ? err : null))) };
    const btn = { disabled: false, getAttribute: () => '42', closest: () => card };
    return { btn, box, ta, err, cap };
  };
  const f1 = fakeCard('scheduled', 'Texto nuevo');
  await guardar(f1.btn);
  ok('C9: Guardar en programado → POST /api/posts/42/edit-caption con el caption',
    calls.post.length === 1 && calls.post[0][0] === '/api/posts/42/edit-caption' && calls.post[0][1].caption === 'Texto nuevo', JSON.stringify(calls.post));
  ok('C9: el caption de la tarjeta se actualiza en el lugar y el editor se cierra',
    f1.cap.textContent === 'Texto nuevo' && f1.box.hidden === true && calls.toast.some((m) => m.includes('Texto guardado')));
  const f2 = fakeCard('draft', 'Otro texto');
  await guardar(f2.btn);
  ok('C9: Guardar en borrador → PATCH save-draft (edición en revisión)',
    calls.patch.length === 1 && calls.patch[0][0] === '/api/posts/42' && calls.patch[0][1].action === 'save-draft' && calls.patch[0][1].caption === 'Otro texto', JSON.stringify(calls.patch));
  failNext = true;
  const f3 = fakeCard('scheduled', '');
  await guardar(f3.btn);
  failNext = false;
  ok('C9: si el servidor frena, el motivo se lee EN el editor y queda abierto',
    f3.err.hidden === false && f3.err.textContent.includes('falta caption') && f3.box.hidden === false && f3.btn.disabled === false);

  const redoCalls = [];
  const sb3 = { ME: { lang: 'es' }, hfRedoPost: async (id) => { redoCalls.push(id); }, console };
  vm.createContext(sb3);
  vm.runInContext(redoSrc, sb3);
  const rehacer = vm.runInContext('pzHoyRehacer', sb3);
  const btnR = { disabled: false, innerHTML: 'ORIGINAL', getAttribute: () => '42', textContent: '' };
  await rehacer(btnR);
  ok('C10: Rehacer llama a hfRedoPost con el id del posteo y el botón se restaura',
    redoCalls.length === 1 && redoCalls[0] === '42' && btnR.disabled === false && btnR.innerHTML === 'ORIGINAL', JSON.stringify(redoCalls));

  console.log(`\ntest-lote-detalle-posteo: ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
