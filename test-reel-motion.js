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
  const r1 = await engine.buildReelPro({
    mediaDir: OUT, photos: belleza.slice(0, 5), videos: [],
    script: scriptPelu, captionPlan: planPelu, template: 'reserva',
    handle: '@salonaurora', brandHex: '#2793C8', mood: 'chill',
  });
  ok(r1.scripted === true && r1.template === 'reserva', 'render 1: despachó a v3 con plantilla reserva');
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
  });
  const p2 = probe(r2.file);
  const esperado2 = 15 - 3 * engine.templateFor('venta').xf; // 13.8
  ok(Math.abs(Number(p2.format.duration) - esperado2) < 0.35, `render 2: duración ≈ ${esperado2}s`, p2.format.duration);
  const f4 = frameAt(r2.file, 0.8, path.join(OUT, 'r2-hook.jpg'));
  console.log(`    render 2: ${r2.file} · beatsSnapped=${r2.beatsSnapped} · frame hook → ${f4}`);

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
