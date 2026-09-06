import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
  PanResponder,
  Animated,
  FlatList,
} from 'react-native';
import * as Location from 'expo-location';
import { X, Type as TypeIcon, Send, MapPin, AtSign, Palette } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { spacing, radius } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import StoryMedia from './StoryMedia';
import {
  STORY_FONTS,
  STORY_TEXT_COLORS,
  type StoryTextSticker,
  type StoryMentionSticker,
  type StoryLocationSticker,
} from '../types/storyTypes';

type Props = {
  uri: string;
  mediaType: 'image' | 'video';
  uploading: boolean;
  onCancel: () => void;
  onPublish: (payload: {
    caption: string;
    textStickers: StoryTextSticker[];
    mentionStickers: StoryMentionSticker[];
    locationSticker: StoryLocationSticker | null;
  }) => void;
  screenW: number;
  screenH: number;
};

let idCounter = 0;
const nextId = () => `st_${Date.now()}_${idCounter++}`;

const DraggableSticker: React.FC<{
  x: number;
  y: number;
  scale: number;
  rotation: number;
  screenW: number;
  screenH: number;
  onChange: (x: number, y: number) => void;
  onSelect: () => void;
  selected: boolean;
  children: React.ReactNode;
}> = ({ x, y, scale, rotation, screenW, screenH, onChange, onSelect, selected, children }) => {
  const pan = useRef(new Animated.ValueXY({ x: x * screenW, y: y * screenH })).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        onSelect();
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const nx = Math.max(0, Math.min(1, (pan.x as any)._value / screenW));
        const ny = Math.max(0, Math.min(1, (pan.y as any)._value / screenH));
        onChange(nx, ny);
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.stickerWrap,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale },
            { rotate: `${rotation}deg` },
          ],
        },
        selected && styles.stickerSelected,
      ]}
    >
      {children}
    </Animated.View>
  );
};

const StoryComposerModal: React.FC<Props> = ({
  uri,
  mediaType,
  uploading,
  onCancel,
  onPublish,
  screenW,
  screenH,
}) => {
  const { colors } = useTheme();
  const { friends } = useApp();
  const styles2 = useMemo(() => makeStyles(colors), [colors]);

  const [textStickers, setTextStickers] = useState<StoryTextSticker[]>([]);
  const [mentionStickers, setMentionStickers] = useState<StoryMentionSticker[]>([]);
  const [locationSticker, setLocationSticker] = useState<StoryLocationSticker | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftFontIdx, setDraftFontIdx] = useState(0);
  const [draftColorIdx, setDraftColorIdx] = useState(0);
  const [draftBgMode, setDraftBgMode] = useState<'none' | 'solid' | 'soft'>('none');

  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const legacyCaption = useMemo(
    () => textStickers.map((t) => t.text).join(' · '),
    [textStickers]
  );

  const openTextEditor = () => {
    setDraftText('');
    setDraftFontIdx(0);
    setDraftColorIdx(0);
    setDraftBgMode('none');
    setTextEditorOpen(true);
  };

  const commitTextSticker = () => {
    if (!draftText.trim()) {
      setTextEditorOpen(false);
      return;
    }
    const sticker: StoryTextSticker = {
      id: nextId(),
      text: draftText.trim(),
      x: 0.5,
      y: 0.42,
      fontFamily: STORY_FONTS[draftFontIdx].fontFamily as string,
      color: STORY_TEXT_COLORS[draftColorIdx],
      bgMode: draftBgMode,
      scale: 1,
      rotation: 0,
    };
    setTextStickers((prev) => [...prev, sticker]);
    setTextEditorOpen(false);
  };

  const updateTextPos = (id: string, x: number, y: number) => {
    setTextStickers((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)));
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setTextStickers((prev) => prev.filter((t) => t.id !== selectedId));
    setMentionStickers((prev) => prev.filter((m) => m.id !== selectedId));
    if (locationSticker?.id === selectedId) setLocationSticker(null);
    setSelectedId(null);
  };

  const addMention = (friendId: string, friendName: string) => {
    setMentionStickers((prev) => [
      ...prev,
      { id: nextId(), friendId, friendName, x: 0.5, y: 0.3 },
    ]);
    setMentionPickerOpen(false);
  };

  const updateMentionPos = (id: string, x: number, y: number) => {
    setMentionStickers((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)));
  };

  const addLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLoading(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const place = places[0];
      const label = place
        ? [place.city ?? place.subregion, place.region ?? place.country].filter(Boolean).join(', ')
        : 'My location';
      setLocationSticker({ id: nextId(), label, x: 0.5, y: 0.18 });
    } catch {
      // Silently ignore — location is a nice-to-have, not a
      // requirement for posting a story.
    } finally {
      setLocationLoading(false);
    }
  };

  const updateLocationPos = (x: number, y: number) => {
    setLocationSticker((prev) => (prev ? { ...prev, x, y } : prev));
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={[styles.viewerContainer, { width: screenW, height: screenH }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={() => setSelectedId(null)}
        >
          {/*
  ONLY the changed usage inside StoryComposerModal.tsx — replace the
  existing <StoryMedia .../> call with this. Everything else in that
  file stays the same.
*/}

<StoryMedia
  uri={uri}
  mediaType={mediaType}
  width={screenW}
  height={screenH}
  loop
  zoomEnabled
  onAspectRatioChange={(ratio) => {
    // Optional: surface this upward if the parent screen wants to know
    // whether the picked media is vertical / square / landscape before
    // upload (e.g. to warn the user or auto-crop server-side later).
  }}
/>
        </TouchableOpacity>

        <LinearGradient
          colors={['rgba(0,0,0,0.45)', 'transparent']}
          style={styles.topGradient}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          style={styles.bottomGradient}
          pointerEvents="none"
        />

        {locationSticker && (
          <DraggableSticker
            x={locationSticker.x}
            y={locationSticker.y}
            scale={1}
            rotation={0}
            screenW={screenW}
            screenH={screenH}
            onChange={updateLocationPos}
            onSelect={() => setSelectedId(locationSticker.id)}
            selected={selectedId === locationSticker.id}
          >
            <View style={styles.locationChip}>
              <MapPin size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.locationChipText}>{locationSticker.label}</Text>
            </View>
          </DraggableSticker>
        )}

        {mentionStickers.map((m) => (
          <DraggableSticker
            key={m.id}
            x={m.x}
            y={m.y}
            scale={1}
            rotation={0}
            screenW={screenW}
            screenH={screenH}
            onChange={(x, y) => updateMentionPos(m.id, x, y)}
            onSelect={() => setSelectedId(m.id)}
            selected={selectedId === m.id}
          >
            <View style={styles.mentionChip}>
              <AtSign size={13} color={colors.primary} strokeWidth={2.5} />
              <Text style={styles.mentionChipText}>{m.friendName}</Text>
            </View>
          </DraggableSticker>
        ))}

        {textStickers.map((t) => (
          <DraggableSticker
            key={t.id}
            x={t.x}
            y={t.y}
            scale={t.scale}
            rotation={t.rotation}
            screenW={screenW}
            screenH={screenH}
            onChange={(x, y) => updateTextPos(t.id, x, y)}
            onSelect={() => setSelectedId(t.id)}
            selected={selectedId === t.id}
          >
            <View
              style={[
                t.bgMode === 'solid' && [styles.textBgSolid, { backgroundColor: t.color === '#000000' ? '#fff' : '#000' }],
                t.bgMode === 'soft' && styles.textBgSoft,
              ]}
            >
              <Text
                style={{
                  fontFamily: t.fontFamily,
                  color: t.bgMode === 'solid' ? (t.color === '#000000' ? '#000' : '#fff') : t.color,
                  fontSize: 26,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                {t.text}
              </Text>
            </View>
          </DraggableSticker>
        ))}

        {/* Top toolbar */}
        <View style={styles2.composerHeader}>
          <TouchableOpacity onPress={onCancel} style={styles2.iconBtn}>
            <X size={22} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles2.headerRightGroup}>
            {selectedId && (
              <TouchableOpacity onPress={removeSelected} style={styles2.iconBtn}>
                <Text style={styles2.removeLabel}>Remove</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={addLocation} style={styles2.iconBtn} disabled={locationLoading}>
              {locationLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MapPin size={20} color="#fff" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMentionPickerOpen(true)} style={styles2.iconBtn}>
              <AtSign size={20} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity onPress={openTextEditor} style={styles2.iconBtn}>
              <TypeIcon size={20} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer: publish */}
        <View style={styles2.composerFooter}>
          <TouchableOpacity
            style={styles2.publishBtn}
            onPress={() =>
              onPublish({
                caption: legacyCaption,
                textStickers,
                mentionStickers,
                locationSticker,
              })
            }
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color={colors.bg} size="small" />
            ) : (
              <>
                <Send size={16} color={colors.bg} strokeWidth={2.5} />
                <Text style={styles2.publishBtnText}>Share to story</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Text editor sheet */}
        <Modal visible={textEditorOpen} transparent animationType="fade" onRequestClose={() => setTextEditorOpen(false)}>
          <View style={styles2.textEditorBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles2.textEditorPreviewWrap}>
                <View
                  style={[
                    draftBgMode === 'solid' && [styles.textBgSolid, { backgroundColor: STORY_TEXT_COLORS[draftColorIdx] === '#000000' ? '#fff' : '#000' }],
                    draftBgMode === 'soft' && styles.textBgSoft,
                  ]}
                >
                  <TextInput
                    style={{
                      fontFamily: STORY_FONTS[draftFontIdx].fontFamily,
                      color:
                        draftBgMode === 'solid'
                          ? STORY_TEXT_COLORS[draftColorIdx] === '#000000'
                            ? '#000'
                            : '#fff'
                          : STORY_TEXT_COLORS[draftColorIdx],
                      fontSize: 28,
                      fontWeight: '700',
                      textAlign: 'center',
                      minWidth: 120,
                    }}
                    placeholder="Type something..."
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={draftText}
                    onChangeText={setDraftText}
                    autoFocus
                    multiline
                  />
                </View>
              </View>

              <View style={styles2.textEditorPanel}>
                <Text style={styles2.textEditorLabel}>Font</Text>
                <FlatList
                  data={STORY_FONTS}
                  keyExtractor={(f) => f.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.sm }}
                  renderItem={({ item, index }) => (
                    <TouchableOpacity
                      style={[styles2.fontChip, draftFontIdx === index && styles2.fontChipActive]}
                      onPress={() => setDraftFontIdx(index)}
                    >
                      <Text style={[{ fontFamily: item.fontFamily }, styles2.fontChipText]}>{item.label}</Text>
                    </TouchableOpacity>
                  )}
                />

                <Text style={[styles2.textEditorLabel, { marginTop: spacing.md }]}>Color</Text>
                <View style={styles2.colorRow}>
                  {STORY_TEXT_COLORS.map((c, index) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles2.colorDot,
                        { backgroundColor: c },
                        draftColorIdx === index && styles2.colorDotActive,
                      ]}
                      onPress={() => setDraftColorIdx(index)}
                    />
                  ))}
                </View>

                <Text style={[styles2.textEditorLabel, { marginTop: spacing.md }]}>Background</Text>
                <View style={styles2.colorRow}>
                  {(['none', 'soft', 'solid'] as const).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles2.bgModeChip, draftBgMode === mode && styles2.bgModeChipActive]}
                      onPress={() => setDraftBgMode(mode)}
                    >
                      <Palette size={13} color={draftBgMode === mode ? colors.bg : '#fff'} strokeWidth={2} />
                      <Text
                        style={[
                          styles2.bgModeChipText,
                          draftBgMode === mode && { color: colors.bg },
                        ]}
                      >
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles2.textEditorFooter}>
                  <TouchableOpacity onPress={() => setTextEditorOpen(false)} style={styles2.textEditorCancelBtn}>
                    <Text style={styles2.textEditorCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={commitTextSticker} style={styles2.textEditorDoneBtn}>
                    <Text style={styles2.textEditorDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Mention picker sheet */}
        <Modal
          visible={mentionPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMentionPickerOpen(false)}
        >
          <TouchableOpacity
            style={styles2.textEditorBackdrop}
            activeOpacity={1}
            onPress={() => setMentionPickerOpen(false)}
          >
            <View style={styles2.mentionSheet}>
              <Text style={styles2.textEditorLabel}>Mention a friend</Text>
              <FlatList
                data={friends}
                keyExtractor={(f: any) => f.id}
                contentContainerStyle={{ paddingVertical: spacing.sm }}
                renderItem={({ item }: any) => (
                  <TouchableOpacity
                    style={styles2.mentionRow}
                    onPress={() => addMention(item.id, item.name)}
                  >
                    <AtSign size={16} color={colors.primary} strokeWidth={2.5} />
                    <Text style={styles2.mentionRowText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles2.textEditorLabel}>Add some friends first</Text>
                }
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  viewerContainer: { flex: 1, backgroundColor: '#000' },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  stickerWrap: {
    position: 'absolute',
  },
  stickerSelected: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderStyle: 'dashed',
    borderRadius: radius.md,
  },
  textBgSolid: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textBgSoft: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  locationChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  mentionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
  },
  mentionChipText: { fontWeight: '700', fontSize: 13, color: '#111' },
});

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    composerHeader: {
      position: 'absolute',
      top: spacing.xl,
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    iconBtn: { padding: spacing.sm },
    removeLabel: { color: '#ff5a5a', fontWeight: '700', fontSize: 13 },

    composerFooter: {
      position: 'absolute',
      bottom: spacing.xl,
      left: spacing.lg,
      right: spacing.lg,
      alignItems: 'center',
    },
    publishBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    publishBtnText: { color: colors.bg, fontWeight: '800' },

    textEditorBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      justifyContent: 'flex-end',
    },
    textEditorPreviewWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    textEditorPanel: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
    },
    textEditorLabel: { color: colors.textFaint, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
    fontChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: 'rgba(255,255,255,0.06)',
      marginTop: spacing.xs,
    },
    fontChipActive: { backgroundColor: colors.primary },
    fontChipText: { color: '#fff', fontWeight: '600' },
    colorRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' },
    colorDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    colorDotActive: { borderColor: colors.primary },
    bgModeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    bgModeChipActive: { backgroundColor: colors.primary },
    bgModeChipText: { color: '#fff', fontWeight: '600', fontSize: 12, textTransform: 'capitalize' },
    textEditorFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
    },
    textEditorCancelBtn: { padding: spacing.md },
    textEditorCancelText: { color: colors.textFaint, fontWeight: '700' },
    textEditorDoneBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    textEditorDoneText: { color: colors.bg, fontWeight: '800' },

    mentionSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      maxHeight: '60%',
    },
    mentionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    mentionRowText: { color: colors.text, fontWeight: '600' },
  });

export default StoryComposerModal;