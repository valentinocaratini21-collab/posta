#!/usr/bin/env node
/* LOTE TOPE-ALBUM-20 · MATERIAL DE TRABAJO (2026-11-23) — suite.
   El tope del álbum contaba TODO el material conservado: una cuenta fiel
   que postea todos los días llenaba los 20 con su propio historial y la
   puerta de Subir moría en silencio (el cliente descartaba el error del
   servidor y mostraba un genérico). El arreglo:
   (a) el tope cuenta SOLO el material de trabajo — assets todavía no
       incorporados a ningún posteo (publicado, programado o en borrador,
       el predicado «usado» de la biblioteca) — en las DOS puertas que son
       el tope del álbum: POST /api/album/photo y POST /api/media?from=chat;
   (b) pzSubirUpload muestra el error real del servidor.
   Uso: node test-lote-tope-album-trabajo.js [árbol] — por defecto este dir.
   Boot real con DATA_DIR temporal + join trial (sin clave IA). */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] || __dirname;
const PORT = 34795;
const TEST_KEY = 'tope-album-trabajo';
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
const j = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    const r = await req('GET', '/api/version');
    if (r.st === 200) return j(r.txt);
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  return null;
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
async function listAssets(cookie) {
  const r = await req('GET', '/api/assets', null, null, cookie);
  const rows = j(r.txt);
  return Array.isArray(rows) ? rows.filter((x) => x.kind === 'photo' || x.kind === 'video') : [];
}

async function main() {
  const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
  const idxSrc = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
  const buildTree = (serverSrc.match(/const BUILD_ID = '([^']+)'/) || [])[1] || '?';
  console.log('árbol: ' + TREE + ' BUILD ' + buildTree);

  console.log('== Parte B: estáticos ==');
  const predCount = (serverSrc.match(/NOT EXISTS \(SELECT 1 FROM posts p/g) || []).length;
  check('B1 el predicado «material de trabajo» está en las DOS puertas del álbum (album/photo + media?from=chat)',
    predCount === 2, 'ocurrencias=' + predCount);
  check('B2 pzSubirUpload marca el error del servidor (fromServer) y el catch lo muestra',
    /er\.fromServer = !!\(d && d\.error\)/.test(appSrc) && /pzSubirErr\(e && e\.fromServer/.test(appSrc));
  const pzBuild = (appSrc.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
  check('B3 paridad BUILD/PZ_BUILD y app.js?v= del index',
    buildTree === '20261105-v1278' && pzBuild === buildTree && idxSrc.includes('app.js?v=907'),
    'BUILD=' + buildTree + ' PZ=' + pzBuild);

  console.log('== Parte A: servidor real ==');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tope-trabajo-'));
  const mediaDir = path.join(tmp, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmp, MEDIA_DIR: mediaDir,
    ADMIN_TOKEN: 'probe-admin', NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const proc = spawn('node', ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  proc.stdout.on('data', (d) => { serverLog += d.toString(); });
  proc.stderr.on('data', (d) => { serverLog += d.toString(); });
  const seed = new DatabaseSync(path.join(tmp, 'posta.db'), { readOnly: false });
  function seedAsset(uid, tag) {
    const fp = '/media/seed-' + uid + '-' + tag + '.jpg';
    const info = seed.prepare('INSERT INTO assets (user_id, file_path, kind) VALUES (?,?,?)').run(uid, fp, 'photo');
    return { id: Number(info.lastInsertRowid), file_path: fp };
  }
  function seedPost(uid, status, fotoAssetId, imagePath, carouselPaths) {
    seed.prepare('INSERT INTO posts (user_id, image_path, caption, status, foto_asset_id, carousel_paths) VALUES (?,?,?,?,?,?)')
      .run(uid, imagePath, 'seed', status, fotoAssetId, carouselPaths || '');
  }
  try {
    const ver = await waitUp();
    check('A0 boot: /api/version responde el BUILD del árbol', !!ver && ver.build === buildTree,
      ver ? JSON.stringify(ver.build) : 'sin respuesta');

    // A1: 20 de trabajo sembrados → la subida real rebota con el mensaje
    // honesto (la siembra es por DB porque el FIX ÁLBUM deduplica por
    // huella los bytes idénticos entre puertas; el conteo que se prueba
    // es SQL y las sondas de comportamiento son subidas reales).
    const uA = await joinUser('casa-tope');
    const A = [];
    for (let i = 0; i < 20; i++) A.push(seedAsset(uA.userId, 'a' + i));
    const rowsA = await listAssets(uA.cookie);
    check('A1a la cuenta llega a 20 filas foto/video de trabajo', rowsA.length === 20, 'rows=' + rowsA.length);
    const r21 = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', uA.cookie);
    check('A1b con 20 de trabajo, Subir da 400 con el mensaje honesto del tope',
      r21.st === 400 && /llegó a 20 archivos/.test(r21.txt), r21.st + ' ' + r21.txt.slice(0, 150));

    // A2: los 20 se incorporan (tres mecanismos) → la puerta se abre
    for (let i = 0; i < 8; i++) seedPost(uA.userId, 'published', A[i].id, A[i].file_path, '');
    for (let i = 8; i < 14; i++) seedPost(uA.userId, 'scheduled', null, A[i].file_path, '');
    seedPost(uA.userId, 'draft', null, A[14].file_path, JSON.stringify(A.slice(14).map((a) => a.file_path)));
    const rOk = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', uA.cookie);
    check('A2 con los 20 incorporados (publicado/programado/borrador), Subir vuelve a dar 200',
      rOk.st === 200 && j(rOk.txt) && j(rOk.txt).ok === true, rOk.st + ' ' + rOk.txt.slice(0, 150));

    // A3: el techo sigue exacto sobre el material de trabajo (1 nuevo + 19 sembrados = 20)
    for (let i = 0; i < 19; i++) seedAsset(uA.userId, 'w' + i);
    const rFull = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', uA.cookie);
    check('A3 con 20 de trabajo otra vez (los incorporados no cuentan), Subir da 400',
      rFull.st === 400 && /llegó a 20 archivos/.test(rFull.txt), rFull.st + ' ' + rFull.txt.slice(0, 150));

    // A4: la puerta del chat (?from=chat) aplica la misma regla
    const uB = await joinUser('chat-tope');
    const B = [];
    for (let i = 0; i < 20; i++) B.push(seedAsset(uB.userId, 'b' + i));
    const rChat1 = await req('POST', '/api/media?from=chat', JPEG, 'image/jpeg', uB.cookie);
    check('A4a chat con 20 de trabajo: 400 con el mensaje del tope',
      rChat1.st === 400 && /llegó a 20 archivos/.test(rChat1.txt), rChat1.st + ' ' + rChat1.txt.slice(0, 150));
    seedPost(uB.userId, 'published', null, B[0].file_path, JSON.stringify(B.map((a) => a.file_path)));
    const rChat2 = await req('POST', '/api/media?from=chat', JPEG, 'image/jpeg', uB.cookie);
    check('A4b chat con los 20 incorporados en un carrusel publicado: 200',
      rChat2.st === 200, rChat2.st + ' ' + rChat2.txt.slice(0, 150));

    // A5: un posteo cancelado o fallido NO incorpora (no libera el techo)
    const uC = await joinUser('cancel-tope');
    const C = [];
    for (let i = 0; i < 20; i++) C.push(seedAsset(uC.userId, 'c' + i));
    seedPost(uC.userId, 'cancelled', null, C[0].file_path, JSON.stringify(C.map((a) => a.file_path)));
    seedPost(uC.userId, 'failed', C[1].id, C[1].file_path, '');
    const rC = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', uC.cookie);
    check('A5 referencias desde posteos cancelados/fallidos no liberan: sigue 400',
      rC.st === 400 && /llegó a 20 archivos/.test(rC.txt), rC.st + ' ' + rC.txt.slice(0, 150));
  } catch (e) {
    check('sin excepción en la corrida', false, e.message + '\n' + serverLog.slice(-800));
  } finally {
    try { proc.kill('SIGTERM'); } catch (e) {}
    try { seed.close(); } catch (e) {}
    await new Promise((r2) => setTimeout(r2, 800));
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nRESULTADO: ' + PASS + ' ok · ' + FAIL + ' MAL' + (failed.length ? ' — fallan: ' + failed.join(' | ') : ''));
  process.exit(FAIL ? 1 : 0);
}
main();
