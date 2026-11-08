// test-lote-conserje-diseno.js — LOTE CONSERJE-DISEÑO (base v773).
// El conserje REAL de la app (#/app/conserje) con el diseño y el flujo
// del mock interactivo que Valentino aprobó ("excelente", 7/11 20:06):
// cuando los posteos están ocultos para los clientes, el dueño tiene que
// aceptar o pedir algún cambio de manera MUY SIMPLE y con diseño perfecto.
// Cubre, con public/chunk-conserje.js en vm (mismo patrón que
// test-lote-chat-foto.js):
//  A) el dueño ve el posteo COMPLETO (foto, título, caption, hora)
//     aunque para el cliente siga oculto/velado;
//  B) la tarjeta de la lista: foto protagonista + píldora de estado
//     ENCIMA de la foto; C) resumen con barra de progreso y contador
//     "X de N revisados" contando también a los sin posteo;
//  D) "✓ Todo decidido — la noche está cerrada" cuando TODOS decidieron;
//  E) siguiente pendiente (atención primero, luego resto, luego sin
//     posteo); F) "Sale así" en UN toque avanza solo al siguiente
//     pendiente; G) "Pedir que lo arregle" guarda la nota y marca
//     "A arreglar"; H) "No sale" en un toque; I) "Posty lo arma";
//  J) el chat se despliega y se oculta (sin re-cargar); K) la nota
//     privada muestra "Guardada ✓" sin que un reload la borre;
//  L) "Volver a la revisión" conserva las decisiones;
//  M) auditoría de funciones: todo lo que las tarjetas llaman existe.
// No toca producción ni la DB real: adminApi es un stub con datos de
// ejemplo que imita al servidor (decidir mueve a sin_posteo un "No sale",
// como hace conserje-revision.js al excluir el posteo rechazado).
// Uso: node test-lote-conserje-diseno.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const SRC = fs.readFileSync(path.join(__dirname, 'public', 'chunk-conserje.js'), 'utf8');
const LABEL = { sale: 'Sale así', arreglar: 'Pedir que lo arregle', no_sale: 'No sale', pedir: 'Posty lo arma' };

// ---------- datos de ejemplo (forma de colaRevision) ----------
function ficha(uid, name, o) {
  return Object.assign({
    ok: true, user_id: uid, business_name: name,
    vende: { estrella: 'Café de especialidad', rubro: 'Cafetería', productos: ['Café en grano', 'Brunch'], diferencial: 'Tostado propio', objetivo: 'Llenar las mañanas' },
    gusta: { tono: 'Cercano', gustos: ['Fotos reales', 'Humor suave'], pidio_cambiar: [] },
    etapa: { color: 'verde', etiqueta: 'En ritmo' },
    lineas_rojas: ['Nunca inventar precios'],
    paleta: [{ hex: '#7A4A21' }, { hex: '#F5E6D3' }],
    plan: { plan: 'Posty', plan_status: 'active', desde: '2026-10-05' },
    estrategia: { linea: 'El café de la mañana, todos los días' },
    proximo_paso: { texto: 'Decidir el posteo de mañana en la revisión de la noche' },
    historial: [{ etiqueta: 'Sale así', nota: '', fecha_posteo: '2026-11-07' }],
    nota: { texto: '' },
    faltantes: [],
  }, o || {});
}
function fixtureDatos() {
  const ladyee = {
    user_id: 89, business_name: 'Ladyee Boutique', ig_username: 'ladyee.boutique', origen: 'programado',
    necesita_atencion: true, motivo_atencion: 'Dice «Shop now» en vez del producto', decision: null,
    post: { id: 581, titulo: 'Nueva colección: el vestido que pedían', caption: 'Llegó la nueva colección de vestidos.\nProbátelos este finde, te esperamos.', image_url: '/media/ladyee-581.jpg', tiene_foto: true, media_type: 'image', tipo: 'image', scheduled_at: '2026-11-08 17:00:00', status: 'scheduled', approval: 'pending', cuando: 'dom 8/11 · 17:00' },
    siguiente: null, ficha: ficha(89, 'Ladyee Boutique'),
  };
  const portrait = {
    user_id: 87, business_name: 'Portrait Coffee', ig_username: 'portrait.coffee', origen: 'programado',
    necesita_atencion: false, motivo_atencion: '', decision: { decision: 'sale', etiqueta: 'Sale así', nota: '', decided_at: '2026-11-07 19:30', post_id: 570 },
    post: { id: 570, titulo: 'El café de la tarde, como en casa', caption: 'El café de la tarde se sirve despacio.\nTe esperamos hasta las 19:00.', image_url: '/media/portrait-570.jpg', tiene_foto: true, media_type: 'image', tipo: 'image', scheduled_at: '2026-11-08 12:00:00', status: 'scheduled', approval: 'approved', cuando: 'dom 8/11 · 12:00' },
    siguiente: null, ficha: ficha(87, 'Portrait Coffee'),
  };
  const topclass = {
    user_id: 88, business_name: 'Top Class Barber Squad', ig_username: 'topclass.barber', origen: 'programado',
    necesita_atencion: false, motivo_atencion: '', decision: null,
    post: { id: 579, titulo: 'Corte fresco para el finde', caption: 'Corte fresco para el finde.\nReservá tu lugar.', image_url: '/media/topclass-579.jpg', tiene_foto: true, media_type: 'image', tipo: 'image', scheduled_at: '2026-11-08 19:00:00', status: 'scheduled', approval: 'pending', cuando: 'dom 8/11 · 19:00' },
    siguiente: null, ficha: ficha(88, 'Top Class Barber Squad'),
  };
  const cafe = {
    user_id: 84, business_name: 'Café Aroma', ig_username: 'cafearoma.palermo', origen: 'sin_posteo',
    necesita_atencion: false, motivo_atencion: '', decision: null, post: null, siguiente: null,
    ficha: ficha(84, 'Café Aroma'),
  };
  return {
    ok: true, fecha: '2026-11-08', ventana: { estado: 'abierta', ahora: '19:42' },
    resumen: { total: 3, decididos: 1, pendientes: 2, necesitan_atencion: 1, atencion_sin_decidir: 1, sin_posteo: 1, todo_decidido: false },
    items: [ladyee, portrait, topclass], sin_posteo: [cafe],
  };
}
function journeyFixture() {
  return { ok: true, chat: [
    { role: 'user', text: 'Hola Posty, ¿me cambiás la foto?' },
    { role: 'assistant', text: 'claro, te muestro el posteo con la foto cambiada: [foto:/media/cambiada.jpg]\n¿te gusta?' },
  ], fotos_recientes: [{ file_path: '/media/foto1.jpg' }] };
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
  const scrolls = [];
  const sandbox = {
    console, setTimeout, clearTimeout,
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    pzIc() { return ''; },
    $: (sel) => (sel === '#conserjeCard' ? card : (els[sel] || null)),
    loadChunk: async () => true,
    adminToken: () => 'tok',
    adminApi: async (endpoint, method, body) => {
      server.calls.push({ endpoint, method, body });
      if (endpoint === 'support/conserje/revision' && method === 'GET') {
        const conPosteo = server.datos.items.filter((i) => i.post);
        server.datos.resumen = { total: conPosteo.length, decididos: conPosteo.filter((i) => i.decision).length, pendientes: conPosteo.filter((i) => !i.decision).length, necesitan_atencion: conPosteo.filter((i) => i.necesita_atencion).length, atencion_sin_decidir: conPosteo.filter((i) => i.necesita_atencion && !i.decision).length, sin_posteo: server.datos.sin_posteo.length, todo_decidido: conPosteo.length > 0 && conPosteo.every((i) => i.decision) };
        return JSON.parse(JSON.stringify(server.datos));
      }
      if (endpoint === 'support/conserje/revision/decidir' && method === 'POST') {
        let it = server.datos.items.find((x) => x.user_id === body.user_id)
          || server.datos.sin_posteo.find((x) => x.user_id === body.user_id);
        if (it) {
          it.decision = { decision: body.decision, etiqueta: LABEL[body.decision], nota: body.nota || '' };
          if (body.decision === 'no_sale') {
            // El servidor excluye el posteo rechazado: en el reload el
            // cliente pasa a sin_posteo, CON su decisión registrada.
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
      if (endpoint === 'support/conserje/nota' && method === 'POST') {
        // El servidor persiste la nota y el próximo GET la trae en la ficha.
        const it = server.datos.items.find((x) => x.user_id === body.user_id)
          || server.datos.sin_posteo.find((x) => x.user_id === body.user_id);
        if (it && it.ficha) it.ficha.nota = { texto: body.nota };
        return { ok: true, nota: body.nota };
      }
      if (/^support\/\d+\/journey$/.test(endpoint)) return journeyFixture();
      throw new Error('endpoint no stubbeado: ' + endpoint);
    },
    window: { scrollTo(x, y) { scrolls.push([x, y]); } },
    document: { createElement: () => ({ className: '', style: {}, textContent: '' }) },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'chunk-conserje.js' });
  const api = {
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
  return api;
}

// Llama a una expresión en la vm sin abortar la suite si la función
// todavía no existe (fase roja): devuelve { ok, v }.
function safeHtml(t, expr) {
  try { return { ok: true, v: t.html(expr) }; }
  catch (e) { return { ok: false, v: null }; }
}

(async () => {
  // ---------- A) el dueño ve el posteo COMPLETO ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const html = t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[0]) + ',' + JSON.stringify(d) + ')');
    check('A1 detalle muestra la foto del posteo', html.includes('/media/ladyee-581.jpg'));
    check('A2 detalle muestra el título', html.includes('Nueva colección: el vestido que pedían'));
    check('A3 detalle muestra el CAPTION completo', html.includes('Llegó la nueva colección de vestidos') && html.includes('Probátelos este finde, te esperamos.'));
    check('A4 detalle muestra la hora', html.includes('dom 8/11 · 17:00'));
    check('A5 detalle muestra la tarjeta amarilla "Qué pasó"', html.includes('Qué pasó') && html.includes('Dice «Shop now» en vez del producto') && html.includes('No sale hasta que lo revises.'));
  }
  // ---------- B) tarjeta de lista: foto protagonista + píldora encima ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const html = t.html('conserjeCardHTML(' + JSON.stringify(d.items[0]) + ')');
    check('B1 tarjeta tiene foto grande (180px)', html.includes('height:180px'));
    const iFoto = html.indexOf('cj-foto');
    const iPill = html.indexOf('Necesita atención');
    check('B2 la píldora vive ENCIMA de la foto (wrapper relativo + absoluta)', iFoto !== -1 && iPill > iFoto && html.includes('position:absolute'));
    const htmlListo = t.html('conserjeCardHTML(' + JSON.stringify(d.items[2]) + ')');
    check('B3 tarjeta lista muestra "✓ Listo"', htmlListo.includes('Listo'));
    const htmlDec = t.html('conserjeCardHTML(' + JSON.stringify(d.items[1]) + ')');
    check('B4 tarjeta decidida muestra "Sale así"', htmlDec.includes('Sale así'));
  }
  // ---------- C) resumen: barra + contador local (incluye sin posteo) ----------
  {
    const t = makeCtx();
    await t.bind();
    const h = t.card.innerHTML;
    check('C1 resumen muestra contador "1 de 4 revisados" (incluye sin posteo)', h.includes('1 de 4 revisados'));
    check('C2 resumen muestra barra de progreso con 25%', h.includes('cj-progreso') && h.includes('width:25%'));
    check('C3 resumen muestra "Mañana salen 3 posteos"', h.includes('Mañana salen 3 posteos'));
  }
  // ---------- D) todo decidido ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    d.items.forEach((i) => { if (!i.decision) i.decision = { decision: 'sale', etiqueta: 'Sale así', nota: '' }; });
    d.sin_posteo.forEach((i) => { if (!i.decision) i.decision = { decision: 'pedir', etiqueta: 'Posty lo arma', nota: '' }; });
    t.server.datos = d;
    await t.bind();
    check('D1 con todos decididos aparece "✓ Todo decidido — la noche está cerrada"', t.card.innerHTML.includes('Todo decidido — la noche está cerrada'));
    check('D2 contador "4 de 4 revisados"', t.card.innerHTML.includes('4 de 4 revisados'));
    check('D3 barra llena (100%)', t.card.innerHTML.includes('cj-progreso') && t.card.innerHTML.includes('width:100%'));
    // Y NO aparece cuando falta uno sin posteo por decidir:
    const t2 = makeCtx();
    const d2 = fixtureDatos();
    d2.items.forEach((i) => { if (!i.decision) i.decision = { decision: 'sale', etiqueta: 'Sale así', nota: '' }; });
    t2.server.datos = d2;
    await t2.bind();
    check('D4 sin decidir el sin-posteo NO dice "noche cerrada"', !t2.card.innerHTML.includes('Todo decidido — la noche está cerrada'));
  }
  // ---------- E) siguiente pendiente ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const s1 = safeHtml(t, 'conserjeSiguientePendiente(' + JSON.stringify(d) + ', 89)');
    check('E1 tras Ladyee sigue Top Class (88)', s1.ok && s1.v && s1.v.user_id === 88);
    const s2 = safeHtml(t, 'conserjeSiguientePendiente(' + JSON.stringify(d) + ', 88)');
    check('E2 tras Top Class sigue Café Aroma (84, sin posteo)', s2.ok && s2.v && s2.v.user_id === 84);
    const dAll = fixtureDatos();
    dAll.items.forEach((i) => { i.decision = { decision: 'sale', etiqueta: 'Sale así', nota: '' }; });
    dAll.sin_posteo.forEach((i) => { i.decision = { decision: 'pedir', etiqueta: 'Posty lo arma', nota: '' }; });
    const s3 = safeHtml(t, 'conserjeSiguientePendiente(' + JSON.stringify(dAll) + ', 89)');
    check('E3 con todos decididos no hay siguiente (null)', s3.ok && s3.v === null);
  }
  // ---------- F) "Sale así" en un toque avanza ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '89' });
    check('F0 abre el detalle de Ladyee', t.card.innerHTML.includes('Ladyee Boutique') && t.card.innerHTML.includes('Nueva colección'));
    const antes = t.server.calls.length;
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'sale', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-08' }, '✓ Sale así');
    const decidir = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('F1 un solo toque = una sola llamada decidir "sale"', decidir.length === 1 && decidir[0].body.decision === 'sale' && decidir[0].body.post_id === 581);
    check('F2 tras aceptar avanza SOLO al siguiente pendiente (Top Class)', String(t.estado().vistaId) === '88' && t.card.innerHTML.includes('Top Class Barber Squad'));
    check('F3 el detalle siguiente muestra el progreso ("2 de 4 revisados")', t.card.innerHTML.includes('2 de 4 revisados'));
    await t.click({ 'data-cj': 'volver' });
    check('F4 al volver, la lista muestra "2 de 4 revisados"', t.card.innerHTML.includes('2 de 4 revisados'));
    check('F5 la tarjeta de Ladyee ya dice "Sale así"', t.card.innerHTML.includes('Sale así'));
  }
  // ---------- G) "Pedir que lo arregle" ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '89' });
    await t.click({ 'data-cj': 'arreglar', 'data-user': '89' }, 'Pedir que lo arregle');
    check('G1 un toque abre el campo "Qué hay que arreglar"', t.els['#cjArreglo'].style.display === 'block' && t.card.innerHTML.includes('Qué hay que arreglar'));
    t.els['#cjArregloNota'].value = 'Que no hable del precio';
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'arreglar', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-08', 'data-nota': '1' }, 'Enviar arreglo');
    const decidir = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('G2 enviar guarda la decisión "arreglar" CON la nota', decidir.length === 1 && decidir[0].body.decision === 'arreglar' && decidir[0].body.nota === 'Que no hable del precio');
    check('G3 tras pedir el arreglo avanza solo (Top Class)', String(t.estado().vistaId) === '88');
    await t.click({ 'data-cj': 'volver' });
    check('G4 la tarjeta de Ladyee queda "A arreglar" con la nota', t.card.innerHTML.includes('A arreglar') && t.card.innerHTML.includes('Que no hable del precio'));
  }
  // ---------- H) "No sale" ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '88' });
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'no_sale', 'data-user': '88', 'data-post': '579', 'data-fecha': '2026-11-08' }, '✕ No sale');
    const decidir = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('H1 un toque decide "no_sale"', decidir.length === 1 && decidir[0].body.decision === 'no_sale');
    check('H2 tras "No sale" avanza solo (Ladyee, la que necesita atención: el rechazado pasa al final de la lista y se vuelve al primer pendiente)', String(t.estado().vistaId) === '89' && t.card.innerHTML.includes('Ladyee Boutique'));
    await t.click({ 'data-cj': 'volver' });
    check('H3 el cliente rechazado aparece en sin-posteo con "No sale"', t.card.innerHTML.includes('No sale'));
    check('H4 y ya NO ofrece "Posty lo arma →" para ese cliente', !/Top Class Barber Squad[\s\S]{0,400}Posty lo arma →/.test(t.card.innerHTML));
  }
  // ---------- I) "Posty lo arma" cierra la noche ----------
  {
    const t = makeCtx();
    await t.bind();
    // Decidir los 3 con posteo primero (vía API del stub, como si ya se
    // hubieran decidido) para dejar solo a Café Aroma pendiente.
    t.server.datos.items.forEach((i) => { if (!i.decision) i.decision = { decision: 'sale', etiqueta: 'Sale así', nota: '' }; });
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '84' });
    check('I0 el detalle sin posteo ofrece "Posty lo arma"', t.card.innerHTML.includes('Posty lo arma'));
    await t.click({ 'data-cj': 'armar', 'data-user': '84', 'data-fecha': '2026-11-08' }, 'Posty lo arma');
    const armar = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/armar');
    check('I1 un toque pide que Posty lo arme (decisión "pedir")', armar.length === 1 && armar[0].body.decision === 'pedir');
    check('I2 al decidir el último vuelve SOLO a la lista', t.estado().vistaId === null || t.estado().vistaId === undefined);
    check('I3 la lista muestra "✓ Todo decidido — la noche está cerrada"', t.card.innerHTML.includes('Todo decidido — la noche está cerrada'));
    check('I4 contador "4 de 4 revisados"', t.card.innerHTML.includes('4 de 4 revisados'));
  }
  // ---------- J) chat desplegable ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '88' });
    const btn = await t.click({ 'data-cj': 'chat', 'data-user': '88' }, '💬 Ver el chat con Posty');
    check('J1 el chat se carga (burbujas Cliente/Posty)', t.els['#cjChat'].innerHTML.includes('Cliente') && t.els['#cjChat'].innerHTML.includes('Posty'));
    check('J2 el botón pasa a "Ocultar el chat"', btn.textContent.includes('Ocultar el chat'));
    const journeys = t.server.calls.filter((c) => /journey$/.test(c.endpoint)).length;
    await t.click({ 'data-cj': 'chat', 'data-user': '88' }, '💬 Ocultar el chat');
    check('J3 segundo toque OCULTA el chat sin re-cargar', t.els['#cjChat'].style.display === 'none' && t.server.calls.filter((c) => /journey$/.test(c.endpoint)).length === journeys);
    await t.click({ 'data-cj': 'chat', 'data-user': '88' }, '💬 Ver el chat con Posty');
    check('J4 tercer toque lo muestra de nuevo, sin otra carga', t.els['#cjChat'].style.display === '' && t.server.calls.filter((c) => /journey$/.test(c.endpoint)).length === journeys);
  }
  // ---------- K) nota privada ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '87' });
    t.els['#cjNota'].value = 'Le gusta el café frío';
    await t.click({ 'data-cj': 'nota-guardar', 'data-user': '87' }, 'Guardar');
    const notas = t.server.calls.filter((c) => c.endpoint === 'support/conserje/nota');
    check('K1 guardar llama al endpoint con la nota', notas.length === 1 && notas[0].body.nota === 'Le gusta el café frío');
    check('K2 tras guardar se ve "Guardada ✓" (no la borra un reload)', t.card.innerHTML.includes('Guardada ✓'));
    check('K3 la nota queda en la ficha', t.card.innerHTML.includes('Le gusta el café frío'));
  }
  // ---------- L) volver conserva decisiones ----------
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'ver', 'data-user': '89' });
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'sale', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-08' }, '✓ Sale así');
    await t.click({ 'data-cj': 'volver' });
    check('L1 volver muestra la lista con la decisión conservada', t.card.innerHTML.includes('Ladyee Boutique') && t.card.innerHTML.includes('Sale así'));
  }
  // ---------- M) auditoría de funciones ----------
  {
    const llamados = [...new Set([...SRC.matchAll(/\b(conserje[A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]))];
    const t = makeCtx();
    const faltan = llamados.filter((fn) => t.html('typeof ' + fn) === 'undefined');
    check('M1 toda función conserje* llamada existe definida (' + llamados.length + '/' + llamados.length + ')', faltan.length === 0, faltan.join(', '));
    const cjHtml = [...SRC.matchAll(/data-cj="([^"]+)"/g)].map((m) => m[1]);
    const cjAcciones = [...new Set(cjHtml)];
    const manejadas = cjAcciones.filter((a) => SRC.includes("acc === '" + a + "'"));
    check('M2 toda acción data-cj del HTML tiene rama en el handler (' + manejadas.length + '/' + cjAcciones.length + ')', manejadas.length === cjAcciones.length, cjAcciones.filter((a) => !manejadas.includes(a)).join(', '));
    const globales = ['esc', 'pzIc', '$', 'adminApi', 'adminToken', 'loadChunk'];
    const faltanG = globales.filter((g) => t.html('typeof ' + g) === 'undefined');
    check('M3 globales de app.js que usa el chunk están en el allowlist (' + (globales.length - faltanG.length) + '/' + globales.length + ')', faltanG.length === 0, faltanG.join(', '));
  }

  console.log(`\nconserje-diseno: ${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
