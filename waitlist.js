'use strict';
/* ---------- CUENTA REGRESIVA CORTADA (decisión Valentino 26/10, «dale! armalo asi») ----------
 * REEMPLAZA la cuenta regresiva 1/12–31/1 del mismo día: esa spec (mock navy +
 * brote, tramo diciembre) queda SUPERSEDED y no se resucita.
 * Reglas vigentes, exactas:
 *  - Sin tramo 1/12–28/1: la web queda como está hasta el 29/1, SIN switch del 1/12.
 *  - 29–31/1/2027 SOLO lista de espera, sobre el diseño de la página de prueba
 *    (misma lengua visual, sin arrancar de cero), sin timer, sin número de
 *    posición, sin botón de prueba, sin cara de Posty.
 *  - Textos: «Posty abre el 1 de febrero» + «Sumate a la lista fundadora y
 *    quedate con el precio fundador congelado.» (sin monto) + email + botón.
 *  - El 31/1 agrega «Mañana se abre.». Espejo EN con los textos equivalentes.
 *  - 1/2/2027 apertura total (web normal + prueba + app).
 *  - La lista de espera existe como registro, sin revelar posición ni
 *    urgencia inventada.
 * Alcance del gate: SOLO visitantes sin sesión. Los clientes con sesión
 * siguen usando la app normal durante la ventana (su semana no se frena).
 * PENDIENTES DE VALENTINO (no inventados): la hora exacta de apertura del
 * 1/2 y el destino de los emails. Los emails solo se GUARDAN en la tabla
 * waitlist (registro durable); no se envía nada a ningún destino.
 * Zona de la ventana: días calendario de Argentina (America/Argentina/
 * Buenos_Aires, UTC-3 sin horario de verano). La ventana abre el 29/1 a las
 * 00:00 ART y cierra el 1/2 a las 00:00 ART.
 * Módulo sin dependencias externas (solo fs/path de Node) para poder
 * testear la ventana con fechas fijas sin bootear el servidor.
 */
const fs = require('fs');
const path = require('path');

const WAITLIST_TZ = 'America/Argentina/Buenos_Aires';
const WAITLIST_START_KEY = 20270129; // 29/1/2027
const WAITLIST_END_KEY = 20270131; // 31/1/2027
const WAITLIST_LAST_DAY_KEY = 20270131; // 31/1/2027: «Mañana se abre.»

// Mismo patrón que ideas-email.js (captura simple de email).
const WAITLIST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function artDayKey(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WAITLIST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  let y = 0, m = 0, day = 0;
  for (const p of parts) {
    if (p.type === 'year') y = Number(p.value);
    if (p.type === 'month') m = Number(p.value);
    if (p.type === 'day') day = Number(p.value);
  }
  return y * 10000 + m * 100 + day;
}

function waitlistPhaseOf(d) {
  const key = artDayKey(d);
  return (key >= WAITLIST_START_KEY && key <= WAITLIST_END_KEY) ? 'waitlist' : 'normal';
}

function isWaitlistWindow(d) {
  return waitlistPhaseOf(d) === 'waitlist';
}

function isWaitlistLastDay(d) {
  return artDayKey(d) === WAITLIST_LAST_DAY_KEY;
}

function isWaitlistEmail(v) {
  return WAITLIST_EMAIL_RE.test(String(v || '').trim());
}

// Rutas que durante la ventana muestran SOLO la lista de espera al
// visitante sin sesión. Incluye las variantes .html directas (si no, un
// visitante podría esquivar la ventana pidiendo /index.html o /prueba.html).
const WAITLIST_GATE_PATHS = {
  '/': 'es',
  '/index.html': 'es',
  '/prueba': 'es',
  '/prueba.html': 'es',
  '/lista-espera.html': 'es',
  '/en': 'en',
  '/en/': 'en',
  '/en/index.html': 'en',
  '/en/prueba': 'en',
  '/en-prueba.html': 'en',
  '/en-lista-espera.html': 'en',
};

function renderWaitlistPage(lang, isLastDay) {
  const file = lang === 'en' ? 'en-lista-espera.html' : 'lista-espera.html';
  let html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
  const line = !isLastDay ? ''
    : (lang === 'en' ? '<p class="manana">Opens tomorrow.</p>' : '<p class="manana">Mañana se abre.</p>');
  return html.replace('<!--WAITLIST_MANANA-->', line);
}

// nowFn inyectable: en producción es () => new Date(); en tests permite
// fijar la fecha y verificar la ventana sin viajar en el tiempo.
function createWaitlistGate(opts) {
  const nowFn = (opts && opts.nowFn) || (() => new Date());
  return function waitlistGate(req, res, next) {
    try {
      if (req.method !== 'GET') return next();
      const lang = WAITLIST_GATE_PATHS[req.path];
      if (!lang) return next();
      const now = nowFn();
      if (!isWaitlistWindow(now)) return next();
      if (req.session && req.session.userId) return next();
      const html = renderWaitlistPage(lang, isWaitlistLastDay(now));
      res.setHeader('Cache-Control', 'no-cache');
      res.send(html);
    } catch (e) {
      // Fail-open: si algo falla leyendo la página, la web normal sigue.
      // Nunca un 500 al visitante por la ventana.
      return next();
    }
  };
}

function registerWaitlistRoutes(app, db) {
  // Captura de la lista de espera: registro durable, sin envío a ningún
  // destino (el destino queda pendiente de Valentino). Duplicado = ok con
  // already:true, sin revelar posición ni conteo.
  app.post('/api/waitlist', (req, res) => {
    try {
      const email = String((req.body && req.body.email) || '').trim().toLowerCase();
      const lang = (req.body && req.body.lang === 'en') ? 'en' : 'es';
      if (!isWaitlistEmail(email)) {
        return res.status(400).json({ ok: false, error: 'email_invalido' });
      }
      const r = db.prepare(
        'INSERT OR IGNORE INTO waitlist (email, lang, source) VALUES (?, ?, ?)'
      ).run(email, lang, 'lista-espera');
      return res.json({ ok: true, already: r.changes === 0 });
    } catch (e) {
      console.error('[waitlist] alta fallida:', e.message);
      return res.status(500).json({ ok: false, error: 'waitlist_unavailable' });
    }
  });

  // Rutas directas de la lista: en ventana sirven la página (con la línea
  // del 31/1 inyectada); fuera de ventana redirigen a la home normal.
  app.get('/lista-espera', (req, res) => {
    const now = new Date();
    if (!isWaitlistWindow(now)) return res.redirect('/');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(renderWaitlistPage('es', isWaitlistLastDay(now)));
  });
  app.get('/en/lista-espera', (req, res) => {
    const now = new Date();
    if (!isWaitlistWindow(now)) return res.redirect('/en/');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(renderWaitlistPage('en', isWaitlistLastDay(now)));
  });
}

module.exports = {
  WAITLIST_TZ,
  artDayKey,
  waitlistPhaseOf,
  isWaitlistWindow,
  isWaitlistLastDay,
  isWaitlistEmail,
  WAITLIST_GATE_PATHS,
  renderWaitlistPage,
  createWaitlistGate,
  registerWaitlistRoutes,
};
