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

  function onGoogle() {
    setError(null);
    setBusy(true);
    // SITE_URL already includes the Vite base path (e.g. …/pet-village).
    // Pass "/" so Convex does not append BASE_URL again and 404.
    void signIn('google', { redirectTo: '/' }).catch((err: unknown) => {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    });
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="brand">Pet Village</p>
        <h1>{mode === 'signIn' ? 'Sign in' : 'Create account'}</h1>
        <p className="lede">
          Cloud saves keep your pet safe across devices. Or play as a guest with local saves only.
        </p>

        <button type="button" className="btn google" onClick={onGoogle} disabled={busy}>
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="auth-divider" role="separator">
          <span>or</span>
        </div>

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
            {busy ? '…' : mode === 'signIn' ? 'Sign in with email' : 'Sign up with email'}
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

function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
      />
    </svg>
  );
}
