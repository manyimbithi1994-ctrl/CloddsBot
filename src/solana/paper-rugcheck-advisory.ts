/** Conservative read-only Rugcheck advisory; no wallet, RPC or trade operations. */
import {readFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
type Row={mint:string;origin:string;liquidityUsd:number|null;volume24hUsd:number|null;buys24h:number|null;sells24h:number|null;pairAddress:string|null};
type Risk={level?:unknown;name?:unknown;description?:unknown;value?:unknown};
const input=resolve('.paper-sessions/pump-market-screen.jsonl');
const output=resolve('.paper-sessions/pump-rugcheck-review.jsonl');
const latest=new Map<string,Row>();
for(const line of readFileSync(input,'utf8').split('\n')){
 if(!line.trim())continue;
 try{const r=JSON.parse(line) as Row;if(typeof r.mint==='string')latest.set(r.mint,r);}catch{/* skip */}
}
const candidates=[...latest.values()].filter(r=>r.origin==='VERIFIED_PUMP_FUN'&&
 /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.mint)&&r.liquidityUsd===null&&
 !!r.pairAddress&&(r.volume24hUsd??0)>=5000&&
 (r.buys24h??0)+(r.sells24h??0)>=100&&(r.sells24h??0)>0).slice(0,2);
mkdirSync(dirname(output),{recursive:true});
async function main():Promise<void>{
 for(const token of candidates){
  let providerStatus='UNAVAILABLE';
  let identityStatus='UNVERIFIED';
  let score:number|null=null,normalisedScore:number|null=null,lpLockedPct:number|null=null;
  let tokenProgram:string|null=null,tokenType:string|null=null;
  let risks:Risk[]|null=null;
  try{
   const response=await fetch('https://api.rugcheck.xyz/v1/tokens/'+token.mint+'/report/summary',{
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('HTTP '+response.status);
   const raw:unknown=await response.json();
   if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid response');
   const data=raw as Record<string,unknown>;
   providerStatus='RECEIVED';
   identityStatus=typeof data.mint==='string'?
     (data.mint===token.mint?'RESPONSE_MINT_MATCH':'RESPONSE_MINT_MISMATCH'):
     'URL_ONLY_NO_RESPONSE_MINT';
   score=typeof data.score==='number'&&Number.isFinite(data.score)?data.score:null;
   normalisedScore=typeof data.score_normalised==='number'&&Number.isFinite(data.score_normalised)?data.score_normalised:null;
   lpLockedPct=typeof data.lpLockedPct==='number'&&Number.isFinite(data.lpLockedPct)?data.lpLockedPct:null;
   tokenProgram=typeof data.tokenProgram==='string'?data.tokenProgram:null;
   tokenType=typeof data.tokenType==='string'?data.tokenType:null;
   risks=Array.isArray(data.risks)?data.risks.map(x=>
     x&&typeof x==='object'&&!Array.isArray(x)?x as Risk:{level:'UNKNOWN'}):null;
  }catch(e){console.error('Rugcheck unavailable for',token.mint,e instanceof Error?e.message:String(e));}
  const highRisk=risks?.some(r=>['critical','high','danger'].includes(String(r.level??'').toLowerCase()))??false;
  const riskDetails=risks?.map(r=>({level:String(r.level??'UNKNOWN').slice(0,40),
   name:String(r.name??'UNNAMED').slice(0,120),
   description:String(r.description??'').slice(0,300)}))??null;
  const reasons:string[]=[];
  if(providerStatus!=='RECEIVED')reasons.push('RUGCHECK_UNAVAILABLE');
  if(identityStatus==='RESPONSE_MINT_MISMATCH')reasons.push('RESPONSE_MINT_MISMATCH');
  if(identityStatus==='URL_ONLY_NO_RESPONSE_MINT')reasons.push('RESPONSE_DOES_NOT_IDENTIFY_MINT');
  if(score===null||risks===null)reasons.push('INCOMPLETE_RISK_REPORT');
  if(highRisk)reasons.push('HIGH_SEVERITY_RISK');
  reasons.push('INDEPENDENT_SAFETY_AND_LIQUIDITY_NOT_VERIFIED');
  const result={mint:token.mint,checkedAt:new Date().toISOString(),providerStatus,
   identityStatus,score,normalisedScore,lpLockedPct,tokenProgram,tokenType,
   riskCount:risks?.length??null,riskDetails,highRisk,reasons,
   status:highRisk||identityStatus==='RESPONSE_MINT_MISMATCH'?'BLOCK':'MANUAL_REVIEW_REQUIRED',
   independentSafetyVerified:false,liquidityVerified:false,automatedTradingEligible:false};
  appendFileSync(output,JSON.stringify(result)+'\n');
  console.log(JSON.stringify(result));
  await new Promise(r=>setTimeout(r,1200));
 }
 console.log(JSON.stringify({mode:'RESEARCH_ONLY',checked:candidates.length,
  quickNodeRpcRequests:0,approvedForTrading:0,output}));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
