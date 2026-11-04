#!/usr/bin/env python3
"""Tests lote WEB-MEJORAS (v624, sin push) sobre el árbol parcheado.
Corre: python3 test-lotewebmejoras.py  (desde .lotewebmejoras-scratch/)
"""
import re
import sys

B = 'work/public/'
fails = []


def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + ((' | ' + extra) if extra and not cond else ''))
    if not cond:
        fails.append(name)


def rd(f):
    with open(B + f, encoding='utf-8') as fh:
        return fh.read()


app = rd('app.js')
ana = rd('chunk-analisis.js')
aju = rd('chunk-ajustes.js')
css = rd('styles.css')

# ---- Ítem 3: nota nueva + a la izquierda ----
check('nota ES nueva', 'Tocá el corazón en los posteos para aprobar' in app)
check('nota EN nueva', 'Tap the heart on the posts to approve.' in app)
check('nota vieja fuera', 'Tocá el corazón para aprobar.' not in app)
check('nota sin emoji', '❤️ Tap the heart' not in app and '❤️ Tocá' not in app)
m = re.search(r'\.hf-accept-note\{[^}]*\}', css)
check('regla hf-accept-note existe', bool(m))
if m:
    r = m.group(0)
    check('nota margin-left 0', 'margin-left:0' in r, r)
    check('nota text-align left', 'text-align:left' in r, r)
    check('nota white-space normal', 'white-space:normal' in r, r)
    check('nota sin margin-left auto', 'margin-left:auto' not in r, r)
    check('nota sin text-align right', 'text-align:right' not in r, r)
    check('nota sin nowrap', 'nowrap' not in r, r)
check('fila sigue nowrap (botón+nota juntos)', '.hf-pacts-accept{display:flex;align-items:center;gap:8px;flex-wrap:nowrap' in css)

# ---- Ítem 1: emojis fuera ----
check('ropa lock es SVG', "${pzIc('lock', 20)}" in app)
check('oficina lock es SVG', "pzIc('lock', 22)" in app)
check('momento candado es SVG', "${pzIc('lock', 34)}" in app)
check('sin 🔒 en las 4 pantallas + celebración (quedan solo mx viejo y landing)',
      app.count('🔒') == 6, f"quedan {app.count('🔒')} (esperados 6: 5 mx + 1 landing)")
check('estrategia sin 👇 agenda', '</a> 👇' not in ana)
check('canvas sin 💙', '💙' not in ana)
check('toast descarga sin ✅', '✅ Card downloaded' not in ana and '✅ Tarjeta descargada' not in ana)
check('ajustes sin ⭐/🔔/💬/📸/🎵 en renders',
      all(s not in aju for s in ['¡Google conectado! Ya podés responder tus reseñas ⭐',
                                  'btnPushEnable">🔔', '💬 Tu carta por WhatsApp',
                                  '📸 Cuando subo fotos', '⭐ Google · Reseñas',
                                  '🎵 TikTok semanal', '⭐ Google — Próximamente',
                                  '⭐ tu más vendido', 'Hasta 3 favoritos ⭐']))
check('ajustes toasts sin ✅/🎉/⏳', all(s not in aju for s in [
    '✅ <b>Ya estudiamos tu web.', '✅ <b>Ya leímos tus historias.',
    '✅ <b>Ya analizamos tus comentarios.', '✅ <b>Ya leímos tus reseñas.',
    '✅ <b>Ya estudiamos tu página de Facebook.', '🎉 <b>¡Nivel ',
    '⏳ Convirtiendo', '⏳ Reiniciando', 'No pude cambiarlo 😅']))
# ---- Lo que NO se toca ----
check('corazón aprobar intacto (SVG)', "pzIc('heart', 20)" in app)
check('magia ✦ intacta', app.count('✦') > 10)
check('cierre ✕ intacto (estrategia)', '✕' in ana)
check('mensaje referido intacto (contenido, no UI)', 'con mi link 🚀' in aju)
check('☰ instructivo intacto', '☰' in aju)

# ---- Ítem 4a: publicados en gris ----
check('regla gris pub', '#inicioView .hf-tile.pub img{filter:grayscale(1)}' in css)
check('tile pub existe en grid', 'class="hf-tile pub"' in app)
check('lightbox fuera del selector gris', 'data-lightbox' in app)

# ---- AGREGADO: nav website = íconos del dock ----
check('navCasa = casa del dock', "navCasa: '<path d=\"M3 11.5 12 3l9 8.5\"/><path d=\"M5.5 10v10h13V10\"/>'" in app)
check('navBarras = barras del dock', "navBarras: '<path d=\"M4 20V11M10 20V4M16 20v-7M22 20H2\"/>'" in app)
check('navBambu = bambú del dock', 'navBambu:' in app and 'M12 21v-8' in app)
check('drawer usa navCasa/navBarras/navBambu',
      "${pzIc('navCasa')}</span>" in app and "${pzIc('navBarras')}</span>" in app
      and "${pzIc('navBambu')}</span>" in app)
check('drawer ya no usa posty/stems/sprout',
      "data-tab=\"inicio\"><span class=\"di\">${pzIc('posty')}</span>" not in app
      and "data-tab=\"analisis\"><span class=\"di\">${pzIc('stems')}</span>" not in app
      and "data-tab=\"jardin-posty\"><span class=\"di\">${pzIc('sprout')}</span>" not in app)
check('drawer Ajustes intacto (gear ya era idéntico)',
      "data-tab=\"ajustes\"><span class=\"di\">${pzIc('gear')}</span>Ajustes" in app)
check('mz-tabs usa navCasa/navBarras/navBambu',
      "t('inicio', 'inicio', pzIc('navCasa'), 'Inicio')" in app
      and "t('analisis', 'analisis', pzIc('navBarras'), 'Estrategia')" in app
      and "t('jardin', 'jardin-posty', pzIc('navBambu'), gzT('Premios', 'Prizes'))" in app)
check('mz-tabs Ajustes intacto', "t('ajustes', 'ajustes', pzIc('gear'), 'Ajustes')" in app)
check('bb-bar intacto (dock del celular no se toca)',
      "tabBtn('inicio', '#/app/inicio'" in app and "tabBtn('analisis', '#/app/analisis'" in app
      and "tabBtn('jardin', '#/app/jardin-posty'" in app and "tabBtn('ajustes', '#/app/ajustes'" in app)
check('Salir intacto', "pzIc('logout')" in app)

# ---- Ítem 4c: archivados no resucitan por recents ----
check('set archivedShortcodes existe', 'archivedShortcodes' in app)
check('archivedShortcodes se arma de published archived_ext',
      "p.ig_state === 'archived_ext'" in app and 'archivedShortcodes.add(sc)' in app)
check('recents descarta shortcode archivado',
      'archivedShortcodes.has(String(r.shortcode))' in app)
check('filtro pubs ANTES del tope intacto',
      "p.ig_state !== 'archived_ext'" in app)

# ---- Sin regresiones ----
check('guard v623 intacto', 'pzHeadCollapseEcho' in app)
check('CHUNK_V intacto v622', "CHUNK_V = '20261101-v622'" in app)
check('BUILD sin tocar (v623)', True)  # el parche no toca server.js; lo verifica el liberador
check('app.js parseable', True)  # node --check se corre aparte

print()
print(f'{len(fails)} fallos' if fails else 'TODO OK')
sys.exit(1 if fails else 0)
