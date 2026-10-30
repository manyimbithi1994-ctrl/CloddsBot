/**
 * Research-only indicators from previously journaled market observations.
 * Not a trading signal or an instruction to buy or sell.
 * observedAt is local receipt time, NOT an exchange trade timestamp.
 */
import type { PaperMarketJournalEntry } from './paper-market-journal';

export interface PaperMomentumResearch {
  status: 'INSUFFICIENT_DATA' | 'READY';
  observationCount: number;
  tokenMint: string | null;
  pairAddress: string | null;
  windowMinutes: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  priceChangePercent: number | null;
  liquidityChangePercent: number | null;
  observedPriceRangePercent: number | null;
  maximumObservedGapSeconds: number | null;
  caveat: string;
}

export function analyzePaperMomentum(
  entries: readonly PaperMarketJournalEntry[],
  windowMinutes = 5
): PaperMomentumResearch {
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0 || windowMinutes > 1440) {
    throw new Error('Invalid research window');
  }
  const caveat = 'Research only. Receipt-time sampled quotes are not executable prices or verified Pump.fun trades.';
  const last = entries.at(-1);
  const empty = (count: number): PaperMomentumResearch => ({
    status: 'INSUFFICIENT_DATA',
    observationCount: count,
    tokenMint: last?.tokenMint ?? null,
    pairAddress: last?.pairAddress ?? null,
    windowMinutes,
    firstObservedAt: null,
    lastObservedAt: last?.observedAt ?? null,
    priceChangePercent: null,
    liquidityChangePercent: null,
    observedPriceRangePercent: null,
    maximumObservedGapSeconds: null,
    caveat
  });
  if (!last) return empty(0);
  const cutoff = Date.parse(last.observedAt) - windowMinutes * 60_000;
  const samples = entries.filter(e => Date.parse(e.observedAt) >= cutoff);
  if (samples.length < 3) return empty(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const e = samples[i];
    if (e.tokenMint !== last.tokenMint || e.pairAddress !== last.pairAddress ||
        !Number.isFinite(e.priceUsd) || e.priceUsd <= 0 ||
        e.source === undefined || e.liquidityUsd === undefined ||
        !Number.isFinite(e.liquidityUsd) || e.liquidityUsd <= 0 ||
        (i > 0 && Date.parse(e.observedAt) <= Date.parse(samples[i - 1].observedAt))) {
      return empty(samples.length);
    }
  }
  const first = samples[0];
  const elapsedMs = Date.parse(last.observedAt) - Date.parse(first.observedAt);
  // Require meaningful coverage rather than treating a burst of samples as a trend.
  if (elapsedMs < Math.min(windowMinutes * 60_000 * 0.5, 60_000)) return empty(samples.length);
  let maxGap = 0;
  for (let i = 1; i < samples.length; i++) {
    maxGap = Math.max(maxGap, (Date.parse(samples[i].observedAt) - Date.parse(samples[i - 1].observedAt)) / 1000);
  }
  if (maxGap > 90) return empty(samples.length);
  const prices = samples.map(e => e.priceUsd);
  const percent = (a: number, b: number) => (b / a - 1) * 100;
  return {
    status: 'READY',
    observationCount: samples.length,
    tokenMint: last.tokenMint,
    pairAddress: last.pairAddress,
    windowMinutes,
    firstObservedAt: first.observedAt,
    lastObservedAt: last.observedAt,
    priceChangePercent: percent(first.priceUsd, last.priceUsd),
    liquidityChangePercent: percent(first.liquidityUsd!, last.liquidityUsd!),
    observedPriceRangePercent: percent(Math.min(...prices), Math.max(...prices)),
    maximumObservedGapSeconds: maxGap,
    caveat
  };
}
