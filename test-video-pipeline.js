'use strict';
/* =====================================================================
 * test-video-pipeline.js — Gaps 2, 5, 6, 9 y 11 (auditoría de material
 * del cliente, 2026-10-25).
 *
 *  (9)  UNA SOLA PUERTA: el video entra por el álbum y por la tira de
 *       medios con las MISMAS reglas — el de 120 s se rechaza en las
 *       dos con el MISMO mensaje; el bueno queda con miniatura y
 *       album_quality poblados entre por donde entre.
 *  (5)  GATE DE CALIDAD DE VIDEO: issues medidos con photo-quality.py
 *       sobre frames muestreados (oscuro → 'oscura'+'movida'); la
 *       subida los devuelve y el camino «posteá este video» se niega
 *       con el consejo amable.
 *  (11) MINIATURA DEL MEJOR FRAME (existe y es el frame medido, no el
 *       del medio a ciegas) + FESTEJO DE VIDEO: el primer video bueno
 *       de la semana se convierte solo en un reel.
 *  (2)  «POSTEÁ ESTE VIDEO»: el endpoint convierte el video del cliente
 *       en un reel borrador protagonista — un fixture de 40 s conserva
 *       ≥80% de su duración y la portada es un archivo real.
 *  (6)  ZONA DEL TITULAR MEDIDA EN LA APP: con el QA de zona marcando
 *       que arriba tapa al sujeto, la pieza del festejo sale con el
 *       titular compuesto ABAJO (la banda superior queda limpia).
 * Costo IA: CERO — fetch stubbeado (patrón de la casa).
 * ===================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-video-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18776';
process.env.BASE_URL = 'http://127.0.0.1:18776';
process.env.OPENAI_API_KEY = 'sk-test-video';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const FIX = path.join(TMP, 'fix');
fs.mkdirSync(FIX, { recursive: true });

// --- Fixtures de video con ffmpeg (medidos: bueno lum≈128 edge≈44) -------
function ff(args) { execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { timeout: 180000 }); }
ff(['-f', 'lavfi', '-i', 'testsrc2=duration=6:size=720x1280:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(FIX, 'good6.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc2=duration=40:size=720x1280:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=40', '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(FIX, 'good40.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=c=black:duration=6:size=720x1280:rate=30', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', path.join(FIX, 'dark6.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc2=duration=120:size=360x640:rate=10', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', path.join(FIX, 'long120.mp4')]);
function probeDur(abs) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', abs], { encoding: 'utf8' });
  return Number(JSON.parse(out).format.duration) || 0;
}
function pil(script, args) { return execFileSync('python3', ['-c', script, ...(args || [])], { encoding: 'utf8' }); }
function bandStd(absPath, y0f, y1f) {
  const out = pil(`import sys
from PIL import Image, ImageStat
im = Image.open(sys.argv[1]).convert('L')
w, h = im.size
band = im.crop((0, int(h * ${y0f}), w, int(h * ${y1f})))
print(round(ImageStat.Stat(band).stddev[0], 2))`, [absPath]);
  return parseFloat(out.trim());
}

// --- Stub de OpenAI -------------------------------------------------------
const state = { zoneFail: false };
const realFetch = global.fetch;
function solidPngB64() {
  const out = pil(`import sys, base64
from PIL import Image
im = Image.new('RGB', (1024, 1280), (226, 44, 44))
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
    return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: solidPngB64() }] }), text: async () => '' };
  }
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  const msgs = body.messages || [];
  const sys = String((msgs[0] && msgs[0].content) || '');
  if (sys.includes('strict visual QA reviewer for a finished Instagram post image')) {
    return chat({ texto_no_tapa: !state.zoneFail, detalle: state.zoneFail ? 'tapa al sujeto' : 'ok' });
  }
  if (sys.includes('control de FIDELIDAD')) return chat({ fidelidad_ok: true, detalle: 'mismo producto' });
  if (sys.includes('control de calidad de una agencia')) return chat({ brand_ok: true, texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, headline_complete: true, headline_clear: true, anatomia_ok: true, contraste_ok: true, elementos_ok: true, detalle: 'ok' });
  return chat({ caption: 'Texto de prueba.', hashtags: '#test' });
};

// --- HTTP con cookie -------------------------------------------------------
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
async function callRaw(p, buf, ct) {
  const r = await realFetch('http://127.0.0.1:18776' + p, {
    method: 'POST', headers: { 'Content-Type': ct, ...(cookie ? { Cookie: cookie } : {}) }, body: buf,
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, label) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timeout esperando: ' + label);
    await sleep(1500);
  }
}

(async () => {
  const db = require('./db');
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18776/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  let passed = 0, failed = 0;
  const ok = (name, cond, extra) => {
    if (cond) { passed++; console.log('  ✓ ' + name); }
    else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };
  async function registerUser(email) {
    cookie = '';
    const reg = await call('POST', '/api/auth/register', { email, password: 'secreto1' });
    assert.strictEqual(reg.status, 200, 'registro ' + email + ': ' + JSON.stringify(reg.json));
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    db.prepare('UPDATE users SET autopilot_enabled = 1 WHERE id = ?').run(uid);
    if (db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(uid)) {
      db.prepare('UPDATE profiles SET business_name = ?, category = ?, ig_username = ? WHERE user_id = ?').run('Café Aroma', 'cafeteria', 'cafearoma', uid);
    } else {
      db.prepare('INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (?,?,?,?)').run(uid, 'Café Aroma', 'cafeteria', 'cafearoma');
    }
    try { db.prepare('UPDATE settings SET brand_colors = ? WHERE user_id = ?').run('["#2793C8"]', uid); } catch (e) {}
    return uid;
  }

  /* ================= Usuario A: puerta única, gate, festejo, endpoint == */
  const uidA = await registerUser('video-a@test.local');
  const good40 = fs.readFileSync(path.join(FIX, 'good40.mp4'));
  const upA = await callRaw('/api/album/photo', good40, 'video/mp4');
  ok('álbum acepta el video bueno', upA.status === 200 && upA.json && upA.json.ok, JSON.stringify(upA.json));
  ok('(5) el video bueno sube SIN issues de calidad', Array.isArray(upA.json.quality_issues) && upA.json.quality_issues.length === 0, JSON.stringify(upA.json.quality_issues));
  ok('(11) la subida trae miniatura', !!upA.json.thumb, JSON.stringify(upA.json));
  const thumbAbs = path.join(MEDIA_DIR, path.basename(String(upA.json.thumb || '')));
  ok('(11) la miniatura es un archivo real en el servidor', !!upA.json.thumb && fs.existsSync(thumbAbs), thumbAbs);
  const assetA = upA.json.id;

  const festejo = await waitFor(() => db.prepare(`SELECT id, cover_path FROM posts WHERE user_id = ? AND source = 'album-video-festejo'`).get(uidA), 150000, 'festejo de video');
  ok('(11) FESTEJO: el primer video bueno de la semana se convirtió solo en un reel', !!festejo);
  ok('(11) el reel del festejo tiene portada real', !!festejo.cover_path && fs.existsSync(path.join(MEDIA_DIR, path.basename(festejo.cover_path))), festejo.cover_path);

  const ep = await call('POST', '/api/album/video-reel', { asset_id: assetA });
  ok('(2) el endpoint «posteá este video» responde ok', ep.status === 200 && ep.json && ep.json.ok, 'status=' + ep.status + ' ' + JSON.stringify(ep.json));
  const postEp = db.prepare('SELECT * FROM posts WHERE id = ?').get(ep.json && ep.json.post_id);
  ok('(2) el posteo es un reel borrador con el video del cliente', !!postEp && postEp.media_type === 'video' && postEp.status === 'draft' && postEp.client_photo === 1 && postEp.source === 'album-video', JSON.stringify(postEp && { t: postEp.media_type, s: postEp.status, src: postEp.source }));
  const reelDur = postEp ? probeDur(path.join(MEDIA_DIR, path.basename(postEp.image_path))) : 0;
  ok('(2) el reel conserva ≥80% del video de 40 s', reelDur >= 32, 'dur=' + reelDur);
  ok('(2) la portada del reel es un archivo real', !!postEp && !!postEp.cover_path && fs.existsSync(path.join(MEDIA_DIR, path.basename(postEp.cover_path))), postEp && postEp.cover_path);

  const dark = fs.readFileSync(path.join(FIX, 'dark6.mp4'));
  const upDark = await callRaw('/api/album/photo', dark, 'video/mp4');
  ok('(5) el video oscuro sube con su issue medido', upDark.status === 200 && Array.isArray(upDark.json.quality_issues) && upDark.json.quality_issues.includes('oscura'), JSON.stringify(upDark.json));
  const epDark = await call('POST', '/api/album/video-reel', { asset_id: upDark.json.id });
  ok('(5) el gate frena el reel del video oscuro con el consejo amable', epDark.status === 400 && /oscuro/.test(String((epDark.json || {}).error || '')), 'status=' + epDark.status + ' ' + JSON.stringify(epDark.json));

  const long = fs.readFileSync(path.join(FIX, 'long120.mp4'));
  const upLongAlbum = await callRaw('/api/album/photo', long, 'video/mp4');
  const upLongAssets = await callRaw('/api/assets?kind=video', long, 'video/mp4');
  ok('(9) el video de 120 s se rechaza por el álbum', upLongAlbum.status === 400 && /más de 90 segundos/.test(String((upLongAlbum.json || {}).error || '')), JSON.stringify(upLongAlbum.json));
  ok('(9) el MISMO rechazo, con el MISMO mensaje, por la tira de medios', upLongAssets.status === 400 && (upLongAssets.json || {}).error === (upLongAlbum.json || {}).error, JSON.stringify(upLongAssets.json));

  const good6 = fs.readFileSync(path.join(FIX, 'good6.mp4'));
  const upAssetsVid = await callRaw('/api/assets?kind=video', good6, 'video/mp4');
  ok('(9) la tira de medios acepta el video bueno', upAssetsVid.status === 200 && upAssetsVid.json && upAssetsVid.json.ok, JSON.stringify(upAssetsVid.json));
  const rowAssetsVid = db.prepare('SELECT album_quality, thumb_path FROM assets WHERE id = ?').get(upAssetsVid.json.id);
  ok('(9) el registro queda poblado igual: miniatura + orientación en album_quality', !!rowAssetsVid.thumb_path && /orientacion=vertical/.test(rowAssetsVid.album_quality || ''), JSON.stringify(rowAssetsVid));

  /* ================= Usuario B: zona del titular (Gap 6) ================= */
  const uidB = await registerUser('video-b@test.local');
  state.zoneFail = true;
  const widePath = path.join(TMP, 'wide-b.jpg');
  pil(`import sys
from PIL import Image
im = Image.new('RGB', (1600, 900), (205, 205, 205))
px = im.load()
for x in range(80, 480):
    for y in range(200, 700):
        px[x, y] = ((x * 7 + y) % 255, (x * 3) % 255, (y * 5) % 255)
im.save(sys.argv[1], quality=92)`, [widePath]);
  const upB = await callRaw('/api/album/photo', fs.readFileSync(widePath), 'image/jpeg');
  ok('usuario B: foto aceptada', upB.status === 200 && upB.json && upB.json.ok, JSON.stringify(upB.json));
  const postB = await waitFor(() => db.prepare(`SELECT image_path FROM posts WHERE user_id = ? AND source = 'album'`).get(uidB), 120000, 'festejo de foto de B');
  const imgB = path.join(MEDIA_DIR, path.basename(postB.image_path));
  const stdBottom = bandStd(imgB, 0.78, 1.0);
  const stdTop = bandStd(imgB, 0.0, 0.22);
  ok('(6) con el QA marcando que arriba tapa al sujeto, el titular sale ABAJO', stdBottom > 5, 'stdBottom=' + stdBottom);
  ok('(6) la banda superior queda limpia (sin el titular quemado arriba)', stdTop < 3, 'stdTop=' + stdTop);
  state.zoneFail = false;

  console.log(`\ntest-video-pipeline: ${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
