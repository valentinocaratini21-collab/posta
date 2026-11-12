// test-lote-hechos-prompt-chat.js — LOTE HECHOS-PROMPT-CHAT (BUILD v969, base v968 — re-base v2 del preparador; lote original v910 sobre base v900).
// Hallazgo del builder de v909 (fuera de su alcance): el prompt del chat
// público le decía al visitante hechos viejos. En server.js, HECHOS
// REALES del prompt (PZ_CHAT_PUBLIC_SYS / PZ_CHAT_PUBLIC_SYS_EN):
// «Precio: USD 200 por mes. ... Lanzamiento: 1 de febrero de 2027.»
// (ES, línea 6252 en base v968; 6229 en v900) y «Price: USD 200 per month. ... Launch:
// February 1, 2027.» (EN, línea 6269 en base v968; 6246 en v900). DOS datos mal: (1) el precio
// decidido es USD 199/mes, plan único (Valentino 6/11, «199usd es el
// precio», reemplaza USD 200); (2) el lanzamiento es el 1 de diciembre
// de 2026 (decidido; antes 1/2/2027). La regla de verdad gobierna todo
// el copy: Posty no puede decirle al visitante un precio ni una fecha
// que ya no son.
//
// CENSO CLASIFICADO (todo el árbol, js/html/json):
//  A. Afirmación vigente con dato viejo (CAMBIA: 2 líneas, server.js):
//     6252 ES → USD 199 por mes + 1 de diciembre de 2026;
//     6269 EN → USD 199 per month + December 1, 2026.
//  B. Legítimo, NO se toca: test-lotechatwebsite.js:123-124 (pinea los
//     hechos viejos: queda STALE por diseño, follow-up aparte) ·
//     onboarding-products.js:42 (ejemplo en comentario) ·
//     test-lotecuentaregresiva.js:30,36,37,44 (tests de fases de la
//     lista de espera — fuera de alcance) · test-lotepruebaproducto.js:
//     44,45,50,51 (fixtures de bio) · test-media-cliente-3.js:91,92
//     (vigenciaParse, fecha arbitraria) · waitlist.js:13 (comentario) ·
//     fixtures ARS de tests de Gesty (200000, 120000, 2000 — no son USD).
//  Ambiguas: ninguna. No hay .md/.txt con los hechos viejos.
//
// Lo que se verifica (Node puro, lee el árbol, sin red):
//  A. El prompt del chat dice USD 199 + 1 de diciembre de 2026 (ES) y
//     USD 199 + December 1, 2026 (EN).
//  B. Ningún hecho viejo vigente en los archivos servidos (server.js,
//     app.js, index ES/EN, styles.css, prueba.html, en-prueba.html).
//  C. Lo legítimo intacto: bloque VENTA con USD 199, fundadores con
//     1 de diciembre de 2026, TRIAL_DAYS = 3, trialCta 3 días.
//  D. Estampado: BUILD v969 x1, v968 x0, ?v intactos (app.js?v=671,
//     styles?v=20261270 en ambos index, EN sin app.js?v=); el lote
//     server-only NO bumpea ?v= ni styles?v= (D7/D8 lo verifican).
//  E. M78: las 2 líneas cambiadas son literales de texto en arrays de
//     prompt, sin llamadas nuevas (0/0).
//  F. Diff release/ vs base-v968 = exactamente server.js + suite nueva.
// Uso: node test-lote-hechos-prompt-chat.js (desde la raíz del scratch,
// lee release/ si existe; copiado en release/ se lee a sí mismo).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const TREE = fs.existsSync(path.join(ROOT, 'release', 'server.js'))
  ? path.join(ROOT, 'release')
  : ROOT;
const BASE = fs.existsSync(path.join(ROOT, 'base-v968', 'server.js'))
  ? path.join(ROOT, 'base-v968')
  : path.join(ROOT, '..', 'base-v968');

const read = (p) => fs.readFileSync(path.join(TREE, p), 'utf8');
const readBase = (p) => fs.readFileSync(path.join(BASE, p), 'utf8');
const SRV = read('server.js');
const APP = read('public/app.js');
const IDX = read('public/index.html');
const IDXEN = read('public/en/index.html');
const CSS = read('public/styles.css');
const PRUEBA = read('public/prueba.html');
const PRUEBAEN = read('public/en-prueba.html');
const FUND = read('public/fundadores.html');
const FUNDEN = read('public/en-fundadores.html');
const GUEST = read('guest-trial.js');

let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const occ = (s, sub) => s.split(sub).length - 1;
const lineWith = (s, sub) => s.split('\n').find((l) => l.includes(sub)) || '';

// ---- A. El prompt del chat dice los hechos nuevos ----
t(occ(SRV, 'Precio: USD 199 por mes') === 1, 'A1 server.js: precio ES USD 199 x1');
t(occ(SRV, 'Lanzamiento: 1 de diciembre de 2026') === 1, 'A2 server.js: lanzamiento ES 1/12/2026 x1');
t(occ(SRV, 'Price: USD 199 per month') === 1, 'A3 server.js: precio EN USD 199 x1');
t(occ(SRV, 'Launch: December 1, 2026') === 1, 'A4 server.js: lanzamiento EN Dec 1, 2026 x1');
t(lineWith(SRV, 'Precio: USD 199 por mes').includes('Prueba gratis completa de 3 días'), 'A5 línea ES: prueba de 3 días intacta en la misma línea');
t(lineWith(SRV, 'Price: USD 199 per month').includes('Full free 3-day trial'), 'A6 línea EN: trial de 3 días intacto en la misma línea');

// ---- B. Ningún hecho viejo vigente en los archivos servidos ----
const SERVED = [SRV, APP, IDX, IDXEN, CSS, PRUEBA, PRUEBAEN];
const servedOcc = (sub) => SERVED.reduce((n, s) => n + occ(s, sub), 0);
t(servedOcc('USD 200') === 0, 'B1 servidos: USD 200 x0');
t(servedOcc('200 por mes') === 0, 'B2 servidos: 200 por mes x0');
t(servedOcc('200 per month') === 0, 'B3 servidos: 200 per month x0');
t(servedOcc('1 de febrero de 2027') === 0, 'B4 servidos: 1 de febrero de 2027 x0');
t(servedOcc('February 1, 2027') === 0, 'B5 servidos: February 1, 2027 x0');
t(servedOcc('1 February 2027') === 0, 'B6 servidos: 1 February 2027 x0');

// ---- C. Lo legítimo intacto ----
t(occ(SRV, 'Posty USD 199 por mes') >= 2, 'C1 server.js: bloque VENTA USD 199 intacto (x2+)');
t(occ(FUND, '1 de diciembre de 2026') >= 1, 'C2 fundadores.html: 1 de diciembre de 2026 intacto');
t(occ(FUNDEN, 'December 1, 2026') >= 1, 'C3 en-fundadores.html: December 1, 2026 intacto');
t(occ(SRV, 'TRIAL_DAYS = 3') === 1, 'C4 server.js: TRIAL_DAYS = 3 intacto');
t(occ(GUEST, 'TRIAL_DAYS_GUEST = 3') === 1, 'C5 guest-trial.js: TRIAL_DAYS_GUEST = 3 intacto');
t(occ(APP, 'Probar 3 días gratis') >= 1, 'C6 app.js: trialCta ES 3 días intacto');
t(occ(APP, 'Try 3 days free') >= 1, 'C7 app.js: trialCta EN 3 days intacto');
t(occ(IDX, '3 días gratis') >= 1, 'C8 index ES: hero-note 3 días gratis intacto');

// ---- D. Estampado ----
t(occ(SRV, "20261105-v969") === 1, 'D1 server.js: BUILD v969 x1');
t(occ(SRV, "20261105-v968") === 0, 'D2 server.js: BUILD v968 x0');
t(occ(IDX, 'app.js?v=671') === 1, 'D3 index ES: app.js?v=671 intacto (el lote no toca app.js)');
t(occ(IDX, 'styles.css?v=20261270') === 1, 'D4 index ES: styles?v=20261270 intacto');
t(occ(IDXEN, 'styles.css?v=20261270') === 1, 'D5 index EN: styles?v=20261270 intacto');
t(occ(IDXEN, 'app.js?v=') === 0, 'D6 index EN: sin app.js?v=');
t(occ(IDX, 'app.js?v=') === 1 && occ(SRV, 'app.js?v=') === 0, 'D7 sin bump de ?v=: solo el 671 heredado en index ES, ninguno en server.js');
t(occ(IDX, 'styles.css?v=') === 1 && occ(IDXEN, 'styles.css?v=') === 1, 'D8 sin bump de styles: solo el 20261270 heredado en cada index');

// ---- E. M78: 0/0 (literales, sin llamadas nuevas) ----
const esLine = lineWith(SRV, 'Precio: USD 199 por mes');
const enLine = lineWith(SRV, 'Price: USD 199 per month');
t(!esLine.includes('(') && !enLine.includes('('), 'E1 líneas cambiadas: literales puros, sin paréntesis (sin llamadas)');
t(esLine.trim().startsWith("'- Precio:") && enLine.trim().startsWith("'- Price:"), 'E2 líneas cambiadas: elementos del array de prompt, no código');
console.log('== E. M78: funciones auditadas: 0/0 (sin llamadas nuevas) ==');

// ---- F. Diff release/ vs base-v968 = exactamente server.js + suite nueva ----
function walk(dir, base) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(rel);
  }
  return out;
}
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const relFiles = walk(TREE, TREE).filter((f) => f !== 'test-lote-hechos-prompt-chat.js');
const baseFiles = walk(BASE, BASE);
const changed = [];
for (const f of relFiles) {
  if (!baseFiles.includes(f)) changed.push('solo-release:' + f);
  else if (md5(path.join(TREE, f)) !== md5(path.join(BASE, f))) changed.push(f);
}
const suiteInRelease = fs.existsSync(path.join(TREE, 'test-lote-hechos-prompt-chat.js'));
t(changed.length === 1 && changed[0] === 'server.js', 'F1 difieren exactamente: server.js (resto idéntico a base-v968) — ' + JSON.stringify(changed));
t(suiteInRelease, 'F2 suite nueva presente en release/');
const baseSrvLines = readBase('server.js').split('\n');
const relSrvLines = SRV.split('\n');
t(baseSrvLines.length === relSrvLines.length, 'F3 server.js: mismo número de líneas que base (' + baseSrvLines.length + ')');
let diffLines = 0;
for (let i = 0; i < baseSrvLines.length; i++) if (baseSrvLines[i] !== relSrvLines[i]) diffLines++;
t(diffLines === 3, 'F4 server.js: exactamente 3 líneas cambiadas (ES + EN + BUILD), son ' + diffLines);

console.log('\ntest-lote-hechos-prompt-chat: ' + ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
