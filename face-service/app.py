"""
VELL face service: free local face swap (MediaPipe + OpenCV), called by the VELL API.

Run:  .venv\\Scripts\\python -m uvicorn app:app --host 127.0.0.1 --port 5065
"""

import hmac
import os

from fastapi import FastAPI, File, Header, UploadFile
from fastapi.responses import JSONResponse

from swap import FaceError, align, detect, detector, swap_face

# When deployed online, set FACE_SERVICE_TOKEN here and in the API so only your API can call /swap.
TOKEN = os.environ.get("FACE_SERVICE_TOKEN", "")

app = FastAPI(title="VELL face service", docs_url=None, redoc_url=None)


@app.on_event("startup")
def warm_up() -> None:
    detector()  # loads (and if needed downloads) the landmark model once


@app.get("/health")
def health():
    return {"ok": True, "engine": "mediapipe+opencv"}


# sync handler: FastAPI runs it in a worker thread, so CPU work never blocks the server loop
def _guard(token: str):
    if TOKEN and not hmac.compare_digest(token.encode(), TOKEN.encode()):
        return JSONResponse(status_code=401, content={"code": "auth", "message": "Not allowed"})
    return None


def _run(fn, *args):
    try:
        return fn(*args)
    except FaceError as e:
        return JSONResponse(status_code=422, content={"code": e.code, "message": e.message})
    except Exception as e:  # noqa: BLE001
        print(fn.__name__, "failed:", repr(e))
        return JSONResponse(status_code=500, content={"code": "error", "message": "Image processing failed."})


@app.post("/detect")
def detect_face(image: UploadFile = File(...), x_face_token: str = Header(default="")):
    """Face box of a body model / look on the 1360x2048 canvas."""
    return _guard(x_face_token) or _run(detect, image.file.read())


@app.post("/align")
def align_look(base: UploadFile = File(...), image: UploadFile = File(...), x_face_token: str = Header(default="")):
    """The image scaled and shifted so its face sits exactly on the base model's face."""
    return _guard(x_face_token) or _run(align, base.file.read(), image.file.read())


@app.post("/swap")
def swap(photo: UploadFile = File(...), base: UploadFile = File(...), x_face_token: str = Header(default="")):
    if TOKEN and not hmac.compare_digest(x_face_token.encode(), TOKEN.encode()):
        return JSONResponse(status_code=401, content={"code": "auth", "message": "Not allowed"})
    try:
        return swap_face(photo.file.read(), base.file.read())
    except FaceError as e:
        return JSONResponse(status_code=422, content={"code": e.code, "message": e.message})
    except Exception as e:  # noqa: BLE001
        print("face swap failed:", repr(e))
        return JSONResponse(status_code=500, content={"code": "error", "message": "Face preview failed. Please try another photo."})
