function buildMapEmbedUrl(lat, lng, zoom = 15) {
  return `https://maps.google.com/maps?q=${lat},${lng}&hl=en&z=${zoom}&output=embed`;
}

function buildDirectionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function buildGoogleMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function resolveMapEmbed(data) {
  if (data.mapEmbed) return data.mapEmbed;
  if (data.mapLat != null && data.mapLng != null) {
    return buildMapEmbedUrl(data.mapLat, data.mapLng, data.mapZoom || 15);
  }
  return '';
}

module.exports = {
  buildMapEmbedUrl,
  buildDirectionsUrl,
  buildGoogleMapsUrl,
  resolveMapEmbed
};
