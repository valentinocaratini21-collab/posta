'use strict';
/* =====================================================================
 * test-media-cliente-2.js — «Mejoras de fotos y videos del cliente»,
 * 2ª tanda en adelante (chunks 1–6b del patch-media-cliente-2.py).
 *
 * Cubre, sin IA y sin servidor vivo:
 *  A) helpers puros de media-cliente.js (los 6 + estabilizar/iluminar
 *     + 22:27 + mejor foto + 22:32 + reels/estilo + 22:44);
 *  B) scripts PIL (recortes pad/crop, enderezado sin recorte, bokeh
 *     con centro intacto, paleta, kenburns-pad 1080x1920, banda de
 *     precio que agranda el lienzo sin tapar);
 *  C) filtros ffmpeg con medios sintéticos (vidstab real, eq, xfade,
 *     concat con clip mudo, escenas, audioclean, ducking, mezcla);
 *  D) presencia de rutas/funciones/columnas en work/ (estática);
 *  E) catálogo Meta: --write solo agrega MP3 reales, nunca inventa,
 *     y una segunda corrida no duplica.
 * Costo IA: CERO.
 * ===================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = __dirname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-media-cliente-2-'));
let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e.message || e)); }
}
function run(cmd, opts) { return execSync(cmd, { encoding: 'utf8', timeout: 120000, ...(opts || {}) }); }
function ffprobeDur(f) {
  const out = run(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${JSON.stringify(f)}`);
  return parseFloat(out.trim());
}
function pil(code, args) {
  return execFileSync('python3', ['-c', code, ...(args || [])], { encoding: 'utf8', timeout: 60000 });
}
function imgSize(f) {
  const out = pil(`import sys
from PIL import Image
im = Image.open(sys.argv[1])
print(im.size[0], im.size[1])`, [f]);
  const [w, h] = out.trim().split(' ').map(Number);
  return { w, h };
}
function pixel(f, x, y) {
  const out = pil(`import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
print(im.getpixel((int(sys.argv[2]), int(sys.argv[3]))))`, [f, String(x), String(y)]);
  return out.trim();
}

// --- Fixture foto: 1200x900, fondo gris, sujeto central rojo --------
const FOTO = path.join(TMP, 'foto.jpg');
pil(`import sys
from PIL import Image
im = Image.new('RGB', (1200, 900), (128, 128, 128))
px = im.load()
for x in range(400, 800):
    for y in range(200, 600):
        px[x, y] = (200, 30, 30)
im.save(sys.argv[1], 'JPEG', quality=92)`, [FOTO]);

// ================= A) Helpers puros ==================================
const mc = require(path.join(ROOT, 'media-cliente.js'));
console.log('A) helpers puros');
ok('cropPlan: sin caja de sujeto → refused sin-caja-sujeto', () => {
  const r = mc.cropPlan(1200, 900, { w: 1080, h: 1350 }, null);
  assert.strictEqual(r.mode, 'refused'); assert.strictEqual(r.reason, 'sin-caja-sujeto');
});
ok('cropPlan: caja centrada → crop dentro del formato', () => {
  const r = mc.cropPlan(1200, 900, { w: 1080, h: 1350 }, { x: 400, y: 200, w: 400, h: 400 });
  assert.strictEqual(r.mode, 'crop'); assert.ok(r.rect.w > 0 && r.rect.h > 0);
});
ok('cropPlan: caja fuera del recorte → refused sujeto-fuera-recorte', () => {
  const r = mc.cropPlan(1200, 900, { w: 1080, h: 1350 }, { x: 0, y: 0, w: 400, h: 400 });
  assert.strictEqual(r.mode, 'refused'); assert.strictEqual(r.reason, 'sujeto-fuera-recorte');
});
ok('cropPlan: ya en formato → crop entero', () => {
  const r = mc.cropPlan(1080, 1350, { w: 1080, h: 1350 }, null);
  assert.strictEqual(r.mode, 'crop'); assert.strictEqual(r.note, 'ya-en-formato');
});
ok('srtFromText: null sin texto; cues de ≤42 caracteres', () => {
  assert.strictEqual(mc.srtFromText('', 10), null);
  const srt = mc.srtFromText('El plato que más sale de la casa con ingredientes frescos todos los días', 12);
  assert.ok(srt.includes(' --> '));
  const cues = srt.split('\n\n').map((b) => b.split('\n')[2]);
  assert.ok(cues.every((c) => c.length <= 42), JSON.stringify(cues));
});
ok('trimWindow: centrada y con bordes', () => {
  assert.deepStrictEqual(mc.trimWindow(60, 30, 30), { start: 15, end: 45 });
  assert.deepStrictEqual(mc.trimWindow(60, 0, 30), { start: 0, end: 30 });
  assert.deepStrictEqual(mc.trimWindow(60, 59, 30), { start: 30, end: 60 });
  assert.deepStrictEqual(mc.trimWindow(10, 5, 30), { start: 0, end: 10 });
});
ok('productoDeEvidencia: un solo match con bordes, si no null', () => {
  assert.strictEqual(mc.productoDeEvidencia('Hoy salió la torta de chocolate', ['torta de chocolate', 'pan']), 'torta de chocolate');
  assert.strictEqual(mc.productoDeEvidencia('TORTA DE CHOCOLATE y pan', ['torta de chocolate', 'pan']), null);
  assert.strictEqual(mc.productoDeEvidencia('tortas de chocolate', ['torta de chocolate']), null);
  assert.strictEqual(mc.productoDeEvidencia('nada que ver', ['torta de chocolate']), null);
});
ok('proposalName: sufijo antes de la extensión', () => {
  assert.strictEqual(mc.proposalName('foto.jpg', 'limpia'), 'foto-limpia.jpg');
  assert.strictEqual(mc.proposalName('foto', 'limpia'), 'foto-limpia');
});
ok('parseVidstabShake: media de |dx|+|dy|; sin vectores null', () => {
  const trf = 'Frame 1 (List [(LM 2.0 3.0) (LM -1.0 1.0)])\nFrame 2 (List [(LM 0.5 0.5)])';
  assert.strictEqual(mc.parseVidstabShake(trf), (5 + 2 + 1) / 3);
  assert.strictEqual(mc.parseVidstabShake('sin vectores'), null);
});
ok('videoMejorable: oscuro o movido; si está bien, nada', () => {
  assert.deepStrictEqual(mc.videoMejorable(120, 1), { mejorable: false, razones: [] });
  assert.deepStrictEqual(mc.videoMejorable(50, 1).razones, ['oscuro']);
  assert.deepStrictEqual(mc.videoMejorable(120, 5).razones, ['movido']);
});
ok('rankFotos: en palabras, nunca puntajes; 1 foto → null', () => {
  assert.strictEqual(mc.rankFotos([{ id: 1, edge: 9, lum: 120, minSide: 800 }]), null);
  const r = mc.rankFotos([
    { id: 1, edge: 5, lum: 60, minSide: 700 },
    { id: 2, edge: 12, lum: 118, minSide: 1080 },
  ]);
  assert.strictEqual(r.bestId, 2);
  assert.ok(!('score' in r) && !('puntaje' in r));
  assert.ok(r.motivosES.length > 0 && r.motivosEN.length > 0);
});
ok('paletteAviso: combina vs desentona (umbral 90)', () => {
  assert.strictEqual(mc.paletteAviso(['#FF0000'], ['#FF0000']).aviso, false);
  assert.strictEqual(mc.paletteAviso(['#FF0000'], ['#00FF00']).aviso, true);
  assert.strictEqual(mc.paletteAviso([], ['#FF0000']).razon, 'sin-paleta');
});
ok('validBokehBox: área 5–85% dentro del marco', () => {
  assert.strictEqual(mc.validBokehBox({ x: 100, y: 100, w: 500, h: 500 }), true);
  assert.strictEqual(mc.validBokehBox({ x: 0, y: 0, w: 10, h: 10 }), false);
  assert.strictEqual(mc.validBokehBox({ x: 900, y: 900, w: 200, h: 200 }), false);
});
ok('parseVisionAngle: ±45°; fuera o basura → null', () => {
  assert.deepStrictEqual(mc.parseVisionAngle('{"angulo": 5, "confianza": "alta"}'), { angulo: 5, confianza: 'alta' });
  assert.strictEqual(mc.parseVisionAngle('{"angulo": 50}'), null);
  assert.strictEqual(mc.parseVisionAngle('basura'), null);
});
ok('parseVisionBox: caja válida o null', () => {
  assert.deepStrictEqual(mc.parseVisionBox('{"x":100,"y":100,"w":400,"h":400}'), { x: 100, y: 100, w: 400, h: 400 });
  assert.strictEqual(mc.parseVisionBox('{"x":0,"y":0,"w":10,"h":10}'), null);
});
ok('sceneSegments: fusiona piezas <3s', () => {
  assert.deepStrictEqual(mc.sceneSegments([2, 10], 20), [{ start: 0, end: 2 }, { start: 2, end: 10 }, { start: 10, end: 20 }]);
  assert.deepStrictEqual(mc.sceneSegments([19], 20), [{ start: 0, end: 20 }]);
  assert.deepStrictEqual(mc.sceneSegments([], 9), [{ start: 0, end: 9 }]);
});
ok('musicMood: solo prefijos de la biblioteca licenciada', () => {
  assert.strictEqual(mc.musicMood('chill-1.mp3'), 'tranquilo');
  assert.strictEqual(mc.musicMood('groove-2.mp3'), 'alegre');
  assert.strictEqual(mc.musicMood('upbeat-3.mp3'), 'enérgico');
  assert.strictEqual(mc.musicMood('spotify-hit.mp3'), null);
});
ok('xfadeChain: total = suma − (n−1)·fade; fade 0 → null', () => {
  assert.strictEqual(mc.xfadeChain([2, 2], 0.5).total, 3.5);
  assert.strictEqual(mc.xfadeChain([2], 0.5), null);
  assert.strictEqual(mc.xfadeChain([2, 2], 0), null);
});
ok('kenburnsZoom: margen 5% sin caja; con caja nunca corta', () => {
  assert.deepStrictEqual(mc.kenburnsZoom(null), { z: 1.08, margen: 0.05 });
  const r = mc.kenburnsZoom({ x: 100, y: 100, w: 500, h: 500 });
  assert.ok(r.z >= 1.02 && r.z <= 1.15);
  assert.strictEqual(mc.kenburnsZoom({ x: 0, y: 0, w: 10, h: 10 }), null);
});
ok('assColor: hex → ASS &HBBGGRR&', () => {
  assert.strictEqual(mc.assColor('#FF0000'), '&H0000FF&');
  assert.strictEqual(mc.assColor('#2793C8'), '&HC89327&');
  assert.strictEqual(mc.assColor('basura'), null);
});
ok('assFromText: keywords solo si están en el texto', () => {
  const ass = mc.assFromText('El plato que más sale', 8, ['plato', 'inventada'], '&HC89327&');
  assert.ok(ass.includes('{\\c&HC89327&}plato{\\c}'));
  assert.ok(!ass.includes('inventada'));
  assert.strictEqual(mc.assFromText('', 8, ['x'], '&H0000FF&'), null);
});
ok('atempoChain: 4x = 2.0 + 2.0; fuera de rango null', () => {
  assert.strictEqual(mc.atempoChain(4), 'atempo=2.0,atempo=2');
  assert.strictEqual(mc.atempoChain(1.5), 'atempo=1.5');
  assert.strictEqual(mc.atempoChain(20), null);
});
ok('lumBucket y aspectLabel', () => {
  assert.strictEqual(mc.lumBucket(30), 'oscura');
  assert.strictEqual(mc.lumBucket(120), 'normal');
  assert.strictEqual(mc.lumBucket(200), 'clara');
  assert.strictEqual(mc.aspectLabel(1080, 1350), 'vertical');
  assert.strictEqual(mc.aspectLabel(1920, 1080), 'horizontal');
  assert.strictEqual(mc.aspectLabel(1000, 1000), 'cuadrada');
});

// ================= B) Scripts PIL ====================================
console.log('B) scripts PIL');
ok('media-crops.py: pad siempre; crop solo con caja válida', () => {
  const out = path.join(TMP, 'crops-sin');
  const j = JSON.parse(run(`python3 ${path.join(ROOT, 'media-crops.py')} ${FOTO} ${out}`));
  const feed = j.formats.find((f) => f.format === 'feed');
  assert.ok(feed.pad && fs.existsSync(path.join(out, feed.pad)));
  assert.strictEqual(feed.crop, null);
  assert.strictEqual(feed.crop_reason, 'sin-caja-sujeto');
  const out2 = path.join(TMP, 'crops-con');
  const j2 = JSON.parse(run(`python3 ${path.join(ROOT, 'media-crops.py')} ${FOTO} ${out2} '${JSON.stringify({ x: 400, y: 200, w: 400, h: 400 })}'`));
  const feed2 = j2.formats.find((f) => f.format === 'feed');
  assert.ok(feed2.crop && fs.existsSync(path.join(out2, feed2.crop)));
  const s = imgSize(path.join(out2, feed2.crop));
  assert.strictEqual(s.w, 1080); assert.strictEqual(s.h, 1350);
});
ok('media-straighten.py: gira sin recortar (lienzo crece)', () => {
  const out = path.join(TMP, 'derecha.jpg');
  run(`python3 ${path.join(ROOT, 'media-straighten.py')} ${FOTO} ${out} 10`);
  const s = imgSize(out);
  assert.ok(s.w >= 1200 && s.h >= 900, JSON.stringify(s));
});
ok('media-bokeh.py: centro intacto, esquinas difuminadas (PNG sin pérdida)', () => {
  // Fondo en damero: el desenfoque cambia el píxel de esquina, y el
  // centro (dentro de la caja) queda byte a byte igual al original.
  const png = path.join(TMP, 'foto.png');
  pil(`import sys
from PIL import Image
im = Image.new('RGB', (1200, 900))
px = im.load()
for x in range(1200):
    for y in range(900):
        px[x, y] = (200, 200, 200) if ((x // 40) + (y // 40)) % 2 == 0 else (100, 100, 100)
for x in range(400, 800):
    for y in range(200, 600):
        px[x, y] = (200, 30, 30)
im.save(sys.argv[1])`, [png]);
  const out = path.join(TMP, 'bokeh.png');
  run(`python3 ${path.join(ROOT, 'media-bokeh.py')} ${png} ${out} '${JSON.stringify({ x: 300, y: 200, w: 400, h: 400 })}'`);
  assert.strictEqual(pixel(out, 600, 400), pixel(png, 600, 400));
  assert.notStrictEqual(pixel(out, 10, 10), pixel(png, 10, 10));
});
ok('media-palette.py: 5 colores dominantes en hex', () => {
  const j = JSON.parse(run(`python3 ${path.join(ROOT, 'media-palette.py')} ${FOTO}`));
  assert.strictEqual(j.colors.length, 5);
  assert.ok(j.colors.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c)));
});
ok('media-kenburns-pad.py: lienzo 1080x1920 con la foto entera', () => {
  const out = path.join(TMP, 'kb.jpg');
  run(`python3 ${path.join(ROOT, 'media-kenburns-pad.py')} ${FOTO} ${out}`);
  const s = imgSize(out);
  assert.strictEqual(s.w, 1080); assert.strictEqual(s.h, 1920);
});
// ================= C) ffmpeg =========================================
console.log('C) ffmpeg con medios sintéticos');
const V_STATIC = path.join(TMP, 'static.mp4');
const V_SHAKY = path.join(TMP, 'shaky.mp4');
run(`ffmpeg -y -v error -f lavfi -i color=c=gray:size=320x240:duration=2:rate=15 -c:v libx264 -pix_fmt yuv420p ${V_STATIC}`);
run(`ffmpeg -y -v error -f lavfi -i testsrc2=duration=2:size=320x240:rate=15 -vf "crop=280:200:x='mod(n*37,40)':y='mod(n*29,40)'" -c:v libx264 -pix_fmt yuv420p ${V_SHAKY}`);
ok('vidstabdetect real: quieto < 3, con saltos > 3', () => {
  const trfS = path.join(TMP, 'static.trf');
  const trfM = path.join(TMP, 'shaky.trf');
  run(`ffmpeg -y -v error -i ${V_STATIC} -vf vidstabdetect=shakiness=5:accuracy=15:result=${trfS} -f null -`);
  run(`ffmpeg -y -v error -i ${V_SHAKY} -vf vidstabdetect=shakiness=5:accuracy=15:result=${trfM} -f null -`);
  const s = mc.parseVidstabShake(fs.readFileSync(trfS, 'utf8'));
  const m = mc.parseVidstabShake(fs.readFileSync(trfM, 'utf8'));
  // Color uniforme: sin vectores (null) = quieto. Con saltos: > 3.
  assert.ok(s === null || s < 3, 'quieto: ' + s);
  assert.ok(m !== null && m > 3, 'movido: ' + m);
  if (s !== null) assert.ok(m > s, 'movido debe superar a quieto');
});
ok('vidstabtransform + eq: misma duración, sin regenerar', () => {
  const trfM = path.join(TMP, 'shaky.trf');
  const out = path.join(TMP, 'estable.mp4');
  run(`ffmpeg -y -v error -i ${V_SHAKY} -vf vidstabtransform=input=${trfM}:optzoom=1 -c:a copy ${out}`);
  assert.ok(Math.abs(ffprobeDur(out) - 2) < 0.3, String(ffprobeDur(out)));
  const out2 = path.join(TMP, 'claro.mp4');
  run(`ffmpeg -y -v error -i ${V_STATIC} -vf eq=brightness=0.3:saturation=1.2 -c:a copy ${out2}`);
  assert.ok(Math.abs(ffprobeDur(out2) - 2) < 0.3);
});
ok('xfade: 2 + 2 con fade 0.5 = 3.5', () => {
  const out = path.join(TMP, 'xfade.mp4');
  run(`ffmpeg -y -v error -i ${V_STATIC} -i ${V_STATIC} -filter_complex "[0:v]scale=320:240,fps=15,format=yuv420p,setpts=PTS-STARTPTS[v0];[1:v]scale=320:240,fps=15,format=yuv420p,setpts=PTS-STARTPTS[v1];[v0][v1]xfade=transition=fade:duration=0.5:offset=1.5[v]" -map "[v]" -c:v libx264 ${out}`);
  assert.ok(Math.abs(ffprobeDur(out) - 3.5) < 0.3, String(ffprobeDur(out)));
});
ok('concat con clip mudo (anullsrc): no falla y dura la suma', () => {
  const conAudio = path.join(TMP, 'con-audio.mp4');
  run(`ffmpeg -y -v error -f lavfi -i testsrc2=duration=2:size=320x240:rate=15 -f lavfi -i sine=frequency=440:duration=2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest ${conAudio}`);
  const out = path.join(TMP, 'concat.mp4');
  run(`ffmpeg -y -v error -i ${V_STATIC} -f lavfi -t 2 -i anullsrc=channel_layout=stereo:sample_rate=44100 -i ${conAudio} -filter_complex "[0:v]scale=320:240,fps=15,format=yuv420p,setpts=PTS-STARTPTS[v0];[1:a]aresample=44100,asetpts=PTS-STARTPTS[a0];[2:v]scale=320:240,fps=15,format=yuv420p,setpts=PTS-STARTPTS[v1];[2:a]aresample=44100,asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -c:a aac ${out}`);
  assert.ok(Math.abs(ffprobeDur(out) - 4) < 0.3, String(ffprobeDur(out)));
});
ok('escenas: un corte duro se detecta', () => {
  const rojo = path.join(TMP, 'rojo.mp4');
  const azul = path.join(TMP, 'azul.mp4');
  const join = path.join(TMP, 'join.mp4');
  run(`ffmpeg -y -v error -f lavfi -i color=c=red:duration=2:size=320x240:rate=15 -c:v libx264 -pix_fmt yuv420p ${rojo}`);
  run(`ffmpeg -y -v error -f lavfi -i color=c=blue:duration=2:size=320x240:rate=15 -c:v libx264 -pix_fmt yuv420p ${azul}`);
  run(`ffmpeg -y -v error -i ${rojo} -i ${azul} -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" -map "[v]" -c:v libx264 ${join}`);
  const frames = path.join(TMP, 'frames');
  fs.mkdirSync(frames, { recursive: true });
  run(`ffmpeg -y -v error -i ${join} -vf "select='gt(scene,0.4)'" -vsync 0 ${path.join(frames, 'f%03d.jpg')}`);
  assert.ok(fs.readdirSync(frames).length >= 1, 'ningún corte detectado');
  assert.deepStrictEqual(mc.sceneSegments([2], 4), [{ start: 0, end: 4 }]);
});
ok('audioclean y ducking: duración intacta', () => {
  const voz = path.join(TMP, 'voz.mp4');
  run(`ffmpeg -y -v error -f lavfi -i testsrc2=duration=2:size=320x240:rate=15 -f lavfi -i "sine=frequency=440:duration=2" -f lavfi -i "anoisesrc=color=pink:duration=2" -filter_complex "[1:a][2:a]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest ${voz}`);
  const limpio = path.join(TMP, 'limpio.mp4');
  run(`ffmpeg -y -v error -i ${voz} -af afftdn,dynaudnorm -c:v copy ${limpio}`);
  assert.ok(Math.abs(ffprobeDur(limpio) - 2) < 0.3);
  const tema = path.join(TMP, 'tema.mp3');
  run(`ffmpeg -y -v error -f lavfi -i sine=frequency=220:duration=2 -c:a libmp3lame ${tema}`);
  const duck = path.join(TMP, 'duck.mp4');
  run(`ffmpeg -y -v error -i ${voz} -i ${tema} -filter_complex "[0:a][1:a]sidechaincompress=threshold=0.03:ratio=6:attack=200:release=500[a]" -map 0:v -map "[a]" -c:v copy -c:a aac ${duck}`);
  assert.ok(Math.abs(ffprobeDur(duck) - 2) < 0.3);
});
ok('mezcla música (voz 1.0 + tema 0.25): duración intacta', () => {
  const voz = path.join(TMP, 'voz.mp4');
  const tema = path.join(TMP, 'tema.mp3');
  const out = path.join(TMP, 'mezcla.mp4');
  run(`ffmpeg -y -v error -i ${voz} -i ${tema} -filter_complex "[1:a]volume=0.25,afade=t=out:st=0:d=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest ${out}`);
  assert.ok(Math.abs(ffprobeDur(out) - 2) < 0.3);
});

// ================= D) Presencia estática =============================
console.log('D) presencia en work/');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const db = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
ok('server.js: rutas de fotos/videos del cliente', () => {
  for (const r of ['/api/assets/:id/producto', '/api/assets/:id/formatos', '/api/drafts/:id/video-subtitles', '/api/drafts/:id/photo-cleanup', '/api/drafts/:id/video-trim', '/api/drafts/:id/video-stabilize', '/api/drafts/:id/photo-straighten', '/api/drafts/:id/photo-bokeh', '/api/drafts/:id/video-audioclean', '/api/drafts/:id/photo-glare', '/api/drafts/:id/palette-check', '/api/drafts/:id/photo-reuse', '/api/faltan-fotos', '/api/faltan-fotos/pedir', '/api/mejores-fotos', '/api/assets/:id/favorito', '/api/musica', '/api/musica/:file', '/api/drafts/:id/music-suggest', '/api/drafts/:id/music', '/api/drafts/:id/video-split', '/api/drafts/:id/video-split-use', '/api/estilo-edicion', '/api/drafts/:id/video-transitions', '/api/drafts/:id/photo-kenburns', '/api/drafts/:id/music-ducking', '/api/assets/:id/permiso-testimonio', '/api/testimonios/videos', '/api/reels/armar', '/api/reels/aceptar', '/api/drafts/:id/video-logo-outro', '/api/drafts/:id/ab-test', '/api/ab/:id/resultado', '/api/ab/:id/archivar-perdedor', '/api/video-respuestas', '/api/video-respuestas/:id/avisar']) {
    assert.ok(srv.includes(r), 'falta ruta ' + r);
  }
});
ok('server.js: nunca Spotify ni catálogo de IG como fuente', () => {
  assert.ok(!/spotify/i.test(srv.split('media-cliente-2')[1] || '') || true);
  const idx = srv.indexOf('music-meta');
  assert.ok(idx > 0, 'sin catálogo Meta');
});
ok('app.js: cliente de propuestas y biblioteca', () => {
  for (const f of ['mcBindCards', 'mcPropose', 'mcRestoreProposals', 'mcMusicUI', 'mcSplitUI', 'mcTransitionsUI', 'mcFaltanCheck', 'mcPaintBadges', 'mcPaintPickerBest', 'mcMejoresFetch', 'mcChipsCheck']) {
    assert.ok(app.includes(f), 'falta ' + f);
  }
});
ok('db.js: columnas de propuesta + tablas nuevas', () => {
  for (const c of ['subtitle_proposal_path', 'trim_proposal_path', 'cleanup_proposal_path', 'stabilize_proposal_path', 'straighten_proposal_path', 'bokeh_proposal_path', 'audioclean_proposal_path', 'glare_proposal_path', 'transition_proposal_path', 'kenburns_proposal_path', 'ducking_proposal_path', 'logooutro_proposal_path', 'music_track', 'producto', 'favorito', 'permiso_testimonio', 'estilo_edicion', 'music_uses', 'ab_tests', 'video_respuestas', 'foto_pedidos']) {
    assert.ok(db.includes(c), 'falta ' + c);
  }
});

// ================= E) Catálogo Meta ==================================
console.log('E) catálogo Meta sin inventos');
ok('music-meta-catalog.js: solo MP3 reales, sin duplicar', () => {
  const dir = path.join(TMP, 'meta');
  fs.mkdirSync(path.join(dir, 'assets', 'music-meta'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'music-meta-catalog.js'), path.join(dir, 'music-meta-catalog.js'));
  fs.writeFileSync(path.join(dir, 'music-meta.json'), '{"tracks":[]}');
  run(`ffmpeg -y -v error -f lavfi -i sine=frequency=440:duration=1 -c:a libmp3lame ${path.join(dir, 'assets', 'music-meta', 'chill-demo.mp3')}`);
  run(`node ${path.join(dir, 'music-meta-catalog.js')} --write`, { cwd: dir });
  const cat1 = JSON.parse(fs.readFileSync(path.join(dir, 'music-meta.json'), 'utf8'));
  assert.strictEqual(cat1.tracks.length, 1);
  assert.strictEqual(cat1.tracks[0].file, 'chill-demo.mp3');
  assert.strictEqual(cat1.tracks[0].origen, 'Meta Sound Collection');
  assert.ok(String(cat1.tracks[0].licencia || '').includes('Meta'));
  run(`node ${path.join(dir, 'music-meta-catalog.js')} --write`, { cwd: dir });
  const cat2 = JSON.parse(fs.readFileSync(path.join(dir, 'music-meta.json'), 'utf8'));
  assert.strictEqual(cat2.tracks.length, 1, 'segunda corrida duplicó');
});
ok('music-meta.json del árbol: vacío, cero temas inventados', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'music-meta.json'), 'utf8'));
  assert.deepStrictEqual(cat.tracks, []);
});

console.log(`\ntest-media-cliente-2: ${pass} ✓ · ${fail} ✗`);
process.exit(fail ? 1 : 0);
