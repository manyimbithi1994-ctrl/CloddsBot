import type { SnapshotStatus } from './paper-market-snapshot';

export interface MarketFreshnessState {
  lastChangedAt: string;
}

export interface MarketFreshnessResult {
  status: 'FRESH' | 'STALE';
  state: MarketFreshnessState;
  unchangedForMs: number;
}

export function evaluateMarketFreshness(
  snapshotStatus: SnapshotStatus,
  previous: MarketFreshnessState | null,
  nowMs = Date.now(),
  maxUnchangedMs = 60_000
): MarketFreshnessResult {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(maxUnchangedMs) ||
    maxUnchangedMs <= 0
  ) {
    throw new Error('Invalid freshness parameters');
  }

  if (snapshotStatus === 'INITIAL' || snapshotStatus === 'CHANGED') {
    return {
      status: 'FRESH',
      state: {
        lastChangedAt: new Date(nowMs).toISOString()
      },
      unchangedForMs: 0
    };
  }

  if (snapshotStatus !== 'UNCHANGED' || !previous) {
    throw new Error('Missing previous freshness state');
  }

  const lastChangedMs = Date.parse(previous.lastChangedAt);

  if (
    !Number.isFinite(lastChangedMs) ||
    lastChangedMs > nowMs
  ) {
    throw new Error('Invalid previous freshness timestamp');
  }

  const unchangedForMs = nowMs - lastChangedMs;

  return {
    status: unchangedForMs >= maxUnchangedMs
      ? 'STALE'
      : 'FRESH',
    state: previous,
    unchangedForMs
  };
}
