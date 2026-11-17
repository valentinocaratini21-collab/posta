// test-lote-tarjeta-simple.js — LOTE TARJETA-SIMPLE (órdenes de
// Valentino 17/11: «Saca lo de "otra gente" y "quien te compra" paso
// innecesario» + la suma aprobada el mismo día: la pantalla explica
// de dónde sale cada dólar según el riel, antes de confirmar).
//
// EL LOTE:
//  1) SALE la §1 «¿Quién te compra?» de la tarjeta de audiencia
//     ENTERA: la frase del comprador (solo lectura, caía al fallback
//     genérico), los chips de intereses editables y el botón
//     «+ Otra gente» — cuyo toque eyectaba al cliente de la tarjeta
//     al chat (location.hash a #/app/chat): el defecto muere con la
//     sección. Con ella sale la maquinaria que solo la servía (la
//     espera PZ_ADS_OG_ESPERA, su hook en chatExchange, el refresco
//     del pendiente y el aceptar/descartar del chip ★). Los
//     endpoints del servidor (/audiencia/tema y /audiencia/
//     pendiente) pierden su único llamador y quedan dormidos, sin
//     tocar (precedente SIN-VETO).
//  2) El público ESTUDIADO sigue aplicando por debajo: la tarjeta
//     ya no muestra ni edita intereses — y ya ni los manda en el
//     POST (pzBoostConfirmar los quita de la copia que viaja):
//     validarAudiencia los completa desde la propuesta (lo no
//     mencionado queda como estaba), así que el targeting final
//     conserva los intereses de la propuesta enteros. El servidor
//     NO necesitó cambio en validarAudiencia (se prueba en §C).
//  3) La línea de dinero sobre el «Sale así»: el riel que va a
//     correr lo dice el servidor en /elegibles (su gate ya lo
//     calcula; la respuesta ahora lo expone como `riel` — el único
//     toque de server.js del lote) y pzBoostLoad lo guarda como
//     s.rielAds. 'cliente' → la pauta la cobra Meta en la cuenta
//     del cliente y Posty cobra solo el 10% a la tarjeta guardada,
//     solo si la campaña sale · 'billetera' → la pauta sale de la
//     billetera de Posty · sin riel conocido, no se afirma nada.
//
// Qué prueba:
//  A (estático): la §1 y su maquinaria fuera del bundle; la tarjeta
//     conserva alcance/objetivo/edades/género/parecido/Sale así en
//     orden; la línea de dinero y sus 4 textos; el payload sin
//     intereses; el riel en /elegibles; invariantes (error v1160,
//     meta_ads.js y chunk-ajustes.js byte a byte, sellos).
//  B (VM con DOM mínimo): la tarjeta pintada sin §1 ni intereses,
//     con las secciones en orden; la línea de dinero correcta por
//     riel en ES y EN (y ausente sin riel); el bloque de error de
//     v1160 vivo en su ranura; pzBoostConfirmar manda el payload
//     sin intereses y con el resto de la elección intacta.
//  C (ads-audiencia.js real): validarAudiencia acepta la audiencia
//     SIN intereses y la completa con los de la propuesta;
//     resolverTargeting termina con esos intereses en el targeting.
//  D (boot real): el servidor sirve el build de la base (el builder
//     no estampa) y el bundle servido trae el lote.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-tarjeta-simple.js
// (desde el árbol del lote; para el control, copiar a pristine/ y correr ahí.
//  El §D resuelve NODE_PATH para el hijo: el del entorno si existe, o el
//  node_modules de posta.)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PRISTINE = path.join(ROOT, '..', 'pristine');
const PORT = 35397;

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}

// ---------- A. Estático ----------
console.log('== A. Estático ==');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const appCode = stripComments(appSrc);
const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
{
  const html = fnFrom(appCode, 'function pzAdsAudienciaHTML()');
  t(html.length > 0, 'A1 pzAdsAudienciaHTML existe');
  t(!html.includes('QUIÉN TE COMPRA') && !html.includes('WHO BUYS FROM YOU') && !html.includes('comprador_texto') && !html.includes('seccionComprador'),
    'A2 [FIX] la §1 «¿Quién te compra?» y la frase del comprador fuera de la tarjeta');
  t(!html.includes('pzAdsAudienciaInteres') && !html.includes('pzAdsAudienciaOtraGente') && !html.includes('pzAdsAudienciaAceptarExtra') && !html.includes('pzAdsAudienciaDescartarExtra'),
    'A3 [FIX] ni chips de intereses ni «+ Otra gente» ni chip ★ en la tarjeta');
  for (const f of ['function pzAdsAudienciaOtraGente(', 'function pzAdsAudienciaInteres(', 'function pzAdsAudienciaAceptarExtra(', 'function pzAdsAudienciaDescartarExtra(', 'function pzAdsAudienciaRefrescarPendiente(', 'PZ_ADS_OG_ESPERA']) {
    t(!appCode.includes(f), 'A4 [FIX] fuera del bundle: ' + f.replace('function ', '').replace('(', ''));
  }
  t(!appCode.includes("location.hash = '#/app/chat'") || fnFrom(appCode, 'function pzAdsAudienciaOtraGente(') === '',
    'A5 [FIX] el salto que eyectaba al chat murió con la sección');
  const orden = ['¿DÓNDE ESTÁN?', '¿QUÉ QUERÉS QUE HAGAN?', 'EDADES', 'QUIÉNES', 'PARECIDO A TUS SEGUIDORES', 'pzAdsAudienciaDineroHTML()', 'id="pzAdsAudienciaError"', "pzAdsAudienciaSale(this)"];
  const idx = orden.map((s) => html.indexOf(s));
  t(idx.every((v) => v >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]),
    'A6 [FIX] la tarjeta conserva alcance · objetivo · edades · quiénes · parecido · dinero · error · Sale así, en orden', JSON.stringify(idx));
  const dinero = fnFrom(appCode, 'function pzAdsAudienciaDineroHTML()');
  t(dinero.length > 0, 'A7 [FIX] pzAdsAudienciaDineroHTML existe');
  t(dinero.includes('La pauta la paga Meta desde tu cuenta publicitaria. Posty te cobra') && dinero.includes('(10%) en tu tarjeta guardada, solo si la campaña sale.'),
    'A8 [FIX] texto riel cliente ES con el fee');
  t(dinero.includes('Meta charges the ad spend to your own ad account. Posty charges') && dinero.includes('(10%) to your saved card, only if the campaign runs.'),
    'A9 [FIX] texto riel cliente EN con el fee');
  t(dinero.includes('La pauta sale de tu billetera de Posty.') && dinero.includes('The ad spend comes out of your Posty wallet.'),
    'A10 [FIX] texto riel billetera ES/EN');
  t(dinero.includes("s.rielAds !== 'cliente' && s.rielAds !== 'billetera'") && dinero.includes("return '';"),
    'A11 [FIX] sin riel conocido no se afirma nada');
  const conf = fnFrom(appCode, 'async function pzBoostConfirmar(btn, enTarjeta)');
  t(conf.includes('delete audSinIntereses.intereses') && !conf.includes('body.audiencia = s.audienciaSel'),
    'A12 [FIX] pzBoostConfirmar ya no manda los intereses del cliente');
  const load = fnFrom(appCode, 'async function pzBoostLoad()');
  t(load.includes('s.rielAds') && load.includes('elig.riel'), 'A13 [FIX] pzBoostLoad guarda el riel de /elegibles');
  t(srvSrc.includes("riel: gate.via === 'cliente' ? 'cliente' : 'billetera'"),
    'A14 [FIX] /elegibles expone el riel del gate (único toque de server.js)');
  t(fnFrom(appCode, 'function pzBoostErrorHTML(motivo, monto, cobroId)').length > 0 && html.includes('id="pzAdsAudienciaError"'),
    'A15 [INVARIANTE] el bloque de error de v1160 sigue presente en su ranura');
  const buildTree = (srvSrc.match(/BUILD_ID = '([^']+)'/) || [])[1];
  const buildPristine = (fs.readFileSync(path.join(PRISTINE, 'server.js'), 'utf8').match(/BUILD_ID = '([^']+)'/) || [])[1];
  t(buildTree === buildPristine && !!buildTree, 'A16 [INVARIANTE] BUILD_ID intacto (el builder no estampa)', buildTree + ' vs ' + buildPristine);
  t(fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8') === fs.readFileSync(path.join(PRISTINE, 'meta_ads.js'), 'utf8'),
    'A17 [INVARIANTE] meta_ads.js byte a byte (la cadena de creación no se tocó)');
  t(fs.readFileSync(path.join(ROOT, 'public/chunk-ajustes.js'), 'utf8') === fs.readFileSync(path.join(PRISTINE, 'public/chunk-ajustes.js'), 'utf8'),
    'A18 [INVARIANTE] chunk-ajustes.js byte a byte');
}

// ---------- B. VM con DOM mínimo ----------
console.log('== B. Comportamiento (VM) ==');
const A = require(path.join(ROOT, 'ads-audiencia.js'));
const fund = { categoria: 'cafeteria', ciudad: 'Rosario', pais: 'AR', lang: 'es', clienteIdeal: '', audienciaTexto: '', cta: 'escribirte' };
const propuesta = A.propuestaDesdeFundamento(fund);

const piezas = [
  (appSrc.match(/const PZ_AUD_CHIP = [^\n]+/) || [''])[0],
  (appSrc.match(/const PZ_AUD_CHIP_SEL = [^\n]+/) || [''])[0],
  fnFrom(appSrc, 'function pzBoostEsMP()'),
  fnFrom(appSrc, 'function pzBoostFmtMonto(n)'),
  fnFrom(appSrc, 'function pzBoostKey(p)'),
  fnFrom(appSrc, 'function pzAdsAudienciaKey(p, monto)'),
  fnFrom(appSrc, 'function pzAdsAudienciaTexto(sel)'),
  fnFrom(appSrc, 'function pzAdsAudienciaDineroHTML()'),
  fnFrom(appSrc, 'function pzAdsAudienciaHTML()'),
  fnFrom(appSrc, 'function pzBoostErrorHTML(motivo, monto, cobroId)'),
  fnFrom(appSrc, 'async function pzBoostConfirmar(btn, enTarjeta)'),
].join('\n');
t(piezas.includes('pzAdsAudienciaDineroHTML') && piezas.includes('pzBoostConfirmar'), 'B0 las piezas de la tarjeta extraen enteras del bundle');

const sandbox = {
  console, Set, JSON, Number, String, Math, Object, Array, Promise,
  ME: { lang: 'es' },
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  gzT: (es, en) => (sandbox.ME.lang === 'en' ? en : es),
  api: { post: async () => ({ ok: true }), get: async () => null },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  toast: () => {},
  pzBoostImpulsados: new Set(),
  pzBoostMarcarImpulsado: () => {},
  pzBoostPintarExito: () => {},
  pzBoostMotivo: () => '',
  pzBoostPintarError: () => false,
  pzAdsImpulsarAdjuntarTarjeta: () => {},
  pzAdsAudienciaMostrar: async () => true,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('let pzBoostState = null;\n' + piezas, sandbox);
const enVM = (expr) => vm.runInContext(expr, sandbox);
const ponerEstado = (extra) => {
  sandbox.__prop = propuesta;
  sandbox.__extra = extra || {};
  enVM(`pzBoostState = Object.assign({
    elegibles: [], billetera: { billing_provider: 'stripe', balance_cents: 2000, currency: 'USD' },
    adsReady: true, motivoGate: '', connectUrl: '', rielAds: '',
    selId: 'p42', selMonto: 20, selPost: { post_id: 42, caption: 'un posteo' },
    audienciaProp: __prop, audienciaSel: JSON.parse(JSON.stringify(__prop.audiencia)),
    audienciaObjetivo: __prop.objetivo, audienciaKey: '', boostError: null, audienciaVisible: true,
  }, __extra);`);
};

(async () => {
  // B1–B3: la tarjeta sin §1, con las secciones en orden (ES)
  ponerEstado({ rielAds: 'cliente' });
  const htmlES = enVM('pzAdsAudienciaHTML()');
  t(!htmlES.includes('QUIÉN TE COMPRA') && !htmlES.includes('Otra gente') && !htmlES.includes('Other people'),
    'B1 [FIX] la tarjeta pintada no trae la §1 ni el botón «+ Otra gente»');
  const nombresIntereses = propuesta.audiencia.intereses.map((i) => i.nombre);
  t(!htmlES.includes(propuesta.comprador_texto) && nombresIntereses.every((n) => !htmlES.includes(n)),
    'B2 [FIX] la tarjeta pintada no muestra ni la frase del comprador ni ningún interés', propuesta.comprador_texto);
  const ordenES = ['¿DÓNDE ESTÁN?', '¿QUÉ QUERÉS QUE HAGAN?', 'EDADES', 'QUIÉNES', 'PARECIDO A TUS SEGUIDORES', 'La pauta la paga Meta', 'Sale así 🚀'];
  const idxES = ordenES.map((s) => htmlES.indexOf(s));
  t(idxES.every((v) => v >= 0) && idxES.every((v, i) => i === 0 || v > idxES[i - 1]),
    'B3 [FIX] secciones en orden y la línea de dinero ANTES del «Sale así»', JSON.stringify(idxES));
  const resumen = enVM('pzAdsAudienciaTexto(pzBoostState.audienciaSel)');
  t(!/les gusta|into /.test(resumen) && nombresIntereses.every((n) => !resumen.includes(n)),
    'B4 [FIX] el resumen de la tarjeta ya no nombra intereses', resumen);

  // B5–B8: la línea de dinero por riel y lengua
  t(htmlES.includes('La pauta la paga Meta desde tu cuenta publicitaria. Posty te cobra US$2 (10%) en tu tarjeta guardada, solo si la campaña sale.'),
    'B5 [FIX] riel cliente ES: Meta cobra la pauta y Posty US$2 (10% de US$20) solo si sale');
  sandbox.ME.lang = 'en';
  ponerEstado({ rielAds: 'cliente', selMonto: 50 });
  const htmlEN = enVM('pzAdsAudienciaHTML()');
  t(htmlEN.includes('Meta charges the ad spend to your own ad account. Posty charges US$5 (10%) to your saved card, only if the campaign runs.'),
    'B6 [FIX] riel cliente EN: el fee sigue al monto (US$5 sobre US$50)');
  sandbox.ME.lang = 'es';
  ponerEstado({ rielAds: 'billetera' });
  const htmlBil = enVM('pzAdsAudienciaHTML()');
  t(htmlBil.includes('La pauta sale de tu billetera de Posty.') && !htmlBil.includes('cuenta publicitaria'),
    'B7 [FIX] riel billetera ES: la pauta sale de la billetera, sin mención a la cuenta del cliente');
  sandbox.ME.lang = 'en';
  ponerEstado({ rielAds: 'billetera' });
  t(enVM('pzAdsAudienciaHTML()').includes('The ad spend comes out of your Posty wallet.'),
    'B8 [FIX] riel billetera EN');
  sandbox.ME.lang = 'es';
  ponerEstado({ rielAds: '' });
  const htmlSin = enVM('pzAdsAudienciaHTML()');
  t(!htmlSin.includes('billetera de Posty') && !htmlSin.includes('cuenta publicitaria'),
    'B9 [FIX] sin riel conocido la tarjeta no afirma ningún origen del dinero');

  // B10: el bloque de error de v1160 sigue vivo en la tarjeta
  ponerEstado({ rielAds: 'cliente', boostError: { motivo: 'anuncio_fallido', monto: 20, cobroId: null } });
  const htmlErr = enVM('pzAdsAudienciaHTML()');
  t(htmlErr.includes('id="pzAdsAudienciaError"') && htmlErr.includes('Meta no aceptó la campaña.') && htmlErr.includes('No se cobró nada.'),
    'B10 [INVARIANTE] el error de creación se sigue viendo en la tarjeta (v1160)');

  // B11: el payload de pzBoostConfirmar — sin intereses, el resto intacto
  ponerEstado({ rielAds: 'cliente' });
  enVM('pzBoostState.audienciaKey = pzAdsAudienciaKey(pzBoostState.selPost, 20)');
  sandbox.__capturado = null;
  sandbox.api.post = async (url, body) => { sandbox.__capturado = { url, body }; return { ok: true, balance_cents: 2000 }; };
  const j = await enVM('pzBoostConfirmar(null, true)');
  const cap = sandbox.__capturado || {};
  t(j && j.ok === true && cap.url === '/api/ads/billetera/impulsar', 'B11a el confirmar llega al POST de impulsar');
  t(cap.body && cap.body.posteoId === 42 && cap.body.montoUSD === 20, 'B11b el payload conserva posteo y monto', JSON.stringify(cap.body || {}).slice(0, 200));
  const aud = (cap.body && cap.body.audiencia) || {};
  t(cap.body && !('intereses' in aud), 'B11c [FIX] el payload ya NO lleva intereses del cliente', JSON.stringify(aud).slice(0, 200));
  t(aud.alcance === propuesta.audiencia.alcance && aud.edad_min === propuesta.audiencia.edad_min && aud.edad_max === propuesta.audiencia.edad_max
    && aud.genero === propuesta.audiencia.genero && aud.parecidos === propuesta.audiencia.parecidos && aud.radio_km === propuesta.audiencia.radio_km
    && aud.objetivo === propuesta.objetivo,
    'B11d la elección que viaja conserva alcance, radio, edades, género, parecidos y objetivo');

  // ---------- C. Servidor (ads-audiencia.js real) ----------
  console.log('== C. validarAudiencia sin intereses (módulo real) ==');
  const audSinIntereses = { ...JSON.parse(JSON.stringify(propuesta.audiencia)), objetivo: propuesta.objetivo };
  delete audSinIntereses.intereses;
  const val = A.validarAudiencia(audSinIntereses, propuesta);
  t(val.ok === true, 'C1 [INVARIANTE] validarAudiencia ACEPTA la audiencia sin el campo intereses (no hizo falta tocar el servidor)', JSON.stringify(val).slice(0, 200));
  t(val.ok && JSON.stringify(val.audiencia.intereses) === JSON.stringify(propuesta.audiencia.intereses),
    'C2 la audiencia validada conserva TODOS los intereses de la propuesta, como estaban');
  const valUndef = A.validarAudiencia({ ...audSinIntereses, intereses: undefined }, propuesta);
  t(valUndef.ok === true, 'C3 con intereses: undefined también valida');
  const metaMock = {
    async searchInterestId(nombre) { return { id: 'id-' + nombre, name: nombre }; },
    async searchGeo(q) { return { key: 'city-' + q, name: q, latitude: -32.95, longitude: -60.64 }; },
    async findLookalikeAudienceId() { return null; },
  };
  const rt = await A.resolverTargeting(val.audiencia, propuesta, metaMock);
  const idsTargeting = (((rt.targeting || {}).flexible_spec || [])[0] || {}).interests || [];
  t(idsTargeting.length === propuesta.audiencia.intereses.length
    && propuesta.audiencia.intereses.every((p) => idsTargeting.some((x) => x.name === p.nombre)),
    'C4 el targeting final conserva los intereses de la propuesta enteros', JSON.stringify(idsTargeting).slice(0, 200));

  // ---------- D. Boot real ----------
  console.log('== D. Boot real ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarjeta-simple-'));
  const nmCandidatos = [process.env.NODE_PATH, '/home/hatch/workspace/posta/node_modules', '/home/hatch/workspace/.lote-voz/tree/node_modules'];
  const nm = nmCandidatos.find((p) => p && fs.existsSync(path.join(p, 'express'))) || '';
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, NODE_PATH: nm };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let version = null, served = '';
  try {
    for (let i = 0; i < 40 && !version; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) version = await r.json(); } catch (e) {}
      if (!version) await new Promise((r) => setTimeout(r, 500));
    }
    t(!!version, 'D1 el servidor del árbol bootea y responde /api/version');
    const buildSrc = (srvSrc.match(/BUILD_ID = '([^']+)'/) || [])[1];
    t(version && version.build === buildSrc, 'D2 el build servido es el de la base (el builder no estampa)', version && version.build);
    try { const r = await fetch(`http://127.0.0.1:${PORT}/app.js`); served = await r.text(); } catch (e) {}
    t(served.includes('pzAdsAudienciaDineroHTML') && !served.includes('pzAdsAudienciaOtraGente'),
      'D3 [FIX] el bundle servido trae la línea de dinero y no trae la maquinaria «otra gente»');
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 700));
    try { child.kill('SIGKILL'); } catch (e) {}
  }
  let puertoLibre = false;
  try { await fetch(`http://127.0.0.1:${PORT}/api/version`); } catch (e) { puertoLibre = true; }
  t(puertoLibre, 'D4 el puerto ' + PORT + ' quedó libre');

  console.log(`\nRESULTADO: ${pass}/${pass + fail} ok · ${fail} mal`);
  if (fails.length) console.log('FALLAN:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
