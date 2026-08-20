import Constants from 'expo-constants';

const fallbackMapStyleUrl = 'https://tiles.openfreemap.org/styles/liberty';
const fallbackRoutingBaseUrl = 'https://router.project-osrm.org';

export function getMapStyleUrl(): string {
  return safeHttpsUrl(Constants.expoConfig?.extra?.mapStyleUrl, fallbackMapStyleUrl);
}

export function getRoutingBaseUrl(): string {
  return safeHttpsUrl(Constants.expoConfig?.extra?.routingBaseUrl, fallbackRoutingBaseUrl);
}

function safeHttpsUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.length > 500) return fallback;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString().replace(/\/$/, '') : fallback;
  } catch {
    return fallback;
  }
}
