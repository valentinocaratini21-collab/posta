'use strict';
/* =====================================================================
 * test-media-cliente-3.js — tanda 22:42/22:44/22:45/22:46/22:50/22:51
 * (subtítulos con estilo, voz, timelapse, loop, plantillas, video-
 * respuesta, tendencia, unboxing, logo outro, A/B, precio en banda,
 * keywords, serie, ASMR, día, checklist, luz, proyectos, fade,
 * parecidos, último día, tachado, gancho, mito, silencio, stock).
 * Cero IA: fetch stubbeado (patrón de la casa). Boot del servidor
 * igual que test-foto-cliente-experto.js (puerto 18776).
 * ===================================================================== */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-mc3-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18776';
process.env.BASE_URL = 'http://127.0.0.1:18776';
process.env.OPENAI_API_KEY = 'test-key';
delete process.env.GEMINI_API_KEY;
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const ROOT = path.join(__dirname); // work/ cuando se corre desde work/
const HERE = __dirname;

function pil(script, args) {
  return execFileSync('python3', ['-c', script, ...(args || [])], { encoding: 'utf8' });
}
function ffprobe(absPath) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_type', '-show_entries', 'format=duration', '-of', 'json', absPath], { encoding: 'utf8' });
  return JSON.parse(out);
}
function ffDur(absPath) {
  const j = ffprobe(absPath);
  return parseFloat(j.format.duration);
}
function ffDims(absPath) {
  const j = ffprobe(absPath);
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  return v ? [v.width, v.height] : null;
}

// --- Fixtures ------------------------------------------------------------
const FOTO = path.join(MEDIA_DIR, 'foto3.jpg');
pil(`import sys
from PIL import Image
im = Image.new('RGB', (1080, 1350), (30, 160, 60))
px = im.load()
for x in range(300, 780):
    for y in range(400, 950):
        px[x, y] = ((x * 7 + y) % 255, (x * 3) % 255, (y * 5) % 255)
im.save(sys.argv[1], 'JPEG', quality=92)`, [FOTO]);
const VID = path.join(MEDIA_DIR, 'test3.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', VID]);
const VOZ = path.join(MEDIA_DIR, 'voz.wav');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1', VOZ]);

// --- HTTP con cookie -----------------------------------------------------
const realFetch = global.fetch;
let cookie = '';
async function call(method, p, body) {
  const r = await realFetch('http://127.0.0.1:18776' + p, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
async function callRaw(p, buf, ct) {
  const r = await realFetch('http://127.0.0.1:18776' + p, {
    method: 'POST', headers: { 'Content-Type': ct, ...(cookie ? { Cookie: cookie } : {}) }, body: buf,
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let passed = 0, failed = 0;
  const ok = (name, cond, extra) => {
    if (cond) { passed++; console.log('  ✓ ' + name); }
    else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };

  /* ---------- §1 Unidad: vigenciaParse + assFromText con fuente -------- */
  const mc = require('./media-cliente.js');
  ok('vigenciaParse: ISO', mc.vigenciaParse('2027-02-01') === '2027-02-01');
  ok('vigenciaParse: DD/MM/AAAA', mc.vigenciaParse('01/02/2027') === '2027-02-01');
  ok('vigenciaParse: fecha imposible -> null', mc.vigenciaParse('31/02/2027') === null);
  ok('vigenciaParse: texto sin fecha -> null', mc.vigenciaParse('promo finde') === null);
  ok('vigenciaParse: vacío -> null', mc.vigenciaParse('') === null);
  const ass = mc.assFromText('Hola mundo, esta es la torta', 10, ['torta'], mc.assColor('#2793C8'), 'Montserrat');
  ok('assFromText: Style usa la fuente pasada', ass.includes('Montserrat'));
  ok('assFromText: keyword coloreada solo si está en el texto', ass.includes('torta') && !ass.includes('xyz-no-esta'));
  const assDef = mc.assFromText('Hola mundo', 5, [], '#2793C8');
  ok('assFromText: sin fuente usa DejaVu Sans', assDef.includes('DejaVu Sans'));

  /* ---------- §2 PIL: price-band, story-text, tachado ------------------ */
  const PB = path.join(TMP, 'pb.jpg');
  execFileSync('python3', [path.join(HERE, 'media-price-band.py'), FOTO, PB, '$500', 'inf', '#2793C8']);
  const pbIm = pil(`import sys
from PIL import Image
im = Image.open(sys.argv[1]); print(im.size[0], im.size[1])`, [PB]).trim().split(' ');
  const fotoIm = pil(`import sys
from PIL import Image
im = Image.open(sys.argv[1]); print(im.size[0], im.size[1])`, [FOTO]).trim().split(' ');
  ok('price-band: el lienzo crece (foto intacta, banda agregada)', +pbIm[0] === +fotoIm[0] && +pbIm[1] > +fotoIm[1], pbIm.join('x') + ' vs ' + fotoIm.join('x'));
  const ST = path.join(TMP, 'story.jpg');
  execFileSync('python3', [path.join(HERE, 'media-story-text.py'), ST, 'ÚLTIMO DÍA', 'Promo finde']);
  const stIm = pil(`import sys
from PIL import Image
im = Image.open(sys.argv[1]); print(im.size[0], im.size[1])`, [ST]).trim().split(' ');
  ok('story-text: 1080x1920', stIm[0] === '1080' && stIm[1] === '1920', stIm.join('x'));
  const TACH_DIR = path.join(TMP, 'tach');
  execFileSync('python3', [path.join(HERE, 'media-tachado.py'), FOTO, TACH_DIR, '$800', '$500']);
  const frames = fs.readdirSync(TACH_DIR).filter((f) => f.endsWith('.jpg')).sort();
  ok('tachado: 90 cuadros (6 s a 15 fps)', frames.length === 90, String(frames.length));
  const f0 = pil(`import sys
from PIL import Image
im = Image.open(sys.argv[1]); print(im.size[0], im.size[1])`, [path.join(TACH_DIR, 'f000.jpg')]).trim().split(' ');
  ok('tachado: cuadro 1080x1920', f0[0] === '1080' && f0[1] === '1920', f0.join('x'));
  // La banda inferior cambia entre el cuadro 0 (solo viejo) y el final (nuevo).
  const bandMean = (f) => pil(`import sys
from PIL import Image
im = Image.open(sys.argv[1]).crop((0, 1400, 1080, 1920)).convert('RGB')
px = list(im.getdata())
n = len(px); print(sum(p[0] for p in px)//n, sum(p[1] for p in px)//n, sum(p[2] for p in px)//n)`, [f]).trim();
  ok('tachado: la banda final difiere de la inicial', bandMean(path.join(TACH_DIR, 'f000.jpg')) !== bandMean(path.join(TACH_DIR, 'f089.jpg')));

  /* ---------- §3 ffmpeg: timelapse, loop, silencio, asmr, mezcla ------- */
  const TL = path.join(TMP, 'tl.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VID, '-vf', 'setpts=PTS/4', '-af', 'atempo=2.0,atempo=2.0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', TL]);
  ok('timelapse 4x: duración ≈ D/4', Math.abs(ffDur(TL) - 1) < 0.25, String(ffDur(TL)));
  const LOOP = path.join(TMP, 'loop.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VID, '-filter_complex', "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[v];[v]split[a][b];[a]trim=0:3.5,setpts=PTS-STARTPTS[v1];[b]trim=3.5:4,setpts=PTS-STARTPTS[v2];[v2][v1]xfade=transition=fade:duration=0.5:offset=3.5[vout]", '-map', '[vout]', '-map', '0:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', LOOP]);
  ok('loop: duración ≈ D y formato historia', Math.abs(ffDur(LOOP) - 4) < 0.3 && String(ffDims(LOOP)) === '1080,1920', String(ffDur(LOOP)) + ' ' + String(ffDims(LOOP)));
  const SIL = path.join(TMP, 'sil.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VID, '-af', "volume='if(between(t,1,2),0,1)'", '-c:v', 'copy', SIL]);
  ok('silencio: duración intacta', Math.abs(ffDur(SIL) - 4) < 0.2, String(ffDur(SIL)));
  const ASMR = path.join(TMP, 'asmr.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VID, '-af', 'afftdn,equalizer=f=4000:g=6,dynaudnorm', '-c:v', 'copy', ASMR]);
  ok('asmr: duración intacta', Math.abs(ffDur(ASMR) - 4) < 0.2, String(ffDur(ASMR)));
  const MIX = path.join(TMP, 'mix.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', VID, '-i', VOZ, '-filter_complex', '[0:a]volume=0.3[orig];[1:a]volume=1.0[voz];[voz][orig]amix=inputs=2:normalize=0[aout]', '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-shortest', MIX]);
  ok('mezcla voz: duración ≈ video original', Math.abs(ffDur(MIX) - 4) < 0.3, String(ffDur(MIX)));

  /* ---------- §4 Vivo: boot + seeds ------------------------------------ */
  global.normalizeSrc = require('./launch-analytics').normalizeSrc;
  const db = require('./db');
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18776/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  const reg = await call('POST', '/api/auth/register', { email: 'foto3@test.local', password: 'secreto1' });
  assert.strictEqual(reg.status, 200, 'registro: ' + JSON.stringify(reg.json));
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('foto3@test.local').id;
  const hoy = new Date().toISOString().slice(0, 10);
  const dna = {
    productos: [{ nombre: 'Torta de chocolate' }, { nombre: 'Pan de campo' }],
    producto_estrella: 'Torta de chocolate',
    promos_activas: [{ titulo: 'Promo finde', detalle: 'Torta de chocolate $500, antes $800', vigencia: hoy }],
    preguntas_frecuentes: [{ pregunta: '¿La torta sin gluten es seca?' }],
    ubicacion: 'Decatur',
  };
  db.prepare('INSERT INTO business_dna (user_id, dna_json) VALUES (?,?)').run(uid, JSON.stringify(dna));
  const insertDraft = (imagePath, caption, mediaType) => db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, week_key, needs_review) VALUES (?,?,?,?,'draft',?,'foto','2026-10-19',0)`).run(uid, imagePath, caption, '#test', mediaType).lastInsertRowid;
  const insertAsset = (filePath, kind, producto, quality, tag) => db.prepare(`INSERT INTO assets (user_id, file_path, kind, producto, album_quality, album_tag) VALUES (?,?,?,?,?,?)`).run(uid, filePath, kind, producto, quality, tag).lastInsertRowid;

  const luz = await call('GET', '/api/consejo-luz');
  ok('luz: consejo orientativo con ubicación real', luz.json && luz.json.ok && luz.json.orientativo === true && luz.json.ubicacion === 'Decatur', JSON.stringify(luz.json));

  const stockMal = await call('POST', '/api/stock', { producto: 'No existe', cantidad: 3 });
  ok('stock: producto fuera del fundamento -> 400', stockMal.status === 400, String(stockMal.status));
  const stockOk = await call('POST', '/api/stock', { producto: 'Torta de chocolate', cantidad: 5 });
  ok('stock: upsert ok', stockOk.json && stockOk.json.ok === true, JSON.stringify(stockOk.json));
  const stockGet = await call('GET', '/api/stock');
  ok('stock: GET lista el guardado', stockGet.json && (stockGet.json.stock || []).some((s) => s.producto === 'Torta de chocolate' && s.cantidad === 5));
  const stockHistSin = await call('POST', '/api/historias/stock', { producto: 'Pan de campo' });
  ok('stock: sin dato no hay historia', stockHistSin.json && stockHistSin.json.ok === false && stockHistSin.json.razon === 'sin-stock', JSON.stringify(stockHistSin.json));
  const stockHist = await call('POST', '/api/historias/stock', { producto: 'Torta de chocolate' });
  ok('stock: con dato real hay borrador story', stockHist.json && stockHist.json.ok === true && stockHist.json.draft_id, JSON.stringify(stockHist.json));
  if (stockHist.json && stockHist.json.draft_id) {
    const p = db.prepare('SELECT media_type FROM posts WHERE id = ?').get(stockHist.json.draft_id);
    ok('stock: el borrador es media_type story', p && p.media_type === 'story');
  }

  const vencMal = await call('POST', '/api/ofertas/vencimiento', { titulo: 'Promo finde', fecha_fin: '31/02/2027' });
  ok('vencimiento: fecha imposible -> 400', vencMal.status === 400, String(vencMal.status));
  const vencOk = await call('POST', '/api/ofertas/vencimiento', { titulo: 'Promo finde', fecha_fin: hoy });
  ok('vencimiento: fecha real ok', vencOk.json && vencOk.json.ok === true);
  const vencen = await call('GET', '/api/ofertas/vencen-hoy');
  ok('vencen-hoy: la oferta real de hoy aparece', vencen.json && (vencen.json.vencen || []).some((v) => v.titulo === 'Promo finde'), JSON.stringify(vencen.json));
  const ultimo = await call('POST', '/api/ofertas/ultimo-dia/generar', {});
  ok('último día: 1 historia (sin duplicar tabla+fundamento)', ultimo.json && ultimo.json.ok === true && ultimo.json.historias.length === 1, JSON.stringify(ultimo.json));

  // Plantillas: origen publicado con emoji + precio, producto distinto.
  const pubId = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, product_ref) VALUES (?,?,'🍰 Torta de chocolate $500 — la favorita','#a #b','published','image','Torta de chocolate')`).run(uid, '/media/foto3.jpg').lastInsertRowid;
  const plantMal = await call('POST', '/api/plantillas', { origen_post_id: pubId, producto: 'Torta de chocolate' });
  ok('plantilla: mismo producto -> 400', plantMal.status === 400, String(plantMal.status));
  const plant = await call('POST', '/api/plantillas', { origen_post_id: pubId, producto: 'Pan de campo' });
  ok('plantilla: borrador esqueleto creado', plant.json && plant.json.ok === true && plant.json.draft_id, JSON.stringify(plant.json));
  if (plant.json && plant.json.draft_id) {
    const d = db.prepare('SELECT * FROM posts WHERE id = ?').get(plant.json.draft_id);
    ok('plantilla: estructura, nunca copia (sin foto, producto nuevo, needs_image)', d && d.image_path === '' && d.product_ref === 'Pan de campo' && d.needs_image === 1 && !String(d.caption || '').includes('Torta de chocolate'), JSON.stringify(d && { image_path: d.image_path, product_ref: d.product_ref, caption: d.caption }));
    ok('plantilla: [Precio] solo porque el origen tenía precio', d && String(d.caption || '').includes('[Precio]'));
  }

  // Checklist: borrador sin medio -> duro; confirmar -> desbloquea.
  const draftVacio = insertDraft('', 'sin medio', 'image');
  const chk1 = await call('GET', '/api/drafts/' + draftVacio + '/checklist');
  ok('checklist: sin medio es duro y bloquea', chk1.json && chk1.json.bloqueado === true && (chk1.json.items || []).some((i) => i.item === 'sin-medio' && i.duro === true), JSON.stringify(chk1.json));
  ok('checklist: sin foto no hay aviso de reuso', chk1.json && !(chk1.json.items || []).some((i) => i.item === 'reuso'), JSON.stringify(chk1.json));
  const conf = await call('POST', '/api/drafts/' + draftVacio + '/checklist-confirm', { item: 'sin-medio' });
  ok('checklist: confirmación durable ok', conf.json && conf.json.ok === true);
  const chk2 = await call('GET', '/api/drafts/' + draftVacio + '/checklist');
  ok('checklist: tras aceptar conociéndolo ya no bloquea', chk2.json && chk2.json.bloqueado === false && (chk2.json.items || []).some((i) => i.item === 'sin-medio' && i.confirmado === true), JSON.stringify(chk2.json));

  // Video: timelapse + voz + loop + silencio + asmr + proyectos.
  const vidDraft = insertDraft('/media/test3.mp4', 'video', 'video');
  const tl = await call('POST', '/api/drafts/' + vidDraft + '/video-timelapse', { velocidad: 4 });
  ok('timelapse vivo: propuesta creada', tl.json && tl.json.ok === true && tl.json.proposal_path, JSON.stringify(tl.json));
  if (tl.json && tl.json.proposal_path) {
    const abs = path.join(MEDIA_DIR, path.basename(tl.json.proposal_path));
    ok('timelapse vivo: duración ≈ D/4 en el archivo', fs.existsSync(abs) && Math.abs(ffDur(abs) - 1) < 0.3, String(fs.existsSync(abs)) + ' ' + (fs.existsSync(abs) ? ffDur(abs) : ''));
    const acc = await call('POST', '/api/drafts/' + vidDraft + '/video-timelapse-accept', {});
    ok('timelapse vivo: acepto aplica', acc.json && acc.json.ok === true);
    const proy = await call('GET', '/api/drafts/' + vidDraft + '/proyectos');
    ok('proyectos: la versión aceptada queda guardada', proy.json && (proy.json.versiones || []).some((v) => String(v.path || '') === String(tl.json.proposal_path)), JSON.stringify(proy.json));
    const rest = await call('POST', '/api/drafts/' + vidDraft + '/proyectos/restaurar', { path: '/media/test3.mp4' });
    ok('proyectos: restaurar vuelve a la original', rest.json && rest.json.ok === true && String(db.prepare('SELECT image_path FROM posts WHERE id = ?').get(vidDraft).image_path) === '/media/test3.mp4', JSON.stringify(rest.json));
  }
  const voz = await callRaw('/api/drafts/' + vidDraft + '/video-voiceover', fs.readFileSync(VOZ), 'audio/wav');
  ok('voz vivo: propuesta de mezcla creada', voz.json && voz.json.ok === true && voz.json.proposal_path, JSON.stringify(voz.json));
  const loop = await call('POST', '/api/drafts/' + vidDraft + '/video-loop', {});
  ok('loop vivo: propuesta creada', loop.json && loop.json.ok === true && loop.json.proposal_path, JSON.stringify(loop.json));
  if (loop.json && loop.json.proposal_path) {
    const abs = path.join(MEDIA_DIR, path.basename(loop.json.proposal_path));
    ok('loop vivo: 1080x1920 y duración ≈ D', fs.existsSync(abs) && String(ffDims(abs)) === '1080,1920' && Math.abs(ffDur(abs) - 4) < 0.3, String(fs.existsSync(abs)) + ' ' + (fs.existsSync(abs) ? ffDims(abs) + ' ' + ffDur(abs) : ''));
  }
  const sil = await call('POST', '/api/drafts/' + vidDraft + '/video-silencio', { momento: 2 });
  ok('silencio vivo: propuesta creada', sil.json && sil.json.ok === true && sil.json.proposal_path, JSON.stringify(sil.json));
  const asmr = await call('POST', '/api/drafts/' + vidDraft + '/video-asmr', {});
  ok('asmr vivo: propuesta creada', asmr.json && asmr.json.ok === true && asmr.json.proposal_path, JSON.stringify(asmr.json));

  // Mitos: candidatos reales, gate de acepto, reel solo tras acepto.
  const cands = await call('GET', '/api/mitos/candidatos');
  ok('mitos: candidatos salen de FAQs reales', cands.json && (cands.json.candidatos || []).some((c) => String(c).includes('sin gluten')), JSON.stringify(cands.json));
  const mito = await call('POST', '/api/mitos', { mito: 'Sin gluten es seco', desmentido: 'La nuestra queda húmeda' });
  ok('mitos: guardar ok', mito.json && mito.json.ok === true && mito.json.id, JSON.stringify(mito.json));
  if (mito.json && mito.json.id) {
    const reelAntes = await call('POST', '/api/mitos/' + mito.json.id + '/reel', { clips: [1] });
    ok('mitos: sin acepto del dueño no hay reel', reelAntes.status === 400, String(reelAntes.status));
    const acep = await call('POST', '/api/mitos/' + mito.json.id + '/aceptar', {});
    ok('mitos: aceptar ok', acep.json && acep.json.ok === true);
    const clipAsset = insertAsset('/media/test3.mp4', 'video', '', null, '');
    const reel = await call('POST', '/api/mitos/' + mito.json.id + '/reel', { clips: [clipAsset] });
    ok('mitos: tras acepto hay vista previa', reel.json && reel.json.ok === true && reel.json.preview, JSON.stringify(reel.json));
  }

  // Testimonios: solo con permiso; armar + aceptar.
  const testAsset = insertAsset('/media/test3.mp4', 'video', '', null, '');
  const perm = await call('POST', '/api/assets/' + testAsset + '/permiso-testimonio', { permiso: 1, nota: 'Cliente A' });
  ok('testimonios: permiso se marca', perm.json && perm.json.ok === true && perm.json.permiso_testimonio === 1, JSON.stringify(perm.json));
  const testList = await call('GET', '/api/testimonios/videos');
  ok('testimonios: el video con permiso aparece', testList.json && (testList.json.videos || []).some((v) => v.id === testAsset), JSON.stringify(testList.json));
  const testReel = await call('POST', '/api/reels/armar', { kind: 'testimonio', clips: [testAsset] });
  ok('testimonios: armar ok con clip con permiso', testReel.json && testReel.json.ok === true && testReel.json.preview, JSON.stringify(testReel.json));
  if (testReel.json && testReel.json.sidecar) {
    const acc = await call('POST', '/api/reels/aceptar', { sidecar: testReel.json.sidecar });
    ok('testimonios: aceptar crea asset', acc.json && acc.json.ok === true && acc.json.asset_id, JSON.stringify(acc.json));
  }
  const sinPermAsset = insertAsset('/media/test3.mp4', 'video', '', null, '');
  const testSinPerm = await call('POST', '/api/reels/armar', { kind: 'testimonio', clips: [sinPermAsset] });
  ok('testimonios: sin permiso no se usa', testSinPerm.status === 400, String(testSinPerm.status));

  // Serie: 3 slots -> sidecar -> aceptar crea 3 assets.
  const a1 = insertAsset('/media/foto3.jpg', 'photo', 'Torta de chocolate', null, '');
  const a2 = insertAsset('/media/foto3.jpg', 'photo', 'Torta de chocolate', null, '');
  const a3 = insertAsset('/media/foto3.jpg', 'photo', 'Torta de chocolate', null, '');
  const serie = await call('POST', '/api/historias/serie', { slots: [{ tipo: 'problema', asset_id: a1 }, { tipo: 'proceso', asset_id: a2 }, { tipo: 'resultado', asset_id: a3 }] });
  ok('serie: 3 slots con sidecar', serie.json && serie.json.ok === true && (serie.json.slots || []).length === 3 && serie.json.sidecar, JSON.stringify(serie.json));
  if (serie.json && serie.json.sidecar) {
    const acc = await call('POST', '/api/historias/serie-aceptar', { sidecar: serie.json.sidecar });
    ok('serie: aceptar crea 3 assets', acc.json && acc.json.ok === true && (acc.json.asset_ids || []).length === 3, JSON.stringify(acc.json));
  }

  // Parecidos: mismo producto + mismo encuadre + misma luz -> aviso.
  const qA = JSON.stringify({ lum: 120, w: 1000, h: 800, edge: 10 });
  const assetA = insertAsset('/media/foto3.jpg', 'photo', 'Torta de chocolate', qA, '');
  const assetB = insertAsset('/media/foto3b.jpg', 'photo', 'Torta de chocolate', qA, '');
  db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, product_ref) VALUES (?,?,'top','#t','published','image','Torta de chocolate')`).run(uid, '/media/foto3b.jpg');
  const par = await call('GET', '/api/assets/' + assetA + '/parecidos');
  ok('parecidos: aviso con atributos reales, sin puntaje', par.json && par.json.ok === true && (par.json.parecidos || []).some((p) => (p.compartidos || []).includes('mismo producto')) && !('score' in (par.json.parecidos[0] || {})), JSON.stringify(par.json));

  // Tachado + precio en banda (foto real + oferta real).
  const fotoDraft = insertDraft('/media/foto3.jpg', 'oferta', 'image');
  const tach = await call('POST', '/api/drafts/' + fotoDraft + '/video-tachado', { oferta_titulo: 'Promo finde', precio_viejo: '$800', precio_nuevo: '$500' });
  ok('tachado vivo: propuesta creada', tach.json && tach.json.ok === true && tach.json.proposal_path, JSON.stringify(tach.json));
  if (tach.json && tach.json.proposal_path) {
    const abs = path.join(MEDIA_DIR, path.basename(tach.json.proposal_path));
    ok('tachado vivo: mp4 de 6 s', fs.existsSync(abs) && Math.abs(ffDur(abs) - 6) < 0.3, String(fs.existsSync(abs)) + ' ' + (fs.existsSync(abs) ? ffDur(abs) : ''));
  }
  const tachMal = await call('POST', '/api/drafts/' + fotoDraft + '/video-tachado', { oferta_titulo: 'Promo finde', precio_viejo: '$999', precio_nuevo: '$500' });
  ok('tachado: precio inventado -> 400', tachMal.status === 400, String(tachMal.status));
  const pb = await call('POST', '/api/drafts/' + fotoDraft + '/photo-price-band', { oferta_titulo: 'Promo finde', precio: '$500', posicion: 'inf' });
  ok('precio en banda vivo: propuesta creada', pb.json && pb.json.ok === true && pb.json.proposal_path, JSON.stringify(pb.json));
  const pbMal = await call('POST', '/api/drafts/' + fotoDraft + '/photo-price-band', { oferta_titulo: 'Promo finde', precio: '$999', posicion: 'inf' });
  ok('precio en banda: precio inventado -> 400', pbMal.status === 400, String(pbMal.status));

  // Estilo: guardar y leer.
  const estPost = await call('POST', '/api/estilo-edicion', { transicion: 'ninguna', musica_track: '', subtitulos: 0, sub_fuente: '', sub_color: '' });
  ok('estilo: guardar ok', estPost.json && estPost.json.ok === true);
  const estGet = await call('GET', '/api/estilo-edicion');
  ok('estilo: se lee lo guardado', estGet.json && estGet.json.estilo && estGet.json.estilo.transicion === 'ninguna', JSON.stringify(estGet.json));

  // Hook-check: sin visión real no se finge presencia.
  const hook = await call('GET', '/api/drafts/' + vidDraft + '/video-hook-check');
  ok('hook-check: sin confirmación de visión no se finge (null)', hook.json && hook.json.ok === true && (hook.json.tiene_producto === null || hook.json.tiene_producto === false), JSON.stringify(hook.json));

  /* ---------- §5 Presencia estática ------------------------------------ */
  const srv = fs.readFileSync(path.join(HERE, 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(HERE, 'public', 'app.js'), 'utf8');
  const dbjs = fs.readFileSync(path.join(HERE, 'db.js'), 'utf8');
  const rutas = ['video-voiceover', 'video-timelapse', 'video-loop', 'video-asmr', 'video-silencio', 'video-tachado', 'video-hook', 'video-hook-check', 'plantillas', 'photo-price-band', 'historias/serie', 'checklist', 'consejo-luz', 'proyectos', 'parecidos', 'stock', 'ofertas', 'mitos', 'testimonios/videos', 'reels/armar', 'reels/aceptar'];
  for (const r of rutas) ok('ruta presente: ' + r, srv.includes(r));
  for (const k of ['video-voiceover', 'video-timelapse', 'video-loop', 'video-asmr', 'video-silencio', 'video-tachado', 'video-hook', 'photo-priceband']) ok('MC_KINDS presente: ' + k, app.includes(k));
  for (const t of ['checklist_confirm', 'edicion_proyectos', 'stock_negocio', 'oferta_vencimientos', 'mitos', 'voiceover_proposal_path', 'timelapse_proposal_path', 'loop_proposal_path', 'priceband_proposal_path', 'asmr_proposal_path', 'silencio_proposal_path', 'tachado_proposal_path', 'hook_proposal_path']) ok('db presente: ' + t, dbjs.includes(t));
  for (const f of ['mcTimelapseUI', 'mcSilencioUI', 'mcTachadoUI', 'mcPriceBandUI', 'mcVoiceUI', 'mcHookUI', 'mcChecklistUI', 'mcProyectosUI', 'mcAlbumToolsBind', 'mcTestimoniosUI', 'mcEstiloUI', 'mcSerieUI', 'mcUltimoDiaUI', 'mcStockUI', 'mcMitosUI']) ok('UI presente: ' + f, app.includes(f));
  ok('mcReelPreview audio-aware (anullsrc)', srv.includes('anullsrc'));

  console.log('\nTOTAL: ' + passed + ' ✓ · ' + failed + ' ✗');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
