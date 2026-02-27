/**
 * Session context: captures environment factors once on form load.
 * Values are stored in answers as `__ctx_<key>` and GET params as `__param_<key>`.
 */

export interface SessionContext {
  // Device / Browser
  device: string;        // 'mobile' | 'tablet' | 'desktop'
  browser: string;       // 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'Other'
  os: string;            // 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS' | 'Other'
  language: string;      // navigator.language e.g. 'pt-BR'
  screenWidth: string;
  screenHeight: string;
  // Time
  date: string;          // YYYY-MM-DD
  time: string;          // HH:mm
  datetime: string;      // ISO string
  dayOfWeek: string;     // 'segunda' | 'terça' etc.
  timezone: string;      // e.g. 'America/Sao_Paulo'
  // Geo (async — filled later)
  latitude: string;
  longitude: string;
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
    params,
  };
}

/** Request geolocation (async, user-permission required). Returns updated lat/lng. */
export function requestGeolocation(): Promise<{ latitude: string; longitude: string }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: '', longitude: '' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
        });
      },
      () => {
        resolve({ latitude: '', longitude: '' });
      },
      { timeout: 5000, maximumAge: 300000 }
    );
  });
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
];
