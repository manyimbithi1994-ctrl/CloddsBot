import { PaperTradingEngine } from './paper-engine';
import { decidePaperMarketAction } from './paper-market-strategy';
import type { PaperMarketCheckpoint } from './paper-market-checkpoint';

export interface PaperExecutionResult {
  action: 'BUY' | 'SELL' | 'HOLD' | 'BLOCK';
  reason?: string;
  entryPriceUsd: number | null;
  account: ReturnType<PaperTradingEngine['snapshot']>;
}

export function executePaperMarketDecision(
  engine: PaperTradingEngine,
  checkpoint: PaperMarketCheckpoint,
  entryPriceUsd: number | null,
  nowMs = Date.now()
): PaperExecutionResult {
  const decision = decidePaperMarketAction(
    checkpoint,
    engine.snapshot(),
    entryPriceUsd,
    nowMs
  );

  if (decision.action === 'BLOCK' || decision.action === 'HOLD') {
    return {
      action: decision.action,
      reason: decision.reason,
      entryPriceUsd,
      account: engine.snapshot()
    };
  }

  try {
    if (decision.action === 'BUY') {
      engine.buy(decision.spendUsd, decision.priceUsd, 100);

      return {
        action: 'BUY',
        entryPriceUsd: decision.priceUsd,
        account: engine.snapshot()
      };
    }

    engine.sell(decision.quantity, decision.priceUsd, 100);

    return {
      action: 'SELL',
      entryPriceUsd: null,
      account: engine.snapshot()
    };
  } catch (error) {
    return {
      action: 'BLOCK',
      reason: error instanceof Error
        ? error.message
        : 'Virtual execution failed',
      entryPriceUsd,
      account: engine.snapshot()
    };
  }
}
