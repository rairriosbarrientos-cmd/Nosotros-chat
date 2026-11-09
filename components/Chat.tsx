'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import ActionSheet from './ActionSheet';
import Bubble, { type Msg } from './Bubble';
import Composer from './Composer';
import StatusSheet from './StatusSheet';
import TimeSheet from './TimeSheet';
import PendingSheet from './PendingSheet';
import Avatar from './Avatar';
import ProfileSheet from './ProfileSheet';
import StoryComposer, { type StoryDraft } from './StoryComposer';
import StoryViewer from './StoryViewer';
import { formatUntil, snippet } from '@/lib/emoji';
import { getSignedUrl, resizeImage, squareImage, uploadMedia } from '@/lib/media';
import {
  disablePush,
  enablePush,
  isIOS,
  notifyPartner,
  pushState,
  registerServiceWorker,
  syncPush,
  type PushState,
} from '@/lib/push';
import {
  APP_NAME,
  activeStatus,
  supabaseBrowser,
  type Kind,
  type Member,
  type Message,
  type Reminder,
  type Scheduled,
  type Story,
  type StoryView,
  type Reaction,
} from '@/lib/supabase';

const PAGE = 50;
const GROUP_MS = 5 * 60_000;
const PING_COOLDOWN_MS = 4000;

function merge(prev: Msg[], incoming: Msg[]): Msg[] {
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id),
  );
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Hoy';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

type Heart = { l: number; d: number; s: number };

export default function Chat({
  conversationId,
  partnerId,
  onBack,
}: {
  conversationId: string;
  partnerId: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [me, setMe] = useState<Member | null>(null);
  const [partner, setPartner] = useState<Member | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [push, setPush] = useState<PushState>('unsupported');
  const [bannerOff, setBannerOff] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [actionMsg, setActionMsg] = useState<Msg | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [remindMsg, setRemindMsg] = useState<Msg | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [storyViews, setStoryViews] = useState<StoryView[]>([]);
  const [viewer, setViewer] = useState<{ who: 'me' | 'partner'; index: number } | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [rain, setRain] = useState<Heart[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const listRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const meRef = useRef<Member | null>(null);
  const stickRef = useRef(true);
  const lastIdRef = useRef<string | null>(null);
  const firstUnreadRef = useRef<string | null>(null);
  const restoreRef = useRef<{ h: number; top: number } | null>(null);
  const loadingOldRef = useRef(false);
  const retryRef = useRef(new Map<string, () => Promise<void>>());
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const lastPing = useRef(0);
  const replyRef = useRef<Msg | null>(null);
  const loadStoriesRef = useRef<() => void>(() => {});
  const msgIdsRef = useRef<Set<string>>(new Set());

  const sb = supabaseBrowser;
  const meId = me?.user_id;

  useEffect(() => {
    msgIdsRef.current = new Set(msgs.map((m) => m.id));
  }, [msgs]);

  useEffect(() => {
    replyRef.current = replyTo;
  }, [replyTo]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const scrollBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(false);
  }, []);

  const startRain = useCallback(() => {
    setRain(
      Array.from({ length: 16 }, () => ({
        l: Math.random() * 96,
        d: Math.random() * 0.7,
        s: 18 + Math.random() * 24,
      })),
    );
    if ('vibrate' in navigator) navigator.vibrate([40, 60, 40, 60, 90]);
    if (rainTimer.current) clearTimeout(rainTimer.current);
    rainTimer.current = setTimeout(() => setRain(null), 3200);
  }, []);

  // ───────── Carga y sincronía ─────────
  const loadLatest = useCallback(async (): Promise<Message[] | null> => {
    const { data, error } = await sb()
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    return error ? null : ((data as Message[] | null) ?? []);
  }, [sb, conversationId]);

  /** Mezcla lo último del servidor y quita lo que ya no existe (borrado mientras estabas fuera). */
  const applyLatest = useCallback((data: Message[]) => {
    setMsgs((prev) => {
      const ids = new Set(data.map((m) => m.id));
      const oldest = data.length ? Math.min(...data.map((m) => new Date(m.created_at).getTime())) : Infinity;
      const next = prev.filter((m) => m.local || ids.has(m.id) || new Date(m.created_at).getTime() < oldest);
      return merge(next, data);
    });
  }, []);

  const loadReactions = useCallback(async () => {
    const { data } = await sb()
      .from('reactions')
      .select('message_id, user_id, emoji, messages!inner(conversation_id)')
      .eq('messages.conversation_id', conversationId)
      .limit(3000);
    if (data) {
      setReactions(
        (data as unknown as Reaction[]).map((r) => ({ message_id: r.message_id, user_id: r.user_id, emoji: r.emoji })),
      );
    }
  }, [sb, conversationId]);

  const fetchLatest = useCallback(async () => {
    const data = await loadLatest();
    if (data) applyLatest(data);
    await loadReactions();
  }, [loadLatest, applyLatest, loadReactions]);

  const markRead = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    await sb().rpc('mark_read', { p_conv: conversationId });
  }, [sb, conversationId]);

  // Arranque: sesión, miembros, mensajes, tiempo real
  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      const client = sb();
      const { data: sess } = await client.auth.getSession();
      if (!sess.session) {
        router.replace('/login');
        return;
      }
      const uid = sess.session.user.id;

      const { data: members, error } = await client
        .from('members')
        .select('user_id, display_name, status_emoji, status_text, status_until, nudges_on, avatar_path');
      if (cancelled) return;
      const mine = (members as Member[] | null)?.find((m) => m.user_id === uid);
      if (error || !mine) {
        setFatal('Esta cuenta no está autorizada en este chat.');
        setReady(true);
        return;
      }
      const other = (members as Member[]).find((m) => m.user_id === partnerId) ?? null;
      meRef.current = mine;
      setMe(mine);
      setPartner(other);

      const first = await loadLatest();
      if (cancelled) return;
      if (first === null) throw new Error('sin conexión');
      const asc = merge([], first);
      const unread = asc.find((m) => m.sender_id !== uid && !m.read_at && m.kind !== 'ping');
      firstUnreadRef.current = unread?.id ?? null;
      setFirstUnreadId(unread?.id ?? null);
      setMsgs(asc);
      setHasMore(first.length === PAGE);
      setReady(true);
      void loadReactions();
      void markRead();

      void registerServiceWorker().then(() => syncPush().catch(() => {}));
      setPush(pushState());

      channel = client.channel(`nosotros-${conversationId}`, {
        config: { presence: { key: uid }, broadcast: { self: false } },
      });
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id;
            if (id) setMsgs((p) => p.filter((m) => m.id !== id));
            return;
          }
          const m = payload.new as Message;
          if (m.conversation_id && m.conversation_id !== conversationId) return;
          setMsgs((p) => merge(p, [m]));
          if (payload.eventType === 'INSERT' && m.sender_id !== uid) {
            if (document.visibilityState === 'visible') {
              if (m.kind === 'ping') startRain();
              void markRead();
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<Reaction>;
            setReactions((p) => p.filter((r) => !(r.message_id === old.message_id && r.user_id === old.user_id)));
            return;
          }
          const r = payload.new as Reaction;
          if (!msgIdsRef.current.has(r.message_id)) return;
          setReactions((p) => [...p.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id)), r]);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members' }, (payload) => {
          const m = payload.new as Member;
          if (m.user_id === uid) {
            meRef.current = m;
            setMe(m);
          } else if (m.user_id === partnerId) {
            setPartner(m);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => loadStoriesRef.current())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_views' }, () => loadStoriesRef.current())
        .on('broadcast', { event: 'typing' }, () => {
          setTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTyping(false), 3000);
        })
        .on('presence', { event: 'sync' }, () => {
          const state = channel?.presenceState() ?? {};
          setOnline(other ? other.user_id in state : false);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel?.track({ at: Date.now() });
        });
      channelRef.current = channel;
    })().catch((e: unknown) => {
      if (!cancelled) {
        const msg = e instanceof Error ? e.message : '';
        setFatal(
          msg.startsWith('Faltan')
            ? 'Faltan las variables de Supabase en Netlify. Agrégalas (con "Builds" marcado) y vuelve a desplegar.'
            : 'No pude cargar el chat. Revisa tu conexión.',
        );
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (rainTimer.current) clearTimeout(rainTimer.current);
      if (channel) void sb().removeChannel(channel);
      channelRef.current = null;
    };
  }, [sb, router, loadLatest, loadReactions, markRead, startRain]);

  // Reloj para que los estados caduquen solos
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Al volver a la app (iOS suspende el tiempo real): rellena huecos y marca leídos
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !meRef.current) return;
      void fetchLatest();
      void markRead();
      setPush(pushState());
      setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [fetchLatest, markRead]);

  // Teclado en iPhone: la altura de la app sigue al viewport visible
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const set = () => {
      document.documentElement.style.setProperty('--app-h', `${vv.height}px`);
      if (stickRef.current) requestAnimationFrame(() => scrollBottom());
    };
    set();
    vv.addEventListener('resize', set);
    vv.addEventListener('scroll', set);
    return () => {
      vv.removeEventListener('resize', set);
      vv.removeEventListener('scroll', set);
      document.documentElement.style.removeProperty('--app-h');
    };
  }, [scrollBottom]);

  // Scroll: al fondo si llegó algo nuevo y estabas abajo (o es tuyo); al primer no leído en la carga inicial
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (restoreRef.current) {
      const { h, top } = restoreRef.current;
      el.scrollTop = el.scrollHeight - h + top;
      restoreRef.current = null;
      return;
    }
    const last = msgs[msgs.length - 1];
    if (!last || last.id === lastIdRef.current) return;
    const firstLoad = lastIdRef.current === null;
    lastIdRef.current = last.id;
    if (firstLoad) {
      const divider = firstUnreadRef.current ? document.getElementById('unread-divider') : null;
      if (divider) {
        divider.scrollIntoView({ block: 'start' });
        el.scrollTop = Math.max(0, el.scrollTop - 56);
        stickRef.current = false;
      } else {
        scrollBottom(false);
      }
    } else if (stickRef.current || last.sender_id === meRef.current?.user_id) {
      scrollBottom(true);
    } else {
      setNewBelow(true);
    }
  }, [msgs, scrollBottom]);

  const loadOlder = useCallback(async () => {
    const el = listRef.current;
    const oldest = msgs[0];
    if (!el || !oldest || loadingOldRef.current) return;
    loadingOldRef.current = true;
    const { data } = await sb()
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (data && data.length) {
      restoreRef.current = { h: el.scrollHeight, top: el.scrollTop };
      setMsgs((p) => merge(p, data as Message[]));
    }
    setHasMore((data?.length ?? 0) === PAGE);
    loadingOldRef.current = false;
  }, [msgs, sb, conversationId]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = fromBottom < 120;
    if (stickRef.current) setNewBelow(false);
    if (el.scrollTop < 80 && hasMore) void loadOlder();
  };

  // ───────── Envío (optimista, con reintento) ─────────
  const runSend = useCallback((optimistic: Msg, attempt: () => Promise<void>) => {
    const id = optimistic.id;
    const wrapped = async () => {
      setMsgs((p) => p.map((m) => (m.id === id ? { ...m, local: 'pending' } : m)));
      try {
        await attempt();
        setMsgs((p) => p.map((m) => (m.id === id ? { ...m, local: undefined } : m)));
        retryRef.current.delete(id);
        void notifyPartner(id);
      } catch {
        setMsgs((p) => p.map((m) => (m.id === id ? { ...m, local: 'failed' } : m)));
      }
    };
    retryRef.current.set(id, wrapped);
    stickRef.current = true;
    setMsgs((p) => merge(p, [optimistic]));
    void wrapped();
  }, []);

  const base = useCallback(
    (kind: Kind, extra: Partial<Msg>): Msg => {
      const reply = replyRef.current;
      if (reply) setReplyTo(null);
      return {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        sender_id: meId ?? '',
        kind,
        body: null,
        media_path: null,
        media_mime: null,
        duration_ms: null,
        waveform: null,
        reply_to: kind === 'ping' ? null : (reply?.id ?? null),
        created_at: new Date().toISOString(),
        read_at: null,
        local: 'pending',
        ...extra,
      };
    },
    [meId, conversationId],
  );

  const insertRow = useCallback(
    async (row: Record<string, unknown>) => {
      const { error } = await sb().from('messages').insert({ ...row, conversation_id: conversationId });
      if (error && error.code !== '23505') throw error; // 23505 = ya estaba guardado
    },
    [sb, conversationId],
  );

  const sendText = useCallback(
    (text: string) => {
      const m = base('text', { body: text });
      runSend(m, () => insertRow({ id: m.id, kind: 'text', body: text, reply_to: m.reply_to }));
    },
    [base, runSend, insertRow],
  );

  const sendImage = useCallback(
    (file: File) => {
      if (!meId) return;
      const m = base('image', { localUrl: URL.createObjectURL(file), media_mime: 'image/jpeg' });
      let path: string | undefined;
      runSend(m, async () => {
        if (!path) path = await uploadMedia(meId, await resizeImage(file), 'image/jpeg', 'jpg');
        await insertRow({ id: m.id, kind: 'image', media_path: path, media_mime: 'image/jpeg', reply_to: m.reply_to });
      });
    },
    [base, meId, runSend, insertRow],
  );

  const sendAudio = useCallback(
    (blob: Blob, mime: string, ext: string, durationMs: number, waveform: number[]) => {
      if (!meId) return;
      const wave = waveform.length ? waveform : null;
      const m = base('audio', {
        localUrl: URL.createObjectURL(blob),
        media_mime: mime,
        duration_ms: durationMs,
        waveform: wave,
      });
      let path: string | undefined;
      runSend(m, async () => {
        if (!path) path = await uploadMedia(meId, blob, mime, ext);
        await insertRow({
          id: m.id,
          kind: 'audio',
          media_path: path,
          media_mime: mime,
          duration_ms: durationMs,
          waveform: wave,
          reply_to: m.reply_to,
        });
      });
    },
    [base, meId, runSend, insertRow],
  );

  const sendPing = useCallback(() => {
    if (Date.now() - lastPing.current < PING_COOLDOWN_MS) return;
    lastPing.current = Date.now();
    const m = base('ping', {});
    runSend(m, () => insertRow({ id: m.id, kind: 'ping' }));
    startRain();
  }, [base, runSend, insertRow, startRain]);

  const onTyping = useCallback(() => {
    const t = Date.now();
    if (t - lastTypingSent.current < 2500) return;
    lastTypingSent.current = t;
    void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: {} });
  }, []);

  // ───────── Reacciones, borrar, estado ─────────
  const toggleReaction = useCallback(
    async (m: Msg, emoji: string) => {
      if (!meId || m.local) return;
      const mineR = reactions.find((r) => r.message_id === m.id && r.user_id === meId);
      const others = (p: Reaction[]) => p.filter((r) => !(r.message_id === m.id && r.user_id === meId));
      if ('vibrate' in navigator) navigator.vibrate(8);
      if (mineR?.emoji === emoji) {
        setReactions(others);
        const { error } = await sb().from('reactions').delete().eq('message_id', m.id).eq('user_id', meId);
        if (error) void loadReactions();
      } else {
        setReactions((p) => [...others(p), { message_id: m.id, user_id: meId, emoji }]);
        const { error } = await sb()
          .from('reactions')
          .upsert({ message_id: m.id, user_id: meId, emoji }, { onConflict: 'message_id,user_id' });
        if (error) void loadReactions();
      }
    },
    [meId, reactions, sb, loadReactions],
  );

  const deleteMsg = useCallback(
    async (m: Msg) => {
      setMsgs((p) => p.filter((x) => x.id !== m.id));
      if (m.local) {
        retryRef.current.delete(m.id);
        return;
      }
      const { error } = await sb().from('messages').delete().eq('id', m.id);
      if (error) {
        showToast('No se pudo borrar');
        void fetchLatest();
        return;
      }
      if (m.media_path) void sb().storage.from('media').remove([m.media_path]);
    },
    [sb, showToast, fetchLatest],
  );

  const saveStatus = useCallback(
    async (emoji: string, text: string, until: Date | null) => {
      const cur = meRef.current;
      if (cur) {
        const next = {
          ...cur,
          status_emoji: emoji.trim() || null,
          status_text: text.trim() || null,
          status_until: until ? until.toISOString() : null,
        };
        meRef.current = next;
        setMe(next);
      }
      const { error } = await sb().rpc('set_status', {
        p_emoji: emoji,
        p_text: text,
        p_until: until ? until.toISOString() : null,
      });
      if (error) showToast('No se pudo guardar tu estado');
    },
    [sb, showToast],
  );

  const loadPending = useCallback(async () => {
    const client = sb();
    const [rem, sch] = await Promise.all([
      client.from('reminders').select('id, message_id, remind_at').eq('done', false).order('remind_at'),
      client.from('scheduled_messages').select('id, body, send_at').eq('status', 'pending').order('send_at'),
    ]);
    if (!rem.error && rem.data) setReminders(rem.data as Reminder[]);
    if (!sch.error && sch.data) setScheduled(sch.data as Scheduled[]);
  }, [sb]);

  useEffect(() => {
    if (!meId) return;
    void loadPending();
    const t = setInterval(() => void loadPending(), 45_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadPending();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [meId, loadPending]);

  const setReminder = useCallback(
    async (m: Msg, at: Date) => {
      if (!meId) return;
      const { error } = await sb()
        .from('reminders')
        .upsert(
          { user_id: meId, message_id: m.id, remind_at: at.toISOString(), done: false, fired: 0, last_fired_at: null },
          { onConflict: 'user_id,message_id' },
        );
      if (error) {
        showToast('No se pudo guardar el recordatorio');
        return;
      }
      showToast('⏰ Listo, te lo recuerdo');
      void loadPending();
    },
    [meId, sb, showToast, loadPending],
  );

  const removeReminder = useCallback(
    async (id: string) => {
      setReminders((p) => p.filter((r) => r.id !== id));
      const { error } = await sb().from('reminders').delete().eq('id', id);
      if (error) showToast('No se pudo quitar');
      void loadPending();
    },
    [sb, showToast, loadPending],
  );

  const scheduleMessage = useCallback(
    async (text: string, at: Date) => {
      if (!meId) return;
      const { error } = await sb()
        .from('scheduled_messages')
        .insert({ sender_id: meId, conversation_id: conversationId, body: text, send_at: at.toISOString() });
      if (error) {
        showToast('No se pudo programar el mensaje');
        return;
      }
      showToast('🕒 Mensaje programado');
      void loadPending();
    },
    [meId, conversationId, sb, showToast, loadPending],
  );

  const cancelScheduled = useCallback(
    async (id: string) => {
      setScheduled((p) => p.filter((x) => x.id !== id));
      const { error } = await sb().from('scheduled_messages').update({ status: 'canceled' }).eq('id', id);
      if (error) showToast('No se pudo cancelar');
      void loadPending();
    },
    [sb, showToast, loadPending],
  );

  const toggleNudges = useCallback(async () => {
    const cur = meRef.current;
    if (!cur) return;
    const next = !cur.nudges_on;
    const updated = { ...cur, nudges_on: next };
    meRef.current = updated;
    setMe(updated);
    const { error } = await sb().rpc('set_prefs', { p_nudges: next });
    if (error) {
      meRef.current = cur;
      setMe(cur);
      showToast('No se pudo cambiar');
      return;
    }
    showToast(next ? '🔔 Te insistiré si no contestas' : '🔕 Sin insistencia');
  }, [sb, showToast]);

  const loadStories = useCallback(async () => {
    const client = sb();
    const { data, error } = await client
      .from('stories')
      .select('id, user_id, kind, media_path, caption, bg, created_at, expires_at')
      .order('created_at');
    if (error || !data) return;
    const t = Date.now();
    const all = data as Story[];
    const live = all.filter((x) => new Date(x.expires_at).getTime() > t);
    setStories(live);
    if (live.length) {
      const v = await client
        .from('story_views')
        .select('story_id, viewer_id, seen_at')
        .in(
          'story_id',
          live.map((x) => x.id),
        );
      if (!v.error && v.data) setStoryViews(v.data as StoryView[]);
    } else {
      setStoryViews([]);
    }
    // Limpieza: tus estados vencidos se borran (fila y foto)
    const mineId = meRef.current?.user_id;
    const expired = all.filter((x) => x.user_id === mineId && new Date(x.expires_at).getTime() <= t);
    if (expired.length) {
      const paths = expired.map((x) => x.media_path).filter((x): x is string => !!x);
      if (paths.length) await client.storage.from('media').remove(paths);
      await client.from('stories').delete().in(
        'id',
        expired.map((x) => x.id),
      );
    }
  }, [sb]);

  useEffect(() => {
    loadStoriesRef.current = () => void loadStories();
  }, [loadStories]);

  useEffect(() => {
    if (!meId) return;
    void loadStories();
    const t = setInterval(() => void loadStories(), 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadStories();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [meId, loadStories]);

  const publishStory = useCallback(
    async (d: StoryDraft) => {
      if (!meId) return;
      showToast('Subiendo estado…');
      try {
        const media_path =
          d.kind === 'image' ? await uploadMedia(meId, await resizeImage(d.file, 1440, 0.82), 'image/jpeg', 'jpg') : null;
        const { error } = await sb()
          .from('stories')
          .insert({
            user_id: meId,
            kind: d.kind,
            media_path,
            caption: d.caption || null,
            bg: d.kind === 'text' ? d.bg : null,
          });
        if (error) throw error;
        showToast('✨ Estado publicado (dura 24 h)');
        void loadStories();
      } catch {
        showToast('No se pudo publicar el estado');
      }
    },
    [meId, sb, showToast, loadStories],
  );

  const deleteStory = useCallback(
    async (id: string) => {
      const st = stories.find((x) => x.id === id);
      setStories((p) => p.filter((x) => x.id !== id));
      const { error } = await sb().from('stories').delete().eq('id', id);
      if (error) {
        showToast('No se pudo borrar');
        void loadStories();
        return;
      }
      if (st?.media_path) void sb().storage.from('media').remove([st.media_path]);
    },
    [stories, sb, showToast, loadStories],
  );

  const markStorySeen = useCallback(
    (id: string) => {
      if (!meId) return;
      setStoryViews((p) =>
        p.some((v) => v.story_id === id && v.viewer_id === meId)
          ? p
          : [...p, { story_id: id, viewer_id: meId, seen_at: new Date().toISOString() }],
      );
      void sb()
        .from('story_views')
        .upsert({ story_id: id, viewer_id: meId }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });
    },
    [meId, sb],
  );

  const setAvatar = useCallback(
    async (file: File | null) => {
      if (!meId) return;
      setAvatarBusy(true);
      try {
        const path = file ? await uploadMedia(meId, await squareImage(file), 'image/jpeg', 'jpg') : null;
        const { error } = await sb().rpc('set_avatar', { p_path: path });
        if (error) throw error;
        const cur = meRef.current;
        const old = cur?.avatar_path;
        if (cur) {
          const next = { ...cur, avatar_path: path };
          meRef.current = next;
          setMe(next);
        }
        if (old) void sb().storage.from('media').remove([old]);
        showToast(file ? '📸 Foto actualizada' : 'Foto quitada');
      } catch {
        showToast('No se pudo cambiar la foto');
      } finally {
        setAvatarBusy(false);
      }
    },
    [meId, sb, showToast],
  );

  const openPartnerPhoto = useCallback(async () => {
    const path = partner?.avatar_path;
    if (!path) return;
    const url = await getSignedUrl(path);
    if (url) setLightbox(url);
  }, [partner?.avatar_path]);

  const liveStories = useMemo(() => stories.filter((x) => new Date(x.expires_at).getTime() > now), [stories, now]);
  const myStories = useMemo(() => liveStories.filter((x) => x.user_id === meId), [liveStories, meId]);
  const partnerStories = useMemo(
    () => liveStories.filter((x) => x.user_id === partnerId),
    [liveStories, partnerId],
  );
  const seenByMe = useMemo(
    () => new Set(storyViews.filter((v) => v.viewer_id === meId).map((v) => v.story_id)),
    [storyViews, meId],
  );
  const firstUnseenPartner = partnerStories.findIndex((x) => !seenByMe.has(x.id));

  const remindedIds = useMemo(() => new Set(reminders.map((r) => r.message_id)), [reminders]);

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    stickRef.current = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1400);
  }, []);

  const signOut = async () => {
    await disablePush();
    await sb().auth.signOut();
    router.replace('/login');
  };

  const activatePush = async () => {
    try {
      setPush(await enablePush());
    } catch (e) {
      showToast((e as Error).message || 'No se pudieron activar las notificaciones');
    }
  };

  // ───────── Render ─────────
  const msgById = useMemo(() => new Map(msgs.map((m) => [m.id, m])), [msgs]);
  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const r of reactions) {
      const arr = map.get(r.message_id);
      if (arr) arr.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  const rows = useMemo(
    () =>
      msgs.map((m, i) => {
        const prev = msgs[i - 1];
        const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
        const grouped =
          !!prev &&
          !newDay &&
          m.kind !== 'ping' &&
          prev.kind !== 'ping' &&
          prev.sender_id === m.sender_id &&
          new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_MS;
        return { m, newDay, grouped };
      }),
    [msgs],
  );

  if (!ready) {
    return (
      <div className="app center">
        <div className="aurora" />
        <div className="spinner" />
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="app center">
        <div className="aurora" />
        <p className="fatal">{fatal}</p>
        <button className="btn" onClick={signOut}>
          Salir
        </button>
      </div>
    );
  }

  const partnerName = partner?.display_name ?? APP_NAME;
  const myStatus = activeStatus(me, now);
  const theirStatus = activeStatus(partner, now);
  const showBanner = !bannerOff && (push === 'default' || push === 'needs-install');

  return (
    <div className="app">
      <div className="aurora" />

      <header className="top">
        {onBack && (
          <button className="icon-btn back-btn" onClick={onBack} aria-label="Volver a mis chats">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <Avatar
          name={partnerName}
          path={partner?.avatar_path}
          size={46}
          online={online}
          ring={partnerStories.length ? (firstUnseenPartner >= 0 ? 'new' : 'seen') : null}
          label={partnerStories.length ? `Ver estado de ${partnerName}` : `Foto de ${partnerName}`}
          onClick={() => {
            if (partnerStories.length) setViewer({ who: 'partner', index: Math.max(0, firstUnseenPartner) });
            else if (partner?.avatar_path) void openPartnerPhoto();
          }}
        />
        <div className="who">
          <div className="who-name">{partnerName}</div>
          <div className={`who-status ${typing || online ? 'on' : ''}`}>
            {typing ? 'escribiendo…' : online ? 'en línea' : ''}
          </div>
        </div>
        <button className="icon-btn ping-btn" onClick={sendPing} aria-label="Mandar un toque de cariño">
          <span>💜</span>
        </button>
        <button className="icon-btn" onClick={() => setMenu((v) => !v)} aria-label="Menú">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
        {menu && (
          <div className="menu" onClick={() => setMenu(false)}>
            <div className="menu-name">{me?.display_name}</div>
            <button
              className="plain"
              onClick={() => {
                setStatusOpen(true);
              }}
            >
              Mi estado
            </button>
            <button className="plain" onClick={() => setComposeOpen(true)}>
              Subir historia 📸
            </button>
            <button className="plain" onClick={() => setProfileOpen(true)}>
              Mi foto de perfil
            </button>
            <button className="plain" onClick={() => setPendingOpen(true)}>
              Pendientes{reminders.length + scheduled.length > 0 ? ` (${reminders.length + scheduled.length})` : ''}
            </button>
            <button
              className="plain"
              onClick={(e) => {
                e.stopPropagation();
                void toggleNudges();
              }}
            >
              Insistente: {me?.nudges_on ? 'activado 🔔' : 'apagado'}
            </button>
            <button onClick={signOut}>Cerrar sesión</button>
          </div>
        )}
      </header>

      <div className="statusbar">
        {theirStatus ? (
          <div className="spill theirs" title="Estado de ella">
            <span className="spill-emoji">{theirStatus.emoji ?? '💬'}</span>
            <span className="spill-text">
              {theirStatus.text}
              {theirStatus.until ? ` · hasta ${formatUntil(theirStatus.until)}` : ''}
            </span>
          </div>
        ) : (
          <div className="spill-spacer" />
        )}
        <div className="mine-group">
        <Avatar
          name={me?.display_name ?? 'Yo'}
          path={me?.avatar_path}
          size={34}
          ring={myStories.length ? 'mine' : null}
          plus={myStories.length === 0}
          label={myStories.length ? 'Ver mi estado' : 'Subir estado'}
          onClick={() => (myStories.length ? setViewer({ who: 'me', index: 0 }) : setComposeOpen(true))}
        />
        <button className={`spill mine ${myStatus ? 'set' : ''}`} onClick={() => setStatusOpen(true)}>
          {myStatus ? (
            <>
              <span className="spill-emoji">{myStatus.emoji ?? '💬'}</span>
              <span className="spill-text">{myStatus.text ?? 'Mi estado'}</span>
              <span className="spill-edit">✎</span>
            </>
          ) : (
            <>
              <span className="spill-emoji">＋</span>
              <span className="spill-text">Mi estado</span>
            </>
          )}
        </button>
        </div>
      </div>

      {showBanner && (
        <div className="banner">
          {push === 'needs-install' ? (
            <span>
              Para recibir notificaciones en iPhone: toca <b>Compartir</b> y luego <b>Agregar a inicio</b>. Ábrela desde
              ahí.
            </span>
          ) : (
            <>
              <span>Activa las notificaciones para no perderte sus mensajes.</span>
              <button className="btn small" onClick={activatePush}>
                Activar
              </button>
            </>
          )}
          <button className="banner-x" onClick={() => setBannerOff(true)} aria-label="Cerrar">
            ×
          </button>
        </div>
      )}
      {push === 'denied' && !isIOS() && !bannerOff && (
        <div className="banner err">Las notificaciones están bloqueadas en los ajustes del navegador.</div>
      )}

      <div className="list" ref={listRef} onScroll={onScroll}>
        {hasMore && <div className="older">Cargando mensajes anteriores…</div>}
        {rows.length === 0 && (
          <div className="empty">
            <div className="empty-heart">💜</div>
            Aquí empieza su chat
          </div>
        )}
        {rows.map(({ m, newDay, grouped }) => (
          <div key={m.id}>
            {newDay && (
              <div className="day">
                <span>{dayLabel(m.created_at)}</span>
              </div>
            )}
            {m.id === firstUnreadId && (
              <div className="unread" id="unread-divider">
                <span>Mensajes nuevos</span>
              </div>
            )}
            <Bubble
              msg={m}
              mine={m.sender_id === meId}
              grouped={grouped}
              meId={meId ?? ''}
              partnerName={partnerName}
              replied={m.reply_to ? (msgById.get(m.reply_to) ?? null) : null}
              reactions={reactionsByMsg.get(m.id) ?? []}
              flash={flashId === m.id}
              reminded={remindedIds.has(m.id)}
              onRetry={(id) => void retryRef.current.get(id)?.()}
              onReply={setReplyTo}
              onActions={setActionMsg}
              onReact={(msg, emoji) => void toggleReaction(msg, emoji)}
              onOpenImage={(url) => setLightbox(url)}
              onMediaLoaded={() => {
                if (stickRef.current) scrollBottom();
              }}
              onJump={jumpTo}
            />
          </div>
        ))}
      </div>

      {newBelow && (
        <button className="jump" onClick={() => scrollBottom(true)}>
          Mensaje nuevo ↓
        </button>
      )}

      <Composer
        reply={replyTo ? { name: replyTo.sender_id === meId ? 'ti' : partnerName, text: snippet(replyTo) } : null}
        onCancelReply={() => setReplyTo(null)}
        onSendText={sendText}
        onSchedule={(t, at) => void scheduleMessage(t, at)}
        onSendImage={sendImage}
        onSendAudio={sendAudio}
        onTyping={onTyping}
      />

      {actionMsg && (
        <ActionSheet
          msg={actionMsg}
          mine={actionMsg.sender_id === meId}
          myReaction={reactions.find((r) => r.message_id === actionMsg.id && r.user_id === meId)?.emoji ?? null}
          onClose={() => setActionMsg(null)}
          onReact={(emoji) => void toggleReaction(actionMsg, emoji)}
          reminded={remindedIds.has(actionMsg.id)}
          onRemind={() => setRemindMsg(actionMsg)}
          onUnremind={() => {
            const r = reminders.find((x) => x.message_id === actionMsg.id);
            if (r) void removeReminder(r.id);
          }}
          onReply={() => setReplyTo(actionMsg)}
          onCopy={() => {
            if (actionMsg.body) void navigator.clipboard?.writeText(actionMsg.body).catch(() => {});
          }}
          onDelete={() => void deleteMsg(actionMsg)}
        />
      )}

      {composeOpen && <StoryComposer onPublish={(d) => void publishStory(d)} onClose={() => setComposeOpen(false)} />}

      {profileOpen && (
        <ProfileSheet
          name={me?.display_name ?? 'Yo'}
          path={me?.avatar_path ?? null}
          busy={avatarBusy}
          onPick={(f) => void setAvatar(f)}
          onRemove={() => void setAvatar(null)}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {viewer && (viewer.who === 'me' ? myStories : partnerStories).length > 0 && (
        <StoryViewer
          stories={viewer.who === 'me' ? myStories : partnerStories}
          startIndex={viewer.index}
          ownerName={viewer.who === 'me' ? (me?.display_name ?? 'Yo') : partnerName}
          avatarPath={(viewer.who === 'me' ? me : partner)?.avatar_path ?? null}
          mine={viewer.who === 'me'}
          views={storyViews}
          onSeen={markStorySeen}
          onDelete={(id) => void deleteStory(id)}
          onAdd={() => {
            setViewer(null);
            setComposeOpen(true);
          }}
          onClose={() => setViewer(null)}
        />
      )}

      {remindMsg && (
        <TimeSheet
          title="Recordármelo"
          sub={`"${snippet(remindMsg)}"`}
          confirmLabel="Recordarme"
          onClose={() => setRemindMsg(null)}
          onPick={(at) => void setReminder(remindMsg, at)}
        />
      )}

      {pendingOpen && (
        <PendingSheet
          scheduled={scheduled}
          reminders={reminders}
          reminderText={(id) => {
            const m = msgById.get(id);
            return m ? snippet(m) : 'Mensaje';
          }}
          onCancelScheduled={(id) => void cancelScheduled(id)}
          onCancelReminder={(id) => void removeReminder(id)}
          onJump={jumpTo}
          onClose={() => setPendingOpen(false)}
        />
      )}

      {statusOpen && (
        <StatusSheet
          current={myStatus}
          onSave={(e, t, u) => void saveStatus(e, t, u)}
          onClear={() => void saveStatus('', '', null)}
          onClose={() => setStatusOpen(false)}
        />
      )}

      {rain && (
        <div className="hearts" aria-hidden>
          {rain.map((h, i) => (
            <span key={i} style={{ left: `${h.l}%`, animationDelay: `${h.d}s`, fontSize: h.s }}>
              💜
            </span>
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Foto" />
        </div>
      )}
    </div>
  );
}
