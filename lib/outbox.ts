'use client';

import { isNetworkError, isOnline } from './offline';
import { notifyPartner } from './push';
import { supabaseBrowser } from './supabase';

/** Mensaje que todavía no llega al servidor. Vive en IndexedDB para sobrevivir si cierras la app. */
export type OutItem = {
  id: string;
  uid: string;
  conv: string;
  created_at: string;
  row: Record<string, unknown>;
  blob?: Blob;
  mime?: string;
  ext?: string;
  path?: string | null;
  reminderAt?: string | null;
};

export type OutEvent = { id: string; conv: string; state: 'pending' | 'sent' | 'failed'; reminder: boolean };

const DB = 'nosotros';
const STORE = 'outbox';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      resolve(req.result);
      db.close();
    };
    t.onerror = () => {
      reject(t.error);
      db.close();
    };
  });
}

export const outPut = (item: OutItem) => tx('readwrite', (s) => s.put(item)).then(() => undefined);
export const outDel = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);
export async function outList(conv?: string): Promise<OutItem[]> {
  try {
    const all = (await tx('readonly', (s) => s.getAll())) as OutItem[];
    return all.filter((i) => !conv || i.conv === conv).sort((a, b) => a.created_at.localeCompare(b.created_at));
  } catch {
    return [];
  }
}

const subs = new Set<(e: OutEvent) => void>();
export function onOutbox(cb: (e: OutEvent) => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}
const emit = (e: OutEvent) => subs.forEach((cb) => cb(e));

const inflight = new Set<string>();

/** Intenta mandar un mensaje de la bandeja. Si no hay señal se queda guardado para después. */
export async function deliver(item: OutItem): Promise<void> {
  if (inflight.has(item.id)) return;
  inflight.add(item.id);
  const reminder = !!item.reminderAt;
  emit({ id: item.id, conv: item.conv, state: 'pending', reminder });
  try {
    if (!isOnline()) throw new Error('offline');
    const client = supabaseBrowser();
    const row: Record<string, unknown> = { ...item.row, conversation_id: item.conv };
    if (item.blob) {
      if (!item.path) {
        const path = `${item.uid}/${crypto.randomUUID()}.${item.ext ?? 'bin'}`;
        const up = await client.storage
          .from('media')
          .upload(path, item.blob, { contentType: item.mime, cacheControl: '3600', upsert: false });
        if (up.error) throw up.error;
        item.path = path;
        await outPut(item).catch(() => {});
      }
      row.media_path = item.path;
    }
    const { error } = await client.from('messages').insert(row);
    if (error && error.code !== '23505') throw error; // 23505 = ya estaba guardado
    if (item.reminderAt) {
      await client
        .from('reminders')
        .upsert(
          { user_id: item.uid, message_id: item.id, remind_at: item.reminderAt, done: false, fired: 0, last_fired_at: null },
          { onConflict: 'user_id,message_id' },
        );
    }
    await outDel(item.id).catch(() => {});
    emit({ id: item.id, conv: item.conv, state: 'sent', reminder });
    if (!error) void notifyPartner(item.id);
  } catch (e) {
    emit({ id: item.id, conv: item.conv, state: isNetworkError(e) ? 'pending' : 'failed', reminder });
  } finally {
    inflight.delete(item.id);
  }
}

/** Manda todo lo pendiente (en orden). */
export async function flushOutbox(conv?: string): Promise<void> {
  if (!isOnline()) return;
  for (const item of await outList(conv)) {
    await deliver(item);
    if (!isOnline()) return;
  }
}
