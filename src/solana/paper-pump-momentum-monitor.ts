/** Bounded, read-only repeated DexScreener research. No orders, wallets or paper entries.
 * Run: node --import tsx src/solana/paper-pump-momentum-monitor.ts
 * Polls 3 times, 5 minutes apart; candidate journal must already exist.
 */
import {spawnSync} from 'node:child_process';
import {readFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const INPUT=resolve('.paper-sessions/pump-active-candidates.jsonl');
const OUTPUT=resolve('.paper-sessions/pump-momentum-observations.jsonl');
const INTERVAL_MS=5*60*1000;
const MAX_POLLS=3;
type Observation={mint:string;pairAddress:string;checkedAt:string;active:boolean;buys5m:number;sells5m:number;volume5mUsd:number;liquidityUsd:number;createdAt:string};
function readObservations():Observation[]{
 try{return readFileSync(INPUT,'utf8').split('\n').filter(Boolean).flatMap(line=>{
  try{const r=JSON.parse(line);
   if(typeof r.mint!=='string'||typeof r.pairAddress!=='string'||!Number.isFinite(Date.parse(r.checkedAt))||
      typeof r.buys5m!=='number'||typeof r.sells5m!=='number'||
      typeof r.volume5mUsd!=='number'||typeof r.liquidityUsd!=='number'||
      typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt)))return [];
   return [r as Observation];
  }catch{return [];}
 });}catch{return [];}
}
export function compareMomentum(previous:Observation|undefined,current:Observation){
 const elapsed=previous?Date.parse(current.checkedAt)-Date.parse(previous.checkedAt):null;
 const comparable=!!previous&&previous.pairAddress===current.pairAddress&&
  elapsed!==null&&elapsed>=INTERVAL_MS&&elapsed<=15*60*1000;
 const rising=comparable&&current.active&&previous!.active&&
  current.volume5mUsd>previous!.volume5mUsd&&
  current.buys5m>previous!.buys5m&&current.sells5m>=2&&
  current.liquidityUsd>=10000;
 return {momentumObserved:!!rising,comparable,
  reason:!comparable?'NEEDS_SEPARATED_FIVE_MINUTE_OBSERVATIONS':
   rising?'RISING_VOLUME_AND_BUYS_OBSERVED':'MOMENTUM_NOT_SUSTAINED',
  paperEntryEligible:false,automatedTradingEligible:false};
}
async function main(){
 mkdirSync(dirname(OUTPUT),{recursive:true});
 for(let poll=1;poll<=MAX_POLLS;poll++){
  const before=readObservations();
  const child=spawnSync(process.execPath,['--import','tsx','src/solana/paper-pump-active-discovery.ts'],
   {stdio:'inherit',timeout:60000});
  if(child.status!==0)throw Error('DISCOVERY_FAILED_'+String(child.status));
  const after=readObservations();
  const latest=new Map<string,Observation>();
  for(const r of after.slice(before.length))latest.set(r.mint,r);
  let evaluated=0,observed=0;
  for(const current of latest.values()){
   const previous=[...before].reverse().find(r=>r.mint===current.mint&&
    r.pairAddress===current.pairAddress&&Date.parse(current.checkedAt)>Date.parse(r.checkedAt)&&
    Date.parse(current.checkedAt)-Date.parse(r.checkedAt)>=INTERVAL_MS);
   const assessment=compareMomentum(previous,current);
   const record={poll,mint:current.mint,pairAddress:current.pairAddress,
    checkedAt:current.checkedAt,...assessment};
   appendFileSync(OUTPUT,JSON.stringify(record)+'\n');
   evaluated++;if(assessment.momentumObserved)observed++;
  }
  console.log(JSON.stringify({mode:'READ_ONLY_MOMENTUM_MONITOR',poll,evaluated,observed,
   approvedForTrading:0,output:OUTPUT}));
  if(poll<MAX_POLLS)await new Promise(r=>setTimeout(r,INTERVAL_MS));
 }
}
if(process.argv[1]?.endsWith('paper-pump-momentum-monitor.ts'))
 void main().catch(e=>{console.error(e);process.exitCode=1;});
