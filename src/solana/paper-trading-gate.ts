import type { PaperMarketCheckpoint } from './paper-market-checkpoint';
import { validateMarketCheckpoint } from './paper-market-checkpoint';
import { evaluateMarketFreshness } from './paper-market-freshness';

export interface PaperTradingGateResult {
  decision: 'ALLOW' | 'BLOCK';
  reason: string;
}

export function evaluatePaperTradingGate(
  checkpoint: PaperMarketCheckpoint,
  nowMs = Date.now()
): PaperTradingGateResult {
  try {
    validateMarketCheckpoint(checkpoint);

    if (!Number.isFinite(nowMs)) {
      throw new Error('Invalid current timestamp');
    }

    const observationTime = Date.parse(
      checkpoint.observation.observedAt
    );

    const ageMs = nowMs - observationTime;

    if (ageMs < -5000 || ageMs > 30000) {
      return {
        decision: 'BLOCK',
        reason: 'Observation receipt timestamp outside permitted window'
      };
    }

    const freshness = evaluateMarketFreshness(
      'UNCHANGED',
      checkpoint.freshness,
      nowMs
    );

    if (freshness.status === 'STALE') {
      return {
        decision: 'BLOCK',
        reason: 'Market snapshot unchanged for too long'
      };
    }

    return {
      decision: 'ALLOW',
      reason: 'Market observation passed paper-trading checks'
    };
  } catch (error) {
    return {
      decision: 'BLOCK',
      reason: error instanceof Error
        ? error.message
        : 'Invalid market checkpoint'
    };
  }
}
