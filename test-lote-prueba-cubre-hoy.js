// test-lote-prueba-cubre-hoy.js — LOTE LA-PRUEBA-CUBRE-HOY v978
// La semana importada de la prueba cubre HOY: el primer posteo queda hoy
// a la mejor hora del negocio (19:00) SOLO si esa hora sigue en el futuro;
// si la prueba corre después de las 19:00, hoy ya pasó y va mañana.
// Además: el catch silencioso de importTrialWeek ahora loguea idx + error
// (y los dos saltos silenciosos por imagen inválida también loguean).
//
// §A estáticos · §B VM (scheduleDraftsPerWeek REAL + reloj falso) ·
// §C boot real (registro HTTP → import → schedule-all → /api/week/ensure).
// Corre desde la raíz del release: node test-lote-prueba-cubre-hoy.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const REL = __dirname;
const BASE = path.join(__dirname, '..', 'base-v977');
const PORT = 35013;
const BOOT_BASE = '/tmp/boot-cubre-hoy-rel';
const DATA_DIR = BOOT_BASE + '/data';
const LOG_PATH = BOOT_BASE + '/boot.log';
const TZ_NY = 'America/New_York';

let ok = 0, mal = 0; const fails = [];
function t(name, cond, extra) {
  if (cond) { ok++; }
  else { mal++; fails.push(name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); console.log('FAIL:', name, extra ? String(extra).slice(0, 400) : ''); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function count(hay, needle) { return (hay.split(needle).length - 1); }
function ymdHourInTz(iso, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: p.hour === '24' ? '00' : p.hour, minute: p.minute };
}
function ymdInTzNow(tz, when) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(when || new Date());
}
function shiftYmd(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function hourInTz(tz, when) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(when || new Date()));
}

// ---------- §A. Estáticos ----------
function sectionA() {
  const src = read(path.join(REL, 'server.js'));
  t('A1 BUILD v978 ×1 / v977 ×0 en server.js', count(src, '20261105-v978') === 1 && count(src, '20261105-v977') === 0);
  t('A2 index ES byte-idéntico a la base (SIN ?v=)', read(path.join(REL, 'public/index.html')) === read(path.join(BASE, 'public/index.html')));
  t('A2b app.js?v=674 sigue ×1 en el index', count(read(path.join(REL, 'public/index.html')), 'app.js?v=674') === 1);
  t('A3 styles.css byte-idéntico a la base', read(path.join(REL, 'public/styles.css')) === read(path.join(BASE, 'public/styles.css')));
  t('A3b index EN byte-idéntico a la base', read(path.join(REL, 'public/en/index.html')) === read(path.join(BASE, 'public/en/index.html')));
  t("A4 excepción trial: d.source === 'trial' ×1", count(src, "d.source === 'trial'") === 1);
  t('A4b firstDay = today ×1 + guarda de futuro', count(src, 'firstDay = today') === 1 && src.includes('Date.parse(candToday) > Date.now()'));
  t('A5 catch loguea idx ×1 + 2 saltos loguean (total 3)', count(src, 'importTrialWeek: posteo idx=') === 3);
  t('A5b comentario silencioso viejo muerto', count(src, 'un posteo fallido no frena') === 0);
  for (const f of ['public/app.js', 'demo.js', 'db.js', 'guest-trial.js', 'client-digest.js']) {
    t('A6 ' + f + ' byte-idéntico a la base', read(path.join(REL, f)) === read(path.join(BASE, f)));
  }
  t('A7 scheduleDraftsPerWeek definida ×1', count(src, 'function scheduleDraftsPerWeek(') === 1);
  t('A7b importTrialWeek definida ×1', count(src, 'function importTrialWeek(') === 1);
  try { execSync('node --check ' + path.join(REL, 'server.js'), { stdio: 'ignore' }); t('A8 node --check server.js OK', true); }
  catch (e) { t('A8 node --check server.js OK', false, e.message); }
}

// ---------- §B. VM: scheduleDraftsPerWeek REAL + reloj falso ----------
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('no está ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; i++; while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) break; i++; } continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('sin cierre ' + name);
}
function mkDrafts(n, source, weekKey) {
  return Array.from({ length: n }, (_, i) => ({ id: 100 + i, media_type: 'image', week_key: weekKey || null, source, created_at: '2026-11-12T10:00:00.000Z' }));
}
function runSchedule(opts) {
  const src = read(path.join(REL, 'server.js'));
  const fns = ['tzToday', 'mondayKeyOf', 'ymdInTz', 'shiftDays', 'zonedWallToUtc', 'weekdayOfYmd', 'scheduleDraftsPerWeek']
    .map((n) => extractFn(src, n)).join('\n');
  const fixed = opts.fixedNowMs;
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  }
  const applied = [];
  const sandbox = {
    Date: FakeDate, Intl, console,
    DEFAULT_TZ: 'America/New_York',
    require: (m) => { if (m === './story-reel') return { STORY_HOUR: 13 }; throw new Error('require no stubbeado: ' + m); },
    db: { prepare: (sql) => {
      if (sql.includes('best_hour')) return { get: () => ({ best_hour: opts.bestHour == null ? 19 : opts.bestHour }) };
      if (sql.includes('scheduled_at, media_type')) return { all: () => opts.taken || [] };
      if (sql.includes('feed_compositions')) return { all: () => [] };
      return { get: () => undefined, all: () => [], run: () => ({}) };
    } },
    userTz: () => opts.tz,
    weekQuotaPools: () => ({ leftFor: () => 99, consume: () => {} }),
    closedDaysOf: () => opts.closed || new Set(),
    quotaPoolKey: () => 'feed',
    recordSignal: () => {},
    __applied: applied,
    __drafts: opts.drafts,
  };
  vm.createContext(sandbox);
  vm.runInContext(fns + '\n__out = scheduleDraftsPerWeek(1, __drafts, (iso, d) => { __applied.push({ id: d.id, iso }); });', sandbox);
  return { out: sandbox.__out, applied };
}
function daysOf(applied, tz) { return applied.map((a) => ymdHourInTz(a.iso, tz)); }
function sectionB() {
  const TZ = TZ_NY;
  // B1: antes de las 19:00 (jue 12/11 12:00 NY) → el primero HOY 19:00.
  // La ventana es de 7 días desde el lunes: un jueves solo quedan 4 días
  // (jue–dom); el 5.º espera y lo toma la corrida del lunes (ver B10).
  let r = runSchedule({ fixedNowMs: Date.parse('2026-11-12T17:00:00Z'), tz: TZ, drafts: mkDrafts(5, 'trial') });
  let days = daysOf(r.applied, TZ);
  t('B1 antes 19:00: 4 programados hoy–dom + 1 en espera', r.applied.length === 4 && r.out.waiting.length === 1
    && days.map((d) => d.ymd).join(',') === '2026-11-12,2026-11-13,2026-11-14,2026-11-15'
    && days.every((d) => d.hour === '19') && r.out.waiting[0].reason === 'no_slot', JSON.stringify(days) + ' waiting=' + JSON.stringify(r.out.waiting));
  // B2: después de las 19:00 (jue 12/11 20:00 NY) → el primero mañana.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-13T01:00:00Z'), tz: TZ, drafts: mkDrafts(5, 'trial') });
  days = daysOf(r.applied, TZ);
  t('B2 después 19:00: 3 programados vie–dom + 2 en espera', r.applied.length === 3 && r.out.waiting.length === 2
    && days.map((d) => d.ymd).join(',') === '2026-11-13,2026-11-14,2026-11-15'
    && days.every((d) => d.hour === '19'), JSON.stringify(days));
  // B3: exactamente a las 19:00 → ya no está en el futuro → mañana.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-13T00:00:00Z'), tz: TZ, drafts: mkDrafts(5, 'trial') });
  days = daysOf(r.applied, TZ);
  t('B3 justo 19:00: el primero va mañana (límite)', r.applied.length === 3 && days[0].ymd === '2026-11-13' && days[0].hour === '19', JSON.stringify(days));
  // B4: control — borrador NO trial a las 12:00 → regla vieja intacta.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-12T17:00:00Z'), tz: TZ, drafts: mkDrafts(5, '') });
  days = daysOf(r.applied, TZ);
  t('B4 control no-trial: 3 programados vie–dom (regla vieja intacta)', r.applied.length === 3
    && days.map((d) => d.ymd).join(',') === '2026-11-13,2026-11-14,2026-11-15', JSON.stringify(days));
  // B5: hoy ya ocupado → el trial no pisa el día: primero mañana.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-12T17:00:00Z'), tz: TZ, drafts: mkDrafts(5, 'trial'),
    taken: [{ scheduled_at: '2026-11-12T23:00:00.000Z', media_type: 'image' }] });
  days = daysOf(r.applied, TZ);
  t('B5 hoy ocupado: el primero va mañana (no duplica el día)', r.applied.length === 3 && days[0].ymd === '2026-11-13', JSON.stringify(days));
  // B6: trial de la semana QUE VIENE (week_key lunes 16/11) → no se adelanta.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-12T17:00:00Z'), tz: TZ, drafts: mkDrafts(5, 'trial', '2026-11-16') });
  days = daysOf(r.applied, TZ);
  t('B6 semana que viene: empieza su lunes 16/11 (sin adelanto)', r.applied.length === 5 && days[0].ymd === '2026-11-16', JSON.stringify(days));
  // B7: domingo (último día de la semana): 1 hoy, el resto espera al lunes.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-15T17:00:00Z'), tz: TZ, drafts: mkDrafts(5, 'trial') });
  days = daysOf(r.applied, TZ);
  t('B7 domingo: 1 hoy + 4 en espera (la ventana es de 7 días; el lunes los toma)', r.applied.length === 1 && days[0].ymd === '2026-11-15'
    && r.out.waiting.length === 4 && r.out.waiting.every((w) => w.reason === 'no_slot'), JSON.stringify(days) + ' waiting=' + JSON.stringify(r.out.waiting));
  // B8: mixto — el trial va hoy, el no-trial va mañana (la excepción es por borrador).
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-12T17:00:00Z'), tz: TZ,
    drafts: [{ id: 100, media_type: 'image', week_key: null, source: 'trial', created_at: '2026-11-12T10:00:00.000Z' },
             { id: 101, media_type: 'image', week_key: null, source: '', created_at: '2026-11-12T10:00:00.000Z' }] });
  days = daysOf(r.applied, TZ);
  t('B8 mixto: trial hoy 12/11 + no-trial mañana 13/11', r.applied.length === 2 && days[0].ymd === '2026-11-12' && days[1].ymd === '2026-11-13', JSON.stringify(days));
  // B9: día cerrado (viernes 13/11) se salta igual para el trial.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-12T17:00:00Z'), tz: TZ, drafts: mkDrafts(5, 'trial'), closed: new Set([5]) });
  days = daysOf(r.applied, TZ);
  t('B9 viernes cerrado: se salta (12,14,15 + 2 en espera)', r.applied.length === 3
    && days.map((d) => d.ymd).join(',') === '2026-11-12,2026-11-14,2026-11-15', JSON.stringify(days));
  // B10: la corrida del lunes completa la semana (el 5.º que esperó).
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-16T17:00:00Z'), tz: TZ, drafts: mkDrafts(1, 'trial'),
    taken: [{ scheduled_at: '2026-11-13T00:00:00.000Z', media_type: 'image' }, { scheduled_at: '2026-11-14T00:00:00.000Z', media_type: 'image' },
            { scheduled_at: '2026-11-15T00:00:00.000Z', media_type: 'image' }, { scheduled_at: '2026-11-16T00:00:00.000Z', media_type: 'image' }] });
  days = daysOf(r.applied, TZ);
  t('B10 lunes: el posteo en espera cae el lunes 16/11 19:00', r.applied.length === 1 && days[0].ymd === '2026-11-16' && days[0].hour === '19' && r.out.waiting.length === 0, JSON.stringify(days));
}

// ---------- §C. Boot real: registro → import → autoArmWeek → /api/week/ensure ----------
const IMG_B64 = fs.readFileSync(path.join(REL, 'stock/barberia/2061820.jpg')).toString('base64');
function trialPayload(business, badIdx) {
  const posts = [];
  for (let i = 0; i < 5; i++) {
    posts.push({
      image: (badIdx === i) ? 'not-a-data-url' : ('data:image/jpeg;base64,' + IMG_B64),
      caption: `Posteo de prueba número ${i + 1} para ${business}: sneakers reales, hechos para caminar la ciudad todos los días. Escribinos por DM y te lo reservamos.`,
      hashtags: '#veja #sneakers #prueba',
      type: 'image',
    });
  }
  return { engine: 25, business, category: 'Moda', posts };
}
function openDb() {
  const db = new DatabaseSync(path.join(DATA_DIR, 'posta.db'));
  try { db.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
  return db;
}
function seedTrialCache(ig, payload) {
  const db = openDb();
  db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function cookieOf(res) {
  const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return (arr || []).map((c) => String(c).split(';')[0]).join('; ');
}
async function post(port, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch('http://127.0.0.1:' + port + p, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j, cookie: cookieOf(r) };
}
async function get(port, p, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const r = await fetch('http://127.0.0.1:' + port + p, { headers });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  return { status: r.status, j, txt };
}
async function poll(fn, timeoutMs, stepMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const v = fn(); if (v) return v; await sleep(stepMs || 500); }
  return fn();
}
function userIdByEmail(email) {
  const db = openDb();
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  db.close();
  return row ? row.id : null;
}
function setTz(uid, tz) {
  const db = openDb();
  db.prepare('INSERT OR REPLACE INTO settings (user_id, timezone) VALUES (?, ?)').run(uid, tz);
  db.close();
}
function trialPosts(uid) {
  const db = openDb();
  const rows = db.prepare("SELECT id, scheduled_at, status FROM posts WHERE user_id = ? AND source = 'trial' AND media_type = 'image' ORDER BY scheduled_at ASC").all(uid);
  db.close();
  return rows;
}
function countAllPosts(uid) {
  const db = openDb();
  const n = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uid).n;
  db.close();
  return n;
}
function pickPastZone() {
  const cands = ['Asia/Dubai', 'Europe/Moscow', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Atlantic/Azores', 'America/Sao_Paulo', 'America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu'];
  const hours = {};
  for (const z of cands) { const h = hourInTz(z); hours[z] = h; if (h >= 19 && h <= 23) return { zone: z, hours }; }
  return { zone: null, hours };
}
let bootChild = null;
let mediaMoved = false;
async function sectionC() {
  const ss = execSync('ss -ltn').toString();
  t('C0 puerto 35013 libre antes del boot (ss)', !ss.includes(':35013'));
  fs.rmSync(BOOT_BASE, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_PATH, 'w');
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR, NODE_PATH: '/home/hatch/workspace/posta/node_modules' });
  bootChild = spawn('node', ['server.js'], { cwd: REL, env, stdio: ['ignore', logFd, logFd] });
  let ver = null;
  for (let i = 0; i < 120 && !ver; i++) {
    await sleep(500);
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/api/version'); if (r.ok) { const j = await r.json(); if (j.build === '20261105-v978') ver = j; } } catch (e) {}
  }
  t('C1 boot: /api/version = 20261105-v978', !!ver, JSON.stringify(ver));
  const idx = await get(PORT, '/', null);
  t('C1b index servido con app.js?v=674 (sin cambio)', idx.txt.includes('app.js?v=674'), String(idx.status));

  // --- Usuario 1: rama «antes de las 19:00» (o la que dicte el reloj real) ---
  // La programación se dispara por /api/posts/schedule-all (el «Programar
  // mi semana» manual): mismo scheduleDraftsPerWeek que el autoArmWeek del
  // signup, pero determinista. El timer de signup tarda en sandbox detrás
  // del render de reels (pre-existente, fuera de este lote).
  seedTrialCache('veja-test', trialPayload('Veja Test'));
  const reg1 = await post(PORT, '/api/auth/register', { email: 'cubre-hoy-1@test.invalid', password: 'clave123', trial_ig: 'veja-test', terms_accepted: true });
  t('C2 register usuario 1 → 200 + cookie de sesión', reg1.status === 200 && !!reg1.cookie, reg1.status + ' ' + JSON.stringify(reg1.j));
  const uid1 = userIdByEmail('cubre-hoy-1@test.invalid');
  t('C2b usuario 1 existe en la DB', !!uid1);
  if (uid1) setTz(uid1, TZ_NY);
  const sa1 = await post(PORT, '/api/posts/schedule-all', {}, reg1.cookie);
  t('C2c schedule-all usuario 1 → 200', sa1.status === 200, sa1.status + ' ' + JSON.stringify(sa1.j).slice(0, 300));
  const sched1 = await poll(() => {
    const rows = trialPosts(uid1).filter((p) => p.status === 'scheduled');
    return rows.length === 4 ? rows : null;
  }, 10000);
  // Ventana de 7 días desde el lunes: un jueves solo quedan 4 días
  // (jue–dom); el 5.º espera y lo toma la corrida del lunes (ver §B B10).
  t('C3 schedule-all programa 4 posteos trial (jue–dom)', !!sched1 && sched1.length === 4, JSON.stringify((sched1 || []).map((p) => p.scheduled_at)));
  const days1 = sched1 ? sched1.map((p) => ymdHourInTz(p.scheduled_at, TZ_NY)) : [];
  const todayNY = ymdInTzNow(TZ_NY);
  const tomorrowNY = shiftYmd(todayNY, 1);
  const hNow = hourInTz(TZ_NY);
  // Ventana gris 19:00 ±1 h: la programación pudo caer a uno u otro lado.
  const expectedFirst = hNow <= 18 ? todayNY : (hNow >= 20 ? tomorrowNY : null);
  const consec1 = days1.length === 4 && days1.every((d, i) => d.ymd === shiftYmd(days1[0].ymd, i) && d.hour === '19' && d.minute === '00');
  t('C3b 4 días seguidos a las 19:00 NY desde el primer día', consec1, JSON.stringify(days1));
  t('C3c el primer día es el que dicta el reloj' + (expectedFirst ? ' (' + expectedFirst + ')' : ' (ventana gris)'),
    !!sched1 && (expectedFirst ? days1[0].ymd === expectedFirst : (days1[0].ymd === todayNY || days1[0].ymd === tomorrowNY)),
    JSON.stringify(days1) + ' hora actual NY=' + hNow);
  // --- ensure: con el posteo de hoy programado, NO genera nada ---
  const beforeTrial = trialPosts(uid1).length;
  const ens = await post(PORT, '/api/week/ensure', {}, reg1.cookie);
  t('C4 /api/week/ensure → generating:false (hoy ya cubierto)', ens.j && ens.j.generating === false, JSON.stringify(ens.j));
  await sleep(2000);
  const afterTrial = trialPosts(uid1).length;
  t('C5 ensure no crea ningún posteo trial extra', afterTrial === beforeTrial, beforeTrial + ' → ' + afterTrial);

  // --- Usuario 2: rama «después de las 19:00» (zona donde ya pasaron) ---
  const pz = pickPastZone();
  t('C6 hay una zona donde las 19:00 ya pasaron', !!pz.zone, JSON.stringify(pz.hours));
  const zone2 = pz.zone || TZ_NY;
  seedTrialCache('veja-test-2', trialPayload('Veja Test 2'));
  const reg2 = await post(PORT, '/api/auth/register', { email: 'cubre-hoy-2@test.invalid', password: 'clave123', trial_ig: 'veja-test-2', terms_accepted: true });
  t('C6b register usuario 2 → 200 + cookie', reg2.status === 200 && !!reg2.cookie, reg2.status + ' ' + JSON.stringify(reg2.j));
  const uid2 = userIdByEmail('cubre-hoy-2@test.invalid');
  if (uid2) setTz(uid2, zone2);
  const sa2 = await post(PORT, '/api/posts/schedule-all', {}, reg2.cookie);
  t('C6c schedule-all usuario 2 → 200', sa2.status === 200, sa2.status + ' ' + JSON.stringify(sa2.j).slice(0, 300));
  const sched2 = await poll(() => {
    const rows = trialPosts(uid2).filter((p) => p.status === 'scheduled');
    return rows.length === 3 ? rows : null;
  }, 10000);
  // Ventana: en la zona elegida hoy es jueves; desde mañana (vie) quedan
  // 3 días (vie–dom); los 2 restantes esperan a la corrida del lunes.
  t('C7 usuario 2: 3 posteos trial programados (vie–dom)', !!sched2 && sched2.length === 3, JSON.stringify((sched2 || []).map((p) => p.scheduled_at)));
  const days2 = sched2 ? sched2.map((p) => ymdHourInTz(p.scheduled_at, zone2)) : [];
  const tomorrowZ = shiftYmd(ymdInTzNow(zone2), 1);
  const consec2 = days2.length === 3 && days2.every((d, i) => d.ymd === shiftYmd(days2[0].ymd, i) && d.hour === '19');
  t('C7b 3 días seguidos a las 19:00 en ' + zone2, consec2, JSON.stringify(days2));
  t('C7c el primero es MAÑANA en ' + zone2 + ' (hoy ya pasó)', !!sched2 && days2[0].ymd === tomorrowZ, JSON.stringify(days2) + ' mañana=' + tomorrowZ);

  // --- Usuario 3: un posteo con imagen inválida → se salta y queda el log ---
  seedTrialCache('veja-test-3', trialPayload('Veja Test 3', 2));
  const reg3 = await post(PORT, '/api/auth/register', { email: 'cubre-hoy-3@test.invalid', password: 'clave123', trial_ig: 'veja-test-3', terms_accepted: true });
  t('C8 register usuario 3 → 200', reg3.status === 200, reg3.status + ' ' + JSON.stringify(reg3.j));
  const uid3 = userIdByEmail('cubre-hoy-3@test.invalid');
  const imp3 = await poll(() => {
    const rows = trialPosts(uid3);
    return rows.length === 4 ? rows : null;
  }, 10000);
  t('C9 import con idx=2 inválido: 4 de 5 importados (el malo no frena)', !!imp3 && imp3.length === 4, JSON.stringify((imp3 || []).map((p) => p.id)));
  const log3 = read(LOG_PATH);
  t('C10 boot.log trae el salto con idx=2', log3.includes('importTrialWeek: posteo idx=2 sin imagen válida'), log3.slice(-1500));

  // --- Usuario 4: media sin escritura → el catch loguea idx + error ---
  // (El entorno corre como root e ignora el chmod 0555: la media se
  // aparta con rename, que sí frena el writeFileSync con ENOENT.)
  const mediaDir = path.join(DATA_DIR, 'media');
  t('C11 media/ existe (la creó el import del usuario 1)', fs.existsSync(mediaDir));
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
  const mediaAway = mediaDir + '-away';
  fs.renameSync(mediaDir, mediaAway);
  mediaMoved = true;
  seedTrialCache('veja-test-4', trialPayload('Veja Test 4'));
  const reg4 = await post(PORT, '/api/auth/register', { email: 'cubre-hoy-4@test.invalid', password: 'clave123', trial_ig: 'veja-test-4', terms_accepted: true });
  t('C11b register usuario 4 → 200 aunque el import falle', reg4.status === 200, reg4.status + ' ' + JSON.stringify(reg4.j));
  const uid4 = userIdByEmail('cubre-hoy-4@test.invalid');
  await sleep(1500);
  const imp4 = trialPosts(uid4);
  t('C11c import sin media: 0 posteos importados', imp4.length === 0, JSON.stringify(imp4));
  const log4 = read(LOG_PATH);
  t('C12 boot.log trae el catch idx=0 con error', log4.includes('importTrialWeek: posteo idx=0 falló'), log4.slice(-2000));
  t('C12b boot.log trae el catch idx=4 también (los 5)', log4.includes('importTrialWeek: posteo idx=4 falló'), log4.slice(-2000));
  fs.renameSync(mediaAway, mediaDir);
  mediaMoved = false;
}

async function cleanup() {
  try { if (mediaMoved) fs.renameSync(path.join(DATA_DIR, 'media') + '-away', path.join(DATA_DIR, 'media')); } catch (e) {}
  if (bootChild && bootChild.exitCode === null) {
    try { process.kill(bootChild.pid, 'SIGTERM'); } catch (e) {}
    for (let i = 0; i < 10 && bootChild.exitCode === null; i++) await sleep(500);
    if (bootChild.exitCode === null) { try { process.kill(bootChild.pid, 'SIGKILL'); } catch (e) {} }
  }
}

(async () => {
  try {
    sectionA();
    sectionB();
    await sectionC();
  } catch (e) {
    mal++;
    fails.push('EXCEPCIÓN: ' + (e && e.stack ? e.stack : e));
    console.log('EXCEPCIÓN:', e && e.stack ? e.stack : e);
  } finally {
    await cleanup();
  }
  let portFree = true;
  try { const ss = execSync('ss -ltn').toString(); portFree = !ss.includes(':35013'); } catch (e) {}
  t('C13 puerto 35013 libre tras matar por PID exacto', portFree);
  t('C14 sin release/data/ en el árbol', !fs.existsSync(path.join(REL, 'data')));
  console.log('== RESULTADO ==');
  console.log('ok: ' + ok + ' · mal: ' + mal);
  if (mal) { console.log('FALLOS:'); fails.forEach((f) => console.log(' - ' + f)); }
  else console.log('TODO VERDE.');
  process.exit(mal ? 1 : 0);
})();
