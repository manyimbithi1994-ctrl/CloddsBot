import {
  existsSync,
  readFileSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { PaperMarketObservation } from './paper-market-data';
import type { MarketFreshnessState } from './paper-market-freshness';
import { validateSafePaperMarket } from './paper-market-safety';

export interface PaperMarketCheckpoint {
  version: 1;
  observation: PaperMarketObservation;
  freshness: MarketFreshnessState;
}

export function validateMarketCheckpoint(
  value: unknown
): PaperMarketCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid market checkpoint');
  }

  const data = value as Partial<PaperMarketCheckpoint>;

  if (
    data.version !== 1 ||
    !data.observation ||
    !data.freshness ||
    typeof data.freshness.lastChangedAt !== 'string'
  ) {
    throw new Error('Invalid market checkpoint');
  }

  const observationTime = Date.parse(data.observation.observedAt);
  const changedTime = Date.parse(data.freshness.lastChangedAt);

  if (
    !Number.isFinite(observationTime) ||
    !Number.isFinite(changedTime) ||
    changedTime > observationTime
  ) {
    throw new Error('Invalid market checkpoint timestamps');
  }

  validateSafePaperMarket(
    data.observation,
    null,
    observationTime
  );

  return data as PaperMarketCheckpoint;
}

export function loadMarketCheckpoint(
  path: string
): PaperMarketCheckpoint | null {
  if (!existsSync(path)) {
    return null;
  }

  const data: unknown = JSON.parse(
    readFileSync(path, 'utf8')
  );

  return validateMarketCheckpoint(data);
}

export function saveMarketCheckpoint(
  path: string,
  checkpoint: PaperMarketCheckpoint
): void {
  const validated = validateMarketCheckpoint(checkpoint);
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;

  let fd: number | undefined;

  try {
    fd = openSync(tempPath, 'wx', 0o600);

    const buffer = Buffer.from(
      JSON.stringify(validated, null, 2)
    );

    let offset = 0;

    while (offset < buffer.length) {
      const written = writeSync(
        fd,
        buffer,
        offset,
        buffer.length - offset
      );

      if (written <= 0) {
        throw new Error('Market checkpoint write failed');
      }

      offset += written;
    }

    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;

    renameSync(tempPath, path);

    const dirFd = openSync(dirname(path), 'r');

    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } finally {
    if (fd !== undefined) {
      closeSync(fd);
    }

    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }
}
