// chunk-reel.js — 🎬 REEL HABLADO (2026-10-21): hoja de subida y estado.
// Se carga lazy desde el bloque semanal del álbum (botón #talkReelBtn en
// app.js) con loadChunk('reel'). El cliente graba/selecciona un video
// hablando de su producto (o elige uno que ya está en su álbum) y Posty
// lo devuelve editado como borrador en la Agenda (talking-reel.js):
// subtítulos con SUS palabras y cortes a su producto real.
// Textos ES/EN según ME.lang (espejo de cuentas, regla de la casa).
(function () {
  'use strict';
  const en = () => (typeof ME !== 'undefined' && ME && ME.lang === 'en');
  const T = () => en() ? {
    title: '🎬 Talking reel',
    intro: 'Record yourself talking about your product for 20 to 40 seconds — showing it, telling what makes it special — and Posty edits it for you: subtitles with your own words and cuts to your product, ready to approve.',
    tips: ['Talk about ONE product or service', 'Say what makes it different: how it’s made, what it’s made of, a real detail', 'Natural light, phone steady, no need to act'],
    upload: '📹 Record or pick a video',
    orAlbum: 'Or use a video from your album:',
    useThis: 'Use this one',
    uploading: 'Uploading… 📤',
    editing: 'Posty is editing your reel 🎬 This can take a couple of minutes — you can close this: the reel will show up in your Schedule on its own.',
    done: '✅ Done! Your talking reel is in your Schedule as a draft, ready for you to review and approve.',
    seeSchedule: 'See it in my Schedule',
    failed: '😅 The reel couldn’t be finished.',
    retry: 'Try again',
    close: 'Close',
    noAlbumVideos: '',
    errUpload: 'I couldn’t upload that video. Try again.',
    working: 'Working…',
  } : {
    title: '🎬 Reel hablado',
    intro: 'Grabate hablando de tu producto de 20 a 40 segundos — mostrándolo, contando qué tiene de especial — y Posty te lo edita: subtítulos con tus propias palabras y cortes a tu producto, listo para aprobar.',
    tips: ['Hablá de UN solo producto o servicio', 'Contá qué lo hace distinto: cómo se hace, de qué está hecho, un dato real', 'Luz natural, celular firme, sin actuar'],
    upload: '📹 Grabar o elegir un video',
    orAlbum: 'O usá un video que ya está en tu álbum:',
    useThis: 'Usar este',
    uploading: 'Subiendo… 📤',
    editing: 'Posty está editando tu reel 🎬 Puede tardar un par de minutos — podés cerrar esto: el reel aparece solo en tu Agenda.',
    done: '✅ ¡Listo! Tu reel hablado quedó en tu Agenda como borrador, para que lo revises y apruebes.',
    seeSchedule: 'Verlo en mi Agenda',
    failed: '😅 El reel no se pudo terminar.',
    retry: 'Probar de nuevo',
    close: 'Cerrar',
    noAlbumVideos: '',
    errUpload: 'No pude subir ese video. Probá de nuevo.',
    working: 'Trabajando…',
  };
  const escF = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  let pollTimer = null;
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function closeSheet() {
    stopPoll();
    const ov = document.getElementById('talkSheetOv');
    if (ov) ov.remove();
  }

  function setBody(html) {
    const b = document.getElementById('talkSheetBody');
    if (b) b.innerHTML = html;
  }

  function poll(jobId) {
    stopPoll();
    const t = T();
    pollTimer = setInterval(async () => {
      let d = null;
      try { d = await api.get('/api/talking-reel/' + jobId); } catch (e) {}
      if (!d || !d.ok) return;
      if (d.status === 'done') {
        stopPoll();
        setBody(`<div style="font-size:15px;line-height:1.45">${t.done}</div>
          <button type="button" class="btn btn-primary btn-block" id="talkGoSchedule" style="margin-top:14px">${t.seeSchedule}</button>
          <button type="button" class="btn btn-soft btn-block" id="talkClose2" style="margin-top:8px">${t.close}</button>`);
        const go = document.getElementById('talkGoSchedule');
        if (go) go.onclick = () => { closeSheet(); try { location.hash = '#/app/schedule'; } catch (e) {} try { render(); } catch (e) {} };
        const c2 = document.getElementById('talkClose2');
        if (c2) c2.onclick = closeSheet;
      } else if (d.status === 'failed') {
        stopPoll();
        setBody(`<div style="font-size:15px;line-height:1.45">${t.failed}</div>
          <button type="button" class="btn btn-primary btn-block" id="talkRetry" style="margin-top:14px">${t.retry}</button>`);
        const rt = document.getElementById('talkRetry');
        if (rt) rt.onclick = () => { closeSheet(); openTalkingReelSheet(); };
      }
    }, 4000);
  }

  function startEditing(jobId) {
    const t = T();
    setBody(`<div style="font-size:15px;line-height:1.45">⏳ ${t.editing}</div>
      <button type="button" class="btn btn-soft btn-block" id="talkClose1" style="margin-top:14px">${t.close}</button>`);
    const c1 = document.getElementById('talkClose1');
    if (c1) c1.onclick = closeSheet;
    poll(jobId);
  }

  async function uploadFile(f) {
    const t = T();
    setBody(`<div style="font-size:15px">${t.uploading}</div>`);
    try {
      const r = await fetch('/api/talking-reel', { method: 'POST', headers: { 'Content-Type': f.type || 'video/mp4' }, body: f, signal: AbortSignal.timeout(300000) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error((d && d.error) || t.errUpload);
      startEditing(d.id);
    } catch (e) {
      setBody(`<div style="font-size:15px;line-height:1.45">😅 ${escF(e.message || t.errUpload)}</div>
        <button type="button" class="btn btn-primary btn-block" id="talkRetry2" style="margin-top:14px">${t.retry}</button>`);
      const rt = document.getElementById('talkRetry2');
      if (rt) rt.onclick = () => { closeSheet(); openTalkingReelSheet(); };
    }
  }

  async function useAsset(assetId, btn) {
    const t = T();
    if (btn) { btn.disabled = true; btn.textContent = t.working; }
    try {
      const d = await api.post('/api/talking-reel/from-asset', { asset_id: assetId });
      if (!d || !d.ok) throw new Error((d && d.error) || t.errUpload);
      startEditing(d.id);
    } catch (e) {
      setBody(`<div style="font-size:15px;line-height:1.45">😅 ${escF((e && e.message) || t.errUpload)}</div>
        <button type="button" class="btn btn-primary btn-block" id="talkRetry3" style="margin-top:14px">${t.retry}</button>`);
      const rt = document.getElementById('talkRetry3');
      if (rt) rt.onclick = () => { closeSheet(); openTalkingReelSheet(); };
    }
  }

  window.openTalkingReelSheet = async function openTalkingReelSheet() {
    closeSheet();
    const t = T();
    const ov = document.createElement('div');
    ov.id = 'talkSheetOv';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,30,51,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML = `
      <div style="background:#fff;width:100%;max-width:520px;max-height:88vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 18px 22px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:18px"><b>${t.title}</b></div>
          <button type="button" id="talkCloseX" aria-label="${t.close}" style="background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px">✕</button>
        </div>
        <div id="talkSheetBody">
          <div style="font-size:14.5px;line-height:1.5;margin-top:8px">${t.intro}</div>
          <ul style="font-size:13.5px;line-height:1.5;margin:10px 0 0;padding-left:18px;opacity:.85">
            ${t.tips.map(x => `<li>${x}</li>`).join('')}
          </ul>
          <label class="btn btn-primary btn-block" style="margin-top:14px;cursor:pointer">
            ${t.upload}
            <input type="file" id="talkFile" accept="video/*" style="display:none">
          </label>
          <div id="talkAlbumList" style="margin-top:12px"></div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeSheet(); });
    const x = document.getElementById('talkCloseX');
    if (x) x.onclick = closeSheet;
    const inp = document.getElementById('talkFile');
    if (inp) inp.onchange = () => { const f = (inp.files || [])[0]; if (f) uploadFile(f); };
    // Videos que ya están en el álbum: el momento semanal también entra así.
    try {
      const data = await api.get('/api/album');
      const vids = ((data && data.photos) || []).filter(p => p.kind === 'video');
      const box = document.getElementById('talkAlbumList');
      if (box && vids.length) {
        box.innerHTML = `<div style="font-size:13.5px;opacity:.8;margin-bottom:6px">${t.orAlbum}</div>` +
          vids.slice(0, 4).map(v => `
            <div style="display:flex;align-items:center;gap:10px;margin:6px 0">
              <span style="width:46px;height:46px;border-radius:10px;background:#0A1E33;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;flex:none">${v.thumb ? `<img src="${escF(v.thumb)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '<span style="color:#fff;font-size:18px">🎬</span>'}</span>
              <button type="button" class="btn btn-primary btn-sm" data-talk-asset="${v.id}">${t.useThis}</button>
            </div>`).join('');
        box.querySelectorAll('[data-talk-asset]').forEach(b => { b.onclick = () => useAsset(parseInt(b.getAttribute('data-talk-asset'), 10), b); });
      }
    } catch (e) {}
  };
})();
