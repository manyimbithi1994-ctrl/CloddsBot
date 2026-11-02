/** Pure DexScreener research stage. Never grants paper entry.
 * A pair must match the Solana chain and exact base-token mint.
 */
export interface DexStageInput {
  mint: string;
  pair: unknown;
  checkedAt: string;
  nowMs: number;
}
export interface DexStageResult {
  stage: 'DEXSCREENER';
  status: 'REJECT_UNVERIFIED' | 'REJECT_RISK' | 'REVIEW_FOR_QUICKNODE';
  reasons: string[];
  pairAddress: string | null;
  paperEntryEligible: false;
  automatedTradingEligible: false;
}
const obj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const metric = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export function assessDexScreenerStage(input: DexStageInput): DexStageResult {
  const missing: string[] = [];
  const risk: string[] = [];
  const p = input.pair;
  const checkedMs = Date.parse(input.checkedAt);
  if (!Number.isFinite(input.nowMs) || !Number.isFinite(checkedMs) ||
      input.nowMs - checkedMs > 30000 || checkedMs - input.nowMs > 5000)
    missing.push('DEX_EVIDENCE_STALE_OR_INVALID');
  if (!obj(p) || p.chainId !== 'solana' || !obj(p.baseToken) ||
      p.baseToken.address !== input.mint || typeof p.pairAddress !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.pairAddress)) {
    missing.push('DEX_PAIR_IDENTITY_UNVERIFIED');
  }
  const liquidity = obj(p) && obj(p.liquidity) ? metric(p.liquidity.usd) : null;
  const volume = obj(p) && obj(p.volume) ? metric(p.volume.h24) : null;
  const transactions = obj(p) && obj(p.txns) && obj(p.txns.h24) ? p.txns.h24 : null;
  const buys = obj(transactions) ? metric(transactions.buys) : null;
  const sells = obj(transactions) ? metric(transactions.sells) : null;
  const created = obj(p) ? metric(p.pairCreatedAt) : null;
  if (liquidity === null || volume === null || buys === null || sells === null ||
      created === null || created > input.nowMs)
    missing.push('DEX_MARKET_METRICS_UNVERIFIED');
  else {
    if (liquidity < 10000) risk.push('DEX_LOW_LIQUIDITY');
    if (volume < 5000) risk.push('DEX_LOW_VOLUME');
    if (buys + sells < 100 || sells === 0) risk.push('DEX_INSUFFICIENT_ACTIVITY');
    if (input.nowMs - created < 300000) risk.push('DEX_PAIR_TOO_NEW');
    if (liquidity > 0 && volume / liquidity > 20) risk.push('DEX_EXCESSIVE_VOLUME_LIQUIDITY_RATIO');
  }
  const status = missing.length ? 'REJECT_UNVERIFIED' :
    risk.length ? 'REJECT_RISK' : 'REVIEW_FOR_QUICKNODE';
  return {stage:'DEXSCREENER',status,reasons:[...missing,...risk],
    pairAddress:obj(p)&&typeof p.pairAddress==='string' ? p.pairAddress : null,
    paperEntryEligible:false,automatedTradingEligible:false};
}
