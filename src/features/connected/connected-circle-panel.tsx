import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/commute-theme';
import type { CreatedTrustedInvite } from '@/domain/connected-commutes';
import { ConnectedActionError, useConnectedCommutes } from '@/hooks/use-connected-commutes';

export type ConnectedCommutesController = ReturnType<typeof useConnectedCommutes>;

export function ConnectedCirclePanel({ connected, localCommuteActive }: { connected: ConnectedCommutesController; localCommuteActive: boolean }) {
  const [authVisible, setAuthVisible] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [acceptCode, setAcceptCode] = useState(connected.pendingInviteCode ?? '');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert('Connected commutes', safeMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (!connected.configured) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>CONNECTED CIRCLE</Text>
        <Text style={styles.title}>Backend setup required</Text>
        <Text style={styles.copy}>Local safety features remain available. Add the Supabase project URL and publishable key to enable verified invitations, shared commutes, and monitoring across phones.</Text>
      </View>
    );
  }

  if (connected.status === 'loading') {
    return <View style={[styles.card, styles.loadingCard]}><ActivityIndicator color={palette.blue} /><Text style={styles.copy}>Loading connected circle…</Text></View>;
  }

  if (!connected.profile) {
    return (
      <>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>CONNECTED CIRCLE</Text>
          <Text style={styles.title}>Connect both phones securely</Text>
          <Text style={styles.copy}>Verify your mobile number before sending or accepting a trusted-contact invitation. Adding a phonebook contact alone never shares location.</Text>
          {connected.pendingInviteCode && <Text style={styles.pendingCopy}>An invitation is waiting. Sign in with the mobile number that received it.</Text>}
          <Pressable accessibilityRole="button" onPress={() => setAuthVisible(true)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Sign In with Mobile OTP</Text></Pressable>
        </View>
        <PhoneAuthModal connected={connected} visible={authVisible} onClose={() => setAuthVisible(false)} />
      </>
    );
  }

  const acceptedCount = connected.acceptedConnections.length;
  return (
    <>
      <View style={styles.card}>
        <View style={styles.headingRow}>
          <View style={styles.flexOne}>
            <Text style={styles.eyebrow}>CONNECTED AS</Text>
            <Text style={styles.title}>{connected.profile.displayName}</Text>
            <Text style={styles.copy}>{connected.profile.phone || 'Verified account'} · {acceptedCount} accepted trusted {acceptedCount === 1 ? 'contact' : 'contacts'}</Text>
          </View>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>CONNECTED</Text></View>
        </View>

        <View style={styles.actionRow}>
          <Pressable accessibilityRole="button" onPress={() => setInviteVisible(true)} style={styles.primaryAction}><Text style={styles.primaryButtonText}>Invite Contact</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(connected.enableNotifications); }} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{connected.notificationRegistration === 'enabled' ? 'Alerts Enabled' : 'Enable Alerts'}</Text></Pressable>
        </View>

        {connected.activeOwnedCommuteId && (
          <View style={styles.activeCommuteCard}>
            <View style={styles.flexOne}><Text style={styles.itemTitle}>A shared commute is active</Text><Text style={styles.itemCopy}>{localCommuteActive ? 'Return to My Commute and use Stop Commute when you arrive.' : 'The app found a commute from an earlier session. End it here if you have arrived safely.'}</Text></View>
            {!localCommuteActive && <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(connected.completeSharedCommute); }} style={styles.endCommuteButton}><Text style={styles.endCommuteText}>Mark Reached & End</Text></Pressable>}
          </View>
        )}

        {(connected.pendingInviteCode || acceptCode) && (
          <View style={styles.acceptCard}>
            <Text style={styles.itemTitle}>Accept an invitation</Text>
            <Text style={styles.itemCopy}>Only the exact verified mobile number chosen by the traveller can accept.</Text>
            <TextInput accessibilityLabel="Trusted invitation code" autoCapitalize="none" maxLength={48} onChangeText={setAcceptCode} placeholder="48-character invitation code" placeholderTextColor={palette.mutedDark} style={styles.input} value={acceptCode || connected.pendingInviteCode || ''} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(async () => { await connected.acceptInvite(acceptCode || connected.pendingInviteCode || ''); setAcceptCode(''); }); }} style={styles.acceptButton}><Text style={styles.acceptButtonText}>Accept & Monitor</Text></Pressable>
          </View>
        )}

        <View style={styles.listHeader}><Text style={styles.eyebrow}>MY TRUSTED CONTACTS</Text><Text style={styles.count}>{connected.connections.length}</Text></View>
        {connected.connections.length === 0 ? (
          <Text style={styles.emptyCopy}>No secure invitations yet. Create one and share it directly with someone you trust.</Text>
        ) : connected.connections.map((connection) => (
          <View key={connection.id} style={styles.connectionRow}>
            <View style={[styles.avatar, connection.status === 'accepted' && styles.avatarAccepted]}><Text style={styles.avatarText}>{connection.contactName.slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.flexOne}>
              <Text style={styles.itemTitle}>{connection.acceptedUserName || connection.contactName}</Text>
              <Text style={styles.itemCopy}>{connection.relation} · {connection.status === 'accepted' ? 'Accepted' : 'Invitation pending'}</Text>
            </View>
            <Pressable accessibilityLabel={`Revoke ${connection.contactName}`} accessibilityRole="button" disabled={busy} onPress={() => Alert.alert('Revoke trusted connection?', 'This person will lose access to future and active commute updates.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Revoke', style: 'destructive', onPress: () => { void run(() => connected.revokeConnection(connection.id)); } }])} style={styles.revokeButton}><Text style={styles.revokeText}>Revoke</Text></Pressable>
          </View>
        ))}

        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(connected.signOut); }} style={styles.signOutButton}><Text style={styles.signOutText}>Sign Out on This Device</Text></Pressable>
      </View>
      <PhoneAuthModal connected={connected} visible={authVisible} onClose={() => setAuthVisible(false)} />
      <CreateInviteModal connected={connected} visible={inviteVisible} onClose={() => setInviteVisible(false)} />
    </>
  );
}

function PhoneAuthModal({ connected, visible, onClose }: { connected: ConnectedCommutesController; visible: boolean; onClose: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sentPhone, setSentPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const normalized = await connected.sendOtp(phone, displayName);
      setSentPhone(normalized);
    } catch (error) {
      Alert.alert('Could not send code', safeMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!sentPhone || busy) return;
    setBusy(true);
    try {
      await connected.verifyOtp(sentPhone, otp);
      setOtp('');
      onClose();
    } catch (error) {
      Alert.alert('Could not verify', safeMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Connect CommutePing</Text><Text style={styles.copy}>Mobile OTP verifies who can share and monitor commutes</Text></View><Pressable onPress={onClose} style={styles.modalClose}><Text style={styles.secondaryActionText}>Close</Text></Pressable></View>
        <View style={styles.modalBody}>
          {!sentPhone ? (
            <>
              <Text style={styles.fieldLabel}>YOUR NAME</Text>
              <TextInput accessibilityLabel="Your display name" autoCapitalize="words" maxLength={80} onChangeText={setDisplayName} placeholder="Ananya" placeholderTextColor={palette.mutedDark} style={styles.input} value={displayName} />
              <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
              <TextInput accessibilityLabel="Your mobile number" keyboardType="phone-pad" maxLength={20} onChangeText={setPhone} placeholder="+91 98765 43210" placeholderTextColor={palette.mutedDark} style={styles.input} value={phone} />
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void send(); }} style={styles.primaryButton}>{busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryButtonText}>Send Verification Code</Text>}</Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Enter the six-digit code</Text>
              <Text style={styles.copy}>Sent to {sentPhone}. Codes are rate-limited by the authentication provider.</Text>
              <TextInput accessibilityLabel="Six digit verification code" keyboardType="number-pad" maxLength={6} onChangeText={setOtp} placeholder="000000" placeholderTextColor={palette.mutedDark} style={[styles.input, styles.otpInput]} value={otp} />
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void verify(); }} style={styles.primaryButton}>{busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryButtonText}>Verify & Continue</Text>}</Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setSentPhone(null); setOtp(''); }} style={styles.signOutButton}><Text style={styles.signOutText}>Change Number</Text></Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function CreateInviteModal({ connected, visible, onClose }: { connected: ConnectedCommutesController; visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [phone, setPhone] = useState('');
  const [invite, setInvite] = useState<CreatedTrustedInvite | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setInvite(await connected.createInvite(phone, name, relation));
    } catch (error) {
      Alert.alert('Could not create invitation', safeMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (!invite) return;
    const link = `commuteping://invite/${invite.code}`;
    await Share.share({ message: `I invited you to be my trusted contact on CommutePing. Install/open the app and accept with the mobile number I selected.\n\n${link}\n\nCode: ${invite.code}` });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Invite trusted contact</Text><Text style={styles.copy}>One verified person · invitation expires in 24 hours</Text></View><Pressable onPress={onClose} style={styles.modalClose}><Text style={styles.secondaryActionText}>Close</Text></Pressable></View>
        <View style={styles.modalBody}>
          {invite ? (
            <View style={styles.acceptCard}>
              <Text style={styles.title}>Secure invitation ready</Text>
              <Text style={styles.copy}>Share this only with {name}. They must sign in using the exact number you entered.</Text>
              <Text selectable style={styles.inviteCode}>{invite.code}</Text>
              <Pressable accessibilityRole="button" onPress={() => { void share(); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Share Invitation</Text></Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>CONTACT NAME</Text>
              <TextInput accessibilityLabel="Trusted contact name" autoCapitalize="words" maxLength={80} onChangeText={setName} placeholder="Mom" placeholderTextColor={palette.mutedDark} style={styles.input} value={name} />
              <Text style={styles.fieldLabel}>RELATIONSHIP</Text>
              <TextInput accessibilityLabel="Trusted contact relationship" autoCapitalize="words" maxLength={80} onChangeText={setRelation} placeholder="Parent" placeholderTextColor={palette.mutedDark} style={styles.input} value={relation} />
              <Text style={styles.fieldLabel}>THEIR MOBILE NUMBER</Text>
              <TextInput accessibilityLabel="Trusted contact mobile number" keyboardType="phone-pad" maxLength={20} onChangeText={setPhone} placeholder="+91 98765 43210" placeholderTextColor={palette.mutedDark} style={styles.input} value={phone} />
              <Text style={styles.privacyCopy}>CommutePing stores a one-way hash of the invited number for verification. The complete address book is never uploaded.</Text>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void create(); }} style={styles.primaryButton}>{busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryButtonText}>Create Secure Invitation</Text>}</Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function safeMessage(error: unknown): string {
  return error instanceof ConnectedActionError ? error.message : 'The connected action could not be completed. Try again.';
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.large, borderColor: palette.line, borderWidth: 1, backgroundColor: palette.card, padding: 17, marginTop: 16 },
  loadingCard: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 10 },
  eyebrow: { color: '#8CA9F5', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 7 },
  copy: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  pendingCopy: { color: palette.amber, fontSize: 10, lineHeight: 15, marginTop: 10 },
  primaryButton: { minHeight: 48, borderRadius: 13, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 16 },
  primaryButtonText: { color: palette.white, fontSize: 11, fontWeight: '800' },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flexOne: { flex: 1 },
  livePill: { minHeight: 26, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, backgroundColor: palette.greenSoft },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green },
  liveText: { color: palette.green, fontSize: 8, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  activeCommuteCard: { gap: 10, borderRadius: 14, borderColor: 'rgba(255,183,77,0.3)', borderWidth: 1, backgroundColor: palette.amberSoft, padding: 13, marginTop: 12 },
  endCommuteButton: { minHeight: 39, borderRadius: 11, backgroundColor: palette.amber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  endCommuteText: { color: '#1A1204', fontSize: 10, fontWeight: '800' },
  primaryAction: { flex: 1, minHeight: 43, borderRadius: 12, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  secondaryAction: { flex: 1, minHeight: 43, borderRadius: 12, borderColor: palette.lineStrong, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryActionText: { color: palette.text, fontSize: 10, fontWeight: '700' },
  acceptCard: { borderRadius: 14, borderColor: 'rgba(69,201,148,0.3)', borderWidth: 1, backgroundColor: palette.greenSoft, padding: 13, marginTop: 16 },
  itemTitle: { color: palette.text, fontSize: 11, fontWeight: '700' },
  itemCopy: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  input: { minHeight: 48, borderRadius: 12, borderColor: palette.lineStrong, borderWidth: 1, backgroundColor: '#111114', color: palette.text, fontSize: 13, paddingHorizontal: 13, marginTop: 9 },
  acceptButton: { minHeight: 40, borderRadius: 11, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  acceptButtonText: { color: '#07140F', fontSize: 10, fontWeight: '800' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 4 },
  count: { color: palette.muted, fontSize: 10, fontWeight: '700' },
  emptyCopy: { color: palette.mutedDark, fontSize: 10, lineHeight: 15, paddingVertical: 13 },
  connectionRow: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.amberSoft, alignItems: 'center', justifyContent: 'center' },
  avatarAccepted: { backgroundColor: palette.greenSoft },
  avatarText: { color: palette.text, fontSize: 11, fontWeight: '800' },
  revokeButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 5 },
  revokeText: { color: '#FF8D98', fontSize: 9, fontWeight: '700' },
  signOutButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  signOutText: { color: palette.muted, fontSize: 10, fontWeight: '600' },
  modalSafe: { flex: 1, backgroundColor: palette.phone },
  modalHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 20, borderBottomColor: palette.line, borderBottomWidth: 1 },
  modalTitle: { color: palette.text, fontSize: 20, fontWeight: '700' },
  modalClose: { minHeight: 38, borderRadius: 10, borderColor: palette.lineStrong, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 13 },
  modalBody: { padding: 22 },
  fieldLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, marginTop: 18 },
  otpInput: { textAlign: 'center', fontSize: 22, letterSpacing: 8 },
  privacyCopy: { color: palette.mutedDark, fontSize: 9, lineHeight: 14, marginTop: 12 },
  inviteCode: { color: '#C7D6FF', fontSize: 11, lineHeight: 18, letterSpacing: 0.4, marginTop: 14 },
});
