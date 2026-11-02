/** Parse finalized Solana jsonParsed mint account evidence without trusting absent fields. */
export interface MintAuthorityEvidence {
  accountMint: string | null;
  mintAuthority: string | null | undefined;
  freezeAuthority: string | null | undefined;
  supply: bigint | null;
  reasons: string[];
}
const obj = (v:unknown):v is Record<string,unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const key = (v:unknown):v is string =>
  typeof v === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
export function parseMintAccountEvidence(expectedMint:string, response:unknown):MintAuthorityEvidence {
  const reasons:string[] = [];
  const account = obj(response) && obj(response.value) ? response.value : null;
  const parsed = obj(account) && obj(account.data) && obj(account.data.parsed) ? account.data.parsed : null;
  const info = obj(parsed) && obj(parsed.info) ? parsed.info : null;
  const owner = obj(account) ? account.owner : null;
  if (owner !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' &&
      owner !== 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
    reasons.push('MINT_PROGRAM_UNVERIFIED');
  if (!obj(parsed) || parsed.type !== 'mint' || !info) reasons.push('MINT_ACCOUNT_UNVERIFIED');
  const supplyRaw = info?.supply;
  const supply = typeof supplyRaw === 'string' && /^\d+$/.test(supplyRaw) && BigInt(supplyRaw)>0n
    ? BigInt(supplyRaw) : null;
  if (supply === null) reasons.push('MINT_SUPPLY_UNVERIFIED');
  const authority = (field:'mintAuthority'|'freezeAuthority'):string|null|undefined => {
    if (!info || !Object.prototype.hasOwnProperty.call(info,field)) {
      reasons.push(field.toUpperCase()+'_MISSING'); return undefined;
    }
    const value = info[field];
    if (value === null) return null;
    if (key(value)) return value;
    reasons.push(field.toUpperCase()+'_INVALID'); return undefined;
  };
  const mintAuthority=authority('mintAuthority');
  const freezeAuthority=authority('freezeAuthority');
  if (!key(expectedMint)) reasons.push('EXPECTED_MINT_INVALID');
  return {accountMint: reasons.length===0?expectedMint:null,mintAuthority,freezeAuthority,supply,reasons};
}
