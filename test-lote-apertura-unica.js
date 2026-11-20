// Suite LOTE APERTURA-UNICA (20/11) — la apertura es UNA SOLA: la magia.
// El dueño mandó captura (17:55): su PWA abría con la pantalla ANTERIOR
// (fondo crema, la cara en un círculo blanco grande, estática). Causa
// raíz, verificada en el árbol: (1) esa pantalla no la puede pintar
// ningún código del HEAD — su color #FAF4E8 no existe en el shell ni en
// sus hojas/bundle y el boot vigente no trae cara en círculo; es la
// cáscara VIEJA guardada en su PWA (la cara-como-entrada se retiró en
// v561 «doble-splash», commit bb99afc67e); (2) la «auto-cura de
// cáscara» del propio index.html nació MUERTA: compara un
// __POSTY_BUILD__ que el servidor debía inyectar, pero server.js no lo
// reemplazaba en ningún lado — el HTML servido (verificado en
// producción, byte a byte) traía el placeholder literal y el script
// volvía temprano al ver '__POSTY'. La cáscara vieja quedaba eterna.
// Este lote: (a) el servidor inyecta el build al servir la cáscara ES
// (ruta tras el gate de lista de espera, antes del static) y la
// auto-cura revive; (b) en contexto app el boot nace con el degradé de
// la magia desde el primer paint (clase .pz-appctx puesta en el <head>)
// y sin su contenido anterior — la primera pintura ES la presentación;
// (c) corrección del dueño 17:57 sobre APERTURA-MAGIA: la cara va en
// TAMAÑO LOGO (28cqw, como el logo de la apertura de Oppi), estrellitas
// /aro/glow reescalados a su alrededor, la palabra «Posty» con su punto
// amarillo queda y el SUBTÍTULO desaparece en ambos idiomas.
// Uso: node test-lote-apertura-unica.js [root]
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const es = read('public/index.html');
const en = read('public/en/index.html');
const app = read('public/app.js');
const server = read('server.js');

let ok = 0, fail = 0;
const t = (name, cond) => { if (cond) { ok++; } else { fail++; console.log('FAIL: ' + name); } };
const has = (s, x) => String(s || '').includes(x);
const idx = (s, x) => String(s || '').indexOf(x);

// ---------- A · primer paint en contexto app = la magia ----------
t('A1 el <head> marca .pz-appctx antes del boot', idx(es, "classList.add('pz-appctx')") > -1 && idx(es, "classList.add('pz-appctx')") < idx(es, '<div id="posty-boot"'));
t('A2 la detección del head honra posta_ver_web', has(es, "sessionStorage.getItem('posta_ver_web') === '1') appCtx = false"));
t('A3 la detección del head cubre standalone/nativa/hash app', has(es, "window.__pzAppCtx = true") && has(es, "h === '#/login'"));
t('A4 CSS: el boot nace con el degradé de la magia en app', has(es, 'html.pz-appctx #posty-boot{background:linear-gradient(168deg,#3EA6DB 0%,#2793C8 34%,#1B6FA0 68%,#0A1E33 100%)}'));
t('A5 CSS: en app el contenido anterior del boot no se pinta', has(es, 'html.pz-appctx #posty-boot .pz-boot-spin,html.pz-appctx #posty-boot .pz-boot-txt{display:none}'));

// ---------- B · corrección del dueño 17:57 ----------
t('B1 la cara va en tamaño logo (28cqw)', has(es, 'width:71px;width:28cqw'));
t('B2 la cara grande del mock quedó descartada', !has(es, 'width:81cqw') && !has(es, '.pzsp-face{position:absolute;left:50%;top:10.9%'));
t('B3 la cara se centra en el punto del aro (top 40%, márgenes negativos)', has(es, '.pzsp-face{position:absolute;left:50%;top:40%') && has(es, 'margin:-14.25cqw 0 0 -14cqw'));
t('B4 el aro se reescala al logo (42cqw)', has(es, 'width:106px;width:42cqw') && !has(es, 'width:68.3cqw'));
t('B5 el glow se reescala al logo (54cqw)', has(es, 'width:136px;width:54cqw') && !has(es, 'width:83.3cqw'));
t('B6 las estrellitas convergen al centro del logo (top 40%)', has(es, '.pzsp-star{position:absolute;left:50%;top:40%'));
t('B7 la palabra va bajo el logo (top 51%)', has(es, '.pzsp-word{position:absolute;left:0;right:0;top:51%'));
t('B8 la palabra «Posty» con su punto amarillo queda', has(es, 'Posty<span class="pzsp-dot">.</span>'));
t('B9 sin subtítulo en el shell (ni markup, ni CSS, ni keyframe)', !has(es, 'pz-splash-sub') && !has(es, 'pzsp-sub') && !has(es, 'pzspSub') && !has(es, 'tus community managers') && !has(es, 'your community managers'));
t('B10 sin subtítulo en app.js (bootSplashOff ya no lo ajusta)', !has(app, 'pz-splash-sub') && !has(app, 'your community managers'));
t('B11 la cara conserva su proporción a todo tamaño (height:auto vence al hint del atributo)', has(es, '.pzsp-face img{width:100%;height:auto;display:block;'));

// ---------- C · la auto-cura de cáscara revive (server inyecta) ----------
t('C1 el servidor reemplaza el placeholder por BUILD_ID', has(server, ".split('__POSTY_BUILD__').join(BUILD_ID)"));
t('C2 rutas de la cáscara ES registradas', has(server, "app.get('/', pzServeShellEs)") && has(server, "app.get('/index.html', pzServeShellEs)"));
t('C3 la ruta va tras el gate de espera y antes del static', idx(server, 'waitlist.registerWaitlistRoutes(app, db);') > -1 && idx(server, "app.get('/', pzServeShellEs)") > idx(server, 'waitlist.registerWaitlistRoutes(app, db);') && idx(server, "app.get('/', pzServeShellEs)") < idx(server, "app.use(express.static(path.join(__dirname, 'public')"));
t('C4 la cáscara se sirve no-cache (como el static de .html)', has(server, "res.setHeader('Cache-Control', 'no-cache')"));
t('C5 el archivo conserva el placeholder (la inyección es al servir)', has(es, "var served = '__POSTY_BUILD__';"));
t('C6 el script de auto-cura sigue intacto en el shell', has(es, 'Auto-cura de cáscara') && has(es, "u.searchParams.set('fresh', d.build)") && has(es, 'location.replace(u.toString())'));

// ---------- D · reglas heredadas intactas ----------
t('D1 la activación de la magia sigue solo-app y una vez', has(es, "boot.classList.add('pz-magic')") && has(es, 'if (sp.done) return; sp.done = true;'));
t('D2 duraciones de la magia sin cambios (1600/300/6000)', has(es, 'setTimeout(function () { sp.finish(300); }, reduced ? 500 : 1600)') && has(es, 'if (b) b.remove(); }, 6000);'));
t('D3 el boot web conserva su ruedita y su texto', has(es, '.pz-boot-spin{width:34px;height:34px') && has(es, '<span class="pz-boot-txt">Cargando…</span>'));
t('D4 el degradé claro del boot web no se tocó', has(es, '#posty-boot{position:fixed;inset:0;background:linear-gradient(165deg,#dff1fa 0%,#eef9fd 35%,#f7fbfe 100%)'));
t('D5 el index EN no tiene boot ni clase appctx (intacto)', !has(en, 'posty-boot') && !has(en, 'pz-appctx'));
t('D6 bootSplashOff sigue esperando la magia (gate intacto)', has(app, 'sp.appReady = true') && has(app, 'function bootSplashOff()'));

// ---------- E · sellos ----------
t('E1 BUILD_ID v1211 en server.js', has(server, "const BUILD_ID = '20261105-v1211';"));
t('E2 PZ_BUILD v1211 en app.js (paridad)', has(app, "const PZ_BUILD = '20261105-v1211';"));
t('E3 app.js?v=843 en el index ES', has(es, '<script src="/app.js?v=843"></script>'));
t('E4 styles?v= sin cambios en ambos index', has(es, '/styles.css?v=20261308') && has(en, '/styles.css?v=20261308'));

console.log(`APERTURA-UNICA: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
