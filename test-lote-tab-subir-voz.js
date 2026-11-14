// test-lote-tab-subir-voz.js — LOTE COMPUESTO TAB-SUBIR + TIRA-VOZ +
// SALE EL TAB DE CHAT (decisión Valentino 13/11 14:05 + addendums
// 14:15 / 14:20 / 14:22 / 14:24 / 14:25).
//
// Cubre: barra sin Chat y con Subir/Ajustes en los dos shells · ruta
// chat solo-invitado · subida «encargate de todo» y con respuestas
// (día/semana/guardar, caption propio, promo que viaja en el pedido,
// mejora fail-soft sin clave, video sin clave = error honesto sin
// efectos) · REGLA DE CADENCIA (desplazamiento del posteo de Posty,
// semana llena → semana siguiente, dos subidas nunca el mismo día) ·
// hilo de la tira (posteo vs semana vs legado, sin mezcla) · marca
// «Nuevo» que se apaga con /visto · la foto del héroe abre el detalle
// y «Ver el posteo completo» no existe · el flujo de Subir se termina
// sin tocar la voz (la fila de voz va al final, opcional) · carril
// determinístico de rehacer (addendum 14:15) · veto de síntesis de voz.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = 35131;
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = '/tmp/subir-suite-' + process.pid;
const TZ = 'America/Argentina/Buenos_Aires';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + String(extra).slice(0, 300) : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);

// ---------- utilidades de fecha (zona del cliente por defecto) ----------
const ymdIn = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const todayK = ymdIn(new Date());
const shift = (k, n) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (k) => { const d = new Date(k + 'T12:00:00Z'); const wd = (d.getUTCDay() + 6) % 7; return shift(k, -wd); };
const sundayOf = (k) => shift(mondayOf(k), 6);
const at19 = (k) => k + 'T22:00:00.000Z'; // 19:00 en Buenos Aires (UTC-3)
const dow = (k) => new Date(k + 'T12:00:00Z').getUTCDay(); // 0=dom..6=sáb

// ---------- extracción de funciones del bundle para VM ----------
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const markers = ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '];
  let end = src.length;
  for (const m of markers) {
    const j = src.indexOf(m, i + 10);
    if (j > 0 && j < end) end = j;
  }
  return src.slice(i, end);
}

// ================= Parte A: estática =================
{
  const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const dbjs = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
  const idxEs = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const idxEn = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');

  t('A1 BUILD v1017 (re-estampado en aterrizaje)', srv.includes("const BUILD_ID = '20261105-v1017';"));
  const mz = extractFn(app, 'mzTabsHTML') || '';
  t('A2 barra mz: Subir, sin Chat ni Ajustes (Ajustes salió de la barra — LOTE SIN-TAB-AJUSTES)', has(mz, "'subir', 'subir'") && !has(mz, "'ajustes', 'ajustes'") && !has(mz, "'chat', 'chat'"), mz.slice(0, 160));
  t('A3 barra bb: tabBtn subir, sin tabBtn chat ni ajustes (LOTE SIN-TAB-AJUSTES)', has(app, "tabBtn('subir', '#/app/subir'") && !has(app, "tabBtn('ajustes'") && !has(app, "tabBtn('chat'"));
  t('A4 router: subir existe y chat redirige al registrado', has(app, "tab === 'subir'") && has(app, "content = await subirView()") && /tab === 'chat'\) \{ if \(!\(typeof pzIsGuest/.test(app));
  t('A5 el link «Ver el posteo completo» del héroe no existe (clase eliminada del bundle)', !has(app, 'pz-hoy-hero-link'));
  t('A6 frase exacta de la tira', has(app, '<b>Mantené apretado</b> y decime si necesitás un cambio en este posteo'));
  t('A7 veto: sin síntesis de voz en todo el bundle', !has(app, 'speechSynthesis') && !has(srv, 'speechSynthesis'));
  t('A8 endpoints nuevos en server', has(srv, "app.post('/api/subir/resolver'") && has(srv, "app.get('/api/chat/hilo'") && has(srv, "app.post('/api/chat/hilo/log'") && has(srv, "app.post('/api/posts/:id/visto'"));
  t('A9 ALTERs: chat_messages.hilo y posts.subir_nuevo DESPUÉS de sus CREATE', dbjs.includes("ALTER TABLE chat_messages ADD COLUMN hilo") && dbjs.includes("ALTER TABLE posts ADD COLUMN subir_nuevo") && dbjs.indexOf("ALTER TABLE chat_messages ADD COLUMN hilo") > dbjs.indexOf('CREATE TABLE IF NOT EXISTS chat_messages') && dbjs.indexOf("ALTER TABLE posts ADD COLUMN subir_nuevo") > dbjs.indexOf('CREATE TABLE IF NOT EXISTS posts'));
  t('A10 estilos de la tira, de Subir y de la marca Nuevo', has(css, '.pz-voz-mic') && has(css, '.pz-subir .todo') && has(css, '.hf-nuevo-badge') && has(css, '.pz-subir .recibo'));
  t('A11 stamps del aterrizaje: ES app?v=697 + styles 20261278 · EN styles 20261278', has(idxEs, '/app.js?v=697') && has(idxEs, '/styles.css?v=20261278') && has(idxEn, '/styles.css?v=20261278'));
  t('A12 la tira va en héroe, compacta, weekCard y detalle', (app.match(/pzVozStripHTML\(p\)/g) || []).length >= 3 && has(app, 'pzVozStripHTML(d)'));
  t('A13 Schedule: la tarjeta de chat al pie fue reemplazada por la tira de la semana', has(app, '${pzVozSemanaHTML()}') && !has(app, 'homeChatBlock = `<div style="margin-top:18px">${chatCardHTML'));
  t('A14 M78: funciones nuevas definidas', ['pzVozStripHTML', 'pzVozSemanaHTML', 'pzVozEnhance', 'pzVozEnviar', 'pzVozLane', 'pzVozDelegar', 'pzVozVolver', 'pzGridNuevoObserve', 'pzGridScrollNuevo', 'subirView', 'bindSubir', 'pzSubirPayload', 'pzSubirResolver', 'pzSubirUpload', 'pzSubirReciboPintar', 'pzVozAplicarDirecto', 'pzVozPintarFoto'].every((f) => app.includes('function ' + f + '(')));
  t('A15 el invitado conserva chatFullView y su tarjeta de @ sigue apuntando al chat', has(app, 'function chatFullView()') && has(app, "location.hash = '#/app/chat'"));
  t('A16 en el bloque del lote, photo-restyle/photo-enhance viven SOLO dentro del carril directo (a pedido)', (() => {
    const blk = app.slice(app.indexOf('LOTE TAB-SUBIR + TIRA-VOZ (prov v1011)'), app.indexOf('function chatFullView()'));
    const lane = blk.slice(blk.indexOf('async function pzVozAplicarDirecto'), blk.indexOf('async function pzVozCerrar'));
    const fuera = blk.replace(lane, '');
    return (lane.match(/photo-restyle/g) || []).length >= 1 && (lane.match(/photo-enhance/g) || []).length >= 2 && !/photo-restyle|photo-enhance/.test(fuera);
  })());
}

// ================= Parte B: cliente en VM =================
{
  const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const sandbox = {
    console, setTimeout, clearTimeout, sessionStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    ME: { lang: 'es' }, PROFILE: {},
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (p) => String(p || ''),
    pzIc: (n) => '<i data-ic="' + n + '"></i>',
    gzT: (es) => es,
    pcTz: () => TZ,
    pcParseDate: (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
    schedDayKeyOf: (d, tz) => d.toLocaleDateString('en-CA', { timeZone: tz || TZ }),
    pzHoyCuandoCorto: () => '', pzHoyCuentaSaleTxt: () => '',
    pzHoyPillSalida: () => 'Se postea el viernes · 19:00',
    pzRitualPendiente: () => true, pzProximoYaAbierto: () => false, pzRitualSelLeer: () => 0,
    hfIgShortcode: () => null,
    hfFeedSortKey: (tt) => tt.post ? String(tt.post.scheduled_at || tt.post.published_at || '') : '',
    hfCmpDescKey: (a, b) => String(b).localeCompare(String(a)),
    document: { getElementById: () => null, querySelectorAll: () => [] },
    window: {},
    navigator: {},
  };
  vm.createContext(sandbox);
  const need = ['mzTabsHTML', 'pzVozEn', 'pzVozStripHTML', 'pzVozLane', 'pzHoyCardHTML', 'homeGridCompose', 'homeTileHTML'];
  let okLoad = true;
  for (const f of need) { const src = extractFn(app, f); if (!src) { okLoad = false; console.error('  (sin extraer ' + f + ')'); } else { try { vm.runInContext(src, sandbox); } catch (e) { okLoad = false; console.error('  (eval ' + f + ': ' + e.message + ')'); } } }
  // stubs que homeTileHTML necesita y no se extraen
  vm.runInContext(`hfCoverState = () => ({ has: false }); hfWhenChip = () => 'vie · 19:00'; hfTileChipParts = () => null; pzAprobadoEs = () => false; pzDiaEsFutura = () => false; HOME_PIN_SVG=''; HOME_REEL_SVG=''; HOME_CAR_SVG='';`, sandbox);
  t('B0 extracción VM de las funciones del lote', okLoad);

  const mz = vm.runInContext("mzTabsHTML('subir')", sandbox);
  t('B1 barra mz renderizada: Subir activa, sin Chat ni Ajustes (Ajustes salió de la barra — LOTE SIN-TAB-AJUSTES)', has(mz, 'Subir') && !has(mz, 'Ajustes') && !has(mz, 'Chat'), mz.slice(0, 200));

  const lane = (s) => vm.runInContext(`pzVozLane(${JSON.stringify(s)})`, sandbox);
  t('B2 carril rehacer: «rehacé la foto» / «cambiá la foto por otra»', lane('rehacé la foto, no me gusta') === 'restyle' && lane('cambiá la foto por otra') === 'restyle');
  t('B3 carril mejorar: «mejorá la imagen»', lane('mejorá la imagen que está oscura') === 'enhance');
  t('B4 NO es carril de imagen: caption / día / frenar', lane('cambiá el caption') === null && lane('cambiá el día del posteo') === null && lane('frená este posteo') === null);

  const hero = vm.runInContext(`pzHoyCardHTML({ id: 777, status: 'scheduled', approval: 'pending', media_type: 'image', image_path: '/media/x.jpg', caption: 'Hola', scheduled_at: '${at19(shift(todayK, 1))}' }, { hero: true })`, sandbox);
  t('B5 héroe: trae la tira anclada y NO el link «Ver el posteo completo»', has(hero, 'data-pz-voz="777"') && !has(hero, 'Ver el posteo completo'), hero.slice(-260));
  t('B6 héroe: tocar la foto abre el detalle (data-pz-hoy-detalle en la media)', has(hero, 'pz-hoy-hero-media') && has(hero, 'data-pz-hoy-detalle="777"'));

  // Grilla: el posteo de Subir futuro rinde; el futuro común, no.
  const subirPost = { id: 901, status: 'draft', source: 'subir', media_type: 'image', image_path: '/media/s.jpg', caption: 'Subido', scheduled_at: at19(shift(todayK, 3)), subir_nuevo: 1 };
  const normalPost = { id: 902, status: 'scheduled', source: 'trial', media_type: 'image', image_path: '/media/n.jpg', caption: 'Normal', scheduled_at: at19(shift(todayK, 2)) };
  const pubPost = { id: 903, status: 'published', source: 'trial', media_type: 'image', image_path: '/media/p.jpg', caption: 'Viejo', published_at: at19(shift(todayK, -2)), ig_state: '' };
  const tiles = vm.runInContext(`homeGridCompose({ upcoming: [{ p: ${JSON.stringify(subirPost)}, ymd: '${shift(todayK, 3)}' }, { p: ${JSON.stringify(normalPost)}, ymd: '${shift(todayK, 2)}' }], published: [${JSON.stringify(pubPost)}], recents: [], all: [] })`, sandbox);
  const ids = tiles.filter((x) => x.kind === 'post').map((x) => x.post.id);
  const subirTile = tiles.find((x) => x.post && x.post.id === 901);
  t('B7 grilla: la celda de Subir rinde en posición final y la futura común no', ids.includes(901) && !ids.includes(902) && ids.includes(903) && !!subirTile && subirTile.subir === true, JSON.stringify(ids));
  const tileHtml = vm.runInContext(`homeTileHTML(${JSON.stringify(subirTile)}, 1)`, sandbox);
  t('B8 celda de Subir: marca «Nuevo» + rótulo «Se postea…» debajo + data-subir-nuevo', has(tileHtml, 'hf-nuevo-badge') && has(tileHtml, 'Nuevo') && has(tileHtml, 'Se postea el viernes · 19:00') && has(tileHtml, 'data-subir-nuevo="1"'), tileHtml.slice(0, 240));
  const tileHtml2 = vm.runInContext(`homeTileHTML(${JSON.stringify({ ...subirTile, post: { ...subirPost, subir_nuevo: 0 } })}, 1)`, sandbox);
  t('B9 celda ya vista: sin marca «Nuevo»', !has(tileHtml2, 'hf-nuevo-badge') && !has(tileHtml2, 'data-subir-nuevo'));
}

// ================= Parte C: servidor real =================
function dbOpen() { return new DatabaseSync(path.join(tmpDir, 'posta.db')); }
function cookieOf(res) { const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []; return sc.map((c) => c.split(';')[0]).join('; '); }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// El álbum deduplica por contenido: dos subidas «distintas» con los
// mismos bytes son el MISMO asset. La suite genera PNGs de colores
// distintos para que cada subida sea un material nuevo de verdad.
function pngDeColor(color) {
  const f = path.join(tmpDir, 'up-' + color + '.png');
  try { execSync(`ffmpeg -y -v error -f lavfi -i color=c=${color}:s=48x48 -frames:v 1 "${f}"`); return fs.readFileSync(f); }
  catch (e) { return PNG; }
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', ADMIN_TOKEN: 'adm-subir', SUPERVISION_HOOK_URL: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  const J = (r) => r.json().catch(() => ({}));
  const post = (url, body, cookie) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
  const get = (url, cookie) => fetch(BASE + url, { headers: { ...(cookie ? { cookie } : {}) } });
  async function register(email) {
    const r = await post('/api/auth/register', { email, password: 'secreto1' });
    const cookie = cookieOf(r);
    const db = dbOpen();
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    db.close();
    return { cookie, uid: u && u.id, status: r.status };
  }
  async function upload(cookie, buf, type) {
    const r = await fetch(BASE + '/api/album/photo', { method: 'POST', headers: { 'content-type': type, cookie }, body: buf });
    return { status: r.status, body: await J(r) };
  }
  function seedPost(uid, o) {
    const db = dbOpen();
    const info = db.prepare(`INSERT INTO posts (user_id, caption, image_path, media_type, status, scheduled_at, source, client_photo, approval, created_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(uid, o.caption || 'Semilla', o.image || '/media/seed.jpg', o.media || 'image', o.status || 'scheduled', o.at, o.source || 'trial', o.client ? 1 : 0, o.approval || 'pending');
    db.close();
    return Number(info.lastInsertRowid);
  }
  function postRow(id) { const db = dbOpen(); const r = db.prepare('SELECT * FROM posts WHERE id = ?').get(id); db.close(); return r; }
  function postsOf(uid) { const db = dbOpen(); const r = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id').all(uid); db.close(); return r; }

  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) { try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {} if (!up) await new Promise((r) => setTimeout(r, 1000)); }
    t('C0 server booteó (v1017)', up, log.slice(-300));
    if (!up) return;
    const v = await (await fetch(BASE + '/api/version')).json();
    t('C0b /api/version = v1017', has(JSON.stringify(v), 'v1017'), JSON.stringify(v).slice(0, 120));

    // --- Usuario 1: guardar, postear con caption propio, cadencia ---
    const PNG_A = pngDeColor('red'), PNG_B = pngDeColor('green'), PNG_C = pngDeColor('blue');
    const u1 = await register('subir-u1@example.com');
    t('C1 register u1', u1.status === 200 && !!u1.uid, 'status ' + u1.status);
    const up1 = await upload(u1.cookie, PNG_A, 'image/png');
    t('C2 subida de foto al material', up1.status === 200 && up1.body.ok && !!up1.body.id, JSON.stringify(up1.body).slice(0, 160));
    const rGuard = await J(await post('/api/subir/resolver', { asset_id: up1.body.id, cuando: 'guardar' }, u1.cookie));
    t('C3 «Solo guardarlo»: modo guardado, sin posteo, sin fecha', rGuard.ok && rGuard.modo === 'guardado' && !rGuard.scheduled_at && postsOf(u1.uid).length === 0, JSON.stringify(rGuard).slice(0, 160));
    {
      const db = dbOpen(); const a = db.prepare('SELECT upload_choice FROM assets WHERE id = ?').get(up1.body.id); db.close();
      t('C3b el asset quedó con upload_choice=guardar', !!a && a.upload_choice === 'guardar', JSON.stringify(a));
    }
    const up2 = await upload(u1.cookie, PNG_B, 'image/png');
    const rPost = await J(await post('/api/subir/resolver', { asset_id: up2.body.id, cuando: 'semana', caption_modo: 'mio', caption_text: 'Mi caption propio ✓', mejora: 'no' }, u1.cookie));
    t('C4 «encargate de todo» con caption propio: posteo creado', rPost.ok && rPost.modo === 'posteado' && !!rPost.post_id, JSON.stringify(rPost).slice(0, 200));
    const p1 = rPost.post_id ? postRow(rPost.post_id) : null;
    t('C5 el posteo: source=subir, caption exacto, draft, marca Nuevo, día seteado', !!p1 && p1.source === 'subir' && p1.caption === 'Mi caption propio ✓' && p1.status === 'draft' && Number(p1.subir_nuevo) === 1 && !!p1.scheduled_at, JSON.stringify(p1).slice(0, 220));
    const diaP1 = p1 ? ymdIn(new Date(p1.scheduled_at)) : '';
    const up3 = await upload(u1.cookie, PNG_C, 'image/png');
    const rPost2 = await J(await post('/api/subir/resolver', { asset_id: up3.body.id, cuando: 'semana', caption_modo: 'mio', caption_text: 'Segundo subido', mejora: 'si' }, u1.cookie));
    const p2 = rPost2.post_id ? postRow(rPost2.post_id) : null;
    t('C6 segunda subida el mismo día: cae en OTRO día (nunca dos por día)', !!p2 && !rPost2.repetido && ymdIn(new Date(p2.scheduled_at)) !== diaP1, `p1=${diaP1} p2=${p2 && ymdIn(new Date(p2.scheduled_at))} repetido=${rPost2.repetido}`);
    {
      const db = dbOpen(); const a3 = db.prepare('SELECT file_path FROM assets WHERE id = ?').get(up3.body.id); db.close();
      t('C7 mejora sin clave de IA: fail-soft — posteo en su lugar, foto original intacta, mejora_aplicada=false', !!p2 && rPost2.mejora_aplicada === false && !!a3 && p2.image_path === a3.file_path, `mejora=${rPost2.mejora_aplicada} img=${p2 && p2.image_path} asset=${a3 && a3.file_path}`);
    }
    {
      const rows = postsOf(u1.uid).filter((p) => p.scheduled_at && p.media_type !== 'story');
      const days = rows.map((p) => ymdIn(new Date(p.scheduled_at)));
      t('C8 invariante global u1: ningún día con dos posteos', new Set(days).size === days.length, JSON.stringify(days));
    }
    const rVisto = await J(await post('/api/posts/' + rPost.post_id + '/visto', {}, u1.cookie));
    t('C9 /visto apaga la marca Nuevo', rVisto.ok && Number(postRow(rPost.post_id).subir_nuevo) === 0);

    // --- Hilo de la tira ---
    const pid = rPost.post_id;
    const rLog = await J(await post('/api/chat/hilo/log', { post_id: pid, user_text: 'cambiá la foto', assistant_text: 'Listo, la cambié ✓' }, u1.cookie));
    const hiloPost = await J(await get('/api/chat/hilo?post_id=' + pid, u1.cookie));
    t('C10 hilo del posteo: el par vive bajo el posteo, en orden', rLog.ok && hiloPost.ok && hiloPost.messages.length === 2 && hiloPost.messages[0].text === 'cambiá la foto' && hiloPost.messages[1].role === 'assistant', JSON.stringify(hiloPost).slice(0, 200));
    await post('/api/chat/hilo/log', { semana: 1, user_text: 'esta semana empujá las promos', assistant_text: 'Dale, lo ordeno en la semana ✓' }, u1.cookie);
    const hiloSem = await J(await get('/api/chat/hilo?semana=1', u1.cookie));
    const hiloPost2 = await J(await get('/api/chat/hilo?post_id=' + pid, u1.cookie));
    t('C11 hilo de la semana separado del del posteo (sin mezcla)', hiloSem.messages.length === 2 && hiloSem.messages[0].text.includes('promos') && hiloPost2.messages.length === 2, `sem=${hiloSem.messages.length} post=${hiloPost2.messages.length}`);
    {
      const db = dbOpen();
      db.prepare(`INSERT INTO chat_messages (user_id, role, text, post_id, hilo) VALUES (?, 'user', 'historial viejo', 0, '')`).run(u1.uid);
      db.close();
      const hiloSem2 = await J(await get('/api/chat/hilo?semana=1', u1.cookie));
      t('C12 el historial legado (hilo vacío) NO entra en la tira de la semana', hiloSem2.messages.length === 2, `n=${hiloSem2.messages.length}`);
    }
    const rHiloOtro = await get('/api/chat/hilo?post_id=' + pid, (await register('subir-ajeno@example.com')).cookie);
    t('C13 el hilo de un posteo ajeno no se lee (404)', rHiloOtro.status === 404, 'status ' + rHiloOtro.status);

    // --- Promo sin IA: error honesto, cero efectos ---
    const u2 = await register('subir-u2@example.com');
    const occDay = shift(todayK, 1);
    const occId = seedPost(u2.uid, { at: at19(occDay), source: 'trial', client: 0, caption: 'Posteo de Posty' });
    const upP = await upload(u2.cookie, PNG, 'image/png');
    const rPromo = await post('/api/subir/resolver', { asset_id: upP.body.id, cuando: 'semana', promo: '2x1', caption_modo: 'posty', mejora: 'no' }, u2.cookie);
    const jPromo = await J(rPromo);
    t('C14 caption de Posty sin clave: 400 honesto, sin posteo y SIN desplazar nada', rPromo.status === 400 && !jPromo.ok && postsOf(u2.uid).length === 1 && postRow(occId).scheduled_at === at19(occDay), `status=${rPromo.status} posts=${postsOf(u2.uid).length}`);

    // --- Cadencia: desplazamiento dentro de la semana ---
    const mon = mondayOf(todayK), sun = sundayOf(todayK);
    const restDays = [];
    for (let k = todayK; k <= sun; k = shift(k, 1)) restDays.push(k);
    const mf = restDays.filter((k) => dow(k) >= 1 && dow(k) <= 5 && k > todayK);
    if (mf.length >= 2) {
      const D = mf[0], F = mf[1];
      const u3 = await register('subir-u3@example.com');
      // bloquear hoy y los días entre D y F con posteos DEL CLIENTE (no desplazables)
      for (const k of restDays) { if (k !== D && k !== F) seedPost(u3.uid, { at: at19(k), source: 'album-armado', client: 1, caption: 'Del cliente' }); }
      const occ3 = seedPost(u3.uid, { at: at19(D), source: 'trial', client: 0, caption: 'De Posty', status: 'scheduled' });
      const upD = await upload(u3.cookie, PNG, 'image/png');
      const rD = await J(await post('/api/subir/resolver', { asset_id: upD.body.id, cuando: 'semana', caption_modo: 'mio', caption_text: 'Subido de la semana', mejora: 'no' }, u3.cookie));
      const item = rD.post_id ? postRow(rD.post_id) : null;
      const occAfter = postRow(occ3);
      t('C15 desplazamiento: el subido toma el día ocupado por Posty y el de Posty pasa al día libre (misma hora, mismo estado)', !!item && ymdIn(new Date(item.scheduled_at)) === D && !!rD.desplazado && occAfter.scheduled_at === at19(F) && occAfter.status === 'scheduled', `item=${item && ymdIn(new Date(item.scheduled_at))} occ=${occAfter && occAfter.scheduled_at} desp=${JSON.stringify(rD.desplazado)}`);
      const rows3 = postsOf(u3.uid).filter((p) => p.scheduled_at);
      const days3 = rows3.map((p) => ymdIn(new Date(p.scheduled_at)));
      t('C15b invariante u3: un posteo por día tras el desplazamiento', new Set(days3).size === days3.length, JSON.stringify(days3));
    } else {
      console.log('  · C15 omitido: la semana no tiene 2 días hábiles por delante (corre el lunes)');
      t('C15 (rama) semana sin días hábiles: se acepta la omisión declarada', true);
    }

    // --- Desplazamiento en la semana siguiente (corre siempre): esta
    // semana está llena de posteos del cliente; la siguiente tiene un
    // posteo de Posty el lunes, el martes bloqueado por el cliente y el
    // miércoles libre → el subido toma el lunes y el de Posty pasa al
    // miércoles, y la respuesta lo cuenta (desplazado + semana_siguiente).
    {
      const u3b = await register('subir-u3b@example.com');
      for (const k of restDays) seedPost(u3b.uid, { at: at19(k), source: 'album-armado', client: 1, caption: 'Del cliente' });
      const nMon = shift(sun, 1), nTue = shift(sun, 2), nWed = shift(sun, 3);
      for (let k = shift(sun, 4); k <= shift(sun, 7); k = shift(k, 1)) seedPost(u3b.uid, { at: at19(k), source: 'album-armado', client: 1, caption: 'Del cliente' });
      seedPost(u3b.uid, { at: at19(nTue), source: 'album-armado', client: 1, caption: 'Del cliente' });
      const occB = seedPost(u3b.uid, { at: at19(nMon), source: 'trial', client: 0, caption: 'De Posty', status: 'scheduled' });
      const upB = await upload(u3b.cookie, PNG_A, 'image/png');
      const rB = await J(await post('/api/subir/resolver', { asset_id: upB.body.id, cuando: 'semana', caption_modo: 'mio', caption_text: 'Subido sin lugar esta semana', mejora: 'no' }, u3b.cookie));
      const itemB = rB.post_id ? postRow(rB.post_id) : null;
      const occBAfter = postRow(occB);
      t('C15b desplazamiento en la semana siguiente: el subido toma el lunes y el de Posty pasa al miércoles libre', !!itemB && rB.semana_siguiente === true && ymdIn(new Date(itemB.scheduled_at)) === nMon && !!rB.desplazado && occBAfter.scheduled_at === at19(nWed) && occBAfter.status === 'scheduled', `item=${itemB && ymdIn(new Date(itemB.scheduled_at))} occ=${occBAfter && occBAfter.scheduled_at} nMon=${nMon} nWed=${nWed}`);
      const rowsB = postsOf(u3b.uid).filter((p) => p.scheduled_at);
      const daysB = rowsB.map((p) => ymdIn(new Date(p.scheduled_at)));
      t('C15c invariante u3b: un posteo por día tras el desplazamiento', new Set(daysB).size === daysB.length, JSON.stringify(daysB));
    }

    // --- Semana llena de subidos del cliente: semana siguiente ---
    const u4 = await register('subir-u4@example.com');
    for (const k of restDays) seedPost(u4.uid, { at: at19(k), source: 'album-armado', client: 1, caption: 'Del cliente' });
    const upF = await upload(u4.cookie, PNG, 'image/png');
    const rF = await J(await post('/api/subir/resolver', { asset_id: upF.body.id, cuando: 'semana', caption_modo: 'mio', caption_text: 'Sin lugar esta semana', mejora: 'no' }, u4.cookie));
    const pF = rF.post_id ? postRow(rF.post_id) : null;
    t('C16 semana llena: el ítem va a la semana siguiente y la respuesta lo dice', !!pF && rF.semana_siguiente === true && ymdIn(new Date(pF.scheduled_at)) > sun, `dia=${pF && ymdIn(new Date(pF.scheduled_at))} sun=${sun}`);

    // --- Video sin clave: error honesto, cero efectos ---
    let mp4 = null;
    try {
      mp4 = path.join(tmpDir, 'tiny.mp4');
      execSync(`ffmpeg -y -v error -f lavfi -i color=c=black:s=320x240:d=1 -f lavfi -i sine=frequency=440:d=1 -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac "${mp4}"`);
    } catch (e) { mp4 = null; }
    if (mp4) {
      const u5 = await register('subir-u5@example.com');
      const upV = await upload(u5.cookie, fs.readFileSync(mp4), 'video/mp4');
      t('C17 subida de video al material', upV.status === 200 && upV.body.ok && upV.body.kind === 'video', JSON.stringify(upV.body).slice(0, 160));
      if (upV.body && upV.body.id) {
        const rV = await post('/api/subir/resolver', { asset_id: upV.body.id, cuando: 'posty', caption_modo: 'mio', caption_text: 'Mi video', subs: 'si' }, u5.cookie);
        t('C18 video sin clave de IA: error honesto y ningún posteo creado', rV.status === 400 && postsOf(u5.uid).length === 0, 'status ' + rV.status);
      }
    } else {
      console.log('  · C17/C18 omitidos: ffmpeg no disponible');
      t('C17 (rama) ffmpeg ausente: omisión declarada', true);
    }

    // --- Invitado: las rutas de su circuito siguen vivas ---
    const rChatRuta = await get('/api/ideas/chat');
    t('C19 la ruta del chat del invitado sigue existiendo (401 sin sesión, no 404)', rChatRuta.status !== 404, 'status ' + rChatRuta.status);
  } finally {
    try { process.kill(srv.pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    try { process.kill(srv.pid, 'SIGKILL'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\nRELEASE: ${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
