'use client';

import { useState } from 'react';

export type QuickPick = { type: string; emoji: string; body: string };

const ETAS = [15, 30, 45, 60, 90];

function etaLabel(min: number): string {
  const at = new Date(Date.now() + min * 60_000);
  const hour = at.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  return `Voy en camino · llego como a las ${hour}`;
}

const SIMPLE: QuickPick[] = [
  { type: 'arrived', emoji: '📍', body: 'Ya llegué' },
  { type: 'left', emoji: '🚪', body: 'Ya salí del trabajo' },
  { type: 'home', emoji: '🏠', body: 'Ya estoy en casa' },
  { type: 'morning', emoji: '☀️', body: 'Buenos días' },
  { type: 'night', emoji: '🌙', body: 'Buenas noches' },
];

export default function QuickSheet({
  onSend,
  onCapsule,
  onClose,
}: {
  onSend: (q: QuickPick) => void;
  onCapsule: () => void;
  onClose: () => void;
}) {
  const [omw, setOmw] = useState(false);

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Avisos rápidos">
        <div className="sheet-grab" />
        <h2 className="sheet-title">Avisos rápidos ⚡</h2>
        <p className="sheet-sub">Un toque y listo, sin ubicación en vivo.</p>

        {omw ? (
          <>
            <p className="sheet-sub">¿En cuánto llegas?</p>
            <div className="chips">
              {ETAS.map((m) => (
                <button
                  key={m}
                  className="chip"
                  onClick={() => {
                    onSend({ type: 'omw', emoji: '🚗', body: etaLabel(m) });
                    onClose();
                  }}
                >
                  {m < 60 ? `${m} min` : m === 60 ? '1 hora' : '1.5 h'}
                </button>
              ))}
              <button
                className="chip"
                onClick={() => {
                  onSend({ type: 'omw', emoji: '🚗', body: 'Voy en camino' });
                  onClose();
                }}
              >
                Sin hora
              </button>
            </div>
            <button className="btn ghost" onClick={() => setOmw(false)}>
              Atrás
            </button>
          </>
        ) : (
          <div className="sheet-list">
            <button onClick={() => setOmw(true)}>
              <span>🚗</span> Voy en camino…
            </button>
            {SIMPLE.map((q) => (
              <button
                key={q.type}
                onClick={() => {
                  onSend(q);
                  onClose();
                }}
              >
                <span>{q.emoji}</span> {q.body}
              </button>
            ))}
            <button
              onClick={() => {
                onClose();
                onCapsule();
              }}
            >
              <span>🎁</span> Cápsula del tiempo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
