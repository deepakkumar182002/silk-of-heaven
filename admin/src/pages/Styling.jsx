import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Field, Spinner, TagInput, useToast } from '../components/ui.jsx';

const KEYS = [
  ['Face', 'face', 'Face shape presets and sliders (smile, jawline, freckles…)'],
  ['Hair', 'hair', 'Hairstyles, hair colour swatches and sliders'],
  ['Makeup', 'makeup', 'Makeup looks, lip / blush colour swatches and sliders'],
  ['Accessories', 'acc', 'Multi-select add-on items'],
  ['Tattoos', 'tattoo', 'Tattoo styles and opacity'],
  ['Details', 'details', 'Rendering detail presets and sliders'],
];

export default function Styling() {
  const [groups, setGroups] = useState(null);
  const [active, setActive] = useState('Face');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api('/api/admin/tune')
      .then((g) => setGroups(Object.fromEntries(g.map((x) => [x.key, x]))))
      .catch((e) => toast(e.message, 'err'));
  }, [toast]);

  useEffect(() => {
    if (!groups) return;
    const g = groups[active] || { key: active, presets: [], swatches: [], sliders: [], multi: false, multiLabel: '' };
    setDraft(JSON.parse(JSON.stringify(g)));
  }, [groups, active]);

  const dirty = draft && groups && JSON.stringify(draft) !== JSON.stringify(groups[active] || draft);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (draft.sliders.some((s) => !s.name.trim())) return toast('Every slider needs a name', 'err');
    setBusy(true);
    try {
      const doc = await api(`/api/admin/tune/${active}`, {
        method: 'PUT',
        body: {
          presets: draft.presets,
          swatches: draft.swatches,
          sliders: draft.sliders.map((s) => ({ name: s.name.trim(), value: Math.max(0, Math.min(100, Number(s.value) || 0)) })),
          multi: !!draft.multi,
          multiLabel: draft.multiLabel || '',
        },
      });
      setGroups((g) => ({ ...g, [active]: doc }));
      toast(`${active} options saved`);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (k) => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setActive(k);
  };

  return (
    <>
      <PageHead title="Face, Hair & Styling" sub="Fitting room only: options in its Style menu (Face, Hair, Makeup, Accessories, Tattoos, Details).">
        <button className="btn primary" onClick={save} disabled={!dirty || busy}>
          {busy ? <Spinner /> : 'Save changes'}
        </button>
      </PageHead>

      <div className="seg">
        {KEYS.map(([k, icon]) => (
          <button key={k} className={active === k ? 'on' : ''} onClick={() => switchTo(k)}>
            <Icon name={icon} size={18} /> {k}
          </button>
        ))}
      </div>

      {!draft ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : (
        <div className="card pad stack">
          <p className="muted">{KEYS.find((k) => k[0] === active)[2]}</p>

          <Field label={draft.multi ? 'Items (users can pick several)' : 'Presets (users pick one)'}>
            <TagInput value={draft.presets} onChange={(presets) => set({ presets })} placeholder="Add an option and press Enter" />
          </Field>

          <div className="row2">
            <label className="check">
              <input type="checkbox" checked={!!draft.multi} onChange={(e) => set({ multi: e.target.checked })} />
              Allow multiple selections
            </label>
            {draft.multi && (
              <Field label="Section label">
                <input value={draft.multiLabel} onChange={(e) => set({ multiLabel: e.target.value })} placeholder="Add items" />
              </Field>
            )}
          </div>

          <div className="field">
            <span className="field-label">Colour swatches</span>
            <div className="swatch-edit">
              {draft.swatches.map((c, i) => (
                <span key={i} className="swatch-item">
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => set({ swatches: draft.swatches.map((x, j) => (j === i ? e.target.value : x)) })}
                    aria-label={`Swatch ${i + 1}`}
                  />
                  <button type="button" onClick={() => set({ swatches: draft.swatches.filter((_, j) => j !== i) })} aria-label="Remove swatch">
                    <Icon name="x" size={12} stroke={2.4} />
                  </button>
                </span>
              ))}
              <button type="button" className="btn sm" onClick={() => set({ swatches: [...draft.swatches, '#a07c5a'] })}>
                <Icon name="plus" size={15} /> Add colour
              </button>
            </div>
            <small className="hint">Leave empty to hide the swatch row.</small>
          </div>

          <div className="field">
            <span className="field-label">Sliders (default value 0–100)</span>
            {draft.sliders.length === 0 && <div className="muted small">No sliders</div>}
            {draft.sliders.map((s, i) => (
              <div key={i} className="slider-row">
                <input
                  value={s.name}
                  placeholder="Slider name"
                  onChange={(e) => set({ sliders: draft.sliders.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={s.value}
                  onChange={(e) => set({ sliders: draft.sliders.map((x, j) => (j === i ? { ...x, value: +e.target.value } : x)) })}
                  aria-label={`${s.name} default`}
                />
                <b>{s.value}</b>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => set({ sliders: draft.sliders.filter((_, j) => j !== i) })}
                  aria-label="Remove slider"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn sm" onClick={() => set({ sliders: [...draft.sliders, { name: '', value: 50 }] })}>
                <Icon name="plus" size={15} /> Add slider
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
