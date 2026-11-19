'use strict';
// =====================================================================
// SUITE · LOTE IMPORTACIÓN-PUERTA
//
// El defecto (verificado en producción, 19/11): para los invitados
// frescos post-v1149, las piezas que bamboo carga con la palanca
// (POST /api/admin/trial/pieza-mano) quedan en el payload de
// trial_cache pero NUNCA se vuelven filas de posts, porque
// importTrialWeek solo se invoca desde caminos de SESIÓN (guest/start,
// set-ig, alta/login, magic) y los dos gatillos del reimport
// (GET /api/guest/return y GET /api/posts, LOTE REIMPORTACIÓN DEL
// INVITADO) exigen la sesión del invitado. Sin sesión que vuelva, no
// hay importación: la semana a mano vive solo en la caché (invitados
// 126 Highland — semana completa —, 119, 107, 124, 125).
//
// La corrección que esta suite pincha:
//   · server.js: ruta admin NUEVA POST /api/admin/trial/importar-semana
//     (requireAdminToken, el mismo patrón que pieza-mano, pegada a
//     ella). Resuelve al invitado por user_id o por ig/domain/cache_key
//     (la marca, el mismo camino que pieza-mano) y corre el gancho de
//     siempre: reimportInvitadoSiAplica — la misma puerta (invitado +
//     marca activa suya + piezas con medio + cero filas), la misma
//     importación (importTrialWeek, límite 3) y el mismo cierre que
//     guest/start (cierreReimportInvitado → scheduleAllDrafts). NO
//     regenera la semana, NO toca el payload, NO pasa por la puerta
//     pública (la re-entrada por /prueba regenera y pisa las piezas).
//   · IDEMPOTENCIA por construcción: la puerta exige cero filas e
//     importTrialWeek aborta si la cuenta tiene posteos — la segunda
//     llamada responde motivo 'ya-importada', importados 0, y las
//     filas son las mismas.
//   · FECHAS: las del cierre de siempre (scheduleDraftsPerWeek): los
//     días de la prueba se anclan corridos EN ORDEN desde el primer
//     slot cuya hora sigue en el futuro, nunca en el pasado, nunca dos
//     el mismo día — la suite lo verifica sobre las filas creadas.
//   · Errores limpios: sin invitado (404), sin marca / sin piezas /
//     no-invitado (409 con motivo), sin token (401/403), sin
//     identidad resoluble (400).
//
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules \
//        node test-lote-importacion-puerta.js [--no-boot]
// Control: PZ_ROOT=<árbol prístino v1185> node test-lote-importacion-puerta.js
//   (en el control: los pines A caen — la ruta no existe — y en el boot
//   la ruta responde 404: las piezas quedan en el payload, 0 filas,
//   que es el defecto).
// =====================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const SERVER = read('server.js');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) {}

let pass = 0, fail = 0;
const failures = [];
function ok(cond, nombre) {
  if (cond) { pass++; console.log('  ok ·', nombre); }
  else { fail++; failures.push(nombre); console.log('  ✗ MAL ·', nombre); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ']'); }
function seccion(t) { console.log('\n== ' + t); }
const DIA = 24 * 3600 * 1000;

// ---------- Medios de la suite (bytes deterministas, >10KB: la vara
// de calidad pide archivo real >10KB; el relleno va DESPUÉS del
// contenido, los bytes se escriben verbatim y se verifican verbatim).
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPG_MIN = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==', 'base64');
function pad(buf, total, fill) { return buf.length >= total ? buf : Buffer.concat([buf, Buffer.alloc(total - buf.length, fill)]); }
const IMG1 = pad(PNG_1PX, 12000, 0x11);            // día 1: imagen (png)
const SL1 = pad(JPG_MIN, 12000, 0x21);             // carrusel placa 1 (jpg)
const SL2 = pad(PNG_1PX, 13000, 0x22);             // carrusel placa 2 (png)
const SL3 = pad(JPG_MIN, 14000, 0x23);             // carrusel placa 3 (jpg)
const VID1 = pad(Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32]), 15000, 0x31); // día 3: video (mp4)
const durl = (mime, buf) => 'data:' + mime + ';base64,' + buf.toString('base64');

const CAP1 = 'El café de la mañana, recién hecho y con la medialuna tibia ☕';
const HT1 = '#cafe #medialunas #barrio';
const CAP2 = 'La vitrina completa del finde: tortas, tartas y lo que sale del horno';
const HT2 = '#vitrina #tortas #finde';
const CAP3 = 'Así se arma tu pedido en Importa Suite, paso a paso y sin vueltas';
const HT3 = '#pedido #cocina #importasuite';

// ---------- A · Pines estáticos ----------
function seccionA() {
  seccion('A · pines estáticos del mecanismo');
  const iPm = SERVER.indexOf("app.post('/api/admin/trial/pieza-mano'");
  const iRuta = SERVER.indexOf("app.post('/api/admin/trial/importar-semana'");
  ok(iPm >= 0, 'A1 la palanca pieza-mano existe (ancla del lote)');
  ok(iRuta > iPm, 'A2 la ruta POST /api/admin/trial/importar-semana existe, DESPUÉS de pieza-mano');
  const ruta = iRuta >= 0 ? SERVER.slice(iRuta, iRuta + 4200) : '';
  ok(ruta.includes('requireAdminToken'), 'A3 la ruta exige el token admin (requireAdminToken)');
  ok(ruta.includes('reimportInvitadoSiAplica('), 'A4 la ruta corre el gancho de siempre (reimportInvitadoSiAplica): misma puerta, misma importación, mismo cierre');
  ok(!ruta.includes('importTrialWeek('), 'A5 la ruta NO llama importTrialWeek directo (no forkea la semántica: pasa por el gancho)');
  ok(!/rearmar|generarSemana|generateWeek|buildDemoSpec/.test(ruta), 'A6 la ruta NO regenera ni re-engancha generación/rescate (sin gasto, sin pisar piezas)');
  ok(ruta.includes("'ya-importada'") && ruta.includes('posteos') && ruta.includes('scheduled_at'), 'A7 la respuesta trae el detalle (posteos con scheduled_at) y el motivo ya-importada de la doble corrida');
  ok(SERVER.includes('function reimportInvitadoSiAplica') && SERVER.includes('function cierreReimportInvitado') && SERVER.includes('scheduleAllDrafts('),
    'A8 el gancho y el cierre reutilizados siguen intactos (la ruta suma un gatillo, no una semántica)');
}

// ---------- B · Boot real: la ruta por HTTP ----------
async function seccionB() {
  seccion('B · boot aislado + la ruta admin por HTTP (claves inventadas)');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!DatabaseSync) { ok(false, 'B0 node:sqlite disponible para sembrar'); return; }
  const port = 19900 + Math.floor(Math.random() * 90);
  const ADMIN_TOK = 'token-suite';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-imp-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-imp-media-'));
  const childEnv = { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: ADMIN_TOK, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' };
  for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'FAL_API_KEY', 'REPLICATE_API_TOKEN']) delete childEnv[k];
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = 'http://127.0.0.1:' + port;
  let vivo = false;
  try {
    for (let i = 0; i < 60 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch(base + '/api/version').catch(() => null);
      if (resp && resp.status === 200) vivo = true;
    }
    ok(vivo, 'B1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    const dbPath = path.join(dataDir, 'posta.db');
    let db = null;
    for (let i = 0; i < 20 && !db; i++) {
      try { db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout = 5000'); } catch (e) { await new Promise((r) => setTimeout(r, 300)); }
    }
    ok(!!db, 'B2 la base del boot se puede abrir para sembrar');
    if (!db) return;
    // La tabla de la marca nace perezosa (ensureSchema la crea la
    // primera llamada del módulo): la suite la crea con el MISMO
    // esquema del módulo antes de sembrar, como quedaría tras la
    // primera generación marcada.
    try { require(path.join(ROOT, 'linea-mano')).ensureSchema(db); } catch (e) {}
    const ahora = Date.now();
    const filasDe = (uid) => db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(uid);
    const marcaSql = (cacheKey, ig, dom, uid) => db.prepare(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at) VALUES (?, ?, ?, ?, 'activa', ?)`)
      .run(cacheKey, ig || '', dom || '', uid || 0, ahora);
    const payloadSql = (cacheKey, payload) => db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
      .run(cacheKey, JSON.stringify(payload), ahora);
    const guestSql = (ig, dom) => Number(db.prepare(`INSERT INTO users (email, password_hash, is_guest, guest_ig, guest_domain, lang, trial_ends_at, autopilot_enabled) VALUES (?, '', 1, ?, ?, 'es', ?, 1)`)
      .run('guest-' + ig + '@guest.invalid', ig, dom || '', ahora + 2 * DIA).lastInsertRowid);
    const importar = async (body, tok) => {
      const r = await fetch(base + '/api/admin/trial/importar-semana' + (tok === null ? '' : '?token=' + (tok || ADMIN_TOK)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    };
    const bytesDe = (imagePath) => { try { return fs.readFileSync(path.join(mediaDir, path.basename(String(imagePath || '')))); } catch (e) { return null; } };

    // ===== Flujo principal: la semana a mano completa (imagen ·
    // carrusel · video) que vive solo en el payload =====
    const payloadImp = {
      engine: 25, business: 'Importa Suite', category: 'cafetería',
      posts: [
        { type: 'image', image: durl('image/png', IMG1), caption: CAP1, hashtags: HT1, armando: false, mano: { cargada_at: ahora - 3600e3, dia: 1 } },
        { type: 'carousel', image: durl('image/jpeg', SL1), images: [durl('image/jpeg', SL1), durl('image/png', SL2), durl('image/jpeg', SL3)], caption: CAP2, hashtags: HT2, armando: false, mano: { cargada_at: ahora - 3500e3, dia: 2 } },
        { type: 'video', video: durl('video/mp4', VID1), caption: CAP3, hashtags: HT3, armando: false, mano: { cargada_at: ahora - 3400e3, dia: 3 } },
      ],
    };
    payloadSql('importa.suite', payloadImp);
    const uid = guestSql('importa.suite', 'importa-suite.com');
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)').run(uid, 'Importa Suite', 'importa.suite');
    marcaSql('importa.suite', 'importa.suite', 'importa-suite.com', uid);
    eq(filasDe(uid).length, 0, 'B3 antes del gatillo: 0 filas (la semana vive solo en el payload — el defecto)');

    // La primera llamada resuelve por IDENTIDAD (ig + domain, sin
    // user_id): el mismo camino de resolución que pieza-mano.
    const r1 = await importar({ ig: 'importa.suite', domain: 'importa-suite.com' });
    eq(r1.status, 200, 'B4 la ruta responde 200 [' + r1.status + ']');
    ok(r1.json.ok === true && r1.json.aplicado === true, 'B5 la importación se aplicó (ok + aplicado)');
    eq(r1.json.importados, 3, 'B6 importados = 3 (los tres días de la semana a mano)');
    eq(r1.json.user_id, uid, 'B7 la identidad resolvió al invitado sembrado');
    ok(Array.isArray(r1.json.posteos) && r1.json.posteos.length === 3, 'B8 el detalle trae los 3 posteos creados');
    if (Array.isArray(r1.json.posteos) && r1.json.posteos.length === 3) {
      eq(r1.json.posteos.map((p) => p.dia).join(','), '1,2,3', 'B9 el detalle viene por día, en orden (1, 2, 3)');
      eq(r1.json.posteos.map((p) => p.media_type).join(','), 'image,carousel,video', 'B10 los tipos del detalle: imagen · carrusel · video');
    } else { ok(false, 'B9 (sin detalle de 3)'); ok(false, 'B10 (sin detalle de 3)'); }

    const filas = filasDe(uid);
    eq(filas.length, 3, 'B11 la importación creó las 3 filas');
    if (filas.length === 3) {
      eq(filas[0].caption, CAP1, 'B12 el caption del día 1 llega byte-idéntico');
      eq(filas[0].hashtags, HT1, 'B13 los hashtags del día 1 llegan byte-idénticos');
      eq(filas[1].caption, CAP2, 'B14 el caption del día 2 (carrusel) llega byte-idéntico');
      eq(filas[2].caption, CAP3, 'B15 el caption del día 3 (video) llega byte-idéntico');
      eq(filas.map((f) => f.media_type).join(','), 'image,carousel,video', 'B16 las filas nacen con su tipo real (imagen · carrusel · video)');
      const b1 = bytesDe(filas[0].image_path);
      ok(!!b1 && b1.equals(IMG1), 'B17 el medio del día 1 en disco es byte-idéntico al del payload');
      let album = []; try { album = JSON.parse(filas[1].carousel_paths || '[]'); } catch (e) {}
      eq(album.length, 3, 'B18 el carrusel trae sus 3 placas en carousel_paths');
      const esperadas = [SL1, SL2, SL3];
      ok(album.length === 3 && album.every((p, i) => { const b = bytesDe(p); return !!b && b.equals(esperadas[i]); }), 'B19 cada placa del carrusel es byte-idéntica a la del payload, en orden');
      const b3 = bytesDe(filas[2].image_path);
      ok(!!b3 && b3.equals(VID1), 'B20 el video del día 3 en disco es byte-idéntico al del payload');
      eq(filas[0].source, 'trial', 'B21 las filas nacen de la importación de la prueba (source=trial)');
      // FECHAS: el cierre de siempre — en orden, un día por slot,
      // nunca en el pasado.
      const sched = filas.map((f) => f.scheduled_at).filter(Boolean);
      eq(filas.map((f) => f.status).join(','), 'scheduled,scheduled,scheduled', 'B22 las 3 filas quedaron programadas por el cierre');
      ok(sched.length === 3 && sched.every((s) => Date.parse(s) > Date.now()), 'B23 ninguna fecha asignada está en el pasado');
      ok(sched.length === 3 && Date.parse(sched[1]) - Date.parse(sched[0]) >= 20 * 3600e3 && Date.parse(sched[2]) - Date.parse(sched[1]) >= 20 * 3600e3,
        'B24 las fechas van en orden de día y nunca dos el mismo día (saltos ≥ 20 h)');
      const ev = db.prepare(`SELECT COUNT(*) AS c FROM events WHERE user_id = ? AND name = 'trial_reimport'`).get(uid);
      ok(!!ev && ev.c === 1, 'B25 el evento trial_reimport quedó registrado una vez');
    } else { for (const n of ['B12', 'B13', 'B14', 'B15', 'B16', 'B17', 'B18', 'B19', 'B20', 'B21', 'B22', 'B23', 'B24', 'B25']) ok(false, n + ' (sin las 3 filas)'); }

    // ===== LA DOBLE CORRIDA: importar dos veces no duplica =====
    const idsAntes = filasDe(uid).map((f) => f.id).join(',');
    const r2 = await importar({ user_id: uid });
    eq(r2.status, 200, 'B26 la segunda llamada responde 200 (idempotencia limpia, no error)');
    ok(r2.json.ok === true && r2.json.aplicado === false && r2.json.importados === 0 && r2.json.motivo === 'ya-importada',
      'B27 la segunda llamada declara ya-importada, importados 0');
    const filas2 = filasDe(uid);
    ok(filas2.length === 3 && filas2.map((f) => f.id).join(',') === idsAntes, 'B28 DOBLE CORRIDA: las filas son las mismas 3 (mismos ids, sin duplicados)');

    // ===== Guardas: errores limpios =====
    // (i) Invitado SIN marca: la semana del software no se toca.
    payloadSql('sinmarca.suite', { engine: 25, business: 'Sin Marca', category: 'otro', posts: [{ type: 'image', image: durl('image/png', IMG1), caption: CAP1, hashtags: HT1, armando: false }] });
    const uidS = guestSql('sinmarca.suite', '');
    const rS = await importar({ user_id: uidS });
    ok(rS.status === 409 && rS.json.ok === false && rS.json.motivo === 'sin-marca', 'B29 GUARDA: invitado sin marca → 409 sin-marca [' + rS.status + '/' + (rS.json.motivo || '') + ']');
    eq(filasDe(uidS).length, 0, 'B30 sin marca: 0 filas (nada se importó)');
    // (ii) Invitado CON marca pero SIN semana en caché.
    const uidV = guestSql('sinssemana.suite', '');
    marcaSql('sinssemana.suite', 'sinssemana.suite', '', uidV);
    const rV = await importar({ user_id: uidV });
    ok(rV.status === 409 && rV.json.ok === false && !!rV.json.motivo, 'B31 GUARDA: marca sin semana → 409 con motivo limpio [' + (rV.json.motivo || '') + ']');
    eq(filasDe(uidV).length, 0, 'B32 sin semana: 0 filas');
    // (iii) Usuario inexistente.
    const rX = await importar({ user_id: 999999 });
    ok(rX.status === 404 && rX.json.ok === false, 'B33 GUARDA: user_id inexistente → 404 limpio [' + rX.status + ']');
    // (iv) Sin identidad resoluble.
    const rN = await importar({});
    ok(rN.status === 400 && rN.json.ok === false, 'B34 GUARDA: sin user_id ni identidad → 400 limpio [' + rN.status + ']');
    // (v) Sin token admin.
    const rT = await importar({ user_id: uid }, null);
    ok(rT.status === 401 || rT.status === 403, 'B35 GUARDA: sin token admin la ruta no corre [' + rT.status + ']');

    // ===== Control: la importación por SESIÓN sigue igual =====
    // El mismo invitado-tipo por el gatillo de siempre (la puerta de
    // regreso): importa como importaba, y la ruta admin después lo ve
    // ya-importado — los dos mundos comparten la misma puerta.
    payloadSql('control.suite', {
      engine: 25, business: 'Control Suite', category: 'otro',
      posts: [
        { type: 'image', image: durl('image/png', IMG1), caption: 'Control uno, la foto del día', hashtags: '#c1', armando: false },
        { type: 'image', image: durl('image/jpeg', SL1), caption: 'Control dos, la segunda foto', hashtags: '#c2', armando: false },
        { armando: true },
      ],
    });
    const uidC = guestSql('control.suite', '');
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)').run(uidC, 'Control Suite', 'control.suite');
    marcaSql('control.suite', 'control.suite', '', uidC);
    const rr = await fetch(base + '/api/guest/return-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'control.suite', lang: 'es' }) });
    eq(rr.status, 200, 'B36 la puerta de regreso emite su link para el invitado de control');
    const caso = db.prepare(`SELECT * FROM support_cases WHERE user_id = ? AND tipo = 'prueba_retorno_dm' ORDER BY id DESC`).get(uidC);
    const mTok = caso && String(caso.detalle || '').match(/\/api\/guest\/return\?token=([a-f0-9]{32,})/);
    ok(!!mTok, 'B37 el link de regreso del control trae su token');
    if (mTok) {
      const land = await fetch(base + '/api/guest/return?token=' + mTok[1], { redirect: 'manual' });
      eq(land.status, 302, 'B38 el aterrizaje por sesión responde 302');
      const filasC = filasDe(uidC);
      eq(filasC.length, 2, 'B39 CONTROL: la importación por sesión importó las 2 piezas con medio, como siempre');
      if (filasC.length === 2) eq(filasC[0].caption, 'Control uno, la foto del día', 'B40 CONTROL: el caption por sesión llega exacto');
      const rC = await importar({ user_id: uidC });
      ok(rC.json.ok === true && rC.json.aplicado === false && rC.json.motivo === 'ya-importada' && filasDe(uidC).length === 2,
        'B41 la ruta admin ve la semana del control ya-importada por sesión (misma puerta, cero duplicados)');
    } else { for (const n of ['B38', 'B39', 'B40', 'B41']) ok(false, n + ' (sin token de regreso)'); }
    try { db.close(); } catch (e) {}
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  seccionA();
  await seccionB();
  console.log(`\n== IMPORTACIÓN-PUERTA: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
  process.exit(0);
})();
