'use strict';

// =====================================================================
// LOTE CONSERJE-BANDEJA — el rediseño móvil de la consola (mock 1)
// =====================================================================
// Censo: CENSO-CONSERJE-3 §5.1 (línea 1865), aprobado por el dueño
// 23/11 11:29 («Arregla el conserje»). La consola en el teléfono pasa
// a ser la bandeja: fondo crema, tarjetas blancas, navegación
// inferior Hoy / Negocios / Posteos / Más, consumiendo la ruta que ya
// existe (GET /api/admin/conserje/vista) y las rutas de acción
// vigentes. La consola de escritorio queda intacta detrás de su
// media query: el rediseño gobierna solo ≤760px. «Aprobar todo» NO
// se construye (la tanda la aprueba el dueño del negocio: su
// puerta); las decisiones son por pieza.
//
//   A · Gate estático ADAPTADO de la suite permanente de botones
//       (CONSERJE-BOTONES): todo control renderizado — incluidos los
//       nuevos de la capa móvil (data-mtab / data-mbiz / data-mback /
//       data-mact) — tiene su delegación; ninguna rama es fantasma;
//       el sello va en ?v=10; «Aprobar todo» no existe.
//   B · Ejercicio conductual (DOM mínimo, el arnés de la suite
//       permanente): la bandeja pinta contra un payload con la forma
//       real de la vista — Hoy = mano como tarjetas (con el hilo de
//       la idea y el compositor en la tarjeta), Negocios = tablero
//       semáforo con el problema primero y la ficha al tocar,
//       Posteos = cola de revisión con las decisiones por pieza
//       (Sale dispara revision/decidir con la fecha de mañana),
//       Más = ultimas + accesos (Consola completa ↔ volver).
//   C · Contrato: los campos que la capa consume existen en la
//       proyección real del servidor (conserje-vista.js).
//   D · Chromium real (check-bandeja-chromium.py): boot del árbol,
//       390px sin scroll horizontal, botones ≥44px, navegación y el
//       ida-y-vuelta con el escritorio; 1280px = escritorio intacto.
//
// Contra la base (v1274 + CONSERJE-INSTALABLE, sin este lote): A, B
// y D caen en los casos de la bandeja; C pasa (el contrato ya era
// real). Uso: node test-lote-conserje-bandeja.js — sale 0 si pasa.
// =====================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');

const ROOT = process.env.TREE || (fs.existsSync(path.join(__dirname, 'public', 'conserje.html')) ? __dirname : path.join(__dirname, 'release'));
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

// ---------------------------------------------------------------------
seccion('A · gate estático de controles (adaptado a las tarjetas)');
t('A0 la consola y la capa móvil existen en el árbol', jsSrc.length > 10000 && htmlSrc.includes('id="movil"') && htmlSrc.includes('id="mBody"'));

const actosRender = new Set();
for (const m of (jsSrc + '\n' + htmlSrc).matchAll(/data-act="([a-z0-9-]+)"/g)) actosRender.add(m[1]);
const ramas = new Set();
for (const m of jsSrc.matchAll(/act === '([a-z0-9-]+)'/g)) ramas.add(m[1]);
const sinRama = [...actosRender].filter((a) => !ramas.has(a));
t('A1 todo data-act renderizado tiene su rama en el handler delegado', sinRama.length === 0, sinRama.join(','));
const fantasmas = [...ramas].filter((a) => !actosRender.has(a));
t('A2 ninguna rama del handler es fantasma (todas se renderizan)', fantasmas.length === 0, fantasmas.join(','));

for (const attr of ['data-goto', 'data-sel', 'data-filtro', 'data-vista', 'data-ver', 'data-mtab', 'data-mbiz', 'data-mback', 'data-mact']) {
  const seRende = (jsSrc + htmlSrc).includes(attr);
  const seDelega = jsSrc.includes("closest('[" + attr + "]')");
  t('A3 ' + attr + ': renderizado ⇒ delegado', !seRende || seDelega);
}

const botones = [...(jsSrc + '\n' + htmlSrc).matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
const ATENDIDOS = ['data-act=', 'data-goto=', 'data-sel=', 'data-filtro=', 'data-vista=', 'data-ver', 'data-mtab=', 'data-mbiz=', 'data-mback', 'data-mact='];
const huerfanos = botones.filter((b) => {
  if (ATENDIDOS.some((a) => b.includes(a))) return false;
  const idm = /id="([a-zA-Z]+)"/.exec(b);
  return !(idm && jsSrc.includes("$('" + idm[1] + "').addEventListener"));
});
t('A4 ningún <button> renderizado queda sin vía de atención', huerfanos.length === 0, huerfanos.join(' ').slice(0, 200));
for (const id of ['btnRecargar', 'gateBtn', 'volverBandeja', 'visorCerrar', 'visorPrev', 'visorNext']) {
  t('A4 ' + id + ': existe en el HTML y tiene su listener', htmlSrc.includes('id="' + id + '"') && jsSrc.includes("$('" + id + "').addEventListener"));
}
const enlacesBtn = [...(jsSrc + '\n' + htmlSrc).matchAll(/<a\b[^>]*class="[^"]*(btn|m-link)[^"]*"[^>]*>/g)].map((m) => m[0]);
t('A5 todo enlace-botón trae href', enlacesBtn.length > 0 && enlacesBtn.every((a) => a.includes('href=')), enlacesBtn.join(' ').slice(0, 120));
t('A6 sin onclick sueltos (la consola delega, no inline)', !/onclick=/.test(jsSrc) && !/onclick=/.test(htmlSrc));

const definidas = new Set();
for (const m of jsSrc.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) definidas.add(m[1]);
const necesarias = ['renderMovil', 'mHoyHtml', 'mTableroHtml', 'mFichaHtml', 'mPosteosHtml', 'mMasHtml', 'mProblemaDe', 'decCard', 'postCard', 'planCard', 'regVisorFallback', 'cargarCliente', 'cargar', 'decidir'];
const noDef = necesarias.filter((f) => !definidas.has(f));
t('A7 las funciones de la capa móvil y sus dependencias están definidas', noDef.length === 0, noDef.join(','));
t('A8 sello de conserje.js bumpeado a ?v=10', htmlSrc.includes('<script src="/conserje.js?v=10"></script>') && !htmlSrc.includes('conserje.js?v=9'));
t('A9 «Aprobar todo» NO existe como control (la tanda es la puerta del dueño del negocio)',
  !/>\s*Aprobar todo/.test(jsSrc) && !/>\s*Aprobar todo/.test(htmlSrc) && !/data-act="aprobar/.test(jsSrc + htmlSrc) && !/bandeja\/tanda/.test(jsSrc));
t('A10 el escritorio queda intacto: sus media queries y su layout siguen', htmlSrc.includes('@media (max-width:1180px)') && htmlSrc.includes('grid-template-columns:292px minmax(0,1fr) 356px') && htmlSrc.includes('#movil{display:none}'));
t('A11 la capa gobierna solo ≤760px y la navegación trae las 4 secciones', htmlSrc.includes('@media (max-width:760px)') && ['hoy', 'negocios', 'posteos', 'mas'].every((x) => htmlSrc.includes('data-mtab="' + x + '"')));
t('A12 la capa consume la vista y las rutas vigentes (sin rutas nuevas)', jsSrc.includes("api('/api/admin/conserje/vista')") && jsSrc.includes('/api/admin/support/conserje/revision/decidir') && jsSrc.includes('/api/admin/support/conserje/pedidos-voz/resolver-idea'));

// ---------------------------------------------------------------------
seccion('C · contrato con la proyección real del servidor');
for (const campo of ['decisiones_pendientes', 'fecha_label', 'clientes', 'manana', 'ultimas', 'idea_hilo', 'pendientes']) {
  t('C· conserje-vista.js emite «' + campo + '»', vistaSrc.includes(campo));
}
t('C· la vista trae la fecha de mañana para las decisiones (manana.fecha)', /fecha, fecha_label: fechaLabel/.test(vistaSrc) || vistaSrc.includes('fecha, fecha_label'));

// ---------------------------------------------------------------------
seccion('B · ejercicio conductual (DOM mínimo, clics por la delegación real)');

class El {
  constructor(id) {
    this.id = id || ''; this._html = ''; this.textContent = ''; this.value = '';
    this.disabled = false; this.style = {}; this.children = [];
    this._cls = new Set(); this._listeners = {}; this._attrs = {};
    this.offsetWidth = 0; this.hidden = false;
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
  hoy: { fecha_label: 'domingo 23 de noviembre', publica_hoy: 3, proxima_hora: '19:00', pruebas_activas: 2, decisiones_pendientes: 5, suscriptores: 4, meta_marzo: 30, disco_mb: 3200 },
  manana: { fecha: '2026-11-24', fecha_label: 'lunes 24 de noviembre', resumen: { listos: 1, en_preparacion: 1, faltan: 1, total: 3 }, items: [
    { user_id: 7, business_name: 'Café Aroma', estado: 'listo', post: { id: 919, titulo: 'Tarta de limón', media_type: 'image', image_url: 'https://x/p919.jpg', poster_url: '', caption: 'Cap 919' }, necesita_atencion: false },
    { user_id: 9, business_name: 'Peluquería Luz', estado: 'en_preparacion', post: { id: 920, titulo: 'Corte + color', media_type: 'image', image_url: 'https://x/p920.jpg', poster_url: '', caption: 'Cap 920' }, necesita_atencion: false },
    { user_id: 8, business_name: 'Gym Sur', estado: 'falta', post: null, sin_posteo_decidido: false },
  ] },
  clientes: [
    { user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', clase: 'pago', clase_label: 'Cliente', categoria: 'Cafetería', dot: 'green', estado: 'Al día', racha: 3, pendientes: { total: 0 } },
    { user_id: 8, business_name: 'Gym Sur', ig_username: 'gymsur', clase: 'prueba_corriendo', clase_label: 'Prueba', categoria: 'Gimnasio', dot: 'yellow', estado: 'Pieza por decidir', racha: 0, prueba: { dias_restantes: 2 }, pendientes: { total: 2 } },
    { user_id: 9, business_name: 'Peluquería Luz', ig_username: 'peluluz', clase: 'pago', clase_label: 'Cliente', categoria: 'Peluquería', dot: 'green', estado: 'Al día', racha: 0, pendientes: { total: 0 } },
  ],
  mano: [
    { tipo: 'voz', clase: 'pedido', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'hace 5 min', message_id: 501, pedido: 'Quiero cambiar la foto del posteo', respuesta: 'Entendido: cambiar la foto.', posteo: { id: 900, status: 'scheduled', caption: 'Caption del 900', image_url: 'https://x/p900.jpg' } },
    { tipo: 'voz', es_idea: true, clase: 'pedido', user_id: 7, business_name: 'Café Aroma', ig_username: 'cafearoma', cuando: 'hace 9 min', message_id: 502, pedido: 'Una idea para el finde', idea_hilo: [{ rol: 'cliente', texto: 'Una idea para el finde' }, { rol: 'posty', texto: '¿La armamos con los precios nuevos?' }] },
    { tipo: 'pieza', clase: 'decision', user_id: 9, business_name: 'Peluquería Luz', ig_username: 'peluluz', cuando: 'anoche', fecha: '2026-11-24', post_id: 920, titulo: 'Corte + color', texto: 'Caption de la pieza', media_type: 'image', image_url: 'https://x/p920.jpg' },
    { tipo: 'post_fallido', clase: 'problema', user_id: 8, business_name: 'Gym Sur', ig_username: 'gymsur', cuando: 'hoy 19:01', post_id: 921, texto: 'Meta no pudo procesar el video' },
    { tipo: 'prueba_termina', clase: 'plata', user_id: 8, business_name: 'Gym Sur', ig_username: 'gymsur', cuando: 'hoy', texto: 'La prueba termina hoy.' },
  ],
  ultimas: [
    { action: 'tratamiento', business_name: 'Café Aroma', cuando: 'hace 1 h', detalle: 'Familia Cálido' },
    { action: 'voz_resuelta_mano', business_name: 'Gym Sur', cuando: 'hace 2 h', detalle: '' },
  ],
  cola: [],
  familias: [{ key: 'calido', nombre: 'Cálido' }],
};
const CLIENTE = {
  ok: true, user_id: 8, business_name: 'Gym Sur', ig_username: 'gymsur', categoria: 'Gimnasio', es_invitado: false, racha: 0,
  etapa: { clave: 'ok', etiqueta: 'En prueba' }, tratamiento: '',
  ficha: { vende: { estrella: 'Musculación', audiencia: 'Vecinos del barrio' }, estrategia: { linea: 'Constancia', fuente: 'ig' }, nota: { texto: '' } },
  plan_prueba_detalle: null,
  pendientes: { total: 2, voz: 0, chat: 0, revision: 1, casos: 1 },
  boost: null,
  semana: [
    { dia: 'lun', fecha: '17', key: '2026-11-17', estado: 'publicado' },
    { dia: 'mar', fecha: '18', key: '2026-11-18', estado: 'programado', hora: '19:00' },
    { dia: 'mié', fecha: '19', key: '2026-11-19', estado: 'borrador' },
    { dia: 'jue', fecha: '20', key: '2026-11-20', estado: 'falta', es_hoy: true },
    { dia: 'vie', fecha: '21', key: '2026-11-21', estado: 'publicado' },
    { dia: 'sáb', fecha: '22', key: '2026-11-22', estado: 'programado', hora: '19:00' },
    { dia: 'dom', fecha: '23', key: '2026-11-23', estado: 'publicado' },
  ],
  posteos: [
    { id: 921, status: 'failed', dia_key: '2026-11-21', titulo: 'El que no salió', caption: 'Cap 921', tipo: 'Video', media_type: 'video', image_url: '', poster_url: 'https://x/poster921.jpg', scheduled_at: '2026-11-21T19:00:00' },
    { id: 922, status: 'scheduled', dia_key: '2026-11-24', titulo: 'Rutina de lunes', caption: 'Cap 922', tipo: 'Foto', media_type: 'image', image_url: 'https://x/p922.jpg', poster_url: '', scheduled_at: '2026-11-24T19:00:00' },
  ],
};

function boot(opts) {
  opts = opts || {};
  const els = new Map();
  const getEl = (id) => { if (!els.has(id)) els.set(id, new El(id)); return els.get(id); };
  const fetchLog = [];
  const store = new Map(Object.entries(opts.storage || {}));
  const docListeners = {};
  const navBtns = ['hoy', 'negocios', 'posteos', 'mas'].map((x) => { const e = new El(''); e.setAttribute('data-mtab', x); return e; });
  const bodyEl = new El('body');
  const routes = (url) => {
    const u = url.split('&token=')[0].split('?token=')[0];
    if (u.indexOf('/api/admin/conserje/vista/cliente') === 0) return { status: 200, payload: CLIENTE };
    if (u.indexOf('/api/admin/conserje/vista') === 0) return { status: 200, payload: VISTA };
    if (u.indexOf('/api/admin/ai-costs') === 0) return { status: 200, payload: { ok: true, today_spend_usd: 1.5 } };
    if (u.indexOf('/api/admin/') === 0) return { status: 200, payload: { ok: true } };
    return { status: 404, payload: { ok: false, error: 'sin_ruta' } };
  };
  const sandbox = {
    URLSearchParams, console, setTimeout: () => 0, clearTimeout: () => {},
    location: { search: '', pathname: '/conserje' },
    navigator: {},
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    history: { replaceState() {} },
    document: {
      getElementById: getEl,
      createElement: () => new El(''),
      addEventListener: (t2, fn) => { (docListeners[t2] = docListeners[t2] || []).push(fn); },
      querySelectorAll: (sel) => (sel.includes('data-mtab') ? navBtns : []),
      body: bodyEl,
    },
    fetch: (url, init) => {
      init = init || {};
      fetchLog.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
      const r = routes(url, init);
      return Promise.resolve({ status: r.status || 200, json: () => Promise.resolve(r.payload) });
    },
    requestAnimationFrame: (fn) => fn(),
    confirm: () => true,
    prompt: () => 'texto de prueba',
  };
  sandbox.window = sandbox;
  sandbox.scrollTo = () => {};
  vm.createContext(sandbox);
  vm.runInContext(jsSrc, sandbox, { filename: 'conserje.js' });
  function clickAttrs(attrs) {
    const btn = new El('');
    for (const k of Object.keys(attrs)) btn.setAttribute(k, attrs[k]);
    const target = { closest: (sel) => { const m = /\[data-([a-z-]+)\]/.exec(sel); if (!m) return null; return btn.getAttribute('data-' + m[1]) !== null ? btn : null; } };
    (docListeners.click || []).forEach((fn) => fn({ target }));
    return btn;
  }
  return { els, getEl, fetchLog, clickAttrs, bodyEl, navBtns };
}
async function flush() { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); }
const TOK = { posta_admin_token: 'tok-test' };

(async () => {
  const b = boot({ storage: TOK });
  await flush();
  // --- Hoy ---
  const hoyHtml = b.getEl('mBody').innerHTML;
  t('B1 Hoy: una tarjeta por ítem de la mano (5)', (hoyHtml.match(/<article class="decision">/g) || []).length === 5, String((hoyHtml.match(/<article class="decision">/g) || []).length));
  t('B1 Hoy: el chip cuenta los que te necesitan', b.getEl('mChip').textContent === '5 te necesitan', b.getEl('mChip').textContent);
  t('B1 Hoy: el subtítulo trae el día de la vista', (b.getEl('mSub').textContent || '').includes('domingo 23 de noviembre'));
  t('B1 Hoy: la idea muestra su hilo entero en la tarjeta', hoyHtml.includes('d-hilo') && hoyHtml.includes('¿La armamos con los precios nuevos?'));
  t('B1 Hoy: el motivo del posteo fallido va abierto, como en el escritorio', hoyHtml.includes('<div class="d-error open">Meta no pudo procesar el video</div>'));
  // el compositor en la tarjeta (Responder → textarea en la misma tarjeta)
  b.clickAttrs({ 'data-act': 'voz-responder', 'data-mid': '501', 'data-uid': '7' });
  await flush();
  t('B2 Responder abre el compositor DENTRO de la tarjeta', b.getEl('vozReply-501').innerHTML.includes('id="vozText-501"') && b.getEl('vozReply-501').innerHTML.includes('data-act="voz-enviar"'));
  // --- Negocios: el tablero ---
  b.clickAttrs({ 'data-mtab': 'negocios' });
  await flush();
  const tabHtml = b.getEl('mBody').innerHTML;
  t('B3 Negocios: el resumen del tablero (3 negocios · 1 para vos · 1 problema)',
    tabHtml.includes('<div class="n">3</div>') && tabHtml.includes('<div class="n">1</div>') && tabHtml.includes('Para vos') && tabHtml.includes('Problema'));
  t('B3 Negocios: una fila por negocio de la cartera', (tabHtml.match(/data-mbiz="/g) || []).length === 3);
  t('B3 Negocios: el que tiene el problema sube primero, con su motivo y punto rojo',
    tabHtml.indexOf('data-mbiz="8"') >= 0 && tabHtml.indexOf('data-mbiz="8"') < tabHtml.indexOf('data-mbiz="7"')
    && tabHtml.includes('dot red') && tabHtml.includes('Meta no pudo procesar el video'));
  // --- Negocios: la ficha al tocar ---
  b.clickAttrs({ 'data-mbiz': '8' });
  await flush();
  const fichaHtml = b.getEl('mBody').innerHTML;
  t('B4 tocar un negocio pide su ficha a la ruta vigente', b.fetchLog.some((f) => f.url.indexOf('/api/admin/conserje/vista/cliente?user_id=8') === 0));
  t('B4 la ficha móvil pinta el negocio, su semana y sus posteos',
    fichaHtml.includes('Gym Sur') && fichaHtml.includes('Su semana') && fichaHtml.includes('Rutina de lunes') && fichaHtml.includes('El que no salió') && fichaHtml.includes('data-mback'));
  b.clickAttrs({ 'data-mback': '' });
  await flush();
  t('B4 volver deja el tablero de nuevo', b.getEl('mBody').innerHTML.includes('data-mbiz="7"'));
  // --- Posteos: la cola de revisión ---
  b.clickAttrs({ 'data-mtab': 'posteos' });
  await flush();
  const posHtml = b.getEl('mBody').innerHTML;
  t('B5 Posteos: una tarjeta por ítem de la producción de mañana (3)', (posHtml.match(/class="m-post"/g) || []).length === 3, String((posHtml.match(/class="m-post"/g) || []).length));
  t('B5 Posteos: la pieza por decidir trae Sale/Arreglar/No sale con la fecha de mañana',
    posHtml.includes('data-act="pieza-sale" data-uid="9" data-fecha="2026-11-24" data-pid="920"')
    && posHtml.includes('data-act="pieza-arreglar"') && posHtml.includes('data-act="pieza-nosale"'));
  t('B5 Posteos: al que le falta el posteo se le ofrece «Posty lo arma»', posHtml.includes('data-act="falta-pedir" data-uid="8" data-fecha="2026-11-24"'));
  t('B5 Posteos: la pieza lista no trae botones de decisión (ya está decidida)',
    !posHtml.includes('data-pid="919"'));
  b.clickAttrs({ 'data-act': 'pieza-sale', 'data-uid': '9', 'data-fecha': '2026-11-24', 'data-pid': '920' });
  await flush();
  const dec = b.fetchLog.filter((f) => f.url.indexOf('/api/admin/support/conserje/revision/decidir') >= 0);
  t('B5 Sale dispara revision/decidir con la decisión por pieza',
    dec.length === 1 && dec[0].method === 'POST' && dec[0].body && dec[0].body.decision === 'sale' && dec[0].body.post_id === 920 && dec[0].body.fecha_posteo === '2026-11-24' && dec[0].body.user_id === 9,
    JSON.stringify(dec));
  // --- Más ---
  b.clickAttrs({ 'data-mtab': 'mas' });
  await flush();
  const masHtml = b.getEl('mBody').innerHTML;
  t('B6 Más: accesos y últimas decisiones de la vista', masHtml.includes('Consola completa') && masHtml.includes('Últimas decisiones') && masHtml.includes('Familia Cálido'));
  b.clickAttrs({ 'data-mact': 'escritorio' });
  t('B6 «Consola completa» suma ver-escritorio al body', b.bodyEl.classList.contains('ver-escritorio'));
  b.getEl('volverBandeja').click();
  t('B6 el botón de volver saca ver-escritorio', !b.bodyEl.classList.contains('ver-escritorio'));
  // --- el drill-in desde una tarjeta de Hoy deja la capa en la ficha ---
  b.clickAttrs({ 'data-mtab': 'hoy' });
  await flush();
  b.clickAttrs({ 'data-goto': '8' });
  await flush();
  t('B7 el nombre en una tarjeta de Hoy abre LA ficha en la capa móvil', b.getEl('mBody').innerHTML.includes('Su semana') && b.getEl('mBody').innerHTML.includes('Gym Sur'));

  // -------------------------------------------------------------------
  seccion('D · Chromium real a 390px (boot del árbol)');
  const PORT = 18772;
  const BASE = 'http://127.0.0.1:' + PORT;
  const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-bandeja-'));
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'tok-bandeja', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  async function waitBoot(tries) {
    for (let i = 0; i < (tries || 60); i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  try {
    t('D0 el servidor levanta para el chequeo Chromium', await waitBoot(), log.slice(-200));
    const script = path.join(__dirname, 'check-bandeja-chromium.py');
    let salida = '';
    let fallo = null;
    try { salida = execFileSync('python3', [script, BASE], { encoding: 'utf8', timeout: 120000 }); }
    catch (e) { fallo = e; salida = (e.stdout || '').toString(); }
    const lineas = salida.split('\n').filter((l) => l.trim().startsWith('{'));
    t('D· el chequeo Chromium produjo resultados', lineas.length >= 8, salida.slice(-300));
    for (const l of lineas) {
      try { const r = JSON.parse(l); t('D ' + r.nombre, r.ok, r.extra); } catch (e) {}
    }
    if (fallo && !lineas.length) t('D· excepción en Chromium', false, String(fallo.message || fallo).slice(0, 200));
  } catch (e) {
    t('D· excepción en el boot', false, String(e && e.message || e));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 600));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})();
