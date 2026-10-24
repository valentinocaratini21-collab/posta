// test-frente3d.js — Frente 3 suma 3 (comportamiento del feed).
// Wiring/estática por ítem + comportamiento puro en VM (sin servidor):
//  1) la caja de comentarios del detalle enruta al motor vigente
//     (POST /api/ideas/chat) con el posteo como contexto.
//  2) doble toque → corazón + aprobación SOLO en manual (flag de
//     autopiloto de GET /api/autopilot); en la tile NO se cablea.
//  3) revelado progresivo por polling de /api/posts, sin spinner
//     global ni render() dentro del reveal.
//  4) pinch/press/artefactos CSS presentes; gestos clásicos y la
//     atenuación .pub intactos.
// Uso: node test-frente3d.js
const fs = require('fs');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const app = fs.readFileSync(__dirname + '/public/app.js', 'utf8');
const css = fs.readFileSync(__dirname + '/public/styles.css', 'utf8');
const srv = fs.readFileSync(__dirname + '/server.js', 'utf8');

const count = (hay, needle) => hay.split(needle).length - 1;
const sliceFn = (name, nextName) => {
  const a = app.indexOf('function ' + name);
  const b = nextName ? app.indexOf('function ' + nextName, a + 10) : app.indexOf('\n/* ----------', a + 10);
  return a >= 0 && b > a ? app.slice(a, b) : '';
};

console.log('— ítem 1: editar comentando (hilo → motor vigente)');
ok(count(app, 'function f3ThreadHTML(') === 1, 'f3ThreadHTML definida 1 vez');
const wk = sliceFn('weekCardHTML', 'homeWeekHTML');
ok(wk.includes('${f3ThreadHTML(d)}'), 'weekCardHTML incluye el hilo al pie del detalle');
const apv = sliceFn('approvalPostView', 'bindApprovalPost');
ok(apv.includes('${f3ThreadHTML(p)}'), 'approvalPostView incluye el hilo al pie del detalle');
const send = sliceFn('f3ThreadSend', 'f3ApprovalMode') || app.slice(app.indexOf('async function f3ThreadSend'), app.indexOf('/* ---------- Ítem 2'));
ok(send.includes("api.post('/api/ideas/chat'"), 'el envío del hilo va a POST /api/ideas/chat (motor vigente)');
ok(send.includes('chatDraftsCtx'), 'el envío lleva el contexto de borradores vigente (chatDraftsCtx)');
ok(send.includes('editá SOLO el posteo') && send.includes('editing ONLY post'), 'el contexto identifica ESTE posteo (ES/EN)');
ok(send.includes('r.edit') && send.includes('f3ApplyEditedPost'), 'si el servidor editó (r.edit.ok) la vista se actualiza en el acto');
ok(app.includes("localStorage.getItem(f3ThreadKey(id))") && app.includes("'f3thread:'"), 'hilo por posteo persistido local (mínima viable declarada)');
ok(srv.includes("INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)"), 'el turno también persiste en el chat global del servidor (chat_messages)');
ok(count(app, "document.addEventListener('submit'") >= 1 && app.includes('[data-f3-form]'), 'submit del hilo cableado por delegación (1 listener)');

console.log('— ítem 2: doble toque para aprobar');
const gesture = app.slice(app.indexOf('async function f3GestureApprove'), app.indexOf('let F3_TAP'));
ok(app.includes("api.get('/api/autopilot')"), 'el modo se lee de GET /api/autopilot (fuente vigente)');
ok(gesture.indexOf('if (!mode.manual)') >= 0 && gesture.indexOf('if (!mode.manual)') < gesture.indexOf('apvAcc.click()'), 'en autopiloto retorna ANTES de cualquier aprobación (corazón solo visual)');
ok(gesture.includes('apvAcc.click()') && gesture.includes('apvDraft.click()'), 'detalle apv: reusa los botones vigentes (#apvAccept / #apvAcceptDraft)');
ok(gesture.includes('rev.click()'), 'tarjeta: reusa el [data-revaccept] cableado por bindReview');
ok(gesture.includes("api.patch('/api/posts/'") && gesture.includes("/signal'"), 'fallback sin bindReview: mismo núcleo (PATCH + signal approved)');
ok(gesture.includes('pcApprove(id, root, null)'), 'programado pendiente: reusa pcApprove (POST /approve vigente)');
ok(app.includes('320') && app.includes('dx < 42'), 'doble toque acotado (<320ms, <42px): sin falsos positivos de scroll');
const ptr = app.slice(app.indexOf('function f3OnPointerUp'), app.indexOf('function f3OnClickCapture'));
ok(ptr.includes("closest('.igmock-media, .apv-media')"), 'el gesto vive SOLO en la vista abierta (.igmock-media/.apv-media)');
ok(!ptr.includes('.hf-tile') && !ptr.includes('.fp-tile'), 'la TILE no tiene doble toque (resto declarado: conviven tap/scroll/hold)');
ok(app.includes('f3HeartBurst') && app.includes("className = 'f3-heart'"), 'animación del corazón presente');
ok(css.includes('@keyframes f3Heart'), 'keyframes del corazón en CSS');

console.log('— ítem 3: la semana se cuelga en vivo');
const reveal = app.slice(app.indexOf('function f3HomeTilesFrom'), app.indexOf('function f3MaybeWatchLive'));
ok(reveal.includes("api.get('/api/posts')"), 'señal incremental real: polling de GET /api/posts');
ok(reveal.includes('homeGridCompose') && reveal.includes('homeTileHTML'), 'home: posición final del motor de balance vigente');
ok(reveal.includes('feedPreviewHTML'), 'feed de Schedule: recompone con feedPreviewHTML vigente');
ok(reveal.includes('hf-tile-enter'), 'los nuevos entran con .hf-tile-enter escalonados');
ok(!reveal.includes('render('), 'el reveal NO dispara render() global');
ok(!/spinner|hs-generating.*innerHTML/i.test(reveal), 'sin spinner global sobre el feed');
ok(app.includes('setInterval') && app.includes('4000') && app.includes('F3_LIVE.polls >= 75'), 'watcher con polling 4s y tope (75 ciclos)');
ok(app.includes('try { f3RevealCheck(); } catch (e) {}'), 'el pool del autopilot avisa al reveal en cada poolRender');
ok(css.includes('.hf-tile-enter') && css.includes('@keyframes f3TileIn'), 'CSS de entrada de tiles presente');

console.log('— ítem 4: tacto de Instagram');
ok(app.includes('F3_PINCH') && app.includes("Math.min(3,"), 'pinch con clamp máximo 3x');
ok(app.includes("img.style.transition = 'transform .3s ease'"), 'retorno suave al soltar (transition de vuelta)');
ok(app.includes("pts.size === 2") || app.includes('F3_PINCH.pts.size === 2'), 'pinch SOLO con 2 punteros (el scroll de 1 dedo no se toca)');
ok(css.includes('touch-action:pan-y'), 'touch-action:pan-y en la foto abierta (scroll vertical intacto)');
ok(css.includes('.hf-tile:active{filter:brightness(.8)}') && css.includes('.fp-tile:active{filter:brightness(.8)}'), 'presión visual transitoria en tiles (:active)');
ok(css.includes('-webkit-tap-highlight-color:transparent'), 'tap-highlight eliminado en superficies de gesto');
ok(css.includes('.hf-tile,.fp-tile,.scf-mini,.scf-mini-x,.igmock-media,.apv-media') && css.includes('user-select:none;-webkit-user-select:none'), 'user-select:none en tiles/detalle/hojas');
ok(css.includes('.f3-input') && css.includes('user-select:text;-webkit-user-select:text'), 'inputs/hilo/caption siguen seleccionables');
ok(css.includes('.hf-tile.pub img,.hf-tile.pub video{filter:brightness(.58) saturate(.85)}'), 'atenuación .pub de publicados INTACTA');
const f3css = css.slice(css.indexOf('FRENTE 3 · SUMA 3'));
ok(!f3css.includes('text-transform:uppercase'), 'ningún text-transform:uppercase en la tanda (pie de foto nunca en mayúsculas)');
ok(f3css.includes('.f3-txt{text-transform:none'), 'el hilo muestra el texto tal cual (sin mayúscula forzada)');
ok(ptr.includes('[data-f3-thread]') || app.includes("closest('[data-f3-thread], button"), 'gestos clásicos: el doble toque ignora taps en botones/form del hilo');

console.log('— comportamiento puro (VM): f3ThreadHTML / f3MsgHTML / f3ApprovalMode');
{
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sandbox = { esc, ME: { lang: 'es' }, console };
  vm.createContext(sandbox);
  const srcFns = [
    sliceFn('f3En', 'f3ThreadKey'),
    sliceFn('f3MsgHTML', 'f3ThreadHTML'),
    sliceFn('f3ThreadHTML', 'f3ThreadPush'),
  ].join('\n');
  vm.runInContext(srcFns, sandbox);
  const draft = { id: 7, status: 'draft', image_path: '/media/x.jpg', caption: 'hola' };
  const hEs = sandbox.f3ThreadHTML(draft);
  ok(hEs.includes('data-f3-thread="7"') && hEs.includes('Pedile un cambio a Posty'), 'ES: caja presente en borrador con imagen');
  ok(sandbox.f3ThreadHTML({ id: 8, status: 'published', image_path: '/media/x.jpg' }) === '', 'publicado: sin caja (el motor solo edita draft/scheduled)');
  ok(sandbox.f3ThreadHTML({ id: 9, status: 'draft', image_path: '' }) === '', 'pendiente sin imagen: sin caja');
  ok(sandbox.f3ThreadHTML({ id: 10, status: 'scheduled', image_path: '/media/x.jpg' }).includes('data-f3-input'), 'programado: caja presente');
  sandbox.ME = { lang: 'en' };
  ok(sandbox.f3ThreadHTML(draft).includes('Ask Posty for a change'), 'EN: paridad de idioma (ME.lang)');
  const mh = sandbox.f3MsgHTML({ role: 'user', text: '<script>alert(1)</script>' });
  ok(!mh.includes('<script>') && mh.includes('&lt;script&gt;'), 'f3MsgHTML escapa HTML del usuario');
}
{
  const esc = (s) => String(s == null ? '' : s);
  let enabled = true;
  const sandbox = { esc, ME: { lang: 'es' }, console, api: { get: async () => ({ enabled }) } };
  vm.createContext(sandbox);
  const srcMode = app.slice(app.indexOf('let F3_APPR_MODE'), app.indexOf('const F3_HEART_SVG'));
  vm.runInContext(srcMode, sandbox);
  (async () => {
    const m1 = await sandbox.f3ApprovalMode();
    ok(m1.manual === false, 'autopilot enabled=true → manual=false (corazón solo)');
    const sandbox2 = { esc, ME: { lang: 'es' }, console, api: { get: async () => ({ enabled: false }) } };
    vm.createContext(sandbox2);
    vm.runInContext(srcMode, sandbox2);
    const m2 = await sandbox2.f3ApprovalMode();
    ok(m2.manual === true, 'autopilot enabled=false → manual=true (doble toque aprueba)');
    console.log(`\n${total - fails}/${total} ok — ${fails} fallas`);
    process.exit(fails ? 1 : 0);
  })();
}
