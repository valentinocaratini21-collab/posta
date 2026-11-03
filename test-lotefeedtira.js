#!/usr/bin/env node
/* LOTE FEED-TIRA-DÍA — test nuevo.
Corre con: node test-lotefeedtira.js (sin dependencias, sin red).
Decisión Valentino 2/11 con captura del feed: (1) el globito de comentario
sale de las tarjetas del feed; (2) la tira día+hora se estira hasta el
corazón para que entren las 3 letras del día (nunca cortada con '…').
Cubre: ningún emisor hf-tile-chat/data-hf-chat en homeTileHTML; día de la
chapita con 3 letras ES/EN en los 7 días + hora completa, sin número de
fecha ni '…'; CSS: chapita flex:1 (se estira), día flex:0 0 auto sin
ellipsis, corazón flex:none 24x24 intacto; corazón/chapita/foto/doble
toque (dataset + hfTileApprove/hfLikeBind) intactos; hablar por
detalle/aprobación intacto; server.js byte-idéntico; censo idéntico. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRATCH = fs.existsSync(path.join(__dirname, 'pristine-v559', 'public', 'app.js'))
  ? __dirname : path.join(__dirname, '..');
const ROOT = path.join(SCRATCH, 'work');
const PRE = path.join(SCRATCH, 'pristine-v559');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const APP_PRE = fs.readFileSync(path.join(PRE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const CSS_PRE = fs.readFileSync(path.join(PRE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'));
const SRV_PRE = fs.readFileSync(path.join(PRE, 'server.js'));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('FAIL: ' + name); }
}
function eq(a, b, name) { ok(a === b, name + ' (esperado ' + JSON.stringify(b) + ', visto ' + JSON.stringify(a) + ')'); }
function cnt(src, s) { return src.split(s).length - 1; }

// ---------- estáticos: globito fuera ----------
ok(!APP.includes('hf-tile-chat'), 'app.js: ningún emisor hf-tile-chat');
ok(!APP.includes('const talkBtn = pzTalkOk'), 'app.js: talkBtn ya no se construye con pzTalkOk');
ok(APP.includes("const talkBtn = '';"), 'app.js: talkBtn = cadena vacía (decisión 2/11)');
ok(APP.includes('LOTE FEED-TIRA-DÍA'), 'app.js: comentario del lote presente');
ok(APP.includes('${talkBtn}'), 'app.js: interpolación ${talkBtn} conservada (rinde nada)');
ok(CSS.includes('.hf-tile-chat{'), 'styles.css: regla .hf-tile-chat intacta (muerta, sin emisor; documentada)');

// ---------- estáticos: día 3 letras ----------
ok(APP.includes('day.trim().split(/\\s+/)[0]'), 'app.js: día recortado a su primera palabra');
ok(!CSS.includes('.hf-tile.hf-has-chip > .hf-strip .hf-chip-day{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}'),
  'styles.css: regla vieja día-con-ellipsis ELIMINADA');
ok(CSS.includes('.hf-tile.hf-has-chip > .hf-strip .hf-chip-day{flex:0 0 auto;overflow:visible;text-overflow:clip;white-space:nowrap}'),
  'styles.css: día flex:0 0 auto, sin ellipsis, nowrap');
ok(CSS.includes('.hf-tile.hf-has-chip > .hf-strip .hf-chip{text-overflow:clip}'),
  'styles.css: chapita text-overflow:clip (nunca …)');
ok(!CSS.includes('.hf-tile.hf-has-chip > .hf-strip .hf-chip{text-overflow:ellipsis}'),
  'styles.css: chapita vieja con ellipsis ELIMINADA');

// ---------- estáticos: estire + corazón intactos ----------
ok(CSS.includes('.hf-strip .hf-chip{position:static;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:clip}'),
  'styles.css: chapita flex:1 (se estira hasta el corazón)');
ok(CSS.includes('.hf-tile.hf-has-chip > .hf-strip .hf-like-in{position:static;flex:none;width:24px;height:24px;'),
  'styles.css: corazón en tira flex:none 24x24 intacto (v550)');

// ---------- estáticos: hablar por detalle/aprobación intacto ----------
for (const f of ['function pzHablarDePosteo(', 'function pzHablarClick(', 'function pzHablarAjustable(', 'function hfChatBtnBind(']) {
  ok(APP.includes(f), 'presente ' + f);
}
ok(APP.includes('data-hfd-act="talk"'), 'detalle: botón talk intacto');
ok(!APP.includes('id="apvTalk"'), 'aprobación: ítem Hablar fuera del menú por recorte v562 (SUPERSEDED con causa: decisión Valentino 2/11, el mini-chat al pie es el único camino de hablar)');
ok(APP.includes('hfAskChangeBtnHTML(p)'), 'aprobación: mini-chat al pie intacto como camino de hablar (v562)');

// ---------- estáticos: doble toque / aprobar intactos ----------
for (const f of ['function hfTileApprove(', 'function hfLikeBind(', 'function f3HeartBurst(']) {
  ok(APP.includes(f), 'presente ' + f);
  eq(cnt(APP, f), cnt(APP_PRE, f), 'conteo ' + f + ' igual a prístino');
}
ok(SRV.toString('utf8').replace(/const BUILD_ID = '[^']+';/, 'BUILD') === SRV_PRE.toString('utf8').replace(/const BUILD_ID = '[^']+';/, 'BUILD'), 'server.js idéntico a prístino salvo BUILD (LIBERACIÓN v563: server solo BUILD)');

// ---------- censo idéntico ----------
for (const [s, v] of [['pzGoBack', 4], ['pz-detalle-setup', 1], ['/aprobar', 1], ['autofetch', 0], ['pcDayKeyShift', 7]]) {
  eq(cnt(APP, s), v, 'censo app ' + s);
  eq(cnt(APP, s), cnt(APP_PRE, s), 'censo app ' + s + ' igual a prístino');
}
{
  const srv = SRV.toString('utf8'), srvPre = SRV_PRE.toString('utf8');
  for (const [s, v] of [['catsMatch', 3], ['week-redo', 16], ['first_week', 3], ['/aprobar', 16]]) {
    eq(cnt(srv, s), v, 'censo server ' + s);
    eq(cnt(srv, s), cnt(srvPre, s), 'censo server ' + s + ' igual a prístino');
  }
}

// ---------- funcional: renders reales de homeTileHTML ----------
const TZ = 'America/Argentina/Buenos_Aires';
function mkSandbox(lang, appSrc) {
  const sb = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: (name) => '<svg data-ic="' + name + '"></svg>',
    mv: (p) => p,
    pcTz: () => TZ,
    pcParseDate: (s0) => { const s = String(s0 || ''); if (!s) return null; let x = s.replace(' ', 'T'); if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z'; const d = new Date(x); return isNaN(d) ? null : d; },
    ME: lang ? { lang } : undefined,
  };
  vm.createContext(sb);
  const a = appSrc.indexOf('const HOME_FEED_CAP');
  const b = appSrc.indexOf('/* ===== /HOME_FEED ===== */', a);
  vm.runInContext(appSrc.slice(a, b), sb);
  return sb;
}
const es = mkSandbox(null, APP);
const en = mkSandbox('en', APP);
ok(typeof es.homeTileHTML === 'function', 'bloque HOME_FEED carga');
ok(typeof es.hfTileChipParts === 'function', 'hfTileChipParts cargada');
// Semana 2026-08-03..09 (lun..dom, fechas fijas del pasado: nunca Hoy/Mañana).
// 22:00Z = 19:00 en Buenos Aires (UTC-3, sin DST).
const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const P = (extra) => Object.assign({ id: 1, status: 'scheduled', media_type: 'image', image_path: '/media/p1.jpg', caption: 'c' }, extra || {});
function chipOf(html) {
  const m = html.match(/<span class="hf-chip">([\s\S]*?)<\/span><\/span>/)
    || html.match(/<span class="hf-chip">([\s\S]*?)<\/span>/);
  return m ? m[1] : '';
}
for (let d = 0; d < 7; d++) {
  const iso = '2026-08-0' + (3 + d) + 'T22:00:00.000Z';
  const t = es.homeTileHTML({ kind: 'post', post: P({ id: 30 + d, scheduled_at: iso }), day: '2026-08-0' + (3 + d), isNew: false }, 0);
  ok(!t.includes('data-hf-chat') && !t.includes('hf-tile-chat'), 'tile ES día ' + DAYS_ES[d] + ': SIN globito');
  ok(t.includes('data-hf-like'), 'tile ES día ' + DAYS_ES[d] + ': corazón intacto');
  ok(t.includes('/media/p1.jpg'), 'tile ES día ' + DAYS_ES[d] + ': foto intacta');
  ok(t.includes('data-post-id="' + (30 + d) + '"') && t.includes('data-sched-at="'), 'tile ES día ' + DAYS_ES[d] + ': dataset para doble toque intacto');
  const chip = chipOf(t);
  ok(chip.includes('<span class="hf-chip-day">' + DAYS_ES[d] + '</span>'), 'tile ES: día exacto ' + DAYS_ES[d] + ' (visto: ' + chip + ')');
  ok(chip.includes('<span class="hf-chip-hm"> · 19:00'), 'tile ES: hora completa 19:00');
  ok(!chip.includes('…') && !chip.includes('...'), 'tile ES día ' + DAYS_ES[d] + ': sin puntos suspensivos');
  ok(!chip.includes(DAYS_ES[d] + ' '), 'tile ES día ' + DAYS_ES[d] + ': sin número de fecha pegado al día');
  const tEn = en.homeTileHTML({ kind: 'post', post: P({ id: 40 + d, scheduled_at: iso }), day: '2026-08-0' + (3 + d), isNew: false }, 0);
  const chipEn = chipOf(tEn);
  ok(chipEn.includes('<span class="hf-chip-day">' + DAYS_EN[d] + '</span>'), 'tile EN: día exacto ' + DAYS_EN[d]);
  ok(chipEn.includes('7:00 PM'), 'tile EN: hora completa 7:00 PM');
  ok(!chipEn.includes('…'), 'tile EN día ' + DAYS_EN[d] + ': sin puntos suspensivos');
}
{
  // Borrador, publicada, visitante, archivada, IG: sin globito en todos los casos.
  const tDraft = es.homeTileHTML({ kind: 'post', post: P({ id: 50, status: 'draft', scheduled_at: '2026-08-05T22:00:00.000Z' }), day: '2026-08-05', isNew: false }, 0);
  ok(!tDraft.includes('data-hf-chat'), 'tile borrador: SIN globito');
  const tPub = es.homeTileHTML({ kind: 'post', post: P({ id: 51, status: 'published', published_at: '2026-08-05T22:00:00.000Z' }), day: null, isNew: false }, 0);
  ok(!tPub.includes('data-hf-chat'), 'tile publicada: SIN globito');
  const tVis = es.homeTileHTML({ kind: 'post', post: P({ id: 52, scheduled_at: '2026-08-05T22:00:00.000Z' }), day: '2026-08-05', isNew: false, visitor: true }, 0);
  ok(!tVis.includes('data-hf-chat'), 'tile visitante: SIN globito');
  const tArch = es.homeTileHTML({ kind: 'post', post: P({ id: 53, scheduled_at: '2026-08-05T22:00:00.000Z' }), day: '2026-08-05', isNew: false, archivedExt: true }, 0);
  ok(!tArch.includes('data-hf-chat'), 'tile archivada: SIN globito');
  const tIg = es.homeTileHTML({ kind: 'ig', img: '/r/1.jpg', type: 'image', taken_at: 1700000000, isNew: false }, 0);
  ok(!tIg.includes('data-hf-chat'), 'tile IG: SIN globito');
}
{
  // Controles en prístino: el día viejo trae número y el globito existe.
  const pre = mkSandbox(null, APP_PRE);
  const tPre = pre.homeTileHTML({ kind: 'post', post: P({ id: 60, scheduled_at: '2026-08-07T22:00:00.000Z' }), day: '2026-08-07', isNew: false }, 0);
  ok(tPre.includes('data-hf-chat="60"'), 'control prístino: tile SÍ tenía globito');
  const chipPre = chipOf(tPre);
  ok(chipPre.includes('<span class="hf-chip-day">Vie 7</span>'), 'control prístino: día viejo era "Vie 7" (visto: ' + chipPre + ')');
  ok(CSS_PRE.includes('.hf-tile.hf-has-chip > .hf-strip .hf-chip-day{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}'),
    'control prístino: regla vieja día-con-ellipsis presente');
}

console.log(`\ntest-lotefeedtira: ${pass}/${pass + fail} OK`);
if (fail) { console.log('FALLOS: ' + fails.join(' | ')); process.exit(1); }
