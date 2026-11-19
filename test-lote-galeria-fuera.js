// test-lote-galeria-fuera.js — LOTE GALERIA-FUERA: sale de la landing la
// galería de perfiles inventados de #ejemplos («Así queda tu Instagram con
// nosotros»: cafe.aurora, bustos.detailing, tiendacora, roca.propiedades y
// el resto del registro vidriera con seguidores inventados). Decisión de
// Valentino 2026-11-18 18:01 («Sacarla del website»): duplica la prueba
// real (tira semanal, Berry, mes de Tomoko, Patagonia) y rompe la regla de
// marca del mismo día (en el website, solo negocios reales).
// Suite ESTÁTICA (sin boot): la sección ausente ES+EN, su camino de render
// (lpGal*/lpWall*) en 0, el CSS exclusivo de la galería en 0, y los vecinos
// protegidos byte-idénticos por hash: comparador, escena mk-arrive de
// Tomoko, datos de la semana de muestra (LP_WEEK) y el registro LP_PROFILES
// (sobreviviente declarado: lo consume el carrusel de perfiles dormido y su
// copia vive en showcase-pages.js; no es superficie de la landing).
// Uso: node test-lote-galeria-fuera.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const en = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');

let ok = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + name); }
  else { fail++; console.log('  XX  ' + name + (extra ? ' — ' + extra : '')); }
}
function count(s, sub) { return s.split(sub).length - 1; }
function block(s, a, b) {
  // bloque entre marcadores, desde el INICIO de la línea del marcador a
  // (misma extracción con la que se fijaron los hashes sobre la base)
  let i = s.indexOf(a);
  if (i < 0) return '';
  i = s.lastIndexOf('\n', i) + 1;
  const j = s.indexOf(b, i + a.length);
  if (j < 0) return '';
  return s.slice(i, s.lastIndexOf('\n', j));
}
function h16(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16); }

const HANDLES = ['cafe.aurora', 'bustos.detailing', 'tiendacora', 'roca.propiedades'];

// --- sintaxis ---
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public', 'app.js')]); check('app.js: node --check', true); }
catch (e) { check('app.js: node --check', false, String(e).slice(0, 200)); }

// --- ES: la galería y su camino de render, en 0 ---
check('ES: eyebrow «Así queda tu Instagram con nosotros» = 0', count(app, 'Así queda tu Instagram con nosotros') === 0);
check('ES: lp-show-eyebrow = 0', count(app, 'lp-show-eyebrow') === 0);
check('ES: lpWall = 0', count(app, 'lpWall') === 0);
check('ES: lpGal = 0', count(app, 'lpGal') === 0);
check('ES: LP_GAL_FEATURED = 0', count(app, 'LP_GAL_FEATURED') === 0);
check('ES: lpWallCardHTML = 0', count(app, 'lpWallCardHTML') === 0);
check('ES: «Perfiles armados por nosotros» = 0', count(app, 'Perfiles armados por nosotros') === 0);
check('ES: «Ver más ejemplos» = 0', count(app, 'Ver más ejemplos') === 0);
check('ES: clases lp-wall/lp-gal en app.js = 0', count(app, 'lp-wall') === 0 && count(app, 'lp-gal') === 0);

// --- ES: la sección #ejemplos sobrevive con su puerta y la escena real ---
const ejES = block(app, 'id="ejemplos"', '<div class="pz-beforeafter">');
check('ES: #ejemplos presente', ejES.length > 0);
check('ES: #ejemplos conserva el form de la puerta (lp-show-cta)', ejES.includes('lp-show-cta'));
check('ES: #ejemplos conserva la escena de Tomoko (mk-arrive)', ejES.includes('mk-arrive'));
check('ES: handles inventados dentro de #ejemplos = 0', HANDLES.every((x) => !ejES.includes(x)));

// --- ES: vecinos protegidos byte-idénticos (hash sobre la base f841fe44) ---
// RE-PIN liberación PURGA-HANDLES: comparador/LP_WEEK/LP_PROFILES ES y comparador EN
// cambian POR DISEÑO en ese lote (purga de handles inventados); hashes re-fijados
// sobre el árbol de liberación de PURGA. mk-arrive queda intacto en ambos idiomas.
check('ES: comparador byte-idéntico', h16(block(app, '<div class="pz-beforeafter">', '<div class="section lp-week-sec" id="prueba">')) === 'ff06d9ef0c2b935c');
check('ES: mk-arrive byte-idéntico', h16(block(app, '<div class="mk-arrive">', '<div class="pz-beforeafter">')) === '9dafbf981845f6d4');
check('ES: LP_WEEK (semana de muestra) byte-idéntico', h16(block(app, 'const LP_WEEK = {', 'const LP_WEEK_POOLS = {')) === 'c7e81de87651dda8');
check('ES: LP_PROFILES (sobreviviente declarado) byte-idéntico', h16(block(app, 'const LP_PROFILES = [', 'function lpTiles(p)')) === 'ddfa5f99442396e9');
check('ES: carrusel de Patagonia presente (mk-carr)', app.includes('mk-carr-head') && app.includes('Patagonia · deslizá'));

// --- EN: espejo ---
check('EN: eyebrow «This is what your Instagram looks like with us» = 0', count(en, 'This is what your Instagram looks like with us') === 0);
check('EN: lp-wall-card = 0', count(en, 'lp-wall-card') === 0);
check('EN: lpWall = 0', count(en, 'lpWall') === 0);
check('EN: lpGal = 0', count(en, 'lpGal') === 0);
check('EN: clases lp-wall/lp-gal en EN = 0', count(en, 'lp-wall') === 0 && count(en, 'lp-gal') === 0);
const ejEN = block(en, 'id="ejemplos"', '<div class="pz-beforeafter">');
check('EN: #ejemplos presente con form + mk-arrive', ejEN.includes('lp-show-cta') && ejEN.includes('mk-arrive'));
check('EN: handles inventados dentro de #ejemplos = 0', HANDLES.every((x) => !ejEN.includes(x)));
check('EN: comparador byte-idéntico', h16(block(en, '<div class="pz-beforeafter">', '<div class="section lp-week-sec" id="prueba">')) === '9c283104c13bd311');
check('EN: mk-arrive byte-idéntico', h16(block(en, '<div class="mk-arrive">', '<div class="pz-beforeafter">')) === 'fe2126cfb9069ccf');

// --- CSS: reglas exclusivas de la galería en 0, vecinos intactos ---
check('CSS: .lp-wall = 0', count(css, '.lp-wall') === 0);
check('CSS: .lp-gal = 0', count(css, '.lp-gal') === 0);
check('CSS: .lp-show-eyebrow = 0', count(css, '.lp-show-eyebrow') === 0);
check('CSS: regla compartida .wb-ic conserva a los vecinos sin .lp-wall-nav',
  css.includes('.lp-view-nav .wb-ic,.ej-nav .wb-ic,.lb-nav .wb-ic,.x .wb-ic{width:1.1em;height:1.1em;vertical-align:-0.15em}')
  && !css.includes('.lp-wall-nav'));
check('CSS: .lp-show sobrevive idéntica', css.includes('.lp-show{margin-top:36px}'));
check('CSS: .lp-show-cta sobrevive idéntica', css.includes('.lp-show-cta{text-align:center;margin-top:22px}'));
check('CSS: .igp-grid.igp-pre (vecina) sobrevive idéntica', css.includes('.igp-grid.igp-pre>*{opacity:0;transform:scale(.93)}'));
check('CSS: llaves balanceadas', count(css, '{') === count(css, '}'));

// --- stamps preparados (el liberador re-fija por orden de aterrizaje) ---
check('stamps: index ES app.js?v=804', idx.includes('app.js?v=804'));
check('stamps: index ES styles.css?v=20261300', idx.includes('styles.css?v=20261300'));
check('stamps: EN styles.css?v=20261300', en.includes('styles.css?v=20261300'));

console.log(`\nGALERIA-FUERA: ${ok} ok · ${fail} mal`);
process.exit(fail ? 1 : 0);
