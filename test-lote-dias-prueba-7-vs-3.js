// test-lote-dias-prueba-7-vs-3.js — LOTE DIAS-PRUEBA-7-VS-3 (BUILD v968, base v967).
// Valentino (11/11, viendo el onboarding en vivo): la web promete 7 días
// gratis, pero adentro del producto dice «Te quedan 3 días de prueba».
// Una de las dos está mal. La prueba es de 3 días (decidido 6/11;
// TRIAL_DAYS = 3 en server.js y TRIAL_DAYS_GUEST = 3 en guest-trial.js;
// el contador «Te quedan N días» sale de ahí).
//
// HALLAZGO DEL CENSO (no hay un «7 días gratis» literal que borrar):
// el censo exhaustivo de «7 días» / «7 days» / «7-day» en todo el árbol
// no encontró NINGUNA promesa literal de 7 días gratis: el hero, la meta,
// el JSON-LD, /prueba, el prompt del chat y el contador ya dicen 3 días.
// Lo que se leía como 7 días gratis era el CTA principal: «Ver mi semana
// gratis» / «See my week, free» — la prueba presentada como una SEMANA
// (7 días de posteos) gratis — mientras el trial dura 3 días. El fix:
// el CTA dice la duración real en ambos idiomas, sin perder el valor
// («ver mi semana»).
//
// Lo que se verifica (Node puro, lee el árbol, sin red):
//  A. El CTA dice 3 días en ES (x4) y EN (x3); el viejo x0 en ambos.
//  B. Ninguna promesa de «7 días gratis» / «7 days free» queda en los
//     archivos servidos (index ES/EN, app.js, server.js, prueba.html,
//     en-prueba.html).
//  C. Lo legítimo de 7 días sigue intacto: espejo (7 días de la semana),
//     Impulsar por 7 días (pauta), ventanas SQL «-7 days», TRIAL_DAYS = 3,
//     contador «Te quedan N días», hero-note «3 días gratis» ES+EN,
//     trialCta ES/EN «Probar 3 días gratis» / «Try 3 days free»,
//     PAUSE «son 3 días, sin tarjeta».
//  D. Estampado: BUILD v968 x1, app.js?v=671 x1 ES, styles?v=20261270
//     intacto en ambos, EN sin app.js?v=.
//  E. M78: las líneas cambiadas son literales de texto en botones/links
//     sin call sites (sin paréntesis ni handlers): 0 llamadas nuevas.
// Uso: node test-lote-dias-prueba-7-vs-3.js (desde la raíz del scratch,
// lee release/ si existe; copiado en release/ se lee a sí mismo).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TREE = fs.existsSync(path.join(ROOT, 'release', 'server.js'))
  ? path.join(ROOT, 'release')
  : ROOT;

const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const CHUNK = fs.readFileSync(path.join(TREE, 'public', 'chunk-analisis.js'), 'utf8');
const PRUEBA = fs.readFileSync(path.join(TREE, 'public', 'prueba.html'), 'utf8');
const PRUEBAEN = fs.readFileSync(path.join(TREE, 'public', 'en-prueba.html'), 'utf8');
const GUEST = fs.readFileSync(path.join(TREE, 'guest-trial.js'), 'utf8');

let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const occ = (s, sub) => s.split(sub).length - 1;
const linesWith = (s, sub) => s.split('\n').filter((l) => l.includes(sub));

// ---- A. El CTA dice 3 días ----
t(occ(IDX, 'Ver mi semana · 3 días gratis') === 1, 'A1 index ES: CTA nuevo x1');
t(occ(APP, 'Ver mi semana · 3 días gratis') === 3, 'A2 app.js: CTA nuevo x3');
t(occ(IDXEN, 'See my week · 3 days free') === 3, 'A3 index EN: CTA nuevo x3');
t(occ(IDX, 'Ver mi semana gratis') === 0, 'A4 index ES: CTA viejo x0');
t(occ(APP, 'Ver mi semana gratis') === 0, 'A5 app.js: CTA viejo x0');
t(occ(IDXEN, 'See my week, free') === 0, 'A6 index EN: CTA viejo x0');
t(occ(IDX, 'Ver mi semana') === 1, 'A7 index ES: solo el CTA lleva "Ver mi semana"');

// ---- B. Ninguna promesa de 7 días gratis ----
for (const [name, src] of [['index ES', IDX], ['index EN', IDXEN], ['app.js', APP], ['server.js', SRV], ['prueba.html', PRUEBA], ['en-prueba.html', PRUEBAEN]]) {
  t(!/7 d[ií]as gratis/i.test(src), `B1 ${name}: sin "7 días gratis"`);
  t(!/7 days free/i.test(src), `B2 ${name}: sin "7 days free"`);
  t(!/7-day free trial/i.test(src), `B3 ${name}: sin "7-day free trial"`);
}

// ---- C. Lo legítimo de 7 días intacto ----
t(IDX.includes("Publicás '+l+' de 7 días"), 'C1 index ES: espejo "de 7 días" intacto');
t(occ(APP, 'de 7 días') >= 1 && occ(APP, 'out of 7 days') >= 1, 'C2 app.js: espejo 7 días ES+EN intacto');
t(APP.includes('Impulsar con $20 · 7 días'), 'C3 app.js: boost "7 días" intacto');
t(APP.includes('Tiene una pauta activa por 7 días'), 'C4 app.js: boost activo 7 días intacto');
t(APP.includes('por 7 días, desde hoy'), 'C5 app.js: boost "por 7 días, desde hoy" intacto');
t(APP.includes('✓ Posteo impulsado por 7 días'), 'C6 app.js: toast boost 7 días intacto');
t(occ(CHUNK, '7 días') >= 5, 'C7 chunk-analisis: pauta 7 días intacta');
t(SRV.includes("datetime('now', '-7 days')"), 'C8 server.js: ventanas SQL "-7 days" intactas');
t(SRV.includes('const TRIAL_DAYS = 3;'), 'C9 server.js: TRIAL_DAYS = 3 intacto');
t(GUEST.includes('const TRIAL_DAYS_GUEST = 3;'), 'C10 guest-trial.js: TRIAL_DAYS_GUEST = 3 intacto');
t(APP.includes('Te quedan ${dLeft} días de prueba'), 'C11 app.js: contador "Te quedan N días" intacto');
t(IDX.includes('3 días gratis') && IDXEN.includes('3 days free'), 'C12 hero-note 3 días ES+EN intacta');
t(APP.includes("trialCta: 'Probar 3 días gratis'"), 'C13 app.js: trialCta ES "Probar 3 días gratis" intacto');
t(APP.includes("trialCta: 'Try 3 days free'"), 'C14 app.js: trialCta EN "Try 3 days free" intacto');
t(SRV.includes('tu semana gratis te espera: son 3 días, sin tarjeta'), 'C15 server.js: PAUSE "son 3 días" intacto');

// ---- D. Estampado ----
t(occ(SRV, "20261105-v968") === 1, 'D1 server.js: BUILD v968 x1');
t(occ(SRV, "20261105-v967") === 0, 'D2 server.js: BUILD v967 x0');
t(occ(IDX, 'app.js?v=671') === 1, 'D3 index ES: app.js?v=671 x1');
t(occ(IDX, 'app.js?v=668') === 0, 'D4 index ES: app.js?v=668 x0');
t(occ(IDX, 'styles.css?v=20261270') === 1, 'D5 index ES: styles?v=20261270 x1 intacto');
t(occ(IDXEN, 'styles.css?v=20261270') === 1, 'D6 index EN: styles?v=20261270 x1 intacto');
t(occ(IDXEN, 'app.js?v=') === 0, 'D7 index EN: sin app.js?v=');

// ---- E. M78: las líneas cambiadas no llaman a ninguna función ----
const ctaLines = [
  ...linesWith(IDX, 'Ver mi semana · 3 días gratis'),
  ...linesWith(APP, 'Ver mi semana · 3 días gratis'),
  ...linesWith(IDXEN, 'See my week · 3 days free'),
];
t(ctaLines.length === 7, `E1 líneas CTA cambiado x7 (son ${ctaLines.length})`);
t(ctaLines.every((l) => !l.includes('(')), 'E2 líneas CTA sin paréntesis (sin llamadas)');
t(ctaLines.every((l) => !/on(click|submit|change)\s*=/.test(l)), 'E3 líneas CTA sin handlers');
t(ctaLines.every((l) => l.includes('<button') || l.includes('<a ')), 'E4 líneas CTA son button/a puros');

console.log(`\ntest-lote-dias-prueba-7-vs-3: ${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
