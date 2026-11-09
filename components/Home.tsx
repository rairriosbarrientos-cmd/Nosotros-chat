'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import Chat from './Chat';
import Logo from './Logo';
import { snippet } from '@/lib/emoji';
import { disablePush } from '@/lib/push';
import { APP_NAME, supabaseBrowser, type Member, type Message } from '@/lib/supabase';

type Conv = {
  id: string;
  partnerId: string;
  partner: Member | null;
  last: Message | null;
  unread: number;
  muted: boolean;
  pinned: boolean;
};

function when(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/** Si solo tienes un chat entras directo; si tienes varios, ves la lista. */
export default function Home() {
  const router = useRouter();
  const sb = supabaseBrowser;
  const [meId, setMeId] = useState<string | null>(null);
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefsFor, setPrefsFor] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);

  const load = useCallback(async () => {
    const client = sb();
    const { data: sess } = await client.auth.getSession();
    if (!sess.session) {
      router.replace('/login');
      return;
    }
    const uid = sess.session.user.id;
    setMeId(uid);

    const [cm, mem] = await Promise.all([
      client.from('conversation_members').select('conversation_id, user_id, muted, pinned'),
      client.from('members').select('user_id, display_name, status_emoji, status_text, status_until, avatar_path'),
    ]);
    if (cm.error || mem.error) throw new Error('sin conexión');
    const members = (mem.data ?? []) as Member[];
    const rows = (cm.data ?? []) as Array<{ conversation_id: string; user_id: string; muted: boolean; pinned: boolean }>;
    const convIds = [...new Set(rows.filter((r) => r.user_id === uid).map((r) => r.conversation_id))];

    let recent: Message[] = [];
    if (convIds.length) {
      const { data } = await client
        .from('messages')
        .select('id, conversation_id, sender_id, kind, body, created_at, read_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(300);
      recent = (data ?? []) as Message[];
    }

    const list: Conv[] = convIds
      .map((id) => {
        const partnerId = rows.find((r) => r.conversation_id === id && r.user_id !== uid)?.user_id ?? '';
        const msgs = recent.filter((m) => m.conversation_id === id);
        const mineRow = rows.find((r) => r.conversation_id === id && r.user_id === uid);
        return {
          id,
          partnerId,
          partner: members.find((m) => m.user_id === partnerId) ?? null,
          last: msgs[0] ?? null,
          unread: msgs.filter((m) => m.sender_id !== uid && !m.read_at && m.kind !== 'ping').length,
          muted: !!mineRow?.muted,
          pinned: !!mineRow?.pinned,
        };
      })
      .filter((c) => c.partnerId)
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? ''),
      );
    setConvs(list);
  }, [sb, router]);

  useEffect(() => {
    load().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : '';
      setError(
        msg.startsWith('Faltan')
          ? 'Faltan las variables de Supabase en Netlify. Agrégalas (con "Builds" marcado) y vuelve a desplegar.'
          : 'No pude cargar el chat. Revisa tu conexión.',
      );
    });
  }, [load]);

  // Chat inicial: ?c=<id> (viene de una notificación) o el único que exista
  useEffect(() => {
    if (!convs || active) return;
    const wanted = new URLSearchParams(window.location.search).get('c');
    if (wanted && convs.some((c) => c.id === wanted)) setActive(wanted);
    else if (convs.length === 1) setActive(convs[0].id);
  }, [convs, active]);

  // Lista al día mientras la estás viendo
  useEffect(() => {
    if (active || !convs || convs.length < 2) return;
    const t = setInterval(() => void load().catch(() => {}), 20_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active, convs, load]);

  const setPrefs = useCallback(
    async (id: string, patch: { muted?: boolean; pinned?: boolean }) => {
      setConvs((p) =>
        p
          ? p
              .map((c) => (c.id === id ? { ...c, ...patch } : c))
              .sort(
                (a, b) =>
                  Number(b.pinned) - Number(a.pinned) ||
                  (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? ''),
              )
          : p,
      );
      const { error: err } = await sb().rpc('set_conv_prefs', {
        p_conv: id,
        p_muted: patch.muted ?? null,
        p_pinned: patch.pinned ?? null,
      });
      if (err) void load().catch(() => {});
    },
    [sb, load],
  );

  const signOut = async () => {
    await disablePush();
    await sb().auth.signOut();
    router.replace('/login');
  };

  if (error) {
    return (
      <div className="app center">
        <div className="aurora" />
        <p className="fatal">{error}</p>
        <button className="btn" onClick={signOut}>
          Salir
        </button>
      </div>
    );
  }

  if (!convs) {
    return (
      <div className="app center">
        <div className="aurora" />
        <div className="spinner" />
      </div>
    );
  }

  if (convs.length === 0) {
    return (
      <div className="app center">
        <div className="aurora" />
        <p className="fatal">Esta cuenta no está autorizada en este chat.</p>
        <button className="btn" onClick={signOut}>
          Salir
        </button>
      </div>
    );
  }

  const current = convs.find((c) => c.id === active);
  if (current) {
    return (
      <Chat
        key={current.id}
        conversationId={current.id}
        partnerId={current.partnerId}
        muted={current.muted}
        onToggleMute={() => void setPrefs(current.id, { muted: !current.muted })}
        onBack={
          convs.length > 1
            ? () => {
                window.history.replaceState(null, '', '/');
                setActive(null);
                void load().catch(() => {});
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="app">
      <div className="aurora" />
      <header className="top">
        <Logo size={40} />
        <div className="who">
          <div className="who-name">{APP_NAME}</div>
          <div className="who-status on">{meId ? 'Tus chats' : ''}</div>
        </div>
        <button className="btn ghost small" onClick={signOut}>
          Salir
        </button>
      </header>
      <div className="chat-list">
        {convs.map((c) => (
          <button
            key={c.id}
            className="chat-row"
            onPointerDown={() => {
              pressed.current = false;
              pressTimer.current = setTimeout(() => {
                pressed.current = true;
                if ('vibrate' in navigator) navigator.vibrate(15);
                setPrefsFor(c.id);
              }, 450);
            }}
            onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
            onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
            onPointerCancel={() => pressTimer.current && clearTimeout(pressTimer.current)}
            onContextMenu={(e) => {
              e.preventDefault();
              setPrefsFor(c.id);
            }}
            onClick={() => {
              if (pressed.current) {
                pressed.current = false;
                return;
              }
              setActive(c.id);
            }}
          >
            <Avatar name={c.partner?.display_name ?? '?'} path={c.partner?.avatar_path} size={52} />
            <div className="chat-row-main">
              <div className="chat-row-top">
                <span className="chat-row-name">
                  {c.partner?.display_name ?? 'Chat'}
                  <span className="chat-row-flags">
                    {c.pinned ? '📌' : ''}
                    {c.muted ? '🔕' : ''}
                  </span>
                </span>
                {c.last && <span className={`chat-row-time ${c.unread ? 'unread' : ''}`}>{when(c.last.created_at)}</span>}
              </div>
              <div className="chat-row-bottom">
                <span className="chat-row-text">
                  {c.last ? `${c.last.sender_id === meId ? 'Tú: ' : ''}${snippet(c.last)}` : 'Empiecen a platicar 💜'}
                </span>
                {c.unread > 0 && <span className={`chat-badge ${c.muted ? 'muted' : ''}`}>{c.unread}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>

      {prefsFor &&
        (() => {
          const c = convs.find((x) => x.id === prefsFor);
          if (!c) return null;
          return (
            <div className="sheet-back" onClick={() => setPrefsFor(null)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Opciones del chat">
                <div className="sheet-grab" />
                <h2 className="sheet-title">{c.partner?.display_name ?? 'Chat'}</h2>
                <div className="sheet-list">
                  <button
                    onClick={() => {
                      void setPrefs(c.id, { pinned: !c.pinned });
                      setPrefsFor(null);
                    }}
                  >
                    <span>📌</span> {c.pinned ? 'Quitar de fijados' : 'Fijar arriba'}
                  </button>
                  <button
                    onClick={() => {
                      void setPrefs(c.id, { muted: !c.muted });
                      setPrefsFor(null);
                    }}
                  >
                    <span>{c.muted ? '🔔' : '🔕'}</span> {c.muted ? 'Quitar silencio' : 'Silenciar notificaciones'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
