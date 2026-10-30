/** Offline classification of cached market screens. No HTTP or RPC calls.
 * UNKNOWN liquidity is not treated as confirmed low liquidity.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
type RecordRow = {
  mint: string; origin: string; liquidityUsd: number | null;
  volume24hUsd: number | null; buys24h: number | null;
  sells24h: number | null; pairAddress: string | null;
  reasons: string[];
};
const file = resolve('.paper-sessions/pump-market-screen.jsonl');
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean);
const classified: Array<{mint:string; status:string; reason:string}> = [];
for (const line of rows) {
  let row: RecordRow;
  try { row = JSON.parse(line) as RecordRow; } catch { continue; }
  if (row.origin !== 'VERIFIED_PUMP_FUN') continue;
  const active = row.pairAddress &&
    (row.volume24hUsd ?? 0) >= 5000 &&
    (row.buys24h ?? 0) + (row.sells24h ?? 0) >= 100 &&
    (row.sells24h ?? 0) > 0;
  const status = row.liquidityUsd === null && active
    ? 'LIQUIDITY_UNKNOWN_REVIEW'
    : row.liquidityUsd !== null && row.liquidityUsd >= 10000 && active
      ? 'MARKET_SCREEN_PASS'
      : 'MARKET_SCREEN_REJECT';
  classified.push({mint: row.mint, status,
    reason: status === 'LIQUIDITY_UNKNOWN_REVIEW'
      ? 'Active market but USD liquidity unavailable; needs independent verification'
      : status === 'MARKET_SCREEN_PASS' ? 'Meets cached market thresholds'
        : 'Insufficient confirmed market evidence'});
}
console.log(JSON.stringify({mode:'OFFLINE_RESEARCH_ONLY',rpcRequests:0,
  candidates:classified, review:classified.filter(x=>x.status==='LIQUIDITY_UNKNOWN_REVIEW').length},null,2));
