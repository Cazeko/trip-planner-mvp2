from typing import List, Optional, Literal
from pydantic import BaseModel


class ReviewText(BaseModel):
    text: Optional[str] = None

class AuthorAttr(BaseModel):
    displayName: Optional[str] = None

class Review(BaseModel):
    authorAttribution: Optional[AuthorAttr] = None
    rating: Optional[float] = None
    text: Optional[ReviewText] = None

class PlaceDetails(BaseModel):
    formattedAddress: Optional[str] = None
    internationalPhoneNumber: Optional[str] = None
    websiteUri: Optional[str] = None
    rating: Optional[float] = None
    regularOpeningHours: Optional[dict] = None
    reviews: Optional[List[Review]] = None

class ItineraryItem(PlaceDetails):
    time: str
    place: str
    description: str = ""
    reason: str = ""
    latitude: float
    longitude: float
    types: Optional[List[str]] = None
    photoReference: Optional[str] = None
    expense: Optional[float] = None

class Day(BaseModel):
    day: int
    itinerary: List[ItineraryItem] = []

class TripData(BaseModel):
    tripTitle: str
    days: List[Day]
    destination: Optional[str] = None
    period: Optional[str] = None
    keywords: Optional[str] = None

class Extracted(BaseModel):
    destination: Optional[str] = None
    period: Optional[str] = None
    keywords: Optional[str] = None
    preferredTransport: Optional[Literal['DRIVE','TRANSIT','WALK']] = None

class LLMModifyRequest(BaseModel):
    messages: List[dict]
    extracted: Optional[Extracted] = None
    trip: Optional[TripData] = None

class LLMModifyResponse(BaseModel):
    reply: str
    ready: bool = True
    trip: Optional[TripData] = None
