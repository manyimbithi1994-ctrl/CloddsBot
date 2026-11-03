/** Bounded read-only Pump.fun research watch. No wallets, orders, or VPS changes.
 * Run: node --import tsx src/solana/paper-pump-periodic-watch.ts
 * Three cycles; each cycle collects new creations, verifies, Rugchecks first,
 * then polls DexScreener only for recent passing reviews.
 */
import {spawnSync} from 'node:child_process';
const steps=[
 ['paper-pump-event-collector.ts',[],150000],
 ['paper-pump-verify-captured.ts',['20'],90000],
 ['paper-rugcheck-full-screen.ts',[],90000],
 ['paper-pump-active-discovery.ts',[],60000]
] as const;
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function main():Promise<void>{
 for(let cycle=1;cycle<=3;cycle++){
  const start=Date.now();
  console.log(JSON.stringify({mode:'READ_ONLY_PERIODIC_WATCH',cycle,status:'STARTED'}));
  for(const [script,args,timeout] of steps){
   const result=spawnSync(process.execPath,['--import','tsx','src/solana/'+script,...args],
    {stdio:'inherit',timeout});
   if(result.status!==0)throw new Error(script+'_FAILED_'+String(result.status)+
    (result.error?'_'+result.error.message:''));
  }
  console.log(JSON.stringify({mode:'READ_ONLY_PERIODIC_WATCH',cycle,status:'COMPLETED',
   automatedTradingEligible:false}));
  if(cycle<3)await wait(Math.max(0,5*60*1000-(Date.now()-start)));
 }
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
