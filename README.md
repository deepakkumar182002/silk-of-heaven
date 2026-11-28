# Silk of Heaven — shop & fitting room

Three separate apps:

| Folder      | What                                   | Stack                                              | Dev URL               |
|-------------|----------------------------------------|----------------------------------------------------|-----------------------|
| `backend/`  | REST API, auth, image uploads          | Node · Express · MongoDB (Mongoose) · Cloudinary · JWT | http://localhost:5050 |
| `website/`  | Public shop + fitting room             | React 18 + Vite                                    | http://localhost:5173 |
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
- **Body models**: the person looks are shown on (Women, Men, Boys, Girls…). Each has a base image (1360 × 2048 cut-out, plain clothes), a height for the website slider, and its face position (found by the face service on save; used for avatars and the face swap). On the website, visitors switch between bodies in the fitting room and filter the shop with "For".
- **Items**: an item library in the admin's own categories (Footwear, Bags, Jewellery, Dupattas, or anything else). A category says where its items sit on the model and whether several can be worn at once. An item has shop details plus one try-on layer per body model: upload a PNG, generate it with AI, or use **Place photo** (drag, resize, rotate and remove a plain background in the browser, no AI). Attach items to looks in **Looks & Dresses → Items from the library**; the website then shows them category by category, lets visitors show / hide / swap them on the model, and sells them (orders are checked against the database: item still active, still on that look, valid size, price from the DB).
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

## AI try-on (Gemini)

Optional: without a key, upload look cut-outs and item layers by hand as before. Set `GEMINI_API_KEY` in `backend/.env` (key from aistudio.google.com) and restart the API. `GEMINI_IMAGE_MODEL` defaults to `gemini-2.5-flash-image`. Each generation is one paid Gemini image call.

All looks share one canvas: 1360 × 2048 px, same model, same pose. The pipeline keeps it that way. The AI output is aligned back onto the model's head (scale + shift search). The backdrop is keyed out, and the original face is pasted back. So looks, item layers and face layers always line up.

| Where | What it does |
|---|---|
| Admin → Looks → **Create from dresses** | Drop many dress photos, one look each (extra angles per dress allowed). The AI dresses the base model; review, name, price, then save. |
| Admin → Look editor → **Generate from dress photos** | Same for one look. |
| Admin → Look editor → **Mix & match (fitting room)** | Drop item photos (shoes, bag, dupatta, jewellery, kurti, saree, …) and pick a type. Each becomes a shoppable piece plus a transparent **layer** placed on that look. "Worn by default" decides what shows first. You can also upload your own 1360 × 2048 layer PNG. |
| Admin → Site Settings → **AI base model** | The model every dress is put on. Best: plain fitted basics, barefoot. "Create plain base with AI" makes one from the first look. |
| Website → Fitting room → **Try with your face** | The visitor uploads a front-facing photo or takes a selfie with the camera, and gets a face layer that sits on every look. It runs on the free local face service (below), or on Gemini if that service is down. The photo is not stored; the result stays in the browser (localStorage). Rate limited per IP (`FACE_SWAP_PER_HOUR`, default 20). |
| Website → Fitting room → **Mix & match** | Show, hide or swap the look's items. No AI runs here, it only stacks the layers. Items of one type replace each other; jewellery can be combined. |

Limits: a layer can only add on top of the look. A replacement that is smaller than what it covers (for example a crop top over a long kurta) leaves the original visible. Generate those as separate looks instead.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/admin/ai/status` | JWT |
| POST | `/api/admin/ai/look` (multipart `photos` 1–4, `notes`, `keepFace`) | JWT |
| POST | `/api/admin/ai/layer` (multipart `photos` or `photoUrl`, `lookImage`, `slot`, `name`) | JWT |
| POST | `/api/admin/ai/base` (`fromUrl`) | JWT |
| POST | `/api/public/tryon/face` (multipart `photo`, `consent=yes`) | rate limited |

## Face service (free face swap, no paid AI)

`face-service/` is a small Python app (FastAPI), with no paid AI. The pipeline in `swap.py`:

1. **Detect.** OpenCV YuNet finds faces of any size anywhere in the photo. The largest face is cropped and zoomed.
2. **Measure.** MediaPipe Face Landmarker finds 478 points and the 3D head pose (yaw, pitch, roll).
3. **Occlusions.** MediaPipe multiclass selfie segmentation (face skin, hair, body skin, clothes, accessories), plus a skin-colour model, finds hair, hats and hands over the face. Those pixels are treated as unknown, so the model's own skin shows there.
4. **Shape.** A Procrustes alignment keeps about 80% of the visitor's eye, nose and lip proportions, inside the model's face outline.
5. **Warp.** A Delaunay piece-wise affine warp, after area-filtered pre-scaling so detail stays sharp.
6. **Frontalize.** On a turned head, the far side is rebuilt from the mirrored near side. The left/right point pairs come from MediaPipe's canonical face model. The outer band of the far cheek keeps the model's skin.
7. **Blend.** LAB colour transfer, relighting (the model's large-scale shading with the visitor's detail), a light unsharp mask, then Laplacian pyramid (multi-band) blending.

Only the face, from the brows to the chin, is returned. Hair and ears stay the model's. Models download on first start into `face-service/models/`. MediaPipe, OpenCV and YuNet are Apache-2.0 / MIT, so commercial use is fine. Photos get a clear message when the face is missing, too small, turned more than about 38° or tilted more than about 32°, covered, has closed eyes, or is blurry. The response also has `notes`, for example when a slightly turned face was completed by symmetry.

```bash
# Windows: first run creates .venv and installs requirements (needs Python 3.9–3.12)
face-service\start.cmd
# Linux / macOS
face-service/start.sh
```

It listens on `http://127.0.0.1:5065`. The website face swap is not rate limited for requests from localhost, so testing locally never hits the limit (keep it private; only the API calls it). Backend settings: `FACE_SERVICE_URL`, and `FACE_ENGINE` = `auto` (local first, then Gemini), `local` or `gemini`. Photos are rejected with a clear message when there is no face, the face is too small, turned or tilted, the eyes are closed, or the photo is blurry.

Note: Node's `fetch` blocks some ports (5060 and 5061 are SIP), so keep the service on 5065 or another unblocked port.

Body tab: height in cm or ft/in (145–190 cm), build from slim to full, and quick body types (Petite, Average, Tall, Very tall, Curvy).

### Deploying the face service

Vercel cannot run it: MediaPipe + OpenCV are about 375 MB, over Vercel's serverless function size limit. Deploy `face-service/` anywhere that runs Docker (the `Dockerfile` downloads the models at build time and uses about 300 MB RAM):

- **Hugging Face Spaces (free):** new Space → SDK **Docker** → upload `app.py`, `swap.py`, `requirements.txt`, `Dockerfile`, `README.md` from `face-service/`. Under Settings → Variables and secrets add the secret `FACE_SERVICE_TOKEN`. The URL is `https://<user>-<space>.hf.space`.
- **Render / Railway / Cloud Run:** new web service from this repo, root directory `face-service`, Docker runtime, env `FACE_SERVICE_TOKEN`.

Then set in the API's environment: `FACE_SERVICE_URL=<that URL>`, `FACE_SERVICE_TOKEN=<same secret>`, `FACE_ENGINE=local`, and redeploy the API. Check with `GET <url>/health`.

### Keeping every body model aligned

All looks, item layers and the visitor's face of one body model share its base image's pose and position on the 1360 × 2048 canvas. In the look editor, slide **Alignment** to show the body model on top of the look, and use **Auto-align** (face service `POST /align`) to fix size and position: it finds the face with YuNet, then refines scale and shift with OpenCV ECC image alignment on the face and hair region (sub-pixel on test images, and within 0.5% between different outfits of the same model). The face swap crops the head wherever the body's face is, so men and kids models work too.

## Shop: payments, accounts, orders

- **Prices in ₹ with GST** (Site Settings → Shop, tax & payments): GST rate, prices including or excluding GST, shipping fee and free-shipping threshold, cash on delivery (+ fee), return window. The server prices every cart itself (`POST /api/public/checkout/quote`).
- **Payments**: Razorpay Checkout (UPI, cards, net banking) or cash on delivery. The order waits in `awaiting_payment` until the payment signature is verified (`/checkout/verify`), or the Razorpay webhook confirms it. Unpaid checkouts expire after 30 minutes and give their stock back.
- **Accounts**: phone + OTP (SMSGatewayHub), email + password (with reset by email), Google (Firebase Auth; the API only needs `FIREBASE_PROJECT_ID`). My account: orders with tracking, invoice PDF, cancel, return requests; wishlist; saved addresses; profile.
- **Stock**: ready-made pieces and items have an optional stock count; it is reserved when an order is placed, released on cancel / failed payment, and restocked when a return is received.
- **Coupons, reviews** (verified-buyer badge, admin approval), **customers list**, **sales reports**, **GST invoices** (`INV/2026-27/0001`, numbered per financial year) and **returns / refunds** (Razorpay refunds API) in the admin.
- **Emails**: order confirmation to the customer, new-order alert to the store, status updates (stitching, shipped with tracking, delivered), returns, password resets.
- **Pages & SEO**: real URLs (`/shop`, `/product/<name>-<id>`, `/account`, `/pages/returns`…), per-page title / description / Open Graph tags, `robots.txt` and a sitemap at `<API>/api/public/sitemap.xml`. About, Contact (with form), Shipping, Returns, Privacy and Terms pages are editable in Site Settings.

Deploying: add the new backend variables from `backend/.env.example` on Vercel (backend project), and `VITE_FIREBASE_*` on the website project. In Firebase → Authentication, enable Google and add the website domain to Authorized domains. In Razorpay, add the webhook. Switch to live Razorpay keys after KYC.

## Promotions (announcement bar, banners, popups)

Admin → **Promotions** has three tabs:

- **Announcement bar**: messages that scroll right to left above the header on every page (shop and fitting room). You can set the colours and speed. Each message can link to a page.
- **Shop banners**: images or GIFs (about 1600 × 500, plus an optional phone image) shown at the top of the shop as an auto-sliding carousel. You can set the seconds per slide. Visitors can also swipe or use the arrows.
- **Offer popups**: an image, GIF or video with **Skip** and **Show more** buttons.
  - It shows after *N* seconds and closes by itself after 10, 15, 20 or 30 s, or never.
  - **Skip**, or letting it close by itself, shows it again on the visitor's next visit.
  - **Show more**, or watching a video to the end, hides it from that visitor for good.
  - To show a new offer to everyone again, add a new popup.

Each promotion can be scheduled (start and end dates) and switched off any time.

Videos and big GIFs upload straight from the admin to Cloudinary through a signed upload (`GET /api/upload/sign`), because Vercel's request limit is about 4.5 MB.

## Men & Kids body models

`npm run gen:bodies` (in `backend/`) generates the **Men** and **Kids** body models, in the same format as the Women looks:

- a 1360 × 2048 transparent cut-out, full body, same pose and framing
- 6 looks each (everyday, athletic, sleep, formal, party, street), with ₹ prices
- 2–3 characters each

Every look is aligned on its body's base model, and the face is kept the same.

It needs `GEMINI_API_KEY` with **billing on** (image generation is not in Gemini's free tier). Run the face service too, so it can find the face box.

The script is safe to run again: it only makes what is missing. Use `npm run gen:bodies -- kids` to make just one body.

## Notifications (website bell + browser push)

Admin → **Notifications**: write a title, a description, an optional image and a link, then send it to **all users** or to **chosen customers**.

- **Website bell:** every notification appears in the bell on the website. Opening one shows the full image and description, and a button for the link.
  - Guests see notifications sent to everyone.
  - Logged-in customers also see their own.
- **Browser push:** visitors who allow notifications get them on their phone or computer, even when the site is closed.
  - Allow from the bell panel, or from the small "Don't miss an offer" prompt that appears once per visit after 25 s.
  - Tapping a push opens that notification on the site.
  - On iPhone, push works only after "Add to Home Screen" (iOS 16.4+).
- **Order updates are automatic:** order confirmed, stitching, ready, shipped (with tracking), delivered, cancelled and return updates go to that customer.

Push uses the Web Push standard with our own VAPID keys (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in `backend/.env`). This is the same technology Firebase Cloud Messaging uses in browsers, without needing a Firebase service account. The service worker is `website/public/sw.js`.

## Home page, shop list and product photos

- **`/` (home):** banners, search, "Shop by style", "Shop for" (Women / Men / Kids), a swipeable row per item type, complete looks, and cards for custom stitching and the fitting room. There are no filters here: every tile opens the shop list with that filter set, for example `/shop?style=party`, `/shop?type=shoes` or `/shop?for=men`.
- **`/shop`:** all items, with the filters.
- **Product photos:** every look piece (Looks → piece details) and library item (Items) can have up to 8 extra photos. The product page shows them as a swipeable gallery, followed by the look.
- **Product page:** standard sizes only. **Add to cart** and **Buy now** stay pinned on screen on phones, also with large system fonts. Custom fit is a separate service (below).

## Payments: COD charge rules

Site Settings → Shop:
- **COD fee.**
- **No COD fee from order value (₹)** and **from number of items.** When either is reached, COD is free.

At checkout the customer chooses **Pay online** or **Cash on delivery**, and the COD option shows its charge.

## Custom stitching (separate from shop orders)

**Customer side (`/stitching`, must be logged in):**
1. Picks the garment.
2. Says whether the fabric is their own or from the store.
3. Uploads up to 6 design/fabric photos. The browser shrinks them, then they go to Cloudinary through `/api/customer/stitching/upload`.
4. Gives measurements in inches, or asks the tailor to take them.
5. Adds an address and, optionally, a "needed by" date.

**Admin → Stitching requests:** sends a price (₹, ready in N days, note) or declines the request. The customer gets a notification and an email.

**Accepting the price:** the customer pays online (Razorpay) or on delivery. This creates a **stitching order** (`kind: 'stitching'`), which follows: confirm details → stitching → ready → delivery.

Customers follow everything in **My account → Custom stitching**. Shop orders stay in **My orders**. The admin Orders page can filter Shop / Stitching.

## Delivery partners

**Team → Add delivery partner:** name, mobile number and earnings per delivery (empty = the default in Site Settings). The admin must **verify the number** before the partner can log in.

**Partner login:** on the admin login page, choose "Delivery partner? Log in with your mobile", then enter the OTP sent by SMS (`/api/auth/delivery/otp` and `/verify`). Partners only see their own pages:
- **My deliveries:** the orders given to them, with Call / Map, the amount to collect, and the steps Picked up → Out for delivery → Delivered (the full COD amount must be collected) or Not delivered (with a reason).
- **Earnings & rating:** today / month / total deliveries, earnings, cash collected, customer ratings and activity.

**Admin → Deliveries:** each partner's numbers, orders waiting for a partner (assign from the list or inside an order), and orders with partners.

**Customer side:** the customer sees the partner's name, and a call button while the order is out for delivery. After delivery they can rate the delivery 1–5 stars. Every step sends an email and a notification.
