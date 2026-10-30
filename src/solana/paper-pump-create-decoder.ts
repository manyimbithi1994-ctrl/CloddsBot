import { createHash } from 'node:crypto';
import bs58 from 'bs58';
export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const discriminators = new Set(['create','create_v2'].map(x =>
  createHash('sha256').update('global:' + x).digest().subarray(0,8).toString('hex')));
export interface CreationInstruction {
  programId?: string;
  accounts?: string[];
  data?: string;
}
export function decodeCreationMint(ix: CreationInstruction): string | null {
  if (ix.programId !== PUMP_PROGRAM || !Array.isArray(ix.accounts) || !ix.data) return null;
  try {
    const data = bs58.decode(ix.data);
    if (data.length < 8 || !discriminators.has(Buffer.from(data.subarray(0,8)).toString('hex')))
      return null;
    const mint = ix.accounts[0];
    return typeof mint === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) ? mint : null;
  } catch { return null; }
}
