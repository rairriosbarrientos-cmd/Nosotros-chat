# Nosotros — chat privado para dos

PWA (Next.js 16 + Supabase) solo para ustedes dos.

## Lo que tiene (y WhatsApp no)
- **Estado compartido**: "🏗️ En obra · te contesto a las 7". Ella lo ve arriba del chat, caduca solo.
- **Toque 💜**: un botón que le manda "pensé en ti" con lluvia de corazones, vibración y notificación.
- Responder deslizando, reacciones (doble toque = ❤️), mantener presionado = menú.
- Notas de voz con onda real, velocidad 1x/1.5x/2x y una sola suena a la vez.
- Borrar para los dos, "Mensajes nuevos" al abrir, "escribiendo…", "en línea", palomitas de leído.
- Fotos, emojis grandes cuando mandas solo emojis, notificaciones push, instalable en iPhone y Android.

## Qué ya está hecho
- Proyecto de Supabase **nosotros-chat** creado, esquema aplicado con seguridad (RLS) y bucket privado de archivos.
- Llaves de notificaciones (VAPID) generadas. Todo está en `env-vercel.txt` (archivo aparte, es secreto).

## Lo que falta (≈ 10 min, solo tú puedes por ser tus cuentas)
1. Supabase → Authentication → Users → **Add user** (correo + contraseña, marca *Auto Confirm User*) para ti y para ella.
2. Authentication → Sign In / Providers → desactiva **Allow new users to sign up**.
3. SQL Editor → registra a los dos (cambia correos y nombres):
   ```sql
   insert into public.members (user_id, display_name)
   select id, 'Rayr' from auth.users where email = 'TU-CORREO';
   insert into public.members (user_id, display_name)
   select id, 'Nombre de ella' from auth.users where email = 'CORREO-DE-ELLA';
   ```
4. Sube la carpeta a GitHub (sin `.env.local`) y en **Netlify**: Add new site → Import from Git → elige el repo. Antes del primer deploy, en *Site configuration → Environment variables* pega las 6 variables de `env-vercel.txt` (las `NEXT_PUBLIC_*` se leen al construir, así que si las cambias hay que volver a desplegar). Netlify detecta Next.js solo; ya incluye `netlify.toml` fijando Node 22. Usa HTTPS automático.
5. Instala:
   - **iPhone (Safari):** abrir la URL → Compartir → *Agregar a inicio* → abrirla desde el ícono → activar notificaciones (iOS 16.4+).
   - **Android (Chrome):** ⋮ → *Instalar app* → activar notificaciones.

## Checklist de prueba con 2 cel
- [ ] Texto al instante y ✓✓ al abrirlo.
- [ ] Foto en ambos lados; toque para ampliar.
- [ ] Nota de voz iPhone→Android y Android→iPhone.
- [ ] Notificación con la app cerrada y al tocarla abre el chat.
- [ ] Toque 💜: corazones en su pantalla y notificación.
- [ ] Estado: ponlo en un cel y verifica que sale en el otro.
- [ ] Modo avión → mandar → "Reintentar" al reconectar.

## Recordatorios, mensajes programados y modo insistente
- **Recordármelo**: mantén presionado un mensaje → ⏰ Recordármelo. Te llega un push a la hora elegida (se repite cada 30 min, hasta 4 veces, si tienes el modo insistente; se detiene en cuanto contestas).
- **Programar**: escribe un mensaje y toca el reloj junto al botón de enviar. Se manda solo, con la app cerrada.
- **Insistente** (menú ⋮): si el último mensaje es de la otra persona y no contestas, te empuja a los 30 min, 2 h, 6 h y 24 h. Silencio de 12 a 8 am (hora de México). Es opt-in por persona.
- Todo corre en Supabase (`supabase/v3_pendientes.sql`, pg_cron cada minuto) y avisa a `/api/push-due`, protegido con `CRON_SECRET` (variable de Netlify, igual al valor de `private_config.cron_secret`). El interruptor `private_config.push_enabled` debe estar en `'true'`.

## Seguridad
- RLS: solo quien esté en `members` lee o escribe. Solo puedes borrar lo tuyo; nadie edita mensajes.
- Bucket `media` privado con URLs firmadas de 1 h.
- `/api/notify` valida el JWT y solo notifica mensajes tuyos de los últimos 2 min. No usa service role.
- Los mensajes NO van cifrados de extremo a extremo (quien administre tu Supabase podría verlos). Privado, pero no es Signal.

## Siguientes ideas
- Recordatorio insistente si no contestas en X horas (necesita una función programada en Netlify).
- Mensajes programados, cuenta regresiva de fechas especiales, cifrado extremo a extremo.
