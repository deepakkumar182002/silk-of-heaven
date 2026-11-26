import { useEffect, useMemo, useState } from 'react';
import { api, imgUrl } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon, { CATEGORY_ICONS } from '../components/icons.jsx';
import { Empty, Field, ImageUpload, Modal, Spinner, TagInput, useToast } from '../components/ui.jsx';
import { LayerStack } from '../components/AiTools.jsx';
import PlaceOnModel from '../components/PlaceOnModel.jsx';
import { PieceDetails } from './Looks.jsx';
import { aiLayer, aiStatus } from '../ai.js';

/** Where a category's items sit on the model (stacking order and which items replace each other). */
export const POSITIONS = [
  ['shoes', 'Feet: shoes, juttis, heels'],
  ['bag', 'Hand or shoulder: bags, potlis, clutches'],
  ['jewellery', 'Ears, neck, wrists: jewellery'],
  ['drape', 'Shoulders: dupattas, scarves, stoles'],
  ['outer', 'Over the outfit: jackets, shrugs, kotis'],
  ['top', 'Upper body: tops, kurtis, shirts'],
  ['bottom', 'Lower body: pants, skirts, salwars'],
  ['full', 'Whole outfit: dresses, sarees, sets'],
  ['head', 'Head: caps, turbans, sunglasses'],
  ['none', 'Not on the model (shop only)'],
];
const positionLabel = (k) => POSITIONS.find(([p]) => p === k)?.[1].split(':')[0] || k;

const blankItem = (cat) => ({
  name: '',
  category: cat?.key || '',
  price: 0,
  color: '',
  colors: [],
  sizes: [...(cat?.sizes || [])],
  description: '',
  fabric: '',
  care: '',
  madeToOrder: false,
  leadTimeDays: 5,
  stock: null,
  photo: '',
  photoPublicId: '',
  layers: [],
  active: true,
});

/**
 * Item library: shoes, bags, jewellery, dupattas… in categories the admin defines. An item is added once
 * and can then be attached to any number of looks (Looks & Dresses → Items from the library).
 */
export default function Items() {
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState([]);
  const [bodies, setBodies] = useState([]);
  const [looks, setLooks] = useState([]);
  const [ai, setAi] = useState(null);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [manage, setManage] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([api('/api/admin/items'), api('/api/admin/item-categories'), api('/api/admin/bodies'), api('/api/admin/looks')])
      .then(([i, c, b, l]) => {
        setItems(i);
        setCats(c);
        setBodies(b);
        setLooks(l);
      })
      .catch((e) => toast(e.message, 'err'));
    aiStatus()
      .then(setAi)
      .catch(() => setAi({ enabled: false }));
  }, [toast]);

  const catOf = (key) => cats.find((c) => c.key === key);
  const usedIn = (id) => looks.filter((l) => (l.items || []).some((a) => a.item === id));
  const shown = useMemo(
    () => (items || []).filter((it) => (cat === 'all' || it.category === cat) && `${it.name} ${it.color}`.toLowerCase().includes(q.trim().toLowerCase())),
    [items, cat, q]
  );

  const toggle = async (it) => {
    try {
      const doc = await api(`/api/admin/items/${it._id}`, { method: 'PUT', body: { active: !it.active } });
      setItems((s) => s.map((x) => (x._id === doc._id ? doc : x)));
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const remove = async (it) => {
    const n = usedIn(it._id).length;
    if (!window.confirm(`Delete "${it.name}"?${n ? ` It is removed from ${n} look${n === 1 ? '' : 's'} too.` : ''}`)) return;
    try {
      await api(`/api/admin/items/${it._id}`, { method: 'DELETE' });
      setItems((s) => s.filter((x) => x._id !== it._id));
      setLooks((ls) => ls.map((l) => ({ ...l, items: (l.items || []).filter((a) => a.item !== it._id) })));
      toast('Item deleted');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  return (
    <>
      <PageHead title="Items" sub="Shoes, bags, jewellery, dupattas and more, in your own categories. Add an item once, then attach it to any look in Looks & Dresses.">
        <button className="btn" onClick={() => setManage(true)}>
          <Icon name="grid" size={18} /> Categories
        </button>
        <button className="btn primary" onClick={() => setEditing(blankItem(catOf(cat) || cats[0]))} disabled={!cats.length}>
          <Icon name="plus" size={18} /> Add item
        </button>
      </PageHead>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips">
          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
            All <small>{items?.length || 0}</small>
          </button>
          {cats.map((c) => (
            <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
              <Icon name={c.icon} size={16} /> {c.label} <small>{(items || []).filter((i) => i.category === c.key).length}</small>
            </button>
          ))}
        </div>
      </div>

      {!items ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : !cats.length ? (
        <Empty icon="grid" title="Create a category first">
          <p>For example Footwear, Bags, Jewellery or Dupattas.</p>
          <button className="btn primary" onClick={() => setManage(true)}>
            <Icon name="plus" size={16} /> Add categories
          </button>
        </Empty>
      ) : shown.length === 0 ? (
        <Empty icon="bag" title={items.length ? 'No items match' : 'No items yet'}>
          {!items.length && <p>Add shoes, bags or jewellery here, then attach them to your looks.</p>}
        </Empty>
      ) : (
        <div className="item-grid">
          {shown.map((it) => {
            const c = catOf(it.category);
            const n = usedIn(it._id).length;
            return (
              <article key={it._id} className={'item-card card' + (it.active ? '' : ' inactive')}>
                <button className="item-img" onClick={() => setEditing(it)} aria-label={`Edit ${it.name}`}>
                  {it.photo ? <img src={imgUrl(it.photo, 360)} alt="" loading="lazy" /> : <Icon name={c?.icon || 'bag'} size={34} />}
                  {!it.active && <span className="pill">Hidden</span>}
                </button>
                <div className="item-meta">
                  <b>{it.name}</b>
                  <small>
                    {c?.label || it.category} · ₹{it.price}
                  </small>
                  <div className="item-badges">
                    {c?.slot !== 'none' &&
                      bodies.map((b) => (
                        <span key={b.key} className={'mini-pill' + (it.layers.some((l) => l.body === b.key) ? ' ok' : '')} title={`Try-on layer for ${b.name}`}>
                          {b.name}
                        </span>
                      ))}
                    <span className="mini-pill">{n ? `in ${n} look${n === 1 ? '' : 's'}` : 'not in a look'}</span>
                    {it.stock != null && <span className={'mini-pill' + (it.stock === 0 ? ' bad' : '')}>{it.stock === 0 ? 'sold out' : `${it.stock} in stock`}</span>}
                  </div>
                </div>
                <div className="look-actions">
                  <label className="switch" title={it.active ? 'Live on website' : 'Hidden'}>
                    <input type="checkbox" checked={it.active} onChange={() => toggle(it)} />
                    <span />
                  </label>
                  <button className="btn sm" onClick={() => setEditing(it)}>
                    <Icon name="pencil" size={15} /> Edit
                  </button>
                  <button className="icon-btn danger" onClick={() => remove(it)} aria-label="Delete">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {manage && <CategoryManager cats={cats} items={items || []} onChange={setCats} onClose={() => setManage(false)} />}
      {editing && (
        <ItemEditor
          item={editing}
          cats={cats}
          bodies={bodies}
          looks={usedIn(editing._id)}
          ai={ai}
          onClose={() => setEditing(null)}
          onSaved={(doc, isNew) => {
            setItems((s) => (isNew ? [...s, doc] : s.map((x) => (x._id === doc._id ? doc : x))));
            setEditing(null);
            toast(isNew ? 'Item added. Attach it to looks in Looks & Dresses.' : 'Item saved');
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Item editor
// ---------------------------------------------------------------------------
function ItemEditor({ item, cats, bodies, looks, ai, onClose, onSaved }) {
  const isNew = !item._id;
  const [form, setForm] = useState(() => JSON.parse(JSON.stringify(item)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const cat = cats.find((c) => c.key === form.category);
  const onModel = cat && cat.slot !== 'none';

  const setLayer = (body, layer) =>
    set({ layers: [...form.layers.filter((l) => l.body !== body), ...(layer ? [{ body, image: layer.url, imagePublicId: layer.publicId || '' }] : [])] });

  const save = async () => {
    setError('');
    if (!form.name.trim()) return setError('Name is required');
    if (!form.category) return setError('Choose a category');
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        price: Number(form.price) || 0,
        color: (form.color || '').trim(),
        colors: (form.colors || []).filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), hex: c.hex || '' })),
        sizes: (form.sizes || []).filter(Boolean),
        description: (form.description || '').trim(),
        fabric: (form.fabric || '').trim(),
        care: (form.care || '').trim(),
        madeToOrder: !!form.madeToOrder,
        leadTimeDays: Number(form.leadTimeDays) >= 0 ? Number(form.leadTimeDays) : 5,
        stock: form.madeToOrder || form.stock === '' || form.stock == null ? null : Math.max(0, Math.round(Number(form.stock))),
        photo: form.photo || '',
        photoPublicId: form.photoPublicId || '',
        layers: form.layers,
        active: form.active,
      };
      const doc = await api(isNew ? '/api/admin/items' : `/api/admin/items/${item._id}`, { method: isNew ? 'POST' : 'PUT', body });
      onSaved(doc, isNew);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={isNew ? 'Add item' : `Edit ${item.name}`}
      onClose={onClose}
      footer={
        <>
          {error && <span className="err grow">{error}</span>}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? <Spinner /> : isNew ? 'Add item' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="editor">
        <div className="editor-media">
          <ImageUpload
            folder="items"
            value={form.photo}
            onChange={({ url, publicId }) => set({ photo: url, photoPublicId: publicId || '' })}
            hint="Product photo for the shop (square works best). It is also the source for “Place on model”."
          />
          {looks.length > 0 && (
            <div className="field">
              <span className="field-label">Used in {looks.length} look{looks.length === 1 ? '' : 's'}</span>
              <div className="pick-looks">
                {looks.map((l) => (
                  <img key={l._id} src={imgUrl(l.image, 160)} alt={l.name} title={l.name} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="editor-form">
          <div className="row2">
            <Field label="Item name">
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Gold jhumkas" />
            </Field>
            <Field label="Category">
              <select
                value={form.category}
                onChange={(e) => {
                  const c = cats.find((x) => x.key === e.target.value);
                  set({ category: e.target.value, ...(isNew && c?.sizes?.length ? { sizes: [...c.sizes] } : {}) });
                }}
              >
                {cats.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="row2">
            <Field label="Price (₹)">
              <input type="number" min="0" step="1" value={form.price} onChange={(e) => set({ price: e.target.value })} />
            </Field>
            <Field label="Colour">
              <input value={form.color} onChange={(e) => set({ color: e.target.value })} placeholder="e.g. Antique gold" />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
            Show on website
          </label>

          <h4 className="section-title">Try-on layers {cat && <small>· {positionLabel(cat.slot)}</small>}</h4>
          {!onModel ? (
            <p className="muted small">This category is shop only, so items are not drawn on the model. Change it in Categories to allow try-on.</p>
          ) : (
            <>
              <p className="muted small">
                One layer per body model: the item alone on a transparent 1360 × 2048 canvas, placed where it sits on that model. It then fits every
                look of that body.
              </p>
              <div className="layer-grid">
                {bodies.map((b) => (
                  <LayerTile
                    key={b.key}
                    body={b}
                    cat={cat}
                    name={form.name}
                    photo={form.photo}
                    layer={form.layers.find((l) => l.body === b.key)}
                    ai={ai}
                    onChange={(layer) => setLayer(b.key, layer)}
                    onPhoto={(photo) => photo && !form.photo && set({ photo: photo.url, photoPublicId: photo.publicId || '' })}
                  />
                ))}
              </div>
            </>
          )}

          <h4 className="section-title">Shop details</h4>
          <PieceDetails p={form} onChange={(p) => set(p)} />
        </div>
      </div>
    </Modal>
  );
}

function LayerTile({ body, cat, name, photo, layer, ai, onChange, onPhoto }) {
  const [place, setPlace] = useState(null); // File | url
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const toast = useToast();

  const upload = async (file) => {
    if (!file) return;
    setBusy('upload');
    try {
      const f = new FormData();
      f.append('file', file);
      const r = await api('/api/upload?folder=layers', { method: 'POST', form: f });
      if (r.width !== 1360 || r.height !== 2048) toast(`Layer is ${r.width} × ${r.height}; use 1360 × 2048 so it lines up`, 'err');
      onChange(r);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy('');
    }
  };
  const generate = async () => {
    if (!photo) return toast('Add a product photo first', 'err');
    setBusy('ai');
    setMsg('');
    try {
      const r = await aiLayer({ photoUrl: photo, lookImage: body.image, slot: cat.slot, name });
      onChange(r.layer);
      onPhoto(r.photo);
      setMsg(r.warning || '');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="layer-tile">
      <LayerStack image={body.image} layers={layer ? [layer.image] : []} width={120} />
      <div className="layer-side">
        <b>{body.name}</b>
        <small>{layer ? 'Layer ready' : 'No layer yet'}</small>
        {!body.image ? (
          <small className="warn-text">Add a base image for {body.name} first (Body models).</small>
        ) : (
          <div className="layer-btns">
            <button type="button" className="btn sm" onClick={() => setPlace(photo)} disabled={!photo || !!busy} title={photo ? '' : 'Add a product photo first'}>
              <Icon name="pose" size={14} /> Place photo
            </button>
            <label className="btn sm" title="Transparent PNG, 1360 × 2048, same position as this body model">
              {busy === 'upload' ? <Spinner size={14} /> : <Icon name="upload" size={14} />} Upload PNG
              <input
                type="file"
                accept="image/png,image/webp"
                hidden
                onChange={(e) => {
                  upload(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {ai?.enabled && (
              <button type="button" className="btn sm" onClick={generate} disabled={!!busy || !photo}>
                {busy === 'ai' ? <Spinner size={14} /> : <Icon name="details" size={14} />} AI
              </button>
            )}
            {layer && (
              <button type="button" className="icon-btn danger" onClick={() => onChange(null)} aria-label={`Remove the ${body.name} layer`}>
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        )}
        {msg && <small className="warn-text">{msg}</small>}
      </div>
      {place && (
        <PlaceOnModel
          base={body.image}
          face={body.face}
          slot={cat.slot}
          source={place}
          onClose={() => setPlace(null)}
          onDone={(r) => {
            onChange(r);
            setPlace(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categories (Footwear, Bags, Jewellery… any the admin wants)
// ---------------------------------------------------------------------------
function CategoryManager({ cats, items, onChange, onClose }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const count = (k) => items.filter((i) => i.category === k).length;

  const save = async () => {
    setError('');
    const e = editing;
    if (!e.label.trim()) return setError('Name is required');
    const isNew = !e._id;
    const key = isNew ? e.key || e.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : e.key;
    if (isNew && !/^[a-z0-9-]+$/.test(key)) return setError('Key: lowercase letters, numbers or dashes');
    setBusy(true);
    try {
      const body = { label: e.label.trim(), slot: e.slot, multi: !!e.multi, icon: e.icon, sizes: e.sizes, ...(isNew ? { key } : {}) };
      const doc = await api(isNew ? '/api/admin/item-categories' : `/api/admin/item-categories/${e._id}`, { method: isNew ? 'POST' : 'PUT', body });
      onChange(isNew ? [...cats, doc] : cats.map((c) => (c._id === doc._id ? doc : c)));
      setEditing(null);
      toast(isNew ? 'Category added' : 'Category saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete the category "${c.label}"?`)) return;
    try {
      await api(`/api/admin/item-categories/${c._id}`, { method: 'DELETE' });
      onChange(cats.filter((x) => x._id !== c._id));
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const move = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= cats.length) return;
    const next = [...cats];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    try {
      onChange(await api('/api/admin/item-categories/reorder', { method: 'PUT', body: { ids: next.map((c) => c._id) } }));
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  return (
    <Modal
      title={editing ? (editing._id ? `Edit ${editing.label}` : 'Add category') : 'Item categories'}
      onClose={editing ? () => setEditing(null) : onClose}
      footer={
        editing ? (
          <>
            {error && <span className="err grow">{error}</span>}
            <button className="btn" onClick={() => setEditing(null)}>
              Back
            </button>
            <button className="btn primary" onClick={save} disabled={busy}>
              {busy ? <Spinner /> : 'Save'}
            </button>
          </>
        ) : (
          <>
            <span className="grow muted small">Shown on the website in this order.</span>
            <button className="btn primary" onClick={() => setEditing({ label: '', key: '', slot: 'bag', multi: false, icon: 'acc', sizes: ['One size'] })}>
              <Icon name="plus" size={16} /> Add category
            </button>
          </>
        )
      }
    >
      {editing ? (
        <div className="form-grid">
          <Field label="Name" hint="e.g. Footwear, Bags & potlis, Jewellery, Dupattas, Watches">
            <input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} autoFocus />
          </Field>
          <Field label="Where it sits on the model" hint="Items in the same position replace each other on the model (one pair of shoes at a time).">
            <select value={editing.slot} onChange={(e) => setEditing({ ...editing, slot: e.target.value, multi: e.target.value === 'jewellery' ? true : editing.multi })}>
              {POSITIONS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          {editing.slot !== 'none' && (
            <label className="check">
              <input type="checkbox" checked={!!editing.multi} onChange={(e) => setEditing({ ...editing, multi: e.target.checked })} />
              Customers can wear several at once (e.g. earrings + necklace + bangles)
            </label>
          )}
          <Field label="Default sizes for new items">
            <TagInput value={editing.sizes || []} onChange={(sizes) => setEditing({ ...editing, sizes })} placeholder="Add a size and press Enter" />
          </Field>
          <Field label="Icon">
            <div className="icon-pick">
              {CATEGORY_ICONS.map((n) => (
                <button type="button" key={n} className={editing.icon === n ? 'on' : ''} onClick={() => setEditing({ ...editing, icon: n })} aria-label={n} title={n}>
                  <Icon name={n} size={22} />
                </button>
              ))}
            </div>
          </Field>
        </div>
      ) : cats.length === 0 ? (
        <p className="muted">No categories yet.</p>
      ) : (
        <div className="list">
          {cats.map((c, i) => (
            <div key={c._id} className="list-row">
              <div className="list-main">
                <span className="icon-tile">
                  <Icon name={c.icon} size={22} />
                </span>
                <div>
                  <b>{c.label}</b>
                  <small>
                    {positionLabel(c.slot)}
                    {c.multi ? ' · several at once' : ''} · {count(c.key)} item{count(c.key) === 1 ? '' : 's'}
                  </small>
                </div>
              </div>
              <div className="list-actions">
                <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <Icon name="up" size={18} />
                </button>
                <button className="icon-btn" disabled={i === cats.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <Icon name="down" size={18} />
                </button>
                <button className="btn sm" onClick={() => setEditing({ ...c })}>
                  <Icon name="pencil" size={15} /> Edit
                </button>
                <button className="icon-btn danger" onClick={() => remove(c)} aria-label="Delete">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
