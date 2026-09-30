# Posta en las tiendas — guía paso a paso

Todo lo técnico ya está en el código. Acá solo lo que tenés que hacer vos,
en orden, sin saltear pasos.

---

## PARTE 1 — Activar las push notifications (5 minutos)

Las push ya están programadas. Solo les faltan las claves para funcionar.

1. Abrí el archivo `~/workspace/posta-push-vapid.txt` (está en mi compu, NO en el zip).
2. Entrá a Railway → tu proyecto `posta-production` → pestaña **Variables**.
3. Agregá estas 2 variables (copiá y pegá los valores exactos del archivo):
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
4. Railway redespliega solo. Listo.
5. Para probar: abrí Posta en el celu → Ajustes → 🔔 Notificaciones → "Activar notificaciones" → aceptá la tarjeta de Posty y después el permiso del navegador.
6. Publicá un posteo de prueba: cuando salga, te tiene que llegar la push "¡Tu posteo ya salió! 📲".

Sin esas variables, las push quedan apagadas en silencio: nada se rompe.

---

## PARTE 2 — Play Store (cuenta de Google + PWABuilder)

### Paso 1 — Crear la cuenta de desarrollador (lo hacés vos, una sola vez)
1. Entrá a https://play.google.com/console y registrate como desarrollador.
2. Pagás USD 25 (único pago, no es suscripción).
3. Verificá tu identidad con lo que te pida (puede tardar 1-2 días).

### Paso 2 — Generar la app Android con PWABuilder (lo hacés vos)
1. Entrá a https://www.pwabuilder.com.
2. Pegá `https://www.postahacetodo.com` y dale a **Start**.
3. Tiene que dar todo ✅ (la PWA ya cumple: manifest completo, iconos 192+512 + maskable, display standalone, HTTPS, service worker).
4. En **Android**, elegí la opción recomendada y descargá el **AAB** (Android App Bundle).
   - Package ID sugerido: `com.postahacetodo.app` (tiene que ser este, el servidor ya lo espera).
   - Firmá con la opción default de PWABuilder.

### Paso 3 — Subir a Play Console (lo hacés vos)
1. En Play Console → **Crear app** → nombre "Posta", idioma español.
2. Subí el AAB en **Producción** (o primero en **Prueba interna** si querés probar vos solo).
3. Completá la ficha: descripción, iconos, capturas (pedímelas a mí).
4. En **Play App Signing** (está dentro de la configuración de la app), copiá el **SHA-256 del certificado**.

### Paso 4 — Conectar la app con la web (2 minutos)
1. Copiá ese SHA-256 en este formato exacto:
   `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"com.postahacetodo.app","sha256_cert_fingerprints":["PEGÁ_ACÁ_EL_SHA256"]}}]`
2. En Railway → Variables, agregá `ASSETLINKS_JSON` con ese texto.
3. Verificá: abrí `https://www.postahacetodo.com/.well-known/assetlinks.json` — tiene que mostrar tu SHA-256.

Sin el SHA-256 real, la app igual funciona pero abre en una pestaña de Chrome en vez de pantalla completa.

### Paso 5 — Revisión de Google
- Google revisa la app (normalmente 1-3 días) y te avisa por mail.
- Cuando la aprueben, aparece en el Play Store 🎉

---

## PARTE 3 — App Store (iPhone)

Buena noticia: ya tenés la cuenta **Apple Developer activa** (Hazlo LLC, Team ID `V86JY9BJR3`, renueva el 15/10/2026). No hay que crear nada.

Lo que falta es técnico y lo hago yo cuando me digas:
1. Armar el "envoltorio" nativo de la app (Capacitor) + las push como función nativa — Apple rechaza las apps que son solo la web empaquetada.
2. Compilar y subir con tu cuenta (me vas a tener que agregar como desarrollador al equipo o pasarme el acceso).
3. Apple la revisa (1-2 semanas, a veces piden cambios).

**Recomendación:** no frenar el lanzamiento por esto. Lanzamos con web + Play Store, y el App Store va en paralelo.

---

## Checklist PWABuilder (ya verificado en el código)

- [x] `manifest.json` completo: name, short_name, description, start_url, scope, display=standalone, orientation=portrait, lang=es, theme_color #2793C8, background_color #F2F9FD
- [x] Iconos 192 y 512 (`any`) + 192 y 512 (`maskable`)
- [x] `<link rel="manifest">` y `<meta name="theme-color">` en index.html
- [x] Service worker registrado (`/sw.js`) con handlers `push` y `notificationclick`
- [x] HTTPS en producción
- [x] `/.well-known/assetlinks.json` servido por el servidor (placeholder hasta el Paso 4)

---

*Última actualización: 2026-09-29. Si algo de esta guía no coincide con lo que ves en pantalla, avisame y la ajusto.*
