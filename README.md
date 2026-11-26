# ◆ acc.asis (`ACAS`) — Telegram Intelligence Bot & Mini App

**acc.asis (`ACAS`)** — talabalar, ilmiy izlanuvchilar, o‘qituvchilar va ijtimoiy faollar uchun yuzlab Telegram kanal va guruhlardagi shovqinli xabarlarni avtomatik tahlil qilib, **5 ta maxsus bo‘lim** bo‘yicha **londa insight** chiqarib beruvchi Telegram Bot va Mini App tizimi.

---

## ✨ Asosiy Imkoniyatlar va Arxitektura

1. **Telegram Bot (`/start`) + Mini App Integratsiyasi**:
   - Botga kirganda qisqa va londa tanishtiruv beradi hamda 1-bosishda **acc.asis Mini App**ni ochadi.
2. **Rasmiy Telegram Usulida Hisob Ulash va Majburiy 2FA Xavfsizligi**:
   - Foydalanuvchi telefon raqami va SMS/Telegram kod orqali hisobini ulaydi (`GramJS / MTProto`).
   - **Majburiy 2FA qoidasi**: Agar foydalanuvchining Telegram hisobida **2-bosqichli tekshiruv (2FA Cloud Password)** yoqilmagan bo‘lsa, tizim xavfsizlik sababli ulanishni darhol rad etadi. Faqat 2FA parol tasdiqlangach kanallar tahlili boshlanadi.
3. **Modulli Tezlik Boshqaruvi (ON / OFF)**:
   - Kirishda yoki yuqori paneldan kerak bo‘lmagan bo‘limlarni o‘chirib qo‘yish mumkin. O‘chirilgan bo‘limlar skanerlash va qidiruv vaqtida butunlay o‘tkazib yuboriladi (`+40%..+80%` tezroq ishlash va toza interfeys).
4. **5 ta Maxsus Insight Bo‘limi (Har biri 1-bosishda original postga yo‘naltiradi)**:
   - **1-Bo‘lim: Tadbirlar va Musobaqalar (`events`)** — Sanasi, vaqti, joyi, tashkilotchisi hamda **Zakovat**, **Debate**, **Seminar**, **Hackathon** turnirlari. Vaqt filtrlari: `1 kun`, `2–3 kun`, `1 hafta`, `1 oy`, `3–4 oy (oldindan tayyorgarlik)` va moslashtirilgan kun oralig‘i (`1–150 kun`).
   - **2-Bo‘lim: Anjuman va Ilmiy Maqolalar (`conferences`)** — Tashkilotchi bilan birga **Jurnal / To‘plam nomi**, format (`Maqola`, `Tezis`, `Avtoreferat`), to‘lov (`Tekin` / `Pulli`), qamrov (`Mahalliy`, `Mintaqaviy (Osiyo)`, `Mintaqaviy (MDH)`, `Xalqaro`), `Deadline` va **Nashr sanasi (Publish Date)** (ko‘rsatilmagan bo‘lsa avtomatik `"Berilmagan"` deb chiqadi). Shuningdek, kanallarda har oy tashlanadigan **umumiy anjumanlar ro‘yxatini (`Monthly Digest`)** o‘qib, har bir anjumanni alohida kartochkaga ajratadi.
   - **3-Bo‘lim: Volontyorlik (`volunteering`)** — Talablar, o‘tkazilish kunlari va **necha kun davom etishi**, kvota/yosh chegarasi, deadline va ro‘yxatdan o‘tish linki.
   - **4-Bo‘lim: O‘qish va Stipendiyalar (`scholarships`)** — Xalqaro `Exchange` (almashinuv), to‘liq va qisman qoplangan stipendiyalar, grantlar va summer school dasturlari.
   - **5-Bo‘lim: Tanlovlar va Mukofotlar (`competitions`)** — Qanday tartibda o‘tishi (`1. Fakultet → 2. Universitet bosqichi → 3. Respublika finali`), **pul mukofoti** miqdori va topshirilishi kerak bo‘lgan hujjatlar ro‘yxati.
5. **Telegram + Obsidian Dizayn va Visual Dashboard**:
   - Qora Obsidian (`#090B10` / `#0E1118`) va Telegram Blue (`#2AABEE`) + Violet (`#8B5CF6`) uyg‘unligi, shovqin filtrlash radari, vaqt gorizonti grafikasi va jonli **Oylik Ro‘yxat Tahlilchisi**.

---

## 🗂 Loyiha Tuzilishi (Clean Modular Architecture)

```text
d:\projects\helper.art
├── public/
│   └── acas-logo.svg                 # ACAS (acc.asis) vektor logotipi
├── src/
│   ├── components/
│   │   ├── AcasLogo.tsx              # ACAS brend komponenti
│   │   ├── TelegramAuthGate.tsx      # Raqam + Kod + Majburiy 2FA + Modul tanlash oynasi
│   │   ├── VisualDashboard.tsx       # Obsidian + Telegram analitika va Oylik Ro'yxat tahlilchisi
│   │   └── InsightCard.tsx           # 5 ta bo'lim uchun londa kartochka + manbaga 1-click o'tish
│   ├── data/
│   │   └── curatedDataset.ts         # 5 ta bo'lim va oylik anjumanlar ro'yxati namunalari
│   ├── modules/
│   │   ├── registry.ts               # 5 ta modul konfiguratsiyasi va ON/OFF tezlik hisoblagichi
│   │   ├── parserEngine.ts           # Londa insight va Oylik Anjumanlar Ro'yxati (Digest) parseri
│   │   └── __tests__/
│   │       └── parserEngine.test.ts  # Avtomatik unit testlar
│   ├── server/
│   │   ├── index.ts                  # Express API + Bot ishga tushiruvchi server
│   │   ├── auth/
│   │   │   └── gramjsAuthService.ts  # GramJS MTProto + Majburiy 2FA tekshiruvi
│   │   ├── bot/
│   │   │   └── telegramBot.ts        # GrammY Telegram Bot (/start va Mini App tugmasi)
│   │   └── db/
│   │       ├── databaseAdapter.ts    # Firebase / Supabase / Neon / In-Memory bepul DB adapteri
│   │       └── schema.sql            # Supabase va Neon PostgreSQL uchun tayyor sxema
│   ├── types/
│   │   └── acas.ts                   # Barcha bo'limlar uchun qat'iy TypeScript interfeyslari
│   ├── App.tsx                       # Asosiy Mini App interfeysi
│   └── main.tsx
├── firestore.rules                   # Firebase Firestore xavfsizlik qoidalari
├── vercel.json                       # Vercel bepul deploy konfiguratsiyasi
├── netlify.toml                      # Netlify bepul deploy konfiguratsiyasi
├── wrangler.toml                     # Cloudflare Pages bepul deploy konfiguratsiyasi
├── render.yaml                       # Render bepul Bot + API + Static deploy konfiguratsiyasi
└── .github/workflows/ci-deploy.yml   # GitHub Actions CI/CD
```

---

## 🚀 Ishga Tushirish va Bepul Deploy (Free Tier)

### 1. Lokal ishga tushirish
```bash
cp .env.example .env
npm install
npm run dev:all
```
- **Mini App (Frontend)**: `http://localhost:5173`
- **API & Telegram Bot Server**: `http://localhost:4000`

### 2. Bepul Ma'lumotlar Bazasi (Firebase / Supabase / Neon)
`.env` faylida `DB_PROVIDER` ni tanlang:
- `DB_PROVIDER=memory` — Hech qanday sozlamasiz darhol ishlaydi (Zero-config).
- `DB_PROVIDER=firebase` — **Firebase Firestore** (Spark Free Plan — tavsiya etiladi).
- `DB_PROVIDER=supabase` yoki `neon` — `src/server/db/schema.sql` faylini SQL muharririda ishga tushiring.

### 3. Bepul Hosting Platformalariga Deploy Qilish
- **Vercel / Netlify / Cloudflare Pages**: GitHub repozitoriyani ulang — `vercel.json`, `netlify.toml`, va `wrangler.toml` tayyor.
- **Render (Telegram Bot + MTProto Server uchun)**: `render.yaml` Blueprint orqali 1-bosishda bepul ishga tushadi.
