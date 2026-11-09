'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from './supabase';

const BUCKET = 'media';
const cache = new Map<string, { url: string; exp: number }>();

/** URL firmada (el bucket es privado). Se cachea para no pedirla en cada render. */
export async function getSignedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 3600_000 });
  return data.signedUrl;
}

// ───────── Copia local de fotos/audios para verlos sin señal ─────────
const MEDIA_CACHE = 'nosotros-media-v1';
const MAX_MEDIA = 250;
const offlineUrls = new Map<string, string>();
const caching = new Set<string>();
const mediaKey = (path: string) => `/__media/${path}`;

function hasCaches(): boolean {
  return typeof caches !== 'undefined';
}

async function fromCache(path: string): Promise<string | null> {
  const known = offlineUrls.get(path);
  if (known) return known;
  if (!hasCaches()) return null;
  try {
    const hit = await (await caches.open(MEDIA_CACHE)).match(mediaKey(path));
    if (!hit) return null;
    const url = URL.createObjectURL(await hit.blob());
    offlineUrls.set(path, url);
    return url;
  } catch {
    return null;
  }
}

async function saveToCache(path: string, signed: string): Promise<void> {
  if (!hasCaches() || caching.has(path)) return;
  caching.add(path);
  try {
    const c = await caches.open(MEDIA_CACHE);
    if (await c.match(mediaKey(path))) return;
    const res = await fetch(signed);
    if (!res.ok) return;
    await c.put(mediaKey(path), res);
    const keys = await c.keys();
    if (keys.length > MAX_MEDIA) await Promise.all(keys.slice(0, keys.length - MAX_MEDIA).map((k) => c.delete(k)));
  } catch {
    // sin espacio o sin red: no pasa nada
  } finally {
    caching.delete(path);
  }
}

/** URL para mostrar un archivo: con señal la firmada (y guarda copia), sin señal la copia local. */
export async function getMediaUrl(path: string): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return fromCache(path);
  const signed = await getSignedUrl(path).catch(() => null);
  if (!signed) return fromCache(path);
  void saveToCache(path, signed);
  return signed;
}

export function useSignedUrl(path: string | null, fallback?: string): string | null {
  const [url, setUrl] = useState<string | null>(fallback ?? null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void getMediaUrl(path).then((u) => {
      if (alive && u) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

export async function uploadMedia(userId: string, blob: Blob, mime: string, ext: string): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseBrowser()
    .storage.from(BUCKET)
    .upload(path, blob, { contentType: mime, cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

/** Reduce la foto antes de subirla: carga rápida y ahorra datos. Respeta la orientación EXIF. */
export async function resizeImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No pude procesar la imagen');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No pude procesar la imagen'))), 'image/jpeg', quality),
  );
}

/** Recorta al centro en cuadrado (foto de perfil). */
export async function squareImage(file: File, size = 512, quality = 0.86): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No pude procesar la imagen');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No pude procesar la imagen'))), 'image/jpeg', quality),
  );
}

/** Formato de audio que sí soporta este dispositivo (iPhone: mp4/aac, Android: webm/opus o mp4). */
export function pickAudioMime(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const options: Array<[string, string]> = [
    ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
    ['audio/mp4', 'm4a'],
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
  ];
  for (const [mime, ext] of options) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
