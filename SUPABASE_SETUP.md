# Relatr — Supabase + Realtime + Google Auth sozlash

Bu loyiha endi to'liq Supabase'ga ulangan: barcha ma'lumotlar (do'stlar,
eslatmalar, muhim sanalar, profil) bulutda saqlanadi, real-time
sinxronlanadi, va kirish Google orqali amalga oshiriladi.

## 1. SQL sxemani ishga tushirish

Supabase Dashboard → SQL Editor → `supabase/migrations/0001_init.sql`
faylining butun kontentini joylashtirib ishga tushiring (yoki
`supabase db push`, agar Supabase CLI ulangan bo'lsa).

Bu quyidagilarni yaratadi:

- `profiles`, `friends`, `notes`, `important_dates`, `world_holidays` jadvallari
- Har bir jadval uchun RLS (Row Level Security) policy — foydalanuvchi
  faqat o'zining ma'lumotlarini ko'radi/o'zgartiradi
- Ro'yxatdan o'tganda avtomatik `profiles` qatori yaratadigan trigger
- Barcha jadvallarni Supabase Realtime publication'iga qo'shish

## 2. `.env` faylini to'ldirish

`.env.example`'ni `.env` deb nusxalab, Supabase loyihangizning
Project Settings → API bo'limidan URL va anon key'ni joylashtiring:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## 3. Google OAuth sozlash (muhim!)

Ilova hozir Google bilan kirish uchun tayyor kod bilan keladi
(`src/context/AuthContext.tsx`), lekin ishlashi uchun 2 joyda sozlash
kerak:

### a Google Cloud Console

1. <https://console.cloud.google.com> → yangi OAuth 2.0 Client ID yarating
   (turi: **Web application** — Supabase buni server-side almashinuv
   uchun ishlatadi, native client ID shart emas)
2. Authorized redirect URI sifatida Supabase'ning callback manzilini
   qo'shing:

   ```text
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

3. Client ID va Client Secret'ni nusxalang

### b Supabase Dashboard

1. Authentication → Providers → Google → Enable qiling
2. Yuqoridagi Client ID va Client Secret'ni joylashtiring
3. Authentication → URL Configuration → **Redirect URLs** ro'yxatiga
   ilovaning deep link manzilini qo'shing:

   ```text
   relatr://auth-callback
   ```

   (bu `app.json`'dagi `"scheme": "relatr"`dan keladi)

Shundan keyin "Continue with Google" tugmasi brauzer orqali Google
login oynasini ochadi va muvaffaqiyatli kirishdan so'ng ilovaga
qaytaradi.

> Apple bilan kirish xuddi shu naqsh bo'yicha qo'shiladi
> (`supabase.auth.signInWithOAuth({ provider: 'apple' })`), lekin
> Apple Developer Program hisobi va Sign in with Apple sozlamalari
> talab qiladi — bu loyiha doirasidan tashqarida, chunki bu sizning
> Apple Developer hisobingizga bog'liq.

## 4. Ishga tushirish

```bash
npm install --legacy-peer-deps
npx expo start
```

`--legacy-peer-deps` kerak, chunki Expo SDK 51 pin qilgan
`react-native-screens@3.31.1` bilan `@react-navigation/bottom-tabs@7`
o'rtasida peer-dependency nomuvofiqligi bor (funksional emas — faqat
npm'ning versiya tekshiruvida).

## 5. Real-time qanday ishlaydi

`AppContext.tsx` endi har bir foydalanuvchi uchun `friends`, `notes`,
`important_dates`, `profiles` jadvallariga Supabase Realtime orqali
obuna bo'ladi (`postgres_changes`). Agar bir hisobga bir nechta
qurilmadan kirilsa, bitta qurilmadagi o'zgarish boshqasida darhol
(WebSocket orqali, qayta yuklamasdan) ko'rinadi.

`DatesScreen.tsx`'dagi "World" bo'limi ham xuddi shunday —
`world_holidays` jadvaliga obuna bo'lib, `google-calendar-sync` edge
function yangi bayramlarni yozganda avtomatik yangilanadi.

## 6. `google-calendar-sync` edge function'ni deploy qilish (ixtiyoriy)

Agar dunyo bayramlari (Dates → World) avtomatik yangilanib tursin
desangiz:

```bash
supabase functions deploy google-calendar-sync
supabase secrets set GOOGLE_API_KEY=your-google-api-key
```

Keyin uni cron orqali (Supabase Dashboard → Edge Functions →
Schedule, yoki tashqi cron xizmati) muntazam chaqirib turing, masalan
har kuni bir marta:

```text
