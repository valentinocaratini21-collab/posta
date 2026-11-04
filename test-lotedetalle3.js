'use strict';
/* test-lotedetalle3.js — LOTE DETALLE-3 (1/11, Valentino: «dale, arma los 3»).
   Tres mejoras del detalle que se abre al tocar un posteo en el feed:
   1) Aceptar siempre a mano: el botón de borrador pasa de final del
      flujo a píldora fija abajo (UN solo botón, sin duplicar).
   2) Ver la foto limpia: interruptor junto a «Ver cómo se recorta»,
      solo cuando el servidor verificó base limpia real (caption_on=1).
      La limpia es la hermana `<nombre>-clean.<ext>` (convención de
      photo-cliente.js); sin hermana no hay interruptor, nunca foto
      inventada. En carrusel actúa sobre el slide mostrado.
   3) El porqué en el detalle: línea corta con el dato real guardado
      (strategy_why); sin dato no se dibuja nada inventado.
   Los mismos 3 cambios se aplican en la vista #/app/post/:id (apv),
   salvo el Aceptar, que ahí YA es principal tras el caption (Lote 17)
   y conserva su colocación (una barra fija chocaría con la UI inferior
   del shell de la app).
   Repo-ejecutable: node test-lotedetalle3.js (desde la raíz del repo).
   Lee ./public/app.js y ./public/styles.css. Sin dependencias, sin red.
   Las funciones hfCleanSister/hfCleanWire se ejecutan de verdad en vm
   contra un DOM mínimo. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); }
}
function count(src, sub) { return src.split(sub).length - 1; }

/* Extractor por llaves con estado de cadena (patrón de test-feed-16-17.js). */
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  let depth = 0, j = i, q = null, esc = false;
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = null;
    } else {
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
  }
  if (depth !== 0) return null;
  return src.slice(i, j + 1);
}

const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

/* ---------- DOM mínimo para ejecutar hfCleanWire ---------- */
function mkImg(src) {
  const listeners = {};
  const el = {
    _src: src, dataset: {},
    getAttribute(n) { return n === 'src' ? this._src : null; },
    get src() { return this._src; },
    set src(v) { this._src = v; },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    fire(ev) { (listeners[ev] || []).forEach((f) => f()); },
  };
  return el;
}
function mkBtn() {
  const cls = new Set();
  return {
    innerHTML: '', hidden: false, onclick: null, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    classList: {
      toggle(c, f) { if (f) cls.add(c); else cls.delete(c); },
      has(c) { return cls.has(c); },
    },
    click() { if (this.onclick) this.onclick(); },
  };
}
function mkContainer(imgs) {
  return {
    imgs,
    querySelectorAll(sel) { return sel === 'img' ? this.imgs : []; },
    querySelector(sel) { return sel === 'img' ? (this.imgs[0] || null) : null; },
  };
}
function mkTrack() {
  return {
    scrollLeft: 0, clientWidth: 300, listeners: {},
    addEventListener(ev, fn) { this.listeners[ev] = fn; },
    scrollTo(x) { this.scrollLeft = x; if (this.listeners.scroll) this.listeners.scroll(); },
  };
}

const pzIcStub = (name) => '<i>' + name + '</i>';
const sisterSrc = extractFn(app, 'function hfCleanSister(src) {');
const wireSrc = extractFn(app, 'function hfCleanWire(btn, en, container, track) {');
ok('helpers existen en app.js', !!sisterSrc && !!wireSrc);
const sandbox = { pzIc: pzIcStub };
if (sisterSrc) vm.runInNewContext(sisterSrc, sandbox);
if (wireSrc) vm.runInNewContext(wireSrc, sandbox);
const hfCleanSister = sandbox.hfCleanSister;
const hfCleanWire = sandbox.hfCleanWire;

/* ---------- hfCleanSister: derivación de la hermana limpia ---------- */
if (hfCleanSister) {
  ok('hermana: foo-cap.jpg -> foo-cap-clean.jpg',
    hfCleanSister('/media/foo-cap.jpg') === '/media/foo-cap-clean.jpg');
  ok('hermana: foto.png -> foto-clean.png',
    hfCleanSister('/media/foto.png') === '/media/foto-clean.png');
  ok("hermana: null, vacio o sin extension -> null",
    hfCleanSister(null) === null && hfCleanSister('') === null &&
    hfCleanSister('/media/sinext') === null);
  ok('hermana: con query no deriva (nunca URL inventada)',
    hfCleanSister('/media/foto.jpg?v=2') === null);
  ok('hermana: no duplica -clean si ya es limpia (convención)',
    hfCleanSister('/media/foo-clean.jpg') === '/media/foo-clean-clean.jpg');
}

/* ---------- hfCleanWire: carrusel ES ---------- */
if (hfCleanWire) {
  const img0 = mkImg('/media/a-cap.jpg'), img1 = mkImg('/media/b-cap.jpg');
  const track = mkTrack();
  const btn = mkBtn();
  hfCleanWire(btn, false, mkContainer([img0, img1]), track);
  ok('carrusel: etiqueta inicial ES', btn.innerHTML.includes('Ver foto original'));
  ok('carrusel: aria-pressed inicial false', btn.attrs['aria-pressed'] === 'false');
  btn.click();
  ok('carrusel slide 0: muestra la limpia', img0.src === '/media/a-cap-clean.jpg');
  ok('carrusel slide 0: el otro slide intacto', img1.src === '/media/b-cap.jpg');
  ok('carrusel: etiqueta cambia a Ver con titular', btn.innerHTML.includes('Ver con titular'));
  ok('carrusel: aria-pressed true + clase on', btn.attrs['aria-pressed'] === 'true' && btn.classList.has('on'));
  btn.click();
  ok('carrusel: segundo toque vuelve a la compuesta', img0.src === '/media/a-cap.jpg');
  ok('carrusel: etiqueta vuelve a Ver foto original', btn.innerHTML.includes('Ver foto original'));
  btn.click();
  track.scrollTo(300);
  ok('carrusel: al cambiar de slide vuelve a compuesta', img0.src === '/media/a-cap.jpg');
  ok('carrusel: al cambiar de slide el toggle se apaga', btn.innerHTML.includes('Ver foto original') && btn.attrs['aria-pressed'] === 'false');
  track.scrollTo(300);
  btn.click();
  ok('carrusel slide 1: actúa sobre el slide mostrado', img1.src === '/media/b-cap-clean.jpg' && img0.src === '/media/a-cap.jpg');
}

/* ---------- hfCleanWire: error de la limpia + single + EN ---------- */
if (hfCleanWire) {
  const img = mkImg('/media/x-cap.jpg');
  const btn = mkBtn();
  hfCleanWire(btn, false, mkContainer([img]), null);
  btn.click();
  ok('single: muestra la limpia', img.src === '/media/x-cap-clean.jpg');
  img.fire('error');
  ok('error: vuelve a la compuesta', img.src === '/media/x-cap.jpg');
  ok('error: el interruptor se esconde para esa pieza', btn.hidden === true);

  const imgE = mkImg('/media/y-cap.jpg');
  const btnE = mkBtn();
  hfCleanWire(btnE, true, mkContainer([imgE]), null);
  ok('EN: etiqueta inicial', btnE.innerHTML.includes('See original photo'));
  btnE.click();
  ok('EN: etiqueta activa', btnE.innerHTML.includes('See with headline') && imgE.src === '/media/y-cap-clean.jpg');
}

/* ---------- Estructura: ítem 1 — Aceptar fijo, un solo botón ---------- */
ok('aceptar: UN solo botón renderizado en el detalle',
  count(app, 'class="hf-d-accept"') === 1);
ok('aceptar: gate intacto (solo borrador, no visitante)',
  app.includes("const accept = (!o.visitor && p.status === 'draft')"));
ok('aceptar: cableado data-revaccept intacto en hfDetailWire',
  app.includes("const acc = q('[data-revaccept]')"));
ok('aceptar: hfDetailOpen marca la tarjeta solo para borrador',
  app.includes("const hfDHasAccept = !HF_VISITOR && String(post.status || '') === 'draft'"));
ok('aceptar: CSS fijo abajo con safe-area y ancho acotado',
  css.includes('.hf-d-accept{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom, 0px));width:min(536px, calc(100% - 24px))'));
ok('aceptar: CSS conserva píldora azul + sombra',
  css.includes('background:#2793C8;color:#fff;border:0;border-radius:999px;padding:13px;font-size:15px;font-weight:800') &&
  css.includes('box-shadow:0 8px 24px rgba(10,30,51,.28)'));
ok('aceptar: despeje inferior 96px en la tarjeta',
  css.includes('.hf-d-has-accept{padding-bottom:96px}'));
ok('aceptar: sin duplicado dentro de hfDetailHTML (un solo Aceptar)',
  (() => { const fn = extractFn(app, 'function hfDetailHTML(p, opts) {'); return !!fn && count(fn, 'data-revaccept=') === 1; })());

/* ---------- Estructura: ítem 2 — foto limpia ---------- */
ok('limpia: gate del detalle (no video, con slides, caption_on=1)',
  app.includes("const cleanTog = (!isV && slides.length && Number(p.caption_on) === 1)"));
ok('limpia: junto al interruptor de recorte en la media',
  app.includes('${cropTog}${cleanTog}'));
ok('limpia: interruptor de recorte intacto byte a byte (v529)',
  app.includes(`const cropTog = slides.length ? \`<button type="button" class="hf-crop-tog" data-hf-crop aria-pressed="false">\${pzIc('grid', 16)} \${en ? 'See how it crops' : 'Ver cómo se recorta'}</button>\` : '';`));
ok('limpia: handler delegado de recorte intacto (no interfiere)',
  app.includes("closest('[data-hf-crop]')"));
ok('limpia: cableada en hfDetailWire junto a recorte',
  app.includes("const cleanBtn = q('[data-hfd-clean]')") &&
  app.includes('hfCleanWire(cleanBtn, hfIsEn(), q(\'.hf-d-media\'), track)'));
ok('limpia: apv con el mismo gate caption_on=1 (no video)',
  app.includes("const apvCleanTog = (!isVideo && Number(p.caption_on) === 1)"));
ok('limpia: apv cableada en bindApprovalPost',
  app.includes("const apvCleanBtn = document.querySelector('[data-apv-clean]')"));
ok('limpia: etiquetas ES/EN en ambos renders',
  app.includes("'See original photo' : 'Ver foto original'") ||
  (app.includes('See original photo') && app.includes('Ver foto original')));

/* ---------- Estructura: ítem 3 — porqué real o nada ---------- */
ok('porqué: gate del detalle (trim, solo si hay dato)',
  app.includes("const whyTxt = String(p.strategy_why || '').trim();"));
ok('porqué: sin dato no se dibuja (rama falsa = cadena vacía)',
  app.includes("const whyLine = whyTxt ? `<div class=\"hf-d-why\">${pzIc('sparkle', 13)} ${esc(whyTxt)}</div>` : '';"));
ok('porqué: va tras el caption y antes de comentarios (lectura natural)',
  (() => { const fn = extractFn(app, 'function hfDetailHTML(p, opts) {'); if (!fn) return false; const i = fn.indexOf('${capHTML}'); const j = fn.indexOf('${whyLine}'); const k = fn.indexOf('${commentsLine}'); return i > 0 && j > i && k > j; })());
ok('porqué: apv con el mismo gate y tras el caption',
  app.includes("const apvWhyTxt = String(p.strategy_why || '').trim();") &&
  app.includes('${apvWhyLine}'));
ok('porqué: estilo muted sin tapar la foto (debajo del caption)',
  css.includes('.hf-d-why{font-size:13px;line-height:1.45;color:#737373;padding:6px 12px 0}') &&
  css.includes('.apv-why{font-size:14px;line-height:1.5;color:#737373;margin:0 0 10px}'));
ok('porqué: apv sin dato no dibuja (rama falsa = cadena vacía)',
  app.includes("const apvWhyLine = apvWhyTxt ? `<div class=\"apv-why\">${pzIc('sparkle', 13)} ${esc(apvWhyTxt)}</div>` : '';"));

/* ---------- No tocado fuera del detalle ---------- */
ok('intacto: chapita del tile (día recorta, hora nunca)',
  app.includes('function hfTileChipParts(txt, en)'));
ok('intacto: portada del reel solo en reels',
  app.includes("const coverRow = (isV && !o.visitor && p.status !== 'published')"));
ok('intacto: título del detalle y botón atrás en hfDetailOpen',
  app.includes('hfDetailTitleText(post, hfDetailOpts(post))') && app.includes('data-hfd-close'));
ok('intacto: resto de acciones del detalle (guardar, menú, rehacer)',
  app.includes('data-hfd-act="save"') && app.includes('data-hfd-act="menu"') &&
  app.includes('data-hfd-act="redo"'));
ok('intacto: server.js sin tocar (caption_on/strategy_why ya viajan)',
  fs.existsSync(path.join(__dirname, 'server.js')));

console.log(`lotedetalle3: ${pass} pass, ${fail} fail`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
