// test-lote-boton-ver-posteo.js — LOTE BOTON-VER-POSTEO v902 (11/11 · orden Valentino
// RE-PINEO DEL RE-ESTAMPADOR (base v900 -> v901): C4 md5 app.js 194777fc -> 85fde03f;
// D2 app.js?v=615 -> 614 (app.js no se toca en v902, ?v= queda en 614); D1 + v901 x0;
// D3 nombre base v900 -> v901. Resto byte-idéntico a la suite del preparador.
// «el botón "Ver el posteo completo" tiene que verse más claramente clickeable.
// Hoy no se nota lo suficiente que es un botón que se puede tocar. Que tenga más
// pinta de botón, más obvio al primer vistazo»):
// El botón del héroe del posteo de hoy (pzHoyCardHTML, rama o.hero) era solo texto
// sin fondo ni borde (background:none;border:0;padding:0, color #33566e) y se leía
// como un link, no como un botón. Este lote le da tratamiento de botón primario
// de la app: fondo sólido celeste, texto blanco, ancho completo, pill, sombra,
// flecha → (vía ::after, sin tocar el texto). SOLO cambia public/styles.css
// (1 regla + ::after + :active + comentario). El HTML del botón, el texto ES/EN
// y el handler (data-pz-hoy-detalle) quedan byte-idénticos; app.js no se toca.
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

// A. El botón tiene tratamiento de botón primario (CSS).
const RULE = ".pz-hoy-hero-link{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;text-align:center;color:#fff;font-weight:800;font-size:16px;margin:0 0 13px;background:var(--cel);border:0;border-radius:999px;padding:13px 18px;cursor:pointer;font-family:inherit;box-shadow:0 6px 16px rgba(39,147,200,.42),inset 0 1px 0 rgba(255,255,255,.55)}";
t('A1: .pz-hoy-hero-link es un botón sólido (fondo celeste, texto blanco, ancho completo, pill)',
  CSS.includes(RULE));
t('A2: fondo var(--cel) = #2793C8 (el celeste Posty, mismo que .btn-primary)',
  CSS.includes(RULE) && CSS.includes('--cel:#2793C8'));
t('A3: flecha → vía ::after (affordance, sin tocar el texto del botón)',
  CSS.includes(".pz-hoy-hero-link::after{content:'→'}"));
t('A4: estado :active de presión presente',
  CSS.includes(".pz-hoy-hero-link:active{transform:translateY(1px);box-shadow:0 3px 8px rgba(39,147,200,.42),inset 0 1px 0 rgba(255,255,255,.55)}"));
t('A5: la regla vieja (solo texto: background:none;border:0;padding:0, color #33566e) ya no existe',
  !CSS.includes('.pz-hoy-hero-link{display:block;text-align:left;color:#33566e'));
t('A6: comentario de trazabilidad presente',
  CSS.includes('(BOTON-VER-POSTEO'));

// B. El HTML del botón, el texto y el handler quedan idénticos.
const BTN = `<button type="button" class="pz-hoy-hero-link" data-pz-hoy-detalle="\${esc(String(p.id))}">\${en ? 'See the full post' : 'Ver el posteo completo'}</button>`;
t('B1: el botón del héroe es byte-idéntico a la base (misma etiqueta, clase, handler, texto ES/EN)',
  APPJS.includes(BTN));
t('B2: «Ver el posteo completo» ×1 en la rama héroe + «See the full post» ×1 (mismo botón)',
  (APPJS.match(/Ver el posteo completo/g) || []).length === 4 &&
  APPJS.includes("en ? 'See the full post' : 'Ver el posteo completo'"));
t('B3: las otras 3 ocurrencias no se tocan (aria-label week-strip + hint lp-day-cap + comentario)',
  APPJS.includes('aria-label="Ver el posteo completo"') &&
  APPJS.includes('<div class="lp-day-cap">💬 Ver el posteo completo</div>') &&
  APPJS.includes('«Ver el posteo completo» y'));
t('B4: el botón sigue siendo <button type="button"> con data-pz-hoy-detalle (mismo handler)',
  APPJS.includes('class="pz-hoy-hero-link" data-pz-hoy-detalle='));

// C. El resto del héroe queda intacto.
t('C1: el resto de reglas .pz-hoy-hero intactas (media, img, reel, play, caption, ok, actions)',
  CSS.includes('.pz-hoy-hero{padding:14px;border-radius:24px}') &&
  CSS.includes('.pz-hoy-hero-media{position:relative;border-radius:16px;overflow:hidden;box-shadow:0 10px 22px rgba(10,30,51,.16);cursor:pointer;background:#0A1E33}') &&
  CSS.includes('.pz-hoy-hero-img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}') &&
  CSS.includes('.pz-hoy-hero-caption{font-size:16.5px;line-height:1.45;margin:13px 2px 8px;font-weight:600;color:var(--txt)}') &&
  CSS.includes('.pz-hoy-hero .pz-hoy-ok{background:linear-gradient(180deg,#e6f8ee,#d9f2e4);color:#177245;') &&
  CSS.includes('.pz-hoy-hero .pz-hoy-actions{margin-top:13px}'));
t('C2: la rama o.hero sigue presente (solo la usa pzHoyHoyHTML)',
  APPJS.includes('if (o && o.hero) {') &&
  APPJS.includes('pzHoyCardHTML(p, { cartita: false, sinCuando: true, en, tz, prop: (o && o.prop) || null, hero: true })'));
t('C3: la tarjeta compacta no se toca (meta «Tocá la foto para ver el detalle →» intacta)',
  APPJS.includes("en ? 'Tap the photo to see the detail →' : 'Tocá la foto para ver el detalle →'"));
t('C4: app.js byte-idéntico a la base v901 (el lote no toca JS)',
  md5(APPJS) === '85fde03f82c3ea4b8e9552ad7d5a0dc9');

// D. Estampado.
t('D1: BUILD v902 ×1 en server.js, v899 ×0',
  (SERVER.match(/20261105-v902/g) || []).length === 1 &&
  !SERVER.includes('20261105-v899') &&
  !SERVER.includes('20261105-v901'));
t('D2: app.js?v=614 ×1 en index ES (app.js no se toca, ?v= queda en 614), styles.css?v=20261240 ×1 ES + ×1 EN, EN sin app.js?v=',
  INDEX.includes('app.js?v=614') && (INDEX.match(/app\.js\?v=/g) || []).length === 1 &&
  INDEX.includes('styles.css?v=20261240') && ENINDEX.includes('styles.css?v=20261240') &&
  !ENINDEX.includes('app.js?v='));
const nlines = (s) => s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
t('D3: styles.css tiene 6221 líneas (6218 base v901 + 3: comentario + ::after + :active)',
  nlines(CSS) === 6221);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
