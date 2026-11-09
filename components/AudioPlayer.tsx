'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, useSignedUrl } from '@/lib/media';

const SPEEDS = [1, 1.5, 2] as const;
const FALLBACK_BARS = 36;

/** Onda "falsa" pero estable (siempre igual para el mismo audio) si no hay onda guardada. */
function pseudoWave(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: FALLBACK_BARS }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return 18 + (h % 70);
  });
}

export default function AudioPlayer({
  path,
  durationMs,
  localUrl,
  waveform,
  seed,
}: {
  path: string | null;
  durationMs: number | null;
  localUrl?: string;
  waveform: number[] | null;
  seed: string;
}) {
  const url = useSignedUrl(path, localUrl);
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);

  const bars = useMemo(() => (waveform && waveform.length > 4 ? waveform : pseudoWave(seed)), [waveform, seed]);

  useEffect(() => {
    const a = ref.current;
    if (a) a.playbackRate = SPEEDS[speedIdx];
  }, [speedIdx, url]);

  const toggle = async () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      // Solo una nota suena a la vez
      document.querySelectorAll('audio').forEach((el) => {
        if (el !== a) el.pause();
      });
      try {
        await a.play();
      } catch {
        /* el navegador bloqueó la reproducción */
      }
    } else {
      a.pause();
    }
  };

  const seek = (clientX: number, el: HTMLElement) => {
    const a = ref.current;
    if (!a || !isFinite(a.duration) || a.duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * a.duration;
    setProgress(ratio);
  };

  const total = durationMs ?? 0;
  const shown = playing || progress > 0 ? progress * total : total;

  return (
    <div className="audio">
      <button className="audio-btn" onClick={toggle} disabled={!url} aria-label={playing ? 'Pausar' : 'Reproducir'}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1.2" />
            <rect x="14" y="5" width="4" height="14" rx="1.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
          </svg>
        )}
      </button>
      <div className="audio-mid">
        <div
          className="wave"
          onPointerDown={(e) => {
            e.stopPropagation();
            seek(e.clientX, e.currentTarget);
          }}
        >
          {bars.map((v, i) => (
            <span
              key={i}
              className={`wave-bar ${(i + 0.5) / bars.length <= progress ? 'on' : ''}`}
              style={{ height: `${Math.max(12, Math.min(100, v))}%` }}
            />
          ))}
        </div>
        <div className="audio-time">{formatDuration(shown)}</div>
      </div>
      <button className="audio-speed" onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}>
        {SPEEDS[speedIdx]}x
      </button>
      {url && (
        <audio
          ref={ref}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            if (isFinite(a.duration) && a.duration > 0) setProgress(a.currentTime / a.duration);
          }}
        />
      )}
    </div>
  );
}
