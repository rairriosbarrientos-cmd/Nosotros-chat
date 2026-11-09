'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { APP_NAME, supabaseBrowser } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si ya hay sesión, directo al chat
  useEffect(() => {
    try {
      void supabaseBrowser()
        .auth.getSession()
        .then(({ data }) => {
          if (data.session) router.replace('/');
        });
    } catch {
      setError('Faltan las variables de Supabase en Netlify. Agrégalas y vuelve a desplegar.');
    }
  }, [router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    let result;
    try {
      result = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    } catch {
      setError('Faltan las variables de Supabase en Netlify. Agrégalas y vuelve a desplegar.');
      setBusy(false);
      return;
    }
    if (result.error) {
      setError('Correo o contraseña incorrectos');
      setBusy(false);
      return;
    }
    router.replace('/');
  };

  return (
    <main className="app center login">
      <div className="aurora" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="login-logo" width={96} height={96} />
      <h1>{APP_NAME}</h1>
      <p className="login-sub">Solo para nosotros dos</p>
      <form onSubmit={submit} className="login-form">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Correo"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Contraseña"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="login-error">{error}</div>}
        <button className="btn" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
