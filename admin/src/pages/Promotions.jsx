import { useEffect, useRef, useState } from 'react';
import { api, imgUrl, uploadMedia } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Field, Modal, Spinner, useToast } from '../components/ui.jsx';

/**
 * Promotions shown on the website:
 *  - announcement bar: messages scrolling right → left above the header of every page
 *  - shop banners: a sliding carousel above the items in the shop
 *  - offer popups: image / GIF / video with "Skip" and "Show more". Skipped → shown again on the next
 *    visit; "Show more" (or a video watched to the end) → never shown to that visitor again.
 */
const TABS = [
  ['announcement', 'Announcement bar', 'megaphone'],
  ['banner', 'Shop banners', 'image'],
  ['popup', 'Offer popups', 'play'],
];
const BLANK = {
  announcement: { kind: 'announcement', text: '', link: '', active: true, startsAt: '', endsAt: '' },
  banner: { kind: 'banner', title: '', text: '', media: '', mediaPublicId: '', mobileMedia: '', mobileMediaPublicId: '', link: '/shop', buttonText: 'Shop now', textColor: '#ffffff', align: 'left', active: true, startsAt: '', endsAt: '' },
  popup: { kind: 'popup', title: '', text: '', media: '', mediaPublicId: '', mediaType: 'image', link: '', buttonText: 'Show more', autoClose: 10, delay: 2, active: true, startsAt: '', endsAt: '' },
};
const PROMO_DEFAULTS = { barBg: '#b0154a', barColor: '#ffffff', barSpeed: 40, bannerInterval: 5 };

// <input type="datetime-local"> works in local time
const toLocal = (d) => {
  if (!d) return '';
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const state = (p) => {
  const now = Date.now();
  if (!p.active) return ['Off', ''];
  if (p.startsAt && new Date(p.startsAt) > now) return [`Starts ${when(p.startsAt)}`, 'warn'];
  if (p.endsAt && new Date(p.endsAt) < now) return ['Ended', ''];
  return ['Live', 'ok'];
};
const isVideoUrl = (u) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || /\/video\/upload\//.test(u);
const thumb = (p) => (p.mediaType === 'video' ? '' : imgUrl(p.media, 240));

export default function Promotions() {
  const [tab, setTab] = useState('announcement');
  const [list, setList] = useState(null);
  const [look, setLook] = useState(null); // settings.promo
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    api('/api/admin/promos').then(setList).catch((e) => toast(e.message, 'err'));
    api('/api/admin/settings')
      .then((s) => setLook({ ...PROMO_DEFAULTS, ...(s.promo || {}) }))
      .catch(() => setLook({ ...PROMO_DEFAULTS }));
  }, [toast]);

  const rows = (list || []).filter((p) => p.kind === tab);
  const live = (k) => (list || []).filter((p) => p.kind === k && state(p)[1] === 'ok').length;

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const body = { ...edit, startsAt: fromLocal(edit.startsAt), endsAt: fromLocal(edit.endsAt) };
      for (const k of ['_id', 'createdAt', 'updatedAt', 'order']) delete body[k];
      if (edit._id) delete body.kind;
      const doc = await api(edit._id ? `/api/admin/promos/${edit._id}` : '/api/admin/promos', { method: edit._id ? 'PUT' : 'POST', body });
      setList((s) => (edit._id ? s.map((x) => (x._id === doc._id ? doc : x)) : [...s, doc]));
      setEdit(null);
      toast('Saved — the website shows it within a minute');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const patch = async (p, body) => {
    try {
      const doc = await api(`/api/admin/promos/${p._id}`, { method: 'PUT', body });
      setList((s) => s.map((x) => (x._id === doc._id ? doc : x)));
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const remove = async (p) => {
    if (!window.confirm('Delete this for good?')) return;
    try {
      await api(`/api/admin/promos/${p._id}`, { method: 'DELETE' });
      setList((s) => s.filter((x) => x._id !== p._id));
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const move = async (i, d) => {
    const ids = rows.map((p) => p._id);
    if (i + d < 0 || i + d >= ids.length) return;
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try {
      setList(await api('/api/admin/promos/reorder', { method: 'PUT', body: { ids } }));
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const saveLook = async (next) => {
    try {
      const s = await api('/api/admin/settings', { method: 'PUT', body: { promo: next } });
      setLook({ ...PROMO_DEFAULTS, ...(s.promo || {}) });
      toast('Saved');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const label = { announcement: 'New announcement', banner: 'New banner', popup: 'New popup' }[tab];

  return (
    <>
      <PageHead title="Promotions" sub="Offer announcements, shop banners and popups on the website. Each one can be scheduled and switched off any time.">
        <button className="btn primary" onClick={() => setEdit({ ...BLANK[tab] })}>
          <Icon name="plus" size={18} /> {label}
        </button>
      </PageHead>

      <div className="promo-tabs" role="tablist">
        {TABS.map(([k, l, icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <Icon name={icon} size={17} /> {l}
            {list && <span className="promo-count">{live(k)} live</span>}
          </button>
        ))}
      </div>

      {tab === 'announcement' && look && <BarStyle look={look} messages={rows.filter((p) => state(p)[1] === 'ok')} onSave={saveLook} />}
      {tab === 'banner' && look && (
        <div className="card pad promo-setting">
          <Field label="Seconds per banner" hint="Banners slide from right to left; they pause while the visitor's pointer is on them.">
            <div className="promo-inline">
              <input type="number" min="2" max="30" value={look.bannerInterval} onChange={(e) => setLook((l) => ({ ...l, bannerInterval: Number(e.target.value) }))} />
              <button className="btn" onClick={() => saveLook({ bannerInterval: look.bannerInterval })}>
                Save
              </button>
            </div>
          </Field>
        </div>
      )}
      {tab === 'popup' && (
        <p className="muted promo-note">
          Only one popup shows at a time (the first live one in this list the visitor has not opened yet). <b>Skip</b>, or letting it close by itself, shows it again on their next visit. <b>Show more</b>, or watching a video to the end, hides it from them for good. To show a new offer to everyone again, add a new popup.
        </p>
      )}

      {!list ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : !rows.length ? (
        <Empty icon={TABS.find((t) => t[0] === tab)[2]} title="Nothing here yet">
          <p>
            {tab === 'announcement'
              ? 'Add a message like “Flat 20% off on all kurtis · code SILK20”.'
              : tab === 'banner'
                ? 'Add a wide image (about 1600 × 500) for the top of the shop.'
                : 'Add an image, GIF or short video that pops up for an offer.'}
          </p>
        </Empty>
      ) : (
        <div className="list card">
          {rows.map((p, i) => {
            const [st, cls] = state(p);
            return (
              <div key={p._id} className={'list-row' + (p.active ? '' : ' promo-off')}>
                <div className="list-main">
                  {p.kind !== 'announcement' && (
                    <span className={'promo-thumb ' + p.kind}>
                      {p.media ? p.mediaType === 'video' ? <Icon name="play" size={22} /> : <img src={thumb(p)} alt="" /> : <Icon name="image" size={20} />}
                    </span>
                  )}
                  <div>
                    <b>{p.kind === 'announcement' ? p.text : p.title || p.text || (p.mediaType === 'video' ? 'Video popup' : 'Image popup')}</b>
                    <small>
                      {p.kind === 'popup' && `${p.mediaType === 'video' ? 'Video' : 'Image / GIF'} · ${p.autoClose ? `closes after ${p.autoClose}s` : 'stays until closed'} · `}
                      {p.link ? `→ ${p.link}` : 'no link'}
                      {p.endsAt ? ` · until ${when(p.endsAt)}` : ''}
                    </small>
                  </div>
                </div>
                <div className="list-actions">
                  <span className={'status-pill ' + cls}>{st}</span>
                  <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <Icon name="up" size={17} />
                  </button>
                  <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down">
                    <Icon name="down" size={17} />
                  </button>
                  <label className="switch" title={p.active ? 'Switch off' : 'Switch on'}>
                    <input type="checkbox" checked={p.active} onChange={(e) => patch(p, { active: e.target.checked })} />
                    <span />
                  </label>
                  <button className="btn sm" onClick={() => setEdit({ ...p, startsAt: toLocal(p.startsAt), endsAt: toLocal(p.endsAt) })}>
                    <Icon name="pencil" size={15} /> Edit
                  </button>
                  <button className="icon-btn danger" onClick={() => remove(p)} aria-label="Delete">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {edit && (
        <PromoEditor
          edit={edit}
          setEdit={setEdit}
          look={look || PROMO_DEFAULTS}
          busy={busy}
          error={error}
          onSave={save}
          onClose={() => {
            setEdit(null);
            setError('');
          }}
        />
      )}
    </>
  );
}

/** Colours and speed of the announcement bar, with a live preview. */
function BarStyle({ look, messages, onSave }) {
  const [v, setV] = useState(look);
  useEffect(() => setV(look), [look]);
  const dirty = ['barBg', 'barColor', 'barSpeed'].some((k) => v[k] !== look[k]);
  return (
    <div className="card pad promo-setting">
      <BarPreview texts={messages.length ? messages.map((m) => m.text) : ['Your announcement shows here', 'Add one with “New announcement”']} bg={v.barBg} color={v.barColor} speed={v.barSpeed} />
      <div className="row3">
        <Field label="Background">
          <span className="promo-color">
            <input type="color" value={v.barBg} onChange={(e) => setV((x) => ({ ...x, barBg: e.target.value }))} />
            <code>{v.barBg}</code>
          </span>
        </Field>
        <Field label="Text colour">
          <span className="promo-color">
            <input type="color" value={v.barColor} onChange={(e) => setV((x) => ({ ...x, barColor: e.target.value }))} />
            <code>{v.barColor}</code>
          </span>
        </Field>
        <Field label={`Speed · ${v.barSpeed}`} hint="Slower ← → faster">
          <input type="range" min="15" max="120" value={v.barSpeed} onChange={(e) => setV((x) => ({ ...x, barSpeed: Number(e.target.value) }))} />
        </Field>
      </div>
      {dirty && (
        <div className="promo-inline end">
          <button className="btn" onClick={() => setV(look)}>
            Undo
          </button>
          <button className="btn primary" onClick={() => onSave({ barBg: v.barBg, barColor: v.barColor, barSpeed: v.barSpeed })}>
            Save bar style
          </button>
        </div>
      )}
    </div>
  );
}

/** Same right → left marquee as the website. */
function BarPreview({ texts, bg, color, speed }) {
  const track = useRef(null);
  const [dur, setDur] = useState(20);
  useEffect(() => {
    const w = track.current ? track.current.scrollWidth / 2 : 600;
    setDur(Math.max(4, w / (speed || 40)));
  }, [texts.join('|'), speed]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = (
    <>
      {texts.map((t, i) => (
        <span key={i} className="pbar-item">
          {t}
          <i aria-hidden="true">✦</i>
        </span>
      ))}
    </>
  );
  return (
    <div className="pbar" style={{ background: bg, color }}>
      <div className="pbar-track" ref={track} style={{ animationDuration: `${dur}s` }}>
        <div className="pbar-run">{run}</div>
        <div className="pbar-run" aria-hidden="true">
          {run}
        </div>
      </div>
    </div>
  );
}

function PromoEditor({ edit, setEdit, look, busy, error, onSave, onClose }) {
  const set = (k) => (e) =>
    setEdit((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value }));
  const k = edit.kind;
  const title = `${edit._id ? 'Edit' : 'New'} ${k === 'announcement' ? 'announcement' : k === 'banner' ? 'banner' : 'popup'}`;

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide={k !== 'announcement'}
      footer={
        <>
          {error && <span className="err grow">{error}</span>}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={onSave} disabled={busy}>
            {busy ? <Spinner /> : 'Save'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {k === 'announcement' && (
          <>
            <Field label="Message" hint="Short and clear. Emojis work too, e.g. 🎉 Free shipping above ₹1,999">
              <input value={edit.text} maxLength={240} onChange={set('text')} placeholder="Flat 20% off on all kurtis · use code SILK20" autoFocus />
            </Field>
            <LinkField value={edit.link} onChange={set('link')} />
            <BarPreview texts={[edit.text || 'Your message']} bg={look.barBg} color={look.barColor} speed={look.barSpeed} />
          </>
        )}

        {k === 'banner' && (
          <>
            <div className="promo-two">
              <Field label="Banner image or GIF" hint="Wide, about 1600 × 500. Keep text in the image away from the edges.">
                <MediaUpload value={edit.media} type="image" imageOnly onChange={(m) => setEdit((x) => ({ ...x, media: m.url, mediaPublicId: m.publicId || '' }))} />
              </Field>
              <Field label="Phone image (optional)" hint="Taller, about 900 × 900. Without it the wide image is cropped.">
                <MediaUpload value={edit.mobileMedia} type="image" imageOnly small onChange={(m) => setEdit((x) => ({ ...x, mobileMedia: m.url, mobileMediaPublicId: m.publicId || '' }))} />
              </Field>
            </div>
            <div className="row2">
              <Field label="Heading (optional)" hint="Leave empty if the image already has text">
                <input value={edit.title} maxLength={120} onChange={set('title')} placeholder="Festive Edit" />
              </Field>
              <Field label="Sub-line (optional)">
                <input value={edit.text} maxLength={240} onChange={set('text')} placeholder="Up to 40% off sarees & lehengas" />
              </Field>
            </div>
            <div className="row3">
              <Field label="Button text" hint="Empty = whole banner is the link">
                <input value={edit.buttonText} maxLength={40} onChange={set('buttonText')} />
              </Field>
              <Field label="Text position">
                <select value={edit.align} onChange={set('align')}>
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                </select>
              </Field>
              <Field label="Text colour">
                <span className="promo-color">
                  <input type="color" value={edit.textColor} onChange={set('textColor')} />
                  <code>{edit.textColor}</code>
                </span>
              </Field>
            </div>
            <LinkField value={edit.link} onChange={set('link')} />
            {edit.media && <BannerPreview b={edit} />}
          </>
        )}

        {k === 'popup' && (
          <>
            <div className="promo-two">
              <Field label="Image, GIF or video" hint="Video: MP4 or WebM, up to ~30 s and 60 MB. It plays muted; visitors can turn the sound on.">
                <MediaUpload
                  value={edit.media}
                  type={edit.mediaType}
                  onChange={(m) => setEdit((x) => ({ ...x, media: m.url, mediaPublicId: m.publicId || '', mediaType: m.type || 'image' }))}
                />
              </Field>
              <div className="form-grid">
                <Field label="Title (optional)">
                  <input value={edit.title} maxLength={120} onChange={set('title')} placeholder="Diwali sale is live" />
                </Field>
                <Field label="Message (optional)">
                  <textarea rows={3} value={edit.text} maxLength={600} onChange={set('text')} placeholder="Extra 15% off with code DIWALI15 till Sunday." />
                </Field>
                <div className="row2">
                  <Field label="Button text">
                    <input value={edit.buttonText} maxLength={40} onChange={set('buttonText')} placeholder="Show more" />
                  </Field>
                  <LinkField value={edit.link} onChange={set('link')} short />
                </div>
              </div>
            </div>
            <div className="row2">
              <Field label="Closes by itself after" hint="Counts down on the popup; pauses while the pointer is on it">
                <div className="seg">
                  {[
                    [10, '10 s'],
                    [15, '15 s'],
                    [20, '20 s'],
                    [30, '30 s'],
                    [0, 'Never'],
                  ].map(([v, l]) => (
                    <button key={v} type="button" className={edit.autoClose === v ? 'on' : ''} onClick={() => setEdit((x) => ({ ...x, autoClose: v }))}>
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Show after (seconds on the page)">
                <input type="number" min="0" max="120" value={edit.delay} onChange={set('delay')} />
              </Field>
            </div>
          </>
        )}

        <div className="row2">
          <Field label="Starts" hint="Empty = now">
            <input type="datetime-local" value={edit.startsAt || ''} onChange={set('startsAt')} />
          </Field>
          <Field label="Ends" hint="Empty = until you switch it off">
            <input type="datetime-local" value={edit.endsAt || ''} onChange={set('endsAt')} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={edit.active} onChange={set('active')} /> Show on the website
        </label>
      </div>
    </Modal>
  );
}

function LinkField({ value, onChange, short }) {
  return (
    <Field label="Link (optional)" hint={short ? '/shop, /product/… or https://…' : 'A page of this site like /shop or /pages/shipping, a product link, or https://…'}>
      <input value={value || ''} onChange={onChange} placeholder="/shop" />
    </Field>
  );
}

function BannerPreview({ b }) {
  return (
    <div className={'bn-prev align-' + b.align} style={{ color: b.textColor }}>
      <img src={imgUrl(b.media, 1200)} alt="" />
      {(b.title || b.text || b.buttonText) && (
        <div className="bn-copy">
          {b.title && <h3>{b.title}</h3>}
          {b.text && <p>{b.text}</p>}
          {b.buttonText && <span className="bn-btn">{b.buttonText}</span>}
        </div>
      )}
    </div>
  );
}

/** Upload an image / GIF / video straight to Cloudinary (with progress), or paste a URL. */
function MediaUpload({ value, type, imageOnly, small, onChange }) {
  const input = useRef(null);
  const [pct, setPct] = useState(null);
  const [drag, setDrag] = useState(false);
  const toast = useToast();

  const upload = async (file) => {
    if (!file) return;
    const video = file.type.startsWith('video/');
    if (imageOnly && video) return toast('Please use an image or GIF here', 'err');
    if (!video && !file.type.startsWith('image/')) return toast('Please choose an image, GIF or video', 'err');
    if (file.size > (video ? 60 : 15) * 1024 * 1024) return toast(video ? 'Video is too big (max 60 MB)' : 'Image is too big (max 15 MB)', 'err');
    setPct(0);
    try {
      const r = await uploadMedia(file, 'promos', setPct);
      onChange(r);
      toast('Uploaded');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setPct(null);
    }
  };

  return (
    <div className="uploader">
      <div
        className={'drop promo-drop' + (small ? ' small' : '') + (drag ? ' drag' : '')}
        onClick={() => input.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files[0]);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
      >
        {value ? (
          type === 'video' ? (
            <video src={value} muted loop autoPlay playsInline />
          ) : (
            <img src={imgUrl(value, 800)} alt="" />
          )
        ) : (
          <span className="drop-empty">
            <Icon name="upload" size={26} />
            {imageOnly ? 'Drop an image or GIF, or click' : 'Drop an image, GIF or video, or click'}
          </span>
        )}
        {pct !== null && (
          <span className="drop-busy">
            <Spinner size={26} />
            <b>{pct}%</b>
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={imageOnly ? 'image/png,image/jpeg,image/webp,image/avif,image/gif' : 'image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime'}
        hidden
        onChange={(e) => {
          upload(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <input
        className="url-input"
        placeholder={imageOnly ? '…or paste an image URL' : '…or paste an image / video URL'}
        value={value || ''}
        onChange={(e) => {
          const url = e.target.value.trim();
          onChange({ url, publicId: '', type: !imageOnly && isVideoUrl(url) ? 'video' : 'image' });
        }}
      />
    </div>
  );
}
