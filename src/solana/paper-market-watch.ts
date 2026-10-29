import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const intervalMs = 15_000;
const maxObservations = 10;

async function main(): Promise<void> {
  if (!process.env.PAPER_TOKEN_MINT) {
    throw new Error('PAPER_TOKEN_MINT is required');
  }

  if (!process.env.PAPER_MARKET_DIR) {
    throw new Error('PAPER_MARKET_DIR is required');
  }

  console.log(JSON.stringify({
    mode: 'OBSERVATION_ONLY',
    event: 'WATCH_STARTED',
    intervalSeconds: intervalMs / 1000,
    maxObservations
  }));

  for (let i = 0; i < maxObservations; i++) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'src/solana/paper-market-monitor.ts'
      ],
      {
        env: process.env,
        encoding: 'utf8',
        timeout: 15_000
      }
    );

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.error || result.status !== 0) {
      throw new Error(
        `Market observation failed at iteration ${i + 1}: ` +
        (result.error?.message ?? `exit ${result.status}`)
      );
    }

    if (i + 1 < maxObservations) {
      await delay(intervalMs);
    }
  }

  console.log(JSON.stringify({
    mode: 'OBSERVATION_ONLY',
    event: 'WATCH_FINISHED',
    observations: maxObservations
  }));
}

main().catch(error => {
  console.error('Paper market watch failed:', error.message);
  process.exitCode = 1;
});
