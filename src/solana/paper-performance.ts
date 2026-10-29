import {
  readMarketJournal,
  type PaperMarketJournalEntry
} from './paper-market-journal';

export interface PaperPerformanceReport {
  observations: number;
  completedTrades: number;
  takeProfitExits: number;
  stopLossExits: number;
  unclassifiedExits: number;
  takeProfitRealizedPnlUsd: number;
  stopLossRealizedPnlUsd: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRatePercent: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  netRealizedPnlUsd: number;
  profitFactor: number | null;
  averagePnlPerTradeUsd: number;
  maximumDrawdownUsd: number;
  maximumDrawdownPercent: number;
  currentCashUsd: number;
  currentEquityUsd: number;
  openPositions: number;
  startingBalanceUsd: number;
}

export function analyzePaperPerformance(
  entries: readonly PaperMarketJournalEntry[],
  startingBalanceUsd: number
): PaperPerformanceReport {
  if (
    !Number.isFinite(startingBalanceUsd) ||
    startingBalanceUsd <= 0
  ) {
    throw new Error('Invalid starting balance');
  }

  let completedTrades = 0;
  let takeProfitExits = 0;
  let stopLossExits = 0;
  let unclassifiedExits = 0;
  let takeProfitRealizedPnlUsd = 0;
  let stopLossRealizedPnlUsd = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let breakevenTrades = 0;
  let grossProfitUsd = 0;
  let grossLossUsd = 0;
  let previousRealizedPnl = 0;

  let peakEquity = startingBalanceUsd;
  let maximumDrawdownUsd = 0;
  let maximumDrawdownPercent = 0;

  for (const entry of entries) {
    const account = entry.account;

    if (entry.action === 'SELL') {
      const tradePnl =
        account.realizedDailyPnlUsd - previousRealizedPnl;

      if (tradePnl > 0) {
        winningTrades++;
        grossProfitUsd += tradePnl;
      } else if (tradePnl < 0) {
        losingTrades++;
        grossLossUsd += Math.abs(tradePnl);
      } else {
        breakevenTrades++;
      }

      completedTrades++;

      if (entry.exitReason === 'TAKE_PROFIT') {
        takeProfitExits++;
        takeProfitRealizedPnlUsd += tradePnl;
      } else if (entry.exitReason === 'STOP_LOSS') {
        stopLossExits++;
        stopLossRealizedPnlUsd += tradePnl;
      } else {
        unclassifiedExits++;
      }
    }

    previousRealizedPnl = account.realizedDailyPnlUsd;

    // Mark open positions to the latest observed market price.
    const equity =
      account.cashUsd +
      account.tokenQuantity * entry.priceUsd;

    peakEquity = Math.max(peakEquity, equity);

    const drawdownUsd = peakEquity - equity;
    const drawdownPercent =
      peakEquity > 0 ? (drawdownUsd / peakEquity) * 100 : 0;

    maximumDrawdownUsd = Math.max(
      maximumDrawdownUsd,
      drawdownUsd
    );

    maximumDrawdownPercent = Math.max(
      maximumDrawdownPercent,
      drawdownPercent
    );
  }

  const latest = entries.at(-1);

  const currentCashUsd =
    latest?.account.cashUsd ?? startingBalanceUsd;

  const currentEquityUsd = latest
    ? latest.account.cashUsd +
      latest.account.tokenQuantity * latest.priceUsd
    : startingBalanceUsd;

  const netRealizedPnlUsd =
    grossProfitUsd - grossLossUsd;

  const profitFactor = grossLossUsd > 0
    ? grossProfitUsd / grossLossUsd
    : null;

  return {
    observations: entries.length,
    completedTrades,
    takeProfitExits,
    stopLossExits,
    unclassifiedExits,
    takeProfitRealizedPnlUsd,
    stopLossRealizedPnlUsd,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRatePercent: completedTrades > 0
      ? (winningTrades / completedTrades) * 100
      : 0,
    grossProfitUsd,
    grossLossUsd,
    netRealizedPnlUsd,
    profitFactor,
    averagePnlPerTradeUsd: completedTrades > 0
      ? netRealizedPnlUsd / completedTrades
      : 0,
    maximumDrawdownUsd,
    maximumDrawdownPercent,
    currentCashUsd,
    currentEquityUsd,
    openPositions: latest?.account.openPositions ?? 0,
    startingBalanceUsd
  };
}

export function analyzePaperJournal(
  journalPath: string,
  startingBalanceUsd: number
): PaperPerformanceReport {
  const entries = readMarketJournal(journalPath);
  return analyzePaperPerformance(entries, startingBalanceUsd);
}
