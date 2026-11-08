// test-lote-perfil-feed.js — LOTE PERFIL-JUNTO-AL-FEED (v817, 8/11):
// decisión Valentino 14:03 («Sí, perfecto, dale» sobre el mock v1):
// el bloque de perfil (homeHeadHTML — avatar + nombre + handle + stats
// «N publicaciones · N seguidores · N seguido» + «¿Cómo publica Posty?»)
// SALE de arriba de Inicio y BAJA a encabezar la grilla del feed
// (inmediatamente antes del div .hf-grid). Solo se mueve la LLAMADA:
// homeHeadHTML no se toca (el diseño fino del perfil del lote v810 se
// fusiona solo en el re-base del preparador). Arriba Inicio arranca con
// el saludo de Posty (pzHoySpeechHTML, primer contenido de hoyAprobarHTML).
// No se tocan: colores (lote glass), saludo, contenido del perfil, grilla.
// Uso: node test-lote-perfil-feed.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

function extractFn(src, sig, endMark) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = endMark ? src.indexOf(endMark, a + 10) : src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
const cnt = (s, re) => (s.match(re) || []).length;

/* ---------- 1. Orden estático en inicioView ---------- */
console.log('— orden: el perfil baja a la grilla, ya no está arriba —');
const iv = extractFn(app, 'async function inicioView()', '\nfunction pzFeedFmtN');
ok(!!iv, 'extrae inicioView');
const retStart = iv.indexOf('return `<div id="inicioView" class="hf-wrap${HF_VISITOR');
ok(retStart >= 0, 'inicioView rinde #inicioView (return final, no el del ritual)');
const ret = iv.slice(retStart);
const idxHead = ret.indexOf('${homeHeadHTML(prof');
const idxGrid = ret.indexOf('${gridHTML}');
const idxHoy = ret.indexOf('${hoyAprobarHTML}');
const idxActions = ret.indexOf('hfProfileActionsHTML');
const idxTabs = ret.indexOf('${hfTabsHTML');
ok(idxHead >= 0 && cnt(ret, /\$\{homeHeadHTML\(prof/g) === 1, 'la llamada a homeHeadHTML aparece UNA sola vez en inicioView');
ok(idxHead > idxHoy, 'el perfil está DESPUÉS de la vista Hoy (saludo + subida + semana + posteo del día)');
ok(idxHead > idxActions && idxHead > idxTabs, 'el perfil está después de las acciones y de las pestañas');
ok(idxHead < idxGrid, 'el perfil está ANTES de la grilla');
const between = ret.slice(idxHead, idxGrid);
const betweenNoComment = between.replace(/<!--[\s\S]*?-->/, '');
ok(/^\s*\$\{homeHeadHTML\(prof[\s\S]*\)\}\s*$/.test(betweenNoComment), 'entre el perfil y la grilla no hay ningún otro bloque (solo el comentario del lote)');
ok(ret.slice(0, idxHoy).indexOf('homeHeadHTML') < 0, 'arriba de Inicio (antes de la vista Hoy) no hay perfil');
ok(app.includes('LOTE PERFIL-JUNTO-AL-FEED'), 'el comentario del lote está en app.js');
ok(ret.includes('splitHead: true'), 'la llamada conserva splitHead: true');

/* ---------- 2. El saludo es el primer contenido de Inicio ---------- */
console.log('— saludo primero —');
const hoyBlock = extractFn(app, 'const hoyAprobarHTML = (!HF_VISITOR)', '\n  // (LOTE HOY-SEGMENTER-Y-BOTON');
ok(!!hoyBlock, 'extrae hoyAprobarHTML');
ok(hoyBlock.indexOf('pzHoySpeechHTML') >= 0, 'la vista Hoy incluye el saludo de Posty');
const hoyRet = hoyBlock.slice(hoyBlock.indexOf('return `<div id="pzHoyAprobar"'));
ok(hoyRet.indexOf('pzHoySpeechHTML') < hoyRet.indexOf('pzHoyUploadHTML'), 'el saludo es lo PRIMERO de la vista Hoy (antes de Subir)');
ok(hoyRet.indexOf('pzHoySpeechHTML') < hoyRet.indexOf('pzHoySemanaHTML'), 'el saludo va antes de la semana');

/* ---------- 3. homeHeadHTML intacto (contenido, no se toca) ---------- */
console.log('— homeHeadHTML intacto: mismo contenido —');
const hh = extractFn(app, 'function homeHeadHTML');
ok(!!hh, 'extrae homeHeadHTML');
ok(hh.includes('hf-stat') && cnt(hh, /hf-stat/g) >= 3, 'las 3 stats siguen (publicaciones · seguidores · seguidos)');
ok(hh.includes('publicaciones') && hh.includes('seguidores') && hh.includes('seguidos'), 'las etiquetas ES de las stats siguen');
ok(hh.includes('¿Cómo publica Posty?'), 'el enlace «¿Cómo publica Posty?» sigue');
ok(hh.includes('hf-racha') && hh.includes('headIconsHTML'), 'la fila de info + íconos sigue');
ok(hh.includes('splitHead'), 'el flag splitHead sigue en homeHeadHTML');
ok(hh.includes('hf-prow') && hh.includes('hf-ava') && hh.includes('hf-stats'), 'avatar + stats en .hf-prow siguen');

/* ---------- 4. Render real de homeHeadHTML (ES/EN) ---------- */
console.log('— render real: perfil completo ES/EN —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const pzDecEnt = extractFn(app, 'function pzDecEnt');
ok(!!escLine && !!pzDecEnt, 'extrae esc + pzDecEnt');
const ctx = { console, pzIc: (n) => '<i data-ic="' + n + '"></i>' };
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + pzDecEnt + '\n' + hh, ctx);
const prof = { username: 'posty.communitymanager', name: 'Posty', pic: '', posts_count: 14, followers: 8, following: 1, bio: 'Posty publica por vos.', link: '', is_verified: true };
const outES = vm.runInContext(`homeHeadHTML(${JSON.stringify(prof)}, 'Mi negocio', { en: false, storyRing: '', tab: 'posts', splitHead: true, racha: 0, headIcons: true })`, ctx);
ok(typeof outES === 'string' && outES.includes('posty.communitymanager'), 'ES: rinde el @ del cliente');
ok(outES.includes('<b>14</b>') && outES.includes('publicaciones') && outES.includes('<b>8</b>') && outES.includes('seguidores') && outES.includes('<b>1</b>') && outES.includes('seguido'), 'ES: stats 14 publicaciones · 8 seguidores · 1 seguido');
ok(outES.includes('¿Cómo publica Posty?'), 'ES: enlace «¿Cómo publica Posty?» presente');
const outEN = vm.runInContext(`homeHeadHTML(${JSON.stringify(prof)}, 'Mi negocio', { en: true, storyRing: '', tab: 'posts', splitHead: true, racha: 0, headIcons: true })`, ctx);
ok(outEN.includes('posts') && outEN.includes('followers') && outEN.includes('following'), 'EN: stats en inglés');
ok(outEN.includes('How does Posty publish?'), 'EN: enlace en inglés presente');

/* ---------- 5. Grilla intacta + «¡Hola!» no tocado ---------- */
console.log('— grilla intacta, saludo del shell intacto —');
ok(app.includes('`<div class="hf-grid">${displayTiles.map((t, i) => homeTileHTML(t, i)).join(\'\')}</div>'), 'la grilla .hf-grid sigue con homeTileHTML');
ok(ret.includes('${gridHTML}'), 'inicioView sigue rindiendo ${gridHTML}');
ok(!iv.includes('¡Hola!'), 'inicioView no toca el «¡Hola!» del shell');
ok(app.includes('¡Hola!'), 'el «¡Hola!» del encabezado del shell sigue vivo en app.js');
ok(css.includes('#inicioView .hf-head'), 'el CSS de .hf-head en Inicio sigue (la piel no cambia)');

console.log(`\nperfil-feed: ${pass} pass, ${fail} fail${fail ? ' — ' + fails.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
