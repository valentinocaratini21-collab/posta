'use strict';
/* =====================================================================
 * test-client-ingest.js — Gaps 3, 7 y 10 (auditoría de material del
 * cliente, 2026-10-25) + la puerta de subida del chat.
 *
 *  (10) INGESTA SANA: toda foto que entra (álbum, tira de medios, chat)
 *       se normaliza UNA vez: orientación EXIF aplicada + JPEG. Un HEIC
 *       se transcodifica por la vía ffmpeg (verificado además a mano
 *       con una muestra HEIC real 1440×960 → JPEG).
 *  (3)  FALLBACK DE FIDELIDAD: si la fidelidad cae al fallback, la
 *       imagen entregada ES la foto cruda del cliente y sale SIEMPRE
 *       a 1080×1350 (4:5) con foco + grade, haya o no titular.
 *  (7)  «MEJORAR FOTO»: trabaja sobre la BASE LIMPIA (sin el titular
 *       quemado) y recompone el titular por código al terminar.
 *  (E3) POST /api/media guardaba la foto del chat: el handler moría por
 *       TDZ (`kind` usado antes de declararse) → 500 siempre. La foto
 *       del chat ahora SÍ llega a la librería.
 * Costo IA: CERO — fetch stubbeado (patrón de la casa).
 * ===================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-ingest-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18774';
process.env.BASE_URL = 'http://127.0.0.1:18774';
process.env.OPENAI_API_KEY = 'sk-test-ingest';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- Fixtures con PIL (la misma herramienta que usa el pipeline) --------
function pil(script, args) {
  return execFileSync('python3', ['-c', script, ...(args || [])], { encoding: 'utf8' });
}
function makeExifJpeg(out) { // 1200×800 "acostada" con EXIF 6: bien orientada = 800×1200
  pil(`import sys
from PIL import Image
im = Image.new('RGB', (1200, 800), (30, 160, 60))
ex = Image.Exif(); ex[274] = 6
im.save(sys.argv[1], exif=ex, quality=92)`, [out]);
}
function makeWideJpeg(out) { // 1600×900 con sujeto detallado a la izquierda
  pil(`import sys
from PIL import Image
im = Image.new('RGB', (1600, 900), (205, 205, 205))
px = im.load()
for x in range(80, 480):
    for y in range(200, 700):
        px[x, y] = ((x * 7 + y) % 255, (x * 3) % 255, (y * 5) % 255)
im.save(sys.argv[1], quality=92)`, [out]);
}
function imgSize(absPath) {
  const out = pil('import sys, json; from PIL import Image; im = Image.open(sys.argv[1]); print(json.dumps({"w": im.size[0], "h": im.size[1], "format": im.format}))', [absPath]);
  return JSON.parse(out.trim());
}
function meanColor(absPath) {
  const out = pil('import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGB"); im.thumbnail((48, 48)); px = list(im.getdata()); n = len(px); print(",".join(str(round(sum(c[i] for c in px) / n)) for i in range(3)))', [absPath]);
  return out.trim().split(',').map(Number);
}
function bandStd(absPath, y0f, y1f) {
  const out = pil(`import sys
from PIL import Image, ImageStat
im = Image.open(sys.argv[1]).convert('L')
w, h = im.size
band = im.crop((0, int(h * ${'Y0'}), w, int(h * ${'Y1'})))
print(round(ImageStat.Stat(band).stddev[0], 2))`.replace('Y0', String(y0f)).replace('Y1', String(y1f)), [absPath]);
  return parseFloat(out.trim());
}

// --- Stub de OpenAI ------------------------------------------------------
const state = { fidelityFail: false, edits: [] };
const realFetch = global.fetch;
function solidPngB64(rgb) {
  const out = pil(`import sys, base64
from PIL import Image
im = Image.new('RGB', (1024, 1280), (${rgb[0]}, ${rgb[1]}, ${rgb[2]}))
im.save(sys.argv[1], 'PNG')
print(base64.b64encode(open(sys.argv[1], 'rb').read()).decode())`, [path.join(TMP, 'stub.png')]);
  return out.trim();
}
global.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.includes('api.openai.com')) return realFetch(url, opts);
  const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };
  const chat = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }], usage }), text: async () => JSON.stringify(obj) });
  if (u.includes('/images/')) {
    const rec = { imageBytes: null };
    try {
      const fd = opts && opts.body;
      if (fd && typeof fd.get === 'function') {
        const img = fd.get('image');
        if (img && typeof img.arrayBuffer === 'function') rec.imageBytes = Buffer.from(await img.arrayBuffer());
      }
    } catch (e) {}
    state.edits.push(rec);
    return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: solidPngB64([226, 44, 44]) }] }), text: async () => '' };
  }
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  const msgs = body.messages || [];
  const sys = String((msgs[0] && msgs[0].content) || '');
  if (sys.includes('control de FIDELIDAD')) {
    return chat(state.fidelityFail
      ? { fidelidad_ok: false, detalle: 'el producto cambió' }
      : { fidelidad_ok: true, detalle: 'mismo producto' });
  }
  if (sys.includes('control de calidad de una agencia')) return chat({ brand_ok: true, texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, headline_complete: true, headline_clear: true, anatomia_ok: true, contraste_ok: true, elementos_ok: true, detalle: 'ok' });
  return chat({ caption: 'Texto de prueba.', hashtags: '#test' });
};

// --- HTTP con cookie -----------------------------------------------------
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
async function callRaw(p, buf, ct) {
  const r = await realFetch('http://127.0.0.1:18774' + p, {
    method: 'POST', headers: { 'Content-Type': ct, ...(cookie ? { Cookie: cookie } : {}) }, body: buf,
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = require('./db');
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18774/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  let passed = 0, failed = 0;
  const ok = (name, cond, extra) => {
    if (cond) { passed++; console.log('  ✓ ' + name); }
    else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };

  const reg = await call('POST', '/api/auth/register', { email: 'ingest@test.local', password: 'secreto1' });
  assert.strictEqual(reg.status, 200, 'registro: ' + JSON.stringify(reg.json));
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('ingest@test.local').id;
  db.prepare('UPDATE users SET autopilot_enabled = 1 WHERE id = ?').run(uid);
  if (db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(uid)) {
    db.prepare('UPDATE profiles SET business_name = ?, category = ?, ig_username = ? WHERE user_id = ?').run('Café Aroma', 'cafeteria', 'cafearoma', uid);
  } else {
    db.prepare('INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (?,?,?,?)').run(uid, 'Café Aroma', 'cafeteria', 'cafearoma');
  }
  try { db.prepare('UPDATE settings SET brand_colors = ? WHERE user_id = ?').run('["#2793C8"]', uid); } catch (e) {}

  /* ---------- (10) Álbum: JPEG con EXIF 6 → JPEG parado 800×1200 -------- */
  const exifPath = path.join(TMP, 'exif.jpg'); makeExifJpeg(exifPath);
  const exifBuf = fs.readFileSync(exifPath);
  const upAlbum = await callRaw('/api/album/photo', exifBuf, 'image/jpeg');
  ok('álbum acepta la foto', upAlbum.status === 200 && upAlbum.json && upAlbum.json.ok, JSON.stringify(upAlbum.json));
  const albumAbs = path.join(MEDIA_DIR, path.basename(String((upAlbum.json || {}).path || '')));
  ok('álbum: el archivo guardado es .jpg', /\.jpg$/i.test(albumAbs), albumAbs);
  const s1 = imgSize(albumAbs);
  ok('álbum: EXIF aplicado — 1200×800 con orientación 6 queda 800×1200 JPEG', s1.w === 800 && s1.h === 1200 && s1.format === 'JPEG', JSON.stringify(s1));

  /* ---------- (10) Tira de medios: la misma foto, la misma salida ------- */
  const upAssets = await callRaw('/api/assets?kind=photo', exifBuf, 'image/jpeg');
  ok('tira de medios acepta la foto', upAssets.status === 200 && upAssets.json && upAssets.json.ok, JSON.stringify(upAssets.json));
  const assetsAbs = path.join(MEDIA_DIR, path.basename(String((upAssets.json || {}).path || '')));
  const s2 = imgSize(assetsAbs);
  ok('tira: también .jpg con EXIF aplicado (800×1200)', /\.jpg$/i.test(assetsAbs) && s2.w === 800 && s2.h === 1200, JSON.stringify(s2));

  /* ---------- (E3) Chat: la foto llega a la librería -------------------- */
  const upMedia = await callRaw('/api/media', exifBuf, 'image/jpeg');
  ok('POST /api/media responde 200 (sin el TDZ histórico)', upMedia.status === 200 && !!(upMedia.json || {}).path, 'status=' + upMedia.status + ' ' + JSON.stringify(upMedia.json));
  const mediaRow = db.prepare('SELECT kind FROM assets WHERE user_id = ? AND file_path = ?').get(uid, (upMedia.json || {}).path || '');
  ok('la foto del chat quedó en assets como photo', !!mediaRow && mediaRow.kind === 'photo');

  /* ---------- normalize-photo.py directo: 16:9 y 9:16 → 1080×1350 ----- */
  const widePath = path.join(TMP, 'wide.jpg'); makeWideJpeg(widePath);
  const wideOut = path.join(TMP, 'wide-out.jpg');
  execFileSync('python3', [path.join(__dirname, 'normalize-photo.py'), '--in', widePath, '--out', wideOut, '--grade', '#2793C8']);
  const s3 = imgSize(wideOut);
  ok('normalize 16:9 → exactamente 1080×1350', s3.w === 1080 && s3.h === 1350, JSON.stringify(s3));
  const tallPath = path.join(TMP, 'tall.jpg');
  pil(`import sys
from PIL import Image
im = Image.new('RGB', (900, 1600), (40, 40, 120))
im.save(sys.argv[1], quality=92)`, [tallPath]);
  const tallOut = path.join(TMP, 'tall-out.jpg');
  execFileSync('python3', [path.join(__dirname, 'normalize-photo.py'), '--in', tallPath, '--out', tallOut]);
  const s4 = imgSize(tallOut);
  ok('normalize 9:16 → exactamente 1080×1350', s4.w === 1080 && s4.h === 1350, JSON.stringify(s4));

  /* ---------- (3) product-shot con fidelidad caída → fallback 4:5 ------- */
  const prodName = 'prod-wide.jpg';
  fs.copyFileSync(widePath, path.join(MEDIA_DIR, prodName));
  db.prepare('INSERT INTO assets (user_id, file_path, kind) VALUES (?,?,?)').run(uid, '/media/' + prodName, 'photo');
  state.fidelityFail = true;
  const ps = await call('POST', '/api/product-shot', { refs: ['/media/' + prodName], idea: 'Promo del blend de la casa', angle: '' });
  ok('product-shot responde con fidelity=fallback', ps.status === 200 && ps.json && ps.json.fidelity === 'fallback', JSON.stringify(ps.json));
  const psAbs = path.join(MEDIA_DIR, path.basename(String((ps.json || {}).path || '')));
  const s5 = imgSize(psAbs);
  ok('la foto del fallback sale a 1080×1350 exactos (era 1600×900 cruda)', s5.w === 1080 && s5.h === 1350, JSON.stringify(s5));
  state.fidelityFail = false;

  /* ---------- (7) Mejorar foto: base limpia + titular recompuesto ------- */
  // Foto limpia sólida (verde) + su versión con titular quemado por código.
  const cleanSrc = path.join(TMP, 'clean-src.png');
  pil(`import sys
from PIL import Image
im = Image.new('RGB', (1024, 1280), (30, 160, 60))
im.save(sys.argv[1], 'PNG')`, [cleanSrc]);
  const cleanAbs = path.join(MEDIA_DIR, 'pieza7-clean.jpg');
  const shownAbs = path.join(MEDIA_DIR, 'pieza7.jpg');
  execFileSync('python3', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "JPEG", quality=92)', cleanSrc, cleanAbs]);
  fs.copyFileSync(cleanAbs, shownAbs);
  execFileSync('python3', [path.join(__dirname, 'composite-headline.py'), '--in', shownAbs, '--headline', 'Promo de la semana', '--out', shownAbs, '--grade', '#2793C8']);
  const postId = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, week_key, needs_review)
    VALUES (?,?,?,?,'draft','image','foto','2026-10-19',0)`).run(uid, '/media/pieza7.jpg', 'Promo de la semana, como siempre.', '#test').lastInsertRowid;
  state.edits.length = 0;
  const enh = await call('POST', `/api/drafts/${postId}/photo-enhance`, {});
  ok('photo-enhance responde ok', enh.status === 200 && enh.json && enh.json.ok, JSON.stringify(enh.json));
  const sentBytes = state.edits.length && state.edits[0].imageBytes;
  ok('la IA recibió UNA referencia', !!sentBytes);
  if (sentBytes) {
    const sentFile = path.join(TMP, 'sent.jpg'); fs.writeFileSync(sentFile, sentBytes);
    const mc = meanColor(sentFile);
    const distClean = Math.hypot(mc[0] - 30, mc[1] - 160, mc[2] - 60);
    ok('la referencia enviada es la foto LIMPIA (verde sólido), no la del titular quemado', distClean < 25, 'media=' + mc.join(','));
  }
  const postAfter = db.prepare('SELECT image_path FROM posts WHERE id = ?').get(postId);
  const finalAbs = path.join(MEDIA_DIR, path.basename(postAfter.image_path));
  const stdTop = bandStd(finalAbs, 0.0, 0.22);
  ok('el titular final es texto de código sobre la foto mejorada (banda superior no uniforme)', stdTop > 5, 'std=' + stdTop);
  const newClean = path.basename(postAfter.image_path).replace(/(\.[a-z0-9]+)$/i, '-clean$1');
  ok('la imagen mejorada quedó guardada como nueva base limpia', fs.existsSync(path.join(MEDIA_DIR, newClean)), newClean);

  console.log(`\ntest-client-ingest: ${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
