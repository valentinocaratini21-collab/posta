'use strict';

// =====================================================================
// LOTE CENSO-CONSERJE-2 — suite del lote
// =====================================================================
// El censo está en equipo-posty/censo-conserje-2.md. De las 6 fallas
// candidatas, TRES se confirmaron ejerciendo la función defectuosa
// real y son este lote:
//   F1 · El motivo del posteo fallido no se veía en su tarjeta
//        (decCard pintaba .d-error sin .open y sin botón que lo abra;
//        el CSS lo deja en display:none para siempre).
//   F3 · «Ver el posteo» no podía mostrar posteos fuera de los 12
//        últimos de la ficha (posteosDe LIMIT 12, en silencio).
//   F6 · El chip del posteo fallido imprimía «failed» crudo.
// Las otras tres (F2 feed sin fotos · F4 deep link tras la puerta ·
// F5 ficha que no carga en silencio) quedaron SIN EJERCER por el
// entorno de la noche del censo (Chromium muere con SIGTRAP en el
// sandbox) y NO se construyeron: método del censo, sin confirmación
// no hay arreglo. Su campaña quedó lista en el scratch del lote.
//
// La suite ejercita los arreglos sin boot ni navegador, sobre las
// funciones reales del árbol donde vive:
//   A · Estática de los arreglos + gate de funciones de la consola.
//   B · posteosDe real contra una base en memoria (14 posteos).
//   C · decCard/chipDePost reales, extraídos textuales del bundle.
// Contra la base prístina, las verificaciones de F1/F3/F6 fallan y
// los controles sanos pasan: ese es el control del lote.
// Uso: node test-lote-censo-conserje-2.js — sale 0 si todo pasa.
// =====================================================================

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }

// ---------------------------------------------------------------------
seccion('A · estática de los arreglos + gate de funciones');
const jsSrc = read('public/conserje.js');
const htmlSrc = read('public/conserje.html');
const vistaSrc = read('conserje-vista.js');
const serverSrc = read('server.js');

t('A1 F1: la rama post_fallido pinta el motivo con .open',
  jsSrc.includes(`'<div class="d-error open">' + esc(d.texto || '')`));
t('A2 F6: chipDePost tiene la rama failed en español («No salió ✗», clase red)',
  jsSrc.includes('state-chip red">No salió ✗'));
t('A3 F6: el CSS trae .state-chip.red y el sello de la consola es ?v=5',
  htmlSrc.includes('.state-chip.red{color:#ffc9c9}') && htmlSrc.includes('conserje.js?v=5'));
t('A4 F3: posteosDe incluye el posteo referido (o.postId)',
  vistaSrc.includes('const incluirId = Number(o.postId) || 0') && vistaSrc.includes('if (extra) rows.push(extra);'));
t('A5 F3: la ruta de la ficha reenvía post_id y el cliente lo manda',
  serverSrc.includes('postId: Number(req.query.post_id) || 0')
  && jsSrc.includes("'&post_id=' + Number(postId)")
  && jsSrc.includes('cargarCliente(selUser, highlightPostId);'));
{
  const acts = new Set([...jsSrc.matchAll(/data-act="([a-z0-9-]+)"/g)].map((m) => m[1]));
  const ramas = new Set([...jsSrc.matchAll(/act === '([a-z0-9-]+)'/g)].map((m) => m[1]));
  const sinRama = [...acts].filter((a) => !ramas.has(a));
  t('A6 gate: todo data-act del bundle tiene rama en el handler', sinRama.length === 0, sinRama.join(','));
  const defs = new Set([...jsSrc.matchAll(/function ([A-Za-z0-9_]+)\(/g)].map((m) => m[1]));
  const tocadas = ['cargarCliente', 'gotoFicha', 'decCard', 'chipDePost', 'renderFeed', 'abrirGate', 'toast', 'irAlCentro'];
  t('A7 gate: las funciones del camino tocado existen definidas',
    tocadas.every((f) => defs.has(f)), tocadas.filter((f) => !defs.has(f)).join(','));
}

// ---------------------------------------------------------------------
seccion('B · posteosDe real (base en memoria, 14 posteos)');
function nuevaDb() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(':memory:');
  } catch (e) {
    const BetterSqlite3 = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
    return new BetterSqlite3(':memory:');
  }
}
{
  const db = nuevaDb();
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, image_path TEXT,
    caption TEXT, status TEXT, media_type TEXT, tipo TEXT, scheduled_at TEXT,
    published_at TEXT, created_at TEXT, approval TEXT, source_topic TEXT, error TEXT)`);
  const ins = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, status,
    media_type, tipo, scheduled_at, published_at, created_at, approval, source_topic, error)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (let id = 1; id <= 14; id++) {
    const dia = String(id).padStart(2, '0');
    const fecha = '2026-11-' + dia + ' 19:00:00';
    const status = id === 13 ? 'failed' : (id >= 11 ? 'scheduled' : 'published');
    ins.run(id, 316, '/media/p' + id + '.jpg', 'Posteo número ' + id, status, 'image', '',
      fecha, status === 'published' ? fecha : null, fecha, '', '', id === 13 ? 'motivo x' : '');
  }
  ins.run(50, 999, '/media/ajeno.jpg', 'Posteo de otro', 'published', 'image', '',
    '2026-11-01 19:00:00', '2026-11-01 19:00:00', '2026-11-01 19:00:00', '', '', '');
  const vista = require(path.join(ROOT, 'conserje-vista.js'));
  const OPTS = { absImageUrl: (u, p) => 'http://x' + p, posterUrlFor: () => '' };
  const sin = vista.posteosDe(db, 316, 'America/New_York', OPTS);
  t('B1 sin referido, la ficha sigue en 12 (ids 14..3), con el fallido adentro',
    sin.length === 12 && sin[0].id === 14 && sin[11].id === 3
    && sin.some((p) => p.id === 13 && p.status === 'failed'),
    'n=' + sin.length + ' ids=' + sin.map((p) => p.id).join(','));
  const con = vista.posteosDe(db, 316, 'America/New_York', Object.assign({}, OPTS, { postId: 2 }));
  t('B2 F3: con referido fuera de los 12, la ficha lo incluye (13, con el 2)',
    con.length === 13 && con.some((p) => p.id === 2), 'n=' + con.length);
  const dup = vista.posteosDe(db, 316, 'America/New_York', Object.assign({}, OPTS, { postId: 14 }));
  t('B3 referido ya incluido no duplica (sigue 12)',
    dup.length === 12 && dup.filter((p) => p.id === 14).length === 1);
  const no = vista.posteosDe(db, 316, 'America/New_York', Object.assign({}, OPTS, { postId: 999 }));
  t('B4 referido inexistente no fabrica nada (sigue 12)', no.length === 12);
  const aj = vista.posteosDe(db, 316, 'America/New_York', Object.assign({}, OPTS, { postId: 50 }));
  t('B5 referido de OTRO usuario no se incluye (sigue 12, sin el 50)',
    aj.length === 12 && !aj.some((p) => p.id === 50));
}

// ---------------------------------------------------------------------
seccion('C · funciones puras de render (decCard / chipDePost reales)');
function extraer(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no está function ' + nombre);
  let prof = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') prof++;
    else if (src[j] === '}') { prof--; if (prof === 0) return src.slice(i, j + 1); }
  }
  throw new Error('sin cierre ' + nombre);
}
{
  const meses = jsSrc.match(/var MESES = \[[^\]]*\];/)[0];
  const codigo = [meses, extraer(jsSrc, 'esc'), extraer(jsSrc, 'trunc'), extraer(jsSrc, 'fechaCorta'),
    extraer(jsSrc, 'decTag'), extraer(jsSrc, 'decCard'), extraer(jsSrc, 'chipDePost'),
    'module.exports = { decCard, chipDePost };'].join('\n');
  const m = { exports: {} };
  new Function('module', 'exports', codigo)(m, m.exports);
  const MOTIVO = 'Meta no pudo procesar el video (code 100).';
  const chip = m.exports.chipDePost({ status: 'failed', dia_key: '2026-11-13' });
  t('C1 F6: el chip del fallido dice «No salió ✗» con clase red',
    chip.includes('state-chip red') && chip.includes('No salió ✗'), chip);
  t('C2 sano: el chip de publicado no cambia',
    m.exports.chipDePost({ status: 'published', dia_key: '2026-11-13' }).includes('Publicado ✓'));
  const card = m.exports.decCard({
    tipo: 'post_fallido', clase: 'problema', user_id: 316, business_name: 'Archivo SRL',
    ig_username: 'archivo.srl', titulo: 'Un posteo no salió', texto: MOTIVO, post_id: 13, fecha: '2026-11-23',
  });
  t('C3 F1: la tarjeta del fallido pinta el motivo ABIERTO (.d-error.open) con su texto',
    card.includes('<div class="d-error open">') && card.includes('Meta no pudo procesar'));
  const cardI = m.exports.decCard({
    tipo: 'impulso', clase: 'plata', user_id: 316, business_name: 'Archivo SRL',
    ig_username: 'archivo.srl', post_id: 5, boost_id: 7, budget_cents: 2000,
    texto: 'Error de ejemplo', fecha: '2026-11-23',
  });
  t('C4 sano: la tarjeta de impulso conserva su «Ver error» y su id',
    cardI.includes('impulso-detalle') && cardI.includes('id="err-7"'));
}

console.log('\nTOTAL :: ' + ok + ' ok · ' + mal + ' MAL');
process.exit(mal ? 1 : 0);
