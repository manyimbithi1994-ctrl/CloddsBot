/**
 * Isolated, bounded multi-token research collection. No wallet, trading engine,
 * dashboard session, or order executor imports. Run manually in Codespaces.
 */
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { discoverSolanaCandidates } from './paper-token-discovery';
import { fetchPaperTokenPrice } from './paper-price-feed';
import { validateSafePaperMarket } from './paper-market-safety';
import type { PaperMarketObservation } from './paper-market-data';

interface ResearchRecord {
  version: 1;
  observedAt: string;
  observation: PaperMarketObservation;
}
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const directory = resolve('.paper-sessions', 'multi-token-research');
const historyFile = join(directory, 'observations.jsonl');
const lockFile = join(directory, 'collector.lock');

function readHistory(): Map<string, PaperMarketObservation> {
  const previous = new Map<string, PaperMarketObservation>();
  if (!existsSync(historyFile)) return previous;
  const content = readFileSync(historyFile, 'utf8');
  if (content && !content.endsWith('\n')) throw new Error('Incomplete research journal tail');
  for (const line of content.split('\n').filter(Boolean)) {
    const row = JSON.parse(line) as ResearchRecord;
    if (row.version !== 1 || !row.observation || !MINT.test(row.observation.tokenMint) ||
        row.observedAt !== row.observation.observedAt)
      throw new Error('Corrupt research record');
    const old = previous.get(row.observation.tokenMint);
    validateSafePaperMarket(row.observation, old, Date.parse(row.observedAt));
    previous.set(row.observation.tokenMint, row.observation);
  }
  return previous;
}

async function main(): Promise<void> {
  const cycles = Number(process.argv[2] ?? 4);
  if (!Number.isSafeInteger(cycles) || cycles < 1 || cycles > 20)
    throw new Error('Usage: paper-research-collector.ts [cycles 1..20]');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = openSync(lockFile, 'wx', 0o600);
  try {
    const previous = readHistory();
    const discovered = await discoverSolanaCandidates();
    const candidates = discovered.candidates.filter(c => c.eligible && !!c.pairAddress).slice(0, 4);
    if (!candidates.length) {
      console.log('No candidates passed preliminary screening; no observations collected');
      return;
    }
    console.log('RESEARCH ONLY: collecting', candidates.length, 'unverified tokens over', cycles, 'cycles');
    for (let cycle = 0; cycle < cycles; cycle++) {
      for (const candidate of candidates) {
        try {
          const observation = await fetchPaperTokenPrice(candidate.mint);
          if (observation.pairAddress !== candidate.pairAddress)
            throw new Error('Pair changed since discovery');
          const old = previous.get(candidate.mint);
          const safe = validateSafePaperMarket(observation, old);
          const row: ResearchRecord = { version: 1, observedAt: safe.observedAt, observation: safe };
          const fd = openSync(historyFile, 'a', 0o600);
          try {
            const bytes = Buffer.from(JSON.stringify(row) + '\n');
            let offset = 0;
            while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
            fsyncSync(fd);
          } finally { closeSync(fd); }
          previous.set(candidate.mint, safe);
          console.log('Observed', candidate.mint, safe.priceUsd, safe.observedAt);
        } catch (error) {
          console.error('Skipped', candidate.mint, error instanceof Error ? error.message : error);
        }
        await sleep(1200);
      }
      if (cycle + 1 < cycles) await sleep(15_000);
    }
    console.log('Research journal:', historyFile, 'No simulated or real trades executed');
  } finally {
    closeSync(lock);
    const { unlinkSync } = await import('node:fs');
    unlinkSync(lockFile);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
