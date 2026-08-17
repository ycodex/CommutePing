import * as Location from 'expo-location';
import type { SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
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
import type { RoutePoint, SavedRoute } from '@/domain/commute';
import { RouteMap } from './route-map';

type RouteStop = 'origin' | 'destination';
type IconName = SymbolViewProps['name'];

const pickerIcons: Record<'back' | 'search' | 'current' | 'route' | 'save', IconName> = {
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  current: { ios: 'location.fill', android: 'my_location', web: 'my_location' },
  route: { ios: 'point.topleft.down.to.point.bottomright.curvepath', android: 'route', web: 'route' },
  save: { ios: 'checkmark', android: 'check', web: 'check' },
};

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
  const [schedule, setSchedule] = useState('');
  const [duration, setDuration] = useState('');
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const focusedPoint = activeStop === 'origin' ? origin : destination;
  const routeReady = Boolean(origin && destination);

  const resetForm = () => {
    setActiveStop('origin');
    setOrigin(null);
    setDestination(null);
    setQuery('');
    setTitle('');
    setSchedule('');
    setDuration('');
    setBusyLabel(null);
  };

  const close = () => {
    resetForm();
    onClose();
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
    if (!title && nextOrigin && nextDestination) {
      setTitle(`${shortLabel(nextOrigin.label)} to ${shortLabel(nextDestination.label)}`);
    }
    setQuery('');
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
      const result = results[0];
      if (!result) {
        Alert.alert('Place not found', 'Try adding the city, state, or a nearby landmark.');
        return;
      }
      const label = await resolveLabel(result, cleanQuery);
      savePoint({ label, latitude: result.latitude, longitude: result.longitude });
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

  const submit = () => {
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
    onSubmit({
      id: `${Date.now()}`,
      title: cleanTitle,
      schedule: cleanSchedule,
      durationMinutes,
      learned: false,
      origin,
      destination,
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
                <Text accessibilityRole="header" style={styles.title}>Plan a route</Text>
                <Text style={styles.subtitle}>Search or tap the map to choose each point</Text>
              </View>
            </View>

            <View style={styles.stopSelector}>
              <StopButton label="Start" point={origin} active={activeStop === 'origin'} color={palette.green} onPress={() => setActiveStop('origin')} />
              <View style={styles.stopConnector} />
              <StopButton label="Destination" point={destination} active={activeStop === 'destination'} color={palette.red} onPress={() => setActiveStop('destination')} />
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
                  placeholder={`Search ${activeStop === 'origin' ? 'start' : 'destination'}`}
                  placeholderTextColor={palette.mutedDark}
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={query}
                />
              </View>
              <Pressable accessibilityLabel="Search place" accessibilityRole="button" disabled={Boolean(busyLabel)} onPress={search} style={styles.searchButton}>
                <Text style={styles.searchButtonText}>Search</Text>
              </Pressable>
            </View>

            <View style={styles.mapCard}>
              <RouteMap origin={origin} destination={destination} focusedPoint={focusedPoint} onSelect={selectFromMap} />
              <Pressable accessibilityRole="button" disabled={Boolean(busyLabel)} onPress={useCurrentLocation} style={styles.currentButton}>
                <AppIcon name={pickerIcons.current} size={16} color={palette.text} />
                <Text style={styles.currentButtonText}>Use my location</Text>
              </Pressable>
              {busyLabel && (
                <View accessibilityLiveRegion="polite" style={styles.busyOverlay}>
                  <ActivityIndicator color={palette.white} />
                  <Text style={styles.busyText}>{busyLabel}</Text>
                </View>
              )}
            </View>
            <Text style={styles.mapHint}>Selecting a point updates the highlighted {activeStop}. The blue line is a preview, not turn-by-turn directions.</Text>

            <View style={styles.formCard}>
              <View style={styles.formHeading}>
                <AppIcon name={pickerIcons.route} size={18} color="#78A0FF" />
                <Text style={styles.formTitle}>Route details</Text>
              </View>
              <TextInput accessibilityLabel="Route name" value={title} onChangeText={setTitle} placeholder="Work to Home" placeholderTextColor={palette.mutedDark} style={styles.input} autoCapitalize="words" maxLength={100} />
              <TextInput accessibilityLabel="Expected schedule" value={schedule} onChangeText={setSchedule} placeholder="Weekdays · 8:30 PM" placeholderTextColor={palette.mutedDark} style={styles.input} maxLength={100} />
              <TextInput accessibilityLabel="Expected duration in minutes" value={duration} onChangeText={setDuration} placeholder="45 minutes" placeholderTextColor={palette.mutedDark} style={styles.input} keyboardType="number-pad" maxLength={3} />
            </View>

            <Pressable accessibilityRole="button" disabled={!routeReady || Boolean(busyLabel)} onPress={submit} style={[styles.saveButton, (!routeReady || busyLabel) && styles.saveButtonDisabled]}>
              <AppIcon name={pickerIcons.save} size={17} color={palette.white} />
              <Text style={styles.saveButtonText}>Save Planned Route</Text>
            </Pressable>
            <Text style={styles.privacyCopy}>Searches are handled by the device location service. Saved route points remain on this device in the current build.</Text>
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
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 22 },
  iconButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.card, borderColor: palette.line, borderWidth: 1 },
  headerCopy: { flex: 1 },
  title: { color: palette.text, fontSize: 23, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { color: palette.muted, fontSize: 11, marginTop: 3 },
  stopSelector: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  stopButton: { flex: 1, minWidth: 0, minHeight: 64, borderRadius: radius.medium, backgroundColor: palette.card, borderColor: palette.line, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  stopButtonActive: { borderColor: '#5E83E9', backgroundColor: palette.blueSoft },
  stopConnector: { width: 14, height: 1, backgroundColor: palette.lineStrong },
  stopDot: { width: 10, height: 10, borderRadius: 5 },
  stopCopy: { flex: 1, minWidth: 0 },
  stopLabel: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  stopLabelActive: { color: '#AFC5FF' },
  stopValue: { color: palette.text, fontSize: 11, marginTop: 5 },
  searchRow: { flexDirection: 'row', gap: 9, marginBottom: 12 },
  searchInputWrap: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, borderRadius: 13, borderColor: palette.line, borderWidth: 1, backgroundColor: '#111114' },
  searchInput: { flex: 1, color: palette.text, fontSize: 13, paddingVertical: 12 },
  searchButton: { minWidth: 72, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue },
  searchButtonText: { color: palette.white, fontSize: 12, fontWeight: '700' },
  mapCard: { height: 300, overflow: 'hidden', borderRadius: radius.large, borderColor: palette.lineStrong, borderWidth: 1, backgroundColor: '#111114' },
  currentButton: { position: 'absolute', right: 11, top: 11, minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 11, backgroundColor: 'rgba(18,18,21,0.94)', borderColor: palette.lineStrong, borderWidth: 1 },
  currentButtonText: { color: palette.text, fontSize: 10, fontWeight: '600' },
  busyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(11,11,14,0.72)' },
  busyText: { color: palette.text, fontSize: 11, fontWeight: '600' },
  mapHint: { color: palette.mutedDark, fontSize: 10, lineHeight: 15, marginTop: 9, paddingHorizontal: 3 },
  formCard: { marginTop: 20, padding: 16, borderRadius: radius.medium, borderColor: palette.line, borderWidth: 1, backgroundColor: palette.card },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  formTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  input: { minHeight: 47, borderRadius: 11, borderColor: palette.line, borderWidth: 1, backgroundColor: '#111114', color: palette.text, fontSize: 13, paddingHorizontal: 13, marginTop: 11 },
  saveButton: { minHeight: 52, borderRadius: 14, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 17 },
  saveButtonDisabled: { opacity: 0.42 },
  saveButtonText: { color: palette.white, fontSize: 13, fontWeight: '700' },
  privacyCopy: { color: palette.mutedDark, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 12, paddingHorizontal: 16 },
});
