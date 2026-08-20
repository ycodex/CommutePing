import 'react-native-url-polyfill/auto';

import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';

import { authStorage } from './auth-storage';
import { getConnectedCommutesConfig } from './connected-config';

let connectedClient: SupabaseClient | null | undefined;

export function getConnectedClient(): SupabaseClient | null {
  if (connectedClient !== undefined) return connectedClient;
  const config = getConnectedCommutesConfig();
  if (!config) {
    connectedClient = null;
    return null;
  }
  connectedClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
    realtime: {
      params: { eventsPerSecond: 8 },
    },
  });
  return connectedClient;
}
