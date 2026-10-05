// test-image-invariant.js — Harness: intención explícita + NEVER_STYLES +
// invariante "todo posteo sale con imagen".
// Uso: node test-image-invariant.js
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const styles = require('./image-styles');
const fb = require('./image-fallback');

let pass = 0, fail = 0;
const pending = [];
function t(name, fn) {
  pending.push((async () => {
    try { await fn(); pass++; }
    catch (e) { fail++; console.error('FAIL:', name, '→', e.message); }
  })());
}

// ---------- 1. Intención explícita ----------
t('intent explícito gana sobre keywords', () => {
  const r = styles.pickStyle({ intent: 'promo', theme: 'pizza 2x1 en horno de barro', rubro: 'gastronomia' });
  assert.strictEqual(r.intent, 'promo');
  assert.strictEqual(r.intentSource, 'explicit');
});

t('intent inválido cae al flujo normal (no rompe)', () => {
  const r = styles.pickStyle({ intent: 'noexiste', tipo: 'promo', rubro: 'gastronomia' });
  assert.ok(r && r.style, 'debe devolver un estilo igual');
  assert.strictEqual(r.intent, 'promo'); // tipo manda
});

t('keywords refinan al tipo grueso (meme→viral, plato→comida)', () => {
  let r = styles.pickStyle({ tipo: 'social', theme: 'un meme divertido sobre los lunes', rubro: 'gimnasio' });
  assert.strictEqual(r.intent, 'viral');
  assert.strictEqual(r.intentSource, 'keywords');
  r = styles.pickStyle({ tipo: 'promo', theme: 'plato del día: milanesa a la napolitana', rubro: 'gastronomia' });
  assert.strictEqual(r.intent, 'comida');
  assert.strictEqual(r.intentSource, 'keywords');
});

t('sin keywords, el tipo manda de forma determinista', () => {
  const r = styles.pickStyle({ tipo: 'promo', theme: 'resumen semanal del local', rubro: 'kiosco' });
  assert.strictEqual(r.intent, 'promo');
  assert.strictEqual(r.intentSource, 'tipo');
});

t('intentFromTipo mapea los 5 tipos', () => {
  assert.strictEqual(styles.intentFromTipo('promo'), 'promo');
  assert.strictEqual(styles.intentFromTipo('tip'), 'tips');
  assert.strictEqual(styles.intentFromTipo('social'), 'testimonio');
  assert.strictEqual(styles.intentFromTipo('detras'), 'detras');
  assert.strictEqual(styles.intentFromTipo('novedad'), 'lanzamiento');
  assert.strictEqual(styles.intentFromTipo('xxx'), null);
});

t('detectIntent sigue como fallback sin tipo ni intent', () => {
  const r = styles.pickStyle({ theme: 'plato del día: milanesa napolitana', rubro: 'gastronomia' });
  assert.strictEqual(r.intent, 'comida');
  assert.strictEqual(r.intentSource, 'keywords');
});

t('sin señales cae a producto (default histórico)', () => {
  const r = styles.pickStyle({ rubro: 'servicios' });
  assert.ok(r && r.style);
  assert.strictEqual(r.intent, 'producto');
  assert.strictEqual(r.intentSource, 'default');
});

// ---------- 2. NEVER_STYLES ----------
t('hay al menos 10 reglas negativas', () => {
  assert.ok(styles.NEVER_STYLES.length >= 10, `hay ${styles.NEVER_STYLES.length}`);
});

t('funeraria nunca sale con estética de fiesta', () => {
  const codes = styles.forbiddenStyles({ intent: 'promo', rubro: 'funeraria' }).map(f => f.code);
  assert.ok(codes.includes('/neon'), 'bloquea /neon');
  assert.ok(codes.includes('/halloweenspook'), 'bloquea /halloweenspook');
  const r = styles.pickStyle({ intent: 'promo', rubro: 'funeraria' });
  assert.ok(!['/neon', '/cyberpunk', '/gaming', '/popart'].includes(r.style.code));
});

t('salud/belleza no muestran envejecimiento', () => {
  for (const rubro of ['clinica dental', 'estetica integral']) {
    const codes = styles.forbiddenStyles({ intent: 'producto', rubro }).map(f => f.code);
    assert.ok(codes.includes('/aging'), `${rubro}: bloquea /aging`);
    const r = styles.pickStyle({ intent: 'producto', rubro });
    assert.ok(!['/aging', '/timetravel'].includes(r.style.code), `${rubro}: no pickeó envejecimiento`);
  }
});

t('profesionales no salen en fantasía salvo viral', () => {
  const codes = styles.forbiddenStyles({ intent: 'producto', rubro: 'estudio juridico' }).map(f => f.code);
  assert.ok(codes.includes('/legoify'), 'bloquea /legoify');
  const ok = styles.forbiddenStyles({ intent: 'viral', rubro: 'estudio juridico' }).map(f => f.code);
  assert.ok(!ok.includes('/legoify'), 'en viral se permite');
});

t('testimonio siempre real (fantasía bloqueada)', () => {
  const r = styles.pickStyle({ intent: 'testimonio', rubro: 'servicios' });
  assert.ok(!styles.FANTASY_STYLES.includes(r.style.code), `pickeó ${r.style.code}`);
});

t('viral sí puede usar fantasía', () => {
  // Sin match de rubro, viral elige fantasía (curaduría de la lista).
  const r = styles.pickStyle({ intent: 'viral', rubro: 'rubro-inexistente-xyz' });
  assert.ok(styles.FANTASY_STYLES.includes(r.style.code), `pickeó ${r.style.code}`);
  // Y las reglas negativas nunca bloquean fantasía en viral.
  const forb = styles.forbiddenStyles({ intent: 'viral', rubro: 'servicios' }).map(f => f.code);
  assert.ok(!forb.some(c => styles.FANTASY_STYLES.includes(c)), 'fantasía bloqueada en viral');
});

t('inmobiliaria no se muestra deteriorada', () => {
  const codes = styles.forbiddenStyles({ intent: 'producto', rubro: 'inmobiliaria' }).map(f => f.code);
  assert.ok(codes.includes('/crackedopen'));
});

t('tecnología no sale artesanal barata', () => {
  const codes = styles.forbiddenStyles({ intent: 'lanzamiento', rubro: 'software' }).map(f => f.code);
  assert.ok(codes.includes('/clay'));
});

t('forbiddenStyles trae motivo y solo códigos existentes', () => {
  for (const f of styles.forbiddenStyles({ intent: 'promo', rubro: 'funeraria', businessName: 'Cochería Paz' })) {
    assert.ok(f.code && f.reason, 'código y motivo');
    assert.ok(styles.getStyle(f.code), `${f.code} existe`);
  }
});

// ---------- 3. Fallback de imagen ----------
const tmpMedia = fs.mkdtempSync(path.join(os.tmpdir(), 'posty-media-'));

t('brandCardPng genera un PNG válido', () => {
  const abs = fb.brandCardPng({ headline: 'Promo 2x1', bgHex: '#E63946', textHex: '#FFFFFF', business: 'La Charola', outDir: tmpMedia });
  assert.ok(fs.existsSync(abs));
  const sig = fs.readFileSync(abs).slice(0, 8);
  assert.ok(sig[0] === 0x89 && sig[1] === 0x50, 'firma PNG');
});

t('solidPng genera un PNG válido', () => {
  const abs = fb.solidPng({ hex: '#2793C8', outDir: tmpMedia });
  assert.ok(fs.existsSync(abs));
});

t('fallbackImage: IA ok → usa la IA', async () => {
  const fake = path.join(tmpMedia, 'fake-ai.png');
  fs.writeFileSync(fake, 'x');
  const r = await fb.fallbackImage({ generateFn: async () => '/media/fake-ai.png', outDir: tmpMedia });
  assert.strictEqual(r.source, 'ai');
  assert.strictEqual(r.path, '/media/fake-ai.png');
});

t('fallbackImage: IA falla → tarjeta de marca', async () => {
  const r = await fb.fallbackImage({
    generateFn: async () => { throw new Error('API caída'); },
    headline: 'Hola', bgHex: '#0A1E33', business: 'Test', outDir: tmpMedia,
  });
  assert.strictEqual(r.source, 'brand_card');
  assert.ok(fb.fileExists(tmpMedia, r.path));
});

t('fallbackImage: PIL falla → sólido', async () => {
  const r = await fb.fallbackImage({
    generateFn: async () => { throw new Error('API caída'); },
    headline: 'Hola', bgHex: '#FEC14D', business: 'Test', outDir: tmpMedia, _forceFail: ['pil'],
  });
  assert.strictEqual(r.source, 'solid');
  assert.ok(fb.fileExists(tmpMedia, r.path));
});

t('fallbackImage: todo falla → failed (nunca vacío silencioso)', async () => {
  const r = await fb.fallbackImage({
    generateFn: async () => { throw new Error('API caída'); },
    headline: 'Hola', bgHex: '#FEC14D', outDir: tmpMedia, _forceFail: ['pil', 'solid'],
  });
  assert.strictEqual(r.source, 'failed');
  assert.strictEqual(r.path, null);
});

t('ensurePostImage respeta imagen existente válida', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const dbFile = path.join(tmpMedia, 't1.db');
  const db = new DatabaseSync(dbFile);
  db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, image_path TEXT DEFAULT "", needs_image INTEGER DEFAULT 0)');
  const fake = path.join(tmpMedia, 'exist.png');
  fs.writeFileSync(fake, 'x');
  db.prepare('INSERT INTO posts (id, image_path) VALUES (1, ?)').run('/media/exist.png');
  let aiCalled = false;
  const r = await fb.ensurePostImage({ db, postId: 1, generateFn: async () => { aiCalled = true; return null; }, mediaDir: tmpMedia });
  assert.strictEqual(r.source, 'existing');
  assert.ok(!aiCalled, 'no llamó a la IA teniendo imagen válida');
  db.close();
});

t('ensurePostImage sin imagen → genera y guarda; si todo falla marca needs_image', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const dbFile = path.join(tmpMedia, 't2.db');
  const db = new DatabaseSync(dbFile);
  db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, image_path TEXT DEFAULT "", needs_image INTEGER DEFAULT 0)');
  db.prepare('INSERT INTO posts (id, image_path) VALUES (1, ?)').run('/media/inexistente.png');
  // caso A: IA falla → brand card y guarda
  const a = await fb.ensurePostImage({
    db, postId: 1, uid: 7, generateFn: async () => { throw new Error('down'); },
    headline: 'Hola', bgHex: '#0A1E33', business: 'T', mediaDir: tmpMedia,
  });
  assert.strictEqual(a.source, 'brand_card');
  const row = db.prepare('SELECT image_path, needs_image FROM posts WHERE id = 1').get();
  assert.ok(fb.fileExists(tmpMedia, row.image_path), 'imagen guardada existe');
  assert.strictEqual(row.needs_image, 0);
  // caso B: todo falla → needs_image=1
  db.prepare('INSERT INTO posts (id, image_path) VALUES (2, ?)').run('/media/inexistente.png');
  const b = await fb.ensurePostImage({
    db, postId: 2, uid: 7, generateFn: async () => { throw new Error('down'); },
    headline: 'Hola', bgHex: '#0A1E33', mediaDir: tmpMedia, _forceFail: ['pil', 'solid'],
  });
  assert.strictEqual(b.source, 'failed');
  assert.strictEqual(db.prepare('SELECT needs_image FROM posts WHERE id = 2').get().needs_image, 1);
  db.close();
});

// ---------- 4. Guard de publish ----------
t('postHasImage: distingue válida de rota', () => {
  const fake = path.join(tmpMedia, 'pub.png');
  fs.writeFileSync(fake, 'x');
  assert.ok(fb.postHasImage({ media_type: 'image', image_path: '/media/pub.png' }, tmpMedia));
  assert.ok(!fb.postHasImage({ media_type: 'image', image_path: '/media/noexiste.png' }, tmpMedia));
  assert.ok(!fb.postHasImage({ media_type: 'image', image_path: '' }, tmpMedia));
  assert.ok(!fb.postHasImage(null, tmpMedia));
});

t('postHasImage: carrusel acepta carousel_paths', () => {
  const fake = path.join(tmpMedia, 'car1.png');
  fs.writeFileSync(fake, 'x');
  assert.ok(fb.postHasImage({ media_type: 'carousel', image_path: '', carousel_paths: JSON.stringify(['/media/car1.png']) }, tmpMedia));
  assert.ok(!fb.postHasImage({ media_type: 'carousel', image_path: '', carousel_paths: '[]' }, tmpMedia));
});

t('assertPublishable bloquea con mensaje claro', () => {
  const bad = fb.assertPublishable({ media_type: 'image', image_path: '/media/nada.png' }, tmpMedia);
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.message && bad.message.length > 10, 'mensaje humano, no silencioso');
  const good = fb.assertPublishable({ media_type: 'image', image_path: '/media/pub.png' }, tmpMedia);
  assert.strictEqual(good.ok, true);
});

// ---------- 5. Integración pickStyle → conceptShotGenerate (estática) ----------
t('server.js pasa intent explícito a pickStyle', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(src.includes('pickStyle({ intent: explicitIntent.intent,'), 'llamada con intent explícito');
  assert.ok(src.includes('styleOut.intent'), 'styleOut lleva intent');
  assert.ok(src.includes('fallbackImage({'), 'pipeline usa fallbackImage');
});

t('scheduler.js bloquea publish sin imagen', () => {
  const src = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');
  assert.ok(src.includes("blocked: 'no_image'"), 'bloqueo no_image');
  assert.ok(src.includes('assertPublishable'), 'usa assertPublishable');
});

t('db.js tiene columnas intent y needs_image', () => {
  const src = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  assert.ok(src.includes('ADD COLUMN intent'), 'columna intent');
  assert.ok(src.includes('ADD COLUMN needs_image'), 'columna needs_image');
});

(async () => {
  await Promise.all(pending);
  console.log(`\n${pass} pass, ${fail} fail`);
  try { fs.rmSync(tmpMedia, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
