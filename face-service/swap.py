"""
Free, local face swap for the VELL fitting room. No paid AI model is used.

Pipeline
  1. Detect   OpenCV YuNet finds every face, small or large, anywhere in the photo; the largest
              one is cropped and zoomed so landmarks are measured at a good resolution.
  2. Measure  MediaPipe Face Landmarker gives 478 face points plus a 3D head-pose matrix
              (real yaw / pitch / roll angles in degrees).
  3. Shape    The selfie is similarity-aligned to the VELL model (Procrustes). Inner features
              (eyes, brows, nose, lips) keep ~60% of the visitor's own proportions, while the
              face outline stays the model's, so the result looks like the visitor yet fits the head.
  4. Warp     Delaunay triangles, piece-wise affine warp. The selfie is pre-scaled with area
              filtering first, so fine detail is kept instead of aliased.
  5. Frontalize  If the head is turned, the hidden side is rebuilt from the mirrored visible side
              (left/right landmark pairs), blended in smoothly across the nose line.
  6. Blend    LAB colour transfer to the model's skin, light unsharp mask, then Poisson seamless
              cloning so lighting and skin tone match the neck. Clipped to the model's own alpha.
  7. Output   Only the face (brows to chin) as a small transparent PNG + its box on the
              1360 x 2048 canvas. Hair, ears and earrings stay the model's.

MediaPipe, OpenCV and the YuNet model are Apache-2.0 / MIT licensed (commercial use allowed).
"""

from __future__ import annotations

import base64
import hashlib
import threading
import urllib.request
from math import asin, atan2, degrees
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

HERE = Path(__file__).parent
LANDMARKER = HERE / "models" / "face_landmarker.task"
LANDMARKER_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
YUNET = HERE / "models" / "face_detection_yunet_2023mar.onnx"
SEGMENTER = HERE / "models" / "selfie_multiclass_256x256.tflite"
SEGMENTER_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
FACE_SKIN = 3  # selfie_multiclass classes: 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others
YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

CANVAS = (1360, 2048)  # every VELL look, same model, same pose
HEAD = (400, 0, 560, 560)  # head-and-shoulders crop (x, y, w, h) on the canvas
MAX_BYTES = 12 * 1024 * 1024

# MediaPipe face mesh indices
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
             152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
BROWS = [105, 66, 334, 296]
UPPER_LIDS = [159, 386]
CHEEK_L, CHEEK_R, NOSE_TIP, CHIN = 234, 454, 1, 152
MIDLINE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 0, 17, 152]
# points that do not move with expression: used for the similarity alignment
STABLE = [33, 133, 362, 263, 168, 6, 197, 1, 2, 98, 327, 61, 291, 152, 234, 454]
# (top, bottom, inner corner, outer corner) per eye, for the eyes-open check
EYES = [(159, 145, 133, 33), (386, 374, 362, 263)]

# left/right mirror of every landmark (from MediaPipe's symmetric canonical face model + iris)
MIRROR = np.array([
    0, 1, 2, 248, 4, 5, 6, 249, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 250, 251, 252, 253, 254, 255,
    256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276,
    277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297,
    298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318,
    319, 320, 321, 322, 323, 94, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338,
    339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359,
    360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 151,
    152, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 164, 391, 392, 393, 168, 394, 395, 396, 397,
    398, 399, 175, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417,
    418, 195, 419, 197, 420, 199, 200, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434,
    435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455,
    456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 3, 7, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
    30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55,
    56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81,
    82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106,
    107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127,
    128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148,
    149, 150, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 165, 166, 167, 169, 170, 171, 172, 173,
    174, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 196,
    198, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220,
    221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241,
    242, 243, 244, 245, 246, 247, 473, 476, 475, 474, 477, 468, 471, 470, 469, 472
], np.int32)

MAX_YAW = 38  # degrees; beyond this too much of the face is hidden
MAX_PITCH = 32
SHAPE_KEEP = 0.8  # share of the visitor's own feature proportions kept (0 = model's, 1 = visitor's)
# eyes, brows, nose and lips: never treated as hair / occluders
FEATURES = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 300, 293, 334, 296, 336, 285, 295, 282, 283, 276,
            33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
            362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398,
            61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
            1, 2, 98, 327, 168, 6, 197, 195, 5, 4]
# plain skin samples (cheeks, nose bridge, chin) used to learn the visitor's skin colour
SKIN_SAMPLES = [50, 280, 205, 425, 6, 197, 199, 175, 101, 330]


class FaceError(Exception):
    """A problem with the photo that the visitor can fix (shown to them as is)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


NO_FACE = FaceError("no_face", "No face found. Use a clear photo of your face with good light.")


# ---------------------------------------------------------------------------
# Models (loaded once; MediaPipe / YuNet objects are not thread safe → one lock)
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_landmarker = None
_yunet = None
_segmenter = None


def _download(path: Path, url: str) -> None:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, path)


def detector():
    """Load both models (also used to warm up at startup)."""
    global _landmarker, _yunet, _segmenter
    if _landmarker is None:
        _download(LANDMARKER, LANDMARKER_URL)
        opts = vision.FaceLandmarkerOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=str(LANDMARKER)),
            running_mode=vision.RunningMode.IMAGE,
            num_faces=3,
            min_face_detection_confidence=0.4,
            min_face_presence_confidence=0.4,
            output_facial_transformation_matrixes=True,
        )
        _landmarker = vision.FaceLandmarker.create_from_options(opts)
    if _yunet is None:
        _download(YUNET, YUNET_URL)
        _yunet = cv2.FaceDetectorYN.create(str(YUNET), "", (320, 320), 0.6, 0.3, 50)
    if _segmenter is None:
        _download(SEGMENTER, SEGMENTER_URL)
        _segmenter = vision.ImageSegmenter.create_from_options(
            vision.ImageSegmenterOptions(
                base_options=mp_tasks.BaseOptions(model_asset_path=str(SEGMENTER)),
                running_mode=vision.RunningMode.IMAGE,
                output_category_mask=True,
            )
        )
    return _landmarker


def face_skin(bgr: np.ndarray) -> np.ndarray | None:
    """Boolean mask of face skin (semantic segmentation: hair, hats, hands, glasses are not skin)."""
    try:
        rgb = np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        with _lock:
            detector()
            res = _segmenter.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
        cm = res.category_mask.numpy_view()
        cm = cm[:, :, 0] if cm.ndim == 3 else cm
        if cm.shape[:2] != bgr.shape[:2]:
            cm = cv2.resize(cm, (bgr.shape[1], bgr.shape[0]), interpolation=cv2.INTER_NEAREST)
        return cm == FACE_SKIN
    except Exception as e:  # noqa: BLE001  (fall back to the colour test)
        print("segmentation failed:", repr(e))
        return None


def _angles(matrix) -> tuple[float, float, float]:
    """(yaw, pitch, roll) in degrees from MediaPipe's facial transformation matrix."""
    r = np.array(matrix)[:3, :3]
    yaw = degrees(asin(float(np.clip(r[0, 2], -1, 1))))
    pitch = degrees(atan2(-r[1, 2], r[2, 2]))
    roll = degrees(atan2(-r[0, 1], r[0, 0]))
    return yaw, pitch, roll


def _landmarks(bgr: np.ndarray):
    """Largest face in `bgr`: (478 x 2 points, (yaw, pitch, roll)) or None."""
    rgb = np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    with _lock:
        res = detector().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not res.face_landmarks:
        return None
    h, w = bgr.shape[:2]
    faces = [np.array([[p.x * w, p.y * h] for p in f], np.float32) for f in res.face_landmarks]
    i = max(range(len(faces)), key=lambda k: np.ptp(faces[k][:, 0]) * np.ptp(faces[k][:, 1]))
    mats = res.facial_transformation_matrixes or []
    return faces[i], (_angles(mats[i]) if i < len(mats) else (0.0, 0.0, 0.0))


def _detect_boxes(bgr: np.ndarray) -> list[tuple[float, float, float, float, float]]:
    """YuNet face boxes (x, y, w, h, score) in original pixels, largest first."""
    h, w = bgr.shape[:2]
    k = min(1.0, 1280 / max(h, w))
    small = cv2.resize(bgr, None, fx=k, fy=k, interpolation=cv2.INTER_AREA) if k < 1 else bgr
    with _lock:
        detector()
        _yunet.setInputSize((small.shape[1], small.shape[0]))
        _, faces = _yunet.detect(small)
    if faces is None:
        return []
    boxes = [(f[0] / k, f[1] / k, f[2] / k, f[3] / k, float(f[14])) for f in faces]
    return sorted(boxes, key=lambda b: b[2] * b[3] * b[4], reverse=True)


def find_face(bgr: np.ndarray, notes: list[str] | None = None):
    """
    Locate the main face and measure it on a zoomed crop.
    Returns (points in `bgr` pixels, (yaw, pitch, roll)).
    """
    boxes = _detect_boxes(bgr)
    if not boxes:
        found = _landmarks(bgr)  # YuNet can miss very large / cropped faces
        if found is None:
            raise NO_FACE
        return found
    x, y, bw, bh, _ = boxes[0]
    if notes is not None and len(boxes) > 1 and boxes[1][2] * boxes[1][3] > 0.5 * bw * bh:
        notes.append("More than one face was found, so the largest one was used.")
    if max(bw, bh) < 56:
        raise FaceError("too_small", "Your face is too small in the photo. Move closer to the camera or crop the photo around your face.")

    # square crop around the face with room for chin and forehead, zoomed to 640 px
    side = int(max(bw, bh) * 2.2)
    cx, cy = x + bw / 2, y + bh / 2
    x0, y0 = int(cx - side / 2), int(cy - side / 2)
    pad = side
    padded = cv2.copyMakeBorder(bgr, pad, pad, pad, pad, cv2.BORDER_REFLECT_101)
    crop = padded[y0 + pad:y0 + pad + side, x0 + pad:x0 + pad + side]
    k = 640 / side
    crop = cv2.resize(crop, (640, 640), interpolation=cv2.INTER_CUBIC if k > 1 else cv2.INTER_AREA)
    found = _landmarks(crop)
    if found is None:
        found = _landmarks(bgr)
        if found is None:
            raise NO_FACE
        return found
    pts, ang = found
    return pts / k + np.array([x0, y0], np.float32), ang


def check_selfie(p: np.ndarray, ang, img: np.ndarray, notes: list[str]) -> None:
    yaw, pitch, _roll = ang
    if abs(yaw) > MAX_YAW:
        raise FaceError("turned", "Your face is turned too far to the side. Look at the camera.")
    if abs(pitch) > MAX_PITCH:
        raise FaceError("tilted", "Your head is tilted too far up or down. Hold the camera at eye level.")
    if abs(yaw) > 14:
        notes.append("Your face was turned a little, so the far side was filled in by symmetry. A straight-on photo looks best.")
    width = np.linalg.norm(p[CHEEK_R] - p[CHEEK_L])
    if width < 56:
        raise FaceError("too_small", "Your face is too small in the photo. Move closer to the camera or crop the photo around your face.")
    open_ratio = [np.linalg.norm(p[t] - p[b]) / max(np.linalg.norm(p[i] - p[o]), 1) for t, b, i, o in EYES]
    if max(open_ratio) < 0.1:
        raise FaceError("eyes_closed", "Keep your eyes open for the photo.")
    # sharpness measured on the face scaled to a fixed size, so it does not depend on resolution
    x0, y0 = np.maximum(p.min(0).astype(int), 0)
    x1, y1 = p.max(0).astype(int)
    face = img[y0:y1, x0:x1]
    if face.size:
        face = cv2.resize(cv2.cvtColor(face, cv2.COLOR_BGR2GRAY), (256, 256), interpolation=cv2.INTER_AREA)
        if cv2.Laplacian(face, cv2.CV_64F).var() < 15:
            raise FaceError("blurry", "The photo is too blurry. Hold still, wipe the lens, or use a sharper photo.")


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------
def decode(data: bytes, keep_alpha: bool = False):
    """BGR image; with keep_alpha, returns (bgr, alpha) for transparent cut-outs."""
    if not data or len(data) > MAX_BYTES:
        raise FaceError("bad_image", "Photo is empty or larger than 12 MB.")
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED if keep_alpha else cv2.IMREAD_COLOR)  # IMREAD_COLOR applies EXIF rotation
    if img is None:
        raise FaceError("bad_image", "Couldn't read this photo. Please use a JPG or PNG.")
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    alpha = np.full(img.shape[:2], 255, np.uint8)
    if img.shape[2] == 4:
        alpha = img[:, :, 3].copy()
        a = alpha[:, :, None].astype(np.float32) / 255
        img = (img[:, :, :3] * a + 138 * (1 - a)).astype(np.uint8)
    return (img, alpha) if keep_alpha else img


def delaunay(points: np.ndarray, w: int, h: int) -> np.ndarray:
    pts = np.clip(points, [0, 0], [w - 1, h - 1])
    sub = cv2.Subdiv2D((0, 0, w, h))
    for x, y in pts:
        sub.insert((float(x), float(y)))
    tris = []
    for t in sub.getTriangleList().reshape(-1, 3, 2):
        idx = []
        for v in t:
            d = np.abs(pts - v).sum(1)
            j = int(d.argmin())
            if d[j] > 1.0:
                break
            idx.append(j)
        if len(idx) == 3 and len(set(idx)) == 3:
            tris.append(idx)
    return np.array(tris, np.int32)


def warp_triangle(src: np.ndarray, dst: np.ndarray, t_src: np.ndarray, t_dst: np.ndarray) -> None:
    r1 = cv2.boundingRect(t_src.astype(np.float32))
    r2 = cv2.boundingRect(t_dst.astype(np.float32))
    if r1[2] <= 0 or r1[3] <= 0 or r2[2] <= 0 or r2[3] <= 0:
        return
    patch = src[r1[1]:r1[1] + r1[3], r1[0]:r1[0] + r1[2]]
    if patch.shape[0] != r1[3] or patch.shape[1] != r1[2]:
        return
    t1 = (t_src - r1[:2]).astype(np.float32)
    t2 = (t_dst - r2[:2]).astype(np.float32)
    m = cv2.getAffineTransform(t1, t2)
    warped = cv2.warpAffine(patch, m, (r2[2], r2[3]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT_101)
    mask = np.zeros((r2[3], r2[2]), np.uint8)
    cv2.fillConvexPoly(mask, np.round(t2 * 16).astype(np.int32), 255, cv2.LINE_AA, 4)
    roi = dst[r2[1]:r2[1] + r2[3], r2[0]:r2[0] + r2[2]]
    if roi.shape[:2] != mask.shape:
        return
    a = (mask.astype(np.float32) / 255)[:, :, None]
    roi[:] = (roi * (1 - a) + warped * a).astype(np.uint8)


def warp_face(src: np.ndarray, s_pts: np.ndarray, d_pts: np.ndarray, tris: np.ndarray, canvas: np.ndarray) -> np.ndarray:
    pad = 64  # triangles near the edge of the photo never fall outside it
    src_p = cv2.copyMakeBorder(src, pad, pad, pad, pad, cv2.BORDER_REFLECT_101)
    s_p = s_pts + pad
    out = canvas.copy()
    for t in tris:
        warp_triangle(src_p, out, s_p[t], d_pts[t])
    return out


def color_transfer(src: np.ndarray, ref: np.ndarray, mask: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """Match the LAB mean / spread of `src` to `ref` inside `mask`."""
    s = cv2.cvtColor(src, cv2.COLOR_BGR2LAB).astype(np.float32)
    r = cv2.cvtColor(ref, cv2.COLOR_BGR2LAB).astype(np.float32)
    m = mask > 0
    if m.sum() < 50:
        return src
    out = s.copy()
    for c in range(3):
        sm, ss = s[:, :, c][m].mean(), s[:, :, c][m].std() + 1e-6
        rm, rs = r[:, :, c][m].mean(), r[:, :, c][m].std() + 1e-6
        k = np.clip(rs / ss, 0.75, 1.35)
        out[:, :, c] = (s[:, :, c] - sm) * k + rm
    out = s + (out - s) * np.array([strength * 0.9, 1.0, 1.0], np.float32)
    return cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


def skin_model(src: np.ndarray, spts: np.ndarray):
    """LAB median + spread of the visitor's skin, learnt from small patches on cheeks, nose and chin."""
    lab = cv2.cvtColor(src, cv2.COLOR_BGR2LAB).astype(np.float32)
    r = max(2, int(np.linalg.norm(spts[CHEEK_R] - spts[CHEEK_L]) * 0.025))
    patches = []
    for i in SKIN_SAMPLES:
        x, y = np.round(spts[i]).astype(int)
        patch = lab[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1].reshape(-1, 3)
        if len(patch):
            patches.append(patch)
    skin = np.concatenate(patches)
    med = np.median(skin, 0)
    spread = np.maximum(np.percentile(np.abs(skin - med), 90, axis=0), [12, 5, 5])
    return lab, med, spread


def occlusion_mask(src: np.ndarray, spts: np.ndarray, notes: list[str]) -> np.ndarray:
    """
    uint8 mask (selfie pixels) of hair, hat brims, hands or glasses frames over the face: outside
    eyes / brows / nose / lips, and either not "face skin" for the segmentation model or far from the
    visitor's own skin colour. These pixels are warped as "unknown", so the model's own skin shows there.
    """
    x0, y0 = np.maximum(spts.min(0).astype(int) - 8, 0)
    x1, y1 = spts.max(0).astype(int) + 8
    crop = src[y0:y1, x0:x1]
    p = spts - [x0, y0]
    lab, med, spread = skin_model(crop, p)
    z = (lab - med) / spread
    # chroma counts fully; brightness mostly for much darker pixels (hair), less for shading
    dist = np.sqrt(z[:, :, 1] ** 2 + z[:, :, 2] ** 2 + 0.35 * np.minimum(z[:, :, 0], 0) ** 2 + 0.08 * np.maximum(z[:, :, 0], 0) ** 2)

    face = np.zeros(crop.shape[:2], np.uint8)
    cv2.fillPoly(face, [np.round(p[FACE_OVAL]).astype(np.int32)], 255)
    feat = np.zeros(crop.shape[:2], np.uint8)
    cv2.fillConvexPoly(feat, cv2.convexHull(np.round(p[FEATURES]).astype(np.int32)), 255)
    feat = cv2.dilate(feat, np.ones((7, 7), np.uint8))
    occ = (dist > 3.0) & (face > 0) & (feat == 0)
    # semantic segmentation on a zoomed crop: catches skin-coloured hats, hands and hair the colour test misses
    pad = int(0.35 * max(x1 - x0, y1 - y0))
    sx0, sy0 = max(0, x0 - pad), max(0, y0 - pad)
    wide = src[sy0:y1 + pad, sx0:x1 + pad]
    k = 512 / max(wide.shape[:2])
    skin = face_skin(cv2.resize(wide, None, fx=k, fy=k, interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC))
    if skin is not None:
        skin = cv2.resize(skin.astype(np.uint8), (wide.shape[1], wide.shape[0]), interpolation=cv2.INTER_NEAREST) > 0
        skin = skin[y0 - sy0:y0 - sy0 + crop.shape[0], x0 - sx0:x0 - sx0 + crop.shape[1]]
        if skin.shape == occ.shape and skin[face > 0].mean() > 0.35:  # trust it only if it found the face
            occ |= (~skin) & (face > 0) & (feat == 0)
    occ = occ.astype(np.uint8) * 255
    occ = cv2.morphologyEx(occ, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    occ = cv2.dilate(occ, np.ones((5, 5), np.uint8))
    share = (occ > 0).sum() / max((face > 0).sum(), 1)
    if share > 0.4:
        raise FaceError("covered", "Too much of your face is covered (hair, hat, hands or mask). Use a photo with your face clearly visible.")
    if share > 0.2:
        notes.append("Some hair or objects covered your face; the model's skin was used there.")
    out = np.zeros(src.shape[:2], np.uint8)
    out[y0:y1, x0:x1] = occ
    return out


def pyramid_blend(fg: np.ndarray, bg: np.ndarray, mask: np.ndarray, levels: int = 5) -> np.ndarray:
    """Laplacian pyramid (multi-band) blending: smooth colour transition, sharp detail kept."""
    h, w = fg.shape[:2]
    size = 2 ** levels
    H, W = (h + size - 1) // size * size, (w + size - 1) // size * size
    pad = lambda im: cv2.copyMakeBorder(im, 0, H - h, 0, W - w, cv2.BORDER_REFLECT_101)
    a, b = pad(fg).astype(np.float32), pad(bg).astype(np.float32)
    m = pad(mask).astype(np.float32) / 255
    m = m[:, :, None] if m.ndim == 2 else m
    ga, gb, gm = [a], [b], [m]
    for _ in range(levels):
        ga.append(cv2.pyrDown(ga[-1]))
        gb.append(cv2.pyrDown(gb[-1]))
        gm.append(cv2.pyrDown(gm[-1])[:, :, None] if gm[-1].ndim == 3 else cv2.pyrDown(gm[-1]))
    out = ga[-1] * gm[-1] + gb[-1] * (1 - gm[-1])
    for i in range(levels - 1, -1, -1):
        size_i = (ga[i].shape[1], ga[i].shape[0])
        la = ga[i] - cv2.pyrUp(ga[i + 1], dstsize=size_i)
        lb = gb[i] - cv2.pyrUp(gb[i + 1], dstsize=size_i)
        mi = gm[i] if gm[i].ndim == 3 else gm[i][:, :, None]
        out = cv2.pyrUp(out, dstsize=size_i) + la * mi + lb * (1 - mi)
    return np.clip(out[:h, :w], 0, 255).astype(np.uint8)


def relight(src: np.ndarray, ref: np.ndarray, mask: np.ndarray, sigma: float, strength: float = 0.75) -> np.ndarray:
    """
    Take the large-scale shading (lighting) of `ref` and the fine detail of `src`:
    L = L_src - blur(L_src) + blur(L_ref), blurs normalised inside `mask` so edges do not bleed.
    """
    m = (mask > 0).astype(np.float32)
    if m.sum() < 50:
        return src
    ls = cv2.cvtColor(src, cv2.COLOR_BGR2LAB).astype(np.float32)
    lr = cv2.cvtColor(ref, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32)
    norm = cv2.GaussianBlur(m, (0, 0), sigma) + 1e-4
    low_s = cv2.GaussianBlur(ls[:, :, 0] * m, (0, 0), sigma) / norm
    low_r = cv2.GaussianBlur(lr * m, (0, 0), sigma) / norm
    ls[:, :, 0] = ls[:, :, 0] + strength * (low_r - low_s) * m
    return cv2.cvtColor(np.clip(ls, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


def unsharp(img: np.ndarray, amount: float = 0.35, sigma: float = 1.1) -> np.ndarray:
    blur = cv2.GaussianBlur(img, (0, 0), sigma)
    return cv2.addWeighted(img, 1 + amount, blur, -amount, 0)


# ---------------------------------------------------------------------------
# Target (the VELL model) — computed once per base image
# ---------------------------------------------------------------------------
_targets: dict[str, dict] = {}


def head_box(base: np.ndarray) -> tuple[int, int, int, int]:
    """Square head-and-shoulders crop around the model's face (any body: women, men, kids)."""
    boxes = _detect_boxes(base)
    if not boxes:
        return HEAD  # the original VELL model
    x, y, w, h, _ = boxes[0]
    side = int(round(min(max(w, h) * 3.0, CANVAS[0], CANVAS[1])))
    x0 = int(round(x + w / 2 - side / 2))
    y0 = int(round(y + h / 2 - side * 0.47))
    x0 = max(0, min(CANVAS[0] - side, x0))
    y0 = max(0, min(CANVAS[1] - side, y0))
    return x0, y0, side, side


def target(base_bytes: bytes) -> dict:
    key = hashlib.sha1(base_bytes).hexdigest()
    if key in _targets:
        return _targets[key]
    base, base_alpha = decode(base_bytes, keep_alpha=True)
    if base.shape[1] != CANVAS[0] or base.shape[0] != CANVAS[1]:
        base = cv2.resize(base, CANVAS, interpolation=cv2.INTER_AREA)
        base_alpha = cv2.resize(base_alpha, CANVAS, interpolation=cv2.INTER_AREA)
    x, y, w, h = head_box(base)
    head = np.ascontiguousarray(base[y:y + h, x:x + w])
    head_alpha = np.ascontiguousarray(base_alpha[y:y + h, x:x + w])
    found = _landmarks(head)
    if found is None:
        raise RuntimeError("Could not find the face of the VELL base model")
    pts = found[0]
    tris = delaunay(pts, w, h)

    mid_x = float(pts[MIDLINE, 0].mean())  # nose line of the model, where the two halves meet

    # swap region: face oval pulled in slightly (keeps side hair), cut just above the brows (keeps the hairline)
    poly = pts[FACE_OVAL].copy()
    c = poly.mean(0)
    poly = c + (poly - c) * np.array([0.93, 0.97], np.float32)
    brow_y = pts[BROWS, 1].mean()
    eye_y = pts[UPPER_LIDS, 1].mean()
    poly[:, 1] = np.maximum(poly[:, 1], brow_y - 0.9 * (eye_y - brow_y))
    mask = np.zeros((h, w), np.uint8)
    cv2.fillPoly(mask, [np.round(poly).astype(np.int32)], 255, cv2.LINE_AA)

    inner = np.ones(len(pts), bool)
    inner[FACE_OVAL] = False
    if len(_targets) >= 6:  # a few body models (women, men, kids...) stay cached
        _targets.pop(next(iter(_targets)))
    _targets[key] = dict(head=head, alpha=head_alpha, pts=pts, tris=tris, mask=mask, mid_x=mid_x, inner=inner, x0=x, y0=y)
    return _targets[key]


# ---------------------------------------------------------------------------
# Swap
# ---------------------------------------------------------------------------
def swap_face(selfie_bytes: bytes, base_bytes: bytes) -> dict:
    t = target(base_bytes)
    head, tpts, tris, mask = t["head"], t["pts"], t["tris"], t["mask"]
    h, w = head.shape[:2]
    notes: list[str] = []

    src = decode(selfie_bytes)
    k = 2000 / max(src.shape[:2])
    if k < 1:
        src = cv2.resize(src, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    spts, ang = find_face(src, notes)
    check_selfie(spts, ang, src, notes)

    # 1) pre-scale the selfie (area filter) so its face is ~1.3x the model's: sharp, no aliasing
    t_width = np.linalg.norm(tpts[CHEEK_R] - tpts[CHEEK_L])
    s_width = np.linalg.norm(spts[CHEEK_R] - spts[CHEEK_L])
    f = (1.3 * t_width) / max(s_width, 1)
    if f < 1:
        src = cv2.resize(src, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        spts = spts * f

    # 2) find hair / hat / hands over the face; they travel with the warp as "unknown" pixels
    occ = occlusion_mask(src, spts, notes)
    occ3 = cv2.cvtColor(occ, cv2.COLOR_GRAY2BGR)
    blank = np.zeros_like(head)

    # 3) destination shape: model's outline, visitor's inner proportions (similarity-aligned)
    sim, _ = cv2.estimateAffinePartial2D(spts[STABLE], tpts[STABLE], method=cv2.LMEDS)
    if sim is None:
        raise FaceError("no_face", "Couldn't read your face clearly. Try a brighter, straight-on photo.")
    s_al = spts @ sim[:, :2].T + sim[:, 2]
    dpts = tpts.copy()
    dpts[t["inner"]] = tpts[t["inner"]] + SHAPE_KEEP * (s_al[t["inner"]] - tpts[t["inner"]])

    # 4) piece-wise affine warp
    warped = warp_face(src, spts, dpts, tris, head)
    unknown = warp_face(occ3, spts, dpts, tris, blank)[:, :, 0].astype(np.float32) / 255

    # 5) frontalize: rebuild the far (hidden) side from the mirrored near side
    yaw = ang[0]
    nose_x = spts[NOSE_TIP, 0]
    far_right = abs(spts[CHEEK_R, 0] - nose_x) < abs(nose_x - spts[CHEEK_L, 0])  # cheek closer to the nose = turned away
    xs = np.arange(w, dtype=np.float32) - t["mid_x"]
    far_side = np.clip((xs if far_right else -xs) / 14 + 0.5, 0, 1)  # 0 near side → 1 far side, smooth over the nose line
    if abs(yaw) > 12:
        flipped = cv2.flip(src, 1)
        m = MIRROR
        f_pts = np.stack([src.shape[1] - 1 - spts[m, 0], spts[m, 1]], 1).astype(np.float32)
        warped_m = warp_face(flipped, f_pts, dpts, tris, head)
        unknown_m = warp_face(cv2.flip(occ3, 1), f_pts, dpts, tris, blank)[:, :, 0].astype(np.float32) / 255
        strength = float(np.clip((abs(yaw) - 8) / (22 - 8), 0, 1)) * 0.92
        wgt = (far_side * strength)[None, :, None]
        warped = (warped * (1 - wgt) + warped_m * wgt).astype(np.uint8)
        unknown = unknown * (1 - wgt[:, :, 0]) + unknown_m * wgt[:, :, 0]

    # 6) colour, detail, multi-band blend (keeps the visitor's skin detail, smooth edges)
    inner_mask = cv2.erode(mask, np.ones((9, 9), np.uint8))
    warped = color_transfer(warped, head, inner_mask)
    t_width = float(np.linalg.norm(tpts[CHEEK_R] - tpts[CHEEK_L]))
    warped = relight(warped, head, inner_mask, sigma=t_width / 9)  # model's studio lighting, visitor's features
    warped = unsharp(warped)
    clone_mask = (mask > 127).astype(np.uint8) * 255
    soft = cv2.GaussianBlur(cv2.erode(clone_mask, np.ones((5, 5), np.uint8)), (0, 0), 4)
    if abs(yaw) > 8:
        # the outer band of the far cheek is never reliable on a turned head (background, hair, folded
        # triangles): keep the model's own cheek there, band width grows with the turn
        band = max(2.0, min(abs(yaw), MAX_YAW) / 30 * 0.32 * t_width)
        inside = cv2.distanceTransform(clone_mask, cv2.DIST_L2, 5)
        keep = np.clip(inside / band, 0, 1)
        keep = keep * far_side[None, :] + (1 - far_side[None, :])
        soft = (soft.astype(np.float32) * cv2.GaussianBlur(keep, (0, 0), 3)).astype(np.uint8)
    # covered pixels: let the model's own skin show through
    known = cv2.GaussianBlur(1 - np.clip(unknown * 1.5, 0, 1), (0, 0), 2.5)
    soft = (soft.astype(np.float32) * known).astype(np.uint8)
    blended = pyramid_blend(warped, head, soft)

    # 7) soft edge; outside the mask `blended` equals the model, so the fade is invisible
    alpha = cv2.GaussianBlur(cv2.dilate(clone_mask, np.ones((7, 7), np.uint8)), (0, 0), 3.5)
    alpha = np.minimum(alpha, t["alpha"])  # never paint where the model itself is transparent
    ys, xs_ = np.nonzero(alpha)
    x0, x1, y0, y1 = xs_.min(), xs_.max() + 1, ys.min(), ys.max() + 1
    layer = np.dstack([blended, alpha])[y0:y1, x0:x1]
    ok, png = cv2.imencode(".png", layer)
    if not ok:
        raise RuntimeError("Could not encode the face layer")

    return {
        "image": "data:image/png;base64," + base64.b64encode(png.tobytes()).decode(),
        "box": {"x": int(x0 + t["x0"]), "y": int(y0 + t["y0"]), "w": int(x1 - x0), "h": int(y1 - y0)},
        "canvas": {"w": CANVAS[0], "h": CANVAS[1]},
        "pose": {"yaw": round(yaw, 1), "pitch": round(ang[1], 1), "roll": round(ang[2], 1)},
        "notes": notes,
        "engine": "local",
    }


# ---------------------------------------------------------------------------
# Admin helpers: face position of a body model, and aligning a look to it
# ---------------------------------------------------------------------------
def _on_canvas(data: bytes) -> np.ndarray:
    """BGRA image on the 1360x2048 canvas (same aspect: resized; otherwise fitted by height, centred)."""
    if not data or len(data) > MAX_BYTES:
        raise FaceError("bad_image", "Image is empty or larger than 12 MB.")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FaceError("bad_image", "Couldn't read this image.")
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    elif img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    h, w = img.shape[:2]
    if (w, h) == CANVAS:
        return img
    k = min(CANVAS[0] / w, CANVAS[1] / h)
    img = cv2.resize(img, (max(1, round(w * k)), max(1, round(h * k))), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
    out = np.zeros((CANVAS[1], CANVAS[0], 4), np.uint8)
    y0 = (CANVAS[1] - img.shape[0]) // 2
    x0 = (CANVAS[0] - img.shape[1]) // 2
    out[y0:y0 + img.shape[0], x0:x0 + img.shape[1]] = img
    return out


def _flat(bgra: np.ndarray) -> np.ndarray:
    a = bgra[:, :, 3:4].astype(np.float32) / 255
    return (bgra[:, :, :3] * a + 138 * (1 - a)).astype(np.uint8)


def _five_points(bgra: np.ndarray, what: str):
    """YuNet's 5 landmarks (eyes, nose tip, mouth corners) and the box of the largest face."""
    flat = _flat(bgra)
    h, w = flat.shape[:2]
    k = min(1.0, 1280 / max(h, w))
    small = cv2.resize(flat, None, fx=k, fy=k, interpolation=cv2.INTER_AREA) if k < 1 else flat
    with _lock:
        detector()
        _yunet.setInputSize((small.shape[1], small.shape[0]))
        _, faces = _yunet.detect(small)
    if faces is None or not len(faces):
        raise FaceError("no_face", f"No face found in the {what}. Use a front-facing full-body cut-out.")
    f = max(faces, key=lambda r: r[2] * r[3] * r[14])
    pts = (f[4:14].reshape(5, 2) / k).astype(np.float64)
    box = tuple(float(v / k) for v in f[:4])
    return pts, box


def detect(image_bytes: bytes) -> dict:
    img = _on_canvas(image_bytes)
    _, (x, y, w, h) = _five_points(img, "image")
    return {"face": {"x": round(x), "y": round(y), "w": round(w), "h": round(h)}, "canvas": {"w": CANVAS[0], "h": CANVAS[1]}}


# ECC region around the face (x face width) and how much of it lies above the eyes: face + hair only,
# so a different neckline or collar never pulls the scale (tested on 4 looks: within 0.5%)
REGION, REGION_UP = 2.2, 0.55


def _refine(base: np.ndarray, img: np.ndarray, q: np.ndarray, s: float, t: np.ndarray):
    """
    Pixel-accurate scale + shift: ECC image alignment on the face-and-hair region of the base model,
    started from the 5-point estimate. 5 points on a ~150 px face are a few % off in scale, which would put
    the feet tens of pixels away; the whole face and hairline pin it down.
    """
    face_w = float(np.linalg.norm(q[0] - q[1])) * 2.6  # eye distance → face width
    side = int(min(face_w * REGION, CANVAS[0], CANVAS[1]))
    cx, cy = q[:2].mean(0)
    rx = int(max(0, min(CANVAS[0] - side, cx - side / 2)))
    ry = int(max(0, min(CANVAS[1] - side, cy - side * REGION_UP)))
    k = min(1.0, 360 / side)  # work small: fast and robust
    tmpl = cv2.cvtColor(_flat(base[ry:ry + side, rx:rx + side]), cv2.COLOR_BGR2GRAY)
    inp = cv2.cvtColor(_flat(img), cv2.COLOR_BGR2GRAY)
    tmpl = cv2.resize(tmpl, None, fx=k, fy=k, interpolation=cv2.INTER_AREA).astype(np.float32)
    inp = cv2.resize(inp, None, fx=k, fy=k, interpolation=cv2.INTER_AREA).astype(np.float32)
    # the mask belongs to the INPUT image: only its opaque pixels count (both are flattened on the same grey)
    mask = cv2.resize((img[:, :, 3] > 128).astype(np.uint8), (inp.shape[1], inp.shape[0]), interpolation=cv2.INTER_NEAREST)
    # template (small, region) → input (small, full): x_img = (u/k + r - t) / s, all scaled by k
    w = np.array([[1 / s, 0, k * (rx - t[0]) / s], [0, 1 / s, k * (ry - t[1]) / s]], np.float32)
    try:
        crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
        _, w = cv2.findTransformECC(tmpl, inp, w, cv2.MOTION_AFFINE, crit, mask, 5)
    except cv2.error:
        return s, t, False
    a = (float(w[0, 0]) + float(w[1, 1])) / 2  # isotropic part (no shear / rotation)
    if not 0.4 < a < 2.5 or abs(a - 1 / s) > 0.15 / s:
        return s, t, False  # ECC wandered off: keep the landmark estimate
    s2 = 1 / a
    t2 = np.array([rx - w[0, 2] / k / a, ry - w[1, 2] / k / a])
    return s2, t2, True


def align(base_bytes: bytes, image_bytes: bytes) -> dict:
    """Scale + shift (no rotation) the image so its face lands exactly on the base model's face."""
    base = _on_canvas(base_bytes)
    img = _on_canvas(image_bytes)
    q, _ = _five_points(base, "base model")
    p, _ = _five_points(img, "look image")
    pm, qm = p.mean(0), q.mean(0)
    s = float(((p - pm) * (q - qm)).sum() / max(1e-6, ((p - pm) ** 2).sum()))
    s = max(0.5, min(2.0, s))
    t = qm - s * pm
    s, t, refined = _refine(base, img, q, s, t)
    m = np.array([[s, 0, t[0]], [0, s, t[1]]], np.float64)
    # premultiplied warp so transparent edges do not turn dark
    a = img[:, :, 3:4].astype(np.float32) / 255
    pre = np.dstack([img[:, :, :3].astype(np.float32) * a, img[:, :, 3:4].astype(np.float32)])
    out = cv2.warpAffine(pre, m, CANVAS, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    alpha = np.clip(out[:, :, 3], 0, 255)
    rgb = np.where(alpha[:, :, None] > 0.5, out[:, :, :3] / np.maximum(alpha[:, :, None] / 255, 1e-3), 0)
    res = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    ok, png = cv2.imencode(".png", res)
    if not ok:
        raise RuntimeError("Could not encode the aligned image")
    before = float(np.linalg.norm(p - q, axis=1).mean())
    after = float(np.linalg.norm(p * s + t - q, axis=1).mean())
    return {
        "image": "data:image/png;base64," + base64.b64encode(png.tobytes()).decode(),
        "scale": round(s, 4),
        "dx": round(float(t[0]), 1),
        "dy": round(float(t[1]), 1),
        "offBefore": round(before, 1),
        "offAfter": round(after, 1),
        "refined": refined,
    }
