import type { RouteCoordinate, SavedRoute } from './commute';

export type ConnectedStatus = 'unconfigured' | 'loading' | 'signed-out' | 'ready' | 'error';

export type ConnectedProfile = {
  id: string;
  displayName: string;
  phone: string;
};

export type ConnectedTrustedConnection = {
  id: string;
  contactName: string;
  relation: string;
  status: 'pending' | 'accepted';
  acceptedUserName: string | null;
  inviteExpiresAt: number;
  acceptedAt: number | null;
};

export type MonitoredCommute = {
  id: string;
  travellerName: string;
  routeTitle: string;
  status: 'active' | 'completed' | 'cancelled';
  startedAt: number;
  expectedArrivalAt: number;
  completedAt: number | null;
  acknowledgedAt: number | null;
  routeCoordinates: RouteCoordinate[];
  currentLocation: (RouteCoordinate & { accuracy: number | null; updatedAt: number }) | null;
  batteryPercent: number | null;
  movementStatus: 'moving' | 'stationary' | 'idle' | 'unknown';
  routeStatus: 'on-route' | 'checking' | 'deviated' | 'unavailable';
};

export type CreatedTrustedInvite = {
  id: string;
  code: string;
  expiresAt: number;
};

export function normalizePhoneForInvite(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  const normalized = trimmed.startsWith('+')
    ? `+${digits}`
    : digits.length === 10
      ? `+91${digits}`
      : `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null;
}

export function normalizeInviteCode(value: string): string | null {
  const code = value.trim().toLocaleLowerCase();
  return /^[0-9a-f]{48}$/.test(code) ? code : null;
}

export function routeSharePayload(route: SavedRoute): {
  origin: Record<string, unknown>;
  destination: Record<string, unknown>;
  coordinates: RouteCoordinate[];
} | null {
  if (!route.origin || !route.destination || route.geometry?.source !== 'road') return null;
  if (route.geometry.coordinates.length < 2 || route.geometry.coordinates.length > 2_000) return null;
  const coordinates = route.geometry.coordinates.filter(isRouteCoordinate);
  if (coordinates.length !== route.geometry.coordinates.length) return null;
  return {
    origin: {
      label: route.origin.label.slice(0, 180),
      latitude: route.origin.latitude,
      longitude: route.origin.longitude,
    },
    destination: {
      label: route.destination.label.slice(0, 180),
      latitude: route.destination.latitude,
      longitude: route.destination.longitude,
    },
    coordinates,
  };
}

export function parseTrustedConnections(value: unknown): ConnectedTrustedConnection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row)
      || !isUuid(row.connection_id)
      || typeof row.contact_name !== 'string'
      || row.contact_name.length > 80
      || typeof row.relation !== 'string'
      || row.relation.length > 80
      || (row.status !== 'pending' && row.status !== 'accepted')
      || (row.accepted_user_name !== null && typeof row.accepted_user_name !== 'string')) return [];
    const inviteExpiresAt = parseTimestamp(row.invite_expires_at);
    const acceptedAt = row.accepted_at === null ? null : parseTimestamp(row.accepted_at);
    if (inviteExpiresAt === null || (row.accepted_at !== null && acceptedAt === null)) return [];
    return [{
      id: row.connection_id,
      contactName: row.contact_name,
      relation: row.relation,
      status: row.status,
      acceptedUserName: row.accepted_user_name,
      inviteExpiresAt,
      acceptedAt,
    }];
  });
}

export function parseMonitoredCommutes(value: unknown): MonitoredCommute[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row)
      || !isUuid(row.commute_id)
      || typeof row.traveller_name !== 'string'
      || row.traveller_name.length > 80
      || typeof row.route_title !== 'string'
      || row.route_title.length > 100
      || !isCommuteStatus(row.commute_status)
      || !isMovementStatus(row.movement_status)
      || !isRouteStatus(row.route_status)) return [];
    const startedAt = parseTimestamp(row.started_at);
    const expectedArrivalAt = parseTimestamp(row.expected_arrival_at);
    const completedAt = row.completed_at === null ? null : parseTimestamp(row.completed_at);
    const acknowledgedAt = row.acknowledged_at === null ? null : parseTimestamp(row.acknowledged_at);
    const routeCoordinates = parseRouteCoordinates(row.route_coordinates);
    if (startedAt === null || expectedArrivalAt === null || routeCoordinates.length < 2) return [];
    const hasLocation = typeof row.latitude === 'number' && typeof row.longitude === 'number';
    const locationUpdatedAt = row.last_observed_at === null ? null : parseTimestamp(row.last_observed_at);
    const currentCoordinate = { latitude: row.latitude, longitude: row.longitude };
    const currentLocation = hasLocation && locationUpdatedAt !== null && isRouteCoordinate(currentCoordinate)
      ? {
          latitude: currentCoordinate.latitude,
          longitude: currentCoordinate.longitude,
          accuracy: typeof row.accuracy_meters === 'number' ? row.accuracy_meters : null,
          updatedAt: locationUpdatedAt,
        }
      : null;
    return [{
      id: row.commute_id,
      travellerName: row.traveller_name,
      routeTitle: row.route_title,
      status: row.commute_status,
      startedAt,
      expectedArrivalAt,
      completedAt,
      acknowledgedAt,
      routeCoordinates,
      currentLocation,
      batteryPercent: typeof row.battery_percent === 'number' && row.battery_percent >= 0 && row.battery_percent <= 100
        ? Math.round(row.battery_percent)
        : null,
      movementStatus: row.movement_status,
      routeStatus: row.route_status,
    }];
  });
}

export function parseCreatedInvite(value: unknown): CreatedTrustedInvite | null {
  const row = Array.isArray(value) ? value[0] : null;
  if (!isRecord(row) || !isUuid(row.invite_id) || typeof row.invite_code !== 'string' || !normalizeInviteCode(row.invite_code)) return null;
  const expiresAt = parseTimestamp(row.expires_at);
  return expiresAt === null ? null : { id: row.invite_id, code: row.invite_code, expiresAt };
}

function parseRouteCoordinates(value: unknown): RouteCoordinate[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 2_000) return [];
  return value.every(isRouteCoordinate) ? value : [];
}

function isRouteCoordinate(value: unknown): value is RouteCoordinate {
  return isRecord(value)
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 50) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCommuteStatus(value: unknown): value is MonitoredCommute['status'] {
  return value === 'active' || value === 'completed' || value === 'cancelled';
}

function isMovementStatus(value: unknown): value is MonitoredCommute['movementStatus'] {
  return value === 'moving' || value === 'stationary' || value === 'idle' || value === 'unknown';
}

function isRouteStatus(value: unknown): value is MonitoredCommute['routeStatus'] {
  return value === 'on-route' || value === 'checking' || value === 'deviated' || value === 'unavailable';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
