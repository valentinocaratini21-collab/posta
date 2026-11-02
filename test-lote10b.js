// LOTE 10B — Jardín: atrás único, hero por nivel, faltas con botón,
// premio cerca, píldoras parejas, Mi historia, subtítulo corto, semana.
// Referencia: captura Jardín Nv 2 build 3 + 5 + 4 mejoras aprobadas.
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
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');

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

// ---------- A · un solo control atrás en el jardín ----------
{
  const sb = sandbox({ pzIc: (n) => '<svg>' });
  vm.runInContext(extractFn(app, 'pzBackHTML').replace('function pzBackHTML', 'globalThis.pzBackHTML = function'), sb);
  vm.runInContext(extractFn(app, 'pzBackDesktopHTML').replace('function pzBackDesktopHTML', 'globalThis.pzBackDesktopHTML = function'), sb);
  t(sb.pzBackHTML('jardin-posty') === '', 'A: pzBackHTML no pinta círculo en jardin-posty');
  t(sb.pzBackDesktopHTML('jardin-posty') === '', 'A: pzBackDesktopHTML no pinta círculo en jardin-posty');
  t(/pz-back/.test(sb.pzBackHTML('analisis')), 'A: pzBackHTML sigue en las demás pantallas');
  t(sb.pzBackHTML('inicio') === '', 'A: pzBackHTML sigue vacío en inicio');
  const jardinSrc = app.slice(app.indexOf('function mxJardinHTML'), app.indexOf('function mxJardinErrorHTML'));
  t(/mx-volver/.test(jardinSrc) && /Volver/.test(jardinSrc) && /arrowLeft/.test(jardinSrc), 'A: el jardín conserva su propio atrás (flecha + Volver lado a lado)');
  t((app.match(/class="mx-volver"/g) || []).length === 1, 'A: solo el jardín tiene botón volver propio');
  const zBack = Number((css.match(/\.pz-back-fixed\{[^}]*z-index:(\d+)/) || [])[1]);
  const zDet = Number((css.match(/\.hf-dback\{[^}]*z-index:(\d+)/) || [])[1]);
  t(zDet > zBack, 'A: el detalle (z-' + zDet + ') tapa el círculo fijo (z-' + zBack + '), sin superposición visible');
}

// ---------- B + 2-3 · hero = jardín de su nivel ----------
{
  const sb = sandbox();
  vm.runInContext(extractFn(app, 'mxHeroJardin').replace('function mxHeroJardin', 'globalThis.mxHeroJardin = function'), sb);
  t(sb.mxHeroJardin(1) === 'jardin-joven.webp', 'B: Nv 1 → joven');
  t(sb.mxHeroJardin(2) === 'jardin-joven.webp', 'B: Nv 2 → joven (recién empezando, no crecido)');
  t(sb.mxHeroJardin(3) === 'jardin-crece-1.webp', 'B: Nv 3 → crece-1');
  t(sb.mxHeroJardin(4) === 'jardin-crece-2.webp', 'B: Nv 4 → crece-2');
  t(sb.mxHeroJardin(5) === 'jardin-crece-3.webp', 'B: Nv 5 → crece-3');
  t(sb.mxHeroJardin(6) === 'jardin-bambu.webp' && sb.mxHeroJardin(50) === 'jardin-bambu.webp', 'B: Nv 6+ → bambusal maduro');
  for (const f of ['jardin-joven.webp', 'jardin-crece-1.webp', 'jardin-crece-2.webp', 'jardin-crece-3.webp', 'jardin-bambu.webp']) {
    t(fs.existsSync(path.join(__dirname, 'public', f)), 'B: asset en árbol ' + f);
  }
  const postyBranch = app.slice(app.indexOf("if (tipo === 'posty') {"), app.indexOf('function mxJardinErrorHTML'));
  t(/pz-ropa-panel/.test(postyBranch) && /pzRopaAvatarHTML/.test(postyBranch), 'B: el jardín nuevo es avatar + guardarropa'); // LOTE JARDÍN-ROPA (decisión Valentino 2/11): hero de imagen fuera
  t(!/mxFotoJardin/.test(postyBranch), 'B: el hero ya NO es la última foto publicada (ahí se colaba la promo con la cara)');
  t(!/onerror="[^"]*ai-avatar/.test(postyBranch), 'B: el hero no tiene fallback al avatar (LOTE 15: la cara de Posty vive como overlay, no como fallback)');
  t(/onerror="this\.closest\('.mx-etapa'\)\.remove\(\)"/.test(app), 'B (LOTE JARDÍN): si un visual del mosaico falla, se quita esa etapa sin fallback');
}

// ---------- 3-1 · tocar el hero abre el visual en grande ----------
{
  const postyBranch = app.slice(app.indexOf("if (tipo === 'posty') {"), app.indexOf('function mxJardinErrorHTML'));
  t(/class="mx-hero-btn" onclick="openLightbox\('[^']+', 0\)"/.test(app), '3-1 (LOTE JARDÍN): la etapa actual del mosaico es botón que abre el visual con openLightbox (visor puro, 2 args)');
  t(/function openLightbox\(/.test(app), '3-1: openLightbox existe (visor ya vigente, sin funciones nuevas)');
  t(/pz-ropa-panel/.test(app) && /mx-slowzoom/.test(css), '3-1 (LOTE JARDÍN-ROPA): el avatar con magia reemplaza al jardín vivo'); // LOTE JARDÍN-ROPA (decisión Valentino 2/11): vivo fuera de la pantalla
}

// ---------- 2-1 + 2-4 · qué falta, con nombre y botón ----------
{
  const sb = sandbox();
  vm.runInContext(extractFn(app, 'pzNivelChip').replace('function pzNivelChip', 'globalThis.pzNivelChip = function'), sb);
  vm.runInContext(extractFn(app, 'mxFaltantesHTML').replace('function mxFaltantesHTML', 'globalThis.mxFaltantesHTML = function'), sb);
  const nv = { nivel: 2, nombre_siguiente: 'De la casa', gate: { nivel_objetivo: 3 }, faltantes: [{ clave: 'decision_bandeja', falta: 'Tu primera decisión en la Bandeja le enseña tu gusto.' }] };
  const html = sb.mxFaltantesHTML(nv);
  t(/Te falta 1 cosa/.test(html), '2-1: dice que falta 1 cosa');
  t(/para Nv 3/.test(html) && /De la casa/.test(html), '2-4: dice para qué nivel falta (Nv 3 · De la casa), en palabras');
  t(/Tu primera decisión en la Bandeja le enseña tu gusto\./.test(html), '2-1: dice QUÉ falta (el texto real del pendiente)');
  t(/bbGo\('#\/app\/bandeja'\)/.test(html) && /Decidir en tu Bandeja/.test(html), '2-1: botón que abre la Bandeja en un toque');
  const nv2 = { nivel: 3, nombre_siguiente: 'Mano derecha de tu Instagram', gate: { nivel_objetivo: 4 }, faltantes: [{ clave: 'semana_aceptada', falta: 'Si una semana entera sale aceptada, queda a un paso.' }, { clave: 'pieza_aceptada_primera', falta: 'Piezas aceptadas sin cambios: así se mide su acierto de primera.' }] };
  const html2 = sb.mxFaltantesHTML(nv2);
  t(/Te faltan 2 cosas para Nv 4/.test(html2), '2-1/2-4: plural con conteo real y destino');
  t(!/%/.test(extractFn(app, 'mxFaltantesHTML')) && !/barra|width:/.test(extractFn(app, 'mxFaltantesHTML')), '2-4: el bloque no tiene % ni barras');
  t(sb.mxFaltantesHTML({ nivel: 5, faltantes: [] }) === '', '2-1: sin pendientes no hay bloque');
  // La Bandeja vuelve a ser ruta (su pantalla y su backend ya existían).
  t(/tab === 'bandeja'\) \{ pzPaintSkeleton\(tab\); content = await bbBandejaContent\(\); \}/.test(app), '2-1: #/app/bandeja vuelve a ser ruta');
  const redirectLine = app.split('\n').find((l) => /sin pantallas Gesty/.test(l)) || '';
  t(!/bandeja/.test(redirectLine), '2-1: el redirect a Inicio ya no incluye bandeja');
  const bandejaSrc = app.slice(app.indexOf('async function bbBandejaContent'), app.indexOf('function bbPedirCambio'));
  t(/\/api\/oficina\/bandeja/.test(bandejaSrc) && /\/api\/oficina\/bandeja\/' \+ id \+ '\/accion/.test(app), '2-1: la Bandeja lista pendientes y acciona (Aceptar / Pedir un cambio)');
}

// ---------- 2-2 · premio de Nv 3 visible sin bajar ----------
{
  const premioSrc = app.slice(app.indexOf('function mxPremioCercaHTML'), app.indexOf('const MX_ZONAS_PREMIO'));
  t(/mx-premio-cerca/.test(premioSrc), '2-2 (LOTE 15): línea de premio junto al hero (se mudó de las píldoras)');
  t(/siguiente_premio/.test(premioSrc) && /siguiente_desbloqueo/.test(premioSrc), '2-2: usa los datos de vista previa del Lote 3');
  t(/pzNivelUnlock\(nv\.nivel \+ 1/.test(premioSrc), '2-2: en 1–5 vale la tabla de desbloqueos vigente');
  t(/nv\.nivel >= 50/.test(premioSrc) && /nombre_siguiente/.test(premioSrc), '2-2: solo si hay próximo nivel');
  t(/Próximo: Nv /.test(app), '2-2 (LOTE JARDÍN-ROPA): el próximo nivel vive en la barrita'); // LOTE JARDÍN-ROPA (decisión Valentino 2/11): premio-cerca fuera del cuerpo
}

// ---------- 2-5 · píldoras parejas ----------
{
  const vistasSrc = app.slice(app.indexOf('function mxVistasUnAgenteHTML'), app.indexOf('function mxJardinHTML'));
  t(/pasado\.nivel/.test(vistasSrc) && /gzT\('Nv', 'Lv'\) \+ ' ' \+ pasado\.nivel/.test(vistasSrc), '2-5: la píldora pasada lleva su Nv (Nv 1 · Nuevo en tu feed)');
}

// ---------- 3-2 · entrada a Mi historia ----------
{
  const vistasSrc = app.slice(app.indexOf('function mxVistasUnAgenteHTML'), app.indexOf('function mxJardinHTML'));
  t(/mxIrHistoria\(\)/.test(vistasSrc) && /Mi historia/.test(vistasSrc) && /My history/.test(vistasSrc), '3-2: botón visible Mi historia');
  t(/id="mxHistoria"/.test(app) && /mxVitrina\(nv\)/.test(app), '3-2: la vitrina del Lote 3 queda anclada como destino');
  t(/scrollIntoView/.test(extractFn(app, 'mxIrHistoria')), '3-2: el botón baja hasta la historia');
}

// ---------- 3-3 · subtítulo corto ----------
{
  const jardinSrc = app.slice(app.indexOf('function mxJardinHTML'), app.indexOf('function mxJardinErrorHTML'));
  t(/cuanto más subís de nivel, mejores posteos y más conozco lo que buscás/.test(jardinSrc) && /the higher your level, the better your posts/.test(jardinSrc), '3-3 (LOTE JARDÍN-ROPA): el mensaje nuevo ES/EN'); // LOTE JARDÍN-ROPA (decisión Valentino 2/11): el sentido viejo sale de la pantalla
  t(!/Crece solo con semanas publicadas de verdad/.test(jardinSrc), '3-3: fuera el subtítulo viejo (sonaba a advertencia)');
}

// ---------- 3-4 · cómo va esta semana, en palabras ----------
{
  const sb = sandbox({
    pcTz: () => 'America/Argentina/Buenos_Aires',
    schedPlacements: (posts) => {
      const byDay = new Map();
      for (const p of posts) {
        if (!byDay.has(p.ymd)) byDay.set(p.ymd, []);
        byDay.get(p.ymd).push({ p });
      }
      return { byDay };
    },
  });
  vm.runInContext(extractFn(app, 'mxSemanaLinea').replace('function mxSemanaLinea', 'globalThis.mxSemanaLinea = function'), sb);
  // Semana en curso lun–dom en la zona de la cuenta, calculada en el test
  // con la misma regla que la implementación (Intl en tz + lunes ISO).
  const hoyYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const base = new Date(hoyYmd + 'T12:00:00Z');
  const dow = (base.getUTCDay() + 6) % 7;
  const lun = new Date(base.getTime() - dow * 86400000);
  const ymd = (d) => d.toISOString().slice(0, 10);
  const enSemana = [0, 1, 2, 3, 4].map((k) => ymd(new Date(lun.getTime() + k * 86400000)));
  const fuera = ymd(new Date(lun.getTime() - 7 * 86400000));
  const posts = [
    { status: 'published', ymd: enSemana[0] },
    { status: 'published', ymd: enSemana[1] },
    { status: 'published', ymd: enSemana[2] },
    { status: 'scheduled', ymd: enSemana[3] },
    { status: 'draft', ymd: enSemana[4] },
    { status: 'published', ymd: fuera },
  ];
  t(sb.mxSemanaLinea(posts) === '<p class="mx-dato mx-semana-linea">Esta semana publicaste 3 de 5</p>', '3-4: esta semana publicaste 3 de 5 (el de fuera no cuenta)');
  sb.ME = { lang: 'en' };
  t(sb.mxSemanaLinea(posts) === '<p class="mx-dato mx-semana-linea">This week you published 3 of 5</p>', '3-4: espejo EN fiel');
  t(sb.mxSemanaLinea([]) === '' && sb.mxSemanaLinea(null) === '', '3-4: sin plan no hay línea (nunca inventada)');
  t(!/%/.test(sb.mxSemanaLinea(posts)) && !/barra|width:/.test(extractFn(app, 'mxSemanaLinea')), '3-4: la línea no tiene % ni barras (el % del módulo es aritmética, no porcentaje en pantalla)');
  t(/mxJardinHTML\('posty', nvP, null, null\)/.test(app) && !/mxSemanaLinea\(res\[3\]\)/.test(app), '3-4 (LOTE JARDÍN-ROPA): el jardín pide solo el nivel, sin línea semanal'); // LOTE JARDÍN-ROPA (decisión Valentino 2/11): la pantalla nueva no trae posteos
}

// ---------- C · contenido sin tapar por la barra ----------
{
  t(/\.mx-jardin\{padding-bottom:32px\}/.test(css), 'C: el jardín suma despeje inferior propio (32px)');
  t(/\.bb-main\{[^}]*padding:6px 14px calc\(96px \+ env\(safe-area-inset-bottom\)\)/.test(css), 'C: bb-main ya despeja 96+safe sobre la barra (~64+safe)');
}

// ---------- M78 · funciones auditadas ----------
{
  const fns = ['mxHeroJardin', 'mxFaltantesHTML', 'mxSemanaLinea', 'mxHistoriaHTML', 'mxIrHistoria', 'openLightbox', 'pzNivelChip', 'bbGo', 'mxJardinHito', 'mxNvNum', 'pzNivelUnlock', 'gzT'];
  for (const f of fns) {
    t(new RegExp('function ' + f + '\\(').test(app), 'M78: definida ' + f);
  }
  t(/const esc =/.test(app), 'M78: definida esc');
}

// ---------- Versiones y censo ----------
{
  t(/20261101-v533/.test(srv), 'BUILD v522 en server.js');
  t(/app\.js\?v=355/.test(idx), 'app.js?v=355 en index');
  t(/styles.css\?v=20261074/.test(idx) && /styles.css\?v=20261074/.test(idxEn), 'styles.css?v=20261074 en ambos índices');
  t(/20261101-v523/.test(app), 'CHUNK_V v523 (LOTE IMPULSAR toca chunk-analisis: tarjeta mejor-posteo)');
  const cnt = (re) => (srv.match(re) || []).length;
  t(cnt(/catsMatch/g) === 3 && cnt(/week-redo/g) === 16 && cnt(/first_week/g) === 3 && cnt(/\/aprobar/g) === 16 && cnt(/autofetch/g) === 0, 'censo server 3/16/3/16 autofetch 0');
  t((app.match(/pzGoBack/g) || []).length === 4 && (app.match(/pz-detalle-setup/g) || []).length === 1, 'censo app pzGoBack 4, pz-detalle-setup 1');
}

console.log(`lote10b: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
