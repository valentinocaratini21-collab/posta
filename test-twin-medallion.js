'use strict';
/* test-twin-medallion.js — MISIÓN 3 v330 (2026-10-22): POSTY NO SE
 * REPITE EN LA PIEZA. La brand-card de la gemela estampa abajo el
 * medallón con el avatar del negocio; cuando la imagen fuente ya nació
 * con ese avatar como protagonista (concept-shot con la referencia del
 * avatar viajando — el motor lo registra en image_meta al generarla),
 * el sello lo duplica y se ve barato (todo el contenido propio de
 * Posty: su avatar ES el logo y el protagonista).
 * Contrato:
 *  1) gemela desde pieza avatar-protagonista → SIN medallón (+ evento
 *     twin_story_no_medallion registrado);
 *  2) gemela desde foto de producto de cliente (image_meta en 0) →
 *     medallón como siempre;
 *  3) pieza sin registro (legado) → medallón como siempre;
 *  4) la vía directa generateStory (sin createTwinStory) resuelve la
 *     fuente por su ruta y aplica la misma regla.
 * Fixtures locales, USD 0. Corre con: node test-twin-medallion.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const S = require('./stories');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-medallion-'));
const MEDIA = path.join(TMP, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); console.log('  ✗', name, '—', e.message); }
}

// Foto fuente: lienzo oscuro uniforme (sin rojo: el rojo del medallón se
// mide sin falsos positivos).
const FOTO = path.join(MEDIA, 'fuente-avatar.png');
execFileSync('python3', ['-c', `
from PIL import Image
Image.new('RGB', (1080, 1920), (24, 34, 52)).save('${FOTO}')
`], { stdio: 'pipe' });
// El "avatar/logo" del negocio: cuadrado ROJO opaco 200×200 (el medallón
// lo estampa abajo-derecha, máx 220px).
const LOGO = path.join(MEDIA, 'avatar-logo.png');
execFileSync('python3', ['-c', `
from PIL import Image
Image.new('RGBA', (200, 200), (230, 30, 30, 255)).save('${LOGO}')
`], { stdio: 'pipe' });

// Cuenta píxeles rojos en la esquina del medallón (x 790..1080, y 1620..1920).
function redInCorner(file) {
  const py = `
from PIL import Image
img = Image.open('${file}').convert('RGB')
px = img.load()
n = 0
for y in range(1620, 1920):
    for x in range(790, 1080):
        r, g, b = px[x, y]
        if r > 200 and g < 90 and b < 90:
            n += 1
print(n)
`;
  return Number(execFileSync('python3', ['-c', py]).toString().trim());
}

const CAP_CLEAN = 'Nuevas medialunas de manteca 🥐\n\nSalieron del horno hace un rato y vuelan.\n\nPasá por el local o escribinos por DM 📩';

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
  name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE image_meta (media_path TEXT PRIMARY KEY, avatar_protagonist INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')));`;

const BRAND = { business: 'Posty', bgHex: '#0A1E33', textHex: '#FFFFFF', logoAbs: LOGO };

(async () => {
  const db = new DatabaseSync(path.join(TMP, 'medallion.db'));
  db.exec(DDL);
  db.prepare(`INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (1, 'Posty', 'tecnologia', 'posty.hacetodo')`).run();
  db.prepare(`INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (2, 'Panadería Sol', 'gastronomia', 'panaderiasol')`).run();
  const mkPost = (uid, imagePath) => {
    const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type) VALUES (?, ?, ?, 'published', 'image')`).run(uid, imagePath, CAP_CLEAN);
    return db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(r.lastInsertRowid));
  };

  console.log('== 1) El registro del motor (sourceHasAvatarProtagonist) ==');
  await t('sin fila en image_meta → false (legado: comportamiento de siempre)', () => {
    assert.strictEqual(S.sourceHasAvatarProtagonist(db, { image_path: '/media/fuente-avatar.png' }), false);
  });
  await t('avatar_protagonist=1 → true; =0 → false', () => {
    db.prepare(`INSERT INTO image_meta (media_path, avatar_protagonist) VALUES ('/media/a.png', 1), ('/media/b.png', 0)`).run();
    assert.strictEqual(S.sourceHasAvatarProtagonist(db, { image_path: '/media/a.png' }), true);
    assert.strictEqual(S.sourceHasAvatarProtagonist(db, { image_path: '/media/b.png' }), false);
  });

  console.log('== 2) createTwinStory: con y sin medallón ==');
  await t('fuente con avatar protagonista → gemela SIN medallón + evento registrado', () => {
    const post = mkPost(1, '/media/fuente-avatar.png');
    db.prepare(`INSERT OR REPLACE INTO image_meta (media_path, avatar_protagonist) VALUES ('/media/fuente-avatar.png', 1)`).run();
    const r = S.createTwinStory({ db, post, brand: BRAND, mediaDir: MEDIA, postImageAbs: FOTO, scheduleAt: '2026-10-22 15:00:00' });
    assert.strictEqual(r.status, 'created', JSON.stringify(r));
    assert.strictEqual(r.medallion, false, 'la gemela declara que salió sin medallón');
    const red = redInCorner(path.join(MEDIA, path.basename(r.path)));
    assert.ok(red < 50, `esquina sin medallón (rojos=${red})`);
    const ev = db.prepare(`SELECT props FROM events WHERE name = 'twin_story_no_medallion' ORDER BY id DESC LIMIT 1`).get();
    assert.ok(ev && JSON.parse(ev.props).post_id === post.id, 'evento twin_story_no_medallion con el post fuente');
  });
  await t('fuente foto de producto de cliente (registro en 0) → gemela CON medallón, como hoy', () => {
    const post = mkPost(2, '/media/foto-producto.png');
    db.prepare(`INSERT OR REPLACE INTO image_meta (media_path, avatar_protagonist) VALUES ('/media/foto-producto.png', 0)`).run();
    fs.copyFileSync(FOTO, path.join(MEDIA, 'foto-producto.png'));
    const r = S.createTwinStory({ db, post, brand: BRAND, mediaDir: MEDIA, postImageAbs: path.join(MEDIA, 'foto-producto.png'), scheduleAt: '2026-10-22 15:00:00' });
    assert.strictEqual(r.status, 'created', JSON.stringify(r));
    assert.strictEqual(r.medallion, true);
    const red = redInCorner(path.join(MEDIA, path.basename(r.path)));
    assert.ok(red > 5000, `medallón estampado abajo-derecha (rojos=${red})`);
  });
  await t('fuente sin registro (pieza vieja) → medallón como siempre', () => {
    const post = mkPost(2, '/media/pieza-vieja.png');
    fs.copyFileSync(FOTO, path.join(MEDIA, 'pieza-vieja.png'));
    const r = S.createTwinStory({ db, post, brand: BRAND, mediaDir: MEDIA, postImageAbs: path.join(MEDIA, 'pieza-vieja.png'), scheduleAt: '2026-10-22 16:00:00' });
    assert.strictEqual(r.status, 'created', JSON.stringify(r));
    assert.strictEqual(r.medallion, true);
    const red = redInCorner(path.join(MEDIA, path.basename(r.path)));
    assert.ok(red > 5000, `medallón presente (rojos=${red})`);
  });

  console.log('== 3) Vía directa generateStory (repost sin createTwinStory) ==');
  await t('resuelve la fuente por su ruta: avatar protagonista → sin medallón', () => {
    const out = S.generateStory({
      db, uid: 1, type: 'repost',
      ctx: { postHeadline: 'Nuevas medialunas de manteca', postImageAbs: FOTO },
      brand: BRAND, mediaDir: MEDIA, scheduleAt: null,
    });
    assert.strictEqual(out.medallion, false);
    const red = redInCorner(path.join(MEDIA, path.basename(out.path)));
    assert.ok(red < 50, `esquina limpia (rojos=${red})`);
  });
  db.close();

  console.log(`\n${passed} ok · ${failed} fallas`);
  if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
