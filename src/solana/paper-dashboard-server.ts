import { createServer } from 'node:http';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { readMarketJournal } from './paper-market-journal';
import { analyzePaperPerformance } from './paper-performance';
import { createPaperTestConfig } from './paper-test-config';

const directory = resolve(process.argv[2] ?? '');

if (!process.argv[2]) {
  throw new Error('Provide an existing paper session directory');
}

const sessionDirectory = realpathSync(directory);

if (!statSync(sessionDirectory).isDirectory()) {
  throw new Error('Invalid session directory');
}

const configPath = join(sessionDirectory, 'paper-session-config.json');
const journalPath = join(sessionDirectory, 'market-journal.jsonl');

const config = JSON.parse(readFileSync(configPath, 'utf8'));

if (
  config.version !== 1 ||
  !config.config ||
  JSON.stringify(config.config) !==
    JSON.stringify(
      createPaperTestConfig(config.config.startingBalanceUsd)
    )
) {
  throw new Error('Invalid paper session configuration');
}

const startingBalanceUsd = config.config.startingBalanceUsd;

const host = '127.0.0.1';
const port = 4173;

const server = createServer((req, res) => {
  try {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const url = new URL(req.url ?? '/', `http://${host}:${port}`);

    if (url.pathname === '/api/performance') {
      const entries = readMarketJournal(journalPath);
      const report = analyzePaperPerformance(
        entries,
        startingBalanceUsd
      );

      const equity = entries.map(entry => ({
        time: entry.observedAt,
        equityUsd:
          entry.account.cashUsd +
          entry.account.tokenQuantity * entry.priceUsd
      }));

      const trades = entries
        .filter(entry =>
          entry.action === 'BUY' ||
          entry.action === 'SELL'
        )
        .map(entry => ({
          time: entry.observedAt,
          action: entry.action,
          exitReason: entry.exitReason ?? null,
          priceUsd: entry.priceUsd,
          cashUsd: entry.account.cashUsd,
          realizedPnlUsd: entry.account.realizedDailyPnlUsd
        }));

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });

      res.end(JSON.stringify({
        report,
        equity,
        trades
      }));

      return;
    }

    if (url.pathname === '/') {
      const html = readFileSync(
        join(__dirname, 'paper-dashboard', 'index.html'),
        'utf8'
      );

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'"
      });

      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (error) {
    console.error('Paper dashboard error:', error);
    res.writeHead(500);
    res.end('Unable to load validated paper session');
  }
});

server.listen(port, host, () => {
  console.log(`Paper dashboard: http://${host}:${port}`);
  console.log(`Session: ${sessionDirectory}`);
  console.log('READ-ONLY: no trading or wallet operations');
});
