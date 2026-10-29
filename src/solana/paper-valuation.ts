import { PaperTradingEngine } from './paper-engine';

export function valuePaperPortfolio(
  engine: PaperTradingEngine,
  marketPriceUsd: number,
  estimatedExitSlippageBps = 100
) {
  if (
    !Number.isFinite(marketPriceUsd) ||
    marketPriceUsd <= 0 ||
    !Number.isFinite(estimatedExitSlippageBps) ||
    estimatedExitSlippageBps < 0 ||
    estimatedExitSlippageBps > 10000
  ) {
    throw new Error('Invalid paper valuation inputs');
  }

  const account = engine.snapshot();

  const grossMarketValueUsd =
    account.tokenQuantity * marketPriceUsd;

  const estimatedExecutionValueUsd =
    grossMarketValueUsd *
    (1 - estimatedExitSlippageBps / 10000);

  const estimatedExitFeeUsd =
    estimatedExecutionValueUsd * 0.0125;

  return {
    cashUsd: account.cashUsd,
    investedCostUsd: account.entryCostUsd,
    grossMarketValueUsd,
    grossEquityUsd:
      account.cashUsd + grossMarketValueUsd,
    unrealizedPnlUsd:
      grossMarketValueUsd - account.entryCostUsd,
    estimatedNetLiquidationEquityUsd:
      account.cashUsd +
      estimatedExecutionValueUsd -
      estimatedExitFeeUsd,
    realizedDailyPnlUsd:
      account.realizedDailyPnlUsd,
    openPositions: account.openPositions
  };
}
