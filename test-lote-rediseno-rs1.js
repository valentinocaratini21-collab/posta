// test-lote-rediseno-rs1.js — REDISEÑO SIMPLE RS-1: AJUSTES + TUERCA + COMPARTIR (mock v7).
// 1) Ajustes es una vista PLANA (mock v7): solo facturación, idioma y conexiones.
//    Sin las 5 líneas del negocio (regla 5 v7: se corrige por chat, Ajustes no
//    toca tu negocio), sin sección "Tu nivel" (su hogar es decisión abierta de
//    Valentino), sin sección Referidos (la invitación vive en la hoja del shell).
//    La tuerca del encabezado abre Ajustes; volver atrás regresa a la pestaña.
// 2) Botón Compartir en el encabezado: UN ícono chiquito (flecha de subida,
//    como el de TestFlight), sin texto, entre la píldora del negocio y la
//    tuerca, visible en TODAS las pantallas (Hoy, Feed, Chat, Ajustes).
// 3) Hoja de referidos "Compartir Posty": hero 50% OFF, regla 2 amigos,
//    link personal + Copiar, 3 pasos, "Compartir mi invitación" (navigator.share
//    o copia + toast). El link y el descuento usan el mecanismo de referidos
//    EXISTENTE (GET /api/referrals/mine + revalidateReferralDiscount vía MP).
// 4) Idioma: POST /api/settings/language (nuevo; no existía endpoint para
//    cambiar users.lang) + recarga del front.
// 5) Datos reales del cliente en las filas (plan, riel de pago, saldo de ads,
//    @ de IG, avisos pre-publicación), no los de demo.
// Rojo-primero: falla en base v825, pasa en el árbol del lote.
// Uso: node test-lote-rediseno-rs1.js [dir-del-arbol] — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(TREE, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const dbs = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');
const chk = fs.readFileSync(path.join(TREE, 'public/chunk-ajustes.js'), 'utf8');
const idxEs = fs.readFileSync(path.join(TREE, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(TREE, 'public/en/index.html'), 'utf8');

// ---------- Parte 0: pines ----------
console.log('— 0) pines —');
check('0a app.js cambió vs base v825', md5(app) !== '55175c23d4ee48404b2cd8cf52328f55', md5(app));
check('0b server.js cambió vs base v825', md5(srv) !== 'a794b626ff39c6ae774c3d146aedc7a7', md5(srv));
check('0c styles.css cambió vs base v825', md5(css) !== 'cadafccac8af119275c9c799668a0c61', md5(css));
check('0d chunk-ajustes.js cambió vs base v825', md5(chk) !== 'f0a3fa96bb55fa449c34395ec2f020a5', md5(chk));
check('0e db.js = v831 (supervision; RS-1 no lo toca)', md5(dbs) === '6a08a12d59f385f4e152968e8a4bb132', md5(dbs));
check('0f index ES/EN = v832 (?v=566, styles?v=20261217)', md5(idxEs) === '092e21325da2ae39097b664c5c4e6ca2' && md5(idxEn) === '9b2e595a6a06c8e706c8ad982f8121b4', md5(idxEs) + ' / ' + md5(idxEn));
check('0g BUILD v832 (estampado)', srv.includes("const BUILD_ID = '20261105-v832'"));

// ---------- Parte 1: estática app.js — Compartir en el encabezado + hoja ----------
console.log('— 1) estática app.js: Compartir + hoja —');
check('1a ícono shareUp (flecha de subida) definido en el mapa PZ_IC', app.includes("shareUp: '<path d=\"M12 15V3\""));
check('1b botón Compartir del shell abre la hoja (rsShareOpen), no el deep-link viejo',
  app.includes("onclick=\"rsShareOpen()\"") && cnt(app, "bbGo('#/app/ajustes?referidos=1')") === 0);
check('1c la tuerca del shell sigue abriendo Ajustes', app.includes("bbGo('#/app/ajustes')") && app.includes("pzIc('gear', 20)"));
check('1d el chat tiene Compartir + tuerca en su encabezado (pz-chatfull-acts)',
  app.includes('pz-chatfull-acts') && cnt(app, "onclick=\"rsShareOpen()\"") >= 2);
check('1e la hoja vive en los dos shells (bbShell de oficina + appShell de la app)',
  cnt(app, '${rsShareSheetHTML()}') === 2);
check('1f la hoja trae los textos del mock v7 (50% OFF, regla, Copiar, Compartir mi invitación, 3 pasos)',
  app.includes('Compartir Posty') && app.includes('50% OFF') && app.includes('2 amigos = 50% off en tu próxima factura')
  && app.includes('>Copiar<') && app.includes('Compartir mi invitación')
  && app.includes('Compartís tu link') && app.includes('Tus amigos se suman') && app.includes('Al segundo amigo, el 50% off queda aplicado'));
check('1g funciones de la hoja definidas: rsShareOpen/rsShareClose/rsShareCopy/rsShareNative',
  app.includes('function rsShareOpen()') && app.includes('function rsShareClose()')
  && app.includes('function rsShareCopy()') && app.includes('function rsShareNative()'));
check('1h la hoja usa pzReferral (mecanismo existente) y el texto de compartir del mock',
  app.includes('pzReferral()') && app.includes('Te invito a probar Posty:') && app.includes('si nos sumamos 2 amigos, tengo 50% off.'));
check('1i el ícono de Compartir del feed abre la hoja (no navega a Ajustes)',
  app.includes("if (act === 'share') { rsShareOpen(); }"));

// ---------- Parte 2: estática chunk-ajustes.js — vista plana ----------
console.log('— 2) estática chunk-ajustes.js: vista plana v7 —');
check('2a la vista plana trae el subtítulo del mock + la tarjeta insight + el botón al chat',
  chk.includes('Solo facturación, idioma y conexiones. Acá no se edita tu negocio.')
  && chk.includes('¿Algo de lo que Posty sabe de vos está mal?')
  && chk.includes('Corregirlo en el chat →'));
check('2b la vista plana trae Facturación (Plan/Pago/Saldo) + Idioma + Conexiones (Instagram/Avisos)',
  chk.includes('Facturación') && chk.includes('id="rsPlanVal"') && chk.includes('id="rsSaldoVal"')
  && chk.includes('Idioma') && chk.includes('id="rsLangVal"') && chk.includes('id="rsLangBtn"')
  && chk.includes('Conexiones') && chk.includes('id="rsAvisosChip"'));
check('2c el grupo Más conserva auto/marca/página/avanzado + Salir (sin borrar funcionalidad)',
  chk.includes("data-ajnav=\"auto\"") && chk.includes("data-ajnav=\"marca\"") && chk.includes("data-ajnav=\"pagina\"")
  && chk.includes("data-ajnav=\"avanzado\"") && chk.includes('id="btnLogoutAj"'));
check('2d NO hay sección de negocio: ajsec-negocio, btnSaveProfile, s_biz y el bloque de ADN ×0',
  cnt(chk, 'ajsec-negocio') === 0 && cnt(chk, 'btnSaveProfile') === 0 && cnt(chk, 's_biz') === 0 && cnt(chk, 'saveDnaNow') === 0);
check('2e NO hay sección Referidos en Ajustes: ajsec-referidos y refZone ×0',
  cnt(chk, 'ajsec-referidos') === 0 && cnt(chk, 'refZone') === 0);
check('2f NO hay Nivel en Ajustes: lvlBlock y el bloque de niveles ×0',
  cnt(chk, 'lvlBlock') === 0 && cnt(chk, 'Niveles de Posty') === 0);
check('2g AJ_SECCIONES ya no tiene referidos ni negocio',
  chk.includes("const AJ_SECCIONES = ['notif', 'plan', 'auto', 'conex', 'marca', 'pagina', 'avanzado'];"));
check('2h ?referidos=1 abre la hoja (rsShareOpen), no una sección',
  chk.includes("if (ajDeep === 'referidos')") && chk.includes('rsShareOpen()'));
check('2i la fila Pago usa el riel real (ME.billing_provider: stripe/mp)',
  chk.includes('ME.billing_provider') && chk.includes('Tarjeta guardada') && chk.includes('MercadoPago'));
check('2j el botón de idioma llama a POST /api/settings/language y recarga',
  chk.includes("api.post('/api/settings/language'") && chk.includes('location.reload()'));
check('2k el saldo se lee de GET /api/ads/config (billetera real)',
  chk.includes("api.get('/api/ads/config')") && chk.includes('balance_cents'));
check('2l el nombre del plan de la fila plana sale del detalle (setRsPlan)',
  chk.includes('setRsPlan') && chk.includes("getElementById('rsPlanVal')"));
check('2m el chip de Avisos se pinta con el estado real de pre_notify',
  chk.includes("getElementById('rsAvisosChip')") && chk.includes('pre_notify'));

// ---------- Parte 3: estática styles.css ----------
console.log('— 3) estática styles.css —');
check('3a clases de la vista plana del mock: .insight, .know, .big-ghost, .sec-head, .st-ok',
  css.includes('.insight{') && css.includes('.know{') && css.includes('.big-ghost{') && css.includes('.sec-head{') && css.includes('.st-ok{'));
check('3b clases de la hoja de referidos: .rs-sheet, .rs-sheet-panel, .rs-share-link, .rs-btn-share-main',
  css.includes('.rs-sheet{') && css.includes('.rs-sheet-panel{') && css.includes('.rs-share-link{') && css.includes('.rs-btn-share-main{'));
check('3c acciones del encabezado del chat: .pz-chatfull-acts',
  css.includes('.pz-chatfull-acts{'));

// ---------- Parte 4: estática server.js — endpoint de idioma ----------
console.log('— 4) estática server.js: POST /api/settings/language —');
check('4a el endpoint existe, con requireAuth, y valida es/en (400 si no)',
  srv.includes("app.post('/api/settings/language', requireAuth") && srv.includes("if (lang !== 'es' && lang !== 'en') return res.status(400)"));
check('4b el endpoint escribe users.lang',
  srv.includes('UPDATE users SET lang = ? WHERE id = ?'));

// ---------- Parte 5: boot real ----------
console.log('— 5) boot real —');
const PORT = 34580;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs1-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const TEST_KEY = 'boot-test-key-rs1';

async function reqJson(method, p, body, cookie, contentType) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers, body: body === undefined ? undefined : (contentType ? body : JSON.stringify(body)) });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}
function startServer() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  return { child, out: () => out };
}
async function waitUp(srvProc) {
  for (let i = 0; i < 45; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  return false;
}
async function waitExit(child) {
  for (let i = 0; i < 30; i++) {
    if (child.exitCode !== null) return true;
    await sleep(500);
  }
  return child.exitCode !== null;
}

async function parteBoot() {
  const s1 = startServer();
  try {
    const up = await waitUp(s1);
    check('5a el servidor levanta con el lote', up);
    if (!up) { console.log(s1.out().split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    check('5b /api/version = v832', ver && ver.build === '20261105-v832', JSON.stringify(ver));
    const appJs = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=566`)).text();
    check('5c el app.js servido trae la hoja (rsShareOpen + shareUp) y no el deep-link viejo en el encabezado',
      appJs.includes('function rsShareOpen()') && appJs.includes("shareUp: '<path d=\"M12 15V3\"") && !appJs.includes("bbGo('#/app/ajustes?referidos=1')"), 'len ' + appJs.length);
    const chkJs = await (await fetch(`http://127.0.0.1:${PORT}/chunk-ajustes.js`)).text();
    check('5d el chunk-ajustes.js servido trae la vista plana y no la sección de negocio',
      chkJs.includes('Solo facturación, idioma y conexiones') && chkJs.includes('Corregirlo en el chat')
      && !chkJs.includes('ajsec-negocio') && !chkJs.includes('btnSaveProfile'), 'len ' + chkJs.length);
    const cssTxt = await (await fetch(`http://127.0.0.1:${PORT}/styles.css?v=20261217`)).text();
    check('5e el styles.css servido trae .rs-sheet + .know + .insight',
      cssTxt.includes('.rs-sheet{') && cssTxt.includes('.know{') && cssTxt.includes('.insight{'), 'len ' + cssTxt.length);
    // Sin sesión: el endpoint de idioma exige auth.
    const noAuth = await reqJson('POST', '/api/settings/language', { lang: 'en' });
    check('5f POST /api/settings/language sin sesión → 401', noAuth.status === 401, JSON.stringify(noAuth));
    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'rs1-test', device: 'test-device-rs1' });
    check('5g join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';
    const uid = join.json.user_id;
    const langEn = await reqJson('POST', '/api/settings/language', { lang: 'en' }, cookie);
    check('5h POST /api/settings/language {lang:en} → 200 {ok, lang:en}', langEn.status === 200 && langEn.json && langEn.json.ok === true && langEn.json.lang === 'en', JSON.stringify(langEn.json));
    const meEn = await reqJson('GET', '/api/auth/me', undefined, cookie);
    check('5i /api/auth/me refleja lang=en tras el POST', meEn.status === 200 && meEn.json && meEn.json.user && meEn.json.user.lang === 'en', JSON.stringify(meEn.json && meEn.json.user && { lang: meEn.json.user.lang }));
    const langBad = await reqJson('POST', '/api/settings/language', { lang: 'fr' }, cookie);
    check('5j POST /api/settings/language {lang:fr} → 400 (no se guarda)', langBad.status === 400, JSON.stringify(langBad.json));
    const langEs = await reqJson('POST', '/api/settings/language', { lang: 'es' }, cookie);
    check('5k POST /api/settings/language {lang:es} → 200 (vuelve a español)', langEs.status === 200 && langEs.json && langEs.json.lang === 'es', JSON.stringify(langEs.json));
    const ref = await reqJson('GET', '/api/referrals/mine', undefined, cookie);
    check('5l GET /api/referrals/mine → link personal con ?ref= y regla 2 amigos',
      ref.status === 200 && ref.json && ref.json.ok === true && typeof ref.json.link === 'string' && ref.json.link.includes('?ref=') && ref.json.needed === 2,
      JSON.stringify(ref.json && { link: ref.json.link, needed: ref.json.needed }));
    const adsCfg = await reqJson('GET', '/api/ads/config', undefined, cookie);
    check('5m GET /api/ads/config → balance_cents numérico (saldo real de la fila)',
      adsCfg.status === 200 && adsCfg.json && typeof adsCfg.json.balance_cents === 'number', JSON.stringify(adsCfg.json && { balance_cents: adsCfg.json.balance_cents }));
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    try { db.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
    const row = db.prepare('SELECT lang FROM users WHERE id = ?').get(uid);
    check('5n la DB guarda lang=es tras el último POST (una sola verdad)', row && row.lang === 'es', JSON.stringify(row));
    db.close();
  } finally {
    try { s1.child.kill('SIGTERM'); } catch (e) {}
    await waitExit(s1.child);
    await sleep(1000);
  }
}

(async () => {
  try { await parteBoot(); } catch (e) { check('5x boot sin excepción', false, e.message); }
  console.log(`\n— resultado: ${pass} ok / ${fail} mal —`);
  if (fails.length) console.log('fallos: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
