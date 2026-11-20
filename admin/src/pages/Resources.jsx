import { useEffect, useState } from 'react';
import { api, faceCrop, imgUrl } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon, { CATEGORY_ICONS } from '../components/icons.jsx';
import { Empty, Field, Modal, Spinner, useToast } from '../components/ui.jsx';

/**
 * Generic list + modal editor for simple collections.
 * config: { title, sub, endpoint, singular, icon, empty, fields: [{ name, label, type, ... }], render(item, ctx) }
 */
function ResourcePage({ config, ctx = {} }) {
  const { title, sub, endpoint, singular, icon, fields, render, blank, validate } = config;
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    api(endpoint).then(setItems).catch((e) => toast(e.message, 'err'));
  }, [endpoint, toast]);

  const open = (item) => {
    setError('');
    setEditing(item ? { ...item } : { ...blank });
  };

  const save = async () => {
    const msg = validate?.(editing);
    if (msg) return setError(msg);
    setBusy(true);
    setError('');
    try {
      const body = Object.fromEntries(fields.map((f) => [f.name, f.type === 'number' ? Number(editing[f.name]) : editing[f.name]]));
      const isNew = !editing._id;
      const doc = await api(isNew ? endpoint : `${endpoint}/${editing._id}`, { method: isNew ? 'POST' : 'PUT', body });
      setItems((s) => (isNew ? [...s, doc] : s.map((x) => (x._id === doc._id ? doc : x))));
      setEditing(null);
      toast(isNew ? `${singular} added` : `${singular} saved`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (items.length <= 1) return toast(`Keep at least one ${singular.toLowerCase()}`, 'err');
    if (!window.confirm(`Delete this ${singular.toLowerCase()}?`)) return;
    try {
      await api(`${endpoint}/${item._id}`, { method: 'DELETE' });
      setItems((s) => s.filter((x) => x._id !== item._id));
      toast(`${singular} deleted`);
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const move = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
    try {
      setItems(await api(`${endpoint}/reorder`, { method: 'PUT', body: { ids: next.map((x) => x._id) } }));
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  return (
    <>
      <PageHead title={title} sub={sub}>
        <button className="btn primary" onClick={() => open(null)}>
          <Icon name="plus" size={18} /> Add {singular.toLowerCase()}
        </button>
      </PageHead>

      {!items ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : items.length === 0 ? (
        <Empty icon={icon} title={`No ${title.toLowerCase()} yet`} />
      ) : (
        <div className="list card">
          {items.map((item, i) => (
            <div key={item._id} className="list-row">
              <div className="list-main">{render(item, ctx)}</div>
              <div className="list-actions">
                <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <Icon name="up" size={18} />
                </button>
                <button className="icon-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <Icon name="down" size={18} />
                </button>
                <button className="btn sm" onClick={() => open(item)}>
                  <Icon name="pencil" size={15} /> Edit
                </button>
                <button className="icon-btn danger" onClick={() => remove(item)} aria-label="Delete">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing._id ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}
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
            {fields.map((f) => (
              <FieldInput key={f.name} f={f} value={editing[f.name]} onChange={(v) => setEditing((e) => ({ ...e, [f.name]: v }))} />
            ))}
            {config.preview && config.preview(editing, ctx)}
          </div>
        </Modal>
      )}
    </>
  );
}

function FieldInput({ f, value, onChange }) {
  if (f.type === 'icon') {
    return (
      <Field label={f.label} hint={f.hint}>
        <div className="icon-pick">
          {CATEGORY_ICONS.map((n) => (
            <button type="button" key={n} className={value === n ? 'on' : ''} onClick={() => onChange(n)} aria-label={n} title={n}>
              <Icon name={n} size={22} />
            </button>
          ))}
        </div>
      </Field>
    );
  }
  if (f.type === 'textarea') {
    return (
      <Field label={f.label} hint={f.hint}>
        <textarea rows={3} value={value ?? ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }
  return (
    <Field label={f.label} hint={f.hint}>
      <input
        type={f.type || 'text'}
        value={value ?? ''}
        placeholder={f.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/* ---------------- Characters ---------------- */
export function Characters() {
  return (
    <ResourcePage
      config={{
        title: 'Characters',
        singular: 'Character',
        icon: 'users',
        sub: 'Identities the profile card cycles through with Shuffle and Re-seed. The first one is shown on load.',
        endpoint: '/api/admin/identities',
        blank: { name: '', age: 22, city: 'Seoul, KR', temp: 14 },
        validate: (e) => (!e.name?.trim() ? 'Name is required' : !(Number(e.age) > 0) ? 'Age must be a positive number' : ''),
        fields: [
          { name: 'name', label: 'Name', placeholder: 'e.g. Han Seo-yeon' },
          { name: 'age', label: 'Age', type: 'number' },
          { name: 'city', label: 'City', placeholder: 'e.g. Seoul, KR' },
          { name: 'temp', label: 'Temperature (°C)', type: 'number', hint: 'Shown with the weather icon' },
        ],
        render: (c) => (
          <>
            <span className="avatar-letter">{c.name.slice(0, 1)}</span>
            <div>
              <b>{c.name}</b>
              <small>
                {c.age} · {c.city} · {c.temp}°C
              </small>
            </div>
          </>
        ),
      }}
    />
  );
}

/* ---------------- Categories ---------------- */
export function Categories() {
  return (
    <ResourcePage
      config={{
        title: 'Categories',
        singular: 'Category',
        icon: 'grid',
        sub: 'Outfit filter chips. "All" is always shown first automatically.',
        endpoint: '/api/admin/categories',
        blank: { key: '', label: '', icon: 'tee' },
        validate: (e) =>
          !e.label?.trim()
            ? 'Label is required'
            : !/^[a-z0-9-]+$/.test(e.key || '')
            ? 'Key must be lowercase letters, numbers or dashes'
            : e.key === 'all'
            ? '"all" is reserved'
            : '',
        fields: [
          { name: 'label', label: 'Label', placeholder: 'e.g. Swimwear' },
          { name: 'key', label: 'Key', placeholder: 'e.g. swimwear', hint: 'Looks reference this key. Changing it un-assigns existing looks.' },
          { name: 'icon', label: 'Icon', type: 'icon' },
        ],
        render: (c) => (
          <>
            <span className="icon-tile">
              <Icon name={c.icon} size={22} />
            </span>
            <div>
              <b>{c.label}</b>
              <small>key: {c.key}</small>
            </div>
          </>
        ),
      }}
    />
  );
}

/* ---------------- Filters ---------------- */
const SAMPLE = imgUrl(
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20261112_034542_a6430ecf-9862-412c-8ef6-5745115bd78c.png',
  1000
);

function FilterSwatch({ f, size = 56 }) {
  return (
    <span className="filter-swatch" style={{ width: size, height: size }}>
      <span style={{ ...faceCrop(SAMPLE, size), filter: f.filter || 'none' }} />
      <i style={{ background: f.tint || 'transparent' }} />
    </span>
  );
}

export function Filters() {
  return (
    <ResourcePage
      config={{
        title: 'Filters',
        singular: 'Filter',
        icon: 'filter',
        sub: 'Colour grades applied to the whole scene. The first filter is the default; Randomize picks from the first four.',
        endpoint: '/api/admin/filters',
        blank: { name: '', filter: 'none', tint: 'transparent' },
        validate: (e) => (!e.name?.trim() ? 'Name is required' : ''),
        fields: [
          { name: 'name', label: 'Name', placeholder: 'e.g. Golden Hour' },
          {
            name: 'filter',
            label: 'CSS filter',
            type: 'textarea',
            placeholder: 'saturate(1.1) brightness(1.02)',
            hint: 'Any CSS filter value, or "none"',
          },
          {
            name: 'tint',
            label: 'Soft-light tint',
            type: 'textarea',
            placeholder: 'linear-gradient(180deg, rgba(255,180,90,.6), rgba(255,140,80,.4))',
            hint: 'Any CSS background, or "transparent"',
          },
        ],
        preview: (f) => (
          <div className="filter-preview">
            <FilterSwatch f={f} size={120} />
            <small>Live preview</small>
          </div>
        ),
        render: (f) => (
          <>
            <FilterSwatch f={f} />
            <div>
              <b>{f.name}</b>
              <small className="mono">{f.filter}</small>
            </div>
          </>
        ),
      }}
    />
  );
}
