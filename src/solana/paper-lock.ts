import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync
} from 'node:fs';
import { dirname } from 'node:path';

export function acquirePaperLock(path: string): () => void {
  mkdirSync(dirname(path), { recursive: true });

  const token = randomUUID();
  const fd = openSync(path, 'wx', 0o600);

  let identity: ReturnType<typeof fstatSync>;

  try {
    writeSync(fd, JSON.stringify({
      pid: process.pid,
      token,
      startedAt: new Date().toISOString()
    }));

    identity = fstatSync(fd);
  } finally {
    closeSync(fd);
  }

  let released = false;

  return () => {
    if (released) return;

    const current = lstatSync(path);

    if (
      current.dev !== identity.dev ||
      current.ino !== identity.ino
    ) {
      throw new Error('Paper lock ownership changed');
    }

    let contents: { token?: string };

    try {
      contents = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      throw new Error('Paper lock ownership changed');
    }

    if (contents.token !== token) {
      throw new Error('Paper lock ownership changed');
    }

    unlinkSync(path);
    released = true;
  };
}
