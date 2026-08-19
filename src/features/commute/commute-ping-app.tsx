import { StatusBar } from 'expo-status-bar';
import type { SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { palette, radius } from '@/constants/commute-theme';
import {
  commuteReducer,
  initialCommuteState,
  trackingProfileForBattery,
  type AlertRuleKey,
  type AppScreen,
  type IncidentRecord,
  type RouteCoordinate,
  type SensorKey,
  type SavedRoute,
  type TrustedContact,
} from '@/domain/commute';
import { commuteTimingAt, type CommuteTiming, type IdleMonitorState } from '@/domain/commute-monitoring';
import type { RouteDeviationState } from '@/domain/route-deviation';
import type { CommuteLocation, LocationRuntimeStatus } from '@/hooks/use-commute-location';
import { useCommutePreferences } from '@/hooks/use-commute-preferences';
import { useCommuteLocation } from '@/hooks/use-commute-location';
import { useBatteryState, useMotionReadings } from '@/hooks/use-device-safety';
import {
  useCommuteClock,
  useIdleMonitor,
  useMotionSafetyCandidate,
  type MotionSafetyCandidate,
} from '@/hooks/use-commute-intelligence';
import { useRouteDeviation } from '@/hooks/use-route-deviation';
import { contactSetupForResult, type ContactPrefill } from '@/features/contacts/contact-import';
import { pickDeviceContact } from '@/features/contacts/device-contact-picker';
import { RoutePickerModal } from '@/features/routes/route-picker-modal';
import { ActiveCommuteMap } from './active-commute-map';

const icons = {
  track: { ios: 'location.fill', android: 'location_on', web: 'location_on' },
  routes: { ios: 'point.topleft.down.to.point.bottomright.curvepath', android: 'route', web: 'route' },
  alerts: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  safety: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  shield: { ios: 'shield.lefthalf.filled', android: 'shield', web: 'shield' },
  play: { ios: 'location.north.fill', android: 'navigation', web: 'navigation' },
  stop: { ios: 'stop.fill', android: 'stop', web: 'stop' },
  battery: { ios: 'battery.75percent', android: 'battery_5_bar', web: 'battery_5_bar' },
  clock: { ios: 'clock.fill', android: 'timer', web: 'timer' },
  motion: { ios: 'waveform.path.ecg', android: 'sensors', web: 'sensors' },
  speed: { ios: 'bolt.fill', android: 'speed', web: 'speed' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  wifiOff: { ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' },
  call: { ios: 'phone.fill', android: 'call', web: 'call' },
  camera: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
  people: { ios: 'person.2.fill', android: 'groups', web: 'groups' },
  lock: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  home: { ios: 'house.fill', android: 'home', web: 'home' },
} as const;

type ToastState = { id: number; message: string } | null;
type IconName = SymbolViewProps['name'];

function createLocalIncident({
  kind,
  title,
  detail,
  status = 'open',
  routeId,
  id,
  createdAt = Date.now(),
}: Omit<IncidentRecord, 'id' | 'createdAt' | 'status'> & { id?: string; createdAt?: number; status?: IncidentRecord['status'] }): IncidentRecord {
  return {
    id: id ?? `${kind}-${createdAt}`,
    kind,
    title,
    detail,
    createdAt,
    status,
    ...(routeId ? { routeId } : {}),
  };
}

function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      accessibilityLabel={label}
      onPress={onChange}
      style={[styles.toggle, value && styles.toggleOn]}
    >
      <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
    </Pressable>
  );
}

function ScreenTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.screenTitle}>
      <Text style={styles.screenHeading}>{title}</Text>
      <Text style={styles.screenSubtitle}>{subtitle}</Text>
    </View>
  );
}

function MetricChart({ type, value }: { type: 'bars' | 'line'; value: number }) {
  const bars = [0.3, 0.5, 0.38, 0.75, 0.52, 0.68, 0.46, 0.58];
  if (type === 'line') {
    const normalized = Math.min(1, value / 4);
    return (
      <View style={styles.lineChart}>
        <View style={[styles.lineSegment, styles.lineOne, { opacity: 0.5 + normalized * 0.5 }]} />
        <View style={[styles.lineSegment, styles.lineTwo, { opacity: 0.5 + normalized * 0.5 }]} />
        <View style={[styles.lineSegment, styles.lineThree, { opacity: 0.5 + normalized * 0.5 }]} />
        <View style={[styles.lineSegment, styles.lineFour, { opacity: 0.5 + normalized * 0.5 }]} />
      </View>
    );
  }
  const boost = Math.min(0.25, value / 10);
  return (
    <View style={styles.barChart}>
      {bars.map((bar, index) => <View key={index} style={[styles.chartBar, { height: 8 + (bar + boost) * 38 }]} />)}
    </View>
  );
}

function SchematicMap({
  active,
  locationStatus,
  accuracy,
}: {
  active: boolean;
  locationStatus: LocationRuntimeStatus;
  accuracy: number | null;
}) {
  const locationReady = locationStatus === 'live';
  const statusCopy = locationReady
    ? `Foreground GPS active${accuracy ? ` · ±${Math.round(accuracy)} m` : ''}`
    : locationStatus === 'requesting'
      ? 'Requesting foreground location…'
      : locationStatus === 'denied'
        ? 'Location permission denied'
        : locationStatus === 'unavailable'
          ? 'Location unavailable · no fallback connected'
          : 'Location off';

  return (
    <View accessibilityLabel="Commute status illustration" style={styles.map}>
      {Array.from({ length: 12 }).map((_, index) => <View key={`v-${index}`} style={[styles.mapDot, { left: `${6 + (index % 6) * 18}%`, top: `${12 + Math.floor(index / 6) * 44}%` }]} />)}
      {active && locationReady && <>
        <View style={[styles.routeLine, styles.routeLineOne]} />
        <View style={[styles.routeLine, styles.routeLineTwo]} />
        <View style={[styles.routeLine, styles.routeLineThree]} />
        <View style={styles.homePin}><AppIcon name={icons.home} size={13} color={palette.canvas} /></View>
      </>}
      {locationReady && <View style={styles.locationPulse}><View style={styles.locationDot} /></View>}
      <View style={styles.fallbackBadge}>
        <AppIcon name={locationReady ? icons.track : icons.wifiOff} size={13} color={locationReady ? palette.green : palette.amber} />
        <Text style={styles.fallbackText}>{statusCopy}</Text>
      </View>
      {active && <View style={styles.etaBadge}><AppIcon name={icons.play} size={12} color={palette.text} /><Text style={styles.etaText}>Commute active</Text></View>}
    </View>
  );
}

function RouteSelector({
  routes,
  selectedRouteId,
  onSelect,
}: {
  routes: SavedRoute[];
  selectedRouteId: string | null;
  onSelect: (routeId: string) => void;
}) {
  if (routes.length === 0) {
    return (
      <Card style={styles.routeSetupCard}>
        <Text style={styles.routeSelectorLabel}>PLANNED ROUTE</Text>
        <Text style={styles.cardTitle}>No route selected</Text>
        <Text style={styles.cardCopy}>Add a route from the Routes tab to see it here during a commute.</Text>
      </Card>
    );
  }

  return (
    <View style={styles.routeSelector}>
      <Text style={styles.routeSelectorLabel}>SELECT TODAY&apos;S ROUTE</Text>
      <ScrollView horizontal contentContainerStyle={styles.routeSelectorContent} showsHorizontalScrollIndicator={false}>
        {routes.map((route) => {
          const selected = route.id === selectedRouteId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={route.id}
              onPress={() => onSelect(route.id)}
              style={[styles.routeChoice, selected && styles.routeChoiceSelected]}
            >
              <View style={styles.routeChoiceHeader}>
                <AppIcon name={icons.routes} size={14} color={selected ? '#AFC5FF' : palette.muted} />
                <Text numberOfLines={1} style={[styles.routeChoiceTitle, selected && styles.routeChoiceTitleSelected]}>{route.title}</Text>
              </View>
              <Text numberOfLines={1} style={styles.routeChoiceSchedule}>{route.schedule} · {route.durationMinutes} min</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ActiveRouteCard({
  route,
  routeCoordinates,
  currentLocation,
  active,
  locationStatus,
  monitoringAvailable,
  deviation,
}: {
  route: SavedRoute;
  routeCoordinates: RouteCoordinate[];
  currentLocation: CommuteLocation | null;
  active: boolean;
  locationStatus: LocationRuntimeStatus;
  monitoringAvailable: boolean;
  deviation: RouteDeviationState;
}) {
  const { copy, color } = routeStatus(active, locationStatus, monitoringAvailable, deviation);
  return (
    <View style={styles.activeRouteMap}>
      <ActiveCommuteMap coordinates={routeCoordinates} currentLocation={currentLocation} />
      <View style={styles.activeRouteTitleBadge}>
        <AppIcon name={icons.routes} size={12} color={palette.text} />
        <Text numberOfLines={1} style={styles.activeRouteTitle}>{route.title}</Text>
      </View>
      <View style={styles.activeRouteStatusBadge}>
        <View style={[styles.routeStatusDot, { backgroundColor: color }]} />
        <Text numberOfLines={2} style={styles.activeRouteStatus}>{copy}</Text>
      </View>
    </View>
  );
}

function routeStatus(
  active: boolean,
  locationStatus: LocationRuntimeStatus,
  monitoringAvailable: boolean,
  deviation: RouteDeviationState,
): { copy: string; color: string } {
  if (!active) return { copy: monitoringAvailable ? 'Road route ready for monitoring' : 'Endpoint preview · select Start Commute', color: palette.blue };
  if (locationStatus === 'requesting') return { copy: 'Getting current location…', color: palette.amber };
  if (locationStatus !== 'live') return { copy: 'Live location unavailable', color: palette.amber };
  if (!monitoringAvailable) return { copy: 'Live GPS · deviation waits for a road route', color: palette.amber };
  if (deviation.status === 'deviated') {
    const distance = deviation.distanceFromRouteMeters === null ? '' : ` · ${Math.round(deviation.distanceFromRouteMeters)} m away`;
    const signal = deviation.sampleQuality === 'poor-accuracy' ? ' · GPS signal now weak' : '';
    return { copy: `Route deviation detected${distance}${signal}`, color: palette.red };
  }
  if (deviation.sampleQuality === 'waiting') return { copy: 'Waiting for the first accurate route sample', color: palette.amber };
  if (deviation.sampleQuality === 'poor-accuracy') return { copy: 'GPS accuracy is too low to judge deviation', color: palette.amber };
  if (deviation.status === 'checking') return { copy: 'Possible deviation · checking again', color: palette.amber };
  return { copy: 'On planned route', color: palette.green };
}

function timingStatusCopy(timing: CommuteTiming): string {
  if (timing.status === 'late') return `${Math.abs(timing.remainingMinutes)} min late`;
  if (timing.status === 'due-soon') return timing.remainingMinutes <= 0 ? 'In grace period' : `${timing.remainingMinutes} min left`;
  return `${timing.remainingMinutes} min left`;
}

function TrackScreen({
  phase,
  routes,
  selectedRouteId,
  displayedRoute,
  routeCoordinates,
  routeMonitoringAvailable,
  routeDeviation,
  timing,
  idleStatus,
  currentLocation,
  batteryPercent,
  lowPowerMode,
  profileLabel,
  locationStatus,
  acceleration,
  rotation,
  motionAvailable,
  onSelectRoute,
  onStart,
  onEnd,
  onCheckIn,
}: {
  phase: 'idle' | 'starting' | 'active';
  routes: SavedRoute[];
  selectedRouteId: string | null;
  displayedRoute: SavedRoute | null;
  routeCoordinates: RouteCoordinate[];
  routeMonitoringAvailable: boolean;
  routeDeviation: RouteDeviationState;
  timing: CommuteTiming | null;
  idleStatus: IdleMonitorState['status'];
  currentLocation: CommuteLocation | null;
  batteryPercent: number | null;
  lowPowerMode: boolean;
  profileLabel: string;
  locationStatus: LocationRuntimeStatus;
  acceleration: number;
  rotation: number;
  motionAvailable: boolean;
  onSelectRoute: (routeId: string) => void;
  onStart: () => void;
  onEnd: () => void;
  onCheckIn: () => void;
}) {
  const active = phase === 'active';
  return (
    <ScrollView testID="track-screen" style={styles.scroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <ScreenTitle title="Commute Ping" subtitle="Foreground commute tracking" />
      {phase === 'idle' && <RouteSelector routes={routes} selectedRouteId={selectedRouteId} onSelect={onSelectRoute} />}
      {displayedRoute ? (
        <ActiveRouteCard
          active={active}
          currentLocation={currentLocation}
          deviation={routeDeviation}
          locationStatus={locationStatus}
          monitoringAvailable={routeMonitoringAvailable}
          route={displayedRoute}
          routeCoordinates={routeCoordinates}
        />
      ) : (
        <SchematicMap active={active} locationStatus={locationStatus} accuracy={currentLocation?.accuracy ?? null} />
      )}

      <View style={styles.commuteSegment}>
        <Pressable accessibilityRole={active ? 'button' : undefined} onPress={active ? onCheckIn : undefined} style={[styles.segmentButton, !active && styles.segmentButtonSelected]}>
          <Text style={styles.segmentLabel}>{active ? 'Check In' : 'Idle'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={phase === 'starting'}
          onPress={active ? onEnd : onStart}
          style={[styles.segmentButton, active && styles.commuteActiveButton]}
        >
          <AppIcon name={active ? icons.stop : icons.play} size={14} color={active ? palette.white : palette.muted} />
          <Text style={[styles.segmentLabel, active && styles.segmentActiveLabel]}>{phase === 'starting' ? 'Getting location…' : active ? 'End Commute' : 'Start Commute'}</Text>
        </Pressable>
      </View>

      {active && (
        <View style={styles.insightGrid}>
          <Card style={styles.insightCard}>
            <View style={styles.metricLabelRow}><AppIcon name={icons.clock} size={13} color={timing?.status === 'late' ? palette.red : palette.green} /><Text style={styles.metricLabel}>EXPECTED ARRIVAL</Text></View>
            <Text style={styles.insightValue}>{timing ? formatClockTime(timing.expectedArrivalAt) : 'No route ETA'}</Text>
            <Text style={[styles.insightMeta, timing?.status === 'late' && { color: palette.red }]}>{timing ? timingStatusCopy(timing) : 'Choose a planned route'}</Text>
          </Card>
          <Card style={styles.insightCard}>
            <View style={styles.metricLabelRow}><AppIcon name={icons.motion} size={13} color={idleStatus === 'idle' ? palette.amber : palette.blue} /><Text style={styles.metricLabel}>MOVEMENT CHECK</Text></View>
            <Text style={styles.insightValue}>{idleStatus === 'idle' ? 'Idle detected' : idleStatus === 'stationary' ? 'Stationary' : 'Moving'}</Text>
            <Text style={styles.insightMeta}>{idleStatus === 'idle' ? 'Check-in recommended' : 'On-device only'}</Text>
          </Card>
        </View>
      )}

      <View style={styles.metricGrid}>
        <Card style={styles.metricCard}>
          <View style={styles.metricLabelRow}><AppIcon name={icons.battery} size={13} color={palette.muted} /><Text style={styles.metricLabel}>BATTERY LOGIC</Text></View>
          <Text style={[styles.metricValue, { color: batteryPercent !== null && (batteryPercent <= 20 || lowPowerMode) ? palette.amber : palette.green }]}>{batteryPercent === null ? 'Battery unavailable' : `${profileLabel} (${batteryPercent}%)`}</Text>
        </Card>
        <Card style={styles.metricCard}>
          <View style={styles.metricLabelRow}><AppIcon name={icons.clock} size={13} color={palette.muted} /><Text style={styles.metricLabel}>LOCATION MODE</Text></View>
          <Text style={styles.metricValue}>{active ? 'Foreground only' : 'Off'}</Text>
        </Card>
      </View>

      <View style={styles.metricGrid}>
        <Card style={[styles.metricCard, styles.sensorMetric]}>
          <View style={styles.sensorMetricHeader}><View style={styles.metricLabelRow}><AppIcon name={icons.motion} size={14} color="#80A5FF" /><Text style={[styles.metricLabel, { color: '#AFC5FF' }]}>MOTION</Text></View><View style={[styles.liveDot, { backgroundColor: palette.blue }]} /></View>
          {active && motionAvailable ? <MetricChart type="bars" value={acceleration} /> : <Text style={styles.sensorOffText}>{active ? 'Waiting for sensor' : 'OFF'}</Text>}
        </Card>
        <Card style={[styles.metricCard, styles.sensorMetric]}>
          <View style={styles.sensorMetricHeader}><View style={styles.metricLabelRow}><AppIcon name={icons.speed} size={14} color="#FF7180" /><Text style={[styles.metricLabel, { color: '#FF9DA6' }]}>ROTATION</Text></View><View style={[styles.liveDot, { backgroundColor: palette.red }]} /></View>
          {active && motionAvailable ? <MetricChart type="line" value={rotation} /> : <Text style={styles.sensorOffText}>{active ? 'Waiting for sensor' : 'OFF'}</Text>}
        </Card>
      </View>
      <Text style={styles.privacyCaption}>Tracking and route checks stop automatically when you end the commute.</Text>
    </ScrollView>
  );
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function RoutesScreen({ routes, onAdd }: { routes: SavedRoute[]; onAdd: () => void }) {
  return (
    <ScrollView testID="routes-screen" style={styles.scroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <ScreenTitle title="Planned Routes" subtitle="Saved locally on this device" />
      <View style={styles.stack}>
        {routes.length === 0 && (
          <Card style={styles.emptyCard}>
            <Text style={styles.cardTitle}>No routes saved</Text>
            <Text style={styles.cardCopy}>Search or tap the map to choose a start and destination, then add the expected schedule.</Text>
          </Card>
        )}
        {routes.map((route) => (
          <View key={route.id} style={styles.routeCard}>
            <View style={styles.routeIcon}><AppIcon name={route.learned ? icons.routes : icons.track} size={20} color={route.learned ? '#78A0FF' : palette.green} /></View>
            <View style={styles.flexOne}>
              <Text style={styles.cardTitle}>{route.title}</Text>
              {route.origin && route.destination && (
                <Text numberOfLines={1} style={styles.routePlaces}>{route.origin.label} → {route.destination.label}</Text>
              )}
              <Text style={styles.cardCopy}>{route.schedule} · {route.durationMinutes} min · {route.geometry?.source === 'road' ? 'Road path' : 'Endpoint preview'}</Text>
            </View>
            <AppIcon name={route.learned ? icons.chevron : icons.check} size={17} color={route.learned ? palette.mutedDark : palette.green} />
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={onAdd} style={styles.saveRouteButton}>
        <AppIcon name={icons.add} size={15} color={palette.muted} />
        <Text style={styles.saveRouteText}>Add Planned Route</Text>
      </Pressable>
      <Card style={styles.patternCard}>
        <Text style={styles.patternTitle}>Route Monitoring Foundation</Text>
        <Text style={styles.patternCopy}>Choose a saved route before starting. The app follows live GPS and can detect sustained deviation when a routing provider supplies a road-following path. Endpoint previews are never treated as real roads.</Text>
      </Card>
    </ScrollView>
  );
}

const alertRows: { key: AlertRuleKey; title: string; copy: string; icon: IconName }[] = [
  { key: 'connectivity', title: 'Connectivity Lost', copy: 'Saved for the background-network integration', icon: icons.wifiOff },
  { key: 'battery', title: 'Critical Battery', copy: 'Record an on-device warning below 15% during a commute', icon: icons.battery },
  { key: 'idle', title: 'Prolonged Idle', copy: 'Prompt after 8 minutes without meaningful movement', icon: icons.clock },
  { key: 'calls', title: 'Auto-Confirm Calls', copy: 'Saved for the consent-based calling backend', icon: icons.call },
];

function AlertsScreen({
  rules,
  incidents,
  onToggle,
  onResolveIncident,
}: {
  rules: typeof initialCommuteState.rules;
  incidents: IncidentRecord[];
  onToggle: (key: AlertRuleKey) => void;
  onResolveIncident: (id: string) => void;
}) {
  return (
    <ScrollView testID="alerts-screen" style={styles.scroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <ScreenTitle title="Alerts & History" subtitle="On-device monitoring · remote delivery not connected" />
      <View style={styles.stack}>
        {alertRows.map((row) => (
          <Card key={row.key} style={[styles.ruleCard, !rules[row.key] && styles.ruleDisabled]}>
            <View style={styles.ruleIcon}><AppIcon name={row.icon} size={19} color={rules[row.key] ? '#78A0FF' : palette.mutedDark} /></View>
            <View style={styles.flexOne}><Text style={styles.cardTitle}>{row.title}</Text><Text style={styles.cardCopy}>{row.copy}</Text></View>
            <Toggle value={rules[row.key]} onChange={() => onToggle(row.key)} label={`Toggle ${row.title}`} />
          </Card>
        ))}
      </View>
      <Text style={styles.sectionDisclaimer}>Battery and idle rules run during an active foreground commute. Connectivity delivery and automated calls still require the backend.</Text>

      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>RECENT INCIDENTS</Text>
        <Text style={styles.historyCount}>{incidents.length}</Text>
      </View>
      {incidents.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.cardTitle}>No incidents recorded</Text>
          <Text style={styles.cardCopy}>Late arrivals, prolonged idle, sensor candidates, route deviations, and check-ins appear here.</Text>
        </Card>
      ) : (
        <View style={styles.stack}>
          {incidents.slice(0, 20).map((incident) => (
            <Card key={incident.id} style={styles.incidentCard}>
              <View style={[styles.incidentIcon, incident.status === 'open' && styles.incidentIconOpen]}>
                <AppIcon name={incident.kind === 'check-in' ? icons.check : incident.kind === 'late' || incident.kind === 'idle' ? icons.clock : incident.kind === 'battery' ? icons.battery : incident.kind === 'deviation' ? icons.routes : icons.shield} size={17} color={incident.status === 'open' ? '#FF8D98' : '#AFC5FF'} />
              </View>
              <View style={styles.flexOne}>
                <View style={styles.incidentTitleRow}>
                  <Text style={styles.cardTitle}>{incident.title}</Text>
                  <Text style={[styles.incidentStatus, incident.status === 'open' && styles.incidentStatusOpen]}>{incident.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.cardCopy}>{incident.detail}</Text>
                <Text style={styles.incidentTime}>{formatIncidentTime(incident.createdAt)}</Text>
                {incident.status === 'open' && (
                  <Pressable accessibilityRole="button" onPress={() => onResolveIncident(incident.id)} style={styles.reviewButton}>
                    <Text style={styles.reviewButtonText}>Mark reviewed</Text>
                  </Pressable>
                )}
              </View>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function formatIncidentTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const sensorRows: { key: SensorKey; title: string; copy: string; label: string; icon: IconName }[] = [
  { key: 'snatch', title: 'Phone Snatch Sensor', copy: 'Requires repeated acceleration and rotation spikes', label: 'MOTION MODEL READY', icon: icons.speed },
  { key: 'fall', title: 'Fall Sensor', copy: 'Checks for free-fall followed by impact and rotation', label: 'MOTION MODEL READY', icon: icons.motion },
];

function SafetyScreen({
  sensors,
  contacts,
  motionAvailable,
  commuteActive,
  contactPickerBusy,
  onToggle,
  onAddContact,
  onClearLocalData,
}: {
  sensors: typeof initialCommuteState.sensors;
  contacts: TrustedContact[];
  motionAvailable: boolean;
  commuteActive: boolean;
  contactPickerBusy: boolean;
  onToggle: (key: SensorKey) => void;
  onAddContact: () => void;
  onClearLocalData: () => void;
}) {
  return (
    <ScrollView testID="safety-screen" style={styles.scroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <ScreenTitle title="Sensor Preferences" subtitle="On-device readings during active commutes" />
      <View style={styles.stack}>
        {sensorRows.map((row) => (
          <Card key={row.key} style={styles.sensorCard}>
            <View style={styles.sensorRow}>
              <View style={styles.flexOne}><Text style={styles.cardTitle}>{row.title}</Text><Text style={styles.cardCopy}>{row.copy}</Text></View>
              <Toggle value={sensors[row.key]} onChange={() => onToggle(row.key)} label={`Toggle ${row.title}`} />
            </View>
            <View style={styles.sensorProgress}><View style={[styles.sensorProgressFill, { width: sensors[row.key] ? '100%' : '22%' }]} /></View>
            <Text style={styles.sensorLabel}>{!sensors[row.key] ? 'OFF' : commuteActive && motionAvailable ? row.label.replace('READY', 'READING') : 'RUNS DURING AN ACTIVE COMMUTE'}</Text>
          </Card>
        ))}
      </View>
      <Card style={styles.dataCard}>
        <View style={styles.dataIcon}><AppIcon name={icons.motion} size={20} color={palette.muted} /></View>
        <View style={styles.flexOne}><Text style={styles.cardTitle}>Trip Data</Text><Text style={styles.cardCopy}>No location history or call metadata is stored in this local build.</Text></View>
        <AppIcon name={icons.lock} size={16} color={palette.mutedDark} />
      </Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add trusted contact"
        accessibilityState={{ busy: contactPickerBusy, disabled: contactPickerBusy }}
        disabled={contactPickerBusy}
        onPress={onAddContact}
        style={[styles.contactsCard, contactPickerBusy && styles.contactsCardBusy]}
      >
        <View style={styles.avatarStack}>{contacts.slice(0, 3).map((contact, index) => <View key={contact.id} style={[styles.avatar, { marginLeft: index === 0 ? 0 : -8 }]}><Text style={styles.avatarText}>{contact.name.slice(0, 1)}</Text></View>)}</View>
        <View style={styles.flexOne}><Text style={styles.cardTitle}>Trusted Contacts</Text><Text style={styles.cardCopy}>{contactPickerBusy ? 'Opening phone contacts…' : contacts.length === 0 ? 'None saved yet' : `${contacts.length} saved locally · no invite sent`}</Text></View>
        <AppIcon name={icons.add} size={17} color={palette.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onClearLocalData} style={styles.clearDataButton}>
        <Text style={styles.clearDataText}>Clear Local Data</Text>
      </Pressable>
      <Text style={styles.sectionDisclaimer}>Detection is experimental and runs only during an active foreground commute. A candidate opens a 10-second cancellation screen; it never contacts emergency services by itself.</Text>
    </ScrollView>
  );
}

function BottomNavigation({ screen, onNavigate, onSos }: { screen: AppScreen; onNavigate: (screen: AppScreen) => void; onSos: () => void }) {
  const tabs: { id: AppScreen; label: string; icon: IconName }[] = [
    { id: 'track', label: 'Track', icon: icons.track },
    { id: 'routes', label: 'Routes', icon: icons.routes },
    { id: 'alerts', label: 'Alerts', icon: icons.alerts },
    { id: 'safety', label: 'Safety', icon: icons.safety },
  ];
  return (
    <View style={styles.bottomNav}>
      {tabs.slice(0, 2).map((tab) => <NavButton key={tab.id} tab={tab} active={screen === tab.id} onPress={() => onNavigate(tab.id)} />)}
      <Pressable accessibilityLabel="Open SOS demo" accessibilityRole="button" onPress={onSos} style={styles.sosButton}>
        <View style={styles.sosButtonInner}><AppIcon name={icons.shield} size={24} color={palette.red} /><Text style={styles.sosDemoLabel}>DEMO</Text></View>
      </Pressable>
      {tabs.slice(2).map((tab) => <NavButton key={tab.id} tab={tab} active={screen === tab.id} onPress={() => onNavigate(tab.id)} />)}
    </View>
  );
}

function NavButton({ tab, active, onPress }: { tab: { label: string; icon: IconName }; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={styles.navButton}>
      <AppIcon name={tab.icon} size={19} color={active ? palette.text : palette.mutedDark} />
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tab.label}</Text>
    </Pressable>
  );
}

function SosModal({ visible, onCancel }: { visible: boolean; onCancel: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onCancel}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.sosModal}>
        <View style={styles.sosShield}><AppIcon name={icons.shield} size={44} color={palette.white} /></View>
        <Text accessibilityRole="header" style={styles.sosTitle}>SOS DEMO</Text>
        <Text style={styles.sosCopy}>This screen previews the intended emergency flow.{`\n`}No alert has been sent.</Text>
        <Card style={styles.sosStatus}><AppIcon name={icons.camera} size={22} color="#FF7782" /><Text style={styles.sosStatusText}>Camera capture · Not connected</Text></Card>
        <Card style={styles.sosStatus}><AppIcon name={icons.call} size={22} color="#FF7782" /><Text style={styles.sosStatusText}>Calls and messages · Not connected</Text></Card>
        <Pressable accessibilityLabel="Close SOS demo" accessibilityRole="button" onPress={onCancel} style={styles.cancelSosButton}><Text style={styles.cancelSosText}>CLOSE DEMO</Text></Pressable>
        <Text style={styles.sosDisclaimer}>No location, image, message, or call leaves this device.</Text>
      </SafeAreaView>
    </Modal>
  );
}

function SafetyCandidateModal({
  candidate,
  onSafe,
  onEscalate,
}: {
  candidate: MotionSafetyCandidate;
  onSafe: () => void;
  onEscalate: () => void;
}) {
  const deadline = candidate.detectedAt + 10_000;
  const [remainingSeconds, setRemainingSeconds] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)));
  const escalationRef = useRef(onEscalate);
  const triggeredRef = useRef(false);

  useEffect(() => {
    escalationRef.current = onEscalate;
  }, [onEscalate]);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
      setRemainingSeconds(remaining);
      if (remaining === 0 && !triggeredRef.current) {
        triggeredRef.current = true;
        escalationRef.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [deadline]);

  const title = candidate.kind === 'fall' ? 'Possible fall detected' : 'Possible phone snatch';
  return (
    <Modal animationType="fade" transparent onRequestClose={onSafe} visible>
      <View style={styles.modalBackdropCentered}>
        <View style={styles.candidateModal}>
          <View style={styles.candidateAlertIcon}><AppIcon name={candidate.kind === 'fall' ? icons.motion : icons.speed} size={27} color="#FF8994" /></View>
          <Text accessibilityRole="header" style={styles.candidateTitle}>{title}</Text>
          <Text style={styles.candidateCopy}>Motion matched the experimental {candidate.kind} pattern. Confirm that you are safe to cancel.</Text>
          <View style={styles.countdownCircle}><Text style={styles.countdownValue}>{remainingSeconds}</Text><Text style={styles.countdownLabel}>SECONDS</Text></View>
          <Pressable accessibilityRole="button" onPress={onSafe} style={styles.safeButton}><Text style={styles.safeButtonText}>I&apos;M SAFE — CANCEL</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onEscalate} style={styles.localSosButton}><Text style={styles.localSosText}>Open local SOS now</Text></Pressable>
          <Text style={styles.candidateDisclaimer}>Countdown opens the local SOS screen only. No call or message is sent.</Text>
        </View>
      </View>
    </Modal>
  );
}

function AddContactModal({
  visible,
  initialContact,
  accessMessage,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  initialContact: ContactPrefill;
  accessMessage: string;
  onClose: () => void;
  onSubmit: (contact: TrustedContact) => void;
}) {
  const [name, setName] = useState(initialContact?.name ?? '');
  const [relation, setRelation] = useState('');
  const [phone, setPhone] = useState(initialContact?.phone ?? '');

  const submit = () => {
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    if (!cleanName || phoneDigits.length < 8 || phoneDigits.length > 15) {
      Alert.alert('Check contact details', 'Enter a name and a valid mobile number.');
      return;
    }
    onSubmit({ id: `${Date.now()}`, name: cleanName, relation: relation.trim() || 'Trusted contact', phone: cleanPhone, status: 'local' });
    setName(''); setRelation(''); setPhone('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <View style={styles.contactModal}>
          <Pressable accessibilityLabel="Close add contact" accessibilityRole="button" onPress={onClose} style={styles.closeButton}><AppIcon name={icons.close} size={17} color={palette.text} /></Pressable>
          <View style={styles.contactModalIcon}><AppIcon name={icons.people} size={23} color="#78A0FF" /></View>
          <Text style={styles.contactModalTitle}>Add trusted contact</Text>
          <Text style={styles.contactModalCopy}>Saved only on this device. No invitation or commute information is sent yet.</Text>
          <View accessibilityLiveRegion="polite" style={styles.contactAccessNotice}>
            <AppIcon name={initialContact ? icons.check : icons.lock} size={15} color={initialContact ? palette.green : palette.amber} />
            <Text style={styles.contactAccessText}>{accessMessage}</Text>
          </View>
          <TextInput accessibilityLabel="Contact name" value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={palette.mutedDark} style={styles.input} autoCapitalize="words" maxLength={80} />
          <TextInput accessibilityLabel="Relationship" value={relation} onChangeText={setRelation} placeholder="Relationship" placeholderTextColor={palette.mutedDark} style={styles.input} autoCapitalize="words" maxLength={80} />
          <TextInput accessibilityLabel="Mobile number" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" placeholderTextColor={palette.mutedDark} style={styles.input} keyboardType="phone-pad" maxLength={30} />
          <Pressable accessibilityRole="button" onPress={submit} style={styles.inviteButton}><AppIcon name={icons.add} size={16} color={palette.white} /><Text style={styles.inviteText}>Save Contact Locally</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ClearDataModal({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.modalBackdropCentered}>
        <View style={styles.confirmModal}>
          <View style={styles.contactModalIcon}><AppIcon name={icons.lock} size={22} color="#FF7A84" /></View>
          <Text style={styles.contactModalTitle}>Clear local data?</Text>
          <Text style={styles.contactModalCopy}>This removes saved contacts, routes, incident history, and preferences from this device. It cannot be undone.</Text>
          <View style={styles.confirmActions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.confirmCancel}><Text style={styles.confirmCancelText}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={onConfirm} style={styles.confirmDelete}><Text style={styles.confirmDeleteText}>Clear Data</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function CommutePingApp() {
  const [state, dispatch] = useReducer(commuteReducer, initialCommuteState);
  const [toast, setToast] = useState<ToastState>(null);
  const [contactModal, setContactModal] = useState(false);
  const [contactModalKey, setContactModalKey] = useState(0);
  const [contactPrefill, setContactPrefill] = useState<ContactPrefill>(null);
  const [contactAccessMessage, setContactAccessMessage] = useState('Enter contact details manually.');
  const [contactPickerBusy, setContactPickerBusy] = useState(false);
  const [routeModal, setRouteModal] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [clearDataModal, setClearDataModal] = useState(false);
  const deviationAlertedRouteRef = useRef<string | null>(null);
  const battery = useBatteryState();
  const commuteLocation = useCommuteLocation();
  const motion = useMotionReadings(state.phase === 'active' && (state.sensors.fall || state.sensors.snatch));
  const trackingProfile = useMemo(() => trackingProfileForBattery(state.batteryPercent, state.lowPowerMode), [state.batteryPercent, state.lowPowerMode]);
  const preferences = useMemo(() => ({ rules: state.rules, sensors: state.sensors, contacts: state.contacts, routes: state.routes, incidents: state.incidents }), [state.rules, state.sensors, state.contacts, state.routes, state.incidents]);
  const hydratePreferences = useCallback((stored: typeof preferences) => dispatch({ type: 'HYDRATE_PREFERENCES', preferences: stored }), []);
  const persistedPreferences = useCommutePreferences(preferences, hydratePreferences);
  const selectedRoute = useMemo(
    () => state.routes.find((route) => route.id === selectedRouteId) ?? state.routes[0] ?? null,
    [selectedRouteId, state.routes],
  );
  const activeRoute = useMemo(
    () => state.routes.find((route) => route.id === state.activeRouteId) ?? null,
    [state.activeRouteId, state.routes],
  );
  const displayedRoute = state.phase === 'idle' ? selectedRoute : activeRoute;
  const routeTracking = useRouteDeviation(
    state.phase === 'active',
    displayedRoute,
    commuteLocation.location,
  );
  const commuteClock = useCommuteClock(state.phase === 'active');
  const idleMonitor = useIdleMonitor(state.phase === 'active', commuteLocation.location);
  const motionSafety = useMotionSafetyCandidate(state.phase === 'active', motion, state.sensors);
  const timing = state.phase === 'active' && activeRoute && state.startedAt !== null
    ? commuteTimingAt(state.startedAt, activeRoute.durationMinutes, commuteClock)
    : null;

  useEffect(() => {
    if (routeTracking.deviation.status === 'deviated' && activeRoute) {
      if (deviationAlertedRouteRef.current === activeRoute.id) return;
      deviationAlertedRouteRef.current = activeRoute.id;
      dispatch({
        type: 'RECORD_INCIDENT',
        incident: createLocalIncident({
          id: `deviation-${state.startedAt ?? Date.now()}`,
          kind: 'deviation',
          title: 'Route deviation detected',
          detail: routeTracking.deviation.distanceFromRouteMeters === null
            ? `Commute moved away from ${activeRoute.title}.`
            : `Commute was about ${Math.round(routeTracking.deviation.distanceFromRouteMeters)} m from ${activeRoute.title}.`,
          routeId: activeRoute.id,
        }),
      });
      setToast({ id: Date.now(), message: `Possible deviation from ${activeRoute.title} · check the map` });
      return;
    }
    if (routeTracking.deviation.status === 'on-route') deviationAlertedRouteRef.current = null;
  }, [activeRoute, routeTracking.deviation.distanceFromRouteMeters, routeTracking.deviation.status, state.startedAt]);

  useEffect(() => {
    if (state.phase !== 'active' || state.startedAt === null || timing?.status !== 'late' || !activeRoute) return;
    dispatch({
      type: 'RECORD_INCIDENT',
      incident: createLocalIncident({
        id: `late-${state.startedAt}`,
        kind: 'late',
        title: 'Expected arrival passed',
        detail: `${activeRoute.title} is ${Math.abs(timing.remainingMinutes)} minutes past its expected arrival window.`,
        routeId: activeRoute.id,
      }),
    });
  }, [activeRoute, state.phase, state.startedAt, timing?.remainingMinutes, timing?.status]);

  useEffect(() => {
    if (state.phase !== 'active' || state.startedAt === null || idleMonitor.status !== 'idle' || !state.rules.idle) return;
    dispatch({
      type: 'RECORD_INCIDENT',
      incident: createLocalIncident({
        id: `idle-${state.startedAt}`,
        kind: 'idle',
        title: 'Prolonged idle detected',
        detail: 'No meaningful movement was detected for 8 minutes. A check-in is recommended.',
        routeId: activeRoute?.id,
      }),
    });
  }, [activeRoute?.id, idleMonitor.status, state.phase, state.rules.idle, state.startedAt]);

  useEffect(() => {
    if (state.phase !== 'active' || state.startedAt === null || !state.rules.battery || state.batteryPercent > 15) return;
    dispatch({
      type: 'RECORD_INCIDENT',
      incident: createLocalIncident({
        id: `battery-${state.startedAt}`,
        kind: 'battery',
        title: 'Critical battery',
        detail: `Battery reached ${state.batteryPercent}% during the commute. Battery-saver tracking is active.`,
        routeId: activeRoute?.id,
      }),
    });
  }, [activeRoute?.id, state.batteryPercent, state.phase, state.rules.battery, state.startedAt]);

  useEffect(() => {
    if (battery.batteryPercent === null) return;
    dispatch({ type: 'SET_BATTERY', percent: battery.batteryPercent, lowPowerMode: battery.lowPowerMode });
  }, [battery.batteryPercent, battery.lowPowerMode]);

  useEffect(() => {
    if (state.phase === 'active' && commuteLocation.runtimeStatus === 'unavailable') {
      dispatch({ type: 'LOCATION_LOST' });
    }
  }, [commuteLocation.runtimeStatus, state.phase]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const notify = (message: string) => setToast({ id: Date.now(), message });

  const startCommute = async () => {
    dispatch({ type: 'START_REQUESTED', routeId: selectedRoute?.id ?? null });
    const result = await commuteLocation.start(trackingProfile);
    if (!result.ok) {
      dispatch({ type: 'START_FAILED', status: result.reason });
      Alert.alert(
        result.reason === 'denied' ? 'Location permission needed' : 'Location unavailable',
        result.reason === 'denied'
          ? 'Commute Ping uses foreground location only during an active commute and displays it on this device. Enable permission to start.'
          : 'Turn on device location services and try again.',
      );
      return;
    }
    dispatch({ type: 'START_SUCCEEDED', timestamp: Date.now() });
    notify(selectedRoute ? `${selectedRoute.title} started · location stays on this device` : 'Commute started · location is visible on this device only');
  };

  const endCommute = () => {
    const endedAt = Date.now();
    commuteLocation.stop();
    dispatch({
      type: 'RECORD_INCIDENT',
      incident: createLocalIncident({
        kind: 'check-in',
        title: 'Safe arrival recorded',
        detail: activeRoute ? `${activeRoute.title} was ended by the commuter.` : 'The commute was ended by the commuter.',
        status: 'recorded',
        routeId: activeRoute?.id,
        createdAt: endedAt,
      }),
    });
    dispatch({ type: 'END_COMMUTE', timestamp: endedAt });
    notify('Local safe arrival recorded · foreground location stopped');
  };

  const checkIn = () => {
    const checkedInAt = Date.now();
    dispatch({ type: 'CHECK_IN', timestamp: checkedInAt });
    dispatch({
      type: 'RECORD_INCIDENT',
      incident: createLocalIncident({
        kind: 'check-in',
        title: 'Manual check-in',
        detail: activeRoute ? `Checked in during ${activeRoute.title}.` : 'Checked in during an active commute.',
        status: 'recorded',
        routeId: activeRoute?.id,
        createdAt: checkedInAt,
      }),
    });
    notify('Local check-in recorded · nothing was sent');
  };

  const respondToMotionCandidate = (safe: boolean) => {
    const candidate = motionSafety.candidate;
    if (!candidate) return;
    dispatch({
      type: 'RECORD_INCIDENT',
      incident: createLocalIncident({
        id: `${candidate.kind}-${candidate.detectedAt}`,
        kind: candidate.kind,
        title: candidate.kind === 'fall' ? 'Possible fall' : 'Possible phone snatch',
        detail: `${candidate.accelerationG.toFixed(1)} g acceleration · ${candidate.rotationRadians.toFixed(1)} rad/s rotation. ${safe ? 'Cancelled as safe.' : 'Local SOS screen opened.'}`,
        status: safe ? 'dismissed' : 'open',
        routeId: activeRoute?.id,
        createdAt: candidate.detectedAt,
      }),
    });
    motionSafety.clearCandidate();
    if (safe) {
      notify('Motion alert cancelled and recorded locally');
      return;
    }
    dispatch({ type: 'OPEN_SOS' });
    notify('Local SOS opened · no call or message was sent');
  };

  const openLocalSos = () => {
    const openedAt = Date.now();
    dispatch({
      type: 'RECORD_INCIDENT',
      incident: createLocalIncident({
        kind: 'sos',
        title: 'Local SOS opened',
        detail: 'The emergency preview was opened manually. No external alert was sent.',
        status: 'open',
        routeId: activeRoute?.id,
        createdAt: openedAt,
      }),
    });
    dispatch({ type: 'OPEN_SOS' });
  };

  const addTrustedContact = async () => {
    if (contactPickerBusy) return;
    setContactPickerBusy(true);
    try {
      const result = await pickDeviceContact();
      const contactSetup = contactSetupForResult(result);
      setContactPrefill(contactSetup.prefill);
      setContactAccessMessage(contactSetup.message);
      setContactModalKey((current) => current + 1);
      setContactModal(true);
    } finally {
      setContactPickerBusy(false);
    }
  };

  let screen: ReactNode;
  if (state.screen === 'track') {
    screen = <TrackScreen phase={state.phase} routes={state.routes} selectedRouteId={selectedRoute?.id ?? null} displayedRoute={displayedRoute} routeCoordinates={routeTracking.routeCoordinates} routeMonitoringAvailable={routeTracking.monitoringAvailable} routeDeviation={routeTracking.deviation} timing={timing} idleStatus={idleMonitor.status} currentLocation={commuteLocation.location} batteryPercent={battery.batteryPercent} lowPowerMode={state.lowPowerMode} profileLabel={trackingProfile.label} locationStatus={commuteLocation.runtimeStatus} acceleration={motion.acceleration} rotation={motion.rotation} motionAvailable={motion.available} onSelectRoute={setSelectedRouteId} onStart={startCommute} onEnd={endCommute} onCheckIn={checkIn} />;
  } else if (state.screen === 'routes') {
    screen = <RoutesScreen routes={state.routes} onAdd={() => setRouteModal(true)} />;
  } else if (state.screen === 'alerts') {
    screen = <AlertsScreen rules={state.rules} incidents={state.incidents} onToggle={(key) => dispatch({ type: 'TOGGLE_RULE', key })} onResolveIncident={(id) => dispatch({ type: 'RESOLVE_INCIDENT', id, status: 'recorded' })} />;
  } else {
    screen = <SafetyScreen sensors={state.sensors} contacts={state.contacts} motionAvailable={motion.available} commuteActive={state.phase === 'active'} contactPickerBusy={contactPickerBusy} onToggle={(key) => dispatch({ type: 'TOGGLE_SENSOR', key })} onAddContact={addTrustedContact} onClearLocalData={() => setClearDataModal(true)} />;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.appShell}>
        <View style={styles.content}>{screen}</View>
        <BottomNavigation screen={state.screen} onNavigate={(next) => dispatch({ type: 'NAVIGATE', screen: next })} onSos={openLocalSos} />
      </View>
      <SosModal visible={state.sosActive} onCancel={() => { dispatch({ type: 'CLOSE_SOS' }); notify('SOS demo closed · no data was sent'); }} />
      {motionSafety.candidate && <SafetyCandidateModal key={motionSafety.candidate.detectedAt} candidate={motionSafety.candidate} onSafe={() => respondToMotionCandidate(true)} onEscalate={() => respondToMotionCandidate(false)} />}
      <AddContactModal key={contactModalKey} visible={contactModal} initialContact={contactPrefill} accessMessage={contactAccessMessage} onClose={() => setContactModal(false)} onSubmit={(contact) => { dispatch({ type: 'ADD_CONTACT', contact }); setContactModal(false); notify(`${contact.name} saved locally · no invite sent`); }} />
      <RoutePickerModal visible={routeModal} onClose={() => setRouteModal(false)} onSubmit={(route) => { dispatch({ type: 'ADD_ROUTE', route }); setSelectedRouteId(route.id); setRouteModal(false); notify(`${route.title} saved locally and selected`); }} />
      <ClearDataModal visible={clearDataModal} onCancel={() => setClearDataModal(false)} onConfirm={() => { dispatch({ type: 'RESET_PREFERENCES' }); setSelectedRouteId(null); setClearDataModal(false); notify('Local contacts, routes, incidents, and preferences cleared'); }} />
      {persistedPreferences.storageError && <View accessibilityLiveRegion="polite" style={styles.storageWarning}><Text style={styles.storageWarningText}>Local changes could not be saved. Keep the app open and try again.</Text></View>}
      {toast && <View key={toast.id} accessibilityLiveRegion="polite" style={styles.toast}><AppIcon name={icons.check} size={15} color={palette.green} /><Text style={styles.toastText}>{toast.message}</Text></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.phone },
  appShell: { flex: 1, backgroundColor: palette.phone },
  content: { flex: 1 },
  scroll: { flex: 1 },
  pageContent: { paddingHorizontal: 24, paddingTop: 42, paddingBottom: 34 },
  screenTitle: { marginBottom: 32 },
  screenHeading: { color: palette.text, fontSize: 27, fontWeight: '700', letterSpacing: -1.1 },
  screenSubtitle: { color: palette.muted, fontSize: 13, marginTop: 5 },
  card: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: radius.medium, borderWidth: StyleSheet.hairlineWidth },
  cardPressed: { backgroundColor: palette.cardPressed },
  flexOne: { flex: 1 },
  stack: { gap: 15 },
  cardTitle: { color: palette.text, fontSize: 14, fontWeight: '600' },
  cardCopy: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  emptyCard: { padding: 18 },
  routeSetupCard: { padding: 15, marginBottom: 14 },
  routeSelector: { marginBottom: 14 },
  routeSelectorLabel: { color: palette.mutedDark, fontSize: 9, fontWeight: '700', letterSpacing: 0.7, marginBottom: 9 },
  routeSelectorContent: { gap: 9, paddingRight: 8 },
  routeChoice: { width: 190, minHeight: 62, borderRadius: radius.medium, borderColor: palette.line, borderWidth: 1, backgroundColor: palette.card, paddingHorizontal: 12, paddingVertical: 10 },
  routeChoiceSelected: { borderColor: '#5E83E9', backgroundColor: palette.blueSoft },
  routeChoiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  routeChoiceTitle: { color: palette.text, flex: 1, fontSize: 12, fontWeight: '600' },
  routeChoiceTitleSelected: { color: '#D7E2FF' },
  routeChoiceSchedule: { color: palette.muted, fontSize: 9, marginTop: 7 },
  activeRouteMap: { height: 260, backgroundColor: '#1C1D21', borderColor: palette.line, borderRadius: radius.large, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', position: 'relative' },
  activeRouteTitleBadge: { position: 'absolute', left: 12, right: 12, top: 12, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(18,18,21,0.92)', borderColor: palette.lineStrong, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10 },
  activeRouteTitle: { color: palette.text, flex: 1, fontSize: 10, fontWeight: '600' },
  activeRouteStatusBadge: { position: 'absolute', left: 12, right: 12, bottom: 12, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(18,18,21,0.94)', borderColor: palette.lineStrong, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 7 },
  activeRouteStatus: { color: '#D2D2D7', flex: 1, fontSize: 10, lineHeight: 14 },
  routeStatusDot: { width: 7, height: 7, borderRadius: 4 },
  map: { height: 260, backgroundColor: '#1C1D21', borderColor: palette.line, borderRadius: radius.large, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', position: 'relative' },
  mapDot: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#343945' },
  locationPulse: { position: 'absolute', left: '47%', top: '46%', width: 27, height: 27, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(57,115,246,0.35)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(57,115,246,0.08)' },
  locationDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: palette.blue, borderWidth: 2, borderColor: '#141A2B' },
  routeLine: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: palette.blue, transformOrigin: 'left' },
  routeLineOne: { width: '34%', left: '18%', top: '64%', transform: [{ rotate: '-28deg' }] },
  routeLineTwo: { width: '25%', left: '49%', top: '48%', transform: [{ rotate: '-75deg' }] },
  routeLineThree: { width: '27%', left: '56%', top: '25%', transform: [{ rotate: '17deg' }] },
  homePin: { position: 'absolute', right: '12%', top: '29%', width: 28, height: 28, borderRadius: 14, backgroundColor: palette.green, borderWidth: 3, borderColor: '#D9FFF0', alignItems: 'center', justifyContent: 'center' },
  fallbackBadge: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(18,18,21,0.92)', borderColor: palette.lineStrong, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 9, paddingVertical: 6 },
  fallbackText: { color: '#D2D2D7', fontSize: 10 },
  etaBadge: { position: 'absolute', left: '48%', top: 17, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: '#111216', borderColor: palette.lineStrong, borderWidth: StyleSheet.hairlineWidth },
  etaText: { color: palette.text, fontSize: 9 },
  commuteSegment: { marginTop: 22, padding: 4, borderRadius: 20, backgroundColor: '#17171A', borderColor: palette.line, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
  segmentButton: { minHeight: 47, flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  segmentButtonSelected: { backgroundColor: '#29292D' },
  commuteActiveButton: { backgroundColor: palette.blue },
  segmentLabel: { color: '#C1C1C7', fontSize: 13, fontWeight: '500' },
  segmentActiveLabel: { color: palette.white, fontWeight: '600' },
  insightGrid: { marginTop: 14, flexDirection: 'row', gap: 13 },
  insightCard: { flex: 1, minHeight: 96, padding: 14 },
  insightValue: { color: palette.text, fontSize: 15, fontWeight: '700', marginTop: 10 },
  insightMeta: { color: palette.muted, fontSize: 10, marginTop: 5 },
  metricGrid: { marginTop: 20, flexDirection: 'row', gap: 13 },
  metricCard: { flex: 1, minHeight: 78, padding: 14 },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricLabel: { color: palette.muted, fontSize: 9, letterSpacing: 0.3 },
  metricValue: { color: palette.text, fontSize: 13, fontWeight: '600', marginTop: 8 },
  sensorMetric: { minHeight: 102 },
  sensorMetricHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sensorOffText: { color: palette.mutedDark, fontSize: 10, letterSpacing: 0.5, marginTop: 24 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  barChart: { height: 48, flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginTop: 8 },
  chartBar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: '#3973D8' },
  lineChart: { height: 48, marginTop: 8, position: 'relative' },
  lineSegment: { position: 'absolute', height: 2, backgroundColor: '#BD3148', transformOrigin: 'left' },
  lineOne: { width: '30%', top: 25, left: 0, transform: [{ rotate: '-9deg' }] },
  lineTwo: { width: '32%', top: 21, left: '27%', transform: [{ rotate: '25deg' }] },
  lineThree: { width: '31%', top: 33, left: '54%', transform: [{ rotate: '-37deg' }] },
  lineFour: { width: '25%', top: 16, left: '76%', transform: [{ rotate: '17deg' }] },
  privacyCaption: { color: palette.mutedDark, fontSize: 10, textAlign: 'center', marginTop: 18 },
  routeCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.card, borderColor: palette.line, borderRadius: radius.medium, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15, paddingVertical: 13 },
  routeIcon: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blueSoft },
  routePlaces: { color: '#AFC5FF', fontSize: 10, lineHeight: 14, marginTop: 5 },
  saveRouteButton: { marginTop: 18, minHeight: 55, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.lineStrong, borderRadius: radius.medium, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  saveRouteButtonDone: { borderColor: 'rgba(69,201,148,0.35)', backgroundColor: palette.greenSoft },
  saveRouteText: { color: palette.muted, fontSize: 12, fontWeight: '500' },
  patternCard: { marginTop: 28, backgroundColor: 'rgba(52,69,171,0.12)', borderColor: 'rgba(78,102,220,0.25)', padding: 17 },
  patternTitle: { color: '#7EA3FF', fontSize: 13, fontWeight: '600' },
  patternCopy: { color: '#AAAAB5', fontSize: 11, lineHeight: 17, marginTop: 9 },
  ruleCard: { minHeight: 76, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ruleDisabled: { opacity: 0.65 },
  ruleIcon: { width: 39, height: 39, borderRadius: 20, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  historyHeader: { marginTop: 34, marginBottom: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyTitle: { color: palette.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  historyCount: { color: '#AFC5FF', fontSize: 10, fontWeight: '700', backgroundColor: palette.blueSoft, borderRadius: 10, minWidth: 22, textAlign: 'center', paddingVertical: 3 },
  incidentCard: { minHeight: 104, flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14 },
  incidentIcon: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blueSoft },
  incidentIconOpen: { backgroundColor: 'rgba(239,57,75,0.12)' },
  incidentTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  incidentStatus: { color: '#AFC5FF', fontSize: 7, fontWeight: '800', letterSpacing: 0.5, borderRadius: 8, backgroundColor: palette.blueSoft, paddingHorizontal: 6, paddingVertical: 3 },
  incidentStatusOpen: { color: '#FF939D', backgroundColor: 'rgba(239,57,75,0.12)' },
  incidentTime: { color: palette.mutedDark, fontSize: 9, marginTop: 7 },
  reviewButton: { alignSelf: 'flex-start', minHeight: 30, borderRadius: 9, borderColor: palette.lineStrong, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 10, marginTop: 9 },
  reviewButtonText: { color: '#C7C7CF', fontSize: 9, fontWeight: '600' },
  toggle: { width: 50, height: 29, borderRadius: radius.pill, padding: 3, backgroundColor: '#4C4C53' },
  toggleOn: { backgroundColor: palette.blue },
  toggleThumb: { width: 23, height: 23, borderRadius: 12, backgroundColor: palette.white },
  toggleThumbOn: { transform: [{ translateX: 21 }] },
  sectionDisclaimer: { color: palette.mutedDark, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 22, paddingHorizontal: 12 },
  sensorCard: { padding: 17 },
  sensorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sensorProgress: { height: 5, borderRadius: 3, backgroundColor: '#38383D', marginTop: 15, overflow: 'hidden' },
  sensorProgressFill: { height: '100%', backgroundColor: '#347C62', borderRadius: 3 },
  sensorLabel: { color: palette.mutedDark, fontSize: 9, letterSpacing: 0.6, marginTop: 10 },
  dataCard: { marginTop: 17, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11 },
  dataIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#29292D', alignItems: 'center', justifyContent: 'center' },
  contactsCard: { marginTop: 14, minHeight: 68, borderRadius: radius.medium, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.lineStrong, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  contactsCardBusy: { opacity: 0.58 },
  clearDataButton: { minHeight: 45, borderRadius: radius.medium, borderColor: 'rgba(239,57,75,0.35)', borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  clearDataText: { color: '#FF7A84', fontSize: 11, fontWeight: '600' },
  avatarStack: { flexDirection: 'row' },
  avatar: { width: 31, height: 31, borderRadius: 16, borderWidth: 2, borderColor: palette.phone, backgroundColor: '#293451', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ABC1FF', fontSize: 10, fontWeight: '700' },
  bottomNav: { minHeight: 76, paddingHorizontal: 16, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: '#17151A', flexDirection: 'row', alignItems: 'center' },
  navButton: { flex: 1, height: 66, alignItems: 'center', justifyContent: 'center', gap: 5 },
  navLabel: { color: palette.mutedDark, fontSize: 9 },
  navLabelActive: { color: palette.text },
  sosButton: { width: 70, height: 70, marginTop: -34, borderRadius: 35, backgroundColor: '#25252A', borderColor: '#4B4B53', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sosButtonInner: { width: 49, height: 49, borderRadius: 25, borderColor: 'rgba(239,57,75,0.35)', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sosDemoLabel: { color: '#FF7682', fontSize: 7, fontWeight: '700', letterSpacing: 0.7, marginTop: -2 },
  sosModal: { flex: 1, backgroundColor: '#4A0B10', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  sosShield: { width: 96, height: 96, borderRadius: 48, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center' },
  sosTitle: { color: palette.white, fontSize: 30, fontWeight: '700', letterSpacing: -0.8, marginTop: 31 },
  sosCopy: { color: '#F0D4D7', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 13, marginBottom: 24 },
  sosStatus: { width: '100%', minHeight: 57, marginBottom: 11, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: 'rgba(102,17,24,0.74)', borderColor: 'rgba(240,77,87,0.55)' },
  sosStatusText: { color: palette.white, fontSize: 13, fontWeight: '600' },
  cancelSosButton: { width: '90%', minHeight: 52, borderRadius: radius.pill, borderColor: '#55555C', borderWidth: 1, backgroundColor: '#17171A', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  cancelSosText: { color: palette.white, fontSize: 12, fontWeight: '700' },
  sosDisclaimer: { color: '#A86167', fontSize: 9, textAlign: 'center', marginTop: 16 },
  candidateModal: { width: '100%', maxWidth: 390, alignItems: 'center', borderRadius: 26, borderColor: 'rgba(239,57,75,0.42)', borderWidth: 1, backgroundColor: '#18181C', padding: 24 },
  candidateAlertIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,57,75,0.13)' },
  candidateTitle: { color: palette.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.5, marginTop: 17 },
  candidateCopy: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  countdownCircle: { width: 98, height: 98, borderRadius: 49, alignItems: 'center', justifyContent: 'center', borderColor: palette.red, borderWidth: 4, backgroundColor: 'rgba(239,57,75,0.08)', marginVertical: 22 },
  countdownValue: { color: palette.white, fontSize: 34, fontWeight: '800' },
  countdownLabel: { color: '#FF9EA7', fontSize: 7, fontWeight: '800', letterSpacing: 0.9, marginTop: -2 },
  safeButton: { width: '100%', minHeight: 50, borderRadius: 14, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  safeButtonText: { color: '#09251B', fontSize: 12, fontWeight: '800' },
  localSosButton: { width: '100%', minHeight: 46, borderRadius: 13, borderColor: 'rgba(239,57,75,0.45)', borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  localSosText: { color: '#FF8B95', fontSize: 11, fontWeight: '700' },
  candidateDisclaimer: { color: palette.mutedDark, fontSize: 9, lineHeight: 13, textAlign: 'center', marginTop: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalBackdropCentered: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmModal: { width: '100%', maxWidth: 380, backgroundColor: palette.phone, borderRadius: 24, borderColor: palette.lineStrong, borderWidth: 1, padding: 24 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  confirmCancel: { minHeight: 44, flex: 1, borderRadius: 11, borderColor: palette.lineStrong, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  confirmCancelText: { color: palette.text, fontSize: 12, fontWeight: '600' },
  confirmDelete: { minHeight: 44, flex: 1, borderRadius: 11, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center' },
  confirmDeleteText: { color: palette.white, fontSize: 12, fontWeight: '700' },
  contactModal: { backgroundColor: palette.phone, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderColor: palette.lineStrong, borderTopWidth: 1, padding: 24, paddingBottom: Platform.OS === 'ios' ? 38 : 24 },
  closeButton: { position: 'absolute', top: 18, right: 18, width: 34, height: 34, borderRadius: 10, backgroundColor: '#29292D', alignItems: 'center', justifyContent: 'center' },
  contactModalIcon: { width: 47, height: 47, borderRadius: 14, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  contactModalTitle: { color: palette.text, fontSize: 21, fontWeight: '700', marginTop: 18 },
  contactModalCopy: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 7, marginBottom: 8, maxWidth: 330 },
  contactAccessNotice: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: '#242429', borderColor: palette.line, borderWidth: 1, paddingHorizontal: 11, marginTop: 6 },
  contactAccessText: { flex: 1, color: '#C6C6CE', fontSize: 10, lineHeight: 14 },
  input: { minHeight: 47, borderRadius: 11, borderColor: palette.line, borderWidth: 1, backgroundColor: '#111114', color: palette.text, fontSize: 13, paddingHorizontal: 13, marginTop: 11 },
  inviteButton: { minHeight: 47, borderRadius: 11, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 17 },
  inviteText: { color: palette.white, fontSize: 13, fontWeight: '600' },
  storageWarning: { position: 'absolute', left: 18, right: 18, bottom: 92, minHeight: 45, borderRadius: 12, backgroundColor: '#FFF0D8', justifyContent: 'center', paddingHorizontal: 14 },
  storageWarningText: { color: '#573A08', fontSize: 11, fontWeight: '600' },
  toast: { position: 'absolute', left: 18, right: 18, bottom: 92, minHeight: 45, borderRadius: 12, backgroundColor: '#EFF9F4', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  toastText: { color: '#153126', fontSize: 11, fontWeight: '600', flex: 1 },
});
