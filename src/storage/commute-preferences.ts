import type {
  AlertRuleKey,
  CommutePreferences,
  IncidentKind,
  IncidentRecord,
  RouteCoordinate,
  RouteGeometry,
  RoutePoint,
  SavedRoute,
  SensorKey,
  TrustedContact,
} from '@/domain/commute';

const alertKeys: AlertRuleKey[] = ['connectivity', 'battery', 'idle', 'calls'];
const sensorKeys: SensorKey[] = ['snatch', 'fall'];
const incidentKinds: IncidentKind[] = ['check-in', 'late', 'idle', 'battery', 'fall', 'snatch', 'deviation', 'sos'];

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
    if (preferences.incidents !== undefined
      && (!Array.isArray(preferences.incidents) || preferences.incidents.length > 100 || !preferences.incidents.every(isIncidentRecord))) return null;

    return {
      rules: preferences.rules,
      sensors: preferences.sensors,
      contacts: preferences.contacts,
      routes: preferences.routes,
      incidents: preferences.incidents ?? [],
    };
  } catch {
    return null;
  }
}

function isIncidentRecord(value: unknown): value is IncidentRecord {
  if (!isRecord(value)) return false;
  return isBoundedText(value.id, 100)
    && incidentKinds.some((kind) => value.kind === kind)
    && isBoundedText(value.title, 100)
    && isBoundedText(value.detail, 300)
    && typeof value.createdAt === 'number'
    && Number.isFinite(value.createdAt)
    && value.createdAt >= 0
    && (value.status === 'open' || value.status === 'dismissed' || value.status === 'recorded')
    && (value.routeId === undefined || isBoundedText(value.routeId, 80));
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
    && typeof value.learned === 'boolean'
    && (value.origin === undefined || isRoutePoint(value.origin))
    && (value.destination === undefined || isRoutePoint(value.destination))
    && (value.geometry === undefined || isRouteGeometry(value.geometry));
}

function isRouteGeometry(value: unknown): value is RouteGeometry {
  if (!isRecord(value)) return false;
  return (value.source === 'preview' || value.source === 'road')
    && Array.isArray(value.coordinates)
    && value.coordinates.length >= 2
    && value.coordinates.length <= 2_000
    && value.coordinates.every(isRouteCoordinate)
    && (value.distanceMeters === undefined
      || (typeof value.distanceMeters === 'number' && Number.isFinite(value.distanceMeters) && value.distanceMeters > 0));
}

function isRoutePoint(value: unknown): value is RoutePoint {
  if (!isRecord(value)) return false;
  return isBoundedText(value.label, 180)
    && isRouteCoordinate(value);
}

function isRouteCoordinate(value: unknown): value is RouteCoordinate {
  if (!isRecord(value)) return false;
  return typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180;
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
