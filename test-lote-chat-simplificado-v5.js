// test-lote-chat-simplificado-v5.js — LOTE CHAT SIMPLIFICADO OPCIÓN 5 (10/11,
// mock chat-simplificado v1, opción 5 «Cambio mínimo», aprobado por Valentino
// «dale, construilo asi»): en la pestaña Chat el posteo de hoy queda como
// burbuja compacta con 3 CHIPS CHICOS («Dale ✓» / «Cambialo» / «Después»)
// que desaparecen al responder y dejan el posteo como mensaje normal del
// hilo; la tarjeta Impulsar sale del Chat (vive solo en Inicio); del
// encabezado del Chat salen compartir y tuerca; sale la barra explicativa
// («Hablarle a Posty» / «Todo se responde tocando o hablando.»).
// Base v866 (ref 81898312; v866 toca app.js con +24 líneas tras lpWeekBridge
// y el index ES con ?v=591; styles.css es byte-idéntico a v864/v865). SIN estampar: BUILD, ?v= y
// styles?v= los pone el preparador al re-basar (re-pinear §1 y §9).
// Node puro: asserts estáticos + VM con DOM falso + auditoría M78 + boot
// real por HTTP (solo si express resuelve). Puerto 34603.
// Uso: node test-lote-chat-simplificado-v5.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idxEs = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sliceBetween = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
const escStub = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

(async () => {
  // ---------- 1. Censo + pins del árbol (base v866, SIN estampar) ----------
  // El preparador re-pinea BUILD/?v=/md5s al estampar el número del lote.
  t(srv.includes("const BUILD_ID = '20261105-v881'"), 'lote: BUILD v881 en server.js (estampado)');
  t(md5(srv) === 'e02e412addaa6b361238d2c82d769e56', 'lote: server.js md5 v881 (estampado)');
  t(md5(app) === 'bdb390ef730191344b5197ca328d2584', 'lote: app.js md5');
  t(md5(css) === '1a96b18e1dd52905bbe295be413fc691', 'lote: styles.css md5');
  t(app.split('\n').length - 1 === 31124, 'lote: app.js 31124 líneas (+55 vs v880)');
  t(css.split('\n').length - 1 === 6112, 'lote: styles.css 6112 líneas (+7 vs v880)');
  t(idxEs.includes('app.js?v=600'), 'lote: ?v=600 en index ES (el EN no lleva app.js?v=, estado preexistente verificado en vivo en v865)');
  t(idxEs.includes('styles.css?v=20261230') && idxEn.includes('styles.css?v=20261230'), 'lote: styles?v=20261230 en ambos index');
  t(fs.existsSync(path.join(__dirname, 'qa-gate.js')), 'base: qa-gate.js presente (v865)');
  t(cnt(app, 'CHAT-SIMPLIFICADO v5') === 8, 'lote: marcadores CHAT-SIMPLIFICADO v5 ×8');
  // Censo de los frentes ajenos (no se pisan).
  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(srv, 'needs_review') === 107, 'censo server: needs_review 107 ocurrencias (v880)');
  t(cnt(app, 'pzHoyImpulsarHTML') >= 1, 'censo app: pzHoyImpulsarHTML presente');

  // ---------- 2. Encabezado del Chat: sin compartir ni tuerca ----------
  t(cnt(app, 'pz-chatfull-acts') === 0, 'header-chat: pz-chatfull-acts ×0 en app.js');
  const chatFull = sliceBetween(app, 'function chatFullView() {', 'function pzChatKbSync(');
  t(chatFull.length > 500, 'header-chat: chatFullView extraída');
  t(!chatFull.includes('rsShareOpen') && !chatFull.includes("bbGo('#/app/ajustes')"), 'header-chat: ni compartir ni tuerca en chatFullView');
  t(chatFull.includes('Posty.') && chatFull.includes('en línea'), 'header-chat: quedan atrás, avatar, «Posty.» y «en línea»');
  t(chatFull.includes('pz-chatfull-head'), 'header-chat: pz-chatfull-head se mantiene (lo pina test-lotechatpantalla)');
  // El encabezado del shell de Inicio NO se toca.
  t(app.includes('pz-shell-acts') && app.includes("onclick=\"rsShareOpen()\""), 'header-chat: el shell de Inicio conserva compartir + tuerca');

  // ---------- 3. Barra de voz: sin texto explicativo SOLO en el Chat ----------
  t(app.includes('function chatCardHTML(compact, noEditChip, bareWrap, schedMode, mainScr, sheetChips, noUpRow, noVoiceTxt) {'),
    'voz: chatCardHTML tiene 8º parámetro noVoiceTxt');
  t(chatFull.includes('chatCardHTML(true, true, true, true, true, true, true, true)'), 'voz: chatFullView pasa noVoiceTxt=true');
  t(app.includes('chatCardHTML(true, true, true)') && app.includes('chatCardHTML(true, true, true, true, true)') && app.includes('chatCardHTML(true, true, true, true, true, true)'),
    'voz: las demás superficies llaman sin noVoiceTxt (3/5/6 args, sin cambio)');
  t(app.includes("${noVoiceTxt ? '' : `<div class=\"pz-voice-txt\">"), 'voz: el texto se rinde condicional en línea');
  t(app.includes("${noVoiceTxt ? '' : `<p class=\"pz-voice-hint\">"), 'voz: el hint se rinde condicional en línea');
  t(app.includes("gzT('Hablarle a Posty', 'Talk to Posty')") && app.includes("gzT('Todo se responde tocando o hablando.', 'Everything is answered by tapping or talking.')"),
    'voz: los strings siguen en el bundle (otras superficies los usan)');
  t(app.indexOf('pz-cam-btn') > 0 && app.indexOf('pz-cam-btn') < app.indexOf('pz-voice-txt') && app.indexOf('pz-voice-txt') < app.indexOf('id="chatMicSend"'),
    'voz: orden en fuente camarita → texto → mic (pin §8a sacar-feed)');
  t(app.includes('id="chatPhotoBtn"') && app.includes('id="chatMicSend"') && app.includes('id="chatFile"'),
    'voz: camarita del carril exprés + mic grande + #chatFile intactos en la plantilla que rinde el Chat');

  // ---------- 4. Impulsar fuera del Chat, intacto en Inicio ----------
  t(app.includes('function pzBoostRecPintar() {'), 'boost: pzBoostRecPintar existe');
  const recSrc = sliceBetween(app, 'async function pzBoostRecPintar() {', 'async function chatLoadHistory() {');
  t(recSrc.length > 1000, 'boost: pzBoostRecPintar extraída (' + recSrc.length + ' caracteres)');
  t(recSrc.includes('CHAT-SIMPLIFICADO v5') && recSrc.indexOf('return;') < recSrc.indexOf('try {'),
    'boost: pzBoostRecPintar se retira con early return');
  t(app.includes('try { pzBoostRecPintar(); } catch (e) {}'), 'boost: la llamada en chatLoadHistory se conserva');
  t(app.includes('function pzHoyImpulsarHTML(mejor, en) {'), 'boost: pzHoyImpulsarHTML existe (Inicio)');
  t(app.includes('pz-boost-rec-card'), 'boost: la tarjeta sigue en el bundle (Inicio)');
  // VM: pzBoostRecPintar no pinta nada en el Chat aunque haya mejor posteo.
  {
    const store = {};
    const docById = {};
    class FakeEl2 {
      constructor(tag) { this.tagName = (tag || 'div').toUpperCase(); this.id = ''; this.className = ''; this.style = {}; this.innerHTML = ''; this.textContent = ''; this.children = []; this.classList = { add: () => {}, remove: () => {}, contains: () => false }; }
      appendChild(ch) { this.children.push(ch); if (ch.id) docById[ch.id] = ch; ch.__parent = this; return ch; }
      remove() { if (this.__parent) { this.__parent.children = this.__parent.children.filter((c) => c !== this); } delete docById[this.id]; }
      querySelector() { return { onclick: null, click() {} }; }
      querySelectorAll() { return []; }
    }
    const chatBox = new FakeEl2('div'); chatBox.id = 'chatBox'; docById['chatBox'] = chatBox;
    const ctx = vm.createContext({
      console,
      document: { getElementById: (id) => docById[id] || null, createElement: (tag) => new FakeEl2(tag) },
      sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
      api: { get: async () => ({ ok: true, mejor: { post_id: 42, image_path: '/m.jpg', caption: 'Café', reach: 500, likes: 40, comments: 5, saved: 2 } }) },
      esc: escStub,
      gzT: (es, en) => es,
      pzBoostRecTexto: () => 'El mejor de tu semana.',
      pzBoostOpenById: () => {},
      window: {},
    });
    vm.runInContext(recSrc, ctx);
    await vm.runInContext('pzBoostRecPintar()', ctx);
    t(chatBox.children.length === 0, 'VM boost: con mejor posteo, la tarjeta NO se pinta en el Chat');
  }

  // ---------- 5. Chips del mensaje del día ----------
  t(app.includes("return '<div class=\"pz-tema-quick pz-tema-chips\""), 'chips: pzTemaQuickHTML rinde la clase pz-tema-chips');
  t(app.includes("text: pzTemaT('Dale ✓', 'Publish ✓')"), 'chips-hoy: «Dale ✓» / «Publish ✓»');
  t(app.includes("text: pzTemaT('Cambialo', 'Change it')"), 'chips-hoy: «Cambialo» / «Change it»');
  t(app.includes("text: pzTemaT('Después', 'Later')"), 'chips-hoy: «Después» / «Later»');
  t(cnt(app, 'Lo miro después') === 0, 'chips-hoy: «Lo miro después» ×0');
  t(cnt(app, 'Dale, publicalo ✓') === 3, 'chips-hoy: «Dale, publicalo ✓» ×3 (botón de Inicio + 2 comentarios, sin el del Chat)');
  t(css.includes('.pz-tema-quick.pz-tema-chips{'), 'chips-css: contenedor chips');
  t(css.includes('.pz-tema-quick.pz-tema-chips button{'), 'chips-css: botones chicos');
  t(css.includes('.pz-tema-quick.pz-tema-chips button.primary{background:#2793C8'), 'chips-css: primaria azul plano de marca #2793C8');
  t(css.includes('.pz-tema-quick button') && css.includes('.pz-tema-quick button:disabled'), 'chips-css: reglas base de la fila quick intactas');
  // VM: pzTemaQuickHTML con los 3 ops del día, ES y EN.
  {
    const qSrc = sliceBetween(app, 'function pzTemaQuickHTML(ops) {', 'function pzTemaPintar() {');
    t(qSrc.length > 200, 'VM chips: pzTemaQuickHTML extraída');
    const mkCtx = (lang) => {
      const ctx = vm.createContext({ esc: escStub, pzTemaT: (es, en) => (lang === 'en' ? (en || es) : es) });
      vm.runInContext(qSrc, ctx);
      return ctx;
    };
    const outES = vm.runInContext("pzTemaQuickHTML([{ id: 'hoy-aprobar', text: 'Dale ✓', primary: true }, { id: 'hoy-cambialo', text: 'Cambialo' }, { id: 'hoy-despues', text: 'Después' }])", mkCtx('es'));
    t(outES.includes('pz-tema-quick pz-tema-chips'), 'VM chips: la fila lleva la clase chips');
    t(outES.includes('data-tema-op="hoy-aprobar"') && outES.includes('data-tema-op="hoy-cambialo"') && outES.includes('data-tema-op="hoy-despues"'), 'VM chips: los 3 data-tema-op presentes');
    t(outES.includes('class="primary"') && outES.includes('>Dale ✓<'), 'VM chips: «Dale ✓» es primaria y lleva el texto');
    t((outES.match(/<button/g) || []).length === 3, 'VM chips: exactamente 3 botones en una línea');
    const outEN = vm.runInContext("pzTemaQuickHTML([{ id: 'hoy-aprobar', text: 'Publish ✓', primary: true }, { id: 'hoy-cambialo', text: 'Change it' }, { id: 'hoy-despues', text: 'Later' }])", mkCtx('en'));
    t(outEN.includes('>Publish ✓<') && outEN.includes('>Change it<') && outEN.includes('>Later<'), 'VM chips: EN espejado (Publish ✓ / Change it / Later)');
  }

  // ---------- 6. Resolver: las chips desaparecen, el posteo queda ----------
  t(app.includes('function pzTemaResolverHoy() {'), 'resolver: pzTemaResolverHoy existe');
  t(app.includes('var PZ_TEMA_RESUELTOS = {};'), 'resolver: guarda PZ_TEMA_RESUELTOS existe');
  t(app.includes("if (tema && tema.kind === 'hoy' && PZ_TEMA.stage === 'topic' && (op === 'hoy-aprobar' || op === 'hoy-cambialo' || op === 'hoy-despues')) pzTemaResolverHoy();"),
    'resolver: se llama solo en stage topic del mensaje del día');
  t(app.includes("chatAppendMsg(box, '<div class=\"chat-msg ai\""), 'resolver: la burbuja queda como mensaje Posty del hilo');
  t(app.includes("const ets = Date.now();"), 'resolver: la burbuja lleva hora (orden en el hilo)');
  // VM: resolver con DOM falso.
  {
    const rSrc = sliceBetween(app, 'var PZ_TEMA_RESUELTOS = {};', 'function pzTemaElegir(');
    t(rSrc.length > 500, 'VM resolver: pzTemaResolverHoy extraída');
    const calls = [];
    let scrolled = 0;
    const removedSel = [];
    let quickRemoved = false;
    const quickFake = { remove() { quickRemoved = true; } };
    const cloneFake = {
      innerHTML: 'CARDHTML',
      querySelector(sel) { return { remove() { removedSel.push(sel); } }; },
    };
    const cardFake = { innerHTML: 'CARDHTML', cloneNode() { return cloneFake; } };
    const wrapFake = {
      querySelector(sel) {
        if (sel === '.pz-tema.pz-daily-msg') return cardFake;
        if (sel === '.pz-tema-quick') return quickFake;
        return null;
      },
    };
    const boxFake = { id: 'chatBox' };
    const ctx = vm.createContext({
      console,
      document: { getElementById: (id) => (id === 'pzTemaWrap' ? wrapFake : id === 'chatBox' ? boxFake : null) },
      pzTemaActual: () => ({ kind: 'hoy', post: { id: 42 } }),
      chatAppendMsg: (box, html, ts) => { calls.push({ box, html, ts }); },
      chatHoraHtml: () => '<span class="chat-msg-hora">19:00</span>',
      chatScroll: () => { scrolled++; },
    });
    vm.runInContext(rSrc, ctx);
    if (rSrc.length > 500) vm.runInContext('pzTemaResolverHoy()', ctx);
    t(calls.length === 1, 'VM resolver: una sola burbuja al hilo');
    t(calls[0] && calls[0].html.includes('chat-msg ai') && calls[0].html.includes('CARDHTML') && calls[0].html.includes('chat-msg-hora'),
      'VM resolver: burbuja Posty con el posteo y su hora');
    t(quickRemoved === true, 'VM resolver: la fila de chips se quita del tema');
    t(removedSel.join('|') === '.pz-tema-quick|.pz-one-a-day|.pz-monday-box',
      'VM resolver: del clon salen chips, línea de un-mensaje-por-día y caja de los lunes');
    t(scrolled === 1, 'VM resolver: el hilo baja (chatScroll)');
    if (rSrc.length > 500) vm.runInContext('pzTemaResolverHoy()', ctx);
    t(calls.length === 1, 'VM resolver: reintento no duplica la burbuja (guarda por post id)');
  }

  // ---------- 7. SetQuick re-crea la fila; Reactivar re-habilita + repinta ----------
  const setQuickSrc = sliceBetween(app, 'function pzTemaSetQuick(ops) {', 'function pzTemaReactivar() {');
  t(setQuickSrc.includes("if (!q) {") && setQuickSrc.includes("document.createElement('div')"), 'setquick: re-crea la fila si las chips ya se quitaron');
  const reacSrc = sliceBetween(app, 'function pzTemaReactivar() {', 'function pzTemaSetSub(');
  t(reacSrc.includes("wrap.querySelectorAll('[data-tema-op]').forEach((b) => { b.disabled = false; b.classList.remove('picked'); });"),
    'reactivar: re-habilita los botones que existan (pin R6 4t/4v)');
  t(reacSrc.includes("if (!wrap.querySelector('.pz-tema-quick')) { try { pzTemaPintar(); } catch (e) {} }"),
    'reactivar: si falta la fila, repinta el tema para reintentar');
  // VM: reactivar con fila presente (re-habilita, sin repintar) y sin fila (repinta).
  {
    const mkBtn = () => ({ disabled: true, picked: true, classList: { add() {}, remove(c) { if (c === 'picked') this.picked = false; }, contains: () => true } });
    const runCase = (hasRow) => {
      const btns = [mkBtn(), mkBtn()];
      let pintado = 0;
      const wrapFake = {
        querySelectorAll: () => btns,
        querySelector: (sel) => (sel === '.pz-tema-quick' && hasRow ? {} : null),
      };
      const ctx = vm.createContext({
        console,
        document: { getElementById: () => wrapFake },
        pzTemaPintar: () => { pintado++; },
      });
      vm.runInContext(reacSrc, ctx);
      vm.runInContext('pzTemaReactivar()', ctx);
      return { btns, pintado };
    };
    const a = runCase(true);
    t(a.btns.every((b) => b.disabled === false), 'VM reactivar: con fila, los botones vuelven a habilitarse');
    t(a.pintado === 0, 'VM reactivar: con fila, no se repinta');
    const b = runCase(false);
    t(b.btns.every((x) => x.disabled === false), 'VM reactivar: sin fila, los botones igual se re-habilitan');
    t(b.pintado === 1, 'VM reactivar: sin fila, se repinta el tema');
  }

  // ---------- 8. Auditoría de funciones (gate M78) ----------
  const called = new Set([
    'pzTemaResolverHoy', 'pzTemaPintar', 'pzTemaActual', 'chatAppendMsg',
    'chatHoraHtml', 'chatScroll', 'pzTemaQuickHTML', 'pzTemaBindQuick',
    'pzTemaElegir', 'pzTemaSetQuick', 'pzTemaReactivar', 'pzBoostRecPintar',
    'chatCardHTML', 'gzT', 'esc', 'pzIc',
  ]);
  const defined = new Set([...app.matchAll(/(?:async )?function (pz[A-Za-z0-9]+|chat[A-Za-z0-9]+|gzT|esc)\s*\(/g)].map((m) => m[1]));
  for (const m of app.matchAll(/(?:const|let|var)\s+(esc|api|gzT|pzIc)\s*=/g)) defined.add(m[1]);
  const faltan = [...called].filter((f) => !defined.has(f));
  t(faltan.length === 0, 'auditoría: funciones llamadas por el lote existen definidas (' + [...called].sort().join(', ') + ')' + (faltan.length ? ' — FALTAN: ' + faltan.join(', ') : ''));
  console.log(`funciones auditadas: ${called.size - faltan.length}/${called.size}`);
  t(cnt(app, 'pzTemaResolverHoy(') >= 2, 'auditoría: pzTemaResolverHoy se llama (def + hook en pzTemaElegir)');

  // ---------- 9. Boot real por HTTP (solo si express resuelve) ----------
  let booted = false;
  try { require.resolve('express', { paths: [__dirname] }); booted = true; } catch (e) { booted = false; }
  if (!booted) {
    console.log('boot: express no resuelve en este árbol, sección omitida (como test-lote-rediseño-rs5.js)');
  } else {
    const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-chatsimp5-'));
    const PORT = 34603;
    const BASE = `http://127.0.0.1:${PORT}`;
    const waitBoot = async (tries = 60) => {
      for (let i = 0; i < tries; i++) {
        try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    };
    const srvProc = spawn('node', ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-chatsimp5', OPENAI_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let srvLog = '';
    srvProc.stdout.on('data', (d) => { srvLog += d; });
    srvProc.stderr.on('data', (d) => { srvLog += d; });
    try {
      t(await waitBoot(), 'boot: server levanta');
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      t(ver.build === '20261105-v881', `boot: /api/version 20261105-v881 (vino ${ver.build})`);
      const bundle = await (await fetch(`${BASE}/app.js`)).text();
      t(md5(bundle) === md5(app), 'boot: /app.js servido = árbol del lote (md5)');
      t(bundle.includes('pzTemaResolverHoy') && !bundle.includes('pz-chatfull-acts'), 'boot: el bundle servido trae el resolver y no trae los acts del Chat');
      t(bundle.includes('Dale ✓') && bundle.includes('Publish ✓'), 'boot: el bundle servido trae las chips ES+EN');
      const cssSrv = await (await fetch(`${BASE}/styles.css`)).text();
      t(md5(cssSrv) === md5(css), 'boot: /styles.css servido = árbol del lote (md5)');
      t(cssSrv.includes('.pz-tema-quick.pz-tema-chips'), 'boot: el css servido trae las chips');
      const index = await (await fetch(`${BASE}/`)).text();
      t(index.includes('?v=600'), 'boot: el index ES en ?v=600 (lote v881)');
    } catch (e) {
      t(false, 'boot: excepción ' + (e && e.message));
      if (srvLog) console.log('--- server log ---\n' + srvLog.slice(-3000));
    } finally {
      try { srvProc.kill('SIGTERM'); } catch (e) {}
      await new Promise((r) => setTimeout(r, 1500));
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    }
  }

  console.log(`\ntest-lote-chat-simplificado-v5: ${ok} ok, ${bad} mal`);
  if (bad) process.exitCode = 1;
})();
