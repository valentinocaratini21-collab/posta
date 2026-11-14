// test-lote-sin-tab-ajustes.js — LOTE SIN-TAB-AJUSTES (pedido de
// Valentino 13/11 19:20: «hay que sacar el tab de ajustes de abajo, ya
// está arriba»).
//
// Cubre: la barra inferior SIN tab de Ajustes en los DOS shells
// (mz-tabs del clásico y bb-bar del shell Bambooty) · el acceso de
// arriba intacto (ruedita del encabezado pzShellHeadHTML) · la vista y
// la ruta #/app/ajustes intactas (chunk + deep-links) · tab activo
// correcto en las demás vistas y NINGUNO resaltado en Ajustes · la
// distribución CSS reparte sola (flex:1 / space-around: sin styles) ·
// el único data-tab="ajustes" que queda es el link del drawer (menú
// lateral, no es la barra) · stamps: solo app.js?v= en el index ES;
// styles sin tocar en ambos index; BUILD estampado por el preparador
// (v1051, ?v=719: pins A7/A8 re-pineados con causa por el preparador
// sobre la base viva v1050 — la suite del builder pineaba su base
// v1020 con ?v=700 provisional y styles 20261278).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + String(extra).slice(0, 300) : ''); }
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

const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const idxEs = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');

// ================= Parte A: estática =================
{
  t('A1 ninguna barra construye el tab de Ajustes (ni mz ni bb)', !has(app, "t('ajustes', 'ajustes'") && !has(app, "tabBtn('ajustes'"));
  t('A2 el único data-tab="ajustes" del bundle es el link del drawer (menú lateral, no la barra)', count(app, 'data-tab="ajustes"') === 1 && has(app, 'drawer-link ${tab === \'ajustes\' ? \'on\' : \'\'}" data-tab="ajustes"'));
  t('A3 la ruta de Ajustes sigue viva: el router carga su chunk y su vista', has(app, "loadChunk('ajustes')") && has(app, 'ajustesView()'));
  t('A4 deep-links a Ajustes intactos (Mis fotos redirige a #/app/ajustes)', has(app, "location.hash = '#/app/ajustes'"));
  t('A5 el acceso de arriba está intacto: ruedita del encabezado a #/app/ajustes', has(extractFn(app, 'pzShellHeadHTML') || '', "bbGo('#/app/ajustes')") && has(extractFn(app, 'pzShellHeadHTML') || '', "pzIc('gear', 20)"));
  t('A6 distribución sin styles nuevos: .mz-tab es flex:1 y .bb-bar reparte con space-around', has(css, '.mz-tab{flex:1') && has(css, '.bb-bar{position:fixed') && has(css, 'justify-content:space-around'));
  t('A7 stamps: ES app.js?v=719 · styles 20261282 intacto en AMBOS index · EN sin app.js?v= (RE-PIN DEL PREPARADOR con causa: la suite del builder pineaba los stamps de su base v1020 — ?v=700 provisional y styles 20261278; sobre la base viva v1050 los valores reales son ?v=719, estampado por este preparador, y styles 20261282, que este lote NO toca)', has(idxEs, '/app.js?v=719') && has(idxEs, '/styles.css?v=20261282') && has(idxEn, '/styles.css?v=20261282') && !has(idxEn, 'app.js?v='));
  t('A8 BUILD_ID estampado por el preparador: 20261105-v1051 (vivo+1 sobre v1050; RE-PIN con causa: el builder pineaba su base v1020 sin tocar el BUILD)', has(srv, "const BUILD_ID = '20261105-v1051';"));
  t('A9 M78: las funciones del shell y las barras existen definidas', ['mzTabsHTML', 'bbShell', 'appShell', 'pzShellHeadHTML', 'pzBackHTML', 'pzBackMtopHTML', 'pzBackDesktopHTML', 'mxTabKey'].every((f) => has(app, 'function ' + f + '(')));
  t('A10 la exención de flecha no se tocó: los tres helpers pzBack* siguen definidos con su pzGoBack', ['pzBackHTML', 'pzBackMtopHTML', 'pzBackDesktopHTML'].every((f) => has(extractFn(app, f) || '', 'pzGoBack')));
}

// ================= Parte B: renders VM =================
{
  const parts = ['BB_SHELL_ON', 'mxTabKey', 'mxModoActual', 'pzBackHTML', 'pzBackMtopHTML', 'pzBackDesktopHTML', 'pzShellHeadHTML', 'bbShell', 'mzTabsHTML', 'appShell']
    .map((n) => extractFn(app, n)).filter(Boolean).join('\n');
  const mkCtx = (me) => {
    const ctx = {
      window: {},
      BB: { estado: null },
      pzIc: (n) => '<i data-ic="' + n + '"></i>',
      gzT: (es) => es,
      rsShareSheetHTML: () => '',
      setupChecklistHtml: () => '',
      console,
    };
    if (me !== undefined) ctx.ME = me;
    vm.createContext(ctx);
    vm.runInContext(parts, ctx);
    return ctx;
  };
  const navSeg = (html, cls) => { const i = html.indexOf(cls); if (i < 0) return ''; const j = html.indexOf('</nav>', i); return j < 0 ? html.slice(i) : html.slice(i, j); };

  // --- barra mz ---
  const c1 = mkCtx(undefined);
  const mzInicio = c1.mzTabsHTML('inicio');
  t('B1 barra mz: exactamente 3 pestañas (inicio · ads · subir) y ninguna de Ajustes', count(mzInicio, 'mz-tab') >= 3 && count(mzInicio, 'data-tab=') === 3 && has(mzInicio, 'data-tab="inicio"') && has(mzInicio, 'data-tab="ads"') && has(mzInicio, 'data-tab="subir"') && !has(mzInicio, 'ajustes'), mzInicio.slice(0, 200));
  t('B2 barra mz: etiquetas Inicio/Ads/Subir, sin «Ajustes»', has(mzInicio, 'Inicio') && has(mzInicio, 'Ads') && has(mzInicio, 'Subir'));
  t('B3 tab activo: en inicio resalta inicio y solo inicio', has(mzInicio, 'mz-tab on" data-tab="inicio"') && count(mzInicio, 'mz-tab on') === 1);
  const mzAds = c1.mzTabsHTML('ads');
  const mzSubir = c1.mzTabsHTML('subir');
  t('B4 tab activo: en ads y en subir resalta la suya', has(mzAds, 'mz-tab on" data-tab="ads"') && has(mzSubir, 'mz-tab on" data-tab="subir"'));
  const mzAjustes = c1.mzTabsHTML('ajustes');
  t('B5 en Ajustes la barra se pinta igual y NINGUNA pestaña queda resaltada', has(mzAjustes, 'mz-tabs') && count(mzAjustes, 'mz-tab on') === 0 && !has(mzAjustes, 'data-tab="ajustes"'));

  // --- shell bb ---
  const c2 = mkCtx({ bambooty_shell: true });
  const bbInicio = c2.bbShell('inicio', '<p>x</p>');
  const bbNav = navSeg(bbInicio, 'bb-bar');
  t('B6 barra bb: 3 pestañas (inicio · ads · subir), sin Ajustes ni su hash en la barra', count(bbNav, '<button') === 3 && has(bbNav, "#/app/inicio") && has(bbNav, "#/app/ads") && has(bbNav, "#/app/subir") && !has(bbNav, 'ajustes') && !has(bbNav, '#/app/ajustes'), bbNav.slice(0, 200));
  t('B7 shell bb: el acceso de arriba a Ajustes está FUERA de la barra (ruedita del encabezado)', has(bbInicio, "bbGo('#/app/ajustes')") && bbInicio.indexOf("bbGo('#/app/ajustes')") < bbInicio.indexOf('bb-bar'));
  const bbAjustes = c2.bbShell('ajustes', '<p>x</p>');
  t('B8 vista Ajustes en shell bb: renderiza con su clase de pantalla y ninguna pestaña resaltada', has(bbAjustes, 'bb-glass-pantallas') && count(navSeg(bbAjustes, 'bb-bar'), 'bb-tab on') === 0);

  // --- shell clásico completo ---
  const c3 = mkCtx(undefined);
  const shellInicio = c3.appShell('inicio', '<p>x</p>');
  const mzNavShell = navSeg(shellInicio, 'mz-tabs');
  t('B9 appShell clásico: la barra inferior sale sin Ajustes y el encabezado conserva la ruedita', mzNavShell.length > 0 && !has(mzNavShell, 'ajustes') && has(shellInicio, "bbGo('#/app/ajustes')"));
  const head = c3.pzShellHeadHTML('inicio');
  t('B10 pzShellHeadHTML: la ruedita lleva a #/app/ajustes con su aria-label', has(head, "bbGo('#/app/ajustes')") && has(head, 'aria-label="Ajustes"'));
}

console.log(`\nRELEASE: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
