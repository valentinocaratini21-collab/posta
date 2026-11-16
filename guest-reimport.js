'use strict';

// =====================================================================
// LOTE REIMPORTACIÓN DEL INVITADO — LA SEMANA A MANO QUE SÍ APARECE
// =====================================================================
// El hueco (hallazgo de importación, probado el 2026-11-16): en una
// semana de prueba MARCADA (línea a mano), las piezas que bamboo carga
// con la palanca (POST /api/admin/trial/pieza-mano) viven en el
// payload de trial_cache — y la palanca crea la fila en el acto SOLO
// si la cuenta ya tiene posteos. Si la semana nunca se importó (el
// invitado entró con la semana en armado, su sesión quedó abierta por
// la salida 202 de guest/start y las cargas llegaron DESPUÉS), la
// pieza queda solo en el payload y ninguna superficie de la app la
// muestra: el invitado abre su semana vacía. Probado dos veces
// (invitado 111 @shakeshack: importó vacía al aterrizar, antes de la
// carga; invitado 112 @chipotle: el día 1 se cargó a las 08:09, ANTES
// del aterrizaje de las 08:10, y aun así cerró con cero filas) y vivo
// hoy en el invitado 110 (Patagonia: día 1 + carrusel del día 2
// aprobados, en el payload, con cero filas).
//
// Los caminos que importan hoy (guest/start, set-ig, alta/login) no
// vuelven a pasar por la sesión que ya quedó abierta. Este módulo es
// el gancho que faltaba, con DOS gatillos y UNA sola puerta:
//
//   (a) el aterrizaje por la puerta de regreso (GET /api/guest/return)
//   (b) la apertura de la app con sesión de invitado — su primera
//       lectura de posteos (GET /api/posts, el fetch del Inicio)
//
// LA PUERTA (alcance del lote): entra solo la semana que cumple TODO:
//   · el dueño es invitado (users.is_guest = 1)
//   · su clave de caché tiene la marca de línea a mano ACTIVA
//   · la marca, si ya está atada a un invitado, es de ESTE invitado
//   · el payload trae piezas con medio (las que importTrialWeek importa)
//   · la cuenta tiene CERO filas en posts
// Cualquier otra cuenta — registrada, o invitado sin marca (la semana
// del software, que importa por sus caminos de siempre) — sale por el
// primer control que no cumple, sin tocar nada: su comportamiento es
// el de hoy, byte por byte.
//
// IDEMPOTENCIA, por construcción y no por cuidado: la puerta exige
// cero filas e importTrialWeek aborta si la cuenta tiene posteos —
// correr el gancho dos veces (los dos gatillos, o aperturas
// repetidas de la app) crea las filas una sola vez y jamás reescribe
// el estado de una fila ya importada. Las semanas PARCIALES (algunas
// filas sí, otras piezas solo en el payload) NO son de este lote: las
// completa la cadena de rescate (crearPosteoRescateTardio) y la
// propia palanca al cargar sobre una semana ya importada.
//
// SIN GASTO: el gancho lee la caché y corre la importación que ya
// existe, con el mismo cierre que guest/start (idioma, siembra del
// fundamento, registro, entrega y agenda — todo trabajo de base de
// datos sobre datos ya cosechados). Jamás re-engancha la cadena de
// generación/rescate (rearmarSemanaPruebaPorCacheKey NO se llama) ni
// ninguna IA: el bote del demo no se toca.

// Las piezas que importTrialWeek importa: las que traen medio. Es el
// MISMO filtro de la importación (server.js importTrialWeek), para que
// «piezas en el payload» signifique exactamente «piezas importables».
function piezasConMedio(payload) {
  try {
    const posts = (payload && Array.isArray(payload.posts)) ? payload.posts : [];
    return posts.filter((p) => p && (p.image || p.video)).length;
  } catch (e) { return 0; }
}

// La decisión + la corrida. deps (las inyecta server.js, el dueño de
// la maquinaria): { lineaMano, importTrialWeek, alImportar, evTrack }.
// Nunca tira: devuelve { applied, reason, imported, cacheKey }.
function reimportSiAplica(db, userId, deps) {
  const out = { applied: false, reason: '', imported: 0, cacheKey: '' };
  try {
    const uid = Number(userId) || 0;
    if (!uid || !deps || !deps.lineaMano || typeof deps.importTrialWeek !== 'function') { out.reason = 'sin-deps'; return out; }
    const u = db.prepare('SELECT is_guest, guest_ig, guest_domain FROM users WHERE id = ?').get(uid);
    if (!u) { out.reason = 'sin-usuario'; return out; }
    if (u.is_guest !== 1) { out.reason = 'no-invitado'; return out; }
    // Las filas primero: es el control más barato y el que cierra la
    // idempotencia — con filas, no hay nada que re-importar.
    const nFilas = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(uid).c;
    if (nFilas > 0) { out.reason = 'ya-importada'; return out; }
    const ig = String(u.guest_ig || '').trim().toLowerCase();
    const dom = String(u.guest_domain || '').trim().toLowerCase();
    const claves = [];
    const k1 = deps.lineaMano.claveCache(ig, dom);
    if (k1) claves.push(k1);
    if (ig && dom) { const k2 = 'web:' + dom; if (!claves.includes(k2)) claves.push(k2); }
    if (!claves.length) { out.reason = 'sin-clave'; return out; }
    let vioMarca = false;
    for (const cacheKey of claves) {
      const marca = deps.lineaMano.marcaActiva(db, cacheKey);
      if (!marca) continue;
      vioMarca = true;
      if (Number(marca.user_id || 0) > 0 && Number(marca.user_id) !== uid) { out.reason = 'marca-de-otro'; return out; }
      const row = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(cacheKey);
      if (!row || !row.payload) continue;
      let payload = null;
      try { payload = JSON.parse(row.payload); } catch (e) { continue; }
      if (!piezasConMedio(payload)) continue;
      // La importación de siempre, con el límite de la prueba (3) y
      // sus propias guardas intactas (motor, contradicción, filas):
      // si ella decide no importar, su cero manda y acá no pasó nada.
      const nImp = deps.importTrialWeek(uid, ig, null, { limit: 3, cacheKey });
      if (!nImp) { out.reason = 'import-en-cero'; out.cacheKey = cacheKey; return out; }
      out.applied = true;
      out.imported = nImp;
      out.cacheKey = cacheKey;
      if (typeof deps.alImportar === 'function') { try { deps.alImportar(uid, ig, cacheKey, nImp); } catch (e) {} }
      if (typeof deps.evTrack === 'function') { try { deps.evTrack(uid, 'trial_reimport', { ig: cacheKey, importados: nImp }); } catch (e) {} }
      return out;
    }
    out.reason = vioMarca ? 'sin-piezas' : 'sin-marca';
    return out;
  } catch (e) {
    out.reason = 'error';
    return out;
  }
}

module.exports = { reimportSiAplica, piezasConMedio };
