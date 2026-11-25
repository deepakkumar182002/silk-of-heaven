import { useEffect, useState } from 'react';
import { api, imgUrl } from '../api.js';
import { aiBase, aiStatus } from '../ai.js';
import Icon from '../components/icons.jsx';
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
          baseModel: s.baseModel || '',
          baseModelPublicId: s.baseModelPublicId || '',
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

        <BaseModelCard s={s} set={set} />

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

/** The model every uploaded dress is fitted on, and whose face the website swaps. */
function BaseModelCard({ s, set }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    aiStatus()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }));
  }, []);
  const from = s.baseModel || status?.base?.url;

  const makePlain = async () => {
    setBusy(true);
    try {
      const r = await aiBase(from);
      set({ baseModel: r.url, baseModelPublicId: r.publicId });
      toast('Plain base model created. Save settings to use it.');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card pad stack">
      <h3>AI base model</h3>
      <small className="hint">
        Every dress uploaded under Looks is put on this model, in this exact pose, so all looks line up. Best: the model in plain fitted basics, barefoot, no
        accessories. Empty = the first look is used.
      </small>
      <div className="base-row">
        <ImageUpload
          folder="base"
          value={s.baseModel}
          previewClass="portrait"
          onChange={({ url, publicId }) => set({ baseModel: url, baseModelPublicId: publicId || '' })}
          hint="Transparent PNG, 1360 x 2048, same pose and position as the looks."
        />
        {!s.baseModel && status?.base?.url && (
          <div className="base-now">
            <img src={imgUrl(status.base.url, 240)} alt="" />
            <small>Now using: {status.base.lookName || 'first look'}</small>
          </div>
        )}
      </div>
      <button type="button" className="btn" onClick={makePlain} disabled={busy || !from || !status?.enabled}>
        {busy ? <Spinner /> : <Icon name="details" size={16} />} Create plain base with AI
      </button>
      {status && !status.enabled && (
        <div className="alert warn">
          AI is off: add <code>GEMINI_API_KEY</code> to <code>backend/.env</code>.
        </div>
      )}
    </section>
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
