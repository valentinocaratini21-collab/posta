// test-lote-carril-expres.js — CARRIL EXPRÉS (decisión Valentino 9/11 ~03:03).
// El cliente manda una foto o un video por el chat; Posty le pone el
// caption (foto) o lo edita/mejora (video) y lo publica EL MISMO DÍA
// cuando el cliente lo acepta con un toque («Publicar hoy» en la
// tarjeta del chat). Sin confirmación de las 9:00, sin aviso de 30 min
// y sin cupo: el posteo diario de Posty sigue su curso (los dos pueden
// salir el mismo día) y el video del cliente no toca el video semanal.
// El carril exprés es APARTE del flujo de la semana: el contenido del
// cliente se publica tal cual, con caption/edición de Posty.
// Parte A: estática (pins + marcadores server.js/app.js/generator.js).
// Parte B: cliente en vm con stubs (tarjeta exprés/semana, video,
// «Publicar hoy», armar exprés). Parte D: boot real de server.js en
// DATA_DIR temporal + HTTP (cookie de sesión) + conteo directo en
// posta.db. Sin clave OpenAI en el boot: /api/express/armar responde
// 400 sin-ia (el endpoint se alcanza; el armar con modelo real lo
// hace el preparador con el surrogado, como en el Lote A).
// Uso: node test-lote-carril-expres.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');
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
const genSrc = fs.readFileSync(path.join(DIR, 'generator.js'), 'utf8');
const schSrc = fs.readFileSync(path.join(DIR, 'scheduler.js'), 'utf8');

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
function reFrom(src, re) {
  const m = src.match(re);
  return m ? m[0] : null;
}

// ---------- Parte A: estática ----------
function parteA() {
  console.log('— A) estática: pins y marcadores del lote —');
  check('A0 BUILD v846 en server.js (estampado)', srvSrc.includes("const BUILD_ID = '20261105-v846';"));
  // §1 server.js — los dos endpoints nuevos
  check('A1 existe POST /api/express/armar', srvSrc.includes("app.post('/api/express/armar'"));
  check('A1b existe POST /api/express/:id/publicar', srvSrc.includes("app.post('/api/express/:id/publicar'"));
  check('A1c /api/express/armar arma la foto con albumPropuesta', srvSrc.includes("const prop = await albumPropuesta(uid, asset.id, '', vision);"));
  check('A1d /api/express/armar arma el video con buildClientVideoReelPost', srvSrc.includes("buildClientVideoReelPost(uid, full, 'express', over)"));
  check('A1e el reel exprés es tipo expres (no reel) y sin week_key', srvSrc.includes("tipo='expres'") && srvSrc.includes("week_key=NULL"));
  check('A1f /api/express/armar no duplica (ya_armado)', srvSrc.includes("ya_armado: true"));
  check('A1g publicar solo acepta express o album-armado', srvSrc.includes("post.source !== 'express' && post.source !== 'album-armado'") && srvSrc.includes("error: 'no_expres'"));
  check('A1h publicar frena en revisión y en checklist dura', srvSrc.includes("error: 'in_review'") && srvSrc.includes("error: 'checklist_bloqueado'"));
  check('A1i publicar no pasa por 9:00 ni 30 min (llama directo a publishSinglePost, como publish-now)', srvSrc.includes("publishSinglePost(db, { ...post, status: 'publishing' }).catch((e) => console.error('[express-publicar]:', e.message));"));
  // §2 server.js — el exprés no toca el posteo diario ni el cupo
  check('A2 quotaCounts excluye express', srvSrc.includes("AND COALESCE(source,'') != 'express'"));
  check('A2b ritualPublicadoHoy excluye express', srvSrc.includes("AND COALESCE(source,'') != 'express' AND (published_at IS NOT NULL"));
  check('A2c ensureTodayPost paso 2 excluye express', srvSrc.includes("AND COALESCE(source,'') != 'express'\n          AND COALESCE(user_stopped, 0) = 0"));
  check('A2d el cerebro no publica el exprés con cupo (chat publishes)', srvSrc.includes("post.source === 'express'") && srvSrc.includes('// (CARRIL EXPRÉS) El posteo exprés no consume cupo'));
  check('A2e publish-now salta el cupo para el exprés', srvSrc.includes("if (post.source !== 'express' && !['scheduled', 'publishing', 'published'].includes(post.status))"));
  check('A2f al pasar a la semana deja de ser exprés (2 ramas del PATCH)', (srvSrc.match(/Al pasar a un día de la semana deja de ser exprés|Al programarse en la semana deja de ser exprés/g) || []).length === 2);
  check('A2g cleanDrafts marca el exprés para el cerebro', srvSrc.includes("express: r.source === 'express'"));
  // §3 scheduler y ritual NO se tocan (el carril es aparte)
  check('A3 processDuePosts sigue sin filtro de source', schSrc.includes('function processDuePosts') && !schSrc.includes('express'));
  check('A3b autopilotPreNotify sigue intacto', schSrc.includes('function autopilotPreNotify') && !schSrc.includes('express'));
  check('A3c processApprovalNotifications sigue intacto', schSrc.includes('function processApprovalNotifications') && !schSrc.includes('express'));
  // §4 app.js — funciones nuevas y tarjeta
  for (const f of ['async function pzSftChatArmarExpres(', 'async function pzSftChatPublicarHoy(', 'function pzSftChatMarcarPublicadoHoy(']) {
    check('A4 existe ' + f.replace('async function ', '').replace('function ', '').replace('(', ''), appSrc.includes(f), f);
  }
  check('A4b la tarjeta tiene «Publicar hoy» primero', appSrc.includes('onclick="pzSftChatPublicarHoy(${pid})"') && appSrc.includes('Publicar hoy'));
  check('A4c la tarjeta exprés NO muestra «Sale así»', appSrc.includes("const saleAsiBtn = prop.expres ? '' :"));
  check('A4d la tarjeta exprés dice «Sale hoy cuando lo aceptes»', appSrc.includes('Sale hoy cuando lo aceptes'));
  check('A4e el video se muestra como <video> con portada (no <img> roto)', appSrc.includes('<video class="pz-sft-img"') && appSrc.includes('poster="${esc(prop.thumb)}"'));
  check('A4f el fallback arma exprés cuando no hay hueco libre', appSrc.includes('/No encontré un (día|hueco) libre/i') && appSrc.includes('pzSftChatArmarExpres(it)'));
  check('A4g «Aprobar todas» saltea lo ya publicado hoy', appSrc.includes("it.choice === 'expres'"));
  // §5 generator.js — el cerebro ve y entiende el exprés
  check('A5 el cerebro marca el borrador EXPRÉS en la lista', genSrc.includes("· EXPRÉS (foto/video del cliente para HOY)"));
  check('A5b el cerebro sabe que el exprés sale hoy y no se programa solo', genSrc.includes('Si un borrador dice EXPRÉS') && genSrc.includes('NO lo programes en la semana por tu cuenta'));
}

// ---------- Parte B: cliente en vm ----------
function extractClient() {
  const parts = [];
  const escSrc = reFrom(appSrc, /const esc = \(s\) =>[^\n]+/);
  if (!escSrc) return { error: 'falta esc' };
  parts.push(escSrc);
  const enSrc = reFrom(appSrc, /function pzSftEn\(\) \{[^\n]+\n/);
  if (!enSrc) return { error: 'falta pzSftEn' };
  parts.push(enSrc);
  for (const sig of [
    'async function pzSftChatArmarExpres(', 'async function pzSftChatPublicarHoy(',
    'function pzSftChatMarcarPublicadoHoy(', 'function pzSftChatTarjetaArmada(',
    'var PZ_SFT_ARMADOS = {};', 'var PZ_SFT_ARMADO_ACTUAL = null;',
    'var PZ_SFT_CHAT_PENDIENTE = null;',
  ]) {
    const s = sig.startsWith('var ') ? (appSrc.includes(sig) ? sig : null) : fnFrom(appSrc, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  return { code: parts.join('\n') };
}

function mkCardCtx(extra) {
  const cards = [];
  const els = {
    chatBox: { insertAdjacentHTML: (pos, html) => { cards.push(html); } },
  };
  const ctx = {
    ME: { lang: 'es' }, console,
    PZ_SFT_CHAT_PENDIENTE: null,
    pzSftChatDecir: () => {},
    pzSftChatBotones: () => '',
    chatScroll: () => {},
    document: {
      getElementById: (id) => els[id] || null,
      createElement: () => ({ innerHTML: '', style: {}, dataset: {} }),
      body: {},
    },
    ...(extra || {}),
  };
  ctx._cards = cards;
  ctx._els = els;
  return ctx;
}

async function parteB() {
  console.log('— B) cliente: tarjeta exprés, video, «Publicar hoy», armar exprés —');
  const loaded = extractClient();
  check('B0 se extraen las funciones del cliente', !loaded.error, loaded.error || '');
  if (loaded.error) return;

  // B1: tarjeta exprés (foto): «Publicar hoy» primero, sin «Sale así», cuando = hoy.
  {
    const ctx = mkCardCtx();
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const prop = { assetId: 11, postId: 101, scheduled_at: null, dia: '', dia_label: '', hora: '', semana_llena: false, caption: 'Mi café de hoy ☕', headline: '', hashtags: '#cafe', kind: 'photo', image_path: '/media/c1.png', thumb: '', expres: true };
    vm.runInContext('pzSftChatTarjetaArmada(' + JSON.stringify(prop) + ')', ctx);
    const card = ctx._cards.join('\n');
    check('B1 la tarjeta exprés tiene «Publicar hoy» con el postId', card.includes('Publicar hoy') && card.includes('onclick="pzSftChatPublicarHoy(101)"'), card.slice(0, 300));
    check('B1b la tarjeta exprés NO tiene «Sale así»', !card.includes('Sale así'), card.slice(0, 300));
    check('B1c la tarjeta exprés dice cuándo sale', card.includes('Sale hoy cuando lo aceptes'), card.slice(0, 300));
    check('B1d la tarjeta exprés trae la foto y el caption', card.includes('/media/c1.png') && card.includes('Mi café de hoy'), card.slice(0, 300));
    check('B1e la tarjeta exprés sigue con Cambiar día / Otra foto, sin Cambiar texto (v846)', !card.includes('Cambiar texto') && card.includes('Cambiar día') && card.includes('Otra foto'), card.slice(0, 300));
  }

  // B2: tarjeta de semana (no exprés): «Publicar hoy» Y «Sale así».
  {
    const ctx = mkCardCtx();
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const prop = { assetId: 11, postId: 102, scheduled_at: '2026-11-10T22:00:00.000Z', dia: '2026-11-10', dia_label: 'martes 10/11', hora: '19:00', semana_llena: false, caption: 'Posteo de la semana.', headline: '', hashtags: '', kind: 'photo', image_path: '/media/c1.png', thumb: '', expres: false };
    vm.runInContext('pzSftChatTarjetaArmada(' + JSON.stringify(prop) + ')', ctx);
    const card = ctx._cards.join('\n');
    check('B2 la tarjeta de semana tiene «Publicar hoy» y «Sale así»', card.includes('Publicar hoy') && card.includes('Sale así') && card.includes('onclick="pzSftChatAprobar(this, 102)"'), card.slice(0, 300));
    check('B2b la tarjeta de semana dice el día', card.includes('Sale el martes 10/11 a las 19:00'), card.slice(0, 300));
  }

  // B3: tarjeta de video: <video> con portada, nunca <img> con el mp4.
  {
    const ctx = mkCardCtx();
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const prop = { assetId: 12, postId: 103, scheduled_at: null, dia: '', dia_label: '', hora: '', semana_llena: false, caption: 'Mi video de hoy.', headline: '', hashtags: '', kind: 'video', image_path: '/media/v1.mp4', thumb: '/media/v1-thumb.jpg', expres: true };
    vm.runInContext('pzSftChatTarjetaArmada(' + JSON.stringify(prop) + ')', ctx);
    const card = ctx._cards.join('\n');
    check('B3 la tarjeta de video usa <video> con su portada', card.includes('<video class="pz-sft-img"') && card.includes('src="/media/v1.mp4"') && card.includes('poster="/media/v1-thumb.jpg"'), card.slice(0, 300));
    check('B3b la tarjeta de video no tiene <img> con el mp4', !card.includes('<img class="pz-sft-img"'), card.slice(0, 300));
    check('B3c la tarjeta de video no tiene «Otra foto»', !card.includes('Otra foto'), card.slice(0, 300));
  }

  // B4: «Publicar hoy» llama al endpoint exprés, espera la publicación y marca la tarjeta.
  {
    const calls = [];
    const row = { innerHTML: '' };
    const cuandoEl = { innerHTML: '' };
    const toasts = [];
    const ctx = mkCardCtx({
      PROFILE: { ig_connected: true },
      api: {
        post: async (url, body) => { calls.push(['POST', url]); return { ok: true, status: 'publishing' }; },
        get: async (url) => { calls.push(['GET', url]); return { ok: true, post: { status: 'published', ig_permalink: 'https://www.instagram.com/p/demo_x/' } }; },
      },
      toast: (t) => { toasts.push(t); },
      render: () => {},
      setTimeout: (fn) => { fn(); return 0; },
    });
    ctx._els['pzSftCardBtns-42'] = row;
    ctx._els['pzSftCard-42'] = { querySelector: (sel) => sel === '.pz-sft-cuando' ? cuandoEl : null };
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    vm.runInContext('PZ_SFT_ARMADOS[42] = { postId: 42, assetId: 7 }; PZ_SFT_ARMADO_ACTUAL = PZ_SFT_ARMADOS[42];', ctx);
    await vm.runInContext('pzSftChatPublicarHoy(42)', ctx);
    check('B4 «Publicar hoy» POSTea a /api/express/42/publicar', calls.some((c) => c[0] === 'POST' && c[1] === '/api/express/42/publicar'), JSON.stringify(calls));
    check('B4b «Publicar hoy» consulta el estado hasta verlo publicado', calls.some((c) => c[0] === 'GET' && c[1] === '/api/posts/42'), JSON.stringify(calls));
    check('B4c la tarjeta queda «¡Publicado hoy!» con link a Instagram', row.innerHTML.includes('¡Publicado hoy!') && row.innerHTML.includes('https://www.instagram.com/p/demo_x/') && row.innerHTML.includes('Ver en Instagram'), row.innerHTML.slice(0, 300));
    check('B4d se avisa con el toast de hoy', toasts.some((t) => String(t).includes('¡Ya salió hoy!')), toasts.join(' | '));
    check('B4e la línea de «cuándo» queda en pasado («Salió hoy»)', cuandoEl.innerHTML.includes('Salió hoy'), cuandoEl.innerHTML);
  }

  // B5: armar exprés devuelve la prop con expres:true y sin fecha.
  {
    const ctx = mkCardCtx({
      pzSftAsegurarAssetTmp: async () => true,
      api: {
        post: async (url, body) => {
          if (url !== '/api/express/armar') throw new Error('url inesperada: ' + url);
          if (body.asset_id !== 11) throw new Error('asset_id inesperado: ' + body.asset_id);
          return { ok: true, post_id: 99, caption: 'Caption exprés.', headline: '', hashtags: '#cafe', kind: 'photo', image_path: '/media/c1.png', thumb: '', expres: true };
        },
      },
    });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const r = await vm.runInContext('pzSftChatArmarExpres({ assetId: 11, url: "/media/c1.png", vision: "" })', ctx);
    check('B5 armar exprés devuelve la prop exprés', r && r.prop && r.prop.postId === 99 && r.prop.expres === true, JSON.stringify(r));
    check('B5b la prop exprés no tiene fecha de semana', r && r.prop && r.prop.scheduled_at === null && r.prop.dia === '', JSON.stringify(r && r.prop));
  }
}

// ---------- Parte D: boot real ----------
const PORT = 34581;
const TEST_KEY = 'boot-test-key-carril-expres';
const ADMIN_TOKEN = 'test-admin-token';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carril-expres-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
for (const f of ['c1.png', 'c2.png']) fs.writeFileSync(path.join(mediaDir, f), PNG_1X1);
try { execFileSync('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '3', path.join(mediaDir, 'v1.mp4'), '-y'], { stdio: 'ignore' }); } catch (e) { console.log('ffmpeg no disponible para el video de prueba:', e.message); }

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
function postRow(dbPath, id) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return db.prepare('SELECT id, status, scheduled_at, source, media_type, tipo, week_key, published_at, ig_permalink, error FROM posts WHERE id = ?').get(id); }
  finally { try { db.close(); } catch (e) {} }
}
// Fecha BA (UTC-3): como ISO UTC de las 19:00 BA.
function baIso(daysAhead) {
  const now = new Date();
  const ba = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = ba.getUTCFullYear(), m = ba.getUTCMonth(), d = ba.getUTCDate() + daysAhead;
  return new Date(Date.UTC(y, m, d, 22, 0, 0)).toISOString();
}
function baYmd(daysAhead) {
  return baIso(daysAhead).slice(0, 10);
}
async function waitPublished(dbPath, id, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const row = postRow(dbPath, id);
    if (row && row.status === 'published') return row;
    if (row && (row.status === 'failed' || row.status === 'cancelled' || row.status === 'paused')) return row;
    await sleep(500);
  }
  return postRow(dbPath, id);
}

async function parteD() {
  console.log('— D) boot real: publicar hoy, no reemplaza el diario, sin cupo, sin 9:00/30 min —');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, ADMIN_TOKEN,
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    check('D0 el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await reqJson('GET', '/api/version');
    check('D0b /api/version trae el BUILD v846 (estampado)', ver.status === 200 && ver.json && ver.json.build === '20261105-v846', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    check('D0c la DB del boot existe en el DATA_DIR temporal', fs.existsSync(dbPath));
    check('D0d el video de prueba existe para el checklist', fs.existsSync(path.join(mediaDir, 'v1.mp4')));

    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'join', ig: 'carril-expres-test', device: 'test-device-expres' });
    check('D0e join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const uid = join.json.user_id;
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';

    // Semilla 1: SOLO un borrador exprés creado hoy (sin posteo programado
    // hoy). ensureTodayPost NO debe agarrarlo como posteo del día.
    let a1 = 0, a2 = 0, a3 = 0, a4 = 0, d1 = 0, d2 = 0, d3 = 0, d4 = 0, d5 = 0, d6 = 0, d7 = 0, d8 = 0, d11 = 0;
    seedDb(dbPath, (db) => {
      db.prepare(`UPDATE users SET is_guest = 0 WHERE id = ?`).run(uid);
      a1 = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/c1.png', 'photo', '').lastInsertRowid);
      a2 = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/v1.mp4', 'video', '').lastInsertRowid);
      a3 = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/c2.png', 'photo', '').lastInsertRowid);
      a4 = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/c2.png', 'photo', '').lastInsertRowid);
      d6 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, client_photo, tipo, foto_asset_id) VALUES (?,?,?,?, 'draft', 'image', 'express', 1, 'foto', ?)`).run(uid, '/media/c1.png', 'Exprés de hoy (no es el diario)', '', a1).lastInsertRowid);
    });
    check('D0f semilla 1 ok (3 fotos + 1 video + borrador exprés)', a1 > 0 && a2 > 0 && a3 > 0 && a4 > 0 && d6 > 0, `a=${a1},${a2},${a3},${a4} d6=${d6}`);

    // D1: ensureTodayPost paso 2 NO agarra el borrador exprés (hoy queda vacío, honesto).
    const hoyVacio = await reqJson('GET', '/api/ritual/hoy', null, cookie);
    check('D1 ritual/hoy sin posteo programado responde ok', hoyVacio.status === 200 && hoyVacio.json && hoyVacio.json.ok === true, JSON.stringify(hoyVacio.json).slice(0, 300));
    check('D1b hoy queda vacío (el exprés no es el posteo del día)', hoyVacio.json && hoyVacio.json.hoy === null, JSON.stringify(hoyVacio.json).slice(0, 300));
    const row6 = postRow(dbPath, d6);
    check('D1c el borrador exprés sigue en draft y sin fecha', row6 && row6.status === 'draft' && !row6.scheduled_at, JSON.stringify(row6));

    // Semilla 2: el posteo diario de hoy (programado 19:00 BA) + el resto.
    seedDb(dbPath, (db) => {
      d5 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, scheduled_at) VALUES (?,?,?,?, 'scheduled', 'image', '', ?)`).run(uid, '/media/c1.png', 'Posteo diario de hoy', '', baIso(0)).lastInsertRowid);
      d1 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, client_photo, tipo, foto_asset_id) VALUES (?,?,?,?, 'draft', 'image', 'express', 1, 'foto', ?)`).run(uid, '/media/c1.png', 'Foto exprés del cliente', '', a1).lastInsertRowid);
      d2 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, client_photo, tipo, foto_asset_id) VALUES (?,?,?,?, 'draft', 'video', 'express', 1, 'expres', ?)`).run(uid, '/media/v1.mp4', 'Video exprés del cliente', '', a2).lastInsertRowid);
      d3 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source) VALUES (?,?,?,?, 'draft', 'image', '')`).run(uid, '/media/c2.png', 'Borrador de la semana (Posty)', '').lastInsertRowid);
      d4 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, client_photo, tipo, foto_asset_id, scheduled_at) VALUES (?,?,?,?, 'scheduled', 'image', 'album-armado', 1, 'foto', ?, ?)`).run(uid, '/media/c2.png', 'Foto del cliente armada en semana', '', a3, baIso(1)).lastInsertRowid);
      d7 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, client_photo, tipo, foto_asset_id, needs_review) VALUES (?,?,?,?, 'draft', 'image', 'express', 1, 'foto', ?, 1)`).run(uid, '/media/c1.png', 'Exprés en revisión', '', a1).lastInsertRowid);
      d8 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, client_photo, tipo, foto_asset_id) VALUES (?,?,?,?, 'draft', 'image', 'express', 1, 'foto', ?)`).run(uid, '/media/no-existe.png', 'Exprés sin archivo', '', a1).lastInsertRowid);
      d11 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, client_photo, tipo, foto_asset_id) VALUES (?,?,?,?, 'draft', 'image', 'express', 1, 'foto', ?)`).run(uid, '/media/c2.png', 'Exprés ya armado', '', a3).lastInsertRowid);
    });
    check('D2 semilla 2 ok (diario + exprés foto/video + semana + album-armado + revisión + sin-archivo)', d5 > 0 && d1 > 0 && d2 > 0 && d3 > 0 && d4 > 0 && d7 > 0 && d8 > 0 && d11 > 0, `d=${d5},${d1},${d2},${d3},${d4},${d7},${d8},${d11}`);

    // D3: el posteo diario de hoy es el de hoy (ritual lo recomienda).
    const hoyConDiario = await reqJson('GET', '/api/ritual/hoy', null, cookie);
    check('D3 ritual/hoy recomienda el posteo diario', hoyConDiario.status === 200 && hoyConDiario.json && hoyConDiario.json.recomendada && hoyConDiario.json.recomendada.imagen === '/media/c1.png', JSON.stringify(hoyConDiario.json).slice(0, 300));

    // D4: cupo antes de publicar (el diario hoy + el album-armado de mañana = 2 fotos; reels 0).
    const q0 = await reqJson('GET', '/api/quota', null, cookie);
    check('D4 cupo inicial: 2 fotos usadas (el diario + el album-armado), 0 reels', q0.status === 200 && q0.json && q0.json.used === 2 && q0.json.reels && q0.json.reels.used === 0, JSON.stringify(q0.json));

    // D5: publicar la foto exprés → sale HOY en demo.
    const pub1 = await reqJson('POST', `/api/express/${d1}/publicar`, {}, cookie);
    check('D5 publicar la foto exprés responde ok', pub1.status === 200 && pub1.json && pub1.json.ok === true && pub1.json.status === 'publishing', JSON.stringify(pub1.json));
    const row1 = await waitPublished(dbPath, d1, 20000);
    check('D5b la foto exprés quedó publicada HOY', row1 && row1.status === 'published' && String(row1.published_at || '').slice(0, 10) === baYmd(0), JSON.stringify(row1));
    check('D5c la foto exprés tiene permalink de demo', row1 && String(row1.ig_permalink || '').startsWith('https://www.instagram.com/p/demo_'), JSON.stringify(row1));

    // D6: el posteo diario SIGUE su curso (no lo reemplaza el exprés).
    const est = await reqJson('GET', '/api/ritual/estado', null, cookie);
    check('D6 el día NO se marca publicado por el exprés (publicado_hoy=false)', est.status === 200 && est.json && est.json.publicado_hoy === false, JSON.stringify(est.json));
    check('D6b el diario sigue siendo el recomendado de hoy', est.status === 200 && est.json && est.json.tiene_hoy === true && Number(est.json.recomendado_id) === d5, JSON.stringify(est.json));
    const hoyDespues = await reqJson('GET', '/api/ritual/hoy', null, cookie);
    check('D6c ritual/hoy sigue recomendando el diario tras el exprés', hoyDespues.status === 200 && hoyDespues.json && hoyDespues.json.recomendada && hoyDespues.json.recomendada.imagen === '/media/c1.png', JSON.stringify(hoyDespues.json).slice(0, 300));

    // D7: el cupo NO se movió con la foto exprés.
    const q1 = await reqJson('GET', '/api/quota', null, cookie);
    check('D7 el cupo de fotos no se movió con la foto exprés', q1.status === 200 && q1.json && q1.json.used === 2, JSON.stringify(q1.json));

    // D8: publicar el video exprés → sale HOY y no consume el video semanal.
    const pub2 = await reqJson('POST', `/api/express/${d2}/publicar`, {}, cookie);
    check('D8 publicar el video exprés responde ok', pub2.status === 200 && pub2.json && pub2.json.ok === true, JSON.stringify(pub2.json));
    const row2 = await waitPublished(dbPath, d2, 20000);
    check('D8b el video exprés quedó publicado HOY', row2 && row2.status === 'published' && String(row2.published_at || '').slice(0, 10) === baYmd(0), JSON.stringify(row2));
    check('D8c el video exprés tiene permalink de reel de demo', row2 && String(row2.ig_permalink || '').startsWith('https://www.instagram.com/reel/demo_'), JSON.stringify(row2));
    const q2 = await reqJson('GET', '/api/quota', null, cookie);
    check('D8d el cupo de reels no se movió con el video exprés', q2.status === 200 && q2.json && q2.json.reels && q2.json.reels.used === 0, JSON.stringify(q2.json));

    // D9: un borrador de la semana NO entra por el carril exprés.
    const pub3 = await reqJson('POST', `/api/express/${d3}/publicar`, {}, cookie);
    check('D9 publicar un borrador de la semana es 403 no_expres', pub3.status === 403 && pub3.json && pub3.json.error === 'no_expres', JSON.stringify(pub3.json));
    const row3 = postRow(dbPath, d3);
    check('D9b el borrador de la semana sigue en draft', row3 && row3.status === 'draft', JSON.stringify(row3));

    // D10: la foto del cliente armada en semana (album-armado) SÍ sale hoy por el carril.
    const pub4 = await reqJson('POST', `/api/express/${d4}/publicar`, {}, cookie);
    check('D10 publicar el album-armado responde ok', pub4.status === 200 && pub4.json && pub4.json.ok === true, JSON.stringify(pub4.json));
    const row4 = await waitPublished(dbPath, d4, 20000);
    check('D10b el album-armado quedó publicado HOY', row4 && row4.status === 'published' && String(row4.published_at || '').slice(0, 10) === baYmd(0), JSON.stringify(row4));
    const q2b = await reqJson('GET', '/api/quota', null, cookie);
    check('D10c al salir por el carril, el album-armado deja de contar cupo (queda solo el diario)', q2b.status === 200 && q2b.json && q2b.json.used === 1, JSON.stringify(q2b.json));

    // D11: en revisión frena con 403 in_review.
    const pub7 = await reqJson('POST', `/api/express/${d7}/publicar`, {}, cookie);
    check('D11 publicar un exprés en revisión es 403 in_review', pub7.status === 403 && pub7.json && pub7.json.error === 'in_review', JSON.stringify(pub7.json));

    // D12: sin archivo, la publicación no sale (se pausa, no se publica).
    const pub8 = await reqJson('POST', `/api/express/${d8}/publicar`, {}, cookie);
    check('D12 publicar un exprés sin archivo responde ok (se encola)', pub8.status === 200 && pub8.json && pub8.json.ok === true, JSON.stringify(pub8.json));
    const row8 = await waitPublished(dbPath, d8, 20000);
    check('D12b el exprés sin archivo queda en pausa, NO publicado', row8 && row8.status === 'paused', JSON.stringify(row8));

    // D13: armar no duplica (ya_armado devuelve el exprés existente).
    const armDup = await reqJson('POST', '/api/express/armar', { asset_id: a3, vision: '' }, cookie);
    check('D13 armar el mismo asset devuelve ya_armado con el post existente', armDup.status === 200 && armDup.json && armDup.json.ok === true && armDup.json.ya_armado === true && Number(armDup.json.post_id) === d11, JSON.stringify(armDup.json));

    // D14: armar sin clave OpenAI responde 400 sin-ia (el endpoint se alcanza).
    const arm = await reqJson('POST', '/api/express/armar', { asset_id: a4, vision: '' }, cookie);
    check('D14 armar sin IA responde 400 sin-ia', arm.status === 400 && arm.json && arm.json.error === 'sin-ia', JSON.stringify(arm.json));

    // D15: publicar un posteo inexistente es 404.
    const pub404 = await reqJson('POST', '/api/express/999999/publicar', {}, cookie);
    check('D15 publicar un posteo inexistente es 404', pub404.status === 404, JSON.stringify(pub404.json));

    // D16: mover un exprés a la semana lo convierte en posteo normal.
    let d9 = 0;
    seedDb(dbPath, (db) => {
      d9 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, client_photo, tipo, foto_asset_id) VALUES (?,?,?,?, 'draft', 'image', 'express', 1, 'foto', ?)`).run(uid, '/media/c1.png', 'Exprés que pasa a la semana', '', a1).lastInsertRowid);
    });
    const mv = await reqJson('PATCH', `/api/posts/${d9}`, { action: 'save-draft', scheduled_at: baIso(3) }, cookie);
    check('D16 mover el exprés a un día libre responde ok', mv.status === 200 && mv.json && mv.json.ok === true, JSON.stringify(mv.json));
    const row9 = postRow(dbPath, d9);
    check('D16b tras mover, el posteo ya NO es exprés (source vacío) y tiene fecha', row9 && (row9.source === '' || row9.source === null) && String(row9.scheduled_at || '').slice(0, 10) === baYmd(3), JSON.stringify(row9));
    check('D16c tras mover, el posteo sigue en draft', row9 && row9.status === 'draft', JSON.stringify(row9));

    // D17: con el cupo de fotos lleno, publish-now de un exprés pasa igual.
    seedDb(dbPath, (db) => {
      for (let k = 1; k <= 6; k++) {
        db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, scheduled_at) VALUES (?,?,?,?, 'scheduled', 'image', '', ?)`).run(uid, '/media/c2.png', 'Semana llena ' + k, '', baIso(k));
      }
    });
    const q3 = await reqJson('GET', '/api/quota', null, cookie);
    check('D17 cupo de fotos lleno (7/7) antes del publish-now exprés', q3.status === 200 && q3.json && q3.json.used === 7 && q3.json.left === 0, JSON.stringify(q3.json));
    let d10 = 0;
    seedDb(dbPath, (db) => {
      d10 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, client_photo, tipo, foto_asset_id) VALUES (?,?,?,?, 'draft', 'image', 'express', 1, 'foto', ?)`).run(uid, '/media/c1.png', 'Exprés con cupo lleno', '', a1).lastInsertRowid);
    });
    const pn = await reqJson('POST', `/api/posts/${d10}/publish-now`, {}, cookie);
    check('D17b publish-now del exprés con cupo lleno responde 200', pn.status === 200 && pn.json && pn.json.ok === true, JSON.stringify(pn.json));
    const row10 = await waitPublished(dbPath, d10, 20000);
    check('D17c el exprés con cupo lleno quedó publicado HOY', row10 && row10.status === 'published' && String(row10.published_at || '').slice(0, 10) === baYmd(0), JSON.stringify(row10));
    const q4 = await reqJson('GET', '/api/quota', null, cookie);
    check('D17d el cupo sigue en 7/7 tras publicar el exprés', q4.status === 200 && q4.json && q4.json.used === 7, JSON.stringify(q4.json));
  } catch (e) {
    console.log('error de la parte D:', e.message);
    fail++;
  } finally {
    kill();
    await sleep(500);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  parteA();
  await parteB();
  await parteD();
  console.log(`\ntest-lote-carril-expres: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
