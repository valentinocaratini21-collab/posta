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
//  (g) v203: "carruseles" = carrusel de Instagram (fotos), NUNCA una
//      calesita: el prompt ensamblado trae la definición + los negativos
//      duros anti merry-go-round.
//  (h) v203 (ampliación): CAPA DE TRATAMIENTOS — cada pieza de la
//      semana recibe un tratamiento visual distinto (flat/poster/duo/
//      workspace/prop), derivado del estilo nombrado + rotación
//      determinística sin repetir; los 5 prompts ensamblados se
//      distinguen entre sí y el composite acepta tinta oscura.
//  (i) v203 (ampliación 2): PALETA DE LOS ÚLTIMOS POSTEOS — la
//      extracción sobre fotos sintéticas de colores conocidos devuelve
//      los roles completos (principal, acento, oscuro, claro, fondo
//      dominante) DESDE esas fotos, y los prompts ensamblados (la
//      directiva dura + el FLAT con su hex rotado) contienen los hex.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-demoai-'));
process.env.DATA_DIR = TMP;

const demoAi = require('./demo-ai');
const demo = require('./demo');
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

  // ---------- (g) carruseles ≠ calesita (v203) ----------
  console.log('— carrusel de Instagram, no calesita (v203)');
  {
    const concepto = demoAi.conceptObjectFor('Carruseles que enganchan') || '';
    ok(/Instagram photo carousel/i.test(concepto), 'el concepto define "carrusel" como carrusel de Instagram');
    ok(/printed PHOTOS/i.test(concepto) && /photo cards/i.test(concepto), 'el concepto son fotos impresas / tarjetas de fotos');
    ok(/smartphone/i.test(concepto) && /swipeable stack of photos/i.test(concepto), 'alternativa válida: celular con pila de fotos deslizable');
    ok(/NEVER a merry-go-round/i.test(concepto), 'negativo duro: nunca merry-go-round');
    ok(/NEVER a fairground carousel/i.test(concepto) && /no amusement park/i.test(concepto) && /no horses/i.test(concepto),
      'negativos duros: sin feria, sin parque de diversiones, sin caballos');

    // El prompt ensamblado (las directivas que se agregan al final de cada
    // pieza IA) lleva definición + negativos para el tema carruseles.
    const dirCar = demoAi.compositionDirectives({ formula: { character_scale: 0.68, background: 'soft', headline: 'large' } }, 'Carruseles que enganchan');
    ok(/Instagram photo carousel/i.test(dirCar) && /printed PHOTOS/i.test(dirCar),
      'el prompt ensamblado de carruseles trae el concepto de fotos');
    ok(/NEVER a merry-go-round/i.test(dirCar) && /no horses/i.test(dirCar),
      'el prompt ensamblado de carruseles trae el negativo anti-calesita');
  }

  // ---------- (h) capa de tratamientos visibles (v203) ----------
  console.log('— capa de tratamientos (v203)');
  {
    // Mapeo familia de estilo → tratamiento
    ok(demoAi.treatmentForStyle('/minimal') === 'flat', 'estilo minimal → FLAT STUDIO');
    ok(demoAi.treatmentForStyle('/editorial-poster') === 'poster', 'estilo editorial → GRAPHIC POSTER');
    ok(demoAi.treatmentForStyle('/ugc-unboxing') === 'duo', 'estilo UGC → DUO');
    ok(demoAi.treatmentForStyle('/prof-escritoriominimal') === 'workspace', 'estilo escritorio → WORKSPACE');
    ok(demoAi.treatmentForStyle('/foto-corporativo') === 'prop', 'estilo foto → PROP SCENE');
    ok(demoAi.treatmentForStyle('/xyz-nada') === null, 'estilo sin familia → null (lo completa la rotación)');
    ok(demoAi.treatmentForStyle('') === null, 'sin estilo → null');

    // Asignación de la semana: 5 piezas → 5 tratamientos, sin repetir
    const semana = [
      { style: '/minimal', headline: 'Comunidad que responde' },
      { style: '/foto-corporativo', headline: 'Carruseles que enganchan' },
      { style: '/xyz-1', headline: 'Los horarios que más rinden' },
      { style: '/xyz-2', headline: 'Tu mes de contenido, resuelto' },
      { style: '/xyz-3', headline: 'Auditoría de tu Instagram' },
    ];
    const asig = demoAi.assignTreatments(semana);
    ok(asig.length === 5 && new Set(asig).size === 5, 'la semana recibe 5 tratamientos SIN repetir');
    ok(asig[0] === 'flat' && asig[1] === 'prop', 'los tratamientos derivados del estilo se respetan');
    ok(JSON.stringify(demoAi.assignTreatments(semana)) === JSON.stringify(asig), 'la asignación es determinística');
    ok(asig.filter((x) => x === 'prop').length <= 1, 'PROP SCENE queda en ≤1 por semana');
    const sinEstilos = demoAi.assignTreatments([{ headline: 'a' }, { headline: 'b' }, { headline: 'c' }, { headline: 'd' }, { headline: 'e' }]);
    ok(new Set(sinEstilos).size === 5, 'sin estilos mapeables, la rotación igual entrega 5 distintos');

    // Los 5 prompts ensamblados de la semana se distinguen
    const clsT = { formula: { character_scale: 0.68, background: 'soft', headline: 'large' } };
    const dirs = semana.map((p, i) => demoAi.compositionDirectives(clsT, p.headline, asig[i]));
    ok(dirs.every((d, i) => d.includes('TREATMENT: ' + demoAi.TREATMENT_NAMES[asig[i]])), 'cada prompt nombra su tratamiento');
    ok(new Set(dirs).size === 5, 'los 5 prompts ensamblados son distinguibles entre sí');
    const porTrat = {};
    asig.forEach((t, i) => { porTrat[t] = dirs[i]; });
    ok(/FLAT SOLID COLOR/.test(porTrat.flat) && /70-80%/.test(porTrat.flat), 'FLAT: fondo pleno + personaje al 70-80%');
    ok(/GRAPHIC POSTER/.test(porTrat.poster) && /medallion/i.test(porTrat.poster) && /25%/.test(porTrat.poster), 'POSTER: diseño gráfico, personaje chico en medallón (≤25%)');
    ok(/ONE human person/.test(porTrat.duo), 'DUO: el personaje interactúa con una persona de su rubro');
    ok(/MEDIUM SHOT/.test(porTrat.workspace) && /50%/.test(porTrat.workspace), 'WORKSPACE: plano medio (~50%) con su herramienta');
    ok(/60-70%/.test(porTrat.prop), 'PROP: la fórmula v202 (60-70% + objeto-concepto)');

    // El concepto anti-calesita viaja en TODOS los tratamientos
    for (const t of demoAi.TREATMENT_ORDER) {
      const d = demoAi.compositionDirectives(clsT, 'Carruseles que enganchan', t);
      ok(/Instagram photo carousel/i.test(d) && /NEVER a merry-go-round/i.test(d),
        `carruseles con tratamiento ${t}: concepto de fotos + negativo anti-calesita`);
    }

    // Composite con tinta oscura: JPEG válido y distinto al de escena
    const rawPng3 = path.join(TMP, 'raw3.png');
    execFileSync('python3', ['-c',
      'import sys\nfrom PIL import Image\nImage.new("RGB", (1024, 1280), (250, 230, 170)).save(sys.argv[1], "PNG")\n',
      rawPng3]);
    const b64L = fs.readFileSync(rawPng3).toString('base64');
    const bufScene = await demoAi.compositeDemoPiece({ b64: b64L, headline: 'Comunidad que responde', gradeHex: '#F9C00E', workDir: TMP, index: 21 });
    const bufInk = await demoAi.compositeDemoPiece({ b64: b64L, headline: 'Comunidad que responde', gradeHex: '#F9C00E', workDir: TMP, index: 22, inkHex: '#0A1E33' });
    ok(Buffer.isBuffer(bufInk) && bufInk[0] === 0xFF && bufInk[1] === 0xD8, 'composite con --ink devuelve JPEG válido');
    ok(Buffer.isBuffer(bufScene) && !bufScene.equals(bufInk), 'la tinta oscura produce una pieza distinta a la de escena (sin scrim)');
  }

  // ---------- (i) paleta de los últimos posteos (v203) ----------
  console.log('— paleta de los últimos posteos (v203)');
  {
    const hexDist = (a, b) => {
      const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
      const B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
      return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
    };
    const lumOf = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    };
    // Tres posteos sintéticos de colores conocidos (orden de feed):
    // amarillo pleno · mitad celeste / mitad amarillo · crema con navy.
    const mk = (name, script) => {
      const p = path.join(TMP, name);
      execFileSync('python3', ['-c', script, p]);
      return fs.readFileSync(p);
    };
    const postA = mk('pal-a.jpg', 'import sys\nfrom PIL import Image\nImage.new("RGB", (200, 250), (249, 192, 14)).save(sys.argv[1], "JPEG", quality=92)\n');
    const postB = mk('pal-b.jpg', 'import sys\nfrom PIL import Image\nim = Image.new("RGB", (200, 250), (19, 134, 199))\nim.paste(Image.new("RGB", (200, 125), (249, 192, 14)), (0, 125))\nim.save(sys.argv[1], "JPEG", quality=92)\n');
    const postC = mk('pal-c.jpg', 'import sys\nfrom PIL import Image\nim = Image.new("RGB", (200, 250), (247, 232, 176))\nim.paste(Image.new("RGB", (200, 50), (10, 30, 51)), (0, 200))\nim.save(sys.argv[1], "JPEG", quality=92)\n');

    const pal = await demo.extractFeedPaletteFromBuffers([postA, postB, postC]);
    ok(pal && pal.source === 'latest-posts', 'la paleta se extrae y declara origen latest-posts');
    ok(pal && hexDist(pal.principal, '#F9C00E') < 60, `principal = el amarillo de los posteos (dio ${pal && pal.principal})`);
    ok(pal && pal.accent && hexDist(pal.accent, '#1386C7') < 60, `acento = el celeste de los posteos (dio ${pal && pal.accent})`);
    ok(pal && hexDist(pal.bg, '#F9C00E') < 60, 'fondo dominante = el color con más píxeles del feed reciente');
    ok(pal && hexDist(pal.dark, '#0A1E33') < 70 && lumOf(pal.dark) <= 0.25, `oscuro = el navy de los posteos (dio ${pal && pal.dark})`);
    ok(pal && lumOf(pal.light) >= 0.78, `claro/crema luminoso desde los posteos (dio ${pal && pal.light})`);
    ok(pal && [pal.principal, pal.accent, pal.dark, pal.light, pal.bg].every((hx) => pal.hexes.includes(hx)),
      'hexes[] reúne los cinco roles');

    // La directiva dura nombra TODOS los hex en el prompt
    const dirPal = demoAi.paletteDirectives(pal);
    ok(dirPal && /LATEST Instagram posts/.test(dirPal), 'la directiva declara la paleta de los últimos posteos');
    ok(dirPal && [pal.principal, pal.accent, pal.dark, pal.light, pal.bg].every((hx) => dirPal.includes(hx)),
      'el prompt ensamblado contiene los hex exactos de la paleta');
    ok(demoAi.paletteDirectives(null) === null, 'sin paleta no hay directiva (comportamiento anterior)');

    // FLAT STUDIO compone sobre el hex rotado de SU paleta
    ok(demoAi.flatBgHexFor(pal, 0) === pal.light && demoAi.flatBgHexFor(pal, 1) === pal.accent && demoAi.flatBgHexFor(pal, 2) === pal.dark,
      'el fondo FLAT rota claro → acento → oscuro de su paleta');
    const clsP = { formula: { character_scale: 0.68, background: 'soft', headline: 'large' } };
    const dirFlat = demoAi.compositionDirectives(clsP, 'Comunidad que responde', 'flat', { palette: pal, index: 1 });
    ok(dirFlat.includes('exactly ' + pal.accent), 'la directiva FLAT nombra el hex exacto que le toca a la pieza');
    const dirFlatSin = demoAi.compositionDirectives(clsP, 'Comunidad que responde', 'flat');
    ok(!/exactly #/.test(dirFlatSin), 'sin paleta, el FLAT no inventa ningún hex');
  }

  console.log(fails ? `\n✗ test-demo-ai: ${fails} fallas` : '\nTODO OK — test-demo-ai');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
