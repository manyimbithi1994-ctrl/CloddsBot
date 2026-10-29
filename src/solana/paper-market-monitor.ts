import {
  mkdirSync,
  readFileSync,
  existsSync
} from 'node:fs';
import { join } from 'node:path';

import { fetchPaperTokenPrice } from './paper-price-feed';
import { classifyMarketSnapshot } from './paper-market-snapshot';
import { evaluateMarketFreshness } from './paper-market-freshness';
import {
  loadMarketCheckpoint,
  saveMarketCheckpoint
} from './paper-market-checkpoint';
import { validateSafePaperMarket } from './paper-market-safety';
import type { PaperMarketObservation } from './paper-market-data';
import { acquirePaperLock } from './paper-lock';

const mint = process.env.PAPER_TOKEN_MINT;
const dir = process.env.PAPER_MARKET_DIR ?? '.paper-market-data';

if (!mint) {
  throw new Error('PAPER_TOKEN_MINT is required');
}

mkdirSync(dir, { recursive: true });

const legacyPath = join(dir, 'market-state.json');
const checkpointPath = join(dir, 'market-checkpoint.json');

async function main(): Promise<void> {
  const release = acquirePaperLock(join(dir, 'monitor.lock'));

  try {
    const checkpoint = loadMarketCheckpoint(checkpointPath);

    let previous: PaperMarketObservation | null = null;
    let previousFreshness = checkpoint?.freshness ?? null;
    let migratedFromLegacy = false;

    if (checkpoint) {
      if (checkpoint.observation.tokenMint !== mint) {
        throw new Error('Stored market identity mismatch');
      }

      previous = checkpoint.observation;
    } else if (existsSync(legacyPath)) {
      const saved: unknown = JSON.parse(
        readFileSync(legacyPath, 'utf8')
      );

      if (
        !saved ||
        typeof saved !== 'object' ||
        (saved as PaperMarketObservation).tokenMint !== mint
      ) {
        throw new Error('Stored market identity mismatch');
      }

      const legacy = saved as PaperMarketObservation;

      previous = validateSafePaperMarket(
        legacy,
        null,
        Date.parse(legacy.observedAt)
      );

      migratedFromLegacy = true;
    }

    const observation = await fetchPaperTokenPrice(mint!);

    const validated = validateSafePaperMarket(
      observation,
      previous
    );

    const snapshotStatus = classifyMarketSnapshot(
      validated,
      previous
    );

    const nowMs = Date.parse(validated.observedAt);

    // The legacy format has no freshness history.
    // Begin the freshness clock at migration time.
    const freshness = evaluateMarketFreshness(
      migratedFromLegacy ? 'INITIAL' : snapshotStatus,
      previousFreshness,
      nowMs
    );

    saveMarketCheckpoint(checkpointPath, {
      version: 1,
      observation: validated,
      freshness: freshness.state
    });

    console.log(JSON.stringify({
      mode: 'OBSERVATION_ONLY',
      event: 'MARKET_OBSERVATION',
      snapshotStatus,
      freshnessStatus: freshness.status,
      unchangedForMs: freshness.unchangedForMs,
      migratedFromLegacy,
      observation: validated
    }, null, 2));
  } finally {
    release();
  }
}

main().catch(error => {
  console.error('Paper market monitor failed:', error);
  process.exitCode = 1;
});
