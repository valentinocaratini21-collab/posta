'use strict';
/* =====================================================================
 * test-ideas-chip.js — v236 "IDEAS EN CHIP + FRESCURA"
 *
 * Cubre la parte de SERVIDOR de la aceptación (la del chip/DOM vive en
 * el harness CDP del build):
 *  (b) efeméride con fecha AYER: GET /api/ideas no la devuelve, queda
 *      'expired' en la DB y el Hacelo directo devuelve 410 honesto;
 *  (c) TTL: pending sin fecha de 15 días expira al leerse; de 13 vive;
 *  (d) Hacelo de una idea de la semana pasada ⇒ el borrador cae en la
 *      semana ACTUAL (week_key corriente), la idea conserva su origen;
 *  (e) idea carrusel ⇒ el draft es media_type='carousel' con las
 *      placas del pipeline real (portada + 3) — nunca una foto simple;
 *  (e2) con hueco de video, NINGUNA señal del generador sale 'reel';
 *  (f) competidores: un handle inválido y la cuenta propia quedan
 *      fuera; los válidos se guardan (tope 5 del parser, ya cubierto
 *      por test-ideas-loop; acá el round-trip por la API).
 * Costo IA: CERO — el fetch a OpenAI está stubbeado (fixtures
 * deterministas por marcador de system prompt, patrón
 * test-style-favorites / test-level-boosts).
 * ===================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-ideaschip-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18771';
process.env.BASE_URL = 'http://127.0.0.1:18771';
process.env.OPENAI_API_KEY = 'sk-test-fake';
delete process.env.GEMINI_API_KEY;

// --- PNG sólido 1024×1280 (pasa qaResolutionOk / qaAspectOk) -----------
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
function solidPngB64(w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3); raw[off] = 0;
    for (let x = 0; x < w; x++) { raw[off + 1 + x * 3] = rgb[0]; raw[off + 2 + x * 3] = rgb[1]; raw[off + 3 + x * 3] = rgb[2]; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}
const PNG_B64 = solidPngB64(1024, 1280, [216, 178, 132]);

// --- Stub de OpenAI: fixtures por marcador del system prompt -----------
const CAPTION = '🌸 Ramos frescos de estación, armados hoy en el local.\n\nPeonías, ranúnculos y rosas de temporada en papel kraft, como siempre.\n\nPedilo por DM y te lo llevamos hoy 🌿';
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.includes('api.openai.com')) return realFetch(url, opts);
  const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };
  const chat = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }], usage }), text: async () => JSON.stringify(obj) });
  if (u.includes('/images/')) {
    return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG_B64 }] }), text: async () => '' };
  }
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  const msgs = body.messages || [];
  const sys = String((msgs[0] && msgs[0].content) || '');
  if (sys.includes('DESLIZA')) return chat({ cover: 'El truco que nadie te cuenta', slides: [{ title: 'Qué mirar primero', text: 'La frescura se nota en el tallo y en la hoja.' }, { title: 'Por qué dura más', text: 'Cortamos y armamos el mismo día, sin cámara fría eterna.' }, { title: 'Pedilo hoy', text: 'Escribinos por DM y te lo llevamos hoy mismo.' }] });
  if (sys.includes('FRENA EL SCROLL')) return chat({ single_subject: true, not_cluttered: true, readable_small: true, thumb_hook: true, detalle: 'se ve un solo ramo en primer plano, fondo limpio' });
  if (sys.includes('control de calidad de una agencia')) return chat({ brand_ok: true, texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, headline_complete: true, headline_clear: true, anatomia_ok: true, contraste_ok: true, elementos_ok: true, detalle: 'se ve el ramo completo y el titular entero en la banda superior' });
  if (sys.includes('guardián de marca')) return chat({ paleta_ok: true, logo_ok: true, linea_ok: true, detalle: 'la paleta aparece integrada en el papel y las flores' });
  // generateContent / brief / resto: un caption válido y JSON parseable.
  return chat({ caption: CAPTION, overlay: 'Ramos frescos hoy', hashtags: '#flores #palermo' });
};

// --- Fechas en la zona del usuario (BA) ----------------------------------
function baParts(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return { y: +g('year'), m: +g('month'), d: +g('day') };
}
function baTodayStr() { const { y, m, d } = baParts(new Date()); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function shiftDateStr(s, days) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function mondayKeyOfStr(s) { const d = new Date(s + 'T12:00:00Z'); const off = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - off); return d.toISOString().slice(0, 10); }
const TODAY = baTodayStr();
const YESTERDAY = shiftDateStr(TODAY, -1);
const TOMORROW = shiftDateStr(TODAY, 1);
const CURRENT_MONDAY = mondayKeyOfStr(TODAY);
const OLD_WEEK = '2026-09-07'; // una semana vieja cualquiera (origen de la idea)

// --- HTTP con cookie de sesión ------------------------------------------
let cookie = '';
async function call(method, p, body) {
  const r = await realFetch('http://127.0.0.1:18771' + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}

(async () => {
  const db = require('./db');
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18771/api/version'); if (r.ok) break; } catch (e) {}
    await new Promise((res) => setTimeout(res, 500));
    if (i === 59) throw new Error('el server no levantó');
  }

  let passed = 0;
  const ok = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

  // Usuario fresco (trial) con su @ propio cargado.
  const reg = await call('POST', '/api/auth/register', { email: 'ideaschip@test.local', password: 'secreto1' });
  assert.strictEqual(reg.status, 200, 'registro: ' + JSON.stringify(reg.json));
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('ideaschip@test.local').id;
  if (db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(uid)) {
    db.prepare(`UPDATE profiles SET ig_username = 'floresdelbarrio' WHERE user_id = ?`).run(uid);
  } else {
    db.prepare(`INSERT INTO profiles (user_id, ig_username) VALUES (?, 'floresdelbarrio')`).run(uid);
  }

  const seedIdea = ({ source = 'competitor', angle = 'chip:test', title = 'Idea de prueba', why = 'Porque sí', format = 'post', week = OLD_WEEK, eph = '', createdSql = null, status = 'pending' }) => {
    const r = createdSql
      ? db.prepare(`INSERT INTO posty_ideas (user_id, week_key, source, angle_key, title, why, format, brief, status, eph_date, created_at) VALUES (?,?,?,?,?,?,?,?,'pending',?, ${createdSql})`).run(uid, week, source, angle, title, why, format, 'brief de prueba', eph)
      : db.prepare(`INSERT INTO posty_ideas (user_id, week_key, source, angle_key, title, why, format, brief, status, eph_date) VALUES (?,?,?,?,?,?,?,?,'pending',?)`).run(uid, week, source, angle, title, why, format, 'brief de prueba', eph);
    return r.lastInsertRowid;
  };
  const statusOf = (id) => (db.prepare('SELECT status FROM posty_ideas WHERE id = ?').get(id) || {}).status;

  console.log('== (b) Efeméride vencida: no se muestra, expira, Hacelo = 410 ==');
  const ephOld = seedIdea({ source: 'calendar', angle: `eph:${YESTERDAY}:Día de Prueba`, title: 'Posteo del Día de Prueba', why: `Es HOY (${YESTERDAY}): el Día de Prueba`, eph: YESTERDAY });
  const ephOk = seedIdea({ source: 'calendar', angle: `eph:${TOMORROW}:Día Futuro`, title: 'Se viene el Día Futuro', why: `Mañana (${TOMORROW}) es el Día Futuro`, eph: TOMORROW });
  const getBody = await call('GET', '/api/ideas');
  assert.strictEqual(getBody.status, 200);
  const idsShown = (getBody.json.ideas || []).map((i) => i.id);
  ok('GET /api/ideas NO devuelve la efeméride de ayer', () => assert.ok(!idsShown.includes(ephOld), 'ids: ' + idsShown.join(',')));
  ok('la vencida quedó expired en la DB al leerse', () => assert.strictEqual(statusOf(ephOld), 'expired'));
  ok('la efeméride de mañana sigue viva y se muestra', () => { assert.ok(idsShown.includes(ephOk)); assert.strictEqual(statusOf(ephOk), 'pending'); });
  const ephOld2 = seedIdea({ source: 'calendar', angle: `eph:${YESTERDAY}:Otro Día`, title: 'Otra vencida', why: `Es HOY (${YESTERDAY})`, eph: YESTERDAY });
  const make410 = await call('POST', `/api/ideas/${ephOld2}/make`, {});
  ok('Hacelo directo sobre una vencida ⇒ 410 con mensaje honesto', () => {
    assert.strictEqual(make410.status, 410, 'status ' + make410.status + ': ' + JSON.stringify(make410.json));
    assert.ok(/ya pasó de fecha/.test((make410.json || {}).error || ''), JSON.stringify(make410.json));
    assert.strictEqual(statusOf(ephOld2), 'expired');
  });
  // Compatibilidad: una fila VIEJA sin eph_date pero con la fecha en el
  // angle_key también vence (el barrido la reconoce igual).
  const legacy = seedIdea({ source: 'calendar', angle: `eph:${YESTERDAY}:Día Legado`, title: 'Legado', why: `Es HOY (${YESTERDAY})`, eph: '' });
  await call('GET', '/api/ideas');
  ok('fila vieja sin eph_date (fecha en angle_key) también expira', () => assert.strictEqual(statusOf(legacy), 'expired'));

  console.log('== (c) TTL general de pending sin fecha: 14 días ==');
  const ttl15 = seedIdea({ angle: 'chip:ttl15', createdSql: `datetime('now','-15 days')` });
  const ttl13 = seedIdea({ angle: 'chip:ttl13', createdSql: `datetime('now','-13 days')` });
  const get2 = await call('GET', '/api/ideas');
  const shown2 = (get2.json.ideas || []).map((i) => i.id);
  ok('pending de 15 días ⇒ expirada al leer', () => { assert.strictEqual(statusOf(ttl15), 'expired'); assert.ok(!shown2.includes(ttl15)); });
  ok('pending de 13 días ⇒ viva y visible', () => { assert.strictEqual(statusOf(ttl13), 'pending'); assert.ok(shown2.includes(ttl13)); });

  console.log('== (d) Hacelo cae en la semana ACTUAL ==');
  const oldIdea = seedIdea({ angle: 'chip:semana-vieja', week: OLD_WEEK, title: 'Ramos de estación' });
  const makeOld = await call('POST', `/api/ideas/${oldIdea}/make`, {});
  assert.strictEqual(makeOld.status, 200, 'make: ' + JSON.stringify(makeOld.json));
  ok('el borrador quedó en el lunes corriente, no en la semana de origen', () => {
    const post = db.prepare('SELECT week_key, status, media_type FROM posts WHERE id = ?').get(makeOld.json.post_id);
    assert.ok(post, 'el posteo existe');
    assert.strictEqual(post.week_key, CURRENT_MONDAY);
    assert.notStrictEqual(post.week_key, OLD_WEEK);
    assert.strictEqual(post.status, 'draft');
    const ideaRow = db.prepare('SELECT week_key, status FROM posty_ideas WHERE id = ?').get(oldIdea);
    assert.strictEqual(ideaRow.week_key, OLD_WEEK, 'la idea conserva su semana de origen como dato');
    assert.strictEqual(ideaRow.status, 'made');
  });

  console.log('== (e) Carrusel prometido = carrusel entregado ==');
  const carIdea = seedIdea({ angle: 'chip:carrusel', format: 'carrusel', title: 'Cómo elegir un ramo' });
  const makeCar = await call('POST', `/api/ideas/${carIdea}/make`, {});
  assert.strictEqual(makeCar.status, 200, 'make carrusel: ' + JSON.stringify(makeCar.json));
  ok('el draft es media_type carousel con portada IA + placas (total 3–6, v384)', () => {
    const post = db.prepare('SELECT media_type, image_path, carousel_paths FROM posts WHERE id = ?').get(makeCar.json.post_id);
    assert.strictEqual(post.media_type, 'carousel');
    const paths = JSON.parse(post.carousel_paths || '[]');
    assert.ok(paths.length >= 3 && paths.length <= 6, 'paths (3–6): ' + JSON.stringify(paths));
    assert.strictEqual(paths[0], post.image_path, 'la primera placa es la portada');
    for (const p of paths) assert.ok(fs.existsSync(path.join(TMP, 'media', path.basename(p))), 'existe en disco: ' + p);
  });

  console.log('== (e2) El generador no emite reels (hueco de video) ==');
  {
    const ideasMod = require('./ideas');
    const out = ideasMod.buildIdeaSignals({
      snaps: [{ handle: 'predis.ai', posts: 12, byFormat: { image: 12, video: 0, carousel: 0 }, topPost: null, topFmt: null }],
      own: { postsAnalyzed: 3, byFormat: { image: 0, video: 1, carousel: 0 }, topPost: { id: 7, media_type: 'video', reach: 900, likes: 40, comments: 9, caption: 'un reel viejo' } },
      ephemerides: [],
    });
    ok('ninguna señal sale con formato reel', () => assert.ok(out.every((s) => s.format !== 'reel'), JSON.stringify(out.map((s) => s.format))));
  }

  console.log('== (f) Competidores por la API ==');
  const bad = await call('POST', '/api/ideas/competitors', { handles: ['mal!!handle', 'ok_uno', 'FLORESDELBARRIO'] });
  ok('inválido y cuenta propia quedan fuera; el válido entra', () => {
    assert.strictEqual(bad.status, 200, JSON.stringify(bad.json));
    assert.deepStrictEqual(bad.json.competitors, ['ok_uno']);
    const prof = db.prepare('SELECT competitors FROM profiles WHERE user_id = ?').get(uid);
    assert.strictEqual(prof.competitors, '@ok_uno'); // canonicalCompetitors guarda con @
  });

  console.log(`\n✅ test-ideas-chip: ${passed} checks OK`);
  process.exit(0);
})().catch((e) => { console.error('❌ test-ideas-chip:', e.message); process.exit(1); });
