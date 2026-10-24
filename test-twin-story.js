'use strict';
/* test-twin-story.js — FIX HISTORIA GEMELA (v231, 2026-10-18).
 * La captura de Valentino: la gemela del post 112 salió con "MIRÁ EL
 * ÚLTIMO POST" gigante + el caption ENTERO pegado como texto, duplicado
 * y sobre los ojos de la mascota. Este test fija el contrato nuevo:
 *  1) la gemela lleva UN SOLO gancho corto = el titular del posteo
 *     (≤8 palabras), nunca el caption, nunca duplicado;
 *  2) si la fuente no pasa el lint vigente (anti-empalmes/captionPasses),
 *     la gemela NO se genera: queda registrada como omitida con motivo;
 *  3) el texto va en banda superior/inferior según las zonas tranquilas
 *     — nunca en el centro de la pieza;
 *  4) la clase del empalme "El + titular" (post 112) queda frenada por
 *     captionPasses mismo, no solo por applyPostyHook.
 * Fixtures locales, USD 0. Corre con: node test-twin-story.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const S = require('./stories');
const G = require('./generator');
const H = require('./hooks');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-twin-'));
const MEDIA = path.join(TMP, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); console.log('  ✗', name, '—', e.message); }
}

// --- Fotos fixture (PIL): lienzo oscuro, cara de piel en el centro y una
// banda cargada; la otra banda queda tranquila. Sin píxeles casi-blancos
// fuera del texto que dibuja el renderer (el conteo de blancos = texto).
function makePhoto(file, busyBand, skinY) {
  const py = `
from PIL import Image, ImageDraw
import random
random.seed(7)
img = Image.new('RGB', (1080, 1920), (24, 34, 52))
d = ImageDraw.Draw(img)
y0, y1 = (0, 560) if '${busyBand}' == 'top' else (1360, 1920)
for _ in range(500):
    x = random.randint(0, 1040); y = random.randint(y0, max(y0, y1 - 40))
    c = (random.randint(60, 170), random.randint(60, 170), random.randint(60, 170))
    d.rectangle([x, y, x + 34, y + 34], fill=c)
d.ellipse([350, ${skinY} - 240, 730, ${skinY} + 240], fill=(222, 184, 150))
img.save('${file}', quality=92)
`;
  execFileSync('python3', ['-c', py], { stdio: 'pipe' });
}
const FOTO_BOTTOM = path.join(TMP, 'foto-band-bottom.jpg'); // ruido arriba → banda de abajo
const FOTO_TOP = path.join(TMP, 'foto-band-top.jpg');       // ruido + cara abajo → banda de arriba
makePhoto(FOTO_BOTTOM, 'top', 960);
makePhoto(FOTO_TOP, 'bottom', 1470);

// Cuenta píxeles casi-blancos (el texto del renderer) por franja vertical.
function whiteByStrip(file) {
  const py = `
from PIL import Image
import json
img = Image.open('${file}').convert('RGB')
w, h = img.size
px = img.load()
def count(y0, y1):
    n = 0
    for y in range(y0, y1):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if r > 235 and g > 235 and b > 235:
                n += 1
    return n
print(json.dumps({'top': count(280, 730), 'center': count(730, 1190), 'bottom': count(1190, 1560)}))
`;
  return JSON.parse(execFileSync('python3', ['-c', py]).toString());
}

const CAP_112 = 'El De escéptica a fan: lo que dicen nuestros usuarios que una clienta recomendó a sus amigas\n\nProbó Posty una semana y terminó recomendándolo a todo el barrio.\n\nEscribinos por DM y probalo vos 📩';
const CAP_CLEAN = 'Nuevas medialunas de manteca 🥐\n\nSalieron del horno hace un rato y vuelan.\n\nPasá por el local o escribinos por DM 📩';
const CAP_LONG = 'Salió una tanda nueva de facturas surtidas para la merienda de hoy\n\nHay de manteca, de grasa, con dulce de leche, con membrillo y con crema pastelera, bien doradas y recién salidas del horno de barro de la esquina, como se hicieron toda la vida en el barrio, para compartir en familia o para llevar al trabajo con el mate de la tarde bien caliente y algo rico para acompañar.\n\nEscribinos por DM 📩';

const DDL = `
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT,
  status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image', tipo TEXT DEFAULT '',
  source TEXT DEFAULT '', source_topic TEXT DEFAULT '', intent TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '',
  category TEXT DEFAULT '', ig_username TEXT DEFAULT '');
CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '{}');
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));`;

(async () => {
  console.log('== 1) Contenido de la gemela: un solo gancho, jamás el caption ==');
  await t('repost con titular → {headline, sub vacío}', () => {
    const c = S.buildStoryContent('repost', { postHeadline: 'De escéptica a fan' });
    assert.deepStrictEqual(c, { headline: 'De escéptica a fan', sub: '' });
  });
  await t('repost con solo postCaption (la vía vieja) → null', () => {
    assert.strictEqual(S.buildStoryContent('repost', { postCaption: CAP_CLEAN.split('\n')[0] }), null);
  });
  await t('repost con titular de 9 palabras → null', () => {
    assert.strictEqual(S.buildStoryContent('repost', { postHeadline: 'una dos tres cuatro cinco seis siete ocho nueve' }), null);
  });
  await t('el literal viejo "MIRÁ EL ÚLTIMO POST" desapareció de stories.js', () => {
    assert.ok(!fs.readFileSync('stories.js', 'utf8').includes('MIRÁ EL ÚLTIMO POST'));
  });
  await t('poll/question/countdown intactos', () => {
    assert.ok(S.buildStoryContent('poll', { pollA: 'Medialunas', pollB: 'Tostadas' }).sub.includes('A) Medialunas'));
    assert.strictEqual(S.buildStoryContent('question', { question: '¿Dulce o salado?' }).headline, '¿Dulce o salado?');
  });

  console.log('== 2) twinSourceCheck: la puerta de la fuente ==');
  await t('post 112 (empalme real) → omitida por apertura_empalmada', () => {
    const r = S.twinSourceCheck({ caption: CAP_112 }, { business: 'Posty' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'apertura_empalmada');
  });
  await t('caption limpio → ok con titular ≤8 palabras y SIN cuerpo del caption', () => {
    const r = S.twinSourceCheck({ caption: CAP_CLEAN }, { business: 'Panadería Sol', category: 'gastronomia' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(r.headline.split(/\s+/).length <= 8, r.headline);
    assert.ok(!/horno|vuelan/i.test(r.headline), 'el gancho no puede ser el cuerpo: ' + r.headline);
  });
  await t('caption que no pasa el lint (largo) → omitida con motivo del lint', () => {
    assert.ok(CAP_LONG.length > 320, 'fixture de largo: ' + CAP_LONG.length);
    const r = S.twinSourceCheck({ caption: CAP_LONG }, { business: 'Panadería Sol' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason.startsWith('caption_no_pasa_lint'), r.reason);
  });
  await t('sin caption → sin_caption', () => {
    assert.strictEqual(S.twinSourceCheck({ caption: '' }, {}).reason, 'sin_caption');
  });

  console.log('== 3) La clase del empalme "El + titular" (punto 5) ==');
  await t('captionOpenIsGarbled detecta la firma exacta del 112', () => {
    assert.strictEqual(H.captionOpenIsGarbled(CAP_112, 'Posty'), true);
  });
  await t('captionPasses AHORA frena el empalme (antes solo vivía en applyPostyHook)', () => {
    const chk = G.captionPasses(CAP_112, { business: 'Posty' });
    assert.strictEqual(chk.ok, false);
    assert.ok(/empalmad/i.test(chk.reason), chk.reason);
  });
  await t('hookFits rechaza el tema-título; renderHook muestra el empalme que se evita', () => {
    const hook = H.HOOKS.find(h => h.formula && h.formula.includes('{tema}') && /^(El|La)\s/.test(h.formula));
    assert.ok(hook, 'existe una fórmula "El/La {tema}" en el banco');
    const tema = 'De escéptica a fan: lo que dicen nuestros usuarios';
    assert.strictEqual(H.hookFits(hook, { tema, negocio: 'Posty', hasPrice: false }), false);
    const rendered = H.renderHook(hook, { tema, negocio: 'Posty' });
    assert.strictEqual(H.captionOpenIsGarbled(rendered + '\n\nCuerpo del caption.', 'Posty'), true, rendered);
  });
  await t('applyPostyHook sigue siendo la segunda red: cae la línea empalmada', () => {
    const out = G.applyPostyHook({ caption: CAP_112 }, { business: 'Posty', tipo: 'social', topic: 'testimonios' });
    assert.ok(!String(out.caption).startsWith('El De escéptica'), out.caption.slice(0, 60));
  });

  console.log('== 4) Banda: nunca el centro, según la zona tranquila ==');
  await t('foto con ruido arriba → banda inferior, centro sin texto', () => {
    const meta = {};
    const p = S.renderStoryPng({ headline: 'De escéptica a fan', sub: '', business: 'X', bgHex: '#0A1E33', textHex: '#FFFFFF', photoAbs: FOTO_BOTTOM, outDir: MEDIA, band: 'auto', meta });
    assert.strictEqual(meta.band, 'bottom');
    const strips = whiteByStrip(path.join(MEDIA, path.basename(p)));
    assert.ok(strips.bottom > 400, 'hay texto abajo: ' + JSON.stringify(strips));
    assert.ok(strips.center < 60, 'el centro quedó limpio: ' + JSON.stringify(strips));
  });
  await t('foto con ruido y cara abajo → banda superior, centro sin texto', () => {
    const meta = {};
    const p = S.renderStoryPng({ headline: 'De escéptica a fan', sub: '', business: 'X', bgHex: '#0A1E33', textHex: '#FFFFFF', photoAbs: FOTO_TOP, outDir: MEDIA, band: 'auto', meta });
    assert.strictEqual(meta.band, 'top');
    const strips = whiteByStrip(path.join(MEDIA, path.basename(p)));
    assert.ok(strips.top > 400, 'hay texto arriba: ' + JSON.stringify(strips));
    assert.ok(strips.center < 60, 'el centro quedó limpio: ' + JSON.stringify(strips));
  });
  await t('SIN banda (comportamiento viejo) el texto caía en el centro — contraste', () => {
    const p = S.renderStoryPng({ headline: 'De escéptica a fan', sub: '', business: 'X', bgHex: '#0A1E33', textHex: '#FFFFFF', photoAbs: FOTO_BOTTOM, outDir: MEDIA });
    const strips = whiteByStrip(path.join(MEDIA, path.basename(p)));
    assert.ok(strips.center > 400, 'el render heredado sí escribía en el centro: ' + JSON.stringify(strips));
  });

  console.log('== 5) createTwinStory end-to-end (DB temporal) ==');
  const db = new DatabaseSync(path.join(TMP, 'twin.db'));
  db.exec(DDL);
  db.prepare(`INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (1, 'Posty', 'tecnologia', 'posty.communitymanager')`).run();
  const mkPost = (caption) => {
    const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type) VALUES (1, '/media/fuente.png', ?, 'published', 'image')`).run(caption);
    return db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(r.lastInsertRowid));
  };
  await t('fuente empalmada (112) → omitida, registrada en events, CERO historias creadas', () => {
    const post = mkPost(CAP_112);
    const before = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE media_type = 'story'`).get().n;
    const r = S.createTwinStory({ db, post, brand: { business: 'Posty', bgHex: '#0A1E33', textHex: '#FFFFFF' }, mediaDir: MEDIA, postImageAbs: FOTO_BOTTOM, scheduleAt: '2026-10-19 01:00:00' });
    assert.strictEqual(r.status, 'omitted');
    assert.strictEqual(r.reason, 'apertura_empalmada');
    const after = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE media_type = 'story'`).get().n;
    assert.strictEqual(after, before, 'no se creó ninguna historia');
    const ev = db.prepare(`SELECT props FROM events WHERE name = 'twin_story_omitted' ORDER BY id DESC LIMIT 1`).get();
    assert.ok(ev, 'la omisión quedó registrada');
    const props = JSON.parse(ev.props);
    assert.strictEqual(props.post_id, post.id);
    assert.strictEqual(props.reason, 'apertura_empalmada');
  });
  await t('fuente limpia → gemela creada: solo el gancho, en banda, sin caption', () => {
    db.prepare(`INSERT INTO profiles (user_id, business_name, category) VALUES (2, 'Panadería Sol', 'gastronomia')`).run();
    const post = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type) VALUES (2, '/media/fuente.png', ?, 'published', 'image')`).run(CAP_CLEAN);
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(post.lastInsertRowid));
    const r = S.createTwinStory({ db, post: row, brand: { business: 'Panadería Sol', bgHex: '#0A1E33', textHex: '#FFFFFF' }, mediaDir: MEDIA, postImageAbs: FOTO_BOTTOM, scheduleAt: '2026-10-19 01:00:00' });
    assert.strictEqual(r.status, 'created', JSON.stringify(r));
    assert.ok(r.band === 'top' || r.band === 'bottom', 'banda elegida: ' + r.band);
    const story = db.prepare('SELECT * FROM posts WHERE id = ?').get(r.id);
    assert.strictEqual(story.media_type, 'story');
    assert.strictEqual(story.caption, r.headline, 'el caption de la historia es SOLO el gancho');
    assert.ok(!/MIRÁ EL ÚLTIMO POST|horno|vuelan/i.test(story.caption), story.caption);
    const strips = whiteByStrip(path.join(MEDIA, path.basename(story.image_path)));
    assert.ok(strips.center < 60, 'la gemela no escribe en el centro: ' + JSON.stringify(strips));
  });
  db.close();

  console.log('== 6) Contratos de cableado ==');
  await t('scheduler: el bloque gemela llama createTwinStory y no arma ctx con el caption', () => {
    const sch = fs.readFileSync('scheduler.js', 'utf8');
    assert.ok(sch.includes('createTwinStory'));
    assert.ok(!sch.includes("postCaption: String(post.caption"));
  });
  await t('brand-card.py: --band y choose_story_band existen; el modo card no se tocó', () => {
    const bc = fs.readFileSync('brand-card.py', 'utf8');
    assert.ok(bc.includes("'--band'") && bc.includes('def choose_story_band'));
    assert.ok(bc.includes("center_y = int(H * 0.42) if story_mode else H // 2"), 'el anclaje heredado sigue para quien no pide banda');
  });
  await t('server.js: /api/story-generate pasa postHeadline chequeado', () => {
    const srv = fs.readFileSync('server.js', 'utf8');
    assert.ok(srv.includes('postHeadline') && srv.includes('twinSourceCheck'));
  });

  console.log(`\n${passed} ok · ${failed} fallas`);
  if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
