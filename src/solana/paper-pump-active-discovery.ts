/** Read-only discovery of recent, actively traded verified Pump.fun creations.
 * DexScreener observations are advisory, never transaction authorization.
 */
import {readFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const SOURCE=resolve('.paper-sessions/pump-verified-creations.jsonl');
const OUTPUT=resolve('.paper-sessions/pump-active-candidates.jsonl');
const PROGRAM='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const MINT=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_AGE_MS=30*60*1000;
const MAX_CANDIDATES=30;
const metric=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;

export function evaluateActivePair(pair:unknown,now:number){
 const p=pair&&typeof pair==='object'?pair as Record<string,any>:null;
 const buys=metric(p?.txns?.m5?.buys);
 const sells=metric(p?.txns?.m5?.sells);
 const volume=metric(p?.volume?.m5);
 const liquidity=metric(p?.liquidity?.usd);
 const created=metric(p?.pairCreatedAt);
 const reasons:string[]=[];
 if(p?.chainId!=='solana')reasons.push('NOT_SOLANA_PAIR');
 if(!created||created>now||now-created>MAX_AGE_MS)reasons.push('PAIR_NOT_RECENT');
 if(buys===null||sells===null||buys<5||sells<2)reasons.push('INSUFFICIENT_TWO_SIDED_TRADES');
 if(volume===null||volume<1000)reasons.push('INSUFFICIENT_FIVE_MINUTE_VOLUME');
 if(liquidity===null||liquidity<1000)reasons.push('INSUFFICIENT_LIQUIDITY');
 return {active:reasons.length===0,reasons,buys5m:buys,sells5m:sells,
  volume5mUsd:volume,liquidityUsd:liquidity,pairAgeMs:created===null?null:now-created};
}

function loadRecentVerified(now:number){
 const latest=new Map<string,{mint:string;signature:string;checkedAt:string}>();
 for(const line of readFileSync(SOURCE,'utf8').split('\n')){
  if(!line.trim())continue;
  try{
   const r=JSON.parse(line);
   if(typeof r.mint!=='string'||!MINT.test(r.mint))continue;
   if(r.status!=='VERIFIED_PUMP_FUN'||r.programId!==PROGRAM||
    typeof r.signature!=='string'||r.signature.length===0||
    typeof r.checkedAt!=='string')continue;
   const age=now-Date.parse(r.checkedAt);
   if(!Number.isFinite(age)||age<0||age>MAX_AGE_MS)continue;
   latest.set(r.mint,{mint:r.mint,signature:r.signature,checkedAt:r.checkedAt});
  }catch{/* malformed records never qualify */}
 }
 return [...latest.values()].slice(-MAX_CANDIDATES);
}

async function main(){
 const now=Date.now();
 const candidates=loadRecentVerified(now);
 if(!candidates.length){
  console.log(JSON.stringify({mode:'READ_ONLY',screened:0,reason:'NO_RECENT_VERIFIED_CREATIONS',approvedForTrading:0}));
  return;
 }
 mkdirSync(dirname(OUTPUT),{recursive:true});
 let screened=0,active=0,requests=0;
 for(let offset=0;offset<candidates.length;offset+=10){
  const batch=candidates.slice(offset,offset+10);
  requests++;
  const url='https://api.dexscreener.com/tokens/v1/solana/'+batch.map(r=>r.mint).join(',');
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('DEXSCREENER_HTTP_'+response.status);
  const result:unknown=await response.json();
  if(!Array.isArray(result))throw Error('DEXSCREENER_INVALID_RESPONSE');
  for(const candidate of batch){
   const pairs=result.filter((p:any)=>p?.chainId==='solana'&&p?.baseToken?.address===candidate.mint);
   const evaluations=pairs.map(p=>({pair:p,evidence:evaluateActivePair(p,Date.now())}));
   const best=evaluations.sort((x,y)=>Number(y.evidence.active)-Number(x.evidence.active)||
    (y.evidence.volume5mUsd??0)-(x.evidence.volume5mUsd??0))[0];
   const evidence=best?.evidence??{active:false,reasons:['NO_INDEXED_PAIR'],
    buys5m:null,sells5m:null,volume5mUsd:null,liquidityUsd:null,pairAgeMs:null};
   const record={mint:candidate.mint,creationSignature:candidate.signature,
    creationVerifiedAt:candidate.checkedAt,checkedAt:new Date().toISOString(),
    source:'DEXSCREENER_ADVISORY',pairAddress:best?.pair?.pairAddress??null,
    ...evidence,stage:evidence.active?'ACTIVE_FOR_FURTHER_RESEARCH':'ACTIVITY_NOT_VERIFIED',
    onchainTradeEvidenceVerified:false,curveCustodyVerified:false,
    paperEntryEligible:false,automatedTradingEligible:false};
   appendFileSync(OUTPUT,JSON.stringify(record)+'\n');
   console.log(JSON.stringify(record));
   screened++;if(evidence.active)active++;
  }
 }
 console.log(JSON.stringify({mode:'READ_ONLY',screened,active,requests,approvedForTrading:0,output:OUTPUT}));
}
if(process.argv[1]?.endsWith('paper-pump-active-discovery.ts')){
 void main().catch(error=>{console.error(error);process.exitCode=1;});
}
