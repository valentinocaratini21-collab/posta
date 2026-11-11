'use strict';
// test-lote-onboarding-simple.js — LOTE ONBOARDING-SIMPLE (base v897)
// Valentino 11/11: el onboarding NO pregunta nada. El usuario pone su @
// de Instagram + su website ANTES de entrar; Posty arma el PRIMER POSTEO
// con lo que publican (su @ y su web) y entran al producto (Inicio con SU
// primer posteo ya armado, Chat, Ads). Sin contraseña, sin email upfront
// (se pide después en el chat si hace falta). Fix del @ pegado: cambiar
// el @ regenera todo desde el nuevo @. Rotación (act. 5): cada día es
// DISTINTO al anterior — otro producto, otro ángulo, nunca el mismo.
//
// Qué se construye:
//  - /prueba y /en/prueba: páginas chicas nuevas (form @ + website;
//    prefill -> generate -> guest/start -> /#/app/inicio). Si el prefill
//    no detecta productos ni rubro específico, UNA sola cosa acá mismo:
//    la estrella («¿qué es lo que más vendés?»).
//  - server.js: guest/start sin identidad (invitado, needs_ig); set-ig
//    (guest-set-ig.js); puerta de identidad en trial/generate (sin @ ni
//    web -> 400); puerta de evidencia fail-closed (productos, servicios
//    o rubro específico; 'otro'/vacío -> falta_producto); chat-onboarding
//    kinds question/answer -> 400 questions_removed; bienvenida del chat
//    = la pregunta por el @ si el invitado no tiene @; upgrade por email
//    + magic link (sin contraseña); canje del magic sobre la MISMA fila.
//  - app.js: sin pantallas de preguntas (OB borrado); router onboarding
//    -> Inicio; invitado sin @: Posty pide el @ en el chat y al darlo se
//    arma la semana (set-ig + generate); hoja de cuenta solo email +
//    magic link (sin contraseña).
//  - demo.js: enforceTopicRotation (el día 1 nunca se toca; dos días
//    seguidos nunca comparten producto ni ángulo).
//  - Estampado: BUILD 20261105-v898 (provisional; el tablero asigna
//    el final — re-basado sobre el HEAD v897 EN VIVO (e6710bfd); este
//    lote reserva app.js?v=612); styles.css NO cambia (styles?v=20261236,
//    el del HEAD v897).
// Node puro: asserts estáticos + VM (flujo /prueba + pzExtractIg) +
// módulos puros (rotación demo.js + guest-set-ig.js con node:sqlite) +
// boot real por HTTP con DATA_DIR aislada.
// Puerto 34742. Uso: node test-lote-onboarding-simple.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const DIR = __dirname;
const BASE = path.join(DIR, '..', 'base-v897');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8');
const idxES = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');
const pruebaES = fs.readFileSync(path.join(DIR, 'public/prueba.html'), 'utf8');
const pruebaEN = fs.readFileSync(path.join(DIR, 'public/en-prueba.html'), 'utf8');
const demoSrc = fs.readFileSync(path.join(DIR, 'demo.js'), 'utf8');
const gsiSrc = fs.readFileSync(path.join(DIR, 'guest-set-ig.js'), 'utf8');
const gtSrc = fs.readFileSync(path.join(DIR, 'guest-trial.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const epBody = (src, start) => {
  const i = src.indexOf(start);
  if (i < 0) return '';
  const j = src.indexOf('\napp.', i + start.length);
  return j > i ? src.slice(i, j) : src.slice(i, i + 6000);
};

(async () => {
  // ---------- F1. Estampado ----------
  t(srv.includes("const BUILD_ID = '20261105-v898';"), 'F1 server: BUILD v898');
  t(cnt(srv, '20261105-v898') === 1, 'F1 server: BUILD v898 ×1 (solo el estampado)');
  t(cnt(srv, '20261105-v897') === 0, 'F1 server: sin restos del BUILD v897');
  t(idxES.includes('/app.js?v=612'), 'F1 index ES: app.js?v=612');
  t(cnt(idxES, '/app.js?v=612') === 1, 'F1 index ES: app.js?v=612 ×1');
  t(!idxES.includes('/app.js?v=611') && !idxES.includes('/app.js?v=610') && !idxES.includes('/app.js?v=609'), 'F1 index ES: sin ?v= viejos (609/610) ni el 611 de v897');
  t(idxES.includes('/styles.css?v=20261236') && idxEN.includes('/styles.css?v=20261236'), 'F1 index ES+EN: styles?v=20261236 intacto (styles.css no cambia — hereda el del HEAD v897)');
  t(!idxES.includes('/styles.css?v=20261235') && !idxEN.includes('/styles.css?v=20261235'), 'F1 index ES+EN: sin styles?v=20261235 (ese era de v896)');
  t(!idxEN.includes('/app.js?v='), 'F1 index EN: no carga app.js (sin ?v= que tocar)');
  t(idxES.includes('id="prueba"'), 'F1 index ES: el hero lleva id="prueba" (la nav «La prueba» ya no es un ancla muerta)');

  // ---------- F2. Sin preguntas, sin contraseñas ----------
  for (const m of ['obFormHTML', 'obChatHTML', 'obSummaryHTML', 'onboardingView', 'bindOnboarding', 'freshOB', 'loadOB']) {
    t(cnt(app, m) === 0, 'F2 app.js: sin resto de la pantalla de preguntas (' + m + ')');
  }
  t(cnt(srv, 'onboardingAnswersOk(ocAns') === 0, 'F2 server: la puerta de las 5 respuestas ya no se llama');
  t(cnt(srv, 'questions_removed') === 1, 'F2 server: chat-onboarding question/answer -> 400 questions_removed');
  for (const m of ['OC_ANS', 'chat-onboarding', 'onboardingAnswersOk']) {
    t(cnt(pruebaES, m) === 0 && cnt(pruebaEN, m) === 0, 'F2 /prueba ES+EN: sin restos del onboarding viejo (' + m + ')');
  }
  t(cnt(pruebaES, 'type="password"') === 0 && cnt(pruebaEN, 'type="password"') === 0, 'F2 /prueba ES+EN: ningún campo de contraseña en la entrada');
  t(cnt(app, 'pzGuestPass') === 0, 'F2 app.js: sin pzGuestPass (la hoja de cuenta ya no pide contraseña)');
  t(cnt(app, 'type="password"') === 2, 'F2 app.js: los únicos 2 campos de contraseña son el login y el reset (preexistentes, fuera de alcance)');
  const sheetBody = app.slice(app.indexOf('function pzGuestAccountSheet'), app.indexOf('\nfunction ', app.indexOf('function pzGuestAccountSheet') + 10));
  t(sheetBody.length > 100 && !sheetBody.includes('type="password"') && !sheetBody.includes('pzGuestPass'), 'F2 app.js: la hoja de cuenta del invitado no pide contraseña (ni campo ni pzGuestPass)');
  t(sheetBody.includes('No password'), 'F2 app.js: la hoja dice «No password» (entra por link, sin contraseña)');
  t(cnt(srv, 'password_invalid') === 0, 'F2 server: sin validación de contraseña en el upgrade');

  // ---------- F3. Entrada: @ + website antes de entrar ----------
  for (const [src, nm] of [[pruebaES, 'ES'], [pruebaEN, 'EN']]) {
    t(src.includes('id="fIg"') && src.includes('id="fWeb"'), 'F3 /prueba ' + nm + ': form con @ + website');
    t(src.includes('/api/trial/prefill') && src.includes('/api/trial/generate') && src.includes('/api/guest/start'), 'F3 /prueba ' + nm + ': prefill -> generate -> guest/start');
    t(src.includes('/#/app/inicio'), 'F3 /prueba ' + nm + ': entra a /#/app/inicio (Inicio con SU primer posteo)');
    t(src.includes('id="fStarWrap"'), 'F3 /prueba ' + nm + ': fallback de la estrella, oculto hasta que haga falta');
    t(src.includes('/#/login'), 'F3 /prueba ' + nm + ': «¿Ya tenés cuenta? Entrá» va a /#/login');
  }
  t(pruebaES.includes('Armar mi primer posteo'), 'F3 /prueba ES: botón «Armar mi primer posteo»');
  t(pruebaEN.includes('Build my first post'), 'F3 /prueba EN: botón «Build my first post»');
  t(pruebaES.includes('¿Qué es lo que más vendés?'), 'F3 /prueba ES: la estrella se pide solo si el prefill no ve qué venden');
  t(cnt(pruebaES, '¿Qué es lo que más vendés?') === 1, 'F3 /prueba ES: la estrella es UNA sola cosa, no un formulario');

  // ---------- F4. El @ en el chat (invitado que entró sin @) ----------
  t(app.includes('pzGuestSetIg') && app.includes('pzExtractIg') && app.includes('pzGuestChatSay'), 'F4 app.js: intercept del @ en el chat (pzGuestSetIg / pzExtractIg / pzGuestChatSay)');
  t(app.includes("'/api/guest/set-ig'") || app.includes('"/api/guest/set-ig"'), 'F4 app.js: el intercept llama a /api/guest/set-ig');
  t(app.includes('need_generate'), 'F4 app.js: sin caché de semana, pide generar (need_generate)');
  t(app.includes('pzGuestSetIgStar'), 'F4 app.js: si el generate pide la estrella, se manda con mix libre');
  t(srv.includes("app.post('/api/guest/set-ig'"), 'F4 server: existe POST /api/guest/set-ig');
  t(srv.includes('¿cuál es tu Instagram?'), 'F4 server: la bienvenida del chat pregunta por el @ cuando el invitado no tiene @');
  t(srv.includes('posty_welcomed'), 'F4 server: la bienvenida queda persistida (posty_welcomed)');
  t(gsiSrc.includes('clearTrialPosts') && gsiSrc.includes('FIX @ PEGADO'), 'F4 guest-set-ig.js: el cambio de @ borra la semana vieja antes de importar');
  t(gsiSrc.includes('need_generate'), 'F4 guest-set-ig.js: sin caché, devuelve need_generate');

  // ---------- F5. Cuenta sin contraseña (magic link) ----------
  t(srv.includes("app.post('/api/guest/start'"), 'F5 server: existe POST /api/guest/start');
  t(srv.includes('needs_ig: true'), 'F5 server: guest/start sin identidad crea el invitado con needs_ig');
  const upBody = epBody(srv, "app.post('/api/guest/upgrade'");
  t(upBody.length > 100, 'F5 server: existe POST /api/guest/upgrade');
  t(!upBody.includes('password'), 'F5 server: el upgrade NO toca contraseña (email + magic link)');
  t(upBody.includes('magic_tokens'), 'F5 server: el upgrade guarda el token en magic_tokens');
  t(srv.includes('payload.guest_id'), 'F5 server: el canje del magic reconoce guest_id');
  t(srv.includes('upgradeGuest'), 'F5 server: el canje usa upgradeGuest sobre la MISMA fila (reloj + posteos intactos)');
  t(cnt(gtSrc, 'keepHash') === 3, 'F5 guest-trial.js: keepHash ×3 (el upgrade no borra un hash que ya exista)');
  t(app.includes('Revisá tu email'), 'F5 app.js: la hoja de cuenta confirma por email (magic link), sin contraseña');

  // ---------- F6. Puerta de identidad + puerta de evidencia ----------
  t(cnt(srv, 'Decime tu @ de Instagram o tu web primero') === 2, 'F6 server: puerta de identidad ×2 (generate + generate-stream)');
  t(cnt(srv, 'rubro_detectado') === 5, 'F6 server: la puerta de evidencia acepta rubro_detectado ×5 (lectura + 2 call sites ×2)');
  t(srv.includes('trialHasEvidencedProducts'), 'F6 server: existe la puerta fail-closed trialHasEvidencedProducts');
  t(srv.includes('falta_producto'), 'F6 server: sin evidencia, 400 falta_producto (el front pide la estrella)');
  const doorBody = srv.slice(srv.indexOf('function trialHasEvidencedProducts'), srv.indexOf('function trialHasEvidencedProducts') + 1200);
  t(doorBody.includes('rubro_detectado'), 'F6 server: la puerta acepta un rubro específico como evidencia');
  t(doorBody.includes("'otro'") || doorBody.includes('"otro"'), 'F6 server: la puerta rechaza «otro» como rubro');

  // ---------- F7. Rotación (estático) ----------
  for (const m of ['function enforceTopicRotation', 'function topicProductKey', 'function topicAngleKey', 'function topicsConflict']) {
    t(demoSrc.includes(m), 'F7 demo.js: existe ' + m);
  }
  t(demoSrc.includes('enforceTopicRotation(topics, allTopics)'), 'F7 demo.js: buildDemoSpec aplica la rotación antes de elegir fotos');
  t(demoSrc.includes('El día 1 (i=0) nunca se toca'), 'F7 demo.js: el día 1 fija la semana (nunca se reemplaza)');

  // ---------- F8. El producto completo: 3 tabs + aterrizaje en Inicio ----------
  t(app.includes("tab === 'inicio'") && app.includes("tab === 'chat'") && app.includes("tab === 'ads'"), 'F8 app.js: los 3 tabs existen (Inicio, Chat, Ads)');
  const obRedir = app.indexOf("tab === 'onboarding'");
  t(obRedir > 0 && app.slice(obRedir, obRedir + 200).includes('#/app/inicio'), 'F8 app.js: el tab onboarding muerto redirige a Inicio');
  t(app.includes('postAuthLanding'), 'F8 app.js: postAuthLanding existe (la cuenta nueva aterriza en Inicio)');

  // ---------- V1. VM: el flujo /prueba arma el primer posteo y entra ----------
  const vm = require('vm');
  const scriptES = pruebaES.slice(pruebaES.indexOf('<script>') + 8, pruebaES.lastIndexOf('</script>'));
  t(scriptES.includes("location.href = '/#/app/inicio'"), 'V1 /prueba: el script entra a /#/app/inicio');
  function makePage(search, prefillRes) {
    const calls = [];
    const els = {};
    const mk = (id) => ({ id, value: '', hidden: true, disabled: false, textContent: '', innerHTML: '', focus() {}, addEventListener() {} });
    for (const id of ['fIg', 'fWeb', 'fStar', 'fStarWrap', 'fErr', 'fStatus', 'btnGo']) els[id] = mk(id);
    const form = { _fn: null, addEventListener(t2, fn) { if (t2 === 'submit') this._fn = fn; }, requestSubmit() { if (this._fn) this._fn({ preventDefault() {} }); }, dispatchEvent() { if (this._fn) this._fn({ preventDefault() {} }); } };
    els.fEntry = form;
    const store = new Map();
    const location = { search, href: '' };
    class FormDataStub { constructor() { this._e = {}; } append(k, v) { this._e[k] = v; } get(k) { return this._e[k]; } }
    const fetchStub = async (url, opts) => {
      calls.push({ url, method: (opts && opts.method) || 'GET', body: (opts && opts.body) || null });
      if (String(url).includes('/api/trial/prefill')) return { ok: true, status: 200, json: async () => prefillRes };
      if (String(url).includes('/api/trial/generate')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      if (String(url).includes('/api/guest/start')) return { ok: true, status: 200, json: async () => ({ ok: true, user_id: 7 }) };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const ctx = vm.createContext({
      document: { getElementById: (id) => els[id] || null },
      localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
      location, fetch: fetchStub, FormData: FormDataStub, URLSearchParams, console,
    });
    return { ctx, els, form, calls, location, store };
  }
  async function waitHref(p, ms) {
    for (let i = 0; i < (ms || 40); i++) { if (p.location.href) return true; await sleep(50); }
    return !!p.location.href;
  }
  // V1a: @ + website con productos detectados -> prefill, generate (todo),
  // guest/start y entrada a Inicio con SU primer posteo.
  {
    const p = makePage('?ig=cafeteria&web=cafeteria.com', { ok: true, name: 'Cafetería Luna', category: 'cafetería', productos: [{ nombre: 'Café de especialidad' }, { nombre: 'Medialunas' }] });
    vm.runInContext(scriptES, p.ctx);
    t(await waitHref(p), 'V1a /prueba: el auto-arranque con ?ig= entra a Inicio');
    t(p.location.href === '/#/app/inicio', 'V1a /prueba: aterriza en /#/app/inicio', p.location.href);
    t(p.calls.length === 3, 'V1a /prueba: 3 llamadas en orden (prefill, generate, guest/start)', JSON.stringify(p.calls.map((c) => c.url)));
    t(p.calls[0] && p.calls[0].url.includes('/api/trial/prefill') && JSON.parse(p.calls[0].body).ig === 'cafeteria', 'V1a /prueba: prefill con el @ limpio (sin @)');
    const gen = p.calls[1] && p.calls[1].body && p.calls[1].body._e;
    t(!!gen && gen.producto_mix === 'todo', 'V1a /prueba: generate con producto_mix=todo (de lo publicado)');
    t(!!gen && String(gen.productos_detectados || '').includes('Café de especialidad'), 'V1a /prueba: generate lleva los productos detectados del @');
    t(!!gen && gen.ig === 'cafeteria' && gen.web === 'https://cafeteria.com', 'V1a /prueba: generate lleva el @ y la web normalizada');
    t(!!gen && gen.country === 'AR', 'V1a /prueba: generate lleva country AR (el generate exige AR/UY/US)');
    const gs = p.calls[2] && JSON.parse(p.calls[2].body || '{}');
    t(!!gs && gs.ig === 'cafeteria' && gs.domain === 'https://cafeteria.com' && String(gs.device || '').startsWith('dvc_'), 'V1a /prueba: guest/start con @ + dominio + dispositivo', JSON.stringify(gs));
  }
  // V1b: el prefill no ve qué venden -> NO genera; aparece la estrella.
  // Al darla, genera con mix libre + producto_estrella y entra.
  {
    const p = makePage('?ig=tienda-x', { ok: true, name: 'Tienda X', category: 'otro', productos: [] });
    vm.runInContext(scriptES, p.ctx);
    await sleep(300);
    t(p.calls.length === 1 && p.calls[0].url.includes('/api/trial/prefill'), 'V1b /prueba: sin evidencia NO genera (solo prefill)', JSON.stringify(p.calls.map((c) => c.url)));
    t(p.els.fStarWrap.hidden === false, 'V1b /prueba: aparece el campo de la estrella');
    t(p.els.fStatus.hidden === false, 'V1b /prueba: se explica por qué se pregunta');
    t(p.location.href === '', 'V1b /prueba: todavía no entra (falta la estrella)');
    p.els.fStar.value = 'Café de especialidad';
    p.form._fn({ preventDefault() {} });
    t(await waitHref(p), 'V1b /prueba: con la estrella, entra a Inicio');
    const gen = p.calls.find((c) => String(c.url).includes('/api/trial/generate'));
    t(!!gen && gen.body._e.producto_mix === 'libre' && gen.body._e.producto_estrella === 'Café de especialidad', 'V1b /prueba: generate con mix libre + producto_estrella', gen && JSON.stringify(gen.body._e));
    t(p.calls.filter((c) => String(c.url).includes('/api/trial/prefill')).length === 2, 'V1b /prueba: el prefill se repite con la estrella (no se cachea el fallo)');
  }

  // ---------- V2. VM: pzExtractIg (el @ que Posty pide en el chat) ----------
  {
    const start = app.indexOf('function pzExtractIg(text)');
    const end = app.indexOf('\nfunction pzGuestChatSay', start);
    t(start > 0 && end > start, 'V2 app.js: pzExtractIg extraíble para testearla');
    const fnSrc = app.slice(start, end);
    const ctx = vm.createContext({ CHAT: [], console });
    vm.runInContext(fnSrc, ctx);
    const run = (text, chat) => { ctx.CHAT = chat || []; return vm.runInContext('pzExtractIg(' + JSON.stringify(text) + ')', ctx); };
    const askIg = [{ role: 'assistant', text: 'hola! soy posty 💙\n¿cuál es tu Instagram? Así armo tu semana con lo que ya publicás 👇' }];
    const askOther = [{ role: 'assistant', text: 'contame qué es lo que más vendés' }];
    t(run('https://www.instagram.com/cafeteria.luna/') === 'cafeteria.luna', 'V2 pzExtractIg: URL de Instagram -> el @');
    t(run('@cafeteria') === 'cafeteria', 'V2 pzExtractIg: @handle -> el @');
    t(run('mi ig es @cafe_luna ok') === 'cafe_luna', 'V2 pzExtractIg: @ dentro del texto -> el @');
    t(run('cafeteria', askIg) === 'cafeteria', 'V2 pzExtractIg: palabra suelta VALE si Posty acaba de pedir el @');
    t(run('cafeteria', askOther) === '', 'V2 pzExtractIg: palabra suelta NO vale sin el contexto del @');
    t(run('hola posty', askIg) === '', 'V2 pzExtractIg: «hola posty» no es un @');
    t(run('', askIg) === '', 'V2 pzExtractIg: vacío -> vacío');
    t(run('mi mail es a@b.com', askIg) === '', 'V2 pzExtractIg: un email NO es un @ (anti-email)');
    t(run('mi ig es @cafe_luna y mi mail a@b.com', askIg) === 'cafe_luna', 'V2 pzExtractIg: con email y @, sale el @');
  }

  // ---------- V3. Rotación (demo.js, módulo puro) ----------
  // demo.js requiere db.js al cargar, y db.js abre la DB en DATA_DIR (o
  // ./data si no está seteado): apuntarlo a un tmp ANTES del require para
  // no crear data/ dentro del árbol.
  {
    const demoTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-onb-simple-demo-'));
    process.env.DATA_DIR = demoTmp;
    const demo = require('./demo.js');
    const T = (anchor, kind, angle) => ({ digest_anchor: anchor, kind, angle });
    t(demo.topicProductKey(T(' Café de Especialidad ', 'novedad', 'x')) === 'café de especialidad', 'V3 rotación: topicProductKey normaliza el ancla');
    t(demo.topicAngleKey(T('a', 'Novedad', 'Lanzamiento')) === 'novedad:lanzamiento', 'V3 rotación: topicAngleKey = kind:angle');
    t(demo.topicsConflict(T('café', 'novedad', 'lan'), T('café', 'tip', 'cuidado')) === true, 'V3 rotación: mismo producto (otro ángulo) = conflicto');
    t(demo.topicsConflict(T('café', 'novedad', 'lan'), T('torta', 'novedad', 'lan')) === true, 'V3 rotación: mismo ángulo (otro producto) = conflicto');
    t(demo.topicsConflict(T('café', 'novedad', 'lan'), T('torta', 'tip', 'cuidado')) === false, 'V3 rotación: producto y ángulo distintos = sin conflicto');
    const w1 = T('café', 'novedad', 'lanzamiento');
    const w2 = T('café', 'novedad', 'lanzamiento');
    const w3 = T('medialunas', 'promo', 'descuento');
    const w4 = T('torta', 'tip', 'cuidado');
    const w5 = T('café', 'social', 'comunidad');
    const pool = [T('torta', 'promo', 'descuento'), T('medialunas', 'social', 'comunidad'), T('torta', 'tip', 'cuidado'), T('limonada', 'novedad', 'temporada')];
    const out = demo.enforceTopicRotation([w1, w2, w3, w4, w5], pool);
    t(out[0] === w1, 'V3 rotación: el día 1 NO se toca (mismo objeto)');
    t(out.length === 5, 'V3 rotación: la semana sigue teniendo 5 días');
    let conf = 0; for (let i = 1; i < out.length; i++) if (demo.topicsConflict(out[i - 1], out[i])) conf++;
    t(conf === 0, 'V3 rotación: dos días seguidos nunca comparten producto ni ángulo', 'conflictos=' + conf);
    t(out[1] !== w2 && demo.topicProductKey(out[1]) === 'torta', 'V3 rotación: el día en conflicto se reemplaza (no se reordena)', JSON.stringify(out[1]));
    // Semana rica: 7 días con choques + pool amplio -> 0 conflictos,
    // al menos 4 productos y 4 ángulos distintos.
    const rich = [
      T('café', 'novedad', 'lanzamiento'), T('café', 'novedad', 'lanzamiento'),
      T('medialunas', 'promo', 'descuento'), T('medialunas', 'promo', 'descuento'),
      T('torta', 'tip', 'cuidado'), T('café', 'social', 'comunidad'),
      T('torta', 'tip', 'cuidado'),
    ];
    const richPool = [T('limonada', 'novedad', 'temporada'), T('brownie', 'promo', '2x1'), T('alfajor', 'tip', 'maridaje'), T('facturas', 'social', 'detrás'), T('té', 'novedad', 'nuevo-sabor'), T('sándwich', 'promo', 'combo'), T('budín', 'tip', 'receta'), T('jugo', 'social', 'cliente')];
    const rout = demo.enforceTopicRotation(rich, richPool);
    let conf2 = 0; for (let i = 1; i < rout.length; i++) if (demo.topicsConflict(rout[i - 1], rout[i])) conf2++;
    const prods = new Set(rout.map((x) => demo.topicProductKey(x)));
    const angs = new Set(rout.map((x) => demo.topicAngleKey(x)));
    t(rout[0] === rich[0], 'V3 rotación (rica): el día 1 no se toca');
    t(conf2 === 0, 'V3 rotación (rica): 0 días seguidos en conflicto', 'conflictos=' + conf2);
    t(prods.size >= 4, 'V3 rotación (rica): al menos 4 productos distintos en la semana', 'productos=' + [...prods].join(','));
    t(angs.size >= 4, 'V3 rotación (rica): al menos 4 ángulos distintos en la semana', 'ángulos=' + [...angs].join(','));
    // Sin candidatos: el slot queda (nunca se inventa un tema).
    const stuck = demo.enforceTopicRotation([T('café', 'novedad', 'lan'), T('café', 'novedad', 'lan')], []);
    t(stuck.length === 2 && stuck[0].digest_anchor === 'café', 'V3 rotación: sin pool, el slot queda (no inventa temas)');
  }

  // ---------- V4. guest-set-ig (node:sqlite, el fix del @ pegado) ----------
  {
    const { DatabaseSync } = require('node:sqlite');
    const gsi = require('./guest-set-ig.js');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, is_guest INTEGER, guest_ig TEXT)');
    db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, source TEXT)');
    db.exec('CREATE TABLE post_signals (post_id INTEGER)');
    db.exec('CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, payload TEXT)');
    db.exec('CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, ig_username TEXT)');
    const deps = { trialLock: { findConsumedUsed: () => null }, guestTrial: { findGuestByIdentity: () => null, deviceUsed: () => null, recordDevice: () => {} } };
    const mkGuest = (id, ig, nPosts) => {
      db.prepare('INSERT INTO users (id, is_guest, guest_ig) VALUES (?, 1, ?)').run(id, ig);
      db.prepare('INSERT INTO profiles (user_id, ig_username) VALUES (?, ?)').run(id, '');
      for (let i = 0; i < nPosts; i++) { const r = db.prepare("INSERT INTO posts (user_id, source) VALUES (?, 'trial')").run(id); db.prepare('INSERT INTO post_signals (post_id) VALUES (?)').run(r.lastInsertRowid); }
    };
    db.prepare('INSERT INTO trial_cache (ig, payload) VALUES (?, ?)').run('nuevo', JSON.stringify({ posts: [{ id: 1 }, { id: 2 }] }));
    // Contra-prueba del bug del primo: el comportamiento VIEJO (cambiar el
    // @ sin borrar) deja la semana del @ viejo puesta bajo el @ nuevo.
    mkGuest(1, 'viejo', 3);
    gsi.applyGuestIg(db, 1, 'nuevo');
    t(db.prepare('SELECT guest_ig FROM users WHERE id = 1').get().guest_ig === 'nuevo', 'V4 contra-prueba: el @ nuevo queda aplicado');
    t(gsi.countPosts(db, 1) === 3, 'V4 contra-prueba: SIN borrar, los 3 posteos del @ viejo SIGUEN (el bug: la semana vieja se sirve con el @ nuevo)');
    // El fix: resolveSetIg borra la semana vieja ANTES de importar.
    mkGuest(2, 'viejo', 3);
    const v = gsi.resolveSetIg(db, deps, { userId: 2, ig: 'nuevo', device: 'd1', ip: '1.2.3.4' });
    t(v.ok === true && v.changed === true && v.cleared === 3, 'V4 fix: el cambio de @ borra los 3 posteos viejos', JSON.stringify(v));
    t(v.hasCache === true && v.need_generate === false, 'V4 fix: con caché, no hace falta generar');
    t(gsi.countPosts(db, 2) === 0, 'V4 fix: la semana vieja ya no está');
    t(db.prepare('SELECT guest_ig FROM users WHERE id = 2').get().guest_ig === 'nuevo', 'V4 fix: guest_ig queda en el @ nuevo');
    t(db.prepare('SELECT COUNT(*) AS n FROM post_signals').get().n === 3, 'V4 fix: las señales de los posteos viejos también se borran (quedan las del invitado 1)');
    // Idempotente: mismo @ con semana puesta -> already, sin tocar nada.
    db.prepare("INSERT INTO posts (user_id, source) VALUES (2, 'trial')").run();
    db.prepare("INSERT INTO posts (user_id, source) VALUES (2, 'trial')").run();
    const v2 = gsi.resolveSetIg(db, deps, { userId: 2, ig: 'nuevo', device: 'd1', ip: '1.2.3.4' });
    t(v2.ok === true && v2.already === true && v2.posts === 2, 'V4 idempotente: mismo @ con semana puesta -> already', JSON.stringify(v2));
    // Sin caché: need_generate, y el cambio borra la semana vieja igual.
    const v3 = gsi.resolveSetIg(db, deps, { userId: 2, ig: 'otro-sin-cache', device: 'd1', ip: '1.2.3.4' });
    t(v3.ok === true && v3.need_generate === true && v3.cleared === 2, 'V4 sin caché: need_generate + borra la semana vieja', JSON.stringify(v3));
    t(db.prepare('SELECT guest_ig FROM users WHERE id = 2').get().guest_ig === 'otrosincache', 'V4 sin caché: guest_ig queda en el @ nuevo (normalizado: sin guion)');
    // Errores: sin @, no invitado, trial consumido.
    t(gsi.resolveSetIg(db, deps, { userId: 2, ig: '', device: 'd1' }).error === 'need_ig', 'V4 error: sin @ -> need_ig');
    db.prepare('INSERT INTO users (id, is_guest, guest_ig) VALUES (3, 0, ?)').run('');
    t(gsi.resolveSetIg(db, deps, { userId: 3, ig: 'x', device: 'd1' }).error === 'not_guest', 'V4 error: no invitado -> not_guest');
    const depsUsed = { trialLock: { findConsumedUsed: () => ({ ig: 'bloqueado' }) }, guestTrial: deps.guestTrial };
    mkGuest(4, '', 0);
    t(gsi.resolveSetIg(db, depsUsed, { userId: 4, ig: 'bloqueado', device: 'd1' }).error === 'trial_used', 'V4 error: @ con trial consumido -> trial_used');
    // Normalización del @ (idéntica a trial-lock).
    t(gsi.normalizeIg('@Cafe.Luna') === 'cafe.luna', 'V4 normalizeIg: @Cafe.Luna -> cafe.luna');
    t(gsi.normalizeIg('https://instagram.com/cafe_luna/') === 'cafe_luna', 'V4 normalizeIg: URL -> cafe_luna');
    t(gsi.normalizeIg('') === '', 'V4 normalizeIg: vacío -> vacío');
    db.close();
  }

  // ---------- V5. Boot real ----------
  let booted = false;
  try { require.resolve('express'); booted = true; } catch (e) {
    if (!process.env.VONB_BOOTSTRAPPED) {
      const { spawnSync } = require('child_process');
      const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
        stdio: 'inherit',
        env: { ...process.env, NODE_PATH: '/home/hatch/workspace/posta/node_modules', VONB_BOOTSTRAPPED: '1' },
      });
      process.exit(r.status == null ? 1 : r.status);
    }
  }
  if (booted) {
    const { spawn, execSync } = require('child_process');
    const { DatabaseSync } = require('node:sqlite');
    const PORT = 34742;
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-onb-simple-'));
    const TEST_KEY = 'boot-test-key-onb-simple';
    const ADMIN_TOKEN = 'test-admin-token-onb-simple';
    const env = { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN, SESSION_SECRET: 'test', NODE_PATH: '/home/hatch/workspace/posta/node_modules', TRIAL_TEST_KEY: TEST_KEY };
    delete env.OPENAI_API_KEY; delete env.RESEND_API_KEY;
    const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: 'ignore' });
    const BASE_URL = 'http://127.0.0.1:' + PORT;
    const dbPath = path.join(TMP, 'posta.db');
    const dbRead = (sql, ...args) => {
      for (let i = 0; i < 10; i++) {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        try { return db.prepare(sql).get(...args); }
        catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { try { db.close(); } catch (_) {} Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
        finally { try { db.close(); } catch (_) {} }
      }
    };
    async function reqJson(method, p, body, cookie, timeoutMs) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      const r = await fetch(BASE_URL + p, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || 30000) });
      let j = null; try { j = await r.json(); } catch (e) { j = null; }
      return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
    }
    async function reqForm(p, fd, timeoutMs) {
      const r = await fetch(BASE_URL + p, { method: 'POST', body: fd, signal: AbortSignal.timeout(timeoutMs || 60000) });
      let j = null; try { j = await r.json(); } catch (e) { j = null; }
      return { status: r.status, json: j };
    }
    try {
      let up = false;
      for (let i = 0; i < 90; i++) {
        try { const r = await fetch(BASE_URL + '/api/version'); if (r.ok) { up = true; break; } } catch (e) {}
        await sleep(1000);
      }
      t(up, 'V5 boot: el servidor levanta en ' + PORT);
      if (!up) throw new Error('no levanta');
      const ver = await reqJson('GET', '/api/version');
      t(ver.status === 200 && ver.json && ver.json.build === '20261105-v898', 'V5 boot: /api/version trae el BUILD v898', JSON.stringify(ver.json));
      const idx = await (await fetch(BASE_URL + '/')).text();
      t(idx.includes('/app.js?v=612'), 'V5 boot: el index servido trae app.js?v=612');
      t(idx.includes('/styles.css?v=20261236'), 'V5 boot: el index servido trae styles?v=20261236');
      const appSrv = await (await fetch(BASE_URL + '/app.js?v=612')).text();
      t(md5(appSrv) === md5(app), 'V5 boot: el bundle servido es el del árbol (md5)');
      const pruebaSrv = await (await fetch(BASE_URL + '/prueba')).text();
      t(pruebaSrv.includes('id="fIg"') && pruebaSrv.includes('Armar mi primer posteo'), 'V5 boot: /prueba sirve la entrada nueva (@ + website)');
      t(!pruebaSrv.includes('OC_ANS') && !pruebaSrv.includes('obFormHTML'), 'V5 boot: /prueba no trae restos del onboarding viejo');
      const pruebaENSrv = await (await fetch(BASE_URL + '/en/prueba')).text();
      t(pruebaENSrv.includes('Build my first post'), 'V5 boot: /en/prueba sirve la entrada nueva en inglés');

      // Invitado sin identidad: se crea la cuenta de prueba, needs_ig.
      const gs = await reqJson('POST', '/api/guest/start', {});
      t(gs.status === 200 && gs.json && gs.json.ok === true && gs.json.user_id > 0, 'V5 boot: guest/start sin identidad crea el invitado', JSON.stringify(gs.json));
      t(gs.json && gs.json.needs_ig === true && gs.json.posts === 0, 'V5 boot: el invitado nace con needs_ig y 0 posteos');
      t(!!(gs.json && gs.json.trial_ends_at), 'V5 boot: el invitado trae trial_ends_at (3 días)');
      const uid = gs.json.user_id;
      const cookie = gs.setCookie ? String(gs.setCookie).split(';')[0] : '';
      t(!!cookie, 'V5 boot: la sesión trae cookie (queda logueado en el dispositivo)');

      // El chat le pide el @ (bienvenida = la pregunta por el @).
      const chat = await reqJson('GET', '/api/ideas/chat', null, cookie);
      const askMsg = chat.json && Array.isArray(chat.json.messages) && chat.json.messages.find((m) => String(m.text || '').includes('¿cuál es tu Instagram?'));
      t(!!askMsg, 'V5 boot: el chat le pregunta el @ al invitado sin @', JSON.stringify((chat.json && chat.json.messages || []).map((m) => String(m.text || '').slice(0, 60))));
      const guestRow = dbRead('SELECT is_guest, guest_ig FROM users WHERE id = ?', uid);
      t(!!guestRow && guestRow.is_guest === 1 && !guestRow.guest_ig, 'V5 boot: el invitado es guest sin @ todavía', JSON.stringify(guestRow));

      // Dar el @ sin caché de semana -> need_generate (sin llamar a la IA).
      const setIg = await reqJson('POST', '/api/guest/set-ig', { ig: 'cafeteria-nueva' }, cookie);
      t(setIg.status === 200 && setIg.json && setIg.json.ok === true && setIg.json.need_generate === true, 'V5 boot: set-ig sin caché -> need_generate (no llama a la IA)', JSON.stringify(setIg.json));
      t(setIg.json && setIg.json.ig === 'cafeterianueva', 'V5 boot: set-ig normaliza y devuelve el @ nuevo (sin guion)');
      const guestRow2 = dbRead('SELECT guest_ig FROM users WHERE id = ?', uid);
      t(guestRow2 && guestRow2.guest_ig === 'cafeterianueva', 'V5 boot: guest_ig queda en el @ nuevo', JSON.stringify(guestRow2));
      const setIgVacio = await reqJson('POST', '/api/guest/set-ig', { ig: '' }, cookie);
      t(setIgVacio.status === 400 && setIgVacio.json && setIgVacio.json.need_ig === true, 'V5 boot: set-ig sin @ -> 400 need_ig', JSON.stringify(setIgVacio.json));

      // Puerta de identidad: sin @ ni web -> 400 (sin test_key: la puerta
      // es la que manda; con test_key se saltea a propósito).
      const fd0 = new FormData();
      fd0.append('business', ''); fd0.append('category', 'otro'); fd0.append('tone', 'vos'); fd0.append('lang', 'es');
      const gate = await reqForm('/api/trial/generate', fd0);
      t(gate.status === 400 && gate.json && String(gate.json.error || '').includes('Decime tu @ de Instagram o tu web primero'), 'V5 boot: generate sin @ ni web -> 400 puerta de identidad', JSON.stringify(gate.json));

      // Puerta de evidencia: @ inventado, sin productos/servicios/rubro
      // -> 400 falta_producto (el front pide la estrella).
      const fd1 = new FormData();
      fd1.append('business', 'Cafetería Fake'); fd1.append('ig', 'cafeteria-fake-xyz-onb'); fd1.append('category', 'otro');
      fd1.append('country', 'AR'); fd1.append('producto_mix', 'todo'); fd1.append('tone', 'vos'); fd1.append('lang', 'es');
      const ev = await reqForm('/api/trial/generate', fd1, 90000);
      t(ev.status === 400 && ev.json && ev.json.falta_producto === true, 'V5 boot: generate sin evidencia -> 400 falta_producto', JSON.stringify(ev.json));
    } finally {
      try { child.kill('SIGTERM'); } catch (e) {}
      await sleep(1500);
      try {
        const ss = execSync('ss -ltn', { encoding: 'utf8' });
        t(!ss.includes(':' + PORT), 'V5 boot: el puerto ' + PORT + ' queda libre tras matar el proceso');
      } catch (e) { console.log('(sin ss para verificar el puerto)'); }
    }
  }

  // ---------- V6. Censo: diff = exactamente el lote ----------
  {
    const walk = (dir) => {
      const out = [];
      const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else if (e.isFile()) out.push(path.relative(dir, p)); } };
      rec(dir); return out.sort();
    };
    const baseFiles = walk(BASE);
    const relFiles = walk(DIR);
    const relSet = new Set(relFiles);
    const baseSet = new Set(baseFiles);
    const differing = [];
    const missing = [];
    for (const f of baseFiles) {
      if (!relSet.has(f)) { missing.push(f); continue; }
      if (md5(fs.readFileSync(path.join(BASE, f))) !== md5(fs.readFileSync(path.join(DIR, f)))) differing.push(f);
    }
    const added = relFiles.filter((f) => !baseSet.has(f));
    t(baseFiles.length === 1732, 'V6 censo: base-v897 tiene 1732 archivos', 'base=' + baseFiles.length);
    t(relFiles.length === 1734, 'V6 censo: release tiene 1734 archivos (1732 + guest-set-ig.js + suite)', 'release=' + relFiles.length);
    t(missing.length === 0, 'V6 censo: ningún archivo de la base falta en el release', JSON.stringify(missing));
    const expDiff = ['demo.js', 'guest-trial.js', 'public/app.js', 'public/en-prueba.html', 'public/index.html', 'public/prueba.html', 'server.js'].sort();
    t(JSON.stringify(differing.sort()) === JSON.stringify(expDiff), 'V6 censo: difieren EXACTAMENTE los 7 archivos del lote', JSON.stringify(differing));
    const expAdded = ['guest-set-ig.js', 'test-lote-onboarding-simple.js'].sort();
    t(JSON.stringify(added.sort()) === JSON.stringify(expAdded), 'V6 censo: nuevos EXACTAMENTE guest-set-ig.js + la suite', JSON.stringify(added));
    t(md5(css) === md5(fs.readFileSync(path.join(BASE, 'public/styles.css'))), 'V6 censo: styles.css idéntico a la base (sin tocar)');
    t(md5(idxEN) === md5(fs.readFileSync(path.join(BASE, 'public/en/index.html'))), 'V6 censo: en/index.html idéntico a la base (sin tocar)');
    t(!fs.existsSync(path.join(DIR, 'data')), 'V6 censo: sin data/ dentro del release');
  }

  console.log('\ntest-lote-onboarding-simple: ' + ok + ' ok, ' + bad + ' mal');
  console.log('md5 server.js: ' + md5(srv));
  console.log('md5 app.js: ' + md5(app));
  console.log('md5 demo.js: ' + md5(demoSrc));
  console.log('md5 guest-set-ig.js: ' + md5(gsiSrc));
  console.log('md5 guest-trial.js: ' + md5(gtSrc));
  console.log('md5 index.html: ' + md5(idxES));
  console.log('md5 en/index.html: ' + md5(idxEN));
  console.log('md5 prueba.html: ' + md5(pruebaES));
  console.log('md5 en-prueba.html: ' + md5(pruebaEN));
  console.log('md5 styles.css: ' + md5(css));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
