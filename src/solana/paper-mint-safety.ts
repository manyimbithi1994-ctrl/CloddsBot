/**
 * Bounded, read-only SPL mint safety preflight.
 * Token-account concentration is a warning, NOT verified beneficial ownership.
 * No wallet or trading imports.
 */
export interface MintSafetyPreflight {
  mint: string;
  checkedAt: string;
  status: 'PASS_PRELIMINARY' | 'BLOCK' | 'UNKNOWN';
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  topTokenAccountSharePercent: number | null;
  reasons: string[];
  holderConcentrationVerified: false;
  liquidityRisksVerified: false;
  tradingEligible: false;
}
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN_PROGRAMS = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
]);

export function evaluateMintSafetyResponse(
  mint: string, accountResult: unknown, largestResult: unknown,
  checkedAt = new Date().toISOString()
): MintSafetyPreflight {
  if (!MINT.test(mint)) throw new Error('Invalid Solana mint');
  const result: MintSafetyPreflight = {
    mint, checkedAt, status: 'UNKNOWN', mintAuthorityRevoked: null,
    freezeAuthorityRevoked: null, topTokenAccountSharePercent: null,
    reasons: [], holderConcentrationVerified: false,
    liquidityRisksVerified: false, tradingEligible: false
  };
  const account = (accountResult as { value?: {
    owner?: unknown; data?: { parsed?: { type?: unknown; info?: {
      mintAuthority?: unknown; freezeAuthority?: unknown; supply?: unknown
    } } }
  } } | null)?.value;
  if (!account || typeof account.owner !== 'string' || !TOKEN_PROGRAMS.has(account.owner) ||
      account.data?.parsed?.type !== 'mint') {
    result.reasons.push('Mint account missing, unsupported or not parsed');
    return result;
  }
  const info = account.data.parsed.info;
  if (!info || !Object.hasOwn(info, 'mintAuthority') ||
      !Object.hasOwn(info, 'freezeAuthority') ||
      (info.mintAuthority !== null && typeof info.mintAuthority !== 'string') ||
      (info.freezeAuthority !== null && typeof info.freezeAuthority !== 'string')) {
    result.reasons.push('Mint or freeze authority could not be determined');
    return result;
  }
  result.mintAuthorityRevoked = info.mintAuthority === null;
  result.freezeAuthorityRevoked = info.freezeAuthority === null;
  if (!result.mintAuthorityRevoked) result.reasons.push('Mint authority remains active');
  if (!result.freezeAuthorityRevoked) result.reasons.push('Freeze authority remains active');
  const largest = (largestResult as { value?: Array<{ amount?: unknown }> } | null)?.value;
  if (!Array.isArray(largest) || largest.length === 0 ||
      typeof info.supply !== 'string' || !/^\d+$/.test(info.supply)) {
    result.reasons.push('Token-account concentration data unavailable');
  } else {
    const supply = BigInt(info.supply);
    const amounts = largest.map(item =>
      typeof item.amount === 'string' && /^\d+$/.test(item.amount) ? BigInt(item.amount) : null);
    if (supply <= 0n || amounts.some(amount => amount === null || amount > supply)) {
      result.reasons.push('Invalid supply or token-account balances');
    } else {
      const largestAmount = amounts.reduce<bigint>((a, n) => n !== null && n > a ? n : a, 0n);
      result.topTokenAccountSharePercent = Number(largestAmount * 10000n / supply) / 100;
      if (result.topTokenAccountSharePercent > 20)
        result.reasons.push('Largest token account exceeds 20% of supply (may be pool or custody)');
    }
  }
  result.status = !result.mintAuthorityRevoked || !result.freezeAuthorityRevoked ||
    (result.topTokenAccountSharePercent !== null && result.topTokenAccountSharePercent > 20)
    ? 'BLOCK'
    : result.topTokenAccountSharePercent === null ? 'UNKNOWN' : 'PASS_PRELIMINARY';
  result.reasons.push('Beneficial ownership, Token-2022 extensions and liquidity risks not verified');
  return result;
}

export async function inspectMintSafety(mint: string, rpcUrl: string): Promise<MintSafetyPreflight> {
  if (!MINT.test(mint)) throw new Error('Invalid Solana mint');
  const unknown = (reason: string): MintSafetyPreflight => ({
    mint, checkedAt: new Date().toISOString(), status: 'UNKNOWN',
    mintAuthorityRevoked: null, freezeAuthorityRevoked: null,
    topTokenAccountSharePercent: null, reasons: [reason],
    holderConcentrationVerified: false, liquidityRisksVerified: false,
    tradingEligible: false
  });
  if (!/^https:\/\//.test(rpcUrl)) throw new Error('HTTPS RPC required');
  async function rpc(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('RPC HTTP ' + response.status);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || 'error' in data)
      throw new Error('RPC returned an error');
    return (data as { result?: unknown }).result;
  }
  try {
    const account = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'finalized' }]);
    const largest = await rpc('getTokenLargestAccounts', [mint, { commitment: 'finalized' }]);
    return evaluateMintSafetyResponse(mint, account, largest);
  } catch {
    return unknown('Mint safety RPC unavailable or incomplete');
  }
}
