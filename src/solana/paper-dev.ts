import { PaperTradingEngine } from './paper-engine';
import { appendFileSync, mkdirSync } from 'node:fs';

const engine = new PaperTradingEngine();
const outputDir = '.paper-data';
mkdirSync(outputDir, { recursive: true });

const logPath = `${outputDir}/trades.jsonl`;
const prices = [
  0.0100, 0.0102, 0.0105, 0.0108,
  0.0112, 0.0109, 0.0104, 0.0098,
  0.0095, 0.0101, 0.0107, 0.0113
];

let entryPrice: number | null = null;
let quantity = 0;

function log(event: Record<string, unknown>) {
  const record = {
    timestamp: new Date().toISOString(),
    mode: 'PAPER_ONLY',
    ...event
  };
  console.log(JSON.stringify(record));
  appendFileSync(logPath, JSON.stringify(record) + '\n');
}

log({ event: 'START', account: engine.snapshot() });

for (let i = 0; i < prices.length; i++) {
  const price = prices[i];

  try {
    if (entryPrice === null) {
      const result = engine.buy(4, price);
      entryPrice = price;
      quantity = result.quantity;

      log({
        event: 'BUY',
        price,
        quantity,
        executionPrice: result.executionPriceUsd,
        fee: result.feeUsd
      });
    } else {
      const change = (price - entryPrice) / entryPrice;

      if (change >= 0.08 || change <= -0.05) {
        const result = engine.sell(quantity, price);

        log({
          event: 'SELL',
          price,
          pnl: result.realizedPnlUsd,
          executionPrice: result.executionPriceUsd,
          fee: result.feeUsd
        });

        entryPrice = null;
        quantity = 0;
      }
    }
  } catch (error) {
    log({
      event: 'BLOCKED',
      reason: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  log({
    event: 'TICK',
    price,
    account: engine.snapshot()
  });
}

log({ event: 'FINISHED', account: engine.snapshot() });
