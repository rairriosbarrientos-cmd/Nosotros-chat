import { timingSafeEqual } from 'node:crypto';
import { sendNotification, setVapidDetails } from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lo llama el cron de Supabase (pg_net) cada vez que hay recordatorios, programados o empujones por avisar.
// No toca la base de datos ni usa service role: Supabase ya manda las suscripciones armadas.

type Sub = { endpoint: string; p256dh: string; auth: string };
type Item = { title: string; body: string; tag: string; url: string; subs: Sub[] };

const PUSH_HOSTS = [
  /(^|\.)googleapis\.com$/, // FCM (Android / Chrome)
  /(^|\.)push\.apple\.com$/, // iOS / Safari
  /(^|\.)mozilla\.com$/, // Firefox
  /(^|\.)mozaws\.net$/,
  /(^|\.)notify\.windows\.com$/, // Edge
];

function allowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function isStr(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function parseItems(raw: unknown): Item[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as { items?: unknown }).items;
  if (!Array.isArray(list)) return [];
  const out: Item[] = [];
  for (const it of list.slice(0, 20)) {
    if (!it || typeof it !== 'object') continue;
    const { title, body, tag, subs, url } = it as Record<string, unknown>;
    if (!isStr(title, 120) || typeof body !== 'string' || body.length > 300 || !isStr(tag, 80)) continue;
    if (!Array.isArray(subs)) continue;
    const clean: Sub[] = [];
    for (const s of subs.slice(0, 5)) {
      if (!s || typeof s !== 'object') continue;
      const { endpoint, p256dh, auth } = s as Record<string, unknown>;
      if (isStr(endpoint, 1000) && isStr(p256dh, 200) && isStr(auth, 100) && allowedEndpoint(endpoint)) {
        clean.push({ endpoint, p256dh, auth });
      }
    }
    const safeUrl = typeof url === 'string' && /^\/(\?c=[0-9a-f-]{36})?$/i.test(url) ? url : '/';
    if (clean.length) out.push({ title, body, tag, url: safeUrl, subs: clean });
  }
  return out;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!secret || !vapidPublic || !vapidPrivate || !subject) {
    return Response.json({ error: 'Servidor sin configurar' }, { status: 500 });
  }

  const given = req.headers.get('x-cron-secret') ?? '';
  if (!safeEqual(given, secret)) return Response.json({ error: 'No autorizado' }, { status: 401 });

  let items: Item[] = [];
  try {
    items = parseItems(await req.json());
  } catch {
    return Response.json({ error: 'Solicitud inválida' }, { status: 400 });
  }
  if (!items.length) return Response.json({ sent: 0 });

  setVapidDetails(subject, vapidPublic, vapidPrivate);

  let sent = 0;
  let failed = 0;
  await Promise.all(
    items.flatMap((item) => {
      const payload = JSON.stringify({ title: item.title, body: item.body, tag: item.tag, url: item.url });
      return item.subs.map(async (s) => {
        try {
          await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 60 * 60 * 12,
            urgency: 'high',
          });
          sent++;
        } catch {
          failed++;
        }
      });
    }),
  );

  return Response.json({ sent, failed });
}
