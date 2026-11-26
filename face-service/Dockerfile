# VELL face service: deploy on Hugging Face Spaces (Docker), Render, Railway, Cloud Run, a VPS...
FROM python:3.12-slim

# OpenCV / MediaPipe system libraries
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libegl1 libgles2 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py swap.py ./
# download the 3 models into the image now, so the first visitor does not wait for it
RUN python -c "import swap; swap.detector()" && chmod -R a+rX /app

# Hugging Face uses 7860; Render / Railway / Cloud Run pass their own $PORT
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
