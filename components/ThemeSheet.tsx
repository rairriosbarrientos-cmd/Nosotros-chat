'use client';

import { COMBOS, THEMES, WALLS } from '@/lib/supabase';
import Wall from './Wall';

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
        <h2 className="sheet-title">Estilo de este chat 🎨</h2>
        <p className="sheet-sub">Solo lo ves tú. Cada chat puede tener el suyo.</p>

        <p className="sheet-sub">Combos</p>
        <div className="combo-row">
          {COMBOS.map((c) => (
            <button
              key={c.name}
              className={`combo ${theme === c.theme && wall === c.wall ? 'on' : ''}`}
              onClick={() => onChange(c.theme, c.wall)}
            >
              <div className="tile" data-theme={c.theme}>
                <Wall id={c.wall} mini />
                <div className="tile-bubbles">
                  <i />
                  <i />
                </div>
              </div>
              <small>{c.name}</small>
            </button>
          ))}
        </div>

        <p className="sheet-sub">Colores</p>
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
        <div className="wall-grid">
          {WALLS.map((w) => (
            <button key={w.id} className={`wall-pick ${wall === w.id ? 'on' : ''}`} onClick={() => onChange(theme, w.id)}>
              <div className="tile">
                {w.id === 'none' && <div className="aurora" />}
                <Wall id={w.id} mini />
              </div>
              <small>{w.name}</small>
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
