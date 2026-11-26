import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Smartphone,
  KeyRound,
  ArrowRight,
  Zap,
  CheckCircle2,
  SlidersHorizontal,
  Loader2,
  Sun,
  Moon,
} from 'lucide-react';
import { AnyInsightItem, AuthStep, ModuleId, TelegramAccountSession } from '../types/acas';
import { ACAS_MODULES, calculatePipelineEfficiency, MODULE_ORDER } from '../modules/registry';
import { AcasLogo } from './AcasLogo';

interface TelegramAuthGateProps {
  isDark: boolean;
  onToggleTheme: () => void;
  enabledModules: Record<ModuleId, boolean>;
  onToggleModule: (id: ModuleId) => void;
  onAuthenticated: (session: TelegramAccountSession, liveInsights: AnyInsightItem[]) => void;
}

/**
 * Official Telegram Web Style Account Connection Flow (Light & Dark Mode).
 * Users NEVER enter any bot token or API key — they only enter their phone number,
 * Telegram verification code, and mandatory 2FA Cloud Password.
 */
export const TelegramAuthGate: React.FC<TelegramAuthGateProps> = ({
  isDark,
  onToggleTheme,
  enabledModules,
  onToggleModule,
  onAuthenticated,
}) => {
  const [step, setStep] = useState<AuthStep>('phone_input');
  const [phoneNumber, setPhoneNumber] = useState<string>('+998');
  const [smsCode, setSmsCode] = useState<string>('');
  const [twoFactorPass, setTwoFactorPass] = useState<string>('');
  const [passwordHint, setPasswordHint] = useState<string>('');

  const [statusMsg, setStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const efficiency = calculatePipelineEfficiency(enabledModules);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim() || phoneNumber.trim().length < 7) return;
    setErrorMsg('');
    setStatusMsg('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.message || 'Kod yuborishda xatolik yuz berdi.');
      } else {
        setStep('code_input');
        setStatusMsg(data.message);
      }
    } catch {
      setErrorMsg('Server (localhost:4000) bilan aloqa yo‘q. run-local.bat ni ishga tushiring.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsCode.trim()) return;
    setErrorMsg('');
    setStatusMsg('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          code: smsCode.trim(),
        }),
      });
      const data = await res.json();

      if (data.status === '2fa_missing_blocked') {
        setStep('2fa_missing_blocked');
        setErrorMsg(data.message);
      } else if (data.status === '2fa_required') {
        setStep('2fa_required');
        setPasswordHint(data.passwordHint || '');
        setStatusMsg(data.message);
      } else {
        setErrorMsg(data.message || 'Kiritilgan kod xato.');
      }
    } catch {
      setErrorMsg('Server (localhost:4000) bilan aloqa yo‘q.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorPass) return;
    setErrorMsg('');
    setStatusMsg('2FA tekshirilmoqda va hisobingizdagi kanallar skanerlanmoqda...');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          password: twoFactorPass,
          enabledModules,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setStatusMsg('');
        setErrorMsg(data.message || '2FA paroli noto‘g‘ri.');
      } else {
        onAuthenticated(data.session, data.insights || []);
      }
    } catch {
      setStatusMsg('');
      setErrorMsg('Server (localhost:4000) bilan aloqa yo‘q.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--tg-bg)] text-[var(--tg-text)] flex flex-col justify-between p-4">
      {/* Compact Single-Line Header */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between py-2 border-b border-[var(--tg-border)]">
        <AcasLogo size="sm" />
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--tg-surface)] border border-[var(--tg-border)] text-xs font-medium text-[var(--tg-text)] hover:opacity-90 transition"
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-[#2481CC]" />}
          <span>{isDark ? 'Kunduzgi' : 'Tungi'}</span>
        </button>
      </div>

      {/* Official Telegram Style Login Card */}
      <div className="max-w-md w-full mx-auto my-auto py-4">
        <div className="rounded-2xl bg-[var(--tg-surface)] border border-[var(--tg-border)] p-5 shadow-sm space-y-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2481CC] bg-[var(--tg-primary-soft)] px-2.5 py-0.5 rounded-full mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Telegram Account Ulash (2FA Shart)</span>
            </div>
            <h1 className="text-lg font-bold text-[var(--tg-text)]">
              Telegram Hisobingizga Kiring
            </h1>
            <p className="text-xs text-[var(--tg-muted)] mt-0.5">
              Kanallaringizdagi tadbir, maqola, volontyorlik va grantlarni londa ajratib olish uchun raqamingizni kiriting.
            </p>
          </div>

          {/* 3-Step Progress */}
          <div className="grid grid-cols-3 gap-1.5 text-[11px] font-medium">
            <div
              className={`py-1.5 px-2 rounded-lg border text-center ${
                step === 'phone_input'
                  ? 'bg-[var(--tg-primary-soft)] border-[#2481CC] text-[#2481CC] font-semibold'
                  : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)] text-[var(--tg-muted)]'
              }`}
            >
              1. Raqam
            </div>
            <div
              className={`py-1.5 px-2 rounded-lg border text-center ${
                step === 'code_input'
                  ? 'bg-[var(--tg-primary-soft)] border-[#2481CC] text-[#2481CC] font-semibold'
                  : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)] text-[var(--tg-muted)]'
              }`}
            >
              2. Kod
            </div>
            <div
              className={`py-1.5 px-2 rounded-lg border text-center ${
                step === '2fa_required'
                  ? 'bg-[var(--tg-primary-soft)] border-[#2481CC] text-[#2481CC] font-semibold'
                  : step === '2fa_missing_blocked'
                  ? 'bg-rose-500/10 border-rose-500 text-rose-500 font-semibold'
                  : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)] text-[var(--tg-muted)]'
              }`}
            >
              3. 2FA Parol
            </div>
          </div>

          {statusMsg && (
            <div className="p-3 rounded-xl bg-[var(--tg-primary-soft)] border border-[#2481CC]/30 text-xs text-[var(--tg-text)]">
              {statusMsg}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500">
              {errorMsg}
            </div>
          )}

          {/* Step 1: Phone Input */}
          {step === 'phone_input' && (
            <form onSubmit={handleSendCode} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--tg-muted)] mb-1">
                  Telefon raqamingiz
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-[var(--tg-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-sm font-mono text-[var(--tg-text)] focus:outline-none focus:border-[#2481CC]"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--tg-primary)] hover:bg-[var(--tg-primary-hover)] text-white font-semibold text-sm transition flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Davom etish</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Step 2: Code Input */}
          {step === 'code_input' && (
            <form onSubmit={handleVerifyCode} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--tg-muted)] mb-1">
                  Telegramdan kelgan 5 xonali kod
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[var(--tg-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    placeholder="12345"
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-sm font-mono tracking-widest text-[var(--tg-text)] focus:outline-none focus:border-[#2481CC]"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone_input');
                    setErrorMsg('');
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-xs text-[var(--tg-text)]"
                >
                  Orqaga
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--tg-primary)] hover:bg-[var(--tg-primary-hover)] text-white font-semibold text-sm transition flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>Tasdiqlash</span>
                </button>
              </div>
            </form>
          )}

          {/* Step 2B: Blocked if 2FA is not enabled */}
          {step === '2fa_missing_blocked' && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2.5">
              <div className="flex items-center gap-2 text-rose-500 font-semibold text-xs">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Xavfsizlik talabi: 2FA yoqilmagan!</span>
              </div>
              <p className="text-xs text-[var(--tg-muted)] leading-relaxed">
                Hisobingizda <strong>Ikki bosqichli tekshiruv (2FA parol)</strong> yoqilmaganligi sababli ulanish rad etildi. Telegram sozlamalaridan 2FA ni yoqib qayta kiring.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep('phone_input');
                  setSmsCode('');
                  setErrorMsg('');
                }}
                className="w-full py-2 px-3 rounded-lg bg-rose-500 text-white text-xs font-semibold"
              >
                Qayta urinish
              </button>
            </div>
          )}

          {/* Step 3: 2FA Password */}
          {step === '2fa_required' && (
            <form onSubmit={handleVerify2FA} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--tg-text)] mb-1">
                  2-Bosqichli Cloud Parolingiz (2FA)
                  {passwordHint ? ` (${passwordHint})` : ''}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#2481CC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={twoFactorPass}
                    onChange={(e) => setTwoFactorPass(e.target.value)}
                    placeholder="2FA parolingiz"
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-sm font-mono text-[var(--tg-text)] focus:outline-none focus:border-[#2481CC]"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--tg-primary)] hover:bg-[var(--tg-primary-hover)] text-white font-semibold text-sm transition flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Kirish va Kanallarni O‘qish</span>
              </button>
            </form>
          )}

          {/* Modular Speed Toggle Selector */}
          <div className="pt-3 border-t border-[var(--tg-border)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tg-text)]">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#2481CC]" />
                <span>Kerakli bo‘limlar (Tezlik uchun):</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                <Zap className="w-3 h-3 inline" /> {efficiency.activeCount}/5 faol
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {MODULE_ORDER.map((id) => {
                const mod = ACAS_MODULES[id];
                const active = enabledModules[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onToggleModule(id)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left text-xs transition ${
                      active
                        ? 'bg-[var(--tg-primary-soft)] border-[#2481CC]/40 text-[var(--tg-text)] font-medium'
                        : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)] text-[var(--tg-muted)] opacity-60'
                    }`}
                  >
                    <span className="truncate">{mod.shortTitle}</span>
                    <span className="text-[10px] font-mono font-bold text-[#2481CC]">
                      {active ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md w-full mx-auto text-center text-[11px] text-[var(--tg-muted)]">
        @accass_agent • acc.asis
      </div>
    </div>
  );
};
