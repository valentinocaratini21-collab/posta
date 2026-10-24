'use strict';
/* v384 — FRANJA VIVA «El feed se arma solo» (#feed): escena mandada por el
   scroll en la home ES (app.js) + EN (en/index.html), patrón de familia del
   jardín de Growty. Invariantes de la orden:
   - La sección existe en ambas homes con su ancla #feed y sus 3 capítulos.
   - Las 9 tarjetas usan imágenes de posteos REALES ya servidos por la home.
   - El único Posty de la franja es el derivado canónico servido
     (posty-disenando-hero.jpg) — ninguna otra representación del avatar.
   - ESTADO POR DEFECTO = ESCENA COMPLETA: ninguna regla CSS de la franja
     esconde ni desplaza las tarjetas; el JS no escribe nada sin scroll y
     ambos motores cortan con prefers-reduced-motion.
   - Solo transform/opacity en los motores (ninguna otra propiedad animada).
   - Regla de vidriera: la franja no nombra a ningún otro agente. */
const fs = require('fs');
const path = require('path');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const appJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const enHtml = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const idxHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');

const CARDS = ['ig-cafe.jpg', 'ig-barber.jpg', 'ig-moda.jpg', 'ig-fitness.jpg', 'ig-belleza.jpg', 'ig-gastro.jpg', 'ig-mascotas.jpg', 'g-latte.jpg', 'g-tazas.jpg'];

function feedSection(src) {
  const a = src.indexOf('lp-feed-sec');
  if (a < 0) return '';
  const b = src.indexOf('Un video premium', a);
  const bEn = src.indexOf('One premium video', a);
  const end = Math.max(b, bEn);
  return src.slice(a, end > a ? end : a + 6000);
}

for (const [label, src] of [['ES', appJs], ['EN', enHtml]]) {
  const sec = feedSection(src);
  ok(sec.length > 500, label + ': sección #feed presente');
  ok(sec.includes('lp-feed-sec') && sec.includes('lpFeedScene') && sec.includes('lpFeedGrid') && sec.includes('lpFeedLine'), label + ': escena completa (scene/grid/line)');
  ok((sec.match(/class="lp-feed-card"/g) || []).length === 9, label + ': exactamente 9 tarjetas');
  for (const img of CARDS) ok(sec.includes(img), label + ': tarjeta real ' + img);
  ok(sec.includes('posty-disenando-hero.jpg'), label + ': Posty = derivado canónico posty-disenando-hero.jpg');
  ok(sec.includes('id="lpFeedPosty"'), label + ': Posty preside con id lpFeedPosty');
  ok(!/ai-avatar|posty-con-placa|lp-pieza/.test(sec), label + ': ningún otro asset del avatar en la franja');
  ok((sec.match(/loading="lazy"/g) || []).length >= 10, label + ': imágenes con carga diferida (lazy)');
  // Regla de vidriera: ningún otro agente nombrado ni insinuado.
  ok(!/\b(Gesty|Venty|Growty|Desy|Atenty|Talenty|Bossty|Bambooty)\b/.test(sec), label + ': vidriera — ningún otro agente en la franja');
}

ok(appJs.includes('<h2>El feed se arma solo</h2>'), 'ES: título «El feed se arma solo»');
ok(appJs.includes('✍️ Pienso') && appJs.includes('🎨 Diseño') && appJs.includes('📮 Publico'), 'ES: capítulos Pienso · Diseño · Publico');
ok(appJs.includes('Primero pienso las ideas de tu semana.') && appJs.includes('Después las diseño con tus fotos y tus colores.') && appJs.includes('Y tu feed queda perfecto, publicándose solo.'), 'ES: línea por capítulo en el motor');
ok(enHtml.includes('<h2>Your feed builds itself</h2>'), 'EN: título espejo «Your feed builds itself»');
ok(enHtml.includes('✍️ I think') && enHtml.includes('🎨 I design') && enHtml.includes('📮 I publish'), 'EN: capítulos I think · I design · I publish');
ok(enHtml.includes('First I come up with the ideas for your week.'), 'EN: línea del capítulo 1 en el motor');

/* Motores: ES en app.js (funciones nombradas) y EN en IIFE propio. */
ok(appJs.includes('function lpFeedInit()') && appJs.includes('function lpFeedAsk()') && appJs.includes('function lpFeedStep()'), 'ES: motor lpFeedInit/lpFeedAsk/lpFeedStep definido');
ok(appJs.includes('lpFeedInit(); // 🌈 v381'), 'ES: lpFeedInit cableado en lpInitHero');
ok(appJs.includes('(prefers-reduced-motion: reduce)'), 'ES: guarda prefers-reduced-motion');
ok(enHtml.includes("(prefers-reduced-motion: reduce)"), 'EN: guarda prefers-reduced-motion');
ok(appJs.includes('LP_FEED_SCATTER') && appJs.includes('0.08 + i * 0.045'), 'ES: coreografía por tarjeta (ventanas escalonadas)');
ok(appJs.includes('p < 0.34 ? 0 : (p < 0.70 ? 1 : 2)'), 'ES: umbrales de capítulo 0,34 / 0,70');
ok(enHtml.includes('p<0.34?0:(p<0.70?1:2)'), 'EN: umbrales de capítulo 0,34 / 0,70');
/* Solo transform/opacity: ningún motor de la franja escribe otra propiedad. */
const esMotor = appJs.slice(appJs.indexOf('const LP_FEED_SCATTER'), appJs.indexOf('function cleanIgHandle'));
ok(!/style\.(width|height|top|left|margin|padding|fontSize)/.test(esMotor), 'ES: el motor solo escribe transform/opacity');
ok((esMotor.match(/style\.transform/g) || []).length >= 2 && (esMotor.match(/style\.opacity/g) || []).length >= 2, 'ES: transform+opacity en tarjetas y en Posty');

/* CSS: estado por defecto = escena completa. */
const cssBlock = styles.slice(styles.indexOf('.lp-feed-sec{'));
ok(cssBlock.length > 200, 'CSS: bloque .lp-feed-* presente');
ok(/\.lp-feed-grid\{[^}]*grid-template-columns:repeat\(3,1fr\)/.test(cssBlock), 'CSS: grilla final de 3 columnas (como la de IG)');
ok(/\.lp-feed-card\{[^}]*aspect-ratio:3\/4/.test(cssBlock), 'CSS: tiles 3:4');
const cardRule = (cssBlock.match(/\.lp-feed-card\{[^}]*\}/) || [''])[0];
ok(!/transform|opacity/.test(cardRule), 'CSS: la tarjeta por defecto NO tiene transform ni opacity (escena completa sin JS)');
ok(!/\.lp-feed-(card|posty|grid)\{[^}]*(display\s*:\s*none|visibility\s*:\s*hidden)/.test(cssBlock), 'CSS: nada de la escena nace oculto');
ok(/\.lp-feed-chap\.on\{/.test(cssBlock), 'CSS: capítulo activo con estilo propio');

/* Punteros de la tanda. */
ok(idxHtml.includes('/app.js?v=265') && idxHtml.includes('/styles.css?v=20261024l'), 'index: bumps ?v= app.js 263 + styles.css 20261024k');
ok(enHtml.includes('/styles.css?v=20261024l'), 'EN: bump styles.css 20261024k');

console.log(`test-franja-feed: ${okN} ok / ${failN} FAIL`);
process.exit(failN ? 1 : 0);
