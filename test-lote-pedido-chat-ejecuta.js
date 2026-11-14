'use strict';
/*
 * LOTE PEDIDO-CHAT-SE-EJECUTA — suite propia.
 * Incidente 14/11 (posteo 653, pedidos 769/773): Valentino pidió por el
 * chat del posteo rehacer el VIDEO con los subtítulos perfectos; el
 * cerebro respondió una promesa («lo rehago y te aviso») y nunca se
 * ejecutó nada: sin bloque no hubo ejecutor, el rehacer frena el video
 * por diseño, la red de v1027 solo caza preguntas sueltas y el
 * «pendiente» del conserje para hilo='post' no tenía consumidor.
 *
 * Secciones:
 *  1. Detectores determinísticos (extraídos del server real): el caso
 *     del incidente dispara; negación y charla no.
 *  2. Plan de textos estricto (reel-engine REAL): sin solape por banda.
 *  3. El bloque entero extraído con stubs (db falsa, visión stubbeada
 *     por fetch, motor stub con ffmpeg real):
 *     a. Pedido de video CON receta → la red crea el trabajo, la prosa
 *        desaparece del hilo y el runner REEMPLAZA el video dejando
 *        versión anterior, sin tocar caption ni fecha.
 *     b. Pedido de video SIN receta → recibo honesto en el acto (la
 *        prosa se reemplaza) + registro en el conserje con el motivo.
 *     c. Consumidor del conserje: crear el trabajo con hilo='post'
 *        deja su estado en el hilo del posteo.
 *     d. Ruta texto: el runner aplica el caption nuevo.
 *  4. Pines estáticos de cableado (release).
 *  5. CONTROL contra base/: el defecto reproducido a nivel de carril
 *     (la base no tiene red, ni receta, ni plan estricto: la promesa
 *     salía y nada se ejecutaba).
 *  6. Boot smoke: /api/version = v1077.
 * La visión real NO se ejercita (sin claves de IA en sandbox): el
 * veredicto llega por el fetch inyectado, como en rehacer-anclado.
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
const genSrc = fs.readFileSync(path.join(ROOT, 'generator.js'), 'utf8');
const hasBase = fs.existsSync(path.join(BASE, 'server.js'));
const baseServerSrc = hasBase ? fs.readFileSync(path.join(BASE, 'server.js'), 'utf8') : '';
const baseGenSrc = hasBase ? fs.readFileSync(path.join(BASE, 'generator.js'), 'utf8') : '';
const baseReelSrc = hasBase ? fs.readFileSync(path.join(BASE, 'reel-engine.js'), 'utf8') : '';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, name) { if (cond) { pass++; } else { fail++; bad.push(name); console.log('  ✗ ' + name); } }
function eq(a, b, name) { ok(a === b, name + ` (esperado ${JSON.stringify(b)}, vino ${JSON.stringify(a)})`); }
const count = (s, sub) => String(s).split(sub).length - 1;

// ── 1. Detectores ────────────────────────────────────────────────────
console.log('· 1. Detectores de la red anti-promesa');
{
  const grab = (name) => {
    const m = serverSrc.match(new RegExp('function ' + name + '[\\s\\S]*?\\n\\}'));
    return m ? eval('(' + m[0].replace('function ' + name, 'function f') + ')') : null;
  };
  const cambio = grab('pzChatPedidoDeCambio');
  const sobreVideo = grab('pzChatPedidoSobreVideo');
  ok(!!cambio && !!sobreVideo, 'detectores extraíbles del server');
  const MSG771 = 'Si, por favor rehace el video con los subtítulos de manera perfecta y envíamelo.';
  const MSG769 = 'Los subtítulos del posteo que sale hoy están mal. Hay cosas, hay palabras arriba de las otras.';
  eq(cambio(MSG771), true, 'incidente 771: rehace el video → dispara');
  eq(cambio(MSG769), true, 'incidente 769: subtítulos están mal → dispara');
  eq(sobreVideo(MSG771), true, 'incidente 771: es sobre el video');
  eq(cambio('no lo cambies, dejalo como está'), false, 'negación explícita no dispara');
  eq(cambio('hola! ¿cómo viene la semana?'), false, 'charla sin pedido no dispara');
  eq(cambio('gracias, quedó bárbaro el posteo'), false, 'agradecimiento no dispara');
  eq(cambio('cambiá el caption por uno más corto'), true, 'cambio de caption dispara');
  eq(cambio('sacá el logo de la foto'), true, 'cambio sobre la foto dispara');
  eq(sobreVideo('cambiá el caption del video por uno más corto'), false, 'caption de un video no es pedido sobre el video');
}

// ── 2. Plan estricto (motor real) ────────────────────────────────────
console.log('· 2. Plan de textos estricto sin solape');
{
  const eng = require(path.join(ROOT, 'reel-engine.js'));
  ok(typeof eng.secuenciaEstricta === 'function' && typeof eng.planEstrictoParaClip === 'function' && typeof eng.chunkWords === 'function', 'el motor exporta el plan estricto');
  const seq = eng.secuenciaEstricta([
    { text: 'uno dos', start: 0, end: 1.2 },
    { text: 'tres cuatro', start: 0.6, end: 1.8 },
    { text: 'cinco seis', start: 1.0, end: 2.4 },
  ]);
  let sinSolape = true;
  for (let i = 1; i < seq.length; i++) if (seq[i].start < seq[i - 1].end) sinSolape = false;
  ok(sinSolape, 'secuenciaEstricta: ningún chunk arranca antes de que termine el anterior');
  const plan = eng.planEstrictoParaClip({ hook: 'Probá nuestras medialunas recién horneadas hoy', cta: 'Escribinos y te contamos más', total: 10, hookEnd: 4, closeStart: 6 });
  ok(Array.isArray(plan) && plan.length >= 3, 'planEstrictoParaClip arma chunks de gancho y cierre');
  const porBanda = {};
  for (const c of plan) { (porBanda[c.band] = porBanda[c.band] || []).push(c); ok(c.end <= 10.0001 && c.start >= 0, 'chunk dentro del clip'); }
  for (const b of Object.keys(porBanda)) {
    const l = porBanda[b].slice().sort((x, y) => x.start - y.start);
    for (let i = 1; i < l.length; i++) ok(l[i].start >= l[i - 1].end, `banda ${b}: sin solape entre chunks`);
  }
  const ch = eng.chunkWords('una dos tres cuatro cinco');
  ok(ch.every(c => { const n = c.split(' ').length; return n >= 2 && n <= 4; }), 'chunkWords: 2–4 palabras, sin huérfano de 1');
}

// ── 3. Bloque extraído con stubs ─────────────────────────────────────
console.log('· 3. Red + ejecutor + runner (bloque real, stubs)');
const MEDIA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pce-media-'));
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
            const conError = s.includes("0,'',?"); // variante imposibilidad: estimado/hilo literales, error = a[6]
            const row = { id: ++tid, user_id: a[0], tipo: a[1], estado: a[2], post_id: a[3], titulo: a[4], caption: a[5], estimado_seg: conError ? 0 : a[6], hilo: conError ? '' : a[7], error: conError ? a[6] : '', mensaje_id: null, mensaje_final_id: null, created_at: '2026-11-14 12:00:00', updated_at: 'T0' };
            trabajos.push(row); return { lastInsertRowid: row.id, changes: 1 };
          }
          if (s.startsWith('INSERT INTO chat_messages')) {
            const m = { id: ++mid, user_id: a[0], role: a[1], text: a[2], hilo: a.length > 3 ? a[3] : '', post_id: a.length > 4 ? a[4] : null };
            mensajes.push(m); return { lastInsertRowid: m.id, changes: 1 };
          }
          if (s.startsWith('INSERT INTO post_versions')) { versiones.push({ post_id: a[0], caption: a[1], hashtags: a[2], image_path: a[3] }); return { lastInsertRowid: versiones.length, changes: 1 }; }
          if (s.startsWith('UPDATE trabajos SET mensaje_id')) { const t = trabajos.find(x => x.id === Number(a[1])); if (t) t.mensaje_id = a[0]; return { changes: t ? 1 : 0 }; }
          if (s.startsWith('UPDATE trabajos SET mensaje_final_id')) { const t = trabajos.find(x => x.id === Number(a[1])); if (t) t.mensaje_final_id = a[0]; return { changes: t ? 1 : 0 }; }
          if (s.includes("SET estado='fallo'")) { const t = trabajos.find(x => x.id === Number(a[1])); if (t && t.estado === 'creando') { t.estado = 'fallo'; t.error = a[0]; return { changes: 1 }; } return { changes: 0 }; }
          if (s.includes("SET estado='lista'")) { const t = trabajos.find(x => x.id === Number(a[0])); if (t && t.estado === 'creando' && t.updated_at === a[1]) { t.estado = 'lista'; return { changes: 1 }; } return { changes: 0 }; }
          if (s.startsWith('UPDATE posts SET caption')) { const p = posts.get(Number(a[2])); if (p) { p.caption = a[0]; p.hashtags = a[1]; } return { changes: p ? 1 : 0 }; }
          if (s.startsWith('UPDATE posts SET image_path')) { const p = posts.get(Number(a[a.length - 1])); if (p) { p.image_path = a[0]; p.prev_image_path = a[1]; if (s.includes('cover_path')) p.cover_path = a[2]; } return { changes: p ? 1 : 0 }; }
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

async function bloqueConStubs(db) {
  const ini = serverSrc.indexOf('// ── PEDIDO-CHAT-SE-EJECUTA');
  const fin = serverSrc.indexOf('// Red anti-silencio: corre DESPUÉS');
  ok(ini > 0 && fin > ini, 'bloque del lote localizable en server.js');
  const code = serverSrc.slice(ini, fin) + '\n;globalThis.__api = { pzChatPedidoDeCambio, pzChatPedidoSobreVideo, pzChatCambioRuta, pzRecetaDePost, pzRegenVideoParaPost, pzChatCambioCrearTrabajo, pzTrabajoChatCambioRun, pzChatCambioSiFalta, pzTrabajoCambioFalloAmable };';
  const realEng = require(path.join(ROOT, 'reel-engine.js'));
  const stubEngine = {
    async buildSingleClipReel(opts) {
      const out = path.join(MEDIA_TMP, 'reel-single-redo.mp4');
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x2793C8:s=360x640:d=3', '-pix_fmt', 'yuv420p', '-y', out]);
      return { url: '/media/reel-single-redo.mp4', file: out, coverPath: null, textPlan: realEng.planEstrictoParaClip({ hook: opts.hook, cta: opts.cta, total: 3, hookEnd: 1.5, closeStart: 2 }) };
    },
  };
  const cola = [];
  const decisiones = [];
  const sandbox = {
    console, JSON, Math, Date, Buffer, setTimeout, clearTimeout, AbortSignal,
    setImmediate: (fn) => { cola.push(fn); },
    fs, path, db, MEDIA_DIR: MEDIA_TMP,
    openaiKeyFor: () => 'sk-test',
    costs: { trackUsage() {} },
    langOfUser: () => 'es',
    redoLeftOf: () => null,
    consumeRedo: () => true,
    pzTrabajoPublico: (row) => row ? { id: row.id, estado: row.estado, tipo: row.tipo, post_id: row.post_id } : null,
    characterBlocksDelivery: () => false,
    contentInputFor: () => ({}),
    generateContent: async () => ({ caption: 'Caption nuevo generado', hashtags: '#nuevo' }),
    push: { sendPush: async () => {} },
    chatQuotedPostMatch: () => null,
    supportCases: { decideVoiceRequest: (d, o) => { decisiones.push(o); return { ok: true }; } },
    require: (m) => (m === './reel-engine' ? stubEngine : require(m)),
    fetch: async () => ({ json: async () => ({ choices: [{ message: { content: '{"sin_solape": true, "motivo": "ok"}' } }] }) }),
    __decisiones: decisiones, __cola: cola,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

(async () => {
  // Fuente real del reel (el «footage» de la receta).
  const srcClip = path.join(MEDIA_TMP, 'fuente-cliente.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0xFEC14D:s=360x640:d=3', '-pix_fmt', 'yuv420p', '-y', srcClip]);

  // 3a. CON receta: la red crea el trabajo, la prosa muere, el runner reemplaza.
  {
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    const receta = JSON.stringify({ v: 1, kind: 'single-clip', file: srcClip, asset_id: null, hook: 'Medialunas recién horneadas', cta: 'Escribinos y te contamos más', handle: '@posty.communitymanager', brandHex: '#2793C8', mood: 'upbeat', musicSeed: '12:2026-11-09', source: 'subir', created_at: '2026-11-14T00:00:00.000Z' });
    db._posts.set(653, { id: 653, user_id: 12, media_type: 'video', status: 'scheduled', scheduled_at: '2026-11-15 00:00:00', caption: 'Caption original del 653', hashtags: '#pasteleria', image_path: '/media/reel-single-viejo.mp4', prev_image_path: '', cover_path: '/media/cover-vieja.jpg', reel_receta: receta });
    const PROMESA = '¡Perfecto! Rehago el video con los subtítulos perfectos y te aviso apenas esté listo 🙌';
    const insP = db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(12, 'assistant', PROMESA);
    const promesaId = Number(insP.lastInsertRowid);
    const out = { reply: PROMESA, options: null };
    const r = api.pzChatCambioSiFalta({ uid: 12, clean: [{ role: 'user', text: 'Si, por favor rehace el video con los subtítulos de manera perfecta y envíamelo.' }], out, anchorId: 653, anyWork: false, savedReplyId: promesaId, proseSnap: PROMESA });
    ok(r && r.trabajo && r.postId === 653, '3a: la red crea el trabajo de cambio (la promesa no sale)');
    eq(out.reply, '', '3a: la respuesta en vivo ya no es la promesa');
    ok(!db._mensajes.some(m => m.id === promesaId), '3a: la fila de la promesa se borró del hilo');
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    ok(!!job && job.estado === 'creando', '3a: el trabajo nace «creando»');
    ok(db._mensajes.some(m => m.text.includes(`[creando-imagen:${job.id}]`) && m.text.includes('Haciendo tu cambio')), '3a: el estado visible vive en el mismo hilo');
    // El runner corre (lo que setImmediate había encolado) y se espera
    // a que salde: el render + la verificación llevan su tiempo real.
    for (const fn of sb.__cola.splice(0)) fn();
    for (let i = 0; i < 150 && job.estado === 'creando'; i++) await new Promise(r => setTimeout(r, 200));
    const post = db._posts.get(653);
    eq(post.image_path, '/media/reel-single-redo.mp4', '3a: el runner REEMPLAZA el video del posteo');
    eq(post.prev_image_path, '/media/reel-single-viejo.mp4', '3a: la versión anterior queda guardada (prev_image_path)');
    eq(post.caption, 'Caption original del 653', '3a: el caption NO se tocó');
    eq(post.scheduled_at, '2026-11-15 00:00:00', '3a: el día/hora NO se tocó');
    eq(db._versiones.length, 1, '3a: post_versions guardó la versión anterior');
    eq(job.estado, 'lista', '3a: el trabajo cierra «lista»');
    ok(db._mensajes.some(m => m.text.includes('[video-listo:653:/media/reel-single-redo.mp4]')), '3a: el resultado aparece en el mismo chat con el marcador de video');
  }

  // 3b. SIN receta: recibo honesto en el acto + registro en el conserje.
  {
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(700, { id: 700, user_id: 12, media_type: 'video', status: 'scheduled', scheduled_at: '2026-11-16 00:00:00', caption: 'Video viejo sin receta', hashtags: '', image_path: '/media/viejo.mp4', prev_image_path: '', cover_path: '', reel_receta: '' });
    const PROMESA = 'Dale, rehago el video y te lo dejo listo acá.';
    const insP = db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(12, 'assistant', PROMESA);
    const promesaId = Number(insP.lastInsertRowid);
    const out = { reply: PROMESA, options: null };
    const r = api.pzChatCambioSiFalta({ uid: 12, clean: [{ role: 'user', text: 'rehacé el video, los subtítulos están mal' }], out, anchorId: 700, anyWork: false, savedReplyId: promesaId, proseSnap: PROMESA });
    ok(r && r.imposible === 'sin_receta', '3b: sin receta la red declara la imposibilidad');
    const fila = db._mensajes.find(m => m.id === promesaId);
    ok(!!fila && fila.text.includes('[trabajo-fallo:') && fila.text.includes('receta'), '3b: la prosa guardada se REEMPLAZA por el recibo honesto');
    eq(out.reply, fila.text, '3b: la respuesta en vivo es el mismo recibo honesto');
    const job = db._trabajos.find(t => t.tipo === 'chat_cambio');
    ok(!!job && job.estado === 'fallo' && job.error === 'sin_receta', '3b: el trabajo queda registrado como fallo con el motivo');
    const copia = db._mensajes.find(m => m.hilo === 'post' && Number(m.post_id) === 700 && m.role === 'user');
    ok(!!copia, '3b: el pedido queda registrado en el hilo del posteo (conserje)');
    ok(sb.__decisiones.some(d => d.decision === 'descartado' && Number(d.messageId) === (copia && copia.id)), '3b: el registro nace decidido con el motivo (visible en pedidos-voz)');
    eq(db._posts.get(700).image_path, '/media/viejo.mp4', '3b: el video vigente no se tocó');
  }

  // 3c. Consumidor del conserje: el trabajo nace con hilo='post'.
  {
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    const receta = JSON.stringify({ v: 1, kind: 'single-clip', file: srcClip, asset_id: null, hook: 'H', cta: 'C', handle: '', brandHex: '#2793C8', mood: 'upbeat', musicSeed: '12:x', source: 'subir', created_at: '2026-11-14T00:00:00.000Z' });
    db._posts.set(701, { id: 701, user_id: 12, media_type: 'video', status: 'draft', caption: 'Otro video', hashtags: '', image_path: '/media/otro.mp4', prev_image_path: '', cover_path: '', reel_receta: receta });
    const r = api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(701), pedido: 'rehacé el video, los subtítulos se pisan', hilo: 'post' });
    ok(r && r.job, '3c: aprobar en el conserje crea el trabajo (consumidor)');
    const estado = db._mensajes.find(m => m.text.includes('[creando-imagen:'));
    ok(!!estado && estado.hilo === 'post' && Number(estado.post_id) === 701, '3c: el estado vive en el hilo del posteo');
  }

  // 3d. Ruta texto: caption nuevo sin tocar el medio.
  {
    const db = makeFakeDb();
    const sb = await bloqueConStubs(db);
    const api = sb.__api;
    db._posts.set(702, { id: 702, user_id: 12, media_type: 'video', status: 'draft', caption: 'Caption viejo', hashtags: '#viejo', image_path: '/media/v.mp4', prev_image_path: '', cover_path: '', reel_receta: '' });
    const r = api.pzChatCambioCrearTrabajo({ uid: 12, post: db._posts.get(702), pedido: 'cambiá el caption por uno más corto', hilo: '' });
    ok(r && r.job, '3d: el cambio de texto crea su trabajo');
    for (const fn of sb.__cola.splice(0)) fn();
    const jobD = db._trabajos.find(t => t.tipo === 'chat_cambio');
    for (let i = 0; i < 100 && jobD && jobD.estado === 'creando'; i++) await new Promise(r => setTimeout(r, 200));
    eq(db._posts.get(702).caption, 'Caption nuevo generado', '3d: el runner aplica el caption nuevo');
    eq(db._posts.get(702).image_path, '/media/v.mp4', '3d: el medio no se tocó');
  }

  // ── 4. Pines estáticos ─────────────────────────────────────────────
  console.log('· 4. Pines de cableado');
  ok(dbSrc.includes('ALTER TABLE posts ADD COLUMN reel_receta'), 'db: columna reel_receta en posts');
  ok(dbSrc.includes('ALTER TABLE trabajos ADD COLUMN hilo'), 'db: columna hilo en trabajos');
  ok(serverSrc.includes('reel_receta') && serverSrc.includes('const receta = JSON.stringify('), 'pieza 1: la receta se persiste al crear el reel');
  ok(count(serverSrc, 'strictSubtitles: true') >= 1, 'pieza 2: el ejecutor rinde con el plan estricto');
  ok(serverSrc.includes('function pzRegenVideoParaPost'), 'pieza 2: ejecutor pzRegenVideoParaPost existe');
  ok(serverSrc.includes('function pzChatCambioSiFalta'), 'pieza 3: la red anti-promesa existe');
  ok(serverSrc.indexOf('trabajoCambioNet = pzChatCambioSiFalta({') > serverSrc.indexOf('trabajoImagen = pzChatImagenSiFalta({'), 'pieza 3: la red corre DESPUÉS de la red de imagen');
  ok(serverSrc.includes('trabajoImagen || trabajoCambio'), 'pieza 3: el res.json entrega el trabajo de cambio');
  ok(serverSrc.includes('VERDAD DEL MEDIO') || genSrc.includes('VERDAD DEL MEDIO'), 'pieza 4: la verdad del medio está en el prompt del redo');
  {
    const seg = serverSrc.slice(serverSrc.indexOf("app.post('/api/admin/support/conserje/pedidos-voz/decidir'"), serverSrc.indexOf("app.post('/api/admin/support/conserje/pedidos-voz/decidir'") + 2600);
    ok(seg.includes('pzChatCambioCrearTrabajo') && seg.includes("b.decision === 'aprobado'"), 'pieza 5: aprobar en el conserje dispara el ejecutor');
  }
  ok(serverSrc.includes("const BUILD_ID = '20261105-v1077';"), 'BUILD del lote: v1077');
  eq(count(serverSrc, 'falta_pregunta'), count(baseServerSrc, 'falta_pregunta'), 'la compuerta falta_pregunta no se tocó');

  // ── 5. Control contra la base ──────────────────────────────────────
  console.log('· 5. Control contra base (el defecto)');
  if (hasBase) {
    eq(count(baseServerSrc, 'pzChatCambioSiFalta'), 0, 'control: la base NO tiene red anti-promesa (la promesa salía)');
    eq(count(baseServerSrc, 'chat_cambio'), 0, 'control: la base NO tiene trabajos de cambio');
    eq(count(baseServerSrc, 'reel_receta'), 0, 'control: la base NO guarda la receta del reel');
    eq(count(baseReelSrc, 'secuenciaEstricta'), 0, 'control: la base NO tiene plan estricto (el solape vivía)');
    ok(!baseGenSrc.includes('VERDAD DEL MEDIO'), 'control: el prompt de la base no declara la verdad del medio');
    ok(baseServerSrc.includes("const BUILD_ID = '20261105-v1076';"), 'control: la base es v1076');
  } else { ok(false, 'control: falta ../base'); }

  // ── 6. Boot smoke ──────────────────────────────────────────────────
  console.log('· 6. Boot smoke');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pce-boot-'));
  const port = 35177;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' }, stdio: 'ignore' });
  try {
    let version = null;
    for (let i = 0; i < 40 && !version; i++) {
      await new Promise(r => setTimeout(r, 750));
      try { const r = await fetch(`http://127.0.0.1:${port}/api/version`); if (r.ok) version = await r.json(); } catch (e) {}
    }
    ok(!!version, 'boot: /api/version responde');
    ok(!!version && String(version.build || version.version || JSON.stringify(version)).includes('v1077'), 'boot: el build servido es v1077');
  } finally {
    try { process.kill(child.pid, 'SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(path.join(ROOT, 'data'), { recursive: true, force: true }); } catch (e) {}
  }

  try { fs.rmSync(MEDIA_TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\nPEDIDO-CHAT-SE-EJECUTA: ${pass} pass / ${fail} fail`);
  if (bad.length) { console.log('FALLARON:\n - ' + bad.join('\n - ')); process.exit(1); }
})().catch(e => { console.error('suite crash:', e); process.exit(2); });
