import {
  AnyInsightItem,
  ConferenceInsightItem,
  ConferenceScope,
  CompetitionInsightItem,
  CompetitionStageType,
  EventCategory,
  EventInsightItem,
  FeeCategory,
  FundingCoverage,
  ModuleId,
  ScholarshipInsightItem,
  StudyDegreeLevel,
  StudyProgramType,
  SubmissionFormat,
  VolunteeringInsightItem,
} from '../types/acas';

export interface RawTelegramMessage {
  channelHandle: string;
  channelTitle: string;
  messageId: number;
  postedAtIso: string;
  text: string;
}

/**
 * Builds an official clickable Telegram deep link to the exact post.
 * Supports both public @username channels and private c/<id> channels.
 */
export function buildTelegramPostUrl(channelHandle: string, messageId: number): string {
  const cleanHandle = channelHandle.replace(/^@/, '').trim();
  return `https://t.me/${cleanHandle}/${messageId}`;
}

/**
 * Concise 1-line insight synthesizer from real message text.
 */
export function distillConciseInsight(rawText: string, maxLen = 120): string {
  const cleaned = rawText
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#[a-zA-Z0-9_А-Яа-яЎўҚқҒғҲҳ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Batafsil ma’lumot original postda';
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trimEnd() + '…';
}

const UZ_MONTHS: Record<string, number> = {
  yanvar: 0,
  fevral: 1,
  mart: 2,
  aprel: 3,
  may: 4,
  iyun: 5,
  iyul: 6,
  avgust: 7,
  sentyabr: 8,
  sentabr: 8,
  oktyabr: 9,
  oktabr: 9,
  noyabr: 10,
  dekabr: 11,
};

/**
 * Extracts date string and computes real days remaining from message text.
 */
function extractDateAndHorizon(text: string): {
  dateLabel: string;
  targetDateIso: string;
  daysRemaining: number;
} {
  const now = new Date();

  // Match labeled date/deadline first
  const labeledMatch = text.match(
    /(?:Muddat|Deadline|Sana|Dedlayn|Oxirgi muddat|Qabul|Kun|Дата|Дедлайн)\s*[:\-–]\s*([^\n;|]{3,40})/i
  );

  // Or match "15-dekabr", "20 yanvar 2027", "12.12.2026"
  const inlineDateMatch = text.match(
    /\b(\d{1,2})[\s\-\.]*(yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr)(?:\s*(\d{4}))?/i
  );
  const numericDateMatch = text.match(/\b(\d{1,2})\.(\d{1,2})\.(202\d)\b/);

  let targetDate = new Date(now.getTime() + 7 * 86400000);
  let dateLabel = labeledMatch ? labeledMatch[1].trim() : 'Berilmagan';

  if (inlineDateMatch) {
    const day = Number(inlineDateMatch[1]);
    const monthName = inlineDateMatch[2].toLowerCase();
    const monthIdx = UZ_MONTHS[monthName] ?? now.getMonth();
    let year = inlineDateMatch[3] ? Number(inlineDateMatch[3]) : now.getFullYear();
    const candidate = new Date(year, monthIdx, day);
    if (candidate.getTime() < now.getTime() - 2 * 86400000 && !inlineDateMatch[3]) {
      year += 1;
    }
    targetDate = new Date(year, monthIdx, day);
    if (dateLabel === 'Berilmagan') {
      dateLabel = inlineDateMatch[0].trim();
    }
  } else if (numericDateMatch) {
    const day = Number(numericDateMatch[1]);
    const monthIdx = Number(numericDateMatch[2]) - 1;
    const year = Number(numericDateMatch[3]);
    targetDate = new Date(year, monthIdx, day);
    if (dateLabel === 'Berilmagan') {
      dateLabel = numericDateMatch[0];
    }
  }

  const diffDays = Math.max(
    1,
    Math.ceil((targetDate.getTime() - now.getTime()) / 86400000)
  );

  return {
    dateLabel,
    targetDateIso: targetDate.toISOString().split('T')[0],
    daysRemaining: diffDays,
  };
}

/**
 * Detects whether a raw Telegram message is a MONTHLY CONFERENCE DIGEST / LIST
 */
export function isMonthlyConferenceDigest(text: string): boolean {
  const lower = text.toLowerCase();
  const hasDigestHeader =
    lower.includes('anjumanlar ro‘yxati') ||
    lower.includes("anjumanlar ro'yxati") ||
    lower.includes('konferensiyalar ro‘yxati') ||
    lower.includes("konferensiyalar ro'yxati") ||
    lower.includes('oylik anjumanlar') ||
    lower.includes('ilmiy anjumanlar taqvimi');

  const numberedMatches = text.match(/(?:^|\n)\s*(?:\d+[\.\)]|[🔹🔸📌▪•])\s+/g);
  return Boolean(hasDigestHeader && numberedMatches && numberedMatches.length >= 2);
}

/**
 * Real multi-item parser for Monthly Conference Digest posts.
 */
export function parseMonthlyConferenceDigest(
  msg: RawTelegramMessage
): ConferenceInsightItem[] {
  const lines = msg.text.split(/\n+/);
  const headerLine = lines[0]?.trim() || 'Oylik Ilmiy Anjumanlar Ro‘yxati';

  const blocks = msg.text
    .split(/(?=(?:^|\n)\s*\d+[\.\)]\s+)/g)
    .map((b) => b.trim())
    .filter((b) => /^\d+[\.\)]\s+/.test(b));

  return blocks.map((block, idx) => {
    const cleanBlock = block.replace(/^\d+[\.\)]\s+/, '').trim();
    const blockLines = cleanBlock
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const title = blockLines[0]?.replace(/^[«"']|[»"']$/g, '') || `Ilmiy Anjuman #${idx + 1}`;
    const lower = cleanBlock.toLowerCase();

    const journalMatch = cleanBlock.match(
      /(?:Jurnal|To['‘]plam|Nashr nomi|Journal)\s*[:\-–]\s*([^\n;|]+)/i
    );
    const journalName = journalMatch ? journalMatch[1].trim() : 'Berilmagan';

    const orgMatch = cleanBlock.match(
      /(?:Tashkilotchi|Muassasa|Universitet|OTM)\s*[:\-–]\s*([^\n;|]+)/i
    );
    const organizer = orgMatch ? orgMatch[1].trim() : msg.channelTitle;

    let submissionType: SubmissionFormat = 'Maqola / Tezis';
    if (lower.includes('avtoreferat')) {
      submissionType = 'Avtoreferat';
    } else if (
      lower.includes('faqat maqola') ||
      (lower.includes('maqola') && !lower.includes('tezis'))
    ) {
      submissionType = 'Maqola';
    } else if (lower.includes('tezis') && !lower.includes('maqola')) {
      submissionType = 'Tezis';
    }

    const isFree =
      lower.includes('bepul') ||
      lower.includes('tekin') ||
      lower.includes('to‘lovsiz') ||
      lower.includes("to'lovsiz") ||
      lower.includes('0 so‘m');
    const feeType: FeeCategory = isFree ? 'Tekin' : 'Pulli';
    const feeMatch = cleanBlock.match(/(?:To['‘]lov|Narxi|Badal)\s*[:\-–]\s*([^\n;|]+)/i);
    const feeAmount = isFree
      ? 'Bepul'
      : feeMatch
      ? feeMatch[1].trim()
      : 'Pulli (postda ko‘rsatilgan)';

    let scope: ConferenceScope = 'Mahalliy';
    if (lower.includes('osiyo') || lower.includes('markaziy osiyo') || lower.includes('asia')) {
      scope = 'Mintaqaviy (Osiyo)';
    } else if (lower.includes('mdh') || lower.includes('sng')) {
      scope = 'Mintaqaviy (MDH)';
    } else if (lower.includes('xalqaro') || lower.includes('international')) {
      scope = 'Xalqaro';
    }

    const dateInfo = extractDateAndHorizon(cleanBlock);

    const publishMatch = cleanBlock.match(
      /(?:Nashr|Publish|Chiqish sanasi|To['‘]plam chiqishi)\s*[:\-–]\s*([^\n;|]+)/i
    );
    const publishDate = publishMatch ? publishMatch[1].trim() : 'Berilmagan';

    return {
      id: `digest-${msg.channelHandle}-${msg.messageId}-${idx + 1}`,
      moduleId: 'conferences',
      title,
      insight: `${organizer} • ${submissionType} (${scope}, ${feeType})`,
      organizer,
      journalName,
      submissionType,
      deadlineFormatted: dateInfo.dateLabel,
      publishDate,
      feeType,
      feeAmount,
      scope,
      indexing: lower.includes('scopus')
        ? 'Scopus / Web of Science'
        : lower.includes('oak')
        ? 'OAK'
        : 'Ilmiy to‘plam',
      extractedFromDigest: true,
      digestTitle: distillConciseInsight(headerLine, 70),
      targetDateIso: dateInfo.targetDateIso,
      daysRemaining: dateInfo.daysRemaining,
      channelHandle: msg.channelHandle,
      channelTitle: msg.channelTitle,
      messageId: msg.messageId,
      sourceUrl: buildTelegramPostUrl(msg.channelHandle, msg.messageId),
      postedAtIso: msg.postedAtIso,
      confidence: 0.95,
      tags: ['Oylik Ro‘yxatdan', scope, submissionType, feeType],
    };
  });
}

/**
 * Parses a real Telegram channel post ONLY against enabled modules.
 * Zero hardcoded mock locations or fake prizes.
 */
export function parseTelegramMessageModular(
  msg: RawTelegramMessage,
  enabledModules: Record<ModuleId, boolean>
): AnyInsightItem[] {
  const lower = msg.text.toLowerCase();
  const nonEmptyLines = msg.text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (nonEmptyLines.length === 0) return [];

  const titleLine = nonEmptyLines[0].replace(/^[^\wА-Яа-яЎўҚқҒғҲҳ«"']+/, '').trim();
  const bodyLines = nonEmptyLines.slice(1).join(' ');
  const dateInfo = extractDateAndHorizon(msg.text);

  // 1. Monthly Conference Digest
  if (enabledModules.conferences && isMonthlyConferenceDigest(msg.text)) {
    return parseMonthlyConferenceDigest(msg);
  }

  // 2. Single Conference / Scientific Article Call
  if (
    enabledModules.conferences &&
    (lower.includes('anjuman') ||
      lower.includes('konferensiya') ||
      lower.includes('maqola qabul') ||
      lower.includes('tezis') ||
      lower.includes('avtoreferat') ||
      lower.includes('ilmiy jurnal') ||
      lower.includes('scopus'))
  ) {
    const publishMatch = msg.text.match(
      /(?:Nashr|Publish|Chiqish sanasi)\s*[:\-–]\s*([^\n]+)/i
    );
    const journalMatch = msg.text.match(
      /(?:Jurnal|To['‘]plam|Journal)\s*[:\-–]\s*([^\n]+)/i
    );
    const orgMatch = msg.text.match(
      /(?:Tashkilotchi|Muassasa|Universitet|OTM)\s*[:\-–]\s*([^\n]+)/i
    );
    const feeMatch = msg.text.match(/(?:To['‘]lov|Narxi|Badal)\s*[:\-–]\s*([^\n]+)/i);
    const isFree =
      lower.includes('bepul') || lower.includes('tekin') || lower.includes('to‘lovsiz');

    let submissionType: SubmissionFormat = 'Maqola / Tezis';
    if (lower.includes('avtoreferat')) submissionType = 'Avtoreferat';
    else if (lower.includes('tezis') && !lower.includes('maqola')) submissionType = 'Tezis';
    else if (lower.includes('maqola') && !lower.includes('tezis')) submissionType = 'Maqola';

    let scope: ConferenceScope = 'Mahalliy';
    if (lower.includes('osiyo') || lower.includes('asia')) scope = 'Mintaqaviy (Osiyo)';
    else if (lower.includes('mdh') || lower.includes('sng')) scope = 'Mintaqaviy (MDH)';
    else if (lower.includes('xalqaro') || lower.includes('international')) scope = 'Xalqaro';

    const item: ConferenceInsightItem = {
      id: `conf-${msg.channelHandle}-${msg.messageId}`,
      moduleId: 'conferences',
      title: distillConciseInsight(titleLine, 90),
      insight: distillConciseInsight(bodyLines || titleLine, 115),
      organizer: orgMatch ? orgMatch[1].trim() : msg.channelTitle,
      journalName: journalMatch ? journalMatch[1].trim() : 'Berilmagan',
      submissionType,
      deadlineFormatted: dateInfo.dateLabel,
      publishDate: publishMatch ? publishMatch[1].trim() : 'Berilmagan',
      feeType: isFree ? 'Tekin' : 'Pulli',
      feeAmount: isFree ? 'Bepul' : feeMatch ? feeMatch[1].trim() : 'Pulli',
      scope,
      indexing: lower.includes('scopus')
        ? 'Scopus'
        : lower.includes('oak')
        ? 'OAK'
        : 'Ilmiy nashr',
      targetDateIso: dateInfo.targetDateIso,
      daysRemaining: dateInfo.daysRemaining,
      channelHandle: msg.channelHandle,
      channelTitle: msg.channelTitle,
      messageId: msg.messageId,
      sourceUrl: buildTelegramPostUrl(msg.channelHandle, msg.messageId),
      postedAtIso: msg.postedAtIso,
      confidence: 0.92,
      tags: [scope, submissionType, isFree ? 'Tekin' : 'Pulli'],
    };
    return [item];
  }

  // 3. Volunteering
  if (
    enabledModules.volunteering &&
    (lower.includes('volontyor') ||
      lower.includes('volunteer') ||
      lower.includes('ko‘ngilli') ||
      lower.includes("ko'ngilli"))
  ) {
    const reqMatch = msg.text.match(/(?:Talablar|Requirements)\s*[:\-–]\s*([^\n]+)/i);
    const durMatch = msg.text.match(/(\d+)\s*kun\s*(?:davom|mobaynida)?/i);
    const quotaMatch = msg.text.match(/(?:Kvota|O['‘]rinlar|Chegara|Limit)\s*[:\-–]\s*([^\n]+)/i);
    const linkMatch = msg.text.match(/https?:\/\/\S+/i);

    const durationDays = durMatch ? Number(durMatch[1]) : 1;

    const item: VolunteeringInsightItem = {
      id: `vol-${msg.channelHandle}-${msg.messageId}`,
      moduleId: 'volunteering',
      title: distillConciseInsight(titleLine, 90),
      insight: distillConciseInsight(bodyLines || titleLine, 115),
      organization: msg.channelTitle,
      eventDates: dateInfo.dateLabel,
      durationDays,
      durationLabel: durMatch ? `${durationDays} kun` : 'Berilmagan',
      requirements: reqMatch ? [reqMatch[1].trim()] : ['Postda ko‘rsatilgan talablar'],
      quotaLimit: quotaMatch ? quotaMatch[1].trim() : 'Berilmagan',
      deadlineFormatted: dateInfo.dateLabel,
      registrationLink: linkMatch
        ? linkMatch[0]
        : buildTelegramPostUrl(msg.channelHandle, msg.messageId),
      perks: [],
      targetDateIso: dateInfo.targetDateIso,
      daysRemaining: dateInfo.daysRemaining,
      channelHandle: msg.channelHandle,
      channelTitle: msg.channelTitle,
      messageId: msg.messageId,
      sourceUrl: buildTelegramPostUrl(msg.channelHandle, msg.messageId),
      postedAtIso: msg.postedAtIso,
      confidence: 0.92,
      tags: ['Volontyorlik'],
    };
    return [item];
  }

  // 4. Scholarships & Exchange
  if (
    enabledModules.scholarships &&
    (lower.includes('stipendiya') ||
      lower.includes('exchange') ||
      lower.includes('scholarship') ||
      lower.includes('almashinuv') ||
      lower.includes('erasmus') ||
      lower.includes('daad') ||
      lower.includes('fellowship'))
  ) {
    const countryMatch = msg.text.match(/(?:Davlat|Mamlakat|Country)\s*[:\-–]\s*([^\n]+)/i);
    const reqMatch = msg.text.match(/(?:Talablar|Requirements)\s*[:\-–]\s*([^\n]+)/i);
    const stipendMatch = msg.text.match(/(?:Stipendiya|Grant miqdori|Qoplash)\s*[:\-–]\s*([^\n]+)/i);
    const linkMatch = msg.text.match(/https?:\/\/\S+/i);

    let programType: StudyProgramType = 'Stipendiya';
    if (lower.includes('exchange') || lower.includes('almashinuv')) programType = 'Exchange';
    else if (lower.includes('summer school')) programType = 'Summer School';
    else if (lower.includes('fellowship') || lower.includes('grant'))
      programType = 'Grant / Fellowship';

    let degreeLevel: StudyDegreeLevel = 'Barcha bosqichlar';
    if (lower.includes('bakalavr') && !lower.includes('magistr')) degreeLevel = 'Bakalavr';
    else if (lower.includes('magistr') && !lower.includes('bakalavr')) degreeLevel = 'Magistratura';
    else if (lower.includes('phd') || lower.includes('doktorant'))
      degreeLevel = 'PhD / Izlanuvchi';

    const coverage: FundingCoverage =
      lower.includes('fully funded') || lower.includes('to‘liq') || lower.includes("to'liq")
        ? "To'liq (Fully Funded)"
        : 'Qisman (Partial)';

    const item: ScholarshipInsightItem = {
      id: `sch-${msg.channelHandle}-${msg.messageId}`,
      moduleId: 'scholarships',
      title: distillConciseInsight(titleLine, 90),
      insight: distillConciseInsight(bodyLines || titleLine, 115),
      hostInstitution: msg.channelTitle,
      country: countryMatch ? countryMatch[1].trim() : 'Xalqaro',
      programType,
      degreeLevel,
      coverage,
      stipendAmount: stipendMatch ? stipendMatch[1].trim() : coverage,
      requirements: reqMatch ? [reqMatch[1].trim()] : ['Postda ko‘rsatilgan'],
      deadlineFormatted: dateInfo.dateLabel,
      applicationLink: linkMatch
        ? linkMatch[0]
        : buildTelegramPostUrl(msg.channelHandle, msg.messageId),
      targetDateIso: dateInfo.targetDateIso,
      daysRemaining: dateInfo.daysRemaining,
      channelHandle: msg.channelHandle,
      channelTitle: msg.channelTitle,
      messageId: msg.messageId,
      sourceUrl: buildTelegramPostUrl(msg.channelHandle, msg.messageId),
      postedAtIso: msg.postedAtIso,
      confidence: 0.93,
      tags: [programType, degreeLevel],
    };
    return [item];
  }

  // 5. Competitions & Multi-stage Awards
  if (
    enabledModules.competitions &&
    (lower.includes('tanlov') ||
      lower.includes('mukofot') ||
      lower.includes('universitet bosqichi') ||
      lower.includes('respublika bosqichi') ||
      lower.includes('sovrin jamg‘armasi'))
  ) {
    const prizeMatch = msg.text.match(
      /(?:Mukofot|Sovrin|Pul mukofoti|Fond)\s*[:\-–]\s*([^\n]+)/i
    );
    const docsMatch = msg.text.match(/(?:Hujjatlar|Talab etiladi|Kerakli)\s*[:\-–]\s*([^\n]+)/i);
    const stagesMatch = msg.text.match(/(?:Bosqichlar|Tartibi)\s*[:\-–]\s*([^\n]+)/i);

    let currentStage: CompetitionStageType = 'Universitet bosqichi';
    if (lower.includes('xalqaro bosqich')) currentStage = 'Xalqaro bosqich';
    else if (lower.includes('respublika bosqich')) currentStage = 'Respublika bosqichi';
    else if (lower.includes('hududiy') || lower.includes('viloyat'))
      currentStage = 'Hududiy bosqich';

    const item: CompetitionInsightItem = {
      id: `comp-${msg.channelHandle}-${msg.messageId}`,
      moduleId: 'competitions',
      title: distillConciseInsight(titleLine, 90),
      insight: distillConciseInsight(bodyLines || titleLine, 115),
      organizer: msg.channelTitle,
      stageOrder: stagesMatch ? [stagesMatch[1].trim()] : [currentStage],
      currentStage,
      prizePool: prizeMatch ? prizeMatch[1].trim() : 'Berilmagan',
      requiredDocs: docsMatch ? [docsMatch[1].trim()] : ['Postda ko‘rsatilgan hujjatlar'],
      eligibility: 'Talabalar va izlanuvchilar',
      deadlineFormatted: dateInfo.dateLabel,
      registrationLink: buildTelegramPostUrl(msg.channelHandle, msg.messageId),
      targetDateIso: dateInfo.targetDateIso,
      daysRemaining: dateInfo.daysRemaining,
      channelHandle: msg.channelHandle,
      channelTitle: msg.channelTitle,
      messageId: msg.messageId,
      sourceUrl: buildTelegramPostUrl(msg.channelHandle, msg.messageId),
      postedAtIso: msg.postedAtIso,
      confidence: 0.91,
      tags: [currentStage],
    };
    return [item];
  }

  // 6. Events & Intellectual Tournaments (Zakovat, Debate, Seminar, Forum)
  if (
    enabledModules.events &&
    (lower.includes('tadbir') ||
      lower.includes('zakovat') ||
      lower.includes('debate') ||
      lower.includes('debat') ||
      lower.includes('forum') ||
      lower.includes('seminar') ||
      lower.includes('master-klass') ||
      lower.includes('hackathon') ||
      lower.includes('uchrashuv'))
  ) {
    let category: EventCategory = 'Tadbir';
    if (lower.includes('zakovat')) category = 'Zakovat';
    else if (lower.includes('debate') || lower.includes('debat')) category = 'Debate';
    else if (lower.includes('hackathon')) category = 'Hackathon';
    else if (lower.includes('seminar') || lower.includes('master-klass')) category = 'Seminar';

    const locMatch = msg.text.match(/(?:Manzil|Joy|Location|Joyi)\s*[:\-–]\s*([^\n]+)/i);
    const timeMatch = msg.text.match(/\b([012]?\d:[0-5]\d)\b/);
    const orgMatch = msg.text.match(/(?:Tashkilotchi|Mas’ul)\s*[:\-–]\s*([^\n]+)/i);
    const isOnline =
      lower.includes('online') || lower.includes('onlayn') || lower.includes('zoom');

    const item: EventInsightItem = {
      id: `evt-${msg.channelHandle}-${msg.messageId}`,
      moduleId: 'events',
      title: distillConciseInsight(titleLine, 90),
      insight: distillConciseInsight(bodyLines || titleLine, 115),
      category,
      dateFormatted: dateInfo.dateLabel,
      timeFormatted: timeMatch ? timeMatch[1] : 'Berilmagan',
      location: locMatch
        ? locMatch[1].trim()
        : isOnline
        ? 'Online / Masofaviy'
        : 'Berilmagan',
      isOnline,
      organizer: orgMatch ? orgMatch[1].trim() : msg.channelTitle,
      registrationFee:
        lower.includes('bepul') || lower.includes('tekin') ? 'Bepul' : 'Postda ko‘rsatilgan',
      targetDateIso: dateInfo.targetDateIso,
      daysRemaining: dateInfo.daysRemaining,
      channelHandle: msg.channelHandle,
      channelTitle: msg.channelTitle,
      messageId: msg.messageId,
      sourceUrl: buildTelegramPostUrl(msg.channelHandle, msg.messageId),
      postedAtIso: msg.postedAtIso,
      confidence: 0.92,
      tags: [category],
    };
    return [item];
  }

  return [];
}
