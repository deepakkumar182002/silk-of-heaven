import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Field, Modal, Spinner, useToast } from '../components/ui.jsx';

const blank = { name: '', email: '', password: '', role: 'tailor' };

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

  const open = (m) => {
    setError('');
    setEditing(m ? { ...m, password: '' } : { ...blank });
  };

  const save = async () => {
    setError('');
    if (!editing.name.trim()) return setError('Name is required');
    if (!editing._id && !editing.email.trim()) return setError('Email is required');
    if ((!editing._id || editing.password) && editing.password.length < 8) return setError('Password must be at least 8 characters');
    setBusy(true);
    try {
      const isNew = !editing._id;
      const body = isNew
        ? { name: editing.name, email: editing.email, password: editing.password, role: editing.role }
        : { name: editing.name, role: editing.role, ...(editing.password ? { password: editing.password } : {}) };
      const doc = await api(isNew ? '/api/admin/team' : `/api/admin/team/${editing._id}`, { method: isNew ? 'POST' : 'PUT', body });
      setStaff((s) => (isNew ? [...s, doc] : s.map((x) => (x._id === doc._id ? doc : x))));
      setEditing(null);
      toast(isNew ? 'Team member added' : 'Saved');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
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

  return (
    <>
      <PageHead title="Team" sub="Tailors can sign in to see orders, contact customers and update stitching progress. They cannot edit the catalogue.">
        <button className="btn primary" onClick={() => open(null)}>
          <Icon name="plus" size={18} /> Add tailor
        </button>
      </PageHead>

      {!staff ? (
        <div className="center-pad"><Spinner size={26} /></div>
      ) : staff.length === 0 ? (
        <Empty icon="users" title="No team members" />
      ) : (
        <div className="list card">
          {staff.map((m) => (
            <div key={m._id} className="list-row">
              <div className="list-main">
                <span className="avatar-letter">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
                <div>
                  <b>
                    {m.name} {m._id === me?._id && <small className="muted">(you)</small>}
                  </b>
                  <small>{m.email}</small>
                </div>
                <span className={'pill-s role-' + m.role}>{m.role}</span>
              </div>
              <div className="list-actions">
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

      {editing && (
        <Modal
          title={editing._id ? 'Edit team member' : 'Add tailor'}
          onClose={() => setEditing(null)}
          footer={
            <>
              {error && <span className="err grow">{error}</span>}
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Save'}</button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Name">
              <input value={editing.name} onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))} placeholder="e.g. Meera" />
            </Field>
            <Field label="Email (used to sign in)">
              <input type="email" value={editing.email} disabled={!!editing._id} onChange={(e) => setEditing((x) => ({ ...x, email: e.target.value }))} />
            </Field>
            <Field label={editing._id ? 'New password' : 'Password'} hint={editing._id ? 'Leave empty to keep the current password' : 'At least 8 characters. Share it with them securely.'}>
              <input type="password" autoComplete="new-password" value={editing.password} onChange={(e) => setEditing((x) => ({ ...x, password: e.target.value }))} />
            </Field>
            <Field label="Role">
              <select value={editing.role} disabled={editing._id === me?._id} onChange={(e) => setEditing((x) => ({ ...x, role: e.target.value }))}>
                <option value="tailor">Tailor — orders only</option>
                <option value="admin">Admin — full access</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
