# Posta — Vos vendé. Nosotros posteamos. 🇦🇷

Servicio done-for-you: el cliente cuenta de su negocio **una sola vez** y Posta
crea las ideas, los diseños y los captions — con **sus fotos, su logo y sus colores** —
y publica solo en su Instagram. El cliente no se ocupa de nada.

## Qué incluye

- **Landing vendedora**: hero "Vos vendé. Nosotros posteamos.", 3 pasos, qué incluye, planes dinámicos, FAQ, CTA a WhatsApp
- **Onboarding guiado** (4 pasos): negocio → competidores → estilo (logo + paleta) → objetivo
- **Ideas estratégicas** 💡: 7 ideas por negocio (novedad, promo, tip, testimonio, detrás de escena, comunidad, reel/video), con análisis de competidores
- **⚡ Piloto automático**: genera texto + diseño con tus fotos y logo y programa 3/5/7 posts a las 19:00 (hora de tu país), según tu plan
- **Generador con IA**: OpenAI (si hay API key) o plantillas locales en rioplatense
- **Diseñador de imágenes**: 4 plantillas × paletas (incluye "Mi marca"), PNG 1080×1350, foto de fondo opcional, **logo del cliente en la esquina**
- **Generador de video 🎬**: Reels/TikTok verticales 1080×1920, 1–5 escenas con Ken Burns, texto en pantalla, música MP3 opcional, máx. 60s (ffmpeg local, sin APIs)
- **Librería de medios 📷**: hasta 20 fotos + 1 logo por cliente; el autopilot las rota automáticamente
- **Programación**: cola de posts, publicar ahora, cancelar, reintentar
- **Publicación automática**: scheduler cada 1 minuto; imágenes → foto, videos → REELS
- **Modo demo**: todo funciona con publicaciones simuladas (default)
- **Modo real**: OAuth Meta + Instagram Graph API (Business/Creator + Página de FB)
- **Planes con Mercado Pago**: Esencial $29.900 / Pro $59.900 / Total $99.900 ARS/mes (3/5/7 posts por semana)
- **Refresh automático de tokens** de Instagram (diario) con aviso en Ajustes

## Correrlo

```bash
cd posta
npm install
npm start
```

Abrí http://localhost:3000 — creá tu cuenta, completá el onboarding y empezá.

## Variables de entorno

| Variable | Para qué | Requerida |
|---|---|---|
| `PORT` | Puerto (default 3000) | no |
| `NODE_ENV` | `production` activa validaciones estrictas | en prod |
| `SESSION_SECRET` | Secreto de sesiones — **obligatorio en producción** (el servidor no arranca sin él) | en prod |
| `COOKIE_SECURE` | `true` si servís por HTTPS (cookies seguras) | en prod con HTTPS |
| `OPENAI_API_KEY` | Generación con IA global (si no, cada usuario puede poner la suya en Ajustes; si no hay, se usan plantillas locales) | no |
| `IG_APP_ID` / `IG_APP_SECRET` | OAuth de Instagram global (si no, cada usuario pone la suya en Ajustes) | para modo real |
| `MP_ACCESS_TOKEN` | Token de Mercado Pago para suscripciones (sin él, los pagos quedan desactivados sin romper nada) | para cobrar |
| `IMAGE_BASE_URL` | URL pública base para imágenes/videos (requerida para publicar de verdad: Instagram descarga el archivo desde una URL pública) | para modo real |
| `WA_NUMBER` | Número de WhatsApp para el CTA de la landing (solo dígitos, ej: `5491100000000`) | no |
| `DATA_DIR` | Carpeta de la DB SQLite (default `./data`) | no |
| `MEDIA_DIR` | Carpeta de imágenes/videos subidos (default `./media`) | no |

⚠️ **SQLite + producción**: la DB es un archivo. En cualquier deploy necesitás un **volumen persistente** para `DATA_DIR` y `MEDIA_DIR`, si no perdés usuarios, posts y archivos en cada redeploy.

## Checklist de credenciales para salir a vender

1. `SESSION_SECRET` — generá uno largo y aleatorio (`openssl rand -hex 32`)
2. Dominio con HTTPS + `IMAGE_BASE_URL=https://tu-dominio.com` + `COOKIE_SECURE=true`
3. App de Meta: `IG_APP_ID`/`IG_APP_SECRET`, permisos `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, redirect `https://tu-dominio.com/api/ig/callback`, revisión de app aprobada
4. `MP_ACCESS_TOKEN` de Mercado Pago (credenciales de producción)
5. `WA_NUMBER` para que te escriban desde la landing
6. (Opcional) `OPENAI_API_KEY` para mejor calidad de textos
7. Volúmenes persistentes para `data/` y `media/`

## Deploy paso a paso

### Railway

1. Creá un proyecto nuevo desde tu repo (`New → Deploy from GitHub repo`).
2. Agregá un **Volume** montado en `/app/data` y otro en `/app/media` (o un solo volumen y `DATA_DIR=/app/data`, `MEDIA_DIR=/app/media`).
3. Variables: `NODE_ENV=production`, `SESSION_SECRET`, `COOKIE_SECURE=true`, más las de la checklist.
4. Start command: `npm start`. Railway expone `PORT` solo — la app lo respeta.

### Render

1. `New → Web Service` desde tu repo. Build: `npm ci`, Start: `npm start`.
2. Agregá **Disks** persistentes en `/app/data` y `/app/media`.
3. Environment variables: `NODE_ENV=production`, `SESSION_SECRET`, `COOKIE_SECURE=true`, `IMAGE_BASE_URL=https://tu-app.onrender.com`, etc.

### Fly.io

1. `fly launch` (Dockerfile incluido). Agregá volúmenes:
   ```bash
   fly volumes create posta_data --size 1
   fly volumes create posta_media --size 5
   ```
   y montalos en `/app/data` y `/app/media` en `fly.toml`:
   ```toml
   [[mounts]]
     source = "posta_data"
     destination = "/app/data"
   [[mounts]]
     source = "posta_media"
     destination = "/app/media"
   ```
2. `fly secrets set SESSION_SECRET=... NODE_ENV=production COOKIE_SECURE=true IMAGE_BASE_URL=https://tu-app.fly.dev MP_ACCESS_TOKEN=...`

### Docker (cualquiera)

```bash
docker compose up -d --build
```

El `Dockerfile` instala `ffmpeg` (videos) y fuentes DejaVu (texto en videos).

## Publicar de verdad en Instagram (modo real)

1. Cuenta de Instagram **Business o Creator** vinculada a una **Página de Facebook**.
2. App en [Meta for Developers](https://developers.facebook.com/) con producto "Instagram Graph API" y los permisos listados arriba; OAuth redirect `https://tu-dominio.com/api/ig/callback`; revisión aprobada.
3. Deploy con dominio público + `IMAGE_BASE_URL` (Instagram descarga la imagen/video desde ahí).
4. En la app: Ajustes → desactivá el **modo demo** → **Conectar Instagram** → autorizá.

**Reels**: los posts con `media_type='video'` se publican como REELS: se crea el contenedor con `media_type=REELS` + `video_url`, se espera a que Meta termine de procesarlo y se publica. Requiere `ffmpeg` en el servidor (incluido en el Dockerfile).

**Tokens**: los tokens de Instagram duran ~60 días. La app los renueva sola cada noche (cron 3:00 AM). Si falla, aparece un aviso en Ajustes para reconectar.

## Estructura

```
posta/
  server.js       → API + auth + OAuth + Mercado Pago + servido del frontend
  db.js           → SQLite: users, profiles, settings, posts, assets (+ migraciones livianas)
  generator.js    → IA (OpenAI) + plantillas locales en rioplatense + ideas estratégicas
  instagram.js    → OAuth Meta + Graph API (fotos y REELS) + modo demo
  scheduler.js    → cron cada 1 min que publica lo programado
  video.js        → generador de video vertical con ffmpeg (Ken Burns + texto + música)
  tokenrefresh.js → cron diario que renueva tokens de Instagram
  mercadopago.js  → suscripciones /preapproval + webhook
  config/plans.js → planes y precios (una sola fuente)
  public/         → SPA: landing, auth, onboarding, crear, ideas, video, mis fotos, calendario, historial, ajustes
  media/          → imágenes/videos subidos (persistir en prod)
  data/           → posta.db (persistir en prod)
```

## Roadmap

- [ ] Mejores horarios sugeridos por IA según analytics
- [ ] Respuestas automáticas a comentarios/DMs
- [ ] Múltiples cuentas por usuario
- [ ] Carruseles
