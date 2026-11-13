// test-lote-venty-slice3-cierre-api.js — SLICE 3 CIERRE REAL: rutas con
// boot real. Levanta el scratch con DATA_DIR aislada, registra un usuario,
// canjea el código web y juega el cierre completo por API: config del
// fundamento → partida → cotización → link → pago que no cuadra (no
// cierra, Bandeja) → pago conciliado (cerrada_ganada + reseña en el hilo)
// → agenda con anti no-show disparado por el despachador → no-show.
// Sin credenciales reales; el link de pago es de prueba.
// Uso: node test-lote-venty-slice3-cierre-api.js (NODE_PATH con node_modules)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-slice3-'));
const PORT = 18763;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://ventysalesmanager.com';
const EMAIL = 'venty-slice3@test.com';
const LINK = 'https://link.prueba/negocio-generico';

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function req(method, p, opts = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, ...(opts.headers || {}) };
  const rr = await fetch(BASE + p, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env, DATA_DIR: TMP, PORT: String(PORT),
      ADMIN_TOKEN: '<MASKED_SECRET_001>', SESSION_SECRET: '<MASKED_SECRET_002>',
      WHATSAPP_VERIFY_TOKEN: '<MASKED_SECRET_003>', INSTAGRAM_VERIFY_TOKEN: '<MASKED_SECRET_004>',
      INSTAGRAM_APP_SECRET: '<MASKED_SECRET_005>', VENTY_EMAIL_UNSUB_SECRET: '<MASKED_SECRET_006>',
    },
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', () => {});
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: '<MASKED_SECRET_007>', business_name: 'Negocio Generico Test' }),
    });
    ok(rr.status === 200 || rr.status === 201, `register (${rr.status})`);
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const vwt = require('./venty-web-tokens');
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
    ok(row && row.id, 'usuario registrado en la DB de test');
    const issued = vwt.issueCode(db, row.id, EMAIL);
    const canje = await req('POST', '/api/auth/venty-token', { body: { code: issued.code } });
    ok(canje.status === 200 && /^[0-9a-f]{64}$/.test(canje.data.token || ''), 'canje código → token 200');
    const B = { Authorization: 'Bearer ' + canje.data.token };

    const sinAuth = await req('GET', '/api/venty/cierre/config', {});
    ok(sinAuth.status === 401, 'sin Bearer → cierre/config: 401');

    // --- config de cierre en el fundamento ---
    const cfg0 = await req('GET', '/api/venty/cierre/config', { headers: B });
    ok(cfg0.status === 200 && cfg0.data.cierre.link_pago === '', 'config inicial: sin link (no se inventa)');
    const cfgBad = await req('POST', '/api/venty/cierre/config', { headers: B, body: { token: 'x' } });
    ok(cfgBad.status === 400, 'config con campo secreto → 400');
    const cfg = await req('POST', '/api/venty/cierre/config', { headers: B, body: { link_pago: LINK, proveedor: 'proveedor_prueba', credencial_ref: 'VENTY_PAGO_PRUEBA_REF', umbral_aviso_dueno: 20000, resena_google_url: 'https://resena.prueba/negocio' } });
    ok(cfg.status === 200, 'POST cierre/config 200 (solo ref, sin secreto)');
    const cfg1 = await req('GET', '/api/venty/cierre/config', { headers: B });
    ok(cfg1.data.cierre.link_pago === LINK && cfg1.data.cierre.modo_pago === 'prueba', 'config guardada: link del negocio + modo prueba');

    // --- partida + cotización por el motor existente ---
    const nueva = await req('POST', '/api/venty/simulacion/nueva', { headers: B, body: { cliente_nombre: 'Cliente Cierre', canal: 'simulacion' } });
    ok(nueva.status === 200 && nueva.data.partida_id, 'partida creada');
    const pid = nueva.data.partida_id;
    const cot = await req('POST', '/api/venty/simulacion/mensaje', { headers: B, body: { partida_id: pid, texto: 'hola, cuánto sale el brunch para dos?' } });
    ok(cot.status === 200 && cot.data.cotizacion && cot.data.cotizacion.total === 24000, 'cotización $24.000 desde la lista');

    // --- iniciar el cierre: link dentro de la conversación ---
    const ini = await req('POST', `/api/venty/partidas/${pid}/cierre/iniciar`, { headers: B, body: { tipo: 'total', ahora: '2026-11-12 10:00:00' } });
    ok(ini.status === 200 && ini.data.estado === 'esperando_pago', 'POST cierre/iniciar → esperando_pago');
    ok((ini.data.mensajes || []).some((m) => m === LINK), 'el link del negocio salió en la conversación');
    const pagos0 = await req('GET', `/api/venty/cierre/pagos?partida_id=${pid}`, { headers: B });
    ok(pagos0.data.pagos.length === 1 && pagos0.data.pagos[0].monto_esperado === 24000 && pagos0.data.pagos[0].modo === 'prueba', 'pago registrado: esperado 24000, modo prueba');

    // --- pago que no cuadra: no cierra y escala ---
    const mal = await req('POST', `/api/venty/partidas/${pid}/pago/registrar`, { headers: B, body: { monto: 1000, titular: 'Cliente Cierre', referencia: 'mal-1' } });
    ok(mal.status === 400 && mal.data.kind === 'no_cuadra', 'pago que no cuadra → 400 no_cuadra');
    const pTrasMal = await req('GET', `/api/venty/partidas/${pid}`, { headers: B });
    ok(pTrasMal.data.partida.estado === 'esperando_pago', 'la partida no cerró con el pago malo');
    const bandeja = await req('GET', '/api/venty/bandeja', { headers: B });
    ok((bandeja.data.jugadas || []).some((j) => j.tipo === 'pago_no_cuadra'), 'Bandeja: jugada pago_no_cuadra visible por API');

    // --- pago conciliado: cierra solo, aviso y reseña ---
    const bien = await req('POST', `/api/venty/partidas/${pid}/pago/registrar`, { headers: B, body: { monto: 24000, titular: 'Cliente Cierre', referencia: 'ok-1', ahora: '2026-11-12 10:10:00' } });
    ok(bien.status === 200 && bien.data.conciliado === true && bien.data.estado_partida === 'cerrada_ganada', 'pago conciliado → cerrada_ganada sin intervención');
    ok(bien.data.aviso_dueno === true, 'pago >= umbral → aviso al dueño');
    ok(bien.data.resena && bien.data.resena.ok === true, 'reseña pedida al cerrar');
    const pFin = await req('GET', `/api/venty/partidas/${pid}`, { headers: B });
    ok(pFin.data.partida.estado === 'cerrada_ganada' && pFin.data.partida.monto === 24000, 'partida cerrada con su monto');
    ok((pFin.data.partida.mensajes || []).some((m) => m.autor === 'venty' && m.texto.includes('reseña en google')), 'el pedido de reseña está en el hilo de la partida');
    const otraResena = await req('POST', `/api/venty/partidas/${pid}/resena/pedir`, { headers: B, body: {} });
    ok(otraResena.status === 400 && otraResena.data.kind === 'resena_ya_pedida', 'reseña dos veces → resena_ya_pedida');

    // --- agenda anti no-show por API ---
    const nueva2 = await req('POST', '/api/venty/simulacion/nueva', { headers: B, body: { cliente_nombre: 'Cliente Turno', canal: 'simulacion' } });
    const pid2 = nueva2.data.partida_id;
    const turno = await req('POST', '/api/venty/agenda/turnos', { headers: B, body: { partida_id: pid2, inicio_at: '2026-11-15 10:00:00', ahora: '2026-11-12 09:00:00' } });
    ok(turno.status === 200 && turno.data.turno.estado === 'confirmado' && turno.data.trabajos.length === 3, 'turno creado con sus 3 trabajos');
    const turnoId = turno.data.turno.id;
    const proc = await req('POST', '/api/venty/agenda/procesar', { headers: B, body: { ahora: '2026-11-14 10:00:01' } });
    ok(proc.status === 200 && proc.data.disparados.some((d) => d.turno_id === turnoId && d.tipo === 'recordatorio_dia_anterior'), 'despachador: recordatorio del día anterior disparado');
    const pTurno = await req('GET', `/api/venty/partidas/${pid2}`, { headers: B });
    ok((pTurno.data.partida.mensajes || []).some((m) => m.texto.includes('mañana')), 'el recordatorio llegó a la conversación');
    const ns = await req('POST', `/api/venty/agenda/turnos/${turnoId}/no-show`, { headers: B, body: { ahora: '2026-11-15 11:00:00' } });
    ok(ns.status === 200 && ns.data.turno.estado === 'no_show', 'no-show registrado por API');
    const turnos = await req('GET', '/api/venty/agenda/turnos?estado=no_show', { headers: B });
    ok((turnos.data.turnos || []).some((t) => t.id === turnoId), 'GET agenda/turnos filtra el no-show');

    // --- escalación general por API ---
    const nueva3 = await req('POST', '/api/venty/simulacion/nueva', { headers: B, body: { cliente_nombre: 'Cliente Queja', canal: 'simulacion' } });
    const pid3 = nueva3.data.partida_id;
    const esc = await req('POST', `/api/venty/partidas/${pid3}/escalar`, { headers: B, body: { tipo: 'plata_sensible', resumen: 'pidió un reembolso por un cobro duplicado', jugada_recomendada: 'revisar el comprobante y definir el reembolso' } });
    ok(esc.status === 200 && esc.data.estado === 'escalada', 'POST escalar → partida escalada');
    const bandeja2 = await req('GET', '/api/venty/bandeja', { headers: B });
    ok((bandeja2.data.jugadas || []).some((j) => j.tipo === 'escalacion' && j.propuesta.tipo === 'plata_sensible'), 'Bandeja: escalación plata_sensible con su tipo');

    db.close();
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n— venty-slice3-cierre (api): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
