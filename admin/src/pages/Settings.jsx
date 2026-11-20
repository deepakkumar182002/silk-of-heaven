import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import { Field, ImageUpload, Spinner, TagInput, useToast } from '../components/ui.jsx';

export default function Settings() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api('/api/admin/settings').then(setS).catch((e) => toast(e.message, 'err'));
  }, [toast]);

  const set = (patch) => setS((x) => ({ ...x, ...patch }));

  const save = async () => {
    if (!s.background) return toast('A background image is required', 'err');
    if (s.traits.length < 3) return toast('Add at least 3 personality traits', 'err');
    setBusy(true);
    try {
      const doc = await api('/api/admin/settings', {
        method: 'PUT',
        body: {
          background: s.background,
          backgroundPublicId: s.backgroundPublicId || '',
          traits: s.traits,
          defaultTraits: s.defaultTraits.filter((t) => s.traits.includes(t)),
        },
      });
      setS(doc);
      toast('Settings saved');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const toggleDefault = (t) => {
    const cur = s.defaultTraits.filter((x) => s.traits.includes(x));
    if (cur.includes(t)) set({ defaultTraits: cur.filter((x) => x !== t) });
    else set({ defaultTraits: [...cur, t].slice(-3) });
  };

  if (!s)
    return (
      <>
        <PageHead title="Site Settings" />
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      </>
    );

  return (
    <>
      <PageHead title="Site Settings" sub="Scene background and personality traits.">
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : 'Save settings'}
        </button>
      </PageHead>

      <div className="settings-grid">
        <section className="card pad stack">
          <h3>Scene background</h3>
          <ImageUpload
            folder="backgrounds"
            value={s.background}
            previewClass="landscape"
            onChange={({ url, publicId }) => set({ background: url, backgroundPublicId: publicId || '' })}
            hint="Wide landscape photo, about 2688 × 1520. Cool, neutral daylight works best behind the model."
          />
        </section>

        <section className="card pad stack">
          <h3>Personality traits</h3>
          <Field label="All traits" hint="Users pick up to 3 in the Personality tab; the radar is computed from the names.">
            <TagInput value={s.traits} onChange={(traits) => set({ traits })} placeholder="Add a trait" />
          </Field>
          <div className="field">
            <span className="field-label">Selected by default (up to 3)</span>
            <div className="chips">
              {s.traits.map((t) => (
                <button key={t} type="button" className={s.defaultTraits.includes(t) ? 'on' : ''} onClick={() => toggleDefault(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </section>

        <PasswordCard />
      </div>
    </>
  );
}

function PasswordCard() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return toast('New passwords do not match', 'err');
    setBusy(true);
    try {
      await api('/api/auth/password', { method: 'PUT', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      setF({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password changed');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card pad stack" onSubmit={submit}>
      <h3>Change admin password</h3>
      <Field label="Current password">
        <input type="password" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />
      </Field>
      <Field label="New password" hint="At least 8 characters">
        <input type="password" autoComplete="new-password" required minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
      </Field>
      <Field label="Confirm new password">
        <input type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
      </Field>
      <div>
        <button className="btn" disabled={busy}>
          {busy ? <Spinner /> : 'Update password'}
        </button>
      </div>
    </form>
  );
}
