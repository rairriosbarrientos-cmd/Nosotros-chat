'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration, pickAudioMime } from '@/lib/media';
import TimeSheet from './TimeSheet';

const MAX_RECORD_MS = 5 * 60_000;
const MIN_RECORD_MS = 800;
const SAMPLE_MS = 80;
const WAVE_BARS = 40;
const LIVE_BARS = 30;

type Props = {
  reply: { name: string; text: string } | null;
  onCancelReply: () => void;
  onSendText: (text: string) => void;
  editing: { id: string; text: string } | null;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  onSchedule: (text: string, at: Date) => void;
  onSendImage: (file: File) => void;
  onSendAudio: (blob: Blob, mime: string, ext: string, durationMs: number, waveform: number[]) => void;
  onTyping: () => void;
  onQuick: () => void;
};

/** Reduce las muestras de volumen a WAVE_BARS barras (0–100) para guardarlas con la nota. */
function toWaveform(samples: number[]): number[] {
  if (samples.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < WAVE_BARS; i++) {
    const from = Math.floor((i / WAVE_BARS) * samples.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / WAVE_BARS) * samples.length));
    let peak = 0;
    for (let j = from; j < to && j < samples.length; j++) peak = Math.max(peak, samples[j]);
    out.push(peak);
  }
  const max = Math.max(...out, 0.001);
  return out.map((v) => Math.round(Math.max(10, (v / max) * 100)));
}

export default function Composer({ reply, onCancelReply, onSendText, editing, onCancelEdit, onSaveEdit, onSchedule, onSendImage, onSendAudio, onTyping, onQuick }: Props) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startRef = useRef(0);
  const cancelRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const samplesRef = useRef<number[]>([]);

  const resize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, []);

  // Al elegir "Responder", enfoca el campo de texto
  useEffect(() => {
    if (reply) taRef.current?.focus();
  }, [reply]);

  // Al elegir "Editar", carga el texto y enfoca
  useEffect(() => {
    if (!editing) return;
    setText(editing.text);
    requestAnimationFrame(() => {
      resize();
      taRef.current?.focus();
    });
  }, [editing, resize]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (editing) {
      onSaveEdit(value);
      setText('');
      requestAnimationFrame(resize);
      return;
    }
    onSendText(value);
    setText('');
    requestAnimationFrame(() => {
      resize();
      taRef.current?.focus();
    });
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const startRecording = async () => {
    setError(null);
    const fmt = pickAudioMime();
    if (!fmt || !navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no puede grabar audio');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: fmt.mime });
      chunksRef.current = [];
      samplesRef.current = [];
      cancelRef.current = false;

      // Medidor de volumen para dibujar la onda (si falla, la nota se envía igual sin onda)
      let analyser: AnalyserNode | null = null;
      let buf: Uint8Array<ArrayBuffer> | null = null;
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          audioCtxRef.current = ctx;
          analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          ctx.createMediaStreamSource(stream).connect(analyser);
          buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        }
      } catch {
        analyser = null;
      }

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const duration = Date.now() - startRef.current;
        const blob = new Blob(chunksRef.current, { type: fmt.mime.split(';')[0] });
        const wave = toWaveform(samplesRef.current);
        stopTracks();
        setRecording(false);
        setElapsed(0);
        setLive([]);
        if (!cancelRef.current && duration >= MIN_RECORD_MS && blob.size > 0) {
          onSendAudio(blob, blob.type, fmt.ext, duration, wave);
        }
      };
      recRef.current = rec;
      startRef.current = Date.now();
      rec.start();
      setRecording(true);

      tickRef.current = setInterval(() => {
        const ms = Date.now() - startRef.current;
        setElapsed(ms);
        if (analyser && buf) {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
          samplesRef.current.push(peak);
          setLive((l) => [...l.slice(-(LIVE_BARS - 1)), peak]);
        }
        if (ms >= MAX_RECORD_MS) recRef.current?.stop();
      }, SAMPLE_MS);
    } catch {
      stopTracks();
      setError('Necesito permiso del micrófono para grabar');
    }
  };

  const finishRecording = (cancel: boolean) => {
    cancelRef.current = cancel;
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  };

  useEffect(
    () => () => {
      cancelRef.current = true;
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      stopTracks();
    },
    [],
  );

  if (recording) {
    return (
      <div className="composer-wrap">
        <div className="composer recording">
          <button className="icon-btn danger" onClick={() => finishRecording(true)} aria-label="Cancelar grabación">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12" />
            </svg>
          </button>
          <div className="rec-info">
            <span className="rec-dot" />
            <span className="rec-time">{formatDuration(elapsed)}</span>
            <div className="rec-wave" aria-hidden>
              {Array.from({ length: LIVE_BARS }, (_, i) => {
                const v = live[live.length - LIVE_BARS + i] ?? 0;
                return <span key={i} style={{ height: `${Math.max(8, Math.min(100, v * 260))}%` }} />;
              })}
            </div>
          </div>
          <button className="send-btn" onClick={() => finishRecording(false)} aria-label="Enviar nota de voz">
            <SendIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="composer-wrap">
      {error && (
        <div className="composer-error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {editing && (
        <div className="reply-bar">
          <div className="reply-accent" />
          <div className="reply-body">
            <div className="reply-name">Editando mensaje</div>
            <div className="reply-text">{editing.text}</div>
          </div>
          <button
            className="icon-btn"
            onClick={() => {
              onCancelEdit();
              setText('');
              requestAnimationFrame(resize);
            }}
            aria-label="Cancelar edición"
          >
            ✕
          </button>
        </div>
      )}
      {reply && !editing && (
        <div className="reply-bar">
          <div className="reply-accent" />
          <div className="reply-body">
            <div className="reply-name">Respondiendo a {reply.name}</div>
            <div className="reply-text">{reply.text}</div>
          </div>
          <button className="icon-btn" onClick={onCancelReply} aria-label="Cancelar respuesta">
            ✕
          </button>
        </div>
      )}
      <div className="composer">
        <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Enviar foto">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <circle cx="9" cy="10.5" r="1.6" />
            <path d="M21 16l-5-5-8 8" />
          </svg>
        </button>
        {!editing && (
          <button className="icon-btn quick-btn" onClick={onQuick} aria-label="Avisos rápidos y cápsula">
            ⚡
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSendImage(f);
            e.target.value = '';
          }}
        />
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          placeholder="Escribe un mensaje"
          enterKeyHint="send"
          onChange={(e) => {
            setText(e.target.value);
            resize();
            onTyping();
          }}
          onKeyDown={(e) => {
            // En compu Enter envía; en el cel Enter = salto de línea
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {text.trim() ? (
          <>
            {!editing && <button className="icon-btn sched-btn" onClick={() => setTimeOpen(true)} aria-label="Programar mensaje">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
            </button>}
            <button className="send-btn" onClick={submit} aria-label={editing ? 'Guardar cambios' : 'Enviar'}>
              <SendIcon />
            </button>
          </>
        ) : (
          <button className="send-btn mic" onClick={startRecording} aria-label="Grabar nota de voz">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
      </div>
      {timeOpen && (
        <TimeSheet
          title="Programar mensaje"
          sub="Se enviará solo a la hora que elijas, aunque tengas la app cerrada."
          confirmLabel="Programar"
          onClose={() => setTimeOpen(false)}
          onPick={(at) => {
            onSchedule(text.trim(), at);
            setText('');
            requestAnimationFrame(resize);
          }}
        />
      )}
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
    </svg>
  );
}
