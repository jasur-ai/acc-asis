import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  ShieldCheck,
  LogOut,
  Zap,
  Calendar,
  BookOpen,
  HeartHandshake,
  GraduationCap,
  Trophy,
  LayoutGrid,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import {
  AnyInsightItem,
  ConferenceScope,
  EventCategory,
  FeeCategory,
  ModuleId,
  SubmissionFormat,
  TelegramAccountSession,
  TimeHorizonPreset,
} from './types/acas';
import {
  ACAS_MODULES,
  calculatePipelineEfficiency,
  DEFAULT_ENABLED_MODULES,
  MODULE_ORDER,
} from './modules/registry';
import { AcasLogo } from './components/AcasLogo';
import { TelegramAuthGate } from './components/TelegramAuthGate';
import { VisualDashboard } from './components/VisualDashboard';
import { InsightCard } from './components/InsightCard';

export function App() {
  // Default to clean Telegram Light Mode; sync with Telegram.WebApp.colorScheme if inside Telegram
  const [isDark, setIsDark] = useState<boolean>(() => {
    const tgScheme = (window as unknown as { Telegram?: { WebApp?: { colorScheme?: string } } })
      ?.Telegram?.WebApp?.colorScheme;
    return tgScheme === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const [session, setSession] = useState<TelegramAccountSession | null>(null);
  const [enabledModules, setEnabledModules] = useState<Record<ModuleId, boolean>>({
    ...DEFAULT_ENABLED_MODULES,
  });
  const [insights, setInsights] = useState<AnyInsightItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncBanner, setSyncBanner] = useState<string>('');

  const [activeTab, setActiveTab] = useState<ModuleId | 'all'>('all');
  const [showModuleDrawer, setShowModuleDrawer] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizonPreset>('all');
  const [customDaysMax, setCustomDaysMax] = useState<number>(90);

  const [eventCatFilter, setEventCatFilter] = useState<EventCategory | 'Barchasi'>('Barchasi');
  const [confFeeFilter, setConfFeeFilter] = useState<FeeCategory | 'Barchasi'>('Barchasi');
  const [confScopeFilter, setConfScopeFilter] = useState<ConferenceScope | 'Barchasi'>('Barchasi');
  const [confFormatFilter, setConfFormatFilter] = useState<SubmissionFormat | 'Barchasi'>('Barchasi');

  const handleToggleModule = (id: ModuleId) => {
    setEnabledModules((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (Object.values(next).every((v) => !v)) {
        return prev;
      }
      if (activeTab === id && !next[id]) {
        setActiveTab('all');
      }
      return next;
    });
  };

  const handleLiveSyncChannels = async () => {
    if (!session) return;
    setIsSyncing(true);
    setSyncBanner('');
    try {
      const res = await fetch('/api/insights/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: session.phoneNumber,
          enabledModules,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.insights && data.insights.length > 0) {
          setInsights(data.insights);
        }
        setSession((prev) =>
          prev
            ? {
                ...prev,
                connectedChannelsCount: data.channelsCount,
                scannedMessagesCount: data.messagesCount,
                lastSyncedAtIso: new Date().toISOString(),
              }
            : null
        );
        setSyncBanner(
          `✓ ${data.channelsCount} ta kanal/guruhdan ${data.messagesCount} ta xabar ${data.elapsedMs}ms ichida skanerlandi.`
        );
      } else {
        setSyncBanner(data.message || 'Sinxronlashda xatolik yuz berdi.');
      }
    } catch {
      setSyncBanner('Server bilan aloqa uzildi.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddParsedInsights = (newItems: AnyInsightItem[]) => {
    setInsights((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const uniqueNew = newItems.filter((i) => !existingIds.has(i.id));
      return [...uniqueNew, ...prev];
    });
  };

  const efficiency = calculatePipelineEfficiency(enabledModules);

  const filteredInsights = useMemo(() => {
    return insights.filter((item) => {
      if (!enabledModules[item.moduleId]) return false;
      if (activeTab !== 'all' && item.moduleId !== activeTab) return false;

      if (timeHorizon === '1d' && item.daysRemaining > 1) return false;
      if (timeHorizon === '2-3d' && item.daysRemaining > 3) return false;
      if (timeHorizon === '1w' && item.daysRemaining > 7) return false;
      if (timeHorizon === '1m' && item.daysRemaining > 31) return false;
      if (timeHorizon === '3-4m' && item.daysRemaining < 60) return false;
      if (timeHorizon === 'custom' && item.daysRemaining > customDaysMax) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = item.title.toLowerCase().includes(q);
        const inInsight = item.insight.toLowerCase().includes(q);
        const inChannel = item.channelTitle.toLowerCase().includes(q);
        if (!inTitle && !inInsight && !inChannel) return false;
      }

      if (item.moduleId === 'events' && eventCatFilter !== 'Barchasi') {
        if (item.category !== eventCatFilter) return false;
      }

      if (item.moduleId === 'conferences') {
        if (confFeeFilter !== 'Barchasi' && item.feeType !== confFeeFilter) return false;
        if (confScopeFilter !== 'Barchasi' && item.scope !== confScopeFilter) return false;
        if (confFormatFilter !== 'Barchasi' && !item.submissionType.includes(confFormatFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [
    insights,
    enabledModules,
    activeTab,
    timeHorizon,
    customDaysMax,
    searchQuery,
    eventCatFilter,
    confFeeFilter,
    confScopeFilter,
    confFormatFilter,
  ]);

  if (!session) {
    return (
      <TelegramAuthGate
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        enabledModules={enabledModules}
        onToggleModule={handleToggleModule}
        onAuthenticated={(authSession, liveInsights) => {
          setSession(authSession);
          if (liveInsights.length > 0) {
            setInsights(liveInsights);
          }
        }}
      />
    );
  }

  const moduleIcons: Record<ModuleId, React.ReactNode> = {
    events: <Calendar className="w-3.5 h-3.5" />,
    conferences: <BookOpen className="w-3.5 h-3.5" />,
    volunteering: <HeartHandshake className="w-3.5 h-3.5" />,
    scholarships: <GraduationCap className="w-3.5 h-3.5" />,
    competitions: <Trophy className="w-3.5 h-3.5" />,
  };

  return (
    <div className="min-h-screen bg-[var(--tg-bg)] text-[var(--tg-text)] pb-14">
      {/* Compact Single-Line Telegram Header */}
      <header className="sticky top-0 z-30 bg-[var(--tg-surface)] border-b border-[var(--tg-border)] shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-2">
          <AcasLogo size="sm" />

          <div className="flex items-center gap-1.5">
            <div className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>2FA • {session.connectedChannelsCount} kanal</span>
            </div>

            <button
              type="button"
              onClick={handleLiveSyncChannels}
              disabled={isSyncing}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-[#2481CC] hover:opacity-90 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Yangilash</span>
            </button>

            <button
              type="button"
              onClick={() => setShowModuleDrawer(!showModuleDrawer)}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition ${
                showModuleDrawer
                  ? 'bg-[var(--tg-primary)] text-white border-[var(--tg-primary)]'
                  : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)] text-[var(--tg-text)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Bo‘limlar ({efficiency.activeCount}/5)</span>
            </button>

            {/* Light / Dark Mode Switcher */}
            <button
              type="button"
              onClick={() => setIsDark(!isDark)}
              title={isDark ? 'Kunduzgi rejim (Light)' : 'Tungi rejim (Dark)'}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-xs font-medium text-[var(--tg-text)]"
            >
              {isDark ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-[#2481CC]" />
              )}
              <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSession(null)}
              title="Chiqish"
              className="p-1.5 rounded-lg bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-[var(--tg-muted)] hover:text-rose-500 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modular ON/OFF Drawer */}
        {showModuleDrawer && (
          <div className="max-w-4xl mx-auto px-4 py-2.5 border-t border-[var(--tg-border)] bg-[var(--tg-surface-alt)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--tg-muted)]">
                Keraksiz bo‘limlarni o‘chirib qo‘ysangiz, tizim tezroq ishlaydi:
              </span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 text-[11px]">
                <Zap className="w-3 h-3 inline" /> ~{efficiency.estimatedScanMs}ms
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {MODULE_ORDER.map((id) => {
                const mod = ACAS_MODULES[id];
                const active = enabledModules[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleToggleModule(id)}
                    className={`px-2.5 py-1.5 rounded-lg border text-left text-xs flex items-center justify-between transition ${
                      active
                        ? 'bg-[var(--tg-surface)] border-[#2481CC] text-[var(--tg-text)] font-semibold'
                        : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)] text-[var(--tg-muted)] opacity-60'
                    }`}
                  >
                    <span className="truncate">{mod.shortTitle}</span>
                    <span className="text-[10px] font-mono text-[#2481CC]">
                      {active ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Single-Row Module Tabs */}
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-[var(--tg-border)]">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeTab === 'all'
                ? 'bg-[var(--tg-primary)] text-white'
                : 'bg-[var(--tg-surface-alt)] text-[var(--tg-text)] border border-[var(--tg-border)]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Barchasi ({insights.filter((i) => enabledModules[i.moduleId]).length})</span>
          </button>

          {MODULE_ORDER.filter((id) => enabledModules[id]).map((id) => {
            const mod = ACAS_MODULES[id];
            const count = insights.filter((i) => i.moduleId === id).length;
            const isSelected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  isSelected
                    ? 'bg-[var(--tg-primary)] text-white'
                    : 'bg-[var(--tg-surface-alt)] text-[var(--tg-text)] border border-[var(--tg-border)]'
                }`}
              >
                {moduleIcons[id]}
                <span>{mod.shortTitle}</span>
                <span className="text-[10px] font-mono opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-3.5">
        {syncBanner && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400">
            {syncBanner}
          </div>
        )}

        <VisualDashboard
          items={insights.filter((i) => enabledModules[i.moduleId])}
          enabledModules={enabledModules}
          selectedHorizon={timeHorizon}
          onSelectHorizon={setTimeHorizon}
          onSelectModuleTab={setActiveTab}
          onAddParsedInsights={handleAddParsedInsights}
        />

        {/* Search & Time Horizon Bar */}
        <div className="rounded-2xl bg-[var(--tg-surface)] border border-[var(--tg-border)] p-3.5 shadow-sm space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[var(--tg-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Qidiruv: Zakovat, Debate, Scopus, Avtoreferat, Stipendiya, Volontyor..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-xs text-[var(--tg-text)] placeholder:text-[var(--tg-muted)] focus:outline-none focus:border-[#2481CC]"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: 'Barcha vaqt' },
                  { id: '1d', label: '1 kun' },
                  { id: '2-3d', label: '2–3 kun' },
                  { id: '1w', label: '1 hafta' },
                  { id: '1m', label: '1 oy' },
                  { id: '3-4m', label: '3–4 oy' },
                  { id: 'custom', label: 'Moslash' },
                ] as { id: TimeHorizonPreset; label: string }[]
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setTimeHorizon(preset.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap border transition ${
                    timeHorizon === preset.id
                      ? 'bg-[var(--tg-primary-soft)] text-[#2481CC] border-[#2481CC] font-semibold'
                      : 'bg-[var(--tg-surface-alt)] text-[var(--tg-muted)] border-[var(--tg-border)]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {timeHorizon === 'custom' && (
            <div className="flex items-center gap-3 pt-1 text-xs">
              <span className="whitespace-nowrap">
                Kun oralig‘i: <strong className="text-[#2481CC] font-mono">1 – {customDaysMax} kun</strong>
              </span>
              <input
                type="range"
                min={1}
                max={150}
                value={customDaysMax}
                onChange={(e) => setCustomDaysMax(Number(e.target.value))}
                className="w-full accent-[#2481CC]"
              />
            </div>
          )}

          {(activeTab === 'events' || activeTab === 'all') && enabledModules.events && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--tg-border)]">
              <span className="text-[11px] text-[var(--tg-muted)] mr-1">Tadbir / Musobaqa:</span>
              {(['Barchasi', 'Zakovat', 'Debate', 'Seminar', 'Tadbir'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setEventCatFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                    eventCatFilter === cat
                      ? 'bg-[var(--tg-primary)] text-white border-[var(--tg-primary)]'
                      : 'bg-[var(--tg-surface-alt)] text-[var(--tg-muted)] border-[var(--tg-border)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {(activeTab === 'conferences' || activeTab === 'all') && enabledModules.conferences && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--tg-border)]">
              <span className="text-[11px] text-[var(--tg-muted)] mr-1">Ilmiy Filtr:</span>
              {(['Barchasi', 'Tekin', 'Pulli'] as const).map((fee) => (
                <button
                  key={fee}
                  type="button"
                  onClick={() => setConfFeeFilter(fee)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border transition ${
                    confFeeFilter === fee
                      ? 'bg-[var(--tg-primary-soft)] text-[#2481CC] border-[#2481CC]'
                      : 'bg-[var(--tg-surface-alt)] text-[var(--tg-muted)] border-[var(--tg-border)]'
                  }`}
                >
                  {fee}
                </button>
              ))}

              <span className="text-[var(--tg-border)]">|</span>

              {(
                ['Barchasi', 'Mahalliy', 'Mintaqaviy (Osiyo)', 'Mintaqaviy (MDH)', 'Xalqaro'] as const
              ).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setConfScopeFilter(sc)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border transition ${
                    confScopeFilter === sc
                      ? 'bg-[var(--tg-primary-soft)] text-[#2481CC] border-[#2481CC]'
                      : 'bg-[var(--tg-surface-alt)] text-[var(--tg-muted)] border-[var(--tg-border)]'
                  }`}
                >
                  {sc}
                </button>
              ))}

              <span className="text-[var(--tg-border)]">|</span>

              {(['Barchasi', 'Maqola', 'Tezis', 'Avtoreferat'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setConfFormatFilter(fmt)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border transition ${
                    confFormatFilter === fmt
                      ? 'bg-[var(--tg-primary-soft)] text-[#2481CC] border-[#2481CC]'
                      : 'bg-[var(--tg-surface-alt)] text-[var(--tg-muted)] border-[var(--tg-border)]'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Feed */}
        <div className="grid grid-cols-1 gap-2.5">
          {filteredInsights.map((item) => (
            <InsightCard key={item.id} item={item} />
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
