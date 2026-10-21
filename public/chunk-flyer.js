// chunk-flyer.js — 🎉 MODO FLYER (v315, 2026-10-21): alta del evento en
// un toque para boliches. Se carga lazy desde el bloque semanal del
// álbum (botón #flyerBtn en app.js, solo cuentas de rubro boliche) con
// loadChunk('flyer'). El dueño carga los datos REALES de su fiesta y
// Posty devuelve el paquete completo como borradores en la Agenda
// (flyer.js): flyer de feed + historia + cuenta regresiva. Ningún dato
// se inventa: lo que no se carga, no sale en el flyer.
// Textos ES/EN según ME.lang (espejo de cuentas, regla de la casa).
(function () {
  'use strict';
  const en = () => (typeof ME !== 'undefined' && ME && ME.lang === 'en');
  const T = () => en() ? {
    title: '🎉 Party flyer',
    intro: 'Load your party’s real details and Posty builds the full package as drafts in your Schedule: the feed flyer, the story version and the countdown stories. Whatever you don’t fill in simply doesn’t appear — nothing is made up.',
    fiesta: 'Party name', fiestaPh: 'e.g. Halloween',
    fromDigest: 'Your parties from your profile — tap one:',
    fecha: 'Date (as it should read)', fechaPh: 'e.g. Saturday, October 31',
    fechaISO: 'Exact day (for the countdown)', optional: 'optional',
    lineup: 'Who’s playing (lineup)', lineupPh: 'e.g. DJ Luna, Marco Vélez',
    apertura: 'Doors', aperturaPh: 'e.g. 12:30 AM',
    entradas: 'Tickets', entradasPh: 'e.g. Presale at the link in bio',
    promo: 'Bar deal (only if it’s real)', promoPh: 'e.g. 2-for-1 at the bar until 1 AM',
    edad: 'This is an 18+ event',
    estilo: 'Flyer style',
    make: '🎉 Build the flyer package',
    need: 'The party name and its date are the minimum — everything else can stay empty.',
    working: 'Posty is building your flyer package 🎨 It can take a minute or two — you can close this: the drafts will show up in your Schedule on their own.',
    done: '✅ Done! The flyer package is in your Schedule as drafts: feed flyer, story and countdown — ready for your OK.',
    seeSchedule: 'See it in my Schedule',
    failed: '😅 The package couldn’t be built.',
    retry: 'Try again', close: 'Close',
  } : {
    title: '🎉 Flyer de fiesta',
    intro: 'Cargá los datos reales de tu fiesta y Posty arma el paquete completo como borradores en tu Agenda: el flyer de feed, la versión historia y la cuenta regresiva. Lo que no completes, no sale — nada se inventa.',
    fiesta: 'Nombre de la fiesta', fiestaPh: 'ej: Halloween',
    fromDigest: 'Tus fiestas según tu perfil — tocá una:',
    fecha: 'Fecha (como tiene que leerse)', fechaPh: 'ej: sábado 31 de octubre',
    fechaISO: 'El día exacto (para la cuenta regresiva)', optional: 'opcional',
    lineup: 'Quién toca (lineup)', lineupPh: 'ej: DJ Luna, Marco Vélez',
    apertura: 'Apertura', aperturaPh: 'ej: 00:30',
    entradas: 'Entradas', entradasPh: 'ej: anticipadas en el link de la bio',
    promo: 'Promo de barra (solo si es real)', promoPh: 'ej: 2x1 en barra hasta la 1',
    edad: 'Es un evento +18',
    estilo: 'Estilo del flyer',
    make: '🎉 Armar el paquete de flyers',
    need: 'El nombre de la fiesta y su fecha son el mínimo — todo lo demás puede quedar vacío.',
    working: 'Posty está armando tu paquete de flyers 🎨 Puede tardar un par de minutos — podés cerrar esto: los borradores aparecen solos en tu Agenda.',
    done: '✅ ¡Listo! El paquete quedó en tu Agenda como borradores: flyer de feed, historia y cuenta regresiva — listos para tu OK.',
    seeSchedule: 'Verlo en mi Agenda',
    failed: '😅 El paquete no se pudo armar.',
    retry: 'Probar de nuevo', close: 'Cerrar',
  };
  const escF = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  let pollTimer = null;
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function closeSheet() { stopPoll(); const ov = document.getElementById('flyerSheetOv'); if (ov) ov.remove(); }
  function setBody(html) { const b = document.getElementById('flyerSheetBody'); if (b) b.innerHTML = html; }

  function poll(jobId) {
    stopPoll();
    const t = T();
    pollTimer = setInterval(async () => {
      let d = null;
      try { d = await api.get('/api/flyer/jobs/' + jobId); } catch (e) {}
      if (!d || !d.ok) return;
      if (d.status === 'done') {
        stopPoll();
        setBody(`<div style="font-size:15px;line-height:1.45">${t.done}</div>
          <button type="button" class="btn btn-primary btn-block" id="flyerGoSchedule" style="margin-top:14px">${t.seeSchedule}</button>
          <button type="button" class="btn btn-soft btn-block" id="flyerClose2" style="margin-top:8px">${t.close}</button>`);
        const go = document.getElementById('flyerGoSchedule');
        if (go) go.onclick = () => { closeSheet(); try { location.hash = '#/app/schedule'; } catch (e) {} try { render(); } catch (e) {} };
        const c2 = document.getElementById('flyerClose2');
        if (c2) c2.onclick = closeSheet;
      } else if (d.status === 'failed') {
        stopPoll();
        setBody(`<div style="font-size:15px;line-height:1.45">${t.failed}${d.error ? ` (${escF(d.error)})` : ''}</div>
          <button type="button" class="btn btn-primary btn-block" id="flyerRetry" style="margin-top:14px">${t.retry}</button>`);
        const rt = document.getElementById('flyerRetry');
        if (rt) rt.onclick = () => { closeSheet(); openFlyerSheet(); };
      }
    }, 4000);
  }

  const field = (id, label, ph, type, extra) => `
    <label style="display:block;font-size:13.5px;font-weight:700;margin-top:12px">${label}</label>
    <input id="${id}" type="${type || 'text'}" placeholder="${escF(ph || '')}" ${extra || ''}
      style="width:100%;box-sizing:border-box;padding:11px 12px;border:1.5px solid #D8E2EC;border-radius:10px;font-size:15px;margin-top:5px">`;

  async function openFlyerSheet() {
    const t = T();
    closeSheet();
    const ov = document.createElement('div');
    ov.id = 'flyerSheetOv';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,30,51,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML = `<div style="background:#fff;width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:19px"><b>${t.title}</b></div>
        <button type="button" id="flyerClose0" class="btn btn-soft btn-sm">${t.close}</button>
      </div>
      <div id="flyerSheetBody" style="margin-top:10px"><div style="font-size:15px">…</div></div>
    </div>`;
    document.body.appendChild(ov);
    const c0 = document.getElementById('flyerClose0');
    if (c0) c0.onclick = closeSheet;

    let meta = { styles: [], fiestas: [], boliche: true };
    try { const m = await api.get('/api/flyer/meta'); if (m && m.ok) meta = m; } catch (e) {}
    const chips = (meta.fiestas || []).length
      ? `<div style="font-size:13px;margin-top:12px;opacity:.85">${t.fromDigest}</div>
         <div style="margin-top:6px">${meta.fiestas.map((f) => `<button type="button" class="btn btn-soft btn-sm flyerFiestaChip" data-f="${escF(f)}" style="margin:2px 4px 2px 0">${escF(f)}</button>`).join('')}</div>`
      : '';
    setBody(`
      <div style="font-size:14.5px;line-height:1.45">${t.intro}</div>
      ${chips}
      ${field('flyFiesta', t.fiesta, t.fiestaPh)}
      ${field('flyFecha', t.fecha, t.fechaPh)}
      ${field('flyFechaISO', t.fechaISO + ' (' + t.optional + ')', '', 'date')}
      ${field('flyLineup', t.lineup, t.lineupPh)}
      ${field('flyApertura', t.apertura, t.aperturaPh)}
      ${field('flyEntradas', t.entradas, t.entradasPh)}
      ${field('flyPromo', t.promo, t.promoPh)}
      <label style="display:flex;gap:8px;align-items:center;font-size:14.5px;margin-top:14px">
        <input type="checkbox" id="flyEdad" checked style="width:18px;height:18px"> ${t.edad}
      </label>
      <label style="display:block;font-size:13.5px;font-weight:700;margin-top:12px">${t.estilo}</label>
      <select id="flyEstilo" style="width:100%;box-sizing:border-box;padding:11px 12px;border:1.5px solid #D8E2EC;border-radius:10px;font-size:15px;margin-top:5px">
        <option value="">${en() ? 'Posty picks by the party theme' : 'Posty elige según la fiesta'}</option>
        ${(meta.styles || []).map((s) => `<option value="${escF(s.key)}">${escF(s.name)}</option>`).join('')}
      </select>
      <div id="flyerFormMsg" style="font-size:13.5px;color:#B3261E;margin-top:10px"></div>
      <button type="button" class="btn btn-primary btn-block" id="flyerMake" style="margin-top:14px">${t.make}</button>`);

    document.querySelectorAll('.flyerFiestaChip').forEach((b) => {
      b.onclick = () => { const i = document.getElementById('flyFiesta'); if (i) i.value = b.getAttribute('data-f') || ''; };
    });
    const mk = document.getElementById('flyerMake');
    if (mk) mk.onclick = async () => {
      const val = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
      const event = {
        fiesta: val('flyFiesta'),
        fechaTexto: val('flyFecha'),
        fechaISO: val('flyFechaISO'),
        lineup: val('flyLineup'),
        apertura: val('flyApertura'),
        entradas: val('flyEntradas'),
        promo: val('flyPromo'),
        edad: (document.getElementById('flyEdad') && document.getElementById('flyEdad').checked) ? '+18' : '',
        estilo: val('flyEstilo'),
      };
      if (!event.fiesta || !event.fechaTexto) {
        const m = document.getElementById('flyerFormMsg');
        if (m) m.textContent = t.need;
        return;
      }
      mk.disabled = true; mk.textContent = '…';
      try {
        const d = await api.post('/api/flyer/event', { event });
        if (!d || !d.ok || !d.jobId) throw new Error((d && d.error) || 'error');
        setBody(`<div style="font-size:15px;line-height:1.45">⏳ ${t.working}</div>
          <button type="button" class="btn btn-soft btn-block" id="flyerClose1" style="margin-top:14px">${t.close}</button>`);
        const c1 = document.getElementById('flyerClose1');
        if (c1) c1.onclick = closeSheet;
        poll(d.jobId);
      } catch (e) {
        mk.disabled = false; mk.textContent = t.make;
        const m = document.getElementById('flyerFormMsg');
        if (m) m.textContent = (e && e.message) || t.failed;
      }
    };
  }

  window.openFlyerSheet = openFlyerSheet;
})();
