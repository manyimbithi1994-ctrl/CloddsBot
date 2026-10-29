export interface PaperMarketObservation {
  source: string;
  tokenMint: string;
  priceUsd: number;
  observedAt: string;
  pairAddress?: string;
  liquidityUsd?: number;
}

export interface PaperMarketPolicy {
  maxAgeMs: number;
  maxFutureSkewMs: number;
  maxPriceChangeFraction: number;
}

export const DEFAULT_MARKET_POLICY: PaperMarketPolicy = {
  maxAgeMs: 30_000,
  maxFutureSkewMs: 5_000,
  maxPriceChangeFraction: 0.50
};

export function validateMarketObservation(
  observation: PaperMarketObservation,
  previousPriceUsd: number | null = null,
  nowMs = Date.now(),
  policy: PaperMarketPolicy = DEFAULT_MARKET_POLICY
): PaperMarketObservation {
  if (
    !observation ||
    typeof observation.source !== 'string' ||
    observation.source.trim().length === 0 ||
    typeof observation.tokenMint !== 'string' ||
    observation.tokenMint.trim().length === 0 ||
    typeof observation.priceUsd !== 'number' ||
    !Number.isFinite(observation.priceUsd) ||
    observation.priceUsd <= 0
  ) {
    throw new Error('Invalid market observation');
  }

  if (
    observation.pairAddress !== undefined &&
    (
      typeof observation.pairAddress !== 'string' ||
      observation.pairAddress.trim().length === 0
    )
  ) {
    throw new Error('Invalid market pair identity');
  }

  if (
    observation.liquidityUsd !== undefined &&
    (
      typeof observation.liquidityUsd !== 'number' ||
      !Number.isFinite(observation.liquidityUsd) ||
      observation.liquidityUsd <= 0
    )
  ) {
    throw new Error('Invalid market liquidity');
  }

  const observedMs = Date.parse(observation.observedAt);

  if (
    !Number.isFinite(observedMs) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(policy.maxAgeMs) ||
    policy.maxAgeMs < 0 ||
    !Number.isFinite(policy.maxFutureSkewMs) ||
    policy.maxFutureSkewMs < 0 ||
    !Number.isFinite(policy.maxPriceChangeFraction) ||
    policy.maxPriceChangeFraction < 0 ||
    observation.priceUsd <= 0
  ) {
    throw new Error('Invalid market observation parameters');
  }

  const ageMs = nowMs - observedMs;

  if (ageMs > policy.maxAgeMs) {
    throw new Error('Stale market observation');
  }

  if (ageMs < -policy.maxFutureSkewMs) {
    throw new Error('Market observation timestamp is in the future');
  }

  if (previousPriceUsd !== null) {
    if (
      !Number.isFinite(previousPriceUsd) ||
      previousPriceUsd <= 0
    ) {
      throw new Error('Invalid previous market price');
    }

    const change = Math.abs(
      observation.priceUsd - previousPriceUsd
    ) / previousPriceUsd;

    if (change > policy.maxPriceChangeFraction) {
      throw new Error('Excessive market price movement');
    }
  }

  return Object.freeze({ ...observation });
}
