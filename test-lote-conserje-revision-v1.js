// test-lote-conserje-revision-v1.js — LOTE v887 CONSERJE-REVISIÓN VARIANTE 1
// (10/11, mock aprobado por Valentino «vamos con la 1» + «armalo asi»,
// variante 1: foto completa 96px izquierda, caption derecha, abajo
// [✓ Sale así verde] [✎ Editar] a la par; «No sale» queda como link).
// En el detalle, el bloque del posteo pasa a ser UNA FILA (mini 96×96
// contain + caption a la derecha, 3 líneas + «Ver más» que expande
// entero en el mismo lugar) y los botones de decisión son dos a la par:
// «Sale así» VERDE #14743F + «Editar» (reusa el flujo arreglar).
// La lista (foto 180px cover) NO se toca. CHUNK_V sube a v887 en app.js:
// loadChunk sirve /chunk-conserje.js?v=CHUNK_V — sin el bump, el chunk
// nuevo no llega a nadie (precedente v849).
// Cubre, con public/chunk-conserje.js en vm (mismo patrón que
// test-lote-conserje-diseno.js): A) mini 96 contain en el detalle y foto
// grande recortada fuera; B) caption completo alcanzable (Ver más);
// C) botones nuevos con los data-cj correctos y el binding vivo;
// D) «No sale» como link, sin perder la decisión; E) lista intacta;
// F) CHUNK_V v887; G) auditoría data-cj (M2) + funciones (M1).
// Uso: node test-lote-conserje-revision-v1.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const SRC = fs.readFileSync(path.join(__dirname, 'public', 'chunk-conserje.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const cnt = (s, sub) => s.split(sub).length - 1;

// ---------- datos de ejemplo (forma de colaRevision) ----------
function ficha(uid, name) {
  return {
    ok: true, user_id: uid, business_name: name,
    vende: { estrella: 'Café de especialidad', rubro: 'Cafetería', productos: [], diferencial: '', objetivo: '' },
    gusta: { tono: 'Cercano', gustos: [], pidio_cambiar: [] },
    etapa: { color: 'verde', etiqueta: 'En ritmo' },
    lineas_rojas: [], paleta: [], plan: { plan: 'Posty', plan_status: 'active', desde: '2026-10-05' },
    estrategia: { linea: '' }, proximo_paso: { texto: '' }, historial: [],
    nota: { texto: '' }, faltantes: [],
  };
}
const CAPTION_LARGO = '¿Cuántas veces te preguntaste cómo se hacen nuestras medialunas?\n\nLas preparamos con amor y dedicación, usando la mejor mantequilla y una receta que se transmite de generación en generación.\n\nPasá por el local en Palermo y probalas calentitas.';
function fixtureDatos() {
  const ladyee = {
    user_id: 89, business_name: 'Ladyee Boutique', ig_username: 'ladyee.boutique', origen: 'programado',
    necesita_atencion: true, motivo_atencion: 'Dice «Shop now» en vez del producto', decision: null,
    post: { id: 581, titulo: 'Nueva colección: el vestido que pedían', caption: 'Llegó la nueva colección de vestidos.\nProbátelos este finde, te esperamos.', image_url: '/media/ladyee-581.jpg', tiene_foto: true, media_type: 'image', tipo: 'image', scheduled_at: '2026-11-08 17:00:00', status: 'scheduled', approval: 'pending', cuando: 'dom 8/11 · 17:00' },
    siguiente: null, ficha: ficha(89, 'Ladyee Boutique'),
  };
  const cafe = {
    user_id: 84, business_name: 'Café Aroma', ig_username: 'cafearoma.palermo', origen: 'programado',
    necesita_atencion: false, motivo_atencion: '', decision: null,
    post: { id: 463, titulo: 'Medialunas como en casa', caption: CAPTION_LARGO, image_url: '/media/1792915743269-5a3d77c87579.jpg', tiene_foto: true, media_type: 'image', tipo: 'image', scheduled_at: '2026-11-09 19:00:00', status: 'scheduled', approval: 'pending', cuando: 'lun 9/11 · 19:00' },
    siguiente: null, ficha: ficha(84, 'Café Aroma'),
  };
  return {
    ok: true, fecha: '2026-11-09', ventana: { estado: 'abierta', ahora: '19:42' },
    resumen: { total: 2, decididos: 0, pendientes: 2, necesitan_atencion: 1, atencion_sin_decidir: 1, sin_posteo: 0, todo_decidido: false },
    items: [ladyee, cafe], sin_posteo: [],
  };
}

// ---------- contexto vm con stubs ----------
function makeCtx() {
  const server = { datos: fixtureDatos(), calls: [] };
  const card = { innerHTML: '', __cjBound: false, style: {}, prepended: [],
    addEventListener(type, fn) { this.__handlers = this.__handlers || {}; this.__handlers[type] = fn; },
    prepend(node) { this.prepended.push(node); },
  };
  const els = {
    '#cjArreglo': { style: { display: 'none' }, dataset: {} },
    '#cjArregloNota': { value: '' },
    '#cjNota': { value: '' },
    '#cjNotaMsg': { textContent: '' },
    '#cjChat': { innerHTML: '', style: { display: '' }, dataset: {} },
    '#cjToken': { value: '' },
    '#cjTokenBtn': { onclick: null },
  };
  // Elemento falso del caption para el toggle «Ver más» / «Ver menos».
  const capTxt = {
    _cls: new Set(),
    classList: {
      toggle(c) { if (capTxt._cls.has(c)) { capTxt._cls.delete(c); return false; } capTxt._cls.add(c); return true; },
      contains(c) { return capTxt._cls.has(c); },
    },
    scrollHeight: 200, clientHeight: 67, style: {},
  };
  const capMas = { style: { display: '' } };
  const sandbox = {
    console, setTimeout, clearTimeout,
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    pzIc() { return ''; },
    $: (sel) => (sel === '#conserjeCard' ? card : (els[sel] || null)),
    loadChunk: async () => true,
    adminToken: () => 'tok',
    adminApi: async (endpoint, method, body) => {
      server.calls.push({ endpoint, method, body });
      if (endpoint === 'support/conserje/revision' && method === 'GET') return JSON.parse(JSON.stringify(server.datos));
      if (endpoint === 'support/conserje/revision/decidir' && method === 'POST') {
        const it = server.datos.items.find((x) => x.user_id === body.user_id);
        if (it) {
          it.decision = { decision: body.decision, etiqueta: body.decision, nota: body.nota || '' };
          if (body.decision === 'no_sale') { it.post = null; server.datos.items = server.datos.items.filter((x) => x.user_id !== body.user_id); server.datos.sin_posteo.push(it); }
        }
        return { ok: true, decision: body.decision };
      }
      if (endpoint === 'support/conserje/revision/armar' && method === 'POST') return { ok: true, decision: 'pedir' };
      if (endpoint === 'support/conserje/nota' && method === 'POST') return { ok: true, nota: body.nota };
      if (/^support\/\d+\/journey$/.test(endpoint)) return { ok: true, chat: [], fotos_recientes: [] };
      throw new Error('endpoint no stubbeado: ' + endpoint);
    },
    window: { scrollTo() {} },
    document: {
      createElement: () => ({ className: '', style: {}, textContent: '' }),
      querySelector: (sel) => (sel === '.cj-cap-txt' ? capTxt : (sel === '[data-cj="cap-mas"]' ? capMas : null)),
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'chunk-conserje.js' });
  return {
    ctx: sandbox, card, els, server, capTxt, capMas,
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
  // ---------- A) mini 96 contain en el detalle; foto grande fuera ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const html = t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[1]) + ',' + JSON.stringify(d) + ')');
    check('A1 detalle muestra la foto (mini) del posteo', html.includes('/media/1792915743269-5a3d77c87579.jpg'));
    check('A2 mini 96×96 con object-fit:contain (imagen completa, sin recortar)', html.includes('width:96px;height:96px;object-fit:contain'));
    check('A3 la foto grande recortada (240px cover) NO está en el detalle', !html.includes('height:240px') && !html.includes('object-fit:cover'));
    check('A4 la tarjeta «TEXTO DEL POSTEO» aparte NO está más', !html.includes('TEXTO DEL POSTEO'));
    check('A5 título 17px sigue como titular encima de la fila', html.includes('Medialunas como en casa') && html.includes('font-size:17px;font-weight:800'));
    check('A6 conserjeFotoHTML(it, true) ya no se llama en el detalle', cnt(SRC, 'conserjeFotoHTML(it, true)') === 0);
    check('A7 conserjeFotoHTML intacta (240/180 según grande)', SRC.includes('const h = grande ? 240 : 180;'));
  }
  // ---------- B) caption completo alcanzable (Ver más) ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const html = t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[1]) + ',' + JSON.stringify(d) + ')');
    check('B1 caption completo en el HTML (todas las líneas)', html.includes('¿Cuántas veces te preguntaste cómo se hacen nuestras medialunas?') && html.includes('Pasá por el local en Palermo y probalas calentitas.'));
    check('B2 caption con clamp a 3 líneas (.cj-cap-txt)', html.includes('cj-cap-txt') && html.includes('-webkit-line-clamp:3'));
    check('B3 botón «Ver más» con data-cj="cap-mas"', html.includes('data-cj="cap-mas"') && html.includes('Ver más'));
    check('B4 la hora sigue bajo el caption', html.includes('lun 9/11 · 19:00'));
    // Toggle en vivo (vm): expande y contrae sin navegar.
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '84' });
    const btn = await t.click({ 'data-cj': 'cap-mas' }, 'Ver más');
    check('B5 un toque en «Ver más» expande el caption (clase cj-cap-full)', t.capTxt._cls.has('cj-cap-full') && btn.textContent === 'Ver menos');
    const btn2 = await t.click({ 'data-cj': 'cap-mas' }, 'Ver menos');
    check('B6 segundo toque lo contrae («Ver más» de nuevo)', !t.capTxt._cls.has('cj-cap-full') && btn2.textContent === 'Ver más');
    // Ajuste: si el caption entra en 3 líneas, el «Ver más» se esconde.
    const safeCall = (tt, expr) => { try { tt.html(expr); return true; } catch (e) { return false; } };
    const t2 = makeCtx();
    t2.capTxt.scrollHeight = 67; t2.capTxt.clientHeight = 67;
    check('B7 caption corto (entra en 3 líneas) esconde el «Ver más»', safeCall(t2, 'conserjeCapAjustar()') && t2.capMas.style.display === 'none');
    const t3 = makeCtx();
    t3.capTxt.scrollHeight = 200; t3.capTxt.clientHeight = 67;
    check('B8 caption largo mantiene el «Ver más» visible', safeCall(t3, 'conserjeCapAjustar()') && t3.capMas.style.display === '');
  }
  // ---------- C) botones nuevos + binding vivo ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const html = t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[0]) + ',' + JSON.stringify(d) + ')');
    check('C1 «Sale así» VERDE #14743F (no azul btn-primary)', html.includes('background:#14743F;color:#fff') && html.includes('✓ Sale así'));
    check('C2 «Sale así» y «Editar» a la par (flex:1, misma fila)', html.includes('display:flex;gap:8px;margin-top:12px') && html.includes('flex:1;min-height:52px'));
    check('C3 «Editar» con data-cj="arreglar" (reusa el flujo)', html.includes('data-cj="arreglar"') && html.includes('✎ Editar'));
    check('C4 «Pedir que lo arregle» ya no existe como botón', !html.includes('Pedir que lo arregle'));
    check('C5 los 3 botones grandes apilados (column) ya no existen', !html.includes('display:flex;flex-direction:column;gap:8px;margin-top:12px'));
    check('C6 el textarea #cjArreglo + «Enviar arreglo» siguen intactos', html.includes('id="cjArreglo"') && html.includes('Enviar arreglo') && html.includes('data-decision="arreglar"'));
    // Flujo vivo: Sale así en un toque.
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '89' });
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'sale', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-09' }, '✓ Sale así');
    const decidir = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('C7 un toque en «Sale así» decide "sale" con post_id', decidir.length === 1 && decidir[0].body.decision === 'sale' && decidir[0].body.post_id === 581);
    // Flujo vivo: Editar abre el campo y envía con nota.
    const t2 = makeCtx();
    await t2.bind();
    await t2.click({ 'data-cj': 'ver', 'data-user': '89' });
    await t2.click({ 'data-cj': 'arreglar', 'data-user': '89' }, '✎ Editar');
    check('C8 un toque en «Editar» abre el campo "Qué hay que arreglar"', t2.els['#cjArreglo'].style.display === 'block');
    t2.els['#cjArregloNota'].value = 'Que no hable del precio';
    await t2.click({ 'data-cj': 'decidir', 'data-decision': 'arreglar', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-09', 'data-nota': '1' }, 'Enviar arreglo');
    const d2 = t2.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('C9 enviar guarda "arreglar" CON la nota', d2.length === 1 && d2[0].body.decision === 'arreglar' && d2[0].body.nota === 'Que no hable del precio');
  }
  // ---------- D) «No sale» como link, sin perder la decisión ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const html = t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[0]) + ',' + JSON.stringify(d) + ')');
    check('D1 «No sale» presente como link (data-decision="no_sale")', html.includes('data-decision="no_sale"') && html.includes('✕ No sale'));
    check('D2 «No sale» NO es botón grande (sin min-height 52px)', !/no_sale"[^>]*min-height:52px/.test(html) && !html.includes('✕ No sale</button>\n'));
    check('D3 «No sale» centrado debajo de los dos botones', html.includes('text-align:center;margin-top:10px'));
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '89' });
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'no_sale', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-09' }, '✕ No sale');
    const decidir = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('D4 un toque en el link decide "no_sale"', decidir.length === 1 && decidir[0].body.decision === 'no_sale');
  }
  // ---------- E) lista, ficha, chat, IG y siguiente intactos ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const card = t.html('conserjeCardHTML(' + JSON.stringify(d.items[0]) + ')');
    check('E1 tarjeta de lista: foto 180px cover intacta', card.includes('height:180px') && card.includes('object-fit:cover'));
    check('E2 tarjeta de lista: píldora encima de la foto intacta', card.includes('Necesita atención') && card.includes('position:absolute'));
    const det = t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[0]) + ',' + JSON.stringify(d) + ')');
    check('E3 ficha del cliente intacta', det.includes('Ficha de Ladyee Boutique'));
    check('E4 botón chat intacto', det.includes('Ver el chat con Posty'));
    check('E5 link a Instagram intacto', det.includes('Ver el feed de Ladyee Boutique'));
    check('E6 tarjeta amarilla «Qué pasó» intacta', det.includes('Qué pasó'));
    check('E7 contador «X de N revisados» intacto', det.includes('0 de 2 revisados'));
    check('E8 «Volver a la revisión» intacto', det.includes('Volver a la revisión'));
  }
  // ---------- F) CHUNK_V v887 en app.js ----------
  {
    check('F1 CHUNK_V = 20261105-v887 en app.js', APP.includes("const CHUNK_V = '20261105-v887';"));
    check('F2 CHUNK_V v850 ya no está', !APP.includes("const CHUNK_V = '20261105-v850';"));
    check('F3 el bump lleva su comentario (v887)', APP.includes('(v887) bump: chunk-conserje'));
    check('F4 app.js: solo el bump (CHUNK_V v887 ×1, v850 ×0)', cnt(APP, '20261105-v887') === 1 && cnt(APP, '20261105-v850') === 0);
  }
  // ---------- G) auditoría: data-cj + funciones ----------
  {
    const llamados = [...new Set([...SRC.matchAll(/\b(conserje[A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]))];
    const t = makeCtx();
    const faltan = llamados.filter((fn) => t.html('typeof ' + fn) === 'undefined');
    check('G1 toda función conserje* llamada existe definida (' + llamados.length + ')', faltan.length === 0, faltan.join(', '));
    const cjHtml = [...SRC.matchAll(/data-cj="([^"]+)"/g)].map((m) => m[1]);
    const cjAcciones = [...new Set(cjHtml)];
    const manejadas = cjAcciones.filter((a) => SRC.includes("acc === '" + a + "'"));
    check('G2 toda acción data-cj del HTML tiene rama en el handler (' + manejadas.length + '/' + cjAcciones.length + ')', manejadas.length === cjAcciones.length, cjAcciones.filter((a) => !manejadas.includes(a)).join(', '));
    check('G3 la rama cap-mas existe explícita', SRC.includes("acc === 'cap-mas'"));
    check('G4 conserjeCapAjustar se llama tras render del detalle', SRC.includes('conserjeDetalleHTML(it, d); conserjeCapAjustar();'));
  }

  console.log(`\nconserje-revision-v1: ${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
