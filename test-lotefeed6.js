// test-lotefeed6.js — LOTE FEED-6-PUBLICADOS (decisión Valentino 2/11).
// Los posteos ya publicados NO son importantes para el producto: en el
// feed del producto se muestran MÁXIMO 6 publicados, los 6 últimos. Del
// 7º en adelante no se renderizan en la grilla. NO se borra nada de
// Instagram, NO se archiva nada: simplemente no rinde.
// Node puro, lee el árbol. Uso: node test-lotefeed6.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
function sandbox(extra) {
  const sb = {
    console,
    ME: { lang: 'es' },
    Intl, Date, Map, Set,
    pcParseDate: (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
    schedYmdToDate: (ymd) => { const d = new Date(ymd + 'T00:00:00Z'); return isNaN(d) ? null : d; },
  };
  Object.assign(sb, extra || {});
  vm.createContext(sb);
  return sb;
}
function loadFns(sb, names) {
  for (const n of names) {
    const code = extractFn(app, n);
    t(code.length > 0, 'existe ' + n);
    if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
}
const sb = sandbox();
loadFns(sb, ['pcParseDate', 'schedYmdToDate', 'hfFeedSortKey', 'hfCmpDescKey', 'hfIgShortcode', 'homeGridCompose', 'hfVisitorTiles']);
const P = (id, st, pub, sch) => ({ id, status: st, published_at: pub, scheduled_at: sch, media_type: 'image', image_path: 'x.jpg' });
const pubIds = (tiles) => tiles.filter((x) => x.kind === 'post' && x.post && x.post.status === 'published').map((x) => x.post.id);
const igImgs = (tiles) => tiles.filter((x) => x.kind === 'ig').map((x) => x.img);

// ---------- Censo (referencia v596: pin rotado en la liberación, era v547) ----------
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 17, 'censo server: /aprobar 17 (pin rotado en la liberación v596: ruta espejo v582 sumó 1, era 16 en v547)');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6 (pin rotado en la liberación v596: chats v566 sumaron 2, era 4 en v547)');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: /aprobar 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');
t(!/function pz[A-Z]\w*Feed6|function hfFeed6/.test(app), 'M78: ninguna función nueva en app.js');

// ---------- 1. Exactamente 6 publicados: se ven los 6 ----------
{
  const pubs = [];
  for (let d = 1; d <= 6; d++) pubs.push(P(200 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`));
  const tiles = sb.homeGridCompose({ upcoming: [], published: pubs, recents: [] });
  t(pubIds(tiles).join(',') === '206,205,204,203,202,201', '6 publicados: se ven los 6, más reciente primero');
}

// ---------- 2. 12 publicados: solo los 6 más recientes, en orden DESC ----------
{
  const pubs = [];
  for (let d = 1; d <= 12; d++) pubs.push(P(300 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`));
  const tiles = sb.homeGridCompose({ upcoming: [], published: pubs, recents: [] });
  t(pubIds(tiles).join(',') === '312,311,310,309,308,307', '12 publicados: solo los 6 últimos (7–12 oct), resto fuera');
  t(!pubIds(tiles).includes(301) && !pubIds(tiles).includes(306), '12 publicados: los 6 viejos (1–6 oct) NO rinden');
}

// ---------- 3. Mezcla publicados + IG: el tope es del GRUPO ya salido ----------
{
  const pubs = [];
  for (let d = 1; d <= 4; d++) pubs.push(P(400 + d, 'published', `2026-10-${String(d + 20).padStart(2, '0')}T18:00:00Z`));
  const recents = [];
  for (let i = 0; i < 5; i++) recents.push({ img: '/ig/m' + i + '.jpg', type: 'image', taken_at: 1760000000 + i * 86400, shortcode: 'MAN' + i });
  const tiles = sb.homeGridCompose({ upcoming: [], published: pubs, recents });
  const yaSalidos = tiles.filter((x) => x.kind === 'ig' || (x.kind === 'post' && x.post.status === 'published'));
  t(yaSalidos.length === 6, 'mezcla pub+IG: el grupo ya salido se corta en 6 en total, no 6+6');
  t(pubIds(tiles).length === 4 && igImgs(tiles).join(',') === '/ig/m4.jpg,/ig/m3.jpg', 'mezcla pub+IG: 4 publicados + 2 IG más nuevos (m4, m3)');
  t(!igImgs(tiles).includes('/ig/m0.jpg'), 'mezcla pub+IG: el IG más viejo queda fuera');
}

// ---------- 4. Programados y borradores intactos, sin tope ----------
{
  const upcoming = [];
  for (let i = 0; i < 10; i++) upcoming.push({ p: P(500 + i, i % 2 ? 'draft' : 'scheduled', null, `2026-11-${String(i + 1).padStart(2, '0')}T18:00:00Z`), ymd: `2026-11-${String(i + 1).padStart(2, '0')}` });
  const pubs = [];
  for (let d = 1; d <= 9; d++) pubs.push(P(600 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`));
  const tiles = sb.homeGridCompose({ upcoming, published: pubs, recents: [] });
  t(tiles.filter((x) => x.kind === 'post' && x.post.status !== 'published').length === 10, 'programados+borradores: los 10 rinden, sin tope nuevo');
  t(pubIds(tiles).length === 6, 'programados+borradores: los publicados igual se cortan en 6');
  t(tiles[0].post.id === 509, 'orden v513 intacto: no-publicados primero (desc), ya salidos abajo');
}

// ---------- 5. Fijado publicado: fuera del tope (elección explícita del dueño) ----------
{
  const pubs = [Object.assign(P(700, 'published', '2026-10-01T18:00:00Z'), { pinned: true, pinned_at: '2026-10-01T00:00:00Z' })];
  for (let d = 2; d <= 10; d++) pubs.push(P(700 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`));
  const tiles = sb.homeGridCompose({ upcoming: [], published: pubs, recents: [] });
  t(tiles[0].post.id === 700, 'fijado: primero, como siempre (regla IG intacta)');
  t(pubIds(tiles).length === 7, 'fijado: no consume tope (1 fijado + 6 recientes); documentado, no es fuga: se desfija y sale');
}

// ---------- 6. Visitante: mismo tope (misma composición) ----------
{
  const pubs = [];
  for (let d = 1; d <= 10; d++) pubs.push(P(800 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`));
  const tiles = sb.homeGridCompose({ upcoming: [], published: pubs, recents: [] });
  const vis = sb.hfVisitorTiles(tiles);
  t(vis.length === 6 && pubIds(vis).join(',') === '810,809,808,807,806,805', 'visitante: mismo tope 6 (misma composición, hfVisitorTiles filtra después)');
}

// ---------- 7. Contadores y archivo no se tocan ----------
t(!/posts_count|followers/.test(extractFn(app, 'homeGridCompose')), 'contadores: homeGridCompose no toca posts_count/followers (vienen del snapshot de IG)');
t(app.includes('function hfArchiveHTML'), 'Tu archivo intacto: hfArchiveHTML sigue definido (los archivados siguen ahí)');
// server.js sin tocar: el corte es solo render (ver diff; este assert lo fija)
t(srv.includes("const BUILD_ID = '20261101-v596'"), 'server.js intacto en v596 (el corte es solo render; BUILD solo)');

console.log(`\nlotefeed6: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
