from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from .routers import ai, pdf
from pathlib import Path
from dotenv import load_dotenv
import os

app = FastAPI(title="Trip AI Service", version="0.1.0")

# Add CORS middleware
# - Production: set FRONTEND_URL to your deployed Next.js origin (e.g. https://your-app.vercel.app)
# - Dev: localhost origins are allowed
frontend_url = os.getenv("FRONTEND_URL", "").strip()
allow_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if frontend_url:
    allow_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)

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
app.include_router(pdf.router)
