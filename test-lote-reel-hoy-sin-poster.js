#!/usr/bin/env node
// test-lote-reel-hoy-sin-poster.js — LOTE v915 REEL-HOY-SIN-POSTER
// A. Anclas estáticas · B. Render pzHoyCardHTML (release vs base) + M78
// C. coverGate (las 2 acciones que borraban) + guarda del UPDATE
// D. Boot release: /api/version + reparación de la portada (siembra, idempotente)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const S = __dirname;
const REL = path.join(S, 'release');
const BASE = path.join(S, 'base-v900');
let pass = 0, fail = 0; const fails = [];
function t(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function read(p) { return fs.readFileSync(p, 'utf-8'); }
function count(hay, needle) { return hay.split(needle).length - 1; }

const serverRel = read(path.join(REL, 'server.js'));
const appRel = read(path.join(REL, 'public', 'app.js'));
const appBase = read(path.join(BASE, 'public', 'app.js'));
const stylesRel = read(path.join(REL, 'public', 'styles.css'));
const indexRel = read(path.join(REL, 'public', 'index.html'));
const indexEnRel = read(path.join(REL, 'public', 'en', 'index.html'));

// ---------- A. Anclas estáticas ----------
console.log('A. Anclas estáticas (release/)');
t('A1 BUILD v915 x1, v900 x0 en server.js',
  count(serverRel, '20261105-v915') === 1 && count(serverRel, '20261105-v900') === 0);
t('A2 index ES app.js?v=628 x1, styles?v=20261253 x1',
  count(indexRel, 'app.js?v=628') === 1 && count(indexRel, 'styles.css?v=20261253') === 1);
t('A3 index EN styles?v=20261253 x1, sin app.js?v=',
  count(indexEnRel, 'styles.css?v=20261253') === 1 && count(indexEnRel, 'app.js?v=') === 0);
t('A4 app.js: imgSrc por cover_path + fallback video (media = img || vid)',
  appRel.includes("const imgSrc = isVid") && appRel.includes('const media = img || vid')
  && appRel.includes('pz-hoy-thumb-video') && appRel.includes('pz-hoy-hero-video')
  && appRel.includes('preload="metadata"'));
t('A5 styles.css: .pz-hoy-thumb-video y .pz-hoy-hero-video con la geometría de la img',
  stylesRel.includes('.pz-hoy-thumb-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}')
  && stylesRel.includes('.pz-hoy-hero-video{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}'));
t('A6 server.js: UPDATE de cover_path SOLO dentro de if (coverPath)',
  count(serverRel, "run(coverPath, piece.id)") === 1
  && /if \(coverPath\) \{\s*\n\s*try \{ db\.prepare\('UPDATE posts SET cover_path/.test(serverRel));
t('A7 server.js: decisión registra la portada efectiva (nueva o preservada)',
  serverRel.includes("coverPath: coverPath || piece._prevCover || '',"));
t('A8 server.js: reparación siembra (portada_reparada + portada_pendiente, idempotente)',
  serverRel.includes('portada_reparada') && serverRel.includes('portada_pendiente')
  && serverRel.includes("UPDATE posts SET cover_path = ? WHERE id = ?`).run('/media/tira-nails-2-cover.jpg', vid.id)"));

// ---------- B. Render pzHoyCardHTML ----------
console.log('B. Render pzHoyCardHTML (release vs base-v900)');
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('no está ' + name);
  let j = src.indexOf('{', i), depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('sin cierre ' + name);
}
function loadCard(src) {
  const ctx = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (s, w) => (!s || typeof s !== 'string' || s.indexOf('/media/') !== 0) ? s : s.replace(/\.(jpe?g|png)$/i, '@' + w + '.webp'),
    pzHoyPillSalida: () => '',
    pzHoyCuandoCorto: () => '',
    pzHoyCuentaSaleTxt: () => '',
    // (re-pineo re-estampador v915/base-v914 · 11/11 · v914 llama a pzIc() dentro
    // de la rama héroe de pzHoyCardHTML (botones Editar/Eliminar); en la app
    // real pzIc es global (app.js:191), en este VM hay que mockearlo o la rama
    // héroe tira y el try/catch de la función devuelve ''. Stub mínimo.)
    pzIc: (name, px) => '',
  };
  vm.createContext(ctx);
  vm.runInContext(extractFn(src, 'pzHoyCardHTML') + '\nthis.__card = pzHoyCardHTML;', ctx);
  return ctx.__card;
}
const cardRel = loadCard(appRel);
const cardBase = loadCard(appBase);
const p593 = { id: 593, media_type: 'video', image_path: '/media/tira-nails-2.mp4', cover_path: '', caption: 'así se mueve el color cuando posty lo postea. un video así cada semana, para tu salón, sin que muevas un dedo.', status: 'scheduled', approval: 'approved', scheduled_at: '2026-11-12T00:00:00.000Z' };
const p593cover = Object.assign({}, p593, { cover_path: '/media/tira-nails-2-cover.jpg' });
const pImg = { id: 592, media_type: 'image', image_path: '/media/tira-nails-1.jpg', cover_path: '', caption: 'uñas de hoy', status: 'scheduled', approval: 'approved', scheduled_at: '2026-11-11T00:00:00.000Z' };
const hero = { hero: true, sinCuando: true, en: false, tz: 'America/New_York' };

const hRelNoCover = cardRel(p593, hero);
t('B1 héroe 593 SIN portada (release): se ve el <video> con preload=metadata',
  hRelNoCover.includes('<video') && hRelNoCover.includes('preload="metadata"')
  && hRelNoCover.includes('/media/tira-nails-2.mp4'));
t('B2 héroe 593 SIN portada (release): NUNCA caption-only — hay media + badges + botón',
  hRelNoCover.includes('pz-hoy-hero-media') && hRelNoCover.includes('▶ Reel')
  && hRelNoCover.includes('Ver el posteo completo') && hRelNoCover.includes('Agendado')
  && hRelNoCover.includes('así se mueve el color'));
t('B3 héroe 593 SIN portada (base-v900): BUG reproducido — <img> al .mp4 (póster roto), sin <video>',
  (() => { const h = cardBase(p593, hero);
    return h.includes('<img') && h.includes('/media/tira-nails-2.mp4') && !h.includes('<video')
      && !h.includes('tira-nails-2-cover') && h.includes('así se mueve el color'); })());
const hRelCover = cardRel(p593cover, hero);
t('B4 héroe video CON portada (release): se ve la portada, NO el video',
  hRelCover.includes('<img') && hRelCover.includes('tira-nails-2-cover@640.webp')
  && !hRelCover.includes('<video') && hRelCover.includes('▶ Reel'));
const cRelNoCover = cardRel(p593, { hero: false, en: false, tz: 'America/New_York' });
t('B5 compacta video SIN portada (release): thumb con <video>',
  cRelNoCover.includes('<video class="pz-hoy-thumb-video"') && cRelNoCover.includes('🎬 Reel'));
const hImg = cardRel(pImg, hero);
t('B6 imagen sin cambios (release): <img> con su foto, sin <video>',
  hImg.includes('<img') && hImg.includes('tira-nails-1.jpg') && !hImg.includes('<video'));
// M78: funciones llamadas en el bloque cambiado
const m78esc = appRel.includes('const esc = (s) =>');
const m78mv = count(appRel, 'function mv(') >= 1;
t('B7 M78 funciones auditadas: 2/2 (esc y mv existen y definidas; __imgFb es ref en string, definida en window)',
  m78esc && m78mv && appRel.includes('window.__imgFb = function'));
// Tile HOY de la grilla: IGUAL que en base (no se toca en este lote)
const tileRel = extractFn(appRel, 'homeTileHTML');
const tileBase = extractFn(appBase, 'homeTileHTML');
t('B8 tile HOY (homeTileHTML): byte-idéntica base vs release + ya tenía el fallback <video preload="metadata">',
  tileRel === tileBase && tileRel.includes('preload="metadata"') && tileRel.includes('<video'));

// ---------- C. coverGate + guarda ----------
console.log('C. coverGate (feed-director.js) + guarda del UPDATE');
const fd = require(path.join(REL, 'feed-director.js'));
const F = fd.FAMILY;
t('C1 coverGate natural (frame natural combina) → action natural (antes borraba)',
  fd.coverGate({ frames: [{ family: F.LIGHT, lum: 80, sat: 10 }], wantFamily: F.LIGHT }).action === 'natural');
t('C2 coverGate sin frames → action keep (antes borraba)',
  fd.coverGate({ frames: [], wantFamily: F.LIGHT }).action === 'keep');
t('C3 coverGate alt-frame → action alt-frame (sigue escribiendo portada nueva)',
  fd.coverGate({ frames: [{ family: F.OTHER, lum: 50 }, { family: F.LIGHT, lum: 80 }], wantFamily: F.LIGHT }).action === 'alt-frame');
t('C4 coverGate grade (ningún frame cae, familia LIGHT) → action grade',
  fd.coverGate({ frames: [{ family: F.OTHER, lum: 20 }, { family: F.OTHER, lum: 30 }], wantFamily: F.LIGHT }).action === 'grade');

// ---------- D. Boot release + reparación siembra ----------
console.log('D. Boot release + reparación siembra (idempotente)');
async function boot(dir, port, tag) {
  const tmp = '/tmp/boot-v915-' + tag;
  fs.rmSync(tmp, { recursive: true, force: true });
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });
  const logPath = path.join(tmp, 'boot.log');
  const logFd = fs.openSync(logPath, 'w');
  const env = Object.assign({}, process.env, {
    PORT: String(port), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin-915',
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
  });
  const child = spawn('node', ['server.js'], { cwd: dir, env, stdio: ['ignore', logFd, logFd] });
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    await sleep(500);
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/api/version');
      if (r.ok) { const j = await r.json(); up = j.build === '20261105-v915'; }
    } catch (e) { /* todavía no levanta */ }
  }
  if (!up) throw new Error('boot ' + tag + ' no levantó en puerto ' + port + ' (ver ' + logPath + ')');
  return { child, dataDir, logPath, port, tmp };
}
function portFree(port) {
  try { execSync('ss -ltn | grep -q ":' + port + ' "'); return false; } catch (e) { return true; }
}
async function killBoot(b) {
  try { process.kill(b.child.pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let alive = true;
  try { process.kill(b.child.pid, 0); } catch (e) { alive = false; }
  if (alive) { try { process.kill(b.child.pid, 'SIGKILL'); } catch (e) {} }
  await sleep(500);
}
async function post(port, p, body) {
  const r = await fetch('http://127.0.0.1:' + port + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}
(async () => {
  const PORT = 34980;
  if (!portFree(PORT)) throw new Error('puerto ' + PORT + ' ocupado antes de arrancar');
  const b = await boot(REL, PORT, 'rel');
  const nodePid = b.child.pid;
  try {
    // Siembra 593 SIN portada (la fila como la dejó el director en producción).
    const db = new DatabaseSync(path.join(b.dataDir, 'posta.db'));
    db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (12, 'test@test.local', 'x')`).run();
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, media_type, tipo, week_key, source, needs_review, approval, cover_path, cover_origin, cover_pos)
      VALUES (592, 12, '/media/tira-nails-1.jpg', 'uñas 1', '', '2026-11-11T00:00:00.000Z', 'scheduled', 'image', '', '2026-11-09', 'siembra-nails-v871', 0, 'approved', '', '', 50),
      (593, 12, '/media/tira-nails-2.mp4', 'así se mueve el color', '', '2026-11-12T00:00:00.000Z', 'scheduled', 'video', '', '2026-11-09', 'siembra-nails-v871', 0, 'approved', '', '', 50),
      (594, 12, '/media/tira-nails-3.jpg', 'uñas 3', '', '2026-11-13T00:00:00.000Z', 'scheduled', 'image', '', '2026-11-09', 'siembra-nails-v871', 0, 'approved', '', '', 50)`).run();
    db.close();
    // El archivo de portada sigue en MEDIA_DIR (como en producción: 200).
    fs.copyFileSync(path.join(REL, 'public', 'siembra-nails', 'tira-nails-2-cover.jpg'),
      path.join(b.dataDir, 'media', 'tira-nails-2-cover.jpg'));
    const v = await fetch('http://127.0.0.1:' + PORT + '/api/version').then((r) => r.json());
    t('D1 /api/version v915', v.build === '20261105-v915');
    const dry = await post(PORT, '/api/admin/siembra-nails?token=test-admin-915', {});
    t('D2 siembra sin confirm: already_seeded + portada_pendiente (593)',
      dry.status === 200 && dry.j.already_seeded === true
      && dry.j.portada_pendiente && dry.j.portada_pendiente.id === 593
      && dry.j.portada_pendiente.cover_path === '/media/tira-nails-2-cover.jpg');
    const rep = await post(PORT, '/api/admin/siembra-nails?token=test-admin-915', { confirm: true });
    t('D3 siembra con confirm: portada_reparada (593)',
      rep.status === 200 && rep.j.portada_reparada && rep.j.portada_reparada.id === 593
      && rep.j.portada_reparada.cover_path === '/media/tira-nails-2-cover.jpg');
    const db2 = new DatabaseSync(path.join(b.dataDir, 'posta.db'));
    const row = db2.prepare('SELECT cover_path FROM posts WHERE id = 593').get();
    db2.close();
    t('D4 DB: 593 tiene cover_path restaurado', row && row.cover_path === '/media/tira-nails-2-cover.jpg');
    const rep2 = await post(PORT, '/api/admin/siembra-nails?token=test-admin-915', { confirm: true });
    t('D5 segunda llamada: idempotente (sin portada_reparada ni portada_pendiente)',
      rep2.status === 200 && rep2.j.already_seeded === true
      && !rep2.j.portada_reparada && !rep2.j.portada_pendiente);
    const pr = await fetch('http://127.0.0.1:' + PORT + '/prueba');
    t('D6 GET /prueba 200', pr.status === 200);
    const log = read(b.logPath);
    t('D7 boot.log sin errores', !/Error|error:|FATAL|Unhandled/i.test(log));
    console.log('  (boot node PID ' + nodePid + ')');
  } finally {
    await killBoot(b);
    t('D8 boot matado por PID exacto, puerto libre', portFree(PORT));
    fs.rmSync(b.tmp, { recursive: true, force: true });
  }
  console.log('\n=== v915: ' + pass + ' passed, ' + fail + ' failed ===');
  if (fail) { console.log('FALLOS: ' + fails.join(' | ')); process.exit(1); }
})().catch((e) => { console.error('SUITE ABORTADA:', e && e.message); process.exit(2); });
