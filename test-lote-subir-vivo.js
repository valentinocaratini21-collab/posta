#!/usr/bin/env node
/* Suite SUBIR-VIVO — el viaje de tu foto + la prueba (mock final aprobado 18/11).
   Uso: node test-lote-subir-vivo.js [raiz]  (raiz contiene public/...; default: este árbol) */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = process.argv[2] || __dirname;
const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const en = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
let ok = 0, mal = 0;
function chk(name, cond) { if (cond) { ok++; } else { mal++; console.log('  MAL:', name); } }
function cnt(s, sub) { return s.split(sub).length - 1; }
function section(s, lang) {
  if (lang === 'es') {
    const i = s.indexOf('function lpSubirHTML()'); if (i < 0) return '';
    const j = s.indexOf('function lpVozHTML()', i);
    return j > i ? s.slice(i, j) : '';
  }
  const i = s.indexOf('id="subir"'); if (i < 0) return '';
  const rest = s.slice(i);
  const end = rest.indexOf('id="ejemplos"');
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 200000);
}
const secES = section(app, 'es'), secEN = section(en, 'en');

/* ---- ES: escena nueva ---- */
chk('ES lpSubirHTML existe', app.includes('function lpSubirHTML()'));
chk('ES switcher x1', cnt(secES, 'sb-switcher') >= 1 && cnt(secES, 'data-sb-lane-btn') === 3);
chk('ES 3 carriles (foto/video/idea)', ['foto', 'video', 'idea'].every(k => secES.includes(`data-sb-lane-panel="${k}"`)));
chk('ES semana llena: gt 1,2,3,4,5,7 + estrella 6', [1, 2, 3, 4, 5, 6, 7].every(n => secES.includes(`gt-miogelato-${n}.jpg`)));
chk('ES semana video: gt-8 y gt-9', secES.includes('gt-miogelato-8.jpg') && secES.includes('gt-miogelato-9.jpg'));
chk('ES vwipe x1', cnt(secES, 'sb-vwipe') === 1);
chk('ES clip real tratado x1', cnt(secES, 'lp-subir-disenado.mp4') === 1);
chk('ES video crudo fuera (el lado crudo es el poster quieto)', cnt(secES, 'lp-subir-crudo.mp4') === 0 && secES.includes('lp-subir-poster-crudo.jpg'));
chk('ES un solo subtitulo: sin overlay HTML de subtitulos', !secES.includes('sb-subtitle') && cnt(secES, 'walk in filthy') === 1);
chk('ES tag ASI COMO LLEGO sin obstruir (en la capa before)', secES.includes('sb-wipe-tag sb-vtag sb-t-before') && cnt(secES, 'ASÍ COMO LLEGÓ') === 1);
chk('ES chip de continuidad cine', secES.includes('La misma pieza · Filthy Rich'));
chk('ES play del cine es detalle visual (span aria-hidden, sin boton)', secES.includes('<span class="sb-film-play sb-glass" aria-hidden="true">'));
chk('ES 48h placeholder honesto', secES.includes('cifras reales por cargar — todavía sin medir')
  && /data-sb-result="views">—</.test(secES) && /data-sb-result="likes">—</.test(secES));
chk('ES RESULTADO_48H en null (sin numeros inventados)', app.includes('var RESULTADO_48H = { views: null, likes: null };'));
chk('ES chip de velocidad sin hora inventada', secES.includes('lo mandó a la mañana') && secES.includes('sali\u00f3 <b>19:00</b>, ese mismo día'.replace('sali\u00f3', 'salió')));
chk('ES CTA a la puerta real', secES.includes('<a class="sb-cta" href="/prueba">'));
chk('ES estado sin JS = final (sin sb-pop-hidden en el markup)', cnt(secES, 'sb-pop-hidden') === 0);
chk('ES likes finales en el markup', secES.includes('data-sb-likes="214"') && secES.includes('>214<'));
chk('ES init acotado a #subir', cnt(app, "var sbSec = q('#subir');") === 1);
chk('ES CSS sb presente', app.includes('.sb-vwipe{') && app.includes('.sb-switcher{') && app.includes('@keyframes sb-shake'));
/* ---- ES: escena vieja fuera ---- */
chk('ES wd-j* = 0 en todo app.js', cnt(app, 'wd-j') === 0);
chk('ES mk-duo/mkVid = 0', cnt(app, 'mk-duo') === 0 && cnt(app, 'mkVid') === 0);
chk('ES puertas wd-door fuera de la seccion', cnt(secES, 'wd-door') === 0);
chk('ES chip compartido conserva .ms-feed', app.includes('.ms-feed .wd-posted{'));
/* ---- EN: espejo ---- */
chk('EN switcher + 3 carriles', cnt(secEN, 'data-sb-lane-btn') === 3 && ['foto', 'video', 'idea'].every(k => secEN.includes(`data-sb-lane-panel="${k}"`)));
chk('EN vwipe x1 + clip real', cnt(secEN, 'sb-vwipe') === 1 && cnt(secEN, '/lp-subir-disenado.mp4') === 1);
chk('EN rutas raiz-relativas (sin src relativos en la seccion)',
  !/src="(gt-|lp-|ai-avatar)/.test(secEN) && secEN.includes('src="/gt-miogelato-6.jpg"') && secEN.includes('poster="/lp-subir-poster-disenado.jpg"'));
chk('EN 48h placeholder honesto', secEN.includes('In its first 48 hours') && secEN.includes('real numbers to load — not measured yet')
  && /data-sb-result="views">—</.test(secEN));
chk('EN tags y continuidad', secEN.includes('AS IT ARRIVED') && secEN.includes('The same piece · Filthy Rich'));
chk('EN CTA a /en/prueba', secEN.includes('<a class="sb-cta" href="/en/prueba">'));
chk('EN init acotado', cnt(en, "var sbSec = q('#subir');") === 1 && en.includes('var RESULTADO_48H = { views: null, likes: null };'));
chk('EN wd-j* = 0 en todo el archivo', cnt(en, 'wd-j') === 0 && cnt(en, 'mkVid') === 0);
/* ---- sellos ---- */
chk('index ES app.js?v=798', cnt(idx, 'app.js?v=798') === 1);
chk('styles sin cambio (20261299 en ambos)', idx.includes('styles.css?v=20261299') && en.includes('styles.css?v=20261299'));
/* ---- sintaxis ---- */
try { cp.execSync(`node --check ${JSON.stringify(path.join(ROOT, 'public/app.js'))}`); chk('node --check app.js', true); }
catch (e) { chk('node --check app.js', false); }

console.log(`SUBIR-VIVO: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
