// venty-fundamento-auto.js — VENTY F1: fundamento automático desde lo publicado.
// Lección A1 (aprendizajes de Posty): cero preguntas al dueño. Cuando un
// negocio conecta su website y/o su Instagram, Venty extrae SOLO el
// fundamento de lo que el negocio ya publica: rubro, oferta (productos y
// servicios CON NOMBRE y precio si están publicados), tono y zona.
//
// Doctrina BAMBOO-CON-UN-CLIC: la lectura nace como BORRADOR en la Bandeja
// (jugada fundamento_auto) y solo se aplica si el dueño la acepta con un
// clic. Nunca pisa un fundamento ya aceptado: si ya hay aceptado, la
// lectura nueva nace como jugada fundamento_actualizacion con el diff.
// Si la lectura vuelve vacía o contradictoria entre fuentes (dos rubros
// candidatos, productos sin precio, zona ambigua), nace una jugada
// fundamento_duda armada desde ESE negocio: sus candidatas reales con los
// datos encontrados, nunca una plantilla genérica.
//
// Extractores REUSADOS (este módulo no duplica extracción):
// · web-extract.js fetchBusinessSite — lectura completa del sitio.
// · rubro-id.js classifyBusiness — rubro, candidatas y vara de duda.
// · onboarding-products.js detectProducts — oferta minada de bio/captions.
// · client-digest.js buildFromParts — puente business_dna/client_digest.
// · venty-web.js puenteDesdePosty — website_url y paleta ya guardadas.
// · venty.js — leerFundamento, validarVoz, registrarEvento; las jugadas
//   viven en venty_jugadas (mismo patrón de inserción que venty-instagram).
// Límite honesto: ig-profile.js (perfil por Graph) exige el token de la
// cuenta conectada; este lote no crea app de Meta ni pide credenciales,
// así que Instagram se lee de lo ya guardado (digest/dna/conexión) o de
// un perfil inyectado por el llamador (tests y refrescos futuros).
'use strict';

const TIPOS_JUGADA = ['fundamento_auto', 'fundamento_actualizacion', 'fundamento_duda'];

function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function norm(s) { return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }
function txt(v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n || 300); }
function safeJson(s, dflt) { try { return JSON.parse(s || ''); } catch (e) { return dflt; } }

// La voz de Venty manda también acá: sin signos de apertura, arranque en
// minúscula. Se limpia cualquier texto derivado de fuentes externas antes
// de que llegue a una jugada (las fuentes publican con su propia voz).
function vozVenty(s) {
  let t = String(s || '').replace(/[¿¡]/g, '').replace(/\s+/g, ' ').trim();
  if (t) t = t.charAt(0).toLowerCase() + t.slice(1);
  return t;
}

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_fundamento_auto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'borrador',
    tipo_jugada TEXT NOT NULL DEFAULT 'fundamento_auto',
    fundamento_json TEXT NOT NULL DEFAULT '{}',
    fuentes_json TEXT NOT NULL DEFAULT '[]',
    dudas_json TEXT NOT NULL DEFAULT '[]',
    diff_json TEXT NOT NULL DEFAULT '[]',
    jugada_id INTEGER,
    disparador TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_fauto_user ON venty_fundamento_auto(user_id, estado, id)');
  db.exec(`CREATE TABLE IF NOT EXISTS venty_fundamento_aceptado (
    user_id INTEGER PRIMARY KEY,
    fundamento_json TEXT NOT NULL DEFAULT '{}',
    lectura_id INTEGER,
    aceptado_at TEXT NOT NULL DEFAULT ''
  )`);
}

// ---------- normalización de oferta ----------
// Un ítem de oferta: { item, precio } con precio null si la fuente no lo
// publica. Se aceptan strings, {nombre|item, precio} y {nombre, price}.
function normalizarItem(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === 'string') { const n = txt(x, 120); return n ? { item: n, precio: null } : null; }
  const n = txt(x.item || x.nombre || x.name || '', 120);
  if (!n) return null;
  let p = x.precio !== undefined ? x.precio : (x.price !== undefined ? x.price : null);
  if (typeof p === 'string') { const d = Number(p.replace(/[^0-9.]/g, '')); p = Number.isFinite(d) && d > 0 ? d : null; }
  p = (typeof p === 'number' && Number.isFinite(p) && p > 0) ? Math.round(p) : null;
  return { item: n, precio: p };
}
function normalizarOferta(lista, cap) {
  const out = []; const seen = new Set();
  for (const x of (Array.isArray(lista) ? lista : [])) {
    const it = normalizarItem(x);
    if (!it) continue;
    const k = norm(it.item);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(it);
    if (out.length >= (cap || 12)) break;
  }
  return out;
}
function fusionarOfertas(listas) {
  const map = new Map(); const conflictos = [];
  for (const lista of (listas || [])) {
    for (const it of (lista || [])) {
      const k = norm(it.item);
      if (!k) continue;
      const prev = map.get(k);
      if (!prev) { map.set(k, { item: it.item, precio: it.precio }); continue; }
      if (prev.precio === null && it.precio !== null) prev.precio = it.precio;
      else if (prev.precio !== null && it.precio !== null && prev.precio !== it.precio) {
        conflictos.push({ tipo: 'precio', item: prev.item, precios: [prev.precio, it.precio] });
      }
    }
  }
  return { oferta: [...map.values()].slice(0, 12), conflictos };
}

// ---------- extracción por fuente (sobre extractores existentes) ----------
// Web: sitio = salida de web-extract.fetchBusinessSite (inyectable).
function extraerDesdeWeb(sitio) {
  if (!sitio || sitio.ok === false) return null;
  const cruda = [];
  if (Array.isArray(sitio.precios)) cruda.push(...sitio.precios);
  if (Array.isArray(sitio.productos)) cruda.push(...sitio.productos);
  if (Array.isArray(sitio.items)) cruda.push(...sitio.items);
  if (Array.isArray(sitio.services)) cruda.push(...sitio.services);
  if (Array.isArray(sitio.servicios)) cruda.push(...sitio.servicios);
  const oferta = normalizarOferta(cruda, 12);
  const tonoWeb = (sitio.facts && sitio.facts.tone) || sitio.tono || '';
  return {
    fuente: 'web',
    nombre: txt(sitio.name || sitio.nombre, 80),
    descripcion: txt(sitio.description || sitio.descripcion, 300),
    categoryHint: txt(sitio.categoryHint, 80),
    oferta,
    ciudad: txt(sitio.city || sitio.ciudad, 80),
    zona: txt(sitio.zona, 80),
    direccion: txt(sitio.address || (sitio.facts && sitio.facts.address), 120),
    tonoClave: tonoWeb === 'vos' ? 'vos' : (tonoWeb === 'usted' ? 'usted' : ''),
    tono: txt(sitio.tono && sitio.tono !== 'vos' && sitio.tono !== 'usted' ? sitio.tono : '', 200),
    paleta: Array.isArray(sitio.palette) ? sitio.palette.slice(0, 2) : (Array.isArray(sitio.paleta) ? sitio.paleta.slice(0, 2) : []),
    website_url: txt(sitio.url || sitio.website_url, 500),
  };
}

// Instagram: perfil = { handle, username, bio, biography, name, category,
// captions[], productos[], servicios[], ciudad, zona, tono } — viene de lo
// guardado (digest/dna) o inyectado por el llamador.
function extraerDesdeInstagram(perfil, opts) {
  if (!perfil || typeof perfil !== 'object') return null;
  const bio = txt(perfil.bio || perfil.biography, 500);
  const captions = Array.isArray(perfil.captions) ? perfil.captions.map((c) => txt(c, 500)).filter(Boolean).slice(0, 20) : [];
  let cruda = [];
  if (Array.isArray(perfil.productos)) cruda.push(...perfil.productos);
  if (Array.isArray(perfil.servicios)) cruda.push(...perfil.servicios);
  if (Array.isArray(perfil.oferta)) cruda.push(...perfil.oferta);
  let oferta = normalizarOferta(cruda, 12);
  if (!oferta.length && (bio || captions.length)) {
    try {
      const det = (opts && opts.detectProducts) || require('./onboarding-products').detectProducts;
      const names = det({ bio, captions, services: [], description: '', excludeNames: [perfil.name || '', perfil.handle || perfil.username || ''] }) || [];
      oferta = normalizarOferta(names, 12);
    } catch (e) { /* el minado nunca rompe la lectura */ }
  }
  const handle = txt(perfil.handle || perfil.username, 120).replace(/^@/, '');
  if (!bio && !captions.length && !oferta.length && !handle && !perfil.category && !perfil.igCategory) return null;
  return {
    fuente: 'instagram',
    nombre: txt(perfil.name || perfil.fullName, 80),
    descripcion: bio,
    bio, captions,
    handle,
    categoryHint: '',
    igCategory: txt(perfil.category || perfil.igCategory, 120),
    oferta,
    ciudad: txt(perfil.ciudad || perfil.city, 80),
    zona: txt(perfil.zona, 80),
    direccion: '',
    tonoClave: /(queres|tenes|podes|veni|contanos|escribinos)/i.test(norm(bio + ' ' + captions.join(' '))) ? 'vos' : '',
    tono: txt(perfil.tono, 200),
    paleta: [],
    website_url: '',
  };
}

// Puente Posty: filas business_dna / client_digest ya guardadas + el
// puente chico de venty-web (website_url/paleta). Solo lectura.
function leerPuentePosty(db, userId, opts) {
  const out = { dna: null, digest: null, website_url: '', paleta: [] };
  try {
    const vw = (opts && opts.ventyWeb) || require('./venty-web');
    const p = vw.puenteDesdePosty(db, userId);
    out.website_url = p.website_url || ''; out.paleta = p.paleta || [];
  } catch (e) { /* sin puente: se sigue */ }
  try {
    const r = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(userId);
    if (r && r.dna_json) out.dna = safeJson(r.dna_json, null);
  } catch (e) { /* tabla de Posty ausente en este contexto */ }
  try {
    const r = db.prepare('SELECT digest_json FROM client_digest WHERE user_id = ?').get(userId);
    if (r && r.digest_json) out.digest = safeJson(r.digest_json, null);
  } catch (e) { /* idem */ }
  return out;
}

// Digest compilado con buildFromParts (reuso): productos/servicios con
// fuente, ciudad y categoría desde las partes disponibles.
function extraerDesdePuente(db, userId, partes, opts) {
  const puente = partes || leerPuentePosty(db, userId, opts);
  const dna = puente.dna; const dig = puente.digest;
  if (!dna && !dig) return { parcial: null, puente };
  let compilado = null;
  try {
    const cd = (opts && opts.clientDigest) || require('./client-digest');
    compilado = cd.buildFromParts({
      business: (dig && dig.business) || (dna && (dna.business_name || dna.nombre)) || '',
      web: (opts && opts.webParaDigest) || null,
      feed: (opts && opts.feedParaDigest) || null,
      dna: dna || null,
    });
  } catch (e) { compilado = null; }
  const cruda = [];
  const pushAll = (l) => { if (Array.isArray(l)) cruda.push(...l); };
  if (compilado) { pushAll(compilado.productos); pushAll(compilado.servicios); }
  if (dig) { pushAll(dig.productos); pushAll(dig.servicios); }
  if (dna) {
    pushAll(dna.productos); pushAll(dna.servicios);
    if (dna.producto_estrella) cruda.push({ nombre: dna.producto_estrella });
    if (dna.estrella) cruda.push({ nombre: dna.estrella });
  }
  const oferta = normalizarOferta(cruda, 12);
  const parcial = {
    fuente: 'digest',
    nombre: txt((compilado && compilado.business) || (dig && dig.business) || (dna && (dna.business_name || dna.nombre)), 80),
    descripcion: txt((dna && (dna.descripcion || dna.description)) || (dig && dig.descripcion), 300),
    categoryHint: '',
    igCategory: '',
    oferta,
    ciudad: txt((compilado && compilado.ciudad) || (dig && dig.ciudad) || (dna && (dna.ubicacion || dna.ciudad)), 80),
    zona: txt((dig && dig.zona) || (dna && dna.zona), 80),
    direccion: '',
    tonoClave: '',
    tono: txt((dna && dna.tono) || (dig && dig.tono), 200),
    paleta: puente.paleta || [],
    website_url: puente.website_url || txt((dna && (dna.website_url || dna.website)), 500),
    rubroDirecto: txt((compilado && compilado.category) || (dig && (dig.category || dig.rubro)) || (dna && dna.rubro), 80),
    estrellaDirecta: txt((compilado && compilado.producto_estrella) || (dig && dig.producto_estrella) || (dna && dna.producto_estrella), 120),
  };
  if (!parcial.oferta.length && !parcial.ciudad && !parcial.rubroDirecto && !parcial.nombre && !parcial.website_url) return { parcial: null, puente };
  return { parcial, puente };
}

// Perfil de Instagram desde lo guardado: digest (bio/captions/handle),
// dna (handle/productos) y la conexión instagram (etiqueta = handle).
function perfilInstagramGuardado(db, userId, puente, opts) {
  const p = puente || leerPuentePosty(db, userId, opts);
  const dig = p.digest || {}; const dna = p.dna || {};
  let handle = txt(dig.handle || dig.username || dna.instagram || dna.ig_handle || dna.handle, 120);
  let etiqueta = '';
  try {
    const conexiones = (opts && opts.conexiones) || require('./venty-conexiones');
    const c = conexiones.estadoCanal(db, userId, 'instagram');
    if (c) { etiqueta = txt(c.etiqueta, 120); if (!handle && etiqueta.startsWith('@')) handle = etiqueta; }
  } catch (e) { /* sin conexión registrada */ }
  const feed = dig.feed || dig.instagram || {};
  const perfil = {
    handle,
    name: txt(dig.business || dna.business_name || dna.nombre, 80),
    bio: txt(feed.bio || dig.bio || dna.bio || dna.biografia, 500),
    category: txt(feed.category || dig.ig_category || dna.ig_category, 120),
    captions: Array.isArray(feed.captions) ? feed.captions : (Array.isArray(dig.captions) ? dig.captions : []),
    productos: [...(Array.isArray(dig.productos) ? dig.productos : []), ...(Array.isArray(dna.productos) ? dna.productos : [])],
    servicios: [...(Array.isArray(dig.servicios) ? dig.servicios : []), ...(Array.isArray(dna.servicios) ? dna.servicios : [])],
    ciudad: txt(dig.ciudad || dna.ubicacion || dna.ciudad, 80),
    zona: txt(dig.zona || dna.zona, 80),
    tono: txt(dna.tono || dig.tono, 200),
  };
  if (!perfil.bio && !perfil.captions.length && !perfil.productos.length && !perfil.servicios.length && !perfil.handle && !perfil.category) return null;
  return perfil;
}

// ---------- fusión y dudas ----------
function tonoDesdeClave(clave) {
  if (clave === 'vos') return 'cercano, con voseo rioplatense con medida';
  if (clave === 'usted') return 'formal, de usted, con medida';
  return '';
}

function fusionar(parciales, opts) {
  const fuentes = (parciales || []).filter(Boolean);
  const dudas = [];
  const web = fuentes.find((f) => f.fuente === 'web');
  const ig = fuentes.find((f) => f.fuente === 'instagram');
  const dig = fuentes.find((f) => f.fuente === 'digest');

  // Rubro: vara de rubro-id sobre TODAS las señales (reuso completo).
  let rubro = ''; let rubroInfo = null;
  try {
    const rubroId = (opts && opts.rubroId) || require('./rubro-id');
    rubroInfo = rubroId.classifyBusiness({
      jsonldType: (web && web.categoryHint) || '',
      catalogText: fuentes.flatMap((f) => (f.oferta || []).map((i) => i.item)).join(' · '),
      webText: [web && web.nombre, web && web.descripcion].filter(Boolean).join(' '),
      bio: (ig && ig.bio) || '',
      fullName: (ig && ig.nombre) || '',
      handle: (ig && ig.handle) || '',
      captions: (ig && ig.captions) || [],
      igCategory: (ig && ig.igCategory) || '',
      formText: '',
    });
  } catch (e) { rubroInfo = null; }
  // Contradicción ENTRE fuentes: cada fuente clasificada por separado
  // con la misma vara; si web e instagram cierran rubros distintos, es
  // duda aunque el voto global tenga un ganador (nadie gana por suma
  // cuando las fuentes del propio negocio se contradicen).
  let conflictoFuentes = false;
  if (rubroInfo && web && ig) {
    try {
      const rubroId2 = (opts && opts.rubroId) || require('./rubro-id');
      const cw = rubroId2.classifyBusiness({ jsonldType: web.categoryHint || '', catalogText: (web.oferta || []).map((i) => i.item).join(' · '), webText: [web.nombre, web.descripcion].filter(Boolean).join(' ') });
      const ci = rubroId2.classifyBusiness({ bio: ig.bio || '', fullName: ig.nombre || '', handle: ig.handle || '', captions: ig.captions || [], igCategory: ig.igCategory || '' });
      const topW = (cw.candidatas || [])[0]; const topI = (ci.candidatas || [])[0];
      if (topW && topI && topW.rubro !== topI.rubro && topW.score >= 6 && topI.score >= 6) {
        dudas.unshift({ tipo: 'rubro_fuentes', candidatas: [{ rubro: topW.rubro, origen: 'web', score: topW.score }, { rubro: topI.rubro, origen: 'instagram', score: topI.score }], nota: 'la web y el instagram publicados dicen rubros distintos' });
        if (rubroInfo) rubroInfo = { ...rubroInfo, segura: false };
        conflictoFuentes = true;
      }
    } catch (e) { /* la comparación nunca rompe la lectura */ }
  }
  const directo = (dig && dig.rubroDirecto) || '';
  if (conflictoFuentes) rubro = '';
  else if (rubroInfo && rubroInfo.segura && rubroInfo.rubro && rubroInfo.rubro !== 'otro') rubro = rubroInfo.rubro;
  else if (directo) rubro = directo;
  else if (rubroInfo && rubroInfo.rubro && rubroInfo.rubro !== 'otro') rubro = rubroInfo.rubro;
  const candidatas = (rubroInfo && Array.isArray(rubroInfo.candidatas)) ? rubroInfo.candidatas.slice(0, 3) : [];
  if (rubroInfo && !rubroInfo.segura && candidatas.length >= 2) {
    dudas.push({ tipo: 'rubro', candidatas, nota: 'las fuentes no cierran un solo rubro' });
  } else if (!rubro) {
    dudas.push({ tipo: 'rubro', candidatas, nota: 'ninguna fuente declara un rubro reconocible' });
  }
  if (directo && rubroInfo && rubroInfo.rubro && rubroInfo.rubro !== 'otro' && norm(directo) !== norm(rubroInfo.rubro) && rubroInfo.segura) {
    dudas.push({ tipo: 'rubro_fuentes', candidatas: [{ rubro: directo, origen: 'lo guardado' }, { rubro: rubroInfo.rubro, origen: 'lo publicado' }], nota: 'lo guardado y lo publicado dicen rubros distintos' });
    rubro = '';
  }

  // Oferta: fusión por nombre; precio solo si alguna fuente lo publica.
  const { oferta, conflictos } = fusionarOfertas(fuentes.map((f) => f.oferta || []));
  for (const c of conflictos) dudas.push({ tipo: 'precio', item: c.item, precios: c.precios, nota: 'el mismo producto aparece con dos precios publicados' });
  if (!oferta.length) dudas.push({ tipo: 'oferta_vacia', candidatas: [], nota: 'ninguna fuente publica productos o servicios con nombre' });
  else if (oferta.every((i) => i.precio === null)) {
    dudas.push({ tipo: 'productos_sin_precio', items: oferta.map((i) => i.item), nota: 'la oferta tiene nombre pero ninguna fuente publica precios' });
  }

  // Zona: ciudad/zona de cada fuente; dos valores distintos = ambigua.
  const zonas = [];
  for (const f of fuentes) {
    const z = f.zona || f.ciudad || '';
    if (z && !zonas.some((x) => norm(x) === norm(z))) zonas.push(z);
  }
  let zona = zonas[0] || ''; let ciudad = '';
  for (const f of fuentes) { if (f.ciudad) { ciudad = f.ciudad; break; } }
  if (!ciudad) ciudad = zona;
  if (zonas.length >= 2) { dudas.push({ tipo: 'zona_ambigua', candidatas: zonas, nota: 'las fuentes publican zonas distintas' }); zona = ''; }

  // Tono: clave de la web (facts de web-extract) y del feed; conflicto = duda.
  const claves = [...new Set(fuentes.map((f) => f.tonoClave).filter(Boolean))];
  let tono = '';
  for (const f of fuentes) { if (f.tono) { tono = f.tono; break; } }
  if (!tono && claves.length === 1) tono = tonoDesdeClave(claves[0]);
  if (claves.length >= 2) dudas.push({ tipo: 'tono', candidatas: claves, nota: 'la web y el instagram hablan con tonos distintos' });

  const estrella = (dig && dig.estrellaDirecta) || (oferta.find((i) => i.precio !== null) || oferta[0] || {}).item || '';
  const paleta = [];
  for (const f of fuentes) { if (Array.isArray(f.paleta) && f.paleta.length) { paleta.push(...f.paleta.slice(0, 2)); break; } }
  const fundamento = {
    rubro,
    modo: rubro,
    estrella,
    precios: oferta.map((i) => ({ item: i.item, precio: i.precio })),
    oferta_sin_precio: oferta.filter((i) => i.precio === null).map((i) => i.item),
    tono,
    ciudad,
    zona,
    website_url: (web && web.website_url) || (dig && dig.website_url) || '',
    paleta: paleta.map((p) => (typeof p === 'string' ? { hex: String(p).toUpperCase(), rol: '' } : { hex: String(p.hex || '').toUpperCase(), rol: p.rol || '' })).filter((p) => /^#[0-9A-F]{6}$/.test(p.hex)).slice(0, 2),
    nombre_negocio: (web && web.nombre) || (ig && ig.nombre) || (dig && dig.nombre) || '',
    fuentes: fuentes.map((f) => f.fuente),
  };
  const vacia = !fundamento.rubro && !oferta.length && !fundamento.ciudad && !fundamento.zona && !fundamento.tono;
  if (vacia && !dudas.some((d) => d.tipo === 'lectura_vacia')) {
    dudas.unshift({ tipo: 'lectura_vacia', candidatas: candidatas.map((c) => c.rubro), nota: 'la lectura volvió vacía: ninguna fuente trajo rubro, oferta ni zona' });
  }
  return { fundamento, dudas, rubroInfo, vacia };
}

// ---------- diff contra el fundamento aceptado ----------
function diffFundamentos(antes, despues) {
  const a = antes || {}; const b = despues || {};
  const diff = [];
  const cmp = (campo, va, vb) => { if (norm(va) !== norm(vb)) diff.push({ campo, antes: va || '', despues: vb || '' }); };
  cmp('rubro', a.rubro, b.rubro);
  cmp('estrella', a.estrella, b.estrella);
  cmp('tono', a.tono, b.tono);
  cmp('ciudad', a.ciudad, b.ciudad);
  cmp('zona', a.zona, b.zona);
  cmp('website_url', a.website_url, b.website_url);
  const pa = new Map((a.precios || []).map((p) => [norm(p.item), p]));
  const pb = new Map((b.precios || []).map((p) => [norm(p.item), p]));
  for (const [k, p] of pb) {
    if (!pa.has(k)) diff.push({ campo: 'oferta_nueva', item: p.item, precio: p.precio });
    else if ((pa.get(k).precio ?? null) !== (p.precio ?? null)) diff.push({ campo: 'precio', item: p.item, antes: pa.get(k).precio ?? null, despues: p.precio ?? null });
  }
  for (const [k, p] of pa) { if (!pb.has(k)) diff.push({ campo: 'oferta_que_sale', item: p.item, precio: p.precio }); }
  return diff;
}

// ---------- aceptado ----------
function leerAceptado(db, userId) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM venty_fundamento_aceptado WHERE user_id = ?').get(userId);
  if (!r) return null;
  return { fundamento: safeJson(r.fundamento_json, {}), lectura_id: r.lectura_id, aceptado_at: r.aceptado_at };
}
function hayAceptado(db, userId) { return !!leerAceptado(db, userId); }

// Escribe el fundamento aceptado en venty_fundamento (conserva políticas,
// límites, derechos y objeciones que ya tenga el negocio) y el snapshot.
function aplicarFundamento(db, userId, fundamento, lecturaId, opts) {
  ensureSchema(db);
  const venty = (opts && opts.venty) || require('./venty');
  const actual = venty.leerFundamento(db, userId);
  const precios = (fundamento.precios || []).filter((p) => p && p.item && p.precio !== null && p.precio !== undefined)
    .map((p) => ({ item: String(p.item).slice(0, 120), precio: Number(p.precio) }));
  // Sin precio publicado no entra a la lista que cotiza: queda registrado
  // en la lectura, pero venty.js solo cotiza desde precios con número.
  const ahora = ahoraIso();
  const fila = {
    rubro: txt(fundamento.rubro, 80), modo: txt(fundamento.modo || fundamento.rubro, 80),
    estrella: txt(fundamento.estrella, 120), tono: txt(fundamento.tono, 300),
    ciudad: txt(fundamento.ciudad, 80), website_url: txt(fundamento.website_url, 500),
  };
  if (actual) {
    db.prepare(`UPDATE venty_fundamento SET rubro=?, modo=?, estrella=?, precios_json=?, tono=?, ciudad=?, website_url=?, paleta_json=?, version=version+1, updated_at=? WHERE user_id=?`)
      .run(fila.rubro || actual.rubro || '', fila.modo || actual.modo || '', fila.estrella || actual.estrella || '',
        precios.length ? JSON.stringify(precios) : (actual.precios_json || '[]'),
        fila.tono || actual.tono || '', fila.ciudad || actual.ciudad || '', fila.website_url || actual.website_url || '',
        fundamento.paleta && fundamento.paleta.length ? JSON.stringify(fundamento.paleta) : (actual.paleta_json || '[]'),
        ahora, userId);
  } else {
    db.prepare(`INSERT INTO venty_fundamento (user_id, rubro, modo, estrella, precios_json, politicas_json, limites_json, tono, derechos_json, objeciones_json, website_url, ciudad, paleta_json, version, updated_at)
      VALUES (?,?,?,?,?,'{}','{}',?,'{}','[]',?,?,?,1,?)`)
      .run(userId, fila.rubro, fila.modo, fila.estrella, JSON.stringify(precios), fila.tono, fila.website_url, fila.ciudad, JSON.stringify(fundamento.paleta || []), ahora);
  }
  db.prepare(`INSERT INTO venty_fundamento_aceptado (user_id, fundamento_json, lectura_id, aceptado_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET fundamento_json=excluded.fundamento_json, lectura_id=excluded.lectura_id, aceptado_at=excluded.aceptado_at`)
    .run(userId, JSON.stringify(fundamento), lecturaId || null, ahora);
  return venty.leerFundamento(db, userId);
}

// ---------- jugadas de Bandeja ----------
function textoJugada(tipo, fundamento, dudas, diff) {
  const nombre = fundamento.nombre_negocio || 'tu negocio';
  if (tipo === 'fundamento_duda') {
    const d = (dudas || [])[0] || {};
    if ((d.tipo === 'rubro' || d.tipo === 'rubro_fuentes') && (d.candidatas || []).length >= 2) {
      return vozVenty(`armé el fundamento de ${nombre} desde lo publicado, pero el rubro no cierra: las candidatas reales son ${d.candidatas.map((c) => c.rubro).join(' y ')}. elegí cuál va y sigo con esa.`);
    }
    if (d.tipo === 'zona_ambigua') return vozVenty(`armé el fundamento de ${nombre}, pero las fuentes publican zonas distintas: ${(d.candidatas || []).join(' y ')}. decime cuál es la zona de venta y lo dejo firme.`);
    if (d.tipo === 'productos_sin_precio') return vozVenty(`encontré la oferta de ${nombre} con nombre (${(d.items || []).slice(0, 4).join(', ')}), pero ninguna fuente publica precios. cargá los precios y venty cotiza solo desde esa lista.`);
    if (d.tipo === 'lectura_vacia' || d.tipo === 'oferta_vacia') return vozVenty(`conecté las fuentes de ${nombre} y la lectura volvió vacía: no apareció rubro, oferta ni zona en lo publicado. revisá que el sitio y el instagram sean los del negocio.`);
    if (d.tipo === 'precio') return vozVenty(`el producto ${d.item} aparece con dos precios publicados en ${nombre}. decime cuál es el que va y lo dejo firme en la lista.`);
    return vozVenty(`armé el fundamento de ${nombre} desde lo publicado, pero quedó una duda: ${d.nota || 'falta un dato'}. lo revisás en la jugada y seguimos.`);
  }
  if (tipo === 'fundamento_actualizacion') {
    const cambios = (diff || []).slice(0, 3).map((x) => x.campo === 'precio' || x.campo === 'oferta_nueva' ? `${x.item}` : `${x.campo}: ${x.despues}`).join(' · ');
    return vozVenty(`volví a leer lo publicado de ${nombre} y hay cambios contra tu fundamento aceptado: ${cambios || 'cambios en la oferta'}. tu fundamento actual no se tocó: aceptá la jugada si querés aplicarlos.`);
  }
  const estrella = fundamento.estrella ? ` con ${fundamento.estrella} como producto estrella` : '';
  return vozVenty(`armé el fundamento de ${nombre} desde lo publicado: rubro ${fundamento.rubro || 'sin cerrar'}, ${(fundamento.precios || []).length} productos con nombre${estrella}. aceptalo con un clic y venty vende desde ahí.`);
}

function crearJugada(db, userId, tipo, propuesta, porque, opts) {
  const venty = (opts && opts.venty) || require('./venty');
  const limpio = vozVenty(porque);
  const voz = venty.validarVoz ? venty.validarVoz(limpio) : { ok: true };
  const textoFinal = voz.ok ? limpio : limpio.replace(/[¿¡]/g, '');
  const r = db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?, ?, ?, 'pendiente')`)
    .run(userId, null, tipo, JSON.stringify(propuesta), textoFinal);
  const id = Number(r.lastInsertRowid);
  try { venty.registrarEvento(db, userId, 'fundamento_auto_jugada', null, { tipo, jugada_id: id }); } catch (e) {}
  return id;
}

// ---------- lectura principal ----------
// opts: { sitio, perfilInstagram, instagram, fetchBusinessSite, websiteUrl,
//         disparador, venty, conexiones, rubroId, detectProducts,
//         clientDigest, ventyWeb, soloSiHayDatos }
async function leerFundamentoAuto(db, userId, opts) {
  const o = opts || {};
  ensureSchema(db);
  const venty = o.venty || require('./venty');
  const parciales = [];
  const puente = leerPuentePosty(db, userId, o);

  // Fuente web: payload inyectado, o fetch real del sitio conectado.
  let sitio = o.sitio || null;
  let webParaDigest = null;
  if (!sitio && o.saltarRed !== true) {
    const url = txt(o.websiteUrl || (venty.leerFundamento(db, userId) || {}).website_url || puente.website_url, 500);
    if (url) {
      const fetchBusinessSite = o.fetchBusinessSite || require('./web-extract').fetchBusinessSite;
      try { sitio = await fetchBusinessSite(url); } catch (e) { sitio = null; }
    }
  }
  if (sitio) { const p = extraerDesdeWeb(sitio); if (p) { parciales.push(p); webParaDigest = sitio; } }

  // Fuente Instagram: perfil inyectado, o lo guardado (digest/dna/conexión).
  let perfil = o.perfilInstagram || o.instagram || null;
  if (!perfil) perfil = perfilInstagramGuardado(db, userId, puente, o);
  if (perfil) { const p = extraerDesdeInstagram(perfil, o); if (p) parciales.push(p); }

  // Puente digest/dna compilado (oferta con precio, ciudad, rubro guardado).
  const { parcial: parcialDigest } = extraerDesdePuente(db, userId, puente, { ...o, webParaDigest });
  if (parcialDigest) parciales.push(parcialDigest);

  if (!parciales.length && o.soloSiHayDatos) return { ok: false, error: 'sin_datos_para_leer', omitida: true };
  const { fundamento, dudas, vacia } = fusionar(parciales, o);

  const aceptado = leerAceptado(db, userId);
  let tipo = 'fundamento_auto'; let diff = [];
  if (dudas.length) tipo = 'fundamento_duda';
  else if (aceptado) { diff = diffFundamentos(aceptado.fundamento, fundamento); tipo = 'fundamento_actualizacion'; }

  // Dedupe: misma lectura pendiente (mismo fundamento y mismas dudas) no
  // duplica la jugada en la Bandeja.
  const fundJson = JSON.stringify(fundamento); const dudasJson = JSON.stringify(dudas);
  const previa = db.prepare(`SELECT * FROM venty_fundamento_auto WHERE user_id = ? AND estado = 'borrador' ORDER BY id DESC LIMIT 1`).get(userId);
  if (previa && previa.fundamento_json === fundJson && previa.dudas_json === dudasJson && previa.tipo_jugada === tipo) {
    return { ok: true, duplicada: true, lectura_id: previa.id, jugada_id: previa.jugada_id, tipo_jugada: tipo, fundamento, dudas, diff: safeJson(previa.diff_json, []) };
  }

  const ahora = ahoraIso();
  const ins = db.prepare(`INSERT INTO venty_fundamento_auto (user_id, estado, tipo_jugada, fundamento_json, fuentes_json, dudas_json, diff_json, disparador, created_at, updated_at)
    VALUES (?, 'borrador', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, tipo, fundJson, JSON.stringify(parciales.map((p) => p.fuente)), dudasJson, JSON.stringify(diff), txt(o.disparador, 40), ahora, ahora);
  const lecturaId = Number(ins.lastInsertRowid);
  const propuesta = { que: tipo === 'fundamento_duda' ? 'resolver la duda del fundamento' : (tipo === 'fundamento_actualizacion' ? 'actualizar el fundamento desde lo publicado' : 'aceptar el fundamento armado desde lo publicado'), lectura_id: lecturaId, fundamento, dudas, diff, fuentes: parciales.map((p) => p.fuente) };
  const jugadaId = crearJugada(db, userId, tipo, propuesta, textoJugada(tipo, fundamento, dudas, diff), o);
  db.prepare('UPDATE venty_fundamento_auto SET jugada_id = ? WHERE id = ?').run(jugadaId, lecturaId);
  try { venty.registrarEvento(db, userId, 'fundamento_auto_leido', null, { lectura_id: lecturaId, tipo, vacia, fuentes: propuesta.fuentes }); } catch (e) {}
  return { ok: true, lectura_id: lecturaId, jugada_id: jugadaId, tipo_jugada: tipo, fundamento, dudas, diff, vacia };
}

// Disparador al conectar/actualizar una fuente. canal: 'web' | 'instagram'.
// Nunca lanza: un fallo de lectura no rompe la conexión que lo disparó.
async function alConectarFuente(db, userId, canal, opts) {
  const o = opts || {};
  try {
    if (canal !== 'web' && canal !== 'instagram') return { ok: false, error: 'canal_sin_lectura' };
    return await leerFundamentoAuto(db, userId, { ...o, disparador: 'conexion_' + canal });
  } catch (e) { return { ok: false, error: String((e && e.message) || 'lectura_fallo') }; }
}

// ---------- aceptación / rechazo (Bandeja y rutas propias) ----------
function leerLectura(db, userId, lecturaId) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM venty_fundamento_auto WHERE id = ? AND user_id = ?').get(Number(lecturaId || 0), userId);
  if (!r) return null;
  return { ...r, fundamento: safeJson(r.fundamento_json, {}), dudas: safeJson(r.dudas_json, []), diff: safeJson(r.diff_json, []), fuentes: safeJson(r.fuentes_json, []) };
}

function aceptarLectura(db, userId, lecturaId, opts) {
  const o = opts || {};
  const lec = leerLectura(db, userId, lecturaId);
  if (!lec) return { ok: false, error: 'lectura_no_encontrada' };
  if (lec.estado === 'aceptado') return { ok: true, estado: 'aceptado', duplicada: true };
  if (lec.estado !== 'borrador') return { ok: false, error: 'lectura_no_pendiente', estado: lec.estado };
  if (lec.tipo_jugada === 'fundamento_duda' && !o.confirmarConDudas) {
    return { ok: false, error: 'lectura_con_dudas', dudas: lec.dudas };
  }
  const aplicado = aplicarFundamento(db, userId, lec.fundamento, lec.id, o);
  const ahora = ahoraIso();
  db.prepare(`UPDATE venty_fundamento_auto SET estado='aceptado', updated_at=? WHERE id=?`).run(ahora, lec.id);
  if (lec.jugada_id) db.prepare(`UPDATE venty_jugadas SET estado='aceptada', resuelto_at=?, resuelto_por='dueno' WHERE id=? AND estado='pendiente'`).run(ahora, lec.jugada_id);
  try { (o.venty || require('./venty')).registrarEvento(db, userId, 'fundamento_auto_aceptado', null, { lectura_id: lec.id }); } catch (e) {}
  return { ok: true, estado: 'aceptado', fundamento: aplicado };
}

function rechazarLectura(db, userId, lecturaId, nota, opts) {
  const lec = leerLectura(db, userId, lecturaId);
  if (!lec) return { ok: false, error: 'lectura_no_encontrada' };
  if (lec.estado !== 'borrador') return { ok: false, error: 'lectura_no_pendiente', estado: lec.estado };
  const ahora = ahoraIso();
  db.prepare(`UPDATE venty_fundamento_auto SET estado='descartado', updated_at=? WHERE id=?`).run(ahora, lec.id);
  if (lec.jugada_id) db.prepare(`UPDATE venty_jugadas SET estado='rechazada', resuelto_at=?, resuelto_por='dueno', nota_dueno=? WHERE id=? AND estado='pendiente'`).run(ahora, txt(nota, 300), lec.jugada_id);
  try { ((opts && opts.venty) || require('./venty')).registrarEvento(db, userId, 'fundamento_auto_rechazado', null, { lectura_id: lec.id }); } catch (e) {}
  return { ok: true, estado: 'descartado' };
}

// Delegación desde venty.resolverJugada para los tipos fundamento_*:
// aceptar aplica el borrador (o pide confirmación si hay dudas, devolviendo
// lectura_con_dudas para que la ruta propia confirme), rechazar descarta
// la lectura y cambio deja constancia sin aplicar nada.
function resolverJugadaFundamento(db, userId, jugadaId, accion, nota, opts) {
  ensureSchema(db);
  const j = db.prepare('SELECT * FROM venty_jugadas WHERE id = ? AND user_id = ?').get(Number(jugadaId || 0), userId);
  if (!j) return { ok: false, kind: 'jugada_no_encontrada' };
  if (!TIPOS_JUGADA.includes(j.tipo)) return { ok: false, kind: 'jugada_no_fundamento' };
  if (j.estado !== 'pendiente') return { ok: false, kind: 'jugada_ya_resuelta', estado: j.estado };
  const propuesta = safeJson(j.propuesta_json, {});
  const lecturaId = Number(propuesta.lectura_id || 0);
  if (accion === 'aceptar') {
    const r = aceptarLectura(db, userId, lecturaId, opts);
    if (!r.ok) return { ok: false, kind: r.error, dudas: r.dudas || [] };
    return { ok: true, estado: 'aceptada', lectura_id: lecturaId };
  }
  if (accion === 'rechazar') {
    const r = rechazarLectura(db, userId, lecturaId, nota, opts);
    if (!r.ok) return { ok: false, kind: r.error };
    return { ok: true, estado: 'rechazada', lectura_id: lecturaId };
  }
  if (accion === 'cambio') {
    const ahora = ahoraIso();
    db.prepare(`UPDATE venty_jugadas SET estado='cambio_pedido', resuelto_at=?, resuelto_por='dueno', nota_dueno=? WHERE id=?`).run(ahora, txt(nota, 500), j.id);
    try { ((opts && opts.venty) || require('./venty')).registrarEvento(db, userId, 'fundamento_auto_cambio', null, { lectura_id: lecturaId, nota: txt(nota, 500) }); } catch (e) {}
    return { ok: true, estado: 'cambio_pedido', lectura_id: lecturaId };
  }
  return { ok: false, kind: 'accion_invalida' };
}

function estadoFundamentoAuto(db, userId) {
  ensureSchema(db);
  const aceptado = leerAceptado(db, userId);
  const borradores = db.prepare(`SELECT * FROM venty_fundamento_auto WHERE user_id = ? AND estado = 'borrador' ORDER BY id DESC`).all(userId)
    .map((r) => ({ id: r.id, tipo_jugada: r.tipo_jugada, jugada_id: r.jugada_id, fundamento: safeJson(r.fundamento_json, {}), dudas: safeJson(r.dudas_json, []), diff: safeJson(r.diff_json, []), disparador: r.disparador, created_at: r.created_at }));
  const ultima = db.prepare(`SELECT * FROM venty_fundamento_auto WHERE user_id = ? ORDER BY id DESC LIMIT 1`).get(userId);
  return {
    aceptado: !!aceptado,
    fundamento_aceptado: aceptado ? aceptado.fundamento : null,
    aceptado_at: aceptado ? aceptado.aceptado_at : '',
    borrador_pendiente: borradores[0] || null,
    borradores: borradores.length,
    ultima_lectura: ultima ? { id: ultima.id, estado: ultima.estado, tipo_jugada: ultima.tipo_jugada, created_at: ultima.created_at } : null,
  };
}

// Marca el fundamento ACTUAL del negocio como aceptado F1 (snapshot del
// registro vigente). Lo usa el dueño cuando su fundamento ya cargado es el
// que vale: desde ahí, toda lectura nueva es actualización con diff.
function marcarActualComoAceptado(db, userId, opts) {
  ensureSchema(db);
  const venty = (opts && opts.venty) || require('./venty');
  const f = venty.leerFundamento(db, userId);
  if (!f) return { ok: false, error: 'sin_fundamento' };
  const snap = { rubro: f.rubro || '', modo: f.modo || '', estrella: f.estrella || '', precios: f.precios || [], tono: f.tono || '', ciudad: f.ciudad || '', zona: f.ciudad || '', website_url: f.website_url || '', paleta: f.paleta || [] };
  db.prepare(`INSERT INTO venty_fundamento_aceptado (user_id, fundamento_json, lectura_id, aceptado_at) VALUES (?,?,NULL,?)
    ON CONFLICT(user_id) DO UPDATE SET fundamento_json=excluded.fundamento_json, lectura_id=NULL, aceptado_at=excluded.aceptado_at`)
    .run(userId, JSON.stringify(snap), ahoraIso());
  return { ok: true, fundamento: snap };
}

module.exports = {
  TIPOS_JUGADA,
  ensureSchema, vozVenty, normalizarItem, normalizarOferta, fusionarOfertas,
  extraerDesdeWeb, extraerDesdeInstagram, leerPuentePosty, perfilInstagramGuardado,
  fusionar, diffFundamentos, leerAceptado, hayAceptado, aplicarFundamento,
  leerFundamentoAuto, alConectarFuente, leerLectura, aceptarLectura, rechazarLectura,
  resolverJugadaFundamento, estadoFundamentoAuto, marcarActualComoAceptado, textoJugada,
};
