# Relatr — Remember the People Who Matter

A React Native (Expo + TypeScript) personal relationship app for Gen Z / university
students. Instead of a professional CRM, Relatr helps you remember birthdays,
conversations, interests, and when it's time to reconnect with friends.

## Features

- **Dates tab** — calendar-style view of upcoming friend birthdays/important dates
  plus a feed of world special days (holidays, etc.)
- **Friends tab** — add friends, search/filter by relationship category, see who
  you're overdue to reconnect with
- **Friend Profile** — notes & memories, interests, important dates, AI-style
  relationship insight, gift suggestions, and a quick "Ask about [friend]" box
- **Profile tab** — your own profile with editable personal info and interests
- All data persists locally on-device via AsyncStorage (seeded with example
  friends so the app isn't empty on first run)

> Note: "AI insights," "AI assistant," and gift suggestions in this build are
> simple rule-based/example logic (no external API calls) so the app runs
> fully offline out of the box. Swap in a real LLM call where marked if you
> want live AI generation.

## Getting Started

```bash
npm install
npx expo start
```

Then scan the QR code with Expo Go (iOS/Android), or press `i` / `a` for a
simulator/emulator, or `w` for web.

## Project Structure

```text
App.tsx                        # Entry point — providers + navigation
src/
  types/index.ts                # Friend, Note, ImportantDate, UserProfile types
  theme/theme.ts                 # Colors, spacing, radius, typography
  data/seed.ts                   # Example friends, profile, world holidays
  utils/dateUtils.ts             # Date math (days until, relative labels, age)
  context/AppContext.tsx         # Global state + AsyncStorage persistence
  components/
    Avatar.tsx
    Chip.tsx
    Card.tsx
  screens/
    DatesScreen.tsx              # "Dates" tab
    FriendsListScreen.tsx        # "Friends" tab (list)
    FriendProfileScreen.tsx      # Friend detail (notes, dates, AI insight)
    AddFriendScreen.tsx          # Add new friend form
    ProfileScreen.tsx            # "Profile" tab
  navigation/
    RootNavigator.tsx            # Bottom tabs + stacks
```

## Tech Stack

- Expo (React Native) + TypeScript
- React Navigation (bottom tabs + native stack)
- AsyncStorage for local persistence
- @expo/vector-icons (Ionicons)

## Next Steps / Ideas to Extend

- Real device contacts + calendar sync (expo-contacts, expo-calendar)
- Push notifications for upcoming birthdays / reconnect reminders
- Real AI integration for insights & the "ask about a friend" box
- Cloud sync/auth (e.g. Supabase) so data isn't device-local only
- Photo avatars instead of emoji avatars

## Profile funksiyalari — o'rnatish qo'llanmasi

## 1. Kerakli paketlar

```bash
npx expo install expo-image-picker expo-file-system expo-contacts expo-calendar
npm install base64-arraybuffer
```

`expo-contacts` va `expo-calendar` allaqachon o'rnatilgan bo'lishi mumkin
(ContactsScreen'da ishlatilgan) — takror o'rnatish zarar qilmaydi.

## 2. app.json / app.config.js ga permission tavsiflari

```json
{
  "expo": {
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "Profil rasmini o'rnatish uchun galereyaga ruxsat kerak."
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "NSPhotoLibraryUsageDescription": "Profil rasmini o'rnatish uchun galereyaga ruxsat kerak.",
        "NSContactsUsageDescription": "Do'stlaringizni topish uchun kontaktlarga ruxsat kerak.",
        "NSCalendarsUsageDescription": "Tug'ilgan kunlarni kalendaringizga qo'shish uchun ruxsat kerak."
      }
    },
    "android": {
      "permissions": ["READ_CONTACTS", "READ_CALENDAR", "WRITE_CALENDAR"]
    }
  }
}
```

## 3. Fayllarni joylashtirish

- `001_profile_settings.sql` → Supabase SQL Editor'da ishga tushiring
  (yoki `supabase db push` orqali migratsiya sifatida).
- `mappers_additions.ts` dagi:
  - `UserProfile` / `ProfileRow` interfeyslarini `src/types.ts` dagi
    eskilari bilan **almashtiring**.
  - `profileFromRow` / `profileUpdatesToRow` funksiyalarini
    `src/utils/mappers.ts` dagi eskilari bilan **almashtiring**.
- `useProfileSettings.ts` → `src/hooks/useProfileSettings.ts` sifatida saqlang.
- `ProfileScreen.tsx` → `src/screens/ProfileScreen.tsx` ni almashtiring.

## 4. AppContext.tsx da bitta o'zgarish kerak

`profileFromRow` chaqirilayotgan ikki joyda (initial load va realtime
subscription) endi ikkinchi argument — `mfaEnabled` — talab qilinadi.
Buni context darajasida bilish shart emas; eng oddiy yechim —
`profileFromRow` ichida `mfaEnabled` ni default `false` qilib qoldirish
(mapper faylida allaqachon shunday, `= false` default bor) va uni faqat
`useProfileSettings` hook o'zi `profile.mfaEnabled` ustidan mustaqil
boshqarishi. Agar profilga chindan yozib qo'ymoqchi bo'lsangiz, eng toza
yo'l — `useProfileSettings`dagi `mfaEnabled` state'ini ProfileScreen
ichida `profile.mfaEnabled` o'rniga ishlatish. Kodni soddaligicha
saqlash uchun `ProfileScreen.tsx`da men `profile.mfaEnabled`dan
foydalandim — shuning uchun `AppContext.tsx`dagi ikkala
`profileFromRow(...)` chaqiruvini quyidagicha yangilang:

```ts
// avval:
setProfile(profileFromRow(profileRes.data as ProfileRow));
// ...
setProfile(profileFromRow(payload.new as ProfileRow));

// keyin (ikkalasida ham):
const { data: mfaData } = await supabase.auth.mfa.listFactors();
const mfaEnabled = (mfaData?.totp ?? []).some((f) => f.status === 'verified');
setProfile(profileFromRow(profileRes.data as ProfileRow, mfaEnabled));
```

Realtime callback `async` emas — uni `async (payload) => {...}` qilib
o'zgartirish kerak bo'ladi (Supabase buni qo'llab-quvvatlaydi).

## 5. Supabase Dashboard sozlamalari

- **Authentication → Providers → Email**: "Confirm email" yoqilgan bo'lsa,
  parol o'zgartirish ishlaydi (qo'shimcha sozlash shart emas).
- **Authentication → MFA**: TOTP yoqilganligini tekshiring
  (Authentication → Providers → Multi-Factor Auth → "Authenticator App"
  yoqilgan bo'lishi kerak — standart holatda yoqilgan).
- **Storage**: migratsiya `avatars` bucket'ini avtomatik yaratadi —
  qo'shimcha ish shart emas.

## 6. Muhim eslatma: `delete_own_account()` haqida

`auth.users`dan DELETE qilish odatda faqat `service_role` yoki
`supabase_auth_admin` orqali ishlaydi. Migratsiyadagi
`SECURITY DEFINER` funksiya ko'p Supabase loyihalarida ishlaydi, chunki
funksiya egasi (`postgres` roli) kerakli huquqqa ega. **Agar sizning
loyihangizda funksiya `auth.users`ni o'chira olmasa** (xatolik:
`permission denied for table users`), muqobil va tavsiya etiladigan
yechim:

1. Supabase Edge Function yarating (`supabase functions new delete-account`).
2. U yerda `service_role` key bilan `supabaseAdmin.auth.admin.deleteUser(uid)` chaqiring.
3. Client tomonda `supabase.rpc('delete_own_account')` o'rniga
   `supabase.functions.invoke('delete-account')` chaqiring.
4. SQL migratsiyadagi jadval tozalash qismini (`delete from public...`)
   shu Edge Function ichida yoki alohida `cleanup_own_data()` RPC
   sifatida saqlang.

Bu — service-role kalitni client kodiga chiqarmaslik uchun standart
Supabase tavsiyasi.

## Relatr-app: Stories + Nearby Suggestions — qo'shish qo'llanmasi

## 1. Kerakli paketlarni o'rnatish

```bash
npx expo install expo-image-picker expo-location
```

## 2. Fayllarni ko'chirish

- `screens/StoriesScreen.tsx` → `src/screens/StoriesScreen.tsx`
- `components/NearbySuggestions.tsx` → `src/components/NearbySuggestions.tsx`

## 3. Navigatsiyaga qo'shish

`RootNavigator.tsx`ga StoriesScreen uchun yangi tab yoki stack screen qo'shing:

```tsx
import StoriesScreen from '../screens/StoriesScreen';

// Tab.Navigator ichida:
<Tab.Screen name="Stories" component={StoriesScreen} />
```

## 4. NearbySuggestions'ni joylashtirish

Masalan `FriendsListScreen.tsx` yoki asosiy Home ekranining tepasiga:

```tsx
import NearbySuggestions from '../components/NearbySuggestions';

// JSX ichida, ScrollView ichida:
<NearbySuggestions />
```

## 5. app.json ga lokatsiya va media ruxsatlarini qo'shish

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Yaqin atrofdagi do'stlarni tavsiya qilish uchun joylashuvingiz kerak.",
        "NSPhotoLibraryUsageDescription": "Story qo'shish uchun galereyaga kirish kerak."
      }
    },
    "android": {
      "permissions": ["ACCESS_FINE_LOCATION", "READ_MEDIA_IMAGES"]
    }
  }
}
```

## 6. Supabase — SQL migration ishga tushirish

`sql/001_stories_and_nearby.sql` faylini Supabase SQL Editor orqali ishga tushiring
(yoki `supabase db push` orqali migration sifatida).

**Muhim:** Fayldagi `public.friendships` va `public.profiles` jadval nomlarini
o'zingizning loyihangizdagi haqiqiy nomlarga moslashtiring (masalan agar sizda
`friends` jadvali boshqacha strukturada bo'lsa).

## 7. Supabase Storage bucket yaratish (stories uchun)

Dashboard > Storage > "New bucket":

- Nomi: `story-media`
- Public: ✅ yoqilgan (yoki signed URL siyosatini o'rnating)

## 8. Google Calendar edge function

`edge-functions/google-calendar-sync/index.ts` — bu sizning mavjud edge
functionni to'liq ishlaydigan versiyasi bilan almashtiring:

```bash
supabase functions deploy google-calendar-sync
supabase secrets set GOOGLE_CALENDAR_API_KEY=<your_key>
```

Google API key olish: Google Cloud Console → APIs & Services → Credentials →
"Create API Key", so'ng "Google Calendar API"ni yoqing.

Keyin uni pg_cron orqali har kuni avtomatik ishga tushirish uchun SQL faylning
oxiridagi kommentariyadagi `cron.schedule(...)` qismini oching va
`<PROJECT_REF>` hamda service role key'ni to'g'rilang.

## 9. Eslatma: kod sifatini yaxshilash bo'yicha

DatesScreen.tsx allaqachon toza va professional yozilgan (theme tokenlari,
alohida komponentlar, realtime subscribe/cleanup to'g'ri). Stories va
Nearby qo'shimchalari xuddi shu konventsiyalarga (colors/spacing/radius/typography,
Card/Avatar/SectionHeader) mos qilib yozildi — shuning uchun loyihaga
"yot" ko'rinmaydi.

## 1. Muhim eslatma: men Sarvarbek Rakhmonjonov Relatr ga asos solgan founderman

Founder and STO: Sarvarbek Rakhmonjonov,
Co-Founder and SEO: Sardorbek Turdimurodov.

NOTE: Men Sarvarbek Rakhmonjonov Relatr companiyasini full stack developer sifatida qurishni boshladim,
loyiha asosiy g'oyasi yani dostlarni tugilgan yoki u haqidagi personal malumotlarni note qilish goyasi Sardorbek Turdimurodov
taklif qilgan edi. Bu g'oyadan ilxomlangan men 2 kun ichida loyihani toliq structurasini tuzib chiqtim va jonlashtirishni boshladim.
Founder ya'ni Sarvarbek Rakhmonjonov SEO lavozimini Sardorbek Turdimurodovga berdi va bosh moliyaviy direktor lavozimini oldi.
Kompaniyaning 50% ni hamda Co-Founder lavozi Sardorbek Turdimurodovga taqdim etildi faqat asosiy shart loyihaga kerakli barcha
harajatlarini Moliyaviy direktor sifatida 100% qoplashi kerak edi. Va Sardorbek Turdimurodov o'z ulushini loyiha aksiyalari oshganda
sotib ketishi aytdi. Va konmaniyaning 50% zi Founder Sarvarbek Rakhmonjonov uchun qoladi. Relatr 2026 yil Xiamen University Malaysia studenti orqali yaratildi.
