'use strict';
// test-lote-links-guardados.js — LINKS-GUARDADOS (12/11 · hilo DfikYn2DxGm):
// el hilo guardado DfikYn2DxGm es el permalink del posteo 583 (fitness,
// «Tu gimnasio, siempre activo», publicado 9/11 19:00), anunciado el
// 10/11. Valentino archivó el 583 ÉL MISMO en la app de Instagram el
// 10/11 08:02 (y los 16 a las 08:03): un posteo archivado ya no tiene
// URL pública — Instagram responde «esta página no está disponible» —
// y por eso no aparece en ninguna fuente fresca (lista oficial de la
// API: 11 posteos, sin 583 ni 610, paginación que miente; embed: 0
// ocurrencias de los 14 shortcodes archived_ext; el embed de
// DfikYn2DxGm y de DfnuFrnjxae es byte-idéntico al de un shortcode
// inventado salvo el nonce, mientras el 593 vivo trae media real).
// NO es un link viejo de la programación ni solo incompletitud de la
// lista: la ausencia del 583 tiene causa verificada (archivado por el
// dueño). El fix (SOLO public/app.js): el permalink guardado solo se
// muestra como «Ver en Instagram» si el posteo sigue vivo en Instagram
// (pzIgLinkVivo: ig_state != 'archived_ext' + https + no demo). En «Tu
// archivo → Archivados en Instagram» el link muerto se reemplaza por el
// estado honesto («No disponible en Instagram mientras esté archivado»,
// con la nota que ya explica cómo traerlo de vuelta desarchivando en
// IG). El badge «Publicado» NO se toca (regla v925): el posteo sí se
// publicó; lo que muere es el link vivo. Si se desarchiva, la
// reconciliación lo vuelve a 'live' y el link reaparece solo.
// Node puro: estáticos + VM (app.js) + boot real con siembra en SQLite.
// Uso: DATA_DIR temporal + NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-links-guardados.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

// El árbol es el directorio de la suite: el release del builder acá, la
// raíz del repo en main. Los temporales van FUERA del árbol.
const SCRATCH = __dirname;
const TREE = SCRATCH;
const TMPBASE = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(TMPBASE, '.tmp-test-'));
process.env.TMPDIR = TMP;

let ok = 0, bad = 0;
const FAILURES = [];
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; FAILURES.push(name); console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const idxES = fs.readFileSync(path.join(TREE, 'public/index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(TREE, 'public/en/index.html'), 'utf8');

// Extrae una function declaration por nombre (balanceo de llaves).
function extractFn(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i === -1) return '';
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let d = 0, j = src.indexOf('{', i);
  if (j === -1) return '';
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

(async () => {
  // ---------- 1. Estampado (provisional: el preparador re-numera) ----------
  t(srv.includes("const BUILD_ID = '20261105-v940';"), 'server: BUILD v940');
  t(cnt(srv, '20261105-v940') === 1, 'server: BUILD v940 ×1');
  t(!srv.includes('20261105-v939'), 'server: sin restos de v939');
  t(idxES.includes('/app.js?v=650'), 'index ES: app.js?v=650');
  t(cnt(idxES, 'app.js?v=650') === 1, 'index ES: app.js?v=650 ×1');
  t(idxES.includes('/styles.css?v=20261270'), 'index ES: styles?v=20261270 sin cambio (el lote no toca styles.css)');
  t(idxEN.includes('/styles.css?v=20261270'), 'index EN: styles?v=20261270 (mismo valor que ES)');
  t(!idxEN.includes('/app.js?v='), 'index EN: no carga app.js (landing)');
  t(!app.includes('20261105-v939') && !idxES.includes('v=649'), 'sin restos de v939 (?v=649)');
  // El fix es SOLO cliente: server.js solo cambia el BUILD.
  t(!srv.includes('pzIgLinkVivo'), 'server: sin cambios de lógica (solo BUILD)');

  // ---------- 2. Estáticos: el gate del link vivo ----------
  t(cnt(app, 'function pzIgLinkVivo(') === 1, 'M78: pzIgLinkVivo definida ×1');
  t(app.includes("String(p.ig_state || '') === 'archived_ext'"), 'gate: apaga el link con ig_state archived_ext');
  t(app.includes('function pzIsPubReal('), 'M78: pzIsPubReal intacta (la regla del badge no se toca)');
  // Los 5 call sites del helper + el gate directo de apvPill.
  t(app.includes('const _lgLink = pzIgLinkVivo(d);'), 'M78: detSimpleMenuHTML usa pzIgLinkVivo');
  t(app.includes('const igLink = pzIgLinkVivo(d);'), 'M78: weekCardHTML usa pzIgLinkVivo');
  t(app.includes('const igL = pzIgLinkVivo(p);'), 'M78: postItem usa pzIgLinkVivo');
  t(app.includes('const url = pzIsPubReal(post) ? pzIgLinkVivo(post) : '), 'M78: hfDetailShare usa pzIgLinkVivo');
  t(app.includes("String(p.ig_state || '') !== 'archived_ext'"), 'M78: apvPill apaga el link con archived_ext');
  t(!app.includes('if (pzIsPubReal(d) && d.ig_permalink) items.push'), 'detalle: el menú ya no usa el permalink crudo');
  t(!app.includes("const igLink = (d.ig_permalink && /^https:"), 'detalle: weekCardHTML ya no usa el permalink crudo');
  // La lista de archivados: ningún link vivo, estado honesto en su lugar.
  t(cnt(app, 'hf-ar-link') === 0, 'archivo: ningún link vivo (hf-ar-link ×0)');
  t(app.includes('No disponible en Instagram mientras esté archivado'), 'archivo: estado honesto ES');
  t(app.includes('Not available on Instagram while archived'), 'archivo: estado honesto EN');
  t(app.includes('Los archivaste en Instagram, por eso también salieron de tu grilla allá'), 'archivo: la nota de cómo traerlo de vuelta sigue');
  // Lo que NO se toca: celebración y publicar-ahora usan el permalink
  // fresco de la publicación (vivo por construcción).
  t(app.includes("pzSftChatMarcarPublicadoHoy(pid, st.ig_permalink)"), 'chat: el anuncio exprés sigue con el permalink fresco');
  t(app.includes('function pzSftChatMarcarPublicadoHoy(postId, permalink)'), 'chat: pzSftChatMarcarPublicadoHoy intacta');
  // chatMsgHtml no se toca en este lote.
  t(app.includes('function chatMsgHtml(role, text, ts, id, reply, cap, photos, post)'), 'chat: firma chatMsgHtml intacta (8 params)');

  // ---------- 3. VM: pzIgLinkVivo ----------
  const linkSrc = extractFn(app, 'pzIsPubReal') + '\n' + extractFn(app, 'pzIgLinkVivo');
  t(linkSrc.includes('function pzIgLinkVivo('), 'VM: pzIgLinkVivo extraída');
  const linkCtx = {};
  vm.createContext(linkCtx);
  vm.runInContext(linkSrc + '\nthis.__l = { pzIgLinkVivo, pzIsPubReal };', linkCtx);
  const linkVivo = linkCtx.__l.pzIgLinkVivo;
  const pLive592 = { id: 592, status: 'published', ig_state: 'live', ig_permalink: 'https://www.instagram.com/p/DflJLfAD-8C/', ig_media_id: '17969478888206210' };
  const pLive593 = { id: 593, status: 'published', ig_state: 'live', ig_permalink: 'https://www.instagram.com/reel/Dfnt-fls8P4/', ig_media_id: '18116049578145678' };
  const p583 = { id: 583, status: 'published', ig_state: 'archived_ext', ig_permalink: 'https://www.instagram.com/p/DfikYn2DxGm/', ig_media_id: '17875736682586034' };
  const p610 = { id: 610, status: 'published', ig_state: 'archived_ext', ig_permalink: 'https://www.instagram.com/p/DfnuFrnjxae/', ig_media_id: '18116049578145679' };
  const pDemo = { id: 700, status: 'published', ig_state: 'live', ig_permalink: 'https://www.instagram.com/p/demo_123/', ig_media_id: 'demo_123' };
  const pSinLink = { id: 701, status: 'published', ig_state: 'live', ig_permalink: '', ig_media_id: '123' };
  const pSinEstado = { id: 702, status: 'published', ig_permalink: 'https://www.instagram.com/p/DflJLfAD-8C/', ig_media_id: '17969478888206210' };
  t(linkVivo(pLive592) === 'https://www.instagram.com/p/DflJLfAD-8C/', 'link: 592 vivo → su permalink', linkVivo(pLive592));
  t(linkVivo(pLive593) === 'https://www.instagram.com/reel/Dfnt-fls8P4/', 'link: 593 vivo (reel) → su permalink', linkVivo(pLive593));
  t(linkVivo(p583) === '', 'link: 583 archivado (DfikYn2DxGm) → sin link', linkVivo(p583));
  t(linkVivo(p610) === '', 'link: 610 archivado (DfnuFrnjxae) → sin link', linkVivo(p610));
  t(linkVivo(pDemo) === '', 'link: demo → sin link', linkVivo(pDemo));
  t(linkVivo(pSinLink) === '', 'link: sin permalink → sin link', linkVivo(pSinLink));
  t(linkVivo(pSinEstado) === 'https://www.instagram.com/p/DflJLfAD-8C/', 'link: sin ig_state no se esconde nada (fail-open)', linkVivo(pSinEstado));
  t(linkVivo(null) === '', 'link: null → sin link');
  t(linkVivo({ status: 'published', ig_state: 'live', ig_permalink: 'instagram.com/p/abc/' }) === '', 'link: sin https → sin link');
  t(linkVivo({ status: 'published', ig_state: 'live', permalink: 'https://www.instagram.com/p/DflJLfAD-8C/' }) === 'https://www.instagram.com/p/DflJLfAD-8C/', 'link: campo permalink también vale');

  // ---------- 4. VM: detSimpleMenuHTML ----------
  const menuSrc = extractFn(app, 'pzIsPubReal') + '\n' + extractFn(app, 'pzIgLinkVivo') + '\n' + extractFn(app, 'detSimpleMenuHTML');
  t(menuSrc.includes('function detSimpleMenuHTML('), 'VM: detSimpleMenuHTML extraída');
  const menuCtx = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    pzIc: (n) => '[' + n + ']',
  };
  vm.createContext(menuCtx);
  vm.runInContext(menuSrc + '\nthis.__m = { detSimpleMenuHTML };', menuCtx);
  const menu = menuCtx.__m.detSimpleMenuHTML;
  let mh = menu(pLive592, {});
  t(mh.includes('DflJLfAD-8C') && mh.includes('Ver en Instagram'), 'menú 592 vivo: trae «Ver en Instagram» con su link', mh.slice(0, 300));
  mh = menu(p583, {});
  t(!mh.includes('DfikYn2DxGm') && !mh.includes('Ver en Instagram'), 'menú 583 archivado: sin «Ver en Instagram» ni su link', mh.slice(0, 300));
  mh = menu(p610, {});
  t(!mh.includes('DfnuFrnjxae') && !mh.includes('Ver en Instagram'), 'menú 610 archivado: sin «Ver en Instagram» ni su link', mh.slice(0, 300));
  mh = menu(p583, { en: true });
  t(!mh.includes('DfikYn2DxGm') && !mh.includes('View on Instagram'), 'menú 583 EN: tampoco link');
  mh = menu({ id: 800, status: 'draft', ig_permalink: '' }, {});
  t(mh.includes('Pedir un cambio') && !mh.includes('Ver en Instagram'), 'menú borrador: sin link (como antes)');

  // ---------- 5. VM: hfArchiveHTML (la lista de guardados) ----------
  const archSrc = extractFn(app, 'hfArchDate') + '\n' + extractFn(app, 'hfArchStatusLabel') + '\n'
    + extractFn(app, 'hfArchThumb') + '\n' + extractFn(app, 'hfArchiveHTML');
  t(archSrc.includes('function hfArchiveHTML('), 'VM: hfArchiveHTML extraída');
  const archCtx = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    mv: (s) => String(s || ''),
    pcParseDate: (v) => { try { const d = new Date(String(v || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? null : d; } catch (e) { return null; } },
  };
  vm.createContext(archCtx);
  vm.runInContext(archSrc + '\nthis.__a = { hfArchiveHTML };', archCtx);
  const archHTML = archCtx.__a.hfArchiveHTML;
  const archData = { versions: [], recycled: [], cancelled: [], archived: [
    { ...p583, caption: '¿Cuántas veces te pasó de no tener idea…' },
    { ...p610, caption: 'Lo que nos dijo una clienta…' },
  ] };
  let ah = archHTML(archData, false);
  t(!ah.includes('DfikYn2DxGm') && !ah.includes('DfnuFrnjxae'), 'archivo ES: ningún permalink archivado sale como link', ah.slice(0, 400));
  t(!ah.includes('<a ') || !ah.includes('instagram.com'), 'archivo ES: ningún <a> a Instagram', ah.slice(0, 400));
  t(ah.includes('No disponible en Instagram mientras esté archivado'), 'archivo ES: estado honesto en vez del link');
  t(ah.includes('Archivado en Instagram') && ah.includes('desarchivarlo en Instagram'), 'archivo ES: explica que se trae de vuelta desarchivando');
  t(ah.includes('¿Cuántas veces te pasó de no tener idea') && ah.includes('Lo que nos dijo una clienta'), 'archivo ES: el posteo SIGUE en la lista con su caption (solo muere el link)');
  ah = archHTML(archData, true);
  t(!ah.includes('DfikYn2DxGm') && !ah.includes('DfnuFrnjxae'), 'archivo EN: ningún permalink archivado sale como link');
  t(ah.includes('Not available on Instagram while archived'), 'archivo EN: estado honesto en vez del link');
  ah = archHTML({ versions: [], recycled: [], cancelled: [], archived: [] }, false);
  t(ah.includes('Nada archivado en Instagram'), 'archivo vacío: mensaje vacío honesto');

  // ---------- 6. VM: apvPill (el badge NO se toca, el link sí) ----------
  const pillSrc = extractFn(app, 'pzIsPubReal') + '\n' + extractFn(app, 'apvPill');
  t(pillSrc.includes('function apvPill('), 'VM: apvPill extraída');
  const pillCtx = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    pzIc: (n) => '[' + n + ']',
    apvTz: () => 'UTC',
    apvHM: () => '',
    apvCountdown: () => '',
    humanError: (e) => String(e || ''),
  };
  vm.createContext(pillCtx);
  vm.runInContext(pillSrc + '\nthis.__p = { apvPill };', pillCtx);
  const pill = pillCtx.__p.apvPill;
  let ph = pill(pLive592, null, false);
  t(ph.includes('Publicado') && ph.includes('DflJLfAD-8C'), 'pill 592 vivo: «Publicado» + link', ph);
  ph = pill(p583, null, false);
  t(ph.includes('Publicado') && !ph.includes('DfikYn2DxGm'), 'pill 583 archivado: «Publicado» queda (v925) pero SIN link', ph);
  ph = pill(p610, null, false);
  t(ph.includes('Publicado') && !ph.includes('DfnuFrnjxae'), 'pill 610 archivado: «Publicado» queda pero SIN link', ph);
  ph = pill(pDemo, null, false);
  t(ph.includes('Pendiente') && !ph.includes('demo_'), 'pill demo: sigue «Pendiente», sin link');

  // ---------- 7. VM: postItem ----------
  const itemSrc = extractFn(app, 'pzIsPubReal') + '\n' + extractFn(app, 'pzIgLinkVivo') + '\n' + extractFn(app, 'postItem');
  t(itemSrc.includes('function postItem('), 'VM: postItem extraída');
  const itemCtx = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    pzIc: (n) => '[' + n + ']',
    badge: () => '<span class="badge">x</span>',
    fmtDate: (s) => String(s || ''),
  };
  vm.createContext(itemCtx);
  vm.runInContext(itemSrc + '\nthis.__i = { postItem };', itemCtx);
  const item = itemCtx.__i.postItem;
  let ih = item({ ...pLive592, caption: 'uñas', hashtags: '', image_path: '/media/x.jpg', published_at: '2026-11-10T19:00:00Z' }, '');
  t(ih.includes('DflJLfAD-8C') && ih.includes('Ver en IG'), 'postItem 592 vivo: trae «Ver en IG»', ih.slice(0, 300));
  ih = item({ ...p583, caption: 'gimnasio', hashtags: '', image_path: '/media/y.jpg', published_at: '2026-11-09T19:00:00Z' }, '');
  t(!ih.includes('DfikYn2DxGm') && !ih.includes('Ver en IG'), 'postItem 583 archivado: sin «Ver en IG» ni su link', ih.slice(0, 300));

  // ---------- 8. Boot real + el hilo DfikYn2DxGm en vivo ----------
  const BOOT = fs.mkdtempSync(path.join(TMPBASE, '.tmp-boot-'));
  const BOOT_DATA = path.join(BOOT, 'data');
  fs.mkdirSync(BOOT_DATA, { recursive: true });
  fs.cpSync(TREE, BOOT, { recursive: true });
  const PORT = 35004;
  const envBoot = Object.assign({}, process.env, {
    DATA_DIR: BOOT_DATA, PORT: String(PORT),
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    TZ: 'America/Argentina/Buenos_Aires',
  });
  const child = spawn('node', ['server.js'], { cwd: BOOT, env: envBoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let version = null;
  for (let i = 0; i < 160 && !version; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
      if (r.ok) version = await r.json();
    } catch (e) { /* aún no levanta */ }
    if (!version) await sleep(500);
  }
  t(version && version.build === '20261105-v940', 'boot: /api/version = v940', JSON.stringify(version));
  if (version) {
    let ok5 = 0;
    for (let i = 0; i < 5; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); const j = await r.json(); if (j && j.build === '20261105-v940') ok5++; } catch (e) {}
    }
    t(ok5 === 5, 'boot: /api/version 5/5', ok5 + '/5');
    const idx = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
    t(idx.includes('/app.js?v=650') && idx.includes('/styles.css?v=20261270'), 'boot: el index servido trae ?v=650 y styles?v=20261270');
    const bundle = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=650`)).text();
    t(bundle.includes('function pzIgLinkVivo(') && bundle.includes('No disponible en Instagram mientras esté archivado'), 'boot: el bundle trae el helper y el estado honesto');
    // Usuario de prueba + siembra: el 592 vivo y el 583 archivado.
    const reg = await fetch(`http://127.0.0.1:${PORT}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'links-test@postyhacetodo.com', password: 'test123456', terms_accepted: true }),
    });
    const regJ = await reg.json().catch(() => ({}));
    const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
    t(reg.ok && regJ.ok === true && cookie.length > 0, 'boot: registro de usuario de prueba', reg.status + ' ' + JSON.stringify(regJ).slice(0, 200));
    if (reg.ok && cookie) {
      const dbFile = path.join(BOOT_DATA, 'posta.db');
      const db = new DatabaseSync(dbFile);
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get('links-test@postyhacetodo.com');
      t(!!u && !!u.id, 'boot: el usuario de prueba existe en la DB', JSON.stringify(u));
      if (u && u.id) {
        const col = db.prepare("SELECT name FROM pragma_table_info('posts') WHERE name = 'ig_state'").get();
        t(!!col, 'boot: la columna ig_state existe en DB fresca');
        const ins = db.prepare('INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, needs_review, ig_permalink, ig_media_id, ig_state, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        const rVivo = ins.run(u.id, '/media/test-592.jpg', 'uñas', '', 'published', 'image', 0, 'https://www.instagram.com/p/DflJLfAD-8C/', '17969478888206210', 'live', '2026-11-10T19:00:00Z');
        const rArch = ins.run(u.id, '/media/test-583.jpg', 'gimnasio', '', 'published', 'image', 0, 'https://www.instagram.com/p/DfikYn2DxGm/', '17875736682586034', 'archived_ext', '2026-11-09T19:00:00Z');
        // El cliente recibe ig_state: sin ese dato el gate no podría correr.
        const list = await (await fetch(`http://127.0.0.1:${PORT}/api/posts`, { headers: { cookie } })).json().catch(() => null);
        const byId = {};
        if (Array.isArray(list)) for (const p of list) byId[Number(p.id)] = p;
        t(byId[Number(rVivo.lastInsertRowid)] && byId[Number(rVivo.lastInsertRowid)].ig_state === 'live', 'boot vivo: GET /api/posts trae el 592 con ig_state live', JSON.stringify(byId[Number(rVivo.lastInsertRowid)] || null).slice(0, 200));
        t(byId[Number(rArch.lastInsertRowid)] && byId[Number(rArch.lastInsertRowid)].ig_state === 'archived_ext', 'boot vivo: GET /api/posts trae el 583 con ig_state archived_ext', JSON.stringify(byId[Number(rArch.lastInsertRowid)] || null).slice(0, 200));
        const detArch = await (await fetch(`http://127.0.0.1:${PORT}/api/posts/${rArch.lastInsertRowid}`, { headers: { cookie } })).json().catch(() => null);
        t(detArch && detArch.post && detArch.post.ig_state === 'archived_ext' && String(detArch.post.ig_permalink || '').includes('DfikYn2DxGm'), 'boot vivo: GET /api/posts/:id del 583 trae ig_state + su permalink guardado', JSON.stringify(detArch && detArch.post ? { ig_state: detArch.post.ig_state, ig_permalink: detArch.post.ig_permalink } : detArch));
        // La lista que el fix toca: «Tu archivo» trae el 583 en archived.
        const arch = await (await fetch(`http://127.0.0.1:${PORT}/api/archive`, { headers: { cookie } })).json().catch(() => null);
        const archIds = Array.isArray(arch && arch.archived) ? arch.archived.map((p) => Number(p.id)) : [];
        t(archIds.includes(Number(rArch.lastInsertRowid)), 'boot vivo: GET /api/archive trae el 583 en archived', JSON.stringify(archIds));
        t(Array.isArray(arch && arch.archived) && arch.archived.some((p) => String(p.ig_permalink || '').includes('DfikYn2DxGm')), 'boot vivo: el 583 llega al archivo CON su permalink guardado (el cliente es quien ya no lo muestra como link)');
        t(!archIds.includes(Number(rVivo.lastInsertRowid)), 'boot vivo: GET /api/archive NO trae el 592 vivo', JSON.stringify(archIds));
      }
      try { db.close(); } catch (e) {}
    }
  } else {
    t(false, 'boot: el servidor no levantó', bootLog.slice(0, 500));
  }
  // Matar por PID exacto y verificar que el puerto quedó libre.
  const bootPid = child.pid;
  try { process.kill(bootPid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let stillAlive = true;
  try { process.kill(bootPid, 0); } catch (e) { stillAlive = false; }
  if (stillAlive) { try { process.kill(bootPid, 'SIGKILL'); } catch (e) {} await sleep(800); }
  try { process.kill(bootPid, 0); stillAlive = true; } catch (e) { stillAlive = false; }
  t(!stillAlive, 'boot: el proceso murió por PID exacto', bootPid);
  let portFree = false;
  try {
    const ssOut = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    portFree = !ssOut.split('\n').some((l) => l.includes(':' + PORT + ' '));
  } catch (e) { portFree = true; }
  t(portFree, 'boot: el puerto ' + PORT + ' quedó libre');

  // ---------- Epílogo ----------
  console.log(`\ntest-lote-links-guardados: ${ok} OK, ${bad} FAIL`);
  if (bad) { console.log('FAILURES:'); FAILURES.forEach((f) => console.log('  -', f)); }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(BOOT, { recursive: true, force: true }); } catch (e) {}
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
