// test-lote-momentos-clave.js — LOTE MOMENTOS-CLAVE-CONEXIÓN (preparador:
// re-base sobre el vivo v1062 → BUILD v1063 · app.js?v=724 solo ES)
// Directiva de Valentino (12/11 21:50): «hay que ponerlos en los momentos
// claves que creemos que lo van a activar». La invitación a conectar
// Instagram salía UNA sola vez (post-wow). Ahora sale en los momentos de
// máxima intención de la prueba, cada uno UNA vez por usuario, con
// registro persistente (localStorage posta_ig_moments_<id>), silencio de
// 24 h tras un descarte para los momentos comunes y paso libre (una vez)
// para los de consecuencia (hora19 · fin). Nunca bloquea la prueba ni
// una acción; con Instagram conectado no dispara ninguno.
// Uso: node release/test-lote-momentos-clave.js (ROOT = release/, BASE =
// ../base del scratch del preparador).
// Secciones: A estáticos · B VM (comportamiento real de los gates) ·
// C boot en vivo · D control sobre la base viva v1062 (el sistema de
// momentos no existe; solo el momento wow por la vía de siempre).
//
// ADAPTACIONES DEL PREPARADOR respecto de la suite del builder (base
// v980, BUILD provisorio v992, app.js?v=683), cada una con su causa:
//  1. Estampados vivos: BUILD v992→v1063 · app.js?v=683→724 · styles
//     20261270→20261282; la base de control es el vivo v1062 (no v980).
//  2. El slice VM arranca en 'function igPopupSkipLog(' (no en
//     igDismissKey): en el vivo maybeShowIgPopup llama igPopupSkipLog
//     (L9 v1062) y sin él la VM lo deja indefinido — mismo criterio que
//     aplicó el preparador de L9 a la suite de L8.
//  3. A5 pinea la forma viva del gate wow con el motivo del follow-up:
//     if (!pzIgMomGate('wow')) { igPopupSkipLog('mom_wow', tab); return; }
//  4. A7: el momento 'aprobo' viaja con UN solo enganche
//     (pzTemaAprobarHoy), no dos. El segundo call site del builder
//     (pzHoyAprobarUno) es INALCANZABLE sin conexión en el vivo: la
//     función frena al entrar con igGateFeedback si PROFILE.ig_connected
//     es falso (y esa nota YA es la invitación a conectar en contexto),
//     y su camino de éxito exige conexión, condición en la que el gate
//     de momentos nunca pasa. Se declara con evidencia (A7 pinea el
//     freno vivo), no se fuerza código muerto.
//  5. A6: el skip conserva la forma viva del dismiss (igPopupDismiss()
//     de L8, con timestamp) y suma pzIgMomDismiss() al lado.
//  6. Nuevos: A16 (follow-up L9: los 6 motivos ×1 intactos + mom_wow ×1
//     + el registro dinámico 'mom_<momento>' de pzIgMomentTry) · A17
//     (censo ajeno que el tablero pidió conservar) · B2b/B12 (el freno
//     del gate deja su motivo en window.__igPopupSkip).
//  7. A12: el pin igInterruptedAt ×0 era un hecho de v980; en el vivo la
//     señal del correctivo-6 existe (app ×1 · server ×10). La invariante
//     del lote pasa a ser igualdad base/release, no ausencia.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname; // release/
const BASE = path.join(ROOT, '..', 'base');
let pass = 0, fail = 0;
const failed = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; failed.push(name); console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function read(p) { return fs.readFileSync(p, 'utf-8'); }
function countOcc(s, sub) { return s.split(sub).length - 1; }
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const appBase = read(path.join(BASE, 'public/app.js'));
const appRel = read(path.join(ROOT, 'public/app.js'));
const srvRel = read(path.join(ROOT, 'server.js'));
const srvBase = read(path.join(BASE, 'server.js'));
const idxEsRel = read(path.join(ROOT, 'public/index.html'));
const idxEnRel = read(path.join(ROOT, 'public/en/index.html'));

// ---------- A. Estáticos ----------
console.log('A. Estáticos (momentos)');
t('A1 sistema de momentos definido una vez', ['function pzIgMomKey(', 'function pzIgMomState(', 'function pzIgMomSave(', 'function pzIgMomGate(', 'function pzIgMomMark(', 'function pzIgMomDismiss()', 'function pzIgMomSub(', 'function pzIgMomentTry(', 'function pzIgMomAutoChecks(', 'function igPopupShow('].every((s) => countOcc(appRel, s) === 1));
t('A2 registro persistente por usuario (clave propia, localStorage)', appRel.includes("return 'posta_ig_moments_' + id;") && appRel.includes('localStorage.getItem(pzIgMomKey())') && appRel.includes('localStorage.setItem(pzIgMomKey(), JSON.stringify(st))'));
t('A3 silencio 24 h y conjunto de consecuencia {hora19, fin}', appRel.includes('const PZ_IG_MOM_SILENCE_MS = 24 * 60 * 60 * 1000;') && appRel.includes('const PZ_IG_MOM_CONSEC = { hora19: 1, fin: 1 };'));
t('A4 un popup por sesión (sessionStorage) solo para momentos comunes', appRel.includes("sessionStorage.getItem('posta_ig_mom_sess')") && appRel.includes("sessionStorage.setItem('posta_ig_mom_sess', mom)"));
t("A5 el post-wow es el momento wow (gate con motivo mom_wow + registro en maybeShowIgPopup)", countOcc(appRel, "if (!pzIgMomGate('wow')) { igPopupSkipLog('mom_wow', tab); return; }") === 1 && countOcc(appRel, "pzIgMomMark('wow');") === 1 && countOcc(appRel, 'igPopupShow(wowSub, wowEn);') === 1);
t('A6 el render del popup se extrajo a igPopupShow (def x1); el skip conserva igPopupDismiss() vivo y suma pzIgMomDismiss()', countOcc(appRel, 'function igPopupShow(wowSub, wowEn)') === 1 && countOcc(appRel, 'igPopupDismiss();') === 1 && countOcc(appRel, 'try { pzIgMomDismiss(); } catch (e2) {}') === 1);
t("A7 momento aprobo: UN enganche vivo (pzTemaAprobarHoy); el de pzHoyAprobarUno no viaja — su disparador sin conexión no existe en el vivo (freno igGateFeedback al entrar, pineado)", countOcc(appRel, "pzIgMomentTry('aprobo')") === 1 && countOcc(appRel, "if (!(typeof PROFILE !== 'undefined' && PROFILE && PROFILE.ig_connected)) { try { igGateFeedback(btn); } catch (e) {} return; }") === 1);
t('A8 momento accion: enganchado en pzAdsImpulsar y en el listener de links «Ver en Instagram» (sin frenar la acción)', countOcc(appRel, "pzIgMomentTry('accion')") === 2 && countOcc(appRel, "a[href*=\"instagram.com/p/\"]") === 1);
t('A9 momento fin: enganchado en showExpiredModal junto a la pantalla del plan', countOcc(appRel, "pzIgMomentTry('fin')") === 1);
t('A10 autoChecks en render() tras el popup de siempre', countOcc(appRel, 'try { pzIgMomAutoChecks(tab); } catch (e) {}') === 1);
t('A11 subtítulos por momento ES/EN x5', ['aprobo', 'hora19', 'semana3', 'accion', 'fin'].every((m) => appRel.includes(m + ': en ?')) && appRel.includes('Tus 3 posteos ya están armados') && appRel.includes("Today's post is approved"));
t('A12 la lógica del cartel de reanudación NO se tocó (renderIgResume x1; igInterruptedAt idéntico base/release: en el vivo la señal del correctivo-6 SÍ existe — app x1, server x10 — y este lote no la toca)', countOcc(appRel, 'function renderIgResume()') === 1 && countOcc(appRel, 'igInterruptedAt') === countOcc(appBase, 'igInterruptedAt') && countOcc(srvRel, 'igInterruptedAt') === countOcc(srvBase, 'igInterruptedAt'));
t('A13 BUILD v1063 x1 en server.js (v1062 x0) · index ES app.js?v=724 x1 (723 x0) · styles 20261282 en ambos index', countOcc(srvRel, "const BUILD_ID = '20261105-v1063';") === 1 && countOcc(srvRel, '20261105-v1062') === 0 && countOcc(idxEsRel, '/app.js?v=724') === 1 && countOcc(idxEsRel, '/app.js?v=723') === 0 && countOcc(idxEsRel, 'styles.css?v=20261282') === 1 && countOcc(idxEnRel, 'styles.css?v=20261282') === 1 && countOcc(idxEnRel, 'app.js?v=') === 0);
t('A14 styles.css e index EN byte-idénticos a la base; server.js solo cambia en BUILD', md5(path.join(ROOT, 'public/styles.css')) === md5(path.join(BASE, 'public/styles.css')) && md5(path.join(ROOT, 'public/en/index.html')) === md5(path.join(BASE, 'public/en/index.html')) && srvRel.replace('20261105-v1063', '20261105-v1062') === srvBase);
t('A15 gate M78: funciones llamadas por el código nuevo, definidas', ['function igPopupShow(', 'function igDismissKey(', 'function pzIgMomState(', 'function pzIgMomSave(', 'function pzIgMomSub(', 'function pzIgMomGate(', 'function pzIgMomMark(', 'function pzIgMomDismiss()', 'function pzIgMomentTry(', 'function pzIgMomAutoChecks(', 'function igPopupSkipLog(', 'function pzIsGuest(', 'function pzIc(', 'function igConnectHere('].every((s) => appRel.includes(s)));
t("A16 follow-up L9: los 6 motivos del popup intactos x1 + mom_wow x1 + registro dinámico 'mom_<momento>' en pzIgMomentTry", ['sin_sesion', 'ya_conectado', 'ya_visible', 'descartado', 'sin_wow', 'excepcion'].every((r) => countOcc(appRel, "igPopupSkipLog('" + r + "'") === 1) && countOcc(appRel, "igPopupSkipLog('mom_wow', tab)") === 1 && countOcc(appRel, "igPopupSkipLog('mom_' + mom)") === 1);
t('A17 censo ajeno conservado (app: igPopupWow x2, pzTrialAviso x16, pzTemaInicio x7, trial_arming x12 · server: seedTrialFeedSnapshot x2, trialTextoFeedGarantizado x3)', countOcc(appRel, 'igPopupWow') === 2 && countOcc(appRel, 'pzTrialAviso') === 16 && countOcc(appRel, 'pzTemaInicio') === 7 && countOcc(appRel, 'trial_arming') === 12 && countOcc(srvRel, 'seedTrialFeedSnapshot') === 2 && countOcc(srvRel, 'trialTextoFeedGarantizado') === 3);

// ---------- B. VM: comportamiento ----------
console.log('B. VM (gates y disparadores reales, DOM falso)');
const sliceStart = appRel.indexOf('function igPopupSkipLog(');
const sliceEnd = appRel.indexOf('/* ---------- toast global ---------- */');
const slice = appRel.slice(sliceStart, sliceEnd);
t('B0 slice extraído (observabilidad + sistema de momentos + popup)', slice.includes('function pzIgMomGate(') && slice.includes('function maybeShowIgPopup(tab)') && slice.includes('function igPopupShow(') && slice.includes('function pzIgMomAutoChecks(') && slice.includes('function igPopupSkipLog('));

function makeCtx(opts) {
  const o = opts || {};
  const ls = new Map(Object.entries(o.ls || {}));
  const ss = new Map(Object.entries(o.ss || {}));
  const els = {};
  const trackEvents = [];
  const mkStore = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(String(k), String(v)), removeItem: (k) => m.delete(k) });
  function makeEl() {
    const el = {
      id: '', className: '', innerHTML: '', style: {}, dataset: {}, children: [], _qs: {},
      querySelector(sel) { if (!this._qs[sel]) this._qs[sel] = { onclick: null, style: {} }; return this._qs[sel]; },
      querySelectorAll() { return []; },
      appendChild(c) { this.children.push(c); if (c && c.id) els[c.id] = c; return c; },
      remove() { if (this.id) delete els[this.id]; },
    };
    return el;
  }
  const body = makeEl();
  const listeners = {};
  const ctx = {
    ME: o.me !== undefined ? o.me : { id: 94, lang: 'es', plan_status: 'trial' },
    PROFILE: o.profile !== undefined ? o.profile : { ig_connected: false, ig_pending: false },
    PZ_HOY_POSTS: o.hoyPosts || {},
    PZ_HOY_POST_ID: o.hoyPostId || '',
    PZ_HOY_TIRA_DIAS: o.tira || [],
    localStorage: mkStore(ls),
    sessionStorage: mkStore(ss),
    document: {
      body,
      getElementById: (id) => els[id] || null,
      createElement: () => makeEl(),
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
    },
    navigator: {},
    window: {},
    track: (name, props) => { trackEvents.push({ name, props }); },
    pzIsGuest: o.isGuest !== undefined ? (() => o.isGuest) : (() => true),
    pzIc: (n, s) => '[ic]',
    igConnectHere: () => {},
    pcParseDate: (s) => new Date(String(s).replace(' ', 'T')),
    pcTz: () => undefined,
    setTimeout: () => {},
    console,
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(slice, ctx);
  return { ctx, els, ls, ss, body, trackEvents };
}
const momState = (ls) => { const k = [...ls.keys()].find((x) => x.startsWith('posta_ig_moments_')); return k ? JSON.parse(ls.get(k)) : { s: {}, d: 0 }; };
const skipSt = (ctx) => (ctx.window && ctx.window.__igPopupSkip) || null;

// B1: wow dispara y se registra
{
  const { ctx, els, ls } = makeCtx({});
  ctx.maybeShowIgPopup('inicio');
  t('B1 momento wow: el popup post-wow sale y queda registrado', !!els['igFirstOverlay'] && !!momState(ls).s.wow);
}
// B2: wow no se repite + el freno deja su motivo mom_wow (follow-up L9)
{
  const { ctx, els, ls, ss } = makeCtx({});
  ctx.maybeShowIgPopup('inicio');
  delete els['igFirstOverlay']; ss.clear();
  ctx.maybeShowIgPopup('inicio');
  t('B2 momento wow: no se repite (una vez por usuario)', !els['igFirstOverlay'] && Object.keys(momState(ls).s).length === 1);
  t('B2b freno del wow registrado: motivo mom_wow en __igPopupSkip', !!skipSt(ctx) && skipSt(ctx).counts.mom_wow === 1 && skipSt(ctx).last === 'mom_wow');
}
// B3: conectado → ningún momento
{
  const { ctx, els } = makeCtx({ profile: { ig_connected: true, ig_pending: false } });
  let alguno = false;
  for (const m of ['aprobo', 'hora19', 'semana3', 'accion', 'fin']) { if (ctx.pzIgMomentTry(m)) alguno = true; }
  ctx.maybeShowIgPopup('inicio');
  t('B3 conectado: ningún momento dispara', !alguno && !els['igFirstOverlay']);
}
// B4: aprobo una vez
{
  const { ctx, els, ls } = makeCtx({});
  const uno = ctx.pzIgMomentTry('aprobo');
  delete els['igFirstOverlay'];
  const dos = ctx.pzIgMomentTry('aprobo');
  t('B4 momento aprobo: dispara una vez y se registra', uno === true && dos === false && !!momState(ls).s.aprobo);
}
// B5: descarte → silencio 24 h en comunes; consecuencia atraviesa; a las 25 h el silencio vence
{
  const { ctx, els, ls, ss } = makeCtx({});
  ctx.pzIgMomDismiss();
  const comun = ctx.pzIgMomentTry('semana3');
  const consec = ctx.pzIgMomentTry('hora19');
  delete els['igFirstOverlay'];
  const consec2 = ctx.pzIgMomentTry('fin');
  const st = momState(ls); st.d = Date.now() - 25 * 60 * 60 * 1000;
  ls.set([...ls.keys()].find((x) => x.startsWith('posta_ig_moments_')), JSON.stringify(st));
  ss.clear(); delete els['igFirstOverlay'];
  const trasSilencio = ctx.pzIgMomentTry('accion');
  t('B5 descarte: silencio 24 h en comunes, consecuencia (hora19/fin) sale igual una vez, silencio vencido libera', comun === false && consec === true && consec2 === true && trasSilencio === true);
}
// B6: un popup por sesión (comunes); la consecuencia puede salir en la misma sesión
{
  const { ctx, els } = makeCtx({});
  const wow = ctx.pzIgMomentTry('wow');
  delete els['igFirstOverlay'];
  const otroComun = ctx.pzIgMomentTry('aprobo');
  const consec = ctx.pzIgMomentTry('fin');
  t('B6 sesión: un popup común por sesión; la consecuencia no queda tapada', wow === true && otroComun === false && consec === true);
}
// B7: dos momentos el mismo día no apilan overlays
{
  const { ctx, els } = makeCtx({});
  ctx.pzIgMomentTry('aprobo');
  const segundo = ctx.pzIgMomentTry('fin');
  t('B7 sin apilar: con el overlay abierto, otro momento no dispara', segundo === false && !!els['igFirstOverlay']);
}
// B8: hora19 por autoChecks — aprobado y vencido dispara; pendiente o futuro no
{
  const pasado = new Date(Date.now() - 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const a = makeCtx({ hoyPosts: { '7': { id: 7, status: 'scheduled', approval: 'approved', scheduled_at: pasado } }, hoyPostId: '7' });
  a.ctx.pzIgMomAutoChecks('inicio');
  const b = makeCtx({ hoyPosts: { '7': { id: 7, status: 'scheduled', approval: 'pending', scheduled_at: pasado } }, hoyPostId: '7' });
  b.ctx.pzIgMomAutoChecks('inicio');
  const c = makeCtx({ hoyPosts: { '7': { id: 7, status: 'scheduled', approval: 'approved', scheduled_at: futuro } }, hoyPostId: '7' });
  c.ctx.pzIgMomAutoChecks('inicio');
  t('B8 hora19: aprobado+19:00 pasada dispara; pendiente o a futuro no', !!a.els['igFirstOverlay'] && !!momState(a.ls).s.hora19 && !b.els['igFirstOverlay'] && !c.els['igFirstOverlay']);
}
// B9: semana3 por autoChecks — 3 días con posteo dispara; 2 no; fuera de prueba no
{
  const tira3 = [{ post: { id: 1 } }, { post: { id: 2 } }, { post: { id: 3 } }];
  const tira2 = [{ post: { id: 1 } }, { post: { id: 2 } }, { post: null }];
  const a = makeCtx({ tira: tira3 });
  a.ctx.pzIgMomAutoChecks('inicio');
  const b = makeCtx({ tira: tira2 });
  b.ctx.pzIgMomAutoChecks('inicio');
  const c = makeCtx({ tira: tira3, isGuest: false, me: { id: 12, lang: 'es', plan_status: 'active' } });
  c.ctx.pzIgMomAutoChecks('inicio');
  t('B9 semana3: 3 posteos en pantalla dispara; 2 no; cuenta paga no', !!a.els['igFirstOverlay'] && !!momState(a.ls).s.semana3 && !b.els['igFirstOverlay'] && !c.els['igFirstOverlay']);
}
// B10: el skip del popup registra el descarte de momentos (silencio) + el dismiss clásico vivo
{
  const { ctx, els, ls } = makeCtx({});
  ctx.pzIgMomentTry('aprobo');
  const ov = els['igFirstOverlay'];
  const skip = ov && ov._qs['#igFirstSkip'];
  if (skip && skip.onclick) skip.onclick({ preventDefault() {} });
  t('B10 skip: registra el descarte (d) y el dismiss clásico con timestamp, y cierra el overlay', momState(ls).d > 0 && /^\d+$/.test(ls.get('posta_ig_dismissed_94') || '') && !els['igFirstOverlay']);
}
// B11: subtítulos por momento (ES y EN)
{
  const a = makeCtx({});
  t('B11 subtítulos: ES por momento y EN con lang=en', a.ctx.pzIgMomSub('semana3').includes('Tus 3 posteos') && a.ctx.pzIgMomSub('hora19').includes('no puede salir'));
  const b = makeCtx({ me: { id: 94, lang: 'en', plan_status: 'trial' } });
  t('B11b subtítulos EN', b.ctx.pzIgMomSub('fin').includes('Your trial ended') && b.ctx.pzIgMomSub('accion').includes('two taps'));
}
// B12: el freno de un momento común deja su motivo mom_<momento> (follow-up L9)
{
  const { ctx, ls } = makeCtx({});
  ctx.pzIgMomDismiss();
  const r = ctx.pzIgMomentTry('semana3');
  t('B12 freno por silencio registrado: mom_semana3 en __igPopupSkip', r === false && !!skipSt(ctx) && skipSt(ctx).counts.mom_semana3 === 1);
}

// ---------- C. Boot en vivo ----------
console.log('C. Boot (release, DATA_DIR en /tmp)');
const PORT = 35077;
async function bootCheck() {
  const dataDir = fs.mkdtempSync('/tmp/momclave-data-');
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: dataDir, NODE_ENV: 'test', NODE_PATH: '/home/hatch/workspace/posta/node_modules' });
  const child = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    let ver = null;
    for (let i = 0; i < 40 && !ver; i++) {
      await sleep(1500);
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/api/version');
        if (r.ok) ver = await r.json();
      } catch (e) {}
    }
    t('C1 boot: /api/version responde 20261105-v1063', !!ver && ver.build === '20261105-v1063', ver ? String(ver.build) : out.slice(-300));
    if (ver) {
      const r2 = await fetch('http://127.0.0.1:' + PORT + '/');
      const html = await r2.text();
      t('C2 index ES servido con app.js?v=724 y styles 20261282', html.includes('/app.js?v=724') && html.includes('styles.css?v=20261282'));
    }
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { if (!child.killed) child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------- D. Control sobre la base ----------
console.log('D. Control (base viva v1062)');
t('D1 en la base NO existe el sistema de momentos (solo el momento wow por la vía de siempre)', countOcc(appBase, 'pzIgMom') === 0 && countOcc(appBase, 'pzIgMomentTry') === 0 && countOcc(appBase, 'function maybeShowIgPopup(') === 1 && countOcc(appBase, 'function igPopupShow(') === 0);
t('D2 contenido del popup de siempre intacto en el release (overlay, Go, Skip, subtítulo wow)', countOcc(appRel, "ov.id = 'igFirstOverlay';") === 1 && countOcc(appRel, 'id="igFirstGo"') === 1 && countOcc(appRel, 'id="igFirstSkip"') === 1 && countOcc(appRel, 'Este posteo sale ${cuandoPop} en tu perfil') === 1 && countOcc(appRel, 'This post goes out ${cuandoPop} on your profile') === 1);

(async () => {
  await bootCheck();
  console.log('\nTOTAL: ' + pass + ' ok · ' + fail + ' fallas');
  if (failed.length) console.log('Fallaron: ' + failed.join(' | '));
  process.exit(fail ? 1 : 0);
})();
