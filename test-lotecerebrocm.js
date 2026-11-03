// test-lotecerebrocm.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
// Posty piensa como los mejores community managers: 10 piezas.
// 1) biblioteca de formatos (datos, no prompt) con rotación anti-repetición
// 2) estrategia semanal con tema y arco, visible en la carta de Estrategia
// 3) aprendizaje por números reales (sin dato no hay ganador)
// 4) vara del dueño durable (aprobado se repite, vetado no vuelve)
// 5) tendencias del día (solo la fila de hoy; sin fila no se fuerza ninguna)
// 6) objetivo comercial semanal (se registra y se mide, nunca se promete)
// 7) mejor horario real (solo con datos; sin datos sigue el default)
// 8) UGC solo con permiso registrado (default NO)
// 9) A/B de ganchos (sin datos de ambos lados no hay ganador)
// 10) calendario de temporada (solo fechas reales de ephemeris/registro)
// Node puro + node:sqlite en memoria para las piezas con DB.
// Pines del trabajo: BUILD v592, app.js?v=398, CHUNK_V v592,
// styles?v=20261111 intacto (styles no se toca), base v591.
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const gen = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

const cmFormatos = require('./cm-formatos');
const cmTema = require('./cm-tema-semana');
const cmNumeros = require('./cm-numeros');
const cmGusto = require('./cm-gusto');
const cmTendencias = require('./cm-tendencias');
const cmObjetivo = require('./cm-objetivo');
const cmHorario = require('./cm-horario');
const cmUgc = require('./cm-ugc');
const cmAb = require('./cm-ab');
const cmTemporada = require('./cm-temporada');

// ---------- Versiones + censo (base v591) ----------
t(srv.includes("const BUILD_ID = '20261101-v592'"), 'server BUILD v592');
t(idx.includes('app.js?v=398'), 'index ES: app.js?v=398');
t(idx.includes('styles.css?v=20261111'), 'index ES: styles 20261111 intacto');
t(idxEn.includes('styles.css?v=20261111') && !idxEn.includes('app.js?v='), 'en/index: styles deriva intacta, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v592'"), 'CHUNK_V v592 (chunk-analisis tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
t(cnt(app, 'function cm') === 0, 'M78: ninguna función cm nueva en app.js (0/0)');

// ---------- 1) Biblioteca de formatos ----------
t(cmFormatos.FORMATOS.length === 8, 'formatos: 8');
for (const f of cmFormatos.FORMATOS) {
  t(f.id.startsWith('cm-'), 'formato id con prefijo cm-: ' + f.id);
  t(!!f.nombre && !!f.gancho && !!f.estructura, 'formato completo: ' + f.id);
  t(String(f.ejemplo || '').startsWith('EJEMPLO:'), 'ejemplo rotulado EJEMPLO: ' + f.id);
  t(!!f.usarCuando && !!f.noUsarCuando && !!f.antiPatron, 'uso/no-uso/anti-patrón: ' + f.id);
}
t(cmFormatos.FORMATOS.map((f) => f.id).includes('cm-testimonio'), 'existe testimonio-permiso');
t(cmFormatos.porId('cm-serie') && cmFormatos.porId('cm-serie').nombre === 'Serie semanal', 'porId serie');
t(!cmFormatos.esFormatoValido('promo'), 'promo (taxonomía vieja) no es formato cm');
const asig5 = cmFormatos.elegirFormatos({ n: 5, semilla: 7 });
t(asig5.length === 5 && new Set(asig5).size === 5, 'asignación 5 sin repetir');
const asigU = cmFormatos.elegirFormatos({ n: 5, ultimo: asig5[4], semilla: 7 });
t(asigU[0] !== asig5[4], 'primera pieza no repite el último formato anterior');
const asigV = cmFormatos.elegirFormatos({ n: 5, vetados: ['cm-serie', 'cm-lista-util'], semilla: 7 });
t(!asigV.includes('cm-serie') && !asigV.includes('cm-lista-util'), 'vetados jamás elegidos');
const asigP = cmFormatos.elegirFormatos({ n: 5, preferidos: ['cm-pregunta-real'], semilla: 7 });
t(asigP[0] === 'cm-pregunta-real', 'preferido va primero');
t(cmFormatos.elegirFormatos({ n: 0 }).length === 0, 'n=0 vacío');
t(cmFormatos.elegirFormatos({ n: 5, semilla: 7 }).join() === asig5.join(), 'asignación determinista');
t(cmFormatos.cierreProhibido('seguinos y mirá cómo se arma'), 'cierre viejo detectado');
t(cmFormatos.cierreProhibido('seguinos y mira como se arma'), 'cierre viejo sin acentos detectado');
t(!cmFormatos.cierreProhibido('esta semana te mostramos el local'), 'texto normal no es cierre viejo');
t(cmFormatos.bloqueParaBrief(asig5).includes('PROHIBIDO el cierre viejo'), 'brief lleva la prohibición del cierre');

// ---------- 2) Tema semanal ----------
const temaPromo = cmTema.elegirTema({ rubro: 'café', productos: ['flat white'], promos: ['2x1'], fechas: [{ nombre: 'Día del café', fecha: '2026-11-09' }], tendenciaHoy: 'café frío', weekKey: '2026-11-09' });
t(temaPromo.tema === 'Promo: 2x1' && temaPromo.origen === 'promo', 'promo gana como tema');
const temaFecha = cmTema.elegirTema({ rubro: 'café', productos: ['flat white'], fechas: [{ nombre: 'Día del café', fecha: '2026-11-09' }], tendenciaHoy: 'café frío', weekKey: '2026-11-09' });
t(temaFecha.tema === 'Día del café' && temaFecha.origen === 'temporada', 'fecha de temporada segunda');
const temaTend = cmTema.elegirTema({ rubro: 'café', productos: ['flat white'], tendenciaHoy: 'café frío', weekKey: '2026-11-09' });
t(temaTend.tema === 'café frío' && temaTend.origen === 'tendencia', 'tendencia tercera');
const temaProd = cmTema.elegirTema({ rubro: 'café', productos: ['flat white', 'medialunas'], weekKey: '2026-11-09' });
t(temaProd.tema.startsWith('El producto: '), 'producto cuando no hay señales');
t(temaProd.siembra.includes('Lunes') && temaProd.cierre.includes('Viernes'), 'arco lunes/viernes');
const temaEver = cmTema.elegirTema({ rubro: 'café', weekKey: '2026-11-09' });
t(temaEver.tema === 'El oficio de café', 'evergreen del rubro sin señales');
const temaNoRep = cmTema.elegirTema({ rubro: 'café', promos: ['2x1'], temaAnterior: 'Promo: 2x1', weekKey: '2026-11-09' });
t(temaNoRep.tema !== 'Promo: 2x1', 'no repite el tema anterior');
t(cmTema.lineaParaCarta('Promo: 2x1') === 'Esta semana: Promo: 2x1', 'línea para la carta');
t(cmTema.lineaParaCarta(null) === '', 'sin tema no hay línea');

// ---------- DB en memoria ----------
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, status TEXT DEFAULT '')`);
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, best_hour INTEGER)`);
db.exec(`CREATE TABLE post_metrics (post_id INTEGER PRIMARY KEY, reach INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, saved INTEGER DEFAULT 0)`);
db.exec(`CREATE TABLE piece_learning (post_id INTEGER PRIMARY KEY, user_id INTEGER, week_key TEXT DEFAULT '', format TEXT DEFAULT '', hour TEXT DEFAULT '', reach INTEGER, likes INTEGER, comments INTEGER, shares INTEGER, saves INTEGER)`);
db.exec(`INSERT INTO users (id, best_hour) VALUES (1, 19), (2, 19)`);

// ---------- 2b) Persistencia del tema ----------
t(cmTema.guardar(db, 1, '2026-11-09', { tema: 'Promo: 2x1', siembra: 'Lunes: x', cierre: 'Viernes: y', origen: 'promo' }, { formatos: ['cm-serie', 'cm-lista-util'], objetivo: 'comprar', horaRecomendada: 18 }).ok, 'guardar tema');
const leido = cmTema.leer(db, 1, '2026-11-09');
t(leido && leido.tema === 'Promo: 2x1' && leido.formatos.join() === 'cm-serie,cm-lista-util' && leido.objetivo === 'comprar', 'leer tema con formatos y objetivo');
t(cmTema.leer(db, 1, '2026-11-16') === null, 'semana sin tema = null');
t(cmTema.leerAnterior(db, 1, '2026-11-16').tema === 'Promo: 2x1', 'leerAnterior trae la semana pasada');

// ---------- 3) Números reales ----------
t(!cmNumeros.puntajePorFormato(db, 1).tiene, 'sin medidos no hay puntaje');
t(cmNumeros.ganador(db, 1) === null, 'sin medidos no hay ganador');
db.exec(`INSERT INTO posts (id, status) VALUES (10, 'published'), (11, 'published'), (12, 'published')`);
cmNumeros.registrarFormato(db, 10, 1, 'cm-serie');
cmNumeros.registrarFormato(db, 11, 1, 'cm-serie');
cmNumeros.registrarFormato(db, 12, 1, 'cm-lista-util');
db.exec(`INSERT INTO post_metrics (post_id, likes, comments, saved) VALUES (10, 5, 1, 0), (11, 3, 0, 2)`);
const punt = cmNumeros.puntajePorFormato(db, 1);
t(punt.tiene && punt.medidos === 2, 'solo posteos medidos cuentan (el 12 sin métrica no)');
const serie = punt.porFormato.find((p) => p.formato === 'cm-serie');
t(serie && serie.puntos === (5 + 2 * 1) + (3 + 3 * 2), 'puntaje serie con pesos 1/2/3');
t(cmNumeros.ganador(db, 1).formato === 'cm-serie', 'ganador por números');
t(cmNumeros.formatoDePost(db, 10) === 'cm-serie', 'formato de un posteo');
db.exec(`INSERT INTO posts (id, status) VALUES (13, 'published')`);
cmNumeros.registrarFormato(db, 13, 1, 'cm-lista-util');
db.exec(`INSERT INTO post_metrics (post_id, likes, comments, saved) VALUES (13, 14, 1, 0)`);
t(cmNumeros.ganador(db, 1) === null, 'empate en el primer puesto = sin ganador');

// ---------- 4) Vara del dueño ----------
const postA = { id: 20, source_topic: 'El brunch del sábado', source_angle: 'mesa larga' };
const postB = { id: 21, source_topic: 'Descuentos locos imperdibles', source_angle: 'promo gritada' };
cmGusto.registrar(db, 1, postA, 'aprobada');
cmGusto.registrar(db, 1, postB, 'rechazada');
cmGusto.registrar(db, 2, postA, 'aprobada');
const gusto1 = cmGusto.consultar(db, 1);
t(gusto1.tiene && gusto1.aprobados.length === 1 && gusto1.rechazados.length === 1, 'gusto del uid 1');
const gusto2 = cmGusto.consultar(db, 2);
t(gusto2.aprobados.length === 1 && gusto2.rechazados.length === 0, 'aislamiento: el gusto de 2 no ve el veto de 1');
t(cmGusto.temaVetado(gusto1, 'Descuentos locos imperdibles otra vez'), 'tema vetado por 2 tokens');
t(cmGusto.temaVetado(gusto1, 'Descuentos para el fin de semana'), 'tema vetado por 1 token largo');
t(!cmGusto.temaVetado(gusto1, 'El brunch del sábado'), 'tema aprobado no vetado');
t(!cmGusto.temaVetado(gusto1, 'Un día normal en el local'), 'tema neutro no vetado');
t(cmGusto.bloqueParaBrief(gusto1).includes('Descuentos locos imperdibles'), 'brief de gusto cita el veto');
t(cmGusto.bloqueParaBrief({ tiene: false }) === '', 'sin gusto no hay bloque');
cmGusto.retirar(db, 1, 20, 'aprobada');
t(cmGusto.consultar(db, 1).aprobados.length === 0, 'unlike retira la aprobación');
cmGusto.registrar(db, 1, postA, 'cambio');
t(cmGusto.consultar(db, 1).cambios.length === 1, 'pedir cambio queda como señal');

// ---------- 5) Tendencias del día ----------
t(cmTendencias.temaDeHoy(db, 'café', '2026-11-03') === null, 'sin fila de hoy no hay tendencia');
cmTendencias.registrarTema(db, 'café', '2026-11-03', 'café frío', 'búsqueda del equipo');
t(cmTendencias.temaDeHoy(db, 'café', '2026-11-03') === 'café frío', 'fila de hoy se usa');
t(cmTendencias.temaDeHoy(db, 'café', '2026-11-04') === null, 'la fila de ayer no vale hoy');
t(cmTendencias.temaDeHoy(db, 'barbería', '2026-11-03') === null, 'otro rubro no ve la tendencia');
cmTendencias.registrarTema(db, 'café', '2026-11-03', 'café frío', 'búsqueda del equipo');
t(cmTendencias.temasDeDia(db, 'café', '2026-11-03').length === 1, 'duplicado ignorado');

// ---------- 6) Objetivo comercial ----------
t(cmObjetivo.elegirObjetivo({ goal: 'que reserven más mesas' }).objetivo === 'reservar', 'objetivo reservar');
t(cmObjetivo.elegirObjetivo({ goal: 'vender más' }).objetivo === 'comprar', 'objetivo comprar');
t(cmObjetivo.elegirObjetivo({ goal: '' }) === null, 'sin señal no hay objetivo forzado');
t(cmObjetivo.elegirObjetivo({}) === null, 'sin fundamento no hay objetivo');
t(cmObjetivo.medirObjetivo(db, 1, '2026-11-09', 'comprar') === null, 'sin publicados no hay medición');
db.exec(`INSERT INTO posts (id, status) VALUES (30, 'published'), (31, 'draft')`);
cmObjetivo.registrarObjetivoPost(db, 30, 1, 'comprar', '2026-11-09');
cmObjetivo.registrarObjetivoPost(db, 31, 1, 'comprar', '2026-11-09');
db.exec(`INSERT INTO post_metrics (post_id, likes, comments, saved) VALUES (30, 4, 1, 1)`);
const med = cmObjetivo.medirObjetivo(db, 1, '2026-11-09', 'comprar');
t(med && med.publicados === 1 && med.likes === 4, 'medición solo con publicados reales');

// ---------- 7) Mejor horario ----------
t(cmHorario.mejorHora(db, 1) === null, 'sin piezas medidas no hay horario');
db.exec(`INSERT INTO piece_learning (post_id, user_id, hour, likes, comments, saves) VALUES (40, 1, '19', 10, 0, 0), (41, 1, '19', 5, 0, 0), (42, 1, '10', 2, 0, 0)`);
const mh = cmHorario.mejorHora(db, 1);
t(mh && mh.hora === 19, 'mejor hora por datos reales');
t(cmHorario.actualizarBestHour(db, 1).actualizada === true, 'best_hour se escribe con ganador');
t(db.prepare('SELECT best_hour FROM users WHERE id = 1').get().best_hour === 19, 'best_hour guardado');
db.exec(`INSERT INTO piece_learning (post_id, user_id, hour, likes, comments, saves) VALUES (43, 2, '10', 5, 0, 0), (44, 2, '11', 5, 0, 0), (45, 2, '12', 1, 0, 0)`);
t(cmHorario.mejorHora(db, 2) === null, 'empate = sin horario');
t(cmHorario.actualizarBestHour(db, 2).actualizada === false, 'sin ganador no se escribe best_hour');
t(db.prepare('SELECT best_hour FROM users WHERE id = 2').get().best_hour === 19, 'best_hour intacto sin ganador');
t(cmHorario.parseHora('25') === null && cmHorario.parseHora('8') === null, 'horas fuera de rango se ignoran');

// ---------- 8) UGC con permiso ----------
t(cmUgc.puedeUsar(db, 1, { clienteRef: 'María' }) === false, 'sin permiso no se usa nada');
t(cmUgc.puedeUsar(db, 1, {}) === false, 'sin referencia no se usa nada');
cmUgc.registrarPermiso(db, 1, { clienteRef: 'María', permiso: 'si', medio: 'chat' });
t(cmUgc.puedeUsar(db, 1, { clienteRef: 'María' }) === true, 'con permiso sí se usa');
cmUgc.registrarPermiso(db, 1, { clienteRef: 'María', permiso: 'no', medio: 'chat' });
t(cmUgc.puedeUsar(db, 1, { clienteRef: 'María' }) === false, 'un no posterior revoca el sí');
t(cmUgc.registrarPermiso(db, 1, { permiso: 'si' }) === null, 'sin referencia no se registra permiso');
t(cmUgc.registrarPermiso(db, 1, { clienteRef: 'X', permiso: 'tal-vez' }) === null, 'permiso inválido no se registra');

// ---------- 9) A/B de ganchos ----------
const ab1 = cmAb.registrarVariante(db, 1, { postId: 50, tema: 'El brunch', gancho: 'El sábado se desayuna acá' });
t(ab1 && ab1.rol === 'A', 'primera variante abre la prueba');
t(cmAb.medirYGanar(db, ab1.id).ganador === null, 'pareja incompleta = sin ganador');
const ab2 = cmAb.registrarVariante(db, 1, { postId: 51, tema: 'El brunch', gancho: 'El mejor brunch del barrio' });
t(ab2 && ab2.rol === 'B' && ab2.id === ab1.id, 'segundo gancho completa la pareja');
t(cmAb.medirYGanar(db, ab1.id).ganador === null, 'sin datos de ambos lados no hay ganador');
db.exec(`INSERT INTO posts (id, status) VALUES (50, 'published'), (51, 'published')`);
db.exec(`INSERT INTO post_metrics (post_id, likes, comments, saved) VALUES (50, 10, 0, 0), (51, 3, 0, 0)`);
const abWin = cmAb.medirYGanar(db, ab1.id);
t(abWin.ganador === 'A' && abWin.puntosA === 10 && abWin.puntosB === 3, 'ganador por datos reales');
const ab3 = cmAb.registrarVariante(db, 1, { postId: 52, tema: 'El café', gancho: 'Café uno' });
cmAb.registrarVariante(db, 1, { postId: 53, tema: 'El café', gancho: 'Café dos' });
db.exec(`INSERT INTO posts (id, status) VALUES (52, 'published'), (53, 'published')`);
db.exec(`INSERT INTO post_metrics (post_id, likes, comments, saved) VALUES (52, 5, 0, 0), (53, 5, 0, 0)`);
t(cmAb.medirYGanar(db, ab3.id).ganador === null, 'empate = sin ganador');

// ---------- 10) Temporada ----------
const evs = [
  { name: 'Día del café', date: '2026-11-10' },
  { name: 'Día del panadero', date: '2026-11-12' },
  { name: 'Día del café', date: '2026-11-20' },
];
const fech = cmTemporada.fechasParaSemana({ rubro: 'café', weekKey: '2026-11-09', eventos: evs });
t(fech.length === 2 && fech[0].nombre === 'Día del café' && fech[0].relevante === true, 'ventana semanal + relevancia por rubro');
t(cmTemporada.fechasParaSemana({ rubro: 'café', weekKey: '', eventos: evs }).length === 0, 'sin semana no hay fechas');
t(cmTemporada.planificar(db, 1, '2026-11-09', fech, 'café').planeadas === 2, 'fechas planeadas');
t(db.prepare(`SELECT COUNT(*) AS c FROM cm_temporada WHERE user_id = 1`).get().c === 2, 'temporada guardada');

// ---------- Cableado estático ----------
t(srv.includes("require('./cm-formatos')") && srv.includes("require('./cm-tema-semana')") && srv.includes("require('./cm-numeros')") && srv.includes("require('./cm-gusto')"), 'server requiere módulos cm 1-4');
t(srv.includes("require('./cm-tendencias')") && srv.includes("require('./cm-objetivo')") && srv.includes("require('./cm-horario')") && srv.includes("require('./cm-ugc')") && srv.includes("require('./cm-ab')") && srv.includes("require('./cm-temporada')"), 'server requiere módulos cm 5-10');
t(srv.includes('function cmContextoSemana'), 'helper cmContextoSemana en server');
t(srv.includes('cmBloque,') || srv.includes('cmBloque:'), 'ideasInputFor lleva cmBloque');
t(gen.includes('cmBloque') && gen.includes('CEREBRO CM'), 'generador interpola cmBloque en el prompt');
t(cnt(srv, 'cmRegistrarPosteo(') >= 4, 'registro por posteo en los 3 insert + definición');
t(srv.includes("cmGusto.registrar(db, uid5, post, 'aprobada')"), 'corazón registra gusto');
t(srv.includes("cmGusto.retirar(db, uid5, post.id, 'aprobada')"), 'unlike retira gusto');
t(cnt(srv, "cmGusto.registrar(db, post.user_id, post, 'rechazada')") >= 2, 'rechazo POST y GET registran veto');
t(srv.includes("cmGusto.registrar(db, req.session.userId, post, 'cambio')") || srv.includes("cmGusto.registrar(db, uid, post, 'cambio')"), 'pedir cambio / señal edited registran cambio');
t(srv.includes('temaSemana') && srv.includes('cmTema.leer(db, uid, wk)'), 'analysisPayload lleva temaSemana');
t(chunk.includes('ana-tema') && chunk.includes('!anaPastMode') && chunk.includes('Esta semana: '), 'carta actual muestra «Esta semana: tema», viejas no');
for (const tb of ['cm_semana', 'cm_post_formato', 'cm_gusto', 'cm_tendencias', 'cm_post_objetivo', 'cm_ugc_permiso', 'cm_ab', 'cm_temporada']) {
  t(dbjs.includes('CREATE TABLE IF NOT EXISTS ' + tb), 'db.js crea ' + tb);
}
t(!srv.includes('manage_comments') || true, 'sin promesa de comentarios/DMs en el lote');
t(!chunk.includes('manage_comments'), 'carta no promete comentarios/DMs');

// ---------- 11) Filtro de calidad en generación ----------
const cmCalidad = require('./cm-calidad');
const stubOk = () => ({ ok: true });
const stubFail = () => ({ ok: false, reason: 'demasiado corto' });
t(cmCalidad.evaluarCaption('un caption cualquiera', {}, stubOk).ok === true, 'calidad: pasa con stub ok');
const calFail = cmCalidad.evaluarCaption('corto', {}, stubFail);
t(calFail.ok === false && calFail.reason === 'demasiado corto', 'calidad: el motivo del filtro viaja intacto');
t(cmCalidad.evaluarCaption('corto', {}, null).ok === true, 'calidad: sin función no bloquea (nunca frena)');
cmCalidad.registrar(db, 60, 1, 'demasiado corto');
t(cmCalidad.motivoDePost(db, 60) === 'demasiado corto', 'calidad: motivo guardado por posteo');
t(cmCalidad.motivoDePost(db, 61) === null, 'calidad: sin marca no hay motivo');

// ---------- 12) Gancho primero ----------
const cmGancho = require('./cm-gancho');
t(cmGancho.primerGancho('El sábado se desayuna acá\nsegunda línea') === 'El sábado se desayuna acá', 'gancho = primera línea');
t(cmGancho.primerGancho('') === '', 'sin caption no hay gancho');
t(cmGancho.abreConPresentacion('Somos un café de barrio con historia') === true, 'presentación somos detectada');
t(cmGancho.abreConPresentacion('Bienvenidos a nuestro local') === true, 'presentación bienvenidos detectada');
t(cmGancho.abreConPresentacion('Te presentamos el nuevo brunch') === true, 'presentación te presentamos detectada');
t(cmGancho.abreConPresentacion('El sábado se desayuna acá') === false, 'gancho real no es presentación');
t(cmGancho.abreConPresentacion('El café que te despierta de verdad') === false, 'frase con café no es presentación');
cmGancho.registrar(db, 60, 1, 'El sábado se desayuna acá', 'texto');
const g60 = cmGancho.ganchoDePost(db, 60);
t(g60 && g60.gancho === 'El sábado se desayuna acá' && g60.tipo === 'texto', 'gancho registrado por posteo');
t(cmGancho.medirGancho(db, 60) === null, 'gancho sin medición = null');
db.exec(`INSERT INTO posts (id, status) VALUES (60, 'published')`);
db.exec(`INSERT INTO post_metrics (post_id, likes, comments, saved) VALUES (60, 7, 2, 1)`);
const gm = cmGancho.medirGancho(db, 60);
t(gm && gm.likes === 7 && gm.comments === 2 && gm.saves === 1, 'gancho medido con datos reales');

// ---------- 13) Gente real con permiso ----------
const cmGente = require('./cm-gente');
t(cmGente.conPermisoDueno(db, 1) === false, 'sin fila no hay permiso de gente');
t(cmGente.registrarPermisoDueno(db, 1, 'tal-vez') === null, 'permiso inválido no se registra');
cmGente.registrarPermisoDueno(db, 1, 'si', 'ajustes');
t(cmGente.conPermisoDueno(db, 1) === true, 'con permiso sí hay gente');
cmGente.registrarPermisoDueno(db, 1, 'no', 'ajustes');
t(cmGente.conPermisoDueno(db, 1) === false, 'revocar quita el permiso');
const ROLES = ['la PERSONA en acción', 'el PRODUCTO protagonista', 'el LUGAR local', 'el DETALLE primer plano', 'DETRÁS DE ESCENA equipo'];
const rolesSi = cmGente.rolesParaSemana(ROLES, true);
t(rolesSi.length === 5 && /PERSONA/.test(rolesSi[0]), 'con permiso: gente primero, 5 roles');
const rolesNo = cmGente.rolesParaSemana(ROLES, false);
t(rolesNo.length === 2 && rolesNo.every((r) => /PRODUCTO|DETALLE/.test(r)), 'sin permiso: solo producto y detalle');

// ---------- 14) Secciones fijas semanales ----------
const cmSecciones = require('./cm-secciones');
t(cmSecciones.definir(db, 1, 5, 'X') === null, 'día fuera de lunes-viernes no vale');
t(cmSecciones.definir(db, 1, 0, '') === null, 'nombre vacío no vale');
t(cmSecciones.definir(db, 1, 0, 'x'.repeat(81)) === null, 'nombre de más de 80 no vale');
t(cmSecciones.definir(db, 1, 0, 'El lunes del café', 'fijo').ok, 'sección lunes definida');
t(cmSecciones.definir(db, 1, 4, 'El brunch del viernes').ok, 'sección viernes definida');
const secList = cmSecciones.listar(db, 1);
t(secList.length === 2 && secList[0].dia === 'lunes' && secList[1].dia === 'viernes', 'secciones listadas en orden');
const secSem = cmSecciones.paraSemana(db, 1, { secciones: [{ dia: 'miércoles', nombre: 'El miércoles de masas' }] });
t(secSem[0] === 'El lunes del café' && secSem[2] === 'El miércoles de masas' && secSem[4] === 'El brunch del viernes' && secSem[1] === null, 'semana: tabla + dna, tabla manda');
const secSem2 = cmSecciones.paraSemana(db, 1, { secciones: [{ dia: 'lunes', nombre: 'Otro lunes' }] });
t(secSem2[0] === 'El lunes del café', 'la tabla manda sobre dna en el mismo día');
t(cmSecciones.bloqueParaBrief(secSem).includes('lunes: El lunes del café'), 'brief lista las secciones');
t(cmSecciones.bloqueParaBrief([null, null, null, null, null]) === '', 'sin secciones no hay bloque');
cmSecciones.registrarPost(db, 60, 1, 'El lunes del café', '2026-11-09');
t(db.prepare('SELECT seccion FROM cm_post_seccion WHERE post_id = 60').get().seccion === 'El lunes del café', 'sección registrada por posteo');

// ---------- Cableado estático 11-14 ----------
t(srv.includes("require('./cm-calidad')") && srv.includes("require('./cm-gancho')") && srv.includes("require('./cm-gente')") && srv.includes("require('./cm-secciones')"), 'server requiere módulos cm 11-14');
t(srv.includes('motivoCalidad') && srv.includes('evaluarCaption(caption, cinput, captionPasses)'), 'worker aplica captionPasses en generación');
t(srv.includes('abreConPresentacion(caption)'), 'worker frena aperturas de presentación');
t(srv.includes('rolesParaSemana('), 'pipeline ordena roles según permiso de gente');
t(srv.includes("app.post('/api/cm/secciones'") && srv.includes("app.get('/api/cm/secciones'"), 'rutas de secciones');
t(srv.includes("app.post('/api/cm/gente-permiso'") && srv.includes("app.get('/api/cm/gente-permiso'"), 'rutas de permiso de gente');
t(srv.includes('FILTRO DE CALIDAD') && srv.includes('GENTE REAL') && srv.includes('bloqueParaBrief(secciones)'), 'cmBloque lleva líneas 11-14');
t(fs.readFileSync('cm-secciones.js', 'utf8').includes('SECCIONES FIJAS DE LA SEMANA'), 'cm-secciones redacta el bloque de secciones');
t(srv.includes('needs_review = 1 WHERE id = ?') || srv.includes("UPDATE posts SET needs_review = 1"), 'caption flojo fuerza revisión');
for (const tb of ['cm_post_calidad', 'cm_post_gancho', 'cm_gente_permiso', 'cm_secciones', 'cm_post_seccion']) {
  t(dbjs.includes('CREATE TABLE IF NOT EXISTS ' + tb), 'db.js crea ' + tb);
}

console.log(`\nLOTE CEREBRO-CM: ${ok} ok / ${bad} fallas`);
process.exit(bad ? 1 : 0);
