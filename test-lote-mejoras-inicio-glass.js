// test-lote-mejoras-inicio-glass.js — LOTE B MEJORAS-INICIO · GLASS GLOBAL (ítem 6):
// TODA la app en vidrio, afuera el fondo celeste. Mock Inicio-glass
// aprobado por Valentino 8/11 (21:26, «Me gustan los 3, armalos»).
// Fondo cálido, cero celeste: el degradado azul saturado de R0 (.bb-app)
// y el degradado claro de LOTE GLASS TODAS (.app-shell / .hf-dback) pasan
// a crema cálido (el crema es el --bb-fondo propio del código, #FBF7EE).
// --bg2 dentro de la app pasa de #F2F9FD a crema cálido por variable con
// alcance (.bb-app / .app-shell): la web pública no se toca. Receta glass
// exacta de Análisis v819 en paneles. Excepciones: el modal explicativo y
// el cajón lateral viven FUERA de los shells (portales a nivel de body) y
// van con su propio alcance; el chat a pantalla completa (.pz-chatfull) y
// el post-chat (.pz-postchat) son fijos con fondo celeste propio y llevan
// fondo cálido propio. El feed queda TRANSPARENTE en modo
// claro, como el mock; en modo oscuro sigue navy. CSS-only: app.js y
// server.js SIN tocar. Solo se AGREGA un bloque al final de styles.css:
// las reglas viejas siguen intactas (los asserts de r0 / hoy-rediseno
// sobre #9ED6F4 siguen pasando sobre la regla vieja, ya sin efecto).
// Uso: node test-lote-mejoras-inicio-glass.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, re) => (s.match(re) || []).length;
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const lotStart = css.indexOf('LOTE B MEJORAS-INICIO');
const lotCss = lotStart >= 0 ? css.slice(lotStart) : '';
const lotRules = lotCss.slice(lotCss.indexOf('*/') + 2);
const GLASS = 'background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,.75);box-shadow:0 8px 24px rgba(10,30,51,.10)';

console.log('— 1. Bloque LOTE B presente y fondo cálido —');
ok(lotStart >= 0, 'bloque LOTE B MEJORAS-INICIO presente al final de styles.css');
ok(lotRules.includes('#FBF7EE') && lotRules.includes('#F6EDDA'), 'fondo cálido crema (#FBF7EE / #F6EDDA) en el bloque');
ok(lotRules.includes('rgba(244,196,150,.30)'), 'brillo cálido durazno (el verde de R0 no sigue)');
ok(lotRules.includes('.bb-app,.bb-app.bb-glass-inicio,.bb-app.bb-glass-pantallas,.app-shell,.hf-dback,body:has(.form-card){background:radial-gradient(420px 420px at 85% -40px,rgba(254,193,77,.55)'), 'fondo cálido en .bb-app + .app-shell + .hf-dback + form + apertura');
ok(!/#F2F9FD|#dff1fa|#eef9fd|#f7fbfe|#9ED6F4|#4FA9DC|#63B8E4|#A8DCF6|#2793C8 55%/.test(lotRules), 'cero celeste en las REGLAS del bloque (el #F2F9FD del comentario no cuenta)');
ok(lotRules.includes('.bb-app,.app-shell{--bg2:#F6EDDA}'), '--bg2 cálido con alcance app (.bb-app / .app-shell), la web no se toca');
ok(lotRules.includes('body:has(.bb-app),body:has(.app-shell){background:linear-gradient(165deg,#FCF8EF 0%,#FBF7EE 50%,#F6EDDA 100%)}'), 'overscroll (body) también cálido');

console.log('— 2. Paneles en vidrio receta v819 —');
ok(lotRules.includes('.bb-app .card,.app-shell .card{' + GLASS), 'tarjetas genéricas de la app en vidrio (.bb-app .card + .app-shell .card)');
ok(lotRules.includes('.bb-app .pz-nivel-logro') && lotRules.includes('.app-shell .pz-nivel-logro') && lotRules.includes('.bb-app .pz-nivel-hito') && lotRules.includes('.app-shell .pz-mision'), 'tarjetas de Nivel en vidrio en los DOS shells');
ok(lotRules.includes('.bb-app .pz-nivel-head,.app-shell .pz-nivel-head{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);box-shadow:0 8px 24px rgba(10,30,51,.10)}'), 'cabecera de Nivel en vidrio (borde de marca #2793C8 intacto)');
ok(lotRules.includes('.bb-app .mx-tira-posty') && lotRules.includes('.bb-app .mx-jardin-posty .mx-tarjeta'), 'tira y tarjetas del jardín en vidrio');
ok(lotRules.includes('.bb-app .igmock') && lotRules.includes('.bb-app .pz-hoy-sheet') && lotRules.includes('.bb-app .post-item'), 'mock IG, hoja inferior de Hoy y lista en vidrio');
ok(lotRules.includes('.pz-exp-overlay .pz-exp-modal') && lotRules.includes('.drawer{background:rgba(255,255,255,.55)'), 'modal explicativo y cajón lateral en vidrio (portales a nivel de body, fuera de los shells)');
ok(/\.pz-chatfull\{background:radial-gradient\(420px 420px at 85% -40px,rgba\(254,193,77,\.55\)/.test(lotRules), 'chat a pantalla completa (.pz-chatfull) con fondo cálido (tapaba el cálido con su celeste propio)');
ok(lotRules.includes('.pz-postchat{background:linear-gradient(165deg,#FCF8EF 0%,#FBF7EE 50%,#F6EDDA 100%)}'), 'post-chat (.pz-postchat) con fondo cálido');
ok(lotRules.includes('.bb-app .pz-nivel,.app-shell .pz-nivel'), 'tira de Nivel en vidrio (ronda 2)');
ok(lotRules.includes('.bb-app .main>.pz-nivel,.app-shell .main>.pz-nivel{background:transparent'), 'contenedor de la pestaña Nivel transparente (su #F4FAFE heredado tapaba el cálido)');
ok(lotRules.includes('#pzNivelStrip{background:rgba(255,255,255,.55)!important'), 'tira de Nivel con style inline pisada con !important');
ok(lotRules.includes('.bb-app .pz-nivel-hoy,.app-shell .pz-nivel-hoy') && lotRules.includes('rgba(255,246,219,.55)'), 'misiones de hoy en vidrio con su tinte amarillo (no blanco)');
ok(lotRules.includes('.bb-app .pz-ausencia') && lotRules.includes('.bb-app .pz-vit-badge') && lotRules.includes('.bb-app .pz-mision-borrador') && lotRules.includes('.bb-app .hs-done') && lotRules.includes('.bb-app .ads-pill.on'), 'ausencia, insignia, borrador, hecho y píldora activa en vidrio (ronda 2)');
ok(lotRules.includes('.bb-app .pz-ritual-carta,.app-shell .pz-ritual-carta{background:rgba(255,255,255,.55)'), 'cartas del ritual en vidrio (ronda 3)');
ok(lotRules.includes('.bb-app .pz-ritual-pack,.app-shell .pz-ritual-pack{background:rgba(253,246,227,.55)'), 'paquete del ritual en vidrio con su tinte crema (ronda 3)');
ok(lotRules.includes('.bb-app .pp-posty') && lotRules.includes('.bb-app .pz-informe-fila') && lotRules.includes('.bb-app .stk-smart'), 'paneles de informe y consejo en vidrio');
ok(lotRules.includes('.bb-app .ana-stat') && lotRules.includes('.bb-app .ana-weeknum') && lotRules.includes('.bb-app .ana-ltr-plan'), 'stats de Análisis en vidrio');
ok(lotRules.includes('.bb-app .ig-checklist') && lotRules.includes('.bb-app .pz-trial-ok'), 'checklist y banda de prueba en vidrio');
ok(lotRules.includes('.bb-app .pz-hoy-speech,.app-shell .pz-hoy-speech{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,.75);box-shadow:0 6px 18px rgba(10,30,51,.10)}'), 'burbuja del saludo en vidrio en los DOS shells (sombra celeste fuera)');
ok(lotRules.includes('.bb-app .chat-msg.ai,.app-shell .chat-msg.ai{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,.75)}'), 'burbuja del chat (Posty) en vidrio en todos los contextos (sin sombra, como .pz-chatfull)');
ok(lotRules.includes('.bb-app .chat-msg.u,.app-shell .chat-msg.u{background:rgba(39,147,200,.72);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,.5)}'), 'burbuja del usuario en vidrio-azul');
ok(lotRules.includes('.chat-home .chat-input-row{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border-color:rgba(255,255,255,.75)}'), 'barra de escribir del chat embebido en vidrio');
ok(lotRules.includes('.bb-app .pill,.app-shell .pill{background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.75)}'), 'píldora en vidrio (borde celeste fuera, texto de marca intacto)');
ok(lotRules.includes('.bb-app .setup-row:active,.app-shell .setup-row:active,.bb-app .src-re:active,.app-shell .src-re:active{background:rgba(255,255,255,.55)}'), 'estados de presión sin celeste');

console.log('— 3. Feed transparente en modo claro (mock), navy intacto en oscuro —');
ok(lotRules.includes('@media (prefers-color-scheme: light){'), 'guardia de modo claro para el feed');
ok(lotRules.includes('.bb-app .hf-wrap,.app-shell .hf-wrap,.bb-app .hf-head,.app-shell .hf-head,.bb-app .hf-grid,.app-shell .hf-grid,.bb-app .fp-head,.app-shell .fp-head,.bb-app .fp-grid,.app-shell .fp-grid{background:transparent}'), 'perfil y grilla del feed transparentes sobre el fondo cálido (dos shells)');
ok(lotRules.includes('.bb-app .fp-head,.app-shell .fp-head{border-color:transparent}'), 'cabecera de perfil sin caja');
ok(css.includes('@media (prefers-color-scheme: dark){') && css.includes('.hf-wrap{background:#0A1E33}'), 'modo oscuro del feed intacto (navy)');

console.log('— 4. Lo viejo intacto (el bloque solo agrega, no edita) —');
ok(css.includes('.st-wrap .ph-ico{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,.75);box-shadow:0 8px 24px rgba(10,30,51,.10)}'), 'glass de Análisis v811 intacto');
ok(css.includes('.btn-primary{background:var(--cel);color:#fff;box-shadow:0 6px 16px rgba(39,147,200,.42),inset 0 1px 0 rgba(255,255,255,.55)}') && cnt(css, /\.btn-primary\{/g) === 2, '.btn-primary intacto (sin cambio)');
ok(/\.bb-app[^{]*\{[^}]*#9ED6F4/.test(css), 'regla vieja R0 con #9ED6F4 sigue en el archivo (sin efecto: la cálida la pisa por orden)');
ok(css.includes('.app-shell, .hf-dback, body:has(.form-card){background:radial-gradient(260px 260px at 85% -60px,rgba(39,147,200,.22)'), 'bloque LOTE GLASS TODAS intacto (sin efecto: la cálida lo pisa por orden)');
ok(css.indexOf('LOTE B MEJORAS-INICIO') > css.indexOf('LOTE ANÁLISIS-GLASS v811'), 'LOTE B va DESPUÉS del bloque v811 (gana por orden)');
ok((css.match(/{/g) || []).length === (css.match(/}/g) || []).length, 'llaves balanceadas en styles.css');

console.log('— 5. Solo styles.css (app.js y server.js intactos, base v839) —');
ok(md5(app) === '18105a7f853daf3da3dbdffd3b831824', 'app.js = v839 fase 1 (sin apertura)');
ok(md5(srv) === '2356a326b0999bb2008ab4ea3e6d1f18', 'server.js = v839 (solo BUILD)');
ok(!/ai-avatar\.png/.test(lotRules), 'la cara canónica no se toca en este lote');
ok(!lotCss.includes('#2793C8') || lotCss.includes('borde de marca #2793C8'), 'sin azules de marca nuevos en el bloque (solo el comentario)');

console.log(`\nLOTE B GLASS GLOBAL: ${pass} OK, ${fail} FALLOS`);
if (fail) { console.log('Fallos:', fails.join(' | ')); process.exit(1); }
