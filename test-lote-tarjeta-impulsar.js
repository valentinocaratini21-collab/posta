// test-lote-tarjeta-impulsar.js — LOTE TARJETA-IMPULSAR
// Valentino 13/11 13:15: «genial. arma esos cambios» sobre el mock
// mock-impulsar-v3: la tarjeta de Impulsar del tab Ads con UNA línea
// de Posty con los números reales, montos que se eligen (el botón
// grande refleja la elección), garantía en una línea, sin «Elegir
// otro posteo» (pasan las 3 recomendaciones chicas con datos reales),
// «Tus impulsos» vacío en una línea y, sin Página autorizada, la
// tarjeta reducida a «Autorizar mi Página».
// ADDENDUM 13/11 13:35 (modelo decidido por Valentino): los montos
// son la PAUTA del cliente (Meta le cobra desde su cuenta) y la
// gestión de Posty es el 10% APARTE: la tarjeta muestra el desglose
// en una línea y el botón dice el TOTAL ($50 + $5 = US$ 55); la
// garantía pasa a la regla del fee («Si el anuncio no se crea o no
// queda corriendo, no se cobra nada.») y ningún texto de la tarjeta
// menciona billetera ni crédito. El cobro del fee es del lote
// FEE-IMPULSAR: acá solo se muestra.
// Uso: node release/test-lote-tarjeta-impulsar.js (desde la RAÍZ del
// scratch; ROOT = release/, FUSION = ../base-fusion). Boot en el
// puerto 35010 con DATA_DIR temporal en /tmp: NO crea release/data/ y
// NO cobra nada — el impulso se prueba con el api.post simulado.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const ROOT = __dirname;
const FUSION = path.join(ROOT, '..', 'base-fusion');

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  FAIL: ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}
function count(str, sub) { return str.split(sub).length - 1; }
function countRe(str, re) { return (str.match(re) || []).length; }

// ---------- extractor de funciones por llaves balanceadas ----------
// Escáner con pila de contextos (código / template literal): el
// extractor histórico de la casa no puede con pzAdsHTML ni
// pzAdsHistorialHTML (quedan trabadas en modo template — verificado
// contra la base-fusión intacta: es una limitación previa, no de este
// lote) porque esas funciones anidan templates dentro de ${}. Esta
// versión apila un marco por ${} y por template, y valida que lo
// extraído compile.
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

const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const idxEs = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const fusApp = fs.readFileSync(path.join(FUSION, 'public', 'app.js'), 'utf8');
const fusServer = fs.readFileSync(path.join(FUSION, 'server.js'), 'utf8');
const fusIdxEn = fs.readFileSync(path.join(FUSION, 'public', 'en', 'index.html'), 'utf8');
const fusStyles = fs.readFileSync(path.join(FUSION, 'public', 'styles.css'), 'utf8');
const stylesSrc = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');

async function main() {
  console.log('== A. Estampado, alcance y textos ==');
  // (RE-PIN DEL PREPARADOR · causa: el builder no estampaba y la suite
  // pineaba el provisorio heredado de su base-fusión — BUILD v947 /
  // ?v=657 de IMPULSAR-DIRECTO —; al aterrizar sobre la base viva
  // v1049 el preparador estampa BUILD v1050 y app.js?v=718 solo en el
  // index ES. A1/A2/E1/E2 quedan pineados a esos valores y A3 compara
  // server.js ignorando SOLO la línea del BUILD_ID: el lote sigue sin
  // tocar server; index EN y styles quedan byte-idénticos.)
  t(count(serverSrc, '20261105-v1050') === 1, 'A1 BUILD v1050 x1 en server.js (estampado del preparador sobre la base viva v1049)');
  t(count(idxEs, 'app.js?v=718') === 1, 'A2 app.js?v=718 x1 en index ES (estampado del preparador)');
  const sinBuildId = (s) => s.replace(/const BUILD_ID = '[^']*';/, "const BUILD_ID = 'X';");
  t(sinBuildId(serverSrc) === sinBuildId(fusServer), 'A3 server.js idéntico a la base-fusión salvo la línea BUILD_ID (el lote no toca server)');
  t(idxEn === fusIdxEn, 'A4 index EN byte-idéntico a la base-fusión');
  t(stylesSrc === fusStyles, 'A5 styles.css byte-idéntico a la base-fusión (el diseño nuevo va inline)');
  const nuevas = ['pzAdsRecLinea', 'pzAdsPaginaSinAutorizar', 'pzAdsAutorizarPagina', 'pzAdsOtrosConDatos', 'pzAdsOtrosHTML', 'pzAdsElegirOtro', 'pzAdsElegirMonto'];
  for (const n of nuevas) t(!!extractFn(appSrc, n), 'A6 existe la función nueva ' + n);
  t(count(appSrc, 'function pzAdsAutorizarPagina(') === 1, 'A7 pzAdsAutorizarPagina definida UNA sola vez (único cable del botón)');
  const fnHTML = extractFn(appSrc, 'pzAdsHTML');
  t(!!fnHTML, 'A8 se extrae pzAdsHTML');
  t(fnHTML && !fnHTML.includes('pzAdsPickOpen()'), 'A9 la tarjeta ya NO llama al picker (sale «Elegir otro posteo» de la tarjeta)');
  t(fnHTML && !fnHTML.includes('pz-ads-other'), 'A10 sin el botón-link .pz-ads-other en la tarjeta');
  t(fnHTML && !fnHTML.includes('Por eso Posty te recomienda'), 'A11 sale la frase «Por eso Posty te recomienda este y no otro» de la tarjeta');
  const tagAt = fnHTML ? fnHTML.indexOf('pz-ads-tag') : -1;
  t(tagAt >= 0 && !fnHTML.slice(tagAt, tagAt + 120).includes('7 DÍAS'), 'A12 la etiqueta de la tarjeta ya no dice «RECOMENDADO · 7 DÍAS» (el render lo verifica en B1)');
  t(fnHTML && !fnHTML.includes('monedaChica') && !fnHTML.includes('<h4>'), 'A13 sin moneda bajo cada monto y sin el caption en <h4>');
  t(fnHTML && fnHTML.includes('pzAdsRecLinea(p)') && fnHTML.includes('pzAdsOtrosHTML(p)') && fnHTML.includes('pzAdsAutorizarPagina(this)') && fnHTML.includes('pzAdsElegirMonto('), 'A14 la tarjeta usa las piezas nuevas (línea, recomendaciones, autorizar, elegir monto)');
  t(count(appSrc, 'Si el anuncio no se crea o no queda corriendo, no se cobra nada.') === 1, 'A15 garantía del ADDENDUM (regla del fee, sin billetera) x1');
  t(count(appSrc, 'queda como crédito en tu billetera') === 0, 'A15b la garantía vieja de la billetera ya no existe en el bundle');
  t(fnHTML && count(fnHTML, 'de gestión de Posty') === 1, 'A15c el desglose pauta + gestión vive en la tarjeta (una plantilla = una línea)');
  t(count(appSrc, 'En dólares · dura 7 días') === 1, 'A16 «En dólares · dura 7 días» x1 en todo el bundle (una sola vez)');
  t(count(appSrc, 'Cuando lo hagas, aparece acá con sus números reales.') === 0, 'A17 la segunda frase del vacío de «Tus impulsos» ya no existe');
  t(count(appSrc, 'Este fue tu mejor posteo de la semana') === 2, 'A18 la línea del mejor posteo vive en pzAdsRecLinea y en la tarjeta reducida', count(appSrc, 'Este fue tu mejor posteo de la semana'));
  // Invariantes del lote base (IMPULSAR-DIRECTO): el flujo de un toque
  // no se toca.
  t(countRe(appSrc, /pzBoostConfirmar\(/g) === 3, 'A19 pzBoostConfirmar: 1 definición + 2 call sites (como en la base-fusión)', countRe(appSrc, /pzBoostConfirmar\(/g));
  t(count(appSrc, 'pzBoostOpen(p)') === 2, 'A20 pzBoostOpen(p) sigue solo en detalle y picker');
  t(count(appSrc, 'Impulsando…') === 1, 'A21 «Impulsando…» x1');
  t(!fusApp.includes('pzAdsAutorizarPagina') && !fusApp.includes('pzAdsElegirMonto'), 'A22 control: la base-fusión NO trae este lote');
  t(appSrc.split('\n').length - fusApp.split('\n').length === 171, 'A23 app.js +171 líneas netas vs base-fusión (+153 del rediseño, +18 del addendum del fee)', appSrc.split('\n').length - fusApp.split('\n').length);

  console.log('== B. VM de render e interacción (api simulada) ==');
  const renderFns = ['pzAdsHTML', 'pzAdsHistorialHTML', 'pzAdsMontosCarga', 'pzAdsRecLinea',
    'pzAdsPaginaSinAutorizar', 'pzAdsOtrosConDatos', 'pzAdsOtrosHTML', 'pzAdsElegirOtro',
    'pzAdsElegirMonto', 'pzAdsPintar', 'pzBoostGate', 'pzBoostMontos', 'pzBoostEsMP',
    'pzBoostFmtMonto', 'pzBoostSaldo', 'pzBoostSaldoUSD', 'pzBoostKey', 'pzBoostNewState'];
  let vmSrc = '';
  for (const n of renderFns) {
    const f = extractFn(appSrc, n);
    t(!!f, 'VM: se extrae ' + n);
    if (f) vmSrc += '\n' + f;
  }
  const rootEl = { innerHTML: '' };
  const sb = {
    console, setTimeout, clearTimeout,
    ME: { lang: 'es' },
    pzBoostState: null, pzAdsBoosts: [], pzAdsPickDesdeAds: false, pzApplePayMonto: 50,
    pzBoostImpulsados: new Set(),
    gzT: (es, en) => es,
    esc: (x) => String(x == null ? '' : x),
    document: { getElementById: (id) => (id === 'pzAdsRoot' ? rootEl : null) },
    window: {},
    pzAdsApplePayMontar: () => {},
    pzBoostMotivo: (motivo) => 'MOTIVO:' + motivo,
  };
  vm.createContext(sb);
  vm.runInContext(vmSrc, sb);
  const V = (name) => vm.runInContext(name, sb);
  const post = (o) => Object.assign({ post_id: 0, ig_media_id: '', solo_ig: false, image_path: '', caption: '', reach: 0, likes: 0, comments: 0, saves: 0, recomendado: false, ya_impulsado: false, viejo: false, publicado_en: '' }, o);
  const bilOK = () => ({ balance_cents: 10000, currency: 'USD', billing_provider: null, montos_usd: [20, 50, 100], tarjeta: { tiene: true, last4: '4242' } });
  function stBase(elegibles, selPost) {
    return { elegibles, billetera: bilOK(), adsReady: true, motivoGate: '', boostHabilitado: true, adsPermiso: true, conversionPendiente: false, selId: selPost ? V('pzBoostKey')(selPost) : '', selMonto: 50, selPost: selPost || null, montosAbierto: false };
  }
  const REC = post({ post_id: 11, ig_media_id: 'IG11', image_path: '/img/rec.jpg', caption: 'CAPTIONSECRETO tortas', reach: 4, likes: 2, recomendado: true });
  const O1 = post({ post_id: 12, ig_media_id: 'IG12', image_path: '/img/o1.jpg', caption: 'otro 1', reach: 3, likes: 1 });
  const O2 = post({ post_id: 13, ig_media_id: 'IG13', image_path: '/img/o2.jpg', caption: 'otro 2', reach: 3, likes: 2 });
  const O3 = post({ post_id: 14, ig_media_id: 'IG14', image_path: '/img/o3.jpg', caption: 'sin datos', reach: 0, likes: 0 });
  const O4 = post({ post_id: 15, ig_media_id: 'IG15', image_path: '/img/o4.jpg', caption: 'ya impulsado', reach: 9, likes: 9, ya_impulsado: true });

  // B1: tarjeta completa con datos reales.
  sb.pzBoostState = stBase([REC, O1, O2, O3, O4], REC); sb.pzAdsBoosts = []; sb.pzBoostImpulsados = new Set();
  let html = V('pzAdsHTML')();
  t(html.includes('Este fue tu mejor posteo de la semana: 4 de alcance y 2 me gusta. Mostralo más.'), 'B1 la línea trae X/Y exactos de la fuente (reach 4, likes 2)');
  t(!html.includes('CAPTIONSECRETO'), 'B1 el caption truncado ya no se muestra en la tarjeta');
  t(!html.includes('Por eso Posty te recomienda'), 'B1 sin la frase vieja de recomendación');
  t(html.includes('class="pz-ads-amount sel" onclick="pzAdsElegirMonto(50)"'), 'B1 el $50 nace seleccionado');
  t(html.includes('onclick="pzAdsElegirMonto(20)"') && html.includes('onclick="pzAdsElegirMonto(100)"'), 'B1 los montos se eligen con pzAdsElegirMonto');
  t(count(html, 'RECOMENDADO') === 1 && !html.includes('RECOMENDADO · 7 DÍAS'), 'B1 etiqueta RECOMENDADO sola, en el $50');
  t(count(html, 'En dólares · dura 7 días') === 1, 'B1 «En dólares · dura 7 días» UNA sola vez');
  t(html.includes('onclick="pzAdsImpulsar(50, this)"') && html.includes('Impulsar por US$ 55'), 'B1 el toque impulsa por la pauta (50) y el botón grande nace con el TOTAL: «Impulsar por US$ 55» (addendum 13/11)');
  t(html.includes('US$ 50 de pauta + US$ 5 de gestión de Posty = US$ 55'), 'B1 desglose en UNA línea antes del toque: pauta + gestión del 10% = total');
  t(html.includes('Si el anuncio no se crea o no queda corriendo, no se cobra nada.'), 'B1 garantía del addendum (regla del fee) en una línea, texto exacto');
  const cardTxt = (h) => h.slice(h.indexOf('pz-ads-rec-card'), h.indexOf('pz-ads-hist')).replace(/<[^>]*>/g, ' ');
  t(!/billetera|crédito|credito|wallet|credit/i.test(cardTxt(html)), 'B1 ningún TEXTO visible de LA TARJETA menciona billetera ni crédito (addendum)');
  t(html.includes('También podés impulsar') && html.includes('pzAdsElegirOtro(\'p12\')') && html.includes('pzAdsElegirOtro(\'p13\')'), 'B1 recomendaciones chicas con los dos posteos con datos');
  t(!html.includes('pzAdsElegirOtro(\'p14\')'), 'B1 el posteo SIN datos no entra a las recomendaciones');
  t(!html.includes('pzAdsElegirOtro(\'p15\')'), 'B1 el ya impulsado no entra a las recomendaciones');
  t(!html.includes('pzAdsElegirOtro(\'p11\')'), 'B1 el de la tarjeta grande no se repite en la lista');
  t(html.includes('Todavía no impulsaste ningún posteo.') && !html.includes('Cuando lo hagas'), 'B1 «Tus impulsos» vacío en UNA línea');

  // B2: cambiar el monto cambia el botón (y la selección).
  V('pzAdsElegirMonto')(20);
  html = rootEl.innerHTML;
  t(html.includes('class="pz-ads-amount sel" onclick="pzAdsElegirMonto(20)"'), 'B2 al elegir $20 el resaltado se mueve al $20');
  t(html.includes('class="pz-ads-amount" onclick="pzAdsElegirMonto(50)"'), 'B2 el $50 queda sin resaltar (su etiqueta RECOMENDADO sigue)');
  t(html.includes('onclick="pzAdsImpulsar(20, this)"') && html.includes('Impulsar por US$ 22'), 'B2 el botón grande refleja la selección con el total: «Impulsar por US$ 22»');
  t(html.includes('US$ 20 de pauta + US$ 2 de gestión de Posty = US$ 22'), 'B2 desglose $20: gestión de $2 (10%)');
  t(sb.pzBoostState.selMonto === 20, 'B2 selMonto queda en 20');
  V('pzAdsElegirMonto')(100);
  html = rootEl.innerHTML;
  t(html.includes('Impulsar por US$ 110') && html.includes('US$ 100 de pauta + US$ 10 de gestión de Posty = US$ 110'), 'B2b desglose $100: gestión de $10, total US$ 110');
  V('pzAdsElegirMonto')(50);
  html = rootEl.innerHTML;
  t(html.includes('Impulsar por US$ 55') && sb.pzBoostState.selMonto === 50, 'B2c volver a $50 restaura el total US$ 55');

  // B3: sin otros posteos con datos, la sección NO existe.
  sb.pzBoostState = stBase([REC], REC);
  html = V('pzAdsHTML')();
  t(!html.includes('También podés impulsar') && !html.includes('pzAdsElegirOtro'), 'B3 sin otros con datos: no hay sección de recomendaciones');
  sb.pzBoostState = stBase([REC, O3], REC);
  html = V('pzAdsHTML')();
  t(!html.includes('También podés impulsar'), 'B3b otros sin números no arman la sección');

  // B4: tocar una chica la sube a la grande y la grande vuelve a la lista.
  sb.pzBoostState = stBase([REC, O1, O2], REC); sb.pzBoostImpulsados = new Set();
  V('pzAdsElegirOtro')('p12');
  html = rootEl.innerHTML;
  t(html.includes('3 de alcance y 1 me gusta. Mostralo más.') && !html.includes('Este fue tu mejor posteo'), 'B4 la grande muestra el posteo tocado, sin atribuirle «tu mejor posteo»');
  t(html.includes('pzAdsElegirOtro(\'p11\')') && !html.includes('pzAdsElegirOtro(\'p12\')'), 'B4 el recomendado vuelve a la lista y el subido sale de ella');
  t(sb.pzBoostState.selId === 'p12' && sb.pzBoostState.selPost.post_id === 12, 'B4 la selección queda en el posteo tocado');

  // B5: la línea nunca inventa números.
  t(V('pzAdsRecLinea')(post({ recomendado: true, reach: 0, likes: 0 })) === 'Este fue tu mejor posteo de la semana. Mostralo más.', 'B5 sin métricas: la frase sale sin números');
  t(V('pzAdsRecLinea')(post({ recomendado: true, reach: 7, likes: 0 })) === 'Este fue tu mejor posteo de la semana: 7 de alcance. Mostralo más.', 'B5 solo alcance: va solo alcance');
  t(V('pzAdsRecLinea')(post({ recomendado: true, reach: 0, likes: 5 })) === 'Este fue tu mejor posteo de la semana: 5 me gusta. Mostralo más.', 'B5 solo me gusta: va solo me gusta');

  // B6: espejo EN de los textos nuevos.
  sb.ME = { lang: 'en' }; sb.gzT = (es, en) => en;
  sb.pzBoostState = stBase([REC, O1], REC);
  html = V('pzAdsHTML')();
  t(html.includes('This was your best post of the week: 4 reach and 2 likes. Show it to more people.'), 'B6 EN: la línea del mejor posteo');
  t(count(html, 'In dollars · lasts 7 days') === 1 && html.includes('If the ad isn’t created or doesn’t end up running, nothing is charged.'), 'B6 EN: duración una vez + garantía del addendum');
  t(html.includes('US$ 50 in ad spend + US$ 5 Posty management fee = US$ 55') && html.includes('Boost for US$ 55'), 'B6 EN: desglose y total en el botón');
  t(html.includes('You can also boost') && html.includes("You haven't boosted any post yet."), 'B6 EN: recomendaciones chicas e impulsos vacío');
  sb.ME = { lang: 'es' }; sb.gzT = (es, en) => es;

  console.log('== C. VM del flujo: el impulso sigue siendo el POST único del lote base ==');
  const flowFns = ['pzAdsImpulsar', 'pzAdsImpulsarBloqueo', 'pzAdsImpulsarAdjuntarTarjeta',
    'pzBoostConfirmar', 'pzBoostMotivo', 'pzBoostCargarMotivo', 'pzBoostGate', 'pzBoostPuede',
    'pzBoostSaldo', 'pzBoostSaldoUSD', 'pzBoostEsMP', 'pzBoostMontos', 'pzBoostMinTopup',
    'pzBoostFmtMonto', 'pzBoostNewState', 'pzBoostKey'];
  let flowSrc = '';
  for (const n of flowFns) {
    const f = extractFn(appSrc, n);
    t(!!f, 'VM flujo: se extrae ' + n);
    if (f) flowSrc += '\n' + f;
  }
  const els = {};
  const calls = { apiPost: [], refrescar: 0, marcar: [] };
  const sb2 = {
    console, setTimeout, clearTimeout,
    pzBoostState: null, pzAdsPickDesdeAds: false,
    pzBoostImpulsados: new Set(),
    gzT: (es, en) => es,
    esc: (x) => String(x == null ? '' : x),
    loadChunk: async () => {},
    anaAgregarTarjetaBtn: () => {},
    api: { post: async (p, b) => { calls.apiPost.push({ path: p, body: b }); return { ok: true, anuncioId: 'adT', posteoId: 11 }; }, get: async () => ({ ok: false }) },
    document: { getElementById: (id) => els[id] || null, querySelectorAll: () => [] },
    window: {},
    toast: () => {},
    pzBoostOpen: () => {},
    pzBoostPintarBoost: () => {},
    pzBoostCerrar: () => {},
    pzBoostPickOpen: () => {},
    pzBoostPintarExito: () => {},
    pzBoostMarcarImpulsado: (id) => { calls.marcar.push(id); },
    pzBoostLoad: async () => {},
    pzAdsRefrescar: async () => { calls.refrescar++; },
  };
  vm.createContext(sb2);
  vm.runInContext(flowSrc, sb2);
  els.pzAdsRecMsg = { textContent: '' };
  sb2.pzBoostState = stBase([REC, O1], REC); sb2.pzBoostState.selMonto = 20;
  const btnC = { disabled: false, textContent: 'Impulsar por US$ 20' };
  await sb2.pzAdsImpulsar(20, btnC);
  t(calls.apiPost.length === 1 && calls.apiPost[0].path === '/api/ads/billetera/impulsar' && calls.apiPost[0].body.montoUSD === 20 && calls.apiPost[0].body.posteoId === 11, 'C1 con $20 elegido, el botón grande hace UN solo POST de $20 al posteo de la tarjeta', JSON.stringify(calls.apiPost));
  t(calls.refrescar === 1 && calls.marcar.length === 1, 'C1 éxito: refresca el tab y marca el posteo (flujo del lote base intacto)');

  console.log('== D. VM: cliente externo sin Página resoluble -> tarjeta reducida ==');
  const autFns = ['pzAdsHTML', 'pzAdsHistorialHTML', 'pzAdsMontosCarga', 'pzAdsRecLinea',
    'pzAdsPaginaSinAutorizar', 'pzAdsAutorizarPagina', 'pzAdsOtrosConDatos', 'pzAdsOtrosHTML',
    'pzAdsElegirOtro', 'pzAdsElegirMonto', 'pzAdsPintar', 'pzBoostGate', 'pzBoostMontos',
    'pzBoostEsMP', 'pzBoostFmtMonto', 'pzBoostSaldo', 'pzBoostSaldoUSD', 'pzBoostKey',
    'pzBoostNewState', 'pzBoostNormPost', 'pzBoostLoad', 'pzBoostMotivo'];
  let autSrc = '';
  for (const n of autFns) {
    const f = extractFn(appSrc, n);
    t(!!f, 'VM autorización: se extrae ' + n);
    if (f) autSrc += '\n' + f;
  }
  const rootD = { innerHTML: '' };
  const msgD = { textContent: '' };
  let eligPayload = null;
  const sb3 = {
    console, setTimeout, clearTimeout,
    ME: { lang: 'es' },
    pzBoostState: null, pzAdsBoosts: [], pzAdsPickDesdeAds: false, pzApplePayMonto: 50,
    pzBoostImpulsados: new Set(),
    gzT: (es, en) => es,
    esc: (x) => String(x == null ? '' : x),
    document: { getElementById: (id) => (id === 'pzAdsRoot' ? rootD : (id === 'pzAdsRecMsg' ? msgD : null)) },
    window: {},
    pzAdsApplePayMontar: () => {},
    api: {
      get: async (p) => {
        if (p.indexOf('/api/ads/billetera/elegibles') === 0) return eligPayload;
        if (p === '/api/ads/billetera') return { ok: true, balance_cents: 10000, currency: 'USD', billing_provider: null, montos_usd: [20, 50, 100], tarjeta: { tiene: true, last4: '4242' } };
        return { ok: false };
      },
      post: async () => ({ ok: true }),
    },
  };
  vm.createContext(sb3);
  vm.runInContext(autSrc, sb3);
  const V3 = (name) => vm.runInContext(name, sb3);
  const eligCrudo = [
    { post_id: 11, ig_media_id: 'IG11', image_path: '/img/rec.jpg', caption: 'tortas', reach: 4, likes: 2, recomendado: true },
    { post_id: 12, ig_media_id: 'IG12', image_path: '/img/o1.jpg', caption: 'otro', reach: 3, likes: 1 },
  ];
  // D1: la tarjeta NACE reducida y sin ningún control de precios.
  eligPayload = { ok: true, ads_ready: false, motivo: 'page_not_authorized', elegibles: eligCrudo };
  await V3('pzBoostLoad')();
  html = V3('pzAdsHTML')();
  t(html.includes('Autorizar mi Página') && html.includes('onclick="pzAdsAutorizarPagina(this)"'), 'D1 tarjeta reducida: botón «Autorizar mi Página» por la función única');
  t(html.includes('Este fue tu mejor posteo de la semana. Para impulsarlo falta un solo toque: autorizar tu Página de Facebook.'), 'D1 la línea del estado reducido (mock)');
  t(html.includes('No se gastó nada.'), 'D1 «No se gastó nada.»');
  t(!html.includes('pzAdsElegirMonto') && !html.includes('pzAdsImpulsar(') && !html.includes('pz-ads-amount') && !html.includes('Impulsar por US$') && !html.includes('En dólares · dura 7 días'), 'D1 NINGÚN control de precios se renderiza en el estado reducido');
  t(!html.includes('pz-boost-warn'), 'D1 sin párrafo de error/aviso en la tarjeta reducida');
  const cardD1Txt = html.slice(html.indexOf('pz-ads-rec-card'), html.indexOf('pz-ads-hist')).replace(/<[^>]*>/g, ' ');
  t(!/crédito|credito|credit/i.test(cardD1Txt), 'D1 ningún texto visible de la tarjeta reducida menciona crédito (addendum)');
  t(html.includes('pz-ads-wallet'), 'D1 la billetera (sección hermana) queda como está');
  // D2: el toque re-verifica; si la Página sigue sin autorizar, el
  // motivo honesto queda inline y no se gasta nada.
  msgD.textContent = '';
  await V3('pzAdsAutorizarPagina')({ disabled: false, textContent: 'Autorizar mi Página' });
  t(rootD.innerHTML.includes('Autorizar mi Página') && !rootD.innerHTML.includes('pzAdsElegirMonto'), 'D2 tras el toque, sin autorización, la tarjeta sigue reducida');
  // (RE-PIN DEL PREPARADOR · causa: el texto del motivo
  // 'sin_autorizacion_publicitaria' lo redefine el lote de conexión,
  // que va DEBAJO de esta tarjeta — en la base-fusión del builder era
  // «Tu Página de Facebook todavía no autorizó…»; en la base viva
  // v1049, con el ADS COMPUESTO ya en vivo, pzBoostMotivo devuelve
  // «Para impulsar, conectá tu cuenta publicitaria: un toque en el
  // mismo flujo de conexión. No se gastó nada.». El comportamiento
  // pineado no cambia: tras re-verificar, el motivo honesto de
  // pzBoostMotivo queda inline y no se gasta nada.)
  t(msgD.textContent.includes('Para impulsar, conectá tu cuenta publicitaria'), 'D2 el motivo honesto queda inline tras re-verificar', msgD.textContent);
  // D3: si la autorización ya está, el mismo toque devuelve la tarjeta
  // completa.
  eligPayload = { ok: true, ads_ready: true, elegibles: eligCrudo };
  await V3('pzAdsAutorizarPagina')({ disabled: false, textContent: 'Autorizar mi Página' });
  t(rootD.innerHTML.includes('pzAdsElegirMonto(50)') && rootD.innerHTML.includes('Impulsar por US$ 55'), 'D3 con la Página autorizada, la tarjeta vuelve completa en el acto (botón con el total del addendum)');
  // D4: otros motivos de compuerta NO reducen la tarjeta. (Posteo
  // fresco: el REC compartido quedó marcado ya_impulsado por el
  // impulso exitoso de la sección C — pzBoostConfirmar muta el objeto
  // del estado al marcar, comportamiento de la base.)
  const REC4 = post({ post_id: 11, ig_media_id: 'IG11', image_path: '/img/rec.jpg', caption: 'tortas', reach: 4, likes: 2, recomendado: true });
  sb3.pzBoostState = stBase([REC4], REC4); sb3.pzBoostState.adsReady = false; sb3.pzBoostState.motivoGate = 'ig_not_connected';
  html = V3('pzAdsHTML')();
  t(!html.includes('pzAdsAutorizarPagina') && html.includes('pzAdsElegirMonto(50)'), 'D4 Instagram sin conectar: tarjeta completa con su aviso (no es el estado de Página)');

  console.log('== E. Boot real (DATA_DIR temporal, puerto 35010) ==');
  let portBusy = false;
  try { const r = await fetch('http://127.0.0.1:35010/api/version'); if (r.ok) portBusy = true; } catch (e) { /* libre */ }
  t(!portBusy, 'E0 puerto 35010 libre antes del boot', portBusy);
  const BOOT_DATA = fs.mkdtempSync(path.join(require('os').tmpdir(), '.tmp-boot-tarjeta-'));
  const envBoot = Object.assign({}, process.env, {
    DATA_DIR: BOOT_DATA, PORT: '35010',
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    TZ: 'America/Argentina/Buenos_Aires',
  });
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: envBoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let version = null;
  for (let i = 0; i < 120 && !version; i++) {
    try { const r = await fetch('http://127.0.0.1:35010/api/version'); if (r.ok) version = await r.json(); } catch (e) { /* aún no levanta */ }
    if (!version) await sleep(500);
  }
  t(version && version.build === '20261105-v1050', 'E1 boot: /api/version = v1050 (estampado del preparador)', JSON.stringify(version));
  if (version) {
    const idx = await (await fetch('http://127.0.0.1:35010/')).text();
    t(idx.includes('/app.js?v=718'), 'E2 boot: el index servido trae ?v=718 (estampado del preparador)');
    const bundle = await (await fetch('http://127.0.0.1:35010/app.js?v=718')).text();
    t(bundle.includes('function pzAdsAutorizarPagina(') && bundle.includes('Este fue tu mejor posteo de la semana') && bundle.includes('function pzAdsElegirMonto('), 'E3 boot: el bundle servido trae el rediseño');
  }
  try { child.kill('SIGTERM'); } catch (e) {}
  await sleep(1500);
  t(!fs.existsSync(path.join(ROOT, 'data')), 'E4 el boot NO creó release/data/');
  try { fs.rmSync(BOOT_DATA, { recursive: true, force: true }); } catch (e) {}

  console.log('\n== RESULTADO: ' + pass + ' pass / ' + fail + ' fail ==');
  if (fail) { console.log('FALLOS:'); for (const f of fails) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERROR DE LA SUITE:', e); process.exit(2); });
