#!/usr/bin/env node
/* LOTE TOPE-ALBUM-20 · INCORPORADO REAL (2026-11-23) — suite.
   La corrección del arreglo de v1275: su predicado «incorporado» miraba
   solo image_path / carousel_paths / foto_asset_id, y en producción los
   posteos reales guardan su media en más campos que esos (la portada,
   la anterior restaurable y su historial de versiones, el vínculo
   durable de Subir — recibo/pedido — y la misma foto duplicada por
   huella). Resultado en vivo: la cuenta de la casa, con su historial
   publicado, seguía topada y la lámina 2 del carrusel del día rebotó.
   El predicado corregido (ASSET_INCORPORADO_SQL, compartido por las dos
   puertas del tope y la guarda de borrado) cubre CADA forma real de
   guardado encontrada en el código de producción, y esta suite lleva
   una fixture por forma:
     F1 image_path directo (cargar-pieza / pieza-mano / sesión)
     F2 carousel_paths JSON (carruseles)
     F3 foto_asset_id (flujo restyle desde la foto real y «usar tu foto»)
     F4 cover_path (la portada de un posteo de video)
     F5 prev_image_path (la media anterior restaurable del posteo)
     F6 post_versions.image_path (el historial del posteo)
     F7 subir_recibos activo → su posteo (vínculo durable de Subir)
     F8 subir_pedidos_voz → su posteo (el pedido que el material produjo)
     F9 content_hash (la misma foto, otra fila, otro path)
     F10 video por cargar-pieza (image_path = el video; la casa, post 744)
   Y los controles: el techo sigue exacto sobre el material sin usar y
   las referencias muertas (posteo cancelado/fallido, recibo deshecho)
   NO incorporan.
   Uso: node test-lote-tope-album-incorporado.js [árbol] — por defecto
   este dir. Boot real con DATA_DIR temporal + join trial (sin clave IA). */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] || __dirname;
const PORT = 34796;
const TEST_KEY = 'tope-album-incorporado';
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

async function main() {
  const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
  const idxSrc = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
  const buildTree = (serverSrc.match(/const BUILD_ID = '([^']+)'/) || [])[1] || '?';
  console.log('árbol: ' + TREE + ' BUILD ' + buildTree);

  console.log('== Parte B: estáticos ==');
  const fragUses = (serverSrc.match(/\$\{ASSET_INCORPORADO_SQL\}/g) || []).length;
  check('B1 el predicado compartido ASSET_INCORPORADO_SQL se usa en las DOS puertas del tope y en la guarda de borrado',
    fragUses === 3, 'usos=' + fragUses);
  const fragDef = (serverSrc.match(/const ASSET_INCORPORADO_SQL = `([\s\S]*?)`;/) || [])[1] || '';
  check('B2 el predicado cubre cada forma real: image_path, carousel_paths, foto_asset_id, cover_path, prev_image_path, post_versions, subir_recibos, subir_pedidos_voz, content_hash',
    ['image_path', 'carousel_paths', 'foto_asset_id', 'cover_path', 'prev_image_path', 'post_versions', 'subir_recibos', 'subir_pedidos_voz', 'content_hash']
      .every((f) => fragDef.includes(f)));
  const pzBuild = (appSrc.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
  check('B3 paridad BUILD/PZ_BUILD y app.js?v= del index',
    buildTree === '20261105-v1278' && pzBuild === buildTree && idxSrc.includes('app.js?v=907'),
    'BUILD=' + buildTree + ' PZ=' + pzBuild);

  console.log('== Parte A: servidor real ==');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tope-incorporado-'));
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
  function seedAsset(uid, tag, kind, hash) {
    const fp = '/media/seed-' + uid + '-' + tag + (kind === 'video' ? '.mp4' : '.jpg');
    const info = seed.prepare('INSERT INTO assets (user_id, file_path, kind, content_hash) VALUES (?,?,?,?)')
      .run(uid, fp, kind || 'photo', hash || '');
    return { id: Number(info.lastInsertRowid), file_path: fp };
  }
  function seedPost(uid, f) {
    const info = seed.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, foto_asset_id, carousel_paths, cover_path, prev_image_path)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(uid, f.image_path || '/media/ajena-' + uid + '.jpg', 'seed', f.status || 'published',
        f.media_type || 'image', f.foto_asset_id || null, f.carousel_paths || '', f.cover_path || '', f.prev_image_path || '');
    return Number(info.lastInsertRowid);
  }
  function seedVersion(postId, imagePath) {
    seed.prepare('INSERT INTO post_versions (post_id, caption, hashtags, image_path) VALUES (?,?,?,?)')
      .run(postId, '', '', imagePath);
  }
  function seedRecibo(uid, assetId, postId, estado) {
    seed.prepare(`INSERT INTO subir_recibos (user_id, asset_id, kind, modo, datos, post_id, estado) VALUES (?,?, 'foto', 'revision', '{}', ?, ?)`)
      .run(uid, assetId, postId, estado);
  }
  function seedPedido(uid, assetId, postId) {
    seed.prepare(`INSERT INTO subir_pedidos_voz (user_id, asset_id, kind, estado, post_id) VALUES (?,?, 'foto', 'armado', ?)`)
      .run(uid, assetId, postId);
  }
  try {
    const ver = await waitUp();
    check('A0 boot: /api/version responde el BUILD del árbol', !!ver && ver.build === buildTree,
      ver ? JSON.stringify(ver.build) : 'sin respuesta');

    // A1: el techo sigue exacto sobre el material genuinamente sin usar.
    const uA = await joinUser('techo-intacto');
    for (let i = 0; i < 20; i++) seedAsset(uA.userId, 'a' + i);
    const rA1 = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', uA.cookie);
    check('A1a 20 sin usar: Subir da 400 con el mensaje honesto del tope',
      rA1.st === 400 && /llegó a 20 archivos/.test(rA1.txt), rA1.st + ' ' + rA1.txt.slice(0, 150));
    const rA1b = await req('POST', '/api/media?from=chat', JPEG, 'image/jpeg', uA.cookie);
    check('A1b 20 sin usar: la puerta del chat da el mismo 400',
      rA1b.st === 400 && /llegó a 20 archivos/.test(rA1b.txt), rA1b.st + ' ' + rA1b.txt.slice(0, 150));

    // A2: 20 incorporados SOLO por las formas que v1275 no miraba.
    const uB = await joinUser('formas-nuevas');
    const B = [];
    for (let i = 0; i < 20; i++) B.push(seedAsset(uB.userId, 'b' + i, 'photo', i >= 18 ? 'huella-gemela' : ''));
    for (let i = 0; i < 4; i++) seedPost(uB.userId, { status: 'published', media_type: 'video', cover_path: B[i].file_path }); // F4
    for (let i = 4; i < 8; i++) seedPost(uB.userId, { status: 'draft', prev_image_path: B[i].file_path }); // F5
    for (let i = 8; i < 12; i++) { const pid = seedPost(uB.userId, { status: 'scheduled' }); seedVersion(pid, B[i].file_path); } // F6
    for (let i = 12; i < 15; i++) { const pid = seedPost(uB.userId, { status: 'published' }); seedRecibo(uB.userId, B[i].id, pid, 'activo'); } // F7
    for (let i = 15; i < 18; i++) { const pid = seedPost(uB.userId, { status: 'scheduled' }); seedPedido(uB.userId, B[i].id, pid); } // F8
    seedPost(uB.userId, { status: 'published', media_type: 'video', cover_path: B[18].file_path }); // F9: B[18] por portada; B[19] entra SOLO por la huella gemela
    const rA2 = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', uB.cookie);
    check('A2 incorporados por cover/prev/versiones/recibo/pedido/huella: Subir da 200',
      rA2.st === 200 && j(rA2.txt) && j(rA2.txt).ok === true, rA2.st + ' ' + rA2.txt.slice(0, 150));
    const rA2b = await req('POST', '/api/media?from=chat', JPEG, 'image/jpeg', uB.cookie);
    check('A2b la puerta del chat aplica el mismo predicado: 200',
      rA2b.st === 200, rA2b.st + ' ' + rA2b.txt.slice(0, 150));

    // A3: referencias muertas NO incorporan (el techo no se libera con humo).
    const uC = await joinUser('referencias-muertas');
    const C = [];
    for (let i = 0; i < 20; i++) C.push(seedAsset(uC.userId, 'c' + i));
    seedPost(uC.userId, { status: 'cancelled', image_path: C[0].file_path, cover_path: C[1].file_path, prev_image_path: C[2].file_path, carousel_paths: JSON.stringify([C[3].file_path]) });
    const pidCanc = seedPost(uC.userId, { status: 'cancelled' });
    seedVersion(pidCanc, C[4].file_path);
    const pidPub = seedPost(uC.userId, { status: 'published' });
    seedRecibo(uC.userId, C[5].id, pidPub, 'deshecho'); // recibo deshecho: no vincula
    const pidFail = seedPost(uC.userId, { status: 'failed' });
    seedPedido(uC.userId, C[6].id, pidFail); // pedido a un posteo fallido: no vincula
    seedRecibo(uC.userId, C[7].id, pidCanc, 'activo'); // recibo activo pero a un cancelado: no vincula
    const rA3 = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', uC.cookie);
    check('A3 referencias desde cancelados/fallidos y recibos deshechos no liberan: sigue 400',
      rA3.st === 400 && /llegó a 20 archivos/.test(rA3.txt), rA3.st + ' ' + rA3.txt.slice(0, 150));

    // A4: la forma de la casa — 21 foto/video, 20 incorporados por el
    // abanico real de formas, 1 solo de trabajo: la subida entra.
    const uD = await joinUser('forma-casa');
    const D = [];
    for (let i = 0; i < 21; i++) D.push(seedAsset(uD.userId, 'd' + i, i === 0 ? 'video' : 'photo'));
    seedPost(uD.userId, { status: 'published', media_type: 'video', image_path: D[0].file_path }); // F10 la película (la ÚNICA que el predicado viejo veía)
    for (let i = 1; i < 5; i++) seedPost(uD.userId, { status: 'published', media_type: 'video', cover_path: D[i].file_path }); // F4
    for (let i = 5; i < 9; i++) seedPost(uD.userId, { status: 'scheduled', prev_image_path: D[i].file_path }); // F5
    for (let i = 9; i < 13; i++) { const pid = seedPost(uD.userId, { status: 'published' }); seedVersion(pid, D[i].file_path); } // F6
    for (let i = 13; i < 17; i++) { const pid = seedPost(uD.userId, { status: 'published' }); seedRecibo(uD.userId, D[i].id, pid, 'activo'); } // F7
    for (let i = 17; i < 20; i++) { const pid = seedPost(uD.userId, { status: 'scheduled' }); seedPedido(uD.userId, D[i].id, pid); } // F8
    // D[20] queda como único material de trabajo (la lámina que sigue).
    const rA4 = await req('POST', '/api/album/photo', JPEG, 'image/jpeg', uD.cookie);
    check('A4 forma de la casa (21 con 20 incorporados por las formas reales): la subida siguiente entra, 200',
      rA4.st === 200 && j(rA4.txt) && j(rA4.txt).ok === true, rA4.st + ' ' + rA4.txt.slice(0, 150));

    // A5: la guarda de borrado usa el mismo predicado.
    const uE = await joinUser('guarda-borrado');
    const eCover = seedAsset(uE.userId, 'cover');
    seedPost(uE.userId, { status: 'published', media_type: 'video', cover_path: eCover.file_path });
    const rDel1 = await req('DELETE', '/api/album/' + eCover.id, null, null, uE.cookie);
    check('A5a borrar un asset que es la portada de un posteo vivo: 409 protegido',
      rDel1.st === 409 && /ya está en un posteo/.test(rDel1.txt), rDel1.st + ' ' + rDel1.txt.slice(0, 150));
    const eFree = seedAsset(uE.userId, 'libre');
    const rDel2 = await req('DELETE', '/api/album/' + eFree.id, null, null, uE.cookie);
    check('A5b borrar un asset sin usar: 200, se borra',
      rDel2.st === 200, rDel2.st + ' ' + rDel2.txt.slice(0, 150));
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
