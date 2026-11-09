import { supabaseBrowser } from './supabase';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export type PushState = 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied';

export function pushState(): PushState {
  if (typeof window === 'undefined') return 'unsupported';
  // En iPhone el push solo existe cuando la app está instalada en la pantalla de inicio
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as PushState;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Suscripción incompleta');
  const { error } = await supabaseBrowser().from('push_subscriptions').upsert(
    { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

/** Debe llamarse desde un toque del usuario (iOS lo exige). */
export async function enablePush(): Promise<PushState> {
  if (!VAPID_PUBLIC) throw new Error('Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushState;

  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    }));
  await saveSubscription(sub);
  return 'granted';
}

/** Al abrir la app: si ya había permiso, vuelve a guardar la suscripción por si cambió. */
export async function syncPush() {
  if (pushState() !== 'granted' || !VAPID_PUBLIC) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await saveSubscription(sub);
}

/** Avisa a la otra persona (el servidor manda el push). Si falla, no rompe el envío del mensaje. */
export async function notifyPartner(messageId: string) {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messageId }),
      keepalive: true,
    });
  } catch {
    /* el push es un extra; el mensaje ya se guardó */
  }
}

/** Avisa a tus contactos que subiste un estado (best-effort). */
export async function notifyStory(storyId: string) {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/notify-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storyId }),
      keepalive: true,
    });
  } catch {
    /* el aviso es un extra */
  }
}

/** Al cerrar sesión: este dispositivo deja de recibir los avisos de esa cuenta. */
export async function disablePush() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await supabaseBrowser().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch {
    /* si falla, el servidor limpia la suscripción cuando el push regrese 404/410 */
  }
}
