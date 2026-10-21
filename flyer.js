'use strict';
/* =====================================================================
 * flyer.js — MODO FLYER · BOLICHES / VIDA NOCTURNA (v315, 2026-10-21)
 * Mandato de Valentino (21/10, tras aprobar el ejemplo NOCTA Halloween):
 * "podemos enfocarnos también en las discotecas, boliches que arman
 * siempre flyers de fiestas" — el boliche es el negocio que más piezas
 * pide por semana, y el flyer es su pieza central. Este módulo es el
 * tipo de pieza FLYER, con su propia gramática (excepción consciente y
 * acotada SOLO a este tipo; los posteos comunes no cambian):
 *
 *   1. El ARTE lo genera la IA con prompts de vida nocturna que dejan
 *      el CENTRO LIBRE para la tipografía (banco FLYER_STYLES).
 *   2. El TEXTO lo compone Posty por programa (flyer-compose.py,
 *      Montserrat ExtraBold): jerarquía fiesta → fecha → lineup →
 *      datos prácticos (apertura, entradas, edad). Cero errores de
 *      texto posibles: la IA jamás escribe una fecha ni un nombre.
 *   3. DATOS REALES O NADA: fiesta, fecha, lineup, precios e info
 *      salen del dueño (alta del evento en un toque / pregunta-radar)
 *      o de su fundamento. Si falta un dato, el flyer sale SIN ese
 *      renglón o no sale — jamás un DJ, una fecha o un precio
 *      fabricados.
 *   4. En flyers SÍ va el nombre del boliche (es el cartel de su
 *      evento; la regla "sin nombre impreso" sigue firme en los
 *      posteos comunes).
 *   5. Paquete por fiesta: flyer de feed 4:5 (1080×1350) + historia
 *      9:16 (1080×1920) + cuenta regresiva (T-3, T-1 y día del evento)
 *      desde el mismo arte. Todo nace BORRADOR en la Agenda con su
 *      horario sugerido: el dueño aprueba, como siempre.
 *
 * EL FUNDAMENTO DE UN BOLICHE (cómo se lee su digest acá):
 *   servicios[]  = sus fiestas y ciclos (Viernes Electrónico, Sábados
 *                  de Cachengue) y sus pistas;
 *   productos[]  = entradas y anticipadas (con precio si consta);
 *   promos[]     = promos de barra REALES (solo salen si el dueño las
 *                  confirma para ESTA fiesta);
 *   protagonista = el club y/o su DJ residente.
 *
 * GUARDARRAÍLES DEL RUBRO: contenido +18 tratado como entretenimiento
 * adulto normal; ningún texto apunta a menores; las promos de alcohol
 * solo aparecen si son el dato real que el dueño cargó (campo promo).
 * FAIL-CLOSED: sin motor de imagen no hay paquete ni éxito falso — el
 * job queda 'failed' con el motivo a la vista.
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const COMPOSE_PY = path.join(__dirname, 'flyer-compose.py');
const FEED = { w: 1080, h: 1350 };
const STORY = { w: 1080, h: 1920 };

// ---------------------------------------------------------------------
// Banco de prompts de arte por estilo/temática. TODOS cumplen el
// contrato del modo flyer: fondo vertical, SIN texto, centro oscuro y
// vacío para la tipografía, multitud solo en el borde inferior.
// accent = color de la fecha; glow = halo del titular.
// ---------------------------------------------------------------------
const CENTER_FREE = 'clean dark EMPTY CENTER left free for typography, dancing crowd silhouettes along the very bottom edge, no text, no letters, no logos';
const FLYER_STYLES = {
  'neon-y2k': {
    name: { es: 'Neón Y2K cromo', en: 'Neon Y2K chrome' },
    accent: '#8AFF3C', glow: '#A855F7',
    prompt: `Vertical party flyer background artwork: neon Y2K chrome aesthetic, inflatable metallic blob shapes framing the edges, ultraviolet and magenta laser beams through light fog, mini disco balls, deep black backdrop, ${CENTER_FREE}, glamorous rave poster energy, rich contrast.`,
  },
  'techno': {
    name: { es: 'Techno industrial', en: 'Industrial techno' },
    accent: '#FF4D4D', glow: '#FF2D55',
    prompt: `Vertical party flyer background artwork: dark techno warehouse aesthetic, a single white strobe beam cutting diagonal haze, raw concrete textures at the edges, subtle red glow in the corners, deep black backdrop, ${CENTER_FREE}, underground Berlin poster mood.`,
  },
  'retro-disco': {
    name: { es: 'Retro disco', en: 'Retro disco' },
    accent: '#FFC53D', glow: '#FF8A3D',
    prompt: `Vertical party flyer background artwork: retro 70s disco aesthetic, a giant mirror disco ball glowing at the top, warm gold and amber light rays, glitter particles floating at the edges, deep warm black backdrop, ${CENTER_FREE}, Studio 54 glamour.`,
  },
  'latina': {
    name: { es: 'Fiesta latina', en: 'Latin party' },
    accent: '#FFD166', glow: '#FF5D8F',
    prompt: `Vertical party flyer background artwork: Latin party aesthetic, hot coral and turquoise neon glow, tropical palm shadows framing the edges, warm golden bokeh, deep dark backdrop, ${CENTER_FREE}, summer night heat, reggaeton nightclub energy.`,
  },
  'halloween': {
    name: { es: 'Halloween UV', en: 'UV Halloween' },
    accent: '#8AFF3C', glow: '#A855F7',
    prompt: `Vertical party flyer background artwork: neon Halloween nightclub aesthetic, a glowing ultraviolet jack-o-lantern moon at the top, toxic green and purple slime dripping from the top edges, small bats in the upper corners, laser beams through fog, deep black backdrop, ${CENTER_FREE}, spooky rave poster.`,
  },
  'ano-nuevo': {
    name: { es: 'Año Nuevo dorado', en: 'Golden New Year' },
    accent: '#FFD700', glow: '#FFC53D',
    prompt: `Vertical party flyer background artwork: New Year party aesthetic, golden confetti and champagne sparkle falling from the top edges, elegant black and gold palette, light beams through gentle haze, deep black backdrop, ${CENTER_FREE}, luxury midnight celebration.`,
  },
  'verano': {
    name: { es: 'Verano sunset', en: 'Summer sunset' },
    accent: '#FFB703', glow: '#FB7185',
    prompt: `Vertical party flyer background artwork: summer open-air party aesthetic, a sunset gradient of hot pink and orange melting into night purple at the edges, palm silhouettes framing the sides, string-light bokeh, dark backdrop, ${CENTER_FREE}, golden-hour party heat.`,
  },
  'carnaval': {
    name: { es: 'Carnaval color', en: 'Color carnival' },
    accent: '#FACC15', glow: '#E879F9',
    prompt: `Vertical party flyer background artwork: carnival party aesthetic, an explosion of colorful feathers and confetti framing the edges, vivid magenta cyan and yellow accents, festive light beams, deep dark backdrop, ${CENTER_FREE}, maximalist celebration energy.`,
  },
  'blanco': {
    name: { es: 'White party', en: 'White party' },
    accent: '#E2E8F0', glow: '#94A3B8',
    prompt: `Vertical party flyer background artwork: white party aesthetic, elegant silver and white balloons and silk drapes framing the edges, soft ultraviolet rim light, deep charcoal backdrop, ${CENTER_FREE}, premium minimal glamour.`,
  },
  'glow': {
    name: { es: 'Glow UV', en: 'UV glow' },
    accent: '#4ADE80', glow: '#F472B6',
    prompt: `Vertical party flyer background artwork: glow party aesthetic, fluorescent paint splashes in neon pink green and orange framing the edges under blacklight, ultraviolet glow particles floating, deep black backdrop, ${CENTER_FREE}, electric UV rave energy.`,
  },
};
const STYLE_KEYS = Object.keys(FLYER_STYLES);

// El estilo se elige por la temática de la fiesta SOLO si el dueño no
// eligió uno (es dirección de arte, nunca un dato del evento).
function styleForEvent(ev) {
  if (ev && ev.estilo && FLYER_STYLES[ev.estilo]) return ev.estilo;
  const t = String((ev && ev.fiesta) || '').toLowerCase();
  if (/halloween|noche de brujas/.test(t)) return 'halloween';
  if (/año nuevo|ano nuevo|new year|fin de año/.test(t)) return 'ano-nuevo';
  if (/carnaval|carnival/.test(t)) return 'carnaval';
  if (/white|blanco|blanca/.test(t)) return 'blanco';
  if (/glow|neon party|fiesta neon/.test(t)) return 'glow';
  if (/techno|industrial|warehouse/.test(t)) return 'techno';
  if (/disco|retro|70s|ochenta|80s/.test(t)) return 'retro-disco';
  if (/latina|reggaeton|cachengue|perreo/.test(t)) return 'latina';
  if (/verano|summer|sunset|terraza/.test(t)) return 'verano';
  return 'neon-y2k';
}

// ---------------------------------------------------------------------
// Validación del evento — DATOS REALES O NADA. Obligatorios: el nombre
// de la fiesta y su fecha (texto del dueño). La fecha ISO es opcional:
// sin ella no hay cuenta regresiva programable (no se inventa el día).
// ---------------------------------------------------------------------
const clean = (v, max) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max);
function validISODate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function validateEvent(ev) {
  const e = (ev && typeof ev === 'object') ? ev : {};
  const value = {
    fiesta: clean(e.fiesta, 42),
    fechaTexto: clean(e.fechaTexto || e.fecha, 42),
    fechaISO: clean(e.fechaISO, 10),
    lineup: (Array.isArray(e.lineup) ? e.lineup : String(e.lineup || '').split(/[·,;+|]/))
      .map((x) => clean(x, 40)).filter(Boolean).slice(0, 4),
    apertura: clean(e.apertura, 16),
    entradas: clean(e.entradas, 60),
    edad: clean(e.edad, 8),
    promo: clean(e.promo, 60),
    estilo: clean(e.estilo, 24),
  };
  const missing = [];
  if (!value.fiesta) missing.push('fiesta');
  if (!value.fechaTexto) missing.push('fecha');
  if (value.fechaISO && !validISODate(value.fechaISO)) return { ok: false, error: 'fecha_invalida', missing: [], value };
  if (missing.length) return { ok: false, error: 'missing_data', missing, value };
  value.estilo = styleForEvent(value);
  return { ok: true, value };
}

// Suma días a una fecha ISO (aritmética de calendario, sin husos).
function addDaysISO(iso, days) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// La cuenta regresiva SOLO existe con fecha ISO: sus placas ("faltan 3
// días", "mañana", "hoy") son verdad únicamente si la historia sale el
// día que el plan dice — por eso cada una nace con su scheduled_at.
function countdownPlan(ev, lang) {
  if (!ev.fechaISO) return [];
  const en = lang === 'en';
  const fiesta = String(ev.fiesta || '').toUpperCase();
  return [
    { offset: -3, plate: en ? '3 DAYS TO GO' : 'FALTAN 3 DÍAS', at: '20:00:00' },
    { offset: -1, plate: en ? 'TOMORROW' : 'MAÑANA', at: '20:00:00' },
    { offset: 0, plate: (en ? 'TONIGHT · ' : 'HOY · ') + fiesta, at: '12:00:00' },
  ].map((c) => ({ ...c, dateISO: addDaysISO(ev.fechaISO, c.offset), scheduled_at: `${addDaysISO(ev.fechaISO, c.offset)} ${c.at}` }));
}

// El caption del flyer de feed: SOLO datos del evento (voz de entrega,
// profesional — no la voz de chat). Nada de promesas ni datos ajenos.
function captionFor(ev, club, handle, lang) {
  const en = lang === 'en';
  const lines = [];
  lines.push(`${ev.fiesta} ${en ? 'at' : 'en'} ${club} 🎉`);
  lines.push(`📅 ${ev.fechaTexto}`);
  if (ev.lineup.length) lines.push(`🎧 ${ev.lineup.join(' · ')}`);
  if (ev.promo) lines.push(`🍸 ${ev.promo}`);
  if (ev.apertura) lines.push(`🕛 ${en ? 'Doors' : 'Apertura'} ${ev.apertura}`);
  if (ev.entradas) lines.push(`🎟️ ${ev.entradas}`);
  if (ev.edad) lines.push(ev.edad);
  const tags = ['#' + String(club || '').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/g, ''),
    en ? '#Nightclub' : '#Boliche', en ? '#Nightlife' : '#VidaNocturna'];
  if (/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/.test(ev.fiesta)) tags.push('#' + ev.fiesta.replace(/\s+/g, ''));
  return { caption: lines.join('\n'), hashtags: tags.filter((t) => t.length > 1).join(' ') };
}

function artPromptFor(styleKey, ev, digest) {
  const st = FLYER_STYLES[styleKey] || FLYER_STYLES['neon-y2k'];
  let p = st.prompt;
  const pal = (digest && Array.isArray(digest.paleta)) ? digest.paleta.map((c) => c && c.hex).filter(Boolean).slice(0, 3) : [];
  if (pal.length) p += ` Favor the venue's own accent colors where they fit: ${pal.join(', ')}.`;
  return p;
}

// ---------------------------------------------------------------------
// Composición (flyer-compose.py vía PIL). spec → archivo com puesto.
// ---------------------------------------------------------------------
function compose(spec, mediaDir) {
  return new Promise((resolve, reject) => {
    const specFile = path.join(mediaDir, `.flyer-spec-${crypto.randomBytes(4).toString('hex')}.json`);
    fs.writeFileSync(specFile, JSON.stringify(spec));
    execFile('python3', [COMPOSE_PY, specFile], { timeout: 90000 }, (err, stdout) => {
      try { fs.unlinkSync(specFile); } catch (e) {}
      if (err) return reject(new Error('compose: ' + (err.message || 'error')));
      try {
        const j = JSON.parse(String(stdout).trim().split('\n').pop());
        if (!j.ok) return reject(new Error('compose: ' + (j.error || 'sin detalle')));
        resolve(j);
      } catch (e) { reject(new Error('compose: salida inválida')); }
    });
  });
}

// ---------------------------------------------------------------------
// El paquete completo de una fiesta → borradores en la Agenda.
// genArt(prompt) → b64 de la imagen (el server envuelve su motor real;
// en tests se inyecta). Sin genArt o sin imagen: error visible, cero
// éxito falso.
// ---------------------------------------------------------------------
async function createFlyerPackage({ db, uid, event, digest, profile, mediaDir, genArt, weekKey, lang = 'es', tz = '' }) {
  const v = validateEvent(event);
  if (!v.ok) { const e = new Error(v.error); e.code = v.error; e.missing = v.missing; throw e; }
  const ev = v.value;
  const club = clean(profile && profile.business_name, 60);
  if (!club) { const e = new Error('missing_data'); e.code = 'missing_data'; e.missing = ['club']; throw e; }
  if (typeof genArt !== 'function') { const e = new Error('sin_motor_imagen'); e.code = 'sin_motor_imagen'; throw e; }
  const handle = profile && profile.ig_username ? '@' + String(profile.ig_username).replace(/^@/, '') : '';
  const styleKey = ev.estilo;
  const st = FLYER_STYLES[styleKey];
  const b64 = await genArt(artPromptFor(styleKey, ev, digest));
  if (!b64) { const e = new Error('sin_motor_imagen'); e.code = 'sin_motor_imagen'; throw e; }

  const rand = crypto.randomBytes(4).toString('hex');
  const artFile = path.join(mediaDir, `flyer-art-${uid}-${rand}.png`);
  fs.writeFileSync(artFile, Buffer.from(b64, 'base64'));
  const base = { art: artFile, club, fiesta: ev.fiesta, fecha: ev.fechaTexto, lineup: ev.lineup,
    apertura: ev.apertura, aperturaLabel: lang === 'en' ? 'DOORS' : 'APERTURA',
    entradas: ev.entradas, edad: ev.edad, promo: ev.promo,
    accent: st.accent, glow: st.glow };
  const out = {};
  try {
    out.feed = path.join(mediaDir, `flyer-${uid}-${rand}-feed.jpg`);
    await compose({ ...base, out: out.feed, w: FEED.w, h: FEED.h, variant: 'feed' }, mediaDir);
    out.story = path.join(mediaDir, `flyer-${uid}-${rand}-story.jpg`);
    await compose({ ...base, out: out.story, w: STORY.w, h: STORY.h, variant: 'story' }, mediaDir);
    out.countdown = [];
    for (const c of countdownPlan(ev, lang)) {
      const f = path.join(mediaDir, `flyer-${uid}-${rand}-cd${Math.abs(c.offset)}.jpg`);
      await compose({ ...base, out: f, w: STORY.w, h: STORY.h, variant: 'story', plate: c.plate }, mediaDir);
      out.countdown.push({ file: f, ...c });
    }
  } finally {
    try { fs.unlinkSync(artFile); } catch (e) {}
  }

  const en = lang === 'en';
  const { caption, hashtags } = captionFor(ev, club, handle, lang);
  const whyFeed = en
    ? `Flyer mode: the ${ev.fiesta} party flyer — the week is built around the party; feed + story + countdown, all with the owner's real data`
    : `Modo flyer: el flyer de ${ev.fiesta} — la semana se ordena alrededor de la fiesta; feed + historia + cuenta regresiva, todo con los datos reales del dueño`;
  const whyStory = en ? 'Flyer mode: the story version of the party flyer' : 'Modo flyer: la versión historia del flyer de la fiesta';
  const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source_topic, source_angle, tipo, strategy_why, week_key, needs_review, scheduled_at)
    VALUES (?,?,?,?, 'draft', ?, ?, 'modo flyer', 'flyer', ?, ?, 1, ?)`);
  const name = (f) => '/media/' + path.basename(f);
  const postIds = [];
  const rFeed = ins.run(uid, name(out.feed), caption, hashtags, 'image', ev.fiesta, whyFeed, weekKey || '', ev.fechaISO ? `${ev.fechaISO} 18:00:00` : null);
  postIds.push(rFeed.lastInsertRowid);
  const rStory = ins.run(uid, name(out.story), '', '', 'story', ev.fiesta, whyStory, weekKey || '', ev.fechaISO ? `${ev.fechaISO} 20:00:00` : null);
  postIds.push(rStory.lastInsertRowid);
  for (const c of out.countdown) {
    const r = ins.run(uid, name(c.file), '', '', 'story', ev.fiesta,
      (en ? 'Flyer mode: countdown story (' : 'Modo flyer: historia de cuenta regresiva (') + c.plate + ')', weekKey || '', c.scheduled_at);
    postIds.push(r.lastInsertRowid);
  }
  return {
    postIds, style: styleKey,
    files: { feed: name(out.feed), story: name(out.story), countdown: out.countdown.map((c) => name(c.file)) },
    countdown: out.countdown.map((c) => ({ plate: c.plate, scheduled_at: c.scheduled_at })),
    event: ev,
  };
}

// ---------------------------------------------------------------------
// Rutas + jobs. El paquete tarda (arte IA + composición): nace un job
// y el borrador aparece en la Agenda cuando está listo — el mismo
// patrón del reel hablado. La tabla la crea el módulo.
// ---------------------------------------------------------------------
function ensureTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS flyer_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    error TEXT NOT NULL DEFAULT '',
    result_json TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

function rubroKeyOfDigest(digest, profile) {
  const raw = (digest && digest.rubro_id && digest.rubro_id.rubro) || (digest && digest.category)
    || (profile && profile.category) || '';
  return String(raw).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function registerFlyer(app, db, deps) {
  ensureTable(db);
  const isBoliche = (uid) => {
    try {
      const digest = deps.digestFor ? deps.digestFor(uid) : null;
      const profile = deps.profileFor ? deps.profileFor(uid) : null;
      return rubroKeyOfDigest(digest, profile) === 'boliche';
    } catch (e) { return false; }
  };

  app.get('/api/flyer/meta', deps.requireAuth, (req, res) => {
    const uid = req.session.userId;
    const lang = deps.langFor ? deps.langFor(uid) : 'es';
    const en = lang === 'en';
    let digest = null; let profile = null;
    try { digest = deps.digestFor ? deps.digestFor(uid) : null; } catch (e) {}
    try { profile = deps.profileFor ? deps.profileFor(uid) : null; } catch (e) {}
    // Las fiestas candidatas salen de SU fundamento (servicios = fiestas
    // y ciclos): el dueño confirma con un toque, no se inventa ninguna.
    const fiestas = ((digest && digest.servicios) || []).map((s) => clean(s && (s.nombre || s), 60)).filter(Boolean).slice(0, 8);
    res.json({
      ok: true, boliche: isBoliche(uid),
      club: clean(profile && profile.business_name, 60),
      fiestas,
      styles: STYLE_KEYS.map((k) => ({ key: k, name: FLYER_STYLES[k].name[en ? 'en' : 'es'] })),
    });
  });

  app.post('/api/flyer/event', deps.requireAuth, async (req, res) => {
    const uid = req.session.userId;
    const lang = deps.langFor ? deps.langFor(uid) : 'es';
    const en = lang === 'en';
    if (!isBoliche(uid)) {
      return res.status(403).json({ error: en ? 'Flyer mode is for nightclubs — this account is not classified as one' : 'El modo flyer es para boliches y esta cuenta no está clasificada como boliche', code: 'flyer_solo_boliches' });
    }
    const v = validateEvent((req.body && req.body.event) || {});
    if (!v.ok) {
      return res.status(400).json({ error: v.error, code: v.error, missing: v.missing || [] });
    }
    const job = db.prepare('INSERT INTO flyer_jobs (user_id, status) VALUES (?, \'processing\')').run(uid);
    const jobId = job.lastInsertRowid;
    res.json({ ok: true, jobId });
    // Procesamiento en segundo plano: la Agenda recibe los borradores.
    (async () => {
      try {
        let digest = null; let profile = null;
        try { digest = deps.digestFor ? deps.digestFor(uid) : null; } catch (e) {}
        try { profile = deps.profileFor ? deps.profileFor(uid) : null; } catch (e) {}
        const result = await createFlyerPackage({
          db, uid, event: v.value, digest, profile,
          mediaDir: deps.mediaDir,
          genArt: deps.genArt ? (prompt) => deps.genArt(uid, prompt) : null,
          weekKey: deps.weekKeyFor ? deps.weekKeyFor(uid) : '',
          lang,
          tz: deps.tzFor ? deps.tzFor(uid) : '',
        });
        db.prepare('UPDATE flyer_jobs SET status = \'done\', result_json = ? WHERE id = ?')
          .run(JSON.stringify(result), jobId);
      } catch (e) {
        db.prepare('UPDATE flyer_jobs SET status = \'failed\', error = ? WHERE id = ?')
          .run(String((e && (e.code || e.message)) || 'error'), jobId);
      }
    })();
  });

  app.get('/api/flyer/jobs/:id', deps.requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM flyer_jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'not_found' });
    let result = null;
    try { result = row.result_json ? JSON.parse(row.result_json) : null; } catch (e) {}
    res.json({ ok: true, status: row.status, error: row.error || '', result });
  });
}

module.exports = {
  FLYER_STYLES, STYLE_KEYS, styleForEvent, validateEvent, validISODate,
  addDaysISO, countdownPlan, captionFor, artPromptFor, compose,
  createFlyerPackage, ensureTable, registerFlyer, rubroKeyOfDigest,
};
