// Harness del lote reel-handle-largo — bug genPlatePng (handle >16 caracteres).
// Corre: node test-lote-reel-handle-largo.js
//   [REEL_ENGINE_DIR=/ruta/al/arbol] — por defecto, el árbol donde vive este test.
// Render REAL con ffmpeg, sin IA paga, sin red.
// En prístino v729 tiene que FALLAR: la pastilla de @posty.communitymanager
// mide 1339 px y el pad=1080:1920 del cierre revienta el render entero
// («Padded dimensions cannot be smaller than input dimensions»).
// Con el fix tiene que dar verde: la fuente se achica hasta que la pastilla
// entre en 1000 px; para handles cortos el camino es el de siempre (82 px).
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra || ''); }
}

const ENGINE_DIR = process.env.REEL_ENGINE_DIR || __dirname;
const ENGINE = path.join(ENGINE_DIR, 'reel-engine.js');
const KINETIC = path.join(ENGINE_DIR, 'kinetic-captions.js');

const LONG = '@posty.communitymanager'; // 21 caracteres — el caso real del prototipo
const SHORT = '@posty';                 // 6 caracteres — el caso normal de clientes
const MAX30 = '@' + 'a'.repeat(30);    // 31 caracteres — máximo que permite Instagram

function probe(file) {
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-show_entries', 'format=duration', '-of', 'json', file], { encoding: 'utf8' }));
    const v = (j.streams || []).find(s => s.width);
    return v ? { w: v.width, h: v.height, dur: Number(j.format && j.format.duration) || 0 } : null;
  } catch (e) { return null; }
}

function pngDims(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function makePhoto(dir, name) {
  const p = path.join(dir, name);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x2793C8:s=1080x1920', '-frames:v', '1', p]);
  return p;
}

function miniScript() {
  const scenes = [
    { role: 'hook', line: 'Tu feed queda a medias y no te trae clientes.', start: 0, end: 2, seconds: 2 },
    { role: 'solution', line: 'Posty postea por vos, todos los días.', start: 2, end: 4, seconds: 2 },
    { role: 'cta', line: '3 días gratis. Link en bio.', start: 4, end: 6, seconds: 2 },
  ];
  return { scenes, durationSec: 6, intent: 'venta' };
}

async function renderWithHandle(engine, kinetic, handle, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-handle-' + tag + '-'));
  const photo = makePhoto(dir, 'foto.png');
  const script = miniScript();
  const captionPlan = kinetic.planKineticCaptions(script);
  const chk = kinetic.validateCaptionPlan(captionPlan);
  if (!chk.ok) throw new Error('captionPlan inválido: ' + JSON.stringify(chk.errors));
  const out = await engine.buildReelPro({
    mediaDir: dir, photos: [photo], videos: [], script, captionPlan,
    template: 'venta',
    hook: script.scenes[0].line, mid: script.scenes[1].line, cta: script.scenes[2].line,
    handle, brandHex: '#2793C8', mood: 'upbeat', musicSeed: 'test-handle-largo',
    keywords: ['clientes'],
  });
  return { out, dir };
}

async function main() {
  console.log('== test-lote-reel-handle-largo.js ==');
  console.log('  engine:', ENGINE);

  // 0. Sintaxis
  try {
    execFileSync('node', ['--check', ENGINE], { stdio: 'ignore' });
    ok(true, 'node --check reel-engine.js');
  } catch (e) { ok(false, 'node --check reel-engine.js', e.message); }

  const engine = require(ENGINE);
  const kinetic = require(KINETIC);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-plate-'));
  const hasPlate = typeof engine.genPlatePng === 'function';
  console.log('  genPlatePng exportado:', hasPlate);

  // 1. Unidad — handle largo: la pastilla tiene que entrar en 1000 px
  if (hasPlate) {
    const plate = await engine.genPlatePng(tmp, LONG, '#2793C8');
    ok(plate.w <= 1000, 'U1 largo: pastilla <= 1000 px', 'w=' + plate.w);
    ok(fs.existsSync(plate.file), 'U1 largo: plate.png existe');
    const d = pngDims(plate.file);
    ok(!!d && d.w === plate.w && d.h === 150, 'U1 largo: PNG mide w x 150', JSON.stringify(d));
  } else {
    // Prístino (sin export): el ancho que daría el camino viejo, a 82 px fijos.
    const adv = await engine.measureAdvance(LONG, 82, tmp);
    ok(adv + 96 <= 1000, 'U1 largo: pastilla <= 1000 px (camino viejo)', 'w=' + (adv + 96));
  }

  // 2. Unidad — handle corto: NO se achica nada, mismo ancho que antes
  const advShort = await engine.measureAdvance(SHORT, 82, tmp);
  if (hasPlate) {
    const plate = await engine.genPlatePng(tmp, SHORT, '#2793C8');
    ok(plate.w === advShort + 96, 'U2 corto: mismo ancho que a 82 px (sin achicar)', 'w=' + plate.w + ' esperado=' + (advShort + 96));
    const d = pngDims(plate.file);
    ok(!!d && d.w === plate.w && d.h === 150, 'U2 corto: PNG mide w x 150', JSON.stringify(d));
  } else {
    ok(advShort + 96 <= 1000, 'U2 corto: pastilla <= 1000 px (camino viejo)', 'w=' + (advShort + 96));
  }

  // 3. Unidad — handle de 30 caracteres (máximo de Instagram): también entra
  if (hasPlate) {
    const plate = await engine.genPlatePng(tmp, MAX30, '#2793C8');
    ok(plate.w <= 1000, 'U3 máximo IG (31 car.): pastilla <= 1000 px', 'w=' + plate.w);
  } else {
    const adv = await engine.measureAdvance(MAX30, 82, tmp);
    ok(adv + 96 <= 1000, 'U3 máximo IG (31 car.): pastilla <= 1000 px (camino viejo)', 'w=' + (adv + 96));
  }

  // 4. End-to-end — handle largo: el render completo NO revienta
  try {
    const { out } = await renderWithHandle(engine, kinetic, LONG, 'largo');
    ok(!!out && !!out.file && fs.existsSync(out.file), 'E1 largo: buildReelPro termina y deja el mp4', out && out.file);
    const p = out && out.file ? probe(out.file) : null;
    ok(!!p && p.w === 1080 && p.h === 1920, 'E1 largo: salida 1080x1920', JSON.stringify(p));
  } catch (e) {
    ok(false, 'E1 largo: buildReelPro termina y deja el mp4', String(e && e.message || e).slice(0, 200));
    ok(false, 'E1 largo: salida 1080x1920', 'sin archivo (el render reventó)');
  }

  // 5. End-to-end — handle corto: sigue andando como siempre
  try {
    const { out } = await renderWithHandle(engine, kinetic, SHORT, 'corto');
    ok(!!out && !!out.file && fs.existsSync(out.file), 'E2 corto: buildReelPro termina y deja el mp4', out && out.file);
    const p = out && out.file ? probe(out.file) : null;
    ok(!!p && p.w === 1080 && p.h === 1920, 'E2 corto: salida 1080x1920', JSON.stringify(p));
  } catch (e) {
    ok(false, 'E2 corto: buildReelPro termina y deja el mp4', String(e && e.message || e).slice(0, 200));
    ok(false, 'E2 corto: salida 1080x1920', 'sin archivo (el render reventó)');
  }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`== ${pass} ok, ${fail} fallos ==`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FALLO DEL HARNESS:', e); process.exit(2); });
