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
