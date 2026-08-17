export type AppScreen = 'track' | 'routes' | 'alerts' | 'safety';
export type CommutePhase = 'idle' | 'starting' | 'active';
export type LocationStatus = 'off' | 'requesting' | 'live' | 'denied' | 'unavailable';
export type AlertRuleKey = 'connectivity' | 'battery' | 'idle' | 'calls';
export type SensorKey = 'snatch' | 'fall';

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

export type SavedRoute = {
  id: string;
  title: string;
  schedule: string;
  durationMinutes: number;
  learned: boolean;
  origin?: RoutePoint;
  destination?: RoutePoint;
};

export type CommuteState = {
  screen: AppScreen;
  phase: CommutePhase;
  locationStatus: LocationStatus;
  batteryPercent: number;
  lowPowerMode: boolean;
  lastCheckInAt: number | null;
  sosActive: boolean;
  rules: Record<AlertRuleKey, boolean>;
  sensors: Record<SensorKey, boolean>;
  contacts: TrustedContact[];
  routes: SavedRoute[];
};

export type CommutePreferences = Pick<CommuteState, 'rules' | 'sensors' | 'contacts' | 'routes'>;

export type CommuteAction =
  | { type: 'NAVIGATE'; screen: AppScreen }
  | { type: 'START_REQUESTED' }
  | { type: 'START_SUCCEEDED' }
  | { type: 'START_FAILED'; status: Extract<LocationStatus, 'denied' | 'unavailable'> }
  | { type: 'LOCATION_LOST' }
  | { type: 'END_COMMUTE'; timestamp: number }
  | { type: 'CHECK_IN'; timestamp: number }
  | { type: 'SET_BATTERY'; percent: number; lowPowerMode: boolean }
  | { type: 'TOGGLE_RULE'; key: AlertRuleKey }
  | { type: 'TOGGLE_SENSOR'; key: SensorKey }
  | { type: 'ADD_ROUTE'; route: SavedRoute }
  | { type: 'ADD_CONTACT'; contact: TrustedContact }
  | { type: 'HYDRATE_PREFERENCES'; preferences: CommutePreferences }
  | { type: 'RESET_PREFERENCES' }
  | { type: 'OPEN_SOS' }
  | { type: 'CLOSE_SOS' };

export const initialCommuteState: CommuteState = {
  screen: 'track',
  phase: 'idle',
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
      return { ...state, phase: 'starting', locationStatus: 'requesting' };
    case 'START_SUCCEEDED':
      return { ...state, phase: 'active', locationStatus: 'live', lastCheckInAt: Date.now() };
    case 'START_FAILED':
      return { ...state, phase: 'idle', locationStatus: action.status };
    case 'LOCATION_LOST':
      if (state.phase !== 'active') return state;
      return { ...state, locationStatus: 'unavailable' };
    case 'END_COMMUTE':
      return { ...state, phase: 'idle', locationStatus: 'off', lastCheckInAt: action.timestamp };
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
    case 'ADD_CONTACT':
      if (state.contacts.length >= 10) return state;
      if (state.contacts.some((contact) => normalizePhone(contact.phone) === normalizePhone(action.contact.phone))) return state;
      return { ...state, contacts: [...state.contacts, action.contact] };
    case 'HYDRATE_PREFERENCES':
      return { ...state, ...action.preferences };
    case 'RESET_PREFERENCES':
      return {
        ...state,
        rules: initialCommuteState.rules,
        sensors: initialCommuteState.sensors,
        contacts: [],
        routes: [],
      };
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
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
