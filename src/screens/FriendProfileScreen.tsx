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
  Image,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing, typography, avatarPalette } from '../theme/theme';
import Avatar from '../components/Avatar';
import AvatarPicker from '../components/AvatarPicker';
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
import { Note, ImportantDate, ImportantDateType, Gender, SocialLink } from '../types';
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
const GENDERS: Gender[] = ['Woman', 'Man', 'Non-binary', 'Prefer not to say', 'Custom'];
const LOVE_LANGUAGES = ['Words of Affirmation', 'Quality Time', 'Acts of Service', 'Gifts', 'Physical Touch'] as const;
const CATEGORIES = [
  'Best Friend',
  'Close Friend',
  'Friend',
  'Classmate',
  'Roommate',
  'Family',
  'Coworker',
  'Acquaintance',
  'Situationship',
] as const;
const SOCIAL_PLATFORMS = ['Instagram', 'Snapchat', 'TikTok', 'X', 'LinkedIn', 'WhatsApp', 'Other'];

type EditSection = 'main' | 'personal' | 'contact' | 'social' | 'preferences';

const FriendProfileScreen: React.FC = () => {
  const {
    friends,
    updateFriend,
    deleteFriend,
    addNote,
    deleteNote,
    addImportantDate,
    updateImportantDate,
    deleteImportantDate,
    markContacted,
    toggleFavorite,
  } = useApp();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const friendId = route.params?.friendId;
  const friend = friends.find((f) => f.id === friendId);

  // ---- Note modal ----
  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteTag, setNoteTag] = useState<Note['tag']>('Conversation');

  // ---- Date modal ----
  const [dateModal, setDateModal] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [dateType, setDateType] = useState<ImportantDateType>('Birthday');
  const [dateISO, setDateISO] = useState(new Date().toISOString());
  const [dateYearKnown, setDateYearKnown] = useState(false);

  // ---- Ask AI modal ----
  const [askModal, setAskModal] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);

  // ---- Full edit-profile modal (mirrors ProfileScreen's edit sheet) ----
  const [editing, setEditing] = useState(false);
  const [editSection, setEditSection] = useState<EditSection>('main');

  // core
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [emoji, setEmoji] = useState('🙂');
  const [avatarColor, setAvatarColor] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('Friend');
  const [interestsText, setInterestsText] = useState('');

  // personal
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [genderCustom, setGenderCustom] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [howWeMet, setHowWeMet] = useState('');
  const [personalityNotes, setPersonalityNotes] = useState('');
  const [hasBirthday, setHasBirthday] = useState(false);
  const [birthdayISO, setBirthdayISO] = useState(new Date().toISOString());
  const [birthdayYearKnown, setBirthdayYearKnown] = useState(false);

  // contact
  const [city, setCity] = useState('');
  const [school, setSchool] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  // social
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [newSocialPlatform, setNewSocialPlatform] = useState(SOCIAL_PLATFORMS[0]);
  const [newSocialHandle, setNewSocialHandle] = useState('');

  // preferences
  const [favoriteFood, setFavoriteFood] = useState('');
  const [allergiesOrDislikes, setAllergiesOrDislikes] = useState('');
  const [loveLanguage, setLoveLanguage] = useState<typeof LOVE_LANGUAGES[number] | undefined>(undefined);
  const [giftPreferencesNote, setGiftPreferencesNote] = useState('');
  const [reconnectFrequencyDays, setReconnectFrequencyDays] = useState('');

  const insight = useMemo(() => {
    if (!friend) return '';
    const since = daysSince(friend.lastContacted);
    const nextDate = friend.importantDates
      .map((d) => ({ ...d, days: daysUntilNextOccurrence(d.date) }))
      .sort((a, b) => a.days - b.days)[0];

    const parts: string[] = [];
    if (since !== null) {
      if (since >= (friend.reconnectFrequencyDays ?? 30)) {
        parts.push(
          `It's been ${formatTimeAgo(friend.lastContacted!).toLowerCase()} since you last talked — consider reaching out.`
        );
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

  // ---------------- Ask AI ----------------
  const handleAsk = () => {
    if (!question.trim()) return;
    const q = question.toLowerCase();
    let a = '';
    if (q.includes('birthday') || q.includes('date')) {
      const bday = friend.importantDates.find((d) => d.type === 'Birthday');
      a = bday
        ? `${friend.name}'s birthday is ${formatFullDate(bday.date)} — ${formatRelativeDay(daysUntilNextOccurrence(bday.date))}.`
        : `You haven't added a birthday for ${friend.name} yet.`;
    } else if (q.includes('gender') || q.includes('pronoun')) {
      a = friend.gender
        ? `${friend.name}'s gender is ${friend.gender === 'Custom' ? friend.genderCustom : friend.gender}${friend.pronouns ? ` (${friend.pronouns})` : ''}.`
        : `No gender info saved for ${friend.name}.`;
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
    } else if (q.includes('allerg') || q.includes('food')) {
      a = friend.favoriteFood || friend.allergiesOrDislikes
        ? `Favorite food: ${friend.favoriteFood || 'unknown'}. Allergies/dislikes: ${friend.allergiesOrDislikes || 'none noted'}.`
        : `No food info saved for ${friend.name}.`;
    } else if (q.includes('note') || q.includes('remember') || q.includes('said')) {
      a = friend.notes.length ? `Recent note: "${friend.notes[0].content}"` : `No notes saved for ${friend.name} yet.`;
    } else {
      a = `${friend.name} is your ${friend.category.toLowerCase()}${friend.city ? ` from ${friend.city}` : ''}. ${insight}`;
    }
    setAnswer(a);
  };

  // ---------------- Notes ----------------
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

  // ---------------- Important dates ----------------
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

  // ---------------- Full profile edit ----------------
  const openEdit = () => {
    setName(friend.name);
    setNickname(friend.nickname ?? '');
    setEmoji(friend.emoji);
    setAvatarColor(friend.avatarColor);
    setPhotoUri(friend.photoUri);
    setCategory(friend.category as typeof CATEGORIES[number]);
    setInterestsText(friend.interests.join(', '));

    setGender(friend.gender);
    setGenderCustom(friend.genderCustom ?? '');
    setPronouns(friend.pronouns ?? '');
    setHowWeMet(friend.howWeMet ?? '');
    setPersonalityNotes(friend.personalityNotes ?? '');

    const existingBday = friend.importantDates.find((d) => d.type === 'Birthday');
    setHasBirthday(!!existingBday);
    setBirthdayISO(existingBday?.date ?? new Date().toISOString());
    setBirthdayYearKnown(existingBday?.yearKnown ?? false);

    setCity(friend.city ?? '');
    setSchool(friend.school ?? '');
    setPhone(friend.phone ?? '');
    setEmail(friend.email ?? '');
    setAddress(friend.address ?? '');

    setSocialLinks(friend.socialLinks ?? []);
    setNewSocialPlatform(SOCIAL_PLATFORMS[0]);
    setNewSocialHandle('');

    setFavoriteFood(friend.favoriteFood ?? '');
    setAllergiesOrDislikes(friend.allergiesOrDislikes ?? '');
    setLoveLanguage(friend.loveLanguage);
    setGiftPreferencesNote(friend.giftPreferencesNote ?? '');
    setReconnectFrequencyDays(friend.reconnectFrequencyDays ? String(friend.reconnectFrequencyDays) : '');

    setEditSection('main');
    setEditing(true);
  };

  const addSocialLink = () => {
    if (!newSocialHandle.trim()) return;
    setSocialLinks((prev) => [
      ...prev,
      { id: newId(), platform: newSocialPlatform, handle: newSocialHandle.trim() },
    ]);
    setNewSocialHandle('');
  };

  const removeSocialLink = (id: string) => {
    setSocialLinks((prev) => prev.filter((s) => s.id !== id));
  };

  const saveEdit = () => {
    // Sync the birthday field with the importantDates list, since that's
    // where birthdays are actually stored (same as the "Important Dates"
    // section below).
    const existingBday = friend.importantDates.find((d) => d.type === 'Birthday');
    if (hasBirthday) {
      if (existingBday) {
        updateImportantDate(friend.id, existingBday.id, {
          date: birthdayISO,
          yearKnown: birthdayYearKnown,
        });
      } else {
        addImportantDate(friend.id, {
          id: newId(),
          label: 'Birthday',
          type: 'Birthday',
          date: birthdayISO,
          yearKnown: birthdayYearKnown,
        });
      }
    } else if (existingBday) {
      deleteImportantDate(friend.id, existingBday.id);
    }

    updateFriend(friend.id, {
      name: name.trim() || friend.name,
      nickname: nickname.trim() || undefined,
      emoji,
      avatarColor,
      photoUri,
      category,
      interests: interestsText.split(',').map((s) => s.trim()).filter(Boolean),

      gender,
      genderCustom: gender === 'Custom' ? genderCustom.trim() || undefined : undefined,
      pronouns: pronouns.trim() || undefined,
      howWeMet: howWeMet.trim() || undefined,
      personalityNotes: personalityNotes.trim() || undefined,

      city: city.trim() || undefined,
      school: school.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,

      socialLinks,

      favoriteFood: favoriteFood.trim() || undefined,
      allergiesOrDislikes: allergiesOrDislikes.trim() || undefined,
      loveLanguage,
      giftPreferencesNote: giftPreferencesNote.trim() || undefined,
      reconnectFrequencyDays: reconnectFrequencyDays.trim() ? Number(reconnectFrequencyDays) : undefined,

      updatedAt: new Date().toISOString(),
    });
    setEditing(false);
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

  const toggleArchive = () => {
    updateFriend(friend.id, { isArchived: !friend.isArchived, updatedAt: new Date().toISOString() });
  };

  const metaLine = [friend.category, friend.city].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Top bar — mirrors ProfileScreen's topBar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => toggleFavorite(friend.id)} style={{ marginRight: spacing.md }}>
              <Ionicons name={friend.favorite ? 'star' : 'star-outline'} size={22} color={colors.gold} />
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Header — mirrors ProfileScreen's headerRow, name/username/meta + avatar */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.name}>{friend.name}</Text>
            {friend.nickname ? <Text style={styles.username}>"{friend.nickname}"</Text> : null}
            {!!metaLine && <Text style={styles.meta}>{metaLine}</Text>}
            {friend.pronouns ? <Text style={styles.meta}>{friend.pronouns}</Text> : null}
          </View>
          {friend.photoUri ? (
            <Image source={{ uri: friend.photoUri }} style={styles.headerPhoto} />
          ) : (
            <Avatar emoji={friend.emoji} color={friend.avatarColor} size={68} />
          )}
        </View>

        {friend.isArchived && (
          <View style={styles.archivedBanner}>
            <Ionicons name="archive-outline" size={14} color={colors.textFaint} />
            <Text style={styles.archivedBannerText}>This friend is archived</Text>
          </View>
        )}

        {/* Stat card — mirrors ProfileScreen's statCard */}
        <View style={styles.statCard}>
          <StatBlock value={friend.notes.length} label="Notes" />
          <View style={styles.statDivider} />
          <StatBlock value={friend.importantDates.length} label="Dates" />
          <View style={styles.statDivider} />
          <StatBlock value={friend.interests.length} label="Interests" />
        </View>

        <TouchableOpacity style={styles.editBtn} onPress={openEdit} activeOpacity={0.7}>
          <Ionicons name="create-outline" size={16} color={colors.text} style={{ marginRight: 6 }} />
          <Text style={styles.editBtnText}>Edit profile</Text>
        </TouchableOpacity>

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
        <TouchableOpacity
          style={styles.askRow}
          onPress={() => {
            setAskModal(true);
            setAnswer(null);
          }}
        >
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <Text style={styles.askText}>Ask about {friend.name.split(' ')[0]}...</Text>
        </TouchableOpacity>

        {/* Details */}
        <Text style={styles.sectionLabel}>DETAILS</Text>
        <View style={styles.settingsGroup}>
          {birthday && (
            <DetailRow icon="gift-outline" label={`Birthday · ${formatFullDate(birthday.date)}`} />
          )}
          {friend.gender && (
            <DetailRow
              icon="person-outline"
              label={friend.gender === 'Custom' ? friend.genderCustom || 'Custom' : friend.gender}
            />
          )}
          {friend.city && <DetailRow icon="location-outline" label={friend.city} />}
          {friend.school && <DetailRow icon="school-outline" label={friend.school} />}
          {friend.phone && <DetailRow icon="call-outline" label={friend.phone} />}
          {friend.email && <DetailRow icon="mail-outline" label={friend.email} />}
          {friend.address && <DetailRow icon="home-outline" label={friend.address} last />}
          {!birthday &&
            !friend.gender &&
            !friend.city &&
            !friend.school &&
            !friend.phone &&
            !friend.email &&
            !friend.address && <Text style={styles.emptyText}>No details added yet.</Text>}
        </View>

        {/* Social links */}
        {friend.socialLinks && friend.socialLinks.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>SOCIAL</Text>
            <View style={styles.settingsGroup}>
              {friend.socialLinks.map((s, idx) => (
                <DetailRow
                  key={s.id}
                  icon="at-outline"
                  label={`${s.platform}: ${s.handle}`}
                  last={idx === friend.socialLinks.length - 1}
                />
              ))}
            </View>
          </>
        )}

        {/* About / personal notes */}
        {(friend.howWeMet || friend.personalityNotes) && (
          <>
            <Text style={styles.sectionLabel}>ABOUT</Text>
            <View style={styles.settingsGroup}>
              {friend.howWeMet && (
                <View style={styles.aboutBlock}>
                  <Text style={styles.aboutLabel}>How we met</Text>
                  <Text style={styles.aboutText}>{friend.howWeMet}</Text>
                </View>
              )}
              {friend.personalityNotes && (
                <View style={[styles.aboutBlock, { borderBottomWidth: 0 }]}>
                  <Text style={styles.aboutLabel}>Personality</Text>
                  <Text style={styles.aboutText}>{friend.personalityNotes}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Preferences */}
        {(friend.favoriteFood || friend.allergiesOrDislikes || friend.loveLanguage || friend.giftPreferencesNote) && (
          <>
            <Text style={styles.sectionLabel}>PREFERENCES</Text>
            <View style={styles.settingsGroup}>
              {friend.favoriteFood && <DetailRow icon="restaurant-outline" label={`Favorite food: ${friend.favoriteFood}`} />}
              {friend.allergiesOrDislikes && (
                <DetailRow icon="alert-circle-outline" label={`Allergies/dislikes: ${friend.allergiesOrDislikes}`} />
              )}
              {friend.loveLanguage && <DetailRow icon="heart-outline" label={`Love language: ${friend.loveLanguage}`} />}
              {friend.giftPreferencesNote && (
                <DetailRow icon="pricetag-outline" label={friend.giftPreferencesNote} last />
              )}
            </View>
          </>
        )}

        {/* Interests */}
        <Text style={styles.sectionLabel}>INTERESTS</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {friend.interests.map((i) => (
            <Chip key={i} label={i} />
          ))}
          {friend.interests.length === 0 && <Text style={styles.emptyText}>No interests added yet.</Text>}
        </View>

        {/* Gift ideas */}
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
                    {d.type === 'Birthday' && d.yearKnown && getAgeTurning(d.date)
                      ? ` · turns ${getAgeTurning(d.date)}`
                      : ''}
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
          {friend.notes.length === 0 && (
            <Text style={styles.emptyText}>No notes yet. Jot down what you talk about!</Text>
          )}
          {friend.notes.map((n) => (
            <Card key={n.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  {n.tag && (
                    <Chip label={n.tag} style={{ marginBottom: spacing.xs, marginRight: 0, alignSelf: 'flex-start' }} />
                  )}
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

        {/* Danger zone — mirrors ProfileScreen's ACCOUNT group */}
        <Text style={styles.sectionLabel}>MANAGE</Text>
        <View style={styles.settingsGroup}>
          <TouchableOpacity style={[styles.settingRow, styles.settingRowBorder]} onPress={toggleArchive} activeOpacity={0.6}>
            <Ionicons name={friend.isArchived ? 'archive' : 'archive-outline'} size={18} color={colors.textDim} />
            <Text style={styles.settingText}>{friend.isArchived ? 'Unarchive friend' : 'Archive friend'}</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} onPress={confirmDelete} activeOpacity={0.6}>
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
            <Text style={[styles.settingText, styles.settingTextDanger]}>Delete friend</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* -------------------- Add Note Modal -------------------- */}
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

      {/* -------------------- Add/Edit Date Modal -------------------- */}
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

      {/* -------------------- Ask AI Modal -------------------- */}
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

      {/* -------------------- FULL-SCREEN EDIT PROFILE MODAL -------------------- */}
      {/* Mirrors ProfileScreen's settings full-screen modal: a top bar with */}
      {/* back/close + section title, and a set of sub-pages. */}
      <Modal visible={editing} animationType="slide" onRequestClose={() => setEditing(false)}>
        <SafeAreaView style={styles.settingsSafe}>
          <View style={styles.settingsTopBar}>
            <TouchableOpacity
              onPress={() => (editSection === 'main' ? setEditing(false) : setEditSection('main'))}
              hitSlop={10}
              style={styles.settingsBackBtn}
            >
              <Ionicons name={editSection === 'main' ? 'close' : 'chevron-back'} size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.settingsTitle}>
              {editSection === 'main' && 'Edit Friend'}
              {editSection === 'personal' && 'Personal Info'}
              {editSection === 'contact' && 'Contact Info'}
              {editSection === 'social' && 'Social Links'}
              {editSection === 'preferences' && 'Preferences'}
            </Text>
            {editSection === 'main' ? (
              <TouchableOpacity onPress={saveEdit} hitSlop={10}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 24 }} />
            )}
          </View>

          <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {editSection === 'main' && (
              <>
                <View style={{ alignItems: 'center', marginVertical: spacing.lg }}>
                  <AvatarPicker photoUri={photoUri} emoji={emoji} color={avatarColor} onChangePhoto={setPhotoUri} />
                </View>

                <Text style={styles.label}>Emoji (used if no photo)</Text>
                <View style={styles.wrapRow}>
                  {['🌿', '😊', '🌸', '🎸', '📚', '🏀', '✈️', '🎮', '🎨', '☕', '🔥', '💫'].map((e) => (
                    <TouchableOpacity
                      key={e}
                      style={[styles.emojiOption, emoji === e && styles.emojiOptionActive]}
                      onPress={() => setEmoji(e)}
                    >
                      <Text style={{ fontSize: 20 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Color</Text>
                <View style={styles.wrapRow}>
                  {avatarPalette.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setAvatarColor(c)}
                      style={[styles.colorOption, { backgroundColor: c }, avatarColor === c && styles.colorOptionActive]}
                    />
                  ))}
                </View>

                <Text style={styles.label}>Name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.textFaint} />

                <Text style={styles.label}>Nickname</Text>
                <TextInput style={styles.input} value={nickname} onChangeText={setNickname} placeholderTextColor={colors.textFaint} />

                <Text style={styles.label}>Relationship</Text>
                <View style={styles.wrapRow}>
                  {CATEGORIES.map((c) => (
                    <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
                  ))}
                </View>

                <Text style={styles.label}>Interests (comma separated)</Text>
                <TextInput
                  style={styles.input}
                  value={interestsText}
                  onChangeText={setInterestsText}
                  placeholderTextColor={colors.textFaint}
                  placeholder="Coffee, Hiking, Photography"
                />

                <Text style={styles.label}>Reconnect reminder (days)</Text>
                <TextInput
                  style={styles.input}
                  value={reconnectFrequencyDays}
                  onChangeText={setReconnectFrequencyDays}
                  placeholderTextColor={colors.textFaint}
                  placeholder="e.g. 30"
                  keyboardType="number-pad"
                />

                <View style={{ height: spacing.lg }} />
                <Text style={styles.sectionLabel}>MORE DETAILS</Text>
                <View style={styles.settingsGroup}>
                  <SettingRow icon="person-outline" label="Personal info" onPress={() => setEditSection('personal')} />
                  <SettingRow icon="call-outline" label="Contact info" onPress={() => setEditSection('contact')} />
                  <SettingRow icon="at-outline" label="Social links" onPress={() => setEditSection('social')} />
                  <SettingRow icon="heart-outline" label="Preferences & gifts" onPress={() => setEditSection('preferences')} last />
                </View>
                <View style={{ height: spacing.xxl }} />
              </>
            )}

            {editSection === 'personal' && (
  <>
    <Text style={styles.label}>Birthday</Text>
    <TouchableOpacity
      style={styles.birthdayToggle}
      onPress={() => setHasBirthday((prev) => !prev)}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View style={[styles.checkbox, hasBirthday && styles.checkboxActive]}>
        {hasBirthday && <View style={styles.checkboxDot} />}
      </View>
      <Text style={styles.birthdayToggleText}>Track their birthday</Text>
    </TouchableOpacity>

    {hasBirthday && (
      <View style={styles.birthdayFieldsWrap}>
        <DateFields
          value={birthdayISO}
          yearKnown={birthdayYearKnown}
          onChange={(iso, known) => {
            setBirthdayISO(iso);
            setBirthdayYearKnown(known);
          }}
        />
        {birthdayYearKnown && getAgeTurning(birthdayISO) != null ? (
          <View style={styles.ageBadge}>
            <Ionicons name="balloon-outline" size={14} color={colors.primary} />
            <Text style={styles.ageBadgeText}>
              Turns {getAgeTurning(birthdayISO)} this year · {formatRelativeDay(daysUntilNextOccurrence(birthdayISO))}
            </Text>
          </View>
        ) : (
          <View style={styles.ageBadge}>
            <Ionicons name="calendar-outline" size={14} color={colors.textDim} />
            <Text style={styles.ageBadgeText}>
              {formatRelativeDay(daysUntilNextOccurrence(birthdayISO))} · year not set, so age isn't shown
            </Text>
          </View>
        )}
      </View>
    )}

    <Text style={styles.label}>Gender</Text>
    <View style={styles.wrapRow}>
      {GENDERS.map((g) => (
        <Chip key={g} label={g} active={gender === g} onPress={() => setGender(g)} />
      ))}
    </View>
    {gender === 'Custom' && (
      <TextInput
        style={styles.input}
        value={genderCustom}
        onChangeText={setGenderCustom}
        placeholder="Custom gender"
        placeholderTextColor={colors.textFaint}
      />
    )}

    <Text style={styles.label}>Pronouns</Text>
    <TextInput
      style={styles.input}
      value={pronouns}
      onChangeText={setPronouns}
      placeholder="e.g. she/her, they/them"
      placeholderTextColor={colors.textFaint}
    />

    <Text style={styles.label}>How we met</Text>
    <TextInput
      style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
      value={howWeMet}
      onChangeText={setHowWeMet}
      multiline
      placeholderTextColor={colors.textFaint}
    />

    <Text style={styles.label}>Personality notes</Text>
    <TextInput
      style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
      value={personalityNotes}
      onChangeText={setPersonalityNotes}
      multiline
      placeholder="Introvert, loves deep conversations, night owl..."
      placeholderTextColor={colors.textFaint}
    />
    <View style={{ height: spacing.xxl }} />
  </>
)}

            {editSection === 'contact' && (
              <>
                <Text style={styles.label}>City</Text>
                <TextInput style={styles.input} value={city} onChangeText={setCity} placeholderTextColor={colors.textFaint} />

                <Text style={styles.label}>School</Text>
                <TextInput style={styles.input} value={school} onChangeText={setSchool} placeholderTextColor={colors.textFaint} />

                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.textFaint}
                />

                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={colors.textFaint}
                />

                <Text style={styles.label}>Address</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  placeholderTextColor={colors.textFaint}
                />
                <View style={{ height: spacing.xxl }} />
              </>
            )}

            {editSection === 'social' && (
              <>
                {socialLinks.map((s) => (
                  <View key={s.id} style={styles.socialRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.socialPlatform}>{s.platform}</Text>
                      <Text style={styles.socialHandle}>{s.handle}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeSocialLink(s.id)} hitSlop={8}>
                      <Ionicons name="close" size={18} color={colors.textFaint} />
                    </TouchableOpacity>
                  </View>
                ))}

                <Text style={styles.label}>Add a social link</Text>
                <View style={styles.wrapRow}>
                  {SOCIAL_PLATFORMS.map((p) => (
                    <Chip key={p} label={p} active={newSocialPlatform === p} onPress={() => setNewSocialPlatform(p)} />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginRight: spacing.sm }]}
                    value={newSocialHandle}
                    onChangeText={setNewSocialHandle}
                    placeholder="@handle"
                    autoCapitalize="none"
                    placeholderTextColor={colors.textFaint}
                  />
                  <TouchableOpacity style={styles.addSocialBtn} onPress={addSocialLink}>
                    <Ionicons name="add" size={22} color={colors.bg} />
                  </TouchableOpacity>
                </View>
                <View style={{ height: spacing.xxl }} />
              </>
            )}

            {editSection === 'preferences' && (
              <>
                <Text style={styles.label}>Favorite food</Text>
                <TextInput
                  style={styles.input}
                  value={favoriteFood}
                  onChangeText={setFavoriteFood}
                  placeholderTextColor={colors.textFaint}
                />

                <Text style={styles.label}>Allergies / dislikes</Text>
                <TextInput
                  style={styles.input}
                  value={allergiesOrDislikes}
                  onChangeText={setAllergiesOrDislikes}
                  placeholderTextColor={colors.textFaint}
                />

                <Text style={styles.label}>Love language</Text>
                <View style={styles.wrapRow}>
                  {LOVE_LANGUAGES.map((l) => (
                    <Chip key={l} label={l} active={loveLanguage === l} onPress={() => setLoveLanguage(l)} />
                  ))}
                </View>

                <Text style={styles.label}>Gift preference notes</Text>
                <TextInput
                  style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                  value={giftPreferencesNote}
                  onChangeText={setGiftPreferencesNote}
                  multiline
                  placeholder="Sizes, favorite brands, wishlist items..."
                  placeholderTextColor={colors.textFaint}
                />
                <View style={{ height: spacing.xxl }} />
              </>
            )}

            {editSection !== 'main' && (
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ icon: any; label: string; last?: boolean }> = ({ icon, label, last }) => (
  <View style={[styles.detailRow, !last && styles.settingRowBorder]}>
    <Ionicons name={icon} size={16} color={colors.textDim} />
    <Text style={styles.detailText}>{label}</Text>
  </View>
);

const SettingRow: React.FC<{
  icon: any;
  label: string;
  onPress?: () => void;
  last?: boolean;
}> = ({ icon, label, onPress, last }) => (
  <TouchableOpacity style={[styles.settingRow, !last && styles.settingRowBorder]} onPress={onPress} activeOpacity={0.6}>
    <Ionicons name={icon} size={18} color={colors.textDim} />
    <Text style={styles.settingText}>{label}</Text>
    <View style={{ flex: 1 }} />
    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
  </TouchableOpacity>
);

const StatBlock: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <View style={styles.statBlock}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.sm },
  headerPhoto: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.cardAlt },
  name: { ...typography.h2, color: colors.text, fontWeight: '700' },
  username: { ...typography.body, color: colors.textDim, marginTop: 2 },
  meta: { ...typography.caption, color: colors.textFaint, marginTop: 4 },

  archivedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  archivedBannerText: { ...typography.caption, color: colors.textFaint, marginLeft: 6 },

  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  statBlock: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.h3, color: colors.text, fontWeight: '700' },
  statLabel: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: '70%', backgroundColor: colors.border },

  editBtn: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: { ...typography.bodyBold, color: colors.text },

  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 4,
    marginTop: spacing.md,
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

  sectionLabel: {
    ...typography.caption,
    color: colors.textFaint,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
    marginLeft: 2,
  },
  settingsGroup: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 6, paddingHorizontal: spacing.md },
  settingRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  settingText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },
  settingTextDanger: { color: '#FF3B30' },

  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md },
  detailText: { ...typography.body, color: colors.text, marginLeft: spacing.sm, flex: 1 },
  emptyText: { ...typography.caption, color: colors.textFaint },

  aboutBlock: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  aboutLabel: { ...typography.caption, color: colors.textFaint, fontWeight: '600', marginBottom: 2 },
  aboutText: { ...typography.body, color: colors.text, lineHeight: 20 },

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
  answerBox: { backgroundColor: colors.primary + '15', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  answerText: { ...typography.body, color: colors.text, lineHeight: 20 },

  // ---- Full-screen edit modal (mirrors ProfileScreen settings modal) ----
  settingsSafe: { flex: 1, backgroundColor: colors.bg },
  settingsTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingsBackBtn: { width: 24 },
  settingsTitle: { ...typography.h3, color: colors.text, fontWeight: '700' },
  settingsScroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  doneText: { ...typography.bodyBold, color: colors.primary },

  label: { ...typography.caption, color: colors.textDim, marginTop: spacing.md, marginBottom: spacing.xs, fontWeight: '600' },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: spacing.md,
    ...typography.body,
  },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap' },
  emojiOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  emojiOptionActive: { borderColor: colors.primary, backgroundColor: colors.primary + '20' },
  colorOption: { width: 32, height: 32, borderRadius: 16, marginRight: spacing.sm, marginBottom: spacing.sm },
  colorOptionActive: { borderWidth: 3, borderColor: colors.text },

  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  socialPlatform: { ...typography.caption, color: colors.textFaint, fontWeight: '600' },
  socialHandle: { ...typography.body, color: colors.text, marginTop: 2 },
  addSocialBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

   saveBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.lg },
  saveBtnText: { ...typography.bodyBold, color: colors.bg },

  birthdayToggle: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxDot: { width: 8, height: 8, borderRadius: 2, backgroundColor: colors.bg },
  birthdayToggleText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },
  birthdayFieldsWrap: { marginTop: spacing.xs, marginBottom: spacing.sm },
  ageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '15',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  ageBadgeText: { ...typography.caption, color: colors.text, marginLeft: spacing.xs, flex: 1 },


});

export default FriendProfileScreen;