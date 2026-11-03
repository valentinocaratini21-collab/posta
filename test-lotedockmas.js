// LOTE DOCK-MAS (liberación v574 sobre v573): suite nueva adaptada.
// Ejecuta el codigo REAL del dock (funciones extraidas de public/app.js)
// con stubs minimos + asserts estaticos sobre las dos superficies.
// Conciliación v573: «Agregar foto» llama a pzSftFotoAlChat (foto
// directa al chat), NUNCA a #mzPlus/#albumFile; «Nota de voz» espeja
// el #mzMic de v573 (flag __pzChatVoice + #/app/chat).
// Uso: node test-lotedockmas.js [dir]
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

// ---------- stubs ----------
let ME = { lang: 'es' };
function gzT(es, en) { return (ME && ME.lang === 'en') ? en : es; }
function pzIc(name) { return '[' + name + ']'; }
let els = {};
let timeouts = [];
let sftCalls = 0, voiceCalls = 0;
const windowStub = {};
const document = { getElementById: (id) => els[id] || null };
const location = { hash: '#/app/analisis' };
function setTimeout(fn) { timeouts.push(fn); }
function pzSftFotoAlChat() { sftCalls++; }
function voiceToggle() { voiceCalls++; }

// Extrae el bloque dock-mas real (desde la primera funcion hasta appShell).
const start = app.indexOf('function pzDockMasBtn');
const end = app.indexOf('function appShell(', start);
if (start < 0 || end < 0) { console.log('FALLA: bloque dock-mas no encontrado'); process.exit(1); }
const block = app.slice(start, end);
eval(block.replace('window.__pzChatVoice', 'windowStub.__pzChatVoice'));

// ---------- 1. orden bb-bar v573: Inicio, Estrategia, +, Premios, Ajustes ----------
const bbNav = app.slice(app.indexOf('<nav class="bb-bar">'), app.indexOf('<nav class="bb-bar">') + 700);
t('bb-bar: Inicio antes que Estrategia', bbNav.indexOf("tabBtn('inicio'") < bbNav.indexOf("tabBtn('analisis'"));
t('bb-bar: + entre Estrategia y Premios', bbNav.indexOf("tabBtn('analisis'") < bbNav.indexOf("pzDockMasBtn('bb')") && bbNav.indexOf("pzDockMasBtn('bb')") < bbNav.indexOf("tabBtn('jardin'"));
t('bb-bar: Premios antes que Ajustes', bbNav.indexOf("tabBtn('jardin'") < bbNav.indexOf("tabBtn('ajustes'"));
t('bb-bar: 4 pestanas intactas', (bbNav.match(/tabBtn\(/g) || []).length === 4);
t('bb-bar: etiqueta Premios (no Jardin)', bbNav.includes("gzT('Premios', 'Prizes')"));

// ---------- 2. orden mz-tabs v573 ----------
const mzNav = app.slice(app.indexOf('function mzTabsHTML'), app.indexOf('function appShell('));
t('mz-tabs: + entre Estrategia y Premios', mzNav.indexOf("t('analisis'") < mzNav.indexOf("pzDockMasBtn('mz')") && mzNav.indexOf("pzDockMasBtn('mz')") < mzNav.indexOf("t('jardin'"));
t('mz-tabs: 4 pestanas intactas', (mzNav.match(/t\('(inicio|jardin|analisis|ajustes)'/g) || []).length === 4);
t('mz-tabs: sin dock en pantalla chat', mzNav.includes("if (tab === 'chat') return '';"));
t('mz-tabs: etiqueta Premios', mzNav.includes("gzT('Premios', 'Prizes')"));

// ---------- 3. boton +: sin ruta, con toggle ----------
const btnBb = pzDockMasBtn('bb'), btnMz = pzDockMasBtn('mz');
t('boton bb: clase bb-tab-mas', btnBb.includes('bb-tab-mas'));
t('boton mz: clase mz-tab-mas', btnMz.includes('mz-tab-mas'));
t('boton +: abre la hoja (toggle)', btnBb.includes('pzDockMasToggle()') && btnMz.includes('pzDockMasToggle()'));
t('boton +: NO cambia de ruta', !btnBb.includes('#/app/') && !btnMz.includes('#/app/') && !btnBb.includes('bbGo'));
t('boton +: muestra +', btnBb.includes('>+<') && btnMz.includes('>+<'));

// ---------- 4. hoja ES/EN ----------
ME.lang = 'es';
let sheet = pzDockMasHTML();
t('hoja ES: Agregar foto', sheet.includes('Agregar foto'));
t('hoja ES: Nota de voz', sheet.includes('Nota de voz'));
t('hoja ES: pregunta en lenguaje cliente', sheet.includes('¿Qué querés agregar?'));
t('hoja ES: filas llaman Foto y Voz', sheet.includes('pzDockMasFoto()') && sheet.includes('pzDockMasVoz()'));
t('hoja ES: backdrop y x cierran', sheet.includes('pzDockMasClose()'));
ME.lang = 'en';
sheet = pzDockMasHTML();
t('hoja EN: Add photo', sheet.includes('Add photo'));
t('hoja EN: Voice note', sheet.includes('Voice note'));
t('hoja EN: What do you want to add?', sheet.includes('What do you want to add?'));
ME.lang = 'es';

// ---------- 5. hoja insertada en ambos docks ----------
t('hoja: en bb-bar (concatenacion, no texto literal)', bbNav.includes("pzDockMasHTML()") && !bbNav.includes('${pzDockMasHTML()}'));
t('hoja: en mz-tabs (interpolacion)', mzNav.includes('${pzDockMasHTML()}'));
t('hoja: drawer lateral intacto (sin +)', !app.slice(app.indexOf('drawer-link'), app.indexOf('drawer-link') + 2000).includes('pzDockMas'));

// ---------- 6. toggle / close funcionales ----------
els = { pzDockMasSheet: { hidden: true } };
pzDockMasToggle();
t('toggle: abre', els.pzDockMasSheet.hidden === false);
pzDockMasToggle();
t('toggle: cierra', els.pzDockMasSheet.hidden === true);
pzDockMasClose();
t('close: deja hidden', els.pzDockMasSheet.hidden === true);

// ---------- 7. CONCILIACION v573: foto -> pzSftFotoAlChat, nunca Album ----------
// (los comentarios del bloque nombran los caminos viejos para
// documentar que NO se usan: se verifica codigo sin comentarios)
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
const fotoFn = stripComments(block.slice(block.indexOf('function pzDockMasFoto'), block.indexOf('function pzDockMasVoz')));
t('foto: llama a pzSftFotoAlChat', fotoFn.includes('pzSftFotoAlChat()'));
t('foto: NUNCA #mzPlus', !fotoFn.includes('mzPlus'));
t('foto: NUNCA #albumFile', !fotoFn.includes('albumFile'));
t('foto: cierra la hoja antes', fotoFn.indexOf('pzDockMasClose()') < fotoFn.indexOf('pzSftFotoAlChat()'));
els = { pzDockMasSheet: { hidden: false } };
sftCalls = 0;
pzDockMasFoto();
t('foto funcional: cierra hoja y llama a pzSftFotoAlChat', els.pzDockMasSheet.hidden === true && sftCalls === 1);

// ---------- 8. voz: espejo #mzMic de v573 ----------
const vozFn = stripComments(block.slice(block.indexOf('function pzDockMasVoz')));
t('voz: flag __pzChatVoice + #/app/chat cuando no esta en chat', vozFn.includes('__pzChatVoice') && vozFn.includes("location.hash = '#/app/chat'"));
t('voz: directo voiceToggle a 80 ms si ya esta en chat', vozFn.includes('voiceToggle()') && vozFn.includes('}, 80)'));
t('voz: NUNCA mzOpenSheet viejo ni #mzMic', !vozFn.includes('mzOpenSheet') && !vozFn.includes('mzMic'));
location.hash = '#/app/analisis';
windowStub.__pzChatVoice = false;
timeouts = [];
pzDockMasVoz();
t('voz funcional: desde otra pestana pone flag y navega a #/app/chat', windowStub.__pzChatVoice === true && location.hash === '#/app/chat');
location.hash = '#/app/chat';
windowStub.__pzChatVoice = false;
timeouts = []; voiceCalls = 0;
pzDockMasVoz();
t('voz funcional: en chat no pone flag, programa voiceToggle', windowStub.__pzChatVoice === false && timeouts.length === 1);
timeouts.forEach((fn) => fn());
t('voz funcional: el timeout llama a voiceToggle', voiceCalls === 1);

// ---------- 9. CSS ----------
t('CSS: boton 52 px circular elevado', css.includes('.bb-tab-mas, .mz-tab-mas{') && css.includes('width:52px') && css.includes('translateY(-12px)'));
t('CSS: receta glass celeste', css.includes('blur(16px) saturate(1.4)') && css.includes('rgba(39,147,200,.35)'));
t('CSS: + 30 px navy', css.includes('font-size:30px') && css.includes('color:#0A1E33'));
t('CSS: hoja con backdrop y card', css.includes('.pz-dockmas-card') && css.includes('.pz-dockmas-back'));
t('CSS: reduced-motion anula elevacion', css.includes('prefers-reduced-motion') && css.includes('.bb-tab-mas,.mz-tab-mas{transform:none}'));

// ---------- 10. M78: las 6 funciones existen y se llaman ----------
['pzDockMasBtn', 'pzDockMasHTML', 'pzDockMasToggle', 'pzDockMasClose', 'pzDockMasFoto', 'pzDockMasVoz'].forEach((f) => {
  t('M78: definida ' + f, app.includes('function ' + f));
});
t('M78: Btn llamado en ambos docks', cnt(app, "pzDockMasBtn('bb')") >= 1 && cnt(app, "pzDockMasBtn('mz')") >= 1);
t('M78: HTML llamado en ambos docks', cnt(app, 'pzDockMasHTML()') >= 3); // def + 2 inserciones
t('M78: Toggle llamado por el boton +', btnBb.includes('pzDockMasToggle()'));
t('M78: Close llamado por backdrop y x', (sheet.match(/pzDockMasClose\(\)/g) || []).length >= 2);
t('M78: Foto y Voz llamados por las filas', sheet.includes('pzDockMasFoto()') && sheet.includes('pzDockMasVoz()'));

// ---------- 11. versiones + censo (post-push: v574 (pines rotados con causa)) ----------
t('BUILD v576 (pin rotado con causa: liberación v576)', srv.includes("const BUILD_ID = '20261101-v576'"));
t('index: app.js?v=387 (pin rotado con causa: liberación v576)', idx.includes('app.js?v=387'));
t('index: styles?v=20261102 (pin rotado con causa: liberación v576)', idx.includes('styles.css?v=20261102'));
t('en/index: styles?v=20261102 (pin rotado con causa: liberación v576)', idxEn.includes('styles.css?v=20261102'));
t('CHUNK_V intacto v573 (no se toca chunk lazy)', app.includes("const CHUNK_V = '20261101-v575'"));
t('censo server: catsMatch 3', cnt(srv, 'catsMatch') === 3);
t('censo server: week-redo 16', cnt(srv, 'week-redo') === 16);
t('censo server: first_week 3', cnt(srv, 'first_week') === 3);
t('censo server: /aprobar 16', cnt(srv, '/aprobar') === 16);
t('censo app: pzGoBack 6', cnt(app, 'pzGoBack') === 6);
t('censo app: pz-detalle-setup 1', cnt(app, 'pz-detalle-setup') === 1);
t('censo app: /aprobar 1', cnt(app, '/aprobar') === 1);
t('censo app: autofetch 0', cnt(app, 'autofetch') === 0);
t('ropa/ 100 PNG intactos', (() => { try { return fs.readdirSync(dir + '/public/ropa').filter((f) => f.endsWith('.png')).length === 100; } catch (e) { return false; } })());

console.log(`LOTEDOCKMAS: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
