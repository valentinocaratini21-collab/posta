// test-lote-publicado-solo-si-se-publico.js — LOTE v925 PUBLICADO-SOLO-SI-SE-PUBLICO (base v924, BUILD v925).
// Bug en vivo de Valentino (prueba de Veja, 11/11): la app marcaba el posteo
// «Publicado» y ofrecía «Ver en Instagram» sin nada conectado ni publicado.
// CAUSA RAÍZ (con evidencia, ver STATUS.md):
//  1. demo_mode es el DEFAULT (db.js:34, DEFAULT 1) y solo conectar IG lo
//     apaga (server.js:19775). Un invitado/usuario nuevo NUNCA conectó nada.
//  2. El scheduler publica los posteos vencidos (scheduler.js:457) y en demo
//     instagram.js:publishDemo DEVUELVE ÉXITO FALSO: permalink
//     'https://www.instagram.com/p/demo_<id>/' (reel '/reel/demo_<id>/') y
//     mediaId 'demo_<id>' (la historia deja el permalink vacío, mismo mediaId).
//  3. publishSinglePost (scheduler.js:189) escribe status='published' +
//     ig_permalink + ig_media_id + published_at con ESOS VALORES FALSOS.
//  4. Toda la UI confiaba solo en status==='published' (badge) o en la
//     presencia de ig_permalink (enlace) — y el permalink falso ESTÁ presente.
// FIX (solo display, la simulación de demo sigue siendo simulación):
//  - Helper canónico pzIsPubReal(p) (app.js): published Y SIN marca demo
//    (ig_media_id 'demo_*' o permalink '/demo_*'). Sin marcadores, el posteo
//    se publicó de verdad (fail-safe: filas viejas no se tocan).
//  - El helper rige TODOS los sitios que rinden el badge «Publicado» o el
//    enlace «Ver en Instagram» (ver STATUS.md, mapa completo).
//  - Server: /api/posts ahora trae ig_media_id (la historia simulada deja el
//    permalink vacío: solo el mediaId la delata); /api/publish-celebration
//    excluye filas demo; semanaWhenLabel (página pública de la semana) usa
//    isDemoPub.
// Lo que se verifica (Node puro + boot real por HTTP, sin claves):
//  A. pzIsPubReal: real → true; demo imagen/reel/historia → false;
//     programado/borrador → false; legacy sin marcadores → true (fail-safe).
//  B. Renders (VM con stubs): menú •••, tira de la semana, tarjeta detalle
//     (weekCardHTML), tarjeta Schedule (postCardHTML), peek, anchor bar,
//     detalle (hfDetailHTML), tira del día, speech de Hoy, apvPill, chip de
//     estado, badge del historial, publishNowFlow (okmsg + demo:true),
//     modal del primer posteo (FT): el simulado NO dice «Publicado», NO
//     ofrece «Ver en Instagram» y muestra su estado honesto (Programado).
//  C. Server (VM + SQLite): isDemoPub/semanaWhenLabel (ES/EN); la query de
//     /api/publish-celebration elige solo el publicado real (con solo demos,
//     ninguno); /api/posts trae ig_media_id.
//  D. Boot real: /api/version v925 ×5; index ES app.js?v=636 + styles
//     20261255, EN sin app.js?v=; E2E /api/publish-celebration con usuario
//     real: solo demo → show:false; + publicado real → show:true con ese post.
//  E. Censo: todo lo ajeno idéntico a v924 (needs_review 107 occ server.js,
//     pzBoostEsMP ×23, pz-boost-3d3 ×36, proactive.js, CHUNK_V, styles.css y
//     en/index.html byte-idénticos; solo 3 archivos difieren).
//  F. M78: cada función tocada se extrae limpia y sus llamadas resuelven.
// La verificación EN VIVO (prueba de Veja: sin badge ni enlace hasta publicar
// de verdad) queda para después del push (la hace el tablero).
// Uso: cd release && node test-lote-publicado-solo-si-se-publico.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { spawn } = require('child_process');

let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };

const ROOT = __dirname; // release/
const BASE = path.join(__dirname, '..', 'base-v924');
const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appBase = fs.readFileSync(path.join(BASE, 'public/app.js'), 'utf8');
const srvBase = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// Extrae una función por nombre contando llaves (sirve para `function` y
// para `async function`).
function extractFn(src, name) {
  const start0 = src.indexOf('function ' + name + '(');
  if (start0 < 0) return '';
  const isAsync = src.slice(Math.max(0, start0 - 6), start0) === 'async ';
  const start = isAsync ? start0 - 6 : start0;
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}
function loadFn(sbx, src, name) {
  const c = extractFn(src, name);
  if (!c) return false;
  const repl = c.startsWith('async ')
    ? c.replace('async function ' + name, 'globalThis.' + name + ' = async function')
    : c.replace('function ' + name, 'globalThis.' + name + ' = function');
  vm.runInContext(repl, sbx);
  return true;
}

// ---------- Fixtures: el caso Veja (posteo 593, reel de uñas, hoy 19:00) ----------
const DEMO_IMG = { id: 593, status: 'published', media_type: 'video', image_path: '/media/trial-veja.jpg', caption: 'HOMME — el modelo que todos piden', hashtags: '', carousel_paths: '[]', scheduled_at: '2026-11-11 19:00:00', published_at: '2026-11-11 19:42:00', ig_permalink: 'https://www.instagram.com/p/demo_abc1234/', ig_media_id: 'demo_abc1234', approval: 'auto', likes: null, comments_count: null, redo_left: 3, needs_review: 0 };
const DEMO_STORY = { ...DEMO_IMG, id: 594, media_type: 'story', ig_permalink: '', ig_media_id: 'demo_zz99' };
const DEMO_REEL = { ...DEMO_IMG, id: 595, media_type: 'video', ig_permalink: 'https://www.instagram.com/reel/demo_qq77/', ig_media_id: 'demo_qq77' };
const REAL = { ...DEMO_IMG, id: 592, status: 'published', ig_permalink: 'https://www.instagram.com/p/DMxYz123/', ig_media_id: '17912345678901234', approval: 'auto' };
const REAL_NOLINK = { ...REAL, id: 591, ig_permalink: '' }; // real, Meta no devolvió permalink: badge sí, enlace no.
const LEGACY = { id: 580, status: 'published', media_type: 'image', image_path: '/media/x.jpg', caption: 'viejo', hashtags: '', carousel_paths: '[]', scheduled_at: '2026-10-01 19:00:00', published_at: '2026-10-01 19:05:00', ig_permalink: '', ig_media_id: '', approval: 'auto', likes: null, comments_count: null, redo_left: 3, needs_review: 0 };
const SCHED = { ...DEMO_IMG, id: 596, status: 'scheduled', published_at: '', ig_permalink: '', ig_media_id: '', approval: 'pending' };
const DRAFT = { ...DEMO_IMG, id: 597, status: 'draft', published_at: '', ig_permalink: '', ig_media_id: '', approval: 'pending' };

function makeSbx(extra) {
  const sbx = {
    console, setTimeout, clearTimeout, Date, JSON, Math, Intl,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: (n) => '[ic:' + n + ']',
    ME: { lang: 'es' },
    HF_ASK_POSTS: {},
    LP_WEEK_ICONS: '',
    ...(extra || {}),
  };
  vm.createContext(sbx);
  return sbx;
}

// ---------- A. pzIsPubReal ----------
{
  const sbx = makeSbx();
  t(loadFn(sbx, appJs, 'pzIsPubReal'), 'A: pzIsPubReal se extrae');
  const f = sbx.pzIsPubReal;
  t(f(REAL) === true, 'A1: publicado real → true');
  t(f(REAL_NOLINK) === true, 'A2: publicado real sin permalink (Meta no lo devolvió) → true, badge sí');
  t(f(LEGACY) === true, 'A3: publicado legacy sin marcadores → true (fail-safe)');
  t(f(DEMO_IMG) === false, 'A4: demo imagen (permalink /p/demo_*) → false');
  t(f(DEMO_REEL) === false, 'A5: demo reel (permalink /reel/demo_*) → false');
  t(f(DEMO_STORY) === false, 'A6: demo historia (permalink vacío, mediaId demo_*) → false');
  t(f({ ...DEMO_IMG, ig_media_id: '' }) === false, 'A7: demo solo por permalink (sin mediaId) → false');
  t(f({ ...DEMO_IMG, ig_permalink: '' }) === false, 'A8: demo solo por mediaId (sin permalink) → false');
  t(f(SCHED) === false, 'A9: programado → false');
  t(f(DRAFT) === false, 'A10: borrador → false');
  t(f(null) === false && f(undefined) === false && f({}) === false, 'A11: null/undefined/vacío → false');
  t(f({ ...REAL, ig_permalink: 'https://www.instagram.com/p/demo_x/' }) === false, 'A12: permalink demo con mediaId real → false (la marca manda)');
}

// ---------- B1. Menú ••• del detalle ----------
{
  const sbx = makeSbx();
  t(loadFn(sbx, appJs, 'pzIsPubReal') && loadFn(sbx, appJs, 'detSimpleMenuHTML'), 'B1: detSimpleMenuHTML se extrae');
  const menu = (d) => sbx.detSimpleMenuHTML(d, { en: false, canPubNow: true });
  t(!menu(DEMO_IMG).includes('Ver en Instagram'), 'B1a: demo → menú SIN «Ver en Instagram»');
  t(menu(REAL).includes('Ver en Instagram') && menu(REAL).includes('https://www.instagram.com/p/DMxYz123/'), 'B1b: real → menú CON «Ver en Instagram» a su URL');
  t(menu(SCHED).includes('Frenar') && !menu(SCHED).includes('Ver en Instagram'), 'B1c: programado → Frenar, sin link');
}

// ---------- B2. Tira de la semana (mzRowChip / mzHeroChip) ----------
{
  const sbx = makeSbx();
  t(loadFn(sbx, appJs, 'pzIsPubReal') && loadFn(sbx, appJs, 'schedPostState') && loadFn(sbx, appJs, 'mzRowChip') && loadFn(sbx, appJs, 'mzHeroChip'), 'B2: mzRowChip/mzHeroChip se extraen');
  t(sbx.mzRowChip(DEMO_IMG).includes('Programado') && !sbx.mzRowChip(DEMO_IMG).includes('Publicado'), 'B2a: demo → chapita «Programado», no «Publicado»');
  t(sbx.mzHeroChip(DEMO_IMG).includes('Programado') && !sbx.mzHeroChip(DEMO_IMG).includes('Publicado'), 'B2b: demo (hero) → «Programado»');
  t(sbx.mzRowChip(REAL).includes('Publicado'), 'B2c: real → «Publicado»');
  t(sbx.mzHeroChip(REAL).includes('Publicado'), 'B2d: real (hero) → «Publicado»');
  t(sbx.mzRowChip(SCHED).includes('Programado'), 'B2e: programado → «Programado»');
  t(sbx.mzRowChip(DRAFT).includes('Borrador'), 'B2f: borrador → «Borrador»');
}

// ---------- B3. Tarjeta detalle (weekCardHTML) — la superficie del bug ----------
{
  const sbx = makeSbx({ hfAskChangeBtnHTML: () => '' });
  const names = ['pzIsPubReal', 'detSimpleMenuHTML', 'pcParseDate', 'pcFmtDayLong', 'igRelTime', 'weekCardHTML'];
  const loaded = names.every((n) => loadFn(sbx, appJs, n));
  t(loaded, 'B3: weekCardHTML + dependencias se extraen');
  const card = (d) => sbx.weekCardHTML(d, { simple: false, tz: 'America/Argentina/Buenos_Aires', bizName: 'Veja', user: 'veja', pic: '' });
  const hDemo = card(DEMO_IMG);
  t(!hDemo.includes('Publicado'), 'B3a: demo → tarjeta SIN «Publicado»');
  t(hDemo.includes('Programado'), 'B3b: demo → tarjeta dice «Programado» (estado honesto)');
  t(!hDemo.includes('Ver en Instagram'), 'B3c: demo → tarjeta SIN «Ver en Instagram»');
  t(!hDemo.includes('demo_abc1234'), 'B3d: demo → el permalink falso NO aparece en la tarjeta');
  const hReal = card(REAL);
  t(hReal.includes('Publicado') && hReal.includes('Ver en Instagram') && hReal.includes('https://www.instagram.com/p/DMxYz123/'), 'B3e: real → «Publicado» + «Ver en Instagram» a su URL');
  const hSched = card(SCHED);
  t(hSched.includes('Programado') && hSched.includes('Frenar'), 'B3f: programado → «Programado» + Frenar');
  const hStory = card(DEMO_STORY);
  t(!hStory.includes('Publicado') && !hStory.includes('Ver en Instagram'), 'B3g: demo historia → sin «Publicado» ni link');
}

// ---------- B4. Tarjeta Schedule/chat (postCardHTML + pcBadge) ----------
{
  const sbx = makeSbx();
  sbx.pcTz = () => 'America/Argentina/Buenos_Aires';
  const names = ['pzIsPubReal', 'pcParseDate', 'pcFmtDay', 'pcFmtHour', 'pcFmtDayLong', 'pcBadge', 'postCardHTML'];
  t(names.every((n) => loadFn(sbx, appJs, n)), 'B4: postCardHTML + dependencias se extraen');
  const card = (p) => sbx.postCardHTML(p, { layout: 'row' });
  const hDemo = card(DEMO_IMG);
  t(!hDemo.includes('Salió'), 'B4a: demo → SIN badge «Salió»');
  t(hDemo.includes('Reel'), 'B4b: demo (reel) → badge de tipo «Reel»');
  t(hDemo.includes('pcard-actions'), 'B4c: demo → sigue accionable (nunca salió)');
  const hReal = card(REAL);
  t(hReal.includes('Salió') && !hReal.includes('data-pc-act="skip"'), 'B4d: real → badge «Salió», sin acciones');
  t(sbx.pcBadge(DEMO_IMG).includes('Reel') && !sbx.pcBadge(DEMO_IMG).includes('Salió'), 'B4e: pcBadge demo → tipo, no «Salió»');
  t(sbx.pcBadge(REAL).includes('Salió'), 'B4f: pcBadge real → «Salió»');
}

// ---------- B5. Peek (hfPeekHTML) y anchor bar (hfAnchorBarHTML) ----------
{
  const sbx = makeSbx({
    mv: (p) => p,
    hfCoverState: () => ({ has: false, path: '' }),
    hfWhenChip: () => '',
    hfChipText: null, // se carga el real abajo
    hfRedoLeft: () => 3,
    hfRedoLineHTML: () => '',
  });
  const names = ['pzIsPubReal', 'pcParseDate', 'hfRelShort', 'hfChipText', 'hfPeekHTML', 'hfAnchorBarHTML'];
  t(names.every((n) => loadFn(sbx, appJs, n)), 'B5: hfPeekHTML/hfAnchorBarHTML se extraen');
  const peek = (p) => sbx.hfPeekHTML(p, false, { visitor: false });
  t(peek(DEMO_IMG).includes('Sale el') && !peek(DEMO_IMG).includes('Publicado'), 'B5a: peek demo → «Sale el…», no «Publicado»');
  t(peek(REAL).includes('Publicado'), 'B5b: peek real → «Publicado»');
  t(peek(SCHED).includes('Sale el'), 'B5c: peek programado → «Sale el…»');
  const anch = (p) => sbx.hfAnchorBarHTML(p, false);
  t(anch(DEMO_IMG).includes('Editando este posteo') && !anch(DEMO_IMG).includes('ya salió'), 'B5d: anchor demo → «Editando este posteo», no «ya salió»');
  t(anch(REAL).includes('Este posteo ya salió'), 'B5e: anchor real → «Este posteo ya salió»');
}

// ---------- B6. Detalle (hfDetailHTML): la línea «hace 2 h» ----------
{
  const sbx = makeSbx({
    mv: (p) => p,
    hfCoverState: () => ({ has: false, path: '' }),
    hfCropOverlayHTML: () => '',
    HF_D_COMMENT: '[c]', HF_D_SHARE: '[s]', HF_D_SAVE: '[sv]', HF_D_SAVE_FULL: '[svf]',
    hfRedoLeft: () => 3,
    hfRedoLineHTML: () => '',
    rgLineHTML: () => '',
  });
  const names = ['pzIsPubReal', 'pcParseDate', 'hfRelShort', 'hfChipText', 'hfDetailHTML'];
  const loaded = names.every((n) => loadFn(sbx, appJs, n));
  t(loaded, 'B6: hfDetailHTML se extrae');
  if (loaded) {
    const det = (p) => sbx.hfDetailHTML(p, { user: 'veja', name: 'Veja', en: false, visitor: false, location: '', pic: '' });
    const hDemo = det(DEMO_IMG);
    t(hDemo.includes('Sale el') && !hDemo.includes('hace '), 'B6a: detalle demo → «Sale el…», no «hace 2 h»');
    const hReal = det(REAL);
    t(hReal.includes('hace '), 'B6b: detalle real → «hace …» (salió de verdad)');
    t(det(SCHED).includes('Sale el'), 'B6c: detalle programado → «Sale el…»');
  }
}

// ---------- B7. Tira del día (pzHoyTiraDetalleHTML) ----------
{
  const sbx = makeSbx({
    mv: (p) => p,
    pzHoyCuandoCorto: () => 'hoy · 19:00',
    pzHoyPillSalida: () => 'Sale a las 19:00',
    pzHoyCuentaSaleTxt: () => '',
  });
  t(loadFn(sbx, appJs, 'pzIsPubReal') && loadFn(sbx, appJs, 'pzHoyTiraDetalleHTML'), 'B7: pzHoyTiraDetalleHTML se extrae');
  const det = (p) => sbx.pzHoyTiraDetalleHTML({ idx: 2, esHoy: true, esManana: false, esPasado: false, revelado: true, post: p }, { en: false, tz: 'America/Argentina/Buenos_Aires' });
  const hDemo = det(DEMO_IMG);
  t(!hDemo.includes('Publicado') && hDemo.includes('hoy · 19:00'), 'B7a: tira demo → píldora con la hora, no «Publicado»');
  t(det(REAL).includes('Publicado'), 'B7b: tira real → «Publicado»');
  t(det(SCHED).includes('Sale a las 19:00'), 'B7c: tira programada → «Sale a las 19:00»');
}

// ---------- B8. Speech de Hoy (pzHoySpeechHTML) ----------
{
  const sbx = makeSbx({
    pzHoyHoraCorta: () => '19:00',
    pzHoyCuentaSaleTxt: () => '',
  });
  t(loadFn(sbx, appJs, 'pzIsPubReal') && loadFn(sbx, appJs, 'pzHoySpeechHTML'), 'B8: pzHoySpeechHTML se extrae');
  const sp = (p) => sbx.pzHoySpeechHTML({ hoyPost: p, pendientes: 0, needOK: 0, haySemana: true, manual: false, en: false, tz: 'America/Argentina/Buenos_Aires', insight: '' });
  t(sp(DEMO_IMG) === '', 'B8a: speech demo → sin burbuja «ya salió»');
  t(sp(REAL).includes('ya salió'), 'B8b: speech real → «El de hoy ya salió»');
}

// ---------- B9. Vista de aprobación (apvPill) ----------
{
  const sbx = makeSbx({
    apvTz: () => 'America/Argentina/Buenos_Aires',
    apvHM: () => '19:00',
    humanError: (e) => e || '',
  });
  t(loadFn(sbx, appJs, 'pzIsPubReal') && loadFn(sbx, appJs, 'apvPill'), 'B9: apvPill se extrae');
  const pill = (p, dOk) => sbx.apvPill(p, new Date('2026-11-11T19:00:00Z'), dOk !== false);
  const hDemo = pill(DEMO_IMG);
  t(hDemo.includes('Pendiente') && !hDemo.includes('Publicado'), 'B9a: apv demo → «Pendiente», no «Publicado»');
  t(!hDemo.includes('Ver en Instagram'), 'B9b: apv demo → SIN «Ver en Instagram»');
  t(!hDemo.includes('Salió solo'), 'B9c: apv demo → tampoco «Salió solo» (su approval auto no festeja)');
  const hReal = pill(REAL);
  t(hReal.includes('Publicado') && hReal.includes('Ver en Instagram') && hReal.includes('https://www.instagram.com/p/DMxYz123/'), 'B9d: apv real → «Publicado» + link a su URL');
  t(pill(REAL_NOLINK).includes('Publicado') && !pill(REAL_NOLINK).includes('Ver en Instagram'), 'B9e: apv real sin permalink → «Publicado» sin link');
  t(pill({ ...SCHED, approval: 'approved' }).includes('Aprobado'), 'B9f: apv programado aprobado → «Aprobado»');
}

// ---------- B10. Chip de estado del chat-posteo + badge del historial ----------
{
  const sbx = makeSbx();
  t(loadFn(sbx, appJs, 'pzIsPubReal') && loadFn(sbx, appJs, 'pzPcStatusChip') && loadFn(sbx, appJs, 'badge'), 'B10: pzPcStatusChip/badge se extraen');
  t(sbx.pzPcStatusChip(DEMO_IMG, false) === 'Programado', 'B10a: chip demo → «Programado»');
  t(sbx.pzPcStatusChip(REAL, false) === 'Publicado', 'B10b: chip real → «Publicado»');
  t(sbx.pzPcStatusChip(DEMO_IMG, true) === 'Scheduled', 'B10c: chip demo EN → «Scheduled»');
  const bDemo = sbx.badge('published', DEMO_IMG);
  t(bDemo.includes('Programado') && bDemo.includes('b-scheduled'), 'B10d: badge historial demo → «Programado»');
  const bReal = sbx.badge('published', REAL);
  t(bReal.includes('Publicado') && bReal.includes('b-published'), 'B10e: badge historial real → «Publicado»');
  t(sbx.badge('published').includes('Publicado'), 'B10f: badge sin post → «Publicado» (fail-safe)');
}

// ---------- B11. publishNowFlow: okmsg honesto + demo:true ----------
async function testPublishNowFlow() {
  const sbx = makeSbx({
    track: () => {},
    paint: () => {},
    humanError: (e) => e || '',
    publishApproveSheet: async () => true, // el OK explícito ya dado (la hoja no es de este lote)
  });
  t(loadFn(sbx, appJs, 'pzIsPubReal') && loadFn(sbx, appJs, 'publishNowFlow'), 'B11: publishNowFlow se extrae');
  const run = async (post) => {
    sbx.api = {
      post: async () => ({ ok: true }),
      get: async () => ({ post }),
    };
    const mount = { innerHTML: '', querySelector: () => null };
    const res = await sbx.publishNowFlow(post.id, mount);
    return { res, html: mount.innerHTML };
  };
  const demo = await run(DEMO_IMG);
  t(demo.res && demo.res.ok === true, 'B11a: demo → el flujo completa (la simulación no rompe)');
  t(demo.res && demo.res.demo === true, 'B11b: demo → retorna demo:true');
  t(demo.res && demo.res.permalink === '', 'B11c: demo → permalink vacío (no se propaga el falso)');
  t(demo.html.includes('simulado (modo demo)') && demo.html.includes('no salió a Instagram'), 'B11d: demo → okmsg honesto «simulado… no salió a Instagram»');
  t(!demo.html.includes('Ver en IG') && !demo.html.includes('publicado en instagram'), 'B11e: demo → okmsg SIN «Ver en IG» ni «publicado en instagram»');
  const real = await run(REAL);
  t(real.res && !real.res.demo && real.res.permalink === 'https://www.instagram.com/p/DMxYz123/', 'B11f: real → demo falsy + permalink real');
  t(real.html.includes('publicado en instagram!') && real.html.includes('Ver en IG'), 'B11g: real → okmsg «publicado en instagram!» + «Ver en IG»');
}

// ---------- B12. Celebración viva, chip «Recién publicado», compartir, modal ----------
{
  t(appJs.includes("if (hit && hit.post && pzIsPubReal(hit.post)) pzPubCelebShow(hit.post);"), 'B12a: celebración «¡Tu posteo salió!» solo si es real');
  const justPub = (appJs.match(/diff\.justPublished\.includes\(String\(id\)\) && pzIsPubReal\(t2\.post\)/g) || []).length;
  t(justPub === 2, 'B12b: chip «Recién publicado» del vivo solo si es real (2 sitios)');
  t(appJs.includes('const url = (pzIsPubReal(post) && post.ig_permalink)'), 'B12c: compartir del detalle usa solo permalink real');
  t(appJs.includes("(p.ig_permalink && !String(p.ig_permalink).includes('/demo_'))"), 'B12d: modal de celebración filtra el link demo');
  t(appJs.includes('const ftDemo = !!(res && res.demo);'), 'B12e: modal del primer posteo distingue demo');
  t(appJs.includes("if (st === 'published') return '<span class=\"apv-pill apv-pill-pend\">⏳ Pendiente</span>';"), 'B12f: apv simulado → Pendiente explícito');
}

// ---------- C. Server: isDemoPub / semanaWhenLabel / celebración / /api/posts ----------
{
  const sbx = makeSbx();
  t(loadFn(sbx, srv, 'isDemoPub') && loadFn(sbx, srv, 'ymdInTz') && loadFn(sbx, srv, 'semanaWhenLabel'), 'C: isDemoPub/semanaWhenLabel se extraen');
  const label = (p, en) => sbx.semanaWhenLabel(p, 'America/Argentina/Buenos_Aires', !!en);
  t(label(DEMO_IMG, false).startsWith('Sale ·'), 'C1: semana demo ES → «Sale · …», no «Publicado»');
  t(label(REAL, false).startsWith('Publicado ·'), 'C2: semana real ES → «Publicado · …»');
  t(label(DEMO_STORY, false).startsWith('Sale ·'), 'C3: semana demo historia (permalink vacío) → «Sale · …»');
  t(label(LEGACY, false).startsWith('Publicado ·'), 'C4: semana legacy sin marcadores → «Publicado · …» (fail-safe)');
  t(label(REAL, true).startsWith('Posted ·'), 'C5: semana real EN → «Posted · …»');
  t(label(DEMO_IMG, true).startsWith('Goes out ·'), 'C6: semana demo EN → «Goes out · …»');
  t(srv.includes("AND COALESCE(ig_media_id, '') NOT LIKE 'demo_%' AND COALESCE(ig_permalink, '') NOT LIKE '%/demo_%'"), 'C7: /api/publish-celebration excluye filas demo');
  t(srv.includes('p.ig_permalink, p.ig_media_id, p.ig_likes'), 'C8: /api/posts trae ig_media_id');
  t((srv.match(/20261105-v925/g) || []).length === 1, 'C9: BUILD v925 ×1 en server.js');
  t(!srv.includes('20261105-v900'), 'C10: sin rastro de v900 en server.js');
}

// ---------- C11. La query de celebración elige solo el publicado real (SQLite) ----------
{
  const m = srv.match(/app\.get\('\/api\/publish-celebration'[\s\S]*?`([^`]+)`/);
  t(!!m, 'C11: se extrae la query de /api/publish-celebration del fuente');
  if (m) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, published_at TEXT, ig_permalink TEXT, ig_media_id TEXT, caption TEXT, hashtags TEXT, media_type TEXT, image_path TEXT);`);
    const ins = db.prepare(`INSERT INTO posts (id, user_id, status, published_at, ig_permalink, ig_media_id, caption, media_type, image_path) VALUES (?,?,?,?,?,?,?,?,?)`);
    ins.run(593, 1, 'published', '2026-11-11 19:42:00', 'https://www.instagram.com/p/demo_abc1234/', 'demo_abc1234', 'demo img', 'video', '/media/a.jpg');
    ins.run(594, 1, 'published', '2026-11-11 19:43:00', '', 'demo_zz99', 'demo story', 'story', '/media/b.jpg');
    ins.run(592, 1, 'published', '2026-11-11 19:05:00', 'https://www.instagram.com/p/DMxYz123/', '17912345678901234', 'real', 'image', '/media/c.jpg');
    ins.run(596, 1, 'scheduled', '2026-11-12 19:00:00', '', '', 'prog', 'image', '/media/d.jpg');
    const row = db.prepare(m[1]).get(1);
    t(row && row.id === 592, 'C11a: celebración elige el publicado REAL (592), no los demo (593/594)');
    db.prepare(`DELETE FROM posts WHERE id = 592`).run();
    t(!db.prepare(m[1]).get(1), 'C11b: con solo demos, la celebración no elige ninguno');
    ins.run(590, 1, 'published', '2026-11-10 19:05:00', 'https://www.instagram.com/p/DMxYz000/', '17900000000000000', 'real viejo', 'image', '/media/e.jpg');
    ins.run(591, 1, 'published', '2026-11-11 18:05:00', 'https://www.instagram.com/p/DMxYz111/', '17911111111111111', 'real nuevo', 'image', '/media/f.jpg');
    const first = db.prepare(m[1]).get(1);
    t(first && first.id === 590, 'C11c: con dos reales, celebra el PRIMERO (el más viejo)');
    db.close();
  }
}

// ---------- E. Censo: todo lo ajeno idéntico a v924 ----------
{
  const occ = (src, sub) => (src.split(sub).length - 1);
  t(occ(srvBase, 'needs_review') === 107 && occ(srv, 'needs_review') === 107, 'E1: needs_review 107 occ en server.js (base y release)');
  t(occ(appBase, 'pzBoostEsMP') === 23 && occ(appJs, 'pzBoostEsMP') === 23, 'E2: pzBoostEsMP ×23');
  const c3b = (src) => occ(src, 'pz-boost-3d3');
  t(c3b(appBase) + c3b(fs.readFileSync(path.join(BASE, 'public/styles.css'), 'utf8')) + c3b(srvBase) === 36
    && c3b(appJs) + c3b(fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8')) + c3b(srv) === 36, 'E3: pz-boost-3d3 ×36');
  t(md5(fs.readFileSync(path.join(BASE, 'proactive.js'), 'utf8')) === md5(fs.readFileSync(path.join(ROOT, 'proactive.js'), 'utf8'))
    && md5(fs.readFileSync(path.join(ROOT, 'proactive.js'), 'utf8')).startsWith('9014a72ada77'), 'E4: proactive.js 9014a72ada77');
  t(appJs.includes("CHUNK_V = '20261105-v890'") && appBase.includes("CHUNK_V = '20261105-v890'"), 'E5: CHUNK_V 20261105-v890');
  t(fs.readFileSync(path.join(BASE, 'public/styles.css'), 'utf8') === fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8'), 'E6: styles.css byte-idéntico (no se toca)');
  t(fs.readFileSync(path.join(BASE, 'public/en/index.html'), 'utf8') === fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8'), 'E7: en/index.html byte-idéntico');
  const idxES = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  t(idxES.includes('app.js?v=636') && !idxES.includes('app.js?v=613'), 'E8: index ES app.js?v=636 (613 fuera)');
  t(idxES.includes('styles.css?v=20261255'), 'E9: index ES styles?v=20261255 (sin bump, no se toca)');
  // Diff exacto: solo 3 archivos (la suite es el único archivo nuevo).
  const { execSync } = require('child_process');
  let dif = '';
  try { execSync(`diff -rq "${BASE}" "${ROOT}"`, { encoding: 'utf8' }); } catch (e) { dif = e.stdout || ''; }
  const lines = dif.split('\n').filter(Boolean);
  const changed = lines.filter((l) => l.startsWith('Files ')).map((l) => l.replace(/^Files .*\/release\//, '').replace(/ differ$/, ''));
  const onlyIn = lines.filter((l) => l.startsWith('Only in '));
  t(changed.length === 3 && changed.includes('public/app.js') && changed.includes('public/index.html') && changed.includes('server.js'), 'E10: diff exacto = solo app.js + index.html + server.js (' + changed.join(', ') + ')');
  t(onlyIn.length === 1 && onlyIn[0].includes('test-lote-publicado-solo-si-se-publico.js'), 'E10b: único archivo nuevo en release/ = la suite');
  t(!fs.existsSync(path.join(ROOT, 'data')) && !fs.existsSync(path.join(ROOT, 'node_modules')), 'E11: sin data/ ni node_modules en release/');
}

// ---------- F. M78: las funciones tocadas existen y sus llamadas resuelven ----------
{
  const fns = ['pzIsPubReal', 'detSimpleMenuHTML', 'weekCardHTML', 'schedPostState', 'pcBadge', 'postCardHTML', 'badge', 'publishNowFlow', 'hfAnchorBarHTML', 'hfPeekHTML', 'hfDetailHTML', 'pzHoyTiraDetalleHTML', 'pzHoySpeechHTML', 'pzPcStatusChip', 'apvPill', 'pzPubCelebMaybe', 'hfDetailShare'];
  const sbx = makeSbx();
  const missing = fns.filter((n) => !extractFn(appJs, n));
  t(missing.length === 0, 'F1: todas las funciones tocadas existen en app.js' + (missing.length ? ' (faltan: ' + missing.join(', ') + ')' : ''));
  t(extractFn(srv, 'isDemoPub') !== '' && extractFn(srv, 'semanaWhenLabel') !== '', 'F2: isDemoPub/semanaWhenLabel existen en server.js');
  t((appJs.match(/pzIsPubReal\(/g) || []).length >= 20, 'F3: pzIsPubReal se usa en los sitios del badge/enlace (≥20 llamadas)');
  t(!appJs.includes("status === 'published' && d.ig_permalink"), 'F4: no queda el gate viejo del menú sin demo');
}

// ---------- D. Boot real + E2E /api/publish-celebration ----------
async function testBoot() {
  const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-v925-'));
  const PORT = 18799;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const srvProc = spawn('node', ['server.js'], {
    cwd: __dirname,
    // release/ no lleva node_modules (nunca se sube): las deps viven en el repo.
    env: { ...process.env, NODE_PATH: '/home/hatch/workspace/posta/node_modules', DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-v925', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', STRIPE_PUBLISHABLE_KEY: '', STRIPE_WEBHOOK_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const pid = srvProc.pid;
  let srvLog = '';
  srvProc.stdout.on('data', (d) => { srvLog += d; });
  srvProc.stderr.on('data', (d) => { srvLog += d; });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // El boot es lento (~20 s hasta la primera línea: carga de módulos +
    // migraciones sobre un DATA_DIR fresco; más bajo carga compartida).
    let booted = false;
    for (let i = 0; i < 120 && !booted; i++) {
      try { const r = await fetch(`${BASE_URL}/api/version`); if (r.ok) booted = true; } catch (e) {}
      if (!booted) await sleep(500);
    }
    t(booted, 'D1: boot: server levanta');
    if (!booted) { console.log('  log del server:', srvLog.slice(-2000)); return; }
    // /api/version v925 ×5, 0 errores.
    let versOk = 0;
    for (let i = 0; i < 5; i++) {
      try { const v = await (await fetch(`${BASE_URL}/api/version`)).json(); if (v.build === '20261105-v925') versOk++; } catch (e) {}
    }
    t(versOk === 5, `D2: /api/version v925 5/5 (fueron ${versOk}/5)`);
    // Index servidos con los ?v= estampados.
    const idxES = await (await fetch(`${BASE_URL}/`)).text();
    t(idxES.includes('app.js?v=636'), 'D3: index ES servido: app.js?v=636');
    t(idxES.includes('styles.css?v=20261255'), 'D4: index ES servido: styles.css?v=20261255 (sin bump)');
    const idxEN = await (await fetch(`${BASE_URL}/en/`)).text();
    t(idxEN.includes('styles.css?v=20261255'), 'D5: index EN servido: styles.css?v=20261255');
    t(!idxEN.includes('app.js?v='), 'D6: index EN servido: sin app.js?v=');
    // Usuario real + celebración E2E.
    const api = async (cookie, method, p, body) => {
      const rr = await fetch(BASE_URL + p, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      let data = null; try { data = await rr.json(); } catch (e) {}
      return { status: rr.status, data };
    };
    const reg = await api('', 'POST', '/api/auth/register', { email: 'v925@test.local', password: 'x1234567', nombre: 'V925' });
    t(reg.status === 200 && reg.data && reg.data.ok, 'D7: registro OK');
    const login = await fetch(BASE_URL + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'v925@test.local', password: 'x1234567' }) });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    t(cookie.length > 0, 'D8: login: cookie de sesión');
    // Siembra directa en la DB del boot (con reintentos por el lock de SQLite).
    const dbPath = path.join(TMP, 'posta.db');
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA busy_timeout = 5000');
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('v925@test.local').id;
    const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, published_at, ig_permalink, ig_media_id, media_type) VALUES (?,?,?,?,?,?,?,?)`);
    const insertRetry = (row) => {
      for (let i = 0; i < 5; i++) {
        try { ins.run(...row); return true; } catch (e) { if (!/busy|locked/i.test(e.message) || i === 4) throw e; }
      }
      return false;
    };
    insertRetry([uid, '/media/trial-veja.jpg', 'demo img', 'published', '2026-11-11 19:42:00', 'https://www.instagram.com/p/demo_abc1234/', 'demo_abc1234', 'video']);
    insertRetry([uid, '/media/trial-veja.jpg', 'demo story', 'published', '2026-11-11 19:43:00', '', 'demo_zz99', 'story']);
    const c1 = await api(cookie, 'GET', '/api/publish-celebration');
    t(c1.status === 200 && c1.data && c1.data.show === false, 'D9: celebración con SOLO demos → show:false (no festeja la simulación)');
    insertRetry([uid, '/media/real.jpg', 'real', 'published', '2026-11-11 19:05:00', 'https://www.instagram.com/p/DMxYz123/', '17912345678901234', 'image']);
    const realId = db.prepare(`SELECT id FROM posts WHERE user_id = ? AND ig_media_id = '17912345678901234'`).get(uid).id;
    const c2 = await api(cookie, 'GET', '/api/publish-celebration');
    t(c2.status === 200 && c2.data && c2.data.show === true && c2.data.post && c2.data.post.id === realId, 'D10: celebración + real → show:true con el posteo REAL (id ' + realId + ')');
    t(c2.data && c2.data.post && !String(c2.data.post.ig_permalink || '').includes('/demo_'), 'D11: la celebración no devuelve permalink demo');
    db.close();
  } finally {
    // Matado por PID exacto (nunca pkill/pgrep por patrón).
    try { process.kill(pid, 'SIGTERM'); } catch (e) {}
    await new Promise((res) => { srvProc.on('exit', res); setTimeout(res, 8000); });
    t(srvProc.exitCode !== null || srvProc.signalCode === 'SIGTERM', 'D12: server matado por PID exacto (' + pid + ')');
    let portFree = false;
    try { await fetch(`${BASE_URL}/api/version`); } catch (e) { portFree = true; }
    t(portFree, 'D13: puerto libre tras matar el server');
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    t(!fs.existsSync(TMP), 'D14: tmp del boot limpio');
  }
}

(async () => {
  await testPublishNowFlow();
  await testBoot();
  console.log(`\ntest-lote-publicado-solo-si-se-publico: ${ok} OK, ${bad} FAIL`);
  process.exit(bad ? 1 : 0);
})();
