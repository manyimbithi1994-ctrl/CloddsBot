import { createServer } from 'node:http';
import { readFileSync, realpathSync, statSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { openPaperTestSession } from './paper-test-session';

import { readMarketJournal } from './paper-market-journal';
import { analyzePaperPerformance } from './paper-performance';
import { createPaperTestConfig } from './paper-test-config';
import { fetchPaperTokenPrice } from './paper-price-feed';
import { validateSafePaperMarket } from './paper-market-safety';
import { classifyMarketSnapshot } from './paper-market-snapshot';
import { evaluateMarketFreshness } from './paper-market-freshness';
import { processPaperMarketObservation } from './paper-market-runner';
import type { PaperMarketObservation } from './paper-market-data';
import type { MarketFreshnessState } from './paper-market-freshness';

const directory = resolve(process.argv[2] ?? '');

if (!process.argv[2]) {
  throw new Error('Provide an existing paper session directory');
}

let sessionDirectory = realpathSync(directory);

if (!statSync(sessionDirectory).isDirectory()) {
  throw new Error('Invalid session directory');
}

let configPath = join(sessionDirectory, 'paper-session-config.json');
let journalPath = join(sessionDirectory, 'market-journal.jsonl');

let config = JSON.parse(readFileSync(configPath, 'utf8'));

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

let startingBalanceUsd = config.config.startingBalanceUsd;
let observationIntervalSeconds = 15;
let sessionStatus: 'STOPPED' | 'RUNNING' | 'ERROR' = 'STOPPED';
let tokenMint: string | null = null;
let lastError: string | null = null;
let previousObservation: PaperMarketObservation | null = null;
let freshnessState: MarketFreshnessState | null = null;
let loopTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let busy = false;

function stopLoop() {
  generation += 1;
  if (loopTimer) clearTimeout(loopTimer);
  loopTimer = null;
  sessionStatus = 'STOPPED';
}

async function pollMarket(run: number): Promise<void> {
  if (run !== generation || sessionStatus !== 'RUNNING' || busy || !tokenMint) return;
  busy = true;
  try {
    const observation = await fetchPaperTokenPrice(tokenMint);
    if (run !== generation || sessionStatus !== 'RUNNING') return;
    const validated = validateSafePaperMarket(observation, previousObservation);
    const classification = classifyMarketSnapshot(validated, previousObservation);
    const freshness = evaluateMarketFreshness(classification, freshnessState, Date.parse(validated.observedAt));
    previousObservation = validated;
    freshnessState = freshness.state;
    if (freshness.status !== 'FRESH') {
      throw new Error('Market quote unchanged too long; simulation halted');
    }
    if (run !== generation || sessionStatus !== 'RUNNING') return;
    processPaperMarketObservation({
      version: 1, observation: validated, freshness: freshness.state
    }, sessionDirectory, Date.parse(validated.observedAt), createPaperTestConfig(startingBalanceUsd));
    lastError = null;
  } catch (error) {
    if (run === generation) {
      lastError = error instanceof Error ? error.message : 'Market polling failed';
      sessionStatus = 'ERROR';
      console.error('Paper market loop stopped:', lastError);
    }
  } finally {
    busy = false;
    if (run === generation && sessionStatus === 'RUNNING') {
      loopTimer = setTimeout(() => { void pollMarket(run); }, observationIntervalSeconds * 1000);
    }
  }
}
const sessionsRoot = resolve('.paper-sessions');

const host = '127.0.0.1';
const port = 4173;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`);

    const sendJson = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };

    if (req.method === 'POST' && url.pathname.startsWith('/api/session/')) {
      const origin = req.headers.origin;
      const expectedOrigin = `http://${req.headers.host}`;
      if (!origin || origin !== expectedOrigin || !req.headers.host || req.headers['sec-fetch-site'] === 'cross-site') {
        sendJson(403, { error: 'Same-origin request required' });
        return;
      }
      let bytes = 0;
      let body = '';
      for await (const chunk of req) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 4096) { sendJson(413, { error: 'Request too large' }); return; }
        body += chunk.toString();
      }
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(body || '{}'); }
      catch { sendJson(400, { error: 'Invalid JSON' }); return; }
      if (url.pathname === '/api/session/create') {
        if (payload.tokenMint !== null && payload.tokenMint !== '' && payload.tokenMint !== undefined) {
          sendJson(400, { error: 'Token selection is not yet enabled' }); return;
        }
        if (payload.observationIntervalSeconds !== 15) {
          sendJson(400, { error: 'Only the validated 15-second interval is supported' }); return;
        }
        let requested;
        try { requested = createPaperTestConfig(payload.startingBalanceUsd as number); }
        catch { sendJson(400, { error: 'Starting balance must be between $4 and $1,000,000' }); return; }
        mkdirSync(sessionsRoot, { recursive: true, mode: 0o700 });
        const nextDir = join(sessionsRoot, 'session-' + randomUUID());
        openPaperTestSession(nextDir, requested);
        stopLoop();
        tokenMint = null;
        previousObservation = null;
        freshnessState = null;
        lastError = null;
        sessionDirectory = realpathSync(nextDir);
        configPath = join(sessionDirectory, 'paper-session-config.json');
        journalPath = join(sessionDirectory, 'market-journal.jsonl');
        config = { version: 1, config: requested };
        startingBalanceUsd = requested.startingBalanceUsd;
        observationIntervalSeconds = 15;
        sessionStatus = 'STOPPED';
        sendJson(201, { status: sessionStatus, startingBalanceUsd, observationIntervalSeconds });
        return;
      }
      if (url.pathname === '/api/session/start' || url.pathname === '/api/session/stop') {
        if (Object.keys(payload).length !== 0) { sendJson(400, { error: 'Unexpected fields' }); return; }
        if (url.pathname.endsWith('/stop')) {
          stopLoop();
          sendJson(200, { status: sessionStatus, marketPollingActive: false });
          return;
        }
        if (sessionStatus === 'RUNNING') {
          sendJson(200, { status: sessionStatus, marketPollingActive: true });
          return;
        }
        if (busy) { sendJson(409, { error: 'Previous observation still completing' }); return; }
        if (!tokenMint) {
          sendJson(409, { error: 'Select a Solana token mint before starting' });
          return;
        }
        if (readMarketJournal(journalPath).length > 0) {
          sendJson(409, { error: 'Start a new session for a new market run' });
          return;
        }
        lastError = null;
        previousObservation = null;
        freshnessState = null;
        sessionStatus = 'RUNNING';
        generation += 1;
        void pollMarket(generation);
        sendJson(200, { status: sessionStatus, marketPollingActive: true });
        return;
      }
      if (url.pathname === '/api/session/token') {
        if (sessionStatus === 'RUNNING' || busy) { sendJson(409, { error: 'Stop the session before changing tokens' }); return; }
        if (readMarketJournal(journalPath).length > 0) { sendJson(409, { error: 'Create a new session to select another token' }); return; }
        if (typeof payload.tokenMint !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(payload.tokenMint)) {
          sendJson(400, { error: 'Invalid Solana token mint address' }); return;
        }
        tokenMint = payload.tokenMint;
        sendJson(200, { status: sessionStatus, tokenMint, marketPollingActive: false });
        return;
      }
      sendJson(404, { error: 'Not found' });
      return;
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }
    if (url.pathname === '/api/session') {
      sendJson(200, { status: sessionStatus, startingBalanceUsd, observationIntervalSeconds, tokenMint, marketPollingActive: sessionStatus === 'RUNNING', lastError });
      return;
    }

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
