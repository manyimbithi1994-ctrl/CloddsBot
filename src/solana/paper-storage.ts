import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync
} from 'node:fs';
import { dirname } from 'node:path';
import { PaperTradingEngine } from './paper-engine';

export interface PaperSession {
  version: 1;
  nextTickIndex: number;
  entryPrice: number | null;
  account: ReturnType<PaperTradingEngine['snapshot']>;
}

export function validatePaperSession(
  value: unknown
): asserts value is PaperSession {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid paper session');
  }

  const session = value as Partial<PaperSession>;

  if (
    session.version !== 1 ||
    !Number.isSafeInteger(session.nextTickIndex) ||
    session.nextTickIndex! < 0 ||
    (
      session.entryPrice !== null &&
      (
        typeof session.entryPrice !== 'number' ||
        !Number.isFinite(session.entryPrice) ||
        session.entryPrice <= 0
      )
    )
  ) {
    throw new Error('Invalid paper session');
  }

  const engine = new PaperTradingEngine();
  engine.restore(session.account!);

  const hasPosition = engine.snapshot().openPositions === 1;

  if (hasPosition !== (session.entryPrice !== null)) {
    throw new Error('Inconsistent paper session position');
  }
}

export function loadPaperSession(
  path: string
): PaperSession | null {
  if (!existsSync(path)) return null;

  const session: unknown = JSON.parse(
    readFileSync(path, 'utf8')
  );

  validatePaperSession(session);
  return session;
}

export function savePaperSession(
  path: string,
  session: PaperSession
): void {
  validatePaperSession(session);

  mkdirSync(dirname(path), { recursive: true });

  const tempPath = `${path}.${process.pid}.tmp`;

  try {
    writeFileSync(
      tempPath,
      JSON.stringify(session, null, 2),
      { flag: 'wx', mode: 0o600 }
    );

    renameSync(tempPath, path);
  } finally {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }
}
