'use strict';
/* test-lote-ads-pantalla2.js — LOTE ADS-PANTALLA-2 (órdenes de Valentino
 * 17/11, con video): (1) en la pantalla de Ads no aparecía la opción de
 * elegir un posteo del feed; (2) la pantalla de Ads no abría desde
 * arriba y la hoja de impulso arrancaba cortada. Reglas agregadas el
 * mismo día: los eliminados/archivados NO cuentan ni aparecen (13:28) y
 * se puede elegir CUALQUIER posteo publicado vivo del feed, sin tope
 * de 5 (13:29) — forma final: botón «Elegir otro posteo» que abre la
 * lista completa con buscador por palabra del caption adentro.
 *
 * Causas que cubre (censo sobre la base v1154):
 *  - El tab Ads vivo (adsView → pzAdsHTML, public/app.js) NO rendía
 *    ninguna entrada a la hoja de elegir: pzAdsPickOpen existía sin
 *    llamador en esa pantalla; la única elección visible eran las ≤3
 *    tarjetas con métricas de pzAdsOtrosHTML (sin métricas, ni eso).
 *  - El endpoint de elegibles truncaba con LIMIT 20: un posteo viejo
 *    publicado y vivo quedaba fuera del selector.
 *  - Ninguna consulta de Ads miraba ig_state: la marca durable de
 *    archivado/borrado en IG ('archived_ext', feed-reconcile) era
 *    ignorada y la única red era el filtro del feed vivo (v867,
 *    fail-open con carrera de 3 s). Un published archivado (el 583 del
 *    dueño) se ofrecía para impulsar cada vez que la lectura viva
 *    fallaba o tardaba.
 *  - Scroll: el router (render) nunca resetea el scroll al cambiar de
 *    pestaña (el único window.scrollTo(0,0) vivía en el
 *    pull-to-refresh): Ads heredaba el scroll de la pantalla anterior.
 *    La hoja (.pubsheet, max-height:88vh + overflow-y:auto) se crea
 *    una vez y se reusa sin resetear su scrollTop: reabría corrida.
 *
 * §A estáticos · §B cliente en VM (funciones reales de app.js con DOM
 * mínimo) · §C boot aislado con siembra (la verdad del servidor:
 * elegibles/buscar/feed/mejor-posteo contra la DB sembrada).
 * En la base prístina v1154 los tests nuevos FALLAN (cazan el cambio).
 * Uso: node test-lote-ads-pantalla2.js — sale 0 si todo pasa.
 *   AP2_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TREE = path.resolve(process.env.AP2_TREE || __dirname);
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CHUNK = fs.readFileSync(path.join(TREE, 'public', 'chunk-analisis.js'), 'utf8');

let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; console.log('ok  -', name); }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 300) : ''); }
};
const count = (s, sub) => (s.split(sub).length - 1);

// ---------- §A: estáticos ----------
console.log('— §A: estáticos');
// La marca durable de archivado/borrado se excluye en las 5 consultas
// que alimentan selector, buscador, feed y recomendaciones.
t(count(SRV, "AND (p.ig_state IS NULL OR p.ig_state <> 'archived_ext')") === 5,
  '§A: ig_state=archived_ext excluido en las 5 consultas de Ads (mejor-posteo, feed, elegibles, buscar, recommendations)',
  count(SRV, "AND (p.ig_state IS NULL OR p.ig_state <> 'archived_ext')"));
// El endpoint de elegibles ya no trunca: sin LIMIT 20 en su bloque.
{
  const i0 = SRV.indexOf("app.get('/api/ads/billetera/elegibles'");
  const i1 = SRV.indexOf("app.get('", i0 + 10);
  const bloque = SRV.slice(i0, i1 > i0 ? i1 : i0 + 4000);
  t(i0 > 0 && !/LIMIT 20/.test(bloque), '§A: elegibles sin LIMIT 20 (el feed entero entra al selector)');
  t(/ORDER BY p\.published_at DESC`\)\.all\(uid\)/.test(bloque), '§A: elegibles ordena por fecha sin truncar');
}
// El botón del tab y su cableado.
t(count(APP, 'function pzAdsElegirBtnHTML()') === 1, '§A: pzAdsElegirBtnHTML existe ×1');
t(count(APP, '${pzAdsElegirBtnHTML()}') === 1, '§A: el botón se rinde en pzAdsHTML ×1');
t(count(APP, 'onclick="pzAdsPickOpen()"') >= 1, '§A: el botón abre la hoja de elegir (pzAdsPickOpen)');
// La hoja de elegir: buscador adentro + lista completa.
t(count(APP, 'function pzBoostPickBuscar(v)') === 1, '§A: pzBoostPickBuscar existe ×1');
t(count(APP, 'id="pzBoostPickQ"') === 1 || count(APP, 'id=\\"pzBoostPickQ\\"') === 1, '§A: la hoja trae el input de búsqueda');
t(count(APP, 'id=\\"pzBoostPickList\\"') === 1 || count(APP, 'id="pzBoostPickList"') === 1, '§A: la lista de la hoja tiene contenedor propio (la búsqueda repinta solo la lista)');
t(count(APP, 'function pzBoostPickFiltrados()') === 1, '§A: pzBoostPickFiltrados existe ×1 (misma fuente que la lista)');
// Scroll: el tab Ads abre desde arriba y las hojas desde su tope.
t(count(APP, "if (tab === 'ads') { try { window.scrollTo(0, 0); }") === 1, '§A: al entrar a Ads el router deja el scroll en 0 ×1');
t(count(APP, 'sh.scrollTop = 0') === 2, '§A: reset de scrollTop de la hoja al mostrarla y al pintar el paso de audiencia (×2)', count(APP, 'sh.scrollTop = 0'));
// La carta (chunk): sin tope de 5 ni su nota EN EL PICKER (la nota
// homónima del historial de impulsos, boosts.length > 5, es otra
// lista y no es de este lote).
t(!CHUNK.includes('eleg.length > 5'), '§A: el picker de la carta ya no corta ni anota «los 5 más recientes»');
{
  const linea = (CHUNK.split('\n').find((l) => l.includes('const lista = eleg.slice()')) || '');
  t(linea && !linea.includes('slice(0, 5)'), '§A: la lista de la carta ya no se corta a 5', linea.trim());
}

// ---------- §B: cliente (VM) ----------
console.log('— §B: cliente (VM, funciones reales de app.js)');
function extraer(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  const j = src.indexOf('\n}\n', i);
  if (j < 0) return null;
  return src.slice(i, j + 3);
}
const els = {
  pzBoostPickBody: { innerHTML: '' },
  pzBoostPickGo: { disabled: false },
  pzBoostPickList: { innerHTML: '' },
};
const sheetPick = { scrollTop: 350 };
const sheetBoost = { scrollTop: 120 };
const ovPick = { style: { display: '' }, querySelector: () => sheetPick };
const ovBoost = { style: { display: '' }, querySelector: () => sheetBoost };
els.pzBoostPickOv = ovPick;
els.pzBoostOv = ovBoost;
const ctx = {
  console, Set, Map,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  gzT: (es) => es,
  ME: { lang: 'es' },
  pzBoostState: null,
  pzBoostImpulsados: new Set(),
  pzBoostNewState: () => ({ elegibles: [], selId: null, selPost: null }),
  pzBoostDia: () => '',
  document: { getElementById: (id) => els[id] || null },
};
vm.createContext(ctx);
const piezas = ['pzBoostKey', 'pzBoostTitulo', 'pzBoostNumeros', 'pzBoostPickFiltrados', 'pzBoostPickRowsHTML', 'pzBoostPickBuscar', 'pzBoostPintarPick', 'pzBoostElegirPick', 'pzAdsElegirBtnHTML', 'pzBoostMostrar'];
let srcVM = 'let pzBoostPickQTxt = \'\';\n';
let faltan = [];
for (const n of piezas) { const f = extraer(APP, n); if (!f) faltan.push(n); else srcVM += f + '\n'; }
t(faltan.length === 0, '§B: funciones del selector extraíbles de app.js', faltan.join(','));
if (!faltan.length) {
  vm.runInContext(srcVM, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const mk = (id, cap, extra) => ({ post_id: id, ig_media_id: 'ig' + id, image_path: '/m/' + id + '.jpg', caption: cap, reach: 0, likes: 0, comments: 0, saves: 0, recomendado: false, ya_impulsado: false, publicado_en: '2026-11-17', ...(extra || {}) });
  const lista = [
    mk(1, 'recomendado cafe', { recomendado: true }),
    mk(2, 'segundo posteo'), mk(3, 'tercero'), mk(4, 'cuarto'), mk(5, 'quinto'), mk(6, 'sexto'),
    mk(7, 'posteo viejo aniversario'), mk(8, 'octavo'),
  ];
  // B1: la hoja lista TODOS (incluido el viejo, fuera de los 5
  // recientes) y trae el buscador; la nota de vacío NO aparece.
  ctx.pzBoostState = { elegibles: lista, selId: 'p1', selPost: lista[0] };
  run('pzBoostPintarPick()');
  const html1 = els.pzBoostPickBody.innerHTML;
  t((html1.match(/pz-boost-opt/g) || []).length === 8, '§B1: la hoja rinde las 8 filas (lista completa, sin tope de 5)', (html1.match(/pz-boost-opt/g) || []).length);
  t(html1.includes('pzBoostPickQ'), '§B1: la hoja trae el buscador por palabra');
  t(html1.includes("pzBoostElegirPick('p7'"), '§B1: el posteo viejo (fuera de los 5 recientes) aparece y es elegible');
  t(!html1.includes('Todavía no tenés posteos publicados'), '§B1: con publicados, la nota de vacío NO aparece');
  // B2: el buscador filtra sobre la misma fuente; sin match, nota honesta.
  els.pzBoostPickList.innerHTML = '';
  run("pzBoostPickBuscar('aniversario')");
  t((els.pzBoostPickList.innerHTML.match(/pz-boost-opt/g) || []).length === 1 && els.pzBoostPickList.innerHTML.includes("pzBoostElegirPick('p7'"),
    '§B2: buscar «aniversario» deja solo el posteo viejo', els.pzBoostPickList.innerHTML.slice(0, 120));
  run("pzBoostPickBuscar('zzz-sin-match')");
  t(els.pzBoostPickList.innerHTML.includes('No encontré posteos con esa palabra'), '§B2: búsqueda sin match → nota honesta');
  run("pzBoostPickBuscar('')");
  t((els.pzBoostPickList.innerHTML.match(/pz-boost-opt/g) || []).length === 8, '§B2: limpiar la búsqueda devuelve la lista entera');
  // B3: elegir uno de la lista lo deja seleccionado en la hoja (y el
  // estado viaja a la tarjeta: selPost es el elegido).
  run("pzBoostElegirPick('p7')");
  t(ctx.pzBoostState.selPost && ctx.pzBoostState.selPost.post_id === 7, '§B3: elegir el viejo lo deja como selPost (la tarjeta lo muestra)', JSON.stringify(ctx.pzBoostState.selPost));
  t(/class="pz-boost-opt on"[^>]*pzBoostElegirPick\('p7'/.test(els.pzBoostPickBody.innerHTML), '§B3: la fila elegida queda marcada en la lista');
  // B4: el botón «Elegir otro posteo» del tab: con elegibles, está; sin, no.
  const btn = run('pzAdsElegirBtnHTML()');
  t(typeof btn === 'string' && btn.includes('Elegir otro posteo') && btn.includes('pzAdsPickOpen()'), '§B4: el tab rinde el botón «Elegir otro posteo»', String(btn).slice(0, 80));
  ctx.pzBoostState = { elegibles: [], selId: null, selPost: null };
  t(run('pzAdsElegirBtnHTML()') === '', '§B4: sin elegibles, el botón no se rinde');
  // B5: sin publicados, la nota de vacío SÍ aparece y confirmar se apaga.
  els.pzBoostPickBody.innerHTML = '';
  run('pzBoostPintarPick()');
  t(els.pzBoostPickBody.innerHTML.includes('Todavía no tenés posteos publicados para impulsar.'), '§B5: sin publicados, la nota de vacío aparece');
  t(els.pzBoostPickGo.disabled === true, '§B5: sin publicados, el botón de confirmar queda deshabilitado');
  // B6: la hoja abre desde su tope (scroll del contenedor en 0).
  sheetPick.scrollTop = 350;
  run("pzBoostMostrar('pick')");
  t(ovPick.style.display === 'flex' && ovBoost.style.display === 'none', '§B6: mostrar pick enciende solo su overlay');
  t(sheetPick.scrollTop === 0, '§B6: al abrir, el scroll de la hoja vuelve a 0', sheetPick.scrollTop);
}

// ---------- §C: boot ----------
console.log('— §C: boot');
const PORT = 34677;
const SECRET = 'lote-ads-pantalla2-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-pantalla2-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) { return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid)); }
async function api(sid, method, p, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method, headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
function mondayKeyNY(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (ty) => parts.find((p) => p.type === ty).value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const monday = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')) - ((wd + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}
async function runBoot() {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), ADMIN_TOKEN: 'boot-admin-ap2',
    SESSION_SECRET: SECRET, NODE_PATH: nodeModules, OPENAI_API_KEY: 'test-no-real-key',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, '§C: el servidor levanta con el lote (puerto ' + PORT + ')');
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    // Siembra. Usuario 1: el feed completo — 24 publicados vivos (el
    // viejo 209 queda fuera de los 5 recientes Y de los 20 que el
    // LIMIT viejo dejaba pasar), 1 archivado en IG (203), ruido de
    // estados que no cuentan, boosts en error (202) y uno activo (204).
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const wk = mondayKeyNY();
    const insUser = db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')`);
    const insSet = db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')`);
    const insPost = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, status, published_at, ig_media_id, week_key, media_type, ig_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const P = (id, uid, cap, status, pub, ig, wkk, mt, igs) => insPost.run(id, uid, '/media/p' + id + '.jpg', cap, status, pub, ig, wkk, mt || 'image', igs || 'live');
    insUser.run(1, 'ap2-1@example.com'); insSet.run(1);
    insUser.run(2, 'ap2-2@example.com'); insSet.run(2);
    insUser.run(3, 'ap2-3@example.com'); insSet.run(3);
    P(201, 1, 'nuevo lanzamiento cafe', 'published', '2026-11-17T10:00:00.000Z', 'ig201', wk);
    P(202, 1, 'posteo con boosts en error', 'published', '2026-11-16T10:00:00.000Z', 'ig202', '2026-11-09');
    P(203, 1, 'archivado aniversario total', 'published', '2026-11-16T09:00:00.000Z', 'ig203', '2026-11-09', 'image', 'archived_ext');
    P(204, 1, 'ya impulsado activo', 'published', '2026-11-15T10:00:00.000Z', 'ig204', '2026-11-09');
    P(209, 1, 'posteo viejo aniversario', 'published', '2026-05-01T10:00:00.000Z', 'ig209', '2026-04-27');
    for (let i = 0; i < 20; i++) {
      const id = 220 + i;
      const dia = String(10 + (i % 7)).padStart(2, '0');
      P(id, 1, 'relleno ' + i, 'published', `2026-11-${dia}T0${i % 10}:00:00.000Z`, 'ig' + id, '2026-11-09');
    }
    P(210, 1, 'cancelado', 'cancelled', '2026-11-16T08:00:00.000Z', 'ig210', '2026-11-09');
    P(211, 1, 'borrador', 'draft', '2026-11-16T08:00:00.000Z', 'ig211', '2026-11-09');
    P(212, 1, 'programado', 'scheduled', '2026-11-18T10:00:00.000Z', 'ig212', '2026-11-16');
    P(213, 1, 'historia', 'published', '2026-11-16T08:00:00.000Z', 'ig213', '2026-11-09', 'story');
    P(214, 1, 'demo', 'published', '2026-11-16T08:00:00.000Z', 'demo_214', '2026-11-09');
    P(215, 1, 'sin media', 'published', '2026-11-16T08:00:00.000Z', '', '2026-11-09');
    db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved) VALUES (201, 50, 10, 2, 1)`).run();
    const insBoost = db.prepare(`INSERT INTO ad_boosts (user_id, post_id, ig_media_id, status) VALUES (1, ?, ?, ?)`);
    insBoost.run(202, 'ig202', 'error'); insBoost.run(202, 'ig202', 'error'); insBoost.run(202, 'ig202', 'error');
    insBoost.run(204, 'ig204', 'active');
    // Usuario 2: el archivado es el MEJOR de la semana por números —
    // la recomendación no puede ser él; gana el vivo (302).
    P(301, 2, 'archivado campeon', 'published', '2026-11-17T09:00:00.000Z', 'ig301', wk, 'image', 'archived_ext');
    P(302, 2, 'vivo modesto', 'published', '2026-11-17T08:00:00.000Z', 'ig302', wk);
    db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved) VALUES (301, 500, 999, 0, 0)`).run();
    db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved) VALUES (302, 10, 1, 0, 0)`).run();
    const insSes = db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`);
    for (const [sid, uid] of [['ap2-sid-1', 1], ['ap2-sid-2', 2], ['ap2-sid-3', 3]]) {
      insSes.run(sid, JSON.stringify({ cookie: { originalMaxAge: 7 * 24 * 3600 * 1000, httpOnly: true, path: '/' }, userId: uid }), Date.now() + 7 * 24 * 3600 * 1000);
    }
    db.close();
    // Sin sesión → 401.
    const sinAuth = await fetch(`http://127.0.0.1:${PORT}/api/ads/billetera/elegibles`);
    t(sinAuth.status === 401, '§C: elegibles sin sesión → 401', String(sinAuth.status));
    // Elegibles del usuario 1: el feed entero de vivos.
    const el = await api('ap2-sid-1', 'GET', '/api/ads/billetera/elegibles?incluir_impulsados=1');
    t(el.status === 200 && el.json && el.json.ok === true, '§C: elegibles responde 200 ok:true', JSON.stringify(el.json).slice(0, 200));
    const ids = ((el.json || {}).elegibles || []).map((e) => e.post_id);
    t(ids.length === 24, '§C: elegibles = 24 (los 24 publicados vivos, sin truncar)', ids.length + ' → ' + ids.join(','));
    t(ids.includes(209), '§C: el posteo viejo (209, fuera de los 5 recientes y del viejo LIMIT 20) está en la lista');
    t(!ids.includes(203), '§C-A: el archivado en IG (203, published + ig_state=archived_ext) NO aparece');
    t(ids.includes(202), '§C: el posteo con 3 boosts en «error» (202) sigue elegible');
    t(ids.includes(204), '§C: con incluir_impulsados=1 el de boost activo (204) aparece marcado');
    for (const no of [210, 211, 212, 213, 214, 215]) t(!ids.includes(no), '§C: el posteo ' + no + ' (estado/medios que no cuentan) queda fuera');
    const porId = Object.fromEntries(((el.json || {}).elegibles || []).map((e) => [e.post_id, e]));
    t(porId[201] && porId[201].recomendado === true && ids[0] === 201, '§C: el recomendado (201) va primero', JSON.stringify(porId[201]));
    t(porId[202] && !porId[202].ya_impulsado, '§C: los boosts en error NO marcan ya_impulsado', JSON.stringify(porId[202]));
    t(porId[204] && porId[204].ya_impulsado === true, '§C: el boost activo SÍ marca ya_impulsado', JSON.stringify(porId[204]));
    // Sin incluir_impulsados: el activo sale, el de errores queda.
    const el2 = await api('ap2-sid-1', 'GET', '/api/ads/billetera/elegibles');
    const ids2 = ((el2.json || {}).elegibles || []).map((e) => e.post_id);
    t(ids2.length === 23 && !ids2.includes(204) && ids2.includes(202), '§C: sin incluir_impulsados: 23, fuera el activo, adentro el de errores', ids2.length);
    // Buscador: misma fuente — encuentra el viejo, nunca el archivado.
    const bu = await api('ap2-sid-1', 'GET', '/api/ads/billetera/buscar?q=aniversario');
    const buIds = ((bu.json || {}).resultados || []).map((e) => e.post_id);
    t(bu.status === 200 && buIds.includes(209), '§C: el buscador encuentra el posteo viejo por su caption', buIds.join(','));
    t(!buIds.includes(203), '§C-A: el buscador NO devuelve el archivado aunque su caption matchee');
    // Feed de Ads: misma regla.
    const fe = await api('ap2-sid-1', 'GET', '/api/ads/billetera/feed');
    const feIds = ((fe.json || {}).posts || []).map((e) => e.post_id);
    t(feIds.includes(209) && !feIds.includes(203), '§C: el feed de Ads trae el viejo y no el archivado', feIds.length);
    // La recomendación tampoco puede ser un archivado (usuario 2).
    const mj = await api('ap2-sid-2', 'GET', '/api/estrategia/mejor-posteo');
    t(mj.status === 200 && mj.json && mj.json.mejor && mj.json.mejor.post_id === 302,
      '§C-A: mejor-posteo recomienda el vivo (302), no el archivado campeón (301)', JSON.stringify(mj.json && mj.json.mejor));
    const elU2 = await api('ap2-sid-2', 'GET', '/api/ads/billetera/elegibles?incluir_impulsados=1');
    const idsU2 = ((elU2.json || {}).elegibles || []).map((e) => e.post_id);
    t(idsU2.length === 1 && idsU2[0] === 302, '§C-A: elegibles del usuario 2 = solo el vivo', idsU2.join(','));
    // Usuario sin posteos: lista vacía (la nota del cliente es honesta).
    const elU3 = await api('ap2-sid-3', 'GET', '/api/ads/billetera/elegibles?incluir_impulsados=1');
    t(elU3.status === 200 && elU3.json && Array.isArray(elU3.json.elegibles) && elU3.json.elegibles.length === 0,
      '§C: cuenta sin publicados → elegibles vacío (la nota de vacío es la verdad ahí)');
    const errLines = out.split('\n').filter((l) => /^(Error|TypeError|ReferenceError)|Uncaught/i.test(l.trim()));
    t(errLines.length === 0, '§C: 0 errores en la salida del boot', errLines.slice(0, 3).join(' | '));
  } catch (e) {
    t(false, '§C: boot', e.message);
  } finally {
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await runBoot();
  console.log(`\ntest-lote-ads-pantalla2: ${okN}/${okN + badN} ok`);
  if (badN) process.exit(1);
})();
