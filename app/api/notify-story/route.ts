import { createClient } from '@supabase/supabase-js';
import { sendNotification, setVapidDetails } from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Avisa que subiste un estado. Corre con tu JWT (RLS): solo avisa de TU estado reciente y solo a quienes
// comparten chat contigo (y no tienen ese chat silenciado). No usa service role.
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

  let storyId = '';
  try {
    const body = (await req.json()) as { storyId?: unknown };
    storyId = typeof body.storyId === 'string' ? body.storyId : '';
  } catch {
    /* body inválido */
  }
  if (!UUID.test(storyId)) return Response.json({ error: 'Solicitud inválida' }, { status: 400 });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const me = userData.user.id;

  const { data: story } = await supabase
    .from('stories')
    .select('id, kind, caption, created_at')
    .eq('id', storyId)
    .eq('user_id', me)
    .maybeSingle();
  if (!story) return Response.json({ error: 'Estado no encontrado' }, { status: 404 });
  if (Date.now() - new Date(story.created_at).getTime() > 2 * 60_000) {
    return Response.json({ error: 'Estado muy viejo' }, { status: 410 });
  }

  const { data: member } = await supabase.from('members').select('display_name').eq('user_id', me).maybeSingle();

  // Mis chats → las otras personas de esos chats que no los tienen silenciados
  const { data: mine } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', me);
  const convIds = (mine ?? []).map((c) => c.conversation_id as string);
  if (!convIds.length) return Response.json({ sent: 0 });
  const { data: others } = await supabase
    .from('conversation_members')
    .select('user_id, muted')
    .in('conversation_id', convIds)
    .neq('user_id', me);
  const ids = [...new Set((others ?? []).filter((o) => !o.muted).map((o) => o.user_id as string))];
  if (!ids.length) return Response.json({ sent: 0 });

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', ids);
  if (!subs?.length) return Response.json({ sent: 0 });

  setVapidDetails(subject, vapidPublic, vapidPrivate);
  const caption = (story.caption ?? '').trim();
  const payload = JSON.stringify({
    title: `${member?.display_name ?? 'Alguien'} subió un estado`,
    body: story.kind === 'image' ? `📷 ${caption || 'Foto'}` : caption.slice(0, 120),
    tag: `story-${me}`,
    url: '/',
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 6,
          urgency: 'normal',
        });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }),
  );
  return Response.json({ sent });
}
