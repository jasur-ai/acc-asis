import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { computeCheck } from 'telegram/Password.js';
import { AnyInsightItem, ModuleId, TelegramAccountSession } from '../../types/acas';
import { parseTelegramMessageModular, RawTelegramMessage } from '../../modules/parserEngine';

/**
 * REAL GramJS (MTProto) Account Connection & Channel Scanner Service
 * with Strict Mandatory 2FA Enforcement.
 */

interface ActiveClientEntry {
  client: TelegramClient;
  phoneNumber: string;
  phoneCodeHash?: string;
  passwordHint?: string;
  authenticated: boolean;
  sessionString?: string;
}

const clientStore = new Map<string, ActiveClientEntry>();

export class GramJsAuthService {
  private apiId: number;
  private apiHash: string;

  constructor() {
    // Built-in official Telegram MTProto defaults so users never have to enter keys manually
    this.apiId = Number(process.env.TELEGRAM_API_ID || 2040);
    this.apiHash = (process.env.TELEGRAM_API_HASH || 'b18441a1ff607e10a989891a5462e627').trim();
  }

  public setCredentials(apiId: number, apiHash: string) {
    this.apiId = Number(apiId);
    this.apiHash = apiHash.trim();
    process.env.TELEGRAM_API_ID = String(this.apiId);
    process.env.TELEGRAM_API_HASH = this.apiHash;
  }

  public getCredentialsStatus(): {
    configured: boolean;
    apiId: number;
    hasBotToken: boolean;
  } {
    return {
      configured: Boolean(this.apiId > 0 && this.apiHash.length >= 16),
      apiId: this.apiId,
      hasBotToken: Boolean(
        process.env.TELEGRAM_BOT_TOKEN &&
          process.env.TELEGRAM_BOT_TOKEN !== 'your_botfather_token_here'
      ),
    };
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/[^\d+]/g, '');
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  /**
   * Step 1: Connect real MTProto client and send official login code via Telegram
   */
  public async sendVerificationCode(phoneNumber: string): Promise<{
    ok: boolean;
    phoneCodeHash?: string;
    message: string;
  }> {
    if (!this.getCredentialsStatus().configured) {
      return {
        ok: false,
        message:
          'TELEGRAM_API_ID va TELEGRAM_API_HASH kiritilmagan. my.telegram.org saytidan olib kiriting.',
      };
    }

    const cleanPhone = this.normalizePhone(phoneNumber);

    try {
      // Disconnect any previous unauthenticated client for this phone
      const existing = clientStore.get(cleanPhone);
      if (existing && !existing.authenticated) {
        try {
          await existing.client.disconnect();
        } catch {
          // ignore disconnect errors
        }
      }

      const client = new TelegramClient(new StringSession(''), this.apiId, this.apiHash, {
        connectionRetries: 5,
      });

      await client.connect();

      const sendResult = await client.sendCode(
        {
          apiId: this.apiId,
          apiHash: this.apiHash,
        },
        cleanPhone
      );

      clientStore.set(cleanPhone, {
        client,
        phoneNumber: cleanPhone,
        phoneCodeHash: sendResult.phoneCodeHash,
        authenticated: false,
      });

      return {
        ok: true,
        phoneCodeHash: sendResult.phoneCodeHash,
        message: `Tasdiqlash kodi ${cleanPhone} raqamiga Telegram orqali yuborildi.`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `Telegram MTProto xatosi (sendCode): ${errorMsg}`,
      };
    }
  }

  /**
   * Step 2: Submit the Telegram login code & strictly enforce 2FA presence.
   *
   * - If `SESSION_PASSWORD_NEEDED` is thrown by Telegram -> 2FA IS enabled! Proceed to Step 3.
   * - If `auth.SignIn` succeeds directly without requiring a 2FA password -> 2FA is NOT enabled!
   *   We immediately call `auth.LogOut` to destroy the session and block login.
   */
  public async verifyCodeAndEnforce2FA(
    phoneNumber: string,
    code: string
  ): Promise<{
    ok: boolean;
    status: '2fa_required' | '2fa_missing_blocked' | 'error';
    passwordHint?: string;
    message: string;
  }> {
    const cleanPhone = this.normalizePhone(phoneNumber);
    const entry = clientStore.get(cleanPhone);

    if (!entry || !entry.phoneCodeHash) {
      return {
        ok: false,
        status: 'error',
        message: 'Sessiya topilmadi. Iltimos, telefon raqamni qaytadan kiriting.',
      };
    }

    const cleanCode = code.trim();

    try {
      await entry.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: cleanPhone,
          phoneCodeHash: entry.phoneCodeHash,
          phoneCode: cleanCode,
        })
      );

      // If SignIn succeeded WITHOUT throwing SESSION_PASSWORD_NEEDED, double check account.GetPassword
      const pwdState = await entry.client.invoke(new Api.account.GetPassword());

      if (!pwdState.hasPassword) {
        // STRICT SECURITY POLICY: Immediately revoke session if 2FA is not enabled!
        try {
          await entry.client.invoke(new Api.auth.LogOut());
          await entry.client.disconnect();
        } catch {
          // ignore logout errors
        }
        clientStore.delete(cleanPhone);

        return {
          ok: false,
          status: '2fa_missing_blocked',
          message:
            'XAVFSIZLIK TALABI: Telegram hisobingizda 2-bosqichli tekshiruv (2FA Cloud Password) yoqilmagan! acc.asis xavfsizlik uchun faqat 2FA yoqilgan hisoblarni ulaydi. Telegram Sozlamalari -> Maxfiylik va Xavfsizlik -> Ikki bosqichli tekshiruvni yoqib, qayta urinib ko‘ring.',
        };
      }

      return {
        ok: true,
        status: '2fa_required',
        passwordHint: pwdState.hint || '',
        message: 'Hisobingizda 2FA aniqlandi. Cloud parolingizni kiriting.',
      };
    } catch (err: unknown) {
      const rpcError = err as { errorMessage?: string; message?: string };
      const errCode = rpcError?.errorMessage || rpcError?.message || String(err);

      // SESSION_PASSWORD_NEEDED is the exact MTProto signal that 2FA is enabled on the account!
      if (errCode.includes('SESSION_PASSWORD_NEEDED')) {
        try {
          const pwdState = await entry.client.invoke(new Api.account.GetPassword());
          entry.passwordHint = pwdState.hint || '';
          return {
            ok: true,
            status: '2fa_required',
            passwordHint: entry.passwordHint,
            message: 'Kod tasdiqlandi! Hisobingizda 2FA himoyasi faol — 2FA Cloud parolingizni kiriting.',
          };
        } catch (pwdErr: unknown) {
          return {
            ok: true,
            status: '2fa_required',
            passwordHint: '',
            message: 'Kod tasdiqlandi! 2FA Cloud parolingizni kiriting.',
          };
        }
      }

      return {
        ok: false,
        status: 'error',
        message: `Kodni tekshirishda xatolik: ${errCode}`,
      };
    }
  }

  /**
   * Step 3: Verify 2FA Cloud Password via SRP (`computeCheck` + `Api.auth.CheckPassword`)
   * and immediately scan the user's real Telegram channels/groups.
   */
  public async verifyTwoFactorPasswordAndSync(
    phoneNumber: string,
    twoFactorPassword: string,
    enabledModules: Record<ModuleId, boolean>
  ): Promise<{
    ok: boolean;
    session?: TelegramAccountSession;
    insights?: AnyInsightItem[];
    message: string;
  }> {
    const cleanPhone = this.normalizePhone(phoneNumber);
    const entry = clientStore.get(cleanPhone);

    if (!entry) {
      return {
        ok: false,
        message: 'faol avtorizatsiya sessiyasi topilmadi. Qaytadan kod so‘rang.',
      };
    }

    try {
      const pwdState = await entry.client.invoke(new Api.account.GetPassword());
      const passwordSrp = await computeCheck(pwdState, twoFactorPassword);

      await entry.client.invoke(
        new Api.auth.CheckPassword({
          password: passwordSrp,
        })
      );

      entry.authenticated = true;
      entry.sessionString = entry.client.session.save() as unknown as string;

      const me = (await entry.client.getMe()) as Api.User;

      // Immediately scan the user's real channels & groups for active modules
      const scanResult = await this.scanConnectedAccountChannels(cleanPhone, enabledModules);

      const sessionInfo: TelegramAccountSession = {
        phoneNumber: cleanPhone,
        username: me?.username || undefined,
        firstName: [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Telegram Foydalanuvchi',
        twoFactorVerified: true,
        connectedChannelsCount: scanResult.channelsCount,
        scannedMessagesCount: scanResult.messagesCount,
        lastSyncedAtIso: new Date().toISOString(),
        mode: 'live_mtproto',
      };

      return {
        ok: true,
        session: sessionInfo,
        insights: scanResult.insights,
        message: `2FA tasdiqlandi! ${scanResult.channelsCount} ta kanal/guruhdan ${scanResult.messagesCount} ta xabar tahlil qilinib, ${scanResult.insights.length} ta londa insight ajratildi.`,
      };
    } catch (err: unknown) {
      const rpcError = err as { errorMessage?: string; message?: string };
      const errCode = rpcError?.errorMessage || rpcError?.message || String(err);
      return {
        ok: false,
        message:
          errCode.includes('PASSWORD_HASH_INVALID')
            ? 'Kiritilgan 2FA Cloud paroli noto‘g‘ri! Qayta tekshirib kiriting.'
            : `2FA tekshiruv xatosi: ${errCode}`,
      };
    }
  }

  /**
   * Scans real channels & groups from the user's authenticated Telegram account
   * and extracts insights ONLY for enabled modules.
   */
  public async scanConnectedAccountChannels(
    phoneNumber: string,
    enabledModules: Record<ModuleId, boolean>
  ): Promise<{
    channelsCount: number;
    messagesCount: number;
    insights: AnyInsightItem[];
  }> {
    const cleanPhone = this.normalizePhone(phoneNumber);
    const entry = clientStore.get(cleanPhone);

    if (!entry || !entry.authenticated) {
      throw new Error('Hisob ulanmagan yoki 2FA tasdiqlanmagan.');
    }

    const dialogs = await entry.client.getDialogs({ limit: 45 });
    const targetDialogs = dialogs.filter((d) => d.isChannel || d.isGroup);

    let totalMessagesScanned = 0;
    const extractedInsights: AnyInsightItem[] = [];

    for (const dialog of targetDialogs.slice(0, 25)) {
      if (!dialog.entity) continue;

      const entityAny = dialog.entity as unknown as {
        username?: string;
        id?: { toString(): string };
        title?: string;
      };

      const channelTitle = dialog.title || entityAny.title || 'Telegram Kanal';
      const rawId = entityAny.id ? entityAny.id.toString().replace(/^-100/, '') : '0';
      const channelHandle = entityAny.username ? entityAny.username : `c/${rawId}`;

      try {
        const messages = await entry.client.getMessages(dialog.entity, { limit: 20 });

        for (const msg of messages) {
          const text = msg.message || '';
          if (!text || text.trim().length < 35) continue;

          totalMessagesScanned++;

          const rawMsg: RawTelegramMessage = {
            channelHandle,
            channelTitle,
            messageId: msg.id,
            postedAtIso: msg.date
              ? new Date(msg.date * 1000).toISOString()
              : new Date().toISOString(),
            text,
          };

          const items = parseTelegramMessageModular(rawMsg, enabledModules);
          if (items.length > 0) {
            extractedInsights.push(...items);
          }
        }
      } catch {
        // Skip channels where reading messages is restricted
      }
    }

    return {
      channelsCount: targetDialogs.length,
      messagesCount: totalMessagesScanned,
      insights: extractedInsights,
    };
  }
}

export const gramJsAuthService = new GramJsAuthService();
