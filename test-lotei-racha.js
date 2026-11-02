// test-lotei-racha.js — LOTE «i»-RACHA: el botón «i» vive en la fila de la racha
// Uso: node test-lotei-racha.js  (desde la raíz del árbol)
// Decisión de Valentino 1/11: la «i» pasa de la fila del usuario a la
// misma fila de «N semanas seguidas publicando». La fila de la racha
// existe siempre que hay usuario; el texto de la racha sale SOLO con
// racha real >= 2 (nunca inventada); el botón va siempre al final de
// la fila. Refinamiento: sin racha, la fila NO queda con el botón solo
// (parecería que falta algo): botón «i» + la etiqueta «¿Cómo publica
// Posty?» (el título de la hoja, sin inventar copy), todo tocable
// como un solo botón. La hoja (pzPubInfoHTML) y el handler
// (pzPubInfoOpen) NO cambian.
// La audiencia no cambia: sin usuario no hay fila ni botón, como antes.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

/* ---------- 1. Estructura estática ---------- */
console.log('— estructura: botón en la racha, fuera de la fila del usuario —');
const hh = extractFn(app, 'function homeHeadHTML');
ok(!!hh, 'extrae homeHeadHTML');
const userDiv = (() => {
  const a = hh.indexOf('<div class="hf-user">');
  if (a < 0) return '';
  return hh.slice(a, hh.indexOf('</div>', a) + 6);
})();
ok(!userDiv.includes('hf-info-btn'), 'la fila hf-user NO contiene el botón «i»');
ok(hh.includes('hf-racha') && hh.includes('hf-info-btn'), 'la cabecera contiene fila hf-racha + botón «i»');
ok(hh.includes('const infoBtnHTML') && hh.includes('const infoRowHTML'), 'el botón vive en infoBtnHTML (con racha) e infoRowHTML (sin racha)');
ok((app.match(/hf-info-btn/g) || []).length === 2, 'dos sitios del botón en app.js (las dos consts, ambas en homeHeadHTML)');
ok((app.match(/pzPubInfoOpen/g) || []).length === 3, 'pzPubInfoOpen: definición + 2 onclicks, sin duplicar');
ok(css.includes('.hf-info-row{display:inline-flex'), 'CSS del botón con etiqueta .hf-info-row presente');
ok(hh.includes('Number(opts.racha) >= 2'), 'la condición de racha >= 2 sigue intacta');
ok(css.includes('.hf-racha{font-size:13px;font-weight:700;color:#0A1E33'), 'prefijo de la regla .hf-racha intacto (test-feed-16-17)');
ok(css.includes('.hf-racha{font-size:13px;font-weight:700;color:#0A1E33;margin-top:8px;display:flex;align-items:center;gap:8px}'), 'la fila de la racha es flex con gap');
ok(css.includes('.hf-racha .hf-info-btn{margin-left:0}'), 'en la fila, el botón sin margin-left duplicado (el gap separa)');
ok(css.includes('.hf-racha{color:#0A1E33}'), 'regla oscura .hf-racha navy intacta (test-lote13)');
ok(css.includes('.hf-info-btn{') && css.includes('width:24px'), 'el botón sigue siendo 24px en vidrio');

/* ---------- 2. Render real de homeHeadHTML ---------- */
console.log('— render: fila siempre, texto solo con racha —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const pzDecEnt = extractFn(app, 'function pzDecEnt');
ok(!!escLine && !!pzDecEnt, 'extrae esc + pzDecEnt');
const ctx = { console, pzIc: (n) => '<i data-ic="' + n + '"></i>' };
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + pzDecEnt + '\n' + hh, ctx);
const H = ctx.homeHeadHTML;
const base = { username: 'test.ok', name: 'Test Ok', pic: 'x.jpg',
  posts_count: 120, followers: 5432, following: 321, is_verified: true };
const rachaRow = (html) => {
  const a = html.indexOf('<div class="hf-racha">');
  if (a < 0) return '';
  return html.slice(a, html.indexOf('</div>', a) + 6);
};

// R1: con racha 3 -> texto + botón DESPUÉS del texto.
const r1 = H(Object.assign({}, base), '', { splitHead: true, racha: 3 });
const row1 = rachaRow(r1);
ok(!!row1, 'R1 fila hf-racha presente con racha 3');
ok(row1.includes('3 semanas seguidas publicando'), 'R1 texto «3 semanas seguidas publicando»');
ok(row1.indexOf('semanas seguidas') < row1.indexOf('hf-info-btn'), 'R1 el botón va DESPUÉS del texto');
ok(row1.includes('onclick="pzPubInfoOpen()"'), 'R1 el botón llama a pzPubInfoOpen');
ok(row1.includes('¿Cómo publica Posty?'), 'R1 aria ES «¿Cómo publica Posty?»');
ok(r1.includes('hf-user') && r1.indexOf('hf-user') < r1.indexOf('hf-racha'), 'R1 la fila del usuario sigue antes que la de la racha');

// R2: racha 1 -> fila con UN SOLO botón: círculo «i» + etiqueta
// (título de la hoja, sin copy nuevo). Nada de botón solo.
const r2 = H(Object.assign({}, base), '', { splitHead: true, racha: 1 });
const row2 = rachaRow(r2);
ok(!!row2, 'R2 fila hf-racha presente con racha 1');
ok(row2.includes('<button type="button" class="hf-info-row"'), 'R2 un solo botón .hf-info-row');
ok(row2.includes('¿Cómo publica Posty?'), 'R2 etiqueta «¿Cómo publica Posty?»');
ok(row2.indexOf('hf-info-btn') < row2.indexOf('hf-info-row-txt'), 'R2 el círculo va antes que la etiqueta');
ok(!row2.includes('<button type="button" class="hf-info-btn"'), 'R2 sin botón «i» pelado');
ok((row2.match(/onclick="pzPubInfoOpen\(\)"/g) || []).length === 1, 'R2 un solo onclick en la fila');
ok(!row2.includes('semanas seguidas'), 'R2 sin texto de racha con racha 1 (no se inventa)');

// R3: sin racha -> igual que R2.
const r3 = H(Object.assign({}, base), '', { splitHead: true });
const row3 = rachaRow(r3);
ok(!!row3, 'R3 fila hf-racha presente sin racha');
ok(row3.includes('<button type="button" class="hf-info-row"') && row3.includes('¿Cómo publica Posty?') && !row3.includes('semanas seguidas'), 'R3 botón con etiqueta, sin texto de racha');

// R4: racha 0 -> igual que sin racha.
const r4 = H(Object.assign({}, base), '', { splitHead: true, racha: 0 });
const row4 = rachaRow(r4);
ok(!!row4 && row4.includes('<button type="button" class="hf-info-row"') && !row4.includes('semanas seguidas'), 'R4 racha 0: botón con etiqueta, sin texto');

// R5: borde racha 2 -> texto presente.
const r5 = H(Object.assign({}, base), '', { splitHead: true, racha: 2 });
ok(rachaRow(r5).includes('2 semanas seguidas publicando'), 'R5 borde: racha 2 sí muestra el texto');

// R6: sin usuario -> sin fila, sin botón, sin crash (misma audiencia que antes).
const r6 = H({ name: 'X', pic: 'x.jpg', posts_count: 1, followers: 2 }, '', { splitHead: true, racha: 5 });
ok(typeof r6 === 'string' && !r6.includes('hf-racha') && !r6.includes('hf-info-btn'), 'R6 sin usuario: ni fila ni botón (audiencia intacta)');

// R7: tic + racha conviven (tic en hf-user, botón en hf-racha).
const r7 = H(Object.assign({}, base), '', { splitHead: true, racha: 4 });
ok(r7.includes('hf-verified'), 'R7 el tic sigue en la cabecera');
ok(rachaRow(r7).includes('hf-info-btn') && rachaRow(r7).includes('4 semanas seguidas publicando'), 'R7 tic + racha + botón conviven');
ok(r7.includes('hf-stats'), 'R7 bloque de stats intacto');
ok(r7.includes('>5.432<'), 'R7 seguidores intactos');

// R8: espejo EN.
const r8 = H(Object.assign({}, base), '', { splitHead: true, racha: 4, en: true });
const row8 = rachaRow(r8);
ok(row8.includes('4 weeks in a row posting'), 'R8 EN «4 weeks in a row posting»');
ok(row8.indexOf('weeks in a row') < row8.indexOf('hf-info-btn'), 'R8 EN el botón va después del texto');
ok(row8.includes('How does Posty publish?'), 'R8 EN aria «How does Posty publish?»');

// R9: espejo EN sin racha -> botón con etiqueta EN.
const r9 = H(Object.assign({}, base), '', { splitHead: true, en: true });
const row9 = rachaRow(r9);
ok(row9.includes('<button type="button" class="hf-info-row"') && row9.includes('How does Posty publish?') && !row9.includes('weeks in a row'), 'R9 EN sin racha: botón con etiqueta, sin texto');

/* ---------- 3. La hoja no cambió ---------- */
console.log('— hoja pzPubInfoHTML intacta (textos exactos ES/EN) —');
const esLines = [
  '¿Cómo publica Posty?',
  'Posty publica solo tus posteos programados (piloto automático).',
  'Si no confirmaste un posteo, te avisa 30 minutos antes, por si querés frenarlo.',
  'Si lo confirmaste antes, sale sin aviso.',
  'Si no lo confirmás, igual sale a su hora.',
  'En modo manual, nada sale sin tu OK.',
];
const enLines = [
  'How does Posty publish?',
  'Posty publishes your scheduled posts on its own (autopilot).',
  "If you haven't confirmed a post, it warns you 30 minutes before, in case you want to stop it.",
  'If you confirmed it earlier, it goes out without notice.',
  "If you don't confirm it, it still goes out on time.",
  'In manual mode, nothing goes out without your OK.',
];
for (const l of esLines) ok(app.includes(l), 'hoja ES contiene: ' + l.slice(0, 40));
for (const l of enLines) ok(app.includes(l), 'hoja EN contiene: ' + l.slice(0, 40));
ok(app.includes('Entendido') && app.includes('Got it'), 'cierre «Entendido»/«Got it» intacto');
const openFn = extractFn(app, 'function pzPubInfoOpen');
ok(openFn.includes('hfSheetShow(pzPubInfoHTML(en))'), 'pzPubInfoOpen abre la hoja con el idioma de la cuenta');

/* ---------- 4. Censo v533 sin drift ---------- */
console.log('— censo v533 —');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, re) => (s.match(re) || []).length;
ok(cnt(srv, /catsMatch/g) === 3, 'server catsMatch 3');
ok(cnt(srv, /week-redo/g) === 16, 'server week-redo 16');
ok(cnt(srv, /first_week/g) === 3, 'server first_week 3');
ok(cnt(srv, /\/aprobar/g) === 16, 'server /aprobar 16');
ok(cnt(app, /pzGoBack/g) === 4, 'app pzGoBack 4');
ok(cnt(app, /pz-detalle-setup/g) === 1, 'app pz-detalle-setup 1');
ok(cnt(app, /\/aprobar/g) === 1, 'app /aprobar 1');
ok(cnt(app, /autofetch/g) === 0, 'app autofetch 0');

console.log(`\nLOTE «i»-RACHA: ${pass} OK, ${fail} FALLOS`);
process.exit(fail ? 1 : 0);
