// test-lote-preflight-1830.js — Suite del lote PREFLIGHT-1830
// (2026-11-23): el chequeo silencioso de las 18:30 (Nueva York) sobre
// los posteos de la casa programados para las 19:00.
// Actualizada por PREFLIGHT-REINTENTO-HEREDA (2026-11-23): la sección
// B pina la simulación del reintento con la herencia de
// FRENO-REINTENTO-CUPO — repin de B9/B10 y casos nuevos B15/B16.
//   A · Estática: el módulo existe, el scheduler lo registra a las
//       18:30 en America/New_York, la vía de avisos (support_cases →
//       pendientes del operador) conoce el tipo, y el gate de
//       funciones llamadas está completo.
//   B · Módulo con la noche del 22/11 sembrada: video sin faststart a
//       60 fps y sin metadata de color → aviso con las causas; cupo de
//       reels completo con un fallido de la MISMA semana → silencio de
//       cupo (el reintento hereda desde FRENO-REINTENTO-CUPO, v1270);
//       el fallido de OTRA semana y el fallido sin horario → el aviso
//       de plan_limit sigue; portada ausente → aviso; cuenta sana
//       (espejo EN) → silencio; cliente que no es la casa → ni se
//       mira; posteo fuera de la ventana de las 19:00 → ni se mira;
//       doble corrida → un solo aviso por posteo; el aviso llega a la
//       superficie del operador (pendingConcierge).
//   C · Boot real: el servidor arranca y el log anuncia el preflight.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra || ''); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- A
console.log('\nA · Estática');
{
  const pf = read('preflight-casa.js');
  const sch = read('scheduler.js');
  const sc = read('support-cases.js');
  const pg = read('plan-gate.js');
  const plans = read('config/plans.js');
  const fb = read('image-fallback.js');
  const st = read('streaks.js');
  ok('A1 el módulo exporta la corrida y los chequeos', pf.includes('runPreflightCasa') && pf.includes('defectosDeVideo') && pf.includes('defectosDeCupo') && pf.includes('defectosDePortada'));
  ok('A2 el scheduler lo registra 18:30 en America/New_York', sch.includes("cron.schedule('30 18 * * *'") && sch.includes("require('./preflight-casa').runPreflightCasa") && sch.includes("timezone: 'America/New_York'"));
  ok('A3 la casa se reconoce por la identidad de siempre (plan-gate)', pf.includes("require('./plan-gate')") && pf.includes('esCuentaDeLaCasa') && pg.includes('esCuentaDeLaCasa'));
  ok('A4 el aviso sale por support_cases con su tipo propio', pf.includes("tipo: 'preflight_casa'") && sc.includes("preflight_casa: { label: 'Preflight 19:00"));
  ok('A5 el tipo llega a los pendientes del operador', sc.includes("'prueba_linea_mano', 'prueba_retorno_dm', 'preflight_casa'"));
  ok('A6 idempotencia: dedup por posteo + día', pf.includes('preflight-casa:${post.id}:${ventana.dayKey}') || pf.includes("`preflight-casa:${post.id}:${ventana.dayKey}`"));
  const llamadas = [
    ['esCuentaDeLaCasa', pg], ['openCase', sc], ['getPlan', plans], ['TRIAL_PLAN', plans],
    ['fileExists', fb], ['mondayKeyOf', st],
  ];
  const faltan = llamadas.filter(([fn, src]) => !src.includes(fn)).map(([fn]) => fn);
  ok(`A7 gate — funciones llamadas definidas en su módulo: ${llamadas.length - faltan.length}/${llamadas.length}`, faltan.length === 0, 'faltan: ' + faltan.join(','));
  ok('A8 el chequeo de video mide faststart, códec, fps y color', pf.includes('moov') && pf.includes('mdat') && pf.includes('h264') && pf.includes('color_primaries') && pf.includes('avg_frame_rate'));
}

// ---------------------------------------------------------------- B
console.log('\nB · Módulo (la noche del 22/11, sembrada)');
const TMPB = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-mod-'));
const MEDIA = path.join(TMPB, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
process.env.DATA_DIR = TMPB;
process.env.MEDIA_DIR = MEDIA;
const db = require('./db');
const PF = require('./preflight-casa');
const supportCases = require('./support-cases');

// Fixtures de video reales (ffmpeg local, sin costo):
//  malo.mp4  = el master del 22/11: 60 fps, moov al final, sin color.
//  bueno.mp4 = la copia limpia: 30 fps, faststart, bt709.
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=720x900:rate=60', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(MEDIA, 'malo.mp4')]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=720x900:rate=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', path.join(MEDIA, 'bueno.mp4')]);
fs.writeFileSync(path.join(MEDIA, 'tapa.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

const AHORA = Date.parse('2026-11-23T23:30:00.000Z'); // lunes 18:30 en Nueva York
const H19 = '2026-11-24T00:00:00.000Z';               // las 19:00 de esa noche

function seedUser(id, email, ig, planStatus, plan) {
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(id, email, 'x');
  db.prepare('UPDATE users SET plan_status = ?, plan = ? WHERE id = ?').run(planStatus, plan, id);
  db.prepare("INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, 'Negocio', ?)").run(id, ig);
  db.prepare("INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')").run(id);
}
function seedPost(userId, over) {
  const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, scheduled_at, status, media_type, cover_path, published_at)
    VALUES (?, ?, 'caption', ?, ?, ?, ?, ?)`).run(
    userId, over.image || '/media/bueno.mp4', over.at, over.status || 'scheduled',
    over.tipo || 'video', over.cover != null ? over.cover : '/media/tapa.jpg', over.pub || null);
  return Number(r.lastInsertRowid);
}

(async () => {
  // Las fixtures mismas tienen (y no tienen) lo que la suite les pide.
  const cajasMalo = await PF._internos.leerCajasMp4(path.join(MEDIA, 'malo.mp4'));
  const cajasBueno = await PF._internos.leerCajasMp4(path.join(MEDIA, 'bueno.mp4'));
  const idx = (cs, t) => cs.findIndex(c => c.type === t);
  ok('B1 fixture mala: moov DESPUÉS de mdat (sin faststart)', idx(cajasMalo, 'moov') > idx(cajasMalo, 'mdat') && idx(cajasMalo, 'mdat') !== -1);
  ok('B2 fixture buena: moov ANTES de mdat (faststart)', idx(cajasBueno, 'moov') !== -1 && (idx(cajasBueno, 'mdat') === -1 || idx(cajasBueno, 'moov') < idx(cajasBueno, 'mdat')));
  const defMalo = await PF._internos.defectosDeVideo({ id: 1, image_path: '/media/malo.mp4' }, path.join(MEDIA, 'malo.mp4'), MEDIA);
  ok('B3 la fixture mala junta los 3 defectos del 22/11', defMalo.some(d => d.includes('faststart')) && defMalo.some(d => d.includes('60 fps')) && defMalo.some(d => d.includes('metadata de color')), JSON.stringify(defMalo));
  const defBueno = await PF._internos.defectosDeVideo({ id: 2, image_path: '/media/bueno.mp4' }, path.join(MEDIA, 'bueno.mp4'), MEDIA);
  ok('B4 la fixture buena no tiene ningún defecto de video', defBueno.length === 0, JSON.stringify(defBueno));

  // La casa ES (usuario 12, trial → Esencial: 1 reel/semana).
  seedUser(12, 'casa@posty.test', 'posty.communitymanager', 'trial', 'esencial');
  const pub695 = seedPost(12, { at: '2026-11-23T15:00:00.000Z', status: 'published', pub: '2026-11-23T15:00:00.000Z' });
  const fallido = seedPost(12, { at: '2026-11-23T16:00:00.000Z', status: 'failed' });
  // (PREFLIGHT-REINTENTO-HEREDA) El fallido de OTRA semana (miércoles
  // 18/11, semana del lunes 16/11): su reintento por publish-now se
  // cobra contra ESTA semana — si está completa, rebota de verdad.
  const fallidoOtraSemana = seedPost(12, { at: '2026-11-18T16:00:00.000Z', status: 'failed' });
  // Y el fallido SIN horario guardado: publish-now lo cobra como nuevo
  // (la herencia exige scheduled_at) — también rebota con la semana llena.
  const fallidoSinHorario = seedPost(12, { at: null, status: 'failed' });
  const malo19 = seedPost(12, { at: H19, image: '/media/malo.mp4', cover: '' });
  const bueno19 = seedPost(12, { at: '2026-11-24T00:30:00.000Z' });
  // La casa EN (espejo, sana): plan Total, semana vacía, pieza limpia.
  seedUser(21, 'casa-en@posty.test', 'postycommunitymanager', 'active', 'total');
  const sano19 = seedPost(21, { at: '2026-11-24T00:15:00.000Z' });
  const fuera19 = seedPost(21, { at: '2026-11-24T01:30:00.000Z', image: '/media/malo.mp4', cover: '' }); // 20:30 NY: fuera de la ventana
  // Un cliente cualquiera con la pieza mala a las 19:00: ni se mira.
  seedUser(31, 'cliente@test', 'un-cliente', 'active', 'total');
  const cliente19 = seedPost(31, { at: H19, image: '/media/malo.mp4', cover: '' });

  const r1 = await PF.runPreflightCasa(db, { nowMs: AHORA, mediaDir: MEDIA, log: () => {} });
  ok('B5 revisó solo los posteos de la casa en la ventana de las 19:00', r1.revisados === 3, JSON.stringify(r1));
  ok('B6 dos con defectos, dos casos abiertos', r1.con_defectos === 2 && r1.casos === 2, JSON.stringify(r1));
  const casos = db.prepare("SELECT * FROM support_cases WHERE tipo = 'preflight_casa' ORDER BY post_id ASC").all();
  const casoMalo = casos.find(c => c.post_id === malo19);
  const casoBueno = casos.find(c => c.post_id === bueno19);
  ok('B7 el posteo malo tiene su caso con las causas del video', !!casoMalo && casoMalo.detalle.includes('faststart') && casoMalo.detalle.includes('60 fps') && casoMalo.detalle.includes('metadata de color'), casoMalo ? casoMalo.detalle : 'sin caso');
  ok('B8 el posteo malo también avisa la portada ausente', !!casoMalo && casoMalo.detalle.includes('no tiene portada'), casoMalo ? casoMalo.detalle : 'sin caso');
  ok('B9 (repin PREFLIGHT-REINTENTO-HEREDA) el posteo bueno avisa SOLO el cupo: rebota el reintento del fallido que NO hereda (plan_limit)', !!casoBueno && casoBueno.detalle.includes('plan_limit') && !casoBueno.detalle.includes('faststart'), casoBueno ? casoBueno.detalle : 'sin caso');
  ok('B10 (repin) el aviso nombra al fallido de OTRA semana y NO al de la misma semana: el de la misma semana hereda y su reintento ya no rebota', !!casoBueno && casoBueno.detalle.includes(`El posteo ${fallidoOtraSemana} quedó fallido`) && casoBueno.detalle.includes('no hereda') && !casoBueno.detalle.includes(`El posteo ${fallido} quedó fallido`), casoBueno ? casoBueno.detalle : 'sin caso');
  ok('B15 el fallido sin horario tampoco hereda: su reintento se cobra como nuevo y el aviso lo nombra', !!casoBueno && casoBueno.detalle.includes(`El posteo ${fallidoSinHorario} quedó fallido`) && casoBueno.detalle.includes('se cobra como nuevo'), casoBueno ? casoBueno.detalle : 'sin caso');
  ok('B16 el posteo de esta noche ya no se avisa a sí mismo: si falla, su reintento hereda dentro de su semana', !!casoBueno && !casoBueno.detalle.includes('falla esta noche'), casoBueno ? casoBueno.detalle : 'sin caso');
  ok('B11 la cuenta sana (EN) no generó ningún caso: silencio', !casos.some(c => c.post_id === sano19));
  ok('B12 el posteo fuera de la ventana (20:30) no se revisó', !casos.some(c => c.post_id === fuera19));
  ok('B13 el cliente que no es la casa no generó ningún caso', !casos.some(c => c.post_id === cliente19));

  const r2 = await PF.runPreflightCasa(db, { nowMs: AHORA, mediaDir: MEDIA, log: () => {} });
  const casos2 = db.prepare("SELECT COUNT(*) AS n FROM support_cases WHERE tipo = 'preflight_casa'").get();
  ok('B14 doble corrida: un solo aviso por posteo (idempotente)', casos2.n === 2 && r2.duplicados === 2 && r2.casos === 0, JSON.stringify(r2));

  // (La llegada a la superficie del operador se verifica en C, contra
  // el servidor booteado: pendingConcierge lee columnas que agrega la
  // migración de arranque del server, no el esquema pelado de db.js.)

  // -------------------------------------------------------------- C
  console.log('\nC · Boot real');
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-boot-'));
  const port = 18777 + (process.pid % 300); // único por corrida: un boot huérfano jamás contesta por este
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT, detached: true,
    env: { ...process.env, PORT: String(port), DATA_DIR: dirC, MEDIA_DIR: path.join(dirC, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logBoot = '';
  proc.stdout.on('data', d => { logBoot += d; });
  proc.stderr.on('data', d => { logBoot += d; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
  ok('C1 el servidor arranca con el lote', up);
  ok('C2 el boot anuncia el preflight de las 18:30 (Nueva York)', logBoot.includes('[posta] Preflight de la casa: 18:30 (Nueva York)'));
  // La vía completa, como en producción: se siembra la noche en la DB
  // del boot, corre el preflight y el aviso tiene que aparecer en la
  // superficie que vigila el monitor del operador.
  if (up) {
    const mediaBoot = path.join(dirC, 'media');
    fs.mkdirSync(mediaBoot, { recursive: true });
    fs.copyFileSync(path.join(MEDIA, 'malo.mp4'), path.join(mediaBoot, 'malo.mp4'));
    fs.copyFileSync(path.join(MEDIA, 'tapa.jpg'), path.join(mediaBoot, 'tapa.jpg'));
    const { DatabaseSync } = require('node:sqlite');
    const dbBoot = new DatabaseSync(path.join(dirC, 'posta.db'));
    dbBoot.prepare('INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (12, ?, ?)').run('casa-boot@posty.test', 'x');
    dbBoot.prepare("UPDATE users SET plan_status = 'trial', plan = 'esencial' WHERE id = 12").run();
    dbBoot.prepare("INSERT OR REPLACE INTO profiles (user_id, business_name, ig_username) VALUES (12, 'Posty', 'posty.communitymanager')").run();
    dbBoot.prepare("INSERT OR IGNORE INTO settings (user_id, timezone) VALUES (12, 'America/New_York')").run();
    dbBoot.prepare("UPDATE settings SET timezone = 'America/New_York' WHERE user_id = 12").run();
    const rp = dbBoot.prepare(`INSERT INTO posts (user_id, image_path, caption, scheduled_at, status, media_type, cover_path)
      VALUES (12, '/media/malo.mp4', 'la película', ?, 'scheduled', 'video', '')`).run(H19);
    const postBoot = Number(rp.lastInsertRowid);
    const rb = await PF.runPreflightCasa(dbBoot, { nowMs: AHORA, mediaDir: mediaBoot, log: () => {} });
    const casoBoot = dbBoot.prepare("SELECT * FROM support_cases WHERE tipo = 'preflight_casa' AND post_id = ?").get(postBoot);
    ok('C3 el preflight corre contra la DB del boot y abre el caso', rb.casos === 1 && !!casoBoot, JSON.stringify(rb));
    const qsPend = new URLSearchParams({ token: 'tok-admin-prueba' });
    const pend = await (await fetch(base + '/api/admin/support/conserje/pendientes?' + qsPend.toString())).json();
    const entrada = (pend.pendientes || []).find(p => p.caso_id === (casoBoot && casoBoot.id));
    ok('C4 el aviso aparece en los pendientes del operador, con su causa', !!entrada && String(entrada.ultimo_mensaje || '').includes('Preflight 19:00'), JSON.stringify(pend).slice(0, 300));
    try { dbBoot.close(); } catch (e) {}
  }
  try { process.kill(-proc.pid, 'SIGTERM'); } catch (e) {}
  await sleep(500);
  try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) {}

  console.log(`\n== PREFLIGHT-1830: ${pass} ok · ${fail} MAL ==`);
  if (fails.length) { console.log('Fallaron:'); for (const f of fails) console.log('  -', f); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
