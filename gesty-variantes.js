// gesty-variantes.js — Variantes de vocabulario de Gesty por tipo de negocio.
//
// Regla: las palabras salen del negocio, nunca de un default de otro rubro.
// Hoy solo varía el botón de la espera (avisar que ya puede pasar); el resto
// del flujo («El cliente llegó», «Esperando ahora», «Atendido», «Pagos del
// día») es genérico por diseño. El tipo lo DECLARA el dueño en Ajustes, de
// una lista cerrada: nunca se adivina desde texto libre ni desde el nombre.
// Sin tipo declarado, el genérico claro: «Ya puede pasar» (dice la acción,
// no el medio, y sirve para cualquier negocio).
'use strict';

const GENERICO = 'Ya puede pasar';
const GENERICO_EN = 'You can come in now';

// Lista cerrada. La palabra es la que el negocio diría en su mostrador.
// Cada variante lleva su texto en español y en inglés (el idioma del cliente:
// la app cambia total entre ES/EN con ME.lang, nunca mezcla).
const VARIANTES = [
  { id: 'cafe', nombre: 'Café / Restaurante / Bar', nombre_en: 'Café / Restaurant / Bar', llamar: 'Su mesa está lista', llamar_en: 'Your table is ready' },
  { id: 'peluqueria', nombre: 'Peluquería / Barbería', nombre_en: 'Hair salon / Barbershop', llamar: 'Te toca', llamar_en: 'You\'re up' },
  { id: 'clinica', nombre: 'Clínica / Consultorio', nombre_en: 'Clinic / Doctor\'s office', llamar: 'Pasá al consultorio', llamar_en: 'Please go to the consulting room' },
  { id: 'estetica', nombre: 'Estética / Spa', nombre_en: 'Beauty / Spa', llamar: 'Pasá al box', llamar_en: 'Please go to the treatment room' },
  { id: 'veterinaria', nombre: 'Veterinaria', nombre_en: 'Veterinary', llamar: 'Pasá al consultorio', llamar_en: 'Please go to the consulting room' },
  { id: 'taller', nombre: 'Taller / Service', nombre_en: 'Workshop / Service', llamar: 'Te toca', llamar_en: 'You\'re up' },
  { id: 'entrenamiento', nombre: 'Gimnasio / Entrenador', nombre_en: 'Gym / Trainer', llamar: 'Te toca', llamar_en: 'You\'re up' },
  { id: 'estudio', nombre: 'Estudio profesional', nombre_en: 'Professional office', llamar: 'Pasá a la oficina', llamar_en: 'Please go to the office' },
];

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_negocio_tipo (user_id INTEGER PRIMARY KEY, rubro TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT '')`);
}

function llamarPara(rubro, lang) {
  const v = VARIANTES.find((x) => x.id === String(rubro || '').trim().toLowerCase());
  if (!v) return lang === 'en' ? GENERICO_EN : GENERICO;
  return lang === 'en' ? v.llamar_en : v.llamar;
}

function lista() {
  return VARIANTES.map((v) => ({ id: v.id, nombre: v.nombre, nombre_en: v.nombre_en, llamar: v.llamar, llamar_en: v.llamar_en }));
}

function getTipo(db, userId) {
  ensureSchema(db);
  try {
    const r = db.prepare('SELECT rubro FROM gesty_negocio_tipo WHERE user_id = ?').get(userId);
    return r ? r.rubro : '';
  } catch (e) { return ''; }
}

function setTipo(db, userId, rubro) {
  ensureSchema(db);
  const id = String(rubro || '').trim().toLowerCase();
  if (!VARIANTES.some((v) => v.id === id)) throw new Error('Ese tipo de negocio no existe.');
  db.prepare(`INSERT INTO gesty_negocio_tipo (user_id, rubro, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET rubro = excluded.rubro, updated_at = excluded.updated_at`).run(userId, id);
  return id;
}

module.exports = { GENERICO, GENERICO_EN, VARIANTES, llamarPara, lista, getTipo, setTipo };
