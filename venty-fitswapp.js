// venty-fitswapp.js — SLICE 2: Fitswapp como piloto / cliente cero de Venty.
// El fundamento de Fitswapp es BORRADOR sin aprobar por Valentino
// (~/workspace/venty-identity/venty-fundamento-fitswapp-borrador.md):
// nada de este módulo lo da por aprobado ni escribe nada real fuera de
// Posta. Lo que hace:
//   · WEB (único canal conectable sin decisión previa): fitswapp.com como
//     fuente conectada con venty-web.js (mismo patrón que v721), refresco
//     con web-extract.js, y la paleta CANÓNICA del borrador fijada después
//     del refresco (la landing no manda sobre la paleta verificada).
//     La simulación Café Aroma NO se toca: sus partidas/jugadas quedan;
//     solo website_url / ciudad / paleta del fundamento ganan la fuente.
//   · EMAIL: plantilla con la PALETA DE FITSWAPP (negro #0B0B0C, naranja
//     #FF6B00, crema #F2EDE4, lime #C6F24E — nunca verde de Venty ni
//     azul/amarillo de Posty), firmada «El equipo de Fitswapp». El envío
//     real exige, además de las puertas de v721 (jugada aceptada + cupo +
//     no suprimido), EL DOMINIO DE ENVÍO: sin dominio decidido por
//     Valentino no sale nada (fail-closed, error 'falta_dominio_envio').
//     El remitente es Fitswapp <hola@<dominio>>: sin ese from, el envío
//     saldría como Posty (DEFAULT_FROM de email.js). NO se inventa dominio.
//   · INSTAGRAM @fit.swapp: registro de la conexión (etiqueta, sin
//     cuenta_ref: el ig user id no se conoce hasta la decisión de Meta) en
//     falta_accion con el motivo exacto. El webhook, la recepción → hilo +
//     jugada responder_dm y el envío por zona ya existen en v721
//     (venty-instagram.js); acá solo se registra el piloto y se expone su
//     estado. Frontera: Posty postea en @fit.swapp; Venty solo vende por DM.
//   · WHATSAPP: fuera del piloto (Fitswapp no tiene WhatsApp Business,
//     confirmado por Valentino 6/11). El estado del piloto lo reporta como
//     'excluido_piloto'; ningún flujo de este módulo toca WhatsApp.
//   · BUZÓN: no hay lector real (hola-inbox.js pollInbox → available:
//     false). Este módulo NO inventa uno: registrarIngesta de venty-email.js
//     sigue siendo el punto de enchufe; el plan del worker está en STATUS.md.
// Nada de este módulo pushea, envía ni conecta nada vivo por sí solo:
// «conectar» registra + refresca la fuente web; el resto queda en
// falta_accion / bloqueado hasta las decisiones de Valentino y de Meta.
'use strict';

const FITSWAPP_WEB_URL = 'https://fitswapp.com';
const FITSWAPP_IG_HANDLE = '@fit.swapp';
// Paleta canónica del borrador §5 (sistema de marca v1, verificada en
// fitswapp-ig/render_posts.py). El puente del fundamento solo guarda 2 hex:
// principal naranja + acento negro. Crema = texto claro, lime = acento
// secundario (viven en el estilo del email, no en el puente).
const PALETA_FITSWAPP = [
  { hex: '#FF6B00', rol: 'principal' },
  { hex: '#0B0B0C', rol: 'acento' },
];
const FITSWAPP_CREMA = '#F2EDE4';
const FITSWAPP_LIME = '#C6F24E';
// Estilo del email: cabecera negra con texto crema, CTA naranja con texto
// negro (contraste legible; el texto crema sobre naranja no se lee).
const EMAIL_ESTILO_FITSWAPP = {
  fondoHeader: '#0B0B0C', colorHeader: FITSWAPP_CREMA,
  fondoCta: '#FF6B00', colorCta: '#0B0B0C',
};
const MOTIVO_IG_FALTA = 'falta la cuenta de Meta (decisión de Valentino) + app review de instagram_manage_messages: sin ese permiso el DM queda en Bandeja como «falta el permiso», nunca se promete';
const MOTIVO_DOMINIO_FALTA = 'falta el dominio de envío (decisión de Valentino): sin dominio ningún email sale en real';
const MOTIVO_WA_EXCLUIDO = 'Fitswapp no tiene WhatsApp Business (confirmado por Valentino 6/11): WhatsApp queda fuera del piloto';

function fail(m) { const e = new Error(m); e.ventyFitswapp = true; throw e; }
function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_piloto_fitswapp (
    user_id INTEGER PRIMARY KEY,
    dominio_envio TEXT NOT NULL DEFAULT '',
    dominio_envio_en TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

function leerPiloto(db, userId) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM venty_piloto_fitswapp WHERE user_id = ?').get(userId);
  return {
    user_id: userId,
    dominio_envio: (r && r.dominio_envio) || '',
    dominio_envio_en: (r && r.dominio_envio_en) || '',
  };
}

// Registrar la decisión del dominio de envío (Valentino). Solo guarda el
// dominio (nunca secretos, nunca credenciales): el envío usa
// Fitswapp <hola@<dominio>>. Rechaza dominios con protocolo, ruta, @ o
// espacios, y el dominio de Posty (un email de Fitswapp nunca sale desde
// el dominio de Posty). Vacío → error, nunca se inventa un dominio.
function fijarDominioEnvio(db, userId, dominio) {
  ensureSchema(db);
  const d = String(dominio || '').trim().toLowerCase();
  if (!d) return { ok: false, error: 'sin_dominio' };
  if (/[:/@\s]/.test(d) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return { ok: false, error: 'dominio_invalido' };
  const tld = d.split('.').pop();
  if (!tld || tld.length < 2) return { ok: false, error: 'dominio_invalido' };
  if (d === 'postycommunitymanager.com' || d.endsWith('.postycommunitymanager.com')) {
    return { ok: false, error: 'dominio_de_posty' };
  }
  const ahora = ahoraIso();
  db.prepare(`INSERT INTO venty_piloto_fitswapp (user_id, dominio_envio, dominio_envio_en, updated_at)
    VALUES (?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET dominio_envio = excluded.dominio_envio,
      dominio_envio_en = excluded.dominio_envio_en, updated_at = excluded.updated_at`)
    .run(userId, d, ahora, ahora);
  return { ok: true, dominio: d };
}

function remitenteDe(dominio) { return 'Fitswapp <hola@' + dominio + '>'; }

// --- WEB: fitswapp.com como fuente conectada (patrón v721) -------------
// Registra la conexión web (sin secreto: solo URL), refresca con
// web-extract.js y fija la paleta canónica del borrador. La simulación
// Café Aroma no se toca: refrescarDesdeWeb solo actualiza website_url /
// ciudad / paleta (+ rubro solo si el fundamento no tiene), nunca precios,
// estrella, políticas ni partidas. opts: { fetchBusinessSite, ventyWeb,
// venty, conexiones } inyectables en tests.
async function conectarFuenteWeb(db, userId, opts) {
  const o = opts || {};
  const ventyWeb = o.ventyWeb || require('./venty-web');
  const venty = o.venty || require('./venty');
  const conexiones = o.conexiones || require('./venty-conexiones');
  try {
    conexiones.iniciarConexion(db, userId, 'web', { proveedor: 'sitio', etiqueta: FITSWAPP_WEB_URL });
  } catch (e) { /* ya existe: se sigue con el refresco */ }
  const r = await ventyWeb.refrescarDesdeWeb(db, userId, FITSWAPP_WEB_URL,
    o.fetchBusinessSite ? { fetchBusinessSite: o.fetchBusinessSite } : {});
  if (!r.ok) return { ok: false, error: r.error };
  // La paleta canónica del borrador manda: la landing no la pisa (ver
  // venty-web.js: la web propone, no impone; acá se fija explícito).
  try { venty.actualizarFundamentoPuente(db, userId, { paleta: PALETA_FITSWAPP }); } catch (e) {}
  try { venty.registrarEvento(db, userId, 'fitswapp_web_conectada', null, { url: FITSWAPP_WEB_URL }); } catch (e) {}
  return {
    ok: true,
    website_url: FITSWAPP_WEB_URL,
    cambios: r.cambios || {},
    sitio: r.sitio || null,
    paleta: 'canonica_fitswapp',
    paleta_hex: PALETA_FITSWAPP.map((p) => p.hex),
  };
}

// --- INSTAGRAM: registrar @fit.swapp (sin cuenta conectada todavía) -----
// Sin credencial_ref y sin cuenta_ref (el ig user id no se conoce hasta
// que Valentino decida la cuenta de Meta): queda en falta_accion con el
// motivo exacto. Idempotente: si ya existe, solo re-marca el motivo.
function conectarInstagram(db, userId, opts) {
  const o = opts || {};
  const conexiones = o.conexiones || require('./venty-conexiones');
  const venty = o.venty || require('./venty');
  try {
    conexiones.iniciarConexion(db, userId, 'instagram', { proveedor: 'meta', etiqueta: FITSWAPP_IG_HANDLE });
  } catch (e) { /* ya existe: se sigue */ }
  let estado = null;
  try { estado = conexiones.marcarFaltaAccion(db, userId, 'instagram', MOTIVO_IG_FALTA); } catch (e) {
    estado = conexiones.estadoCanal(db, userId, 'instagram');
  }
  try { venty.registrarEvento(db, userId, 'fitswapp_instagram_pendiente', null, { handle: FITSWAPP_IG_HANDLE }); } catch (e) {}
  return estado;
}

// --- EMAIL: plantilla Fitswapp ------------------------------------------
// Envuelve construirEmailNegocio con paleta + estilo + remitente de
// Fitswapp. Una idea por email (la del constructor). El que escribe es
// Fitswapp a sus prospectos, nunca Venty.
function construirEmailFitswapp(opts) {
  const o = opts || {};
  const ventyEmail = o.ventyEmail || require('./venty-email');
  return ventyEmail.construirEmailNegocio({
    negocio: 'Fitswapp',
    paleta: PALETA_FITSWAPP,
    estilo: EMAIL_ESTILO_FITSWAPP,
    remitente: String(o.remitente || 'El equipo de Fitswapp').slice(0, 80),
    idea: o.idea || null,
    ideas: o.ideas || null,
    asunto: o.asunto || '',
    cuerpo: o.cuerpo || '',
    ctaTexto: o.ctaTexto || '',
    ctaUrl: o.ctaUrl || '',
    bajaUrl: o.bajaUrl || '',
  });
}

// --- EMAIL: envío real del piloto (gated) --------------------------------
// Puertas, en orden: dominio de envío decidido (sin él, nada sale) · y
// después todas las de venty-email.enviarEmail (jugada aceptada en
// Bandeja tipo email_prospecto, destinatario no suprimido, conexión email
// viva, cupo del gobernador). El from es Fitswapp <hola@<dominio>> y el
// cuerpo lo construye enviarEmail con la paleta del fundamento (que tras
// conectar la fuente web es la canónica de Fitswapp).
// NOTA reply_to: NO se fija la dirección de reenvío como reply-to acá.
// El token de esa dirección solo se muestra una vez al generarla y no se
// guarda en claro (regla v721); recuperarlo después es imposible sin
// guardarlo. Las respuestas vuelven al From (hola@<dominio>) hasta que se
// resuelva el reply-to (ver STATUS.md, punto abierto). No se inventa nada.
async function enviarEmailPiloto(db, userId, opts) {
  const o = opts || {};
  const piloto = leerPiloto(db, userId);
  if (!piloto.dominio_envio) {
    return { ok: false, error: 'falta_dominio_envio', detalle: MOTIVO_DOMINIO_FALTA };
  }
  const ventyEmail = o.ventyEmail || require('./venty-email');
  return ventyEmail.enviarEmail(db, userId, {
    ...(o || {}),
    from: remitenteDe(piloto.dominio_envio),
  });
}

// --- Estado del piloto (lectura; no escribe nada real) -------------------
function estadoPiloto(db, userId, opts) {
  const o = opts || {};
  const conexiones = o.conexiones || require('./venty-conexiones');
  const ventyEmail = o.ventyEmail || require('./venty-email');
  const piloto = leerPiloto(db, userId);
  const web = conexiones.estadoCanal(db, userId, 'web');
  const emailC = conexiones.estadoCanal(db, userId, 'email');
  const ig = conexiones.estadoCanal(db, userId, 'instagram');
  let direccionExiste = false;
  try { direccionExiste = !!(ventyEmail.estadoDireccion(db, userId).existe); } catch (e) {}
  const dominioListo = !!piloto.dominio_envio;
  const emailListo = direccionExiste && dominioListo && !!emailC.viva;
  const bloqueos = [];
  if (!dominioListo) {
    bloqueos.push({ que: 'dominio de envío', quien: 'Valentino', que_pedir: 'el dominio desde el que salen los emails de Fitswapp (recomendación del playbook: dominio propio de Fitswapp con SPF/DKIM). Sin él ningún email sale en real.' });
  }
  if (!ig.viva) {
    bloqueos.push({ que: 'cuenta de Meta para la app de Instagram', quien: 'Valentino', que_pedir: 'qué cuenta de Meta usar para la app (no se creó ninguna app sin su OK). Sin ella no hay DM de salida.' });
    bloqueos.push({ que: 'app review de instagram_manage_messages', quien: 'Meta (trámite)', que_pedir: 'aprobar el permiso instagram_manage_messages. Sin él, el DM queda en Bandeja como «falta el permiso», nunca se promete.' });
  }
  return {
    piloto: 'fitswapp',
    fundamento: 'borrador_sin_aprobar',
    web: {
      canal: 'web', estado: web.viva ? 'conectado' : web.estado,
      website_url: FITSWAPP_WEB_URL,
      ultimo_fetch: web.ultimo_fetch || '',
      nota: web.viva ? 'fuente conectada' : 'falta conectar fitswapp.com como fuente (sin decisión previa: se conecta ahora)',
    },
    email: {
      canal: 'email', estado: emailC.viva ? 'conectado' : emailC.estado,
      direccion_existe: direccionExiste,
      dominio_envio: piloto.dominio_envio || '',
      listo_para_enviar_real: emailListo,
      bloqueo: dominioListo ? '' : MOTIVO_DOMINIO_FALTA,
    },
    instagram: {
      canal: 'instagram', estado: ig.viva ? 'conectado' : ig.estado,
      etiqueta: FITSWAPP_IG_HANDLE, cuenta_ref: ig.cuenta_ref || '',
      bloqueo: ig.viva ? '' : MOTIVO_IG_FALTA,
    },
    whatsapp: { canal: 'whatsapp', estado: 'excluido_piloto', bloqueo: MOTIVO_WA_EXCLUIDO },
    bloqueos,
  };
}

module.exports = {
  FITSWAPP_WEB_URL, FITSWAPP_IG_HANDLE, PALETA_FITSWAPP, FITSWAPP_CREMA, FITSWAPP_LIME,
  EMAIL_ESTILO_FITSWAPP, MOTIVO_IG_FALTA, MOTIVO_DOMINIO_FALTA, MOTIVO_WA_EXCLUIDO,
  ensureSchema, leerPiloto, fijarDominioEnvio, remitenteDe,
  conectarFuenteWeb, conectarInstagram, construirEmailFitswapp,
  enviarEmailPiloto, estadoPiloto,
};
