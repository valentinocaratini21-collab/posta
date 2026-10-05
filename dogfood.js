// dogfood.js — Posty dogfood: Posty como su propio primer cliente.
// La house account (@posty.hacetodo) publica lun–vie en DOGFOOD_POST_TIME
// (default 18:00, DOGFOOD_TZ). El draft del día se genera a la mañana con
// `scheduled_for`; la notificación (push → email → badge) sale 1 minuto antes
// del horario; si a las 2 horas no hubo respuesta, se publica solo.
//
// Flujo: cron generador (scheduler.js) → generateDogfoodSlot() →
// tickDogfood() cada minuto → notify en T-1min (notifyDogfood) /
// auto-publish en T+2h (approveDogfood con decision='auto').
// Aprobación manual: POST /api/dogfood/:id/approve (server.js) →
// publishSinglePost(db, post, { house: true }).
//
// Reglas: 1 propuesta por día como máximo (cero ansiedad); sáb/dom: cero ruido.
// Sin VAPID keys: no crashea — cae a email, y si no hay email, badge en la app.
// Sin OpenAI key: no se genera nada (log claro), tampoco crashea.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { pickStyle, styleFragment } = require('./image-styles');
const { pickHook, renderHook, ensureCaptionOpensWithHook } = require('./hooks');
const { fallbackImage } = require('./image-fallback');
const { sendPush, pushConfigured } = require('./push');
const { sendEmail, emailShell, emailConfigured } = require('./email');
const { recordPerformance } = require('./learning');
const { trackUsage, IMAGE_QUALITY } = require('./costs');
// FASE 0 — qualityGate en el auto-publish de dogfood (autopilot.js no tiene
// dependencias del proyecto, no hay ciclo de requires).
const { qualityGate, saveQualityResult } = require('./autopilot');

// ---------------------------------------------------------------------------
// 1. House account: el brief unificado de Posty.
// ---------------------------------------------------------------------------
const HOUSE = {
  igHandle: '@posty.hacetodo',
  businessName: 'Posty',
  sells: 'Tu community manager con IA: te arma la semana de Instagram en 1 minuto (posteos, reels, stories, captions y hashtags con la onda de tu negocio). Vos solo aprobás; nada se publica sin tu OK.',
  audience: 'dueños de pymes y emprendedores (gastronomía, moda, belleza, servicios) que no tienen tiempo para Instagram pero saben que lo necesitan.',
  tone: 'cálido, directo, canchero, cero humo. Habla de igual a igual, nunca vende humo corporativo. Español rioplatense.',
  cta: 'Probalo gratis 👇\npostyhacetodo.com/prueba', // variante 1 de 3; rotación diaria en HOUSE_CTA_VARIANTS
  palette: ['#2793C8', '#FEC14D', '#0A1E33'], // celeste, amarillo, navy (marca Posty)
  hashtags: '#communitymanager #marketingdigital #emprendedoresargentinos #pymes #instagramparanegocios', // bloque A de 3; rotación diaria en HOUSE_HASHTAG_BLOCKS
  mascotFile: 'posty-mascot.png', // opcional: data/media/posty-mascot.png → referencia visual
};

// ---------------------------------------------------------------------------
// Rotación diaria de hashtags y CTA (Juli QA 2026-10-05).
// El checklist anti-genérico exige: máx 5 hashtags, nunca el mismo bloque
// en dos posteos seguidos, y cierre variado. El bloque/CTA hardcodeado
// violaba las tres reglas en TODOS los posteos de la house account.
// Semilla = día entero: dos días seguidos nunca repiten bloque ni CTA.
// ---------------------------------------------------------------------------
const HOUSE_HASHTAG_BLOCKS = [
  '#communitymanager #marketingdigital #emprendedoresargentinos #pymes #instagramparanegocios',
  '#communitymanager #negociosargentinos #contenidodevalor #emprendedores #marketingparaemprendedores',
  '#communitymanager #redessociales #instagramparanegocios #emprender #negociosdigitales',
];
const HOUSE_CTA_VARIANTS = [
  'Probalo gratis 👇\npostyhacetodo.com/prueba',
  'Armá tu semana en 1 minuto 👇\npostyhacetodo.com/prueba',
  'Mirá cómo quedaría tu Instagram 👇\npostyhacetodo.com/prueba',
];
function houseDaySeed(date) {
  const t = date instanceof Date ? date.getTime() : new Date(date || Date.now()).getTime();
  return Math.floor(t / 86400000);
}
function houseHashtags(date) {
  return HOUSE_HASHTAG_BLOCKS[houseDaySeed(date) % HOUSE_HASHTAG_BLOCKS.length];
}
function houseCta(date) {
  return HOUSE_CTA_VARIANTS[houseDaySeed(date) % HOUSE_CTA_VARIANTS.length];
}

// Rotación de ángulos: nunca dos días seguidos el mismo.
const ANGLES = [
  {
    id: 'beneficio', label: 'Beneficios',
    intent: 'promo', theme: 'tu semana de Instagram lista en 1 minuto',
    visual: 'the cute blue robot mascot proudly presenting a smartphone showing a beautiful Instagram weekly content calendar, floating design icons around',
    bodies: [
      'Publicar en Instagram te roba 6 horas por semana. Posty te las devuelve.\n\n5 posteos + 1 reel + stories, diseñados con la onda de tu negocio, tus colores, tus fotos. Vos solo mirás, aprobás y seguís vendiendo.',
      'Mientras vos atendés tu negocio, Posty atiende tu Instagram.\n\nDiseños, textos y hashtags con tu onda, listos cada semana. Nada se publica sin tu OK.',
    ],
  },
  {
    id: 'como-funciona', label: 'Cómo funciona',
    intent: 'educativo', theme: 'cómo funciona Posty en 3 pasos',
    visual: 'the cute blue robot mascot showing 3 simple steps on floating cards: 1. pasame tu @, 2. armo tu semana, 3. vos aprobas',
    bodies: [
      'Así de simple:\n\n1️⃣ Me pasás tu @\n2️⃣ Armo tu semana: diseños, textos y hashtags\n3️⃣ Vos aprobás y se publica solo\n\nSin curva de aprendizaje. Sin vueltas.',
      'No tenés que aprender nada nuevo.\n\nMe contás de tu negocio una vez, y cada semana tu Instagram se llena solo. Vos solo decís que sí.',
    ],
  },
  {
    id: 'prueba-social', label: 'Prueba social',
    intent: 'testimonio', theme: 'dueños que ya no piensan en Instagram',
    visual: 'the cute blue robot mascot celebrating with confetti next to a phone showing happy customer comments and likes',
    bodies: [
      'Hay dueños que hace meses no piensan en qué publicar.\n\nNo porque no les importe Instagram. Porque Posty se ocupa.',
      'El mejor marketing es el que no te quita tiempo.\n\nPosty publica por vos mientras vos vendés. Así de simple.',
    ],
  },
  {
    id: 'detras', label: 'Detrás de escena',
    intent: 'detras', theme: 'Posty trabajando de noche por tu negocio',
    visual: 'the cute blue robot mascot working at night in a cozy office, juggling glowing Instagram icons, moon in the window',
    bodies: [
      'Mientras dormís, Posty sigue trabajando.\n\nResponde comentarios con tu voz, sube stories, y si llueve te arma la promo de delivery antes de que se te ocurra.',
      'Las 3 AM. Tu negocio duerme. Tu Instagram no.\n\nPosty programa, responde y prepara. A la mañana, todo listo.',
    ],
  },
  {
    id: 'tips', label: 'Tips',
    intent: 'tips', theme: 'tip de Instagram para negocios',
    visual: 'the cute blue robot mascot teaching at a small chalkboard with Instagram tips, lightbulb moment',
    bodies: [
      'El error #1 de los negocios en Instagram: publicar cuando se acuerdan.\n\nEl algoritmo premia la constancia, no la inspiración. Posty te da la constancia sin que muevas un dedo.',
      'Tip que nadie te dice: tu primera línea decide si te leen o te scrollean.\n\nPosty abre cada caption con gancho. Probalo y mirá la diferencia.',
    ],
  },
  {
    id: 'objecion', label: 'Objeciones',
    intent: 'social', theme: 'responde la duda más común sobre Posty',
    visual: 'the cute blue robot mascot shrugging with a friendly smile next to a big shield with a checkmark, trust and safety',
    bodies: [
      '¿Y si publica algo que no me gusta?\n\nSpoiler: no puede. Nada se publica sin tu OK. Vos aprobás cada posteo antes de que salga. Siempre.',
      '¿Y si no me gusta? Probalo gratis primero.\n\nArmás tu semana, la ves, y recién ahí decidís. Sin tarjeta, sin compromiso.',
    ],
  },
];

// ---------------------------------------------------------------------------
// Timing: la notificación sale 1 minuto antes del horario programado;
// si a las 2 horas no hubo respuesta, se publica solo. El mensaje SIEMPRE
// dice la regla de las 2 horas.
// ---------------------------------------------------------------------------
const AUTO_RULE_COPY = 'Si no respondés en 2 horas, se publica solo.';
const DOGFOOD_PUSH_TITLE = '¿Lo publico? 📸';
const DOGFOOD_EMAIL_SUBJECT = '¿Lo publico? Tu posteo de hoy sale ahora';

function dogfoodTz() {
  return String(process.env.DOGFOOD_TZ || 'America/Argentina/Buenos_Aires');
}

function dogfoodPostTime() {
  const t = String(process.env.DOGFOOD_POST_TIME || '18:00').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '18:00';
}

// Partes locales (YYYY-MM-DD, HH:MM, dow 0=dom..6=sáb) en la timezone dada.
function tzParts(tz, d) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  let hour = parts.hour;
  if (hour === '24') hour = '00'; // medianoche en algunas implementaciones
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hm: `${hour}:${parts.minute}`, dow: dowMap[parts.weekday] ?? -1 };
}

// Suma minutos a un "YYYY-MM-DD HH:MM" (aritmética UTC sobre el wall time;
// comparaciones lexicográficas entre strings del mismo formato).
function addMinutesStr(ymdHm, mins) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(ymdHm || ''));
  if (!m) return '';
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + mins * 60000;
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// ---------------------------------------------------------------------------
// Migración idempotente.
// ---------------------------------------------------------------------------
function initDogfood(db) {
  if (!db) return false;
  try { db.exec(`ALTER TABLE posts ADD COLUMN kind TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
  // Timing del dogfood: scheduled_for (slot del día, "YYYY-MM-DD HH:MM" en
  // DOGFOOD_TZ), notified_at (cuándo salió el aviso), auto_at (scheduled_for+2h),
  // decision ('approved' | 'auto' | 'dismissed').
  for (const col of [
    `ALTER TABLE posts ADD COLUMN decision TEXT DEFAULT ''`,
    `ALTER TABLE posts ADD COLUMN scheduled_for TEXT DEFAULT ''`,
    `ALTER TABLE posts ADD COLUMN notified_at TEXT DEFAULT ''`,
    `ALTER TABLE posts ADD COLUMN auto_at TEXT DEFAULT ''`,
  ]) { try { db.exec(col); } catch (e) { /* ya existe */ } }
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS dogfood_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_angle TEXT DEFAULT '',
      last_date TEXT DEFAULT ''
    )`);
    db.exec(`INSERT OR IGNORE INTO dogfood_state (id) VALUES (1)`);
    try { db.exec(`ALTER TABLE dogfood_state ADD COLUMN generating_since TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
  } catch (e) { return false; }
  // Tokens de un solo uso para aprobar/descartar por email (links firmados HMAC).
  // Se guarda solo el hash del token; la firma y la expiración viajan en el token.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS dogfood_email_tokens (
      token_hash TEXT PRIMARY KEY,
      post_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      used_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch (e) { return false; }
  return true;
}

// ---------------------------------------------------------------------------
// Dueño: a quién le llega la push y de quién cuelga el draft.
// 1) env DOGFOOD_OWNER_EMAIL  2) usuario con más suscripciones push
// 3) usuario más antiguo. Nunca tira.
// ---------------------------------------------------------------------------
function resolveOwnerUserId(db) {
  try {
    const email = String(process.env.DOGFOOD_OWNER_EMAIL || '').trim().toLowerCase();
    if (email) {
      const r = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
      if (r && r.id) return r.id;
    }
  } catch (e) {}
  try {
    const r = db.prepare(
      `SELECT user_id, COUNT(*) AS n FROM push_subscriptions GROUP BY user_id ORDER BY n DESC LIMIT 1`
    ).get();
    if (r && r.user_id) return r.user_id;
  } catch (e) {}
  try {
    const r = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    if (r && r.id) return r.id;
  } catch (e) {}
  return null;
}

// ---------------------------------------------------------------------------
// Rotación de ángulos: elige uno distinto al último usado y lo guarda.
// ---------------------------------------------------------------------------
function pickAngle(db) {
  let last = '';
  try {
    const r = db.prepare('SELECT last_angle FROM dogfood_state WHERE id = 1').get();
    last = (r && r.last_angle) || '';
  } catch (e) {}
  const pool = ANGLES.filter((a) => a.id !== last);
  const chosen = pool[Math.floor(Math.random() * pool.length)] || ANGLES[0];
  try {
    db.prepare(`UPDATE dogfood_state SET last_angle = ?, last_date = date('now','localtime') WHERE id = 1`)
      .run(chosen.id);
  } catch (e) {}
  return chosen;
}

function usedHookIds(db, ownerId, limit = 60) {
  try {
    const rows = db.prepare(
      `SELECT hook_id FROM posts WHERE user_id = ? AND kind = 'dogfood' AND hook_id != '' ORDER BY id DESC LIMIT ?`
    ).all(ownerId, limit);
    return rows.map((r) => r.hook_id).filter(Boolean);
  } catch (e) { return []; }
}

function usedStyles(db, ownerId, limit = 12) {
  try {
    const rows = db.prepare(
      `SELECT style_code FROM posts WHERE user_id = ? AND kind = 'dogfood' AND style_code != '' ORDER BY id DESC LIMIT ?`
    ).all(ownerId, limit);
    return rows.map((r) => r.style_code).filter(Boolean);
  } catch (e) { return []; }
}

// Sin asteriscos, nunca: se nota demasiado que es IA.
function stripAsterisks(s) {
  return String(s || '').replace(/\*+/g, '');
}

function buildCaption(angle, ownerId, db) {
  const hook = pickHook({ intent: angle.intent, usedHookIds: usedHookIds(db, ownerId) });
  const hookText = renderHook(hook, { tema: angle.theme, negocio: HOUSE.businessName });
  const body = angle.bodies[Math.floor(Math.random() * angle.bodies.length)];
  let caption = ensureCaptionOpensWithHook(body, hookText);
  caption = `${caption}\n\n${houseCta()}`;
  caption = stripAsterisks(caption);
  return { caption, hookId: hook.id };
}

// ---------------------------------------------------------------------------
// Generación de imagen: cadena de fallback (IA → tarjeta de marca → sólido).
// La mascota se usa como referencia visual si existe en data/media/.
// ---------------------------------------------------------------------------
function mascotRefPath(mediaDir) {
  // 1) override local: data/media/posty-mascot.png
  // 2) avatar oficial bundelado: public/ai-avatar.png (viaja en el deploy, siempre disponible)
  const candidates = [
    path.join(mediaDir, HOUSE.mascotFile),
    path.join(__dirname, 'public', 'ai-avatar.png'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch (e) {}
  }
  return null;
}
// Posty SIEMPRE igual: la cara no se negocia (Valentino la aprobó así).
const POSTY_LOOK = 'Posty, the cute Pixar-style 3D blue robot: round bright-blue head with darker blue accent patches on the cheeks and sides, big expressive cartoon eyes, small friendly smile, yellow antenna ball on top of the head, yellow round chest button';

function buildImagePrompt(angle, stylePick) {
  const paletteLine = `Use EXACTLY this brand palette, it always wins: primary #2793C8 (bright sky blue), accent #FEC14D (warm yellow), deep navy #0A1E33 for text/backgrounds. Never use other brand colors.`;
  const scene = `Adorable premium 3D render in Pixar style, vertical 4:5 composition, Instagram post quality. Main character (must be identical every time): ${POSTY_LOOK}. Scene: ${angle.visual}.`;
  const frag = stylePick && stylePick.style ? `\n\n${styleFragment(stylePick.style, HOUSE.palette)}` : '';
  return `${scene}\n\n${paletteLine}${frag}`;
}

// ---------------------------------------------------------------------------
// Retry con backoff para OpenAI (2026-10-05): la propuesta del dogfood sale
// SIEMPRE con imagen real; un 429/5xx transitorio no puede degradarla a un
// bloque plano. 3 intentos, backoff 2s/8s. Se reintentan SOLO errores
// transitorios: 429, 5xx, timeout/abort, errores de red. 400/401/403/404 son
// definitivos y NO se reintentan.
function isTransientOpenAIError(e) {
  const s = e && e.status;
  if (s === 429) return true;
  if (Number.isInteger(s) && s >= 500 && s <= 599) return true;
  // Sin status HTTP: la llamada ni llegó (red caída, DNS, abort, timeout).
  if (s == null && e) return true;
  return false;
}

async function openaiFetchWithRetry(url, opts, attempts = 3) {
  const delays = [2000, 8000];
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
      const body = await r.text().catch(() => '');
      const err = new Error(`OpenAI ${r.status}: ${String(body).slice(0, 120)}`);
      err.status = r.status;
      throw err;
    } catch (e) {
      lastErr = e;
      const transient = isTransientOpenAIError(e);
      const more = i < attempts - 1;
      if (!transient || !more) throw e;
      const ms = delays[i] || 8000;
      console.error(`[dogfood] OpenAI falló (intento ${i + 1}/${attempts}): ${e.message} — reintento en ${ms}ms`);
      await new Promise((res) => setTimeout(res, ms));
    }
  }
  throw lastErr;
}

// Observabilidad (2026-10-05): reporter opcional de errores de imagen.
// server.js lo cablea a logGenError en el boot. dogfood.js NUNCA requiere
// server.js (evita require circular).
let dogfoodErrorReporter = null;
function setErrorReporter(fn) {
  dogfoodErrorReporter = (typeof fn === 'function') ? fn : null;
}
function reportDogfoodError(where, err) {
  try { if (dogfoodErrorReporter) dogfoodErrorReporter(where, err); } catch (e) {}
}

async function generateDogfoodImage({ angle, openaiKey, mediaDir, tmpName }) {
  const stylePick = pickStyle({
    intent: angle.intent, theme: angle.theme, rubro: 'servicios',
    businessName: HOUSE.businessName, usedThisWeek: [],
  });
  const prompt = buildImagePrompt(angle, stylePick);
  const mascot = mascotRefPath(mediaDir);

  const generateFn = async () => {
    let r;
    if (mascot) {
      const form = new FormData();
      const buf = fs.readFileSync(mascot);
      const ext = path.extname(mascot).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      form.append('image', new Blob([buf], { type: mime }), 'mascot' + ext);
      form.append('prompt', prompt + ' IMPORTANT: keep the EXACT same character from the reference photo — identical face, same bright blue body, darker blue accent patches, yellow antenna ball, yellow chest button, same Pixar 3D style. The character must be instantly recognizable as the same Posty. Only change the scene, pose and props around it.');
      form.append('size', '1024x1536');
      form.append('quality', IMAGE_QUALITY); // config en costs.js (env IMAGE_QUALITY)
      r = await openaiFetchWithRetry('https://api.openai.com/v1/images/edits', {
        method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: form,
        signal: AbortSignal.timeout(120000),
      });
    } else {
      r = await openaiFetchWithRetry('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1536', quality: IMAGE_QUALITY }), // config en costs.js (env IMAGE_QUALITY)
        signal: AbortSignal.timeout(120000),
      });
    }
    const data = await r.json();
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) throw new Error('OpenAI no devolvió imagen');
    const abs = path.join(mediaDir, tmpName);
    fs.writeFileSync(abs, Buffer.from(b64, 'base64'));
    return '/media/' + path.basename(abs);
  };

  const fb = await fallbackImage({
    generateFn,
    headline: angle.theme,
    bgHex: HOUSE.palette[0],
    textHex: '#FFFFFF',
    business: HOUSE.businessName,
    logoAbs: mascot,
    photoAbs: null,
    outDir: mediaDir,
  });
  return { imagePath: fb.path, source: fb.source, stylePick };
}

// ---------------------------------------------------------------------------
// Generación matinal: 1 posteo (imagen + caption + hashtags) como draft.
// Idempotente: si ya hay un pendiente (de hoy o de ayer sin resolver), no
// genera otro. Nunca tira.
// ---------------------------------------------------------------------------
async function generateDogfoodPost(db, { mediaDir, openaiKey, generateImageStub = null, scheduledFor = '' } = {}) {
  initDogfood(db);
  const ownerId = resolveOwnerUserId(db);
  if (!ownerId) {
    console.log('[dogfood] sin usuario dueño, skip');
    return { ok: false, reason: 'no_owner' };
  }
  try {
    const pending = db.prepare(
      `SELECT id FROM posts WHERE user_id = ? AND kind = 'dogfood' AND status = 'pending_approval' LIMIT 1`
    ).get(ownerId);
    if (pending) {
      console.log(`[dogfood] ya hay propuesta pendiente (#${pending.id}), no se genera otra`);
      return { ok: false, reason: 'already_pending', postId: pending.id };
    }
  } catch (e) {}
  const key = openaiKey || process.env.OPENAI_API_KEY || '';
  if (!key && !generateImageStub) {
    console.log('[dogfood] sin OPENAI_API_KEY: no se genera la propuesta de hoy (configurala en Railway)');
    return { ok: false, reason: 'no_openai_key' };
  }
  const angle = pickAngle(db);
  const { caption, hookId } = buildCaption(angle, ownerId, db);
  const dir = mediaDir || process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}

  let imagePath = null, imageSource = 'failed', stylePick = null;
  try {
    if (generateImageStub) {
      const stubbed = await generateImageStub({ angle });
      imagePath = stubbed.imagePath || null;
      imageSource = stubbed.source || 'stub';
      stylePick = stubbed.stylePick || null;
    } else {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const gen = await generateDogfoodImage({
        angle, openaiKey: key, mediaDir: dir, tmpName: `dogfood-${stamp}.png`,
      });
      imagePath = gen.imagePath; imageSource = gen.source; stylePick = gen.stylePick;
      try { trackUsage({ feature: 'dogfood', userId: ownerId, model: 'gpt-image-1', images: imageSource === 'ai' ? 1 : 0, json: {} }); } catch (e) {}
    }
  } catch (e) {
    console.error('[dogfood] imagen falló:', e.message);
    reportDogfoodError('imagen', e);
    return { ok: false, reason: 'image_failed', error: e.message };
  }
  // REGLA (2026-10-05, Valentino): un bloque plano (brand_card/solid) JAMÁS
  // se presenta como propuesta terminada. El cron corre cada hora y reintenta
  // solo; el stub de tests sigue funcionando igual.
  if (!generateImageStub && imageSource !== 'ai') {
    const msg = 'IA sin imagen real; sin fallback plano para propuestas';
    console.error('[dogfood] imagen falló:', msg, `(source=${imageSource})`);
    reportDogfoodError('imagen', new Error(`${msg} (source=${imageSource})`));
    return { ok: false, reason: 'image_failed', error: msg };
  }
  if (!imagePath) {
    console.error('[dogfood] no se pudo generar imagen por ninguna vía');
    reportDogfoodError('imagen', new Error('no se pudo generar imagen por ninguna vía'));
    return { ok: false, reason: 'image_failed' };
  }
  const styleCode = (stylePick && stylePick.style && stylePick.style.code) || '';
  const styleReason = (stylePick && stylePick.reason) || '';
  let postId = null;
  try {
    const r = db.prepare(
      `INSERT INTO posts (user_id, image_path, caption, hashtags, status, kind, tipo, media_type,
        style_code, style_reason, intent, hook_id, source_angle, scheduled_for, created_at)
       VALUES (?, ?, ?, ?, 'pending_approval', 'dogfood', 'dogfood', 'image', ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(ownerId, imagePath, caption, houseHashtags(), styleCode, styleReason, angle.intent, hookId, angle.id, String(scheduledFor || ''));
    postId = r.lastInsertRowid;
  } catch (e) {
    console.error('[dogfood] no se pudo guardar el draft:', e.message);
    return { ok: false, reason: 'db_failed', error: e.message };
  }
  console.log(`[dogfood] propuesta #${postId} generada (ángulo: ${angle.id}, imagen: ${imageSource})`);
  return { ok: true, postId, angle: angle.id, imageSource };
}

// Descarta propuestas pendientes de días anteriores (scheduled_for < hoy).
// La propuesta de ayer sin resolver no bloquea la de hoy.
function sweepStaleDogfood(db, todayYmd, ownerId) {
  try {
    const stale = db.prepare(
      `SELECT id FROM posts WHERE user_id = ? AND kind = 'dogfood' AND status = 'pending_approval'
       AND scheduled_for != '' AND substr(scheduled_for, 1, 10) < ?`
    ).all(ownerId, todayYmd);
    for (const s of stale) dismissDogfood(db, s.id, { stale: true });
    if (stale.length) console.log(`[dogfood] ${stale.length} propuesta(s) vieja(s) descartada(s)`);
  } catch (e) { console.error('[dogfood] sweep:', e.message); }
}

// Generador del slot diario: lun–vie genera el draft del día con scheduled_for
// = hoy a DOGFOOD_POST_TIME. Sáb/dom: cero ruido. No genera si faltan <30min
// para el slot (no llegaría la imagen) ni si ya hay propuesta para hoy.
// Guard anti-overlap en dogfood_state.generating_since (stale >20min se ignora).
async function generateDogfoodSlot(db, { now = new Date(), mediaDir, openaiKey, generateImageStub = null } = {}) {
  initDogfood(db);
  const tz = dogfoodTz();
  const p = tzParts(tz, now);
  if (p.dow === 0 || p.dow === 6) return { ok: false, reason: 'weekend' };
  const slot = `${p.ymd} ${dogfoodPostTime()}`;
  const nowStr = `${p.ymd} ${p.hm}`;
  if (nowStr > addMinutesStr(slot, -30)) {
    console.log(`[dogfood] muy tarde para generar el slot de hoy (${slot}), skip`);
    return { ok: false, reason: 'too_late', slot };
  }
  const ownerId = resolveOwnerUserId(db);
  if (!ownerId) return { ok: false, reason: 'no_owner' };
  sweepStaleDogfood(db, p.ymd, ownerId);
  try {
    const existing = db.prepare(
      `SELECT id FROM posts WHERE user_id = ? AND kind = 'dogfood' AND scheduled_for LIKE ? LIMIT 1`
    ).get(ownerId, `${p.ymd}%`);
    if (existing) return { ok: false, reason: 'already_scheduled', postId: existing.id };
  } catch (e) {}
  let genSince = '';
  try {
    const st = db.prepare('SELECT generating_since FROM dogfood_state WHERE id = 1').get();
    genSince = (st && st.generating_since) || '';
  } catch (e) {}
  if (genSince) {
    const ageMin = (Date.now() - new Date(genSince).getTime()) / 60000;
    if (Number.isFinite(ageMin) && ageMin < 20) return { ok: false, reason: 'generating' };
  }
  try { db.prepare(`UPDATE dogfood_state SET generating_since = ? WHERE id = 1`).run(new Date().toISOString()); } catch (e) {}
  try {
    const r = await generateDogfoodPost(db, { mediaDir, openaiKey, generateImageStub, scheduledFor: slot });
    if (r.ok) console.log(`[dogfood] slot ${slot} generado (#${r.postId})`);
    return r;
  } finally {
    try { db.prepare(`UPDATE dogfood_state SET generating_since = '' WHERE id = 1`).run(); } catch (e) {}
  }
}

// Ticker (cada minuto): 1) notifica los drafts con scheduled_for <= ahora+1min
// (claim atómico anti-doble-notify, fija notified_at y auto_at = slot+2h);
// 2) auto-publica los notificados cuyo auto_at ya pasó y siguen pendientes.
// publishFn = (db, post) => publishSinglePost(db, post, { house: true }).
async function tickDogfood(db, { now = new Date(), mediaDir, baseUrl, publishFn = null, pushStub = null, emailStub = null } = {}) {
  initDogfood(db);
  const tz = dogfoodTz();
  const p = tzParts(tz, now);
  const nowStr = `${p.ymd} ${p.hm}`;
  const out = { notified: [], autoPublished: [] };
  // 1) Notificación en T-1min.
  const threshold = addMinutesStr(nowStr, 1);
  let due = [];
  try {
    due = db.prepare(
      `SELECT * FROM posts WHERE kind = 'dogfood' AND status = 'pending_approval'
       AND scheduled_for != '' AND notified_at = '' AND scheduled_for <= ?`
    ).all(threshold);
  } catch (e) { console.error('[dogfood] tick notify:', e.message); }
  for (const post of due) {
    let claimed = 0;
    try {
      claimed = db.prepare(
        `UPDATE posts SET notified_at = ?, auto_at = substr(datetime(scheduled_for, '+2 hours'), 1, 16)
         WHERE id = ? AND notified_at = ''`
      ).run(nowStr, post.id).changes || 0;
    } catch (e) { console.error('[dogfood] tick claim:', e.message); }
    if (!claimed) continue; // otro tick ya lo notificó
    const n = await notifyDogfood(db, post, post.user_id, { mediaDir, baseUrl, pushStub, emailStub });
    console.log(`[dogfood] notificado #${post.id} (${(n && n.channel) || 'none'})`);
    out.notified.push({ id: post.id, channel: (n && n.channel) || 'none' });
  }
  // 2) Auto-publicación en T+2h sin respuesta.
  let auto = [];
  try {
    auto = db.prepare(
      `SELECT * FROM posts WHERE kind = 'dogfood' AND status = 'pending_approval'
       AND notified_at != '' AND auto_at != '' AND auto_at <= ?`
    ).all(nowStr);
  } catch (e) { console.error('[dogfood] tick auto:', e.message); }
  for (const post of auto) {
    if (!publishFn) { console.log(`[dogfood] #${post.id} venció sin publishFn, skip`); continue; }
    // FASE 0 — qualityGate también en el auto-publish: si no pasa, no sale
    // solo (fail-closed). Se limpia auto_at para no reintentarlo cada minuto;
    // queda en pending_approval para revisión/aprobación manual.
    let g = null;
    try {
      g = qualityGate(post, db, mediaDir);
      saveQualityResult(db, post.id, g);
    } catch (e) { console.error(`[dogfood] gate #${post.id}:`, e.message); }
    if (!g || !g.pass) {
      const failed = g
        ? Object.entries(g.checks).filter(([, c]) => !c.ok).map(([k, c]) => `${k}(${c.detail})`).join(', ')
        : 'gate_error';
      console.log(`[dogfood] #${post.id} NO pasa gate (score ${g ? g.score : '?'}): ${failed} → queda pendiente para revisión manual`);
      try { db.prepare(`UPDATE posts SET auto_at = '' WHERE id = ? AND kind = 'dogfood'`).run(post.id); } catch (e) {}
      continue;
    }
    const r = await approveDogfood(db, post.id, publishFn, { decision: 'auto' });
    if (r.ok) {
      console.log(`[dogfood] #${post.id} auto-publicado (2h sin respuesta)`);
      out.autoPublished.push(post.id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Push con la foto, 1 minuto antes del horario. Nunca tira. Sin VAPID: log
// claro, el draft queda visible en la app con badge "pendiente".
// ---------------------------------------------------------------------------
function absoluteDogfoodImage(imagePath, db, ownerId) {
  let base = '';
  try {
    const s = db.prepare('SELECT image_base_url FROM settings WHERE user_id = ?').get(ownerId);
    if (s && s.image_base_url) base = String(s.image_base_url);
  } catch (e) {}
  base = base || process.env.IMAGE_BASE_URL || 'https://postyhacetodo.com';
  return `${base.replace(/\/$/, '')}/media/${path.basename(String(imagePath || ''))}`;
}

function dogfoodPushPayload(db, post, ownerId) {
  return {
    title: DOGFOOD_PUSH_TITLE,
    body: `Tu posteo de hoy sale ahora. ${AUTO_RULE_COPY}`,
    url: `/#/app/dogfood/${post.id}`,
    image: absoluteDogfoodImage(post.image_path, db, ownerId),
    data: { dogfoodId: post.id },
  };
}

async function sendDogfoodPush(db, post, ownerId) {
  try {
    if (!post || !ownerId) return { ok: false, reason: 'no_post' };
    const r = await sendPush(ownerId, dogfoodPushPayload(db, post, ownerId));
    if (!r || !r.ok) {
      const reason = (r && r.reason) || 'unknown';
      if (reason === 'no_vapid' || reason === 'no_subs') {
        console.log(`[dogfood] push no enviada (${reason}): ${reason === 'no_vapid'
          ? 'falta VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en Railway'
          : 'el dueño no tiene suscripciones push'}. El draft #${post.id} queda pendiente en la app.`);
      } else {
        console.log(`[dogfood] push no enviada (${reason}), el draft #${post.id} queda pendiente en la app.`);
      }
      return { ok: false, reason };
    }
    console.log(`[dogfood] push enviada al dueño (draft #${post.id})`);
    return { ok: true, sent: r.sent };
  } catch (e) {
    console.error('[dogfood] push falló:', e.message);
    return { ok: false, reason: 'exception' };
  }
}

// ---------------------------------------------------------------------------
// Fallback por email: si el dueño no tiene la app instalada (sin push
// subscription activa), la propuesta de la mañana llega por email con la foto
// y botones de aprobar/descartar firmados (HMAC, un solo uso, 24h).
// ---------------------------------------------------------------------------

function emailSecret() {
  return String(process.env.DOGFOOD_EMAIL_SECRET || process.env.SESSION_SECRET || '').trim();
}

// Token: v1.{postId}.{action}.{expMs}.{nonce}.{sig}
// sig = HMAC_SHA256(secret, "v1.{postId}.{action}.{expMs}.{nonce}")
// En DB se guarda solo el hash (como magic_tokens).
function issueDogfoodToken(db, postId, action, ttlMs) {
  try {
    const secret = emailSecret();
    if (!secret) return null;
    if (action !== 'approve' && action !== 'dismiss') return null;
    const exp = Date.now() + (typeof ttlMs === 'number' ? ttlMs : 24 * 3600 * 1000);
    const nonce = crypto.randomBytes(12).toString('hex');
    const body = `v1.${postId}.${action}.${exp}.${nonce}`;
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const token = `${body}.${sig}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare(
      `INSERT OR REPLACE INTO dogfood_email_tokens (token_hash, post_id, action, expires_at, used)
       VALUES (?, ?, ?, datetime(? / 1000, 'unixepoch'), 0)`
    ).run(tokenHash, postId, action, exp);
    return token;
  } catch (e) {
    console.error('[dogfood] issueDogfoodToken:', e.message);
    return null;
  }
}

function verifyDogfoodToken(db, token) {
  try {
    const secret = emailSecret();
    if (!secret || typeof token !== 'string') return { ok: false, reason: 'invalid' };
    const parts = token.split('.');
    if (parts.length !== 6 || parts[0] !== 'v1') return { ok: false, reason: 'invalid' };
    const [, postIdRaw, action, expRaw, nonce, sig] = parts;
    const postId = Number(postIdRaw);
    const exp = Number(expRaw);
    if (!postId || (action !== 'approve' && action !== 'dismiss') || !exp || !nonce || !sig) {
      return { ok: false, reason: 'invalid' };
    }
    const body = `v1.${postId}.${action}.${exp}.${nonce}`;
    const want = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const a = Buffer.from(sig, 'hex'), b = Buffer.from(want, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };
    if (Date.now() > exp) return { ok: false, reason: 'expired' };
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = db.prepare('SELECT * FROM dogfood_email_tokens WHERE token_hash = ?').get(tokenHash);
    if (!row) return { ok: false, reason: 'invalid' };
    if (row.used) return { ok: false, reason: 'already_used' };
    if (String(row.action) !== action || Number(row.post_id) !== postId) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, postId, action, tokenHash };
  } catch (e) {
    return { ok: false, reason: 'invalid' };
  }
}

// Claim atómico: marca el token como usado. Devuelve true solo la primera vez.
function claimDogfoodToken(db, tokenHash) {
  try {
    const n = db.prepare(
      `UPDATE dogfood_email_tokens SET used = 1, used_at = datetime('now') WHERE token_hash = ? AND used = 0`
    ).run(tokenHash).changes || 0;
    return n === 1;
  } catch (e) { return false; }
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dogfoodEmailHtml({ post, base, publicUrl, approveToken, dismissToken }) {
  const captionParas = escHtml(post.caption).split(/\n{2,}/)
    .map((p) => `<p style="font-size:15px;line-height:1.7;margin:0 0 14px;color:#0A1E33">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const hashtags = post.hashtags
    ? `<p style="font-size:13px;line-height:1.6;margin:0 0 20px;color:#2793C8">${escHtml(post.hashtags)}</p>` : '';
  const approveUrl = `${base}/api/dogfood/email-approve?token=${encodeURIComponent(approveToken)}`;
  const dismissUrl = `${base}/api/dogfood/email-dismiss?token=${encodeURIComponent(dismissToken)}`;
  return emailShell(`
    <p style="font-size:18px;font-weight:800;margin:0 0 10px;color:#0A1E33">¿Lo publico? 📸</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#0A1E33">
      Tu posteo de hoy para <b>${escHtml(HOUSE.igHandle)}</b> sale ahora.<br>
      <b>${escHtml(AUTO_RULE_COPY)}</b>
    </p>
    <div style="margin:0 0 18px">
      <img src="${escHtml(publicUrl)}" alt="Propuesta de posteo de hoy"
        style="width:100%;max-width:480px;border-radius:12px;display:block;border:1px solid #D9E8F2" />
    </div>
    ${captionParas}
    ${hashtags}
    <p style="text-align:center;margin:0 0 10px">
      <a href="${escHtml(approveUrl)}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 28px;border-radius:999px;text-decoration:none">✅ Publicar en ${escHtml(HOUSE.igHandle)}</a>
    </p>
    <p style="text-align:center;margin:0 0 16px">
      <a href="${escHtml(dismissUrl)}" style="display:inline-block;background:#fff;color:#47617A;font-weight:700;font-size:14px;padding:10px 24px;border-radius:999px;text-decoration:none;border:1.5px solid #C9DCEA">⏭️ Saltar (mañana armo otro)</a>
    </p>
    <p style="font-size:12px;line-height:1.6;margin:0 0 14px;color:#7B93A9;text-align:center">
      Estos botones valen por 24 horas y se pueden usar una sola vez.
    </p>
    <p style="font-size:14px;line-height:1.6;margin:0;color:#47617A">
      ¿Preferís la notificación en el celu? <a href="${escHtml(base)}/" style="color:#2793C8;font-weight:700">Instalá la app de Posty</a> y mañana te llega directo al teléfono 📲
    </p>`);
}

// Manda la propuesta por email: foto adjunta + caption + botones firmados.
// Nunca tira. No manda si el draft no tiene imagen en disco (invariante).
async function sendDogfoodEmail(db, post, ownerId, { mediaDir, baseUrl, to, sendEmailStub = null } = {}) {
  try {
    if (!post || !post.image_path) return { ok: false, reason: 'no_image' };
    const dir = mediaDir || process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');
    const abs = path.join(dir, path.basename(String(post.image_path)));
    let stat = null;
    try { stat = fs.statSync(abs); } catch (e) { stat = null; }
    if (!stat || !stat.isFile()) {
      console.error(`[dogfood] email no enviado: la imagen del draft #${post.id} no existe en disco`);
      return { ok: false, reason: 'no_image_file' };
    }
    if (!emailSecret()) {
      console.log('[dogfood] email no enviado: falta DOGFOOD_EMAIL_SECRET (o SESSION_SECRET) para firmar los botones');
      return { ok: false, reason: 'no_secret' };
    }
    if (!emailConfigured() && !sendEmailStub) {
      console.log('[dogfood] email no enviado: falta RESEND_API_KEY en Railway');
      return { ok: false, reason: 'no_resend' };
    }
    const dest = to || ownerEmail(db, ownerId);
    if (!dest) return { ok: false, reason: 'no_email' };
    const base = (baseUrl || process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
    const approveToken = issueDogfoodToken(db, post.id, 'approve');
    const dismissToken = issueDogfoodToken(db, post.id, 'dismiss');
    if (!approveToken || !dismissToken) return { ok: false, reason: 'token_failed' };
    const buf = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const publicUrl = `${base}/media/${path.basename(abs)}`;
    const html = dogfoodEmailHtml({ post, base, publicUrl, approveToken, dismissToken });
    const sender = sendEmailStub || sendEmail;
    const r = await sender({
      to: dest,
      subject: DOGFOOD_EMAIL_SUBJECT,
      html,
      attachments: [{
        filename: `posteo-${post.id}${ext || '.jpg'}`,
        content: buf.toString('base64'),
        contentType: mime,
        contentId: 'posteo-hoy',
      }],
    });
    if (!r || !r.ok) {
      console.log(`[dogfood] email no enviado a ${dest} (${(r && (r.error || r.reason)) || 'unknown'})`);
      return { ok: false, reason: (r && (r.error || r.reason)) || 'send_failed' };
    }
    console.log(`[dogfood] email enviado a ${dest} (draft #${post.id})`);
    return { ok: true, to: dest };
  } catch (e) {
    console.error('[dogfood] email falló:', e.message);
    return { ok: false, reason: 'exception' };
  }
}

function countPushSubs(db, userId) {
  try {
    const r = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId);
    return (r && r.n) || 0;
  } catch (e) { return 0; }
}

function ownerEmail(db, userId) {
  try {
    const r = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    const em = r && String(r.email || '').trim();
    return em || null;
  } catch (e) { return null; }
}

// Decisión del canal matinal:
// 1) push subscription activa → push (comportamiento actual).
// 2) si la push falla o no hay subs → email si hay email del dueño.
// 3) si no hay ninguno → badge en la app (comportamiento actual).
async function notifyDogfood(db, post, ownerId, { mediaDir, baseUrl, pushStub = null, emailStub = null } = {}) {
  if (!post || !ownerId) return { ok: false, channel: 'none', reason: 'no_post' };
  if (countPushSubs(db, ownerId) > 0) {
    const push = pushStub ? await pushStub(db, post, ownerId) : await sendDogfoodPush(db, post, ownerId);
    if (push && push.ok) return { ok: true, channel: 'push', push };
    console.log(`[dogfood] push falló (${(push && push.reason) || 'unknown'}), intento email como respaldo`);
  }
  const email = ownerEmail(db, ownerId);
  let em = null;
  if (email) {
    em = emailStub
      ? await emailStub(db, post, ownerId)
      : await sendDogfoodEmail(db, post, ownerId, { mediaDir, baseUrl, to: email });
  }
  if (em && em.ok) return { ok: true, channel: 'email', email: em };
  if (em && em.reason === 'no_image') return { ok: false, channel: 'none', reason: 'no_image' };
  console.log('[dogfood] sin push ni email: la propuesta queda con badge en la app');
  return { ok: true, channel: 'badge', email: em };
}

// Página de confirmación al tocar los botones del email (sin login: el token es la auth).
function dogfoodEmailResultPage({ title, message, ok }) {
  const color = ok ? '#2793C8' : '#7B93A9';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)} — Posty</title></head>
<body style="margin:0;background:#F2F9FD;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<div style="max-width:480px;margin:40px auto;padding:0 16px">
<div style="background:#2793C8;padding:20px 24px;border-radius:14px 14px 0 0">
<div style="font-size:22px;font-weight:800;color:#fff">posty<span style="color:#FEC14D">.</span></div></div>
<div style="background:#fff;padding:32px 28px;border-radius:0 0 14px 14px;text-align:center">
<div style="font-size:44px;margin-bottom:12px">${ok ? '✅' : '🤔'}</div>
<h1 style="font-size:20px;color:${color};margin:0 0 10px">${escHtml(title)}</h1>
<p style="font-size:15px;line-height:1.6;color:#47617A;margin:0 0 20px">${message}</p>
<a href="/" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:15px;padding:12px 28px;border-radius:999px;text-decoration:none">Abrir Posty</a>
</div></div></body></html>`;
}

// Canje del token del email: verifica firma + expiración + un solo uso,
// y ejecuta la acción (approve publica por el pipeline, dismiss descarta).
// publishFn = (db, post) => publishSinglePost(db, post, { house: true }).
async function redeemDogfoodEmailToken(db, token, expectedAction, publishFn) {
  const v = verifyDogfoodToken(db, token);
  if (!v.ok) {
    const msg = v.reason === 'expired'
      ? 'Este link venció (valen 24 horas). La propuesta de hoy la ves en la app.'
      : v.reason === 'already_used'
        ? 'Este link ya se usó. Si fue recién, ya está procesado 😉'
        : 'Este link no es válido.';
    return { ok: false, reason: v.reason, html: dogfoodEmailResultPage({ title: 'Link no válido', message: msg, ok: false }) };
  }
  if (v.action !== expectedAction) {
    return { ok: false, reason: 'wrong_action', html: dogfoodEmailResultPage({ title: 'Link no válido', message: 'Este link no es válido.', ok: false }) };
  }
  if (!claimDogfoodToken(db, v.tokenHash)) {
    return { ok: false, reason: 'already_used', html: dogfoodEmailResultPage({ title: 'Ya usado', message: 'Este link ya se usó. Si fue recién, ya está procesado 😉', ok: false }) };
  }
  if (v.action === 'approve') {
    const r = await approveDogfood(db, v.postId, publishFn);
    if (r.ok) {
      return { ok: true, postId: v.postId, html: dogfoodEmailResultPage({ title: '¡Publicando! 🚀', message: `Tu posteo de hoy para ${escHtml(HOUSE.igHandle)} se está publicando en Instagram.`, ok: true }) };
    }
    let msg;
    if (r.reason === 'not_pending') {
      let st = '';
      try { st = (db.prepare(`SELECT status FROM posts WHERE id = ?`).get(v.postId) || {}).status || ''; } catch (e) {}
      msg = st === 'published' || st === 'publishing'
        ? '¡Ya salió publicado! 🚀 Llegaste tarde, pero salió igual.'
        : st === 'dismissed'
          ? 'Esta propuesta ya fue descartada antes.'
          : 'Esta propuesta ya fue procesada antes.';
    } else if (r.reason === 'blocked') {
      msg = 'No se pudo publicar automáticamente — revisala en la app.';
    } else {
      msg = 'No se pudo publicar — revisala en la app.';
    }
    return { ok: false, reason: r.reason, html: dogfoodEmailResultPage({ title: 'No se pudo publicar', message: msg, ok: false }) };
  }
  const d = dismissDogfood(db, v.postId);
  if (d.ok) {
    return { ok: true, postId: v.postId, html: dogfoodEmailResultPage({ title: 'Descartado ⏭️', message: 'Listo, mañana te armo otra propuesta.', ok: true }) };
  }
  return { ok: false, reason: d.reason, html: dogfoodEmailResultPage({ title: 'Ya procesada', message: 'Esta propuesta ya fue procesada antes.', ok: false }) };
}

// ---------------------------------------------------------------------------
// Flujo completo de la mañana: genera + notifica (push, email o badge).
// Lo llama el cron.
// ---------------------------------------------------------------------------
async function morningDogfood(db, { mediaDir, baseUrl, generateImageStub = null, pushStub = null, emailStub = null } = {}) {
  try {
    const gen = await generateDogfoodPost(db, { mediaDir, generateImageStub });
    if (!gen.ok) return gen;
    const ownerId = resolveOwnerUserId(db);
    let post = null;
    try {
      post = db.prepare('SELECT * FROM posts WHERE id = ?').get(gen.postId);
    } catch (e) {}
    const notify = await notifyDogfood(db, post || { id: gen.postId }, ownerId, { mediaDir, baseUrl, pushStub, emailStub });
    return { ok: true, postId: gen.postId, angle: gen.angle, notify, push: notify.push || null };
  } catch (e) {
    console.error('[dogfood] morning falló:', e.message);
    return { ok: false, reason: 'exception', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Aprobación en un tap: publica por el pipeline existente.
// publishFn = (db, post) => publishSinglePost(db, post, { house: true }).
// Tras publicar, registra el estilo en el learning loop (la house account
// también aprende).
// ---------------------------------------------------------------------------
async function approveDogfood(db, postId, publishFn, { decision = 'approved' } = {}) {
  const dec = decision === 'auto' ? 'auto' : 'approved';
  let post = null;
  try {
    post = db.prepare(`SELECT * FROM posts WHERE id = ? AND kind = 'dogfood'`).get(postId);
  } catch (e) {}
  if (!post) return { ok: false, reason: 'not_found' };
  if (post.status !== 'pending_approval') return { ok: false, reason: 'not_pending', status: post.status };
  // Claim atómico: doble tap (o dos workers) no publica dos veces.
  let claimed = 0;
  try {
    claimed = db.prepare(
      `UPDATE posts SET status = 'publishing', approval = 'approved', decision = ? WHERE id = ? AND kind = 'dogfood' AND status = 'pending_approval'`
    ).run(dec, postId).changes || 0;
  } catch (e) {}
  if (!claimed) return { ok: false, reason: 'not_pending', status: post.status };
  let pub = null;
  try {
    const fresh = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    pub = await publishFn(db, fresh);
  } catch (e) {
    console.error('[dogfood] publish falló:', e.message);
    try { db.prepare(`UPDATE posts SET status = 'pending_approval' WHERE id = ?`).run(postId); } catch (e2) {}
    return { ok: false, reason: 'publish_failed', error: e.message };
  }
  // Si publishSinglePost bloqueó (trial vencido / sin imagen), ya dejó el
  // post en 'paused' con mensaje claro: no se pisa.
  if (pub && pub.blocked) return { ok: false, reason: 'blocked', blocked: pub.blocked };
  // La house account también aprende: registra el estilo/hook en el loop,
  // con la decisión (manual, auto o dismiss) para saber qué se aprueba solo.
  try {
    if (post.style_code) {
      recordPerformance(db, {
        userId: post.user_id, styleCode: post.style_code,
        intent: post.intent || '', hookId: post.hook_id || `dogfood:${postId}`,
        metrics: {}, decision: dec,
      });
    }
  } catch (e) { console.error('[dogfood] learning:', e.message); }
  console.log(`[dogfood] propuesta #${postId} publicada (decision: ${dec})`);
  return { ok: true, postId, decision: dec };
}

function dismissDogfood(db, postId, { stale = false } = {}) {
  let post = null;
  try {
    post = db.prepare(`SELECT * FROM posts WHERE id = ? AND kind = 'dogfood'`).get(postId);
  } catch (e) {}
  if (!post) return { ok: false, reason: 'not_found' };
  if (post.status !== 'pending_approval') return { ok: false, reason: 'not_pending', status: post.status };
  // No se regenera en el momento: 1 propuesta/día, cero ansiedad. Mañana otra.
  try { db.prepare(`UPDATE posts SET status = 'dismissed', decision = 'dismissed' WHERE id = ?`).run(postId); } catch (e) {
    return { ok: false, reason: 'db_failed' };
  }
  // Señal de aprendizaje: esto NO funcionó (el dueño lo saltó o venció).
  try {
    if (post.style_code) {
      recordPerformance(db, {
        userId: post.user_id, styleCode: post.style_code,
        intent: post.intent || '', hookId: post.hook_id || `dogfood:${postId}`,
        metrics: {}, decision: 'dismissed',
      });
    }
  } catch (e) { console.error('[dogfood] learning:', e.message); }
  console.log(`[dogfood] propuesta #${postId} descartada${stale ? ' (stale)' : ''} (mañana se genera otra)`);
  return { ok: true, postId };
}

function getPendingDogfood(db, userId) {
  try {
    return db.prepare(
      `SELECT * FROM posts WHERE user_id = ? AND kind = 'dogfood' AND status = 'pending_approval' ORDER BY id DESC LIMIT 1`
    ).get(userId) || null;
  } catch (e) { return null; }
}

module.exports = {
  HOUSE,
  ANGLES,
  HOUSE_HASHTAG_BLOCKS,
  HOUSE_CTA_VARIANTS,
  houseHashtags,
  houseCta,
  AUTO_RULE_COPY,
  DOGFOOD_PUSH_TITLE,
  DOGFOOD_EMAIL_SUBJECT,
  dogfoodTz,
  dogfoodPostTime,
  tzParts,
  addMinutesStr,
  initDogfood,
  resolveOwnerUserId,
  pickAngle,
  buildCaption,
  stripAsterisks,
  generateDogfoodPost,
  generateDogfoodSlot,
  tickDogfood,
  sweepStaleDogfood,
  setErrorReporter,
  dogfoodPushPayload,
  sendDogfoodPush,
  sendDogfoodEmail,
  notifyDogfood,
  countPushSubs,
  ownerEmail,
  issueDogfoodToken,
  verifyDogfoodToken,
  claimDogfoodToken,
  redeemDogfoodEmailToken,
  morningDogfood,
  approveDogfood,
  dismissDogfood,
  getPendingDogfood,
};
