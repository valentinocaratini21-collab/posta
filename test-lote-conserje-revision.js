// test-lote-conserje-revision.js — REVISIÓN DE LA NOCHE DEL CONSERJE
// (lote conserje-revision, base v748). Cubre: la cola de revisión para
// mañana (resumen, orden con atención primero, estados vacíos); la
// decisión por perfil (sale así / pedir arreglo / no sale / Posty lo
// arma); la regla «no sale hasta que lo revises» (a las 00:00 lo que
// necesita atención y quedó sin revisar queda retenido; lo limpio sin
// revisar queda para el ritual del cliente); la convivencia con el
// ritual (un posteo rechazado en la revisión NO se vuelve a ofrecer en
// el pick de la mañana; uno marcado para revisar SÍ, porque ahí decide
// el cliente); la ficha del cliente (todo de fuentes reales, sin
// inventar: estrella, tono, líneas rojas, paleta, plan, etapa,
// estrategia, próximo paso, historial de decisiones, nota de Valentino).
// DB scratch en memoria; fechas relativas al ahora real.
// Uso: node test-lote-conserje-revision.js — sale 0 si todo pasa.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const { dayKeyInTz, pickTodayPost } = require('./morning-post-push');
const rev = require('./conserje-revision');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const NOW = new Date();
const OWNER_TZ = 'America/New_York';
const HOY = dayKeyInTz(NOW, OWNER_TZ);
// Mañana en la zona del dueño (la fecha que revisa la noche).
const MANANA = (() => { const d = new Date(Date.UTC(+HOY.slice(0, 4), +HOY.slice(5, 7) - 1, +HOY.slice(8, 10), 12)); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
function slotManana(hh) { return rev.wallToUtc(MANANA + ' ' + String(hh).padStart(2, '0') + ':00', OWNER_TZ); }

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT DEFAULT '', plan TEXT DEFAULT '', plan_status TEXT DEFAULT 'active', publishing_stopped INTEGER DEFAULT 0, concierge INTEGER NOT NULL DEFAULT 0, best_hour INTEGER DEFAULT 19, trial_ends_at INTEGER, created_at TEXT DEFAULT '2026-10-01 00:00:00');
  CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '', tone TEXT DEFAULT '', description TEXT DEFAULT '');
  CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT '');
  CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'pending', media_type TEXT DEFAULT 'image', carousel_paths TEXT DEFAULT '', needs_review INTEGER DEFAULT 0, source_topic TEXT DEFAULT '', week_key TEXT DEFAULT '', strategy_why TEXT DEFAULT '', error TEXT DEFAULT '', tipo TEXT DEFAULT '', user_stopped INTEGER DEFAULT 0, created_at TEXT DEFAULT '2026-10-20 00:00:00', published_at TEXT);
  CREATE TABLE support_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, tipo TEXT DEFAULT '', estado TEXT DEFAULT 'abierto', siguiente_paso TEXT DEFAULT '', titulo TEXT DEFAULT '', dedup_key TEXT DEFAULT '');
  CREATE TABLE support_team_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT DEFAULT '', action TEXT DEFAULT '', user_id INTEGER, post_id INTEGER, case_id INTEGER, detalle TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE style_rules (user_id INTEGER, rule_key TEXT, rule_text TEXT DEFAULT '', hits INTEGER DEFAULT 0, active INTEGER DEFAULT 1, PRIMARY KEY (user_id, rule_key));
  CREATE TABLE cm_semana (user_id INTEGER NOT NULL, week_key TEXT NOT NULL, tema TEXT DEFAULT '', siembra TEXT DEFAULT '', cierre TEXT DEFAULT '', origen TEXT DEFAULT '', formatos_json TEXT DEFAULT '[]', objetivo TEXT DEFAULT '', hora_recomendada INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, week_key));
  CREATE TABLE cm_gusto (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, senal TEXT NOT NULL DEFAULT '', tema TEXT DEFAULT '', angulo TEXT DEFAULT '', formato TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (user_id, post_id, senal));
  CREATE TABLE client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT NOT NULL DEFAULT '{}', hash TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '');
  CREATE TABLE health_interventions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, cause TEXT NOT NULL, play TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'abierta', created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT, days_to_resolve INTEGER);
  CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
`);

// Usuarios: 12 Valentino (dueño) · 87 Portrait Coffee (activo) ·
// 88 Top Class (prueba) · 89 Ladyee (activo) · 86 guest (free: fuera
// de la cola) · 90 Tienda Nueve (activo, solo para el cierre 00:00).
const users = [
  [12, 'valentino_bamboo@hotmail.com', 'posty', 'active', '2026-10-01 00:00:00'],
  [87, 'portrait@coffee.test', 'posty', 'active', '2026-10-05 00:00:00'],
  [88, 'top@class.test', 'posty', 'trial', '2026-11-01 00:00:00'],
  [89, 'ladyee@boutique.test', 'posty', 'active', '2026-10-10 00:00:00'],
  [86, 'guest@test.dev', 'free', 'active', '2026-11-06 00:00:00'],
  [90, 'tienda@nueve.test', 'posty', 'active', '2026-10-20 00:00:00'],
];
for (const [id, email, plan, st, created] of users) {
  db.prepare('INSERT INTO users (id, email, plan, plan_status, created_at) VALUES (?,?,?,?,?)').run(id, email, plan, st, created);
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?)').run(id, OWNER_TZ);
}
const profs = [
  [12, 'Posty', 'posty.communitymanager', 'Marketing', 'canchero'],
  [87, 'Portrait Coffee', 'portrait.coffee', 'Cafetería', 'Cercano'],
  [88, 'Top Class', 'topclass', 'Barbería', 'Cercano'],
  [89, 'Ladyee Boutique', 'ladyee', 'Moda', 'Elegante'],
  [86, 'Guest', 'guest', 'Otro', ''],
  [90, 'Tienda Nueve', 'tiendanueve', 'Moda', 'Cercano'],
];
for (const [uid, b, ig, cat, tone] of profs) {
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, tone) VALUES (?,?,?,?,?)').run(uid, b, ig, cat, tone);
}
// Fundamento (digest) de Portrait: estrella, paleta, diferencial,
// onboarding q1–q8 y vetos — la ficha los lee de acá, no se inventan.
db.prepare('INSERT INTO client_digest (user_id, digest_json) VALUES (?, ?)').run(87, JSON.stringify({
  business: 'Portrait Coffee', category: 'Cafetería', ciudad: 'Nueva York',
  diferencial: 'Café de especialidad tostado en casa',
  productos: [{ nombre: 'Café single origin' }, { nombre: 'Cold brew' }],
  servicios: [],
  paleta: [{ hex: '#8B5E3C', rol: 'principal' }, { hex: '#F5EFE6', rol: 'fondo' }],
  vetos: ['Hablar mal de la competencia'],
  onboarding: {
    producto_estrella: 'Café single origin', cta: 'Reservar', voz: 'Cercano',
    precios: 'Sí', audiencia: 'Vecinos del barrio', diferencial: 'Tostado en casa',
    lineas_rojas: 'Fotos de clientes sin permiso',
  },
}));
// Estrategia de la semana de Portrait (cm_semana) + gustos + reglas.
db.prepare(`INSERT INTO cm_semana (user_id, week_key, tema, objetivo) VALUES (87, '2026-W45', 'El café de la mañana', 'Que reserven la mesa del finde')`).run();
db.prepare(`INSERT INTO cm_gusto (user_id, post_id, senal, tema, angulo, formato) VALUES (87, 571, 'le_gusta', 'café', 'origen', 'foto')`).run();
db.prepare(`INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (87, 'corto', 'Textos cortos y al punto', 3, 1)`).run();
// Caso conserje abierto de Top Class, con siguiente paso real.
db.prepare(`INSERT INTO support_cases (user_id, tipo, estado, siguiente_paso) VALUES (88, 'conserje', 'abierto', 'Responder en el chat: confirmar el horario')`).run();
// Posteos de mañana: Portrait programado limpio · Top Class borrador con
// marcador (atención) · Ladyee programado limpio · Tienda Nueve
// programado con marcador (solo para el cierre 00:00).
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type, strategy_why) VALUES (571, 87, '/media/571.jpg', 'El single origin de esta semana ya está en Portrait.', ?, 'scheduled', 'pending', 'image', 'El producto estrella abre la semana.')`).run(slotManana(19));
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type) VALUES (576, 88, '/media/576.jpg', 'Country/region and currency, otro favorito de Top Class', NULL, 'draft', 'pending', 'image')`).run();
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type) VALUES (578, 89, '/media/578.jpg', 'Timeless style. Effortless you ya está en Ladyee Boutique.', ?, 'scheduled', 'pending', 'image')`).run(slotManana(19));
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type) VALUES (590, 90, '/media/590.jpg', 'Your bag, otro favorito de Tienda Nueve', ?, 'scheduled', 'pending', 'image')`).run(slotManana(19));
// Un publicado reciente de Portrait (para que "en ritmo" sea honesto).
db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type, published_at) VALUES (570, 87, '/media/570.jpg', 'Ayer en Portrait.', ?, 'published', 'approved', 'image', ?)`)
  .run(slotManana(19).replace(MANANA, HOY), slotManana(19).replace(MANANA, HOY));

console.log('— ventana 19:00–00:00 —');
check('wallToUtc 19:00 NY de noviembre = 00:00 UTC del día siguiente', (rev.wallToUtc('2026-11-08 19:00', 'America/New_York') || '').startsWith('2026-11-09T00:00'));
check('la fecha de revisión es mañana en la zona del dueño', rev.fechaRevision(db, NOW.getTime()) === MANANA);
const vNoche = rev.estadoVentana(db, Date.parse(rev.wallToUtc(HOY + ' 20:00', OWNER_TZ)));
check('a las 20:00 la ventana está abierta', vNoche.estado === 'abierta' && vNoche.fecha === MANANA);
const vMadrugada = rev.estadoVentana(db, Date.parse(rev.wallToUtc(HOY + ' 02:30', OWNER_TZ)));
check('a las 02:30 la ventana está cerrada', vMadrugada.estado === 'cerrada');
const vMediodia = rev.estadoVentana(db, Date.parse(rev.wallToUtc(HOY + ' 12:00', OWNER_TZ)));
check('al mediodía la ventana está cerrada (la revisión es de noche, no de mañana)', vMediodia.estado === 'cerrada');

console.log('— cola de revisión —');
const cola = rev.colaRevision(db, { fecha: MANANA });
check('la cola trae a los 4 con posteo (87, 88, 89, 90)', cola.ok && cola.items.length === 4);
check('el guest free queda fuera de la cola', !cola.items.some((i) => i.user_id === 86) && !cola.sin_posteo.some((i) => i.user_id === 86));
check('Valentino sin posteo mañana aparece en sin_posteo', cola.sin_posteo.some((i) => i.user_id === 12));
check('Tienda Nueve (90) está en la cola', cola.items.some((i) => i.user_id === 90));
check('resumen: 4 con posteo, 0 decididos, 2 necesitan atención', cola.resumen.total === 4 && cola.resumen.decididos === 0 && cola.resumen.necesitan_atencion === 2);
check('primero lo que necesita atención (Tienda Nueve y Top Class antes que los limpios)', cola.items[0].necesita_atencion && cola.items[1].necesita_atencion && !cola.items[2].necesita_atencion && !cola.items[3].necesita_atencion);
const it88 = cola.items.find((i) => i.user_id === 88);
check('Top Class necesita atención por el marcador', it88.necesita_atencion === true && /country\/region/.test(it88.motivo_atencion || ''));
check('el borrador con marcador se propone (no se esconde)', it88.origen === 'propuesta' && it88.post && it88.post.id === 576);
const it87 = cola.items.find((i) => i.user_id === 87);
check('Portrait limpio no necesita atención', it87.necesita_atencion === false);
check('el posteo trae su foto real (nunca hardcodeada)', it87.post && it87.post.image_url === '/media/571.jpg');

console.log('— ficha del cliente —');
const f87 = it87.ficha;
check('la ficha viaja con el ítem de la cola', f87 && f87.ok === true);
check('estrella del onboarding (q1)', f87.vende.estrella === 'Café single origin');
check('productos del fundamento', f87.vende.productos.join(' ') === 'Café single origin Cold brew');
check('diferencial: manda la palabra del dueño (q7) sobre la web', f87.vende.diferencial === 'Tostado en casa');
check('objetivo del onboarding (q2)', f87.vende.objetivo === 'Reservar');
check('tono del perfil', f87.gusta.tono === 'Cercano');
check('gustos anotados (cm_gusto)', f87.gusta.gustos.length === 1 && /café/.test(f87.gusta.gustos[0]));
check('pidió cambiar (style_rules activas)', f87.gusta.pidio_cambiar.length === 1 && /cortos/.test(f87.gusta.pidio_cambiar[0]));
check('líneas rojas: q8 + vetos del fundamento', f87.lineas_rojas.includes('Fotos de clientes sin permiso') && f87.lineas_rojas.includes('Hablar mal de la competencia'));
check('paleta del fundamento (2 colores)', f87.paleta.length === 2 && f87.paleta[0].hex === '#8B5E3C');
check('plan y desde cuándo', f87.plan.plan === 'posty' && f87.plan.plan_status === 'active' && f87.plan.desde === '2026-10-05');
check('etapa en ritmo (verde) con publicado reciente', f87.etapa.clave === 'en_ritmo' && f87.etapa.color === 'verde');
check('estrategia en una línea (cm_semana)', /El café de la mañana/.test(f87.estrategia.linea) && /reserven la mesa/.test(f87.estrategia.linea));
check('próximo paso: seguir el ritmo con conteo real', /Seguir el ritmo/.test(f87.proximo_paso.texto));
const f88 = it88.ficha;
check('etapa en prueba (amarillo) para Top Class', f88.etapa.clave === 'prueba' && f88.etapa.color === 'amarillo');
check('próximo paso de Top Class es el siguiente paso de su caso', f88.proximo_paso.texto === 'Responder en el chat: confirmar el horario');
const f90 = rev.fichaCliente(db, 90, { fecha: MANANA });
check('sin fundamento, la ficha dice lo que falta (nunca inventa)', f90.ok && f90.faltantes.includes('producto_estrella') && f90.faltantes.includes('paleta') && f90.faltantes.includes('estrategia'));
check('sin estrategia registrada, la línea queda vacía', f90.estrategia.linea === '' && f90.estrategia.fuente === 'sin_datos');

console.log('— nota de Valentino —');
const n1 = rev.guardarNota(db, 87, 'Le gusta el café de Colombia, no el de Etiopía.');
check('la nota se guarda (una línea)', n1.ok && n1.nota === 'Le gusta el café de Colombia, no el de Etiopía.');
check('la nota se lee en la ficha', rev.leerNota(db, 87).texto === 'Le gusta el café de Colombia, no el de Etiopía.');
const n2 = rev.guardarNota(db, 87, 'primera línea\nsegunda línea que se corta ' + 'x'.repeat(300));
check('la nota queda en una línea y con tope', n2.ok && !n2.nota.includes('\n') && n2.nota.length <= 200);
check('nota vacía borra la nota', rev.guardarNota(db, 87, '   ').ok && rev.leerNota(db, 87).texto === '');

console.log('— decisión por perfil —');
// 'sale' sobre la propuesta (borrador) de Top Class: se programa mañana
// a la mejor hora de la cuenta y queda aprobado.
const dSale = rev.decidirRevision(db, { user_id: 88, fecha_posteo: MANANA, post_id: 576, decision: 'sale' });
check('sale: programa la propuesta y la aprueba', dSale.ok && dSale.post.status === 'scheduled' && dSale.post.approval === 'approved');
const p576 = db.prepare('SELECT * FROM posts WHERE id = 576').get();
check('sale: quedó para mañana a las 19:00 de la cuenta', String(p576.scheduled_at || '').startsWith(slotManana(19).slice(0, 13)));
check('sale: la decisión queda guardada', rev.revisionDe(db, 88, MANANA) && rev.revisionDe(db, 88, MANANA).decision === 'sale');
// 'arreglar' sobre el programado de Ladyee: vuelve a borrador + regla.
const dArr = rev.decidirRevision(db, { user_id: 89, fecha_posteo: MANANA, post_id: 578, decision: 'arreglar', nota: 'que el producto se vea entero' });
check('arreglar: vuelve a borrador sin fecha', dArr.ok && dArr.post.status === 'draft' && !dArr.post.scheduled_at);
const rule = db.prepare('SELECT * FROM style_rules WHERE user_id = 89 AND rule_key = ?').get('revision-noche-578');
check('arreglar: la nota queda como regla de estilo', !!rule && /producto se vea entero/.test(rule.rule_text || ''));
check('arreglar: la decisión queda guardada con la nota', rev.revisionDe(db, 89, MANANA).decision === 'arreglar' && /producto se vea entero/.test(rev.revisionDe(db, 89, MANANA).nota || ''));
// 'no_sale' sobre el programado de Portrait: rechazado + fuera del slot.
const dNo = rev.decidirRevision(db, { user_id: 87, fecha_posteo: MANANA, post_id: 571, decision: 'no_sale', nota: 'no es el producto estrella' });
check('no_sale: rechazado y fuera del slot (borrador)', dNo.ok && dNo.post.status === 'draft' && dNo.post.approval === 'rejected');
check('la última decisión vale (se puede cambiar)', (() => {
  const r = rev.decidirRevision(db, { user_id: 87, fecha_posteo: MANANA, post_id: 571, decision: 'sale' });
  return r.ok && rev.revisionDe(db, 87, MANANA).decision === 'sale';
})());
// 'pedir' (Posty lo arma) para Valentino, sin posteo mañana.
const dPedir = rev.decidirRevision(db, { user_id: 12, fecha_posteo: MANANA, decision: 'pedir', nota: '' });
check('pedir: queda registrado sin posteo (no genera de noche)', dPedir.ok && dPedir.decision === 'pedir' && dPedir.post_id === null);
// Errores honestos.
check('sin usuario se niega', rev.decidirRevision(db, { user_id: 999, fecha_posteo: MANANA, decision: 'sale' }).error === 'sin_usuario');
check('decisión inválida se niega', rev.decidirRevision(db, { user_id: 87, fecha_posteo: MANANA, decision: 'quemar' }).error === 'decision_invalida');
check('sin posteo y sin post_id se niega', rev.decidirRevision(db, { user_id: 12, fecha_posteo: MANANA, decision: 'sale' }).error === 'sin_posteo');
check('la decisión queda en el registro del equipo', db.prepare(`SELECT COUNT(*) AS c FROM support_team_log WHERE user_id = 88 AND action = 'revision_noche'`).get().c >= 1);

console.log('— historial de decisiones (la memoria del conserje) —');
const h87 = rev.historialDecisiones(db, 87, 10);
check('Portrait tiene su decisión de esta noche en el historial', h87.length >= 1 && h87[0].decision === 'sale' && h87[0].fecha_posteo === MANANA);
const h88 = rev.historialDecisiones(db, 88, 10);
check('Top Class tiene su "sale" en el historial', h88.length === 1 && h88[0].decision === 'sale');
const f87b = rev.fichaCliente(db, 87, { fecha: MANANA });
check('la ficha muestra el historial', f87b.historial.length >= 1 && f87b.historial[0].decision === 'sale');

console.log('— convivencia con el ritual —');
// El rechazado NO se vuelve a ofrecer en el pick de la mañana.
const rechazado = { id: 571, status: 'scheduled', scheduled_at: slotManana(19), approval: 'rejected' };
const limpio = { id: 578, status: 'scheduled', scheduled_at: slotManana(19), approval: 'pending' };
const marcado = { id: 577, status: 'scheduled', scheduled_at: slotManana(19), approval: 'pending', needs_review: 1 };
check('pickTodayPost salta el rechazado de la revisión', pickTodayPost([rechazado, limpio], OWNER_TZ, new Date(Date.parse(slotManana(19))))?.id === 578);
check('pickTodayPost SÍ ofrece el marcado para revisar (ahí decide el cliente)', pickTodayPost([marcado], OWNER_TZ, new Date(Date.parse(slotManana(19))))?.id === 577);
check('pickTodayPost sin candidatos devuelve null', pickTodayPost([rechazado], OWNER_TZ, new Date(Date.parse(slotManana(19)))) === null);

console.log('— cierre de la noche (00:00) —');
const fuera = rev.cierreNoche(db, { nowMs: Date.parse(rev.wallToUtc(HOY + ' 20:00', OWNER_TZ)) });
check('fuera de las 00:00 el cierre no hace nada', fuera.ok && fuera.corridos === 0 && fuera.razon === 'fuera_de_horario');
const medianoche = Date.parse(rev.wallToUtc(MANANA + ' 00:30', OWNER_TZ));
const c1 = rev.cierreNoche(db, { nowMs: medianoche });
check('a las 00:00 retiene lo que necesita atención y quedó sin revisar (Tienda Nueve)', c1.ok && c1.corridos === 1 && c1.retenidos[0].user_id === 90);
const p590 = db.prepare('SELECT * FROM posts WHERE id = 590').get();
check('el retenido sale del slot (borrador, sin fecha)', p590.status === 'draft' && !p590.scheduled_at);
check('el retenido queda con decisión "retenido"', rev.revisionDe(db, 90, MANANA) && rev.revisionDe(db, 90, MANANA).decision === 'retenido');
check('lo decidido no se toca en el cierre (Top Class sigue aprobado)', rev.revisionDe(db, 88, MANANA).decision === 'sale');
const c2 = rev.cierreNoche(db, { nowMs: medianoche });
check('el cierre es idempotente (segunda pasada no retiene nada)', c2.ok && c2.corridos === 0);

console.log('— estados vacíos —');
const dbVacio = new DatabaseSync(':memory:');
dbVacio.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT DEFAULT '', plan TEXT DEFAULT '', plan_status TEXT DEFAULT 'active', publishing_stopped INTEGER DEFAULT 0, concierge INTEGER NOT NULL DEFAULT 0, best_hour INTEGER DEFAULT 19, trial_ends_at INTEGER, created_at TEXT DEFAULT '2026-10-01 00:00:00');
CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '', tone TEXT DEFAULT '', description TEXT DEFAULT '');
CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT '');
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT DEFAULT '', caption TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'pending', media_type TEXT DEFAULT 'image', needs_review INTEGER DEFAULT 0, source_topic TEXT DEFAULT '', week_key TEXT DEFAULT '', strategy_why TEXT DEFAULT '', error TEXT DEFAULT '', tipo TEXT DEFAULT '', user_stopped INTEGER DEFAULT 0, created_at TEXT DEFAULT '2026-10-20 00:00:00', published_at TEXT);
CREATE TABLE support_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, tipo TEXT DEFAULT '', estado TEXT DEFAULT 'abierto', siguiente_paso TEXT DEFAULT '');
CREATE TABLE support_team_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT DEFAULT '', action TEXT DEFAULT '', user_id INTEGER, post_id INTEGER, case_id INTEGER, detalle TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE style_rules (user_id INTEGER, rule_key TEXT, rule_text TEXT DEFAULT '', hits INTEGER DEFAULT 0, active INTEGER DEFAULT 1, PRIMARY KEY (user_id, rule_key));
CREATE TABLE cm_semana (user_id INTEGER NOT NULL, week_key TEXT NOT NULL, tema TEXT DEFAULT '', objetivo TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, week_key));
CREATE TABLE cm_gusto (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, senal TEXT NOT NULL DEFAULT '', tema TEXT DEFAULT '', angulo TEXT DEFAULT '', formato TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT NOT NULL DEFAULT '{}', hash TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '');
CREATE TABLE health_interventions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, cause TEXT NOT NULL, play TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'abierta', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
dbVacio.prepare('INSERT INTO users (id, email, plan, plan_status) VALUES (12, ?, ?, ?)').run('valentino_bamboo@hotmail.com', 'posty', 'active');
dbVacio.prepare('INSERT INTO settings (user_id, timezone) VALUES (12, ?)').run(OWNER_TZ);
const colaVacia = rev.colaRevision(dbVacio, {});
check('sin clientes, la cola vacía no lanza y resume en cero', colaVacia.ok && colaVacia.resumen.total === 0 && colaVacia.resumen.todo_decidido === false);
check('sin clientes, no hay nada que retener a las 00:00', rev.cierreNoche(dbVacio, { nowMs: medianoche }).corridos === 0);
check('ficha de usuario inexistente se niega', rev.fichaCliente(dbVacio, 999).ok === false);

console.log(`\n${pass} pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
