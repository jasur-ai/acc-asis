/**
 * acc.asis (ACAS) — Core Domain Types & Modular Architecture Contracts
 *
 * Designed so each of the 5 intelligence modules can be independently enabled/disabled
 * at runtime for maximum speed, low memory footprint, and zero visual clutter.
 */

export type ModuleId =
  | 'events'        // 1. Tadbirlar va Musobaqalar (Zakovat, Debate, Forum, Seminar)
  | 'conferences'   // 2. Ilmiy Anjumanlar va Maqolalar (Jurnal, Tezis, Avtoreferat, Oylik Ro'yxat)
  | 'volunteering'  // 3. Volontyorlik Imkoniyatlari (Talablar, Muddat, Limit, Link)
  | 'scholarships'  // 4. O'qish, Exchange va Stipendiyalar (Xalqaro grantlar, Almashinuv)
  | 'competitions'; // 5. Tanlovlar va Mukofotlar (Bosqichlar tartibi, Pul mukofoti, Hujjatlar)

export interface ModuleConfig {
  id: ModuleId;
  title: string;
  shortTitle: string;
  subtitle: string;
  badgeColor: string;
  accentHex: string;
  enabledByDefault: boolean;
  keywords: string[];
}

export type TimeHorizonPreset =
  | 'all'
  | '1d'      // 1 kun ichida
  | '2-3d'    // 2–3 kun oralig'ida
  | '1w'      // 1 hafta oralig'ida
  | '1m'      // 1 oy oralig'ida
  | '3-4m'    // 3–4 oy (oldindan tayyorgarlik uchun)
  | 'custom'; // Moslashtirilgan kun oralig'i

export interface BaseInsightItem {
  id: string;
  moduleId: ModuleId;
  title: string;
  /** Concise 1-sentence actionable summary — never a wall of text */
  insight: string;
  /** ISO date string of target event or deadline */
  targetDateIso: string;
  /** Days remaining from reference date (computed or static) */
  daysRemaining: number;
  /** Original Telegram channel or group handle (e.g. @uz_science_grants) */
  channelHandle: string;
  channelTitle: string;
  messageId: number;
  /** Direct clickable reference link to the exact Telegram post */
  sourceUrl: string;
  postedAtIso: string;
  /** Confidence score of parser extraction (0.0 - 1.0) */
  confidence: number;
  tags: string[];
}

/**
 * 1-BO'LIM: Tadbirlar va Musobaqalar (Zakovat, Debate, Hackathon, Seminar, Forum)
 */
export type EventCategory = 'Tadbir' | 'Zakovat' | 'Debate' | 'Hackathon' | 'Quiz' | 'Seminar';

export interface EventInsightItem extends BaseInsightItem {
  moduleId: 'events';
  category: EventCategory;
  dateFormatted: string;
  timeFormatted: string;
  location: string;
  isOnline: boolean;
  organizer: string;
  registrationFee: string;
}

/**
 * 2-BO'LIM: Anjumanlar va Ilmiy Maqolalar
 * Supports single announcements AND monthly conference digest lists.
 */
export type SubmissionFormat = 'Maqola' | 'Tezis' | 'Avtoreferat' | 'Maqola / Tezis';
export type FeeCategory = 'Tekin' | 'Pulli';
export type ConferenceScope = 'Mahalliy' | 'Mintaqaviy (Osiyo)' | 'Mintaqaviy (MDH)' | 'Xalqaro';

export interface ConferenceInsightItem extends BaseInsightItem {
  moduleId: 'conferences';
  organizer: string;
  journalName: string;
  submissionType: SubmissionFormat;
  deadlineFormatted: string;
  /** Explicit publish date or "Berilmagan" if omitted in source post */
  publishDate: string;
  feeType: FeeCategory;
  feeAmount: string;
  scope: ConferenceScope;
  indexing: string; // e.g., "Scopus / OAK", "Google Scholar", "OAK ro'yxati"
  /** True if automatically split from a monthly multi-conference list post */
  extractedFromDigest?: boolean;
  digestTitle?: string;
}

/**
 * 3-BO'LIM: Volontyorlik Imkoniyatlari
 */
export interface VolunteeringInsightItem extends BaseInsightItem {
  moduleId: 'volunteering';
  organization: string;
  eventDates: string;
  durationDays: number;
  durationLabel: string;
  requirements: string[];
  quotaLimit: string;
  deadlineFormatted: string;
  registrationLink: string;
  perks: string[];
}

/**
 * 4-BO'LIM: O'qish, Exchange va Stipendiyalar
 */
export type StudyProgramType = 'Exchange' | 'Stipendiya' | 'Grant / Fellowship' | 'Summer School';
export type StudyDegreeLevel = 'Bakalavr' | 'Magistratura' | 'PhD / Izlanuvchi' | 'Barcha bosqichlar';
export type FundingCoverage = 'To\'liq (Fully Funded)' | 'Qisman (Partial)' | 'Oylik stipendiya';

export interface ScholarshipInsightItem extends BaseInsightItem {
  moduleId: 'scholarships';
  hostInstitution: string;
  country: string;
  programType: StudyProgramType;
  degreeLevel: StudyDegreeLevel;
  coverage: FundingCoverage;
  stipendAmount: string;
  requirements: string[];
  deadlineFormatted: string;
  applicationLink: string;
}

/**
 * 5-BO'LIM: Tanlovlar va Mukofotlar
 */
export type CompetitionStageType =
  | 'Universitet bosqichi'
  | 'Hududiy bosqich'
  | 'Respublika bosqichi'
  | 'Xalqaro bosqich';

export interface CompetitionInsightItem extends BaseInsightItem {
  moduleId: 'competitions';
  organizer: string;
  /** Full progression order, e.g. "1. Fakultet -> 2. Universitet -> 3. Respublika" */
  stageOrder: string[];
  currentStage: CompetitionStageType;
  prizePool: string;
  requiredDocs: string[];
  eligibility: string;
  deadlineFormatted: string;
  registrationLink: string;
}

export type AnyInsightItem =
  | EventInsightItem
  | ConferenceInsightItem
  | VolunteeringInsightItem
  | ScholarshipInsightItem
  | CompetitionInsightItem;

/**
 * Telegram Account Connection & Mandatory 2FA Security State
 */
export type AuthStep =
  | 'phone_input'
  | 'code_input'
  | '2fa_required'
  | '2fa_missing_blocked'
  | 'authenticated';

export interface TelegramAccountSession {
  phoneNumber: string;
  username?: string;
  firstName?: string;
  twoFactorVerified: boolean;
  connectedChannelsCount: number;
  scannedMessagesCount: number;
  lastSyncedAtIso: string;
  mode: 'live_mtproto' | 'verified_sandbox';
}

export interface UserPreferences {
  enabledModules: Record<ModuleId, boolean>;
  defaultHorizon: TimeHorizonPreset;
  customDaysMax: number;
}
