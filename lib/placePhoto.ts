/**
 * Google Places Photos API를 통해 장소의 사진 URL을 생성합니다.
 * 문서: https://developers.google.com/maps/documentation/places/web-service/photos
 */

export function buildPhotoUrl(photoName: string, apiKey: string, maxWidth: number = 400): string {
  if (!photoName || !apiKey) return '';
  
  // Photos API 엔드포인트: https://places.googleapis.com/v1/{resourceName}/media
  // 예: photoName = "places/ChIJIQBpAG2dQIcR_6128GljmTQ/photos/AdCJw_q..."
  const encodedName = encodeURIComponent(photoName);
  return `https://places.googleapis.com/v1/${encodedName}/media?maxWidthPx=${maxWidth}&key=${apiKey}`;
}

/**
 * Places Search 응답에서 첫 번째 사진을 추출합니다.
 */
export function extractPhotoUrl(place: any, apiKey: string): string | null {
  if (!place || !place.photos || place.photos.length === 0) {
    return null;
  }
  
  const firstPhoto = place.photos[0];
  if (!firstPhoto.name) return null;
  
  return buildPhotoUrl(firstPhoto.name, apiKey, 400);
}

/**
 * 더 큰 이미지를 위한 URL을 생성합니다 (상세 보기용).
 */
export function getPhotoUrlLarge(photoName: string, apiKey: string): string {
  return buildPhotoUrl(photoName, apiKey, 800);
}
