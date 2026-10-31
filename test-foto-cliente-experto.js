'use strict';
/* =====================================================================
 * test-foto-cliente-experto.js — «Posty experto en fotos del cliente»
 * (autorizado por el tablero 2026-10-26, construcción local sin push).
 *
 *  Pieza 1 — «Mejorar» genera una PROPUESTA (no aplica in situ):
 *    enhance -> propuesta guardada, imagen intacta, redo 3->2;
 *    supersede -> la propuesta vieja se borra, redo 2->1;
 *    accept -> aplica (prev = anterior), NO consume redo;
 *    reject -> deja la original, NO devuelve el redo;
 *    sin redos -> redo_exhausted; base cambiada -> propuesta_vencida.
 *  Pieza 2 — caption opt-in por código (composite-headline.py):
 *    on compone sobre la base limpia, off vuelve a la base limpia.
 *  Pieza 3 — sin .toUpperCase() en el titular de foto del cliente.
 *  Pieza 4 — disparo automático SOLO con attach a borrador o misión;
 *    chat/librería/save-draft genérico NO crean propuestas.
 *
 *  NOTA SOBRE test-client-ingest.js §7: sigue en verde bajo la nueva
 *  semántica, pero dos de sus aserciones se vuelven vacuas (la imagen
 *  final que mide es la original con titular, y la base limpia que
 *  encuentra es la preexistente). Las aserciones FUERTES de la propuesta
 *  viven acá, no ahí.
 * Costo IA: CERO — fetch stubbeado (patrón de la casa).
 * ===================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-foto-cliente-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18775';
process.env.BASE_URL = 'http://127.0.0.1:18775';
process.env.OPENAI_API_KEY = 'sk-test-foto-cliente';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- Fixtures con PIL ----------------------------------------------------
function pil(script, args) {
  return execFileSync('python3', ['-c', script, ...(args || [])], { encoding: 'utf8' });
}
function makeGreenJpeg(out) {
  pil(`import sys
from PIL import Image
im = Image.new('RGB', (1024, 1280), (30, 160, 60))
im.save(sys.argv[1], 'JPEG', quality=92)`, [out]);
}
function makeWideJpeg(out) { // 1600×900 con sujeto detallado (pasa el gate de calidad)
  pil(`import sys
from PIL import Image
im = Image.new('RGB', (1600, 900), (205, 205, 205))
px = im.load()
for x in range(80, 480):
    for y in range(200, 700):
        px[x, y] = ((x * 7 + y) % 255, (x * 3) % 255, (y * 5) % 255)
im.save(sys.argv[1], quality=92)`, [out]);
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

// --- Stub de OpenAI (mismo patrón que test-client-ingest.js) -------------
const state = { edits: [] };
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
  if (sys.includes('control de FIDELIDAD')) return chat({ fidelidad_ok: true, detalle: 'mismo producto' });
  if (sys.includes('control de calidad de una agencia')) return chat({ brand_ok: true, texto_ok: true, colores_ok: true, claims_ok: true, mobile_ok: true, headline_complete: true, headline_clear: true, anatomia_ok: true, contraste_ok: true, elementos_ok: true, detalle: 'ok' });
  return chat({ caption: 'Texto de prueba.', hashtags: '#test' });
};

// --- HTTP con cookie -----------------------------------------------------
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
async function callRaw(p, buf, ct) {
  const r = await realFetch('http://127.0.0.1:18775' + p, {
    method: 'POST', headers: { 'Content-Type': ct, ...(cookie ? { Cookie: cookie } : {}) }, body: buf,
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // SHIM SOLO PARA EL TEST (defecto preexistente en v482, FUERA del
  // patch): server.js:3341 referencia `normalizeSrc` sin definir (el
  // resto del archivo usa LA.normalizeSrc, server.js:334 y :1848). Sin
  // este shim NINGÚN test de server levanta sobre v482. El patch NO lo
  // corrige a propósito: es trabajo del turno de recuperación, para no
  // mezclar el fix de login social con las piezas de foto.
  global.normalizeSrc = require('./launch-analytics').normalizeSrc;
  const db = require('./db');
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18775/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  let passed = 0, failed = 0;
  const ok = (name, cond, extra) => {
    if (cond) { passed++; console.log('  ✓ ' + name); }
    else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };
  const postRow = (id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  // El rate 'regen' (3/día) se agota con 3 enhances: el test lo resetea
  // entre secciones para aislar la semántica de redo (el orden real
  // rate-antes-que-redo se verifica explícito en §4).
  const resetRegenRate = () => { try { db.prepare("DELETE FROM ai_rate WHERE user_id = ? AND feature = 'regen'").run(uid); } catch (e) {} };
  const insertDraft = (imagePath, caption) => db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, week_key, needs_review)
    VALUES (?,?,?,?,'draft','image','foto','2026-10-19',0)`).run(uid, imagePath, caption, '#test').lastInsertRowid;
  const cleanSister = (name) => name.replace(/(\.[a-z0-9]+)$/i, '-clean$1');

  const reg = await call('POST', '/api/auth/register', { email: 'foto@test.local', password: 'secreto1' });
  assert.strictEqual(reg.status, 200, 'registro: ' + JSON.stringify(reg.json));
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('foto@test.local').id;
  db.prepare('UPDATE users SET autopilot_enabled = 1 WHERE id = ?').run(uid);
  if (db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(uid)) {
    db.prepare('UPDATE profiles SET business_name = ?, category = ?, ig_username = ? WHERE user_id = ?').run('Café Aroma', 'cafeteria', 'cafearoma', uid);
  } else {
    db.prepare('INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (?,?,?,?)').run(uid, 'Café Aroma', 'cafeteria', 'cafearoma');
  }
  try { db.prepare('UPDATE settings SET brand_colors = ? WHERE user_id = ?').run('["#2793C8"]', uid); } catch (e) {}

  /* ---------- §0 Unidad: helpers puros (sin server) -------------------- */
  const pc = require('./photo-cliente.js');
  const UNIT = path.join(TMP, 'unit-media'); fs.mkdirSync(UNIT, { recursive: true });
  ok('cleanSisterName: foto.jpg -> foto-clean.jpg', pc.cleanSisterName('foto.jpg') === 'foto-clean.jpg');
  ok('cleanSisterName: a.b.png -> a.b-clean.png', pc.cleanSisterName('a.b.png') === 'a.b-clean.png');
  ok('cleanSisterName: sin extensión no cambia', pc.cleanSisterName('sin-ext') === 'sin-ext');
  ok('captionOutName: foto.jpg -> foto-cap.jpg', pc.captionOutName('foto.jpg') === 'foto-cap.jpg');
  ok('captionOutName: sin extensión agrega -cap', pc.captionOutName('foto') === 'foto-cap');
  ok('isMediaPath solo acepta /media/', pc.isMediaPath('/media/x.jpg') && !pc.isMediaPath('https://x/y.jpg') && !pc.isMediaPath(''));
  ok('mediaAbs fuera de /media/ da null', pc.mediaAbs(UNIT, '/etc/passwd') === null);
  const uShown = path.join(UNIT, 'u.jpg'); makeGreenJpeg(uShown);
  ok('captionState sin base limpia = off', pc.captionState(UNIT, '/media/u.jpg') === 'off');
  fs.copyFileSync(uShown, path.join(UNIT, 'u-clean.jpg'));
  ok('captionState con base idéntica = off', pc.captionState(UNIT, '/media/u.jpg') === 'off');
  execFileSync('python3', [path.join(__dirname, 'composite-headline.py'), '--in', uShown, '--headline', 'Promo de la semana', '--out', uShown, '--grade', '#2793C8']);
  ok('captionState con base distinta (titular quemado) = on', pc.captionState(UNIT, '/media/u.jpg') === 'on');
  ok('captionState sin foto = null', pc.captionState(UNIT, '/media/noexiste.jpg') === null);
  for (const n of ['p.jpg', 'p-clean.jpg', 'p@640.webp', 'p@24.webp']) fs.writeFileSync(path.join(UNIT, n), 'x');
  fs.writeFileSync(path.join(UNIT, 'keep.jpg'), 'x');
  ok('deleteProposalFiles borra propuesta + base + variantes (4)', pc.deleteProposalFiles(UNIT, '/media/p.jpg') === 4
    && !fs.existsSync(path.join(UNIT, 'p.jpg')) && !fs.existsSync(path.join(UNIT, 'p-clean.jpg'))
    && !fs.existsSync(path.join(UNIT, 'p@640.webp')) && fs.existsSync(path.join(UNIT, 'keep.jpg')));

  /* ---------- §1 Pieza 1: enhance genera PROPUESTA, no aplica ---------- */
  makeGreenJpeg(path.join(MEDIA_DIR, 'cli-a.jpg'));
  const draftA = insertDraft('/media/cli-a.jpg', 'Promo de la semana, como siempre.');
  state.edits.length = 0;
  const enh1 = await call('POST', `/api/drafts/${draftA}/photo-enhance`, {});
  ok('enhance responde ok + proposal', enh1.status === 200 && enh1.json && enh1.json.ok && enh1.json.proposal === true, JSON.stringify(enh1.json));
  const prop1 = (enh1.json || {}).proposal_path || '';
  ok('proposal_base = imagen actual', (enh1.json || {}).proposal_base === '/media/cli-a.jpg');
  let rowA = postRow(draftA);
  ok('la imagen del borrador NO cambió', rowA.image_path === '/media/cli-a.jpg', rowA.image_path);
  ok('propuesta guardada en columnas', rowA.enhance_proposal_path === prop1 && rowA.enhance_proposal_base === '/media/cli-a.jpg');
  ok('generar consumió 1 redo (3->2)', rowA.redo_left === 2 && rowA.img_redos === 1, `redo_left=${rowA.redo_left} img_redos=${rowA.img_redos}`);
  ok('archivo de propuesta existe', !!prop1 && fs.existsSync(path.join(MEDIA_DIR, path.basename(prop1))));
  ok('la propuesta tiene su base limpia hermana', fs.existsSync(path.join(MEDIA_DIR, cleanSister(path.basename(prop1)))));
  ok('la IA recibió UNA referencia', state.edits.length === 1 && !!state.edits[0].imageBytes);
  if (state.edits[0] && state.edits[0].imageBytes) {
    const sentFile = path.join(TMP, 'sent-a.jpg'); fs.writeFileSync(sentFile, state.edits[0].imageBytes);
    const mc = meanColor(sentFile);
    ok('la referencia es la foto mostrada (verde, sin composite)', Math.hypot(mc[0] - 30, mc[1] - 160, mc[2] - 60) < 25, 'media=' + mc.join(','));
  }
  const apiA = await call('GET', `/api/posts/${draftA}`);
  ok('GET /api/posts/:id expone propuesta + caption_on 0', apiA.json && apiA.json.post && apiA.json.post.enhance_proposal_path === prop1 && apiA.json.post.caption_on === 0, JSON.stringify(apiA.json));
  const listA = await call('GET', '/api/posts');
  const entryA = Array.isArray(listA.json) ? listA.json.find((p) => p.id === draftA) : null;
  ok('GET /api/posts expone propuesta + caption_on 0', !!entryA && entryA.enhance_proposal_path === prop1 && entryA.caption_on === 0);

  /* ---------- §2 Supersede: la propuesta vieja se borra --------------- */
  const enh2 = await call('POST', `/api/drafts/${draftA}/photo-enhance`, {});
  const prop2 = (enh2.json || {}).proposal_path || '';
  rowA = postRow(draftA);
  ok('segunda propuesta distinta de la primera', !!prop2 && prop2 !== prop1);
  ok('la propuesta vieja y su base se borraron', !fs.existsSync(path.join(MEDIA_DIR, path.basename(prop1))) && !fs.existsSync(path.join(MEDIA_DIR, cleanSister(path.basename(prop1)))));
  ok('segundo generar consumió otro redo (2->1)', rowA.redo_left === 1 && rowA.img_redos === 2, `redo_left=${rowA.redo_left}`);
  ok('la imagen sigue intacta tras el supersede', rowA.image_path === '/media/cli-a.jpg');

  /* ---------- §3 Accept: aplica sin consumir redo --------------------- */
  const acc = await call('POST', `/api/drafts/${draftA}/photo-enhance-accept`, {});
  rowA = postRow(draftA);
  ok('accept aplica la propuesta', acc.json && acc.json.ok && acc.json.path === prop2, JSON.stringify(acc.json));
  ok('image_path = propuesta, prev = original', rowA.image_path === prop2 && rowA.prev_image_path === '/media/cli-a.jpg');
  ok('accept NO consumió redo (sigue 1)', rowA.redo_left === 1 && rowA.img_redos === 2);
  ok('accept limpió las columnas de propuesta', !rowA.enhance_proposal_path && !rowA.enhance_proposal_base);
  const apiA2 = await call('GET', `/api/posts/${draftA}`);
  ok('tras accept, caption_on 0 (mejora limpia, sin titular)', apiA2.json && apiA2.json.post && apiA2.json.post.caption_on === 0);

  /* ---------- §4 Reject: no devuelve el redo; luego agotado ----------- */
  const enh3 = await call('POST', `/api/drafts/${draftA}/photo-enhance`, {});
  const prop3 = (enh3.json || {}).proposal_path || '';
  rowA = postRow(draftA);
  ok('tercer generar dejó redo en 0', rowA.redo_left === 0 && rowA.img_redos === 3);
  const rej = await call('POST', `/api/drafts/${draftA}/photo-enhance-reject`, {});
  rowA = postRow(draftA);
  ok('reject deja la imagen intacta', rej.json && rej.json.ok && rowA.image_path === prop2);
  ok('reject NO devolvió el redo (sigue 0)', rowA.redo_left === 0 && rowA.img_redos === 3);
  ok('reject borró la propuesta y limpió columnas', !fs.existsSync(path.join(MEDIA_DIR, path.basename(prop3))) && !rowA.enhance_proposal_path);
  const enh4 = await call('POST', `/api/drafts/${draftA}/photo-enhance`, {});
  ok('con rate y redo agotados, el rate responde primero (orden real)', enh4.json && (enh4.json.error || '').includes('ya regeneramos varias imágenes hoy'), JSON.stringify(enh4.json));
  resetRegenRate();
  const enh4b = await call('POST', `/api/drafts/${draftA}/photo-enhance`, {});
  ok('con rate verde y redo 0 -> redo_exhausted', (enh4b.json && (enh4b.json.redo_exhausted === true || enh4b.json.error === 'redo_exhausted')), JSON.stringify(enh4b.json));

  /* ---------- §5 Pieza 1 sobre composite: base limpia + recomposición - */
  makeGreenJpeg(path.join(MEDIA_DIR, 'piezaB-clean.jpg'));
  fs.copyFileSync(path.join(MEDIA_DIR, 'piezaB-clean.jpg'), path.join(MEDIA_DIR, 'piezaB.jpg'));
  execFileSync('python3', [path.join(__dirname, 'composite-headline.py'), '--in', path.join(MEDIA_DIR, 'piezaB.jpg'), '--headline', 'Promo de la semana', '--out', path.join(MEDIA_DIR, 'piezaB.jpg'), '--grade', '#2793C8']);
  const draftB = insertDraft('/media/piezaB.jpg', 'Promo de la semana, como siempre.');
  state.edits.length = 0;
  resetRegenRate();
  const enhB = await call('POST', `/api/drafts/${draftB}/photo-enhance`, {});
  const propB = (enhB.json || {}).proposal_path || '';
  let rowB = postRow(draftB);
  ok('composite: enhance ok + propuesta', enhB.json && enhB.json.ok && !!propB);
  ok('composite: la imagen NO cambió', rowB.image_path === '/media/piezaB.jpg');
  if (state.edits[0] && state.edits[0].imageBytes) {
    const sentFile = path.join(TMP, 'sent-b.jpg'); fs.writeFileSync(sentFile, state.edits[0].imageBytes);
    const mc = meanColor(sentFile);
    ok('composite: la IA recibió la base LIMPIA (verde), no el titular', Math.hypot(mc[0] - 30, mc[1] - 160, mc[2] - 60) < 25, 'media=' + mc.join(','));
  }
  ok('composite: la propuesta trae el titular recompuesto por código', !!propB && bandStd(path.join(MEDIA_DIR, path.basename(propB)), 0.0, 0.22) > 5);
  ok('composite: la propuesta tiene base limpia hermana', !!propB && fs.existsSync(path.join(MEDIA_DIR, cleanSister(path.basename(propB)))));
  const apiB = await call('GET', `/api/posts/${draftB}`);
  ok('composite: caption_on 1 mientras se muestra con titular', apiB.json && apiB.json.post && apiB.json.post.caption_on === 1);
  const accB = await call('POST', `/api/drafts/${draftB}/photo-enhance-accept`, {});
  rowB = postRow(draftB);
  ok('composite: accept aplica la propuesta', accB.json && accB.json.ok && rowB.image_path === propB);
  ok('composite: tras accept sigue caption_on 1', (await call('GET', `/api/posts/${draftB}`)).json.post.caption_on === 1);

  /* ---------- §6 Pieza 2: caption opt-in por código ------------------- */
  makeGreenJpeg(path.join(MEDIA_DIR, 'cli-c.jpg'));
  const origCBytes = fs.readFileSync(path.join(MEDIA_DIR, 'cli-c.jpg'));
  const draftC = insertDraft('/media/cli-c.jpg', 'Promo de la semana, como siempre.');
  const capOn = await call('POST', `/api/drafts/${draftC}/photo-caption`, { on: true });
  let rowC = postRow(draftC);
  ok('caption on: responde ok + path -cap', capOn.json && capOn.json.ok && /-cap\.jpg$/.test(capOn.json.path || ''), JSON.stringify(capOn.json));
  ok('caption on: banda superior con texto de código', bandStd(path.join(MEDIA_DIR, path.basename(rowC.image_path)), 0.0, 0.22) > 5);
  ok('caption on: la original quedó congelada como base limpia', fs.existsSync(path.join(MEDIA_DIR, 'cli-c-clean.jpg')));
  ok('caption on: caption_on 1', (await call('GET', `/api/posts/${draftC}`)).json.post.caption_on === 1);
  const capOnAgain = await call('POST', `/api/drafts/${draftC}/photo-caption`, { on: true });
  ok('caption on repetido: already sin duplicar', capOnAgain.json && capOnAgain.json.already === true && postRow(draftC).image_path === rowC.image_path);
  const capOff = await call('POST', `/api/drafts/${draftC}/photo-caption`, { on: false });
  rowC = postRow(draftC);
  ok('caption off: vuelve a una base limpia (-cap-clean, bytes originales)', capOff.json && capOff.json.ok && /-clean\.jpg$/.test(rowC.image_path), JSON.stringify(capOff.json));
  ok('caption off: los bytes son los de la foto original', fs.readFileSync(path.join(MEDIA_DIR, 'cli-c-clean.jpg')).equals(origCBytes));
  ok('caption off: caption_on 0', (await call('GET', `/api/posts/${draftC}`)).json.post.caption_on === 0);
  const draftD = insertDraft('/media/cli-c.jpg', '');
  const capNoTitle = await call('POST', `/api/drafts/${draftD}/photo-caption`, { on: true });
  ok('caption sin titular -> sin_titular', capNoTitle.json && capNoTitle.json.error === 'sin_titular', JSON.stringify(capNoTitle.json));

  /* ---------- §7 Stale: save-draft no limpia; accept la vence --------- */
  makeGreenJpeg(path.join(MEDIA_DIR, 'cli-f.jpg'));
  makeGreenJpeg(path.join(MEDIA_DIR, 'cli-f2.jpg'));
  const draftF = insertDraft('/media/cli-f.jpg', 'Promo de la semana, como siempre.');
  resetRegenRate();
  const enhF = await call('POST', `/api/drafts/${draftF}/photo-enhance`, {});
  ok('stale: propuesta generada', enhF.json && enhF.json.ok && !!enhF.json.proposal_path);
  await call('PATCH', `/api/posts/${draftF}`, { action: 'save-draft', image_path: '/media/cli-f2.jpg' });
  ok('stale: save-draft genérico NO limpia la propuesta (la guarda el accept)', !!postRow(draftF).enhance_proposal_path);
  const accF = await call('POST', `/api/drafts/${draftF}/photo-enhance-accept`, {});
  ok('stale: accept con base cambiada -> propuesta_vencida', accF.json && accF.json.error === 'propuesta_vencida', JSON.stringify(accF.json));
  ok('stale: la vencida limpió las columnas', !postRow(draftF).enhance_proposal_path && !postRow(draftF).enhance_proposal_base);

  /* ---------- §8 Pieza 4: chat/librería/save-draft NO disparan -------- */
  const postsBefore = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(uid).c;
  const greenBuf = fs.readFileSync(path.join(MEDIA_DIR, 'cli-c.jpg'));
  const upChat = await callRaw('/api/media', greenBuf, 'image/jpeg');
  ok('chat: la foto sube', upChat.status === 200 && !!(upChat.json || {}).path, JSON.stringify(upChat.json));
  const upLib = await callRaw('/api/assets?kind=photo', greenBuf, 'image/jpeg');
  ok('librería: la foto sube', upLib.status === 200 && !!(upLib.json || {}).path, JSON.stringify(upLib.json));
  makeGreenJpeg(path.join(MEDIA_DIR, 'cli-h.jpg'));
  makeGreenJpeg(path.join(MEDIA_DIR, 'cli-h2.jpg'));
  const draftH = insertDraft('/media/cli-h.jpg', 'Promo de la semana, como siempre.');
  await call('PATCH', `/api/posts/${draftH}`, { action: 'save-draft', image_path: '/media/cli-h2.jpg' });
  const postsAfter = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(uid).c;
  ok('chat/librería no crearon posteos', postsAfter === postsBefore + 1, `${postsBefore} -> ${postsAfter}`);
  ok('save-draft genérico no creó propuesta', !postRow(draftH).enhance_proposal_path);
  ok('ningún borrador tiene propuesta pendiente tras chat/librería', db.prepare("SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND enhance_proposal_path != ''").get(uid).c === 0);

  /* ---------- §9 Pieza 4 (b): misión del álbum -> propuesta automática - */
  const widePath = path.join(TMP, 'wide.jpg'); makeWideJpeg(widePath);
  const wideBuf = fs.readFileSync(widePath);
  resetRegenRate();
  const upAlbum = await callRaw('/api/album/photo', wideBuf, 'image/jpeg');
  ok('álbum: la foto sube con misión cumplida', upAlbum.status === 200 && upAlbum.json && upAlbum.json.mission_done === true, JSON.stringify(upAlbum.json));
  let missionPost = null;
  for (let i = 0; i < 60 && !missionPost; i++) {
    missionPost = db.prepare("SELECT * FROM posts WHERE user_id = ? AND source = 'album'").get(uid) || null;
    if (!missionPost) await sleep(500);
  }
  ok('misión: el festejo creó el borrador', !!missionPost, 'sin post source=album tras 30 s');
  if (missionPost) {
    ok('misión: el borrador trae propuesta automática', !!missionPost.enhance_proposal_path, JSON.stringify(missionPost));
    ok('misión: la propuesta automática consumió 1 redo (3->2)', missionPost.redo_left === 2 && missionPost.img_redos === 1, `redo_left=${missionPost.redo_left} img_redos=${missionPost.img_redos}`);
    ok('misión: el archivo de propuesta existe', !!missionPost.enhance_proposal_path && fs.existsSync(path.join(MEDIA_DIR, path.basename(missionPost.enhance_proposal_path || ''))));
  }

  /* ---------- §10 Estático: pieza 3 + cableado ------------------------- */
  const appJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
  const appLines = appJs.split('\n');
  const upperLines = appLines.filter((l) => l.includes('makeHeadline(topic, 5)'));
  ok('dos llamadas makeHeadline(topic, 5) (cambiar y quitar foto)', upperLines.length === 2, 'hay ' + upperLines.length);
  ok('ninguna lleva .toUpperCase()', upperLines.every((l) => !l.includes('toUpperCase')));
  ok("el fallback quedó en 'Novedad' (sin mayúsculas forzadas)", upperLines.every((l) => l.includes("'Novedad'")));
  const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok('server.js cablea los 3 endpoints nuevos', serverJs.includes('photo-enhance-accept') && serverJs.includes('photo-enhance-reject') && serverJs.includes('/photo-caption'));
  ok('server.js tiene la generación compartida y el auto', serverJs.includes('enhancePhotoGenerate') && serverJs.includes('maybeAutoEnhanceProposal'));

  console.log(`\ntest-foto-cliente-experto: ${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
