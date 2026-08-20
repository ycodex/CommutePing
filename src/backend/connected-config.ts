import Constants from 'expo-constants';

export type ConnectedCommutesConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function getConnectedCommutesConfig(): ConnectedCommutesConfig | null {
  const value: unknown = Constants.expoConfig?.extra?.connectedCommutes;
  if (!isRecord(value)) return null;
  const supabaseUrl = safeHttpsUrl(value.supabaseUrl);
  const supabasePublishableKey = safePublishableKey(value.supabasePublishableKey);
  return supabaseUrl && supabasePublishableKey ? { supabaseUrl, supabasePublishableKey } : null;
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function safePublishableKey(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300) return null;
  return value.startsWith('sb_publishable_') ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
