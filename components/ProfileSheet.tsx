'use client';

import { useRef } from 'react';
import Avatar from './Avatar';

export default function ProfileSheet({
  name,
  path,
  busy,
  onPick,
  onRemove,
  onClose,
}: {
  name: string;
  path: string | null;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mi foto de perfil">
        <div className="sheet-grab" />
        <h2 className="sheet-title">Mi foto de perfil</h2>
        <p className="sheet-sub">Así te ve en el chat. Se recorta en cuadrado.</p>
        <div className="profile-big">
          <Avatar name={name} path={path} size={132} />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = '';
          }}
        />
        <div className="sheet-actions">
          {path && (
            <button className="btn ghost" disabled={busy} onClick={onRemove}>
              Quitar
            </button>
          )}
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Subiendo…' : path ? 'Cambiar foto' : 'Elegir foto'}
          </button>
        </div>
      </div>
    </div>
  );
}
