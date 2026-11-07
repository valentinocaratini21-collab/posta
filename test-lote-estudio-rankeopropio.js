// test-lote-estudio-rankeopropio.js — MEJORA 2 ESTUDIO-PROFUNDO: RANKEO PROPIO
// (aprobado Valentino 7/11 ~16:00 «Perfecto! Arma todo»).
//
// Para cada uno de los últimos 12 posteos del cliente, tasa de respuesta
// contra el promedio PROPIO del cliente; top 3 con el POR QUÉ (formato,
// gancho, tema, hora). Los temas del top 3 refuerzan productos en el
// fundamento (extiende la garantía #6 de rubro-garantias.js, procedencia
// «tu feed»). Sin dato de seguidores la tasa queda documentada como no
// calculable, nunca inventada. No toca las 5 preguntas, su orden, la
// condicional de ubicación por email ni el flujo de onboarding.
//
// FÓRMULA EXACTA:
//   tasa_respuesta(post) = (likes + comentarios) / seguidores
//   promedio_propio      = media de tasa_respuesta sobre los posteos
//                          medibles de los últimos 12
//   vs_promedio(post)    = tasa_respuesta(post) / promedio_propio
//   top 3                = mayor vs_promedio (desempate: más respuesta
//                          absoluta, luego más reciente)
// Un posteo es medible solo si likes Y comentarios son números finitos;
// si falta uno, queda fuera del promedio y se marca (nunca se inventa).
// Sin seguidores (null/0/no finito) no hay tasa: calculable=false.
// Si el promedio propio es 0 (nadie respondió a nada), no hay top 3 que
// reforzar: top3=[] con nota que lo documenta.
//
// Uso: node test-lote-estudio-rankeopropio.js            (árbol actual)
//      BASE=/ruta/al/arbol node test-lote-estudio-rankeopropio.js
// En el árbol v760 sin tocar debe FALLAR (no existe study-ranking.js ni
// top_posts en el estudio). Con la mejora debe dar 0 fallos.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const BASE = process.env.BASE || __dirname;
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('OK  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 500) : '')); }
}
const approx = (a, b, eps) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;

// Extrae una función por conteo de llaves desde su firma (mismo patrón
// que test-lote-onboarding-divertido.js).
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let j = i, dPar = 0, seenParen = false, bodyStart = -1;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '(') { dPar++; seenParen = true; }
    else if (c === ')') dPar--;
    else if (c === '{' && (!seenParen || dPar === 0)) { bodyStart = j; break; }
  }
  if (bodyStart < 0) return null;
  let d = 0;
  for (j = bodyStart; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

// ---------- fixtures: 12 posteos con engagement conocido ----------
// Orden del embed: más reciente primero. Seguidores = 1000.
// engagement = likes + comentarios; tasa = engagement / 1000.
// Suma engagement = 1984 → promedio_tasa = 1984/12/1000 = 0.165333...
// Por likes SOLO ganaría P02 (500); por TASA gana P03 (550 de respuesta).
function tsUTC3(y, mo, d, hUTC3, mi) {
  return Math.floor(Date.UTC(y, mo - 1, d, hUTC3 + 3, mi || 0, 0) / 1000);
}
function fixture12() {
  return [
    { shortcode: 'P01', type: 'GraphImage', likes: 120, comments: 30, taken_at: tsUTC3(2026, 11, 6, 9), caption: 'Café de la mañana, recién hecho #cafe' },
    { shortcode: 'P02', type: 'GraphImage', likes: 500, comments: 2, taken_at: tsUTC3(2026, 11, 5, 10), caption: 'Torta casera de chocolate #torta #casera' },
    { shortcode: 'P03', type: 'GraphVideo', likes: 300, comments: 250, taken_at: tsUTC3(2026, 11, 4, 18), caption: '¿Probaste nuestro café de especialidad? #cafe #especialidad' },
    { shortcode: 'P04', type: 'GraphSidecar', likes: 200, comments: 100, taken_at: tsUTC3(2026, 11, 3, 20), caption: 'Nuestro brunch de domingo #brunch #domingo' },
    { shortcode: 'P05', type: 'GraphImage', likes: 90, comments: 10, taken_at: tsUTC3(2026, 11, 2, 8), caption: 'El pan recién salido del horno #panaderia' },
    { shortcode: 'P06', type: 'GraphImage', likes: 80, comments: 20, taken_at: tsUTC3(2026, 11, 1, 12), caption: 'Promo de la semana #promo' },
    { shortcode: 'P07', type: 'GraphVideo', likes: 60, comments: 5, taken_at: tsUTC3(2026, 10, 31, 15), caption: 'Así preparamos tu pedido #pedido' },
    { shortcode: 'P08', type: 'GraphImage', likes: 50, comments: 50, taken_at: tsUTC3(2026, 10, 30, 19), caption: '¿Cuál es tu favorito? #encuesta' },
    { shortcode: 'P09', type: 'GraphImage', likes: 40, comments: 0, taken_at: tsUTC3(2026, 10, 29, 11), caption: 'Nuevo horario de atención' },
    { shortcode: 'P10', type: 'GraphSidecar', likes: 30, comments: 10, taken_at: tsUTC3(2026, 10, 28, 17), caption: 'Detrás de escena #equipo' },
    { shortcode: 'P11', type: 'GraphImage', likes: 20, comments: 5, taken_at: tsUTC3(2026, 10, 27, 13), caption: 'Gracias por venir #gracias' },
    { shortcode: 'P12', type: 'GraphImage', likes: 10, comments: 2, taken_at: tsUTC3(2026, 10, 26, 9), caption: 'Buen lunes #lunes' },
  ];
}
const AVG_TASA = 1984 / 12 / 1000; // 0.165333...

// ---------- A) módulo nuevo study-ranking.js ----------
console.log('— A) study-ranking.js —');
let sr = null, srErr = null;
try { sr = require(path.join(BASE, 'study-ranking.js')); }
catch (e) { srErr = e.message; }
ok('A0 existe study-ranking.js y exporta rankOwnPosts', !!sr && typeof sr.rankOwnPosts === 'function', srErr || '');
if (sr) {
  const r = sr.rankOwnPosts(fixture12(), 1000, { lang: 'es' });
  ok('A1 calculable con seguidores: n_posts 12, n_medibles 12', r && r.calculable === true && r.n_posts === 12 && r.n_medibles === 12, JSON.stringify(r && { calculable: r.calculable, n_posts: r.n_posts, n_medibles: r.n_medibles }));
  ok('A1 promedio propio = media de tasas (0.1653)', r && approx(r.promedio_tasa, AVG_TASA, 0.0001), 'promedio=' + (r && r.promedio_tasa));
  ok('A1 top 3 por TASA: P03, P02, P04 (no por likes solos)', r && r.top3 && r.top3.map((x) => x.shortcode).join(',') === 'P03,P02,P04', JSON.stringify(r && r.top3 && r.top3.map((x) => x.shortcode)));
  ok('A1 el líder por likes (P02, 500) NO es el top 1 por tasa', r && r.top3 && r.top3[0].shortcode === 'P03' && r.top3[1].shortcode === 'P02', JSON.stringify(r && r.top3 && r.top3.map((x) => x.shortcode)));
  ok('A1 top 1 vs_promedio ≈ 3.33 (0.55 / 0.1653)', r && r.top3 && approx(r.top3[0].vs_promedio, 0.55 / AVG_TASA, 0.01), 'vs=' + (r && r.top3 && r.top3[0].vs_promedio));
  ok('A1 ranking completo ordenado por tasa desc (12 entradas)', r && Array.isArray(r.ranking) && r.ranking.length === 12 && r.ranking[0].shortcode === 'P03' && r.ranking[11].shortcode === 'P12', JSON.stringify(r && r.ranking && r.ranking.map((x) => x.shortcode)));
  const t1 = r && r.top3 && r.top3[0];
  ok('A1 porqué top 1: formato video (reel)', t1 && t1.formato === 'video', JSON.stringify(t1 && t1.formato));
  ok('A1 porqué top 1: gancho con pregunta (¿Probaste…?)', t1 && t1.gancho_es_pregunta === true && typeof t1.gancho === 'string' && t1.gancho.length > 0 && t1.gancho.includes('Probaste'), JSON.stringify(t1 && { gancho: t1.gancho, pregunta: t1.gancho_es_pregunta }));
  ok('A1 porqué top 1: tema cafe (de #cafe) + palabras del tema', t1 && t1.tema === 'cafe' && Array.isArray(t1.tema_palabras) && t1.tema_palabras.includes('cafe') && t1.tema_palabras.includes('especialidad'), JSON.stringify(t1 && { tema: t1.tema, palabras: t1.tema_palabras }));
  ok('A1 porqué top 1: hora 18 (UTC-3) + franja tarde', t1 && t1.hora === 18 && t1.franja === 'tarde', JSON.stringify(t1 && { hora: t1.hora, franja: t1.franja }));
  const t2 = r && r.top3 && r.top3[1];
  ok('A1 porqué top 2: formato imagen, tema torta, hora 10 mañana', t2 && t2.formato === 'imagen' && t2.tema === 'torta' && t2.hora === 10 && t2.franja === 'mañana', JSON.stringify(t2 && { formato: t2.formato, tema: t2.tema, hora: t2.hora, franja: t2.franja }));
  const t3 = r && r.top3 && r.top3[2];
  ok('A1 porqué top 3: formato carrusel, tema brunch, hora 20 noche', t3 && t3.formato === 'carrusel' && t3.tema === 'brunch' && t3.hora === 20 && t3.franja === 'noche', JSON.stringify(t3 && { formato: t3.formato, tema: t3.tema, hora: t3.hora, franja: t3.franja }));
  ok('A1 cada top lleva procedencia «tu feed» + id del posteo', r && r.top3 && r.top3.every((x) => x.procedencia === 'tu feed' && typeof x.shortcode === 'string' && x.shortcode.length > 0), JSON.stringify(r && r.top3 && r.top3.map((x) => x.procedencia)));
  ok('A1 cada top lleva caption_head + taken_at (trazabilidad)', r && r.top3 && r.top3.every((x) => typeof x.caption_head === 'string' && x.caption_head.length > 0 && typeof x.taken_at === 'number' && x.taken_at > 0), JSON.stringify(r && r.top3 && r.top3.map((x) => x.caption_head)));

  // Sin seguidores: no calculable, nunca inventado.
  const rSin = sr.rankOwnPosts(fixture12(), null, { lang: 'es' });
  ok('A2 sin seguidores: calculable=false, top3 vacío, promedio null', rSin && rSin.calculable === false && Array.isArray(rSin.top3) && rSin.top3.length === 0 && rSin.promedio_tasa === null, JSON.stringify(rSin && { calculable: rSin.calculable, top3: rSin.top3, promedio: rSin.promedio_tasa }));
  ok('A2 sin seguidores: motivo sin_seguidores + nota que lo documenta', rSin && rSin.motivo_no_calculable === 'sin_seguidores' && typeof rSin.nota === 'string' && rSin.nota.toLowerCase().includes('seguidores'), JSON.stringify(rSin && { motivo: rSin.motivo_no_calculable, nota: rSin.nota }));
  ok('A2 sin seguidores: ninguna tasa inventada (ranking vacío o tasas null)', rSin && (!Array.isArray(rSin.ranking) || rSin.ranking.length === 0 || rSin.ranking.every((x) => x.tasa === null)), JSON.stringify(rSin && rSin.ranking));
  ok('A2 sin seguidores: n_medibles sigue siendo veraz (12, la medibilidad no depende de seguidores)', rSin && rSin.n_medibles === 12, JSON.stringify(rSin && { n_medibles: rSin.n_medibles }));
  const rCero = sr.rankOwnPosts(fixture12(), 0, { lang: 'es' });
  ok('A2 seguidores=0: igual que sin dato (no se divide por cero)', rCero && rCero.calculable === false && rCero.motivo_no_calculable === 'sin_seguidores', JSON.stringify(rCero && { calculable: rCero.calculable, motivo: rCero.motivo_no_calculable }));

  // Posteo sin datos de engagement: fuera del promedio, marcado.
  const sinDatos = fixture12().map((p) => ({ ...p }));
  sinDatos[4] = { ...sinDatos[4], likes: null, comments: null };
  const rSD = sr.rankOwnPosts(sinDatos, 1000, { lang: 'es' });
  ok('A3 posteo sin likes/comments: n_medibles 11, promedio sobre 11', rSD && rSD.n_medibles === 11 && approx(rSD.promedio_tasa, (1984 - 100) / 11 / 1000, 0.0001), JSON.stringify(rSD && { n_medibles: rSD.n_medibles, promedio: rSD.promedio_tasa }));
  ok('A3 posteo sin datos: tasa null y motivo sin_datos en el ranking', rSD && Array.isArray(rSD.ranking) && rSD.ranking.some((x) => x.shortcode === 'P05' && x.tasa === null), JSON.stringify(rSD && rSD.ranking && rSD.ranking.filter((x) => x.shortcode === 'P05')));

  // Ventana: solo los últimos 12 (el 13º, más viejo, no entra aunque arrase).
  const trece = fixture12();
  trece.push({ shortcode: 'P13', type: 'GraphImage', likes: 10000, comments: 5000, taken_at: tsUTC3(2026, 10, 20, 9), caption: 'Viejo con engagement gigante #viejo' });
  const r13 = sr.rankOwnPosts(trece, 1000, { lang: 'es' });
  ok('A4 ventana de 12: el 13º (más viejo, 15000 de respuesta) no entra', r13 && r13.n_posts === 12 && !r13.ranking.some((x) => x.shortcode === 'P13') && r13.top3.map((x) => x.shortcode).join(',') === 'P03,P02,P04', JSON.stringify(r13 && { n_posts: r13.n_posts, top3: r13.top3.map((x) => x.shortcode) }));

  // Pocos medibles: top3 se achica, no se rellena.
  const dos = fixture12().slice(0, 2);
  const r2 = sr.rankOwnPosts(dos, 1000, { lang: 'es' });
  ok('A5 con 2 posteos: top3 tiene 2, sin relleno', r2 && r2.top3.length === 2 && r2.n_medibles === 2, JSON.stringify(r2 && { top3: r2.top3.length, n_medibles: r2.n_medibles }));

  // Sin respuesta en nada: calculable pero sin top que reforzar.
  const ceros = fixture12().map((p) => ({ ...p, likes: 0, comments: 0 }));
  const r0 = sr.rankOwnPosts(ceros, 1000, { lang: 'es' });
  ok('A6 todo en cero: calculable, promedio 0, top3 vacío con nota', r0 && r0.calculable === true && r0.promedio_tasa === 0 && r0.top3.length === 0 && typeof r0.nota === 'string' && r0.nota.length > 0, JSON.stringify(r0 && { calculable: r0.calculable, promedio: r0.promedio_tasa, top3: r0.top3.length, nota: r0.nota }));

  // Entradas vacías / basura: nunca lanza.
  let noThrow = true; let rVacio = null;
  try { rVacio = sr.rankOwnPosts([], 1000, { lang: 'es' }); } catch (e) { noThrow = false; }
  ok('A7 vacío: no lanza, calculable=false por sin_posteos_medibles', noThrow && rVacio && rVacio.calculable === false && rVacio.motivo_no_calculable === 'sin_posteos_medibles', JSON.stringify(rVacio && { calculable: rVacio.calculable, motivo: rVacio.motivo_no_calculable }));
  let noThrow2 = true;
  try { sr.rankOwnPosts(null, null, {}); sr.rankOwnPosts('basura', 'x', {}); } catch (e) { noThrow2 = false; }
  ok('A7 basura: no lanza', noThrow2);
}

// ---------- B) hook en trialStyleProfile (feed-audit.js real) ----------
console.log('— B) trialStyleProfile con rankeo —');
(async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'm2-ranking-'));
  process.env.DATA_DIR = TMP;
  let fa = null, faErr = null;
  try { fa = require(path.join(BASE, 'feed-audit.js')); }
  catch (e) { faErr = e.message; }
  ok('B0 feed-audit.js carga en proceso (DATA_DIR aislada)', !!fa && typeof fa.trialStyleProfile === 'function', faErr || '');
  if (fa) {
    const prof = await fa.trialStyleProfile(fixture12(), { bio: '', followers: 1000, posts_count: 12 }, { tone: 'vos', lang: 'es' });
    ok('B1 perfil con seguidores: top_posts P03,P02,P04', prof && Array.isArray(prof.top_posts) && prof.top_posts.map((x) => x.shortcode).join(',') === 'P03,P02,P04', JSON.stringify(prof && prof.top_posts && prof.top_posts.map((x) => x.shortcode)));
    ok('B1 perfil: ranking.calculable true + promedio 0.1653', prof && prof.ranking && prof.ranking.calculable === true && approx(prof.ranking.promedio_tasa, AVG_TASA, 0.0001), JSON.stringify(prof && prof.ranking));
    ok('B1 perfil: best_posts por likes SIGUE igual (P02 primero)', prof && Array.isArray(prof.best_posts) && prof.best_posts.length === 3 && prof.best_posts[0].shortcode === 'P02' && prof.best_posts[0].likes === 500, JSON.stringify(prof && prof.best_posts && prof.best_posts.map((x) => x.shortcode)));
    ok('B1 perfil: top_posts difiere de best_posts (tasa ≠ likes)', prof && prof.top_posts && prof.best_posts && prof.top_posts[0].shortcode !== prof.best_posts[0].shortcode, JSON.stringify({ top: prof.top_posts && prof.top_posts[0].shortcode, best: prof.best_posts && prof.best_posts[0].shortcode }));
    const profSin = await fa.trialStyleProfile(fixture12(), { bio: '', followers: null, posts_count: 12 }, { tone: 'vos', lang: 'es' });
    ok('B2 perfil sin seguidores: ranking no calculable, documentado', profSin && profSin.ranking && profSin.ranking.calculable === false && profSin.ranking.motivo_no_calculable === 'sin_seguidores' && typeof profSin.ranking.nota === 'string' && profSin.ranking.nota.toLowerCase().includes('seguidores'), JSON.stringify(profSin && profSin.ranking));
    ok('B2 perfil sin seguidores: top_posts vacío (no inventado)', profSin && Array.isArray(profSin.top_posts) && profSin.top_posts.length === 0, JSON.stringify(profSin && profSin.top_posts));
    const profVacio = await fa.trialStyleProfile([], {}, {});
    ok('B3 sin posts ni paleta web: sigue devolviendo null (no inventa)', profVacio === null, JSON.stringify(profVacio));
    // followersFromEmbedHtml: la fuente del prefill (mismo HTML del embed).
    ok('B4 followersFromEmbedHtml exportada', typeof fa.followersFromEmbedHtml === 'function');
    if (typeof fa.followersFromEmbedHtml === 'function') {
      const rawEsc = '{"user":{"followers_count":1234,"username":"x"}}'.replace(/"/g, '\\"');
      ok('B4 followersFromEmbedHtml: lee 1234 del HTML escapado del embed', fa.followersFromEmbedHtml(rawEsc) === 1234, String(fa.followersFromEmbedHtml(rawEsc)));
      ok('B4 followersFromEmbedHtml: lee del HTML plano también', fa.followersFromEmbedHtml('..."followers_count":987,...') === 987, String(fa.followersFromEmbedHtml('..."followers_count":987,...')));
      ok('B4 followersFromEmbedHtml: sin dato devuelve null (no inventa)', fa.followersFromEmbedHtml('sin nada') === null && fa.followersFromEmbedHtml('') === null && fa.followersFromEmbedHtml(null) === null);
    }
  }

  // ---------- C) server.js: parseTrialStyle + styleGoalLines ----------
  console.log('— C) fundamento: parseTrialStyle + styleGoalLines —');
  const srv = read('server.js');
  const ptsSrc = fnFrom(srv, 'function parseTrialStyle(');
  const sglSrc = fnFrom(srv, 'function styleGoalLines(');
  ok('C0 parseTrialStyle extraíble de server.js', !!ptsSrc, 'no encontrada');
  ok('C0 styleGoalLines extraíble de server.js', !!sglSrc, 'no encontrada');
  if (ptsSrc && sglSrc) {
    const ctx = vm.createContext({ console, JSON });
    vm.runInContext(ptsSrc + '\n' + sglSrc, ctx);
    const run = (code) => vm.runInContext(code, ctx);
    const styleFull = {
      posts_per_week: 4, avg_caption_words: 18, tone: 'vos',
      top_posts: [
        { shortcode: 'P03', likes: 300, comments: 250, tasa: 0.55, vs_promedio: 3.33, formato: 'video', gancho: '¿Probaste nuestro café de especialidad?', gancho_es_pregunta: true, tema: 'cafe', tema_palabras: ['cafe', 'especialidad'], hora: 18, franja: 'tarde', taken_at: 1700000000, caption_head: '¿Probaste nuestro café de especialidad?', procedencia: 'tu feed' },
        { shortcode: 'P02', likes: 500, comments: 2, tasa: 0.502, vs_promedio: 3.04, formato: 'imagen', gancho: 'Torta casera de chocolate', gancho_es_pregunta: false, tema: 'torta', tema_palabras: ['torta', 'casera'], hora: 10, franja: 'mañana', taken_at: 1700000000, caption_head: 'Torta casera de chocolate', procedencia: 'tu feed' },
        { shortcode: 'P04', likes: 200, comments: 100, tasa: 0.3, vs_promedio: 1.81, formato: 'carrusel', gancho: 'Nuestro brunch de domingo', gancho_es_pregunta: false, tema: 'brunch', tema_palabras: ['brunch', 'domingo'], hora: 20, franja: 'noche', taken_at: 1700000000, caption_head: 'Nuestro brunch de domingo', procedencia: 'tu feed' },
      ],
      ranking: { calculable: true, seguidores: 1000, promedio_tasa: 0.1653, n_posts: 12, n_medibles: 12, motivo_no_calculable: null, nota: 'Tasa de respuesta = (likes + comentarios) / seguidores; promedio propio de los últimos 12 posteos.' },
    };
    const parsed = run(`parseTrialStyle(${JSON.stringify(styleFull)})`);
    ok('C1 parseTrialStyle: conserva top_posts (3, saneados)', parsed && Array.isArray(parsed.top_posts) && parsed.top_posts.length === 3 && parsed.top_posts[0].shortcode === 'P03' && parsed.top_posts[0].vs_promedio === 3.33 && parsed.top_posts[0].tema === 'cafe', JSON.stringify(parsed && parsed.top_posts));
    ok('C1 parseTrialStyle: conserva ranking calculable + promedio', parsed && parsed.ranking && parsed.ranking.calculable === true && parsed.ranking.promedio_tasa === 0.1653 && parsed.ranking.seguidores === 1000, JSON.stringify(parsed && parsed.ranking));
    const parsedMalo = run(`parseTrialStyle(${JSON.stringify({ top_posts: [{ shortcode: 'OK1', tasa: 0.5, vs_promedio: 2 }, { shortcode: 5, tasa: 'x' }, 'basura', null], ranking: { calculable: 'si' } })})`);
    ok('C1 parseTrialStyle: descarta entradas rotas de top_posts, conserva la válida', parsedMalo && Array.isArray(parsedMalo.top_posts) && parsedMalo.top_posts.length === 1 && parsedMalo.top_posts[0].shortcode === 'OK1', JSON.stringify(parsedMalo && parsedMalo.top_posts));
    ok('C1 parseTrialStyle: ranking roto se descarta (no se guarda basura)', parsedMalo && (parsedMalo.ranking === undefined || parsedMalo.ranking === null), JSON.stringify(parsedMalo && parsedMalo.ranking));
    const linesEs = run(`styleGoalLines(${JSON.stringify(styleFull)}, 'es')`);
    ok('C2 styleGoalLines ES: nombra los temas del top 3 con procedencia «tu feed»', Array.isArray(linesEs) && linesEs.some((l) => l.includes('tu feed') && l.includes('cafe') && l.includes('torta')), JSON.stringify(linesEs));
    ok('C2 styleGoalLines ES: trae el vs_promedio (×3,3 del top 1)', Array.isArray(linesEs) && linesEs.some((l) => l.includes('3,3')), JSON.stringify(linesEs));
    ok('C2 styleGoalLines ES: trae el porqué (formato/hora del top)', Array.isArray(linesEs) && linesEs.some((l) => l.includes('video') || l.includes('reel')) && linesEs.some((l) => l.includes('18')), JSON.stringify(linesEs));
    const linesEn = run(`styleGoalLines(${JSON.stringify(styleFull)}, 'en')`);
    ok('C2 styleGoalLines EN: misma línea en inglés (your feed + 3.3)', Array.isArray(linesEn) && linesEn.some((l) => l.includes('your feed') && l.includes('3.3')), JSON.stringify(linesEn));
    const styleSin = { posts_per_week: 4, top_posts: [], ranking: { calculable: false, seguidores: null, promedio_tasa: null, n_posts: 12, n_medibles: 12, motivo_no_calculable: 'sin_seguidores', nota: 'Sin dato de seguidores: la tasa de respuesta no se puede calcular y no se inventa.' } };
    const linesSin = run(`styleGoalLines(${JSON.stringify(styleSin)}, 'es')`);
    ok('C3 styleGoalLines sin seguidores: documenta en el fundamento que no es calculable', Array.isArray(linesSin) && linesSin.some((l) => l.toLowerCase().includes('seguidores')), JSON.stringify(linesSin));
    ok('C3 styleGoalLines sin seguidores: NO inventa top 3', Array.isArray(linesSin) && !linesSin.some((l) => l.includes('top 3') || l.includes('Top 3')), JSON.stringify(linesSin));
    const linesVacio = run('styleGoalLines({}, \'es\')');
    ok('C4 styleGoalLines vacío: cero líneas (nunca inventa estilo)', Array.isArray(linesVacio) && linesVacio.length === 0, JSON.stringify(linesVacio));
    const linesSinRank = run(`styleGoalLines(${JSON.stringify({ posts_per_week: 4, palette_names: ['verde'] })}, 'es')`);
    ok('C4 styleGoalLines sin ranking: no agrega líneas de rankeo', Array.isArray(linesSinRank) && !linesSinRank.some((l) => l.includes('tu feed') || l.includes('top')), JSON.stringify(linesSinRank));
  }

  // ---------- D) front: mergeStyle conserva top_posts ----------
  console.log('— D) mergeStyle (prueba.html + en-prueba.html) —');
  for (const [tag, rel] of [['ES', 'public/prueba.html'], ['EN', 'public/en-prueba.html']]) {
    const html = read(rel);
    const msSrc = fnFrom(html, 'function mergeStyle(');
    ok(`D0 ${tag} mergeStyle extraíble`, !!msSrc, 'no encontrada');
    if (!msSrc) continue;
    const ctx = vm.createContext({ console, JSON });
    vm.runInContext(msSrc, ctx);
    const run = (code) => vm.runInContext(code, ctx);
    const igStyle = { palette_names: ['verde'], tone: 'vos', top_posts: [{ shortcode: 'P03', tema: 'cafe' }], ranking: { calculable: true, promedio_tasa: 0.1653 } };
    const webStyle = { palette_names: ['azul'], tone: 'neutral' };
    const m1 = run(`mergeStyle(${JSON.stringify(igStyle)}, ${JSON.stringify(webStyle)})`);
    ok(`D1 ${tag} mergeStyle: conserva top_posts de IG cuando la web no tiene`, m1 && Array.isArray(m1.top_posts) && m1.top_posts.length === 1 && m1.top_posts[0].shortcode === 'P03' && m1.ranking && m1.ranking.calculable === true, JSON.stringify(m1 && { top_posts: m1.top_posts, ranking: m1.ranking }));
    const m2 = run(`mergeStyle(${JSON.stringify(webStyle)}, ${JSON.stringify(igStyle)})`);
    ok(`D1 ${tag} mergeStyle: conserva top_posts de IG en el otro orden`, m2 && Array.isArray(m2.top_posts) && m2.top_posts.length === 1 && m2.top_posts[0].shortcode === 'P03', JSON.stringify(m2 && m2.top_posts));
    const m3 = run(`mergeStyle(null, ${JSON.stringify(igStyle)})`);
    ok(`D1 ${tag} mergeStyle(null, IG): devuelve el estilo de IG intacto`, m3 && Array.isArray(m3.top_posts) && m3.top_posts[0].shortcode === 'P03', JSON.stringify(m3 && m3.top_posts));
  }

  // ---------- E) censo estático de marcadores ----------
  console.log('— E) censo de marcadores —');
  const faSrc = read('feed-audit.js');
  ok('E0 study-ranking.js existe en el árbol', fs.existsSync(path.join(BASE, 'study-ranking.js')));
  ok('E0 feed-audit.js requiere study-ranking (hook del estudio)', faSrc.includes('study-ranking'));
  ok('E0 feed-audit.js expone top_posts en trialStyleProfile', faSrc.includes('top_posts'));
  ok('E0 server.js parseTrialStyle valida top_posts', !!(ptsSrc && ptsSrc.includes('top_posts')));
  ok('E0 server.js styleGoalLines refuerza con tu feed', !!(sglSrc && sglSrc.includes('tu feed')));

  console.log(`\nRANKEO-PROPIO: ${pass} ok, ${fail} fallos`);
  if (fails.length) console.log('Fallos:\n- ' + fails.join('\n- '));
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('SUITE ROTA:', e); process.exitCode = 1; });
