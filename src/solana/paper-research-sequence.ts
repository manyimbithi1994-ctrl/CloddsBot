import type { RugcheckStageDecision } from './paper-rugcheck-stage';
import type { DexStageResult } from './paper-dexscreener-stage';

/** Strict research ordering; no virtual trade authorization. */
export function nextPaperResearchStage(
  rugcheck: RugcheckStageDecision | null,
  dex: DexStageResult | null
): 'RUGCHECK' | 'DEXSCREENER' | 'QUICKNODE' | 'STOP' {
  if (!rugcheck) return 'RUGCHECK';
  if (rugcheck.stage !== 'RUGCHECK' || rugcheck.status !== 'REVIEW_FOR_DEXSCREENER' ||
      !Array.isArray(rugcheck.reasons) || rugcheck.reasons.length !== 0 ||
      rugcheck.paperEntryEligible !== false || rugcheck.automatedTradingEligible !== false) return 'STOP';
  if (!dex) return 'DEXSCREENER';
  if (dex.stage !== 'DEXSCREENER' || dex.status !== 'REVIEW_FOR_QUICKNODE' ||
      !Array.isArray(dex.reasons) || dex.reasons.length !== 0 ||
      dex.paperEntryEligible !== false || dex.automatedTradingEligible !== false) return 'STOP';
  if (typeof dex.pairAddress !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(dex.pairAddress)) return 'STOP';
  return 'QUICKNODE';
}
