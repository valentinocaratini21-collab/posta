// ================= LOTE DETECTOR-SUBTÍTULOS-SUBIDOS — suite =================
// Orden de Valentino (14/11): si un cliente sube un video con los
// subtítulos quemados MAL, Posty lo verifica, le avisa y lo corrige
// solo. Fixtures REALES: el archivo servido del 681 (re-roto por el
// render histórico, md5 cf14ecb7…) y el corregido a mano de bamboo
// (md5 a3cd39b2…, limpio). La visión se INYECTA con veredictos
// controlados (precedente v1077: la QA del ejecutor también corrió
// con visión inyectada); el ffmpeg y los píxeles son reales.
//
//   §1 Detección sobre el 681: veredicto defecto con 2 segmentos.
//   §2 Corrección real: el frame corregido muestra las líneas
//      APILADAS (≥2 racimos de tinta) donde la base muestra 1
//      (pisado); el tramo de silencio queda sin texto arriba.
//   §3 El corregido limpio: veredicto ok, y por el pegamento el
//      posteo queda byte a byte (md5 idéntico, sin prev, sin review).
//   §4 Video sin texto → sin_texto → intacto y sin aviso.
//   §5 Visión que falla → no_verificado → intacto + needs_review.
//   §6 Defecto + re-verificación que sigue condenando →
//      defecto_sin_corregir: intacto + needs_review, sin archivo
//      corregido residual.
//   §7 Defecto + corrección re-verificada limpia → corregido:
//      image_path nuevo existente, prev_image_path = el original,
//      el original sigue en disco.
//   §8 Control contra la BASE (release de VIDEO-SUBIDO-INTACTO):
//      sin detector, sin pegamento, sin nota en el recibo.
//   §9 Pines del front: la nota del recibo existe en ES/EN para los
//      tres estados que avisan.
//   §10 Boot smoke del release.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const ROOT = __dirname;
const BASE = process.env.PZ_BASE_DIR || path.join(__dirname, '..', 'base');
const FIX_ROTO = '/home/hatch/workspace/.diag-video-miercoles/video-681-servido.mp4';
const FIX_LIMPIO = '/home/hatch/workspace/video-653-corregido/video-653-corregido.mp4';

let ok = 0, mal = 0;
const check = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre); } else { mal++; console.log('  ✗', nombre); } };
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
function ffmpeg(args, timeout = 120000) {
  return new Promise((resolve, reject) => execFile('ffmpeg', ['-y', '-v', 'error', ...args], { timeout }, (e, so, se) => e ? reject(new Error(String(se || e.message).slice(0, 200))) : resolve()));
}
// Tinta de texto (píxeles claros) por fila en una zona del frame:
// devuelve la cantidad de RACIMOS de filas con tinta (líneas).
async function racimosDeTinta(video, t, zona) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-det-ink-'));
  const f = path.join(tmp, 'f.png');
  try {
    await ffmpeg(['-ss', String(t), '-i', video, '-frames:v', '1', f], 30000);
    const { stdout } = await new Promise((resolve, reject) => execFile('ffmpeg', ['-v', 'error', '-i', f, '-vf', `crop=${zona.w}:${zona.h}:${zona.x}:${zona.y},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' }, (e, so, se) => e ? reject(e) : resolve({ stdout: so })));
    const buf = stdout; const W = zona.w;
    const filas = [];
    for (let y = 0; y < zona.h; y++) {
      let tinta = 0;
      for (let x = 0; x < W; x += 3) { if (buf[y * W + x] > 170) tinta++; }
      filas.push(tinta > W / 30);
    }
    let racimos = 0, dentro = false;
    for (const v of filas) { if (v && !dentro) { racimos++; dentro = true; } if (!v) dentro = false; }
    return racimos;
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
}

// ---------- Visiones inyectadas ----------
// El 681 (10 s, frames a 0.625·k): gancho pisado en los frames 0-1
// (0–2,5 s), silencio en 2-5, CTA pisado en 6-7 (7,5–10 s).
const ZONA_GANCHO = { x: 150, y: 100, w: 700, h: 95 };
const ZONA_CTA = { x: 200, y: 385, w: 600, h: 85 };
function vision681Defecto({ frames }) {
  return frames.map((fr, i) => {
    if (i <= 1) return { hay_texto: true, pisado: true, lineas: ['Ese momento en', 'que mirás'], zona: ZONA_GANCHO };
    if (i >= 6) return { hay_texto: true, pisado: true, lineas: ['Escribinos y te', 'contamos más'], zona: ZONA_CTA };
    return { hay_texto: false, pisado: false, lineas: [], zona: null };
  });
}
function visionLimpia({ frames }) {
  return frames.map((fr, i) => (i <= 1 || i >= 6)
    ? { hay_texto: true, pisado: false, lineas: ['texto'], zona: ZONA_GANCHO }
    : { hay_texto: false, pisado: false, lineas: [], zona: null });
}
function visionSinTexto({ frames }) { return frames.map(() => ({ hay_texto: false, pisado: false, lineas: [], zona: null })); }
function visionRota() { throw new Error('vision_caida'); }

// ---------- Pegamento (server.js) extraído con stubs ----------
function cargarPegamento(mediaDir, post) {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const ini = src.indexOf('async function subirDetectorSubtitulosQuemados');
  const fin = src.indexOf('// ================= LOTE PEDIDO-VOZ-REVISION', ini);
  if (ini < 0 || fin < 0) throw new Error('pegamento no encontrado');
  const codigo = src.slice(ini, fin);
  const detReal = require(path.join(ROOT, 'detector-subtitulos.js'));
  const dbStub = {
    prepare(sql) {
      return {
        get: () => post,
        run: (...a) => {
          if (sql.includes('needs_review')) post.needs_review = 1;
          if (sql.includes('image_path = ?')) { post.prev_image_path = a[1]; post.image_path = a[0]; }
          return {};
        },
      };
    },
  };
  const factory = new Function('db', 'MEDIA_DIR', 'fs', 'path', 'crypto', 'openaiKeyFor', 'require',
    codigo + '\nreturn subirDetectorSubtitulosQuemados;');
  const req = (m) => (m === './detector-subtitulos' ? detReal : require(m));
  return { fn: factory(dbStub, mediaDir, fs, path, crypto, () => 'sk-test', req), detReal };
}

(async () => {
  const det = require(path.join(ROOT, 'detector-subtitulos.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-det-suite-'));
  const roto = path.join(tmp, 'roto.mp4'); fs.copyFileSync(FIX_ROTO, roto);
  const limpio = path.join(tmp, 'limpio.mp4'); fs.copyFileSync(FIX_LIMPIO, limpio);
  check('fixtures reales (md5 del 681 y del corregido)', md5(roto) === 'cf14ecb79eb0d32effc5692a1819a20f' && md5(limpio) === 'a3cd39b2fd77de0d6c1e1f316e905035');

  console.log('§1 detección del defecto (681, visión inyectada)');
  const d1 = await det.detectar({ videoAbs: roto, key: 'sk-test', vision: vision681Defecto });
  check('estado defecto', d1.estado === 'defecto');
  check('2 segmentos (gancho + CTA)', Array.isArray(d1.segmentos) && d1.segmentos.length === 2);
  check('el gancho trae sus 2 líneas reconstruidas', d1.segmentos && d1.segmentos[0].lineas.join(' ') === 'Ese momento en que mirás');
  const dOk = await det.detectar({ videoAbs: limpio, key: 'sk-test', vision: visionLimpia });
  check('el corregido limpio se absuelve (ok)', dOk.estado === 'ok');
  const dSin = await det.detectar({ videoAbs: roto, key: '', vision: visionLimpia });
  check('sin clave → no_verificado (fail-closed)', dSin.estado === 'no_verificado');

  console.log('§2 corrección real por ffmpeg + píxeles');
  const corregido = path.join(tmp, 'corregido.mp4');
  const c1 = await det.corregir({ videoAbs: roto, segmentos: d1.segmentos, outAbs: corregido, info: d1.info });
  check('la corrección produce archivo', c1.ok && fs.existsSync(corregido));
  const zonaPx = { x: 162, y: 192, w: 756, h: 182 }; // ZONA_GANCHO en px (1080×1920)
  const racBase = await racimosDeTinta(roto, 1.2, zonaPx);
  const racCorr = await racimosDeTinta(corregido, 1.2, zonaPx);
  check(`la base pisa (1 racimo) y la corrección apila (≥2) [base=${racBase} corr=${racCorr}]`, racBase === 1 && racCorr >= 2);
  const racSilencio = await racimosDeTinta(corregido, 5.0, zonaPx);
  check('en el silencio (5 s) la zona del gancho queda sin texto', racSilencio === 0);

  console.log('§3 pegamento: limpio → intacto');
  {
    const media = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-det-media-'));
    fs.copyFileSync(FIX_LIMPIO, path.join(media, 'v.mp4'));
    const post = { id: 1, user_id: 9, media_type: 'video', image_path: '/media/v.mp4', prev_image_path: '', needs_review: 0 };
    const { fn, detReal } = cargarPegamento(media, post);
    detReal.internals.visionChat = visionLimpia;
    const r = await fn(9, 1);
    check('estado ok', r && r.estado === 'ok');
    check('byte a byte: md5 idéntico y sin prev ni review', md5(path.join(media, 'v.mp4')) === 'a3cd39b2fd77de0d6c1e1f316e905035' && !post.prev_image_path && post.needs_review === 0);
  }

  console.log('§4 pegamento: sin texto → intacto, sin aviso');
  {
    const media = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-det-media-'));
    await ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=360x640:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(media, 'v.mp4')], 60000);
    const post = { id: 2, user_id: 9, media_type: 'video', image_path: '/media/v.mp4', prev_image_path: '', needs_review: 0 };
    const { fn, detReal } = cargarPegamento(media, post);
    detReal.internals.visionChat = visionSinTexto;
    const r = await fn(9, 2);
    check('sin_texto se reporta ok (sin aviso)', r && r.estado === 'ok');
    check('sin review ni reemplazo', post.needs_review === 0 && post.image_path === '/media/v.mp4');
  }

  console.log('§5 pegamento: visión caída → no_verificado + revisión');
  {
    const media = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-det-media-'));
    fs.copyFileSync(FIX_ROTO, path.join(media, 'v.mp4'));
    const post = { id: 3, user_id: 9, media_type: 'video', image_path: '/media/v.mp4', prev_image_path: '', needs_review: 0 };
    const { fn, detReal } = cargarPegamento(media, post);
    detReal.internals.visionChat = visionRota;
    const r = await fn(9, 3);
    check('estado no_verificado (nunca «bien»)', r && r.estado === 'no_verificado');
    check('intacto + needs_review', post.image_path === '/media/v.mp4' && post.needs_review === 1 && md5(path.join(media, 'v.mp4')) === 'cf14ecb79eb0d32effc5692a1819a20f');
  }

  console.log('§6 pegamento: defecto sin corrección garantizable');
  {
    const media = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-det-media-'));
    fs.copyFileSync(FIX_ROTO, path.join(media, 'v.mp4'));
    const post = { id: 4, user_id: 9, media_type: 'video', image_path: '/media/v.mp4', prev_image_path: '', needs_review: 0 };
    const { fn, detReal } = cargarPegamento(media, post);
    detReal.internals.visionChat = vision681Defecto; // condena también la re-verificación
    const r = await fn(9, 4);
    check('estado defecto_sin_corregir', r && r.estado === 'defecto_sin_corregir');
    check('intacto + needs_review', post.image_path === '/media/v.mp4' && post.needs_review === 1);
    check('sin archivo corregido residual', !fs.readdirSync(media).some((f) => f.startsWith('subtitulos-corregidos-')));
  }

  console.log('§7 pegamento: defecto corregido y re-verificado');
  {
    const media = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-det-media-'));
    fs.copyFileSync(FIX_ROTO, path.join(media, 'v.mp4'));
    const post = { id: 5, user_id: 9, media_type: 'video', image_path: '/media/v.mp4', prev_image_path: '', needs_review: 0 };
    const { fn, detReal } = cargarPegamento(media, post);
    let llamadas = 0;
    detReal.internals.visionChat = (args) => (++llamadas === 1 ? vision681Defecto(args) : visionLimpia(args));
    const r = await fn(9, 5);
    check('estado corregido', r && r.estado === 'corregido');
    check('image_path nuevo y existente', /^\/media\/subtitulos-corregidos-.*\.mp4$/.test(post.image_path) && fs.existsSync(path.join(media, path.basename(post.image_path))));
    check('prev_image_path = el original, que sigue en disco', post.prev_image_path === '/media/v.mp4' && md5(path.join(media, 'v.mp4')) === 'cf14ecb79eb0d32effc5692a1819a20f');
    check('sin needs_review (la corrección quedó verificada)', post.needs_review === 0);
  }

  console.log('§8 control contra la base (VIDEO-SUBIDO-INTACTO)');
  {
    const baseServer = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
    const baseApp = fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8');
    check('la base no tiene el pegamento ni la nota', !baseServer.includes('subirDetectorSubtitulosQuemados') && !baseApp.includes('pzSubirSubsQuemadosNota'));
    check('la base no tiene el módulo', !fs.existsSync(path.join(BASE, 'detector-subtitulos.js')));
    const relServer = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    check('el release llama al detector SOLO desde Subir (resolver + armarPedido)', (relServer.match(/subsQuemados = await subirDetectorSubtitulosQuemados/g) || []).length === 2);
  }

  console.log('§9 pines del front (recibo)');
  {
    const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    check('nota ES/EN de corregido', app.includes('las líneas se pisaban, así que los corregí') && app.includes('the lines overlapped, so I fixed them'));
    check('nota honesta de no corregido y de no verificado', app.includes('No pude corregirlos solo') && app.includes('No pude verificar los subtítulos'));
    check("el estado 'ok' no imprime nota", app.includes("r.subs_quemados.estado !== 'ok'"));
  }

  console.log('§10 boot smoke');
  {
    const port = 35197;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-det-boot-'));
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' }, stdio: 'ignore' });
    try {
      let v = null;
      for (let i = 0; i < 40 && !v; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try { const res = await fetch(`http://127.0.0.1:${port}/api/version`); if (res.ok) v = await res.json(); } catch (e) {}
      }
      check('el release bootea y responde /api/version', !!(v && v.ok));
    } finally { try { child.kill('SIGKILL'); } catch (e) {} }
  }

  console.log(`\nDETECTOR-SUBTÍTULOS-SUBIDOS: ${ok} ok · ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(2); });
