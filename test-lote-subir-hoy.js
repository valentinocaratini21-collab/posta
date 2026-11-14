// test-lote-subir-hoy.js — LOTE SUBIR-HOY (14/11): la pregunta
// «¿Cuándo lo subimos?» del tab Subir suma la opción «Hoy» /
// «Today». En la captura de Valentino las opciones eran solo «Que
// Posty elija el día» · «Esta semana» · «Solo guardarlo» y Posty le
// programó la foto para el martes: no había forma de pedir hoy.
//
// Qué se prueba:
// A) Fuente: el chip existe en el grupo (ES/EN, sin sacar ninguna
//    opción y con «Que Posty elija» preseleccionado), el server lo
//    acepta como `cuando` válido, subirPlanDia escanea SOLO hoy para
//    'hoy', existen los chequeos de «ya salió» y de motivo, y el
//    recibo pinta «Hoy · 19:00» (es_hoy) y la nota honesta
//    (hoy_motivo) — render del recibo real en VM, ES y EN.
// B) Servidor real (release): elegir «Hoy» con el día vacío → hoy a
//    la hora de siempre; con un posteo de Posty hoy sin publicar →
//    lo subido hoy y el de Posty desplazado a un día libre posterior
//    de la misma semana (invariante: ningún día con dos posteos);
//    con el de hoy YA PUBLICADO → motivo 'ya_salio', el ítem cae al
//    próximo día y NUNCA se agenda un segundo posteo hoy.
// C) Control contra la base (../base o LOTE_BASE_DIR): en la base el
//    caso no se puede expresar — el front no tiene el chip y el
//    server coacciona 'hoy' a 'posty' (cae mañana o después, nunca
//    hoy) — y el default 'posty' cae el MISMO día en base y release
//    (el default no cambió).
//
// Cómo correrla: desde la raíz del árbol, `node test-lote-subir-hoy.js`.
// Bootea el server real en DATA_DIRs temporales de /tmp (puertos
// 35191 release / 35192 base), sin claves de IA (el caption va como
// propio: caption_modo 'mio'). La ventana de «hoy» se hace
// determinística eligiendo para los usuarios una zona horaria donde
// ahora es de mañana (7–14h) y el día es lun–sáb: la hora de siempre
// (19:00) queda siempre en el futuro y siempre hay un día posterior
// libre en la semana para el desplazamiento.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE_DIR = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
const PORT = 35191, PORTB = 35192;
const BASE = `http://127.0.0.1:${PORT}`, BASEB = `http://127.0.0.1:${PORTB}`;
const ADMIN = 'adm-subir-hoy';
const tmpDir = '/tmp/posta-subir-hoy-' + process.pid;
const tmpDirB = '/tmp/posta-subir-hoy-base-' + process.pid;

let ok = 0, mal = 0;
function t(name, cond, extra) { if (cond) { ok++; console.log('  ok', name); } else { mal++; console.log('  MAL', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); } }
const has = (s, x) => String(s || '').includes(x);

// ---------- ventana horaria determinística ----------
const TZ_CANDIDATAS = ['Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Karachi', 'Europe/Madrid', 'Europe/London', 'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/New_York', 'America/Mexico_City', 'America/Los_Angeles', 'Pacific/Honolulu'];
function partesEn(tz, date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date || new Date());
  const o = {}; for (const x of p) o[x.type] = x.value;
  return o;
}
function ymdEn(tz, date) { const o = partesEn(tz, date); return `${o.year}-${o.month}-${o.day}`; }
function elegirTz() {
  for (const tz of TZ_CANDIDATAS) {
    const o = partesEn(tz);
    const hora = Number(o.hour) % 24;
    const wd = new Date(Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day))).getUTCDay(); // 0 dom..6 sáb
    if (hora >= 7 && hora <= 14 && wd >= 1 && wd <= 6) return tz;
  }
  return null;
}
const TZ = elegirTz();
const todayK = TZ ? ymdEn(TZ) : null;
function shift(k, n) { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(k) { const wd = new Date(k + 'T12:00:00Z').getUTCDay(); return shift(k, -((wd + 6) % 7)); }
const sundayK = todayK ? shift(mondayOf(todayK), 6) : null;
const ymdIn = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const horaIn = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
function zonedIso(ymd, hhmm, tz) {
  const [Y, M, D] = ymd.split('-').map(Number); const [H, Mi] = hhmm.split(':').map(Number);
  let guess = Date.UTC(Y, M - 1, D, H, Mi);
  for (let i = 0; i < 4; i++) {
    const o = partesEn(tz, new Date(guess));
    const wallAsUtc = Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour) % 24, Number(o.minute));
    const diff = Date.UTC(Y, M - 1, D, H, Mi) - wallAsUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess).toISOString();
}
const at19 = (k) => zonedIso(k, '19:00', TZ);
const at10 = (k) => zonedIso(k, '10:00', TZ);

// ================= Parte A: fuente + recibo en VM =================
function extractFn(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  const markers = ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '];
  let end = src.length;
  for (const m of markers) { const j = src.indexOf(m, i + 10); if (j > 0 && j < end) end = j; }
  return src.slice(i, end);
}
class El {
  constructor() { this.children = []; this.innerHTML = ''; this.textContent = ''; this.hidden = false; this.disabled = false; this.className = ''; this._items = null; }
  appendChild(c) { this.children.push(c); return c; }
  querySelector(sel) { if (sel === '.r-items') { if (!this._items) this._items = new El(); return this._items; } return null; }
  querySelectorAll() { return []; }
  scrollIntoView() {}
}
function reciboHtml(appSrc, lang, r) {
  const items = new El();
  const cont = new El(); cont._items = items;
  const doc = {
    getElementById: (id) => (id === 'pzSubirRecibos' ? cont : new El()),
    createElement: () => { const e = new El(); e._items = items; return e; },
    querySelectorAll: () => [],
  };
  let code = 'const esc = (s) => String(s == null ? "" : s);\n';
  code += 'let PZ_SUBIR = { thumb: "" };\n';
  for (const n of ['pzVozEn', 'pzSubirHoyNota', 'pzSubirReciboPintar']) { const f = extractFn(appSrc, n); if (!f) return null; code += f + '\n'; }
  const ctx = { ME: { lang }, console, document: doc };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.pzSubirReciboPintar(r);
  const item = items.children[0];
  return item ? item.innerHTML : '';
}
function parteA() {
  console.log('— A · fuente y recibo —');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  t('A1 el resolver acepta «hoy» como cuando válido', has(srv, "['posty', 'semana', 'guardar', 'hoy']"));
  t('A2 subirPlanDia escanea SOLO hoy para «hoy» (startK y hasta en hoy)', has(srv, "cuando === 'hoy') startK = todayK") && has(srv, "cuando === 'hoy' ? todayK : shiftDays(startK, 60)"));
  t('A3 existe el chequeo de «hoy ya salió» (publicado de hoy, sin historias)', has(srv, 'function subirHoyYaSalio') && has(srv, "status = 'published'"));
  t('A4 existe el motivo determinístico de por qué hoy no se pudo', has(srv, 'function subirHoyMotivo') && has(srv, "'ya_salio'") && has(srv, "'hora_pasada'") && has(srv, "'ocupado'"));
  t('A5 la respuesta del resolver declara es_hoy (del horario final) y hoy_motivo', has(srv, 'es_hoy: esHoyFin') && has(srv, "hoy_motivo: plan.hoy_motivo || ''"));
  const chipsLine = app.split('\n').find((l) => l.includes("chips('cuando'")) || '';
  t('A6 la tarjeta suma «Hoy»/«Today» sin sacar ninguna y con Posty preseleccionado', has(chipsLine, "{ v: 'hoy', t: en ? 'Today' : 'Hoy' }") && has(chipsLine, "{ v: 'posty', t: en ? 'Let Posty pick the day' : 'Que Posty elija el día', on: 1 }") && has(chipsLine, "{ v: 'semana'") && has(chipsLine, "{ v: 'guardar'"), chipsLine.slice(0, 200));
  t('A7 el recibo pinta «Hoy» con es_hoy y suma la nota honesta por hoy_motivo', has(app, "r.es_hoy ? (en ? 'today' : 'hoy')") && has(app, 'function pzSubirHoyNota') && has(app, 'r.hoy_motivo'));
  // Render del recibo real en VM.
  const hEs = reciboHtml(app, 'es', { modo: 'posteado', kind: 'foto', es_hoy: true, dia_label: 'sábado 14/11', hora: '19:00' });
  t('A8 recibo ES con es_hoy: «✓ Hoy · 19:00»', !!hEs && has(hEs, '✓ Hoy · 19:00'), hEs && hEs.slice(0, 220));
  const hEn = reciboHtml(app, 'en', { modo: 'posteado', kind: 'foto', es_hoy: true, dia_label: 'sábado 14/11', hora: '19:00' });
  t('A9 recibo EN con es_hoy: «✓ Today · 19:00»', !!hEn && has(hEn, '✓ Today · 19:00'), hEn && hEn.slice(0, 220));
  const hMot = reciboHtml(app, 'es', { modo: 'posteado', kind: 'foto', es_hoy: false, hoy_motivo: 'ya_salio', dia_label: 'domingo 15/11', hora: '19:00' });
  t('A10 recibo con hoy_motivo ya_salio: nota honesta y día real (no dice Hoy)', !!hMot && has(hMot, 'El posteo de hoy ya salió') && has(hMot, 'Domingo 15/11 · 19:00') && !has(hMot, '✓ Hoy'), hMot && hMot.slice(0, 260));
  const hMotEn = reciboHtml(app, 'en', { modo: 'posteado', kind: 'foto', es_hoy: false, hoy_motivo: 'hora_pasada', dia_label: 'domingo 15/11', hora: '19:00' });
  t('A11 recibo EN con hora_pasada: la nota sale en inglés', !!hMotEn && has(hMotEn, 'Your usual posting time today has already passed'), hMotEn && hMotEn.slice(0, 260));
}

// ================= Servidor real =================
function boot(root, port, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', ADMIN_TOKEN: ADMIN, SUPERVISION_HOOK_URL: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  return { srv, getLog: () => log };
}
async function waitUp(base) {
  for (let i = 0; i < 90; i++) { try { const r = await fetch(base + '/api/version'); if (r.ok) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 1000)); }
  return false;
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
function makeSide(baseUrl, dir) {
  const dbOpen = () => new DatabaseSync(path.join(dir, 'posta.db'));
  const J = (r) => r.json().catch(() => ({}));
  const post = (url, body, cookie) => fetch(baseUrl + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
  function cookieOf(res) { const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []; return sc.map((c) => c.split(';')[0]).join('; '); }
  async function register(email) {
    const r = await post('/api/auth/register', { email, password: 'secreto1' });
    const cookie = cookieOf(r);
    const db = dbOpen(); const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const uid = u && u.id;
    if (uid) { db.prepare('INSERT OR IGNORE INTO settings (user_id) VALUES (?)').run(uid); db.prepare('UPDATE settings SET timezone = ? WHERE user_id = ?').run(TZ, uid); }
    db.close();
    return { cookie, uid };
  }
  async function upload(cookie) {
    const r = await fetch(baseUrl + '/api/album/photo', { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: PNG });
    return { status: r.status, body: await J(r) };
  }
  async function resolver(cookie, assetId, cuando) {
    return J(await post('/api/subir/resolver', { asset_id: assetId, cuando, caption_modo: 'mio', caption_text: 'Caption de la suite', mejora: 'no', extra: '' }, cookie));
  }
  function postsOf(uid) { const db = dbOpen(); const r = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id').all(uid); db.close(); return r; }
  function seedPost(uid, o) {
    const db = dbOpen();
    const info = db.prepare(`INSERT INTO posts (user_id, caption, image_path, media_type, status, scheduled_at, published_at, source, client_photo, approval, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(uid, o.caption || 'Semilla', '/media/seed.jpg', o.media || 'image', o.status || 'scheduled', o.at, o.published_at || null, o.source || 'trial', o.client ? 1 : 0, 'pending');
    db.close();
    return Number(info.lastInsertRowid);
  }
  return { register, upload, resolver, postsOf, seedPost };
}

async function parteB() {
  console.log('— B · flujo real (release) —');
  if (!TZ) { t('B0 hay ventana horaria determinística', false, 'sin tz candidata'); return; }
  t('B0 ventana determinística: tz con mañana y día lun–sáb', !!TZ && ymdIn(at19(todayK)) === todayK && horaIn(at19(todayK)) === '19:00', 'tz=' + TZ + ' hoy=' + todayK);
  const { srv, getLog } = boot(ROOT, PORT, tmpDir);
  const S = makeSide(BASE, tmpDir);
  try {
    const up = await waitUp(BASE);
    t('B1 server booteó', up, getLog().slice(-300));
    if (!up) return;

    // --- H1: hoy vacío → hoy 19:00 ---
    const u1 = await S.register('hoy-u1@example.com');
    const up1 = await S.upload(u1.cookie);
    const r1 = await S.resolver(u1.cookie, up1.body.id, 'hoy');
    const p1 = S.postsOf(u1.uid)[0];
    t('H1 elegir «Hoy» con el día vacío: postea HOY a la hora de siempre', r1.ok && r1.modo === 'posteado' && r1.es_hoy === true && r1.hoy_motivo === '' && r1.dia === todayK && r1.hora === '19:00' && !!p1 && ymdIn(p1.scheduled_at) === todayK && horaIn(p1.scheduled_at) === '19:00', JSON.stringify(r1).slice(0, 220));

    // --- H2: hoy ocupado por Posty (sin publicar) → subido hoy + desplazamiento ---
    const u2 = await S.register('hoy-u2@example.com');
    const sem2 = S.seedPost(u2.uid, { at: at19(todayK), source: 'trial', client: 0, caption: 'De Posty, hoy' });
    const up2 = await S.upload(u2.cookie);
    const r2 = await S.resolver(u2.cookie, up2.body.id, 'hoy');
    const posts2 = S.postsOf(u2.uid);
    const nuevo2 = posts2.find((p) => p.id !== sem2);
    const sem2b = posts2.find((p) => p.id === sem2);
    const semDia = sem2b ? ymdIn(sem2b.scheduled_at) : '';
    t('H2 elegir «Hoy» con el de Posty hoy: lo subido queda HOY y el recibo lo dice', r2.ok && r2.es_hoy === true && !!nuevo2 && ymdIn(nuevo2.scheduled_at) === todayK && horaIn(nuevo2.scheduled_at) === '19:00', JSON.stringify(r2).slice(0, 220));
    t('H2 el de Posty se desplazó a un día libre posterior de la misma semana, con su hora', !!r2.desplazado && r2.desplazado.post_id === sem2 && semDia > todayK && semDia <= sundayK && horaIn(sem2b.scheduled_at) === '19:00', 'semilla=' + (sem2b && sem2b.scheduled_at) + ' desp=' + JSON.stringify(r2.desplazado));
    const dias2 = posts2.filter((p) => p.scheduled_at).map((p) => ymdIn(p.scheduled_at));
    t('H2 invariante: ningún día con dos posteos', new Set(dias2).size === dias2.length, JSON.stringify(dias2));

    // --- H3: hoy YA publicado → honesto + próximo día ---
    const u3 = await S.register('hoy-u3@example.com');
    S.seedPost(u3.uid, { at: at10(todayK), published_at: at10(todayK), status: 'published', source: 'trial', client: 0, caption: 'Ya salió hoy' });
    const up3 = await S.upload(u3.cookie);
    const r3 = await S.resolver(u3.cookie, up3.body.id, 'hoy');
    const posts3 = S.postsOf(u3.uid);
    const nuevo3 = posts3.find((p) => p.status !== 'published');
    const hoy3 = posts3.filter((p) => p.scheduled_at && ymdIn(p.scheduled_at) === todayK);
    t('H3 elegir «Hoy» con el de hoy ya publicado: motivo ya_salio y el ítem cae a otro día', r3.ok && r3.modo === 'posteado' && r3.hoy_motivo === 'ya_salio' && r3.es_hoy === false && !!nuevo3 && ymdIn(nuevo3.scheduled_at) !== todayK, JSON.stringify(r3).slice(0, 220));
    t('H3 nunca un segundo posteo hoy: hoy queda solo el publicado', hoy3.length === 1 && hoy3[0].status === 'published' && posts3.length === 2, JSON.stringify(hoy3.map((p) => p.id)));

    // --- H4 (mitad release): el default 'posty' no se tocó ---
    const u4 = await S.register('hoy-u4@example.com');
    const up4 = await S.upload(u4.cookie);
    const r4 = await S.resolver(u4.cookie, up4.body.id, 'posty');
    t('H4 release: el default «Que Posty elija» sigue andando (no cae hoy, sin campos de hoy)', r4.ok && r4.modo === 'posteado' && r4.es_hoy === false && !r4.hoy_motivo && r4.dia !== todayK, JSON.stringify(r4).slice(0, 200));
    globalThis.__r4 = r4;
  } finally { try { srv.kill('SIGKILL'); } catch (e) {} }
}

async function parteC() {
  console.log('— C · control contra la base —');
  if (!fs.existsSync(path.join(BASE_DIR, 'server.js'))) { t('C0 existe el árbol base', false, BASE_DIR); return; }
  const srvSrcB = fs.readFileSync(path.join(BASE_DIR, 'server.js'), 'utf8');
  const appSrcB = fs.readFileSync(path.join(BASE_DIR, 'public', 'app.js'), 'utf8');
  t('C1 en la base el caso no existe: ni el chip ni el cuando «hoy»', !has(appSrcB, "{ v: 'hoy'") && !has(srvSrcB, "'guardar', 'hoy'") && !has(srvSrcB, 'function subirHoyYaSalio'));
  const { srv, getLog } = boot(BASE_DIR, PORTB, tmpDirB);
  const S = makeSide(BASEB, tmpDirB);
  try {
    const up = await waitUp(BASEB);
    t('C2 server base booteó', up, getLog().slice(-300));
    if (!up) return;
    const uB = await S.register('hoy-base@example.com');
    const upB = await S.upload(uB.cookie);
    const rB = await S.resolver(uB.cookie, upB.body.id, 'hoy');
    t('C3 en la base pedir «hoy» se coacciona a «posty»: cae otro día, nunca hoy, sin es_hoy', rB.ok && rB.modo === 'posteado' && rB.es_hoy !== true && rB.dia !== todayK, JSON.stringify(rB).slice(0, 200));
    const r4 = globalThis.__r4;
    t('C4 el default «posty» cae el MISMO día y hora en base y en release (default intacto)', !!r4 && !!rB && r4.dia === rB.dia && r4.hora === rB.hora, 'release=' + (r4 && r4.dia) + ' ' + (r4 && r4.hora) + ' base=' + rB.dia + ' ' + rB.hora);
  } finally { try { srv.kill('SIGKILL'); } catch (e) {} }
}

(async () => {
  parteA();
  await parteB();
  await parteC();
  console.log(`\nSUBIR-HOY: ${ok} ok · ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
