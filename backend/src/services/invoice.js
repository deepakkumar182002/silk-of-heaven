import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';

// The built-in PDF fonts have no ₹ glyph, so amounts are written as "Rs."
const rs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const d = (x) => new Date(x).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Tax invoice for an order as a PDF Buffer. */
export function invoicePdf(order, settings) {
  const store = settings?.store || {};
  const doc = new PDFDocument({ size: 'A4', margin: 44, info: { Title: `Invoice ${order.invoiceNumber || order.orderNumber}` } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const W = doc.page.width - 88;
  const grey = '#666666';

  // ---- header ----
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111').text(store.legalName || env.storeName, 44, 44);
  doc.font('Helvetica').fontSize(9).fillColor(grey);
  if (store.address) doc.text(store.address, { width: 280 });
  const contact = [store.phone, store.email].filter(Boolean).join('  ·  ');
  if (contact) doc.text(contact);
  if (store.gstin) doc.fillColor('#111').text(`GSTIN: ${store.gstin}`);

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111').text('TAX INVOICE', 44, 44, { width: W, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(grey);
  const meta = [
    ['Invoice no.', order.invoiceNumber || '—'],
    ['Invoice date', d(order.payment?.paidAt || order.createdAt)],
    ['Order no.', order.orderNumber],
    ['Payment', order.payment?.method === 'cod' ? 'Cash on delivery' : order.payment?.method === 'razorpay' ? `Online (${order.payment.status})` : order.payment?.status || '—'],
  ];
  let y = 66;
  for (const [k, v] of meta) {
    doc.fillColor(grey).text(k, 44, y, { width: W - 120, align: 'right' });
    doc.fillColor('#111').text(v, 44 + W - 115, y, { width: 115, align: 'right' });
    y += 13;
  }

  // ---- addresses ----
  y = Math.max(doc.y, y) + 18;
  const a = order.address || {};
  const addr = [a.line1, a.line2, [a.city, a.state, a.pincode].filter(Boolean).join(', '), a.country].filter(Boolean).join('\n');
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text('Bill to / Ship to', 44, y);
  doc.font('Helvetica').fillColor('#333').text(`${order.customer.name}\n${addr}\nPhone: ${order.customer.phone}${order.customer.email ? `\n${order.customer.email}` : ''}`, 44, y + 13, { width: 300 });
  y = doc.y + 18;

  // ---- items ----
  const cols = [
    ['Item', 44, 230, 'left'],
    ['Qty', 280, 40, 'right'],
    ['Rate', 330, 90, 'right'],
    ['Amount', 430, W - 386, 'right'],
  ];
  doc.rect(44, y, W, 20).fill('#f1eff3');
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111');
  for (const [t, x, w, al] of cols) doc.text(t, x + 6, y + 6, { width: w - 6, align: al });
  y += 26;
  doc.font('Helvetica').fontSize(9);
  for (const i of order.items) {
    const desc = `${i.name}\n${[i.color, `Size ${i.size}`, i.madeToOrder ? 'stitched to order' : ''].filter(Boolean).join(' · ')}`;
    const h = Math.max(doc.heightOfString(desc, { width: 224 }), 12);
    if (y + h > doc.page.height - 160) {
      doc.addPage();
      y = 44;
    }
    doc.fillColor('#111').text(desc, 50, y, { width: 224 });
    doc.text(String(i.qty), 286, y, { width: 34, align: 'right' });
    doc.text(rs(i.unitPrice), 336, y, { width: 84, align: 'right' });
    doc.text(rs(i.unitPrice * i.qty), 436, y, { width: W - 392, align: 'right' });
    y += h + 10;
    doc.moveTo(44, y - 5).lineTo(44 + W, y - 5).strokeColor('#e5e2e8').lineWidth(0.5).stroke();
  }

  // ---- totals ----
  const taxable = order.taxIncluded ? order.total - order.tax : order.total - order.tax;
  const rows = [
    ['Subtotal', rs(order.subtotal)],
    ...(order.discount ? [[`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `- ${rs(order.discount)}`]] : []),
    ['Shipping', order.shipping ? rs(order.shipping) : 'Free'],
    ...(order.codFee ? [['COD fee', rs(order.codFee)]] : []),
    ['Taxable value', rs(taxable)],
    [`GST @ ${order.taxRate}%${order.taxIncluded ? ' (included in prices)' : ''}`, rs(order.tax)],
    ...(order.payment?.refunded ? [['Refunded', `- ${rs(order.payment.refunded)}`]] : []),
  ];
  y += 6;
  doc.fontSize(9);
  for (const [k, v] of rows) {
    doc.fillColor(grey).text(k, 260, y, { width: 170, align: 'right' });
    doc.fillColor('#111').text(v, 436, y, { width: W - 392, align: 'right' });
    y += 15;
  }
  doc.rect(260, y, W - 216, 24).fill('#111');
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#fff').text('Total', 268, y + 7, { width: 150 });
  doc.text(rs(order.total), 436, y + 7, { width: W - 398, align: 'right' });
  y += 40;

  doc.font('Helvetica').fontSize(8).fillColor(grey);
  doc.text(
    `${store.gstin ? '' : 'GSTIN not set: add it in Site Settings - Business details. '}This is a computer generated invoice and needs no signature. Prices are in Indian Rupees.`,
    44,
    Math.max(y, doc.page.height - 90),
    { width: W, align: 'center' }
  );
  doc.end();
  return done;
}
