// LOTE 12 — Orden del feed corregido (fijados, no-publicados desc,
// publicados desc abajo) + corazón abajo a la derecha + perfil blanco.
// Referencia: Valentino 31/10, probando el build 3 (v512): «Los posteos
// que ya salieron tienen que ir abajo de todo. Los proximos en salir a
// continuacion de esos posts, y los que van a Salir mas adelante arriba
// de todo» + «El corazon que este abajo a la derecha. A la derecha del
// dia y la hora» + «Que la parte de arriba del perfil, este en blanco
// tambien». Corrige al Lote 11 (su ascendente fue una mala lectura).
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

// ---------- hfCmpDescKey: descendente con sin-fecha al final ----------
{
  const sb = sandbox();
  loadFns(sb, ['hfCmpDescKey']);
  const c = sb.hfCmpDescKey;
  t(c(100, 50) === -50, 'desc: mayor primero');
  t(c(50, 100) === 50, 'desc: menor después');
  t(c(100, 100) === 0, 'desc: empate queda estable');
  t(c(Infinity, 100) === 1, 'desc: sin fecha va al final (no sube primero)');
  t(c(100, Infinity) === -1, 'desc: con fecha va antes que sin fecha');
  t(c(Infinity, Infinity) === 0, 'desc: dos sin fecha empatan');
}

// ---------- homeGridCompose: orden Lote 12 ----------
{
  const sb = sandbox({ HOME_FEED_CAP: 24 });
  loadFns(sb, ['pcParseDate', 'schedYmdToDate', 'hfFeedSortKey', 'hfCmpDescKey', 'homeGridCompose']);
  const P = (id, st, pub, sch) => ({ id, status: st, published_at: pub, scheduled_at: sch, media_type: 'image', image_path: 'x.jpg' });
  // Ejemplo del encargo: programado 29/10 + borrador 27/10 + publicado
  // 28/10 + publicado 20/10 → de arriba a abajo: 29, 27, 28, 20.
  const ejemplo = sb.homeGridCompose({
    upcoming: [
      { p: P(29, 'scheduled', null, '2026-10-29T18:00:00Z'), ymd: '2026-10-29' },
      { p: P(27, 'draft', null, null), ymd: '2026-10-27' },
    ],
    published: [
      P(28, 'published', '2026-10-28T18:00:00Z'),
      P(20, 'published', '2026-10-20T18:00:00Z'),
    ],
    recents: [],
  });
  t(ejemplo.map((x) => x.post.id).join(',') === '29,27,28,20', 'orden: ejemplo del encargo 29,27,28,20 (no-pub desc + pub desc)');
  // Borrador con día pasado sigue siendo no-publicado: va arriba aunque
  // su fecha sea más vieja que el publicado (el grupo es por ESTADO).
  const pasado = sb.homeGridCompose({
    upcoming: [{ p: P(10, 'draft', null, null), ymd: '2026-10-20' }],
    published: [P(28, 'published', '2026-10-28T18:00:00Z')],
    recents: [],
  });
  t(pasado.map((x) => x.post.id).join(',') === '10,28', 'grupo por estado: borrador con día pasado va en no-publicados, arriba del publicado');
  // Fijado primero, como siempre (regla IG intacta).
  const fijado = sb.homeGridCompose({
    upcoming: [{ p: P(29, 'scheduled', null, '2026-10-29T18:00:00Z'), ymd: '2026-10-29' }],
    published: [
      P(28, 'published', '2026-10-28T18:00:00Z'),
      Object.assign(P(22, 'published', '2026-10-21T18:00:00Z'), { pinned: true, pinned_at: '2026-10-01T00:00:00Z' }),
    ],
    recents: [],
  });
  t(fijado.map((x) => x.post.id).join(',') === '22,29,28', 'orden: fijado primero, después no-pub desc, después pub desc');
  // Sin fecha: al final de su grupo, nunca inventada.
  const sinFecha = sb.homeGridCompose({
    upcoming: [
      { p: P(29, 'scheduled', null, '2026-10-29T18:00:00Z'), ymd: '2026-10-29' },
      { p: P(99, 'draft', null, null), ymd: null },
    ],
    published: [
      P(28, 'published', '2026-10-28T18:00:00Z'),
      P(98, 'published', null, null),
    ],
    recents: [],
  });
  t(sinFecha.map((x) => x.post.id).join(',') === '29,99,28,98', 'sin fecha: al final de su grupo (borrador sin fecha último de no-pub, publicado sin fecha último de pub)');
  // IG recents: son ya salidos, van en el bloque de abajo, desc.
  const conIg = sb.homeGridCompose({
    upcoming: [{ p: P(29, 'scheduled', null, '2026-10-29T18:00:00Z'), ymd: '2026-10-29' }],
    published: [P(28, 'published', '2026-10-28T18:00:00Z')],
    recents: [{ img: 'ig.jpg', type: 'image', taken_at: 1761000000 }],
  });
  const idsIg = conIg.map((x) => (x.kind === 'post' ? String(x.post.id) : 'ig'));
  t(idsIg.join(',') === '29,28,ig', 'IG: reciente va en el bloque de publicados, descendente');
  // Valores de fecha no se tocan.
  t(ejemplo.every((x) => !x.post || typeof x.post.published_at === 'string' || x.post.published_at == null), 'valores: ninguna fecha mutada por el orden');
}

// ---------- feedPreviewHTML: mismo orden (fuente) ----------
{
  const fp = app.slice(app.indexOf('function feedPreviewHTML'), app.indexOf('function bindScfMinis'));
  t(/a\.kind !== b\.kind/.test(fp), 'feed agenda: agrupa no-publicados antes que publicados');
  t(/hfCmpDescKey/.test(fp), 'feed agenda: descendente con la misma clave que la home');
  t(!/hfFeedSortKey\(\{ kind: 'post', post: a\.p[^}]*\}\) - hfFeedSortKey/.test(fp), 'feed agenda: ya no ordena ascendente (Lote 11 superseded)');
}

// ---------- Semana sigue ascendente por día (no es un feed, no se toca) ----------
{
  const sv = app.slice(app.indexOf('async function scheduleView'), app.indexOf('async function scheduleView') + 20000);
  t(/\.sort\(\(a, b\) => a\.d - b\.d\)/.test(sv), 'semana: scheduled y publicados siguen ascendentes por día (sin cambio)');
}

// ---------- Corazón abajo a la derecha ----------
{
  const sb = sandbox({
    pzIc: () => '<svg>',
    mv: (x) => x,
    hfWhenChip: () => 'vie 31 · 18:00',
    hfPlanChip: () => 'vie 31',
    HOME_PIN_SVG: '', HOME_REEL_SVG: '', HOME_CAR_SVG: '',
  });
  loadFns(sb, ['homeTileHTML']);
  const out = sb.homeTileHTML({ kind: 'post', post: { id: 7, status: 'draft', media_type: 'image', image_path: 'x.jpg' }, day: '2026-10-31' }, 0);
  t((out.match(/data-hf-like/g) || []).length === 1, 'corazón: uno solo por posteo, no duplicado');
  t(!/hf-cell-actions/.test(out), 'corazón: sigue sin fila abajo');
  t(/hf-like-in/.test(out), 'corazón: clase superpuesta presente');
  t(/Aprobar con corazón/.test(out), 'corazón: misma acción (aprobar) y mismo aria-label');
  const guardDetail = app.slice(app.indexOf('function hfDetailBind'), app.indexOf('function hfLikeBind'));
  t(/closest\('\[data-hf-like\]'\)/.test(guardDetail), 'guard: hfDetailBind (capture) deja pasar el click del corazón');
  const scf = app.slice(app.indexOf('function bindScfMinis'), app.indexOf('function scfWireGlobals'));
  t(/closest\('\[data-hf-like\]'\)/.test(scf), 'guard: bindScfMinis no abre la capa con el toque del corazón');
  t(/\.hf-like-in\{[^}]*position:absolute/.test(css), 'css: hf-like-in absoluto');
  t(/\.hf-like-in\{[^}]*bottom:8px;right:8px/.test(css), 'css: hf-like-in abajo a la derecha');
  t(!/\.hf-like-in\{[^}]*top:8px;left:8px/.test(css), 'css: hf-like-in ya NO está arriba a la izquierda (Lote 11 superseded)');
  t(/\.hf-like-in\{[^}]*z-index:5/.test(css), 'css: hf-like-in por encima de la foto');
  t(/\.hf-chip\{[^}]*left:6px;bottom:6px/.test(css), 'css: chapita sigue abajo a la izquierda (misma franja que el corazón)');
  t(/\.hf-tile\{[^}]*position:relative/.test(css), 'css: la tile ya es relative, el absoluto ancla bien');
}

// ---------- Perfil blanco ----------
{
  t(/\.hf-head\{[^}]*background:#fff/.test(css), 'css: hf-head con fondo blanco en base');
  t(/\.hf-head,.fp-head\{background:#fff;color:#0a1e33\}/.test(css), 'css: override oscuro pone hf-head y fp-head en blanco con texto oscuro');
  t(/\.hf-head \.hf-user,.hf-head \.hf-name,.hf-head \.hf-bio,.hf-head \.hf-stat b,.fp-head \.fp-name\{color:#0a1e33\}/.test(css), 'css: textos del encabezado vuelven a oscuro legible en modo oscuro');
  t(/#pzNivelStrip\{[^}]*background:#0A1E33/.test(css), 'css: la tirita del jardín NO se toca (sigue navy en oscuro)');
}

console.log(`lote12: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
