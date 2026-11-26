import { useRef, useState } from 'react';
import { LOOKS, SITE, faceCrop, swapFace } from '../data.js';
import Icon from '../icons.jsx';
import CameraCapture from './CameraCapture.jsx';

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
 * "Try with your face": the visitor uploads a front-facing photo or takes one with the camera;
 * the face service returns a face layer that sits on every look (all looks share one pose).
 * The photo is not stored on the server; the result stays in this browser.
 */
export default function FaceCard({ look, face, faceOn, setFaceOn, onFace, say, compact }) {
  const input = useRef(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [camera, setCamera] = useState(false);

  if (!SITE.faceSwap && !face) return null;

  const use = async (file) => {
    if (!file) return;
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const r = await swapFace(file);
      onFace({ image: r.image, box: r.box });
      setFaceOn(true);
      setInfo((r.notes || [])[0] || '');
      say('Your face is on');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pickers = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          use(e.target.files[0]);
          e.target.value = '';
        }}
      />
      {camera && <CameraCapture onCapture={use} onClose={() => setCamera(false)} />}
    </>
  );

  if (face) {
    return (
      <section className={'facecard on' + (compact ? ' compact' : '')} aria-label="Your face">
        <span className="fc-avatar" style={faceCrop(LOOKS[look].big, 56)}>
          {faceOn && <span className="fc-face" style={avatarFace(face, 56)} />}
        </span>
        <div className="fc-body">
          <b>Your face</b>
          <small>{busy ? 'Updating…' : faceOn ? 'Showing on every look' : 'Hidden, model face shown'}</small>
        </div>
        <button className={'fc-switch' + (faceOn ? ' on' : '')} role="switch" aria-checked={faceOn} aria-label="Show my face" onClick={() => setFaceOn(!faceOn)}>
          <i />
        </button>
        <div className="fc-more">
          <button onClick={() => input.current.click()} disabled={busy || !SITE.faceSwap}>
            {busy ? <span className="fc-spin" /> : <Icon name="upload" size={14} />} Photo
          </button>
          <button onClick={() => setCamera(true)} disabled={busy || !SITE.faceSwap}>
            <Icon name="camera" size={14} /> Camera
          </button>
          <button
            onClick={() => {
              onFace(null);
              say('Face removed');
            }}
            disabled={busy}
          >
            <Icon name="trash" size={14} /> Remove
          </button>
        </div>
        {error && <p className="fc-err">{error}</p>}
        {!error && info && <p className="fc-info">{info}</p>}
        {pickers}
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
        <small>Upload a front-facing photo or take a selfie. Every outfit is then shown with your face.</small>
      </div>
      <label className="fc-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>This is my photo, or I have permission to use it. It is used only to make this preview and is not saved by VELL.</span>
      </label>
      {busy ? (
        <div className="fc-go busy" role="status">
          <span className="fc-spin" /> Putting your face on the model…
        </div>
      ) : (
        <div className="fc-two">
          <button className="fc-go" onClick={() => input.current.click()} disabled={!consent}>
            <Icon name="upload" size={17} /> Upload photo
          </button>
          <button className="fc-go" onClick={() => setCamera(true)} disabled={!consent}>
            <Icon name="camera" size={17} /> Use camera
          </button>
        </div>
      )}
      {error && <p className="fc-err">{error}</p>}
      {pickers}
    </section>
  );
}
