import { createRoot } from 'react-dom/client';
import { createElement, useEffect, useState } from 'react';
import './styles.css';
import { api } from './lib/api.js';
import { SlotPicker } from './components/SlotPicker.jsx';
import { ConsultantAvailability } from './components/ConsultantAvailability.jsx';

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function loadAccount() {
      try {
        const data = await api('/api/auth/me', { signal: controller.signal });
        setUser(data.user);
      } catch (error) {
        if (error.name !== 'AbortError' && error.status !== 401)
          setError(
            'Could not load your account. Check your connection and reload.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadAccount();
    return () => controller.abort();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api(`/api/auth/${view}`, {
        method: 'POST',
        body: values,
      });
      form.reset();
      if (view === 'register') {
        setView('login');
        setMessage('Your account is ready. Sign in to continue.');
      } else {
        setUser(data.user);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/logout', { method: 'POST', body: {} });
      setUser(null);
      setView('login');
      setMessage('You have been signed out.');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <a href="/" aria-label="SlotSure home">
          SlotSure<span>✳</span>
        </a>
        <span>Consultations, made simple</span>
      </header>
      <div className="account-layout">
        <section className="hero">
          <p className="eyebrow">YOUR TIME, WELL SPENT</p>
          <h1>
            Book your time.
            <br />
            <span>
              No clashes,
              <br />
              no confusion.
            </span>
          </h1>
          <p className="intro">
            A simpler way for independent consultants and their customers to
            make time for what matters.
          </p>
        </section>
        <section
          className="account-card"
          aria-labelledby="account-title"
          aria-busy={loading || busy}
        >
          {loading ? (
            <p role="status">Loading your account…</p>
          ) : user ? (
            <>
              <p className="eyebrow">YOU’RE SIGNED IN</p>
              <h2 id="account-title">Welcome, {user.name}.</h2>
              <p className="account-email">{user.email}</p>
              <span className="role-badge">
                {user.role === 'consultant' ? 'Consultant' : 'Customer'} account
              </span>
              <p className="note">
                {user.role === 'consultant'
                  ? 'Manage your working hours and individual time blocks below.'
                  : 'Explore available consultation times below.'}
              </p>
              <button type="button" onClick={logout} disabled={busy}>
                {busy ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          ) : (
            <>
              <p className="eyebrow">MAKE TIME FOR WHAT MATTERS</p>
              <h2 id="account-title">
                {view === 'register' ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="form-intro">
                {view === 'register'
                  ? 'A little less back-and-forth starts here.'
                  : 'Sign in to your SlotSure account.'}
              </p>
              <form key={view} onSubmit={submit}>
                {view === 'register' && (
                  <label>
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={100}
                      disabled={busy}
                    />
                  </label>
                )}
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    disabled={busy}
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      view === 'register' ? 'new-password' : 'current-password'
                    }
                    required
                    minLength={view === 'register' ? 12 : 1}
                    maxLength={128}
                    disabled={busy}
                    aria-describedby={
                      view === 'register' ? 'password-help' : undefined
                    }
                  />
                </label>
                {view === 'register' && (
                  <p className="note" id="password-help">
                    Use 12–128 characters. A long, unique passphrase works well.
                  </p>
                )}
                <button type="submit" disabled={busy}>
                  {busy
                    ? 'Please wait…'
                    : view === 'register'
                      ? 'Create account'
                      : 'Sign in'}
                </button>
              </form>
              <p className="switch-view">
                {view === 'register'
                  ? 'Already have an account?'
                  : 'New to SlotSure?'}{' '}
                <button
                  className="text-button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setView(view === 'register' ? 'login' : 'register');
                    setMessage('');
                    setError('');
                  }}
                >
                  {view === 'register' ? 'Sign in' : 'Create an account'}
                </button>
              </p>
            </>
          )}
          {message && (
            <p className="feedback" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      {!loading &&
        (user?.role === 'consultant' ? (
          <ConsultantAvailability key={user.id} />
        ) : (
          <SlotPicker key={user?.id ?? 'visitor'} />
        ))}
      <footer>SlotSure / Built around your time.</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(createElement(App));
