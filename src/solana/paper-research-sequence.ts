import type { RugcheckStageDecision } from './paper-rugcheck-stage';
import type { DexStageResult } from './paper-dexscreener-stage';

/** Strict research ordering; no virtual trade authorization. */
export function nextPaperResearchStage(
  rugcheck: RugcheckStageDecision | null,
  dex: DexStageResult | null
): 'RUGCHECK' | 'DEXSCREENER' | 'QUICKNODE' | 'STOP' {
  if (!rugcheck) return 'RUGCHECK';
  if (rugcheck.status !== 'REVIEW_FOR_DEXSCREENER') return 'STOP';
  if (!dex) return 'DEXSCREENER';
  if (dex.status !== 'REVIEW_FOR_QUICKNODE') return 'STOP';
  if (!dex.pairAddress) return 'STOP';
  return 'QUICKNODE';
}
