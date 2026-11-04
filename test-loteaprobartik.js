// LOTE APROBAR-TIK-EN-VIVO — tests sobre el árbol parcheado (base v633), sin DOM real.
// Uso: node test-loteaprobartik.js  →  TODO OK o FAIL con el primer fallo.
const fs = require('fs');
const app = fs.readFileSync('/home/hatch/workspace/.loteaprobartik-release2/work/public/app.js', 'utf8');
const css = fs.readFileSync('/home/hatch/workspace/.loteaprobartik-release2/work/public/styles.css', 'utf8');
let n = 0;
function ok(cond, msg) { n++; if (!cond) { console.log('FAIL: ' + msg); process.exit(1); } console.log('ok ' + n + ' - ' + msg); }
function extractFn(src, name) {
  const i = src.indexOf('function ' + name);
  if (i < 0) throw new Error('no existe ' + name);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; if (src[k] === '}') { depth--; if (!depth) break; } }
  return src.slice(i, k + 1);
}

// ---------- (a) Reproducción de los 4 ----------
// Datos reales admin user 12 (4/11): 18 scheduled con week_key + 6 published.
const sched = [
  [551, '2026-11-04T22:00', '2026-10-26'], [548, '2026-11-22T22:00', '2026-11-02'],
  [547, '2026-11-21T22:00', '2026-11-02'], [546, '2026-11-20T22:00', '2026-11-02'],
  [545, '2026-11-19T22:00', '2026-11-02'], [544, '2026-11-18T22:00', '2026-11-02'],
  [523, '2026-11-17T22:00', '2026-10-26'], [522, '2026-11-16T22:00', '2026-10-26'],
  [521, '2026-11-07T22:00', '2026-10-26'], [520, '2026-11-11T22:00', '2026-10-26'],
  [519, '2026-11-06T22:00', '2026-10-26'], [518, '2026-11-05T22:00', '2026-10-26'],
  [517, '2026-11-12T22:00', '2026-10-26'], [414, '2026-11-15T22:00', '2026-10-19'],
  [413, '2026-11-10T22:00', '2026-10-19'], [411, '2026-11-14T22:00', '2026-10-12'],
  [408, '2026-11-09T22:00', '2026-10-19'], [407, '2026-11-13T22:00', '2026-10-19'],
];
const WK = '2026-11-02'; // lunes actual 4/11 (miércoles) en zona de la cuenta
const wkSet = sched.filter(s => s[2] === WK).map(s => s[0]);
ok(JSON.stringify(wkSet.sort((a, b) => a - b)) === '[544,545,546,547,548]', 'conjunto semana corriente = posteos 544-548 (5)');
// Orden de grilla: no publicados fecha DESC → el conjunto queda PRIMERO (visible, likeable)
const desc = sched.slice().sort((a, b) => b[1].localeCompare(a[1])).map(s => s[0]);
ok(JSON.stringify(desc.slice(0, 5)) === '[548,547,546,545,544]', 'grilla DESC: 544-548 van primeros, no son invisibles');
// pzAcceptAllWeekCands real, extraído del bundle parcheado
const candsSrc = extractFn(app, 'pzAcceptAllWeekCands');
const albumMondayKey = () => WK;
eval(candsSrc);
function tilesWith(approvedIds) {
  return sched.map(s => ({ kind: 'post', post: { id: s[0], status: 'scheduled', approval: approvedIds.includes(s[0]) ? 'approved' : 'pending', week_key: s[2] } }));
}
ok(pzAcceptAllWeekCands(tilesWith([]), null).length === 5, 'sin aprobados: badge 5');
ok(pzAcceptAllWeekCands(tilesWith([548]), null).length === 4, 'con 1 aprobado del conjunto: badge 4 = lo que ve Valentino');
ok(pzAcceptAllWeekCands(tilesWith([544, 545, 546, 547, 548]), null).length === 0, 'con los 5 aprobados: badge 0 (el botón se va)');
// El corazón lleno es DEFAULT para todo programado (no es aprobación): por eso "15 likeadas" ≠ 15 aprobadas
ok(app.includes("const hfLikeOn = String(p.status) === 'scheduled' || String(p.status) === 'published';"), 'corazón lleno = default por status, no por approval (explica las 15)');

// ---------- (b) Número en vivo ----------
const syncSrc = extractFn(app, 'pzAcceptCountSync');
let HF_TILES = [];
let barOffCalls = 0;
function pzAcceptBarOff() { barOffCalls++; }
let btnRemoved = false, spanText = null;
const fakeBtn = {
  querySelector: () => ({ set textContent(v) { spanText = v; }, get textContent() { return spanText; } }),
  remove: () => { btnRemoved = true; },
};
let document = { getElementById: () => fakeBtn };
eval(syncSrc);
HF_TILES = tilesWith([548]); // 4 pendientes
pzAcceptCountSync();
ok(spanText === '4' && !btnRemoved, 'sync con 4 pendientes: span 4, botón queda');
HF_TILES = tilesWith([548, 547]); // like uno más → 3
pzAcceptCountSync();
ok(spanText === '3', 'sync tras un like: baja a 3 en su lugar');
HF_TILES = tilesWith([544, 545, 546, 547, 548]); // todos
pzAcceptCountSync();
ok(btnRemoved && barOffCalls === 1, 'sync en 0: botón se va y se apaga la barra');
// Sin botón en el DOM no rompe
const document2 = { getElementById: () => null };
eval(syncSrc.replace('document', 'document2')); // redefine con document2 (mismo cuerpo, otro doc)
try { pzAcceptCountSync(); ok(true, 'sync sin botón no tira'); } catch (e) { ok(false, 'sync sin botón no tira'); }

// ---------- (c) Corazón → tik en su lugar ----------
const sitioSrc = extractFn(app, 'pzAprobarEnSitio');
let marcado = null;
function pzAprobadoMarcar(id) { marcado = id; }
let likeRemoved = false, tikInserted = null;
const fakeTile = {
  classList: { contains: () => true, remove: () => {} },
  querySelector: (sel) => sel === '.hf-like' ? { remove: () => { likeRemoved = true; } } : null,
  insertAdjacentHTML: (pos, html) => { tikInserted = html; },
  dataset: {},
};
const document3 = { querySelector: () => null };
document = document3;
eval(sitioSrc);
ok(pzAprobarEnSitio(fakeTile, 548, null) === true, 'pzAprobarEnSitio actualiza el nodo');
ok(likeRemoved, 'en su lugar: el botón corazón se QUITA');
ok(tikInserted && tikInserted.includes('hf-tik'), 'en su lugar: se inserta el span .hf-tik');
ok(marcado === 548, 'en su lugar: se marca la lista local');
// Sin tik duplicado si ya existe
let tikCount = 0;
const fakeTile2 = {
  classList: { contains: () => true, remove: () => {} },
  querySelector: (sel) => sel === '.hf-tik' ? {} : (sel === '.hf-like' ? { remove: () => {} } : null),
  insertAdjacentHTML: () => { tikCount++; },
  dataset: {},
};
eval(sitioSrc);
pzAprobarEnSitio(fakeTile2, 548, null);
ok(tikCount === 0, 'si ya hay tik, no se duplica');

// ---------- (d) Render: aprobada = tik, no corazón ----------
ok(app.includes("String(p.approval || '') === 'approved'"), 'render: aprobada incluye approval del servidor');
ok(app.includes("${(likeInStrip && !hfAprobado) ? likeBtn : ''}"), 'render: corazón suprimido en franja si aprobada');
ok(app.includes("${(likeInStrip || hfAprobado) ? '' : likeBtn}${tikSpan}"), 'render: corazón suprimido fuera de franja si aprobada');
ok(app.includes("const tikSpan = hfAprobado ? '<span class=\"hf-tik\" aria-hidden=\"true\">✓</span>' : '';"), 'render: tik presente si aprobada');
ok(!css.includes('#inicioView .hf-tile .hf-tik{display:none}'), 'CSS: eliminada la regla que ocultaba el tik en Inicio');
ok(css.includes('.hf-tik{position:absolute;top:6px;left:6px'), 'CSS: regla base .hf-tik intacta (verde, arriba-izquierda)');

// ---------- (e) Piloto intacto ----------
const likeFn = app.slice(app.indexOf('async function hfTileApprove'));
const pilotBlock = likeFn.slice(0, likeFn.indexOf("if (st === 'scheduled')"));
ok(!pilotBlock.includes('pzAprobarEnSitio') && !pilotBlock.includes('pzAprobadoMarcar') && !pilotBlock.includes('pzAcceptCountSync'),
  'piloto: constancia no marca tik ni toca el número');
// ---------- (f) No se tocó lo prohibido ----------
for (const [pat, msg] of [
  ['pzHeadCollapseEcho', 'guard colapso presente'],
  ['__pzDiag2', 'bloque TEMPORAL DIAGNOSTICO2 intacto'],
  ['mzChatPlus', 'píldora chat intacta'],
  ['max-width:100%', 'tope v633 intacto'],
  ['min-width:0', 'cinturón v631 intacto'],
]) {
  const inApp = app.includes(pat), inCss = css.includes(pat);
  ok(inApp || inCss, msg);
}
ok((app.match(/pzHeadCollapseEcho/g) || []).length === 7, 'guard colapso ×7');
ok(!app.includes("if (st === 'scheduled') {\n      await pcApprove(id, tile, null);"), 'pcApprove con éxito verificado antes de marcar');
ok(app.includes("if (!_pzOk) return;"), 'fallo de pcApprove no se marca como aprobado');
console.log('TODO OK (' + n + ' checks)');
