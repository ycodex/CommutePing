import type { ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext) => {
  const googleMapsAndroidApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const googleMapsIosApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY?.trim();

  return {
    ...config,
    ios: {
      ...config.ios,
      ...(googleMapsIosApiKey
        ? {
            config: {
              ...config.ios?.config,
              googleMapsApiKey: googleMapsIosApiKey,
            },
          }
        : {}),
    },
    android: {
      ...config.android,
      ...(googleMapsAndroidApiKey
        ? {
            config: {
              ...config.android?.config,
              googleMaps: { apiKey: googleMapsAndroidApiKey },
            },
          }
        : {}),
    },
    extra: {
      ...config.extra,
      googleMapsAndroidConfigured: Boolean(googleMapsAndroidApiKey),
      googleMapsIosConfigured: Boolean(googleMapsIosApiKey),
    },
  };
};
