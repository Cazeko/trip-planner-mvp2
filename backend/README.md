# Trip AI FastAPI Service

A small FastAPI microservice to handle AI-heavy tasks as discussed.

## Quick start (Windows, cmd)

1. Create a virtual environment (optional but recommended)

```
python -m venv .venv
.venv\Scripts\activate
```

2. Install dependencies

```
pip install -r backend/requirements.txt
```

3. Set environment variables

- GOOGLE_MAPS_SERVER_API_KEY: Server-side Google Places API key

On Windows cmd:
```
set GOOGLE_MAPS_SERVER_API_KEY=YOUR_KEY
```

4. Run the service

```
uvicorn app.main:app --reload --port 8001 --app-dir backend
```

This will start the service at http://127.0.0.1:8001

## Endpoints

- `POST /ai/modify-trip`:
  - Request: `{ messages: [...], extracted?: {...}, trip?: TripData }`
  - Response: `{ reply, ready, trip }`
  - Behavior: Parses natural language (day/time/category or quoted brand). Searches Places (if API key present), appends an item, and returns updated TripData. Time re-scheduling is left to the frontend for now.

## Models

Pydantic models mirror the frontend `types/trip.ts` (ItineraryItem/Day/TripData) to keep a stable contract.

## Notes

- This is a minimal PoC. You can extend it with LangChain/LangGraph and more workflows later.
- DB access is intentionally excluded for now; treat this as stateless AI microservice.
