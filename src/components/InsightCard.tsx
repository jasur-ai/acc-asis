import React from 'react';
import {
  ExternalLink,
  Calendar,
  MapPin,
  Building2,
  Award,
  BookOpen,
  Clock,
  Users,
  Globe2,
  CheckCircle,
  Sparkles,
  FileText,
} from 'lucide-react';
import { AnyInsightItem } from '../types/acas';
import { ACAS_MODULES } from '../modules/registry';

interface InsightCardProps {
  item: AnyInsightItem;
}

export function openTelegramPostLink(url: string) {
  const tgWebApp = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } } })
    ?.Telegram?.WebApp;

  if (tgWebApp?.openTelegramLink && url.startsWith('https://t.me/')) {
    tgWebApp.openTelegramLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Clean Telegram-Native Insight Card (supports Light & Dark mode seamlessly).
 */
export const InsightCard: React.FC<InsightCardProps> = ({ item }) => {
  const modConfig = ACAS_MODULES[item.moduleId];

  const urgencyText =
    item.daysRemaining <= 1
      ? '🔥 1 kun qoldi'
      : item.daysRemaining <= 3
      ? `⚡ ${item.daysRemaining} kun qoldi`
      : item.daysRemaining >= 60
      ? `🎯 ${Math.round(item.daysRemaining / 30)} oy oldin tayyorgarlik`
      : `${item.daysRemaining} kun qoldi`;

  return (
    <div
      onClick={() => openTelegramPostLink(item.sourceUrl)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openTelegramPostLink(item.sourceUrl);
      }}
      className="group rounded-2xl bg-[var(--tg-surface)] hover:border-[#2481CC] border border-[var(--tg-border)] p-4 transition-all duration-150 cursor-pointer shadow-sm"
    >
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[var(--tg-primary-soft)] text-[#2481CC]">
            {item.moduleId === 'events' ? item.category : modConfig.shortTitle}
          </span>

          {item.moduleId === 'conferences' && item.extractedFromDigest && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300 border border-violet-500/20">
              <Sparkles className="w-2.5 h-2.5" />
              Oylik Ro‘yxatdan
            </span>
          )}

          <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-[var(--tg-surface-alt)] border border-[var(--tg-border)] text-[var(--tg-muted)]">
            {urgencyText}
          </span>
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#2481CC] bg-[var(--tg-surface-alt)] px-2 py-0.5 rounded-md border border-[var(--tg-border)]">
          <span>@{item.channelHandle.replace(/^@/, '')}</span>
          <ExternalLink className="w-3 h-3" />
        </span>
      </div>

      {/* Title & Concise 1-Line Insight */}
      <h3 className="text-sm sm:text-base font-bold text-[var(--tg-text)] group-hover:text-[#2481CC] transition leading-snug">
        {item.title}
      </h3>
      <p className="text-xs text-[var(--tg-muted)] mt-1 leading-relaxed">
        {item.insight}
      </p>

      {/* Module-Specific Key-Value Grid */}
      <div className="mt-3 pt-2.5 border-t border-[var(--tg-border)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-[var(--tg-text)]">
        {item.moduleId === 'events' && (
          <>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#2481CC] shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Sana/Vaqt:</strong> {item.dateFormatted} • {item.timeFormatted}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Joyi:</strong> {item.location}
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:col-span-2">
              <Building2 className="w-3.5 h-3.5 text-[#2481CC] shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Tashkilotchi:</strong> {item.organizer} ({item.registrationFee})
              </span>
            </div>
          </>
        )}

        {item.moduleId === 'conferences' && (
          <>
            <div className="flex items-center gap-1.5 sm:col-span-2">
              <BookOpen className="w-3.5 h-3.5 text-[#2481CC] shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Jurnal / To‘plam:</strong>{' '}
                <span className="font-semibold text-[#2481CC]">{item.journalName}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[var(--tg-muted)] shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Tashkilotchi:</strong> {item.organizer}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Format & Qamrov:</strong>{' '}
                <span className="font-medium">{item.submissionType}</span> • {item.scope}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Deadline:</strong> {item.deadlineFormatted}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Nashr:</strong>{' '}
                <span
                  className={
                    item.publishDate === 'Berilmagan'
                      ? 'text-amber-600 dark:text-amber-400 font-mono'
                      : 'text-emerald-600 dark:text-emerald-400 font-medium'
                  }
                >
                  {item.publishDate}
                </span>{' '}
                • <strong>{item.feeAmount}</strong>
              </span>
            </div>
          </>
        )}

        {item.moduleId === 'volunteering' && (
          <>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Muddati:</strong> {item.eventDates} ({item.durationLabel})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#2481CC] shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Kvota:</strong> {item.quotaLimit}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Deadline:</strong> {item.deadlineFormatted}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-[#2481CC] shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Talablar:</strong> {item.requirements.join(' • ')}
              </span>
            </div>
          </>
        )}

        {item.moduleId === 'scholarships' && (
          <>
            <div className="flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Davlat / Turi:</strong> {item.country} • {item.programType} ({item.degreeLevel})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Stipendiya:</strong> {item.stipendAmount}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Deadline:</strong> {item.deadlineFormatted}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-[#2481CC] shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Talablar:</strong> {item.requirements.join(' • ')}
              </span>
            </div>
          </>
        )}

        {item.moduleId === 'competitions' && (
          <>
            <div className="flex items-center gap-1.5 sm:col-span-2">
              <Award className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Pul mukofoti:</strong>{' '}
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{item.prizePool}</span>
              </span>
            </div>
            <div className="flex items-start gap-1.5 sm:col-span-2">
              <Sparkles className="w-3.5 h-3.5 text-[#2481CC] shrink-0 mt-0.5" />
              <div className="text-[11px]">
                <strong className="text-[var(--tg-muted)] font-normal">Bosqichlar tartibi:</strong>{' '}
                <span>{item.stageOrder.join(' → ')}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:col-span-2">
              <FileText className="w-3.5 h-3.5 text-[#2481CC] shrink-0" />
              <span className="truncate">
                <strong className="text-[var(--tg-muted)] font-normal">Kerakli hujjatlar:</strong> {item.requiredDocs.join(' • ')}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
