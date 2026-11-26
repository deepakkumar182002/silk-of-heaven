import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, imgUrl } from '../api.js';
import { SLOT_GROUP, aiLayer, aiLook, nameFromFile, runQueue } from '../ai.js';
import Icon from './icons.jsx';
import { Modal, Spinner, useToast } from './ui.jsx';

const ACCEPT = 'image/png,image/webp,image/jpeg,image/avif';
let uid = 0;
export const key = () => `k${Date.now().toString(36)}${(uid++).toString(36)}`;

/** Object URL for a File, revoked on unmount. */
function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}
function Thumb({ file, onRemove }) {
  const url = useObjectUrl(file);
  return (
    <span className="ai-thumb">
      <img src={url} alt="" />
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove photo">
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}

/** Multi-file drop zone. */
export function PhotoDrop({ onFiles, multiple = true, label = 'Drop photos or click to choose', small }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const take = (list) => {
    const files = [...(list || [])].filter((f) => ACCEPT.split(',').includes(f.type));
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <>
      <div
        className={'ai-drop' + (drag ? ' drag' : '') + (small ? ' small' : '')}
        role="button"
        tabIndex={0}
        onClick={() => input.current.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          take(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={small ? 18 : 24} />
        <span>{label}</span>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={multiple}
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}

export function AiOff({ status }) {
  if (!status || status.enabled) return null;
  return (
    <div className="alert warn">
      AI is off. Add <code>GEMINI_API_KEY</code> to <code>backend/.env</code> and restart the API to generate looks and items.
    </div>
  );
}

/** Which model the dresses are fitted on. */
function BaseModel({ status }) {
  const b = status?.base;
  if (!b?.url) return <div className="alert warn">No base model yet. Set one in Site Settings or add a look first.</div>;
  return (
    <div className="ai-base">
      <img src={imgUrl(b.url, 120)} alt="" />
      <div>
        <b>Fitted on</b>
        <small>{b.source === 'settings' ? 'AI base model from Site Settings' : `the first look (${b.lookName})`}. Same face, body and pose as every look.</small>
        <Link to="/settings">Change base model</Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Look editor: generate the cut-out from dress photos
// ---------------------------------------------------------------------------
export function DressToLook({ status, onResult, body }) {
  const [files, setFiles] = useState([]);
  const [notes, setNotes] = useState('');
  const [keepFace, setKeepFace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState('');
  const toast = useToast();

  const run = async () => {
    setBusy(true);
    setWarning('');
    try {
      const r = await aiLook(files, { notes, keepFace, body });
      onResult(r);
      setWarning(r.warning || '');
      toast('Look generated');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-box">
      <div className="ai-box-h">
        <Icon name="details" size={17} /> Generate from dress photos
      </div>
      <small className="hint">Upload the dress (hanger, mannequin or flat lay). Add more angles of the same dress for better detail.</small>
      {files.length > 0 && (
        <div className="ai-thumbs">
          {files.map((f, i) => (
            <Thumb key={i} file={f} onRemove={() => setFiles(files.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}
      {files.length < 4 && <PhotoDrop small onFiles={(f) => setFiles([...files, ...f].slice(0, 4))} label={files.length ? 'Add another angle' : 'Drop dress photos'} />}
      <input placeholder="Notes (optional): e.g. red banarasi saree, gold border" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <label className="check">
        <input type="checkbox" checked={keepFace} onChange={(e) => setKeepFace(e.target.checked)} />
        Keep the exact face
      </label>
      <button type="button" className="btn primary" onClick={run} disabled={busy || !files.length || !status?.enabled}>
        {busy ? (
          <>
            <Spinner /> Dressing the model…
          </>
        ) : (
          <>
            <Icon name="hanger" size={16} /> Generate look
          </>
        )}
      </button>
      {warning && <div className="alert warn">{warning}</div>}
      <AiOff status={status} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk: many dresses → many looks
// ---------------------------------------------------------------------------
const GROUP_OPTS = [
  ['full', 'Full outfit (dress, saree, lehenga, suit set)'],
  ['tops', 'Top / kurti'],
  ['bottoms', 'Bottom'],
];

export function BulkCreate({ status, cats, bodies = [], onClose, onCreated }) {
  const [jobs, setJobs] = useState([]);
  const [body, setBody] = useState(bodies[0]?.key || 'women');
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const patch = (id, p) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const addFiles = (files) =>
    setJobs((js) => [
      ...js,
      ...files.map((f) => ({
        id: key(),
        files: [f],
        name: nameFromFile(f),
        category: cats[0]?.key || '',
        group: 'full',
        price: '',
        notes: '',
        status: 'idle',
      })),
    ]);

  const generate = async (list) => {
    setRunning(true);
    await runQueue(
      list,
      async (job) => {
        patch(job.id, { status: 'running', error: '' });
        try {
          const r = await aiLook(job.files, { notes: [job.name, job.notes].filter(Boolean).join('. '), body });
          patch(job.id, { status: 'done', result: r });
        } catch (e) {
          patch(job.id, { status: 'error', error: e.message });
        }
      },
      2
    );
    setRunning(false);
  };

  const done = jobs.filter((j) => j.status === 'done');
  const save = async () => {
    if (done.some((j) => !j.name.trim())) return toast('Give every look a name', 'err');
    setSaving(true);
    const created = [];
    try {
      for (const j of done) {
        const piece = {
          name: j.name.trim(),
          color: '',
          price: Number(j.price) || 0,
          photo: j.result.photo?.url || '',
          photoPublicId: j.result.photo?.publicId || '',
          madeToOrder: true,
        };
        const doc = await api('/api/admin/looks', {
          method: 'POST',
          body: {
            name: j.name.trim(),
            category: j.category,
            body,
            image: j.result.url,
            imagePublicId: j.result.publicId,
            active: true,
            pieces: { tops: [], bottoms: [], full: [], shoes: [], acc: [], [j.group]: [piece] },
          },
        });
        created.push(doc);
        setJobs((js) => js.filter((x) => x.id !== j.id));
      }
      toast(`${created.length} look${created.length === 1 ? '' : 's'} added`);
      onCreated(created);
    } catch (e) {
      toast(e.message, 'err');
      if (created.length) onCreated(created, true);
    } finally {
      setSaving(false);
    }
  };

  const pending = jobs.filter((j) => j.status === 'idle' || j.status === 'error');
  return (
    <Modal
      wide
      title="Create looks from dresses"
      onClose={running || saving ? () => {} : onClose}
      footer={
        <>
          <span className="grow muted small">
            {jobs.length ? `${done.length} of ${jobs.length} ready` : 'Each photo becomes one look. Add extra angles to a dress with “+ angle”.'}
          </span>
          <button className="btn" onClick={onClose} disabled={running || saving}>
            Close
          </button>
          <button className="btn" onClick={() => generate(pending)} disabled={!pending.length || running || !status?.enabled}>
            {running ? <Spinner /> : <Icon name="details" size={16} />} Generate {pending.length || ''}
          </button>
          <button className="btn primary" onClick={save} disabled={!done.length || running || saving}>
            {saving ? <Spinner /> : `Save ${done.length || ''} look${done.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="stack">
        <AiOff status={status} />
        {bodies.length > 1 ? (
          <label className="field">
            <span className="field-label">Put the dresses on</span>
            <select value={body} onChange={(e) => setBody(e.target.value)} disabled={running || jobs.some((j) => j.status !== 'idle')}>
              {bodies.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <BaseModel status={status} />
        )}
        <PhotoDrop onFiles={addFiles} label="Drop dress photos here (multiple allowed) or click to choose" />

        <div className="bulk-grid">
          {jobs.map((j) => (
            <article key={j.id} className={'bulk-card card ' + j.status}>
              <div className="bulk-media">
                <div className="bulk-src">
                  {j.files.map((f, i) => (
                    <Thumb
                      key={i}
                      file={f}
                      onRemove={j.files.length > 1 && j.status !== 'running' ? () => patch(j.id, { files: j.files.filter((_, k) => k !== i), status: 'idle' }) : undefined}
                    />
                  ))}
                  {j.files.length < 4 && j.status !== 'running' && (
                    <label className="ai-thumb add" title="Add another angle of this dress">
                      <Icon name="plus" size={16} />
                      <input
                        type="file"
                        accept={ACCEPT}
                        multiple
                        hidden
                        onChange={(e) => {
                          patch(j.id, { files: [...j.files, ...e.target.files].slice(0, 4), status: 'idle' });
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
                <div className="bulk-out">
                  {j.status === 'done' ? (
                    <img src={imgUrl(j.result.url, 400)} alt="" />
                  ) : j.status === 'running' ? (
                    <span>
                      <Spinner size={22} />
                      <small>Dressing the model…</small>
                    </span>
                  ) : (
                    <span>
                      <Icon name="hanger" size={26} />
                      <small>{j.status === 'error' ? 'Failed' : 'Not generated'}</small>
                    </span>
                  )}
                </div>
              </div>
              {j.error && <div className="err small">{j.error}</div>}
              {j.result?.warning && <div className="alert warn small">{j.result.warning}</div>}
              <input placeholder="Look name" value={j.name} onChange={(e) => patch(j.id, { name: e.target.value })} />
              <div className="row2">
                <select value={j.category} onChange={(e) => patch(j.id, { category: e.target.value })} aria-label="Category">
                  {cats.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <span className="price">
                  <i>₹</i>
                  <input type="number" min="0" placeholder="Price" value={j.price} onChange={(e) => patch(j.id, { price: e.target.value })} aria-label="Price" />
                </span>
              </div>
              <select value={j.group} onChange={(e) => patch(j.id, { group: e.target.value })} aria-label="Shop as">
                {GROUP_OPTS.map(([k, l]) => (
                  <option key={k} value={k}>
                    Shop as: {l}
                  </option>
                ))}
              </select>
              <input placeholder="Notes for the AI (optional)" value={j.notes} onChange={(e) => patch(j.id, { notes: e.target.value, status: j.status === 'done' ? 'done' : j.status })} />
              <div className="bulk-actions">
                <button className="btn sm" onClick={() => generate([j])} disabled={running || j.status === 'running' || !status?.enabled}>
                  <Icon name="randomize" size={14} /> {j.status === 'done' ? 'Regenerate' : 'Generate'}
                </button>
                <button className="icon-btn danger" onClick={() => setJobs((js) => js.filter((x) => x.id !== j.id))} disabled={j.status === 'running'} aria-label="Remove">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Look editor: mix & match items for the fitting room
// ---------------------------------------------------------------------------
const GROUPS = ['tops', 'bottoms', 'full', 'shoes', 'acc'];

/** Stacked preview: look + chosen layers, exactly as the website draws them. */
export function LayerStack({ image, layers, width = 220 }) {
  return (
    <div className="layer-stack" style={{ width }}>
      {image && <img src={imgUrl(image, 600)} alt="" />}
      {layers.map((l) => (
        <img key={l} src={imgUrl(l, 600)} alt="" />
      ))}
    </div>
  );
}

export function FittingItems({ status, form, setForm, makePiece }) {
  const [slot, setSlot] = useState('jewellery');
  const [preview, setPreview] = useState(() => new Set());
  const [busy, setBusy] = useState({}); // _k → 'running' | error string
  const toast = useToast();
  const slots = status?.slots || [];
  const slotLabel = (k) => slots.find((s) => s.key === k)?.label.split(' (')[0] || k;

  // every piece that lives in the fitting room, wherever its shop group is
  const items = GROUPS.flatMap((g) => form.pieces[g].map((p) => ({ p, g }))).filter(({ p }) => p.slot || p.layer);

  const update = (k, patch) =>
    setForm((f) => {
      const pieces = { ...f.pieces };
      let moved = null;
      for (const g of GROUPS) {
        pieces[g] = pieces[g].flatMap((p) => {
          if (p._k !== k) return [p];
          const next = { ...p, ...patch };
          const target = patch.slot ? SLOT_GROUP[patch.slot] : g;
          if (target !== g) {
            moved = [target, next];
            return [];
          }
          return [next];
        });
      }
      if (moved) pieces[moved[0]] = [...pieces[moved[0]], moved[1]];
      return { ...f, pieces };
    });
  const remove = (k) =>
    setForm((f) => ({ ...f, pieces: Object.fromEntries(GROUPS.map((g) => [g, f.pieces[g].filter((p) => p._k !== k)])) }));

  const generate = async (piece, files) => {
    if (!form.image) return toast('Add the look image first', 'err');
    setBusy((b) => ({ ...b, [piece._k]: 'running' }));
    try {
      const r = await aiLayer({
        files,
        photoUrl: files?.length ? undefined : piece.photo,
        lookImage: form.image,
        slot: piece.slot,
        name: piece.name,
      });
      update(piece._k, {
        layer: r.layer.url,
        layerPublicId: r.layer.publicId,
        ...(r.photo ? { photo: r.photo.url, photoPublicId: r.photo.publicId } : {}),
      });
      setPreview((s) => new Set(s).add(piece._k));
      setBusy((b) => ({ ...b, [piece._k]: r.warning ? `⚠ ${r.warning}` : '' }));
    } catch (e) {
      setBusy((b) => ({ ...b, [piece._k]: e.message }));
    }
  };

  const addFiles = async (files) => {
    if (!form.image) return toast('Add or generate the look image first', 'err');
    const created = files.map((file) => ({ file, piece: { ...makePiece(SLOT_GROUP[slot]), _k: key(), name: nameFromFile(file) || slotLabel(slot), slot, defaultOn: false, layer: '', photo: '' } }));
    setForm((f) => {
      const pieces = { ...f.pieces };
      for (const { piece } of created) pieces[SLOT_GROUP[slot]] = [...pieces[SLOT_GROUP[slot]], piece];
      return { ...f, pieces };
    });
    await runQueue(created, ({ file, piece }) => generate(piece, [file]), 2);
  };

  const regenerateAll = () => runQueue(items.filter(({ p }) => p.photo).map(({ p }) => p), (p) => generate(p), 2);

  const shown = items.filter(({ p }) => p.layer && preview.has(p._k)).map(({ p }) => p.layer);

  return (
    <div className="piece-group fit-items">
      <div className="piece-head">
        <span>
          Fitting room items <small>· {items.length}</small>
        </span>
        {items.some(({ p }) => p.photo) && (
          <button type="button" className="btn sm" onClick={regenerateAll} disabled={!status?.enabled}>
            <Icon name="randomize" size={14} /> Regenerate all
          </button>
        )}
      </div>
      <small className="hint">
        Shoes, bags, dupattas, jewellery, tops… that customers can show, hide or swap on this look. Upload product photos: the AI places each item on the model as a
        separate layer. Items of the same type replace each other on the website.
      </small>

      <div className="fit-add">
        <select value={slot} onChange={(e) => setSlot(e.target.value)} aria-label="Item type">
          {slots.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <PhotoDrop small onFiles={addFiles} label="Drop item photos (multiple allowed)" />
      </div>
      <AiOff status={status} />

      {items.length > 0 && (
        <div className="fit-body">
          <LayerStack image={form.image} layers={shown} width={170} />
          <div className="fit-list">
            {items.map(({ p, g }) => {
              const state = busy[p._k];
              return (
                <div key={p._k} className="fit-row">
                  <button
                    type="button"
                    className={'fit-photo' + (preview.has(p._k) ? ' on' : '')}
                    onClick={() =>
                      setPreview((s) => {
                        const n = new Set(s);
                        n.has(p._k) ? n.delete(p._k) : n.add(p._k);
                        return n;
                      })
                    }
                    disabled={!p.layer}
                    title={p.layer ? 'Preview on the model' : 'No layer yet'}
                  >
                    {p.photo ? <img src={imgUrl(p.photo, 120)} alt="" /> : <Icon name="image" size={18} />}
                    {state === 'running' && (
                      <span className="fit-busy">
                        <Spinner size={16} />
                      </span>
                    )}
                    {p.layer && <i className="eye">{preview.has(p._k) ? <Icon name="eye" size={12} /> : <Icon name="eyeOff" size={12} />}</i>}
                  </button>
                  <div className="fit-fields">
                    <input value={p.name} onChange={(e) => update(p._k, { name: e.target.value })} placeholder="Item name" aria-label="Item name" />
                    <div className="fit-line">
                      <select value={p.slot || ''} onChange={(e) => update(p._k, { slot: e.target.value })} aria-label="Item type">
                        {slots.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label.split(' (')[0]}
                          </option>
                        ))}
                      </select>
                      <span className="price">
                        <i>₹</i>
                        <input type="number" min="0" value={p.price} onChange={(e) => update(p._k, { price: e.target.value })} aria-label="Price" />
                      </span>
                    </div>
                    <div className="fit-line">
                      <label className="check">
                        <input type="checkbox" checked={!!p.defaultOn} onChange={(e) => update(p._k, { defaultOn: e.target.checked })} />
                        Worn by default
                      </label>
                      <small className="muted">shop: {g}</small>
                    </div>
                    {state && state !== 'running' && <small className={state.startsWith('⚠') ? 'warn-text' : 'err'}>{state}</small>}
                    {!p.layer && state !== 'running' && !state && <small className="warn-text">No layer yet: generate or upload one.</small>}
                  </div>
                  <div className="fit-actions">
                    <label className="icon-btn" title="New photo → regenerate">
                      <Icon name="upload" size={16} />
                      <input
                        type="file"
                        accept={ACCEPT}
                        hidden
                        onChange={(e) => {
                          const f = [...e.target.files];
                          e.target.value = '';
                          if (f.length) generate(p, f);
                        }}
                      />
                    </label>
                    <button type="button" className="icon-btn" title="Regenerate layer" onClick={() => generate(p)} disabled={!p.photo || state === 'running' || !status?.enabled}>
                      <Icon name="randomize" size={16} />
                    </button>
                    <OwnLayer onDone={(r) => update(p._k, { layer: r.url, layerPublicId: r.publicId })} />
                    <button type="button" className="icon-btn danger" title="Remove item" onClick={() => remove(p._k)} disabled={state === 'running'}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Manual fallback: upload a ready-made 1360×2048 transparent layer. */
function OwnLayer({ onDone }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <label className="icon-btn" title="Upload your own layer (transparent PNG, 1360 × 2048, same position as the look)">
      {busy ? <Spinner size={14} /> : <Icon name="image" size={16} />}
      <input
        type="file"
        accept="image/png,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const f = new FormData();
            f.append('file', file);
            const r = await api('/api/upload?folder=layers', { method: 'POST', form: f });
            if (r.width !== 1360 || r.height !== 2048) toast(`Layer is ${r.width} × ${r.height}; 1360 × 2048 keeps it aligned`, 'err');
            onDone(r);
          } catch (err) {
            toast(err.message, 'err');
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

