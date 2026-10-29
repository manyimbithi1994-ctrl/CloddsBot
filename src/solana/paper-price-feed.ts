import {
  validateMarketObservation,
  type PaperMarketObservation
} from './paper-market-data';

interface DexPair {
  chainId?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
  };
  priceUsd?: string;
  liquidity?: {
    usd?: number;
  };
}

export async function fetchPaperTokenPrice(
  tokenMint: string
): Promise<PaperMarketObservation> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenMint)) {
    throw new Error('Invalid Solana token mint');
  }

  const url =
    'https://api.dexscreener.com/latest/dex/tokens/' +
    encodeURIComponent(tokenMint);

  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Market API returned ${response.status}`);
  }

  const data: unknown = await response.json();

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid market API response');
  }

  const pairs = (data as { pairs?: unknown }).pairs;

  if (!Array.isArray(pairs)) {
    throw new Error('Missing market pairs');
  }

  const candidates = (pairs as DexPair[])
    .filter(pair =>
      pair &&
      pair.chainId === 'solana' &&
      pair.baseToken?.address === tokenMint &&
      typeof pair.priceUsd === 'string' &&
      Number.isFinite(Number(pair.priceUsd)) &&
      Number(pair.priceUsd) > 0 &&
      typeof pair.liquidity?.usd === 'number' &&
      Number.isFinite(pair.liquidity.usd) &&
      pair.liquidity.usd > 0
    )
    .sort((a, b) =>
      (b.liquidity?.usd ?? 0) -
      (a.liquidity?.usd ?? 0)
    );

  const selected = candidates[0];

  if (!selected) {
    throw new Error('No valid Solana market pair found');
  }

  return validateMarketObservation({
    source: 'DEXSCREENER',
    tokenMint,
    priceUsd: Number(selected.priceUsd),
    observedAt: new Date().toISOString(),
    pairAddress: selected.pairAddress,
    liquidityUsd: selected.liquidity?.usd
  });
}
