from fastapi import FastAPI
from fastapi.responses import Response
from .routers import ai
from pathlib import Path
from dotenv import load_dotenv

app = FastAPI(title="Trip AI Service", version="0.1.0")

# Load environment variables from backend/.env automatically (no need to re-type in terminal)
_dotenv_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=_dotenv_path)

@app.get("/")
def root():
    return {"status": "ok"}

# Quiet the favicon 404 noise in logs (optional)
@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)

app.include_router(ai.router)
