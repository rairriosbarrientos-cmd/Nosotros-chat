'use client';

import { useMemo, useState } from 'react';

type Preset = { label: string; at: () => Date };

function today(h: number, m = 0): Date {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function tomorrow(h: number, m = 0): Date {
  const d = today(h, m);
  d.setDate(d.getDate() + 1);
  return d;
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatWhen(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const sameDay = d.toDateString() === new Date().toDateString();
  const tmr = new Date();
  tmr.setDate(tmr.getDate() + 1);
  const hour = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `hoy ${hour}`;
  if (d.toDateString() === tmr.toDateString()) return `mañana ${hour}`;
  return `${d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} ${hour}`;
}

export default function TimeSheet({
  title,
  sub,
  confirmLabel,
  onPick,
  onClose,
  long,
}: {
  long?: boolean;
  title: string;
  sub: string;
  confirmLabel: string;
  onPick: (at: Date) => void;
  onClose: () => void;
}) {
  const presets = useMemo<Preset[]>(() => {
    if (long) {
      const inDays = (d: number) => () => {
        const x = new Date();
        x.setDate(x.getDate() + d);
        x.setHours(9, 0, 0, 0);
        return x;
      };
      return [
        { label: 'Mañana', at: inDays(1) },
        { label: 'En 1 semana', at: inDays(7) },
        { label: 'En 1 mes', at: inDays(30) },
        { label: 'En 6 meses', at: inDays(182) },
        { label: 'En 1 año', at: inDays(365) },
      ];
    }
    const list: Preset[] = [
      { label: 'En 30 min', at: () => new Date(Date.now() + 30 * 60_000) },
      { label: 'En 1 hora', at: () => new Date(Date.now() + 60 * 60_000) },
      { label: 'En 3 horas', at: () => new Date(Date.now() + 3 * 60 * 60_000) },
    ];
    if (today(20).getTime() - Date.now() > 10 * 60_000) list.push({ label: 'Hoy 8:00 pm', at: () => today(20) });
    list.push({ label: 'Mañana 9:00 am', at: () => tomorrow(9) });
    list.push({ label: 'Mañana 6:00 pm', at: () => tomorrow(18) });
    return list;
  }, [long]);

  const [picked, setPicked] = useState<number | null>(null);
  const [custom, setCustom] = useState('');

  const chosen = (): Date | null => {
    if (custom) {
      const d = new Date(custom);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return picked !== null ? presets[picked].at() : null;
  };

  const at = chosen();
  const valid = !!at && at.getTime() > Date.now() + 20_000;

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-grab" />
        <h2 className="sheet-title">{title}</h2>
        <p className="sheet-sub">{sub}</p>

        <div className="chips">
          {presets.map((p, i) => (
            <button
              key={p.label}
              className={`chip ${picked === i && !custom ? 'on' : ''}`}
              onClick={() => {
                setPicked(i);
                setCustom('');
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="status-input">
          <input
            type="datetime-local"
            value={custom}
            min={toLocalInput(new Date())}
            onChange={(e) => {
              setCustom(e.target.value);
              setPicked(null);
            }}
            aria-label="Fecha y hora"
          />
        </div>

        {at && valid && <p className="sheet-sub when">{formatWhen(at)}</p>}
        {at && !valid && <p className="sheet-sub when bad">Esa hora ya pasó</p>}

        <div className="sheet-actions">
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn"
            disabled={!valid}
            onClick={() => {
              if (at && valid) {
                onPick(at);
                onClose();
              }
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
