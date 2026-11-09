// test-lote-chat-foto.js — BUG CHAT CON FOTO (lote urgente, base v756).
// Reportado por Valentino 7/11 con captura: subió una foto al chat y pidió
// cambiar algo de la imagen. Tres cosas malas en el mismo hilo:
// (1) la descripción de visión apareció CRUDA en el chat («✦ veo Figura de
// robot azul en primer plano, fondo claro, texto visible: &#39;Posty lo está
// cuidando&#39;», con entidades sin decodificar = doble escape);
// (2) el gancho del borrador salió duplicado y cortado («¿cuántas veces te
// pasó que tenías…» y enseguida completo);
// (3) al aprobar, «no pude programarlo, probá de nuevo 🙏» (el cliente se
// tragaba el error real y el servidor dejaba el posteo programado).
// Fix: (1) la nota de visión es contexto interno: no viaja al cliente y la
// burbuja de propuesta ya no la compone; (2) la burbuja ya no muestra el
// titular separado (el caption ya abre con el gancho); (3) programar inserta
// borrador primero y pasa a 'scheduled' solo al final, con timeout largo en
// el cliente y el error real visible; un cambio pedido que falla NO deja
// nada programado. Además: (4) cambiar la imagen desde la propuesta
// (endpoint nuevo /api/album/:id/cambiar-imagen, la foto cambiada se muestra
// en el chat con [foto:] y se programa solo tras confirmar); (5) el conserje
// lee el hilo (botón «Ver el chat» en su detalle + fotos recientes en el
// journey) y los pedidos de cambio quedan logueados en chat_messages.
// Parte A: boot real de server.js en DATA_DIR temporal + HTTP (cookie de
// sesión) + conteo directo en posta.db. Parte B: funciones del cliente
// extraídas de public/app.js y corridas en vm con stubs (mismo patrón que
// test-lote-pregunta-duplicada.js). Parte C: chunk-conserje en vm.
// Uso: node test-lote-chat-foto.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Parte A: servidor real ----------
const PORT = 34563;
const TEST_KEY = 'boot-test-key-chat-foto';
const ADMIN_TOKEN = 'boot-test-token-foto';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-foto-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
// PNG 1x1 válido (la foto real del cliente) + archivo roto (corrupto).
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync(path.join(mediaDir, 'test-foto.png'), PNG_1X1);
fs.writeFileSync(path.join(mediaDir, 'test-foto-rota.png'), Buffer.from('esto no es una imagen', 'utf8'));

async function reqJson(method, p, body, cookie) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  const setCookie = r.headers.get('set-cookie');
  return { status: r.status, json: j, setCookie };
}
// Escritura directa en la DB del boot, con reintento si el servidor tiene
// el lock tomado en ese instante.
function seedDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try {
    for (let i = 0; i < 10; i++) {
      try { fn(db); return; }
      catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
    }
  } finally { try { db.close(); } catch (e) {} }
}
function postsByStatus(dbPath, uid) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare('SELECT id, status FROM posts WHERE user_id = ? ORDER BY id').all(uid);
    return rows;
  } finally { try { db.close(); } catch (e) {} }
}
function whenFuturo() {
  // 2 días adelante, 19:00 hora de Nueva York, formato 'YYYY-MM-DD HH:MM'.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')} 19:00`;
}

async function parteA() {
  console.log('— A) servidor: visión, cambio de imagen, programar y conserje —');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, ADMIN_TOKEN,
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    check('A0 el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await reqJson('GET', '/api/version');
    check('A0b /api/version trae el BUILD v824 (estampado por el re-estampador)', ver.status === 200 && ver.json && ver.json.build === '20261105-v831', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    check('A0c la DB del boot existe en el DATA_DIR temporal', fs.existsSync(dbPath));

    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'join', ig: 'chat-foto-test', device: 'test-device-foto' });
    check('A0d join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const uid = join.json.user_id;
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';

    // Semilla: una foto válida, una rota y un video, del usuario.
    let assetFoto = 0, assetRota = 0, assetVideo = 0;
    seedDb(dbPath, (db) => {
      assetFoto = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/test-foto.png', 'photo', '').lastInsertRowid);
      assetRota = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/test-foto-rota.png', 'photo', '').lastInsertRowid);
      assetVideo = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/test-foto.png', 'video', '').lastInsertRowid);
    });
    check('A0e semilla de assets ok', assetFoto > 0 && assetRota > 0 && assetVideo > 0, `foto=${assetFoto} rota=${assetRota} video=${assetVideo}`);

    // (1) La propuesta ya no devuelve visionNote ni siquiera en el error.
    const prop = await reqJson('POST', '/api/album/' + assetFoto + '/propuesta', { vision: 'robot azul' }, cookie);
    check('A1 propuesta sin IA responde sin-ia', prop.status === 400 && prop.json && prop.json.error === 'sin-ia', JSON.stringify(prop.json));
    check('A2 la respuesta de propuesta NO trae visionNote', !prop.json || !('visionNote' in prop.json), JSON.stringify(prop.json));
    const srcServer = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
    const retAlbum = srcServer.match(/return \{ headline, caption, hashtags, tag: asset\.album_tag[^}]*\};/);
    check('A3 albumPropuesta no devuelve visionNote en el código', !!retAlbum && !retAlbum[0].includes('visionNote'), retAlbum ? retAlbum[0] : 'sin match');

    // (4) Cambiar la imagen: sin IA disponible, el cambio falla limpio.
    const assetsAntes = (() => { const db = new DatabaseSync(dbPath, { readOnly: true }); try { return db.prepare('SELECT COUNT(*) AS c FROM assets WHERE user_id = ?').get(uid).c; } finally { db.close(); } })();
    const camb = await reqJson('POST', '/api/album/' + assetFoto + '/cambiar-imagen', { cambio: 'sacá el logo de la foto' }, cookie);
    check('A4 cambiar-imagen sin IA responde cambio_fallo', camb.status === 500 && camb.json && camb.json.error === 'cambio_fallo' && typeof camb.json.message === 'string' && camb.json.message.length > 0, JSON.stringify(camb.json));
    const assetsDespues = (() => { const db = new DatabaseSync(dbPath, { readOnly: true }); try { return db.prepare('SELECT COUNT(*) AS c FROM assets WHERE user_id = ?').get(uid).c; } finally { db.close(); } })();
    check('A5 cambio fallido NO crea asset nuevo', assetsDespues === assetsAntes, `antes=${assetsAntes} después=${assetsDespues}`);
    check('A6 cambio fallido NO deja posteos', postsByStatus(dbPath, uid).length === 0, JSON.stringify(postsByStatus(dbPath, uid)));
    const cambVacio = await reqJson('POST', '/api/album/' + assetFoto + '/cambiar-imagen', { cambio: '   ' }, cookie);
    check('A7 cambiar-imagen sin pedido responde cambio_vacio', cambVacio.status === 400 && cambVacio.json && cambVacio.json.error === 'cambio_vacio', JSON.stringify(cambVacio.json));
    const cambVideo = await reqJson('POST', '/api/album/' + assetVideo + '/cambiar-imagen', { cambio: 'sacá el logo' }, cookie);
    check('A8 cambiar-imagen en video se rechaza', cambVideo.status === 400 && cambVideo.json && cambVideo.json.error === 'cambio_fallo', JSON.stringify(cambVideo.json));
    const cambFalta = await reqJson('POST', '/api/album/999999/cambiar-imagen', { cambio: 'sacá el logo' }, cookie);
    check('A9 cambiar-imagen en foto ajena/inexistente es 404', cambFalta.status === 404, JSON.stringify(cambFalta.json));

    // (3+5) Programar: el cambio pedido que falla NO deja nada scheduled.
    const progOtra = await reqJson('POST', '/api/subir-foto/programar',
      { assetPath: '/media/test-foto.png', media: 'photo', answers: { when: whenFuturo(), intent: 'conozcan', text: 'sin-texto', change: 'otra-version', promo: 'sin-promo' }, displayText: 'programar otra versión' }, cookie);
    check('A10 programar otra-version sin IA responde cambio_fallo', progOtra.status === 200 && progOtra.json && progOtra.json.ok === false && progOtra.json.error === 'cambio_fallo', JSON.stringify(progOtra.json));
    check('A11 cambio_fallo dice qué falló y que nada quedó programado', progOtra.json && /otra versión/i.test(progOtra.json.message || '') && /no se programó nada/i.test(progOtra.json.message || ''), JSON.stringify(progOtra.json));
    const postsOtra = postsByStatus(dbPath, uid);
    check('A12 otra-version fallida deja el posteo en draft (no scheduled)', postsOtra.length === 1 && postsOtra[0].status === 'draft', JSON.stringify(postsOtra));

    // Control: sin cambio pedido, programa (la mejora best-effort falla sin IA
    // y no bloquea).
    const progOk = await reqJson('POST', '/api/subir-foto/programar',
      { assetPath: '/media/test-foto.png', media: 'photo', answers: { when: whenFuturo(), intent: 'conozcan', text: 'sin-texto', change: 'ninguno', promo: 'sin-promo' }, displayText: 'programar normal' }, cookie);
    check('A13 programar sin cambio pedido responde ok', progOk.status === 200 && progOk.json && progOk.json.ok === true, JSON.stringify(progOk.json));
    const postsOk = postsByStatus(dbPath, uid);
    check('A14 el control queda scheduled y el draft anterior sigue draft', postsOk.length === 2 && postsOk.filter((p) => p.status === 'scheduled').length === 1 && postsOk.filter((p) => p.status === 'draft').length === 1, JSON.stringify(postsOk));

    // Titular que falla (foto rota: el compositor no puede abrirla) tampoco programa.
    const progTit = await reqJson('POST', '/api/subir-foto/programar',
      { assetPath: '/media/test-foto-rota.png', media: 'photo', answers: { when: whenFuturo(), intent: 'conozcan', text: 'con-titular', change: 'ninguno', promo: 'sin-promo' }, displayText: 'programar con titular' }, cookie);
    check('A15 programar con-titular sobre foto rota responde cambio_fallo', progTit.status === 200 && progTit.json && progTit.json.ok === false && progTit.json.error === 'cambio_fallo', JSON.stringify(progTit.json));
    const postsTit = postsByStatus(dbPath, uid);
    check('A16 titular fallido NO suma scheduled (2 drafts + 1 scheduled)', postsTit.filter((p) => p.status === 'scheduled').length === 1 && postsTit.filter((p) => p.status === 'draft').length === 2, JSON.stringify(postsTit));

    // (5) El conserje lee el hilo: chat + fotos recientes en el journey.
    seedDb(dbPath, (db) => {
      const ins = db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)');
      ins.run(uid, 'user', '📷 Te mando una foto');
      ins.run(uid, 'user', 'Cambiame la foto: sacá el logo');
      ins.run(uid, 'assistant', 'Te muestro el posteo con la foto cambiada: [foto:/media/test-foto.png]');
    });
    const journey = await reqJson('GET', '/api/admin/support/' + uid + '/journey?token=' + ADMIN_TOKEN);
    check('A17 journey responde ok', journey.status === 200 && journey.json && journey.json.ok === true, JSON.stringify(journey.json).slice(0, 200));
    const jchat = (journey.json && journey.json.chat) || [];
    check('A18 el journey trae el hilo con el pedido de cambio', jchat.some((m) => m.role === 'user' && /Cambiame la foto: sacá el logo/.test(m.text || '')), JSON.stringify(jchat).slice(0, 500));
    const jfotos = (journey.json && journey.json.fotos_recientes) || [];
    check('A19 el journey trae las fotos recientes del cliente', jfotos.some((f) => f.file_path === '/media/test-foto.png'), JSON.stringify(jfotos).slice(0, 300));
  } catch (e) {
    console.log('error de la parte A:', e.message);
    fail++;
  } finally {
    kill();
    await sleep(500);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------- Parte B: cliente en vm ----------
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function reFrom(src, re) {
  const m = src.match(re);
  return m ? m[0] : null;
}
function extractClient() {
  const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
  const parts = [];
  const need = [
    [/const esc = \(s\) =>[^\n]+/, 'esc'],
    [/const CELEBRATE_MARKER_G = [^;]+;/, 'CELEBRATE_MARKER_G'],
    [/const FP_MARKER_RE = [^;]+;/, 'FP_MARKER_RE'],
    [/const LC_MARKER_RE = [^;]+;/, 'LC_MARKER_RE'],
    [/const FOTO_MARKER_RE = [^;]+;/, 'FOTO_MARKER_RE'],
    [/const CHAT_URL_RE = [^;]+;/, 'CHAT_URL_RE'],
    [/const CHAT_APP_LINK_RE = [^;]+;/, 'CHAT_APP_LINK_RE'],
  ];
  for (const [re, name] of need) {
    const s = reFrom(app, re);
    if (!s) return { error: 'falta ' + name };
    parts.push(s);
  }
  for (const sig of ['function chatStripCelebrate(', 'function linkifyEsc(', 'function chatMsgHtml(',
    'function pzSftT(', 'function pzSftEn(', 'async function pzSftChatArmarUno(', 'async function pzSftChatProponer() {',
    'function pzSftChatTarjetaArmada(', 'async function pzSftPedirCambio() {', 'async function pzSftCambiarImagen() {', 'async function pzSubirCompletar() {']) {
    const s = fnFrom(app, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  return { code: parts.join('\n') };
}

async function parteB() {
  console.log('— B) cliente: burbuja sin visión, sin duplicado, cambio de imagen, timeout —');
  const loaded = extractClient();
  check('B0 se extraen las funciones del cliente', !loaded.error, loaded.error || '');
  if (loaded.error) return;
  const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
  check('B0b pzSftChatProponer ya no compone «✦ veo»', !/✦ " \+ ve|\"✦ \" \+ ve/.test(appSrc), '');
  check('B0c pzSubirCompletar pide timeout 300000', /api\.post\('\/api\/subir-foto\/programar'[\s\S]{0,600}\{ timeout: 300000 \}/.test(appSrc), '');

  const HOOK_FULL = '¿Cuántas veces te pasó que tenías que estar pendiente de tus redes?';
  const HOOK_CORTADO = '¿Cuántas veces te pasó que tenías…';
  const VISION = "Figura de robot azul en primer plano, fondo claro, texto visible: 'Posty lo está cuidando'.";
  // (LOTE A · re-base v821) La propuesta ya no es texto: POST /armar devuelve
  // el borrador armado y la oferta llega como TARJETA (pzSftChatTarjetaArmada).
  const fakePropuesta = { ok: true, post_id: 123, scheduled_at: '2026-11-09T22:00:00.000Z', dia_label: 'mañana', hora: '19:00', semana_llena: false, caption: HOOK_FULL + '\nEl resto del caption del posteo.', headline: HOOK_CORTADO, hashtags: '#test', kind: 'photo', image_path: '/media/test-foto.png', thumb: '', hard: [], tag: '', issues: [], visionNote: VISION };

  // B1: la burbuja de propuesta con una respuesta vieja (con visionNote).
  {
    const captured = {};
    const ctx = {
      ME: { lang: 'es' }, console,
      PZ_SFT_CHAT_PENDIENTE: { items: [{ id: 7, assetId: 42, url: '/media/test-foto.png', vision: 'mi robot azul', tag: '', issues: [] }], idx: 0, token: 0, texto: 'mi robot azul', propuesta: null },
      PZ_SFT_ARMADOS: {}, // (LOTE CHAT-CLICKS · re-pin) la tarjeta nueva registra el armado por postId
      pzSftAsegurarAssetTmp: async () => true,
      pzSftChatDecir: (texto) => { captured.bubble = texto; },
      pzSftChatBotones: () => '',
      pzSftRecomendar: () => ({ choice: 'preguntar' }),
      pzSftChatMejorUso: () => ({ choice: 'preguntar', why: 'porque muestra tu producto' }),
      pzSftTagTexto: () => '',
      pzSftEtiqueta: (c) => c,
      document: { getElementById: (id) => (id === 'chatBox' ? { insertAdjacentHTML: (pos, html) => { captured.card = (captured.card || '') + String(html); } } : null) },
      api: { post: async () => fakePropuesta },
    };
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    // (LOTE A · re-base v821) La oferta ya no es una burbuja de texto: es la
    // TARJETA (foto + «sale el [día]» + caption + aprobar/cambiar). B1–B4
    // chequean la tarjeta, no la burbuja.
    const b = captured.card || '';
    // (LOTE CHAT-CLICKS · re-pin) El botón de aprobar se llama «Sale así» (ya no «Aprobar ✓»).
    check('B0d la oferta llega como TARJETA en el chat', b.includes('Tu posteo está armado') && b.includes('Sale así'), b.slice(0, 300));
    check('B1 la tarjeta no trae la visión cruda', !b.includes('✦ veo') && !b.includes('Figura de robot') && !b.includes('Posty lo está cuidando'), b.slice(0, 300));
    check('B2 la tarjeta no trae entidades sin decodificar', !b.includes('&#39;') && !b.includes('&amp;'), b.slice(0, 300));
    const countHook = b.split(HOOK_FULL).length - 1;
    check('B3 el gancho sale una sola vez, entero, en la tarjeta', countHook === 1, `veces=${countHook} — ${b.slice(0, 300)}`);
    check('B4 el titular cortado no sale duplicado', !b.includes(HOOK_CORTADO), b.slice(0, 300));
    check('B5 el titular sigue guardado para crear el borrador', ctx.PZ_SFT_CHAT_PENDIENTE.propuesta && ctx.PZ_SFT_CHAT_PENDIENTE.propuesta.headline === HOOK_CORTADO, JSON.stringify(ctx.PZ_SFT_CHAT_PENDIENTE.propuesta));
  }

  // B6: chatMsgHtml renderiza [foto:] como imagen y escapa una sola vez.
  {
    const ctx = { console, pzIc: () => '' };
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const htmlFoto = vm.runInContext(`chatMsgHtml('assistant', 'Te muestro el posteo con la foto cambiada: [foto:/media/cambiada.jpg]\\n¿Te gusta?')`, ctx);
    check('B6 [foto:] se renderiza como <img> y no queda el marcador', htmlFoto.includes('<img src="/media/cambiada.jpg"') && !htmlFoto.includes('[foto:'), htmlFoto.slice(0, 300));
    const htmlApos = vm.runInContext(`chatMsgHtml('assistant', "dijo 'hola'")`, ctx);
    check('B7 el apóstrofe se escapa UNA vez (&#39;, no &amp;#39;)', htmlApos.includes('&#39;') && !htmlApos.includes('&amp;#39;'), htmlApos.slice(0, 200));
  }

  // B8: Pedir cambio deja el pedido y la propuesta nueva en el hilo.
  {
    const logged = [], said = [];
    const ctx = {
      ME: { lang: 'es' }, console,
      PZ_SFT: { itemPropuesta: { assetId: 42, url: '/media/test-foto.png' }, variantes: [{ headline: 'h', caption: 'viejo', hashtags: '' }], varSel: 0, msg: '' },
      document: { getElementById: (id) => (id === 'pzSftCambio' ? { value: 'sacá el logo' } : null) },
      pzSftRender: () => {},
      chatSay: (t) => { said.push(t); },
      api: { post: async (url, body) => {
        if (String(url).includes('/chat/log')) { logged.push(body); return { ok: true }; }
        return { ok: true, headline: 'nuevo titular', caption: 'Nuevo caption con el cambio.', hashtags: '#x' };
      } },
    };
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftPedirCambio()', ctx);
    check('B8 el pedido de cambio queda logueado como mensaje del cliente', logged.some((b) => (b.messages || []).some((m) => m.role === 'user' && m.text === 'Quiero cambiar: sacá el logo')), JSON.stringify(logged));
    check('B9 la propuesta nueva se muestra en el chat sin visión', said.some((t) => t.includes('Nuevo caption con el cambio.')) && !said.some((t) => t.includes('✦ veo')), JSON.stringify(said));
  }

  // B10: Cambiar la imagen — éxito y fracaso.
  {
    const said = [], logged = [];
    const mkCtx = (postFn) => ({
      ME: { lang: 'es' }, console,
      PZ_SFT: { itemPropuesta: { assetId: 42, url: '/media/test-foto.png' }, variantes: [{ headline: 'h', caption: 'El caption vigente.', hashtags: '' }], varSel: 0, msg: '' },
      document: { getElementById: (id) => (id === 'pzSftCambio' ? { value: 'sacá el logo' } : null) },
      pzSftRender: () => {},
      chatSay: (t) => { said.push(t); },
      api: { post: async (url, body) => {
        if (String(url).includes('/chat/log')) { logged.push(body); return { ok: true }; }
        return postFn(url, body);
      } },
    });
    const ctxOk = mkCtx(async () => ({ ok: true, assetId: 99, url: '/media/cambiada.jpg' }));
    vm.createContext(ctxOk);
    vm.runInContext(loaded.code, ctxOk);
    await vm.runInContext('pzSftCambiarImagen()', ctxOk);
    check('B10 la foto cambiada pasa a ser la foto del posteo', ctxOk.PZ_SFT.itemPropuesta.url === '/media/cambiada.jpg' && ctxOk.PZ_SFT.itemPropuesta.assetId === 99, JSON.stringify(ctxOk.PZ_SFT.itemPropuesta));
    check('B11 el posteo cambiado se muestra en el chat con [foto:]', said.some((t) => t.includes('[foto:/media/cambiada.jpg]') && t.includes('El caption vigente.')), JSON.stringify(said));
    check('B12 el pedido de cambio de imagen queda en el hilo', logged.some((b) => (b.messages || []).some((m) => m.role === 'user' && m.text === 'Cambiame la foto: sacá el logo')), JSON.stringify(logged));
    const ctxFail = mkCtx(async () => ({ ok: false, message: 'No pude cambiar la foto (no tengo IA disponible ahora). Probá con otras palabras o subí otra foto 🙏' }));
    vm.createContext(ctxFail);
    vm.runInContext(loaded.code, ctxFail);
    await vm.runInContext('pzSftCambiarImagen()', ctxFail);
    check('B13 cambio imposible: la foto NO se cambia y se dice qué falta', ctxFail.PZ_SFT.itemPropuesta.url === '/media/test-foto.png' && /No pude cambiar la foto/.test(ctxFail.PZ_SFT.msg || ''), `url=${ctxFail.PZ_SFT.itemPropuesta.url} msg=${ctxFail.PZ_SFT.msg}`);
  }

  // B14: pzSubirCompletar — timeout largo y error real visible.
  {
    const inserted = [];
    let capturedOpts = null;
    const fakeBox = { insertAdjacentHTML: (pos, html) => { inserted.push(html); } };
    const ctx = {
      console,
      pzSubirFlujo: { photo: { file_path: '/media/test-foto.png', aiUrl: '' }, media: 'photo', ans: { when: '2026-11-08 19:00', intent: 'conozcan', text: 'sin-texto', change: 'ninguno', promo: 'sin-promo' }, prop: { lang: 'es' }, textoGuardado: '' },
      document: { querySelector: () => ({ innerHTML: '' }) },
      pzSubirResumen: () => 'Programar foto para el sábado',
      pzSubirCerrar: () => {},
      $: () => fakeBox,
      chatScroll: () => {},
      CHAT_PHOTOS: [],
      renderChatPhotos: () => {}, chatUpdateSendBtn: () => {}, render: () => {},
      api: { post: async (url, body, opts) => { capturedOpts = opts; const e = new Error('The operation timed out'); e.name = 'TimeoutError'; throw e; } },
    };
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSubirCompletar()', ctx);
    check('B14 programar se llama con timeout 300000', capturedOpts && capturedOpts.timeout === 300000, JSON.stringify(capturedOpts));
    const shown = inserted.join('\n');
    check('B15 ante timeout se dice que nada quedó programado', /no se programó nada/i.test(shown), shown.slice(0, 300));
  }
}

// ---------- Parte C: chunk conserje en vm ----------
function parteC() {
  console.log('— C) conserje: botón «Ver el chat» en el detalle —');
  const chunk = fs.readFileSync(path.join(DIR, 'public/chunk-conserje.js'), 'utf8');
  const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
  const escSrc = reFrom(app, /const esc = \(s\) =>[^\n]+/);
  const parts = [escSrc];
  for (const sig of ['function conserjeFotoHTML(', 'function conserjeEtapaDot(', 'function conserjeFichaHTML(', 'function conserjeEtiquetaCorta(', 'function conserjeConteo(', 'function conserjeDetalleHTML(']) {
    const s = fnFrom(chunk, sig);
    if (!s) { check('C0 se extraen las funciones del conserje', false, 'falta ' + sig); return; }
    parts.push(s);
  }
  const ctx = { console, pzIc: () => '', conserjeEstado: { notaGuardada: null } };
  vm.createContext(ctx);
  vm.runInContext(parts.join('\n'), ctx);
  const html = vm.runInContext(`conserjeDetalleHTML({ user_id: 12, business_name: 'Test', post: { id: 1, titulo: 'Posteo', cuando: 'Mañana · 17:00' }, ficha: {}, decision: null }, { fecha: '2026-11-08' })`, ctx);
  check('C1 el detalle del cliente tiene el botón «Ver el chat»', html.includes('data-cj="chat"') && html.includes('Ver el chat con Posty'), html.slice(0, 400));
  check('C2 el detalle tiene el contenedor donde se muestra el hilo', html.includes('id="cjChat"'), html.slice(0, 400));
}

(async () => {
  await parteA();
  await parteB();
  parteC();
  console.log(`\ntest-lote-chat-foto: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
