import { useEffect, useRef } from 'react';
import Icon from '../icons.jsx';

// Open layers, newest last: Escape only closes the one on top (e.g. a product sheet over the shop).
const stack = [];
export function useEscapeLayer(onClose) {
  const id = useRef(Symbol('layer'));
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    const me = id.current;
    stack.push(me);
    const key = (e) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) {
        e.stopPropagation();
        cb.current();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      stack.splice(stack.indexOf(me), 1);
    };
  }, []);
}

/** Fixed full-screen layer for shop dialogs. Rendered outside the scaled stage so it is always real px. */
export default function Overlay({ title, onClose, variant = 'modal', wide, children, footer, label }) {
  const panel = useRef(null);
  useEscapeLayer(onClose);

  useEffect(() => {
    const prev = document.activeElement;
    panel.current?.focus();
    return () => prev?.focus?.();
  }, []);

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
