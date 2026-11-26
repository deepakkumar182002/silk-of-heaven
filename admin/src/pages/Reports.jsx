import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import { Spinner, useToast } from '../components/ui.jsx';

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const RANGES = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
  [365, '12 months'],
];
const METHOD = { razorpay: 'Online (Razorpay)', cod: 'Cash on delivery', manual: 'Other' };
const STATUS = { new: 'Confirmed', contacted: 'Contacted', stitching: 'Stitching', ready: 'Ready', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };

export default function Reports() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState(null);
  const toast = useToast();
  useEffect(() => {
    setR(null);
    api(`/api/admin/reports?days=${days}`).then(setR).catch((e) => toast(e.message, 'err'));
  }, [days, toast]);

  const t = r?.totals;
  return (
    <>
      <PageHead title="Sales reports" sub="Confirmed orders (paid online or cash on delivery), net of refunds. Unpaid checkouts and cancelled orders are left out.">
        <div className="seg" role="group" aria-label="Date range">
          {RANGES.map(([d, l]) => (
            <button key={d} className={days === d ? 'on' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>
              {l}
            </button>
          ))}
        </div>
      </PageHead>
      {!r ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : (
        <div className="stack">
          <div className="tiles">
            <Tile label="Net revenue" value={inr(t.net)} />
            <Tile label="Orders" value={t.orders} />
            <Tile label="Average order" value={inr(t.aov)} />
            <Tile label="Items sold" value={t.items} />
            <Tile label="GST collected" value={inr(t.tax)} />
            <Tile label="Discounts given" value={inr(t.discount)} />
            <Tile label="Refunded" value={inr(t.refunded)} />
            <Tile label="New customers" value={t.newCustomers} />
          </div>

          <section className="card pad">
            <RevenueChart series={r.series} />
          </section>

          <div className="report-grid">
            <section className="card pad">
              <h3>Top products</h3>
              {r.top.length === 0 ? (
                <p className="muted small">No sales in this period.</p>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="num">Qty</th>
                      <th className="num">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.top.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="num">{p.qty}</td>
                        <td className="num">{inr(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card pad">
              <h3>Payment methods</h3>
              <table className="tbl">
                <tbody>
                  {r.byMethod.map((m) => (
                    <tr key={m.method}>
                      <td>{METHOD[m.method] || m.method}</td>
                      <td className="num">{m.orders} orders</td>
                      <td className="num">{inr(m.revenue)}</td>
                    </tr>
                  ))}
                  {!r.byMethod.length && (
                    <tr>
                      <td className="muted">No orders</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <h3 style={{ marginTop: 18 }}>Orders by status</h3>
              <div className="status-row">
                {Object.entries(STATUS).map(([k, l]) => (
                  <span key={k} className="status-pill">
                    {l} <b>{r.byStatus[k] || 0}</b>
                  </span>
                ))}
              </div>
              <p className="muted small" style={{ marginTop: 10 }}>
                {t.returns} order{t.returns === 1 ? '' : 's'} with returns · {t.cancelled} cancelled
              </p>
            </section>
            <section className="card pad">
              <h3>Coupons used</h3>
              {r.coupons.length === 0 ? (
                <p className="muted small">No coupons used in this period.</p>
              ) : (
                <table className="tbl">
                  <tbody>
                    {r.coupons.map((c) => (
                      <tr key={c.code}>
                        <td>
                          <span className="coupon-code sm">{c.code}</span>
                        </td>
                        <td className="num">{c.orders} orders</td>
                        <td className="num">−{inr(c.discount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ label, value }) {
  return (
    <div className="tile card">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

/**
 * Net revenue per day: one series, so no legend (the title names it). Thin bars with a rounded data end
 * on the baseline, recessive grid, hover / focus tooltip on every bar, and a table view.
 */
function RevenueChart({ series }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const W = 960;
  const H = 260;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const max = Math.max(1, ...series.map((d) => d.revenue));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = iw / series.length;
  const barW = Math.max(1, Math.min(28, bw - 2)); // 2px gap between bars
  const y = (v) => pad.t + ih - (v / top) * ih;
  const ticks = useMemo(() => Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step), [top, step]);
  const every = Math.ceil(series.length / 8);
  const label = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const total = series.reduce((n, d) => n + d.revenue, 0);

  return (
    <div className="chart">
      <div className="chart-h">
        <h3>Net revenue per day</h3>
        <button className="btn sm" onClick={() => setTable((x) => !x)} aria-pressed={table}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {table ? (
        <div className="table-wrap chart-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Orders</th>
                <th className="num">Net revenue</th>
              </tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <tr key={d.date}>
                  <td>{label(d.date)}</td>
                  <td className="num">{d.orders}</td>
                  <td className="num">{inr(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-box" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Net revenue per day, ${series.length} days, total ${inr(total)}`}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
                <text x={pad.l - 8} y={y(v) + 4} className="axis" textAnchor="end">
                  {v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`}
                </text>
              </g>
            ))}
            {series.map((d, i) => {
              const x = pad.l + i * bw + (bw - barW) / 2;
              const h = Math.max(0, y(0) - y(d.revenue));
              const r = Math.min(4, barW / 2, h);
              return (
                <g key={d.date}>
                  {h > 0 && (
                    <path
                      className={'bar' + (hover?.i === i ? ' on' : '')}
                      d={`M${x},${y(0)} V${y(d.revenue) + r} Q${x},${y(d.revenue)} ${x + r},${y(d.revenue)} H${x + barW - r} Q${x + barW},${y(d.revenue)} ${x + barW},${y(d.revenue) + r} V${y(0)} Z`}
                    />
                  )}
                  {/* hit target: the whole column, bigger than the bar */}
                  <rect
                    x={pad.l + i * bw}
                    y={pad.t}
                    width={bw}
                    height={ih}
                    className="hit"
                    tabIndex={0}
                    aria-label={`${label(d.date)}: ${inr(d.revenue)}, ${d.orders} orders`}
                    onMouseEnter={() => setHover({ i, d })}
                    onFocus={() => setHover({ i, d })}
                    onBlur={() => setHover(null)}
                  />
                  {i % every === 0 && (
                    <text x={pad.l + i * bw + bw / 2} y={H - 8} className="axis" textAnchor="middle">
                      {label(d.date)}
                    </text>
                  )}
                </g>
              );
            })}
            <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="base" />
          </svg>
          {hover && (
            <div
              className={'chart-tip' + (hover.i > series.length * 0.8 ? ' end' : hover.i < series.length * 0.12 ? ' start' : '')}
              style={{ left: `${((pad.l + hover.i * bw + bw / 2) / W) * 100}%`, top: `${(y(hover.d.revenue) / H) * 100}%` }}
            >
              <b>{inr(hover.d.revenue)}</b>
              <span>
                {label(hover.d.date)} · {hover.d.orders} order{hover.d.orders === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
