// test-lote-aviso-30min-historia-v856.js — LOTE v856 AVISO DE 30 MIN:
// DISTINGUIR HISTORIA DE POSTEO DEL FEED.
// Bug (Valentino 9/11 21:30, captura): el aviso «En 30 minutos publico
// este posteo…» (push + chat) disparó por la historia 588 (programada
// 22:00 EST) y Valentino lo leyó como que el posteo 583 —ya publicado a
// las 19:00— iba a salir de nuevo. No era un duplicado: era la historia.
// Fix: el aviso dice «esta historia» cuando media_type es story y «este
// posteo» cuando es feed, e identifica cuál es (primeras palabras del
// caption). Vale para push, chat Y email (el email es el tercer sitio
// donde se compone el mismo aviso — se encontró barriendo TODO el árbol:
// scheduler.js espejo del chat, upcoming-notice.js push + chat fallback,
// notify-email.js asunto + titular + botón + alt).
// Precedente: la tarjeta ya distingue (desde el 5/11 no dice «Hoy · 22:00»
// cuando es una historia; app.js usa media_type === 'story' en todos lados
// — el mismo campo usa este fix).
// Lote SOLO servidor (app.js sin tocar: ?v=584 queda SIN USAR; M78 N/A
// como Juli v845). Parte A: estática. Parte B: upcoming-notice en vivo
// (módulo real, push/email stubbeados, SQLite en memoria). Parte C: email
// en vm (requires stubbeados, captura el HTML). Parte D: espejo del chat
// de scheduler.js (función extraída en vm). Parte E: boot real.
// Uso: node test-lote-aviso-30min-historia-v856.js — sale 0 si todo pasa.
// Puerto: 34631 (v851 usó 34630; ads-pantalla usa 18754 fijo).
// Re-pin al re-basar sobre v855 (re-estampador v856, precedente v854):
// A1/A2/A3/E2 pasaban de ?v=581 / app.js 9584a1b6… / index 9d3a4468…
// (base v851 del preparador) a ?v=582 / app.js 39abf602… / index e0daa232…
// (árbol vivo v855: v853 bumpeó ?v= a 582 y cambió app.js con la guarda
// IS_NATIVE). El fix no cambia estos valores; solo se actualiza el pin.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const schSrc = fs.readFileSync(path.join(DIR, 'scheduler.js'), 'utf8');
const unSrc = fs.readFileSync(path.join(DIR, 'upcoming-notice.js'), 'utf8');
const neSrc = fs.readFileSync(path.join(DIR, 'notify-email.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const appMd5 = crypto.createHash('md5').update(appSrc).digest('hex');
const idxMd5 = crypto.createHash('md5').update(idxSrc).digest('hex');

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

// ---------- Parte A: estática ----------
function parteA() {
  console.log('— A) estática: el aviso distingue historia de posteo —');
  check('A0 BUILD v856 en server.js', srvSrc.includes("const BUILD_ID = '20261105-v856';"));
  check('A0b cero v851 en server.js', !srvSrc.includes('20261105-v851'));
  check('A1 index ES sigue en ?v=582 (?v=584 SIN USAR: lote solo servidor)', idxSrc.includes('app.js?v=582') && !idxSrc.includes('app.js?v=584'));
  check('A2 app.js sin tocar (md5 = v853/v855 39abf602…)', appMd5 === '39abf602c1656451892201704105e3bb', appMd5);
  check('A3 styles?v= sin cambio (20261225) + index ES sin cambio (md5 e0daa232…)', idxSrc.includes('styles.css?v=20261225') && idxMd5 === 'e0daa232e8074ab62a8e38a2935ea83b', idxMd5);
  check('A4 upcoming-notice define isStory por media_type', unSrc.includes("const isStory = String(p.media_type || '') === 'story';"));
  check('A5 push: historia dice «esta historia» + verla/frenarla', unSrc.includes('esta historia: "${cap}..." — tocá para verla o frenarla') && unSrc.includes('esta historia: "${cap}..." — tocá para aprobarla o frenarla'));
  check('A5b push: feed sigue «este posteo» + verlo/frenarlo', unSrc.includes('este posteo: "${cap}..." — tocá para verlo o frenarlo') && unSrc.includes('este posteo: "${cap}..." — tocá para aprobarlo o frenarlo'));
  check('A6 chat fallback: historia «publico esta historia» + frenarla/cambiarla', unSrc.includes('en 30 minutos publico esta historia:') && unSrc.includes('si querés frenarla o cambiarla'));
  check('A6b chat fallback: historia manual «sale esta historia»', unSrc.includes('en 30 minutos sale esta historia y todavía no me diste tu ok'));
  check('A6c chat fallback: feed intacto «publico este posteo» + «sale este posteo»', unSrc.includes('en 30 minutos publico este posteo:') && unSrc.includes('en 30 minutos sale este posteo y todavía no me diste tu ok'));
  check('A7 email: isStory por media_type', neSrc.includes("const isStory = String(post.media_type || '') === 'story';"));
  check('A7b email ES: «publico esta historia» / «Esta historia sale»', neSrc.includes('En 30 minutos publico esta historia 👇') && neSrc.includes('Esta historia sale en 30 minutos y todavía no me diste tu ok 👇'));
  check('A7c email ES: feed intacto «publico este posteo» / «Este posteo sale»', neSrc.includes('En 30 minutos publico este posteo 👇') && neSrc.includes('Este posteo sale en 30 minutos y todavía no me diste tu ok 👇'));
  check('A7d email EN: «publish this story» / «Your story goes out» / «This story goes out»', neSrc.includes("In 30 minutes I'll publish this story 👇") && neSrc.includes('Your story goes out in 30 minutes') && neSrc.includes('This story goes out in 30 minutes'));
  check('A7e email: asunto historia ES/EN', neSrc.includes('Tu historia sale en 30 minutos') && neSrc.includes('Your story goes out in 30 minutes'));
  check('A7f email: botón «Ver la historia» / «See the story» + alt «Historia»', neSrc.includes("isStory ? 'Ver la historia' : 'Ver el posteo'") && neSrc.includes("isStory ? 'See the story' : 'See the post'") && neSrc.includes("alt=\"${isStory ? 'Historia' : 'Posteo'}\""));
  check('A8 scheduler espejo: SELECT trae media_type', schSrc.includes("SELECT user_id, caption, media_type FROM posts WHERE id = ?"));
  check('A8b scheduler espejo: «publico esta historia» + frenarla/cambiarla', schSrc.includes('En 30 minutos publico esta historia:') && schSrc.includes('Si querés frenarla o cambiarla, tocá acá 👆'));
  check('A8c scheduler espejo: feed intacto «publico este posteo» + frenarlo/cambiarlo', schSrc.includes('En 30 minutos publico este posteo:') && schSrc.includes('Si querés frenarlo o cambiarlo, tocá acá 👆'));
  check('A9 los 3 archivos del aviso tienen rama historia (sin «esta historia» no hay fix)', (unSrc.match(/esta historia/g) || []).length >= 4 && (neSrc.match(/esta historia|this story|your story|tu historia/gi) || []).length >= 5 && (schSrc.match(/esta historia/g) || []).length >= 1);
}

// ---------- Parte B: upcoming-notice en vivo ----------
function mkDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, caption TEXT, media_type TEXT, status TEXT, scheduled_at TEXT, approval TEXT, autopilot_notified INTEGER DEFAULT 0, needs_review INTEGER DEFAULT 0, auto_published INTEGER DEFAULT 0, owner_liked INTEGER DEFAULT 0)`);
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, trust_level INTEGER, autopilot_prenotify INTEGER, email TEXT, lang TEXT)`);
  db.exec(`CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT)`);
  db.exec(`CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  return db;
}
const un = require(path.join(DIR, 'upcoming-notice.js'));

async function runNotice(post, user, pushRes, emailRes) {
  const db = mkDb();
  db.prepare('INSERT INTO users (id, trust_level, autopilot_prenotify, email, lang) VALUES (?,?,?,?,?)')
    .run(user.id, user.trust_level, 0, user.email || 'dueño@test.com', user.lang || 'es');
  db.prepare('INSERT INTO posts (id, user_id, caption, media_type, status, scheduled_at, approval, autopilot_notified, needs_review, auto_published, owner_liked) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(post.id, user.id, post.caption, post.media_type, 'scheduled', post.scheduled_at || new Date(Date.now() + 30 * 60000).toISOString(), post.approval || 'pending', 0, 0, 0, 0);
  const pushes = [];
  const out = await un.processUpcomingNotices(db, {
    posts: [db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id)],
    pushFn: async (uid, payload) => { pushes.push(payload); return pushRes; },
    emailFn: async () => emailRes,
  });
  const chats = db.prepare('SELECT text FROM chat_messages WHERE user_id = ? ORDER BY id').all(user.id).map((r) => r.text);
  const notified = db.prepare('SELECT autopilot_notified FROM posts WHERE id = ?').get(post.id).autopilot_notified;
  db.close();
  return { out, pushes, chats, notified };
}

async function parteB() {
  console.log('— B) upcoming-notice en vivo: push + chat fallback distinguen —');
  const cap588 = '¿cuántas veces te pasó…\nsegunda línea que no se ve';
  const capFeed = 'Tu gimnasio, siempre activo\nsegunda línea que no se ve';
  // B1: historia 588, autopilot, push ok.
  let r = await runNotice({ id: 588, caption: cap588, media_type: 'story' }, { id: 12, trust_level: 1 }, { ok: true }, { ok: false, reason: 'no_config' });
  check('B1 push historia: «esta historia: "¿cuántas veces te pasó…" — tocá para verla o frenarla»', r.pushes.length === 1 && r.pushes[0].body.includes('esta historia: "¿cuántas veces te pasó…') && r.pushes[0].body.includes('tocá para verla o frenarla'), JSON.stringify(r.pushes));
  check('B1b push historia: sin «este posteo»', r.pushes.length === 1 && !r.pushes[0].body.includes('este posteo'));
  check('B1c push historia: marcado, sin chat duplicado', r.out.push === 1 && r.notified === 1 && r.chats.length === 0);
  // B2: feed, autopilot, push ok.
  r = await runNotice({ id: 583, caption: capFeed, media_type: 'image' }, { id: 12, trust_level: 1 }, { ok: true }, { ok: false, reason: 'no_config' });
  check('B2 push feed: «este posteo: "Tu gimnasio, siempre activo…" — tocá para verlo o frenarlo»', r.pushes.length === 1 && r.pushes[0].body.includes('este posteo: "Tu gimnasio, siempre activo') && r.pushes[0].body.includes('tocá para verlo o frenarlo'), JSON.stringify(r.pushes));
  check('B2b push feed: sin «esta historia»', r.pushes.length === 1 && !r.pushes[0].body.includes('esta historia'));
  // B3: historia, autopilot, sin canal → chat fallback.
  r = await runNotice({ id: 588, caption: cap588, media_type: 'story' }, { id: 12, trust_level: 1 }, { ok: false, reason: 'no_subs' }, { ok: false, reason: 'no_config' });
  check('B3 chat fallback historia: «en 30 minutos publico esta historia» + caption + «frenarla o cambiarla»', r.chats.length === 1 && r.chats[0].includes('en 30 minutos publico esta historia:') && r.chats[0].includes('¿cuántas veces te pasó…') && r.chats[0].includes('si querés frenarla o cambiarla'), JSON.stringify(r.chats));
  check('B3b chat fallback historia: sin «este posteo»', r.chats.length === 1 && !r.chats[0].includes('este posteo'));
  // B4: feed, autopilot, sin canal → chat fallback.
  r = await runNotice({ id: 583, caption: capFeed, media_type: 'image' }, { id: 12, trust_level: 1 }, { ok: false, reason: 'no_subs' }, { ok: false, reason: 'no_config' });
  check('B4 chat fallback feed: «en 30 minutos publico este posteo» + «frenarlo o cambiarlo»', r.chats.length === 1 && r.chats[0].includes('en 30 minutos publico este posteo:') && r.chats[0].includes('Tu gimnasio, siempre activo') && r.chats[0].includes('si querés frenarlo o cambiarlo'), JSON.stringify(r.chats));
  // B5/B6: manual, push ok.
  r = await runNotice({ id: 588, caption: cap588, media_type: 'story' }, { id: 12, trust_level: 0 }, { ok: true }, { ok: false, reason: 'no_config' });
  check('B5 push manual historia: «esta historia: … — tocá para aprobarla o frenarla»', r.pushes.length === 1 && r.pushes[0].body.includes('esta historia: "¿cuántas veces te pasó…') && r.pushes[0].body.includes('tocá para aprobarla o frenarla'), JSON.stringify(r.pushes));
  r = await runNotice({ id: 583, caption: capFeed, media_type: 'image' }, { id: 12, trust_level: 0 }, { ok: true }, { ok: false, reason: 'no_config' });
  check('B6 push manual feed: «este posteo: … — tocá para aprobarlo o frenarlo»', r.pushes.length === 1 && r.pushes[0].body.includes('este posteo: "Tu gimnasio, siempre activo') && r.pushes[0].body.includes('tocá para aprobarlo o frenarlo'), JSON.stringify(r.pushes));
  // B7/B8: manual, sin canal → chat fallback.
  r = await runNotice({ id: 588, caption: cap588, media_type: 'story' }, { id: 12, trust_level: 0 }, { ok: false, reason: 'no_subs' }, { ok: false, reason: 'no_config' });
  check('B7 chat fallback manual historia: «en 30 minutos sale esta historia y todavía no me diste tu ok»', r.chats.length === 1 && r.chats[0].includes('en 30 minutos sale esta historia y todavía no me diste tu ok'), JSON.stringify(r.chats));
  r = await runNotice({ id: 583, caption: capFeed, media_type: 'image' }, { id: 12, trust_level: 0 }, { ok: false, reason: 'no_subs' }, { ok: false, reason: 'no_config' });
  check('B8 chat fallback manual feed: «en 30 minutos sale este posteo y todavía no me diste tu ok»', r.chats.length === 1 && r.chats[0].includes('en 30 minutos sale este posteo y todavía no me diste tu ok'), JSON.stringify(r.chats));
}

// ---------- Parte C: email en vm (requires stubbeados, se captura el HTML) ----------
function loadEmailModule() {
  const captured = [];
  const sandbox = {
    module: { exports: {} },
    exports: {},
    process,
    console,
    require: (name) => {
      if (name === './email') {
        return {
          sendEmail: async (opts) => { captured.push(opts); return { ok: true }; },
          emailConfigured: () => true,
          emailFaceHeader: () => '',
        };
      }
      if (name === './approval') {
        return {
          signAction: () => ({ sig: 'test-sig', exp: 9999999999 }),
          signWeekAction: () => ({}),
          absoluteMediaUrl: (p) => p || '',
          userHourLabel: () => '22:00',
        };
      }
      if (name === './email-semana-v4') return { buildWeekEmailV4: () => '' };
      if (name === './guest-trial') return { isGuestEmail: (e) => String(e || '').toLowerCase().endsWith('@guest.invalid') };
      throw new Error('require no stubbeado: ' + name);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(neSrc, sandbox, { filename: 'notify-email.js' });
  return { mod: sandbox.module.exports, captured };
}
function mkEmailDb(lang) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, lang TEXT, client_name TEXT)`);
  db.prepare('INSERT INTO users (id, email, lang, client_name) VALUES (?,?,?,?)').run(12, 'dueño@test.com', lang, 'Posty.');
  return db;
}

async function parteC() {
  console.log('— C) email en vm: asunto + titular + botón distinguen —');
  const { mod, captured } = loadEmailModule();
  const storyPost = { id: 588, user_id: 12, caption: '¿cuántas veces te pasó…\nsegunda línea', media_type: 'story', image_path: '/media/story-x.png', scheduled_at: new Date(Date.now() + 30 * 60000).toISOString() };
  const feedPost = { id: 583, user_id: 12, caption: 'Tu gimnasio, siempre activo\nsegunda línea', media_type: 'image', image_path: '/media/feed-x.jpg', scheduled_at: new Date(Date.now() + 30 * 60000).toISOString() };
  // C1: historia ES autopilot.
  let db = mkEmailDb('es');
  let r = await mod.sendUpcomingEmail(db, storyPost, { mode: 'autopilot' });
  let mail = captured[captured.length - 1];
  check('C1 email historia ES autopilot: enviado ok', r && r.ok === true, JSON.stringify(r));
  check('C1b titular «En 30 minutos publico esta historia 👇» + caption', !!mail && mail.html.includes('En 30 minutos publico esta historia 👇') && mail.html.includes('¿cuántas veces te pasó…'), mail ? mail.html.slice(0, 600) : 'sin mail');
  check('C1c asunto «⏰ Tu historia sale en 30 minutos»', !!mail && mail.subject === '⏰ Tu historia sale en 30 minutos', mail ? mail.subject : 'sin mail');
  check('C1d botón «Ver la historia» + alt «Historia»', !!mail && mail.html.includes('Ver la historia') && mail.html.includes('alt="Historia"'), mail ? mail.html.slice(0, 600) : 'sin mail');
  check('C1e email historia: sin «este posteo» / «Tu posteo» / «Ver el posteo»', !!mail && !mail.html.includes('este posteo') && !mail.html.includes('Este posteo') && !mail.subject.includes('posteo') && !mail.html.includes('Ver el posteo'), mail ? (mail.subject + ' | ' + mail.html.slice(0, 600)) : 'sin mail');
  db.close();
  // C2: feed ES autopilot.
  db = mkEmailDb('es');
  r = await mod.sendUpcomingEmail(db, feedPost, { mode: 'autopilot' });
  mail = captured[captured.length - 1];
  check('C2 email feed ES autopilot: «En 30 minutos publico este posteo 👇» + asunto «Tu posteo» + botón «Ver el posteo»', r && r.ok === true && !!mail && mail.html.includes('En 30 minutos publico este posteo 👇') && mail.subject === '⏰ Tu posteo sale en 30 minutos' && mail.html.includes('Ver el posteo'), mail ? (mail.subject + ' | ' + mail.html.slice(0, 600)) : 'sin mail');
  check('C2b email feed: sin «esta historia» / «Tu historia»', !!mail && !mail.html.includes('esta historia') && !mail.html.includes('Esta historia') && !mail.subject.includes('historia'), mail ? (mail.subject + ' | ' + mail.html.slice(0, 600)) : 'sin mail');
  db.close();
  // C3/C4: manual ES.
  db = mkEmailDb('es');
  r = await mod.sendUpcomingEmail(db, storyPost, { mode: 'manual' });
  mail = captured[captured.length - 1];
  check('C3 email historia ES manual: «Esta historia sale en 30 minutos y todavía no me diste tu ok 👇»', r && r.ok === true && !!mail && mail.html.includes('Esta historia sale en 30 minutos y todavía no me diste tu ok 👇'), mail ? mail.html.slice(0, 600) : 'sin mail');
  db.close();
  db = mkEmailDb('es');
  r = await mod.sendUpcomingEmail(db, feedPost, { mode: 'manual' });
  mail = captured[captured.length - 1];
  check('C4 email feed ES manual: «Este posteo sale en 30 minutos y todavía no me diste tu ok 👇»', r && r.ok === true && !!mail && mail.html.includes('Este posteo sale en 30 minutos y todavía no me diste tu ok 👇'), mail ? mail.html.slice(0, 600) : 'sin mail');
  db.close();
  // C5/C6: EN autopilot.
  db = mkEmailDb('en');
  r = await mod.sendUpcomingEmail(db, storyPost, { mode: 'autopilot' });
  mail = captured[captured.length - 1];
  check('C5 email historia EN autopilot: «In 30 minutes I\'ll publish this story 👇» + asunto «Your story» + «See the story»', r && r.ok === true && !!mail && mail.html.includes("In 30 minutes I'll publish this story 👇") && mail.subject === '⏰ Your story goes out in 30 minutes' && mail.html.includes('See the story'), mail ? (mail.subject + ' | ' + mail.html.slice(0, 600)) : 'sin mail');
  db.close();
  db = mkEmailDb('en');
  r = await mod.sendUpcomingEmail(db, feedPost, { mode: 'autopilot' });
  mail = captured[captured.length - 1];
  check('C6 email feed EN autopilot: «In 30 minutes I\'ll publish this post 👇» + asunto «Your post»', r && r.ok === true && !!mail && mail.html.includes("In 30 minutes I'll publish this post 👇") && mail.subject === '⏰ Your post goes out in 30 minutes', mail ? (mail.subject + ' | ' + mail.html.slice(0, 600)) : 'sin mail');
  db.close();
}

// ---------- Parte D: espejo del chat de scheduler.js (función extraída en vm) ----------
async function runMirror(postId, caption, mediaType, detalle) {
  const db = mkDb();
  db.prepare('INSERT INTO posts (id, user_id, caption, media_type, status, scheduled_at, approval, autopilot_notified, needs_review, auto_published, owner_liked) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(postId, 12, caption, mediaType, 'scheduled', new Date(Date.now() + 30 * 60000).toISOString(), 'pending', 0, 0, 0, 0);
  const fnSrc = fnFrom(schSrc, 'async function autopilotPreNotify(db) {');
  if (!fnSrc) throw new Error('autopilotPreNotify no encontrada en scheduler.js');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    require: (name) => {
      if (name === './upcoming-notice') return { processUpcomingNotices: async () => ({ detalle }) };
      throw new Error('require no stubbeado: ' + name);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(fnSrc + '\nmodule.exports = { autopilotPreNotify };', sandbox, { filename: 'scheduler-mirror.js' });
  await sandbox.module.exports.autopilotPreNotify(db);
  const chats = db.prepare('SELECT text FROM chat_messages WHERE user_id = ? ORDER BY id').all(12).map((x) => x.text);
  db.close();
  return chats;
}

async function parteD() {
  console.log('— D) espejo del chat (scheduler.js): el texto que vio Valentino —');
  let chats = await runMirror(588, '¿cuántas veces te pasó…\nsegunda línea', 'story', [{ channel: 'push', mode: 'autopilot', post_id: 588 }]);
  check('D1 espejo historia: «🚀 En 30 minutos publico esta historia» + caption + «frenarla o cambiarla»', chats.length === 1 && chats[0].includes('En 30 minutos publico esta historia:') && chats[0].includes('¿cuántas veces te pasó…') && chats[0].includes('Si querés frenarla o cambiarla, tocá acá 👆'), JSON.stringify(chats));
  check('D1b espejo historia: sin «este posteo»', chats.length === 1 && !chats[0].includes('este posteo'));
  chats = await runMirror(583, 'Tu gimnasio, siempre activo\nsegunda línea', 'image', [{ channel: 'push', mode: 'autopilot', post_id: 583 }]);
  check('D2 espejo feed: «🚀 En 30 minutos publico este posteo» + «frenarlo o cambiarlo»', chats.length === 1 && chats[0].includes('En 30 minutos publico este posteo:') && chats[0].includes('Tu gimnasio, siempre activo') && chats[0].includes('Si querés frenarlo o cambiarlo, tocá acá 👆'), JSON.stringify(chats));
  chats = await runMirror(588, '¿cuántas veces te pasó…', 'story', [{ channel: 'email', mode: 'autopilot', post_id: 588 }]);
  check('D3 espejo solo en push+autopilot (email no espeja)', chats.length === 0, JSON.stringify(chats));
}

// ---------- Parte E: boot real ----------
const PORT = 34631;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aviso-30min-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';

async function bootServer() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '' };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  let up = false;
  for (let i = 0; i < 45; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
    await sleep(1000);
  }
  return { child, up, out: () => out };
}
async function killServer(child) {
  try { child.kill('SIGTERM'); } catch (e) {}
  await sleep(800);
  try { if (child.exitCode === null) child.kill('SIGKILL'); } catch (e) {}
  await sleep(300);
}

async function parteE() {
  console.log('— E) boot real —');
  const b = await bootServer();
  try {
    check('E0 el servidor levanta con el lote', b.up);
    if (!b.up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(b.out().split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    check('E1 /api/version trae el BUILD v856', ver && ver.build === '20261105-v856', JSON.stringify(ver));
    const idx = await fetch(`http://127.0.0.1:${PORT}/`);
    const idxTxt = await idx.text();
    check('E2 index 200 con app.js?v=582 + styles.css?v=20261225 (sin cambio)', idx.status === 200 && idxTxt.includes('app.js?v=582') && idxTxt.includes('styles.css?v=20261225'), 'status ' + idx.status);
    check('E3 log sin FATAL ni EADDRINUSE', !b.out().includes('FATAL') && !b.out().includes('EADDRINUSE'), b.out().split('\n').filter((l) => /FATAL|EADDRINUSE/.test(l)).join(' | '));
  } finally {
    await killServer(b.child);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  parteA();
  await parteB();
  await parteC();
  await parteD();
  await parteE();
  console.log(`\ntest-lote-aviso-30min-historia-v856: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
