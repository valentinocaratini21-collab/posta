// test-lote-integridad-prepublicacion.js — LOTE INTEGRIDAD-PRE-PUBLICACIÓN
// (orden permanente de Valentino 15/11: «No puede volver a suceder esto»).
//
// Ejercita los TRES casos de la noche como fixtures, contra el código
// real del lote:
//   · NOCHE-658 — un duplicado agendado de una pieza ya publicada:
//     frenado por el chequeo (huella de imagen idéntica, caption
//     DISTINTO: el caption no es identidad) y frenado en el scheduler
//     ANTES de salir (publishSinglePost no llega a Instagram), también
//     con opts.house (el caso fue en la cuenta de la casa).
//   · NOCHE-582 — un registro cuyo puntero a Instagram es la
//     publicación ARCHIVADA: frenado por la proyección (ig_state =
//     'archived_ext', la marca del feed-reconcile, sin llamadas
//     nuevas); y el puntero de OTRA pieza (puntero_ajeno).
//   · SANO — un posteo sano pasa sin fricción: el chequeo lo deja ok
//     y el scheduler lo publica (Instagram stubbeado).
// Más: la gemela/historia queda fuera del juicio (comparte la imagen
// de su madre por diseño) · sin archivo no hay veredicto (fail-open)
// · el freno abre UN caso en el conserje (dedup) y deja la fila
// 'paused' con el motivo honesto · pines estáticos de los ganchos
// (scheduler, proyección /api/posts, carta del próximo y detalle de
// Hoy en app.js, tipo de caso en support-cases).
//
// Uso: node test-lote-integridad-prepublicacion.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- utilidades ----------
const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'int-media-'));
function writeMedia(name, bytes) { fs.writeFileSync(path.join(mediaDir, name), bytes); return '/media/' + name; }
process.env.MEDIA_DIR = mediaDir;
process.env.PUBLISH_DAILY_CAP = '50';

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, plan_status TEXT DEFAULT 'active', trial_ends_at TEXT, trial_extended_until TEXT, created_at TEXT DEFAULT '2026-10-01 00:00:00', first_post_at TEXT, trial_pause_notified INTEGER DEFAULT 0, email TEXT DEFAULT 'u@test.dev', name TEXT DEFAULT 'Test', email_opt_out INTEGER DEFAULT 0, publishing_stopped INTEGER DEFAULT 0, is_guest INTEGER DEFAULT 0);
    CREATE TABLE settings (user_id INTEGER PRIMARY KEY, demo_mode INTEGER DEFAULT 0, image_base_url TEXT DEFAULT '', ig_user_id TEXT DEFAULT 'ig1', ig_access_token TEXT DEFAULT 'tok', ig_token_warning INTEGER DEFAULT 0);
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT, caption TEXT DEFAULT 'cap', hashtags TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'approved', notified INTEGER DEFAULT 0, notify_at TEXT, media_type TEXT DEFAULT 'image', carousel_paths TEXT DEFAULT '', needs_review INTEGER DEFAULT 0, source TEXT DEFAULT '', tipo TEXT DEFAULT 'foto', error TEXT DEFAULT '', ig_permalink TEXT DEFAULT '', ig_media_id TEXT DEFAULT '', ig_state TEXT DEFAULT '', published_at TEXT, created_at TEXT DEFAULT '2026-11-01 00:00:00', win_celebrated INTEGER DEFAULT 0, user_stopped INTEGER DEFAULT 0);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT);
    CREATE TABLE post_signals (user_id INTEGER, post_id INTEGER, hashtags TEXT, scheduled_for TEXT, rubro TEXT, client_signal TEXT, week_key TEXT, auto_signal INTEGER);
    CREATE TABLE profiles (user_id INTEGER, category TEXT DEFAULT '');
    CREATE TABLE funnel_events (user_id INTEGER, event TEXT);
  `);
  db.prepare('INSERT INTO users (id) VALUES (12)').run();
  db.prepare('INSERT INTO settings (user_id, demo_mode) VALUES (12, 0)').run();
  try { require('./support-cases').ensureSchema(db); } catch (e) {}
  try { require('./publish-guard').ensureSchema(db); } catch (e) {}
  return db;
}
function mkPost(db, over) {
  const o = over || {};
  const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, scheduled_at, status, approval, media_type, source, ig_permalink, ig_media_id, ig_state, published_at)
    VALUES (12, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)`).run(
    o.img || '', o.caption || 'cap', o.at || null, o.status || 'scheduled',
    o.media_type || 'image', o.source || '', o.permalink || '', o.media_id || '', o.ig_state || '', o.published_at || null);
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(r.lastInsertRowid));
}

// ---------- carga del módulo del lote ----------
let integ = null;
try { integ = require('./integridad-prepublicacion'); } catch (e) { integ = null; }
check('el módulo integridad-prepublicacion.js existe y carga', !!integ);

async function main() {
  if (integ) {
    // ================= A · EL VEREDICTO (fixtures de la noche) =================
    const db = freshDb();
    const imgX = writeMedia('pub-649.jpg', 'BYTES-DE-LA-PIEZA-DEL-649');
    writeMedia('sched-658.jpg', 'BYTES-DE-LA-PIEZA-DEL-649'); // mismos bytes, otro path
    writeMedia('sched-distinta.jpg', 'BYTES-OTRA-PIEZA');
    writeMedia('sched-sana.jpg', 'BYTES-PIEZA-SANA');

    // El publicado 649 (fixture): imagen X, caption de pastelería.
    const p649 = mkPost(db, { img: imgX, status: 'published', published_at: '2026-11-13 22:00:00', permalink: 'https://www.instagram.com/p/Dfs3kIPD-cO/', media_id: 'M649', ig_state: 'live', caption: 'Así queda un posteo de pastelería cuando lo hace posty. La foto, el brillo, el caption: todo listo' });

    // NOCHE-658: agendado con la MISMA imagen y caption DISTINTO.
    const p658 = mkPost(db, { img: '/media/sched-658.jpg', status: 'scheduled', at: '2026-11-17 00:00:00', caption: 'Ese momento en que mirás tu Instagram y solo ves un vacío… Así queda un posteo de pastelería cuando lo hace…' });
    const v658 = integ.chequeoIntegridad(db, p658, { mediaDir });
    check('NOCHE-658 · el duplicado frena por huella de imagen (caption distinto)', v658.ok === false && v658.motivo === 'duplicado', JSON.stringify(v658));
    check('NOCHE-658 · el veredicto nombra al publicado contra el que choca (649)', Number(v658.contra_id) === Number(p649.id));

    // NOCHE-658 variante: mismo image_path que el publicado.
    const p658b = mkPost(db, { img: imgX, status: 'scheduled', at: '2026-11-18 00:00:00', caption: 'otro caption' });
    const v658b = integ.chequeoIntegridad(db, p658b, { mediaDir });
    check('NOCHE-658 · el duplicado por mismo archivo también frena', v658b.ok === false && v658b.motivo === 'duplicado');

    // El caption NO es identidad: otra pieza con la misma apertura de caption pasa.
    const pCap = mkPost(db, { img: '/media/sched-distinta.jpg', status: 'scheduled', at: '2026-11-19 00:00:00', caption: 'Ese momento en que mirás tu Instagram y solo ves un vacío… (pieza distinta)' });
    const vCap = integ.chequeoIntegridad(db, pCap, { mediaDir });
    check('la apertura de caption repetida NO frena una pieza distinta', vCap.ok === true, JSON.stringify(vCap));

    // La gemela / historia comparte la imagen de su madre POR DISEÑO: fuera del juicio.
    const pTwin = mkPost(db, { img: '/media/sched-658.jpg', status: 'scheduled', at: '2026-11-17 01:00:00', media_type: 'story', source: 'twin' });
    const vTwin = integ.chequeoIntegridad(db, pTwin, { mediaDir });
    check('la historia gemela (misma imagen, por diseño) no frena', vTwin.ok === true, JSON.stringify(vTwin));

    // NOCHE-582: publicado cuyo puntero es la publicación archivada.
    const p582 = mkPost(db, { img: '/media/sched-distinta.jpg', status: 'published', published_at: '2026-11-15 22:00:00', permalink: 'https://www.instagram.com/p/DfyBJ5qGSJw/', media_id: '17984778609132799', ig_state: 'archived_ext', caption: 'medialuna' });
    const v582 = integ.chequeoIntegridad(db, p582, { mediaDir });
    check('NOCHE-582 · el puntero archivado frena (marca archived_ext del reconcile)', v582.ok === false && v582.motivo === 'puntero_archivado', JSON.stringify(v582));

    // Puntero ajeno: un agendado trae el media_id de un publicado.
    const pAjeno = mkPost(db, { img: '/media/sched-sana.jpg', status: 'scheduled', at: '2026-11-20 00:00:00', media_id: 'M649', permalink: 'https://www.instagram.com/p/Dfs3kIPD-cO/' });
    const vAjeno = integ.chequeoIntegridad(db, pAjeno, { mediaDir });
    check('el puntero de otra pieza frena al agendado que lo trae', vAjeno.ok === false && vAjeno.motivo === 'puntero_ajeno' && Number(vAjeno.contra_id) === Number(p649.id), JSON.stringify(vAjeno));

    // SANO: agendado con imagen propia y sin puntero pasa; publicado con puntero vivo y único pasa.
    const pSano = mkPost(db, { img: '/media/sched-sana.jpg', status: 'scheduled', at: '2026-11-21 00:00:00', caption: 'pieza sana' });
    check('SANO · el agendado sano pasa sin fricción', integ.chequeoIntegridad(db, pSano, { mediaDir }).ok === true);
    check('SANO · el publicado con puntero vivo y único pasa', integ.chequeoIntegridad(db, p649, { mediaDir }).ok === true);

    // Sin archivo no hay veredicto (fail-open, la regla del reconcile).
    const pSinArch = mkPost(db, { img: '/media/no-existe-esta.jpg', status: 'scheduled', at: '2026-11-22 00:00:00' });
    check('sin archivo legible no hay veredicto (no se frena sin prueba)', integ.chequeoIntegridad(db, pSinArch, { mediaDir }).ok === true);

    // El freno: fila pausada con motivo honesto + UN caso en el conserje (dedup).
    integ.frenarPosteo(db, p658, v658);
    const row658 = db.prepare('SELECT status, error FROM posts WHERE id = ?').get(p658.id);
    check('el freno deja la fila pausada con el motivo honesto', row658.status === 'paused' && /frenó/.test(row658.error || ''), JSON.stringify(row658));
    const casos1 = db.prepare("SELECT * FROM support_cases WHERE tipo = 'integridad_prepublicacion'").all();
    check('el freno abre el caso en el conserje con el motivo', casos1.length === 1 && Number(casos1[0].post_id) === Number(p658.id) && /duplicado/i.test((casos1[0].titulo || '') + ' ' + (casos1[0].detalle || '')), JSON.stringify(casos1.map((c) => c.tipo)));
    integ.avisoIntegridad(db, p658, v658);
    const casos2 = db.prepare("SELECT * FROM support_cases WHERE tipo = 'integridad_prepublicacion'").all();
    check('el aviso repetido no duplica el caso (dedup posteo+motivo)', casos2.length === 1);

    // ================= B · EL GANCHO DEL SCHEDULER =================
    // Instagram stubbeado por require.cache ANTES de cargar scheduler
    // (el patrón de test-publish-guard.js).
    const igCalls = [];
    const igPath = require.resolve('./instagram.js');
    require.cache[igPath] = { id: igPath, filename: igPath, loaded: true, exports: {
      publishPost: async () => { igCalls.push('post'); return { success: true, permalink: 'https://instagram.com/p/sano', mediaId: 'm-sano' }; },
      publishVideo: async () => { igCalls.push('video'); return { success: true, permalink: 'https://instagram.com/p/sano', mediaId: 'm-sano' }; },
      publishStory: async () => { igCalls.push('story'); return { success: true, permalink: '', mediaId: 'm-sano' }; },
      publishCarousel: async () => { igCalls.push('carousel'); return { success: true, permalink: 'https://instagram.com/p/sano', mediaId: 'm-sano' }; },
    } };
    global.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, body: null });
    // node-cron es la única dependencia externa del cierre que carga
    // scheduler.js y la suite no ejercita cron: si el árbol no trae
    // node_modules, se stubbea el módulo (schedule nunca se invoca:
    // publishSinglePost es la puerta que se prueba).
    try { require.resolve('node-cron'); } catch (e) {
      const Module = require('module');
      const origLoad = Module._load;
      Module._load = function (req) {
        if (req === 'node-cron') return { schedule: () => ({ start() {}, stop() {} }), validate: () => true };
        return origLoad.apply(this, arguments);
      };
    }
    const schedPath = require.resolve('./scheduler.js');
    delete require.cache[schedPath];
    const scheduler = require('./scheduler.js');

    const db2 = freshDb();
    const pubB = mkPost(db2, { img: imgX, status: 'published', published_at: '2026-11-13 22:00:00', permalink: 'https://www.instagram.com/p/Dfs3kIPD-cO/', media_id: 'M649', ig_state: 'live' });
    const dupB = mkPost(db2, { img: '/media/sched-658.jpg', status: 'scheduled', at: '2026-11-17 00:00:00', caption: 'caption distinto al publicado' });
    const antes = igCalls.length;
    const rDup = await scheduler.publishSinglePost(db2, dupB);
    check('SCHEDULER · el duplicado frena ANTES de salir (blocked integridad)', !!rDup && rDup.blocked === 'integridad' && rDup.motivo === 'duplicado', JSON.stringify(rDup));
    check('SCHEDULER · Instagram nunca fue llamado para el duplicado', igCalls.length === antes);
    const rowDup = db2.prepare('SELECT status FROM posts WHERE id = ?').get(dupB.id);
    check('SCHEDULER · la fila del duplicado queda pausada, no publicada', rowDup.status === 'paused', rowDup.status);

    const dupHouse = mkPost(db2, { img: '/media/sched-658.jpg', status: 'scheduled', at: '2026-11-17 00:00:00', caption: 'casa' });
    const rHouse = await scheduler.publishSinglePost(db2, dupHouse, { house: true });
    check('SCHEDULER · la cuenta de la casa (opts.house) también frena', !!rHouse && rHouse.blocked === 'integridad', JSON.stringify(rHouse));

    const sanoB = mkPost(db2, { img: '/media/sched-sana.jpg', status: 'scheduled', at: '2026-11-21 00:00:00', caption: 'sana' });
    const rSano = await scheduler.publishSinglePost(db2, sanoB);
    const rowSano = db2.prepare('SELECT status FROM posts WHERE id = ?').get(sanoB.id);
    check('SCHEDULER · el posteo sano SÍ sale (sin fricción)', !!rSano && !rSano.blocked && rowSano.status === 'published', JSON.stringify({ r: rSano, st: rowSano.status }));
    check('SCHEDULER · Instagram fue llamado una vez para el sano', igCalls.length === antes + 1, String(igCalls.length));
  }

  // ================= C · PINES ESTÁTICOS DE LOS GANCHOS =================
  const sched = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');
  const iHook = sched.indexOf("blocked: 'integridad'");
  const iDemo = sched.indexOf('if (!demoMode)');
  check('PIN · scheduler: el gancho de integridad existe y corre antes del bloque demoMode', iHook > 0 && (iDemo < 0 || iHook < iDemo));
  check('PIN · scheduler: el gancho usa el módulo y frena la fila', sched.includes("require('./integridad-prepublicacion')") && sched.includes('frenarPosteo'));

  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const iPosts = srv.indexOf("app.get('/api/posts'");
  const iFreno = srv.indexOf('integridad_freno', iPosts);
  const iRes = srv.indexOf('res.json(rows)', iPosts);
  check('PIN · server: /api/posts anota integridad_freno antes de responder', iPosts > 0 && iFreno > iPosts && iRes > iFreno);
  check('PIN · server: la proyección abre el caso con avisoIntegridad', srv.slice(iPosts, iRes).includes('avisoIntegridad'));

  const sc = fs.readFileSync(path.join(__dirname, 'support-cases.js'), 'utf8');
  check('PIN · support-cases: existe el tipo de caso integridad_prepublicacion', /integridad_prepublicacion:\s*\{\s*label:/.test(sc));

  const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  const pickers = (app.match(/p\.integridad_freno\) continue;/g) || []).length;
  check('PIN · app.js: los dos selectores del próximo saltan la fila frenada', pickers >= 2, String(pickers));
  check('PIN · app.js: el detalle de Hoy rinde el estado Frenado con el motivo', app.includes('p.integridad_freno') && app.includes('Posty frenó este posteo') && app.includes("'On hold' : 'Frenado'"));

  console.log(`\n=== LOTE INTEGRIDAD-PRE-PUBLICACIÓN: ${pass} ok · ${fail} mal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('suite error:', e); process.exit(1); });
