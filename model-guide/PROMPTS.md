# Men & Kids models — Gemini prompts

Is folder me:
- **reference-girl-green.jpg**: Gemini ko yahi image dijiye. Isse use framing, pose, size aur hara (green) background samajh aata hai.
- **reference-girl-green-2.jpg**: doosri image, formal look ki. Zarurat ho to ise bhi de sakte hain.
- **reference-girl-transparent.png**: site pe girl model aisi dikhti hai (sirf compare karne ke liye).

Har image ke liye niyam (ye prompts me pehle se likhe hain):
- **Portrait 2:3** (jaise 1360 × 2048).
- **Poora shareer, sir se pair tak**, upar aur neeche thodi jagah.
- **Seedha khada, camera ki taraf dekhta hua**, haath dono taraf thode shareer se door. Har image me bilkul yahi pose aur camera.
- **Background ekdum saaf, plain bright green (#00FF00)**. Na zameen, na shadow, na gradient.
- **Kapde green nahi hone chahiye.** Green kapde chahiye to prompt me background **magenta (#FF00FF)** likhiye; admin dono hata deta hai.

---

## Step 1: Base model (ek baar har body ke liye)

Gemini me **reference-girl-green.jpg** attach kijiye, phir ye prompt:

### Men base
```
Use the attached image ONLY as the reference for camera, framing, scale, pose, lighting and background.
Create a new photorealistic studio photo of a different person: a handsome East Asian man in his mid-20s,
about 180 cm tall, slim athletic build, short neat black hair with a soft side part, clean-shaven,
a soft natural closed-mouth smile, looking straight into the camera.
He stands exactly like the model in the reference: straight, relaxed, facing the camera, feet slightly apart,
arms hanging naturally at the sides a little away from the body, hands relaxed.
He wears a plain fitted white crew-neck short-sleeve T-shirt and plain light-grey knee-length shorts, barefoot.
No accessories, no watch, no jewellery.
Framing: the full body from the top of the hair to the soles of the feet, centred, filling the frame height
exactly like the reference, with a little space above the head and below the feet. Portrait 2:3.
Background: a flat, perfectly uniform pure bright green (#00FF00). No floor, no shadows, no gradient,
no props, no text, no watermark.
```

### Kids base
```
Use the attached image ONLY as the reference for camera, framing, pose, lighting and background.
Create a new photorealistic studio photo of a different person: a cheerful East Asian boy about 8 years old,
about 128 cm tall, natural child proportions, short neat black hair with a fringe,
a soft natural closed-mouth smile, looking straight into the camera.
He stands exactly like the model in the reference: straight, relaxed, facing the camera, feet slightly apart,
arms hanging naturally at the sides a little away from the body, hands relaxed.
He wears a plain white crew-neck short-sleeve T-shirt and plain light-grey knee-length shorts, barefoot.
No accessories.
Framing: the full body from the top of the hair to the soles of the feet, centred, filling the frame height,
with a little space above the head and below the feet. Portrait 2:3.
Background: a flat, perfectly uniform pure bright green (#00FF00). No floor, no shadows, no gradient,
no props, no text, no watermark.
```
> Indian ya koi aur look chahiye to "East Asian" ki jagah "Indian" likh dijiye. Ladki (kid) chahiye to "boy" ki jagah "girl" aur baal ka style badal dijiye.

**Check:** sir aur dono pair poore dikhne chahiye; background ekdum flat green ho. Theek na ho to "Regenerate" kijiye.

---

## Step 2: Outfits (looks)

Ab **Step 1 me bani base image** attach kijiye (girl wali nahi), phir ye prompt. Sirf aakhri line badalti hai:

```
Output the attached photo with the person wearing a new outfit instead of his current clothes.
Hard rules:
- Keep the person identical: same face, hairstyle, skin tone, body shape and size, pose, arm, hand,
  leg and foot positions, head angle and gaze straight at the camera.
- Keep exactly the same camera, framing and scale: full body from the top of the hair to the soles of the feet,
  at the same position in the frame. Do not zoom, crop, rotate, mirror or shift.
- Keep the flat, perfectly uniform pure bright green (#00FF00) background. No floor, no shadows, no text.
- Realistic fabric with natural folds. Add nothing that is not in the outfit (no bag, hat, glasses, logo).
Outfit: <NEECHE SE EK OUTFIT YAHAN LIKHIYE>
```

### Men outfits
| Look name | Category | Outfit (prompt me "Outfit:" ke baad) |
|---|---|---|
| Weekend Denim | Everyday | a light sky-blue cotton Oxford button-down shirt with the sleeves rolled to the elbow, tucked into mid-wash slim straight-leg jeans with a brown leather belt, and clean white leather low-top sneakers |
| Studio Run | Athletic | a fitted charcoal-grey quick-dry training T-shirt, black tapered jogger track pants with a drawstring, and grey running shoes with white soles |
| Cotton Lounge | Sleep | a navy-and-white pinstripe cotton pyjama set (long-sleeve button-up shirt with a notched collar and matching long trousers), with black slide sandals |
| Classic Navy Suit | Formal | a tailored navy single-breasted two-button suit (blazer buttoned, matching trousers), a crisp white formal shirt, a burgundy silk tie, and polished brown leather Oxford shoes |
| Festive Kurta | Party | an ivory raw-silk knee-length kurta with subtle gold thread embroidery at the collar and placket, a fitted ivory churidar, a sleeveless maroon Nehru jacket worn open, and gold embroidered mojari shoes |
| Bomber Street | Street | an olive bomber jacket worn open over a plain white crew-neck T-shirt, black relaxed cargo pants with side pockets, and black high-top sneakers |

### Kids outfits
| Look name | Category | Outfit |
|---|---|---|
| Playground | Everyday | a navy-and-white striped cotton short-sleeve T-shirt, light-wash denim shorts to the knee, and red sneakers with velcro straps |
| Little Sprinter | Athletic | a royal-blue sports T-shirt with white side panels, navy track pants with a white side stripe, and white sports shoes |
| Starry Nights | Sleep | a soft sky-blue cotton pyjama set with a small white star print (long-sleeve top and long pants), and soft grey slippers |
| Little Gentleman | Formal | a navy kids blazer worn open over a white formal shirt with a small red bow tie, beige chino trousers, and brown leather loafers |
| Festive Kurta Set | Party | a mustard-yellow knee-length kurta with a fitted white churidar, a sleeveless teal Nehru jacket with small gold buttons, and gold embroidered mojari shoes |
| Mini Street | Street | an orange pullover hoodie with a kangaroo pocket (no text or logo), olive jogger cargo pants, and black high-top sneakers |

**Note:** jo bhi outfit aap bechte hain, uski product photo bhi attach kar sakte hain. Tab prompt me likhiye: *"Outfit: exactly the garment in the second attached image (same colour, fabric, print and length)"*.

---

## Step 3: Admin panel me daaliye

**Body model (ek baar):**
1. Admin → **Body models** → *Add body model* → naam (Men / Kids), audience, height (Men 180, Kids 128).
2. Base image upload kijiye → **"Remove green background & fit to frame"** dabaiye. Green hat jaayega aur model girl jaisi jagah aa jaayega; kids apni height ke hisaab se chhote dikhte hain.
3. Model thoda idhar-udhar ho to **"Adjust size & position"** dabaiye. Ek bada editor khulta hai:
   - Model ko mouse se khinchiye, ya **Size**, **Left/right**, **Up/down** sliders aur arrow buttons use kijiye. Keyboard ke arrow keys se bhi khisakta hai (Shift = tez); + aur − se size badalta hai.
   - Hari lines: beech ki line, sir ki line aur pair ki line. Model inke beech aana chahiye.
   - **Auto centre & fit**: model ko apne aap beech me laata hai, pair line pe rakhta hai aur sahi height deta hai. **Centre, keep size**: sirf beech me laata hai, size wahi rehta hai.
   - **Save framing**: wahi crop karke nayi 1360 × 2048 image bana deta hai.
4. Phir form me **Add body model / Save** dabaiye.

**Har outfit (look):**
1. Admin → **Looks & Dresses** → *Add look* → Body model me **Men / Kids** chuniye, naam aur category daaliye.
2. Outfit image upload kijiye → **"Remove green background & fit to frame"**.
3. Ho sake to **Auto-align** bhi dabaiye. Isse chehra base model ke chehre pe bilkul fit ho jaata hai. Iske liye face service chalni chahiye.
4. Pieces (shirt, jeans, shoes…) aur unke ₹ price, sizes aur product photos daal ke Save kijiye.

**Characters:** Admin → **Characters** → naya character → Body me Men ya Kids chuniye (naam, umar, shahar).
