import type { ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext) => {
  const mapStyleUrl = httpsUrlOrDefault(
    process.env.EXPO_PUBLIC_MAP_STYLE_URL,
    'https://tiles.openfreemap.org/styles/liberty',
  );
  const routingBaseUrl = httpsUrlOrDefault(
    process.env.EXPO_PUBLIC_ROUTING_BASE_URL,
    'https://router.project-osrm.org',
  );
  const supabaseUrl = optionalHttpsUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const supabasePublishableKey = optionalPublishableKey(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const plugins = config.plugins ?? [];
  const requiredPlugins = [
    '@maplibre/maplibre-react-native',
    'expo-secure-store',
    'expo-notifications',
  ];
  const mergedPlugins = requiredPlugins.reduce(
    (current, pluginName) => hasPlugin(current, pluginName) ? current : [...current, pluginName],
    plugins,
  );

  return {
    ...config,
    plugins: mergedPlugins,
    extra: {
      ...config.extra,
      mapStyleUrl,
      routingBaseUrl,
      connectedCommutes: supabaseUrl && supabasePublishableKey
        ? { supabaseUrl, supabasePublishableKey }
        : null,
    },
  };
};

function hasPlugin(plugins: NonNullable<ConfigContext['config']['plugins']>, pluginName: string): boolean {
  return plugins.some((plugin) => (
    plugin === pluginName || (Array.isArray(plugin) && plugin[0] === pluginName)
  ));
}

function httpsUrlOrDefault(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString().replace(/\/$/, '') : fallback;
  } catch {
    return fallback;
  }
}

function optionalHttpsUrl(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 300) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function optionalPublishableKey(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 300) return null;
  return candidate.startsWith('sb_publishable_') ? candidate : null;
}
