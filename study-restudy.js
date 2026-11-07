'use strict';
/* =====================================================================
 * study-restudy.js — ESTUDIO-PROFUNDO · MEJORA 6: RE-ESTUDIO SEMANAL
 * (Valentino 7/11 ~16:00 «Perfecto! Arma todo»).
 *
 * Hoy el estudio corre UNA sola vez al entrar a la prueba (IG + web en
 * paralelo → fundamento). Este módulo vuelve a correrlo cada semana con
 * los MISMOS inputs, compara contra el fundamento guardado, actualiza el
 * fundamento y deja registrado qué cambió para mostrárselo al cliente.
 *
 * CAMINO (sin duplicar el estudio inicial):
 *  - El barrido semanal ya existe: refreshDigestsSweep (server.js) re-lee
 *    web (30 días) + feed (7 días) los lunes 06:30 (scheduler.js) y
 *    fusiona el digest. El re-estudio se ANCLA ahí: recordRestudyRun()
 *    recibe (guardado, final) del propio sweep, calcula el diff, protege
 *    la palabra del cliente y escribe el historial. NO hay cron nuevo.
 *  - runRestudyForUser() es el mismo camino bajo demanda (endpoint
 *    POST /api/estudio/reestudio): re-lee las fuentes, construye el
 *    digest fresco con buildFromParts y fusiona con las MISMAS reglas
 *    del sweep (mergeFreshIntoStored).
 *
 * REGLAS DURAS (garantías de rubro del 3/11 + palabra del cliente):
 *  1) El re-estudio NUNCA reescribe el rubro en silencio: rubro_id,
 *     category y subcat guardados se restauran siempre en el digest
 *     final (la reclasificación con pregunta pendiente sigue siendo
 *     trabajo del sweep, nunca de acá).
 *  2) La palabra del cliente manda. Fuentes de corrección consultadas,
 *     en orden (la primera que bloquea, bloquea):
 *       a) ítems con procedencia 'cliente' (espejo aprobar/corregir/
 *          confirmar — fundamento-literal, pieza 4);
 *       b) precios respondidos por el dueño (digest.dueno.precios —
 *          Posty pregunta, v238);
 *       c) digest.clientCorrections — ESPACIO DE CONTRATO para la
 *          mejora 3 (ficha de oferta): [{campo, clave, valor, at,
 *          origen:'cliente'}]. campo: 'producto' | 'precio' | 'promo' |
 *          'servicio'. valor null en campo 'producto' = «el cliente dice
 *          que esto NO es un producto». markClientCorrection() es el
 *          escritor de ese espacio (lo llama la mejora 3 / el coordinador).
 *       d) offerSheet.correcciones_cliente — PUENTE DEL COORDINADOR
 *          (fusión M3→M6): las correcciones que el cliente hizo en la
 *          ficha de oferta (origen 'dueno', campos precio /
 *          promo_ends_at / promo_nueva / promo_titulo). La ficha vive
 *          en su propio espacio de nombres y viaja trial_cache →
 *          cuenta, así que este puente cubre también las correcciones
 *          hechas en la prueba, antes de que existiera la cuenta
 *          (ahí no hay uid para llamar a markClientCorrection).
 *          horarios/ubicacion no se comparan en el diff: no bloquean.
 *     Si el estudio fresco contradice un dato bloqueado, NO se
 *     sobrescribe: se restaura el valor del cliente en el digest final y
 *     se registra un conflicto {estado:'pendiente'} para que el cliente
 *     decida (resolveConflict(): 'cliente' lo deja, 'nuevo' aplica lo
 *     fresco y actualiza el bloqueo con la decisión del cliente).
 *  3) Rama honesta: si una fuente no se puede leer, el run queda con
 *     fuentes_no_leidas y CERO cambios inventados.
 *  4) El fundamento solo crece en su espacio propio: studyHistory
 *     {runs: [últimas 12], lastRunAt, pendientes}. Nada más se reescribe
 *     fuera del diff; el resto del digest lo decide el sweep.
 *
 * Todo determinístico, USD 0: minería por reglas sobre textos reales
 * (buildFromParts); sin llamadas nuevas de LLM.
 * ===================================================================== */
const clientDigest = require('./client-digest');
const fundamentoLiteral = require('./fundamento-literal');

const norm = fundamentoLiteral.norm;
const STUDY_HISTORY_MAX_RUNS = 12;

// ---------- helpers puros ----------
function itemName(it) {
  return String((it && (it.nombre || it.titulo)) || it || '').replace(/\s+/g, ' ').trim();
}
function itemPrice(it) {
  return String((it && (it.precio || it.price)) || '').trim();
}
function samePrice(a, b) {
  const na = String(a || '').trim();
  const nb = String(b || '').trim();
  if (na === nb) return true;
  if (!na || !nb) return false;
  try {
    const pa = clientDigest.parsePriceNum(na);
    const pb = clientDigest.parsePriceNum(nb);
    if (pa != null && pb != null) return pa === pb;
  } catch (e) {}
  return false;
}
function clone(o) {
  try { return JSON.parse(JSON.stringify(o == null ? null : o)); } catch (e) { return o; }
}
function listOf(d, key) {
  return (d && Array.isArray(d[key])) ? d[key] : [];
}
function fuenteListas(sources) {
  // Las listas de oferta (productos/servicios/promos) solo se reescriben
  // desde la lectura web del sweep; los temas, desde el feed.
  const s = sources || {};
  return s.web ? 'web' : (s.feed ? 'feed' : 'estudio');
}

// ---------- diff ----------
function diffLists(oldList, freshList, kindNuevo, kindFalta, kindPrecio) {
  const out = [];
  const oldIdx = new Map();
  for (const it of oldList) {
    const n = itemName(it);
    if (n) oldIdx.set(norm(n), it);
  }
  const freshIdx = new Map();
  for (const it of freshList) {
    const n = itemName(it);
    if (n) freshIdx.set(norm(n), it);
  }
  for (const [k, it] of freshIdx) {
    if (!oldIdx.has(k)) {
      out.push({ tipo: kindNuevo, item: itemName(it), despues: itemPrice(it), fuente: '' });
    } else if (kindPrecio) {
      const a = itemPrice(oldIdx.get(k));
      const b = itemPrice(it);
      if (!samePrice(a, b)) {
        out.push({ tipo: kindPrecio, item: itemName(it), antes: a, despues: b, fuente: '' });
      }
    }
  }
  for (const [k, it] of oldIdx) {
    if (!freshIdx.has(k)) {
      out.push({ tipo: kindFalta, item: itemName(it), antes: itemPrice(it), fuente: '' });
    }
  }
  return out;
}

function diffDigests(oldD, freshD, opts = {}) {
  const o = oldD || {};
  const f = freshD || {};
  const fl = fuenteListas(opts.sources);
  const cambios = [
    ...diffLists(listOf(o, 'productos'), listOf(f, 'productos'), 'producto_nuevo', 'producto_falta', 'precio_cambio'),
    ...diffLists(listOf(o, 'servicios'), listOf(f, 'servicios'), 'servicio_nuevo', 'servicio_falta', null),
    ...diffLists(listOf(o, 'promos'), listOf(f, 'promos'), 'promo_nueva', 'promo_falta', null),
  ];
  for (const c of cambios) c.fuente = fl;
  return cambios;
}

// ---------- palabra del cliente: bloqueos ----------
function collectClientLocks(stored) {
  const locks = []; // {kind:'producto'|'servicio'|'promo'|'precio', key, nombre, precio}
  const d = stored || {};
  const pushLock = (kind, nombre, precio) => {
    const n = String(nombre || '').trim();
    if (!n) return;
    locks.push({ kind, key: norm(n), nombre: n, precio: precio == null ? '' : String(precio) });
  };
  for (const p of listOf(d, 'productos')) {
    if (p && p.procedencia === 'cliente') pushLock('producto', itemName(p), itemPrice(p));
  }
  for (const s of listOf(d, 'servicios')) {
    if (s && s.procedencia === 'cliente') pushLock('servicio', itemName(s), itemPrice(s));
  }
  for (const p of listOf(d, 'promos')) {
    if (p && p.procedencia === 'cliente') pushLock('promo', itemName(p), itemPrice(p));
  }
  // (v238) Precios respondidos por el dueño: la fuente más fuerte.
  try {
    const precios = (d.dueno && d.dueno.precios) || {};
    for (const k of Object.keys(precios)) {
      const e = precios[k] || {};
      pushLock('precio', e.item || k, e.precio || '');
    }
  } catch (e) {}
  // Contrato mejora 3 (ficha de oferta): correcciones marcadas como
  // palabra del cliente en digest.clientCorrections.
  for (const c of listOf(d, 'clientCorrections')) {
    if (!c || typeof c !== 'object') continue;
    const campo = String(c.campo || '');
    if (!['producto', 'precio', 'promo', 'servicio'].includes(campo)) continue;
    if (campo === 'precio') pushLock('precio', c.clave || '', c.valor == null ? '' : c.valor);
    else if (campo === 'producto' || campo === 'servicio') pushLock(campo, c.clave || '', c.valor == null ? '' : c.valor);
    else if (campo === 'promo') pushLock('promo', c.clave || '', c.valor == null ? '' : c.valor);
  }
  // PUENTE DEL COORDINADOR (fusión M3→M6): correcciones del cliente en
  // offerSheet.correcciones_cliente (origen 'dueno'). La ficha es la
  // que el cliente ve y corrige con un toque; el re-estudio compara
  // las listas del fundamento, así que sin este puente una corrección
  // de precio/promo de la ficha no frenaría el cambio en esas listas.
  // Mapeo de campos M3 → bloqueo: precio (titulo + valor), promo_ends_at
  // (titulo + fecha), promo_nueva (el nombre va en valor), promo_titulo
  // (viejo y nuevo nombre, los dos bloquean).
  for (const c of listOf(d.offerSheet || {}, 'correcciones_cliente')) {
    if (!c || typeof c !== 'object' || c.origen !== 'dueno') continue;
    const campo = String(c.campo || '');
    const titulo = String(c.titulo || '').trim();
    const valor = String(c.valor || '').trim();
    if (campo === 'precio' && titulo) pushLock('precio', titulo, valor);
    else if (campo === 'promo_ends_at' && titulo) pushLock('promo', titulo, String(c.ends_at || valor || ''));
    else if (campo === 'promo_nueva' && valor) pushLock('promo', valor, String(c.ends_at || ''));
    else if (campo === 'promo_titulo') {
      if (titulo) pushLock('promo', titulo, '');
      if (valor) pushLock('promo', valor, '');
    }
  }
  return locks;
}
function findLock(locks, kind, nombre) {
  const k = norm(String(nombre || ''));
  // Un bloqueo de precio cubre el precio de un producto/servicio; un
  // bloqueo de producto cubre su existencia y su precio.
  return locks.find((l) => l.key === k && (l.kind === kind || (kind === 'producto' && l.kind === 'precio') || (kind === 'precio' && (l.kind === 'producto' || l.kind === 'precio'))));
}
function storedItem(stored, listKey, nombre) {
  const k = norm(String(nombre || ''));
  return listOf(stored, listKey).find((it) => norm(itemName(it)) === k) || null;
}

// ---------- fusión (mismas reglas que refreshDigestsSweep) ----------
function mergeFreshIntoStored(stored, fresh, sources) {
  const s = sources || {};
  const merged = { ...(stored || fresh) };
  if (s.feed && fresh) {
    merged.temas_feed = fresh.temas_feed;
    if (fresh.protagonista) merged.protagonista = fresh.protagonista;
    merged.fuentes = { ...(merged.fuentes || {}), feed: fresh.fuentes && fresh.fuentes.feed };
    merged.has_booking = !!(merged.has_booking || fresh.has_booking);
  }
  if (s.web && fresh) {
    merged.productos = fresh.productos;
    merged.servicios = fresh.servicios;
    merged.promos = fresh.promos;
    if (fresh.ciudad) merged.ciudad = fresh.ciudad;
    merged.fuentes = { ...(merged.fuentes || {}), web: fresh.fuentes && fresh.fuentes.web };
  }
  if (fresh && fresh.diferencial) merged.diferencial = fresh.diferencial;
  merged.built_at = new Date().toISOString();
  return clientDigest.applyDeepBlocks(merged, fresh);
}

// ---------- registro de una corrida ----------
function recordRestudyRun(db, userId, stored, finalDigest, opts = {}) {
  const oldD = stored || {};
  const finalD = finalDigest || oldD;
  const sources = opts.sources || {};
  const locks = collectClientLocks(oldD);
  const cambios = diffDigests(oldD, finalD, { sources });
  const aplicados = [];
  const conflictos = [];

  for (const c of cambios) {
    if (c.tipo === 'precio_cambio') {
      const lock = findLock(locks, 'precio', c.item);
      if (lock && lock.precio !== '' && !samePrice(lock.precio, c.despues)) {
        conflictos.push({ tipo: 'precio_cambio', item: c.item, valor_cliente: lock.precio, valor_nuevo: c.despues, fuente: c.fuente, estado: 'pendiente', at: new Date().toISOString() });
        // Restaurar el valor del cliente en el digest final.
        const it = storedItem(finalD, 'productos', c.item) || storedItem(finalD, 'servicios', c.item);
        if (it) it.precio = lock.precio;
        continue;
      }
      aplicados.push(c);
    } else if (c.tipo === 'producto_falta' || c.tipo === 'servicio_falta' || c.tipo === 'promo_falta') {
      const listKey = c.tipo === 'servicio_falta' ? 'servicios' : (c.tipo === 'promo_falta' ? 'promos' : 'productos');
      const kind = c.tipo === 'servicio_falta' ? 'servicio' : (c.tipo === 'promo_falta' ? 'promo' : 'producto');
      const lock = findLock(locks, kind, c.item);
      if (lock) {
        conflictos.push({ tipo: c.tipo, item: c.item, valor_cliente: lock.nombre + (lock.precio ? ' ' + lock.precio : ''), valor_nuevo: '', fuente: c.fuente, estado: 'pendiente', at: new Date().toISOString() });
        const orig = storedItem(oldD, listKey, c.item);
        if (orig) {
          const arr = listOf(finalD, listKey);
          if (!arr.some((x) => norm(itemName(x)) === norm(c.item))) arr.push(clone(orig));
          finalD[listKey] = arr;
        }
        continue;
      }
      aplicados.push(c);
    } else if (c.tipo === 'producto_nuevo' || c.tipo === 'servicio_nuevo' || c.tipo === 'promo_nueva') {
      // El cliente dijo que esto NO es un producto (corrección con valor
      // null): el fresco lo trae de vuelta → conflicto, no entra.
      const listKey = c.tipo === 'servicio_nuevo' ? 'servicios' : (c.tipo === 'promo_nueva' ? 'promos' : 'productos');
      const kind = c.tipo === 'servicio_nuevo' ? 'servicio' : (c.tipo === 'promo_nueva' ? 'promo' : 'producto');
      const removal = (oldD.clientCorrections || []).find((x) => x && String(x.campo || '') === kind && norm(String(x.clave || '')) === norm(c.item) && x.valor == null);
      if (removal) {
        conflictos.push({ tipo: c.tipo, item: c.item, valor_cliente: '', valor_nuevo: c.item, fuente: c.fuente, estado: 'pendiente', at: new Date().toISOString() });
        finalD[listKey] = listOf(finalD, listKey).filter((x) => norm(itemName(x)) !== norm(c.item));
        continue;
      }
      aplicados.push(c);
    } else {
      aplicados.push(c);
    }
  }

  // Regla 1: el rubro nunca se reescribe en silencio — salvo que el
  // llamador ya lo haya decidido con sus propias salvaguardas (el sweep
  // semanal: reclasificación solo con confianza alta + pregunta
  // pendiente + log; en ese caso opts.rubroDecidido = true y acá no se
  // toca). Sin esa marca, se restaura el rubro guardado.
  if (!opts.rubroDecidido) {
    if (oldD.rubro_id) finalD.rubro_id = clone(oldD.rubro_id);
    if (typeof oldD.category === 'string') finalD.category = oldD.category;
    if (typeof oldD.subcat === 'string') finalD.subcat = oldD.subcat;
  }

  const at = new Date().toISOString();
  const entry = {
    at,
    cambios: aplicados,
    conflictos,
    fuentes: { web: !!sources.web, feed: !!sources.feed, catalog: !!sources.catalog },
    fuentes_no_leidas: Array.isArray(opts.fuentes_no_leidas) ? opts.fuentes_no_leidas : [],
  };
  const prev = (oldD.studyHistory && Array.isArray(oldD.studyHistory.runs)) ? oldD.studyHistory.runs : [];
  const runs = [...prev, entry].slice(-STUDY_HISTORY_MAX_RUNS);
  finalD.studyHistory = {
    runs,
    lastRunAt: at,
    pendientes: conflictos.filter((c) => c.estado === 'pendiente').length,
  };
  try { clientDigest.saveDigest(db, userId, finalD); } catch (e) { /* el historial nunca rompe el sweep */ }
  return { ok: true, cambios: aplicados, conflictos, run: entry, digest: finalD };
}

// ---------- corrección del cliente (contrato mejora 3) ----------
function markClientCorrection(db, userId, correction) {
  try {
    const c = correction || {};
    const campo = String(c.campo || '');
    if (!['producto', 'precio', 'promo', 'servicio'].includes(campo)) return { ok: false, error: 'campo_invalido' };
    const clave = String(c.clave || '').trim();
    if (!clave) return { ok: false, error: 'falta_clave' };
    const d = clientDigest.getStoredDigest(db, userId) || clientDigest.getDigest(db, userId) || {};
    if (!Array.isArray(d.clientCorrections)) d.clientCorrections = [];
    const k = norm(clave);
    const ex = d.clientCorrections.find((x) => x && String(x.campo || '') === campo && norm(String(x.clave || '')) === k);
    const rec = { campo, clave: k, valor: c.valor == null ? null : String(c.valor), at: new Date().toISOString(), origen: 'cliente' };
    if (ex) Object.assign(ex, rec);
    else d.clientCorrections.push(rec);
    clientDigest.saveDigest(db, userId, d);
    return { ok: true, corrections: d.clientCorrections };
  } catch (e) {
    return { ok: false, error: 'no_se_pudo_guardar' };
  }
}

// ---------- resolución de un conflicto por el cliente ----------
function resolveConflict(db, userId, opts = {}) {
  try {
    const tipo = String(opts.tipo || '');
    const nombre = String(opts.nombre || '');
    const decision = String(opts.decision || '');
    if (!tipo || !nombre || !['cliente', 'nuevo'].includes(decision)) return { ok: false, error: 'datos_incompletos' };
    const d = clientDigest.getStoredDigest(db, userId);
    if (!d || !d.studyHistory || !Array.isArray(d.studyHistory.runs) || !d.studyHistory.runs.length) {
      return { ok: false, error: 'sin_conflicto' };
    }
    const run = d.studyHistory.runs[d.studyHistory.runs.length - 1];
    const conf = (run.conflictos || []).find((x) => x && x.tipo === tipo && norm(String(x.item || '')) === norm(nombre) && x.estado === 'pendiente');
    if (!conf) return { ok: false, error: 'sin_conflicto' };
    if (decision === 'nuevo') {
      if (tipo === 'precio_cambio') {
        const it = storedItem(d, 'productos', nombre) || storedItem(d, 'servicios', nombre);
        if (it) { it.precio = conf.valor_nuevo; it.procedencia = conf.fuente || 'web'; }
        // El bloqueo adopta la decisión del cliente: el valor nuevo pasa
        // a ser la palabra vigente (no vuelve a conflictuar la semana que viene).
        for (const cc of listOf(d, 'clientCorrections')) {
          if (cc && String(cc.campo || '') === 'precio' && norm(String(cc.clave || '')) === norm(nombre)) cc.valor = conf.valor_nuevo;
        }
        if (d.dueno && d.dueno.precios) {
          for (const k of Object.keys(d.dueno.precios)) {
            if (norm(k) === norm(nombre) && d.dueno.precios[k]) d.dueno.precios[k].precio = conf.valor_nuevo;
          }
        }
        // Puente mejora 3: si el bloqueo venía de la ficha, la
        // corrección de la ficha adopta el valor nuevo (si no, la
        // ficha seguiría mostrando el precio viejo y el gate lo usaría).
        for (const sc of listOf(d.offerSheet || {}, 'correcciones_cliente')) {
          if (sc && String(sc.campo || '') === 'precio' && norm(String(sc.titulo || '')) === norm(nombre)) sc.valor = conf.valor_nuevo;
        }
      } else if (tipo === 'producto_falta' || tipo === 'servicio_falta' || tipo === 'promo_falta') {
        const listKey = tipo === 'servicio_falta' ? 'servicios' : (tipo === 'promo_falta' ? 'promos' : 'productos');
        d[listKey] = listOf(d, listKey).filter((x) => norm(itemName(x)) !== norm(nombre));
        d.clientCorrections = listOf(d, 'clientCorrections').filter((x) => !(x && norm(String(x.clave || '')) === norm(nombre)));
        // Puente mejora 3: si el bloqueo venía de la ficha, la
        // corrección de la ficha se levanta y el ítem sale de la ficha
        // (el cliente aceptó que ya no está; si no, mergeOfferSheet
        // la sostendría cada semana por corregido_por_cliente).
        if (d.offerSheet && Array.isArray(d.offerSheet.correcciones_cliente)) {
          d.offerSheet.correcciones_cliente = d.offerSheet.correcciones_cliente.filter((sc) => {
            if (!sc || typeof sc !== 'object') return true;
            const campo = String(sc.campo || '');
            if (campo === 'precio' && norm(String(sc.titulo || '')) === norm(nombre)) return false;
            if ((campo === 'promo_ends_at' || campo === 'promo_nueva' || campo === 'promo_titulo')
              && (norm(String(sc.titulo || '')) === norm(nombre) || norm(String(sc.valor || '')) === norm(nombre))) return false;
            return true;
          });
        }
        if (tipo === 'promo_falta' && d.offerSheet && Array.isArray(d.offerSheet.promos)) {
          d.offerSheet.promos = d.offerSheet.promos.filter((p) => norm(String((p && (p.titulo || p.nombre)) || '')) !== norm(nombre));
        }
        if ((tipo === 'producto_falta' || tipo === 'servicio_falta') && d.offerSheet && Array.isArray(d.offerSheet.productos)) {
          d.offerSheet.productos = d.offerSheet.productos.filter((p) => norm(String((p && (p.nombre || p.titulo)) || '')) !== norm(nombre));
        }
      } else if (tipo === 'producto_nuevo' || tipo === 'servicio_nuevo' || tipo === 'promo_nueva') {
        // El cliente acepta que sí es un producto: se levanta el veto de la corrección.
        d.clientCorrections = listOf(d, 'clientCorrections').filter((x) => !(x && x.valor == null && norm(String(x.clave || '')) === norm(nombre)));
      }
    }
    conf.estado = decision === 'nuevo' ? 'resuelto_nuevo' : 'resuelto_cliente';
    conf.resuelto_at = new Date().toISOString();
    d.studyHistory.pendientes = (run.conflictos || []).filter((x) => x.estado === 'pendiente').length;
    clientDigest.saveDigest(db, userId, d);
    return { ok: true, decision, conflicto: conf };
  } catch (e) {
    return { ok: false, error: 'no_se_pudo_resolver' };
  }
}

// ---------- corrida bajo demanda (mismos inputs que el estudio inicial) ----------
function readProfile(db, userId) {
  try {
    return db.prepare('SELECT business_name, category, description, ig_username, ig_connected FROM profiles WHERE user_id = ?').get(userId) || {};
  } catch (e) { return {}; }
}
function readDna(db, userId) {
  try {
    const r = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(userId);
    return (r && r.dna_json) ? JSON.parse(r.dna_json) : {};
  } catch (e) { return {}; }
}

async function runRestudyForUser(db, userId, deps = {}) {
  const prof = readProfile(db, userId);
  const dna = readDna(db, userId);
  const stored = clientDigest.getStoredDigest(db, userId);
  const webUrl = String((dna && dna.website_url) || '').trim();
  const ig = (prof.ig_connected && prof.ig_username) ? String(prof.ig_username) : '';
  const sources = { web: false, feed: false };
  const fuentesNoLeidas = [];
  let webFresh = null;
  let feedFresh = null;

  if (webUrl) {
    try {
      const fetchWeb = deps.fetchWeb || require('./web-extract').fetchBusinessSite;
      const wd = await fetchWeb(webUrl);
      if (wd && wd.ok) {
        webFresh = { name: wd.name, description: wd.description, services: wd.services || [], city: wd.city, palette: wd.palette || [], url: wd.url, categoryHint: wd.categoryHint };
        sources.web = true;
      } else fuentesNoLeidas.push('web');
    } catch (e) { fuentesNoLeidas.push('web'); }
  }
  if (ig) {
    try {
      const fetchFeed = deps.fetchFeed || require('./feed-audit').fetchAuditData;
      const data = await fetchFeed(ig);
      if (data && data.ok && data.profile) {
        feedFresh = {
          bio: data.profile.bio || '',
          captions: (data.posts || []).map((x) => String((x && x.caption) || '').slice(0, 240)).filter(Boolean).slice(0, 12),
          name: data.profile.name || '', handle: data.profile.handle || ig,
          pic: data.profile.pic || '',
        };
        sources.feed = true;
      } else fuentesNoLeidas.push('feed');
    } catch (e) { fuentesNoLeidas.push('feed'); }
  }

  if (!webFresh && !feedFresh) {
    // Rama honesta: sin fuentes legibles no se inventa ningún cambio.
    const base = stored || clientDigest.emptyDigest();
    const r = recordRestudyRun(db, userId, base, clone(base), { sources, fuentes_no_leidas: fuentesNoLeidas });
    return { ok: false, error: fuentesNoLeidas.length ? 'fuentes_no_leidas' : 'sin_fuentes', fuentes_no_leidas: fuentesNoLeidas, cambios: [], conflictos: r.conflictos || [], run: r.run };
  }

  const fresh = clientDigest.buildFromParts({
    business: prof.business_name || (stored && stored.business) || '',
    category: (stored && stored.category) || prof.category || '',
    dna, form: { description: prof.description || '' },
    web: webFresh, feed: feedFresh,
  });
  const merged = mergeFreshIntoStored(stored, fresh, sources);
  const r = recordRestudyRun(db, userId, stored, merged, { sources });
  return { ok: true, cambios: r.cambios, conflictos: r.conflictos, run: r.run, fuentes_no_leidas: fuentesNoLeidas };
}

// ---------- superficie «qué cambió» (texto ES+EN, lo rinde el chunk) ----------
function restudySummaryText(run, lang) {
  const en = lang === 'en';
  const r = run || {};
  const cambios = Array.isArray(r.cambios) ? r.cambios : [];
  const conflictos = Array.isArray(r.conflictos) ? r.conflictos : [];
  const noLeidas = Array.isArray(r.fuentes_no_leidas) ? r.fuentes_no_leidas : [];
  const fecha = (() => {
    try { return new Date(r.at || Date.now()).toLocaleDateString(en ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short' }); } catch (e) { return ''; }
  })();
  const title = (en ? 'What changed this week' : 'Qué cambió esta semana') + (fecha ? ' · ' + fecha : '');
  const lines = [];
  for (const c of cambios) {
    if (c.tipo === 'producto_nuevo') lines.push('+ ' + c.item + (en ? ' (new product)' : ' (producto nuevo)') + (c.despues ? ' · ' + c.despues : ''));
    else if (c.tipo === 'producto_falta') lines.push('− ' + c.item + (en ? ' (no longer listed)' : ' (ya no está)'));
    else if (c.tipo === 'precio_cambio') lines.push(c.item + ': ' + (c.antes || '—') + ' → ' + (c.despues || '—'));
    else if (c.tipo === 'servicio_nuevo') lines.push('+ ' + c.item + (en ? ' (new service)' : ' (servicio nuevo)'));
    else if (c.tipo === 'servicio_falta') lines.push('− ' + c.item + (en ? ' (no longer listed)' : ' (ya no está)'));
    else if (c.tipo === 'promo_nueva') lines.push('+ ' + c.item + (en ? ' (new promo)' : ' (promo nueva)'));
    else if (c.tipo === 'promo_falta') lines.push('− ' + c.item + (en ? ' (promo ended)' : ' (promo terminada)'));
  }
  for (const c of conflictos) {
    if (c.estado === 'pendiente') {
      lines.push('⚠ ' + c.item + ': ' + (en
        ? 'you have ' + (c.valor_cliente || '—') + ', the study sees ' + (c.valor_nuevo || 'gone') + ' — yours stays until you decide'
        : 'vos tenés ' + (c.valor_cliente || '—') + ', el estudio ve ' + (c.valor_nuevo || 'que ya no está') + ' — queda lo tuyo hasta que decidas'));
    }
  }
  if (!cambios.length && !conflictos.length) {
    lines.push(en ? 'No changes this week.' : 'Sin cambios esta semana.');
  }
  if (noLeidas.length) {
    lines.push(en ? "I couldn't read: " + noLeidas.join(' + ') + ' — nothing was changed.' : 'No pude leer: ' + noLeidas.join(' + ') + ' — no se cambió nada.');
  }
  return title + '\n' + lines.join('\n');
}

module.exports = {
  STUDY_HISTORY_MAX_RUNS,
  diffDigests,
  recordRestudyRun,
  runRestudyForUser,
  markClientCorrection,
  resolveConflict,
  restudySummaryText,
  mergeFreshIntoStored,
  collectClientLocks,
};
