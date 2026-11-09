'use client';

import { useEffect, useState } from 'react';
import { useSignedUrl } from '@/lib/media';
import { supabaseBrowser, type Message } from '@/lib/supabase';
import { formatWhen } from './TimeSheet';

type Content = { kind: 'text' | 'image'; body: string | null; media_path: string | null };

export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 1) return `${d} d ${h} h`;
  if (h >= 1) return `${h} h ${m} min`;
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function CapsuleImage({ path, onOpen, onLoaded }: { path: string; onOpen: (url: string) => void; onLoaded: () => void }) {
  const url = useSignedUrl(path);
  if (!url) return <div className="img-skeleton" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="img-msg" src={url} alt="Foto de la cápsula" draggable={false} onLoad={onLoaded} onClick={() => onOpen(url)} />
  );
}

export default function CapsuleCard({
  msg,
  mine,
  partnerName,
  onOpenImage,
  onLoaded,
}: {
  msg: Message;
  mine: boolean;
  partnerName: string;
  onOpenImage: (url: string) => void;
  onLoaded: () => void;
}) {
  const openAt = msg.meta?.open_at ? new Date(msg.meta.open_at).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  const [content, setContent] = useState<Content | null>(null);
  const [tries, setTries] = useState(0);
  const locked = now < openAt;

  useEffect(() => {
    if (!locked && now >= openAt) return;
    const t = setInterval(() => setNow(Date.now()), openAt - Date.now() > 3_600_000 ? 30_000 : 1000);
    return () => clearInterval(t);
  }, [locked, now, openAt]);

  // El contenido solo llega del servidor cuando ya se puede ver (o si es mía)
  const canSee = mine || !locked;
  useEffect(() => {
    if (!canSee || content) return;
    let alive = true;
    void supabaseBrowser()
      .from('capsule_contents')
      .select('kind, body, media_path')
      .eq('message_id', msg.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        if (data) setContent(data as Content);
        else if (tries < 5) setTimeout(() => alive && setTries((n) => n + 1), 3000);
      });
    return () => {
      alive = false;
    };
  }, [canSee, content, msg.id, tries]);

  useEffect(() => {
    if (content) onLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const when = openAt ? formatWhen(new Date(openAt)) : '';

  if (locked && !mine) {
    return (
      <div className="capsule locked">
        <div className="capsule-icon">🎁</div>
        <div className="capsule-title">Cápsula del tiempo</div>
        <div className="capsule-sub">De {partnerName} · se abre {when}</div>
        <div className="capsule-count">{countdown(openAt - now)}</div>
      </div>
    );
  }

  return (
    <div className={`capsule ${locked ? 'mine-locked' : 'open'}`}>
      <div className="capsule-title">
        {locked ? `🔒 Tu cápsula · se abre ${when}` : mine ? '🎁 Tu cápsula ya se abrió' : '🎁 Cápsula abierta'}
      </div>
      {content?.kind === 'text' && <div className="capsule-body">{content.body}</div>}
      {content?.kind === 'image' && content.media_path && (
        <CapsuleImage path={content.media_path} onOpen={onOpenImage} onLoaded={onLoaded} />
      )}
      {!content && <div className="capsule-sub">Abriendo…</div>}
    </div>
  );
}
