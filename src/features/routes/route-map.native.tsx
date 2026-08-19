import { useEffect, useRef } from 'react';
import MapView, { Marker, Polyline, type MapPressEvent, type Region } from 'react-native-maps';

import { palette } from '@/constants/commute-theme';
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

  useEffect(() => {
    if (focusedPoint) mapRef.current?.animateToRegion(regionFor(focusedPoint), 320);
  }, [focusedPoint]);

  const handlePress = (event: MapPressEvent) => {
    onSelect(event.nativeEvent.coordinate);
  };

  return (
    <MapView
      accessibilityLabel="Select route location on map"
      customMapStyle={darkMapStyle}
      initialRegion={regionFor(focusedPoint)}
      onPress={handlePress}
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
