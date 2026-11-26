import { AnyInsightItem } from '../types/acas';

/**
 * Clean production state: zero pre-populated demo items.
 * All insights come exclusively from the user's authenticated Telegram account via GramJS MTProto.
 */
export const CURATED_INSIGHTS: AnyInsightItem[] = [];
