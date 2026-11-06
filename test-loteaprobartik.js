// LOTE APROBAR-TIK-EN-VIVO — tests sobre el árbol local (base v710),
// re-apuntado desde el scratch congelado v633 (SACAR-CORAZÓN 6/11).
// Uso: node test-loteaprobartik.js  →  TODO OK o FAIL con el primer fallo.
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
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
// pzAcceptAllWeekCands real, extraído del bundle local
// (v710 RITUAL 1/día: ya NO filtra por week_key — todo programado
// pendiente es candidato; el badge cuenta los 18, no solo la semana.)
const candsSrc = extractFn(app, 'pzAcceptAllWeekCands');
const albumMondayKey = () => WK;
eval(candsSrc);
function tilesWith(approvedIds) {
  return sched.map(s => ({ kind: 'post', post: { id: s[0], status: 'scheduled', approval: approvedIds.includes(s[0]) ? 'approved' : 'pending', week_key: s[2] } }));
}
ok(pzAcceptAllWeekCands(tilesWith([]), null).length === 18, 'sin aprobados: badge 18 (todos los programados pendientes)');
ok(pzAcceptAllWeekCands(tilesWith([548]), null).length === 17, 'con 1 aprobado: badge 17');
ok(pzAcceptAllWeekCands(tilesWith([544, 545, 546, 547, 548]), null).length === 13, 'con los 5 aprobados: badge 13 (el botón se va solo en 0)');
// (SACAR-CORAZÓN 6/11: el corazón lleno default salió con hfLikeOn —
// ya no hay botón que se llene por status; la única marca es el tik.)
ok(!app.includes('hfLikeOn'), 'hfLikeOn ELIMINADO (el corazón lleno default ya no existe)');

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
HF_TILES = tilesWith([548]); // 17 pendientes
pzAcceptCountSync();
ok(spanText === '17' && !btnRemoved, 'sync con 17 pendientes: span 17, botón queda');
HF_TILES = tilesWith([548, 547]); // like uno más → 16
pzAcceptCountSync();
ok(spanText === '16', 'sync tras un like: baja a 16 en su lugar');
HF_TILES = tilesWith(sched.map((s) => s[0])); // todos aprobados → 0
pzAcceptCountSync();
ok(btnRemoved && barOffCalls === 1, 'sync en 0: botón se va y se apaga la barra');
// Sin botón en el DOM no rompe
const document2 = { getElementById: () => null };
eval(syncSrc.replace('document', 'document2')); // redefine con document2 (mismo cuerpo, otro doc)
try { pzAcceptCountSync(); ok(true, 'sync sin botón no tira'); } catch (e) { ok(false, 'sync sin botón no tira'); }

// ---------- (c) Tik en su lugar (SACAR-CORAZÓN 6/11: ya no hay botón
// corazón que quitar — el tik va en la franja si hay chapita, directo
// sobre la foto si no; la consulta al botón era siempre null y se retiró) ----------
const sitioSrc = extractFn(app, 'pzAprobarEnSitio');
let marcado = null;
function pzAprobadoMarcar(id) { marcado = id; }
function fakeTileWithChip(hasChip) {
  let stripTik = null, elTik = null;
  const strip = {
    querySelector: (sel) => (sel === '.hf-chip' && hasChip) ? {} : null,
    insertAdjacentHTML: (pos, html) => { stripTik = html; },
  };
  const tile = {
    classList: { contains: (c) => c === 'hf-tile', remove: () => {} },
    querySelector: (sel) => {
      if (sel === '.hf-tik') return null;
      if (sel === '.hf-strip') return strip;
      return null;
    },
    insertAdjacentHTML: (pos, html) => { elTik = html; },
    dataset: {},
  };
  return { tile, get stripTik() { return stripTik; }, get elTik() { return elTik; } };
}
const document3 = { querySelector: () => null };
document = document3;
eval(sitioSrc);
const conChip = fakeTileWithChip(true);
ok(pzAprobarEnSitio(conChip.tile, 548, null) === true, 'pzAprobarEnSitio actualiza el nodo');
ok(conChip.stripTik && conChip.stripTik.includes('hf-tik'), 'con chapita: el tik va EN la franja');
ok(!conChip.elTik, 'con chapita: nada directo sobre la foto');
ok(marcado === 548, 'en su lugar: se marca la lista local');
const sinChip = fakeTileWithChip(false);
ok(pzAprobarEnSitio(sinChip.tile, 549, null) === true, 'pzAprobarEnSitio actualiza el nodo sin chapita');
ok(sinChip.elTik && sinChip.elTik.includes('hf-tik'), 'sin chapita: el tik va directo sobre la foto');
ok(!sinChip.stripTik, 'sin chapita: nada en la franja');
ok(!app.includes("querySelector('.hf-like')"), 'sin corazón que quitar: el código ya no consulta .hf-like');
// Sin tik duplicado si ya existe
let tikCount = 0;
const fakeTile2 = {
  classList: { contains: (c) => c === 'hf-tile', remove: () => {} },
  querySelector: (sel) => sel === '.hf-tik' ? {} : null,
  insertAdjacentHTML: () => { tikCount++; },
  dataset: {},
};
eval(sitioSrc);
pzAprobarEnSitio(fakeTile2, 548, null);
ok(tikCount === 0, 'si ya hay tik, no se duplica');

// ---------- (d) Render: aprobada = tik, sin corazón ----------
ok(app.includes("String(p.approval || '') === 'approved'"), 'render: aprobada incluye approval del servidor');
ok(app.includes("${chip}${archChip}${likeInStrip ? tikSpan : ''}"), 'render: tik en franja con chapita si aprobada');
ok(app.includes("${despChip}${talkBtn}${likeInStrip ? '' : tikSpan}"), 'render: tik directo sin chapita si aprobada');
ok(app.includes("const tikSpan = hfAprobado ? '<span class=\"hf-tik\" aria-hidden=\"true\">✓</span>' : '';"), 'render: tik presente si aprobada');
ok(!css.includes('#inicioView .hf-tile .hf-tik{display:none}'), 'CSS: eliminada la regla que ocultaba el tik en Inicio');
ok(css.includes('.hf-tik{position:absolute;bottom:38px;right:6px'), 'CSS: regla base .hf-tik intacta (verde, abajo a la derecha, en el lugar del corazón)');

// ---------- (e) Piloto intacto ----------
// (SACAR-CORAZÓN 6/11: hfTileApprove ya no existe — la aprobación desde
// el feed salió. La constancia del piloto vive en el handler
// pzAcceptAllWeek (PATCH like, cubierto en test-loteaceptartodo.js).)
ok(!app.includes('async function hfTileApprove'), 'piloto: hfTileApprove ELIMINADO (ya no hay aprobación por corazón/doble toque)');
ok(app.includes('function pzAprobarEnSitio'), 'piloto: pzAprobarEnSitio sigue (marca en vivo sin render)');
ok(app.includes('function pzAprobadoMarcar'), 'piloto: pzAprobadoMarcar sigue');
ok(app.includes('function pzAcceptCountSync'), 'piloto: pzAcceptCountSync sigue (el número baja en su lugar)');
// ---------- (f) No se tocó lo prohibido ----------
for (const [pat, msg] of [
  ['pzHeadCollapseEcho', 'guard colapso presente'],
  ['__pzDiag2', 'bloque TEMPORAL DIAGNOSTICO2 intacto'],
  ['max-width:100%', 'tope v633 intacto'],
  ['min-width:0', 'cinturón v631 intacto'],
]) {
  const inApp = app.includes(pat), inCss = css.includes(pat);
  ok(inApp || inCss, msg);
}
ok(!app.includes('mzChatPlus') && !css.includes('mzChatPlus'), 'píldora chat FUERA (v708 sacar-chatbar: la chatbar salió de Inicio)');
ok((app.match(/pzHeadCollapseEcho/g) || []).length === 8, 'guard colapso ×8');
ok(!app.includes("if (st === 'scheduled') {\n      await pcApprove(id, tile, null);"), 'pcApprove con éxito verificado antes de marcar');
ok(!app.includes("if (!_pzOk) return;"), 'el guard _pzOk salió con hfTileApprove (SACAR-CORAZÓN 6/11: ya no hay aprobación por doble toque)');
console.log('TODO OK (' + n + ' checks)');
