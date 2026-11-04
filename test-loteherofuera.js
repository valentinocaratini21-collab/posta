// HERO-FUERA — test del lote. Sin navegador: verifica cableado por grep
// sobre el código real. Decisión Valentino 4/11 ~10:18: el héroe
// «El posteo de hoy» NO EXISTE MÁS en Inicio.
// Uso: node work/test-loteherofuera.js  (exit 0 = verde)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PUB = path.join(__dirname, 'public');
const app = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idxES = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(PUB, 'en', 'index.html'), 'utf8');
let ok = 0, bad = 0;
function t(name, cond, extra) {
  if (cond) { ok++; console.log('OK  ' + name); }
  else { bad++; console.log('FALLO ' + name + (extra ? ' :: ' + extra : '')); }
}
function count(s, re) { const m = s.match(re); return m ? m.length : 0; }
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);

// ---------- 1. Héroe: ningún resto en app.js ----------
t('sin pzDiaHeroHTML', !/pzDiaHeroHTML/.test(app));
t('sin pzDiaHeroHTML2', !/pzDiaHeroHTML2/.test(app));
t('sin pzDiaPostHoy', !/pzDiaPostHoy/.test(app));
t('sin pzDiaAprobado', !/pzDiaAprobado/.test(app));
t('sin pzDiaDismissKey/DismissHoy', !/pzDiaDismiss/.test(app));
t('sin pzDiaHero (id/clase)', !/pzDiaHero/.test(app));
t('sin data-pz-dia-* (x/accept/cambiar)', !/data-pz-dia-/.test(app));
t('sin "El posteo de hoy" ni "Today\'s post" en app.js', !/El posteo de hoy/.test(app) && !/Today's post/.test(app));

// ---------- 2. Héroe: ningún resto en styles.css salvo futura ----------
t('sin #pzDiaHero en CSS', !/#pzDiaHero/.test(css));
t('sin .pz-dia-foto/.pz-dia-x/.pz-dia-titulo/.pz-dia-chip/.pz-dia-estado/.pz-dia-acciones/.pz-dia-magia',
  !/\.pz-dia-(foto|sinimg|x|titulo|chip|estado|acciones|magia)/.test(css));
t('sin keyframes pzDiaSpark', !/pzDiaSpark/.test(css));
t('pz-dia en CSS = solo la regla futura x1', count(css, /pz-dia/g) === 1 && /#inicioView \.hf-cell\.pz-dia-futura \{ display: none; \}/.test(css));

// ---------- 3. Conservado a propósito: futura (no es el héroe) ----------
t('pzDiaHoyKey/pzDiaClavePost/pzDiaEsFutura definidos', /function pzDiaHoyKey/.test(app) && /function pzDiaClavePost/.test(app) && /function pzDiaEsFutura/.test(app));
t('homeTileHTML sigue marcando pz-dia-futura', /pzDiaEsFutura\(p, hoyDia, lunDia\)/.test(app));

// ---------- 4. Resto de Inicio intacto ----------
t('inicioView: encabezado + acciones + tabs + semana + grilla, sin hueco del héroe',
  /homeHeadHTML\(prof/.test(app) && /hfProfileActionsHTML\(enHome, pzAcceptWeekHTML\)/.test(app) &&
  /hfTabsHTML\(HF_TAB, enHome\)/.test(app) && /\$\{pzSemanaOkHTML\}/.test(app) && /\$\{gridHTML\}/.test(app) &&
  !/\$\{pzDiaHeroHTML2\}/.test(app));
t('chatbar + bottomstack intactos', /mzChatBar/.test(app) && /mzBottomStack/.test(app));
t('handler Aceptar todo intacto', /hfAcceptAll/.test(app) && /doAcceptAll\(ha\)/.test(app));
t('corazón de tile intacto (aprobación del posteo de hoy sigue en grilla)', /hfTileApprove/.test(app));
t('bloque HEADER-IZQ v618 intacto en CSS', /LOTE HEADER-IZQ/.test(css));
t('dock v615 intacto', /\.bb-bar \.bb-tab\{flex:1;min-width:0\}/.test(css));

// ---------- 5. Capas protegidas intactas ----------
t('zoom: .hf-tile manipulation x1', count(css, /\.hf-tile\{touch-action:manipulation\}/g) === 1);
t('zoom: belt manipulation intacto', /#inicioView,\.bb-bar,\.mz-tabs,\.mz-bottomstack\{touch-action:manipulation\}/.test(css));
t('zoom: meta viewport en ambos index', /maximum-scale=1, user-scalable=no/.test(idxES) && /maximum-scale=1, user-scalable=no/.test(idxEN));
t('zoom: pzZoomBlockInit/pzZoomTapExcluded intactos', /pzZoomBlockInit/.test(app) && /pzZoomTapExcluded/.test(app));
t('CHUNK_V intacto v612 (ningún chunk cambia)', /CHUNK_V = '20261101-v612'/.test(app));
t('sin data/ en el árbol de trabajo', !fs.existsSync(path.join(__dirname, 'data')));

// ---------- 6. Push matutina NO tocada (notificación, no héroe) ----------
t('server.js: referencia push matutina 9:00 intacta', /Tu posteo de hoy ya está/.test(srv));
t('server.js: BUILD v619', /const BUILD_ID = '20261101-v619'/.test(srv));

// ---------- 7. ?v= solo de lo que cambia ----------
t('app.js?v=418 en index ES', /app\.js\?v=418/.test(idxES));
t('styles?v=20261129 en ambos index', /styles\.css\?v=20261129/.test(idxES) && /styles\.css\?v=20261129/.test(idxEN));
t('index EN no carga app.js', !/app\.js\?v=/.test(idxEN));

console.log('\n' + ok + ' OK, ' + bad + ' FALLOS');
process.exit(bad ? 1 : 0);
