import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PaperTradingEngine } from './paper-engine';
import { valuePaperPortfolio } from './paper-valuation';
import { loadPaperSession, savePaperSession } from './paper-storage';
import { appendPaperJournal, readPaperJournal } from './paper-journal';
import { acquirePaperLock } from './paper-lock';

const outputDir = process.env.PAPER_DATA_DIR ?? '.paper-data';
mkdirSync(outputDir, { recursive: true });

const releaseLock = acquirePaperLock(join(outputDir, 'runner.lock'));

try {
  const sessionPath = join(outputDir, 'session.json');
  const journalPath = join(outputDir, 'journal.jsonl');
  const logPath = join(outputDir, 'trades.jsonl');

  // Synthetic prices only. No RPC, wallets or network requests.
  const prices = [
    0.0100, 0.0102, 0.0105, 0.0108,
    0.0112, 0.0109, 0.0104, 0.0098,
    0.0095, 0.0101, 0.0107, 0.0113
  ];

  const engine = new PaperTradingEngine();

  const checkpoint = loadPaperSession(sessionPath);
  const journal = readPaperJournal(journalPath);
  const latest = journal.at(-1)?.session ?? null;

  if (
    latest &&
    checkpoint &&
    checkpoint.nextTickIndex > latest.nextTickIndex
  ) {
    throw new Error(
      'Checkpoint is ahead of journal; manual reconciliation required'
    );
  }

  // A journal is authoritative once it exists.
  const saved = latest ?? checkpoint;

  // Refuse ambiguous recovery when a checkpoint exists without a journal.
  if (checkpoint && journal.length === 0 && checkpoint.nextTickIndex > 0) {
    throw new Error(
      'Checkpoint exists without journal; manual reconciliation required'
    );
  }

  let nextTickIndex = saved?.nextTickIndex ?? 0;
  let entryPrice: number | null = saved?.entryPrice ?? null;

  if (saved) engine.restore(saved.account);

  function log(event: Record<string, unknown>) {
    const record = {
      timestamp: new Date().toISOString(),
      mode: 'PAPER_ONLY',
      ...event
    };

    console.log(JSON.stringify(record));

    appendFileSync(
      logPath,
      JSON.stringify(record) + '\n',
      { mode: 0o600 }
    );
  }

  log({
    event: saved ? 'RESUMED' : 'START',
    nextTickIndex,
    account: engine.snapshot()
  });

  for (let i = nextTickIndex; i < prices.length; i++) {
    const price = prices[i];

    try {
      if (entryPrice === null) {
        const result = engine.buy(4, price);
        entryPrice = price;

        log({
          event: 'BUY',
          tickIndex: i,
          price,
          quantity: result.quantity,
          executionPrice: result.executionPriceUsd,
          fee: result.feeUsd
        });
      } else {
        const change = (price - entryPrice) / entryPrice;

        if (change >= 0.08 || change <= -0.05) {
          const quantity = engine.snapshot().tokenQuantity;
          const result = engine.sell(quantity, price);

          log({
            event: 'SELL',
            tickIndex: i,
            price,
            pnl: result.realizedPnlUsd,
            executionPrice: result.executionPriceUsd,
            fee: result.feeUsd
          });

          entryPrice = null;
        }
      }
    } catch (error) {
      log({
        event: 'BLOCKED',
        tickIndex: i,
        reason: error instanceof Error
          ? error.message
          : 'Unknown error'
      });
    }

    nextTickIndex = i + 1;

    const session = {
      version: 1 as const,
      nextTickIndex,
      entryPrice,
      account: engine.snapshot()
    };

    appendPaperJournal(journalPath, {
      version: 1,
      tickIndex: i,
      priceUsd: price,
      session
    });

    savePaperSession(sessionPath, session);

    log({
      event: 'TICK',
      tickIndex: i,
      price,
      account: engine.snapshot(),
      portfolio: valuePaperPortfolio(engine, price)
    });
  }

  log({
    event: 'FINISHED',
    nextTickIndex,
    account: engine.snapshot()
  });
} finally {
  releaseLock();
}
