// test-lote-revision-lista.js — LOTE v967 REVISION-LISTA
// (11/11, Valentino: la lista de la Revisión de la noche sigue con el
// diseño viejo — foto enorme, titular encima, píldora amarilla tapando la
// imagen, solo «Marcado para revisar», sin botón. La variante 1 (v887)
// solo cambió el detalle; este lote aplica el mismo diseño aprobado a las
// tarjetas de la LISTA: foto completa 96px a la izquierda, caption a la
// derecha, abajo [✓ Sale así verde #14743F] [✎ Editar] a la par; «✕ No
// sale» como link chico; «Editar» reusa el flujo arreglar. La píldora ya
// no tapa la foto: vive en línea en el encabezado. El titular va arriba
// de la fila, nunca encima de la foto. La lógica no cambia: los botones
// usan el mismo data-cj y el mismo flujo que el detalle.)
// Cubre, con public/chunk-conserje.js en vm (mismo patrón que
// test-lote-conserje-revision-v1.js): A) tarjeta de lista con el diseño
// v1 (mini 96, caption, sin foto enorme ni píldora encima); B) botones
// con los data-cj correctos; C) binding vivo (decidir sale/no_sale,
// arreglar por tarjeta, textarea sin navegar, Ver más por tarjeta);
// D) detalle intacto (v887); E) estampado (BUILD v967, CHUNK_V v967,
// app.js?v=668, styles?v=20261270 intacto); F) auditoría data-cj (M2) +
// funciones (M1/M78); G) censo de marcadores ajenos.
// Uso: node test-lote-revision-lista.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

// La suite corre desde release/ (push) o desde el top del scratch.
const ROOT = fs.existsSync(path.join(__dirname, 'public')) ? __dirname : path.join(__dirname, 'release');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'chunk-conserje.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
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
    necesita_atencion: true, motivo_atencion: 'Marcado para revisar', decision: null,
    post: { id: 581, titulo: 'Nueva colección: el vestido que pedían', caption: 'Llegó la nueva colección de vestidos.\nProbátelos este finde, te esperamos.', image_url: '/media/ladyee-581.jpg', tiene_foto: true, media_type: 'image', tipo: 'image', scheduled_at: '2026-11-09 19:00:00', status: 'scheduled', approval: 'pending', cuando: 'dom 9/11 · 19:00' },
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
function itemDecidido() {
  const it = fixtureDatos().items[1];
  it.decision = { decision: 'sale', etiqueta: 'Sale así', nota: 'ok, va así' };
  return it;
}

// ---------- stubs de DOM ----------
function fakeCapTxt(scrollH, clientH) {
  const el = {
    _cls: new Set(), style: {}, scrollHeight: scrollH, clientHeight: clientH,
    classList: {
      toggle(c) { if (el._cls.has(c)) { el._cls.delete(c); return false; } el._cls.add(c); return true; },
      contains(c) { return el._cls.has(c); },
    },
    closest() { return null; },
    querySelector() { return null; },
  };
  return el;
}
function fakeEl(attrs, closestMap) {
  const el = {
    _attrs: attrs || {}, textContent: '', disabled: false, style: { display: '' }, dataset: {}, value: '',
    getAttribute(k) { return this._attrs[k] !== undefined ? String(this._attrs[k]) : null; },
    closest(sel) {
      if (closestMap && closestMap[sel]) return closestMap[sel];
      return (sel === '[data-cj]' && this._attrs['data-cj']) ? this : null;
    },
    querySelector(sel) {
      if (closestMap && closestMap.__qs && closestMap.__qs[sel]) return closestMap.__qs[sel];
      return null;
    },
  };
  return el;
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
  const capTxtGlobal = fakeCapTxt(200, 67);
  const capMasGlobal = { style: { display: '' } };
  const capTxts = [fakeCapTxt(200, 67), fakeCapTxt(200, 67)];
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
      querySelector: (sel) => (sel === '.cj-cap-txt' ? capTxtGlobal : (sel === '[data-cj="cap-mas"]' ? capMasGlobal : null)),
      querySelectorAll: (sel) => (sel === '.cj-cap-txt' ? capTxts : []),
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'chunk-conserje.js' });
  return {
    ctx: sandbox, card, els, server, capTxtGlobal, capMasGlobal, capTxts,
    html(expr) { return vm.runInContext(expr, sandbox); },
    async bind() { await vm.runInContext('bindConserje()', sandbox); },
    estado() { return vm.runInContext('conserjeEstado', sandbox); },
    async fire(target) {
      const h = card.__handlers && card.__handlers.click;
      if (!h) throw new Error('sin handler click');
      await h({ target });
    },
    async click(attrs, text, closestMap) {
      const btn = fakeEl(attrs, closestMap);
      btn.textContent = text || '';
      await this.fire(btn);
      return btn;
    },
  };
}

(async () => {
  // ---------- A) tarjeta de lista con el diseño v1 ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const card = t.html('conserjeCardHTML(' + JSON.stringify(d.items[0]) + ', "2026-11-09")');
    check('A1 lista: foto mini 96×96 contain (completa, sin recortar)', card.includes('width:96px;height:96px;object-fit:contain'));
    check('A2 lista: la foto enorme 180px cover YA NO está', !card.includes('height:180px') && !card.includes('object-fit:cover'));
    check('A3 lista: la píldora YA NO va encima de la foto (sin position:absolute)', !card.includes('position:absolute'));
    check('A4 lista: la píldora «Necesita atención» sigue como señal, en línea', card.includes('Necesita atención') && card.includes('class="pill"'));
    check('A5 lista: el titular NO va encima de la foto (va arriba de la fila, sin overlay)', card.includes('Nueva colección: el vestido que pedían') && !card.includes('cj-foto'));
    check('A6 lista: caption visible a la derecha', card.includes('Llegó la nueva colección de vestidos.') && card.includes('cj-cap-txt'));
    check('A7 lista: «Ver más» para el caption largo', card.includes('Ver más'));
    check('A8 lista: el motivo «Marcado para revisar» sigue', card.includes('Marcado para revisar'));
    check('A9 lista: un toque en la tarjeta abre el detalle (data-cj="ver")', card.includes('data-cj="ver"'));
    const card2 = t.html('conserjeCardHTML(' + JSON.stringify(d.items[1]) + ', "2026-11-09")');
    check('A10 lista: tarjeta «Listo» muestra ✓ Listo', card2.includes('Listo'));
    check('A11 lista: caption largo entero en el HTML (recortado a 3 líneas por CSS)', card2.includes(CAPTION_LARGO.split('\n')[0]) && card2.includes('Pasá por el local en Palermo y probalas calentitas.'));
    const cardDec = t.html('conserjeCardHTML(' + JSON.stringify(itemDecidido()) + ', "2026-11-09")');
    check('A12 lista: tarjeta ya decidida muestra «Sale así» y sigue con botones', cardDec.includes('Sale así') && cardDec.includes('data-decision="sale"'));
  }
  // ---------- B) botones con los data-cj correctos ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const card = t.html('conserjeCardHTML(' + JSON.stringify(d.items[0]) + ', "2026-11-09")');
    check('B1 botón «✓ Sale así» VERDE #14743F', card.includes('background:#14743F') && card.includes('✓ Sale así'));
    check('B2 «Sale así» decide sale con post y fecha', card.includes('data-cj="decidir"') && card.includes('data-decision="sale"') && card.includes('data-post="581"') && card.includes('data-fecha="2026-11-09"'));
    check('B3 «✎ Editar» reusa el flujo arreglar (data-cj="arreglar")', card.includes('data-cj="arreglar"') && card.includes('✎ Editar'));
    check('B4 «✕ No sale» como link chico (no botón grande)', card.includes('✕ No sale') && card.includes('data-decision="no_sale"') && card.includes('background:none;border:0'));
    check('B5 los dos botones van a la par (flex:1)', card.includes('display:flex;gap:8px') && cnt(card, 'flex:1;min-height:48px') === 2);
    check('B6 caja de arreglo propia por tarjeta (clase, sin id duplicado)', card.includes('class="cj-arreglo"') && card.includes('class="cj-arreglo-nota"') && !card.includes('id="cjArreglo"'));
    check('B7 «Enviar arreglo» decide arreglar con data-nota="1"', card.includes('data-decision="arreglar"') && card.includes('data-nota="1"') && card.includes('Enviar arreglo'));
  }
  // ---------- C) binding vivo ----------
  {
    const t = makeCtx();
    await t.bind();
    const lista = t.card.innerHTML;
    check('C1 la lista rinde las dos tarjetas con el diseño v1', lista.includes('Ladyee Boutique') && lista.includes('Café Aroma') && cnt(lista, 'width:96px;height:96px;object-fit:contain') === 2);
    check('C2 la lista ya no tiene foto 180px ni píldora absoluta', !lista.includes('height:180px') && !lista.includes('position:absolute'));
    check('C3 la grilla de 2 columnas sigue', lista.includes('grid-template-columns:1fr 1fr'));
    check('C4 el <style> del clamp se emite una sola vez para la lista', cnt(lista, '.cj-cap-txt{display:-webkit-box') === 1);
    // Decidir «Sale así» desde la lista.
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'sale', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-09' }, '✓ Sale así');
    const decidir = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('C5 un toque en «Sale así» de la lista decide "sale" con post y fecha', decidir.length === 1 && decidir[0].body.decision === 'sale' && decidir[0].body.post_id === 581 && decidir[0].body.fecha_posteo === '2026-11-09');
    check('C6 tras decidir desde la lista se avanza al siguiente pendiente (detalle Café)', t.estado().vistaId === '84' && t.card.innerHTML.includes('Café Aroma') && t.card.innerHTML.includes('Volver a la revisión'));
  }
  {
    const t = makeCtx();
    await t.bind();
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'no_sale', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-09' }, '✕ No sale');
    const decidir = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('C7 un toque en el link «✕ No sale» de la lista decide "no_sale"', decidir.length === 1 && decidir[0].body.decision === 'no_sale');
  }
  {
    // Editar abre la caja de SU tarjeta (no la global) y el textarea no navega.
    const t = makeCtx();
    await t.bind();
    const box = { style: { display: 'none' } };
    const nota = { value: 'que no hable del precio' };
    const capTxt = fakeCapTxt(200, 67);
    const capMas = { style: { display: '' }, textContent: 'Ver más' };
    const cardEl = {
      getAttribute: () => null,
      querySelector: (sel) => (sel === '.cj-arreglo' ? box : (sel === '.cj-arreglo-nota' ? nota : (sel === '.cj-cap-txt' ? capTxt : (sel === '[data-cj="cap-mas"]' ? capMas : null)))),
    };
    await t.click({ 'data-cj': 'arreglar', 'data-user': '89' }, '✎ Editar', { '.card': cardEl });
    check('C8 «✎ Editar» abre la caja de SU tarjeta', box.style.display === 'block');
    check('C9 «✎ Editar» NO toca la caja global del detalle', t.els['#cjArreglo'].style.display === 'none');
    await t.click({ 'data-cj': 'decidir', 'data-decision': 'arreglar', 'data-user': '89', 'data-post': '581', 'data-fecha': '2026-11-09', 'data-nota': '1' }, 'Enviar arreglo', { '.card': cardEl });
    const decidir = t.server.calls.filter((c) => c.endpoint === 'support/conserje/revision/decidir');
    check('C10 «Enviar arreglo» manda la nota del textarea de SU tarjeta', decidir.length === 1 && decidir[0].body.decision === 'arreglar' && decidir[0].body.nota === 'que no hable del precio');
    // Clic en el textarea: no abre el detalle.
    const t2 = makeCtx();
    await t2.bind();
    const box2 = { style: { display: 'block' } };
    const cardVer = { getAttribute: (k) => (k === 'data-cj' ? 'ver' : null), querySelector: () => null };
    const ta = fakeEl({}, { '[data-cj]': cardVer, '.cj-arreglo': box2 });
    await t2.fire(ta);
    check('C11 un clic en el textarea de arreglo NO abre el detalle', t2.estado().vistaId === null || t2.estado().vistaId === undefined);
    // Ver más expande el caption de SU tarjeta, no el primero del documento.
    const t3 = makeCtx();
    await t3.bind();
    const capTxtCard = fakeCapTxt(200, 67);
    const cardEl3 = { getAttribute: () => null, querySelector: (sel) => (sel === '.cj-cap-txt' ? capTxtCard : null) };
    const btnMas = await t3.click({ 'data-cj': 'cap-mas' }, 'Ver más', { '.card': cardEl3 });
    check('C12 «Ver más» expande el caption de SU tarjeta', capTxtCard.classList.contains('cj-cap-full') && btnMas.textContent === 'Ver menos');
    check('C13 «Ver más» NO toca el primer caption del documento', !t3.capTxtGlobal.classList.contains('cj-cap-full'));
  }
  {
    // conserjeCapAjustar oculta el «Ver más» solo si el caption entra.
    const t = makeCtx();
    const txtCorto = fakeCapTxt(50, 67);
    const masCorto = { style: { display: '' } };
    const cardCorto = { querySelector: (sel) => (sel === '[data-cj="cap-mas"]' ? masCorto : null) };
    txtCorto.closest = () => cardCorto;
    const txtLargo = fakeCapTxt(200, 67);
    const masLargo = { style: { display: '' } };
    const cardLargo = { querySelector: (sel) => (sel === '[data-cj="cap-mas"]' ? masLargo : null) };
    txtLargo.closest = () => cardLargo;
    t.ctx.document.querySelectorAll = () => [txtCorto, txtLargo];
    t.html('conserjeCapAjustar()');
    check('C14 CapAjustar oculta «Ver más» si el caption entra (3 líneas)', masCorto.style.display === 'none');
    check('C15 CapAjustar deja «Ver más» si el caption no entra', masLargo.style.display === '');
  }
  // ---------- D) detalle intacto (v887) ----------
  {
    const t = makeCtx();
    const d = fixtureDatos();
    const det = t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[1]) + ',' + JSON.stringify(d) + ')');
    check('D1 detalle: mini 96 contain intacta', det.includes('width:96px;height:96px;object-fit:contain'));
    check('D2 detalle: caption completo con «Ver más»', det.includes('¿Cuántas veces te preguntaste') && det.includes('Ver más'));
    check('D3 detalle: botones a la par («Sale así» verde + «Editar»)', det.includes('✓ Sale así') && det.includes('background:#14743F') && det.includes('✎ Editar'));
    check('D4 detalle: «No sale» como link chico', det.includes('✕ No sale'));
    check('D5 detalle: ficha del cliente intacta', det.includes('Ficha de Café Aroma'));
    check('D6 detalle: botón chat intacto', det.includes('Ver el chat con Posty'));
    check('D7 detalle: tarjeta amarilla «Qué pasó» intacta', t.html('conserjeDetalleHTML(' + JSON.stringify(d.items[0]) + ',' + JSON.stringify(d) + ')').includes('Qué pasó'));
    check('D8 detalle: «Volver a la revisión» intacto', det.includes('Volver a la revisión'));
    check('D9 detalle: la foto grande 240px NO volvió', !det.includes('height:240px'));
  }
  // ---------- E) estampado ----------
  {
    check('E1 BUILD v967 ×1 en server.js, v965 ×0', cnt(SRV, "20261105-v967") === 1 && cnt(SRV, "20261105-v965") === 0);
    check('E2 CHUNK_V v967 ×1 en app.js, v890 ×0', cnt(APP, "20261105-v967") === 1 && cnt(APP, "20261105-v890") === 0);
    check('E3 el bump lleva su comentario (v967)', APP.includes('(v967) bump: chunk-conserje'));
    check('E4 app.js?v=668 ×1 en index ES', cnt(IDX, 'app.js?v=668') === 1);
    check('E5 styles?v=20261270 intacto ES + EN (styles.css no se toca)', cnt(IDX, 'styles.css?v=20261270') === 1 && cnt(IDX_EN, 'styles.css?v=20261270') === 1);
    check('E6 index EN sin app.js?v=', !IDX_EN.includes('app.js?v='));
    check('E7 chunk-conserje.js tiene 520 líneas', SRC.replace(/\n$/, '').split('\n').length === 520);
  }
  // ---------- F) auditoría data-cj + funciones (M78) ----------
  {
    const llamados = [...new Set([...SRC.matchAll(/\b(conserje[A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]))];
    const t = makeCtx();
    const faltan = llamados.filter((fn) => t.html('typeof ' + fn) === 'undefined');
    check('F1 toda función conserje* llamada existe definida (' + llamados.length + ')', faltan.length === 0, faltan.join(', '));
    const cjHtml = [...SRC.matchAll(/data-cj="([^"]+)"/g)].map((m) => m[1]);
    const cjAcciones = [...new Set(cjHtml)];
    const manejadas = cjAcciones.filter((a) => SRC.includes("acc === '" + a + "'"));
    check('F2 toda acción data-cj del HTML tiene rama en el handler (' + manejadas.length + '/' + cjAcciones.length + ')', manejadas.length === cjAcciones.length, cjAcciones.filter((a) => !manejadas.includes(a)).join(', '));
    check('F3 la rama cap-mas existe explícita', SRC.includes("acc === 'cap-mas'"));
    check('F4 conserjeCapAjustar se llama tras render de la lista', SRC.includes('card.innerHTML = html;\n  conserjeCapAjustar();'));
    check('F5 los globales de app.js que usa el chunk existen en el contexto', ['esc', 'pzIc', '$', 'loadChunk', 'adminToken', 'adminApi'].every((g) => t.html('typeof ' + g) !== 'undefined'));
    console.log(`M78 — funciones auditadas: ${llamados.length - faltan.length}/${llamados.length}`);
  }
  // ---------- G) censo de marcadores ajenos ----------
  {
    check('G1 needs_review 108 ocurrencias en server.js', cnt(SRV, 'needs_review') === 108);
    check('G2 railCobro ×4 en server.js', cnt(SRV, 'railCobro') === 4);
    check('G3 HEADLINE_POSESIVOS 5 ocurrencias en server.js', cnt(SRV, 'HEADLINE_POSESIVOS') === 5);
    check('G4 pzBoostEsMP ×24 en app.js', cnt(APP, 'pzBoostEsMP') === 24);
    check('G5 min(170px,44vw) ×2 en styles.css (v899 intacto)', cnt(fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8'), 'min(170px,44vw)') === 2);
    check('G6 noDna ×5 en app.js (v898 intacto)', cnt(APP, 'noDna') === 5);
    check('G7 frase del chat ×1 en app.js (v895 intacto)', cnt(APP, 'Te armé el posteo de hoy') === 1);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
