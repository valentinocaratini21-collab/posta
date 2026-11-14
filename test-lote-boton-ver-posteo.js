// test-lote-boton-ver-posteo.js — LOTE BOTON-VER-POSTEO v902 (11/11 · orden Valentino
// «el botón "Ver el posteo completo" tiene que verse más claramente clickeable»).
// RE-PIN DEL PREPARADOR (aterrizaje DETALLE-POSTEO v1021, sobre HEAD vivo v1020):
// la regla de esta suite quedó SUPERSEDIDA dos veces por decisiones aprobadas
// de Valentino del 13/11: (1) el diseño del DETALLE (mock-detalle-v1, «Dale,
// armalo asi») bajó el botón celeste gigante a link tranquilo; (2) el
// ADDENDUM V4 (mock-detalle-v4) sacó también el link: «Ver el posteo completo»
// NO va ni como botón ni como link — tocar la FOTO abre la vista completa (la
// media del héroe lleva data-pz-hoy-detalle) y el lugar bajo las acciones lo
// ocupa la tira de voz. A y B se re-pinean a esa verdad con su causa; C1 pierde
// el override .pz-hoy-hero .pz-hoy-ok (sale con el cartel de dos renglones del
// héroe; el .pz-hoy-ok base queda solo en la compacta); C4 pasa al md5 del
// app.js fusionado v1021; D pasa a BUILD v1021 / app.js?v=699 / styles
// 20261279 / 6426 líneas. El resto (C2, C3) no se toca: sigue valiendo.
// Uso: node test-lote-boton-ver-posteo.js (desde el scratch; corre contra
// release/ si existe, si no contra work/). Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); }
};

const ROOT = __dirname;
const TREE = fs.existsSync(path.join(ROOT, 'release', 'public', 'styles.css'))
  ? path.join(ROOT, 'release')
  : (fs.existsSync(path.join(ROOT, 'work', 'public', 'styles.css')) ? path.join(ROOT, 'work') : ROOT);
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const APPJS = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const ENINDEX = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// A. CSS: la regla del botón/link del héroe ya no existe (ADDENDUM V4).
t('A1: (RE-PIN v1021) no queda NINGUNA regla .pz-hoy-hero-link (ni la sólida celeste de v902 ni la de texto previa)',
  !CSS.includes('.pz-hoy-hero-link{'));
t('A2: (RE-PIN v1021) comentario de trazabilidad presente: declara el supersede (BOTON-VER-POSTEO → DETALLE + ADDENDUM V4)',
  CSS.includes('(BOTON-VER-POSTEO') && CSS.includes('SUPERSEDE') && CSS.includes('ADDENDUM V4'));
t('A3: (RE-PIN v1021) sin ::after ni :active del link (salen con la regla)',
  !CSS.includes('.pz-hoy-hero-link::after') && !CSS.includes('.pz-hoy-hero-link:active'));
t('A4: (RE-PIN v1021) la zona nueva del héroe existe: tarjetas .pz-hoy-acts + píldora .pz-hoy-pill-estado',
  CSS.includes('.pz-hoy-acts{') && CSS.includes('.pz-hoy-pill-estado{'));
t('A5: (RE-PIN v1021) el override .pz-hoy-hero .pz-hoy-ok salió del héroe; el .pz-hoy-ok base queda para la compacta',
  !CSS.includes('.pz-hoy-hero .pz-hoy-ok') && CSS.includes('.pz-hoy-ok{'));

// B. El botón del héroe ya no existe; la FOTO abre la vista completa.
const BTN = `<button type="button" class="pz-hoy-hero-link" data-pz-hoy-detalle="\${esc(String(p.id))}">\${en ? 'See the full post' : 'Ver el posteo completo'}</button>`;
t('B1: (RE-PIN v1021) el botón «Ver el posteo completo» del héroe NO existe (ni botón ni link)',
  !APPJS.includes(BTN) && !APPJS.includes('class="pz-hoy-hero-link"'));
t('B2: (RE-PIN v1021) «Ver el posteo completo» ×4 en app.js, TODAS fuera del héroe (aria-label week-strip + hint lp-day-cap + 2 comentarios)',
  (APPJS.match(/Ver el posteo completo/g) || []).length === 4 &&
  APPJS.includes('aria-label="Ver el posteo completo"') &&
  APPJS.includes('<div class="lp-day-cap">💬 Ver el posteo completo</div>'));
t('B3: (RE-PIN v1021) la media del héroe lleva data-pz-hoy-detalle (tocar la foto abre la vista completa — ADDENDUM V4)',
  APPJS.includes('class="pz-hoy-hero-media" data-pz-hoy-detalle="${esc(String(p.id))}"'));
t('B4: (RE-PIN v1021) el handler sigue vivo: bind querySelectorAll([data-pz-hoy-detalle]) ×1 en pzHoyBind',
  (APPJS.match(/querySelectorAll\('\[data-pz-hoy-detalle\]'\)/g) || []).length === 1);

// C. El resto del héroe queda intacto.
t('C1: el resto de reglas .pz-hoy-hero intactas (media, img, caption, actions)',
  CSS.includes('.pz-hoy-hero{padding:14px;border-radius:24px}') &&
  CSS.includes('.pz-hoy-hero-media{position:relative;border-radius:16px;overflow:hidden;box-shadow:0 10px 22px rgba(10,30,51,.16);cursor:pointer;background:#0A1E33}') &&
  CSS.includes('.pz-hoy-hero-img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}') &&
  CSS.includes('.pz-hoy-hero-caption{font-size:16.5px;line-height:1.45;margin:13px 2px 8px;font-weight:600;color:var(--txt)}') &&
  CSS.includes('.pz-hoy-hero .pz-hoy-actions{margin-top:13px}'));
t('C2: la rama o.hero sigue presente (solo la usa pzHoyHoyHTML)',
  APPJS.includes('if (o && o.hero) {') &&
  APPJS.includes('pzHoyCardHTML(p, { cartita: false, sinCuando: true, en, tz, prop: (o && o.prop) || null, hero: true })'));
t('C3: la tarjeta compacta no se toca (meta «Tocá la foto para ver el detalle →» intacta)',
  APPJS.includes("en ? 'Tap the photo to see the detail →' : 'Tocá la foto para ver el detalle →'"));
t('C4: (RE-PIN v1021) app.js = el fusionado del aterrizaje v1021 (md5 del árbol release)',
  md5(APPJS) === '3d051d96a8411db7ff74985aa719adee', md5(APPJS));

// D. Estampado.
t('D1: (RE-PIN v1021) BUILD v1021 ×1 en server.js, v1020 ×0',
  (SERVER.match(/20261105-v1021/g) || []).length === 1 &&
  !SERVER.includes('20261105-v1020'));
t('D2: (RE-PIN v1021) app.js?v=699 ×1 en index ES, styles.css?v=20261279 ×1 ES + ×1 EN, EN sin app.js?v=',
  INDEX.includes('app.js?v=699') && (INDEX.match(/app\.js\?v=/g) || []).length === 1 &&
  INDEX.includes('styles.css?v=20261279') && ENINDEX.includes('styles.css?v=20261279') &&
  !ENINDEX.includes('app.js?v='));
const nlines = (s) => s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
t('D3: (RE-PIN v1021) styles.css tiene 6426 líneas (6416 base v1020 + 10 del DETALLE fusionado)',
  nlines(CSS) === 6426, nlines(CSS));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
