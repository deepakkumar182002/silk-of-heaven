/**
 * Information & policy pages. The admin can rewrite each one in Site Settings; an empty page uses
 * this starting text, filled with the store's own details. Format: blank line = new paragraph,
 * "## " = heading, "- " = list item.
 */
export const PAGES = [
  ['about', 'About us'],
  ['contact', 'Contact us'],
  ['shipping', 'Shipping policy'],
  ['returns', 'Returns & refunds'],
  ['privacy', 'Privacy policy'],
  ['terms', 'Terms & conditions'],
];

export function defaultPages({ name, store = {}, shop = {} }) {
  const legal = store.legalName || name;
  const email = store.email || '[your email]';
  const phone = store.phone || '[your phone]';
  const addr = store.address || '[your business address]';
  const days = shop.returnWindowDays ?? 7;
  const fee = shop.shippingFee ?? 99;
  const free = shop.freeShippingOver ?? 1999;
  return {
    about: `${name} makes clothes you can see on yourself before you buy. Try every outfit on our virtual model, match it with shoes, bags and jewellery, and order it ready-made or stitched to your measurements.

## What we do
- Made-to-order garments, cut and stitched by our tailors to your size
- Ready-made pieces that ship quickly
- A virtual fitting room where you can see each look, even with your own face

${legal} is based at ${addr}.`,
    contact: `We are happy to help with sizes, orders, returns and anything else.

## Reach us
- Email: ${email}
- Phone: ${phone}
- Address: ${addr}

We reply within one working day (Monday to Saturday, 10 am – 7 pm). You can also use the form on this page.`,
    shipping: `## Where we ship
We deliver across India.

## Charges
Shipping is ₹${fee} per order${free ? `, and free on orders of ₹${free} or more` : ''}.

## When it arrives
- Ready-made items are dispatched within 1–3 working days and usually arrive within 3–7 working days.
- Made-to-order items are dispatched after stitching. The stitching time is shown on each product; our tailor confirms your measurements first.

You get an email with the tracking details when your order ships.

## Cash on delivery
Where cash on delivery is offered, please keep the exact amount ready.`,
    returns: `## Returns
You can ask for a return within ${days} days of delivery from My orders, for items in their original condition with tags.

Custom-fit garments (made to your own measurements) cannot be returned, because they are made only for you. If something is wrong with the stitching, contact us and we will alter or remake it.

## Refunds
- Online payments are refunded to the original payment method within 5–7 working days after we receive the item.
- Cash on delivery orders are refunded by bank transfer (UPI or account) after we receive the item.

## Cancellations
You can cancel from My orders until we start preparing your order. A paid order is refunded in full.`,
    privacy: `${legal} ("we") respects your privacy. This policy explains what we collect and why.

## What we collect
- Your name, phone number, email and delivery address, to deliver your orders and contact you about them.
- Login details (email, phone or Google). Passwords are stored encrypted.
- Photos you use for the face preview are processed only to make the preview and are not stored on our servers.
- Payment details are handled by Razorpay; we never see or store your card or UPI details.

## How we use it
Only to run your orders, your account and customer support, and to meet legal and tax requirements. We do not sell your data.

## Your choices
Write to ${email} to see, correct or delete your personal data.`,
    terms: `By using this website and placing an order with ${legal}, you agree to these terms.

## Orders and prices
Prices are in Indian Rupees and include GST unless shown otherwise. An order is confirmed when payment succeeds or, for cash on delivery, when we confirm it.

## Made-to-order items
Garments stitched to your measurements are made after our tailor confirms the details with you. Small differences in colour from the screen are normal.

## Payments
Online payments are processed securely by Razorpay.

## Returns
See our Returns & refunds policy.

## Contact
${legal}, ${addr}. Email: ${email}. Phone: ${phone}.`,
  };
}
