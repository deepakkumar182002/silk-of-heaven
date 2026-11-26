import { useEffect, useState } from 'react';
import { AUDIENCES, api, faceCrop, imgUrl } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Field, ImageUpload, Modal, Spinner, useToast } from '../components/ui.jsx';
import { aiBase, aiStatus } from '../ai.js';

const audienceLabel = (a) => AUDIENCES.find(([k]) => k === a)?.[1] || a;
const HEIGHT = { women: 168, men: 178, kids: 120 };
const blank = (order) => ({ key: '', name: '', audience: 'men', image: '', imagePublicId: '', height: 178, active: true, order });

/**
 * Body models: the person every look is shown on (Women, Men, Boys, Girls…). All looks, item layers
 * and the visitor's face of one body line up because they share this base image's pose and position.
 */
export default function Bodies() {
  const [bodies, setBodies] = useState(null);
  const [looks, setLooks] = useState([]);
  const [editing, setEditing] = useState(null);
  const [ai, setAi] = useState(null);
  const toast = useToast();

  useEffect(() => {
    Promise.all([api('/api/admin/bodies'), api('/api/admin/looks')])
      .then(([b, l]) => {
        setBodies(b);
        setLooks(l);
      })
      .catch((e) => toast(e.message, 'err'));
    aiStatus()
      .then(setAi)
      .catch(() => setAi({ enabled: false }));
  }, [toast]);

  const count = (key) => looks.filter((l) => (l.body || 'women') === key).length;

  const move = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= bodies.length) return;
    const next = [...bodies];
    [next[idx], next[j]] = [next[j], next[idx]];
    setBodies(next);
    try {
      setBodies(await api('/api/admin/bodies/reorder', { method: 'PUT', body: { ids: next.map((b) => b._id) } }));
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const toggle = async (b) => {
    try {
      const doc = await api(`/api/admin/bodies/${b._id}`, { method: 'PUT', body: { active: !b.active } });
      setBodies((s) => s.map((x) => (x._id === doc._id ? doc : x)));
      toast(doc.active ? `${doc.name} is live` : `${doc.name} hidden from website`);
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const remove = async (b) => {
    if (!window.confirm(`Delete the body model "${b.name}"? Its try-on layers on items are removed too.`)) return;
    try {
      await api(`/api/admin/bodies/${b._id}`, { method: 'DELETE' });
      setBodies((s) => s.filter((x) => x._id !== b._id));
      toast('Body model deleted');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  return (
    <>
      <PageHead
        title="Body models"
        sub="The person each look is shown on: women, men, kids. Every look and try-on item of a body must use the same pose and position as its base image, so outfits, items and the visitor's face line up."
      >
        <button className="btn primary" onClick={() => setEditing(blank(bodies?.length || 0))} disabled={!bodies}>
          <Icon name="plus" size={18} /> Add body model
        </button>
      </PageHead>

      {!bodies ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : bodies.length === 0 ? (
        <Empty icon="users" title="No body models yet" />
      ) : (
        <div className="look-grid">
          {bodies.map((b, i) => (
            <article key={b._id} className={'look card' + (b.active ? '' : ' inactive')}>
              <button className="look-img body-img" onClick={() => setEditing(b)} aria-label={`Edit ${b.name}`}>
                {b.image ? <img src={imgUrl(b.image, 360)} alt="" loading="lazy" /> : <span className="body-empty">No base image</span>}
                {!b.active && <span className="pill">Hidden</span>}
              </button>
              <div className="look-meta">
                <div>
                  <h3>
                    {b.image && <span className="avatar sm" style={faceCrop(imgUrl(b.image, 1000), 26, b.face)} />} {b.name}
                  </h3>
                  <small>
                    {audienceLabel(b.audience)} · {b.height} cm · {count(b.key)} look{count(b.key) === 1 ? '' : 's'}
                    {i === 0 && ' · shown first'}
                  </small>
                  {b.image && !b.face?.w && <small className="warn-text">Face not checked yet (start the face service, then save)</small>}
                </div>
                <label className="switch" title={b.active ? 'Live on website' : 'Hidden'}>
                  <input type="checkbox" checked={b.active} onChange={() => toggle(b)} />
                  <span />
                </label>
              </div>
              <div className="look-actions">
                <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">
                  <Icon name="up" size={18} />
                </button>
                <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === bodies.length - 1} aria-label="Move later">
                  <Icon name="down" size={18} />
                </button>
                <button className="btn sm" onClick={() => setEditing(b)}>
                  <Icon name="pencil" size={15} /> Edit
                </button>
                <button className="icon-btn danger" onClick={() => remove(b)} aria-label="Delete">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <BodyEditor
          body={editing}
          reference={bodies.find((b) => b.image && b._id !== editing._id)}
          looks={looks.filter((l) => (l.body || 'women') === editing.key)}
          ai={ai}
          onClose={() => setEditing(null)}
          onSaved={(doc, isNew) => {
            setBodies((s) => (isNew ? [...s, doc] : s.map((x) => (x._id === doc._id ? doc : x))));
            setEditing(null);
            toast(doc.image && !doc.face?.w ? 'Saved. The face could not be checked (is the face service running?)' : 'Body model saved', doc.image && !doc.face?.w ? 'err' : undefined);
          }}
        />
      )}
    </>
  );
}

function BodyEditor({ body, reference, looks, ai, onClose, onSaved }) {
  const isNew = !body._id;
  const [form, setForm] = useState({ ...body });
  const [dims, setDims] = useState(null);
  const [ghost, setGhost] = useState(0.45);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  const save = async () => {
    setError('');
    if (!form.name.trim()) return setError('Name is required');
    if (isNew && !/^[a-z0-9-]+$/.test(form.key)) return setError('Key: lowercase letters, numbers or dashes (e.g. men, boys, girls)');
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        audience: form.audience,
        image: form.image || '',
        imagePublicId: form.imagePublicId || '',
        height: Number(form.height) || HEIGHT[form.audience] || 168,
        active: form.active,
        ...(isNew ? { key: form.key, order: form.order } : {}),
      };
      const doc = await api(isNew ? '/api/admin/bodies' : `/api/admin/bodies/${body._id}`, { method: isNew ? 'POST' : 'PUT', body: payload });
      onSaved(doc, isNew);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const plainFromLook = async (look) => {
    setAiBusy(true);
    setError('');
    try {
      const r = await aiBase(look.image);
      set({ image: r.url, imagePublicId: r.publicId || '' });
      setDims({ width: r.width, height: r.height });
    } catch (e) {
      setError(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const wrong = dims && (dims.width !== 1360 || dims.height !== 2048);

  return (
    <Modal
      wide
      title={isNew ? 'Add body model' : `Edit ${body.name}`}
      onClose={onClose}
      footer={
        <>
          {error && <span className="err grow">{error}</span>}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy || aiBusy}>
            {busy ? <Spinner /> : isNew ? 'Add body model' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="editor">
        <div className="editor-media">
          <ImageUpload
            folder="base"
            value={form.image}
            previewClass="portrait"
            onChange={({ url, publicId, width, height }) => {
              set({ image: url, imagePublicId: publicId || '' });
              setDims(width ? { width, height } : null);
            }}
            hint="Transparent PNG/WebP, 1360 × 2048. Full body, facing the camera, plain fitted clothes, arms slightly away from the body."
          />
          {wrong && <div className="alert warn">This image is {dims.width} × {dims.height}. Use 1360 × 2048 so looks and layers line up.</div>}
          {form.image && reference && (
            <div className="field">
              <span className="field-label">Framing check against {reference.name}</span>
              <div className="ghost-wrap">
                <img src={imgUrl(form.image, 600)} alt="" />
                <img src={imgUrl(reference.image, 600)} alt="" className="ghost" style={{ opacity: ghost }} />
                <i className="guide feet" />
                <i className="guide mid" />
              </div>
              <input type="range" min="0" max="1" step="0.05" value={ghost} onChange={(e) => setGhost(Number(e.target.value))} aria-label="Overlay strength" />
              <small className="hint">Keep the same framing: centred, feet on the bottom guide line, same camera distance. Kids are simply shorter.</small>
            </div>
          )}
        </div>

        <div className="editor-form">
          <div className="row2">
            <Field label="Name" hint="Shown on the website, e.g. Women, Men, Boys, Girls">
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Men" />
            </Field>
            <Field label="Key" hint={isNew ? 'Lowercase, cannot be changed later' : 'Cannot be changed'}>
              <input value={form.key} disabled={!isNew} onChange={(e) => set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="e.g. men" />
            </Field>
          </div>
          <div className="row2">
            <Field label="For">
              <select
                value={form.audience}
                onChange={(e) => set({ audience: e.target.value, ...(isNew ? { height: HEIGHT[e.target.value] } : {}) })}
              >
                {AUDIENCES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model height (cm)" hint="The height slider on the website starts here">
              <input type="number" min="60" max="220" value={form.height} onChange={(e) => set({ height: e.target.value })} />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
            Show on website
          </label>

          {form.image && (
            <div className="face-check">
              <span className="avatar" style={faceCrop(imgUrl(form.image, 1000), 72, form.image === body.image ? body.face : null)} />
              <small>
                {form.image === body.image && body.face?.w
                  ? 'Face found. The avatar and the face swap use this position.'
                  : 'The face position is checked by the face service when you save.'}
              </small>
            </div>
          )}

          <h4 className="section-title">How to make looks for this body</h4>
          <ol className="howto">
            <li>Upload this base image first (the model in plain clothes).</li>
            <li>Every look of this body must be the same person, same pose, same position. In Looks &amp; Dresses, use <b>Auto-align</b> to fix small differences in size and position.</li>
            <li>Try-on items (shoes, bags…) need a layer for this body: Items page → the item → Try-on layers.</li>
          </ol>

          {ai?.enabled && looks.length > 0 && (
            <div className="ai-box">
              <div className="ai-box-h">
                <Icon name="details" size={17} /> Make a plain base model from a look (AI)
              </div>
              <div className="pick-looks">
                {looks.slice(0, 8).map((l) => (
                  <button key={l._id} type="button" onClick={() => plainFromLook(l)} disabled={aiBusy} title={l.name}>
                    <img src={imgUrl(l.image, 200)} alt={l.name} />
                  </button>
                ))}
              </div>
              {aiBusy && (
                <small className="hint">
                  <Spinner size={14} /> Creating the base model…
                </small>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
