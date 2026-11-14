// test-lote-subir-cabecera.js — LOTE SUBIR-CABECERA (13/11): los 4
// errores de render de la pantalla Subir que Valentino marcó con
// captura en vivo.
//
// 1) CABECERA DUPLICADA: subirView() era la ÚNICA vista que devolvía
//    appShell('subir', inner) — y el router envuelve OTRA vez al pintar
//    (root.innerHTML = appShell(tab, content)): la pestaña salía con
//    dos cabeceras «Posty. / tu community manager» y dos barras.
//    Arreglo: la vista devuelve solo su contenido, como todas.
// 2) FLECHA EN PESTAÑA: pzBackHTML no excluía 'subir' (ni 'ajustes'):
//    el círculo fijo ← caía sobre el avatar de la cabecera. Arreglo en
//    el componente compartido: los 4 destinos de la barra inferior
//    (inicio · ads · subir · ajustes) sin atrás en los tres helpers
//    (fijo, mtop y desktop); las pantallas apiladas lo conservan.
// 3) LA CARA EQUIVOCADA: la tarjeta dorada (y el kick de preguntas y
//    la cabecera del recibo) usaban /posty-logo.png — la placa
//    wordmark 226×62 — forzada en un círculo de 52px sin object-fit:
//    salía aplastada. Arreglo: el asset de la cara (ai-avatar.png,
//    512×512, el mismo de la cabecera del shell) + object-fit:cover.
// 4) TEXTO QUE ANUNCIA LO QUE NO ESTÁ: la tarjeta decía «Las preguntas
//    de abajo…» en el estado vacío, donde todavía no hay preguntas.
//    Arreglo: la frase vive en un span que nace oculto y se muestra
//    recién cuando la tarjeta de preguntas aparece (pzSubirUpload) y
//    se vuelve a ocultar cuando el formulario se resetea
//    (pzSubirResolver).
//
// 5) (AGREGADO SUBIR-VOZ-DERECHA · 13/11) MICRÓFONO A LA DERECHA:
//    la tarjeta de voz de Subir («¿Algo más?») era la única tira de
//    voz con el micrófono a la IZQUIERDA del texto; las tiras de los
//    posteos y de la semana lo llevan a la derecha (hint flex:1 +
//    botón al final de la barra). Arreglo: el texto va primero en el
//    DOM con flex:1 (.voz-op-txt) y el botón .mic-s después — mismo
//    tamaño, color y comportamiento (se ata por atributo, no por
//    posición); el estado queda último, como estaba.
//
// Control: la misma batería corre contra el árbol base (../base) y
// tiene que REPRODUCIR las 4 fallas. La base de control se puede
// apuntar con LOTE_BASE_DIR (el agregado voz-derecha corre sobre el
// release de cabecera: sus K1–K4 solo tienen sentido contra v1020,
// y K5–K6 contra cualquiera de las dos bases — en ambas el micrófono
// estaba a la izquierda).
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
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const markers = ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '];
  let end = src.length;
  for (const m of markers) {
    const j = src.indexOf(m, i + 10);
    if (j > 0 && j < end) end = j;
  }
  return src.slice(i, end);
}

const FN_NAMES = ['gzT', 'mxTabKey', 'mxModoActual', 'rsShareSheetHTML',
  'BB_SHELL_ON', 'pzShellHeadHTML', 'pzBackHTML', 'pzBackMtopHTML', 'pzBackDesktopHTML',
  'bbShell', 'appShell', 'mzTabsHTML', 'pzVozEn', 'subirView'];

function buildCtx(appSrc, lang) {
  // pzIc se stubbea: el real lee el mapa global PZ_IC (irrelevante para
  // estos pins; solo necesitamos que devuelva una cadena).
  let code = 'function pzIc(n, px) { return "<svg data-ic=\\"" + n + "\\"></svg>"; }\n';
  code += 'let PZ_SUBIR = { asset: null, kind: "", thumb: "", extra: "", todo: false, busy: false, answers: {} };\n';
  for (const n of FN_NAMES) { const f = extractFn(appSrc, n); if (f) code += f + '\n'; }
  const ctx = { ME: { lang: lang || 'es', bambooty_shell: 1 }, BB: { estado: null }, window: {}, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

async function renderSubir(ctx) {
  // Réplica del router (render()): content = await subirView() y
  // después root.innerHTML = appShell(tab, content).
  const inner = await ctx.subirView();
  return { inner, html: ctx.appShell('subir', inner) };
}

function ruleOf(css, sel) {
  const i = css.indexOf(sel + '{');
  if (i < 0) return '';
  return css.slice(i, css.indexOf('}', i) + 1);
}

(async () => {
  const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
  const idxEs = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const idxEn = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');

  // ---------- A: estática ----------
  const subirSrc = extractFn(app, 'subirView') || '';
  t('A1 la vista Subir ya no se envuelve a sí misma (sin return appShell, devuelve inner)',
    !has(subirSrc, 'return appShell(') && has(subirSrc, 'return inner;'));
  t('A2 el bundle conserva UNA sola definición de la cabecera y dos llamadas (bbShell + appShell legado)',
    count(app, 'function pzShellHeadHTML(') === 1 && count(app, 'pzShellHeadHTML(tab)') === 3);
  // RE-PIN DEL COMPUESTO (preparador, v1028): los stamps provisionales del lote (699/20261279)
  // los tomaron aterrizajes previos; el compuesto Subir estampa los definitivos 702/20261280.
  t('A3 stamps del lote: ES app?v=702 + styles 20261280 · EN styles 20261280 (definitivos del compuesto)',
    has(idxEs, '/app.js?v=702') && has(idxEs, '/styles.css?v=20261280') && has(idxEn, '/styles.css?v=20261280'));

  // ---------- B: render compuesto (VM) ----------
  const ctx = buildCtx(app, 'es');
  t('B0 la VM cargó las funciones del shell y de la vista',
    ['bbShell', 'appShell', 'subirView', 'pzShellHeadHTML', 'pzBackHTML'].every((f) => typeof ctx[f] === 'function'));
  const { inner, html } = await renderSubir(ctx);

  t('B1 UNA sola cabecera en la pestaña Subir', count(html, 'pz-shell-head') === 1 && count(html, 'pz-shell-who') === 1,
    'heads=' + count(html, 'pz-shell-head'));
  t('B2 UNA sola barra inferior', count(html, '<nav class="bb-bar">') === 1);
  t('B3 sin flecha de volver en el render de la pestaña', !has(html, 'pz-back'));
  const tabs = ['inicio', 'ads', 'subir', 'ajustes'];
  t('B4 los tres helpers de atrás devuelven vacío en los 4 destinos de la barra',
    tabs.every((tb) => ctx.pzBackHTML(tb) === '' && ctx.pzBackMtopHTML(tb) === '' && ctx.pzBackDesktopHTML(tb) === ''));
  t('B5 las pantallas apiladas conservan su atrás (schedule, bandeja)',
    has(ctx.pzBackHTML('schedule'), 'pz-back') && has(ctx.pzBackHTML('bandeja'), 'pz-back'));

  // ---------- C: la cara en la tarjeta ----------
  // RE-PIN DE COSTURA (SUBIR-SIMPLE, declarado en su STATUS): el boton suma el atributo
  // hidden (nace oculta hasta que hay material); el literal compuesto es con hidden.
  t('C1 la tarjeta dorada usa la cara (ai-avatar.png), no la placa',
    has(inner, '<button type="button" class="todo" id="pzSubirTodo" hidden><img src="/ai-avatar.png"'));
  t('C2 la vista Subir entera quedó sin la placa (tarjeta, kick y recibo)',
    count(inner, '/posty-logo.png') === 0 && !has(extractFn(app, 'pzSubirReciboPintar') || '', '/posty-logo.png'));
  t('C3 la tarjeta usa EL MISMO asset que la cabecera del shell',
    has(ctx.pzShellHeadHTML('subir'), 'ai-avatar.png'));
  t('C4 object-fit:cover en los tres círculos de la vista (tarjeta, kick, recibo)',
    has(ruleOf(css, '.pz-subir .todo img'), 'object-fit:cover')
    && has(ruleOf(css, '.pz-subir .kick img'), 'object-fit:cover')
    && has(ruleOf(css, '.pz-subir .r-head img'), 'object-fit:cover'));

  // ---------- D: el texto refleja el estado ----------
  t('D1 la frase de las preguntas nace OCULTA en su span (ES)',
    has(inner, '<span id="pzSubirTodoPreg" hidden>Las preguntas de abajo son solo si querés decidir vos algo.</span>')
    && count(inner, 'Las preguntas de abajo') === 1);
  const ctxEn = buildCtx(app, 'en');
  const innerEn = await ctxEn.subirView();
  t('D2 espejo EN: la frase también nace oculta',
    has(innerEn, '<span id="pzSubirTodoPreg" hidden>The questions below are only if you want to decide something yourself.</span>'));
  const upSrc = extractFn(app, 'pzSubirUpload') || '';
  const resSrc = extractFn(app, 'pzSubirResolver') || '';
  t('D3 la frase se muestra cuando las preguntas aparecen (pzSubirUpload destapa ambos)',
    has(upSrc, "getElementById('pzSubirPreg')") && has(upSrc, 'preg.hidden = false')
    && has(upSrc, "getElementById('pzSubirTodoPreg')") && has(upSrc, 'todoPreg.hidden = false'));
  t('D4 la frase se vuelve a ocultar cuando el formulario se resetea (pzSubirResolver)',
    has(resSrc, 'preg.hidden = true') && has(resSrc, "getElementById('pzSubirTodoPreg')") && has(resSrc, 'hidden = true'));
  // RE-PIN DE COSTURA (SUBIR-SIMPLE, declarado en su STATUS): la clausula de las fuentes
  // (pzSubirGal/pzSubirCam presentes) se elimina — esos botones salen a pedido en el compuesto.
  t('D5 el resto del flujo intacto: preguntas ocultas al nacer, Listo oculto',
    has(inner, 'id="pzSubirPreg" hidden') && has(inner, 'id="pzSubirListo" hidden'));

  // ---------- E: el micrófono de la tarjeta de voz, a la derecha ----------
  const vozOp = (inner.match(/<section class="pz-voz voz-op"[\s\S]*?<\/section>/) || [''])[0];
  t('E0 el render trae la tarjeta de voz opcional de Subir', has(vozOp, 'id="pzSubirVozOp"'));
  t('E1 el texto va ANTES del botón en el DOM (el botón queda a la derecha)',
    vozOp.indexOf('voz-op-txt') > -1 && vozOp.indexOf('data-pz-voz-mic') > vozOp.indexOf('voz-op-txt'),
    'txt@' + vozOp.indexOf('voz-op-txt') + ' mic@' + vozOp.indexOf('data-pz-voz-mic'));
  t('E2 el botón conserva tamaño/ícono/atributos (mic-s, data-pz-voz-mic, aria de mantener apretado)',
    has(vozOp, '<div class="mic-s" data-pz-voz-mic role="button" aria-label="Mantené apretado para hablar">')
    && has(ruleOf(css, '.pz-subir .voz-op .mic-s'), 'width:42px;height:42px;flex:none'));
  t('E3 la clase de layout empuja el botón al borde derecho: .voz-op-txt{flex:1}',
    has(ruleOf(css, '.pz-subir .voz-op .voz-op-txt'), 'flex:1'));
  t('E4 el estado queda en la tarjeta, después del botón (orden txt < mic < estado)',
    vozOp.indexOf('data-pz-voz-estado') > vozOp.indexOf('data-pz-voz-mic'));

  // ---------- Control contra la base: reproduce las 4 fallas ----------
  const baseDir = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
  const baseAppPath = path.join(baseDir, 'public', 'app.js');
  if (fs.existsSync(baseAppPath)) {
    const bApp = fs.readFileSync(baseAppPath, 'utf8');
    const bCss = fs.readFileSync(path.join(baseDir, 'public', 'styles.css'), 'utf8');
    const bCtx = buildCtx(bApp, 'es');
    const b = await renderSubir(bCtx);
    t('K1 control: en la base la cabecera sale DUPLICADA', count(b.html, 'pz-shell-head') === 2,
      'heads=' + count(b.html, 'pz-shell-head'));
    t('K2 control: en la base la flecha SÍ está en la pestaña', has(b.html, 'pz-back') && bCtx.pzBackHTML('subir') !== '');
    t('K3 control: en la base la tarjeta usa la placa', has(b.inner, 'id="pzSubirTodo"><img src="/posty-logo.png"'));
    t('K4 control: en la base la frase se anuncia sin span oculto',
      has(b.inner, 'Las preguntas de abajo') && !has(b.inner, 'pzSubirTodoPreg'));
    const bVozOp = (b.inner.match(/<section class="pz-voz voz-op"[\s\S]*?<\/section>/) || [''])[0];
    t('K5 control: en la base el micrófono va ANTES del texto (a la izquierda)',
      bVozOp.indexOf('data-pz-voz-mic') > -1 && bVozOp.indexOf('data-pz-voz-mic') < bVozOp.indexOf('voz-op-txt'),
      'mic@' + bVozOp.indexOf('data-pz-voz-mic') + ' txt@' + bVozOp.indexOf('voz-op-txt'));
    t('K6 control: en la base no existe la regla .voz-op-txt{flex:1}',
      !has(ruleOf(bCss, '.pz-subir .voz-op .voz-op-txt'), 'flex:1'));
  } else {
    console.log('  (control omitido: no está el árbol base hermano)');
  }

  console.log(`\n== LOTE SUBIR-CABECERA: ${pass} ok · ${fail} mal ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e && e.stack || e); process.exit(2); });
