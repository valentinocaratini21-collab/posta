// venty-oleadas.js — SLICE 4 (caza real): scoring con puerta, oleadas en
// espejo por zona y verificación de salida con el gobernador.
// Modelo vigente (plan § slice 4 + playbook de emails + fundamento
// Fitswapp borrador §11):
//   · UN representante por zona que se ocupa de TODO en su zona (email +
//     Instagram + seguimiento). El trabajo diario PREPARA la oleada en
//     espejo y la propone como jugadas en Bandeja: nunca envía por su
//     cuenta. Sin espejo aceptado en Bandeja no hay salida real posible.
//   · SCORING con la puerta «tiene que buscar clientes»: dimensión
//     obligatoria sí/no CON evidencia. Tier A = 85+ Y puerta sí. 85+ sin
//     la puerta queda topado en Tier B. Tier B = 70–84 (o topado).
//     Menos de 70 no entra en oleadas.
//   · El gobernador (venty-gobernador.js, no se reescribe) manda el cupo
//     por canal y por día: la oleada en espejo se arma DENTRO del cupo
//     restante; el consumo se pide recién al enviar (y se devuelve si el
//     envío falla, como ya hacen venty-email / venty-instagram).
//   · Textos: voz en minúsculas, sin signos de apertura, una idea por
//     mensaje. Para Fitswapp aplican T1–T4 del playbook; T5/T6 NO
//     aplican todavía (fundamento borrador §7) y este módulo los rechaza.
//   · WhatsApp no es canal de oleada del piloto Fitswapp (fuera del
//     piloto): canal whatsapp se rechaza siempre acá.
'use strict';

const gobernador = require('./venty-gobernador');
const canalDominante = require('./venty-canal'); // F3 CANAL DOMINANTE (C13): canal por defecto de la oleada cuando el lead no trae canal, con fallback al criterio actual.

const TIPOS_FITSWAPP = ['T1', 'T2', 'T3', 'T4']; // T5/T6 no aplican todavía
const CANALES_OLEADA = ['email', 'instagram'];

function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function hoyYmd() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }); }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_s4_oleadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    zona_id INTEGER,
    fecha TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'espejo',
    piloto TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, zona_id, fecha, piloto)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_s4_oleada_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oleada_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    lead_id INTEGER NOT NULL,
    canal TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'T1',
    asunto TEXT NOT NULL DEFAULT '',
    texto TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'espejo',
    jugada_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(oleada_id, lead_id, canal)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_s4_items_oleada ON venty_s4_oleada_items(oleada_id, estado)');
}

// ---- scoring -------------------------------------------------------------
// Entrada: señales verificables de la fuente (nada inventado):
//   { ig, email, tienda_online, consignacion, fundador_star,
//     cerrado, temporalmente_cerrado, mayorista, infantil, hogar,
//     sin_verificar, es_fundador_oleada1, tiene_borrador }
// La puerta «tiene que buscar clientes» vale sí cuando hay evidencia de
// stock para mover / otra vidriera útil: consignación, tienda online
// activa o fundador marcado. Sin esa evidencia, la puerta es no.
function puntuar(p) {
  const x = p || {};
  if (x.cerrado || x.temporalmente_cerrado) {
    return { puntaje: 0, puerta_busca_clientes: false, evidencia_puerta: '', tier: 'excluido', motivo_exclusion: x.cerrado ? 'cerrado' : 'posiblemente_cerrado_temporal' };
  }
  if (x.mayorista || x.infantil || x.hogar) {
    const motivo = x.mayorista ? 'mayorista' : (x.infantil ? 'infantil_fuera_oleada1' : 'hogar_fuera_oleada1');
    return { puntaje: 0, puerta_busca_clientes: false, evidencia_puerta: '', tier: 'excluido', motivo_exclusion: motivo };
  }
  let puntaje = 40; // verificado activo en la lista (fuente única, en persona)
  const evidencias = [];
  if (x.ig) { puntaje += 25; evidencias.push('handle de instagram verificado y activo: ' + x.ig); }
  if (x.tienda_online) { puntaje += 15; evidencias.push('tienda online activa'); }
  if (x.consignacion) { puntaje += 10; evidencias.push('vende con consignación o thrift & consignment: entiende el modelo'); }
  if (x.fundador_star) { puntaje += 10; evidencias.push('marcado como prioridad o candidato fundador en la lista'); }
  if (x.es_fundador_oleada1) puntaje = Math.max(puntaje, 92);
  if (x.sin_verificar) puntaje = Math.min(puntaje, 69); // sin reverificar no sube
  puntaje = Math.max(0, Math.min(100, puntaje));
  // la puerta exige evidencia de stock para mover: consignación (stock de
  // terceros que rota) o ser candidato fundador (stock propio ofrecido a
  // la lista). tener instagram o tienda online suma puntaje pero NO abre
  // la puerta por sí solo: un 85+ sin esa evidencia queda topado en b.
  const puerta = !!(x.consignacion || x.es_fundador_oleada1);
  const evidencia_puerta = puerta
    ? 'tiene stock para mover y le sirve otra vidriera: ' + (evidencias.slice(0, 2).join(' · ') || 'candidato fundador de la oleada 1')
    : '';
  let tier;
  let topado_por_puerta = false;
  if (puntaje >= 85 && puerta) tier = 'A';
  else if (puntaje >= 70) { tier = 'B'; if (puntaje >= 85 && !puerta) topado_por_puerta = true; }
  else tier = 'C';
  return { puntaje, puerta_busca_clientes: puerta, evidencia_puerta, tier, topado_por_puerta, motivo_exclusion: '' };
}

function tierDe(puntaje, puerta) {
  const s = puntuar({}); // (no usado; la regla vive en puntuar)
  void s;
  const n = Number(puntaje) || 0;
  if (n >= 85 && puerta) return { tier: 'A', topado_por_puerta: false };
  if (n >= 70) return { tier: 'B', topado_por_puerta: n >= 85 && !puerta };
  return { tier: 'C', topado_por_puerta: false };
}

// ---- textos del representante (playbook T1–T4, una idea, voz baja) -------
// El que escribe es el negocio (Fitswapp en el piloto), nunca venty. Los
// textos nacen en espejo: son borradores para la Bandeja, no envíos.
function textoPara(lead, tipo, opts) {
  const o = opts || {};
  const t = String(tipo || 'T1');
  if (!TIPOS_FITSWAPP.includes(t)) return { ok: false, error: 'tipo_no_aplica', detalle: 'a fitswapp aplican t1 a t4; t5 y t6 no aplican todavía' };
  const nombre = String((lead && lead.nombre) || 'tu local').slice(0, 80);
  const negocio = String(o.negocio || 'fitswapp');
  const firma = 'el equipo de ' + negocio;
  const base = nombre.toLowerCase();
  if (t === 'T1') {
    return { ok: true, tipo: t, canal_sugerido: lead && lead.canal_preferido,
      asunto: negocio + ' abre en diciembre: sumate como tienda fundadora',
      texto: 'hola, soy del equipo de ' + negocio + '. vi ' + base + ' y me pareció ideal para sumarse como tienda fundadora: 0% de comisión inicial, acceso anticipado y tu stock en otra vidriera desde el primer día. si te sirve, te mando cómo quedaría tu local adentro.',
      firma };
  }
  if (t === 'T2') {
    return { ok: true, tipo: t, canal_sugerido: lead && lead.canal_preferido,
      asunto: 're: ' + negocio + ' abre en diciembre',
      texto: 'hola, te escribo de nuevo del equipo de ' + negocio + '. novedad de esta semana: ya estamos cargando los primeros locales fundadores para el lanzamiento de diciembre. si querés, te guardo el lugar de ' + base + ' sin compromiso.',
      firma };
  }
  if (t === 'T3') {
    return { ok: true, tipo: t, canal_sugerido: lead && lead.canal_preferido,
      asunto: 'publicá tus primeras prendas en 3 pasos',
      texto: 'hola, otra idea del equipo de ' + negocio + ': en ' + negocio + ' publicás con una foto y la ia completa el resto, con chequeo de réplicas y cobro protegido. si te sirve, te muestro cómo se verían tus primeras prendas cargadas.',
      firma };
  }
  return { ok: true, tipo: 'T4', canal_sugerido: lead && lead.canal_preferido,
    asunto: 'cierro el loop por ahora',
    texto: 'hola, no tuve respuesta así que cierro el loop de mi lado, sin ningún problema. si alguna vez te sirve otra vidriera para tu stock, la lista de espera de ' + negocio + '.com queda abierta. gracias por tu tiempo.',
    firma };
}

// ---- oleada diaria en espejo ----------------------------------------------
// Prepara (o devuelve, si ya existe) la oleada del día para UNA zona:
// toma los leads pendientes de la zona con tier A/B y canal confirmado,
// dentro del cupo restante del gobernador por canal (consultar: el espejo
// no consume cupo), y deja un ítem en espejo + una jugada pendiente en
// Bandeja por cada contacto. Nunca envía. opts: { venty, detalleDeLead,
// fecha, maxPorCanal } inyectables en tests; detalleDeLead(lead) →
// { tier, … } desde venty_s4_lead_detalle (lo provee la carga del piloto)
// o desde el puntaje guardado en el lead.
function prepararOleadaZona(db, userId, zonaId, opts) {
  const o = opts || {};
  ensureSchema(db);
  const venty = o.venty || require('./venty');
  const fecha = String(o.fecha || hoyYmd());
  const piloto = String(o.piloto || '');
  const existente = db.prepare('SELECT * FROM venty_s4_oleadas WHERE user_id = ? AND zona_id IS ? AND fecha = ? AND piloto = ?')
    .get(userId, zonaId === null || zonaId === undefined ? null : Number(zonaId), fecha, piloto);
  if (existente) {
    const items = db.prepare('SELECT * FROM venty_s4_oleada_items WHERE oleada_id = ? ORDER BY id ASC').all(existente.id);
    return { ok: true, ya_existia: true, oleada: existente, items };
  }
  const r = db.prepare(`INSERT INTO venty_s4_oleadas (user_id, zona_id, fecha, estado, piloto, created_at) VALUES (?,?,?,?,?,?)`)
    .run(userId, zonaId === null || zonaId === undefined ? null : Number(zonaId), fecha, 'espejo', piloto, ahoraIso());
  const oleadaId = Number(r.lastInsertRowid);
  // F3: el canal dominante manda como canal por defecto de la oleada SOLO
  // para leads sin canal_preferido, y solo si aplica a oleadas (email /
  // instagram) y está conectado; en cualquier otro caso, criterio actual
  // (el lead sin canal confirmado queda fuera, como hasta hoy).
  let dominanteOleada = null;
  try {
    const ef = canalDominante.canalEfectivo(db, userId, { canales_permitidos: CANALES_OLEADA, canal_actual: null });
    if (ef.fuente === 'canal_dominante') dominanteOleada = ef.canal;
  } catch (e) { dominanteOleada = null; }
  const canalDeLead = new Map();
  const leads = venty.listarLeads(db, userId, zonaId ? { zona_id: Number(zonaId) } : {})
    .filter((l) => {
      if (l.estado !== 'pendiente' || String(l.contacto_ref || '').trim() === '') return false;
      const pref = String(l.canal_preferido || '');
      if (CANALES_OLEADA.includes(pref)) { canalDeLead.set(l.id, pref); return true; }
      if (!pref && dominanteOleada) { canalDeLead.set(l.id, dominanteOleada); return true; }
      return false;
    });
  const detalleDe = o.detalleDeLead || null;
  const restantes = {};
  for (const canal of CANALES_OLEADA) {
    const c = gobernador.consultar(db, userId, canal, 1);
    restantes[canal] = c.permitido ? c.restante : 0;
    if (o.maxPorCanal && o.maxPorCanal[canal] !== undefined) restantes[canal] = Math.min(restantes[canal], Number(o.maxPorCanal[canal]) || 0);
  }
  const items = [];
  const vistosNegocio = new Set(o.clavesVistas || []);
  for (const lead of leads) {
    const det = detalleDe ? detalleDe(lead) : null;
    const tier = (det && det.tier) || (lead.puntaje >= 85 ? 'A' : (lead.puntaje >= 70 ? 'B' : 'C'));
    if (tier !== 'A' && tier !== 'B') continue;
    const clave = det && det.clave_negocio ? det.clave_negocio : norm(lead.nombre);
    if (vistosNegocio.has(clave)) continue; // mismo negocio dos veces en la fuente: se contacta una sola vez
    const canal = canalDeLead.get(lead.id) || String(lead.canal_preferido);
    if (restantes[canal] <= 0) continue; // el gobernador manda: fuera de cupo no entra ni al espejo del día
    restantes[canal]--;
    vistosNegocio.add(clave);
    const pieza = textoPara(lead, 'T1', { negocio: o.negocio || 'fitswapp' });
    const ins = db.prepare(`INSERT INTO venty_s4_oleada_items (oleada_id, user_id, lead_id, canal, tipo, asunto, texto, estado, created_at) VALUES (?,?,?,?,?,?,?,'espejo',?)`)
      .run(oleadaId, userId, lead.id, canal, 'T1', pieza.asunto || '', pieza.texto || '', ahoraIso());
    const itemId = Number(ins.lastInsertRowid);
    const jug = db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
      .run(userId, null, 'oleada_contacto', JSON.stringify({
        oleada_id: oleadaId, item_id: itemId, lead_id: lead.id, lead_nombre: lead.nombre,
        canal, canal_fuente: (!lead.canal_preferido && canal === dominanteOleada) ? 'canal_dominante' : 'canal_preferido',
        tipo_email: 'T1', asunto: pieza.asunto || '', texto: pieza.texto || '',
        destino: lead.contacto_ref, espejo: true,
      }), 'oleada en espejo de tu zona: nada sale en real sin tu aceptación en la bandeja');
    const jugadaId = Number(jug.lastInsertRowid);
    db.prepare('UPDATE venty_s4_oleada_items SET jugada_id = ? WHERE id = ?').run(jugadaId, itemId);
    items.push({ id: itemId, lead_id: lead.id, canal, jugada_id: jugadaId, estado: 'espejo' });
  }
  try { venty.registrarEvento(db, userId, 'oleada_espejo_preparada', null, { oleada_id: oleadaId, zona_id: zonaId, fecha, items: items.length }); } catch (e) {}
  const oleada = db.prepare('SELECT * FROM venty_s4_oleadas WHERE id = ?').get(oleadaId);
  return { ok: true, ya_existia: false, oleada, items };
}

// Prepara la oleada del día para TODAS las zonas del usuario (el trabajo
// diario del representante por zona), compartiendo la dedupe por negocio.
function prepararOleadaDiaria(db, userId, opts) {
  const o = opts || {};
  const venty = o.venty || require('./venty');
  const zonas = venty.listarZonas(db, userId);
  const claves = new Set();
  const porZona = [];
  for (const z of zonas) {
    const r = prepararOleadaZona(db, userId, z.id, { ...o, clavesVistas: [...claves] });
    // la dedupe entre zonas se apoya en las claves de negocio ya usadas
    // en esta corrida (detalle del piloto); sin detalle, cada zona usa
    // sus propios leads y la clave es el nombre del lead.
    for (const it of (r.items || [])) {
      const leadRow = db.prepare('SELECT nombre FROM venty_leads WHERE id = ?').get(it.lead_id);
      if (leadRow) claves.add(norm(leadRow.nombre));
    }
    porZona.push({ zona_id: z.id, zona_nombre: z.nombre, oleada_id: r.oleada ? r.oleada.id : null, items: (r.items || []).length, ya_existia: !!r.ya_existia });
  }
  return { ok: true, fecha: String(o.fecha || hoyYmd()), por_zona: porZona, total_items: porZona.reduce((a, z) => a + z.items, 0) };
}

// ---- espejo obligatorio: verificación de salida ---------------------------
// Sin espejo aceptado en Bandeja (todas las jugadas de la oleada en
// 'aceptada') ninguna oleada pasa a real. Además se verifican, sin enviar
// nada: cupo del gobernador por canal, supresión (email), y las puertas
// del piloto que inyecte el llamador (opts.puertasExtra → [{error,detalle}]).
// Esta función NUNCA envía: solo dictamina. El envío real, cuando las
// puertas se abran, sigue viviendo en venty-email / venty-instagram con
// su propio pedirPermiso + devolverConsumo si el proveedor falla.
function verificarSalida(db, userId, oleadaId, opts) {
  const o = opts || {};
  ensureSchema(db);
  const oleada = db.prepare('SELECT * FROM venty_s4_oleadas WHERE id = ? AND user_id = ?').get(Number(oleadaId || 0), userId);
  if (!oleada) return { puede_salir: false, bloqueos: [{ error: 'oleada_no_encontrada' }] };
  const items = db.prepare('SELECT * FROM venty_s4_oleada_items WHERE oleada_id = ?').all(oleada.id);
  const bloqueos = [];
  if (!items.length) bloqueos.push({ error: 'oleada_sin_items' });
  let espejoAceptado = items.length > 0;
  for (const it of items) {
    const j = it.jugada_id ? db.prepare('SELECT * FROM venty_jugadas WHERE id = ? AND user_id = ?').get(it.jugada_id, userId) : null;
    if (!j || j.estado !== 'aceptada') espejoAceptado = false;
  }
  if (!espejoAceptado) bloqueos.push({ error: 'sin_espejo_aceptado', detalle: 'la prueba en espejo se acepta en la bandeja; sin aceptación ninguna oleada pasa a real' });
  const porCanal = {};
  for (const it of items) porCanal[it.canal] = (porCanal[it.canal] || 0) + 1;
  for (const canal of Object.keys(porCanal)) {
    const c = gobernador.consultar(db, userId, canal, porCanal[canal]);
    if (!c.permitido) bloqueos.push({ error: 'cupo_diario_agotado', canal, detalle: c });
  }
  if (o.puertasExtra) {
    for (const p of o.puertasExtra) if (p) bloqueos.push(p);
  }
  return { puede_salir: bloqueos.length === 0, espejo_aceptado: espejoAceptado, bloqueos, items: items.length, por_canal: porCanal };
}

module.exports = {
  TIPOS_FITSWAPP, CANALES_OLEADA,
  ensureSchema, puntuar, tierDe, textoPara,
  prepararOleadaZona, prepararOleadaDiaria, verificarSalida, hoyYmd,
};
