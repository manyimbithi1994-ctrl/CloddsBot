/** Read-only durable watchlist snapshot derived from append-only research journals.
 * Admission is evidence-only; it never authorizes paper or real trades.
 */
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export const WATCH_LIMIT=100, PREQUAL_LIMIT=200;
const SIX_HOURS=21600000;
type Row=Record<string,unknown>;
const load=(file:string):Row[]=>{try{return readFileSync(resolve('.paper-sessions',file),'utf8').split('\n').flatMap(line=>{try{const r:unknown=JSON.parse(line);return r&&typeof r==='object'&&!Array.isArray(r)?[r as Row]:[];}catch{return [];}});}catch{return [];}};
const latest=(rows:Row[])=>new Map(rows.filter(r=>typeof r.mint==='string').map(r=>[r.mint as string,r]));
export function classifyWatchCandidate(verified:Row,rug:Row|undefined,market:Row|undefined,now:number){
 const created=typeof verified.createdAt==='string'?Date.parse(verified.createdAt):NaN;
 const age=now-created;
 if(verified.status!=='VERIFIED_PUMP_FUN'||verified.programId!=='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'||
  !Number.isFinite(age)||age<0||age>SIX_HOURS)return {tier:'EXPIRED_OR_UNVERIFIED',reason:'INVALID_OR_EXPIRED_CREATION'};
 if(rug?.rugcheckStageStatus==='REJECT_RISK')return {tier:'REJECTED',reason:'CONFIRMED_RUGCHECK_RISK'};
 const rugTime=typeof rug?.checkedAt==='string'?Date.parse(rug.checkedAt):NaN;
 const rugPass=rug?.status==='RUGCHECK_RESEARCH_PASS'&&rug.rugcheckStageStatus==='REVIEW_FOR_DEXSCREENER'&&
  Array.isArray(rug.reasons)&&rug.reasons.length===0&&
  Array.isArray(rug.rugcheckStageReasons)&&rug.rugcheckStageReasons.length===0&&
  Number.isFinite(rugTime)&&now-rugTime>=0&&now-rugTime<=300000;
 if(!rugPass)return {tier:'PREQUALIFICATION',reason:'RUGCHECK_MISSING_INCOMPLETE_OR_STALE'};
 const marketTime=typeof market?.checkedAt==='string'?Date.parse(market.checkedAt):NaN;
 const fresh=Number.isFinite(marketTime)&&now-marketTime>=0&&now-marketTime<=10*60000;
 if(age<15*60000)return {tier:'PREQUALIFICATION',reason:'AWAITING_MINIMUM_AGE'};
 if(!fresh)return {tier:'PREQUALIFICATION',reason:'AWAITING_FRESH_MARKET_EVIDENCE'};
 if(market?.active===true&&market?.source==='DEXSCREENER_ADVISORY'&&
  typeof market.pairAddress==='string'&&market.pairAddress.length>0&&
  typeof market.liquidityUsd==='number'&&market.liquidityUsd>=10000&&
  typeof market.buys5m==='number'&&market.buys5m>=5&&
  typeof market.sells5m==='number'&&market.sells5m>=2&&
  typeof market.volume5mUsd==='number'&&market.volume5mUsd>=1000)
  return {tier:'ACTIVE_WATCHLIST',reason:'ADVISORY_MARKET_THRESHOLDS_MET'};
 return {tier:'PREQUALIFICATION',reason:'MARKET_THRESHOLDS_NOT_MET'};
}
export function buildWatchlist(verified:Row[],rug:Row[],market:Row[],now:number){
 const rv=latest(rug),mv=latest(market);
 const results=[...latest(verified).values()].map(v=>({mint:v.mint,createdAt:v.createdAt,
  ...classifyWatchCandidate(v,rv.get(v.mint as string),mv.get(v.mint as string),now),
  paperEntryEligible:false,automatedTradingEligible:false}));
 const byAge=(a:typeof results[number],b:typeof results[number])=>
  Date.parse(b.createdAt as string)-Date.parse(a.createdAt as string);
 return {active:results.filter(r=>r.tier==='ACTIVE_WATCHLIST').sort(byAge).slice(0,WATCH_LIMIT),
  prequalification:results.filter(r=>r.tier==='PREQUALIFICATION').sort(byAge).slice(0,PREQUAL_LIMIT),
  rejected:results.filter(r=>r.tier==='REJECTED').length,
  expired:results.filter(r=>r.tier==='EXPIRED_OR_UNVERIFIED').length};
}
function main(){
 const snapshot=buildWatchlist(load('pump-verified-creations.jsonl'),load('pump-rugcheck-full-review.jsonl'),
  load('pump-active-candidates.jsonl'),Date.now());
 const target=resolve('.paper-sessions/pump-watchlist.json');
 mkdirSync(dirname(target),{recursive:true});
 const temp=target+'.tmp-'+process.pid;
 writeFileSync(temp,JSON.stringify({checkedAt:new Date().toISOString(),mode:'READ_ONLY',...snapshot},null,2));
 renameSync(temp,target);
 console.log(JSON.stringify({mode:'READ_ONLY_WATCHLIST',active:snapshot.active.length,
  prequalification:snapshot.prequalification.length,rejected:snapshot.rejected,expired:snapshot.expired,
  approvedForTrading:0,output:target}));
}
if(process.argv[1]?.endsWith('paper-pump-watchlist.ts'))main();
