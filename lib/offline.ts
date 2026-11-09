'use client';

import { useEffect, useState } from 'react';

const PREFIX = 'nos:';

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** true/false según haya señal (se actualiza solo). */
export function useOnline(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const set = () => setOn(isOnline());
    set();
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => {
      window.removeEventListener('online', set);
      window.removeEventListener('offline', set);
    };
  }, []);
  return on;
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Sin espacio: no pasa nada, solo no se guarda la copia
  }
}

/** Usuario de la última sesión guardada (para abrir sin señal aunque el token ya haya caducado). */
export function cachedUserId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
      const v = JSON.parse(localStorage.getItem(k) ?? 'null') as { user?: { id?: string } } | null;
      if (v?.user?.id) return v.user.id;
    }
  } catch {
    // ignorar
  }
  return null;
}

/** ¿Falló por falta de red (y no porque el servidor lo rechazó)? */
export function isNetworkError(e: unknown): boolean {
  if (!isOnline()) return true;
  if (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string' && (e as { code: string }).code) {
    return false;
  }
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return /fetch|network|load failed|timeout|offline|internet/i.test(msg);
}

const TIMED_OUT = Symbol('timeout');

/** Usuario de la sesión. Sin señal no espera al servidor (supabase reintenta ~30 s): usa la guardada. */
export async function currentUserId(getSession: () => Promise<{ data: { session: { user: { id: string } } | null } }>): Promise<string | null> {
  if (!isOnline()) return cachedUserId();
  const res = await Promise.race([
    getSession().catch(() => TIMED_OUT),
    new Promise<typeof TIMED_OUT>((r) => setTimeout(() => r(TIMED_OUT), 6000)),
  ]);
  if (typeof res === 'symbol') return cachedUserId();
  return res.data.session?.user.id ?? null;
}
