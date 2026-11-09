import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Nosotros';

let client: SupabaseClient | null = null;

/** Cliente del navegador (la sesión se guarda y se refresca sola). */
export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

export type Kind = 'text' | 'image' | 'audio' | 'ping' | 'promise' | 'quick' | 'capsule';

export type MsgMeta = { at?: string; type?: string; emoji?: string; open_at?: string; ctype?: 'text' | 'image' };

export type Message = {
  id: string;
  sender_id: string;
  kind: Kind;
  body: string | null;
  media_path: string | null;
  media_mime: string | null;
  duration_ms: number | null;
  waveform: number[] | null;
  reply_to: string | null;
  created_at: string;
  read_at: string | null;
  conversation_id?: string;
  edited_at?: string | null;
  meta?: MsgMeta | null;
};

export type Member = {
  user_id: string;
  display_name: string;
  status_emoji: string | null;
  status_text: string | null;
  status_until: string | null;
  nudges_on?: boolean;
  avatar_path?: string | null;
};

export const THEMES = [
  { id: 'aurora', name: 'Aurora', a: '#ff6b8b', b: '#7c5cff' },
  { id: 'rose', name: 'Rosa', a: '#ff5c8a', b: '#ff9a6b' },
  { id: 'ocean', name: 'Océano', a: '#2dd4ff', b: '#3b6dff' },
  { id: 'forest', name: 'Bosque', a: '#3ddc97', b: '#1aa6a0' },
  { id: 'sunset', name: 'Atardecer', a: '#ff8a3d', b: '#e5426b' },
  { id: 'mono', name: 'Noche', a: '#9aa4b8', b: '#5b6478' },
  { id: 'gold', name: 'Dorado', a: '#f5c451', b: '#d9822b' },
] as const;
export const WALLS = [
  { id: 'none', name: 'Liso' },
  { id: 'dots', name: 'Puntos' },
  { id: 'hearts', name: 'Corazones' },
  { id: 'lines', name: 'Líneas' },
] as const;

export type Story = {
  id: string;
  user_id: string;
  kind: 'image' | 'text';
  media_path: string | null;
  caption: string | null;
  bg: string | null;
  created_at: string;
  expires_at: string;
};
export type StoryView = { story_id: string; viewer_id: string; seen_at: string };

export type Reminder = { id: string; message_id: string; remind_at: string };
export type Scheduled = { id: string; body: string; send_at: string };

export type Reaction = { message_id: string; user_id: string; emoji: string };

export type ActiveStatus = { emoji: string | null; text: string | null; until: Date | null };

/** El estado solo cuenta si no ha expirado. */
export function activeStatus(m: Member | null, now = Date.now()): ActiveStatus | null {
  if (!m || (!m.status_emoji && !m.status_text)) return null;
  const until = m.status_until ? new Date(m.status_until) : null;
  if (until && until.getTime() <= now) return null;
  return { emoji: m.status_emoji, text: m.status_text, until };
}
