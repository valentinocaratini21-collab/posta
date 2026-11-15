// test-lote-camino-cliente-ads.js — LOTE CAMINO-CLIENTE-ADS
// Despacho aprobado por Valentino 14/11 16:43 (vía principal → Posty →
// tablero). ANCLA: captura 14/11 16:08 de la tarjeta «Posty recomienda»
// de Impulsar (posteo de esmaltes, $50 recomendado, total US$ 55) y su
// aclaración 16:11: «Me refería a lo que dice de facebook en rojo» — el
// pie «Falta conectar tu cuenta publicitaria. Es un toque, en el mismo
// flujo de conexión — y no se gasta nada hasta que impulses.» con la
// tarjeta pintada COMPLETA (montos + «Impulsar por US$…») y ningún
// camino que terminara: el estado 'ads_not_connected' del servidor no
// reducía la tarjeta (solo lo hacía 'sin_autorizacion_publicitaria').
// AUDITORÍA PREVIA (lo que YA estaba vivo desde v1048 y NO se rehízo):
// el login unificado IG→FLB encadenado en la MISMA SENTADA del callback
// de IG (/api/ig/callback → /api/ig/unified/go?chained=1), las rutas
// /api/ig/unified/go|callback con next validado del lado servidor y la
// captura en ig_ads_connections (status ok|sin_cuenta; la compuerta
// adsReadiness exige suat + primary_ad_account_id: 'sin_cuenta' NO
// abre la compuerta ni cobra nada), y el mapping del cliente
// ads_not_connected → sin_cuenta_publicitaria en pzBoostGate.
// LO QUE CONSTRUYE ESTE LOTE (solo lo que faltaba):
//  (a) server: /api/ads/billetera/elegibles ahora viaja connect_url
//      cuando lo que falta es la conexión publicitaria del cliente
//      (ads_not_connected | page_not_authorized) y el login unificado
//      está configurado; sin META_FLB_CONFIG_ID no viaja nada.
//  (b) app: el estado reducido de la tarjeta del tab Ads cubre también
//      'sin_cuenta_publicitaria' y su botón pasa a ser «Conectar mi
//      cuenta publicitaria» (pzAdsAutorizarPagina con el mecanismo
//      real: re-verifica → si ya está, re-pinta → si el servidor
//      ofreció el flujo, lo abre con next a la tarjeta → si no está
//      habilitado, motivo honesto inline). Nunca gasta nada.
//  (c) app: la HOJA de Impulsar (Hoy/detalle) gana el mismo estado
//      reducido con su botón (pzBoostConectarCuenta, next = la pantalla
//      actual validada): sin montos, sin aviso rojo, sin Cargar.
//  (d) app: handleIgAdsResult lee la vuelta ?igads=ok|sin_cuenta|error
//      (que el callback ya emitía y NADIE leía) y dice el estado
//      honesto en el acto; el parámetro se limpia siempre.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-camino-cliente-ads.js
// (desde release/; ROOT = release/, BASE = ../base para el control).
// Parte C: boot real en el puerto 35077 con DATA_DIR temporal en /tmp:
// NO crea release/data/ y NO cobra nada (no se crea ninguna campaña).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const BASE = path.join(ROOT, '..', 'base');
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35077;

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  FAIL: ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}
function count(str, sub) { return str.split(sub).length - 1; }

// ---------- extractor de funciones por llaves balanceadas ----------
// Misma versión con pila de contextos (código / template) de la suite
// de TARJETA-IMPULSAR: apila un marco por ${} y por template y valida
// que lo extraído compile.
function extractFn(src, name) {
  const re = new RegExp('(?:^|\\n)(async )?function ' + name + '\\s*\\(', 'g');
  const hits = [];
  let m;
  while ((m = re.exec(src)) !== null) hits.push(m.index + (m[0].startsWith('\n') ? 1 : 0));
  if (!hits.length) return null;
  const start = hits[hits.length - 1];
  const open = src.indexOf('{', start);
  if (open < 0) return null;
  const stack = [{ tpl: false, depth: 0 }];
  let i = open;
  while (i < src.length) {
    const top = stack[stack.length - 1];
    const c = src[i], n = src[i + 1];
    if (top.tpl) {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && n === '{') { stack.push({ tpl: false, depth: 1 }); i += 2; continue; }
      i++; continue;
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const end = src.indexOf('*/', i + 2); if (end < 0) return null; i = end + 2; continue; }
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '`') { stack.push({ tpl: true, depth: 0 }); i++; continue; }
    if (c === '{') { top.depth++; i++; continue; }
    if (c === '}') {
      top.depth--; i++;
      if (top.depth === 0) {
        stack.pop();
        if (!stack.length) {
          const out = src.slice(start, i);
          try { new vm.Script('0,(' + out + ')'); } catch (e) { return null; }
          return out;
        }
      }
      continue;
    }
    i++;
  }
  return null;
}

// Respaldo para funciones con literales regex que traen comillas en la
// clase de caracteres (pzBoostConectarCuenta: /^\/#\/[^\s"'\\<>]*$/ — el
// escáner de arriba entra en modo string dentro de la clase). Corta
// desde la firma hasta la última '}' antes de la próxima función de
// nivel superior y valida que compile.
function extractFnLoose(src, name) {
  const re = new RegExp('(?:^|\\n)(async )?function ' + name + '\\s*\\(', 'g');
  let m, start = -1;
  while ((m = re.exec(src)) !== null) start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  if (start < 0) return null;
  const next = src.slice(start + 10).search(/\n(async )?function [A-Za-z_$]/);
  const end = next < 0 ? src.length : start + 10 + next;
  const slice = src.slice(start, end);
  const last = slice.lastIndexOf('}');
  if (last < 0) return null;
  const out = slice.slice(0, last + 1);
  try { new vm.Script('0,(' + out + ')'); } catch (e) { return null; }
  return out;
}

const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const baseApp = fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8');
const baseServer = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');

function region(src, startMarker, nextMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) return '';
  const b = src.indexOf(nextMarker, a + startMarker.length);
  return src.slice(a, b < 0 ? undefined : b);
}

async function main() {
  console.log('== A. Fuente: el delta del lote y su control contra la base ==');
  // --- (a) server: connect_url en elegibles ---
  const eligRel = region(serverSrc, "app.get('/api/ads/billetera/elegibles'", "app.get('/api/ads");
  const eligBase = region(baseServer, "app.get('/api/ads/billetera/elegibles'", "app.get('/api/ads");
  t(eligRel.includes('connect_url'), 'A1 elegibles (release) viaja connect_url', eligRel.slice(0, 200));
  t(eligRel.includes('faltaConexionAds') && eligRel.includes("gate.code === 'ads_not_connected'") && eligRel.includes("gate.code === 'page_not_authorized'"), 'A2 el connect_url sale solo cuando falta la conexión publicitaria del cliente');
  t(eligRel.includes('unifiedReady(uid)') && eligRel.includes("'/api/ig/unified/go'"), 'A3 sin login unificado configurado no se promete el flujo (unifiedReady)');
  t(!eligBase.includes('connect_url'), 'A4 CONTROL base: elegibles no viajaba ningún connect_url');
  // --- auditoría: lo preexistente que el lote NO rehízo ---
  t(serverSrc.includes("app.get('/api/ig/unified/go'") && serverSrc.includes("app.get('/api/ig/unified/callback'"), 'A5 (auditoría) las rutas del login unificado ya existían');
  t(serverSrc.includes("'/api/ig/unified/go?chained=1'"), 'A6 (auditoría) la MISMA SENTADA ya existía: el callback de IG encadena al unificado');
  t(serverSrc.includes('ig_ads_connections') && serverSrc.includes("'sin_cuenta'"), 'A7 (auditoría) la captura en ig_ads_connections con estado sin_cuenta ya existía');
  // --- (b) tarjeta del tab Ads ---
  const sinAutRel = extractFn(appSrc, 'pzAdsPaginaSinAutorizar') || '';
  const sinAutBase = extractFn(baseApp, 'pzAdsPaginaSinAutorizar') || '';
  t(sinAutRel.includes("motivo === 'sin_cuenta_publicitaria'") && sinAutRel.includes("motivo === 'sin_autorizacion_publicitaria'"), 'A8 el estado reducido cubre los dos motivos de conexión');
  t(!sinAutBase.includes('sin_cuenta_publicitaria'), 'A9 CONTROL base: el reducido NO cubría sin_cuenta_publicitaria (la captura)');
  const recReducida = region(appSrc, 'else if (pzAdsPaginaSinAutorizar())', '} else {');
  t(recReducida.includes('Conectar mi cuenta publicitaria') && recReducida.includes('Connect my ad account'), 'A10 el botón reducido es «Conectar mi cuenta publicitaria» ES/EN');
  t(recReducida.includes('onclick="pzAdsAutorizarPagina(this)"') && recReducida.includes('No se gastó nada.'), 'A11 el botón abre el mecanismo real y la tarjeta dice «No se gastó nada.»');
  t(count(appSrc, 'Authorize my Page') === 0, 'A12 el rótulo viejo «Authorize my Page» desapareció del bundle');
  t(appSrc.indexOf('else if (pzAdsPaginaSinAutorizar())') < appSrc.indexOf('pz-ads-amounts'), 'A13 el reducido manda: se pinta ANTES que la tarjeta completa con montos');
  // --- (c) hoja de Impulsar ---
  t(count(appSrc, 'function pzBoostConectarCuenta') === 1, 'A14 pzBoostConectarCuenta definida ×1 (M69.1)');
  const hoja = region(appSrc, 'function pzBoostPintarBoost', 'function pzBoost');
  t(hoja.includes('onclick="pzBoostConectarCuenta(this)"') && hoja.includes('Conectar mi cuenta publicitaria'), 'A15 la hoja reducida trae su botón de conexión');
  t(hoja.indexOf('gate.motivo === \'sin_cuenta_publicitaria\'') >= 0 && hoja.indexOf('gate.motivo === \'sin_cuenta_publicitaria\'') < hoja.indexOf('pz-boost-warn'), 'A16 la hoja se reduce por los dos motivos antes de cualquier aviso al pie');
  // --- (d) vuelta ?igads= ---
  t(count(appSrc, 'function handleIgAdsResult') === 1, 'A17 handleIgAdsResult definida ×1 (M69.1)');
  t(count(appSrc, 'handleIgAdsResult();') === 1, 'A18 handleIgAdsResult se llama una vez, en el boot');
  t(count(baseApp, 'handleIgAdsResult') === 0, 'A19 CONTROL base: nadie leía la vuelta ?igads=');
  const igAdsFn = extractFn(appSrc, 'handleIgAdsResult') || '';
  t(igAdsFn.includes("r === 'ok'") && igAdsFn.includes("r === 'sin_cuenta'") && igAdsFn.includes("r === 'error'"), 'A20 la vuelta cubre los tres estados: ok · sin_cuenta · error');
  // --- estado del cliente ---
  const newState = extractFn(appSrc, 'pzBoostNewState') || '';
  t(newState.includes("connectUrl: ''"), 'A21 el estado nace con connectUrl vacío');
  const load = extractFn(appSrc, 'pzBoostLoad') || '';
  t(load.includes('s.connectUrl') && load.includes('elig.connect_url') && load.includes('!elig.ads_ready'), 'A22 pzBoostLoad captura el connect_url solo sin conexión lista');

  console.log('== B. VM cliente: comportamiento de las funciones reales ==');
  const names = ['pzBoostNewState', 'pzBoostGate', 'pzAdsPaginaSinAutorizar', 'pzBoostLoad', 'pzAdsAutorizarPagina', 'pzBoostConectarCuenta', 'handleIgAdsResult'];
  const parts = names.map((n) => extractFn(appSrc, n) || extractFnLoose(appSrc, n));
  t(parts.every(Boolean), 'B0 las 7 funciones del camino se extraen y compilan', names.filter((n, i) => !parts[i]).join(','));
  const prelude = `
    let pzBoostState = null;
    let __apiResp = {};
    const __calls = { pintar: 0, pintarBoost: 0, toasts: [], replaced: [] };
    const __els = {};
    const gzT = (es, en) => es;
    const esc = (s) => String(s == null ? '' : s);
    function toast(html) { __calls.toasts.push(String(html)); }
    const document = { getElementById: (id) => (__els[id] || (__els[id] = { textContent: '' })) };
    const __loc = { hash: '#/app/ads', pathname: '/', href: '' };
    const location = __loc;
    const window = { location: __loc };
    const history = { replaceState: (a, b, url) => { __calls.replaced.push(String(url)); } };
    const api = { get: async (u) => (__apiResp[u] !== undefined ? __apiResp[u] : null) };
    const pzBoostNormPost = (e) => e;
    const pzBoostKey = (e) => String((e && (e.post_id || e.ig_media_id)) || '');
    const pzBoostImpulsados = new Set();
    function pzAdsPintar() { __calls.pintar++; }
    function pzBoostPintarBoost() { __calls.pintarBoost++; }
    function pzBoostMotivo(m) { return 'MOTIVO:' + String(m || ''); }
  `;
  const driver = `
    globalThis.__x = {
      pzBoostNewState, pzBoostGate, pzAdsPaginaSinAutorizar, pzBoostLoad,
      pzAdsAutorizarPagina, pzBoostConectarCuenta, handleIgAdsResult,
      calls: __calls, els: __els, loc: __loc,
      setApi: (m) => { __apiResp = m; },
      getState: () => pzBoostState, setState: (v) => { pzBoostState = v; },
    };
  `;
  const sandbox = { console, URLSearchParams };
  vm.createContext(sandbox);
  vm.runInContext(prelude + '\n' + parts.join('\n') + '\n' + driver, sandbox);
  const X = sandbox.__x;
  const ELIG = '/api/ads/billetera/elegibles?incluir_impulsados=1';
  const apiCerrado = { '/api/ads/billetera': { ok: true }, [ELIG]: { ok: true, ads_ready: false, motivo: 'ads_not_connected', connect_url: '/api/ig/unified/go', elegibles: [] } };
  const apiCerradoSinFlujo = { '/api/ads/billetera': { ok: true }, [ELIG]: { ok: true, ads_ready: false, motivo: 'ads_not_connected', elegibles: [] } };
  const apiAbierto = { '/api/ads/billetera': { ok: true }, [ELIG]: { ok: true, ads_ready: true, elegibles: [] } };

  // gate y reducido
  X.setState(X.pzBoostNewState());
  t(X.getState().connectUrl === '', 'B1 el estado nace sin connect_url');
  X.getState().adsReady = false; X.getState().motivoGate = 'ads_not_connected';
  let g = X.pzBoostGate();
  t(g.cerrado === true && g.motivo === 'sin_cuenta_publicitaria', 'B2 ads_not_connected se mapea a sin_cuenta_publicitaria', JSON.stringify(g));
  t(X.pzAdsPaginaSinAutorizar() === true, 'B3 con ads_not_connected la tarjeta se reduce (el caso de la captura)');
  X.getState().motivoGate = 'page_not_authorized';
  g = X.pzBoostGate();
  t(g.motivo === 'sin_autorizacion_publicitaria' && X.pzAdsPaginaSinAutorizar() === true, 'B4 page_not_authorized sigue reduciendo la tarjeta');
  X.getState().adsReady = true;
  t(X.pzBoostGate().cerrado === false && X.pzAdsPaginaSinAutorizar() === false, 'B5 con la cuenta conectada la tarjeta NO se reduce: montos recién ahí');

  // pzBoostLoad captura el connect_url
  X.setApi(apiCerrado); X.setState(null);
  await X.pzBoostLoad();
  t(X.getState().connectUrl === '/api/ig/unified/go' && X.getState().motivoGate === 'ads_not_connected', 'B6 pzBoostLoad guarda el connect_url que ofrece el servidor');
  X.setApi(apiAbierto);
  await X.pzBoostLoad();
  t(X.getState().connectUrl === '', 'B7 con la cuenta lista el connect_url no viaja');

  // el botón de la tarjeta
  X.setApi(apiCerrado); X.setState(null); await X.pzBoostLoad();
  X.loc.href = '';
  const btn1 = { disabled: false, textContent: 'Conectar mi cuenta publicitaria' };
  await X.pzAdsAutorizarPagina(btn1);
  t(X.loc.href === '/api/ig/unified/go?next=' + encodeURIComponent('/#/app/ads'), 'B8 el toque abre el flujo unificado y la vuelta cae en la tarjeta de Ads', X.loc.href);
  X.setApi(apiCerradoSinFlujo); X.setState(null); await X.pzBoostLoad();
  X.loc.href = ''; delete X.els.pzAdsRecMsg;
  const btn2 = { disabled: false, textContent: 'Conectar mi cuenta publicitaria' };
  await X.pzAdsAutorizarPagina(btn2);
  t(X.loc.href === '' && btn2.disabled === false, 'B9 sin flujo habilitado no navega ni deja el botón trabado');
  t(X.els.pzAdsRecMsg && X.els.pzAdsRecMsg.textContent === 'MOTIVO:sin_cuenta_publicitaria', 'B10 sin flujo habilitado queda el motivo honesto inline', X.els.pzAdsRecMsg && X.els.pzAdsRecMsg.textContent);
  X.setApi(apiAbierto); X.setState(null); await X.pzBoostLoad();
  X.loc.href = ''; const pintarAntes = X.calls.pintar;
  await X.pzAdsAutorizarPagina({ disabled: false, textContent: 'x' });
  t(X.loc.href === '' && X.calls.pintar === pintarAntes + 1, 'B11 si la conexión ya está, el toque re-pinta la tarjeta completa en el acto');

  // el botón de la hoja
  X.setApi(apiCerrado); X.setState(null); await X.pzBoostLoad();
  X.loc.hash = '#/app/hoy'; X.loc.href = '';
  await X.pzBoostConectarCuenta({ disabled: false });
  t(X.loc.href === '/api/ig/unified/go?next=' + encodeURIComponent('/#/app/hoy'), 'B12 la hoja abre el flujo y la vuelta cae en la pantalla del cliente', X.loc.href);
  X.loc.hash = '#x"evil'; X.loc.href = '';
  await X.pzBoostConectarCuenta({ disabled: false });
  t(X.loc.href === '/api/ig/unified/go?next=' + encodeURIComponent('/#/app/ads'), 'B13 un hash no válido cae al destino seguro (la tarjeta de Ads)', X.loc.href);
  X.loc.hash = '#/app/ads';

  // la vuelta ?igads=
  X.calls.toasts.length = 0; X.calls.replaced.length = 0;
  X.loc.hash = '#/app/ads?igads=ok';
  X.handleIgAdsResult();
  t(X.calls.toasts.length === 1 && X.calls.toasts[0].includes('Cuenta publicitaria conectada'), 'B14 vuelta ok: se dice en el acto que la cuenta quedó conectada');
  t(X.calls.replaced.length === 1 && X.calls.replaced[0].endsWith('#/app/ads'), 'B15 el parámetro se limpia de la URL');
  X.calls.toasts.length = 0;
  X.loc.hash = '#/app/ads?igads=sin_cuenta';
  X.handleIgAdsResult();
  t(X.calls.toasts.length === 1 && X.calls.toasts[0].includes('Falta la cuenta publicitaria') && X.calls.toasts[0].includes('creala'), 'B16 vuelta sin_cuenta: estado honesto — conectó la Página, falta la cuenta (elegirla o crearla)');
  X.calls.toasts.length = 0;
  X.loc.hash = '#/app/ads?igads=error&msg=' + encodeURIComponent('Boom mal');
  X.handleIgAdsResult();
  t(X.calls.toasts.length === 1 && X.calls.toasts[0].includes('Boom mal'), 'B17 vuelta error: se muestra el error que devolvió Meta');
  X.calls.toasts.length = 0; X.calls.replaced.length = 0;
  X.loc.hash = '#/app/ads';
  X.handleIgAdsResult();
  t(X.calls.toasts.length === 0 && X.calls.replaced.length === 0, 'B18 sin ?igads= no pasa nada');

  console.log('== C. Boot real: elegibles viaja (o no) el connect_url ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'camino-ads-'));
  const dbFile = path.join(tmpDir, 'posta.db');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), NODE_PATH: NM,
    OPENAI_API_KEY: '', ADMIN_TOKEN: 'boot-test-token-camino-ads',
    META_FLB_CONFIG_ID: 'test-config-flb', IG_APP_ID: '123456', IG_APP_SECRET: 'test-secret',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += String(d); });
  child.stderr.on('data', (d) => { bootLog += String(d); });
  const dataDirAntes = fs.existsSync(path.join(ROOT, 'data'));
  async function reqJson(method, p, body, cookie, manual) {
    const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method, redirect: manual ? 'manual' : 'follow',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let json = null; try { json = JSON.parse(txt); } catch (e) {}
    return { status: r.status, json, location: r.headers.get('location') || '', setCookie: r.headers.get('set-cookie') || '' };
  }
  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'C0 el servidor del release levanta', bootLog.slice(-400));
    const sinSesion = await reqJson('GET', '/api/ads/billetera/elegibles?incluir_impulsados=1');
    t(sinSesion.status === 401, 'C1 elegibles sin sesión: 401', String(sinSesion.status));

    const regA = await reqJson('POST', '/api/auth/register', { email: 'camino-a@test.local', password: 'secreta123' });
    const cookieA = String(regA.setCookie).split(';')[0];
    t(!!cookieA && regA.status < 300, 'C2 registro del cliente A con cookie de sesión', String(regA.status));
    const e0 = await reqJson('GET', '/api/ads/billetera/elegibles?incluir_impulsados=1', null, cookieA);
    t(e0.json && e0.json.ads_ready === false && e0.json.motivo === 'ig_not_connected' && !('connect_url' in e0.json), 'C3 sin Instagram: motivo ig_not_connected y NINGÚN connect_url', JSON.stringify(e0.json).slice(0, 200));

    // Siembra: A conectó Instagram y pasó por el unificado SIN elegir
    // cuenta publicitaria (fila sin_cuenta, como la deja el callback).
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbFile);
    const uA = db.prepare('SELECT id FROM users WHERE email = ?').get('camino-a@test.local');
    const sA = db.prepare('SELECT user_id FROM settings WHERE user_id = ?').get(uA.id);
    if (sA) db.prepare('UPDATE settings SET ig_user_id = ? WHERE user_id = ?').run('111222', uA.id);
    else db.prepare('INSERT INTO settings (user_id, ig_user_id) VALUES (?, ?)').run(uA.id, '111222');
    db.prepare(`INSERT INTO ig_ads_connections
      (user_id, suat, client_business_id, config_id, ig_account_ids, fb_page_id, fb_page_name, ad_accounts, primary_ad_account_id, ad_currency, status, connected_at, updated_at)
      VALUES (?, 'TESTSUAT', '', 'test-config-flb', '[]', '999', 'Página A', '[]', '', '', 'sin_cuenta', datetime('now'), datetime('now'))`).run(uA.id);
    const e1 = await reqJson('GET', '/api/ads/billetera/elegibles?incluir_impulsados=1', null, cookieA);
    t(e1.json && e1.json.ads_ready === false && e1.json.motivo === 'ads_not_connected', 'C4 la fila sin_cuenta NO abre la compuerta (ads_ready false, sin cobro posible)', JSON.stringify(e1.json).slice(0, 200));
    t(e1.json && e1.json.connect_url === '/api/ig/unified/go', 'C5 y elegibles AHORA viaja el connect_url del flujo', e1.json && e1.json.connect_url);

    const regB = await reqJson('POST', '/api/auth/register', { email: 'camino-b@test.local', password: 'secreta123' });
    const cookieB = String(regB.setCookie).split(';')[0];
    const uB = db.prepare('SELECT id FROM users WHERE email = ?').get('camino-b@test.local');
    const sB = db.prepare('SELECT user_id FROM settings WHERE user_id = ?').get(uB.id);
    if (sB) db.prepare('UPDATE settings SET ig_user_id = ? WHERE user_id = ?').run('333444', uB.id);
    else db.prepare('INSERT INTO settings (user_id, ig_user_id) VALUES (?, ?)').run(uB.id, '333444');
    db.close();
    const e2 = await reqJson('GET', '/api/ads/billetera/elegibles?incluir_impulsados=1', null, cookieB);
    t(e2.json && e2.json.ads_ready === false && e2.json.motivo === 'ads_not_configured' && !('connect_url' in e2.json), 'C6 con IG pero sin riel ni captura: ads_not_configured y ningún connect_url (no se promete un paso que no aplica)', JSON.stringify(e2.json).slice(0, 200));

    const go = await reqJson('GET', '/api/ig/unified/go?next=' + encodeURIComponent('/#/app/ads'), null, cookieA, true);
    t(go.status === 302 && go.location.includes('facebook.com') && go.location.includes('config_id=test-config-flb'), 'C7 el destino del botón existe: /api/ig/unified/go redirige al diálogo FLB con el config_id', go.location.slice(0, 160));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  t(fs.existsSync(path.join(ROOT, 'data')) === dataDirAntes, 'C8 el boot no creó release/data/');

  console.log(`\nRESULTADO: ${pass} ok · ${fail} mal`);
  if (fails.length) { console.log('FALLAS:\n- ' + fails.join('\n- ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
