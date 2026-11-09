'use client';

import { useState } from 'react';
import { snippet } from '@/lib/emoji';
import type { Msg } from './Bubble';

const QUICK = ['❤️', '😂', '😮', '😢', '🙏', '🔥', '👍'];

export default function ActionSheet({
  msg,
  mine,
  myReaction,
  onClose,
  onReact,
  onReply,
  onCopy,
  onDelete,
}: {
  msg: Msg;
  mine: boolean;
  myReaction: string | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Acciones del mensaje">
        <div className="sheet-grab" />
        <div className="emoji-row">
          {QUICK.map((e) => (
            <button
              key={e}
              className={`emoji-btn ${myReaction === e ? 'active' : ''}`}
              onClick={() => {
                onReact(e);
                onClose();
              }}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="sheet-preview">{snippet(msg)}</div>
        <div className="sheet-list">
          <button
            onClick={() => {
              onReply();
              onClose();
            }}
          >
            <span>↩️</span> Responder
          </button>
          {msg.kind === 'text' && (
            <button
              onClick={() => {
                onCopy();
                onClose();
              }}
            >
              <span>📋</span> Copiar
            </button>
          )}
          {mine &&
            (confirm ? (
              <button
                className="danger"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
              >
                <span>🗑️</span> Sí, borrar para los dos
              </button>
            ) : (
              <button className="danger" onClick={() => setConfirm(true)}>
                <span>🗑️</span> Borrar para los dos
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
