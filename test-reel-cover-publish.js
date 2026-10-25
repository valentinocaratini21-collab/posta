'use strict';
/* =====================================================================
 * test-reel-cover-publish.js — Gap 1 (auditoría material del cliente,
 * 2026-10-25): LA PORTADA ELEGIDA LLEGA A INSTAGRAM.
 *
 * publishVideoReal crea el contenedor REELS con `cover_url` cuando el
 * posteo tiene portada (posts.cover_path: la que el dueño eligió frame
 * a frame o la que graduó el director de feed). Sin portada, el payload
 * NO lleva la clave (comportamiento histórico intacto).
 * Costo: cero — fetch global stubbeado que captura el payload real.
 * ===================================================================== */
const assert = require('assert');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ' — ' + e.message); }
}

const calls = [];
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  let body = null;
  try { body = opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
  calls.push({ url: u, method: opts.method || 'GET', body });
  const json = (obj) => ({ ok: true, json: async () => obj });
  if (/\/media$/.test(u) && (opts.method || 'GET') === 'POST') return json({ id: 'container-1' });
  if (/status_code/.test(u)) return json({ status_code: 'FINISHED' });
  if (/media_publish/.test(u)) return json({ id: 'media-1' });
  if (/fields=permalink/.test(u)) return json({ permalink: 'https://www.instagram.com/reel/xyz/' });
  return json({});
};

const { publishVideo } = require('./instagram');
const creds = { igUserId: '17841400008460056', accessToken: 'tok-test' };

(async () => {
  // --- Con portada: el contenedor nace con cover_url = la del posteo.
  calls.length = 0;
  const r1 = await publishVideo(
    { videoUrl: 'https://postycommunitymanager.com/media/reel.mp4', caption: 'hola', coverUrl: 'https://postycommunitymanager.com/media/reel-cover.jpg' },
    creds, false);
  check('publica ok con portada', () => assert.strictEqual(r1.success, true));
  const create1 = calls.find(c => /\/media$/.test(c.url) && c.method === 'POST');
  check('el contenedor REELS lleva cover_url con la URL de la portada', () => {
    assert(create1 && create1.body, 'no se capturó la creación del contenedor');
    assert.strictEqual(create1.body.media_type, 'REELS');
    assert.strictEqual(create1.body.video_url, 'https://postycommunitymanager.com/media/reel.mp4');
    assert.strictEqual(create1.body.cover_url, 'https://postycommunitymanager.com/media/reel-cover.jpg');
  });

  // --- Sin portada: el payload NO lleva la clave (histórico intacto).
  calls.length = 0;
  const r2 = await publishVideo(
    { videoUrl: 'https://postycommunitymanager.com/media/reel2.mp4', caption: 'hola', coverUrl: '' },
    creds, false);
  check('publica ok sin portada', () => assert.strictEqual(r2.success, true));
  const create2 = calls.find(c => /\/media$/.test(c.url) && c.method === 'POST');
  check('sin portada, el contenedor NO lleva cover_url', () => {
    assert(create2 && create2.body, 'no se capturó la creación del contenedor');
    assert(!('cover_url' in create2.body), 'cover_url no debería estar en el payload');
  });

  // --- Grep de la vara: cover_url existe en el camino de publicación.
  const fs = require('fs');
  const ig = fs.readFileSync(require('path').join(__dirname, 'instagram.js'), 'utf8');
  const sch = fs.readFileSync(require('path').join(__dirname, 'scheduler.js'), 'utf8');
  check('grep cover_url ≥ 1 en instagram.js y scheduler.js pasa la portada del posteo', () => {
    assert((ig.match(/cover_url/g) || []).length >= 1, 'instagram.js sin cover_url');
    assert(/coverUrl: post\.cover_path/.test(sch), 'scheduler.js no pasa post.cover_path');
  });

  console.log(`\ntest-reel-cover-publish: ${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
