import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Spinner, useToast } from '../components/ui.jsx';

const TABS = [
  ['pending', 'Waiting'],
  ['approved', 'Published'],
  ['rejected', 'Hidden'],
  ['all', 'All'],
];

export default function Reviews() {
  const [tab, setTab] = useState('pending');
  const [data, setData] = useState(null);
  const toast = useToast();

  useEffect(() => {
    setData(null);
    api(`/api/admin/reviews${tab === 'all' ? '' : `?status=${tab}`}`)
      .then(setData)
      .catch((e) => toast(e.message, 'err'));
  }, [tab, toast]);

  const setStatus = async (r, status) => {
    try {
      await api(`/api/admin/reviews/${r._id}`, { method: 'PUT', body: { status } });
      setData((d) => ({
        reviews: tab === 'all' ? d.reviews.map((x) => (x._id === r._id ? { ...x, status } : x)) : d.reviews.filter((x) => x._id !== r._id),
        counts: { ...d.counts, [r.status]: (d.counts[r.status] || 1) - 1, [status]: (d.counts[status] || 0) + 1 },
      }));
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const remove = async (r) => {
    if (!window.confirm('Delete this review for good?')) return;
    try {
      await api(`/api/admin/reviews/${r._id}`, { method: 'DELETE' });
      setData((d) => ({ ...d, reviews: d.reviews.filter((x) => x._id !== r._id) }));
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  return (
    <>
      <PageHead title="Reviews" sub="Customer reviews appear on the product after you publish them (or straight away if auto-publish is on in Site Settings)." />
      <div className="chips" style={{ marginBottom: 16 }}>
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
            {k !== 'all' && data?.counts?.[k] ? <small>{data.counts[k]}</small> : null}
          </button>
        ))}
      </div>
      {!data ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : !data.reviews.length ? (
        <Empty icon="heart" title="Nothing here" />
      ) : (
        <div className="list card">
          {data.reviews.map((r) => (
            <div key={r._id} className="list-row review-row">
              <div className="list-main">
                <div>
                  <b>
                    <span className="stars-txt">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span> {r.title || r.productName}
                  </b>
                  {r.text && <p className="review-text">{r.text}</p>}
                  <small>
                    {r.productName} · {r.customer?.name || r.name}
                    {r.customer?.email ? ` · ${r.customer.email}` : r.customer?.phone ? ` · ${r.customer.phone}` : ''} · {new Date(r.createdAt).toLocaleDateString('en-IN')}
                    {r.verified && <span className="ok-text inline"> · verified buyer</span>}
                  </small>
                </div>
              </div>
              <div className="list-actions">
                {r.status !== 'approved' && (
                  <button className="btn sm primary" onClick={() => setStatus(r, 'approved')}>
                    <Icon name="check" size={15} /> Publish
                  </button>
                )}
                {r.status !== 'rejected' && (
                  <button className="btn sm" onClick={() => setStatus(r, 'rejected')}>
                    <Icon name="eyeOff" size={15} /> Hide
                  </button>
                )}
                <button className="icon-btn danger" onClick={() => remove(r)} aria-label="Delete">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
