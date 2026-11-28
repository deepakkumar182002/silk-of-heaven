import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import Icon from '../components/icons.jsx';
import { Spinner } from '../components/ui.jsx';

function PasswordInput({ value, onChange, autoComplete, minLength }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw">
      <input type={show ? 'text' : 'password'} autoComplete={autoComplete} required minLength={minLength} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </span>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // login | forgot | delivery
  if (mode === 'delivery') return <DeliveryLogin onBack={() => setMode('login')} />;
  return <StaffLogin login={login} mode={mode} setMode={setMode} />;
}

function StaffLogin({ login, mode, setMode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'forgot') setInfo((await api('/api/auth/forgot', { method: 'POST', body: { email } })).message);
      else await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand lg">
          <b>Silk of Heaven</b>
          <span>Admin</span>
        </div>
        <p className="muted">{mode === 'forgot' ? 'Enter your staff email. We send a link to choose a new password.' : 'Sign in to manage the store.'}</p>
        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === 'login' && (
          <label className="field">
            <span className="field-label">Password</span>
            <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
          </label>
        )}
        {error && <div className="alert">{error}</div>}
        {info && <div className="alert ok">{info}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? <Spinner /> : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'login' ? 'forgot' : 'login');
            setError('');
            setInfo('');
          }}
        >
          {mode === 'login' ? 'Forgot password?' : 'Back to sign in'}
        </button>
        {mode === 'login' && (
          <button type="button" className="btn block dl-login-switch" onClick={() => setMode('delivery')}>
            <Icon name="phone" size={17} /> Delivery partner? Log in with your mobile
          </button>
        )}
      </form>
    </div>
  );
}

/** Delivery partners: mobile number (verified by the admin) + OTP by SMS. */
function DeliveryLogin({ onBack }) {
  const { acceptSession } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!sent) {
        const r = await api('/api/auth/delivery/otp', { method: 'POST', body: { phone } });
        setSent(true);
        setInfo(r.dev || `OTP sent to +91 ${phone}`);
      } else {
        acceptSession(await api('/api/auth/delivery/verify', { method: 'POST', body: { phone, otp } }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand lg">
          <b>Silk of Heaven</b>
          <span>Delivery</span>
        </div>
        <p className="muted">Log in with the mobile number the store registered for you.</p>
        <label className="field">
          <span className="field-label">Mobile number</span>
          <input inputMode="numeric" autoComplete="tel" maxLength={10} required disabled={sent} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="10 digits" />
        </label>
        {sent && (
          <label className="field">
            <span className="field-label">OTP</span>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus />
          </label>
        )}
        {error && <div className="alert">{error}</div>}
        {info && !error && <div className="alert ok">{info}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? <Spinner /> : sent ? 'Log in' : 'Send OTP'}
        </button>
        {sent && (
          <button type="button" className="link-btn" onClick={() => (setSent(false), setOtp(''), setInfo(''))}>
            Change number / send again
          </button>
        )}
        <button type="button" className="link-btn" onClick={onBack}>
          Staff login with email
        </button>
      </form>
    </div>
  );
}

/** /reset-password?token=… from the email */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return setError('The two passwords are different');
    setBusy(true);
    setError('');
    try {
      acceptSession(await api('/api/auth/reset', { method: 'POST', body: { token, password: pw } }));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand lg">
          <b>Silk of Heaven</b>
          <span>Admin</span>
        </div>
        <p className="muted">Choose a new password (at least 8 characters).</p>
        {!token && <div className="alert">This link is incomplete. Ask for a new one from the sign-in page.</div>}
        <label className="field">
          <span className="field-label">New password</span>
          <PasswordInput value={pw} onChange={setPw} autoComplete="new-password" minLength={8} />
        </label>
        <label className="field">
          <span className="field-label">Repeat new password</span>
          <PasswordInput value={pw2} onChange={setPw2} autoComplete="new-password" minLength={8} />
        </label>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary block" disabled={busy || !token}>
          {busy ? <Spinner /> : 'Save and sign in'}
        </button>
        <a className="link-btn" href="/login">
          Back to sign in
        </a>
      </form>
    </div>
  );
}
