// LOTE FILTRO-FEED — suite nueva.
// Cubre: conjuntos exactos de cada filtro, Todos idéntico al feed actual,
// sin cambios de estados/datos, ES/EN, resto de Inicio intacto.
// Uso: node test-lotefiltrofeed.js [ruta-a-app.js] [ruta-a-styles.css]
// Por defecto usa los archivos de este mismo árbol (public/).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = process.argv[2]
  ? path.dirname(process.argv[2])
  : path.join(__dirname, 'public');
const appSrc = fs.readFileSync(path.join(base, 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(base, 'styles.css'), 'utf8');

let ok = 0, fail = 0;
function t(name, cond) {
  if (cond) { ok++; }
  else { fail++; console.log('FAIL: ' + name); }
}
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('función no encontrada: ' + name);
  let j = src.indexOf('{', i);
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar: ' + name);
}

// Evalúa solo los helpers puros del lote (sin efectos del bundle).
const ctx = {};
vm.createContext(ctx);
for (const fn of ['hfFiltroGrupo', 'hfFiltroTiles', 'hfFiltroHTML']) {
  vm.runInContext(extractFn(appSrc, fn), ctx);
}
const { hfFiltroGrupo, hfFiltroTiles, hfFiltroHTML } = ctx;

// --- (a) conjuntos exactos ---
const draft = { kind: 'post', post: { id: 1, status: 'draft', pinned: true } };
const sched = { kind: 'post', post: { id: 2, status: 'scheduled' } };
const pub = { kind: 'post', post: { id: 3, status: 'published' } };
const pubArch = { kind: 'post', post: { id: 4, status: 'published', ig_state: 'archived_ext' } };
const ig = { kind: 'ig', img: 'x.jpg' };
const canc = { kind: 'post', post: { id: 5, status: 'cancelled' } };
t('grupo: draft -> pendientes', hfFiltroGrupo(draft) === 'pendientes');
t('grupo: scheduled -> pendientes', hfFiltroGrupo(sched) === 'pendientes');
t('grupo: published -> publicados', hfFiltroGrupo(pub) === 'publicados');
t('grupo: publicado archivado ext -> publicados', hfFiltroGrupo(pubArch) === 'publicados');
t('grupo: ig -> publicados', hfFiltroGrupo(ig) === 'publicados');
t('grupo: cancelled -> null (solo Todos)', hfFiltroGrupo(canc) === null);
t('grupo: null -> null', hfFiltroGrupo(null) === null);
t('grupo: post sin status -> null', hfFiltroGrupo({ kind: 'post', post: {} }) === null);

const tiles = [draft, sched, pub, pubArch, ig, canc]; // orden: fijado primero
const pend = hfFiltroTiles(tiles, 'pendientes');
t('pendientes: solo draft+scheduled', pend.length === 2 && pend[0] === draft && pend[1] === sched);
const pubs = hfFiltroTiles(tiles, 'publicados');
t('publicados: published+archivado+ig', pubs.length === 3 && pubs[0] === pub && pubs[1] === pubArch && pubs[2] === ig);
t('pendientes: el fijado calificado sigue primero', hfFiltroTiles(tiles, 'pendientes')[0] === draft);
t('publicados: orden de entrada preservado', pubs.map(x => x.post ? x.post.id : 'ig').join(',') === '3,4,ig');
t('filtro desconocido -> lista intacta', hfFiltroTiles(tiles, 'otro') === tiles);
t('sin filtro -> lista intacta', hfFiltroTiles(tiles, undefined) === tiles);
t('entrada no-array -> []', JSON.stringify(hfFiltroTiles(null, 'pendientes')) === '[]');

// --- (b) Todos idéntico al feed actual ---
const todos = hfFiltroTiles(tiles, 'todos');
t('Todos: misma lista, mismo orden, sin tocar tiles', todos === tiles);
t('filtrar no muta la lista original', tiles.length === 6 && tiles[0] === draft);

// --- (c) sin cambios de estados ni datos ---
const before = JSON.stringify(tiles);
hfFiltroTiles(tiles, 'pendientes'); hfFiltroTiles(tiles, 'publicados');
t('filtrar no cambia estados ni datos', JSON.stringify(tiles) === before);

// --- (d) ES y EN ---
const es = hfFiltroHTML('todos', false, false);
t('ES: etiquetas Todos/Pendientes/Publicados', es.includes('>Todos<') && es.includes('>Pendientes<') && es.includes('>Publicados<'));
t('ES: chip activo Todos con on + aria-pressed true', es.includes('data-hf-filtro-chip="todos"') && es.includes('hf-filtro-chip on') && es.includes('aria-pressed="true"'));
t('ES: resto de chips aria-pressed false', (es.match(/aria-pressed="false"/g) || []).length === 2);
const en = hfFiltroHTML('publicados', true, false);
t('EN: etiquetas All/Pending/Published', en.includes('>All<') && en.includes('>Pending<') && en.includes('>Published<'));
t('EN: activo publicados', en.includes('data-hf-filtro-chip="publicados"') && en.includes('hf-filtro-chip on'));
t('EN: nota de vacío en inglés', hfFiltroHTML('pendientes', true, true).includes('No posts in this filter.'));
t('ES: nota de vacío en español', hfFiltroHTML('pendientes', false, true).includes('No hay posteos en este filtro.'));
t('nota oculta cuando no hay vacío', hfFiltroHTML('todos', false, false).includes('id="hfFiltroVacio" hidden'));
t('nota visible cuando hay vacío', !hfFiltroHTML('pendientes', false, true).includes('id="hfFiltroVacio" hidden'));
t('filtro desconocido -> activo Todos', hfFiltroHTML('otro', false, false).includes('data-hf-filtro-chip="todos"') === true && (hfFiltroHTML('otro', false, false).match(/hf-filtro-chip on/g) || []).length === 1);

// --- (e) cableado en app.js / resto intacto ---
t('HF_FILTRO por defecto todos', appSrc.includes("let HF_FILTRO = 'todos'"));
t('chips encima de la grilla (tabs -> filtro -> grid)',
  appSrc.indexOf('${hfTabsHTML(HF_TAB, enHome)}') > 0 &&
  appSrc.indexOf('${filtroHTML}') > appSrc.indexOf('${hfTabsHTML(HF_TAB, enHome)}') &&
  appSrc.indexOf('${gridHTML}') > appSrc.indexOf('${filtroHTML}'));
t('raíz con clase de filtro', appSrc.includes("hf-filtro-pendientes") && appSrc.includes("hf-filtro-publicados"));
t('bind de chips con data-hf-filtro-chip + hfFiltroAplicar',
  appSrc.includes("[data-hf-filtro-chip]") && appSrc.includes('hfFiltroAplicar()'));
t('tile IG marcada publicados', appSrc.includes('class="hf-tile pub" data-hf-filtro="publicados"'));
t('tile post marcada con data-hf-filtro dinámico', appSrc.includes('data-hf-filtro="${filtroGrupo}"'));
t('tile post: grupo por estado', appSrc.includes("filtroGrupo = (p.status === 'draft' || p.status === 'scheduled') ? 'pendientes'"));
t('Aceptar todo intacto', appSrc.includes('pzAcceptAllWeek') && appSrc.includes('acceptBarHTML'));
t('chat de Inicio intacto', appSrc.includes('mzChatBar') && appSrc.includes('mzChatOpen'));
t('tirita intacta', appSrc.includes('mxPortTop') || appSrc.includes('pzNivelStripHTML'));
t('pestañas intactas', appSrc.includes('hfTabsHTML(HF_TAB, enHome)'));
t('hfFiltroAplicar no re-renderiza (sin render() dentro)',
  (() => { const s = extractFn(appSrc, 'hfFiltroAplicar'); return !s.includes('render()'); })());

// --- homeGridCompose: orden vigente intacto (comparado con prístino si existe) ---
const pristPath = path.join(__dirname, '..', 'pristine-v559', 'public', 'app.js');
if (fs.existsSync(pristPath)) {
  const pristSrc = fs.readFileSync(pristPath, 'utf8');
  t('homeGridCompose byte-idéntica a v559 (orden Todos intacto)',
    extractFn(appSrc, 'homeGridCompose') === extractFn(pristSrc, 'homeGridCompose'));
  const workSrv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const pristSrv = fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', 'server.js'), 'utf8');
  // (Liberación v588 · causa: BUILD v560–v587; el hecho del lote es que
  // server no trae sus marcas.)
  t('server.js sin marcas del lote', !workSrv.includes('hfFiltro'));
} else {
  console.log('SKIP: sin prístino para comparar homeGridCompose/server.js');
}

// --- CSS ---
t('CSS: chips', cssSrc.includes('.hf-filtro-chip'));
t('CSS: chip activo celeste', cssSrc.includes('.hf-filtro-chip.on') && cssSrc.includes('#2793C8'));
t('CSS: ocultado pendientes solo-vista', cssSrc.includes('#inicioView.hf-filtro-pendientes .hf-grid > :not([data-hf-filtro="pendientes"]){display:none}'));
t('CSS: ocultado publicados solo-vista', cssSrc.includes('#inicioView.hf-filtro-publicados .hf-grid > :not([data-hf-filtro="publicados"]){display:none}'));
t('CSS: nota de vacío', cssSrc.includes('.hf-filtro-vacio'));

console.log(`lotefiltrofeed: ${ok} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
