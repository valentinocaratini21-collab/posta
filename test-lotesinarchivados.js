// test-lotesinarchivados.js — LOTE SIN ARCHIVADOS EN LA GRILLA (decisión Valentino 1/11).
// Los posteos archivados en Instagram salen de la grilla del dueño.
// El feed es literal el feed de IG y un archivado ya no está ahí.
// Node puro, lee el árbol. Uso: node test-lotesinarchivados.js
// Alcance: el filtro vive en la CAPA DE VISTA (inicioView, re-render
// f3RevealCheck y added del vivo), NO en el builder: homeGridCompose
// sigue emitiendo la tile con archivedExt (la necesitan el vivo, los
// contadores y Tu archivo). Nada se borra: los archivados siguen en
// Tu archivo → Archivados en Instagram, y si se desarchiva en IG el
// posteo vuelve solo por reconciliación.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
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
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: { getElementById: () => null, activeElement: null, createElement: () => ({}) },
    Intl, Date, Map, Set,
    pcParseDate: (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
    schedDayKeyOf: (dt, tz) => { try { return dt.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } },
    schedPlacements: (all, tz) => {
      const byDay = new Map(), proposals = new Map();
      for (const p of (all || [])) {
        if ((p.status === 'scheduled' || p.status === 'draft') && p.scheduled_at) {
          const k = String(p.scheduled_at).slice(0, 10);
          if (!byDay.has(k)) byDay.set(k, []);
          byDay.get(k).push({ p });
        }
      }
      return { byDay, dayOf: new Map(), proposals };
    },
    pzIc: () => '',
    mv: (x) => x,
    hfArchDate: (s) => String(s || '').slice(0, 10),
    hfArchStatusLabel: (st) => String(st || ''),
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

// ---------- El filtro está en el código, en los tres sitios de vista ----------
t(app.includes(": tiles.filter((t) => t && !t.archivedExt);"), 'inicioView: el dueño filtra archivedExt (rama no-visitante)');
t(app.includes('const tiles = allTiles.filter((t) => t && !t.archivedExt);'), 'f3RevealCheck: el re-render filtra archivedExt');
t(app.includes('if (t2.archivedExt) continue;'), 'vivo added: un archivado no entra ni por el vivo');
t(app.includes('HF_VISITOR ? hfVisitorTiles(tiles) : tiles.filter'), 'inicioView: el visitante sigue por hfVisitorTiles');
t(app.includes('SUPERSEDED 1/11 para'), 'comentario v520 actualizado a la decisión 1/11');
t(!app.includes('el dueño lo ve, no se esconde'), 'la afirmación vieja (dueño ve archivados) ya no está');
t(app.includes("archivedExt: p.ig_state === 'archived_ext'"), 'el builder sigue marcando archivedExt (no se tocó)');
t(app.includes("t.post.ig_state !== 'archived_ext'"), 'hfVisitorTiles sigue excluyendo archivados');

// ---------- Comportamiento: builder intacto, vista del dueño sin archivados ----------
const sb = sandbox();
loadFns(sb, ['hfIgShortcode', 'hfFeedUpcoming', 'hfFeedSortKey', 'hfCmpDescKey', 'homeGridCompose', 'hfVisitorTiles', 'hfArchThumb', 'hfArchiveHTML']);
const F = sb;
const pub = { id: 1, status: 'published', media_type: 'image', image_path: '/media/a.jpg', published_at: '2026-10-20T19:00:00Z', ig_permalink: 'https://www.instagram.com/p/ABC123xyz/' };
const arch = { id: 2, status: 'published', media_type: 'image', image_path: '/media/b.jpg', published_at: '2026-10-10T19:00:00Z', ig_state: 'archived_ext', ig_permalink: 'https://www.instagram.com/p/OLD999/' };
const sched = { id: 3, status: 'scheduled', media_type: 'image', image_path: '/media/c.jpg', scheduled_at: '2026-11-05T19:00:00Z' };
const draftNoDate = { id: 4, status: 'draft', media_type: 'image', image_path: '/media/d.jpg', created_at: '2026-11-01T10:00:00Z' };
const all = [pub, arch, sched, draftNoDate];
const upcoming = F.hfFeedUpcoming(all, 'America/New_York');
const tiles = F.homeGridCompose({ upcoming, published: [pub, arch], recents: [] });
t(tiles.some((x) => x.kind === 'post' && x.post.id === 2 && x.archivedExt === true), 'builder intacto: el archivado sigue rindiendo con archivedExt');
// Espejo exacto del predicado que inicioView/f3 aplican en la vista:
const ownerTiles = tiles.filter((x) => x && !x.archivedExt);
t(!ownerTiles.some((x) => x.kind === 'post' && x.post.id === 2), 'grilla del dueño: ningún tile archived_ext');
t(ownerTiles.map((x) => x.post.id).join(',') === '3,4,1', 'grilla del dueño: orden lote 12 intacto (no publicados, ya salidos): ' + ownerTiles.map((x) => x.post.id).join(','));
t(ownerTiles.some((x) => x.post.id === 1), 'grilla del dueño: el publicado vivo sigue');
t(ownerTiles.some((x) => x.post.id === 3) && ownerTiles.some((x) => x.post.id === 4), 'grilla del dueño: programado y borrador siguen');
const vis = F.hfVisitorTiles(tiles);
t(!vis.some((x) => x.kind === 'post' && x.post.id === 2), 'visitante sigue sin ver el archivado');
t(vis.some((x) => x.kind === 'post' && x.post.id === 1), 'visitante sigue viendo el publicado vivo');
// Solo archivados: la grilla del dueño queda vacía, sin romper nada.
const onlyArch = F.homeGridCompose({ upcoming: [], published: [arch], recents: [] });
t(onlyArch.filter((x) => x && !x.archivedExt).length === 0, 'solo archivados: la grilla del dueño queda vacía (no inventa nada)');
// Desarchivar = volver: sin ig_state, el mismo posteo rinde y pasa el filtro.
const unarch = Object.assign({}, arch);
delete unarch.ig_state;
const tilesUnarch = F.homeGridCompose({ upcoming: [], published: [pub, unarch], recents: [] });
t(tilesUnarch.filter((x) => x && !x.archivedExt).some((x) => x.post.id === 2), 'desarchivado: el posteo vuelve a la grilla del dueño');

// ---------- Tu archivo sigue mostrando los archivados (nada se borra) ----------
const arEs = F.hfArchiveHTML({ archived: [{ id: 7, caption: 'viejo', image_path: '/media/b.jpg', published_at: '2026-10-10T19:00:00Z', ig_permalink: 'https://www.instagram.com/p/OLD999/' }] }, false);
t(arEs.includes('Archivado en Instagram'), 'Tu archivo ES: sección Archivados en Instagram');
t(arEs.includes('salieron de tu grilla allá'), 'Tu archivo ES: nota de archivado intacta');
t(arEs.includes('Verlo en Instagram') && arEs.includes('https://www.instagram.com/p/OLD999/'), 'Tu archivo ES: link a IG intacto');
const sbEn = sandbox({ ME: { lang: 'en' } });
loadFns(sbEn, ['hfArchThumb', 'hfArchiveHTML']);
const arEn = sbEn.hfArchiveHTML({ archived: [{ id: 7, caption: 'old', image_path: '/media/b.jpg', published_at: '2026-10-10T19:00:00Z', ig_permalink: 'https://www.instagram.com/p/OLD999/' }] }, true);
t(arEn.includes('Archived in Instagram'), 'Tu archivo EN: sección Archived in Instagram');
t(arEn.includes('See it in Instagram'), 'Tu archivo EN: link a IG intacto');

console.log(`lotesinarchivados: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
