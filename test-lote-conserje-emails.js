// test-lote-conserje-emails.js — LOTE CONSERJE-EMAILS (base v1123).
// El panel de números del Conserje suma la línea de emails del programa
// de representantes con SOLO DOS números (decisión de Valentino
// 2026-11-16): cuántos emails ya se mandaron este mes y cuál es la meta
// del mes. SIN abiertos (él los sacó: vienen inflados por Apple Mail, y
// este servidor no tiene webhook de eventos de Resend).
// Cubre, con public/chunk-conserje.js en vm (patrón de
// test-lote-conserje-flujo-unico.js; fixtures y harness espejados de esa
// suite, con el endpoint conserje/emails-mes sumado al stub):
//  A) la línea se pinta con los dos números del endpoint, en formato
//     es-AR, debajo de las mini-tarjetas y antes de la línea de salud,
//     sin mencionar abiertos y sin porcentajes;
//  B) la forma de hoy: 0 mandados con la meta configurada;
//  C) sin meta configurada: «—», ningún número inventado;
//  D) si el endpoint falla, la línea no se pinta y la home no se cae
//     (fail-soft, como el resto del panel);
//  E) la carga pide GET conserje/emails-mes y el estado lo guarda;
//  F) pins de fuente: la ruta admin existe con requireAdminToken, el
//     conteo sale de programa_email_envios, db.js crea la tabla, la
//     meta se lee de EMAILS_META_MES y el endpoint no habla de abiertos.
// Uso: node test-lote-conserje-emails.js [dirBase] — sale 0 si pasa.
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
const SERVER_SRC = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
const DB_SRC = fs.readFileSync(path.join(BASE, 'db.js'), 'utf8');
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
    emails: { ok: true, mes: '2026-11', mandados: 1240, meta: 6000, meta_fuente: 'config EMAILS_META_MES (tabla de rampa del programa de representantes)' }, emailsError: false,
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
      if (endpoint === 'conserje/emails-mes' && method === 'GET') {
        if (server.emailsError) throw new Error('emails-mes caído');
        return JSON.parse(JSON.stringify(server.emails));
      }
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

(async () => {
  // ---------- A) la línea con los dos números ----------
  {
    const t = makeCtx();
    await t.bind();
    const h = t.card.innerHTML;
    const iEmails = h.indexOf('EMAILS DEL MES');
    const iTotal = h.indexOf('TOTAL');
    const iSalud = h.indexOf('Quejas de spam 0,4% (límite 0,3%)');
    check('A1 la línea de emails se pinta en el panel', iEmails !== -1);
    check('A2 mandados del fixture: 1.240 (formato es-AR)', h.includes('1.240'));
    check('A3 la meta del fixture: «META DEL MES» 6.000', h.includes('META DEL MES') && h.includes('6.000'));
    check('A4 orden: debajo de las mini-tarjetas (TOTAL) y antes de la línea de salud', iTotal !== -1 && iEmails > iTotal && (iSalud === -1 || iEmails < iSalud));
    const seg = iEmails !== -1 ? h.slice(iEmails, iSalud === -1 ? undefined : iSalud) : '';
    check('A5 la línea NO menciona abiertos ni aperturas', !/abier|apertur/i.test(seg));
    check('A6 la línea no trae porcentajes', !seg.includes('%'));
  }
  // ---------- B) la forma de hoy: 0 mandados ----------
  {
    const t = makeCtx();
    t.server.emails = { ok: true, mes: '2026-11', mandados: 0, meta: 6000, meta_fuente: 'config EMAILS_META_MES (tabla de rampa del programa de representantes)' };
    await t.bind();
    const h = t.card.innerHTML;
    const iEmails = h.indexOf('EMAILS DEL MES');
    const seg = iEmails !== -1 ? h.slice(iEmails, iEmails + 700) : '';
    check('B1 con 0 mandados la línea se pinta igual', iEmails !== -1);
    check('B2 el mandado es 0 y la meta 6.000', />0</.test(seg) && seg.includes('6.000'), seg.slice(0, 220));
  }
  // ---------- C) sin meta configurada: «—» ----------
  {
    const t = makeCtx();
    t.server.emails = { ok: true, mes: '2026-11', mandados: 12, meta: null, meta_fuente: null };
    await t.bind();
    const h = t.card.innerHTML;
    const iEmails = h.indexOf('EMAILS DEL MES');
    const seg = iEmails !== -1 ? h.slice(iEmails, iEmails + 700) : '';
    check('C1 sin meta, la línea se pinta con los mandados (12)', iEmails !== -1 && seg.includes('>12<'));
    check('C2 la meta muestra «—»: ningún número inventado', seg.includes('—') && !seg.includes('6.000'));
  }
  // ---------- D) fail-soft ----------
  {
    const t = makeCtx();
    t.server.emailsError = true;
    await t.bind();
    const h = t.card.innerHTML;
    check('D1 si el endpoint de emails falla, la línea no se pinta', !h.includes('EMAILS DEL MES'));
    check('D2 y la home no se cae: panel y foco pintan igual', h.includes('EMBUDO DE HOY') && h.includes('COLA · MODO FOCO'));
    check('D3 el estado guarda emails en null', t.estado().emails === null);
  }
  // ---------- E) la carga pide el endpoint ----------
  {
    const t = makeCtx();
    await t.bind();
    const llamada = t.server.calls.find((c) => c.endpoint === 'conserje/emails-mes');
    check('E1 conserjeCargar pide GET conserje/emails-mes', !!llamada && llamada.method === 'GET', JSON.stringify(t.server.calls.map((c) => c.endpoint)));
    const em = t.estado().emails || {};
    check('E2 el estado guarda mandados y meta del endpoint', em.mandados === 1240 && em.meta === 6000);
  }
  // ---------- F) pins de fuente ----------
  {
    check('F1 server.js registra GET /api/admin/conserje/emails-mes con requireAdminToken', SERVER_SRC.includes("app.get('/api/admin/conserje/emails-mes', requireAdminToken"));
    check('F2 el conteo sale de programa_email_envios', SERVER_SRC.includes('FROM programa_email_envios'));
    check('F3 db.js crea la tabla programa_email_envios', DB_SRC.includes('CREATE TABLE IF NOT EXISTS programa_email_envios'));
    check('F4 la meta se lee de la config EMAILS_META_MES', SERVER_SRC.includes('process.env.EMAILS_META_MES'));
    const iRuta = SERVER_SRC.indexOf("app.get('/api/admin/conserje/emails-mes'");
    const segSrv = iRuta !== -1 ? SERVER_SRC.slice(iRuta, iRuta + 2600) : '';
    check('F5 el endpoint no menciona abiertos ni aperturas', iRuta !== -1 && !/abiert|apertur|opened/i.test(segSrv));
    check('F6 el chunk pide el endpoint por adminApi', SRC.includes("adminApi('conserje/emails-mes', 'GET')"));
  }
  console.log(`\n${pass} ok · ${fail} mal`);
  process.exit(fail ? 1 : 0);
})();
