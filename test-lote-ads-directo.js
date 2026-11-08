// test-lote-ads-directo.js — LOTE ADS-DIRECTO v759 (mock v4 APROBADO por
// Valentino 7/11 «si. va asi. subilo»). Pantalla Ads directa: billetera
// visible con «↓ Cargar $20» + carga automática con regla visible, montos
// $20/$50/$100 en UNA fila sin cortes a mitad de palabra, posteo
// PUBLICADO más reciente destacado y pre-seleccionado, botón «Feed» con
// grilla de los posteos publicados del feed, «Impulsar con $20 · 7 días»
// en 1 toque cuando todo está pre-seleccionado. El buscador de v750 queda
// reemplazado por la grilla. (LOTE ADS-SOLO-PUBLICADOS: el posteo de hoy
// programado ya no es el destacado ni entra en la grilla — solo
// publicados; la carta de Estrategia sigue con su recomendación.)
// Sin gastar nada real (Meta sin conectar): la automática solo se
// prende con tarjeta guardada verificada, y la ruta auto NUNCA cobra.
// Base v766 (BUILD v766, CHUNK_V v764, app.js?v=505; este lote toca
// chunk-analisis.js y app.js).
// Parte A: boot real de server.js en DATA_DIR temporal + HTTP (registro
// + cookie de sesión) + siembra directa en posta.db. Parte B: módulos
// reales (ads-billetera.js con better-sqlite3 en memoria). Parte C: VM
// con DOM falso sobre las funciones nuevas del chunk.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-directo.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ab = require(path.join(__dirname, 'ads-billetera.js'));

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const ana = fs.readFileSync(path.join(DIR, 'public/chunk-analisis.js'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
const abSrc = fs.readFileSync(path.join(DIR, 'ads-billetera.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- 0. Censo base v766 (sin cambio) ----------
console.log('— 0) censo base v766 —');
check('server: BUILD v773', srv.includes("const BUILD_ID = '20261105-v774'"));
check('app: CHUNK_V v764', app.includes("const CHUNK_V = '20261105-v764'"));
check('styles.css md5 v789 (subir-foto-directa: stroke:#fff; antes 4020c974 v772)', md5(css) === 'ac345bb8908b2a430517a8aa05ea9c2d');
check('censo server: catsMatch 3', cnt(srv, 'catsMatch') === 3);
check('censo server: week-redo 16', cnt(srv, 'week-redo') === 16);
check('censo server: first_week 3', cnt(srv, 'first_week') === 3);
check('censo server: /aprobar 17', cnt(srv, '/aprobar') === 17);
check('censo server: INSERT INTO chat_messages 28', cnt(srv, 'INSERT INTO chat_messages') === 28);
check('censo server: divertToConcierge 4', cnt(srv, 'divertToConcierge') === 4);
check('carta Estrategia intacta: anaBilleteraHTML sigue', ana.includes('function anaBilleteraHTML()'));
check('historial intacto: anaBilleteraHistorialHTML sigue', ana.includes('function anaBilleteraHistorialHTML()'));

// ---------- 1. Estático: lo nuevo existe, lo viejo se fue ----------
console.log('— 1) estático: funciones nuevas + buscador fuera + cortes por palabra —');
check('app: adsView monta #adsTabRoot con anaAdsTabHTML()', app.includes("id=\"adsTabRoot\"") && app.includes('anaAdsTabHTML()'));
check('app: adsView ya no usa #adsBilleteraBox', cnt(app, 'adsBilleteraBox') === 0);
check('app: adsView sigue cargando el chunk analisis + datos reales', app.includes("await loadChunk('analisis')") && app.includes('anaBilleteraTabDatos()'));
check('chunk: anaAdsDirectoHTML existe (vista principal)', ana.includes('function anaAdsDirectoHTML()'));
check('chunk: anaAdsFeedHTML existe (grilla del feed)', ana.includes('function anaAdsFeedHTML()'));
check('chunk: anaAdsTabHTML existe (despachador vista principal/grilla)', ana.includes('function anaAdsTabHTML()'));
check('chunk: anaCortarCaption existe (corte por palabra)', ana.includes('function anaCortarCaption('));
check('chunk: anaAdsRutaImpulsar existe (decisión 1 toque / chat / cargar)', ana.includes('function anaAdsRutaImpulsar('));
check('chunk: anaAdsElegirFeed existe (elegir desde la grilla)', ana.includes('function anaAdsElegirFeed('));
check('chunk: anaAdsAbrirFeed / anaAdsCerrarFeed existen', ana.includes('function anaAdsAbrirFeed(') && ana.includes('function anaAdsCerrarFeed('));
check('chunk: anaBilleteraAutoToggle existe (prender/apagar automática)', ana.includes('function anaBilleteraAutoToggle('));
check('chunk: anaAdsCargar existe (Cargar con el monto seleccionado)', ana.includes('function anaAdsCargar('));
check('chunk: la carta conserva su buscador (anaBilleteraBuscar)', ana.includes('function anaBilleteraBuscar(') && ana.includes('anaBilleteraBuscar(this.value)'));
check('chunk: la carta conserva sus resultados de búsqueda', ana.includes('function anaBilleteraBusqResHTML()'));
check('chunk: cero slice(0, 120) a mitad de palabra', cnt(ana, 'slice(0, 120)') === 0);
check('chunk: el picker de la carta corta por palabra', sliceFn(ana, 'function anaBilleteraPickerRow(', 'function anaBilleteraQuieroImpulsar(').includes('anaCortarCaption('));
check('chunk: la vista principal tiene UNA fila de montos (ana-ads-montos)', cnt(sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()'), 'ana-ads-montos') === 1);
check('chunk: la vista principal tiene el botón Cargar', sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('Cargar $'));
check('chunk: la vista principal tiene la fila de carga automática', sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('Carga automática'));
check('chunk: la regla de la automática es visible', sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('cuando se acaba, carga $'));
check('chunk: la vista principal tiene el botón Feed', sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('Elegí qué foto del feed impulsar'));
check('chunk: la vista principal tiene Impulsar con monto y días (se compone en runtime; el render se verifica en C3h)', sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('Impulsar con $') && sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('días'));
check('chunk: la tirita de pasos 1 Posteo · 2 Monto · 3 Impulsar', sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('Posteo') && sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('Monto') && sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('Impulsar'));
check('chunk: la grilla es de 3 columnas borde a borde (repeat(3,1fr) + sangrado -14px)', sliceFn(ana, 'function anaAdsFeedHTML()', 'function anaAdsTabHTML()').includes('repeat(3,1fr)') && sliceFn(ana, 'function anaAdsFeedHTML()', 'function anaAdsTabHTML()').includes('margin-left:-14px'));
check('chunk: el tab ya no pinta #adsBilleteraBox', cnt(ana, "getElementById('adsBilleteraBox')") === 0);
check('chunk: el tab pinta #adsTabRoot', ana.includes("getElementById('adsTabRoot')"));
check('server: 14 rutas /api/ads (12 + feed + auto)', cnt(srv, "app.get('/api/ads") + cnt(srv, "app.post('/api/ads") === 14);
check('server: GET /api/ads/billetera/feed existe', srv.includes("app.get('/api/ads/billetera/feed'"));
check('server: POST /api/ads/billetera/auto existe', srv.includes("app.post('/api/ads/billetera/auto'"));
check('server: el GET billetera devuelve auto_topup + tiene_tarjeta', srv.includes('auto_topup') && srv.includes('tiene_tarjeta'));
check('server: la ruta auto NUNCA cobra (sin paymentIntents.create ni débito)', !sliceFn(srv, "app.post('/api/ads/billetera/auto'", "app.get('/api/ads/billetera/feed'").includes('paymentIntents.create') && !sliceFn(srv, "app.post('/api/ads/billetera/auto'", "app.get('/api/ads/billetera/feed'").includes('adWalletMove'));
check('server: el endpoint hoy corta el caption por palabra', srv.includes('adsBilletera.cortarCaption('));
check('server: slice(0, 90) baja de 8 a 7 (el de hoy ya no corta a mitad de palabra)', cnt(srv, 'slice(0, 90)') === 7);
check('ads-billetera: cortarCaption exportado', typeof ab.cortarCaption === 'function');
check('ads-billetera: feedParaAds exportado', typeof ab.feedParaAds === 'function');
check('ads-billetera: getAutoTopup / setAutoTopup exportados', typeof ab.getAutoTopup === 'function' && typeof ab.setAutoTopup === 'function');
check('ads-billetera: elegibles ya no corta con slice(0, 90)', cnt(abSrc, 'slice(0, 90)') === 0);
check('db: ad_wallets tiene columna auto_topup en el CREATE', dbjs.includes('auto_topup INTEGER NOT NULL DEFAULT 0'));
check('db: migración ALTER TABLE ad_wallets ADD COLUMN auto_topup', dbjs.includes('ALTER TABLE ad_wallets ADD COLUMN auto_topup'));

// ---------- Parte A: servidor real (boot + HTTP) ----------
const PORT = 34563;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-directo-boot-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';

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

// Siembra con reintentos: el servidor tiene su propia conexión abierta.
function seedDb(dbPath, fn) {
  let lastErr = null;
  for (let i = 0; i < 10; i++) {
    try {
      const wdb = new DatabaseSync(dbPath);
      try { fn(wdb); } finally { wdb.close(); }
      return true;
    } catch (e) { lastErr = e; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  throw lastErr;
}

async function parteA() {
  console.log('— A) servidor: feed con TODOS los posteos + auto sin tarjeta no se prende + nada cobra nada —');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), ADMIN_TOKEN: 'boot-test-token-ads-directo',
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: 'boot-test-key-ads-directo',
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
    check('A0 el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await reqJson('GET', '/api/version');
    check('A0b /api/version trae el BUILD v773', ver.status === 200 && ver.json && ver.json.build === '20261105-v774', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    check('A0c la DB del boot existe en el DATA_DIR temporal', fs.existsSync(dbPath));

    // Sin sesión: 401 en los dos endpoints nuevos.
    const feedNoAuth = await reqJson('GET', '/api/ads/billetera/feed');
    check('A1 feed sin sesión → 401', feedNoAuth.status === 401, String(feedNoAuth.status));
    const autoNoAuth = await reqJson('POST', '/api/ads/billetera/auto', { on: true });
    check('A1b auto sin sesión → 401', autoNoAuth.status === 401, String(autoNoAuth.status));

    // Registro → sesión.
    const reg = await reqJson('POST', '/api/auth/register', { email: 'ads-directo@test.local', password: 'secreta123' });
    check('A2 registro crea la cuenta', reg.status === 200 && reg.json && reg.json.ok === true, JSON.stringify(reg.json));
    const cookie = reg.setCookie ? String(reg.setCookie).split(';')[0] : '';
    check('A2b el registro deja cookie de sesión', !!cookie);

    // Usuario + 13 publicados con ig_media_id (fotos distintas), 1
    // programado (el de hoy), 1 borrador, 1 publicado sin ig_media_id,
    // 1 publicado con boost activo.
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    const uid = ro.prepare('SELECT id FROM users WHERE email = ?').get('ads-directo@test.local').id;
    ro.close();
    seedDb(dbPath, (wdb) => {
      const ins = wdb.prepare('INSERT INTO posts (user_id, image_path, caption, status, published_at, ig_media_id, scheduled_at) VALUES (?,?,?,?,?,?,?)');
      for (let i = 1; i <= 13; i++) {
        ins.run(uid, `/media/feed-${i}.jpg`, `Posteo ${i} del feed con un caption largo que habla del producto real del negocio y de la promo de la semana`, 'published', `2026-11-0${(i % 7) + 1}T17:00:00`, `ig_${1000 + i}`, null);
      }
      ins.run(uid, '/media/hoy-521.jpg', 'El posteo de hoy, programado para salir a las 17:00 con el producto destacado de la semana', 'scheduled', null, '', '2026-11-07T17:00:00');
      ins.run(uid, '/media/borrador.jpg', 'Borrador sin publicar', 'draft', null, '', null);
      ins.run(uid, '/media/sin-ig.jpg', 'Publicado pero sin ig_media_id', 'published', '2026-11-07T12:00:00', '', null);
      const boostedId = wdb.prepare("SELECT id FROM posts WHERE user_id = ? AND image_path = '/media/feed-3.jpg'").get(uid).id;
      wdb.prepare("INSERT INTO ad_boosts (user_id, post_id, ig_media_id, budget_cents, status) VALUES (?,?,?,?, 'active')").run(uid, boostedId, 'ig_1003', 2000);
    });

    const feed = await reqJson('GET', '/api/ads/billetera/feed', null, cookie);
    check('A3 feed → 200 con ok', feed.status === 200 && feed.json && feed.json.ok === true, JSON.stringify(feed.json));
    const posts = (feed.json && feed.json.posts) || [];
    check('A3b feed trae TODOS los publicados con ig_media_id: 13 (ni el borrador, ni el programado, ni el sin ig)', posts.length === 13, 'n=' + posts.length);
    check('A3c total declarado = 13', feed.json && feed.json.total === 13);
    const imgs = posts.map((p) => p.image_path);
    check('A3d las 13 fotos son distintas (sin repetir celda exacta)', new Set(imgs).size === 13, imgs.join(','));
    check('A3e ningún caption trae «?»', posts.every((p) => !(p.caption || '').includes('?')));
    const boosted = posts.find((p) => p.image_path === '/media/feed-3.jpg');
    check('A3f el posteo con boost activo trae ya_impulsado true', boosted && boosted.ya_impulsado === true, JSON.stringify(boosted));
    check('A3g los demás traen ya_impulsado false', posts.filter((p) => p.image_path !== '/media/feed-3.jpg').every((p) => p.ya_impulsado === false));
    check('A3h el feed viene ordenado por publicado desc', posts.every((p, i) => i === 0 || (posts[i - 1].published_at || '') >= (p.published_at || '')));

    const bil = await reqJson('GET', '/api/ads/billetera', null, cookie);
    check('A4 billetera → 200 con ok', bil.status === 200 && bil.json && bil.json.ok === true, JSON.stringify(bil.json));
    check('A4b billetera trae auto_topup = 0 por defecto', bil.json && bil.json.auto_topup === 0, JSON.stringify(bil.json && bil.json.auto_topup));
    check('A4c billetera trae tiene_tarjeta = false (sin cliente Stripe)', bil.json && bil.json.tiene_tarjeta === false, JSON.stringify(bil.json && bil.json.tiene_tarjeta));

    // Automática: sin tarjeta guardada NO se prende (permiso explícito
    // + con qué cobrar). Apagarla siempre se puede.
    const autoOn = await reqJson('POST', '/api/ads/billetera/auto', { on: true }, cookie);
    check('A5 auto ON sin cliente Stripe → 409 sin_cliente_stripe', autoOn.status === 409 && autoOn.json && autoOn.json.motivo === 'sin_cliente_stripe', JSON.stringify(autoOn.json));
    const bil2 = await reqJson('GET', '/api/ads/billetera', null, cookie);
    check('A5b tras el rechazo, auto_topup sigue en 0', bil2.json && bil2.json.auto_topup === 0);
    const autoBad = await reqJson('POST', '/api/ads/billetera/auto', { on: 'si' }, cookie);
    check('A5c auto con valor no booleano → 400', autoBad.status === 400, String(autoBad.status));
    const autoOff = await reqJson('POST', '/api/ads/billetera/auto', { on: false }, cookie);
    check('A5d auto OFF → 200 con auto_topup 0', autoOff.status === 200 && autoOff.json && autoOff.json.ok === true && autoOff.json.auto_topup === 0, JSON.stringify(autoOff.json));

    // Nada cobró nada: ni transacciones ni saldo ni boosts nuevos.
    const ro2 = new DatabaseSync(dbPath, { readOnly: true });
    const nTx = ro2.prepare('SELECT COUNT(*) AS c FROM ad_transactions').get().c;
    const wal = ro2.prepare('SELECT balance_cents FROM ad_wallets WHERE user_id = ?').get(uid);
    const nBoosts = ro2.prepare('SELECT COUNT(*) AS c FROM ad_boosts WHERE user_id = ?').get(uid).c;
    ro2.close();
    check('A6 ni una transacción en ad_transactions (nada cobró nada)', nTx === 0, 'n=' + nTx);
    check('A6b saldo de la billetera intacto en 0', wal && wal.balance_cents === 0, JSON.stringify(wal));
    check('A6c sin boosts nuevos (solo el sembrado)', nBoosts === 1, 'n=' + nBoosts);
  } finally {
    kill();
    await sleep(300);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------- Parte B: módulo ads-billetera.js (in-memory) ----------
function parteB() {
  console.log('— B) módulo: cortarCaption + feedParaAds + auto_topup —');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, image_path TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', published_at TEXT, ig_media_id TEXT DEFAULT '', scheduled_at TEXT);
  CREATE TABLE ad_boosts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER, ig_media_id TEXT NOT NULL DEFAULT '', budget_cents INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending');
  CREATE TABLE ad_wallets (user_id INTEGER PRIMARY KEY, balance_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'ARS', auto_topup INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);

  // cortarCaption: por palabra, nunca a mitad.
  check('B1 corto no se toca', ab.cortarCaption('hola posty', 90) === 'hola posty');
  check('B1b largo corta en el límite de palabra + …', ab.cortarCaption('cappuccino con leche espumada y arte latte', 20) === 'cappuccino con leche…');
  check('B1c sin espacio corta duro + …', ab.cortarCaption('supercalifragilistico', 10) === 'supercalif…');
  check('B1d exacto en el límite no se toca', ab.cortarCaption('1234567890', 10) === '1234567890');
  check('B1e vacío → vacío', ab.cortarCaption('', 90) === '');
  check('B1f null → vacío', ab.cortarCaption(null, 90) === '');

  // feedParaAds: todos los publicados con ig_media_id, con flag.
  const ins = db.prepare('INSERT INTO posts (user_id, image_path, caption, status, published_at, ig_media_id) VALUES (?,?,?,?,?,?)');
  for (let i = 1; i <= 13; i++) {
    ins.run(7, `/f${i}.jpg`, `Posteo ${i} con un caption largo que habla del producto real del negocio y de la promo de la semana`, 'published', `2026-11-0${(i % 7) + 1}T17:00:00`, `ig_${i}`);
  }
  ins.run(7, '/hoy.jpg', 'El de hoy', 'scheduled', null, '');
  ins.run(7, '/draft.jpg', 'Borrador', 'draft', null, '');
  ins.run(7, '/sinig.jpg', 'Sin ig', 'published', '2026-11-07T12:00:00', '');
  const id3 = db.prepare("SELECT id FROM posts WHERE image_path = '/f3.jpg'").get().id;
  db.prepare("INSERT INTO ad_boosts (user_id, post_id, ig_media_id, status) VALUES (7, ?, 'ig_3', 'active')").run(id3);
  const id5 = db.prepare("SELECT id FROM posts WHERE image_path = '/f5.jpg'").get().id;
  db.prepare("INSERT INTO ad_boosts (user_id, post_id, ig_media_id, status) VALUES (7, ?, 'ig_5', 'pending')").run(id5);
  const id6 = db.prepare("SELECT id FROM posts WHERE image_path = '/f6.jpg'").get().id;
  db.prepare("INSERT INTO ad_boosts (user_id, post_id, ig_media_id, status) VALUES (7, ?, 'ig_6', 'cancelled')").run(id6);
  const rows = db.prepare('SELECT * FROM posts').all();
  const impulsados = new Set(db.prepare("SELECT post_id FROM ad_boosts WHERE status IN ('pending','active')").all().map((r) => r.post_id));
  const feed = ab.feedParaAds(rows, impulsados);
  check('B2 feedParaAds trae los 13 publicados con ig', feed.length === 13, 'n=' + feed.length);
  check('B2b fotos distintas', new Set(feed.map((p) => p.image_path)).size === 13);
  check('B2c active → ya_impulsado', feed.find((p) => p.image_path === '/f3.jpg').ya_impulsado === true);
  check('B2d pending → ya_impulsado', feed.find((p) => p.image_path === '/f5.jpg').ya_impulsado === true);
  check('B2e cancelled → NO ya_impulsado', feed.find((p) => p.image_path === '/f6.jpg').ya_impulsado === false);
  check('B2f ningún caption supera 91 caracteres', feed.every((p) => (p.caption || '').length <= 91));
  check('B2g el caption largo trae … al final', feed.find((p) => p.image_path === '/f1.jpg').caption.endsWith('…'));

  // elegiblesParaAds: caption por palabra (el bug de v750).
  const elig = ab.elegiblesParaAds(rows, null, impulsados);
  check('B3 elegibles trae 11 (13 publicados menos 2 con pauta activa/pendiente)', elig.length === 11, 'n=' + elig.length);
  check('B3b el caption de elegibles termina en … (corte por palabra)', elig[0].caption.endsWith('…'));
  check('B3c ningún caption termina a mitad de palabra sin …', elig.every((p) => p.caption.length <= 91));

  // auto_topup: persiste, por defecto 0.
  check('B4 getAutoTopup sin fila → 0', ab.getAutoTopup(db, 7) === 0);
  check('B4b setAutoTopup(1) persiste', ab.setAutoTopup(db, 7, 1) === 1 && ab.getAutoTopup(db, 7) === 1);
  check('B4c setAutoTopup(0) apaga', ab.setAutoTopup(db, 7, 0) === 0 && ab.getAutoTopup(db, 7) === 0);
  check('B4d setAutoTopup con valor raro → 0 (fail-closed)', ab.setAutoTopup(db, 7, 'si') === 0 && ab.getAutoTopup(db, 7) === 0);
  db.close();
}

// ---------- Parte C: VM sobre el chunk ----------
function parteC() {
  console.log('— C) VM: renders del tab + ruta de impulsar en 1 toque —');
  const runVm = (prelude, code) => {
    const ctx = vm.createContext({
      console,
      anaT: (es) => es,
      esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      document: { getElementById: () => null },
      api: { post: async () => ({ ok: true }), get: async () => ({ ok: true }) },
    });
    vm.runInContext(prelude + '\n' + code, ctx);
    return ctx.__out;
  };
  const srcCortar = sliceFn(ana, 'function anaCortarCaption(', 'function anaBilleteraPickerRow(');
  const srcConstruir = sliceFn(ana, 'function anaBilleteraConstruirDatos(', 'async function anaBilleteraTabDatos(');
  // (LOTE AGREGAR-TARJETA) La vista principal llama a anaTarjetaBtnHTML:
  // el render en VM la necesita cargada o aborta con ReferenceError.
  const srcTarjeta = sliceFn(ana, 'function anaTarjetaBtnHTML(', 'function anaCargarSinTarjeta(');
  const srcHistorial = sliceFn(ana, 'function anaBilleteraHistorialHTML()', 'function anaBilleteraHistorialPintar()');
  const srcDirecto = sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()');
  const srcFeed = sliceFn(ana, 'function anaAdsFeedHTML()', 'function anaAdsTabHTML()');
  const srcRuta = sliceFn(ana, 'function anaAdsRutaImpulsar(', 'async function anaBilleteraImpulsar(');
  check('C0 funciones extraídas del chunk', srcCortar.length > 50 && srcConstruir.length > 100 && srcDirecto.length > 500 && srcFeed.length > 300 && srcRuta.length > 100 && srcHistorial.length > 100 && srcTarjeta.length > 100,
    [srcCortar.length, srcConstruir.length, srcDirecto.length, srcFeed.length, srcRuta.length, srcHistorial.length, srcTarjeta.length].join('/'));
  if (!(srcCortar.length > 50 && srcDirecto.length > 500 && srcFeed.length > 300 && srcRuta.length > 100 && srcTarjeta.length > 100)) {
    console.log('  (C1–C5 se saltan: falta código nuevo en el chunk)');
    return;
  }

  // C1: cortarCaption en el cliente (espejo del servidor).
  const c1 = runVm(srcCortar, "__out = [anaCortarCaption('cappuccino con leche espumada y arte latte', 20), anaCortarCaption('hola', 90), anaCortarCaption('supercalifragilistico', 10)];");
  check('C1 cortarCaption corta por palabra en el cliente', Array.isArray(c1) && c1[0] === 'cappuccino con leche…' && c1[1] === 'hola' && c1[2] === 'supercalif…', JSON.stringify(c1));

  // C2: el destacado por defecto es el publicado más reciente (519),
  // aunque haya posteo de hoy (521). El hoy programado nunca es el
  // destacado (LOTE ADS-SOLO-PUBLICADOS).
  const fakeF = (hoy, mejor) => ({
    d: { ok: true, mejor: mejor || null, boostHabilitado: false, ads_permiso: null, conversion_pendiente: true },
    bil: { ok: true, saldo: 0, moneda: 'USD', montos: [20, 50, 100], dias: 7, movimientos: [], boostHabilitado: false, ads_permiso: null, conversion_pendiente: true, auto_topup: 0, tiene_tarjeta: false, balance_cents: 0, currency: 'USD', montos_usd: [20, 50, 100] },
    elig: { ok: true, elegibles: [
      { post_id: 519, caption: 'El mejor de la semana', image_path: '/519.jpg' },
      { post_id: 518, caption: 'Otro posteo', image_path: '/518.jpg' },
    ] },
    hoy: hoy ? { ok: true, hoy: { post_id: 521, caption: 'El posteo de hoy con el producto destacado de la semana', image_path: '/hoy.jpg', programado_para: '2026-11-07T17:00:00', hora: '17:00' } } : { ok: true, hoy: null },
    feed: { ok: true, total: 2, posts: [
      { post_id: 519, caption: 'El mejor de la semana', image_path: '/519.jpg', ya_impulsado: false },
      { post_id: 518, caption: 'Otro posteo', image_path: '/518.jpg', ya_impulsado: false },
    ] },
  });
  const c2a = runVm(srcConstruir, "__out = anaBilleteraConstruirDatos(" + JSON.stringify(fakeF(true, { post_id: 519 })) + ", null, true);");
  check('C2 con posteo de hoy, el destacado es el publicado más reciente (519), no el de hoy (521)', c2a && c2a.selId === 519 && c2a.selPost && c2a.selPost.post_id === 519, JSON.stringify(c2a && c2a.selId));
  const c2b = runVm(srcConstruir, "__out = anaBilleteraConstruirDatos(" + JSON.stringify(fakeF(false, { post_id: 519 })) + ", null, true);");
  check('C2b sin posteo de hoy, el destacado sigue siendo el más reciente (519)', c2b && c2b.selId === 519, JSON.stringify(c2b && c2b.selId));
  const c2c = runVm(srcConstruir, "__out = anaBilleteraConstruirDatos(" + JSON.stringify(fakeF(true, { post_id: 519 })) + ", { selId: 518, selMonto: 50, selPost: { post_id: 518, caption: 'Otro posteo', image_path: '/518.jpg' } }, true);");
  check('C2c con selección previa, se respeta (518, $50)', c2c && c2c.selId === 518 && c2c.selMonto === 50, JSON.stringify(c2c && [c2c.selId, c2c.selMonto]));
  const c2d = runVm(srcConstruir, "__out = anaBilleteraConstruirDatos(" + JSON.stringify(fakeF(true, { post_id: 519 })) + ", null, true);");
  check('C2d los datos traen el feed y la automática', c2d && Array.isArray(c2d.feed) && c2d.feed.length === 2 && c2d.auto_topup === 0 && c2d.tiene_tarjeta === false, JSON.stringify(c2d && [c2d.feed && c2d.feed.length, c2d.auto_topup]));

  // C3: vista principal con todo pre-seleccionado.
  const datosMain = (auto) => {
    const f = fakeF(true, { post_id: 519 });
    f.bil.auto_topup = auto ? 1 : 0;
    f.bil.tiene_tarjeta = !!auto;
    f.bil.boostHabilitado = false;
    return f;
  };
  const preMain = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcDirecto + '\n' + srcTarjeta + '\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(datosMain(true)) + ', null, true);\n'
    + 'anaBilleteraDatos.boosts = [];\n';
  const hMain = runVm(preMain, '__out = anaAdsDirectoHTML();');
  check('C3 la vista principal renderiza', typeof hMain === 'string' && hMain.length > 500, String(hMain && hMain.length));
  check('C3b botón Cargar con el monto seleccionado ($20)', hMain.includes('Cargar $20'));
  check('C3c montos $20/$50/$100 dentro de UNA fila', (() => { const a = hMain.indexOf('ana-ads-montos'); if (a === -1) return false; const seg = hMain.slice(a, a + 1200); return seg.includes('$20') && seg.includes('$50') && seg.includes('$100'); })());
  check('C3d fila de carga automática con regla visible', hMain.includes('Carga automática') && hMain.includes('cuando se acaba, carga $20 desde tu banco'));
  check('C3e automática prendida se ve prendida (toggle ON)', hMain.includes('data-auto="on"'));
  check('C3f publicado más reciente destacado con su foto y su caption', hMain.includes('/519.jpg') && hMain.includes('El mejor de la semana'));
  check('C3g chip «✦ el que más rindió» en el destacado (519 es el mejor) y cero «Sale hoy»', hMain.includes('✦ el que más rindió') && !hMain.includes('Sale hoy'));
  check('C3h botón Impulsar con monto y 7 días', hMain.includes('Impulsar con $20') && hMain.includes('7 días'));
  check('C3i botón Feed a la grilla', hMain.includes('Elegí qué foto del feed impulsar'));
  check('C3j sin buscador en la vista principal (la grilla lo reemplaza)', !hMain.includes('anaBilleteraBuscar') && !hMain.includes('anaBoostRecBusq') && !hMain.includes('type="search"'));
  check('C3k sin «?» de placeholder en la vista principal', !hMain.includes('>?</') && !hMain.includes('> ? <'));
  check('C3l el micro honesto «Posty elige el público y lo gestiona»', hMain.includes('Posty elige el público y lo gestiona'));
  const preMainOff = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcDirecto + '\n' + srcTarjeta + '\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(datosMain(false)) + ', null, true);\n'
    + 'anaBilleteraDatos.boosts = [];\n';
  const hMainOff = runVm(preMainOff, '__out = anaAdsDirectoHTML();');
  check('C3m con automática apagada el toggle se ve apagado', typeof hMainOff === 'string' && hMainOff.includes('data-auto="off"'));
  // (LOTE AGREGAR-TARJETA) Sin tarjeta, la billetera muestra el botón para
  // agregarla; con tarjeta guardada, dice cuál es y es para cambiarla.
  check('C3n sin tarjeta guardada la billetera muestra «Agregar tarjeta»', typeof hMainOff === 'string' && hMainOff.includes('Agregar tarjeta'));
  const fTarj = datosMain(false); fTarj.bil.tarjeta = { tiene: true, brand: 'visa', last4: '4242' };
  const preTarj = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcDirecto + '\n' + srcTarjeta + '\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fTarj) + ', null, true);\n'
    + 'anaBilleteraDatos.boosts = [];\n';
  const hTarj = runVm(preTarj, '__out = anaAdsDirectoHTML();');
  check('C3n2 con tarjeta guardada el botón dice «Cambiar tarjeta •••• 4242»', typeof hTarj === 'string' && hTarj.includes('Cambiar tarjeta') && hTarj.includes('4242'));

  // C4: grilla del feed con TODOS los posteos, sin repetir, con marca.
  const feed13 = [];
  for (let i = 1; i <= 13; i++) feed13.push({ post_id: 500 + i, caption: 'Posteo ' + i, image_path: '/feed-' + i + '.jpg', ya_impulsado: i === 3 });
  const preFeed = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcFeed + '\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(datosMain(true)) + ', null, true);\n'
    + 'anaBilleteraDatos.feed = ' + JSON.stringify(feed13) + ';\n'
    + 'anaBilleteraDatos.selId = 501; anaBilleteraDatos.selPost = { post_id: 501, caption: "Posteo 1", image_path: "/feed-1.jpg" };\n'
    + 'anaBilleteraDatos.vistaFeed = true;\n';
  const hFeed = runVm(preFeed, '__out = anaAdsFeedHTML();');
  check('C4 la grilla renderiza', typeof hFeed === 'string' && hFeed.length > 500, String(hFeed && hFeed.length));
  check('C4b las 13 fotos están en la grilla', feed13.every((p) => hFeed.includes(p.image_path)));
  check('C4c cada foto aparece UNA sola vez (sin repetir celda exacta)', feed13.every((p) => hFeed.split(p.image_path).length - 1 === 1));
  check('C4d el contador dice 13 posteos (solo publicados, sin el de hoy)', hFeed.includes('13 posteos'));
  check('C4e la elegida (501, publicado) lleva borde amarillo + tilde verde', hFeed.includes('/feed-1.jpg') && hFeed.includes('#FEC14D') && hFeed.includes('✓'));
  check('C4f el posteo con ads lleva su marca (ya_impulsado)', hFeed.includes('/feed-3.jpg') && hFeed.includes('Con ads'));
  check('C4f2 el posteo de hoy NO está en la grilla (ni foto ni chip)', !hFeed.includes('/hoy.jpg') && !hFeed.includes('Sale hoy'));
  check('C4g sin «?» de placeholder en la grilla', !hFeed.includes('>?</') && !hFeed.includes('> ? <'));

  // C5: ruta de impulsar — 1 toque con todo pre-seleccionado, chat si no se puede.
  const ruta = (d) => runVm(srcRuta, '__out = anaAdsRutaImpulsar(' + JSON.stringify(d) + ');');
  const base = {
    selId: 519, selPost: { post_id: 519, caption: 'El mejor', image_path: '/519.jpg' },
    selMonto: 20, boostHabilitado: true, auto_topup: 1, tiene_tarjeta: true,
    billetera: { balance_cents: 5000 }, hoy: null,
    elegibles: [{ post_id: 519, caption: 'El mejor', image_path: '/519.jpg' }],
    feed: [{ post_id: 519, caption: 'El mejor', image_path: '/519.jpg', ya_impulsado: false }],
  };
  check('C5a habilitado + publicado + saldo → impulsar (1 toque)', ruta(base).ruta === 'impulsar', JSON.stringify(ruta(base)));
  check('C5b habilitado + publicado + saldo corto + auto ON → cargar_y_impulsar (1 toque)', ruta({ ...base, billetera: { balance_cents: 0 } }).ruta === 'cargar_y_impulsar', JSON.stringify(ruta({ ...base, billetera: { balance_cents: 0 } })));
  check('C5c habilitado + publicado + saldo corto + auto OFF → saldo_insuficiente (2 toques: cargar, impulsar)', ruta({ ...base, billetera: { balance_cents: 0 }, auto_topup: 0 }).ruta === 'saldo_insuficiente', JSON.stringify(ruta({ ...base, billetera: { balance_cents: 0 }, auto_topup: 0 })));
  check('C5d bloqueado (Meta sin conectar) → chat, nunca cobrar', ruta({ ...base, boostHabilitado: false }).ruta === 'chat', JSON.stringify(ruta({ ...base, boostHabilitado: false })));
  check('C5e el posteo de hoy (sin publicar) → chat, nunca impulsar directo', ruta({ ...base, selId: 521, selPost: { post_id: 521, caption: 'Hoy', image_path: '/hoy.jpg' }, hoy: { post_id: 521 } }).ruta === 'chat', JSON.stringify(ruta({ ...base, selId: 521, selPost: { post_id: 521 }, hoy: { post_id: 521 } })));
  check('C5f posteo con ads activos → ya_impulsado', ruta({ ...base, feed: [{ post_id: 519, caption: 'El mejor', image_path: '/519.jpg', ya_impulsado: true }] }).ruta === 'ya_impulsado', JSON.stringify(ruta({ ...base, feed: [{ post_id: 519, ya_impulsado: true }] })));
  check('C5g sin posteo elegido → sin_posteo', ruta({ ...base, selId: 0, selPost: null }).ruta === 'sin_posteo', JSON.stringify(ruta({ ...base, selId: 0, selPost: null })));
}

(async () => {
  try { await parteA(); } catch (e) { console.log('  ❌ Parte A abortada:', e && e.message); fail++; }
  try { parteB(); } catch (e) { console.log('  ❌ Parte B abortada:', e && e.message); fail++; }
  try { parteC(); } catch (e) { console.log('  ❌ Parte C abortada:', e && e.message); fail++; }
  console.log(`\ntest-lote-ads-directo: ${pass} ok, ${fail} mal${fails.length ? ' — ' + fails.slice(0, 12).join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
