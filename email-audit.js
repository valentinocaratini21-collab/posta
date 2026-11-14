// email-audit.js — LA AUDITORÍA DEL FUNDADOR PARA EL EMAIL A NEGOCIOS
// (aprobada por Valentino 13/11 23:01: «armemos la auditoría, y la
// incluimos en el email»).
//
// Cada email del fundador a un negocio lleva enlazada la auditoría del
// Instagram de ESE negocio. Esta pieza la genera a demanda (endpoint
// admin), la guarda con su evidencia y la sirve en una URL pública con
// token no adivinable (/a/<token>), fuera de todo índice.
//
// GUARDA DE VERDAD (la regla dura de la pieza): la página SOLO afirma
// hallazgos computados de la lectura real del feed de ese negocio — la
// MISMA lectura que usa la prueba (feed-audit.fetchAuditData sobre el
// embed público + el catálogo real del sitio por deep-read + las
// señales determinísticas de feed-audit y client-digest). CERO IA
// escribiendo hallazgos: la auditoría de IA de /auditoria (auditFeed)
// NO se usa acá. Cada hallazgo guarda su evidencia (los números y
// nombres crudos de la lectura) dentro del payload persistido. Lo que
// no se verifica de ese feed NO va: si un eje no sale de los datos, la
// página sale con los hallazgos que haya; si no hay ninguno (o no hay
// una línea de fan verificable), NO se genera y se declara el motivo.
//
// Orden fijo de la página (vara visual: auditoria-ejemplo.html de la
// carpeta de la carta): (1) lo que nos gustó · (2) hasta tres cosas
// para mejorar · (3) lo que haríamos nosotros · (4) cierre con la
// prueba de 3 días y el precio. Voz del fundador: primera persona /
// equipo en plural, sin rayas largas, sin «Posty arma».
//
// CARTA v5 (aprobada 13/11 23:06): el email ya NO lleva el link suelto
// de /prueba — su ÚNICA puerta es abrir esta auditoría, y la prueba
// vive al final de ESTA página. El cierre (3)→(4) es el paso que vende
// todo el email: va textual de la muestra aprobada. Y la línea de fan
// de la carta nombra la estrella del negocio: la sección (1) y el
// payload nombran LA MISMA estrella de ESTA lectura (payload.estrella
// es el hueco de la plantilla de la carta).
//
// Contrato: NUNCA lanza. generateEmailAudit devuelve
// {ok:true, token, url, payload} o {ok:false, motivo}.
'use strict';

const crypto = require('crypto');

const db = require('./db');
const feedAudit = require('./feed-audit');
const clientDigest = require('./client-digest');
const deepRead = require('./deep-read');

// ---------------------------------------------------------------------------
// Tabla propia (idempotente, patrón de audit_cache de feed-audit). La
// evidencia viaja DENTRO del payload: payload.evidence por hallazgo.
// ---------------------------------------------------------------------------
try {
  db.exec(`CREATE TABLE IF NOT EXISTS email_audits (
    token TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    domain TEXT DEFAULT '',
    lang TEXT DEFAULT 'es',
    business_name TEXT DEFAULT '',
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
} catch (e) { /* la tabla se crea al primer uso posible */ }

const TRIAL_URL = 'https://postycommunitymanager.com/prueba';
const RECENT_N = 12; // la grilla que el visitante ve: sus últimos posteos

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Menciones de FRASE COMPLETA de un nombre en los captions — la misma
// vara que extractNamedProducts/inferStar usan para contar apariciones
// (pieceAnchored estricto: una palabra suelta no cuenta).
function mentionCount(name, caps) {
  const anchors = clientDigest.anchorsFromTexts([name]);
  if (!anchors || !anchors.length) return 0;
  let n = 0;
  for (const c of caps) {
    try { if (clientDigest.pieceAnchored(String(c || ''), anchors, { strictPhrase: true }).ok) n++; } catch (e) {}
  }
  return n;
}

// ---------------------------------------------------------------------------
// La estrella, con la vara del fundamento: inferStar sobre el catálogo
// real del sitio + captions + cariño del feed. Si no sale, el respaldo
// es un producto nombrado CORROBORADO (namedEntryCorroborated: dos
// señales independientes, nunca la lista circular). Sin estrella
// verificable → null y el eje no va.
// ---------------------------------------------------------------------------
function starOf({ profile, posts, items, captions }) {
  const metrics = posts.map((p) => ({
    text: String(p.caption || ''),
    likes: p.likes, comments: p.comments,
  }));
  try {
    const inf = clientDigest.inferStar({ items: items || [], captions, metrics });
    if (inf && inf.item) {
      return { name: String(inf.item), via: 'inferida', evidence: (inf.evidence || []).map(String), confidence: inf.confidence };
    }
  } catch (e) {}
  try {
    const named = clientDigest.extractNamedProducts({
      captions, items: items || [],
      business: profile && profile.name, handle: profile && profile.handle,
    });
    const corr = (named || []).find((e) => clientDigest.namedEntryCorroborated(e));
    if (corr) {
      return {
        name: String(corr.nombre), via: 'nombrado-corroborado',
        evidence: ['aparece nombrado con nombre propio en su feed y corroborado por dos señales independientes (' + (corr.clases || []).join(' + ') + ')'],
        confidence: null,
      };
    }
  } catch (e) {}
  return null;
}

// ---------------------------------------------------------------------------
// (1) LO QUE NOS GUSTÓ — la línea de fan. La carta v5 nombra en SU
// línea de fan la estrella del negocio: esta sección sale de la MISMA
// lectura y la nombra con la misma estrella, con un hecho positivo y
// verificado de esa estrella. Candidatas en orden de concreción: cada
// una exige su evidencia en los datos. Sin ninguna verificable → null
// (y la auditoría no se genera: elogiar sin evidencia sería inventar).
// ---------------------------------------------------------------------------
function fanLine({ profile, posts, signals, trialSignals, namedCorroborated, star, starAppearances, recentN, T }) {
  // a) La estrella, con su cariño real: el posteo que la nombra y más
  // interacciones juntó (likes + comentarios del embed).
  if (star) {
    let love = 0, loveShort = null;
    for (const p of posts) {
      const anchors = clientDigest.anchorsFromTexts([star.name]);
      let hit = false;
      try { hit = anchors && anchors.length && clientDigest.pieceAnchored(String(p.caption || ''), anchors, { strictPhrase: true }).ok; } catch (e) {}
      if (!hit) continue;
      const l = (Number(p.likes) || 0) + (Number(p.comments) || 0);
      if (l > love) { love = l; loveShort = p.shortcode || null; }
    }
    if (love > 0) {
      return {
        text: T(
          'Tu estrella tiene nombre y tiene fanes: ' + star.name + ' juntó ' + love + ' interacciones en su posteo con más cariño. Un producto así se merece estar al frente.',
          'Your star has a name and it has fans: ' + star.name + ' got ' + love + ' interactions on its most-loved post. A product like that deserves to be up front.'),
        evidence: { tipo: 'estrella_mas_querida', estrella: star.name, interacciones: love, shortcode: loveShort },
      };
    }
    // b) La estrella, presente con nombre en la grilla reciente.
    if (starAppearances >= 2) {
      return {
        text: T(
          'Tu estrella aparece como tiene que aparecer: ' + star.name + ' está, con nombre propio, en ' + starAppearances + ' de tus últimos ' + recentN + ' posteos. Un producto con nombre se desea y se pide.',
          'Your star shows up the way it should: ' + star.name + ' appears, by name, in ' + starAppearances + ' of your last ' + recentN + ' posts. A product with a name gets desired and ordered.'),
        evidence: { tipo: 'estrella_presente', estrella: star.name, apariciones: starAppearances, en_posteos: recentN },
      };
    }
    // c) La estrella, elegida al frente de su propio catálogo.
    if ((star.evidence || []).some((e) => /cat[aá]logo/.test(e))) {
      return {
        text: T(
          'Lo primero que muestra tu catálogo es ' + star.name + ': tu estrella está bien elegida, es lo que tu negocio pone al frente.',
          'The first thing your catalog shows is ' + star.name + ': your star is well chosen, it is what your business puts up front.'),
        evidence: { tipo: 'estrella_catalogo', estrella: star.name, evidencia_estrella: star.evidence },
      };
    }
  }
  // d) Su posteo más querido (likes reales del embed).
  let best = null;
  for (const p of posts) {
    if (p && Number(p.likes) > 0 && (!best || Number(p.likes) > Number(best.likes))) best = p;
  }
  if (best) {
    return {
      text: T(
        'Se nota lo que le gusta a tu gente: tu posteo con más me gusta juntó ' + Number(best.likes) + '. Ahí hay una vara real de lo que tu público quiere ver, y la tenés vos.',
        'You can tell what your people love: your most-liked post got ' + Number(best.likes) + ' likes. That is a real bar for what your audience wants to see, and it is already yours.'),
      evidence: { tipo: 'posteo_mas_querido', likes: Number(best.likes), shortcode: best.shortcode || null },
    };
  }
  // e) Productos con nombre propio, corroborados (la vara Ligre).
  // Si hay estrella verificada, encabeza la lista: la misma que nombra
  // la carta.
  if (namedCorroborated && namedCorroborated.length >= 2) {
    let names = namedCorroborated.map((e) => e.nombre);
    if (star && !names.some((n) => clientDigest.sameItemName ? clientDigest.sameItemName(n, star.name) : n === star.name)) names = [star.name].concat(names);
    names = names.slice(0, 2);
    return {
      text: T(
        'Nombrás a tus productos como se merecen: en tus últimos posteos aparecen con nombre propio ' + names[0] + ' y ' + names[1] + '. Un producto con nombre se desea, se pide y se recomienda.',
        'You name your products the way they deserve: your latest posts show ' + names[0] + ' and ' + names[1] + ' by name. A product with a name gets desired, ordered and recommended.'),
      evidence: { tipo: 'productos_con_nombre', productos: namedCorroborated.map((e) => e.nombre) },
    };
  }
  // c) Constancia real de publicación.
  if (trialSignals && trialSignals.posts_per_week != null && trialSignals.posts_per_week >= 4) {
    return {
      text: T(
        'Publicás con una constancia que pocos negocios sostienen: ' + trialSignals.posts_per_week + ' posteos por semana. Esa base vale oro.',
        'You post with a consistency few businesses keep up: ' + trialSignals.posts_per_week + ' posts a week. That foundation is worth gold.'),
      evidence: { tipo: 'constancia', posts_per_week: trialSignals.posts_per_week },
    };
  }
  // d) Captions que abren con gancho.
  if (trialSignals && trialSignals.hook_pct != null && trialSignals.hook_pct >= 50 && trialSignals.captions_n >= 3) {
    return {
      text: T(
        'Tus captions abren con gancho: el ' + trialSignals.hook_pct + '% empieza con una pregunta o un llamado que frena el scroll.',
        'Your captions open with a hook: ' + trialSignals.hook_pct + '% start with a question or a call that stops the scroll.'),
      evidence: { tipo: 'gancho', hook_pct: trialSignals.hook_pct, captions_n: trialSignals.captions_n },
    };
  }
  // e) Ya usa video.
  if (signals && signals.videos >= 1) {
    return {
      text: T(
        'Ya te animás al video: ' + signals.videos + ' de tus últimos ' + signals.n_posts + ' posteos son video, el formato que más empuja Instagram.',
        'You already dare to use video: ' + signals.videos + ' of your last ' + signals.n_posts + ' posts are video, the format Instagram pushes the most.'),
      evidence: { tipo: 'video', videos: signals.videos, n_posts: signals.n_posts },
    };
  }
  // f) La bio, SOLO si fue leída (bio sin leer = null, nunca se afirma).
  if (signals && signals.bio_has_what === true) {
    return {
      text: T(
        'Tu bio cuenta en pocas palabras qué hacés: el que entra a tu perfil entiende al instante de qué se trata.',
        'Your bio says what you do in a few words: anyone landing on your profile gets it right away.'),
      evidence: { tipo: 'bio', bio_length: signals.bio_length },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// buildAudit — PURA (sin red ni DB): de la lectura cruda a las
// secciones de la página, con la evidencia de cada afirmación.
// Entrada: { profile, posts, items, lang, paletteHues, now }
// Salida: { ok:true, fan, findings, evidence, signals } | { ok:false, motivo }
// ---------------------------------------------------------------------------
function buildAudit(input) {
  const profile = (input && input.profile) || {};
  const posts = ((input && input.posts) || []).filter((p) => p && typeof p === 'object');
  const items = Array.isArray(input && input.items) ? input.items : [];
  const en = (input && input.lang) === 'en';
  const T = (es, enS) => (en ? enS : es);
  const nowSec = Math.floor(((input && input.now) || Date.now()) / 1000);

  if (!posts.length) return { ok: false, motivo: 'feed_sin_posteos' };

  const captions = posts.map((p) => String(p.caption || ''));
  const captionsConTexto = captions.filter((c) => c.trim().length > 0).length;
  const signals = feedAudit.computeSignals(profile, posts);
  const trial = feedAudit.trialAuditFromData(
    { ok: true, posts },
    { lang: en ? 'en' : 'es', paletteHues: input && input.paletteHues != null ? input.paletteHues : null },
  );
  const trialSignals = (trial && trial.signals) || {};

  // Ritmo crudo, con la misma aritmética de trialAuditFromData.
  const withTs = posts
    .filter((p) => Number.isFinite(p.taken_at) && p.taken_at > 0)
    .map((p) => p.taken_at)
    .sort((a, b) => a - b);
  let maxGap = null, sinceLast = null;
  if (withTs.length >= 2) {
    maxGap = 0;
    for (let i = 1; i < withTs.length; i++) maxGap = Math.max(maxGap, Math.round((withTs[i] - withTs[i - 1]) / 86400));
  }
  if (withTs.length >= 1) sinceLast = Math.max(0, Math.round((nowSec - withTs[withTs.length - 1]) / 86400));

  // Productos nombrados corroborados (para la estrella de respaldo y
  // para la línea de fan).
  let namedCorroborated = [];
  try {
    const named = clientDigest.extractNamedProducts({ captions, items, business: profile.name, handle: profile.handle });
    namedCorroborated = (named || []).filter((e) => clientDigest.namedEntryCorroborated(e));
  } catch (e) {}

  // ── Hallazgos, en el orden de ejes de la pieza. Cada uno nace SOLO
  // de su evidencia; el que no se verifica, no va. ──
  const findings = [];

  // La estrella se computa UNA vez: la usa el eje 1, la línea de fan
  // (la misma estrella que nombra la carta v5) y el payload.
  const star = starOf({ profile, posts, items, captions });
  const recentCaps = captions.slice(0, RECENT_N);
  const starAppearances = star ? mentionCount(star.name, recentCaps) : 0;

  // Eje 1 · Su estrella que no aparece.
  if (star) {
    const recent = recentCaps;
    const appearances = starAppearances;
    if (recent.length >= 5 && appearances <= 1) {
      findings.push({
        eje: 'estrella',
        titulo: T('Tu estrella casi no aparece', 'Your star barely shows up'),
        texto: T(
          star.name + ' es tu producto estrella y aparece en solo ' + appearances + ' de tus últimos ' + recent.length + ' posteos. La gente entra, no encuentra rápido eso que te hizo conocido y se va.',
          star.name + ' is your star product and it shows up in only ' + appearances + ' of your last ' + recent.length + ' posts. People come in, cannot quickly find the thing that made you known, and leave.'),
        evidence: { estrella: star.name, via: star.via, evidencia_estrella: star.evidence, apariciones: appearances, en_posteos: recent.length },
      });
    }
  }

  // Eje 2 · El ritmo se corta.
  {
    const parts = [];
    const ev = {};
    if (sinceLast != null && sinceLast >= 7) { parts.push(T('hace ' + sinceLast + ' días que no publicás', 'it has been ' + sinceLast + ' days since your last post')); ev.dias_desde_ultimo = sinceLast; }
    if (maxGap != null && maxGap >= 10) { parts.push(T('tu racha más larga sin publicar fue de ' + maxGap + ' días', 'your longest stretch without posting was ' + maxGap + ' days')); ev.racha_max_dias = maxGap; }
    if (trialSignals.posts_per_week != null && trialSignals.posts_per_week < 4 && withTs.length >= 2) { parts.push(T('hoy salís a ' + trialSignals.posts_per_week + ' posteos por semana', 'you are at ' + trialSignals.posts_per_week + ' posts per week')); ev.posteos_por_semana = trialSignals.posts_per_week; }
    if (parts.length) {
      const joined = parts.join(T(' y ', ' and '));
      findings.push({
        eje: 'ritmo',
        titulo: T('El ritmo se corta', 'The rhythm keeps breaking'),
        texto: T(
          'Tu ritmo se corta: ' + joined + '. Instagram premia la constancia: el que aparece todos los días, vende todos los días.',
          'Your rhythm keeps breaking: ' + joined + '. Instagram rewards consistency: whoever shows up every day, sells every day.'),
        evidence: ev,
      });
    }
  }

  // Eje 3 · Ningún posteo invita a comprar.
  if (signals.cta_pct === 0 && captionsConTexto >= 3) {
    findings.push({
      eje: 'cta',
      titulo: T('Ningún posteo invita a comprar', 'No post invites people to buy'),
      texto: T(
        'Revisamos tus últimos ' + captionsConTexto + ' captions: ninguno dice cómo reservar, pedir o pasar por el local. El que se entusiasma no tiene el próximo paso.',
        'We went through your last ' + captionsConTexto + ' captions: none of them says how to book, order or stop by. Whoever gets excited has no next step.'),
      evidence: { captions_revisados: captionsConTexto, con_llamado_pct: signals.cta_pct },
    });
  }

  // Alternos verificados de la misma lectura (completan hasta tres
  // solo cuando un eje principal no salió; mismo estándar de
  // evidencia, computados por trialAuditFromData/computeSignals).
  if (signals.videos === 0 && posts.length >= 3) {
    findings.push({
      eje: 'videos',
      titulo: T('Todavía no aprovechás el video', 'You are not using video yet'),
      texto: T(
        '0 videos en tus últimos ' + posts.length + ' posteos: el formato que más empuja Instagram hoy no aparece en tu grilla.',
        '0 videos in your last ' + posts.length + ' posts: the format Instagram pushes the most does not show up in your grid.'),
      evidence: { videos: 0, en_posteos: posts.length },
    });
  }
  if (trialSignals.hook_pct != null && trialSignals.hook_pct < 50 && trialSignals.captions_n >= 3) {
    findings.push({
      eje: 'gancho',
      titulo: T('Tus captions no frenan el scroll', 'Your captions do not stop the scroll'),
      texto: T(
        'Solo el ' + trialSignals.hook_pct + '% de tus captions abre con una pregunta o un llamado. El resto arranca contando, y el dedo sigue de largo.',
        'Only ' + trialSignals.hook_pct + '% of your captions open with a question or a call. The rest start by telling, and the thumb keeps scrolling.'),
      evidence: { gancho_pct: trialSignals.hook_pct, captions_n: trialSignals.captions_n },
    });
  }
  if (trialSignals.hour_bands != null && trialSignals.hour_bands >= 4 && trialSignals.top_band_share != null && trialSignals.top_band_share < 0.6) {
    findings.push({
      eje: 'horarios',
      titulo: T('Publicás sin un horario que se repita', 'You post with no repeating time'),
      texto: T(
        'Tus posteos salen en ' + trialSignals.hour_bands + ' franjas horarias distintas: sin una hora que se repita, tu gente nunca sabe cuándo buscarte.',
        'Your posts go out across ' + trialSignals.hour_bands + ' different time bands: with no repeating time, your people never know when to look for you.'),
      evidence: { franjas: trialSignals.hour_bands, franja_principal_pct: Math.round(trialSignals.top_band_share * 100) },
    });
  }
  if (trialSignals.palette_hues != null && trialSignals.palette_hues >= 6) {
    findings.push({
      eje: 'paleta',
      titulo: T('Tu feed mezcla varias paletas', 'Your feed mixes several palettes'),
      texto: T(
        'Contamos ' + trialSignals.palette_hues + ' tonos dominantes distintos en tus últimas fotos: una sola línea visual hace que la grilla se reconozca de una.',
        'We counted ' + trialSignals.palette_hues + ' different dominant tones in your latest photos: one single visual line makes the grid recognizable at a glance.'),
      evidence: { tonos_dominantes: trialSignals.palette_hues },
    });
  }

  const top = findings.slice(0, 3);
  if (!top.length) return { ok: false, motivo: 'sin_hallazgos_verificados' };

  const fan = fanLine({ profile, posts, signals, trialSignals, namedCorroborated, star, starAppearances, recentN: recentCaps.length, T });
  if (!fan) return { ok: false, motivo: 'sin_linea_de_fan_verificada' };

  const evidence = { fan: fan.evidence };
  for (const f of top) evidence[f.eje] = f.evidence;

  return {
    ok: true,
    fan: { text: fan.text },
    findings: top.map((f) => ({ eje: f.eje, titulo: f.titulo, texto: f.texto })),
    evidence,
    signals: {
      n_posts: signals.n_posts,
      posteos_por_semana: trialSignals.posts_per_week != null ? trialSignals.posts_per_week : signals.posts_per_week,
      racha_max_dias: maxGap,
      dias_desde_ultimo: sinceLast,
      cta_pct: signals.cta_pct,
      gancho_pct: trialSignals.hook_pct != null ? trialSignals.hook_pct : null,
      videos: signals.videos,
      estrella: star ? star.name : null,
    },
  };
}

// ---------------------------------------------------------------------------
// El puente de la carta, textual aprobado (carta-fundador-posty.md),
// con el hueco del link llenado. Es lo que la plantilla del email pega
// tal cual; la carta guardada ya trae el puente con su [link].
// ---------------------------------------------------------------------------
function auditBridgeText(lang, url) {
  // Textual de la carta v5 (aprobada 13/11 23:06): el puente va dentro
  // del párrafo que abre con la línea de fan que nombra la estrella.
  return lang === 'en'
    ? "We put together a short audit of your account and here's what we saw: " + url + '. All of this is stuff we can make better.'
    : 'Te armamos una auditoría corta de tu cuenta y esto fue lo que vimos: ' + url + '. Todo esto lo podemos mejorar nosotros.';
}

// ---------------------------------------------------------------------------
// La página. Estructura y estilos de la vara visual
// (auditoria-ejemplo.html), SIN la banda de muestra: esta es la
// auditoría real de un negocio. Todo dato del negocio va escapado.
// ---------------------------------------------------------------------------
function renderAuditHtml(p) {
  const en = p.lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const name = p.business_name || ('@' + p.handle);
  const findingsHtml = (p.findings || []).map((f, i) =>
    '  <div class="hallazgo">\n    <b>' + (i + 1) + '. ' + escHtml(f.titulo) + '</b>\n    <p>' + escHtml(f.texto) + '</p>\n  </div>'
  ).join('\n');
  return '<!DOCTYPE html>\n<html lang="' + (en ? 'en' : 'es') + '">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<meta name="robots" content="noindex,nofollow">\n'
    + '<title>' + escHtml(T('Auditoría de tu Instagram: Valentino y Posty', 'Your Instagram audit: Valentino and Posty')) + '</title>\n'
    + '<style>\n'
    + '  body { margin:0; background:#F4F9FC; font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif; color:#0A1E33; }\n'
    + '  .card { max-width:480px; margin:0 auto; background:#FFFFFF; padding:28px 24px 32px; }\n'
    + '  .kicker { color:#2793C8; font-weight:700; font-size:13px; letter-spacing:.08em; text-transform:uppercase; margin:0 0 6px; }\n'
    + '  h1 { font-size:26px; line-height:1.2; margin:0 0 8px; }\n'
    + '  .sub { font-size:15px; line-height:1.5; color:#3D5871; margin:0 0 22px; }\n'
    + '  h2 { font-size:17px; margin:24px 0 10px; }\n'
    + '  .bien { background:#EFF7FB; border-left:4px solid #2793C8; border-radius:8px; padding:12px 14px; font-size:15px; line-height:1.5; margin:0; }\n'
    + '  .hallazgo { border:1px solid #E1EDF4; border-radius:12px; padding:14px 16px; margin:0 0 12px; }\n'
    + '  .hallazgo b { display:block; font-size:15px; margin-bottom:4px; }\n'
    + '  .hallazgo p { margin:0; font-size:14px; line-height:1.5; color:#3D5871; }\n'
    + '  .hariamos { background:#0A1E33; color:#FFFFFF; border-radius:12px; padding:16px 18px; margin-top:22px; }\n'
    + '  .hariamos b { display:block; font-size:15px; margin-bottom:6px; }\n'
    + '  .hariamos p { margin:0; font-size:14px; line-height:1.55; color:#CFE3F0; }\n'
    + '  .cta { display:block; text-align:center; background:#FEC14D; color:#0A1E33; font-weight:800; font-size:16px; text-decoration:none; border-radius:12px; padding:14px; margin-top:22px; }\n'
    + '  .precio { text-align:center; font-size:13px; color:#3D5871; margin:10px 0 0; }\n'
    + '  img.foto { width:100%; border-radius:12px; margin:26px 0 14px; display:block; }\n'
    + '  .firma { margin-top:26px; font-size:14px; line-height:1.5; color:#3D5871; }\n'
    + '  .firma b { color:#0A1E33; }\n'
    + '</style>\n</head>\n<body>\n<div class="card">\n'
    + '  <p class="kicker">' + escHtml(T('Auditoría de tu Instagram', 'Your Instagram audit')) + '</p>\n'
    + '  <h1>' + escHtml(T('Hola, ' + name + '. Esto fue lo que vimos.', 'Hi, ' + name + '. This is what we saw.')) + '</h1>\n'
    + '  <p class="sub">' + escHtml(T(
        'La armamos Valentino y Posty mirando tu Instagram de verdad, posteo por posteo. Sin compromiso: es tuya.',
        'Valentino and Posty built it looking at your real Instagram, post by post. No strings attached: it is yours.')) + '</p>\n'
    + '  <h2>' + escHtml(T('Primero, lo que nos gustó', 'First, what we liked')) + '</h2>\n'
    + '  <p class="bien">' + escHtml(p.fan && p.fan.text) + '</p>\n'
    + '  <h2>' + escHtml(T('Lo que vimos para mejorar', 'What we saw to improve')) + '</h2>\n'
    + findingsHtml + '\n'
    + '  <div class="hariamos">\n    <b>' + escHtml(T('Lo que haríamos nosotros', 'What we would do')) + '</b>\n    <p>' + escHtml(T(
        'Un posteo de calidad todos los días, con tu estrella al frente y tus productos con nombre, todo programado y saliendo solo. Vos no tocás nada: solo mirás cómo queda tu feed y cómo entran los clientes.',
        "One quality post every day, with your star up front and your products named, all scheduled and going out on its own. You don't touch a thing: you just watch how your feed looks and how the clients come in.")) + '</p>\n  </div>\n'
    + '  <a class="cta" href="' + TRIAL_URL + '">' + escHtml(T('Probalo 3 días gratis con tu Instagram', 'Try it free for 3 days with your Instagram')) + '</a>\n'
    + '  <p class="precio">' + escHtml(T(
        'El primer posteo te llega en el momento. Después, USD 199 por mes, sin compromiso.',
        'Your first post reaches you right away. After that, USD 199 a month, no strings attached.')) + '</p>\n'
    // (CARTA v6 · 13/11 23:10) El email sale SIN foto incrustada (spam):
    // la foto aprobada del equipo vive ACÁ, sobre la firma, en el lugar
    // de la muestra. El asset es la copia aprobada de la carpeta de la
    // carta (public/foto-equipo.jpg, byte-idéntica).
    + '  <img class="foto" src="/foto-equipo.jpg" alt="' + escHtml(T('Valentino y Posty, espalda con espalda', 'Valentino and Posty, back to back')) + '">\n'
    + '  <p class="firma"><b>Valentino Caratini</b><br>' + escHtml(T(
        'Founder de Posty, y tu community manager junto a Posty.',
        'Founder of Posty, and your community manager together with Posty.')) + '<br>postycommunitymanager.com</p>\n'
    + '</div>\n</body>\n</html>';
}

// ---------------------------------------------------------------------------
// Generación a demanda: lee el feed vivo (la lectura de la prueba),
// el catálogo real del sitio y la paleta de las miniaturas; construye,
// persiste con su evidencia y devuelve la URL con token.
// io inyectable para tests (mismo patrón que fetchOverride de la
// casa): { data, fetchOverride, profOverride, items, fetchCatalog,
// paletteHues, now }.
// ---------------------------------------------------------------------------
async function generateEmailAudit(input, io = {}) {
  const handle = feedAudit.sanitizeHandle((input && input.ig) || '');
  if (!handle) return { ok: false, motivo: 'arroba_invalida' };
  const lang = (input && input.lang) === 'en' ? 'en' : 'es';
  const domain = String((input && input.domain) || '').trim();

  let data = io.data;
  if (!data) {
    try { data = await feedAudit.fetchAuditData(handle, io.fetchOverride, io.profOverride); }
    catch (e) { data = null; }
  }
  if (!data || !data.ok || !Array.isArray(data.posts)) return { ok: false, motivo: 'instagram_no_leido' };

  let items = io.items;
  if (items === undefined) {
    items = [];
    if (domain) {
      try {
        const cat = await (io.fetchCatalog || deepRead.fetchDeepCatalog)(domain);
        if (cat && Array.isArray(cat.items)) items = cat.items;
      } catch (e) { items = []; }
    }
  }

  let paletteHues = io.paletteHues;
  if (paletteHues === undefined) {
    try { paletteHues = await feedAudit.analyzePalette(data.posts); } catch (e) { paletteHues = null; }
  }

  const built = buildAudit({ profile: data.profile, posts: data.posts, items, lang, paletteHues, now: io.now });
  if (!built.ok) return built;

  const businessName = String((data.profile && data.profile.name) || '').trim() || ('@' + handle);
  const token = crypto.randomBytes(24).toString('hex');
  const payload = {
    v: 1,
    handle,
    domain,
    lang,
    business_name: businessName,
    // La estrella de ESTA lectura: la plantilla de la carta v5 nombra
    // esta misma en su línea de fan («[su producto estrella]»).
    estrella: built.signals.estrella,
    fan: built.fan,
    findings: built.findings,
    evidence: built.evidence,
    signals: built.signals,
    created_at: new Date((io && io.now) || Date.now()).toISOString(),
  };
  try {
    db.prepare(`INSERT INTO email_audits (token, handle, domain, lang, business_name, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(token, handle, domain, lang, businessName, JSON.stringify(payload), Date.now());
  } catch (e) {
    return { ok: false, motivo: 'no_se_pudo_guardar' };
  }
  return { ok: true, token, url: '/a/' + token, payload };
}

function getByToken(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  try {
    const row = db.prepare('SELECT payload FROM email_audits WHERE token = ?').get(String(token));
    if (!row) return null;
    return JSON.parse(row.payload);
  } catch (e) { return null; }
}

module.exports = {
  generateEmailAudit,
  buildAudit,
  renderAuditHtml,
  auditBridgeText,
  getByToken,
  TRIAL_URL,
};
