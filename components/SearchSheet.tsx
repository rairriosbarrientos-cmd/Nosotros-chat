'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type Hit = { id: string; sender_id: string; body: string | null; created_at: string };

function esc(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function when(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })} ${d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`;
}

export default function SearchSheet({
  conversationId,
  meId,
  partnerName,
  onPick,
  onClose,
}: {
  conversationId: string;
  meId: string;
  partnerName: string;
  onPick: (hit: { id: string; created_at: string }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser()
        .from('messages')
        .select('id, sender_id, body, created_at')
        .eq('conversation_id', conversationId)
        .eq('kind', 'text')
        .ilike('body', `%${esc(term)}%`)
        .order('created_at', { ascending: false })
        .limit(40);
      if (alive) setHits((data as Hit[] | null) ?? []);
    }, 280);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, conversationId]);

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Buscar en el chat">
        <div className="sheet-grab" />
        <input
          ref={inputRef}
          className="search-input"
          value={q}
          placeholder="Buscar en este chat"
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
        <div className="search-results">
          {hits === null && <p className="pending-empty">Escribe al menos 2 letras</p>}
          {hits?.length === 0 && <p className="pending-empty">No encontré nada 🔍</p>}
          {hits?.map((h) => (
            <button
              key={h.id}
              className="search-hit"
              onClick={() => {
                onPick(h);
                onClose();
              }}
            >
              <div className="search-hit-top">
                <b>{h.sender_id === meId ? 'Tú' : partnerName}</b>
                <span>{when(h.created_at)}</span>
              </div>
              <div className="search-hit-text">{h.body}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
