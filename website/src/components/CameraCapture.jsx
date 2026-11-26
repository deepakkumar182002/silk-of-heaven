import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../icons.jsx';

const cameraError = (e) => {
  if (!window.isSecureContext) return 'The camera only works on a secure (https) page. Please upload a photo instead.';
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser cannot open the camera. Please upload a photo instead.';
  if (e?.name === 'NotAllowedError') return 'Camera access was blocked. Allow the camera for this site in your browser settings, or upload a photo instead.';
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'No camera found on this device. Please upload a photo instead.';
  if (e?.name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'Could not start the camera. Please upload a photo instead.';
};

/**
 * Live selfie capture: front camera preview with a face guide, then "Use photo" / "Retake".
 * Rendered in a portal on <body> so it is never scaled with the stage.
 */
export default function CameraCapture({ onCapture, onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState(null); // { blob, url }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
      } catch (e) {
        if (alive) setError(cameraError(e));
      }
    })();
    return () => {
      alive = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  useEffect(() => () => shot && URL.revokeObjectURL(shot.url), [shot]);

  const capture = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    // save it the way the preview looks (mirrored), like a phone selfie
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    c.toBlob((blob) => blob && setShot({ blob, url: URL.createObjectURL(blob) }), 'image/jpeg', 0.92);
  };

  return createPortal(
    <div className="cam-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="cam" role="dialog" aria-modal="true" aria-label="Take a selfie">
        <header className="cam-h">
          <b>Take a selfie</b>
          <button onClick={onClose} aria-label="Close camera">
            <Icon name="x" size={18} stroke={2} />
          </button>
        </header>

        <div className="cam-view">
          {error ? (
            <p className="cam-err">
              <Icon name="face" size={30} />
              {error}
            </p>
          ) : shot ? (
            <img src={shot.url} alt="Your selfie" />
          ) : (
            <>
              <video ref={video} playsInline muted onLoadedData={() => setReady(true)} />
              <span className="cam-guide" aria-hidden="true" />
              {!ready && <span className="cam-wait">Starting camera…</span>}
            </>
          )}
        </div>

        {!error && (
          <p className="cam-tip">{shot ? 'Is your face clear, straight and well lit?' : 'Look straight at the camera, face in the oval, good light, no sunglasses.'}</p>
        )}

        <footer className="cam-f">
          {error ? (
            <button className="cam-btn" onClick={onClose}>
              Close
            </button>
          ) : shot ? (
            <>
              <button className="cam-btn" onClick={() => setShot(null)}>
                <Icon name="reset" size={16} /> Retake
              </button>
              <button
                className="cam-btn primary"
                onClick={() => {
                  onCapture(new File([shot.blob], 'selfie.jpg', { type: 'image/jpeg' }));
                  onClose();
                }}
              >
                <Icon name="check" size={16} stroke={2.2} /> Use photo
              </button>
            </>
          ) : (
            <button className="cam-shutter" onClick={capture} disabled={!ready} aria-label="Take photo">
              <i />
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body
  );
}
