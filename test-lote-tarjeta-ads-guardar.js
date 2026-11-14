'use strict';
/* test-lote-tarjeta-ads-guardar.js — 💳 LOTE TARJETA-ADS-GUARDAR (v1055)
 *
 * El form inline de Ads abría bien pero al guardar la tarjeta el servidor
 * devolvía 500 con el motivo genérico 'adjuntar_fallido' y la app mostraba
 * «No se pudo guardar la tarjeta». Causa: `adjuntarTarjeta` no tenía el
 * reintento «No such customer» que sí tiene `createSetupSession` — un
 * `stripe_customer_id` guardado e inválido en Stripe (borrado, o de otro
 * modo) hacía fallar el attach siempre, sin auto-cura.
 *
 * El lote: (1) reintento en `adjuntarTarjeta` (limpia el id guardado,
 * recrea el customer, reintenta el attach UNA vez — espejo de
 * createSetupSession); (2) motivo honesto en el endpoint
 * (`motivoAdjuntarError`: cliente_no_existe / payment_method_no_existe /
 * adjuntar_fallido, sin exponer el mensaje crudo de Stripe); (3) textos
 * ES/EN para los dos motivos nuevos en `pzTarjetaMotivo`.
 *
 * SIN llamadas reales a Stripe: cliente falso inyectado + DB en memoria
 * (node:sqlite, mismo patrón que test-stripe-billing.js).
 * Corre con: node test-lote-tarjeta-ads-guardar.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0;
let total = 0;
function ok(cond, msg) { total++; if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }

delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_PUBLISHABLE_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

const sb = require('./stripe-billing');

function memDb(storedCustomerId) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, stripe_customer_id TEXT DEFAULT \'\');');
  db.prepare('INSERT INTO users (id, email, stripe_customer_id) VALUES (?,?,?)')
    .run(12, 'valentino_bamboo@hotmail.com', storedCustomerId || '');
  return db;
}
function storedCustomer(db) {
  return db.prepare('SELECT stripe_customer_id FROM users WHERE id=?').get(12).stripe_customer_id;
}

// Cliente falso configurable por test. Cada hook recibe el intento y puede
// tirar (para guionar el fallo) o devolver el valor.
function makeFake(cfg) {
  cfg = cfg || {};
  const calls = { attach: [], retrieve: [], customersList: 0, customersCreate: 0, customersUpdate: [] };
  const attached = Object.assign({}, cfg.preAttached || {});
  return {
    _calls: calls,
    customers: {
      list: async () => { calls.customersList++; return { data: cfg.listCustomers || [] }; },
      create: async (p) => {
        calls.customersCreate++;
        return { id: cfg.createCustomerId || ('cus_nuevo_' + calls.customersCreate), ...p };
      },
      update: async (id, patch) => { calls.customersUpdate.push({ id, patch }); return { id }; },
    },
    paymentMethods: {
      attach: async (pmId, { customer }) => {
        calls.attach.push({ pmId, customer });
        if (cfg.attachThrow) {
          const e = cfg.attachThrow({ pmId, customer, n: calls.attach.length });
          if (e) throw e;
        }
        attached[pmId] = customer;
        return { id: pmId, customer };
      },
      retrieve: async (pmId) => {
        calls.retrieve.push(pmId);
        if (cfg.retrieveThrow) {
          const e = cfg.retrieveThrow({ pmId, n: calls.retrieve.length });
          if (e) throw e;
        }
        if (cfg.retrieve) return cfg.retrieve({ pmId });
        return { id: pmId, customer: attached[pmId] || null, card: { brand: 'visa', last4: '4242' } };
      },
    },
  };
}

async function main() {
  section('A · motivoAdjuntarError: el motivo honesto, sin el mensaje crudo');
  ok(sb.motivoAdjuntarError(new Error("No such customer: 'cus_viejo'")) === 'cliente_no_existe',
    "«No such customer» → 'cliente_no_existe'");
  ok(sb.motivoAdjuntarError(new Error("No such payment_method: 'pm_x'")) === 'payment_method_no_existe',
    "«No such payment_method» → 'payment_method_no_existe'");
  ok(sb.motivoAdjuntarError(new Error('Something else broke')) === 'adjuntar_fallido',
    'error genérico → \'adjuntar_fallido\' (como hoy)');
  ok(sb.motivoAdjuntarError(null) === 'adjuntar_fallido', 'error nulo → \'adjuntar_fallido\'');
  ok(sb.motivoAdjuntarError(undefined) === 'adjuntar_fallido', 'error undefined → \'adjuntar_fallido\'');
  ok(sb.motivoAdjuntarError(new Error('no such CUSTOMER: cus')) === 'cliente_no_existe',
    'el match no distingue mayúsculas/minúsculas');
  ok(sb.motivoAdjuntarError(new Error("No such customer: 'cus_x' (y el PM tampoco existe)")) === 'cliente_no_existe',
    'si el mensaje trae ambas, manda el customer (se chequea primero)');

  section('B1 · camino feliz: customer válido, sin reintento ni limpieza');
  {
    const db = memDb('cus_ok');
    const fake = makeFake({});
    const out = await sb.adjuntarTarjeta(db, fake, { id: 12, email: 'valentino_bamboo@hotmail.com', stripe_customer_id: 'cus_ok' }, 'pm_abc123');
    ok(out.customerId === 'cus_ok' && out.brand === 'visa' && out.last4 === '4242',
      'devuelve customerId + brand + last4 del PM');
    ok(fake._calls.attach.length === 1 && fake._calls.attach[0].customer === 'cus_ok',
      'un solo attach, al customer guardado');
    ok(fake._calls.customersCreate === 0, 'no crea customer nuevo');
    ok(storedCustomer(db) === 'cus_ok', 'el id guardado no se toca');
    ok(fake._calls.customersUpdate.length === 1
      && fake._calls.customersUpdate[0].patch.invoice_settings.default_payment_method === 'pm_abc123',
      'la tarjeta queda como default del customer');
  }

  section('B2 · customer guardado inválido: el reintento lo cura (el caso de Valentino)');
  {
    const db = memDb('cus_viejo');
    const fake = makeFake({
      createCustomerId: 'cus_nuevo',
      attachThrow: ({ customer }) => (customer === 'cus_viejo'
        ? new Error("No such customer: 'cus_viejo'") : null),
    });
    const out = await sb.adjuntarTarjeta(db, fake, { id: 12, email: 'valentino_bamboo@hotmail.com', stripe_customer_id: 'cus_viejo' }, 'pm_abc123');
    ok(out.customerId === 'cus_nuevo' && out.brand === 'visa' && out.last4 === '4242',
      'el reintento adjunta al customer nuevo y devuelve sus datos');
    ok(fake._calls.attach.length === 2
      && fake._calls.attach[0].customer === 'cus_viejo'
      && fake._calls.attach[1].customer === 'cus_nuevo',
      'dos attach: primero al viejo (falla), después al nuevo (pasa)');
    ok(fake._calls.customersCreate === 1, 'crea UN customer nuevo');
    ok(storedCustomer(db) === 'cus_nuevo',
      'el id guardado se limpió y se re-guardó con el nuevo (la próxima vez no vuelve a fallar)');
    ok(fake._calls.customersUpdate.length === 1 && fake._calls.customersUpdate[0].id === 'cus_nuevo',
      'la default se fija sobre el customer nuevo, no sobre el viejo');
  }

  section('B3 · PM de otro modo: NO hay reintento, el motivo es payment_method_no_existe');
  {
    const db = memDb('cus_ok');
    const fake = makeFake({
      attachThrow: () => new Error("No such payment_method: 'pm_abc123'"),
      retrieveThrow: () => new Error("No such payment_method: 'pm_abc123'"),
    });
    let err = null;
    try {
      await sb.adjuntarTarjeta(db, fake, { id: 12, email: 'valentino_bamboo@hotmail.com', stripe_customer_id: 'cus_ok' }, 'pm_abc123');
    } catch (e) { err = e; }
    ok(err && /No such payment_method/i.test(err.message), 'tira el error del PM (no lo traga)');
    ok(sb.motivoAdjuntarError(err) === 'payment_method_no_existe',
      'el motivo del error es \'payment_method_no_existe\' (el tablero lo distingue del genérico)');
    ok(fake._calls.attach.length === 1, 'UN solo attach: el PM malo no dispara el reintento de customer');
    ok(fake._calls.customersCreate === 0, 'no crea customer nuevo');
    ok(storedCustomer(db) === 'cus_ok', 'el id guardado no se limpia (el problema no es el customer)');
  }

  section('B4 · otro error cualquiera: NO hay reintento y tira el original');
  {
    const db = memDb('cus_ok');
    const fake = makeFake({ attachThrow: () => new Error('card declined by issuer') });
    let err = null;
    try {
      await sb.adjuntarTarjeta(db, fake, { id: 12, email: 'valentino_bamboo@hotmail.com', stripe_customer_id: 'cus_ok' }, 'pm_abc123');
    } catch (e) { err = e; }
    ok(err && /card declined/i.test(err.message), 'tira el error original');
    ok(fake._calls.attach.length === 1, 'un solo attach, sin reintento');
    ok(fake._calls.customersCreate === 0, 'no crea customer nuevo');
    ok(storedCustomer(db) === 'cus_ok', 'el id guardado no se toca');
    ok(sb.motivoAdjuntarError(err) === 'adjuntar_fallido', 'el motivo sigue siendo el genérico');
  }

  section('B5 · reenvío del mismo form: PM ya adjunto a este customer, se sigue igual');
  {
    const db = memDb('cus_ok');
    const fake = makeFake({
      preAttached: { pm_abc123: 'cus_ok' },
      attachThrow: () => new Error('This payment method is already attached to this customer'),
    });
    const out = await sb.adjuntarTarjeta(db, fake, { id: 12, email: 'valentino_bamboo@hotmail.com', stripe_customer_id: 'cus_ok' }, 'pm_abc123');
    ok(out.customerId === 'cus_ok' && out.last4 === '4242',
      'el reenvío no tira: el PM ya estaba adjunto a este customer');
    ok(fake._calls.customersCreate === 0, 'no crea customer nuevo ni limpia nada');
    ok(storedCustomer(db) === 'cus_ok', 'el id guardado no se toca');
  }

  section('B6 · el reintento también falla (doble falta): tira el error del reintento, el más fresco');
  {
    const db = memDb('cus_viejo');
    const fake = makeFake({
      createCustomerId: 'cus_nuevo',
      attachThrow: ({ customer }) => (customer === 'cus_viejo'
        ? new Error("No such customer: 'cus_viejo'")
        : new Error("No such payment_method: 'pm_abc123'")),
      retrieveThrow: () => new Error("No such payment_method: 'pm_abc123'"),
    });
    let err = null;
    try {
      await sb.adjuntarTarjeta(db, fake, { id: 12, email: 'valentino_bamboo@hotmail.com', stripe_customer_id: 'cus_viejo' }, 'pm_abc123');
    } catch (e) { err = e; }
    ok(err && /No such payment_method/i.test(err.message),
      'tira el error del reintento (el PM), no el del customer viejo');
    ok(sb.motivoAdjuntarError(err) === 'payment_method_no_existe',
      'el motivo apunta al PM: el customer viejo ya quedó curado por el reintento');
    ok(fake._calls.attach.length === 2, 'exactamente dos attach: intento + UN reintento');
    ok(storedCustomer(db) === 'cus_nuevo',
      'el id guardado quedó con el customer nuevo aunque el attach falló (el puntero viejo está curado)');
  }

  section('B7 · validación: PM inválido no toca Stripe');
  {
    const db = memDb('cus_ok');
    const fake = makeFake({});
    let err = null;
    try {
      await sb.adjuntarTarjeta(db, fake, { id: 12, email: 'valentino_bamboo@hotmail.com', stripe_customer_id: 'cus_ok' }, 'xxx');
    } catch (e) { err = e; }
    ok(err && /PaymentMethod inválido/i.test(err.message), 'PM sin formato pm_* → error limpio');
    ok(fake._calls.attach.length === 0 && fake._calls.customersCreate === 0, 'cero llamadas a Stripe');
  }

  section('B8 · sin customer guardado: crea uno y adjunta (camino de cuenta nueva)');
  {
    const db = memDb('');
    const fake = makeFake({ createCustomerId: 'cus_primero' });
    const out = await sb.adjuntarTarjeta(db, fake, { id: 12, email: 'valentino_bamboo@hotmail.com', stripe_customer_id: '' }, 'pm_abc123');
    ok(out.customerId === 'cus_primero', 'crea el customer y adjunta ahí');
    ok(storedCustomer(db) === 'cus_primero', 'el customer nuevo queda guardado');
    ok(fake._calls.customersList === 1, 'primero busca un customer existente por email (anti-duplicado)');
  }

  section('C · cableado: motivos nuevos en el cliente y en el endpoint');
  {
    const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    ok(appJs.includes("cliente_no_existe: gzT('No encontramos tu cuenta de pago."),
      'app.js: pzTarjetaMotivo tiene cliente_no_existe en español');
    ok(appJs.includes("payment_method_no_existe: gzT('Esa tarjeta no se pudo verificar."),
      'app.js: pzTarjetaMotivo tiene payment_method_no_existe en español');
    ok(appJs.includes("couldn\\'t find your billing account"),
      'app.js: el texto EN de cliente_no_existe está escapado (sin el escape, node --check falla)');
    ok(appJs.includes("couldn\\'t be verified"),
      'app.js: el texto EN de payment_method_no_existe está escapado');
    const check = spawnSync(process.execPath, ['--check', path.join(__dirname, 'public', 'app.js')], { encoding: 'utf8' });
    ok(check.status === 0, 'app.js pasa node --check (los apóstrofes escapados no rompen la sintaxis)');
    const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    ok(serverJs.includes('motivoAdjuntarError(e)'),
      'server.js: el catch del endpoint usa motivoAdjuntarError (no el genérico fijo)');
    ok(!/Error adjuntando tarjeta[\s\S]{0,200}motivo: 'adjuntar_fallido'/.test(serverJs),
      'server.js: el catch ya no responde siempre adjuntar_fallido');
  }

  section('D · estampado v1055 y ?v=721');
  {
    const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    ok(/const BUILD_ID = '20261105-v1055';/.test(serverJs), 'server.js: BUILD_ID v1055');
    ok(!serverJs.includes('20261105-v1054'), 'server.js: no queda rastro de v1054');
    const indexEs = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    ok((indexEs.match(/app\.js\?v=721/g) || []).length === 1, 'index ES: app.js?v=721 exactamente 1 vez');
    ok(indexEs.includes('styles.css?v=20261282'), 'index ES: styles?v= 20261282 sin cambio (el lote no toca styles.css)');
    const indexEn = fs.readFileSync(path.join(__dirname, 'public', 'en', 'index.html'), 'utf8');
    ok(!indexEn.includes('app.js?v='), 'index EN: sigue sin app.js?v= (como siempre)');
    ok(indexEn.includes('styles.css?v=20261282'), 'index EN: styles?v= 20261282 sin cambio');
    const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    ok(appJs.includes("const CHUNK_V = '20261105-v1046';"), 'app.js: CHUNK_V v1046 sin cambio (ningún chunk tocado)');
  }

  console.log('\nTOTAL: ' + (total - fails) + '/' + total + (fails ? ' — ' + fails + ' FALLOS' : ' TODO VERDE'));
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error('CRASH de la suite:', e); process.exit(1); });
