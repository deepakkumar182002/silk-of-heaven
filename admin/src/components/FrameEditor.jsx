import { useEffect, useRef, useState } from 'react';
import { api, imgUrl } from '../api.js';
import Icon from './icons.jsx';
import { Modal, Spinner, useToast } from './ui.jsx';

/**
 * Zoom and move a model image inside the 1360 × 2048 frame, then save it cropped.
 * Guides: centre line, head line and feet line of the original model; the reference model can be shown on top.
 * The preview uses the same maths as the API (scale about the centre, then move by dx / dy canvas px).
 */
const W = 1360;
const H = 2048;
const FRAME = { top: 30, bottom: 2024, cx: 680 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function FrameEditor({ url, reference, heightRatio = 1, folder = 'looks', onDone }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(1);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [ghost, setGhost] = useState(0.35);
  const [busy, setBusy] = useState('');
  const stage = useRef(null);
  const box = useRef(null);
  const drag = useRef(null);
  const toast = useToast();
  // a new image starts untouched
  useEffect(() => {
    setS(1);
    setDx(0);
    setDy(0);
  }, [url]);
  if (!url) return null;

  const ratio = clamp(Number(heightRatio) || 1, 0.4, 1.05);
  const headY = FRAME.bottom - (FRAME.bottom - FRAME.top) * ratio;
  const changed = s !== 1 || dx !== 0 || dy !== 0;
  const reset = () => {
    setS(1);
    setDx(0);
    setDy(0);
  };
  const nudge = (x, y) => {
    setDx((v) => clamp(v + x, -W, W));
    setDy((v) => clamp(v + y, -H, H));
  };

  // place the person: feet on the line, centred; fit = also scale to the model height
  const centre = async (fit) => {
    setBusy(fit ? 'fit' : 'centre');
    try {
      const { box } = await api('/api/admin/ai/person-box', {
        method: 'POST',
        body: { url },
      });
      if (!box) throw new Error('No person found on this image');
      const ns = fit ? clamp(((FRAME.bottom - FRAME.top) * ratio) / box.h, 0.3, 3) : s;
      const cx = box.x + box.w / 2;
      const bottom = box.y + box.h;
      setS(+ns.toFixed(4));
      setDx(Math.round(-(cx - W / 2) * ns + (FRAME.cx - W / 2)));
      setDy(Math.round(FRAME.bottom - H / 2 - (bottom - H / 2) * ns));
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      const r = await api('/api/admin/ai/frame', {
        method: 'POST',
        body: { url, scale: s, dx, dy, folder },
      });
      onDone({
        url: r.url,
        publicId: r.publicId,
        width: r.width,
        height: r.height,
      });
      reset();
      toast('Framing saved: the new image is in place. Save the form to keep it.');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy('');
    }
  };

  const onDown = (e) => {
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      dx,
      dy,
      w: stage.current.getBoundingClientRect().width,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const k = W / d.w; // screen px → canvas px
    setDx(Math.round(clamp(d.dx + (e.clientX - d.x) * k, -W, W)));
    setDy(Math.round(clamp(d.dy + (e.clientY - d.y) * k, -H, H)));
  };
  const onUp = () => (drag.current = null);
  const onKey = (e) => {
    const step = e.shiftKey ? 20 : 4;
    const map = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (map[e.key]) {
      e.preventDefault();
      nudge(...map[e.key]);
    }
    if (e.key === '+' || e.key === '=') setS((v) => clamp(+(v + 0.01).toFixed(2), 0.3, 3));
    if (e.key === '-') setS((v) => clamp(+(v - 0.01).toFixed(2), 0.3, 3));
  };

  const pct = (v, of) => `${(v / of) * 100}%`;
  return (
    <>
      <button type="button" className="btn sm fe-open" onClick={() => setOpen(true)}>
        <Icon name="pose" size={15} /> Adjust size &amp; position
      </button>
      {open && (
        <Modal
          wide
          title="Adjust size & position"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={reset} disabled={!changed || !!busy}>
                Reset
              </button>
              <span className="grow" />
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Close
              </button>
              <button type="button" className="btn primary" onClick={save} disabled={!changed || !!busy}>
                {busy === 'save' ? <Spinner size={14} /> : <Icon name="check" size={15} />} Save framing
              </button>
            </>
          }
        >
          <div className="fe" ref={box}>
            <div
              className="fe-stage"
              ref={stage}
              tabIndex={0}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={onKey}
              aria-label="Drag the model to move it; arrow keys move, + and - zoom"
            >
              <img
                className="fe-img"
                src={imgUrl(url, 1000)}
                alt=""
                draggable="false"
                style={{
                  transform: `translate(${pct(dx, W)}, ${pct(dy, H)}) scale(${s})`,
                }}
              />
              {reference && <img className="fe-ref" src={imgUrl(reference, 1000)} alt="" draggable="false" style={{ opacity: ghost }} />}
              <i className="fe-guide v" style={{ left: pct(FRAME.cx, W) }} />
              <i className="fe-guide h" style={{ top: pct(headY, H) }} title="Top of the head" />
              <i className="fe-guide h feet" style={{ top: pct(FRAME.bottom, H) }} title="Soles of the feet" />
            </div>
            <div className="fe-ctrl">
              <small className="hint">
                Drag the model, or use the controls. Arrow keys move it (Shift = faster), + and − change the size. Green lines: centre, top of the head
                {ratio < 1 ? ' (for this height)' : ''} and the feet.
              </small>

              <div className="fe-row">
                <span className="fe-lbl">Size</span>
                <button type="button" className="icon-btn" onClick={() => setS((v) => clamp(+(v - 0.01).toFixed(2), 0.3, 3))} aria-label="Smaller">
                  <Icon name="minus" size={15} />
                </button>
                <input type="range" min="0.3" max="2" step="0.005" value={s} onChange={(e) => setS(Number(e.target.value))} aria-label="Size" />
                <button type="button" className="icon-btn" onClick={() => setS((v) => clamp(+(v + 0.01).toFixed(2), 0.3, 3))} aria-label="Bigger">
                  <Icon name="plus" size={15} />
                </button>
                <code>{Math.round(s * 100)}%</code>
              </div>
              <div className="fe-row">
                <span className="fe-lbl">Left / right</span>
                <input type="range" min={-700} max={700} step="1" value={dx} onChange={(e) => setDx(Number(e.target.value))} aria-label="Move left or right" />
                <code>
                  {dx > 0 ? '+' : ''}
                  {dx}
                </code>
              </div>
              <div className="fe-row">
                <span className="fe-lbl">Up / down</span>
                <input type="range" min={-1000} max={1000} step="1" value={dy} onChange={(e) => setDy(Number(e.target.value))} aria-label="Move up or down" />
                <code>
                  {dy > 0 ? '+' : ''}
                  {dy}
                </code>
              </div>
              <div className="fe-row fe-pad">
                <span className="fe-lbl">Nudge</span>
                <div className="fe-arrows">
                  <button type="button" className="icon-btn" onClick={() => nudge(0, -4)} aria-label="Up">
                    <Icon name="up" size={15} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => nudge(-4, 0)} aria-label="Left">
                    <Icon name="chev" size={15} style={{ transform: 'rotate(90deg)' }} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => nudge(4, 0)} aria-label="Right">
                    <Icon name="chev" size={15} style={{ transform: 'rotate(-90deg)' }} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => nudge(0, 4)} aria-label="Down">
                    <Icon name="down" size={15} />
                  </button>
                </div>
                {reference && (
                  <label className="fe-ghost">
                    Reference
                    <input
                      type="range"
                      min="0"
                      max="0.8"
                      step="0.05"
                      value={ghost}
                      onChange={(e) => setGhost(Number(e.target.value))}
                      aria-label="Reference model opacity"
                    />
                  </label>
                )}
              </div>

              <div className="fe-actions">
                <button type="button" className="btn sm" onClick={() => centre(true)} disabled={!!busy}>
                  {busy === 'fit' ? <Spinner size={14} /> : <Icon name="body" size={15} />} Auto centre &amp; fit
                </button>
                <button type="button" className="btn sm" onClick={() => centre(false)} disabled={!!busy}>
                  {busy === 'centre' ? <Spinner size={14} /> : <Icon name="reset" size={15} />} Centre, keep size
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
