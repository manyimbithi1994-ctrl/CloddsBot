/** Verify captured Pump creation candidates using exactly one RPC lookup per signature.
 * Never import wallets or trading modules. Existing records are never promoted in place.
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { decodeCreationMint, PUMP_PROGRAM } from './paper-pump-create-decoder';

const rpc = process.env.CLODDS_RESEARCH_RPC_URL;
if (!rpc || !rpc.startsWith('https://')) throw new Error('HTTPS research RPC required');
const source = resolve('.paper-sessions/pump-creation-events.jsonl');
const target = resolve('.paper-sessions/pump-verified-creations.jsonl');
const limit = Math.min(20, Math.max(1, Number(process.argv[2] || 10)));
const existing = new Set<string>();
try {
  for (const line of readFileSync(target, 'utf8').split('\n')) {
    if (line.trim()) existing.add(JSON.parse(line).signature);
  }
} catch { /* new journal */ }
mkdirSync(dirname(target), { recursive: true });
const records: Array<{ signature: string; mint: string }> = [];
const input = readFileSync(source, 'utf8');
for (const line of input.split('\n')) {
  if (!line.trim()) continue;
  try {
    const item = JSON.parse(line);
    if (typeof item.signature === 'string' && typeof item.mint === 'string' &&
        !existing.has(item.signature) && !records.some(x => x.signature === item.signature))
      records.push({ signature: item.signature, mint: item.mint });
  } catch { /* ignore malformed journal lines */ }
}
let checked = 0;
let verified = 0;
for (const item of records.slice(0, limit)) {
  checked++;
  try {
    const response = await fetch(rpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: checked, method: 'getTransaction',
        params: [item.signature, { encoding: 'jsonParsed', commitment: 'finalized',
          maxSupportedTransactionVersion: 0 }] }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) continue;
    const payload = await response.json() as any;
    const tx = payload.result;
    if (!tx || !tx.meta || tx.meta.err !== null) continue;
    const instructions = [
      ...(tx.transaction?.message?.instructions ?? []),
      ...(tx.meta.innerInstructions ?? []).flatMap((g: any) => g.instructions ?? [])
    ];
    if (!instructions.some((ix: any) => decodeCreationMint(ix) === item.mint)) continue;
    const record = {
      signature: item.signature, mint: item.mint, programId: PUMP_PROGRAM,
      checkedAt: new Date().toISOString(), status: 'VERIFIED_PUMP_FUN',
      automatedTradingEligible: false
    };
    appendFileSync(target, JSON.stringify(record) + '\n');
    existing.add(item.signature);
    verified++;
    console.log(JSON.stringify(record));
  } catch { /* RPC error: fail closed */ }
  await new Promise(r => setTimeout(r, 1200));
}
console.log(JSON.stringify({ mode: 'RESEARCH_ONLY', checked, verified, limit, output: target }));
