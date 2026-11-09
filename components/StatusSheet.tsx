'use client';

import { useState } from 'react';
import type { ActiveStatus } from '@/lib/supabase';

const PRESETS = [
  { e: '🏗️', t: 'En obra' },
  { e: '🚗', t: 'Manejando' },
  { e: '🍽️', t: 'Comiendo' },
  { e: '😴', t: 'Durmiendo' },
  { e: '💼', t: 'Ocupado' },
  { e: '🎧', t: 'No molestar' },
  { e: '🏠', t: 'Libre' },
  { e: '💪', t: 'Entrenando' },
];

type Duration = '30m' | '1h' | '2h' | '4h' | 'day' | 'none';
const DURATIONS: Array<[Duration, string]> = [
  ['30m', '30 min'],
  ['1h', '1 hora'],
  ['2h', '2 horas'],
  ['4h', '4 horas'],
  ['day', 'Hoy'],
  ['none', 'Sin límite'],
];

function untilFor(d: Duration): Date | null {
  const now = new Date();
  switch (d) {
    case '30m':
      return new Date(now.getTime() + 30 * 60_000);
    case '1h':
      return new Date(now.getTime() + 60 * 60_000);
    case '2h':
      return new Date(now.getTime() + 2 * 60 * 60_000);
    case '4h':
      return new Date(now.getTime() + 4 * 60 * 60_000);
    case 'day': {
      const end = new Date(now);
      end.setHours(23, 59, 0, 0);
      return end;
    }
    default:
      return null;
  }
}

export default function StatusSheet({
  current,
  onSave,
  onClear,
  onClose,
}: {
  current: ActiveStatus | null;
  onSave: (emoji: string, text: string, until: Date | null) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [emoji, setEmoji] = useState(current?.emoji ?? '');
  const [text, setText] = useState(current?.text ?? '');
  const [dur, setDur] = useState<Duration>('2h');

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tu estado">
        <div className="sheet-grab" />
        <h2 className="sheet-title">Tu estado</h2>
        <p className="sheet-sub">Ella lo ve arriba del chat, así sabe por qué no contestas al momento.</p>

        <div className="chips">
          {PRESETS.map((p) => (
            <button
              key={p.t}
              className={`chip ${emoji === p.e && text.startsWith(p.t) ? 'on' : ''}`}
              onClick={() => {
                setEmoji(p.e);
                setText(p.t);
              }}
            >
              <span>{p.e}</span> {p.t}
            </button>
          ))}
        </div>

        <div className="status-input">
          <input
            className="status-emoji"
            value={emoji}
            maxLength={4}
            placeholder="🙂"
            onChange={(e) => setEmoji(e.target.value)}
            aria-label="Emoji"
          />
          <input
            value={text}
            maxLength={80}
            placeholder="Ej. En obra · te contesto a las 7"
            onChange={(e) => setText(e.target.value)}
            aria-label="Texto del estado"
          />
        </div>

        <div className="chips small">
          {DURATIONS.map(([k, label]) => (
            <button key={k} className={`chip ${dur === k ? 'on' : ''}`} onClick={() => setDur(k)}>
              {label}
            </button>
          ))}
        </div>

        <div className="sheet-actions">
          {current && (
            <button
              className="btn ghost"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              Quitar estado
            </button>
          )}
          <button
            className="btn"
            disabled={!emoji.trim() && !text.trim()}
            onClick={() => {
              onSave(emoji, text, untilFor(dur));
              onClose();
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
