'use strict';
/* =====================================================================
 * test-avatar-posty.js — LOTE AVATAR-POSTY (5/11, orden de Valentino:
 * «el avatar no es igual a posty y eso no puede suceder»)
 *
 * El posteo 554 se programó con un robot genérico de visor LED en vez
 * de Posty. Dos agujeros, los dos cerrados acá:
 *  (1) HUECO DEL LLAMADOR: chat-create (y el resto de los llamadores
 *      de conceptShotGenerateQueued) jamás leía gate.character — solo
 *      gate.qaGate. Un veredicto 'failed' del QA de personaje se
 *      programaba como si estuviera bien. Ahora characterBlocksDelivery
 *      (failed SIEMPRE; unverified + casa TAMBIÉN) frena la entrega
 *      en TODOS los llamadores que crean posteos.
 *  (2) HUECO DEL REGEN TARDÍO: el veredicto de personaje describía la
 *      imagen que el QA de personaje vio, pero el QA gate (o fidelidad)
 *      podía REGENERAR después — la imagen FINAL nunca se verificaba.
 *      El 554: QA gate con 2 intentos; la final era otra imagen.
 *      Ahora, si algo regeneró después del QA de personaje, la imagen
 *      final se re-verifica con UNA llamada (sin regenerar).
 * Costo IA: CERO — fetch stubbeado por marcadores (patrón de la casa).
 * Discriminación: en v693 prístino (a) programa el posteo como bueno,
 * (b) entrega la imagen final sin verificar y (c) entrega sin verificar
 * en la casa — los tres fallan ahí y pasan acá.
 * ===================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-avatarposty-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18775';
process.env.BASE_URL = 'http://127.0.0.1:18775';
process.env.OPENAI_API_KEY = 'test-key';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- PNG helpers (mismo patrón que test-character-lock) ------------------
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
function pngBuffer(w, h, pixFn) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3); raw[off] = 0;
    for (let x = 0; x < w; x++) { const rgb = pixFn(x, y); raw[off + 1 + x * 3] = rgb[0]; raw[off + 2 + x * 3] = rgb[1]; raw[off + 3 + x * 3] = rgb[2]; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
const solidPng = (w, h, rgb) => pngBuffer(w, h, () => rgb);

// --- Stub de OpenAI ------------------------------------------------------
const state = {
  characterOk: true, edits: [], personajeCalls: 0, genCalls: 0,
  personajeFailFrom: 0, // 0 = nunca; N = fallar desde la llamada N (para la re-verificación)
  characterNull: false, // true = el QA de personaje no devuelve veredicto (500)
  qaFailFirst: false, qaCalls: 0, // true = la 1ª evaluación del QA gate falla (fuerza regen)
};
const GEN_COLORS = [[226, 44, 44], [44, 44, 226], [226, 178, 44], [44, 200, 160], [160, 44, 200], [226, 120, 44]];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.includes('api.openai.com')) return realFetch(url, opts);
  const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };
  const chat = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }], usage }), text: async () => JSON.stringify(obj) });
  const chatRaw = (text) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }], usage }), text: async () => text });
  if (u.includes('/images/')) {
    const rec = { prompt: '', size: '', imageBytes: null };
    try {
      const fd = opts && opts.body;
      if (fd && typeof fd.get === 'function') {
        rec.prompt = String(fd.get('prompt') || '');
        rec.size = String(fd.get('size') || '');
        const img = fd.get('image');
        if (img && typeof img.arrayBuffer === 'function') rec.imageBytes = Buffer.from(await img.arrayBuffer());
      }
    } catch (e) {}
    state.edits.push(rec);
    const b64 = solidPng(1024, 1280, GEN_COLORS[state.genCalls % GEN_COLORS.length]).toString('base64');
    state.genCalls++;
    return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: b64 }] }), text: async () => '' };
  }
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  const msgs = body.messages || [];
  const sys = String((msgs[0] && msgs[0].content) || '');
  if (sys.includes('control de PERSONAJE')) {
    state.personajeCalls++;
    if (state.characterNull) return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
    const okNow = (state.personajeFailFrom > 0 && state.personajeCalls >= state.personajeFailFrom) ? false : state.characterOk;
    return chat(okNow
      ? { personaje_ok: true, detalle: 'mismo protagonista: misma cara pintada, mismos ojos y su accesorio firma igual' }
      : { personaje_ok: false, detalle: 'el protagonista cambió: la cara ahora es un visor LED genérico y perdió sus marcas' });
  }
  if (sys.includes('control de FIDELIDAD')) return chat({ fidelidad_ok: true, detalle: 'mismo producto, misma etiqueta' });
  if (sys.includes('FRENA EL SCROLL')) return chat({ single_subject: true, not_cluttered: true, readable_small: true, thumb_hook: true, detalle: 'un solo sujeto en primer plano' });
  if (sys.includes('control de calidad de una agencia')) {
    state.qaCalls++;
    if (state.qaFailFirst && state.qaCalls === 1) {
      return chat({ brand_ok: true, texto_ok: false, colores_ok: true, claims_ok: true, mobile_ok: true, headline_complete: true, headline_clear: false, anatomia_ok: true, contraste_ok: true, elementos_ok: true, detalle: 'texto cortado en el borde' });
    }
    return chat({ brand_ok: true, texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, headline_complete: true, headline_clear: true, anatomia_ok: true, contraste_ok: true, elementos_ok: true, detalle: 'pieza correcta' });
  }
  if (sys.includes('guardián de marca')) return chat({ paleta_ok: true, logo_ok: true, linea_ok: true, detalle: 'paleta integrada' });
  if (sys.includes('DESLIZA')) return chat({ cover: 'El truco', slides: [{ title: 'Uno', text: 'Texto uno.' }, { title: 'Dos', text: 'Texto dos.' }, { title: 'Tres', text: 'Texto tres.' }] });
  if (sys.includes('Te llamás Posty')) {
    // El chat pide crear un posteo con fecha: el modelo cierra el bloque ```create.
    // Caption con llamado a la acción para que el schedule-lint no marque
    // needs_review por su cuenta (la discriminación debe venir del personaje).
    return chatRaw('dale, lo armo ahora mismo 😄\n```create\n{"brief": "Posty presenta la semana", "caption": "Posty te arma la semana, todos los días.\\n\\nTu contenido pensado, creado y publicado solo, sin que tengas que hacer nada.\\n\\nEscribime por DM y empezamos", "when": "2027-02-05 19:00"}\n```');
  }
  return chat({ caption: '☕ Blend Patagonia recién tostado, como lo hacemos siempre.\n\nGranos seleccionados, tueste del día y el mismo sabor de siempre.\n\nPedilo por DM ☕', overlay: 'Blend Patagonia', hashtags: '#cafe #palermo' });
};

// --- HTTP con cookie ------------------------------------------------------
let cookie = '';
async function call(method, p, body) {
  const r = await realFetch('http://127.0.0.1:18775' + p, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = require('./db');
  const generator = require('./generator');
  const srv = require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18775/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  let passed = 0;
  const ok = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

  /* ================= (u) Unidad: characterBlocksDelivery ================= */
  console.log('== (u) characterBlocksDelivery: la tabla de decisión ==');
  const cbd = srv.characterBlocksDelivery;
  assert.strictEqual(typeof cbd, 'function', 'characterBlocksDelivery debe estar exportado');
  ok('(u) failed bloquea siempre (casa o cliente)', () => {
    assert.strictEqual(cbd({ character: 'failed' }), true);
    assert.strictEqual(cbd({ character: 'failed', characterHouse: true }), true);
    assert.strictEqual(cbd({ character: 'failed', characterHouse: false }), true);
  });
  ok('(u) unverified + casa bloquea; unverified fuera de la casa NO bloquea', () => {
    assert.strictEqual(cbd({ character: 'unverified', characterHouse: true }), true);
    assert.strictEqual(cbd({ character: 'unverified', characterHouse: false }), false);
    assert.strictEqual(cbd({ character: 'unverified' }), false);
  });
  ok('(u) passed, n/a, vacío y null no bloquean', () => {
    assert.strictEqual(cbd({ character: 'passed' }), false);
    assert.strictEqual(cbd({ character: 'n/a' }), false);
    assert.strictEqual(cbd({}), false);
    assert.strictEqual(cbd(null), false);
    assert.strictEqual(cbd(undefined), false);
  });

  /* ================= Fixtures de la casa ================= */
  const seedUser = async (email, { name, category, ig }) => {
    const reg = await call('POST', '/api/auth/register', { email, password: 'secreto1' });
    assert.strictEqual(reg.status, 200, 'registro ' + email + ': ' + JSON.stringify(reg.json));
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    db.prepare('UPDATE users SET autopilot_enabled = 1 WHERE id = ?').run(uid);
    if (db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(uid)) {
      db.prepare('UPDATE profiles SET business_name = ?, category = ?, ig_username = ? WHERE user_id = ?').run(name, category, ig, uid);
    } else {
      db.prepare('INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (?,?,?,?)').run(uid, name, category, ig);
    }
    return uid;
  };
  const login = async (email) => {
    const r = await call('POST', '/api/auth/login', { email, password: 'secreto1' });
    assert.strictEqual(r.status, 200, 'login ' + email + ': ' + JSON.stringify(r.json));
  };
  const seedDigest = (uid, digest) => {
    db.prepare(`INSERT INTO client_digest (user_id, digest_json, hash, version) VALUES (?,?,?,3)
      ON CONFLICT(user_id) DO UPDATE SET digest_json = excluded.digest_json, hash = excluded.hash, version = 3`)
      .run(uid, JSON.stringify(digest), 'testhash' + uid);
  };
  const writeMedia = (name, buf) => { fs.writeFileSync(path.join(MEDIA_DIR, name), buf); return '/media/' + name; };
  const seedIdea = (uid, angleKey, title) => db.prepare(`INSERT INTO posty_ideas (user_id, week_key, source, angle_key, title, why, format, brief, status)
    VALUES (?,?,?,?,?,?,?,?, 'pending')`).run(uid, '2026-10-12', 'winner', angleKey, title, 'Señal real del negocio', 'post', 'brief').lastInsertRowid;
  const seedCasa = async (email) => {
    const uid = await seedUser(email, { name: 'Posty.', category: 'profesionales', ig: 'posty.communitymanager' });
    const logoBuf = solidPng(400, 400, [250, 200, 40]);
    const genericBuf = solidPng(1024, 1280, [120, 120, 200]);
    writeMedia('logo-' + uid + '.png', logoBuf);
    writeMedia('generica-' + uid + '.jpg', genericBuf);
    db.prepare(`INSERT INTO assets (user_id, file_path, kind, created_at) VALUES (?,?,?,?)`).run(uid, '/media/logo-' + uid + '.png', 'logo', '2026-09-01 10:00:00');
    db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag, album_quality, created_at) VALUES (?,?, 'photo', 'otro', 'ok', '2026-10-18 10:00:00')`).run(uid, '/media/generica-' + uid + '.jpg');
    seedDigest(uid, { nombre: 'Posty.', categoria: 'profesionales', productos: [], servicios: [{ nombre: 'Community manager con IA' }], protagonista: 'Posty, el robot celeste', fuentes: {} });
    await login(email);
    return uid;
  };
  const makeAndCapture = async (uid, ideaId) => {
    const editsBefore = state.edits.length;
    const persBefore = state.personajeCalls;
    const r = await call('POST', `/api/ideas/${ideaId}/make`, {});
    assert.strictEqual(r.status, 200, 'make: ' + JSON.stringify(r.json));
    const post = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(uid);
    assert.ok(post, 'nació el posteo');
    return { post, edits: state.edits.slice(editsBefore), personajeCalls: state.personajeCalls - persBefore };
  };
  const resetStub = () => {
    state.characterOk = true; state.personajeFailFrom = 0; state.characterNull = false;
    state.qaFailFirst = false; state.qaCalls = 0; state.personajeCalls = 0;
  };
  const avatarBuf = fs.readFileSync(path.join(__dirname, 'public', 'ai-avatar.png'));

  /* ============ (a) CHAT-CREATE: personaje distinto ⇒ borrador ============ */
  console.log('== (a) chat-create: el hueco del 554 — jamás programado como bueno ==');
  resetStub();
  state.characterOk = false;
  const uidChat = await seedCasa('casa-chat@test.local');
  const persBeforeA = state.personajeCalls;
  const chatR = await call('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'creame un posteo de Posty presentando la semana, programalo para el 5 de febrero a las 19' }] });
  assert.strictEqual(chatR.status, 200, 'chat: ' + JSON.stringify(chatR.json));
  assert.ok(chatR.json && chatR.json.create && Array.isArray(chatR.json.create.ok) && chatR.json.create.ok.length === 1, 'el chat creó 1 posteo: ' + JSON.stringify(chatR.json && chatR.json.create));
  const postChat = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(uidChat);
  assert.ok(postChat, 'nació el posteo por chat');
  ok('(a) la referencia que viajó es el AVATAR OFICIAL (el gate juzgó al Posty real)', () => {
    assert.ok(state.edits.length >= 1, 'hubo generación');
    assert.ok(state.edits[0].imageBytes && state.edits[0].imageBytes.equals(avatarBuf), 'los bytes enviados no son los de ai-avatar.png');
    assert.ok(state.personajeCalls - persBeforeA >= 1, 'el QA de personaje corrió');
  });
  ok('(a) personaje distinto ⇒ status draft (NUNCA scheduled) + needs_review=1 + sin fecha', () => {
    assert.strictEqual(postChat.status, 'draft', 'status=' + postChat.status + ' (en v693: scheduled)');
    assert.strictEqual(postChat.needs_review, 1, 'needs_review=' + postChat.needs_review + ' (en v693: 0)');
    assert.ok(!postChat.scheduled_at, 'scheduled_at debe ser NULL, es ' + postChat.scheduled_at);
  });
  ok('(a) el recibo del chat dice revisión sin fecha (no promete la hora pedida)', () => {
    const entry = chatR.json.create.ok[0];
    assert.ok(!entry.when, 'when debe ser null, es ' + entry.when);
    assert.strictEqual(entry.review, true, 'review debe ser true');
    const lines = generator.chatReceiptLines({ created: [{ title: entry.title, review: true }], issues: [{ kind: 'character_review', title: entry.title }] });
    assert.ok(lines.some((l) => /protagonista/.test(l) && /revisión/.test(l)), 'el recibo debe nombrar al protagonista: ' + JSON.stringify(lines));
  });
  state.characterOk = true;

  /* ============ (b) REGEN TARDÍO: la imagen final se re-verifica ============ */
  console.log('== (b) QA gate regenera después del personaje ⇒ la final se re-verifica ==');
  resetStub();
  state.personajeFailFrom = 2; // el 1er veredicto pasa; la RE-verificación falla
  state.qaFailFirst = true; // la 1ª evaluación del QA gate falla → regen → intento 2
  const uidRegen = await seedCasa('casa-regen@test.local');
  const regen = await makeAndCapture(uidRegen, seedIdea(uidRegen, 'regen:1', 'Posty presenta la semana nueva'));
  ok('(b) el QA gate regeneró (2 generaciones) y la re-verificación corrió', () => {
    assert.strictEqual(regen.edits.length, 2, 'generaciones: ' + regen.edits.length + ' (1 inicial + 1 del QA gate)');
    assert.ok(regen.personajeCalls >= 2, 'llamadas al QA de personaje: ' + regen.personajeCalls + ' (inicial + re-verificación final)');
  });
  ok('(b) la imagen final con protagonista distinto ⇒ needs_review=1 (en v693: 0)', () => {
    assert.strictEqual(regen.post.needs_review, 1, 'needs_review=' + regen.post.needs_review);
  });
  resetStub();

  /* ============ (c) CASA SIN VEREDICTO: sin verificar no se entrega ============ */
  console.log('== (c) casa unverified: si no se puede verificar a Posty, no se entrega ==');
  state.characterNull = true;
  const uidUnv = await seedCasa('casa-unv@test.local');
  const unv = await makeAndCapture(uidUnv, seedIdea(uidUnv, 'unv:1', 'Posty y la semana que viene'));
  ok('(c) QA de personaje sin veredicto en la casa ⇒ needs_review=1 (en v693: 0)', () => {
    assert.ok(unv.personajeCalls >= 1, 'el QA de personaje corrió');
    assert.strictEqual(unv.post.needs_review, 1, 'needs_review=' + unv.post.needs_review);
  });
  resetStub();

  /* ============ (d) CONTROL: personaje OK ⇒ pieza limpia ============ */
  console.log('== (d) control positivo: el fix no marca todo ==');
  const uidOk = await seedCasa('casa-ok@test.local');
  const good = await makeAndCapture(uidOk, seedIdea(uidOk, 'ok:1', 'Posty y el café de la mañana'));
  ok('(d) personaje OK sin regen posterior ⇒ needs_review=0 (sin llamada extra de más)', () => {
    assert.ok(good.personajeCalls >= 1, 'el QA de personaje corrió');
    assert.strictEqual(good.post.needs_review, 0, 'needs_review=' + good.post.needs_review);
  });

  console.log(`\n✅ test-avatar-posty: ${passed} aserciones OK`);
  process.exit(0);
})().catch((e) => { console.error('❌ test-avatar-posty:', e); process.exit(1); });
