import type { PaperMarketObservation } from './paper-market-data';
import { validateMarketObservation } from './paper-market-data';

export interface PaperMarketSafetyPolicy {
  minimumLiquidityUsd: number;
}

export const DEFAULT_PAPER_MARKET_SAFETY: PaperMarketSafetyPolicy = {
  minimumLiquidityUsd: 10_000
};

export function validateSafePaperMarket(
  observation: PaperMarketObservation,
  previous: PaperMarketObservation | null = null,
  nowMs = Date.now(),
  policy: PaperMarketSafetyPolicy = DEFAULT_PAPER_MARKET_SAFETY
): PaperMarketObservation {
  if (
    !Number.isFinite(policy.minimumLiquidityUsd) ||
    policy.minimumLiquidityUsd <= 0
  ) {
    throw new Error('Invalid minimum liquidity policy');
  }

  const validated = validateMarketObservation(
    observation,
    previous?.priceUsd ?? null,
    nowMs
  );

  if (
    typeof validated.liquidityUsd !== 'number' ||
    validated.liquidityUsd < policy.minimumLiquidityUsd
  ) {
    throw new Error('Insufficient paper market liquidity');
  }

  if (!validated.pairAddress) {
    throw new Error('Missing trading pair identity');
  }

  if (previous) {
    if (validated.tokenMint !== previous.tokenMint) {
      throw new Error('Token identity changed');
    }

    if (validated.source !== previous.source) {
      throw new Error('Market source changed');
    }

    if (validated.pairAddress !== previous.pairAddress) {
      throw new Error('Trading pair changed');
    }

    if (
      Date.parse(validated.observedAt) <=
      Date.parse(previous.observedAt)
    ) {
      throw new Error('Market observation time did not advance');
    }
  }

  return validated;
}
