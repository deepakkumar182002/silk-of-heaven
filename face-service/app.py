"""
VELL face service: free local face swap (MediaPipe + OpenCV), called by the VELL API.

Run:  .venv\\Scripts\\python -m uvicorn app:app --host 127.0.0.1 --port 5065
"""

import hmac
import os

from fastapi import FastAPI, File, Header, UploadFile
from fastapi.responses import JSONResponse

from swap import FaceError, detector, swap_face

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
