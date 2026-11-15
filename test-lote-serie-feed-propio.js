// test-lote-serie-feed-propio.js — LOTE SERIE-FEED-PROPIO
// La SERIE de un feed registrado tiene dueño por día (diseño
// ~/workspace/.diag-serie-feed-propio/DISENO.md, orden del tablero
// 14/11/2026 — incidente de la tira del feed propio, user 12).
// Causa raíz: la semana gobernada de un registrado (foto·video·foto,
// cada pieza con SU día) no existía como mapa para ningún relleno
// automático: el ensure solo rescataba borradores imagen/carrusel
// creados en 48 h (el video 653 no calificaba), el embudo semanal
// colocaba cada borrador en el primer día libre (el ajeno 679 tomó el
// día del video) y la pieza dormida no hablaba (nadie supo que el 653
// seguía en borrador). El lote: el módulo puro serie-feed.js
// (mapaDiasSerie: el día de cada pieza se DERIVA al leer — anclas +
// composición; sin tabla ni columna nueva), el candado en los tres
// consumidores (ensureTodayPost paso 1.5 · scheduleDraftsPerWeek ·
// subirPlanDia) y la alerta serieFeedSweep (cron :07, registro del
// equipo vía logTeamAction).
// Batería:
//   S0 contrato en la fuente (require, paso 1.5 antes del paso 2,
//      motivos nuevos, reservas en el embudo y en Subir, sweep
//      exportado, cron :07 en scheduler.js).
//   S1 el módulo puro contra una DB en memoria: gobernada por ancla y
//      por composición, orden de composición vs created_at,
//      exclusiones (frenada / user_stopped / rechazada / subir /
//      express), day_stop y día cerrado saltados, ancla frenada que
//      igual ocupa, excedente sin día, y la alerta (víspera/hoy/
//      atrasada, dedup, needs_review que reserva pero no alerta,
//      invitado fuera).
//   S4 boot del servidor real — el fixture espejo del incidente,
//      generalizado a cualquier día de semana: 649 publicado (rellenos
//      de la semana), 653 video en borrador creado ayer sin marcas,
//      582 programado, composición [rellenos, 653, 582] y variante sin
//      composición:
//      A el mapa asigna HOY al 653 (con y sin composición).
//      B el ensure NO genera ni promueve al extranjero: la dueña sin
//        media no es promovible → 'dia_de_serie', conteo intacto, el
//        borrador fresco de hoy sigue borrador.
//      C el ensure coloca a la dueña: el video queda programado hoy
//        a la best_hour, sin crear posteos.
//      B2 con la dueña FRENADA el candado se levanta (sale del mapa:
//        el ensure ya no devuelve 'dia_de_serie').
//      D el planificador ni pisa ni desliza: D1 la dueña cae HOY por
//        el embudo (la base la desliza a mañana); D2 en la semana que
//        viene el ajeno express NO toma el día reservado y la dueña
//        cae en SU día; D3 con su día ocupado de verdad, la dueña
//        espera 'serie_dia_propio' y sigue borrador.
//      F la regla 24h no resucita fuera de día: la pieza de ayer
//        espera 'serie_dia_propio' por el embudo y la alerta atrasada
//        sale una sola vez.
//      E la alerta una sola vez por nivel (víspera y hoy, barrido
//        idempotente) y calla si la pieza se frena.
// Uso: node test-lote-serie-feed-propio.js (desde la raíz del árbol).
// CONTROL contra la base: en el árbol SIN el lote, S0/S1 no existen y
// S4 reproduce el incidente (el ensure promueve/genera al extranjero,
// la dueña se desliza o resucita fuera de día, nadie alerta).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const TREE = __dirname;
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const SCH = fs.readFileSync(path.join(TREE, 'scheduler.js'), 'utf8');

// En el árbol base (control) el módulo del lote no existe: la batería
// lo registra como falla de su sección y sigue, para que el control
// muestre el hueco completo en vez de abortar.
let serieFeed = null;
try { serieFeed = require(path.join(TREE, 'serie-feed.js')); } catch (e) { serieFeed = null; }
let supportCases = null;
try { supportCases = require(path.join(TREE, 'support-cases.js')); } catch (e) { supportCases = null; }
const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));

// ---------- zona horaria segura (mismo criterio que patrones) ----
const ZONES = ['Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Dubai', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Honolulu', 'UTC'];
function hourIn(zone, d) {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hour12: false }).format(d)) % 24; } catch (e) { return -1; }
}
const NOW = new Date();
const TZ = ZONES.find((z) => { const h = hourIn(z, NOW); return h >= 10 && h <= 16; }) || 'UTC';
const TODAY = dayKeyInTz(NOW, TZ);
const shiftDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const TOMORROW = shiftDays(TODAY, 1);
const YESTERDAY = shiftDays(TODAY, -1);
const mondayOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
};
const W = mondayOf(TODAY);
const W2 = shiftDays(W, 7);
function wallToUtc(s, tz) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return null;
  const Y = +m[1], Mo = +m[2], D = +m[3], h = +m[4], mi = +m[5];
  const guess = Date.UTC(Y, Mo - 1, D, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(guess))) parts[p.type] = p.value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, (+parts.hour % 24), +parts.minute, +parts.second);
  return new Date(guess - (asUtc - guess)).toISOString();
}
const atHour = (ymd, hh) => wallToUtc(`${ymd} ${String(hh).padStart(2, '0')}:00`, TZ);
const sqlDt = (date) => date.toISOString().replace('T', ' ').slice(0, 19);
const haceHs = (h) => sqlDt(new Date(Date.now() - h * 3600 * 1000));
const weekdayIso = (ymd) => { const wd = new Date(ymd + 'T12:00:00Z').getUTCDay(); return wd === 0 ? 7 : wd; };

// ================= S0 · contrato en la fuente =================
function parteFuente() {
  console.log('\n== S0 · contrato en la fuente ==');
  t('S0.1 serie-feed.js existe y exporta el mapa, los helpers y la alerta',
    !!serieFeed && ['mapaDiasSerie', 'diasReservadosSerie', 'piezaDuenaDelDia', 'diaDerivadoDe', 'esPiezaGobernada', 'alertasSerie']
      .every((k) => typeof serieFeed[k] === 'function'));
  t('S0.2 server.js importa el módulo', SRV.includes("require('./serie-feed')"));
  const iEns = SRV.indexOf('async function ensureTodayPost(');
  const iPaso15 = SRV.indexOf('piezaDuenaDelDia', iEns);
  const iPaso2 = SRV.indexOf("created_at >= datetime('now', '-2 days')", iEns);
  t('S0.3 el paso 1.5 del ensure consulta a la dueña ANTES del rescate del paso 2',
    iEns > 0 && iPaso15 > iEns && iPaso2 > iPaso15, `ensure=${iEns} paso15=${iPaso15} paso2=${iPaso2}`);
  t('S0.4 el ensure promueve con fuente borrador_serie y frena con dia_de_serie',
    SRV.includes("fuente: 'borrador_serie'") && (SRV.match(/'dia_de_serie'/g) || []).length >= 2);
  const iEmbudo = SRV.indexOf('function scheduleDraftsPerWeek');
  const iSerieEmbudo = SRV.indexOf('serie_dia_propio');
  t('S0.5 el embudo semanal conoce la reserva y el motivo serie_dia_propio',
    iEmbudo > 0 && iSerieEmbudo > iEmbudo && SRV.includes('serieReservados'));
  const iSubir = SRV.indexOf('function subirPlanDia');
  const iSubirFin = SRV.indexOf('function subirHoyYaSalio');
  const subirSrc = iSubir > 0 ? SRV.slice(iSubir, iSubirFin > iSubir ? iSubirFin : iSubir + 6000) : '';
  t('S0.6 Subir: el día reservado no es libre y el ancla gobernada no se desplaza',
    subirSrc.includes('serieReservadosSubir') && subirSrc.includes('esPiezaGobernada'));
  t('S0.7 serieFeedSweep existe, escribe con logTeamAction y está exportado',
    SRV.includes('function serieFeedSweep()') && SRV.includes('supportCases.logTeamAction')
    && /module\.exports = \{[^}]*serieFeedSweep/.test(SRV));
  t('S0.8 scheduler.js corre el barrido cada hora y 07 (patrón regla 24h)',
    SCH.includes("'7 * * * *'") && SCH.includes('serieFeedSweep'));
  const iSad = SRV.indexOf('function scheduleAllDrafts');
  t('S0.9 la regla 24h hereda por el embudo (scheduleAllDrafts llama a scheduleDraftsPerWeek)',
    iSad > 0 && SRV.indexOf('scheduleDraftsPerWeek(uid, ready', iSad) > iSad);
}

// ================= S1 · el módulo puro (DB en memoria) =================
function parteModulo() {
  console.log('\n== S1 · serie-feed.js puro (mapa + alerta) ==');
  if (!serieFeed) { t('S1.0 el módulo existe', false, 'serie-feed.js ausente (árbol base)'); return; }
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, is_guest INTEGER DEFAULT 0, publishing_stopped INTEGER DEFAULT 0, best_hour INTEGER DEFAULT 19);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, image_path TEXT DEFAULT '', caption TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image', week_key TEXT DEFAULT '', created_at TEXT DEFAULT '', published_at TEXT, source TEXT DEFAULT '', approval TEXT DEFAULT 'pending', frenada INTEGER DEFAULT 0, user_stopped INTEGER DEFAULT 0, needs_review INTEGER DEFAULT 0);
    CREATE TABLE feed_compositions (user_id INTEGER, week_key TEXT, data_json TEXT);
    CREATE TABLE day_stops (user_id INTEGER, day_key TEXT, post_id INTEGER, origen TEXT DEFAULT 'dueno_pausa');
    CREATE TABLE profiles (user_id INTEGER, closed_days TEXT);
    CREATE TABLE support_team_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT, user_id INTEGER, post_id INTEGER, detalle TEXT);`);
  const insU = db.prepare('INSERT INTO users (id, is_guest, publishing_stopped, best_hour) VALUES (?, ?, ?, 19)');
  const insP = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, media_type, week_key, created_at, published_at, source, approval, frenada, user_stopped, needs_review)
    VALUES (@id, @uid, @img, @cap, @sat, @st, @mt, @wk, @ca, @pa, @src, @ap, @fr, @us, @nr)`);
  const P = (o) => insP.run({
    id: o.id, uid: o.uid, img: o.img != null ? o.img : '/media/x.jpg', cap: o.cap || ('pieza ' + o.id),
    sat: o.sat || null, st: o.st || 'draft', mt: o.mt || 'image', wk: o.wk || W,
    ca: o.ca || '2026-01-01 10:00:00', pa: o.pa || null, src: o.src || '', ap: o.ap || 'pending',
    fr: o.fr || 0, us: o.us || 0, nr: o.nr || 0,
  });
  const insComp = db.prepare('INSERT INTO feed_compositions (user_id, week_key, data_json) VALUES (?, ?, ?)');
  const comp = (uid, wk, order) => insComp.run(uid, wk, JSON.stringify({ v: 1, order }));

  // 1) Sin ancla ni composición: la semana NO está gobernada.
  insU.run(11, 0, 0); P({ id: 1101, uid: 11 });
  const m11 = serieFeed.mapaDiasSerie(db, 11, W, TZ);
  t('S1.1 sin ancla ni composición no hay gobierno (el borrador no reserva)',
    m11.gobernada === false && m11.reservados.size === 0);

  // 2) Gobernada por ANCLA: el borrador toma el primer día libre.
  insU.run(12, 0, 0);
  P({ id: 1201, uid: 12, st: 'published', sat: atHour(W, 19), pa: atHour(W, 19) });
  P({ id: 1202, uid: 12 });
  const m12 = serieFeed.mapaDiasSerie(db, 12, W, TZ);
  t('S1.2 con ancla del lunes, el borrador deriva al martes',
    m12.gobernada === true && m12.porPost.get(1202) === shiftDays(W, 1) && m12.reservados.has(shiftDays(W, 1)),
    JSON.stringify([...m12.porPost]));

  // 3) Gobernada por COMPOSICIÓN: el rango de la composición manda
  //    sobre created_at.
  insU.run(13, 0, 0);
  P({ id: 1301, uid: 13, ca: '2026-01-01 09:00:00' });
  P({ id: 1302, uid: 13, ca: '2026-01-02 09:00:00' });
  comp(13, W, [1302, 1301]);
  const m13 = serieFeed.mapaDiasSerie(db, 13, W, TZ);
  t('S1.3 la composición gobierna sola y su orden manda: 1302→lunes, 1301→martes',
    m13.gobernada === true && m13.porPost.get(1302) === W && m13.porPost.get(1301) === shiftDays(W, 1),
    JSON.stringify([...m13.porPost]));

  // 4) Exclusiones del conjunto: frenada, user_stopped, rechazada,
  //    subir y express NO reciben día; la sana toma el primer libre.
  insU.run(14, 0, 0);
  P({ id: 1401, uid: 14, st: 'published', sat: atHour(W, 19), pa: atHour(W, 19) });
  P({ id: 1402, uid: 14, fr: 1 });
  P({ id: 1403, uid: 14, us: 1 });
  P({ id: 1404, uid: 14, ap: 'rejected' });
  P({ id: 1405, uid: 14, src: 'subir' });
  P({ id: 1406, uid: 14, src: 'express' });
  P({ id: 1407, uid: 14 });
  const m14 = serieFeed.mapaDiasSerie(db, 14, W, TZ);
  t('S1.4 fuera del conjunto no hay día derivado (frenada/pausada/rechazada/subir/express)',
    [1402, 1403, 1404, 1405, 1406].every((id) => !m14.porPost.has(id)) && m14.porPost.get(1407) === shiftDays(W, 1),
    JSON.stringify([...m14.porPost]));

  // 5) day_stop y día cerrado se saltan al derivar.
  insU.run(15, 0, 0);
  P({ id: 1501, uid: 15, st: 'published', sat: atHour(W, 19), pa: atHour(W, 19) });
  db.prepare('INSERT INTO day_stops (user_id, day_key, origen) VALUES (15, ?, ?)').run(shiftDays(W, 1), 'dueno_pausa');
  db.prepare('INSERT INTO profiles (user_id, closed_days) VALUES (15, ?)').run(JSON.stringify([weekdayIso(shiftDays(W, 2))]));
  P({ id: 1502, uid: 15 });
  const m15 = serieFeed.mapaDiasSerie(db, 15, W, TZ);
  t('S1.5 el día con stop y el día cerrado no reciben pieza: deriva al jueves de la semana',
    m15.porPost.get(1502) === shiftDays(W, 3), JSON.stringify([...m15.porPost]));

  // 6) El ANCLA frenada igual ocupa su día (ya está colocada).
  insU.run(16, 0, 0);
  P({ id: 1601, uid: 16, st: 'scheduled', sat: atHour(shiftDays(W, 1), 19), fr: 1 });
  P({ id: 1602, uid: 16 });
  const m16 = serieFeed.mapaDiasSerie(db, 16, W, TZ);
  t('S1.6 el ancla programada frenada ocupa el martes; el borrador deriva al lunes libre',
    m16.porPost.get(1601) === shiftDays(W, 1) && m16.porPost.get(1602) === W,
    JSON.stringify([...m16.porPost]));

  // 7) Excedente: seis días ocupados, dos borradores → uno con día,
  //    el otro sin día (sin reserva ni alerta).
  insU.run(17, 0, 0);
  for (let i = 0; i < 6; i++) P({ id: 1700 + i, uid: 17, st: 'published', sat: atHour(shiftDays(W, i), 19), pa: atHour(shiftDays(W, i), 19) });
  P({ id: 1710, uid: 17, ca: '2026-01-01 09:00:00' });
  P({ id: 1711, uid: 17, ca: '2026-01-02 09:00:00' });
  const m17 = serieFeed.mapaDiasSerie(db, 17, W, TZ);
  t('S1.7 excedente: el primer borrador toma el único día libre y el segundo queda sin día',
    m17.porPost.get(1710) === shiftDays(W, 6) && !m17.porPost.has(1711) && m17.reservados.size === 1,
    JSON.stringify([...m17.porPost]));

  // 8) La alerta: víspera / hoy / atrasada + dedup + exclusiones.
  const ahoraMediodia = new Date(atHour(TODAY, 12));
  const alertasDe = (uid, ahora) => serieFeed.alertasSerie(db, ahora || ahoraMediodia, { tzDe: () => TZ, bestHourDe: () => 19 })
    .filter((a) => a.user_id === uid);
  // víspera: la semana de MAÑANA con sus días anteriores ocupados por
  // publicados y la composición gobernando: el borrador deriva mañana.
  insU.run(18, 0, 0);
  const wk18 = mondayOf(TOMORROW);
  const fill18 = [];
  for (let d = wk18; d < TOMORROW; d = shiftDays(d, 1)) {
    const fid = 1850 + Number(d.slice(8));
    P({ id: fid, uid: 18, st: 'published', sat: atHour(d, 19), pa: atHour(d, 19), wk: wk18 });
    fill18.push(fid);
  }
  P({ id: 1802, uid: 18, wk: wk18, cap: 'el video de la serie de esta semana, todavía en borrador' });
  comp(18, wk18, [...fill18, 1802]);
  const a18 = alertasDe(18);
  t('S1.8 víspera: una sola alerta serie_alerta_vispera con el detalle fijo',
    a18.length === 1 && a18[0].action === 'serie_alerta_vispera' && a18[0].post_id === 1802
    && a18[0].detalle.includes('su día es mañana ' + TOMORROW) && a18[0].detalle.includes('sigue en borrador'),
    JSON.stringify(a18));
  // dedup: con la fila ya en el log, el barrido no la repite.
  db.prepare('INSERT INTO support_team_log (actor, action, user_id, post_id, detalle) VALUES (?, ?, ?, ?, ?)')
    .run('sistema', a18[0].action, 18, 1802, a18[0].detalle);
  t('S1.9 dedup: con el episodio ya en el log, el barrido no emite de nuevo',
    alertasDe(18).length === 0);
  // hoy: la dueña de hoy alerta antes de la best_hour y calla después.
  insU.run(19, 0, 0);
  const wk19 = mondayOf(TODAY);
  for (let d = wk19; d < TODAY; d = shiftDays(d, 1)) P({ id: 1900 + Number(d.slice(8)), uid: 19, st: 'published', sat: atHour(d, 19), pa: atHour(d, 19), wk: wk19 });
  P({ id: 1950, uid: 19, wk: wk19 });
  comp(19, wk19, [1950]);
  const a19 = alertasDe(19);
  t('S1.10 hoy: la dueña de hoy alerta serie_alerta_hoy antes de la best_hour',
    a19.length === 1 && a19[0].action === 'serie_alerta_hoy' && a19[0].detalle.includes('su día es HOY ' + TODAY + ' a las 19:00'),
    JSON.stringify(a19));
  t('S1.11 hoy pasada la best_hour no hay alerta de hoy (lo cuenta mañana la atrasada)',
    alertasDe(19, new Date(atHour(TODAY, 20))).length === 0);
  // atrasada: la pieza de ayer sigue en borrador.
  insU.run(20, 0, 0);
  const wk20 = mondayOf(YESTERDAY);
  for (let d = wk20; d < YESTERDAY; d = shiftDays(d, 1)) P({ id: 2000 + Number(d.slice(8)), uid: 20, st: 'published', sat: atHour(d, 19), pa: atHour(d, 19), wk: wk20 });
  P({ id: 2050, uid: 20, wk: wk20 });
  comp(20, wk20, [2050]);
  const a20 = alertasDe(20);
  t('S1.12 atrasada: la pieza cuyo día era ayer emite serie_alerta_atrasada',
    a20.length === 1 && a20[0].action === 'serie_alerta_atrasada' && a20[0].detalle.includes('su día era ' + YESTERDAY)
    && a20[0].detalle.includes('la serie salió sin ella'), JSON.stringify(a20));
  // needs_review: reserva su día pero NO alerta (misma construcción
  // de víspera que S1.8: su día derivado es mañana).
  insU.run(21, 0, 0);
  const wk21 = mondayOf(TOMORROW);
  const fill21 = [];
  for (let d = wk21; d < TOMORROW; d = shiftDays(d, 1)) {
    const fid = 2150 + Number(d.slice(8));
    P({ id: fid, uid: 21, st: 'published', sat: atHour(d, 19), pa: atHour(d, 19), wk: wk21 });
    fill21.push(fid);
  }
  P({ id: 2102, uid: 21, wk: wk21, nr: 1 });
  comp(21, wk21, [...fill21, 2102]);
  const m21 = serieFeed.mapaDiasSerie(db, 21, wk21, TZ);
  t('S1.13 needs_review reserva su día (mañana) pero el barrido no la alerta',
    m21.porPost.get(2102) === TOMORROW && alertasDe(21).length === 0,
    'dia=' + m21.porPost.get(2102));
  // invitado y cuenta frenada: fuera del universo de la alerta.
  insU.run(22, 1, 0);
  P({ id: 2201, uid: 22, st: 'scheduled', sat: atHour(TODAY, 19), wk: W });
  P({ id: 2202, uid: 22, wk: W });
  insU.run(23, 0, 1);
  P({ id: 2301, uid: 23, st: 'scheduled', sat: atHour(TODAY, 19), wk: W });
  P({ id: 2302, uid: 23, wk: W });
  t('S1.14 el invitado y la cuenta con publishing_stopped no alertan',
    alertasDe(22).length === 0 && alertasDe(23).length === 0);
  db.close();
}

// ================= S4 · boot del servidor real =================
const PORT = 34671;
const SECRET = 'serie-feed-secret';
const ADMIN = 'boot-test-token-serie-feed';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serie-feed-'));
const NODE_MODULES = '/home/hatch/workspace/posta/node_modules';
const FIXTURE_JPG = path.join(TREE, 'stock', 'barberia', '2061820.jpg');

function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
const cookieFor = (sid) => 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
async function api(method, pth, sid, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${pth}`, {
    method,
    headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function lastResult(sid, tries) {
  for (let i = 0; i < (tries || 12); i++) {
    const r = await api('GET', '/api/week/last-result', sid);
    if (r.json && r.json.has && r.json.result) return r.json.result;
    await sleep(1000);
  }
  return null;
}

async function parteBoot() {
  console.log('\n== S4 · boot del servidor real (el fixture del incidente) ==');
  console.log('zona de la batería:', TZ, '| hoy:', TODAY, '| semana:', W, '| mañana:', TOMORROW, '| ayer:', YESTERDAY);
  fs.mkdirSync(path.join(tmpDir, 'media'), { recursive: true });
  fs.copyFileSync(FIXTURE_JPG, path.join(tmpDir, 'media', 'fixture.jpg'));
  fs.writeFileSync(path.join(tmpDir, 'media', 'reel-fixture.mp4'), Buffer.alloc(64, 7));
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: ADMIN,
    SESSION_SECRET: SECRET,
    NODE_PATH: NODE_MODULES,
    OPENAI_API_KEY: 'test',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  process.on('exit', kill);
  const dbFile = path.join(tmpDir, 'posta.db');
  const openDb = () => new DatabaseSync(dbFile);
  try {
    let up = false;
    for (let i = 0; i < 45 && !up; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) up = true; } catch (e) {}
      if (!up) await sleep(1000);
    }
    t('S4.0 el servidor levanta con el lote', up);
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }

    // ---------- siembra ----------
    const bcrypt = require(path.join(NODE_MODULES, 'bcryptjs'));
    const db0 = openDb();
    // auto_week=0 en TODAS las cuentas del fixture: la regla 24h del
    // scheduler (cron :17) no debe agendar por su cuenta en mitad de
    // la batería — el embudo se ejercita por la puerta manual, que es
    // el mismo scheduleDraftsPerWeek.
    const insUser = db0.prepare(`INSERT INTO users (id, email, password_hash, plan_status, best_hour, auto_week) VALUES (?, ?, ?, 'active', 19, 0)`);
    const insSet = db0.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`);
    const insProf = db0.prepare(`INSERT INTO profiles (user_id, business_name, description) VALUES (?, ?, ?)`);
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({ cookie: { originalMaxAge: 604800000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' }, userId: uid });
    const insSess = db0.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`);
    const DESC = 'Negocio de prueba de la batería serie-feed: pastelería casera, medialunas y café de especialidad todos los días.';
    const UIDS = [501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511];
    for (const uid of UIDS) {
      insUser.run(uid, `sf-${uid}@test.invalid`, bcrypt.hashSync('sf-pass-' + uid, 10));
      insSet.run(uid, TZ);
      insProf.run(uid, 'Negocio SF ' + uid, DESC);
      insSess.run('sf-' + uid, sessJson(uid), exp);
    }
    const insPost = db0.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, media_type, week_key, needs_review, source, frenada, user_stopped, approval, published_at, created_at)
      VALUES (@id, @uid, @img, @cap, '', @sat, @st, @mt, @wk, @nr, @src, @fr, @us, 'pending', @pa, @ca)`);
    const seedPost = (o) => insPost.run({
      id: o.id, uid: o.uid, img: o.img != null ? o.img : '/media/fixture.jpg', cap: o.cap,
      sat: o.sat || null, st: o.st || 'draft', mt: o.mt || 'image', wk: o.wk || W,
      nr: o.nr || 0, src: o.src || '', fr: o.fr || 0, us: o.us || 0, pa: o.pa || null,
      ca: o.ca || haceHs(30),
    });
    const insComp = db0.prepare('INSERT INTO feed_compositions (user_id, week_key, data_json) VALUES (?, ?, ?)');
    const seedComp = (uid, wk, order) => insComp.run(uid, wk, JSON.stringify({ v: 1, uid, weekKey: wk, order, assignments: [], flags: [] }));

    // La semana del incidente, generalizada: rellenos publicados en
    // los días de W anteriores a hoy; la pieza «582» programada el
    // primer día libre posterior (si hoy es domingo, publicada ayer:
    // ancla igual, y el publicador no la toca); la pieza «653» en
    // borrador. Devuelve los ids sembrados.
    function seedIncidentWeek(uid, base, p2opts) {
      const daysBefore = [];
      for (let d = W; d < TODAY; d = shiftDays(d, 1)) daysBefore.push(d);
      const daysAfter = [];
      for (let d = shiftDays(TODAY, 1); d <= shiftDays(W, 6); d = shiftDays(d, 1)) daysAfter.push(d);
      const p3Day = daysAfter.length ? daysAfter[0] : daysBefore[daysBefore.length - 1];
      const fillerIds = [];
      let n = 0;
      for (const d of daysBefore) {
        if (d === p3Day) continue;
        const id = base + (n++);
        seedPost({ id, uid, st: 'published', sat: atHour(d, 19), pa: atHour(d, 19), ca: haceHs(96), cap: `La pieza ya publicada del ${d}: la medialuna tibia de la mañana, como cada día de esta semana.` });
        fillerIds.push(id);
      }
      const p3Id = base + 50;
      if (daysAfter.length) {
        seedPost({ id: p3Id, uid, st: 'scheduled', sat: atHour(p3Day, 19), ca: haceHs(50), cap: 'La foto que cierra la tira de la semana: la medialuna con café, lista para su día.' });
      } else {
        seedPost({ id: p3Id, uid, st: 'published', sat: atHour(p3Day, 19), pa: atHour(p3Day, 19), ca: haceHs(50), cap: 'La foto que cierra la tira de la semana: la medialuna con café, lista para su día.' });
      }
      const p2Id = base + 51;
      seedPost({ id: p2Id, uid, ca: haceHs(26), cap: 'El video de la serie de esta semana: así sale la medialuna del horno, tibia y dorada.', ...(p2opts || {}) });
      return { fillerIds, p3Id, p2Id, p3Day };
    }

    // 501 · el incidente completo (mapa + ensure coloca a la dueña).
    const f501 = seedIncidentWeek(501, 50100, { mt: 'video', img: '/media/reel-fixture.mp4' });
    seedComp(501, W, [...f501.fillerIds, f501.p2Id, f501.p3Id]);
    // 510 · la variante SIN composición: el mapa sale de created_at.
    const f510 = seedIncidentWeek(510, 51000, { mt: 'video', img: '/media/reel-fixture.mp4' });
    // 502 · la dueña SIN media (no promovible) + un borrador fresco de
    // hoy, imagen, que en la base el paso 2 promueve como extranjero.
    const f502 = seedIncidentWeek(502, 50200, { mt: 'video', img: '' });
    seedComp(502, W, [...f502.fillerIds, f502.p2Id, f502.p3Id]);
    const FRESCO502 = 50260;
    seedPost({ id: FRESCO502, uid: 502, ca: haceHs(1), cap: 'El borrador fresco de hoy: el café de especialidad recién molido, foto de esta mañana.' });
    // 507 · la dueña frenada: el candado se levanta.
    const f507 = seedIncidentWeek(507, 50700, { mt: 'video', img: '', fr: 1 });
    seedComp(507, W, [...f507.fillerIds, f507.p2Id, f507.p3Id]);
    // 503 · el embudo coloca a la dueña HOY (imagen: pasa el gate).
    const f503 = seedIncidentWeek(503, 50300, { mt: 'image', img: '/media/fixture.jpg' });
    seedComp(503, W, [...f503.fillerIds, f503.p2Id, f503.p3Id]);
    // 505 · la dueña con su día ocupado de verdad en el taken: un
    // programado de HOY cuya week_key es la semana que viene. Es un
    // VIDEO: ocupa el día en el taken del feed sin consumir el cupo
    // de imagenes de la semana (que ya viene cargado de la tira).
    const f505 = seedIncidentWeek(505, 50500, { mt: 'image', img: '/media/fixture.jpg' });
    seedComp(505, W, [...f505.fillerIds, f505.p2Id, f505.p3Id]);
    const OCUPANTE505 = 50560;
    seedPost({ id: OCUPANTE505, uid: 505, st: 'scheduled', sat: atHour(TODAY, 19), wk: W2, mt: 'video', img: '/media/reel-fixture.mp4', ca: haceHs(40), cap: 'El video corrido de la semana que viene que hoy ocupa el día en la agenda.' });
    // 504 · la semana que viene: ancla el lunes, el ajeno express
    // creado ANTES que la dueña (la carrera del planificador).
    const ANCLA504 = 50401;
    seedPost({ id: ANCLA504, uid: 504, st: 'scheduled', sat: atHour(W2, 19), wk: W2, ca: haceHs(30), cap: 'La pieza que abre la semana que viene, ya programada el lunes.' });
    const AJENO504 = 50402;
    seedPost({ id: AJENO504, uid: 504, src: 'express', wk: W2, ca: haceHs(3), cap: 'El posteo express que llegó por el carril rápido y quiere el primer día libre.' });
    const DUENA504 = 50403;
    seedPost({ id: DUENA504, uid: 504, wk: W2, ca: haceHs(2), cap: 'La pieza de la serie de la semana que viene: su día es el martes, después del ancla.' });
    // 506 · víspera: la semana de mañana ocupada hasta hoy inclusive.
    const wk506 = mondayOf(TOMORROW);
    const fill506 = [];
    {
      let n = 0;
      for (let d = wk506; d < TOMORROW; d = shiftDays(d, 1)) {
        const id = 50600 + (n++);
        seedPost({ id, uid: 506, st: 'published', sat: atHour(d, 19), pa: atHour(d, 19), wk: wk506, ca: haceHs(96), cap: `La pieza ya publicada del ${d} en la cuenta de la víspera, parte de su serie.` });
        fill506.push(id);
      }
    }
    const P2_506 = 50651;
    seedPost({ id: P2_506, uid: 506, mt: 'video', img: '/media/reel-fixture.mp4', wk: wk506, ca: haceHs(26), cap: 'El video de mañana en la serie de esta cuenta: sigue en borrador y su día llega.' });
    seedComp(506, wk506, [...fill506, P2_506]);
    // 508 · hoy: la dueña de hoy sigue en borrador antes de la hora.
    const fill508 = [];
    {
      let n = 0;
      for (let d = W; d < TODAY; d = shiftDays(d, 1)) {
        const id = 50800 + (n++);
        seedPost({ id, uid: 508, st: 'published', sat: atHour(d, 19), pa: atHour(d, 19), ca: haceHs(96), cap: `La pieza ya publicada del ${d} en la cuenta de la alerta de hoy.` });
        fill508.push(id);
      }
    }
    const P2_508 = 50851;
    seedPost({ id: P2_508, uid: 508, mt: 'video', img: '/media/reel-fixture.mp4', ca: haceHs(26), cap: 'El video de hoy en la serie de esta cuenta: su día es hoy y sigue en borrador.' });
    seedComp(508, W, [...fill508, P2_508]);
    // 509 · atrasada + regla 24h: la pieza de AYER, creada hace 48 h.
    const wk509 = mondayOf(YESTERDAY);
    const fill509 = [];
    {
      let n = 0;
      for (let d = wk509; d < YESTERDAY; d = shiftDays(d, 1)) {
        const id = 50900 + (n++);
        seedPost({ id, uid: 509, st: 'published', sat: atHour(d, 19), pa: atHour(d, 19), wk: wk509, ca: haceHs(120), cap: `La pieza ya publicada del ${d} en la cuenta de la atrasada.` });
        fill509.push(id);
      }
    }
    const P2_509 = 50951;
    seedPost({ id: P2_509, uid: 509, ca: haceHs(48), cap: 'La pieza de ayer en la serie de esta cuenta: su día pasó y quedó en borrador.' });
    seedComp(509, wk509, [...fill509, P2_509]);
    // 511 · el frente vacío: semana gobernada SOLO por la composición
    // (sin una sola ancla), con un borrador de la prueba. Su día
    // derivado sale en el pasado (el primer día de la semana) pero la
    // serie nunca fluyó: no hay día perdido que proteger.
    const G_511 = 51101;
    seedPost({ id: G_511, uid: 511, src: 'trial', ca: haceHs(30), cap: 'La pieza de una semana que nunca arrancó: la composición existe pero el feed no fluyó.' });
    seedComp(511, W, [G_511]);
    db0.close();

    const q1 = (sql, ...args) => { const d = openDb(); const r = d.prepare(sql).get(...args); d.close(); return r; };
    const q = (sql, ...args) => { const d = openDb(); const r = d.prepare(sql).all(...args); d.close(); return r; };
    const post = (id) => q1('SELECT * FROM posts WHERE id = ?', id);
    const totalPosts = (uid) => q1('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?', uid).n;
    const mapaDe = (uid, wk) => (serieFeed ? serieFeed.mapaDiasSerie(openDb(), uid, wk, TZ) : null);

    // ================= A · el mapa =================
    console.log('\n== A · el mapa asigna hoy a la dueña (653) ==');
    {
      const m = mapaDe(501, W);
      t('A.1 la semana del incidente está gobernada', !!m && m.gobernada === true);
      t('A.2 el mapa deriva HOY para el video en borrador (el 653)',
        !!m && m.porPost.get(f501.p2Id) === TODAY && m.reservados.has(TODAY),
        m ? JSON.stringify([...m.porPost]) : 'sin módulo');
      t('A.3 la dueña del día es la pieza de la serie',
        !!serieFeed && (() => { const d = openDb(); const p = serieFeed.piezaDuenaDelDia(d, 501, TODAY, TZ); d.close(); return !!p && p.id === f501.p2Id; })());
      const m510 = mapaDe(510, W);
      t('A.4 sin composición el mapa da lo mismo (el orden sale de created_at)',
        !!m510 && m510.gobernada === true && m510.porPost.get(f510.p2Id) === TODAY,
        m510 ? JSON.stringify([...m510.porPost]) : 'sin módulo');
    }

    // ================= C · el ensure coloca a la dueña =================
    console.log('\n== C · el ensure coloca a la dueña ==');
    {
      const antes = totalPosts(501);
      await api('POST', '/api/week/ensure', 'sf-501', {});
      const res = await lastResult('sf-501', 15);
      const p2 = post(f501.p2Id);
      t('C.1 el ensure reporta ok (la dueña quedó colocada)', !!res && res.ok === true, 'result=' + JSON.stringify(res));
      t('C.2 el video de la serie quedó programado HOY a la best_hour',
        p2.status === 'scheduled' && dayKeyInTz(new Date(p2.scheduled_at), TZ) === TODAY
        && new Date(p2.scheduled_at).getTime() === new Date(atHour(TODAY, 19)).getTime(),
        JSON.stringify({ s: p2.status, at: p2.scheduled_at }));
      t('C.3 no se creó ningún posteo nuevo', totalPosts(501) === antes, `antes=${antes} ahora=${totalPosts(501)}`);
    }

    // ================= B · el ensure no genera al extranjero =================
    console.log('\n== B · el ensure no genera ni promueve al extranjero ==');
    {
      const m = mapaDe(502, W);
      t('B.0 el mapa: la dueña sin media igual deriva HOY y el fresco NO es dueño de hoy (deriva otro día o queda excedente)',
        !!m && m.porPost.get(f502.p2Id) === TODAY && m.porPost.get(FRESCO502) !== TODAY,
        m ? JSON.stringify([...m.porPost]) : 'sin módulo');
      const antes = totalPosts(502);
      await api('POST', '/api/week/ensure', 'sf-502', {});
      const res = await lastResult('sf-502', 20);
      t('B.1 el ensure frena con el motivo honesto dia_de_serie',
        !!res && res.ok === false && res.reason === 'dia_de_serie', 'result=' + JSON.stringify(res));
      const p2 = post(f502.p2Id);
      const fresco = post(FRESCO502);
      t('B.2 la dueña sigue en borrador (no se la fuerza sin media)', p2.status === 'draft' && !p2.scheduled_at);
      t('B.3 el borrador fresco NO fue promovido como extranjero (en la base toma el día)',
        fresco.status === 'draft' && !fresco.scheduled_at, JSON.stringify({ s: fresco.status, at: fresco.scheduled_at }));
      const schedHoy = q('SELECT id FROM posts WHERE user_id = 502 AND status = \'scheduled\'').filter((p) => {
        const r = post(p.id); return r.scheduled_at && dayKeyInTz(new Date(r.scheduled_at), TZ) === TODAY;
      });
      t('B.4 nada quedó programado para hoy y el conteo de posteos está intacto',
        schedHoy.length === 0 && totalPosts(502) === antes,
        'schedHoy=' + schedHoy.map((x) => x.id).join(',') + ` antes=${antes} ahora=${totalPosts(502)}`);
    }

    // ================= B2 · la dueña frenada levanta el candado =================
    console.log('\n== B2 · con la dueña frenada, el candado se levanta ==');
    {
      const duena = serieFeed ? (() => { const d = openDb(); const p = serieFeed.piezaDuenaDelDia(d, 507, TODAY, TZ); d.close(); return p; })() : undefined;
      t('B2.1 la pieza frenada sale del mapa: hoy no tiene dueña', duena === null, 'duena=' + JSON.stringify(duena));
      await api('POST', '/api/week/ensure', 'sf-507', {});
      // Sin dueña, el ensure sigue su curso y cae a generación (la
      // clave de la batería es falsa: falla, pero el MOTIVO ya no es
      // el candado). El resultado puede tardar: se lee de
      // last-result o, en su defecto, del log [week-ensure] del boot.
      let res = await lastResult('sf-507', 30);
      if (!res) {
        for (let i = 0; i < 30 && !res; i++) {
          const ix = out.indexOf('usuario 507 hoy:');
          if (ix >= 0) {
            const seg = out.slice(ix, ix + 120);
            const mm = seg.match(/sin posteo \((\w+)\)/);
            if (mm) res = { ok: false, reason: mm[1] };
            else if (seg.includes('posteo')) res = { ok: true, reason: 'today_ok' };
          }
          if (!res) await sleep(1000);
        }
      }
      t('B2.2 el ensure ya NO devuelve dia_de_serie (sigue su curso normal)',
        !!res && res.reason !== 'dia_de_serie', 'result=' + JSON.stringify(res));
      t('B2.3 la pieza frenada sigue en borrador, intacta', post(f507.p2Id).status === 'draft');
    }

    // ================= D1 · el embudo coloca a la dueña hoy =================
    console.log('\n== D1 · el planificador coloca a la dueña en SU día (hoy) ==');
    {
      const sa = await api('POST', '/api/posts/schedule-all', 'sf-503', {});
      const p2 = post(f503.p2Id);
      t('D1.1 el schedule-all corre', sa.status === 200, 'status=' + sa.status + ' body=' + JSON.stringify(sa.json).slice(0, 160));
      t('D1.2 la dueña quedó programada HOY (en la base el embudo la desliza a mañana)',
        p2.status === 'scheduled' && dayKeyInTz(new Date(p2.scheduled_at), TZ) === TODAY,
        JSON.stringify({ s: p2.status, at: p2.scheduled_at }));
    }

    // ================= D2 · la carrera de la semana que viene =================
    console.log('\n== D2 · el ajeno no pisa el día reservado ni la dueña se desliza ==');
    {
      const diaDuena = shiftDays(W2, 1);
      const diaAjeno = shiftDays(W2, 2);
      const m = mapaDe(504, W2);
      t('D2.0 el mapa de la semana que viene: la dueña deriva el martes tras el ancla',
        !!m && m.gobernada === true && m.porPost.get(DUENA504) === diaDuena && m.reservados.has(diaDuena),
        m ? JSON.stringify([...m.porPost]) : 'sin módulo');
      const sa = await api('POST', '/api/posts/schedule-all', 'sf-504', {});
      const ajeno = post(AJENO504);
      const duena = post(DUENA504);
      t('D2.1 el schedule-all corre', sa.status === 200, 'status=' + sa.status + ' body=' + JSON.stringify(sa.json).slice(0, 160));
      t('D2.2 la dueña cayó exactamente en SU día derivado',
        duena.status === 'scheduled' && dayKeyInTz(new Date(duena.scheduled_at), TZ) === diaDuena,
        JSON.stringify({ s: duena.status, at: duena.scheduled_at }));
      t('D2.3 el ajeno express NO tomó el día reservado: cayó el día siguiente libre',
        ajeno.status === 'scheduled' && dayKeyInTz(new Date(ajeno.scheduled_at), TZ) === diaAjeno,
        JSON.stringify({ s: ajeno.status, at: ajeno.scheduled_at }));
    }

    // ================= D3 · la dueña espera si su día está ocupado =================
    console.log('\n== D3 · con su día ocupado de verdad, la dueña espera (no se desliza) ==');
    {
      const sa = await api('POST', '/api/posts/schedule-all', 'sf-505', {});
      const waiting = (sa.json && sa.json.waiting) || [];
      const p2 = post(f505.p2Id);
      t('D3.1 la dueña espera con el motivo nuevo serie_dia_propio',
        waiting.some((x) => x.id === f505.p2Id && x.reason === 'serie_dia_propio'),
        'status=' + sa.status + ' waiting=' + JSON.stringify(waiting));
      t('D3.2 la dueña sigue en borrador, sin fecha (en la base se deslizaba a otro día)',
        p2.status === 'draft' && !p2.scheduled_at, JSON.stringify({ s: p2.status, at: p2.scheduled_at }));
      t('D3.3 el ocupante de hoy no se movió', post(OCUPANTE505).status === 'scheduled');
    }

    // ================= D4 · el frente vacío no es un día perdido =================
    console.log('\n== D4 · semana gobernada sin anclas: el borrador NO espera serie_dia_propio ==');
    {
      const m = mapaDe(511, W);
      t('D4.0 el mapa gobierna la semana por la composición y deriva el primer día (pasado)',
        !!m && m.gobernada === true && m.porPost.get(G_511) === W,
        m ? JSON.stringify([...m.porPost]) : 'sin módulo');
      const sa = await api('POST', '/api/posts/schedule-all', 'sf-511', {});
      const waiting = (sa.json && sa.json.waiting) || [];
      const g = post(G_511);
      t('D4.1 sin ancla anterior, el planificador lo coloca por el escaneo normal (no espera serie_dia_propio)',
        !waiting.some((x) => x.id === G_511 && x.reason === 'serie_dia_propio')
        && g.status === 'scheduled' && dayKeyInTz(new Date(g.scheduled_at), TZ) >= TODAY,
        'status=' + sa.status + ' waiting=' + JSON.stringify(waiting) + ' post=' + JSON.stringify({ s: g.status, at: g.scheduled_at }));
    }

    // ================= F · atrasada + la regla 24h no resucita fuera de día =================
    console.log('\n== F · la atrasada habla y el embudo no la resucita fuera de día ==');
    {
      // El barrido, con el pegamento espejado del de server.js
      // (alertasSerie decide; logTeamAction escribe tras re-verificar
      // el borrador). El cron :07 puede haber emitido ya por el camino
      // real: las aserciones son sobre el LOG (exactamente una fila).
      const barrer = () => {
        if (!serieFeed || !supportCases) return [];
        const d = openDb();
        const alertas = serieFeed.alertasSerie(d, new Date(), { tzDe: () => TZ, bestHourDe: () => 19 })
          .filter((a) => a.user_id === 509);
        for (const a of alertas) {
          const p = d.prepare('SELECT status FROM posts WHERE id = ?').get(a.post_id);
          if (!p || p.status !== 'draft') continue;
          supportCases.logTeamAction(d, { actor: 'sistema', action: a.action, userId: a.user_id, postId: a.post_id, detalle: a.detalle });
        }
        d.close();
        return alertas;
      };
      barrer();
      const segunda = barrer();
      const filas = q('SELECT * FROM support_team_log WHERE post_id = ? AND action = ?', P2_509, 'serie_alerta_atrasada');
      t('F.1 la atrasada quedó registrada exactamente UNA vez, con su detalle',
        filas.length === 1 && filas[0].detalle.includes('su día era ' + YESTERDAY) && filas[0].detalle.includes('la serie salió sin ella'),
        'filas=' + filas.length + ' ' + JSON.stringify(filas.map((f) => f.detalle)));
      t('F.2 el segundo barrido no emite nada nuevo para la pieza (idempotente)',
        segunda.filter((a) => a.post_id === P2_509).length === 0, JSON.stringify(segunda));
      const sa = await api('POST', '/api/posts/schedule-all', 'sf-509', {});
      const waiting = (sa.json && sa.json.waiting) || [];
      const p2 = post(P2_509);
      t('F.3 por el embudo la pieza espera serie_dia_propio (su día ya pasó)',
        waiting.some((x) => x.id === P2_509 && x.reason === 'serie_dia_propio'),
        'status=' + sa.status + ' waiting=' + JSON.stringify(waiting));
      t('F.4 la pieza sigue en borrador: la regla 24h NO la resucitó en otro día',
        p2.status === 'draft' && !p2.scheduled_at, JSON.stringify({ s: p2.status, at: p2.scheduled_at }));
    }

    // ================= E · la alerta una sola vez por nivel =================
    console.log('\n== E · la alerta sale una sola vez por nivel y calla con el freno ==');
    {
      const barrer = (uid) => {
        if (!serieFeed || !supportCases) return [];
        const d = openDb();
        const alertas = serieFeed.alertasSerie(d, new Date(), { tzDe: () => TZ, bestHourDe: () => 19 })
          .filter((a) => a.user_id === uid);
        for (const a of alertas) {
          const p = d.prepare('SELECT status FROM posts WHERE id = ?').get(a.post_id);
          if (!p || p.status !== 'draft') continue;
          supportCases.logTeamAction(d, { actor: 'sistema', action: a.action, userId: a.user_id, postId: a.post_id, detalle: a.detalle });
        }
        d.close();
        return alertas;
      };
      barrer(506); barrer(506);
      const filasV = q('SELECT * FROM support_team_log WHERE post_id = ? AND action = ?', P2_506, 'serie_alerta_vispera');
      t('E.1 víspera: exactamente una fila para la pieza de mañana, con el detalle fijo',
        filasV.length === 1 && filasV[0].detalle.includes('su día es mañana ' + TOMORROW) && filasV[0].detalle.includes('sigue en borrador'),
        'filas=' + filasV.length + ' ' + JSON.stringify(filasV.map((f) => f.detalle)));
      barrer(508); barrer(508);
      const filasH = q('SELECT * FROM support_team_log WHERE post_id = ? AND action = ?', P2_508, 'serie_alerta_hoy');
      t('E.2 hoy: exactamente una fila para la dueña de hoy, con su hora',
        filasH.length === 1 && filasH[0].detalle.includes('su día es HOY ' + TODAY + ' a las 19:00'),
        'filas=' + filasH.length + ' ' + JSON.stringify(filasH.map((f) => f.detalle)));
      // El freno calla: con la pieza frenada, el barrido no la nombra.
      const d = openDb();
      d.prepare('UPDATE posts SET frenada = 1 WHERE id = ?').run(P2_506);
      d.close();
      const tras = barrer(506);
      const filasTras = q('SELECT * FROM support_team_log WHERE post_id = ?', P2_506);
      t('E.3 con la pieza frenada el barrido calla (sin filas nuevas de ningún nivel)',
        tras.filter((a) => a.post_id === P2_506).length === 0 && filasTras.length === filasV.length,
        'tras=' + JSON.stringify(tras) + ' filas=' + filasTras.length);
    }
  } finally {
    kill();
    await sleep(600);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ================= runner =================
(async () => {
  console.log('LOTE SERIE-FEED-PROPIO — batería');
  parteFuente();
  parteModulo();
  await parteBoot();
  console.log(`\nTOTAL: ${pass} PASS · ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR de batería:', e); process.exit(2); });
