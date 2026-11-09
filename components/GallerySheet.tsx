'use client';

import { useEffect, useState } from 'react';
import { getSignedUrl, useSignedUrl } from '@/lib/media';
import { supabaseBrowser } from '@/lib/supabase';

type Pic = { id: string; media_path: string | null; created_at: string };

function Thumb({ pic, onOpen }: { pic: Pic; onOpen: (url: string) => void }) {
  const url = useSignedUrl(pic.media_path);
  return (
    <button
      className="gal-thumb"
      onClick={async () => {
        const full = pic.media_path ? await getSignedUrl(pic.media_path) : url;
        if (full) onOpen(full);
      }}
      aria-label="Abrir foto"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" draggable={false} />
      ) : (
        <span className="img-skeleton" />
      )}
    </button>
  );
}

export default function GallerySheet({
  conversationId,
  onOpen,
  onClose,
}: {
  conversationId: string;
  onOpen: (url: string) => void;
  onClose: () => void;
}) {
  const [pics, setPics] = useState<Pic[] | null>(null);

  useEffect(() => {
    let alive = true;
    void supabaseBrowser()
      .from('messages')
      .select('id, media_path, created_at')
      .eq('conversation_id', conversationId)
      .eq('kind', 'image')
      .order('created_at', { ascending: false })
      .limit(150)
      .then(({ data }) => {
        if (alive) setPics((data as Pic[] | null) ?? []);
      });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Fotos del chat">
        <div className="sheet-grab" />
        <h2 className="sheet-title">Fotos</h2>
        <p className="sheet-sub">{pics ? `${pics.length} en este chat` : 'Cargando…'}</p>
        {pics?.length === 0 && <p className="pending-empty">Aún no hay fotos 📷</p>}
        <div className="gal-grid">
          {pics?.map((p) => <Thumb key={p.id} pic={p} onOpen={onOpen} />)}
        </div>
      </div>
    </div>
  );
}
