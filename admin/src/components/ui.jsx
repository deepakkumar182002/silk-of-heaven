import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './icons.jsx';
import { api, imgUrl, uploadImage } from '../api.js';

/* ---------------- Toasts ---------------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setItems((s) => [...s, { id, msg, type }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={'toast ' + t.type}>
            <Icon name={t.type === 'ok' ? 'check' : 'x'} size={16} stroke={2.2} />
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------------- Modal ---------------- */
export function Modal({ title, onClose, children, footer, wide }) {
  const back = useRef(null);
  useEffect(() => {
    // Escape closes only the top-most dialog (dialogs can open on top of each other)
    const k = (e) => {
      const all = document.querySelectorAll('.modal-back');
      if (e.key === 'Escape' && all[all.length - 1] === back.current) onClose();
    };
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      if (document.querySelectorAll('.modal-back').length <= 1) document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div ref={back} className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------------- Form bits ---------------- */
export function Field({ label, hint, children, error }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && <small className="err">{error}</small>}
    </label>
  );
}

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function Empty({ icon = 'image', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** Editable list of strings shown as chips. */
export function TagInput({ value, onChange, placeholder = 'Type and press Enter', max }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v || value.includes(v) || (max && value.length >= max)) return;
    onChange([...value, v]);
    setText('');
  };
  return (
    <div className="tags">
      {value.map((t, i) => (
        <span key={t} className="tag">
          {t}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${t}`}>
            <Icon name="x" size={12} stroke={2.4} />
          </button>
        </span>
      ))}
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

/** Upload to Cloudinary via the API, or paste a URL. */
export function ImageUpload({ value, onChange, folder, previewClass = '', hint }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const toast = useToast();

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadImage(file, folder);
      onChange({ url: r.url, publicId: r.publicId, width: r.width, height: r.height });
      toast('Image uploaded');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uploader">
      <div
        className={'drop ' + previewClass + (drag ? ' drag' : '')}
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
          <img src={imgUrl(value, 600)} alt="" />
        ) : (
          <span className="drop-empty">
            <Icon name="upload" size={26} />
            Drop an image or click to upload
          </span>
        )}
        {busy && (
          <span className="drop-busy">
            <Spinner size={26} />
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/webp,image/jpeg,image/avif"
        hidden
        onChange={(e) => {
          upload(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <input
        className="url-input"
        placeholder="…or paste an image URL"
        value={value || ''}
        onChange={(e) => onChange({ url: e.target.value.trim(), publicId: '' })}
      />
      {hint && <small className="hint">{hint}</small>}
    </div>
  );
}

export function useConfirm() {
  return (msg) => window.confirm(msg);
}

/** Several product photos: upload many at once, reorder, remove. value: [{ url, publicId }] */
export function PhotoList({ value = [], onChange, folder = 'products', max = 8, hint }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(0);
  const toast = useToast();
  const list = Array.isArray(value) ? value : [];
  const add = async (files) => {
    const picked = [...files].slice(0, Math.max(0, max - list.length));
    if (!picked.length) return toast(`Up to ${max} photos`, 'err');
    setBusy(picked.length);
    let next = [...list];
    for (const f of picked) {
      try {
        const r = await uploadImage(f, folder);
        next = [...next, { url: r.url, publicId: r.publicId }];
        onChange(next);
      } catch (e) {
        toast(e.message, 'err');
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };
  const move = (i, d) => {
    const n = [...list];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    onChange(n);
  };
  return (
    <div className="field photo-list">
      <span className="field-label">
        Product photos <small className="hint">{list.length}/{max}</small>
      </span>
      <div className="pl-grid">
        {list.map((p, i) => (
          <div key={p.url} className="pl-item">
            <img src={imgUrl(p.url, 240)} alt={`Photo ${i + 1}`} />
            <div className="pl-acts">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">
                <Icon name="chev" size={14} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove photo">
                <Icon name="trash" size={14} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move right">
                <Icon name="chev" size={14} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            </div>
          </div>
        ))}
        {busy > 0 && (
          <div className="pl-item pl-busy">
            <Spinner size={22} />
          </div>
        )}
        {list.length < max && (
          <button type="button" className="pl-add" onClick={() => input.current.click()}>
            <Icon name="upload" size={20} />
            Add photos
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/webp,image/jpeg,image/avif" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      <small className="hint">{hint || 'Shown as a swipeable gallery on the product page. The first one is the main photo.'}</small>
    </div>
  );
}

/**
 * For model images made outside (Gemini, ChatGPT…) on a plain green background: removes the background and
 * places the person like the original model (same head / feet lines, centred). heightRatio < 1 for children.
 */
export function CutoutFit({ url, heightRatio = 1, folder = 'looks', onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const toast = useToast();
  if (!url) return null;
  const run = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await api('/api/admin/ai/cutout', { method: 'POST', body: { url, heightRatio, folder } });
      onDone({ url: r.url, publicId: r.publicId, width: r.width, height: r.height });
      setMsg(r.keyed ? 'Background removed and placed like the other models.' : 'Already transparent: placed like the other models.');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cutout-fit">
      <button type="button" className="btn sm" onClick={run} disabled={busy}>
        {busy ? <Spinner size={14} /> : <Icon name="image" size={15} />} Remove green background &amp; fit to frame
      </button>
      <small className="hint">{msg || 'For images made in Gemini / ChatGPT on a plain bright green background. Makes a 1360 × 2048 transparent cut-out.'}</small>
    </div>
  );
}
