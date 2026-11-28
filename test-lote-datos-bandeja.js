'use strict';

// =====================================================================
// LOTE CONSERJE-DATOS-BANDEJA — suite del lote (censo-conserje-3 §5.3)
// =====================================================================
// Los dos campos que le faltaban a la tira de hoy de la consola:
//   (a) vista.hoy.preflight — el resumen de la ÚLTIMA corrida del
//       preflight de la casa, persistido por la propia corrida
//       (preflight_casa_resumen, una fila). Sano → estado 'sano' (la
//       línea verde); con defectos → estado 'con_defectos' con las
//       causas literales (la roja). Sin corrida, el campo NO existe:
//       nada inventado.
//   (b) vista.hoy.impulsos_activos — los impulsos en curso de la
//       cartera desde ad_boosts (status 'active'), la casa primero,
//       con presupuesto, gasto (last_spend_cents) y día X de Y (la
//       cuenta de ADS-STATS). Las visitas al perfil salen solo si la
//       columna last_visitas_perfil existe y trae número. Un impulso
//       terminado (o en error) NO aparece.
// Uso: node test-lote-datos-bandeja.js — sale 0 si pasa.
// =====================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }

const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };

// ---------------------------------------------------------------------
seccion('A · estática del lote');
{
  const dbSrc = read('db.js');
  const pfSrc = read('preflight-casa.js');
  const vistaSrc = read('conserje-vista.js');
  t('A1 db.js declara la tabla de una fila del resumen', dbSrc.includes('CREATE TABLE IF NOT EXISTS preflight_casa_resumen'));
  t('A2 la corrida persiste su resumen y el módulo expone el lector',
    pfSrc.includes('persistirResumen(db, resumen, nowMs)') && pfSrc.includes('ultimoResumenPreflight') && pfSrc.includes('ON CONFLICT(id) DO UPDATE'));
  t('A3 el resumen junta las causas literales de los defectos', pfSrc.includes('resumen.causas.push'));
  t('A4 la vista expone preflight solo con corrida real',
    vistaSrc.includes('preflightDeLaVista') && vistaSrc.includes('if (pf) out.preflight = pf'));
  t('A5 impulsos: solo en curso, con la guarda de esquema de visitas',
    vistaSrc.includes('impulsos_activos') && vistaSrc.includes("WHERE b.status = 'active'") && vistaSrc.includes("PRAGMA table_info(ad_boosts)") && vistaSrc.includes('last_visitas_perfil'));
  t('A6 el día X de Y reusa la cuenta de ADS-STATS', vistaSrc.includes("require('./ads-stats').diaDe"));
  for (const f of ['db.js', 'preflight-casa.js', 'conserje-vista.js']) {
    const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
    t('A7 node --check ' + f, r.status === 0, (r.stderr || '').slice(0, 200));
  }
}

// ---------------------------------------------------------------------
seccion('B · módulo — preflight que persiste + impulsos de la cartera');
const TMPB = fs.mkdtempSync(path.join(os.tmpdir(), 'datos-bandeja-mod-'));
const MEDIA = path.join(TMPB, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
process.env.DATA_DIR = TMPB;
process.env.MEDIA_DIR = MEDIA;
const db = require('./db');
const PF = require('./preflight-casa');
const cv = require('./conserje-vista');

// Fixtures de video (las mismas de la suite del preflight):
//  bueno.mp4 = 30 fps, faststart, bt709 · malo.mp4 = 60 fps, moov al
//  final, sin metadata de color (el master del 22/11).
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=720x900:rate=60', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(MEDIA, 'malo.mp4')]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=720x900:rate=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', path.join(MEDIA, 'bueno.mp4')]);
fs.writeFileSync(path.join(MEDIA, 'tapa.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

const AHORA = Date.parse('2026-11-23T23:30:00.000Z'); // lunes 18:30 en Nueva York
const H19 = '2026-11-24T00:00:00.000Z';               // las 19:00 de esa noche
const VISTA_NOW = Date.parse('2026-11-27T15:00:00.000Z'); // el reloj de la vista para el día del impulso

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
function seedBoost(over) {
  const r = db.prepare(`INSERT INTO ad_boosts (user_id, post_id, budget_cents, fee_cents, currency, status,
      duration_days, last_spend_cents, last_visitas_perfil, started_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    over.user, over.post || null, over.budget, over.fee || 0, over.moneda || 'USD', over.status || 'active',
    over.dias || 7, over.gasto || 0, over.visitas !== undefined ? over.visitas : null,
    over.desde || null, over.desde || null);
  return Number(r.lastInsertRowid);
}

(async () => {
  // La casa (12) con su posteo sano de las 19:00 y un cliente pago (31).
  seedUser(12, 'casa@posty.test', 'posty.communitymanager', 'trial', 'esencial');
  seedUser(31, 'cliente@real.test', 'un-cliente', 'active', 'total');
  const postSano = seedPost(12, { at: H19 });

  // Impulsos: el de la casa activo (día 2 de 7 al reloj de la vista,
  // US$ 5,70 de US$ 20, 312 visitas), el del cliente activo sin stat
  // de visitas (null), uno TERMINADO y uno en ERROR (fósiles).
  const boostCasa = seedBoost({ user: 12, post: postSano, budget: 2000, gasto: 570, visitas: 312, desde: '2026-11-26T15:00:00.000Z' });
  const boostCliente = seedBoost({ user: 31, budget: 5000, gasto: 0, visitas: null, desde: '2026-11-27T15:00:00.000Z' });
  seedBoost({ user: 12, budget: 2000, gasto: 2000, visitas: 900, status: 'completed', desde: '2026-11-19T15:00:00.000Z' });
  seedBoost({ user: 31, budget: 3000, gasto: 0, status: 'error', desde: '2026-11-27T15:00:00.000Z' });

  // --- sin corrida: el campo preflight no existe; los impulsos sí ---
  const v0 = cv.vista(db, { nowMs: VISTA_NOW });
  t('B1 sin corrida de preflight, vista.hoy NO trae el campo', !('preflight' in v0.hoy));
  t('B2 el lector devuelve null sin corrida', PF.ultimoResumenPreflight(db) === null);
  const lista0 = v0.hoy.impulsos_activos;
  t('B3 impulsos_activos es una lista con solo los en curso', Array.isArray(lista0) && lista0.length === 2,
    'largo=' + (lista0 && lista0.length));
  const ic = (lista0 || []).find((x) => x.boost_id === boostCasa);
  const icl = (lista0 || []).find((x) => x.boost_id === boostCliente);
  t('B4 la casa va primera en la lista', !!lista0 && lista0[0] && lista0[0].boost_id === boostCasa && lista0[0].es_casa === true);
  t('B5 impulso de la casa: presupuesto y gasto exactos',
    !!ic && ic.presupuesto_cents === 2000 && ic.gasto_cents === 570 && ic.moneda === 'USD',
    ic && JSON.stringify({ p: ic.presupuesto_cents, g: ic.gasto_cents }));
  t('B6 impulso de la casa: día 2 de 7 contra started_at sembrado',
    !!ic && ic.dia === 2 && ic.dias_total === 7, ic && ('dia=' + ic.dia + '/' + ic.dias_total));
  t('B7 visitas al perfil con número real: salen', !!ic && ic.visitas_perfil === 312, ic && ('v=' + ic.visitas_perfil));
  t('B8 visitas en null (Meta no reportó): el campo no sale',
    !!icl && !('visitas_perfil' in icl));
  t('B9 el terminado y el de error quedan fuera', !!lista0 && lista0.every((x) => x.boost_id === boostCasa || x.boost_id === boostCliente));

  // --- corrida sana: persiste y la vista pinta la línea verde ---
  const r1 = await PF.runPreflightCasa(db, { nowMs: AHORA, mediaDir: MEDIA, log: () => {} });
  t('B10 corrida sana: 1 revisado, 0 con defectos', r1.revisados === 1 && r1.con_defectos === 0,
    JSON.stringify({ r: r1.revisados, d: r1.con_defectos }));
  const fila1 = db.prepare('SELECT * FROM preflight_casa_resumen WHERE id = 1').get();
  t('B11 el resumen quedó persistido con su hora y su ventana',
    !!fila1 && fila1.revisados === 1 && fila1.con_defectos === 0 && fila1.ventana === '2026-11-23'
      && fila1.corrida_at === new Date(AHORA).toISOString(),
    fila1 && JSON.stringify(fila1));
  const v1 = cv.vista(db, { nowMs: AHORA });
  t('B12 la vista pinta la corrida sana (la línea verde)',
    !!v1.hoy.preflight && v1.hoy.preflight.estado === 'sano' && v1.hoy.preflight.revisados === 1
      && v1.hoy.preflight.con_defectos === 0 && Array.isArray(v1.hoy.preflight.causas) && v1.hoy.preflight.causas.length === 0,
    v1.hoy.preflight && JSON.stringify(v1.hoy.preflight));

  // --- corrida con defecto: la misma fila se pisa y la línea se pone roja con su causa ---
  seedPost(12, { at: H19, image: '/media/malo.mp4', cover: '' });
  const r2 = await PF.runPreflightCasa(db, { nowMs: AHORA, mediaDir: MEDIA, log: () => {} });
  t('B13 corrida con defecto: 2 revisados, 1 con defectos', r2.revisados === 2 && r2.con_defectos === 1,
    JSON.stringify({ r: r2.revisados, d: r2.con_defectos }));
  const filasResumen = db.prepare('SELECT COUNT(*) AS c FROM preflight_casa_resumen').get();
  t('B14 sigue siendo UNA fila: la última corrida pisa a la anterior', filasResumen.c === 1);
  const v2 = cv.vista(db, { nowMs: AHORA });
  t('B15 la vista pinta la roja CON su causa literal',
    !!v2.hoy.preflight && v2.hoy.preflight.estado === 'con_defectos' && v2.hoy.preflight.con_defectos === 1
      && v2.hoy.preflight.causas.some((c) => c.includes('faststart')),
    v2.hoy.preflight && JSON.stringify(v2.hoy.preflight).slice(0, 300));

  console.log('— C) cliente: la consola pinta los dos datos (suma del liberador) —');
  {
    const cj = fs.readFileSync(path.join(__dirname, 'public/conserje.js'), 'utf8');
    const ch = fs.readFileSync(path.join(__dirname, 'public/conserje.html'), 'utf8');
    t('C1 conserje.js consume hoy.preflight y hoy.impulsos_activos', cj.includes('h.preflight') && cj.includes('h.impulsos_activos') && cj.includes('datosBandejaHtml'));
    t('C2 la franja de escritorio existe y el render la llama', ch.includes('id="pfWrap"') && cj.includes('renderDatosBandeja()'));
    t('C3 sello conserje.js?v=27', ch.includes('/conserje.js?v=27'));
  }

  console.log(`\nDATOS-BANDEJA: ${ok} ok, ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN', e); process.exit(1); });
