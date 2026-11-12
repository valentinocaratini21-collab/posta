'use strict';
/* test-lote-posteo-hoy-en-chat.js — LOTE POSTEO-HOY-EN-CHAT (reservado v911, RE-BASE v970 sobre base v969)
 * El posteo de hoy vive en el chat: con el revelado de las 9:00 aparece como
 * mensaje con su foto y Posty pregunta «decime si querés cambiar algo»; la
 * respuesta del cliente se aplica directo a ESE posteo (cambiar foto, otra
 * imagen, cambiar titular/caption, reportar algo mal).
 *  · (A) estática/slice: pzChatHoyPrimero, pzHoyEsMensaje, marcadores, M78.
 *  · (B) boot in-process con fetch stubbeado (patrón test-feed6a-server.js):
 *    GET antes de las 9:00 (sin mensaje ni today_post) vs después (mensaje
 *    con [foto:] + pregunta, una sola vez por día, variante EN, sin mensaje
 *    si no hay posteo hoy / si está publicado / si está rechazado / si
 *    publishing_stopped); POST con stub de modelo: los 4 tipos aplicados a
 *    ESE posteo con DB verificada; ancla explícita a otro posteo gana;
 *    /api/ritual/hoy sigue 200; salida sin respuesta intacta; aviso 30 min
 *    y morning-post-push.js intactos por md5.
 * Uso: node test-lote-posteo-hoy-en-chat.js   (sale 0 si todo pasa)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const TREE = path.resolve(__dirname, 'release');
const BASE = path.resolve(__dirname, 'base-v969');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-hoy970-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '34960';
process.env.BASE_URL = 'http://127.0.0.1:34960';
process.env.OPENAI_API_KEY = 'dummy-test-key';
delete process.env.GEMINI_API_KEY;
process.env.SUPERVISION_OFF = '1';
process.env.TRIAL_TEST_KEY = '';
// Los bare modules (express, etc.) viven en ~/workspace/posta/node_modules.
process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';
require('module').Module._initPaths();
const MEDIA_DIR = path.join(TMP, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- PNG sólido mínimo (mismo helper que test-feed6a-server.js) ---
function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function solidPng(w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3); raw[off] = 0;
    for (let x = 0; x < w; x++) { raw[off + 1 + x * 3] = rgb[0]; raw[off + 2 + x * 3] = rgb[1]; raw[off + 3 + x * 3] = rgb[2]; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}

// --- Stub del modelo: responde según el ÚLTIMO mensaje del usuario ---
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.includes('api.openai.com')) return realFetch(url, opts);
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...msgs].reverse().find(m => m && m.role === 'user');
  const t = String((lastUser && lastUser.content) || '');
  const chat = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), text: async () => content });
  if (/cambi[aá]\s+la\s+foto/i.test(t)) return chat('listo, la cambié por la que me mandaste 👍\n```edit\n{"draft": 1, "photo_index": 0}\n```');
  if (/otra\s+imagen/i.test(t)) return chat('dale, pongo la otra 👍\n```edit\n{"draft": 1, "photo_index": 1}\n```');
  if (/cambi[aá]\s+el\s+t[ií]tulo/i.test(t)) return chat('listo, quedó con el nuevo título 👍\n```edit\n{"draft": 1, "caption": "Tesora que todos piden\\nTostado esta semana, de origen único. #philz"}\n```');
  if (/cambi[aá]\s+el\s+caption/i.test(t)) return chat('tenés razón, lo corrijo 👍\n```edit\n{"draft": 1, "caption": "Nuevo blend de la casa ☕\\nTostado esta semana, de origen único. $18. #philz"}\n```');
  if (/no\s+s[eé],\s+algo\s+no\s+me\s+cierra/i.test(t)) return chat('decime qué es lo que no te cierra y lo arreglamos: ¿la foto, el texto o el precio?');
  return chat('dale 😄 ¿me contás un poco más y lo armamos?');
};

// --- Zona horaria (Intl, sin depender del server) ---
function localParts(tz, d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (k) => p.find(x => x.type === k).value;
  return { ymd: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')), min: Number(g('minute')) };
}
function tzOffsetMs(tz, d) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (k) => Number(p.find(x => x.type === k).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - d.getTime();
}
function zonedWallToUtc(tz, ymd, hh, mm) {
  const [y, mo, da] = ymd.split('-').map(Number);
  let guess = Date.UTC(y, mo - 1, da, hh, mm) - tzOffsetMs(tz, new Date(Date.UTC(y, mo - 1, da, hh, mm)));
  guess = Date.UTC(y, mo - 1, da, hh, mm) - tzOffsetMs(tz, new Date(guess));
  return new Date(guess).toISOString();
}
function pickTz(wantAfter9) {
  const cands = ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/Madrid', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
  for (const tz of cands) {
    const h = localParts(tz, new Date()).hour;
    if (wantAfter9 ? h >= 9 : h < 9) return tz;
  }
  throw new Error('sin zona horaria para el caso ' + (wantAfter9 ? 'después' : 'antes') + ' de las 9:00');
}

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 240) : ''); }
};
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callAs(cookie, method, p, body) {
  const r = await realFetch('http://127.0.0.1:34960' + p, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j, cookie: sc ? sc.split(';')[0] : cookie };
}

(async () => {
  // ---------- (A) Estática / slice ----------
  const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf-8');
  const appjs = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf-8');
  const slice = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
  const sliceIncl = (src, from, to) => { const a = src.indexOf(from); return src.slice(a, src.indexOf(to, a) + to.length); };
  const hoySrc = sliceIncl(srv, 'function pzHoyPost(', '\n}\n') + sliceIncl(srv, 'function pzChatHoyPrimero(', '\n}\n');
  const hoyFn = new Function(hoySrc + '\nreturn { pzHoyPost, pzChatHoyPrimero };')();
  // pzHoyEsMensaje / pzHoyPregunta viven antes de pzHoyPost: evaluarlas aparte.
  const msgSrc = slice(srv, 'function pzHoyEsMensaje(', 'function pzHoyPost(');
  const pregSrc = slice(srv, 'function pzHoyPregunta(', 'function pzHoyEsMensaje(');
  const msgFn = new Function("const PZ_HOY_PREGUNTA_ES = 'decime si querés cambiar algo';\nconst PZ_HOY_PREGUNTA_EN = 'tell me if you want to change anything';\n" + pregSrc + msgSrc + '\nreturn { pzHoyEsMensaje, pzHoyPregunta };')();
  ok('slice: pzHoyEsMensaje detecta ES y EN', msgFn.pzHoyEsMensaje('decime si querés cambiar algo [foto:/media/x.jpg]') && msgFn.pzHoyEsMensaje('tell me if you want to change anything [foto:/media/x.jpg]') && !msgFn.pzHoyEsMensaje('hola, ¿cómo andás?'));
  ok('slice: pzHoyPregunta ES/EN', msgFn.pzHoyPregunta(false) === 'decime si querés cambiar algo' && msgFn.pzHoyPregunta(true) === 'tell me if you want to change anything');
  const drafts = [{ id: 11 }, { id: 22 }, { id: 33 }];
  const mov = hoyFn.pzChatHoyPrimero(drafts, 33);
  ok('slice: pzChatHoyPrimero mueve el de hoy a #1', mov[0].id === 33 && mov[1].id === 11 && mov[2].id === 22 && drafts[0].id === 11);
  ok('slice: pzChatHoyPrimero ya #1 queda igual', hoyFn.pzChatHoyPrimero(drafts, 11)[0].id === 11);
  ok('slice: pzChatHoyPrimero id ausente no toca nada', JSON.stringify(hoyFn.pzChatHoyPrimero(drafts, 99).map(d => d.id)) === '[11,22,33]');
  ok('slice: pzChatHoyPrimero lista vacía', hoyFn.pzChatHoyPrimero([], 33).length === 0);
  ok('marcadores server.js', srv.includes('PZ_HOY_PREGUNTA_ES') && srv.includes('pzHoyPost(db, uid') && srv.includes('today_post: todayPost') && (srv.match(/pzChatHoyPrimero/g) || []).length >= 2);
  ok('marcadores app.js', appjs.includes('PZ_HOY_ANCLA_SET') && appjs.includes('r.today_post') && appjs.includes('hfSetAnchor(r.today_post)'));
  ok('M78: hfSetAnchor existe definida en app.js (1/1)', (appjs.match(/function hfSetAnchor\(/g) || []).length === 1);
  // (RE-BASE v970 · FUSIÓN) El mensaje sembrado se rinde por el camino
  // vigente: chatLoadHistory pinta con pzChatMsgFull → chatMsgHtml de 8
  // parámetros, que resuelve el marcador [foto:] con FOTO_MARKER_RE.
  ok('fusión: chatMsgHtml vigente de 8 parámetros', appjs.includes('function chatMsgHtml(role, text, ts, id, reply, cap, photos, post)'));
  ok('fusión: pzChatMsgFull definido (1/1) y usado en la carga', (appjs.match(/function pzChatMsgFull\(/g) || []).length === 1 && appjs.includes('CHAT.map(m => pzChatMsgFull(m))'));
  ok('fusión: el marcador [foto:] se resuelve en chatMsgHtml', appjs.includes('FOTO_MARKER_RE.test('));
  // (RE-BASE v970 · FUSIÓN) El INSERT del mensaje de hoy usa el patrón
  // vigente de mensajes assistant del mismo handler (INSERT plano
  // user_id/role/text + lastInsertRowid, igual que la pregunta por el @ de
  // la bienvenida): chatInsertUser es solo del usuario (role 'user').
  ok('fusión: INSERT assistant por el camino vigente del handler', (srv.match(/INSERT INTO chat_messages \(user_id, role, text\) VALUES \(\?, 'assistant', \?\)/g) || []).length >= 2 && srv.includes('midHoy = rr.lastInsertRowid'));
  ok('fusión: helpers del server que el lote llama existen', ['function tzToday(', 'function zonedWallToUtc(', 'function ymdInTz(', 'function userTz(', 'function langOfUser(', 'function chatQuotedPostMatch('].every(f => srv.includes(f)));
  ok('fusión: pickTodayPost vigente en morning-post-push.js', fs.readFileSync(path.join(TREE, 'morning-post-push.js'), 'utf-8').includes('function pickTodayPost(posts, tz, now)'));
  ok('BUILD v970 estampado', srv.includes("const BUILD_ID = '20261105-v970';"));
  ok('app.js?v=672 en index ES', fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf-8').includes('<script src="/app.js?v=672"></script>'));
  ok('styles.css NO se toca: md5 igual a la base', md5(path.join(TREE, 'public', 'styles.css')) === md5(path.join(BASE, 'public', 'styles.css')));
  ok('styles?v=20261270 intacto en ambos index', fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf-8').includes('styles.css?v=20261270') && fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf-8').includes('styles.css?v=20261270') && !fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf-8').includes('app.js?v='));
  ok('morning-post-push.js intacto por md5', md5(path.join(TREE, 'morning-post-push.js')) === md5(path.join(BASE, 'morning-post-push.js')));
  ok('aviso 30 min intacto en server.js', srv.includes('te aviso 30 min antes'));

  // ---------- (B) Boot in-process ----------
  const dbmod = require(path.join(TREE, 'db'));
  const db = dbmod.db || dbmod;
  require(path.join(TREE, 'server'));
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:34960/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  const ver = await callAs('', 'GET', '/api/version');
  ok('boot: /api/version v970', ver.json && ver.json.build === '20261105-v970', JSON.stringify(ver.json));

  const tzAfter = pickTz(true), tzBefore = pickTz(false);
  console.log('  · zonas: después-9:00 =', tzAfter, '| antes-9:00 =', tzBefore);
  const writeMedia = (name, rgb) => { fs.writeFileSync(path.join(MEDIA_DIR, name), solidPng(1024, 1280, rgb)); return '/media/' + name; };
  const imgA = writeMedia('hoy-a.png', [200, 60, 60]);
  const imgB = writeMedia('hoy-b.png', [60, 200, 60]);
  const imgC = writeMedia('hoy-c.png', [60, 60, 200]);

  async function newUser(email, tz, lang) {
    const reg = await callAs('', 'POST', '/api/auth/register', { email, password: 'secreto1' });
    if (reg.status !== 200 || !reg.cookie) throw new Error('registro falló ' + email + ' ' + reg.status);
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    db.prepare("UPDATE users SET plan_status = 'active', plan = 'total', concierge = 0 WHERE id = ?").run(uid);
    if (lang) db.prepare("UPDATE users SET lang = ? WHERE id = ?").run(lang, uid);
    db.prepare("INSERT INTO settings (user_id, timezone) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone").run(uid, tz);
    return { uid, cookie: reg.cookie };
  }
  const seedPost = (uid, img, caption, opts) => {
    const o = opts || {};
    return db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, scheduled_at, approval) VALUES (?,?,?,'#philz',?,?,?,?,?)`)
      .run(uid, img, caption, o.status || 'scheduled', 'image', 'foto', o.scheduled_at || null, o.approval || 'approved').lastInsertRowid;
  };
  const postOf = (id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  const seedToday = (uid, tz, img, caption, extra) => {
    const ymd = localParts(tz, new Date()).ymd;
    return seedPost(uid, img, caption, Object.assign({ scheduled_at: zonedWallToUtc(tz, ymd, 19, 0) }, extra || {}));
  };
  const preguntaEn = (msgs) => (Array.isArray(msgs) ? msgs : []).filter(m => m && m.role === 'assistant' && (String(m.text || '').includes('decime si querés cambiar algo') || String(m.text || '').includes('tell me if you want to change anything')));
  const countPreguntaDb = (uid) => db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND role = 'assistant' AND (text LIKE '%decime si querés cambiar algo%' OR text LIKE '%tell me if you want to change anything%')`).get(uid).n;

  // Usuario A: después de las 9:00, posteo de hoy programado.
  const A = await newUser('hoy970-a@x.example', tzAfter, 'es');
  const postA = seedToday(A.uid, tzAfter, imgA, 'Nuevo blend de la casa ☕\nTostado esta semana, de origen único. $20. #philz');
  db.prepare("INSERT INTO assets (user_id, file_path, kind) VALUES (?,?, 'photo'), (?, ?, 'photo')").run(A.uid, imgB, A.uid, imgC);
  // Segundo posteo (mañana) para probar que el ancla explícita gana.
  const ymdA = localParts(tzAfter, new Date()).ymd;
  const postA2 = seedPost(A.uid, imgA, 'Posteo de mañana\nOtro día. #philz', { scheduled_at: zonedWallToUtc(tzAfter, ymdA, 19, 0).replace(/T\d\d:/, 'T23:') });
  db.prepare('UPDATE posts SET scheduled_at = ? WHERE id = ?').run(new Date(new Date(zonedWallToUtc(tzAfter, ymdA, 19, 0)).getTime() + 86400000).toISOString(), postA2);

  const getA1 = await callAs(A.cookie, 'GET', '/api/ideas/chat');
  ok('GET A: 200 + today_post es el posteo de hoy', getA1.status === 200 && getA1.json && getA1.json.today_post && getA1.json.today_post.id === postA, JSON.stringify(getA1.json && getA1.json.today_post));
  const pregA1 = preguntaEn(getA1.json && getA1.json.messages);
  ok('GET A: mensaje con foto + pregunta', pregA1.length === 1 && pregA1[0].text.includes('[foto:' + imgA + ']') && pregA1[0].text.includes('decime si querés cambiar algo'), JSON.stringify(pregA1.map(m => m.text)));
  ok('GET A: la pregunta es el último mensaje', (getA1.json.messages[getA1.json.messages.length - 1] || {}).text === pregA1[0].text);
  ok('GET A: today_post trae foto y caption', getA1.json.today_post.image_path === imgA && getA1.json.today_post.caption.includes('Nuevo blend'));
  const getA2 = await callAs(A.cookie, 'GET', '/api/ideas/chat');
  ok('GET A x2: la pregunta se siembra UNA vez por día', preguntaEn(getA2.json.messages).length === 1 && countPreguntaDb(A.uid) === 1, 'db=' + countPreguntaDb(A.uid));
  ok('salida sin respuesta: el posteo sigue programado hoy 19:00', postOf(postA).status === 'scheduled' && postOf(postA).scheduled_at === zonedWallToUtc(tzAfter, ymdA, 19, 0));
  const rit = await callAs(A.cookie, 'GET', '/api/ritual/hoy');
  ok('revelado 9:00 intacto: /api/ritual/hoy 200', rit.status === 200, String(rit.status));

  // Usuario B: antes de las 9:00 → nada.
  const B = await newUser('hoy970-b@x.example', tzBefore, 'es');
  seedToday(B.uid, tzBefore, imgA, 'Posteo de hoy (antes de las 9)\n#philz');
  const getB = await callAs(B.cookie, 'GET', '/api/ideas/chat');
  ok('GET B (antes 9:00): sin today_post ni mensaje', getB.status === 200 && getB.json.today_post === null && preguntaEn(getB.json.messages).length === 0, JSON.stringify(getB.json && getB.json.today_post));

  // Usuario C: EN, después de las 9:00.
  const C = await newUser('hoy970-c@x.example', tzAfter, 'en');
  seedToday(C.uid, tzAfter, imgA, 'New house blend ☕\nRoasted this week. #philz');
  const getC = await callAs(C.cookie, 'GET', '/api/ideas/chat');
  const pregC = preguntaEn(getC.json.messages);
  ok('GET C (EN): pregunta en inglés con foto', pregC.length === 1 && pregC[0].text.includes('tell me if you want to change anything') && pregC[0].text.includes('[foto:' + imgA + ']'), JSON.stringify(pregC.map(m => m.text)));

  // Usuario D: sin posteo hoy. E: publicado hoy. F: rechazado. G: publishing_stopped.
  const D = await newUser('hoy970-d@x.example', tzAfter, 'es');
  const getD = await callAs(D.cookie, 'GET', '/api/ideas/chat');
  ok('GET D (sin posteo hoy): sin today_post ni mensaje', getD.json.today_post === null && preguntaEn(getD.json.messages).length === 0);
  const E = await newUser('hoy970-e@x.example', tzAfter, 'es');
  seedToday(E.uid, tzAfter, imgA, 'Ya publicado hoy\n#philz', { status: 'published' });
  const getE = await callAs(E.cookie, 'GET', '/api/ideas/chat');
  ok('GET E (publicado): sin today_post ni mensaje', getE.json.today_post === null && preguntaEn(getE.json.messages).length === 0);
  const F = await newUser('hoy970-f@x.example', tzAfter, 'es');
  seedToday(F.uid, tzAfter, imgA, 'Rechazado hoy\n#philz', { approval: 'rejected' });
  const getF = await callAs(F.cookie, 'GET', '/api/ideas/chat');
  ok('GET F (rechazado): sin today_post ni mensaje', getF.json.today_post === null && preguntaEn(getF.json.messages).length === 0);
  const G = await newUser('hoy970-g@x.example', tzAfter, 'es');
  db.prepare('UPDATE users SET publishing_stopped = 1 WHERE id = ?').run(G.uid);
  seedToday(G.uid, tzAfter, imgA, 'Pausado hoy\n#philz');
  const getG = await callAs(G.cookie, 'GET', '/api/ideas/chat');
  ok('GET G (publishing_stopped): sin today_post ni mensaje', getG.json.today_post === null && preguntaEn(getG.json.messages).length === 0);

  // ---------- (B2) POST: los 4 tipos sobre ESE posteo ----------
  const seededText = pregA1[0].text;
  const hist = () => [{ role: 'assistant', text: seededText }];
  // P1: cambiar foto
  const p1 = await callAs(A.cookie, 'POST', '/api/ideas/chat', { messages: [...hist(), { role: 'user', text: 'cambiá la foto por esta' }], photoPaths: [imgB] });
  ok('POST P1 cambiar foto: 200 + image_path = foto nueva', p1.status === 200 && postOf(postA).image_path === imgB, p1.status + ' ' + postOf(postA).image_path);
  // P2: otra imagen (la segunda)
  const p2 = await callAs(A.cookie, 'POST', '/api/ideas/chat', { messages: [...hist(), { role: 'user', text: 'poné otra imagen, la segunda' }], photoPaths: [imgB, imgC] });
  ok('POST P2 otra imagen: image_path = la segunda', p2.status === 200 && postOf(postA).image_path === imgC, p2.status + ' ' + postOf(postA).image_path);
  // P3: cambiar título (textOnlyEdit: no regenera imagen)
  const p3 = await callAs(A.cookie, 'POST', '/api/ideas/chat', { messages: [...hist(), { role: 'user', text: 'cambiá el título por "Tesora que todos piden"' }] });
  ok('POST P3 cambiar título: caption empieza con el nuevo título', p3.status === 200 && String(postOf(postA).caption).split('\n')[0] === 'Tesora que todos piden', JSON.stringify(postOf(postA).caption));
  // P4: reportar algo mal (precio)
  const p4 = await callAs(A.cookie, 'POST', '/api/ideas/chat', { messages: [...hist(), { role: 'user', text: 'cambiá el caption, el precio está mal: son $18 no $20' }] });
  ok('POST P4 reportar precio mal: caption con $18 y sin $20', p4.status === 200 && postOf(postA).caption.includes('$18') && !postOf(postA).caption.includes('$20'), JSON.stringify(postOf(postA).caption));
  ok('POST P4: la foto no se tocó al corregir el caption', postOf(postA).image_path === imgC);
  // P5: reporte vago → aclaración, posteo intacto
  const capAntes = postOf(postA).caption, imgAntes = postOf(postA).image_path;
  const p5 = await callAs(A.cookie, 'POST', '/api/ideas/chat', { messages: [...hist(), { role: 'user', text: 'no sé, algo no me cierra en la foto' }] });
  ok('POST P5 reporte vago: responde sin tocar el posteo', p5.status === 200 && postOf(postA).caption === capAntes && postOf(postA).image_path === imgAntes, JSON.stringify(p5.json && p5.json.reply));
  // P6: ancla explícita a otro posteo gana sobre el default de hoy
  const capAAntes = postOf(postA).caption;
  const p6 = await callAs(A.cookie, 'POST', '/api/ideas/chat', { messages: [...hist(), { role: 'user', text: 'cambiá el título por "Otro título"' }], anchor_post_id: postA2 });
  ok('POST P6 ancla explícita gana: el cambio cae en el otro posteo', p6.status === 200 && String(postOf(postA2).caption).split('\n')[0] === 'Tesora que todos piden' && postOf(postA).caption === capAAntes, JSON.stringify(postOf(postA2).caption));
  // P7: el posteo de hoy sigue programado (salida igual sin respuesta)
  ok('POST: el posteo de hoy sigue scheduled', postOf(postA).status === 'scheduled');

  console.log(`\n${passed} pasaron, ${failed} fallaron (DATA_DIR ${TMP})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE ROTA:', e); process.exit(2); });
