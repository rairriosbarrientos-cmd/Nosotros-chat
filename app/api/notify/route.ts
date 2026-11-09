import { createClient } from '@supabase/supabase-js';
import { sendNotification, setVapidDetails } from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function preview(kind: string, body: string | null): string {
  if (kind === 'image') return '📷 Foto';
  if (kind === 'audio') return '🎤 Nota de voz';
  if (kind === 'ping') return '💜 Está pensando en ti';
  const text = (body ?? '').trim();
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!url || !anon || !vapidPublic || !vapidPrivate || !subject) {
    return Response.json({ error: 'Servidor sin configurar' }, { status: 500 });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'No autorizado' }, { status: 401 });

  let messageId = '';
  try {
    const body = (await req.json()) as { messageId?: unknown };
    messageId = typeof body.messageId === 'string' ? body.messageId : '';
  } catch {
    /* body inválido */
  }
  if (!UUID.test(messageId)) return Response.json({ error: 'Solicitud inválida' }, { status: 400 });

  // Todo corre con el JWT de quien manda: las políticas RLS deciden qué puede ver. No se usa service role.
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const me = userData.user.id;

  // Solo se notifica un mensaje real, tuyo y reciente (evita usar esto para mandar textos arbitrarios)
  const { data: msg } = await supabase
    .from('messages')
    .select('id, sender_id, kind, body, created_at')
    .eq('id', messageId)
    .eq('sender_id', me)
    .maybeSingle();
  if (!msg) return Response.json({ error: 'Mensaje no encontrado' }, { status: 404 });
  if (Date.now() - new Date(msg.created_at).getTime() > 2 * 60_000) {
    return Response.json({ error: 'Mensaje muy viejo' }, { status: 410 });
  }

  const { data: member } = await supabase
    .from('members')
    .select('display_name')
    .eq('user_id', me)
    .maybeSingle();

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .neq('user_id', me);

  if (!subs?.length) return Response.json({ sent: 0 });

  setVapidDetails(subject, vapidPublic, vapidPrivate);
  const payload = JSON.stringify({
    title: member?.display_name ?? 'Nuevo mensaje',
    body: preview(msg.kind, msg.body),
    tag: 'chat',
    url: '/',
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: 'high' },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = el dispositivo ya no existe: se borra la suscripción
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }),
  );

  return Response.json({ sent });
}
