import { useEffect, useRef } from 'react';
import Icon from '../icons.jsx';

/** Fixed full-screen layer for shop dialogs. Rendered outside the scaled stage so it is always real px. */
export default function Overlay({ title, onClose, variant = 'modal', wide, children, footer, label }) {
  const panel = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    panel.current?.focus();
    const key = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="shop-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label || title}
        className={'shop-panel ' + variant + (wide ? ' wide' : '')}
      >
        <header className="shop-head">
          <h2>{title}</h2>
          <button className="shop-x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} stroke={2} />
          </button>
        </header>
        <div className="shop-body">{children}</div>
        {footer && <footer className="shop-foot">{footer}</footer>}
      </section>
    </div>
  );
}
