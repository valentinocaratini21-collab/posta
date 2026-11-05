// premios-notif.js — Aviso de premio nuevo (lote PREMIOS-NOTIF, 4/11).
// La tira de Premios salió de Inicio (v653): un premio nuevo ya no se ve
// ahí, así que avisa por dos vías: (1) push al desbloquearse (la dispara el
// publish, ver scheduler.js) y (2) badge en el tab Premios del dock hasta
// que el usuario abra Premios (cliente, ver public/app.js).
//
// Un premio nuevo = un nivel nuevo. El motor de niveles NO se toca
// (SOLO-POSTEOS v637: nivelPosty cuenta posteos hechos a través de Posty);
// este módulo solo registra QUÉ niveles ya se avisaron y cuáles faltan ver.
//
// Anti-spam, por diseño:
// - Una sola fila no vista por nivel (PRIMARY KEY user_id+nivel): subir dos
//   niveles en un salto crea dos filas, pero la push es UNA y cubre ambos.
// - La primera vez que se procesa un usuario SOLO se deja la línea base
//   (sin filas no vistas ni push): los niveles ya ganados antes de este
//   lote no spamean (p. ej. un usuario que ya está en Nv 5 no recibe 5
//   avisos viejos al desplegar).
// - Todo fail-closed: cualquier error devuelve vacío y nunca rompe el
//   publish ni el render (el badge, en el peor caso, no aparece; el nivel
//   y los premios siguen intactos).
'use strict';

function ensure(db) {
  try { db.exec(`CREATE TABLE IF NOT EXISTS pz_premios_procesado (user_id INTEGER PRIMARY KEY, nivel INTEGER NOT NULL, ts INTEGER NOT NULL)`); } catch (e) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS pz_premios_no_vistos (user_id INTEGER NOT NULL, nivel INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (user_id, nivel))`); } catch (e) {}
}

// Procesa el nivel actual del usuario y devuelve los niveles nuevos desde
// la última vez procesada (vacío si no subió, o si es la línea base).
function procesarNivel(db, uid, nivel) {
  ensure(db);
  const nv = Math.max(1, Math.min(50, Math.floor(Number(nivel) || 1)));
  const ahora = Date.now();
  let proc = null;
  try { proc = db.prepare('SELECT nivel FROM pz_premios_procesado WHERE user_id = ?').get(uid); } catch (e) {}
  if (!proc) {
    try { db.prepare('INSERT OR REPLACE INTO pz_premios_procesado (user_id, nivel, ts) VALUES (?,?,?)').run(uid, nv, ahora); } catch (e) {}
    return { nivel: nv, nuevos: [], base: true };
  }
  const desde = Math.max(1, Math.min(50, Number(proc.nivel) || 1));
  if (nv <= desde) return { nivel: nv, nuevos: [], base: false };
  const nuevos = [];
  for (let L = desde + 1; L <= nv; L++) {
    try { db.prepare('INSERT OR IGNORE INTO pz_premios_no_vistos (user_id, nivel, ts) VALUES (?,?,?)').run(uid, L, ahora); } catch (e) {}
    nuevos.push(L);
  }
  try { db.prepare('INSERT OR REPLACE INTO pz_premios_procesado (user_id, nivel, ts) VALUES (?,?,?)').run(uid, nv, ahora); } catch (e) {}
  return { nivel: nv, nuevos, base: false };
}

// Niveles con premio sin ver (orden ascendente). Nunca inventa: solo filas.
function noVistos(db, uid) {
  ensure(db);
  try {
    const rows = db.prepare('SELECT nivel FROM pz_premios_no_vistos WHERE user_id = ? ORDER BY nivel ASC').all(uid);
    return (rows || []).map((r) => Number(r.nivel)).filter((n) => n >= 1 && n <= 50);
  } catch (e) { return []; }
}

// Marca todos los premios del usuario como vistos (al abrir Premios).
// Devuelve cuántos se limpiaron.
function marcarVistos(db, uid) {
  ensure(db);
  try {
    const r = db.prepare('DELETE FROM pz_premios_no_vistos WHERE user_id = ?').run(uid);
    return (r && typeof r.changes === 'number') ? r.changes : 0;
  } catch (e) { return 0; }
}

// Texto de la push de premio nuevo, con el nombre REAL del premio (nivel y,
// si existe, la cosa de oficina de ese nivel — prestigio.desbloqueoEn; los
// niveles 1–5 no tienen desbloqueo y van solo con el nombre del nivel).
// Un nivel: nombra ese premio. Varios: nombra el más alto y dice cuántos
// son, para que un salto de 2 niveles sea UN aviso, no dos.
function textoPush(nivel, nombreNivel, desbloqueo, nuevos) {
  const nv = Math.max(1, Math.min(50, Math.floor(Number(nivel) || 1)));
  const nom = String(nombreNivel || ('Nivel ' + nv));
  const lista = Array.isArray(nuevos) ? nuevos.filter((n) => n >= 1 && n <= 50) : [];
  if (lista.length > 1) {
    const extra = desbloqueo ? ` — desbloqueaste ${desbloqueo} y ${lista.length - 1} más` : ` — ${lista.length} premios nuevos`;
    return { title: '¡Nuevos premios! 🎉', body: `Subiste al Nivel ${nv} · ${nom}${extra}. Miralos en Premios 👇` };
  }
  const extra = desbloqueo ? ` — desbloqueaste ${desbloqueo}` : '';
  return { title: '¡Nuevo premio! 🎉', body: `Subiste al Nivel ${nv} · ${nom}${extra}. Miralo en Premios 👇` };
}

module.exports = { ensure, procesarNivel, noVistos, marcarVistos, textoPush };
