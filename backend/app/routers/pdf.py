from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    Image as RLImage,
    KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from io import BytesIO
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Literal
from urllib.parse import quote
import httpx
import os

router = APIRouter(prefix="/pdf", tags=["pdf"])

class ItineraryItem(BaseModel):
    time: str
    place: str
    description: str
    reason: Optional[str] = None
    expense: Optional[int] = 0
    formattedAddress: Optional[str] = None
    internationalPhoneNumber: Optional[str] = None
    websiteUri: Optional[str] = None
    rating: Optional[float] = None
    photoUrl: Optional[str] = None
    photoUrlByDay: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    duration: Optional[int] = None
    travelTime: Optional[int] = None

class DayData(BaseModel):
    day: int
    itinerary: List[ItineraryItem]

class TripData(BaseModel):
    tripTitle: str
    destination: str
    period: str
    keywords: Optional[str] = None
    days: List[DayData]


class PdfMeta(BaseModel):
    model_config = ConfigDict(extra="allow")

    travelType: Optional[Literal['standard', 'family', 'couple', 'roadtrip', 'relaxed', 'intense']] = None
    preferredTransport: Optional[Literal['DRIVE', 'TRANSIT', 'WALK']] = None
    preferredTransportMulti: Optional[List[Literal['DRIVE', 'TRANSIT', 'WALK']]] = None
    travelMode: Optional[str] = None


class PdfRequest(BaseModel):
    trip: TripData
    meta: Optional[PdfMeta] = None

def register_korean_font():
    """Register Noto Sans KR font for Korean support"""
    try:
        # Path from backend/app/routers/pdf.py -> backend/app -> backend -> root
        font_path = os.path.join(os.path.dirname(__file__), "../../../public/fonts/NotoSansKR-VariableFont_wght.ttf")
        font_path = os.path.abspath(font_path)
        print(f"[PDF] Looking for font at: {font_path}")
        if os.path.exists(font_path):
            print(f"[PDF] Font found, registering: {font_path}")
            pdfmetrics.registerFont(TTFont('NotoSansKR', font_path))
            return 'NotoSansKR'
        else:
            print(f"[PDF] Font not found at {font_path}")
    except Exception as e:
        print(f"[PDF] Failed to load custom font: {e}")
    
    # Fallback to built-in CJK font
    print("[PDF] Using Helvetica as fallback font")
    return 'Helvetica'


def _travel_type_label(travel_type: Optional[str]) -> str:
    mapping = {
        'standard': '일반',
        'family': '가족',
        'couple': '커플',
        'roadtrip': '로드트립',
        'relaxed': '힐링',
        'intense': '빡센 일정',
    }
    return mapping.get(travel_type or '', travel_type or '-')


def _transport_label(mode: Optional[str]) -> str:
    mapping = {
        'DRIVE': '차량',
        'TRANSIT': '대중교통',
        'WALK': '도보',
    }
    return mapping.get(mode or '', mode or '-')

@router.post("/generate")
async def generate_pdf(req: PdfRequest):
    """Generate premium PDF with Korean support using ReportLab"""
    try:
        trip_data = req.trip
        meta = req.meta

        # Register Korean font
        font_name = register_korean_font()
        print(f"[PDF] Using font: {font_name}")
        
        # Create PDF buffer
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, 
                               leftMargin=20*mm, rightMargin=20*mm,
                               topMargin=20*mm, bottomMargin=20*mm)
        
        # Styles
        styles = getSampleStyleSheet()
        
        # Custom styles with Korean font
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontName=font_name,
            fontSize=26,
            textColor=colors.HexColor('#1b1f24'),
            alignment=TA_LEFT,
            spaceAfter=6,
        )

        meta_style = ParagraphStyle(
            'Meta',
            parent=styles['Normal'],
            fontName=font_name,
            fontSize=11,
            textColor=colors.HexColor('#475569'),
            spaceAfter=4,
        )

        day_heading_style = ParagraphStyle(
            'DayHeading',
            parent=styles['Heading2'],
            fontName=font_name,
            fontSize=16,
            textColor=colors.HexColor('#223e78'),
            spaceAfter=8,
        )

        place_style = ParagraphStyle(
            'Place',
            parent=styles['Normal'],
            fontName=font_name,
            fontSize=12,
            textColor=colors.HexColor('#111827'),
            spaceAfter=4,
        )

        small_style = ParagraphStyle(
            'Small',
            parent=styles['Normal'],
            fontName=font_name,
            fontSize=9,
            textColor=colors.HexColor('#334155'),
            leading=12,
            spaceAfter=2,
        )

        time_text_style = ParagraphStyle(
            'TimeText',
            parent=styles['Normal'],
            fontName=font_name,
            fontSize=9,
            textColor=colors.HexColor('#005fcc'),
            alignment=TA_CENTER,
        )
        
        story = []

        # --- HEADER (first page) ---
        story.append(Paragraph(trip_data.tripTitle, title_style))
        story.append(Paragraph(f"{trip_data.destination} | {trip_data.period}", meta_style))

        travel_type_label = _travel_type_label(getattr(meta, 'travelType', None) if meta else None)
        transports = []
        if meta and meta.preferredTransportMulti:
            transports = [_transport_label(m) for m in meta.preferredTransportMulti]
        elif meta and meta.preferredTransport:
            transports = [_transport_label(meta.preferredTransport)]
        elif meta and meta.travelMode:
            transports = [_transport_label(meta.travelMode)]

        if travel_type_label != '-' or transports:
            transport_text = ', '.join([t for t in transports if t and t != '-']) or '-'
            story.append(Paragraph(f"유형: <b>{travel_type_label}</b>   이동수단: <b>{transport_text}</b>", meta_style))

        if trip_data.keywords:
            story.append(Paragraph(f"키워드: {trip_data.keywords}", meta_style))

        story.append(Spacer(1, 6 * mm))

        async with httpx.AsyncClient(follow_redirects=True, timeout=8.0) as client:
            for day_data in trip_data.days:
                story.append(Paragraph(f"Day {day_data.day}", day_heading_style))

                for item in day_data.itinerary:
                    thumb_url = item.photoUrlByDay or item.photoUrl
                    thumb = None
                    if thumb_url:
                        try:
                            resp = await client.get(thumb_url, headers={"User-Agent": "TripdomPDF/1.0"})
                            resp.raise_for_status()
                            ct = (resp.headers.get("content-type") or "").lower()
                            if "image" in ct:
                                thumb = RLImage(BytesIO(resp.content), width=44 * mm, height=32 * mm, kind='proportional')
                        except Exception as e:
                            print(f"[PDF] Thumbnail fetch failed: {e}")

                    if thumb is None:
                        thumb = Spacer(44 * mm, 32 * mm)

                    time_badge = Table(
                        [[Paragraph(item.time, time_text_style)]],
                        colWidths=[18 * mm],
                        rowHeights=[7 * mm],
                    )
                    time_badge.setStyle(
                        TableStyle([
                            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#eef6ff')),
                            ('BOX', (0, 0), (-1, -1), 0.25, colors.HexColor('#cbd5e1')),
                            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                            ('LEFTPADDING', (0, 0), (-1, -1), 2),
                            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
                            ('TOPPADDING', (0, 0), (-1, -1), 1),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                        ])
                    )

                    header_row = Table(
                        [[time_badge, Paragraph(f"<b>{item.place}</b>", place_style)]],
                        colWidths=[20 * mm, None],
                    )
                    header_row.setStyle(
                        TableStyle([
                            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                            ('LEFTPADDING', (0, 0), (-1, -1), 0),
                            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                            ('TOPPADDING', (0, 0), (-1, -1), 0),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                        ])
                    )

                    details: List[Paragraph] = []
                    if item.description:
                        details.append(Paragraph(item.description, small_style))
                    if item.reason:
                        details.append(Paragraph(f"추천 이유: {item.reason}", small_style))
                    if item.expense:
                        details.append(Paragraph(f"예상 경비: {item.expense:,}원", small_style))
                    if item.formattedAddress:
                        details.append(Paragraph(f"주소: {item.formattedAddress}", small_style))
                    if item.internationalPhoneNumber:
                        details.append(Paragraph(f"전화번호: {item.internationalPhoneNumber}", small_style))
                    if item.rating is not None:
                        details.append(Paragraph(f"평점: {item.rating}", small_style))

                    right_block = [header_row] + details

                    card = Table(
                        [[thumb, right_block]],
                        colWidths=[46 * mm, None],
                    )
                    card.setStyle(
                        TableStyle([
                            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
                            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
                            ('VALIGN', (0, 0), (0, 0), 'TOP'),
                            ('VALIGN', (1, 0), (1, 0), 'TOP'),
                            ('LEFTPADDING', (0, 0), (-1, -1), 8),
                            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                            ('TOPPADDING', (0, 0), (-1, -1), 8),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                            ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#f8fafc')),
                        ])
                    )

                    story.append(KeepTogether([card, Spacer(1, 4 * mm)]))

                story.append(PageBreak())
        
        # Build PDF
        doc.build(story)
        
        # Return PDF
        buffer.seek(0)
        
        # URL encode Korean filename for Content-Disposition header
        encoded_filename = quote(f"{trip_data.tripTitle}_premium.pdf")
        
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            }
        )
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[PDF] Error generating PDF: {error_details}")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")
