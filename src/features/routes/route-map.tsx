import { Text, View } from 'react-native';

import type { RouteCoordinate, RoutePoint } from '@/domain/commute';

export type RouteMapProps = {
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  focusedPoint: RoutePoint | null;
  routeCoordinates: RouteCoordinate[];
  onSelect: (coordinate: Pick<RoutePoint, 'latitude' | 'longitude'>) => void;
};

export function RouteMap(_props: RouteMapProps) {
  return (
    <View style={{ height: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111114' }}>
      <Text style={{ color: '#9999A2', textAlign: 'center', paddingHorizontal: 28 }}>
        Interactive route selection is available in the Android and iOS app.
      </Text>
    </View>
  );
}
