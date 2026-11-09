'use client';

import { useEffect, useRef, useState } from 'react';

export const STORY_BGS = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];

export type StoryDraft = { kind: 'image'; file: File; caption: string } | { kind: 'text'; caption: string; bg: string };

export default function StoryComposer({
  onPublish,
  onClose,
}: {
  onPublish: (draft: StoryDraft) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'photo' | 'text'>('photo');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [text, setText] = useState('');
  const [bg, setBg] = useState('g1');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const canPublish = mode === 'photo' ? !!file : text.trim().length > 0;

  const publish = () => {
    if (!canPublish) return;
    if (mode === 'photo' && file) onPublish({ kind: 'image', file, caption: caption.trim() });
    else onPublish({ kind: 'text', caption: text.trim(), bg });
    onClose();
  };

  return (
    <div className="story-compose" role="dialog" aria-label="Nuevo estado">
      <div className="sc-top">
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <div className="sc-tabs">
          <button className={mode === 'photo' ? 'on' : ''} onClick={() => setMode('photo')}>
            📷 Foto
          </button>
          <button className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}>
            ✍️ Texto
          </button>
        </div>
        <span style={{ width: 44 }} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setFile(f);
          e.target.value = '';
        }}
      />

      {mode === 'photo' ? (
        <div className="sc-stage">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa" className="sc-photo" />
          ) : (
            <button className="sc-pick" onClick={() => fileRef.current?.click()}>
              <span>📷</span>
              Elegir foto
            </button>
          )}
          {preview && (
            <button className="chip sc-change" onClick={() => fileRef.current?.click()}>
              Cambiar
            </button>
          )}
        </div>
      ) : (
        <div className={`sc-stage sbg-${bg}`}>
          <textarea
            className="sc-text"
            value={text}
            maxLength={220}
            placeholder="Escribe algo…"
            onChange={(e) => setText(e.target.value)}
            rows={4}
          />
        </div>
      )}

      <div className="sc-bottom">
        {mode === 'photo' ? (
          <input
            className="sc-caption"
            value={caption}
            maxLength={200}
            placeholder="Agrega un texto (opcional)"
            onChange={(e) => setCaption(e.target.value)}
          />
        ) : (
          <div className="sc-bgs">
            {STORY_BGS.map((b) => (
              <button
                key={b}
                className={`sc-dot sbg-${b} ${bg === b ? 'on' : ''}`}
                onClick={() => setBg(b)}
                aria-label={`Fondo ${b}`}
              />
            ))}
          </div>
        )}
        <button className="btn" disabled={!canPublish} onClick={publish}>
          Publicar · dura 24 h
        </button>
      </div>
    </div>
  );
}
