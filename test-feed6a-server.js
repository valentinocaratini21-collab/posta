'use strict';
/* test-feed6a-server.js — Tanda feed 6A · ítem 3 (servidor, generación
 * stubbeada por fetch como test-client-material: costo IA cero):
 *  · migración redo_left (las filas nacen con 3) y payload /api/posts.
 *  · descuento atómico SOLO al entregar: photo-enhance exitoso −1 por
 *    vez hasta 0; a 0 bloquea con redo_exhausted SIN generar (el stub
 *    no registra llamadas); un fallo de generación NO descuenta.
 *  · photo-restyle exitoso descuenta; su gate a 0 también bloquea.
 *  · «volver a la anterior» (photo-revert) INTERCAMBIA imágenes y NO
 *    descuenta; editar el caption y cambiar el horario NO descuentan.
 *  · la portada del carrusel a 0 bloquea sin generar.
 * Uso: node test-feed6a-server.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-feed6a-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18776';
process.env.BASE_URL = 'http://127.0.0.1:18776';
process.env.OPENAI_API_KEY = 'sk-stub-feed6a';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- PNG sólido mínimo (mismo helper que test-client-material) ---
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

// --- Stub de OpenAI: imágenes + QA del concept-shot ---
const state = { genCalls: 0, failImages: false };
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.includes('api.openai.com')) return realFetch(url, opts);
  const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };
  const chat = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }], usage }), text: async () => JSON.stringify(obj) });
  if (u.includes('/images/')) {
    state.genCalls++;
    if (state.failImages) return { ok: false, status: 500, json: async () => ({ error: { message: 'stub fail' } }), text: async () => 'stub fail' };
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

let cookie = '';
async function call(method, p, body) {
  const r = await realFetch('http://127.0.0.1:18776' + p, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 220) : ''); }
};

(async () => {
  const dbmod = require('./db');
  const db = dbmod.db || dbmod;
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18776/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  const cols = db.prepare('PRAGMA table_info(posts)').all().map((c) => c.name);
  ok('migración: posts.redo_left existe', cols.includes('redo_left'));

  const reg = await call('POST', '/api/auth/register', { email: 'feed6a@x.example', password: 'secreto1' });
  ok('registro con sesión', reg.status === 200 && !!cookie, reg.status);
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('feed6a@x.example').id;
  // Plan Total activo: el rate-limit diario de regeneraciones (8/día en
  // ese plan) queda por encima de las llamadas del test y no tapa al gate.
  db.prepare("UPDATE users SET plan_status = 'active', plan = 'total' WHERE id = ?").run(uid);
  const writeMedia = (name, rgb) => { fs.writeFileSync(path.join(MEDIA_DIR, name), solidPng(1024, 1280, rgb)); return '/media/' + name; };
  const seedPost = (img, extra) => db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, prev_image_path)
    VALUES (?,?,?,?,'draft','image','foto',?)`).run(uid, img, 'Promo de la semana', '#test', (extra && extra.prev) || '').lastInsertRowid;
  const redoOf = (id) => db.prepare('SELECT redo_left, image_path, prev_image_path FROM posts WHERE id = ?').get(id);

  // — Payload: el posteo nace con 3 y /api/posts lo expone —
  const imgA = writeMedia('f6a-a.png', [200, 60, 60]);
  const postA = seedPost(imgA);
  ok('el posteo nace con redo_left = 3', redoOf(postA).redo_left === 3, JSON.stringify(redoOf(postA)));
  const list = await call('GET', '/api/posts');
  const inPayload = (Array.isArray(list.json) ? list.json : []).find((p) => p.id === postA);
  ok('GET /api/posts expone redo_left', !!inPayload && inPayload.redo_left === 3);

  // — photo-enhance: éxito descuenta de a 1 hasta 0 —
  for (let want = 2; want >= 0; want--) {
    const r = await call('POST', `/api/drafts/${postA}/photo-enhance`, {});
    ok(`photo-enhance ok → quedan ${want}`, r.json && r.json.ok === true && redoOf(postA).redo_left === want, JSON.stringify(r.json).slice(0, 160));
  }
  const callsAtZero = state.genCalls;
  const blocked = await call('POST', `/api/drafts/${postA}/photo-enhance`, {});
  ok('a 0: photo-enhance responde redo_exhausted', blocked.json && blocked.json.error === 'redo_exhausted', JSON.stringify(blocked.json).slice(0, 160));
  ok('a 0: NO se generó nada (el stub no registró llamadas)', state.genCalls === callsAtZero, `genCalls ${callsAtZero} → ${state.genCalls}`);
  ok('a 0: el contador no baja de 0', redoOf(postA).redo_left === 0);

  // — Fallo de generación: NO descuenta —
  const imgB = writeMedia('f6a-b.png', [60, 200, 60]);
  const postB = seedPost(imgB);
  state.failImages = true;
  const failR = await call('POST', `/api/drafts/${postB}/photo-enhance`, {});
  state.failImages = false;
  ok('fallo de generación: la respuesta no es ok', !(failR.json && failR.json.ok), JSON.stringify(failR.json).slice(0, 140));
  ok('fallo de generación: redo_left intacto (3)', redoOf(postB).redo_left === 3, JSON.stringify(redoOf(postB)));

  // — photo-restyle: éxito descuenta; a 0 bloquea sin generar —
  const rs = await call('POST', `/api/drafts/${postB}/photo-restyle`, {});
  ok('photo-restyle ok con el stub fiel', rs.json && rs.json.ok === true, JSON.stringify(rs.json).slice(0, 180));
  ok('photo-restyle entregado: redo_left 3 → 2', redoOf(postB).redo_left === 2, JSON.stringify(redoOf(postB)));
  db.prepare('UPDATE posts SET redo_left = 0 WHERE id = ?').run(postB);
  const callsBeforeGate = state.genCalls;
  const rsBlocked = await call('POST', `/api/drafts/${postB}/photo-restyle`, {});
  ok('a 0: photo-restyle responde redo_exhausted sin generar', rsBlocked.json && rsBlocked.json.error === 'redo_exhausted' && state.genCalls === callsBeforeGate, JSON.stringify(rsBlocked.json).slice(0, 140));

  // — photo-revert: INTERCAMBIA y no descuenta —
  const imgC1 = writeMedia('f6a-c1.png', [60, 60, 200]);
  const imgC2 = writeMedia('f6a-c2.png', [200, 200, 60]);
  const postC = seedPost(imgC1, { prev: imgC2 });
  db.prepare('UPDATE posts SET redo_left = 2 WHERE id = ?').run(postC);
  const rv1 = await call('POST', `/api/drafts/${postC}/photo-revert`, {});
  const afterRv1 = redoOf(postC);
  ok('photo-revert: intercambia vigente ↔ anterior', rv1.json && rv1.json.ok === true && afterRv1.image_path === imgC2 && afterRv1.prev_image_path === imgC1, JSON.stringify(afterRv1));
  ok('photo-revert: NO descuenta', afterRv1.redo_left === 2);
  const rv2 = await call('POST', `/api/drafts/${postC}/photo-revert`, {});
  const afterRv2 = redoOf(postC);
  ok('segundo revert: vuelve a la imagen original (intercambio reversible)', rv2.json && rv2.json.ok === true && afterRv2.image_path === imgC1 && afterRv2.redo_left === 2, JSON.stringify(afterRv2));

  // — Gratis: editar el texto y cambiar el horario no descuentan —
  const capEdit = await call('PATCH', `/api/posts/${postC}`, { action: 'save-draft', caption: 'Texto retocado a mano' });
  ok('editar el caption por save-draft responde ok', capEdit.status === 200, capEdit.status + ' ' + JSON.stringify(capEdit.json).slice(0, 120));
  ok('editar el texto NO descuenta', redoOf(postC).redo_left === 2);
  const future = new Date(Date.now() + 3 * 86400000).toISOString();
  const sched = await call('PATCH', `/api/posts/${postC}`, { scheduled_at: future });
  ok('cambiar el horario responde', sched.status === 200, sched.status + ' ' + JSON.stringify(sched.json).slice(0, 120));
  ok('cambiar el horario NO descuenta', redoOf(postC).redo_left === 2);

  // — Carrusel: a 0 bloquea sin generar —
  const imgD = writeMedia('f6a-d.png', [120, 120, 120]);
  const postD = seedPost(imgD);
  db.prepare('UPDATE posts SET redo_left = 0 WHERE id = ?').run(postD);
  const callsBeforeCar = state.genCalls;
  const car = await call('POST', '/api/carousel-generate', { postId: postD });
  ok('carrusel a 0: redo_exhausted sin generar la portada', car.json && car.json.error === 'redo_exhausted' && state.genCalls === callsBeforeCar, JSON.stringify(car.json).slice(0, 160));

  // — Cableado (estático): chat-edit consume al entregar; revert del chat intercambia —
  const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const regenSeg = SRV.slice(SRV.indexOf('regenJobs.push'), SRV.indexOf('regenJobs.push') + 1400);
  ok('chat-edit: el job de regeneración consume con consumeRedo al entregar', regenSeg.includes('consumeRedo(uid, postIdForRedo)'));
  const revSeg = SRV.slice(SRV.indexOf('out.reverts'), SRV.indexOf('out.reverts') + 2600);
  ok('chat «volver»: guarda la vigente en post_versions antes de restaurar (intercambio)', revSeg.includes('INSERT INTO post_versions'));
  ok('admin regenDirectedDraft NO consume rehaces del cliente', !SRV.slice(SRV.indexOf('async function regenDirectedDraft'), SRV.indexOf('async function regenDirectedDraft') + 6000).includes('consumeRedo'));

  console.log(`\ntest-feed6a-server: ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
