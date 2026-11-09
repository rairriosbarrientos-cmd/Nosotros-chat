'use client';

import { THEMES, WALLS } from '@/lib/supabase';

export default function ThemeSheet({
  theme,
  wall,
  onChange,
  onClose,
}: {
  theme: string;
  wall: string;
  onChange: (theme: string, wall: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tema del chat">
        <div className="sheet-grab" />
        <h2 className="sheet-title">Tema de este chat 🎨</h2>
        <p className="sheet-sub">Solo lo ves tú. Cada chat puede tener su propio estilo.</p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-dot ${theme === t.id ? 'on' : ''}`}
              onClick={() => onChange(t.id, wall)}
              aria-label={t.name}
            >
              <span style={{ background: `linear-gradient(135deg, ${t.a}, ${t.b})` }} />
              <small>{t.name}</small>
            </button>
          ))}
        </div>
        <p className="sheet-sub">Fondo</p>
        <div className="chips">
          {WALLS.map((w) => (
            <button key={w.id} className={`chip ${wall === w.id ? 'on' : ''}`} onClick={() => onChange(theme, w.id)}>
              {w.name}
            </button>
          ))}
        </div>
        <div className="sheet-actions">
          <button className="btn" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
