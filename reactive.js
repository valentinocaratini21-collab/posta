// reactive.js — Contenido reactivo: Posty mira el mundo real y reacciona.
//
// Triggers que generan un BORRADOR (nunca se publica solo):
//   - Clima (Open-Meteo, sin key): lluvia, frío, calor, tormenta.
//   - Feriados argentinos (date.nager.at, sin key, best-effort).
// Reglas por rubro (14): si ningún trigger aplica → no genera nada
// (cero relleno). Máx 1 posteo reactivo/día por usuario. Opt-in en ajustes
// (settings.reactive_enabled, default ON). Al crear el borrador se avisa en
// el chat: "Posty vio que llueve y te armó esto 👇".
//
// El borrador entra al flujo normal: hook (hooks.js), estilo (image-styles.js)
// e imagen por el invariante (ensurePostImage). Las dependencias de red y de
// generación se inyectan (tests) o se resuelven con lazy-require (prod).
//
// Exporta: { fetchWeather, geocodeCity, getUserLocation, isHolidayAR,
//   evaluateTriggers, buildReactiveCaption, maybeCreateReactiveDraft,
//   checkReactive, REACTIVE_RULES }
'use strict';

const { pickHook, renderHook } = require('./hooks');

const GEO_TIMEOUT_MS = 12000;
const MAX_REACTIVE_PER_DAY = 1;

// ---------------------------------------------------------------------------
// Clima y geocodificación (Open-Meteo: gratis, sin key)
// ---------------------------------------------------------------------------
async function fetchWeather(lat, lon, fetchFn) {
  const f = fetchFn || fetch;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,precipitation,weathercode&timezone=auto`;
  const res = await f(url, { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) });
  if (!res.ok) throw new Error('clima_' + res.status);
  const data = await res.json();
  const cur = (data && data.current) || {};
  return {
    temp: Number(cur.temperature_2m),
    precip: Number(cur.precipitation || 0),
    weathercode: Number(cur.weathercode),
  };
}

async function geocodeCity(name, fetchFn) {
  const q = String(name || '').trim();
  if (!q) return null;
  const f = fetchFn || fetch;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=es&format=json`;
  const res = await f(url, { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) });
  if (!res.ok) return null;
  const data = await res.json();
  const r = (data && data.results && data.results[0]) || null;
  if (!r) return null;
  return { lat: Number(r.latitude), lon: Number(r.longitude), label: String(r.name || q) };
}

// Ubicación del negocio: cacheada en settings (reactive_lat/lon/label).
// getLocText(uid) → string ("Palermo, Buenos Aires") — inyectado por el padre.
function getUserLocation(db, uid, deps) {
  const d = deps || {};
  try {
    const s = db.prepare(
      'SELECT reactive_lat, reactive_lon, reactive_label FROM settings WHERE user_id = ?').get(uid);
    if (s && s.reactive_lat && s.reactive_lon) {
      return Promise.resolve({ lat: Number(s.reactive_lat), lon: Number(s.reactive_lon), label: String(s.reactive_label || '') });
    }
  } catch (e) { /* columna puede no existir aún: se sigue */ }
  const locText = d.getLocText ? d.getLocText(uid) : '';
  if (!locText) return Promise.resolve(null);
  return geocodeCity(locText, d.fetchFn).then(g => {
    if (!g) return null;
    try {
      db.prepare(`UPDATE settings SET reactive_lat = ?, reactive_lon = ?, reactive_label = ? WHERE user_id = ?`)
        .run(g.lat, g.lon, g.label, uid);
    } catch (e) { /* no bloquea */ }
    return g;
  });
}

// ---------------------------------------------------------------------------
// Feriados argentinos (date.nager.at, sin key, best-effort con caché)
// ---------------------------------------------------------------------------
const _holidayCache = {};
async function isHolidayAR(ymd, fetchFn) {
  const year = String(ymd || '').slice(0, 4);
  if (!/^\d{4}$/.test(year)) return null;
  if (!_holidayCache[year]) {
    try {
      const f = fetchFn || fetch;
      const res = await f(`https://date.nager.at/api/v3/publicholidays/${year}/AR`,
        { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) });
      if (!res.ok) { _holidayCache[year] = []; }
      else {
        const data = await res.json();
        _holidayCache[year] = (Array.isArray(data) ? data : [])
          .map(h => ({ date: String(h.date || ''), name: String(h.localName || h.name || '') }));
      }
    } catch (e) { _holidayCache[year] = []; }
  }
  return (_holidayCache[year] || []).find(h => h.date === ymd) || null;
}

// ---------------------------------------------------------------------------
// Reglas: (rubro × clima/fecha) → trigger. Orden = prioridad.
// weathercode WMO: 0-1 despejado · 2-3 nublado · 45/48 niebla · 51-67 llovizna/lluvia
//   71-77 nieve · 80-82 chaparrones · 95-99 tormenta.
// ---------------------------------------------------------------------------
const REACTIVE_RULES = [
  { id: 'storm-any', rubros: ['*'], when: w => w.weathercode >= 95, kind: 'weather',
    headline: 'Cuidate hoy', body: 'Hoy se viene tormenta fuerte: cuidate y cuidá a los tuyos. Mañana te esperamos como siempre.', intent: 'social', notify: '⛈️ Se viene tormenta fuerte: Posty te armó un posteo para cuidar a tu gente 👇' },
  { id: 'rain-gastro', rubros: ['gastronomia'], when: w => w.weathercode >= 51 && w.weathercode <= 82, kind: 'weather',
    headline: 'Día de delivery', body: 'Llueve y da fiaca salir: pedilo y te lo llevamos calentito a tu puerta.', intent: 'promo', notify: '🌧️ Posty vio que llueve y te armó un posteo de delivery 👇' },
  { id: 'rain-bar', rubros: ['bar'], when: w => w.weathercode >= 51 && w.weathercode <= 82, kind: 'weather',
    headline: 'Plan refugio', body: 'Afuera llueve, adentro se brinda: esta noche el plan es acá.', intent: 'evento', notify: '🌧️ Llueve: Posty te armó el posteo "plan refugio" 👇' },
  { id: 'rain-fitness', rubros: ['fitness'], when: w => w.weathercode >= 51 && w.weathercode <= 82, kind: 'weather',
    headline: 'La lluvia no frena', body: 'Afuera llueve, acá se entrena: vení que el clima no es excusa.', intent: 'social', notify: '🌧️ Llueve: Posty te armó un posteo motivador 👇' },
  { id: 'rain-hogar', rubros: ['hogar', 'deco'], when: w => w.weathercode >= 51 && w.weathercode <= 82, kind: 'weather',
    headline: 'Día de hogar', body: 'Día de lluvia = día de casa: mirá cómo dejarla más linda.', intent: 'producto', notify: '🌧️ Día de lluvia: Posty te armó un posteo "día de hogar" 👇' },
  { id: 'rain-belleza', rubros: ['belleza'], when: w => w.weathercode >= 51 && w.weathercode <= 82, kind: 'weather',
    headline: 'El plan perfecto', body: 'Día de lluvia, plan perfecto: un rato para vos. Reservá tu turno.', intent: 'promo', notify: '🌧️ Llueve: Posty te armó un posteo de autocuidado 👇' },
  { id: 'cold-gastro', rubros: ['gastronomia', 'cafeteria'], when: w => w.temp <= 10, kind: 'weather',
    headline: 'Para el frío', body: 'Con este frío, algo calentito: vení por el tuyo.', intent: 'producto', notify: '🥶 Hace frío: Posty te armó un posteo "algo calentito" 👇' },
  { id: 'cold-moda', rubros: ['moda'], when: w => w.temp <= 12, kind: 'weather',
    headline: 'Llegó el frío', body: 'Bajó la temperatura y subió la onda: abrigos que te van a encantar.', intent: 'lanzamiento', notify: '🥶 Hace frío: Posty te armó un posteo de abrigos 👇' },
  { id: 'hot-gastro', rubros: ['gastronomia', 'cafeteria', 'bar'], when: w => w.temp >= 32, kind: 'weather',
    headline: 'Para el calor', body: 'Con este calor, algo bien fresquito: pasá a buscar el tuyo.', intent: 'producto', notify: '🥵 Hace calor: Posty te armó un posteo fresquito 👇' },
  { id: 'hot-moda', rubros: ['moda'], when: w => w.temp >= 30, kind: 'weather',
    headline: 'Onda verano', body: 'Calor = liviano y fresco: la selección de verano ya está acá.', intent: 'lanzamiento', notify: '🥵 Hace calor: Posty te armó un posteo de verano 👇' },
  { id: 'hot-mascotas', rubros: ['mascotas'], when: w => w.temp >= 35, kind: 'weather',
    headline: 'Cuidalos del calor', body: 'Con este calor, ellos también la pasan mal: agua fresca y sombra siempre.', intent: 'tips', notify: '🥵 Calor extremo: Posty te armó un posteo para cuidar mascotas 👇' },
  { id: 'hot-bar', rubros: ['bar'], when: w => w.temp >= 30, kind: 'weather',
    headline: 'Terraceo', body: 'Noche de calor, trago bien frío: la terraza te espera.', intent: 'evento', notify: '🥵 Noche de calor: Posty te armó el posteo de terraza 👇' },
  { id: 'sun-turismo', rubros: ['turismo'], when: (w, ctx) => w.weathercode <= 1 && ctx.isWeekend, kind: 'weather',
    headline: 'Día perfecto', body: 'Sol y finde: la escapada que venías posponiendo es hoy.', intent: 'promo', notify: '☀️ Día perfecto: Posty te armó un posteo de escapada 👇' },
  { id: 'holiday-any', rubros: ['*'], when: (w, ctx) => !!ctx.holiday, kind: 'holiday',
    headline: 'Feriado', body: 'Es feriado y estamos: pasá en horario especial.', intent: 'social', notify: '📅 Es feriado: Posty te armó un posteo 👇' },
];

function rubroMatch(rule, rubro) {
  const r = String(rubro || '').toLowerCase();
  return rule.rubros.includes('*') || rule.rubros.includes(r);
}

// evaluateTriggers({ weather, rubro, holiday, isWeekend }) → rule | null
function evaluateTriggers({ weather, rubro, holiday, isWeekend }) {
  if (!weather || Number.isNaN(Number(weather.temp))) return null;
  const ctx = { holiday: holiday || null, isWeekend: !!isWeekend };
  for (const rule of REACTIVE_RULES) {
    if (!rubroMatch(rule, rubro)) continue;
    try { if (rule.when(weather, ctx)) return rule; } catch (e) { /* regla rota: se sigue */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Caption del borrador reactivo (determinista + hook del motor).
// ---------------------------------------------------------------------------
function buildReactiveCaption(rule, { business, tema }) {
  const hook = pickHook({ intent: rule.intent });
  const hookText = renderHook(hook, { tema: tema || rule.headline, negocio: business || '' });
  const body = `${rule.headline}.\n\n${rule.body}`;
  return { caption: hookText ? `${hookText}\n\n${body}` : body, hookId: hook.id, intent: rule.intent };
}

// ---------------------------------------------------------------------------
// maybeCreateReactiveDraft(db, uid, deps) → { created, postId?, rule? } | { skipped }
// deps: { getRubro(uid), getBusiness(uid), getBrand(uid), getLocText(uid),
//         fetchFn, nowFn, generateImage({headline, intent, rubro}) → Promise<mediaPath|null>,
//         mediaDir }
// ---------------------------------------------------------------------------
async function maybeCreateReactiveDraft(db, uid, deps) {
  const d = deps || {};
  const nowFn = d.nowFn || (() => new Date());
  const today = nowFn().toISOString().slice(0, 10);
  try {
    const n = db.prepare(
      `SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND tipo = 'reactive' AND date(created_at) = date(?)`
    ).get(uid, today).n || 0;
    if (n >= MAX_REACTIVE_PER_DAY) return { skipped: 'max_day' };
  } catch (e) { return { skipped: 'db' }; }

  const rubro = d.getRubro ? d.getRubro(uid) : '';
  const loc = await getUserLocation(db, uid, d);
  if (!loc) return { skipped: 'no_location' };
  let weather;
  try { weather = await fetchWeather(loc.lat, loc.lon, d.fetchFn); }
  catch (e) { return { skipped: 'no_weather' }; }
  const holiday = await isHolidayAR(today, d.fetchFn);
  const dow = nowFn().getDay();
  const rule = evaluateTriggers({ weather, rubro, holiday, isWeekend: dow === 0 || dow === 6 });
  if (!rule) return { skipped: 'no_trigger' }; // cero relleno

  const business = d.getBusiness ? d.getBusiness(uid) : '';
  const { caption, hookId, intent } = buildReactiveCaption(rule, { business, tema: rule.headline });
  let postId = null;
  try {
    const r = db.prepare(
      `INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, hook_id, intent)
       VALUES (?,?,?,'','draft','image','reactive',?,?)`
    ).run(uid, '', caption, hookId, intent);
    postId = Number(r.lastInsertRowid);
  } catch (e) { return { skipped: 'db_insert' }; }

  // Imagen por el invariante: generador inyectado → fallback a tarjeta/sólido.
  try {
    const gen = d.generateImage || null;
    const brand = d.getBrand ? (d.getBrand(uid) || {}) : {};
    const { ensurePostImage } = require('./image-fallback');
    const fb = await ensurePostImage({
      db, postId, uid,
      generateFn: gen ? () => gen({ uid, headline: rule.headline, intent, rubro }) : null,
      headline: rule.headline, bgHex: brand.bgHex, textHex: brand.textHex,
      business, logoAbs: brand.logoAbs || null, photoAbs: null,
      mediaDir: d.mediaDir, _forceFail: d._forceFail || null,
    });
    if (!fb.path) return { created: true, postId, rule: rule.id, image: 'failed' };
  } catch (e) {
    return { created: true, postId, rule: rule.id, image: 'error' };
  }

  // Aviso en el chat (una sola vez, al crear).
  try {
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)')
      .run(uid, 'assistant', `${rule.notify || 'Posty te armó un posteo según el día 👇'}\nLo dejé en borradores para que lo revises.`);
  } catch (e) { /* no bloquea */ }
  return { created: true, postId, rule: rule.id, image: 'ok' };
}

// ---------------------------------------------------------------------------
// checkReactive(db, deps) — entrada del scheduler (1 vez/día, mañana).
// Solo usuarios opt-in (reactive_enabled != 0) con IG conectado.
// ---------------------------------------------------------------------------
async function checkReactive(db, deps) {
  const out = { users: 0, created: 0, skipped: 0, errors: [] };
  let users = [];
  try {
    users = db.prepare(
      `SELECT u.id FROM users u JOIN settings s ON s.user_id = u.id
       WHERE (s.reactive_enabled IS NULL OR s.reactive_enabled != 0)
         AND s.ig_user_id IS NOT NULL AND s.ig_user_id != ''
       LIMIT 50`).all();
  } catch (e) { out.errors.push('users: ' + e.message); return out; }
  for (const u of users) {
    try {
      out.users++;
      const r = await maybeCreateReactiveDraft(db, u.id, deps);
      if (r.created) out.created++; else out.skipped++;
    } catch (e) {
      out.errors.push(`uid ${u.id}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 800)); // cortesía con Open-Meteo
  }
  return out;
}

module.exports = {
  fetchWeather, geocodeCity, getUserLocation, isHolidayAR,
  evaluateTriggers, buildReactiveCaption, maybeCreateReactiveDraft,
  checkReactive, REACTIVE_RULES, MAX_REACTIVE_PER_DAY,
};
