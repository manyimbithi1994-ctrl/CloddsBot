/**
 * First-stage origin screening. An address suffix or DEX listing is NOT
 * proof of Pump.fun creation. No wallet, order, or market-monitor imports.
 */
export const PUMP_CREATION_PROGRAMS = [
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  'BQFtMNSBKP3qLsoyocazbKA7fB8313jizRCSs1R6hBma'
] as const;
export type OriginStatus = 'VERIFIED_PUMP_FUN' | 'NOT_VERIFIED' | 'UNKNOWN';
export interface OriginEvidence {
  mint: string;
  status: OriginStatus;
  checkedAt: string;
  creationSignature: string | null;
  creationProgramId: string | null;
  reason: string;
  tradingEligible: false;
}
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
type RpcInstruction = { programId?: string; parsed?: { type?: string; info?: Record<string, unknown> } };
type RpcTransaction = {
  meta?: { err?: unknown; innerInstructions?: Array<{ instructions?: RpcInstruction[] }> };
  transaction?: { message?: { instructions?: RpcInstruction[] } };
};
export function verifyPumpCreationEvidence(
  mint: string, transaction: RpcTransaction | null, signature: string | null,
  checkedAt = new Date().toISOString()
): OriginEvidence {
  if (!MINT.test(mint)) throw new Error('Invalid mint');
  const base = { mint, checkedAt, creationSignature: null, creationProgramId: null, tradingEligible: false as const };
  if (!transaction || !signature || transaction.meta?.err !== null && transaction.meta?.err !== undefined)
    return { ...base, status: 'UNKNOWN', reason: 'Creation transaction unavailable or unsuccessful' };
  const instructions = [
    ...(transaction.transaction?.message?.instructions ?? []),
    ...(transaction.meta?.innerInstructions ?? []).flatMap(group => group.instructions ?? [])
  ];
  // The RPC parsed instruction structure is not guaranteed to expose the
  // Pump create instruction's mint account. Program presence alone is
  // insufficient to bind a specific mint to its creation.
  const pumpSeen = instructions.some(i =>
    typeof i.programId === 'string' &&
    PUMP_CREATION_PROGRAMS.some(program => program === i.programId));
  return { ...base, status: 'NOT_VERIFIED',
    reason: pumpSeen
      ? 'Pump program present, but creation instruction and mint binding not independently decoded'
      : 'No verified Pump.fun creation instruction bound to this mint' };
}

export async function inspectPumpOrigin(
  mint: string, rpcUrl: string, nowMs = Date.now()
): Promise<OriginEvidence> {
  if (!MINT.test(mint)) throw new Error('Invalid mint');
  const checkedAt = new Date(nowMs).toISOString();
  const unknown = (reason: string): OriginEvidence => ({
    mint, status: 'UNKNOWN', checkedAt, creationSignature: null,
    creationProgramId: null, reason, tradingEligible: false
  });
  if (!/^https:\/\//.test(rpcUrl)) throw new Error('HTTPS Solana RPC required');
  const request = async (method: string, params: unknown[]): Promise<unknown> => {
    const response = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('RPC HTTP ' + response.status);
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || 'error' in body) throw new Error('RPC error');
    return (body as { result?: unknown }).result;
  };
  try {
    // Walk backwards in bounded pages. Never claim the oldest signature is
    // creation unless history is exhausted. This limits RPC cost per mint.
    const pageSize = 100;
    const maxPages = 1;
    let before: string | undefined;
    let oldest: { signature?: unknown; err?: unknown } | undefined;
    let exhausted = false;
    const seen = new Set<string>();
    for (let page = 0; page < maxPages; page++) {
      const options: { limit: number; commitment: string; before?: string } = {
        limit: pageSize, commitment: 'finalized'
      };
      if (before) options.before = before;
      const signatures = await request('getSignaturesForAddress', [mint, options]);
      if (!Array.isArray(signatures))
        return unknown('Invalid signature history response');
      if (signatures.length === 0) {
        exhausted = true;
        break;
      }
      for (const entry of signatures) {
        if (!entry || typeof entry.signature !== 'string' ||
            seen.has(entry.signature))
          return unknown('Invalid or repeated signature history');
        seen.add(entry.signature);
      }
      oldest = signatures.at(-1) as { signature?: unknown; err?: unknown };
      before = oldest.signature as string;
      if (signatures.length < pageSize) {
        exhausted = true;
        break;
      }
    }
    if (!exhausted)
      return unknown('Active mint has at least 100 signatures; defer to indexed creation evidence instead of expensive history crawling');
    if (!oldest || typeof oldest.signature !== 'string' || oldest.err)
      return unknown('Earliest visible transaction cannot establish creation');
    const transaction = await request('getTransaction', [
      oldest.signature, { encoding: 'jsonParsed', commitment: 'finalized',
        maxSupportedTransactionVersion: 0 }
    ]);
    return verifyPumpCreationEvidence(
      mint, transaction as RpcTransaction | null, oldest.signature, checkedAt);
  } catch {
    return unknown('Origin RPC unavailable or incomplete; fail closed');
  }
}
