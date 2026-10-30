/** Bounded read-only mint preflight for up to two shortlisted tokens.
 * 4 RPC requests maximum. Preliminary evidence only; never approves trades.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspectMintSafety} from './paper-mint-safety';
type Row={mint:string;origin:string;liquidityUsd:number|null;volume24hUsd:number|null;buys24h:number|null;sells24h:number|null;pairAddress:string|null};
const url=process.env.CLODDS_RESEARCH_RPC_URL;
if(!url||!url.startsWith('https://'))throw new Error('HTTPS research RPC required');
const latest=new Map<string,Row>();
for(const line of readFileSync(resolve('.paper-sessions/pump-market-screen.jsonl'),'utf8').split('\n')){
 if(!line.trim())continue;
 try{const r=JSON.parse(line) as Row;if(typeof r.mint==='string')latest.set(r.mint,r);}catch{/* skip */}
}
const selected=[...latest.values()].filter(r=>r.origin==='VERIFIED_PUMP_FUN'&&
 /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.mint)&&r.liquidityUsd===null&&
 !!r.pairAddress&&(r.volume24hUsd??0)>=5000&&
 (r.buys24h??0)+(r.sells24h??0)>=100&&(r.sells24h??0)>0).slice(0,2);
async function main():Promise<void>{
 for(const token of selected){
  const check=await inspectMintSafety(token.mint,url!);
  console.log(JSON.stringify({...check,source:'BOUNDED_READ_ONLY_PREFLIGHT',
   token2022ExtensionsVerified:false,usdLiquidityVerified:false,
   automatedTradingEligible:false}));
 }
 console.log(JSON.stringify({mode:'RESEARCH_ONLY',checked:selected.length,
  maxQuickNodeRpcRequests:selected.length*2,approvedForTrading:0}));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
