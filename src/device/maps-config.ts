import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function isGoogleMapsConfigured(): boolean {
  if (Platform.OS === 'android') return Constants.expoConfig?.extra?.googleMapsAndroidConfigured === true;
  if (Platform.OS === 'ios') return Constants.expoConfig?.extra?.googleMapsIosConfigured === true;
  return false;
}
