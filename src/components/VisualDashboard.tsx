import React, { useState } from 'react';
import {
  BarChart3,
  Zap,
  Sparkles,
  FileStack,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AnyInsightItem, ModuleId, TimeHorizonPreset } from '../types/acas';
import { calculatePipelineEfficiency } from '../modules/registry';

interface VisualDashboardProps {
  items: AnyInsightItem[];
  enabledModules: Record<ModuleId, boolean>;
  selectedHorizon: TimeHorizonPreset;
  onSelectHorizon: (h: TimeHorizonPreset) => void;
  onSelectModuleTab: (m: ModuleId | 'all') => void;
  onAddParsedInsights: (newItems: AnyInsightItem[]) => void;
}

export const VisualDashboard: React.FC<VisualDashboardProps> = ({
  items,
  enabledModules,
  selectedHorizon,
  onSelectHorizon,
  onAddParsedInsights,
}) => {
  const [showDigestAnalyzer, setShowDigestAnalyzer] = useState<boolean>(false);
  const [rawInputText, setRawInputText] = useState<string>('');
  const [lastExtractedCount, setLastExtractedCount] = useState<number | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);

  const efficiency = calculatePipelineEfficiency(enabledModules);

  const urgentCount = items.filter((i) => i.daysRemaining <= 3).length;
  const weekCount = items.filter((i) => i.daysRemaining > 3 && i.daysRemaining <= 7).length;
  const monthCount = items.filter((i) => i.daysRemaining > 7 && i.daysRemaining <= 31).length;
  const longPrepCount = items.filter((i) => i.daysRemaining > 31).length;

  const handleRunLiveDigestExtraction = async () => {
    if (!rawInputText.trim()) return;
    setIsParsing(true);
    try {
      const res = await fetch('/api/insights/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawInputText,
          enabledModules,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setLastExtractedCount(data.extractedCount || 0);
        if (data.items && data.items.length > 0) {
          onAddParsedInsights(data.items);
        }
      }
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Compact Telegram-Native KPI Row */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-[var(--tg-surface)] border border-[var(--tg-border)] p-3 shadow-sm">
          <div className="flex items-center justify-between text-[11px] text-[var(--tg-muted)]">
            <span>Ajratilgan Insight</span>
            <Sparkles className="w-3.5 h-3.5 text-[#2481CC]" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono text-[var(--tg-text)] mt-0.5">
            {items.length} ta
          </div>
          <div className="text-[10px] text-[var(--tg-muted)] truncate">
            Hisobingizdagi kanallardan
          </div>
        </div>

        <div className="rounded-xl bg-[var(--tg-surface)] border border-[var(--tg-border)] p-3 shadow-sm">
          <div className="flex items-center justify-between text-[11px] text-[var(--tg-muted)]">
            <span>Tezlik & Modullar</span>
            <Zap className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
            ~{efficiency.estimatedScanMs}ms
          </div>
          <div className="text-[10px] text-[var(--tg-muted)] truncate">
            {efficiency.activeCount}/{efficiency.totalCount} bo‘lim faol
          </div>
        </div>

        <div className="rounded-xl bg-[var(--tg-surface)] border border-[var(--tg-border)] p-3 shadow-sm">
          <div className="flex items-center justify-between text-[11px] text-[var(--tg-muted)]">
            <span>Oylik Ro‘yxat</span>
            <FileStack className="w-3.5 h-3.5 text-[#2481CC]" />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono text-[#2481CC] mt-0.5">
            Avto-Split
          </div>
          <div className="text-[10px] text-[var(--tg-muted)] truncate">
            Jurnal + Deadline + Nashr
          </div>
        </div>
      </div>

      {/* Time Horizon Quick Radar */}
      <div className="rounded-2xl bg-[var(--tg-surface)] border border-[var(--tg-border)] p-3.5 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tg-text)]">
            <Clock className="w-3.5 h-3.5 text-[#2481CC]" />
            <span>Muddatlar Taqsimoti</span>
          </div>
          {selectedHorizon !== 'all' && (
            <button
              type="button"
              onClick={() => onSelectHorizon('all')}
              className="text-[11px] text-[#2481CC] font-medium hover:underline"
            >
              Barchasini ko‘rsatish
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => onSelectHorizon(selectedHorizon === '2-3d' ? 'all' : '2-3d')}
            className={`p-2 rounded-xl border text-left transition ${
              selectedHorizon === '1d' || selectedHorizon === '2-3d'
                ? 'bg-[var(--tg-primary-soft)] border-[#2481CC]'
                : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)]'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-[var(--tg-text)]">
              <span>1–3 kun</span>
              <span className="font-mono font-bold text-rose-500">{urgentCount}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectHorizon(selectedHorizon === '1w' ? 'all' : '1w')}
            className={`p-2 rounded-xl border text-left transition ${
              selectedHorizon === '1w'
                ? 'bg-[var(--tg-primary-soft)] border-[#2481CC]'
                : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)]'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-[var(--tg-text)]">
              <span>1 hafta</span>
              <span className="font-mono font-bold text-amber-500">{urgentCount + weekCount}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectHorizon(selectedHorizon === '1m' ? 'all' : '1m')}
            className={`p-2 rounded-xl border text-left transition ${
              selectedHorizon === '1m'
                ? 'bg-[var(--tg-primary-soft)] border-[#2481CC]'
                : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)]'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-[var(--tg-text)]">
              <span>1 oy</span>
              <span className="font-mono font-bold text-[#2481CC]">{urgentCount + weekCount + monthCount}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectHorizon(selectedHorizon === '3-4m' ? 'all' : '3-4m')}
            className={`p-2 rounded-xl border text-left transition ${
              selectedHorizon === '3-4m'
                ? 'bg-[var(--tg-primary-soft)] border-[#2481CC]'
                : 'bg-[var(--tg-surface-alt)] border-[var(--tg-border)]'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-[var(--tg-text)]">
              <span>3–4 oy (Tayyorgarlik)</span>
              <span className="font-mono font-bold text-emerald-500">{longPrepCount}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Collapsible Monthly Conference Digest Extractor */}
      <div className="rounded-2xl bg-[var(--tg-surface)] border border-[var(--tg-border)] shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDigestAnalyzer(!showDigestAnalyzer)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-[var(--tg-surface-alt)] transition"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#2481CC]" />
            <span className="text-xs font-semibold text-[var(--tg-text)]">
              Oylik Anjumanlar Ro‘yxatidan Credentials Ajratish
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#2481CC] font-medium">
            <span>{showDigestAnalyzer ? 'Yopish' : 'Ochish'}</span>
            {showDigestAnalyzer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showDigestAnalyzer && (
          <div className="p-4 pt-2 border-t border-[var(--tg-border)] space-y-2.5">
            <textarea
              value={rawInputText}
              onChange={(e) => setRawInputText(e.target.value)}
              placeholder="Kanalda tashlangan oylik anjumanlar ro'yxati yoki e'lon matnini shu yerga joylang..."
              rows={4}
              className="w-full p-2.5 rounded-xl bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-xs font-mono text-[var(--tg-text)] focus:outline-none focus:border-[#2481CC]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={isParsing}
                onClick={handleRunLiveDigestExtraction}
                className="px-3.5 py-2 rounded-xl bg-[var(--tg-primary)] hover:bg-[var(--tg-primary-hover)] text-white text-xs font-semibold transition"
              >
                {isParsing ? 'Tahlil qilinmoqda...' : 'Ro‘yxatni Tahlil Qilish va Ajratish'}
              </button>
              {lastExtractedCount !== null && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {lastExtractedCount} ta anjuman ajratib olindi!
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
