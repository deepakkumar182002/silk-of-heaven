import { useEffect, useRef, useState } from 'react';
import { LOOKS, faceCrop } from '../data.js';
import Icon from '../icons.jsx';
import { avatarFace } from './FaceCard.jsx';

export default function Profile({ look, ident, face, onName, onShuffle, spin, avatarSize = 98 }) {
  const nameRef = useRef(null);
  const [editing, setEditing] = useState(false);

  // Name text is managed imperatively so contentEditable never fights React.
  useEffect(() => {
    if (!editing && nameRef.current) nameRef.current.textContent = ident.name;
  }, [ident.name, editing]);

  const startEdit = () => {
    const el = nameRef.current;
    el.contentEditable = 'true';
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    setEditing(true);
  };
  const endEdit = () => {
    const el = nameRef.current;
    el.contentEditable = 'false';
    window.getSelection()?.removeAllRanges();
    setEditing(false);
    const v = el.textContent.trim() || ident.name;
    el.textContent = v;
    onName(v);
  };

  return (
    <section id="profile" className="glass">
      <div id="avatar" style={{ ...faceCrop(LOOKS[look].big, avatarSize), width: avatarSize, height: avatarSize }}>
        {face && <span className="fc-face" style={avatarFace(face, avatarSize)} />}
      </div>
      <div className="prof-body">
        <div className="name-row">
          <span
            id="pname"
            ref={nameRef}
            className={editing ? 'editing' : ''}
            onKeyDown={(e) => {
              if (editing && e.key === 'Enter') {
                e.preventDefault();
                endEdit();
              }
            }}
          />
          <button className="rbtn" aria-label="Edit name" onClick={() => (editing ? endEdit() : startEdit())}>
            <Icon name="pencil" size={18} />
          </button>
          <button id="shuf" className="rbtn glass" aria-label="Shuffle identity" onClick={onShuffle}>
            <Icon name="shuffle" size={18} style={{ transform: `rotate(${spin}deg)` }} />
          </button>
        </div>
        <div className="meta">
          <span>{ident.age}</span>
          <span className="div" />
          <span>{ident.city}</span>
          <span className="div" />
          <span className="weather">
            <Icon name="cloud" size={18} />
            {ident.temp}°C
            <span className="wtip">Overcast · soft daylight</span>
          </span>
        </div>
      </div>
    </section>
  );
}
