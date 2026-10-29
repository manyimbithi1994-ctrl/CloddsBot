import {
  DEFAULT_PAPER_RISK,
  type PaperRiskPolicy
} from './paper-risk';

export interface PaperTestConfig {
  startingBalanceUsd: number;
  orderSizeUsd: 4;
  takeProfitPercent: 8;
  stopLossPercent: 5;
  maxOpenPositions: 1;
  maxSlippageBps: 300;
}

export function createPaperTestConfig(
  startingBalanceUsd = 20
): PaperTestConfig {
  if (
    !Number.isFinite(startingBalanceUsd) ||
    startingBalanceUsd < 4 ||
    startingBalanceUsd > 1_000_000
  ) {
    throw new Error('Invalid paper starting balance');
  }

  return {
    startingBalanceUsd,
    orderSizeUsd: 4,
    takeProfitPercent: 8,
    stopLossPercent: 5,
    maxOpenPositions: 1,
    maxSlippageBps: 300
  };
}

export function createPaperTestRiskPolicy(
  config: PaperTestConfig
): PaperRiskPolicy {
  const validated = createPaperTestConfig(
    config.startingBalanceUsd
  );

  if (JSON.stringify(config) !== JSON.stringify(validated)) {
    throw new Error('Unsupported paper testing configuration');
  }

  return {
    ...DEFAULT_PAPER_RISK,
    initialCashUsd: validated.startingBalanceUsd,
    maxOrderUsd: validated.orderSizeUsd,
    maxOpenPositions: validated.maxOpenPositions,
    maxSlippageBps: validated.maxSlippageBps
  };
}
