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
          shop: s.shop,
          store: s.store,
          pages: s.pages,
        },
      });
      setS(doc && (await api('/api/admin/settings')));
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
      <PageHead title="Site Settings" sub="Shop, tax and payments, business details, policy pages, scene background and personality traits.">
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : 'Save settings'}
        </button>
      </PageHead>

      <div className="settings-grid">
        <ShopCard s={s} set={set} />
        <StoreCard s={s} set={set} />
        <PagesCard s={s} set={set} />

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
        Each body model (women, men, kids) now has its own base image on the <a href="/bodies">Body models</a> page, and that one is used first. This
        image is only a fallback for the first body model when it has no base image of its own.
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

// ---------------------------------------------------------------------------
// Shop: GST, shipping, payments, returns
// ---------------------------------------------------------------------------
const SERVICES = [
  ['razorpay', 'Razorpay', 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET'],
  ['mail', 'Email', 'EMAIL_USER / EMAIL_PASS'],
  ['sms', 'SMS OTP', 'SMS_GH_API_KEY …'],
  ['google', 'Google login', 'FIREBASE_PROJECT_ID'],
];

function ShopCard({ s, set }) {
  const shop = s.shop || {};
  const put = (patch) => set({ shop: { ...shop, ...patch } });
  const num = (k) => ({ type: 'number', min: 0, value: shop[k] ?? '', onChange: (e) => put({ [k]: e.target.value === '' ? '' : Number(e.target.value) }) });
  const sample = 1999;
  const tax = shop.pricesIncludeTax ? (sample * shop.gstRate) / (100 + shop.gstRate) : (sample * shop.gstRate) / 100;
  return (
    <section className="card pad stack span2">
      <h3>Shop, tax &amp; payments</h3>
      <div className="svc-row">
        {SERVICES.map(([k, label, envs]) => (
          <span key={k} className={'svc' + (s.services?.[k] ? ' ok' : '')} title={s.services?.[k] ? 'Configured' : `Not set up: ${envs} in backend/.env`}>
            <Icon name={s.services?.[k] ? 'check' : 'x'} size={13} /> {label}
          </span>
        ))}
      </div>
      <div className="row3">
        <Field label="GST rate (%)" hint="Clothing: 5% up to ₹2,500 per piece, 18% above (check with your CA)">
          <input {...num('gstRate')} max="40" step="0.5" />
        </Field>
        <Field label="Shipping fee (₹)">
          <input {...num('shippingFee')} />
        </Field>
        <Field label="Free shipping from (₹)" hint="0 = never free">
          <input {...num('freeShippingOver')} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={!!shop.pricesIncludeTax} onChange={(e) => put({ pricesIncludeTax: e.target.checked })} />
        Prices already include GST (MRP style). Example: on {'\u20b9'}{sample}, GST is {'\u20b9'}
        {Math.round(tax * 100) / 100} {shop.pricesIncludeTax ? 'inside the price' : 'added at checkout'}.
      </label>
      <div className="row3">
        <label className="check">
          <input type="checkbox" checked={!!shop.onlinePayments} onChange={(e) => put({ onlinePayments: e.target.checked })} />
          Online payments (Razorpay)
        </label>
        <label className="check">
          <input type="checkbox" checked={!!shop.codEnabled} onChange={(e) => put({ codEnabled: e.target.checked })} />
          Cash on delivery
        </label>
        <Field label="COD fee (₹)">
          <input {...num('codFee')} disabled={!shop.codEnabled} />
        </Field>
      </div>
      <div className="row3">
        <Field label="Return window (days)" hint="Customers can ask for a return this long after delivery">
          <input {...num('returnWindowDays')} max="90" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={!!shop.reviewsAutoApprove} onChange={(e) => put({ reviewsAutoApprove: e.target.checked })} />
          Publish reviews without approval
        </label>
      </div>
    </section>
  );
}

function StoreCard({ s, set }) {
  const store = s.store || {};
  const put = (k) => (e) => set({ store: { ...store, [k]: e.target.value } });
  return (
    <section className="card pad stack">
      <h3>Business details</h3>
      <small className="hint">Printed on invoices and shown in the website footer and Contact page.</small>
      <Field label="Legal / business name">
        <input value={store.legalName || ''} onChange={put('legalName')} placeholder="e.g. Silk of Heaven Fashion LLP" />
      </Field>
      <Field label="GSTIN" hint="15 characters, on every tax invoice">
        <input value={store.gstin || ''} onChange={put('gstin')} maxLength={15} style={{ textTransform: 'uppercase' }} />
      </Field>
      <Field label="Address">
        <textarea rows={2} value={store.address || ''} onChange={put('address')} />
      </Field>
      <Field label="Phone">
        <input value={store.phone || ''} onChange={put('phone')} />
      </Field>
      <div className="row2">
        <Field label="Support email">
          <input type="email" value={store.email || ''} onChange={put('email')} />
        </Field>
        <Field label="Instagram">
          <input value={store.instagram || ''} onChange={put('instagram')} placeholder="@yourbrand" />
        </Field>
      </div>
    </section>
  );
}

const PAGE_LIST = [
  ['about', 'About us'],
  ['contact', 'Contact us'],
  ['shipping', 'Shipping policy'],
  ['returns', 'Returns & refunds'],
  ['privacy', 'Privacy policy'],
  ['terms', 'Terms & conditions'],
];

function PagesCard({ s, set }) {
  const [key, setKey] = useState('about');
  const pages = s.pages || {};
  const value = pages[key] || '';
  const def = s.defaultPages?.[key] || '';
  return (
    <section className="card pad stack">
      <h3>Policy &amp; info pages</h3>
      <small className="hint">
        Shown on the website footer (needed for Razorpay approval). Empty = the default text below, filled with your business details. Format: blank line = new
        paragraph, "## " = heading, "- " = list item.
      </small>
      <div className="chips">
        {PAGE_LIST.map(([k, l]) => (
          <button key={k} type="button" className={key === k ? 'on' : ''} onClick={() => setKey(k)}>
            {l}
            {pages[k] ? ' ✎' : ''}
          </button>
        ))}
      </div>
      <textarea className="page-text" rows={14} value={value} placeholder={def} onChange={(e) => set({ pages: { ...pages, [key]: e.target.value } })} />
      <div className="row-actions">
        <button type="button" className="btn sm" onClick={() => set({ pages: { ...pages, [key]: def } })} disabled={value === def}>
          Start from the default text
        </button>
        {value && (
          <button type="button" className="btn sm" onClick={() => set({ pages: { ...pages, [key]: '' } })}>
            Use the default again
          </button>
        )}
      </div>
    </section>
  );
}
