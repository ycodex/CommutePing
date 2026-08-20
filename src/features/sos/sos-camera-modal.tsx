import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraMode,
  type CameraType,
} from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
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
type EvidenceFiles = { photoUri?: string; videoUri?: string };
type AutoStage = 'idle' | 'photo' | 'video' | 'complete' | 'failed';

export function SosCameraModal({
  visible,
  autoCapture = false,
  triggerLabel = 'SOS',
  onClose,
  onEvidenceCaptured,
}: {
  visible: boolean;
  autoCapture?: boolean;
  triggerLabel?: string;
  onClose: () => void;
  onEvidenceCaptured: (kind: 'photo' | 'video') => void;
}) {
  const cameraRef = useRef<CameraView>(null);
  const captureSessionRef = useRef(0);
  const autoActionRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [mode, setMode] = useState<CameraMode>('picture');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [evidence, setEvidence] = useState<Evidence>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFiles>({});
  const [autoStage, setAutoStage] = useState<AutoStage>(autoCapture ? 'photo' : 'idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetCamera = useCallback((nextAutoStage: AutoStage = 'idle') => {
    captureSessionRef.current += 1;
    autoActionRef.current = false;
    setCameraReady(false);
    setCapturing(false);
    setRecording(false);
    setFacing('back');
    setMode('picture');
    setEvidence(null);
    setEvidenceFiles({});
    setAutoStage(nextAutoStage);
    setErrorMessage(null);
  }, []);

  const captureAutomaticPhoto = useCallback(async () => {
    if (!cameraRef.current || autoActionRef.current) return;
    const session = captureSessionRef.current;
    autoActionRef.current = true;
    setCapturing(true);
    setErrorMessage(null);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.72, shutterSound: false });
      if (captureSessionRef.current !== session) return;
      setEvidenceFiles((current) => ({ ...current, photoUri: result.uri }));
      onEvidenceCaptured('photo');
      setCameraReady(false);
      setMode('video');
      setAutoStage('video');
    } catch {
      if (captureSessionRef.current === session) {
        setAutoStage('failed');
        setErrorMessage('Automatic photo capture failed. Keep the app visible and retry.');
      }
    } finally {
      if (captureSessionRef.current === session) {
        autoActionRef.current = false;
        setCapturing(false);
      }
    }
  }, [onEvidenceCaptured]);

  const captureAutomaticVideo = useCallback(async () => {
    if (!cameraRef.current || autoActionRef.current) return;
    const session = captureSessionRef.current;
    autoActionRef.current = true;
    setRecording(true);
    setErrorMessage(null);
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: 30 });
      if (captureSessionRef.current !== session) return;
      if (!result) throw new Error('No recording returned');
      setEvidenceFiles((current) => ({ ...current, videoUri: result.uri }));
      onEvidenceCaptured('video');
      setAutoStage('complete');
    } catch {
      if (captureSessionRef.current === session) {
        setAutoStage('failed');
        setErrorMessage('Automatic video capture failed. Keep the app visible and retry.');
      }
    } finally {
      if (captureSessionRef.current === session) {
        autoActionRef.current = false;
        setRecording(false);
      }
    }
  }, [onEvidenceCaptured]);

  useEffect(() => {
    if (!visible || !autoCapture || !cameraReady || autoActionRef.current) return;
    if (autoStage === 'photo') void captureAutomaticPhoto();
    if (autoStage === 'video') void captureAutomaticVideo();
  }, [autoCapture, autoStage, cameraReady, captureAutomaticPhoto, captureAutomaticVideo, visible]);

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
    if (!permission.granted) {
      setErrorMessage('Microphone permission is required for SOS video audio.');
      return;
    }

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

  const requestAutomaticPermissions = async () => {
    setErrorMessage(null);
    const cameraResult = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!cameraResult.granted) return;
    const microphoneResult = microphonePermission?.granted ? microphonePermission : await requestMicrophonePermission();
    if (!microphoneResult.granted) setErrorMessage('Camera and microphone permission are both required for automatic SOS evidence.');
  };

  const retryAutomaticCapture = () => resetCamera('photo');
  const cameraPermissionBlocked = cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain;
  const microphonePermissionBlocked = microphonePermission && !microphonePermission.granted && !microphonePermission.canAskAgain;
  const automaticPermissionsReady = cameraPermission?.granted && microphonePermission?.granted;
  const automaticPermissionBlocked = cameraPermissionBlocked || microphonePermissionBlocked;
  const showPermissionCard = autoCapture ? !automaticPermissionsReady : !cameraPermission?.granted;
  const automaticComplete = autoCapture && autoStage === 'complete';

  return (
    <Modal animationType="slide" onRequestClose={close} visible={visible}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.title}>SOS evidence capture</Text>
            <Text style={styles.subtitle}>Foreground only · temporary device storage · never uploaded</Text>
          </View>
          <Pressable accessibilityLabel="Close SOS camera" accessibilityRole="button" onPress={close} style={styles.closeButton}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        {autoCapture && (
          <View accessibilityLiveRegion="polite" style={styles.autoNotice}>
            <Text style={styles.autoNoticeTitle}>{triggerLabel}</Text>
            <Text style={styles.autoNoticeCopy}>
              {autoStage === 'photo' && 'Taking a rear-camera photo…'}
              {autoStage === 'video' && (recording ? 'Recording rear-camera video · up to 30 seconds…' : 'Preparing video recording…')}
              {autoStage === 'complete' && 'Foreground evidence sequence completed.'}
              {autoStage === 'failed' && 'Evidence sequence stopped before completion.'}
            </Text>
          </View>
        )}

        {Platform.OS === 'web' ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Open this feature in the installed mobile app</Text>
            <Text style={styles.permissionCopy}>SOS camera evidence is intended for Android and iOS device testing.</Text>
          </View>
        ) : showPermissionCard ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>{automaticPermissionBlocked ? 'Camera or microphone access is blocked' : autoCapture ? 'Allow emergency evidence' : 'Allow camera access'}</Text>
            <Text style={styles.permissionCopy}>{autoCapture ? 'After you allow access, Commute Ping will visibly take one rear-camera photo and record up to 30 seconds of rear-camera video. Keep this screen open.' : 'Commute Ping accesses the camera only while this screen is open. Video audio is requested separately when you tap Record.'}</Text>
            {!automaticPermissionBlocked && (
              <Pressable accessibilityRole="button" onPress={() => { void (autoCapture ? requestAutomaticPermissions() : requestCameraPermission()); }} style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>{autoCapture ? 'Allow Camera & Microphone' : 'Allow Camera'}</Text>
              </Pressable>
            )}
          </View>
        ) : automaticComplete ? (
          <View accessibilityLabel="Completed SOS evidence capture" style={styles.capturedVideo}>
            <Text style={styles.permissionTitle}>Photo and video captured</Text>
            <Text style={styles.permissionCopy}>Both temporary files are ready in this app session. They were not uploaded or sent to contacts.</Text>
          </View>
        ) : !autoCapture && evidence?.kind === 'photo' ? (
          <Image accessibilityLabel="Captured SOS photo" resizeMode="cover" source={{ uri: evidence.uri }} style={styles.camera} />
        ) : !autoCapture && evidence?.kind === 'video' ? (
          <View accessibilityLabel="Captured SOS video" style={styles.capturedVideo}><Text style={styles.permissionTitle}>Video captured</Text><Text style={styles.permissionCopy}>The temporary recording is ready in this app session.</Text></View>
        ) : autoCapture && autoStage === 'failed' ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Capture interrupted</Text>
            <Text style={styles.permissionCopy}>Keep Commute Ping visible and retry the foreground photo and video sequence.</Text>
            <Pressable accessibilityRole="button" onPress={retryAutomaticCapture} style={styles.permissionButton}><Text style={styles.permissionButtonText}>Retry Capture</Text></Pressable>
          </View>
        ) : (
          <CameraView
            facing={facing}
            key={mode}
            mode={mode}
            mute={false}
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => {
              setAutoStage(autoCapture ? 'failed' : 'idle');
              setErrorMessage('The camera could not start on this device.');
            }}
            ref={cameraRef}
            style={styles.camera}
          />
        )}

        {cameraPermission?.granted && Platform.OS !== 'web' && !evidence && !autoCapture && (
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
                <Pressable accessibilityRole="button" disabled={!cameraReady || capturing || recording} onPress={() => { void capturePhoto(); }} style={styles.photoButton}>
                  {capturing ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryText}>Take Photo</Text>}
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" disabled={!cameraReady || capturing} onPress={recording ? () => cameraRef.current?.stopRecording() : () => { void startRecording(); }} style={[styles.recordButton, recording && styles.recordingButton]}>
                  <Text style={styles.primaryText}>{recording ? 'Stop Recording' : 'Start Recording'}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {errorMessage && <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage}</Text>}

        {!autoCapture && evidence && (
          <View accessibilityLiveRegion="polite" style={styles.evidenceNotice}>
            <Text style={styles.evidenceTitle}>{evidence.kind === 'photo' ? 'Photo captured' : 'Video captured'}</Text>
            <Text style={styles.evidenceCopy}>The file remains in the app cache for this session. It is not sent to contacts or a server.</Text>
            <Pressable accessibilityRole="button" onPress={() => { setEvidence(null); setCameraReady(false); setErrorMessage(null); }} style={styles.retakeButton}>
              <Text style={styles.retakeText}>Capture another</Text>
            </Pressable>
          </View>
        )}

        {autoCapture && automaticComplete && (evidenceFiles.photoUri || evidenceFiles.videoUri) && (
          <View style={styles.evidenceNotice}>
            <Text style={styles.evidenceTitle}>Evidence remains local</Text>
            <Text style={styles.evidenceCopy}>Temporary photo: {evidenceFiles.photoUri ? 'captured' : 'missing'} · Temporary video: {evidenceFiles.videoUri ? 'captured' : 'missing'}.</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0D0D10', padding: 18 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  headerCopy: { flex: 1 },
  title: { color: palette.text, fontSize: 21, fontWeight: '700' },
  subtitle: { color: palette.muted, fontSize: 10, marginTop: 4 },
  closeButton: { minHeight: 38, borderRadius: 11, borderColor: palette.lineStrong, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  closeText: { color: palette.text, fontSize: 11, fontWeight: '600' },
  autoNotice: { minHeight: 58, borderRadius: 13, borderColor: 'rgba(255,79,91,0.34)', borderWidth: 1, backgroundColor: 'rgba(255,79,91,0.10)', padding: 12, marginBottom: 12 },
  autoNoticeTitle: { color: '#FF9AA3', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  autoNoticeCopy: { color: palette.text, fontSize: 11, lineHeight: 16, marginTop: 4 },
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
