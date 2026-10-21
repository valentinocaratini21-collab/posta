// payment-close.js — Cierre de ventas con link de pago o seña (Atención al
// cliente, plan Total) + configuración de atención por cuenta.
//
// (2026-10-20, build Atención Total) La promesa vendida: "cierre con link
// de pago o seña cuando el rubro lo permite". El mecanismo es deliberadamente
// tonto y seguro: el link sale de la CONFIGURACIÓN del negocio (su link de
// Mercado Pago / Stripe / lo que use) y la seña sale de las instrucciones
// que el propio negocio definió. NADA se genera ni se inventa: sin link ni
// medio de seña configurados, el cierre NO se arma y escala a humano.
//
// care_config guarda además la POLÍTICA DE ENVÍO de la cuenta:
//   send_policy = 'approval' — REGLA FIJA DEL PRODUCTO (decisión de
//                 Valentino, 2026-10-20 15:27 EDT): el dueño aprueba CADA
//                 respuesta con un toque antes de que salga, en TODOS los
//                 planes incluido el Total. Posty prepara la respuesta al
//                 instante; lo sensible escala a humano. NO es un flag
//                 configurable: no existe modo autopilot y setCareConfig
//                 rechaza cualquier intento de cambiarlo.
//
// Exporta: { ensureTable, getCareConfig, setCareConfig, buildClose,
//   closeForUser, SEND_POLICIES }
'use strict';

// Regla fija del producto (Valentino, 2026-10-20): SOLO existe 'approval'.
// No hay autopilot en atención al cliente, en ningún plan.
const SEND_POLICY = 'approval';
const SEND_POLICIES = [SEND_POLICY];

function ensureTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS care_config (
      user_id INTEGER PRIMARY KEY,
      payment_link TEXT DEFAULT '',
      deposit_instructions TEXT DEFAULT '',
      send_policy TEXT DEFAULT 'approval',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) { /* defensivo, mismo patrón que client-digest.ensureTable */ }
}

const DEFAULT_CONFIG = { payment_link: '', deposit_instructions: '', send_policy: 'approval' };

function getCareConfig(db, userId) {
  ensureTable(db);
  try {
    const r = db.prepare('SELECT payment_link, deposit_instructions, send_policy FROM care_config WHERE user_id = ?').get(userId);
    if (!r) return { ...DEFAULT_CONFIG };
    return {
      payment_link: String(r.payment_link || ''),
      deposit_instructions: String(r.deposit_instructions || ''),
      // Fija por regla de producto: aunque una fila vieja dijera otra cosa,
      // la política efectiva es SIEMPRE aprobación del dueño.
      send_policy: SEND_POLICY,
    };
  } catch (e) { return { ...DEFAULT_CONFIG }; }
}

// Un link de pago SOLO puede ser una URL http/https bien formada que cargó
// el negocio. Cualquier otra cosa se rechaza: mejor sin link que con basura.
function validPaymentLink(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  return s.slice(0, 500);
}

function setCareConfig(db, userId, patch) {
  ensureTable(db);
  const cur = getCareConfig(db, userId);
  const next = { ...cur };
  const p = patch || {};
  if (p.payment_link !== undefined || p.paymentLink !== undefined) {
    const v = validPaymentLink(p.payment_link !== undefined ? p.payment_link : p.paymentLink);
    if (v === null) throw new Error('payment_link inválido: tiene que ser una URL http/https completa');
    next.payment_link = v;
  }
  if (p.deposit_instructions !== undefined || p.depositInstructions !== undefined) {
    next.deposit_instructions = String(
      p.deposit_instructions !== undefined ? p.deposit_instructions : p.depositInstructions
    ).slice(0, 400);
  }
  if (p.send_policy !== undefined || p.sendPolicy !== undefined) {
    const v = String(p.send_policy !== undefined ? p.send_policy : p.sendPolicy);
    if (v !== SEND_POLICY) {
      throw new Error('send_policy es una regla fija del producto: el dueño aprueba cada respuesta con un toque antes de que salga (sin autopilot, en todos los planes)');
    }
    next.send_policy = SEND_POLICY;
  }
  db.prepare(
    `INSERT INTO care_config (user_id, payment_link, deposit_instructions, send_policy, updated_at)
     VALUES (?,?,?,?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET payment_link=excluded.payment_link,
       deposit_instructions=excluded.deposit_instructions, send_policy=excluded.send_policy,
       updated_at=datetime('now')`
  ).run(userId, next.payment_link, next.deposit_instructions, next.send_policy);
  return getCareConfig(db, userId);
}

// Arma el mensaje de cierre. Reglas duras:
// - El link sale SOLO de config.payment_link, textual.
// - Precio/ítem solo aparecen si el caller los pasa (y el caller los saca
//   del fundamento: ver suggestReply/foundationFacts en generator.js).
// - Sin link y sin instrucciones de seña → { ok:false, needsHuman:true }.
function buildClose(opts) {
  const o = opts || {};
  const config = o.config || {};
  const nombre = String(o.customerName || '').trim().split(' ')[0];
  const item = String(o.itemName || '').trim();
  const precio = String(o.price || '').trim();
  const monto = precio ? ` (${precio})` : '';

  const link = validPaymentLink(config.payment_link);
  const sena = String(config.deposit_instructions || '').trim();
  // Espejo EN según el idioma de la cuenta (cableado 2026-10-21).
  if (o.lang === 'en') {
    const hi = nombre ? `Hi ${nombre}!` : 'Hi there!';
    const forItem = item ? ` for ${item}` : '';
    if (link) {
      return {
        ok: true, via: 'payment_link', needsHuman: false,
        message: `${hi} To complete your purchase${forItem}${monto}, you can pay from this link: ${link} — any questions, just tell me 🙌`.slice(0, 500),
      };
    }
    if (sena) {
      return {
        ok: true, via: 'deposit', needsHuman: false,
        message: `${hi} To book${forItem}${monto}, the deposit works like this: ${sena} — whenever you are ready we will confirm it 🙌`.slice(0, 500),
      };
    }
  }
  const saludo = nombre ? `¡Hola ${nombre}!` : '¡Hola!';
  const detalle = item ? ` por ${item}` : '';
  if (link) {
    return {
      ok: true, via: 'payment_link', needsHuman: false,
      message: `${saludo} Para cerrar tu compra${detalle}${monto}, podés pagar desde este link: ${link} — cualquier duda me decís 🙌`.slice(0, 500),
    };
  }
  if (sena) {
    return {
      ok: true, via: 'deposit', needsHuman: false,
      message: `${saludo} Para reservar${detalle}${monto}, la seña se hace así: ${sena} — cuando quieras lo dejamos confirmado 🙌`.slice(0, 500),
    };
  }
  return {
    ok: false, via: null, needsHuman: true,
    reason: 'sin_link_de_pago_ni_sena_configurados',
    message: '',
  };
}

// Atajo: lee la config de la cuenta y arma el cierre.
function closeForUser(db, userId, opts) {
  return buildClose({ ...(opts || {}), config: getCareConfig(db, userId) });
}

module.exports = {
  ensureTable, getCareConfig, setCareConfig, buildClose, closeForUser,
  SEND_POLICIES, SEND_POLICY, validPaymentLink,
};
