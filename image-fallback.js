// image-fallback.js — INVARIANTE: todo posteo sale con imagen, nunca solo palabras.
//
// Cadena de fallback para la imagen de un borrador:
//   1) foto IA (gpt-image-1, vía generateFn inyectada por server.js)
//   2) tarjeta de marca con PIL (fondo color de marca o foto del cliente +
//      titular + logo) — siempre funciona si PIL está disponible
//   3) PNG sólido con el color primario de la marca (PIL, una línea)
//   4) si TODO falla: se marca needs_image=1 (visible, no silencioso), se
//      loguea fuerte y publish queda bloqueado para ese post.
//
// server.js inyecta su conceptShotGenerate como generateFn (evita require
// circular). El harness inyecta stubs.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BRAND_CARD_PY = path.join(__dirname, 'brand-card.py');

function freshName(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
}

// Nivel 2: tarjeta de marca renderizada con PIL. Nunca crashea por assets
// faltantes (brand-card.py los ignora); lanza solo si PIL/python falla.
function brandCardPng({ headline, bgHex, textHex, business, logoAbs, photoAbs, outDir, _forceFail }) {
  if (_forceFail && _forceFail.includes('pil')) throw new Error('pil forzado a fallar (harness)');
  const out = path.join(outDir, freshName('brandcard'));
  const args = ['--headline', String(headline || '').slice(0, 140),
    '--bg', String(bgHex || '#0A1E33'), '--text', String(textHex || '#FFFFFF'),
    '--business', String(business || '').slice(0, 48), '--out', out];
  if (logoAbs && fs.existsSync(logoAbs)) args.push('--logo', logoAbs);
  if (photoAbs && fs.existsSync(photoAbs)) args.push('--photo', photoAbs);
  execFileSync('python3', [BRAND_CARD_PY, ...args], { timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!fs.existsSync(out)) throw new Error('brand-card.py no generó el PNG');
  return out;
}

// Nivel 3: sólido con el color de marca. Prácticamente infalible (PIL puro).
function solidPng({ hex, outDir, _forceFail }) {
  if (_forceFail && _forceFail.includes('solid')) throw new Error('solid forzado a fallar (harness)');
  const out = path.join(outDir, freshName('solid'));
  const h = String(hex || '#0A1E33').trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : (h + '0A1E33').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
  execFileSync('python3', ['-c',
    `from PIL import Image; Image.new('RGB',(1080,1350),(${r},${g},${b})).save(${JSON.stringify(out)},'PNG')`,
  ], { timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!fs.existsSync(out)) throw new Error('no se generó el sólido');
  return out;
}

function toMediaPath(absPath) {
  return '/media/' + path.basename(absPath);
}

function fileExists(mediaDir, relPath) {
  try {
    const p = String(relPath || '');
    if (!p.startsWith('/media/')) return false;
    return fs.existsSync(path.join(mediaDir, path.basename(p)));
  } catch (e) { return false; }
}

// Genera (o recupera) la imagen de un borrador siguiendo la cadena.
// No escribe en DB: devuelve { path, source }. `generateFn` es () => Promise<path|null>.
async function fallbackImage({ generateFn = null, headline, bgHex, textHex, business, logoAbs, photoAbs, outDir, _forceFail }) {
  // 1) foto IA
  if (typeof generateFn === 'function') {
    try {
      const p = await generateFn();
      if (p && fileExists(outDir, p)) return { path: String(p), source: 'ai' };
      if (p) console.error('[ensure-image] la IA devolvió un path inexistente:', p);
    } catch (e) {
      console.error('[ensure-image] IA falló, fallback a tarjeta de marca:', e.message);
    }
  }
  // 2) tarjeta de marca (PIL)
  try {
    const abs = brandCardPng({ headline, bgHex, textHex, business, logoAbs, photoAbs, outDir, _forceFail });
    return { path: toMediaPath(abs), source: 'brand_card' };
  } catch (e) {
    console.error('[ensure-image] tarjeta de marca falló, fallback a sólido:', e.message);
  }
  // 3) sólido color de marca
  try {
    const abs = solidPng({ hex: bgHex, outDir, _forceFail });
    return { path: toMediaPath(abs), source: 'solid' };
  } catch (e) {
    console.error('[ensure-image] sólido falló:', e.message);
  }
  return { path: null, source: 'failed' };
}

// Versión con DB: si el borrador ya tiene imagen válida la respeta; si no,
// corre la cadena y la guarda. Si todo falla → needs_image=1 (visible).
// `postId` puede ser null (solo generar, sin escribir).
async function ensurePostImage({ db, postId = null, uid = null, generateFn = null, headline, bgHex, textHex, business, logoAbs, photoAbs, mediaDir, _forceFail }) {
  let post = null;
  if (db && postId) {
    try { post = db.prepare('SELECT id, image_path FROM posts WHERE id = ?').get(postId); } catch (e) {}
    if (post && fileExists(mediaDir, post.image_path)) return { path: post.image_path, source: 'existing' };
  }
  const fb = await fallbackImage({ generateFn, headline, bgHex, textHex, business, logoAbs, photoAbs, outDir: mediaDir, _forceFail });
  if (fb.path && db && postId) {
    try { db.prepare('UPDATE posts SET image_path = ?, needs_image = 0 WHERE id = ?').run(fb.path, postId); } catch (e) {}
  }
  if (!fb.path && db && postId) {
    console.error(`[ensure-image] 🚨 SIN IMAGEN post ${postId} (uid ${uid}): todos los fallbacks fallaron. Marcado needs_image=1, publish bloqueado.`);
    try { db.prepare('UPDATE posts SET needs_image = 1 WHERE id = ?').run(postId); } catch (e) {}
  }
  return fb;
}

// ¿El post tiene imagen publicable? (para el guard de publish)
function postHasImage(post, mediaDir) {
  if (!post) return false;
  const mt = String(post.media_type || 'image');
  if (mt === 'carousel') {
    try {
      const arr = JSON.parse(post.carousel_paths || '[]');
      if (Array.isArray(arr) && arr.some(p => fileExists(mediaDir, p))) return true;
    } catch (e) {}
  }
  return fileExists(mediaDir, post.image_path);
}

// Guard de publish: { ok:true } o { ok:false, message } con mensaje humano.
function assertPublishable(post, mediaDir) {
  if (!postHasImage(post, mediaDir)) {
    return { ok: false, message: 'Este posteo no tiene imagen 😅 Regenerala desde el borrador y lo publicamos.' };
  }
  return { ok: true };
}

module.exports = { brandCardPng, solidPng, fallbackImage, ensurePostImage, postHasImage, assertPublishable, fileExists };
