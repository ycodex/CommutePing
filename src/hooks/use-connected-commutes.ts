import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getConnectedClient } from '@/backend/supabase-client';
import type { SavedRoute } from '@/domain/commute';
import {
  normalizeInviteCode,
  normalizePhoneForInvite,
  parseCreatedInvite,
  parseMonitoredCommutes,
  parseTrustedConnections,
  routeSharePayload,
  type ConnectedProfile,
  type ConnectedStatus,
  type ConnectedTrustedConnection,
  type CreatedTrustedInvite,
  type MonitoredCommute,
} from '@/domain/connected-commutes';
import { registerConnectedNotifications, subscribeToConnectedNotifications } from '@/device/connected-notifications';
import { setActiveBackgroundCommute, stopBackgroundCommuteTracking } from '@/device/background-commute-location';
import type { CommuteLocation } from './use-commute-location';

type HeartbeatInput = {
  location: CommuteLocation;
  batteryPercent: number | null;
  movementStatus: MonitoredCommute['movementStatus'];
  routeStatus: MonitoredCommute['routeStatus'];
};

type ConnectedSnapshot = {
  profile: ConnectedProfile;
  connections: ConnectedTrustedConnection[];
  monitoredCommutes: MonitoredCommute[];
  activeOwnedCommuteId: string | null;
};

export function useConnectedCommutes() {
  const client = useMemo(() => getConnectedClient(), []);
  const [status, setStatus] = useState<ConnectedStatus>(client ? 'loading' : 'unconfigured');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ConnectedProfile | null>(null);
  const [connections, setConnections] = useState<ConnectedTrustedConnection[]>([]);
  const [monitoredCommutes, setMonitoredCommutes] = useState<MonitoredCommute[]>([]);
  const [activeOwnedCommuteId, setActiveOwnedCommuteId] = useState<string | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const [notificationRegistration, setNotificationRegistration] = useState<'unknown' | 'enabled' | 'denied' | 'unavailable'>('unknown');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHeartbeatObservationRef = useRef<number | null>(null);

  const applySnapshot = useCallback((snapshot: ConnectedSnapshot | null) => {
    if (!snapshot) {
      setProfile(null);
      setConnections([]);
      setMonitoredCommutes([]);
      setActiveOwnedCommuteId(null);
      return;
    }
    setProfile(snapshot.profile);
    setConnections(snapshot.connections);
    setMonitoredCommutes(snapshot.monitoredCommutes);
    setActiveOwnedCommuteId(snapshot.activeOwnedCommuteId);
  }, []);

  const refresh = useCallback(async () => {
    if (!client || !session) return;
    const snapshot = await loadSnapshot(client, session.user);
    if (!snapshot) {
      setStatus('error');
      return;
    }
    applySnapshot(snapshot);
    setStatus('ready');
  }, [applySnapshot, client, session]);
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refresh();
    }, 300);
  }, [refresh]);

  useEffect(() => {
    if (!client) return;
    let mounted = true;
    void client.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setStatus(data.session ? 'loading' : 'signed-out');
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (!nextSession) {
        applySnapshot(null);
        setStatus('signed-out');
      } else {
        setStatus('loading');
      }
    });
    const appStateListener = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        client.auth.startAutoRefresh();
        void refreshRef.current();
      } else {
        client.auth.stopAutoRefresh();
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      appStateListener.remove();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [applySnapshot, client]);

  useEffect(() => {
    if (!client || !session) return;
    let active = true;
    const hydrate = async () => {
      const snapshot = await loadSnapshot(client, session.user);
      if (!active) return;
      if (!snapshot) {
        setStatus('error');
        return;
      }
      applySnapshot(snapshot);
      setStatus('ready');
    };
    void hydrate();
    return () => { active = false; };
  }, [applySnapshot, client, session]);

  useEffect(() => {
    if (!client || !session) return;
    const commuteIds = Array.from(new Set([
      ...(activeOwnedCommuteId ? [activeOwnedCommuteId] : []),
      ...monitoredCommutes.filter((commute) => commute.status === 'active').map((commute) => commute.id),
    ])).slice(0, 12);
    if (commuteIds.length === 0) return;
    void client.realtime.setAuth(session.access_token);
    const channels = commuteIds.map((commuteId) => (
      client.channel(`commute:${commuteId}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, scheduleRefresh)
        .subscribe()
    ));
    return () => {
      channels.forEach((channel) => { void client.removeChannel(channel); });
    };
  }, [activeOwnedCommuteId, client, monitoredCommutes, scheduleRefresh, session]);

  useEffect(() => {
    if (!session) return;
    return subscribeToConnectedNotifications(scheduleRefresh);
  }, [scheduleRefresh, session]);

  useEffect(() => {
    const consumeUrl = (url: string | null) => {
      const code = inviteCodeFromUrl(url);
      if (code) setPendingInviteCode(code);
    };
    void Linking.getInitialURL().then(consumeUrl);
    const listener = Linking.addEventListener('url', ({ url }) => consumeUrl(url));
    return () => listener.remove();
  }, []);

  const sendOtp = useCallback(async (phoneInput: string, displayName: string) => {
    if (!client) throw new ConnectedActionError('Connected commutes are not configured.');
    const phone = normalizePhoneForInvite(phoneInput);
    const cleanName = displayName.trim();
    if (!phone || cleanName.length < 2 || cleanName.length > 80) {
      throw new ConnectedActionError('Enter your name and a valid mobile number.');
    }
    const { error } = await client.auth.signInWithOtp({
      phone,
      options: { data: { display_name: cleanName }, shouldCreateUser: true },
    });
    if (error) throw new ConnectedActionError('The verification code could not be sent. Try again shortly.');
    return phone;
  }, [client]);

  const verifyOtp = useCallback(async (phoneInput: string, codeInput: string) => {
    if (!client) throw new ConnectedActionError('Connected commutes are not configured.');
    const phone = normalizePhoneForInvite(phoneInput);
    const token = codeInput.replace(/\D/g, '');
    if (!phone || !/^\d{6}$/.test(token)) throw new ConnectedActionError('Enter the six-digit verification code.');
    const { error } = await client.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) throw new ConnectedActionError('The verification code is invalid or expired.');
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return;
    if (activeOwnedCommuteId) throw new ConnectedActionError('End the active shared commute before signing out.');
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new ConnectedActionError('Could not sign out on this device.');
  }, [activeOwnedCommuteId, client]);

  const updateDisplayName = useCallback(async (displayName: string) => {
    if (!client || !session) throw new ConnectedActionError('Sign in first.');
    const cleanName = displayName.trim();
    if (cleanName.length < 2 || cleanName.length > 80) throw new ConnectedActionError('Enter a name between 2 and 80 characters.');
    const { error } = await client.from('profiles').update({ display_name: cleanName }).eq('id', session.user.id);
    if (error) throw new ConnectedActionError('Could not update the profile.');
    await refresh();
  }, [client, refresh, session]);

  const createInvite = useCallback(async (phoneInput: string, contactName: string, relation: string): Promise<CreatedTrustedInvite> => {
    if (!client || !session) throw new ConnectedActionError('Sign in before inviting a trusted contact.');
    const phone = normalizePhoneForInvite(phoneInput);
    const cleanName = contactName.trim();
    const cleanRelation = relation.trim() || 'Trusted contact';
    if (!phone || cleanName.length < 1 || cleanName.length > 80 || cleanRelation.length > 80) {
      throw new ConnectedActionError('Enter valid trusted-contact details.');
    }
    const { data, error } = await client.rpc('create_trusted_invite', {
      p_phone_e164: phone,
      p_contact_name: cleanName,
      p_relation: cleanRelation,
    });
    const invite = parseCreatedInvite(data);
    if (error || !invite) throw new ConnectedActionError('The invitation could not be created. Check limits and try again.');
    await refresh();
    return invite;
  }, [client, refresh, session]);

  const acceptInvite = useCallback(async (codeInput: string) => {
    if (!client || !session) throw new ConnectedActionError('Sign in with the invited mobile number first.');
    const code = normalizeInviteCode(codeInput);
    if (!code) throw new ConnectedActionError('The invitation code is invalid or expired.');
    const { error } = await client.rpc('accept_trusted_invite', { p_invite_code: code });
    if (error) throw new ConnectedActionError('The invitation is invalid, expired, or intended for a different verified number.');
    setPendingInviteCode(null);
    await refresh();
  }, [client, refresh, session]);

  const revokeConnection = useCallback(async (connectionId: string) => {
    if (!client || !session || !isUuid(connectionId)) throw new ConnectedActionError('Trusted connection was not found.');
    const { error } = await client.rpc('revoke_trusted_connection', { p_connection_id: connectionId });
    if (error) throw new ConnectedActionError('The trusted connection could not be revoked.');
    await refresh();
  }, [client, refresh, session]);

  const enableNotifications = useCallback(async () => {
    if (!client || !session) throw new ConnectedActionError('Sign in before enabling notifications.');
    const registration = await registerConnectedNotifications();
    if (!registration.ok) {
      setNotificationRegistration(registration.reason === 'denied' ? 'denied' : 'unavailable');
      throw new ConnectedActionError(registration.reason === 'denied'
        ? 'Notification permission was not granted.'
        : 'Push notifications require an installed app on a physical device.');
    }
    const { error } = await client.rpc('register_push_token', {
      p_token: registration.token,
      p_platform: registration.platform,
    });
    if (error) throw new ConnectedActionError('The notification device could not be registered.');
    setNotificationRegistration('enabled');
  }, [client, session]);

  const startSharedCommute = useCallback(async (route: SavedRoute, expectedArrivalAt: number): Promise<string | null> => {
    if (!client) return null;
    if (!session) throw new ConnectedActionError('Sign in before starting a shared commute.');
    const routePayload = routeSharePayload(route);
    const acceptedIds = connections.filter((connection) => connection.status === 'accepted').map((connection) => connection.id);
    if (!routePayload) throw new ConnectedActionError('A validated road route is required for sharing.');
    if (acceptedIds.length === 0) throw new ConnectedActionError('At least one trusted contact must accept an invitation first.');
    const { data, error } = await client.rpc('start_shared_commute', {
      p_route_local_id: route.id,
      p_route_title: route.title,
      p_origin: routePayload.origin,
      p_destination: routePayload.destination,
      p_route_coordinates: routePayload.coordinates,
      p_expected_arrival_at: new Date(expectedArrivalAt).toISOString(),
      p_connection_ids: acceptedIds,
    });
    if (error || !isUuid(data)) throw new ConnectedActionError('The shared commute could not start. No trusted-contact notification was claimed.');
    try {
      await setActiveBackgroundCommute(data);
    } catch {
      await client.rpc('cancel_shared_commute', { p_commute_id: data });
      void dispatchNotifications(client, data);
      throw new ConnectedActionError('Background sharing could not be secured. The remote commute was cancelled.');
    }
    setActiveOwnedCommuteId(data);
    lastHeartbeatObservationRef.current = null;
    void dispatchNotifications(client, data);
    await refresh();
    return data;
  }, [client, connections, refresh, session]);

  const publishHeartbeat = useCallback(async (input: HeartbeatInput): Promise<void> => {
    if (!client || !session || !activeOwnedCommuteId) return;
    if (lastHeartbeatObservationRef.current === input.location.updatedAt) return;
    const sequence = Math.max(1, Math.round(input.location.updatedAt));
    const { error } = await client.rpc('update_commute_heartbeat', {
      p_commute_id: activeOwnedCommuteId,
      p_latitude: input.location.latitude,
      p_longitude: input.location.longitude,
      p_accuracy_meters: input.location.accuracy,
      p_battery_percent: input.batteryPercent === null ? null : Math.round(input.batteryPercent),
      p_movement_status: input.movementStatus,
      p_route_status: input.routeStatus,
      p_sequence_number: sequence,
      p_observed_at: new Date(input.location.updatedAt).toISOString(),
    });
    if (error) return;
    lastHeartbeatObservationRef.current = input.location.updatedAt;
    if (input.routeStatus === 'deviated') void dispatchNotifications(client, activeOwnedCommuteId);
  }, [activeOwnedCommuteId, client, session]);

  const completeSharedCommute = useCallback(async (): Promise<void> => {
    if (!client || !activeOwnedCommuteId) return;
    const commuteId = activeOwnedCommuteId;
    const { error } = await client.rpc('complete_shared_commute', { p_commute_id: commuteId });
    if (error) throw new ConnectedActionError('Trusted contacts could not be notified that the commute ended. Keep tracking and retry.');
    setActiveOwnedCommuteId(null);
    await stopBackgroundCommuteTracking();
    void dispatchNotifications(client, commuteId);
    await refresh();
  }, [activeOwnedCommuteId, client, refresh]);

  const acknowledgeCommute = useCallback(async (commuteId: string) => {
    if (!client || !session || !isUuid(commuteId)) throw new ConnectedActionError('Commute was not found.');
    const { error } = await client.rpc('acknowledge_commute', { p_commute_id: commuteId });
    if (error) throw new ConnectedActionError('The monitoring acknowledgement could not be saved.');
    void dispatchNotifications(client, commuteId);
    await refresh();
  }, [client, refresh, session]);

  return {
    configured: Boolean(client),
    status,
    profile,
    connections,
    acceptedConnections: connections.filter((connection) => connection.status === 'accepted'),
    monitoredCommutes,
    activeOwnedCommuteId,
    pendingInviteCode,
    notificationRegistration,
    refresh,
    sendOtp,
    verifyOtp,
    signOut,
    updateDisplayName,
    createInvite,
    acceptInvite,
    revokeConnection,
    enableNotifications,
    startSharedCommute,
    publishHeartbeat,
    completeSharedCommute,
    acknowledgeCommute,
  };
}

async function loadSnapshot(client: SupabaseClient, user: User): Promise<ConnectedSnapshot | null> {
  const [profileResult, connectionResult, monitoringResult, activeResult] = await Promise.all([
    client.from('profiles').select('id,display_name').eq('id', user.id).maybeSingle(),
    client.rpc('list_trusted_connections'),
    client.rpc('list_monitored_commutes'),
    client.rpc('get_owned_active_commute'),
  ]);
  if (profileResult.error || !profileResult.data || connectionResult.error || monitoringResult.error || activeResult.error) return null;
  const displayName = profileResult.data.display_name;
  if (typeof displayName !== 'string' || displayName.length < 1 || displayName.length > 80) return null;
  return {
    profile: { id: user.id, displayName, phone: user.phone ?? '' },
    connections: parseTrustedConnections(connectionResult.data),
    monitoredCommutes: parseMonitoredCommutes(monitoringResult.data),
    activeOwnedCommuteId: isUuid(activeResult.data) ? activeResult.data : null,
  };
}

async function dispatchNotifications(client: SupabaseClient, commuteId: string): Promise<void> {
  await client.functions.invoke('dispatch-notifications', { body: { commuteId } });
}

function inviteCodeFromUrl(url: string | null): string | null {
  if (!url || url.length > 500) return null;
  try {
    const parsed = Linking.parse(url);
    const pathParts = parsed.path?.split('/').filter(Boolean) ?? [];
    if (pathParts[0] !== 'invite') return null;
    return normalizeInviteCode(pathParts[1] ?? '');
  } catch {
    return null;
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class ConnectedActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectedActionError';
  }
}
