'use strict';
/* =====================================================================
 * test-character-lock.js — v239 "CHARACTER LOCK DE POSTY"
 *
 * El protagonista recurrente de una cuenta NO se inventa: ni el robot
 * genérico de la casa (posteos 413/414 del 2026-10-19: visor LED en
 * vez de Posty), ni una mascota rediseñada, ni OTRA persona en el
 * feed de un cliente.
 *  (a) CASA (@posty.hacetodo): la planificación de transporte elige
 *      el avatar oficial (public/ai-avatar.png) por encima del logo y
 *      de las fotos del álbum; el prompt lleva la cláusula de
 *      identidad de personaje; con el QA de personaje OK la pieza
 *      sale limpia.
 *  (b) CLIENTE CON MASCOTA (ref desde su perfil visual): viaja ESA
 *      ref por encima del logo; QA "personaje distinto" ⇒ EXACTAMENTE
 *      1 reintento ⇒ needs_review=1 (la pieza no se entrega como
 *      buena).
 *  (c) CLIENTE CON PERSONA protagonista (la dueña, siempre en su
 *      feed): la misma garantía de transporte + cláusula.
 *  (d) SIN protagonista: transporte y prompt idénticos a v237 (el
 *      producto manda, sin cláusula ni QA de personaje).
 *  (e) Transporte unitario (prioritizeRefPairs con protagonist).
 *  (f) REGLA DE TITULARES (Valentino 2026-10-19): pregunta cortada ⇒
 *      "…" y sin "?"; pregunta que entra ⇒ "?"; no-pregunta intacta;
 *      detector truncatedClosedQuestion + gate en captionPasses;
 *      capHeadlineWords del demo con el mismo criterio.
 * Costo IA: CERO — fetch stubbeado por marcadores (patrón de la casa).
 * ===================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-charlock-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18774';
process.env.BASE_URL = 'http://127.0.0.1:18774';
process.env.OPENAI_API_KEY = 'sk-test-fake';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- PNG helpers (mismo patrón que test-client-material) ---------------
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
const state = { characterOk: true, edits: [], personajeCalls: 0, genCalls: 0 };
const GEN_COLORS = [[226, 44, 44], [44, 44, 226], [226, 178, 44], [44, 200, 160], [160, 44, 200], [226, 120, 44]];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.includes('api.openai.com')) return realFetch(url, opts);
  const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };
  const chat = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }], usage }), text: async () => JSON.stringify(obj) });
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
    return chat(state.characterOk
      ? { personaje_ok: true, detalle: 'mismo protagonista: misma cara pintada, mismos ojos y su accesorio firma igual' }
      : { personaje_ok: false, detalle: 'el protagonista cambió: la cara ahora es un visor LED genérico y perdió sus marcas' });
  }
  if (sys.includes('control de FIDELIDAD')) return chat({ fidelidad_ok: true, detalle: 'mismo producto, misma etiqueta' });
  if (sys.includes('FRENA EL SCROLL')) return chat({ single_subject: true, not_cluttered: true, readable_small: true, thumb_hook: true, detalle: 'un solo sujeto en primer plano' });
  if (sys.includes('control de calidad de una agencia')) return chat({ brand_ok: true, texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, headline_complete: true, headline_clear: true, anatomia_ok: true, contraste_ok: true, elementos_ok: true, detalle: 'pieza correcta' });
  if (sys.includes('guardián de marca')) return chat({ paleta_ok: true, logo_ok: true, linea_ok: true, detalle: 'paleta integrada' });
  if (sys.includes('DESLIZA')) return chat({ cover: 'El truco', slides: [{ title: 'Uno', text: 'Texto uno.' }, { title: 'Dos', text: 'Texto dos.' }, { title: 'Tres', text: 'Texto tres.' }] });
  return chat({ caption: '☕ Blend Patagonia recién tostado, como lo hacemos siempre.\n\nGranos seleccionados, tueste del día y el mismo sabor de siempre.\n\nPedilo por DM ☕', overlay: 'Blend Patagonia', hashtags: '#cafe #palermo' });
};

// --- HTTP con cookie ------------------------------------------------------
let cookie = '';
async function call(method, p, body) {
  const r = await realFetch('http://127.0.0.1:18774' + p, {
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
  const deepRead = require('./deep-read');
  const refRoles = require('./ref-roles');
  const generator = require('./generator');
  const demoCaptions = require('./demo-captions');
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18774/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  let passed = 0;
  const ok = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };
  const words = (s) => String(s || '').split(' ').filter(Boolean).length;

  /* ================= (e)+(f) Unidades puras ================= */
  console.log('== (e) Transporte unitario: el protagonista manda ==');
  ok('(e) prioritizeRefPairs con protagonist: character le gana a product, photo y logo', () => {
    const pairs = [
      { ref: 'logo.png', role: 'logo' },
      { ref: 'foto.jpg', role: 'photo' },
      { ref: 'prod.jpg', role: 'product' },
      { ref: 'personaje.png', role: 'character' },
    ];
    const withLock = refRoles.prioritizeRefPairs(pairs, { protagonist: true });
    assert.strictEqual(withLock[0].ref, 'personaje.png', JSON.stringify(withLock));
    const sinLock = refRoles.prioritizeRefPairs(pairs, {});
    assert.strictEqual(sinLock[0].ref, 'prod.jpg', 'sin lock manda el producto (v237 intacto): ' + JSON.stringify(sinLock));
    const brand = refRoles.prioritizeRefPairs(pairs, { brandPiece: true });
    assert.strictEqual(brand[0].ref, 'logo.png', 'brandPiece sigue funcionando: ' + JSON.stringify(brand));
  });
  ok('(e) las cláusulas de identidad existen y nombran el defecto (visor LED)', () => {
    assert.ok(refRoles.CHARACTER_CLAUSE.includes('CHARACTER IDENTITY LOCK'));
    assert.ok(refRoles.CHARACTER_CLAUSE.includes('LED visor'));
    assert.ok(refRoles.CHARACTER_REINFORCE.includes('CHARACTER CORRECTION'));
  });

  console.log('== (f) Titulares: pregunta cortada = "…", jamás cierre ==');
  ok('(f) el caso vivo 413: pregunta larga ⇒ "…" y sin "?"', () => {
    const out = generator.makeHeadline('¿Listo para que tu Instagram sea el alma de la fiesta este Halloween?', 6, 70);
    assert.ok(out.endsWith('…'), 'debe terminar con …: ' + out);
    assert.ok(!out.endsWith('?'), 'no debe cerrar con ?: ' + out);
    assert.ok(words(out) <= 6, '≤6 palabras: ' + out);
    assert.ok(out.includes('Instagram sea'), 'conserva el arranque de la pregunta: ' + out);
  });
  ok('(f) pregunta que entra entera ⇒ "?" normal, sin "…"', () => {
    const out = generator.makeHeadline('¿Ya probaste nuestro blend?', 6, 70);
    assert.ok(out.endsWith('?'), 'cierra con ?: ' + out);
    assert.ok(!out.includes('…'), 'sin puntos suspensivos: ' + out);
  });
  ok('(f) titular que NO es pregunta ⇒ sin cambios (ni "…", ni "?")', () => {
    const out = generator.makeHeadline('Ramos frescos, hechos hoy en el local del barrio', 6, 70);
    assert.ok(!out.includes('…') && !out.endsWith('?'), 'no-pregunta intacta: ' + out);
    const price = generator.makeHeadline('La docena de facturas a $12.500 recién salida del horno', 6, 70, 'gastronomia');
    assert.ok(price.includes('$12.500') && !price.includes('…'), 'precio entero intacto: ' + price);
  });
  ok('(f) detector truncatedClosedQuestion: caza el patrón prohibido y solo ese', () => {
    const full = '¿Listo para que tu Instagram sea el alma de la fiesta este Halloween?';
    assert.strictEqual(generator.truncatedClosedQuestion('¿listo para que tu Instagram sea?', full), true);
    assert.strictEqual(generator.truncatedClosedQuestion('¿listo para que tu Instagram sea…', full), false);
    assert.strictEqual(generator.truncatedClosedQuestion(full, full), false);
    assert.strictEqual(generator.truncatedClosedQuestion('Ramos frescos, hechos hoy', full), false);
  });
  ok('(f) captionPasses RECHAZA la pregunta cortada y cerrada (contra el brief)', () => {
    const caption = '¿Listo para que tu Instagram sea?\n\nDejá que Posty se encargue de crear y programar tu contenido de Halloween.\n\nEscribime por DM y comenzá hoy.';
    const chk = generator.captionPasses(caption, { business: 'Posty', topic: '¿Listo para que tu Instagram sea el alma de la fiesta este Halloween?' });
    assert.strictEqual(chk.ok, false, 'debió rechazar: ' + JSON.stringify(chk));
    assert.ok(/pregunta cortada/.test(chk.reason), 'motivo: ' + chk.reason);
  });
  ok('(f) captionPasses ACEPTA la pregunta completa y la cortada con "…"', () => {
    const base = '\n\nDejá que Posty se encargue de crear y programar tu contenido de Halloween.\n\nEscribime por DM y comenzá hoy.';
    const topic = '¿Listo para que tu Instagram sea el alma de la fiesta este Halloween?';
    const completa = generator.captionPasses('¿Listo para que tu Instagram sea el alma de la fiesta este Halloween?' + base, { business: 'Posty', topic });
    assert.strictEqual(completa.ok, true, 'la completa debe pasar: ' + JSON.stringify(completa));
    const cortada = generator.captionPasses('¿Listo para que tu Instagram sea…' + base, { business: 'Posty', topic });
    assert.strictEqual(cortada.ok, true, 'la cortada con … debe pasar: ' + JSON.stringify(cortada));
  });
  ok('(f) capHeadlineWords (demo): pregunta cortada ⇒ "…"; la que entra ⇒ "?"', () => {
    const cut = demoCaptions.capHeadlineWords('¿Ya probaste nuestro servicio estrella de la casa nueva?', 6);
    assert.ok(cut.endsWith('…') && !cut.endsWith('?') && words(cut) <= 6, 'cortada: ' + cut);
    const full = demoCaptions.capHeadlineWords('¿Ya probaste nuestro blend?', 6);
    assert.strictEqual(full, '¿Ya probaste nuestro blend?');
    const notQ = demoCaptions.capHeadlineWords('Turnos de octubre: agenda abierta para vos', 6);
    assert.strictEqual(notQ, 'Turnos de octubre', 'no-pregunta intacta: ' + notQ);
  });

  /* ================= Fixtures de cuentas ================= */
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
  const seedVisualProfile = (uid, profile) => {
    db.prepare(`INSERT INTO ig_visual_style (user_id, profile_json) VALUES (?,?)
      ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json`).run(uid, JSON.stringify(profile));
  };
  const seedIdea = (uid, angleKey, title) => db.prepare(`INSERT INTO posty_ideas (user_id, week_key, source, angle_key, title, why, format, brief, status)
    VALUES (?,?,?,?,?,?,?,?, 'pending')`).run(uid, '2026-10-12', 'winner', angleKey, title, 'Señal real del negocio', 'post', 'brief').lastInsertRowid;
  const makeAndCapture = async (uid, ideaId) => {
    const editsBefore = state.edits.length;
    const persBefore = state.personajeCalls;
    const r = await call('POST', `/api/ideas/${ideaId}/make`, {});
    assert.strictEqual(r.status, 200, 'make: ' + JSON.stringify(r.json));
    const post = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(uid);
    assert.ok(post, 'nació el posteo');
    return { post, edits: state.edits.slice(editsBefore), personajeCalls: state.personajeCalls - persBefore };
  };

  const logoBuf = solidPng(400, 400, [250, 200, 40]);
  const genericBuf = solidPng(1024, 1280, [120, 120, 200]);

  /* ================= (a) LA CASA: @posty.hacetodo ================= */
  console.log('== (a) La casa: el avatar oficial viaja y manda ==');
  const avatarBuf = fs.readFileSync(path.join(__dirname, 'public', 'ai-avatar.png'));
  const uidCasa = await seedUser('casa@test.local', { name: 'Posty.', category: 'profesionales', ig: 'posty.hacetodo' });
  writeMedia('logo-casa.png', logoBuf);
  writeMedia('generica-casa.jpg', genericBuf);
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, created_at) VALUES (?,?,?,?)`).run(uidCasa, '/media/logo-casa.png', 'logo', '2026-09-01 10:00:00');
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag, album_quality, created_at) VALUES (?,?, 'photo', 'otro', 'ok', '2026-10-18 10:00:00')`).run(uidCasa, '/media/generica-casa.jpg');
  seedDigest(uidCasa, { nombre: 'Posty.', categoria: 'profesionales', productos: [], servicios: [{ nombre: 'Community manager con IA' }], protagonista: 'Posty, el robot celeste', fuentes: {} });
  await login('casa@test.local');
  state.characterOk = true;
  const casa1 = await makeAndCapture(uidCasa, seedIdea(uidCasa, 'casa:1', 'Tu semana de Instagram, armada sola'));
  ok('(a) la referencia que viaja es el AVATAR OFICIAL (no el logo, no la foto genérica)', () => {
    assert.ok(casa1.edits.length >= 1, 'hubo generación');
    assert.ok(casa1.edits[0].imageBytes && casa1.edits[0].imageBytes.equals(avatarBuf), 'los bytes enviados no son los de ai-avatar.png');
  });
  ok('(a) el prompt lleva la cláusula de identidad + la nota de rol character (solo la ref enviada)', () => {
    assert.ok(casa1.edits[0].prompt.includes('CHARACTER IDENTITY LOCK'), 'falta CHARACTER_CLAUSE');
    assert.ok(casa1.edits[0].prompt.includes('recurring character/subject'), 'la nota no declara el rol character: …' + casa1.edits[0].prompt.slice(-350));
    assert.ok(!casa1.edits[0].prompt.includes('Image 2:'), 'la nota describe una segunda referencia fantasma');
  });
  ok('(a) QA de personaje OK ⇒ pieza limpia (needs_review=0) y el QA corrió', () => {
    assert.ok(casa1.personajeCalls >= 1, 'el QA de personaje no corrió');
    assert.strictEqual(casa1.post.needs_review, 0, 'needs_review=' + casa1.post.needs_review);
  });
  state.characterOk = false;
  const casa2 = await makeAndCapture(uidCasa, seedIdea(uidCasa, 'casa:2', 'Halloween sin quedarte sin posteos'));
  ok('(a) QA "personaje distinto" ⇒ EXACTAMENTE 1 reintento con la cláusula reforzada', () => {
    assert.strictEqual(casa2.edits.length, 2, 'generaciones: ' + casa2.edits.length);
    assert.ok(casa2.edits[1].prompt.includes('CHARACTER CORRECTION'), 'el reintento no refuerza la identidad');
    assert.ok(casa2.edits[1].imageBytes.equals(avatarBuf), 'el reintento también viaja con el avatar');
  });
  ok('(a) doble fallo de identidad ⇒ needs_review=1 (jamás se entrega como buena)', () => {
    assert.strictEqual(casa2.post.needs_review, 1, 'needs_review=' + casa2.post.needs_review);
  });
  state.characterOk = true;

  /* ================= (b) CLIENTE CON MASCOTA ================= */
  console.log('== (b) Cliente con mascota propia: su ref manda sobre el logo ==');
  const uidM = await seedUser('mascota@test.local', { name: 'Tienda Zorro', category: 'indumentaria', ig: 'tiendazorro' });
  const zorroBuf = solidPng(1024, 1280, [240, 120, 30]);
  const zorroAbs = path.join(MEDIA_DIR, 'feed-zorro.jpg');
  fs.writeFileSync(zorroAbs, zorroBuf);
  writeMedia('logo-zorro.png', logoBuf);
  writeMedia('generica-zorro.jpg', genericBuf);
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, created_at) VALUES (?,?,?,?)`).run(uidM, '/media/logo-zorro.png', 'logo', '2026-09-01 10:00:00');
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag, album_quality, created_at) VALUES (?,?, 'photo', 'otro', 'ok', '2026-10-18 10:00:00')`).run(uidM, '/media/generica-zorro.jpg');
  seedVisualProfile(uidM, {
    recurring_subject: 'una mascota zorro de peluche naranja con pañuelo verde',
    subject_always_present: true, face_frequency: 'a veces',
    palette: ['#F0781E'], composition: 'mascota centrada', mood: 'juguetón',
    ref_paths: [zorroAbs],
  });
  seedDigest(uidM, { nombre: 'Tienda Zorro', categoria: 'indumentaria', productos: [{ nombre: 'Buzo Zorro' }], servicios: [], protagonista: 'el zorro de peluche', fuentes: {} });
  await login('mascota@test.local');
  state.characterOk = true;
  const mas1 = await makeAndCapture(uidM, seedIdea(uidM, 'mascota:1', 'Buzo Zorro recién llegado'));
  ok('(b) viaja la ref de SU mascota (no el logo, no la genérica) y el prompt lleva el lock', () => {
    assert.ok(mas1.edits[0].imageBytes && mas1.edits[0].imageBytes.equals(zorroBuf), 'los bytes no son los de la mascota');
    assert.ok(mas1.edits[0].prompt.includes('CHARACTER IDENTITY LOCK'), 'falta la cláusula');
    assert.strictEqual(mas1.post.needs_review, 0);
  });
  state.characterOk = false;
  const mas2 = await makeAndCapture(uidM, seedIdea(uidM, 'mascota:2', 'El zorro presenta la liquidación'));
  ok('(b) mascota cambiada ⇒ reintento ⇒ needs_review=1', () => {
    assert.strictEqual(mas2.edits.length, 2, 'generaciones: ' + mas2.edits.length);
    assert.strictEqual(mas2.post.needs_review, 1, 'needs_review=' + mas2.post.needs_review);
  });
  state.characterOk = true;

  /* ================= (c) CLIENTE CON PERSONA PROTAGONISTA ================= */
  console.log('== (c) Cliente con persona protagonista: jamás inventar otra persona ==');
  const uidP = await seedUser('persona@test.local', { name: 'Estética Luma', category: 'belleza', ig: 'esteticaluma' });
  const duenaBuf = solidPng(1024, 1280, [90, 60, 140]);
  const duenaAbs = path.join(MEDIA_DIR, 'feed-duena.jpg');
  fs.writeFileSync(duenaAbs, duenaBuf);
  writeMedia('logo-luma.png', logoBuf);
  writeMedia('generica-luma.jpg', genericBuf);
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, created_at) VALUES (?,?,?,?)`).run(uidP, '/media/logo-luma.png', 'logo', '2026-09-01 10:00:00');
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag, album_quality, created_at) VALUES (?,?, 'photo', 'otro', 'ok', '2026-10-18 10:00:00')`).run(uidP, '/media/generica-luma.jpg');
  seedVisualProfile(uidP, {
    recurring_subject: 'la dueña del local, una mujer de pelo con rulos oscuros',
    subject_always_present: true, face_frequency: 'siempre',
    palette: ['#5A3C8C'], composition: 'la dueña hablando a cámara', mood: 'cercano',
    ref_paths: [duenaAbs],
  });
  seedDigest(uidP, { nombre: 'Estética Luma', categoria: 'belleza', productos: [], servicios: [{ nombre: 'Limpieza facial' }], protagonista: 'la dueña', fuentes: {} });
  await login('persona@test.local');
  state.characterOk = true;
  const per1 = await makeAndCapture(uidP, seedIdea(uidP, 'persona:1', 'Limpieza facial paso a paso'));
  ok('(c) viaja la foto de SU dueña como referencia del protagonista', () => {
    assert.ok(per1.edits[0].imageBytes && per1.edits[0].imageBytes.equals(duenaBuf), 'los bytes no son los de la foto de la dueña');
    assert.ok(per1.edits[0].prompt.includes('CHARACTER IDENTITY LOCK'), 'falta la cláusula');
    assert.ok(per1.personajeCalls >= 1, 'el QA de personaje no corrió para la persona');
    assert.strictEqual(per1.post.needs_review, 0);
  });

  /* ================= (d) SIN PROTAGONISTA: v237 intacto ================= */
  console.log('== (d) Sin protagonista recurrente: el pipeline de v237 no cambia ==');
  const uidC = await seedUser('cafe@test.local', { name: 'Café Aroma', category: 'cafeteria', ig: 'cafearoma' });
  const prodBuf = solidPng(1024, 1280, [30, 160, 60]);
  const prodPath = writeMedia('prod-blend.png', prodBuf);
  writeMedia('logo-cafe.png', logoBuf);
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, created_at) VALUES (?,?,?,?)`).run(uidC, '/media/logo-cafe.png', 'logo', '2026-09-01 10:00:00');
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag, album_quality, created_at) VALUES (?,?, 'photo', 'producto', 'ok', '2026-10-01 10:00:00')`).run(uidC, prodPath);
  const prodKey = deepRead.photoContentKey(path.join(MEDIA_DIR, 'prod-blend.png'));
  assert.ok(prodKey, 'photoContentKey del producto');
  seedDigest(uidC, {
    nombre: 'Café Aroma', categoria: 'cafeteria',
    productos: [{ nombre: 'Blend Patagonia', precio: '$12.000' }], servicios: [],
    photo_map: { entries: { [prodKey]: { item: 'Blend Patagonia', confianza: 0.95 } }, at: new Date().toISOString() },
    fuentes: {},
  });
  await login('cafe@test.local');
  const cafe1 = await makeAndCapture(uidC, seedIdea(uidC, 'cafe:1', 'Blend Patagonia recién tostado'));
  ok('(d) viaja la foto del PRODUCTO (como en v237) y NO hay cláusula ni QA de personaje', () => {
    assert.ok(cafe1.edits[0].imageBytes && cafe1.edits[0].imageBytes.equals(prodBuf), 'los bytes no son los del producto');
    assert.ok(!cafe1.edits[0].prompt.includes('CHARACTER IDENTITY LOCK'), 'una pieza sin protagonista no lleva el lock');
    assert.strictEqual(cafe1.personajeCalls, 0, 'el QA de personaje no debe correr sin protagonista');
  });

  console.log(`\n✅ test-character-lock: ${passed} aserciones OK`);
  process.exit(0);
})().catch((e) => { console.error('❌ test-character-lock:', e); process.exit(1); });
