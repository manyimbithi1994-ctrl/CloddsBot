import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  createPaperTestConfig,
  createPaperTestRiskPolicy,
  type PaperTestConfig
} from './paper-test-config';

export interface PaperTestSession {
  version: 1;
  config: PaperTestConfig;
}

export function openPaperTestSession(
  directory: string,
  requested: PaperTestConfig
): PaperTestSession {
  createPaperTestRiskPolicy(requested);

  const path = join(directory, 'paper-session-config.json');
  const journalPath = join(directory, 'market-journal.jsonl');

  if (existsSync(path)) {
    const saved: unknown = JSON.parse(
      readFileSync(path, 'utf8')
    );

    if (
      !saved ||
      typeof saved !== 'object' ||
      Array.isArray(saved) ||
      (saved as PaperTestSession).version !== 1
    ) {
      throw new Error('Invalid saved paper session');
    }

    const session = saved as PaperTestSession;
    createPaperTestRiskPolicy(session.config);

    if (
      JSON.stringify(session.config) !==
      JSON.stringify(requested)
    ) {
      throw new Error('Paper session configuration mismatch');
    }

    return session;
  }

  // Never silently adopt an existing journal as a new session.
  if (existsSync(journalPath)) {
    throw new Error(
      'Existing journal has no session configuration'
    );
  }

  mkdirSync(dirname(path), { recursive: true });

  const session: PaperTestSession = {
    version: 1,
    config: createPaperTestConfig(
      requested.startingBalanceUsd
    )
  };

  const fd = openSync(path, 'wx', 0o600);

  try {
    const buffer = Buffer.from(JSON.stringify(session));
    let offset = 0;

    while (offset < buffer.length) {
      const written = writeSync(
        fd, buffer, offset, buffer.length - offset
      );

      if (written <= 0) {
        throw new Error('Paper session write failed');
      }

      offset += written;
    }

    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  const dirFd = openSync(directory, 'r');

  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }

  return session;
}
