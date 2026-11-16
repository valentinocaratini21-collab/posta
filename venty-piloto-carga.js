// venty-piloto-carga.js — SLICE 4: carga de datos del piloto Fitswapp.
// Carga, TODO en estado borrador/espejo y sin enviar nada:
//   · las 5 zonas del fundamento borrador §11, EN ORDEN (1 Palermo ·
//     2 San Telmo/Microcentro/Centro · 3 Villa Crespo/Almagro/Caballito/
//     Boedo · 4 Belgrano/Núñez/Colegiales · 5 GBA), con UN representante
//     por zona (email + Instagram; WhatsApp vacío: fuera del piloto);
//   · los 198 prospectos de la lista (fixture con corte 6/11, la única
//     fuente) como leads con zona, canal y puntaje según el criterio del
//     borrador §11 (scoring de venty-oleadas.js, con su puerta);
//   · la oleada 1 armada en espejo con los 10 candidatos fundadores.
// La carga es idempotente: correrla dos veces no duplica zonas,
// representantes, leads ni la oleada. La carga NO aprueba el fundamento
// (sigue borrador sin aprobar) ni toca las puertas de envío: el dominio
// de envío sigue sin decidir, Instagram sigue en falta_accion y el
// permiso de DM sigue pendiente. Cero envíos: no llama a ningún enviar*.
'use strict';

const oleadas = require('./venty-oleadas');

const PILOTO = 'fitswapp';
const ZONAS_PILOTO = [
  { orden: 1, nombre: 'Palermo', ciudad: 'buenos aires' },
  { orden: 2, nombre: 'San Telmo / Microcentro / Centro', ciudad: 'buenos aires' },
  { orden: 3, nombre: 'Villa Crespo / Almagro / Caballito / Boedo', ciudad: 'buenos aires' },
  { orden: 4, nombre: 'Belgrano / Núñez / Colegiales', ciudad: 'buenos aires' },
  { orden: 5, nombre: 'GBA', ciudad: 'gran buenos aires' },
];
const FUNDADORES_OLEADA1 = [
  'Galpón de Ropa', 'Urban Luxury', 'Eureka Vintage Club', 'Boycapel',
  "Sophie's Closet", 'Locas por los Trapos', 'Meri Salinas Closet',
  'Fresh Store', 'El Ropavejero', 'tu ropa mi ropa',
];

function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function normNombre(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120); }
function claveNegocio(nombre, direccion) {
  return (normNombre(nombre) + '|' + normNombre(direccion)).slice(0, 240);
}

function ensureSchema(db) {
  oleadas.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_s4_zona_meta (
    zona_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    orden INTEGER NOT NULL,
    piloto TEXT NOT NULL DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_s4_lead_detalle (
    lead_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    direccion TEXT NOT NULL DEFAULT '',
    ig_handle TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    tier TEXT NOT NULL DEFAULT '',
    puerta_busca_clientes INTEGER NOT NULL DEFAULT 0,
    evidencia_puerta TEXT NOT NULL DEFAULT '',
    topado_por_puerta INTEGER NOT NULL DEFAULT 0,
    motivo_exclusion TEXT NOT NULL DEFAULT '',
    clave_negocio TEXT NOT NULL DEFAULT '',
    tiene_borrador INTEGER NOT NULL DEFAULT 0,
    es_fundador INTEGER NOT NULL DEFAULT 0,
    estado_carga TEXT NOT NULL DEFAULT 'espejo'
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_s4_detalle_user ON venty_s4_lead_detalle(user_id, tier)');
  db.exec(`CREATE TABLE IF NOT EXISTS venty_s4_carga (
    user_id INTEGER PRIMARY KEY,
    piloto TEXT NOT NULL DEFAULT '',
    filas_fuente INTEGER NOT NULL DEFAULT 0,
    leads INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

function fixtureDefault() {
  return require('./venty-piloto-fitswapp-fixture.json');
}

// Canal del lead: instagram solo con handle verificado en la lista;
// email solo con email publicado en la lista; sin canal confirmado, el
// lead queda sin canal y SIN destino (no recibe DM ni email).
function canalDe(p) {
  if (p.ig) return { canal: 'instagram', contacto: String(p.ig) };
  if (p.email) return { canal: 'email', contacto: String(p.email) };
  return { canal: '', contacto: '' };
}

function cargarPiloto(db, userId, opts) {
  const o = opts || {};
  ensureSchema(db);
  const venty = o.venty || require('./venty');
  const fixture = o.fixture || fixtureDefault();
  const prospectos = fixture.prospectos || [];
  const previa = db.prepare('SELECT * FROM venty_s4_carga WHERE user_id = ?').get(userId);
  if (previa) {
    return { ok: true, ya_cargado: true, ...censo(db, userId) };
  }
  // 1) zonas en orden + un representante por zona (email + instagram;
  //    remitente_wa vacío a propósito: whatsapp fuera del piloto).
  const zonaIdPorOrden = {};
  for (const z of ZONAS_PILOTO) {
    let zona = db.prepare('SELECT * FROM venty_zonas WHERE user_id = ? AND nombre = ?').get(userId, z.nombre);
    if (!zona) {
      const r = venty.crearZona(db, userId, { nombre: z.nombre, ciudad: z.ciudad });
      if (!r.ok) return { ok: false, error: 'zona:' + r.error };
      zona = db.prepare('SELECT * FROM venty_zonas WHERE id = ?').get(r.id);
    }
    zonaIdPorOrden[z.orden] = zona.id;
    db.prepare(`INSERT INTO venty_s4_zona_meta (zona_id, user_id, orden, piloto) VALUES (?,?,?,?)
      ON CONFLICT(zona_id) DO UPDATE SET orden = excluded.orden, piloto = excluded.piloto`)
      .run(zona.id, userId, z.orden, PILOTO);
    if (!venty.representanteDeZona(db, userId, zona.id)) {
      const rep = venty.crearRepresentante(db, userId, {
        zona_id: zona.id,
        nombre: 'representante zona ' + z.orden,
        remitente_nombre: 'el equipo de fitswapp',
        remitente_email: '',
        remitente_ig: '@fit.swapp',
        remitente_wa: '',
        voz_nota: 'español rioplatense, minúsculas, sin signos de apertura, una idea por mensaje, firma como fitswapp; trabaja email e instagram de su zona',
      });
      if (!rep.ok) return { ok: false, error: 'representante:' + rep.error };
    }
  }
  // 2) los 198 prospectos como leads (dedupe de inserción por clave de
  //    negocio solo para la oleada: cada fila de la fuente es un lead; la
  //    clave_negocio compartida evita contactar dos veces al mismo
  //    negocio — la fuente trae a eureka vintage club dos veces).
  const usadosNorm = new Set(db.prepare('SELECT nombre_norm FROM venty_leads WHERE user_id = ?').all(userId).map((r) => r.nombre_norm));
  let leadsCreados = 0;
  const leadPorFundador = {};
  for (const p of prospectos) {
    const sc = oleadas.puntuar(p);
    const { canal, contacto } = sc.tier === 'excluido' ? { canal: '', contacto: '' } : canalDe(p);
    let nombreNorm = normNombre(p.nombre);
    if (usadosNorm.has(nombreNorm)) {
      // nombre repetido en la fuente (negocios distintos con nombre
      // genérico o el mismo negocio listado dos veces): se desambigua
      // con la dirección para no perder la fila ni pisar otro lead.
      nombreNorm = normNombre(p.nombre + ' — ' + String(p.direccion || '').slice(0, 40));
    }
    usadosNorm.add(nombreNorm);
    const zonaId = zonaIdPorOrden[Number(p.zona) || 5] || null;
    const r = db.prepare(`INSERT INTO venty_leads (user_id, zona_id, nombre, nombre_norm, canal_preferido, contacto_ref, puntaje, porque, estado, created_at)
      VALUES (?,?,?,?,?,?,?,?,'pendiente',?)`).run(userId, zonaId, String(p.nombre).slice(0, 120), nombreNorm, canal, contacto,
      sc.puntaje, (sc.motivo_exclusion ? 'excluido de la oleada 1: ' + sc.motivo_exclusion + '. ' : '') + (sc.evidencia_puerta || String(p.notas || '').slice(0, 200)), ahoraIso());
    const leadId = Number(r.lastInsertRowid);
    leadsCreados++;
    db.prepare(`INSERT INTO venty_s4_lead_detalle (lead_id, user_id, direccion, ig_handle, email, tier, puerta_busca_clientes, evidencia_puerta, topado_por_puerta, motivo_exclusion, clave_negocio, tiene_borrador, es_fundador, estado_carga)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'espejo')`).run(leadId, userId, String(p.direccion || '').slice(0, 200), String(p.ig || ''), String(p.email || ''),
      sc.tier, sc.puerta_busca_clientes ? 1 : 0, sc.evidencia_puerta || '', sc.topado_por_puerta ? 1 : 0, sc.motivo_exclusion || '',
      claveNegocio(p.nombre, p.direccion), p.tiene_borrador ? 1 : 0, p.es_fundador_oleada1 ? 1 : 0);
    if (p.es_fundador_oleada1) {
      const prev = leadPorFundador[p.nombre];
      // para la oleada manda la fila con canal confirmado (eureka: la
      // segunda fila trae el handle; la primera no).
      if (!prev || (canal && !prev.canal)) leadPorFundador[p.nombre] = { leadId, canal, nombre: p.nombre, zonaId };
    }
  }
  // 3) oleada 1 en espejo con los 10 fundadores (fecha: la de la carga;
  //    la oleada es espejo/borrador: jugadas pendientes en bandeja).
  const fecha = String(o.fecha || oleadas.hoyYmd());
  const rO = db.prepare(`INSERT INTO venty_s4_oleadas (user_id, zona_id, fecha, estado, piloto, created_at) VALUES (?,?,?,?,?,?)`)
    .run(userId, null, fecha, 'espejo', PILOTO + ':oleada1', ahoraIso());
  const oleadaId = Number(rO.lastInsertRowid);
  let itemsOleada1 = 0;
  for (const nombreF of FUNDADORES_OLEADA1) {
    const f = leadPorFundador[nombreF];
    if (!f || !f.leadId) continue;
    const lead = db.prepare('SELECT * FROM venty_leads WHERE id = ?').get(f.leadId);
    if (!lead || !lead.canal_preferido || !lead.contacto_ref) continue;
    const pieza = oleadas.textoPara(lead, 'T1', { negocio: 'fitswapp' });
    const ins = db.prepare(`INSERT INTO venty_s4_oleada_items (oleada_id, user_id, lead_id, canal, tipo, asunto, texto, estado, created_at) VALUES (?,?,?,?,?,?,?,'espejo',?)`)
      .run(oleadaId, userId, lead.id, lead.canal_preferido, 'T1', pieza.asunto || '', pieza.texto || '', ahoraIso());
    const itemId = Number(ins.lastInsertRowid);
    const jug = db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
      .run(userId, null, 'oleada_contacto', JSON.stringify({
        oleada_id: oleadaId, item_id: itemId, lead_id: lead.id, lead_nombre: lead.nombre,
        canal: lead.canal_preferido, tipo_email: 'T1', asunto: pieza.asunto || '', texto: pieza.texto || '',
        destino: lead.contacto_ref, espejo: true, oleada: 1,
      }), 'oleada 1 en espejo: candidatos fundadores de fitswapp; nada sale en real sin tu aceptación');
    db.prepare('UPDATE venty_s4_oleada_items SET jugada_id = ? WHERE id = ?').run(Number(jug.lastInsertRowid), itemId);
    itemsOleada1++;
  }
  db.prepare(`INSERT INTO venty_s4_carga (user_id, piloto, filas_fuente, leads, created_at) VALUES (?,?,?,?,?)`)
    .run(userId, PILOTO, prospectos.length, leadsCreados, ahoraIso());
  try { venty.registrarEvento(db, userId, 'piloto_fitswapp_cargado', null, { leads: leadsCreados, oleada1_items: itemsOleada1, estado: 'espejo' }); } catch (e) {}
  return { ok: true, ya_cargado: false, oleada1_id: oleadaId, oleada1_items: itemsOleada1, ...censo(db, userId) };
}

function detalleDeLead(db, userId) {
  ensureSchema(db);
  return (lead) => {
    const d = db.prepare('SELECT * FROM venty_s4_lead_detalle WHERE lead_id = ? AND user_id = ?').get(lead.id, userId);
    return d ? { tier: d.tier, clave_negocio: d.clave_negocio } : null;
  };
}

function censo(db, userId) {
  ensureSchema(db);
  const zonas = db.prepare(`SELECT z.nombre, m.orden FROM venty_zonas z JOIN venty_s4_zona_meta m ON m.zona_id = z.id
    WHERE z.user_id = ? ORDER BY m.orden ASC`).all(userId);
  const reps = db.prepare('SELECT COUNT(*) c FROM venty_representantes WHERE user_id = ?').get(userId);
  const leadsTotal = db.prepare('SELECT COUNT(*) c FROM venty_leads WHERE user_id = ?').get(userId);
  const porEstado = db.prepare('SELECT estado, COUNT(*) c FROM venty_leads WHERE user_id = ? GROUP BY estado').all(userId);
  const porCanal = db.prepare(`SELECT CASE WHEN canal_preferido = '' THEN 'sin_canal' ELSE canal_preferido END canal, COUNT(*) c
    FROM venty_leads WHERE user_id = ? GROUP BY canal`).all(userId);
  const porZona = db.prepare(`SELECT z.nombre, m.orden, COUNT(*) c FROM venty_leads l JOIN venty_zonas z ON z.id = l.zona_id
    JOIN venty_s4_zona_meta m ON m.zona_id = z.id WHERE l.user_id = ? GROUP BY l.zona_id ORDER BY m.orden ASC`).all(userId);
  const porTier = db.prepare('SELECT tier, COUNT(*) c FROM venty_s4_lead_detalle WHERE user_id = ? GROUP BY tier').all(userId);
  const oleada1 = db.prepare(`SELECT o.id, COUNT(i.id) items FROM venty_s4_oleadas o LEFT JOIN venty_s4_oleada_items i ON i.oleada_id = o.id
    WHERE o.user_id = ? AND o.piloto = ? GROUP BY o.id`).get(userId, PILOTO + ':oleada1');
  const jugadasOleada = db.prepare(`SELECT COUNT(*) c FROM venty_jugadas WHERE user_id = ? AND tipo = 'oleada_contacto'`).get(userId);
  const carga = db.prepare('SELECT * FROM venty_s4_carga WHERE user_id = ?').get(userId);
  return {
    piloto: PILOTO,
    fundamento: 'borrador_sin_aprobar',
    estado_carga: 'espejo',
    filas_fuente: carga ? carga.filas_fuente : 0,
    zonas: zonas.map((z) => ({ orden: z.orden, nombre: z.nombre })),
    representantes: reps ? reps.c : 0,
    leads: leadsTotal ? leadsTotal.c : 0,
    leads_por_estado: Object.fromEntries(porEstado.map((r) => [r.estado, r.c])),
    leads_por_canal: Object.fromEntries(porCanal.map((r) => [r.canal, r.c])),
    leads_por_zona: porZona.map((r) => ({ orden: r.orden, zona: r.nombre, leads: r.c })),
    leads_por_tier: Object.fromEntries(porTier.map((r) => [r.tier, r.c])),
    oleada1: oleada1 ? { id: oleada1.id, items: oleada1.items } : null,
    jugadas_oleada_pendientes_o_total: jugadasOleada ? jugadasOleada.c : 0,
  };
}

module.exports = {
  PILOTO, ZONAS_PILOTO, FUNDADORES_OLEADA1,
  ensureSchema, cargarPiloto, censo, detalleDeLead, canalDe, claveNegocio,
};
