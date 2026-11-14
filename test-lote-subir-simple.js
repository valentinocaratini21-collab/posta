// test-lote-subir-simple.js — LOTE SUBIR-SIMPLE (13/11): dos
// simplificaciones de la pantalla Subir que Valentino pidió con
// captura de la pantalla viva.
//
// 1) UN SOLO CAMINO DE ENTRADA DE MATERIAL: salen los botones
//    «De tu galería» y «Sacar una foto» de la zona de subida — el
//    botón «+» grande ya cumple la misma función. Verificación en
//    código del camino del «+» (bindSubir → zona.onclick → pick()):
//    abre #pzSubirFile, el ÚNICO input que queda, con
//    accept="image/*,video/*" y SIN atributo capture — la
//    configuración que hace que el selector del sistema ofrezca
//    galería Y cámara, para foto y para video. El input de cámara
//    que sale era solo-foto (accept="image/*"): el del «+» es un
//    superconjunto (foto+video), ninguna opción concreta se pierde.
// 2) LA TARJETA «POSTY, ENCARGATE DE TODO» APARECE RECIÉN CON
//    MATERIAL: en el estado vacío NO se muestra. Nace `hidden`
//    (con su regla compañera .pz-subir .todo[hidden]{display:none},
//    el patrón del bundle: .todo es display:flex y sin la regla el
//    atributo no alcanza), reubicada junto al material — después de
//    #pzSubirUp y ANTES de las preguntas, que es donde su texto
//    («las preguntas de abajo…») sigue siendo verdad. pzSubirUpload
//    la destapa al entrar material (foto, video o varios en
//    secuencia) y pzSubirResolver la vuelve a ocultar cuando la
//    bandeja se vacía al resolver. La subida misma (resolver,
//    preguntas, recibo, nota de voz) no cambia de comportamiento.
//
// Control: la misma batería corre contra el árbol base (../base o
// LOTE_BASE_DIR) y tiene que REPRODUCIR la pantalla de la captura:
// botones presentes, dos inputs y la tarjeta visible en vacío.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + String(extra).slice(0, 260) : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);
const count = (s, sub) => String(s || '').split(sub).length - 1;

function extractFn(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  const markers = ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '];
  let end = src.length;
  for (const m of markers) {
    const j = src.indexOf(m, i + 10);
    if (j > 0 && j < end) end = j;
  }
  return src.slice(i, end);
}

function ruleOf(css, sel) {
  const i = css.indexOf(sel + '{');
  if (i < 0) return '';
  return css.slice(i, css.indexOf('}', i) + 1);
}

// ---------- DOM falso mínimo para ejercitar el flujo real ----------
class El {
  constructor(id) {
    this.id = id || ''; this.hidden = false; this.innerHTML = ''; this.textContent = '';
    this.disabled = false; this.value = ''; this.files = null; this.clicks = 0;
    this.onclick = null; this.onchange = null; this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  appendChild(c) { this.children.push(c); return c; }
  querySelector() { return new El('q'); }
  querySelectorAll() { return []; }
  scrollIntoView() {}
  click() { this.clicks++; }
  setAttribute() {}
  getAttribute() { return null; }
}

const FN_NAMES = ['pzVozEn', 'subirView', 'pzSubirErr', 'pzSubirUpload', 'pzSubirReciboPintar',
  'pzSubirResolver', 'pzSubirPayload', 'cardScrollRecibo', 'bindSubir'];

function buildCtx(appSrc, lang) {
  const registry = new Map();
  const requested = new Set();
  const documentStub = {
    getElementById(id) {
      requested.add(id);
      if (!registry.has(id)) registry.set(id, new El(id));
      return registry.get(id);
    },
    createElement() { return new El(''); },
    querySelectorAll() { return []; },
  };
  let upBody = { ok: true, id: 'a1', kind: 'foto', thumb: '/m/t.jpg', path: '/m/t.jpg' };
  let upOk = true;
  let code = 'const esc = (s) => String(s == null ? "" : s);\n';
  code += 'function pzIc(n, px) { return "<svg data-ic=\\"" + n + "\\"></svg>"; }\n';
  code += 'function appShell(tab, inner) { return inner; }\n';
  code += 'let PZ_SUBIR = { asset: null, kind: "", thumb: "", todo: false, busy: false, extra: "", answers: { cuando: "posty", promo: "no", mejora: "si", caption: "posty", subs: "si" } };\n';
  code += 'globalThis.PZ_SUBIR = PZ_SUBIR;\n';
  for (const n of FN_NAMES) { const f = extractFn(appSrc, n); if (f) code += f + '\n'; }
  const ctx = {
    ME: { lang: lang || 'es' }, console, document: documentStub,
    fetch: async () => ({ ok: upOk, json: async () => upBody }),
    api: { post: async (url, payload) => { ctx.__lastPayload = payload; ctx.__lastUrl = url; return { ok: true, modo: 'guardado', kind: 'foto' }; } },
    __els: registry, __req: requested,
    __setUp(body, ok) { upBody = body; upOk = ok !== false; },
    __lastPayload: null, __lastUrl: '',
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

// Estado inicial de los elementos según el template (nacen hidden).
function initSegunTemplate(ctx) {
  for (const id of ['pzSubirTodo', 'pzSubirPreg', 'pzSubirQVideo', 'pzSubirVozOp', 'pzSubirListo', 'pzSubirErr', 'pzSubirCapWrap']) {
    ctx.document.getElementById(id).hidden = true;
  }
}
const el = (ctx, id) => ctx.document.getElementById(id);

(async () => {
  const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
  const idxEs = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const idxEn = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');
  const subirSrc = extractFn(app, 'subirView') || '';
  const bindSrc = extractFn(app, 'bindSubir') || '';
  const upSrc = extractFn(app, 'pzSubirUpload') || '';
  const resSrc = extractFn(app, 'pzSubirResolver') || '';

  // ---------- A: estática ----------
  t('A1 cero referencias a los botones/input salientes en TODO el bundle',
    count(app, 'pzSubirGal') === 0 && count(app, 'pzSubirCam') === 0 && count(app, 'pzSubirFileCam') === 0);
  t('A2 la vista ya no trae la fila de fuentes ni sus textos (ES y EN)',
    !has(subirSrc, 'fuentes') && !has(subirSrc, 'De tu galería') && !has(subirSrc, 'Sacar una foto')
    && !has(subirSrc, 'From your gallery') && !has(subirSrc, 'Take a photo'));
  t('A3 queda UN solo input de archivo: foto+video, SIN capture (galería y cámara desde el selector)',
    count(subirSrc, 'type="file"') === 1
    && has(subirSrc, '<input type="file" id="pzSubirFile" accept="image/*,video/*" hidden>')
    && !has(subirSrc, 'capture='));
  t('A4 la tarjeta nace oculta y reubicada: material → tarjeta → preguntas',
    has(subirSrc, 'id="pzSubirTodo" hidden')
    && subirSrc.indexOf('id="pzSubirUp"') > -1
    && subirSrc.indexOf('id="pzSubirUp"') < subirSrc.indexOf('id="pzSubirTodo"')
    && subirSrc.indexOf('id="pzSubirTodo"') < subirSrc.indexOf('id="pzSubirPreg"'));
  t('A5 regla compañera para que el hidden gane al display:flex de la tarjeta',
    has(ruleOf(css, '.pz-subir .todo[hidden]'), 'display:none'));
  // RE-PIN DEL COMPUESTO (preparador, v1028): el provisorio del lote era app?v=700; el
  // definitivo del aterrizaje compuesto Subir es 702 (el styles 20261280 sí es el del lote).
  t('A6 stamps del compuesto: ES app?v=702 + styles 20261280 · EN styles 20261280 sin app?v=',
    has(idxEs, '/app.js?v=702') && has(idxEs, '/styles.css?v=20261280')
    && has(idxEn, '/styles.css?v=20261280') && !has(idxEn, 'app.js?v='));
  t('A7 M78: las funciones de la vista y del flujo existen definidas',
    ['subirView', 'bindSubir', 'pzSubirUpload', 'pzSubirResolver', 'pzSubirReciboPintar', 'pzSubirPayload', 'pzSubirErr', 'cardScrollRecibo']
      .every((f) => app.includes('function ' + f + '(')));
  t('A8 bindSubir ata SOLO el camino del «+»: un input, sin bindings de galería/cámara',
    !has(bindSrc, 'pzSubirGal') && !has(bindSrc, 'pzSubirCam') && !has(bindSrc, 'pzSubirFileCam')
    && has(bindSrc, "getElementById('pzSubirFile')") && has(bindSrc, 'zona.onclick'));
  t('A9 los toggles de la tarjeta viven en upload (destapa) y resolver (oculta), junto a los de preguntas',
    has(upSrc, "getElementById('pzSubirTodo')") && has(upSrc, 'todoCard.hidden = false')
    && has(resSrc, "getElementById('pzSubirTodo')") && has(resSrc, 'todoCard.hidden = true'));

  // ---------- B: renders de la vista (VM) ----------
  const ctxB = buildCtx(app, 'es');
  const inner = await ctxB.subirView();
  t('B1 render ES vacío: sin los dos botones y sin la fila de fuentes',
    !has(inner, 'pzSubirGal') && !has(inner, 'pzSubirCam') && !has(inner, 'fuentes')
    && !has(inner, 'De tu galería') && !has(inner, 'Sacar una foto'));
  t('B2 render ES vacío: el «+» presente y único camino visible de entrada',
    has(inner, '<div class="plus">+</div>') && has(inner, 'id="pzSubirZona"') && count(inner, 'type="file"') === 1);
  t('B3 render ES vacío: la tarjeta dorada está en el HTML pero nace oculta',
    has(inner, 'id="pzSubirTodo" hidden') && has(inner, 'Posty, encargate de todo'));
  t('B4 render ES: posición de la tarjeta — tras el material y antes de las preguntas',
    inner.indexOf('id="pzSubirUp"') < inner.indexOf('id="pzSubirTodo"')
    && inner.indexOf('id="pzSubirTodo"') < inner.indexOf('id="pzSubirPreg"'));
  t('B5 render ES: el texto de la tarjeta sigue siendo verdad en su posición (las preguntas, abajo)',
    has(inner, 'Las preguntas de abajo son solo si querés decidir vos algo.'));
  const ctxBEn = buildCtx(app, 'en');
  const innerEn = await ctxBEn.subirView();
  t('B6 render EN vacío: espejo completo (sin botones, «+» único, tarjeta oculta)',
    !has(innerEn, 'From your gallery') && !has(innerEn, 'Take a photo')
    && has(innerEn, '<div class="plus">+</div>') && has(innerEn, 'id="pzSubirTodo" hidden')
    && has(innerEn, 'Posty, take care of everything') && has(innerEn, 'The questions below'));

  // ---------- C: comportamiento con DOM falso ----------
  const ctx = buildCtx(app, 'es');
  await ctx.subirView();
  ctx.bindSubir();
  t('C1 bindSubir solo conoce la zona, el input único, la tarjeta y el Listo (ningún botón saliente)',
    [...ctx.__req].every((id) => ['pzSubirZona', 'pzSubirFile', 'pzSubirTodo', 'pzSubirListo'].includes(id)),
    'req=' + [...ctx.__req].join(','));
  initSegunTemplate(ctx);
  const zona = el(ctx, 'pzSubirZona'), f1 = el(ctx, 'pzSubirFile'), todoBtn = el(ctx, 'pzSubirTodo');
  zona.onclick();
  t('C2 tocar la zona (el «+») abre el ÚNICO input — un click, ningún otro camino',
    f1.clicks === 1 && !ctx.__req.has('pzSubirFileCam'));
  f1.files = [{ type: 'image/jpeg' }];
  await f1.onchange();
  t('C3 con UNA FOTO en la bandeja la tarjeta aparece (y preguntas y Listo también)',
    ctx.PZ_SUBIR.asset === 'a1' && ctx.PZ_SUBIR.kind === 'foto'
    && todoBtn.hidden === false && el(ctx, 'pzSubirPreg').hidden === false && el(ctx, 'pzSubirListo').hidden === false);
  ctx.__setUp({ ok: true, id: 'a2', kind: 'video', thumb: '/m/v.jpg', path: '/m/v.jpg' });
  f1.files = [{ type: 'video/mp4' }];
  await f1.onchange();
  t('C4 con UN VIDEO la tarjeta sigue visible (y la pregunta de video se destapa)',
    ctx.PZ_SUBIR.kind === 'video' && todoBtn.hidden === false && el(ctx, 'pzSubirQVideo').hidden === false);
  await ctx.pzSubirResolver(false);
  t('C5 al resolver, la bandeja se vacía y la tarjeta se oculta de nuevo',
    ctx.PZ_SUBIR.asset === null && todoBtn.hidden === true
    && el(ctx, 'pzSubirPreg').hidden === true && el(ctx, 'pzSubirListo').hidden === true);
  ctx.__setUp({ ok: true, id: 'a3', kind: 'foto', thumb: '/m/t2.jpg', path: '/m/t2.jpg' });
  f1.files = [{ type: 'image/png' }];
  await f1.onchange();
  t('C6 varios en secuencia: una subida nueva vuelve a mostrar la tarjeta',
    ctx.PZ_SUBIR.asset === 'a3' && todoBtn.hidden === false);
  todoBtn.onclick();
  await new Promise((r) => setTimeout(r, 0)); // el onclick no devuelve la promesa del resolver: drenar microtareas
  t('C7 «encargate de todo» con material resuelve en modo todo contra el mismo resolver',
    ctx.__lastUrl === '/api/subir/resolver' && ctx.__lastPayload && ctx.__lastPayload.asset_id === 'a3'
    && ctx.__lastPayload.caption_modo === 'posty' && ctx.PZ_SUBIR.asset === null && todoBtn.hidden === true);
  ctx.__setUp({ ok: false, error: 'x' }, false);
  await ctx.pzSubirUpload({ type: 'image/jpeg' });
  t('C8 una subida fallida NO muestra la tarjeta ni deja material fantasma',
    ctx.PZ_SUBIR.asset === null && todoBtn.hidden === true && el(ctx, 'pzSubirErr').hidden === false);

  // ---------- Control contra la base: la pantalla de la captura ----------
  const baseDir = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
  const baseAppPath = path.join(baseDir, 'public', 'app.js');
  if (fs.existsSync(baseAppPath)) {
    const bApp = fs.readFileSync(baseAppPath, 'utf8');
    const bCss = fs.readFileSync(path.join(baseDir, 'public', 'styles.css'), 'utf8');
    const bCtx = buildCtx(bApp, 'es');
    const bInner = await bCtx.subirView();
    t('K1 control: en la base los dos botones SÍ están en la zona',
      has(bInner, 'id="pzSubirGal"') && has(bInner, 'id="pzSubirCam"') && has(bInner, 'De tu galería') && has(bInner, 'Sacar una foto'));
    t('K2 control: en la base hay DOS inputs (el de cámara, solo-foto con capture)',
      count(bInner, 'type="file"') === 2 && has(bInner, 'id="pzSubirFileCam" accept="image/*" capture="environment"'));
    t('K3 control: en la base la tarjeta se muestra en vacío y va ANTES de la zona',
      has(bInner, 'id="pzSubirTodo"><img') && !has(bInner, 'id="pzSubirTodo" hidden')
      && bInner.indexOf('id="pzSubirTodo"') < bInner.indexOf('id="pzSubirZona"'));
    t('K4 control: en la base no existe la regla .todo[hidden] ni los toggles de la tarjeta',
      !has(bCss, '.pz-subir .todo[hidden]')
      && !has(extractFn(bApp, 'pzSubirUpload') || '', 'pzSubirTodo'));
  } else {
    console.log('  (control omitido: no está el árbol base hermano)');
  }

  console.log(`\n== LOTE SUBIR-SIMPLE: ${pass} ok · ${fail} mal ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e && e.stack || e); process.exit(2); });
