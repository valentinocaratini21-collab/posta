// Harness de Motion v3 — Fases 2/3/4 (render REAL con ffmpeg).
// Corre: node test-reel-motion.js — sin IA paga (aiCall stub), sin red.
// Verifica: buildReelScript → planKineticCaptions → buildReelPro (v3:
// xfade + subtítulos cinéticos por chunk + snap a beats + plantillas)
// y la regresión del camino v2 (sin script = comportamiento de siempre).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra || ''); }
}

const OUT = '/tmp/reel-motion-test';
fs.mkdirSync(OUT, { recursive: true });

const DIGEST_PELUQUERIA = {
  v: 1, business: 'Salón Aurora', category: 'peluqueria', subcat: 'peluqueria',
  servicios: [{ nombre: 'Balayage' }, { nombre: 'Corte y brushing' }, { nombre: 'Alisado sin formol' }],
  productos: [{ nombre: 'Máscara nutritiva de karité' }],
  promos: [{ titulo: 'Martes de balayage' }],
  temas_feed: ['Coloración sin amoníaco'], protagonista: '', paleta: [],
  registro: null, ciudad: 'Palermo', diferencial: 'coloristas certificados',
  has_booking: true, fuentes: {},
};
const SCRIPT_PELU = { scenes: [
  { role: 'hook', line: '¿Tu balayage perdió el brillo del primer día?', visualHint: 'primer plano de pelo opaco que pasa a brillar' },
  { role: 'problem', line: 'Sin máscara nutritiva, el color se lava y queda opaco', visualHint: 'manos lavando pelo con espuma' },
  { role: 'solution', line: 'Nuestro balayage incluye nutrición profunda con karité siempre', visualHint: 'aplicación de máscara nutritiva en el salón' },
  { role: 'solution', line: 'El brushing final va incluido', visualHint: 'brushing final con secador' },
  { role: 'cta', line: 'Reservá tu turno de balayage por DM', visualHint: 'agenda del salón con turnos marcados' },
]};
const DIGEST_CAFETERIA = {
  v: 1, business: 'Café Bruma', category: 'gastronomia', subcat: 'cafeteria',
  servicios: [],
  productos: [{ nombre: 'Flat white' }, { nombre: 'Medialunas de manteca' }, { nombre: 'Café en grano de Etiopía' }],
  promos: [], temas_feed: ['Café de especialidad'], protagonista: '', paleta: [],
  registro: null, ciudad: 'Belgrano', diferencial: 'tueste propio semanal',
  has_booking: false, fuentes: {},
};
const SCRIPT_CAFE_15 = { scenes: [
  { role: 'hook', line: 'El flat white que Belgrano ya hizo su ritual', visualHint: 'flat white con latte art recién servido' },
  { role: 'problem', line: 'El café quemado arruina cualquier flat white temprano', visualHint: 'granos de café quemados' },
  { role: 'solution', line: 'Nuestro café en grano de Etiopía se tuesta cada semana', visualHint: 'tostadora de café en acción' },
  { role: 'cta', line: 'Pedí tu flat white hoy mismo por DM', visualHint: 'mesa con flat white y medialunas' },
]};

function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(out);
}
function frameAt(file, t, out) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-q:v', '3', out]);
  return out;
}
// Cuenta píxeles cercanos al color de marca en la banda superior de un
// frame ya extraído: verifica que la palabra clave + la barra de
// acento REALMENTE se pintaron en el color del cliente.
function countBrandInFrame(jpgFile, hex) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', jpgFile, '-vf', 'crop=1080:460:0:100,format=rgb24', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  let n = 0;
  for (let i = 0; i + 2 < buf.length; i += 3) {
    if (Math.abs(buf[i] - r) + Math.abs(buf[i + 1] - g) + Math.abs(buf[i + 2] - b) < 110) n++;
  }
  return n;
}

async function main() {
  console.log('== test-reel-motion.js ==');
  for (const f of ['reel-engine.js', 'story-reel.js', 'music-beats.js']) {
    try { execFileSync('node', ['--check', path.join(__dirname, f)], { stdio: 'ignore' }); ok(true, `node --check ${f}`); }
    catch (e) { ok(false, `node --check ${f}`, e.message); }
  }

  const rs = require('./reel-script');
  const kc = require('./kinetic-captions');
  const engine = require('./reel-engine');
  const mb = require('./music-beats');

  // --- Fase 3: mapa de beats ---
  const chill = mb.beatsForFile(path.join(__dirname, 'assets', 'music', 'chill.mp3'));
  ok(!!chill && chill.bpm > 60 && chill.bpm < 100, 'beats.json: chill con BPM detectado', chill && String(chill.bpm));
  ok(mb.nearestBeat(chill, chill.beats[5] + 0.1, 0.15) === chill.beats[5], 'nearestBeat encuentra el beat a +100ms');
  ok(mb.nearestBeat(chill, chill.beats[5] + 0.4, 0.15) === null, 'nearestBeat devuelve null fuera de ±150ms');

  // --- Fase 4: plantillas por intención ---
  ok(engine.templateFor('venta').move === 'push-in' && engine.templateFor('reserva').transition === 'slideleft'
    && engine.templateFor('consulta').move === 'calm' && engine.templateFor('autoridad').move === 'push-out',
    'plantillas por intención (venta/reserva/consulta/autoridad)');

  // --- Pulido 2026-10-20: efectos POR PROMPT (reel-effects.js) ---
  const fx = require('./reel-effects');
  ok(fx.pickEffect({ intent: 'reserva', mood: 'chill', rubro: 'peluqueria' }).id === 'polvo-dorado-contraluz',
    'efectos: peluquería+reserva+chill → polvo dorado en contraluz');
  ok(fx.pickEffect({ intent: 'venta', mood: 'chill', rubro: 'cafeteria' }).id === 'vineta-calida-cafe',
    'efectos: cafetería+venta+chill → viñeta cálida de café');
  ok(fx.pickEffect({ intent: 'venta', mood: 'upbeat', rubro: 'fitness' }).id === 'glow-neon-fitness',
    'efectos: fitness → glow de neón sutil');
  ok(fx.pickEffect({ intent: 'venta', mood: 'groove', rubro: 'moda' }).id === 'barrido-luz-vidriera',
    'efectos: venta sin rubro específico → barrido de luz de vidriera');
  ok(fx.pickEffect({ intent: 'autoridad', mood: 'chill', rubro: 'deco' }).id === 'sobrio-editorial',
    'efectos: autoridad → sobrio editorial');
  ok(fx.pickEffect({ intent: '', mood: '', rubro: '' }).id === 'neutro-limpio',
    'efectos: sin contexto → neutro declarado (no se inventa efecto)');
  ok(fx.EFFECT_PROMPTS.every(e => e.prompt && e.prompt.length > 40 && e.realize),
    'efectos: cada prompt tiene su texto de dirección y su realización');
  const planFxCafe = fx.effectsForReel({ intent: 'venta', mood: 'chill', rubro: 'cafeteria',
    scenes: [{ role: 'hook' }, { role: 'problem' }, { role: 'solution' }, { role: 'cta' }] });
  ok(planFxCafe.perScene.length === 4 && planFxCafe.perScene.every(s => s.effectId === 'vineta-calida-cafe' && s.prompt.length > 40),
    'efectos: UN solo prompt gobierna todas las escenas del reel');
  ok(planFxCafe.perScene[0].overlay && planFxCafe.perScene[0].overlay.kind === 'sweep'
    && !planFxCafe.perScene[1].overlay && planFxCafe.perScene[2].overlay && !planFxCafe.perScene[3].overlay,
    'efectos: el barrido se contiene (gancho y primera solución, nada más)');

  // --- Pulido: movimientos variados por escena ---
  for (const mv of ['push-in', 'pan', 'calm', 'dynamic', 'push-out']) {
    const plan = engine.movementPlanFor(mv, 6);
    const noRepeat = plan.every((m, i) => i === 0 || m !== plan[i - 1]);
    const par = plan.filter(m => m === 'parallax').length;
    ok(plan.length === 6 && noRepeat && par <= 2, `movimientos ${mv}: variados, sin consecutivos iguales, parallax ≤2`, plan.join(','));
  }

  // --- Pulido: medición tipográfica y palabra clave ---
  const advFull = await engine.measureAdvance('¿Tu balayage perdió', 72, OUT);
  const advSum = (await engine.measureAdvance('¿Tu ', 72, OUT))
    + (await engine.measureAdvance('balayage', 72, OUT))
    + (await engine.measureAdvance(' perdió', 72, OUT));
  ok(Math.abs(advFull - advSum) <= 2, 'medición: los segmentos suman el avance de la línea (≤2 px)', `${advFull} vs ${advSum}`);
  const fakeChunks = [{ role: 'hook', fit: { lines: ['¿Tu balayage', 'perdió brillo?'] } }];
  const kwA = engine.findKeyword(fakeChunks, ['Balayage']);
  ok(kwA && fakeChunks[0].fit.lines[kwA.lineIdx].slice(kwA.start, kwA.end) === 'balayage',
    'palabra clave: match con un producto/servicio del fundamento');
  const kwB = engine.findKeyword(fakeChunks, []);
  ok(kwB && fakeChunks[0].fit.lines[kwB.lineIdx].slice(kwB.start, kwB.end) === 'balayage',
    'palabra clave: sin fundamento, la más larga del gancho');

  const belleza = fs.readdirSync(path.join(__dirname, 'stock', 'belleza')).filter(f => f.endsWith('.jpg')).map(f => path.join(__dirname, 'stock', 'belleza', f));
  const cafe = fs.readdirSync(path.join(__dirname, 'stock', 'cafeteria')).filter(f => f.endsWith('.jpg')).map(f => path.join(__dirname, 'stock', 'cafeteria', f));
  ok(belleza.length >= 4 && cafe.length >= 3, 'material de stock real para los renders', `${belleza.length}/${cafe.length}`);

  // ============ RENDER 1: peluquería, reserva (slideleft), 15 s ============
  const scriptPelu = await rs.buildReelScript({
    digest: DIGEST_PELUQUERIA, durationSec: 15,
    post: { caption: 'Balayage ✨', source_topic: 'Balayage', salesIntent: 'reserva' },
    aiCall: async () => JSON.parse(JSON.stringify(SCRIPT_PELU)),
  });
  ok(scriptPelu.source === 'ai', 'render 1: guion IA (stub) válido');
  const planPelu = kc.planKineticCaptions(scriptPelu);
  ok(kc.validateCaptionPlan(planPelu).ok, 'render 1: plan cinético válido');
  // Grafo del render 1 capturado: candado anti-bordado (sin cajas).
  process.env.POSTY_REEL_DEBUG = '1';
  const origLog = console.log;
  let graphLog = '';
  console.log = (...a) => { const s = a.join(' '); if (s.includes('filtergraph')) graphLog = s; origLog(...a); };
  const r1 = await engine.buildReelPro({
    mediaDir: OUT, photos: belleza.slice(0, 5), videos: [],
    script: scriptPelu, captionPlan: planPelu, template: 'reserva',
    handle: '@salonaurora', brandHex: '#2793C8', mood: 'chill',
    rubro: 'peluqueria',
    keywords: ['Balayage', 'Corte y brushing', 'Alisado sin formol', 'Máscara nutritiva de karité'],
  });
  console.log = origLog;
  delete process.env.POSTY_REEL_DEBUG;
  ok(graphLog.length > 0 && !graphLog.includes('box=1'),
    'render 1: el grafo v3 NO dibuja cajas de texto (fin del bordado)');
  ok(graphLog.includes("alpha='if(lt(t") && graphLog.includes('premultiply') && graphLog.includes('alphamerge'),
    'render 1: fades por chunk + halo del cierre + parallax presentes en el grafo');
  ok(r1.scripted === true && r1.template === 'reserva', 'render 1: despachó a v3 con plantilla reserva');
  ok(r1.captionStyle === 'limpio-v2', 'render 1: estilo de subtítulos limpio-v2 (sin cajas)');
  ok(Array.isArray(r1.effects) && r1.effects.length === 5 && r1.effects.every(e => e.effectId === 'polvo-dorado-contraluz' && e.prompt.length > 40),
    'render 1: prompt de efecto registrado por escena', JSON.stringify((r1.effects || []).map(e => e.effectId)));
  ok(Array.isArray(r1.movements) && r1.movements.length === 5
    && r1.movements.every((m, i, arr) => i === 0 || m.move !== arr[i - 1].move || m.move === 'video'),
    'render 1: movimientos por escena sin repetir consecutivos', (r1.movements || []).map(m => m.move).join(','));
  const p1 = probe(r1.file);
  const v1 = p1.streams.find(s => s.codec_type === 'video');
  ok(v1.width === 1080 && v1.height === 1920, 'render 1: 1080×1920', `${v1.width}x${v1.height}`);
  ok(v1.r_frame_rate === '30/1', 'render 1: 30 fps', v1.r_frame_rate);
  ok(p1.streams.some(s => s.codec_type === 'audio'), 'render 1: tiene audio (música)');
  const esperado1 = 15 - 4 * engine.templateFor('reserva').xf; // 13.2
  ok(Math.abs(Number(p1.format.duration) - esperado1) < 0.35, `render 1: duración ≈ ${esperado1}s (15 − 4 solapes xfade)`, p1.format.duration);
  console.log(`    render 1: ${r1.file} · beatsSnapped=${r1.beatsSnapped} · duración real=${p1.format.duration}`);

  // Frames de control del render 1 (tiempos de SALIDA: chunk.start − escena·xf)
  const xf1 = engine.templateFor('reserva').xf;
  const outT = (c) => Math.max(0.1, (c.start + c.end) / 2 - c.sceneIndex * xf1);
  const hookChunk = planPelu.chunks[0];
  const probChunk = planPelu.chunks.find(c => c.role === 'problem');
  const ctaChunk = planPelu.chunks.filter(c => c.role === 'cta').pop();
  const f1 = frameAt(r1.file, outT(hookChunk), path.join(OUT, 'r1-hook.jpg'));
  const f2 = frameAt(r1.file, outT(probChunk), path.join(OUT, 'r1-problema.jpg'));
  const f3 = frameAt(r1.file, Math.max(0.1, Number(p1.format.duration) - 1.0), path.join(OUT, 'r1-cierre.jpg'));
  console.log(`    frames render 1: hook "${hookChunk.text}" @${outT(hookChunk).toFixed(1)}s → ${f1}`);
  console.log(`                     problema "${probChunk.text}" @${outT(probChunk).toFixed(1)}s → ${f2}`);
  console.log(`                     cierre (CTA "${ctaChunk.text}" + @) → ${f3}`);
  const brandPx1 = countBrandInFrame(f1, '#2793C8');
  ok(brandPx1 > 600, 'render 1: palabra clave + barra en el color de marca del cliente (píxeles reales)', String(brandPx1));

  // ============ RENDER 2: cafetería, venta (fade/push-in), 15 s ============
  const scriptCafe = await rs.buildReelScript({
    digest: DIGEST_CAFETERIA, durationSec: 15,
    post: { caption: 'Flat white ☕', source_topic: 'Flat white', salesIntent: 'venta' },
    aiCall: async () => JSON.parse(JSON.stringify(SCRIPT_CAFE_15)),
  });
  ok(scriptCafe.source === 'ai', 'render 2: guion IA (stub) válido', scriptCafe.degradeReason || '');
  const planCafe = kc.planKineticCaptions(scriptCafe);
  const r2 = await engine.buildReelPro({
    mediaDir: OUT, photos: cafe.slice(0, 4), videos: [],
    script: scriptCafe, captionPlan: planCafe, template: 'venta',
    handle: '@cafebruma', brandHex: '#FEC14D', mood: 'chill',
    rubro: 'cafeteria',
    keywords: ['Flat white', 'Medialunas de manteca', 'Café en grano de Etiopía'],
  });
  const p2 = probe(r2.file);
  const esperado2 = 15 - 3 * engine.templateFor('venta').xf; // 13.8
  ok(Math.abs(Number(p2.format.duration) - esperado2) < 0.35, `render 2: duración ≈ ${esperado2}s`, p2.format.duration);
  ok(Array.isArray(r2.effects) && r2.effects.length === 4 && r2.effects.every(e => e.effectId === 'vineta-calida-cafe'),
    'render 2: prompt viñeta cálida de café registrado en todas las escenas', JSON.stringify((r2.effects || []).map(e => e.effectId)));
  const f4 = frameAt(r2.file, 0.8, path.join(OUT, 'r2-hook.jpg'));
  console.log(`    render 2: ${r2.file} · beatsSnapped=${r2.beatsSnapped} · frame hook → ${f4}`);
  const brandPx2 = countBrandInFrame(f4, '#FEC14D');
  ok(brandPx2 > 600, 'render 2: énfasis de marca (amarillo del cliente) presente en el gancho', String(brandPx2));

  // ============ REGRESIÓN: v2 sin script sigue igual ============
  const r3 = await engine.buildReelPro({
    mediaDir: OUT, photos: belleza.slice(0, 3), videos: [],
    hook: 'Gancho de siempre', mid: 'Beat de siempre', cta: '¡Seguinos!',
    handle: '@salonaurora', brandHex: '#2793C8', mood: 'chill',
  });
  const p3 = probe(r3.file);
  const d3 = Number(p3.format.duration);
  ok(!r3.scripted && d3 >= 7.5 && d3 <= 14.2, 'regresión v2: sin script, duración en rango 8–14s', String(d3));
  console.log(`    regresión v2: ${r3.file} · duración=${d3}`);

  console.log(`\n${pass} PASS · ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('ERROR', e); process.exit(1); });
