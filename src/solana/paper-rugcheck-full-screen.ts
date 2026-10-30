/** Bounded, read-only Rugcheck full-report screening. Never authorizes trading.
 * Run after candidate discovery; no QuickNode requests are made here.
 */
import {readFileSync,existsSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const input=resolve('.paper-sessions/pump-market-screen.jsonl');
const output=resolve('.paper-sessions/pump-rugcheck-full-review.jsonl');
const MAX_CANDIDATES=10;
const MAX_ATTEMPTS=3;
const mintPattern=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
type RecordValue=Record<string,unknown>;
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function object(v:unknown):v is RecordValue{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function riskSeverity(r:unknown):string{
 if(!object(r))return 'UNKNOWN';
 return String(r.level??r.severity??'UNKNOWN').toLowerCase();
}
async function fetchReport(mint:string):Promise<{data:RecordValue|null;attempts:number;error:string|null}>{
 let error:string|null=null;
 for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
  try{
   const response=await fetch('https://api.rugcheck.xyz/v1/tokens/'+mint+'/report',{
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
   if(response.ok){
    const data:unknown=await response.json();
    if(!object(data))return {data:null,attempts:attempt,error:'INVALID_REPORT_SHAPE'};
    return {data,attempts:attempt,error:null};
   }
   error='HTTP_'+response.status;
   if(![408,425,429,500,502,503,504].includes(response.status))
    return {data:null,attempts:attempt,error};
   const retryAfter=response.headers.get('retry-after');
   const seconds=retryAfter&&/^\d+$/.test(retryAfter)?Number(retryAfter):null;
   if(attempt<MAX_ATTEMPTS)await wait(seconds===null?500*2**(attempt-1):Math.min(10000,seconds*1000));
  }catch(e){
   error=e instanceof Error?e.name:'NETWORK_ERROR';
   if(attempt<MAX_ATTEMPTS)await wait(500*2**(attempt-1));
  }
 }
 return {data:null,attempts:MAX_ATTEMPTS,error};
}
async function main():Promise<void>{
 if(!existsSync(input))throw Error('Missing market-screen candidates: run discovery first');
 const latest=new Map<string,RecordValue>();
 for(const line of readFileSync(input,'utf8').split('\n')){
  if(!line.trim())continue;
  try{
   const item:unknown=JSON.parse(line);
   if(object(item)&&typeof item.mint==='string'&&mintPattern.test(item.mint))latest.set(item.mint,item);
  }catch{/* malformed candidate cannot become eligible */}
 }
 const candidates=[...latest.values()].filter(r=>r.origin==='VERIFIED_PUMP_FUN').slice(0,MAX_CANDIDATES);
 mkdirSync(dirname(output),{recursive:true});
 for(const candidate of candidates){
  const mint=candidate.mint as string;
  const {data,attempts,error}=await fetchReport(mint);
  const reasons:string[]=[];
  if(error)reasons.push('RUGCHECK_'+error);
  // The response must identify the mint explicitly; URL identity alone is insufficient.
  if(!data||data.mint!==mint)reasons.push('RUGCHECK_MINT_NOT_VERIFIED');
  const risks=data?.risks;
  if(!Array.isArray(risks))reasons.push('RUGCHECK_RISKS_MISSING');
  const riskLevels=Array.isArray(risks)?risks.map(riskSeverity):[];
  if(riskLevels.some(s=>['critical','high','danger'].includes(s)))reasons.push('HIGH_SEVERITY_RISK');
  if(riskLevels.some(s=>s==='unknown'))reasons.push('UNKNOWN_RISK_SEVERITY');
  if(!data||!object(data.token))reasons.push('TOKEN_DETAILS_MISSING');
  if(!data||!Array.isArray(data.topHolders))reasons.push('TOP_HOLDERS_MISSING');
  if(!data||!Array.isArray(data.markets))reasons.push('MARKET_DETAILS_MISSING');
  // Even a complete Rugcheck report cannot substitute for DexScreener and RPC.
  const result={mint,checkedAt:new Date().toISOString(),attempts,
   status:reasons.length?'REJECT_UNVERIFIED_OR_RISK':'RUGCHECK_RESEARCH_PASS',
   reasons,riskCount:riskLevels.length,riskLevels,
   topHoldersCount:Array.isArray(data?.topHolders)?data.topHolders.length:null,
   marketCount:Array.isArray(data?.markets)?data.markets.length:null,
   dexscreenerVerified:false,quickNodeVerified:false,
   paperEntryEligible:false,automatedTradingEligible:false};
  appendFileSync(output,JSON.stringify(result)+'\n');
  console.log(JSON.stringify(result));
  await wait(300);
 }
 console.log(JSON.stringify({mode:'READ_ONLY',screened:candidates.length,
  maxAttemptsPerCandidate:MAX_ATTEMPTS,quickNodeRpcRequests:0,approvedForTrading:0,output}));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
