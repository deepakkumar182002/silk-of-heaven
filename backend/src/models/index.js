import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const opts = { timestamps: true, versionKey: false };

// ---------- Admin ----------
const adminSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: 'Admin' },
    // admin: full access · tailor: sees orders & updates their status only
    role: { type: String, enum: ['admin', 'tailor'], default: 'admin' },
    resetTokenHash: { type: String, default: undefined }, // forgot password (sha256 of the emailed token)
    resetExpires: { type: Date, default: undefined },
  },
  opts
);
adminSchema.set('toJSON', {
  transform: (_, r) => {
    delete r.passwordHash;
    delete r.resetTokenHash;
    delete r.resetExpires;
    return r;
  },
});
export const Admin = model('Admin', adminSchema);

// ---------- Look (outfit cut-out) ----------
const colorOptionSchema = new Schema(
  { name: { type: String, required: true, trim: true }, hex: { type: String, default: '', trim: true } },
  { _id: false }
);
// A shoppable garment inside a look. Keeps its own _id so carts / orders can reference it.
const pieceSchema = new Schema({
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '', trim: true }, // default colour
  price: { type: Number, default: 0, min: 0 },
  description: { type: String, default: '', trim: true },
  fabric: { type: String, default: '', trim: true },
  care: { type: String, default: '', trim: true },
  // undefined (not []) so legacy pieces can be detected and back-filled
  sizes: { type: [String], default: undefined },
  colors: { type: [colorOptionSchema], default: undefined },
  madeToOrder: { type: Boolean, default: true }, // true = stitched by a tailor; false = ready-made
  leadTimeDays: { type: Number, default: 5, min: 0 },
  stock: { type: Number, default: null, min: 0 }, // ready-made stock; null = not tracked (made to order)
  // ---- fitting room (mix & match) ----
  photo: { type: String, default: '' }, // product photo of the item
  photoPublicId: { type: String, default: '' },
  layer: { type: String, default: '' }, // 1360×2048 transparent PNG of the item placed on this look; '' = part of the look image
  layerPublicId: { type: String, default: '' },
  slot: { type: String, default: '' }, // see SLOTS in utils/pieces.js; items in one slot replace each other
  defaultOn: { type: Boolean, default: false }, // shown when the look first opens
});
// An item from the library attached to a look (see Item below)
const lookItemSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    defaultOn: { type: Boolean, default: false }, // worn when the look first opens
  },
  { _id: false }
);
const lookSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, lowercase: true },
    body: { type: String, default: 'women', trim: true, lowercase: true }, // Body.key of the model wearing it
    image: { type: String, required: true },
    imagePublicId: { type: String, default: '' },
    pieces: {
      tops: { type: [pieceSchema], default: [] },
      bottoms: { type: [pieceSchema], default: [] },
      full: { type: [pieceSchema], default: [] },
      shoes: { type: [pieceSchema], default: [] },
      acc: { type: [pieceSchema], default: [] },
    },
    items: { type: [lookItemSchema], default: [] }, // shoes, bags, jewellery… picked from the item library
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  opts
);
export const Look = model('Look', lookSchema);

// ---------- Body model (Women / Men / Kids …) ----------
// Every look of a body is a 1360×2048 cut-out of the SAME person in the SAME pose and position as `image`,
// so item layers and the visitor's face line up on all of them.
export const AUDIENCES = ['women', 'men', 'kids'];
const boxSchema = new Schema({ x: Number, y: Number, w: Number, h: Number }, { _id: false });
const bodySchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    audience: { type: String, enum: AUDIENCES, default: 'women' },
    image: { type: String, default: '' }, // base model (plain clothes), 1360×2048 transparent cut-out
    imagePublicId: { type: String, default: '' },
    height: { type: Number, default: 168, min: 50, max: 230 }, // cm, reference for the website height slider
    face: { type: boxSchema, default: undefined }, // face box on the canvas, found by the face service
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  opts
);
export const Body = model('Body', bodySchema);

// ---------- Item library: admin-defined categories (Shoes, Bags, Jewellery…) ----------
const itemCategorySchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    // where it sits on the model (utils/pieces.js SLOTS) or 'none' = shop only, never drawn on the model
    slot: { type: String, default: 'none' },
    multi: { type: Boolean, default: false }, // several items of this category can be worn together
    icon: { type: String, default: 'acc' },
    sizes: { type: [String], default: [] }, // default sizes for new items
    order: { type: Number, default: 0 },
  },
  opts
);
export const ItemCategory = model('ItemCategory', itemCategorySchema);

// ---------- Item library: one product, reusable in many looks ----------
const itemLayerSchema = new Schema(
  {
    body: { type: String, required: true }, // Body.key this layer was placed on
    image: { type: String, required: true }, // 1360×2048 transparent PNG, the item only
    imagePublicId: { type: String, default: '' },
  },
  { _id: false }
);
const itemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, lowercase: true }, // ItemCategory.key
    price: { type: Number, default: 0, min: 0 },
    color: { type: String, default: '', trim: true },
    colors: { type: [colorOptionSchema], default: [] },
    sizes: { type: [String], default: [] },
    description: { type: String, default: '', trim: true },
    fabric: { type: String, default: '', trim: true },
    care: { type: String, default: '', trim: true },
    madeToOrder: { type: Boolean, default: false },
    leadTimeDays: { type: Number, default: 5, min: 0 },
    stock: { type: Number, default: null, min: 0 }, // null = not tracked
    photo: { type: String, default: '' }, // product photo for the shop
    photoPublicId: { type: String, default: '' },
    layers: { type: [itemLayerSchema], default: [] }, // one per body it can be tried on
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  opts
);
export const Item = model('Item', itemSchema);

// ---------- Category ----------
const categorySchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    icon: { type: String, default: 'tee' },
    order: { type: Number, default: 0 },
  },
  opts
);
export const Category = model('Category', categorySchema);

// ---------- Identity (character profile) ----------
const identitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 1 },
    city: { type: String, required: true, trim: true },
    temp: { type: Number, default: 14 },
    body: { type: String, default: 'women', trim: true, lowercase: true }, // Body.key this character uses
    order: { type: Number, default: 0 },
  },
  opts
);
export const Identity = model('Identity', identitySchema);

// ---------- Tune group (Face, Hair, Makeup, Accessories, Tattoos, Details) ----------
export const TUNE_KEYS = ['Face', 'Hair', 'Makeup', 'Accessories', 'Tattoos', 'Details'];
const tuneSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, enum: TUNE_KEYS },
    presets: { type: [String], default: [] },
    swatches: { type: [String], default: [] },
    sliders: {
      type: [
        new Schema(
          { name: { type: String, required: true }, value: { type: Number, min: 0, max: 100, default: 50 } },
          { _id: false }
        ),
      ],
      default: [],
    },
    multi: { type: Boolean, default: false },
    multiLabel: { type: String, default: '' },
  },
  opts
);
export const TuneGroup = model('TuneGroup', tuneSchema);

// ---------- Filter ----------
const filterSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    filter: { type: String, default: 'none' },
    tint: { type: String, default: 'transparent' },
    order: { type: Number, default: 0 },
  },
  opts
);
export const Filter = model('Filter', filterSchema);

// ---------- Site settings (singleton) ----------
const settingSchema = new Schema(
  {
    key: { type: String, default: 'site', unique: true },
    background: { type: String, default: '' },
    backgroundPublicId: { type: String, default: '' },
    // AI try-on: the model every dress is fitted on (1360×2048 transparent cut-out, same pose as the looks)
    baseModel: { type: String, default: '' },
    baseModelPublicId: { type: String, default: '' },
    traits: { type: [String], default: [] },
    defaultTraits: { type: [String], default: [] },
    // ---- shop: prices, tax, shipping, payments ----
    shop: {
      currency: { type: String, default: 'INR' },
      gstRate: { type: Number, default: 5, min: 0, max: 40 }, // %
      pricesIncludeTax: { type: Boolean, default: true }, // Indian MRP style: GST already inside the price
      shippingFee: { type: Number, default: 99, min: 0 },
      freeShippingOver: { type: Number, default: 1999, min: 0 }, // 0 = never free
      onlinePayments: { type: Boolean, default: true }, // Razorpay
      codEnabled: { type: Boolean, default: true },
      codFee: { type: Number, default: 0, min: 0 },
      returnWindowDays: { type: Number, default: 7, min: 0 },
      reviewsAutoApprove: { type: Boolean, default: false },
    },
    // ---- business details: invoices, contact page, emails ----
    store: {
      legalName: { type: String, default: '' },
      gstin: { type: String, default: '' },
      address: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
      instagram: { type: String, default: '' },
    },
    // ---- promotions: look of the announcement bar, banner slide timing ----
    promo: {
      barBg: { type: String, default: '#b0154a' },
      barColor: { type: String, default: '#ffffff' },
      barSpeed: { type: Number, default: 40, min: 10, max: 200 }, // px per second
      bannerInterval: { type: Number, default: 5, min: 2, max: 30 }, // seconds per banner slide
    },
    // ---- policy / info pages (plain text, blank line = new paragraph, "## " = heading) ----
    pages: {
      about: { type: String, default: '' },
      contact: { type: String, default: '' },
      shipping: { type: String, default: '' },
      returns: { type: String, default: '' },
      privacy: { type: String, default: '' },
      terms: { type: String, default: '' },
    },
  },
  opts
);
export const Setting = model('Setting', settingSchema);

// ---------- Order (made-to-order stitching request) ----------
// awaiting_payment: created at checkout, waiting for the online payment (hidden from the tailor's queue)
export const ORDER_STATUSES = ['awaiting_payment', 'new', 'contacted', 'stitching', 'ready', 'shipped', 'delivered', 'cancelled'];
export const PAYMENT_STATUSES = ['unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'];
export const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'received', 'refunded'];

const measurementsSchema = new Schema(
  { bust: Number, waist: Number, hips: Number, length: Number },
  { _id: false }
);
const orderItemSchema = new Schema({
  look: { type: Schema.Types.ObjectId, ref: 'Look' },
  lookName: String,
  item: { type: Schema.Types.ObjectId, ref: 'Item', default: undefined }, // set for item-library products
  group: String,
  piece: Schema.Types.ObjectId,
  name: { type: String, required: true },
  image: String,
  fabric: String,
  color: String,
  colorHex: String,
  size: { type: String, required: true }, // standard size or "Custom"
  measurements: { type: measurementsSchema, default: undefined },
  qty: { type: Number, required: true, min: 1, max: 10 },
  unitPrice: { type: Number, required: true, min: 0 },
  madeToOrder: { type: Boolean, default: true },
  leadTimeDays: { type: Number, default: 0 },
  notes: { type: String, default: '' },
});
const returnSchema = new Schema(
  {
    items: {
      type: [new Schema({ item: { type: Schema.Types.ObjectId, required: true }, name: String, qty: { type: Number, min: 1 } }, { _id: false })],
      default: [],
    },
    reason: { type: String, default: '' },
    details: { type: String, default: '' },
    status: { type: String, enum: RETURN_STATUSES, default: 'requested' },
    refundAmount: { type: Number, default: 0 },
    note: { type: String, default: '' }, // shown to the customer
    requestedAt: { type: Date, default: Date.now },
    resolvedAt: Date,
    restocked: { type: Boolean, default: false },
  },
  { _id: true }
);
const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    customerRef: { type: Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    invoiceNumber: { type: String, default: '' },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      phoneNorm: { type: String, required: true, index: true },
      email: { type: String, default: '' },
      contactPref: { type: String, enum: ['phone', 'whatsapp', 'email'], default: 'phone' },
    },
    address: {
      line1: { type: String, required: true },
      line2: { type: String, default: '' },
      city: { type: String, required: true },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      country: { type: String, default: '' },
    },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, default: '' },
    shipping: { type: Number, default: 0 },
    codFee: { type: Number, default: 0 },
    tax: { type: Number, default: 0 }, // GST amount (inside the total when taxIncluded)
    taxRate: { type: Number, default: 0 },
    taxIncluded: { type: Boolean, default: true },
    total: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    payment: {
      method: { type: String, enum: ['razorpay', 'cod', 'manual'], default: 'manual' },
      status: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
      razorpayOrderId: { type: String, default: '' },
      razorpayPaymentId: { type: String, default: '' },
      paidAt: Date,
      refunded: { type: Number, default: 0 },
      refunds: { type: [new Schema({ id: String, amount: Number, note: String, at: { type: Date, default: Date.now } }, { _id: false })], default: [] },
    },
    stockReserved: { type: Boolean, default: false }, // ready-made stock taken for this order
    couponCounted: { type: Boolean, default: false },
    returns: { type: [returnSchema], default: [] },
    notes: { type: String, default: '' }, // customer's note for the whole order
    status: { type: String, enum: ORDER_STATUSES, default: 'new', index: true },
    // status changes; `note` is shown to the customer on the tracking page
    history: {
      type: [new Schema({ status: String, note: { type: String, default: '' }, by: { type: String, default: '' }, at: { type: Date, default: Date.now } }, { _id: false })],
      default: [],
    },
    // staff-only notes
    internalNotes: {
      type: [new Schema({ text: String, by: String, at: { type: Date, default: Date.now } })],
      default: [],
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    contactedAt: Date,
    startedAt: Date,
    readyAt: Date,
    shippedAt: Date,
    deliveredAt: Date,
    tracking: { carrier: { type: String, default: '' }, number: { type: String, default: '' }, url: { type: String, default: '' } },
  },
  opts
);
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'payment.razorpayOrderId': 1 });
export const Order = model('Order', orderSchema);

// ---------- Customer accounts (website) ----------
const addressSchema = new Schema({
  label: { type: String, default: 'Home', trim: true },
  name: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  line1: { type: String, required: true, trim: true },
  line2: { type: String, default: '', trim: true },
  city: { type: String, required: true, trim: true },
  state: { type: String, default: '', trim: true },
  pincode: { type: String, default: '', trim: true },
  country: { type: String, default: 'India', trim: true },
  isDefault: { type: Boolean, default: false },
});
const customerSchema = new Schema(
  {
    name: { type: String, default: '', trim: true },
    email: { type: String, lowercase: true, trim: true, default: undefined }, // unique when present
    phone: { type: String, trim: true, default: undefined }, // 10 digits (India), unique when present
    passwordHash: { type: String, default: undefined },
    googleUid: { type: String, default: undefined },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    avatar: { type: String, default: '' },
    addresses: { type: [addressSchema], default: [] },
    wishlist: {
      type: [new Schema({ lookId: String, group: String, pieceId: String, addedAt: { type: Date, default: Date.now } }, { _id: false })],
      default: [],
    },
    resetTokenHash: { type: String, default: undefined },
    resetExpires: { type: Date, default: undefined },
    lastLoginAt: Date,
    blocked: { type: Boolean, default: false },
  },
  opts
);
customerSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
customerSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
customerSchema.index({ googleUid: 1 }, { unique: true, partialFilterExpression: { googleUid: { $type: 'string' } } });
customerSchema.set('toJSON', {
  transform: (_, r) => {
    r.hasPassword = !!r.passwordHash;
    delete r.passwordHash;
    delete r.resetTokenHash;
    delete r.resetExpires;
    delete r.googleUid;
    return r;
  },
});
export const Customer = model('Customer', customerSchema);

// ---------- Phone OTP (expires on its own) ----------
const otpSchema = new Schema({
  phone: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Otp = model('Otp', otpSchema);

// ---------- Coupons ----------
const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '', trim: true },
    type: { type: String, enum: ['percent', 'flat'], default: 'percent' },
    value: { type: Number, required: true, min: 0 },
    minSubtotal: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 }, // 0 = no cap (percent coupons)
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    usageLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    perCustomer: { type: Number, default: 0, min: 0 }, // 0 = unlimited (needs login to count)
    firstOrderOnly: { type: Boolean, default: false },
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  opts
);
export const Coupon = model('Coupon', couponSchema);

// ---------- Product reviews ----------
const reviewSchema = new Schema(
  {
    productId: { type: String, required: true, index: true }, // piece id or library item id
    productName: { type: String, default: '' },
    lookId: { type: String, default: '' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    name: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '', trim: true },
    text: { type: String, default: '', trim: true },
    verified: { type: Boolean, default: false }, // bought and delivered
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  },
  opts
);
reviewSchema.index({ productId: 1, customer: 1 }, { unique: true });
export const Review = model('Review', reviewSchema);

// ---------- Promotions: announcement bar messages, shop banners, offer popups ----------
export const PROMO_KINDS = ['announcement', 'banner', 'popup'];
const promoSchema = new Schema(
  {
    kind: { type: String, enum: PROMO_KINDS, required: true, index: true },
    title: { type: String, default: '', trim: true }, // banner heading / popup title
    text: { type: String, default: '', trim: true }, // announcement message / banner sub-line / popup message
    media: { type: String, default: '' }, // banner image or popup image / GIF / video
    mediaPublicId: { type: String, default: '' },
    mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
    mobileMedia: { type: String, default: '' }, // optional narrower banner image for phones
    mobileMediaPublicId: { type: String, default: '' },
    link: { type: String, default: '', trim: true }, // "/shop", "/product/…" or https://…
    buttonText: { type: String, default: '', trim: true },
    textColor: { type: String, default: '#ffffff' }, // banner text colour over the image
    align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
    autoClose: { type: Number, default: 10, min: 0, max: 120 }, // popup: seconds until it hides itself, 0 = stays
    delay: { type: Number, default: 2, min: 0, max: 120 }, // popup: seconds after the page opens
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  opts
);
export const Promo = model('Promo', promoSchema);

// ---------- Notifications: shown in the website's bell, also sent as browser push ----------
const notificationSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },
    image: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    link: { type: String, default: '' }, // "/shop", "/account/orders/…" or https://…
    type: { type: String, enum: ['custom', 'order'], default: 'custom' },
    audience: { type: String, enum: ['all', 'selected'], default: 'all' },
    recipients: { type: [{ type: Schema.Types.ObjectId, ref: 'Customer' }], default: [], index: true },
    push: { sent: { type: Number, default: 0 }, failed: { type: Number, default: 0 } },
    sentBy: { type: String, default: '' },
  },
  opts
);
notificationSchema.index({ audience: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema);

// ---------- Browser push subscriptions (one per browser) ----------
const pushSubSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    userAgent: { type: String, default: '' },
  },
  opts
);
export const PushSub = model('PushSub', pushSubSchema);
