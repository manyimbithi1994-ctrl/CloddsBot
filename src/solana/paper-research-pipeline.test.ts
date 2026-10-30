import { strict as assert } from 'node:assert';
import { evaluateResearchPipeline } from './paper-research-pipeline';
import type { DiscoveryCandidate } from './paper-token-discovery';
import type { OriginEvidence } from './paper-origin-verifier';
import type { TokenResearchSummary } from './paper-research-summary';

const now = Date.parse('2026-10-30T09:00:00.000Z');
const mint = 'So11111111111111111111111111111111111111112';
const candidate: DiscoveryCandidate = {
  mint, chainId: 'solana', description: null, profileUrl: null,
  liquidityUsd: 20000, volume24hUsd: 10000, buys24h: 200, sells24h: 100,
  pairAddress: 'pair', pairCreatedAt: new Date(now - 3600000).toISOString(),
  volumeLiquidityRatio: 0.5, score: 80, eligible: true, reasons: [],
  provenance: 'UNVERIFIED', pumpSuffixHint: false
};
const origin: OriginEvidence = {
  mint, status: 'VERIFIED_PUMP_FUN', checkedAt: new Date(now).toISOString(),
  creationSignature: 'signature', creationProgramId: 'program',
  reason: 'Verified', tradingEligible: false
};
const safety = {
  mint, verifiedAt: new Date(now).toISOString(), mintAuthorityRevoked: true,
  freezeAuthorityRevoked: true, holderConcentrationChecked: true,
  liquidityRisksChecked: true
};
const history: TokenResearchSummary = {
  mint, pairAddress: 'pair', observations: 20,
  firstObservedAt: new Date(now - 300000).toISOString(),
  lastObservedAt: new Date(now - 5000).toISOString(),
  latestPriceUsd: 1, latestLiquidityUsd: 20000,
  priceChangePercent: 1, liquidityChangePercent: 1,
  largestGapSeconds: 20, status: 'READY', automatedTradingEligible: false
};
assert.equal(evaluateResearchPipeline(candidate, null, null, history, now).nextAction, 'VERIFY_ORIGIN');
assert.equal(evaluateResearchPipeline(candidate, origin, null, history, now).nextAction, 'REVIEW_SAFETY');
assert.equal(evaluateResearchPipeline(candidate, origin, safety, null, now).nextAction, 'COLLECT_HISTORY');
const ready = evaluateResearchPipeline(candidate, origin, safety, history, now);
assert.equal(ready.nextAction, 'RESEARCH_SIGNAL');
assert.equal(ready.automatedTradingEligible, false);
assert.equal(ready.stages.at(-1)?.status, 'PENDING');
assert.equal(evaluateResearchPipeline({ ...candidate, eligible: false, reasons: ['Liquidity low'] },
  origin, safety, history, now).nextAction, 'REJECT');
console.log('Research pipeline fail-closed tests passed');
