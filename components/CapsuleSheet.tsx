'use client';

import { useEffect, useRef, useState } from 'react';
import TimeSheet from './TimeSheet';

export type CapsuleDraft = { kind: 'text'; body: string } | { kind: 'image'; file: File };

export default function CapsuleSheet({
  partnerName,
  onCreate,
  onClose,
}: {
  partnerName: string;
  onCreate: (d: CapsuleDraft, at: Date) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const ready = file !== null || text.trim().length > 0;

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cápsula del tiempo">
        <div className="sheet-grab" />
        <h2 className="sheet-title">Cápsula del tiempo 🎁</h2>
        <p className="sheet-sub">
          Escribe algo o sube una foto. {partnerName} la verá cerrada y solo se abre el día que elijas.
        </p>

        {preview ? (
          <div className="capsule-prev">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Foto de la cápsula" />
            <button className="btn ghost" onClick={() => setFile(null)}>
              Quitar foto
            </button>
          </div>
        ) : (
          <>
            <textarea
              className="capsule-text"
              rows={4}
              maxLength={2000}
              placeholder="Para cuando se abra…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>
              📷 Mejor una foto
            </button>
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
          </>
        )}

        <div className="sheet-actions">
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" disabled={!ready} onClick={() => setPick(true)}>
            Elegir cuándo
          </button>
        </div>
      </div>

      {pick && (
        <TimeSheet
          long
          title="¿Cuándo se abre?"
          sub="Hasta esa fecha nadie la puede ver (solo tú, que la escribiste)."
          confirmLabel="Guardar cápsula"
          onClose={() => setPick(false)}
          onPick={(at) => {
            onCreate(file ? { kind: 'image', file } : { kind: 'text', body: text.trim() }, at);
            onClose();
          }}
        />
      )}
    </div>
  );
}
