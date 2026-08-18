import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing, typography } from '../theme/theme';
import Avatar from '../components/Avatar';
import Chip from '../components/Chip';
import { Card, SectionHeader } from '../components/Card';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  daysSince,
  daysUntilNextOccurrence,
  formatFullDate,
  formatRelativeDay,
  formatTimeAgo,
  getAgeTurning,
} from '../utils/dateUtils';
import { Note, ImportantDate, ImportantDateType } from '../types';
import DateFields from '../components/DateFields';
import { newId } from '../utils/id';

const GIFT_IDEAS: Record<string, string[]> = {
  Photography: ['A roll of film', 'Photo album / scrapbook', 'Camera strap'],
  Coffee: ['Local roastery gift card', 'Pour-over kit', 'Fun mug'],
  'Indie music': ['Concert tickets', 'Vinyl from favorite artist', 'Band tee'],
  Hiking: ['Trail snacks basket', 'Portable water filter', 'Wool socks'],
  Guitar: ['Guitar picks set', 'Strings', 'Lessons voucher'],
  'Rock climbing': ['Chalk bag', 'Gym day pass', 'Grip trainer'],
  Ramen: ['Ramen making kit', 'Local ramen shop gift card'],
  Basketball: ['New basketball', 'Jersey of favorite team', 'Game tickets'],
  Cooking: ['Spice set', 'Recipe box', 'Apron'],
  Sneakers: ['Shoe cleaning kit', 'Gift card to sneaker store'],
  Travel: ['Packing cubes', 'Travel journal', 'Portable charger'],
  'Salsa dancing': ['Dance shoes', 'Class package'],
  Fashion: ['Gift card to favorite store', 'Statement accessory'],
  Gaming: ['Game gift card', 'Controller skin'],
  Anime: ['Manga volume', 'Figure', 'Convention tickets'],
  Design: ['Sketchbook', 'iPad stylus', 'Design book'],
  'Vinyl records': ['Record from wishlist', 'Record cleaning kit'],
  Economics: ['Interesting nonfiction book', 'Nice notebook'],
  'True crime podcasts': ['Podcast merch', 'Cozy blanket for listening'],
  Baking: ['Baking tools', 'Specialty ingredients kit'],
};

const DATE_TYPES: ImportantDateType[] = ['Birthday', 'Anniversary', 'Graduation', 'Meet Day', 'Custom'];
const NOTE_TAGS: Note['tag'][] = ['Conversation', 'Interest', 'Important Detail', 'Memory'];

const FriendProfileScreen: React.FC = () => {
  const { friends, updateFriend, deleteFriend, addNote, deleteNote, addImportantDate, updateImportantDate, deleteImportantDate, markContacted, toggleFavorite } = useApp();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const friendId = route.params?.friendId;
  const friend = friends.find((f) => f.id === friendId);

  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteTag, setNoteTag] = useState<Note['tag']>('Conversation');

  const [dateModal, setDateModal] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [dateType, setDateType] = useState<ImportantDateType>('Birthday');
  const [dateISO, setDateISO] = useState(new Date().toISOString());
  const [dateYearKnown, setDateYearKnown] = useState(false);

  const [askModal, setAskModal] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);

  const insight = useMemo(() => {
    if (!friend) return '';
    const since = daysSince(friend.lastContacted);
    const nextDate = friend.importantDates
      .map((d) => ({ ...d, days: daysUntilNextOccurrence(d.date) }))
      .sort((a, b) => a.days - b.days)[0];

    const parts: string[] = [];
    if (since !== null) {
      if (since >= (friend.reconnectFrequencyDays ?? 30)) {
        parts.push(`It's been ${formatTimeAgo(friend.lastContacted!).toLowerCase()} since you last talked — consider reaching out.`);
      } else {
        parts.push(`You're staying connected — last contact was ${formatTimeAgo(friend.lastContacted!).toLowerCase()}.`);
      }
    }
    if (nextDate) {
      parts.push(`${nextDate.label} is coming up in ${formatRelativeDay(nextDate.days).toLowerCase()}.`);
    }
    if (friend.interests.length > 0) {
      parts.push(`They're into ${friend.interests.slice(0, 2).join(' and ')} — a good conversation starter.`);
    }
    return parts.join(' ');
  }, [friend]);

  const giftIdeas = useMemo(() => {
    if (!friend) return [];
    const ideas: string[] = [];
    friend.interests.forEach((i) => {
      if (GIFT_IDEAS[i]) ideas.push(...GIFT_IDEAS[i]);
    });
    return Array.from(new Set(ideas)).slice(0, 5);
  }, [friend]);

  if (!friend) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ color: colors.text, padding: spacing.lg }}>Friend not found.</Text>
      </SafeAreaView>
    );
  }

  const birthday = friend.importantDates.find((d) => d.type === 'Birthday');

  const handleAsk = () => {
    if (!question.trim()) return;
    const q = question.toLowerCase();
    let a = '';
    if (q.includes('birthday') || q.includes('date')) {
      const bday = friend.importantDates.find((d) => d.type === 'Birthday');
      a = bday
        ? `${friend.name}'s birthday is ${formatFullDate(bday.date)} — ${formatRelativeDay(daysUntilNextOccurrence(bday.date))}.`
        : `You haven't added a birthday for ${friend.name} yet.`;
    } else if (q.includes('interest') || q.includes('like')) {
      a = friend.interests.length
        ? `${friend.name} is interested in: ${friend.interests.join(', ')}.`
        : `No interests noted for ${friend.name} yet.`;
    } else if (q.includes('last') || q.includes('talk') || q.includes('contact')) {
      a = friend.lastContacted
        ? `You last connected with ${friend.name} ${formatTimeAgo(friend.lastContacted).toLowerCase()}.`
        : `No contact recorded yet with ${friend.name}.`;
    } else if (q.includes('gift')) {
      a = giftIdeas.length ? `Gift ideas: ${giftIdeas.join(', ')}.` : `Add some interests to get gift ideas.`;
    } else if (q.includes('note') || q.includes('remember') || q.includes('said')) {
      a = friend.notes.length
        ? `Recent note: "${friend.notes[0].content}"`
        : `No notes saved for ${friend.name} yet.`;
    } else {
      a = `${friend.name} is your ${friend.category.toLowerCase()}${friend.city ? ` from ${friend.city}` : ''}. ${insight}`;
    }
    setAnswer(a);
  };

  const submitNote = () => {
    if (!noteText.trim()) return;
    addNote(friend.id, {
      id: newId(),
      content: noteText.trim(),
      createdAt: new Date().toISOString(),
      tag: noteTag,
    });
    setNoteText('');
    setNoteModal(false);
  };

  const openAddDate = () => {
    setEditingDateId(null);
    setDateLabel('Birthday');
    setDateType('Birthday');
    setDateISO(new Date().toISOString());
    setDateYearKnown(false);
    setDateModal(true);
  };

  const openEditDate = (d: ImportantDate) => {
    setEditingDateId(d.id);
    setDateLabel(d.label);
    setDateType(d.type);
    setDateISO(d.date);
    setDateYearKnown(d.yearKnown);
    setDateModal(true);
  };

  const submitDate = () => {
    if (!dateLabel.trim()) return;
    if (editingDateId) {
      updateImportantDate(friend.id, editingDateId, {
        label: dateLabel.trim(),
        type: dateType,
        date: dateISO,
        yearKnown: dateYearKnown,
      });
    } else {
      addImportantDate(friend.id, {
        id: newId(),
        label: dateLabel.trim(),
        type: dateType,
        date: dateISO,
        yearKnown: dateYearKnown,
      });
    }
    setDateModal(false);
  };

  const confirmDelete = () => {
    Alert.alert('Remove friend', `Remove ${friend.name} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteFriend(friend.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('AddFriend', { friendId: friend.id })}
              style={{ marginRight: spacing.md }}
            >
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleFavorite(friend.id)} style={{ marginRight: spacing.md }}>
              <Ionicons name={friend.favorite ? 'star' : 'star-outline'} size={22} color={colors.gold} />
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileHeader}>
          <Avatar emoji={friend.emoji} color={friend.avatarColor} size={84} />
          <Text style={styles.name}>{friend.name}</Text>
          {friend.nickname && <Text style={styles.nickname}>"{friend.nickname}"</Text>}
          <Chip label={friend.category} active style={{ marginTop: spacing.sm }} />
        </View>

        <TouchableOpacity style={styles.contactBtn} onPress={() => markContacted(friend.id)}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.bg} />
          <Text style={styles.contactBtnText}>Mark as Reconnected</Text>
        </TouchableOpacity>
        <Text style={styles.lastContactedText}>
          {friend.lastContacted ? `Last contact: ${formatTimeAgo(friend.lastContacted)}` : 'No contact recorded yet'}
        </Text>

        {/* AI Insight */}
        <Card style={{ marginTop: spacing.lg, backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs }}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
            <Text style={styles.aiLabel}>AI Insight</Text>
          </View>
          <Text style={styles.aiText}>{insight || 'Add notes and dates to unlock insights.'}</Text>
        </Card>

        {/* Ask AI */}
        <TouchableOpacity style={styles.askRow} onPress={() => { setAskModal(true); setAnswer(null); }}>
          <Ionicons name="search" size={16} color={colors.textDim} />
          <Text style={styles.askText}>Ask about {friend.name.split(' ')[0]}...</Text>
        </TouchableOpacity>

        {/* Details */}
<View style={{ marginTop: spacing.lg }}>
  <SectionHeader title="Details" />
  <Card>
    {birthday && (
      <DetailRow
        icon="gift-outline"
        label={`Birthday · ${formatFullDate(birthday.date)}`}
      />
    )}
    {friend.city && <DetailRow icon="location-outline" label={friend.city} />}
    {friend.school && <DetailRow icon="school-outline" label={friend.school} />}
    {friend.phone && <DetailRow icon="call-outline" label={friend.phone} />}
    {friend.instagram && <DetailRow icon="logo-instagram" label={friend.instagram} />}
    {!birthday && !friend.city && !friend.school && !friend.phone && !friend.instagram && (
      <Text style={styles.emptyText}>No details added yet.</Text>
    )}
  </Card>
</View>

        {/* Interests */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader title="Interests" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {friend.interests.map((i) => (
              <Chip key={i} label={i} />
            ))}
            {friend.interests.length === 0 && <Text style={styles.emptyText}>No interests added yet.</Text>}
          </View>
        </View>

        {/* Gift Ideas */}
        {giftIdeas.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <SectionHeader title="Gift & Celebration Ideas" subtitle="Based on their interests" />
            <Card>
              {giftIdeas.map((g, i) => (
                <View key={i} style={styles.giftRow}>
                  <Ionicons name="gift-outline" size={16} color={colors.accent} />
                  <Text style={styles.giftText}>{g}</Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Important Dates */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader
            title="Important Dates"
            right={
              <TouchableOpacity onPress={openAddDate}>
                <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
              </TouchableOpacity>
            }
          />
          {friend.importantDates.length === 0 && <Text style={styles.emptyText}>No dates added yet.</Text>}
          {friend.importantDates.map((d) => (
            <TouchableOpacity key={d.id} activeOpacity={0.7} onPress={() => openEditDate(d)}>
              <Card style={{ marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateLabel}>{d.label}</Text>
                  <Text style={styles.dateType}>
                    {d.type} · {formatFullDate(d.date)} · {formatRelativeDay(daysUntilNextOccurrence(d.date))}
                    {d.type === 'Birthday' && d.yearKnown && getAgeTurning(d.date) ? ` · turns ${getAgeTurning(d.date)}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => deleteImportantDate(friend.id, d.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color={colors.textFaint} />
                </TouchableOpacity>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        {/* Notes */}
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader
            title="Notes & Memories"
            right={
              <TouchableOpacity onPress={() => setNoteModal(true)}>
                <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
              </TouchableOpacity>
            }
          />
          {friend.notes.length === 0 && <Text style={styles.emptyText}>No notes yet. Jot down what you talk about!</Text>}
          {friend.notes.map((n) => (
            <Card key={n.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  {n.tag && <Chip label={n.tag} style={{ marginBottom: spacing.xs, marginRight: 0, alignSelf: 'flex-start' }} />}
                  <Text style={styles.noteText}>{n.content}</Text>
                  <Text style={styles.noteDate}>{formatTimeAgo(n.createdAt)}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteNote(friend.id, n.id)}>
                  <Ionicons name="close" size={18} color={colors.textFaint} />
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* Add Note Modal */}
      <Modal visible={noteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a note</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm }}>
              {NOTE_TAGS.map((t) => (
                <Chip key={t} label={t!} active={noteTag === t} onPress={() => setNoteTag(t)} />
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="What did you talk about, notice, or want to remember?"
              placeholderTextColor={colors.textFaint}
              value={noteText}
              onChangeText={setNoteText}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setNoteModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={submitNote}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add/Edit Date Modal */}
      <Modal visible={dateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalTopRow}>
                <Text style={styles.modalTitle}>{editingDateId ? 'Edit date' : 'Add an important date'}</Text>
                <TouchableOpacity onPress={() => setDateModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textDim} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm }}>
                {DATE_TYPES.map((t) => (
                  <Chip key={t} label={t} active={dateType === t} onPress={() => setDateType(t)} />
                ))}
              </View>
              <Text style={styles.fieldLabel}>Label</Text>
              <TextInput
                style={styles.modalInputShort}
                placeholder="Label (e.g. Birthday, Graduation)"
                placeholderTextColor={colors.textFaint}
                value={dateLabel}
                onChangeText={setDateLabel}
              />
              <DateFields
                value={dateISO}
                yearKnown={dateYearKnown}
                onChange={(iso, known) => {
                  setDateISO(iso);
                  setDateYearKnown(known);
                }}
              />
              <View style={styles.modalActions}>
                {editingDateId ? (
                  <TouchableOpacity
                    style={styles.modalCancel}
                    onPress={() => {
                      deleteImportantDate(friend.id, editingDateId);
                      setDateModal(false);
                    }}
                  >
                    <Text style={[styles.modalCancelText, { color: colors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.modalCancel} onPress={() => setDateModal(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.modalSave} onPress={submitDate}>
                  <Text style={styles.modalSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: spacing.md }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Ask AI Modal */}
      <Modal visible={askModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <Text style={[styles.modalTitle, { marginLeft: spacing.xs, marginBottom: 0 }]}>
                Ask about {friend.name.split(' ')[0]}
              </Text>
            </View>
            <TextInput
              style={styles.modalInputShort}
              placeholder="e.g. When is their birthday?"
              placeholderTextColor={colors.textFaint}
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={handleAsk}
            />
            {answer && (
              <View style={styles.answerBox}>
                <Text style={styles.answerText}>{answer}</Text>
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setAskModal(false)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleAsk}>
                <Text style={styles.modalSaveText}>Ask</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ icon: any; label: string }> = ({ icon, label }) => (
  <View style={styles.detailRow}>
    <Ionicons name={icon} size={16} color={colors.textDim} />
    <Text style={styles.detailText}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileHeader: { alignItems: 'center', marginTop: spacing.md },
  name: { ...typography.h2, color: colors.text, marginTop: spacing.sm },
  nickname: { ...typography.body, color: colors.textFaint, marginTop: 2 },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 4,
    marginTop: spacing.lg,
  },
  contactBtnText: { ...typography.bodyBold, color: colors.bg, marginLeft: spacing.xs },
  lastContactedText: { ...typography.caption, color: colors.textFaint, textAlign: 'center', marginTop: spacing.sm },
  aiLabel: { ...typography.caption, color: colors.primary, fontWeight: '700', marginLeft: 6 },
  aiText: { ...typography.body, color: colors.text, lineHeight: 21 },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  askText: { ...typography.caption, color: colors.textDim, marginLeft: spacing.xs },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  detailText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },
  emptyText: { ...typography.caption, color: colors.textFaint },
  giftRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  giftText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },
  dateLabel: { ...typography.bodyBold, color: colors.text },
  dateType: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  noteText: { ...typography.body, color: colors.text, lineHeight: 20 },
  noteDate: { ...typography.small, color: colors.textFaint, marginTop: spacing.xs },
  modalOverlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
  },
  modalTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  modalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { ...typography.caption, color: colors.textDim, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs },
  modalInput: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: spacing.md,
    minHeight: 90,
    marginTop: spacing.md,
    textAlignVertical: 'top',
    ...typography.body,
  },
  modalInputShort: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: spacing.md,
    marginTop: spacing.md,
    ...typography.body,
  },
  modalHint: { ...typography.small, color: colors.textFaint, marginTop: spacing.sm },
  modalActions: { flexDirection: 'row', marginTop: spacing.lg },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    marginRight: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
  },
  modalCancelText: { ...typography.bodyBold, color: colors.textDim },
  modalSave: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  modalSaveText: { ...typography.bodyBold, color: colors.bg },
  answerBox: {
    backgroundColor: colors.primary + '15',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  answerText: { ...typography.body, color: colors.text, lineHeight: 20 },
});

export default FriendProfileScreen;