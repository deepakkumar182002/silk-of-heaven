import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Field, Modal, Spinner, useToast } from '../components/ui.jsx';
import { inr } from './Reports.jsx';

const blank = { code: '', description: '', type: 'percent', value: 10, minSubtotal: 0, maxDiscount: 0, startsAt: '', endsAt: '', usageLimit: 0, perCustomer: 1, firstOrderOnly: false, active: true };
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const describe = (c) =>
  `${c.type === 'percent' ? `${c.value}% off` : `${inr(c.value)} off`}${c.minSubtotal ? ` above ${inr(c.minSubtotal)}` : ''}${c.type === 'percent' && c.maxDiscount ? `, up to ${inr(c.maxDiscount)}` : ''}`;
const state = (c) => {
  const now = Date.now();
  if (!c.active) return ['Off', ''];
  if (c.startsAt && new Date(c.startsAt) > now) return ['Scheduled', 'warn'];
  if (c.endsAt && new Date(c.endsAt) < now) return ['Expired', ''];
  if (c.usageLimit && c.usedCount >= c.usageLimit) return ['Used up', ''];
  return ['Live', 'ok'];
};

export default function Coupons() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    api('/api/admin/coupons').then(setList).catch((e) => toast(e.message, 'err'));
  }, [toast]);

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const body = { ...edit, startsAt: edit.startsAt || null, endsAt: edit.endsAt ? `${edit.endsAt}T23:59:59` : null };
      delete body._id;
      delete body.usedCount;
      delete body.createdAt;
      delete body.updatedAt;
      const doc = await api(edit._id ? `/api/admin/coupons/${edit._id}` : '/api/admin/coupons', { method: edit._id ? 'PUT' : 'POST', body });
      setList((s) => (edit._id ? s.map((x) => (x._id === doc._id ? doc : x)) : [doc, ...s]));
      setEdit(null);
      toast('Coupon saved');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete coupon ${c.code}?`)) return;
    try {
      await api(`/api/admin/coupons/${c._id}`, { method: 'DELETE' });
      setList((s) => s.filter((x) => x._id !== c._id));
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const set = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  return (
    <>
      <PageHead title="Coupons" sub="Discount codes customers enter at checkout. Checked on the server: dates, minimum order, limits.">
        <button className="btn primary" onClick={() => setEdit({ ...blank })}>
          <Icon name="plus" size={18} /> New coupon
        </button>
      </PageHead>
      {!list ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : !list.length ? (
        <Empty icon="details" title="No coupons yet">
          <p>Create one, e.g. WELCOME10 for 10% off the first order.</p>
        </Empty>
      ) : (
        <div className="list card">
          {list.map((c) => {
            const [label, cls] = state(c);
            return (
              <div key={c._id} className="list-row">
                <div className="list-main">
                  <span className="coupon-code">{c.code}</span>
                  <div>
                    <b>{describe(c)}</b>
                    <small>
                      Used {c.usedCount}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ''} · {c.firstOrderOnly ? 'first order only · ' : ''}
                      {c.perCustomer ? `${c.perCustomer} per customer · ` : ''}
                      {c.endsAt ? `until ${new Date(c.endsAt).toLocaleDateString('en-IN')}` : 'no end date'}
                    </small>
                  </div>
                </div>
                <div className="list-actions">
                  <span className={'status-pill ' + cls}>{label}</span>
                  <button className="btn sm" onClick={() => setEdit({ ...c, startsAt: day(c.startsAt), endsAt: day(c.endsAt) })}>
                    <Icon name="pencil" size={15} /> Edit
                  </button>
                  <button className="icon-btn danger" onClick={() => remove(c)} aria-label="Delete">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {edit && (
        <Modal
          title={edit._id ? `Edit ${edit.code}` : 'New coupon'}
          onClose={() => setEdit(null)}
          footer={
            <>
              {error && <span className="err grow">{error}</span>}
              <button className="btn" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={save} disabled={busy}>
                {busy ? <Spinner /> : 'Save'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <div className="row2">
              <Field label="Code" hint="Letters and numbers, e.g. WELCOME10">
                <input value={edit.code} onChange={(e) => setEdit((x) => ({ ...x, code: e.target.value.toUpperCase().replace(/\s/g, '') }))} />
              </Field>
              <Field label="Type">
                <select value={edit.type} onChange={set('type')}>
                  <option value="percent">Percent off</option>
                  <option value="flat">Fixed amount off (₹)</option>
                </select>
              </Field>
            </div>
            <div className="row3">
              <Field label={edit.type === 'percent' ? 'Discount (%)' : 'Discount (₹)'}>
                <input type="number" min="0" value={edit.value} onChange={set('value')} />
              </Field>
              <Field label="Minimum order (₹)">
                <input type="number" min="0" value={edit.minSubtotal} onChange={set('minSubtotal')} />
              </Field>
              {edit.type === 'percent' && (
                <Field label="Max discount (₹)" hint="0 = no cap">
                  <input type="number" min="0" value={edit.maxDiscount} onChange={set('maxDiscount')} />
                </Field>
              )}
            </div>
            <div className="row2">
              <Field label="Starts" hint="Empty = now">
                <input type="date" value={edit.startsAt} onChange={set('startsAt')} />
              </Field>
              <Field label="Ends" hint="Empty = never">
                <input type="date" value={edit.endsAt} onChange={set('endsAt')} />
              </Field>
            </div>
            <div className="row2">
              <Field label="Total uses" hint="0 = unlimited">
                <input type="number" min="0" value={edit.usageLimit} onChange={set('usageLimit')} />
              </Field>
              <Field label="Uses per customer" hint="0 = unlimited (needs login)">
                <input type="number" min="0" value={edit.perCustomer} onChange={set('perCustomer')} />
              </Field>
            </div>
            <Field label="Description" hint="Shown to the customer when the code is applied">
              <input value={edit.description} onChange={set('description')} placeholder="e.g. Welcome offer" />
            </Field>
            <label className="check">
              <input type="checkbox" checked={edit.firstOrderOnly} onChange={set('firstOrderOnly')} /> First order only (customer must be logged in)
            </label>
            <label className="check">
              <input type="checkbox" checked={edit.active} onChange={set('active')} /> Active
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
