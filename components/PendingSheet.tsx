'use client';

import type { Reminder, Scheduled } from '@/lib/supabase';
import { formatWhen } from './TimeSheet';

export default function PendingSheet({
  scheduled,
  reminders,
  reminderText,
  onCancelScheduled,
  onCancelReminder,
  onJump,
  onClose,
}: {
  scheduled: Scheduled[];
  reminders: Reminder[];
  reminderText: (messageId: string) => string;
  onCancelScheduled: (id: string) => void;
  onCancelReminder: (id: string) => void;
  onJump: (messageId: string) => void;
  onClose: () => void;
}) {
  const empty = scheduled.length === 0 && reminders.length === 0;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pendientes">
        <div className="sheet-grab" />
        <h2 className="sheet-title">Pendientes</h2>
        <p className="sheet-sub">Mensajes programados y recordatorios activos.</p>

        {empty && <p className="pending-empty">No tienes nada pendiente ✨</p>}

        {scheduled.length > 0 && <div className="pending-h">🕒 Se enviarán</div>}
        {scheduled.map((s) => (
          <div className="pending-row" key={s.id}>
            <div className="pending-main">
              <div className="pending-text">{s.body}</div>
              <div className="pending-when">{formatWhen(s.send_at)}</div>
            </div>
            <button className="chip" onClick={() => onCancelScheduled(s.id)}>
              Cancelar
            </button>
          </div>
        ))}

        {reminders.length > 0 && <div className="pending-h">⏰ Te recordaré</div>}
        {reminders.map((r) => (
          <div className="pending-row" key={r.id}>
            <button
              className="pending-main as-btn"
              onClick={() => {
                onJump(r.message_id);
                onClose();
              }}
            >
              <div className="pending-text">{reminderText(r.message_id)}</div>
              <div className="pending-when">{formatWhen(r.remind_at)}</div>
            </button>
            <button className="chip" onClick={() => onCancelReminder(r.id)}>
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
