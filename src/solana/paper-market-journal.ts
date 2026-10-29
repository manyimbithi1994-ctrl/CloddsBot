import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync
} from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

import { PaperTradingEngine } from './paper-engine';

export interface PaperMarketJournalEntry {
  version: 1;
  sequence: number;
  observationId: string;
  observedAt: string;
  tokenMint: string;
  pairAddress: string;
  priceUsd: number;
  source?: string;
  liquidityUsd?: number;
  action: 'BUY' | 'SELL' | 'HOLD' | 'BLOCK';
  exitReason?: 'TAKE_PROFIT' | 'STOP_LOSS';
  entryPriceUsd: number | null;
  account: ReturnType<PaperTradingEngine['snapshot']>;
  previousHash: string | null;
  hash: string;
}

type JournalPayload = Omit<PaperMarketJournalEntry, 'hash'>;

export function hashMarketJournalEntry(
  entry: JournalPayload
): string {
  return createHash('sha256')
    .update(JSON.stringify(entry))
    .digest('hex');
}

export function validateMarketJournalEntry(
  value: unknown
): asserts value is PaperMarketJournalEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid market journal entry');
  }

  const entry = value as Partial<PaperMarketJournalEntry>;

  if (
    entry.version !== 1 ||
    !Number.isSafeInteger(entry.sequence) ||
    entry.sequence! < 0 ||
    typeof entry.observationId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(entry.observationId) ||
    typeof entry.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(entry.observedAt)) ||
    typeof entry.tokenMint !== 'string' ||
    entry.tokenMint.length === 0 ||
    typeof entry.pairAddress !== 'string' ||
    entry.pairAddress.length === 0 ||
    typeof entry.priceUsd !== 'number' ||
    !Number.isFinite(entry.priceUsd) ||
    entry.priceUsd <= 0 ||
    !['BUY', 'SELL', 'HOLD', 'BLOCK'].includes(entry.action!) ||
    (entry.exitReason !== undefined &&
      (entry.action !== 'SELL' ||
       !['TAKE_PROFIT', 'STOP_LOSS'].includes(entry.exitReason))) ||
    !(entry.previousHash === null ||
      (typeof entry.previousHash === 'string' &&
       /^[a-f0-9]{64}$/.test(entry.previousHash))) ||
    typeof entry.hash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(entry.hash)
  ) {
    throw new Error('Invalid market journal entry');
  }

  if (
    (entry.source !== undefined &&
      (typeof entry.source !== 'string' ||
       entry.source.length === 0)) ||
    (entry.liquidityUsd !== undefined &&
      (typeof entry.liquidityUsd !== 'number' ||
       !Number.isFinite(entry.liquidityUsd) ||
       entry.liquidityUsd < 0)) ||
    ((entry.source === undefined) !==
      (entry.liquidityUsd === undefined))
  ) {
    throw new Error('Invalid market journal metadata');
  }

  const engine = new PaperTradingEngine();
  engine.restore(entry.account!);

  const hasPosition = engine.snapshot().openPositions === 1;

  if (
    hasPosition !== (entry.entryPriceUsd !== null) ||
    (entry.entryPriceUsd !== null &&
      (typeof entry.entryPriceUsd !== 'number' ||
       !Number.isFinite(entry.entryPriceUsd) ||
       entry.entryPriceUsd <= 0))
  ) {
    throw new Error('Inconsistent market journal position');
  }

  const { hash, ...payload } = entry as PaperMarketJournalEntry;

  if (hashMarketJournalEntry(payload) !== hash) {
    throw new Error('Market journal hash mismatch');
  }
}

export function readMarketJournal(
  path: string
): PaperMarketJournalEntry[] {
  if (!existsSync(path)) return [];

  const content = readFileSync(path, 'utf8');

  if (content.length === 0) return [];

  if (!content.endsWith('\n')) {
    throw new Error('Incomplete market journal record');
  }

  const entries: PaperMarketJournalEntry[] = [];

  for (const line of content.slice(0, -1).split('\n')) {
    const value: unknown = JSON.parse(line);
    validateMarketJournalEntry(value);

    const previous = entries.at(-1);

    if (
      value.sequence !== entries.length ||
      value.previousHash !== (previous?.hash ?? null) ||
      (previous && value.observedAt <= previous.observedAt) ||
      entries.some(e => e.observationId === value.observationId) ||
      (previous &&
        (value.tokenMint !== previous.tokenMint ||
         value.pairAddress !== previous.pairAddress))
    ) {
      throw new Error('Invalid market journal sequence or identity');
    }

    entries.push(value);
  }

  return entries;
}

export function appendMarketJournal(
  path: string,
  payload: JournalPayload
): PaperMarketJournalEntry {
  const entries = readMarketJournal(path);
  const previous = entries.at(-1);

  if (
    payload.sequence !== entries.length ||
    payload.previousHash !== (previous?.hash ?? null) ||
    (previous && payload.observedAt <= previous.observedAt) ||
    entries.some(e => e.observationId === payload.observationId) ||
    (previous &&
      (payload.tokenMint !== previous.tokenMint ||
       payload.pairAddress !== previous.pairAddress))
  ) {
    throw new Error('Invalid market journal append');
  }

  const entry: PaperMarketJournalEntry = {
    ...payload,
    hash: hashMarketJournalEntry(payload)
  };

  validateMarketJournalEntry(entry);

  mkdirSync(dirname(path), { recursive: true });

  const fd = openSync(path, 'a', 0o600);

  try {
    const buffer = Buffer.from(JSON.stringify(entry) + '\n');
    let offset = 0;

    while (offset < buffer.length) {
      const written = writeSync(
        fd,
        buffer,
        offset,
        buffer.length - offset
      );

      if (written <= 0) {
        throw new Error('Market journal write failed');
      }

      offset += written;
    }

    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  return entry;
}
