/** Read-only advisory Rugcheck report collector; never approves trading. */
import {readFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const input=resolve('.paper-sessions/pump-market-screen.jsonl');
const output=resolve('.paper-sessions/pump-rugcheck-review.jsonl');
type Row={mint:string;origin:string;liquidityUsd:number|null;volume24hUsd:number|null;buys24h:number|null;sells24h:number|null;pairAddress:string|null};
const rows:Row[]=[];
for(const line of readFileSync(input,'utf8').split('\n')){
  if(!line.trim())continue;
  try{rows.push(JSON.parse(line) as Row);}catch{/* ignore */}
}
const candidates=rows.filter(r=>r.origin==='VERIFIED_PUMP_FUN'&&
  /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.mint)&&r.liquidityUsd===null&&
  !!r.pairAddress&&(r.volume24hUsd??0)>=5000&&
  (r.buys24h??0)+(r.sells24h??0)>=100&&(r.sells24h??0)>0).slice(0,2);
mkdirSync(dirname(output),{recursive:true});
async function main():Promise<void>{
  for(const token of candidates){
    let providerStatus='UNAVAILABLE';
    let score:number|null=null;
    let risks:unknown[]|null=null;
    let mintMatches=false;
    try{
      const response=await fetch('https://api.rugcheck.xyz/v1/tokens/'+token.mint+'/report/summary',{
        headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const payload:unknown=await response.json();
      if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Invalid response');
      const data=payload as Record<string,unknown>;
      providerStatus='RECEIVED';
      mintMatches=data.mint===token.mint;
      score=typeof data.score==='number'&&Number.isFinite(data.score)?data.score:null;
      risks=Array.isArray(data.risks)?data.risks:null;
    }catch(e){console.error('Rugcheck unavailable for',token.mint,e instanceof Error?e.message:String(e));}
    const highRisk=risks?.some(r=>r!==null&&typeof r==='object'&&
      ['critical','high','danger'].includes(String((r as Record<string,unknown>).level??'').toLowerCase()))??false;
    const result={mint:token.mint,checkedAt:new Date().toISOString(),providerStatus,
      mintMatches,score,riskCount:risks?.length??null,highRisk,
      status:highRisk?'BLOCK':'MANUAL_REVIEW_REQUIRED',
      independentSafetyVerified:false,liquidityVerified:false,
      automatedTradingEligible:false};
    appendFileSync(output,JSON.stringify(result)+'\n');
    console.log(JSON.stringify(result));
    await new Promise(r=>setTimeout(r,1200));
  }
  console.log(JSON.stringify({mode:'RESEARCH_ONLY',checked:candidates.length,
    quickNodeRpcRequests:0,approvedForTrading:0,output}));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
