import type { Message } from './supabase';

const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]+$/u;

type SegmenterLike = new (
  locale?: string,
  options?: { granularity: 'grapheme' },
) => { segment(input: string): Iterable<unknown> };

/** Mensajes de 1 a 3 emojis solos se muestran grandes, sin burbuja. */
export function isEmojiOnly(text: string | null): boolean {
  if (!text) return false;
  const t = text.replace(/\s/g, '');
  if (!t || !EMOJI_ONLY.test(t)) return false;
  const Seg = (Intl as unknown as { Segmenter?: SegmenterLike }).Segmenter;
  const count = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(t)].length : [...t].length;
  return count <= 3;
}

/** Texto corto para citas y vistas previas. */
export function snippet(m: Pick<Message, 'kind' | 'body'>): string {
  if (m.kind === 'image') return '📷 Foto';
  if (m.kind === 'audio') return '🎤 Nota de voz';
  if (m.kind === 'ping') return '💜 Toque';
  if (m.kind === 'capsule') return '🎁 Cápsula del tiempo';
  if (m.kind === 'promise') return `⏳ ${(m.body ?? '').slice(0, 80)}`;
  const t = (m.body ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 90 ? `${t.slice(0, 87)}…` : t;
}

export function formatUntil(d: Date): string {
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString('es-MX', { weekday: 'short' })} ${time}`;
}
