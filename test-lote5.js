'use strict';
/* test-lote5.js — LOTE 5: Impulsar con pago + video premium + voz E2E.
 * Corre: node test-lote5.js
 * Cero gasto real: Stripe/fal/OpenAI van por stubs; el único gasto real
 * del lote (TTS+Whisper de prueba, <USD 0,01) lo hizo el agente por el
 * conector y su transcripción quedó como fixture abajo (no es la voz
 * de Valentino: es voz sintética). Los tests acá no tocan red ni llaves.
 * Fixtures de archivos reales del árbol (no generados): post-food.png
 * (foto) y video-food.mp4 (clip) copiados a un tmp dentro del árbol
 * (como test-ai-video.js: /tmp es tmpfs y se llena); se borra al final.
 */
process.env.POSTY_AI_VIDEO_POLL_MS = '200';
process.env.POSTY_AI_VIDEO_DEADLINE_MS = '60000';
delete process.env.POSTY_AI_VIDEO;
delete process.env.FAL_KEY;
delete process.env.POSTY_AI_VIDEO_UIDS;
delete process.env.POSTY_AI_VIDEO_MODEL;

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const destac = require('./destacado-semana.js');
const cobro = require('./destacado-cobro.js');
const video = require('./ai-video.js');
const costs = require('./costs');
const voz = require('./voz-dueno.js');

let pass = 0, fail = 0;
function t(nombre, fn) {
  try { fn(); pass++; console.log('PASS ' + nombre); }
  catch (e) { fail++; console.log('FAIL ' + nombre + ' :: ' + (e && e.message)); }
}
async function ta(nombre, fn) {
  try { await fn(); pass++; console.log('PASS ' + nombre); }
  catch (e) { fail++; console.log('FAIL ' + nombre + ' :: ' + (e && e.message)); }
}

const tmpRoot = fs.mkdtempSync(path.join(__dirname, '.test-lote5-'));
const mediaDir = path.join(tmpRoot, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const fotoReal = path.join(mediaDir, 'post-food.png');
fs.copyFileSync(path.join(__dirname, 'post-food.png'), fotoReal);
const clipReal = fs.readFileSync(path.join(__dirname, 'video-food.mp4'));

function dbBase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT,
    caption TEXT, hashtags TEXT, scheduled_at TEXT, status TEXT DEFAULT 'draft',
    ig_permalink TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')),
    published_at TEXT, carousel_paths TEXT, tipo TEXT DEFAULT '', media_type TEXT DEFAULT '')`);
  db.exec(`CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, file_path TEXT,
    kind TEXT DEFAULT 'photo', thumb_path TEXT, album_tag TEXT, album_quality TEXT)`);
  db.exec(`CREATE TABLE api_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    user_id INTEGER, feature TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
    in_tokens INTEGER NOT NULL DEFAULT 0, out_tokens INTEGER NOT NULL DEFAULT 0,
    cached_tokens INTEGER NOT NULL DEFAULT 0, images INTEGER NOT NULL DEFAULT 0,
    est_cost_usd REAL NOT NULL DEFAULT 0)`);
  db.exec(`CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', category TEXT DEFAULT '')`);
  return db;
}

(async () => {
  // ============ 1. IMPULSAR: COBRO (destacado-cobro) ============
  const fakeStripe = (o) => {
    const api = {
      customers: { retrieve: async () => o.customer || {} },
      paymentMethods: { list: async () => ({ data: o.pms || [] }) },
      paymentIntents: { create: async (params, opts) => { api.lastCreate = { params, opts }; return o.pi; } },
    };
    return api;
  };
  await ta('cobro: sin cliente Stripe no cobra', async () => {
    const r = await cobro.cobrarImpulso({ client: fakeStripe({}), customerId: '', montoUSD: 50, posteoId: 1 });
    assert.equal(r.motivo, 'sin_cliente_stripe');
  });
  await ta('cobro: sin cliente API no cobra', async () => {
    const r = await cobro.cobrarImpulso({ client: null, customerId: 'cus_1', montoUSD: 50, posteoId: 1 });
    assert.equal(r.motivo, 'stripe_no_configurado');
  });
  await ta('cobro: monto fuera de los 3 fijos no cobra', async () => {
    const r = await cobro.cobrarImpulso({ client: fakeStripe({}), customerId: 'cus_1', montoUSD: 30, posteoId: 1 });
    assert.equal(r.motivo, 'monto_invalido');
  });
  await ta('cobro: sin tarjeta guardada no cobra', async () => {
    const r = await cobro.cobrarImpulso({ client: fakeStripe({ customer: {}, pms: [] }), customerId: 'cus_1', montoUSD: 50, posteoId: 1 });
    assert.equal(r.motivo, 'sin_tarjeta_guardada');
  });
  await ta('cobro: off-session USD con idempotencia', async () => {
    const f = fakeStripe({ customer: { invoice_settings: { default_payment_method: 'pm_1' } }, pi: { id: 'pi_1', status: 'succeeded' } });
    const r = await cobro.cobrarImpulso({ client: f, customerId: 'cus_1', montoUSD: 50, posteoId: 7, weekKey: '2026-11-02', dias: 7 });
    assert.equal(r.ok, true); assert.equal(r.cobroId, 'pi_1');
    assert.equal(f.lastCreate.params.amount, 5000);
    assert.equal(f.lastCreate.params.currency, 'usd');
    assert.equal(f.lastCreate.params.off_session, true);
    assert.equal(f.lastCreate.params.confirm, true);
    assert.match(f.lastCreate.opts.idempotencyKey, /destacado:cus_1:2026-11-02:7:50/);
  });
  await ta('cobro: tarjeta rechazada no cobra', async () => {
    const f = fakeStripe({ customer: { invoice_settings: { default_payment_method: 'pm_1' } } });
    f.paymentIntents.create = async () => { throw new Error('card_declined'); };
    const r = await cobro.cobrarImpulso({ client: f, customerId: 'cus_1', montoUSD: 20, posteoId: 7 });
    assert.equal(r.motivo, 'cobro_fallido');
  });
  await ta('cobro: 3DS requerido no se confirma solo', async () => {
    const f = fakeStripe({ customer: { invoice_settings: { default_payment_method: 'pm_1' } }, pi: { id: 'pi_2', status: 'requires_action' } });
    const r = await cobro.cobrarImpulso({ client: f, customerId: 'cus_1', montoUSD: 100, posteoId: 7 });
    assert.equal(r.motivo, 'cobro_requiere_accion');
  });

  // ============ 1b. IMPULSAR: ORQUESTACIÓN (procesarImpulso) ============
  const base = {
    semana: { destacadoId: 7 }, monto: 50, clienteId: 9, zona: 'AR', env: { DESTACADO_BOOST_ENABLED: '1' },
    adsConfigurado: true, paginaAutorizada: true, posteoPublicado: true,
    conversionARS: (m) => m * 1000,
    cobrar: async () => ({ ok: true, cobroId: 'pi_9' }),
    publicarAnuncio: async () => ({ ok: true, anuncioId: 'camp_1', campaignId: 'camp_1', adsetId: 'set_1', adId: 'ad_1' }),
    registrar: async () => {},
  };
  await ta('impulso: sin conversión NO se cobra (fail-closed antes del cobro)', async () => {
    let cobroLlamado = false;
    const r = await destac.procesarImpulso({ ...base, conversionARS: null, cobrar: async () => { cobroLlamado = true; return { ok: true, cobroId: 'pi_x' }; } });
    assert.equal(r.motivo, 'conversion_pendiente');
    assert.equal(cobroLlamado, false);
  });
  await ta('impulso: conversión definida cobra y pauta y registra éxito', async () => {
    const regs = [];
    const r = await destac.procesarImpulso({ ...base, registrar: async (rec) => { regs.push(rec); } });
    assert.equal(r.ok, true); assert.equal(r.cobroId, 'pi_9'); assert.equal(r.anuncioId, 'camp_1');
    assert.equal(regs.length, 1); assert.equal(regs[0].tipo, 'exito'); assert.equal(regs[0].spendCents, 50000);
  });
  await ta('impulso: anuncio fallido tras cobro se registra, sin reembolso automático', async () => {
    const regs = [];
    const r = await destac.procesarImpulso({ ...base, publicarAnuncio: async () => ({ ok: false, error: 'meta 500' }), registrar: async (rec) => { regs.push(rec); } });
    assert.equal(r.motivo, 'anuncio_fallido'); assert.equal(r.cobroId, 'pi_9');
    assert.equal(regs.length, 1); assert.equal(regs[0].tipo, 'anuncio_fallido');
  });
  await ta('impulso: cobro fallido no publica anuncio', async () => {
    let adLlamado = false;
    const r = await destac.procesarImpulso({ ...base, cobrar: async () => ({ ok: false, motivo: 'cobro_fallido' }), publicarAnuncio: async () => { adLlamado = true; return { ok: true }; } });
    assert.equal(r.motivo, 'cobro_fallido'); assert.equal(adLlamado, false);
  });
  await ta('impulso: flag off no cobra ni pauta', async () => {
    const r = await destac.procesarImpulso({ ...base, env: {} });
    assert.equal(r.motivo, 'boost_deshabilitado');
  });
  await ta('impulso: registrar que tira no tapa un éxito', async () => {
    const r = await destac.procesarImpulso({ ...base, registrar: async () => { throw new Error('db caida'); } });
    assert.equal(r.ok, true);
  });

  // ============ 1c. BADGE en página de aprobación ============
  t('badge: solo el destacado lleva la pill', () => {
    assert.match(destac.badgeAprobarHTML(7, 7, false), /DESTACADO DE LA SEMANA/);
    assert.equal(destac.badgeAprobarHTML(7, 8, false), '');
    assert.equal(destac.badgeAprobarHTML(null, 7, false), '');
    assert.match(destac.badgeAprobarHTML(7, '7', true), /FEATURED POST OF THE WEEK/);
  });

  // ============ 2. VIDEO PREMIUM: GATES, CAPS, MOCK E2E ============
  t('video: gates (flag/key/uids) todas las combinaciones', () => {
    delete process.env.POSTY_AI_VIDEO; delete process.env.FAL_KEY; delete process.env.POSTY_AI_VIDEO_UIDS;
    assert.equal(video.aiVideoEnabledFor(9), false);
    process.env.POSTY_AI_VIDEO = '1';
    assert.equal(video.aiVideoEnabledFor(9), false);
    process.env.FAL_KEY = 'fal_test';
    assert.equal(video.aiVideoEnabledFor(9), false);
    process.env.POSTY_AI_VIDEO_UIDS = '3,9';
    assert.equal(video.aiVideoEnabledFor(9), true);
    assert.equal(video.aiVideoEnabledFor(10), false);
    delete process.env.POSTY_AI_VIDEO; delete process.env.FAL_KEY; delete process.env.POSTY_AI_VIDEO_UIDS;
  });
  t('video: routing y caps 14/32', () => {
    assert.equal(video.modelForPlan('esencial').modelId, 'bytedance/seedance-2.0/fast/image-to-video');
    assert.equal(video.modelForPlan('esencial').duration, '8');
    assert.equal(video.modelForPlan('pro').duration, '10');
    assert.equal(costs.aiVideoCapUsd('esencial'), 14);
    assert.equal(costs.aiVideoCapUsd('pro'), 32);
    assert.equal(costs.aiVideoCapUsd('total'), 32);
    // Estimación pro: 10s x 0.4730 = 4.73 (la pasada real de Valentino).
    assert.equal(Math.round(video.modelForPlan('pro').rateUsdPerSec * 10 * 100) / 100, 4.73);
  });

  // Mock de fal (cero red real): initiate/PUT/submit/status/result/download.
  const falCalls = { submits: 0, status: 0 };
  let falMode = 'ok';
  const mkRes = ({ status = 200, json = null, buf = null }) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => json, text: async () => (json ? JSON.stringify(json) : ''),
    arrayBuffer: async () => (buf ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : new ArrayBuffer(0)),
  });
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    if (u.includes('storage/upload/initiate')) return mkRes({ json: { upload_url: 'https://stub.test/put', file_url: 'https://stub.test/hero.jpg' } });
    if (u === 'https://stub.test/put') return mkRes({ json: {} });
    if (u.includes('queue.fal.run') && method === 'POST' && !u.includes('/status/') && !u.includes('/result/')) {
      falCalls.submits++;
      return mkRes({ json: { request_id: 'req-9', status_url: 'https://stub.test/status', response_url: 'https://stub.test/result', cancel_url: 'https://stub.test/cancel' } });
    }
    if (u === 'https://stub.test/status') {
      falCalls.status++;
      if (falMode === 'reject') return mkRes({ json: { status: 'ERROR', error: 'policy violation content' } });
      return mkRes({ json: { status: falCalls.status < 2 ? 'IN_PROGRESS' : 'COMPLETED' } });
    }
    if (u === 'https://stub.test/result') return mkRes({ json: { video: { url: 'https://stub.test/video.mp4' }, seed: 1 } });
    if (u === 'https://stub.test/video.mp4') return mkRes({ buf: clipReal });
    throw new Error('fetch no stubbeado: ' + u);
  };
  const dbV = dbBase();
  costs.initCosts(dbV, { planFor: () => null });
  const uidV = 42, weekV = '2026-11-02';
  await ta('video: gates apagados no llaman a fal', async () => {
    delete process.env.POSTY_AI_VIDEO; delete process.env.FAL_KEY; delete process.env.POSTY_AI_VIDEO_UIDS;
    falCalls.submits = 0;
    const r = await video.generateSignatureClip({ db: dbV, uid: uidV, planId: 'esencial', imageFile: fotoReal, prompt: '', mediaDir, weekKey: weekV });
    assert.equal(r, null); assert.equal(falCalls.submits, 0);
  });
  await ta('video: mock E2E genera clip real, registra biblioteca y costo', async () => {
    process.env.POSTY_AI_VIDEO = '1'; process.env.FAL_KEY = 'fal_test'; process.env.POSTY_AI_VIDEO_UIDS = '42';
    falMode = 'ok'; falCalls.submits = 0; falCalls.status = 0;
    const r = await video.generateSignatureClip({ db: dbV, uid: uidV, planId: 'pro', imageFile: fotoReal, prompt: 'Slow push-in', mediaDir, weekKey: weekV });
    assert.ok(r && r.file && fs.existsSync(r.file));
    assert.equal(r.seconds, 10); assert.equal(r.costUsd, 4.73);
    assert.equal(falCalls.submits, 1);
    const lib = dbV.prepare(`SELECT * FROM ai_signature_clips WHERE user_id = ? AND week_key = ?`).get(uidV, weekV);
    assert.ok(lib && lib.file_name === `ai-signature-${uidV}-${weekV}.mp4`);
    const spent = dbV.prepare(`SELECT COALESCE(SUM(est_cost_usd),0) s FROM api_costs WHERE user_id = ? AND feature = 'ai-video'`).get(uidV).s;
    assert.equal(spent, 4.73);
  });
  await ta('video: cap alcanzado no gasta', async () => {
    dbV.prepare(`INSERT INTO api_costs (user_id, feature, model, est_cost_usd) VALUES (?,?,?,?)`).run(uidV, 'ai-video', 'seedance', 14);
    falCalls.submits = 0;
    const r = await video.generateSignatureClip({ db: dbV, uid: uidV, planId: 'esencial', imageFile: fotoReal, prompt: '', mediaDir, weekKey: '2026-11-09' });
    assert.equal(r, null); assert.equal(falCalls.submits, 0);
  });
  await ta('video: clip existente se reusa sin gastar', async () => {
    falCalls.submits = 0;
    const r = await video.generateSignatureClip({ db: dbV, uid: uidV, planId: 'pro', imageFile: fotoReal, prompt: '', mediaDir, weekKey: weekV });
    assert.equal(r.reused, true); assert.equal(falCalls.submits, 0);
  });
  await ta('video: rechazo de contenido no reintenta', async () => {
    falMode = 'reject'; falCalls.submits = 0;
    const r = await video.generateSignatureClip({ db: dbV, uid: uidV, planId: 'pro', imageFile: fotoReal, prompt: '', mediaDir, weekKey: '2026-11-16' });
    assert.equal(r, null); assert.equal(falCalls.submits, 1);
  });
  delete process.env.POSTY_AI_VIDEO; delete process.env.FAL_KEY; delete process.env.POSTY_AI_VIDEO_UIDS;

  // ============ 3. VOZ DEL DUEÑO E2E ============
  // Fixture: transcripción REAL de Whisper (verificada por el agente con
  // audio TTS sintético, NO voz de Valentino): "Hoy llegaron las tortas
  // de chocolate. Quedan 10."
  const DIGEST = { productos: [{ nombre: 'torta de chocolate', precio: 1200 }, { nombre: 'café' }, { nombre: 'budín de limón' }], servicios: [], lexicon: { entries: [] } };
  const TRANSCRIPT = 'Hoy llegaron las tortas de chocolate. Quedan 10.';
  const dbZ = dbBase();
  dbZ.prepare(`INSERT INTO assets (user_id, file_path, kind, album_tag) VALUES (?,?,?,?)`).run(81, '/media/post-food.png', 'photo', 'torta chocolate');
  t('voz: transcript real es reporte del día', () => {
    assert.equal(voz.esReporteDelDia(TRANSCRIPT), true);
  });
  t('voz: hechos solo de lo dicho (producto + cantidad, sin precio inventado)', () => {
    const h = voz.extraerHechos(TRANSCRIPT, DIGEST);
    assert.deepEqual(h.productos, ['torta de chocolate']);
    assert.equal(h.cantidad, 10);
    assert.equal(h.precio, null);
    assert.equal(h.dudas.length, 0);
  });
  t('voz: foto REAL por tag, sin adivinar', () => {
    const f = voz.elegirFoto(dbZ, 81, 'torta de chocolate');
    assert.equal(f.origen, 'conocida'); assert.equal(f.foto, '/media/post-food.png');
  });
  const captionOk = 'Hoy llegaron las tortas de chocolate, quedan 10. Vení a buscar la tuya.';
  t('voz: gate anti-invento deja pasar lo dicho y frena lo inventado', () => {
    const h = voz.extraerHechos(TRANSCRIPT, DIGEST);
    assert.equal(voz.verificarCaptionSinInvento(captionOk, h, TRANSCRIPT, DIGEST).ok, true);
    assert.equal(voz.verificarCaptionSinInvento('Hoy llegaron las tortas, quedan 50.', h, TRANSCRIPT, DIGEST).ok, false);
  });
  let borradorId = 0;
  t('voz: borrador queda listo con 3 toques', () => {
    const h = voz.extraerHechos(TRANSCRIPT, DIGEST);
    const b = voz.crearBorradorVoz(dbZ, { userId: 81, transcript: TRANSCRIPT, hechos: h, foto: '/media/post-food.png', fotoOrigen: 'conocida', audioPath: '/media/test-voz.mp3', caption: captionOk, hashtags: '' });
    assert.equal(b.estado, 'listo'); borradorId = b.id;
  });
  t('voz: aprobar programa el posteo en el slot del día', () => {
    const slot = voz.slotDelDia({ tz: 'America/Argentina/Buenos_Aires', bestHour: 19, takenYmd: new Set(), closedWeekdays: new Set(), nowMs: Date.now() });
    assert.ok(slot && new Date(slot).getTime() > Date.now());
    const ap = voz.aprobarVoz(dbZ, borradorId, slot);
    assert.equal(ap.ok, true);
    const post = dbZ.prepare(`SELECT * FROM posts WHERE id = ?`).get(ap.postId);
    assert.equal(post.status, 'scheduled'); assert.equal(post.image_path, '/media/post-food.png');
  });
  t('voz: cambiar foto elige de las reales', () => {
    const r = voz.cambiarFotoVoz(dbZ, borradorId, '/media/post-food.png');
    assert.equal(r.ok, true); assert.equal(r.foto_origen, 'elegida');
  });
  t('voz: rehacer texto pasa por el gate', () => {
    const row = voz.leerBorradorVoz(dbZ, borradorId, 81);
    const r = voz.rehacerTextoVoz(dbZ, borradorId, 'Hoy llegaron las tortas de chocolate, quedan 10.', row.hechos, TRANSCRIPT, DIGEST);
    assert.equal(r.ok, true);
  });
  await ta('voz: STT sin llave queda pendiente declarado (503, nunca simulado)', async () => {
    const tone = path.join(mediaDir, 'tone.mp3');
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', tone], { stdio: 'ignore' });
    const dataUrl = 'data:audio/mpeg;base64,' + fs.readFileSync(tone).toString('base64');
    const r = await voz.transcribirVoz(dataUrl, '');
    assert.equal(r.codigo, 'stt_sin_llave'); assert.equal(r.pendiente, true);
  });
  await ta('voz: STT con stub devuelve texto (camino del endpoint)', async () => {
    const stubFetch = async () => ({ ok: true, json: async () => ({ text: TRANSCRIPT }) });
    const tone = path.join(mediaDir, 'tone.mp3');
    const dataUrl = 'data:audio/mpeg;base64,' + fs.readFileSync(tone).toString('base64');
    const r = await voz.transcribirVoz(dataUrl, 'key_test', stubFetch);
    assert.equal(r.ok, true); assert.equal(r.text, TRANSCRIPT);
  });
  await ta('voz: reel con ffmpeg real queda BORRADOR, nunca se publica solo', async () => {
    const tone = path.join(mediaDir, 'tone.mp3');
    const outAbs = path.join(mediaDir, 'voz-reel-test.mp4');
    await voz.mezclarVozEnReel(voz.armarReelVozArgs({ fotoAbs: fotoReal, audioAbs: tone, outAbs, durSeg: 4 }));
    assert.ok(fs.existsSync(outAbs) && fs.statSync(outAbs).size > 0);
    const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', outAbs], { encoding: 'utf8' }).trim();
    assert.ok(probe.length > 0);
    // Camino del endpoint: el reel se inserta como post 'draft', sin publicar.
    const ins = dbZ.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo) VALUES (?,?,?,?,'draft','video','')`)
      .run(81, '/media/voz-reel-test.mp4', captionOk, '');
    const post = dbZ.prepare(`SELECT * FROM posts WHERE id = ?`).get(Number(ins.lastInsertRowid));
    assert.equal(post.status, 'draft');
  });

  console.log(`\ntest-lote5: ${pass} PASS, ${fail} FAIL`);
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL test-lote5:', e); try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {} process.exit(1); });
