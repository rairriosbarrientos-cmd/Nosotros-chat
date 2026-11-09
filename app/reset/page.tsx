'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import Logo from '@/components/Logo';
import { supabaseBrowser } from '@/lib/supabase';

export default function ResetPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // El enlace del correo trae la sesión temporal en el # de la URL
  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const access = params.get('access_token');
        const refresh = params.get('refresh_token');
        if (access && refresh && params.get('type') === 'recovery') {
          const { error: err } = await sb.auth.setSession({ access_token: access, refresh_token: refresh });
          window.history.replaceState(null, '', '/reset');
          if (err) throw err;
          setReady(true);
          return;
        }
        const { data } = await sb.auth.getSession();
        if (data.session) setReady(true);
        else setInvalid(true);
      } catch {
        setInvalid(true);
      }
    })();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (pw.length < 8) return setError('Mínimo 8 caracteres');
    if (pw !== pw2) return setError('Las contraseñas no coinciden');
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser().auth.updateUser({ password: pw });
    if (err) {
      setError(err.message.includes('same') ? 'Usa una contraseña distinta a la anterior' : 'No se pudo cambiar. Pide otro enlace.');
      setBusy(false);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace('/'), 1200);
  };

  return (
    <main className="app center login">
      <div className="aurora" />
      <Logo size={84} />
      <h1>Nueva contraseña</h1>
      {invalid ? (
        <>
          <p className="login-sub">El enlace venció o ya se usó. Pide uno nuevo desde el login.</p>
          <button className="btn" onClick={() => router.replace('/login')}>
            Ir al login
          </button>
        </>
      ) : done ? (
        <p className="login-sub">Listo, contraseña cambiada ✨</p>
      ) : (
        <form onSubmit={submit} className="login-form">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nueva contraseña"
            value={pw}
            disabled={!ready}
            onChange={(e) => setPw(e.target.value)}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Repítela"
            value={pw2}
            disabled={!ready}
            onChange={(e) => setPw2(e.target.value)}
          />
          {error && <div className="login-error">{error}</div>}
          <button className="btn" disabled={busy || !ready}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </main>
  );
}
