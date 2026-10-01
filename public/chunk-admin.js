/* chunk-admin.js — Lazy chunk de Posty.
 * Se carga bajo demanda vía loadChunk('admin') desde app.js (NO va con <script> en index.html:
 * cargarlo ahí anularía el ahorro del primer pantallazo).
 * Es un <script> clásico: comparte el scope global con app.js; las funciones declaradas
 * acá quedan disponibles como globales una vez cargado el chunk.
 * REGLA: no agregar top-level let/const/var con nombres que ya existan en app.js u otro chunk
 * (duplicar un let/const entre scripts clásicos es SyntaxError).
 * Versión del archivo: ?v=PLACEHOLDER — la reemplaza el coordinador al armar el zip.
 */


/* ---------- 📊 Panel de analytics (solo equipo Posta) ---------- */
// Ruta oculta #/app/admin. Gate: token de admin (el mismo ADMIN_TOKEN del servidor).
function adminToken() { try { return localStorage.getItem('posta_admin_token') || ''; } catch (e) { return ''; } }
async function adminApi(path, method, data) {
  const t = adminToken();
  const url = '/api/admin/' + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
  try {
    if (method === 'POST') return await api.post(url, data || {});
    return await api.get(url);
  } catch (e) {
    if (e && (e.status === 403 || e.status === 401)) {
      try { localStorage.removeItem('posta_admin_token'); } catch (ee) {}
      try { sessionStorage.setItem('posta_admin_msg', 'El token guardado no funcionó. Pegá el token actual (variable ADMIN_TOKEN en Railway).'); } catch (ee2) {}
      location.reload();
      const err = new Error('admin_auth'); err.adminAuthFailed = true; throw err;
    }
    throw e;
  }
}
async function adminView() {
  return `<div class="page-head"><div class="ph-ico">📊</div><div class="ph-txt"><h1>Analytics</h1><p class="sub">Cómo se usa Posty — solo equipo</p></div></div>
  <div class="card" id="adminCard"><div class="d">⏳ Cargando…</div></div>`;
}
async function bindAdmin() {
  const card = $('#adminCard'); if (!card) return;
  if (!adminToken()) {
    let gateMsg = '';
    try { gateMsg = sessionStorage.getItem('posta_admin_msg') || ''; sessionStorage.removeItem('posta_admin_msg'); } catch (e) {}
    card.innerHTML = `<h3 style="margin:0 0 8px">🔒 Acceso restringido</h3>
      ${gateMsg ? `<div class="err" style="margin-bottom:10px">${gateMsg}</div>` : ''}
      <p class="d">Pegá el token de admin del servidor (ADMIN_TOKEN).</p>
      <div class="field"><input id="adTok" type="password" placeholder="token" style="width:100%;font-size:16px"></div>
      <button class="btn btn-primary" id="adTokGo">Entrar</button>
      <div id="adTokMsg" style="margin-top:8px"></div>`;
    $('#adTokGo').onclick = async () => {
      const v = ($('#adTok').value || '').trim();
      if (!v) return;
      try { localStorage.setItem('posta_admin_token', v); } catch (e) {}
      try { await adminApi('funnel?days=7'); bindAdmin(); }
      catch (e) {
        if (e && e.adminAuthFailed) return;
        try { localStorage.removeItem('posta_admin_token'); } catch (ee) {}
        $('#adTokMsg').innerHTML = `<div class="err">Token inválido.</div>`;
      }
    };
    return;
  }
  card.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn btn-soft btn-sm" data-atab="funnel">Funnel /prueba</button>
      <button class="btn btn-soft btn-sm" data-atab="activity">Actividad</button>
      <button class="btn btn-soft btn-sm" data-atab="users">Por usuario</button>
      <button class="btn btn-soft btn-sm" data-atab="review">✨ Revisión</button>
      <button class="btn btn-soft btn-sm" data-atab="money">💰 Plata</button>
      <button class="btn btn-soft btn-sm" data-atab="referrals">🔗 Referidos</button>
      <button class="btn btn-soft btn-sm" data-atab="content">📊 Contenido</button>
      <button class="btn btn-soft btn-sm" data-atab="cohorts">🔁 Cohorts</button>
      <button class="btn btn-soft btn-sm" data-atab="churn">⚠️ En riesgo</button>
      <button class="btn btn-soft btn-sm" data-atab="health">🩺 Salud</button>
      <button class="btn btn-soft btn-sm" id="adExport">📥 Planilla</button>
      <button class="btn btn-soft btn-sm" id="adLogout">🔑 Cambiar token</button>
      <select id="adDays" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px">
        <option value="7">7 días</option><option value="30" selected>30 días</option>
      </select>
    </div>
    <div id="adBody"><div class="d">⏳ Cargando…</div></div>`;
  const body = $('#adBody');
  const days = () => ($('#adDays') && $('#adDays').value) || '30';
  const lo = $('#adLogout');
  if (lo) lo.onclick = () => { try { localStorage.removeItem('posta_admin_token'); } catch (e) {} location.reload(); };
  const dl = $('#adExport');
  if (dl) dl.onclick = () => {
    const a = document.createElement('a');
    a.href = '/api/admin/export?days=' + days() + '&token=' + encodeURIComponent(adminToken());
    document.body.appendChild(a); a.click(); a.remove();
  };
  const bar = (pct) => `<div style="height:10px;background:var(--bg2);border-radius:99px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${Math.max(1, Math.min(100, pct))}%;background:var(--cel);border-radius:99px"></div></div>`;
  async function showFunnel() {
    body.innerHTML = `<div class="d">⏳ Cargando funnel…</div>`;
    let r;
    try { r = await adminApi('funnel?days=' + days()); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar. Revisá el token.</div>`; return; }
    const f = r.funnel || [];
    const g = r.goal || {};
    const tr = r.trends || {};
    const ttv = r.ttv || {};
    // Paso con mayor pérdida relativa (se marca en rojo)
    let worst = -1, worstDrop = 0;
    f.forEach((s, i) => { if (i > 0 && s.pct_prev < 100 - worstDrop) { worstDrop = 100 - s.pct_prev; worst = i; } });
    const gpct = g.target ? Math.min(100, Math.round(g.subscribers / g.target * 1000) / 10) : 0;
    const mrrFmt = '$' + Math.round(g.mrr || 0).toLocaleString('es-AR');
    const trendArrow = (t) => {
      if (!t || t.prev === 0) return '';
      const d = t.delta, up = d >= 0;
      return `<span style="font-size:11px;font-weight:800;color:${up ? 'var(--green-d)' : 'var(--red-d)'}">${up ? '▲' : '▼'} ${Math.abs(d)}%</span>`;
    };
    body.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <b>🎯 Meta: ${g.subscribers || 0}/${g.target || 200} suscriptores</b>
          <span style="font-size:17.5px;font-weight:800">${gpct}%</span>
        </div>
        ${bar(gpct)}
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--mut)">
          <span>💰 MRR <b style="color:var(--txt)">${mrrFmt}</b></span>
          <span>📈 Trial→pago <b style="color:var(--txt)">${g.trial_to_paid || 0}%</b></span>
          <span>🆕 Nuevos (30d) <b style="color:var(--txt)">${g.new_30d || 0}</b></span>
        </div>
      </div>
      ` + f.map((s, i) => `
      <div style="padding:12px 0;border-bottom:1px solid var(--line)${i === worst ? ';border-left:4px solid var(--red);padding-left:10px' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <b>${i + 1}. ${esc(s.label)}${i === worst ? ' <span style="font-size:10.5px;color:var(--red);font-weight:800">· MAYOR PÉRDIDA</span>' : ''}</b>
          <span style="font-size:17.5px;font-weight:800">${s.users} ${trendArrow(tr[s.key])}</span>
        </div>
        ${bar(s.pct_first)}
        <div style="font-size:11.5px;color:var(--mut);margin-top:4px">${s.pct_prev}% del paso anterior · ${s.pct_first}% del inicio</div>
      </div>`).join('') || `<div class="d">Todavía no hay datos.</div>`;
    if (ttv.n) {
      body.insertAdjacentHTML('beforeend', `
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:16px">
        <b>⏱ Time-to-value</b>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:12.5px;color:var(--mut)">
          <span>Promedio <b style="color:var(--txt)">${ttv.avg_h}h</b></span>
          <span>Mediana <b style="color:var(--txt)">${ttv.med_h}h</b></span>
          <span>En 24h <b style="color:var(--txt)">${ttv.d1_pct}%</b></span>
          <span style="color:var(--dim)">(${ttv.n} usuarios)</span>
        </div>
      </div>`);
    }
  }
  async function showActivity() {
    body.innerHTML = `<div class="d">⏳ Cargando actividad…</div>`;
    let r;
    try { r = await adminApi('activity?days=' + days()); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const dau = (r.dau || []).slice(0, 14).reverse();
    const maxD = Math.max(1, ...dau.map(x => x.n));
    const tops = Object.entries(r.totals || {}).slice(0, 20);
    body.innerHTML = `
      <h4 style="margin:0 0 8px">Usuarios activos por día</h4>
      <div style="display:flex;align-items:flex-end;gap:4px;height:90px;margin-bottom:16px">
        ${dau.map(x => `<div title="${esc(x.d)}: ${x.n}" style="flex:1;background:var(--cel);border-radius:4px 4px 0 0;height:${Math.max(3, x.n / maxD * 88)}px;min-width:8px"></div>`).join('')}
      </div>
      <h4 style="margin:0 0 8px">Eventos más comunes</h4>
      ${tops.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span style="font-family:monospace;font-size:11.5px">${esc(k)}</span><b>${v}</b></div>`).join('') || '<div class="d">Sin datos.</div>'}`;
  }
  async function showMoney() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const m = (r.growth && r.growth.money) || {};
    const cr = (r.growth && r.growth.cancel_reasons) || [];
    const cac = (r.growth && r.growth.cac) || null;
    const spendRecent = (r.growth && r.growth.spend_recent) || [];
    const rd = (r.growth && r.growth.readiness) || null;
    const fmt$ = (v) => '$' + Math.round(v || 0).toLocaleString('es-AR');
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">MRR</div><div style="font-size:19px;font-weight:800">${fmt$(m.mrr)}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Gasto IA hoy</div><div style="font-size:19px;font-weight:800">US$ ${m.ai_today_usd || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Gasto IA 30d</div><div style="font-size:19px;font-weight:800">US$ ${m.ai_30d_usd || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Costo IA / cliente</div><div style="font-size:19px;font-weight:800">US$ ${m.cost_per_user_usd || 0}</div></div>
      </div>
      <h4 style="margin:0 0 8px">Por qué se van</h4>
      ${cr.map(x => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(x.reason)}</span><b>${x.n}</b></div>`).join('') || '<div class="d">Sin cancelaciones con motivo todavía.</div>'}
      ${rd ? (() => {
        const chk = (ok, label, detail) => `<div style="display:flex;gap:8px;align-items:baseline;padding:5px 0;font-size:12.5px"><span>${ok ? '✅' : '⬜'}</span><span>${label}${detail ? ` <span style="color:var(--mut)">(${detail})</span>` : ''}</span></div>`;
        const checks = [
          chk(rd.trials_30d >= 30, 'Suficientes trials para medir', `${rd.trials_30d}/30 en 30d`),
          chk(rd.trial_paid_pct >= 15, 'Conversión trial → pago sana', `${rd.trial_paid_pct}% (meta 15%)`),
          chk(rd.retention_n >= 5 && rd.retention_old_pct >= 50, 'La gente se queda', rd.retention_n >= 5 ? `${rd.retention_old_pct}% activos de +35 días` : 'faltan datos'),
          chk(rd.gen_rate >= 95 && !rd.failed_30d && !rd.stuck, 'Sistema sano', `gen ${rd.gen_rate}% · ${rd.failed_30d} fallidos · ${rd.stuck} atascados`),
          chk(rd.cac_measured, 'CAC medido con test chico', rd.cac_measured ? 'sí' : 'cargá gasto en ads'),
        ];
        const autoOk = rd.trials_30d >= 30 && rd.trial_paid_pct >= 15 && rd.retention_n >= 5 && rd.retention_old_pct >= 50 && rd.gen_rate >= 95 && !rd.failed_30d && !rd.stuck && rd.cac_measured;
        return `<h4 style="margin:16px 0 8px">🚀 ¿Listo para los $5000/mes?</h4>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px">
          ${checks.join('')}
          ${chk(false, 'Meta App Review aprobado', 'lo confirmás vos')}
          ${chk(false, 'Pago real de MercadoPago verificado', 'lo confirmás vos')}
          <div style="margin-top:10px;font-size:13.5px;font-weight:800">${autoOk ? '🟢 Los números dicen que SÍ. Avisame y lo hablamos.' : '🔴 Todavía no — los números mandan.'}</div>
        </div>`;
      })() : ''}
      <h4 style="margin:16px 0 8px">💵 CAC — costo de adquisición</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Gasto ads 30d</div><div style="font-size:19px;font-weight:800">US$ ${cac ? cac.spend_30d : 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Pagos 30d</div><div style="font-size:19px;font-weight:800">${cac ? cac.paid_30d : 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">CAC</div><div style="font-size:19px;font-weight:800">${cac && cac.cac ? 'US$ ' + cac.cac : '—'}</div></div>
      </div>
      ${cac && cac.paid_by_utm && cac.paid_by_utm.length ? `<div class="d" style="margin-bottom:8px">Pagos por campaña (UTM, 90d)</div>
      ${cac.paid_by_utm.map(x => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span style="font-size:12.5px">${esc(x.campaign)}</span><b>${x.n}</b></div>`).join('')}` : ''}
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:12px">
        <b style="font-size:13px">Registrar gasto en ads</b>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <input id="spDate" type="date" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px" value="${new Date().toISOString().slice(0, 10)}">
          <input id="spCamp" type="text" placeholder="Campaña (opcional)" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;flex:1;min-width:140px">
          <input id="spAmt" type="number" min="0" step="0.01" placeholder="US$" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:110px">
          <button class="btn btn-primary btn-sm" id="spAdd">Guardar</button>
        </div>
        <div id="spMsg" style="font-size:12px;margin-top:6px"></div>
        ${spendRecent.length ? `<div class="d" style="margin:10px 0 4px">Últimos gastos</div>` + spendRecent.map(s => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(s.date)}${s.campaign ? ' · ' + esc(s.campaign) : ''}</span><b>US$ ${s.amount_usd}</b></div>`).join('') : ''}
      </div>
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:12px">
        <b style="font-size:13px">🧮 Simulador de CAC</b>
        <p class="d" style="margin:4px 0 10px">Jugá con los números antes de gastar en diciembre.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">
          <label style="font-size:11.5px;color:var(--mut)">CPC (US$)<input id="simCpc" type="number" min="0" step="0.1" value="2" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
          <label style="font-size:11.5px;color:var(--mut)">Click → trial %<input id="simC2t" type="number" min="0.1" step="0.5" value="5" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
          <label style="font-size:11.5px;color:var(--mut)">Trial → pago %<input id="simT2p" type="number" min="0.1" step="1" value="20" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
          <label style="font-size:11.5px;color:var(--mut)">ARPU mensual (US$)<input id="simArpu" type="number" min="1" step="1" value="52" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
          <label style="font-size:11.5px;color:var(--mut)">Meses que se queda<input id="simMos" type="number" min="1" step="1" value="6" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
        </div>
        <div id="simOut" style="margin-top:12px"></div>
      </div>`;
    const spAdd = $('#spAdd');
    if (spAdd) spAdd.onclick = async () => {
      const d = $('#spDate').value, c = $('#spCamp').value.trim(), a = parseFloat($('#spAmt').value);
      const msg = $('#spMsg');
      if (!d || !(a > 0)) { msg.innerHTML = `<span style="color:var(--red-d)">Fecha y monto válido.</span>`; return; }
      try {
        await adminApi('ad-spend', 'POST', { date: d, campaign: c, amount_usd: a });
        msg.innerHTML = `<span style="color:var(--green-d)">Guardado ✅</span>`;
        setTimeout(showMoney, 900);
      } catch (e) { msg.innerHTML = `<span style="color:var(--red-d)">No se pudo guardar.</span>`; }
    };
    // Simulador de CAC
    const simCalc = () => {
      const v = (id) => parseFloat(($('#' + id) || {}).value) || 0;
      const cpc = v('simCpc'), c2t = v('simC2t') / 100, t2p = v('simT2p') / 100, arpu = v('simArpu'), mos = v('simMos');
      const out = $('#simOut');
      if (!cpc || !c2t || !t2p || !arpu || !mos) { out.innerHTML = `<div class="d">Completá todos los valores.</div>`; return; }
      const cac = cpc / c2t / t2p;
      const ltv = arpu * mos;
      const ratio = ltv / cac;
      const payback = cac / arpu;
      const clients = Math.floor(5000 / cac);
      const verdict = ratio >= 3 ? ['🟢', 'Negocio sano: cada dólar en ads vuelve x' + ratio.toFixed(1) + '.']
        : ratio >= 1 ? ['🟡', 'Ajustado: ganás, pero hay poco margen para errores.']
        : ['🔴', 'Perdés plata con cada cliente. No escales así.'];
      out.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
          <div><div style="font-size:11px;color:var(--mut)">CAC</div><div style="font-size:19px;font-weight:800">US$ ${cac.toFixed(0)}</div></div>
          <div><div style="font-size:11px;color:var(--mut)">LTV</div><div style="font-size:19px;font-weight:800">US$ ${ltv.toFixed(0)}</div></div>
          <div><div style="font-size:11px;color:var(--mut)">LTV : CAC</div><div style="font-size:19px;font-weight:800">${ratio.toFixed(1)} : 1</div></div>
          <div><div style="font-size:11px;color:var(--mut)">Payback</div><div style="font-size:19px;font-weight:800">${payback.toFixed(1)} meses</div></div>
          <div><div style="font-size:11px;color:var(--mut)">Clientes con $5000</div><div style="font-size:19px;font-weight:800">${clients}</div></div>
        </div>
        <div style="margin-top:10px;font-size:13px"><b>${verdict[0]}</b> ${verdict[1]}</div>`;
    };
    ['simCpc', 'simC2t', 'simT2p', 'simArpu', 'simMos'].forEach(id => { const el = $('#' + id); if (el) el.oninput = simCalc; });
    simCalc();
  }
  async function showReferrals() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const rf = (r.growth && r.growth.referrals) || {};
    const rc = (r.growth && r.growth.ref_clicks) || [];
    const clickByCode = {}; rc.forEach(c => { clickByCode[c.code] = c.n; });
    const conv = rf.signups ? Math.round(rf.paying / rf.signups * 1000) / 10 : 0;
    const totalClicks = rc.reduce((s, c) => s + c.n, 0);
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Clicks en links</div><div style="font-size:19px;font-weight:800">${totalClicks}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Registros por referido</div><div style="font-size:19px;font-weight:800">${rf.signups || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">De esos, pagan</div><div style="font-size:19px;font-weight:800">${rf.paying || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Conversión referido</div><div style="font-size:19px;font-weight:800">${conv}%</div></div>
      </div>
      <h4 style="margin:0 0 8px">Top referidores (clicks → registros)</h4>
      ${((rf.top || []).map(t => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(t.email)}</span><b>${clickByCode[t.code] || 0} clicks → ${t.n} reg.</b></div>`).join('')) || '<div class="d">Todavía nadie refirió.</div>'}`;
  }
  async function showContent() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const c = (r.growth && r.growth.content) || {};
    const th = (r.growth && r.growth.chat_themes) || [];
    const ts = (r.growth && r.growth.taste) || [];
    const maxT = Math.max(1, ...th.map(t => t.n));
    body.innerHTML = `
      <h4 style="margin:0 0 8px">Rendimiento en Instagram (30 días)</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Publicados</div><div style="font-size:19px;font-weight:800">${c.published_30d || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Alcance prom.</div><div style="font-size:19px;font-weight:800">${c.avg_reach || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Likes prom.</div><div style="font-size:19px;font-weight:800">${c.avg_likes || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Comentarios prom.</div><div style="font-size:19px;font-weight:800">${c.avg_comments || 0}</div></div>
      </div>
      <h4 style="margin:0 0 8px">Qué le piden a Posty (temas del chat)</h4>
      ${th.map(t => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span style="width:110px;font-size:12.5px">${esc(t.word)}</span><div style="flex:1;height:8px;background:var(--bg2);border-radius:99px;overflow:hidden"><div style="height:100%;width:${Math.round(t.n / maxT * 100)}%;background:var(--cel);border-radius:99px"></div></div><b style="font-size:12px">${t.n}</b></div>`).join('') || '<div class="d">Sin mensajes todavía.</div>'}
      <h4 style="margin:16px 0 8px">👍/👎 Qué rechazan (90 días)</h4>
      ${ts.map(t => `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--line)"><span style="font-size:12.5px">${esc(t.template)}</span><span style="font-size:12px;color:${t.reject_pct >= 30 ? 'var(--red-d)' : 'var(--mut)'}"><b>${t.reject_pct}%</b> rechazo · ${t.ok}👍 ${t.no}👎</span></div>`).join('') || '<div class="d">Sin señales todavía.</div>'}`;
  }
  async function showHealth() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const h = (r.growth && r.growth.health) || {};
    const ok = (v, good, warn) => v >= good ? 'var(--green-d)' : v >= warn ? 'var(--txt)' : 'var(--red-d)';
    body.innerHTML = `
      <h4 style="margin:0 0 4px">🩺 Salud del sistema (30 días)</h4>
      <p class="d" style="margin:0 0 12px">Fallos que ningún usuario te reporta.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Generación exitosa</div><div style="font-size:19px;font-weight:800;color:${ok(h.gen_rate || 0, 95, 80)}">${h.gen_rate || 0}%</div><div style="font-size:11px;color:var(--mut)">${h.gen_done_30d || 0}/${h.gen_start_30d || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Posts fallidos</div><div style="font-size:19px;font-weight:800;color:${(h.failed_posts_30d || 0) ? 'var(--red-d)' : 'var(--green-d)'}">${h.failed_posts_30d || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Atascados publicando</div><div style="font-size:19px;font-weight:800;color:${(h.stuck_count || 0) ? 'var(--red-d)' : 'var(--green-d)'}">${h.stuck_count || 0}</div><div style="font-size:11px;color:var(--mut)">+60 min en "publishing"</div></div>
      </div>
      ${(h.stuck_recent && h.stuck_recent.length) ? `<h4 style="margin:0 0 8px">Atascados</h4>` + h.stuck_recent.map(p => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(p.email)} · post #${p.id}</span><span style="color:var(--mut)">desde ${esc(p.at || '')}</span></div>`).join('') : ''}
      ${(h.failed_recent && h.failed_recent.length) ? `<h4 style="margin:16px 0 8px">Últimos fallidos</h4>` + h.failed_recent.map(p => `<div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(p.email)}</b> · post #${p.id}<div style="color:var(--mut);font-size:11.5px">${esc(p.error || 'sin detalle')}</div></div>`).join('') : ''}
      ${!(h.stuck_count || h.failed_posts_30d) ? '<div class="d">🎉 Todo sano: nada falló ni se atascó.</div>' : ''}`;
  }
  async function showChurn() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const ch = (r.growth && r.growth.churn) || [];
    body.innerHTML = `
      <h4 style="margin:0 0 4px">⚠️ En riesgo de irse</h4>
      <p class="d" style="margin:0 0 12px">Clientes activos o en trial sin publicar hace 7+ días. Escribiles antes de que cancelen.</p>
      ${ch.map(c => `
      <div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <b style="font-size:12.5px">${esc(c.email)}</b>
          <span style="font-size:11px;color:var(--mut)">${esc(c.plan)} · ${esc(c.status)}</span>
        </div>
        <div style="font-size:11.5px;color:var(--mut);margin-top:3px">
          ${c.last_pub ? `Última publicación: hace ${Math.max(0, Math.round((Date.now() - new Date(c.last_pub.replace(' ', 'T') + 'Z').getTime()) / 864e5))} días` : 'Nunca publicó'} · registrado hace ${c.days_since_signup} días
        </div>
      </div>`).join('') || '<div class="d">🎉 Nadie en riesgo. Todos publicando.</div>'}`;
  }
  async function showCohorts() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const ch = (r.growth && r.growth.cohorts) || [];
    body.innerHTML = `
      <h4 style="margin:0 0 4px">Retención por semana de registro</h4>
      <p class="d" style="margin:0 0 12px">% que sigue con suscripción activa hoy.</p>
      ${ch.map(c => `
      <div style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <b style="font-size:12.5px">Semana ${esc(c.week)}</b>
          <span style="font-size:12.5px;color:var(--mut)">${c.active}/${c.total} · <b style="color:${c.pct >= 50 ? 'var(--green-d)' : c.pct >= 25 ? 'var(--txt)' : 'var(--red-d)'}">${c.pct}%</b></span>
        </div>
        ${bar(c.pct)}
      </div>`).join('') || '<div class="d">Sin datos.</div>'}`;
  }
  async function showUsers() {
    body.innerHTML = `
      <div class="field" style="display:flex;gap:8px"><input id="adQ" placeholder="email del usuario…" style="flex:1;font-size:16px"><button class="btn btn-primary btn-sm" id="adQGo">Buscar</button></div>
      <div id="adUsers"></div><div id="adTimeline" style="margin-top:12px"></div>`;
    const go = async () => {
      const q = ($('#adQ').value || '').trim();
      if (!q) return;
      $('#adUsers').innerHTML = `<div class="d">⏳ Buscando…</div>`;
      let r;
      try { r = await adminApi('users?q=' + encodeURIComponent(q)); }
      catch (e) { $('#adUsers').innerHTML = `<div class="err">Error.</div>`; return; }
      $('#adUsers').innerHTML = (r.users || []).map(u => `
        <button class="btn btn-ghost btn-block" data-uid="${u.id}" style="text-align:left;margin-bottom:6px">
          <b>${esc(u.email)}</b><br><span style="font-size:10.5px;color:var(--mut)">${esc(u.plan || '')} · ${esc(u.plan_status || '')} · desde ${esc((u.created_at || '').slice(0, 10))}</span>
        </button>`).join('') || `<div class="d">Sin resultados.</div>`;
      $$('#adUsers [data-uid]').forEach(b => b.onclick = async () => {
        $('#adTimeline').innerHTML = `<div class="d">⏳ Cargando línea de tiempo…</div>`;
        let t;
        try { t = await adminApi('events?user_id=' + b.dataset.uid + '&days=' + days() + '&limit=200'); }
        catch (e) { $('#adTimeline').innerHTML = `<div class="err">Error.</div>`; return; }
        $('#adTimeline').innerHTML = `<h4 style="margin:0 0 8px">Línea de tiempo</h4>` + ((t.events || []).map(e => {
          let pr = '';
          try { const o = JSON.parse(e.props || '{}'); const ks = Object.keys(o).slice(0, 4); if (ks.length) pr = ' <span style="color:var(--mut)">(' + ks.map(k => k + ': ' + String(o[k]).slice(0, 24)).join(', ') + ')</span>'; } catch (ee) {}
          return `<div style="padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px"><span style="color:var(--mut);font-size:10.5px">${esc((e.created_at || '').slice(5, 16).replace(' ', ' · '))}</span> <b style="font-family:monospace;font-size:11.5px">${esc(e.name)}</b>${pr}</div>`;
        }).join('') || `<div class="d">Sin eventos.</div>`);
      });
    };
    $('#adQGo').onclick = go;
    $('#adQ').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  }
  // Cola de revisión de la "primera semana con rueditas": borradores con
  // needs_review=1. Aprobar → visible al cliente + golden example. Editar →
  // aplica caption, aprueba y guarda el golden con lo final. Rechazar → nota
  // que alimenta el aprendizaje y regenera el borrador con otro enfoque.
  async function showReview() {
    body.innerHTML = `<div class="d">⏳ Cargando cola de revisión…</div>`;
    let r;
    try { r = await adminApi('review-queue'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const q = r.queue || [];
    if (!q.length) { body.innerHTML = `<div class="d">✨ Nada pendiente. La cola está vacía.</div>`; return; }
    body.innerHTML = `<div style="margin-bottom:10px;font-size:13px;color:var(--mut)">${q.length} borrador${q.length > 1 ? 'es' : ''} esperando revisión</div>` +
      q.map(p => `
      <div data-rev="${p.id}" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px">
          <b style="font-size:14px">${esc(p.business_name || p.email || ('Usuario ' + p.user_id))}</b>
          <span style="font-size:11px;color:var(--mut)">${esc((p.created_at || '').slice(0, 16))} · ${esc(p.tipo || p.media_type || '')}</span>
        </div>
        ${p.image_url ? `<img src="${esc(p.image_url)}" style="width:100%;border-radius:10px;margin-bottom:8px" loading="lazy">` : ''}
        <div style="font-size:13.5px;white-space:pre-wrap;margin-bottom:4px">${esc(p.caption || '')}</div>
        <div style="font-size:12px;color:var(--mut);margin-bottom:10px">${esc(p.hashtags || '')}</div>
        <textarea data-rev-note rows="2" placeholder="Nota para el rechazo (¿qué hay que cambiar?)" style="font-size:16px;width:100%;border:2px solid var(--line);border-radius:10px;padding:8px;margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-rev-approve="${p.id}">✅ Aprobar</button>
          <button class="btn btn-soft btn-sm" data-rev-edit="${p.id}">✏️ Aprobar con edición</button>
          <button class="btn btn-soft btn-sm" data-rev-reject="${p.id}">🔄 Rechazar y regenerar</button>
        </div>
      </div>`).join('');
    body.querySelectorAll('[data-rev-approve]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await adminApi('review/' + b.dataset.revApprove + '/approve', 'POST'); showReview(); }
      catch (e) { alert('No se pudo aprobar'); b.disabled = false; }
    });
    body.querySelectorAll('[data-rev-edit]').forEach(b => b.onclick = async () => {
      const orig = (q.find(x => String(x.id) === String(b.dataset.revEdit)) || {});
      const cap = prompt('Caption final:', orig.caption || '');
      if (cap === null) return;
      b.disabled = true;
      try { await adminApi('review/' + b.dataset.revEdit + '/edit', 'POST', { caption: cap }); showReview(); }
      catch (e) { alert('No se pudo guardar'); b.disabled = false; }
    });
    body.querySelectorAll('[data-rev-reject]').forEach(b => b.onclick = async () => {
      const card = body.querySelector(`[data-rev="${b.dataset.revReject}"]`);
      const note = card && card.querySelector('[data-rev-note]') ? card.querySelector('[data-rev-note]').value.trim() : '';
      if (!note) { alert('Escribí una nota: ¿qué hay que cambiar?'); return; }
      b.disabled = true;
      try { await adminApi('review/' + b.dataset.revReject + '/reject', 'POST', { note }); showReview(); }
      catch (e) { alert('No se pudo rechazar'); b.disabled = false; }
    });
  }
  $$('#adminCard [data-atab]').forEach(b => b.onclick = () => {
    $$('#adminCard [data-atab]').forEach(x => x.classList.remove('btn-primary'));
    b.classList.add('btn-primary');
    ({ funnel: showFunnel, activity: showActivity, users: showUsers, review: showReview, money: showMoney, referrals: showReferrals, content: showContent, cohorts: showCohorts, churn: showChurn, health: showHealth })[b.dataset.atab]();
  });
  // Banner de alertas: la info tiene que buscar al dueño
  try {
    const gr = await adminApi('growth');
    const al = (gr.growth && gr.growth.alerts) || [];
    if (al.length) {
      const bar = document.createElement('div');
      bar.style.cssText = 'margin-bottom:12px;border-radius:12px;padding:12px 14px;background:#fff7ed;border:1.5px solid #fdba74';
      bar.innerHTML = '<b style="font-size:13px">🔔 Alertas</b>' + al.map(a =>
        `<div style="font-size:12.5px;margin-top:6px;${a.sev === 'high' ? 'color:var(--red-d);font-weight:700' : ''}">• ${esc(a.text)}</div>`).join('');
      card.insertBefore(bar, card.firstChild);
    }
  } catch (e) {}
  const f0 = $('#adminCard [data-atab="funnel"]'); if (f0) f0.click();
  const dd = $('#adDays'); if (dd) dd.onchange = () => { const cur = $('#adminCard .btn-primary[data-atab]'); if (cur) cur.click(); };
}
