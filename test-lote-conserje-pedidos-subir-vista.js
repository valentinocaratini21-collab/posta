// test-lote-conserje-pedidos-subir-vista.js — LOTE CONSERJE-PEDIDOS-SUBIR-VISTA
// Cierra el hueco visual de los pasos 5/8 de la spec de pedidos por
// voz (Valentino, 13/11 22:26): los pedidos que nacen en el tab Subir
// (tabla subir_pedidos_voz, LOTE PEDIDO-VOZ-REVISION) ya se listaban y
// decidían por los endpoints admin pedidos-subir, pero NINGUNA sección
// del chunk del conserje los pintaba — la sección del compuesto
// PEDIDOS-VOZ lista solo los pedidos de la TIRA (cambios sobre un
// posteo). Este lote suma la sección «📤 Pedidos desde Subir · posteo
// nuevo» al chunk: pinta pedido (nota transcripta + material), lo
// entendido (las respuestas del cliente en Subir: cuándo, promo,
// mejora, caption, subtítulos), el estado y, cuando ya se armó, el
// posteo que salió — lado a lado, como la tira. Las decisiones
// (aprobar/descartar) van a los endpoints que YA existen: la puerta
// de revisión vive en el servidor y esta vista no agrega ninguna.
// También corrige la frase del chunk que quedó desactualizada en
// v1044 («la nota de voz del tab Subir todavía no se guarda en ningún
// lado»: desde PVR esa nota SÍ se guarda y queda en revisión).
// Cubre: pines de fuente · render del chunk en VM (lista, detalle por
// estado, las dos secciones sin mezclarse, el render completo del
// conserje con ambas secciones montadas, decidir por el endpoint con
// su 502 reintentable) · boot real (el flujo del cliente crea el
// pedido, el payload de pedidos-subir trae lo que la vista pinta y el
// chunk servido trae la sección).
// Uso:
//   node test-lote-conserje-pedidos-subir-vista.js        → contra este árbol
//   PZ_TREE=<árbol> node test-lote-conserje-pedidos-subir-vista.js → control
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { spawn, execSync } = require('child_process');

const TREE = process.env.PZ_TREE || __dirname;
const PORT = 35193;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = 'adm-vista';
const tmpDir = '/tmp/posta-conserje-vista-' + process.pid;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 240) : ''}`); }
}
const has = (s, x) => String(s || '').includes(x);

// ================= Parte A: pines de fuente =================
console.log('· fuente — sección, endpoints, frase y bump');
const chunkSrc = fs.readFileSync(path.join(TREE, 'public', 'chunk-conserje.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
check('el chunk tiene la sección «Pedidos desde Subir · posteo nuevo» con su caja', has(chunkSrc, '📤 Pedidos desde Subir · posteo nuevo') && has(chunkSrc, 'data-cj="pedidos-subir"') && has(chunkSrc, 'id="cjPedidosSubir"'));
check('la sección de la tira sigue, rotulada como la puerta de cambios', has(chunkSrc, '🎙 Pedidos por voz · cambios a un posteo') && has(chunkSrc, 'data-cj="pedidos-voz"') && has(chunkSrc, "support/conserje/pedidos-voz"));
check('la vista lee el endpoint que ya existe (GET pedidos-subir)', has(chunkSrc, "adminApi('support/conserje/pedidos-subir', 'GET')"));
check('las decisiones van a los endpoints que ya existen (aprobar/descartar por id)', has(chunkSrc, "'support/conserje/pedidos-subir/' + id + '/' + dec") && has(chunkSrc, 'data-cj="pedido-subir-decidir"'));
check('la frase del tab Subir quedó corregida (se guarda y se revisa abajo)', has(chunkSrc, 'también se guardan y quedan en revisión') && !has(chunkSrc, 'todavía no se guarda en ningún lado'));
check('el estado del conserje suma la lista de Subir sin tocar la de la tira', has(chunkSrc, 'pedidosSubir: null') && has(chunkSrc, 'pedidosVoz: null'));
check('los endpoints pedidos-subir del servidor están (no se tocaron)', has(srvSrc, "app.get('/api/admin/support/conserje/pedidos-subir', requireAdminToken") && has(srvSrc, 'pedidos-subir/:id/aprobar') && has(srvSrc, 'pedidos-subir/:id/descartar'));
check('micro-pieza del tablero: subirPedidoPublico suma business_name e ig_username desde profiles', has(srvSrc, "SELECT business_name, ig_username FROM profiles WHERE user_id = ?") && has(srvSrc, "out.business_name = (prof && prof.business_name) || '';") && has(srvSrc, "out.ig_username = (prof && prof.ig_username) || '';"));
check('micro-pieza del tablero: la tarjeta identifica al cliente por su negocio/@ (quien), con el email de respaldo', has(chunkSrc, 'const quien = pe.business_name'));
check('CHUNK_V bumpeado al tocar el chunk (no queda el de v1044)', !has(appSrc, "const CHUNK_V = '20261105-v1044';"));

// ================= Parte B: render del chunk en VM =================
console.log('· render del chunk en VM');
const fakeCard = { innerHTML: '' };
const adminCalls = [];
let adminNext = null;
const ctx = {
  console,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  pzIc: () => '',
  $: (sel) => (sel === '#conserjeCard' ? fakeCard : null),
  adminApi: async (p, m, d) => { adminCalls.push([p, m]); if (adminNext) { const n = adminNext; adminNext = null; if (n.throw) throw n.throw; return n.value; } return { ok: true, pedidos: [] }; },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  location: { hash: '' },
  sessionStorage: { getItem: () => null, removeItem: () => {} },
  localStorage: { setItem: () => {} },
  window: {},
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(chunkSrc, ctx, { filename: 'chunk-conserje.js' });
check('las funciones de la sección existen en el chunk', typeof ctx.conserjePedidosSubirHTML === 'function' && typeof ctx.conserjePedidoSubirItemHTML === 'function' && typeof ctx.conserjePedidoSubirDetalleHTML === 'function' && typeof ctx.conserjePedidoSubirDecidir === 'function' && typeof ctx.conserjePedidoSubirChip === 'function' && typeof ctx.conserjePedidosSubirCargar === 'function');
if (typeof ctx.conserjePedidosSubirHTML !== 'function') {
  // Control contra la base: sin las funciones no hay render que
  // probar; los checks de render cuentan como fallados y se sigue
  // al boot (donde el chunk servido también discrimina).
  for (const n of ['lista con los 4 estados', 'detalle pendiente lado a lado', 'detalle aprobado con error reintentable', 'detalle armado con el posteo', 'detalle descartado sin acciones', 'estado vacío', 'las dos secciones no se mezclan', 'el render completo monta ambas secciones', 'decidir llama al endpoint y actualiza', 'decidir con 502 pinta el aprobado con motivo']) check('render: ' + n, false, 'funciones ausentes en este árbol');
} else {
  const PED = (o) => Object.assign({ id: 0, user_id: 87, asset_id: 1, kind: 'foto', nota: '', respuestas: {}, estado: 'pendiente_revision', post_id: null, armado: null, error: '', created_at: '2026-11-13 23:20:00', decided_at: null, decided_by: '', email: '', asset_path: '' }, o);
  ctx.conserjeEstado.pedidosSubir = { ok: true, pedidos: [
    PED({ id: 11, nota: 'PEDIDO-SUBIR-UNICO: quiero que el viernes salga el 2x1 en medialunas', respuestas: { cuando: 'posty', promo: '2x1', mejora: 'si', caption_modo: 'posty', caption_text: '', subs: 'si' }, email: 'dueno@portrait.example', asset_path: '/media/medialunas.jpg' }),
    PED({ id: 12, nota: 'anunciá el evento del sábado', respuestas: { cuando: 'semana', promo: 'no', mejora: 'no', caption_modo: 'mio', caption_text: 'Caption del cliente', subs: 'si' }, estado: 'aprobado', error: 'caption_no_generada', email: 'dos@example.com', asset_path: '/media/evento.jpg', decided_at: '2026-11-13 23:00:00', decided_by: 'equipo' }),
    PED({ id: 13, nota: 'quiero un posteo para el lanzamiento', respuestas: { cuando: 'posty', promo: 'no', mejora: 'si', caption_modo: 'mio', caption_text: 'Sale el lanzamiento', subs: 'si' }, estado: 'armado', post_id: 901, armado: { scheduled_at: '2026-11-15T22:00:00.000Z', dia: '2026-11-15', hora: '19:00', camino: 'desplazo_posty', desplazado_post_id: 555, mejora_aplicada: true, subs_aplicados: false }, post: { id: 901, status: 'scheduled', scheduled_at: '2026-11-15 22:00:00', image_path: '/media/901.jpg', media_type: 'image', caption: 'el 2x1 de los viernes' }, email: 'tres@example.com', asset_path: '/media/lanz.jpg' }),
    PED({ id: 14, nota: 'quiero que salga el sorteo', estado: 'descartado', email: 'cuatro@example.com', decided_at: '2026-11-13 23:05:00', decided_by: 'equipo' }),
    PED({ id: 15, nota: 'pedido con negocio identificado', email: 'cinco@example.com', business_name: 'Negocio Vista', ig_username: 'negocio.vista' }),
  ] };
  const lista = ctx.conserjePedidosSubirHTML();
  check('render: lista con los 4 estados', lista.includes('dueno@portrait.example') && lista.includes('Pendiente de revisión') && lista.includes('Aprobado · falta armar') && lista.includes('Armado ✓') && lista.includes('Descartado') && lista.includes('PEDIDO-SUBIR-UNICO'));
  check('render: la tarjeta del pedido con negocio muestra el nombre y el @, no el email (micro-pieza)', lista.includes('Negocio Vista') && lista.includes('@negocio.vista') && !lista.includes('cinco@example.com'));

  ctx.conserjeEstado.pedidoSubirAbierto = 11;
  const detPend = ctx.conserjePedidosSubirHTML();
  check('render: detalle pendiente lado a lado', detPend.includes('Lo que pidió') && detPend.includes('Lo que entendió Posty') && detPend.includes('El posteo que quedó') && detPend.includes('Promo:</b> 2x1') && detPend.includes('Lo escribe Posty') && detPend.includes('Mejorar la foto:</b> Sí') && detPend.includes('/media/medialunas.jpg') && detPend.includes('Todavía no hay posteo') && detPend.includes('data-cj="pedido-subir-decidir"') && detPend.includes('data-decision="aprobar"') && detPend.includes('data-decision="descartar"') && detPend.includes('✓ Aprobar — se arma para mañana'));

  ctx.conserjeEstado.pedidoSubirAbierto = 12;
  const detAp = ctx.conserjePedidosSubirHTML();
  check('render: detalle aprobado con error reintentable', detAp.includes('Aprobado, pero el armado no salió') && detAp.includes('caption_no_generada') && detAp.includes('Reintentar el armado') && detAp.includes('Lo escribió el cliente: «Caption del cliente»') && detAp.includes('Esta semana'));

  ctx.conserjeEstado.pedidoSubirAbierto = 13;
  const detArm = ctx.conserjePedidosSubirHTML();
  check('render: detalle armado con el posteo', detArm.includes('El posteo que quedó') && detArm.includes('el 2x1 de los viernes') && detArm.includes('Programado') && detArm.includes('/media/901.jpg') && detArm.includes('✅ Armado: sale') && detArm.includes('se movió para no pisarlo') && !detArm.includes('data-cj="pedido-subir-decidir" data-id="13"'));

  ctx.conserjeEstado.pedidoSubirAbierto = 14;
  const detDes = ctx.conserjePedidosSubirHTML();
  check('render: detalle descartado sin acciones', detDes.includes('No se construyó nada: el pedido se descartó.') && detDes.includes('Descartado: no se construye nada.') && !detDes.includes('data-cj="pedido-subir-decidir" data-id="14"'));

  ctx.conserjeEstado.pedidoSubirAbierto = 0;
  ctx.conserjeEstado.pedidosSubir = { ok: true, pedidos: [] };
  check('render: estado vacío', ctx.conserjePedidosSubirHTML().includes('Todavía no hay pedidos desde Subir.'));

  ctx.conserjeEstado.pedidosVoz = { ok: true, total: 1, pedidos: [{ id: 3, user_id: 87, business_name: 'Portrait Coffee', ig_username: 'portrait.coffee', cuando: '13/11, 16:00', ambito: 'semana', pedido: 'PEDIDO-TIRA-UNICO', respuesta: 'Dale', entendido: 'Dale', entregado: true, revision: { estado: 'pendiente', decidido_en: null }, posteo: null }] };
  ctx.conserjeEstado.pedidosSubir = { ok: true, pedidos: [PED({ id: 11, nota: 'PEDIDO-SUBIR-UNICO', email: 'dueno@portrait.example' })] };
  check('render: las dos secciones no se mezclan', ctx.conserjePedidosSubirHTML().includes('PEDIDO-SUBIR-UNICO') && !ctx.conserjePedidosSubirHTML().includes('PEDIDO-TIRA-UNICO') && ctx.conserjePedidosVozHTML().includes('PEDIDO-TIRA-UNICO') && !ctx.conserjePedidosVozHTML().includes('PEDIDO-SUBIR-UNICO'));

  ctx.conserjeEstado.datos = { ok: true, fecha: '2026-11-15', resumen: { total: 0, necesitan_atencion: 0 }, ventana: {}, items: [], sin_posteo: [] };
  ctx.conserjeRender();
  check('render: el render completo monta ambas secciones', fakeCard.innerHTML.includes('🎙 Pedidos por voz · cambios a un posteo') && fakeCard.innerHTML.includes('📤 Pedidos desde Subir · posteo nuevo') && fakeCard.innerHTML.includes('id="cjPedidosVoz"') && fakeCard.innerHTML.includes('id="cjPedidosSubir"') && fakeCard.innerHTML.includes('también se guardan y quedan en revisión') && !fakeCard.innerHTML.includes('todavía no se guarda en ningún lado'));

  // Decidir: camino feliz y 502 reintentable, por el endpoint real.
  (async () => {
    const tBtn = { disabled: false, getAttribute: (k) => (k === 'data-id' ? '11' : 'aprobar') };
    adminNext = { value: { ok: true, pedido: PED({ id: 11, nota: 'PEDIDO-SUBIR-UNICO', email: 'dueno@portrait.example', estado: 'armado', post_id: 950, armado: { dia: '2026-11-15', hora: '19:00', camino: 'directo' } }) } };
    await ctx.conserjePedidoSubirDecidir(tBtn);
    const itemTras = (ctx.conserjeEstado.pedidosSubir.pedidos || []).find((x) => x.id === 11) || {};
    check('render: decidir llama al endpoint y actualiza', adminCalls.some((c) => c[0] === 'support/conserje/pedidos-subir/11/aprobar' && c[1] === 'POST') && itemTras.estado === 'armado' && itemTras.post_id === 950, JSON.stringify(adminCalls));

    const err502 = new Error('armado_fallido'); err502.status = 502; err502.data = { ok: false, error: 'caption_no_generada', pedido: PED({ id: 11, nota: 'PEDIDO-SUBIR-UNICO', email: 'dueno@portrait.example', estado: 'aprobado', error: 'caption_no_generada' }) };
    adminNext = { throw: err502 };
    const tBtn2 = { disabled: false, getAttribute: (k) => (k === 'data-id' ? '11' : 'aprobar') };
    await ctx.conserjePedidoSubirDecidir(tBtn2);
    const item502 = (ctx.conserjeEstado.pedidosSubir.pedidos || []).find((x) => x.id === 11) || {};
    check('render: decidir con 502 pinta el aprobado con motivo', item502.estado === 'aprobado' && item502.error === 'caption_no_generada', JSON.stringify(item502).slice(0, 160));
    await parteC();
    console.log(`\n== ${pass} ok · ${fail} mal ==`);
    process.exit(fail ? 1 : 0);
  })();
  return; // el resto corre dentro del async de arriba
}

// ================= Parte C: boot real =================
function cookieOf(res) { const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []; return sc.map((c) => c.split(';')[0]).join('; '); }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
function pngDeColor(color) {
  const f = path.join(tmpDir, 'up-' + color + '.png');
  try { execSync(`ffmpeg -y -v error -f lavfi -i color=c=${color}:s=48x48 -frames:v 1 "${f}"`); return fs.readFileSync(f); }
  catch (e) { return PNG; }
}
async function waitUp() {
  for (let i = 0; i < 90; i++) { try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 1000)); }
  return false;
}
async function parteC() {
  console.log('· boot real — el payload que la vista pinta, y el chunk servido');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: TREE,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', ADMIN_TOKEN: ADMIN, SUPERVISION_HOOK_URL: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  const J = (r) => r.json().catch(() => ({}));
  try {
    const up = await waitUp();
    check('boot: el server booteó', up, log.slice(-200));
    if (!up) return;
    const rReg = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'vista@example.com', password: 'secreto1' }) });
    const cookie = cookieOf(rReg);
    const upF = await fetch(BASE + '/api/album/photo', { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: pngDeColor('red') });
    const upJ = await J(upF);
    const rRes = await J(await fetch(BASE + '/api/subir/resolver', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ asset_id: upJ.id, cuando: 'posty', caption_modo: 'mio', caption_text: 'Caption de la vista', mejora: 'no', promo: '2x1', extra: 'quiero que el viernes salga el 2x1 en medialunas' }) }));
    check('boot: el pedido del cliente nace en revisión', rRes.ok === true && rRes.modo === 'pedido_revision' && !!rRes.pedido_id, JSON.stringify(rRes).slice(0, 160));
    const rSinTok = await fetch(BASE + '/api/admin/support/conserje/pedidos-subir');
    check('boot: sin token admin no se lee (403)', rSinTok.status === 403, 'status=' + rSinTok.status);
    const lista = await J(await fetch(BASE + '/api/admin/support/conserje/pedidos-subir?token=' + ADMIN));
    const pe = (lista.pedidos || []).find((p) => p.id === rRes.pedido_id) || {};
    check('boot: el payload trae lo que la vista pinta (nota, respuestas, estado, email, material)', has(pe.nota, '2x1') && pe.estado === 'pendiente_revision' && pe.email === 'vista@example.com' && !!pe.asset_path && !!pe.respuestas && pe.respuestas.promo === '2x1' && pe.respuestas.caption_text === 'Caption de la vista' && pe.post === undefined && pe.armado === null, JSON.stringify(pe).slice(0, 240));
    check('boot: el payload suma business_name e ig_username (micro-pieza; sin perfil cargado vienen vacíos, no inventados)', typeof pe.business_name === 'string' && typeof pe.ig_username === 'string', JSON.stringify(pe).slice(0, 240));
    const rAp = await J(await fetch(BASE + '/api/admin/support/conserje/pedidos-subir/' + rRes.pedido_id + '/aprobar?token=' + ADMIN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    const lista2 = await J(await fetch(BASE + '/api/admin/support/conserje/pedidos-subir?token=' + ADMIN));
    const pe2 = (lista2.pedidos || []).find((p) => p.id === rRes.pedido_id) || {};
    check('boot: al aprobar, el payload trae el posteo vinculado y el armado', rAp.ok === true && pe2.estado === 'armado' && !!pe2.post && pe2.post.caption === 'Caption de la vista' && !!pe2.armado && !!pe2.armado.dia, JSON.stringify(pe2).slice(0, 240));
    const chunkServido = await (await fetch(BASE + '/chunk-conserje.js')).text();
    check('boot: el chunk servido trae la sección «Pedidos desde Subir»', has(chunkServido, '📤 Pedidos desde Subir · posteo nuevo') && has(chunkServido, 'support/conserje/pedidos-subir'));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (typeof ctx.conserjePedidosSubirHTML !== 'function') {
  (async () => { await parteC(); console.log(`\n== ${pass} ok · ${fail} mal ==`); process.exit(fail ? 1 : 0); })();
}
