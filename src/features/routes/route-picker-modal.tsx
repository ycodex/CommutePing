import * as Location from 'expo-location';
import type { SymbolViewProps } from 'expo-symbols';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { fetchRoadRoute } from '@/device/road-routing';
import type { RouteGeometry, RoutePoint, SavedRoute } from '@/domain/commute';
import { RouteMap } from './route-map';

type RouteStop = 'origin' | 'destination';
type IconName = SymbolViewProps['name'];

const pickerIcons: Record<'back' | 'search' | 'current' | 'route' | 'save' | 'swap' | 'pin' | 'clock', IconName> = {
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  current: { ios: 'location.fill', android: 'my_location', web: 'my_location' },
  route: { ios: 'point.topleft.down.to.point.bottomright.curvepath', android: 'route', web: 'route' },
  save: { ios: 'checkmark', android: 'check', web: 'check' },
  swap: { ios: 'arrow.up.arrow.down', android: 'swap_vert', web: 'swap_vert' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  clock: { ios: 'clock.fill', android: 'schedule', web: 'schedule' },
};

const schedulePresets = ['Weekdays · 8:30 AM', 'Weekdays · 6:30 PM', 'Daily · Flexible'];
const durationPresets = [20, 30, 45, 60];

export function RoutePickerModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (route: SavedRoute) => void;
}) {
  const [activeStop, setActiveStop] = useState<RouteStop>('origin');
  const [origin, setOrigin] = useState<RoutePoint | null>(null);
  const [destination, setDestination] = useState<RoutePoint | null>(null);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [titleCustomized, setTitleCustomized] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [duration, setDuration] = useState('');
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<RoutePoint[]>([]);
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const routeRequestRef = useRef(0);

  const focusedPoint = activeStop === 'origin' ? origin : destination;
  const routeReady = Boolean(origin && destination);
  const roadRouteReady = routeGeometry?.source === 'road';

  const resetForm = () => {
    setActiveStop('origin');
    setOrigin(null);
    setDestination(null);
    setQuery('');
    setTitle('');
    setTitleCustomized(false);
    setSchedule('');
    setDuration('');
    setBusyLabel(null);
    setSearchResults([]);
    setRouteGeometry(null);
    setRouteBusy(false);
    setRouteError(null);
    routeRequestRef.current += 1;
  };

  const close = () => {
    resetForm();
    onClose();
  };

  const refreshRoadRoute = async (nextOrigin: RoutePoint, nextDestination: RoutePoint): Promise<RouteGeometry | null> => {
    const requestId = routeRequestRef.current + 1;
    routeRequestRef.current = requestId;
    setRouteBusy(true);
    setRouteError(null);
    setRouteGeometry(null);
    try {
      const geometry = await fetchRoadRoute(nextOrigin, nextDestination);
      if (routeRequestRef.current !== requestId) return null;
      setRouteGeometry(geometry);
      return geometry;
    } catch {
      if (routeRequestRef.current !== requestId) return null;
      setRouteError('A road route could not be loaded. Check the connection and retry before saving.');
      return null;
    } finally {
      if (routeRequestRef.current === requestId) setRouteBusy(false);
    }
  };

  const savePoint = (point: RoutePoint) => {
    const nextOrigin = activeStop === 'origin' ? point : origin;
    const nextDestination = activeStop === 'destination' ? point : destination;
    if (activeStop === 'origin') {
      setOrigin(point);
      setActiveStop('destination');
    } else {
      setDestination(point);
    }
    if (!titleCustomized && nextOrigin && nextDestination) {
      setTitle(`${shortLabel(nextOrigin.label)} to ${shortLabel(nextDestination.label)}`);
    }
    setQuery('');
    setSearchResults([]);
    if (nextOrigin && nextDestination) {
      void refreshRoadRoute(nextOrigin, nextDestination);
    } else {
      routeRequestRef.current += 1;
      setRouteGeometry(null);
      setRouteError(null);
    }
  };

  const focusStop = (stop: RouteStop) => {
    setActiveStop(stop);
    setQuery('');
    setSearchResults([]);
  };

  const swapStops = () => {
    const nextOrigin = destination;
    const nextDestination = origin;
    setOrigin(nextOrigin);
    setDestination(nextDestination);
    setActiveStop(nextOrigin ? 'destination' : 'origin');
    setQuery('');
    setSearchResults([]);
    setRouteGeometry(null);
    setRouteError(null);
    if (!titleCustomized && nextOrigin && nextDestination) {
      setTitle(`${shortLabel(nextOrigin.label)} to ${shortLabel(nextDestination.label)}`);
    }
    if (nextOrigin && nextDestination) {
      void refreshRoadRoute(nextOrigin, nextDestination);
    } else {
      routeRequestRef.current += 1;
      setRouteBusy(false);
    }
  };

  const search = async () => {
    const cleanQuery = query.trim();
    if (Platform.OS === 'web') {
      Alert.alert('Open the mobile app', 'Place search and map selection are available on Android and iOS.');
      return;
    }
    if (cleanQuery.length < 3) {
      Alert.alert('Search a place', 'Enter at least 3 characters, such as a landmark, street, or area.');
      return;
    }

    setBusyLabel(`Searching for ${cleanQuery}`);
    try {
      const granted = await ensureForegroundPermission();
      if (!granted) {
        Alert.alert('Location permission needed', 'Android requires foreground location permission for place search. You can still tap the map to save coordinates.');
        return;
      }
      const results = await Location.geocodeAsync(cleanQuery);
      if (results.length === 0) {
        Alert.alert('Place not found', 'Try adding the city, state, or a nearby landmark.');
        return;
      }
      const choices = await Promise.all(results.slice(0, 5).map(async (result, index) => ({
        label: await resolveLabel(result, index === 0 ? cleanQuery : `${cleanQuery} · result ${index + 1}`),
        latitude: result.latitude,
        longitude: result.longitude,
      })));
      setSearchResults(choices.filter((choice, index, values) => (
        values.findIndex((other) => other.latitude === choice.latitude && other.longitude === choice.longitude) === index
      )));
    } catch {
      Alert.alert('Search unavailable', 'The device could not search for that place. Check the internet connection and try again.');
    } finally {
      setBusyLabel(null);
    }
  };

  const selectFromMap = async (coordinate: Pick<RoutePoint, 'latitude' | 'longitude'>) => {
    setBusyLabel('Naming selected location');
    let label = coordinateLabel(coordinate);
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.granted) label = await resolveLabel(coordinate, label);
    } catch {
      // Coordinates remain usable when reverse geocoding is unavailable.
    } finally {
      savePoint({ ...coordinate, label });
      setBusyLabel(null);
    }
  };

  const useCurrentLocation = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Open the mobile app', 'Current-location selection is available on Android and iOS.');
      return;
    }
    setBusyLabel('Getting current location');
    try {
      const granted = await ensureForegroundPermission();
      if (!granted) {
        Alert.alert('Location permission needed', 'Allow foreground location access to use your current position.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coordinate = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      const label = await resolveLabel(coordinate, 'Current location');
      savePoint({ ...coordinate, label });
    } catch {
      Alert.alert('Location unavailable', 'Turn on location services and try again.');
    } finally {
      setBusyLabel(null);
    }
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    const cleanSchedule = schedule.trim();
    const durationMinutes = Number(duration);
    if (!origin || !destination) {
      Alert.alert('Choose both places', 'Select a start and destination using search or the map.');
      return;
    }
    if (!cleanTitle || !cleanSchedule || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 360) {
      Alert.alert('Check route details', 'Enter a route name, schedule, and duration from 1 to 360 minutes.');
      return;
    }
    const roadGeometry = routeGeometry ?? await refreshRoadRoute(origin, destination);
    if (!roadGeometry) {
      Alert.alert('Road route unavailable', 'Commute Ping needs a road-following route before it can monitor a commute. Check the connection and retry.');
      return;
    }
    onSubmit({
      id: `${Date.now()}`,
      title: cleanTitle,
      schedule: cleanSchedule,
      durationMinutes,
      learned: false,
      origin,
      destination,
      geometry: roadGeometry,
    });
    resetForm();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Pressable accessibilityLabel="Close route picker" accessibilityRole="button" onPress={close} style={styles.iconButton}>
                <AppIcon name={pickerIcons.back} size={19} color={palette.text} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text accessibilityRole="header" style={styles.title}>Add a regular commute</Text>
                <Text style={styles.subtitle}>Choose both places, then add the usual timing</Text>
              </View>
            </View>

            <View style={styles.placesCard}>
              <Text style={styles.stepLabel}>1 · CHOOSE PLACES</Text>
              <StopButton label="Starting from" point={origin} active={activeStop === 'origin'} color={palette.green} onPress={() => focusStop('origin')} />
              <View style={styles.stopConnector} />
              <StopButton label="Going to" point={destination} active={activeStop === 'destination'} color={palette.red} onPress={() => focusStop('destination')} />
              <Pressable accessibilityLabel="Swap start and destination" accessibilityRole="button" onPress={swapStops} style={styles.swapButton}>
                <AppIcon name={pickerIcons.swap} size={18} color={palette.text} />
              </Pressable>
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <AppIcon name={pickerIcons.search} size={18} color={palette.muted} />
                <TextInput
                  accessibilityLabel={`Search ${activeStop}`}
                  autoCapitalize="words"
                  enterKeyHint="search"
                  maxLength={160}
                  onChangeText={setQuery}
                  onSubmitEditing={search}
                  placeholder={`Search ${activeStop === 'origin' ? 'starting place' : 'destination'}`}
                  placeholderTextColor={palette.mutedDark}
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={query}
                />
              </View>
              <Pressable accessibilityLabel="Search place" accessibilityRole="button" disabled={Boolean(busyLabel)} onPress={search} style={styles.searchButton}>
                <AppIcon name={pickerIcons.search} size={18} color={palette.white} />
              </Pressable>
            </View>

            <Pressable accessibilityRole="button" disabled={Boolean(busyLabel)} onPress={useCurrentLocation} style={styles.currentLocationButton}>
              <AppIcon name={pickerIcons.current} size={16} color="#AFC5FF" />
              <Text style={styles.currentLocationText}>Use current location for {activeStop === 'origin' ? 'start' : 'destination'}</Text>
            </Pressable>

            {searchResults.length > 0 && (
              <View style={styles.resultsCard}>
                <Text style={styles.resultsTitle}>Choose a search result</Text>
                {searchResults.map((result, index) => (
                  <Pressable
                    accessibilityRole="button"
                    key={`${result.latitude}-${result.longitude}`}
                    onPress={() => savePoint(result)}
                    style={[styles.resultRow, index === searchResults.length - 1 && styles.resultRowLast]}
                  >
                    <View style={styles.resultIcon}><AppIcon name={pickerIcons.pin} size={15} color="#AFC5FF" /></View>
                    <View style={styles.flexOne}>
                      <Text numberOfLines={2} style={styles.resultLabel}>{result.label}</Text>
                      <Text style={styles.resultCoordinates}>{result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.mapCard}>
              <RouteMap
                origin={origin}
                destination={destination}
                focusedPoint={focusedPoint}
                routeCoordinates={routeGeometry?.coordinates ?? []}
                onSelect={selectFromMap}
              />
              <View style={styles.mapModeBadge}><View style={[styles.stopDot, { backgroundColor: activeStop === 'origin' ? palette.green : palette.red }]} /><Text style={styles.mapModeText}>Tap map to set {activeStop === 'origin' ? 'start' : 'destination'}</Text></View>
              {(busyLabel || routeBusy) && (
                <View accessibilityLiveRegion="polite" style={styles.busyOverlay}>
                  <ActivityIndicator color={palette.white} />
                  <Text style={styles.busyText}>{busyLabel ?? 'Finding road route'}</Text>
                </View>
              )}
            </View>
            <Text style={styles.mapHint}>{roadRouteReady ? 'The blue line follows the calculated road route and will appear on the active commute screen.' : 'Choose both places to calculate the road-following route.'}</Text>
            {routeError && <Text accessibilityLiveRegion="assertive" style={styles.routeError}>{routeError}</Text>}

            <View style={styles.formCard}>
              <View style={styles.formHeading}>
                <AppIcon name={pickerIcons.clock} size={18} color="#78A0FF" />
                <View>
                  <Text style={styles.stepLabel}>2 · ADD THE ROUTINE</Text>
                  <Text style={styles.formTitle}>When do you usually travel?</Text>
                </View>
              </View>
              <Text style={styles.fieldLabel}>ROUTE NAME</Text>
              <TextInput accessibilityLabel="Route name" value={title} onChangeText={(value) => { setTitle(value); setTitleCustomized(true); }} placeholder="Office to Home" placeholderTextColor={palette.mutedDark} style={styles.input} autoCapitalize="words" maxLength={100} />

              <Text style={styles.fieldLabel}>USUAL SCHEDULE</Text>
              <View style={styles.presetWrap}>
                {schedulePresets.map((preset) => (
                  <Pressable accessibilityRole="button" key={preset} onPress={() => setSchedule(preset)} style={[styles.presetChip, schedule === preset && styles.presetChipSelected]}>
                    <Text style={[styles.presetText, schedule === preset && styles.presetTextSelected]}>{preset}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput accessibilityLabel="Expected schedule" value={schedule} onChangeText={setSchedule} placeholder="Or enter a custom schedule" placeholderTextColor={palette.mutedDark} style={styles.input} maxLength={100} />

              <Text style={styles.fieldLabel}>USUAL DURATION</Text>
              <View style={styles.durationRow}>
                {durationPresets.map((minutes) => (
                  <Pressable accessibilityRole="button" key={minutes} onPress={() => setDuration(`${minutes}`)} style={[styles.durationChip, duration === `${minutes}` && styles.presetChipSelected]}>
                    <Text style={[styles.presetText, duration === `${minutes}` && styles.presetTextSelected]}>{minutes} min</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput accessibilityLabel="Expected duration in minutes" value={duration} onChangeText={setDuration} placeholder="Custom minutes" placeholderTextColor={palette.mutedDark} style={styles.input} keyboardType="number-pad" maxLength={3} />
            </View>

            {routeReady && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryIcon}><AppIcon name={pickerIcons.route} size={18} color={palette.green} /></View>
                <View style={styles.flexOne}>
                  <Text style={styles.summaryTitle}>{title.trim() || 'New planned route'}</Text>
                  <Text numberOfLines={2} style={styles.summaryCopy}>{shortLabel(origin?.label ?? '')} → {shortLabel(destination?.label ?? '')}</Text>
                  <Text style={styles.summaryMeta}>{schedule || 'Schedule needed'} · {duration ? `${duration} min` : 'Duration needed'}{routeGeometry?.distanceMeters ? ` · ${(routeGeometry.distanceMeters / 1_000).toFixed(1)} km` : ''}</Text>
                </View>
              </View>
            )}

            <Pressable accessibilityRole="button" disabled={!routeReady || Boolean(busyLabel) || routeBusy} onPress={() => { void submit(); }} style={[styles.saveButton, (!routeReady || busyLabel || routeBusy) && styles.saveButtonDisabled]}>
              <AppIcon name={pickerIcons.save} size={17} color={palette.white} />
              <Text style={styles.saveButtonText}>Save Route & Use for Commutes</Text>
            </Pressable>
            <Text style={styles.privacyCopy}>Searches use the device location service. Start and destination coordinates are sent over HTTPS to the configured routing provider to calculate the road path; saved route data stays on this device.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function StopButton({
  label,
  point,
  active,
  color,
  onPress,
}: {
  label: string;
  point: RoutePoint | null;
  active: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.stopButton, active && styles.stopButtonActive]}>
      <View style={[styles.stopDot, { backgroundColor: color }]} />
      <View style={styles.stopCopy}>
        <Text style={[styles.stopLabel, active && styles.stopLabelActive]}>{label}</Text>
        <Text numberOfLines={1} style={styles.stopValue}>{point?.label ?? 'Choose location'}</Text>
      </View>
    </Pressable>
  );
}

async function ensureForegroundPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.granted;
}

async function resolveLabel(
  coordinate: Pick<RoutePoint, 'latitude' | 'longitude'>,
  fallback: string,
): Promise<string> {
  try {
    const addresses = await Location.reverseGeocodeAsync(coordinate);
    const address = addresses[0];
    if (!address) return fallback;
    const label = address.formattedAddress
      ?? [address.name, address.street, address.district ?? address.city, address.region]
        .filter((part, index, values): part is string => Boolean(part) && values.indexOf(part) === index)
        .join(', ');
    return label.trim().slice(0, 180) || fallback;
  } catch {
    return fallback;
  }
}

function coordinateLabel(coordinate: Pick<RoutePoint, 'latitude' | 'longitude'>): string {
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function shortLabel(label: string): string {
  return label.split(',')[0]?.trim().slice(0, 42) || 'Selected place';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.phone },
  flex: { flex: 1 },
  flexOne: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 38 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 22 },
  iconButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.card, borderColor: palette.line, borderWidth: 1 },
  headerCopy: { flex: 1 },
  title: { color: palette.text, fontSize: 23, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { color: palette.muted, fontSize: 11, marginTop: 3 },
  placesCard: { position: 'relative', borderRadius: radius.large, backgroundColor: palette.card, borderColor: palette.line, borderWidth: 1, padding: 14, marginBottom: 12 },
  stepLabel: { color: '#8CA9F5', fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginBottom: 11 },
  stopButton: { width: '100%', minHeight: 64, borderRadius: radius.medium, backgroundColor: '#111114', borderColor: palette.line, borderWidth: 1, paddingLeft: 12, paddingRight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopButtonActive: { borderColor: '#5E83E9', backgroundColor: palette.blueSoft },
  stopConnector: { width: 2, height: 12, marginLeft: 18, backgroundColor: palette.lineStrong },
  stopDot: { width: 10, height: 10, borderRadius: 5 },
  stopCopy: { flex: 1, minWidth: 0 },
  stopLabel: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  stopLabelActive: { color: '#AFC5FF' },
  stopValue: { color: palette.text, fontSize: 11, marginTop: 5 },
  swapButton: { position: 'absolute', right: 26, top: 101, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#292A30', borderColor: palette.lineStrong, borderWidth: 1 },
  searchRow: { flexDirection: 'row', gap: 9, marginBottom: 12 },
  searchInputWrap: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, borderRadius: 13, borderColor: palette.line, borderWidth: 1, backgroundColor: '#111114' },
  searchInput: { flex: 1, color: palette.text, fontSize: 13, paddingVertical: 12 },
  searchButton: { width: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue },
  currentLocationButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, borderColor: 'rgba(94,131,233,0.35)', borderWidth: 1, backgroundColor: palette.blueSoft, marginBottom: 12 },
  currentLocationText: { color: '#B8CAFA', fontSize: 11, fontWeight: '600' },
  resultsCard: { borderRadius: radius.medium, borderColor: palette.line, borderWidth: 1, backgroundColor: palette.card, paddingHorizontal: 13, marginBottom: 12 },
  resultsTitle: { color: palette.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, paddingTop: 12, paddingBottom: 5 },
  resultRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomColor: palette.line, borderBottomWidth: StyleSheet.hairlineWidth },
  resultRowLast: { borderBottomWidth: 0 },
  resultIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blueSoft },
  resultLabel: { color: palette.text, fontSize: 11, lineHeight: 15 },
  resultCoordinates: { color: palette.mutedDark, fontSize: 9, marginTop: 3 },
  mapCard: { height: 260, overflow: 'hidden', borderRadius: radius.large, borderColor: palette.lineStrong, borderWidth: 1, backgroundColor: '#111114' },
  mapModeBadge: { position: 'absolute', left: 11, top: 11, minHeight: 36, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 11, backgroundColor: 'rgba(18,18,21,0.94)', borderColor: palette.lineStrong, borderWidth: 1 },
  mapModeText: { color: palette.text, fontSize: 10, fontWeight: '600' },
  busyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(11,11,14,0.72)' },
  busyText: { color: palette.text, fontSize: 11, fontWeight: '600' },
  mapHint: { color: palette.mutedDark, fontSize: 10, lineHeight: 15, marginTop: 9, paddingHorizontal: 3 },
  routeError: { color: '#FF9AA3', fontSize: 10, lineHeight: 15, marginTop: 8, paddingHorizontal: 3 },
  formCard: { marginTop: 20, padding: 16, borderRadius: radius.large, borderColor: palette.line, borderWidth: 1, backgroundColor: palette.card },
  formHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 3 },
  formTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  fieldLabel: { color: palette.mutedDark, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginTop: 18 },
  input: { minHeight: 47, borderRadius: 11, borderColor: palette.line, borderWidth: 1, backgroundColor: '#111114', color: palette.text, fontSize: 13, paddingHorizontal: 13, marginTop: 8 },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  presetChip: { minHeight: 34, borderRadius: 17, borderColor: palette.lineStrong, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, backgroundColor: '#161619' },
  presetChipSelected: { borderColor: '#5E83E9', backgroundColor: palette.blueSoft },
  presetText: { color: palette.muted, fontSize: 10, fontWeight: '600' },
  presetTextSelected: { color: '#C7D6FF' },
  durationRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  durationChip: { minHeight: 36, flex: 1, borderRadius: 12, borderColor: palette.lineStrong, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#161619' },
  summaryCard: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.medium, borderColor: 'rgba(69,201,148,0.28)', borderWidth: 1, backgroundColor: palette.greenSoft, padding: 14, marginTop: 14 },
  summaryIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(69,201,148,0.14)' },
  summaryTitle: { color: palette.text, fontSize: 13, fontWeight: '700' },
  summaryCopy: { color: '#B9C8C1', fontSize: 10, lineHeight: 14, marginTop: 4 },
  summaryMeta: { color: palette.green, fontSize: 9, fontWeight: '600', marginTop: 5 },
  saveButton: { minHeight: 52, borderRadius: 14, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 17 },
  saveButtonDisabled: { opacity: 0.42 },
  saveButtonText: { color: palette.white, fontSize: 13, fontWeight: '700' },
  privacyCopy: { color: palette.mutedDark, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 12, paddingHorizontal: 16 },
});
