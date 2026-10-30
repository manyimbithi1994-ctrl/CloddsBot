/**
 * Multi-token research analytics from the isolated collector journal.
 * This module never authorizes orders. Each token is evaluated independently.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PaperMarketObservation } from './paper-market-data';

export interface TokenResearchSummary {
  mint: string;
  pairAddress: string;
  observations: number;
  firstObservedAt: string;
  lastObservedAt: string;
  latestPriceUsd: number;
  latestLiquidityUsd: number;
  priceChangePercent: number | null;
  liquidityChangePercent: number | null;
  largestGapSeconds: number | null;
  status: 'READY' | 'INSUFFICIENT_DATA' | 'STALE' | 'INVALID';
  automatedTradingEligible: false;
}

export function summarizeTokenResearch(
  observations: readonly PaperMarketObservation[],
  nowMs = Date.now()
): TokenResearchSummary[] {
  if (!Number.isFinite(nowMs)) throw new Error('Invalid research time');
  const groups = new Map<string, PaperMarketObservation[]>();
  for (const observation of observations) {
    if (typeof observation.tokenMint !== 'string') throw new Error('Invalid research mint');
    const group = groups.get(observation.tokenMint) ?? [];
    group.push(observation);
    groups.set(observation.tokenMint, group);
  }
  const results: TokenResearchSummary[] = [];
  for (const [mint, group] of groups) {
    const first = group[0];
    const last = group[group.length - 1];
    let valid = true;
    let gap = 0;
    for (let i = 0; i < group.length; i++) {
      const current = group[i];
      const time = Date.parse(current.observedAt);
      if (current.pairAddress !== first.pairAddress ||
          current.source !== first.source ||
          !Number.isFinite(time) || !Number.isFinite(current.priceUsd) ||
          current.priceUsd <= 0 || !Number.isFinite(current.liquidityUsd) ||
          (current.liquidityUsd ?? 0) <= 0) valid = false;
      if (i) {
        const delta = (time - Date.parse(group[i - 1].observedAt)) / 1000;
        if (!Number.isFinite(delta) || delta <= 0) valid = false;
        gap = Math.max(gap, delta);
      }
    }
    const duration = Date.parse(last.observedAt) - Date.parse(first.observedAt);
    const age = nowMs - Date.parse(last.observedAt);
    const status = !valid ? 'INVALID' :
      age > 30_000 || age < -5_000 ? 'STALE' :
      group.length < 3 || duration < 30_000 || gap > 90 ? 'INSUFFICIENT_DATA' : 'READY';
    const percent = (a: number, z: number) => (z / a - 1) * 100;
    results.push({
      mint, pairAddress: first.pairAddress ?? '',
      observations: group.length,
      firstObservedAt: first.observedAt,
      lastObservedAt: last.observedAt,
      latestPriceUsd: last.priceUsd,
      latestLiquidityUsd: last.liquidityUsd ?? 0,
      priceChangePercent: valid && group.length >= 2 ? percent(first.priceUsd, last.priceUsd) : null,
      liquidityChangePercent: valid && group.length >= 2 ?
        percent(first.liquidityUsd!, last.liquidityUsd!) : null,
      largestGapSeconds: group.length > 1 ? gap : null,
      status,
      automatedTradingEligible: false
    });
  }
  return results.sort((a, b) => a.mint.localeCompare(b.mint));
}

export function readTokenResearchSummaries(
  filename = resolve('.paper-sessions', 'multi-token-research', 'observations.jsonl'),
  nowMs = Date.now()
): TokenResearchSummary[] {
  if (!existsSync(filename)) return [];
  const data = readFileSync(filename, 'utf8');
  if (data && !data.endsWith('\n')) throw new Error('Incomplete research journal');
  const observations: PaperMarketObservation[] = [];
  for (const line of data.split('\n')) {
    if (!line) continue;
    const row: unknown = JSON.parse(line);
    if (!row || typeof row !== 'object' ||
        (row as {version?:unknown}).version !== 1 ||
        !(row as {observation?:unknown}).observation ||
        (row as {observedAt?:unknown}).observedAt !==
          (row as {observation:PaperMarketObservation}).observation.observedAt)
      throw new Error('Invalid research journal row');
    observations.push((row as {observation:PaperMarketObservation}).observation);
  }
  return summarizeTokenResearch(observations, nowMs);
}
