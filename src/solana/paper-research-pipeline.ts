/**
 * Six-stage fail-closed research pipeline.
 * No trade runner, wallet, or executor dependency.
 * A discovery listing or a 'pump' mint suffix is never origin proof.
 */
import type { DiscoveryCandidate } from './paper-token-discovery';
import type { OriginEvidence } from './paper-origin-verifier';
import type { TokenResearchSummary } from './paper-research-summary';

export type StageStatus = 'PASS' | 'BLOCK' | 'PENDING';
export interface PipelineStage {
  name: 'DISCOVER' | 'VERIFY_ORIGIN' | 'TOKEN_SAFETY' |
    'MARKET_SCREEN' | 'MONITOR' | 'ENTRY_SIGNAL';
  status: StageStatus;
  reason: string;
}
export interface PipelineAssessment {
  mint: string;
  stages: PipelineStage[];
  nextAction: 'VERIFY_ORIGIN' | 'REVIEW_SAFETY' | 'REJECT' |
    'MONITOR' | 'COLLECT_HISTORY' | 'RESEARCH_SIGNAL';
  automatedTradingEligible: false;
}

export interface TokenSafetyEvidence {
  mint: string;
  verifiedAt: string;
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  holderConcentrationChecked: boolean;
  liquidityRisksChecked: boolean;
}

export function evaluateResearchPipeline(
  candidate: DiscoveryCandidate,
  origin: OriginEvidence | null,
  safety: TokenSafetyEvidence | null,
  history: TokenResearchSummary | null,
  nowMs = Date.now()
): PipelineAssessment {
  if (!Number.isFinite(nowMs)) throw new Error('Invalid evaluation time');
  const stages: PipelineStage[] = [];
  const add = (name: PipelineStage['name'], status: StageStatus, reason: string) =>
    stages.push({ name, status, reason });
  add('DISCOVER', 'PASS', 'Discovered on Solana; listing is not origin evidence');

  const originFresh = origin?.mint === candidate.mint &&
    Number.isFinite(Date.parse(origin.checkedAt)) &&
    nowMs - Date.parse(origin.checkedAt) >= -5000 &&
    nowMs - Date.parse(origin.checkedAt) <= 24 * 60 * 60_000;
  const verified = originFresh && origin?.status === 'VERIFIED_PUMP_FUN' &&
    !!origin.creationSignature && !!origin.creationProgramId;
  if (!verified) {
    add('VERIFY_ORIGIN', 'PENDING',
      origin?.reason ?? 'Creation transaction and mint binding not verified');
    add('TOKEN_SAFETY', 'PENDING', 'Awaiting verified token origin');
    add('MARKET_SCREEN', 'PENDING', 'Origin gate not passed');
    add('MONITOR', 'PENDING', 'No intensive monitoring before verification');
    add('ENTRY_SIGNAL', 'BLOCK', 'Automated entry disabled');
    return { mint: candidate.mint, stages, nextAction: 'VERIFY_ORIGIN',
      automatedTradingEligible: false };
  }
  add('VERIFY_ORIGIN', 'PASS', 'Verified creation evidence supplied');

  const safetyFresh = safety?.mint === candidate.mint &&
    Number.isFinite(Date.parse(safety.verifiedAt)) &&
    nowMs - Date.parse(safety.verifiedAt) >= -5000 &&
    nowMs - Date.parse(safety.verifiedAt) <= 60 * 60_000;
  const safe = safetyFresh && safety?.mintAuthorityRevoked === true &&
    safety.freezeAuthorityRevoked === true &&
    safety.holderConcentrationChecked === true &&
    safety.liquidityRisksChecked === true;
  if (!safe) {
    add('TOKEN_SAFETY', 'PENDING', 'Token permissions, holders or liquidity risk not fully assessed');
    add('MARKET_SCREEN', 'PENDING', 'Safety gate not passed');
    add('MONITOR', 'PENDING', 'No intensive monitoring before safety checks');
    add('ENTRY_SIGNAL', 'BLOCK', 'Automated entry disabled');
    return { mint: candidate.mint, stages, nextAction: 'REVIEW_SAFETY',
      automatedTradingEligible: false };
  }
  add('TOKEN_SAFETY', 'PASS', 'Required safety evidence supplied');
  if (!candidate.eligible || !candidate.pairAddress) {
    add('MARKET_SCREEN', 'BLOCK', candidate.reasons.join('; ') || 'Market screening failed');
    add('MONITOR', 'BLOCK', 'Market screening failed');
    add('ENTRY_SIGNAL', 'BLOCK', 'Automated entry disabled');
    return { mint: candidate.mint, stages, nextAction: 'REJECT',
      automatedTradingEligible: false };
  }
  add('MARKET_SCREEN', 'PASS', 'Preliminary liquidity and activity thresholds passed');
  if (!history || history.mint !== candidate.mint ||
      history.pairAddress !== candidate.pairAddress || history.status !== 'READY' ||
      !Number.isFinite(Date.parse(history.lastObservedAt)) ||
      nowMs - Date.parse(history.lastObservedAt) > 30_000 ||
      nowMs - Date.parse(history.lastObservedAt) < -5000) {
    add('MONITOR', 'PENDING', 'Matching fresh multi-token history required');
    add('ENTRY_SIGNAL', 'BLOCK', 'Automated entry disabled');
    return { mint: candidate.mint, stages, nextAction: 'COLLECT_HISTORY',
      automatedTradingEligible: false };
  }
  add('MONITOR', 'PASS', 'Fresh matching history available');
  add('ENTRY_SIGNAL', 'PENDING', 'Entry strategy not validated against out-of-sample results and costs');
  return { mint: candidate.mint, stages, nextAction: 'RESEARCH_SIGNAL',
    automatedTradingEligible: false };
}
