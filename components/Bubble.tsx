'use client';

import { useMemo, useRef, type PointerEvent as RPointerEvent, type TouchEvent as RTouchEvent } from 'react';
import AudioPlayer from './AudioPlayer';
import CapsuleCard from './CapsuleCard';
import { isEmojiOnly, snippet } from '@/lib/emoji';
import { useSignedUrl } from '@/lib/media';
import type { Message, Reaction } from '@/lib/supabase';

export type Msg = Message & { local?: 'pending' | 'failed'; localUrl?: string };

const LONG_PRESS_MS = 380;
const DOUBLE_TAP_MS = 300;
const SWIPE_TRIGGER = 56;

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
}

function Ticks({ msg }: { msg: Msg }) {
  if (msg.local === 'pending') return <span className="ticks pending" aria-label="Enviando">◔</span>;
  if (msg.local === 'failed') return <span className="ticks failed" aria-label="No se envió">!</span>;
  if (msg.read_at) return <span className="ticks read" aria-label="Leído">✓✓</span>;
  return <span className="ticks" aria-label="Enviado">✓</span>;
}

function ImageMsg({
  path,
  localUrl,
  onLoaded,
}: {
  path: string | null;
  localUrl?: string;
  onLoaded: () => void;
}) {
  const url = useSignedUrl(path, localUrl);
  if (!url) return <div className="img-skeleton" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="img-msg" src={url} alt="Foto" loading="lazy" draggable={false} onLoad={onLoaded} />
  );
}

type Props = {
  msg: Msg;
  mine: boolean;
  grouped: boolean;
  meId: string;
  partnerName: string;
  replied: Msg | null;
  reactions: Reaction[];
  flash: boolean;
  reminded?: boolean;
  promiseState?: 'pending' | 'done' | 'late';
  onRetry: (id: string) => void;
  onReply: (m: Msg) => void;
  onActions: (m: Msg) => void;
  onReact: (m: Msg, emoji: string) => void;
  onOpenImage: (url: string, m: Msg) => void;
  onMediaLoaded: () => void;
  onJump: (id: string) => void;
};

export default function Bubble(p: Props) {
  const { msg, mine, reactions } = p;
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);

  // ───────── Gestos: mantener = menú, doble toque = ❤️, deslizar = responder ─────────
  const g = useRef({
    x: 0,
    y: 0,
    moved: false,
    fired: false,
    long: null as ReturnType<typeof setTimeout> | null,
    lastTap: 0,
    tapTimer: null as ReturnType<typeof setTimeout> | null,
    swipe: { x: 0, y: 0, active: false, dx: 0, vertical: false },
  });

  const clearLong = () => {
    if (g.current.long) clearTimeout(g.current.long);
    g.current.long = null;
  };

  const down = (e: RPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const s = g.current;
    s.x = e.clientX;
    s.y = e.clientY;
    s.moved = false;
    s.fired = false;
    clearLong();
    s.long = setTimeout(() => {
      s.fired = true;
      if ('vibrate' in navigator) navigator.vibrate(12);
      p.onActions(msg);
    }, LONG_PRESS_MS);
  };

  const move = (e: RPointerEvent) => {
    const s = g.current;
    if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) {
      s.moved = true;
      clearLong();
    }
  };

  const up = () => {
    const s = g.current;
    clearLong();
    if (s.fired || s.moved) return;
    const now = Date.now();
    if (now - s.lastTap < DOUBLE_TAP_MS) {
      s.lastTap = 0;
      if (s.tapTimer) clearTimeout(s.tapTimer);
      s.tapTimer = null;
      p.onReact(msg, '❤️');
      return;
    }
    s.lastTap = now;
    // Un toque simple en una foto la abre (esperando por si viene el segundo toque)
    if (msg.kind === 'image') {
      const url = bubbleRef.current?.querySelector('img')?.getAttribute('src');
      if (url) s.tapTimer = setTimeout(() => p.onOpenImage(url, msg), DOUBLE_TAP_MS);
    }
  };

  const tStart = (e: RTouchEvent) => {
    const t = e.touches[0];
    g.current.swipe = { x: t.clientX, y: t.clientY, active: true, dx: 0, vertical: false };
  };
  const tMove = (e: RTouchEvent) => {
    const sw = g.current.swipe;
    if (!sw.active || sw.vertical) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.x;
    const dy = t.clientY - sw.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      sw.vertical = true;
      return;
    }
    if (dx > 6) {
      sw.dx = Math.min(dx, 84);
      if (bubbleRef.current) bubbleRef.current.style.transform = `translateX(${sw.dx}px)`;
      if (hintRef.current) {
        const k = Math.min(1, sw.dx / SWIPE_TRIGGER);
        hintRef.current.style.opacity = String(k);
        hintRef.current.style.transform = `translateY(-50%) scale(${0.6 + 0.4 * k})`;
      }
      clearLong();
    }
  };
  const tEnd = () => {
    const sw = g.current.swipe;
    if (hintRef.current) {
      hintRef.current.style.opacity = '0';
      hintRef.current.style.transform = 'translateY(-50%) scale(.6)';
    }
    if (bubbleRef.current) {
      bubbleRef.current.style.transition = 'transform .2s cubic-bezier(.2,.9,.3,1)';
      bubbleRef.current.style.transform = '';
      const el = bubbleRef.current;
      setTimeout(() => (el.style.transition = ''), 220);
    }
    if (sw.active && sw.dx >= SWIPE_TRIGGER) {
      if ('vibrate' in navigator) navigator.vibrate(10);
      p.onReply(msg);
    }
    g.current.swipe = { x: 0, y: 0, active: false, dx: 0, vertical: false };
  };

  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      cur.count++;
      if (r.user_id === p.meId) cur.mine = true;
      map.set(r.emoji, cur);
    }
    return [...map.entries()];
  }, [reactions, p.meId]);

  // ───────── Toque "pensando en ti" ─────────
  if (msg.kind === 'ping') {
    return (
      <div className="row ping-row" id={`msg-${msg.id}`}>
        <div className="ping">
          <span className="ping-heart">💜</span>
          <span>{mine ? 'Le mandaste un toque' : `${p.partnerName} pensó en ti`}</span>
          <span className="ping-time">{time(msg.created_at)}</span>
        </div>
      </div>
    );
  }

  // ───────── Aviso rápido (voy en camino, ya llegué…) ─────────
  if (msg.kind === 'quick') {
    return (
      <div className="row ping-row" id={`msg-${msg.id}`}>
        <div className="ping quick">
          <span>
            <b>{mine ? 'Tú' : p.partnerName}</b> · {msg.body}
          </span>
          <span className="ping-time">{time(msg.created_at)}</span>
        </div>
      </div>
    );
  }

  const emojiOnly = msg.kind === 'text' && isEmojiOnly(msg.body);
  const isImage = msg.kind === 'image';

  return (
    <div
      id={`msg-${msg.id}`}
      className={`row ${mine ? 'mine' : 'theirs'} ${p.grouped ? 'grouped' : ''} ${p.flash ? 'flash' : ''} ${grouped.length ? 'has-react' : ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={clearLong}
      onPointerLeave={clearLong}
      onTouchStart={tStart}
      onTouchMove={tMove}
      onTouchEnd={tEnd}
      onTouchCancel={tEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        p.onActions(msg);
      }}
    >
      <div className="swipe-hint" ref={hintRef} aria-hidden>
        ↩
      </div>
      <div
        ref={bubbleRef}
        className={`bubble ${mine ? 'mine' : 'theirs'} ${isImage ? 'bubble-img' : ''} ${emojiOnly ? 'bubble-emoji' : ''}`}
      >
        {p.replied !== null || msg.reply_to ? (
          <button
            className="quote"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => msg.reply_to && p.onJump(msg.reply_to)}
          >
            <span className="quote-name">
              {p.replied ? (p.replied.sender_id === p.meId ? 'Tú' : p.partnerName) : 'Mensaje'}
            </span>
            <span className="quote-text">{p.replied ? snippet(p.replied) : 'Mensaje eliminado'}</span>
          </button>
        ) : null}

        {msg.kind === 'promise' && (
          <div className={`promise ${p.promiseState ?? 'pending'}`}>
            <span className="promise-icon">{p.promiseState === 'done' ? '✅' : p.promiseState === 'late' ? '⌛' : '⏳'}</span>
            <span className="promise-main">
              <span className="promise-text">{msg.body}</span>
              <span className="promise-state">
                {p.promiseState === 'done'
                  ? 'Cumplida'
                  : p.promiseState === 'late'
                    ? mine
                      ? 'Ya toca contestar'
                      : 'Se pasó de hora'
                    : mine
                      ? 'Te lo voy a recordar'
                      : 'Pendiente'}
              </span>
            </span>
          </div>
        )}
        {msg.kind === 'capsule' && (
          <CapsuleCard
            msg={msg}
            mine={mine}
            partnerName={p.partnerName}
            onOpenImage={(url) => p.onOpenImage(url, msg)}
            onLoaded={p.onMediaLoaded}
          />
        )}
        {msg.kind === 'text' && <span className={`text ${emojiOnly ? 'emoji-big' : ''}`}>{msg.body}</span>}
        {isImage && <ImageMsg path={msg.media_path} localUrl={msg.localUrl} onLoaded={p.onMediaLoaded} />}
        {msg.kind === 'audio' && (
          <AudioPlayer
            path={msg.media_path}
            durationMs={msg.duration_ms}
            localUrl={msg.localUrl}
            waveform={msg.waveform}
            seed={msg.id}
          />
        )}

        <span className={`meta ${isImage ? 'meta-over' : ''}`}>
          {p.reminded && <span className="rem-mark" aria-label="Con recordatorio">⏰ </span>}
          {msg.edited_at && <span className="edited-mark">editado</span>}
          {time(msg.created_at)}
          {mine && <Ticks msg={msg} />}
        </span>

        {grouped.length > 0 && (
          <div className="reacts" onPointerDown={(e) => e.stopPropagation()}>
            {grouped.map(([emoji, info]) => (
              <button
                key={emoji}
                className={`react ${info.mine ? 'me' : ''}`}
                onClick={() => p.onReact(msg, emoji)}
              >
                <span>{emoji}</span>
                {info.count > 1 && <span className="react-n">{info.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {mine && msg.local === 'failed' && (
        <button className="retry" onClick={() => p.onRetry(msg.id)}>
          No se envió · Reintentar
        </button>
      )}
    </div>
  );
}
