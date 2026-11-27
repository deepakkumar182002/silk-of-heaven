/**
 * Generate the Men and Kids body models with Gemini, in the same format as the Women looks:
 * a 1360×2048 transparent cut-out, full body, front-facing, same pose and framing, and every look
 * of a body aligned on that body's base model (same face, same position).
 *
 *   npm run gen:bodies              → men and kids
 *   npm run gen:bodies -- kids      → only kids
 *
 * Needs GEMINI_API_KEY with billing on (image generation is not in Gemini's free tier), Cloudinary,
 * and ideally the face service (face-service/, finds the face box used for alignment and avatars).
 * Safe to run again: existing bodies, looks (same name) and characters are kept, missing ones are made.
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { uploadBuffer } from '../config/cloudinary.js';
import { Body, Identity, Look } from '../models/index.js';
import { generateImage, aiEnabled } from '../services/gemini.js';
import { detectFace } from '../services/faceService.js';
import { fetchImage } from '../services/tryon.js';
import { W, applyTransform, chromaKey, findTransform, flattenJpeg, ovalWeight, pickKey, rgbaToPng, toRGBA } from '../services/imaging.js';
import { normalizePiece } from '../utils/pieces.js';

const p = (name, color, price, extra = {}) => ({ name, color, price, ...extra });
const kid = { sizes: ['4-5Y', '6-7Y', '8-9Y', '10-11Y', '12-13Y'] };

const BODIES = {
  men: {
    name: 'Men',
    audience: 'men',
    height: 180,
    order: 1,
    who: 'a handsome East Asian man in his mid-20s, about 180 cm tall, slim athletic build, short neat black hair with a soft side part, clean-shaven, a soft natural closed-mouth smile',
    base: 'a plain fitted white crew-neck short-sleeve T-shirt and plain light-grey knee-length shorts, barefoot',
    characters: [
      ['Kang Min-jun', 26, 'Seoul, KR', 13],
      ['Choi Woo-jin', 28, 'Busan, KR', 17],
      ['Jung Ha-joon', 24, 'Incheon, KR', 12],
    ],
    looks: [
      {
        name: 'Weekend Denim',
        category: 'everyday',
        outfit: 'a light sky-blue cotton Oxford button-down shirt with the sleeves rolled to the elbow, tucked into mid-wash slim straight-leg jeans with a brown leather belt, and clean white leather low-top sneakers.',
        pieces: { tops: [p('Oxford button-down shirt', 'Sky blue', 1499)], bottoms: [p('Slim straight jeans', 'Mid wash', 1999)], shoes: [p('White leather sneakers', 'White', 2499)], acc: [p('Leather belt', 'Brown', 699)] },
      },
      {
        name: 'Studio Run',
        category: 'athletic',
        outfit: 'a fitted charcoal-grey quick-dry training T-shirt, black tapered jogger track pants with a drawstring, and grey running shoes with white soles.',
        pieces: { tops: [p('Dri-fit training tee', 'Charcoal', 899)], bottoms: [p('Tapered joggers', 'Black', 1299)], shoes: [p('Running shoes', 'Grey', 2999)] },
      },
      {
        name: 'Cotton Lounge',
        category: 'sleep',
        outfit: 'a navy-and-white pinstripe cotton pyjama set: a long-sleeve button-up pyjama shirt with a notched collar and matching long pyjama trousers, with black slide sandals.',
        pieces: { tops: [p('Cotton pyjama shirt', 'Navy stripe', 999)], bottoms: [p('Pyjama trousers', 'Navy stripe', 899)], shoes: [p('Slide sandals', 'Black', 499)] },
      },
      {
        name: 'Classic Navy Suit',
        category: 'formal',
        outfit: 'a tailored navy single-breasted two-button suit (blazer buttoned, matching navy trousers), a crisp white formal shirt, a burgundy silk tie, and polished brown leather Oxford shoes.',
        pieces: {
          tops: [p('Single-breasted blazer', 'Navy', 5999), p('Formal shirt', 'White', 1499)],
          bottoms: [p('Suit trousers', 'Navy', 2499)],
          shoes: [p('Oxford shoes', 'Brown', 3499)],
          acc: [p('Silk tie', 'Burgundy', 799)],
        },
      },
      {
        name: 'Festive Kurta',
        category: 'party',
        outfit: 'an ivory raw-silk knee-length kurta with subtle gold thread embroidery at the collar and placket, a fitted ivory churidar, a sleeveless maroon Nehru jacket with a band collar worn open over the kurta, and gold embroidered mojari shoes.',
        pieces: { full: [p('Silk kurta churidar set', 'Ivory', 3999)], tops: [p('Nehru jacket', 'Maroon', 2499)], shoes: [p('Embroidered mojaris', 'Gold', 1499)] },
      },
      {
        name: 'Bomber Street',
        category: 'street',
        outfit: 'an olive-green nylon bomber jacket worn open over a plain white crew-neck T-shirt, black relaxed cargo pants with side pockets, and black high-top sneakers.',
        pieces: { tops: [p('Nylon bomber jacket', 'Olive', 2999), p('Crew-neck tee', 'White', 599)], bottoms: [p('Cargo pants', 'Black', 1799)], shoes: [p('High-top sneakers', 'Black', 2799)] },
      },
    ],
  },
  kids: {
    name: 'Kids',
    audience: 'kids',
    height: 128,
    order: 2,
    who: 'a cheerful East Asian boy about 8 years old, about 128 cm tall, natural child proportions, short neat black hair with a fringe, a soft natural closed-mouth smile',
    base: 'a plain white crew-neck short-sleeve T-shirt and plain light-grey knee-length shorts, barefoot',
    characters: [
      ['Park Ji-ho', 8, 'Seoul, KR', 14],
      ['Lim Seo-jun', 7, 'Daejeon, KR', 15],
    ],
    looks: [
      {
        name: 'Playground',
        category: 'everyday',
        outfit: 'a navy-and-white horizontal-striped cotton short-sleeve T-shirt, light-wash denim shorts to the knee, and red sneakers with velcro straps.',
        pieces: { tops: [p('Striped cotton tee', 'Navy stripe', 499, kid)], bottoms: [p('Denim shorts', 'Light wash', 599, kid)], shoes: [p('Velcro sneakers', 'Red', 999, kid)] },
      },
      {
        name: 'Little Sprinter',
        category: 'athletic',
        outfit: 'a royal-blue sports T-shirt with white side panels, navy track pants with a white side stripe, and white sports shoes.',
        pieces: { tops: [p('Sports tee', 'Royal blue', 449, kid)], bottoms: [p('Track pants', 'Navy', 699, kid)], shoes: [p('Sports shoes', 'White', 1199, kid)] },
      },
      {
        name: 'Starry Nights',
        category: 'sleep',
        outfit: 'a soft sky-blue cotton pyjama set with a small white star print (long-sleeve round-neck top and long pyjama pants), and soft grey slippers.',
        pieces: { tops: [p('Star pyjama top', 'Sky blue', 549, kid)], bottoms: [p('Star pyjama pants', 'Sky blue', 499, kid)], shoes: [p('Soft slippers', 'Grey', 349, kid)] },
      },
      {
        name: 'Little Gentleman',
        category: 'formal',
        outfit: 'a navy kids blazer worn open over a white formal shirt with a small red bow tie, beige chino trousers, and brown leather loafers.',
        pieces: {
          tops: [p('Kids blazer', 'Navy', 1999, kid), p('Formal shirt', 'White', 699, kid)],
          bottoms: [p('Chino trousers', 'Beige', 899, kid)],
          shoes: [p('Leather loafers', 'Brown', 1299, kid)],
          acc: [p('Bow tie', 'Red', 299)],
        },
      },
      {
        name: 'Festive Kurta Set',
        category: 'party',
        outfit: 'a mustard-yellow cotton-silk knee-length kurta with a fitted white churidar, a sleeveless teal Nehru jacket with small gold buttons, and gold embroidered mojari shoes.',
        pieces: { full: [p('Kids kurta churidar set', 'Mustard', 1499, kid)], tops: [p('Kids Nehru jacket', 'Teal', 999, kid)], shoes: [p('Kids mojaris', 'Gold', 699, kid)] },
      },
      {
        name: 'Mini Street',
        category: 'street',
        outfit: 'an orange pullover hoodie with a kangaroo pocket (no text or logo), olive jogger cargo pants, and black high-top sneakers.',
        pieces: { tops: [p('Pullover hoodie', 'Orange', 999, kid)], bottoms: [p('Jogger cargos', 'Olive', 899, kid)], shoes: [p('Kids high-tops', 'Black', 1299, kid)] },
      },
    ],
  },
};

const RULES = (key) => `Hard rules:
- Keep the person identical: same face and identity, expression, hairstyle, skin tone, body shape and size, pose, arm, hand, leg and foot positions, head angle and gaze (straight at the camera).
- Keep exactly the same camera, framing and scale: full body visible from the top of the hair to the soles of the feet, at the same position in the frame. Do not zoom, crop, rotate, mirror or shift.
- Background: keep the flat, perfectly uniform ${key.name} (${key.hex}) background. No floor, no shadows, no gradient, no props, no text, no watermark.
- Photorealistic studio lighting matching the original photo.`;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** A new person in the same pose and framing as a Women look (used only as a camera / pose reference). */
async function makeBase(refBuf, spec) {
  const key = await pickKey([refBuf]);
  const refIn = await flattenJpeg(refBuf, key.rgb);
  const out = await generateImage(
    [
      `IMAGE 1 is a full-body, front-facing fashion studio photo on a flat ${key.name} background. Use it ONLY as the reference for camera, framing, scale, pose and lighting.`,
      { buffer: refIn, mime: 'image/jpeg' },
      `Task: create a new photorealistic studio photo of a different person: ${spec.who}.
He stands exactly like the model in IMAGE 1: straight, relaxed, facing the camera, feet slightly apart, arms hanging naturally at the sides a little away from the body, hands relaxed, looking straight into the camera.
He wears ${spec.base}. No accessories, no watch, no jewellery.
Framing: the full body from the top of the hair to the soles of the feet, centred, filling the frame height like IMAGE 1, with a little space above the head and below the feet.
Background: a flat, perfectly uniform ${key.name} (${key.hex}) background. No floor, no shadows, no gradient, no props, no text, no watermark.`,
    ],
    { aspectRatio: '2:3' }
  );
  const px = await toRGBA(out);
  chromaKey(px, key);
  return rgbaToPng(px);
}

/** Dress the base model in an outfit described in words; aligned on the base model's head, face kept. */
async function makeLook(baseBuf, face, outfit) {
  const key = await pickKey([baseBuf]);
  const baseIn = await flattenJpeg(baseBuf, key.rgb);
  const out = await generateImage(
    [
      `You are a fashion virtual try-on renderer.\nIMAGE 1 is the reference model: a full-body, front-facing studio photo on a flat ${key.name} background.`,
      { buffer: baseIn, mime: 'image/jpeg' },
      `Task: output IMAGE 1 with the model wearing this outfit instead of his current clothes: ${outfit}
- Realistic fabric, fit and natural folds; the clothes fit his body and pose.
- Add nothing that is not in the outfit description (no bag, no hat, no glasses, no extra jewellery, no text or logos).
${RULES(key)}`,
    ],
    { aspectRatio: '2:3' }
  );
  const [base, baseFlat, gen] = await Promise.all([toRGBA(baseBuf), toRGBA(baseIn), toRGBA(out)]);
  // head + hair around the face box (or the top centre of the canvas when the face service is off)
  const f = face || { x: 590, y: 120, w: 180, h: 230 };
  const region = {
    left: Math.max(0, Math.round(f.x + f.w / 2 - f.w * 0.95)),
    top: Math.max(0, Math.round(f.y - f.h * 0.6)),
    width: Math.round(f.w * 1.9),
    height: Math.round(f.h * 1.75),
  };
  const t = findTransform(baseFlat, gen, region);
  const px = applyTransform(gen, t, { fill: [...key.rgb, 255] });
  chromaKey(px, key);
  if (face) {
    const oval = { cx: f.x + f.w / 2, cy: f.y + f.h * 0.52, rx: f.w * 0.5, ry: f.h * 0.6 };
    for (let y = Math.floor(oval.cy - oval.ry); y <= Math.ceil(oval.cy + oval.ry); y++) {
      for (let x = Math.floor(oval.cx - oval.rx); x <= Math.ceil(oval.cx + oval.rx); x++) {
        const m = ovalWeight(x, y, oval, 0.25);
        if (!m) continue;
        const i = (y * W + x) * 4;
        for (let c = 0; c < 4; c++) px[i + c] = px[i + c] * (1 - m) + base[i + c] * m;
      }
    }
  }
  return { png: await rgbaToPng(px), score: +t.score.toFixed(1) };
}

async function run() {
  if (!aiEnabled()) throw new Error('GEMINI_API_KEY is not set in backend/.env');
  const only = process.argv.slice(2).filter((a) => BODIES[a]);
  const keys = only.length ? only : Object.keys(BODIES);
  await connectDB();

  const ref = await Look.findOne({ body: 'women', active: true }).sort({ order: 1, createdAt: 1 }).lean();
  if (!ref) throw new Error('Needs at least one Women look as the pose reference');
  const refBuf = await fetchImage(ref.image);
  let nextOrder = ((await Look.findOne().sort({ order: -1 }).lean())?.order || 0) + 1;
  const report = [];

  for (const key of keys) {
    const spec = BODIES[key];
    let body = await Body.findOne({ key });
    let baseBuf;
    if (body?.image) {
      log(`${spec.name}: using the existing base model`);
      baseBuf = await fetchImage(body.image);
    } else {
      log(`${spec.name}: generating the base model…`);
      baseBuf = await makeBase(refBuf, spec);
      const up = await uploadBuffer(baseBuf, 'bodies');
      body = await Body.findOneAndUpdate(
        { key },
        { $set: { key, name: spec.name, audience: spec.audience, height: spec.height, order: spec.order, active: true, image: up.secure_url, imagePublicId: up.public_id } },
        { upsert: true, new: true }
      );
      log(`${spec.name}: base model saved`);
    }
    let face = body.face?.w ? body.face : await detectFace(baseBuf);
    if (face && !body.face?.w) await Body.updateOne({ _id: body._id }, { $set: { face } });
    if (!face) log(`${spec.name}: face service is off, so looks are aligned on the top centre and the face is not locked`);

    for (const look of spec.looks) {
      if (await Look.exists({ body: key, name: look.name })) {
        log(`${spec.name} · ${look.name}: already exists, skipped`);
        continue;
      }
      try {
        log(`${spec.name} · ${look.name}: generating…`);
        const { png, score } = await makeLook(baseBuf, face, look.outfit);
        const up = await uploadBuffer(png, 'looks');
        const pieces = Object.fromEntries(
          Object.entries(look.pieces).map(([g, list]) => [g, list.map((pc) => ({ ...pc, ...normalizePiece(pc, g), ...(pc.sizes ? { sizes: pc.sizes } : {}) }))])
        );
        await Look.create({ name: look.name, category: look.category, body: key, image: up.secure_url, imagePublicId: up.public_id, pieces, order: nextOrder++, active: true });
        report.push(`${spec.name} · ${look.name}: ok (head match ${score})`);
        log(`${spec.name} · ${look.name}: saved (head match ${score}, lower is better)`);
      } catch (e) {
        report.push(`${spec.name} · ${look.name}: FAILED — ${e.message}`);
        log(`${spec.name} · ${look.name}: failed — ${e.message}`);
        if (e.status === 402) break; // no billing: every call will fail
      }
    }

    if (!(await Identity.exists({ body: key }))) {
      const last = (await Identity.findOne().sort({ order: -1 }).lean())?.order || 0;
      await Identity.insertMany(spec.characters.map(([name, age, city, temp], i) => ({ name, age, city, temp, body: key, order: last + 1 + i })));
      log(`${spec.name}: added ${spec.characters.length} characters`);
    }
  }
  console.log('\n' + report.join('\n'));
}

run()
  .catch((e) => {
    console.error('\n' + e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
