import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraMode,
  type CameraType,
} from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/commute-theme';

type Evidence = { kind: 'photo' | 'video'; uri: string } | null;

export function SosCameraModal({
  visible,
  onClose,
  onEvidenceCaptured,
}: {
  visible: boolean;
  onClose: () => void;
  onEvidenceCaptured: (kind: 'photo' | 'video') => void;
}) {
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [mode, setMode] = useState<CameraMode>('picture');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [evidence, setEvidence] = useState<Evidence>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetCamera = () => {
    setCameraReady(false);
    setCapturing(false);
    setRecording(false);
    setMode('picture');
    setEvidence(null);
    setErrorMessage(null);
  };

  const capturePhoto = async () => {
    if (!cameraReady || !cameraRef.current || capturing || recording) return;
    setCapturing(true);
    setErrorMessage(null);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.72, shutterSound: false });
      setEvidence({ kind: 'photo', uri: result.uri });
      onEvidenceCaptured('photo');
    } catch {
      setErrorMessage('The photo could not be captured. Check camera access and try again.');
    } finally {
      setCapturing(false);
    }
  };

  const startRecording = async () => {
    if (!cameraReady || !cameraRef.current || capturing || recording) return;
    const permission = microphonePermission?.granted
      ? microphonePermission
      : await requestMicrophonePermission();
    if (!permission.granted) return;

    setRecording(true);
    setErrorMessage(null);
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: 30 });
      if (result) {
        setEvidence({ kind: 'video', uri: result.uri });
        onEvidenceCaptured('video');
      }
    } catch {
      setErrorMessage('The video could not be recorded. Check camera and microphone access, then try again.');
    } finally {
      setRecording(false);
    }
  };

  const close = () => {
    if (recording) cameraRef.current?.stopRecording();
    resetCamera();
    onClose();
  };

  const changeMode = (nextMode: CameraMode) => {
    if (recording || capturing || nextMode === mode) return;
    setCameraReady(false);
    setEvidence(null);
    setErrorMessage(null);
    setMode(nextMode);
  };

  const changeFacing = () => {
    if (recording || capturing) return;
    setCameraReady(false);
    setFacing((current) => current === 'back' ? 'front' : 'back');
  };

  const permissionDenied = cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain;
  return (
    <Modal animationType="slide" onRequestClose={close} visible={visible}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text accessibilityRole="header" style={styles.title}>SOS evidence capture</Text>
            <Text style={styles.subtitle}>Saved temporarily on this device · never uploaded</Text>
          </View>
          <Pressable accessibilityLabel="Close SOS camera" accessibilityRole="button" onPress={close} style={styles.closeButton}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        {Platform.OS === 'web' ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Open this feature in the installed mobile app</Text>
            <Text style={styles.permissionCopy}>SOS camera evidence is intended for Android and iOS device testing.</Text>
          </View>
        ) : !cameraPermission?.granted ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>{permissionDenied ? 'Camera access is blocked' : 'Allow camera access'}</Text>
            <Text style={styles.permissionCopy}>Commute Ping accesses the camera only while this screen is open. Video audio is requested separately when you tap Record.</Text>
            {!permissionDenied && (
              <Pressable accessibilityRole="button" onPress={() => { void requestCameraPermission(); }} style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>Allow Camera</Text>
              </Pressable>
            )}
          </View>
        ) : evidence?.kind === 'photo' ? (
          <Image accessibilityLabel="Captured SOS photo" resizeMode="cover" source={{ uri: evidence.uri }} style={styles.camera} />
        ) : evidence?.kind === 'video' ? (
          <View accessibilityLabel="Captured SOS video" style={styles.capturedVideo}><Text style={styles.permissionTitle}>Video captured</Text><Text style={styles.permissionCopy}>The temporary recording is ready in this app session.</Text></View>
        ) : (
          <CameraView
            facing={facing}
            mode={mode}
            mute={false}
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => setErrorMessage('The camera could not start on this device.')}
            ref={cameraRef}
            style={styles.camera}
          />
        )}

        {cameraPermission?.granted && Platform.OS !== 'web' && !evidence && (
          <View>
            <View style={styles.modeControls}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'picture' }} disabled={recording || capturing} onPress={() => changeMode('picture')} style={[styles.modeButton, mode === 'picture' && styles.modeButtonSelected]}><Text style={[styles.secondaryText, mode === 'picture' && styles.modeTextSelected]}>Photo</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'video' }} disabled={recording || capturing} onPress={() => changeMode('video')} style={[styles.modeButton, mode === 'video' && styles.modeButtonSelected]}><Text style={[styles.secondaryText, mode === 'video' && styles.modeTextSelected]}>Video</Text></Pressable>
            </View>
            <View style={styles.controls}>
              <Pressable accessibilityRole="button" disabled={capturing || recording} onPress={changeFacing} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>{facing === 'back' ? 'Use Front' : 'Use Rear'}</Text>
              </Pressable>
              {mode === 'picture' ? (
                <Pressable accessibilityRole="button" disabled={!cameraReady || capturing || recording} onPress={capturePhoto} style={styles.photoButton}>
                  {capturing ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryText}>Take Photo</Text>}
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" disabled={!cameraReady || capturing} onPress={recording ? () => cameraRef.current?.stopRecording() : startRecording} style={[styles.recordButton, recording && styles.recordingButton]}>
                  <Text style={styles.primaryText}>{recording ? 'Stop Recording' : 'Start Recording'}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {errorMessage && <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage}</Text>}

        {evidence && (
          <View accessibilityLiveRegion="polite" style={styles.evidenceNotice}>
            <Text style={styles.evidenceTitle}>{evidence.kind === 'photo' ? 'Photo captured' : 'Video captured'}</Text>
            <Text style={styles.evidenceCopy}>The file remains in the app cache for this session. It is not sent to contacts or a server.</Text>
            <Pressable accessibilityRole="button" onPress={() => { setEvidence(null); setCameraReady(false); setErrorMessage(null); }} style={styles.retakeButton}>
              <Text style={styles.retakeText}>Capture another</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0D0D10', padding: 18 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  title: { color: palette.text, fontSize: 21, fontWeight: '700' },
  subtitle: { color: palette.muted, fontSize: 10, marginTop: 4 },
  closeButton: { minHeight: 38, borderRadius: 11, borderColor: palette.lineStrong, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  closeText: { color: palette.text, fontSize: 11, fontWeight: '600' },
  camera: { flex: 1, minHeight: 340, borderRadius: radius.large, overflow: 'hidden', backgroundColor: '#151519' },
  capturedVideo: { flex: 1, minHeight: 340, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151519', paddingHorizontal: 28 },
  permissionCard: { flex: 1, minHeight: 340, alignItems: 'center', justifyContent: 'center', borderRadius: radius.large, borderColor: palette.lineStrong, borderWidth: 1, backgroundColor: '#151519', padding: 28 },
  permissionTitle: { color: palette.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  permissionCopy: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 9 },
  permissionButton: { minHeight: 46, borderRadius: 13, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, marginTop: 20 },
  permissionButtonText: { color: palette.white, fontSize: 12, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: 9, marginTop: 14 },
  modeControls: { flexDirection: 'row', gap: 8, marginTop: 13 },
  modeButton: { minHeight: 38, flex: 1, borderRadius: 11, borderColor: palette.lineStrong, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modeButtonSelected: { borderColor: '#5E83E9', backgroundColor: palette.blueSoft },
  modeTextSelected: { color: '#D7E2FF' },
  secondaryButton: { minHeight: 48, flex: 1, borderRadius: 13, borderColor: palette.lineStrong, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: palette.text, fontSize: 11, fontWeight: '600' },
  photoButton: { minHeight: 48, flex: 1.2, borderRadius: 13, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  recordButton: { minHeight: 48, flex: 1, borderRadius: 13, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center' },
  recordingButton: { backgroundColor: '#8F1D28' },
  primaryText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  evidenceNotice: { borderRadius: 14, borderColor: 'rgba(69,201,148,0.3)', borderWidth: 1, backgroundColor: palette.greenSoft, padding: 14, marginTop: 12 },
  evidenceTitle: { color: palette.green, fontSize: 12, fontWeight: '700' },
  evidenceCopy: { color: '#B6C7BF', fontSize: 10, lineHeight: 15, marginTop: 4 },
  retakeButton: { alignSelf: 'flex-start', minHeight: 30, justifyContent: 'center', marginTop: 6 },
  retakeText: { color: '#AFC5FF', fontSize: 10, fontWeight: '600' },
  errorText: { color: '#FF9AA3', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 10 },
});
