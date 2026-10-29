import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync
} from 'node:fs';
import { join } from 'node:path';
import { fetchPaperTokenPrice } from './paper-price-feed';
import { classifyMarketSnapshot } from './paper-market-snapshot';
import { validateSafePaperMarket } from './paper-market-safety';
import type { PaperMarketObservation } from './paper-market-data';
import { acquirePaperLock } from './paper-lock';

const mint = process.env.PAPER_TOKEN_MINT;
const dir = process.env.PAPER_MARKET_DIR ?? '.paper-market-data';

if (!mint) {
  throw new Error('PAPER_TOKEN_MINT is required');
}

mkdirSync(dir, { recursive: true });

const statePath = join(dir, 'market-state.json');
async function main(): Promise<void> {
  const release = acquirePaperLock(join(dir, 'monitor.lock'));

  try {
    let previous: PaperMarketObservation | null = null;

    if (existsSync(statePath)) {
      const saved: unknown = JSON.parse(
        readFileSync(statePath, 'utf8')
      );

      if (
        !saved ||
        typeof saved !== 'object' ||
        (saved as PaperMarketObservation).tokenMint !== mint
      ) {
        throw new Error('Stored market identity mismatch');
      }

      previous = validateSafePaperMarket(
        saved as PaperMarketObservation,
        null,
        Date.parse((saved as PaperMarketObservation).observedAt)
      );
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

    const tempPath = `${statePath}.${process.pid}.tmp`;

    writeFileSync(
      tempPath,
      JSON.stringify(validated, null, 2),
      { flag: 'wx', mode: 0o600 }
    );

    renameSync(tempPath, statePath);

    console.log(JSON.stringify({
      mode: 'OBSERVATION_ONLY',
      event: 'MARKET_OBSERVATION',
      snapshotStatus,
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
