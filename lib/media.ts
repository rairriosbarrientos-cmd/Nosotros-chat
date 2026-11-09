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

export function useSignedUrl(path: string | null, fallback?: string): string | null {
  const [url, setUrl] = useState<string | null>(fallback ?? null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void getSignedUrl(path).then((u) => {
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
