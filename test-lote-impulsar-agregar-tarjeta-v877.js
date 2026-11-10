'use strict';
// (LOTE IMPULSAR-AGREGAR-TARJETA · 10/11 · v877) La hoja Impulsar (pzBoostOpen)
// mostraba el error «No tenés una tarjeta guardada...» sin ningún botón para
// agregarla: callejón sin salida. El fix pega el MISMO botón «Agregar tarjeta»
// de la Billetera junto al mensaje de error, reutilizando anaAgregarTarjeta
// (chunk-analisis.js) → setup de Stripe → vuelta con ?tarjeta=ok.
// Boot real del servidor en proceso (patrón test-lote-panel-test-v863.js) +
// VM con las funciones REALES extraídas del bundle servido (patrón
// test-feed6a-front.js): el comportamiento se prueba sobre el código que se
// pushea, no sobre una copia.
// Uso: node test-lote-impulsar-agregar-tarjeta-v877.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

// Bootstrap: server.js necesita express & co. de ~/workspace/posta/
// node_modules. Si NODE_PATH no lo incluye, re-ejecuto este mismo script
// con NODE_PATH (una sola vez; el flag evita el bucle).
const POSTA_NM = '/home/hatch/workspace/posta/node_modules';
try { require.resolve('express'); } catch (e) {
  if (!process.env.V877_BOOTSTRAPPED) {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_PATH: POSTA_NM, V877_BOOTSTRAPPED: '1' },
    });
    process.exit(r.status == null ? 1 : r.status);
  }
  throw new Error('express no resuelve ni con NODE_PATH=' + POSTA_NM);
}

const TREE = __dirname;
const PORT = 34693;
const ADMIN_TOKEN = 'test-v877-token';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-impulsar-v877-'));
process.env.DATA_DIR = TMP;
process.env.PORT = String(PORT);
process.env.ADMIN_TOKEN = ADMIN_TOKEN;
process.env.SESSION_SECRET = 'test-v877-secret';
delete process.env.OPENAI_API_KEY;
delete process.env.RESEND_API_KEY;

let pass = 0, fail = 0;
function t(name, ok, extra) {
  if (ok) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + String(extra).slice(0, 500) : '')); }
}
const BASE = 'http://127.0.0.1:' + PORT;
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// Extractor de una función por balanceo de llaves (salta strings y
// comentarios; las funciones extraídas acá no usan template literals).
function extractFunction(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return '';
  const open = src.indexOf('{', m.index + m[0].length);
  if (open < 0) return '';
  let d = 0, k = open, state = null;
  while (k < src.length) {
    const ch = src[k], nx = src[k + 1];
    if (state === '//') { if (ch === '\n') state = null; k++; continue; }
    if (state === '/*') { if (ch === '*' && nx === '/') { state = null; k += 2; continue; } k++; continue; }
    if (state === "'" || state === '"' || state === '`') {
      if (ch === '\\') { k += 2; continue; }
      if (ch === state) state = null;
      k++; continue;
    }
    if (ch === '/' && nx === '/') { state = '//'; k += 2; continue; }
    if (ch === '/' && nx === '*') { state = '/*'; k += 2; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { state = ch; k++; continue; }
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return src.slice(m.index, k + 1); }
    k++;
  }
  return '';
}

const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CHUNK = fs.readFileSync(path.join(TREE, 'public', 'chunk-analisis.js'), 'utf8');

// ---- DOM falso mínimo ----
function makeButton() {
  return {
    type: '', className: '', textContent: '', style: '', onclick: null,
    disabled: false,
    setAttribute(k, v) { this[k] = v; },
  };
}
function makeMsgEl() {
  const parent = {
    children: [],
    querySelector(sel) {
      if (sel === '.ana-agregar-tarjeta-btn') {
        return this.children.find((c) => c.className === 'ana-agregar-tarjeta-btn') || null;
      }
      return null;
    },
  };
  const el = {
    textContent: '',
    parentNode: parent,
    insertAdjacentElement(pos, node) { if (pos === 'afterend') parent.children.push(node); },
  };
  return { el, parent };
}
function makeDocument(els) {
  return {
    _els: els || {},
    getElementById(id) { return this._els[id] || null; },
    createElement() { return makeButton(); },
  };
}

(async () => {
  // ===== C) Boot + bundle servido =====
  require('./db');
  require('./server');
  t('C1: boot — el servidor levanta con el lote', await waitBoot());
  const ver = await fetch(BASE + '/api/version');
  const verJ = await ver.json().catch(() => null);
  t('C2: /api/version → build 20261105-v877 (el builder no estampa)', ver.ok && verJ && verJ.build === '20261105-v877',
    'build=' + (verJ && verJ.build));
  const idx = await fetch(BASE + '/');
  const idxTxt = await idx.text().catch(() => '');
  t('C3: index → 200 con ?v=596 y styles?v=20261228', idx.status === 200
    && idxTxt.includes('app.js?v=596') && idxTxt.includes('styles.css?v=20261228'), 'status=' + idx.status);
  const appRes = await fetch(BASE + '/app.js?v=589');
  const appServed = await appRes.text().catch(() => '');
  t('C4: /app.js servido → 200 y trae el hunk v877 (motivo sin_tarjeta + loadChunk + anaAgregarTarjetaBtn)',
    appRes.status === 200
    && appServed.includes("motivo === 'sin_cliente_stripe' || motivo === 'sin_tarjeta_guardada'")
    && appServed.includes("await loadChunk('analisis')")
    && appServed.includes('anaAgregarTarjetaBtn(msgEl)'),
    'status=' + appRes.status);
  const chunkRes = await fetch(BASE + '/chunk-analisis.js?v=20261105-v850');
  const chunkServed = await chunkRes.text().catch(() => '');
  t('C5: /chunk-analisis.js servido → 200 y trae el fallback a #pzBoostMsg en anaTarjetaMsgEl',
    chunkRes.status === 200
    && chunkServed.includes("document.getElementById('anaBoostRecMsg') || document.getElementById('pzBoostMsg')"),
    'status=' + chunkRes.status);
  t('C6: el mensaje de error sin_tarjeta sigue intacto en el bundle servido',
    appServed.includes('No tenés una tarjeta guardada, así que no se pudo cargar.'));
  let syntaxOk = true;
  try { new vm.Script(APP); new vm.Script(CHUNK); } catch (e) { syntaxOk = false; }
  t('C7: node --check equivalente — app.js y chunk-analisis.js parsean', syntaxOk);

  // ===== A) La hoja Impulsar: pzBoostCargar real en VM =====
  const cargarSrc = extractFunction(APP, 'pzBoostCargar');
  const motivoSrc = extractFunction(APP, 'pzBoostCargarMotivo');
  t('A0: pzBoostCargar y pzBoostCargarMotivo se extraen del bundle',
    cargarSrc.includes('anaAgregarTarjetaBtn') && motivoSrc.includes('sin_tarjeta_guardada'));

  async function runCargar(apiPost, loadChunkImpl, withBtn) {
    const { el: msgEl, parent } = makeMsgEl();
    const loadCalls = [];
    const agregarCalls = [];
    const sb = {
      document: makeDocument({ pzBoostMsg: msgEl }),
      api: { post: apiPost },
      gzT: (es) => es,
      pzBoostState: { selMonto: 50 },
      pzBoostLoad: async () => {},
      pzBoostPintarBoost: () => {},
      loadChunk: loadChunkImpl || (async (n) => { loadCalls.push(n); }),
      anaAgregarTarjeta: (b) => { agregarCalls.push(b); },
      anaT: (es) => es,
      esc: (s) => String(s == null ? '' : s),
    };
    vm.createContext(sb);
    // La función REAL de la Billetera (chunk-analisis.js) para el botón.
    // withBtn === false simula que el chunk NO cargó: en el navegador real
    // anaAgregarTarjetaBtn no estaría definida (el typeof del fix la salta).
    if (withBtn !== false) vm.runInContext(extractFunction(CHUNK, 'anaAgregarTarjetaBtn'), sb);
    vm.runInContext(motivoSrc, sb);
    vm.runInContext(cargarSrc, sb);
    const btn = { disabled: false };
    await sb.pzBoostCargar(btn);
    const added = parent.children.filter((c) => c.className === 'ana-agregar-tarjeta-btn');
    return { msgEl, parent, loadCalls, agregarCalls, added, sb };
  }

  // A1: sin_tarjeta_guardada → error CON botón.
  {
    const r = await runCargar(async () => ({ ok: false, motivo: 'sin_tarjeta_guardada' }));
    t('A1: Cargar sin tarjeta → error + botón «Agregar tarjeta» pegado al mensaje',
      r.msgEl.textContent.includes('No tenés una tarjeta guardada')
      && r.added.length === 1 && r.added[0].textContent === 'Agregar tarjeta'
      && r.loadCalls.includes('analisis'),
      'msg=' + r.msgEl.textContent.slice(0, 60) + ' botones=' + r.added.length);
    // El botón llama a anaAgregarTarjeta (el camino de la Billetera).
    // (Defensivo: si no hay botón — árbol prístino en la contra-prueba —
    // se registra el fallo en vez de romper la suite con un TypeError.)
    if (r.added.length === 1) {
      r.added[0].onclick();
      t('A1b: tocar el botón → anaAgregarTarjeta (setup de Stripe)',
        r.agregarCalls.length === 1, 'llamadas=' + r.agregarCalls.length);
    } else {
      t('A1b: tocar el botón → anaAgregarTarjeta (setup de Stripe)',
        false, 'botones=' + r.added.length);
    }
  }
  // A2: sin_cliente_stripe → mismo camino.
  {
    const r = await runCargar(async () => ({ ok: false, motivo: 'sin_cliente_stripe' }));
    t('A2: motivo sin_cliente_stripe → error + botón',
      r.msgEl.textContent.includes('No tenés una tarjeta guardada') && r.added.length === 1);
  }
  // A3: otro motivo → error SIN botón y SIN cargar el chunk.
  {
    const r = await runCargar(async () => ({ ok: false, motivo: 'cobro_fallido' }));
    t('A3: motivo cobro_fallido → error sin botón y sin cargar el chunk',
      r.msgEl.textContent.includes('No se pudo cobrar con tu tarjeta')
      && r.added.length === 0 && r.loadCalls.length === 0);
  }
  // A4: ok → éxito, sin botón.
  {
    const r = await runCargar(async () => ({ ok: true, balance_cents: 15000 }));
    t('A4: Cargar ok → «Listo, cargaste $50», sin botón',
      r.msgEl.textContent.includes('Listo, cargaste $50') && r.added.length === 0);
  }
  // A5: dedupe — dos Cargar seguidos dejan UN solo botón.
  {
    const { el: msgEl, parent } = makeMsgEl();
    const sb = {
      document: makeDocument({ pzBoostMsg: msgEl }),
      api: { post: async () => ({ ok: false, motivo: 'sin_tarjeta_guardada' }) },
      gzT: (es) => es,
      pzBoostState: { selMonto: 50 },
      pzBoostLoad: async () => {},
      pzBoostPintarBoost: () => {},
      loadChunk: async () => {},
      anaAgregarTarjeta: () => {},
      anaT: (es) => es,
      esc: (s) => String(s == null ? '' : s),
    };
    vm.createContext(sb);
    vm.runInContext(extractFunction(CHUNK, 'anaAgregarTarjetaBtn'), sb);
    vm.runInContext(motivoSrc, sb);
    vm.runInContext(cargarSrc, sb);
    await sb.pzBoostCargar({ disabled: false });
    await sb.pzBoostCargar({ disabled: false });
    const n = parent.children.filter((c) => c.className === 'ana-agregar-tarjeta-btn').length;
    t('A5: dos errores seguidos → un solo botón (dedupe de la Billetera)', n === 1, 'botones=' + n);
  }
  // A6: el chunk no carga → el error se muestra igual, sin romper (fail-open).
  // withBtn false: el chunk NO cargó, así que anaAgregarTarjetaBtn no existe
  // (como en el navegador real); el typeof del fix la salta y no hay botón.
  {
    const r = await runCargar(
      async () => ({ ok: false, motivo: 'sin_tarjeta_guardada' }),
      async () => { throw new Error('chunk no cargó'); },
      false,
    );
    t('A6: chunk sin cargar → error visible igual, sin throw',
      r.msgEl.textContent.includes('No tenés una tarjeta guardada') && r.added.length === 0);
  }

  // ===== B) Las funciones REALES del chunk (setup + retorno) =====
  function chunkSandbox(els, apiPost, hash) {
    const location = { href: 'https://postyhacetodo.com/#/app/ads', hash: hash || '' };
    const replaceCalls = [];
    const sb = {
      document: makeDocument(els || {}),
      api: { post: apiPost },
      anaT: (es) => es,
      esc: (s) => String(s == null ? '' : s),
      location,
      history: { replaceState: (...a) => { replaceCalls.push(a); } },
      URLSearchParams,
    };
    vm.createContext(sb);
    for (const fn of ['anaCargarMsgEl', 'anaTarjetaMsgEl', 'anaAgregarTarjeta', 'anaTarjetaRetorno', 'anaCargarSinTarjeta']) {
      vm.runInContext(extractFunction(CHUNK, fn), sb);
    }
    return { sb, location, replaceCalls };
  }
  // B1: setup con URL → redirige a Stripe.
  {
    const { sb, location } = chunkSandbox({}, async (url) => {
      if (url === '/api/billing/stripe/setup') return { ok: true, url: 'https://checkout.stripe.com/setup/cs_test_123' };
      return { ok: false };
    });
    const btn = { disabled: false };
    await sb.anaAgregarTarjeta(btn);
    t('B1: anaAgregarTarjeta con URL → redirige a la página de Stripe',
      location.href === 'https://checkout.stripe.com/setup/cs_test_123', 'href=' + location.href);
  }
  // B2: setup sin URL → aviso visible EN LA HOJA (fallback a #pzBoostMsg).
  {
    const { el: msgEl } = makeMsgEl();
    const { sb } = chunkSandbox({ pzBoostMsg: msgEl }, async () => ({ ok: false }));
    const btn = { disabled: false };
    await sb.anaAgregarTarjeta(btn);
    t('B2: setup sin URL → botón re-habilitado y aviso en #pzBoostMsg (fallback v877)',
      btn.disabled === false && msgEl.textContent.includes('No se pudo abrir el pago seguro'),
      'msg=' + msgEl.textContent.slice(0, 60));
  }
  // B3: vuelta con ?tarjeta=ok → «Tarjeta guardada».
  {
    const { el: msgEl } = makeMsgEl();
    const { sb, replaceCalls } = chunkSandbox(
      { anaBoostRecMsg: msgEl },
      async () => ({ ok: false }),
      '#/app/ads?tarjeta=ok',
    );
    sb.anaTarjetaRetorno();
    t('B3: vuelta ?tarjeta=ok → «Tarjeta guardada» y limpia el parámetro',
      msgEl.textContent.includes('Tarjeta guardada')
      && replaceCalls.length === 1 && String(replaceCalls[0][2]).includes('#/app/ads'),
      'msg=' + msgEl.textContent.slice(0, 50));
  }
  // B4: sin el parámetro → no toca nada.
  {
    const { el: msgEl } = makeMsgEl();
    const { sb, replaceCalls } = chunkSandbox({ anaBoostRecMsg: msgEl }, async () => ({ ok: false }), '#/app/ads');
    sb.anaTarjetaRetorno();
    t('B4: sin ?tarjeta=ok → no escribe nada ni limpia nada',
      msgEl.textContent === '' && replaceCalls.length === 0);
  }
  // B5: anaCargarSinTarjeta — la condición exacta.
  {
    const { sb } = chunkSandbox({}, async () => ({ ok: false }));
    t('B5: anaCargarSinTarjeta true solo para sin_cliente_stripe / sin_tarjeta_guardada',
      sb.anaCargarSinTarjeta('sin_cliente_stripe') === true
      && sb.anaCargarSinTarjeta('sin_tarjeta_guardada') === true
      && sb.anaCargarSinTarjeta('cobro_fallido') === false
      && sb.anaCargarSinTarjeta('') === false);
  }
  // B6: anaTarjetaMsgEl — orden de fallback (Billetera primero, hoja después).
  {
    const { el: rec } = makeMsgEl();
    const { el: boost } = makeMsgEl();
    const { sb } = chunkSandbox({ anaBoostRecMsg: rec, pzBoostMsg: boost }, async () => ({ ok: false }));
    const first = sb.anaTarjetaMsgEl();
    const { sb: sb2 } = chunkSandbox({ pzBoostMsg: boost }, async () => ({ ok: false }));
    const second = sb2.anaTarjetaMsgEl();
    t('B6: anaTarjetaMsgEl prefiere la Billetera y cae a #pzBoostMsg en la hoja',
      first === rec && second === boost);
  }

  console.log(`\nIMPULSAR-V877: ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e && e.stack ? e.stack : e); process.exit(2); });
