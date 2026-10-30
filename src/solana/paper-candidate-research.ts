/** Research-only screening; never feeds the order executor. */
import type { DiscoveryCandidate } from './paper-token-discovery';
import type { PaperMomentumResearch } from './paper-momentum-research';

export type ResearchVerdict = 'REJECT' | 'WATCH' | 'DATA_REQUIRED';
export interface CandidateResearchAssessment {
  mint: string;
  verdict: ResearchVerdict;
  reasons: string[];
  momentumMatched: boolean;
  pumpFunOriginVerified: false;
  automatedTradingEligible: false;
}

export function assessResearchCandidate(
  candidate: DiscoveryCandidate,
  momentum: PaperMomentumResearch | null,
  nowMs = Date.now()
): CandidateResearchAssessment {
  if (!Number.isFinite(nowMs)) throw new Error('Invalid evaluation time');
  const reasons = [...candidate.reasons];
  if (!candidate.eligible && reasons.length === 0)
    reasons.push('Discovery screening failed');
  if (candidate.provenance !== 'UNVERIFIED')
    throw new Error('Unexpected candidate provenance');
  const matched = !!momentum && momentum.tokenMint === candidate.mint &&
    momentum.pairAddress === candidate.pairAddress;
  if (!matched) reasons.push('No matching historical price and liquidity observations');
  else if (momentum!.status !== 'READY')
    reasons.push('Insufficient continuous market history');
  else {
    if (!momentum!.lastObservedAt ||
        !Number.isFinite(Date.parse(momentum!.lastObservedAt)) ||
        nowMs - Date.parse(momentum!.lastObservedAt) > 30_000 ||
        nowMs - Date.parse(momentum!.lastObservedAt) < -5_000)
      reasons.push('Historical observations are stale or invalid');
    if (momentum!.maximumObservedGapSeconds === null ||
        momentum!.maximumObservedGapSeconds > 90)
      reasons.push('Market observation gaps exceed policy');
    if (momentum!.priceChangePercent === null ||
        momentum!.liquidityChangePercent === null)
      reasons.push('Momentum metrics unavailable');
  }
  // A suffix is never proof of on-chain origin. Until verified, no token
  // can be promoted from research WATCH to automated trading.
  reasons.push('Pump.fun origin not independently verified on-chain');
  const dataMissing = reasons.some(r =>
    r.includes('historical') || r.includes('history') ||
    r.includes('stale') || r.includes('unavailable') ||
    r.includes('gaps') || r.includes('Momentum'));
  return {
    mint: candidate.mint,
    verdict: !candidate.eligible ? 'REJECT' : dataMissing ? 'DATA_REQUIRED' : 'WATCH',
    reasons,
    momentumMatched: matched,
    pumpFunOriginVerified: false,
    automatedTradingEligible: false
  };
}
