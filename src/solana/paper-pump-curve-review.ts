/** One batched read-only RPC request for at most two Pump bonding curves.
 * Never imports wallet or trading code. This is not a USD liquidity estimate.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PublicKey } from '@solana/web3.js';
const PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const DISC = Buffer.from([0x17,0xb7,0xf8,0x37,0x60,0xd8,0xac,0x60]);
const rpc = process.env.CLODDS_RESEARCH_RPC_URL;
if (!rpc || !rpc.startsWith('https://')) throw new Error('HTTPS research RPC required');
type Row = {mint:string;origin:string;liquidityUsd:number|null;volume24hUsd:number|null;buys24h:number|null;sells24h:number|null;pairAddress:string|null};
const rows: Row[] = [];
for (const line of readFileSync(resolve('.paper-sessions/pump-market-screen.jsonl'),'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { rows.push(JSON.parse(line) as Row); } catch { /* malformed */ }
}
const selected = rows.filter(r => r.origin === 'VERIFIED_PUMP_FUN' &&
  r.liquidityUsd === null && !!r.pairAddress && (r.volume24hUsd ?? 0) >= 5000 &&
  (r.buys24h ?? 0) + (r.sells24h ?? 0) >= 100 && (r.sells24h ?? 0) > 0).slice(0,2);
async function main():Promise<void> {
  if (!selected.length) { console.log(JSON.stringify({checked:0,rpcRequests:0})); return; }
  const pdas = selected.map(r => PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'),new PublicKey(r.mint).toBuffer()],PROGRAM)[0].toBase58());
  const response = await fetch(rpc!, {
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',
      params:[pdas,{encoding:'base64',commitment:'finalized'}]}),
    signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('RPC HTTP '+response.status);
  const payload:any = await response.json();
  if (payload.error || !Array.isArray(payload.result?.value) ||
      payload.result.value.length !== selected.length) throw new Error('Invalid RPC response');
  for (let i=0;i<selected.length;i++) {
    const account = payload.result.value[i];
    let status = 'UNKNOWN';
    let realSolReserves: number|null = null;
    if (account && account.owner === PROGRAM.toBase58() &&
        Array.isArray(account.data) && account.data[1] === 'base64') {
      const data = Buffer.from(account.data[0],'base64');
      if (data.length >= 81 && data.subarray(0,8).equals(DISC)) {
        status = data[48] === 1 ? 'BONDING_CURVE_COMPLETE' :
          data[48] === 0 ? 'BONDING_CURVE_ACTIVE' : 'UNKNOWN';
        realSolReserves = Number(data.readBigUInt64LE(32)) / 1e9;
      }
    }
    console.log(JSON.stringify({mint:selected[i].mint,bondingCurvePda:pdas[i],
      status,realSolReserves,usdLiquidityVerified:false,pumpSwapPoolVerified:false,
      automatedTradingEligible:false}));
  }
  console.log(JSON.stringify({mode:'READ_ONLY',checked:selected.length,rpcRequests:1}));
}
void main().catch(e=>{console.error('Curve check failed:',e instanceof Error?e.message:String(e));process.exitCode=1;});
