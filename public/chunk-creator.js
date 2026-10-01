/* chunk-creator.js — Lazy chunk de Posty.
 * Se carga bajo demanda vía loadChunk('creator') desde app.js (NO va con <script> en index.html:
 * cargarlo ahí anularía el ahorro del primer pantallazo).
 * Es un <script> clásico: comparte el scope global con app.js; las funciones declaradas
 * acá quedan disponibles como globales una vez cargado el chunk.
 * REGLA: no agregar top-level let/const/var con nombres que ya existan en app.js u otro chunk
 * (duplicar un let/const entre scripts clásicos es SyntaxError).
 * Versión del archivo: ?v=PLACEHOLDER — la reemplaza el coordinador al armar el zip.
 */


/* ---------- CREAR ---------- */
let CREATOR_OPEN = false; // el creador manual vive dentro de Mi semana, plegado hasta que se abre
let CREATOR = { step: 1, topic: '', caption: '', hashtags: '', tpl: 'gradiente', pal: 0, palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', options: null, detected: null, recommendedIndex: 0, recommendedReason: '', feedback: '', productPhoto: '', selected: [], cardPhoto: {}, carouselMode: false, carouselPhotos: [], isCarousel: false };

function creatorChips() {
  const p = (typeof PROFILE !== 'undefined' && PROFILE) || {};
  const biz = p.business_name || 'tu negocio';
  const M = {
    ropa: ['Nuevo ingreso de la semana', 'Prenda destacada de hoy', 'Sale: hasta 40% off'],
    gastronomia: ['Promo 2x1 en pizzas', 'Plato nuevo de la carta', 'Menú del día'],
    cafeteria: ['Latte nuevo de la casa', 'Promo merienda', 'Café de especialidad'],
    belleza: ['Tratamiento nuevo', 'Promo del mes', 'Antes y después'],
    barberia: ['Corte de la semana', 'Promo corte + barba', 'Reservá tu turno'],
    fitness: ['Clase nueva esta semana', 'Promo primer mes', 'Rutina para arrancar'],
    salud: ['Nuevo servicio', 'Turnos disponibles', 'Tip de salud'],
    mascotas: ['Novedad para tu mascota', 'Promo en alimento', 'Tip para cuidarla'],
    servicios: ['Servicio nuevo', 'Promo este mes', 'Pedí tu presupuesto'],
    educacion: ['Curso nuevo', 'Inscripciones abiertas', 'Clase gratuita'],
    tecnologia: ['Producto nuevo', 'Oferta de la semana', 'Tip tecnológico'],
    hogar: ['Novedad para tu casa', 'Promo en deco', 'Antes y después'],
    inmobiliaria: ['Nueva propiedad', 'Oportunidad de la semana', 'Conocé este depto'],
    eventos: ['Próximo evento', 'Entradas disponibles', 'Así fue el último'],
    viajes: ['Nuevo destino', 'Promo en paquetes', 'Escapada del finde'],
    arte: ['Obra nueva', 'Mi proceso creativo', 'Encargá tu pieza'],
    otro: [`Lo nuevo de ${biz}`, 'Promo de la semana', 'Detrás de escena'],
  };
  return M[p.category] || M.otro;
}

function creatorView(embed) {
  const c = CREATOR;
  const head1 = embed ? '' : `<div class="page-head"><div class="ph-ico">✨</div><div class="ph-txt"><h1>Crear posteo</h1><p class="sub">Paso 1 de 3 — Nosotros pensamos la estrategia. Vos solo aprobás.</p></div></div>`;
  const head2 = embed ? '' : `<div class="page-head"><div class="ph-ico">✨</div><div class="ph-txt"><h1>Crear posteo</h1><p class="sub">Paso 2 de 3 — El diseño ya está listo. Retocalo si querés.</p></div></div>`;
  const head3 = embed ? '' : `<div class="page-head"><div class="ph-ico">✨</div><div class="ph-txt"><h1>Crear posteo</h1><p class="sub">Paso 3 de 3 — Programalo y olvidate.</p></div></div>`;
  const headO = embed ? '' : `<div class="page-head"><div class="ph-ico">🎨</div><div class="ph-txt"><h1>Tus 6 diseños</h1><p class="sub">Te recomendamos la marcada con ⭐. Si preferís otra, elegila y programala.</p></div></div>`;
  const stepsBar = `<div class="steps-bar">${[1, 2, 3].map(i => `<div class="s ${i <= c.step ? 'on' : ''}"></div>`).join('')}</div>`;
  if (c.step === 1) {
    return `
    ${head1}
    ${stepsBar}
    <div class="card">
      <div class="field"><label>¿Alguna idea en mente? <span style="font-weight:400;color:var(--mut)">(opcional)</span></label>
        <textarea id="c_topic" placeholder="${esc('Ej: ' + creatorChips().map(t => '"' + t + '"').join(', '))}">${esc(c.topic)}</textarea>
        <div class="hint">Si no escribís nada, igual te armamos el posteo con nuestra estrategia. Una frase alcanza si querés guiarnos.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${creatorChips().map(t => `<button class="btn btn-ghost btn-sm" data-chip="${esc(t)}" type="button">${esc(t)}</button>`).join('')}
        </div></div>
      <div class="field"><label>📷 Foto de tu producto <span style="font-weight:400;color:var(--mut)">(opcional)</span></label>
        <div id="c_prodPhotoBox"></div>
        <input type="file" id="c_prodPhotoFile" accept="image/*" style="display:none">
        <div class="hint">Si la subís, las 6 opciones usan TU foto. Ideal para vender tu producto exacto. Si no, usamos fotos del banco.</div></div>
      <button class="btn btn-soft" id="btnGen">✨ Armar mi posteo</button>
      <div id="genErr"></div>
      <div id="genOut" style="margin-top:24px;${c.caption ? '' : 'display:none'}">
        <div class="field"><label>Caption</label><textarea id="c_caption" style="min-height:150px">${esc(c.caption)}</textarea></div>
        <div class="field"><label>Hashtags</label><textarea id="c_tags" style="min-height:70px">${esc(c.hashtags)}</textarea></div>
        <button class="btn btn-primary" id="btnToDesign">Siguiente: diseñar imagen →</button>
      </div>
    </div>`;
  }
  if (c.step === 2) {
    return `
    ${head2}
    ${stepsBar}
    <div class="designer">
      <div>
        <div class="card" style="padding:22px">
          <h3>Plantilla</h3>
          <div class="tpl-grid">
            ${['gradiente', 'claro', 'noche', 'promo'].map(t => `<div class="tpl ${c.tpl === t ? 'on' : ''}" data-tpl="${t}">${t[0].toUpperCase() + t.slice(1)}</div>`).join('')}
          </div>
          <h3 style="margin-top:18px">Paleta</h3>
          <div class="pal-row">${getPalettes().map((p, i) => `<div class="pal ${c.pal === i ? 'on' : ''}" data-pal="${i}" title="${p.name}${p.brand ? ' (tus colores)' : ''}" style="background:linear-gradient(135deg,${p.c.join(',')});${p.brand ? 'box-shadow:0 0 0 2px var(--yl)' : ''}"></div>`).join('')}</div>
          <div class="field" style="margin-top:18px"><label>Título</label><input id="d_title" value="${esc(c.title)}" placeholder="HASTA 40% OFF"></div>
          <div class="field"><label>Subtítulo</label><input id="d_sub" value="${esc(c.subtitle)}" placeholder="Solo esta semana"></div>
          <div class="field"><label>Usuario de Instagram (sin @)</label><input id="d_handle" value="${esc(c.handle || (PROFILE?.ig_username || ''))}" placeholder="tunegocio"></div>
          <div class="field"><label>${c.carouselMode ? 'Fotos del carrusel' : 'Foto del producto (opcional)'}</label>
            ${c.carouselMode ? `
            <div id="photoLib" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
              ${assetPhotos().map(a => {
                const ord = c.carouselPhotos.indexOf(a.file_path);
                return `<div style="position:relative;cursor:pointer" data-carlib="${esc(a.file_path)}">`
                  + `<img src="${esc(a.file_path)}" style="width:64px;height:80px;object-fit:cover;border-radius:10px;border:2px solid ${ord >= 0 ? 'var(--cel)' : 'var(--line)'}">`
                  + (ord >= 0 ? `<span class="car-ord">${ord + 1}</span>` : '') + `</div>`;
              }).join('')}
            </div>
            <div class="hint">Elegí de 2 a 10 fotos para el carrusel — la primera es la portada. Tocá de nuevo para sacar.</div>
            <div style="margin-top:8px"><button class="btn btn-ghost btn-sm" id="btnCarouselOff" type="button">← Volver a foto única</button></div>
            <div id="carErr"></div>` : (c.photo ? `
            <div style="display:flex;gap:10px;align-items:center">
              <img src="${c.photo}" style="width:64px;height:80px;object-fit:cover;border-radius:10px;border:1px solid var(--line)">
              <div style="display:flex;gap:8px">
                <button class="btn btn-ghost btn-sm" id="btnPhotoCh" type="button">Cambiar</button>
                <button class="btn btn-ghost btn-sm" id="btnPhotoRm" type="button">Quitar</button>
              </div>
            </div>` : `
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" id="btnPhotoAdd" type="button">📷 Subir foto</button>
              ${assetPhotos().length ? `<button class="btn btn-ghost btn-sm" id="btnPhotoLib" type="button">🖼️ Mis fotos</button>` : ''}
              ${assetPhotos().length >= 2 ? `<button class="btn btn-ghost btn-sm" id="btnCarousel" type="button">🎞️ Carrusel</button>` : ''}
            </div>
            <div id="photoLib" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px">
              ${assetPhotos().map(a => `<img src="${a.file_path}" data-lib="${a.file_path}" style="width:64px;height:80px;object-fit:cover;border-radius:10px;border:2px solid var(--line);cursor:pointer">`).join('')}
            </div>
            <div class="hint">La foto va de fondo y el diseño se mantiene igual.${assetLogo() ? ' Tu logo se agrega solo en la esquina.' : ''}</div>`)}
            <input type="file" id="d_photo" accept="image/*" style="display:none">
          </div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost" id="btnBack1">← Atrás</button>
          <button class="btn btn-primary" id="btnSaveDesign" style="flex:1">${c.carouselMode ? 'Continuar →' : 'Guardar diseño →'}</button>
        </div>
      </div>
      <div><div class="preview-box"><canvas id="postCanvas"></canvas></div>
      <p style="color:var(--dim);font-size:11.5px;margin-top:10px;text-align:center">Vista previa real — así se va a ver en el feed.</p></div>
    </div>`;
  }
  if (c.step === 'options') {
    const det = c.detected || {};
    const colors = det.colors || [];
    const hexes = det.colorHex || [];
    const opts = c.options || [];
    const libPhotos = (typeof assetPhotos === 'function' ? assetPhotos() : []);
    const colorNames = colors.length > 1
      ? colors.slice(0, -1).join(', ') + ' y ' + colors[colors.length - 1]
      : colors.join(', ');
    return `
    ${headO}
    <div class="steps-bar">${[1, 2, 3].map(i => `<div class="s ${i <= 1 ? 'on' : ''}"></div>`).join('')}</div>
    ${colors.length ? `<div class="colors-note">🎨 Tus colores: ${esc(colorNames)}${hexes.map(h => `<span class="swatch" style="background:${esc(h)}" title="${esc(h)}"></span>`).join('')}</div>` : ''}
    ${det.productPhoto ? `<div class="prodphoto-note">📷 Usando la foto de tu producto en las 6 opciones</div>` : ''}
    ${det.photoQuery && !det.productPhoto ? `<div class="photoq-note">📸 Fotos de: <b>${esc(det.photoQuery)}</b>${det.userPhotos ? ` · usando tus fotos primero ✨` : ''}</div>` : ''}
    ${libPhotos.length ? `
    <div class="myphotos-card" style="padding:14px 18px">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:700">📷 Tus fotos</span>
        <div class="mp-row" id="mpRow" style="margin:0">${libPhotos.map(a => `<span style="position:relative;display:inline-block"><img src="${esc(a.file_path)}" class="mp-thumb" alt="Tu foto"><button data-mpdel="${a.id}" title="Borrar foto" aria-label="Borrar foto" style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;border:1.5px solid #fff;background:#0A1E33;color:#fff;font-size:12.5px;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3)">×</button></span>`).join('')}</div>
        <button class="btn btn-ghost btn-sm" id="btnUploadPhotos">📤 Subir más</button>
        <input type="file" id="mpFiles" accept="image/*" multiple style="display:none">
      </div>
      <div id="mpMsg"></div>
    </div>` : `
    <div class="myphotos-card">
      <div class="mp-title">📷 Tus fotos</div>
      <p class="mp-text">Para vender tu producto exacto (como tu buzo), subí sus fotos una vez y el creador las usa siempre.</p>
      <div class="mp-row" id="mpRow"><span class="mut">Todavía no subiste fotos.</span></div>
      <button class="btn btn-soft" id="btnUploadPhotos">📤 Subir fotos de tus productos</button>
      <input type="file" id="mpFiles" accept="image/*" multiple style="display:none">
      <div id="mpMsg"></div>
    </div>`}
    <div id="optErr"></div>
    <div class="opt-grid">
      ${opts.map((o, i) => `
      <div class="opt-card" data-card="${i}">
        ${i === c.recommendedIndex ? `<div class="opt-badge">⭐ Recomendada</div>` : ''}
        <label class="opt-sel"><input type="checkbox" class="opt-selbox" data-sel="${i}"><span>Elegir</span></label>
        <img class="opt-img" data-optimg="${i}" src="${esc(o.image)}" alt="${esc(o.title || ('Diseño ' + (i + 1)))}" loading="lazy" title="Tocá para ver en grande">
        ${i === c.recommendedIndex && c.recommendedReason ? `<p class="opt-reason">${esc(c.recommendedReason)}</p>` : ''}
        ${o.title ? `<p class="opt-title">${esc(o.title)}</p>` : ''}
        ${o.caption ? `<p class="opt-caption">${esc(o.caption)}</p>` : ''}
        <div class="opt-actions">
          <button class="btn btn-primary btn-sm opt-use" data-use="${i}">Usar este diseño →</button>
          <button class="btn btn-ghost btn-sm opt-myphoto" data-mp="${i}">📷 Mi foto</button>
        </div>
        <button class="opt-customlink" data-custom="${i}">✏️ Personalizar a mano</button>
      </div>`).join('')}
    </div>
    <div id="multiBar" style="display:none">
      <span id="multiCount">✅ 0 elegidos</span>
      <button class="btn btn-primary" id="btnMultiSched">Programar (0)</button>
    </div>
    <div style="display:flex;justify-content:center;margin:4px 0 26px">
      <button class="btn btn-soft" id="btnRegen">🔄 Regenerar opciones</button>
    </div>
    <div class="feedback-card">
      <p class="feedback-title">¿Querés cambiar algo? Decime y lo arreglamos. O lo mejoramos.</p>
      <div class="feedback-row">
        <input id="fb_input" placeholder='Ej: "más rojo", "otra foto", "caption más corto"'>
        <button class="btn btn-primary btn-sm" id="btnFeedback">Arreglar</button>
      </div>
      <div id="feedbackMsg"></div>
    </div>
    <div id="schedModal" class="modal-ov" style="display:none">
      <div class="modal-card">
        <h3>📅 Programar diseños</h3>
        <p class="mut" style="margin-bottom:12px">Elegí día y hora para cada uno.</p>
        <div id="schedRows"></div>
        <div id="schedMsg"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="btnSchedCancel">Cancelar</button>
          <button class="btn btn-primary" id="btnSchedConfirm">✅ Confirmar</button>
        </div>
      </div>
    </div>
    <div id="optLight" class="modal-ov" style="display:none">
      <div class="modal-card light-card">
        <img id="optLightImg" alt="Diseño en grande">
        <p id="optLightCap"></p>
        <button class="btn btn-ghost btn-block" id="btnLightClose">Cerrar</button>
      </div>
    </div>
    <div id="photoPickModal" class="modal-ov" style="display:none">
      <div class="modal-card">
        <h3>📷 Foto para este diseño</h3>
        <button class="btn btn-soft btn-block" id="btnPickUpload" style="margin:12px 0">📤 Subir nueva foto</button>
        <input type="file" id="pickFile" accept="image/*" style="display:none">
        <p class="mut" style="margin:6px 0 8px"><b>De tu librería</b></p>
        <div class="mp-row" id="pickLib"></div>
        <p class="mut" style="margin:6px 0 8px"><b>Del banco de fotos</b></p>
        <div class="mp-row" id="pickStock"></div>
        <div id="pickMsg"></div>
        <button class="btn btn-ghost btn-block" id="btnPickClose" style="margin-top:14px">Cancelar</button>
      </div>
    </div>
    <button class="btn btn-ghost btn-sm" id="btnBackOptions" style="margin-top:16px">← Volver</button>`;
  }
  // step 3
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDt = now.toISOString().slice(0, 16);
  return `
  ${head3}
  ${stepsBar}
  <div class="card">
    <div style="display:flex;gap:22px;flex-wrap:wrap">
      <img src="${esc(c.imagePath)}" style="width:180px;border-radius:14px;border:1px solid var(--line)">
      <div style="flex:1;min-width:240px">
        <div class="field"><label>Caption</label><textarea id="p_caption" style="min-height:120px">${esc(c.caption)}</textarea></div>
        <div class="field"><label>Hashtags</label><textarea id="p_tags" style="min-height:60px">${esc(c.hashtags)}</textarea></div>
      </div>
    </div>
    <div class="row2" style="margin-top:24px">
      <div class="field"><label>Fecha y hora de publicación</label><input type="datetime-local" id="p_when" min="${minDt}" value="${minDt}"></div>
      <div class="field"><label>&nbsp;</label><div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="btnSchedule">📅 Programar</button>
        <button class="btn btn-soft" id="btnNow">⚡ Publicar ahora</button>
        <button class="btn btn-ghost" id="btnDraft">💾 Borrador</button>
      </div></div>
    </div>
    <div id="pubMsg"></div>
    <button class="btn btn-ghost btn-sm" id="btnBack2" style="margin-top:8px">← Atrás</button>
  </div>`;
}

function bindCreator() {
  const c = CREATOR;
  if (c.step === 1) {
    // 📷 Foto del producto (opcional): se sube al momento y viaja como productPhoto.
    const renderProdBox = () => {
      const box = $('#c_prodPhotoBox');
      if (!box) return;
      box.innerHTML = c.productPhoto
        ? `<div style="display:flex;gap:10px;align-items:center">
            <img src="${esc(c.productPhoto)}" style="width:72px;height:90px;object-fit:cover;border-radius:10px;border:1px solid var(--line)" alt="Foto de tu producto">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" id="btnProdPhCh" type="button">Cambiar</button>
              <button class="btn btn-ghost btn-sm" id="btnProdPhRm" type="button">Quitar</button>
            </div>
          </div>`
        : `<div style="display:flex;gap:8px;flex-wrap:wrap">
             <button class="btn btn-ghost" id="btnProdPhAdd" type="button">📷 Agregar foto de tu producto</button>
             ${assetPhotos().length ? `<button class="btn btn-ghost" id="btnProdPhLib" type="button">🖼️ Tus fotos</button>` : ''}
           </div>
           <div id="prodPhLib" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px">
             ${assetPhotos().map(a => `<img src="${esc(a.file_path)}" data-prodpick="${esc(a.file_path)}" style="width:64px;height:80px;object-fit:cover;border-radius:10px;border:2px solid var(--line);cursor:pointer" alt="Tu foto">`).join('')}
           </div>
           <div id="prodPhMsg"></div>`;
      const trig = () => $('#c_prodPhotoFile').click();
      const bAdd = $('#btnProdPhAdd'); if (bAdd) bAdd.onclick = trig;
      const bLib = $('#btnProdPhLib'); if (bLib) bLib.onclick = () => { const l = $('#prodPhLib'); if (l) l.style.display = l.style.display === 'none' ? 'flex' : 'none'; };
      $$('#prodPhLib [data-prodpick]').forEach(img => img.onclick = () => { c.productPhoto = img.dataset.prodpick; renderProdBox(); });
      const bCh = $('#btnProdPhCh'); if (bCh) bCh.onclick = trig;
      const bRm = $('#btnProdPhRm'); if (bRm) bRm.onclick = () => { c.productPhoto = ''; renderProdBox(); };
    };
    const prodInput = $('#c_prodPhotoFile');
    if (prodInput) prodInput.onchange = async () => {
      const f = prodInput.files[0]; if (!f) return;
      if (!f.type.startsWith('image/')) { alert('Elegí un archivo de imagen'); return; }
      const msg = $('#prodPhMsg');
      if (msg) msg.innerHTML = `<div class="hint">⏳ Subiendo foto...</div>`;
      try {
        const r = await fetch('/api/assets?kind=photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/png' }, body: f });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'No pude subirlo 😅 Probá de nuevo');
        c.productPhoto = data.path;
        ASSETS = await api.get('/api/assets').catch(() => ASSETS);
      } catch (e) {
        alert('No se pudo subir la foto: ' + e.message);
      }
      renderProdBox();
    };
    renderProdBox();
    $$('[data-chip]').forEach(b => b.onclick = () => { const t = $('#c_topic'); if (t) { t.value = b.dataset.chip; t.focus(); } });
    $('#btnGen').onclick = async () => {
      c.topic = $('#c_topic').value.trim();
      if (!c.topic) {
        // Sin idea del usuario: Posta decide con los datos del negocio
        const p = (typeof PROFILE !== 'undefined' && PROFILE) || {};
        c.topic = [p.business_name, p.category].filter(Boolean).join(' — ') || 'Posteo para mi negocio';
      }
      const btn = $('#btnGen');
      btn.disabled = true; btn.textContent = '🎨 Armándo tus 6 opciones...';
      try {
        const out = await api.post('/api/creator/options', { topic: c.topic, productPhoto: c.productPhoto || undefined });
        if (!out || !Array.isArray(out.options) || out.options.length !== 6) throw new Error('Respuesta incompleta');
        c.options = out.options;
        c.detected = out.detected || null;
        c.recommendedIndex = out.recommendedIndex || 0;
        c.recommendedReason = out.recommendedReason || '';
        c.feedback = '';
        c.selected = [];
        c.cardPhoto = {};
        c.step = 'options'; render();
      } catch (e) {
        // Fallback al comportamiento viejo (pantalla de texto con caption/hashtags)
        try {
          const out = await api.post('/api/generate', { topic: c.topic });
          c.caption = out.caption; c.hashtags = out.hashtags;
          $('#genErr').innerHTML = '';
          $('#genOut').style.display = 'block';
          $('#c_caption').value = c.caption; $('#c_tags').value = c.hashtags;
        } catch (e2) { $('#genErr').innerHTML = `<div class="err">${esc(e2.message)}</div>`; }
        btn.disabled = false; btn.textContent = '✨ Armar mi posteo';
      }
    };
    const toDesign = $('#btnToDesign');
    if (toDesign) toDesign.onclick = () => {
      c.caption = $('#c_caption').value; c.hashtags = $('#c_tags').value;
      if (!c.title) c.title = c.topic.split(' ').slice(0, 4).join(' ').toUpperCase();
      if (!c.palTouched) c.pal = defaultPal();
      c.step = 2; render();
    };
  }
  if (c.step === 2) {
    const cv = $('#postCanvas');
    const redraw = async () => {
      const pi = await photoImg(c.photo);
      const logo = assetLogo() ? await photoImg(assetLogo().file_path) : null;
      drawPost(cv, { tpl: c.tpl, pal: c.pal, title: $('#d_title').value, subtitle: $('#d_sub').value, handle: $('#d_handle').value, photoImg: pi, logoImg: logo });
    };
    ['d_title', 'd_sub', 'd_handle'].forEach(id => $('#' + id).oninput = () => {
      c.title = $('#d_title').value; c.subtitle = $('#d_sub').value; c.handle = $('#d_handle').value; redraw();
    });
    $$('.tpl').forEach(t => t.onclick = () => { c.tpl = t.dataset.tpl; render(); });
    $$('.pal').forEach(p => p.onclick = () => { c.pal = +p.dataset.pal; c.palTouched = true; render(); });
    const fp = $('#d_photo');
    if (fp) {
      const pick = () => fp.click();
      const bAdd = $('#btnPhotoAdd'); if (bAdd) bAdd.onclick = pick;
      const bCh = $('#btnPhotoCh'); if (bCh) bCh.onclick = pick;
      const bRm = $('#btnPhotoRm'); if (bRm) bRm.onclick = () => { c.photo = ''; render(); };
      const bLib = $('#btnPhotoLib');
      if (bLib) bLib.onclick = () => { const z = $('#photoLib'); z.style.display = z.style.display === 'none' ? 'flex' : 'none'; };
      $$('#photoLib [data-lib]').forEach(im => im.onclick = () => { c.photo = im.dataset.lib; render(); });
      // Modo carrusel: multi-selección de 2 a 10 fotos con numerito de orden
      const bCar = $('#btnCarousel');
      if (bCar) bCar.onclick = () => { c.carouselMode = true; c.carouselPhotos = []; render(); };
      const bCarOff = $('#btnCarouselOff');
      if (bCarOff) bCarOff.onclick = () => { c.carouselMode = false; c.carouselPhotos = []; render(); };
      $$('#photoLib [data-carlib]').forEach(el => el.onclick = () => {
        const p = el.dataset.carlib;
        const i = c.carouselPhotos.indexOf(p);
        if (i >= 0) c.carouselPhotos.splice(i, 1);
        else { if (c.carouselPhotos.length >= 10) return; c.carouselPhotos.push(p); }
        render();
      });
      fp.onchange = () => {
        const f = fp.files[0]; if (!f) return;
        if (!f.type.startsWith('image/')) { alert('Elegí un archivo de imagen'); return; }
        const r = new FileReader();
        r.onload = () => { c.photo = r.result; render(); };
        r.readAsDataURL(f);
      };
    }
    c.title = $('#d_title').value; c.subtitle = $('#d_sub').value; c.handle = $('#d_handle').value;
    redraw();
    $('#btnBack1').onclick = () => { c.step = 1; render(); };
    $('#btnSaveDesign').onclick = async () => {
      // Modo carrusel: sin diseño canvas, las fotos van directo como slides
      if (c.carouselMode) {
        if (c.carouselPhotos.length < 2) {
          const e = $('#carErr');
          if (e) e.innerHTML = `<div class="err" style="margin-top:8px">Elegí al menos 2 fotos para el carrusel.</div>`;
          return;
        }
        c.imagePath = c.carouselPhotos[0]; c.isCarousel = true; c.step = 3; render(); return;
      }
      $('#btnSaveDesign').disabled = true; $('#btnSaveDesign').textContent = '⏳ Guardando...';
      try {
        const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        c.imagePath = data.path; c.fromOptions = false; c.step = 3; render();
      } catch (e) { alert('Error: ' + e.message); $('#btnSaveDesign').disabled = false; $('#btnSaveDesign').textContent = 'Guardar diseño →'; }
    };
  }
  if (c.step === 'options') {
    $$('.opt-use').forEach(b => b.onclick = () => {
      const o = c.options[+b.dataset.use]; if (!o) return;
      c.imagePath = o.image; c.caption = o.caption || ''; c.hashtags = o.hashtags || '';
      c.fromOptions = true;
      c.step = 3; render();
    });
    $$('.opt-customlink').forEach(b => b.onclick = () => {
      const o = c.options[+b.dataset.custom]; if (!o) return;
      c.title = o.title || ''; c.subtitle = o.subtitle || ''; c.caption = o.caption || '';
      c.hashtags = o.hashtags || ''; c.photo = o.image || '';
      c.tpl = 'gradiente'; c.pal = defaultPal(); c.palTouched = false;
      c.step = 2; render();
    });
    const applyOptions = (out) => {
      c.options = out.options; c.detected = out.detected || null;
      c.recommendedIndex = out.recommendedIndex || 0;
      c.recommendedReason = out.recommendedReason || '';
      c.selected = []; c.cardPhoto = {};
      render();
    };
    // ---- Selección múltiple ----
    function updateMultiBar() {
      const n = c.selected.length;
      const bar = $('#multiBar');
      if (!bar) return;
      bar.style.display = n ? 'flex' : 'none';
      $('#multiCount').textContent = `✅ ${n} elegido${n === 1 ? '' : 's'}`;
      $('#btnMultiSched').textContent = `Programar (${n})`;
    }
    $$('.opt-selbox').forEach(ch => ch.onchange = () => {
      const i = +ch.dataset.sel;
      c.selected = c.selected.filter(x => x !== i);
      if (ch.checked) { c.selected.push(i); c.selected.sort((a, b) => a - b); }
      const card = document.querySelector(`[data-card="${i}"]`);
      if (card) card.classList.toggle('selected', ch.checked);
      updateMultiBar();
    });
    // ---- Detalle en grande (tap en la imagen) ----
    $$('.opt-img').forEach(im => im.onclick = () => {
      const o = c.options[+im.dataset.optimg]; if (!o) return;
      $('#optLightImg').src = o.image;
      $('#optLightCap').textContent = (o.caption || '') + (o.hashtags ? '\n\n' + o.hashtags : '');
      $('#optLight').style.display = 'flex';
    });
    const closeLight = () => { const l = $('#optLight'); if (l) l.style.display = 'none'; };
    $('#btnLightClose').onclick = closeLight;
    $('#optLight').onclick = (e) => { if (e.target.id === 'optLight') closeLight(); };
    // ---- "📷 Mi foto" por tarjeta ----
    let pickIdx = null;
    function openMyPhotoPicker(idx) {
      pickIdx = idx;
      const o = c.options[idx]; if (!o) return;
      const lib = assetPhotos();
      $('#pickLib').innerHTML = lib.length
        ? lib.map(a => `<img src="${esc(a.file_path)}" data-pick="${esc(a.file_path)}" class="mp-thumb" alt="Tu foto">`).join('')
        : `<span class="mut">Todavía no subiste fotos.</span>`;
      const stock = (o.photoCandidates || []).filter(u => !lib.some(a => a.file_path === u)).slice(0, 6);
      $('#pickStock').innerHTML = stock.length
        ? stock.map(u => `<img src="${esc(u)}" data-pick="${esc(u)}" class="mp-thumb" alt="Foto del banco">`).join('')
        : `<span class="mut">Sin alternativas.</span>`;
      $('#pickMsg').innerHTML = '';
      $('#photoPickModal').style.display = 'flex';
    }
    async function applyCardPhoto(idx, photoUrl) {
      const o = c.options[idx]; if (!o) return;
      $('#pickMsg').innerHTML = `<div class="hint">⏳ Actualizando diseño...</div>`;
      try {
        const r = await api.post('/api/creator/rerender', {
          style: o.style, photo: photoUrl, headline: o.title, subline: o.subtitle,
          pill: o.pill, bar: o.bar, cta: o.cta, colors: o.colors,
        });
        if (!r || !r.image) throw new Error('Sin imagen');
        o.image = r.image;
        c.cardPhoto[idx] = photoUrl;
        if (o.photoCandidates && !o.photoCandidates.includes(photoUrl)) o.photoCandidates.unshift(photoUrl);
        const img = document.querySelector(`img[data-optimg="${idx}"]`);
        if (img) img.src = r.image;
        $('#photoPickModal').style.display = 'none';
      } catch (e) {
        $('#pickMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
    }
    $$('.opt-myphoto').forEach(b => b.onclick = () => openMyPhotoPicker(+b.dataset.mp));
    $('#photoPickModal').onclick = async (e) => {
      const t = e.target;
      if (t.id === 'photoPickModal' || t.id === 'btnPickClose') { $('#photoPickModal').style.display = 'none'; return; }
      if (t.id === 'btnPickUpload') { $('#pickFile').click(); return; }
      const pk = t.dataset && t.dataset.pick;
      if (pk && pickIdx !== null) await applyCardPhoto(pickIdx, pk);
    };
    $('#pickFile').onchange = async () => {
      const f = $('#pickFile').files[0]; if (!f || pickIdx === null) return;
      if (!f.type.startsWith('image/')) { alert('Elegí un archivo de imagen'); return; }
      $('#pickMsg').innerHTML = `<div class="hint">⏳ Subiendo foto...</div>`;
      try {
        const r = await fetch('/api/assets?kind=photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/png' }, body: f });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'No pude subirlo 😅 Probá de nuevo');
        ASSETS = await api.get('/api/assets').catch(() => ASSETS);
        await applyCardPhoto(pickIdx, data.path);
      } catch (e) {
        $('#pickMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
      $('#pickFile').value = '';
    };
    // ---- Subir fotos a la librería (arriba de las opciones) ----
    $('#btnUploadPhotos').onclick = () => $('#mpFiles').click();
    // ---- Borrar foto de la librería: no se usa más en posteos nuevos ----
    $$('#mpRow [data-mpdel]').forEach(b => b.onclick = async (ev) => {
      ev.stopPropagation();
      if (!confirm('¿Borrar esta foto? No se va a usar más en tus posteos nuevos.')) return;
      try {
        await api.delete('/api/assets/' + b.dataset.mpdel);
        ASSETS = await api.get('/api/assets').catch(() => ASSETS);
        render(); // refresca el creador y la tira de Mis fotos
      } catch (e) { alert('No se pudo borrar: ' + (e.message || e)); }
    });
    $('#mpFiles').onchange = async () => {
      const files = Array.from($('#mpFiles').files || []).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      const msg = $('#mpMsg');
      msg.innerHTML = `<div class="hint">⏳ Subiendo ${files.length} ${files.length === 1 ? 'foto' : 'fotos'}...</div>`;
      let ok = 0;
      for (const f of files) {
        try {
          const r = await fetch('/api/assets?kind=photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/png' }, body: f });
          const data = await r.json();
          if (r.ok) ok++;
          else if (msg) msg.innerHTML = `<div class="err">${esc(data.error || 'Error')}</div>`;
        } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      }
      $('#mpFiles').value = '';
      ASSETS = await api.get('/api/assets').catch(() => ASSETS);
      if (ok) {
        msg.innerHTML = `<div class="hint">✅ ¡Listo! Regenerando con tus fotos...</div>`;
        try {
          const out = await api.post('/api/creator/options', { topic: c.topic, productPhoto: c.productPhoto || undefined });
          if (out && Array.isArray(out.options) && out.options.length) { applyOptions(out); return; }
        } catch (e) { /* queda el mensaje de abajo */ }
        msg.innerHTML = `<div class="hint">✅ ¡Listo! Tocá "🔄 Regenerar opciones" para usarlas.</div>`;
      }
    };
    // ---- Programar N ----
    async function openSchedModal() {
      if (!c.selected.length) return;
      const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
      let scheduled = [];
      try { scheduled = await api.get('/api/posts?status=scheduled'); } catch (e) { scheduled = []; }
      const taken = new Set((scheduled || []).map(p => tzDayKey(p.scheduled_at, tz)).filter(Boolean));
      let off = 0;
      const rows = c.selected.map(idx => {
        let iso = slotDate19(0, tz);
        let guard = 0;
        while (guard++ < 90) {
          iso = slotDate19(off, tz); off++;
          const k = tzDayKey(iso, tz);
          if (k && !taken.has(k)) { taken.add(k); break; }
        }
        return { idx, iso };
      });
      $('#schedRows').innerHTML = rows.map(r => {
        const o = c.options[r.idx];
        return `<div class="sched-row" data-row="${r.idx}">
          <img src="${esc(o.image)}" class="sched-thumb" alt="">
          <div class="sched-info"><b>${esc(o.title || 'Diseño')}</b><span class="mut">${esc((o.caption || '').slice(0, 60))}…</span></div>
          <input type="datetime-local" data-swhen="${r.idx}" value="${isoToLocalInput(r.iso)}">
          <button class="btn btn-soft btn-sm sched-now" data-now="${r.idx}" title="Publicar ahora en Instagram">⚡ Postear ahora</button>
        </div>
        <div class="pubnow-mount" data-mount="${r.idx}"></div>`;
      }).join('');
      $('#schedMsg').innerHTML = '';
      // "⚡ Postear ahora" por fila: crea el post y lo publica al instante
      $$('#schedRows [data-now]').forEach(b => b.onclick = async () => {
        const idx = +b.dataset.now;
        const o = c.options[idx]; if (!o) return;
        b.disabled = true;
        const mount = document.querySelector(`#schedRows [data-mount="${idx}"]`);
        const row = document.querySelector(`#schedRows [data-row="${idx}"]`);
        try {
          const r = await api.post('/api/creator/schedule', { items: [{ image: o.image, caption: o.caption || '', hashtags: o.hashtags || '', scheduled_at: new Date().toISOString() }] });
          if (!r.ids || !r.ids.length) throw new Error('Ya hay un posteo igual creado hoy');
          const res = await publishNowFlow(r.ids[0], mount);
          if (res && res.ok) {
            // ya salió (o está saliendo): sacarlo de la selección para no duplicarlo al confirmar
            c.selected = c.selected.filter(x => x !== idx);
            const ch = document.querySelector(`.opt-selbox[data-sel="${idx}"]`);
            if (ch) ch.checked = false;
            const card = document.querySelector(`[data-card="${idx}"]`);
            if (card) card.classList.remove('selected');
            updateMultiBar();
            const inp = row ? row.querySelector('input[data-swhen]') : null;
            if (inp) inp.disabled = true;
            if (row) row.style.opacity = '.55';
            b.textContent = '✅ Posteado';
          } else {
            b.disabled = false;
          }
        } catch (e) {
          if (mount) mount.innerHTML = `<div class="err">${esc(e.message)}</div>`;
          b.disabled = false;
        }
      });
      $('#schedModal').style.display = 'flex';
    }
    $('#btnMultiSched').onclick = openSchedModal;
    $('#btnSchedCancel').onclick = () => { $('#schedModal').style.display = 'none'; };
    $('#schedModal').onclick = (e) => { if (e.target.id === 'schedModal') $('#schedModal').style.display = 'none'; };
    $('#btnSchedConfirm').onclick = async () => {
      const btn = $('#btnSchedConfirm');
      btn.disabled = true; btn.textContent = '⏳ Programando...';
      try {
        const items = c.selected.map(idx => {
          const o = c.options[idx];
          const inp = document.querySelector(`input[data-swhen="${idx}"]`);
          const v = inp && inp.value;
          if (!v) throw new Error('Elegí fecha y hora para todos los diseños');
          return { image: o.image, caption: o.caption || '', hashtags: o.hashtags || '', scheduled_at: new Date(v).toISOString() };
        });
        const r = await api.post('/api/creator/schedule', { items });
        $('#schedMsg').innerHTML = `<div class="okmsg">✅ ${r.count} ${r.count === 1 ? 'posteo programado' : 'posteos programados'} — <a href="#/app/schedule">ver en Schedule</a></div>`;
        c.selected = [];
        $$('.opt-selbox').forEach(ch => { ch.checked = false; });
        $$('.opt-card').forEach(cd => cd.classList.remove('selected'));
        updateMultiBar();
        setTimeout(() => { $('#schedModal').style.display = 'none'; location.hash = '#/app/schedule'; }, 1800);
      } catch (e) {
        $('#schedMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
        btn.disabled = false; btn.textContent = '✅ Confirmar';
      }
    };
    $('#btnRegen').onclick = async () => {
      if (!confirm('¿Genero 6 opciones nuevas? Las actuales se reemplazan.')) return;
      const btn = $('#btnRegen');
      btn.disabled = true; btn.textContent = '🎨 Generando nuevas opciones...';
      try {
        const out = await api.post('/api/creator/options', { topic: c.topic, productPhoto: c.productPhoto || undefined });
        if (!out || !Array.isArray(out.options) || !out.options.length) throw new Error('No llegaron opciones, probá de nuevo');
        // Motor de imágenes nivel agencia: intenta primero un concept shot por opción
        // con la foto del producto y las de la librería (máx 2). Si alguna falla,
        // esa opción queda con su imagen canvas de siempre — nada se rompe.
        const libRefs = (c.productPhoto ? [c.productPhoto] : [])
          .concat(assetPhotos().slice(0, 2).map(a => a.file_path)).slice(0, 2);
        const csTipo = tipoFromText(c.topic);
        await Promise.all(out.options.map(async (o) => {
          const p = await aiConceptShot({
            idea: c.topic || o.title || '',
            tipo: csTipo,
            headline: pickHeadline({ titulo: o.title }, o.caption),
            refs: libRefs,
          });
          if (p) o.image = p;
        }));
        applyOptions(out);
      } catch (e) {
        const capMsg = (e && e.aiCap) ? (e.message || 'Llegamos al tope de IA de hoy 🔋 Seguimos mañana 💪') : null;
        $('#optErr').innerHTML = `<div class="${capMsg ? 'okmsg' : 'err'}">${esc(capMsg || e.message)}</div>`;
        btn.disabled = false; btn.textContent = '🔄 Regenerar opciones';
      }
    };
    $('#btnFeedback').onclick = async () => {
      const inp = $('#fb_input');
      const fb = inp.value.trim();
      const msg = $('#feedbackMsg');
      if (!fb) { msg.innerHTML = `<div class="hint" style="margin:10px 0 0">Contame qué querés cambiar 👇</div>`; return; }
      const btn = $('#btnFeedback');
      btn.disabled = true; btn.textContent = '🔧 Arreglándolo...';
      try {
        const out = await api.post('/api/creator/options', { topic: c.topic, feedback: fb, productPhoto: c.productPhoto || undefined });
        if (!out || !Array.isArray(out.options) || !out.options.length) throw new Error('No llegaron opciones, probá de nuevo');
        c.feedback = fb; applyOptions(out);
      } catch (e) {
        msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
        btn.disabled = false; btn.textContent = 'Arreglar';
      }
    };
    $('#btnBackOptions').onclick = () => { c.step = 1; render(); };
  }
  if (c.step === 3) {
    const resetCreator = () => {
      CREATOR_OPEN = false;
      CREATOR = { step: 1, topic: '', caption: '', hashtags: '', tpl: 'gradiente', pal: 0, palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', options: null, detected: null, recommendedIndex: 0, recommendedReason: '', feedback: '', productPhoto: '', selected: [], cardPhoto: {}, carouselMode: false, carouselPhotos: [], isCarousel: false };
    };
    const done = (msg, hash) => {
      $('#pubMsg').innerHTML = `<div class="okmsg">${msg}</div>`;
      resetCreator();
      setTimeout(() => location.hash = hash || '#/app/schedule', 1400);
    };
    const carPayload = () => {
      const p = { image_path: c.imagePath, caption: c.caption, hashtags: c.hashtags };
      if (c.isCarousel) { p.media_type = 'carousel'; p.carousel_paths = c.carouselPhotos; }
      return p;
    };
    $('#btnSchedule').onclick = async () => {
      const when = $('#p_when').value;
      if (!when) { $('#pubMsg').innerHTML = `<div class="err">Elegí fecha y hora</div>`; return; }
      if (!(await checkQuotaOrModal())) return;
      c.caption = $('#p_caption').value; c.hashtags = $('#p_tags').value;
      try {
        await api.post('/api/posts', { ...carPayload(), scheduled_at: new Date(when).toISOString() });
        done('✅ Post programado. Se publica solo a la hora indicada.');
      } catch (e) { $('#pubMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
    $('#btnNow').onclick = async () => {
      const btn = $('#btnNow');
      if (!(await checkQuotaOrModal())) return;
      btn.disabled = true; // bloquea el doble tap
      c.caption = $('#p_caption').value; c.hashtags = $('#p_tags').value;
      try {
        const { id } = await api.post('/api/posts', carPayload());
        $('#pubMsg').innerHTML = '<div class="pubnow-mount"></div>';
        const r = await publishNowFlow(id, $('#pubMsg .pubnow-mount'));
        if (r && r.ok && r.permalink) {
          // publishNowFlow ya mostró "¡Publicado! Ver en IG ↗"
          resetCreator();
          setTimeout(() => location.hash = '#/app/schedule', 8000);
        } else if (r && r.ok) {
          done('⏳ Se está publicando… lo ves en Mi semana en un minuto.');
        }
        // si falló, publishNowFlow ya mostró el error con botón Reintentar
      } catch (e) {
        if (isPlanLimitErr(e)) { const q = await api.get('/api/quota').catch(() => null); quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' }); btn.disabled = false; return; }
        $('#pubMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; btn.disabled = false;
      }
    };
    $('#btnDraft').onclick = async () => {
      const btn = $('#btnDraft');
      // Guardar borrador no consume cupo: el plan limita las publicaciones, no la creación.
      btn.disabled = true;
      c.caption = $('#p_caption').value; c.hashtags = $('#p_tags').value;
      try {
        await api.post('/api/posts', carPayload());
        done('💾 Guardado como borrador. Lo revisás en Schedule.', '#/app/schedule');
      } catch (e) {
        if (isPlanLimitErr(e)) { const q = await api.get('/api/quota').catch(() => null); quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' }); btn.disabled = false; return; }
        $('#pubMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; btn.disabled = false;
      }
    };
    $('#btnBack2').onclick = () => { c.step = c.fromOptions ? 'options' : 2; render(); };
  }
}
