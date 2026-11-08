// test-lote-ads-solo-publicados.js — LOTE ADS-SOLO-PUBLICADOS (decisión
// Valentino 7/11 ~17:50, con captura: «en Ads deberían aparecer posteos
// viejos, no los posteos que se vienen»). El tab Ads mostraba como
// destacado y pre-seleccionado el posteo de HOY PROGRAMADO (todavía no
// publicado, chip «Sale hoy · 20:00») y la grilla lo anteponía a los
// publicados; al tocar Impulsar el servidor lo rechazaba con 409
// sin_publicar — el error era el mecanismo que descubría el problema.
// Regla nueva: en Ads solo aparecen posteos PUBLICADOS. El destacado por
// defecto es el publicado más reciente (de /feed, entre los elegibles);
// el de hoy programado no aparece ni como destacado ni en la grilla
// hasta que se publique — en ese momento entra solo como el más reciente.
// La recomendación de Estrategia («El posteo de hoy» + «En cuanto se
// publique, queda listo para impulsar») NO se toca: es un aviso honesto,
// no una selección para gastar. El endpoint /api/ads/billetera/hoy
// tampoco se toca; el gate 409 del servidor queda como respaldo.
// Secundario (misma captura): el ← fijo del shell (pzBackHTML) se
// superponía al título «Billetera» de la tarjeta — el tab Ads ya tiene
// su propio atrás en la cabecera, así que el círculo fijo no va en Ads
// (precedente LOTE 10B·A jardín y LOTE 17 post/dogfood).
// Base v768 (HEAD en vivo al re-basar sobre v768; el lote arrancó sobre v765).
// Sin gastar nada real (Meta sin conectar): el impulso de un publicado
// llega hasta 503 ads_no_configurado.
// Parte A: boot real de server.js en DATA_DIR temporal + HTTP (registro
// + cookie de sesión) + siembra directa en posta.db. Parte B: VM con DOM
// falso sobre las funciones del chunk. Parte C: VM del atrás del shell.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-solo-publicados.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
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
const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const ana = fs.readFileSync(path.join(DIR, 'public/chunk-analisis.js'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- 0. Censo base v766 (sin cambio) ----------
console.log('— 0) censo base v766 —');
check('server: BUILD v789', srv.includes("const BUILD_ID = '20261105-v799'"));
check('app: CHUNK_V v786', app.includes("const CHUNK_V = '20261105-v792'"));
check('styles.css md5 (re-pin nivel-misiones-racha re-base v792: styles del lote; antes v789 subir-foto-directa)', md5(css) === '2589972e11db8b2b393d0eae06e18cf9');
check('index: /app.js?v=527', idx.includes('/app.js?v=527'));
check('server: 14 rutas /api/ads (8 get + 6 post)', cnt(srv, "app.get('/api/ads") + cnt(srv, "app.post('/api/ads") === 14);
check('server: GET /api/ads/billetera/hoy sigue (no se toca)', srv.includes("app.get('/api/ads/billetera/hoy'"));
check('server: gate impulsar 409 sin_publicar sigue (respaldo)', srv.includes("motivo: 'sin_publicar'"));

// ---------- 1. Estático: el hoy sale del tab, la carta queda ----------
console.log('— 1) estático: destacado y grilla solo con publicados; carta intacta; atrás fijo fuera de Ads —');
const sDirecto = sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()');
const sFeed = sliceFn(ana, 'function anaAdsFeedHTML()', 'function anaAdsTabHTML()');
const sElegir = sliceFn(ana, 'function anaAdsElegirFeed(', 'function anaBilleteraAutoToggle(');
const sRuta = sliceFn(ana, 'function anaAdsRutaImpulsar(', 'async function anaBilleteraImpulsar(');
const sCarta = sliceFn(ana, 'function anaBilleteraHTML()', 'function anaBilleteraPickerRow(');
const sBack = sliceFn(app, 'function pzBackHTML(', 'function bbHace(');
check('chunk: «Sale hoy» queda UNA sola vez en todo el chunk: la carta', cnt(ana, 'Sale hoy') === 1, 'n=' + cnt(ana, 'Sale hoy'));
check('chunk: el destacado ya no menciona «Sale hoy»', !sDirecto.includes('Sale hoy'));
check('chunk: el destacado conserva el chip «✦ el que más rindió»', sDirecto.includes('✦ el que más rindió'));
check('chunk: la grilla ya no menciona «Sale hoy»', !sFeed.includes('Sale hoy'));
check('chunk: la grilla ya no antepone el hoy (cero lista.push(hoy))', !sFeed.includes('lista.push(hoy)'));
check('chunk: elegir desde la grilla ya no resucita el hoy (cero esHoy)', !sElegir.includes('esHoy'));
check('chunk: «esHoy» queda solo en la ruta de impulsar (defensa)', cnt(ana, 'esHoy') === 2 && sRuta.includes('esHoy'), 'n=' + cnt(ana, 'esHoy'));
check('chunk: el constructor ya no prefiere el hoy (cero preferHoy / defectoHoy)', !ana.includes('preferHoy') && !ana.includes('defectoHoy'));
check('chunk: el constructor prefiere el publicado más reciente', ana.includes('preferReciente'));
check('chunk: la carta sigue mostrando el posteo de hoy con su chip', sCarta.includes('Sale hoy') && sCarta.includes("El posteo de hoy"));
check('chunk: la carta sigue con su nota honesta de publicación', sCarta.includes('En cuanto se publique, queda listo para impulsar.'));
check('chunk: el endpoint hoy se sigue leyendo para la carta (5 lecturas)', sliceFn(ana, 'async function anaBilleteraFetchDatos()', 'function anaBilleteraConstruirDatos(').includes("'/api/ads/billetera/hoy'"));
check('app: pzBackHTML excluye el tab Ads (sin círculo fijo)', sBack.includes("tab === 'ads'"));
check('app: pzBackDesktopHTML excluye el tab Ads', sliceFn(app, 'function pzBackDesktopHTML(', 'function bbHace(').includes("tab === 'ads'"));
check('app: el tab Ads conserva SU propio atrás en la cabecera', sDirecto.includes('href="#/app/inicio"'));
check('app: la grilla conserva SU propio atrás (cerrar)', sFeed.includes('anaAdsCerrarFeed()'));
check('app: adsView sigue montando #adsTabRoot con anaAdsTabHTML()', app.includes('id="adsTabRoot"') && app.includes('anaAdsTabHTML()'));

// ---------- Parte A: servidor real (boot + HTTP) ----------
const PORT = 34572;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-solo-pub-boot-'));
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
  console.log('— A) servidor: el feed no trae el de hoy; impulsar el de hoy → 409; el publicado llega al gate de Meta —');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), ADMIN_TOKEN: 'boot-test-token-ads-solo-pub',
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: 'boot-test-key-ads-solo-pub',
    DESTACADO_BOOST_ENABLED: '1',
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
    check('A0b /api/version trae el BUILD v789', ver.status === 200 && ver.json && ver.json.build === '20261105-v799', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    check('A0c la DB del boot existe en el DATA_DIR temporal', fs.existsSync(dbPath));

    const reg = await reqJson('POST', '/api/auth/register', { email: 'ads-solo-pub@test.local', password: 'secreta123' });
    check('A1 registro crea la cuenta', reg.status === 200 && reg.json && reg.json.ok === true, JSON.stringify(reg.json));
    const cookie = reg.setCookie ? String(reg.setCookie).split(';')[0] : '';
    check('A1b el registro deja cookie de sesión', !!cookie);

    // 4 publicados con ig_media_id (519 el más reciente, 516 con pauta
    // activa), 1 programado (el de hoy, 521, 20:00), 1 borrador, 1
    // publicado sin ig_media_id.
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    const uid = ro.prepare('SELECT id FROM users WHERE email = ?').get('ads-solo-pub@test.local').id;
    ro.close();
    let id521 = 0, id519 = 0;
    seedDb(dbPath, (wdb) => {
      const ins = wdb.prepare('INSERT INTO posts (user_id, image_path, caption, status, published_at, ig_media_id, scheduled_at) VALUES (?,?,?,?,?,?,?)');
      ins.run(uid, '/media/pub-519.jpg', 'El posteo más reciente, publicado hoy al mediodía', 'published', '2026-11-07T12:00:00', 'ig_519', null);
      ins.run(uid, '/media/pub-518.jpg', 'Posteo de ayer con el producto en la mesa', 'published', '2026-11-06T17:00:00', 'ig_518', null);
      ins.run(uid, '/media/pub-517.jpg', 'Posteo de anteayer, la promo de la semana', 'published', '2026-11-05T17:00:00', 'ig_517', null);
      ins.run(uid, '/media/pub-516.jpg', 'Posteo con pauta activa desde el lunes', 'published', '2026-11-02T17:00:00', 'ig_516', null);
      ins.run(uid, '/media/hoy-521.jpg', 'El posteo de hoy, programado para salir a las 20:00', 'scheduled', null, '', '2026-11-07T20:00:00');
      ins.run(uid, '/media/borrador.jpg', 'Borrador sin publicar', 'draft', null, '', null);
      ins.run(uid, '/media/sin-ig.jpg', 'Publicado pero sin ig_media_id', 'published', '2026-11-07T12:00:00', '', null);
      const boostedId = wdb.prepare("SELECT id FROM posts WHERE user_id = ? AND image_path = '/media/pub-516.jpg'").get(uid).id;
      wdb.prepare("INSERT INTO ad_boosts (user_id, post_id, ig_media_id, budget_cents, status) VALUES (?,?,?,?, 'active')").run(uid, boostedId, 'ig_516', 2000);
      id521 = wdb.prepare("SELECT id FROM posts WHERE user_id = ? AND image_path = '/media/hoy-521.jpg'").get(uid).id;
      id519 = wdb.prepare("SELECT id FROM posts WHERE user_id = ? AND image_path = '/media/pub-519.jpg'").get(uid).id;
    });

    const feed = await reqJson('GET', '/api/ads/billetera/feed', null, cookie);
    check('A2 feed → 200 con ok', feed.status === 200 && feed.json && feed.json.ok === true, JSON.stringify(feed.json));
    const posts = (feed.json && feed.json.posts) || [];
    check('A2b feed trae SOLO los 4 publicados con ig (ni el de hoy, ni el borrador, ni el sin ig)', posts.length === 4, 'n=' + posts.length);
    check('A2c el más reciente primero es el 519', posts[0] && posts[0].image_path === '/media/pub-519.jpg', JSON.stringify(posts[0]));
    check('A2d el de hoy (521) NO está en el feed', !posts.some((p) => p.image_path === '/media/hoy-521.jpg'));
    const b516 = posts.find((p) => p.image_path === '/media/pub-516.jpg');
    check('A2e el 516 con pauta trae ya_impulsado true', b516 && b516.ya_impulsado === true, JSON.stringify(b516));

    const elig = await reqJson('GET', '/api/ads/billetera/elegibles', null, cookie);
    check('A3 elegibles → 200 con ok', elig.status === 200 && elig.json && elig.json.ok === true, JSON.stringify(elig.json));
    const el = (elig.json && elig.json.elegibles) || [];
    check('A3b elegibles son los 3 sin pauta (519, 518, 517)', el.length === 3, 'n=' + el.length);
    check('A3c el de hoy (521) NO está en elegibles', !el.some((p) => p.post_id === id521));

    // (LOTE ADS-SOLO-PUBLICADOS) El servidor dispara autoArmWeek 5 s
    // después del registro y programa los borradores (scheduleAllDrafts):
    // el borrador de la siembra puede salir programado para hoy ANTES que
    // la consulta /hoy y robarle el pick (el endpoint devuelve el más
    // temprano del día). La siembra es el fixture del test: fuera el resto
    // de programados de hoy, que el 521 quede solo. Reintento por si el
    // job cae entre el borrado y la consulta.
    let hoy = null;
    for (let intento = 0; intento < 3; intento++) {
      seedDb(dbPath, (wdb) => {
        wdb.prepare("DELETE FROM posts WHERE user_id = ? AND status = 'scheduled' AND id != ?").run(uid, id521);
      });
      hoy = await reqJson('GET', '/api/ads/billetera/hoy', null, cookie);
      if (hoy.json && hoy.json.hoy && hoy.json.hoy.post_id === id521) break;
      await sleep(300);
    }
    check('A4 /hoy sigue devolviendo el programado de hoy (521)', hoy.status === 200 && hoy.json && hoy.json.ok === true && hoy.json.hoy && hoy.json.hoy.post_id === id521, JSON.stringify(hoy.json));

    // Impulsar el de hoy: el gate del servidor lo frena ANTES de gastar.
    const impHoy = await reqJson('POST', '/api/ads/billetera/impulsar', { posteoId: id521, montoUSD: 20 }, cookie);
    check('A5 impulsar el de hoy (sin publicar) → 409 sin_publicar', impHoy.status === 409 && impHoy.json && impHoy.json.motivo === 'sin_publicar', JSON.stringify(impHoy.json));
    // Impulsar el publicado más reciente: pasa el gate de publicado y
    // llega al gate de Meta (sin configurar) — sin cobrar nada.
    const imp519 = await reqJson('POST', '/api/ads/billetera/impulsar', { posteoId: id519, montoUSD: 20 }, cookie);
    check('A6 impulsar el publicado (519) → 503 ads_no_configurado (pasa el gate de publicado)', imp519.status === 503 && imp519.json && imp519.json.motivo === 'ads_no_configurado', JSON.stringify(imp519.json));
    const ro2 = new DatabaseSync(dbPath, { readOnly: true });
    const nTx = ro2.prepare('SELECT COUNT(*) AS c FROM ad_transactions').get().c;
    const nBoosts = ro2.prepare('SELECT COUNT(*) AS c FROM ad_boosts WHERE user_id = ?').get(uid).c;
    ro2.close();
    check('A7 nada cobró nada: 0 transacciones', nTx === 0, 'n=' + nTx);
    check('A7b sin boosts nuevos (solo el sembrado)', nBoosts === 1, 'n=' + nBoosts);
  } finally {
    kill();
    await sleep(300);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------- Parte B: VM sobre el chunk ----------
function parteB() {
  console.log('— B) VM: destacado = publicado más reciente; grilla sin el de hoy; vacío honesto —');
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
  const srcHistorial = sliceFn(ana, 'function anaBilleteraHistorialHTML()', 'function anaBilleteraHistorialPintar()');
  const srcDirecto = sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()');
  const srcFeed = sliceFn(ana, 'function anaAdsFeedHTML()', 'function anaAdsTabHTML()');
  const srcRuta = sliceFn(ana, 'function anaAdsRutaImpulsar(', 'async function anaBilleteraImpulsar(');
  const srcElegir = sliceFn(ana, 'function anaAdsElegirFeed(', 'async function anaBilleteraAutoToggle(');
  // (LOTE AGREGAR-TARJETA) La vista principal llama a anaTarjetaBtnHTML:
  // el render en VM la necesita cargada o aborta con ReferenceError.
  const srcTarjeta = sliceFn(ana, 'function anaTarjetaBtnHTML(', 'function anaCargarSinTarjeta(');
  check('B0 funciones extraídas del chunk', srcCortar.length > 50 && srcConstruir.length > 100 && srcDirecto.length > 500 && srcFeed.length > 300 && srcRuta.length > 100 && srcHistorial.length > 100 && srcElegir.length > 100 && srcTarjeta.length > 100,
    [srcCortar.length, srcConstruir.length, srcDirecto.length, srcFeed.length, srcRuta.length, srcHistorial.length, srcElegir.length, srcTarjeta.length].join('/'));
  if (!(srcCortar.length > 50 && srcDirecto.length > 500 && srcFeed.length > 300 && srcRuta.length > 100)) {
    console.log('  (B1–B9 se saltan: falta código nuevo en el chunk)');
    return;
  }

  // B1: el destacado por defecto es el publicado más reciente (519),
  // aunque haya posteo de hoy (521) y mejor de la semana (519).
  const fakeF = (feedPosts, eligPosts, mejor, hoyObj) => ({
    d: { ok: true, mejor: mejor || null, boostHabilitado: true, ads_permiso: true, conversion_pendiente: false },
    bil: { ok: true, saldo: 0, moneda: 'USD', montos: [20, 50, 100], dias: 7, movimientos: [], boostHabilitado: true, ads_permiso: true, conversion_pendiente: false, auto_topup: 0, tiene_tarjeta: false, balance_cents: 0, currency: 'USD', montos_usd: [20, 50, 100] },
    elig: { ok: true, elegibles: eligPosts },
    hoy: hoyObj ? { ok: true, hoy: hoyObj } : { ok: true, hoy: null },
    feed: { ok: true, total: feedPosts.length, posts: feedPosts },
  });
  const hoy521 = { post_id: 521, caption: 'El posteo de hoy', image_path: '/hoy.jpg', hora: '20:00' };
  const feed4 = [
    { post_id: 519, caption: 'El más reciente', image_path: '/519.jpg', ya_impulsado: false },
    { post_id: 518, caption: 'Posteo de ayer', image_path: '/518.jpg', ya_impulsado: false },
    { post_id: 517, caption: 'Posteo viejo', image_path: '/517.jpg', ya_impulsado: false },
    { post_id: 516, caption: 'Posteo con ads', image_path: '/516.jpg', ya_impulsado: true },
  ];
  const elig3 = [
    { post_id: 519, caption: 'El más reciente', image_path: '/519.jpg' },
    { post_id: 518, caption: 'Posteo de ayer', image_path: '/518.jpg' },
    { post_id: 517, caption: 'Posteo viejo', image_path: '/517.jpg' },
  ];
  const b1 = runVm(srcConstruir, '__out = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, { post_id: 519 }, hoy521)) + ', null, true);');
  check('B1 con posteo de hoy, el destacado es el publicado más reciente (519), no el de hoy (521)', b1 && b1.selId === 519 && b1.selPost && b1.selPost.post_id === 519, JSON.stringify(b1 && b1.selId));
  // B2: el más reciente manda aunque NO sea el mejor de la semana.
  const feed2 = [
    { post_id: 518, caption: 'El más reciente', image_path: '/518.jpg', ya_impulsado: false },
    { post_id: 519, caption: 'El mejor de la semana', image_path: '/519.jpg', ya_impulsado: false },
  ];
  const b2 = runVm(srcConstruir, '__out = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed2, [{ post_id: 518, caption: 'El más reciente', image_path: '/518.jpg' }, { post_id: 519, caption: 'El mejor', image_path: '/519.jpg' }], { post_id: 519 }, hoy521)) + ', null, true);');
  check('B2 el más reciente (518) manda sobre el mejor (519)', b2 && b2.selId === 518, JSON.stringify(b2 && b2.selId));
  // B3: el más reciente con pauta NO se pre-selecciona: salta al siguiente elegible.
  const feed3 = [
    { post_id: 516, caption: 'El más reciente, con ads', image_path: '/516.jpg', ya_impulsado: true },
    { post_id: 519, caption: 'El siguiente', image_path: '/519.jpg', ya_impulsado: false },
  ];
  const b3 = runVm(srcConstruir, '__out = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed3, [{ post_id: 519, caption: 'El siguiente', image_path: '/519.jpg' }], null, hoy521)) + ', null, true);');
  check('B3 el más reciente con ads no se pre-selecciona: va el siguiente elegible (519)', b3 && b3.selId === 519, JSON.stringify(b3 && b3.selId));
  // B4: sin publicados no hay destacado (vacío honesto, sin inventar).
  const b4 = runVm(srcConstruir, '__out = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF([], [], null, hoy521)) + ', null, true);');
  check('B4 sin publicados, no hay destacado (selId 0, selPost null) aunque haya posteo de hoy', b4 && b4.selId === 0 && b4.selPost === null, JSON.stringify(b4 && [b4.selId, b4.selPost]));
  // B5: la carta sigue con su regla (sin 3er argumento): mejor primero.
  const b5 = runVm(srcConstruir, '__out = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, { post_id: 519 }, hoy521)) + ', null);');
  check('B5 la carta (sin preferReciente) sigue pre-seleccionando el mejor (519)', b5 && b5.selId === 519, JSON.stringify(b5 && b5.selId));
  // B6: la selección previa publicada sobrevive; el hoy nunca fue selección.
  const b6 = runVm(srcConstruir, '__out = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, { post_id: 519 }, hoy521)) + ', { selId: 518, selMonto: 50, selPost: { post_id: 518, caption: "Posteo de ayer", image_path: "/518.jpg" } }, true);');
  check('B6 con selección previa publicada, se respeta (518, $50)', b6 && b6.selId === 518 && b6.selMonto === 50, JSON.stringify(b6 && [b6.selId, b6.selMonto]));

  // B7: vista principal con el destacado publicado (519, que es el mejor):
  // foto + caption + chip «el que más rindió», SIN «Sale hoy».
  const preMain = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcDirecto + '\n' + srcTarjeta + '\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, { post_id: 519 }, hoy521)) + ', null, true);\n'
    + 'anaBilleteraDatos.boosts = [];\n';
  const hMain = runVm(preMain, '__out = anaAdsDirectoHTML();');
  check('B7 la vista principal renderiza', typeof hMain === 'string' && hMain.length > 500, String(hMain && hMain.length));
  check('B7b el destacado es el publicado 519 (foto + caption)', hMain.includes('/519.jpg') && hMain.includes('El más reciente'));
  check('B7c el destacado NO trae la foto del de hoy', !hMain.includes('/hoy.jpg'));
  check('B7d el destacado NO trae «Sale hoy»', !hMain.includes('Sale hoy'));
  check('B7e el destacado trae el chip «✦ el que más rindió» (519 es el mejor)', hMain.includes('✦ el que más rindió'));
  check('B7f el botón Impulsar sigue con monto y 7 días', hMain.includes('Impulsar con $20') && hMain.includes('7 días'));
  // (LOTE AGREGAR-TARJETA) Sin tarjeta, la vista muestra el botón para agregarla.
  check('B7h sin tarjeta guardada la vista muestra «Agregar tarjeta»', typeof hMain === 'string' && hMain.includes('Agregar tarjeta'));
  // B7g: destacado NO-mejor (518): sin chip de mejor y sin «Sale hoy».
  const preMain2 = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcDirecto + '\n' + srcTarjeta + '\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed2, [{ post_id: 518, caption: 'El más reciente', image_path: '/518.jpg' }, { post_id: 519, caption: 'El mejor', image_path: '/519.jpg' }], { post_id: 519 }, hoy521)) + ', null, true);\n'
    + 'anaBilleteraDatos.boosts = [];\n';
  const hMain2 = runVm(preMain2, '__out = anaAdsDirectoHTML();');
  check('B7g destacado no-mejor (518): foto 518, sin chip de mejor, sin «Sale hoy»', typeof hMain2 === 'string' && hMain2.includes('/518.jpg') && !hMain2.includes('✦ el que más rindió') && !hMain2.includes('Sale hoy'), String(hMain2 && hMain2.length));

  // B8: vista principal sin publicados: estado honesto.
  const preMainVacio = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcDirecto + '\n' + srcTarjeta + '\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF([], [], null, hoy521)) + ', null, true);\n'
    + 'anaBilleteraDatos.boosts = [];\n';
  const hVacio = runVm(preMainVacio, '__out = anaAdsDirectoHTML();');
  check('B8 sin publicados, la vista dice «Todavía no tenés posteos para impulsar.»', typeof hVacio === 'string' && hVacio.includes('Todavía no tenés posteos para impulsar.'), String(hVacio && hVacio.slice(0, 200)));
  check('B8b sin publicados, no aparece la foto del de hoy', typeof hVacio === 'string' && !hVacio.includes('/hoy.jpg'));

  // B9: grilla con los 4 publicados (hoy fuera): contador, marcas, sin hoy.
  const preFeed = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcFeed + '\n' + srcTarjeta + '\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, { post_id: 519 }, hoy521)) + ', null, true);\n'
    + 'anaBilleteraDatos.vistaFeed = true;\n';
  const hFeed = runVm(preFeed, '__out = anaAdsFeedHTML();');
  check('B9 la grilla renderiza', typeof hFeed === 'string' && hFeed.length > 500, String(hFeed && hFeed.length));
  check('B9b las 4 fotos publicadas están en la grilla', feed4.every((p) => hFeed.includes(p.image_path)));
  check('B9c la foto del de hoy NO está en la grilla', !hFeed.includes('/hoy.jpg'));
  check('B9d el contador dice 4 posteos (solo publicados)', hFeed.includes('4 posteos'), (hFeed.match(/\d+ posteos/) || ['?'])[0]);
  check('B9e la elegida (519) lleva borde amarillo + tilde verde', hFeed.includes('/519.jpg') && hFeed.includes('#FEC14D') && hFeed.includes('✓'));
  check('B9f el posteo con ads lleva su marca (ya_impulsado)', hFeed.includes('/516.jpg') && hFeed.includes('Con ads'));
  check('B9g sin «Sale hoy» en la grilla', !hFeed.includes('Sale hoy'));
  // B9h: grilla vacía: estado honesto.
  const preFeedVacio = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcFeed + '\n' + srcTarjeta + '\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF([], [], null, hoy521)) + ', null, true);\n'
    + 'anaBilleteraDatos.vistaFeed = true;\n';
  const hFeedVacio = runVm(preFeedVacio, '__out = anaAdsFeedHTML();');
  check('B9h grilla vacía: «Todavía no tenés posteos publicados en tu feed.»', typeof hFeedVacio === 'string' && hFeedVacio.includes('Todavía no tenés posteos publicados en tu feed.'), String(hFeedVacio && hFeedVacio.slice(0, 200)));

  // B10: elegir el hoy desde la grilla ya no lo convierte en destacado.
  const preElegir = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcFeed + '\n' + srcElegir + '\n' + srcTarjeta + '\n'
    + 'function anaBilleteraPintar() {}\n'
    + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, { post_id: 519 }, hoy521)) + ', null, true);\n'
    + 'anaBilleteraDatos.vistaFeed = true;\n'
    + 'anaAdsElegirFeed(521, null);\n';
  const b10 = runVm(preElegir, '__out = anaBilleteraDatos.selPost;');
  check('B10 elegir el hoy (521) no lo pone de destacado (selPost no es el hoy)', !b10 || b10.post_id !== 521, JSON.stringify(b10));

  // B11: la ruta de impulsar sigue mandando el hoy al chat (defensa).
  const ruta = (d) => runVm(srcRuta, '__out = anaAdsRutaImpulsar(' + JSON.stringify(d) + ');');
  const base = {
    selId: 519, selPost: { post_id: 519, caption: 'El más reciente', image_path: '/519.jpg' },
    selMonto: 20, boostHabilitado: true, auto_topup: 1, tiene_tarjeta: true,
    billetera: { balance_cents: 5000 }, hoy: null,
    elegibles: [{ post_id: 519, caption: 'El más reciente', image_path: '/519.jpg' }],
    feed: [{ post_id: 519, caption: 'El más reciente', image_path: '/519.jpg', ya_impulsado: false }],
  };
  check('B11a publicado + saldo → impulsar (1 toque)', ruta(base).ruta === 'impulsar', JSON.stringify(ruta(base)));
  check('B11b el posteo de hoy (sin publicar) → chat, nunca impulsar directo', ruta({ ...base, selId: 521, selPost: { post_id: 521, caption: 'Hoy', image_path: '/hoy.jpg' }, hoy: { post_id: 521 } }).ruta === 'chat', JSON.stringify(ruta({ ...base, selId: 521, selPost: { post_id: 521 }, hoy: { post_id: 521 } })));
}

// ---------- Parte C: VM del atrás del shell ----------
function parteC() {
  console.log('— C) VM: el atrás fijo no sale en Ads, sí en las demás tabs —');
  const runVmApp = (code) => {
    const ctx = vm.createContext({ console, pzIc: () => '←' });
    vm.runInContext(code, ctx);
    return ctx.__out;
  };
  const srcBack = sliceFn(app, 'function pzBackHTML(', 'function bbHace(');
  check('C0 funciones del atrás extraídas de app.js', srcBack.length > 500 && srcBack.includes('function pzBackDesktopHTML('), String(srcBack.length));
  if (srcBack.length < 500) { console.log('  (C1–C4 se saltan: falta el bloque del atrás en app.js)'); return; }
  const back = (tab) => runVmApp(srcBack + '\n__out = pzBackHTML(' + JSON.stringify(tab) + ');');
  const backD = (tab) => runVmApp(srcBack + '\n__out = pzBackDesktopHTML(' + JSON.stringify(tab) + ');');
  check('C1 en Ads NO sale el círculo fijo (el tab ya tiene su propio atrás)', back('ads') === '', JSON.stringify(back('ads')));
  check('C2 en Ads NO sale el fijo de escritorio', backD('ads') === '', JSON.stringify(backD('ads')));
  check('C3 en Estrategia el fijo sigue (sin regresión)', typeof back('analisis') === 'string' && back('analisis').includes('pz-back-fixed'), JSON.stringify(back('analisis')));
  check('C4 en Inicio no hay atrás (como siempre)', back('inicio') === '', JSON.stringify(back('inicio')));
  check('C5 en Premios el fijo sigue (exclusión vigente del jardín)', typeof back('jardin-posty') === 'string' && back('jardin-posty') === '', JSON.stringify(back('jardin-posty')));
}

(async () => {
  try { await parteA(); } catch (e) { console.log('  ❌ Parte A abortada:', e && e.message); fail++; }
  try { parteB(); } catch (e) { console.log('  ❌ Parte B abortada:', e && e.message); fail++; }
  try { parteC(); } catch (e) { console.log('  ❌ Parte C abortada:', e && e.message); fail++; }
  console.log(`\ntest-lote-ads-solo-publicados: ${pass} ok, ${fail} mal${fails.length ? ' — ' + fails.slice(0, 12).join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
