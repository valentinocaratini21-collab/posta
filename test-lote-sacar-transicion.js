// test-lote-sacar-transicion.js — SACAR EL EFECTO DE TRANSICIÓN ENTRE PANTALLAS.
// Decisión Valentino 6/11: al cambiar de pantalla, la app desliza la vista
// y pasa una estela con destellos — eso se va: el cambio queda instantáneo.
// Retirado: pzPlayEnter() + pzMagicTrail() + PZ_NAV_DIR/PZ_NAV_STACK +
// keyframes pzSlideFwd/pzSlideBack + clases pz-enter-* y pz-trail*.
// Queda intacto: pzReducedMotion() (la usan zoom, carrusel y pull-to-refresh),
// la restauración del scroll (PZ_VIEW_KEY/PZ_PREV_VIEW/PZ_SCROLL_POS),
// pzGoBack, el botón :active y TODA otra animación (ritual, carta, toasts).
// Node puro, lee el árbol. Uso: node test-lote-sacar-transicion.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const chunks = fs.readdirSync(path.join(__dirname, 'public')).filter((f) => f.startsWith('chunk-') && f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(__dirname, 'public', f), 'utf8')).join('\n');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}

// ---------- Cero restos del efecto (app.js + styles.css) ----------
const IDS = ['pzPlayEnter', 'pzMagicTrail', 'PZ_NAV_DIR', 'PZ_NAV_STACK',
  'pz-enter-fwd', 'pz-enter-back', 'pzSlideFwd', 'pzSlideBack', 'pz-trail'];
for (const id of IDS) {
  t(cnt(app, id) === 0, 'app.js: cero «' + id + '»');
  t(cnt(css, id) === 0, 'styles.css: cero «' + id + '»');
  t(cnt(chunks, id) === 0, 'chunks: cero «' + id + '»');
  t(cnt(idx, id) === 0 && cnt(idxEn, id) === 0, 'index ES/EN: cero «' + id + '»');
}
// Ni la clase en el DOM: nada puede agregar pz-enter-* ni crear un .pz-trail
t(!/classList\.(add|remove)\('pz-enter/.test(app), 'nadie agrega/quita clases de entrada');
t(!/createElement\('div'\)[\s\S]{0,200}pz-trail/.test(app), 'nadie crea un div de estela');
t(!app.includes("d.className = 'pz-trail'"), 'sin creación de .pz-trail');

// ---------- Lo que se queda: detección, scroll, atrás, pintura ----------
// pzReducedMotion sigue: 1 definición + 6 usos (zoom ×2, carrusel ×2, pull ×1, raíz ×1)
t(app.includes('function pzReducedMotion'), 'pzReducedMotion sigue definida');
t(cnt(app, 'pzReducedMotion()') === 7, 'pzReducedMotion(): 1 def + 6 usos (zoom, carrusel, pull)');
const rmSrc = extractFn(app, 'pzReducedMotion');
t(rmSrc.length > 40, 'pzReducedMotion extraíble para vm');
{
  const ctx = { console, window: { matchMedia: () => ({ matches: true }) } };
  vm.createContext(ctx);
  vm.runInContext(rmSrc, ctx);
  t(vm.runInContext('pzReducedMotion()', ctx) === true, 'vm: reduced-motion true → true');
  ctx.window.matchMedia = () => ({ matches: false });
  t(vm.runInContext('pzReducedMotion()', ctx) === false, 'vm: reduced-motion false → false');
}
// Restauración del scroll intacta (no es el efecto: es volver a donde estabas)
t(app.includes("let PZ_VIEW_KEY = ''; let PZ_PREV_VIEW = ''; const PZ_SCROLL_POS = {};"), 'PZ_VIEW_KEY/PZ_PREV_VIEW/PZ_SCROLL_POS intactos');
t(app.includes('function pzRestoreScroll'), 'pzRestoreScroll sigue');
t(app.includes('PZ_SCROLL_POS[PZ_VIEW_KEY] = window.scrollY'), 'render sigue guardando la posición del scroll');
t(app.includes('PZ_VIEW_KEY = _k;'), 'render sigue actualizando la vista actual');
// Atrás y pintura intactos
t(app.includes('function pzGoBack'), 'pzGoBack sigue');
t(app.includes('window.history.back()'), 'pzGoBack vuelve con el historial');
t(app.includes('root.innerHTML = appShell(tab, content);'), 'el router sigue pintando la pantalla destino');
t(app.includes('bindApp(tab);'), 'el router sigue enlazando la pantalla destino');
// El botón sigue respondiendo al instante (no era parte del efecto)
t(css.includes(':where(#app) button:active{transform:scale(.97)'), 'botón :active intacto (scale + brillo)');

// ---------- Ninguna otra animación se tocó ----------
// v722 tenía 61 keyframes; salen solo los 2 del efecto. 20 bloques
// reduced-motion; sale solo el del efecto.
t(cnt(css, '@keyframes') === 59, 'keyframes 61 → 59 (salen solo pzSlideFwd/pzSlideBack)');
t(cnt(css, '@media (prefers-reduced-motion: reduce)') === 19, 'bloques reduced-motion 20 → 19');
for (const kf of ['pzRitualIn', 'pzRitualSpark', 'anaMagiaEntradaKF', 'scfPopIn', 'f3Heart', 'pzSproutSway', 'pzPulso', 'pzRitualFade']) {
  t(css.includes('@keyframes ' + kf), 'keyframe «' + kf + '» intacto (ritual/carta/toasts/pull)');
}
// El zoom FLIP desde la tile no es el efecto de pantalla: sigue
t(app.includes('pop.animate') && app.includes('translate('), 'zoom FLIP desde la tile intacto (WAAPI)');

// ---------- Censo intacto ----------
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');

console.log(`\ntest-lote-sacar-transicion: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
