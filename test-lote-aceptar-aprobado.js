'use strict';
// Tests del LOTE ACEPTAR-APROBADO — botón «Aceptar» en posteo ya aprobado.
// Uso: node test-lote-aceptar-aprobado.js [repo-dir]   (default: .)
// Cubre: el detalle #/app/post/:id (approvalPostView REAL, extraído de
// public/app.js con stubs mínimos) + el resguardo del camino revaccept
// (handler REAL, extraído con escáner de llaves) + presencia estática
// de la regla en el resto de superficies Aceptar. NO gasta IA, NO toca
// red, NO toca producción.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || '.');
const appSrc = fs.readFileSync(path.join(repo, 'public', 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

// ---------- extractor: función top-level por rebanado ----------
// Corta desde el marcador de inicio hasta el siguiente `function ` /
// `async function ` a columna 0. Las funciones de este archivo viven
// a columna 0, así que el corte es exacto sin parsear llaves.
function sliceFn(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('no encontrado: ' + startMarker);
  const rest = src.slice(i);
  const m = rest.slice(1).search(/\n(?:async )?function /);
  return m < 0 ? rest : rest.slice(0, m + 1);
}

// ---------- escáner de llaves (strings, templates con ${}, comentarios) ----------
// Devuelve el índice de la llave que cierra la `{` de `openIdx`.
// Pila de marcos: {type:'code', depth} o {type:'tpl'}; el marco inicial
// es el bloque cuya `{` está en openIdx (depth 1).
function matchBrace(src, openIdx) {
  const stack = [{ type: 'code', depth: 1 }];
  let i = openIdx + 1;
  let mode = 'code'; // 'code' | 'str1' | 'str2' | 'tpl' | 'line' | 'block'
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (mode === 'line') { if (c === '\n') mode = 'code'; i++; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i += 2; continue; } i++; continue; }
    if (mode === 'str1' || mode === 'str2') {
      const q = mode === 'str1' ? "'" : '"';
      if (c === '\\') { i += 2; continue; }
      if (c === q) mode = 'code';
      i++; continue;
    }
    if (mode === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') {
        stack.pop();
        mode = stack.length && stack[stack.length - 1].type === 'tpl' ? 'tpl' : 'code';
        i++; continue;
      }
      if (c === '$' && n === '{') { stack.push({ type: 'code', depth: 1 }); mode = 'code'; i += 2; continue; }
      i++; continue;
    }
    // mode === 'code'
    if (c === '/' && n === '/') { mode = 'line'; i += 2; continue; }
    if (c === '/' && n === '*') { mode = 'block'; i += 2; continue; }
    if (c === "'") { mode = 'str1'; i++; continue; }
    if (c === '"') { mode = 'str2'; i++; continue; }
    if (c === '`') { stack.push({ type: 'tpl' }); mode = 'tpl'; i++; continue; }
    if (c === '{') { stack[stack.length - 1].depth++; i++; continue; }
    if (c === '}') {
      const top = stack[stack.length - 1];
      top.depth--;
      if (top.depth === 0) {
        stack.pop();
        if (!stack.length) return i;
        mode = stack[stack.length - 1].type === 'tpl' ? 'tpl' : 'code';
      }
      i++; continue;
    }
    i++;
  }
  throw new Error('llave sin cierre desde ' + openIdx);
}

// ---------- fuentes extraídas ----------
// esc vive como const en la línea 4.
const escLine = appSrc.split('\n').find((l) => l.startsWith('const esc = '));
if (!escLine) throw new Error('const esc no encontrada');
const pieces = [
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
].join('\n');

// ---------- contexto con stubs ----------
let CURRENT_POST = null;
const toasts = [];
const renders = [];
const apiCalls = [];
const ctx = {
  console,
  ME: { lang: 'es' },
  SETTINGS: { timezone: 'America/New_York' },
  PROFILE: { ig_connected: true },
  api: {
    get: async (url) => { apiCalls.push(['GET', url]); return { post: CURRENT_POST }; },
    post: async (url, body) => { apiCalls.push(['POST', url, body]); return { ok: true }; },
    patch: async (url, body) => { apiCalls.push(['PATCH', url, body]); return { ok: true, scheduled_at: '2026-11-07T17:00:00-05:00', week_key: '2026-11-03' }; },
  },
  track: () => {},
  toast: (m) => { toasts.push(String(m)); },
  render: () => { renders.push(1); },
  pzIc: () => '',
  pzApvBackHTML: () => '<a class="apv-back">‹ Volver</a>',
  hfAskChangeBtnHTML: () => '<button class="hf-ask">qué le cambiamos a este posteo?</button>',
  document: { querySelector: () => null, querySelectorAll: () => [] },
};
vm.createContext(ctx);
vm.runInContext(pieces, ctx);
const approvalPostView = vm.runInContext('approvalPostView', ctx);

function post(o) {
  return Object.assign({
    id: 521, caption: '¿Cuántas veces te sentiste perdido en Instagram?',
    hashtags: '#Posty', image_path: '/img/521.jpg', media_type: 'image',
    status: 'scheduled', approval: 'approved', scheduled_at: '2026-11-07T17:00:00-05:00',
    carousel_paths: '[]', caption_on: 0,
  }, o);
}

async function runRenderCases() {
  // 1) EL BUG (caso 521 de Valentino): programado + aprobado.
  CURRENT_POST = post({});
  let html = await approvalPostView(521);
  ok(html.includes('Aprobado — sale a las 17:00'), '521: píldora Aprobado — sale a las 17:00');
  ok(!html.includes('id="apvAccept"'), '521: SIN botón Aceptar (id=apvAccept)');
  ok(!html.includes('data-revaccept'), '521: SIN botón revaccept');
  ok(!html.includes('id="apvAcceptDraft"'), '521: SIN botón Aceptar de borrador');
  ok(html.includes('id="apvMenuBtn"'), '521: menú ••• sigue');
  ok(html.includes('id="apvHold"'), '521: Frenar sigue en el menú');
  ok(html.includes('qué le cambiamos a este posteo?'), '521: mini-chat sigue');
  ok(html.includes('id="apvConfirm"'), '521: diálogo Rechazar sigue (para el menú)');
  ok(html.includes('Sale hoy 17:00'), '521: línea ⏰ Sale hoy 17:00');

  // 2) Programado + pendiente: Aceptar SÍ, es lo que hay que decidir.
  CURRENT_POST = post({ approval: 'pending' });
  html = await approvalPostView(521);
  ok(html.includes('id="apvAccept"'), 'pendiente: CON botón Aceptar');
  ok(html.includes('Pendiente'), 'pendiente: píldora Pendiente');
  ok(html.includes('id="apvMenuBtn"'), 'pendiente: menú ••• sigue');

  // 3) Borrador: Aceptar de borrador, nunca el de programado.
  CURRENT_POST = post({ status: 'draft', approval: 'pending', scheduled_at: '2026-11-08T17:00:00-05:00' });
  html = await approvalPostView(521);
  ok(html.includes('id="apvAcceptDraft"'), 'borrador: CON botón Aceptar de borrador');
  ok(!html.includes('id="apvAccept"'), 'borrador: SIN botón Aceptar de programado');
  ok(html.includes('id="apvMenuBtn"'), 'borrador: menú ••• sigue');
  ok(html.includes('Saldría'), 'borrador: línea Saldría · si lo aceptás');

  // 4) Publicado: nada que aceptar, solo pedir un cambio.
  CURRENT_POST = post({ status: 'published', approval: 'approved', published_at: '2026-11-07T17:00:00-05:00', permalink: 'https://ig.example/p/1' });
  html = await approvalPostView(521);
  ok(!html.includes('id="apvAccept"') && !html.includes('id="apvAcceptDraft"'), 'publicado: SIN Aceptar');
  ok(html.includes('Publicado'), 'publicado: píldora Publicado');
  ok(html.includes('id="apvChangePub"'), 'publicado: Pedir un cambio sigue');
  ok(!html.includes('id="apvMenuBtn"'), 'publicado: SIN menú •••');

  // 5) Rechazado: nada que aceptar, nada de menú.
  CURRENT_POST = post({ approval: 'rejected' });
  html = await approvalPostView(521);
  ok(!html.includes('id="apvAccept"'), 'rechazado: SIN Aceptar');
  ok(html.includes('Rechazado'), 'rechazado: píldora Rechazado');
  ok(!html.includes('id="apvMenuBtn"'), 'rechazado: SIN menú');

  // 6) Cancelado: igual que rechazado.
  CURRENT_POST = post({ status: 'cancelled', approval: 'pending' });
  html = await approvalPostView(521);
  ok(!html.includes('id="apvAccept"'), 'cancelado: SIN Aceptar');
  ok(html.includes('Rechazado'), 'cancelado: píldora Rechazado');
  ok(!html.includes('id="apvMenuBtn"'), 'cancelado: SIN menú');

  // 7) Salió solo (auto): nada que decidir.
  CURRENT_POST = post({ approval: 'auto' });
  html = await approvalPostView(521);
  ok(!html.includes('id="apvAccept"'), 'auto: SIN Aceptar');
  ok(html.includes('Salió solo'), 'auto: píldora Salió solo');

  // 8) Posteo inexistente.
  CURRENT_POST = null;
  html = await approvalPostView(999999);
  ok(html.includes('no existe'), 'inexistente: tarjeta «no existe»');
}

// ---------- resguardo revaccept (handler REAL) ----------
function revacceptBody() {
  const marker = "$$('[data-revaccept]').forEach(b => b.onclick = async () => {";
  const i = appSrc.indexOf(marker);
  if (i < 0) throw new Error('handler revaccept no encontrado');
  const open = appSrc.indexOf('{', i + marker.length - 1);
  const close = matchBrace(appSrc, open);
  return appSrc.slice(open + 1, close);
}

async function runGuardCases() {
  const body = revacceptBody();
  // El handler corre con `b` en scope; el resto son stubs del contexto.
  const handlerSrc = `(async () => {\n${body}\n})`;
  const ctx2 = {
    console,
    b: null,
    PROFILE: { ig_connected: true },
    api: {
      get: async (url) => { apiCalls.push(['GET', url]); return { post: CURRENT_POST }; },
      post: async (url, body) => { apiCalls.push(['POST', url, body]); return { ok: true }; },
      patch: async (url, body) => { apiCalls.push(['PATCH', url, body]); return { ok: true, scheduled_at: '2026-11-07T17:00:00-05:00', week_key: '2026-11-03' }; },
    },
    toast: (m) => { toasts.push(String(m)); },
    render: () => { renders.push(1); },
    track: () => {},
    igGateFeedback: () => {},
    pzIc: () => '',
    esc: (s) => String(s ?? ''),
    $: () => null,
    m: null,
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    REVIEW_DRAFTS: [{ id: 999 }],
    pcParseDate: (s) => new Date(String(s).replace(' ', 'T')),
    pcFmtDayLong: () => 'viernes 7 de noviembre',
    albumMondayKey: () => '2026-11-03',
    isPlanLimitErr: () => false,
    planLimitModal: () => {},
    streakModalShell: () => {},
    pzFillRefPeak: () => {},
    closeStreakModal: () => {},
  };
  vm.createContext(ctx2);

  function reset() { toasts.length = 0; renders.length = 0; apiCalls.length = 0; }
  async function fire(postState) {
    CURRENT_POST = postState;
    ctx2.b = { dataset: { revaccept: '521', proposed: '' }, disabled: false };
    await vm.runInContext(handlerSrc + '()', ctx2);
  }

  // G1) Doble Aceptar sobre un posteo YA programado: no se re-programa.
  reset();
  await fire(post({}));
  ok(!apiCalls.some((c) => c[0] === 'PATCH'), 'guard: Aceptar sobre programado NO hace PATCH');
  ok(!apiCalls.some((c) => c[0] === 'POST' && String(c[1]).includes('/signal')), 'guard: Aceptar sobre programado NO manda signal');
  ok(toasts.some((t) => t.includes('ya estaba aprobado')), 'guard: avisa «ya estaba aprobado»');
  ok(renders.length >= 1, 'guard: re-renderiza la lista vieja');

  // G2) Borrador: el camino vigente sigue intacto (PATCH + signal).
  reset();
  await fire(post({ status: 'draft', approval: 'pending' }));
  ok(apiCalls.some((c) => c[0] === 'PATCH' && String(c[1]).includes('/api/posts/521')), 'guard: borrador SÍ hace PATCH');
  ok(apiCalls.some((c) => c[0] === 'POST' && String(c[1]).includes('/signal')), 'guard: borrador SÍ manda signal approved');

  // G3) Si la verificación falla por red, se sigue como antes (degradado).
  reset();
  ctx2.api.get = async () => { throw new Error('red caída'); };
  await fire(post({ status: 'draft', approval: 'pending' }));
  ok(apiCalls.some((c) => c[0] === 'PATCH'), 'guard: sin red, el flujo viejo sigue (degradado)');
}

// ---------- presencia estática de la regla en el resto de superficies ----------
function staticChecks() {
  ok(!/const canAct = st === 'scheduled' && \(ap === 'pending' \|\| ap === 'approved'\)/.test(appSrc),
    'estático: la regla vieja (canAct con approved) ya no existe');
  ok(/const canAccept = st === 'scheduled' && ap === 'pending'/.test(appSrc),
    'estático: canAccept = programado + pendiente');
  ok(/fresh\.status.*!== 'draft'/.test(appSrc) || /fp\.status/.test(appSrc),
    'estático: el handler revaccept verifica el estado fresco antes del PATCH');
  ok(appSrc.includes('ya estaba aprobado'),
    'estático: el resguardo avisa «ya estaba aprobado»');
  ok(/const simpleAccept = simple && d\.status === 'draft' && !isPending/.test(appSrc),
    'estático: tarjeta simple — Aceptar solo borrador');
  ok(/const canApprove = String\(p\.approval\) === 'pending' && String\(p\.status\) === 'scheduled'/.test(appSrc),
    'estático: tarjeta de Agenda — Aprobar solo programado + pendiente');
  ok(/const accept = \(!o\.visitor && p\.status === 'draft'\)/.test(appSrc),
    'estático: detalle lightbox — Aceptar solo borrador');
  ok(/root\.dataset\.f3Status && root\.dataset\.f3Status !== 'draft'/.test(appSrc),
    'estático: doble toque sin bindReview — solo borradores');
  ok(/if \(post\.approval === 'approved' \|\| post\.approval === 'auto'\)/.test(
    fs.readFileSync(path.join(repo, 'server.js'), 'utf8')),
    'estático: servidor /approve idempotente (ya aprobado → ok sin UPDATE)');
}

(async () => {
  await runRenderCases();
  await runGuardCases();
  staticChecks();
  console.log(`\n${pass} ok · ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL: excepción ' + (e && e.stack || e)); process.exit(1); });
