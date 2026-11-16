// test-lote-palanca-carrusel.js
// MICRO-LOTE PALANCA-CARRUSEL — la mitad (a) del lote CARRUSELES:
// la palanca de carga de la línea a mano (POST /api/admin/trial/
// pieza-mano) acepta el SET COMPLETO de un carrusel en una sola
// llamada y lo persiste en la pieza de la semana del invitado como
// `images[]`, conservando `image` = primera placa y `type` =
// 'carousel' — la forma exacta que importTrialWeek ya consume al
// importar (LOTE CORRECTIVO-5 / LOTE B: type 'carousel' + images[]
// → posteo media_type 'carousel', image_path = portada,
// carousel_paths = el álbum).
//
// Contrato pineado:
//   - El set entra en el campo NUEVO `medias`: array de 2..10 data
//     URLs de imagen (png/jpeg/webp). Sin `medias`, la llamada es la
//     de siempre, byte-idéntica (media/image string, imagen o mp4).
//   - Recargar el mismo día reemplaza el set entero; cargar una sola
//     media sobre un día carrusel lo vuelve pieza simple (images
//     desaparece): el reemplazo es total en las dos direcciones.
//   - Las guardas no cambian ni de orden: token → ig/domain → día
//     1..3 → media válida → 409 sin_marca → 404 sin_semana → 413 si
//     el payload final pasa los 12 MB.
//   - Si el invitado ya importó, la pieza-set nace carrusel también
//     en su fila de `posts` (espejo de importTrialWeek en
//     crearPosteoRescateTardio, y en la actualización del posteo ya
//     creado): sin esto, la carga crearía un posteo de una sola
//     imagen que contradice el set persistido.
//
// Se corre desde la raíz del release:
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-palanca-carrusel.js
// Control contra la base prístina v1126: PZ_ROOT=<base> — los pines
// del camino nuevo caen (el campo `medias` no existe: el set se
// rechaza como media inválida) y los del camino viejo pasan.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.existsSync(path.join(ROOT, 'server.js')) ? fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8') : '';

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

const DIA = 24 * 3600 * 1000;

// Placas de juguete pero distinguibles y decodificables: el orden y
// la identidad de cada placa se asertan por su contenido exacto.
function placa(n, relleno) {
  return 'data:image/jpeg;base64,' + Buffer.from('placa-' + n + '-' + 'x'.repeat(relleno || 48)).toString('base64');
}
function setDe(n, base) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(placa((base || 0) + i + 1));
  return out;
}
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MP4_MIN = 'data:video/mp4;base64,' + Buffer.from('video-de-juguete').toString('base64');

function payloadSemana(ig) {
  return {
    ok: true, business: 'Negocio Carrusel', ig, category: 'indumentaria',
    digest: { producto_estrella: 'Synchilla', productos: [{ nombre: 'Synchilla' }], servicios: [] },
    posts: [0, 1, 2, 3, 4].map((i) => ({ type: 'image', armando: true, headline: 'Pieza ' + i, caption: 'caption ' + i, hashtags: '#suite' })),
    week: [0, 1, 2, 3, 4].map((i) => ({ day: i + 1, date: '2026-11-16', hour: '19:00', post: i })),
  };
}

// ---------- S · Pines estáticos del cableado ----------
function seccionS() {
  seccion('S · pines estáticos (server.js)');
  ok(SERVER.includes('body.medias'), 'S1 la palanca lee el campo nuevo `medias` (el set completo en una llamada)');
  ok(SERVER.includes('pieza.images'), 'S2 la pieza persiste el set como images[]');
  ok(SERVER.includes('delete pieza.images'), 'S3 el camino de una sola media limpia images[] (reemplazo total)');
  ok((SERVER.match(/\(LOTE PALANCA-CARRUSEL\)/g) || []).length >= 2, 'S4 el espejo carrusel existe en la palanca y en crearPosteoRescateTardio');
}

// ---------- H · Boot real + la palanca por HTTP ----------
async function seccionH() {
  seccion('H · boot aislado + palanca carrusel por HTTP');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 19400 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-palanca-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-palanca-media-'));
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
    ok(vivo, 'H1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    const dbPath = path.join(dataDir, 'posta.db');
    let db = null;
    for (let i = 0; i < 20 && !db; i++) {
      try { db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout = 5000'); } catch (e) { await new Promise((r) => setTimeout(r, 300)); }
    }
    ok(!!db, 'H2 la base del boot se puede abrir para sembrar');
    if (!db) return;
    const ahora = Date.now();
    // Clave principal: invitado + semana + marca.
    db.prepare(`INSERT INTO users (email, password_hash, is_guest, guest_ig, trial_ends_at) VALUES ('guest-carr@guest.invalid', '', 1, 'negocio.carrusel', ?)`).run(ahora + 3 * DIA);
    const uid = Number(db.prepare('SELECT id FROM users WHERE guest_ig = ?').get('negocio.carrusel').id);
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('negocio.carrusel', JSON.stringify(payloadSemana('negocio.carrusel')), ahora);
    if (lm) lm.nace(db, { ig: 'negocio.carrusel', domain: '', testMode: false, allowlisted: false, now: ahora });
    // Clave sin marca (su semana existe; la palanca no la puede tocar).
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('sinmarca.carrusel', JSON.stringify(payloadSemana('sinmarca.carrusel')), ahora);
    // Clave marcada sin usuario (para el tope de payload: sin filas, no materializa).
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('grande.carrusel', JSON.stringify(payloadSemana('grande.carrusel')), ahora);
    if (lm) lm.nace(db, { ig: 'grande.carrusel', domain: '', testMode: false, allowlisted: false, now: ahora });

    const post = async (body, token) => {
      const r = await fetch('http://127.0.0.1:' + port + '/api/admin/trial/pieza-mano' + (token ? '?token=' + token : ''), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    };
    const leerPayload = (ig) => JSON.parse(db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(ig).payload);
    const imgsDe = (pieza) => (pieza && Array.isArray(pieza.images)) ? pieza.images : [];
    const SET5 = setDe(5, 0);
    const SET3 = setDe(3, 10);
    const SET3B = setDe(3, 20);

    // Guardas, en el orden de siempre.
    const sinToken = await post({ ig: 'negocio.carrusel', dia: 2, medias: SET5 }, null);
    eq(sinToken.status, 403, 'H3 sin token admin, la palanca no responde (tampoco con set)');
    const sinMarca = await post({ ig: 'sinmarca.carrusel', dia: 2, medias: SET5 }, 'token-suite');
    eq(sinMarca.status, 409, 'H4 set válido sobre clave SIN marca: 409');
    eq(sinMarca.json.error, 'sin_marca', 'H4b el error es sin_marca: el set no toca semanas del software ni del gate');
    const setMaloSinMarca = await post({ ig: 'sinmarca.carrusel', dia: 2, medias: [SET5[0], 'no-es-data-url'] }, 'token-suite');
    eq(setMaloSinMarca.status, 400, 'H5 set inválido se rechaza (400) ANTES de la marca: el orden de guardas de hoy no cambia');
    const diaMalo = await post({ ig: 'negocio.carrusel', dia: 4, medias: SET5 }, 'token-suite');
    eq(diaMalo.status, 400, 'H6 día fuera de rango (1..3) con set: 400');

    // El camino nuevo: el set completo del día 2.
    const d2 = await post({ ig: 'negocio.carrusel', dia: 2, medias: SET5, caption: 'four repairs in. still going.', hashtags: '#wornwear' }, 'token-suite');
    eq(d2.status, 200, 'H7 el set de 5 placas del día 2 responde 200');
    eq(d2.json.placas, 5, 'H7b la respuesta declara las placas cargadas');
    eq(d2.json.post_id, null, 'H7c sin importación previa, la pieza vive en el payload (post_id null)');
    let payload = leerPayload('negocio.carrusel');
    eq(payload.posts[1].type, 'carousel', 'H8 la pieza queda type carousel (la forma que importTrialWeek ya consume)');
    ok(Array.isArray(payload.posts[1].images) && payload.posts[1].images.length === 5, 'H8b images[] persiste las 5 placas');
    eq(payload.posts[1].image, SET5[0], 'H8c image = primera placa, siempre');
    eq(imgsDe(payload.posts[1])[4], SET5[4], 'H8d el orden del set se conserva entero');
    eq(payload.posts[1].video, undefined, 'H8e la pieza carrusel no lleva video');
    eq(payload.posts[1].armando, false, 'H8f la pieza ya no está en armado');
    ok(!!(payload.posts[1].mano && payload.posts[1].mano.cargada_at), 'H8g la pieza queda marcada como cargada a mano');
    eq(payload.posts[1].caption, 'four repairs in. still going.', 'H8h el caption del set es el cargado');

    // La semana lo expone como dato (la renderización es del lote (b)).
    const weekResp = await fetch('http://127.0.0.1:' + port + '/api/trial/week?ig=negocio.carrusel');
    eq(weekResp.status, 200, 'H9 /api/trial/week responde 200');
    const week = await weekResp.json();
    ok(Array.isArray(week.posts[1].images) && week.posts[1].images.length === 5, 'H9b el payload de la semana expone images[5] como dato');
    eq(week.posts[1].image, imgsDe(week.posts[1])[0], 'H9c en la semana, image sigue siendo la primera placa');

    // Recarga del mismo día: el set se reemplaza entero.
    const d2b = await post({ ig: 'negocio.carrusel', dia: 2, medias: SET3 }, 'token-suite');
    eq(d2b.status, 200, 'H10 la recarga del día 2 con un set de 3 responde 200');
    payload = leerPayload('negocio.carrusel');
    eq(imgsDe(payload.posts[1]).length, 3, 'H10b el set nuevo reemplaza al viejo entero (3, no 5+3)');
    eq(payload.posts[1].image, SET3[0], 'H10c image = primera placa del set nuevo');
    ok(!imgsDe(payload.posts[1]).includes(SET5[0]), 'H10d ninguna placa del set anterior sobrevive');

    // Sets fuera de forma: rechazo sin tocar el payload.
    const set1 = await post({ ig: 'negocio.carrusel', dia: 2, medias: setDe(1, 30) }, 'token-suite');
    eq(set1.status, 400, 'H11 un set de 1 no es carrusel: 400 (una sola placa va por el camino de siempre)');
    const set11 = await post({ ig: 'negocio.carrusel', dia: 2, medias: setDe(11, 40) }, 'token-suite');
    eq(set11.status, 400, 'H11b un set de 11 pasa el máximo de la plataforma: 400');
    const setVideo = await post({ ig: 'negocio.carrusel', dia: 2, medias: [SET3[0], MP4_MIN] }, 'token-suite');
    eq(setVideo.status, 400, 'H11c un set con video no es un carrusel de imágenes: 400');
    const setRoto = await post({ ig: 'negocio.carrusel', dia: 2, medias: [SET3[0], 'https://example.com/placa.jpg'] }, 'token-suite');
    eq(setRoto.status, 400, 'H11d una placa ilegible en el set: 400 (no se persiste un set a medias)');
    payload = leerPayload('negocio.carrusel');
    eq(imgsDe(payload.posts[1]).length, 3, 'H11e tras los rechazos, el set persistido sigue siendo el de 3');

    // El camino viejo, byte-idéntico en forma.
    const d1 = await post({ ig: 'negocio.carrusel', dia: 1, media: PNG_1PX, caption: 'Día 1 a mano' }, 'token-suite');
    eq(d1.status, 200, 'H12 la carga de una sola media responde 200 como siempre');
    eq(d1.json.placas, undefined, 'H12b la respuesta del camino viejo no gana campos nuevos');
    payload = leerPayload('negocio.carrusel');
    eq(payload.posts[0].image, PNG_1PX, 'H12c la pieza simple guarda su image como siempre');
    eq(payload.posts[0].images, undefined, 'H12d la pieza simple no lleva images[]');
    eq(payload.posts[0].type, 'image', 'H12e la pieza simple queda type image');
    const d3v = await post({ ig: 'negocio.carrusel', dia: 3, media: MP4_MIN }, 'token-suite');
    eq(d3v.status, 200, 'H13 el video de una sola media responde 200 como siempre');
    payload = leerPayload('negocio.carrusel');
    eq(payload.posts[2].type, 'video', 'H13b la pieza de video queda type video');
    eq(payload.posts[2].images, undefined, 'H13c la pieza de video no lleva images[]');

    // Una sola media sobre el día carrusel: reemplazo total, vuelve a simple.
    const d2simple = await post({ ig: 'negocio.carrusel', dia: 2, media: PNG_1PX, caption: 'Día 2 simple' }, 'token-suite');
    eq(d2simple.status, 200, 'H14 una sola media sobre el día carrusel responde 200');
    payload = leerPayload('negocio.carrusel');
    eq(payload.posts[1].type, 'image', 'H14b la pieza vuelve a ser simple (type image)');
    eq(payload.posts[1].images, undefined, 'H14c images[] desaparece: no queda un carrusel fantasma');
    eq(payload.posts[1].image, PNG_1PX, 'H14d image = la media cargada');

    // El tope de payload de siempre frena también al set.
    const grande = 'data:image/jpeg;base64,' + Buffer.alloc(1024 * 1024, 7).toString('base64');
    const setGrande = Array.from({ length: 10 }, () => grande);
    const dG = await post({ ig: 'grande.carrusel', dia: 1, medias: setGrande }, 'token-suite');
    eq(dG.status, 413, 'H15 un set que lleva el payload pasado los 12 MB: 413, como siempre');
    const payloadG = leerPayload('grande.carrusel');
    eq(payloadG.posts[0].images, undefined, 'H15b el payload frenado no se escribió');

    // Invitado ya importado: el set nace carrusel en su fila de posts.
    db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source) VALUES (?, '/media/semilla.jpg', 'semilla', '', 'draft', 'image', 'trial')`).run(uid);
    const d3 = await post({ ig: 'negocio.carrusel', dia: 3, medias: SET5, caption: 'four repairs in. still going.', hashtags: '#wornwear' }, 'token-suite');
    eq(d3.status, 200, 'H16 con la semana ya importada, el set del día 3 responde 200');
    ok(!!d3.json.post_id, 'H16b la pieza nace como posteo (post_id)');
    payload = leerPayload('negocio.carrusel');
    eq(payload.posts[2].type, 'carousel', 'H16c la pieza del payload queda carrusel (el video anterior se reemplazó entero)');
    eq(payload.posts[2].video, undefined, 'H16d el video de la carga anterior no sobrevive al set');
    ok(!!d3.json.post_id && payload.posts[2].mano && payload.posts[2].mano.post_id === d3.json.post_id, 'H16e el post_id queda guardado en la pieza');
    const fila = d3.json.post_id ? db.prepare('SELECT image_path, media_type, carousel_paths FROM posts WHERE id = ?').get(d3.json.post_id) : null;
    eq(fila && fila.media_type, 'carousel', 'H17 el posteo nace media_type carousel (espejo de la importación)');
    let album = [];
    try { album = JSON.parse((fila && fila.carousel_paths) || '[]'); } catch (e) {}
    eq(album.length, 5, 'H17b carousel_paths guarda el álbum completo (5 rutas)');
    eq(fila && fila.image_path, album[0], 'H17c image_path = la portada (primera ruta del álbum)');
    ok(album.length === 5 && album.every((r) => fs.existsSync(path.join(mediaDir, path.basename(r)))), 'H17d las 5 láminas existen en disco');

    // Recarga sobre el posteo ya creado: mismo posteo, álbum nuevo.
    const d3b = await post({ ig: 'negocio.carrusel', dia: 3, medias: SET3B, caption: 'four repairs in. still going.' }, 'token-suite');
    eq(d3b.status, 200, 'H18 la recarga del set sobre el posteo creado responde 200');
    eq(d3b.json.post_id, d3.json.post_id, 'H18b se actualiza el MISMO posteo (no nace otro)');
    const fila2 = d3.json.post_id ? db.prepare('SELECT media_type, carousel_paths FROM posts WHERE id = ?').get(d3.json.post_id) : null;
    let album2 = [];
    try { album2 = JSON.parse((fila2 && fila2.carousel_paths) || '[]'); } catch (e) {}
    eq(album2.length, 3, 'H18c el álbum del posteo se reemplaza entero (3 rutas)');
    eq(fila2 && fila2.media_type, 'carousel', 'H18d el posteo sigue carrusel');

    // Y una sola media sobre ese día: el posteo vuelve a imagen simple.
    const d3c = await post({ ig: 'negocio.carrusel', dia: 3, media: PNG_1PX, caption: 'Día 3 simple' }, 'token-suite');
    eq(d3c.status, 200, 'H19 una sola media sobre el día carrusel importado responde 200');
    eq(d3c.json.post_id, d3.json.post_id, 'H19b sigue siendo el mismo posteo');
    const fila3 = d3.json.post_id ? db.prepare('SELECT media_type, carousel_paths FROM posts WHERE id = ?').get(d3.json.post_id) : null;
    eq(fila3 && fila3.media_type, 'image', 'H19c el posteo vuelve a media_type image');
    ok(!!fila3 && !fila3.carousel_paths, 'H19d carousel_paths queda vacío: la fila no contradice al payload');
    try { db.close(); } catch (e) {}
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  seccionS();
  await seccionH();
  console.log(`\n== PALANCA-CARRUSEL: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
})();
