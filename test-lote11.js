// LOTE 11 — Actualizado por LOTE 12: orden corregido (no-publicados
// desc, publicados desc abajo) + corazón abajo a la derecha.
// (El ascendente y la esquina superior izquierda originales quedaron
// SUPERSEDED por el criterio aprobado del Lote 12.)
// Referencia: Valentino 31/10, probando el build 3 (v511): «Los posteos
// de mas arriba tienen fecha mas cercana a hoy, y tiene q ser al reves»
// + «el corazón de aprobar va ADENTRO de la foto».
// Estilo de los lotes: asserts planos, sin framework; sandbox vm solo
// donde hace falta ejecutar una función (con stubs mínimos).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
function t(cond, name) {
  if (cond) { ok++; }
  else { bad++; console.log('✗', name); }
}
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');

// Extrae una función top-level (declaración `function NAME` hasta el `}`
// a columna 0 que la cierra) para ejecutarla en sandbox.
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
    document: { getElementById: () => null },
    Intl,
    Date,
    Map,
    Set,
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
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

// ---------- hfFeedSortKey ----------
{
  const sb = sandbox();
  loadFns(sb, ['pcParseDate', 'schedYmdToDate', 'hfFeedSortKey']);
  const k = sb.hfFeedSortKey;
  t(k({ kind: 'post', post: { status: 'published', published_at: '2026-10-28T10:00:00Z', scheduled_at: '2026-10-20T10:00:00Z' } }) === Date.parse('2026-10-28T10:00:00Z'), 'key: publicado usa published_at, no scheduled_at');
  t(k({ kind: 'post', post: { status: 'scheduled', scheduled_at: '2026-10-29T18:00:00Z' } }) === Date.parse('2026-10-29T18:00:00Z'), 'key: programado usa scheduled_at');
  t(k({ kind: 'post', post: { status: 'draft' }, ymd: '2026-10-27' }) === Date.parse('2026-10-27T12:00:00Z'), 'key: borrador por día usa ese día a mediodía UTC');
  t(k({ kind: 'ig', taken_at: 1761000000 }) === 1761000000 * 1000, 'key: reciente IG usa taken_at');
  t(k({ kind: 'post', post: { status: 'draft' } }) === Infinity, 'key: sin fecha va al final, nunca inventada');
}

// ---------- homeGridCompose: orden Lote 12 ----------
{
  const sb = sandbox({ HOME_FEED_CAP: 24 });
  loadFns(sb, ['pcParseDate', 'schedYmdToDate', 'hfFeedSortKey', 'hfCmpDescKey', 'homeGridCompose']);
  const P = (id, st, pub, sch) => ({ id, status: st, published_at: pub, scheduled_at: sch, media_type: 'image', image_path: 'x.jpg' });
  // Caso reportado: solo publicados, entrada lo más nuevo primero.
  const onlyPub = sb.homeGridCompose({
    upcoming: [],
    published: [P(1, 'published', '2026-10-30T18:00:00Z'), P(2, 'published', '2026-10-28T18:00:00Z'), P(3, 'published', '2026-10-20T18:00:00Z')],
    recents: [],
  });
  t(onlyPub.map((x) => x.post.id).join(',') === '1,2,3', 'orden: publicados solos salen nuevo→viejo (descendente, abajo de todo)');
  // Caso mixto: fijado primero, resto = no-publicados desc + publicados desc.
  const mixed = sb.homeGridCompose({
    upcoming: [
      { p: P(10, 'draft', null, null), ymd: '2026-10-27' },
      { p: P(11, 'scheduled', null, '2026-10-29T18:00:00Z'), ymd: '2026-10-29' },
      { p: P(12, 'draft', null, '2026-10-30T18:00:00Z'), ymd: '2026-10-30' },
    ],
    published: [
      P(20, 'published', '2026-10-28T18:00:00Z'),
      P(21, 'published', '2026-10-20T18:00:00Z'),
      Object.assign(P(22, 'published', '2026-10-21T18:00:00Z'), { pinned: true, pinned_at: '2026-10-01T00:00:00Z' }),
    ],
    recents: [{ img: 'ig.jpg', type: 'image', taken_at: 1761000000 }],
  });
  const ids = mixed.map((x) => (x.kind === 'post' ? String(x.post.id) : 'ig'));
  t(ids[0] === '22', 'orden: fijado primero (regla IG, no pedida cambiar)');
  t(ids.slice(1).join(',') === '12,11,10,20,21,ig', 'orden: resto = no-pub desc (borrador 30, prog 29, borrador 27) + pub desc (pub 28, pub 20, ig)');
  // Tope: el conjunto NO cambia (mismo corte de siempre), solo el orden.
  const manyPub = [];
  for (let d = 1; d <= 30; d++) manyPub.push(P(100 + d, 'published', `2026-10-${String(d).padStart(2, '0')}T18:00:00Z`));
  const capped = sb.homeGridCompose({
    upcoming: [
      { p: P(201, 'draft', null, null), ymd: '2026-11-01' },
      { p: P(202, 'draft', null, null), ymd: '2026-11-02' },
    ],
    published: manyPub,
    recents: [],
  });
  t(capped.length === 24, 'tope: siguen siendo 24 tiles');
  const capIds = capped.map((x) => String(x.post.id));
  t(capIds.includes('201') && capIds.includes('202'), 'tope: los próximos de la semana siguen dentro');
  t(!capIds.includes('101') && !capIds.includes('108'), 'tope: los publicados más viejos (1–8 oct) siguen fuera, como antes');
  t(capIds[0] === '202' && capIds[capIds.length - 1] === '109', 'tope: primero el borrador más nuevo (2 nov), último el publicado más viejo del conjunto (9 oct)');
  // Los valores de fecha no se tocan.
  t(capped.every((x) => !x.post || typeof x.post.published_at === 'string' || x.post.published_at == null), 'valores: ninguna fecha mutada por el orden');
}

// ---------- feedPreviewHTML: mismo orden ----------
{
  const fp = app.slice(app.indexOf('function feedPreviewHTML'), app.indexOf('function bindScfMinis'));
  t(/a\.kind !== b\.kind/.test(fp), 'feed agenda: agrupa no-publicados antes que publicados');
  t(/hfCmpDescKey/.test(fp), 'feed agenda: descendente con la misma clave que la home');
}

// ---------- Semana ya era ascendente (consistencia, sin tocarla) ----------
{
  const sv = app.slice(app.indexOf('async function scheduleView'), app.indexOf('async function scheduleView') + 20000);
  t(/\.sort\(\(a, b\) => a\.d - b\.d\)/.test(sv), 'semana: scheduled y publicados ya ordenaban ascendente (sin cambio)');
}

// ---------- Corazón adentro de la foto ----------
{
  const sb = sandbox({
    pzIc: () => '<svg>',
    mv: (x) => x,
    hfWhenChip: () => 'vie 31 · 18:00',
    hfPlanChip: () => 'vie 31',
    HOME_PIN_SVG: '', HOME_REEL_SVG: '', HOME_CAR_SVG: '',
  });
  loadFns(sb, ['hfTileChipParts', 'homeTileHTML']);
  const out = sb.homeTileHTML({ kind: 'post', post: { id: 7, status: 'draft', media_type: 'image', image_path: 'x.jpg' }, day: '2026-10-31' }, 0);
  t((out.match(/data-hf-like/g) || []).length === 1, 'corazón: uno solo por posteo, no duplicado');
  t(!/hf-cell-actions/.test(out), 'corazón: ya no hay fila abajo');
  t(/hf-like-in/.test(out), 'corazón: clase superpuesta presente');
  const tileIdx = out.indexOf('scf-mini-x');
  const btnIdx = out.indexOf('data-hf-like');
  const closeIdx = out.lastIndexOf('</span>');
  t(tileIdx >= 0 && btnIdx > tileIdx && btnIdx < closeIdx, 'corazón: el botón vive DENTRO de la tile (después de scf-mini-x, antes del cierre)');
  t(/Aprobar con corazón/.test(out), 'corazón: misma acción (aprobar) y mismo aria-label');
  const guardDetail = app.slice(app.indexOf('function hfDetailBind'), app.indexOf('function hfLikeBind'));
  t(/closest\('\[data-hf-like\]'\)/.test(guardDetail), 'guard: hfDetailBind (capture) deja pasar el click del corazón');
  const scf = app.slice(app.indexOf('function bindScfMinis'), app.indexOf('function scfWireGlobals'));
  t(/closest\('\[data-hf-like\]'\)/.test(scf), 'guard: bindScfMinis no abre la capa con el toque del corazón');
  t(/\.hf-like-in\{[^}]*position:absolute/.test(css), 'css: hf-like-in absoluto');
  t(/\.hf-like-in\{[^}]*bottom:8px;right:8px/.test(css), 'css: hf-like-in abajo a la derecha (a la derecha de la chapita, misma franja inferior)');
  t(/\.hf-chip\{[^}]*left:6px;bottom:6px/.test(css), 'css: chapita sigue abajo a la izquierda');
  t(/\.hf-like-in\{[^}]*z-index:5/.test(css), 'css: hf-like-in por encima de la foto');
  t(/\.hf-tile\{[^}]*position:relative/.test(css), 'css: la tile ya es relative, el absoluto ancla bien');
  const oldComment = /ningún botón\s*\n?\s*\/\/ flotante tapa la imagen/.test(app);
  t(!oldComment || /ÚNICA excepción/.test(app), 'comentario: la vieja prohibición queda exceptuada solo para el corazón');
}

console.log(`lote11: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
