'use strict';
/* test-voz-dueno.js — tests de «Voz del dueño → posteo».
 * Cero gasto IA: transcripciones y captions por fixture/stub; ffmpeg real
 * solo para el mux (fixtures generados en tmp). Correr: node test-voz-dueno.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const voz = require('./voz-dueno.js');

let pass = 0;
let fail = 0;
function t(nombre, fn) {
  try { fn(); pass++; console.log('PASS ' + nombre); }
  catch (e) { fail++; console.log('FAIL ' + nombre + ' :: ' + (e && e.message)); }
}
async function ta(nombre, fn) {
  try { await fn(); pass++; console.log('PASS ' + nombre); }
  catch (e) { fail++; console.log('FAIL ' + nombre + ' :: ' + (e && e.message)); }
}

const DIGEST = {
  productos: [{ nombre: 'torta de chocolate', precio: 1200 }, { nombre: 'café' }, { nombre: 'budín de limón' }],
  servicios: [],
  lexicon: { entries: [] },
};

function dbBase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT,
    caption TEXT, hashtags TEXT, scheduled_at TEXT, status TEXT DEFAULT 'draft',
    ig_permalink TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')),
    published_at TEXT, carousel_paths TEXT, tipo TEXT DEFAULT '')`);
  db.exec(`CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, file_path TEXT,
    kind TEXT DEFAULT 'photo', thumb_path TEXT, album_tag TEXT, album_quality TEXT)`);
  return db;
}

(async () => {
  t('reporte: ejemplo real del walkthrough es reporte', () => {
    assert.equal(voz.esReporteDelDia('Hoy llegaron las tortas de chocolate, quedan diez, y a la tarde viene el proveedor del café nuevo'), true);
  });
  t('reporte: pregunta no es reporte', () => {
    assert.equal(voz.esReporteDelDia('¿Cuántos posteos quedan esta semana?'), false);
  });
  t('reporte: pedido imperativo no es reporte', () => {
    assert.equal(voz.esReporteDelDia('Haceme un posteo de la torta de chocolate'), false);
  });
  t('reporte: saludo no es reporte', () => {
    assert.equal(voz.esReporteDelDia('Hola, buen día'), false);
  });
  t('reporte: menos de 3 palabras no es reporte', () => {
    assert.equal(voz.esReporteDelDia('Hoy tortas'), false);
  });
  t('hechos: producto + cantidad en palabras, sin inventar precio del digest', () => {
    const h = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    assert.deepEqual(h.productos, ['torta de chocolate']);
    assert.equal(h.cantidad, 10);
    assert.equal(h.precio, null);
    assert.deepEqual(h.dudas, []);
  });
  t('hechos: el ejemplo completo es ambiguo (torta y café) y pregunta con un toque', () => {
    const h = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez, y a la tarde viene el proveedor del café nuevo', DIGEST);
    assert.equal(h.dudas.length, 1);
    assert.equal(h.dudas[0].codigo, 'varios_productos');
    assert.deepEqual(h.opciones, ['torta de chocolate', 'café']);
  });
  t('hechos: sin producto conocido → duda sin_producto con opciones del digest', () => {
    const h = voz.extraerHechos('Hoy llegaron los alfajores nuevos, quedan veinte', DIGEST);
    assert.equal(h.dudas.length, 1);
    assert.equal(h.dudas[0].codigo, 'sin_producto');
    assert.deepEqual(h.opciones, ['torta de chocolate', 'café', 'budín de limón']);
  });
  t('hechos: "quedan pocas" no se convierte en número', () => {
    const h = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan pocas', DIGEST);
    assert.equal(h.cantidad, null);
    assert.equal(h.cantidadTexto, 'pocas');
  });
  t('hechos: precio solo si se dijo ($ o pesos)', () => {
    const a = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez a $1500', DIGEST);
    assert.equal(a.precio, '1500');
    const b = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez a 2000 pesos', DIGEST);
    assert.equal(b.precio, '2000');
  });
  t('hechos: "media docena" es cantidad 6', () => {
    const h = voz.extraerHechos('Hoy llegaron los budines de limón, queda media docena', DIGEST);
    assert.equal(h.cantidad, 6);
  });
  t('foto: tag del producto → conocida; sin tag → falta + alternativas', () => {
    const db = dbBase();
    db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag) VALUES (?,?,?,?)`).run(84, '/media/torta-real.jpg', 'photo', 'torta de chocolate');
    db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag) VALUES (?,?,?,?)`).run(84, '/media/local-1.jpg', 'photo', 'local');
    db.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag) VALUES (?,?,?,?)`).run(84, '/media/local-2.jpg', 'photo', 'local');
    const a = voz.elegirFoto(db, 84, 'torta de chocolate');
    assert.equal(a.foto, '/media/torta-real.jpg');
    assert.equal(a.origen, 'conocida');
    const b = voz.elegirFoto(db, 84, 'budín de limón');
    assert.equal(b.foto, null);
    assert.equal(b.origen, 'falta');
    assert.equal(b.alternativas.length, 3); // últimas fotos del local, todas elegibles
  });
  t('prompt: solo hechos + estilo; el precio del digest no se cuela', () => {
    const h = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    const p = voz.armarPromptCaption({ transcript: 'Hoy llegaron las tortas de chocolate, quedan diez', hechos: h, styleExtras: 'ESCRIBÍ COMO EL CLIENTE: minúscula, cálido.' });
    assert.ok(p.includes('torta de chocolate'));
    assert.ok(p.includes('cantidad: 10'));
    assert.ok(!p.includes('1200'), 'el precio del digest no debe aparecer en el prompt');
    assert.ok(p.includes('ESCRIBÍ COMO EL CLIENTE'));
  });
  t('gate: caption con número inventado no sale', () => {
    const h = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    const v = voz.verificarCaptionSinInvento('Quedan veinte tortas de chocolate, corré que vuelan', h, 'Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    assert.equal(v.ok, false);
    assert.ok(v.problemas.some(p => p.startsWith('numero_no_dicho')));
  });
  t('gate: caption con número dicho y producto dicho sí sale', () => {
    const h = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    const v = voz.verificarCaptionSinInvento('Hoy llegaron las tortas de chocolate, quedan diez', h, 'Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    assert.equal(v.ok, true);
  });
  t('gate: caption que nombra un producto no dicho no sale', () => {
    const h = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    const v = voz.verificarCaptionSinInvento('Hoy llegaron las tortas de chocolate y el budín de limón, quedan diez', h, 'Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    assert.equal(v.ok, false);
    assert.ok(v.problemas.some(p => p.startsWith('producto_no_dicho')));
  });
  t('hashtags: se separan los del final, máximo cinco', () => {
    const s = voz.separarHashtags('Hoy llegaron las tortas #a #b #c #d #e #f');
    assert.equal(s.caption, 'Hoy llegaron las tortas');
    assert.equal(s.hashtags.length, 5);
    const s2 = voz.separarHashtags('Sin tags acá');
    assert.deepEqual(s2.hashtags, []);
  });
  await ta('stt: sin llave queda pendiente declarado, nunca simulado', async () => {
    const r = await voz.transcribirVoz('data:audio/webm;base64,' + Buffer.from('x').toString('base64'), null, async () => { throw new Error('no debería llamarse'); });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'stt_sin_llave');
    assert.equal(r.pendiente, true);
  });
  await ta('stt: fixture por stub devuelve texto; error http devuelve stt_error', async () => {
    const ok = await voz.transcribirVoz('data:audio/webm;base64,' + Buffer.from('x').toString('base64'), 'k', async () => ({ ok: true, json: async () => ({ text: 'Hoy llegaron las tortas' }) }));
    assert.equal(ok.ok, true);
    assert.equal(ok.text, 'Hoy llegaron las tortas');
    const err = await voz.transcribirVoz('data:audio/webm;base64,' + Buffer.from('x').toString('base64'), 'k', async () => ({ ok: false, status: 401 }));
    assert.equal(err.codigo, 'stt_error');
    const inv = await voz.transcribirVoz('no-es-audio', 'k', async () => ({}));
    assert.equal(inv.codigo, 'audio_invalido');
  });
  t('audio: guardarAudioVoz escribe /media/voz-... y rechaza dataUrl mala', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-test-'));
    const dataUrl = 'data:audio/webm;base64,' + Buffer.from('hola-voz').toString('base64');
    const p = voz.guardarAudioVoz(dir, dataUrl, 84);
    assert.ok(p.startsWith('/media/voz-84-'));
    assert.equal(fs.readFileSync(path.join(dir, path.basename(p)), 'utf8'), 'hola-voz');
    assert.throws(() => voz.guardarAudioVoz(dir, 'basura', 84), /audio inválido/);
  });
  t('slot: hoy a bestHour en zona del cliente; tomado → mañana; cerrado → salta', () => {
    const tz = 'America/Argentina/Buenos_Aires';
    const now = Date.UTC(2026, 9, 29, 10, 0, 0); // jueves 07:00 AR
    assert.equal(voz.slotDelDia({ tz, bestHour: 19, takenYmd: [], closedWeekdays: [], nowMs: now }), '2026-10-29T22:00:00.000Z');
    assert.equal(voz.slotDelDia({ tz, bestHour: 19, takenYmd: ['2026-10-29'], closedWeekdays: [], nowMs: now }), '2026-10-30T22:00:00.000Z');
    assert.equal(voz.slotDelDia({ tz, bestHour: 19, takenYmd: [], closedWeekdays: [4], nowMs: now }), '2026-10-30T22:00:00.000Z');
    assert.equal(voz.slotDelDia({ tz, bestHour: 25, takenYmd: [], closedWeekdays: [], nowMs: now }), '2026-10-29T22:00:00.000Z');
  });
  t('db: crear → aprobar agenda el posteo en el slot; sin aclarar no aprueba', () => {
    const db = dbBase();
    const h = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    const b = voz.crearBorradorVoz(db, { userId: 84, transcript: 'Hoy llegaron las tortas de chocolate, quedan diez', hechos: h, foto: '/media/torta-real.jpg', fotoOrigen: 'conocida', audioPath: '/media/voz-84.mp3', caption: 'Hoy llegaron las tortas de chocolate, quedan diez', hashtags: '' });
    assert.equal(b.estado, 'listo');
    const ap = voz.aprobarVoz(db, b.id, '2026-10-29T22:00:00.000Z');
    assert.equal(ap.ok, true);
    const post = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(ap.postId);
    assert.equal(post.status, 'scheduled');
    assert.equal(post.scheduled_at, '2026-10-29T22:00:00.000Z');
    assert.equal(post.image_path, '/media/torta-real.jpg');
    const h2 = voz.extraerHechos('Hoy llegaron los alfajores nuevos, quedan veinte', DIGEST);
    const b2 = voz.crearBorradorVoz(db, { userId: 84, transcript: 'Hoy llegaron los alfajores nuevos, quedan veinte', hechos: h2, foto: null, fotoOrigen: 'falta', audioPath: '', caption: '', hashtags: '' });
    assert.equal(b2.estado, 'aclarar');
    assert.equal(voz.aprobarVoz(db, b2.id, '2026-10-29T22:00:00.000Z').codigo, 'falta_aclarar');
  });
  t('db: aclarar con un toque deja el borrador listo; cambiar foto guarda elegida', () => {
    const db = dbBase();
    const h = voz.extraerHechos('Hoy llegaron los alfajores nuevos, quedan veinte', DIGEST);
    const b = voz.crearBorradorVoz(db, { userId: 84, transcript: 'Hoy llegaron los alfajores nuevos, quedan veinte', hechos: h, foto: null, fotoOrigen: 'falta', audioPath: '', caption: 'Hoy llegaron los alfajores nuevos', hashtags: '' });
    const ac = voz.aclararVoz(db, b.id, 'alfajores nuevos');
    assert.equal(ac.ok, true);
    assert.equal(ac.estado, 'listo');
    assert.deepEqual(ac.hechos.productos, ['alfajores nuevos']);
    const cf = voz.cambiarFotoVoz(db, b.id, '/media/alfajor-foto.jpg');
    assert.equal(cf.foto, '/media/alfajor-foto.jpg');
    assert.equal(cf.foto_origen, 'elegida');
  });
  t('db: rehacer texto rechaza caption con invento y acepta caption limpio', () => {
    const db = dbBase();
    const h = voz.extraerHechos('Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    const b = voz.crearBorradorVoz(db, { userId: 84, transcript: 'Hoy llegaron las tortas de chocolate, quedan diez', hechos: h, foto: '/media/torta-real.jpg', fotoOrigen: 'conocida', audioPath: '', caption: '', hashtags: '' });
    assert.equal(b.estado, 'texto_pendiente');
    const malo = voz.rehacerTextoVoz(db, b.id, 'Quedan veinte tortas, a solo 999', h, 'Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    assert.equal(malo.ok, false);
    const bueno = voz.rehacerTextoVoz(db, b.id, 'Hoy llegaron las tortas de chocolate, quedan diez #tortas', h, 'Hoy llegaron las tortas de chocolate, quedan diez', DIGEST);
    assert.equal(bueno.ok, true);
    assert.equal(bueno.caption, 'Hoy llegaron las tortas de chocolate, quedan diez');
    assert.deepEqual(bueno.hashtags, ['#tortas']);
  });
  t('reel: args pegan la voz real como pista principal y la foto con kenburns', () => {
    const args = voz.armarReelVozArgs({ fotoAbs: '/tmp/foto.jpg', audioAbs: '/tmp/voz.mp3', outAbs: '/tmp/reel.mp4', durSeg: 16 });
    assert.ok(args.includes('/tmp/foto.jpg'));
    assert.ok(args.includes('/tmp/voz.mp3'));
    assert.ok(args.includes('1:a'));
    assert.ok(args.includes('/tmp/reel.mp4'));
    assert.ok(args.join(' ').includes('zoompan'));
  });
  await ta('reel: mux real foto+voz → video con 1 stream de video y 1 de audio', async () => {
    let ffmpeg = true;
    try { execSync('command -v ffmpeg && command -v ffprobe', { stdio: 'pipe' }); } catch (_) { ffmpeg = false; }
    if (!ffmpeg) { console.log('  (skip: ffmpeg/ffprobe no disponibles)'); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-reel-'));
    const foto = path.join(dir, 'foto.jpg');
    const audio = path.join(dir, 'voz.wav');
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x2793C8:s=540x960:d=2', '-frames:v', '1', foto], { stdio: 'pipe' });
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:d=2', audio], { stdio: 'pipe' });
    const out = path.join(dir, 'reel.mp4');
    await voz.mezclarVozEnReel(voz.armarReelVozArgs({ fotoAbs: foto, audioAbs: audio, outAbs: out, durSeg: 2 }));
    const probe = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_streams "${out}"`, { encoding: 'utf8' }));
    const kinds = probe.streams.map(s => s.codec_type).sort();
    assert.deepEqual(kinds, ['audio', 'video']);
  });
  await ta('modelo: generarCaptionVoz por stub separa hashtags y no explota sin llave', async () => {
    const sin = await voz.generarCaptionVoz({ apiKey: null, prompt: 'x' });
    assert.equal(sin, null);
    const con = await voz.generarCaptionVoz({
      apiKey: 'k',
      prompt: 'x',
      fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Hoy llegaron las tortas de chocolate, quedan diez #tortas #chocolate' } }] }) }),
    });
    assert.equal(con.text, 'Hoy llegaron las tortas de chocolate, quedan diez');
    assert.deepEqual(con.hashtags, ['#tortas', '#chocolate']);
  });

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
