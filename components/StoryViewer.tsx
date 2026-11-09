'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { useSignedUrl } from '@/lib/media';
import type { Story, StoryView } from '@/lib/supabase';

const DURATION = 6000;

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.round(mins / 60)} h`;
}

function Slide({ story, onReady }: { story: Story; onReady: () => void }) {
  const url = useSignedUrl(story.kind === 'image' ? story.media_path : null);
  useEffect(() => {
    if (story.kind === 'text') onReady();
  }, [story.kind, onReady]);

  if (story.kind === 'text') {
    return (
      <div className={`sv-slide sbg-${story.bg ?? 'g1'}`}>
        <p className="sv-big">{story.caption}</p>
      </div>
    );
  }
  return (
    <div className="sv-slide dark">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Estado" className="sv-img" draggable={false} onLoad={onReady} onError={onReady} />
      ) : (
        <div className="spinner" />
      )}
      {story.caption && <div className="sv-caption">{story.caption}</div>}
    </div>
  );
}

export default function StoryViewer({
  stories,
  startIndex,
  ownerName,
  avatarPath,
  mine,
  views,
  onSeen,
  onDelete,
  onAdd,
  onClose,
}: {
  stories: Story[];
  startIndex: number;
  ownerName: string;
  avatarPath: string | null;
  mine: boolean;
  views: StoryView[];
  onSeen: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(startIndex, stories.length - 1)));
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const pausedRef = useRef(false);
  const downAt = useRef(0);
  const story = stories[idx];

  const onReady = useCallback(() => setReady(true), []);

  const go = useCallback(
    (to: number) => {
      if (to < 0) {
        setProgress(0);
        return;
      }
      if (to >= stories.length) {
        onClose();
        return;
      }
      setReady(false);
      setProgress(0);
      setConfirmDel(false);
      setIdx(to);
    },
    [stories.length, onClose],
  );

  useEffect(() => {
    if (!story) onClose();
  }, [story, onClose]);

  const storyId = story?.id;
  useEffect(() => {
    if (!mine && storyId) onSeen(storyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, mine]);

  useEffect(() => {
    if (!ready || !storyId) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      if (!pausedRef.current) acc += dt;
      const p = Math.min(1, acc / DURATION);
      setProgress(p);
      if (p >= 1) {
        go(idx + 1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, storyId, idx, go]);

  useEffect(() => {
    pausedRef.current = confirmDel;
  }, [confirmDel]);

  if (!story) return null;
  const seen = views.find((v) => v.story_id === story.id);

  return (
    <div className="story-view" role="dialog" aria-label={`Estado de ${ownerName}`}>
      <Slide key={story.id} story={story} onReady={onReady} />

      <div className="sv-bars">
        {stories.map((s, i) => (
          <span key={s.id}>
            <i style={{ width: `${i < idx ? 100 : i === idx ? progress * 100 : 0}%` }} />
          </span>
        ))}
      </div>

      <div className="sv-head">
        <Avatar name={ownerName} path={avatarPath} size={38} />
        <div className="sv-who">
          <b>{mine ? 'Tu estado' : ownerName}</b>
          <span>{ago(story.created_at)}</span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>

      <div
        className="sv-tap"
        onPointerDown={() => {
          downAt.current = Date.now();
          pausedRef.current = true;
        }}
        onPointerUp={(e) => {
          pausedRef.current = confirmDel;
          if (Date.now() - downAt.current < 250) {
            go(e.clientX < window.innerWidth * 0.33 ? idx - 1 : idx + 1);
          }
        }}
        onPointerCancel={() => {
          pausedRef.current = confirmDel;
        }}
      />

      {mine && (
        <div className="sv-foot">
          <div className="sv-seen">{seen ? `👁 Visto ${ago(seen.seen_at)}` : '👁 Aún sin ver'}</div>
          <button className="chip" onClick={onAdd}>
            ＋ Agregar
          </button>
          {confirmDel ? (
            <button
              className="chip danger"
              onClick={() => {
                onDelete(story.id);
                if (stories.length <= 1) onClose();
                else {
                  setConfirmDel(false);
                  go(Math.min(idx, stories.length - 2));
                }
              }}
            >
              Sí, borrar
            </button>
          ) : (
            <button className="chip" onClick={() => setConfirmDel(true)} aria-label="Borrar estado">
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  );
}
