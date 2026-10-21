// test-care-stub.js — preload de red para test-atencion-wiring.js.
// Intercepta fetch: Instagram Graph + OpenAI quedan simulados y cada
// llamada se registra como JSONL en CARE_STUB_LOG. El resto pasa (con
// timeout corto) o devuelve 503: el harness nunca toca la red real de IG.
'use strict';
const fs = require('fs');
const LOG = process.env.CARE_STUB_LOG || '/tmp/care-stub-log.jsonl';
const realFetch = global.fetch;
function log(entry) {
  try { fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...entry }) + '\n'); } catch (e) {}
}
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
const nowIso = () => new Date().toISOString();

global.fetch = async (url, opts) => {
  const u = String(url || '');
  const method = String((opts && opts.method) || 'GET').toUpperCase();
  try {
    if (u.includes('api.openai.com')) {
      const body = JSON.parse(String((opts && opts.body) || '{}'));
      const msgs = body.messages || [];
      const system = String((msgs[0] && msgs[0].content) || '');
      const user = String((msgs[1] && msgs[1].content) || '');
      log({ kind: 'openai', foundation: system.includes('$15.000'), user: user.slice(0, 120) });
      let content = '¡Hola! Gracias por escribirnos 🙌 Contanos un poco más y te ayudamos.';
      if (user.includes('cuánto sale el corte')) content = '¡Hola! El corte está $15.000. ¿Te reservo un turno?';
      else if (system.includes('seguimiento')) content = '¡Hola Lu! ¿Pudiste ver lo de Corte? Quedó a $15.000. Si querés, te lo dejamos reservado hoy mismo 🙌';
      return json({ choices: [{ message: { content } }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } });
    }
    if (u.includes('graph.instagram.com')) {
      if (method === 'POST' && u.includes('/replies')) {
        const body = JSON.parse(String((opts && opts.body) || '{}'));
        log({ kind: 'ig_reply', message: String(body.message || '') });
        return json({ id: 'ig_reply_1' });
      }
      if (method === 'POST' && u.includes('/messages')) {
        const body = JSON.parse(String((opts && opts.body) || '{}'));
        log({ kind: 'ig_dm', message: String((body.message && body.message.text) || '') });
        return json({ message_id: 'ig_dm_1' });
      }
      if (u.includes('/conversations')) {
        log({ kind: 'ig_conversations' });
        return json({ data: [{
          id: 'conv1',
          participants: { data: [{ id: 'cust1', username: 'lu' }, { id: 'IGT', username: 'pelu.ana' }] },
          messages: { data: [{ id: 'm1', message: 'hola! quiero reservar un corte para el sábado', from: { id: 'cust1', username: 'lu' }, created_time: nowIso() }] },
        }] });
      }
      if (u.includes('/comments')) {
        log({ kind: 'ig_comments' });
        return json({ data: [
          { id: 'c_price', text: '¿cuánto sale el corte?', username: 'juan', timestamp: nowIso(), replies: { data: [] } },
          { id: 'c_hours', text: '¿a qué hora abren?', username: 'ana', timestamp: nowIso(), replies: { data: [] } },
          { id: 'c_queja', text: 'esto es una estafa, pésimo servicio', username: 'pedro', timestamp: nowIso(), replies: { data: [] } },
        ] });
      }
      if (u.includes('/media')) {
        log({ kind: 'ig_media' });
        return json({ data: [{ id: 'media1' }] });
      }
      log({ kind: 'ig_other', url: u.slice(0, 120) });
      return json({ data: [] });
    }
  } catch (e) {
    log({ kind: 'stub_error', error: String(e && e.message || e) });
    return json({ error: 'stub' }, 503);
  }
  try { return await realFetch(url, { ...(opts || {}), signal: AbortSignal.timeout(4000) }); }
  catch (e) { return json({ error: 'offline' }, 503); }
};
