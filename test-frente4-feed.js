// test-frente4-feed.js — Tanda 4 del feed (v362).
// Ítem 1: bandeja de historias de la semana (solo historias reales
//         publicadas/programadas de ESTA semana; sin historias no hay
//         bandeja) + visor 9:16 cableado.
// Ítem 2: MOVER — resolución declarada: modo «Mover» desde la hoja de
//         acciones (sin tocar gestos vivos); intercambio SOLO entre
//         futuros programados, por el MISMO camino que Reprogramar
//         (hfReschedQuotaOk en ambos sentidos + PATCH + planLimitModal).
// Ítem 3: vistas en reels publicados = OSCURO declarado: se fija acá
//         que NO existe fuente real (post_metrics sin columna de
//         vistas; la ingesta pliega plays en reach; el parser de la
//         lectura no extrae reproducciones) y que la tile no pinta
//         ningún conteo de vistas.
// Ítem 4: el porqué de la grilla nace de la composición real (orden
//         final + tipo persistido + formato); sin patrón verdadero,
//         no hay línea.
// Uso: node test-frente4-feed.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const IDX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const INS = fs.readFileSync(path.join(__dirname, 'insights.js'), 'utf8');
const DB = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

// ---------- Parte 1: bloque HOME_FEED extraído (puro) ----------
console.log('— frente4: HOME_FEED extraído (historias + porqué)');
const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
ok(a > 0 && b > a, 'bloque HOME_FEED delimitado');
const TZ = 'America/Argentina/Buenos_Aires';
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const mondayOf = (ymd) => {
  const d = new Date(ymd + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
};
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mkSandbox = (lang) => {
  const sb = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (p) => p,
    pcTz: () => TZ,
    pcParseDate: (s0) => {
      const s = String(s0 || '');
      if (!s) return null;
      let x = s.replace(' ', 'T');
      if (s.length !== 16 && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z';
      const d = new Date(x);
      return isNaN(d) ? null : d;
    },
    schedTodayYmd: () => dayKey(new Date()),
    schedMondayOf: mondayOf,
    schedAddDays: addDays,
    schedDayKeyOf: (d) => dayKey(d),
    schedYmdToDate: (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null; },
    ME: lang ? { lang } : undefined,
  };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b), sb);
  return sb;
};
const es = mkSandbox(null);
const en = mkSandbox('en');
ok(typeof es.hfStoriesOfWeek === 'function' && typeof es.homeStoriesTrayHTML === 'function' && typeof es.hfGridWhyLine === 'function', 'hfStoriesOfWeek + homeStoriesTrayHTML + hfGridWhyLine cargan en el bloque puro');

// — Ítem 1: historias de la semana —
const today = dayKey(new Date());
const mon = mondayOf(today), sun = addDays(mon, 6), nextMon = addDays(mon, 7), prevSun = addDays(mon, -1);
const at = (ymd, h) => `${ymd}T${String(h).padStart(2, '0')}:00:00.000Z`;
const ST = (id, status, ymd, extra) => Object.assign({ id, status, media_type: 'story', image_path: '/media/s' + id + '.jpg', scheduled_at: at(ymd, 22) }, extra || {});
const storiesIn = [
  ST(3, 'scheduled', sun),                                        // domingo: entra
  ST(1, 'published', mon, { published_at: at(mon, 15) }),          // lunes publicada: entra
  ST(2, 'scheduled', today),                                       // hoy programada: entra
  ST(4, 'scheduled', nextMon),                                     // semana que viene: NO
  ST(5, 'draft', today),                                           // borrador: NO (no está programada ni publicada)
  ST(6, 'published', prevSun, { published_at: at(prevSun, 15) }),  // semana pasada: NO
  { id: 7, status: 'scheduled', media_type: 'image', image_path: '/media/p7.jpg', scheduled_at: at(today, 22) }, // no es historia: NO
  ST(8, 'scheduled', today, { image_path: '/media/s8.mp4' }),      // historia en video: entra, isVideo
];
const wk = es.hfStoriesOfWeek(storiesIn, TZ);
ok(wk.length === 4, `solo las historias publicadas/programadas de ESTA semana (vinieron ${wk.length}, esperadas 4)`);
ok(wk.map((s) => s.id).join(',') === '1,2,8,3', 'orden cronológico por día/hora real');
const s1 = wk.find((s) => s.id === 1);
ok(!!s1 && s1.past === (mon < today), 'publicada un día anterior = vencida (aro gris); publicada hoy = viva');
const s2 = wk.find((s) => s.id === 2);
ok(!!s2 && s2.past === false, 'programada de hoy = aro degradé (por salir)');
ok(wk.find((s) => s.id === 8).isVideo === true, 'historia .mp4 detectada como video');
ok(es.hfStoriesOfWeek([], TZ).length === 0 && es.hfStoriesOfWeek(null, TZ).length === 0, 'sin posteos: sin historias (fail-closed)');
ok(es.hfStoriesOfWeek([ST(9, 'scheduled', today, { image_path: '' })], TZ).length === 0, 'historia sin pieza: no entra (nada que mostrar)');
const tray0 = es.homeStoriesTrayHTML([], { en: false });
ok(tray0 === '', 'sin historias NO hay bandeja (nunca relleno)');
const tray = es.homeStoriesTrayHTML(wk, { en: false });
ok(tray.includes('hf-stories') && count(tray, 'hf-story-ring') === 4, 'bandeja con un círculo por historia');
ok(tray.includes('hf-story-ring past') === (mon < today), 'el aro gris va solo en la vencida');
ok(tray.includes('data-sidx="0"') && tray.includes('data-sidx="3"'), 'los círculos llevan su índice para el visor');
const trayEn = en.homeStoriesTrayHTML(en.hfStoriesOfWeek(storiesIn, TZ), { en: true });
ok(trayEn.includes('Stories this week'), 'bandeja EN: aria en inglés');

// — Ítem 4: el porqué de la grilla —
const T = (status, media_type, tipo) => ({ kind: 'post', post: { status, media_type, tipo: tipo || '' } });
const altTiles = [T('scheduled', 'image', 'novedad'), T('draft', 'image', 'detras'), T('scheduled', 'carousel', 'promo'), T('scheduled', 'image', 'social')];
ok(es.hfGridWhyLine(altTiles, { en: false }) === '💡 Esta semana alternamos producto y personas: así crecen las cuentas de tu rubro.', 'alternancia real producto/personas → su línea (ES)');
ok(en.hfGridWhyLine(altTiles, { en: true }).startsWith('💡 This week we alternate product and people'), 'alternancia real → línea EN');
const mixTiles = [T('scheduled', 'video'), T('draft', 'image'), T('scheduled', 'image')];
ok(es.hfGridWhyLine(mixTiles, { en: false }).includes('combinamos reels y posteos'), 'mezcla real de formatos (1 reel + 2 posteos) → línea de mezcla');
const varTiles = [T('scheduled', 'image', 'promo'), T('draft', 'image', 'tip'), T('scheduled', 'image', 'social')];
const varLine = es.hfGridWhyLine(varTiles, { en: false });
ok(varLine.includes('ángulo distinto') && varLine.includes('ofertas') && varLine.includes('consejos'), 'variedad real de ángulos (≥3 tipos) → línea que los nombra');
ok(es.hfGridWhyLine([T('scheduled', 'image'), T('draft', 'image'), T('scheduled', 'image')], { en: false }) === '', 'sin patrón verdadero (3 fotos sin tipo): NO hay línea');
ok(es.hfGridWhyLine([T('scheduled', 'image', 'novedad'), T('draft', 'image', 'detras')], { en: false }) === '', 'menos de 3 piezas futuras: NO hay línea');
ok(es.hfGridWhyLine([T('published', 'image', 'novedad'), T('published', 'image', 'detras'), T('published', 'image', 'promo'), T('published', 'image', 'social')], { en: false }) === '', 'solo publicados (nada que viene): NO hay línea — el porqué es de la semana que viene');
const noAlt = [T('scheduled', 'image', 'novedad'), T('scheduled', 'image', 'novedad'), T('scheduled', 'image', 'detras'), T('scheduled', 'image', 'social')];
ok(!es.hfGridWhyLine(noAlt, { en: false }).includes('alternamos producto y personas'), 'grupos presentes pero SIN alternar (dos productos pegados): no se afirma la alternancia');

// ---------- Parte 2: cableado (fuente) ----------
console.log('— frente4: cableado en app.js / styles.css / index.html');
// Ítem 1: visor e inicio
ok(APP.includes('homeStoriesTrayHTML(weekStories'), 'inicioView arma la bandeja con las historias de la semana');
ok(APP.includes('HOME_STORIES = weekStories'), 'inicioView publica la tira para el visor');
ok(APP.includes("$$('#inicioView .hf-story')") && APP.includes('hfStoryOpen(Number(el.dataset.sidx)'), 'bindInicio: tocar un círculo abre el visor en su índice');
ok(typeof APP === 'string' && APP.includes('function hfStoryOpen') && APP.includes('function hfStoryShow') && APP.includes('hfSvSchedule(5000)'), 'visor: apertura, navegación y avance automático de 5s en imágenes');
ok(APP.includes('v.duration') && APP.includes('loadedmetadata'), 'visor: en videos manda la duración real (loadedmetadata)');
ok(APP.includes('hfStoryPause(true)') && APP.includes('hfStoryPause(false)'), 'visor: mantener apretado pausa, soltar reanuda');
ok(CSS.includes('.hf-stories{') && CSS.includes('.hf-story-ring') && CSS.includes('.hf-story-ring.past'), 'CSS: bandeja + aro degradé + aro gris');
ok(CSS.includes('.hf-sv-stage') && CSS.includes('aspect-ratio:9/16'), 'CSS: visor 9:16');
// Ítem 2: Mover
ok(APP.includes('data-hf-act="move"') && APP.includes('Mover') && APP.includes('Move'), 'hoja de acciones: opción «Mover» ES/EN');
ok(APP.includes("if (act === 'move') { pcCloseSheet(); hfMoveStart(tile); return; }"), 'la acción Mover abre el modo desde la hoja vigente');
ok(APP.includes('resolución de la gramática de gestos (DECLARADA)'), 'la resolución de gestos quedó declarada en el código');
ok(APP.includes('hfReschedQuotaOk(aId, aTile, bIso)') && APP.includes('hfReschedQuotaOk(bId, bTile, aIso)'), 'intercambio: chequeo de cupo en AMBOS sentidos (el de Reprogramar)');
ok(count(APP, "api.patch('/api/posts/' + encodeURIComponent(id), { scheduled_at: iso })") >= 1 && APP.includes('hfSwapPosts'), 'intercambio: usa el PATCH vigente de reprogramación');
ok(APP.includes('isPlanLimitErr(e)') && APP.includes('planLimitModal(e)'), 'intercambio: el 403 de plan abre el modal vigente');
ok(APP.includes("t.dataset.status !== 'scheduled'"), 'intercambio: el destino tiene que ser un futuro programado (borradores fuera, declarado)');
ok(APP.includes('hfMoveBind(document.getElementById(\'inicioView\'))'), 'bindInicio arma el interceptor del modo Mover');
ok(CSS.includes('.hf-move-bar') && CSS.includes('.hf-move-src'), 'CSS: barra del modo Mover + tile origen marcada');
// Ítem 3: oscuro declarado — la tile no pinta vistas y la fuente no existe
const tileFn = APP.slice(APP.indexOf('function homeTileHTML'), APP.indexOf('function homeHeadHTML'));
ok(!/\bviews?\b|vistas|reproducciones|👁/i.test(tileFn), 'tile del feed: NINGÚN conteo de vistas/reproducciones (ítem oscuro, no se inventa)');
ok(INS.includes('out.reach = Math.max(out.reach, v)'), 'fuente revisada: la ingesta pliega plays dentro de reach (insights.js)');
const pm = DB.slice(DB.indexOf('CREATE TABLE IF NOT EXISTS post_metrics'), DB.indexOf('CREATE TABLE IF NOT EXISTS post_metrics') + 400);
ok(!/views|plays/.test(pm), 'fuente revisada: post_metrics NO tiene columna de vistas/plays');
// Ítem 4: cableado
ok(APP.includes('hfGridWhyLine(tiles') && APP.includes('class="hf-why"'), 'inicioView pinta el porqué sobre la grilla cuando la derivación lo afirma');
ok(CSS.includes('.hf-why{'), 'CSS: la línea del porqué');
// Reglas duras
const cssT4 = CSS.slice(CSS.indexOf('/* (Tanda 4 del feed) Bandeja'), CSS.indexOf('/* (Frente 3 · suma 2) Hoja de acciones'));
ok(cssT4.length > 500 && !cssT4.includes('text-transform:uppercase'), 'Tanda 4: ningún mayúsculas forzadas nuevo en su bloque CSS');
ok(IDX.includes('/app.js?v=265') && IDX.includes('/styles.css?v=20261024l'), 'index: bumps ?v= app.js 263 + styles.css 20261024k');

console.log(`\nfrente4-feed: ${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
