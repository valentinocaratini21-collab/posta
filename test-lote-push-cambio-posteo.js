// test-lote-push-cambio-posteo.js — LOTE v849 NOTIFICACIÓN AL DUEÑO CUANDO UN
// CLIENTE PIDE UN CAMBIO DE POSTEO. Decisión Valentino 9/11 12:54 («si, dale»):
// en vez de extender la revisión a todo, solo una push cuando un cliente pide
// un cambio de posteo — el reemplazo simple del control que daba el velo.
// Trigger: cualquier pedido de cambio (voz/texto en el chat; [Cambiar algo]
// en tarjetas de ritual, exprés y subir-foto; [Pedir un cambio]/[Editar texto]
// del ritual; cambio sobre la propuesta del carril exprés). Push a Valentino
// (user 12): título «[Negocio] pidió un cambio en el posteo de [hoy/fecha]»,
// cuerpo con lo que pidió en una línea y con sus palabras, deep link al chat
// del cliente (conserje ?user=). Una push por pedido; NO por aprobaciones ni
// por silencio. El servidor ya detecta el momento en chat-edit (lineaAprendi
// 'cambio' + cmGusto.registrar 'cambio' + redos) y en PATCH /api/posts/:id
// (save-draft y rama default). Sin push real al teléfono de Valentino desde
// el boot: el disparo se verifica server-side (sendPush invocado + payload +
// log); la llegada al teléfono queda para la prueba viva.
// Parte A: estática (pins + ganchos). Parte B: conserje en vm (parser ?user=).
// Parte C: servidor en vm con stubs (helper, título/cuerpo/fecha, owner-self,
// fallos sin tirar). Parte D: boot real (PATCH save-draft + default disparan,
// programar sin cambio NO, chat sin clave no rompe ni dispara).
// Uso: node test-lote-push-cambio-posteo.js — sale 0 si todo pasa.
// Puerto: 34595 (v847 34593, v848 34594; ads-pantalla usa 18754 fijo).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEnSrc = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');
const cjSrc = fs.readFileSync(path.join(DIR, 'public/chunk-conserje.js'), 'utf8');

// ---------- extractores ----------
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function fnFrom2(src, sig) {
  // Como fnFrom, pero salta la lista de parámetros (con sus llaves) antes de
  // contar el cuerpo: para `function f({ a, b }) { ... }`.
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let j = src.indexOf('(', i);
  if (j < 0) return null;
  let pd = 0;
  for (; j < src.length; j++) {
    if (src[j] === '(') pd++;
    else if (src[j] === ')') { pd--; if (pd === 0) break; }
  }
  const b0 = src.indexOf('{', j);
  if (b0 < 0) return null;
  let d = 0;
  for (j = b0; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function lineNo(src, needle, from) {
  const i = src.indexOf(needle, from || 0);
  if (i < 0) return -1;
  return src.slice(0, i).split('\n').length;
}

// ---------- Parte A: estática ----------
function parteA() {
  console.log('— A) estática: pins, helper y ganchos del lote —');
  check('A0 BUILD v849 en server.js', srvSrc.includes("const BUILD_ID = '20261105-v849';"));
  check('A0b index ES con app.js?v=580 y styles?v=20261223 sin cambio', idxSrc.includes('app.js?v=580') && idxSrc.includes('styles.css?v=20261225') && !idxSrc.includes('app.js?v=576'));
  check('A0b2 index EN no carga app.js (página estática) y styles?v=20261223 sin cambio', !idxEnSrc.includes('app.js?v=') && idxEnSrc.includes('styles.css?v=20261225'));
  check('A0c CHUNK_V v849 en app.js (chunk-conserje cambió)', appSrc.includes("const CHUNK_V = '20261105-v887';"));
  // §1 el helper y sus piezas
  check('A1 existe OWNER_USER_ID = 12 documentado', srvSrc.includes('const OWNER_USER_ID = 12;'));
  for (const f of ['function ownerPostChangeFechaTxt(', 'function ownerPostChangePedidoLinea(', 'function ownerPostChangeFechaCorta(', 'async function notifyOwnerPostChange(']) {
    check('A1b existe ' + f.replace('function ', '').replace('async ', '').replace('(', ''), srvSrc.includes(f), f);
  }
  check('A1c el helper nunca tira (try/catch + return de fallo)', srvSrc.includes("console.error('[owner-notify] falló:'"));
  check('A1d el helper salta al dueño pidiendo su propio cambio', srvSrc.includes('Number(uid) === OWNER_USER_ID') && srvSrc.includes("reason: 'owner_self'"));
  check('A1e el deep link es el conserje con ?user=', srvSrc.includes("`/#/app/conserje?user=${Number(uid)}`"));
  check('A1f el data lleva kind cambio_posteo + user_id + post_id', srvSrc.includes("kind: 'cambio_posteo'") && srvSrc.includes('user_id: Number(uid)'));
  // §1 gancho en el chat: un push por turno, solo si hubo cambio aplicado
  check('A2 el chat junta los posteos cambiados del turno', srvSrc.includes('const cambioPostIds = [];'));
  check('A2b el edit aplicado suma su posteo', srvSrc.includes('editedIds.push(post.id);') && srvSrc.includes('cambioPostIds.push(post.id);'));
  check('A2c el rehacer suma su posteo (copia y en su lugar)', (srvSrc.match(/cambioPostIds\.push\(post\.id\);/g) || []).length >= 4, `pushes=${(srvSrc.match(/cambioPostIds\.push\(post\.id\);/g) || []).length}`);
  check('A2d el gancho corre antes del res.json del chat', srvSrc.includes('if (cambioPostIds.length) {'));
  const chatRoute = srvSrc.indexOf("app.post('/api/ideas/chat'");
  const chatRes = srvSrc.indexOf('res.json({ reply: out.reply,', chatRoute);
  const hookChat = srvSrc.indexOf('if (cambioPostIds.length) {', chatRoute);
  check('A2e el gancho del chat vive dentro de /api/ideas/chat y antes de su res.json', chatRoute > 0 && hookChat > chatRoute && hookChat < chatRes, `route=${lineNo(srvSrc, "app.post('/api/ideas/chat'")} hook=${lineNo(srvSrc, 'if (cambioPostIds.length) {')} res=${lineNo(srvSrc, 'res.json({ reply: out.reply,')}`);
  check('A2f el gancho usa el primer posteo cambiado + el último mensaje del cliente', srvSrc.includes('cambioPostIds[0]') && srvSrc.includes("clean.filter(m => m.role === 'user').pop()"));
  // §1 el gancho NO está en aprobar/publicar/rechazar/crear (solo cambio):
  // 4 llamados + 1 definición del helper.
  const callLines = [];
  let from = 0;
  for (;;) {
    const i = srvSrc.indexOf('notifyOwnerPostChange({', from);
    if (i < 0) break;
    callLines.push(srvSrc.slice(0, i).split('\n').length);
    from = i + 1;
  }
  const chatRouteLine = lineNo(srvSrc, "app.post('/api/ideas/chat'");
  const chatResLine = lineNo(srvSrc, 'res.json({ reply: out.reply,');
  const patchStart = lineNo(srvSrc, "app.patch('/api/posts/:id'");
  const patchEnd = lineNo(srvSrc, "// POST /api/posts/:id/reject-reason");
  const nDef = callLines.filter((l) => l < chatRouteLine).length;
  const inChat = callLines.filter((l) => l > chatRouteLine && l < chatResLine).length;
  const inPatch = callLines.filter((l) => l > patchStart && l < patchEnd).length;
  check('A3 5 menciones del helper: 1 definición + 1 llamado en el chat + 3 en PATCH', callLines.length === 5 && nDef === 1 && inChat === 1 && inPatch === 3, `total=${callLines.length} def=${nDef} chat=${inChat} patch=${inPatch} líneas=${callLines.join(',')}`);
  check('A3b el PATCH save-draft avisa solo si algo cambió (edited/moveIso/overlay)', srvSrc.includes('if (edited || moveIso || overlayChanged) {'));
  check('A3c la rama default del PATCH avisa solo si el texto cambió', srvSrc.includes("if ((caption !== undefined && caption !== post.caption) || (hashtags !== undefined && hashtags !== post.hashtags)) {"));
  // §1 conserje: deep link ?user= + auto-apertura del chat
  check('A4 existe conserjeUserFromHash en el chunk', cjSrc.includes('function conserjeUserFromHash('));
  check('A4b bindConserje abre el detalle con ?user=', cjSrc.includes('conserjeUserFromHash(typeof location') && cjSrc.includes('location.hash') && cjSrc.includes('conserjeEstado.vistaId = String(cjDeepUser);'));
  check('A4c con ?user= se abre también el chat del cliente', cjSrc.includes("card.querySelector('[data-cj=\"chat\"]')") && cjSrc.includes('b.click()'));
  // §1 textos sin jerga
  // (FASE 2: la ventana fija de 2500 chars sangraba al código v847 que sigue
  // al helper — 'timeout propio (4 min)' del runner de trabajos — y fallaba.
  // Se acota al cuerpo de la función: el texto de la push vive ahí.)
  const _nf0 = srvSrc.indexOf('async function notifyOwnerPostChange');
  const _nf1 = srvSrc.indexOf("return { ok: false, reason: 'error' };", _nf0);
  check('A5 ningún texto de la push tiene jerga (timeout/429/quota/error)', _nf0 >= 0 && _nf1 > _nf0 && !/timeout|429|quota/i.test(srvSrc.slice(_nf0, _nf1)));
  check('A5b el cuerpo por defecto es llano', srvSrc.includes("body = linea || 'Te pidió un cambio en un posteo.'"));
}

// ---------- Parte B: conserje en vm ----------
function parteB() {
  console.log('— B) conserje: parser del deep link ?user= —');
  const fn = fnFrom(cjSrc, 'function conserjeUserFromHash(');
  check('B0 se extrae conserjeUserFromHash', !!fn, fn ? '' : 'no está');
  if (!fn) return;
  const ctx = { console, URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);
  const t = (h) => vm.runInContext(`conserjeUserFromHash(${JSON.stringify(h)})`, ctx);
  check('B1 «#/app/conserje?user=84» → 84', t('#/app/conserje?user=84') === 84);
  check('B2 sin ?user= → 0', t('#/app/conserje') === 0);
  check('B3 ?user=abc → 0 (no numérico)', t('#/app/conserje?user=abc') === 0);
  check('B4 ?user=0 → 0', t('#/app/conserje?user=0') === 0);
  check('B5 ?user=-5 → 0 (negativo)', t('#/app/conserje?user=-5') === 0);
  check('B6 con otros params (?user=84&chat=1) → 84', t('#/app/conserje?user=84&chat=1') === 84);
  check('B7 hash vacío → 0', t('') === 0);
}

// ---------- Parte C: servidor en vm ----------
function todayART() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function plusDaysART(n) {
  const [y, m, d] = todayART().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function extractServerNotify() {
  const parts = [];
  const c = srvSrc.indexOf('const OWNER_USER_ID = 12;');
  if (c < 0) return { error: 'falta OWNER_USER_ID' };
  parts.push('const OWNER_USER_ID = 12;');
  for (const sig of ['function ownerPostChangeFechaTxt(', 'function ownerPostChangePedidoLinea(', 'function ownerPostChangeFechaCorta(', 'function ymdInTz(', 'function tzToday(', 'function wallInTz(']) {
    const s = fnFrom(srvSrc, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  const h = fnFrom2(srvSrc, 'async function notifyOwnerPostChange(');
  if (!h) return { error: 'falta notifyOwnerPostChange' };
  parts.push(h);
  return { code: parts.join('\n') };
}
async function parteC() {
  console.log('— C) servidor: helper de la push (título/cuerpo/fecha, owner-self, fallos) —');
  const loaded = extractServerNotify();
  check('C0 se extraen el helper y sus piezas', !loaded.error, loaded.error || '');
  if (loaded.error) return;
  const mkCtx = (profiles, sendImpl) => {
    const calls = [];
    const send = sendImpl || (async (uid, payload) => { calls.push({ uid, payload }); return { ok: true, sent: 1 }; });
    return {
      console, calls,
      push: { sendPush: send },
      getProfile: (uid) => profiles[uid] || { business_name: '', ig_username: '' },
      userTz: () => 'America/Argentina/Buenos_Aires',
    };
  };
  const run = async (ctx, args) => vm.runInContext(`notifyOwnerPostChange(${JSON.stringify(args)})`, ctx);
  const postHoy = { id: 501, caption: 'Posteo de hoy', scheduled_at: `${todayART()}T22:00:00.000Z`, status: 'scheduled' };
  const postFecha = { id: 502, caption: 'Posteo del jueves', scheduled_at: `${plusDaysART(4)}T22:00:00.000Z`, status: 'scheduled' };
  const postSinFecha = { id: 503, caption: 'Borrador sin fecha', scheduled_at: null, status: 'draft' };
  const prof84 = { 84: { business_name: 'Café Aroma', ig_username: 'cafe.aroma' } };

  // C1: el caso común — posteo de hoy, pedido con sus palabras.
  {
    const ctx = mkCtx(prof84);
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const r = await run(ctx, { uid: 84, post: postHoy, pedido: 'cambialo, no me gusta el titular' });
    check('C1 la push sale (ok, sent 1)', r && r.ok === true && r.sent === 1, JSON.stringify(r));
    check('C1b el target es el dueño (user 12)', ctx.calls.length === 1 && ctx.calls[0].uid === 12, JSON.stringify(ctx.calls.map((c) => c.uid)));
    const p = ctx.calls[0] && ctx.calls[0].payload;
    check('C1c el título es «Café Aroma pidió un cambio en el posteo de hoy»', p && p.title === 'Café Aroma pidió un cambio en el posteo de hoy', p && p.title);
    check('C1d el cuerpo es el pedido, en una línea', p && p.body === 'cambialo, no me gusta el titular', p && p.body);
    check('C1e el deep link es el conserje con ?user=84', p && p.url === '/#/app/conserje?user=84', p && p.url);
    check('C1f el data lleva kind + user_id + post_id', p && p.data && p.data.kind === 'cambio_posteo' && p.data.user_id === 84 && p.data.post_id === 501, JSON.stringify(p && p.data));
  }
  // C2: otra fecha → «del DD/MM» (dinámico: 4 días desde hoy en ART).
  {
    const ctx = mkCtx(prof84);
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await run(ctx, { uid: 84, post: postFecha, pedido: 'ponele otra foto' });
    const p = ctx.calls[0] && ctx.calls[0].payload;
    const ymd = plusDaysART(4);
    const ddmm = `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
    check('C2 posteo de otra fecha: «del DD/MM»', p && p.title === `Café Aroma pidió un cambio en el posteo del ${ddmm}`, p && p.title);
  }
  // C3: borrador sin fecha → sin «de …».
  {
    const ctx = mkCtx(prof84);
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await run(ctx, { uid: 84, post: postSinFecha, pedido: 'cambialo' });
    const p = ctx.calls[0] && ctx.calls[0].payload;
    check('C3 borrador sin fecha: título sin fecha', p && p.title === 'Café Aroma pidió un cambio en el posteo', p && p.title);
  }
  // C4: el dueño pidiendo su propio cambio NO avisa.
  {
    const ctx = mkCtx({ 12: { business_name: 'Posty.', ig_username: 'posty.communitymanager' } });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const r = await run(ctx, { uid: 12, post: postHoy, pedido: 'cambialo' });
    check('C4 owner-self no dispara (reason owner_self, 0 envíos)', r && r.ok === false && r.reason === 'owner_self' && ctx.calls.length === 0, JSON.stringify(r));
  }
  // C5: sin nombre de negocio → «Un cliente».
  {
    const ctx = mkCtx({});
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await run(ctx, { uid: 99, post: postHoy, pedido: 'cambialo' });
    const p = ctx.calls[0] && ctx.calls[0].payload;
    check('C5 sin negocio: «Un cliente pidió un cambio…»', p && p.title === 'Un cliente pidió un cambio en el posteo de hoy', p && p.title);
  }
  // C6: el pedido se aplana a una línea y se corta a 140.
  {
    const ctx = mkCtx(prof84);
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await run(ctx, { uid: 84, post: postHoy, pedido: 'primera línea\nsegunda línea\n' + 'x'.repeat(200) });
    const p = ctx.calls[0] && ctx.calls[0].payload;
    check('C6 pedido multilínea y largo → una línea ≤140', p && !/\\n/.test(p.body) && p.body.length <= 140 && p.body.startsWith('primera línea segunda línea'), p && p.body);
  }
  // C7: sin pedido → cuerpo por defecto, llano.
  {
    const ctx = mkCtx(prof84);
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await run(ctx, { uid: 84, post: postHoy, pedido: '' });
    const p = ctx.calls[0] && ctx.calls[0].payload;
    check('C7 sin pedido: cuerpo «Te pidió un cambio en un posteo.»', p && p.body === 'Te pidió un cambio en un posteo.', p && p.body);
  }
  // C8–C10: fallos sin tirar.
  {
    const ctx = mkCtx(prof84, async () => ({ ok: false, reason: 'no_subs' }));
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const r = await run(ctx, { uid: 84, post: postHoy, pedido: 'cambialo' });
    check('C8 sin suscripciones: devuelve el fallo sin tirar', r && r.ok === false && r.reason === 'no_subs', JSON.stringify(r));
  }
  {
    const ctx = mkCtx(prof84, async () => { throw new Error('apns caído'); });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    let r = null, threw = false;
    try { r = await run(ctx, { uid: 84, post: postHoy, pedido: 'cambialo' }); } catch (e) { threw = true; }
    check('C9 si sendPush tira, el helper devuelve error sin tirar', !threw && r && r.ok === false && r.reason === 'error', JSON.stringify(r));
  }
  {
    const ctx = mkCtx(prof84);
    ctx.getProfile = () => { throw new Error('db caída'); };
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const r = await run(ctx, { uid: 84, post: postHoy, pedido: 'cambialo' });
    const p = ctx.calls[0] && ctx.calls[0].payload;
    check('C10 si getProfile tira, igual avisa como «Un cliente»', r && r.ok === true && p && p.title === 'Un cliente pidió un cambio en el posteo de hoy', p && p.title);
  }
  // C11: fecha corta para el cambio de día (PATCH).
  {
    const ctx = mkCtx(prof84);
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const f = vm.runInContext("ownerPostChangeFechaCorta('2026-11-13T22:00:00.000Z', 84)", ctx);
    check('C11 «2026-11-13T22:00Z» en ART es «13/11 19:00»', f === '13/11 19:00', f);
  }
}

// ---------- Parte D: boot real ----------
const PORT = 34595;
const TEST_KEY = 'boot-test-key-push-cambio';
const ADMIN_TOKEN = (() => { try { const m = fs.readFileSync(path.join(DIR, 'test-lote-chat-clicks.js'), 'utf8').match(/const ADMIN_TOKEN = '([^']+)';/); return m ? m[1] : ''; } catch (e) { return ''; } })();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-cambio-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync(path.join(mediaDir, 'f1.png'), PNG_1X1);

async function reqJson(method, p, body, cookie) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  const setCookie = r.headers.get('set-cookie');
  return { status: r.status, json: j, setCookie };
}
function seedDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try {
    for (let i = 0; i < 10; i++) {
      try { fn(db); return; }
      catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
    }
  } finally { try { db.close(); } catch (e) {} }
}
function readDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return fn(db); }
  finally { try { db.close(); } catch (e) {} }
}
async function bootServer() {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, ADMIN_TOKEN,
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  let up = false;
  for (let i = 0; i < 45; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
    await sleep(1000);
  }
  return { child, up, out: () => out };
}
async function killServer(child) {
  try { child.kill('SIGTERM'); } catch (e) {}
  await sleep(800);
  try { if (!child.killed) child.kill('SIGKILL'); } catch (e) {}
  await sleep(300);
}
const countNotify = (out) => (out.match(/\[owner-notify\] cambio posteo/g) || []).length;
async function waitNotify(b, n, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (countNotify(b.out()) >= n) return true;
    await sleep(200);
  }
  return countNotify(b.out()) >= n;
}

async function parteD() {
  console.log('— D) boot real: PATCH dispara, programar sin cambio NO, chat sin clave no rompe —');
  const dbPath = path.join(tmpDir, 'posta.db');
  const b1 = await bootServer();
  try {
    check('D0 el servidor levanta con el lote', b1.up);
    if (!b1.up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(b1.out().split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await reqJson('GET', '/api/version');
    check('D0b /api/version trae el BUILD v849', ver.status === 200 && ver.json && ver.json.build === '20261105-v849', JSON.stringify(ver.json));
    check('D0c la DB del boot existe en el DATA_DIR temporal', fs.existsSync(dbPath));

    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'join', ig: 'push-cambio-test', device: 'test-device-push-cambio' });
    check('D0e join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const uid = join.json.user_id;
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';

    // Semilla: el cliente es Café Aroma; post A borrador de hoy 19:00 ART,
    // post B programado para mañana 19:00 ART.
    const hoyISO = `${todayART()}T22:00:00.000Z`;
    const mananaISO = `${plusDaysART(1)}T22:00:00.000Z`;
    let dA = 0, dB = 0, dC = 0;
    seedDb(dbPath, (db) => {
      db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(uid);
      db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET business_name=excluded.business_name, ig_username=excluded.ig_username`).run(uid, 'Café Aroma', 'cafe.aroma');
      dA = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uid, '/media/f1.png', 'Posteo de hoy de Café Aroma', '', hoyISO, 'draft', 'image', 0).lastInsertRowid);
      dB = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uid, '/media/f1.png', 'Posteo de mañana de Café Aroma', '', mananaISO, 'scheduled', 'image', 0).lastInsertRowid);
      // dC: posteo virgen de pasado mañana, solo para D3 — el cambio de
      // caption de D2 marca B con needs_review=1 (lint al programar) y el
      // PATCH lo rechazaría con 403 in_review; D3 usa un posteo sin tocar.
      dC = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uid, '/media/f1.png', 'Posteo de pasado mañana de Café Aroma', '', `${plusDaysART(3)}T22:00:00.000Z`, 'scheduled', 'image', 0).lastInsertRowid);
    });
    check('D0f semilla ok (perfil Café Aroma + 3 posteos)', dA > 0 && dB > 0 && dC > 0, `dA=${dA} dB=${dB} dC=${dC}`);

    // D1: [Cambiar texto] vía save-draft → cambio aplicado + push al dueño.
    const p1 = await reqJson('PATCH', `/api/posts/${dA}`, { action: 'save-draft', caption: 'Nuevo texto del cliente, más corto' }, cookie);
    check('D1 PATCH save-draft con texto nuevo responde 200', p1.status === 200 && p1.json && p1.json.ok === true, JSON.stringify(p1.json));
    const capA = readDb(dbPath, (db) => db.prepare('SELECT caption FROM posts WHERE id = ?').get(dA).caption);
    check('D1b el caption cambió en la DB', capA === 'Nuevo texto del cliente, más corto', capA);
    const okWait1 = await waitNotify(b1, 1, 5000);
    check('D1c la push al dueño se disparó (log [owner-notify])', okWait1, `logs=${countNotify(b1.out())}`);
    const log1 = (b1.out().match(/\[owner-notify\] cambio posteo[^\n]*/g) || [])[0] || '';
    check('D1d el log dice Café Aroma + posteo de hoy + target owner 12', /Café Aroma pidió un cambio en el posteo de hoy/.test(log1) && /-> owner 12/.test(log1), log1.slice(0, 300));
    check('D1e el cuerpo es el texto nuevo del cliente', /Nuevo texto del cliente, más corto/.test(log1), log1.slice(0, 300));
    check('D1f el deep link es el conserje con ?user=', new RegExp(`/#/app/conserje\\?user=${uid}`).test(log1), log1.slice(0, 300));

    // D2: [Editar texto] del ritual vía rama default → segundo push (un pedido nuevo).
    const p2 = await reqJson('PATCH', `/api/posts/${dB}`, { caption: 'Texto editado en el ritual' }, cookie);
    check('D2 PATCH default con texto nuevo responde 200', p2.status === 200 && p2.json && p2.json.ok === true, JSON.stringify(p2.json));
    const okWait2 = await waitNotify(b1, 2, 5000);
    check('D2b el segundo pedido dispara su propia push (van 2)', okWait2, `logs=${countNotify(b1.out())}`);
    const log2 = (b1.out().match(/\[owner-notify\] cambio posteo[^\n]*/g) || [])[1] || '';
    check('D2c la segunda push es del posteo de mañana', /Café Aroma pidió un cambio en el posteo del/.test(log2) && /Texto editado en el ritual/.test(log2), log2.slice(0, 300));

    // D3: programar sin cambiar el texto → aprobación, NO push.
    // Se mueve dC (virgen) a pasado mañana: B quedó con needs_review=1 por
    // el lint de D2 y su PATCH daría 403 in_review.
    const p3 = await reqJson('PATCH', `/api/posts/${dC}`, { scheduled_at: `${plusDaysART(2)}T22:00:00.000Z` }, cookie);
    check('D3 PATCH solo fecha responde 200', p3.status === 200 && p3.json && p3.json.ok === true, JSON.stringify(p3.json));
    await sleep(1500);
    check('D3b programar sin cambio NO dispara push (siguen 2)', countNotify(b1.out()) === 2, `logs=${countNotify(b1.out())}`);

    // D4: el chat sin clave no se cae ni dispara (el camino con cerebro real
    // lo verifica el preparador con el surrogado; acá el negativo).
    const ch = await reqJson('POST', '/api/ideas/chat', { messages: [
      { role: 'user', text: 'cambialo, no me gusta' },
    ] }, cookie);
    check('D4 POST /api/ideas/chat sin clave responde sin romperse', ch.status === 200, `status=${ch.status} ${JSON.stringify(ch.json).slice(0, 200)}`);
    await sleep(1500);
    check('D4b sin cambio aplicado no hay push (siguen 2)', countNotify(b1.out()) === 2, `logs=${countNotify(b1.out())}`);

    // D5: el chunk del conserje sirve con el deep link.
    const cj = await fetch(`http://127.0.0.1:${PORT}/chunk-conserje.js?v=20261105-v849`);
    const cjTxt = await cj.text();
    check('D5 el chunk-conserje sirve con el parser ?user=', cj.status === 200 && cjTxt.includes('function conserjeUserFromHash('), `status=${cj.status}`);
  } catch (e) {
    console.log('error de la parte D (boot 1):', e.message);
    fail++;
  } finally {
    await killServer(b1.child);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  parteA();
  parteB();
  await parteC();
  await parteD();
  console.log(`\ntest-lote-push-cambio-posteo: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
