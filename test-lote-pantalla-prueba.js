/* LOTE PANTALLA-PRUEBA — la sección final de la landing (.lp-final)
   deja de re-enseñar la prueba (decisiones de Valentino 18/11
   22:48–22:57). La prueba se muestra UNA sola vez, en la sección de
   la puerta («El día 2 es un carrusel» + el trío de formatos con la
   semana real de Big Top, enmienda del lote PUERTA-NUEVA); esta
   pantalla es la de CIERRE y quedaba repitiendo la lección con tres
   tarjetas de días. Pines sobre los archivos construidos:
   1. Las tres tarjetas (.wd-trial/.wd-tday) salen enteras de la
      sección ES+EN, con su CSS exclusivo (.wd-trial/.wd-tday/
      .wd-td-n/.wd-td-c/.wd-tchk + reglas de reveal + media query):
      conteo 0 en todo el archivo. El @keyframes wd-pop NO es del
      lote: lo sigue usando el calendario (.wd-cal) y queda intacto.
   2. El título no cambia ni un byte: «Probás 3 días gratis antes de
      pagar.» / «Try 3 days free before you pay.», ×1 en la sección.
   3. Subtítulo del modelo nuevo: ES «Conectá tu Instagram y mirá tu
      semana ya armada. Gratis, sin tarjeta.» / EN «Connect your
      Instagram and see your week already planned. Free, no card.» ×1;
      el viejo («Contanos de tu negocio en el chat…» / «Tell us about
      your business in the chat…») queda en 0.
   4. La CTA plana «Sumate a mi equipo» / «Join my team» pasa a VIDRIO
      (.btn.lp-cta-glass: gradiente celeste translúcido + blur 16px
      saturate 165% + borde de luz, la receta de .av-sale) con la
      etiqueta de la acción: «Empezar mis 3 días gratis» / «Start my 3
      free days». El ancla conserva href (/prueba · /en/prueba) y el
      estilo inline (font-size:16px;padding:18px 44px) byte a byte.
   5. El pie de la sección ya no duplica «3 días gratis / sin
      tarjeta» con el subtítulo: ES «✓ Sin contraseña · ✓ Cancelá
      cuando quieras» / EN «✓ No password needed · ✓ Cancel anytime».
      La hero-note del HERO (la misma frase vieja sin el margin-top)
      es otra superficie y queda intacta: la frase vieja totaliza ×1.
   6. La sección NO tiene bloque de precio (censo: el precio vive en
      #planes, la sección anterior) y el lote no inventa ninguno: la
      rebanada .lp-final no contiene «US$» ni «199».
   7. Vecinos intactos: el avatar (posty-disenando-hero.jpg), la
      llamada ${lpProgresoHTML()} pegada a la sección en ES, la
      sección #progreso pegada en EN, y #planes antes en ES.
   El lote no toca public/index.html ni styles.css: el liberador
   re-fija el stamp app.js?v= por orden de aterrizaje. */
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, 'public');
let ok = 0, mal = 0;
function t(nombre, cond) { if (cond) { ok++; } else { mal++; console.log('  MAL:', nombre); } }
function cuenta(s, x) { return s.split(x).length - 1; }
function rebanada(s, desde, hasta) {
  const a = s.indexOf(desde); const b = s.indexOf(hasta, a);
  return (a < 0 || b < 0) ? '' : s.slice(a, b);
}

const appjs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const en = fs.readFileSync(path.join(PUB, 'en', 'index.html'), 'utf8');

/* ---------- ES ---------- */
const secES = rebanada(appjs, '<div class="lp-final">', '${lpProgresoHTML()}');
t('ES: la sección .lp-final existe y cierra en lpProgresoHTML()', secES.length > 0);
t('ES: título byte-idéntico ×1', cuenta(secES, '<h2>Probás 3 días gratis antes de pagar.</h2>') === 1);
t('ES: subtítulo nuevo ×1 en la sección', cuenta(secES, 'Conectá tu Instagram y mirá tu semana ya armada. Gratis, sin tarjeta.') === 1);
t('ES: subtítulo viejo = 0 en el archivo', cuenta(appjs, 'Contanos de tu negocio en el chat') === 0);
t('ES: tarjetas fuera — wd-trial = 0', cuenta(appjs, 'wd-trial') === 0);
t('ES: tarjetas fuera — wd-tday = 0', cuenta(appjs, 'wd-tday') === 0);
t('ES: tarjetas fuera — wd-tchk = 0', cuenta(appjs, 'wd-tchk') === 0);
t('ES: tarjetas fuera — wd-td-n = 0', cuenta(appjs, 'wd-td-n') === 0);
t('ES: tarjetas fuera — wd-td-c = 0', cuenta(appjs, 'wd-td-c') === 0);
t('ES: «Sumate a mi equipo» = 0', cuenta(appjs, 'Sumate a mi equipo') === 0);
t('ES: CTA nueva exacta ×1', cuenta(appjs, '<a class="btn lp-cta-glass" href="/prueba" style="font-size:16px;padding:18px 44px">Empezar mis 3 días gratis</a>') === 1);
t('ES: CSS de vidrio ×1 con blur', cuenta(appjs, '.btn.lp-cta-glass{') === 1 && appjs.includes('backdrop-filter:blur(16px) saturate(165%)'));
t('ES: pie nuevo ×1', cuenta(secES, '✓ Sin contraseña · ✓ Cancelá cuando quieras') === 1);
t('ES: la frase vieja del pie queda solo en el hero (×1 total)', cuenta(appjs, '✓ Sin tarjeta · ✓ 3 días gratis · ✓ Cancelá cuando quieras') === 1);
t('ES: sin bloque de precio en la sección', !secES.includes('US$') && !secES.includes('199'));
t('ES: avatar intacto', secES.includes('<img class="hero-posty lp-final-ava" src="posty-disenando-hero.jpg"'));
t('ES: #planes sigue antes de la sección', appjs.indexOf('id="planes"') > -1 && appjs.indexOf('id="planes"') < appjs.indexOf('<div class="lp-final">'));
t('ES: @keyframes wd-pop intacto (es del calendario)', cuenta(appjs, '@keyframes wd-pop') === 1);

/* ---------- EN ---------- */
const secEN = rebanada(en, '<div class="lp-final">', '<div class="section" id="progreso">');
t('EN: la sección .lp-final existe y cierra en #progreso', secEN.length > 0);
t('EN: título byte-idéntico ×1', cuenta(secEN, '<h2>Try 3 days free before you pay.</h2>') === 1);
t('EN: subtítulo nuevo ×1 en la sección', cuenta(secEN, 'Connect your Instagram and see your week already planned. Free, no card.') === 1);
t('EN: subtítulo viejo = 0 en el archivo', cuenta(en, 'Tell us about your business in the chat') === 0);
t('EN: tarjetas fuera — wd-trial = 0', cuenta(en, 'wd-trial') === 0);
t('EN: tarjetas fuera — wd-tday = 0', cuenta(en, 'wd-tday') === 0);
t('EN: tarjetas fuera — wd-tchk = 0', cuenta(en, 'wd-tchk') === 0);
t('EN: tarjetas fuera — wd-td-n = 0', cuenta(en, 'wd-td-n') === 0);
t('EN: tarjetas fuera — wd-td-c = 0', cuenta(en, 'wd-td-c') === 0);
t('EN: «Join my team» = 0', cuenta(en, 'Join my team') === 0);
t('EN: CTA nueva exacta ×1', cuenta(en, '<a class="btn lp-cta-glass" href="/en/prueba" style="font-size:16px;padding:18px 44px">Start my 3 free days</a>') === 1);
t('EN: CSS de vidrio ×1', cuenta(en, '.btn.lp-cta-glass{') === 1);
t('EN: pie nuevo ×1', cuenta(secEN, '✓ No password needed · ✓ Cancel anytime') === 1);
t('EN: la frase vieja del pie queda solo en el hero (×1 total)', cuenta(en, '✓ No card required · ✓ 3 days free · ✓ Cancel anytime') === 1);
t('EN: sin bloque de precio en la sección', !secEN.includes('US$') && !secEN.includes('199'));
t('EN: @keyframes wd-pop intacto (es del calendario)', cuenta(en, '@keyframes wd-pop') === 1);

console.log(`PANTALLA-PRUEBA: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
