import { Friend, UserProfile, WorldSpecialDay } from '../types';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

export const seedFriends: Friend[] = [
  {
    id: 'f1',
    name: 'Amelia Cross',
    nickname: 'Ames',
    avatarColor: '#B084F5',
    emoji: '🌸',
    category: 'Best Friend',
    phone: '+1 555-0142',
    instagram: '@ameliaxo',
    city: 'Austin, TX',
    school: 'UT Austin',
    interests: ['Photography', 'Coffee', 'Indie music', 'Hiking'],
    importantDates: [
      { id: 'd1', label: 'Birthday', type: 'Birthday', date: inDays(9), yearKnown: true },
      { id: 'd2', label: 'Day we met', type: 'Meet Day', date: '2021-08-14', yearKnown: true },
    ],
    notes: [
      {
        id: 'n1',
        content: 'Just got back from a trip to Portugal — loved Lisbon, wants to go back next summer.',
        createdAt: daysAgo(3),
        tag: 'Conversation',
      },
      {
        id: 'n2',
        content: 'Really into film photography lately, shooting on a Pentax K1000.',
        createdAt: daysAgo(10),
        tag: 'Interest',
      },
    ],
    lastContacted: daysAgo(3),
    reconnectFrequencyDays: 14,
    favorite: true,
    createdAt: daysAgo(600),
  },
  {
    id: 'f2',
    name: 'Jordan Blake',
    avatarColor: '#5EE6C8',
    emoji: '🎸',
    category: 'Close Friend',
    instagram: '@jblake',
    city: 'Denver, CO',
    school: 'CU Boulder',
    interests: ['Guitar', 'Rock climbing', 'Ramen'],
    importantDates: [
      { id: 'd3', label: 'Birthday', type: 'Birthday', date: inDays(41), yearKnown: true },
    ],
    notes: [
      {
        id: 'n3',
        content: 'Started a band with his roommates, first show is next month.',
        createdAt: daysAgo(20),
        tag: 'Conversation',
      },
    ],
    lastContacted: daysAgo(45),
    reconnectFrequencyDays: 30,
    favorite: true,
    createdAt: daysAgo(500),
  },
  {
    id: 'f3',
    name: 'Priya Nair',
    avatarColor: '#FF7EB6',
    emoji: '📚',
    category: 'Classmate',
    school: 'UT Austin',
    interests: ['Economics', 'True crime podcasts', 'Baking'],
    importantDates: [
      { id: 'd4', label: 'Birthday', type: 'Birthday', date: inDays(120), yearKnown: true },
    ],
    notes: [
      {
        id: 'n4',
        content: 'In my Econ 302 study group, super sharp with statistics.',
        createdAt: daysAgo(60),
        tag: 'Important Detail',
      },
    ],
    lastContacted: daysAgo(70),
    reconnectFrequencyDays: 45,
    favorite: false,
    createdAt: daysAgo(200),
  },
  {
    id: 'f4',
    name: 'Malik Owusu',
    avatarColor: '#F5C86B',
    emoji: '🏀',
    category: 'Roommate',
    phone: '+1 555-0199',
    city: 'Austin, TX',
    interests: ['Basketball', 'Cooking', 'Sneakers'],
    importantDates: [
      { id: 'd5', label: 'Birthday', type: 'Birthday', date: inDays(5), yearKnown: true },
      { id: 'd6', label: 'Move-in day', type: 'Custom', date: '2023-08-20', yearKnown: true },
    ],
    notes: [
      {
        id: 'n5',
        content: 'Training for a half marathon, could use encouragement leading up to race day.',
        createdAt: daysAgo(2),
        tag: 'Important Detail',
      },
    ],
    lastContacted: daysAgo(1),
    reconnectFrequencyDays: 7,
    favorite: true,
    createdAt: daysAgo(365),
  },
  {
    id: 'f5',
    name: 'Sofia Reyes',
    avatarColor: '#7EC8FF',
    emoji: '✈️',
    category: 'Friend',
    instagram: '@sofiareyes',
    city: 'Miami, FL',
    interests: ['Travel', 'Salsa dancing', 'Fashion'],
    importantDates: [
      { id: 'd7', label: 'Birthday', type: 'Birthday', date: inDays(200), yearKnown: true },
    ],
    notes: [
      {
        id: 'n6',
        content: 'Studying abroad in Barcelona this semester, big time difference.',
        createdAt: daysAgo(90),
        tag: 'Conversation',
      },
    ],
    lastContacted: daysAgo(95),
    reconnectFrequencyDays: 30,
    favorite: false,
    createdAt: daysAgo(400),
  },
  {
    id: 'f6',
    name: 'Ethan Park',
    avatarColor: '#C8FF7E',
    emoji: '🎮',
    category: 'Acquaintance',
    school: 'UT Austin',
    interests: ['Gaming', 'Anime'],
    importantDates: [],
    notes: [],
    lastContacted: daysAgo(150),
    reconnectFrequencyDays: 60,
    favorite: false,
    createdAt: daysAgo(150),
  },
];

export const seedProfile: UserProfile = {
  id: 'me',
  name: 'Alex Rivera',
  username: '@alexr',
  bio: 'Junior at UT Austin • collecting good people & good memories 🌿',
  emoji: '🌿',
  avatarColor: '#8B5FE0',
  birthday: '2004-03-22',
  city: 'Austin, TX',
  school: 'UT Austin',
  instagram: '@alex.rivera',
  interests: ['Design', 'Basketball', 'Vinyl records'],
};

export const worldSpecialDays: WorldSpecialDay[] = [
  { id: 'w1', name: "New Year's Day", month: 1, day: 1, emoji: '🎆' },
  { id: 'w2', name: "Valentine's Day", month: 2, day: 14, emoji: '💘' },
  { id: 'w3', name: "Galentine's Day", month: 2, day: 13, emoji: '💌' },
  { id: 'w4', name: "St. Patrick's Day", month: 3, day: 17, emoji: '🍀' },
  { id: 'w5', name: "April Fools' Day", month: 4, day: 1, emoji: '🤡' },
  { id: 'w6', name: "Earth Day", month: 4, day: 22, emoji: '🌍' },
  { id: 'w7', name: "Cinco de Mayo", month: 5, day: 5, emoji: '🌮' },
  { id: 'w8', name: "Mother's Day", month: 5, day: 11, emoji: '💐' },
  { id: 'w9', name: "Father's Day", month: 6, day: 15, emoji: '👔' },
  { id: 'w10', name: "International Friendship Day", month: 7, day: 30, emoji: '🤝' },
  { id: 'w11', name: "Halloween", month: 10, day: 31, emoji: '🎃' },
  { id: 'w12', name: "World Kindness Day", month: 11, day: 13, emoji: '🕊️' },
  { id: 'w13', name: "Thanksgiving", month: 11, day: 27, emoji: '🦃' },
  { id: 'w14', name: "Christmas Eve", month: 12, day: 24, emoji: '🎄' },
  { id: 'w15', name: "New Year's Eve", month: 12, day: 31, emoji: '🥂' },
];
