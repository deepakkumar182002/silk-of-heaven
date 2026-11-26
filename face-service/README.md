---
title: VELL Face Service
emoji: 🙂
colorFrom: gray
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

# VELL face service

Free face swap for the VELL fitting room (MediaPipe + OpenCV, no paid AI). The VELL API calls it; it stores nothing.

- `GET /health` → `{ "ok": true }`
- `POST /swap` (multipart `photo`, `base`) → face layer PNG + its box on the 1360×2048 canvas

Set the secret `FACE_SERVICE_TOKEN` here, and the same value plus `FACE_SERVICE_URL` in the API's environment.

Local run: `start.cmd` (Windows) or `./start.sh`, port 5065.
