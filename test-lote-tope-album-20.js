#!/usr/bin/env node
/* LOTE TOPE-ALBUM-20 — suite rojo-primero.
   Una foto = un lugar en el álbum: el chat subía cada foto dos veces
   (/api/media + /api/album/photo) y 10 fotos llenaban el álbum (20 filas).
   El fix: /api/album/photo ADOPTA la fila de /api/media (?adopt=id) sin
   insertar otra, y /api/media tiene el mismo tope honesto del álbum.
   Uso: node test-lote-tope-album-20.js [árbol] — por defecto release-v780.
   Boot real del servidor con DATA_DIR temporal + join trial (sin clave IA). */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');

const TREE = process.argv[2] || path.join(__dirname, 'release-v780');
const PORT = 34792;
const TEST_KEY = 'tope-album-20';
const JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300030202030202030303030403'
  + '0304050805050404050a070706080c0a0c0c0b0a0b0b0d0e12100d0e110e0b0b101610111314'
  + '1515150c0f1718181614121a1514161a141a141a141affdb0043010304040504050905050914'
  + '0d0b0d141414141414141414141414141414141414141414141414141414141414141414'
  + '14141414141414141414141414141414141414141414ffc0001108000100010301220002'
  + '1101031101ffc40014000100000000000000000000000000000000000008ffc400141001'
  + '00000000000000000000000000000000000008ffc400140101000000000000000000000000'
  + '0000000000ffc40014110100000000000000000000000000000000000008ffda000c0301'
  + '0002110311003f003f00bfffd9', 'hex');

let PASS = 0, FAIL = 0;
const failed = [];
function check(name, cond, detail) {
  if (cond) { PASS++; console.log('  ok  ' + name); }
  else { FAIL++; failed.push(name); console.log('  FALLO ' + name + (detail ? ' — ' + detail : '')); }
}

function req(method, p, body, ctype, cookie) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: { ...(ctype ? { 'Content-Type': ctype } : {}), ...(cookie ? { Cookie: cookie } : {}) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ st: res.statusCode, txt: d })); });
    r.on('error', (e) => resolve({ st: 0, txt: 'ERR ' + e.message }));
    r.setTimeout(120000, () => { try { r.destroy(); } catch (e) {} resolve({ st: 0, txt: 'TIMEOUT' }); });
    if (body) r.write(body);
    r.end();
  });
}
const j = (s) => { try { return JSON.parse(s); } catch (e) { return null; }; };

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    const r = await req('GET', '/api/version');
    if (r.st === 200) return j(r.txt);
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  return null;
}
// El join devuelve la cookie en el header Set-Cookie; req() no la expone:
// se re-hace el join con captura de headers.
function reqH(method, p, body, ctype, cookie) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: { ...(ctype ? { 'Content-Type': ctype } : {}), ...(cookie ? { Cookie: cookie } : {}) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ st: res.statusCode, txt: d, headers: res.headers })); });
    r.on('error', (e) => resolve({ st: 0, txt: 'ERR ' + e.message, headers: {} }));
    r.setTimeout(120000, () => { try { r.destroy(); } catch (e) {} resolve({ st: 0, txt: 'TIMEOUT', headers: {} }); });
    if (body) r.write(body);
    r.end();
  });
}
async function joinUser(ig) {
  const r = await reqH('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
    Buffer.from(JSON.stringify({ kind: 'join', ig, device: 'probe' })), 'application/json');
  const b = j(r.txt);
  if (!b || !b.ok) throw new Error('join falló: ' + r.txt.slice(0, 200));
  const sc = r.headers['set-cookie'];
  const cookie = Array.isArray(sc) ? sc[0].split(';')[0] : String(sc || '').split(';')[0];
  return { cookie, userId: b.user_id };
}
async function rowCount(cookie) {
  // Solo fotos+videos: lo que cuenta el tope del álbum (los diseños no cuentan).
  const r = await req('GET', '/api/assets', null, null, cookie);
  const rows = j(r.txt);
  return Array.isArray(rows) ? rows.filter((x) => x.kind === 'photo' || x.kind === 'video').length : -1;
}
async function albumCount(cookie) {
  const r = await req('GET', '/api/album', null, null, cookie);
  const d = j(r.txt);
  return d && Array.isArray(d.photos) ? d.photos.length : -1;
}
async function uploadMedia(cookie, n, suffix) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const r = await req('POST', '/api/media' + (suffix || ''), JPEG, 'image/jpeg', cookie);
    if (r.st !== 200) return { ids, err: { st: r.st, txt: r.txt.slice(0, 200) } };
    ids.push(j(r.txt));
  }
  return { ids, err: null };
}
async function uploadAlbumRaw(cookie, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', cookie);
    out.push({ st: r.st, txt: r.txt.slice(0, 200) });
    if (r.st !== 200) break;
  }
  return out;
}
async function uploadAlbumAdopt(cookie, ids) {
  const out = [];
  for (const id of ids) {
    const r = await req('POST', '/api/album/photo?adopt=' + id, JPEG, 'image/jpeg', cookie);
    out.push({ st: r.st, txt: r.txt.slice(0, 200), id });
    if (r.st !== 200) break;
  }
  return out;
}

async function main() {
  const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
  const buildTree = (serverSrc.match(/const BUILD_ID = '([^']+)'/) || [])[1] || '?';
  console.log('árbol: ' + TREE + ' BUILD ' + buildTree);

  // ---------- Parte A: servidor real ----------
  console.log('== Parte A: servidor real ==');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tope-album-'));
  const mediaDir = path.join(tmp, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmp, MEDIA_DIR: mediaDir,
    ADMIN_TOKEN: 'probe-admin', NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const proc = spawn('node', ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  proc.stdout.on('data', (d) => { serverLog += d.toString(); });
  proc.stderr.on('data', (d) => { serverLog += d.toString(); });
  try {
    const ver = await waitUp();
    check('A0 boot: /api/version responde el BUILD del árbol (sin cruce con otro servidor)',
      !!ver && ver.build === buildTree, ver ? JSON.stringify(ver.build) : 'sin respuesta');

    // A1: tanda de 10 por el flujo del chat con adopt → el álbum cuenta 10
    // (el chat sube con ?from=chat, que es lo que manda chatUploadPhotos)
    const u1 = await joinUser('tope-a1');
    const m1 = await uploadMedia(u1.cookie, 10, '?from=chat');
    check('A1a media x10 sube y devuelve id (para adoptar)',
      !m1.err && m1.ids.length === 10 && m1.ids.every((d) => d && typeof d.id === 'number' && d.id > 0),
      m1.err ? JSON.stringify(m1.err) : JSON.stringify(m1.ids.slice(0, 2)));
    const ad1 = await uploadAlbumAdopt(u1.cookie, m1.ids.map((d) => d.id));
    check('A1b album?adopt x10 da 200 con el mismo id (reusa la fila)',
      ad1.length === 10 && ad1.every((o, i) => o.st === 200 && j(o.txt) && j(o.txt).id === m1.ids[i].id),
      JSON.stringify(ad1.slice(0, 2)));
    check('A1c álbum tras tanda 1: 10 filas, no 20',
      (await rowCount(u1.cookie)) === 10 && (await albumCount(u1.cookie)) === 10,
      'rows=' + (await rowCount(u1.cookie)) + ' album=' + (await albumCount(u1.cookie)));

    // A2: segunda tanda de 10 → la propuesta se arma (todo 200, 20 filas)
    const m2 = await uploadMedia(u1.cookie, 10, '?from=chat');
    check('A2a media segunda tanda x10 sube',
      !m2.err && m2.ids.length === 10, m2.err ? JSON.stringify(m2.err) : '');
    const ad2 = await uploadAlbumAdopt(u1.cookie, m2.ids.map((d) => d.id));
    check('A2b album?adopt segunda tanda x10 da 200',
      ad2.length === 10 && ad2.every((o) => o.st === 200), JSON.stringify(ad2.find((o) => o.st !== 200) || ''));
    check('A2c álbum tras tanda 2: 20 filas exactas',
      (await rowCount(u1.cookie)) === 20 && (await albumCount(u1.cookie)) === 20,
      'rows=' + (await rowCount(u1.cookie)) + ' album=' + (await albumCount(u1.cookie)));

    // A3: 21ª foto del CHAT → mensaje honesto del tope en /api/media
    const r21 = await req('POST', '/api/media?from=chat', JPEG, 'image/jpeg', u1.cookie);
    check('A3 media #21 del chat da 400 con el mensaje honesto del tope',
      r21.st === 400 && /llegó a 20 archivos/.test(r21.txt), r21.st + ' ' + r21.txt.slice(0, 150));
    check('A3b el álbum sigue en 20 filas tras el rechazo',
      (await rowCount(u1.cookie)) === 20, 'rows=' + (await rowCount(u1.cookie)));
    // A3c: las otras puertas de /api/media (imágenes generadas: Hacerlo
    // posteo, historias, creator) NO mandan from=chat y quedan sin tope,
    // como hoy — toparlas rompería la generación con el álbum lleno.
    const rGen = await req('POST', '/api/media', JPEG, 'image/jpeg', u1.cookie);
    check('A3c /api/media sin from=chat con el álbum lleno: 200 (puertas generadas sin tope)',
      rGen.st === 200, rGen.st + ' ' + rGen.txt.slice(0, 150));

    // A4: la puerta cruda del álbum sigue topando igual (sin regresión)
    const u2 = await joinUser('tope-a4');
    await uploadMedia(u2.cookie, 10);
    const raw2 = await uploadAlbumRaw(u2.cookie, 10);
    check('A4a flujo crudo viejo (media+album sin adopt) sigue dando 20 filas',
      (await rowCount(u2.cookie)) === 20, 'rows=' + (await rowCount(u2.cookie)));
    const rRaw21 = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', u2.cookie);
    check('A4b album crudo #21 da 400 con el mismo mensaje',
      rRaw21.st === 400 && /llegó a 20 archivos/.test(rRaw21.txt), rRaw21.st + ' ' + rRaw21.txt.slice(0, 150));

    // A5: adopt con id inexistente → cae al flujo normal (200 + fila nueva)
    const u3 = await joinUser('tope-a5');
    const before5 = await rowCount(u3.cookie);
    const rBad = await req('POST', '/api/album/photo?adopt=999999', JPEG, 'image/jpeg', u3.cookie);
    check('A5 adopt con id inexistente: 200 por el flujo normal',
      rBad.st === 200 && j(rBad.txt) && j(rBad.txt).ok === true, rBad.st + ' ' + rBad.txt.slice(0, 150));
    check('A5b adopt fallido inserta UNA fila nueva (sin duplicar ni romper)',
      (await rowCount(u3.cookie)) === before5 + 1, 'rows=' + (await rowCount(u3.cookie)));

    // A6: adopt con id DE OTRO usuario → no adopta (flujo normal, fila propia)
    const u4 = await joinUser('tope-a6a');
    const m4 = await uploadMedia(u4.cookie, 1);
    const idA = m4.ids[0].id;
    const u5 = await joinUser('tope-a6b');
    const rCross = await req('POST', '/api/album/photo?adopt=' + idA, JPEG, 'image/jpeg', u5.cookie);
    const dCross = j(rCross.txt);
    check('A6a adopt con id ajeno: 200 pero con id NUEVO propio (no adopta la fila ajena)',
      rCross.st === 200 && dCross && dCross.ok === true && dCross.id !== idA,
      rCross.st + ' ' + rCross.txt.slice(0, 150));
    check('A6b el álbum del dueño original sigue con 1 fila',
      (await rowCount(u4.cookie)) === 1, 'rows=' + (await rowCount(u4.cookie)));
    check('A6c el álbum del segundo usuario tiene 1 fila propia',
      (await rowCount(u5.cookie)) === 1, 'rows=' + (await rowCount(u5.cookie)));

    // A7: álbum viejo con doble conteo sigue andando (sin migración)
    const u6 = await joinUser('tope-a7');
    await uploadMedia(u6.cookie, 10);
    await uploadAlbumRaw(u6.cookie, 10);
    check('A7a álbum viejo con doble conteo: GET /api/album 200 con 20 fotos',
      (await albumCount(u6.cookie)) === 20, 'album=' + (await albumCount(u6.cookie)));
    const alb6 = j((await req('GET', '/api/album', null, null, u6.cookie)).txt);
    const someId = alb6.photos[0].id;
    const rChoice = await req('POST', '/api/album/' + someId + '/choice',
      Buffer.from(JSON.stringify({ choice: 'despues' })), 'application/json', u6.cookie);
    check('A7b choice sobre un asset viejo: 200',
      rChoice.st === 200 && j(rChoice.txt) && j(rChoice.txt).ok === true,
      rChoice.st + ' ' + rChoice.txt.slice(0, 150));
    const rProp = await req('POST', '/api/album/' + someId + '/propuesta',
      Buffer.from(JSON.stringify({ vision: 'robot azul' })), 'application/json', u6.cookie);
    check('A7c propuesta sobre un asset viejo: NO falla por el álbum (sin error de tope)',
      !/llegó a 20 archivos/.test(rProp.txt), rProp.st + ' ' + rProp.txt.slice(0, 150));

    // A8: video adopt (un video = un lugar)
    const mp4Path = path.join(TREE, 'ai-avatar-working.mp4');
    const mp4 = fs.existsSync(mp4Path) ? fs.readFileSync(mp4Path) : null;
    check('A8a hay un mp4 real en el árbol para probar video', !!mp4, mp4Path);
    if (mp4) {
      const u7 = await joinUser('tope-a8');
      const rv = await req('POST', '/api/assets?kind=video', mp4, 'video/mp4', u7.cookie);
      const dv = j(rv.txt);
      check('A8b /api/assets?kind=video sube y devuelve id',
        rv.st === 200 && dv && dv.ok === true && typeof dv.id === 'number' && dv.id > 0,
        rv.st + ' ' + rv.txt.slice(0, 200));
      if (dv && dv.id) {
        const ra = await req('POST', '/api/album/photo?adopt=' + dv.id, mp4, 'video/mp4', u7.cookie);
        const da = j(ra.txt);
        check('A8c album?adopt del video: 200 con el MISMO id (sin fila nueva)',
          ra.st === 200 && da && da.ok === true && da.id === dv.id && da.kind === 'video',
          ra.st + ' ' + ra.txt.slice(0, 200));
        check('A8d álbum tras video adopt: 1 fila de video',
          (await rowCount(u7.cookie)) === 1, 'rows=' + (await rowCount(u7.cookie)));
      }
    }

    // A10: diseños no se topan ni cuentan (kind='design' exento)
    const beforeDes = await rowCount(u1.cookie);
    const rDes = await req('POST', '/api/media?kind=design', JPEG, 'image/jpeg', u1.cookie);
    check('A10 media?kind=design con el álbum lleno: 200 (los diseños no se topan)',
      rDes.st === 200, rDes.st + ' ' + rDes.txt.slice(0, 150));
    check('A10b el álbum (fotos+videos) no crece tras el diseño',
      (await rowCount(u1.cookie)) === beforeDes, 'antes=' + beforeDes + ' rows=' + (await rowCount(u1.cookie)));
  } finally {
    try { proc.kill('SIGTERM'); } catch (e) {}
  }

  // ---------- Parte B: estáticos + auditoría de funciones ----------
  console.log('== Parte B: estáticos ==');
  check('B1 /api/media devuelve el id (para adoptar)',
    /res\.json\(\{ path: filePath, id: mediaId \}\)/.test(serverSrc));
  check('B2 /api/media topa las fotos del chat (from=chat) con el conteo del álbum (photo+video >= 20)',
    /if \(req\.query\.from === 'chat' && kind === 'photo'\) \{\s*\n\s*const nAlb = db\.prepare\(`SELECT COUNT\(\*\) AS c FROM assets WHERE user_id = \? AND kind IN \('photo','video'\)`\)/.test(serverSrc));
  const albumH = serverSrc.slice(serverSrc.indexOf("app.post('/api/album/photo'"));
  check('B3 /api/album/photo tiene la rama adopt ANTES del chequeo de body vacío',
    albumH.indexOf('const adoptId = parseInt') !== -1
    && albumH.indexOf('const adoptId = parseInt') < albumH.indexOf("if (!req.body || !req.body.length) return res.status(400).json({ error: 'Archivo vacío' });"));
  check('B4 adopt verifica propiedad (id + user_id) y kind photo/video',
    /WHERE id = \? AND user_id = \?/.test(serverSrc) && /row\.kind === 'photo' \|\| row\.kind === 'video'/.test(serverSrc));
  check('B5 adopt corre misión + tag + calidad sobre la fila existente',
    /missionAdopt/.test(serverSrc) && /tagAlbumPhoto\(uid, row\.id, row\.file_path/.test(serverSrc)
    && /measurePhotoQuality\(fullAdopt\)/.test(serverSrc));
  check('B6 chatUploadPhotos guarda mediaId en CHAT_PHOTOS',
    /CHAT_PHOTOS\.push\(\{ file_path: data\.path, mediaId: data\.id \|\| 0,/.test(appSrc));
  check('B7 pzSftAsegurarAssetTmp usa ?adopt= con mediaId y cae al flujo normal sin él',
    /albumUrl = \(it\.mediaId > 0\) \? \("\/api\/album\/photo\?adopt=" \+ it\.mediaId\) : "\/api\/album\/photo"/.test(appSrc));
  const fnsApp = ['pzSftAsegurarAssetTmp', 'chatUploadPhotos', 'pzSftKind', 'pzSftRecordHuella', 'pzSftHuella', 'fileToThumb', 'fileToVideoThumb'];
  const missingApp = fnsApp.filter((f) => !new RegExp('function ' + f + '\\b').test(appSrc));
  check('B8 funciones de app.js tocadas existen definidas (7/7)',
    missingApp.length === 0, 'faltan: ' + missingApp.join(','));
  const fnsSrv = ['albumMission', 'measurePhotoQuality', 'qualityIssuesFromMetrics', 'tagAlbumPhoto', 'langOfUser', 'saveIngestedPhoto'];
  const missingSrv = fnsSrv.filter((f) => !new RegExp('function ' + f + '\\b').test(serverSrc));
  check('B9 funciones de server.js usadas por el fix existen definidas (6/6)',
    missingSrv.length === 0, 'faltan: ' + missingSrv.join(','));
  // B10: censo de llamadores de /api/media (v780): 4 literales en app.js
  // (foto de borrador 8579, Hacerlo posteo 9332, pcUploadPhoto 13956,
  // renderStoryImage 14484) + chatUploadPhotos por URL variable con
  // ?from=chat (1 sola vez) + 1 en chunk-creator.js. Solo el chat manda
  // from=chat: es la única puerta que topa /api/media.
  const mediaCallers = (appSrc.match(/fetch\('\/api\/media'/g) || []).length;
  const fromChat = (appSrc.match(/\?from=chat/g) || []).length;
  const chunkSrc = fs.readFileSync(path.join(TREE, 'public', 'chunk-creator.js'), 'utf8');
  const chunkCallers = (chunkSrc.match(/fetch\('\/api\/media'/g) || []).length;
  check('B10 censo /api/media: 4 literales en app.js + ?from=chat 1 vez (solo el chat) + 1 en chunk-creator.js',
    mediaCallers === 4 && fromChat === 1 && chunkCallers === 1 && /'\/api\/media\?from=chat'/.test(appSrc),
    'literales app.js: ' + mediaCallers + ' · ?from=chat: ' + fromChat + ' · chunk-creator: ' + chunkCallers);

  console.log(`\nTOTAL: ${PASS} ok / ${FAIL} fallos${FAIL ? ' — ' + failed.join(' | ') : ''}`);
  process.exit(FAIL ? 1 : 0);
}

main().catch((e) => { console.error('SUITE ROTA:', e); process.exit(2); });
