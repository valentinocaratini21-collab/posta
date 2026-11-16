// test-lote-vigilante-entradas.js
// LOTE VIGILANTE DE ENTRADAS DE PRUEBA — la línea a mano de bamboo
// sobre las pruebas self-serve (regla de Valentino 15/11: la prueba
// gratis de un negocio real la hace bamboo a mano, 1 posteo por día
// por 3 días, producción día a día).
//
// FASE 1 · EL DIAGNÓSTICO (contra el código real de v1114):
//   - Nadie avisa a bamboo cuando un negocio entra solo por la web:
//     el único aviso humano del mundo prueba es avisoRescateHumano
//     (prueba_trabada), que nace de la cadena de rescate DETENIDA —
//     no existe señal de «entrada nueva».
//   - La carga a mano no tenía vía: set-image / edit-caption actúan
//     sobre filas de `posts`, y la semana de un invitado vive en el
//     payload de trial_cache (antes de importar no hay filas). La
//     única ruta admin del mundo prueba era trial-reset.
//   - La cadena del software (generateDemo / render del stream +
//     scheduleWeekRescue) entrega sus propias versiones de las piezas
//     de CUALQUIER prueba, también de la que la línea a mano atiende.
//
// FASE 2 · LA FORMA (este lote):
//   - linea-mano.js: la marca (trial_linea_mano), su nacimiento en el
//     flujo de generación de AMBAS rutas (sync y stream) en el punto
//     donde la fase de medios iba a arrancar — el fundamento corre
//     entero igual; las piezas nacen en armado honesto (spec +
//     captions) y la cadena de rescate frena en su cabeza sobre una
//     clave marcada. /api/trial/redesign también frena.
//   - EL DESPERTAR: barrido */5 (scheduler, mismo patrón que el
//     rescate) que ata el invitado y abre casos del Conserje tipo
//     prueba_linea_mano — entrada (solo día 1), día 2 y día 3 (solo
//     si la pieza no fue cargada) — con EXACTAMENTE los datos justos:
//     @ o dominio · lectura de su Instagram · estado del fundamento ·
//     contacto público cosechado o «sin email público → va por DM».
//   - LA PALANCA: POST /api/admin/trial/pieza-mano carga UNA pieza en
//     SU día (dia 1..3) solo sobre una prueba marcada (sin marca,
//     409); pre-importación escribe el payload, post-importación crea
//     el posteo por crearPosteoRescateTardio + scheduleAllDrafts.
//   - FRONTERA CON EL GATE, por construcción: test-mode jamás marca;
//     la allowlist jamás marca; y toda corrida del gate arranca con
//     un trial-reset admin de sus claves — ese reseteo (camino
//     confirmado) deja una exclusión durable en trial_reset_log que
//     la primera generación posterior consume sin marcarse. Un
//     reseteo también levanta cualquier marca activa de la clave.
//
// Se corre desde la raíz del release:
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-vigilante-entradas.js
// Control contra la base prístina v1114: PZ_ROOT=<base> (el módulo no
// existe y los pines estáticos caen: la suite sale en rojo).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.existsSync(path.join(ROOT, 'server.js')) ? fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8') : '';
const SCHED = fs.existsSync(path.join(ROOT, 'scheduler.js')) ? fs.readFileSync(path.join(ROOT, 'scheduler.js'), 'utf8') : '';
const CASES = fs.existsSync(path.join(ROOT, 'support-cases.js')) ? fs.readFileSync(path.join(ROOT, 'support-cases.js'), 'utf8') : '';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function seccion(s) { console.log('\n[' + s + ']'); }

let lm = null;
try { lm = require(path.join(ROOT, 'linea-mano.js')); } catch (e) { lm = null; }
let sc = null;
try { sc = require(path.join(ROOT, 'support-cases.js')); } catch (e) { sc = null; }
let gt = null;
try { gt = require(path.join(ROOT, 'guest-trial.js')); } catch (e) { gt = null; }

const T0 = Date.UTC(2026, 10, 16, 12, 0, 0); // 2026-11-16 12:00 UTC
const DIA = 24 * 3600 * 1000;
function utcTxt(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }

function nuevaDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_guest INTEGER NOT NULL DEFAULT 0, guest_ig TEXT DEFAULT '', guest_domain TEXT DEFAULT '',
    trial_ends_at INTEGER DEFAULT 0, trial_extended_until INTEGER DEFAULT 0)`);
  db.exec(`CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, payload TEXT, created_at INTEGER)`);
  return db;
}
function payloadSemana(extra) {
  return Object.assign({
    ok: true, business: 'Negocio Suite', ig: 'negocio.suite', category: 'pasteleria',
    digest: {
      producto_estrella: 'Berry Mille Crepe Cake',
      productos: [{ nombre: 'Berry Mille Crepe Cake' }, { nombre: 'Hojicha Mille Crepe' }, { nombre: 'Yuzu Mousse' }],
      servicios: [{ nombre: 'Catering' }],
      web: { description: 'Pastelería en Brooklyn. Pedidos: hola@negocio-suite.com', url: 'https://negocio-suite.com' },
    },
    posts: [0, 1, 2, 3, 4].map((i) => ({ type: 'image', armando: true, headline: 'Pieza ' + i, caption: 'caption ' + i, hashtags: '#suite' })),
    week: [0, 1, 2, 3, 4].map((i) => ({ day: i + 1, date: '2026-11-16', hour: '19:00', post: i })),
  }, extra || {});
}

// ---------- A · Nacimiento de la marca y frontera con el gate ----------
function seccionA() {
  seccion('A · nacimiento de la marca y frontera con el gate');
  if (!lm) { ok(false, 'A0 el módulo linea-mano.js existe en el árbol'); return; }
  const db = nuevaDb();
  const r1 = lm.nace(db, { ig: 'negocio.suite', domain: '', testMode: false, allowlisted: false, now: T0 });
  eq(r1.marcada, true, 'A1 una entrada real self-serve se marca');
  eq(r1.motivo, 'nace', 'A1b el motivo es el nacimiento');
  const m1 = lm.marcaActiva(db, 'negocio.suite');
  ok(!!m1 && m1.estado === 'activa', 'A2 la marca queda activa en trial_linea_mano');
  const r2 = lm.nace(db, { ig: 'negocio.suite', domain: '', testMode: false, allowlisted: false, now: T0 + 1000 });
  eq(r2.motivo, 'ya-marcada', 'A3 el nacimiento es idempotente (ya-marcada)');
  eq(lm.nace(db, { ig: 'gate.uno', domain: '', testMode: true, allowlisted: false, now: T0 }).marcada, false, 'A4 test-mode jamás se marca');
  eq(lm.nace(db, { ig: 'posty.communitymanager', domain: '', testMode: false, allowlisted: true, now: T0 }).marcada, false, 'A5 la allowlist jamás se marca');
  // La forma del gate: reseteo confirmado → primera generación excluida.
  lm.registrarReseteo(db, 'gate.uno', '', T0);
  const rg = lm.nace(db, { ig: 'gate.uno', domain: '', testMode: false, allowlisted: false, now: T0 + 1000 });
  eq(rg.marcada, false, 'A6 tras un reseteo del operador, la primera generación NO se marca');
  eq(rg.motivo, 'reseteo-operador', 'A6b el motivo es la exclusión del reseteo');
  const consumida = db.prepare('SELECT consumida FROM trial_reset_log WHERE value = ?').get('gate.uno');
  eq(consumida.consumida, 1, 'A7 la exclusión se consume (un reseteo = una prueba excluida)');
  const rg2 = lm.nace(db, { ig: 'gate.uno', domain: '', testMode: false, allowlisted: false, now: T0 + 2000 });
  eq(rg2.marcada, true, 'A8 sin reseteo nuevo, la generación siguiente SÍ se marca (poblaciones distintas)');
  // El reseteo levanta una marca activa.
  lm.registrarReseteo(db, 'negocio.suite', '', T0 + 3000);
  eq(lm.marcaActiva(db, 'negocio.suite'), null, 'A9 el reseteo del operador levanta la marca activa');
  const fila = db.prepare('SELECT estado, motivo_cierre FROM trial_linea_mano WHERE cache_key = ?').get('negocio.suite');
  eq(fila.estado, 'cerrada', 'A9b la marca levantada queda cerrada');
  eq(fila.motivo_cierre, 'reseteo-operador', 'A9c con su motivo registrado');
  // Clave por dominio (entrada sin @).
  const rw = lm.nace(db, { ig: '', domain: 'negocio-web.com', testMode: false, allowlisted: false, now: T0 });
  eq(rw.marcada, true, 'A10 la entrada por dominio también se marca');
  ok(!!lm.marcaActiva(db, 'web:negocio-web.com'), 'A10b su clave de caché es web:<dominio>');
  eq(lm.nace(db, { ig: '', domain: '', testMode: false, allowlisted: false, now: T0 }).motivo, 'sin-clave', 'A11 sin identidad no hay marca');
}

// ---------- B · Los datos justos del despertar ----------
function seccionB() {
  seccion('B · los datos justos (ni un dato más)');
  if (!lm) { ok(false, 'B0 el módulo linea-mano.js existe en el árbol'); return; }
  const p = payloadSemana();
  const c1 = lm.contactoPublico(p);
  eq(c1.email, 'hola@negocio-suite.com', 'B1 el contacto sale del email público que el fundamento capturó (descripción web)');
  const pBio = payloadSemana({ digest: { producto_estrella: 'X', productos: [], servicios: [], web: { description: 'Sin email acá' }, feed: { bio: 'Pedidos a tomoko@ejemplo.com o por DM' } } });
  eq(lm.contactoPublico(pBio).email, 'tomoko@ejemplo.com', 'B2 también se cosecha de la bio de Instagram del fundamento');
  const pSin = payloadSemana({ digest: { producto_estrella: 'X', productos: [], servicios: [], web: { description: 'Solo Instagram' } } });
  eq(lm.contactoPublico(pSin).via, 'dm', 'B3 sin email público, la vía es DM');
  const pLead = payloadSemana({ email: 'lead@dejado-en-la-web.com', digest: { producto_estrella: 'X', productos: [], servicios: [], web: { description: 'Sin email público' } } });
  eq(lm.contactoPublico(pLead).via, 'dm', 'B4 el email que el visitante deja en la pantalla de resultados NO es el contacto cosechado');
  const det = lm.detalleCaso({ ig: 'negocio.suite', domain: '', cache_key: 'negocio.suite' }, p);
  const lineas = det.split('\n');
  eq(lineas.length, 4, 'B5 el detalle del caso tiene EXACTAMENTE 4 datos');
  ok(lineas[0].includes('@negocio.suite'), 'B5b dato 1: el @ del negocio');
  ok(lineas[1].includes('pasteleria') && lineas[1].includes('Berry Mille Crepe Cake') && lineas[1].includes('3 productos'), 'B5c dato 2: la lectura de su Instagram (rubro, estrella, productos)');
  ok(lineas[2].includes('en-armado'), 'B5d dato 3: el estado de su fundamento');
  ok(lineas[3].includes('hola@negocio-suite.com'), 'B5e dato 4: el contacto público');
  const detDm = lm.detalleCaso({ ig: 'negocio.suite', domain: '', cache_key: 'negocio.suite' }, pSin);
  ok(detDm.split('\n')[3].includes('sin email público → va por DM'), 'B6 sin email, el cuarto dato es la marca explícita de DM');
  eq(lm.estadoFundamento(null), 'sin-semana', 'B7 sin payload: fundamento sin-semana');
  eq(lm.estadoFundamento({ posts: [{ armando: false }] }), 'con-fundamento', 'B8 semana completa: con-fundamento');
  eq(lm.diaDePrueba(utcTxt(T0), T0 + 1 * DIA + 1000), 2, 'B9 el día de la prueba se calcula desde el alta (texto UTC)');
  eq(lm.diaDePrueba(utcTxt(T0), T0 + 3 * DIA + 1000), 0, 'B10 fuera de la ventana de 3 días: 0');
}

// ---------- C · El barrido: despertar y seguimiento por prueba ----------
function seccionC() {
  seccion('C · el barrido (despertar + seguimiento día a día)');
  if (!lm || !sc || !gt) { ok(false, 'C0 módulo + support-cases + guest-trial disponibles'); return; }
  const db = nuevaDb();
  sc.ensureSchema(db);
  const deps = {
    findGuest: (d, ig, domain) => gt.findGuestByIdentity(d, ig, domain),
    getUser: (d, id) => d.prepare('SELECT * FROM users WHERE id = ?').get(id) || null,
    guestEnd: (u, now) => gt.guestTrialEnd(u, now),
    openCase: (d, f) => sc.openCase(d, f),
  };
  const casos = () => db.prepare(`SELECT * FROM support_cases WHERE tipo = 'prueba_linea_mano' ORDER BY id`).all();
  // Marca sin invitado todavía: no puede abrir caso (openCase exige usuario).
  lm.nace(db, { ig: 'negocio.suite', domain: '', testMode: false, allowlisted: false, now: T0 });
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('negocio.suite', JSON.stringify(payloadSemana()), T0);
  let r = lm.barrido(db, deps, T0 + 3600 * 1000);
  eq(casos().length, 0, 'C1 sin invitado atado no se abre caso (y no se pierde: la marca sigue activa)');
  ok(!!lm.marcaActiva(db, 'negocio.suite'), 'C1b la marca sigue activa a la espera del alta');
  // Nace el invitado (día 1): el barrido lo ata y despierta a bamboo.
  db.prepare(`INSERT INTO users (email, is_guest, guest_ig, created_at, trial_ends_at) VALUES ('guest-x@guest.invalid', 1, 'negocio.suite', ?, ?)`).run(utcTxt(T0), T0 + 3 * DIA);
  r = lm.barrido(db, deps, T0 + 3600 * 1000);
  eq(r.avisos, 1, 'C2 el barrido abre exactamente un aviso: la entrada');
  eq(casos().length, 1, 'C2b un solo caso del Conserje');
  const cEnt = casos()[0];
  eq(cEnt.dedup_key, 'trial-mano:' + cEnt.user_id + ':entrada', 'C3 el dedup del caso de entrada es por invitado y disparo');
  ok(cEnt.titulo.includes('día 1'), 'C3b el caso de entrada dispara SOLO la producción del día 1');
  ok(cEnt.detalle.includes('hola@negocio-suite.com'), 'C3c el caso lleva el contacto cosechado');
  r = lm.barrido(db, deps, T0 + 2 * 3600 * 1000);
  eq(casos().length, 1, 'C4 el segundo barrido NO duplica el aviso de entrada');
  // Día 2 sin cargar la pieza 1... (la pieza del día 2 es la de índice 1)
  r = lm.barrido(db, deps, T0 + DIA + 3600 * 1000);
  eq(casos().length, 2, 'C5 en el día 2, el seguimiento abre su propio aviso');
  ok(casos()[1].dedup_key.endsWith(':dia2'), 'C5b el aviso es el del día 2');
  // Si la pieza del día 3 ya estuviera cargada, su aviso no sale; probamos
  // el día 3 con la pieza 2 sin cargar y la 1 cargada tarde: solo importa la 2.
  const payload2 = payloadSemana();
  payload2.posts[1].mano = { cargada_at: T0 + DIA, dia: 2 };
  payload2.posts[1].armando = false;
  db.prepare('UPDATE trial_cache SET payload = ? WHERE ig = ?').run(JSON.stringify(payload2), 'negocio.suite');
  r = lm.barrido(db, deps, T0 + 2 * DIA + 3600 * 1000);
  eq(casos().length, 3, 'C6 en el día 3 se abre el aviso del día 3 (la pieza 2 no está cargada)');
  ok(casos()[2].dedup_key.endsWith(':dia3'), 'C6b el aviso es el del día 3');
  r = lm.barrido(db, deps, T0 + 2 * DIA + 2 * 3600 * 1000);
  eq(casos().length, 3, 'C7 ningún aviso se repite');
  // Conversión: el invitado pasa a cliente → la marca se levanta.
  db.prepare('UPDATE users SET is_guest = 0 WHERE guest_ig = ?').run('negocio.suite');
  lm.barrido(db, deps, T0 + 2 * DIA + 3 * 3600 * 1000);
  const fila = db.prepare('SELECT estado, motivo_cierre FROM trial_linea_mano WHERE cache_key = ?').get('negocio.suite');
  eq(fila.estado, 'convertida', 'C8 al convertirse en cliente, la marca se levanta como convertida');
  // Vencimiento: otra marca cuyo reloj ya venció.
  lm.nace(db, { ig: 'viejo.suite', domain: '', testMode: false, allowlisted: false, now: T0 - 10 * DIA });
  db.prepare(`INSERT INTO users (email, is_guest, guest_ig, created_at, trial_ends_at) VALUES ('guest-y@guest.invalid', 1, 'viejo.suite', ?, ?)`).run(utcTxt(T0 - 10 * DIA), T0 - 7 * DIA);
  lm.barrido(db, deps, T0);
  const filaV = db.prepare('SELECT estado, motivo_cierre FROM trial_linea_mano WHERE cache_key = ?').get('viejo.suite');
  eq(filaV.estado, 'cerrada', 'C9 al vencer la prueba, la marca se cierra');
  eq(filaV.motivo_cierre, 'vencio', 'C9b con motivo vencio');
  // Día 2 con la pieza YA cargada a mano: el aviso no sale.
  const db2 = nuevaDb();
  sc.ensureSchema(db2);
  lm.nace(db2, { ig: 'cargada.suite', domain: '', testMode: false, allowlisted: false, now: T0 });
  const pCarg = payloadSemana();
  pCarg.posts[1].mano = { cargada_at: T0 + DIA, dia: 2 };
  pCarg.posts[1].armando = false;
  db2.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('cargada.suite', JSON.stringify(pCarg), T0);
  db2.prepare(`INSERT INTO users (email, is_guest, guest_ig, created_at, trial_ends_at) VALUES ('guest-z@guest.invalid', 1, 'cargada.suite', ?, ?)`).run(utcTxt(T0), T0 + 3 * DIA);
  lm.barrido(db2, deps, T0 + DIA + 1000); // abre entrada (día 2 ya: también evaluaría día 2)
  const casos2 = db2.prepare(`SELECT * FROM support_cases WHERE tipo = 'prueba_linea_mano'`).all();
  eq(casos2.length, 1, 'C10 con la pieza del día 2 ya cargada, solo sale el aviso de entrada');
  ok(casos2[0].dedup_key.endsWith(':entrada'), 'C10b y es el de entrada, no el del día 2');
}

// ---------- D · Pines estáticos del cableado ----------
function seccionD() {
  seccion('D · pines estáticos (el cableado en server.js / scheduler.js / support-cases.js)');
  ok(SERVER.includes("require('./linea-mano')"), 'D1 server.js carga el módulo linea-mano');
  ok((SERVER.match(/lineaMano\.nace\(db,/g) || []).length >= 2, 'D2 la marca nace en AMBAS rutas de generación (sync y stream)');
  ok(SERVER.includes("reason: 'linea-mano'"), 'D3 la cadena de rescate frena en su cabeza sobre una clave marcada');
  ok(SERVER.includes("app.post('/api/admin/trial/pieza-mano'"), 'D4 la palanca admin de carga existe');
  ok(SERVER.includes('sin_marca'), 'D5 la palanca rechaza semanas sin marca (409 sin_marca)');
  ok(SERVER.includes('lineaMano.registrarReseteo(db,'), 'D6 trial-reset deja la exclusión durable del gate');
  ok(SERVER.includes("error: 'linea_mano'"), 'D7 /api/trial/redesign frena sobre una prueba marcada');
  ok(SERVER.includes('function lineaManoSweep()') && SERVER.includes('lineaManoSweep,'), 'D8 el barrido existe y está exportado');
  ok(SERVER.includes('function piezasEsqueletoMano('), 'D9 las piezas-esqueleto (spec + captions, sin medios) existen');
  ok(SCHED.includes('lineaManoSweep') && SCHED.includes('*/5 * * * *'), 'D10 scheduler corre el vigilante cada 5 minutos');
  ok(CASES.includes('prueba_linea_mano'), 'D11 el tipo de caso prueba_linea_mano está registrado en el Conserje');
}

// ---------- E · Boot real + la palanca por HTTP, día a día ----------
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function seccionE() {
  seccion('E · boot aislado + palanca de carga por HTTP (ritmo día a día)');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 19100 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-vigilante-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-vigilante-media-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: 'token-suite', NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let vivo = false;
  try {
    for (let i = 0; i < 60 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch('http://127.0.0.1:' + port + '/api/version').catch(() => null);
      if (resp && resp.status === 200) vivo = true;
    }
    ok(vivo, 'E1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    // Semilla: invitado + su semana en trial_cache (todavía sin marca).
    const dbPath = path.join(dataDir, 'posta.db');
    let db = null;
    for (let i = 0; i < 20 && !db; i++) {
      try { db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout = 5000'); } catch (e) { await new Promise((r) => setTimeout(r, 300)); }
    }
    ok(!!db, 'E2 la base del boot se puede abrir para sembrar');
    if (!db) return;
    const ahora = Date.now();
    db.prepare(`INSERT INTO users (email, password_hash, is_guest, guest_ig, trial_ends_at) VALUES ('guest-http@guest.invalid', '', 1, 'negocio.suite', ?)`).run(ahora + 3 * DIA);
    const uid = Number(db.prepare('SELECT id FROM users WHERE guest_ig = ?').get('negocio.suite').id);
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('negocio.suite', JSON.stringify(payloadSemana()), ahora);
    const post = async (body, token) => {
      const r = await fetch('http://127.0.0.1:' + port + '/api/admin/trial/pieza-mano' + (token ? '?token=' + token : ''), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    };
    const sinToken = await post({ ig: 'negocio.suite', dia: 1, media: PNG_1PX }, null);
    eq(sinToken.status, 403, 'E3 sin token admin, la palanca no responde');
    const sinMarca = await post({ ig: 'negocio.suite', dia: 1, media: PNG_1PX, caption: 'Día 1 a mano' }, 'token-suite');
    eq(sinMarca.status, 409, 'E4 sin marca de línea a mano, la palanca rechaza (409)');
    eq(sinMarca.json.error, 'sin_marca', 'E4b el error es sin_marca: no toca semanas del software ni del gate');
    // Nace la marca (como nacería en la generación) y se carga el día 1.
    if (lm) lm.nace(db, { ig: 'negocio.suite', domain: '', testMode: false, allowlisted: false, now: ahora });
    const d1 = await post({ ig: 'negocio.suite', dia: 1, media: PNG_1PX, caption: 'Día 1 a mano: la estrella', hashtags: '#suite' }, 'token-suite');
    eq(d1.status, 200, 'E5 con marca, la carga del día 1 responde 200');
    let payload = JSON.parse(db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get('negocio.suite').payload);
    ok(!!(payload.posts[0].mano && payload.posts[0].mano.cargada_at), 'E6 la pieza 0 queda cargada a mano en el payload');
    eq(payload.posts[0].armando, false, 'E6b la pieza 0 ya no está en armado');
    eq(payload.posts[0].caption, 'Día 1 a mano: la estrella', 'E6c el caption cargado es el de bamboo');
    eq(payload.posts[1].armando, true, 'E7 la pieza del día 2 sigue en armado: la semana recibe cada posteo EN SU DÍA');
    const d4 = await post({ ig: 'negocio.suite', dia: 4, media: PNG_1PX }, 'token-suite');
    eq(d4.status, 400, 'E8 el día 4 no existe en la prueba: 400');
    const d2 = await post({ ig: 'negocio.suite', dia: 2, media: PNG_1PX, caption: 'Día 2 a mano: el proceso' }, 'token-suite');
    eq(d2.status, 200, 'E9 la carga del día 2 responde 200 en su día');
    payload = JSON.parse(db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get('negocio.suite').payload);
    ok(!!(payload.posts[1].mano && payload.posts[1].mano.cargada_at), 'E9b la pieza 1 queda cargada');
    eq(payload.posts[2].armando, true, 'E9c la pieza del día 3 sigue en armado');
    // El invitado importa su semana (nace un posteo cualquiera de su
    // cuenta): la carga del día 3 crea el posteo por el camino tardío.
    db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source) VALUES (?, '/media/semilla.jpg', 'semilla', '', 'draft', 'image', 'trial')`).run(uid);
    const d3 = await post({ ig: 'negocio.suite', dia: 3, media: PNG_1PX, caption: 'Día 3 a mano: el momento' }, 'token-suite');
    eq(d3.status, 200, 'E10 la carga del día 3 responde 200');
    ok(!!d3.json.post_id, 'E10b con la semana ya importada, la pieza nace como posteo (post_id)');
    payload = JSON.parse(db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get('negocio.suite').payload);
    eq(payload.posts[2].mano.post_id, d3.json.post_id, 'E10c el post_id queda guardado en la pieza del payload');
    const filaPost = db.prepare('SELECT caption, source FROM posts WHERE id = ?').get(d3.json.post_id);
    ok(!!filaPost && filaPost.caption === 'Día 3 a mano: el momento' && filaPost.source === 'trial', 'E10d el posteo creado lleva el caption de bamboo y source trial');
    try { db.close(); } catch (e) {}
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  seccionA();
  seccionB();
  seccionC();
  seccionD();
  await seccionE();
  console.log(`\n== VIGILANTE-ENTRADAS: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
})();
