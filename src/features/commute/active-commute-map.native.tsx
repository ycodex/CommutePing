import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
} from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { palette } from '@/constants/commute-theme';
import { getMapStyleUrl } from '@/device/open-map-config';
import type { RouteCoordinate } from '@/domain/commute';
import type { ActiveCommuteMapProps } from './active-commute-map';

const bengaluruCenter: [number, number] = [77.5946, 12.9716];

export function ActiveCommuteMap({ coordinates, currentLocation }: ActiveCommuteMapProps) {
  const cameraRef = useRef<CameraRef>(null);
  const visibleCoordinates = useMemo(
    () => currentLocation ? [...coordinates, currentLocation] : coordinates,
    [coordinates, currentLocation],
  );
  const routeData = useMemo(() => lineFeature(coordinates), [coordinates]);
  const fitMap = useCallback(() => {
    if (visibleCoordinates.length >= 2) {
      cameraRef.current?.fitBounds(boundsFor(visibleCoordinates), {
        padding: { top: 62, right: 44, bottom: 72, left: 44 },
        duration: 360,
        easing: 'ease',
      });
      return;
    }
    const point = currentLocation ?? visibleCoordinates[0];
    if (point) cameraRef.current?.easeTo({ center: [point.longitude, point.latitude], zoom: 14, duration: 280, easing: 'ease' });
  }, [currentLocation, visibleCoordinates]);

  useEffect(() => {
    fitMap();
  }, [fitMap]);

  const origin = coordinates[0];
  const destination = coordinates.at(-1);
  return (
    <Map
      accessibilityLabel="Active commute route on OpenStreetMap"
      attribution
      mapStyle={getMapStyleUrl()}
      onDidFinishLoadingMap={fitMap}
      style={styles.map}
    >
      <Camera ref={cameraRef} initialViewState={{ center: bengaluruCenter, zoom: 11 }} />
      {routeData && (
        <GeoJSONSource data={routeData} id="active-route-line-source">
          <Layer
            id="active-route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': palette.blue, 'line-opacity': 0.95, 'line-width': 6 }}
          />
        </GeoJSONSource>
      )}
      {origin && <MapDot id="active-origin" point={origin} color={palette.green} size={17} />}
      {destination && <MapDot id="active-destination" point={destination} color={palette.red} size={17} />}
      {currentLocation && <MapDot id="active-current-location" point={currentLocation} color={palette.blue} size={21} pulse />}
    </Map>
  );
}

function MapDot({ id, point, color, size, pulse = false }: { id: string; point: RouteCoordinate; color: string; size: number; pulse?: boolean }) {
  return (
    <ViewAnnotation id={id} lngLat={[point.longitude, point.latitude]}>
      <View style={[styles.dotOuter, pulse && styles.dotPulse, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: color }]}>
        <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />
      </View>
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
  map: { height: '100%', width: '100%' },
  dotOuter: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'rgba(15,15,18,0.78)' },
  dotPulse: { borderWidth: 3, backgroundColor: 'rgba(57,115,246,0.16)' },
  dot: { borderColor: '#F4F6FA', borderWidth: 2 },
});
