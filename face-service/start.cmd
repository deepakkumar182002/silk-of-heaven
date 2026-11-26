@echo off
rem VELL face service (free local face swap). First run creates the Python env.
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  py -3.12 -m venv .venv || python -m venv .venv
  .venv\Scripts\python -m pip install -r requirements.txt
)
.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 5065
