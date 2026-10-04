import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
  PanResponder,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import type { CameraType, FlashMode } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Zap, ZapOff, SwitchCamera, Images, Play } from 'lucide-react-native';

export type CapturedMedia = {
  uri: string;
  type: 'image' | 'video';
  mimeType?: string | null;
};

type Props = {
  onClose: () => void;
  onCaptured: (media: CapturedMedia) => void;
};

const MAX_VIDEO_SEC = 60;
const YELLOW = '#FFD60A';
const REC_RED = '#FF3B30';
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const fmtDur = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const StoryCamera: React.FC<Props> = ({ onClose, onCaptured }) => {
  const insets = useSafeAreaInsets();
  const camRef = useRef<CameraView>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();

  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [mode, setMode] = useState<'picture' | 'video'>('picture');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);

  // ---------------- Pinch-to-zoom ----------------
  const zoomRef = useRef(0);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onPanResponderMove: (e) => {
        const t = e.nativeEvent.touches;
        if (t.length < 2) {
          pinch.current = null;
          return;
        }
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!pinch.current) {
          pinch.current = { d, z: zoomRef.current };
          return;
        }
        const z = clamp(pinch.current.z + (d / pinch.current.d - 1) * 0.5, 0, 1);
        zoomRef.current = z;
        setZoom(z);
      },
      onPanResponderRelease: () => {
        pinch.current = null;
      },
      onPanResponderTerminate: () => {
        pinch.current = null;
      },
    })
  ).current;

  // ---------------- Recent gallery strip ----------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted || cancelled) return;
        const res = await MediaLibrary.getAssetsAsync({
          first: 40,
          mediaType: ['photo', 'video'],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        if (!cancelled) setAssets(res.assets);
      } catch {
        // gallery strip is optional — camera still works without it
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------- Recording timer ----------------
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(
    () => () => {
      try {
        camRef.current?.stopRecording();
      } catch {}
    },
    []
  );

  // ---------------- Actions ----------------
  const cycleFlash = () => setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'));

  const switchMode = async (next: 'picture' | 'video') => {
    if (recording || next === mode) return;
    if (next === 'video' && !micPerm?.granted) {
      const r = await requestMicPerm();
      if (!r.granted) {
        Alert.alert('Mikrofon kerak', 'Video yozish uchun mikrofonga ruxsat bering.');
        return;
      }
    }
    setMode(next);
  };

  const takePhoto = async () => {
    if (!camRef.current || !ready || busy) return;
    setBusy(true);
    try {
      const p = await camRef.current.takePictureAsync({ quality: 0.85 });
      if (p?.uri) onCaptured({ uri: p.uri, type: 'image', mimeType: 'image/jpeg' });
    } catch {
      Alert.alert('Xatolik', "Rasmga olib bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (!camRef.current || !ready) return;
    if (recording) {
      camRef.current.stopRecording();
      return;
    }
    setSeconds(0);
    setRecording(true);
    try {
      const v = await camRef.current.recordAsync({ maxDuration: MAX_VIDEO_SEC });
      if (v?.uri) onCaptured({ uri: v.uri, type: 'video', mimeType: null });
    } catch {
      Alert.alert('Xatolik', "Video yozib bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setRecording(false);
    }
  };

  const onShutter = () => (mode === 'picture' ? takePhoto() : toggleRecording());

  const pickAsset = async (a: MediaLibrary.Asset) => {
    if (busy || recording) return;
    setBusy(true);
    try {
      const info = await MediaLibrary.getAssetInfoAsync(a);
      onCaptured({
        uri: info.localUri ?? a.uri,
        type: a.mediaType === 'video' ? 'video' : 'image',
        mimeType: null,
      });
    } catch {
      Alert.alert('Xatolik', "Faylni ochib bo'lmadi.");
    } finally {
      setBusy(false);
    }
  };

  const openFullLibrary = async () => {
    if (busy || recording) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Ruxsat kerak', 'Galereyaga kirishga ruxsat bering.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const a = result.assets[0];
    onCaptured({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mimeType: a.mimeType ?? null });
  };

  // ---------------- Permission gate ----------------
  const renderBody = () => {
    if (!camPerm) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      );
    }
    if (!camPerm.granted) {
      return (
        <View style={styles.center}>
          <Text style={styles.permTitle}>Kameraga ruxsat kerak</Text>
          <Text style={styles.permText}>Story olish uchun ilovaga kameradan foydalanishga ruxsat bering.</Text>
          <TouchableOpacity
            style={styles.permBtn}
            onPress={() => (camPerm.canAskAgain ? requestCamPerm() : Linking.openSettings())}
          >
            <Text style={styles.permBtnText}>{camPerm.canAskAgain ? 'Ruxsat berish' : 'Sozlamalarni ochish'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permClose} onPress={openFullLibrary}>
            <Text style={styles.permCloseText}>Galereyadan tanlash</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        {/* Preview (rounded, like the iPhone camera) */}
        <View style={styles.previewWrap} {...pinchResponder.panHandlers}>
          <CameraView
            ref={camRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            flash={flash}
            enableTorch={mode === 'video' && flash === 'on'}
            mode={mode}
            zoom={zoom}
            onCameraReady={() => setReady(true)}
          />
          {recording && (
            <View style={styles.recPill}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>
                {fmtDur(seconds)} / {fmtDur(MAX_VIDEO_SEC)}
              </Text>
            </View>
          )}
        </View>

        {/* Bottom panel */}
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
          {assets.length > 0 && !recording && (
            <FlatList
              data={assets}
              keyExtractor={(a) => a.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.strip}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.8} onPress={() => pickAsset(item)} style={styles.stripItem}>
                  <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} />
                  {item.mediaType === 'video' && (
                    <View style={styles.stripBadge}>
                      <Play size={9} color="#fff" fill="#fff" />
                      <Text style={styles.stripBadgeText}>{fmtDur(item.duration)}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          )}

          {!recording && (
            <View style={styles.modeRow}>
              <TouchableOpacity onPress={() => switchMode('video')} hitSlop={10}>
                <Text style={[styles.modeText, mode === 'video' && styles.modeTextActive]}>VIDEO</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => switchMode('picture')} hitSlop={10}>
                <Text style={[styles.modeText, mode === 'picture' && styles.modeTextActive]}>FOTO</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.sideBtn} onPress={openFullLibrary} disabled={recording}>
              {assets[0] ? (
                <Image source={{ uri: assets[0].uri }} style={styles.sideThumb} />
              ) : (
                <Images size={22} color="#fff" strokeWidth={2.2} />
              )}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.8} onPress={onShutter} disabled={busy || !ready} style={styles.shutterOuter}>
              <View
                style={[
                  styles.shutterInner,
                  mode === 'video' && { backgroundColor: REC_RED },
                  recording && styles.shutterRecording,
                ]}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sideBtn}
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              disabled={recording}
            >
              <SwitchCamera size={22} color="#fff" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 10) + 4 }]}>
          <TouchableOpacity onPress={onClose} style={styles.roundBtn} hitSlop={8}>
            <X size={20} color="#fff" strokeWidth={2.6} />
          </TouchableOpacity>
          {camPerm?.granted && (
            <TouchableOpacity onPress={cycleFlash} style={styles.roundBtn} hitSlop={8}>
              {flash === 'off' ? (
                <ZapOff size={18} color="#fff" strokeWidth={2.4} />
              ) : (
                <View style={styles.flashWrap}>
                  <Zap size={18} color={YELLOW} fill={YELLOW} strokeWidth={2.4} />
                  {flash === 'auto' && <Text style={styles.flashAuto}>A</Text>}
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
        {renderBody()}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashWrap: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  flashAuto: { color: YELLOW, fontSize: 10, fontWeight: '800' },

  previewWrap: { flex: 1, borderRadius: 22, overflow: 'hidden', backgroundColor: '#111', marginHorizontal: 4 },
  recPill: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: REC_RED },
  recText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  bottom: { backgroundColor: '#000', paddingTop: 10 },
  strip: { flexGrow: 0, height: 60, marginBottom: 6 },
  stripItem: { width: 60, height: 60, borderRadius: 8, overflow: 'hidden', backgroundColor: '#222' },
  stripBadge: {
    position: 'absolute',
    left: 3,
    bottom: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
  },
  stripBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingVertical: 8 },
  modeText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '700', letterSpacing: 0.8 },
  modeTextActive: { color: YELLOW },

  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 6,
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sideThumb: { width: '100%', height: '100%' },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  shutterRecording: { width: 30, height: 30, borderRadius: 8, backgroundColor: REC_RED },

  permTitle: { color: '#fff', fontWeight: '800', fontSize: 18, marginBottom: 8, textAlign: 'center' },
  permText: { color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: 20 },
  permBtn: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  permBtnText: { color: '#111', fontWeight: '800' },
  permClose: { marginTop: 16, padding: 8 },
  permCloseText: { color: YELLOW, fontWeight: '700' },
});

export default StoryCamera;