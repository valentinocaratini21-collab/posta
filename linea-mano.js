'use strict';

// =====================================================================
// LOTE VIGILANTE DE ENTRADAS DE PRUEBA — LA LÍNEA A MANO
// =====================================================================
// Regla de Valentino (15/11/2026): la prueba gratis de un negocio REAL
// la hace bamboo a mano, de punta a punta (1 posteo por día por 3 días,
// producción día a día). Cuando un negocio entra SOLO por la web, esta
// pieza es el vigilante: marca su prueba en el momento en que la
// generación nace, frena la entrega del software sobre esa semana (el
// fundamento sigue corriendo igual — es la base de trabajo de bamboo)
// y despierta a bamboo con los datos justos, el día que toca.
//
// LA MARCA (tabla trial_linea_mano, una fila por clave de caché):
//   - Nace en el flujo de generación (rutas sync y stream), en el punto
//     donde la fase de medios iba a arrancar. Nunca la crea un barrido:
//     si la generación no pasó, no hay semana que vigilar.
//   - Vive mientras la prueba vive. Se levanta sola cuando el invitado
//     se convierte en cliente (is_guest=0 → estado 'convertida'), cuando
//     el reloj de la prueba vence (→ 'cerrada') o cuando el operador
//     resetea la clave (trial-reset → 'cerrada' + exclusión, abajo).
//
// FRONTERA CON EL GATE, POR CONSTRUCCIÓN (no por cuidado):
//   - testMode (test_key del dueño) → jamás se marca. EXCEPCIÓN
//     (LOTE PUERTA-OPERADOR · 23/11): cuando la generación con llave
//     es la puerta del operador corriendo pruebas REALES, el llamador
//     pasa operador:true y la marca SÍ nace, sellada origen='operador'
//     en la fila — son pruebas de la línea a mano corridas por el
//     operador, y la métrica las distingue por ese sello. Las corridas
//     del gate conservan su separación por la exclusión del reseteo,
//     que corre igual para el operador (sin forzar no se salta).
//   - Identidad en la allowlist del candado (las cuentas de la casa)
//     → jamás se marca.
//   - EXCLUSIÓN DEL RESETEO DEL OPERADOR: toda corrida del gate arranca,
//     por constitución, con un trial-reset admin de sus claves. Ese
//     reseteo deja una fila en trial_reset_log; la PRIMERA generación
//     posterior consume la exclusión y NO se marca (un reseteo = una
//     prueba excluida = exactamente la forma de una corrida del gate).
//     Una entrada real posterior, sin reseteo nuevo, se marca normal.
//   Las claves del gate y las entradas reales son poblaciones distintas
//   y el mecanismo las separa sin depender de que nadie se acuerde.
//
// EL DESPERTAR (barrido, mismo patrón */5 que el rescate de semana):
//   por cada marca activa, el barrido ata el invitado (findGuestByIdentity),
//   calcula el día de la prueba desde su alta y abre — una sola vez por
//   disparo — un caso del Conserje tipo «prueba_linea_mano»:
//     · entrada: SOLO dispara la producción del día 1 (el fundamento
//       completo y el arco de 3 días se definen ese día);
//     · día 2 / día 3: el seguimiento propio de la línea — dispara solo
//       si esa pieza todavía no fue cargada a mano (pieza.mano).
//   Doble freno contra el doble aviso: el timestamp del disparo se
//   escribe en la marca en la misma pasada Y openCase deduplica por
//   dedup_key entre casos no cerrados.
//   El caso lleva EXACTAMENTE los datos justos: el @ (o el dominio), la
//   lectura que el software hizo de su Instagram (rubro, estrella,
//   productos), el estado de su fundamento y el contacto público
//   cosechado — el email presente en los textos públicos del propio
//   fundamento (bio / descripción web) o, si no hay ninguno, la marca
//   explícita «sin email público → va por DM». Nada más.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const DIA_MS = 24 * 3600 * 1000;

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS trial_linea_mano (
    cache_key TEXT PRIMARY KEY,
    ig TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT '',
    user_id INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'activa',
    creada_at INTEGER NOT NULL DEFAULT 0,
    aviso_entrada_at INTEGER NOT NULL DEFAULT 0,
    aviso_dia2_at INTEGER NOT NULL DEFAULT 0,
    aviso_dia3_at INTEGER NOT NULL DEFAULT 0,
    cerrada_at INTEGER NOT NULL DEFAULT 0,
    motivo_cierre TEXT NOT NULL DEFAULT ''
  )`);
  try { db.exec(`ALTER TABLE trial_linea_mano ADD COLUMN origen TEXT NOT NULL DEFAULT ''`); } catch (e) {}
  db.exec(`CREATE TABLE IF NOT EXISTS trial_reset_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT '',
    value TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL DEFAULT 0,
    consumida INTEGER NOT NULL DEFAULT 0
  )`);
}

// La clave de caché de una prueba: el @ o, sin @, «web:<dominio>» —
// el mismo espejo que usa trial_cache (trialCacheWriteWeb).
function claveCache(igKey, domainKey) {
  const ig = String(igKey || '').trim();
  if (ig) return ig;
  const dom = String(domainKey || '').trim();
  return dom ? 'web:' + dom : '';
}

// El reseteo del operador (la palanca admin trial-reset, en su camino
// confirmado): deja la exclusión durable para la próxima generación de
// la clave y levanta cualquier marca activa (el operador retomó la
// clave: la semana vieja ya no es de la línea a mano).
function registrarReseteo(db, igKey, domainKey, now) {
  ensureSchema(db);
  const t = Number(now) || Date.now();
  const ig = String(igKey || '').trim();
  const dom = String(domainKey || '').trim();
  let registrado = 0;
  if (ig) { db.prepare('INSERT INTO trial_reset_log (kind, value, at, consumida) VALUES (?, ?, ?, 0)').run('ig', ig, t); registrado++; }
  if (dom) { db.prepare('INSERT INTO trial_reset_log (kind, value, at, consumida) VALUES (?, ?, ?, 0)').run('domain', dom, t); registrado++; }
  let levantadas = 0;
  for (const k of [claveCache(ig, ''), claveCache('', dom)].filter(Boolean)) {
    const r = db.prepare(`UPDATE trial_linea_mano SET estado = 'cerrada', cerrada_at = ?, motivo_cierre = 'reseteo-operador'
      WHERE cache_key = ? AND estado = 'activa'`).run(t, k);
    levantadas += (r && r.changes) || 0;
  }
  return { registrado, levantadas };
}

// EL NACIMIENTO DE LA MARCA. Lo llaman las dos rutas de generación en
// el punto exacto donde iba a arrancar la fase de medios. Devuelve
// { marcada, motivo } y nunca tira: si algo falla, la generación sigue
// como hoy (sin marca) — el vigilante jamás frena una prueba.
// (LOTE PUERTA-SIN-GASTO) opts.forzar: el nacimiento de la puerta sin
// gasto marca SIEMPRE, desde la entrada misma — la exclusión del
// reseteo no se consulta ni se consume (queda disponible para un
// nacimiento del gate, si alguna vez vuelve) y la semana cáscara nace
// marcada aunque el operador haya reseteado la prueba minutos antes
// (la R1 de la tanda mixta rebotó 409 sin_marca exactamente por esto).
function nace(db, o) {
  try {
    const opts = o || {};
    if (opts.testMode && !opts.operador) return { marcada: false, motivo: 'test-mode' };
    const ig = String(opts.ig || '').trim();
    const dom = String(opts.domain || '').trim();
    const key = claveCache(ig, dom);
    if (!key) return { marcada: false, motivo: 'sin-clave' };
    if (opts.allowlisted) return { marcada: false, motivo: 'allowlist' };
    ensureSchema(db);
    const prev = db.prepare('SELECT cache_key, estado FROM trial_linea_mano WHERE cache_key = ?').get(key);
    if (prev && prev.estado === 'activa') return { marcada: true, motivo: 'ya-marcada' };
    // La exclusión del reseteo: la primera generación tras un reseteo
    // del operador consume UNA fila sin consumir y no se marca. Con
    // forzar (la puerta sin gasto) no corre: la marca nace igual y la
    // exclusión queda intacta, sin consumir.
    if (!opts.forzar) {
      const ex = db.prepare(`SELECT id FROM trial_reset_log WHERE consumida = 0 AND
        ((kind = 'ig' AND ? <> '' AND value = ?) OR (kind = 'domain' AND ? <> '' AND value = ?))
        ORDER BY at ASC, id ASC LIMIT 1`).get(ig, ig, dom, dom);
      if (ex) {
        db.prepare('UPDATE trial_reset_log SET consumida = 1 WHERE id = ?').run(ex.id);
        return { marcada: false, motivo: 'reseteo-operador' };
      }
    }
    const t = Number(opts.now) || Date.now();
    db.prepare(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at, origen)
      VALUES (?, ?, ?, 0, 'activa', ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET ig = excluded.ig, domain = excluded.domain,
        estado = 'activa', creada_at = excluded.creada_at, user_id = 0, origen = excluded.origen,
        aviso_entrada_at = 0, aviso_dia2_at = 0, aviso_dia3_at = 0,
        cerrada_at = 0, motivo_cierre = ''`).run(key, ig, dom, t, opts.operador ? 'operador' : '');
    return { marcada: true, motivo: 'nace' };
  } catch (e) {
    return { marcada: false, motivo: 'error' };
  }
}

// ¿La clave tiene una marca activa? La consulta la cadena de rescate en
// su cabeza: sobre una prueba marcada, el software no entrega piezas.
function marcaActiva(db, cacheKey) {
  try {
    if (!cacheKey) return null;
    ensureSchema(db);
    return db.prepare(`SELECT * FROM trial_linea_mano WHERE cache_key = ? AND estado = 'activa'`).get(String(cacheKey)) || null;
  } catch (e) { return null; }
}

function piezaCargada(payload, idx) {
  try {
    const p = payload && Array.isArray(payload.posts) ? payload.posts[idx] : null;
    return !!(p && p.mano && p.mano.cargada_at);
  } catch (e) { return false; }
}

// El contacto público cosechado: el fundamento NO trae un campo de
// email público (verificado contra buildTrialDigest: su bloque web es
// nombre/descripción/servicios/ciudad/paleta/url) — el email, cuando el
// negocio lo publica, vive en sus textos públicos que el fundamento sí
// capturó (la bio de Instagram, la descripción de su web). Se extrae de
// ahí con regex estricta; si no aparece, la marca honesta es el DM.
function contactoPublico(payload) {
  try {
    const d = (payload && payload.digest) || {};
    const textos = [
      d.feed && d.feed.bio,
      d.web && d.web.description,
      d.webCopy,
      payload && payload.profile && payload.profile.bio,
      payload && payload.profile && payload.profile.biography,
    ];
    for (const t of textos) {
      if (!t) continue;
      const m = EMAIL_RE.exec(String(t));
      if (m) return { email: m[0].toLowerCase(), via: 'email' };
    }
    return { email: null, via: 'dm' };
  } catch (e) { return { email: null, via: 'dm' }; }
}

// La lectura que el software hizo de su Instagram, en una línea:
// rubro · estrella · cuántos productos/servicios vio.
function lecturaIg(payload) {
  const d = (payload && payload.digest) || {};
  const rubro = String((payload && payload.category) || d.rubro_detectado || d.categoria || '').trim();
  const estrella = String(d.producto_estrella || '').trim();
  const nProd = Array.isArray(d.productos) ? d.productos.length : 0;
  const nServ = Array.isArray(d.servicios) ? d.servicios.length : 0;
  const partes = [];
  partes.push('rubro ' + (rubro || 'sin confirmar'));
  partes.push('estrella: ' + (estrella || 'sin confirmar'));
  partes.push(nProd + ' productos · ' + nServ + ' servicios');
  return partes.join(' · ');
}

// El estado del fundamento, derivado del payload guardado: sin semana
// (todavía no hay payload), en armado (piezas en armado honesto) o con
// fundamento (la semana y su fundamento están servidos).
function estadoFundamento(payload) {
  if (!payload || !Array.isArray(payload.posts)) return 'sin-semana';
  if (payload.posts.some((p) => p && p.armando)) return 'en-armado';
  return 'con-fundamento';
}

// El día de la prueba desde el alta del invitado: día 1 = [alta, +24h),
// día 2 = [+24h, +48h), día 3 = [+48h, +72h); 0 = fuera de ventana.
// El alta (users.created_at) es un datetime UTC en texto — el mismo
// parseo que guestTrialEnd — o un epoch en ms; se aceptan los dos.
function altaMs(creadaAt) {
  const n = Number(creadaAt);
  if (Number.isFinite(n) && n > 0) return n;
  const p = Date.parse(String(creadaAt || '').replace(' ', 'T') + 'Z');
  return Number.isFinite(p) ? p : 0;
}
function diaDePrueba(creadaAt, now) {
  const c = altaMs(creadaAt);
  const t = Number(now) || Date.now();
  if (!c || t < c) return 1;
  const d = Math.floor((t - c) / DIA_MS) + 1;
  return d >= 1 && d <= 3 ? d : 0;
}

// Los datos justos del caso, en el cuerpo: @ o dominio, la lectura de
// su Instagram, el estado del fundamento y el contacto. Nada más.
function detalleCaso(marca, payload) {
  const quien = marca.ig ? '@' + marca.ig : ('dominio ' + (marca.domain || marca.cache_key.replace(/^web:/, '')));
  const c = contactoPublico(payload);
  return [
    'Negocio: ' + quien,
    'Lectura de su Instagram: ' + lecturaIg(payload),
    'Fundamento: ' + estadoFundamento(payload),
    'Contacto: ' + (c.email ? c.email : 'sin email público → va por DM'),
  ].join('\n');
}

// EL BARRIDO DEL VIGILANTE (el despertar + el seguimiento por prueba).
// deps: { findGuest(db, ig, domain), getUser(db, id), guestEnd(user, now),
//         openCase(db, fields) } — inyectadas desde server.js para no
// acoplar el módulo a sus internos. Nunca tira.
function barrido(db, deps, now) {
  const t = Number(now) || Date.now();
  const res = { marcas: 0, atadas: 0, avisos: 0, convertidas: 0, cerradas: 0 };
  try {
    ensureSchema(db);
    const marcas = db.prepare(`SELECT * FROM trial_linea_mano WHERE estado = 'activa'`).all();
    res.marcas = marcas.length;
    for (const marca of marcas) {
      try {
        // 1) Atar el invitado (la marca nace en la generación, que puede
        // preceder al alta del invitado: el atado es del barrido).
        let uid = Number(marca.user_id) || 0;
        if (!uid && deps && typeof deps.findGuest === 'function') {
          const g = deps.findGuest(db, marca.ig, marca.domain);
          if (g && g.id) {
            uid = Number(g.id) || 0;
            if (uid) {
              db.prepare('UPDATE trial_linea_mano SET user_id = ? WHERE cache_key = ?').run(uid, marca.cache_key);
              res.atadas++;
            }
          }
        }
        if (!uid) continue; // sin invitado todavía: el caso no puede abrir (openCase exige usuario)
        const user = deps && typeof deps.getUser === 'function' ? deps.getUser(db, uid) : null;
        if (!user) continue;
        // 2) Ciclo de vida: conversión y vencimiento levantan la marca.
        if (!user.is_guest) {
          db.prepare(`UPDATE trial_linea_mano SET estado = 'convertida', cerrada_at = ?, motivo_cierre = 'convirtio' WHERE cache_key = ?`).run(t, marca.cache_key);
          res.convertidas++;
          continue;
        }
        const fin = deps && typeof deps.guestEnd === 'function' ? Number(deps.guestEnd(user, t)) : 0;
        if (fin && t >= fin) {
          db.prepare(`UPDATE trial_linea_mano SET estado = 'cerrada', cerrada_at = ?, motivo_cierre = 'vencio' WHERE cache_key = ?`).run(t, marca.cache_key);
          res.cerradas++;
          continue;
        }
        // 3) Los disparos, una sola vez cada uno.
        let payload = null;
        try {
          const row = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(marca.cache_key);
          if (row && row.payload) payload = JSON.parse(row.payload);
        } catch (e) {}
        const abrir = (disparo, titulo, paso) => {
          const r = deps.openCase(db, {
            userId: uid, tipo: 'prueba_linea_mano',
            titulo, detalle: detalleCaso(marca, payload),
            siguientePaso: paso,
            dedupKey: 'trial-mano:' + uid + ':' + disparo,
          });
          return !!(r && r.ok);
        };
        const quien = marca.ig ? '@' + marca.ig : (marca.domain || marca.cache_key);
        if (!marca.aviso_entrada_at) {
          if (abrir('entrada',
            'Prueba a mano: entrada nueva de ' + quien + ' — producir el día 1',
            'Producir SOLO la pieza del día 1: el fundamento completo y el arco de los 3 días (estrella → proceso → momento) se definen hoy. La pieza se carga en su día con la palanca admin de pieza a mano.')) {
            db.prepare('UPDATE trial_linea_mano SET aviso_entrada_at = ? WHERE cache_key = ?').run(t, marca.cache_key);
            res.avisos++;
          }
        }
        const dia = diaDePrueba(user.created_at, t);
        if (dia >= 2 && !marca.aviso_dia2_at && !piezaCargada(payload, 1)) {
          if (abrir('dia2',
            'Prueba a mano: ' + quien + ' está en su día 2 — producir y cargar la pieza de hoy',
            'Producir la pieza del día 2 (proceso, según el arco definido el día 1) y cargarla hoy con la palanca admin de pieza a mano.')) {
            db.prepare('UPDATE trial_linea_mano SET aviso_dia2_at = ? WHERE cache_key = ?').run(t, marca.cache_key);
            res.avisos++;
          }
        }
        if (dia >= 3 && !marca.aviso_dia3_at && !piezaCargada(payload, 2)) {
          if (abrir('dia3',
            'Prueba a mano: ' + quien + ' está en su día 3 — producir y cargar la pieza de hoy',
            'Producir la pieza del día 3 (momento, cierre del arco) y cargarla hoy con la palanca admin de pieza a mano.')) {
            db.prepare('UPDATE trial_linea_mano SET aviso_dia3_at = ? WHERE cache_key = ?').run(t, marca.cache_key);
            res.avisos++;
          }
        }
      } catch (e) { /* una marca jamás frena el barrido de las demás */ }
    }
  } catch (e) {}
  return res;
}

module.exports = {
  ensureSchema,
  claveCache,
  registrarReseteo,
  nace,
  marcaActiva,
  piezaCargada,
  contactoPublico,
  lecturaIg,
  estadoFundamento,
  diaDePrueba,
  detalleCaso,
  barrido,
  EMAIL_RE,
};
