/**
 * Read-only candidate discovery. DexScreener token profiles are NOT proof of
 * Pump.fun origin or launch time. Never pass these results to the trade runner.
 */
export interface DiscoveryCandidate {
  mint: string;
  chainId: 'solana';
  description: string | null;
  profileUrl: string | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairAddress: string | null;
  pairCreatedAt: string | null;
  volumeLiquidityRatio: number | null;
  score: number;
  eligible: boolean;
  reasons: string[];
  provenance: 'UNVERIFIED';
}

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PROFILE_ENDPOINT = 'https://api.dexscreener.com/token-profiles/latest/v1';
const MAX_CANDIDATES = 12;

type Dict = Record<string, unknown>;
const obj = (x: unknown): Dict | null =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Dict : null;
const positive = (x: unknown): number | null =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Discovery API HTTP ' + response.status);
  return response.json();
}

export function screenDiscoveryCandidate(
  candidate: Omit<DiscoveryCandidate, 'score' | 'eligible' | 'reasons'>
): DiscoveryCandidate {
  const reasons: string[] = [];
  if (candidate.provenance !== 'UNVERIFIED') throw new Error('Invalid provenance');
  if (candidate.liquidityUsd === null || candidate.liquidityUsd < 10000)
    reasons.push('Liquidity below $10,000 or unavailable');
  if (candidate.volume24hUsd === null || candidate.volume24hUsd < 5000)
    reasons.push('24-hour volume below $5,000 or unavailable');
  if (candidate.buys24h === null || candidate.sells24h === null)
    reasons.push('Buy/sell activity unavailable');
  if (!candidate.pairAddress)
    reasons.push('No Solana pair available');
  if (candidate.sells24h === 0)
    reasons.push('No recorded sells in 24 hours');
  if (candidate.buys24h !== null && candidate.sells24h !== null &&
      candidate.buys24h + candidate.sells24h < 100)
    reasons.push('Fewer than 100 transactions in 24 hours');
  if (candidate.volumeLiquidityRatio !== null && candidate.volumeLiquidityRatio > 20)
    reasons.push('24-hour volume exceeds liquidity by more than 20x');
  if (candidate.pairCreatedAt === null)
    reasons.push('Pair creation time unavailable');
  else {
    const ageMs = Date.now() - Date.parse(candidate.pairCreatedAt);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs < 5 * 60_000)
      reasons.push('Pair age under five minutes or invalid');
  }
  // Ranking is descriptive only; not an investment recommendation.
  const score = Math.round(
    Math.min(40, Math.log10(1 + (candidate.liquidityUsd ?? 0)) * 8) +
    Math.min(40, Math.log10(1 + (candidate.volume24hUsd ?? 0)) * 8) +
    Math.min(20, Math.log10(1 + (candidate.buys24h ?? 0)) * 5)
  );
  return { ...candidate, score, eligible: reasons.length === 0, reasons };
}

export async function discoverSolanaCandidates(): Promise<{
  mode: 'DISCOVERY_ONLY';
  source: 'DEXSCREENER_TOKEN_PROFILES';
  pumpFunOriginVerified: false;
  fetchedAt: string;
  candidates: DiscoveryCandidate[];
}> {
  const data = await readJson(PROFILE_ENDPOINT);
  if (!Array.isArray(data)) throw new Error('Invalid discovery profile response');
  const unique = new Map<string, { mint: string; description: string | null; profileUrl: string | null }>();
  for (const raw of data) {
    const profile = obj(raw);
    if (!profile || profile.chainId !== 'solana' ||
        typeof profile.tokenAddress !== 'string' || !MINT.test(profile.tokenAddress)) continue;
    const mint = profile.tokenAddress;
    if (!unique.has(mint)) unique.set(mint, {
      mint,
      description: typeof profile.description === 'string' ? profile.description.slice(0, 240) : null,
      profileUrl: typeof profile.url === 'string' && profile.url.startsWith('https://dexscreener.com/')
        ? profile.url : null
    });
    if (unique.size >= MAX_CANDIDATES) break;
  }
  const candidates: DiscoveryCandidate[] = [];
  for (const profile of unique.values()) {
    // Failure to enrich a candidate must not fabricate metrics.
    let pair: Dict | null = null;
    try {
      const result = obj(await readJson('https://api.dexscreener.com/latest/dex/tokens/' + profile.mint));
      const pairs = result && Array.isArray(result.pairs) ? result.pairs : [];
      const valid = pairs.map(obj).filter((p): p is Dict =>
        !!p && p.chainId === 'solana' && obj(p.baseToken)?.address === profile.mint);
      valid.sort((a, b) =>
        (positive(obj(b.liquidity)?.usd) ?? 0) - (positive(obj(a.liquidity)?.usd) ?? 0));
      pair = valid[0] ?? null;
    } catch { /* Candidate remains unverified and fails closed. */ }
    const txns = obj(obj(pair?.txns)?.h24);
    const candidate = screenDiscoveryCandidate({
      mint: profile.mint,
      chainId: 'solana',
      description: profile.description,
      profileUrl: profile.profileUrl,
      liquidityUsd: positive(obj(pair?.liquidity)?.usd),
      volume24hUsd: positive(obj(pair?.volume)?.h24),
      buys24h: positive(txns?.buys),
      sells24h: positive(txns?.sells),
      pairAddress: typeof pair?.pairAddress === 'string' ? pair.pairAddress : null,
      pairCreatedAt: typeof pair?.pairCreatedAt === 'number' &&
        Number.isFinite(pair.pairCreatedAt) && pair.pairCreatedAt > 0
        ? new Date(pair.pairCreatedAt).toISOString() : null,
      volumeLiquidityRatio: positive(obj(pair?.liquidity)?.usd) !== null &&
        positive(obj(pair?.liquidity)?.usd)! > 0 &&
        positive(obj(pair?.volume)?.h24) !== null
        ? positive(obj(pair?.volume)?.h24)! / positive(obj(pair?.liquidity)?.usd)!
        : null,
      provenance: 'UNVERIFIED'
    });
    candidates.push(candidate);
  }
  candidates.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
  return {
    mode: 'DISCOVERY_ONLY',
    source: 'DEXSCREENER_TOKEN_PROFILES',
    pumpFunOriginVerified: false,
    fetchedAt: new Date().toISOString(),
    candidates
  };
}
