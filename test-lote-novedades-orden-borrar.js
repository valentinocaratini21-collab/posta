// test-lote-novedades-orden-borrar.js — Suite del lote
// NOVEDADES-ORDEN-BORRAR (2026-11-23): la sección NOVEDADES de
// Notificaciones ordenada por el reloj y barrida a mano.
// El defecto (captura del dueño, 23/11 02:20): en NOVEDADES el
// posteo de hoy (hace 4 h) salía ARRIBA del impulso (hace 7 min)
// — la proyección salía en el orden en que se consultan las
// fuentes, no por el momento del hecho — y no había forma de
// vaciar la sección.
//   A · Estática: el orden descendente y el filtro de borrado en
//       la proyección, la tabla de la marca, la ruta nueva, el
//       botón en el encabezado (solo con novedades) + gate M78.
//   B · Módulo bandeja.js (node:sqlite en memoria, sin disco):
//       EL CASO DE LA CAPTURA sembrado tal cual (posteo de hace
//       4 h + impulso de hace 7 min) y el barrido completo: orden,
//       conteo, lo borrado no vuelve, lo posterior a la marca sí,
//       las tandas (ESPERA TU TOQUE y NO PUEDEN SALIR) intactas,
//       la marca de lectura no se toca, aislamiento por usuario.
//   C · Boot real: el circuito entero por HTTP — count, bandeja
//       ordenada, POST borrar, bandeja vacía y count en 0.
// Secciones elegibles con LOTE_SECCIONES=A,B,C (default: todas):
// en episodios del filtro de escritura del sandbox el boot (WAL)
// no puede correr y el resto de la suite igual verifica.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const SECC = (process.env.LOTE_SECCIONES || 'A,B,C').split(',').map(s => s.trim().toUpperCase());
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra || ''); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isoHace = (ms) => new Date(Date.now() - ms).toISOString();
const sqlHace = (ms) => isoHace(ms).replace('T', ' ').slice(0, 19);
const sqlAhora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ===A-INICIO===
if (SECC.includes('A')) {
  console.log('\nA · Estática');
  const bj = read('bandeja.js');
  const srv = read('server.js');
  const app = read('public/app.js');
  ok('A1 la marca de borrado existe: tabla bandeja_novedades_borradas + borrarNovedades + su export',
    bj.includes('CREATE TABLE IF NOT EXISTS bandeja_novedades_borradas')
    && bj.includes('function borrarNovedades')
    && bj.includes('conteoCampana, marcarNovedadesVistas, borrarNovedades,'));
  ok('A2 la proyección filtra por la marca y ordena por el momento del hecho, la más nueva arriba',
    bj.includes('const borradasMs = novedadesBorradasHastaMs(db, uid);')
    && bj.includes('parseFechaMs(n.cuando) <= borradasMs')
    && bj.includes('.sort((a, b) => parseFechaMs(b.cuando) - parseFechaMs(a.cuando))'));
  ok('A3 una sola verdad: el conteo de la campana sigue saliendo de la misma proyección (novedades)',
    bj.includes('const sinVer = novedades(db, uid).filter(n => !n.vista).length;'));
  ok('A4 server.js: POST /api/bandeja/novedades/borrar tras requireAuth, sirve el total fresco',
    srv.includes("app.post('/api/bandeja/novedades/borrar', requireAuth")
    && srv.includes('B.borrarNovedades(db, uid)') && srv.includes('total: c.total'));
  const lineaNov = (app.split('\n').find(l => l.includes("pzBandejaT('NOVEDADES', 'UPDATES')")) || '');
  ok('A5 el botón «Borrar todo» vive en el encabezado de NOVEDADES y solo se pinta con novedades (novs.length)',
    lineaNov.trimStart().startsWith('${novs.length ?') && lineaNov.includes('pzb-seccion-flex')
    && lineaNov.includes('pzb-borrar-todo') && lineaNov.includes('onclick="pzBandejaBorrarNovedades()"')
    && lineaNov.includes("pzBandejaT('Borrar todo', 'Clear all')"),
    lineaNov.slice(0, 120));
  ok('A6 app.js: pzBandejaBorrarNovedades postea a la ruta, repinta la insignia con el total y repinta la pantalla',
    app.includes('function pzBandejaBorrarNovedades()')
    && app.includes("api.post('/api/bandeja/novedades/borrar', {})")
    && app.includes('window.__pzCampanaBadgeN = r.total')
    && app.includes('await pzBandejaRepintar();'));
  ok('A7 los estilos del encabezado con botón existen (.pzb-seccion-flex y .pzb-borrar-todo)',
    app.includes('.pzb-seccion-flex{display:flex;align-items:center;justify-content:space-between}')
    && app.includes('.pzb-borrar-todo{'));
  ok('A8 lo que no se barre sigue intacto: ESPERA TU TOQUE, NO PUEDEN SALIR y su tarjeta tranquila',
    app.includes("pzBandejaT('ESPERA TU TOQUE', 'WAITING FOR YOUR TAP')")
    && app.includes("pzBandejaT('NO PUEDEN SALIR', 'CANNOT GO OUT')")
    && app.includes('function pzBandejaTarjetaBloqueadaHTML(t)'));
  const llamadas = ['pzBandejaView', 'pzBandejaNotifsHTML', 'pzBandejaTarjetaHTML', 'pzBandejaTarjetaBloqueadaHTML', 'pzBandejaMarcarVistas', 'pzBandejaBorrarNovedades', 'pzBandejaAbrir', 'pzBandejaVolver', 'pzBandejaAprobar', 'pzBandejaEditar', 'pzBandejaGuardar', 'pzBandejaDescartar', 'pzBandejaDeshacer', 'pzBandejaRepintar', 'pzCampanaBadgePintar', 'pzCampanaBadgeRefrescar'];
  const definidas = llamadas.filter(fn => new RegExp('(async )?function ' + fn + '\\(').test(app));
  ok(`A9 gate M78 — funciones auditadas: ${definidas.length}/${llamadas.length}`, definidas.length === llamadas.length, 'faltan: ' + llamadas.filter(f => !definidas.includes(f)).join(','));
}
// ===A-FIN===

// ---------------------------------------------------------------- B y C
(async () => {
  if (SECC.includes('B')) {
    console.log('\nB · Módulo (el caso de la captura y el barrido)');
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    const B = require(path.join(ROOT, 'bandeja.js'));
    B.initBandejaTables(db);
    // Las dos fuentes de las novedades, con las columnas que la
    // proyección lee (el esquema real vive en db.js).
    db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      image_path TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', published_at TEXT)`);
    db.exec(`CREATE TABLE ad_boosts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      budget_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'ARS', status TEXT NOT NULL DEFAULT 'pending',
      duration_days INTEGER NOT NULL DEFAULT 7, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);

    const CASA = 12, OTRO = 13;
    // LA CASA, tal cual la captura del dueño: el posteo de hoy
    // publicado hace 4 h y el impulso creado hace 7 min. Más una
    // tanda accionable (DM fresco con borrador) y una bloqueada
    // (DM fuera de la ventana de 24 h): las dos secciones que el
    // barrido NO puede tocar.
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (?, 'film.jpg', 'Esto es Posty: tus community managers.', 'published', ?)").run(CASA, sqlHace(4 * 3600000));
    db.prepare("INSERT INTO ad_boosts (user_id, budget_cents, currency, status, duration_days, created_at) VALUES (?, 2000, 'USD', 'active', 7, ?)").run(CASA, sqlHace(7 * 60000));
    const tAcc = Number(db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, etiqueta, notified_at) VALUES (?, 'dm:CV-ACC', 'dm', '@vecina', datetime('now'))").run(CASA).lastInsertRowid);
    db.prepare(`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, last_in_at, created_at, updated_at)
      VALUES (?, ?, 'dm', 'CV-ACC', 'm1', 'm1', 'vecina_', 'U1', '¿hacen envíos?', '¡Hola! Sí, hacemos envíos.', 'normal', 'pendiente', ?, ?, ?)`)
      .run(tAcc, CASA, sqlAhora(), sqlAhora(), sqlAhora());
    const tBloq = Number(db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, etiqueta, notified_at) VALUES (?, 'dm:CV-BLOQ', 'dm', '@posty.communitymanager', datetime('now'))").run(CASA).lastInsertRowid);
    db.prepare(`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, last_in_at, created_at, updated_at)
      VALUES (?, ?, 'dm', 'CV-BLOQ', 'm-old', 'm-old', 'vecina_', 'U2', '¿hacen envíos?', '¡Hola! Sí, hacemos envíos.', 'normal', 'pendiente', ?, ?, ?)`)
      .run(tBloq, CASA, sqlHace(3 * 86400000), sqlHace(3 * 86400000), sqlHace(3 * 86400000));
    // Otro usuario con su novedad: el barrido de la casa no lo toca.
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (?, 'foto.jpg', 'Otro negocio.', 'published', ?)").run(OTRO, sqlHace(3600000));

    const novs0 = B.novedades(db, CASA);
    ok('B1 EL CASO DE LA CAPTURA, al revés: la novedad más nueva (impulso, 7 min) va ARRIBA del posteo (4 h)',
      novs0.length === 2 && novs0[0].tipo === 'impulso' && novs0[1].tipo === 'posteo',
      JSON.stringify(novs0.map(n => n.tipo + '@' + n.cuando)));
    const cc0 = B.conteoCampana(db, CASA);
    ok('B2 el conteo antes: acciones 1 (la tanda accionable) · novedades 2 · total 3 — la bloqueada no cuenta',
      cc0.acciones === 1 && cc0.novedades === 2 && cc0.total === 3, JSON.stringify(cc0));
    const gb0 = B.getBandeja(db, CASA);
    const firmaTandas = (gb) => (gb.tandas || []).map(t => t.id + ':' + t.conteo.accionables + '/' + t.conteo.bloqueadas).sort().join('|');
    ok('B3 la bandeja trae las dos tandas: la accionable (1/0) y la bloqueada (0/1)',
      firmaTandas(gb0) === [tAcc + ':1/0', tBloq + ':0/1'].sort().join('|'), firmaTandas(gb0));

    const trasVistas = B.marcarNovedadesVistas(db, CASA);
    const vistasAntes = (db.prepare('SELECT hasta FROM bandeja_novedades_vistas WHERE user_id = ?').get(CASA) || {}).hasta;
    ok('B4 abrir la pantalla (marcar vistas) NO barre: las 2 novedades siguen listadas, ya vistas; el total queda en 1 (solo acciones)',
      trasVistas.total === 1 && B.novedades(db, CASA).length === 2 && B.novedades(db, CASA).every(n => n.vista === true),
      JSON.stringify(trasVistas));

    const trasBorrar = B.borrarNovedades(db, CASA);
    ok('B5 «Borrar todo»: el conteo devuelto cae en el acto — novedades 0 y queda solo lo accionable (total 1)',
      trasBorrar.novedades === 0 && trasBorrar.acciones === 1 && trasBorrar.total === 1, JSON.stringify(trasBorrar));
    ok('B6 la proyección queda vacía y lo borrado NO reaparece al recomputar',
      B.novedades(db, CASA).length === 0 && B.novedades(db, CASA).length === 0 && B.conteoCampana(db, CASA).total === 1);
    ok('B7 los hechos NO se borraron: el posteo y el impulso siguen en su tabla',
      Number(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(CASA).n) === 1
      && Number(db.prepare('SELECT COUNT(*) AS n FROM ad_boosts WHERE user_id = ?').get(CASA).n) === 1);
    const gb1 = B.getBandeja(db, CASA);
    ok('B8 las tandas quedan INTACTAS tras el barrido (ESPERA TU TOQUE y NO PUEDEN SALIR no se barren)',
      firmaTandas(gb1) === firmaTandas(gb0) && B.countAcciones(db, CASA) === 1, firmaTandas(gb1));
    const vistasDespues = (db.prepare('SELECT hasta FROM bandeja_novedades_vistas WHERE user_id = ?').get(CASA) || {}).hasta;
    const marcaBorrado = (db.prepare('SELECT hasta FROM bandeja_novedades_borradas WHERE user_id = ?').get(CASA) || {}).hasta;
    ok('B9 la marca de borrado es propia y la de lectura NO se tocó',
      !!marcaBorrado && vistasDespues === vistasAntes, JSON.stringify({ marcaBorrado, vistasAntes, vistasDespues }));
    ok('B10 el barrido es por usuario: las novedades del otro negocio se siguen viendo',
      B.novedades(db, OTRO).length === 1 && B.conteoCampana(db, OTRO).novedades === 1);

    await sleep(1150); // la marca corre en segundos: lo nuevo nace después
    db.prepare("INSERT INTO ad_boosts (user_id, budget_cents, currency, status, duration_days, created_at) VALUES (?, 5000, 'USD', 'active', 7, ?)").run(CASA, sqlAhora());
    const novsPost = B.novedades(db, CASA);
    const ccPost = B.conteoCampana(db, CASA);
    ok('B11 una novedad POSTERIOR a la marca aparece y cuenta — y el posteo barrido no vuelve con ella',
      novsPost.length === 1 && novsPost[0].tipo === 'impulso' && novsPost[0].vista === false && ccPost.novedades === 1 && ccPost.total === 2,
      JSON.stringify({ novs: novsPost.map(n => n.tipo), ccPost }));
  }

  if (SECC.includes('C')) {
    console.log('\nC · Boot real (el circuito del barrido por HTTP)');
    function portFree(p) {
      const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
      return !out.includes(':' + p + ' ');
    }
    function seedBootDir(dir) {
      const seed = `
        process.env.DATA_DIR = ${JSON.stringify(dir)};
        const dbm = require(${JSON.stringify(path.join(ROOT, 'db.js'))});
        const db = dbm.db || dbm;
        const bcrypt = require('bcryptjs');
        const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('dueno@casa.example', bcrypt.hashSync('clave-prueba-1', 10));
        const uid = Number(r.lastInsertRowid);
        db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
        db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'Posty', 'servicios', 'amable', 'posty.communitymanager', 1)").run(uid);
        db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
        require(${JSON.stringify(path.join(ROOT, 'bandeja.js'))}).initBandejaTables(db);
        const t = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, etiqueta, notified_at) VALUES (?, 'dm:CV1', 'dm', '@posty.communitymanager', datetime('now'))").run(uid);
        const tid = Number(t.lastInsertRowid);
        db.prepare(\`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, note, last_in_at, created_at, updated_at)
          VALUES (?, ?, 'dm', 'CV1', 'm-old', 'm-old', 'vecina_', 'U777', '¿hacen envíos?', '¡Hola! Sí, hacemos envíos.', 'normal', 'pendiente', '', ?, ?, ?)\`)
          .run(tid, uid, ${JSON.stringify(sqlHace(3 * 86400000))}, ${JSON.stringify(sqlHace(3 * 86400000))}, ${JSON.stringify(sqlHace(3 * 86400000))});
        db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (?, 'film.jpg', 'Esto es Posty: tus community managers.', 'published', ?)").run(uid, ${JSON.stringify(sqlHace(4 * 3600000))});
        db.prepare("INSERT INTO ad_boosts (user_id, budget_cents, currency, status, duration_days, created_at) VALUES (?, 2000, 'USD', 'active', 7, ?)").run(uid, ${JSON.stringify(sqlHace(7 * 60000))});
        console.log('SEEDED uid=' + uid + ' tanda=' + tid);
      `;
      const out = execFileSync('node', ['-e', seed], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
      return out.trim();
    }

    const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'novedades-borrar-boot-'));
    console.log('  seed C:', seedBootDir(dirC));
    const port = 19871 + Math.floor(Math.random() * 60);
    ok('C0 el puerto del boot está libre antes de arrancar', portFree(port));
    const proc = spawn('node', ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), DATA_DIR: dirC, MEDIA_DIR: path.join(dirC, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let bootLog = '';
    proc.stdout.on('data', d => { bootLog += d; });
    proc.stderr.on('data', d => { bootLog += d; });
    const base = `http://127.0.0.1:${port}`;
    try {
      let up = false;
      for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
      ok('C1 el servidor levanta', up, bootLog.slice(-300));
      if (up) {
        const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dueno@casa.example', password: 'clave-prueba-1' }) });
        const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
        ok('C2 login del dueño', login.ok && !!cookie, 'status=' + login.status);
        const c1 = await (await fetch(base + '/api/bandeja/count', { headers: { Cookie: cookie } })).json();
        ok('C3 count al arrancar: acciones 0 (la bloqueada no cuenta) · novedades 2 · total 2',
          c1.ok === true && c1.acciones === 0 && c1.novedades === 2 && c1.total === 2, JSON.stringify(c1));
        const gb = await (await fetch(base + '/api/bandeja', { headers: { Cookie: cookie } })).json();
        const tipos = (gb.novedades || []).map(n => n.tipo);
        const tandaB = (gb.tandas || []).find(t => t.kind === 'dm');
        ok('C4 la bandeja servida trae las novedades ORDENADAS (impulso de 7 min arriba del posteo de 4 h) y la tanda bloqueada',
          tipos.join(',') === 'impulso,posteo' && !!tandaB && tandaB.conteo.bloqueadas === 1,
          JSON.stringify({ tipos, conteo: tandaB && tandaB.conteo }));
        const pb = await fetch(base + '/api/bandeja/novedades/borrar', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
        const pbj = await pb.json().catch(() => ({}));
        ok('C5 «Borrar todo» (POST borrar) responde con el total ya en 0', pb.ok && pbj.ok === true && pbj.total === 0 && pbj.novedades === 0, 'status=' + pb.status + ' ' + JSON.stringify(pbj));
        const gb2 = await (await fetch(base + '/api/bandeja', { headers: { Cookie: cookie } })).json();
        const tandaB2 = (gb2.tandas || []).find(t => t.kind === 'dm');
        ok('C6 tras el barrido la bandeja no trae novedades y la tanda bloqueada SIGUE (no se barrió)',
          (gb2.novedades || []).length === 0 && !!tandaB2 && tandaB2.conteo.bloqueadas === 1,
          JSON.stringify({ novs: gb2.novedades, conteo: tandaB2 && tandaB2.conteo }));
        const c2 = await (await fetch(base + '/api/bandeja/count', { headers: { Cookie: cookie } })).json();
        ok('C7 count después de barrer: total 0 — la campana quedó limpia', c2.ok === true && c2.total === 0 && c2.novedades === 0, JSON.stringify(c2));
        const sinSesion = await fetch(base + '/api/bandeja/novedades/borrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        ok('C8 sin sesión no se puede barrer', sinSesion.status === 401, 'status=' + sinSesion.status);
      }
    } finally {
      try { proc.kill('SIGTERM'); } catch (e) {}
      await sleep(600);
      try { proc.kill('SIGKILL'); } catch (e) {}
    }
  }

  console.log(`\nRESULTADO: ${pass} ok · ${fail} MAL`);
  if (fails.length) { console.log('FALLAS:\n - ' + fails.join('\n - ')); }
  process.exit(fail ? 1 : 0);
})();
