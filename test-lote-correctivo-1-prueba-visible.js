// test-lote-correctivo-1-prueba-visible.js — LOTE CORRECTIVO-1
// PRUEBA-COMPLETA-VISIBLE (decisión de Valentino 12/11 20:09, paquete
// correctivo aprobado 20:52): la prueba arma y MUESTRA los 3 posteos
// desde el arranque, en los días 1, 2 y 3 corridos de la prueba.
//
// §A estáticos (estampado, marcadores, copias, censos ajenos) ·
// §B VM con reloj falso (scheduleDraftsPerWeek REAL: anclaje de la
// prueba que cruza el fin de semana; programarHoy REAL: guarda de hora
// pasada; ensureTodayPost REAL: la guarda que no desplaza la prueba) ·
// §C boot real (guest/start e2e: 3 posteos corridos visibles por
// /api/posts, bienvenida sin goteo ES+EN, /api/review-status verdadero
// con un programado retenido, ensure no crea un 4.º).
// Corre desde la raíz del scratch: node test-lote-correctivo-1-prueba-visible.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const REL = path.join(__dirname, 'release');
const BASE = path.join(__dirname, 'base-v980');
const PORT = 35021;
const BOOT_BASE = '/tmp/boot-cor1';
const DATA_DIR = BOOT_BASE + '/data';
const LOG_PATH = BOOT_BASE + '/boot.log';
const TZ_NY = 'America/New_York';
const TZ_ART = 'America/Argentina/Buenos_Aires';

let ok = 0, mal = 0; const fails = [];
function t(name, cond, extra) {
  if (cond) { ok++; }
  else { mal++; fails.push(name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); console.log('FAIL:', name, extra ? String(extra).slice(0, 400) : ''); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function count(hay, needle) { return (hay.split(needle).length - 1); }
function linesWith(hay, needle) { return hay.split('\n').filter((l) => l.includes(needle)).length; }
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

// ---------- §A. Estáticos ----------
function sectionA() {
  const srv = read(path.join(REL, 'server.js'));
  const srvB = read(path.join(BASE, 'server.js'));
  const gt = read(path.join(REL, 'guest-trial.js'));
  const app = read(path.join(REL, 'public/app.js'));
  const appB = read(path.join(BASE, 'public/app.js'));
  const idx = read(path.join(REL, 'public/index.html'));
  const idxB = read(path.join(BASE, 'public/index.html'));

  t('A1 BUILD v983 ×1 / v980 ×0 en server.js (base: v980 ×1)',
    count(srv, '20261105-v983') === 1 && count(srv, '20261105-v980') === 0 && count(srvB, '20261105-v980') === 1);
  t('A2 index ES: app.js?v=677 ×1 / v=674 ×0 (base: 674 ×1); styles?v=20261270 ×1 en ambos',
    count(idx, 'app.js?v=677') === 1 && count(idx, 'app.js?v=674') === 0 && count(idxB, 'app.js?v=674') === 1
    && count(idx, 'styles.css?v=20261270') === 1 && count(idxB, 'styles.css?v=20261270') === 1);
  t('A2b index EN byte-idéntico a la base', read(path.join(REL, 'public/en/index.html')) === read(path.join(BASE, 'public/en/index.html')));
  t('A3 styles.css byte-idéntico a la base', read(path.join(REL, 'public/styles.css')) === read(path.join(BASE, 'public/styles.css')));

  // Marcadores propios del lote.
  t("A4 anclaje: d.source === 'trial' ×2 en server.js (v978 + rama CORRECTIVO-1)",
    count(srv, "d.source === 'trial'") === 2, 'count=' + count(srv, "d.source === 'trial'"));
  t('A4b la búsqueda anclada llega a +10 días desde firstDay',
    srv.includes('shiftDays(firstDay, i)') && srv.includes('Date.parse(cand) > Date.now()'));
  t('A5 lint sin retención: trial_sin_retencion ×1 + post.source en el SELECT del lint',
    count(srv, 'trial_sin_retencion') === 1 && srv.includes('SELECT id, caption, week_key, source FROM posts'));
  t('A6 programarHoy: guarda de hora pasada ×1',
    count(srv, 'if (Date.parse(iso) <= Date.now()) return null;') === 1);
  t('A7 ensure: reason prueba_por_empezar ×1',
    count(srv, 'prueba_por_empezar') === 1);
  t('A8 review-status cuenta draft+scheduled retenidos ×1',
    count(srv, "status IN ('draft', 'scheduled') AND COALESCE(needs_review,0)=1") === 1);

  // Copias verdaderas.
  t('A9 bienvenida sin goteo (ES+EN): llegan/llega/arrive muertos',
    count(gt, 'llegan uno por día') === 0 && count(gt, 'llega mañana') === 0
    && count(gt, 'arrive one per day') === 0 && count(gt, 'arrives tomorrow') === 0);
  t('A9b bienvenida nueva: los 3 ya están en la semana (ES+EN) y los 2 también',
    count(gt, 'ya están los 3 en tu semana') === 1 && count(gt, 'all 3 are already in your week') === 1
    && count(gt, 'ya están los 2 en tu semana') === 1 && count(gt, 'both are already in your week') === 1);
  t('A9c marcadores L10 intactos en guest-trial.js (bienvenida idempotente)',
    gt.includes('REAL_MARKERS') && gt.includes("'ya armé tus primeros 3 posteos'") && gt.includes("'tu primer posteo está listo'"));
  t('A10 tira: copia «uno por uno» muerta y copia nueva ×1 (ES+EN)',
    count(app, 'salen uno por uno, día por día') === 0 && count(app, 'comes out one by one, day by day') === 0
    && count(app, 'este día se muestra cuando se acerque su fecha') === 1 && count(app, 'this day shows up as its date gets closer') === 1);
  t('A11 tira: revelado de la prueba ×1 + fix de recableado ×1',
    count(app, "String(post.source || '') === 'trial'") === 1 && count(app, "root.id === 'pzHoyTira'") === 1);
  t('A12 banner verdadero: revOcultaR1 presente (≥3 menciones)',
    count(app, 'revOcultaR1') >= 3, 'count=' + count(app, 'revOcultaR1'));

  // Censos de frentes ajenos (no pisar).
  t('A13 app.js: unico=1 ×5 (motor único intacto)', count(app, 'unico=1') === 5 && count(appB, 'unico=1') === 5,
    'rel=' + count(app, 'unico=1'));
  t("A13b app.js: CHUNK_V '20261105-v977' ×1 intacto", count(app, "'20261105-v977'") === 1);
  t('A14 server.js: monedaCuentaAds ×4', count(srv, 'monedaCuentaAds') === 4 && count(srvB, 'monedaCuentaAds') === 4);
  t('A14b server.js: PLAN_UNICO ×11', count(srv, 'PLAN_UNICO') === 11 && count(srvB, 'PLAN_UNICO') === 11,
    'rel=' + count(srv, 'PLAN_UNICO'));
  t('A14c server.js: contentLangOf en 4 líneas (igual que la base)',
    linesWith(srv, 'contentLangOf') === 4 && linesWith(srvB, 'contentLangOf') === 4,
    'rel=' + linesWith(srv, 'contentLangOf'));
  t('A15 pzHoyRevisionContar intacta (función sin tocar: byte-diff solo fuera de ella)',
    extractFn(app, 'pzHoyRevisionContar') === extractFn(appB, 'pzHoyRevisionContar'));

  for (const f of ['server.js', 'guest-trial.js', 'public/app.js']) {
    try { execSync('node --check ' + path.join(REL, f), { stdio: 'ignore' }); t('A16 node --check ' + f + ' OK', true); }
    catch (e) { t('A16 node --check ' + f + ' OK', false, e.message); }
  }
}

// ---------- §B. VM con reloj falso ----------
function mkDrafts(n, source) {
  return Array.from({ length: n }, (_, i) => ({ id: 100 + i, media_type: 'image', week_key: null, source, created_at: '2026-11-12T10:00:00.000Z' }));
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
    DEFAULT_TZ: TZ_NY,
    require: (m) => { if (m === './story-reel') return { STORY_HOUR: 13 }; throw new Error('require no stubbeado: ' + m); },
    db: { prepare: (sql) => {
      if (sql.includes('best_hour')) return { get: () => ({ best_hour: 19 }) };
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
function runProgramarHoy(opts) {
  const src = read(path.join(REL, 'server.js'));
  const fns = ['zonedWallToUtc', 'bestHourDe', 'programarHoy'].map((n) => extractFn(src, n)).join('\n');
  const fixed = opts.fixedNowMs;
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  }
  const sandbox = {
    Date: FakeDate, Intl, console,
    db: { prepare: (sql) => {
      if (sql.includes('best_hour')) return { get: () => ({ best_hour: 19 }) };
      if (sql.startsWith('SELECT * FROM posts')) return { get: () => ({ id: 7, status: 'scheduled' }) };
      return { get: () => undefined, all: () => [], run: () => ({ changes: 1 }) };
    } },
    __hoy: opts.hoy, __tz: opts.tz,
  };
  vm.createContext(sandbox);
  vm.runInContext(fns + '\n__out = programarHoy(1, 7, __tz, __hoy);', sandbox);
  return sandbox.__out;
}
async function runEnsure(opts) {
  const src = read(path.join(REL, 'server.js'));
  const fns = ['weekdayOfYmd', 'shiftDays', 'ritualPublicadoHoy'].map((n) => extractFn(src, n)).join('\n')
    + '\n' + extractFn(src, 'ensureTodayPost').replace('function ensureTodayPost(', 'async function ensureTodayPost(');
  const dayKey = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const sandbox = {
    Date, Intl, console,
    ENSURE_TODAY_RUNNING: new Map(),
    morningPostPush: { dayKeyInTz: dayKey, pickTodayPost: () => null },
    planOrTrialOk: () => true,
    closedDaysOf: () => new Set(),
    quotaFor: () => ({ left: 0 }),
    db: { prepare: (sql) => {
      if (sql.includes("source = 'trial'")) return { get: () => opts.trialFirst, all: () => [], run: () => ({}) };
      return { get: () => undefined, all: () => [], run: () => ({}) };
    } },
    __now: opts.now, __tz: opts.tz,
  };
  vm.createContext(sandbox);
  vm.runInContext(fns + '\n__p = ensureTodayPost(1, __tz, __now);', sandbox);
  return sandbox.__p;
}
function daysOf(applied, tz) { return applied.map((a) => ymdHourInTz(a.iso, tz)); }
async function sectionB() {
  // B1: viernes 13/11 20:30 EST (post-19:00) → la secuencia cruza el fin
  // de semana: sáb 14, dom 15, lun 16 — los 3, ninguno en espera.
  let r = runSchedule({ fixedNowMs: Date.parse('2026-11-14T01:30:00Z'), tz: TZ_NY, drafts: mkDrafts(3, 'trial') });
  let days = daysOf(r.applied, TZ_NY);
  t('B1 vie post-19:00: 3 corridos sáb–lun (cruza el finde), 0 en espera',
    r.applied.length === 3 && r.out.waiting.length === 0
    && days.map((d) => d.ymd).join(',') === '2026-11-14,2026-11-15,2026-11-16'
    && days.every((d) => d.hour === '19'), JSON.stringify(days) + ' waiting=' + JSON.stringify(r.out.waiting));
  t('B1b ningún scheduled_at en el pasado', r.applied.every((a) => Date.parse(a.iso) > Date.parse('2026-11-14T01:30:00Z')));
  // B2: viernes 13/11 12:00 EST (pre-19:00) → día 1 hoy: 13, 14, 15.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-13T17:00:00Z'), tz: TZ_NY, drafts: mkDrafts(3, 'trial') });
  days = daysOf(r.applied, TZ_NY);
  t('B2 vie pre-19:00: día 1 hoy (13, 14, 15)',
    r.applied.length === 3 && days.map((d) => d.ymd).join(',') === '2026-11-13,2026-11-14,2026-11-15',
    JSON.stringify(days));
  // B3: domingo 15/11 20:00 EST → lun 16, mar 17, mié 18 (antes: solo el
  // lunes y 2 en espera hasta la corrida siguiente).
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-16T01:00:00Z'), tz: TZ_NY, drafts: mkDrafts(3, 'trial') });
  days = daysOf(r.applied, TZ_NY);
  t('B3 dom post-19:00: 3 corridos lun–mié, 0 en espera',
    r.applied.length === 3 && r.out.waiting.length === 0
    && days.map((d) => d.ymd).join(',') === '2026-11-16,2026-11-17,2026-11-18', JSON.stringify(days));
  // B4: control NO trial, viernes post-19:00 → la regla vieja intacta
  // (ventana semanal: sáb+dom entran, el 3.º espera).
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-14T01:30:00Z'), tz: TZ_NY, drafts: mkDrafts(3, '') });
  days = daysOf(r.applied, TZ_NY);
  t('B4 control no-trial: ventana semanal intacta (2 programados + 1 en espera)',
    r.applied.length === 2 && r.out.waiting.length === 1 && r.out.waiting[0].reason === 'no_slot'
    && days.map((d) => d.ymd).join(',') === '2026-11-14,2026-11-15', JSON.stringify(days));
  // B5: domingo cerrado → la corrida se estira sin violar el cierre.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-13T17:00:00Z'), tz: TZ_NY, drafts: mkDrafts(3, 'trial'), closed: new Set([7]) });
  days = daysOf(r.applied, TZ_NY);
  t('B5 domingo cerrado: 13, 14 y 16 (se estira, no se viola)',
    r.applied.length === 3 && days.map((d) => d.ymd).join(',') === '2026-11-13,2026-11-14,2026-11-16', JSON.stringify(days));
  // B6: mañana ocupado → no pisa el día: 13, 15, 16.
  r = runSchedule({ fixedNowMs: Date.parse('2026-11-13T17:00:00Z'), tz: TZ_NY, drafts: mkDrafts(3, 'trial'),
    taken: [{ scheduled_at: '2026-11-15T00:00:00.000Z', media_type: 'image' }] });
  days = daysOf(r.applied, TZ_NY);
  t('B6 sábado ocupado: 13, 15, 16 (no duplica el día)',
    r.applied.length === 3 && days.map((d) => d.ymd).join(',') === '2026-11-13,2026-11-15,2026-11-16', JSON.stringify(days));

  // programarHoy: la guarda de hora pasada cierra cualquier camino.
  const p1 = runProgramarHoy({ fixedNowMs: Date.parse('2026-11-14T01:30:00Z'), tz: TZ_NY, hoy: '2026-11-13' });
  t('B7 programarHoy con la hora de hoy ya pasada → null', p1 === null, JSON.stringify(p1));
  const p2 = runProgramarHoy({ fixedNowMs: Date.parse('2026-11-13T17:00:00Z'), tz: TZ_NY, hoy: '2026-11-13' });
  t('B8 programarHoy con la hora de hoy en el futuro → programa', !!p2 && p2.id === 7, JSON.stringify(p2));
  const p3 = runProgramarHoy({ fixedNowMs: Date.parse('2026-11-14T01:30:00Z'), tz: TZ_NY, hoy: '2026-11-14' });
  t('B8b programarHoy para mañana (futuro) → programa', !!p3 && p3.id === 7, JSON.stringify(p3));

  // ensureTodayPost: la guarda de la prueba.
  const nowFri = new Date('2026-11-13T17:00:00Z'); // hoy NY = 2026-11-13
  const e1 = await runEnsure({ tz: TZ_NY, now: nowFri, trialFirst: undefined });
  t('B9 ensure sin posteos de prueba → sigue su curso (plan_limit del stub de cupo)', e1 && e1.reason === 'plan_limit', JSON.stringify(e1));
  const e2 = await runEnsure({ tz: TZ_NY, now: nowFri, trialFirst: { scheduled_at: '2026-11-15T00:00:00.000Z' } });
  t('B10 ensure con el día 1 mañana → prueba_por_empezar (no genera el 4.º)', e2 && e2.reason === 'prueba_por_empezar', JSON.stringify(e2));
  const e3 = await runEnsure({ tz: TZ_NY, now: nowFri, trialFirst: { scheduled_at: '2026-11-14T00:00:00.000Z' } });
  t('B11 ensure con el día 1 hoy → la guarda no frena (plan_limit del stub de cupo)', e3 && e3.reason === 'plan_limit', JSON.stringify(e3));
  const e4 = await runEnsure({ tz: TZ_NY, now: nowFri, trialFirst: { scheduled_at: '2026-11-24T00:00:00.000Z' } });
  t('B12 ensure con la prueba lejos (+10 días) → la guarda no frena', e4 && e4.reason === 'plan_limit', JSON.stringify(e4));
}

// ---------- §C. Boot real: guest/start e2e ----------
const IMG_B64 = fs.readFileSync(path.join(REL, 'stock/barberia/2061820.jpg')).toString('base64');
function payloadFor(lang, business, ig) {
  const en = lang === 'en';
  const caps = en
    ? ['Small-batch coffee, roasted this week and ground for your mornings at home. Message us and we save you a bag.',
       'Our house blend in the cup: chocolate notes, low acidity, ready in three minutes. Come taste it at the counter today.',
       'Beans from this month lot, packed yesterday so the aroma stays in. Order by DM and pick it up whenever you want.']
    : ['Café de especialidad recién tostado, molido para tus mañanas en casa. Escribinos por DM y te guardamos una bolsa.',
       'Nuestro blend de la casa en taza: notas de chocolate, acidez baja, listo en tres minutos. Vení a probarlo hoy al mostrador.',
       'Granos del lote de este mes, envasados ayer para que el aroma quede adentro. Pedilo por DM y retiralo cuando quieras.'];
  return {
    ok: true, engine: 25, lang, business, ig, category: en ? 'Coffee shop' : 'Cafetería',
    posts: caps.map((c) => ({ type: 'image', image: 'data:image/jpeg;base64,' + IMG_B64, caption: c, hashtags: en ? '#coffee' : '#cafe', headline: '', style: '' })),
    design: { posts: caps.map(() => ({ headline: '', style: 'foto', kind: 'foto' })) },
  };
}
function openDb() {
  const db = new DatabaseSync(path.join(DATA_DIR, 'posta.db'));
  try { db.exec('PRAGMA busy_timeout = 8000'); } catch (e) {}
  return db;
}
function seedTrialCache(ig, payload) {
  const db = openDb();
  db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function rows(sql, ...args) {
  const db = openDb();
  const r = db.prepare(sql).all(...args);
  db.close();
  return r;
}
function cookieOf(res) {
  const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return (arr || []).map((c) => String(c).split(';')[0]).join('; ');
}
async function postJ(port, p, body, cookie, qs) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch('http://127.0.0.1:' + port + p + (qs || ''), { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j, cookie: cookieOf(r) };
}
async function getJ(port, p, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const r = await fetch('http://127.0.0.1:' + port + p, { headers });
  const j = await r.json().catch(() => null);
  return { status: r.status, j };
}
async function poll(fn, timeoutMs, stepMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const v = fn(); if (v) return v; await sleep(stepMs || 400); }
  return fn();
}
let bootChild = null;
async function sectionC() {
  const ss0 = execSync('ss -ltn').toString();
  t('C0 puerto ' + PORT + ' libre antes del boot (ss)', !ss0.includes(':' + PORT));
  fs.rmSync(BOOT_BASE, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_PATH, 'w');
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), DATA_DIR,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    ADMIN_TOKEN: 'cor1-admin-token', TRIAL_TEST_KEY: 'cor1key', OPENAI_API_KEY: '',
  });
  bootChild = spawn('node', ['server.js'], { cwd: REL, env, stdio: ['ignore', logFd, logFd] });
  let ver = null;
  for (let i = 0; i < 120 && !ver; i++) {
    await sleep(500);
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/api/version'); if (r.ok) { const j = await r.json(); if (j.build === '20261105-v983') ver = j; } } catch (e) {}
  }
  t('C1 boot: /api/version = 20261105-v983', !!ver, JSON.stringify(ver));

  // --- Invitado ES: la prueba completa desde el arranque ---
  seedTrialCache('cor1cafe', payloadFor('es', 'Café Cor1', 'cor1cafe'));
  const t0 = Date.now();
  const st = await postJ(PORT, '/api/guest/start', { ig: 'cor1cafe', domain: 'cor1cafe.com', device: 'cor1-device-1', lang: 'es' }, null, '?test_key=cor1key');
  t('C2 guest/start ES → ok + scheduled=3', st.status === 200 && st.j && st.j.ok === true && st.j.scheduled === 3,
    st.status + ' ' + JSON.stringify(st.j).slice(0, 300));
  const uid = st.j && st.j.user_id;
  t('C2b cookie de sesión del invitado', !!st.cookie);
  const posts = await poll(() => {
    const r = rows("SELECT id, scheduled_at, status, source, needs_review FROM posts WHERE user_id = ? AND source = 'trial' ORDER BY scheduled_at ASC", uid);
    return r.length === 3 ? r : null;
  }, 15000);
  t('C3 exactamente 3 posteos de la prueba, todos programados', !!posts && posts.every((p) => p.status === 'scheduled'),
    JSON.stringify(posts));
  if (posts) {
    const days = posts.map((p) => ymdHourInTz(p.scheduled_at, TZ_ART));
    const todayA = ymdInTzNow(TZ_ART, new Date(t0));
    const slotTodayUtc = Date.parse(posts[0].scheduled_at);
    const consec = days.every((d, i) => d.ymd === shiftYmd(days[0].ymd, i) && d.hour === '19' && d.minute === '00');
    t('C3b días 1–3 corridos a las 19:00 ART', consec, JSON.stringify(days));
    t('C3c el día 1 es hoy o mañana según el reloj (nunca otro)', days[0].ymd === todayA || days[0].ymd === shiftYmd(todayA, 1),
      'hoy=' + todayA + ' día1=' + days[0].ymd);
    t('C3d ningún scheduled_at en el pasado', posts.every((p) => Date.parse(p.scheduled_at) > t0), JSON.stringify(posts.map((p) => p.scheduled_at)));
    t('C3e ninguno retenido por el lint (needs_review=0)', posts.every((p) => !p.needs_review), JSON.stringify(posts));
    // Visibilidad por la API del dueño.
    const list = await getJ(PORT, '/api/posts', st.cookie);
    const ids = Array.isArray(list.j) ? list.j.filter((p) => posts.some((x) => x.id === p.id)) : [];
    t('C4 los 3 visibles por /api/posts para el dueño (con source=trial)',
      Array.isArray(list.j) && ids.length === 3 && ids.every((p) => p.source === 'trial'),
      'status=' + list.status + ' visibles=' + ids.length);
  }
  // Bienvenida sin goteo.
  const wel = rows("SELECT text FROM chat_messages WHERE user_id = ? AND text LIKE '%soy posty%'", uid);
  t('C5 una sola bienvenida del invitado', wel.length === 1, 'n=' + wel.length);
  if (wel.length === 1) {
    t('C5b la bienvenida afirma los 3 ya en la semana, sin goteo',
      wel[0].text.includes('ya están los 3 en tu semana') && !wel[0].text.includes('llegan uno por día') && !wel[0].text.includes('llega mañana'),
      wel[0].text.slice(0, 220));
  }
  // Verdad del conteo: sin retenidos → pending 0; con un programado
  // retenido sembrado → pending 1 (el banner no puede decir «aprobada»).
  const rs0 = await getJ(PORT, '/api/review-status', st.cookie);
  t('C6 review-status sin retenidos → pending 0', rs0.j && rs0.j.pending === 0, JSON.stringify(rs0.j));
  {
    const db = openDb();
    const tomorrowIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, scheduled_at, needs_review, source, media_type) VALUES (?, '/media/cor1-seed.jpg', 'semilla retenida', 'scheduled', ?, 1, '', 'image')").run(uid, tomorrowIso);
    db.close();
  }
  const rs1 = await getJ(PORT, '/api/review-status', st.cookie);
  t('C6b review-status con un programado retenido → pending 1', rs1.j && rs1.j.pending === 1, JSON.stringify(rs1.j));
  {
    const db = openDb();
    db.prepare("DELETE FROM posts WHERE user_id = ? AND caption = 'semilla retenida'").run(uid);
    db.close();
  }
  // ensure no crea un 4.º posteo.
  const ens = await postJ(PORT, '/api/week/ensure', {}, st.cookie);
  t('C7 /api/week/ensure responde (200)', ens.status === 200, ens.status + ' ' + JSON.stringify(ens.j).slice(0, 200));
  await sleep(4500);
  const totalAfter = rows('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?', uid)[0].n;
  t('C7b tras ensure: siguen siendo 3 posteos (ningún 4.º)', totalAfter === 3, 'total=' + totalAfter);

  // --- Invitado EN: bienvenida en inglés sin goteo ---
  seedTrialCache('cor1en', payloadFor('en', 'Cor1 Coffee', 'cor1en'));
  const st2 = await postJ(PORT, '/api/guest/start', { ig: 'cor1en', domain: 'cor1en.com', device: 'cor1-device-2', lang: 'en' }, null, '?test_key=cor1key');
  t('C8 guest/start EN → ok + scheduled=3', st2.status === 200 && st2.j && st2.j.ok === true && st2.j.scheduled === 3,
    st2.status + ' ' + JSON.stringify(st2.j).slice(0, 300));
  const uid2 = st2.j && st2.j.user_id;
  const wel2 = uid2 ? rows("SELECT text FROM chat_messages WHERE user_id = ? AND text LIKE '%posty%' ORDER BY id ASC", uid2) : [];
  t('C8b bienvenida EN: los 3 ya están, sin «arrive one per day»',
    wel2.length >= 1 && wel2[0].text.includes('all 3 are already in your week') && !wel2[0].text.includes('arrive one per day'),
    wel2.length ? wel2[0].text.slice(0, 220) : 'sin mensajes');
}
async function cleanup() {
  if (bootChild && bootChild.exitCode === null) {
    try { process.kill(bootChild.pid, 'SIGTERM'); } catch (e) {}
    for (let i = 0; i < 10 && bootChild.exitCode === null; i++) await sleep(500);
    if (bootChild.exitCode === null) { try { process.kill(bootChild.pid, 'SIGKILL'); } catch (e) {} }
  }
}

(async () => {
  try {
    sectionA();
    await sectionB();
    await sectionC();
  } catch (e) {
    mal++;
    fails.push('EXCEPCIÓN: ' + (e && e.stack ? e.stack : e));
    console.log('EXCEPCIÓN:', e && e.stack ? e.stack : e);
  } finally {
    await cleanup();
  }
  let portFree = true;
  try { const ss = execSync('ss -ltn').toString(); portFree = !ss.includes(':' + PORT); } catch (e) {}
  t('C9 puerto ' + PORT + ' libre tras matar por PID exacto', portFree);
  t('C10 sin release/data/ en el árbol', !fs.existsSync(path.join(REL, 'data')));
  try { fs.rmSync(BOOT_BASE, { recursive: true, force: true }); } catch (e) {}
  console.log('== RESULTADO ==');
  console.log('ok: ' + ok + ' · mal: ' + mal);
  if (mal) { console.log('FALLOS:'); fails.forEach((f) => console.log(' - ' + f)); }
  else console.log('TODO VERDE.');
  process.exit(mal ? 1 : 0);
})();
