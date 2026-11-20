import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, faceCrop, imgUrl } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Field, ImageUpload, Modal, Spinner, TagInput, useToast } from '../components/ui.jsx';

const GROUPS = [
  ['tops', 'Tops'],
  ['bottoms', 'Bottoms'],
  ['full', 'Full body'],
  ['shoes', 'Shoes'],
  ['acc', 'Accessories'],
];
const STD = ['XS', 'S', 'M', 'L', 'XL'];
const newPiece = (group) => ({
  name: '',
  color: '',
  price: 0,
  description: '',
  fabric: '',
  care: '',
  sizes: group === 'shoes' ? ['36', '37', '38', '39', '40', '41'] : group === 'acc' ? ['One size'] : STD,
  colors: [],
  madeToOrder: group !== 'shoes' && group !== 'acc',
  leadTimeDays: group === 'full' ? 8 : group === 'bottoms' ? 6 : group === 'tops' ? 5 : group === 'shoes' ? 7 : 3,
});
const emptyLook = (category = '') => ({
  name: '',
  category,
  image: '',
  imagePublicId: '',
  active: true,
  pieces: { tops: [], bottoms: [], full: [], shoes: [], acc: [] },
});

export default function Looks() {
  const [looks, setLooks] = useState(null);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [editing, setEditing] = useState(null);
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  const load = () =>
    Promise.all([api('/api/admin/looks'), api('/api/admin/categories')])
      .then(([l, c]) => {
        setLooks(l);
        setCats(c);
      })
      .catch((e) => toast(e.message, 'err'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.get('new') && cats.length) {
      setEditing(emptyLook(cats[0]?.key));
      setParams({}, { replace: true });
    }
  }, [params, cats, setParams]);

  const shown = useMemo(
    () =>
      (looks || []).filter(
        (l) => (cat === 'all' || l.category === cat) && l.name.toLowerCase().includes(q.trim().toLowerCase())
      ),
    [looks, cat, q]
  );
  const catLabel = (k) => cats.find((c) => c.key === k)?.label || k;
  const filtered = cat !== 'all' || q.trim();

  const move = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= looks.length) return;
    const next = [...looks];
    [next[idx], next[j]] = [next[j], next[idx]];
    setLooks(next);
    try {
      setLooks(await api('/api/admin/looks/reorder', { method: 'PUT', body: { ids: next.map((l) => l._id) } }));
    } catch (e) {
      toast(e.message, 'err');
      load();
    }
  };

  const toggleActive = async (l) => {
    try {
      const doc = await api(`/api/admin/looks/${l._id}`, { method: 'PUT', body: { active: !l.active } });
      setLooks((s) => s.map((x) => (x._id === doc._id ? doc : x)));
      toast(doc.active ? `${doc.name} is live` : `${doc.name} hidden from website`);
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const remove = async (l) => {
    if (!window.confirm(`Delete "${l.name}"? This also removes its uploaded image.`)) return;
    try {
      await api(`/api/admin/looks/${l._id}`, { method: 'DELETE' });
      setLooks((s) => s.filter((x) => x._id !== l._id));
      toast('Look deleted');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  return (
    <>
      <PageHead title="Looks & Dresses" sub="Each look is a full-body cut-out of the model wearing one outfit, plus its shoppable pieces.">
        <button className="btn primary" onClick={() => setEditing(emptyLook(cats[0]?.key))} disabled={!cats.length}>
          <Icon name="plus" size={18} /> Add look
        </button>
      </PageHead>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input placeholder="Search looks" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips">
          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
            All
          </button>
          {cats.map((c) => (
            <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
              <Icon name={c.icon} size={16} /> {c.label}
            </button>
          ))}
        </div>
      </div>

      {!looks ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : shown.length === 0 ? (
        <Empty icon="hanger" title={filtered ? 'No looks match' : 'No looks yet'}>
          {!filtered && <p>Add your first look to show it on the website.</p>}
        </Empty>
      ) : (
        <div className="look-grid">
          {shown.map((l) => {
            const idx = looks.indexOf(l);
            const count = GROUPS.reduce((n, [g]) => n + (l.pieces?.[g]?.length || 0), 0);
            return (
              <article key={l._id} className={'look card' + (l.active ? '' : ' inactive')}>
                <button className="look-img" onClick={() => setEditing(l)} aria-label={`Edit ${l.name}`}>
                  <img src={imgUrl(l.image, 360)} alt="" loading="lazy" />
                  {!l.active && <span className="pill">Hidden</span>}
                </button>
                <div className="look-meta">
                  <div>
                    <h3>{l.name}</h3>
                    <small>
                      {catLabel(l.category)} · {count} piece{count === 1 ? '' : 's'}
                    </small>
                  </div>
                  <label className="switch" title={l.active ? 'Live on website' : 'Hidden'}>
                    <input type="checkbox" checked={l.active} onChange={() => toggleActive(l)} />
                    <span />
                  </label>
                </div>
                <div className="look-actions">
                  <button className="icon-btn" onClick={() => move(idx, -1)} disabled={filtered || idx === 0} aria-label="Move earlier">
                    <Icon name="up" size={18} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => move(idx, 1)}
                    disabled={filtered || idx === looks.length - 1}
                    aria-label="Move later"
                  >
                    <Icon name="down" size={18} />
                  </button>
                  <button className="btn sm" onClick={() => setEditing(l)}>
                    <Icon name="pencil" size={15} /> Edit
                  </button>
                  <button className="icon-btn danger" onClick={() => remove(l)} aria-label="Delete">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {filtered && looks?.length > 0 && <p className="muted small">Clear the search and category filter to reorder looks.</p>}

      {editing && (
        <LookEditor
          look={editing}
          cats={cats}
          onClose={() => setEditing(null)}
          onSaved={(doc, isNew) => {
            setLooks((s) => (isNew ? [...s, doc] : s.map((x) => (x._id === doc._id ? doc : x))));
            setEditing(null);
            toast(isNew ? 'Look added' : 'Look saved');
          }}
        />
      )}
    </>
  );
}

function LookEditor({ look, cats, onClose, onSaved }) {
  const isNew = !look._id;
  const [form, setForm] = useState(() => JSON.parse(JSON.stringify({ ...emptyLook(), ...look })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dims, setDims] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setPieces = (g, list) => setForm((f) => ({ ...f, pieces: { ...f.pieces, [g]: list } }));

  const save = async () => {
    setError('');
    if (!form.name.trim()) return setError('Name is required');
    if (!form.image) return setError('Upload a cut-out image');
    for (const [g, label] of GROUPS) {
      if (form.pieces[g].some((p) => !p.name.trim())) return setError(`Every ${label.toLowerCase()} piece needs a name`);
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        image: form.image,
        imagePublicId: form.imagePublicId || '',
        active: form.active,
        pieces: Object.fromEntries(
          GROUPS.map(([g]) => [
            g,
            form.pieces[g].map((p) => ({
              ...(p._id ? { _id: p._id } : {}), // keep ids so carts and orders stay valid
              name: p.name.trim(),
              color: (p.color || '').trim(),
              price: Number(p.price) || 0,
              description: (p.description || '').trim(),
              fabric: (p.fabric || '').trim(),
              care: (p.care || '').trim(),
              sizes: (p.sizes || []).filter(Boolean),
              colors: (p.colors || []).filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), hex: c.hex || '' })),
              madeToOrder: p.madeToOrder !== false,
              leadTimeDays: Number(p.leadTimeDays) >= 0 ? Number(p.leadTimeDays) : 5,
            })),
          ])
        ),
      };
      const doc = await api(isNew ? '/api/admin/looks' : `/api/admin/looks/${look._id}`, {
        method: isNew ? 'POST' : 'PUT',
        body,
      });
      onSaved(doc, isNew);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const big = imgUrl(form.image, 1000);
  const wrongSize = dims && (dims.width !== 1360 || dims.height !== 2048);

  return (
    <Modal
      wide
      title={isNew ? 'Add look' : `Edit ${look.name}`}
      onClose={onClose}
      footer={
        <>
          {error && <span className="err grow">{error}</span>}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? <Spinner /> : isNew ? 'Add look' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="editor">
        <div className="editor-media">
          <ImageUpload
            folder="looks"
            value={form.image}
            previewClass="portrait"
            onChange={({ url, publicId, width, height }) => {
              set({ image: url, imagePublicId: publicId || '' });
              setDims(width ? { width, height } : null);
            }}
            hint="Transparent PNG/WebP, 1360 × 2048, same pose & position as the other looks."
          />
          {wrongSize && (
            <div className="alert warn">
              Uploaded image is {dims.width} × {dims.height}. 1360 × 2048 keeps the outfit swap aligned.
            </div>
          )}
          {form.image && (
            <div className="face-check">
              <span className="avatar" style={faceCrop(big, 72)} />
              <small>Avatar preview: the face should sit centred in this square.</small>
            </div>
          )}
        </div>

        <div className="editor-form">
          <div className="row2">
            <Field label="Look name">
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Denim Maxi" />
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
                {cats.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
            Show on website
          </label>

          <h4 className="section-title">Pieces in this look</h4>
          {GROUPS.map(([g, label]) => (
            <PieceGroup key={g} group={g} label={label} list={form.pieces[g]} onChange={(l) => setPieces(g, l)} />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function PieceGroup({ group, label, list, onChange }) {
  const [open, setOpen] = useState(null); // index of the piece whose shop details are expanded
  const update = (i, patch) => onChange(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="piece-group">
      <div className="piece-head">
        <span>
          {label} <small>· {list.length}</small>
        </span>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            onChange([...list, newPiece(group)]);
            setOpen(list.length);
          }}
        >
          <Icon name="plus" size={15} /> Add
        </button>
      </div>
      {list.length === 0 && <div className="muted small">Nothing in this look</div>}
      {list.map((p, i) => (
        <div key={p._id || i} className={'piece-card' + (open === i ? ' open' : '')}>
          <div className="piece-row">
            <input placeholder="Piece name" value={p.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Piece name" />
            <input placeholder="Default colour" value={p.color} onChange={(e) => update(i, { color: e.target.value })} aria-label="Default colour" />
            <span className="price">
              <i>$</i>
              <input type="number" min="0" step="1" value={p.price} onChange={(e) => update(i, { price: e.target.value })} aria-label="Price in USD" />
            </span>
            <button type="button" className="icon-btn danger" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove piece">
              <Icon name="trash" size={16} />
            </button>
          </div>
          <button type="button" className="piece-toggle" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <Icon name={open === i ? 'up' : 'down'} size={15} />
            Shop details
            <small>
              {(p.colors || []).length || 'default'} colours · {(p.sizes || []).length} sizes ·{' '}
              {p.madeToOrder === false ? 'ready-made' : `stitched in ${p.leadTimeDays ?? 5} d`}
            </small>
          </button>
          {open === i && <PieceDetails p={p} onChange={(patch) => update(i, patch)} />}
        </div>
      ))}
    </div>
  );
}

function PieceDetails({ p, onChange }) {
  const colors = p.colors || [];
  const setColor = (i, patch) => onChange({ colors: colors.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="piece-details">
      <Field label="Description" hint="Shown to customers on the product sheet">
        <textarea rows={2} value={p.description || ''} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <div className="row2">
        <Field label="Fabric">
          <input value={p.fabric || ''} onChange={(e) => onChange({ fabric: e.target.value })} placeholder="e.g. Cotton twill" />
        </Field>
        <Field label="Care">
          <input value={p.care || ''} onChange={(e) => onChange({ care: e.target.value })} placeholder="e.g. Machine wash cold" />
        </Field>
      </div>
      <div className="row2">
        <label className="check">
          <input type="checkbox" checked={p.madeToOrder !== false} onChange={(e) => onChange({ madeToOrder: e.target.checked })} />
          Made to order (stitched by a tailor, allows custom fit)
        </label>
        <Field label={p.madeToOrder === false ? 'Ships in (days)' : 'Stitching time (days)'}>
          <input type="number" min="0" value={p.leadTimeDays ?? 5} onChange={(e) => onChange({ leadTimeDays: e.target.value })} />
        </Field>
      </div>
      <Field label="Sizes customers can choose" hint="e.g. XS, S, M, L, XL, or shoe sizes, or One size">
        <TagInput value={p.sizes || []} onChange={(sizes) => onChange({ sizes })} placeholder="Add a size and press Enter" />
      </Field>
      <div className="field">
        <span className="field-label">Colour options</span>
        {colors.length === 0 && (
          <small className="hint">None added, so customers see the default colour plus Black, White and Ivory.</small>
        )}
        {colors.map((c, i) => (
          <div key={i} className="colour-row">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#9aa0a6'}
              onChange={(e) => setColor(i, { hex: e.target.value })}
              aria-label="Colour swatch"
            />
            <input value={c.name} placeholder="Colour name" onChange={(e) => setColor(i, { name: e.target.value })} />
            <button type="button" className="icon-btn danger" onClick={() => onChange({ colors: colors.filter((_, j) => j !== i) })} aria-label="Remove colour">
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="btn sm" onClick={() => onChange({ colors: [...colors, { name: '', hex: '#9aa0a6' }] })}>
            <Icon name="plus" size={15} /> Add colour
          </button>
        </div>
      </div>
    </div>
  );
}
