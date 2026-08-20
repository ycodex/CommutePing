export type AppScreen = 'track' | 'routes' | 'alerts' | 'safety';
export type CommutePhase = 'idle' | 'starting' | 'active';
export type LocationStatus = 'off' | 'requesting' | 'live' | 'denied' | 'unavailable';
export type AlertRuleKey = 'connectivity' | 'battery' | 'idle' | 'calls';
export type SensorKey = 'snatch' | 'fall';
export type IncidentKind = 'check-in' | 'late' | 'idle' | 'battery' | 'fall' | 'snatch' | 'deviation' | 'sos';
export type IncidentStatus = 'open' | 'dismissed' | 'recorded';

export type IncidentRecord = {
  id: string;
  kind: IncidentKind;
  title: string;
  detail: string;
  createdAt: number;
  status: IncidentStatus;
  routeId?: string;
};

export type TrustedContact = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  status: 'local';
};

export type RoutePoint = {
  label: string;
  latitude: number;
  longitude: number;
};

export type RouteCoordinate = Pick<RoutePoint, 'latitude' | 'longitude'>;

export type RouteGeometry = {
  source: 'preview' | 'road';
  coordinates: RouteCoordinate[];
  distanceMeters?: number;
};

export type SavedRoute = {
  id: string;
  title: string;
  schedule: string;
  durationMinutes: number;
  learned: boolean;
  origin?: RoutePoint;
  destination?: RoutePoint;
  geometry?: RouteGeometry;
};

export type CommuteState = {
  screen: AppScreen;
  phase: CommutePhase;
  activeRouteId: string | null;
  startedAt: number | null;
  locationStatus: LocationStatus;
  batteryPercent: number;
  lowPowerMode: boolean;
  lastCheckInAt: number | null;
  sosActive: boolean;
  rules: Record<AlertRuleKey, boolean>;
  sensors: Record<SensorKey, boolean>;
  contacts: TrustedContact[];
  routes: SavedRoute[];
  incidents: IncidentRecord[];
};

export type CommutePreferences = Pick<CommuteState, 'rules' | 'sensors' | 'contacts' | 'routes' | 'incidents'>;

export type CommuteAction =
  | { type: 'NAVIGATE'; screen: AppScreen }
  | { type: 'START_REQUESTED'; routeId?: string | null }
  | { type: 'START_SUCCEEDED'; timestamp?: number }
  | { type: 'START_FAILED'; status: Extract<LocationStatus, 'denied' | 'unavailable'> }
  | { type: 'LOCATION_LOST' }
  | { type: 'END_COMMUTE'; timestamp: number }
  | { type: 'CHECK_IN'; timestamp: number }
  | { type: 'SET_BATTERY'; percent: number; lowPowerMode: boolean }
  | { type: 'TOGGLE_RULE'; key: AlertRuleKey }
  | { type: 'TOGGLE_SENSOR'; key: SensorKey }
  | { type: 'ADD_ROUTE'; route: SavedRoute }
  | { type: 'DELETE_ROUTE'; id: string }
  | { type: 'ADD_CONTACT'; contact: TrustedContact }
  | { type: 'DELETE_CONTACT'; id: string }
  | { type: 'RECORD_INCIDENT'; incident: IncidentRecord }
  | { type: 'RESOLVE_INCIDENT'; id: string; status: Extract<IncidentStatus, 'dismissed' | 'recorded'> }
  | { type: 'HYDRATE_PREFERENCES'; preferences: CommutePreferences }
  | { type: 'CLEAR_INCIDENTS' }
  | { type: 'OPEN_SOS' }
  | { type: 'CLOSE_SOS' };

export const initialCommuteState: CommuteState = {
  screen: 'track',
  phase: 'idle',
  activeRouteId: null,
  startedAt: null,
  locationStatus: 'off',
  batteryPercent: 50,
  lowPowerMode: false,
  lastCheckInAt: null,
  sosActive: false,
  rules: {
    connectivity: false,
    battery: false,
    idle: false,
    calls: false,
  },
  sensors: {
    snatch: true,
    fall: true,
  },
  contacts: [],
  routes: [],
  incidents: [],
};

export type TrackingProfile = {
  label: 'Precise' | 'Balanced' | 'Battery saver';
  distanceInterval: number;
  timeInterval: number;
};

export function trackingProfileForBattery(percent: number, lowPowerMode: boolean): TrackingProfile {
  if (percent <= 20 || lowPowerMode) {
    return { label: 'Battery saver', distanceInterval: 100, timeInterval: 60_000 };
  }
  if (percent <= 50) {
    return { label: 'Balanced', distanceInterval: 40, timeInterval: 30_000 };
  }
  return { label: 'Precise', distanceInterval: 15, timeInterval: 10_000 };
}

export function commuteReducer(state: CommuteState, action: CommuteAction): CommuteState {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, screen: action.screen };
    case 'START_REQUESTED':
      if (state.phase !== 'idle') return state;
      if (!action.routeId || !state.routes.some((route) => route.id === action.routeId)) return state;
      return {
        ...state,
        phase: 'starting',
        activeRouteId: action.routeId,
        locationStatus: 'requesting',
      };
    case 'START_SUCCEEDED':
      return {
        ...state,
        phase: 'active',
        locationStatus: 'live',
        startedAt: action.timestamp ?? Date.now(),
        lastCheckInAt: action.timestamp ?? Date.now(),
      };
    case 'START_FAILED':
      return { ...state, phase: 'idle', activeRouteId: null, startedAt: null, locationStatus: action.status };
    case 'LOCATION_LOST':
      if (state.phase !== 'active') return state;
      return { ...state, locationStatus: 'unavailable' };
    case 'END_COMMUTE':
      return { ...state, phase: 'idle', activeRouteId: null, startedAt: null, locationStatus: 'off', lastCheckInAt: action.timestamp };
    case 'CHECK_IN':
      if (state.phase !== 'active') return state;
      return { ...state, lastCheckInAt: action.timestamp };
    case 'SET_BATTERY':
      return {
        ...state,
        batteryPercent: Math.min(100, Math.max(0, Math.round(action.percent))),
        lowPowerMode: action.lowPowerMode,
      };
    case 'TOGGLE_RULE':
      return { ...state, rules: { ...state.rules, [action.key]: !state.rules[action.key] } };
    case 'TOGGLE_SENSOR':
      return { ...state, sensors: { ...state.sensors, [action.key]: !state.sensors[action.key] } };
    case 'ADD_ROUTE': {
      if (state.routes.length >= 20) return state;
      const duplicate = state.routes.some((route) => (
        route.title.trim().toLocaleLowerCase() === action.route.title.trim().toLocaleLowerCase()
        && route.schedule.trim().toLocaleLowerCase() === action.route.schedule.trim().toLocaleLowerCase()
      ));
      return duplicate ? state : { ...state, routes: [...state.routes, action.route] };
    }
    case 'DELETE_ROUTE':
      if (state.activeRouteId === action.id) return state;
      return { ...state, routes: state.routes.filter((route) => route.id !== action.id) };
    case 'ADD_CONTACT':
      if (state.contacts.length >= 10) return state;
      if (state.contacts.some((contact) => normalizePhone(contact.phone) === normalizePhone(action.contact.phone))) return state;
      return { ...state, contacts: [...state.contacts, action.contact] };
    case 'DELETE_CONTACT':
      return { ...state, contacts: state.contacts.filter((contact) => contact.id !== action.id) };
    case 'RECORD_INCIDENT':
      if (state.incidents.some((incident) => incident.id === action.incident.id)) return state;
      return { ...state, incidents: [action.incident, ...state.incidents].slice(0, 100) };
    case 'RESOLVE_INCIDENT':
      return {
        ...state,
        incidents: state.incidents.map((incident) => (
          incident.id === action.id ? { ...incident, status: action.status } : incident
        )),
      };
    case 'HYDRATE_PREFERENCES':
      return { ...state, ...action.preferences };
    case 'CLEAR_INCIDENTS':
      return state.incidents.length === 0 ? state : { ...state, incidents: [] };
    case 'OPEN_SOS':
      return { ...state, sosActive: true };
    case 'CLOSE_SOS':
      return { ...state, sosActive: false };
    default:
      return state;
  }
}

export function selectCommutePreferences(state: CommuteState): CommutePreferences {
  return {
    rules: state.rules,
    sensors: state.sensors,
    contacts: state.contacts,
    routes: state.routes,
    incidents: state.incidents,
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
