'use strict';
/* test-lote-ads-billetera-disponible.js — LOTE ADS-BILLETERA-DISPONIBLE
 * (orden del dueño 27/11, con su corrección de las 03:16 y la regla
 * de oro de Ads de las 03:17).
 *
 * El caso: la billetera del usuario 12 decía «US$22 de US$22 · te
 * alcanza» con el impulso 25 (posteo 744, pauta US$20) ya corriendo.
 * La verdad completa, verificada contra producción:
 *  - saldo crudo 2200 (cargas +2000 del 13/11 y +200 del 20/11, sin
 *    ningún débito);
 *  - el impulso 25 se creó el 25/11 POR FUERA del riel de billetera
 *    (durante la reparación de Ads): fee_cents = 0 y ningún camino
 *    le cobró la gestión a nadie;
 *  - el impulso se vendió como US$20 de pauta + US$2 de gestión
 *    (10%) = US$22 — el disponible real del dueño es US$0: «esos 2
 *    dólares deberían haber ido para Posty».
 *
 * El lote:
 *  §B neteo (ads-billetera.js, DB real): disponible = saldo − lo
 *     comprometido en impulsos activos que TODAVÍA no salió de la
 *     billetera (invariante: un impulso ya debitado al crearse no
 *     compromete dos veces; uno financiado fuera de la billetera no
 *     la compromete; el parcialmente debitado compromete el resto).
 *  §B reparación única del impulso 25: gestión del 10% debitada de
 *     la billetera con kind 'boost_fee' + fee_cents en la fila, dos
 *     pasos idempotentes. Estado final del usuario 12: saldo 2000,
 *     fee_cents 200, comprometido 2000, disponible 0.
 *  §C regla de oro en el riel billetera (impulsarConSaldo): al
 *     mandar un ad se descuenta pauta + gestión (10% de la pauta:
 *     20→200¢, 50→500¢, 100→1000¢) en el débito; si el anuncio no
 *     se crea, no se descuenta nada; el saldo tiene que cubrir el
 *     TOTAL antes de crear.
 *  §D cliente (VM, funciones reales de app.js): la tarjeta muestra
 *     el DISPONIBLE, la línea «US$20 en tu impulso activo» (EN:
 *     «US$20 in your active boost») y la diferencia se mide contra
 *     el disponible.
 *  §A estáticos del cableado en server.js.
 *  §E cierre del lote: la recomputación de la diferencia en
 *     POST /api/ads/billetera/cargar (ramas ARS y USD) se mide
 *     contra el DISPONIBLE en el servidor, igual que en el cliente —
 *     se evalúan las expresiones `faltaCents` reales del endpoint
 *     sobre una DB real (el caso usuario 12: saldo 2000 con 2000
 *     comprometidos → la falta para el total 2200 es 2200, no 0).
 *
 * Uso: node test-lote-ads-billetera-disponible.js — sale 0 si todo pasa.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.env.ABD_TREE || __dirname);
const ab = require(path.join(TREE, 'ads-billetera.js'));
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const count = (s, sub) => (s.split(sub).length - 1);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}

// ---------- §A: estáticos del cableado ----------
console.log('— §A: estáticos (server.js + app.js)');
t(SRV.includes('adsBilletera.comprometidoEnActivos(db, tid)'), '§A: /api/ads/billetera calcula el comprometido del TITULAR con el módulo');
t(SRV.includes('comprometido_cents: comprometidoCents, disponible_cents: disponibleCents'), '§A: la respuesta suma comprometido_cents y disponible_cents sin tocar los demás campos');
t(SRV.includes('adsBilletera.repararFeeImpulso25(db,'), '§A: la reparación del impulso 25 corre al arrancar el servidor');
t(SRV.includes("adWalletMove(uid, cents, 'boost_fee', ref, note)"), "§A: el débito de la reparación va por adWalletMove con kind 'boost_fee'");
t(SRV.includes('d.montoUSD * 100 + (Number(d.feeCents) || 0)'), '§A: debitar del riel billetera descuenta pauta + gestión juntas (USD)');
t(SRV.includes('rec.campaignId && cobroDirectoUSD'), '§A: la costura del fee queda solo para el cobro directo (sin doble cobro de la gestión)');
t(SRV.includes('const feeRec = Number(rec.feeCents) || 0;'), '§A: registrar guarda fee_cents en la fila en ambos rieles');
t(APP.includes('function pzBoostDisponibleCents('), '§A: el cliente lee el disponible con su función propia');
t(APP.includes("' en tu impulso activo'") && APP.includes("' in your active boost'"), '§A: la línea del comprometido existe en ES y en EN (paridad)');

// ---------- §B: neteo + reparación (DB real) ----------
console.log('— §B: neteo y reparación (node:sqlite, módulo real)');
function nuevaDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE ad_wallets (user_id INTEGER PRIMARY KEY, balance_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD');
  CREATE TABLE ad_boosts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER, ig_media_id TEXT DEFAULT '', budget_cents INTEGER NOT NULL DEFAULT 0, fee_cents INTEGER NOT NULL DEFAULT 0, spend_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE ad_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'topup', amount_cents INTEGER NOT NULL DEFAULT 0, balance_after INTEGER NOT NULL DEFAULT 0, ref TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  return db;
}
// El mover de la fixture: el mismo contrato de adWalletMove (saldo +
// ledger en una transacción, revienta si el saldo no alcanza).
function moverDe(db) {
  return (userId, amountCents, ref, note) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const w = db.prepare('SELECT * FROM ad_wallets WHERE user_id = ?').get(userId);
      const after = w.balance_cents + amountCents;
      if (after < 0) throw new Error('Saldo insuficiente');
      db.prepare('UPDATE ad_wallets SET balance_cents = ? WHERE user_id = ?').run(after, userId);
      db.prepare(`INSERT INTO ad_transactions (user_id, kind, amount_cents, balance_after, ref, note) VALUES (?, 'boost_fee', ?, ?, ?, ?)`)
        .run(userId, amountCents, after, ref || '', note || '');
      db.exec('COMMIT');
      return after;
    } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) {} throw e; }
  };
}
const saldoDe = (db, uid) => db.prepare('SELECT balance_cents FROM ad_wallets WHERE user_id = ?').get(uid).balance_cents;

{ // B1–B4: el usuario 12, antes y después de la reparación.
  const db = nuevaDB();
  db.prepare('INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (12, 2200, ?)').run('USD');
  db.prepare(`INSERT INTO ad_boosts (id, user_id, post_id, ig_media_id, budget_cents, fee_cents, spend_cents, currency, status, created_at)
    VALUES (25, 12, 744, 'ig744', 2000, 0, 2000, 'USD', 'active', '2026-11-25 12:00:00')`).run();
  t(ab.comprometidoEnActivos(db, 12) === 0, '§B1: antes de la reparación el impulso 25 no tiene débito asociado: no compromete (así nació el bug)');
  t(ab.saldoDisponibleCents(2200, ab.comprometidoEnActivos(db, 12)) === 2200, '§B1: y el disponible daba 2200 — el «US$22 te alcanza» de la captura');

  const rep1 = ab.repararFeeImpulso25(db, moverDe(db));
  t(rep1.ok && rep1.debito === true && rep1.filaUpd === true && rep1.gestion === 200, '§B2: la reparación debita la gestión (10% de 2000 = 200) y la asienta en la fila', JSON.stringify(rep1));
  t(saldoDe(db, 12) === 2000, '§B2: el saldo queda en 2000 (2200 − 200 de gestión)');
  const tx = db.prepare(`SELECT * FROM ad_transactions WHERE user_id = 12 AND kind = 'boost_fee'`).get();
  t(!!tx && tx.amount_cents === -200 && tx.balance_after === 2000 && tx.ref === 'boost_fee:25' && tx.note === 'Gestión de Posty · impulso posteo 744',
    '§B2: el ledger dice la verdad: −200, balance_after 2000, ref boost_fee:25, nota «Gestión de Posty · impulso posteo 744»', tx && JSON.stringify(tx));
  t(Number(db.prepare('SELECT fee_cents FROM ad_boosts WHERE id = 25').get().fee_cents) === 200, '§B2: la fila del impulso 25 queda con fee_cents = 200');

  const rep2 = ab.repararFeeImpulso25(db, moverDe(db));
  t(rep2.ok && rep2.debito === false && rep2.filaUpd === false, '§B3: la reparación es idempotente: el segundo arranque no toca nada');
  t(saldoDe(db, 12) === 2000 && count(JSON.stringify(db.prepare(`SELECT * FROM ad_transactions WHERE kind = 'boost_fee'`).all()), 'boost_fee') >= 1
    && db.prepare(`SELECT COUNT(*) AS n FROM ad_transactions WHERE kind = 'boost_fee'`).get().n === 1,
    '§B3: un solo débito de gestión en el ledger, saldo intacto');

  const comp = ab.comprometidoEnActivos(db, 12);
  t(comp === 2000, '§B4: tras la reparación, lo comprometido es la pauta (2000): debido 2200 − debitado 200', String(comp));
  t(ab.saldoDisponibleCents(saldoDe(db, 12), comp) === 0, '§B4: ESTADO FINAL DEL DUEÑO: saldo 2000, comprometido 2000, disponible US$0');
}
{ // B5: dos impulsos activos suman; el de riel cliente no compromete.
  const db = nuevaDB();
  db.prepare('INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (13, 20000, ?)').run('USD');
  const ins = db.prepare(`INSERT INTO ad_boosts (id, user_id, post_id, budget_cents, fee_cents, currency, status, created_at) VALUES (?, 13, ?, ?, ?, 'USD', 'active', '2026-11-26 10:00:00')`);
  ins.run(31, 801, 2000, 200); ins.run(32, 802, 5000, 500); ins.run(33, 803, 9999, 0);
  const insTx = db.prepare(`INSERT INTO ad_transactions (user_id, kind, amount_cents, balance_after, ref) VALUES (13, 'boost_fee', ?, 0, ?)`);
  insTx.run(-200, 'boost_fee:31'); insTx.run(-500, 'boost_fee:32');
  t(ab.comprometidoEnActivos(db, 13) === 7000, '§B5: dos impulsos con débito parcial SUMAN (2000 + 5000) y el de riel cliente (sin débito) no compromete');
}
{ // B6: riel ARS — la gestión va dentro del presupuesto; debitado entero = 0 comprometido.
  const db = nuevaDB();
  const hoy = new Date().toISOString().slice(0, 10);
  db.prepare('INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (14, 300000, ?)').run('ARS');
  db.prepare(`INSERT INTO ad_boosts (user_id, post_id, budget_cents, fee_cents, currency, status) VALUES (14, 900, 500000, 50000, 'ARS', 'active')`).run();
  db.prepare(`INSERT INTO ad_transactions (user_id, kind, amount_cents, balance_after, ref) VALUES (14, 'boost_ars', -500000, 300000, ?)`).run(`boost_ars:u14:p900:5000:${hoy}`);
  t(ab.comprometidoEnActivos(db, 14) === 0, '§B6: impulso ARS debitado entero al crearse (presupuesto con gestión adentro): comprometido 0, sin doble conteo');
  const db2 = nuevaDB(); // sin boosts: 0
  t(ab.comprometidoEnActivos(db2, 99) === 0 && ab.saldoDisponibleCents(2200, 0) === 2200, '§B6: sin impulsos activos, comprometido 0 y disponible = saldo');
}

// ---------- §C: la regla de oro en impulsarConSaldo ----------
console.log('— §C: impulsarConSaldo (módulo real, proveedores stub)');
const hoyISO = new Date().toISOString().slice(0, 10);
function baseImp(extra) {
  return Object.assign({
    clienteId: 21, posteoId: 555, montoUSD: 20, moneda: 'USD', zona: 'AR',
    env: { DESTACADO_BOOST_ENABLED: '1' }, adsConfigurado: true, paginaAutorizada: true, permisoAds: true,
    conversionARS: (usd) => usd * 100 * 1000, saldoCentsUSD: 10000, saldoCentsARS: 0,
    splitARS: (c) => { const fee = Math.round(c * 10 / 100); return { fee_cents: fee, spend_cents: c - fee }; },
    fecha: hoyISO, buscarDebito: () => null,
    crearAnuncio: async () => ({ ok: true, anuncioId: 'camp_1', campaignId: 'camp_1', adsetId: 'as1', adId: 'ad1' }),
    debitar: async () => ({ ok: true, saldoNuevo: 0 }),
    registrar: async () => {},
  }, extra || {});
}
(async () => {
  // C1: el caso invariante — creación exitosa ⇒ la billetera baja
  // pauta + gestión y la fila nace con fee_cents = 10% de la pauta;
  // ese impulso NO compromete nada del saldo que queda (ya salió).
  {
    const db = nuevaDB();
    db.prepare('INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (21, 10000, ?)').run('USD');
    let debPayload = null, regExito = null;
    const r = await ab.impulsarConSaldo(baseImp({
      saldoCentsUSD: 10000,
      debitar: async (d) => {
        debPayload = d;
        const cents = d.montoUSD * 100 + (Number(d.feeCents) || 0); // el debitar NUEVO del servidor
        const after = saldoDe(db, 21) - cents;
        db.prepare('UPDATE ad_wallets SET balance_cents = ? WHERE user_id = 21').run(after);
        db.prepare(`INSERT INTO ad_transactions (user_id, kind, amount_cents, balance_after, ref) VALUES (21, 'boost_usd', ?, ?, ?)`).run(-cents, after, d.ref);
        return { ok: true, saldoNuevo: after };
      },
      registrar: async (rec) => {
        if (rec.tipo === 'exito') {
          regExito = rec;
          db.prepare(`INSERT INTO ad_boosts (user_id, post_id, budget_cents, fee_cents, currency, status) VALUES (21, ?, ?, ?, 'USD', 'active')`)
            .run(rec.posteoId, rec.montoUSD * 100, Number(rec.feeCents) || 0);
        }
      },
    }));
    t(r.ok === true && r.feeCents === 200, '§C1: impulsar US$20 devuelve feeCents = 200 (10% de la pauta)', JSON.stringify(r));
    t(debPayload && debPayload.feeCents === 200, '§C1: el débito recibe la gestión junto con la pauta');
    t(saldoDe(db, 21) === 7800, '§C1: INVARIANTE: la billetera baja exactamente pauta + gestión (10000 → 7800)');
    t(regExito && Number(regExito.feeCents) === 200 && Number(db.prepare('SELECT fee_cents FROM ad_boosts WHERE user_id = 21').get().fee_cents) === 200,
      '§C1: la fila del impulso nace con fee_cents = 200 registrados');
    t(ab.comprometidoEnActivos(db, 21) === 0 && ab.saldoDisponibleCents(saldoDe(db, 21), 0) === 7800,
      '§C1: el impulso del riel billetera NO compromete el saldo que queda (sin doble conteo del fee)');
  }
  // C2: las tres escalas — la gestión es exactamente el 10% (tarea A).
  for (const [monto, fee] of [[20, 200], [50, 500], [100, 1000]]) {
    let debFee = null;
    const r = await ab.impulsarConSaldo(baseImp({ montoUSD: monto, saldoCentsUSD: 100000, debitar: async (d) => { debFee = d.feeCents; return { ok: true, saldoNuevo: 1 }; } }));
    t(r.ok && debFee === fee && r.feeCents === fee, `§C2: escala US$${monto} → gestión ${fee}¢ (10% exacto de la pauta)`);
  }
  // C3: el saldo tiene que cubrir el TOTAL: 2100 no alcanza para 20+2.
  {
    let creo = false, debio = false;
    const r = await ab.impulsarConSaldo(baseImp({
      saldoCentsUSD: 2100,
      crearAnuncio: async () => { creo = true; return { ok: true, campaignId: 'x' }; },
      debitar: async () => { debio = true; return { ok: true, saldoNuevo: 0 }; },
    }));
    t(!r.ok && r.motivo === 'saldo_insuficiente' && !creo && !debio, '§C3: saldo 2100 < total 2200 → saldo_insuficiente SIN crear ni debitar (la pantalla y el servidor piden el mismo total)');
  }
  // C4: si el anuncio no se crea, no se descuenta NADA (neto 0).
  {
    let debio = false;
    const r = await ab.impulsarConSaldo(baseImp({
      crearAnuncio: async () => ({ ok: false, error: 'Meta rechazó' }),
      debitar: async () => { debio = true; return { ok: true, saldoNuevo: 0 }; },
    }));
    t(!r.ok && r.motivo === 'anuncio_fallido' && !debio, '§C4: creación fallida → anuncio_fallido y débito jamás llamado (cambio neto de billetera = 0)');
  }

  // ---------- §D: cliente (VM, funciones reales de app.js) ----------
  console.log('— §D: cliente (VM, funciones reales)');
  const appCode = stripComments(APP);
  const sandbox = {
    console, Set, Map,
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    ME: { lang: 'es' },
  };
  vm.createContext(sandbox);
  const enVM = (expr) => vm.runInContext(expr, sandbox);
  const nombres = ['pzBoostDisponibleCents', 'pzBoostComprometido', 'pzBoostSaldoUSD', 'pzBoostEsMP', 'pzBoostFmtMonto',
    'pzBoostSaldo', 'pzBoostMontos', 'pzBoostTotal', 'pzBoostGate', 'pzBoostPuede', 'pzAdsDiferencia', 'pzAdsBilleteraBloqueHTML'];
  let piezas = '', faltan = [];
  for (const n of nombres) {
    const f = fnFrom(appCode, 'async function ' + n + '(') || fnFrom(appCode, 'function ' + n + '(');
    if (!f) faltan.push(n); else piezas += f + '\n';
  }
  t(faltan.length === 0, '§D: las piezas del cliente extraen enteras del bundle', faltan.join(','));
  if (!faltan.length) {
    enVM('let pzBoostState = null; let pzAdsFilaAbierta = "";');
    enVM('pzAdsBilleteraHTML = () => "";');
    enVM(piezas);
    const seed = (bil, monto) => enVM(`pzBoostState = { elegibles: [], billetera: ${JSON.stringify(bil)}, adsReady: true, motivoGate: '', boostHabilitado: true, adsPermiso: true, conversionPendiente: false, selId: 'p744', selMonto: ${monto} };`);
    // D1: el usuario 12 DESPUÉS de la reparación (saldo 2000,
    // comprometido 2000, disponible 0).
    seed({ balance_cents: 2000, comprometido_cents: 2000, disponible_cents: 0, currency: 'USD', billing_provider: 'stripe', montos_usd: [20, 50, 100] }, 20);
    t(enVM('pzBoostSaldo()') === 0, '§D1: el saldo que se muestra es el DISPONIBLE: US$0');
    const bloque = enVM("pzAdsBilleteraBloqueHTML(true)");
    t(bloque.includes('US$20 en tu impulso activo'), '§D1: la línea dice «US$20 en tu impulso activo»', bloque.slice(0, 300));
    t(bloque.includes('pz-ads-bill-saldo') && bloque.includes('US$0'), '§D1: el número grande de la tarjeta es US$0, no US$22');
    const dif = enVM('pzAdsDiferencia()');
    t(!!dif && dif.saldo === 0 && dif.total === 22 && dif.falta === 22, '§D1: la diferencia se mide contra el disponible: faltan los US$22 enteros para otro impulso de 20', JSON.stringify(dif));
    t(enVM('pzBoostPuede(20)') === false, '§D1: el CTA Impulsar queda frenado por saldo (el mismo freno de siempre, con la cifra verdadera)');
    // D2: el espejo EN.
    enVM("ME.lang = 'en';");
    const bloqueEN = enVM("pzAdsBilleteraBloqueHTML(true)");
    t(bloqueEN.includes('US$20 in your active boost'), '§D2: EN: «US$20 in your active boost» (paridad)');
    enVM("ME.lang = 'es';");
    // D3: sin impulso activo, todo como siempre y SIN la línea.
    seed({ balance_cents: 2200, comprometido_cents: 0, disponible_cents: 2200, currency: 'USD', billing_provider: 'stripe', montos_usd: [20, 50, 100] }, 20);
    t(enVM('pzBoostSaldo()') === 22, '§D3: sin impulso activo el disponible es el saldo entero (US$22)');
    t(!enVM("pzAdsBilleteraBloqueHTML(true)").includes('impulso activo'), '§D3: sin comprometido NO hay línea de impulso activo');
    t(enVM('pzAdsDiferencia()') === null && enVM('pzBoostPuede(20)') === true, '§D3: con disponible que cubre el total, no hay diferencia y el CTA impulsa');
    // D4: servidor viejo a mitad de despliegue (sin los campos
    // nuevos): manda el saldo de siempre, nada se rompe.
    seed({ balance_cents: 2200, currency: 'USD', billing_provider: 'stripe', montos_usd: [20, 50, 100] }, 20);
    t(enVM('pzBoostSaldo()') === 22 && enVM('pzBoostComprometido()') === 0, '§D4: sin comprometido_cents/disponible_cents la pantalla cae al saldo crudo (compatibilidad)');
    // D5: la carga que parcha balance_cents en el lugar no deja el
    // disponible viejo: 2000 de saldo + 2000 comprometido, carga de
    // 2000 → disponible 2000.
    seed({ balance_cents: 2000, comprometido_cents: 2000, disponible_cents: 0, currency: 'USD', billing_provider: 'stripe', montos_usd: [20, 50, 100] }, 20);
    enVM('pzBoostState.billetera.balance_cents = 4000;');
    t(enVM('pzBoostSaldo()') === 20, '§D5: tras el parche en el lugar del saldo (carga), el disponible se lee contra el saldo vigente');
  }

  // ---------- §E: la diferencia del servidor va contra el disponible ----------
  console.log('— §E: POST /api/ads/billetera/cargar — falta contra el DISPONIBLE (expresiones reales del endpoint)');
  const lineasFalta = SRV.split('\n').filter((l) => l.includes('const faltaCents') && l.includes('saldoDisponibleCents'));
  t(lineasFalta.length === 2, '§E: las DOS ramas de la diferencia (ARS y USD) recomputan contra saldoDisponibleCents', String(lineasFalta.length));
  t(!SRV.includes("? Number(wDif.balance_cents || 0) : 0"), '§E: no queda ninguna falta medida contra el saldo crudo (Number(wDif.balance_cents))');
  t(count(SRV, 'adsBilletera.comprometidoEnActivos(db, uid)') === 2, '§E: el comprometido se calcula con el módulo, una vez por rama, para el usuario de la billetera (uid)');
  const exprFalta = (linea) => new Function('difReq', 'wDif', 'objetivoCents', 'adsBilletera', 'db', 'uid', linea + '\nreturn faltaCents;');
  const lineaARS = lineasFalta.find((l) => l.includes('montoImpulsoARS'));
  const lineaUSD = lineasFalta.find((l) => l.includes('objetivoCents'));
  if (lineaARS && lineaUSD) {
    const faltaARS = exprFalta(lineaARS);
    const faltaUSD = exprFalta(lineaUSD);
    { // E1: el usuario 12 DESPUÉS de la reparación — saldo 2000,
      // comprometido 2000 (impulso 25), disponible 0. El cliente le
      // ofrece «cargar los US$22 que faltan» para otro total de 22:
      // el servidor tiene que pedir 2200, no 0 (antes: 409).
      const db = nuevaDB();
      db.prepare('INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (12, 2000, ?)').run('USD');
      db.prepare(`INSERT INTO ad_boosts (id, user_id, post_id, budget_cents, fee_cents, currency, status, created_at)
        VALUES (25, 12, 744, 2000, 200, 'USD', 'active', '2026-11-25 12:00:00')`).run();
      db.prepare(`INSERT INTO ad_transactions (user_id, kind, amount_cents, balance_after, ref) VALUES (12, 'boost_fee', -200, 2000, 'boost_fee:25')`).run();
      const wDif = { currency: 'USD', balance_cents: 2000 };
      const falta = faltaUSD({ montoImpulsoUSD: 22 }, wDif, 2200, ab, db, 12);
      t(falta === 2200, '§E1: usuario 12 (saldo 2000, comprometido 2000, disponible 0): la falta del servidor para el total 2200 es 2200, no 0', String(falta));
    }
    { // E2: sin compromisos, la falta USD es la de siempre
      // (objetivo − saldo): el cambio no mueve ningún otro caso.
      const db = nuevaDB();
      db.prepare('INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (15, 2000, ?)').run('USD');
      const falta = faltaUSD({ montoImpulsoUSD: 22 }, { currency: 'USD', balance_cents: 2000 }, 2200, ab, db, 15);
      t(falta === 200, '§E2: sin impulsos activos, falta USD = objetivo − saldo (2200 − 2000 = 200), idéntica a la de antes', String(falta));
    }
    { // E3: rama ARS con compromiso parcial — billetera ARS 100000,
      // impulso ARS activo con presupuesto 50000 y débito parcial
      // 20000 → comprometido 30000, disponible 70000; para un
      // impulso de $1000 (100000¢) faltan 30000.
      const db = nuevaDB();
      db.prepare('INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (16, 100000, ?)').run('ARS');
      db.prepare(`INSERT INTO ad_boosts (user_id, post_id, budget_cents, fee_cents, currency, status, created_at)
        VALUES (16, 900, 50000, 5000, 'ARS', 'active', '2026-11-26 10:00:00')`).run();
      db.prepare(`INSERT INTO ad_transactions (user_id, kind, amount_cents, balance_after, ref) VALUES (16, 'boost_ars', -20000, 80000, 'boost_ars:u16:p900:5000:2026-11-26')`).run();
      const falta = faltaARS({ montoImpulsoARS: 1000 }, { currency: 'ARS', balance_cents: 100000 }, 0, ab, db, 16);
      t(falta === 30000, '§E3: ARS con compromiso parcial (30000): la falta para $1000 es 30000 (contra el disponible 70000), no 0', String(falta));
    }
    { // E4: rama ARS sin compromisos — falta idéntica a la de antes.
      const db = nuevaDB();
      db.prepare('INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (17, 100000, ?)').run('ARS');
      const falta = faltaARS({ montoImpulsoARS: 1500 }, { currency: 'ARS', balance_cents: 100000 }, 0, ab, db, 17);
      t(falta === 50000, '§E4: ARS sin impulsos activos: falta = 150000 − 100000 = 50000, idéntica a la de antes', String(falta));
    }
  }

  console.log(`\n${pass} ok · ${fail} MAL`);
  if (fail) { console.log('Fallaron:', fails.join(' | ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.log('ERROR de suite:', e); process.exit(2); });
