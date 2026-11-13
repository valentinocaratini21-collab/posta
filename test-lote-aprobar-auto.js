'use strict';
// Tests del LOTE APROBAR-AUTO (L3 del diagnóstico de la corrida Veja #6).
// Uso: node test-lote-aprobar-auto.js [repo-dir]   (default: .)
// El estado honesto 'auto' (C12) pasa a ser DECIDIBLE: el detalle
// (canAccept/canMenu), la tarjeta (canApprove), la tarjeta de hoy
// (pendiente), la cola de pendientes (pzHoyPendientes), el contador de
// Aceptar todo (pzAcceptAllWeekCands), la cabecera «Por aprobar» y la
// píldora de salida de la tira tratan 'auto' como pendiente de
// decisión — igual que la ausencia del campo donde ya había default —
// y el Aceptar del detalle deriva al invitado a la hoja de cuenta con
// reintento (el patrón de pcApprove). NO se tocan los valores de
// aprobación, la píldora de C12 (apvPill) ni POST /approve.
// Funciones REALES extraídas de public/app.js con stubs mínimos.
// NO gasta IA, NO toca red, NO toca producción.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || '.');
const appSrc = fs.readFileSync(path.join(repo, 'public', 'app.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(repo, 'server.js'), 'utf8');
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

// ---------- extractor: función top-level por rebanado ----------
function sliceFn(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('no encontrado: ' + startMarker);
  const rest = src.slice(i);
  const m = rest.slice(1).search(/\n(?:async )?function /);
  return m < 0 ? rest : rest.slice(0, m + 1);
}
const escLine = appSrc.split('\n').find((l) => l.startsWith('const esc = '));
if (!escLine) throw new Error('const esc no encontrada');

// =====================================================================
// A) DETALLE (approvalPostView real): 'auto' gana Aceptar y menú.
// =====================================================================
let CURRENT_POST = null;
const apiCallsA = [];
const ctxA = {
  console,
  ME: { lang: 'es' },
  SETTINGS: { timezone: 'America/New_York' },
  PROFILE: { ig_connected: true },
  api: {
    get: async (url) => { apiCallsA.push(['GET', url]); return { post: CURRENT_POST }; },
    post: async (url, body) => { apiCallsA.push(['POST', url, body]); return { ok: true }; },
    patch: async (url, body) => { apiCallsA.push(['PATCH', url, body]); return { ok: true }; },
  },
  track: () => {},
  toast: () => {},
  render: () => {},
  pzIc: () => '',
  pzApvBackHTML: () => '<a class="apv-back">‹ Volver</a>',
  hfAskChangeBtnHTML: () => '<button class="hf-ask">qué le cambiamos a este posteo?</button>',
  document: { querySelector: () => null, querySelectorAll: () => [] },
};
vm.createContext(ctxA);
vm.runInContext([
  escLine,
  sliceFn(appSrc, 'function apvTz('),
  sliceFn(appSrc, 'function apvParse('),
  sliceFn(appSrc, 'function apvDayKey('),
  sliceFn(appSrc, 'function apvHM('),
  sliceFn(appSrc, 'function apvWhenText('),
  sliceFn(appSrc, 'function apvCountdown('),
  sliceFn(appSrc, 'function apvPill('),
  sliceFn(appSrc, 'function apvNotFound('),
  sliceFn(appSrc, 'async function approvalPostView('),
  sliceFn(appSrc, 'function apvMoreHTML('),
  sliceFn(appSrc, 'function humanError('),
  sliceFn(appSrc, 'function pcDayKeyShift('),
].join('\n'), ctxA);
const approvalPostView = vm.runInContext('approvalPostView', ctxA);

function post(o) {
  return Object.assign({
    id: 654, caption: 'The Atlas in everyone\'s asking for', hashtags: '',
    image_path: '/img/654.jpg', media_type: 'image', status: 'scheduled',
    approval: 'auto', scheduled_at: '2026-11-13T19:00:00-05:00',
    carousel_paths: '[]', caption_on: 0,
  }, o);
}

async function runDetailCases() {
  // A1) EL CASO DE LA CORRIDA #6: invitado, programado + 'auto'.
  CURRENT_POST = post({});
  let html = await approvalPostView(654);
  ok(html.includes('id="apvAccept"'), 'A1 auto: CON botón Aceptar');
  ok(html.includes('id="apvMenuBtn"'), 'A1 auto: CON menú •••');
  ok(html.includes('id="apvHold"'), 'A1 auto: Frenar en el menú');
  ok(html.includes('id="apvConfirm"'), 'A1 auto: diálogo Rechazar sigue');
  ok(html.includes('Sale solo a las 19:00'), 'A1 auto: píldora C12 intacta («Sale solo a las 19:00»)');
  ok(!html.includes('Aprobado —'), 'A1 auto: la píldora NO dice Aprobado');

  // A2) 'auto' + en revisión: la guarda v931 sigue mandando.
  CURRENT_POST = post({ needs_review: 1 });
  html = await approvalPostView(654);
  ok(!html.includes('id="apvAccept"'), 'A2 auto+revisión: SIN Aceptar (guarda v931)');
  ok(html.includes('en revisión'), 'A2 auto+revisión: aviso de revisión presente');

  // A3) Pendiente: como siempre.
  CURRENT_POST = post({ approval: 'pending' });
  html = await approvalPostView(654);
  ok(html.includes('id="apvAccept"'), 'A3 pendiente: CON Aceptar');
  ok(html.includes('id="apvMenuBtn"'), 'A3 pendiente: CON menú');

  // A4) Aprobado: sin Aceptar, con menú (registrado sin cambios).
  CURRENT_POST = post({ approval: 'approved' });
  html = await approvalPostView(654);
  ok(!html.includes('id="apvAccept"'), 'A4 aprobado: SIN Aceptar');
  ok(html.includes('id="apvMenuBtn"'), 'A4 aprobado: CON menú');
  ok(html.includes('Aprobado — sale a las 19:00'), 'A4 aprobado: píldora de aprobado intacta');

  // A5) Borrador: su Aceptar propio, nunca el de programado.
  CURRENT_POST = post({ status: 'draft', approval: 'pending' });
  html = await approvalPostView(654);
  ok(html.includes('id="apvAcceptDraft"'), 'A5 borrador: CON Aceptar de borrador');
  ok(!html.includes('id="apvAccept"'), 'A5 borrador: SIN Aceptar de programado');

  // A6) Rechazado: nada que decidir (sin cambios).
  CURRENT_POST = post({ approval: 'rejected' });
  html = await approvalPostView(654);
  ok(!html.includes('id="apvAccept"'), 'A6 rechazado: SIN Aceptar');
  ok(!html.includes('id="apvMenuBtn"'), 'A6 rechazado: SIN menú');
}

// =====================================================================
// B) TARJETA (postCardHTML real): canApprove acepta 'auto'.
// =====================================================================
const ctxB = {
  console,
  ME: { lang: 'es' },
  pcTz: () => 'America/New_York',
  pzIsPubReal: (p) => String(p.status) === 'published',
  pcParseDate: (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
  pcFmtDay: () => 'vie 13 nov',
  pcFmtHour: () => '19:00',
  pcFmtDayLong: () => 'viernes 13 de noviembre',
  pzIc: () => '',
  pcBadge: () => '',
};
vm.createContext(ctxB);
vm.runInContext([escLine, sliceFn(appSrc, 'function postCardHTML(')].join('\n'), ctxB);
const postCardHTML = vm.runInContext('postCardHTML', ctxB);

function runCardCases() {
  const base = { id: 655, caption: 'Salar', image_path: '/img/655.jpg', media_type: 'image', status: 'scheduled', scheduled_at: '2026-11-14T19:00:00-05:00' };
  ok(postCardHTML(Object.assign({}, base, { approval: 'auto' })).includes('data-pc-act="approve"'), 'B1 tarjeta auto: CON botón Aprobar');
  ok(postCardHTML(Object.assign({}, base, { approval: 'pending' })).includes('data-pc-act="approve"'), 'B2 tarjeta pendiente: CON botón Aprobar');
  ok(!postCardHTML(Object.assign({}, base, { approval: 'approved' })).includes('data-pc-act="approve"'), 'B3 tarjeta aprobado: SIN botón Aprobar');
  ok(!postCardHTML(Object.assign({}, base, {})).includes('data-pc-act="approve"'), 'B4 tarjeta sin campo: SIN botón (esa superficie nunca tuvo default)');
  ok(!postCardHTML(Object.assign({}, base, { approval: 'auto', status: 'draft' })).includes('data-pc-act="approve"'), 'B5 tarjeta borrador+auto: SIN botón (solo programados)');
}

// =====================================================================
// C) TARJETA DE HOY (pzHoyCardHTML real): botones estables, sin destello.
// =====================================================================
const ctxC = {
  console,
  mv: (x) => x,
  pcParseDate: (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
  pzWhenRelDay: () => 'hoy',
  hfChipText: () => '',
  pzRitualCuentaTxt: () => ({ faltan: '2 h' }),
  pzHoyCuandoCorto: () => 'hoy · 19:00',
  __imgFb: () => {},
};
vm.createContext(ctxC);
vm.runInContext([
  escLine,
  sliceFn(appSrc, 'function pzHoyHoraCorta('),
  sliceFn(appSrc, 'function pzHoyPillSalida('),
  sliceFn(appSrc, 'function pzHoyCuentaSaleTxt('),
  sliceFn(appSrc, 'function pzHoyCardHTML('),
].join('\n'), ctxC);
const pzHoyCardHTML = vm.runInContext('pzHoyCardHTML', ctxC);

function runHoyCardCases() {
  const base = { id: 654, caption: 'The Atlas', image_path: '/img/654.jpg', media_type: 'image', status: 'scheduled', scheduled_at: '2026-11-13T19:00:00-05:00' };
  const hAuto = pzHoyCardHTML(Object.assign({}, base, { approval: 'auto' }), {});
  ok(hAuto.includes('data-pz-hoy-aprobar="654"'), 'C1 hoy auto: CON «Dale, publicalo ✓»');
  ok(hAuto.includes('data-pz-hoy-cambiar="654"'), 'C1 hoy auto: CON «Cambialo»');
  ok(!hAuto.includes('pz-hoy-ok'), 'C1 hoy auto: SIN nota «✓ Agendado»');
  const hSin = pzHoyCardHTML(Object.assign({}, base), {});
  ok(hSin.includes('data-pz-hoy-aprobar="654"'), 'C2 hoy sin campo: CON botones (ausencia = pendiente)');
  ok(hSin.includes('data-pz-hoy-aprobar="654"') === hAuto.includes('data-pz-hoy-aprobar="654"'), 'C2 hoy: ausencia y auto dan lo mismo (sin destello)');
  const hPend = pzHoyCardHTML(Object.assign({}, base, { approval: 'pending' }), {});
  ok(hPend.includes('data-pz-hoy-aprobar="654"'), 'C3 hoy pendiente: CON botones');
  const hAppr = pzHoyCardHTML(Object.assign({}, base, { approval: 'approved' }), {});
  ok(!hAppr.includes('data-pz-hoy-aprobar'), 'C4 hoy aprobado: SIN botones');
  ok(hAppr.includes('pz-hoy-ok'), 'C4 hoy aprobado: nota «✓ Agendado» sigue');
}

// =====================================================================
// D) COLA DE PENDIENTES (pzHoyPendientes real) + E) ACEPTAR TODO.
// =====================================================================
const ctxD = {
  console,
  pcParseDate: (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? null : d; },
  schedDayKeyOf: (d, tz) => {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      const g = (t) => (parts.find((x) => x.type === t) || {}).value || '';
      return g('year') + '-' + g('month') + '-' + g('day');
    } catch (e) { return ''; }
  },
};
vm.createContext(ctxD);
vm.runInContext([
  sliceFn(appSrc, 'function pzHoyPostDiaKey('),
  sliceFn(appSrc, 'function pzHoyPendientes('),
  sliceFn(appSrc, 'function pzAcceptAllWeekCands('),
].join('\n'), ctxD);
const pzHoyPendientes = vm.runInContext('pzHoyPendientes', ctxD);
const pzAcceptAllWeekCands = vm.runInContext('pzAcceptAllWeekCands', ctxD);

function runQueueCases() {
  const tz = 'America/New_York';
  const mk = (id, fecha, approval) => ({ kind: 'post', post: { id, status: 'scheduled', approval, scheduled_at: fecha, media_type: 'image' } });
  // hoy 2026-11-13 · mañana 2026-11-14 · pasado 2026-11-15 (semana del 9)
  const todos = [
    { id: 655, status: 'scheduled', approval: 'auto', scheduled_at: '2026-11-14T19:00:00-05:00', media_type: 'image' },   // cartita (mañana, auto)
    { id: 656, status: 'scheduled', approval: 'auto', scheduled_at: '2026-11-15T19:00:00-05:00', media_type: 'image' },   // resto (auto)
    { id: 657, status: 'scheduled', approval: 'approved', scheduled_at: '2026-11-15T19:00:00-05:00', media_type: 'image' }, // fuera
    { id: 658, status: 'scheduled', approval: 'pending', scheduled_at: '2026-11-15T19:00:00-05:00', media_type: 'image' }, // resto
  ];
  const out = pzHoyPendientes(todos, '2026-11-13', '2026-11-14', '2026-11-09', tz);
  ok(out.cartita && String(out.cartita.id) === '655', 'D1 cola: la cartita de mañana (auto) es la 655');
  ok(out.resto.some((p) => String(p.id) === '656'), 'D2 cola: el auto de pasado mañana queda en el resto');
  ok(out.resto.some((p) => String(p.id) === '658'), 'D3 cola: el pendiente queda en el resto');
  ok(!out.resto.some((p) => String(p.id) === '657'), 'D4 cola: el aprobado NO entra al resto');
  ok(out.total === 3, 'D5 cola: total = resto(2) + cartita auto(1) = 3');

  const cands = pzAcceptAllWeekCands([
    mk(1, '2026-11-14T19:00:00-05:00', 'auto'),
    mk(2, '2026-11-14T19:00:00-05:00', 'pending'),
    mk(3, '2026-11-14T19:00:00-05:00', undefined),
    mk(4, '2026-11-14T19:00:00-05:00', 'approved'),
    { kind: 'post', post: { id: 5, status: 'draft', approval: 'auto' } },
  ], null);
  const ids = cands.map((t) => String(t.post.id)).sort();
  ok(ids.join(',') === '1,2,3', 'E1 aceptar-todo: candidatos = auto + pendiente + sin campo; aprobado y borrador fuera');
}

// =====================================================================
// F) FLUJO DEL INVITADO: tocar Aprobar → hoja de cuenta → se completa.
// =====================================================================
// F1) El «Dale, publicalo ✓» de la tarjeta de hoy (handler real).
let guestF = true;
let sheetPendingF = null;
let sheetCallsF = 0;
const apiCallsF = [];
const ctxF = {
  console,
  ME: { lang: 'en' },
  PROFILE: { ig_connected: true },
  pzIsGuest: () => guestF,
  pzGuestAccountSheet: (pend) => { sheetCallsF++; sheetPendingF = pend; },
  f3ApprovalMode: async () => ({ manual: true, known: true }),
  api: { post: async (url, body) => { apiCallsF.push(['POST', url]); return { ok: true }; }, patch: async (url, body) => { apiCallsF.push(['PATCH', url]); return { ok: true }; } },
  toast: () => {},
  render: () => {},
  track: () => {},
  igGateFeedback: () => {},
  esc: (s) => String(s == null ? '' : s),
};
vm.createContext(ctxF);
vm.runInContext(sliceFn(appSrc, 'async function pzHoyAprobarUno('), ctxF);
const pzHoyAprobarUno = vm.runInContext('pzHoyAprobarUno', ctxF);

async function runGuestHoyCase() {
  const btn = { disabled: false, getAttribute: (k) => ({ 'data-pz-hoy-aprobar': '654', 'data-pz-hoy-status': 'scheduled', 'data-pz-hoy-when': '' }[k] || '') };
  guestF = true; sheetPendingF = null; sheetCallsF = 0; apiCallsF.length = 0;
  await pzHoyAprobarUno(btn);
  ok(sheetCallsF === 1 && typeof sheetPendingF === 'function', 'F1 invitado: tocar «Dale, publicalo» abre la hoja de cuenta');
  ok(apiCallsF.length === 0, 'F1 invitado: sin cuenta NO se llama a /approve');
  guestF = false; // creó la cuenta
  await sheetPendingF();
  ok(apiCallsF.some((c) => c[0] === 'POST' && c[1] === '/api/posts/654/approve'), 'F1 creada la cuenta: la aprobación se completa sola (POST /approve)');
}

// F2) El Aceptar del DETALLE (bindApprovalPost real, DOM mínimo).
function runGuestDetailCase() {
  return new Promise((resolve) => {
    let guest = true;
    let sheetPending = null;
    let sheetCalls = 0;
    const calls = [];
    const acc = {
      dataset: { apvid: '654' }, disabled: false, textContent: '', innerHTML: 'Aceptar',
      onclick: null, click() { if (typeof this.onclick === 'function') return this.onclick(); },
    };
    const ctx = {
      console,
      ME: { lang: 'es' },
      pzIsGuest: () => guest,
      pzGuestAccountSheet: (pend) => { sheetCalls++; sheetPending = pend; },
      api: { post: async (url) => { calls.push(url); return { ok: true }; }, patch: async () => ({ ok: true }), del: async () => ({ ok: true }), get: async () => ({}) },
      toast: () => {}, render: () => {}, track: () => {}, esc: (s) => String(s == null ? '' : s),
      location: { hash: '' },
      sessionStorage: { removeItem: () => {}, getItem: () => null, setItem: () => {} },
      document: {
        getElementById: (id) => (id === 'apvAccept' ? acc : null),
        querySelector: () => null, querySelectorAll: () => [],
      },
    };
    vm.createContext(ctx);
    vm.runInContext(sliceFn(appSrc, 'function bindApprovalPost('), ctx);
    const bindApprovalPost = vm.runInContext('bindApprovalPost', ctx);
    bindApprovalPost();
    (async () => {
      await acc.onclick();
      ok(sheetCalls === 1 && typeof sheetPending === 'function', 'F2 invitado en el detalle: Aceptar abre la hoja de cuenta');
      ok(calls.length === 0, 'F2 invitado en el detalle: sin cuenta NO se llama a /approve');
      ok(acc.disabled === false, 'F2 invitado: el botón no queda trabado en «Aprobando…»');
      guest = false; // creó la cuenta: la hoja dispara el reintento
      if (typeof sheetPending === 'function') {
        await sheetPending();
        await new Promise((r) => setTimeout(r, 10));
        ok(calls.some((u) => u === '/api/posts/654/approve'), 'F2 creada la cuenta: la aprobación del detalle se completa sola');
      } else {
        ok(false, 'F2 creada la cuenta: la aprobación del detalle se completa sola (sin reintento registrado)');
      }
      resolve();
    })().catch((e) => { ok(false, 'F2 excepción: ' + (e && e.message)); resolve(); });
  });
}

// F3) Registrado en el detalle: Aceptar llama directo, sin hoja.
function runRegDetailCase() {
  return new Promise((resolve) => {
    let sheetCalls = 0;
    const calls = [];
    const acc = {
      dataset: { apvid: '654' }, disabled: false, textContent: '', innerHTML: 'Aceptar',
      onclick: null, click() { if (typeof this.onclick === 'function') return this.onclick(); },
    };
    const ctx = {
      console,
      ME: { lang: 'es' },
      pzIsGuest: () => false,
      pzGuestAccountSheet: () => { sheetCalls++; },
      api: { post: async (url) => { calls.push(url); return { ok: true }; }, patch: async () => ({ ok: true }), del: async () => ({ ok: true }), get: async () => ({}) },
      toast: () => {}, render: () => {}, track: () => {}, esc: (s) => String(s == null ? '' : s),
      location: { hash: '' },
      sessionStorage: { removeItem: () => {}, getItem: () => null, setItem: () => {} },
      document: {
        getElementById: (id) => (id === 'apvAccept' ? acc : null),
        querySelector: () => null, querySelectorAll: () => [],
      },
    };
    vm.createContext(ctx);
    vm.runInContext(sliceFn(appSrc, 'function bindApprovalPost('), ctx);
    vm.runInContext('bindApprovalPost', ctx)();
    (async () => {
      await acc.onclick();
      ok(sheetCalls === 0, 'F3 registrado: Aceptar NO abre hoja');
      ok(calls.some((u) => u === '/api/posts/654/approve'), 'F3 registrado: Aceptar llama a /approve directo');
      resolve();
    })().catch((e) => { ok(false, 'F3 excepción: ' + (e && e.message)); resolve(); });
  });
}

// =====================================================================
// G) ESTÁTICOS + M78: las condiciones nuevas y las funciones llamadas.
// =====================================================================
function staticChecks() {
  ok(/const canAccept = st === 'scheduled' && \(ap === 'pending' \|\| ap === 'auto'\) && !p\.needs_review/.test(appSrc), 'G1 estático: canAccept acepta auto (detalle)');
  ok(/ap === 'pending' \|\| ap === 'approved' \|\| ap === 'auto'\)\) \|\| isDraft/.test(appSrc), 'G2 estático: canMenu acepta auto (detalle)');
  ok(/const canApprove = \(String\(p\.approval\) === 'pending' \|\| String\(p\.approval\) === 'auto'\)/.test(appSrc), 'G3 estático: canApprove acepta auto (tarjeta)');
  ok((appSrc.match(/!== 'pending' && String\(p\.approval \|\| 'pending'\) !== 'auto'/g) || []).length === 2, 'G4 estático: las dos guardas de cola (Aceptar todo + resto) aceptan auto');
  ok(appSrc.includes("String((p && p.approval) || 'pending') === 'auto'"), 'G5 estático: la tarjeta de hoy trata auto como pendiente');
  ok(appSrc.includes("String(hoyPostR1.approval || 'pending') === 'auto'"), 'G6 estático: la cabecera «Por aprobar» incluye auto');
  ok(appSrc.includes("String(out.cartita.approval || 'pending') === 'auto'"), 'G7 estático: el total de la cola cuenta la cartita auto');
  ok(appSrc.includes("String(p.approval || 'pending') === 'auto')) ? pzHoyPillSalida"), 'G8 estático: la píldora de salida de la tira incluye auto');
  // M78: las funciones que el handler del detalle llama por este lote
  // existen definidas en el bundle (pzIsGuest, pzGuestAccountSheet).
  const defs = (name) => new RegExp('function ' + name + '\\s*\\(').test(appSrc);
  ok(defs('pzIsGuest') && defs('pzGuestAccountSheet'), 'G9 M78: pzIsGuest y pzGuestAccountSheet definidas en el bundle (2/2)');
  ok(defs('pcApprove') && defs('pzHoyAprobarUno'), 'G10 M78: los handlers de aprobación vigentes siguen definidos (2/2)');
  // Lo que NO se toca:
  ok(appSrc.includes("if (ap === 'auto' && st === 'scheduled')"), 'G11 intacto: la rama de la píldora C12 para auto sigue');
  ok(!/approval\s*=\s*'approved'/.test(sliceFn(appSrc, 'function bindApprovalPost(')), 'G12 intacto: el handler no escribe valores de aprobación');
  ok(srvSrc.includes("const BUILD_ID = '20261105-v1010';"), 'G13 estampado: BUILD provisorio v1010 en server.js');
  ok(!srvSrc.includes('20261105-v1007'), 'G14 estampado: v1007 ya no está en server.js');
}

(async () => {
  await runDetailCases();
  runCardCases();
  runHoyCardCases();
  runQueueCases();
  await runGuestHoyCase();
  await runGuestDetailCase();
  await runRegDetailCase();
  staticChecks();
  console.log('\n' + pass + ' ok · ' + fail + ' fallas');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL: excepción ' + (e && e.stack || e)); process.exit(1); });
