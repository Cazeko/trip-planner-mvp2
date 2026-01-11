
/**
 * Generates a dummy affiliate link for a given place.
 * In a production environment, this would integrate with real affiliate networks
 * like Agoda, Booking.com, Klook, KKday, etc.
 */
export function getAffiliateLink(placeName: string, category?: string): { url: string; label: string } {
  const encodedName = encodeURIComponent(placeName);
  const lowerName = placeName.toLowerCase();
  const lowerCat = category?.toLowerCase() || '';

  // Hotel / Accommodation
  if (
    lowerName.includes('hotel') || 
    lowerName.includes('resort') || 
    lowerName.includes('stay') || 
    lowerName.includes('motel') ||
    lowerName.includes('hostel') ||
    lowerCat.includes('lodging') ||
    lowerCat.includes('accommodation')
  ) {
    return {
      url: `https://www.booking.com/searchresults.html?ss=${encodedName}`,
      label: '호텔 예약'
    };
  } 
  
  // Tours / Activities / Attractions
  if (
    lowerName.includes('museum') || 
    lowerName.includes('tour') || 
    lowerName.includes('park') || 
    lowerName.includes('ticket') ||
    lowerName.includes('entry') ||
    lowerCat.includes('amusement_park') ||
    lowerCat.includes('aquarium') ||
    lowerCat.includes('museum') ||
    lowerCat.includes('zoo') ||
    lowerCat.includes('tourist_attraction') // Still broad, but better than point_of_interest
  ) {
    return {
      url: `https://www.klook.com/search?text=${encodedName}`,
      label: '티켓 예매'
    };
  }

  // Restaurants / Cafes
  if (
    lowerName.includes('restaurant') ||
    lowerName.includes('cafe') ||
    lowerName.includes('coffee') ||
    lowerName.includes('bar') ||
    lowerName.includes('food') ||
    lowerCat.includes('food') ||
    lowerCat.includes('restaurant')
  ) {
    return {
      url: `https://www.google.com/maps/search/?api=1&query=${encodedName}`, // Often reservations are via Maps/CatchTable
      label: '예약/길찾기'
    };
  }

  // Default fallback
  return {
    url: `https://www.google.com/maps/search/?api=1&query=${encodedName}`,
    label: '예약 확인'
  };
}
