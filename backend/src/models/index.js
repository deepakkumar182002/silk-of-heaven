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
  },
  opts
);
adminSchema.set('toJSON', {
  transform: (_, r) => {
    delete r.passwordHash;
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
  // ---- fitting room (mix & match) ----
  photo: { type: String, default: '' }, // product photo of the item
  photoPublicId: { type: String, default: '' },
  layer: { type: String, default: '' }, // 1360×2048 transparent PNG of the item placed on this look; '' = part of the look image
  layerPublicId: { type: String, default: '' },
  slot: { type: String, default: '' }, // see SLOTS in utils/pieces.js; items in one slot replace each other
  defaultOn: { type: Boolean, default: false }, // shown when the look first opens
});
const lookSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, lowercase: true },
    image: { type: String, required: true },
    imagePublicId: { type: String, default: '' },
    pieces: {
      tops: { type: [pieceSchema], default: [] },
      bottoms: { type: [pieceSchema], default: [] },
      full: { type: [pieceSchema], default: [] },
      shoes: { type: [pieceSchema], default: [] },
      acc: { type: [pieceSchema], default: [] },
    },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  opts
);
export const Look = model('Look', lookSchema);

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
  },
  opts
);
export const Setting = model('Setting', settingSchema);

// ---------- Order (made-to-order stitching request) ----------
export const ORDER_STATUSES = ['new', 'contacted', 'stitching', 'ready', 'delivered', 'cancelled'];

const measurementsSchema = new Schema(
  { bust: Number, waist: Number, hips: Number, length: Number },
  { _id: false }
);
const orderItemSchema = new Schema({
  look: { type: Schema.Types.ObjectId, ref: 'Look' },
  lookName: String,
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
const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
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
    total: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
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
    deliveredAt: Date,
  },
  opts
);
orderSchema.index({ createdAt: -1 });
export const Order = model('Order', orderSchema);
