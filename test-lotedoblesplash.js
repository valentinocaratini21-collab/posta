// LOTE DOBLE-SPLASH — suite nueva.
// Uso: node test-lotedoblesplash.js [root]  (root por defecto: el arbol que contiene este archivo)
// Afirma que el boot web #posty-boot es SOLO los 3 puntitos v549, sin cara,
// sin palabra y sin destellos, y que todo lo demas esta intacto.
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const es = read('public/index.html');
const en = read('public/en/index.html');
const app = read('public/app.js');
const css = read('public/styles.css');
const server = read('server.js');

const bootMatch = es.match(/<div id="posty-boot"[^>]*>[\s\S]*?<\/div>/);
const boot = bootMatch ? bootMatch[0] : '';
const bootStyle = (es.match(/#posty-boot\{[^}]*\}/) || [''])[0];

let ok = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { ok++; }
  else { fail++; console.log('FAIL: ' + name); }
};

// (a) Boot sin cara, sin palabra, sin destellos.
t('boot existe con id posty-boot', !!bootMatch);
t('boot no contiene <img', !/<img/i.test(boot));
t('boot no contiene pb-word', !/pb-word/.test(boot));
t('boot no contiene texto visible "posty."', !/>posty/.test(boot));
t('boot no contiene destellos', !/✦/.test(boot));
t('boot no contiene animacion pb-twinkle', !/pb-twinkle/.test(es.split('<script src="/dislike.js"')[0]));

// (b) Exactamente los 3 puntitos v549 con sus colores.
const dots = boot.match(/class="pz-dot pz-dot-[123]"/g) || [];
t('boot tiene exactamente 3 puntitos', dots.length === 3);
t('puntitos en orden 1, 2, 3', dots.join(',') === 'class="pz-dot pz-dot-1",class="pz-dot pz-dot-2",class="pz-dot pz-dot-3"');
t('styles .pz-dot mide 14px', /\.pz-dot\{width:14px;height:14px/.test(css));
t('styles punto 1 celeste #2793C8', /\.pz-dot-1\{background:#2793C8\}/.test(css));
t('styles punto 2 dorado #FEC14D', /\.pz-dot-2\{background:#FEC14D/.test(css));
t('styles punto 3 navy #0A1E33', /\.pz-dot-3\{background:#0A1E33/.test(css));
t('boot usa el degradado exacto de la app', ['#dff1fa', '#eef9fd', '#fdf9ec', '#fdeec2'].every((c) => bootStyle.includes(c)));
t('boot ya no usa el fondo plano #F4FAFE', !/#F4FAFE/i.test(bootStyle));

// (c) Logica de quitar el boot intacta.
t('respaldo 6s en index intacto', es.includes("setTimeout(function(){var b=document.getElementById('posty-boot');if(b)b.remove();},6000)"));
t('remove de app.js intacto', /getElementById\('posty-boot'\)[\s\S]{0,60}\.remove\(\)/.test(app));

// (d) Resto intacto.
t('EN no tiene #posty-boot (no se toca)', !/posty-boot/.test(en));
t('EN byte-identica a pristino', (() => {
  try { return en === fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', 'public', 'en', 'index.html'), 'utf8'); }
  catch (e) { return false; }
})());
t('app.js byte-identico a pristino', (() => {
  try { return app === fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', 'public', 'app.js'), 'utf8'); }
  catch (e) { return false; }
})());
t('styles.css byte-identico a pristino', (() => {
  try { return css === fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', 'public', 'styles.css'), 'utf8'); }
  catch (e) { return false; }
})());
t('server.js byte-identico a pristino', (() => {
  try { return server === fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', 'server.js'), 'utf8'); }
  catch (e) { return false; }
})());
t('app.js?v=374 intacto en index ES', es.includes('app.js?v=374'));
t('resto de index ES intacto fuera del bloque del boot', (() => {
  try {
    const pri = fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', 'public', 'index.html'), 'utf8');
    const strip = (s) => s
      .replace(/<div id="posty-boot"[^>]*>[\s\S]*?<\/div>\s*<style>[\s\S]*?<\/style>/, '<!--BOOT-->');
    return strip(es) === strip(pri);
  } catch (e) { return false; }
})());

console.log(`lotedoblesplash: ${ok} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
