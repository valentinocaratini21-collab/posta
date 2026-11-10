#!/usr/bin/env node
/* test-hero-quiz-verdict.js — LOTE WEBSITE HERO + QUIZ (mock aprobado 10/11).
   El resultado del quiz se CALCULA con las respuestas del visitante, sin
   puntaje genérico ("A medias, irregular" murió). Cubre las 48 combinaciones
   (4 Q1 x 3 Q2 x 4 Q3) en ES y en EN, sobre la función pura de app.js, y
   verifica que las dos copias inline (index.html ES, en/index.html EN)
   produzcan EXACTAMENTE lo mismo.
   Corre con: node test-hero-quiz-verdict.js (sin deps, lee el árbol). */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const idx = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');

let ok = 0, bad = 0;
function t(cond, name) {
  if (cond) { ok++; }
  else { bad++; console.log('FAIL:', name); }
}

// 1. Extraer la función pura de app.js (PP_STR + ppVerdictText).
const a = app.indexOf('var PP_POST_VAL');
const b = app.indexOf('function ppRenderVerdict');
const endFn = app.indexOf('\n}', app.indexOf('function ppRenderVerdict')) + 2;
t(a > 0 && b > a && endFn > b, 'ppVerdictText extraíble de app.js');
const ppVerdictText = new Function(app.slice(a, endFn) + '; return ppVerdictText;')();

// 2. Las 48 combinaciones por idioma: N = 7 - posteos; líneas con SUS números;
//    rama honesta solo si postea 5+ Y vendió esta semana; nada genérico.
const Q1 = [[0, '0'], [1, '1–2'], [2, '3–4'], [3, '5 o más']];
const Q1EN = [[0, '0'], [1, '1–2'], [2, '3–4'], [3, '5 or more']];
const Q2 = ['Menos de 1', '2–5', 'Más de 5'];
const Q2EN = ['Less than 1', '2–5', 'More than 5'];
const POST_VAL = [0, 1, 3, 5];
for (const lang of ['es', 'en']) {
  const q1 = lang === 'es' ? Q1 : Q1EN;
  const q2 = lang === 'es' ? Q2 : Q2EN;
  let n = 0;
  for (const [k, label] of q1) for (const h of q2) for (let c = 0; c < 4; c++) {
    n++;
    const v = ppVerdictText(lang, k, label, h, c);
    const empty = 7 - POST_VAL[k];
    const txt = v.big.replace(/<[^>]+>/g, '') + '|' + v.lines.join('|') + '|' + v.flip.replace(/<[^>]+>/g, '');
    const hot = POST_VAL[k] >= 5 && c === 0;
    const hotTxt = lang === 'es' ? 'sin que dependa de vos' : 'without it depending on you';
    if (!txt.includes('~' + empty)) { bad++; console.log('FAIL:', lang, k, h, c, 'big N=' + empty, '=>', txt); }
    else if (!txt.includes(label) || !txt.includes(h)) { bad++; console.log('FAIL:', lang, k, h, c, 'falta label', '=>', txt); }
    else if (!txt.includes(String(empty))) { bad++; console.log('FAIL:', lang, k, h, c, 'faltan días vacíos', '=>', txt); }
    else if (hot !== txt.includes(hotTxt)) { bad++; console.log('FAIL:', lang, k, h, c, 'rama honesta', '=>', txt); }
    else if (/A medias|irregular|Half-done/.test(txt)) { bad++; console.log('FAIL:', lang, k, h, c, 'puntaje genérico', '=>', txt); }
    else ok++;
  }
  t(n === 48, lang + ' 48 combinaciones');
}

// 3. Paridad: las copias inline (ES + EN) dan EXACTAMENTE lo mismo que app.js.
function extractInline(html) {
  const m = html.match(/var S=\{.*?\};var VAL=\[0,1,3,5\];function verdict\(a\)\{.*?\}\}/s);
  if (!m) return null;
  return new Function(m[0] + '; return verdict;')();
}
for (const [html, lang, name] of [[idx, 'es', 'shell ES'], [idxEn, 'en', 'EN']]) {
  const verdict = extractInline(html);
  t(typeof verdict === 'function', name + ': verdict inline extraíble');
  if (!verdict) continue;
  const q1 = lang === 'es' ? Q1 : Q1EN;
  const q2 = lang === 'es' ? Q2 : Q2EN;
  let same = 0;
  for (const [k, label] of q1) for (const h of q2) for (let c = 0; c < 4; c++) {
    const got = verdict([{ k, v: label }, { k: h, v: q2[h] }, { k: c, v: '' }]);
    const want = ppVerdictText(lang, k, label, q2[h], c);
    if (JSON.stringify(got) === JSON.stringify(want)) same++;
    else { bad++; console.log('FAIL:', name, 'diverge', k, h, c, JSON.stringify(got)); }
  }
  t(same === 48, name + ': 48/48 idénticas a app.js (tiene ' + same + ')');
}

// 4. Muestras exactas del mock (el número ES el resultado).
t(JSON.stringify(ppVerdictText('es', 1, '1–2', '2–5', 1)).includes('Perdés ~<span>6 posteos</span> por semana.'), 'mock ES: 1–2 posteos -> Perdés ~6');
t(JSON.stringify(ppVerdictText('es', 3, '5 o más', '2–5', 0)).includes('lo mismo, todos los días, sin que dependa de vos.'), 'mock ES: 5+ y vendió -> rama honesta');
t(JSON.stringify(ppVerdictText('en', 1, '1–2', '2–5', 1)).includes('You’re losing ~<span>6 posts</span> a week.'), 'mock EN: 1–2 posts -> losing ~6');

console.log('hero-quiz-verdict: ' + ok + ' ok, ' + bad + ' fail');
process.exit(bad ? 1 : 0);
