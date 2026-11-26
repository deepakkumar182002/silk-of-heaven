export function Range({ value, min = 0, max = 100, onChange, onCommit }) {
  const p = ((value - min) / (max - min)) * 100;
  const done = (e) => onCommit && onCommit(+e.target.value);
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      style={{ '--p': p + '%' }}
      onChange={(e) => onChange(+e.target.value)}
      onPointerUp={done}
      onKeyUp={done}
    />
  );
}

export default function Slider({ label, value, suffix = '', display, ...rest }) {
  return (
    <div>
      <div className="sl-row">
        <span>{label}</span>
        <b>{display ?? `${value}${suffix}`}</b>
      </div>
      <Range value={value} {...rest} />
    </div>
  );
}
