// test-lote-video-website-chico.js — LOTE VIDEO-WEBSITE-CHICO (11/11 · orden Valentino
// «el video de posty en el website, sea mas chiquito, para que se lea el titulo
// sin tener que deslizar para abajo»):
// Achicar el video de Posty en el hero de la home pública para que el título
// (la frase del problema + solución) se lea SIN deslizar. Solo cambia el
// tamaño del video en public/styles.css (2 reglas + 1 media query de escritorio).
// No cambia el texto del título, ni el video en sí, ni el resto de la home.
// La verificación de pliegue (h1 arriba del fold en 390 y 1280) la hace
// render/render.py (Playwright, antes/después) y deja render/measurements.json;
// esta suite afirma los valores CSS y afirma el pliegue desde esas medidas.
// Uso: node test-lote-video-website-chico.js (desde el scratch; corre contra
// release/ si existe, si no contra work/). Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');

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

// A. El video es más chico (móvil/base).
t('A1: .hero-video width min(170px,44vw)',
  CSS.includes('.hero-video{display:block;width:min(170px,44vw);aspect-ratio:1/1;'));
t('A2: .pz-mg--heroV width min(170px,44vw)',
  CSS.includes('.pz-mg--heroV{display:block;width:min(170px,44vw);margin:0 auto 22px}'));
t('A3: no queda width:min(300px,76vw) en las reglas del hero',
  !CSS.includes('.hero-video{display:block;width:min(300px,76vw)') &&
  !CSS.includes('.pz-mg--heroV{display:block;width:min(300px,76vw)'));
t('A4: el video sigue siendo cuadrado (aspect-ratio 1/1) y con el mismo marco',
  CSS.includes('aspect-ratio:1/1;object-fit:cover;margin:0 auto 22px;border-radius:30px;border:5px solid #fff;'));

// B. En escritorio el video es más chico todavía (el h1 a 67px ocupa ~352px).
t('B1: media query desktop (min-width:761px) con width:100px',
  CSS.includes('@media(min-width:761px){.hero-video{width:100px}.pz-mg--heroV{width:100px}}'));
t('B2: el comentario de trazabilidad está presente',
  CSS.includes('(video-website-chico)'));

// C. No se tocó nada más del hero: título y video intactos.
t('C1: h1 ES intacto en app.js (frase problema + solución)',
  APPJS.includes('«Mi feed queda a medias y no me trae clientes», <span class="hl">Posty postea por vos todos los días con tu producto real.</span>'));
t('C2: h1 ES intacto en index.html (shell)',
  INDEX.includes('«Mi feed queda a medias y no me trae clientes», <span class="hl">Posty postea por vos todos los días con tu producto real.</span>'));
t('C3: h1 EN intacto en en/index.html',
  ENINDEX.includes('My feed is half-done and brings me no customers'));
t('C4: video src intacto (mismo video, solo más chico)',
  APPJS.includes('src="/videos/posty-presentacion.mp4"') &&
  ENINDEX.includes('src="/videos/posty-presentacion.mp4"'));
t('C5: la pill y el resto del hero no se tocan (pill presente)',
  APPJS.includes('Tu community manager'));

// D. El título queda arriba del pliegue (medidas reales de render/render.py).
const MEAS_PATH = path.join(ROOT, 'render', 'measurements.json');
t('D0: existe render/measurements.json (correr render/render.py primero)',
  fs.existsSync(MEAS_PATH));
if (fs.existsSync(MEAS_PATH)) {
  const rows = JSON.parse(fs.readFileSync(MEAS_PATH, 'utf8'));
  const after = rows.filter(r => r.tag === 'DESPUES');
  const before = rows.filter(r => r.tag === 'ANTES-v894');
  t('D1: DESPUES tiene 4 medidas (ES/EN x 390/1280)',
    after.length === 4, 'n=' + after.length);
  t('D2: DESPUES h1.bottom <= viewport en los 4 casos (fold)',
    after.length === 4 && after.every(r => r.h1Bottom <= r.viewportH),
    JSON.stringify(after.map(r => [r.lang, r.w, r.h1Bottom, r.viewportH])));
  const mob = after.filter(r => r.w === 390);
  t('D3: DESPUES móvil h1.bottom <= 660 (Safari real con barra)',
    mob.length === 2 && mob.every(r => r.h1Bottom <= 660),
    JSON.stringify(mob.map(r => [r.lang, r.h1Bottom])));
  t('D4: DESPUES el video es más chico que ANTES en los 4 casos',
    after.length === 4 && before.length === 4 &&
    after.every(a => {
      const b = before.find(x => x.lang === a.lang && x.w === a.w);
      return b && a.videoH < b.videoH && a.videoW < b.videoW;
    }),
    JSON.stringify(after.map(r => [r.lang, r.w, r.videoW + 'x' + r.videoH])));
  t('D5: ANTES reproduce el problema (móvil safari660 NO y escritorio fold NO)',
    before.length === 4 &&
    before.filter(r => r.w === 390).every(r => r.h1Bottom > 660) &&
    before.filter(r => r.w === 1280).every(r => r.h1Bottom > r.viewportH));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
