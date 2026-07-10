import { FormEvent, useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';

type Mode = 'signIn' | 'signUp';

export function AuthPanel({ onGuest }: { onGuest: () => void }) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn('password', {
        email,
        password,
        flow: mode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="brand">Pet Village</p>
        <h1>{mode === 'signIn' ? 'Sign in' : 'Create account'}</h1>
        <p className="lede">
          Cloud saves keep Mochi safe across devices. Or play as a guest with local saves only.
        </p>

        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '…' : mode === 'signIn' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <button
          type="button"
          className="linkish"
          onClick={() => {
            setError(null);
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          }}
        >
          {mode === 'signIn' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>

        <button type="button" className="btn ghost" onClick={onGuest}>
          Continue as guest
        </button>
      </div>
    </div>
  );
}
