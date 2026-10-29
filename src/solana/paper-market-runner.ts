import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { PaperTradingEngine } from './paper-engine';
import { validateMarketObservation } from './paper-market-data';
import { executePaperMarketDecision } from './paper-market-executor';
import { acquirePaperLock } from './paper-lock';
import {
  appendMarketJournal,
  readMarketJournal
} from './paper-market-journal';
import {
  validateMarketCheckpoint,
  type PaperMarketCheckpoint
} from './paper-market-checkpoint';

export function processPaperMarketObservation(
  checkpoint: PaperMarketCheckpoint,
  directory: string,
  nowMs = Date.now()
) {
  mkdirSync(directory, { recursive: true });

  const release = acquirePaperLock(join(directory, 'runner.lock'));

  try {
    const validated = validateMarketCheckpoint(checkpoint);
    const journalPath = join(directory, 'market-journal.jsonl');
    const journal = readMarketJournal(journalPath);
    const previous = journal.at(-1);

    const observation = validated.observation;

    const observationId = createHash('sha256')
      .update(JSON.stringify({
        source: observation.source,
        tokenMint: observation.tokenMint,
        pairAddress: observation.pairAddress,
        observedAt: observation.observedAt,
        priceUsd: observation.priceUsd
      }))
      .digest('hex');

    if (journal.some(e => e.observationId === observationId)) {
      return {
        action: 'DUPLICATE' as const,
        account: previous?.account ?? new PaperTradingEngine().snapshot()
      };
    }

    if (
      previous &&
      (
        observation.tokenMint !== previous.tokenMint ||
        observation.pairAddress !== previous.pairAddress ||
        observation.observedAt <= previous.observedAt
      )
    ) {
      throw new Error('Market observation identity or order mismatch');
    }

    // Reject unsafe price jumps before any simulated execution.
    // The checkpoint validator has already checked current liquidity
    // and trading-pair identity.
    if (previous) {
      validateMarketObservation(
        observation,
        previous.priceUsd,
        nowMs
      );
    }

    const engine = new PaperTradingEngine();

    if (previous) {
      engine.restore(previous.account);
    }

    const result = executePaperMarketDecision(
      engine,
      validated,
      previous?.entryPriceUsd ?? null,
      nowMs
    );

    const entry = appendMarketJournal(journalPath, {
      version: 1,
      sequence: journal.length,
      observationId,
      observedAt: observation.observedAt,
      tokenMint: observation.tokenMint,
      pairAddress: observation.pairAddress!,
      priceUsd: observation.priceUsd,
      action: result.action,
      entryPriceUsd: result.entryPriceUsd,
      account: result.account,
      previousHash: previous?.hash ?? null
    });

    return {
      action: result.action,
      sequence: entry.sequence,
      account: entry.account,
      hash: entry.hash
    };
  } finally {
    release();
  }
}
