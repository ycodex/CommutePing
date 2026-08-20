import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { palette } from '@/constants/commute-theme';
import { isGoogleMapsConfigured } from '@/device/maps-config';
import type { RouteCoordinate } from '@/domain/commute';
import type { ActiveCommuteMapProps } from './active-commute-map';

const fallbackRegion: Region = {
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

function regionFor(point: RouteCoordinate | undefined): Region {
  if (!point) return fallbackRegion;
  return { ...point, latitudeDelta: 0.04, longitudeDelta: 0.04 };
}

export function ActiveCommuteMap({ coordinates, currentLocation }: ActiveCommuteMapProps) {
  const mapRef = useRef<MapView>(null);
  const googleMapsConfigured = isGoogleMapsConfigured();
  const googleMapsReady = Platform.OS !== 'android' || googleMapsConfigured;
  const visibleCoordinates = useMemo(
    () => currentLocation ? [...coordinates, currentLocation] : coordinates,
    [coordinates, currentLocation],
  );
  const fitMap = useCallback(() => {
    if (visibleCoordinates.length < 2) return;
    mapRef.current?.fitToCoordinates(visibleCoordinates, {
      animated: true,
      edgePadding: { top: 54, right: 42, bottom: 62, left: 42 },
    });
  }, [visibleCoordinates]);

  useEffect(() => {
    fitMap();
  }, [fitMap]);

  const origin = coordinates[0];
  const destination = coordinates.at(-1);
  if (!googleMapsReady) {
    return (
      <View accessibilityLabel="Google Maps setup required" style={styles.unavailableMap}>
        <Text style={styles.unavailableTitle}>Google Maps is not configured in this APK</Text>
        <Text style={styles.unavailableCopy}>Install a build created with the restricted Android Maps key.</Text>
      </View>
    );
  }

  return (
    <MapView
      accessibilityLabel="Active commute route map"
      customMapStyle={darkMapStyle}
      initialRegion={regionFor(origin)}
      onMapReady={fitMap}
      provider={googleMapsConfigured ? PROVIDER_GOOGLE : undefined}
      ref={mapRef}
      style={{ height: '100%', width: '100%' }}
      userInterfaceStyle="dark"
    >
      {coordinates.length >= 2 && <Polyline coordinates={coordinates} lineCap="round" strokeColor={palette.blue} strokeWidth={5} />}
      {origin && <Marker coordinate={origin} pinColor={palette.green} title="Start" />}
      {destination && <Marker coordinate={destination} pinColor={palette.red} title="Destination" />}
      {currentLocation && <Marker coordinate={currentLocation} pinColor={palette.blue} title="Current location" />}
    </MapView>
  );
}

const styles = StyleSheet.create({
  unavailableMap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111114', paddingHorizontal: 28 },
  unavailableTitle: { color: palette.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  unavailableCopy: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 7 },
});
