'use strict';
/*
 * LOTE TEXTO-EN-IMAGEN — suite propia.
 * Orden de Valentino (14/11 13:42): «Si solo pido el tipo de cambios
 * a Posty, tiene que ser capaz de hacerlo y entenderlo rápido y
 * hacerlo rápido. Por ejemplo, decirle poné el caption adentro de la
 * imagen». El lote convierte el carril de cambios de v1077 en un
 * CATÁLOGO de tipos (PZ_CAMBIO_TIPOS): clasificación determinística
 * en el mismo turno, ejecutor «texto en imagen» que compone el texto
 * DENTRO de la foto siguiendo el sistema del feed (señal texto_feed)
 * con QA visual fail-closed antes de reemplazar, y el tipo inverso
 * «sin texto» solo cuando hay versión limpia recuperable.
 *
 * Secciones:
 *  1. Clasificación (bloque real): las frases del tipo disparan;
 *     los casos de v1077 (video, caption, logo) quedan en 'rehacer'.
 *  2. Bloque extraído con stubs (db falsa, visión por fetch inyectado
 *     con veredicto mutable, composición REAL con composite-headline.py
 *     + PIL sobre una foto real):
 *     a. Feed con-texto → ejecuta, reemplaza, anterior recuperable,
 *        overlay_text = titular, caption/fecha intactos.
 *     b. Feed limpio → modo sobrio declarado en el recibo.
 *     c. Caption largo → titular derivado (≤6 palabras) declarado.
 *     d. Texto dictado entre comillas → ese texto exacto.
 *     e. Video → honesto cambio_solo_foto por la red + conserje.
 *     f. QA con veredicto falso → fallo 'revision', imagen intacta.
 *     g. sin_texto restaura la limpia verificada; sin overlay →
 *        sin_texto_puesto; sin limpia → sin_version_limpia.
 *     h. El conserje (hilo='post') crea el trabajo con su tipo.
 *  3. Pines estáticos de cableado (release).
 *  4. CONTROL contra base/ (v1085): el pedido de hoy no ejecuta nada
 *     (la base no tiene catálogo ni cambio_tipo).
 *  5. Boot smoke: /api/version = v1086.
 * La visión real NO se ejercita (sin claves en sandbox): el veredicto
 * llega por el fetch inyectado, como en pedido-chat-ejecuta. El stub
 * de makeHeadline cumple el contrato declarado (primera línea del
 * texto, ≤6 palabras); en producción corre la real de server.js.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const BASE = path.join(ROOT, '..', 'base');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
const demoSrc = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const hasBase = fs.existsSync(path.join(BASE, 'server.js'));
const baseServerSrc = hasBase ? fs.readFileSync(path.join(BASE, 'server.js'), 'utf8') : '';
const baseDbSrc = hasBase ? fs.readFileSync(path.join(BASE, 'db.js'), 'utf8') : '';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, name) { if (cond) { pass++; } else { fail++; bad.push(name); console.log('  ✗ ' + name); } }
function eq(a, b, name) { ok(a === b, name + ` (esperado ${JSON.stringify(b)}, vino ${JSON.stringify(a)})`); }
const count = (s, sub) => String(s).split(sub).length - 1;

// ── Db falsa (la de v1077 + cambio_tipo + overlay_text + versiones) ──
const MEDIA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tei-media-'));
function makeFakeDb() {
  const posts = new Map(); const trabajos = []; const mensajes = []; const versiones = []; const assets = new Map();
  let tid = 0, mid = 0;
  const api = {
    _posts: posts, _trabajos: trabajos, _mensajes: mensajes, _versiones: versiones, _assets: assets,
    prepare(sql) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      return {
        get(...a) {
          if (s.startsWith('SELECT * FROM posts WHERE id = ? AND user_id = ?')) { const p = posts.get(Number(a[0])); return p && Number(p.user_id) === Number(a[1]) ? p : undefined; }
          if (s.startsWith('SELECT file_path FROM assets')) { const x = assets.get(Number(a[0])); return x ? { file_path: x } : undefined; }
          if (s.startsWith('SELECT * FROM trabajos WHERE id = ?')) return trabajos.find(t => t.id === Number(a[0]));
          if (s.includes("tipo = 'chat_cambio'") && s.startsWith('SELECT * FROM trabajos')) return trabajos.filter(t => Number(t.user_id) === Number(a[0]) && Number(t.post_id) === Number(a[1]) && t.estado === 'creando').pop();
          if (s.startsWith('SELECT id, text FROM chat_messages WHERE id = ?')) { const m = mensajes.find(x => x.id === Number(a[0])); return m ? { id: m.id, text: m.text } : undefined; }
          return undefined;
        },
        run(...a) {
          if (s.startsWith('INSERT INTO trabajos')) {
            const conError = s.includes("0,'',?");
            const row = { id: ++tid, user_id: a[0], tipo: a[1], estado: a[2], post_id: a[3], titulo: a[4], caption: a[5], estimado_seg: conError ? 0 : a[6], hilo: conError ? '' : a[7], cambio_tipo: (!conError && s.includes('cambio_tipo')) ? a[8] : '', error: conError ? a[6] : '', mensaje_id: null, mensaje_final_id: null, created_at: '2026-11-14 13:45:00', updated_at: 'T0' };
            trabajos.push(row); return { lastInsertRowid: row.id, changes: 1 };
          }
          if (s.startsWith('INSERT INTO chat_messages')) {
            const m = { id: ++mid, user_id: a[0], role: a[1], text: a[2], hilo: a.length > 3 ? a[3] : '', post_id: a.length > 4 ? a[4] : null };
            mensajes.push(m); return { lastInsertRowid: m.id, changes: 1 };
          }
          if (s.startsWith('INSERT INTO post_versions')) { versiones.push({ post_id: a[0], caption: a[1], hashtags: a[2], image_path: a[3], overlay_text: a[4] }); return { lastInsertRowid: versiones.length, changes: 1 }; }
          if (s.startsWith('UPDATE trabajos SET mensaje_id')) { const t = trabajos.find(x => x.id === Number(a[1])); if (t) t.mensaje_id = a[0]; return { changes: t ? 1 : 0 }; }
          if (s.startsWith('UPDATE trabajos SET mensaje_final_id')) { const t = trabajos.find(x => x.id === Number(a[1])); if (t) t.mensaje_final_id = a[0]; return { changes: t ? 1 : 0 }; }
          if (s.includes("SET estado='fallo'")) { const t = trabajos.find(x => x.id === Number(a[1])); if (t && t.estado === 'creando') { t.estado = 'fallo'; t.error = a[0]; return { changes: 1 }; } return { changes: 0 }; }
          if (s.includes("SET estado='lista'")) { const t = trabajos.find(x => x.id === Number(a[0])); if (t && t.estado === 'creando' && t.updated_at === a[1]) { t.estado = 'lista'; return { changes: 1 }; } return { changes: 0 }; }
          if (s.startsWith('UPDATE posts SET caption')) { const p = posts.get(Number(a[2])); if (p) { p.caption = a[0]; p.hashtags = a[1]; } return { changes: p ? 1 : 0 }; }
          if (s.startsWith('UPDATE posts SET image_path')) {
            const p = posts.get(Number(a[a.length - 1]));
            if (p) { p.image_path = a[0]; p.prev_image_path = a[1]; if (s.includes('overlay_text')) p.overlay_text = a[2]; else if (s.includes('cover_path')) p.cover_path = a[2]; }
            return { changes: p ? 1 : 0 };
          }
          if (s.startsWith('DELETE FROM chat_messages')) { const i = mensajes.findIndex(x => x.id === Number(a[0])); if (i >= 0) mensajes.splice(i, 1); return { changes: i >= 0 ? 1 : 0 }; }
          if (s.startsWith('UPDATE chat_messages SET text')) { const m = mensajes.find(x => x.id === Number(a[1])); if (m) m.text = a[0]; return { changes: m ? 1 : 0 }; }
          return { changes: 0, lastInsertRowid: 0 };
        },
        all() { return []; },
      };
    },
  };
  return api;
}

// Estado mutable de los stubs (digest del feed + veredictos de visión).
let digestActual = { texto_feed: { modo: 'con-texto', tamano: 'large' } };
let veredictoTexto = { legible: true, en_banda: true, no_tapa: true, un_solo_texto: true, motivo: 'ok' };
let veredictoSin = { misma_foto: true, sin_texto: true, motivo: 'ok' };
let llamadasVision = 0;

async function bloqueConStubs(db) {
  const ini = serverSrc.indexOf('// ── PEDIDO-CHAT-SE-EJECUTA');
  const fin = serverSrc.indexOf('// Red anti-silencio: corre DESPUÉS');
  ok(ini > 0 && fin > ini, 'bloque del carril localizable en server.js');
  const code = serverSrc.slice(ini, fin) + '\n;globalThis.__api = { pzCambioTipoDePedido, pzCambioTipoEspecificoDe, pzTextoDictadoEnPedido, pzChatCambioCrearTrabajo, pzTrabajoChatCambioRun, pzChatCambioSiFalta, pzTrabajoCambioFalloAmable };';
  const mScale = demoSrc.match(/function headlineScaleForTextoFeed[\s\S]*?\n\}/);
  ok(!!mScale, 'headlineScaleForTextoFeed extraíble de demo.js (la real)');
  const scaleFn = mScale ? eval('(' + mScale[0].replace('function headlineScaleForTextoFeed', 'function f') + ')') : () => 1;
  const cola = [];
  const decisiones = [];
  const sandbox = {
    console, JSON, Math, Date, Buffer, setTimeout, clearTimeout, AbortSignal,
    setImmediate: (fn) => { cola.push(fn); },
    fs, path, db, MEDIA_DIR: MEDIA_TMP, __dirname: ROOT,
    openaiKeyFor: () => 'sk-test',
    costs: { trackUsage() {} },
    langOfUser: () => 'es',
    redoLeftOf: () => null,
    consumeRedo: () => true,
    pzTrabajoPublico: (row) => row ? { id: row.id, estado: row.estado, tipo: row.tipo, post_id: row.post_id, cambio_tipo: row.cambio_tipo || '' } : null,
    characterBlocksDelivery: () => false,
    contentInputFor: () => ({}),
    generateContent: async () => ({ caption: 'Caption nuevo generado', hashtags: '#nuevo' }),
    push: { sendPush: async () => {} },
    chatQuotedPostMatch: () => null,
    supportCases: { decideVoiceRequest: (d, o) => { decisiones.push(o); return { ok: true }; } },
    clientDigest: { getDigest: () => digestActual },
    demo: { headlineScaleForTextoFeed: scaleFn },
    // Contrato declarado de makeHeadline: primera línea, ≤6 palabras.
    makeHeadline: (fuente) => String(fuente || '').split('\n')[0].replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 6).join(' '),
    rubroOf: () => '',
    require: (m) => require(m),
    fetch: async (url, opts) => {
      llamadasVision++;
      let prompt = '';
      try { prompt = JSON.parse(opts.body).messages[0].content[0].text; } catch (e) {}
      const content = prompt.includes('titular que se tenía que poner') ? JSON.stringify(veredictoTexto)
        : prompt.includes('DOS imágenes') ? JSON.stringify(veredictoSin) : '{}';
      return { json: async () => ({ choices: [{ message: { content } }] }) };
    },
    __decisiones: decisiones, __cola: cola,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

async function esperarJob(db, jobId, ms) {
  const job = db._trabajos.find(t => t.id === jobId);
  for (let i = 0; i < Math.floor((ms || 90000) / 250) && job && job.estado === 'creando'; i++) await new Promise(r => setTimeout(r, 250));
  return job;
}
function fotoPost(id, extra) {
  return Object.assign({ id, user_id: 12, media_type: 'image', status: 'scheduled', scheduled_at: '2026-11-16 00:00:00', caption: 'Medialunas recién horneadas para vos hoy', hashtags: '#pasteleria', image_path: '/media/foto.jpg', prev_image_path: '', cover_path: '', overlay_text: '', reel_receta: '' }, extra || {});
}

(async () => {
  // Fotos reales en el MEDIA del sandbox (la composición es real).
  const mk = (name, color) => execFileSync('python3', ['-c', `from PIL import Image; Image.new("RGB", (800, 1000), ${color}).save("${path.join(MEDIA_TMP, name)}", "JPEG", quality=90)`]);
  mk('foto.jpg', '(210, 180, 140)'); mk('limpia.jpg', '(210, 180, 140)'); mk('con-texto.jpg', '(190, 160, 120)');

  // ── 1. Clasificación ─────────────────────────────────────────────
  console.log('· 1. Clasificación del catálogo');
  {
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    eq(api.pzCambioTipoDePedido(null, 'poné el caption adentro de la imagen'), 'texto_en_imagen', '«poné el caption adentro de la imagen» → texto_en_imagen');
    eq(api.pzCambioTipoDePedido(null, 'meté el texto en la foto'), 'texto_en_imagen', '«meté el texto en la foto» → texto_en_imagen');
    eq(api.pzCambioTipoDePedido(null, 'put the caption inside the photo'), 'texto_en_imagen', 'EN: «put the caption inside the photo» → texto_en_imagen');
    eq(api.pzCambioTipoDePedido(null, 'el caption adentro de la imagen'), 'texto_en_imagen', 'sin verbo: «el caption adentro de la imagen» → texto_en_imagen');
    eq(api.pzCambioTipoDePedido(null, 'poné "Abierto todos los días" adentro de la imagen'), 'texto_en_imagen', 'con dictado → texto_en_imagen');
    eq(api.pzTextoDictadoEnPedido('poné "Abierto todos los días" adentro de la imagen'), 'Abierto todos los días', 'el dictado se extrae exacto');
    eq(api.pzCambioTipoDePedido(null, 'sacá el texto de la imagen'), 'sin_texto', '«sacá el texto de la imagen» → sin_texto');
    eq(api.pzCambioTipoDePedido(null, 'remove the text from the image'), 'sin_texto', 'EN: «remove the text from the image» → sin_texto');
    eq(api.pzCambioTipoDePedido(null, 'sacá el logo de la foto'), 'rehacer', '«sacá el logo de la foto» NO es sin_texto (sigue rehacer)');
    eq(api.pzCambioTipoDePedido(null, 'rehace el video con los subtítulos de manera perfecta y envíamelo'), 'rehacer', 'el caso 653 (video) queda en rehacer');
    eq(api.pzCambioTipoDePedido(null, 'cambiá el caption por uno más corto'), 'rehacer', 'cambio de caption queda en rehacer');
    eq(api.pzCambioTipoDePedido(null, 'dejalo sin texto'), 'rehacer', 'límite declarado: «sin texto» sin nombrar la imagen no se reclama');
    eq(api.pzCambioTipoEspecificoDe('poné el caption adentro de la imagen'), 'texto_en_imagen', 'la red reconoce el tipo específico');
    eq(api.pzCambioTipoEspecificoDe('hola! ¿cómo viene la semana?'), null, 'charla no es tipo específico');
  }

  // ── 2a. Feed con-texto: ejecuta y reemplaza ──────────────────────
  console.log('· 2a. Ejecutor con sistema del feed (con-texto)');
  {
    digestActual = { texto_feed: { modo: 'con-texto', tamano: 'large' } };
    veredictoTexto = { legible: true, en_banda: true, no_tapa: true, un_solo_texto: true, motivo: 'ok' };
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(801, fotoPost(801));
    const r = api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(801), pedido: 'poné el caption adentro de la imagen', hilo: '' });
    ok(r && r.job, '2a: el trabajo nace en el mismo turno');
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    eq(job.cambio_tipo, 'texto_en_imagen', '2a: el trabajo nace con su cambio_tipo');
    eq(job.estimado_seg, 60, '2a: el estimado es el del tipo (60)');
    ok(db._mensajes.some(m => m.text.includes(`[creando-imagen:${job.id}]`)), '2a: el estado visible vive en el hilo');
    for (const fn of sb.__cola.splice(0)) fn();
    await esperarJob(db, job.id);
    eq(job.estado, 'lista', '2a: el trabajo cierra «lista»');
    const post = db._posts.get(801);
    ok(/^\/media\/texto-en-imagen-801-/.test(post.image_path), '2a: la imagen del posteo es la compuesta');
    ok(fs.existsSync(path.join(MEDIA_TMP, path.basename(post.image_path))), '2a: el archivo compuesto existe en /media');
    eq(post.prev_image_path, '/media/foto.jpg', '2a: la anterior queda recuperable (prev_image_path)');
    eq(post.overlay_text, 'Medialunas recién horneadas para vos hoy', '2a: overlay_text = el titular puesto');
    eq(post.caption, 'Medialunas recién horneadas para vos hoy', '2a: el caption NO se tocó');
    eq(post.scheduled_at, '2026-11-16 00:00:00', '2a: el día/hora NO se tocó');
    eq(db._versiones.length, 1, '2a: post_versions guardó la versión anterior');
    const fin = db._mensajes.find(m => m.text.includes('[foto:/media/texto-en-imagen-801-'));
    ok(!!fin && fin.text.includes('puse el texto adentro'), '2a: el resultado aparece en el mismo chat con la foto');
    ok(!!fin && !fin.text.includes('sobrio'), '2a: con sistema del feed no se declara modo sobrio');
    ok(llamadasVision > 0, '2a: la QA visual se ejerció antes de reemplazar');
  }

  // ── 2b. Feed limpio: modo sobrio declarado ───────────────────────
  console.log('· 2b. Feed limpio → sobrio declarado');
  {
    digestActual = { texto_feed: { modo: 'limpio' } };
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(802, fotoPost(802, { caption: 'Croissants de manteca' }));
    const r = api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(802), pedido: 'poné el caption adentro de la imagen', hilo: '' });
    ok(r && r.job, '2b: el trabajo nace');
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    for (const fn of sb.__cola.splice(0)) fn();
    await esperarJob(db, job.id);
    eq(job.estado, 'lista', '2b: el trabajo cierra «lista»');
    eq(db._posts.get(802).overlay_text, 'Croissants de manteca', '2b: el titular se compuso igual (el pedido manda)');
    const fin = db._mensajes.find(m => m.text.includes('[foto:'));
    ok(!!fin && fin.text.includes('sobrio'), '2b: el recibo DECLARA el modo sobrio');
  }

  // ── 2c. Caption largo: titular derivado declarado ────────────────
  console.log('· 2c. Titular derivado');
  {
    digestActual = { texto_feed: { modo: 'con-texto', tamano: 'normal' } };
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(803, fotoPost(803, { caption: 'Las medialunas de manteca más ricas de todo el barrio porteño' }));
    api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(803), pedido: 'poné el caption adentro de la imagen', hilo: '' });
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    for (const fn of sb.__cola.splice(0)) fn();
    await esperarJob(db, job.id);
    eq(job.estado, 'lista', '2c: el trabajo cierra «lista»');
    eq(db._posts.get(803).overlay_text, 'Las medialunas de manteca más ricas', '2c: overlay_text = titular derivado de ≤6 palabras');
    const fin = db._mensajes.find(m => m.text.includes('[foto:'));
    ok(!!fin && fin.text.includes('no entra como titular') && fin.text.includes('«Las medialunas de manteca más ricas»'), '2c: el recibo declara el titular derivado');
    eq(db._posts.get(803).caption, 'Las medialunas de manteca más ricas de todo el barrio porteño', '2c: el caption completo queda intacto');
  }

  // ── 2d. Texto dictado ────────────────────────────────────────────
  console.log('· 2d. Texto dictado en el pedido');
  {
    digestActual = { texto_feed: { modo: 'limpio' } };
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(804, fotoPost(804, { caption: 'Otro caption cualquiera que no se usa para este cambio puntual' }));
    api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(804), pedido: 'poné "Abierto todos los días" adentro de la imagen', hilo: '' });
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    for (const fn of sb.__cola.splice(0)) fn();
    await esperarJob(db, job.id);
    eq(job.estado, 'lista', '2d: el trabajo cierra «lista»');
    eq(db._posts.get(804).overlay_text, 'Abierto todos los días', '2d: el texto puesto es el dictado, exacto');
  }

  // ── 2e. Video: honesto por la red ────────────────────────────────
  console.log('· 2e. Video → honesto cambio_solo_foto');
  {
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(805, fotoPost(805, { media_type: 'video', image_path: '/media/v.mp4', caption: 'Video de pastelería' }));
    const PROMESA = 'Dale, pongo el caption adentro de la imagen y te aviso.';
    const insP = db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(12, 'assistant', PROMESA);
    const promesaId = Number(insP.lastInsertRowid);
    const out = { reply: PROMESA, options: null };
    const r = api.pzChatCambioSiFalta({ uid: 12, clean: [{ role: 'user', text: 'poné el caption adentro de la imagen' }], out, anchorId: 805, anyWork: false, savedReplyId: promesaId, proseSnap: PROMESA });
    ok(r && r.imposible === 'cambio_solo_foto', '2e: la red declara la imposibilidad del tipo en video');
    const fila = db._mensajes.find(m => m.id === promesaId);
    ok(!!fila && fila.text.includes('[trabajo-fallo:') && fila.text.includes('video'), '2e: la prosa se REEMPLAZA por el recibo honesto (nunca promesa)');
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    ok(!!job && job.estado === 'fallo' && job.error === 'cambio_solo_foto', '2e: el trabajo queda registrado como fallo con el motivo');
    const copia = db._mensajes.find(m => m.hilo === 'post' && Number(m.post_id) === 805 && m.role === 'user');
    ok(!!copia && sb.__decisiones.some(d => d.decision === 'descartado' && Number(d.messageId) === copia.id), '2e: el pedido queda registrado en el conserje con el motivo');
    eq(db._posts.get(805).image_path, '/media/v.mp4', '2e: el video vigente no se tocó');
  }

  // ── 2f. QA no pasa: no reemplaza ─────────────────────────────────
  console.log('· 2f. QA fail-closed');
  {
    digestActual = { texto_feed: { modo: 'con-texto', tamano: 'large' } };
    veredictoTexto = { legible: false, en_banda: true, no_tapa: true, un_solo_texto: true, motivo: 'no se lee' };
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(806, fotoPost(806));
    api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(806), pedido: 'poné el caption adentro de la imagen', hilo: '' });
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    for (const fn of sb.__cola.splice(0)) fn();
    await esperarJob(db, job.id);
    eq(job.estado, 'fallo', '2f: sin QA aprobada el trabajo cierra en fallo');
    eq(job.error, 'revision', '2f: el motivo es revision (la vara no pasó)');
    eq(db._posts.get(806).image_path, '/media/foto.jpg', '2f: la imagen vigente NO se reemplazó');
    eq(db._posts.get(806).overlay_text, '', '2f: no quedó overlay registrado');
    veredictoTexto = { legible: true, en_banda: true, no_tapa: true, un_solo_texto: true, motivo: 'ok' };
  }

  // ── 2g. sin_texto ────────────────────────────────────────────────
  console.log('· 2g. Tipo inverso sin_texto');
  {
    veredictoSin = { misma_foto: true, sin_texto: true, motivo: 'ok' };
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(807, fotoPost(807, { image_path: '/media/con-texto.jpg', prev_image_path: '/media/limpia.jpg', overlay_text: 'Titular puesto' }));
    const r = api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(807), pedido: 'sacá el texto de la imagen', hilo: '' });
    ok(r && r.job, '2g: el trabajo del tipo inverso nace');
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    eq(job.cambio_tipo, 'sin_texto', '2g: cambio_tipo = sin_texto');
    eq(job.estimado_seg, 30, '2g: el estimado es el del tipo (30)');
    for (const fn of sb.__cola.splice(0)) fn();
    await esperarJob(db, job.id);
    eq(job.estado, 'lista', '2g: el trabajo cierra «lista»');
    eq(db._posts.get(807).image_path, '/media/limpia.jpg', '2g: se restaura la versión limpia verificada');
    eq(db._posts.get(807).prev_image_path, '/media/con-texto.jpg', '2g: la versión con texto queda como anterior recuperable');
    eq(db._posts.get(807).overlay_text, '', '2g: el overlay queda limpio');
    ok(db._mensajes.some(m => m.text.includes('saqué el texto')), '2g: el resultado aparece en el mismo chat');
    db._posts.set(808, fotoPost(808, { overlay_text: '' }));
    const r2 = api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(808), pedido: 'sacá el texto de la imagen', hilo: '' });
    eq(r2 && r2.impossible, 'sin_texto_puesto', '2g: sin texto puesto por el sistema → honesto sin_texto_puesto');
    db._posts.set(809, fotoPost(809, { overlay_text: 'Titular puesto', prev_image_path: '' }));
    const r3 = api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(809), pedido: 'sacá el texto de la imagen', hilo: '' });
    eq(r3 && r3.impossible, 'sin_version_limpia', '2g: sin versión limpia recuperable → honesto sin_version_limpia');
  }

  // ── 2h. Conserje dispara el tipo ─────────────────────────────────
  console.log('· 2h. Conserje (hilo post)');
  {
    digestActual = { texto_feed: { modo: 'con-texto', tamano: 'normal' } };
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(811, fotoPost(811));
    const r = api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(811), pedido: 'poné el caption adentro de la imagen', hilo: 'post' });
    ok(r && r.job, '2h: aprobar en el conserje crea el trabajo del tipo');
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    eq(job.cambio_tipo, 'texto_en_imagen', '2h: el trabajo del conserje nace con su tipo');
    const estado = db._mensajes.find(m => m.text.includes('[creando-imagen:'));
    ok(!!estado && estado.hilo === 'post' && Number(estado.post_id) === 811, '2h: el estado vive en el hilo del posteo');
    for (const fn of sb.__cola.splice(0)) fn();
    await esperarJob(db, job.id);
    eq(job.estado, 'lista', '2h: el trabajo del conserje también ejecuta');
  }

  // ── 3. Pines estáticos ───────────────────────────────────────────
  console.log('· 3. Pines de cableado');
  ok(dbSrc.includes('ALTER TABLE trabajos ADD COLUMN cambio_tipo'), 'db: columna cambio_tipo en trabajos');
  ok(serverSrc.includes('const PZ_CAMBIO_TIPOS = {'), 'el catálogo PZ_CAMBIO_TIPOS existe');
  ok(serverSrc.includes('cambio_tipo) VALUES (?,?,?,?,?,?,?,?,?)'), 'el INSERT del trabajo persiste cambio_tipo');
  ok(serverSrc.includes('defTipoRun.ejecutar'), 'el runner despacha por el catálogo');
  ok(serverSrc.includes("!pzChatPedidoDeCambio(lastText) && !pzCambioTipoEspecificoDe(lastText)"), 'la red suma el disparador por tipo específico');
  for (const k of ['cambio_solo_foto', 'sin_caption', 'ya_tiene_texto', 'sin_texto_puesto', 'sin_version_limpia']) ok(serverSrc.includes(k + ':'), `kind honesto presente: ${k}`);
  ok(serverSrc.includes('function pzTextoEnImagenParaPost') && serverSrc.includes('function verificarTextoEnImagen'), 'ejecutor + QA del tipo existen');
  ok(serverSrc.includes("const BUILD_ID = '20261105-v1086';"), 'BUILD del lote: v1086');
  eq(count(serverSrc, 'falta_pregunta'), count(baseServerSrc, 'falta_pregunta'), 'la compuerta falta_pregunta no se tocó');

  // ── 4. Control contra la base ────────────────────────────────────
  console.log('· 4. Control contra base (v1077: el pedido no ejecutaba)');
  if (hasBase) {
    eq(count(baseServerSrc, 'PZ_CAMBIO_TIPOS'), 0, 'control: la base NO tiene catálogo de tipos');
    eq(count(baseServerSrc, 'pzTextoEnImagenParaPost'), 0, 'control: la base NO tiene ejecutor de texto en imagen');
    eq(count(baseDbSrc, 'cambio_tipo'), 0, 'control: la base NO persiste cambio_tipo');
    ok(baseServerSrc.includes("const BUILD_ID = '20261105-v1085';"), 'control: la base es v1085');
  } else { ok(false, 'control: falta ../base'); }

  // ── 5. Boot smoke ────────────────────────────────────────────────
  console.log('· 5. Boot smoke');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tei-boot-'));
  const port = 35178;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' }, stdio: 'ignore' });
  try {
    let version = null;
    for (let i = 0; i < 40 && !version; i++) {
      await new Promise(r => setTimeout(r, 750));
      try { const r = await fetch(`http://127.0.0.1:${port}/api/version`); if (r.ok) version = await r.json(); } catch (e) {}
    }
    ok(!!version, 'boot: /api/version responde');
    ok(!!version && String(version.build || version.version || JSON.stringify(version)).includes('v1086'), 'boot: el build servido es v1086');
  } finally {
    try { process.kill(child.pid, 'SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(path.join(ROOT, 'data'), { recursive: true, force: true }); } catch (e) {}
  }

  try { fs.rmSync(MEDIA_TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\nTEXTO-EN-IMAGEN: ${pass} pass / ${fail} fail`);
  if (bad.length) { console.log('FALLARON:\n - ' + bad.join('\n - ')); process.exit(1); }
})().catch(e => { console.error('suite crash:', e); process.exit(2); });
