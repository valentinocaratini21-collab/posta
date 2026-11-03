// LOTE INICIO-3 (3/11, decisión Valentino · celular Y computadora):
// 1) el + del dock alineado con los otros botones (sin elevar) y con
//    su vidrio intacto, en bb-bar y mz-tabs; 2) Editar/Compartir como
//    SOLO ÍCONOS a la derecha de los contadores + «Aceptar todo»
//    REUBICADO en el encabezado con su nota chiquita (una sola vez,
//    sin la píldora de encima del chat); 3) la tirita de Inicio dice
//    «Premios» (no «mi jardín») y sin la imagen vieja del jardín, y el
//    título de la pantalla pasa a «Premios» (renombre decidido 3/11).
// Uso: node test-loteinicio3.js [dir]
const fs = require('fs');
const dir = process.argv[2] || '.';
const app = fs.readFileSync(dir + '/public/app.js', 'utf8');
const css = fs.readFileSync(dir + '/public/styles.css', 'utf8');
const idx = fs.readFileSync(dir + '/public/index.html', 'utf8');
const idxEn = fs.readFileSync(dir + '/public/en/index.html', 'utf8');
const srv = fs.readFileSync(dir + '/server.js', 'utf8');
let ok = 0, bad = 0;
function t(name, cond) { if (cond) { ok++; } else { bad++; console.log('FALLA: ' + name); } }
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const blockOf = (from, to) => { const a = app.indexOf(from); if (a < 0) return ''; const b = to ? app.indexOf(to, a + from.length) : app.length; return app.slice(a, b < 0 ? app.length : b); };

// ---------- stubs + funciones reales ----------
let ME = { lang: 'es' };
function gzT(es, en) { return (ME && ME.lang === 'en') ? en : es; }
function pzIc(name) { return '[' + name + ']'; }
const fnActions = app.match(/function hfProfileActionsHTML[\s\S]*?\n\}/);
const fnAccept = app.match(/function acceptBarHTML[\s\S]*?\n\}/);
const fnDockBtn = app.match(/function pzDockMasBtn[\s\S]*?\n\}/);
if (!fnActions || !fnAccept || !fnDockBtn) { console.log('FALLA: funciones reales no encontradas'); process.exit(1); }
eval(fnActions[0] + '\n' + fnAccept[0] + '\n' + fnDockBtn[0]);

// ---------- 1. + del dock alineado, vidrio intacto, función intacta ----------
const masRule = css.slice(css.indexOf('.bb-tab-mas, .mz-tab-mas{'), css.indexOf('.bb-tab-mas, .mz-tab-mas{') + 900);
t('1: + sin elevar (sin translateY)', !masRule.includes('translateY'));
t('1: + sigue 52px (>=44px tap)', masRule.includes('width:52px') && masRule.includes('height:52px'));
t('1: + vidrio intacto (blanco.55 + blur 16 saturate 1.4 + borde .75)', masRule.includes('rgba(255,255,255,.55)') && masRule.includes('blur(16px) saturate(1.4)') && masRule.includes('rgba(255,255,255,.75)'));
t('1: + círculo + sombra celeste intactos', masRule.includes('border-radius:50%') && masRule.includes('rgba(39,147,200,.35)'));
t('1: reduced-motion sigue en none (regla vieja, inofensiva)', css.includes('@media (prefers-reduced-motion: reduce){.bb-tab-mas,.mz-tab-mas{transform:none}}'));
const btnBb = pzDockMasBtn('bb'), btnMz = pzDockMasBtn('mz');
t('1: botón bb: clase + toggle + aria Crear', btnBb.includes('bb-tab-mas') && btnBb.includes('pzDockMasToggle()') && btnBb.includes('aria-label="Crear"'));
t('1: botón mz: clase + toggle + aria Crear', btnMz.includes('mz-tab-mas') && btnMz.includes('pzDockMasToggle()') && btnMz.includes('aria-label="Crear"'));
ME.lang = 'en';
t('1: botón EN: aria Create', pzDockMasBtn('bb').includes('aria-label="Create"'));
ME.lang = 'es';
const bbNav = app.slice(app.indexOf('<nav class="bb-bar">'), app.indexOf('<nav class="bb-bar">') + 700);
t('1: bb-bar: + entre Estrategia y Premios, orden intacto', bbNav.indexOf("tabBtn('analisis'") < bbNav.indexOf("pzDockMasBtn('bb')") && bbNav.indexOf("pzDockMasBtn('bb')") < bbNav.indexOf("tabBtn('jardin'"));
const mzNav = blockOf('function mzTabsHTML', 'function appShell');
t('1: mz-tabs: + entre Estrategia y Premios, orden intacto', mzNav.indexOf("t('analisis'") < mzNav.indexOf("pzDockMasBtn('mz')") && mzNav.indexOf("pzDockMasBtn('mz')") < mzNav.indexOf("t('jardin'"));

// ---------- 2. Íconos en contadores + Aceptar todo en el encabezado ----------
const headRow = blockOf('function homeHeadHTML', 'function pzPubInfoHTML');
t('2: contadores: íconos lápiz y compartir a la derecha (hf-head-icons)', headRow.includes('hf-head-icons') && headRow.includes('data-hf-pact="edit"') && headRow.includes('data-hf-pact="share"'));
t('2: íconos: aria-labels ES/EN, sin texto', headRow.includes('aria-label="${en ? \'Edit profile\' : \'Editar perfil\'}"') && headRow.includes('aria-label="${en ? \'Share my profile\' : \'Compartir mi perfil\'}"'));
t('2: íconos: mismos handlers (data-hf-pact, bind por atributo)', app.includes("root.querySelectorAll('[data-hf-pact]')") && app.includes("if (act === 'share') hfShareOpen();") && app.includes("else if (act === 'edit') hfEditOpen();"));
t('2: Inicio pide los íconos (headIcons, no visitante)', app.includes('headIcons: !HF_VISITOR'));
const outEs = hfProfileActionsHTML(false, acceptBarHTML(3));
t('2: encabezado ES: Aceptar todo + nota, sin botones de texto', outEs.includes('hfAcceptAllWeek') && outEs.includes('Aceptar todo') && outEs.includes('accept-count') && outEs.includes('Tocá el corazón para aprobar.') && !outEs.includes('hf-pmain') && !outEs.includes('Editar perfil') && !outEs.includes('Compartir mi perfil'));
ME.lang = 'en';
const outEn = hfProfileActionsHTML(true, acceptBarHTML(2));
t('2: encabezado EN: Accept all + nota espejo', outEn.includes('Accept all') && outEn.includes('Tap the heart to approve.'));
ME.lang = 'es';
const outVacio = hfProfileActionsHTML(false, '');
t('2: sin candidatos: solo la nota, sin botón duplicado', outVacio.includes('Tocá el corazón para aprobar.') && !outVacio.includes('hfAcceptAllWeek'));
t('2: Aceptar todo UNA sola vez (un solo id renderizado)', cnt(app, 'id="hfAcceptAllWeek"') === 1);
t('2: bind del botón intacto (mismo id, mismo handler)', app.includes("$('#hfAcceptAllWeek')") && app.includes('pzAcceptAllWeek(haw)'));
t('2: alcance intacto (candidatos = semana nueva pendientes)', app.includes('pzAcceptWeekCands = (!HF_VISITOR) ? pzAcceptAllWeekCands(tiles, null) : []'));
t('2: píldora del chat FUERA del bottomstack', !blockOf('<div class="mz-bottomstack"', '<div class="mz-chatbar"').includes('pzAcceptWeekHTML'));
t('2: encabezado recibe el HTML de Aceptar todo', app.includes('hfProfileActionsHTML(enHome, pzAcceptWeekHTML)'));
t('2: nota ÚNICA en app.js (sin duplicar corazón-nota)', cnt(app, 'Tocá el corazón para aprobar.') === 1 && cnt(app, 'Tap the heart to approve.') === 1);
t('2: CSS: ícono 40px + botón compacto + nota chiquita gris', css.includes('.hf-head-ic{width:40px;height:40px') && css.includes('.hf-pacts-accept .hf-accept-bar{width:auto') && css.includes('.hf-accept-note{font-size:12.5px') && css.includes('.hf-accept-note{font-size:12.5px;line-height:1.3;color:#47617A'));

// ---------- 3. Tirita Premios + título Premios ----------
const tira = blockOf('function mxTiraHTML', 'async function mxPortTop');
t('3: tirita: sin miniatura vieja ni candadito', !tira.includes('mx-tira-thumb') && !tira.includes('nvTira'));
t('3: tirita: sin imagen vieja del jardín', !tira.includes('jardin-bambu.webp'));
t('3: tirita: dice Premios, no Mi jardín', tira.includes("gzT('Premios', 'Prizes')") && !tira.includes("gzT('Mi jardín'"));
t('3: tirita: barrita + próximo + mismo destino intactos', tira.includes('mxBarra(') && tira.includes('pzProximoPremioTira(') && tira.includes("mxJardinIr('#/app/jardin-posty'"));
const jardinFn = blockOf('function mxJardinHTML', 'function mxJardinErrorHTML');
t('3: pantalla: título Premios en el header', jardinFn.includes("<h1>${gzT('Premios', 'Prizes')}</h1>"));
t('3: app.js: cero título viejo El jardín de Posty', !app.includes("gzT('El jardín de Posty'"));
t('3: app.js: cero Mi jardín como gzT', !app.includes("gzT('Mi jardín'"));
t('3: atrás de aprobación: Prizes/Premios', app.includes("(en ? 'Prizes' : 'Premios')"));
t('3: layout tira intacto (flex + radio + chev)', css.includes('.mx-tira-jardin{display:flex') && css.includes('.mx-tira-jardin{box-shadow:0 4px 14px') && tira.includes('mx-chev'));

// ---------- versiones / censo ----------
t('versiones: BUILD v585 (rotado por el liberador)', srv.includes("20261101-v585"));
t('versiones: app.js?v=392 en index (la landing EN es estática, no carga app.js)', idx.includes('app.js?v=392'));
t('versiones: styles?v=20261105 en ambos index', idx.includes('styles.css?v=20261105') && idxEn.includes('styles.css?v=20261105'));
t('versiones: CHUNK_V v589 (tanda Estrategia lo bumpea)', app.includes("CHUNK_V = '20261101-v589'")); // (ESTRATEGIA ×6 + CARTA-MANO + CARTA-PERSONALIZADA · 3/11, con causa) pin v583→v589: la tanda toca chunk-analisis.js; los otros pines de versiones del archivo (BUILD v585, ?v=392, styles 20261105) se dejan como estaban, ya fallaban en base
t('censo: pzGoBack presente', app.includes('pzGoBack'));

console.log(`\nRESULTADO: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
