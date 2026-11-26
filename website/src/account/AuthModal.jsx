import { useEffect, useRef, useState } from 'react';
import { AUTH, STORE, capi } from '../data.js';
import Icon from '../icons.jsx';
import Overlay from '../shop/Overlay.jsx';
import { googleConfigured, googleIdToken, useAccount } from './account.jsx';

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/**
 * Log in or sign up: phone + OTP, email + password (with "forgot password"), or Google.
 * A new account is created automatically the first time someone uses a phone number or Google.
 */
export default function AuthModal() {
  const acc = useAccount();
  const phoneOk = AUTH.phone;
  const [tab, setTab] = useState(phoneOk ? 'phone' : 'email');
  const [mode, setMode] = useState('login'); // email: login | signup | forgot
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '', otp: '' });
  const [otpSent, setOtpSent] = useState(null); // { phone, dev? }
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const otpRef = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const run = async (what, fn) => {
    setBusy(what);
    setError('');
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const sendOtp = () =>
    run('otp', async () => {
      const r = await capi('/api/customer/auth/otp', { method: 'POST', body: { phone: f.phone } });
      setOtpSent(r);
      setWait(45);
      if (r.dev) setInfo(r.dev);
      setTimeout(() => otpRef.current?.focus(), 50);
    });
  const verifyOtp = (e) => {
    e.preventDefault();
    run('verify', async () => acc.signIn(await capi('/api/customer/auth/otp/verify', { method: 'POST', body: { phone: f.phone, otp: f.otp, name: f.name } })));
  };
  const emailSubmit = (e) => {
    e.preventDefault();
    if (mode === 'forgot') {
      return run('email', async () => setInfo((await capi('/api/customer/auth/forgot', { method: 'POST', body: { email: f.email } })).message));
    }
    run('email', async () =>
      acc.signIn(
        await capi(`/api/customer/auth/${mode === 'signup' ? 'register' : 'login'}`, {
          method: 'POST',
          body: mode === 'signup' ? { name: f.name, email: f.email, password: f.password } : { email: f.email, password: f.password },
        })
      )
    );
  };
  const google = () =>
    run('google', async () => {
      let idToken;
      try {
        idToken = await googleIdToken();
      } catch (e) {
        if (/popup-closed|cancelled-popup/.test(e?.code || '')) return;
        throw new Error(/unauthorized-domain/.test(e?.code || '') ? 'Google login is not allowed on this domain yet (Firebase → Authentication → Settings → Authorized domains).' : 'Google login did not work. Please try again.');
      }
      acc.signIn(await capi('/api/customer/auth/google', { method: 'POST', body: { idToken } }));
    });

  const showGoogle = AUTH.google && googleConfigured();

  return (
    <Overlay title={mode === 'forgot' ? 'Reset your password' : `Log in to ${STORE.name}`} onClose={acc.closeAuth} label="Log in or sign up">
      <div className="auth">
        {acc.authOpen?.reason && <p className="auth-reason">{acc.authOpen.reason}</p>}

        {showGoogle && mode !== 'forgot' && (
          <>
            <button className="shop-btn block auth-google" onClick={google} disabled={!!busy}>
              {busy === 'google' ? <span className="fc-spin" /> : <GoogleMark />} Continue with Google
            </button>
            <div className="auth-or">
              <span>or</span>
            </div>
          </>
        )}

        {mode !== 'forgot' && phoneOk && (
          <div className="auth-tabs" role="tablist">
            {[
              ['phone', 'Mobile number'],
              ['email', 'Email'],
            ].map(([k, l]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? 'on' : ''}
                onClick={() => {
                  setTab(k);
                  setError('');
                  setInfo('');
                }}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        {tab === 'phone' && mode !== 'forgot' ? (
          <form className="co" onSubmit={otpSent ? verifyOtp : (e) => (e.preventDefault(), sendOtp())}>
            <label>
              <span>Mobile number</span>
              <div className="auth-phone">
                <em>+91</em>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  required
                  maxLength={14}
                  placeholder="98765 43210"
                  value={f.phone}
                  onChange={(e) => {
                    set('phone')(e);
                    setOtpSent(null);
                  }}
                />
              </div>
            </label>
            {otpSent ? (
              <>
                <label>
                  <span>
                    OTP sent to {otpSent.phone}
                    <button type="button" className="ps-link" onClick={sendOtp} disabled={wait > 0 || !!busy}>
                      {wait > 0 ? `Resend in ${wait}s` : 'Resend OTP'}
                    </button>
                  </span>
                  <input
                    ref={otpRef}
                    className="auth-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    placeholder="••••••"
                    value={f.otp}
                    onChange={(e) => setF((x) => ({ ...x, otp: e.target.value.replace(/\D/g, '') }))}
                  />
                </label>
                <label>
                  <span>
                    Your name <em>for new accounts</em>
                  </span>
                  <input autoComplete="name" value={f.name} onChange={set('name')} />
                </label>
                <button className="shop-btn primary block" disabled={!!busy || f.otp.length !== 6}>
                  {busy === 'verify' ? 'Checking…' : 'Verify & continue'}
                </button>
              </>
            ) : (
              <button className="shop-btn primary block" disabled={!!busy}>
                {busy === 'otp' ? 'Sending…' : 'Send OTP'}
              </button>
            )}
          </form>
        ) : (
          <form className="co" onSubmit={emailSubmit}>
            {mode === 'signup' && (
              <label>
                <span>Full name</span>
                <input required autoComplete="name" value={f.name} onChange={set('name')} />
              </label>
            )}
            <label>
              <span>Email</span>
              <input required type="email" autoComplete="email" value={f.email} onChange={set('email')} />
            </label>
            {mode !== 'forgot' && (
              <label>
                <span>
                  Password
                  {mode === 'login' && (
                    <button type="button" className="ps-link" onClick={() => (setMode('forgot'), setError(''))}>
                      Forgot password?
                    </button>
                  )}
                </span>
                <input
                  required
                  type="password"
                  minLength={mode === 'signup' ? 8 : 1}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={f.password}
                  onChange={set('password')}
                />
                {mode === 'signup' && <small className="shop-muted">At least 8 characters</small>}
              </label>
            )}
            <button className="shop-btn primary block" disabled={!!busy}>
              {busy === 'email' ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Log in'}
            </button>
            <p className="auth-switch">
              {mode === 'login' ? (
                <>
                  New here?{' '}
                  <button type="button" className="ps-link" onClick={() => (setMode('signup'), setError(''))}>
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  {mode === 'signup' ? 'Have an account?' : 'Remembered it?'}{' '}
                  <button type="button" className="ps-link" onClick={() => (setMode('login'), setError(''), setInfo(''))}>
                    Log in
                  </button>
                </>
              )}
            </p>
          </form>
        )}

        {error && (
          <p className="shop-err" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="auth-info" role="status">
            <Icon name="check" size={14} /> {info}
          </p>
        )}
        <p className="shop-muted small auth-legal">
          By continuing you agree to our{' '}
          <a href="/pages/terms" target="_blank" rel="noreferrer">
            Terms
          </a>{' '}
          and{' '}
          <a href="/pages/privacy" target="_blank" rel="noreferrer">
            Privacy policy
          </a>
          .
        </p>
      </div>
    </Overlay>
  );
}
