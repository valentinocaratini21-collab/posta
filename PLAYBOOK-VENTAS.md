# Posta — Playbook de ventas

## El pitch (30 segundos)

> "Posta es tu equipo de marketing en Instagram sin contratar a nadie.
> Vos nos contás de tu negocio una sola vez, y nosotros creamos las ideas,
> los diseños, los textos y publicamos por vos. Vos vendé. Nosotros posteamos."

## A quién se lo vendés

Negocios que dependen de Instagram pero no tienen tiempo ni equipo:

- Gastronomía (bares, cafés, restaurantes, pastelería)
- Moda e indumentaria (marcas chicas, showrooms)
- Estética y belleza (peluquerías, centros de estética, nails)
- Servicios (inmobiliarias, gimnasios, profesionales)
- Emprendedores que venden por IG

Señal de compra: publican poco, irregular, o el dueño lo hace todo desde el celular.

## Planes (editables en `config/plans.js`)

| Plan | Precio/mes | Ritmo |
|------|-----------|-------|
| Esencial | $29.900 | 3 posts/semana |
| Pro | $59.900 | 5 posts/semana |
| Total | $99.900 | 7 posts/semana |

Ángulo de venta: un community manager cobra $200.000+ por mes. Posta hace
ideas + diseños + textos + publicación por una fracción, sin que el cliente
toque nada.

## Qué necesitás del cliente (checklist día 1)

1. Datos del negocio (wizard de onboarding en la app, 5 minutos)
2. Acceso a su cuenta de Instagram convertida en **Business/Creator** + página de Facebook vinculada (guía en README)
3. Logo y 3–5 fotos del producto/local (las sube en el onboarding o por WhatsApp)
4. Pago: link de MercadoPago (la app lo genera solo)

Sin estos 4, no se puede publicar en su cuenta real. Con modo demo igual
podés mostrarle todo funcionando.

## Proceso de venta recomendado

1. **Demo**: mostrale la landing + un autopilot de ejemplo con su rubro
   (3 posts generados en 1 minuto). Eso vende solo.
2. **Cierre**: "¿Arrancamos con el Esencial? Son $29.900 por mes, sin
   permanencia." → le pasás el link de pago de MercadoPago.
3. **Onboarding**: le pasás su usuario + el wizard. Te manda logo/fotos.
4. **Conexión**: conectás su Instagram (una vez, 10 minutos).
5. **Listo**: el autopilot publica solo. Vos solo mirás que salga bien
   la primera semana.

## Objeciones comunes

- *"¿Y si no me gusta un post?"* → Tiene calendario con todo programado;
  se puede pausar, editar o regenerar cualquier post antes de que salga.
- *"¿Publican en mi cuenta de verdad?"* → Sí, con Instagram Business
  conectado. Nada se publica sin que el sistema esté configurado.
- *"¿Puedo cancelar?"* → Sí, mes a mes, sin permanencia.
- *"¿Quién escribe los textos?"* → La app genera captions y hashtags con el
  tono de tu negocio; el servicio incluye revisarlos.
- *"¿Estudian a mi competencia?"* → Cargás 2–3 competidores y las ideas
  se generan diferenciándote de ellos (los usamos como referencia, no es
  espionaje de sus métricas).

## Lo único que solo vos podés hacer (checklist del dueño)

- [ ] Crear cuenta en el hosting (Railway/Render/Fly) y deployar (guía en README)
- [ ] Crear cuenta de vendedor en MercadoPago y pegar el `MP_ACCESS_TOKEN` en env
- [ ] Crear la app de Meta para Instagram (guía en README) — una sola app;
  después se conecta la cuenta de cada cliente a esa misma app
- [ ] Definir tu WhatsApp de contacto en la landing (`WA_NUMBER` en env, solo dígitos con código país, ej: 5491112345678)
- [ ] Revisar precios en `config/plans.js` si querés cambiarlos
