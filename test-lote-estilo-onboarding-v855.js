// test-lote-estilo-onboarding-v855.js — LOTE ESTILO-ONBOARDING v855 (9/11):
// Toque de estilo en el onboarding (mock onboarding-posty v4, aprobado por
// Valentino «me gusto mucho esto»). Después de las preguntas de huecos y
// antes de la semana, Posty muestra 3 imágenes del producto REAL del
// cliente, cada una en un estilo distinto (foto real limpia / titular
// grande en banda / editorial con mucho aire); el cliente elige TOCANDO
// una imagen — sin chips ni pregunta escrita. Las 3 imágenes se preparan
// en paralelo mientras responde (la foto se resuelve y se precarga en
// currentScreen + sprout). La elección define el estilo de la semana:
// limpia → 0 piezas con texto; banda → titular en todas las piezas
// imagen; editorial → dosificación del draft (2 por defecto) y la semana
// se presenta enmarcada. Sin foto real usable, el paso se salta sin
// romper el flujo. El onboarding sigue siendo 5 preguntas (este paso no
// agrega pregunta de formulario).
// El estilo se elige DESPUÉS del draft, así que manda sobre la ronda de
// texto del draft y sobre la campeona. Excepción preexistente: el póster
// es tipográfico por naturaleza y siempre lleva texto (misma regla que
// la dosificación del draft); en la configuración del test no hay póster.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-estilo-onboarding-v855.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path');
const demo = require('./demo');

// (v855 · NOTA) En este repo varias suites definen ok(cond, label) pero
// la llaman ok(label, cond): la etiqueta (string no vacío) es siempre
// truthy y todo «pasa» aunque la condición sea false. Esta suite define
// ok(label, cond) como se la llama, para que un fallo sea un fallo real.
let pass = 0, fail = 0; const fails = [];
const ok = (label, cond) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const has = (s, sub) => s.indexOf(sub) >= 0;
const cnt = (s, re) => (s.match(re) || []).length;
const es = fs.readFileSync(path.join(__dirname, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(__dirname, 'public', 'en-prueba.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const dmSrc = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');

function fnFrom(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

// ---------- S) estático: servidor ----------
console.log('— S) servidor —');
ok("S0 BUILD_ID es 20261105-v855", has(srv, "const BUILD_ID = '20261105-v855';"));
ok('S1 demo.js define parseEstiloVisual', has(dmSrc, 'function parseEstiloVisual(v)'));
ok('S1 demo.js exporta parseEstiloVisual', has(dmSrc, '  parseEstiloVisual,'));
ok('S2 buildDemoSpec acepta estiloVisual', has(dmSrc, 'firmaSinVideo = false, estiloVisual = null })'));
ok('S2 generateDemo acepta y reenvía estiloVisual', has(dmSrc, 'firmaSinVideo = false, estiloVisual = null }) {') && has(dmSrc, 'draft, firmaStyle, firmaSinVideo, estiloVisual })'));
ok('S3 server valida estilo_visual en /api/trial/generate', cnt(srv, /demo\.parseEstiloVisual\(fields\.estilo_visual\)/g) === 2);
ok('S3 server pasa estiloVisual a generateDemo', has(srv, 'firmaSinVideo, estiloVisual: ocEstiloVisual })'));
ok('S3 server pasa estiloVisual a buildDemoSpec (stream)', has(srv, 'firmaStyle: firmaCode, firmaSinVideo, estiloVisual: ocEstiloVisual })'));
ok('S4 payload de generateDemo lleva estilo_visual por posteo', cnt(dmSrc, /estilo_visual: \(specPosts\[i\] && specPosts\[i\]\.estilo_visual\) \|\| null/g) === 2);
ok('S4 payload del stream lleva estilo_visual por posteo', has(srv, 'estilo_visual: specPosts[i].estilo_visual || null,'));
ok('S5 buildDemoSpec registra estilo_visual en el spec', has(dmSrc, 'estilo_visual: estiloOK || null, styles: stylesN'));
ok('S5 buildDemoSpec anota estilo_visual por posteo', has(dmSrc, "if (estiloOK) specPosts.forEach((sp) => { sp.estilo_visual = estiloOK; });"));

// ---------- F) estático: front ES+EN ----------
console.log('— F) front ES+EN —');
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  ok(tag + ' (F) ocStyleShow existe', has(html, 'function ocStyleShow()'));
  ok(tag + ' (F) ocPrepareStyle existe', has(html, 'function ocPrepareStyle()'));
  ok(tag + ' (F) ocStylePhoto existe', has(html, 'function ocStylePhoto()'));
  ok(tag + ' (F) las 3 opciones con data-estilo', has(html, 'data-estilo="limpia"') && has(html, 'data-estilo="banda"') && has(html, 'data-estilo="editorial"'));
  ok(tag + ' (F) las 3 opciones usan la MISMA foto (una sola URL)', (() => {
    const f = fnFrom(html, 'function ocStyleShow()');
    return cnt(f, /<img src="' \+ img \+ '"/g) === 3;
  })());
  ok(tag + ' (F) draftFinish va al picker (no directo a fmShow)', (() => {
    const f = fnFrom(html, 'function draftFinish()');
    return has(f, 'ocStyleShow();') && !has(f, 'fmShow();');
  })());
  ok(tag + ' (F) sin foto usable el picker se salta a fmShow', (() => {
    const f = fnFrom(html, 'function ocStyleShow()');
    return has(f, "if (!OC_STYLE || !OC_STYLE.ok || !OC_STYLE.photo) { fmShow(); return; }");
  })());
  ok(tag + ' (F) la foto se precarga en currentScreen (mientras responde)', (() => {
    const f = fnFrom(html, 'function currentScreen()');
    return has(f, 'ocPrepareStyle();');
  })());
  ok(tag + ' (F) la foto se precarga en sprout (respuestas fijas)', (() => {
    const f = fnFrom(html, 'function sprout()');
    return has(f, 'ocPrepareStyle();');
  })());
  ok(tag + ' (F) buildGenFormData manda estilo_visual', has(html, "if (window.OC_ESTILO) { fd.append('estilo_visual', window.OC_ESTILO); }"));
  ok(tag + ' (F) renderWeek aplica la clase wk-<estilo> + tag', (() => {
    const f = fnFrom(html, 'function renderWeek()');
    return has(f, "rwEl.classList.add('wk-' + rwEstilo)") && has(f, 'oc-styletag');
  })());
  ok(tag + ' (F) T.styleIntro existe', has(html, 'styleIntro:'));
  ok(tag + ' (F) T.stylePicked existe', has(html, 'stylePicked:'));
  ok(tag + ' (F) T.styleWeekTag existe', has(html, 'styleWeekTag:'));
  ok(tag + ' (F) CSS del picker presente', has(html, '.oc-stylepick{') && has(html, '.oc-styleopt{') && has(html, '.oc-so-banda .band{') && has(html, '.oc-so-edit .frame{'));
  ok(tag + ' (F) CSS de la semana en estilo presente', has(html, '#rWeek.wk-editorial .day .db{') && has(html, '#rWeek.wk-banda .day .dcap{') && has(html, '.oc-styletag{'));
  ok(tag + ' (F) el onboarding sigue siendo 5 preguntas (sin pregunta de estilo)', (() => {
    // El literal window.OC_ANS de sprout(): las 5 fijas + condicionales,
    // sin clave de estilo (el estilo viaja aparte, en OC_ESTILO).
    const f = fnFrom(html, 'function sprout()');
    const a = f.indexOf('window.OC_ANS = {');
    if (a < 0) return false;
    const b = f.indexOf('};', a);
    const lit = f.slice(a, b < 0 ? undefined : b);
    return has(lit, 'producto_estrella: S.ans.q1') && has(lit, 'cta: S.ans.q2') && has(lit, 'promo: S.ans.q3') && has(lit, 'voz: S.ans.q4') && has(lit, 'precios: S.ans.q5') && !has(lit, 'estilo');
  })());
  ok(tag + ' (F) el picker no usa chips ni pregunta escrita', (() => {
    const f = fnFrom(html, 'function ocStyleShow()');
    return !has(f, 'oc-card') && !has(f, 'setChips');
  })());
}
// Paridad con el mock aprobado (nombres exactos del mock v4).
ok('M0 nombres del mock en ES', has(es, "styleNameClean: 'Foto real limpia'") && has(es, "styleNameBanda: 'Titular en banda'") && has(es, "styleNameEdit: 'Editorial con aire'"));
ok('M0 títulos de las 3 tarjetas en ES', has(es, "styleClean: 'Foto real limpia'") && has(es, "styleBanda: 'Titular grande en banda'") && has(es, "styleEdit: 'Editorial con mucho aire'"));
ok('M0 nombres del mock en EN', has(en, "styleNameClean: 'Clean real photo'") && has(en, "styleNameBanda: 'Headline in a band'") && has(en, "styleNameEdit: 'Editorial with air'"));

// ---------- U) vivo: parseEstiloVisual ----------
console.log('— U) parseEstiloVisual —');
ok('U0 parseEstiloVisual exportado', typeof demo.parseEstiloVisual === 'function');
ok('U1 acepta los 3 valores', demo.parseEstiloVisual('limpia') === 'limpia' && demo.parseEstiloVisual('banda') === 'banda' && demo.parseEstiloVisual('editorial') === 'editorial');
ok('U2 normaliza mayúsculas y espacios', demo.parseEstiloVisual('LIMPIA') === 'limpia' && demo.parseEstiloVisual('  banda ') === 'banda');
ok('U3 rechaza basura, vacío, null y otro campo', demo.parseEstiloVisual('BASURA') === null && demo.parseEstiloVisual('') === null && demo.parseEstiloVisual(null) === null && demo.parseEstiloVisual('foto') === null && demo.parseEstiloVisual('limpia,banda') === null);

// ---------- U) vivo: buildDemoSpec ----------
console.log('— U) buildDemoSpec con estilo —');
const base = { business: 'Negocio Test', category: 'belleza', country: 'AR', tone: 'vos', goal: '', count: 5, profilePicPath: '/tmp/pic-test.jpg' };
const modesOf = (s) => s.specPosts.map((p) => p.text_mode);
const nText = (s) => modesOf(s).filter((m) => m === 'text').length;
const sBase = demo.buildDemoSpec({ ...base });
ok('U4 sin estilo: 2 con texto / 3 limpias (comportamiento de hoy)', nText(sBase) === 2 && modesOf(sBase).filter((m) => m === 'clean').length === 3 && sBase.estilo_visual === null);
const sLimpia = demo.buildDemoSpec({ ...base, estiloVisual: 'limpia' });
ok('U5 limpia: 0 piezas con texto (foto limpia)', nText(sLimpia) === 0 && sLimpia.estilo_visual === 'limpia' && sLimpia.specPosts.every((p) => p.estilo_visual === 'limpia'));
const sBanda = demo.buildDemoSpec({ ...base, estiloVisual: 'banda' });
ok('U6 banda: titular en todas las piezas imagen (4 texto / 1 limpia = el reel)', nText(sBanda) === 4 && modesOf(sBanda)[2] === 'clean' && sBanda.estilo_visual === 'banda');
const sEdit = demo.buildDemoSpec({ ...base, estiloVisual: 'editorial' });
ok('U7 editorial: dosificación del draft (2 texto / 3 limpias) + estilo registrado', nText(sEdit) === 2 && sEdit.estilo_visual === 'editorial' && sEdit.specPosts.every((p) => p.estilo_visual === 'editorial'));
const sBasura = demo.buildDemoSpec({ ...base, estiloVisual: 'BASURA' });
ok('U8 estilo inválido: se ignora, semana como hoy (2/3, estilo null)', nText(sBasura) === 2 && sBasura.estilo_visual === null && sBasura.specPosts.every((p) => !p.estilo_visual));
const draftTit = { version: 1, dims: ['foto', 'protagonista', 'texto', 'enfoque'], rondas: [{ dim: 'foto', opciones: [{ v: 'producto' }], elegida: 'producto' }, { dim: 'protagonista', opciones: [{ v: 'producto' }], elegida: 'producto' }, { dim: 'texto', opciones: [{ v: 'limpia' }, { v: 'equilibrada' }, { v: 'titulares' }], elegida: 'titulares' }, { dim: 'enfoque', opciones: [{ v: 'producto' }], elegida: 'producto' }], campeona: { dim: 'texto', v: 'titulares' } };
const sDraftSolo = demo.buildDemoSpec({ ...base, draft: draftTit });
ok('U9 draft titulares solo: 3 con texto, pieza 0 con texto (campeona)', nText(sDraftSolo) === 3 && sDraftSolo.specPosts[0].text_mode === 'text');
const sDraftLimpia = demo.buildDemoSpec({ ...base, draft: draftTit, estiloVisual: 'limpia' });
ok('U10 el estilo manda sobre el draft: titulares + limpia → 0 con texto, pieza 0 limpia', nText(sDraftLimpia) === 0 && sDraftLimpia.specPosts[0].text_mode === 'clean');
const sDraftBanda = demo.buildDemoSpec({ ...base, draft: { version: 1, dims: ['foto', 'protagonista', 'texto', 'enfoque'], rondas: [{ dim: 'texto', opciones: [{ v: 'limpia' }], elegida: 'limpia' }], campeona: null }, estiloVisual: 'banda' });
ok('U11 el estilo manda sobre el draft: limpia + banda → 4 con texto', nText(sDraftBanda) === 4);

console.log(`\n${fail ? '✗' : '✅'} test-lote-estilo-onboarding-v855: ${pass} OK, ${fail} FALLOS${fail ? ' — ' + fails.join(' | ') : ''}`);
process.exitCode = fail ? 1 : 0;
