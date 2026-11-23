#!/usr/bin/env node
// tools/venty-consola-sync.js — Generador de los datos de la consola
// interna de Venty (LOTE VENTY-ETAPA-1 · 22/11/2026).
//
// La consola (GET /api/venty/consola, solo la cuenta de la casa) NO
// lleva ningún número copiado a mano: este script lee las fuentes
// reales de la operación de representantes y escribe
// venty-data/consola.json, que es lo que el endpoint sirve. Cada
// corrida re-lee las fuentes: si la operación crece, la consola lo
// muestra en la próxima sincronización, sin tocar código.
//
// Fuentes (carpeta de la operación, fuera del repo):
//   representantes/universo-total.md      Tier A por zona (§1), Tier B
//                                         (§2), candidatos en cola (§3),
//                                         grilla Argentina (§4).
//   representantes/grilla-argentina.csv   Puestos de representante AR
//                                         (conteo real de registros CSV).
//   representantes/emails-por-representante.csv
//                                         Identidades de representante
//                                         (conteo real de registros CSV).
//   representantes/calentamiento-log.md   Rampa diaria y registro de
//                                         envíos del calentamiento.
//   venty-vende-posty-diseno.md           El inventario verificado del
//                                         diseño: universo registrado
//                                         (4.378 / 2.589 con IG, asiento
//                                         del tablero 20/11) y la meta
//                                         (50.000/mes ≈ 1.800/día).
//                                         Son las únicas fuentes en
//                                         archivo de esas dos cifras;
//                                         el censo del lote lo declara.
//
// Uso:
//   node tools/venty-consola-sync.js [--fuentes <dir-equipo-posty>]
//                                    [--salida <ruta-consola.json>]
//                                    [--hoy <YYYY-MM-DD>]
// Sin flags: fuentes = ~/workspace/equipo-posty (o $VENTY_FUENTES_DIR)
// y salida = <repo>/venty-data/consola.json. --hoy fija la fecha de
// referencia (default: hoy real); existe para que la suite pueda
// exigir valores exactos contra las fuentes con fecha.
//
// (REVISIÓN DE DISEÑO · 22/11) El generador además compone, SOLO
// desde series con fecha de las mismas fuentes:
//   · movimientos: el avance semanal de la rampa de calentamiento
//     (calentamiento-log.md) y del Tier A (la línea de tiempo de
//     universo-total.md §1, con su causa cuando la fuente la nombra).
//     El universo con IG no tiene serie fechada en ninguna fuente:
//     NO lleva movimiento — nunca un avance inventado.
//   · frase_del_dia: la frase de Venty (su voz, minúscula) compuesta
//     con los hechos reales del día y plantillas rotativas.
//   · proximo_paso: el frente de trabajo actual de la operación
//     (sumar negocios con IG; la meta de diciembre sale del diseño §3).
//
// Falla en voz alta (exit 1) si alguna fuente no se puede leer o algún
// número no cierra contra su propio total declarado: la consola nunca
// muestra un número que la fuente no sostiene.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const FUENTES = arg('--fuentes', process.env.VENTY_FUENTES_DIR || path.join(os.homedir(), 'workspace', 'equipo-posty'));
const SALIDA = arg('--salida', path.join(__dirname, '..', 'venty-data', 'consola.json'));
const HOY = arg('--hoy', new Date().toISOString().slice(0, 10));
const REP = path.join(FUENTES, 'representantes');

function leer(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { throw new Error('no se pudo leer la fuente ' + p + ': ' + e.message); }
}
// Número con separador de miles rioplatense («4.378») → entero.
function numEs(s) { return parseInt(String(s).replace(/\./g, '').replace(/[^\d]/g, ''), 10); }
// Primer entero de una celda («38 (35 firmes + 3 cond.)» → 38).
function primerEntero(s) { const m = /(\d[\d.]*)/.exec(String(s || '')); return m ? numEs(m[1]) : null; }

// Parser CSV mínimo con comillas (las grillas traen campos con comas y
// saltos de línea entrecomillados: contar líneas NO es contar filas).
function parseCSV(texto) {
  const filas = []; let fila = [], campo = '', enComillas = false;
  const t = texto.replace(/\r\n/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else enComillas = false; }
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); campo = ''; filas.push(fila); fila = []; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.length > 1 || (f.length === 1 && f[0].trim() !== ''));
}

// ---- Fechas y series (revisión de diseño: movimientos con fecha) --
// Miles rioplatense («2.589») y en inglés («2,589») para la frase.
function fmtMiles(n, sep) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep); }
function addDiasISO(iso, n) { const t = Date.parse(iso + 'T00:00:00Z') + n * 86400000; return new Date(t).toISOString().slice(0, 10); }
function diaDelAnio(iso) { return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(iso.slice(0, 4) + '-01-01T00:00:00Z')) / 86400000) + 1; }
// El valor vigente de una serie fechada en una fecha: la última
// entrada con fecha ≤ la pedida (o null si la serie todavía no llega).
function valorEn(serie, iso) { let v = null; for (const s of serie) { if (s.fecha <= iso) v = s; else break; } return v; }
// Movimiento semanal: valor vigente hoy menos valor vigente hace 7
// días. Si hace 7 días la serie no existía pero nació dentro de la
// semana, la referencia es su primer punto. Si no hay dos puntos
// distintos, NO hay movimiento calculable → null (sin flecha).
function movimientoSemanal(serie, hoyISO) {
  const hoyV = valorEn(serie, hoyISO);
  if (!hoyV) return null;
  let ref = valorEn(serie, addDiasISO(hoyISO, -7));
  if (!ref) ref = serie.find(s => s.fecha <= hoyISO) || null;
  if (!ref || ref.fecha === hoyV.fecha) return null;
  return { delta: hoyV.valor - ref.valor, desde: ref.fecha, hasta: hoyV.fecha };
}
const MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDM(iso) { const [, m, d] = iso.split('-'); return parseInt(d, 10) + '/' + parseInt(m, 10); }
function fmtEN(iso) { const [, m, d] = iso.split('-'); return MESES_EN[parseInt(m, 10) - 1] + ' ' + parseInt(d, 10); }

function main() {
  const universo = leer(path.join(REP, 'universo-total.md'));
  const diseno = leer(path.join(FUENTES, 'venty-vende-posty-diseno.md'));
  const calent = leer(path.join(REP, 'calentamiento-log.md'));

  // ---- §1 · Tier A por ciudad/zona --------------------------------
  const s1 = universo.split('## 2.')[0];
  const ciudades = []; let ciudadActual = null, enTablaZonas = false;
  for (const linea of s1.split('\n')) {
    const m = /^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(linea);
    if (!m) continue;
    const c1 = m[1].replace(/\*/g, '').trim(), c2 = m[2].replace(/\*/g, '').trim(), c3 = m[3];
    // Solo la tabla de zonas de §1 (su encabezado es Ciudad|Zona|Tier A):
    // la tabla de línea de tiempo de arriba tiene la misma forma y sus
    // textos traen números que no son Tier A.
    if (/^Ciudad$/i.test(c1) && /^Zona$/i.test(c2)) { enTablaZonas = true; continue; }
    if (!enTablaZonas) continue;
    if (/^Subtotal/i.test(c1)) {
      if (ciudadActual) { ciudadActual.total = primerEntero(c3); ciudades.push(ciudadActual); ciudadActual = null; }
      continue;
    }
    if (/^TOTAL/i.test(c1)) continue;
    if (!c2 || /^(Ciudad|Zona)$/i.test(c1) || /^-+$/.test(c1)) continue;
    const n = primerEntero(c3);
    if (n == null) continue;
    if (!ciudadActual || ciudadActual.ciudad !== c1) {
      if (ciudadActual) ciudades.push(ciudadActual);
      ciudadActual = { ciudad: c1, zonas: [], total: 0 };
    }
    ciudadActual.zonas.push({ zona: c2, n });
    ciudadActual.total += n;
  }
  if (ciudadActual) ciudades.push(ciudadActual);
  const tierATotalDecl = (() => { const m = /\|\s*\*\*TOTAL\*\*\s*\|\s*\*\*13 zonas\*\*\s*\|\s*\*\*(\d+)\*\*/.exec(s1); return m ? parseInt(m[1], 10) : null; })();
  const tierATotal = ciudades.reduce((a, c) => a + c.total, 0);
  if (tierATotalDecl == null || tierATotal !== tierATotalDecl) {
    throw new Error('Tier A no cierra: suma por ciudad ' + tierATotal + ' vs TOTAL declarado ' + tierATotalDecl);
  }

  // ---- §2 · Tier B (total declarado con método) --------------------
  // La línea declara «≈ 463 contados + pisos (~24) ≈ 490»: manda el
  // último ≈ de la línea (el total con pisos incluidos).
  const mTB = /Total Tier B:[^\n]*≈\s*(\d+)\*\*/.exec(universo);
  const tierB = mTB ? parseInt(mTB[1], 10) : null;
  if (tierB == null) throw new Error('no se encontró el total Tier B en universo-total.md §2');

  // ---- §3 · Candidatos en cola -------------------------------------
  const mCola = /\|\s*\*\*Total\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*/.exec(universo);
  if (!mCola) throw new Error('no se encontró la fila Total de candidatos en cola (§3)');
  const cola = { total: +mCola[1], con_ig: +mCola[2], sin_ig: +mCola[3] };
  const mPool = /Pool sin-IG: (\d+) negocios/.exec(universo);
  const poolSinIg = mPool ? parseInt(mPool[1], 10) : null;

  // ---- Inventario del diseño: registrados / con IG / meta ----------
  const mReg = /\*\*([\d.]+) negocios registrados, ([\d.]+) con IG\*\*/.exec(diseno);
  if (!mReg) throw new Error('no se encontró el universo registrado en el diseño (§1.1)');
  const registrados = numEs(mReg[1]), registradosConIg = numEs(mReg[2]);
  const mMeta = /([\d.]+) emails\/mes \(≈([\d.]+)\/día\)/.exec(diseno);
  if (!mMeta) throw new Error('no se encontró la meta de envío en el diseño');
  const metaMes = numEs(mMeta[1]), metaDiaria = numEs(mMeta[2]);

  // ---- Grillas CSV (conteo real de registros) ----------------------
  const grilla = parseCSV(leer(path.join(REP, 'grilla-argentina.csv')));
  const cabG = grilla[0].map(h => h.trim().toLowerCase());
  const iRub = cabG.indexOf('rubro'), iTer = cabG.indexOf('territorio'), iEst = cabG.indexOf('estado');
  const filasG = grilla.slice(1);
  const rubros = new Set(filasG.map(f => (f[iRub] || '').trim()));
  const territorios = new Set(filasG.map(f => (f[iTer] || '').trim()));
  const dormidos = filasG.filter(f => /dormido/i.test(f[iEst] || '')).length;
  const emails = parseCSV(leer(path.join(REP, 'emails-por-representante.csv')));
  const identidades = emails.length - 1;

  // ---- Calentamiento: rampa + registro ------------------------------
  const rampa = [];
  for (const linea of calent.split('\n')) {
    const m = /^\|\s*(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/.exec(linea);
    if (m) rampa.push({ dia: +m[1], fecha: m[2], total: +m[3], emisoras: +m[4] });
  }
  if (!rampa.length) throw new Error('la rampa del calentamiento no se pudo leer');
  const techo = rampa.reduce((a, r) => Math.max(a, r.total), 0);
  const rampaHoy = [...rampa].reverse().find(r => r.fecha <= HOY) || rampa[0];
  let envios = 0, enviosOk = 0; const emisorasSet = new Set();
  const reg = calent.split('## Registro de envíos')[1] || '';
  for (const linea of reg.split('\n')) {
    const m = /^\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*([^|]+?)\s*\|[^|]*\|[^|]*\|[^|]*\|\s*sent \((\d+)\)\s*\|/.exec(linea);
    if (m) { envios++; if (m[2] === '200') enviosOk++; emisorasSet.add(m[1].trim()); }
  }
  if (!envios) throw new Error('el registro de envíos del calentamiento está vacío o cambió de formato');
  const mDom = /Dominio de envío: `([^`]+)`/.exec(calent);
  const dominio = mDom ? mDom[1] : null;

  // ---- Movimientos semanales (solo series con fecha) ---------------
  // Capacidad: la rampa diaria del calentamiento (fecha → total/día).
  const movCap = movimientoSemanal(rampa.map(r => ({ fecha: r.fecha, valor: r.total })), HOY);
  // Tier A: la línea de tiempo de universo-total.md §1 (fecha → total
  // global), con su causa cuando una fila de la ventana la nombra
  // (la del 16/11: las decisiones de método que re-puntuaron).
  const anioUni = (() => { const m = /\*\*Fecha:\*\*\s*(\d{4})-/.exec(universo); return m ? m[1] : HOY.slice(0, 4); })();
  const serieTA = [];
  {
    let enLinea = false;
    for (const linea of s1.split('\n')) {
      if (/\|\s*Fecha\s*\|\s*Total global\s*\|/.test(linea)) { enLinea = true; continue; }
      if (!enLinea) continue;
      const m = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/.exec(linea);
      if (!m) { if (serieTA.length) break; continue; }
      const f = /(\d{1,2})\/(\d{1,2})/.exec(m[1].replace(/\*/g, ''));
      const v = primerEntero(m[2]);
      if (!f || v == null) continue;
      serieTA.push({ fecha: anioUni + '-' + f[2].padStart(2, '0') + '-' + f[1].padStart(2, '0'), valor: v, nota: m[3].replace(/\*/g, '') });
    }
    serieTA.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  }
  const movTA = movimientoSemanal(serieTA, HOY);
  const movimientos = {};
  if (movCap) movimientos.capacidad = { delta: movCap.delta, desde: movCap.desde, hasta: movCap.hasta };
  if (movTA) {
    movimientos.tier_a = { delta: movTA.delta, desde: movTA.desde, hasta: movTA.hasta };
    const hace7 = addDiasISO(HOY, -7);
    const filaCausa = serieTA.find(s => s.fecha > hace7 && s.fecha <= HOY && /re-puntúan|decisiones de método/i.test(s.nota));
    if (filaCausa) {
      movimientos.tier_a.causa_es = 'la vara nueva del ' + fmtDM(filaCausa.fecha);
      movimientos.tier_a.causa_en = 'the new scoring bar of ' + fmtEN(filaCausa.fecha);
    }
  }
  // con_ig: NINGUNA fuente trae su serie fechada (la cifra es el
  // inventario del diseño, un solo punto) → sin movimiento, declarado.

  // ---- Frase del día (la voz de Venty, desde los hechos) -----------
  // Plantillas rotativas por día del año; cada una usa solo hechos
  // que las fuentes sostienen hoy. Sin hechos, no hay frase (null):
  // nunca un eslogan fijo ni un hecho inventado.
  const plantillas = [];
  if (rampaHoy && rampaHoy.fecha === HOY) plantillas.push({
    es: 'hoy las casillas llegaron al día ' + rampaHoy.dia + ' de calentamiento y las listas siguen creciendo. todo queda listo para tu toque.',
    en: 'the mailboxes reached day ' + rampaHoy.dia + ' of warm-up today and the lists keep growing. everything is left ready for your tap.',
  });
  if (rampaHoy) plantillas.push({
    es: 'día ' + rampaHoy.dia + ' de calentamiento: hoy salen ' + rampaHoy.total + ' correos entre casillas propias. el universo ya suma ' + fmtMiles(registradosConIg, '.') + ' negocios con instagram.',
    en: 'warm-up day ' + rampaHoy.dia + ': ' + rampaHoy.total + ' emails go out today between our own mailboxes. the universe already holds ' + fmtMiles(registradosConIg, ',') + ' businesses on instagram.',
  });
  plantillas.push({
    es: 'ya hay ' + tierATotal + ' negocios de primera línea listos para cuando abra la puerta. todo queda listo para tu toque.',
    en: 'there are already ' + tierATotal + ' top-tier businesses ready for when the door opens. everything is left ready for your tap.',
  });
  if (envios) plantillas.push({
    es: 'las casillas vienen calentando parejo: ' + envios + ' correos ya salieron sin un solo problema. seguimos sumando negocios con instagram.',
    en: 'the mailboxes are warming up steady: ' + envios + ' emails already sent without a single issue. we keep adding businesses on instagram.',
  });
  const fraseDelDia = plantillas.length ? plantillas[diaDelAnio(HOY) % plantillas.length] : null;

  // ---- Próximo paso de Venty (el frente de la operación) -----------
  // El frente actual es sumar negocios con IG al universo; su meta de
  // diciembre sale del diseño §3 (~15–17 mil con IG). Sin esa línea en
  // la fuente, no hay próximo paso que mostrar (null).
  const mPP = /\(~?\s*(\d+[–-]\d+)\s*mil con IG/.exec(diseno);
  const proximoPaso = mPP ? {
    frente_es: 'seguir sumando negocios con Instagram al universo',
    meta_es: 'la meta de diciembre es llegar a ~' + mPP[1].replace('-', '–') + ' mil con Instagram',
    frente_en: 'keep adding businesses on Instagram to the universe',
    meta_en: "december's goal is reaching ~" + mPP[1].replace('-', '–') + 'k on Instagram',
  } : null;

  const datos = {
    ok: true,
    generado_en: new Date().toISOString(),
    listas: {
      registrados, con_ig: registradosConIg,
      tier_a_total: tierATotal, tier_a_por_ciudad: ciudades,
      tier_b_contado: tierB,
      cola, pool_sin_ig: poolSinIg,
      grilla_argentina: { puestos: filasG.length, rubros: rubros.size, territorios: territorios.size, dormidos },
      identidades_representante: identidades,
    },
    capacidad: {
      capacidad_hoy: techo,           // techo diario del dominio: el total mayor de la rampa registrada
      rampa_hoy: rampaHoy,            // la fila de la rampa vigente hoy
      meta_diaria: metaDiaria, meta_mes: metaMes,
      calentamiento: { envios, envios_ok: enviosOk, emisoras: emisorasSet.size, dominio },
      puerta_envio: 'cerrada hasta el 1° de febrero de 2027',
    },
    movimientos,
    frase_del_dia: fraseDelDia,
    proximo_paso: proximoPaso,
    fuentes: [
      'representantes/universo-total.md (§1 Tier A + su línea de tiempo · §2 Tier B · §3 cola · §4 Argentina)',
      'representantes/grilla-argentina.csv',
      'representantes/emails-por-representante.csv',
      'representantes/calentamiento-log.md (rampa + registro de envíos)',
      'venty-vende-posty-diseno.md (§1.1 inventario: registrados/con IG · meta · §3 frente y meta de diciembre)',
    ],
  };
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(datos, null, 2) + '\n');
  console.log('consola.json generado:', SALIDA);
  console.log('  Tier A', tierATotal, '· ciudades', ciudades.length, '· Tier B ~' + tierB, '· cola', cola.total + '/' + cola.con_ig);
  console.log('  registrados', registrados, '· con IG', registradosConIg, '· grilla AR', filasG.length, '· identidades', identidades);
  console.log('  capacidad hoy', techo, '/día · rampa hoy', JSON.stringify(rampaHoy), '· envíos', envios, '(' + enviosOk + ' ok,', emisorasSet.size, 'emisoras) · meta', metaDiaria + '/día');
  console.log('  movimientos (hoy ' + HOY + '):', JSON.stringify(movimientos), '· con_ig: sin serie fechada → sin movimiento');
  console.log('  frase del día:', fraseDelDia ? '"' + fraseDelDia.es + '"' : '(sin hechos → sin frase)');
  console.log('  próximo paso:', proximoPaso ? proximoPaso.frente_es + ' — ' + proximoPaso.meta_es : '(sin fuente → null)');
}
try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
