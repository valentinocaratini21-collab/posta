'use strict';
/* (LOTE ADS-TRABA-BILLETERA) Suite del lote: SECCIÓN A (la traba —
 * repintado en caliente: guardas de repintado/reentrada en los caminos
 * calientes de la pantalla de Ads) + SECCIÓN B (la billetera diseño 2
 * «La barra» dentro de la tarjeta única).
 *
 * Parte A — fuente: la entrada tibia pinta una sola vez y solo si el
 * estado visible cambió; los gestos (monto, elegir otro, filas, cerrar
 * elegir) repintan coalescidos por frame; el repintado de la audiencia
 * quedó DENTRO de pzAdsPintar; las funciones protegidas (la regla de
 * la diferencia y todo el circuito de impulso) byte-idénticas contra
 * la base; la tarjeta nueva trae el bloque TU BILLETERA primero, el
 * desglose siempre, el botón de la diferencia por el circuito de
 * siempre y la fila Billetera fuera de la tarjeta de filas; gate M78
 * (todo onclick que la vista nombra existe definido en el bundle).
 * Parte B — boot real del árbol release: /api/version, los tres
 * endpoints de Ads de siempre para una cuenta sembrada, y el bundle y
 * el CSS servidos con lo nuevo.
 * La QA caliente con navegador (ciclos de monto, salidas y vueltas,
 * fondo y vuelta, el ejemplo US$22/US$50/US$33 renderizado) corre en
 * verify-hot.py, al lado.
 *
 * Uso: node test-lote-ads-traba-billetera.js [puerto]
 *      LOTE_BASE_DIR=<árbol base> para la verificación byte-idéntica.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

let ok = 0, mal = 0;
const t = (name, cond, extra) => {
  if (cond) { ok++; console.log('  ok', name); }
  else { mal++; console.log('  MAL', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = __dirname;
const BASE_DIR = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const appBase = fs.readFileSync(path.join(BASE_DIR, 'public', 'app.js'), 'utf8');

function sliceFn(src, desde, hasta) {
  const a = src.indexOf(desde);
  if (a < 0) return '';
  const b = src.indexOf(hasta, a + desde.length);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

/* ================= Parte A — fuente ================= */
console.log('— Parte A · fuente (guardas calientes + diseño 2 + protegidas) —');
{
  // A1 · la entrada tibia: una sola pintura, y solo si cambió la firma.
  const adsView = sliceFn(app, 'async function adsView() {', 'function pzAdsEsqueleto() {');
  t('A1a adsView pinta la vuelta tibia con la guarda de firma (pzAdsPintarSiCambio)', adsView.includes('pzAdsPintarSiCambio()'));
  t('A1b adsView ya NO repinta incondicionalmente a los 400 ms (el doble pintado de la vuelta)',
    !adsView.includes("setTimeout(() => { try { pzAdsPintar(); } catch (e) {} }, 400);"), adsView.slice(-400));
  t('A1c el reintento a los 400 ms existe solo para la raíz ausente y también va guardado',
    adsView.includes('if (!pzAdsPintarSiCambio())') && adsView.includes('setTimeout(() => { try { pzAdsPintarSiCambio(); } catch (e) {} }, 400);'));

  // A2 · los gestos repintan coalescidos por frame, no uno por toque.
  const gestos = [
    ['pzAdsElegirMonto', 'function pzAdsElegirMonto(m) {', 'function pzAdsPickRowHTML() {'],
    ['pzAdsElegirOtro', 'function pzAdsElegirOtro(key) {', 'function pzAdsElegirMonto(m) {'],
    ['pzAdsFilaToggle', "function pzAdsFilaToggle(cual) {", 'async function pzAdsCambiarConexion(btn) {'],
    ['pzAdsElegirCerrar', 'function pzAdsElegirCerrar() {', 'function pzAdsElegirOtro(key) {'],
  ];
  for (const [nombre, desde, hasta] of gestos) {
    const f = sliceFn(app, desde, hasta);
    t(`A2 ${nombre} repinta por el camino coalescido (pzAdsPintarGesto) y no con el pintado pleno directo`,
      f.includes('pzAdsPintarGesto()') && !f.includes('pzAdsPintar();'), f.slice(0, 200));
  }

  // A3 · pzAdsPintar registra la firma y restaura la audiencia adentro.
  const pintar = sliceFn(app, 'function pzAdsPintar() {', 'async function pzAdsRefrescar() {');
  t('A3a pzAdsPintar registra la firma tras pintar (pzAdsUltimaFirma)', pintar.includes('pzAdsUltimaFirma = pzAdsFirma();'));
  t('A3b el repintado de la audiencia vive DENTRO de pzAdsPintar (después del innerHTML)',
    pintar.indexOf('pzAdsAudienciaRepintar()') > pintar.indexOf('root.innerHTML = pzAdsHTML();'));
  t('A3c las llamadas a pzAdsAudienciaRepintar son las mismas que en la base (la de pzAdsPintar + la de la hoja de impulso)',
    (app.split('pzAdsAudienciaRepintar();').length - 1) === (appBase.split('pzAdsAudienciaRepintar();').length - 1),
    'work=' + (app.split('pzAdsAudienciaRepintar();').length - 1) + ' base=' + (appBase.split('pzAdsAudienciaRepintar();').length - 1));

  // A1d · control contra la base: los defectos están en la fuente base.
  const adsViewBase = sliceFn(appBase, 'async function adsView() {', 'function pzAdsEsqueleto() {');
  t('A1d CONTROL base: la vuelta tibia de la base repinta incondicionalmente a los 400 ms (el doble pintado)',
    adsViewBase.includes("setTimeout(() => { try { pzAdsPintar(); } catch (e) {} }, 400);"));
  const filasBase = sliceFn(appBase, 'function pzAdsFilasHTML() {', 'function pzAdsFilaToggle(cual) {');
  t('A1e CONTROL base: la base sí trae la fila Billetera en la tarjeta de filas',
    filasBase.includes("fila('billetera'"));
  const montoBase = sliceFn(appBase, 'function pzAdsElegirMonto(m) {', 'function pzAdsHTML() {');
  t('A1f CONTROL base: en la base, cambiar de monto repinta pleno por toque (sin coalescer)',
    montoBase.includes('pzAdsPintar();') && !montoBase.includes('pzAdsPintarGesto'));

  // A4 · las funciones nuevas existen definidas.
  for (const f of ['function pzAdsFirma() {', 'function pzAdsPintarSiCambio() {', 'function pzAdsPintarGesto() {', 'function pzAdsBilleteraBloqueHTML(conTotal) {']) {
    t('A4 definida: ' + f.split('(')[0].replace('function ', ''), app.includes(f));
  }
  const gesto = sliceFn(app, 'function pzAdsPintarGesto() {', 'function pzAdsPintar() {');
  t('A4b el gesto se coalesce por frame (requestAnimationFrame + bandera de pendiente)',
    gesto.includes('requestAnimationFrame') && gesto.includes('pzAdsGestoPend'));

  // A5 · SECCIÓN B — la tarjeta nueva.
  const html = sliceFn(app, 'function pzAdsHTML() {', '// (LOTE ADS-TRABA-BILLETERA · SECCIÓN A) La firma');
  t('A5a el estado completo abre la tarjeta con el bloque billetera CON barra (conTotal=true)',
    html.includes('${pzAdsBilleteraBloqueHTML(true)}${kickHTML}'));
  t('A5b el botón corto es el del diseño 2 por el circuito de siempre (pzAdsTabCargarDiferencia) con su casilla de mensajes',
    html.includes('onclick="pzAdsTabCargarDiferencia(this)"') && html.includes('id="pzAdsDifTabMsg"') && html.includes('que faltan'));
  t('A5c el desglose se dice siempre (ya no lo apaga el cartel)', !html.includes("cartelActivo ? ''") && html.includes('${esc(desgloseTxt)}'));
  t('A5d el estado reducido (rama pzAdsPaginaSinAutorizar dentro de pzAdsHTML) también abre con el bloque billetera (sin barra)',
    html.includes('${pzAdsBilleteraBloqueHTML(false)}${kickHTML}<div class="pz-ads-rec-top">'));
  t('A5e el estado sin posteo también abre con el bloque billetera (sin barra)',
    html.includes('${pzAdsBilleteraBloqueHTML(false)}${kickHTML}<p class="pz-ads-note"'));
  const filas = sliceFn(app, 'function pzAdsFilasHTML() {', 'function pzAdsFilaToggle(cual) {');
  t('A5f la fila Billetera salió de la tarjeta de filas (ni fila ni detalle de billetera ahí)',
    !filas.includes("fila('billetera'") && !filas.includes('pzAdsBilleteraHTML()') && filas.includes("fila('conexion'") && filas.includes('Tus impulsos'));
  const bloque = sliceFn(app, 'function pzAdsBilleteraBloqueHTML(conTotal) {', 'function pzAdsHTML() {');
  t('A5g el bloque trae TU BILLETERA, la barra, el «X de Y» y el faltante con los números de la regla',
    bloque.includes('TU BILLETERA') && bloque.includes('pz-ads-bill-bar') && bloque.includes('pzBoostFmtMonto(falta)') && bloque.includes('pzAdsDiferencia()'));
  t('A5h el detalle de herramientas sigue siendo pzAdsBilleteraHTML tras el encabezado del bloque',
    bloque.includes("pzAdsFilaToggle('billetera')") && bloque.includes('${pzAdsBilleteraHTML()}'));

  // A6 · CSS del diseño 2.
  t('A6a el CSS trae la barra (riel #E8EDF1, relleno celeste de marca #2793C8, transición viva)',
    css.includes('.pz-ads-bill-bar{height:8px;border-radius:99px;background:#E8EDF1') && css.includes('background:#2793C8;transition:width .35s ease'));
  t('A6b el bloque no es una caja nueva (sin fondo propio: vive dentro de la tarjeta)',
    css.includes('.pz-ads-bill{border-bottom:1px solid rgba(16,42,67,.09)'));

  // A7 · funciones protegidas byte-idénticas contra la base.
  const PROTEGIDAS = [
    ['pzBoostTotal', 'function pzBoostTotal(monto) {', 'function pzBoostPuede(monto) {'],
    ['pzBoostPuede', 'function pzBoostPuede(monto) {', 'async function pzBoostImpulsarMonto(monto, btn) {'],
    ['pzBoostImpulsarMonto', 'async function pzBoostImpulsarMonto(monto, btn) {', 'async function pzBoostCargar(btn) {'],
    ['pzBoostCargar', 'async function pzBoostCargar(btn) {', 'function pzBoostFeePendienteAdjuntar'],
    ['pzBoostGate', 'function pzBoostGate() {', 'async function pzBoostLoad(opts) {'],
    ['pzBoostLoad', 'async function pzBoostLoad(opts) {', 'function pzBoostEnsureSheets() {'],
    ['pzAdsImpulsar', 'async function pzAdsImpulsar(monto, btn) {', 'function pzAdsImpulsarBloqueo(m) {'],
    ['pzAdsImpulsarBloqueo', 'function pzAdsImpulsarBloqueo(m) {', 'async function pzAdsImpulsarAdjuntarTarjeta(msgEl) {'],
    ['pzAdsCargar', 'async function pzAdsCargar(monto, btn) {', 'let pzBoostState = null;'],
    ['pzAdsApplePayElegir', 'function pzAdsApplePayElegir(monto, btn) {', 'async function pzAdsApplePayMontar() {'],
    ['pzAdsApplePayMontar', 'async function pzAdsApplePayMontar() {', 'async function pzAdsCargar(monto, btn) {'],
    ['pzAdsDiferencia', 'function pzAdsDiferencia() {', 'function pzAdsAudienciaDiferenciaHTML() {'],
    ['pzAdsAudienciaDiferenciaHTML', 'function pzAdsAudienciaDiferenciaHTML() {', 'async function pzAdsAudienciaCargarDiferencia(btn) {'],
    ['pzAdsAudienciaCargarDiferencia', 'async function pzAdsAudienciaCargarDiferencia(btn) {', 'function pzAdsTabDiferenciaHTML() {'],
    ['pzAdsTabDiferenciaHTML', 'function pzAdsTabDiferenciaHTML() {', 'async function pzAdsTabCargarDiferencia(btn) {'],
    ['pzAdsTabCargarDiferencia', 'async function pzAdsTabCargarDiferencia(btn) {', 'function pzBoostFeePendienteAdjuntar(msgEl) {'],
    ['pzBoostFeePendienteAdjuntar', 'function pzBoostFeePendienteAdjuntar(msgEl) {', 'async function pzAdsPagarFee(btn) {'],
    ['pzAdsPagarFee', 'async function pzAdsPagarFee(btn) {', 'function pzAdsAudienciaHTML() {'],
    ['pzAdsAudienciaHTML', 'function pzAdsAudienciaHTML() {', 'function pzAdsAudienciaPintar() {'],
    ['pzAdsBilleteraHTML', 'function pzAdsBilleteraHTML() {', '// (LOTE ADS-TARJETA-UNICA) La tarjeta de filas utilitarias'],
    ['pzAdsConexionHTML', 'function pzAdsConexionHTML() {', 'function pzAdsConexionValor() {'],
    ['pzAdsConexionValor', 'function pzAdsConexionValor() {', 'function pzAdsBilleteraHTML() {'],
    ['pzAdsHistorialHTML', 'function pzAdsHistorialHTML(boosts) {', 'function pzAdsRecLinea(p) {'],
    ['pzBoostPintarBoost', 'function pzBoostPintarBoost() {', 'function pzBoostPintarExito(p, monto) {'],
    ['pzBoostElegirMonto', 'function pzBoostElegirMonto(monto) {', 'function pzBoostToggleMontos() {'],
    ['pzBoostPickConfirmar', 'function pzBoostPickConfirmar() {', 'function pzBoostElegirMonto(monto) {'],
    ['pzAdsRefrescar', 'async function pzAdsRefrescar() {', 'async function pzAdsImpulsar(monto, btn) {'],
    ['pzAdsFeedAbrir', 'async function pzAdsFeedAbrir() {', 'function pzAdsFeedGridHTML() {'],
    ['pzAdsCambiarConexion', 'async function pzAdsCambiarConexion(btn) {', 'async function pzAdsFeedAbrir() {'],
    ['pzAdsAutorizarPagina', 'async function pzAdsAutorizarPagina(btn) {', 'async function pzBoostConectarCuenta(btn) {'],
  ];
  let protMal = [];
  for (const [nombre, desde, hasta] of PROTEGIDAS) {
    const b = sliceFn(appBase, desde, hasta), w = sliceFn(app, desde, hasta);
    if (!b || !w || b !== w) protMal.push(nombre);
  }
  t(`A7 las ${PROTEGIDAS.length} funciones protegidas (regla de la diferencia + circuito de impulso) byte-idénticas contra la base`,
    protMal.length === 0, protMal.join(','));

  // A8 · gate M78: todo onclick que la vista de Ads nombra existe en el bundle.
  const zonas = [
    sliceFn(app, 'function pzAdsBilleteraBloqueHTML(conTotal) {', 'function pzAdsHTML() {'),
    sliceFn(app, 'function pzAdsHTML() {', '// (LOTE ADS-TRABA-BILLETERA · SECCIÓN A) La firma'),
    sliceFn(app, 'function pzAdsFilasHTML() {', 'function pzAdsFilaToggle(cual) {'),
    sliceFn(app, 'function pzAdsBilleteraHTML() {', '// (LOTE ADS-TARJETA-UNICA) La tarjeta de filas utilitarias'),
    sliceFn(app, 'function pzAdsPickRowHTML() {', 'function pzAdsElegirHTML(cardHTML) {'),
    sliceFn(app, 'function pzAdsElegirHTML(cardHTML) {', 'function pzAdsFeedGridHTML() {'),
    sliceFn(app, 'function pzAdsPaginaSinAutorizar() {', 'async function pzAdsAutorizarPagina(btn) {'),
    sliceFn(app, 'function pzAdsConexionHTML() {', 'function pzAdsConexionValor() {'),
    sliceFn(app, 'function pzAdsHistorialHTML(boosts) {', 'function pzAdsRecLinea(p) {'),
  ].join('\n');
  const nombres = new Set();
  const PALABRAS_JS = new Set(['if', 'for', 'while', 'switch', 'return', 'catch']);
  for (const m of zonas.matchAll(/onclick="([A-Za-z_$][\w$]*)\(/g)) if (!PALABRAS_JS.has(m[1])) nombres.add(m[1]);
  const faltan = [...nombres].filter((n) =>
    !app.includes('function ' + n + '(') && !app.includes('async function ' + n + '(') &&
    !app.includes('const ' + n + ' =') && !app.includes('window.' + n + ' ='));
  t(`A8 gate M78: los ${nombres.size} onclick que la vista de Ads nombra existen definidos en el bundle`,
    faltan.length === 0, faltan.join(','));
  console.log('  · funciones auditadas (M78): ' + (nombres.size - faltan.length) + '/' + nombres.size);
}

/* ================= Parte B — boot real ================= */
const port = Number(process.argv[2] || 35431);
const ADMIN = 'adm-ads-suite';
function call(method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...(headers || {}) } }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) {} resolve({ status: res.statusCode, json: j, text: buf, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
function getText(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: buf }));
    }).on('error', reject);
  });
}

(async () => {
  console.log('— Parte B · boot real del árbol release —');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-ads-billetera-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', ADMIN_TOKEN: ADMIN, SUPERVISION_HOOK_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const v = await call('GET', '/api/version'); up = v.status === 200; } catch (e) { await sleep(500); }
    }
    t('B1 el servidor del árbol release levanta y responde /api/version', up, bootLog.slice(-300));

    let jar = '';
    const jarDe = (r) => { const sc = r.headers && r.headers['set-cookie']; if (sc && sc.length) jar = String(sc[0]).split(';')[0]; };
    const reg = await call('POST', '/api/auth/register', { email: 'ads-suite@example.com', password: 'secreto1' });
    jarDe(reg);
    t('B2 la cuenta de la suite se registra', reg.status === 200 || reg.status === 201, 'status ' + reg.status);
    const login = await call('POST', '/api/auth/login', { email: 'ads-suite@example.com', password: 'secreto1' }, jar ? { Cookie: jar } : {});
    jarDe(login);
    const cookie = jar ? { Cookie: jar } : {};
    t('B2b la cuenta de la suite entra (sesión por cookie)', !!jar, 'status ' + login.status);

    const bil = await call('GET', '/api/ads/billetera', null, cookie);
    t('B3 GET /api/ads/billetera responde con el saldo de siempre', bil.status === 200 && bil.json && typeof bil.json.balance_cents === 'number', 'status ' + bil.status + ' ' + String(bil.text).slice(0, 120));
    const ele = await call('GET', '/api/ads/billetera/elegibles?incluir_impulsados=1', null, cookie);
    t('B4 GET elegibles responde (la vista decide con ads_ready/conexion de siempre)', ele.status === 200 && !!ele.json, 'status ' + ele.status);
    const boo = await call('GET', '/api/ads/boosts', null, cookie);
    t('B5 GET /api/ads/boosts responde con la lista de siempre', boo.status === 200 && boo.json && Array.isArray(boo.json.boosts), 'status ' + boo.status);

    const served = await getText('/app.js');
    t('B6 el bundle servido trae el bloque billetera y las guardas calientes',
      served.status === 200 && served.text.includes('function pzAdsBilleteraBloqueHTML') && served.text.includes('function pzAdsPintarGesto') && served.text.includes('function pzAdsPintarSiCambio'));
    const servedCss = await getText('/styles.css');
    t('B7 el CSS servido trae la barra del diseño 2', servedCss.status === 200 && servedCss.text.includes('.pz-ads-bill-bar'));
  } catch (e) {
    t('B la suite de boot corre sin excepciones', false, e && e.message);
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nRESULTADO: ${ok} ok · ${mal} mal`);
  process.exit(mal ? 1 : 0);
})();
