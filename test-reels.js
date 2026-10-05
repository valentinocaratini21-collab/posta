// Harness de reels.js — NO va al deploy.
// Corre: node test-reels.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra || ''); }
}

async function main() {
  console.log('== test-reels.js ==');

  // 1. Sintaxis
  try {
    execFileSync('node', ['--check', path.join(__dirname, 'reels.js')], { stdio: 'ignore' });
    ok(true, 'node --check reels.js');
  } catch (e) { ok(false, 'node --check reels.js', e.message); }

  const r = require('./reels');

  // 2. ffmpegAvailable
  ok(r.ffmpegAvailable() === true, 'ffmpegAvailable() === true');

  // 3. escapeDrawtext
  ok(r.escapeDrawtext("a:b'c\\d%e[f]g") === "a\\:b\\'c\\\\d\\%e\\[f\\]g", 'escapeDrawtext escapa : \' \\ % [ ]');
  ok(r.escapeDrawtext(null) === '', 'escapeDrawtext(null) === ""');

  // 4. REEL_MAX_PER_WEEK
  ok(r.REEL_MAX_PER_WEEK === 2, 'REEL_MAX_PER_WEEK === 2');

  // 5. Fotos de prueba (testsrc)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reels-test-'));
  const photos = [];
  for (let i = 0; i < 3; i++) {
    const p = path.join(dir, `foto${i + 1}.png`);
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `testsrc=size=1080x1920:duration=1:rate=30`,
      '-frames:v', '1', p], { stdio: 'ignore' });
    photos.push(p);
  }
  ok(photos.every(p => fs.existsSync(p)), '3 fotos de prueba generadas');

  // 6. buildReel con 3 fotos + headline con caracteres a escapar
  const outDir = path.join(dir, 'out');
  let res;
  try {
    res = await r.buildReel({
      photos,
      headline: "Oferta: 2x1 'imperdible' [hoy] 50% off \\ dale",
      brandHex: '#2793C8',
      businessName: 'Mi negocio',
      outDir,
    });
    ok(true, 'buildReel(3 fotos) resolvió');
  } catch (e) {
    ok(false, 'buildReel(3 fotos) resolvió', e.message);
  }

  if (res) {
    ok(fs.existsSync(res.path), 'mp4 generado', res.path);
    ok(fs.existsSync(res.coverPath), 'cover jpg generado', res.coverPath);
    // ffprobe: 1080×1920, sin audio, duración 14-16s
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format',
      '-print_format', 'json', res.path]).toString());
    const v = probe.streams.find(s => s.codec_type === 'video');
    const a = probe.streams.find(s => s.codec_type === 'audio');
    ok(v && v.width === 1080 && v.height === 1920, 'video 1080×1920', v && `${v.width}×${v.height}`);
    const dur = parseFloat(probe.format.duration);
    ok(dur >= 14 && dur <= 16, `duración ${dur.toFixed(2)}s en rango 14-16`, res.durationSec);
    ok(!a, 'sin stream de audio');
    ok(res.durationSec >= 14 && res.durationSec <= 16, 'durationSec consistente', res.durationSec);
    ok(res.audioNote.includes('audio en tendencia'), 'audioNote con instrucción de audio en tendencia');
    ok(Array.isArray(res.segments) && res.segments.length === 3, 'segments: 3 descriptos', JSON.stringify(res.segments.map(s => s.effect)));
    const coverStat = fs.statSync(res.coverPath);
    ok(coverStat.size > 1000, 'cover jpg con contenido', coverStat.size + ' bytes');
    // Nombre de archivos con el timestamp esperado
    ok(/reel-\d+\.mp4$/.test(res.path) && /reel-\d+-cover\.jpg$/.test(res.coverPath), 'nombres reel-<ts>.mp4 / reel-<ts>-cover.jpg');
    // Encoding: h264 + faststart (moov antes de mdat)
    const head = fs.readFileSync(res.path).subarray(0, 4096).toString('binary');
    ok(head.includes('moov'), 'faststart: moov al inicio');
  }

  // 7. photos=[] → error claro, sin colgar
  const t0 = Date.now();
  try {
    await r.buildReel({ photos: [], outDir });
    ok(false, 'photos=[] tira error', 'no tiró error');
  } catch (e) {
    ok(/al menos 1 foto/.test(e.message), 'photos=[] → error claro', e.message);
  }
  ok(Date.now() - t0 < 5000, 'photos=[] falla rápido (no cuelga)', (Date.now() - t0) + 'ms');

  // 8. foto inexistente → dice cuál falta
  try {
    await r.buildReel({ photos: [photos[0], '/no/existe/foto.png'], outDir });
    ok(false, 'foto inexistente tira error', 'no tiró error');
  } catch (e) {
    ok(/\/no\/existe\/foto\.png/.test(e.message), 'foto inexistente → dice cuál falta', e.message);
  }

  // 9. reelsThisWeek con sqlite en memoria (esquema como db.js: tipo, created_at)
  const mem = new DatabaseSync(':memory:');
  mem.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    tipo TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const now = new Date();
  const ts = (dOff) => new Date(now.getTime() + dOff * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const ins = mem.prepare('INSERT INTO posts (user_id, tipo, created_at) VALUES (?, ?, ?)');
  ins.run(1, 'reel', ts(0));          // ahora
  ins.run(1, 'reel', ts(-3));
  ins.run(1, 'reel', ts(-8));         // fuera de la ventana
  ins.run(1, 'promo', ts(0));
  ins.run(2, 'reel', ts(0));          // otro usuario
  ok(r.reelsThisWeek(mem, 1) === 2, 'reelsThisWeek: 2 reels en 7 días (excluye -8d, promo y otro user)');
  ok(r.reelsThisWeek(mem, 2) === 1, 'reelsThisWeek: user 2 → 1');
  ok(r.reelsThisWeek(mem, 999) === 0, 'reelsThisWeek: user sin posts → 0');

  console.log(`\n${pass} ok, ${fail} fallos`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
