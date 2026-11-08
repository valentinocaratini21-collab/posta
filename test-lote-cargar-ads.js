// test-lote-cargar-ads.js — LOTE CARGAR-ADS (base v784, re-estampado v786).
// El botón «Cargar» de Ads no hacía nada: el toque funcionaba (el POST
// salía y el servidor contestaba con motivo) pero el mensaje se escribía
// en el #anaBoostRecMsg compartido, que en el tab Ads queda 679 px más
// abajo del botón, fuera de la pantalla (repro Playwright 390px). El
// usuario veía el botón volver a su estado y nada más.
// El fix: (1) mensaje dedicado pegado al botón que se tocó
// (#anaAdsCargarMsg en el tab Ads) + scroll a la vista; (2) motivos
// propios de Cargar (los de Impulsar
// hablan de «impulsar» o de «carga automática»); (3) el 500 del servidor
// ya trae motivo (cobro_fallido) en vez de un error pelado.
// Node puro, lee el árbol. Uso: node test-lote-cargar-ads.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Extrae una función por nombre contando llaves (sirve para `function` y
// para `async function`).
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

(async () => {
  // ---------- 1. anaCargarMotivo: texto propio de Cargar, nunca mudo ----------
  const sb = { console, anaLang: 'es', anaPastMode: false,
    anaT: (es, en) => (sb.anaLang === 'en' ? en : es),
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: { getElementById: () => null },
  };
  vm.createContext(sb);
  for (const n of ['anaBoostRecMotivo', 'anaCargarMotivo', 'anaCargarMsgEl', 'anaCargarDecir']) {
    const c = extractFn(chunk, n);
    t(c.length > 0, 'existe ' + n);
    if (c) vm.runInContext(c.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
  const noImpulsar = (s) => typeof s === 'string' && s.length > 0 && !/impulsar/i.test(s);
  const casos = [
    ['sin_cliente_stripe', /tarjeta/i, 'sin_cliente_stripe: dice que falta la tarjeta'],
    ['sin_tarjeta_guardada', /tarjeta/i, 'sin_tarjeta_guardada: dice que falta la tarjeta'],
    ['stripe_no_configurado', /disponible/i, 'stripe_no_configurado: dice que no está disponible'],
    ['cobro_fallido', /Probá de nuevo/i, 'cobro_fallido: pide reintentar'],
    ['cobro_requiere_accion', /confirmación/i, 'cobro_requiere_accion: pide confirmación'],
    ['cobro_no_confirmado', /Probá de nuevo/i, 'cobro_no_confirmado: pide reintentar'],
    ['sin_proveedores', /disponible/i, 'sin_proveedores: dice que no está disponible'],
    ['', /Probá de nuevo/i, 'sin motivo (500/red): hay texto, nunca silencio'],
  ];
  for (const [motivo, rx, name] of casos) {
    const txt = sb.anaCargarMotivo(motivo, 20, null);
    t(noImpulsar(txt), name + ' (sin «impulsar», no vacío)');
    t(rx.test(txt), name + ' (dice lo que corresponde)');
    t(/No se cobró nada/.test(txt), name + ' (aclara que no se cobró nada)');
  }
  // Los motivos que ya son de la billetera se reutilizan (demo, saldo ARS,
  // cobro sin acreditar, monto inválido): mismo texto que antes, no vacío.
  for (const [motivo, rx, name] of [
    ['demo', /demo/i, 'demo: se reutiliza el texto de demo'],
    ['saldo_ars_pendiente', /pesos/i, 'saldo_ars_pendiente: habla del saldo en pesos'],
    ['cobro_sin_acreditar', /no entró/i, 'cobro_sin_acreditar: dice que la plata no entró'],
    ['monto_invalido', /\$20, \$50 o \$100/i, 'monto_invalido: dice los montos válidos'],
  ]) {
    const txt = sb.anaCargarMotivo(motivo, 20, 'pi_x');
    t(noImpulsar(txt) && rx.test(txt), name);
  }
  // EN: mismo motivo, texto en inglés.
  sb.anaLang = 'en';
  const enTxt = sb.anaCargarMotivo('sin_tarjeta_guardada', 20, null);
  t(/saved card/i.test(enTxt) && /Nothing was charged/i.test(enTxt), 'EN sin_tarjeta_guardada: texto en inglés');
  const enVacio = sb.anaCargarMotivo('', 20, null);
  t(/Try again/i.test(enVacio) && /Nothing was charged/i.test(enVacio), 'EN sin motivo: texto en inglés');
  sb.anaLang = 'es';

  // ---------- 2. anaCargarMsgEl: prioridad del dedicado, fallback al compartido ----------
  const el = (id) => ({ id, textContent: '', scrolled: false, scrollIntoView: function () { this.scrolled = true; } });
  const conEls = (ids) => {
    const map = {};
    for (const id of ids) map[id] = el(id);
    sb.document = { getElementById: (i) => map[i] || null };
    return map;
  };
  let m = conEls(['anaAdsCargarMsg', 'anaBoostRecMsg']);
  t(sb.anaCargarMsgEl() === m.anaAdsCargarMsg, 'con tab + compartido: elige el dedicado del tab');
  m = conEls(['anaBilleteraCargarMsg', 'anaBoostRecMsg']);
  t(sb.anaCargarMsgEl() === m.anaBilleteraCargarMsg, 'con carta + compartido: elige el dedicado de la carta');
  m = conEls(['anaBoostRecMsg']);
  t(sb.anaCargarMsgEl() === m.anaBoostRecMsg, 'sin dedicado: cae al compartido (fallback)');
  m = conEls([]);
  t(sb.anaCargarMsgEl() == null, 'sin ningún elemento: null, no tira');
  t((() => { try { sb.anaCargarDecir('hola'); return true; } catch (e) { return false; } })(), 'anaCargarDecir sin elemento: no tira');
  m = conEls(['anaAdsCargarMsg']);
  sb.anaCargarDecir('Listo, cargaste $20.');
  t(m.anaAdsCargarMsg.textContent === 'Listo, cargaste $20.', 'anaCargarDecir: escribe el texto en el dedicado');
  t(m.anaAdsCargarMsg.scrolled === true, 'anaCargarDecir: lleva el mensaje a la vista (scrollIntoView)');

  // ---------- 3. Colocación: el dedicado vive PEGADO al botón ----------
  for (const n of ['anaBoostRecPartes', 'anaBilleteraHTML', 'anaBilleteraPickerRow', 'anaBilleteraBusqResHTML', 'anaCortarCaption', 'anaAdsDirectoHTML', 'anaBilleteraHistorialHTML', 'anaAdsFeedHTML', 'anaAdsTabHTML']) {
    const c = extractFn(chunk, n);
    t(c.length > 0, 'existe ' + n);
    if (c) vm.runInContext(c.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
  const datosBase = () => ({
    mejor: { post_id: 9, image_path: 'x.jpg', caption: 'Brunch Aroma para dos', reach: 1200, likes: 84, comments: 12, saved: 5 },
    hoy: null, boostHabilitado: false, ads_permiso: null, conversion_pendiente: true,
    billetera: { balance_cents: 0, currency: 'ARS', montos_usd: [20, 50, 100] },
    elegibles: [{ post_id: 9, image_path: 'x.jpg', caption: 'Brunch Aroma para dos', reach: 1200, likes: 84, comments: 12, saved: 5 }],
    feed: [], auto_topup: 0, tiene_tarjeta: false, vistaFeed: false, movimientos: [], boosts: [],
    selId: 9, selMonto: 20, selPost: { post_id: 9, image_path: 'x.jpg', caption: 'Brunch Aroma para dos' },
    busq: { q: '', resultados: [], buscando: false, hecho: false },
  });
  sb.anaBilleteraDatos = datosBase();
  const hTab = sb.anaAdsDirectoHTML();
  t(hTab.includes('id="anaAdsCargarMsg"'), 'tab Ads: existe #anaAdsCargarMsg');
  t(hTab.indexOf('anaAdsCargarMsg') > hTab.indexOf('anaAdsCargar(this)') && hTab.indexOf('anaAdsCargarMsg') < hTab.indexOf('La primera carga es en USD'), 'tab Ads: el dedicado está pegado al botón Cargar (después del botón, antes de la nota)');
  t(hTab.indexOf('anaAdsCargarMsg') < hTab.indexOf('id="anaBoostRecMsg"'), 'tab Ads: el dedicado está ANTES del compartido (el compartido queda lejos, para Impulsar)');
  // (RE-BASE v786 sobre v784) La carta ya no monta la billetera: carta
  // v782 quitó los dos <div id="anaBoostRec"> y anaBilleteraHTML() no se
  // renderiza en la carta. El dedicado de la carta no existe; el mensaje
  // de Cargar vive solo en el tab Ads (#anaAdsCargarMsg, verificado arriba).
  t(!chunk.includes('<div id="anaBoostRec"></div>'), 'carta: sin montaje #anaBoostRec (la billetera no se monta en la carta)');
  sb.anaBilleteraDatos = datosBase();
  const hCarta = sb.anaBilleteraHTML();
  t(!hCarta.includes('id="anaBilleteraCargarMsg"'), 'carta: sin #anaBilleteraCargarMsg (el dedicado vive solo en el tab Ads)');
  t(hCarta.includes('id="anaBoostRecMsg"'), 'carta: el compartido sigue para Impulsar');

  // ---------- 4. anaBilleteraCargar: un toque, una respuesta visible ----------
  const cargarSrc = extractFn(chunk, 'anaBilleteraCargar');
  t(cargarSrc.length > 0, 'existe anaBilleteraCargar');
  vm.runInContext(cargarSrc.replace('function anaBilleteraCargar', 'globalThis.anaBilleteraCargar = async function'), sb);
  const mkBtn = () => ({ disabled: false });
  const mkDoc = () => {
    const map = { anaAdsCargarMsg: el('anaAdsCargarMsg'), anaBoostRecMsg: el('anaBoostRecMsg') };
    sb.document = { getElementById: (i) => map[i] || null };
    return map;
  };
  let llamadasLoad = 0;
  sb.anaBoostRecLoad = async () => { llamadasLoad++; };
  sb.anaBilleteraTabLoad = async () => { llamadasLoad++; };
  // 4a. Sin tarjeta (el caso Valentino): 409 con motivo → mensaje claro en
  // el dedicado, el compartido queda vacío, la billetera no se toca.
  let posts = 0;
  sb.api = { post: async () => { posts++; const e = new Error('Conflict'); e.status = 409; e.data = { ok: false, motivo: 'sin_cliente_stripe' }; throw e; } };
  let doc = mkDoc(); const btnA = mkBtn();
  await sb.anaBilleteraCargar(20, btnA);
  t(posts === 1, 'sin tarjeta: el POST se hace UNA vez por toque (sin doble cobro)');
  t(btnA.disabled === false, 'sin tarjeta: el botón se re-habilita');
  t(/tarjeta/i.test(doc.anaAdsCargarMsg.textContent), 'sin tarjeta: el dedicado dice que falta la tarjeta');
  t(doc.anaBoostRecMsg.textContent === '', 'sin tarjeta: el compartido queda vacío (el mensaje no se pierde abajo)');
  // 4b. Éxito: acredita y muestra el saldo real en el dedicado.
  sb.api = { post: async () => { posts++; return { ok: true, cobroId: 'pi_ok', montoUSD: 20, balance_cents: 5000 }; } };
  doc = mkDoc(); const btnB = mkBtn(); llamadasLoad = 0;
  await sb.anaBilleteraCargar(20, btnB);
  t(doc.anaAdsCargarMsg.textContent === 'Listo, cargaste $20. Tu billetera tiene $50.', 'éxito: «Listo, cargaste $20. Tu billetera tiene $50.» en el dedicado');
  t(llamadasLoad === 2, 'éxito: se recargan carta y tab antes de escribir el mensaje');
  // 4c. Red caída (sin .data): hay texto, nunca silencio ni «impulsar».
  sb.api = { post: async () => { throw new Error('red caída'); } };
  doc = mkDoc();
  await sb.anaBilleteraCargar(20, mkBtn());
  t(/Probá de nuevo/i.test(doc.anaAdsCargarMsg.textContent) && !/impulsar/i.test(doc.anaAdsCargarMsg.textContent), 'red caída: mensaje claro de reintento, sin «impulsar»');
  // 4d. 500 del servidor con motivo (el fix del endpoint): se usa el motivo.
  sb.api = { post: async () => { const e = new Error('Server'); e.status = 500; e.data = { ok: false, motivo: 'cobro_fallido', error: 'No se pudo cargar la billetera' }; throw e; } };
  doc = mkDoc();
  await sb.anaBilleteraCargar(20, mkBtn());
  t(/No se pudo cobrar/i.test(doc.anaAdsCargarMsg.textContent), '500 con motivo: se muestra el motivo del servidor');

  // ---------- 5. Servidor: el 500 ya trae motivo (no un error pelado) ----------
  t(/catch \(e\) \{ res\.status\(500\)\.json\(\{ ok: false, motivo: 'cobro_fallido', error: 'No se pudo cargar la billetera' \}\)/.test(srv), 'endpoint cargar: el catch 500 trae motivo cobro_fallido');
  t(srv.includes("app.post('/api/ads/billetera/cargar'"), 'endpoint cargar: sigue en su lugar');
  // El resto del flujo no se tocó: Impulsar, automática, plan y precios.
  t(chunk.includes('async function anaBilleteraImpulsar(btn)') && chunk.includes('async function anaBilleteraAutoToggle(btn)'), 'Impulsar y automática: funciones intactas');
  t(!/anaCargarMotivo\('(sin_posteo|ya_impulsado|saldo_insuficiente)'/.test(chunk), 'anaCargarMotivo no pisa los motivos de Impulsar');

  console.log(`\ntest-lote-cargar-ads: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', e && e.stack || e); process.exit(1); });
