'use strict';
// (LOTE MODO LISTA · asiento del tablero 2026-11-21 20:04, vencimiento
// 2026-11-22 por el arranque de la campaña «se viene»)
// LA PUERTA PÚBLICA EN MODO LISTA HASTA EL LANZAMIENTO.
//
// La puerta pública (landing + /prueba, ES y EN) no arma semanas ni
// arranca pruebas hasta el lanzamiento: captura los tres datos de
// siempre (@ + web + email, el email obligatorio desde PRUEBA-RECUERDA)
// y deja al negocio EN LISTA DE ESPERA, con el mensaje honesto de que
// las pruebas abren el 1° de febrero y que se le avisa por email.
//
// INTERRUPTOR (no es código para revertir): el modo se apaga con la
// variable de entorno PUERTA_MODO=normal. Sin la variable, el modo
// lista está ACTIVO. La reapertura del 1/2 es este interruptor — ítem
// declarado de la checklist de lanzamiento.
//
// EXENTOS (la puerta de operador no se gobierna por esto): el modo test
// (?test_key, la llave del dueño) y la allowlist de trial-lock (las
// cuentas de la casa) siguen el camino de siempre, intacto. Las rutas
// /api/admin/* ni se tocan.
//
// La lista vive en su propia tabla (lista_espera): es el registro que
// el lanzamiento usa el 1/2 para avisar a cada negocio anotado. Un
// negocio en lista NO es un invitado: no tiene fila en users, no tiene
// posteos, no tiene reloj de prueba — y por eso mismo la serie
// PRUEBA-RECUERDA no puede dispararle (su audiencia son invitados con
// posteos pendientes de conexión; el que está en lista no existe ahí).

const LANZAMIENTO = '2027-02-01';

function activo() {
  return String(process.env.PUERTA_MODO || 'lista').trim().toLowerCase() !== 'normal';
}

function mensaje(lang) {
  return lang === 'en'
    ? 'Trials open on February 1 💛 You are on the list — we will email you as soon as you can start.'
    : 'Las pruebas abren el 1° de febrero 💛 Ya estás en la lista — te avisamos por email apenas puedas entrar.';
}

function ensureSchema(db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS lista_espera (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ig TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    lang TEXT NOT NULL DEFAULT 'es',
    sin_web INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0
  )`).run();
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_lista_espera_negocio ON lista_espera (ig, domain, email)').run();
}

// Registra (o refresca) la captura de la puerta en la lista. La misma
// identidad + el mismo email = una sola fila: re-anotarse no duplica.
function registrar(db, datos) {
  const d = datos || {};
  ensureSchema(db);
  const ig = String(d.ig || '');
  const domain = String(d.domain || '');
  const email = String(d.email || '').trim().toLowerCase();
  const lang = d.lang === 'en' ? 'en' : 'es';
  const sinWeb = d.sinWeb ? 1 : 0;
  const now = Date.now();
  db.prepare(`INSERT INTO lista_espera (ig, domain, email, lang, sin_web, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(ig, domain, email) DO UPDATE SET
      lang = excluded.lang, sin_web = excluded.sin_web, created_at = excluded.created_at`)
    .run(ig, domain, email, lang, sinWeb, now);
  return db.prepare('SELECT * FROM lista_espera WHERE ig = ? AND domain = ? AND email = ?').get(ig, domain, email);
}

function enLista(db, ig, domain) {
  try {
    ensureSchema(db);
    const row = db.prepare(`SELECT * FROM lista_espera
      WHERE (? <> '' AND ig = ?) OR (? <> '' AND domain = ?) ORDER BY id DESC LIMIT 1`)
      .get(ig || '', ig || '', domain || '', domain || '');
    return row || null;
  } catch (e) { return null; }
}

module.exports = { LANZAMIENTO, activo, mensaje, ensureSchema, registrar, enLista };
