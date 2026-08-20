import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  type PressEvent,
  type PressEventWithFeatures,
  ViewAnnotation,
} from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type NativeSyntheticEvent, StyleSheet, View } from 'react-native';

import { palette } from '@/constants/commute-theme';
import { getMapStyleUrl } from '@/device/open-map-config';
import type { RouteCoordinate, RoutePoint } from '@/domain/commute';
import type { RouteMapProps } from './route-map';

const bengaluruCenter: [number, number] = [77.5946, 12.9716];

export function RouteMap({ origin, destination, focusedPoint, routeCoordinates, onSelect }: RouteMapProps) {
  const cameraRef = useRef<CameraRef>(null);
  const visibleCoordinates = useMemo(
    () => routeCoordinates.length >= 2
      ? routeCoordinates
      : [origin, destination].filter((point): point is RoutePoint => Boolean(point)),
    [destination, origin, routeCoordinates],
  );
  const routeData = useMemo(() => lineFeature(visibleCoordinates), [visibleCoordinates]);

  const fitMap = useCallback(() => {
    if (visibleCoordinates.length >= 2) {
      cameraRef.current?.fitBounds(boundsFor(visibleCoordinates), {
        padding: { top: 54, right: 44, bottom: 54, left: 44 },
        duration: 360,
        easing: 'ease',
      });
      return;
    }
    const point = focusedPoint ?? visibleCoordinates[0];
    if (point) {
      cameraRef.current?.easeTo({
        center: [point.longitude, point.latitude],
        zoom: 14,
        duration: 300,
        easing: 'ease',
      });
    }
  }, [focusedPoint, visibleCoordinates]);

  useEffect(() => {
    fitMap();
  }, [fitMap]);

  const handlePress = (event: NativeSyntheticEvent<PressEvent> | NativeSyntheticEvent<PressEventWithFeatures>) => {
    const [longitude, latitude] = event.nativeEvent.lngLat;
    onSelect({ latitude, longitude });
  };

  return (
    <Map
      accessibilityLabel="Select route location on OpenStreetMap"
      attribution
      mapStyle={getMapStyleUrl()}
      onDidFinishLoadingMap={fitMap}
      onPress={handlePress}
      style={styles.map}
    >
      <Camera ref={cameraRef} initialViewState={{ center: bengaluruCenter, zoom: 11 }} />
      {routeData && (
        <GeoJSONSource data={routeData} id="route-picker-line-source">
          <Layer
            id="route-picker-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': palette.blue, 'line-opacity': 0.92, 'line-width': 5 }}
          />
        </GeoJSONSource>
      )}
      {origin && <MapPin id="route-origin" point={origin} color={palette.green} />}
      {destination && <MapPin id="route-destination" point={destination} color={palette.red} />}
    </Map>
  );
}

function MapPin({ id, point, color }: { id: string; point: RoutePoint; color: string }) {
  return (
    <ViewAnnotation id={id} lngLat={[point.longitude, point.latitude]} title={point.label}>
      <View style={[styles.pin, { backgroundColor: color }]} />
    </ViewAnnotation>
  );
}

function lineFeature(coordinates: RouteCoordinate[]) {
  if (coordinates.length < 2) return null;
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: coordinates.map((coordinate) => [coordinate.longitude, coordinate.latitude]),
    },
  };
}

function boundsFor(coordinates: RouteCoordinate[]): [number, number, number, number] {
  return coordinates.reduce<[number, number, number, number]>(
    (bounds, coordinate) => [
      Math.min(bounds[0], coordinate.longitude),
      Math.min(bounds[1], coordinate.latitude),
      Math.max(bounds[2], coordinate.longitude),
      Math.max(bounds[3], coordinate.latitude),
    ],
    [coordinates[0].longitude, coordinates[0].latitude, coordinates[0].longitude, coordinates[0].latitude],
  );
}

const styles = StyleSheet.create({
  map: { height: 260, width: '100%' },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderColor: '#F4F6FA',
    borderWidth: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 4,
  },
});
