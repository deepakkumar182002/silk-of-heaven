import { useRef, useState } from 'react';
import { LOOKS, SITE, faceCrop, swapFace } from '../data.js';
import Icon from '../icons.jsx';

/** Avatar crop window (see faceCrop): 360×360 of the canvas at (500, 46). */
export const avatarFace = (face, size) => {
  const k = size / 360;
  return {
    left: (face.box.x - 500) * k,
    top: (face.box.y - 46) * k,
    width: face.box.w * k,
    height: face.box.h * k,
    backgroundImage: `url("${face.image}")`,
  };
};

/**
 * "Try with your face": the visitor uploads a selfie once, the AI returns a face layer
 * that sits on every look (all looks share the same pose and head position).
 * The photo is not stored on the server; the result stays in this browser.
 */
export default function FaceCard({ look, face, faceOn, setFaceOn, onFace, say, compact }) {
  const input = useRef(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!SITE.faceSwap && !face) return null;

  const pick = async (file) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const r = await swapFace(file);
      onFace({ image: r.image, box: r.box });
      setFaceOn(true);
      say('Your face is on');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const chooser = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      capture="user"
      hidden
      onChange={(e) => {
        pick(e.target.files[0]);
        e.target.value = '';
      }}
    />
  );

  if (face) {
    return (
      <section className={'facecard on' + (compact ? ' compact' : '')} aria-label="Your face">
        <span className="fc-avatar" style={faceCrop(LOOKS[look].big, 56)}>
          {faceOn && <span className="fc-face" style={avatarFace(face, 56)} />}
        </span>
        <div className="fc-body">
          <b>Your face</b>
          <small>{faceOn ? 'Showing on every look' : 'Hidden, model face shown'}</small>
        </div>
        <button className={'fc-switch' + (faceOn ? ' on' : '')} role="switch" aria-checked={faceOn} aria-label="Show my face" onClick={() => setFaceOn(!faceOn)}>
          <i />
        </button>
        <div className="fc-more">
          <button onClick={() => input.current.click()} disabled={busy || !SITE.faceSwap}>
            {busy ? <span className="fc-spin" /> : <Icon name="shuffle" size={14} />} Change
          </button>
          <button
            onClick={() => {
              onFace(null);
              say('Face removed');
            }}
          >
            <Icon name="trash" size={14} /> Remove
          </button>
        </div>
        {error && <p className="fc-err">{error}</p>}
        {chooser}
      </section>
    );
  }

  return (
    <section className={'facecard' + (compact ? ' compact' : '')} aria-label="Try with your face">
      <span className="fc-icon">
        <Icon name="face" size={22} />
      </span>
      <div className="fc-body">
        <b>Try with your face</b>
        <small>Upload a clear, front-facing selfie. Every outfit is then shown on you.</small>
      </div>
      <label className="fc-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>This is my photo, or I have permission to use it. It is used only to make this preview and is not saved by VELL.</span>
      </label>
      <button className="fc-go" onClick={() => input.current.click()} disabled={!consent || busy}>
        {busy ? (
          <>
            <span className="fc-spin" /> Creating your look… about 15 s
          </>
        ) : (
          <>
            <Icon name="face" size={17} /> Upload selfie
          </>
        )}
      </button>
      {error && <p className="fc-err">{error}</p>}
      {chooser}
    </section>
  );
}
