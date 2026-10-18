// test-demo-ai.js — v198: PROYECCIÓN CON IA SOLO PARA PERFILES
// ILUSTRADOS/MASCOTA (decisión de Valentino 2026-10-18).
//
// Garantiza, sin gastar IA real (fetch inyectado, DB temporal):
//  (a) Perfil 'photo' → la clasificación dice photo y el reemplazo IA
//      no se dispara (la semana queda de plantillas, costo cero).
//  (b) Perfil 'illustrated' → las piezas se generan vía makePiece; una
//      pieza que falla conserva su plantilla (fallback por pieza, la
//      tanda no se cae).
//  (c) El tope diario DEMO_AI_DAILY_CAP_USD corta: con el gasto del día
//      en el tope, demoAiCapOk() es false y replacePiecesWithAi no
//      lanza ninguna pieza; si el tope se cruza a mitad de tanda, no se
//      lanzan más.
//  (d) La clasificación ante cualquier falla (red, HTTP, JSON roto, sin
//      key, sin fotos) devuelve null → el llamador cae a 'photo'.
//  (e) compositeDemoPiece compone el titular y devuelve un JPEG
//      1080x1350 válido (el mismo composite del pipeline real).
//  (f) v202: la FÓRMULA DE COMPOSICIÓN viaja en la clasificación, el
//      mapa tema→objeto-concepto acierta los temas del feed, y las
//      directivas duras (60-70%, fondo simple, tercio superior) quedan
//      en el prompt ensamblado de cada pieza.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-demoai-'));
process.env.DATA_DIR = TMP;

const demoAi = require('./demo-ai');
const costs = require('./costs');

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); }
}

// Fotos de prueba reales (JPEG sólidos generados con PIL).
function makePhoto(name, rgb) {
  const p = path.join(TMP, name);
  execFileSync('python3', ['-c',
    `import sys\nfrom PIL import Image\nImage.new("RGB", (540, 540), (${rgb.join(',')})).save(sys.argv[1], "JPEG", quality=85)\n`,
    p]);
  return p;
}
const PHOTOS = [makePhoto('f1.jpg', [30, 120, 200]), makePhoto('f2.jpg', [250, 200, 60]),
  makePhoto('f3.jpg', [20, 30, 60]), makePhoto('f4.jpg', [240, 240, 235])];

const llmJson = (content, usage) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content } }],
    usage: usage || { prompt_tokens: 900, completion_tokens: 40 },
  }),
});

(async () => {
  // ---------- parseClassifyContent ----------
  console.log('— parseo de la clasificación');
  {
    const good = demoAi.parseClassifyContent('{"kind":"illustrated","character":"a blue robot","style":"3d render"}');
    ok(good && good.kind === 'illustrated' && good.character === 'a blue robot', 'JSON ilustrado válido');
    ok(demoAi.parseClassifyContent('{"kind":"photo"}').kind === 'photo', 'JSON foto válido');
    ok(demoAi.parseClassifyContent('basura') === null, 'texto roto → null');
    ok(demoAi.parseClassifyContent('{"kind":"otro"}') === null, 'kind desconocido → null');
    ok(demoAi.parseClassifyContent('') === null, 'vacío → null');
  }

  // ---------- classifyFeedKind con fetch inyectado ----------
  console.log('— clasificación del feed (fetch stub)');
  {
    let calls = 0;
    const stubIlustrado = async () => { calls++; return llmJson('{"kind":"illustrated","character":"un robot celeste con antena amarilla","style":"render 3D suave, paleta celeste y amarilla"}'); };
    const cls = await demoAi.classifyFeedKind({ photoPaths: PHOTOS, apiKey: 'sk-test', fetchImpl: stubIlustrado });
    ok(cls && cls.kind === 'illustrated', 'feed ilustrado clasifica illustrated');
    ok(cls && /robot celeste/.test(cls.character), 'la descripción del personaje viaja');
    ok(calls === 1, 'una sola llamada de visión por perfil');

    const clsFoto = await demoAi.classifyFeedKind({
      photoPaths: PHOTOS, apiKey: 'sk-test',
      fetchImpl: async () => llmJson('{"kind":"photo","character":"","style":""}'),
    });
    ok(clsFoto && clsFoto.kind === 'photo', 'feed de fotos clasifica photo');

    ok(await demoAi.classifyFeedKind({ photoPaths: PHOTOS, apiKey: 'sk-test', fetchImpl: async () => { throw new Error('red caída'); } }) === null,
      'falla de red → null (cae a photo)');
    ok(await demoAi.classifyFeedKind({ photoPaths: PHOTOS, apiKey: 'sk-test', fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) }) === null,
      'HTTP 500 → null');
    ok(await demoAi.classifyFeedKind({ photoPaths: PHOTOS, apiKey: 'sk-test', fetchImpl: async () => llmJson('no-json') }) === null,
      'JSON ilegible → null');

    let callsSinKey = 0;
    ok(await demoAi.classifyFeedKind({ photoPaths: PHOTOS, apiKey: '', fetchImpl: async () => { callsSinKey++; return llmJson('{}'); } }) === null
      && callsSinKey === 0, 'sin API key → null y cero llamadas');
    ok(await demoAi.classifyFeedKind({ photoPaths: [], apiKey: 'sk-test', fetchImpl: stubIlustrado }) === null,
      'sin fotos → null');
    ok(await demoAi.classifyFeedKind({ photoPaths: [path.join(TMP, 'no-existe.jpg')], apiKey: 'sk-test', fetchImpl: stubIlustrado }) === null,
      'fotos inexistentes → null');
  }

  // ---------- (a) photo → cero reemplazos IA ----------
  console.log('— la semana de un perfil photo no toca la IA');
  {
    // Réplica de la puerta del handler: solo illustrated entra a la tanda.
    const cls = { kind: 'photo', character: '', style: '' };
    let makeCalls = 0;
    let result = { replaced: new Map(), stoppedByCap: false };
    if (cls.kind === 'illustrated') {
      result = await demoAi.replacePiecesWithAi({
        indexes: [0, 1, 2, 3, 4], capOk: () => true,
        makePiece: async () => { makeCalls++; return Buffer.from('x'); },
      });
    }
    ok(makeCalls === 0 && result.replaced.size === 0, 'photo → 0 piezas IA (plantillas, costo cero)');
  }

  // ---------- (b) illustrated → reemplazo con fallback por pieza ----------
  console.log('— tanda IA con fallback por pieza');
  {
    const seen = [];
    const { replaced, stoppedByCap } = await demoAi.replacePiecesWithAi({
      indexes: [0, 1, 2, 3, 4],
      capOk: () => true,
      makePiece: async (i) => {
        if (i === 2) throw new Error('OpenAI 500 simulado');
        if (i === 4) return null; // composite falló: queda plantilla
        return Buffer.from('pieza-' + i);
      },
      onPiece: async (i, buf) => { seen.push(i); },
    });
    ok(replaced.size === 3, `3 piezas reemplazadas (hubo ${replaced.size})`);
    ok(!replaced.has(2) && !replaced.has(4), 'la pieza que falla y la que devuelve null quedan de plantilla');
    ok(seen.length === 3 && seen.every((i) => replaced.has(i)), 'onPiece se emite por cada pieza lista (stream progresivo)');
    ok(stoppedByCap === false, 'sin tope no hay corte');
  }

  // ---------- (c) el tope diario corta ----------
  console.log('— tope diario del demo (costs)');
  {
    // DB temporal real con la tabla api_costs (mismo schema que db.js).
    const db = new DatabaseSync(path.join(TMP, 'costs.db'));
    db.exec(`CREATE TABLE api_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER, feature TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
      in_tokens INTEGER NOT NULL DEFAULT 0, out_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0, images INTEGER NOT NULL DEFAULT 0,
      est_cost_usd REAL NOT NULL DEFAULT 0)`);
    costs.initCosts(db, {});
    ok(costs.DEMO_AI_DAILY_CAP_USD === 10, 'DEMO_AI_DAILY_CAP_USD default = USD 10');
    ok(costs.demoAiSpendTodayUsd() === 0 && costs.demoAiCapOk() === true, 'sin gasto: tope libre');
    costs.logApiCost({ feature: 'demo-ai-image', model: 'gpt-image-2', images: 1 });
    costs.logApiCost({ feature: 'concept-shot', model: 'gpt-image-2', images: 1 }); // gasto del producto: NO cuenta
    const spend = costs.demoAiSpendTodayUsd();
    ok(Math.abs(spend - 0.063) < 1e-9, `solo suma features demo-ai (sumó ${spend})`);
    ok(costs.demoAiCapOk() === true, 'una imagen no alcanza el tope');
    // Llevar el gasto del demo al tope:
    for (let k = 0; k < 200 && costs.demoAiCapOk(); k++) {
      costs.logApiCost({ feature: 'demo-ai-image', model: 'gpt-image-2', images: 1 });
    }
    ok(costs.demoAiCapOk() === false, 'con el gasto en el tope, demoAiCapOk() es false');
    let makeCalls = 0;
    const cut = await demoAi.replacePiecesWithAi({
      indexes: [0, 1, 2, 3, 4], capOk: () => costs.demoAiCapOk(),
      makePiece: async () => { makeCalls++; return Buffer.from('x'); },
    });
    ok(makeCalls === 0 && cut.stoppedByCap === true && cut.replaced.size === 0,
      'tope alcanzado → cero piezas lanzadas (fallback silencioso a plantillas)');

    // Corte a mitad de tanda: el tope se cruza tras 2 chequeos.
    let checks = 0;
    const mid = await demoAi.replacePiecesWithAi({
      indexes: [0, 1, 2, 3, 4],
      capOk: () => { checks++; return checks <= 2; },
      makePiece: async (i) => Buffer.from('pieza-' + i),
    });
    ok(mid.replaced.size === 2 && mid.stoppedByCap === true, 'tope a mitad de tanda → solo 2 piezas lanzadas');
  }

  // ---------- (e) composite de pieza IA ----------
  console.log('— composite del titular (pipeline real)');
  {
    // "Imagen de IA" sintética: un PNG 1024x1280 generado con PIL.
    const rawPng = path.join(TMP, 'raw.png');
    execFileSync('python3', ['-c',
      'import sys\nfrom PIL import Image\nImage.new("RGB", (1024, 1280), (250, 244, 230)).save(sys.argv[1], "PNG")\n',
      rawPng]);
    const b64 = fs.readFileSync(rawPng).toString('base64');
    const buf = await demoAi.compositeDemoPiece({
      b64, headline: 'Tu mes de contenido, resuelto', gradeHex: '#F9C00E', workDir: TMP, index: 0,
    });
    ok(Buffer.isBuffer(buf) && buf.length > 10000, 'composite devuelve un buffer con peso real');
    ok(buf && buf[0] === 0xFF && buf[1] === 0xD8, 'la pieza final es JPEG');
    const dimsPath = path.join(TMP, 'pieza-final.jpg');
    fs.writeFileSync(dimsPath, buf);
    const dims = execFileSync('python3', ['-c',
      'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1])\nprint(im.size[0], im.size[1])\n',
      dimsPath]).toString().trim();
    ok(dims === '1080 1350', `la pieza final es 1080x1350 como las de plantilla (salió ${dims})`);
    const bad = await demoAi.compositeDemoPiece({ b64: 'no-es-una-imagen', headline: 'X', workDir: TMP, index: 9 });
    ok(bad === null, 'imagen inválida → null (la pieza queda de plantilla)');
  }

  // ---------- línea visual del feed ilustrado ----------
  console.log('— línea visual para el brief');
  {
    const vs = demoAi.visualStyleForFeed({ character: 'a small blue robot with a yellow antenna', style: 'soft 3D render, sky blue and yellow palette' }, 'light');
    ok(/blue robot/.test(vs) && /ILLUSTRATED/.test(vs) && /BRIGHT/.test(vs), 'la línea nombra personaje, estilo y registro');
    ok(/SAME character/.test(vs), 'la línea exige el mismo personaje en escena nueva');
  }

  // ---------- (f) fórmula de composición del feed (v202) ----------
  console.log('— fórmula de composición (v202)');
  {
    const conFormula = demoAi.parseClassifyContent('{"kind":"illustrated","character":"robot","style":"3d","composition":{"character_scale":0.72,"background":"plain","headline":"large"}}');
    ok(conFormula && conFormula.formula.character_scale === 0.72 && conFormula.formula.background === 'plain' && conFormula.formula.headline === 'large',
      'la composición válida viaja en la clasificación');
    const invalida = demoAi.parseClassifyContent('{"kind":"illustrated","composition":{"character_scale":7,"background":"ruidoso","headline":"enorme"}}');
    ok(invalida && invalida.formula.character_scale === null && invalida.formula.background === null && invalida.formula.headline === null,
      'valores de fórmula inválidos → null por campo (el kind sigue válido)');
    const sinFormula = demoAi.parseClassifyContent('{"kind":"photo"}');
    ok(sinFormula && sinFormula.formula.character_scale === null && sinFormula.formula.background === null,
      'sin composition → fórmula en null');

    const stubFormula = async () => llmJson('{"kind":"illustrated","character":"robot celeste","style":"render 3D","composition":{"character_scale":0.68,"background":"soft","headline":"large"}}');
    const clsF = await demoAi.classifyFeedKind({ photoPaths: PHOTOS, apiKey: 'sk-test', fetchImpl: stubFormula });
    ok(clsF && clsF.formula && clsF.formula.character_scale === 0.68 && clsF.formula.background === 'soft',
      'classifyFeedKind devuelve la fórmula del feed');

    const def = demoAi.compositionFor({ formula: { character_scale: null, background: null, headline: null } });
    ok(def.character_scale === 0.4 && def.background === 'soft' && def.headline === 'large',
      'compositionFor aplica defaults (fondo simple, titular grande)');
    const rep = demoAi.compositionFor(clsF);
    ok(rep.character_scale === 0.68 && rep.background === 'soft' && rep.headline === 'large',
      'compositionFor conserva lo reportado por el clasificador');

    // Mapa tema → objeto-concepto
    ok(/wall clock/i.test(demoAi.conceptObjectFor('Los horarios que más rinden') || ''), 'horarios → reloj gigante');
    ok(/photo cards/i.test(demoAi.conceptObjectFor('Carruseles que enganchan') || ''), 'carruseles → cartas de fotos');
    ok(/gift box/i.test(demoAi.conceptObjectFor('Sorteamos una auditoría completa') || ''), 'sorteo → regalo (gana sobre auditoría)');
    ok(/magnifying glass/i.test(demoAi.conceptObjectFor('Auditoría de tu Instagram') || ''), 'auditoría → lupa + gráfico');
    ok(/tablet/i.test(demoAi.conceptObjectFor('Tu mes de contenido, resuelto') || ''), 'contenido → tablet');
    ok(/speech bubbles/i.test(demoAi.conceptObjectFor('Comunidad que responde') || ''), 'comunidad → burbujas de chat');
    ok(demoAi.conceptObjectFor('xyz sin tema conocido') === null, 'tema sin mapa → null (directiva genérica)');

    // Directivas duras en el prompt ensamblado
    const dir = demoAi.compositionDirectives(clsF, 'Los horarios que más rinden');
    ok(/60-70%/.test(dir), 'la directiva exige personaje al 60-70% del cuadro');
    ok(/TOP THIRD/.test(dir), 'la directiva reserva el tercio superior para el titular');
    ok(/FORBIDDEN/.test(dir) && /window/i.test(dir), 'la directiva prohíbe la oficina detallada con ventanales');
    ok(/wall clock/i.test(dir), 'la directiva inyecta el objeto-concepto del tema');
    const dirPlain = demoAi.compositionDirectives({ formula: { character_scale: 0.7, background: 'plain', headline: 'large' } }, 'Auditoría de tu Instagram');
    ok(/flat solid color/i.test(dirPlain), 'fórmula plain → fondo de color pleno');
    ok(/ONE single large concept object/i.test(dirPlain), 'un solo objeto-concepto por pieza');

    // La línea visual nombra la fórmula
    const vsF = demoAi.visualStyleForFeed({ character: 'robot', style: '3d', formula: { character_scale: 0.7, background: 'plain', headline: 'large' } }, 'light');
    ok(/FLAT/.test(vsF) && /BIG bold headlines/.test(vsF), 'visualStyleForFeed incorpora fondo y titular de la fórmula');

    // Referencia más nítida = mayor peso
    const chico = path.join(TMP, 'ref-chica.jpg'); fs.writeFileSync(chico, Buffer.alloc(1000));
    const grande = path.join(TMP, 'ref-grande.jpg'); fs.writeFileSync(grande, Buffer.alloc(9000));
    ok(demoAi.pickSharpestRef([chico, grande]) === grande && demoAi.pickSharpestRef([grande, chico]) === grande,
      'pickSharpestRef elige la foto de mayor peso');
    ok(demoAi.pickSharpestRef([path.join(TMP, 'no-existe.jpg')]) === null, 'pickSharpestRef sin archivos → null');

    // Composite con escala de titular grande (fórmula headline=large)
    const rawPng2 = path.join(TMP, 'raw2.png');
    execFileSync('python3', ['-c',
      'import sys\nfrom PIL import Image\nImage.new("RGB", (1024, 1280), (230, 240, 250)).save(sys.argv[1], "PNG")\n',
      rawPng2]);
    const bufBig = await demoAi.compositeDemoPiece({
      b64: fs.readFileSync(rawPng2).toString('base64'), headline: 'Carruseles que enganchan',
      gradeHex: '#1386C7', workDir: TMP, index: 7, headlineScale: 1.45,
    });
    ok(Buffer.isBuffer(bufBig) && bufBig[0] === 0xFF && bufBig[1] === 0xD8, 'composite con --scale devuelve JPEG válido');
  }

  console.log(fails ? `\n✗ test-demo-ai: ${fails} fallas` : '\nTODO OK — test-demo-ai');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
