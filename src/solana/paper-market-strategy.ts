import type { PaperMarketCheckpoint } from './paper-market-checkpoint';
import { evaluatePaperTradingGate } from './paper-trading-gate';

export type PaperMarketDecision =
  | { action: 'BUY'; spendUsd: number; priceUsd: number }
  | {
      action: 'SELL';
      quantity: number;
      priceUsd: number;
      exitReason: 'TAKE_PROFIT' | 'STOP_LOSS';
    }
  | { action: 'HOLD'; reason: string }
  | { action: 'BLOCK'; reason: string };

export interface PaperStrategyAccount {
  cashUsd: number;
  tokenQuantity: number;
  entryCostUsd: number;
  openPositions: number;
  realizedDailyPnlUsd: number;
}

export function decidePaperMarketAction(
  checkpoint: PaperMarketCheckpoint,
  account: PaperStrategyAccount,
  entryPriceUsd: number | null,
  nowMs = Date.now()
): PaperMarketDecision {
  const gate = evaluatePaperTradingGate(checkpoint, nowMs);

  if (gate.decision === 'BLOCK') {
    return { action: 'BLOCK', reason: gate.reason };
  }

  if (
    !account ||
    ![
      account.cashUsd,
      account.tokenQuantity,
      account.entryCostUsd,
      account.openPositions,
      account.realizedDailyPnlUsd
    ].every(v => typeof v === 'number' && Number.isFinite(v)) ||
    account.cashUsd < 0 ||
    account.tokenQuantity < 0 ||
    account.entryCostUsd < 0 ||
    ![0, 1].includes(account.openPositions) ||
    (account.openPositions === 0 &&
      (account.tokenQuantity !== 0 || account.entryCostUsd !== 0)) ||
    (account.openPositions === 1 &&
      (account.tokenQuantity <= 0 || account.entryCostUsd <= 0))
  ) {
    return { action: 'BLOCK', reason: 'Invalid virtual account' };
  }

  const priceUsd = checkpoint.observation.priceUsd;

  if (account.openPositions === 0) {
    if (entryPriceUsd !== null) {
      return { action: 'BLOCK', reason: 'Unexpected entry price' };
    }

    if (account.cashUsd < 4) {
      return { action: 'HOLD', reason: 'Insufficient virtual cash' };
    }

    return {
      action: 'BUY',
      spendUsd: 4,
      priceUsd
    };
  }

  if (
    entryPriceUsd === null ||
    !Number.isFinite(entryPriceUsd) ||
    entryPriceUsd <= 0
  ) {
    return { action: 'BLOCK', reason: 'Invalid entry price' };
  }

  const change = (priceUsd - entryPriceUsd) / entryPriceUsd;

  if (change >= 0.08) {
    return {
      action: 'SELL',
      quantity: account.tokenQuantity,
      priceUsd,
      exitReason: 'TAKE_PROFIT'
    };
  }

  if (change <= -0.05) {
    return {
      action: 'SELL',
      quantity: account.tokenQuantity,
      priceUsd,
      exitReason: 'STOP_LOSS'
    };
  }

  return {
    action: 'HOLD',
    reason: 'Neither profit target nor stop-loss reached'
  };
}
