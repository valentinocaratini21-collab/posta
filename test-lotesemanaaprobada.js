// LOTE SEMANA-APROBADA — suite nueva.
// Uso: node test-lotesemanaaprobada.js [root]  (root por defecto: el arbol que contiene este archivo)
// Afirma el estado «semana aprobada» de Inicio: solo con cero pendientes
// y al menos un aprobado de la semana corriente, en ES y EN, y su sync
// en su lugar (aparece al aprobar el ultimo, desaparece con un pendiente
// nuevo), sin tocar barra Aceptar todo, tiles, strip ni chat.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const app = read('public/app.js');
const css = read('public/styles.css');
const server = read('server.js');

let ok = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { ok++; }
  else { fail++; console.log('FAIL: ' + name); }
};
const safe = (fn) => { try { return !!fn(); } catch (e) { return false; } };

// Extraccion de las 3 funciones por balance de llaves (no por regex fragil).
function extract(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const stateSrc = extract(app, 'pzSemanaAprobadaState');
const htmlSrc = extract(app, 'pzSemanaAprobadaHTML');
const syncSrc = extract(app, 'pzSemanaAprobadaSync');
const funcsOK = !!(stateSrc && htmlSrc && syncSrc);
t('funciones del lote definidas en app.js', funcsOK);

// Sandbox para la funcion pura de estado y el HTML.
const pure = { pzIc: () => '', console };
vm.createContext(pure);
if (funcsOK) { vm.runInContext(stateSrc + '\n' + htmlSrc, pure); }
const WK = '2026-11-02';
const post = (id, over) => Object.assign({ kind: 'post', post: { id, status: 'scheduled', approval: 'pending', week_key: WK, owner_liked: 0 } }, over || {});
const P = (id, over) => { const t0 = post(id); Object.assign(t0.post, over || {}); return t0; };

t('estado: pendientes 0 + aprobados 2 muestra', safe(() => pure.pzSemanaAprobadaState([P(1, { approval: 'approved' }), P(2, { approval: 'approved' })], WK).show));
t('estado: 1 pendiente no muestra', safe(() => !pure.pzSemanaAprobadaState([P(1, { approval: 'approved' }), P(2)], WK).show));
t('estado: semana vacia no muestra', safe(() => !pure.pzSemanaAprobadaState([], WK).show));
t('estado: solo borradores no muestra', safe(() => !pure.pzSemanaAprobadaState([P(1, { status: 'draft' }), P(2, { status: 'draft', week_key: '' })], WK).show));
t('estado: solo publicados no muestra', safe(() => !pure.pzSemanaAprobadaState([P(1, { status: 'published', approval: 'approved' })], WK).show));
t('estado: pendiente de semana vieja se ignora', safe(() => pure.pzSemanaAprobadaState([P(1, { approval: 'approved' }), P(2, { week_key: '2026-10-26' })], WK).show));
t('estado: archivado de la semana se ignora', safe(() => pure.pzSemanaAprobadaState([P(1, { approval: 'approved' }), Object.assign(P(2), { archivedExt: true })], WK).show));
t('estado: piloto, todos con constancia muestra', safe(() => pure.pzSemanaAprobadaState([P(1, { owner_liked: 1 }), P(2, { owner_liked: 1 })], WK).show));
t('estado: piloto, 1 con constancia + 1 pendiente no muestra', safe(() => !pure.pzSemanaAprobadaState([P(1, { owner_liked: 1 }), P(2)], WK).show));
t('estado: sin week_key no muestra', safe(() => !pure.pzSemanaAprobadaState([P(1, { approval: 'approved' })], '').show));
t('estado: kinds que no son post se ignoran', safe(() => !pure.pzSemanaAprobadaState([{ kind: 'ig', post: { id: 9, status: 'scheduled', approval: 'approved', week_key: WK } }], WK).show));
t('estado: conteos pending/approved/week correctos', safe(() => { const s = pure.pzSemanaAprobadaState([P(1, { approval: 'approved' }), P(2), P(3, { week_key: '2026-10-26' })], WK); return s.pending === 1 && s.approved === 1 && s.week === 2; }));
t('HTML ES exacto', safe(() => pure.pzSemanaAprobadaHTML(false).includes('Tu semana está aprobada. Posty se ocupa de publicarla.')));
t('HTML EN exacto', safe(() => pure.pzSemanaAprobadaHTML(true).includes('Your week is approved. Posty will take care of publishing it.')));
t('HTML lleva id hfSemanaOk y clase hf-semana-ok', safe(() => pure.pzSemanaAprobadaHTML(false).includes('id="hfSemanaOk"') && pure.pzSemanaAprobadaHTML(false).includes('hf-semana-ok')));

// Cableado en app.js (fuente).
t('inicioView calcula pzSemanaOk solo si no es visitante', /const pzSemanaOk = \(!HF_VISITOR\) \? pzSemanaAprobadaState\(tiles/.test(app));
// (Liberación v588 · causa: la tanda INICIO x5 ordena la zona tabs/grid
// como etiqueta -> semanaOk -> próximo -> filtro -> grilla; el hecho es
// que semanaOk queda entre pestañas y grilla.)
t('plantilla inserta pzSemanaOkHTML entre pestañas y grilla', (() => {
  const i = app.indexOf('${pzSemanaOkHTML}');
  return i > 0 && app.indexOf('${hfTabsHTML(HF_TAB, enHome)}') < i && i < app.indexOf('${gridHTML}', i);
})());
t('sync se llama en hfTileApprove (manual, piloto y borrador)', safe(() => (app.match(/pzSemanaAprobadaSync\(\);/g) || []).length === 6));
t('sync se llama tras asignar HF_TILES en hfLiveApply', app.includes("HF_TILES = tiles;\n  try { pzSemanaAprobadaSync(); } catch (e) {}"));
t('sync se llama en pzAcceptAllWeek', /pzAcceptBarOff\(\); \} catch \(e\) \{\} try \{ pzSemanaAprobadaSync\(\);/.test(app));
t('barra Aceptar todo intacta', app.includes('function acceptBarHTML') && app.includes('function pzAcceptAllWeekCands'));
t('CSS .hf-semana-ok con color var(--mut) y 14px', /\.hf-semana-ok\{[^}]*color:var\(--mut\)[^}]*font-size:14px/.test(css));
t('CSS sin confeti ni promesas en la regla', !/confetti|festejo|celebrat/i.test((css.match(/\.hf-semana-ok\{[^}]*\}/) || [''])[0]));
// (Liberación v588 · causa: el pin BUILD v559 quedó viejo; el hecho del
// lote es que server no trae sus marcas.)
t('server.js no tocado por el lote', !/hfSemanaOk|pzSemanaAprobada/.test(server));

// Sync con DOM simulado: aparece al aprobar el ultimo, desaparece con un pendiente nuevo.
function makeScenario(tiles, opts) {
  opts = opts || {};
  let msg = null;
  let removed = 0;
  const grid = { inserted: [], insertAdjacentHTML(pos, html) { this.inserted.push(html); msg = { removed: false, remove() { removed++; msg = null; } }; } };
  const root = { querySelector: (sel) => (sel === '.hf-grid' && opts.grid !== false) ? grid : null };
  const doc = {
    getElementById: (id) => (id === 'inicioView' && opts.view !== false) ? root : (id === 'hfSemanaOk' ? msg : null),
  };
  const sb = {
    document: doc, HF_VISITOR: !!opts.visitor, HF_TILES: tiles,
    albumMondayKey: () => WK, f3En: () => !!opts.en, pzIc: () => '',
  };
  vm.createContext(sb);
  if (funcsOK) vm.runInContext(stateSrc + '\n' + htmlSrc + '\n' + syncSrc, sb);
  return {
    sb, grid,
    run() { vm.runInContext('pzSemanaAprobadaSync()', sb); },
    hasMsg: () => !!msg,
    removed: () => removed,
    lastHTML: () => grid.inserted[grid.inserted.length - 1] || '',
  };
}
t('sync: con 1 pendiente no inserta nada', safe(() => {
  const s = makeScenario([P(1, { approval: 'approved' }), P(2)]);
  s.run(); return !s.hasMsg() && s.grid.inserted.length === 0;
}));
t('sync: al aprobar el ultimo aparece sin refrescar', safe(() => {
  const tiles = [P(1, { approval: 'approved' }), P(2)];
  const s = makeScenario(tiles);
  s.run(); tiles[1].post.approval = 'approved'; s.run();
  return s.hasMsg() && s.lastHTML().includes('Tu semana está aprobada. Posty se ocupa de publicarla.');
}));
t('sync: con un pendiente nuevo desaparece', safe(() => {
  const tiles = [P(1, { approval: 'approved' }), P(2, { approval: 'approved' })];
  const s = makeScenario(tiles);
  s.run(); if (!s.hasMsg()) return false;
  tiles.push(P(3)); s.run(); return !s.hasMsg() && s.removed() === 1;
}));
t('sync: visitante nunca ve el mensaje', safe(() => {
  const s = makeScenario([P(1, { approval: 'approved' })], { visitor: true });
  s.run(); return !s.hasMsg();
}));
t('sync: en EN inserta el texto EN', safe(() => {
  const s = makeScenario([P(1, { approval: 'approved' })], { en: true });
  s.run(); return s.lastHTML().includes('Your week is approved. Posty will take care of publishing it.');
}));
t('sync: sin grilla no rompe ni inventa mensaje', safe(() => {
  const s = makeScenario([P(1, { approval: 'approved' })], { grid: false });
  s.run(); return !s.hasMsg();
}));
t('sync: sin vista Inicio no hace nada', safe(() => {
  const s = makeScenario([P(1, { approval: 'approved' })], { view: false });
  s.run(); return true;
}));

console.log('lote-semana-aprobada: ' + ok + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
