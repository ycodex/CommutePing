import type {
  AlertRuleKey,
  CommutePreferences,
  SavedRoute,
  SensorKey,
  TrustedContact,
} from '@/domain/commute';

const alertKeys: AlertRuleKey[] = ['connectivity', 'battery', 'idle', 'calls'];
const sensorKeys: SensorKey[] = ['snatch', 'fall'];

type StoredPreferences = {
  version: 1;
  preferences: CommutePreferences;
};

export function encodeCommutePreferences(preferences: CommutePreferences): string {
  return JSON.stringify({ version: 1, preferences } satisfies StoredPreferences);
}

export function decodeCommutePreferences(raw: string | null): CommutePreferences | null {
  if (!raw) return null;

  try {
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored.version !== 1 || !isRecord(stored.preferences)) return null;

    const { preferences } = stored;
    if (!isBooleanRecord(preferences.rules, alertKeys) || !isBooleanRecord(preferences.sensors, sensorKeys)) return null;
    if (!Array.isArray(preferences.contacts) || preferences.contacts.length > 10 || !preferences.contacts.every(isTrustedContact)) return null;
    if (!Array.isArray(preferences.routes) || preferences.routes.length > 20 || !preferences.routes.every(isSavedRoute)) return null;

    return {
      rules: preferences.rules,
      sensors: preferences.sensors,
      contacts: preferences.contacts,
      routes: preferences.routes,
    };
  } catch {
    return null;
  }
}

function isTrustedContact(value: unknown): value is TrustedContact {
  if (!isRecord(value)) return false;
  return isBoundedText(value.id, 80)
    && isBoundedText(value.name, 80)
    && isBoundedText(value.relation, 80)
    && isBoundedText(value.phone, 30)
    && value.status === 'local';
}

function isSavedRoute(value: unknown): value is SavedRoute {
  if (!isRecord(value)) return false;
  return isBoundedText(value.id, 80)
    && isBoundedText(value.title, 100)
    && isBoundedText(value.schedule, 100)
    && typeof value.durationMinutes === 'number'
    && Number.isInteger(value.durationMinutes)
    && value.durationMinutes >= 1
    && value.durationMinutes <= 360
    && typeof value.learned === 'boolean';
}

function isBooleanRecord<K extends string>(value: unknown, keys: K[]): value is Record<K, boolean> {
  return isRecord(value) && keys.every((key) => typeof value[key] === 'boolean');
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
