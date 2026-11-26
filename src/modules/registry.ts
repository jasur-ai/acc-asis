import { ModuleConfig, ModuleId } from '../types/acas';

/**
 * Modular Registry for acc.asis (ACAS)
 *
 * Users can toggle any module ON/OFF at login or from the header manager.
 * Disabled modules are completely bypassed during message ingestion, parsing,
 * filtering, and UI hydration for maximum performance.
 */
export const ACAS_MODULES: Record<ModuleId, ModuleConfig> = {
  events: {
    id: 'events',
    title: 'Tadbirlar va Musobaqalar',
    shortTitle: 'Tadbirlar',
    subtitle: 'Seminar, Forum, Zakovat, Debate, Hackathon va uchrashuvlar',
    badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
    accentHex: '#2AABEE',
    enabledByDefault: true,
    keywords: [
      'tadbir',
      'zakovat',
      'debate',
      'debat',
      'musobaqa',
      'forum',
      'seminar',
      'workshop',
      'master-klass',
      'hackathon',
      'quiz',
    ],
  },
  conferences: {
    id: 'conferences',
    title: 'Anjuman va Ilmiy Maqolalar',
    shortTitle: 'Ilmiy & Maqola',
    subtitle: 'Jurnallar, Tezis, Avtoreferat, Scopus/OAK va oylik anjumanlar ro‘yxati',
    badgeColor: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
    accentHex: '#8B5CF6',
    enabledByDefault: true,
    keywords: [
      'anjuman',
      'konferensiya',
      'maqola',
      'tezis',
      'avtoreferat',
      'jurnal',
      'scopus',
      'oak',
      'simpozium',
      'ilmiy',
      'nashr',
    ],
  },
  volunteering: {
    id: 'volunteering',
    title: 'Volontyorlik Imkoniyatlari',
    shortTitle: 'Volontyorlik',
    subtitle: 'Talablar, davomiylik kunlari, kvota chegarasi va ro‘yxatdan o‘tish',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    accentHex: '#10B981',
    enabledByDefault: true,
    keywords: [
      'volontyor',
      'volunteer',
      'volontyorlik',
      'ko‘ngilli',
      'kongilli',
      'yordamchi',
      'ambassador',
    ],
  },
  scholarships: {
    id: 'scholarships',
    title: 'O‘qish va Stipendiyalar',
    shortTitle: 'Stipendiya & Exchange',
    subtitle: 'Xalqaro exchange dasturlari, grantlar, summer school va stipendiyalar',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    accentHex: '#F59E0B',
    enabledByDefault: true,
    keywords: [
      'stipendiya',
      'exchange',
      'almashinuv',
      'scholarship',
      'erasmus',
      'daad',
      'fellowship',
      'grant',
      'summer school',
    ],
  },
  competitions: {
    id: 'competitions',
    title: 'Tanlovlar va Mukofotlar',
    shortTitle: 'Tanlovlar',
    subtitle: 'Universitet va respublika bosqichlari, pul mukofotlari va kerakli hujjatlar',
    badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
    accentHex: '#F43F5E',
    enabledByDefault: true,
    keywords: [
      'tanlov',
      'mukofot',
      'sovrin',
      'bosqich',
      'universitet bosqichi',
      'pul mukofoti',
      'stipendiya tanlovi',
      'startap tanlovi',
    ],
  },
};

export const MODULE_ORDER: ModuleId[] = [
  'events',
  'conferences',
  'volunteering',
  'scholarships',
  'competitions',
];

export const DEFAULT_ENABLED_MODULES: Record<ModuleId, boolean> = {
  events: true,
  conferences: true,
  volunteering: true,
  scholarships: true,
  competitions: true,
};

/**
 * Calculates runtime efficiency gain when the user disables unneeded modules.
 */
export function calculatePipelineEfficiency(enabledModules: Record<ModuleId, boolean>): {
  activeCount: number;
  totalCount: number;
  speedupPercent: number;
  estimatedScanMs: number;
} {
  const totalCount = MODULE_ORDER.length;
  const activeCount = MODULE_ORDER.filter((id) => enabledModules[id]).length;
  const skippedCount = totalCount - activeCount;
  const speedupPercent = Math.round((skippedCount / totalCount) * 100);
  // Base scan latency per module is ~38ms per batch of 1000 messages
  const estimatedScanMs = Math.max(25, activeCount * 38);

  return {
    activeCount,
    totalCount,
    speedupPercent,
    estimatedScanMs,
  };
}
