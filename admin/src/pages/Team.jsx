import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Field, Modal, Spinner, useToast } from '../components/ui.jsx';

const blank = { name: '', email: '', password: '', role: 'tailor', phone: '', phoneVerified: true, commission: '' };
const ROLE_LABEL = { admin: 'Admin', tailor: 'Tailor', delivery: 'Delivery partner' };

/**
 * Staff accounts. Admins and tailors sign in with email + password; delivery partners sign in with
 * their mobile number + OTP, only after the admin has verified the number here.
 */
export default function Team() {
  const { admin: me } = useAuth();
  const [staff, setStaff] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    api('/api/admin/team').then(setStaff).catch((e) => toast(e.message, 'err'));
  }, [toast]);

  const open = (m, role) => {
    setError('');
    setEditing(m ? { ...blank, ...m, password: '', commission: m.commission ?? '' } : { ...blank, role: role || 'tailor' });
  };
  const isDelivery = editing?.role === 'delivery';

  const save = async () => {
    setError('');
    if (!editing.name.trim()) return setError('Name is required');
    const isNew = !editing._id;
    if (isDelivery) {
      if (!/^\d{10}$/.test(String(editing.phone).replace(/\D/g, '').slice(-10))) return setError('Enter a 10-digit mobile number');
    } else {
      if (isNew && !editing.email.trim()) return setError('Email is required');
      if ((isNew || editing.password) && editing.password.length < 8) return setError('Password must be at least 8 characters');
    }
    setBusy(true);
    try {
      const body = isDelivery
        ? { name: editing.name, role: 'delivery', phone: editing.phone, phoneVerified: !!editing.phoneVerified, commission: editing.commission === '' ? null : Number(editing.commission) }
        : isNew
          ? { name: editing.name, email: editing.email, password: editing.password, role: editing.role }
          : { name: editing.name, role: editing.role, ...(editing.password ? { password: editing.password } : {}) };
      const doc = await api(isNew ? '/api/admin/team' : `/api/admin/team/${editing._id}`, { method: isNew ? 'POST' : 'PUT', body });
      setStaff((s) => (isNew ? [...s, doc] : s.map((x) => (x._id === doc._id ? doc : x))));
      setEditing(null);
      toast(isNew ? 'Added' : 'Saved');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (m, body, msg) => {
    try {
      const doc = await api(`/api/admin/team/${m._id}`, { method: 'PUT', body });
      setStaff((s) => s.map((x) => (x._id === doc._id ? doc : x)));
      toast(msg);
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.name}? They will no longer be able to sign in.`)) return;
    try {
      await api(`/api/admin/team/${m._id}`, { method: 'DELETE' });
      setStaff((s) => s.filter((x) => x._id !== m._id));
      toast('Removed');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const groups = staff ? [['Staff', staff.filter((m) => m.role !== 'delivery')], ['Delivery partners', staff.filter((m) => m.role === 'delivery')]] : [];

  return (
    <>
      <PageHead title="Team" sub="Tailors see orders and stitching. Delivery partners sign in with their verified mobile number and only see the deliveries given to them.">
        <button className="btn" onClick={() => open(null, 'delivery')}>
          <Icon name="plus" size={18} /> Add delivery partner
        </button>
        <button className="btn primary" onClick={() => open(null, 'tailor')}>
          <Icon name="plus" size={18} /> Add tailor / admin
        </button>
      </PageHead>

      {!staff ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : staff.length === 0 ? (
        <Empty icon="users" title="No team members" />
      ) : (
        groups.map(([title, list]) => (
          <section key={title} className="team-group">
            <h3 className="nt-h">
              {title} <small className="muted">{list.length}</small>
            </h3>
            {!list.length ? (
              <p className="muted small">{title === 'Delivery partners' ? 'Add your delivery boys here. Verify their number so they can log in with an OTP.' : 'Nobody yet.'}</p>
            ) : (
              <div className="list card">
                {list.map((m) => (
                  <div key={m._id} className={'list-row' + (m.active === false ? ' promo-off' : '')}>
                    <div className="list-main">
                      <span className="avatar-letter">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
                      <div>
                        <b>
                          {m.name} {m._id === me?._id && <small className="muted">(you)</small>}
                        </b>
                        <small>
                          {m.role === 'delivery' ? `+91 ${m.phone}${m.commission != null ? ` · ₹${m.commission} per delivery` : ''}` : m.email}
                        </small>
                      </div>
                      <span className={'pill-s role-' + m.role}>{ROLE_LABEL[m.role]}</span>
                      {m.role === 'delivery' && (
                        <span className={'status-pill ' + (m.phoneVerified ? 'ok' : 'warn')}>{m.phoneVerified ? 'Number verified' : 'Not verified'}</span>
                      )}
                      {m.active === false && <span className="status-pill">Switched off</span>}
                    </div>
                    <div className="list-actions">
                      {m.role === 'delivery' && !m.phoneVerified && (
                        <button className="btn sm primary" onClick={() => patch(m, { phoneVerified: true }, 'Number verified: they can log in now')}>
                          Verify number
                        </button>
                      )}
                      {m._id !== me?._id && (
                        <label className="switch" title={m.active === false ? 'Switch on' : 'Switch off'}>
                          <input type="checkbox" checked={m.active !== false} onChange={(e) => patch(m, { active: e.target.checked }, e.target.checked ? 'Account on' : 'Account off')} />
                          <span />
                        </label>
                      )}
                      <button className="btn sm" onClick={() => open(m)}>
                        <Icon name="pencil" size={15} /> Edit
                      </button>
                      <button className="icon-btn danger" onClick={() => remove(m)} disabled={m._id === me?._id} aria-label="Remove">
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {editing && (
        <Modal
          title={editing._id ? `Edit ${ROLE_LABEL[editing.role].toLowerCase()}` : isDelivery ? 'Add delivery partner' : 'Add tailor / admin'}
          onClose={() => setEditing(null)}
          footer={
            <>
              {error && <span className="err grow">{error}</span>}
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={save} disabled={busy}>
                {busy ? <Spinner /> : 'Save'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Name">
              <input value={editing.name} onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))} placeholder={isDelivery ? 'e.g. Ravi Kumar' : 'e.g. Meera'} />
            </Field>
            {isDelivery ? (
              <>
                <Field label="Mobile number (used to log in with an OTP)" hint="Changing the number needs a new verification">
                  <input inputMode="numeric" maxLength={10} value={editing.phone} onChange={(e) => setEditing((x) => ({ ...x, phone: e.target.value.replace(/\D/g, '') }))} placeholder="10 digits" />
                </Field>
                <label className="check">
                  <input type="checkbox" checked={!!editing.phoneVerified} onChange={(e) => setEditing((x) => ({ ...x, phoneVerified: e.target.checked }))} /> I have checked this number belongs to them (verified)
                </label>
                <Field label="Earns per delivered order (₹)" hint="Empty = the store default from Site Settings">
                  <input type="number" min="0" value={editing.commission} onChange={(e) => setEditing((x) => ({ ...x, commission: e.target.value }))} placeholder="Store default" />
                </Field>
              </>
            ) : (
              <>
                <Field label="Email (used to sign in)">
                  <input type="email" value={editing.email} disabled={!!editing._id} onChange={(e) => setEditing((x) => ({ ...x, email: e.target.value }))} />
                </Field>
                <Field label={editing._id ? 'New password' : 'Password'} hint={editing._id ? 'Leave empty to keep the current password' : 'At least 8 characters. Share it with them securely.'}>
                  <input type="password" autoComplete="new-password" value={editing.password} onChange={(e) => setEditing((x) => ({ ...x, password: e.target.value }))} />
                </Field>
                <Field label="Role">
                  <select value={editing.role} disabled={editing._id === me?._id} onChange={(e) => setEditing((x) => ({ ...x, role: e.target.value }))}>
                    <option value="tailor">Tailor — orders and stitching only</option>
                    <option value="admin">Admin — full access</option>
                  </select>
                </Field>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
