# VELL — Character Creator

Three separate apps:

| Folder      | What                                   | Stack                                              | Dev URL               |
|-------------|----------------------------------------|----------------------------------------------------|-----------------------|
| `backend/`  | REST API, auth, image uploads          | Node · Express · MongoDB (Mongoose) · Cloudinary · JWT | http://localhost:5050 |
| `website/`  | Public VELL character studio           | React 18 + Vite                                    | http://localhost:5173 |
| `admin/`    | Admin panel to manage all content      | React 18 + Vite + React Router                     | http://localhost:5174 |

## Run locally

```bash
# 1. API (first start seeds the default content + creates the admin account)
cd backend && npm install && npm run dev

# 2. Website
cd website && npm install && npm run dev

# 3. Admin panel
cd admin && npm install && npm run dev
```

Admin login = `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env` (used only to create the first admin; change the password afterwards in **Site Settings**).

## Configuration

- `backend/.env`: Mongo URI, Cloudinary keys, JWT secret, first admin, allowed CORS origins (`CLIENT_ORIGINS`). See `.env.example`.
- `website/.env` and `admin/.env`: `VITE_API_URL` (the API base URL). `admin/.env` also has `VITE_SITE_URL`.

When deploying, set `VITE_API_URL` to the public API URL before `npm run build`, and add the deployed website and admin URLs to `CLIENT_ORIGINS`.

## What the admin manages

- **Orders** (admin + tailor): incoming stitching requests, customer contact buttons, status workflow, notes. See "Ordering & tailoring" below.
- **Team** (admin): create tailor accounts.
- **Looks & Dresses**: cut-out image (uploaded to Cloudinary), category, shoppable pieces (name, colour, price) and, per piece, shop details: description, fabric, care, colour options, sizes, made-to-order or ready-made, stitching time. Show/hide, order.
- **Characters**: name, age, city, temperature for the profile card and Shuffle.
- **Categories**: outfit filter chips with icons.
- **Face, Hair & Styling**: presets, colour swatches and sliders for Face, Hair, Makeup, Accessories, Tattoos and Details.
- **Filters**: CSS colour grades with live preview.
- **Site Settings**: scene background, personality traits, admin password.

The website loads everything from `GET /api/public/catalog` on startup. If the API is unreachable, it falls back to the built-in default content.

## API overview

| Method | Path                                   | Auth |
|--------|----------------------------------------|------|
| GET    | `/api/public/catalog`                  | —    |
| POST   | `/api/auth/login`                      | —    |
| GET    | `/api/auth/me`                         | JWT  |
| PUT    | `/api/auth/password`                   | JWT  |
| POST   | `/api/upload?folder=looks` (multipart `file`) | JWT |
| CRUD   | `/api/admin/{looks,categories,identities,filters}` (+ `PUT …/reorder`) | JWT |
| GET/PUT| `/api/admin/tune`, `/api/admin/tune/:key` | JWT |
| GET/PUT| `/api/admin/settings`                  | JWT  |
| GET    | `/api/admin/stats`                     | JWT  |

Seeding: `npm run seed` (fills empty collections) · `npm run seed:reset` (wipes content, not admins, and restores defaults).

## Ordering & tailoring

**Customer (website):** open a look → expand a garment row (Tops, Bottoms…) → tap the piece. The product sheet shows description, fabric, care and stitching time, and lets the customer switch garment within the look, pick a colour and a size (or **Custom fit** with bust / waist / hips / length), set quantity and add notes for the tailor. The cart (top-right icon) is saved in the browser. **Place order** asks for name, phone, address and how the tailor should reach them (call / WhatsApp / email). No payment is taken: the tailor confirms details and price first. The customer gets an order number and can follow progress from **More → Track order** (order number + phone).

**Tailor (admin panel):** sign in with a tailor account (created by an admin under **Team**). Tailors see only **Dashboard** and **Orders**.

1. **New**: the order appears with a badge in the sidebar. Open it to see the customer, address, every garment with colour, size or measurements, and notes.
2. Contact the customer with the **Call / WhatsApp / Email** buttons (their preferred way is highlighted), then press **Mark as contacted**.
3. **Start stitching** once measurements are confirmed → **Mark as ready** → **Mark as delivered**.
4. Each step can carry a message that the customer sees on the tracking page. Internal notes stay staff-only. Moving an unassigned order forward assigns it to that tailor; admins can reassign.

Prices, colours, sizes and options are always re-read from the database when an order is placed, so a customer cannot change a price from the browser.

### Extra API

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/public/orders` | none (rate limited) |
| POST | `/api/public/orders/track` | order number + phone |
| GET | `/api/admin/orders`, `/stats`, `/staff`, `/:id` | admin or tailor |
| PUT | `/api/admin/orders/:id/status`, `/:id/assign` · POST `/:id/notes` | admin or tailor |
| DELETE | `/api/admin/orders/:id` | admin |
| CRUD | `/api/admin/team` | admin |
