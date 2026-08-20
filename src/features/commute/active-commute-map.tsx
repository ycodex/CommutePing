import { StyleSheet, View } from 'react-native';

import { palette } from '@/constants/commute-theme';
import type { RouteCoordinate } from '@/domain/commute';

export type ActiveCommuteMapProps = {
  coordinates: RouteCoordinate[];
  currentLocation: RouteCoordinate | null;
};

export function ActiveCommuteMap({ coordinates, currentLocation }: ActiveCommuteMapProps) {
  return (
    <View accessibilityLabel="Saved route preview" style={styles.canvas}>
      {Array.from({ length: 18 }).map((_, index) => (
        <View
          key={index}
          style={[styles.mapDot, { left: `${5 + (index % 6) * 18}%`, top: `${12 + Math.floor(index / 6) * 31}%` }]}
        />
      ))}
      {coordinates.length >= 2 && (
        <>
          <View style={[styles.routeLine, styles.routeLineOne]} />
          <View style={[styles.routeLine, styles.routeLineTwo]} />
          <View style={[styles.routeLine, styles.routeLineThree]} />
          <View style={styles.originPin} />
          <View style={styles.destinationPin} />
        </>
      )}
      {currentLocation && <View style={styles.locationPulse}><View style={styles.locationDot} /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: '#1C1D21', overflow: 'hidden' },
  mapDot: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#343945' },
  routeLine: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: palette.blue, transformOrigin: 'left' },
  routeLineOne: { width: '34%', left: '15%', top: '70%', transform: [{ rotate: '-28deg' }] },
  routeLineTwo: { width: '27%', left: '45%', top: '54%', transform: [{ rotate: '-68deg' }] },
  routeLineThree: { width: '29%', left: '54%', top: '29%', transform: [{ rotate: '12deg' }] },
  originPin: { position: 'absolute', left: '13%', top: '67%', width: 14, height: 14, borderRadius: 7, backgroundColor: palette.green, borderWidth: 2, borderColor: '#D9FFF0' },
  destinationPin: { position: 'absolute', right: '14%', top: '31%', width: 14, height: 14, borderRadius: 7, backgroundColor: palette.red, borderWidth: 2, borderColor: '#FFD9DD' },
  locationPulse: { position: 'absolute', left: '47%', top: '47%', width: 27, height: 27, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(57,115,246,0.35)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(57,115,246,0.08)' },
  locationDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: palette.blue, borderWidth: 2, borderColor: '#141A2B' },
});
