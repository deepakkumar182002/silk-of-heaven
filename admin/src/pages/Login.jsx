import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import Icon from '../components/icons.jsx';
import { Spinner } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
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
          <b>VELL</b>
          <span>Admin</span>
        </div>
        <p className="muted">Sign in to manage looks, characters and styling.</p>
        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <span className="pw">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
              <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </span>
        </label>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? <Spinner /> : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
