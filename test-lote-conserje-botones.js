'use strict';

// =====================================================================
// LOTE CONSERJE-BOTONES — suite PERMANENTE de la consola del conserje
// =====================================================================
// Orden del dueño (23/11/2026): «el conserje es muy importante. todos
// los botones tienen que funcionar». Esta suite es el freno para que
// eso siga siendo verdad en cada push futuro — el gate de la consola,
// análogo al M78 de app.js:
//
//   A · Gate estático: enumera los controles DESDE EL CÓDIGO SERVIDO
//       (public/conserje.js + public/conserje.html) y falla si aparece
//       un control sin handler definido, un handler fantasma (rama sin
//       botón), un botón sin atributo delegable, un enlace-botón sin
//       href, un onclick suelto, o una función llamada y no definida.
//   B · Ejercicio conductual: bootea el conserje.js real en un DOM
//       mínimo (vm, sin navegador) y CLIQUEA cada control por la
//       delegación real, exigiendo su efecto observable (su ruta, su
//       toast, su cambio de vista, la puerta). Incluye las regresiones
//       de los muertos que este lote arregló:
//         F2 · «Su feed» no mostraba las fotos (la ruta manda `img`;
//              la vista leía `image_url`) y el chip del borrador salía
//              «draft» crudo.
//         F4 · El deep link ?user=&post= se perdía al entrar por la
//              puerta del token.
//         F5 · La ficha que no cargaba fallaba EN SILENCIO: toda vía
//              de entrada (fila, chip, «Ver…», deep link) parecía un
//              botón muerto. Ahora avisa (puerta si 401/403, toast si
//              no) — espejo de cargar().
//         PUERTA · «Entrar» sin token era un clic mudo; ahora la
//              puerta dice qué falta.
//   C · Vecinas: los arreglos de CENSO-CONSERJE-2 (F1/F3/F6) siguen
//       en pie — este lote se compuso sobre ellos.
//
// Composición: esta suite vive en el árbol DESPUÉS de CENSO-CONSERJE-2
// (1846) y de CONSERJE-VER-GRANDE (1861) — por eso el gate conoce
// también los controles del visor (data-ver, visorCerrar/Prev/Next):
// los enumera desde el código servido, como a todos. La foto del
// feed (F2) la cerró VER-GRANDE con su línea de renderFeed; el B5 de
// esta suite exige el COMPORTAMIENTO (la foto se ve, el video va por
// su póster, el chip dice «Borrador») contra el texto que haya.
//
// Contra la base (v1251 + CENSO-CONSERJE-2), las verificaciones del
// lote (A9 y los B de F2/F4/F5/PUERTA) caen reproduciendo los muertos
// y el resto pasa; con el lote, todo pasa.
// Uso: node test-lote-conserje-botones.js — sale 0 si todo pasa.
// =====================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }

const jsSrc = read('public/conserje.js');
const htmlSrc = read('public/conserje.html');
const vistaSrc = read('conserje-vista.js');
const serverSrc = read('server.js');

// ---------------------------------------------------------------------
seccion('A · gate estático de controles');
t('A0 la consola existe en el árbol', jsSrc.length > 10000 && htmlSrc.length > 1000);

const actosRender = new Set();
for (const m of (jsSrc + '\n' + htmlSrc).matchAll(/data-act="([a-z0-9-]+)"/g)) actosRender.add(m[1]);
const ramas = new Set();
for (const m of jsSrc.matchAll(/act === '([a-z0-9-]+)'/g)) ramas.add(m[1]);
const sinRama = [...actosRender].filter((a) => !ramas.has(a));
t('A1 todo data-act renderizado tiene su rama en el handler delegado', sinRama.length === 0, sinRama.join(','));
const fantasmas = [...ramas].filter((a) => !actosRender.has(a));
t('A2 ninguna rama del handler es fantasma (todas se renderizan)', fantasmas.length === 0, fantasmas.join(','));

for (const attr of ['data-goto', 'data-sel', 'data-filtro', 'data-vista', 'data-ver']) {
  const seRende = (jsSrc + htmlSrc).includes(attr + '=');
  const seDelega = jsSrc.includes("closest('[" + attr + "]')");
  t('A3 ' + attr + ': renderizado ⇒ delegado', !seRende || seDelega);
}

// Todo <button> renderizado lleva un atributo que la delegación
// atiende, o es un botón estático con su listener propio por id
// (btnRecargar, gateBtn, y los del visor de CONSERJE-VER-GRANDE).
const CON_LISTENER = { btnRecargar: true, gateBtn: true };
const botones = [...(jsSrc + '\n' + htmlSrc).matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
const ATENDIDOS = ['data-act=', 'data-goto=', 'data-sel=', 'data-filtro=', 'data-vista=', 'data-ver='];
const huerfanos = botones.filter((b) => {
  if (ATENDIDOS.some((a) => b.includes(a))) return false;
  const idm = /id="([a-zA-Z]+)"/.exec(b);
  return !(idm && jsSrc.includes("$('" + idm[1] + "').addEventListener"));
});
t('A4 ningún <button> renderizado queda sin vía de atención', huerfanos.length === 0, huerfanos.join(' ').slice(0, 160));
for (const id of Object.keys(CON_LISTENER)) {
  t('A4 ' + id + ': existe en el HTML y tiene su listener', htmlSrc.includes('id="' + id + '"') && jsSrc.includes("$('" + id + "').addEventListener"));
}
const enlacesBtn = [...(jsSrc + '\n' + htmlSrc).matchAll(/<a\b[^>]*class="[^"]*btn[^"]*"[^>]*>/g)].map((m) => m[0]);
t('A5 todo enlace con clase btn trae href', enlacesBtn.length > 0 && enlacesBtn.every((a) => a.includes('href=')), enlacesBtn.join(' ').slice(0, 120));
t('A6 sin onclick sueltos (la consola delega, no inline)', !/onclick=/.test(jsSrc) && !/onclick=/.test(htmlSrc));
t('A7 el buscador tiene su listener de input', htmlSrc.includes('id="buscador"') && jsSrc.includes("$('buscador').addEventListener('input'"));
t('A7 el campo del token entra con Enter', jsSrc.includes("$('gateToken').addEventListener('keydown'"));
t('A7 el select de tratamiento se renderiza y tiene su change', jsSrc.includes('id="tratSel"') && jsSrc.includes("addEventListener('change', onTratamiento)"));
if (htmlSrc.includes('id="visorCerrar"')) {
  t('A7 el visor (CONSERJE-VER-GRANDE) trae sus tres botones con listener',
    ['visorCerrar', 'visorPrev', 'visorNext'].every((id) => jsSrc.includes("$('" + id + "').addEventListener")));
}

{ // A8 · funciones llamadas desde el handler delegado: todas definidas
  const ini = jsSrc.indexOf("document.addEventListener('click'");
  const fin = jsSrc.indexOf("$('buscador').addEventListener", ini);
  // Sin cadenas ni comentarios: las etiquetas de los botones
  // («Resolver y avisar (…)») y las notas de los lotes no son
  // llamadas a funciones.
  const cuerpoHandler = (ini >= 0 && fin > ini ? jsSrc.slice(ini, fin) : '')
    .replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const definidas = new Set();
  for (const m of jsSrc.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) definidas.add(m[1]);
  for (const m of jsSrc.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=/g)) definidas.add(m[1]);
  const GLOBALES = new Set(['confirm', 'prompt', 'Number', 'String', 'Boolean', 'Math', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'setTimeout']);
  const llamadas = new Set();
  for (const m of cuerpoHandler.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) llamadas.add(m[1]);
  const indefinidas = [...llamadas].filter((n) => !definidas.has(n) && !GLOBALES.has(n) && n !== 'if' && n !== 'for' && n !== 'while' && n !== 'catch' && n !== 'function');
  t('A8 toda función llamada por el handler delegado está definida', cuerpoHandler.length > 1000 && indefinidas.length === 0, indefinidas.join(','));
}

// Los arreglos de este lote, presentes (regresión estática).
{ // F2 (foto): dentro de renderFeed, la foto de la tile se lee del
  // campo que la ruta realmente manda (`img`). La línea exacta es de
  // CONSERJE-VER-GRANDE; el comportamiento lo exige el B5.
  const fi = jsSrc.indexOf('function renderFeed()');
  const ff = jsSrc.indexOf('function onTratamiento', fi);
  const fsrc = fi >= 0 && ff > fi ? jsSrc.slice(fi, ff) : '';
  t('A9 F2: renderFeed lee la foto de la tile desde `img`', fsrc.includes('t.img'));
}
{ // El chip se verifica DENTRO de renderFeed (la misma cadena existe
  // en chipDePost y no probaría nada): la rama del feed dice «Borrador»
  // y ya no imprime el status crudo de la tile.
  const feedIni = jsSrc.indexOf('function renderFeed()');
  const feedFin = jsSrc.indexOf('function onTratamiento', feedIni);
  const feedSrc = feedIni >= 0 && feedFin > feedIni ? jsSrc.slice(feedIni, feedFin) : '';
  t('A9 F2: el chip del borrador del feed dice «Borrador» (dentro de renderFeed)',
    feedSrc.includes("'<span class=\"state-chip yellow\">Borrador</span>'") && !feedSrc.includes("esc(t.status || '')"));
}
t('A9 F5: cargarCliente avisa (puerta en 401/403, toast en el resto)',
  jsSrc.includes("toast('No se pudo cargar la ficha.', 'err')") && jsSrc.includes('j.__status === 401 || j.__status === 403'));
t('A9 F4: la puerta sigue el deep link tras entrar',
  jsSrc.includes("cargar(true).then(function () {\n      if (deepUser) { try { gotoFicha(deepUser, deepPost || null); } catch (e) {} }\n    });\n  });"));
t('A9 PUERTA: «Entrar» sin token deja el mensaje en la puerta', jsSrc.includes('Pegá el token de administración para entrar.'));
const sello = /conserje\.js\?v=(\d+)/.exec(htmlSrc);
t('A9 el sello de la consola es ?v=7 o mayor (VER-GRANDE dejó el 6)', !!sello && Number(sello[1]) >= 7, sello && sello[0]);

// ---------------------------------------------------------------------
seccion('C · vecinas de CENSO-CONSERJE-2 en pie');
t('C1 F1: el motivo del posteo fallido va abierto (.d-error.open)', jsSrc.includes("'<div class=\"d-error open\">' + esc(d.texto || '')"));
t('C2 F6: el chip del fallido dice «No salió ✗» y el CSS trae .state-chip.red', jsSrc.includes('state-chip red">No salió ✗') && htmlSrc.includes('.state-chip.red{color:#ffc9c9}'));
t('C3 F3: la cadena del posteo referido completa (cliente → ruta → vista)',
  jsSrc.includes("'&post_id=' + Number(postId)") && serverSrc.includes('postId: Number(req.query.post_id) || 0') && vistaSrc.includes('const incluirId = Number(o.postId) || 0'));

// ---------------------------------------------------------------------
seccion('B · ejercicio conductual (DOM mínimo, clics por la delegación real)');

class El {
  constructor(id) {
    this.id = id || ''; this._html = ''; this.textContent = ''; this.value = '';
    this.disabled = false; this.style = {}; this.children = [];
    this._cls = new Set(); this._listeners = {}; this._attrs = {};
    this.offsetWidth = 0;
    const self = this;
    this.classList = {
      add: (...cs) => cs.forEach((c) => self._cls.add(c)),
      remove: (...cs) => cs.forEach((c) => self._cls.delete(c)),
      toggle: (c, force) => { if (force === undefined) force = !self._cls.has(c); if (force) self._cls.add(c); else self._cls.delete(c); return force; },
      contains: (c) => self._cls.has(c),
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  remove() {}
  focus() {}
  scrollIntoView() {}
  addEventListener(t2, fn) { (this._listeners[t2] = this._listeners[t2] || []).push(fn); }
  fire(t2, ev) { (this._listeners[t2] || []).slice().forEach((fn) => fn(ev || { target: this })); }
  click() { this.fire('click', { target: this }); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
}

const VISTA = {
  ok: true,
  hoy: { fecha_label: 'domingo 23 de noviembre', publica_hoy: 3, proxima_hora: '19:00', pruebas_activas: 2, decisiones_pendientes: 12, suscriptores: 4, meta_marzo: 30, disco_mb: 3200 },
  manana: { fecha_label: 'lunes 24 de noviembre', resumen: { listos: 1, en_preparacion: 1, faltan: 1, total: 3 }, items: [
    { user_id: 7, business_name: 'Café Aroma', estado: 'listo', post: { titulo: 'Tarta de limón', media_type: 'image', image_url: 'https://x/post7.jpg', poster_url: '' }, necesita_atencion: false },
    { user_id: 8, business_name: 'Gym Sur', estado: 'en_preparacion', post: null, necesita_atencion: true, motivo_atencion: 'Falta la foto del local' },
    { user_id: 9, business_name: 'Peluquería Luz', estado: 'falta', post: null, sin_posteo_decidido: false },
  ] },
  clientes: [
    { user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', clase: 'pago', clase_label: 'Cliente', categoria: 'Cafetería', dot: 'green', estado: 'Al día', racha: 3, pendientes: { total: 1 } },
    { user_id: 8, business_name: 'Gym Sur', ig_username: 'gymsur', clase: 'prueba_corriendo', clase_label: 'Prueba', categoria: 'Gimnasio', dot: 'yellow', estado: 'Pieza por decidir', racha: 0, prueba: { dias_restantes: 2 }, pendientes: { total: 0 } },
    { user_id: 9, business_name: 'Peluquería Luz', ig_username: 'peluluz', clase: 'prueba_pendiente', clase_label: 'Prueba', categoria: 'Peluquería', dot: 'grey', estado: 'Sin conectar', racha: 0, pendientes: { total: 0 } },
  ],
  mano: [
    { tipo: 'voz', clase: 'pedido', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'hace 5 min', message_id: 501, pedido: 'Quiero cambiar la foto del posteo', respuesta: 'Entendido: cambiar la foto.', posteo: { id: 900, status: 'scheduled', caption: 'Caption del 900', image_url: 'https://x/p900.jpg' } },
    { tipo: 'voz', es_idea: true, clase: 'pedido', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'hace 9 min', message_id: 502, pedido: 'Una idea para el finde' },
    { tipo: 'subir', clase: 'pedido', user_id: 8, business_name: 'Gym Sur', ig_username: 'gymsur', cuando: 'hace 12 min', kind: 'foto', texto: 'para el lunes' },
    { tipo: 'pieza', clase: 'decision', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'anoche', fecha: '2026-11-24', post_id: 901, titulo: 'Pieza de mañana', texto: 'Caption de la pieza', media_type: 'image', image_url: 'https://x/p901.jpg' },
    { tipo: 'pieza_falta', clase: 'decision', user_id: 9, business_name: 'Peluquería Luz', ig_username: 'peluluz', cuando: 'anoche', fecha: '2026-11-24', texto: 'Mañana no tiene posteo.' },
    { tipo: 'post_fallido', clase: 'problema', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'hoy 19:01', post_id: 902, texto: 'Meta no pudo procesar el video' },
    { tipo: 'conexion', clase: 'problema', user_id: 8, business_name: 'Gym Sur', ig_username: 'gymsur', cuando: 'hoy', texto: 'Se cayó la conexión de Instagram.' },
    { tipo: 'impulso', clase: 'problema', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'hoy', post_id: 903, boost_id: 77, budget_cents: 2000, texto: 'Error de Meta: cuenta sin permiso' },
    { tipo: 'alerta', clase: 'problema', kind: 'portada', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'hoy', post_id: 904, texto: 'La portada del posteo salió mal.' },
    { tipo: 'alerta', clase: 'problema', titulo: 'Disco del servidor', cuando: 'hoy', texto: 'Queda poco disco.' },
    { tipo: 'prueba_termina', clase: 'plata', user_id: 8, business_name: 'Gym Sur', ig_username: 'gymsur', cuando: 'hoy', texto: 'La prueba termina hoy.' },
    { tipo: 'pago_fallido', clase: 'plata', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'hoy', texto: 'Falló el cobro de la suscripción.' },
    { tipo: 'caso', clase: 'pedido', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'ayer', case_id: 55, titulo: 'Caso de prueba', texto: 'Detalle del caso', siguiente_paso: 'Revisar el material' },
  ],
  ultimas: [{ action: 'tratamiento', business_name: 'Café Aroma', cuando: 'hace 1 h', detalle: 'Familia Cálido' }],
  cola: [{ user_id: 9, business_name: 'Peluquería Luz', titulo: 'Producción a mano', detalle: 'Caso abierto desde la consola' }],
  familias: [{ key: 'calido', nombre: 'Cálido' }, { key: 'fresco', nombre: 'Fresco' }],
};
const CLIENTE = {
  ok: true, user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', categoria: 'Cafetería', es_invitado: false, racha: 3,
  etapa: { clave: 'ok', etiqueta: 'Al día' }, tratamiento: 'calido',
  ficha: { vende: { estrella: 'Tarta de limón', audiencia: 'Vecinos del barrio' }, estrategia: { linea: 'Producto real, todos los días', fuente: 'ig' }, nota: { texto: 'nota previa' } },
  plan_prueba_detalle: null,
  pendientes: { total: 1, voz: 1, chat: 0, revision: 0, casos: 0 },
  boost: { status: 'active', post_id: 903, budget_cents: 5000, fee_cents: 500 },
  semana: [
    { dia: 'lun', fecha: '17', key: '2026-11-17', estado: 'publicado' },
    { dia: 'mar', fecha: '18', key: '2026-11-18', estado: 'programado', hora: '19:00' },
    { dia: 'mié', fecha: '19', key: '2026-11-19', estado: 'borrador' },
    { dia: 'jue', fecha: '20', key: '2026-11-20', estado: 'frenado' },
    { dia: 'vie', fecha: '21', key: '2026-11-21', estado: 'falta' },
    { dia: 'sáb', fecha: '22', key: '2026-11-22', estado: 'publicado' },
    { dia: 'dom', fecha: '23', key: '2026-11-23', estado: 'falta', es_hoy: true },
  ],
  posteos: [
    { id: 910, status: 'draft', dia_key: '2026-11-24', titulo: 'Borrador del lunes', caption: 'Caption 910', tipo: 'Foto', media_type: 'image', image_url: 'https://x/p910.jpg', poster_url: '', scheduled_at: '2026-11-24T19:00:00' },
    { id: 911, status: 'published', dia_key: '2026-11-22', titulo: 'Publicado del sábado', caption: 'Caption 911', tipo: 'Foto', media_type: 'image', image_url: 'https://x/p911.jpg', poster_url: '', scheduled_at: '2026-11-22T19:00:00' },
    { id: 913, status: 'failed', dia_key: '2026-11-21', titulo: 'El que no salió', caption: 'Caption 913', tipo: 'Video', media_type: 'video', image_url: '', poster_url: 'https://x/poster913.jpg', scheduled_at: '2026-11-21T19:00:00' },
  ],
};
// La forma REAL de la ruta del feed (server.js): img + poster_url,
// SIN image_url y SIN caption.
const FEED = { ok: true, disponible: true, user_id: 7, tiles: [
  { kind: 'post', post_id: 910, img: 'https://x/feed910.jpg', media_type: 'image', poster_url: '', status: 'draft', es_revision: true, pinned: false },
  { kind: 'post', post_id: 912, img: 'https://x/feed912.mp4', media_type: 'video', poster_url: 'https://x/poster912.jpg', status: 'scheduled', es_revision: false, pinned: false },
  { kind: 'ig', post_id: null, img: 'https://x/ig1.jpg', media_type: 'image', poster_url: '', status: 'published', es_revision: false, pinned: false },
] };

function rutasDefault(over) {
  over = over || {};
  return function (url) {
    const u = url.split('&token=')[0].split('?token=')[0];
    if (over[u]) return over[u];
    if (u.indexOf('/api/admin/conserje/vista/cliente') === 0) return { status: 200, payload: CLIENTE };
    if (u.indexOf('/api/admin/conserje/vista') === 0) return { status: 200, payload: VISTA };
    if (u.indexOf('/api/admin/support/conserje/feed') === 0) return { status: 200, payload: FEED };
    if (u.indexOf('/api/admin/ai-costs') === 0) return { status: 200, payload: { ok: true, today_spend_usd: 1.5 } };
    if (u.indexOf('/api/admin/') === 0) return { status: 200, payload: { ok: true } };
    return { status: 404, payload: { ok: false, error: 'sin_ruta' } };
  };
}

function boot(opts) {
  opts = opts || {};
  const els = new Map();
  const getEl = (id) => { if (!els.has(id)) els.set(id, new El(id)); return els.get(id); };
  const fetchLog = [];
  const routes = rutasDefault(opts.routes);
  const store = new Map(Object.entries(opts.storage || {}));
  const docListeners = {};
  const sandbox = {
    URLSearchParams, console, setTimeout: () => 0, clearTimeout: () => {},
    location: { search: opts.search || '', pathname: '/conserje' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    history: { replaceState() {} },
    document: {
      getElementById: getEl,
      createElement: () => new El(''),
      addEventListener: (t2, fn) => { (docListeners[t2] = docListeners[t2] || []).push(fn); },
    },
    fetch: (url, init) => {
      init = init || {};
      fetchLog.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
      const r = routes(url, init);
      if (r === 'reject') return Promise.reject(new Error('network'));
      return Promise.resolve({ status: r.status || 200, json: () => Promise.resolve(r.payload) });
    },
    requestAnimationFrame: (fn) => fn(),
    confirm: opts.confirm || (() => true),
    prompt: opts.prompt !== undefined ? opts.prompt : (() => 'texto de prueba'),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(jsSrc, sandbox, { filename: 'conserje.js' });
  function clickAttrs(attrs) {
    const btn = new El('');
    for (const k of Object.keys(attrs)) btn.setAttribute(k, attrs[k]);
    const target = { closest: (sel) => { const m = /\[data-([a-z-]+)\]/.exec(sel); if (!m) return null; return btn.getAttribute('data-' + m[1]) !== null ? btn : null; } };
    (docListeners.click || []).forEach((fn) => fn({ target }));
    return btn;
  }
  return { els, getEl, fetchLog, clickAttrs };
}
async function flush() { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); }
function toastsDe(b) { return b.getEl('toasts').children.map((c) => c.textContent); }
function fetchA(b, frag) { return b.fetchLog.filter((f) => f.url.indexOf(frag) >= 0); }
const TOK = { posta_admin_token: 'tok-test' };

(async () => {
  // --- inventario renderizado ---
  {
    const b = boot({ storage: TOK });
    await flush();
    const dec = b.getEl('decisiones').innerHTML;
    const centro = b.getEl('centro').innerHTML;
    t('B1 arranque: roster, mañana, cola y decisiones se renderizan con sus controles',
      b.getEl('roster').innerHTML.includes('data-sel="7"') && centro.includes('data-goto="7"')
      && b.getEl('cola').innerHTML.includes('data-sel="9"') && dec.includes('data-act="pieza-sale"'));
    t('B1 las 11 clases de tarjeta traen sus botones', ['voz', 'pieza', 'impulso', 'caso'].every((x) => dec.length > 0)
      && dec.includes('data-act="idea-resolver"') && dec.includes('data-act="falta-pedir"') && dec.includes('data-act="portada-ok"') && dec.includes('data-act="caso-cerrar"'));
    t('B1 el motivo del posteo fallido va abierto (vecina F1, conductual)', dec.includes('<div class="d-error open">Meta no pudo procesar el video</div>'));
  }
  // --- clics en tarjetas ---
  {
    const b = boot({ storage: TOK });
    await flush();
    const n0 = b.fetchLog.length;
    const ultimo = (frag) => b.fetchLog.slice(n0).filter((x) => x.url.includes(frag)).pop();
    b.clickAttrs({ 'data-act': 'pieza-sale', 'data-uid': '7', 'data-fecha': '2026-11-24', 'data-pid': '901' }); await flush();
    t('B2 pieza-sale → decidir sale', !!ultimo('revision/decidir') && ultimo('revision/decidir').body.decision === 'sale');
    b.clickAttrs({ 'data-act': 'pieza-nosale', 'data-uid': '7', 'data-fecha': '2026-11-24', 'data-pid': '901' }); await flush();
    t('B2 pieza-nosale → decidir no_sale', !!ultimo('revision/decidir') && ultimo('revision/decidir').body.decision === 'no_sale');
    b.clickAttrs({ 'data-act': 'falta-pedir', 'data-uid': '9', 'data-fecha': '2026-11-24' }); await flush();
    t('B2 falta-pedir → decidir pedir', !!ultimo('revision/decidir') && ultimo('revision/decidir').body.decision === 'pedir');
    b.clickAttrs({ 'data-act': 'impulso-ok', 'data-uid': '7', 'data-bid': '77', 'data-pid': '903' }); await flush();
    t('B2 impulso-ok → accion impulso_visto', !!ultimo('/accion') && ultimo('/accion').body.action === 'impulso_visto');
    const errEl = b.getEl('err-77');
    b.clickAttrs({ 'data-act': 'impulso-detalle', 'data-bid': '77' }); await flush();
    t('B2 impulso-detalle → abre el error en el acto', errEl.classList.contains('open'));
    b.clickAttrs({ 'data-act': 'portada-ok', 'data-uid': '7', 'data-pid': '904' }); await flush();
    t('B2 portada-ok → accion portada_vista', !!ultimo('/accion') && ultimo('/accion').body.action === 'portada_vista');
    b.clickAttrs({ 'data-act': 'caso-cerrar', 'data-cid': '55' }); await flush();
    t('B2 caso-cerrar → POST caso-cerrar', !!ultimo('caso-cerrar') && ultimo('caso-cerrar').body.case_id === 55);
    b.clickAttrs({ 'data-act': 'voz-resuelto', 'data-mid': '501' }); await flush();
    t('B2 voz-resuelto → POST voz-resuelto', !!ultimo('voz-resuelto') && ultimo('voz-resuelto').body.message_id === 501);
    b.clickAttrs({ 'data-act': 'voz-descartar', 'data-mid': '501' }); await flush();
    t('B2 voz-descartar → decidir descartado', !!ultimo('pedidos-voz/decidir') && ultimo('pedidos-voz/decidir').body.decision === 'descartado');
    b.clickAttrs({ 'data-act': 'idea-resolver', 'data-mid': '502', 'data-uid': '7' }); await flush();
    t('B2 idea-resolver → abre su formulario', b.getEl('ideaRes-502').innerHTML.includes('data-act="idea-enviar"'));
    b.getEl('ideaText-502').value = 'Respuesta para la idea';
    b.clickAttrs({ 'data-act': 'idea-enviar', 'data-mid': '502', 'data-uid': '7' }); await flush();
    t('B2 idea-enviar → POST resolver-idea con el texto', !!ultimo('resolver-idea') && ultimo('resolver-idea').body.texto === 'Respuesta para la idea');
    b.clickAttrs({ 'data-act': 'voz-responder', 'data-mid': '501', 'data-uid': '7' }); await flush();
    t('B2 voz-responder → abre su formulario', b.getEl('vozReply-501').innerHTML.includes('data-act="voz-enviar"'));
    b.getEl('vozText-501').value = 'Respuesta como Posty';
    const n1 = b.fetchLog.length;
    b.clickAttrs({ 'data-act': 'voz-enviar', 'data-mid': '501', 'data-uid': '7' }); await flush();
    const env = b.fetchLog.slice(n1);
    t('B2 voz-enviar → manda el chat y cierra el pedido', env.some((x) => x.url.includes('/api/admin/support/7/chat')) && env.some((x) => x.url.includes('voz-resuelto')));
    const b2 = boot({ storage: TOK, prompt: () => null, confirm: () => false });
    await flush();
    const m0 = b2.fetchLog.length;
    b2.clickAttrs({ 'data-act': 'pieza-arreglar', 'data-uid': '7', 'data-fecha': '2026-11-24', 'data-pid': '901' }); await flush();
    b2.clickAttrs({ 'data-act': 'voz-descartar', 'data-mid': '501' }); await flush();
    b2.clickAttrs({ 'data-act': 'caso-cerrar', 'data-cid': '55' }); await flush();
    b2.clickAttrs({ 'data-act': 'post-descartar', 'data-id': '910' }); await flush();
    t('B2 cancelar prompt/confirm no llama a la API', b2.fetchLog.length === m0);
    const b3 = boot({ storage: TOK, prompt: () => 'arreglar la luz' });
    await flush();
    b3.clickAttrs({ 'data-act': 'pieza-arreglar', 'data-uid': '7', 'data-fecha': '2026-11-24', 'data-pid': '901' }); await flush();
    const fa = b3.fetchLog.find((x) => x.url.includes('revision/decidir') && x.body && x.body.decision === 'arreglar');
    t('B2 pieza-arreglar → decidir arreglar con la nota', !!fa && fa.body.nota === 'arreglar la luz');
  }
  // --- navegación ---
  {
    const b = boot({ storage: TOK });
    await flush();
    b.clickAttrs({ 'data-goto': '8' }); await flush();
    t('B3 data-goto → abre la ficha', fetchA(b, 'vista/cliente?user_id=8').length >= 1);
    b.clickAttrs({ 'data-goto': '7', 'data-goto-post': '900' }); await flush();
    t('B3 «Ver el posteo» → la ficha pide el posteo referido (vecina F3)', fetchA(b, 'vista/cliente?user_id=7&post_id=900').length >= 1);
    b.clickAttrs({ 'data-act': 'ver-cliente', 'data-uid': '9' }); await flush();
    t('B3 ver-cliente → abre la ficha', fetchA(b, 'vista/cliente?user_id=9').length >= 1);
    const bf = boot({ storage: TOK });
    await flush();
    bf.clickAttrs({ 'data-filtro': 'pruebas' }); await flush();
    t('B3 filtro pruebas → la lista se filtra en el acto', bf.getEl('roster').innerHTML.includes('Gym Sur') && !bf.getEl('roster').innerHTML.includes('Café Aroma'));
    bf.getEl('buscador').value = 'zzz-sin-match';
    bf.getEl('buscador').fire('input'); await flush();
    bf.clickAttrs({ 'data-act': 'limpiar-busqueda' }); await flush();
    t('B3 buscador + limpiar-busqueda → la lista vuelve entera', bf.getEl('buscador').value === '' && bf.getEl('roster').innerHTML.includes('Gym Sur'));
    const nR = fetchA(bf, '/api/admin/conserje/vista').length;
    bf.getEl('btnRecargar').click(); await flush();
    t('B3 ↻ Actualizar → recarga la vista', fetchA(bf, '/api/admin/conserje/vista').length > nR);
  }
  // --- la ficha ---
  {
    const b = boot({ storage: TOK });
    await flush();
    b.clickAttrs({ 'data-sel': '7' }); await flush();
    const centro = b.getEl('centro').innerHTML;
    t('B4 la ficha trae sus acciones (posteo, nota, volver, producir, toggles)',
      ['post-sale', 'post-reprogramar', 'post-descartar', 'nota-guardar', 'ir-manana', 'producir'].every((a) => centro.includes('data-act="' + a + '"'))
      && centro.includes('data-vista="feed"') && centro.includes('href="https://instagram.com/cafearoma"'));
    t('B4 el chip del posteo fallido dice «No salió ✗» (vecina F6, conductual)', centro.includes('state-chip red">No salió ✗'));
    const n0 = b.fetchLog.length;
    const ultimo = (frag) => b.fetchLog.slice(n0).filter((x) => x.url.includes(frag)).pop();
    b.clickAttrs({ 'data-act': 'post-sale', 'data-id': '910', 'data-fecha': '2026-11-24' }); await flush();
    t('B4 post-sale → decidir sale con el posteo', !!ultimo('revision/decidir') && ultimo('revision/decidir').body.post_id === 910);
    const b4 = boot({ storage: TOK, prompt: () => '2026-11-25 19:00' });
    await flush();
    b4.clickAttrs({ 'data-sel': '7' }); await flush();
    const m0 = b4.fetchLog.length;
    const ult4 = (frag) => b4.fetchLog.slice(m0).filter((x) => x.url.includes(frag)).pop();
    b4.clickAttrs({ 'data-act': 'post-reprogramar', 'data-id': '910' }); await flush();
    t('B4 post-reprogramar → POST con la fecha nueva', !!ult4('/reprogramar') && ult4('/reprogramar').body.scheduled_at === '2026-11-25 19:00');
    b4.clickAttrs({ 'data-act': 'post-descartar', 'data-id': '910' }); await flush();
    t('B4 post-descartar → POST descartar', !!ult4('/descartar'));
    b4.clickAttrs({ 'data-act': 'producir', 'data-fecha': '2026-11-23' }); await flush();
    t('B4 producir → POST vista/producir', !!ult4('vista/producir') && ult4('vista/producir').body.user_id === 7);
    b4.getEl('notaInput').value = 'Nota de prueba';
    b4.clickAttrs({ 'data-act': 'nota-guardar' }); await flush();
    t('B4 nota-guardar → POST nota con el texto', !!ult4('conserje/nota') && ult4('conserje/nota').body.nota === 'Nota de prueba');
    b4.clickAttrs({ 'data-act': 'ir-manana' }); await flush();
    t('B4 ir-manana → vuelve la producción de mañana', b4.getEl('centro').innerHTML.includes('Producción de mañana'));
    const sel = b.getEl('tratSel');
    sel.value = 'fresco';
    sel.fire('change', { target: sel }); await flush();
    t('B4 tratSel change → POST tratamiento', fetchA(b, 'vista/tratamiento').some((x) => x.method === 'POST'));
    const b5 = boot({ storage: TOK, routes: { '/api/admin/conserje/vista/tratamiento': { status: 200, payload: { ok: false, error: 'colision', ocupa: { business_name: 'Otro', ig_username: 'otro' } } } } });
    await flush();
    b5.clickAttrs({ 'data-sel': '7' }); await flush();
    const sel5 = b5.getEl('tratSel');
    sel5.value = 'fresco';
    sel5.fire('change', { target: sel5 }); await flush();
    t('B4 tratamiento en colisión → avisa y no se aplica', toastsDe(b5).some((x) => x.includes('ya la lleva')) && sel5.value === 'calido');
  }
  // --- «Su feed» (F2) ---
  {
    const b = boot({ storage: TOK });
    await flush();
    b.clickAttrs({ 'data-sel': '7' }); await flush();
    b.clickAttrs({ 'data-vista': 'feed' }); await flush();
    const cuerpo = b.getEl('centroCuerpo').innerHTML;
    t('B5 Su feed → pide el feed del cliente', fetchA(b, 'support/conserje/feed?user_id=7').length >= 1);
    t('B5 F2 · la foto de la tile se ve', cuerpo.includes('<img src="https://x/feed910.jpg"'));
    t('B5 F2 · el video pinta su póster, jamás el .mp4', cuerpo.includes('<img src="https://x/poster912.jpg"') && !cuerpo.includes('feed912.mp4'));
    t('B5 F2 · la tile de Instagram se ve', cuerpo.includes('<img src="https://x/ig1.jpg"'));
    t('B5 F2 · el chip del borrador dice «Borrador», no «draft»', cuerpo.includes('>Borrador</span>') && !cuerpo.includes('>draft</span>'));
    b.clickAttrs({ 'data-vista': 'semana' }); await flush();
    t('B5 toggle Semana → vuelve la semana', b.getEl('centro').innerHTML.includes('Su semana'));
  }
  // --- puerta y deep link (F4 + PUERTA) ---
  {
    const b = boot({ storage: {}, search: '?user=7&post=910' });
    await flush();
    t('B6 sin token: la puerta se abre y nada se pide', b.getEl('gate').classList.contains('open') && b.fetchLog.length === 0);
    b.getEl('gateBtn').click(); await flush();
    t('B6 PUERTA · «Entrar» sin token avisa qué falta', (b.getEl('gateMsg').textContent || '').includes('Pegá el token'));
    b.getEl('gateToken').value = 'tok-nuevo';
    b.getEl('gateBtn').click(); await flush();
    t('B6 F4 · tras la puerta, el deep link abre la ficha referida', fetchA(b, 'vista/cliente?user_id=7&post_id=910').length >= 1);
    const b2 = boot({ storage: TOK, search: '?user=7&post=910' });
    await flush();
    t('B6 deep link con token guardado → la ficha referida (control)', fetchA(b2, 'vista/cliente?user_id=7&post_id=910').length >= 1);
    const b3 = boot({ storage: {}, search: '' });
    await flush();
    b3.getEl('gateToken').value = 'tok-enter';
    b3.getEl('gateToken').fire('keydown', { key: 'Enter', target: b3.getEl('gateToken') }); await flush();
    t('B6 Enter en el token → entra', fetchA(b3, '/api/admin/conserje/vista').length >= 1);
  }
  // --- la ficha que no carga (F5) ---
  {
    const b = boot({ storage: TOK, routes: { '/api/admin/conserje/vista/cliente?user_id=7': { status: 500, payload: { ok: false, error: 'boom' } } } });
    await flush();
    b.clickAttrs({ 'data-sel': '7' }); await flush();
    t('B7 F5 · ficha con error 500 → toast «No se pudo cargar la ficha»', toastsDe(b).some((x) => x.includes('No se pudo cargar la ficha')));
    const b2 = boot({ storage: TOK, routes: { '/api/admin/conserje/vista/cliente?user_id=7': { status: 401, payload: { ok: false, error: 'token' } } } });
    await flush();
    b2.clickAttrs({ 'data-sel': '7' }); await flush();
    t('B7 F5 · ficha con 401 → la puerta se reabre con su mensaje', b2.getEl('gate').classList.contains('open') && (b2.getEl('gateMsg').textContent || '').includes('no abrió la consola'));
    const b3 = boot({ storage: TOK, routes: { '/api/admin/conserje/vista/cliente?user_id=7': 'reject' } });
    await flush();
    b3.clickAttrs({ 'data-sel': '7' }); await flush();
    t('B7 F5 · ficha sin red → toast, no silencio', toastsDe(b3).some((x) => x.includes('No se pudo cargar la ficha')));
  }

  console.log('\n== CONSERJE-BOTONES: ' + ok + ' ok · ' + mal + ' MAL ==');
  process.exit(mal === 0 ? 0 : 1);
})().catch((e) => { console.error('SUITE ROTA:', e && e.stack || e); process.exit(2); });
