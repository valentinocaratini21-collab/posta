// test-lote-conserje-flujo-unico.js — LOTE CONSERJE-FLUJO-UNICO (base v1119).
// La home del Conserje pasa a ser UNA sola columna (diseño cerrado por
// Valentino: vivo-1-flujo + embudo-final-v3 + opcion-2-foco):
//   1 · panel de números (embudo real de /api/admin/funnel?era=all),
//   2 · EN VIVO AHORA (solo con una corrida en curso; sin corrida la
//       sección no existe),
//   3 · la cola en MODO FOCO (un posteo por vez, caption una sola vez,
//       «1 de 4», avance automático al decidir, saltear por la tira).
// Cubre, con public/chunk-conserje.js en vm (patrón de
// test-lote-conserje-diseno.js):
//  A) composición: las tres secciones en orden + chip EN CURSO;
//  B) números: valores del fixture en los trapecios, chips de tasa
//     PELADOS («3,5%» y «18%», sin subtítulo), PAGOS en amarillo,
//     mini-tarjetas del goal, línea de salud solo con alerta real;
//  C) en vivo: pasos derivados de la semana real del invitado;
//  D) sin corrida no hay sección en vivo (ni estado vacío);
//  E) la duda abierta del freno se muestra como única pregunta;
//  F) foco inicial: atención primero, «1 de 4», caption UNA sola vez;
//  G) decidir avanza solo al siguiente, sin abrir el detalle;
//  H) saltear cambia el foco sin decidir;
//  I) todo decidido cierra la noche;
//  J) «No sale» desde el foco mueve al cliente a sin-posteo decidido;
//  K) auditoría: toda función conserje* llamada existe y toda acción
//     data-cj de las tarjetas nuevas tiene su rama en el handler;
//  L) el detalle (ficha, caption) sigue intacto.
// Uso: node test-lote-conserje-flujo-unico.js [dirBase] — sale 0 si pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const SRC = fs.readFileSync(path.join(BASE, 'public', 'chunk-conserje.js'), 'utf8');
const LABEL = { sale: 'Sale así', arreglar: 'A arreglar', no_sale: 'No sale', pedir: 'Posty lo arma' };

// ---------- fixtures (formas reales de los payloads) ----------
function ficha(uid, name, o) {
  return Object.assign({
    ok: true, user_id: uid, business_name: name,
    vende: { estrella: 'Café de especialidad', rubro: 'Cafetería', productos: ['Café en grano'], diferencial: '', objetivo: '' },
    gusta: { tono: 'Cercano', gustos: [], pidio_cambiar: [] },
    etapa: { color: 'amarillo', etiqueta: 'En prueba' },
    lineas_rojas: [], paleta: [{ hex: '#7A4A21' }],
    plan: { plan: 'Posty', plan_status: 'trial', desde: '2026-11-10' },
    estrategia: { linea: '' }, proximo_paso: { texto: '' }, historial: [], nota: { texto: '' }, faltantes: [],
  }, o || {});
}
function item(uid, name, o) {
  return Object.assign({
    user_id: uid, business_name: name, ig_username: '', origen: 'programado',
    necesita_atencion: false, motivo_atencion: '', decision: null, siguiente: null,
    post: { id: 9000 + uid, titulo: 'Título ' + uid, caption: 'CAP-' + uid, image_url: '/media/x-' + uid + '.jpg', tiene_foto: true, media_type: 'image', tipo: 'image', scheduled_at: '2026-11-17 19:00:00', status: 'scheduled', approval: 'pending', cuando: 'Mañana · 19:00' },
    ficha: ficha(uid, name),
  }, o || {});
}
function fixtureRevision() {
  const aroma = item(201, 'Café Aroma', { necesita_atencion: true, motivo_atencion: 'Dice «Shop now» en vez del producto' });
  aroma.post = Object.assign(aroma.post, { id: 9001, titulo: 'El croissant de los sábados volvió', caption: 'CAP-AROMA primera línea\nsegunda línea del caption.', image_url: '/media/aroma-9001.jpg', cuando: 'Hoy · 19:00' });
  const byredo = item(202, 'BYREDO');
  byredo.post = Object.assign(byredo.post, { id: 9002, titulo: 'Something new at BYREDO', caption: 'CAP-BYREDO único.', image_url: '/media/byredo-9002.jpg', cuando: 'Mañana · hora por confirmar' });
  const portrait = item(203, 'Portrait Coffee');
  portrait.post = Object.assign(portrait.post, { id: 9003, caption: 'CAP-PORTRAIT' });
  const ladyee = item(204, 'Ladyee Boutique');
  ladyee.post = Object.assign(ladyee.post, { id: 9004, titulo: 'Vestido nuevo', caption: 'CAP-LADYEE', image_url: '/media/ladyee-9004.jpg' });
  const cafe = { user_id: 205, business_name: 'Café Sin Posteo', ig_username: '', origen: 'sin_posteo', necesita_atencion: false, motivo_atencion: '', decision: null, post: null, siguiente: null, ficha: ficha(205, 'Café Sin Posteo') };
  // El orden del payload NO es el de la cola: la atención va primero.
  return { ok: true, fecha: '2026-11-17', ventana: { estado: 'abierta', ahora: '19:42' }, items: [byredo, aroma, portrait, ladyee], sin_posteo: [cafe] };
}
function fixtureFunnel() {
  const st = (key, label, users, pct_first) => ({ key, label, users, pct_prev: pct_first, pct_first });
  return {
    ok: true, days: 30, era: { key: 'all' },
    funnel: [
      st('prueba_view', 'Visitaron la prueba', 1429, 100),
      st('prueba_complete', 'Completaron el formulario', 400, 28),
      st('prueba_register', 'Crearon cuenta', 50, 3.5),
      st('ig_connect', 'Conectaron Instagram', 30, 2.1),
      st('week_generate_done', 'Semana generada', 25, 1.7),
      st('post_publish', 'Publicaron algo', 20, 1.4),
      st('payment_ok', 'Pagaron', 9, 0.6),
    ],
    totals: {}, by_day: [],
    goal: { target: 200, subscribers: 214, mrr: 17313, trial_to_paid: 18, new_30d: 87 },
    trends: {}, ttv: { n: 0 },
  };
}
function utcStr(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
function fixtureCasosMano() {
  return [{ id: 31, user_id: 301, tipo: 'prueba_linea_mano', titulo: 'Prueba a mano: entrada nueva de @rosehipfloral — producir el día 1', detalle: '@rosehipfloral · flores/florería', siguiente_paso: 'Producir SOLO la pieza del día 1', estado: 'abierto', created_at: utcStr(Date.now() - 12 * 60000), business_name: 'Rosehip Social Florist', ig_username: 'rosehipfloral', email: 'guest-x@guest.invalid' }];
}
function fixtureWeek() {
  return {
    ok: true, ig: 'rosehipfloral', business: 'Rosehip Social Florist', category: 'flores', subcat: 'floreria', lang: 'en', linea_mano: true,
    rubro_check: { needed: false, options: [] },
    digest: {
      category: 'flores', subcat: 'floreria', built_at: '2026-11-16T07:16:25.355Z',
      onboarding: { producto_estrella: 'Bouquets' }, inferred_star: { item: 'Planner', confidence: 0.76 },
      question_candidates: [], rubro_id: { rubro: 'flores', segura: true, needs_question: false },
      fuentes: { feed: { handle: 'rosehipfloral', posts: 6 }, form: { description: 'Bouquets' } },
    },
    posts: [
      { type: 'image', armando: false, caption: 'the season, gathered.\ncoral dahlias, garden roses', hashtags: '#brooklynflorist', headline: 'Bouquets', image: '/media/rosehip-1.jpg', mano: { cargada_at: 1794814000000, dia: 1 } },
      { type: 'image', armando: true, caption: '', headline: 'Proceso' },
      { type: 'image', armando: true, caption: '', headline: 'Momento' },
      { type: 'image', armando: true, caption: '', headline: 'Día 4' },
      { type: 'image', armando: true, caption: '', headline: 'Día 5' },
    ],
  };
}

// ---------- contexto vm con stubs ----------
function makeCtx() {
  const server = {
    datos: fixtureRevision(), funnel: fixtureFunnel(), funnelError: false,
    alerts: [{ key: 'spam:2026-11', sev: 'high', title: 'Quejas de spam 0,4% (límite 0,3%)' }],
    casosMano: fixtureCasosMano(), casosTrabada: [],
    week: fixtureWeek(), genStatus: { ok: true, ig: 'rosehipfloral', cached: true, generating: false, rescuing: false, arming: 4 },
    calls: [],
  };
  const card = { innerHTML: '', __cjBound: false, style: {}, prepended: [],
    addEventListener(type, fn) { this.__handlers = this.__handlers || {}; this.__handlers[type] = fn; },
    prepend(node) { this.prepended.push(node); } };
  const els = {
    '#cjArreglo': { style: { display: 'none' }, dataset: {} },
    '#cjArregloNota': { value: '' },
    '#cjNota': { value: '' }, '#cjNotaMsg': { textContent: '' },
    '#cjChat': { innerHTML: '', style: { display: '' }, dataset: {} },
    '#cjToken': { value: '' }, '#cjTokenBtn': { onclick: null },
  };
  const scrolls = [];
  const sandbox = {
    console, setTimeout, clearTimeout,
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    pzIc() { return ''; },
    $: (sel) => (sel === '#conserjeCard' ? card : (els[sel] || null)),
    loadChunk: async () => true,
    adminToken: () => 'tok',
    api: {
      get: async (url) => {
        server.calls.push({ endpoint: url, method: 'GET-API' });
        if (url.indexOf('/api/trial/week?ig=rosehipfloral') === 0) return JSON.parse(JSON.stringify(server.week));
        if (url.indexOf('/api/trial/gen-status?ig=rosehipfloral') === 0) return JSON.parse(JSON.stringify(server.genStatus));
        throw new Error('api no stubbeada: ' + url);
      },
    },
    adminApi: async (endpoint, method, body) => {
      server.calls.push({ endpoint, method, body });
      if (endpoint === 'support/conserje/revision' && method === 'GET') {
        const conPosteo = server.datos.items.filter((i) => i.post);
        server.datos.resumen = { total: conPosteo.length, decididos: conPosteo.filter((i) => i.decision).length, pendientes: conPosteo.filter((i) => !i.decision).length, necesitan_atencion: conPosteo.filter((i) => i.necesita_atencion).length, sin_posteo: server.datos.sin_posteo.length, todo_decidido: conPosteo.length > 0 && conPosteo.every((i) => i.decision) };
        return JSON.parse(JSON.stringify(server.datos));
      }
      if (endpoint === 'support/conserje/revision/decidir' && method === 'POST') {
        let it = server.datos.items.find((x) => x.user_id === body.user_id) || server.datos.sin_posteo.find((x) => x.user_id === body.user_id);
        if (it) {
          it.decision = { decision: body.decision, etiqueta: LABEL[body.decision], nota: body.nota || '' };
          if (body.decision === 'no_sale' && it.post) {
            it.post = null;
            server.datos.items = server.datos.items.filter((x) => x.user_id !== body.user_id);
            if (!server.datos.sin_posteo.includes(it)) server.datos.sin_posteo.push(it);
          }
        }
        return { ok: true, decision: body.decision };
      }
      if (endpoint === 'support/conserje/revision/armar' && method === 'POST') {
        const it = server.datos.sin_posteo.find((x) => x.user_id === body.user_id);
        if (it) it.decision = { decision: 'pedir', etiqueta: 'Posty lo arma', nota: '' };
        return { ok: true, decision: 'pedir' };
      }
      if (endpoint === 'funnel?era=all' && method === 'GET') {
        if (server.funnelError) throw new Error('funnel caído');
        return JSON.parse(JSON.stringify(server.funnel));
      }
      if (endpoint === 'alerts' && method === 'GET') return { ok: true, alerts: JSON.parse(JSON.stringify(server.alerts)) };
      if (endpoint.indexOf('support/cases?tipo=prueba_linea_mano') === 0) return { ok: true, casos: JSON.parse(JSON.stringify(server.casosMano)) };
      if (endpoint.indexOf('support/cases?tipo=prueba_trabada') === 0) return { ok: true, casos: JSON.parse(JSON.stringify(server.casosTrabada)) };
      throw new Error('endpoint no stubbeado: ' + endpoint);
    },
    window: { scrollTo(x, y) { scrolls.push([x, y]); } },
    document: {
      createElement: () => ({ className: '', style: {}, textContent: '' }),
      querySelectorAll: () => [], querySelector: () => null, getElementById: () => null,
      addEventListener: () => {}, removeEventListener: () => {},
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'chunk-conserje.js' });
  return {
    ctx: sandbox, card, els, server, scrolls,
    html(expr) { return vm.runInContext(expr, sandbox); },
    async bind() { await vm.runInContext('bindConserje()', sandbox); },
    estado() { return vm.runInContext('conserjeEstado', sandbox); },
    async click(attrs, text) {
      const btn = { _attrs: attrs, textContent: text || '', disabled: false,
        getAttribute(k) { return this._attrs[k] !== undefined ? String(this._attrs[k]) : null; },
        closest(sel) { return sel === '[data-cj]' ? this : null; } };
      const h = card.__handlers && card.__handlers.click;
      if (!h) throw new Error('sin handler click');
      await h({ target: btn });
      return btn;
    },
  };
}
function count(hay, needle) { return hay.split(needle).length - 1; }

(async () => {
  // ---------- A) composición: tres secciones en orden ----------
  {
    const t = makeCtx();
    await t.bind();
    const h = t.card.innerHTML;
    const iNum = h.indexOf('EMBUDO DE HOY');
    const iVivo = h.indexOf('EN VIVO AHORA');
    const iFoco = h.indexOf('COLA · MODO FOCO');
    check('A1 el panel de números está y va primero', iNum !== -1 && (iVivo === -1 || iNum < iVivo) && iNum < iFoco);
    check('A2 EN VIVO va entre números y la cola', iVivo !== -1 && iVivo < iFoco);
    check('A3 chip «1 EN CURSO» en el encabezado', h.includes('1 EN CURSO'));
    check('A4 la consola se presenta («Tu consola · solo vos ves esto»)', h.includes('Tu consola · solo vos ves esto'));
    check('A5 las secciones del equipo siguen debajo (pedidos por voz)', h.indexOf('Pedidos por voz') > iFoco);
  }
  // ---------- B) números del fixture, chips pelados ----------
  {
    const t = makeCtx();
    await t.bind();
    const h = t.card.innerHTML;
    check('B1 trapecio 1 pinta 1.429 (visitaron)', h.includes('1.429'));
    check('B2 trapecio 4 pinta 9 (pagos)', />9</.test(h));
    const iPagos = h.indexOf('PAGOS');
    check('B3 el escalón PAGOS es amarillo #FEC14D', iPagos !== -1 && h.slice(Math.max(0, iPagos - 500), iPagos).includes('#FEC14D'));
    const chips = Array.from(h.matchAll(/class="cj-tasa"[^>]*>([^<]*)</g)).map((m) => m[1]);
    check('B4 hay dos chips de tasa', chips.length === 2, JSON.stringify(chips));
    check('B5 los chips van PELADOS: «3,5%» y «18%», sin subtítulo', chips[0] === '3,5%' && chips[1] === '18%', JSON.stringify(chips));
    check('B6 mini-tarjetas del goal: MES 87 · $17.313 · TOTAL 214', h.includes('MES') && h.includes('>87<') && h.includes('$17.313') && h.includes('TOTAL') && h.includes('>214<'));
    check('B7 línea de salud con la alerta real del fixture', h.includes('Quejas de spam 0,4% (límite 0,3%)'));
    const t2 = makeCtx();
    t2.server.alerts = [];
    await t2.bind();
    check('B8 sin alertas NO hay línea de salud', !t2.card.innerHTML.includes('Quejas de spam') && !t2.card.innerHTML.includes('FDECEC'));
    const t3 = makeCtx();
    t3.server.funnelError = true;
    await t3.bind();
    check('B9 si el funnel falla, el panel no se pinta pero la home sí', !t3.card.innerHTML.includes('EMBUDO DE HOY') && t3.card.innerHTML.includes('COLA · MODO FOCO'));
  }
  // ---------- C) en vivo: pasos de la semana real ----------
  {
    const t = makeCtx();
    await t.bind();
    const h = t.card.innerHTML;
    check('C1 la corrida es Rosehip Social Florist', h.includes('Rosehip Social Florist'));
    check('C2 paso «Leyó el Instagram y la web» confirmado en las dos fuentes', h.includes('Leyó el Instagram y la web') && h.includes('confirmado en las dos fuentes'));
    check('C3 «Fundamento armado» con su estrella', h.includes('Fundamento armado') && h.includes('Estrella: Bouquets'));
    check('C4 «Posteo 1 de 3 · listo» con su mini-tarjeta', h.includes('Posteo 1 de 3 · listo') && h.includes('IMAGEN · DÍA 1') && h.includes('«the season, gathered.»'));
    check('C5 «Posteo 2 de 3 · generando ahora»', h.includes('Posteo 2 de 3 · generando ahora'));
    check('C7 el tiempo en curso sale del caso (≈12 min)', h.includes('>12 min<') || h.includes('>13 min<'));
    // Una semana que todavía tiene 2 piezas: la tercera está en espera.
    const t2 = makeCtx();
    t2.server.week.posts = t2.server.week.posts.slice(0, 2);
    t2.server.genStatus = { ok: true, ig: 'rosehipfloral', cached: true, generating: false, rescuing: false, arming: 1 };
    await t2.bind();
    check('C6 sin tercera pieza todavía: «Posteo 3 de 3 · en espera»', t2.card.innerHTML.includes('Posteo 3 de 3 · en espera'));
  }
  // ---------- D) sin corrida, la sección no existe ----------
  {
    const t = makeCtx();
    t.server.casosMano = [];
    await t.bind();
    check('D1 sin casos no hay EN VIVO AHORA', !t.card.innerHTML.includes('EN VIVO AHORA'));
    check('D2 sin corridas no hay chip EN CURSO', !t.card.innerHTML.includes('EN CURSO'));
    check('D3 la cola sube: el foco sigue a los números', t.card.innerHTML.indexOf('COLA · MODO FOCO') > t.card.innerHTML.indexOf('EMBUDO DE HOY'));
  }
  // ---------- E) la duda abierta es la única pregunta visible ----------
  {
    const t = makeCtx();
    t.server.week.rubro_check = { needed: true, options: [] };
    t.server.week.digest.question_candidates = [{ tipo: 'estrella', item: 'Planner', debil: true, texto: 'tu producto estrella es Planner?' }];
    await t.bind();
    check('E1 la duda abierta se muestra en la corrida', t.card.innerHTML.includes('La duda que frena esta corrida') && t.card.innerHTML.includes('tu producto estrella es Planner?'));
  }
  // ---------- F) foco inicial ----------
  {
    const t = makeCtx();
    await t.bind();
    const h = t.card.innerHTML;
    check('F1 progreso «1 de 4» con «Te quedan 3»', h.includes('1 de 4') && h.includes('Te quedan 3'));
    check('F2 el foco abre por la ATENCIÓN (Café Aroma), no por el orden del payload', h.includes('El croissant de los sábados volvió') && h.includes('/media/aroma-9001.jpg'));
    check('F3 el motivo de atención se lee en la tarjeta', h.includes('Dice «Shop now» en vez del producto'));
    check('F4 el caption del foco aparece UNA sola vez en toda la home', count(h, 'CAP-AROMA primera línea') === 1);
    check('F5 las dos decisiones grandes están (Sale así / No sale)', h.includes('✓ Sale así') && h.includes('✕ No sale'));
    check('F6 secundarios: Editar y Ver en el feed', h.includes('✎ Editar') && h.includes('Ver en el feed'));
    check('F7 la tira SIGUE muestra al próximo (BYREDO) con Saltear', h.includes('SIGUE') && h.includes('BYREDO') && h.includes('Saltear'));
    check('F9 el sin-posteo sigue accesible abajo', h.includes('Sin posteo para mañana') && h.includes('Café Sin Posteo'));
    // Con un posteo ya decidido de antes, el progreso cuenta la noche
    // entera (como el «N de M revisados» histórico) y el decidido se
    // lista compacto debajo del foco.
    const t2 = makeCtx();
    const p = t2.server.datos.items.find((i) => i.user_id === 203);
    p.decision = { decision: 'sale', etiqueta: 'Sale así', nota: '', decided_at: '2026-11-16 19:30', post_id: 9003 };
    await t2.bind();
    check('F8 los decididos se listan compactos (Portrait Coffee) y el progreso arranca en «2 de 4»', t2.card.innerHTML.includes('Ya decididos') && t2.card.innerHTML.includes('Portrait Coffee') && t2.card.innerHTML.includes('2 de 4'));
  }
  // ---------- G) decidir avanza solo ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'sale', 'data-user': '201', 'data-post': '9001', 'data-fecha': '2026-11-17' });
    const h = t.card.innerHTML;
    check('G1 tras «Sale así» el foco es BYREDO', h.includes('Something new at BYREDO'));
    check('G2 el progreso avanzó a «2 de 4»', h.includes('2 de 4'));
    check('G3 sigue en la home (vistaId null, sin detalle)', t.estado().vistaId === null);
    check('G4 Café Aroma quedó en Ya decididos', h.includes('Ya decididos') && h.includes('Café Aroma'));
  }
  // ---------- H) saltear sin decidir ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'foco-saltear', 'data-user': '202' });
    let h = t.card.innerHTML;
    check('H1 saltear pone el foco en BYREDO', h.includes('Something new at BYREDO'));
    check('H2 el progreso no se movió («1 de 4») y nadie quedó decidido', h.includes('1 de 4') && !h.includes('Ya decididos'));
    // Salteando hasta el final, la tira SIGUE envuelve y vuelve a Aroma:
    // el salteado sigue pendiente, no decidido.
    await t.click({ 'data-cj': 'foco-saltear', 'data-user': '203' });
    await t.click({ 'data-cj': 'foco-saltear', 'data-user': '204' });
    h = t.card.innerHTML;
    check('H3 la tira SIGUE envuelve al primero pendiente (Café Aroma)', h.includes('SIGUE') && h.includes('Café Aroma'));
  }
  // ---------- I) todo decidido ----------
  {
    const t = makeCtx();
    t.server.datos.items.forEach((i) => { if (!i.decision) i.decision = { decision: 'sale', etiqueta: 'Sale así', nota: '' }; });
    await t.bind();
    check('I1 con todo decidido: «la noche está cerrada»', t.card.innerHTML.includes('Todo decidido — la noche está cerrada'));
  }
  // ---------- J) «No sale» desde el foco ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'no_sale', 'data-user': '201', 'data-post': '9001', 'data-fecha': '2026-11-17' });
    const h = t.card.innerHTML;
    check('J1 tras «No sale» el foco avanza a BYREDO', h.includes('Something new at BYREDO'));
    check('J2 Café Aroma aparece en sin-posteo con su decisión «No sale»', h.includes('Sin posteo para mañana') && h.includes('Café Aroma') && h.includes('No sale'));
  }
  // ---------- K) auditoría de funciones y acciones ----------
  {
    const defined = new Set(Array.from(SRC.matchAll(/function (conserje\w+)/g)).map((m) => m[1]));
    const called = new Set(Array.from(SRC.matchAll(/(conserje\w+)\s*\(/g)).map((m) => m[1]));
    const missing = Array.from(called).filter((f) => !defined.has(f));
    check('K1 toda función conserje* llamada está definida en el chunk', missing.length === 0, missing.join(','));
    const branches = new Set(Array.from(SRC.matchAll(/acc === '([\w-]+)'/g)).map((m) => m[1]));
    const needed = ['decidir', 'arreglar', 'feed', 'foco-saltear', 'ver', 'volver'];
    check('K2 toda acción data-cj de la home nueva tiene rama en el handler', needed.every((a) => branches.has(a)), Array.from(branches).join(','));
  }
  // ---------- L) el detalle sigue intacto ----------
  {
    const t = makeCtx();
    const d = fixtureRevision();
    const aroma = d.items.find((i) => i.user_id === 201);
    const html = t.html('conserjeDetalleHTML(' + JSON.stringify(aroma) + ',' + JSON.stringify(d) + ')');
    check('L1 el detalle muestra el caption completo', html.includes('CAP-AROMA primera línea') && html.includes('segunda línea del caption.'));
    check('L2 el detalle muestra la ficha', html.includes('Ficha de Café Aroma'));
  }

  console.log(`\n${pass} ok · ${fail} mal`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('suite explotó:', e); process.exit(2); });
