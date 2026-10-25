'use strict';
/* test-reorden-cabecera.js — v468 · orden Instagram de la cabecera:
 * bio -> acciones -> destacadas -> pestañas -> grilla.
 * homeHeadHTML se parte en slots: con splitHead:true devuelve solo la
 * bio (Inicio compone acciones + destacadas + pestañas aparte); sin el
 * flag, la salida completa no cambia (preview de edición).
 * Uso: node test-reorden-cabecera.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const IDX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

const sb = {
  console, Date, Math, JSON,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
};
vm.createContext(sb);
const a = APP.indexOf('function hfHighlightsTrayHTML(');
const b = APP.indexOf('/* ===== (Tanda 4 del feed)', a);
ok(a > -1 && b > a, 'slots de cabecera delimitados en app.js');
vm.runInContext(APP.slice(a, b), sb);
ok(typeof sb.hfHighlightsTrayHTML === 'function' && typeof sb.hfTabsHTML === 'function'
  && typeof sb.homeHeadHTML === 'function', 'helpers + homeHeadHTML cargan en el sandbox');

// — Destacadas: tira propia —
const profHl = { username: 'u', name: 'N', bio: 'Bio', highlights: [{ title: 'Menú', cover: '' }, { title: 'Viajes', cover: '' }] };
const tray = sb.hfHighlightsTrayHTML(profHl, { en: false, coversPlus: true });
ok(tray.includes('hf-hls') && tray.includes('hf-hl-plus') && tray.includes('Menú') && tray.includes('Viajes')
  && tray.indexOf('hf-hl-plus') < tray.indexOf('Menú'), 'destacadas dueño: tira + tile «+» primero + títulos');
ok(sb.hfHighlightsTrayHTML(profHl, { en: false }).includes('Menú')
  && !sb.hfHighlightsTrayHTML(profHl, { en: false }).includes('hf-hl-plus'), 'destacadas visitante: sin tile «+»');
ok(sb.hfHighlightsTrayHTML({ username: 'u', highlights: [] }, { en: false }) === '', 'destacadas: sin datos, sin tira');
ok(sb.hfHighlightsTrayHTML(profHl, { en: true, coversPlus: true }).includes('Covers'), 'destacadas EN: «Covers»');

// — Pestañas: slot propio justo antes de la grilla —
const tabsEs = sb.hfTabsHTML('posts', false);
ok(tabsEs.includes('hf-tabs') && tabsEs.includes('data-hf-tab="posts"') && tabsEs.includes('aria-selected="true"')
  && tabsEs.includes('Publicaciones') && tabsEs.includes('Etiquetados'), 'pestañas ES: posts activo');
const tabsEn = sb.hfTabsHTML('tagged', true);
const taggedBtn = tabsEn.slice(Math.max(0, tabsEn.indexOf('data-hf-tab="tagged"') - 200), tabsEn.indexOf('data-hf-tab="tagged"'));
ok(tabsEn.includes('Tagged') && taggedBtn.includes('aria-selected="true"'), 'pestañas EN: tagged activo');
ok(sb.hfTabsHTML('otro', false).includes('data-hf-tab="posts"'), 'pestañas: tab inválido cae a posts');

// — homeHeadHTML: salida completa intacta sin flag —
const full = sb.homeHeadHTML(profHl, 'X', { en: false, tab: 'posts', coversPlus: true });
ok(full.includes('hf-head') && full.includes('Bio') && full.includes('hf-hls') && full.includes('hf-tabs'),
  'homeHeadHTML sin flag: bio + destacadas + pestañas (preview intacto)');
const split = sb.homeHeadHTML(profHl, 'X', { en: false, tab: 'posts', coversPlus: true, splitHead: true });
ok(split.includes('hf-head') && split.includes('Bio') && !split.includes('hf-hls') && !split.includes('hf-tabs'),
  'homeHeadHTML splitHead: solo bio, sin destacadas ni pestañas');

// — Orden en inicioView (fuente) —
const iv = APP.indexOf('return `<div id="inicioView"');
const chain = ['setupMainHTML()', '${nivelStripHTML}', 'splitHead: true', 'hfProfileActionsHTML(enHome)',
  'hfHighlightsTrayHTML(prof', '${storiesHTML}', 'hfTabsHTML(HF_TAB', '${gridHTML}'];
let prev = iv, chainOk = iv > -1;
for (const tok of chain) {
  const at = APP.indexOf(tok, prev);
  if (at < 0) { chainOk = false; break; }
  prev = at;
}
ok(chainOk, 'inicioView: tira -> bio -> acciones -> destacadas -> historias -> pestañas -> grilla');

// — Pines de versión —
ok(IDX.includes('/app.js?v=299') && !IDX.includes('/app.js?v=298'), 'index.html: app.js ?v=299, sin 298 residual');

console.log(`\nreorden-cabecera: ${total - fails}/${total}`);
process.exit(fails ? 1 : 0);
