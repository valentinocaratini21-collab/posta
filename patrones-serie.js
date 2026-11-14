'use strict';
// patrones-serie.js — LOTE PATRONES-DE-SERIE (14/11/2026).
//
// Orden de Valentino (14/11 14:24 EST): «quiero que entrenes a Posti
// para que entienda de patrones. Por ejemplo, si se suben tres posteos
// seguidos, el mismo rubro, que no rehaga un posteo de el avatar de
// Posti. Porque si no tengo que ir explicando todos los días lo mismo.
// Esa es la última vez que suceda esto y que salga en automático.»
//
// Diseño: ~/workspace/.diag-patrones-serie/DISENO.md. La causa raíz que
// cierra este lote: cada camino que rehace/regenera/re-agenda trataba
// el posteo como una isla — el ROL de la pieza dentro de su serie no
// existía como dato. Acá vive el dato y los veredictos puros de los
// candados; la persistencia es posts.rol_serie (JSON chico
// {avatar, texto}) + posts.frenada (0/1), y el perfil de serie lo
// calcula perfilContinuidadSerie (demo.js), extendido por este lote
// con la dimensión rol_avatar — un solo mecanismo, dos capas.
//
// Ejes del rol (independientes, cada uno con presencia propia):
//   avatar: 'en_escena' | 'sello' | 'ausente' | 'no_determinado'
//     en_escena = el personaje/avatar está DENTRO de la escena.
//     sello     = no está en escena; va su cara/logo en el círculo.
//     ausente   = ni escena ni sello.
//     no_determinado = el eje entró al sistema de patrones pero la
//       clasificación no pudo decidir (fail-closed: NO es un pase).
//   texto: 'con-texto' | 'sin-texto' (el sistema de texto de su tira).
// Un eje AUSENTE en el JSON = la pieza todavía no entró al sistema de
// patrones por ese eje (legado): los candados no la frenan por ese
// eje — adquiere el dato cuando el plan la asigna, la importación la
// estampa o la clasificación la siembra. Un eje PRESENTE manda: si
// dice 'no_determinado', los reemplazos automáticos no improvisan
// (recibo honesto + conserje, riel de v1077).

const ROL_AVATAR_VALORES = ['en_escena', 'sello', 'ausente', 'no_determinado'];
const ROL_TEXTO_VALORES = ['con-texto', 'sin-texto'];

function parseRolSerie(raw) {
  if (!raw) return null;
  let o = raw;
  if (typeof raw === 'string') {
    try { o = JSON.parse(raw); } catch (e) { return null; }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  if (ROL_AVATAR_VALORES.includes(o.avatar)) out.avatar = o.avatar;
  if (ROL_TEXTO_VALORES.includes(o.texto)) out.texto = o.texto;
  return Object.keys(out).length ? out : null;
}

// El eje avatar TAL COMO ESTÁ DECLARADO en la pieza: el valor si el
// JSON lo trae, null si la pieza no entró al sistema por ese eje.
function ejeAvatar(post) {
  const r = parseRolSerie(post && post.rol_serie);
  return r && r.avatar ? r.avatar : null;
}
function ejeTexto(post) {
  const r = parseRolSerie(post && post.rol_serie);
  return r && r.texto ? r.texto : null;
}
// Lectura efectiva para perfiles y chequeos de patrón: sin eje
// declarado, el valor honesto es 'no_determinado'.
function rolAvatarEfectivo(post) {
  return ejeAvatar(post) || 'no_determinado';
}

function esFrenada(post) {
  return Number((post && post.frenada) || 0) === 1;
}
// Pieza nacida FUERA del plan de la serie (hoy: la subida del cliente
// por el tab Subir — tiene su propio flujo de ubicación al subir).
function fueraDeSerie(post) {
  return String((post && post.source) || '') === 'subir';
}

// Estampa (merge) el rol en la pieza. Nunca pisa un eje con vacío:
// solo escribe los ejes válidos que trae el parche. Devuelve el JSON
// resultante o null si no se pudo.
function sellarRolSerie(db, postId, parche) {
  try {
    const row = db.prepare('SELECT rol_serie FROM posts WHERE id = ?').get(Number(postId));
    if (!row) return null;
    const cur = parseRolSerie(row.rol_serie) || {};
    const next = { ...cur };
    if (parche && ROL_AVATAR_VALORES.includes(parche.avatar)) next.avatar = parche.avatar;
    if (parche && ROL_TEXTO_VALORES.includes(parche.texto)) next.texto = parche.texto;
    if (!Object.keys(next).length) return null;
    const json = JSON.stringify(next);
    db.prepare('UPDATE posts SET rol_serie = ? WHERE id = ?').run(json, Number(postId));
    return json;
  } catch (e) { return null; }
}

function marcarFrenada(db, postId, valor) {
  try {
    db.prepare('UPDATE posts SET frenada = ? WHERE id = ?').run(valor ? 1 : 0, Number(postId));
    return true;
  } catch (e) { return false; }
}

// CANDADO C1 (puro) — el veredicto ANTES de reemplazar la imagen de
// una pieza por el camino de rehacer-foto del chat (D3). El gate de
// generación ya trae el veredicto de personaje de la pieza NUEVA
// (gate.character: 'passed' = un personaje verificado EN escena ·
// 'failed' = el protagonista es otro o no aparece · 'unverified' ·
// 'n/a' = sin protagonista con lock, nada que verificar).
//   · eje presente y 'no_determinado' → bloquea (rol_no_determinado):
//     el reemplazo automático no improvisa sobre una pieza de serie
//     cuyo rol no se pudo determinar (§4.3 del diseño).
//   · 'en_escena' + character 'failed' → bloquea (rol-avatar-roto):
//     la pieza nueva perdió al avatar (el characterBlocksDelivery
//     vigente ya frena este caso aguas arriba; el candado lo nombra).
//   · 'sello'/'ausente' + character 'passed' → bloquea
//     (rol-avatar-roto): la pieza nueva METIÓ un personaje en escena
//     que la pieza no tenía — el patrón de la tira se rompía igual.
//   · cualquier otro caso → no bloquea (mandan los gates vigentes).
function veredictoCandadoFoto({ ejePresente, avatar, character } = {}) {
  if (!ejePresente) return { bloquea: false, motivo: null };
  if (avatar === 'no_determinado') return { bloquea: true, motivo: 'rol_no_determinado' };
  if (avatar === 'en_escena' && character === 'failed') return { bloquea: true, motivo: 'rol_avatar' };
  if ((avatar === 'sello' || avatar === 'ausente') && character === 'passed') return { bloquea: true, motivo: 'rol_avatar' };
  return { bloquea: false, motivo: null };
}

module.exports = {
  ROL_AVATAR_VALORES,
  ROL_TEXTO_VALORES,
  parseRolSerie,
  ejeAvatar,
  ejeTexto,
  rolAvatarEfectivo,
  esFrenada,
  fueraDeSerie,
  sellarRolSerie,
  marcarFrenada,
  veredictoCandadoFoto,
};
