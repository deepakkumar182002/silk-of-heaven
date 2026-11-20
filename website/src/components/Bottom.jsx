import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { FILTERS, LOOKS, faceCrop } from '../data.js';
import Icon from '../icons.jsx';
import { Range } from './Slider.jsx';

const FRAME_LABEL = { full: 'Full', mid: 'Mid', portrait: 'Portrait' };

export function ControlBar({ canUndo, canRedo, onUndo, onRedo, framing, onPose, onReset }) {
  return (
    <div id="ctrl" className="glass">
      <button disabled={!canUndo} onClick={onUndo}>
        <Icon name="undo" />
        Undo
      </button>
      <button disabled={!canRedo} onClick={onRedo}>
        <Icon name="redo" />
        Redo
      </button>
      <button className="pill-on" onClick={onPose}>
        <Icon name="pose" />
        {FRAME_LABEL[framing]}
      </button>
      <button onClick={onReset}>
        <Icon name="reset" />
        Reset
      </button>
    </div>
  );
}

export function Realism({ value, onChange, onCommit }) {
  return (
    <div id="real" className="glass">
      <div className="top">
        <span className="t">Realism</span>
        <Range value={value} onChange={onChange} onCommit={onCommit} />
        <b>{value}%</b>
      </div>
      <div className="ends">
        <span>Stylized</span>
        <span>Hyper Realistic</span>
      </div>
    </div>
  );
}

export function FilterBar({ look, grade, onPick }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [nudge, setNudge] = useState(-1);
  const face = faceCrop(LOOKS[look].big, 64);
  const shown = Array.from({ length: Math.min(5, FILTERS.length) }, (_, j) => (offset + j) % FILTERS.length);

  return (
    <div id="filt" className="glass">
      <div className={'fdrop' + (open ? ' open' : '')}>
        <div className="t">Filter</div>
        <button onClick={() => setOpen((o) => !o)}>
          {FILTERS[grade].name}
          <Icon name="chev" size={16} />
        </button>
        <div className="flist glass">
          {FILTERS.map((f, i) => (
            <button
              key={f.name}
              className={i === grade ? 'on' : ''}
              onClick={() => {
                setOpen(false);
                onPick(i);
              }}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      <div className="thumbs-wrap">
        <div className={'thumbs' + (nudge < 0 ? '' : ' n' + (nudge % 2))}>
          {shown.map((i) => (
            <button
              key={i}
              className={'thumb' + (i === grade ? ' on' : '')}
              title={FILTERS[i].name}
              onClick={() => onPick(i)}
            >
              <span className="face" style={{ ...face, filter: FILTERS[i].filter }} />
              <i style={{ background: FILTERS[i].tint }} />
            </button>
          ))}
        </div>
      </div>

      <button
        className="nextb"
        aria-label="Next filters"
        hidden={FILTERS.length <= 5}
        onClick={() => {
          setOffset((o) => (o + 1) % FILTERS.length);
          setNudge((n) => n + 1);
        }}
      >
        <Icon name="chevRight" size={18} />
      </button>
    </div>
  );
}

export function SaveButton({ onSave, shine }) {
  return (
    <div id="save" className="glass">
      <button id="saveBtn" onClick={onSave}>
        <span className={'shine' + (shine ? ' s' + (shine % 2) : '')} />
        SAVE TO LIBRARY
      </button>
    </div>
  );
}

export const Library = forwardRef(function Library({ open, saved, ghost, onPick }, ref) {
  const rowRef = useRef(null);
  const ghostRef = useRef(null);

  useImperativeHandle(ref, () => ({
    // Ghost slot position in stage px (offsets ignore the drawer's open transform)
    measureGhost(desktop, root) {
      const row = rowRef.current;
      const g = ghostRef.current;
      if (!row || !g) return null;
      row.scrollLeft = row.scrollWidth;
      if (!desktop) {
        const rr = root.getBoundingClientRect();
        const gr = g.getBoundingClientRect();
        return { left: gr.left - rr.left, top: gr.top - rr.top, width: gr.width, height: gr.height };
      }
      return {
        left: 504 + 1 + row.offsetLeft + g.offsetLeft - row.scrollLeft,
        top: 560 + 1 + row.offsetTop + g.offsetTop,
        width: 72,
        height: 104,
      };
    },
  }));

  return (
    <div id="lib" className={'glass' + (open ? ' open' : '')}>
      <h3>
        LIBRARY <small>{saved.length} saved</small>
      </h3>
      <div className="lib-row" ref={rowRef}>
        {saved.length === 0 && !ghost && <span className="lib-empty">Save a look to start your library.</span>}
        {saved.map((s) => (
          <button
            key={s.id}
            className="slot pop"
            onClick={() => onPick(s.look)}
            title={LOOKS[s.look].name}
          >
            <span className="im" style={{ backgroundImage: `url("${LOOKS[s.look].small}")`, filter: FILTERS[s.grade].filter }} />
          </button>
        ))}
        {ghost && <span className="slot ghost" ref={ghostRef} />}
      </div>
    </div>
  );
});
