/** Read-only, zero-RPC batch market screening for already verified Pump mints.
 * DexScreener is advisory; absence of a pair is not proof of illiquidity.
 * Never imports wallets or trading modules.
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Verified = { mint: string; signature: string; status: string; programId: string };
type Pair = Record<string, any>;
const source = resolve('.paper-sessions/pump-verified-creations.jsonl');
const target = resolve('.paper-sessions/pump-market-screen.jsonl');
const max = Math.min(30, Math.max(1, Number(process.argv[2] || 10)));
const mints = new Map<string, Verified>();
for (const line of readFileSync(source, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try {
    const r = JSON.parse(line) as Verified;
    if (r.status === 'VERIFIED_PUMP_FUN' &&
        r.programId === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' &&
        /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.mint) &&
        typeof r.signature === 'string') mints.set(r.mint, r);
  } catch { /* ignore invalid journal entries */ }
}
mkdirSync(dirname(target), { recursive: true });
const previous = new Set<string>();
try {
  for (const line of readFileSync(target, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (typeof r.mint === 'string') previous.add(r.mint);
  }
} catch { /* first run */ }
const selected = [...mints.values()].filter(x => !previous.has(x.mint)).slice(0, max);
const metric = (x: unknown): number | null =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
async function main(): Promise<void> {
  if (!selected.length) {
    console.log(JSON.stringify({ mode: 'MARKET_RESEARCH_ONLY', screened: 0, rpcRequests: 0, reason: 'No new verified mints' }));
    return;
  }
  const url = 'https://api.dexscreener.com/tokens/v1/solana/' +
    selected.map(x => x.mint).join(',');
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('DexScreener HTTP ' + response.status);
  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) throw new Error('Unexpected DexScreener response');
  const byMint = new Map<string, Pair[]>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Pair;
    if (p.chainId !== 'solana' || typeof p.baseToken?.address !== 'string') continue;
    const arr = byMint.get(p.baseToken.address) ?? [];
    arr.push(p);
    byMint.set(p.baseToken.address, arr);
  }
  let passed = 0;
  for (const token of selected) {
    const pairs = (byMint.get(token.mint) ?? []).sort((a,b) =>
      (metric(b.liquidity?.usd) ?? 0) - (metric(a.liquidity?.usd) ?? 0));
    const pair = pairs[0];
    const liquidity = metric(pair?.liquidity?.usd);
    const volume = metric(pair?.volume?.h24);
    const buys = metric(pair?.txns?.h24?.buys);
    const sells = metric(pair?.txns?.h24?.sells);
    const age = metric(pair?.pairCreatedAt) === null ? null : Date.now() - pair.pairCreatedAt;
    const reasons: string[] = [];
    if (!pair) reasons.push('NO_INDEXED_PAIR');
    if (liquidity === null || liquidity < 10000) reasons.push('LOW_OR_UNKNOWN_LIQUIDITY');
    if (volume === null || volume < 5000) reasons.push('LOW_OR_UNKNOWN_VOLUME');
    if (buys === null || sells === null || buys + sells < 100 || sells === 0)
      reasons.push('INSUFFICIENT_TRADING_ACTIVITY');
    if (age === null || age < 300000) reasons.push('PAIR_TOO_NEW_OR_UNKNOWN');
    if (liquidity !== null && liquidity > 0 && volume !== null && volume / liquidity > 20)
      reasons.push('EXCESSIVE_VOLUME_LIQUIDITY_RATIO');
    const record = {
      mint: token.mint, creationSignature: token.signature,
      origin: 'VERIFIED_PUMP_FUN', checkedAt: new Date().toISOString(),
      source: 'DEXSCREENER_BATCH', pairAddress: pair?.pairAddress ?? null,
      liquidityUsd: liquidity, volume24hUsd: volume, buys24h: buys,
      sells24h: sells, pairAgeMs: age, reasons,
      marketScreenPassed: reasons.length === 0,
      onchainSafetyVerified: false, automatedTradingEligible: false
    };
    if (record.marketScreenPassed) passed++;
    appendFileSync(target, JSON.stringify(record) + '\n');
    console.log(JSON.stringify(record));
  }
  console.log(JSON.stringify({
    mode: 'MARKET_RESEARCH_ONLY', screened: selected.length, passed,
    rpcRequests: 0, dexScreenerRequests: 1, output: target
  }));
}
void main().catch(error => {
  console.error('Market screen failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
