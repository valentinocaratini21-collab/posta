// test-lote-venty-f4-estrategia.js — VENTY F4: estrategia viva versionada.
// Unitarias sobre DB en memoria: defaults derivados del fundamento,
// propuesta sin confirmar no se aplica, confirmación → versión con
// fecha/origen e historial, distinguo D16 (preferencia / puntual /
// ambiguo con dos toques), oleadas que respetan zonas pausadas y
// canales, y el motor (cotizar / jugarMensaje) leyendo la vigente.
// Fixtures genéricos + Café Aroma (semilla de modo prueba). Nada real.
// Uso: node test-lote-venty-f4-estrategia.js
'use strict';
const { DatabaseSync } = require('node:sqlite');

const venty = require('./venty');
const est = require('./venty-estrategia');
const oleadas = require('./venty-oleadas');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);
const vozOk = (r, msg) => {
  ok(venty.validarVoz(r.reply).ok, `${msg}: reply pasa validarVoz (${JSON.stringify(venty.validarVoz(r.reply).errores)})`);
  ok((r.options || []).every((o) => venty.validarVoz(o).ok), `${msg}: options pasan validarVoz`);
  ok(!/[¿¡]/.test(r.reply + ' ' + (r.options || []).join(' ')), `${msg}: cero ¿/¡ en reply y options`);
};

const db = new DatabaseSync(':memory:');
venty.init(db);

// ---------- A. estrategia inicial desde defaults ----------
console.log('— A. sin filas: la vigente se deriva del fundamento y nada cambia');
{
  const U = 101;
  venty.asegurarSemilla(db, U);
  venty.crearZona(db, U, { nombre: 'Centro', ciudad: 'prueba' });
  venty.crearZona(db, U, { nombre: 'Barrio Norte', ciudad: 'prueba' });
  const v = est.obtenerVigente(db, U);
  eq(v.version, 0, 'defaults: versión 0 (ninguna fijada)');
  eq(v.es_default, true, 'defaults: marcada es_default');
  eq(v.datos.descuento_max_pct, 10, 'defaults: descuento 10 desde limites del fundamento');
  eq(JSON.stringify(v.datos.canales_habilitados), JSON.stringify(['whatsapp', 'instagram', 'email']), 'defaults: canales whatsapp/instagram/email');
  eq(v.datos.seguimiento.toques_max, 3, 'defaults: seguimiento 3 toques');
  eq(v.datos.seguimiento.espera_dias, 2, 'defaults: espera 2 días');
  ok(v.datos.zonas_activas.includes('Centro') && v.datos.zonas_activas.includes('Barrio Norte'), 'defaults: zonas activas desde venty_zonas');
  eq(v.datos.zonas_pausadas.length, 0, 'defaults: ninguna zona pausada');
  eq(est.listarHistorial(db, U).length, 0, 'defaults: historial vacío');
  // con el default, el comportamiento de cotizar es el histórico
  const c10 = venty.cotizar(db, U, 'Brunch Aroma para dos', 1, 10);
  ok(c10.ok, 'defaults: cotizar con 10% ok (tope histórico)');
  const c15 = venty.cotizar(db, U, 'Brunch Aroma para dos', 1, 15);
  ok(!c15.ok && c15.kind === 'a_bandeja' && c15.autorizado_pct === 10, 'defaults: cotizar con 15% escala a bandeja con autorizado 10');
}

// ---------- B. propuesta sin confirmar NO se aplica ----------
console.log('— B. proponer no crea versión ni mueve la vigente');
{
  const U = 102;
  venty.asegurarSemilla(db, U);
  const r = est.proponer(db, U, { descuento_max_pct: 5 }, { origen: 'chat', texto_original: 'bajá el descuento a 5' });
  ok(r.ok, 'proponer: ok');
  eq(r.propuesta.descuento_max_pct, 5, 'proponer: la propuesta trae el cambio');
  eq(est.obtenerVigente(db, U).datos.descuento_max_pct, 10, 'sin confirmar: la vigente sigue en 10');
  eq(est.listarHistorial(db, U).length, 0, 'sin confirmar: no nació ninguna versión');
  const p = est.leerPendiente(db, U);
  ok(p && p.tipo === 'propuesta' && p.datos.descuento_max_pct === 5, 'sin confirmar: el pendiente guarda la propuesta');
  const c7 = venty.cotizar(db, U, 'Brunch Aroma para dos', 1, 7);
  ok(c7.ok, 'sin confirmar: cotizar 7% sigue ok (la propuesta no rige)');
  const d = est.descartarPendiente(db, U);
  ok(d.ok && !est.leerPendiente(db, U), 'descartar: el pendiente se va y la vigente no se tocó');
  eq(est.confirmarPendiente(db, U, {}).ok, false, 'confirmar sin pendiente: error honesto');
}

// ---------- C. confirmada → versión nueva con fecha/origen e historial ----------
console.log('— C. confirmar nace la versión; el motor la lee');
{
  const U = 103;
  venty.asegurarSemilla(db, U);
  est.proponer(db, U, { descuento_max_pct: 5 }, { origen: 'chat' });
  const c = est.confirmarPendiente(db, U, {});
  ok(c.ok, 'confirmar: ok');
  eq(c.version, 1, 'confirmar: nace la versión 1');
  eq(c.origen, 'chat', 'confirmar: origen chat registrado');
  ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(c.created_at), 'confirmar: la versión trae fecha');
  ok(!est.leerPendiente(db, U), 'confirmar: el pendiente se consume');
  const v = est.obtenerVigente(db, U);
  eq(v.version, 1, 'vigente: es la versión 1');
  eq(v.es_default, false, 'vigente: ya no es default');
  eq(v.datos.descuento_max_pct, 5, 'vigente: descuento 5');
  // el motor lee la vigente: 7% ahora excede y escala; 5% pasa
  const c7 = venty.cotizar(db, U, 'Brunch Aroma para dos', 1, 7);
  ok(!c7.ok && c7.kind === 'a_bandeja' && c7.autorizado_pct === 5, 'motor: cotizar 7% con tope 5 escala a bandeja');
  const c5 = venty.cotizar(db, U, 'Brunch Aroma para dos', 1, 5);
  ok(c5.ok && c5.total_con_descuento === 22800, 'motor: cotizar 5% pasa y descuenta sobre la lista');
  // segunda versión por voz: historial completo, vigente = la más alta
  est.proponer(db, U, { descuento_max_pct: 8 }, { origen: 'voz' });
  const c2 = est.confirmarPendiente(db, U, {});
  eq(c2.version, 2, 'segunda confirmación: versión 2');
  eq(c2.origen, 'voz', 'segunda versión: origen voz');
  const hist = est.listarHistorial(db, U);
  eq(hist.length, 2, 'historial: 2 versiones guardadas');
  eq(hist[0].version, 2, 'historial: orden descendente, la vigente primero');
  eq(hist[1].datos.descuento_max_pct, 5, 'historial: la versión 1 conserva su dato');
  eq(est.obtenerVigente(db, U).datos.descuento_max_pct, 8, 'vigente: manda la versión más alta (8)');
}

// ---------- D. chat: «mi estrategia» + preferencia con confirmación ----------
console.log('— D. chat de toques: ver la vigente y ajustar una preferencia');
{
  const U = 104;
  venty.asegurarSemilla(db, U);
  const ver = venty.responderChatDueno(db, U, 'mi estrategia');
  ok(ver.reply.includes('tu estrategia hoy') && ver.reply.includes('descuento máximo 10%'), 'chat: «mi estrategia» muestra la vigente en simple');
  vozOk(ver, 'chat ver estrategia');
  const pref = venty.responderChatDueno(db, U, 'bajá el descuento máximo a 6');
  ok(pref.reply.includes('así queda tu estrategia') && pref.reply.includes('descuento máximo 6%'), 'chat preferencia: muestra «así queda tu estrategia» antes de fijar');
  eq(JSON.stringify(pref.options), JSON.stringify(['confirmar', 'cancelar']), 'chat preferencia: opciones confirmar/cancelar');
  vozOk(pref, 'chat preferencia');
  eq(est.obtenerVigente(db, U).datos.descuento_max_pct, 10, 'chat preferencia sin confirmar: la vigente no se movió');
  eq(est.listarHistorial(db, U).length, 0, 'chat preferencia sin confirmar: ninguna versión');
  const conf = venty.responderChatDueno(db, U, 'confirmar');
  ok(conf.reply.includes('versión 1'), 'chat confirmar: el reply nombra la versión nacida');
  vozOk(conf, 'chat confirmar');
  eq(est.obtenerVigente(db, U).datos.descuento_max_pct, 6, 'chat confirmar: la vigente quedó en 6');
  eq(est.obtenerVigente(db, U).origen, 'chat', 'chat confirmar: origen chat en la versión');
  // cancelar una propuesta: no nace versión
  venty.responderChatDueno(db, U, 'subí el descuento máximo a 9');
  const canc = venty.responderChatDueno(db, U, 'cancelar');
  vozOk(canc, 'chat cancelar');
  eq(est.obtenerVigente(db, U).datos.descuento_max_pct, 6, 'chat cancelar: la vigente queda como estaba (6)');
  eq(est.listarHistorial(db, U).length, 1, 'chat cancelar: sigue habiendo 1 sola versión');
}

// ---------- E. chat puntual: la partida cambia, la estrategia intacta ----------
console.log('— E. pedido puntual con partida identificada → jugada solo para ella');
{
  const U = 105;
  venty.asegurarSemilla(db, U);
  const pedro = venty.listarPartidas(db, U).find((p) => p.cliente_nombre === 'Pedro Molina');
  ok(!!pedro, 'fixture: la semilla trae la partida de pedro molina');
  const antes = venty.listarBandeja(db, U).length;
  const r = venty.responderChatDueno(db, U, 'para pedro molina dale un 20% de descuento');
  ok(r.reply.includes('solo para pedro molina'), 'puntual: el reply dice que es solo para esa partida');
  ok(r.reply.includes('tu estrategia no se tocó'), 'puntual: el reply aclara que la estrategia no se tocó');
  vozOk(r, 'chat puntual');
  const bandeja = venty.listarBandeja(db, U);
  eq(bandeja.length, antes + 1, 'puntual: nació exactamente una jugada nueva en bandeja');
  const nueva = bandeja.find((j) => j.propuesta && j.propuesta.alcance === 'solo_esta_partida');
  ok(!!nueva, 'puntual: la jugada está marcada solo_esta_partida');
  eq(nueva.partida_id, pedro.id, 'puntual: la jugada es de la partida de pedro');
  eq(nueva.propuesta.pedido_pct, 20, 'puntual: la jugada lleva el 20% pedido');
  eq(est.listarHistorial(db, U).length, 0, 'puntual: la estrategia no ganó ninguna versión');
  eq(est.obtenerVigente(db, U).datos.descuento_max_pct, 10, 'puntual: el tope de la estrategia sigue en 10');
  ok(!est.leerPendiente(db, U), 'puntual: no quedó ninguna propuesta pendiente');
}

// ---------- F. chat ambiguo: desambiguación con dos toques, nunca adivina ----------
console.log('— F. referencia sin identificar → dos toques; recién ahí se actúa');
{
  const U = 106;
  venty.asegurarSemilla(db, U);
  const bandejaAntes = venty.listarBandeja(db, U).length;
  const amb = venty.responderChatDueno(db, U, 'bajá el descuento a 4 para esta partida');
  eq(JSON.stringify(amb.options), JSON.stringify(['mi estrategia', 'solo esta partida']), 'ambiguo: opciones exactas «mi estrategia» / «solo esta partida»');
  vozOk(amb, 'chat ambiguo');
  eq(est.listarHistorial(db, U).length, 0, 'ambiguo: no nació versión');
  eq(venty.listarBandeja(db, U).length, bandejaAntes, 'ambiguo: no nació jugada');
  const pendAmb = est.leerPendiente(db, U);
  ok(pendAmb && pendAmb.tipo === 'ambiguo', 'ambiguo: el cambio queda guardado como ambiguo, no como propuesta');
  // toque «mi estrategia»: pasa a propuesta y recién al confirmar nace
  const toque = venty.responderChatDueno(db, U, 'mi estrategia');
  ok(toque.reply.includes('así queda tu estrategia') && toque.reply.includes('descuento máximo 4%'), 'ambiguo→estrategia: muestra «así queda» con el cambio guardado');
  eq(JSON.stringify(toque.options), JSON.stringify(['confirmar', 'cancelar']), 'ambiguo→estrategia: pide confirmación');
  eq(est.listarHistorial(db, U).length, 0, 'ambiguo→estrategia sin confirmar: todavía ninguna versión');
  venty.responderChatDueno(db, U, 'confirmar');
  eq(est.obtenerVigente(db, U).datos.descuento_max_pct, 4, 'ambiguo→estrategia confirmado: la vigente quedó en 4');

  // otro ambiguo, resuelto por «solo esta partida» + el nombre
  const U2 = 107;
  venty.asegurarSemilla(db, U2);
  const pedro2 = venty.listarPartidas(db, U2).find((p) => p.cliente_nombre === 'Pedro Molina');
  venty.responderChatDueno(db, U2, 'subí el descuento a 8 para este cliente');
  const solo = venty.responderChatDueno(db, U2, 'solo esta partida');
  ok(solo.reply.includes('decime de cuál partida'), 'ambiguo→solo partida: pide el nombre, no adivina cuál');
  vozOk(solo, 'chat ambiguo solo partida');
  eq(venty.listarBandeja(db, U2).filter((j) => j.propuesta && j.propuesta.alcance === 'solo_esta_partida').length, 0, 'ambiguo→solo partida sin nombre: todavía ninguna jugada');
  const nom = venty.responderChatDueno(db, U2, 'pedro molina');
  ok(nom.reply.includes('solo para pedro molina'), 'ambiguo→solo partida con nombre: jugada solo para pedro');
  const jug = venty.listarBandeja(db, U2).find((j) => j.propuesta && j.propuesta.alcance === 'solo_esta_partida');
  ok(jug && jug.partida_id === pedro2.id && jug.propuesta.pedido_pct === 8, 'ambiguo→solo partida: la jugada lleva el 8% guardado a la partida nombrada');
  eq(est.listarHistorial(db, U2).length, 0, 'ambiguo→solo partida: la estrategia quedó intacta');
}

// ---------- G. oleadas: zona pausada y canal deshabilitado ----------
console.log('— G. la oleada respeta la estrategia vigente');
{
  const U = 108;
  venty.asegurarSemilla(db, U);
  const zc = venty.crearZona(db, U, { nombre: 'Centro', ciudad: 'prueba' });
  const zn = venty.crearZona(db, U, { nombre: 'Barrio Norte', ciudad: 'prueba' });
  venty.crearLead(db, U, { nombre: 'Local Centro', zona_id: zc.id, canal_preferido: 'email', contacto_ref: 'centro@example.com', puntaje: 90, porque: 'fixture' });
  venty.crearLead(db, U, { nombre: 'Local Norte', zona_id: zn.id, canal_preferido: 'email', contacto_ref: 'norte@example.com', puntaje: 90, porque: 'fixture' });
  // sin estrategia: la oleada de centro se prepara como siempre
  const sin = oleadas.prepararOleadaZona(db, U, zc.id, { piloto: 'f4-sin', fecha: '2026-11-18' });
  eq(sin.items.length, 1, 'oleadas sin estrategia: centro prepara su ítem (comportamiento histórico)');
  // estrategia confirmada que pausa centro
  est.proponer(db, U, { zona_pausar: 'Centro' }, { origen: 'chat' });
  est.confirmarPendiente(db, U, {});
  ok(est.zonaPausada(db, U, 'Centro'), 'estrategia: centro figura pausada en la vigente');
  const pau = oleadas.prepararOleadaZona(db, U, zc.id, { piloto: 'f4-pau', fecha: '2026-11-19' });
  eq(pau.items.length, 0, 'oleadas con zona pausada: no prepara ningún ítem de esa zona');
  eq(pau.zona_pausada, true, 'oleadas con zona pausada: el resultado lo declara');
  eq(pau.oleada, null, 'oleadas con zona pausada: ni siquiera nace la oleada en espejo');
  const norte = oleadas.prepararOleadaZona(db, U, zn.id, { piloto: 'f4-pau', fecha: '2026-11-19' });
  eq(norte.items.length, 1, 'oleadas: la zona no pausada prepara normalmente');
  const diaria = oleadas.prepararOleadaDiaria(db, U, { piloto: 'f4-diaria', fecha: '2026-11-20' });
  const filaCentro = diaria.por_zona.find((z) => z.zona_nombre === 'Centro');
  ok(filaCentro && filaCentro.zona_pausada === true && filaCentro.items === 0, 'oleada diaria: centro figura pausada con 0 ítems');
  // canal deshabilitado: sin email en la estrategia, el lead de email no entra
  const U2 = 109;
  venty.asegurarSemilla(db, U2);
  const z2 = venty.crearZona(db, U2, { nombre: 'Centro', ciudad: 'prueba' });
  venty.crearLead(db, U2, { nombre: 'Local Mail', zona_id: z2.id, canal_preferido: 'email', contacto_ref: 'mail@example.com', puntaje: 90, porque: 'fixture' });
  venty.crearLead(db, U2, { nombre: 'Local Ig', zona_id: z2.id, canal_preferido: 'instagram', contacto_ref: '@localig', puntaje: 90, porque: 'fixture' });
  est.proponer(db, U2, { canales_habilitados: ['instagram', 'whatsapp'] }, { origen: 'sistema' });
  est.confirmarPendiente(db, U2, {});
  const ol = oleadas.prepararOleadaZona(db, U2, z2.id, { piloto: 'f4-canal', fecha: '2026-11-18' });
  eq(ol.items.length, 1, 'oleadas con email deshabilitado: entra solo el lead de instagram');
  eq(ol.items[0].canal, 'instagram', 'oleadas con email deshabilitado: el ítem preparado es el de instagram');
}

// ---------- H. motor con la vigente: jugarMensaje y seguimiento ----------
console.log('— H. jugarMensaje lee el tope y el seguimiento de la vigente');
{
  const U = 110;
  venty.asegurarSemilla(db, U);
  const mk = (nombre) => {
    const r = db.prepare(`INSERT INTO venty_partidas (user_id, cliente_nombre, canal, estado, modo_rubro, monto, forma_cierre, motivo_perdida, seguimiento_toque, proximo_toque_at, origen, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(U, nombre, 'whatsapp', 'viva', 'gastronomía', 0, '', '', 0, '', 'whatsapp', '2026-11-18 09:00:00', '2026-11-18 09:00:00');
    return Number(r.lastInsertRowid);
  };
  // con el default (10): pedir 15% escala a bandeja, como siempre
  const p1 = mk('Cliente Default');
  const j1 = venty.jugarMensaje(db, U, p1, 'hola, me hacés 15% de descuento?');
  eq(j1.jugada, 'bandeja', 'motor default: 15% sobre el tope 10 escala a bandeja');
  // estrategia con tope 20: 15% ya no escala; 25% sí, con autorizado 20
  est.proponer(db, U, { descuento_max_pct: 20, seguimiento: { toques_max: 2, espera_dias: 5 } }, { origen: 'chat' });
  est.confirmarPendiente(db, U, {});
  const p2 = mk('Cliente Tope Veinte');
  const j2 = venty.jugarMensaje(db, U, p2, 'hola, me hacés 15% de descuento?');
  ok(j2.ok && j2.jugada !== 'bandeja', 'motor con tope 20: 15% no escala a bandeja');
  eq(db.prepare(`SELECT COUNT(*) c FROM venty_jugadas WHERE user_id = ? AND partida_id = ? AND tipo = 'descuento'`).get(U, p2).c, 0, 'motor con tope 20: no nació jugada por el 15%');
  const p3 = mk('Cliente Tope Excedido');
  const j3 = venty.jugarMensaje(db, U, p3, 'hola, me hacés 25% de descuento?');
  eq(j3.jugada, 'bandeja', 'motor con tope 20: 25% sí escala a bandeja');
  const jug3 = db.prepare(`SELECT propuesta_json FROM venty_jugadas WHERE user_id = ? AND partida_id = ? AND tipo = 'descuento'`).get(U, p3);
  eq(JSON.parse(jug3.propuesta_json).autorizado_pct, 20, 'motor con tope 20: la jugada declara autorizado 20 (la vigente)');
  // seguimiento de la vigente: tope 2 toques, espera 5 días
  const p4 = mk('Cliente Seguimiento');
  venty.jugarMensaje(db, U, p4, 'lo consulto y te aviso');
  venty.jugarMensaje(db, U, p4, 'lo pienso y te aviso');
  const fila = db.prepare('SELECT seguimiento_toque, proximo_toque_at FROM venty_partidas WHERE id = ?').get(p4);
  eq(fila.seguimiento_toque, 2, 'seguimiento vigente: el conteo respeta el flujo');
  venty.jugarMensaje(db, U, p4, 'lo veo y te aviso');
  const fila2 = db.prepare('SELECT seguimiento_toque FROM venty_partidas WHERE id = ?').get(p4);
  eq(fila2.seguimiento_toque, 2, 'seguimiento vigente: el tope es 2 toques (la vigente), no 3');
}

// ---------- I. chat: pausar una zona no frena a todo venty ----------
console.log('— I. «pausá la zona» es estrategia, no el freno general');
{
  const U = 111;
  venty.asegurarSemilla(db, U);
  venty.crearZona(db, U, { nombre: 'Centro', ciudad: 'prueba' });
  const r = venty.responderChatDueno(db, U, 'pausá la zona centro');
  ok(r.reply.includes('así queda tu estrategia'), 'pausar zona: nace como propuesta de estrategia');
  vozOk(r, 'chat pausar zona');
  eq(venty.estaPausado(db, U), false, 'pausar zona: venty NO quedó frenado');
  venty.responderChatDueno(db, U, 'confirmar');
  ok(est.zonaPausada(db, U, 'Centro'), 'pausar zona confirmado: centro pausada en la vigente');
  eq(venty.estaPausado(db, U), false, 'pausar zona confirmado: venty sigue sin freno general');
  // y el freno general sigue funcionando como siempre
  const freno = venty.responderChatDueno(db, U, 'pausá todo');
  ok(freno.reply.includes('venty en pausa'), 'freno general: sigue respondiendo como siempre');
  eq(venty.estaPausado(db, U), true, 'freno general: venty quedó pausado');
  venty.responderChatDueno(db, U, 'reanudar');
}

console.log(`\n— venty f4 estrategia: ${total - fails}/${total} OK, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
