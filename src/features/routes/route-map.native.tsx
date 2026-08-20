import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapPressEvent, type Region } from 'react-native-maps';

import { palette } from '@/constants/commute-theme';
import { isGoogleMapsConfigured } from '@/device/maps-config';
import type { RoutePoint } from '@/domain/commute';
import type { RouteMapProps } from './route-map';

const bengaluruRegion: Region = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d20' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a4a4ad' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d20' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#34343a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#29292e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#101b29' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#24262a' }] },
];

function regionFor(point: RoutePoint | null): Region {
  if (!point) return bengaluruRegion;
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: 0.035,
    longitudeDelta: 0.035,
  };
}

export function RouteMap({ origin, destination, focusedPoint, onSelect }: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const googleMapsConfigured = isGoogleMapsConfigured();
  const googleMapsReady = Platform.OS !== 'android' || googleMapsConfigured;

  useEffect(() => {
    if (focusedPoint) mapRef.current?.animateToRegion(regionFor(focusedPoint), 320);
  }, [focusedPoint]);

  const handlePress = (event: MapPressEvent) => {
    onSelect(event.nativeEvent.coordinate);
  };

  if (!googleMapsReady) {
    return (
      <View accessibilityLabel="Google Maps setup required" style={styles.unavailableMap}>
        <Text style={styles.unavailableTitle}>Google Maps setup required</Text>
        <Text style={styles.unavailableCopy}>Search and current-location selection still work. Add a restricted Maps SDK for Android key and create a new APK to enable map taps.</Text>
      </View>
    );
  }

  return (
    <MapView
      accessibilityLabel="Select route location on map"
      customMapStyle={darkMapStyle}
      initialRegion={regionFor(focusedPoint)}
      onPress={handlePress}
      provider={googleMapsConfigured ? PROVIDER_GOOGLE : undefined}
      ref={mapRef}
      style={{ height: 260, width: '100%' }}
      userInterfaceStyle="dark"
    >
      {origin && (
        <Marker
          coordinate={{ latitude: origin.latitude, longitude: origin.longitude }}
          description={origin.label}
          pinColor={palette.green}
          title="Start"
        />
      )}
      {destination && (
        <Marker
          coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
          description={destination.label}
          pinColor={palette.red}
          title="Destination"
        />
      )}
      {origin && destination && (
        <Polyline
          coordinates={[
            { latitude: origin.latitude, longitude: origin.longitude },
            { latitude: destination.latitude, longitude: destination.longitude },
          ]}
          lineCap="round"
          strokeColor={palette.blue}
          strokeWidth={4}
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  unavailableMap: { height: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111114', paddingHorizontal: 30 },
  unavailableTitle: { color: palette.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  unavailableCopy: { color: palette.muted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 8 },
});
