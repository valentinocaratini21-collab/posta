# Música de los reels (licencias)

Las 3 pistas de `assets/music/` son **CC0 (dominio público)**: se verificó la
licencia de cada archivo en Wikimedia Commons (API `imageinfo`, campo
`LicenseShortName = CC0`) antes de incluirlas. CC0 permite uso comercial sin
atribución; la citamos igual por transparencia.

Licencia CC0: https://creativecommons.org/publicdomain/zero/1.0/

| Archivo | Pista | Autor | Fuente (página del archivo) | Uso en Posty |
|---|---|---|---|---|
| `assets/music/upbeat.mp3` | "Curve" (Monplaisir – 10) | Monplaisir (Loyalty Freak Music) | https://commons.wikimedia.org/wiki/File:Monplaisir_-_10_-_Curve.ogg | mood `upbeat`: gastronomía, pizzerías, fitness y default |
| `assets/music/groove.mp3` | "First Dance" (Komiku – 64) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_64_-_First_Dance.ogg | mood `groove`: barberías, moda, mascotas, heladerías |
| `assets/music/chill.mp3` | "Chillin Poupi" (Komiku – 50) | Komiku | https://commons.wikimedia.org/wiki/File:Komiku_-_50_-_Chillin_Poupi.ogg | mood `chill`: cafeterías, panaderías, belleza, deco, florerías |

Preparación: recorte a 30 s, normalización loudnorm a −14 LUFS (estándar de
redes), MP3 128 kbps (~470 KB c/u). El motor (`reel-engine.js`) las recorta
a la duración del reel con fade in/out.

Si una pista se reemplaza, verificar la licencia en la página del archivo
ANTES de subirla y actualizar esta tabla.

## Mapa de beats (Motion v3, Fase 3 — 2026-10-20)

`assets/music/beats.json` guarda, por pista, el BPM detectado offline y la
grilla de beats que usa el motor v3 para hacer snap de los cortes de escena
(±150 ms). Se genera con `node music-beats.js --write` (análisis local con
ffmpeg, sin dependencias). Si una pista se reemplaza, REGENERAR el mapa.

Estado al 2026-10-20: `chill.mp3` 79.5 BPM (confianza 2.77) · `groove.mp3`
76 BPM (confianza 3.04) · `upbeat.mp3` SIN grilla detectable (flujo de
energía plano: la pista no tiene onsets percusivos claros) → con ese mood el
motor no hace snap y corta con las duraciones del guion, declarado en el
resultado (`beatsSnapped: 0`). No inventar el tempo: si se quiere snap en
upbeat, reemplazar la pista por una con percusión marcada y regenerar.
