from fastapi import APIRouter
from typing import Optional
from ..models import LLMModifyRequest, LLMModifyResponse, TripData, ItineraryItem, Day
import os, re, math
import httpx

router = APIRouter(prefix="/ai", tags=["ai"])


def extract_time(text: str, fallback: str) -> str:
    m = re.search(r"(\d{1,2})\s*[:시]\s*(\d{0,2})\s*분?", text)
    if m:
        hh = max(0, min(23, int(m.group(1))))
        mm = int(m.group(2) or 0)
        return f"{hh:02d}:{mm:02d}"
    if re.search(r"아침|조식|브런치", text):
        return "09:00"
    if re.search(r"점심|런치", text):
        return "12:00"
    if re.search(r"카페|커피|디저트|브런치", text):
        return "15:00"
    if re.search(r"저녁|디너", text):
        return "18:30"
    if re.search(r"야경|밤", text):
        return "20:00"
    return fallback


def detect_spec(text: str):
    # returns (query, category, defaultTime, reason, preferOpenNow)
    mapping = [
        (r"라멘|라면", "라멘", "식사", "12:00", "현지 인기 라멘집에서 식사", False),
        (r"스시|초밥", "스시", "식사", "12:30", "스시 맛집 방문", False),
        (r"우동|규카츠|돈카츠|규동", "우동", "식사", "12:00", "현지 식사", False),
        (r"현지식당|로컬식당|현지 맛집|로컬 맛집", "현지 식당", "식사", "12:30", "현지인들이 찾는 로컬 식당 방문", False),
        (r"시장|야시장|전통시장", "전통시장", "식사", "18:30", "현지 시장 체험", False),
        (r"카페|커피|디저트|브런치", "카페", "카페", "15:00", "카페 휴식/디저트", True),
        (r"이자카야|술집|바|펍", "이자카야", "야경", "19:30", "저녁 한잔", False),
        (r"야경|전망대|전망", "전망대", "야경", "20:00", "야경 감상", False),
        (r"온천|스파", "온천", "관광", "17:00", "온천/스파 체험으로 힐링", False),
        (r"박물관|미술관|뮤지엄|갤러리", "박물관", "관광", "11:00", "문화·예술 감상", False),
        (r"놀이공원|테마파크|유원지", "놀이공원", "관광", "10:00", "놀이공원/테마파크 즐기기", False),
    ]
    for pat, q, cat, t, reason, open_now in mapping:
        if re.search(pat, text, re.I):
            return {"query": q, "category": cat, "defaultTime": t, "reason": reason, "preferOpenNow": open_now}
    return None


def extract_quoted(text: str) -> Optional[str]:
    m = re.search(r"[\"“'‘]([^\"”'’]{2,})[\"”'’]", text)
    return m.group(1).strip() if m else None


async def search_places(query: str, lat: float, lng: float, api_key: str):
    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.rating,places.reviews,places.regularOpeningHours",
    }
    payload = {"textQuery": query, "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 5000}}, "languageCode": "ko"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        data = r.json()
        return data.get("places", []) if isinstance(data, dict) else []


async def fetch_open_now(place_id: str, api_key: str) -> Optional[bool]:
    try:
        url = f"https://places.googleapis.com/v1/places/{place_id}?languageCode=ko"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "id,currentOpeningHours.openNow",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers=headers)
            d = r.json()
            return d.get("currentOpeningHours", {}).get("openNow")
    except Exception:
        return None


@router.post("/modify-trip", response_model=LLMModifyResponse)
async def modify_trip(req: LLMModifyRequest):
    text = " ".join([str(m.get("content", "")) for m in (req.messages or [])]).strip()
    if not req.trip:
        return LLMModifyResponse(reply="현재 일정이 없어요. 일정을 먼저 생성해 주세요.", ready=False)

    # day index: if not given -> pick day with fewest items
    day_match = re.search(r"(\d+)\s*일차", text)
    day_idx_req = int(day_match.group(1)) - 1 if day_match else None
    days = req.trip.days
    if day_idx_req is None:
        day_idx = min(range(len(days)), key=lambda i: len(days[i].itinerary)) if days else 0
    else:
        day_idx = max(0, min(day_idx_req, len(days) - 1))

    day = days[day_idx]

    # reference location
    lat, lng = 35.0, 135.0
    if day.itinerary:
        lat = day.itinerary[0].latitude
        lng = day.itinerary[0].longitude
    else:
        coords = [it for d in days for it in d.itinerary]
        coords = [it for it in coords if isinstance(it.latitude, (int, float)) and isinstance(it.longitude, (int, float))]
        if coords:
            lat = sum(it.latitude for it in coords) / len(coords)
            lng = sum(it.longitude for it in coords) / len(coords)

    quoted = extract_quoted(text)
    spec = detect_spec(text)
    api_key = os.getenv("GOOGLE_MAPS_SERVER_API_KEY", "")

    query = quoted or (spec["query"] if spec else "장소")
    time = extract_time(text, spec["defaultTime"] if spec else "12:00")

    # default new item (if no API key or failure)
    new_item = ItineraryItem(
        time=time,
        place=query,
        description=(f"{spec['reason']} (카테고리: {spec['category']})" if spec else "요청하신 장소를 추가합니다."),
        reason=(spec["reason"] if spec else "사용자 지정 장소"),
        latitude=lat,
        longitude=lng,
    )

    try:
        if api_key and query:
            places = await search_places(query, lat, lng, api_key)
            chosen = places[0] if places else None
            # prefer open now for cafes
            if spec and spec.get("preferOpenNow") and places:
                for cand in places[:5]:
                    on = await fetch_open_now(cand["id"], api_key)
                    if on is True:
                        chosen = cand
                        break
            if chosen:
                dn = (chosen.get("displayName") or {}).get("text")
                loc = chosen.get("location") or {}
                new_item.place = dn or query
                new_item.latitude = loc.get("latitude", lat)
                new_item.longitude = loc.get("longitude", lng)
                new_item.formattedAddress = chosen.get("formattedAddress")
                new_item.internationalPhoneNumber = chosen.get("internationalPhoneNumber")
                new_item.websiteUri = chosen.get("websiteUri")
                new_item.rating = chosen.get("rating")
                new_item.reviews = chosen.get("reviews")
    except Exception:
        pass

    # append and return updated trip (scheduling is handled on frontend for now)
    updated_days = list(req.trip.days)
    updated_it = list(day.itinerary) + [new_item]
    updated_days[day_idx] = Day(day=day.day, itinerary=updated_it)

    updated = TripData(**req.trip.model_dump())
    updated.days = updated_days

    reply = f"{day_idx + 1}일차에 '{new_item.place}'를 추가했어요. 필요하면 다른 카테고리도 말씀해 주세요."
    return LLMModifyResponse(reply=reply, ready=True, trip=updated)

@router.get("/modify-trip")
async def modify_trip_get():
    """건강 체크 및 사용 안내용 GET 라우트 (405 회피).
    프론트/모니터링에서 존재 여부만 확인할 때 사용.
    """
    return {"status": "ok", "message": "POST /ai/modify-trip 으로 일정 수정 요청을 보내세요."}
