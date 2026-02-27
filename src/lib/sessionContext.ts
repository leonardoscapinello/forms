/**
 * Session context: captures environment factors once on form load.
 * Values are stored in answers as `__ctx_<key>` and GET params as `__param_<key>`.
 */

export interface SessionContext {
  // Device / Browser
  device: string;
  browser: string;
  os: string;
  language: string;
  screenWidth: string;
  screenHeight: string;
  // Time
  date: string;
  time: string;
  datetime: string;
  dayOfWeek: string;
  timezone: string;
  // Geo (async — filled later)
  latitude: string;
  longitude: string;
  geoCity: string;
  geoState: string;
  geoCountry: string;
  geoCountryCode: string;
  geoNeighborhood: string;
  geoStreet: string;
  geoCep: string;
  // GET params (dynamic keys)
  params: Record<string, string>;
}

const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function detectDevice(): string {
  const ua = navigator.userAgent;
  if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) return 'mobile';
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome') && !ua.includes('Edg/')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  return 'Other';
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Win/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other';
}

function getParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

/** Capture synchronous context immediately */
export function captureSessionContext(): SessionContext {
  const now = new Date();
  const params = getParams();

  return {
    device: detectDevice(),
    browser: detectBrowser(),
    os: detectOS(),
    language: navigator.language || 'en',
    screenWidth: String(window.screen.width),
    screenHeight: String(window.screen.height),
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    datetime: now.toISOString(),
    dayOfWeek: DAY_NAMES[now.getDay()],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    latitude: '',
    longitude: '',
    geoCity: '',
    geoState: '',
    geoCountry: '',
    geoCountryCode: '',
    geoNeighborhood: '',
    geoStreet: '',
    geoCep: '',
    params,
  };
}

/** Reverse geocode coordinates via Nominatim (OpenStreetMap) */
async function reverseGeocode(lat: number, lng: number): Promise<Partial<SessionContext>> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'LovableFormApp/1.0' } }
    );
    const data = await res.json();
    const addr = data.address || {};
    return {
      geoCity: addr.city || addr.town || addr.village || addr.municipality || '',
      geoState: addr.state || '',
      geoCountry: addr.country || '',
      geoCountryCode: (addr.country_code || '').toUpperCase(),
      geoNeighborhood: addr.suburb || addr.neighbourhood || '',
      geoStreet: addr.road || '',
      geoCep: addr.postcode || '',
    };
  } catch {
    return {};
  }
}

/** IP-based geolocation fallback (no permission needed) */
async function ipGeolocate(): Promise<Partial<SessionContext>> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    return {
      latitude: data.latitude ? String(data.latitude) : '',
      longitude: data.longitude ? String(data.longitude) : '',
      geoCity: data.city || '',
      geoState: data.region || '',
      geoCountry: data.country_name || '',
      geoCountryCode: (data.country_code || '').toUpperCase(),
      geoNeighborhood: '',
      geoStreet: '',
      geoCep: data.postal || '',
    };
  } catch {
    return {};
  }
}

export interface GeoResult {
  latitude: string;
  longitude: string;
  geoCity: string;
  geoState: string;
  geoCountry: string;
  geoCountryCode: string;
  geoNeighborhood: string;
  geoStreet: string;
  geoCep: string;
  source: 'gps' | 'ip' | 'none';
}

/** Request geolocation: try GPS first, fallback to IP. Returns enriched geo data. */
export async function requestGeolocation(): Promise<GeoResult> {
  const empty: GeoResult = {
    latitude: '', longitude: '',
    geoCity: '', geoState: '', geoCountry: '', geoCountryCode: '',
    geoNeighborhood: '', geoStreet: '', geoCep: '',
    source: 'none',
  };

  // Try GPS
  const gpsResult = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 300000 }
    );
  });

  if (gpsResult) {
    const geo = await reverseGeocode(gpsResult.lat, gpsResult.lng);
    return {
      ...empty,
      latitude: String(gpsResult.lat),
      longitude: String(gpsResult.lng),
      ...geo,
      source: 'gps',
    };
  }

  // Fallback to IP
  const ipData = await ipGeolocate();
  return { ...empty, ...ipData, source: 'ip' };
}

/** Flatten context into answers map: __ctx_device, __param_utm_source, etc. */
export function contextToAnswers(ctx: SessionContext): Record<string, string> {
  const result: Record<string, string> = {};
  const { params, ...rest } = ctx;
  for (const [key, val] of Object.entries(rest)) {
    result[`__ctx_${key}`] = val;
  }
  for (const [key, val] of Object.entries(params)) {
    result[`__param_${key}`] = val;
  }
  return result;
}

/** All available context keys for the UI */
export const CONTEXT_KEYS: { key: string; label: string; category: string }[] = [
  // Device
  { key: 'device', label: 'Dispositivo', category: 'Dispositivo' },
  { key: 'browser', label: 'Navegador', category: 'Dispositivo' },
  { key: 'os', label: 'Sistema Operacional', category: 'Dispositivo' },
  { key: 'language', label: 'Idioma', category: 'Dispositivo' },
  { key: 'screenWidth', label: 'Largura da Tela', category: 'Dispositivo' },
  { key: 'screenHeight', label: 'Altura da Tela', category: 'Dispositivo' },
  // Time
  { key: 'date', label: 'Data (YYYY-MM-DD)', category: 'Data/Hora' },
  { key: 'time', label: 'Hora (HH:mm)', category: 'Data/Hora' },
  { key: 'datetime', label: 'Data e Hora (ISO)', category: 'Data/Hora' },
  { key: 'dayOfWeek', label: 'Dia da Semana', category: 'Data/Hora' },
  { key: 'timezone', label: 'Fuso Horário', category: 'Data/Hora' },
  // Geo
  { key: 'latitude', label: 'Latitude', category: 'Geolocalização' },
  { key: 'longitude', label: 'Longitude', category: 'Geolocalização' },
  { key: 'geoCity', label: 'Cidade (geo)', category: 'Geolocalização' },
  { key: 'geoState', label: 'Estado (geo)', category: 'Geolocalização' },
  { key: 'geoCountry', label: 'País (geo)', category: 'Geolocalização' },
  { key: 'geoCountryCode', label: 'Código do País (geo)', category: 'Geolocalização' },
  { key: 'geoNeighborhood', label: 'Bairro (geo)', category: 'Geolocalização' },
  { key: 'geoStreet', label: 'Rua (geo)', category: 'Geolocalização' },
  { key: 'geoCep', label: 'CEP (geo)', category: 'Geolocalização' },
];
