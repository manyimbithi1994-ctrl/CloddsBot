import {
  closeSync,
  fsyncSync,
  openSync,
  writeSync,
  existsSync,
  mkdirSync,
  readFileSync
} from 'node:fs';
import { dirname } from 'node:path';
import {
  validatePaperSession,
  type PaperSession
} from './paper-storage';

export interface PaperJournalEntry {
  version: 1;
  tickIndex: number;
  priceUsd: number;
  session: PaperSession;
}

function validateEntry(
  value: unknown
): asserts value is PaperJournalEntry {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid paper journal entry');
  }

  const entry = value as Partial<PaperJournalEntry>;

  if (
    entry.version !== 1 ||
    !Number.isSafeInteger(entry.tickIndex) ||
    entry.tickIndex! < 0 ||
    typeof entry.priceUsd !== 'number' ||
    !Number.isFinite(entry.priceUsd) ||
    entry.priceUsd <= 0 ||
    !entry.session ||
    entry.session.nextTickIndex !== entry.tickIndex! + 1
  ) {
    throw new Error('Invalid paper journal entry');
  }

  validatePaperSession(entry.session);
}

export function readPaperJournal(
  path: string
): PaperJournalEntry[] {
  if (!existsSync(path)) return [];

  const contents = readFileSync(path, 'utf8');

  if (contents.length === 0) return [];

  if (!contents.endsWith('\n')) {
    throw new Error('Incomplete paper journal record');
  }

  const lines = contents.trimEnd().split('\n');
  const entries: PaperJournalEntry[] = [];

  for (const line of lines) {
    const value: unknown = JSON.parse(line);
    validateEntry(value);

    const previous = entries.at(-1);

    if (
      previous
        ? value.tickIndex !== previous.tickIndex + 1
        : value.tickIndex !== 0
    ) {
      throw new Error('Invalid paper journal sequence');
    }

    entries.push(value);
  }

  return entries;
}

export function appendPaperJournal(
  path: string,
  entry: PaperJournalEntry
): void {
  validateEntry(entry);

  const entries = readPaperJournal(path);
  const previous = entries.at(-1);

  if (
    previous
      ? entry.tickIndex !== previous.tickIndex + 1
      : entry.tickIndex !== 0
  ) {
    throw new Error('Non-sequential paper journal entry');
  }

  mkdirSync(dirname(path), { recursive: true });

  const fd = openSync(path, 'a', 0o600);

  try {
    const record = Buffer.from(JSON.stringify(entry) + '\n');
    let offset = 0;

    while (offset < record.length) {
      const written = writeSync(
        fd,
        record,
        offset,
        record.length - offset
      );

      if (written <= 0) {
        throw new Error('Paper journal write failed');
      }

      offset += written;
    }

    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
