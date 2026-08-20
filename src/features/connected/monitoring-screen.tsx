import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette, radius } from '@/constants/commute-theme';
import type { MonitoredCommute } from '@/domain/connected-commutes';
import { ConnectedActionError } from '@/hooks/use-connected-commutes';
import { ActiveCommuteMap } from '@/features/commute/active-commute-map';
import type { ConnectedCommutesController } from './connected-circle-panel';

export function CommuteModeSwitch({ mode, onChange }: { mode: 'traveller' | 'monitoring'; onChange: (mode: 'traveller' | 'monitoring') => void }) {
  return (
    <View style={styles.modeSwitch}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'traveller' }} onPress={() => onChange('traveller')} style={[styles.modeButton, mode === 'traveller' && styles.modeButtonSelected]}><Text style={[styles.modeText, mode === 'traveller' && styles.modeTextSelected]}>My Commute</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'monitoring' }} onPress={() => onChange('monitoring')} style={[styles.modeButton, mode === 'monitoring' && styles.modeButtonSelected]}><Text style={[styles.modeText, mode === 'monitoring' && styles.modeTextSelected]}>People I Monitor</Text></Pressable>
    </View>
  );
}

export function MonitoringScreen({ connected, onShowTraveller, onOpenCircle }: { connected: ConnectedCommutesController; onShowTraveller: () => void; onOpenCircle: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeFirst = useMemo(
    () => [...connected.monitoredCommutes].sort((left, right) => Number(right.status === 'active') - Number(left.status === 'active') || right.startedAt - left.startedAt),
    [connected.monitoredCommutes],
  );
  const selected = activeFirst.find((commute) => commute.id === selectedId) ?? activeFirst[0] ?? null;

  const acknowledge = async (commute: MonitoredCommute) => {
    if (busy) return;
    setBusy(true);
    try {
      await connected.acknowledgeCommute(commute.id);
    } catch (error) {
      Alert.alert('Could not acknowledge', error instanceof ConnectedActionError ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView testID="monitoring-screen" style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heading}><Text accessibilityRole="header" style={styles.headingTitle}>Commute Ping</Text><Text style={styles.headingCopy}>Traveller and trusted-contact views</Text></View>
      <CommuteModeSwitch mode="monitoring" onChange={(mode) => { if (mode === 'traveller') onShowTraveller(); }} />

      {!connected.configured ? (
        <MessageCard title="Connected monitoring is not configured" copy="Add the Supabase public configuration and install a fresh build. Local traveller features are still available." action="View My Commute" onAction={onShowTraveller} />
      ) : connected.status === 'loading' ? (
        <View style={[styles.card, styles.loading]}><ActivityIndicator color={palette.blue} /><Text style={styles.cardCopy}>Loading monitored commutes…</Text></View>
      ) : !connected.profile ? (
        <MessageCard title="Sign in to monitor someone" copy="Use the mobile number that received the trusted-contact invitation, then accept it from the Circle section." action="Open Circle" onAction={onOpenCircle} />
      ) : activeFirst.length === 0 ? (
        <MessageCard title="Nobody is travelling right now" copy="Accepted commute invitations and the last 24 hours of completed commutes will appear here." action="Refresh" onAction={() => { void connected.refresh(); }} />
      ) : (
        <>
          <ScrollView horizontal contentContainerStyle={styles.commuteList} showsHorizontalScrollIndicator={false}>
            {activeFirst.map((commute) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: commute.id === selected?.id }} key={commute.id} onPress={() => setSelectedId(commute.id)} style={[styles.commuteChoice, commute.id === selected?.id && styles.commuteChoiceSelected]}>
                <View style={styles.choiceHeading}><View style={[styles.statusDot, { backgroundColor: commute.status === 'active' ? palette.green : palette.muted }]} /><Text numberOfLines={1} style={styles.choiceName}>{commute.travellerName}</Text></View>
                <Text numberOfLines={1} style={styles.choiceRoute}>{commute.routeTitle}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {selected && <MonitoringDetail commute={selected} busy={busy} onAcknowledge={() => { void acknowledge(selected); }} />}
        </>
      )}
      <Text style={styles.disclaimer}>Monitoring is assistive coordination, not guaranteed rescue. Location is visible only to authenticated trusted contacts accepted before the commute started.</Text>
    </ScrollView>
  );
}

function MonitoringDetail({ commute, busy, onAcknowledge }: { commute: MonitoredCommute; busy: boolean; onAcknowledge: () => void }) {
  const active = commute.status === 'active';
  const routeColor = commute.routeStatus === 'deviated' ? palette.red : commute.routeStatus === 'checking' ? palette.amber : palette.green;
  return (
    <>
      <View style={styles.mapCard}>
        <ActiveCommuteMap coordinates={commute.routeCoordinates} currentLocation={commute.currentLocation} />
        <View style={styles.mapBadge}><View style={[styles.statusDot, { backgroundColor: active ? routeColor : palette.muted }]} /><Text numberOfLines={2} style={styles.mapBadgeText}>{active ? routeStatusCopy(commute.routeStatus) : 'Commute completed'}</Text></View>
      </View>
      <View style={styles.card}>
        <View style={styles.detailHeading}><View style={styles.flexOne}><Text style={styles.detailName}>{commute.travellerName}</Text><Text style={styles.cardCopy}>{commute.routeTitle}</Text></View><View style={[styles.statePill, active && styles.statePillActive]}><Text style={[styles.statePillText, active && styles.statePillTextActive]}>{commute.status.toUpperCase()}</Text></View></View>
        <View style={styles.metricGrid}>
          <Metric label="EXPECTED" value={formatTime(commute.expectedArrivalAt)} />
          <Metric label="LAST UPDATE" value={commute.currentLocation ? freshness(commute.currentLocation.updatedAt) : 'Waiting'} />
          <Metric label="BATTERY" value={commute.batteryPercent === null ? 'Unknown' : `${commute.batteryPercent}%`} />
          <Metric label="MOVEMENT" value={capitalize(commute.movementStatus)} />
        </View>
        {active && !commute.acknowledgedAt && (
          <Pressable accessibilityRole="button" disabled={busy} onPress={onAcknowledge} style={styles.acknowledgeButton}>{busy ? <ActivityIndicator color="#07140F" /> : <Text style={styles.acknowledgeText}>I&apos;M MONITORING</Text>}</Pressable>
        )}
        {commute.acknowledgedAt && <Text style={styles.acknowledgedCopy}>Monitoring acknowledged at {formatTime(commute.acknowledgedAt)}</Text>}
      </View>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} style={styles.metricValue}>{value}</Text></View>;
}

function MessageCard({ title, copy, action, onAction }: { title: string; copy: string; action: string; onAction: () => void }) {
  return <View style={styles.card}><Text style={styles.detailName}>{title}</Text><Text style={styles.cardCopy}>{copy}</Text><Pressable accessibilityRole="button" onPress={onAction} style={styles.messageButton}><Text style={styles.messageButtonText}>{action}</Text></Pressable></View>;
}

function routeStatusCopy(status: MonitoredCommute['routeStatus']): string {
  if (status === 'deviated') return 'Confirmed route deviation';
  if (status === 'checking') return 'Checking possible deviation';
  if (status === 'unavailable') return 'Route status unavailable';
  return 'On planned route';
}

function freshness(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 42, paddingBottom: 36 },
  heading: { marginBottom: 18 },
  headingTitle: { color: palette.text, fontSize: 27, fontWeight: '700', letterSpacing: -1.1 },
  headingCopy: { color: palette.muted, fontSize: 13, marginTop: 5 },
  modeSwitch: { minHeight: 46, flexDirection: 'row', borderRadius: 14, borderColor: palette.line, borderWidth: 1, backgroundColor: '#111114', padding: 4, marginBottom: 18 },
  modeButton: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modeButtonSelected: { backgroundColor: palette.blueSoft, borderColor: '#5E83E9', borderWidth: 1 },
  modeText: { color: palette.muted, fontSize: 10, fontWeight: '700' },
  modeTextSelected: { color: '#D7E2FF' },
  card: { borderRadius: radius.large, borderColor: palette.line, borderWidth: 1, backgroundColor: palette.card, padding: 16, marginTop: 14 },
  loading: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 10 },
  cardCopy: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  messageButton: { minHeight: 43, borderRadius: 12, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  messageButtonText: { color: palette.white, fontSize: 11, fontWeight: '800' },
  commuteList: { gap: 9, paddingRight: 10 },
  commuteChoice: { width: 166, borderRadius: 14, borderColor: palette.line, borderWidth: 1, backgroundColor: palette.card, padding: 12 },
  commuteChoiceSelected: { borderColor: '#5E83E9', backgroundColor: palette.blueSoft },
  choiceHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  choiceName: { flex: 1, color: palette.text, fontSize: 11, fontWeight: '700' },
  choiceRoute: { color: palette.muted, fontSize: 9, marginTop: 8 },
  mapCard: { height: 270, borderRadius: radius.large, borderColor: palette.lineStrong, borderWidth: 1, overflow: 'hidden', marginTop: 14, backgroundColor: '#111114' },
  mapBadge: { position: 'absolute', left: 12, bottom: 12, maxWidth: '82%', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 11, borderColor: palette.lineStrong, borderWidth: 1, backgroundColor: 'rgba(18,18,21,0.94)', paddingHorizontal: 10 },
  mapBadgeText: { flexShrink: 1, color: palette.text, fontSize: 10, fontWeight: '700' },
  detailHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flexOne: { flex: 1 },
  detailName: { color: palette.text, fontSize: 15, fontWeight: '700' },
  statePill: { minHeight: 25, borderRadius: 13, backgroundColor: '#292A30', justifyContent: 'center', paddingHorizontal: 9 },
  statePillActive: { backgroundColor: palette.greenSoft },
  statePillText: { color: palette.muted, fontSize: 8, fontWeight: '800' },
  statePillTextActive: { color: palette.green },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 },
  metric: { width: '48%', minHeight: 58, borderRadius: 12, backgroundColor: '#141417', borderColor: palette.line, borderWidth: 1, padding: 10 },
  metricLabel: { color: palette.mutedDark, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  metricValue: { color: palette.text, fontSize: 12, fontWeight: '700', marginTop: 7 },
  acknowledgeButton: { minHeight: 46, borderRadius: 13, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  acknowledgeText: { color: '#07140F', fontSize: 11, fontWeight: '900' },
  acknowledgedCopy: { color: palette.green, fontSize: 10, textAlign: 'center', marginTop: 15 },
  disclaimer: { color: palette.mutedDark, fontSize: 9, lineHeight: 14, textAlign: 'center', paddingHorizontal: 14, marginTop: 20 },
});
