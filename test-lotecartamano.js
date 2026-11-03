/* LOTE CARTA-MANO — test nuevo. Ejecuta el render REAL (anaCartaHTML,
 * anaLetterBodyHTML, anaLetterMinimalHTML) del chunk con stubs mínimos de
 * hoja, y compara trabajo vs prístino v559: el texto debe ser byte a byte
 * idéntico; la única diferencia permitida es la clase ana-carta-mano en la
 * tarjeta de la carta actual. Uso: node test-lotecartamano.js [workdir]
 * (por defecto, el dir de este archivo). */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WORK = process.argv[2] || __dirname;
const PRISTINE = '/home/hatch/workspace/.lotedetalledirectoA-release';
let n = 0;
const ok = (cond, label) => { n++; assert(cond, label); console.log('ok ' + n + ' - ' + label); };

function extract(src, name) {
  const re = new RegExp('^function ' + name + '\\([\\s\\S]*?^\\}', 'm');
  const m = src.match(re);
  assert(m, 'no se pudo extraer ' + name);
  return m[0];
}

function runRender(chunkPath, past, lang) {
  const src = fs.readFileSync(chunkPath, 'utf8');
  // TANDA: anaCartaHTML llama a anaSaludoTop (personalizada) y
  // anaAprendeHTML (aprende); el harness debe extraerlos para rendir.
  // En prístino (pre-tanda) no existen: stub '' (correcto: su render no
  // lleva ni saludo top ni línea aprende).
  const optFn = (name, stub) => { try { return extract(src, name); } catch (e) { return stub; } };
  const fns = ['anaLetterMinimalHTML', 'anaLetterBodyHTML', 'anaHasLetter', 'anaCartaHTML']
    .map((f) => extract(src, f)).join('\n')
    + '\n' + optFn('anaSaludoTop', 'function anaSaludoTop() { return ""; }')
    + '\n' + optFn('anaAprendeHTML', 'function anaAprendeHTML() { return ""; }');
  const prelude = `
let LANG = '${lang}';
let anaPastMode = ${past};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pzIc = () => '';
const anaT = (es, en) => (LANG === 'en' ? en : es);
const anaSetLang = (a) => { if (a && a.lang) LANG = a.lang; };
const anaCtx = () => ({ biz: 'Mi Negocio', handle: 'minegocio' });
const anaStage = () => 'x';
const anaDateLine = () => '2 al 8 de noviembre';
const anaProximoAnalisisHTML = () => '';
const anaBanner = () => 'Cierre banner';
const anaSignHTML = () => '<div class="ana-sign"><p class="ana-fname">Posty<span>.</span></p></div>';
const anaShareBlockHTML = () => '';
const anaFullHTML = () => '';
`;
  const d = {
    analysis: {
      lang,
      letter: {
        v: 2, title: lang === 'en' ? 'Your strategy' : 'Tu estrategia',
        greeting: lang === 'en' ? 'Hi, this is your week' : 'Hola, esta es tu semana',
        body: [
          { t: 'p', text: lang === 'en' ? 'Your posts went out every day.' : 'Tus posteos salieron todos los días.' },
          { t: 'action', text: lang === 'en' ? 'Post the brunch reel' : 'Publicar el reel del brunch' },
          { t: 'p', text: lang === 'en' ? 'On your side: nothing' : 'De tu lado: nada' },
        ],
        closing: lang === 'en' ? 'See you in your Schedule' : 'Nos vemos en tu agenda',
      },
    },
  };
  const code = prelude + fns + '\nanaCartaHTML(' + JSON.stringify(d) + ');';
  return eval(code);
}

function runBody(chunkPath, letter) {
  const src = fs.readFileSync(chunkPath, 'utf8');
  const fns = ['anaLetterMinimalHTML', 'anaLetterBodyHTML'].map((f) => extract(src, f)).join('\n');
  const prelude = `
let LANG = 'es';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pzIc = () => '';
const anaT = (es, en) => es;
`;
  return eval(prelude + fns + '\nanaLetterBodyHTML({ letter: ' + JSON.stringify(letter) + ' });');
}

const workChunk = path.join(WORK, 'public/chunk-analisis.js');
const prisChunk = path.join(PRISTINE, 'public/chunk-analisis.js');
const workCss = fs.readFileSync(path.join(WORK, 'public/styles.css'), 'utf8');
const workIdx = fs.readFileSync(path.join(WORK, 'public/index.html'), 'utf8');
const workIdxEn = fs.readFileSync(path.join(WORK, 'public/en/index.html'), 'utf8');

// Normalización TANDA (conciliación documentada): el render combinado
// suma saludoTop (personalizada), tira WeekNums (números) y secciones
// (carta-corta). Se quitan solo esas inserciones y el resto debe ser
// byte a byte = prístino; si no, es regresión de carta-mano.
const normTanda = (h) => h
  .replace(/<p class="ana-ltr-p ana-ltr-greet">[^<]*<\/p>/g, '')
  .replace(/\n    <div id="anaWeekNums"><\/div>/, '')
  .replace(/<section class="ana-ltr-sec"><p class="ana-sec-t">[^<]*<\/p>/g, '')
  .replace(/<\/section>/g, '')
  // Impulsar (misma tanda) mueve el div fuera de la tarjeta: se quita de
  // ambos lados (posición, no contenido). Fundamento-literal (v582, pre-
  // tanda) suma el bloque de confirmación semanal: se quita del lado work.
  .replace('<div id="anaBoostRec"></div>', '')
  .replace(/<div class="ana-fl-confirm"[^>]*><button[^<]*<\/button><div id="anaFlBox"[^<]*<\/div><\/div>/, '');

// 1. Carta actual ES: clase mano presente, texto intacto.
const wEs = runRender(workChunk, false, 'es');
const pEs = runRender(prisChunk, false, 'es');
ok(wEs.includes('class="ana-card ana-letter ana-carta-mano"'), 'carta actual: contenedor con ana-carta-mano');
ok(wEs.includes('Hola, Mi Negocio:'), 'carta actual: saludo top personalizada (el saludo del cuerpo subió arriba en la misma tanda)');
ok(wEs.includes('Tus posteos salieron todos los días.'), 'carta actual: cuerpo intacto');
ok(wEs.includes('Publicar el reel del brunch'), 'carta actual: acción intacta');
ok(normTanda(wEs.replace(' ana-letter ana-carta-mano', ' ana-letter')) === normTanda(pEs), 'carta actual: SOLO cambia la clase + inserciones documentadas de la tanda (resto byte a byte = prístino)');
ok(!pEs.includes('ana-carta-mano'), 'prístino: sin clase mano (control negativo)');

// 2. Cartas anteriores intactas: con anaPastMode=true no hay clase mano.
const wPast = runRender(workChunk, true, 'es');
const pPast = runRender(prisChunk, true, 'es');
ok(!wPast.includes('ana-carta-mano'), 'carta anterior: sin clase mano');
ok(normTanda(wPast) === normTanda(pPast), 'carta anterior: HTML = prístino salvo inserciones documentadas de la tanda');

// 3. EN espejo.
const wEn = runRender(workChunk, false, 'en');
ok(wEn.includes('class="ana-card ana-letter ana-carta-mano"'), 'EN: contenedor con ana-carta-mano');
ok(wEn.includes('Hi, Mi Negocio:'), 'EN: saludo top personalizada (misma causa que ES)');
ok(wEn.includes('Your posts went out every day.'), 'EN: cuerpo intacto');

// 4. Cuerpo v1 y mínimo intactos como funciones (la forma vieja no se reescribe).
const v1 = { v: 1, greeting: 'Hola', body: [{ t: 'p', text: 'Texto v1' }, { t: 'plan', phase: 0, phase_name: 'Fase', step: 'Paso v1' }] };
ok(runBody(workChunk, v1) === runBody(prisChunk, v1), 'cuerpo v1: byte a byte = prístino');
const v2 = { v: 2, greeting: 'Hola', body: [{ t: 'p', text: 'Texto v2' }] };
ok(normTanda(runBody(workChunk, v2)) === normTanda(runBody(prisChunk, v2)), 'cuerpo mínimo v2: = prístino salvo secciones de carta-corta (misma tanda)');

// 5. Esqueletos de carga intactos (no se tocó ningún otro .ana-card.ana-letter).
const skel = (p) => (fs.readFileSync(p, 'utf8').match(/ana-card ana-letter"><div class="ana-loading"/g) || []).length;
ok(skel(workChunk) === 4 && skel(prisChunk) === 4, 'esqueletos de carga: 4 y 4, intactos');

// 6. CSS: vidrio receta vigente + mano + doblez + tamaños.
ok(workCss.includes('.ana-carta-mano{position:relative;background:rgba(255,255,255,.55);'), 'CSS: fondo vidrio .55');
ok(workCss.includes('backdrop-filter:blur(16px) saturate(1.4)'), 'CSS: blur 16 saturate 1.4');
ok(workCss.includes('border:1px solid rgba(255,255,255,.75)'), 'CSS: borde blanco .75');
ok(workCss.includes('box-shadow:0 8px 24px rgba(10,30,51,.10)'), 'CSS: sombra receta');
ok(workCss.includes('border-radius:18px'), 'CSS: radio 18px');
ok(workCss.includes("font-family:'Gochi Hand',cursive,system-ui,sans-serif"), 'CSS: Gochi Hand + fallback completo');
ok(workCss.includes('color:#0A1E33'), 'CSS: navy #0A1E33');
ok(workCss.includes('.ana-carta-mano .ana-ltr-p{font-size:21px'), 'CSS: cuerpo 21px a mano');
ok(workCss.includes('.ana-carta-mano::before{content:"";position:absolute;top:0;left:0;width:46px;height:46px'), 'CSS: doblez 46px top-left');
ok(workCss.includes('linear-gradient(to bottom right,#cfc6a8 0%,#cfc6a8 50%'), 'CSS: doblez tono papel');
ok(workCss.includes('drop-shadow(2px 2px 3px rgba(10,30,51,.25))'), 'CSS: doblez con sombra suave');
ok(workCss.includes('pointer-events:none'), 'CSS: doblez sin interceptar toques');
ok(!/\.ana-carta-mano[^{]*\{[^}]*animation/.test(workCss), 'CSS: doblez estático, sin animación');
ok((workCss.match(/\/\* CARTA-MANO \(2026-11-02/g) || []).length === 1, 'CSS: bloque mano una sola vez (sin duplicado)');

// 7. Fuentes en ambos índices; Montserrat intacto.
for (const [label, html] of [['ES', workIdx], ['EN', workIdxEn]]) {
  ok(html.includes('family=Gochi+Hand&display=swap'), 'índice ' + label + ': link Gochi Hand');
  ok(html.includes('family=Montserrat:wght@700;800'), 'índice ' + label + ': Montserrat intacto (link combinado v576 diseño)');
}

// 8. M78: cero funciones nuevas (solo clase + CSS + link).
const fnNames = (p) => new Set((fs.readFileSync(p, 'utf8').match(/^function (ana\w+)/gm) || []).map((s) => s.replace('function ', '')));
const wFns = fnNames(workChunk), pFns = fnNames(prisChunk);
// TANDA + PRE-TANDA: el regex /^function/ no ve las 2 async de la tanda
// (anaWeekNumsLoad, anaNextStepLoad), así que el diff visible es 10 de la
// tanda + 6 de fundamento-literal (v582, pre-tanda). Carta-mano: 0 nuevas.
const esperadas = ['anaMagiaEntrada', 'anaWeekNumsTiles', 'anaNextStepPendientes', 'anaNextStepElegir', 'anaNextStepHTML', 'anaNextStepIrInicio', 'anaNextStepIrImpulsar', 'anaNextStepMount', 'anaAprendeHTML', 'anaSaludoTop', 'anaFlConfirmLoad', 'anaFlConfirmRender', 'anaFlSeguir', 'anaFlEditar', 'anaFlQuitarVeto', 'anaFlConfirmarHipotesis'];
const diffFns = [...wFns].filter((f) => !pFns.has(f));
const perdidas = [...pFns].filter((f) => !wFns.has(f));
ok(diffFns.length === 16 && esperadas.every((f) => diffFns.includes(f)) && perdidas.length === 0, 'M78 tanda: solo funciones nuevas de la tanda + fundamento v582 (carta-mano: 0 nuevas, 0 borradas)');

// 9. Sin sello agregado.
ok(!wEs.includes('ana-sello') && !wEs.includes('✦'), 'sin sello en la carta (decisión documentada)');

console.log('CARTA-MANO: ' + n + '/' + n + ' asserts OK');
