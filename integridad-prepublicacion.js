'use strict';
// integridad-prepublicacion.js — LOTE INTEGRIDAD-PRE-PUBLICACIÓN.
//
// Orden permanente de Valentino (15/11, sobre los tres defectos de su
// cuenta esa noche): «No puede volver a suceder esto. No podemos tener
// este tipo de errores». La clase prohibida: la app contradiciendo la
// realidad sin que ningún chequeo lo frene antes de que el dueño lo vea
// en una captura. Este módulo es el chequeo: corre ANTES de que un
// posteo agendado salga (scheduler.publishSinglePost) y cuando Inicio
// lo muestra como próximo o como el posteo de hoy (proyección de
// /api/posts). Si contradice, FRENA y AVISA a un humano (caso en el
// conserje, tipo integridad_prepublicacion) en vez de publicar o de
// mostrar en silencio.
//
// Las dos contradicciones que juzga:
//
// (1) DUPLICADO DE UNA PIEZA YA PUBLICADA de la misma cuenta — el caso
//     658: la misma pieza del posteo 649 (publicado el 13/11) agendada
//     de nuevo para el lunes 16. La identidad que el código puede
//     comparar de verdad es la HUELLA DEL ARCHIVO (sha256 de los bytes
//     de la imagen): es la misma huella que ya usa el dedupe del álbum
//     (assets.content_hash / assetContentHash). El caption NO sirve de
//     identidad — la cuenta propia repite aperturas de caption entre
//     piezas distintas (673, 679 y 682 abren igual) y el 658 traía un
//     caption distinto al del 649 — y el image_path tampoco: la misma
//     foto vive en paths distintos (el 658 mismo cambió de path en la
//     noche). Sin archivo legible no hay veredicto: sin prueba no se
//     frena (la regla que ya rige en el feed-reconcile).
//     Fuera del juicio: historias y gemelas (media_type 'story' /
//     source 'twin') — la historia gemela comparte la imagen de su
//     posteo madre POR DISEÑO; no es un duplicado.
//
// (2) PUNTERO A INSTAGRAM QUE NO ESTÁ VIVO O NO ES SUYO — el caso 582:
//     el registro apuntaba a la publicación ARCHIVADA mientras la viva
//     era otra media. Dos formas:
//     · puntero_archivado — ig_state = 'archived_ext'. Esa marca la
//       pone el feed-reconcile A POSTERIORI (al leer el perfil, el
//       shortcode propio ausente de una lectura completa marca la
//       fila). Este chequeo la CONSUME antes de mostrar/publicar: no
//       hace ninguna llamada nueva a Instagram ni duplica la lectura
//       del reconcile; son capas distintas que conviven sobre la
//       misma marca (el reconcile constata, esta capa frena).
//     · puntero_ajeno — el mismo ig_media_id o el mismo shortcode de
//       permalink figura en OTRA fila de la cuenta que ya está
//       publicada: el puntero es de esa otra pieza, no de esta.
//
// Doctrina (la de publish-guard): fail-open ante error interno — el
// chequeo jamás frena un posteo sano por un error propio; solo frena
// ante las dos contradicciones probadas. Y el veredicto es una función
// pura del estado actual: no deja ninguna marca durable propia, así
// que cuando un humano corrige el dato (descarta el duplicado,
// re-apunta el puntero con set-ig, adopta la publicación viva) el
// freno desaparece solo, sin nada que desarmar.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MOTIVO_DUPLICADO = 'duplicado';
const MOTIVO_PUNTERO_ARCHIVADO = 'puntero_archivado';
const MOTIVO_PUNTERO_AJENO = 'puntero_ajeno';

// Caché de huellas por archivo (path + mtime + tamaño): la proyección
// de /api/posts se pide seguido y las imágenes publicadas no cambian;
// sin esto cada pedido re-hashearía el historial de la cuenta.
const _huellaCache = new Map();

function mediaDirDe(opts) {
  return (opts && opts.mediaDir) || process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');
}

// image_path vive como '/media/<archivo>' (o la ruta que guardó la
// fila); el archivo real está bajo MEDIA_DIR por su nombre base — la
// misma resolución que hace el scheduler al publicar.
function rutaAbsoluta(imagePath, mediaDir) {
  const s = String(imagePath || '');
  if (!s) return '';
  if (path.isAbsolute(s) && !s.startsWith('/media/')) return s;
  return path.join(mediaDir, path.basename(s));
}

function huellaDeArchivo(abs) {
  try {
    if (!abs) return '';
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size <= 0) return '';
    const prev = _huellaCache.get(abs);
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) return prev.hash;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    _huellaCache.set(abs, { mtimeMs: st.mtimeMs, size: st.size, hash });
    return hash;
  } catch (e) { return ''; }
}

// El archivo cuya huella identifica a la pieza: en un carrusel, la
// primera placa (la portada es la identidad visible de la pieza);
// en el resto, image_path (en video, el propio archivo de video).
function archivoPrincipalDe(post) {
  try {
    if (post && String(post.media_type || '') === 'carousel' && post.carousel_paths) {
      const arr = JSON.parse(post.carousel_paths);
      if (Array.isArray(arr) && arr.length && arr[0]) return String(arr[0]);
    }
  } catch (e) { /* carousel_paths ilegible: cae a image_path */ }
  return String((post && post.image_path) || '');
}

function esHistoriaOGemela(post) {
  return String((post && post.media_type) || '') === 'story' || String((post && post.source) || '') === 'twin';
}

let _igShortcodeOf = null;
function shortcodeDe(permalink) {
  try {
    if (_igShortcodeOf === null) { try { _igShortcodeOf = require('./feed-reconcile').igShortcodeOf; } catch (e) { _igShortcodeOf = false; } }
    if (_igShortcodeOf) return _igShortcodeOf(permalink) || '';
  } catch (e) { /* cae al respaldo */ }
  const m = String(permalink || '').match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

// chequeoIntegridad(db, post, opts) → { ok: true }
//   | { ok: false, motivo, detalle, contra_id }
// Nunca lanza: ante cualquier error interno devuelve ok (fail-open).
function chequeoIntegridad(db, post, opts) {
  try {
    if (!db || !post || !post.id || !post.user_id) return { ok: true };
    const mediaDir = mediaDirDe(opts);
    const status = String(post.status || '');
    const mid = String(post.ig_media_id || '').trim();
    const per = String(post.ig_permalink || '').trim();

    // ---- (2) PUNTERO: solo si la fila trae puntero. ----
    if (mid || per) {
      if (String(post.ig_state || '') === 'archived_ext') {
        return {
          ok: false, motivo: MOTIVO_PUNTERO_ARCHIVADO, contra_id: null,
          detalle: 'El posteo #' + post.id + ' apunta a una publicación de Instagram archivada (' + (per || mid) + '): en Instagram ya no está viva. La fila quedó como publicada pero su publicación real no es esa.',
        };
      }
      const sc = shortcodeDe(per);
      const otros = db.prepare(
        `SELECT id, status, ig_permalink FROM posts
          WHERE user_id = ? AND id <> ?
            AND ((ig_media_id <> '' AND ig_media_id = ?) OR (ig_permalink <> '' AND ig_permalink = ?))`
      ).all(post.user_id, post.id, mid, per);
      // Choque por shortcode aunque el permalink difiera en forma
      // (/p/ vs /reel/): mismo shortcode = misma publicación.
      let ajeno = otros.find((o) => o && o.status === 'published');
      if (!ajeno && sc) {
        const pubs = db.prepare(
          `SELECT id, status, ig_permalink FROM posts WHERE user_id = ? AND id <> ? AND status = 'published' AND ig_permalink <> ''`
        ).all(post.user_id, post.id);
        ajeno = pubs.find((o) => shortcodeDe(o.ig_permalink) === sc);
      }
      if (ajeno && status !== 'published') {
        return {
          ok: false, motivo: MOTIVO_PUNTERO_AJENO, contra_id: ajeno.id,
          detalle: 'El posteo #' + post.id + ' trae el puntero de Instagram del posteo #' + ajeno.id + ', que ya está publicado con esa misma publicación (' + (per || mid) + '). El puntero es de la otra pieza.',
        };
      }
    }

    // ---- (1) DUPLICADO: solo filas que todavía no salieron. ----
    if (status !== 'published' && !esHistoriaOGemela(post)) {
      const pubs = db.prepare(
        `SELECT id, image_path, carousel_paths, media_type, source FROM posts
          WHERE user_id = ? AND status = 'published' AND id <> ?
            AND COALESCE(media_type, '') <> 'story' AND COALESCE(source, '') <> 'twin'`
      ).all(post.user_id, post.id);
      if (pubs.length) {
        const miHuella = huellaDeArchivo(rutaAbsoluta(archivoPrincipalDe(post), mediaDir));
        if (miHuella) {
          for (const o of pubs) {
            const h = huellaDeArchivo(rutaAbsoluta(archivoPrincipalDe(o), mediaDir));
            if (h && h === miHuella) {
              return {
                ok: false, motivo: MOTIVO_DUPLICADO, contra_id: o.id,
                detalle: 'El posteo #' + post.id + ' tiene la misma imagen (huella idéntica) que el posteo #' + o.id + ', que ya está publicado en esta cuenta. Es la misma pieza agendada dos veces.',
              };
            }
          }
        }
      }
    }
    return { ok: true };
  } catch (e) { return { ok: true }; }
}

// Texto honesto para el dueño (queda en posts.error al frenar en el
// scheduler y lo lee la app en la tarjeta pausada).
function textoParaElDueno(veredicto) {
  const v = veredicto || {};
  if (v.motivo === MOTIVO_DUPLICADO) return 'Posty frenó este posteo: es la misma imagen de un posteo que ya salió publicado en tu cuenta. El equipo lo está revisando.';
  if (v.motivo === MOTIVO_PUNTERO_ARCHIVADO) return 'Posty frenó este posteo: su publicación en Instagram ya no está viva. El equipo lo está revisando.';
  if (v.motivo === MOTIVO_PUNTERO_AJENO) return 'Posty frenó este posteo: su enlace de Instagram pertenece a otro posteo de tu cuenta. El equipo lo está revisando.';
  return 'Posty frenó este posteo por un control de integridad. El equipo lo está revisando.';
}

// Aviso a un humano: caso en el conserje con el motivo (el patrón de
// avisoRescateHumano del destrabe). Dedup por posteo + motivo: las
// superficies que detectan la misma contradicción (scheduler y
// proyección) abren UN solo caso. Nunca lanza.
function avisoIntegridad(db, post, veredicto) {
  try {
    if (!db || !post || !veredicto || veredicto.ok) return null;
    const supportCases = require('./support-cases');
    const titulo = veredicto.motivo === MOTIVO_DUPLICADO
      ? 'Duplicado frenado antes de publicar'
      : (veredicto.motivo === MOTIVO_PUNTERO_ARCHIVADO ? 'Puntero archivado frenado' : 'Puntero de otra pieza frenado');
    return supportCases.openCase(db, {
      userId: post.user_id,
      tipo: 'integridad_prepublicacion',
      titulo,
      detalle: veredicto.detalle || '',
      postId: post.id,
      dueno: 'equipo',
      siguientePaso: veredicto.motivo === MOTIVO_DUPLICADO
        ? 'Confirmar cuál de las dos piezas vive: descartar el duplicado (el posteo frenado) desde el conserje o la fila del cliente. El publicado no se toca.'
        : 'Re-apuntar la fila a la publicación viva (set-ig) o adoptar la publicación reciente (ig/adopt); el freno se levanta solo cuando el puntero queda vivo y correcto, porque el chequeo es función del dato actual.',
      dedupKey: 'integridad:' + post.id + ':' + veredicto.motivo,
    });
  } catch (e) { return null; }
}

// Freno en el scheduler: la fila queda 'paused' con el motivo honesto
// (el estado que el scheduler ya usa para «no sale hasta que un humano
// lo mire»: processDuePosts no levanta pausados solo) + evento + caso.
function frenarPosteo(db, post, veredicto) {
  try {
    db.prepare("UPDATE posts SET status = 'paused', error = ? WHERE id = ?").run(textoParaElDueno(veredicto), post.id);
  } catch (e) { /* sin tabla: el caso igual se abre */ }
  try {
    db.prepare('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)')
      .run(post.user_id, 'post_integridad_frenado', JSON.stringify({ post_id: post.id, motivo: veredicto.motivo, contra_id: veredicto.contra_id || null }));
  } catch (e) { /* events es opcional */ }
  avisoIntegridad(db, post, veredicto);
  return { frenado: true, motivo: veredicto.motivo };
}

module.exports = {
  chequeoIntegridad,
  frenarPosteo,
  avisoIntegridad,
  textoParaElDueno,
  huellaDeArchivo,
  archivoPrincipalDe,
  MOTIVO_DUPLICADO,
  MOTIVO_PUNTERO_ARCHIVADO,
  MOTIVO_PUNTERO_AJENO,
};
