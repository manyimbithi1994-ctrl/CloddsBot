import type { PaperMarketObservation } from './paper-market-data';

export type SnapshotStatus =
  | 'INITIAL'
  | 'CHANGED'
  | 'UNCHANGED';

export function classifyMarketSnapshot(
  current: PaperMarketObservation,
  previous: PaperMarketObservation | null
): SnapshotStatus {
  if (!previous) {
    return 'INITIAL';
  }

  if (
    current.tokenMint !== previous.tokenMint ||
    current.source !== previous.source ||
    current.pairAddress !== previous.pairAddress
  ) {
    throw new Error('Market snapshot identity changed');
  }

  if (
    current.priceUsd === previous.priceUsd &&
    current.liquidityUsd === previous.liquidityUsd
  ) {
    return 'UNCHANGED';
  }

  return 'CHANGED';
}
