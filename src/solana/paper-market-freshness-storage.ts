import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync
} from 'node:fs';

import type {
  MarketFreshnessState
} from './paper-market-freshness';

export function loadFreshnessState(
  path: string
): MarketFreshnessState | null {
  if (!existsSync(path)) {
    return null;
  }

  const data: unknown = JSON.parse(
    readFileSync(path, 'utf8')
  );

  if (
    !data ||
    typeof data !== 'object' ||
    typeof (data as MarketFreshnessState).lastChangedAt !== 'string' ||
    !Number.isFinite(
      Date.parse((data as MarketFreshnessState).lastChangedAt)
    )
  ) {
    throw new Error('Invalid stored freshness state');
  }

  return data as MarketFreshnessState;
}

export function saveFreshnessState(
  path: string,
  state: MarketFreshnessState
): void {
  if (
    !state ||
    typeof state.lastChangedAt !== 'string' ||
    !Number.isFinite(Date.parse(state.lastChangedAt))
  ) {
    throw new Error('Invalid freshness state');
  }

  const tempPath = `${path}.${process.pid}.tmp`;

  writeFileSync(
    tempPath,
    JSON.stringify(state, null, 2),
    { flag: 'wx', mode: 0o600 }
  );

  renameSync(tempPath, path);
}
