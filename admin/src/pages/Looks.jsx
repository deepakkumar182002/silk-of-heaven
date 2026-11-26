import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, faceCrop, imgUrl } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Field, ImageUpload, Modal, Spinner, TagInput, useToast } from '../components/ui.jsx';
import { BulkCreate, DressToLook, FittingItems, LayerStack, key } from '../components/AiTools.jsx';
import { aiAlign, aiStatus } from '../ai.js';

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
const emptyLook = (category = '', body = 'women') => ({
  name: '',
  category,
  body,
  items: [],
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
  const [body, setBody] = useState('all');
  const [bodies, setBodies] = useState([]);
  const [lib, setLib] = useState({ items: [], cats: [] }); // item library
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [ai, setAi] = useState(null);
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  const load = () =>
    Promise.all([
      api('/api/admin/looks'),
      api('/api/admin/categories'),
      api('/api/admin/bodies'),
      api('/api/admin/items'),
      api('/api/admin/item-categories'),
    ])
      .then(([l, c, b, items, itemCats]) => {
        setLooks(l);
        setCats(c);
        setBodies(b);
        setLib({ items, cats: itemCats });
      })
      .catch((e) => toast(e.message, 'err'));
  const firstBody = (body !== 'all' && body) || bodies[0]?.key || 'women';
  const bodyName = (k) => bodies.find((b) => b.key === k)?.name || k;

  useEffect(() => {
    load();
    aiStatus()
      .then(setAi)
      .catch(() => setAi({ enabled: false, slots: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.get('new') && cats.length) {
      setEditing(emptyLook(cats[0]?.key, firstBody));
      setParams({}, { replace: true });
    }
  }, [params, cats, setParams]);

  const shown = useMemo(
    () =>
      (looks || []).filter(
        (l) =>
          (cat === 'all' || l.category === cat) &&
          (body === 'all' || (l.body || 'women') === body) &&
          l.name.toLowerCase().includes(q.trim().toLowerCase())
      ),
    [looks, cat, body, q]
  );
  const catLabel = (k) => cats.find((c) => c.key === k)?.label || k;
  const filtered = cat !== 'all' || body !== 'all' || q.trim();

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
        <button className="btn" onClick={() => setBulk(true)} disabled={!cats.length} title="Upload dress photos; the AI puts each one on the model">
          <Icon name="details" size={18} /> Create from dresses
        </button>
        <button className="btn primary" onClick={() => setEditing(emptyLook(cats[0]?.key, firstBody))} disabled={!cats.length}>
          <Icon name="plus" size={18} /> Add look
        </button>
      </PageHead>

      {bodies.length > 1 && (
        <div className="chips body-chips" role="group" aria-label="Body model">
          <button className={body === 'all' ? 'on' : ''} onClick={() => setBody('all')}>
            All models
          </button>
          {bodies.map((b) => (
            <button key={b.key} className={body === b.key ? 'on' : ''} onClick={() => setBody(b.key)}>
              <Icon name="users" size={16} /> {b.name} <small>{(looks || []).filter((l) => (l.body || 'women') === b.key).length}</small>
            </button>
          ))}
        </div>
      )}
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
            const fit = GROUPS.reduce((n, [g]) => n + (l.pieces?.[g] || []).filter((p) => p.layer).length, 0);
            const extra = (l.items || []).length;
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
                      {bodies.length > 1 && `${bodyName(l.body || 'women')} · `}
                      {catLabel(l.category)} · {count} piece{count === 1 ? '' : 's'}
                      {extra > 0 && ` · ${extra} item${extra === 1 ? '' : 's'}`}
                      {fit > 0 && ` · ${fit} try-on`}
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

      {bulk && (
        <BulkCreate
          status={ai}
          cats={cats}
          bodies={bodies}
          onClose={() => setBulk(false)}
          onCreated={(docs, keepOpen) => {
            setLooks((s) => [...s, ...docs]);
            if (!keepOpen) setBulk(false);
          }}
        />
      )}

      {editing && (
        <LookEditor
          look={editing}
          cats={cats}
          bodies={bodies}
          lib={lib}
          ai={ai}
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

function LookEditor({ look, cats, bodies, lib, ai, onClose, onSaved }) {
  const isNew = !look._id;
  const [form, setForm] = useState(() => {
    const f = JSON.parse(JSON.stringify({ ...emptyLook(), ...look }));
    f.body = f.body || 'women';
    f.items = f.items || [];
    // stable client keys so items can move between shop groups while editing
    for (const [g] of GROUPS) f.pieces[g] = (f.pieces[g] || []).map((p) => ({ ...p, _k: p._id || key() }));
    return f;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dims, setDims] = useState(null);
  const [ghost, setGhost] = useState(0);
  const [aligning, setAligning] = useState(false);
  const [alignMsg, setAlignMsg] = useState('');
  const toast = useToast();
  const bodyDoc = bodies.find((b) => b.key === form.body);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const autoAlign = async () => {
    setAligning(true);
    setAlignMsg('');
    try {
      const r = await aiAlign(form.image, form.body);
      set({ image: r.url, imagePublicId: r.publicId || '' });
      setDims({ width: r.width, height: r.height });
      setAlignMsg(
        r.offBefore < 2
          ? 'Already aligned with the body model.'
          : `Aligned: moved ${Math.round(Math.hypot(r.dx, r.dy))} px${Math.abs(r.scale - 1) > 0.003 ? `, resized ${Math.round((r.scale - 1) * 1000) / 10}%` : ''}. Save to keep it.`
      );
      setGhost(0.5);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setAligning(false);
    }
  };
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
        body: form.body,
        items: form.items.map((a) => ({ item: a.item, defaultOn: !!a.defaultOn })),
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
              stock: p.madeToOrder !== false || p.stock === '' || p.stock == null ? null : Math.max(0, Math.round(Number(p.stock))),
              photo: p.photo || '',
              photoPublicId: p.photoPublicId || '',
              layer: p.layer || '',
              layerPublicId: p.layerPublicId || '',
              slot: p.slot || '',
              defaultOn: !!p.defaultOn,
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
            hint="Transparent PNG/WebP, 1360 × 2048, same pose & position as the other looks. Or generate it from dress photos below."
          />
          {form.image && bodyDoc?.image && bodyDoc.image !== form.image && (
            <div className="field">
              <span className="field-label">Alignment with the {bodyDoc.name} body model</span>
              <div className="ghost-wrap">
                <img src={imgUrl(form.image, 600)} alt="" />
                <img src={imgUrl(bodyDoc.image, 600)} alt="" className="ghost" style={{ opacity: ghost }} />
              </div>
              <input type="range" min="0" max="1" step="0.05" value={ghost} onChange={(e) => setGhost(Number(e.target.value))} aria-label="Show the body model on top" />
              <div className="row-actions">
                <small className="hint grow">Slide to show the body model on top: face, shoulders and feet should match.</small>
                <button type="button" className="btn sm" onClick={autoAlign} disabled={aligning || !ai?.face} title={ai?.face ? '' : 'Needs the face service (face-service/)'}>
                  {aligning ? <Spinner size={14} /> : <Icon name="pose" size={14} />} Auto-align
                </button>
              </div>
              {alignMsg && <small className="ok-text">{alignMsg}</small>}
              {!ai?.face && <small className="hint">Auto-align needs the face service running.</small>}
            </div>
          )}
          <DressToLook
            body={form.body}
            status={ai}
            onResult={(r) => {
              set({ image: r.url, imagePublicId: r.publicId || '' });
              setDims({ width: r.width, height: r.height });
              // keep the dress photo on the main piece so the shop can show it
              if (r.photo) {
                setForm((f) => {
                  const g = GROUPS.map(([k]) => k).find((k) => k !== 'shoes' && k !== 'acc' && f.pieces[k].some((p) => !p.layer && !p.photo));
                  if (!g) return f;
                  let done = false;
                  const list = f.pieces[g].map((p) => (!done && !p.layer && !p.photo ? ((done = true), { ...p, photo: r.photo.url, photoPublicId: r.photo.publicId }) : p));
                  return { ...f, pieces: { ...f.pieces, [g]: list } };
                });
              }
            }}
          />
          {wrongSize && (
            <div className="alert warn">
              Uploaded image is {dims.width} × {dims.height}. 1360 × 2048 keeps the outfit swap aligned.
            </div>
          )}
          {form.image && (
            <div className="face-check">
              <span className="avatar" style={faceCrop(big, 72, bodyDoc?.face)} />
              <small>Avatar preview: the face should sit centred in this square.</small>
            </div>
          )}
        </div>

        <div className="editor-form">
          {bodies.length > 1 && (
            <Field label="Body model" hint="Who wears this look. Its image must use this body model's pose and position.">
              <select value={form.body} onChange={(e) => set({ body: e.target.value })}>
                {bodies.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
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

          <h4 className="section-title">Items from the library</h4>
          <LibraryItems lib={lib} body={bodyDoc} image={form.image} value={form.items} onChange={(items) => set({ items })} />

          <h4 className="section-title">Mix &amp; match (fitting room)</h4>
          <FittingItems status={ai} form={form} setForm={setForm} makePiece={newPiece} />

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
        <div key={p._k || p._id || i} className={'piece-card' + (open === i ? ' open' : '')}>
          {p.layer && <span className="pill fit-pill">Try-on item</span>}
          <div className="piece-row">
            <input placeholder="Piece name" value={p.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Piece name" />
            <input placeholder="Default colour" value={p.color} onChange={(e) => update(i, { color: e.target.value })} aria-label="Default colour" />
            <span className="price">
              <i>₹</i>
              <input type="number" min="0" step="1" value={p.price} onChange={(e) => update(i, { price: e.target.value })} aria-label="Price in rupees" />
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

export function PieceDetails({ p, onChange }) {
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
      {p.madeToOrder === false && (
        <Field label="Stock" hint="Pieces in stock. Leave empty to not track stock. At 0 the website shows Sold out.">
          <input type="number" min="0" value={p.stock ?? ''} onChange={(e) => onChange({ stock: e.target.value === '' ? null : e.target.value })} placeholder="Not tracked" />
        </Field>
      )}
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

/**
 * Items from the library (Items page) attached to this look, category by category.
 * Website visitors can show / hide / swap them on the model (when the item has a layer for this body)
 * and buy them.
 */
function LibraryItems({ lib, body, image, value, onChange }) {
  const [pick, setPick] = useState(null); // category key being picked
  const [q, setQ] = useState('');
  const byId = new Map(lib.items.map((it) => [it._id, it]));
  const attached = value.map((a) => ({ ...a, doc: byId.get(a.item) })).filter((a) => a.doc);
  const has = (id) => value.some((a) => a.item === id);
  const toggle = (id) => onChange(has(id) ? value.filter((a) => a.item !== id) : [...value, { item: id, defaultOn: false }]);
  const setOn = (id, on) => {
    const cat = lib.cats.find((c) => c.key === byId.get(id)?.category);
    onChange(
      value.map((a) => {
        if (a.item === id) return { ...a, defaultOn: on };
        // one item per position is worn by default (except "several at once" categories)
        const other = byId.get(a.item);
        const same = other && lib.cats.find((c) => c.key === other.category)?.slot === cat?.slot;
        return on && same && cat?.slot !== 'none' && !cat?.multi ? { ...a, defaultOn: false } : a;
      })
    );
  };
  const layerOf = (it) => body && it.layers.find((l) => l.body === body.key);

  if (!lib.cats.length) return <p className="muted small">Create item categories and items on the Items page first.</p>;
  const worn = attached.filter((a) => a.defaultOn && layerOf(a.doc)).map((a) => layerOf(a.doc).image);

  return (
    <div className="lib">
      {worn.length > 0 && image && (
        <div className="lib-preview">
          <LayerStack image={image} layers={worn} width={110} />
          <small className="hint">Worn when the look opens</small>
        </div>
      )}
      <div className="lib-cats">
        {lib.cats.map((c) => {
          const list = attached.filter((a) => a.doc.category === c.key);
          const options = lib.items.filter((it) => it.category === c.key);
          return (
            <div key={c.key} className="lib-cat">
              <div className="piece-head">
                <span>
                  <Icon name={c.icon} size={15} /> {c.label} <small>· {list.length}</small>
                </span>
                <button type="button" className="btn sm" onClick={() => setPick(c.key)} disabled={!options.length} title={options.length ? '' : 'No items in this category yet'}>
                  <Icon name="plus" size={15} /> Add
                </button>
              </div>
              {list.map(({ item, defaultOn, doc }) => {
                const layer = c.slot !== 'none' && layerOf(doc);
                return (
                  <div key={item} className="lib-row">
                    <span className="lib-thumb" style={doc.photo ? { backgroundImage: `url("${imgUrl(doc.photo, 120)}")` } : undefined} />
                    <div className="lib-name">
                      <b>{doc.name}</b>
                      <small>
                        ₹{doc.price}
                        {c.slot === 'none' ? ' · shop only' : layer ? ' · try-on ready' : ` · no layer for ${body?.name || 'this model'}, shop only`}
                        {!doc.active && ' · hidden'}
                      </small>
                    </div>
                    {layer && (
                      <label className="check sm" title="Show it on the model when the look opens">
                        <input type="checkbox" checked={!!defaultOn} onChange={(e) => setOn(item, e.target.checked)} /> Worn
                      </label>
                    )}
                    <button type="button" className="icon-btn danger" onClick={() => toggle(item)} aria-label={`Remove ${doc.name}`}>
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {pick && (
        <Modal title={`Add ${lib.cats.find((c) => c.key === pick)?.label || 'items'}`} onClose={() => setPick(null)} footer={<button className="btn primary" onClick={() => setPick(null)}>Done</button>}>
          <label className="search">
            <Icon name="search" size={18} />
            <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </label>
          <div className="lib-pick">
            {lib.items
              .filter((it) => it.category === pick && it.name.toLowerCase().includes(q.trim().toLowerCase()))
              .map((it) => (
                <button key={it._id} type="button" className={'lib-opt' + (has(it._id) ? ' on' : '')} onClick={() => toggle(it._id)} aria-pressed={has(it._id)}>
                  <span className="lib-thumb" style={it.photo ? { backgroundImage: `url("${imgUrl(it.photo, 200)}")` } : undefined}>
                    {has(it._id) && (
                      <i>
                        <Icon name="check" size={14} />
                      </i>
                    )}
                  </span>
                  <b>{it.name}</b>
                  <small>
                    ₹{it.price}
                    {layerOf(it) ? ' · try-on' : ''}
                  </small>
                </button>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
