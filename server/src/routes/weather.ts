import { Hono } from 'hono';

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=22.688&longitude=120.297&current=temperature_2m,weather_code&timezone=Asia%2FTaipei';

const CACHE_MS = 5 * 60 * 1000;

type WeatherPayload = {
  temperature: number;
  weatherCode: number;
};

let cache: { at: number; body: WeatherPayload } | null = null;

export const weatherRoutes = new Hono();

weatherRoutes.get('/', async (c) => {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ data: cache.body });
  }

  try {
    const res = await fetch(WEATHER_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }

    const data = await res.json() as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temperature = data.current?.temperature_2m;
    const weatherCode = data.current?.weather_code;
    if (typeof temperature !== 'number' || typeof weatherCode !== 'number') {
      throw new Error('Open-Meteo payload missing current weather');
    }

    const body: WeatherPayload = { temperature, weatherCode };
    cache = { at: now, body };
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ data: body });
  } catch (err) {
    console.error('weather proxy failed', err);
    if (cache) {
      c.header('Cache-Control', 'public, max-age=60');
      return c.json({ data: cache.body });
    }
    return c.json({ error: 'unavailable' }, 503);
  }
});
