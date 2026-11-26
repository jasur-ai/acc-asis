import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { gramJsAuthService } from './auth/gramjsAuthService';
import { dbAdapter } from './db/databaseAdapter';
import { parseTelegramMessageModular } from '../modules/parserEngine';
import { calculatePipelineEfficiency, DEFAULT_ENABLED_MODULES } from '../modules/registry';
import { createAcasBot } from './bot/telegramBot';
import { ModuleId } from '../types/acas';
import { Bot } from 'grammy';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const distDir = path.resolve(process.cwd(), 'dist');
app.use(express.static(distDir));
app.use('/public', express.static(path.resolve(process.cwd(), 'public')));

let activeBot: Bot | null = null;

function getResolvedMiniAppUrl(): string {
  // Render automatically provides RENDER_EXTERNAL_URL (e.g. https://acc-asis.onrender.com)
  return (
    process.env.RENDER_EXTERNAL_URL ||
    process.env.MINI_APP_URL ||
    'https://acc-asis.onrender.com'
  ).trim();
}

async function startTelegramBotIfConfigured() {
  const token = (
    process.env.TELEGRAM_BOT_TOKEN || 'your_botfather_token_here'
  ).trim();
  if (!token || activeBot) return;

  const miniAppUrl = getResolvedMiniAppUrl();

  try {
    activeBot = createAcasBot({
      token,
      miniAppUrl,
    });

    // If we have an HTTPS URL, automatically configure the official Telegram Mini App Menu Button
    if (miniAppUrl.startsWith('https://')) {
      try {
        await activeBot.api.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: 'acc.asis',
            web_app: { url: miniAppUrl },
          },
        });
        await activeBot.api.setMyCommands([
          { command: 'start', description: 'acc.asis Mini App va londa tanishtiruv' },
        ]);
      } catch (menuErr) {
        console.warn('[acc.asis] Menu button setup note:', menuErr);
      }
    }

    activeBot.start({
      onStart: (botInfo) => {
        console.log(
          `[acc.asis] Telegram Bot (@${botInfo.username}) ishga tushdi! Mini App URL: ${miniAppUrl}`
        );
      },
    });
  } catch (err) {
    console.error('[acc.asis] Bot start error:', err);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    app: 'acc.asis (ACAS)',
    bot: '@accass_agent',
    status: 'operational',
    dbProvider: dbAdapter.provider,
    miniAppUrl: getResolvedMiniAppUrl(),
    mtproto2faEnforced: true,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/auth/config-status', (_req, res) => {
  const status = gramJsAuthService.getCredentialsStatus();
  res.json({
    ok: true,
    ...status,
    dbProvider: dbAdapter.provider,
  });
});

app.post('/api/auth/send-code', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ ok: false, message: 'Telefon raqam kiritilishi shart.' });
  }
  const result = await gramJsAuthService.sendVerificationCode(phoneNumber);
  return res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/auth/verify-code', async (req, res) => {
  const { phoneNumber, code } = req.body;
  if (!phoneNumber || !code) {
    return res.status(400).json({ ok: false, message: 'Telefon raqam va kod kiritilishi shart.' });
  }
  const result = await gramJsAuthService.verifyCodeAndEnforce2FA(phoneNumber, code);
  return res.json(result);
});

app.post('/api/auth/verify-2fa', async (req, res) => {
  const { phoneNumber, password, enabledModules } = req.body;
  if (!phoneNumber || !password) {
    return res.status(400).json({ ok: false, message: '2FA Cloud paroli kiritilishi shart.' });
  }
  const activeMods = enabledModules || DEFAULT_ENABLED_MODULES;
  const result = await gramJsAuthService.verifyTwoFactorPasswordAndSync(
    phoneNumber,
    password,
    activeMods
  );

  if (result.ok && result.insights && result.insights.length > 0) {
    await dbAdapter.saveInsights(result.insights);
  }

  return res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/insights/sync', async (req, res) => {
  const { phoneNumber, enabledModules } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ ok: false, message: 'Telefon raqam sessiyasi kerak.' });
  }

  try {
    const startedAt = performance.now();
    const scanResult = await gramJsAuthService.scanConnectedAccountChannels(
      phoneNumber,
      enabledModules || DEFAULT_ENABLED_MODULES
    );
    const elapsedMs = Math.round(performance.now() - startedAt);

    if (scanResult.insights.length > 0) {
      await dbAdapter.saveInsights(scanResult.insights);
    }

    return res.json({
      ok: true,
      channelsCount: scanResult.channelsCount,
      messagesCount: scanResult.messagesCount,
      insights: scanResult.insights,
      elapsedMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ ok: false, message: msg });
  }
});

app.post('/api/insights/parse', async (req, res) => {
  const {
    text,
    channelHandle = 'ilm_fan_anjumanlar_uz',
    channelTitle = 'Telegram Kanal',
    messageId = 5001,
    enabledModules = DEFAULT_ENABLED_MODULES,
  } = req.body;

  if (!text) {
    return res.status(400).json({ ok: false, message: 'Tahlil qilish uchun xabar matni kerak.' });
  }

  const startedAt = performance.now();
  const extracted = parseTelegramMessageModular(
    {
      channelHandle,
      channelTitle,
      messageId: Number(messageId),
      postedAtIso: new Date().toISOString(),
      text,
    },
    enabledModules
  );
  const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
  await dbAdapter.saveInsights(extracted);

  return res.json({
    ok: true,
    extractedCount: extracted.length,
    elapsedMs,
    items: extracted,
  });
});

app.post('/api/preferences/modules', async (req, res) => {
  const { userId = 'default_user', enabledModules } = req.body as {
    userId?: string;
    enabledModules: Record<ModuleId, boolean>;
  };
  const current = await dbAdapter.getUserPreferences(userId);
  const updated = await dbAdapter.saveUserPreferences(userId, {
    ...current,
    enabledModules,
  });
  const efficiency = calculatePipelineEfficiency(updated.enabledModules);
  return res.json({ ok: true, preferences: updated, efficiency });
});

// SPA Fallback for production builds (Render / Docker)
app.get('*', (_req, res) => {
  const indexHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  return res.status(200).send('acc.asis API Server is running. Run Vite or npm run build for UI.');
});

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, () => {
  console.log(`[acc.asis] Server listening on port ${PORT} (DB: ${dbAdapter.provider})`);
  startTelegramBotIfConfigured();
});
