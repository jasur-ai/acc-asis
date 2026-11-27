/**
 * acc.asis (ACAS) — Real Local PC Server (http://localhost:4000) + Telegram Agent (@accass_agent)
 *
 * Features:
 * 1. Persistent MTProto StringSession saved to D:\projects\helper.art\.acas-session.json
 *    -> User stays logged in automatically until they explicitly click "Log Out" in Profil!
 * 2. Automatic Telegram Chat Folders (Api.messages.GetDialogFilters) & Channel Scanner
 *    -> User can scan ALL chats/channels, or select 1 / multiple Chat Folders in Profil.
 * 3. Reads messages from selected folders/channels one by one and extracts structured insights.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

// 1. Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      const v = t.slice(eqIdx(t));
      if (!process.env[k]) process.env[k] = trimmedVal(t, eq);
    }
  }
}
function eqIdx(s) { return s.indexOf('=') + 1; }
function trimmedVal(s, eq) { return s.slice(eq + 1).trim(); }

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9255052797:AAGxcxThaNc7NZqPZh0OD79rZL-Ibi8clrs';
const ADMIN_TELEGRAM_ID = '8004724563';
const SERVER_STARTED_AT = Date.now();
const PUBLIC_MINI_APP_URL =
  process.env.MINI_APP_URL && process.env.MINI_APP_URL.startsWith('https://')
    ? process.env.MINI_APP_URL
    : 'https://acc-asis.vercel.app';

const USERS_DB_FILE = path.resolve(process.cwd(), '.acas-users-db.json');
const LEGACY_SESSION_FILE = path.resolve(process.cwd(), '.acas-session.json');
const LEGACY_BACKUP_FILE = path.resolve(process.cwd(), '.acas-session.backup.json');

// Copy study-desk welcome photo to public/bot-banner.jpg
const bannerDest = path.resolve(process.cwd(), 'public/bot-banner.jpg');
const newWelcomeImg =
  'C:/Users/jasur/.gemini/antigravity/brain/a9daa273-b844-4f27-9658-ea1da06e5e5d/.user_uploaded/media_1795680230265_eff39717.jpg';
if (fs.existsSync(newWelcomeImg)) {
  try {
    fs.copyFileSync(newWelcomeImg, bannerDest);
  } catch {}
}

// Multi-User Isolated Session Store + Admin Telemetry (Admin ID: 8004724563)
function loadAllUsersDb() {
  if (!fs.existsSync(USERS_DB_FILE)) {
    return { users: {}, botVisitors: {}, dailyActivity: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS_DB_FILE, 'utf8'));
    return {
      users: parsed && typeof parsed.users === 'object' ? parsed.users : {},
      botVisitors: parsed && typeof parsed.botVisitors === 'object' ? parsed.botVisitors : {},
      dailyActivity: parsed && typeof parsed.dailyActivity === 'object' ? parsed.dailyActivity : {},
    };
  } catch {
    return { users: {}, botVisitors: {}, dailyActivity: {} };
  }
}

function saveAllUsersDb(db) {
  try {
    fs.writeFileSync(USERS_DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Users DB save error:', e.message);
  }
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function recordBotVisitor(fromUser) {
  if (!fromUser || !fromUser.id) return { startsCount: 1, isFirstStart: true };
  const db = loadAllUsersDb();
  const id = String(fromUser.id);
  const prev = db.botVisitors[id] || {};
  const prevCount = Number(prev.startsCount || 0);
  const nextCount = prevCount + 1;
  db.botVisitors[id] = {
    telegramId: id,
    firstName: [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi',
    username: fromUser.username || prev.username || '',
    firstSeenAt: prev.firstSeenAt || Date.now(),
    lastSeenAt: Date.now(),
    startsCount: nextCount,
  };
  saveAllUsersDb(db);
  return {
    ...db.botVisitors[id],
    isFirstStart: prevCount === 0,
  };
}

function recordScanTelemetry(userKey, messagesRead, insightsFound, elapsedMs) {
  const db = loadAllUsersDb();
  const tk = todayKey();
  const dayRec = db.dailyActivity[tk] || {
    scans: 0,
    messagesRead: 0,
    insightsFound: 0,
    activeUserKeys: [],
  };
  dayRec.scans = (dayRec.scans || 0) + 1;
  dayRec.messagesRead = (dayRec.messagesRead || 0) + messagesRead;
  dayRec.insightsFound = (dayRec.insightsFound || 0) + insightsFound;
  if (userKey && !dayRec.activeUserKeys.includes(userKey)) {
    dayRec.activeUserKeys.push(userKey);
  }
  db.dailyActivity[tk] = dayRec;

  if (userKey && db.users[userKey]) {
    db.users[userKey].scansCount = (db.users[userKey].scansCount || 0) + 1;
    db.users[userKey].lastScanElapsedMs = elapsedMs;
    db.users[userKey].updatedAt = Date.now();
  }
  saveAllUsersDb(db);
}

function checkIsAdminRecord(userKey, record) {
  const rawKeyId = String(userKey || '').replace(/^tg_/, '').trim();
  const recTgId = String(record?.session?.telegramId || '').trim();
  return rawKeyId === ADMIN_TELEGRAM_ID || recTgId === ADMIN_TELEGRAM_ID;
}

function loadUserSession(userKey, _clientSecret = '', incomingSessionString = '') {
  const db = loadAllUsersDb();
  if (userKey && db.users[userKey] && db.users[userKey].sessionString) {
    if (!revokedTokensSet.has(db.users[userKey].sessionString)) {
      return db.users[userKey];
    }
  }
  // Agar foydalanuvchi Telegram Mini App ichidan (tg_<id>) kirgan bo'lsa, telegramId bo'yicha ham qidiramiz
  if (userKey && userKey.startsWith('tg_')) {
    const rawTgId = userKey.replace(/^tg_/, '').trim();
    const byTgId = Object.values(db.users).find(
      (u) =>
        u &&
        u.sessionString &&
        !revokedTokensSet.has(u.sessionString) &&
        String(u.session?.telegramId || '') === rawTgId
    );
    if (byTgId) {
      db.users[userKey] = { ...byTgId, userKey };
      saveAllUsersDb(db);
      return db.users[userKey];
    }
  }
  // Agar foydalanuvchi o'z sessionString kalitini yuborgan bo'lsa, bazadan shu sessionString bo'yicha topib userKey'ga bog'laymiz
  if (incomingSessionString && incomingSessionString.length > 20 && !revokedTokensSet.has(incomingSessionString)) {
    const match = Object.values(db.users).find((u) => u && u.sessionString === incomingSessionString);
    if (match) {
      if (userKey) {
        db.users[userKey] = { ...match, userKey };
        saveAllUsersDb(db);
      }
      return match;
    }
  }
  // Lokal kompyuterda (localhost:4000) bitta foydalanuvchi ishlaganda userKey o'zgarsa ham mavjud lokal sessiyani yo'qotmaymiz
  if (!process.env.RENDER) {
    const allLocalUsers = Object.values(db.users).filter(
      (u) => u && u.sessionString && !revokedTokensSet.has(u.sessionString)
    );
    if (allLocalUsers.length >= 1) {
      const single = allLocalUsers[0];
      if (userKey && !db.users[userKey]) {
        db.users[userKey] = { ...single, userKey };
        saveAllUsersDb(db);
      }
      return single;
    }
    for (const legacyFile of [LEGACY_SESSION_FILE, LEGACY_BACKUP_FILE]) {
      if (fs.existsSync(legacyFile)) {
        try {
          const leg = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
          if (leg && leg.sessionString && !revokedTokensSet.has(leg.sessionString)) {
            if (userKey) {
              db.users[userKey] = { ...leg, userKey };
              saveAllUsersDb(db);
            }
            return leg;
          }
        } catch {}
      }
    }
  }
  return null;
}

function saveUserSession(userKey, data) {
  if (!userKey || !data || !data.sessionString) return;
  const db = loadAllUsersDb();
  const prev = db.users[userKey] || {};
  db.users[userKey] = {
    ...prev,
    ...data,
    createdAt: prev.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  saveAllUsersDb(db);
}

const revokedTokensSet = new Set([
  '1AgAOMTQ5LjE1NC4xNjcuNTABuy0fJV5Rujc3G0jg6T0EkfbhpquW1A+doPKxgy0OkaEvInhLAKnBLsmQiZab8X6MrhCe9X21D9B3/2fLdvAFe0UMfHWRTcDvP0y7ZzTMsYhmmqalRe5p9CdQetfzs9/7DeFBbH791Lce7fg5WcCTr21bu0yfozdOfPCHsNyJFPbukexhIQAmYjkDFkcrHsb/Fsz/eMV/D7xwMPpql0fEJ9sstHZ3VtYe4DSpv7QdcfVJ/Vm7U/kgCbNNxclCXqt7T+2UgIibFRnSXA8j5RCEH1+UEEZNSEB9LE6h63deeHId+L37uzlBtsm+RP/i+U3biWn9RlDvumF91DNZ1X4SwSo=',
]);

function isAuthKeyUnregisteredError(err) {
  const msg = String(err?.errorMessage || err?.message || err || '');
  return (
    msg.includes('AUTH_KEY_UNREGISTERED') ||
    msg.includes('AUTH_KEY_DUPLICATED') ||
    msg.includes('SESSION_REVOKED') ||
    msg.includes('USER_DEACTIVATED')
  );
}

async function purgeDeadSessionToken(deadToken) {
  if (!deadToken) return;
  revokedTokensSet.add(deadToken);
  for (const [k, conn] of userClientsMap.entries()) {
    if (conn && conn.sessionString === deadToken) {
      try {
        await conn.client?.disconnect?.();
      } catch {}
      userClientsMap.delete(k);
    }
  }
  const db = loadAllUsersDb();
  let changed = false;
  for (const [uk, rec] of Object.entries(db.users || {})) {
    if (rec && rec.sessionString === deadToken) {
      delete db.users[uk];
      changed = true;
    }
  }
  if (changed) saveAllUsersDb(db);
  for (const legacyFile of [LEGACY_SESSION_FILE, LEGACY_BACKUP_FILE]) {
    if (fs.existsSync(legacyFile)) {
      try {
        const leg = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
        if (leg && leg.sessionString === deadToken) {
          fs.writeFileSync(legacyFile, '{}', 'utf8');
        }
      } catch {}
    }
  }
}

function clearUserSession(userKey, extra = {}) {
  const { sessionString = '', telegramId = '' } = extra;
  const db = loadAllUsersDb();
  const deadTokens = new Set();
  const keysToDelete = new Set();

  if (userKey) keysToDelete.add(userKey);
  if (telegramId) keysToDelete.add(`tg_${telegramId}`);
  if (sessionString) deadTokens.add(sessionString);

  for (const [uk, rec] of Object.entries(db.users || {})) {
    if (!rec) continue;
    const recTgId = String(rec.session?.telegramId || '');
    const isMatch =
      keysToDelete.has(uk) ||
      (telegramId && recTgId === String(telegramId)) ||
      (sessionString && rec.sessionString === sessionString) ||
      !process.env.RENDER;
    if (isMatch) {
      if (rec.sessionString) deadTokens.add(rec.sessionString);
      keysToDelete.add(uk);
    }
  }

  let changed = false;
  for (const uk of keysToDelete) {
    if (db.users[uk]) {
      delete db.users[uk];
      changed = true;
    }
  }
  if (changed) saveAllUsersDb(db);

  for (const dt of deadTokens) {
    if (dt) purgeDeadSessionToken(dt);
  }

  if (!process.env.RENDER) {
    for (const legacyFile of [LEGACY_SESSION_FILE, LEGACY_BACKUP_FILE]) {
      if (fs.existsSync(legacyFile)) {
        try {
          fs.writeFileSync(legacyFile, '{}', 'utf8');
        } catch {}
      }
    }
  }
}

// 2. Live-Reload SSE clients
const sseClients = new Set();
const publicDir = path.resolve(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  let debounceTimer = null;
  fs.watch(publicDir, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      for (const clientRes of sseClients) {
        try {
          clientRes.write(`data: reload\n\n`);
        } catch {
          sseClients.delete(clientRes);
        }
      }
    }, 80);
  });
}

// 3. Telegram Agent Polling (@accass_agent) — Non-blocking, Timeout-Safe & Smart Short /start
let lastUpdateId = 0;
let lastBotPollAt = 0;
let cachedBannerFileId = '';

async function tgApiCall(tgBase, method, payload = null, timeoutMs = 10000) {
  try {
    const opts = {
      method: payload ? 'POST' : 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (payload) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(payload);
    }
    const res = await fetch(`${tgBase}/${method}`, opts);
    return await res.json();
  } catch (e) {
    return { ok: false, description: e.message };
  }
}

async function sendFullWelcomeWithPhoto(tgBase, chatId, safeName, replyMarkup) {
  const fullWelcomeHtml = [
    `<b>acc.asis — Telegram Insight Agent</b>`,
    ``,
    `Salom, <b>${safeName}</b>. Agent hisobingizdagi kanallarni tahlil qilib, 5 ta yo‘nalishda faqat <b>londa insightlarni</b> ajratib beradi:`,
    `• <b>Tadbirlar va Musobaqalar</b> (Zakovat, Debate, Forum)`,
    `• <b>Ilmiy Anjuman va Maqolalar</b> (Jurnal, Tezis, Oylik ro‘yxat)`,
    `• <b>Volontyorlik, Stipendiyalar va Tanlovlar</b>`,
    ``,
    `Hisobni ulash uchun Telegramingizda <b>2FA parol</b> yoqilgan bo‘lishi shart.`,
  ].join('\n');

  let sentPhotoOk = false;

  // 1. Eng tez usul: keshdagi Telegram file_id yoki Vercel CDN URL orqali yuborish (<80ms)
  const fastPhotoRef = cachedBannerFileId || `${PUBLIC_MINI_APP_URL}/bot-banner.jpg`;
  const fastRes = await tgApiCall(
    tgBase,
    'sendPhoto',
    {
      chat_id: chatId,
      photo: fastPhotoRef,
      caption: fullWelcomeHtml,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    },
    8000
  );
  if (fastRes?.ok) {
    sentPhotoOk = true;
    const photos = fastRes.result?.photo;
    if (Array.isArray(photos) && photos.length > 0) {
      cachedBannerFileId = photos[photos.length - 1].file_id || cachedBannerFileId;
    }
  }

  // 2. Agar CDN rasm hali keshda bo'lmasa, lokal diskdan yuboramiz (8s timeout bilan)
  if (!sentPhotoOk && fs.existsSync(bannerDest)) {
    try {
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('caption', fullWelcomeHtml);
      form.append('parse_mode', 'HTML');
      form.append('reply_markup', JSON.stringify(replyMarkup));
      const imgBuffer = fs.readFileSync(bannerDest);
      form.append(
        'photo',
        new Blob([imgBuffer], { type: 'image/jpeg' }),
        'acc-asis-welcome.jpg'
      );
      const photoRes = await fetch(`${tgBase}/sendPhoto`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(8000),
      });
      const photoJson = await photoRes.json();
      if (photoJson?.ok) {
        sentPhotoOk = true;
        const photos = photoJson.result?.photo;
        if (Array.isArray(photos) && photos.length > 0) {
          cachedBannerFileId = photos[photos.length - 1].file_id || cachedBannerFileId;
        }
      }
    } catch {}
  }

  if (!sentPhotoOk) {
    await tgApiCall(tgBase, 'sendMessage', {
      chat_id: chatId,
      text: fullWelcomeHtml,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
  }
}

async function handleBotUpdate(tgBase, upd) {
  const fullReplyMarkup = {
    inline_keyboard: [
      [
        {
          text: 'acc.asis Mini Appni Ochish',
          web_app: { url: PUBLIC_MINI_APP_URL },
        },
      ],
      [
        { text: '5 ta Yo‘nalish', callback_data: 'show_modules' },
        { text: '2FA Qoidasi', callback_data: 'show_security' },
      ],
    ],
  };

  const shortReplyMarkup = {
    inline_keyboard: [
      [
        {
          text: 'acc.asis Mini Appni Ochish',
          web_app: { url: PUBLIC_MINI_APP_URL },
        },
      ],
      [
        { text: '5 ta Yo‘nalish', callback_data: 'show_modules' },
        { text: 'Batafsil Tanishtiruv', callback_data: 'show_full_intro' },
      ],
    ],
  };

  const msg = upd.message;
  if (msg && typeof msg.text === 'string') {
    const text = msg.text.trim();
    const cmd = text.split(/\s+/)[0].split('@')[0].toLowerCase();
    const arg = (text.split(/\s+/)[1] || '').toLowerCase();
    const chatId = msg.chat.id;
    const rawName = msg.from?.first_name || 'Foydalanuvchi';
    const safeName = String(rawName).replace(/[<>&]/g, '');

    if (cmd === '/start') {
      const visitor = recordBotVisitor(msg.from);
      const forceFirst = arg === 'first' || arg === 'full' || arg === 'intro';

      if (visitor.isFirstStart || forceFirst) {
        // 1-marta /start bosilganda: Rasm bilan to'liq tanishtiruv
        await sendFullWelcomeWithPhoto(tgBase, chatId, safeName, fullReplyMarkup);
      } else {
        // Keyingi /start larda: Rasmsiz, londa va qisqa xabar!
        const shortWelcomeHtml = [
          `<b>acc.asis — Insight Agent tayyor, ${safeName}.</b>`,
          `Kanallaringizdagi saralangan e’lonlarni ko‘rish va boshqarish uchun Mini Appni oching:`,
        ].join('\n');

        await tgApiCall(tgBase, 'sendMessage', {
          chat_id: chatId,
          text: shortWelcomeHtml,
          parse_mode: 'HTML',
          reply_markup: shortReplyMarkup,
        });
      }
      return;
    }

    if (cmd === '/app' || cmd === '/panel' || cmd === '/open') {
      await tgApiCall(tgBase, 'sendMessage', {
        chat_id: chatId,
        text: `<b>acc.asis Mini App</b> — Barcha saralangan e’lonlar va papka sozlamalari:`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'acc.asis Mini Appni Ochish', web_app: { url: PUBLIC_MINI_APP_URL } }],
          ],
        },
      });
      return;
    }

    if (cmd === '/modules') {
      await tgApiCall(tgBase, 'sendMessage', {
        chat_id: chatId,
        text: [
          `<b>acc.asis — 5 ta Yo‘nalish</b>`,
          `1. Tadbirlar va Musobaqalar (Zakovat, Debate, Forum)`,
          `2. Ilmiy Anjuman va Maqolalar (Jurnal, Tezis, Oylik ro‘yxat)`,
          `3. Volontyorlik`,
          `4. Stipendiya va Exchange grantlar`,
          `5. Tanlovlar`,
          ``,
          `Profil bo‘limida keraksiz yo‘nalishni OFF qilib qo‘yishingiz mumkin.`,
        ].join('\n'),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Bo‘limlarni Sozlash (Mini App)', web_app: { url: PUBLIC_MINI_APP_URL } }],
          ],
        },
      });
      return;
    }

    if (cmd === '/security' || cmd === '/2fa') {
      await tgApiCall(tgBase, 'sendMessage', {
        chat_id: chatId,
        text: `<b>Majburiy 2FA Xavfsizlik Standarti</b>\n\n• <b>acc.asis</b> rasmiy Telegram MTProto orqali ishlaydi.\n• Hisobingizda <b>2-bosqichli tekshiruv (2FA Cloud Password)</b> yoqilgan bo‘lishi shart.`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '2FA Bilan Hisobni Ulash', web_app: { url: PUBLIC_MINI_APP_URL } }],
          ],
        },
      });
      return;
    }

    if (cmd === '/stats' || cmd === '/admin') {
      const senderId = String(msg.from?.id || '');
      if (senderId !== ADMIN_TELEGRAM_ID) {
        await tgApiCall(tgBase, 'sendMessage', {
          chat_id: chatId,
          text: `Ushbu buyruq faqat Admin (ID: 8004724563) uchun.`,
          parse_mode: 'HTML',
        });
        return;
      }
      const db = loadAllUsersDb();
      const usersCount = Object.values(db.users || {}).filter((u) => u && u.session).length;
      const visitorsCount = Object.keys(db.botVisitors || {}).length;
      await tgApiCall(tgBase, 'sendMessage', {
        chat_id: chatId,
        text: [
          `<b>acc.asis — Admin Tezkor Statistika</b>`,
          `• Ulangan hisoblar: <b>${usersCount} ta</b>`,
          `• Agent foydalanuvchilari: <b>${ Math.max(visitorsCount, usersCount) } kishi</b>`,
          `• Online MTProto sessiyalar: <b>${userClientsMap.size} ta</b>`,
          ``,
          `To‘liq grafik va jadvallarni Mini App ichidagi <b>Statistika</b> tugmasi orqali ko‘ring:`,
        ].join('\n'),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Admin Statistikani Ochish', web_app: { url: PUBLIC_MINI_APP_URL } }],
          ],
        },
      });
      return;
    }

    if (cmd === '/help') {
      await tgApiCall(tgBase, 'sendMessage', {
        chat_id: chatId,
        text: [
          `<b>acc.asis — Agent Buyruqlari</b>`,
          `• /start — Agentni ishga tushirish`,
          `• /app — Mini Appni darhol ochish`,
          `• /modules — 5 ta yo‘nalish haqida`,
          `• /security — 2FA xavfsizlik qoidasi`,
          `• /help — Yordam oynasi`,
        ].join('\n'),
        parse_mode: 'HTML',
        reply_markup: shortReplyMarkup,
      });
      return;
    }
  }

  if (upd.callback_query) {
    const cq = upd.callback_query;
    const chatId = cq.message?.chat?.id;
    const rawName = cq.from?.first_name || 'Foydalanuvchi';
    const safeName = String(rawName).replace(/[<>&]/g, '');

    await tgApiCall(tgBase, 'answerCallbackQuery', { callback_query_id: cq.id }, 5000);

    if (chatId && cq.data === 'show_full_intro') {
      await sendFullWelcomeWithPhoto(tgBase, chatId, safeName, fullReplyMarkup);
    } else if (chatId && cq.data === 'show_modules') {
      await tgApiCall(tgBase, 'sendMessage', {
        chat_id: chatId,
        text: `<b>Modulli Arxitektura (Tezlik va Qulaylik)</b>\n\nProfil bo‘limida o‘zingizga kerak bo‘lmagan yo‘nalishlarni o‘chirib qo‘yishingiz yoki faqat kerakli Chat Folder (papka)larni tanlashingiz mumkin.`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Bo‘limlarni Sozlash (Mini App)',
                web_app: { url: PUBLIC_MINI_APP_URL },
              },
            ],
          ],
        },
      });
    } else if (chatId && cq.data === 'show_security') {
      await tgApiCall(tgBase, 'sendMessage', {
        chat_id: chatId,
        text: `<b>Majburiy 2FA Xavfsizlik Standarti</b>\n\n• <b>acc.asis</b> rasmiy Telegram MTProto orqali ishlaydi.\n• Hisobingizda <b>2-bosqichli tekshiruv (2FA Cloud Password)</b> yoqilgan bo‘lishi shart.`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '2FA Bilan Hisobni Ulash',
                web_app: { url: PUBLIC_MINI_APP_URL },
              },
            ],
          ],
        },
      });
    }
  }
}

async function pollTelegramBot() {
  const tgBase = `https://api.telegram.org/bot${BOT_TOKEN}`;
  try {
    await tgApiCall(tgBase, 'deleteWebhook', { drop_pending_updates: false }, 6000);

    const meData = await tgApiCall(tgBase, 'getMe', null, 6000);
    if (meData.ok) {
      console.log(`✅ [@${meData.result.username}] Telegram Agent jonli ulandi!`);
    }

    const preStartDescription = [
      'acc.asis — Shaxsiy Telegram Insight Agent.',
      '',
      'Kanallaringizdagi minglab xabarlar ichidan faqat kerakli e’lonlarni 5 ta yo‘nalishda londa ajratib beradi:',
      '• Tadbirlar, Zakovat va Debate',
      '• Ilmiy Maqolalar, Jurnallar va Oylik Anjumanlar',
      '• Volontyorlik, Xalqaro Stipendiyalar va Tanlovlar',
      '',
      'Xavfsizlik uchun 2FA yoqilgan bo‘lishi shart. Boshlash uchun START bosing.',
    ].join('\n');

    await Promise.allSettled([
      tgApiCall(tgBase, 'setMyDescription', { description: preStartDescription }),
      tgApiCall(tgBase, 'setMyShortDescription', {
        short_description:
          'acc.asis — Tadbirlar, ilmiy maqolalar, volontyorlik, stipendiya va tanlovlarni kanallaringizdan londa ajratuvchi AI Agent.',
      }),
      tgApiCall(tgBase, 'setMyCommands', {
        commands: [
          { command: 'start', description: 'Agentni ishga tushirish' },
          { command: 'app', description: 'acc.asis Mini Appni ochish' },
          { command: 'modules', description: '5 ta yo‘nalish haqida' },
          { command: 'security', description: '2FA xavfsizlik qoidasi' },
          { command: 'help', description: 'Yordam va barcha buyruqlar' },
        ],
      }),
    ]);
  } catch (e) {
    console.error('Agent init xatosi:', e.message);
  }

  while (true) {
    try {
      lastBotPollAt = Date.now();
      const res = await fetch(
        `${tgBase}/getUpdates?offset=${lastUpdateId + 1}&timeout=15`,
        { signal: AbortSignal.timeout(20000) }
      );
      const data = await res.json();
      lastBotPollAt = Date.now();

      if (!data.ok) {
        if (data.error_code === 409) {
          await tgApiCall(tgBase, 'deleteWebhook', { drop_pending_updates: false }, 5000);
        }
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }

      if (Array.isArray(data.result)) {
        for (const upd of data.result) {
          lastUpdateId = upd.update_id;
          // Har bir xabarni bloklamasdan (async) qayta ishlaymiz — polling sikli HECH QACHON qotib qolmaydi!
          handleBotUpdate(tgBase, upd).catch((err) =>
            console.error('Bot update handler note:', err?.message || err)
          );
        }
      }
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

// 4. Real GramJS MTProto Loader + Multi-User Isolated Caches
let gramJsModule = null;
const clientMap = new Map(); // pending login: `${userKey}:${phone}` -> { client, phoneCodeHash }
const userClientsMap = new Map(); // userKey -> { client, sessionString }
const userFolderCacheMap = new Map(); // userKey -> { ts, data }
const userChannelHistoryCache = new Map(); // `${userKey}:${chatId}` -> { ts, msgs }

function clearUserMemoryCaches(userKey) {
  if (!userKey) return;
  userFolderCacheMap.delete(userKey);
  for (const k of userChannelHistoryCache.keys()) {
    if (k.startsWith(`${userKey}:`)) userChannelHistoryCache.delete(k);
  }
}

async function getGramJs() {
  if (gramJsModule) return gramJsModule;
  const searchBases = [
    path.resolve(process.cwd(), '.mtproto/node_modules/telegram'),
    path.resolve(process.cwd(), 'node_modules/telegram'),
  ];
  for (const base of searchBases) {
    if (fs.existsSync(base)) {
      try {
        const { pathToFileURL } = await import('url');
        const tg = await import(pathToFileURL(path.join(base, 'index.js')).href);
        const sessions = await import(pathToFileURL(path.join(base, 'sessions/index.js')).href);
        const pwd = await import(pathToFileURL(path.join(base, 'Password.js')).href);
        gramJsModule = {
          ...(tg.default || tg),
          ...tg,
          ...(sessions.default || sessions),
          ...sessions,
          ...(pwd.default || pwd),
          ...pwd,
        };
        return gramJsModule;
      } catch (err) {
        console.error('GramJS load error:', err.message);
      }
    }
  }
  return null;
}

/**
 * Reconnects the specific user's saved StringSession (strictly isolated per userKey!)
 */
async function getOrRestoreAuthenticatedClient(userKey, clientSecret = '', incomingSessionString = '', incomingSessionMeta = null) {
  if (!userKey) return null;

  let saved = loadUserSession(userKey, clientSecret, incomingSessionString);
  const candidateToken = String(incomingSessionString || saved?.sessionString || '').trim();
  if (!candidateToken || candidateToken.length < 20 || revokedTokensSet.has(candidateToken)) {
    if (revokedTokensSet.has(candidateToken)) {
      await purgeDeadSessionToken(candidateToken);
    }
    return null;
  }

  const existingConn = userClientsMap.get(userKey);
  if (existingConn && existingConn.client && existingConn.sessionString === candidateToken) {
    try {
      if (existingConn.client.connected) return existingConn.client;
      await existingConn.client.connect();
      return existingConn.client;
    } catch (e) {
      if (isAuthKeyUnregisteredError(e)) {
        await purgeDeadSessionToken(candidateToken);
        return null;
      }
    }
    userClientsMap.delete(userKey);
  }

  // Agar ayni shu sessionString boshqa userKey ostida allaqachon ulangan bo'lsa, ikkinchi TelegramClient yaratmaymiz (MTProto to'qnashmasligi uchun)!
  for (const [, conn] of userClientsMap.entries()) {
    if (conn && conn.client && conn.sessionString === candidateToken) {
      try {
        if (!conn.client.connected) await conn.client.connect();
        userClientsMap.set(userKey, conn);
        return conn.client;
      } catch (e) {
        if (isAuthKeyUnregisteredError(e)) {
          await purgeDeadSessionToken(candidateToken);
          return null;
        }
      }
    }
  }

  // If server restarted or updated and this user sent their own valid sessionString, restore their record!
  if (!saved || !saved.sessionString) {
    saved = {
      authenticated: true,
      userKey,
      clientSecret: clientSecret || `sec_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      sessionString: candidateToken,
      session: incomingSessionMeta || { phoneNumber: 'Ulangan hisob', firstName: 'Profil', twoFactorVerified: true },
      folders: [],
      chats: [],
      selectedFolderIds: ['all'],
    };
    saveUserSession(userKey, saved);
  }

  const g = await getGramJs();
  if (!g) return null;

  try {
    const apiId = Number(process.env.TELEGRAM_API_ID || 2040);
    const apiHash = process.env.TELEGRAM_API_HASH || 'b18441a1ff607e10a989891a5462e627';
    const client = new g.TelegramClient(
      new g.StringSession(candidateToken),
      apiId,
      apiHash,
      {
        connectionRetries: 5,
        deviceModel: 'acc.asis Multi-User Agent',
        systemVersion: 'Windows 11',
        appVersion: '4.16.8 x64',
        langCode: 'en',
        systemLangCode: 'en-US',
      }
    );
    await client.connect();

    // Haqiqatan ham AUTH_KEY tirik ekanligini getMe() orqali tekshiramiz; agar AUTH_KEY_UNREGISTERED bo'lsa darhol tozalaymiz!
    try {
      const me = await client.getMe();
      if (me) {
        const tgId = String(me.id || '').replace(/^-/, '').trim();
        const isAdmin = tgId === ADMIN_TELEGRAM_ID || String(userKey).replace(/^tg_/, '') === ADMIN_TELEGRAM_ID;
        saved.session = {
          ...saved.session,
          telegramId: tgId,
          isAdmin,
          phoneNumber: saved.session?.phoneNumber || (me.phone ? `+${me.phone}` : '2FA Hisob'),
          firstName: [me.firstName, me.lastName].filter(Boolean).join(' ') || 'Profil',
          username: me.username || '',
          twoFactorVerified: true,
        };
        saveUserSession(userKey, saved);
      }
    } catch (authErr) {
      if (isAuthKeyUnregisteredError(authErr)) {
        console.warn(`⚠️ [MTProto | ${userKey}] AUTH_KEY_UNREGISTERED — eski sessiya kaliti Telegram tomonidan bekor qilingan. Tozalanmoqda...`);
        try { await client.disconnect(); } catch {}
        await purgeDeadSessionToken(candidateToken);
        return null;
      }
    }

    userClientsMap.set(userKey, { client, sessionString: candidateToken });
    return client;
  } catch (e) {
    if (isAuthKeyUnregisteredError(e)) {
      await purgeDeadSessionToken(candidateToken);
    }
    console.error(`Restore session note [${userKey}]:`, e.message);
    return null;
  }
}

// 5. Real Text & Monthly Conference Digest Parser
function parseDigestOrMessage(
  text,
  channelHandle = 'ilm_fan_anjumanlar_uz',
  channelTitle = 'Telegram Kanal',
  messageId = 5100,
  enabledModules = {
    events: true,
    conferences: true,
    volunteering: true,
    scholarships: true,
    competitions: true,
  }
) {
  const cleanText = (text || '').trim();
  if (!cleanText || cleanText.length < 30) return [];

  const lower = cleanText.toLowerCase();

  // Monthly Conference Digest List
  const blocks = cleanText
    .split(/(?=(?:^|\n)\s*\d+[\.\)]\s+)/g)
    .map((b) => b.trim())
    .filter((b) => /^\d+[\.\)]\s+/.test(b));

  if (
    enabledModules.conferences &&
    blocks.length >= 2 &&
    (lower.includes('anjuman') || lower.includes('konferensiya') || lower.includes('maqola'))
  ) {
    return blocks.map((block, idx) => {
      const clean = block.replace(/^\d+[\.\)]\s+/, '').trim();
      const title = clean.split('\n')[0].replace(/^[«"']|[»"']$/g, '');
      const bLower = clean.toLowerCase();
      const journal =
        (clean.match(/(?:Jurnal|To['‘]plam)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Berilmagan';
      const org =
        (clean.match(/(?:Tashkilotchi|OTM|Muassasa)\s*[:\-–]\s*([^\n]+)/i) || [])[1] ||
        channelTitle;
      const deadline =
        (clean.match(/(?:Muddat|Deadline)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Berilmagan';
      const publish =
        (clean.match(/(?:Nashr|Publish)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Berilmagan';
      const isFree = bLower.includes('bepul') || bLower.includes('tekin');
      const feeVal =
        (clean.match(/To['‘]lov\s*[:\-–]\s*([^\n]+)/i) || [])[1] || (isFree ? 'Bepul' : 'Pulli');
      const scope = bLower.includes('osiyo')
        ? 'Mintaqaviy (Osiyo)'
        : bLower.includes('xalqaro')
        ? 'Xalqaro'
        : 'Mahalliy';
      const fmt = bLower.includes('avtoreferat')
        ? 'Avtoreferat'
        : bLower.includes('tezis')
        ? 'Tezis'
        : 'Maqola';

      return {
        id: `digest-${channelHandle}-${messageId}-${idx}`,
        moduleId: 'conferences',
        title,
        insight: `${org.trim()} • ${fmt} (${scope}, ${isFree ? 'Tekin' : 'Pulli'})`,
        organizer: org.trim(),
        journalName: journal.trim(),
        submissionType: fmt,
        feeType: isFree ? 'Tekin' : 'Pulli',
        feeAmount: feeVal.trim(),
        scope,
        deadlineFormatted: deadline.trim(),
        publishDate: publish.trim(),
        extractedFromDigest: true,
        daysRemaining: 14 + idx * 5,
        channelHandle,
        channelTitle,
        sourceUrl: `https://t.me/${channelHandle.replace(/^@/, '')}/${messageId}`,
      };
    });
  }

  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = lines[0]?.slice(0, 95) || 'E’lon';
  const insight = lines.slice(1).join(' ').slice(0, 125) || title;
  const deadline =
    (cleanText.match(/(?:Muddat|Deadline|Sana)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Berilmagan';
  const publish =
    (cleanText.match(/(?:Nashr|Publish)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Berilmagan';

  if (
    enabledModules.conferences &&
    (lower.includes('anjuman') ||
      lower.includes('konferensiya') ||
      lower.includes('maqola') ||
      lower.includes('tezis') ||
      lower.includes('avtoreferat'))
  ) {
    const journal =
      (cleanText.match(/(?:Jurnal|To['‘]plam)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Berilmagan';
    const isFree = lower.includes('bepul') || lower.includes('tekin');
    return [
      {
        id: `conf-${channelHandle}-${messageId}`,
        moduleId: 'conferences',
        title,
        insight,
        organizer: channelTitle,
        journalName: journal.trim(),
        submissionType: lower.includes('avtoreferat')
          ? 'Avtoreferat'
          : lower.includes('tezis')
          ? 'Tezis'
          : 'Maqola',
        feeType: isFree ? 'Tekin' : 'Pulli',
        feeAmount: isFree ? 'Bepul' : 'Pulli',
        scope: lower.includes('osiyo')
          ? 'Mintaqaviy (Osiyo)'
          : lower.includes('xalqaro')
          ? 'Xalqaro'
          : 'Mahalliy',
        deadlineFormatted: deadline.trim(),
        publishDate: publish.trim(),
        extractedFromDigest: false,
        daysRemaining: 10,
        channelHandle,
        channelTitle,
        sourceUrl: `https://t.me/${channelHandle.replace(/^@/, '')}/${messageId}`,
      },
    ];
  }

  if (
    enabledModules.volunteering &&
    (lower.includes('volontyor') || lower.includes('volunteer') || lower.includes('ko‘ngilli'))
  ) {
    return [
      {
        id: `vol-${channelHandle}-${messageId}`,
        moduleId: 'volunteering',
        title,
        insight,
        eventDates: deadline.trim(),
        quotaLimit:
          (cleanText.match(/(?:Kvota|O['‘]rin)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Berilmagan',
        requirements:
          (cleanText.match(/(?:Talablar)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Postda ko‘rsatilgan',
        deadlineFormatted: deadline.trim(),
        daysRemaining: 7,
        channelHandle,
        channelTitle,
        sourceUrl: `https://t.me/${channelHandle.replace(/^@/, '')}/${messageId}`,
      },
    ];
  }

  if (
    enabledModules.scholarships &&
    (lower.includes('stipendiya') ||
      lower.includes('exchange') ||
      lower.includes('scholarship') ||
      lower.includes('grant'))
  ) {
    return [
      {
        id: `sch-${channelHandle}-${messageId}`,
        moduleId: 'scholarships',
        title,
        insight,
        programType: lower.includes('exchange')
          ? 'Exchange'
          : lower.includes('grant')
          ? 'Grant'
          : 'Stipendiya',
        country:
          (cleanText.match(/(?:Davlat|Mamlakat)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Xalqaro',
        stipendAmount:
          (cleanText.match(/(?:Stipendiya|Grant)\s*[:\-–]\s*([^\n]+)/i) || [])[1] ||
          'To‘liq / Qisman',
        requirements:
          (cleanText.match(/(?:Talablar)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Postda ko‘rsatilgan',
        deadlineFormatted: deadline.trim(),
        daysRemaining: 21,
        channelHandle,
        channelTitle,
        sourceUrl: `https://t.me/${channelHandle.replace(/^@/, '')}/${messageId}`,
      },
    ];
  }

  if (
    enabledModules.competitions &&
    (lower.includes('tanlov') || lower.includes('mukofot') || lower.includes('universitet bosqichi'))
  ) {
    return [
      {
        id: `comp-${channelHandle}-${messageId}`,
        moduleId: 'competitions',
        title,
        insight,
        currentStage: lower.includes('respublika')
          ? 'Respublika bosqichi'
          : 'Universitet bosqichi',
        prizePool:
          (cleanText.match(/(?:Mukofot|Sovrin)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Berilmagan',
        stageOrder:
          (cleanText.match(/(?:Bosqichlar)\s*[:\-–]\s*([^\n]+)/i) || [])[1] ||
          'Universitet bosqichi → Respublika bosqichi',
        requiredDocs:
          (cleanText.match(/(?:Hujjatlar)\s*[:\-–]\s*([^\n]+)/i) || [])[1] ||
          'Postda ko‘rsatilgan',
        deadlineFormatted: deadline.trim(),
        daysRemaining: 14,
        channelHandle,
        channelTitle,
        sourceUrl: `https://t.me/${channelHandle.replace(/^@/, '')}/${messageId}`,
      },
    ];
  }

  if (
    enabledModules.events &&
    (lower.includes('tadbir') ||
      lower.includes('zakovat') ||
      lower.includes('debate') ||
      lower.includes('debat') ||
      lower.includes('seminar') ||
      lower.includes('forum') ||
      lower.includes('hackathon'))
  ) {
    return [
      {
        id: `evt-${channelHandle}-${messageId}`,
        moduleId: 'events',
        category: lower.includes('zakovat')
          ? 'Zakovat'
          : lower.includes('debat')
          ? 'Debate'
          : lower.includes('seminar') || lower.includes('forum')
          ? 'Seminar'
          : 'Tadbir',
        title,
        insight,
        dateFormatted: deadline.trim(),
        location:
          (cleanText.match(/(?:Manzil|Joy|Joyi)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || 'Berilmagan',
        organizer:
          (cleanText.match(/(?:Tashkilotchi)\s*[:\-–]\s*([^\n]+)/i) || [])[1] || channelTitle,
        daysRemaining: 5,
        channelHandle,
        channelTitle,
        sourceUrl: `https://t.me/${channelHandle.replace(/^@/, '')}/${messageId}`,
      },
    ];
  }

  return [];
}

/**
 * Fetches the user's real Telegram Chat Folders (Api.messages.GetDialogFilters)
 * AND scans messages from selected folders (or all channels/groups if 'all' is selected).
 */
async function fetchFoldersAndScanChannels(
  client,
  enabledModules,
  selectedFolderIds = ['all']
) {
  const g = await getGramJs();
  const dialogs = await client.getDialogs({ limit: 70 });
  const channelsAndGroups = dialogs.filter((d) => d.isChannel || d.isGroup);

  // 1. Fetch official Telegram Chat Folders (DialogFilters)
  const folders = [
    {
      id: 'all',
      title: 'Barcha kanallar va guruhlar',
      chatsCount: channelsAndGroups.length,
      peerIds: channelsAndGroups.map((d) => String(d.id || '')),
    },
  ];

  if (g && g.Api && g.Api.messages && g.Api.messages.GetDialogFilters) {
    try {
      const rawFilters = await client.invoke(new g.Api.messages.GetDialogFilters());
      const filterList = Array.isArray(rawFilters)
        ? rawFilters
        : Array.isArray(rawFilters?.filters)
        ? rawFilters.filters
        : [];

      for (const f of filterList) {
        const rawTitle =
          typeof f.title === 'string'
            ? f.title
            : typeof f.title?.text === 'string'
            ? f.title.text
            : null;
        if (!rawTitle) continue;

        const includePeers = Array.isArray(f.includePeers) ? f.includePeers : [];
        const peerIdSet = new Set();
        for (const p of includePeers) {
          if (p.channelId) peerIdSet.add(`-100${String(p.channelId)}`);
          if (p.chatId) peerIdSet.add(`-${String(p.chatId)}`);
          if (p.userId) peerIdSet.add(String(p.userId));
        }

        const matchingDialogs = channelsAndGroups.filter((d) => {
          const dId = String(d.id || '');
          if (peerIdSet.has(dId)) return true;
          if (f.broadcasts && d.isChannel && !d.isGroup) return true;
          if (f.groups && d.isGroup) return true;
          return false;
        });

        folders.push({
          id: `folder_${f.id || rawTitle}`,
          title: rawTitle,
          chatsCount: matchingDialogs.length,
          peerIds: matchingDialogs.map((d) => String(d.id || '')),
        });
      }
    } catch (e) {
      console.log('DialogFilters note:', e.message);
    }
  }

  // Also add individual channels/groups as selectable items if user wants granular folder/chat control
  const publicChannels = channelsAndGroups.filter((d) => d.entity && d.entity.username);
  if (publicChannels.length > 0 && folders.length === 1) {
    folders.push({
      id: 'folder_public_channels',
      title: 'Ommaviy Kanallar',
      chatsCount: publicChannels.length,
      peerIds: publicChannels.map((d) => String(d.id || '')),
    });
  }

  // 2. Determine which dialogs to scan based on selectedFolderIds
  const scanAll =
    !Array.isArray(selectedFolderIds) ||
    selectedFolderIds.length === 0 ||
    selectedFolderIds.includes('all');

  let allowedPeerIds = null;
  if (!scanAll) {
    allowedPeerIds = new Set();
    for (const f of folders) {
      if (selectedFolderIds.includes(f.id)) {
        for (const pid of f.peerIds) allowedPeerIds.add(pid);
      }
    }
  }

  const targetDialogs = scanAll
    ? channelsAndGroups.slice(0, 25)
    : channelsAndGroups.filter((d) => allowedPeerIds.has(String(d.id || ''))).slice(0, 25);

  const extracted = [];
  let totalMessagesRead = 0;

  for (const dialog of targetDialogs) {
    if (!dialog.entity) continue;
    const handle =
      dialog.entity.username ||
      `c/${String(dialog.entity.id || '').replace(/^-100/, '')}`;
    const channelTitle = dialog.title || dialog.entity.title || handle;

    try {
      const messages = await client.getMessages(dialog.entity, { limit: 18 });
      for (const m of messages) {
        if (!m.message || m.message.length < 30) continue;
        // 90 kundan eski postlarni o'qimaymiz
        if (m.date && Date.now() / 1000 - m.date > 90 * 86400) continue;
        totalMessagesRead++;
        const parsed = extractInsights(m.message, handle, channelTitle, m.id, enabledModules);
        if (parsed.length > 0) extracted.push(...parsed);
      }
    } catch {}
  }

  return {
    channelsCount: targetDialogs.length,
    totalChannelsCount: channelsAndGroups.length,
    messagesReadCount: totalMessagesRead,
    folders: folders.map(({ id, title, chatsCount }) => ({ id, title, chatsCount })),
    insights: extracted,
  };
}

// 6. Local & Cloud Multi-User HTTP Server Handler
async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Acas-Session, X-Acas-User-Key, X-Acas-Secret'
  );
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || '/', 'http://localhost:4000');

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, mode: process.env.RENDER ? 'render-cloud' : 'local-pc', multiUser: true }));
  }

  if (url.pathname === '/api/bot/heartbeat') {
    const alive = Date.now() - lastBotPollAt < 35000;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, botPollingAlive: alive, lastBotPollAt }));
  }

  if (url.pathname === '/api/live-reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('data: connected\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (url.pathname === '/acas-logo.svg') {
    const svgPath = path.resolve(process.cwd(), 'public/acas-logo.svg');
    if (fs.existsSync(svgPath)) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end(fs.readFileSync(svgPath));
    }
  }

  if (url.pathname === '/bot-banner.jpg') {
    if (fs.existsSync(bannerDest)) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return res.end(fs.readFileSync(bannerDest));
    }
  }

  const readJson = () =>
    new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch {
          resolve({});
        }
      });
    });

  const headerToken = String(req.headers['x-acas-session'] || url.searchParams.get('token') || '').trim();
  const headerUserKey = String(req.headers['x-acas-user-key'] || url.searchParams.get('userKey') || '').trim();
  const headerSecret = String(req.headers['x-acas-secret'] || url.searchParams.get('secret') || '').trim();

  // Check persistent session on page load — STRICTLY ISOLATED PER USER (userKey + clientSecret/sessionString)!
  if (url.pathname === '/api/auth/session' && (req.method === 'GET' || req.method === 'POST')) {
    let userKey = headerUserKey;
    let clientSecret = headerSecret;
    let incomingToken = headerToken;
    let incomingMeta = null;
    let body = {};

    if (req.method === 'POST') {
      body = await readJson();
      if (body?.userKey) userKey = String(body.userKey).trim();
      if (body?.clientSecret) clientSecret = String(body.clientSecret).trim();
      if (body?.sessionString && String(body.sessionString).length > 20) {
        incomingToken = String(body.sessionString).trim();
        incomingMeta = body.session || null;
      }
    }

    // Foydalanuvchining userKey yoki sessionString kaliti bo'yicha sessiyani tekshiramiz va tiklaymiz
    const existingSaved = loadUserSession(userKey, clientSecret, incomingToken);
    if ((!existingSaved || !existingSaved.sessionString) && incomingToken.length > 20 && userKey) {
      saveUserSession(userKey, {
        authenticated: true,
        userKey,
        clientSecret: clientSecret || `sec_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        sessionString: incomingToken,
        session: body.session || { phoneNumber: 'Ulangan hisob', firstName: 'Profil', twoFactorVerified: true },
        folders: body.folders || [],
        chats: body.chats || [],
        selectedFolderIds: body.selectedFolderIds || ['all'],
        enabledModules: body.enabledModules,
        insights: body.insights || [],
      });
    }

    const client = await getOrRestoreAuthenticatedClient(userKey, clientSecret, incomingToken, incomingMeta);
    const saved = loadUserSession(userKey, clientSecret, incomingToken);

    if (!saved || !saved.sessionString) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, authenticated: false, reason: 'no_saved_session_for_user' }));
    }

    let folders = saved.folders || [];
    let chats = saved.chats || [];
    if (client) {
      try {
        const fd = await fetchFolderData(client, false, userKey);
        if (fd && fd.dialogs && fd.dialogs.length > 0) {
          folders = publicFolders(fd);
          chats = fd.chats;
          saveUserSession(userKey, {
            ...saved,
            folders,
            chats,
          });
        }
      } catch {}
    }

    const isAdmin = checkIsAdminRecord(userKey, saved);
    if (saved.session) saved.session.isAdmin = isAdmin;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        ok: true,
        authenticated: true,
        isAdmin,
        userKey,
        clientSecret: saved.clientSecret,
        sessionString: saved.sessionString,
        session: saved.session,
        folders,
        chats,
        selectedFolderIds: saved.selectedFolderIds || ['all'],
        enabledModules: saved.enabledModules,
        insights: saved.insights || [],
      })
    );
  }

  // ADMIN ANALYTICS & VISUALIZATION ENDPOINT — STRICTLY FOR ADMIN ID 8004724563 ONLY!
  if (url.pathname === '/api/admin/stats' && req.method === 'GET') {
    const callerRecord = loadUserSession(headerUserKey, headerSecret, headerToken);
    const isCallerAdmin = checkIsAdminRecord(headerUserKey, callerRecord);

    if (!isCallerAdmin) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          ok: false,
          message: 'Ruxsat rad etildi. Ushbu bo‘lim faqat Admin (ID: 8004724563) uchun.',
        })
      );
    }

    const db = loadAllUsersDb();
    const userRecords = Object.values(db.users || {}).filter((u) => u && u.session);
    const botVisitorRecords = Object.values(db.botVisitors || {});
    const now = Date.now();

    let totalChannels = 0;
    let totalMessagesScanned = 0;
    let totalInsightsFound = 0;
    let totalScansRun = 0;
    let scanSpeedSum = 0;
    let scanSpeedCount = 0;
    let active24hUsers = 0;

    const moduleCounts = {
      events: 0,
      conferences: 0,
      volunteering: 0,
      scholarships: 0,
      competitions: 0,
    };
    const moduleEnabledByUsers = {
      events: 0,
      conferences: 0,
      volunteering: 0,
      scholarships: 0,
      competitions: 0,
    };
    const channelStatsMap = new Map();

    const usersList = userRecords
      .map((u) => {
        const s = u.session || {};
        const chCount = (u.chats || []).length || s.connectedChannelsCount || 0;
        const msgCount = s.scannedMessagesCount || 0;
        const ins = Array.isArray(u.insights) ? u.insights : [];
        const uAt = u.updatedAt || u.createdAt || now;
        const isOnline = userClientsMap.has(u.userKey);
        if (now - uAt <= 86400 * 1000) active24hUsers++;

        totalChannels += chCount;
        totalMessagesScanned += msgCount;
        totalInsightsFound += ins.length;
        totalScansRun += u.scansCount || (ins.length > 0 ? 1 : 0);

        if (u.lastScanElapsedMs && u.lastScanElapsedMs > 0) {
          scanSpeedSum += u.lastScanElapsedMs;
          scanSpeedCount++;
        }

        const em = u.enabledModules || {
          events: true,
          conferences: true,
          volunteering: true,
          scholarships: true,
          competitions: true,
        };
        for (const k of Object.keys(moduleEnabledByUsers)) {
          if (em[k]) moduleEnabledByUsers[k]++;
        }

        for (const item of ins) {
          if (item?.moduleId && moduleCounts[item.moduleId] !== undefined) {
            moduleCounts[item.moduleId]++;
          }
          const h = item?.channelHandle || 'canal';
          const prevCh = channelStatsMap.get(h) || {
            handle: h,
            title: item?.channelTitle || h,
            count: 0,
          };
          prevCh.count++;
          channelStatsMap.set(h, prevCh);
        }

        return {
          userKey: u.userKey,
          telegramId: s.telegramId || String(u.userKey || '').replace(/^tg_/, ''),
          firstName: s.firstName || 'Foydalanuvchi',
          username: s.username || '',
          phoneNumber: s.phoneNumber || '',
          channelsCount: chCount,
          foldersCount: (u.folders || []).length,
          messagesRead: msgCount,
          insightsCount: ins.length,
          scansCount: u.scansCount || 1,
          lastScanMs: u.lastScanElapsedMs || 0,
          updatedAt: uAt,
          isOnline,
          isAdmin: checkIsAdminRecord(u.userKey, u),
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    // 7-day activity series for visual SVG chart
    const dailySeries = [];
    const uzDayNames = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(now - i * 86400 * 1000);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      const dKey = `${y}-${m}-${day}`;
      const rec = db.dailyActivity?.[dKey] || {};
      const isToday = i === 0;
      dailySeries.push({
        date: dKey,
        label: `${uzDayNames[dt.getDay()]} (${day}.${m})`,
        activeUsers: Array.isArray(rec.activeUserKeys)
          ? Math.max(rec.activeUserKeys.length, isToday ? active24hUsers : 0)
          : isToday
          ? active24hUsers
          : 0,
        scans: rec.scans || (isToday ? totalScansRun : 0),
        messagesRead: rec.messagesRead || (isToday ? totalMessagesScanned : 0),
        insightsFound: rec.insightsFound || (isToday ? totalInsightsFound : 0),
      });
    }

    const MODULE_LABELS = {
      events: 'Tadbirlar va Musobaqalar',
      conferences: 'Ilmiy Anjuman va Maqolalar',
      volunteering: 'Volontyorlik',
      scholarships: 'Stipendiya & Exchange',
      competitions: 'Tanlovlar',
    };
    const moduleBreakdown = Object.keys(MODULE_LABELS).map((id) => {
      const cnt = moduleCounts[id] || 0;
      const pct = totalInsightsFound > 0 ? Math.round((cnt / totalInsightsFound) * 100) : 0;
      return {
        id,
        title: MODULE_LABELS[id],
        count: cnt,
        pct,
        enabledUsers: moduleEnabledByUsers[id] || 0,
      };
    });

    const topChannels = Array.from(channelStatsMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((c) => ({
        ...c,
        pct: totalInsightsFound > 0 ? Math.round((c.count / totalInsightsFound) * 100) : 0,
      }));

    const memMb = Math.round((process.memoryUsage().rss || 0) / (1024 * 1024));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        ok: true,
        adminId: ADMIN_TELEGRAM_ID,
        generatedAt: now,
        kpis: {
          totalConnectedUsers: userRecords.length,
          onlineSessionsCount: userClientsMap.size,
          active24hUsers: Math.max(active24hUsers, userClientsMap.size),
          botVisitorsCount: Math.max(botVisitorRecords.length, userRecords.length),
          totalChannels,
          totalMessagesScanned,
          totalInsightsFound,
          totalScansRun,
          avgScanSpeedMs: scanSpeedCount > 0 ? Math.round(scanSpeedSum / scanSpeedCount) : 950,
          serverUptimeSec: Math.round((now - SERVER_STARTED_AT) / 1000),
          memoryMb: memMb,
        },
        moduleBreakdown,
        dailySeries,
        topChannels,
        usersList,
      })
    );
  }

  // Explicit Log Out endpoint — FAQAT shu foydalanuvchining o'z hisobidan chiqadi!
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    const body = await readJson();
    const userKey = String(body?.userKey || headerUserKey || '').trim();
    const sessionString = String(body?.sessionString || headerToken || '').trim();
    const telegramId = String(body?.telegramId || '').replace(/^tg_/, '').trim();
    const g = await getGramJs();

    const db = loadAllUsersDb();
    const matchedKeys = new Set();
    if (userKey) matchedKeys.add(userKey);
    if (telegramId) matchedKeys.add(`tg_${telegramId}`);

    for (const [uk, rec] of Object.entries(db.users || {})) {
      if (!rec) continue;
      const recTgId = String(rec.session?.telegramId || '');
      if (
        matchedKeys.has(uk) ||
        (telegramId && recTgId === telegramId) ||
        (sessionString && rec.sessionString === sessionString) ||
        !process.env.RENDER
      ) {
        matchedKeys.add(uk);
      }
    }

    for (const uk of matchedKeys) {
      try {
        const conn = userClientsMap.get(uk);
        if (conn && conn.client) {
          if (conn.sessionString) revokedTokensSet.add(conn.sessionString);
          if (g && g.Api && g.Api.auth && g.Api.auth.LogOut) {
            await conn.client.invoke(new g.Api.auth.LogOut()).catch(() => {});
          }
          await conn.client.disconnect().catch(() => {});
        }
        userClientsMap.delete(uk);
      } catch {}
      clearUserMemoryCaches(uk);
    }

    if (sessionString) revokedTokensSet.add(sessionString);
    clearUserSession(userKey, { sessionString, telegramId });
    console.log(`🔒 [Log Out] Foydalanuvchi (${userKey}${telegramId ? `, tg_${telegramId}` : ''}) o‘z xohishi bilan hisobdan chiqdi.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, message: 'Hisobdan muvaffaqiyatli chiqildi.' }));
  }

  // Papkalar + alohida kanallar ro'yxati (faqat shu foydalanuvchi uchun)
  if (url.pathname === '/api/folders' && req.method === 'GET') {
    const client = await getOrRestoreAuthenticatedClient(headerUserKey, headerSecret, headerToken);
    const saved = loadUserSession(headerUserKey, headerSecret, headerToken);
    if (!client) {
      if (saved && saved.folders) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, folders: saved.folders || [], chats: saved.chats || [] }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, message: 'Telegram bilan qayta ulanilmoqda...' }));
    }
    try {
      const force = url.searchParams.get('refresh') === '1';
      const fd = await fetchFolderData(client, force, headerUserKey);
      if (saved) {
        saveUserSession(headerUserKey, { ...saved, folders: publicFolders(fd), chats: fd.chats });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, folders: publicFolders(fd), chats: fd.chats }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, message: e.message }));
    }
  }

  // JONLI SKAN (SSE) — 8X PARALLEL RAW MTPROTO TURBO SCANNER (Isolated per userKey)
  if (url.pathname === '/api/insights/stream' && req.method === 'GET') {
    const selected = (url.searchParams.get('folders') || 'all').split(',').filter(Boolean);
    const forceFresh = url.searchParams.get('fresh') === '1';
    let enabled = { events: true, conferences: true, volunteering: true, scholarships: true, competitions: true };
    try {
      enabled = { ...enabled, ...JSON.parse(url.searchParams.get('modules') || '{}') };
    } catch {}

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (ev, data) => {
      try {
        res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };
    let aborted = false;
    req.on('close', () => (aborted = true));

    const client = await getOrRestoreAuthenticatedClient(headerUserKey, headerSecret, headerToken);
    if (!client) {
      send('scan-error', { message: 'Hisobga qayta ulanmoqda, Yangilash tugmasini bosing.' });
      return res.end();
    }

    try {
      const t0 = Date.now();
      const g = await getGramJs();
      const fd = await fetchFolderData(client, false, headerUserKey);
      send('folders', { folders: publicFolders(fd), chats: fd.chats });

      let targets = fd.dialogs;
      if (!selected.includes('all')) {
        const allowed = new Set();
        for (const f of fd.folders) if (selected.includes(f.id)) f.entityIds.forEach((x) => allowed.add(String(x)));
        for (const s of selected) if (s.startsWith('chat_')) allowed.add(String(s.slice(5)));
        targets = fd.dialogs.filter((d) => allowed.has(String(d.id ?? '')));
      }

      targets = [...targets].sort((a, b) => Number(b.isChannel) - Number(a.isChannel));

      console.log(`⚡ [Turbo Skan | ${headerUserKey}] ${targets.length} ta chat 8x parallel o'qilmoqda...`);
      send('start', { total: targets.length });

      const all = [];
      const seen = new Set();
      let read = 0;
      let doneCount = 0;
      let cursor = 0;
      const CONCURRENCY = Math.min(8, Math.max(1, targets.length));
      const cutoffSec = Date.now() / 1000 - 120 * 86400;

      const fetchChatMessagesFast = async (dlg) => {
        const cacheKey = `${headerUserKey}:${String(dlg.id)}`;
        const cached = userChannelHistoryCache.get(cacheKey);
        if (!forceFresh && cached && Date.now() - cached.ts < 120000) {
          return cached.msgs;
        }
        const msgLimit = dlg.isChannel ? 40 : 22;
        if (g?.Api?.messages?.GetHistory) {
          const hist = await client.invoke(
            new g.Api.messages.GetHistory({
              peer: dlg.entity,
              offsetId: 0,
              offsetDate: 0,
              addOffset: 0,
              limit: msgLimit,
              maxId: 0,
              minId: 0,
              hash: 0,
            })
          );
          const rawMsgs = hist?.messages || [];
          userChannelHistoryCache.set(cacheKey, { ts: Date.now(), msgs: rawMsgs });
          return rawMsgs;
        }
        const fallbackMsgs = await client.getMessages(dlg.entity, { limit: msgLimit });
        userChannelHistoryCache.set(cacheKey, { ts: Date.now(), msgs: fallbackMsgs });
        return fallbackMsgs;
      };

      const worker = async () => {
        while (!aborted) {
          const idx = cursor++;
          if (idx >= targets.length) break;
          const dlg = targets[idx];
          const ent = dlg.entity;
          const handle = ent?.username || `c/${String(dlg.id ?? '')}`;
          const title = dlg.title || ent?.title || handle;

          try {
            const msgs = await fetchChatMessagesFast(dlg);
            // Kompyuter soati (Date.now()) oldinga surilgan bo'lsa ham xabarlarni o'tkazib yubormaslik uchun
            // eng oxirgi xabar vaqtini (maxMsgDate) tayanch vaqt sifatida olamiz!
            let latestMsgSec = 0;
            for (const m of msgs) {
              if (m?.date && m.date > latestMsgSec) latestMsgSec = m.date;
            }
            const effectiveCutoffSec =
              latestMsgSec > 0 ? latestMsgSec - 150 * 86400 : cutoffSec;

            for (const m of msgs) {
              if (aborted) break;
              const txt = m?.message;
              if (!txt || txt.length < 30) continue;
              if (m.date && m.date < effectiveCutoffSec) break;
              read++;
              const items = extractInsights(txt, handle, title, m.id, enabled, m.date || 0);
              for (const it of items) {
                if (seen.has(it.id)) continue;
                seen.add(it.id);
                all.push(it);
                send('item', it);
              }
            }
          } catch {}

          doneCount++;
          send('progress', {
            done: doneCount,
            total: targets.length,
            read,
            found: all.length,
            chat: title,
          });
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      const elapsedMs = Date.now() - t0;
      recordScanTelemetry(headerUserKey, read, all.length, elapsedMs);
      const saved = loadUserSession(headerUserKey, headerSecret, headerToken);
      if (saved) {
        saveUserSession(headerUserKey, {
          ...saved,
          folders: fd.dialogs.length > 0 ? publicFolders(fd) : (saved.folders || publicFolders(fd)),
          chats: fd.chats.length > 0 ? fd.chats : (saved.chats || []),
          selectedFolderIds: selected,
          enabledModules: enabled,
          insights: all.length > 0 ? all : (saved.insights || []),
          lastScanElapsedMs: elapsedMs,
          session: {
            ...saved.session,
            connectedChannelsCount: targets.length || saved.session?.connectedChannelsCount || 0,
            scannedMessagesCount: read || saved.session?.scannedMessagesCount || 0,
          },
        });
      }
      console.log(`✅ [Turbo Skan | ${headerUserKey}] ${targets.length} chat, ${read} xabar -> ${all.length} ta e'lon (${elapsedMs}ms)`);
      send('done', { total: targets.length, read, found: all.length, elapsedMs });
    } catch (e) {
      send('scan-error', { message: e.message });
    }
    return res.end();
  }

  if (url.pathname === '/api/auth/send-code' && req.method === 'POST') {
    const body = await readJson();
    const { phoneNumber, userKey: bodyUserKey } = body;
    const userKey = String(bodyUserKey || headerUserKey || 'anon').trim();
    const cleanPhone = String(phoneNumber || '').replace(/[^\d+]/g, '');
    const pendingKey = `${userKey}:${cleanPhone}`;
    const g = await getGramJs();
    if (!g) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          ok: false,
          message:
            'MTProto dvigateli hali yuklanmagan. Terminalda .\\local.ps1 ni qaytadan ishga tushiring!',
        })
      );
    }

    try {
      console.log(`📲 [MTProto | ${userKey}] ${cleanPhone} raqamiga Telegram kodi yuborilmoqda...`);
      const apiId = Number(process.env.TELEGRAM_API_ID || 2040);
      const apiHash = process.env.TELEGRAM_API_HASH || 'b18441a1ff607e10a989891a5462e627';
      const client = new g.TelegramClient(new g.StringSession(''), apiId, apiHash, {
        connectionRetries: 3,
        deviceModel: 'acc.asis Multi-User Agent',
        systemVersion: 'Windows 11',
        appVersion: '4.16.8 x64',
        langCode: 'en',
        systemLangCode: 'en-US',
      });
      await client.connect();
      const result = await client.sendCode({ apiId, apiHash }, cleanPhone);
      clientMap.set(pendingKey, { client, phoneCodeHash: result.phoneCodeHash });
      console.log(`✅ [MTProto | ${userKey}] ${cleanPhone} ga kod yuborildi!`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          ok: true,
          phoneCodeHash: result.phoneCodeHash,
          message: `Kod ${cleanPhone} raqamiga yuborildi! Telegram ilovangiz ichidagi "Telegram" xizmat chatini tekshiring.`,
        })
      );
    } catch (e) {
      console.error(`❌ [MTProto Xato]:`, e.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, message: `Telegram xatosi: ${e.message}` }));
    }
  }

  if (url.pathname === '/api/auth/verify-code' && req.method === 'POST') {
    const { phoneNumber, code, userKey: bodyUserKey } = await readJson();
    const userKey = String(bodyUserKey || headerUserKey || 'anon').trim();
    const cleanPhone = String(phoneNumber || '').replace(/[^\d+]/g, '');
    const pendingKey = `${userKey}:${cleanPhone}`;
    const entry = clientMap.get(pendingKey) || clientMap.get(cleanPhone);
    const g = await getGramJs();

    if (!g || !entry) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({ ok: false, message: 'Sessiya topilmadi. Raqamni qaytadan kiriting.' })
      );
    }

    try {
      await entry.client.invoke(
        new g.Api.auth.SignIn({
          phoneNumber: cleanPhone,
          phoneCodeHash: entry.phoneCodeHash,
          phoneCode: String(code).trim(),
        })
      );
      const pwdState = await entry.client.invoke(new g.Api.account.GetPassword());
      if (!pwdState.hasPassword) {
        await entry.client.invoke(new g.Api.auth.LogOut());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            ok: false,
            status: '2fa_missing_blocked',
            message:
              'XAVFSIZLIK TALABI: Hisobingizda 2FA (Ikki bosqichli parol) yoqilmagan! acc.asis faqat 2FA yoqilgan hisoblarni ulaydi.',
          })
        );
      }
    } catch (err) {
      const msg = err.errorMessage || err.message || String(err);
      if (!msg.includes('SESSION_PASSWORD_NEEDED')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, message: `Kod xatosi: ${msg}` }));
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        ok: true,
        status: '2fa_required',
        message: 'Kod tasdiqlandi! Endi 2-bosqichli Cloud parolingizni (2FA) kiriting.',
      })
    );
  }

  if (url.pathname === '/api/auth/verify-2fa' && req.method === 'POST') {
    const { phoneNumber, password, enabledModules, userKey: bodyUserKey } = await readJson();
    const userKey = String(bodyUserKey || headerUserKey || `user_${Date.now()}`).trim();
    const cleanPhone = String(phoneNumber || '').replace(/[^\d+]/g, '');
    const pendingKey = `${userKey}:${cleanPhone}`;
    const entry = clientMap.get(pendingKey) || clientMap.get(cleanPhone);
    const g = await getGramJs();

    if (!g || !entry) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({ ok: false, message: 'Sessiya topilmadi. Qaytadan urinib ko‘ring.' })
      );
    }

    try {
      const pwdState = await entry.client.invoke(new g.Api.account.GetPassword());
      const srp = await g.computeCheck(pwdState, password);
      await entry.client.invoke(new g.Api.auth.CheckPassword({ password: srp }));

      const sessionString = String(entry.client.session.save() || '');
      const clientSecret = `sec_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      userClientsMap.set(userKey, { client: entry.client, sessionString });
      clientMap.delete(pendingKey);

      const me = await entry.client.getMe().catch(() => ({}));
      const tgId = String(me?.id || '').replace(/^-/, '').trim();
      const isAdmin = tgId === ADMIN_TELEGRAM_ID || String(userKey).replace(/^tg_/, '') === ADMIN_TELEGRAM_ID;
      const fullName =
        [me?.firstName, me?.lastName].filter(Boolean).join(' ') || cleanPhone;

      let foldersList = [];
      let chatsList = [];
      try {
        const fd = await fetchFolderData(entry.client, true, userKey);
        foldersList = publicFolders(fd);
        chatsList = fd.chats;
      } catch (e) {
        console.log('Login folders fetch note:', e.message);
      }

      console.log(`✅ [MTProto | ${userKey}] ${cleanPhone} (${fullName}, ID:${tgId}) ulandi. ${chatsList.length} ta chat va ${foldersList.length} ta papka topildi.`);

      const sessionObj = {
        telegramId: tgId,
        isAdmin,
        phoneNumber: cleanPhone,
        firstName: fullName,
        username: me?.username || '',
        twoFactorVerified: true,
        connectedChannelsCount: chatsList.length,
        scannedMessagesCount: 0,
      };

      // Save strictly under THIS user's userKey AND their Telegram ID key (tg_<id>) so both Browser & Real Telegram Mini App share the session!
      const recordToSave = {
        authenticated: true,
        userKey,
        clientSecret,
        sessionString,
        session: sessionObj,
        folders: foldersList,
        chats: chatsList,
        selectedFolderIds: ['all'],
        enabledModules,
        insights: [],
      };
      saveUserSession(userKey, recordToSave);
      if (tgId) {
        const tgUserKey = `tg_${tgId}`;
        userClientsMap.set(tgUserKey, { client: entry.client, sessionString });
        saveUserSession(tgUserKey, { ...recordToSave, userKey: tgUserKey });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          ok: true,
          isAdmin,
          userKey,
          clientSecret,
          sessionString,
          session: sessionObj,
          folders: foldersList,
          chats: chatsList,
          selectedFolderIds: ['all'],
          insights: [],
          message: '2FA tasdiqlandi va chatlaringiz o‘qib chiqildi!',
        })
      );
    } catch (err) {
      const msg = err.errorMessage || err.message || String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, message: `2FA parol xatosi: ${msg}` }));
    }
  }

  const uiHtml = fs.readFileSync(path.resolve(process.cwd(), 'public/app.html'), 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(uiHtml);
}

// ============================================================================
// STRICT SCORING CLASSIFIER
// Eski parser bitta so'z (masalan "maqola") uchrasa postni qabul qilardi.
// Endi: kuchli belgi (strong) shart, shovqin (konsert, aksiya...) rad etiladi,
// muddati o'tgan e'lonlar tashlanadi, sana postdan haqiqatan o'qiladi.
// ============================================================================
const AP = "['‘’`ʻʼ]?";
const rx = (s) => new RegExp(s, 'i');

const SIGNALS = {
  competitions: {
    strong: [rx('\\btanlov'), rx('\\bolimpiada'), rx('\\bchempionat'), rx('\\bgrand\\s?final'), rx('pul mukofot'), rx('\\bsovrin'), rx('\\bcontest\\b'), rx('\\bcompetition\\b')],
    weak: [rx('\\bmukofot'), rx('\\bbosqich'), rx('\\bfinal'), rx(`g${AP}olib`)],
  },
  scholarships: {
    strong: [rx('\\bstipendiya'), rx('\\bgrant\\b'), rx('scholarship'), rx('fellowship'), rx('\\berasmus'), rx('\\bdaad\\b'), rx('chevening'), rx('fulbright'), rx('\\bexchange\\b'), rx('almashinuv'), rx('\\bugrad\\b'), rx('\\bgks\\b'), rx('fully funded')],
    weak: [rx('magistr'), rx('bakalavr'), rx('\\bphd\\b'), rx('doktorantura'), rx(`to${AP}liq qoplan`), rx('\\bielts\\b'), rx('motivatsion')],
  },
  volunteering: {
    strong: [rx('volontyor'), rx('volunteer'), rx(`ko${AP}ngilli`)],
    weak: [rx('sertifikat'), rx('ijtimoiy faol'), rx('\\bkvota'), rx('\\bamaliyot')],
  },
  conferences: {
    strong: [rx('\\banjuman'), rx('\\bkonferensiya'), rx('\\bconference\\b'), rx('simpozium'), rx('symposium'), rx('\\bscopus'), rx('avtoreferat'), rx('\\btezis'), rx('maqola(lar)?\\s+(qabul|yuboring|topshir)'), rx('ilmiy[\\s-]+(jurnal|maqola|amaliy)'), rx('call for papers'), rx('web of science'), rx('\\boak\\b')],
    weak: [rx('\\bjurnal'), rx('\\bmaqola'), rx('\\bnashr'), rx('\\bdoi\\b'), rx('ilmiy')],
  },
  events: {
    strong: [rx('\\btadbir'), rx('zakovat'), rx('\\bdebate\\b|\\bdebat'), rx('hackathon|xakaton'), rx('\\bforum'), rx('\\bseminar'), rx('\\bwebinar|vebinar'), rx('master[-\\s]?klass'), rx('\\btrening'), rx('ochiq eshiklar')],
    weak: [rx('uchrashuv'), rx(`ro${AP}yxatdan o${AP}ting`), rx('\\bmanzil')],
  },
};

// Shovqin: bular akademik e'lon emas. Kuchli signal 6+ bo'lmasa rad etiladi.
const NEGATIVE = [rx('\\bkonsert'), rx('\\bkontsert'), rx('\\bconcert'), rx('\\bkino\\b'), rx('chegirma'), rx('\\baksiya\\b'), rx('sotiladi'), rx('\\bvakansiya'), rx(`ish o${AP}rni`), rx('promokod'), rx('#reklama')];
const ACTION = rx(`muddat|deadline|ro${AP}yxatdan|qabul|ariza|topshir|registrat|https?://|t\\.me/`);
// "Yopildi" turidagi inkor: bunday e'lonlar chiqmaydi
const CLOSED = [rx('\\byopildi'), rx('yakunlandi'), rx('\\btugadi'), rx('tugallandi'), rx(`qabul (to${AP}xtatildi|yopildi|tugadi)`), rx('muddati (tugadi|o.tdi)'), rx(`bo${AP}lib o${AP}tdi`), rx(`o${AP}tkazildi`), rx('\\bclosed\\b'), rx('registration (is )?closed'), rx('g.oliblar e.lon qilindi')];
const PRIORITY = ['competitions', 'scholarships', 'volunteering', 'conferences', 'events'];

const UZ_MONTHS = { yanvar: 0, fevral: 1, mart: 2, aprel: 3, may: 4, iyun: 5, iyul: 6, avgust: 7, sentabr: 8, sentyabr: 8, oktabr: 9, oktyabr: 9, noyabr: 10, dekabr: 11 };
const MONTH_RE = Object.keys(UZ_MONTHS).join('|');

function findFutureDate(text) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const found = [];
  const re1 = new RegExp(`\\b(\\d{1,2})\\s*[-–.]?\\s*(${MONTH_RE})(?:\\s*,?\\s*(20\\d{2}))?`, 'gi');
  let m;
  while ((m = re1.exec(text))) {
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    const mi = UZ_MONTHS[m[2].toLowerCase()];
    const y = m[3] ? Number(m[3]) : today.getFullYear();
    let dt = new Date(y, mi, day);
    if (!m[3] && dt < new Date(today.getTime() - 30 * 86400000)) dt = new Date(y + 1, mi, day);
    found.push({ label: m[0].trim(), dt });
  }
  const re2 = /\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g;
  while ((m = re2.exec(text))) {
    const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(dt.getTime())) found.push({ label: m[0], dt });
  }
  if (!found.length) return { found: false, expired: false, days: null, label: '' };
  const future = found.filter((f) => f.dt >= today).sort((a, b) => a.dt - b.dt);
  if (!future.length) return { found: true, expired: true, days: null, label: '' };
  return { found: true, expired: false, days: Math.round((future[0].dt - today) / 86400000), label: future[0].label };
}

function classifyPost(text, handle, channelTitle, messageId, enabled, forcedModule, suffix = '', postedAt = 0) {
  const clean = (text || '').trim();
  if (clean.length < (forcedModule ? 25 : 60)) return null;
  const lower = clean.toLowerCase();

  let best = forcedModule || null;
  let bestScore = forcedModule ? 99 : 0;
  if (!forcedModule) {
    for (const mod of PRIORITY) {
      if (!enabled[mod]) continue;
      const sig = SIGNALS[mod];
      const strongHits = sig.strong.filter((x) => x.test(lower)).length;
      if (strongHits < 1) continue; // kuchli belgi bo'lmasa — bu bo'lim emas
      const score = strongHits * 3 + sig.weak.filter((x) => x.test(lower)).length;
      if (score > bestScore) {
        best = mod;
        bestScore = score;
      }
    }
    if (!best) return null;
    if (NEGATIVE.some((n) => n.test(lower)) && bestScore < 6) return null;
  }

  const d = findFutureDate(clean);
  if (CLOSED.some((c) => c.test(lower))) return null; // yopilgan / o'tib ketgan
  if (d.expired) return null; // postdagi barcha sanalar o'tib ketgan
  if (!d.found) {
    // Sana yo'q bo'lsa ham, harakatga chaqiruvi (link, ro'yxatdan o'tish, qabul) yoki kuchli signali (bestScore >= 4) bor postlarni o'tkazib yubormaymiz
    if (!forcedModule && bestScore < 4 && !ACTION.test(lower)) return null;
  }

  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const cleanLine = (s) => s.replace(/^[^\p{L}\p{N}«"“]+/u, '').replace(/#\S+/g, '').replace(/https?:\/\/\S+/g, '').trim();
  const title = cleanLine(lines[0] || '').slice(0, 110) || 'E’lon';
  const insight = lines.slice(1).map(cleanLine).filter(Boolean).join(' ').slice(0, 130);
  const url = (clean.match(/https?:\/\/\S+/) || [])[0] || '';
  const pick = (re) => ((clean.match(re) || [])[1] || '').trim();
  const organizer = pick(/(?:Tashkilotchi|Muassasa|OTM)\s*[:\-–]\s*([^\n]+)/i) || channelTitle;

  const base = {
    id: `${best}-${handle}-${messageId}${suffix}`,
    moduleId: best,
    title,
    insight,
    daysRemaining: d.days,
    deadlineFormatted: d.label,
    channelHandle: handle,
    channelTitle,
    registrationLink: url,
    sourceUrl: `https://t.me/${String(handle).replace(/^@/, '')}/${messageId}`,
  };

  if (best === 'conferences') {
    const free = /bepul|tekin|to['‘’ʻ]?lovsiz/i.test(lower);
    return {
      ...base,
      organizer,
      journalName: pick(/(?:Jurnal|To['‘’ʻ]?plam)\s*[:\-–]\s*([^\n]+)/i),
      publishDate: pick(/(?:Nashr|Publish)\s*[:\-–]\s*([^\n]+)/i),
      submissionType: /avtoreferat/i.test(lower) ? 'Avtoreferat' : /tezis/i.test(lower) && !/maqola/i.test(lower) ? 'Tezis' : /maqola/i.test(lower) && !/tezis/i.test(lower) ? 'Maqola' : 'Maqola / Tezis',
      scope: /osiyo|asia/i.test(lower) ? 'Mintaqaviy (Osiyo)' : /xalqaro|international/i.test(lower) ? 'Xalqaro' : 'Mahalliy',
      feeType: free ? 'Tekin' : 'Pulli',
      feeAmount: free ? 'Bepul' : pick(/(?:To['‘’ʻ]?lov|Narxi)\s*[:\-–]\s*([^\n]+)/i),
      extractedFromDigest: Boolean(suffix),
    };
  }
  if (best === 'events') {
    return {
      ...base,
      category: /zakovat/i.test(lower) ? 'Zakovat' : /debat/i.test(lower) ? 'Debate' : /seminar|webinar|vebinar|master/i.test(lower) ? 'Seminar' : 'Tadbir',
      dateFormatted: d.label,
      location: pick(/(?:Manzil|Joy|Joyi)\s*[:\-–]\s*([^\n]+)/i) || (/online|onlayn|zoom/i.test(lower) ? 'Onlayn' : ''),
      organizer,
    };
  }
  if (best === 'volunteering') {
    return {
      ...base,
      eventDates: d.label,
      quotaLimit: pick(/(?:Kvota|O['‘’ʻ]?rin(?:lar)?)\s*[:\-–]\s*([^\n]+)/i),
      requirements: pick(/(?:Talablar)\s*[:\-–]\s*([^\n]+)/i),
    };
  }
  if (best === 'scholarships') {
    return {
      ...base,
      programType: /exchange|almashinuv/i.test(lower) ? 'Exchange' : /grant|fellowship/i.test(lower) ? 'Grant' : 'Stipendiya',
      country: pick(/(?:Davlat|Mamlakat)\s*[:\-–]\s*([^\n]+)/i),
      stipendAmount: pick(/(?:Stipendiya|Grant)\s*[:\-–]\s*([^\n]+)/i) || (/fully funded|to['‘’ʻ]?liq qoplan/i.test(lower) ? 'To‘liq qoplanadi' : ''),
      requirements: pick(/(?:Talablar)\s*[:\-–]\s*([^\n]+)/i),
    };
  }
  return {
    ...base,
    currentStage: /respublika/i.test(lower) ? 'Respublika bosqichi' : /universitet/i.test(lower) ? 'Universitet bosqichi' : '',
    prizePool: pick(/(?:Mukofot|Sovrin|Pul mukofoti)\s*[:\-–]\s*([^\n]+)/i),
    stageOrder: pick(/(?:Bosqichlar)\s*[:\-–]\s*([^\n]+)/i),
    requiredDocs: pick(/(?:Hujjatlar)\s*[:\-–]\s*([^\n]+)/i),
  };
}

function extractInsights(text, handle, channelTitle, messageId, enabled, postedAt = 0) {
  const clean = (text || '').trim();
  const blocks = clean
    .split(/(?=(?:^|\n)\s*\d+[\.\)]\s+)/g)
    .map((b) => b.trim())
    .filter((b) => /^\d+[\.\)]\s+/.test(b));
  const isDigest = enabled.conferences && blocks.length >= 2 && /anjuman|konferensiya/i.test(clean);
  if (isDigest) {
    return blocks
      .map((b, i) => classifyPost(b.replace(/^\d+[\.\)]\s+/, ''), handle, channelTitle, messageId, enabled, 'conferences', `-d${i}`, postedAt))
      .filter(Boolean);
  }
  const one = classifyPost(clean, handle, channelTitle, messageId, enabled, null, '', postedAt);
  return one ? [one] : [];
}

// ============================================================================
// PAPKALAR: Parallel MTProto GetDialogs (folder=0, folder=1) + GetDialogFilters + Memory Cache
// ============================================================================
async function fetchFolderData(client, forceRefresh = false, userKey = 'default') {
  const cached = userFolderCacheMap.get(userKey);
  if (!forceRefresh && cached?.data && Date.now() - cached.ts < 180000) {
    return cached.data;
  }

  const g = await getGramJs();
  const normId = (v) => String(v ?? '').replace(/^-100/, '').replace(/^-/, '');
  const chatMap = new Map(); // normId -> { id, entity, title, username, isChannel, isGroup }

  const registerEntity = (ent, fallbackTitle = '') => {
    if (!ent) return;
    const cls = ent.className || '';
    if (cls === 'ChannelForbidden' || cls === 'ChatForbidden' || cls === 'ChatEmpty' || cls === 'UserEmpty') {
      return;
    }
    if (ent.left || ent.deactivated) return;
    const isChan = cls === 'Channel' || Boolean(ent.broadcast) || Boolean(ent.megagroup);
    const isGrp = cls === 'Chat' || Boolean(ent.megagroup);
    if (!isChan && !isGrp) return;
    const id = normId(ent.id);
    if (!id || id === '0') return;

    if (ent.accessHash !== undefined && ent.min) {
      ent.min = false;
    }

    const existing = chatMap.get(id);
    const title = ent.title || fallbackTitle || existing?.title || ent.username || `Chat ${id}`;
    chatMap.set(id, {
      id,
      entity: ent,
      title,
      username: ent.username || existing?.username || '',
      isChannel: isChan && !ent.megagroup,
      isGroup: isGrp,
    });
  };

  // 1. Asosiy (folderId=0), Arxiv (folderId=1) va GetDialogFilters uchalasini PARALLEL (<180ms) olamiz!
  const invokeGetDialogs = async (folderId) => {
    if (!g?.Api?.messages?.GetDialogs) return null;
    try {
      return await client.invoke(
        new g.Api.messages.GetDialogs({
          offsetDate: 0,
          offsetId: 0,
          offsetPeer: new g.Api.InputPeerEmpty(),
          limit: 100,
          hash: 0,
          folderId,
        })
      );
    } catch {
      return null;
    }
  };

  const invokeGetFilters = async () => {
    if (!g?.Api?.messages?.GetDialogFilters) return null;
    try {
      return await client.invoke(new g.Api.messages.GetDialogFilters());
    } catch {
      return null;
    }
  };

  const [resMain, resArch, rawFilters] = await Promise.all([
    invokeGetDialogs(0),
    invokeGetDialogs(1),
    invokeGetFilters(),
  ]);

  for (const res of [resMain, resArch]) {
    if (!res) continue;
    const dialogPeerIds = new Set();
    for (const d of res.dialogs || []) {
      const pid = normId(d?.peer?.channelId ?? d?.peer?.chatId ?? '');
      if (pid) dialogPeerIds.add(pid);
    }
    for (const c of res.chats || []) {
      const cid = normId(c?.id);
      if (dialogPeerIds.size === 0 || dialogPeerIds.has(cid)) {
        registerEntity(c);
      }
    }
  }

  // Agar raw GetDialogs bo'sh qaytgan bo'lsa, fallback sifatida client.getDialogs ishlatamiz
  if (chatMap.size === 0) {
    try {
      const dlgs = await client.getDialogs({ limit: 100 });
      for (const d of dlgs || []) {
        if (d?.entity) registerEntity(d.entity, d.title);
      }
    } catch {}
  }

  const rawFilterList = Array.isArray(rawFilters)
    ? rawFilters
    : Array.isArray(rawFilters?.filters)
    ? rawFilters.filters
    : [];

  // Agar papka ichida chatMap'da yo'q kanal bo'lsa, Api.channels.GetChannels orqali bitta paketda tortib olamiz
  const missingChannels = [];
  for (const f of rawFilterList) {
    const peers = [...(f.includePeers || []), ...(f.pinnedPeers || [])];
    for (const p of peers) {
      if (p?.channelId && p?.accessHash && !chatMap.has(normId(p.channelId))) {
        if (g?.Api?.InputChannel) {
          missingChannels.push(
            new g.Api.InputChannel({ channelId: p.channelId, accessHash: p.accessHash })
          );
        }
      }
    }
  }
  if (missingChannels.length > 0 && g?.Api?.channels?.GetChannels) {
    try {
      const chRes = await client.invoke(
        new g.Api.channels.GetChannels({ id: missingChannels.slice(0, 100) })
      );
      for (const c of chRes?.chats || []) {
        registerEntity(c);
      }
    } catch {}
  }

  const allDialogs = Array.from(chatMap.values()).sort(
    (a, b) => Number(b.isChannel) - Number(a.isChannel)
  );
  const onlyChannels = allDialogs.filter((d) => d.isChannel);
  const onlyGroups = allDialogs.filter((d) => d.isGroup);

  const folders = [
    {
      id: 'all',
      title: 'Barcha kanallar va guruhlar',
      chatsCount: allDialogs.length,
      entityIds: allDialogs.map((d) => d.id),
    },
  ];

  for (const f of rawFilterList) {
    const title = typeof f.title === 'string' ? f.title.trim() : (f.title?.text || '').trim();
    if (!title) continue;
    const peerKey = (p) => normId(p?.channelId ?? p?.chatId ?? p?.userId ?? '');
    const include = new Set((f.includePeers || []).map(peerKey).filter(Boolean));
    const pinned = new Set((f.pinnedPeers || []).map(peerKey).filter(Boolean));
    const exclude = new Set((f.excludePeers || []).map(peerKey).filter(Boolean));

    const members = allDialogs.filter((d) => {
      if (exclude.has(d.id)) return false;
      if (include.has(d.id) || pinned.has(d.id)) return true;
      if (f.broadcasts && d.isChannel) return true;
      if (f.groups && d.isGroup) return true;
      return false;
    });

    folders.push({
      id: `folder_${f.id ?? title.replace(/\s+/g, '_')}`,
      title,
      chatsCount: members.length,
      entityIds: members.map((d) => d.id),
    });
  }

  if (onlyChannels.length > 0) {
    folders.push({
      id: 'smart_channels',
      title: 'Faqat Kanallar',
      chatsCount: onlyChannels.length,
      entityIds: onlyChannels.map((d) => d.id),
    });
  }
  if (onlyGroups.length > 0) {
    folders.push({
      id: 'smart_groups',
      title: 'Faqat Guruhlar',
      chatsCount: onlyGroups.length,
      entityIds: onlyGroups.map((d) => d.id),
    });
  }

  console.log(
    `📁 [Papkalar] Jami ${allDialogs.length} ta chat (${onlyChannels.length} kanal, ${onlyGroups.length} guruh) va ${folders.length} ta papka tayyor.`
  );

  const result = {
    dialogs: allDialogs,
    folders,
    chats: allDialogs.map((d) => ({
      id: `chat_${d.id}`,
      title: d.title,
      username: d.username,
      isChannel: d.isChannel,
      chatsCount: 1,
    })),
  };
  if (allDialogs.length > 0) {
    userFolderCacheMap.set(userKey, { ts: Date.now(), data: result });
  }
  return result;
}

function publicFolders(fd) {
  return fd.folders.map(({ id, title, chatsCount }) => ({ id, title, chatsCount }));
}

const PORT = Number(process.env.PORT || 4000);
const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==================================================================`);
  console.log(`  🖥  acc.asis — SERVER ISHGA TUSHDI (8x Parallel Turbo MTProto)`);
  console.log(`  • Manzil : http://localhost:${PORT}`);
  console.log(`==================================================================\n`);
  if (!process.env.DISABLE_BOT_POLLING) {
    pollTelegramBot();
  }
  if (!process.env.RENDER) {
    import('./auto-deploy.mjs').catch(() => {});
  }
});
