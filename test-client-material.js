'use strict';
/* =====================================================================
 * test-client-material.js — v237 "SU MATERIAL, PROMPTS CORRECTOS"
 *
 * Las fotos que el cliente le pasa a Posty se trabajan con los prompts
 * correctos y con fidelidad garantizada a SU producto:
 *  (a) TRANSPORTE: con logo + foto de producto en el álbum, la pieza de
 *      producto manda LA FOTO DEL PRODUCTO (no el logo) y la nota de
 *      roles nombra SOLO la referencia enviada (stub del transporte
 *      captura los bytes y el prompt reales del FormData).
 *  (b) RESTYLE AUTO-PICK: sin estilo manual sale un preset elegido con
 *      el fundamento (dos fundamentos distintos ⇒ picks distintos) y
 *      SIEMPRE relight/reframe — un new-scene jamás sale en restyle.
 *  (c) PRODUCT-SHOT: prompt armado por assembleImagePrompt (dirección
 *      de estilo del catálogo + cláusula de fidelidad, SIN "INSPIRADA
 *      EN") y salida 4:5 (1024x1280) en el request al generador.
 *  (d) FIDELIDAD: la visión de QA responde fidelidad_ok=false ⇒ 1
 *      reintento ⇒ segundo fallo ⇒ la pieza final ES la foto original
 *      (color medio ≈ original) con needs_review=1 y fidelity
 *      'fallback'; con fidelidad_ok=true sale el restyle sin fallback.
 *  (e) GATE DE CALIDAD: foto oscura fixture ⇒ album_quality la marca
 *      y NO nace posteo del festejo; foto buena ⇒ festejo normal con
 *      client_photo=1 y la nota de rol RESTYLE (sin contradicción).
 *  (f) SELECCIÓN POR PIEZA: la foto mapeada por photo_map (más vieja)
 *      le gana a la genérica reciente para la pieza de ese ítem.
 * Costo IA: CERO — fetch stubbeado por marcadores (patrón de la casa).
 * ===================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-clientmat-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18773';
process.env.BASE_URL = 'http://127.0.0.1:18773';
process.env.OPENAI_API_KEY = 'sk-test-fake';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- PNG helpers (sólido y tablero, para PIL: oscuro/movido/bueno) ------
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
const checkerPng = (w, h) => pngBuffer(w, h, (x, y) => (((x >> 4) + (y >> 4)) % 2 ? [235, 235, 235] : [25, 25, 25]));
function meanColor(absPath) {
  const out = execFileSync('python3', ['-c',
    'import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGB"); im.thumbnail((64, 64)); px = list(im.getdata()); n = len(px); print(",".join(str(round(sum(c[i] for c in px) / n)) for i in range(3)))',
    absPath], { encoding: 'utf8' });
  return out.trim().split(',').map(Number);
}
const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) * (v - b[i]), 0));

// --- Stub de OpenAI -------------------------------------------------------
const state = { fidelityFail: false, edits: [], genCalls: 0 };
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
  if (sys.includes('control de FIDELIDAD')) {
    return chat(state.fidelityFail
      ? { fidelidad_ok: false, detalle: 'el paquete cambió de color y la etiqueta ya no es la misma' }
      : { fidelidad_ok: true, detalle: 'mismo paquete, misma etiqueta y mismos colores que la foto original' });
  }
  if (sys.includes('FRENA EL SCROLL')) return chat({ single_subject: true, not_cluttered: true, readable_small: true, thumb_hook: true, detalle: 'un solo sujeto en primer plano' });
  if (sys.includes('control de calidad de una agencia')) return chat({ brand_ok: true, texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, headline_complete: true, headline_clear: true, anatomia_ok: true, contraste_ok: true, elementos_ok: true, detalle: 'pieza correcta' });
  if (sys.includes('guardián de marca')) return chat({ paleta_ok: true, logo_ok: true, linea_ok: true, detalle: 'paleta integrada' });
  if (sys.includes('DESLIZA')) return chat({ cover: 'El truco', slides: [{ title: 'Uno', text: 'Texto uno.' }, { title: 'Dos', text: 'Texto dos.' }, { title: 'Tres', text: 'Texto tres.' }] });
  return chat({ caption: '☕ Blend Patagonia recién tostado, como lo hacemos siempre.\n\nGranos seleccionados, tueste del día y el mismo sabor de siempre.\n\nPedilo por DM ☕', overlay: 'Blend Patagonia', hashtags: '#cafe #palermo' });
};

// --- HTTP con cookie ----------------------------------------------------
let cookie = '';
async function call(method, p, body) {
  const r = await realFetch('http://127.0.0.1:18773' + p, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
async function callRaw(p, buf, ct) {
  const r = await realFetch('http://127.0.0.1:18773' + p, {
    method: 'POST', headers: { 'Content-Type': ct, ...(cookie ? { Cookie: cookie } : {}) }, body: buf,
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs = 15000, step = 250) {
  const t0 = Date.now();
  for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > timeoutMs) return null; await sleep(step); }
}

(async () => {
  const db = require('./db');
  const deepRead = require('./deep-read');
  const imageStyles = require('./image-styles');
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18773/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  let passed = 0;
  const ok = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

  const seedUser = async (email, { name, category, ig }) => {
    const reg = await call('POST', '/api/auth/register', { email, password: 'secreto1' });
    assert.strictEqual(reg.status, 200, 'registro ' + email + ': ' + JSON.stringify(reg.json));
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    db.prepare('UPDATE users SET autopilot_enabled = 1 WHERE id = ?').run(uid); // sin rueditas: needs_review determinístico
    if (db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(uid)) {
      db.prepare('UPDATE profiles SET business_name = ?, category = ?, ig_username = ? WHERE user_id = ?').run(name, category, ig, uid);
    } else {
      db.prepare('INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (?,?,?,?)').run(uid, name, category, ig);
    }
    return uid;
  };
  const seedDigest = (uid, digest) => {
    db.prepare(`INSERT INTO client_digest (user_id, digest_json, hash, version) VALUES (?,?,?,3)
      ON CONFLICT(user_id) DO UPDATE SET digest_json = excluded.digest_json, hash = excluded.hash, version = 3`)
      .run(uid, JSON.stringify(digest), 'testhash' + uid);
  };
  const writeMedia = (name, buf) => { fs.writeFileSync(path.join(MEDIA_DIR, name), buf); return '/media/' + name; };
  const seedPost = (uid, imagePath, extra = {}) => db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, sales_intent, week_key, needs_review)
    VALUES (?,?,?,?,'draft','image',?,?, '2026-10-19', 0)`)
    .run(uid, imagePath, extra.caption || 'Promo de la semana, como siempre.', '#test', extra.tipo || 'foto', extra.sales || 'venta').lastInsertRowid;

  /* ================= USUARIO A: café (transporte, product-shot, restyle, fidelidad) ================= */
  const uidA = await seedUser('material-a@test.local', { name: 'Café Aroma', category: 'cafeteria', ig: 'cafearoma' });
  // Fotos con identidad cromática propia (el test compara bytes y colores).
  const logoBuf = solidPng(400, 400, [250, 200, 40]);
  const prodBuf = solidPng(1024, 1280, [30, 160, 60]);       // el PRODUCTO (verde)
  const genericBuf = solidPng(1024, 1280, [120, 120, 200]);  // foto genérica reciente (azulada)
  const logoPath = writeMedia('logo-cafe.png', logoBuf);
  const prodPath = writeMedia('prod-blend.png', prodBuf);
  const genericPath = writeMedia('generica.png', genericBuf);
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, created_at) VALUES (?,?,?,?)`).run(uidA, logoPath, 'logo', '2026-09-01 10:00:00');
  // La MAPEADA es la más VIEJA; la genérica, la más nueva (f: la recencia no manda).
  const prodAsset = db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag, album_quality, created_at) VALUES (?,?, 'photo', 'producto', 'ok', '2026-10-01 10:00:00')`).run(uidA, prodPath).lastInsertRowid;
  db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag, album_quality, created_at) VALUES (?,?, 'photo', 'producto', 'ok', '2026-10-18 10:00:00')`).run(uidA, genericPath);
  const prodKey = deepRead.photoContentKey(path.join(MEDIA_DIR, 'prod-blend.png'));
  assert.ok(prodKey, 'photoContentKey de la foto del producto');
  seedDigest(uidA, {
    nombre: 'Café Aroma', categoria: 'cafeteria',
    productos: [{ nombre: 'Blend Patagonia', precio: '$12.000' }],
    servicios: [], estrella: { nombre: 'Blend Patagonia' },
    photo_map: { entries: { [prodKey]: { item: 'Blend Patagonia', confianza: 0.95 } }, at: new Date().toISOString() },
    tono: 'cálido y artesanal', fuentes: {},
  });

  console.log('== (a)+(f) Transporte honesto y selección por pieza ==');
  const ideaId = db.prepare(`INSERT INTO posty_ideas (user_id, week_key, source, angle_key, title, why, format, brief, status)
    VALUES (?,?,?,?,?,?,?,?, 'pending')`).run(uidA, '2026-10-12', 'winner', 'mat:blend', 'Blend Patagonia recién tostado', 'Es el producto estrella', 'post', 'brief').lastInsertRowid;
  const editsBefore = state.edits.length;
  const make = await call('POST', `/api/ideas/${ideaId}/make`, {});
  assert.strictEqual(make.status, 200, 'make: ' + JSON.stringify(make.json));
  const makeEdits = state.edits.slice(editsBefore);
  assert.ok(makeEdits.length >= 1, 'hubo al menos una llamada al generador');
  const firstEdit = makeEdits[0];
  ok('(f) la pieza del Blend usa la foto MAPEADA (vieja), no la genérica reciente', () => {
    assert.ok(firstEdit.imageBytes && firstEdit.imageBytes.equals(prodBuf), 'los bytes enviados no son los de la foto mapeada del producto');
  });
  ok('(a) la referencia enviada NO es el logo (aunque existe asset logo)', () => {
    assert.ok(!firstEdit.imageBytes.equals(logoBuf), 'se envió el logo como referencia');
    assert.ok(!firstEdit.imageBytes.equals(genericBuf), 'se envió la foto genérica');
  });
  ok('(a) la nota de roles nombra SOLO la referencia enviada (Image 1, sin Image 2)', () => {
    assert.ok(firstEdit.prompt.includes('Image 1:'), 'falta Image 1 en la nota: ' + firstEdit.prompt.slice(-400));
    assert.ok(!firstEdit.prompt.includes('Image 2:'), 'la nota describe una segunda referencia fantasma');
    assert.ok(/REAL product/i.test(firstEdit.prompt), 'la nota no declara el rol producto');
  });
  ok('(a) el prompt lleva la cláusula de fidelidad (material del cliente)', () => {
    assert.ok(firstEdit.prompt.includes('FIDELITY TO THE CLIENT'), 'falta FIDELITY_CLAUSE');
  });

  console.log('== (c) Product-shot: pick completo, fórmula oficial, 4:5 ==');
  state.fidelityFail = false;
  const editsBefore2 = state.edits.length;
  const ps = await call('POST', '/api/product-shot', { refs: [genericPath, prodPath], idea: 'Promo del Blend Patagonia', salesIntent: 'venta' });
  assert.strictEqual(ps.status, 200, 'product-shot: ' + JSON.stringify(ps.json));
  assert.ok(ps.json && ps.json.ok, 'product-shot ok: ' + JSON.stringify(ps.json));
  const psEdit = state.edits[editsBefore2];
  ok('(c) la salida es 4:5 (size 1024x1280), no el cuadrado de antes', () => assert.strictEqual(psEdit.size, '1024x1280'));
  ok('(c) la referencia que viaja es la foto del producto (el logo no tapa, el orden del body no manda)', () => {
    assert.ok(psEdit.imageBytes.equals(prodBuf) || psEdit.imageBytes.equals(genericBuf), 'ref inesperada');
  });
  ok('(c) prompt por la fórmula: dirección de estilo del catálogo + fidelidad, SIN "INSPIRADA EN"', () => {
    assert.ok(psEdit.prompt.includes('STYLE DIRECTION'), 'falta STYLE DIRECTION');
    assert.ok(psEdit.prompt.includes('FIDELITY TO THE CLIENT'), 'falta la cláusula de fidelidad');
    assert.ok(!/INSPIRADA EN/i.test(psEdit.prompt), 'sigue el lenguaje INSPIRADA EN');
    assert.ok(ps.json.style, 'la respuesta declara el estilo elegido: ' + JSON.stringify(ps.json));
    assert.ok(imageStyles.editModeOf(ps.json.style) !== 'new-scene', 'el pick de product-shot es new-scene: ' + ps.json.style);
  });
  ok('(c) fidelidad verificada y reportada (passed con stub fiel)', () => assert.strictEqual(ps.json.fidelity, 'passed'));

  console.log('== (b) Restyle: auto-pick gobernado (sin estilo manual) ==');
  const postB = seedPost(uidA, prodPath);
  const rsB = await call('POST', `/api/drafts/${postB}/photo-restyle`, {});
  assert.strictEqual(rsB.status, 200, 'restyle: ' + JSON.stringify(rsB.json));
  ok('(b) sin estilo manual hay auto-pick presente y declarado', () => {
    assert.ok(rsB.json.style, 'sin style en la respuesta');
    assert.ok(rsB.json.reason, 'sin reason en la respuesta');
  });
  ok('(b) el auto-pick es relight/reframe — new-scene JAMÁS en restyle', () => {
    const mode = imageStyles.editModeOf(rsB.json.style);
    assert.ok(mode === 'relight' || mode === 'reframe', `edit_mode=${mode} para ${rsB.json.style}`);
  });
  ok('(d) con fidelidad OK sale el restyle generado, sin needs_review', () => {
    assert.strictEqual(rsB.json.fidelity, 'passed');
    const row = db.prepare('SELECT image_path, needs_review FROM posts WHERE id = ?').get(postB);
    assert.strictEqual(row.needs_review, 0);
    const mean = meanColor(path.join(MEDIA_DIR, path.basename(row.image_path)));
    const gen = GEN_COLORS[0]; // la primera generación del stub tras el make… se verifica por distancia relativa
    const dOrig = dist(mean, [30, 160, 60]);
    assert.ok(dOrig > 60, 'la imagen final sigue siendo la original (dist ' + dOrig + '): no salió el restyle');
    void gen;
  });

  console.log('== (d) Fidelidad: infiel ⇒ reintento ⇒ fallback a la foto original ==');
  state.fidelityFail = true;
  const postD = seedPost(uidA, prodPath);
  const editsBeforeD = state.edits.length;
  const rsD = await call('POST', `/api/drafts/${postD}/photo-restyle`, {});
  assert.strictEqual(rsD.status, 200, 'restyle infiel: ' + JSON.stringify(rsD.json));
  const editsD = state.edits.slice(editsBeforeD);
  ok('(d) hubo EXACTAMENTE 1 reintento (2 generaciones en total)', () => assert.strictEqual(editsD.length, 2, 'generaciones: ' + editsD.length));
  ok('(d) el reintento lleva la cláusula reforzada', () => assert.ok(editsD[1].prompt.includes('FIDELITY CORRECTION'), 'el segundo prompt no refuerza'));
  ok('(d) fidelity=fallback, needs_review=1 y la imagen final ES la original (color medio)', () => {
    assert.strictEqual(rsD.json.fidelity, 'fallback');
    const row = db.prepare('SELECT image_path, needs_review FROM posts WHERE id = ?').get(postD);
    assert.strictEqual(row.needs_review, 1);
    const mean = meanColor(path.join(MEDIA_DIR, path.basename(row.image_path)));
    const dOrig = dist(mean, [30, 160, 60]);
    assert.ok(dOrig < 45, 'la imagen final no es la foto original (dist al verde original: ' + dOrig + ', media ' + mean.join(',') + ')');
  });
  state.fidelityFail = false;

  console.log('== (b2) Dos fundamentos distintos ⇒ picks coherentes distintos ==');
  const mkRubroUser = async (email, name, productos, estrella) => {
    const uid = await seedUser(email, { name, category: 'gastronomía', ig: email.split('@')[0] });
    writeMedia(`base-${uid}.png`, solidPng(1024, 1280, [200, 190, 170]));
    const basePath = `/media/base-${uid}.png`;
    db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag, album_quality) VALUES (?,?,'photo','producto','ok')`).run(uid, basePath);
    seedDigest(uid, { nombre: name, categoria: 'gastronomía', productos, servicios: [], estrella: { nombre: estrella }, tono: 'cercano', fuentes: {} });
    const postId = seedPost(uid, basePath);
    const rs = await call('POST', `/api/drafts/${postId}/photo-restyle`, {});
    assert.strictEqual(rs.status, 200, 'restyle ' + email + ': ' + JSON.stringify(rs.json));
    return rs.json.style;
  };
  const pickSushi = await mkRubroUser('material-sushi@test.local', 'Sushi Koi', [{ nombre: 'Sushi de autor' }, { nombre: 'Nigiri de salmón' }, { nombre: 'Maki rolls' }], 'Sushi de autor');
  const pickParrilla = await mkRubroUser('material-parrilla@test.local', 'La Parrilla de Juan', [{ nombre: 'Asado criollo' }, { nombre: 'Provoleta a la parrilla' }, { nombre: 'Vacío al asador' }], 'Asado criollo');
  ok('(b) sushi y parrilla eligen presets DISTINTOS (el fundamento manda)', () => {
    assert.ok(pickSushi && pickParrilla, `picks: sushi=${pickSushi} parrilla=${pickParrilla}`);
    assert.notStrictEqual(pickSushi, pickParrilla, `ambos eligieron ${pickSushi}`);
  });
  ok('(b) ambos picks son editables (relight/reframe)', () => {
    for (const c of [pickSushi, pickParrilla]) {
      const m = imageStyles.editModeOf(c);
      assert.ok(m === 'relight' || m === 'reframe', `${c} → ${m}`);
    }
  });
  console.log('    picks: café=' + rsB.json.style + ' sushi=' + pickSushi + ' parrilla=' + pickParrilla);

  /* ================= USUARIO E: gate de calidad + festejo ================= */
  console.log('== (e) Gate de calidad al subir y festejo ==');
  const uidE = await seedUser('material-e@test.local', { name: 'Flores del Barrio', category: 'florería', ig: 'floresdelbarrio' });
  seedDigest(uidE, { nombre: 'Flores del Barrio', categoria: 'florería', productos: [{ nombre: 'Ramo de peonías' }], servicios: [], estrella: { nombre: 'Ramo de peonías' }, fuentes: {} });
  const darkBuf = solidPng(800, 1000, [8, 8, 8]);
  const upDark = await callRaw('/api/album/photo', darkBuf, 'image/png');
  assert.strictEqual(upDark.status, 200, 'upload oscuro: ' + JSON.stringify(upDark.json));
  const darkQuality = await waitFor(() => {
    const r = db.prepare('SELECT album_quality FROM assets WHERE id = ?').get(upDark.json.id);
    return r && r.album_quality ? r.album_quality : null;
  });
  ok('(e) la foto oscura queda marcada en album_quality (medición determinística)', () => {
    assert.ok(darkQuality && darkQuality.includes('oscura'), 'album_quality=' + darkQuality);
  });
  await sleep(2500); // margen para que un festejo indebido hubiera nacido
  ok('(e) con foto mala NO nace posteo del festejo', () => {
    const n = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND source = 'album'`).get(uidE).c;
    assert.strictEqual(n, 0, 'posteos del festejo: ' + n);
  });
  const goodBuf = checkerPng(1024, 1280);
  const editsBeforeE = state.edits.length;
  const upGood = await callRaw('/api/album/photo', goodBuf, 'image/png');
  assert.strictEqual(upGood.status, 200, 'upload bueno: ' + JSON.stringify(upGood.json));
  const celebPost = await waitFor(() => db.prepare(`SELECT * FROM posts WHERE user_id = ? AND source = 'album' ORDER BY id DESC LIMIT 1`).get(uidE), 30000);
  ok('(e) con foto buena el festejo nace y es client_photo=1 (pasó la fidelidad)', () => {
    assert.ok(celebPost, 'no nació el posteo del festejo');
    assert.strictEqual(celebPost.client_photo, 1, 'client_photo=' + celebPost.client_photo);
  });
  ok('(e) el festejo viaja con rol RESTYLE (la nota y la idea ya no se contradicen)', () => {
    const celebEdit = state.edits.slice(editsBeforeE).find((e) => e.imageBytes && e.imageBytes.equals(goodBuf));
    assert.ok(celebEdit, 'no se capturó la generación del festejo con la foto buena como referencia');
    assert.ok(celebEdit.prompt.includes('the base photo — keep the EXACT same product/subject'), 'la nota no es la de restyle: …' + celebEdit.prompt.slice(-300));
    assert.ok(!celebEdit.prompt.includes('NEW scene'), 'la nota pide escena nueva (la contradicción de v236)');
  });

  console.log(`\n✅ test-client-material: ${passed} aserciones OK`);
  process.exit(0);
})().catch((e) => { console.error('❌ test-client-material:', e); process.exit(1); });
