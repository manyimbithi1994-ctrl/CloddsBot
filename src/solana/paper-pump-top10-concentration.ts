/** Read-only top-10 non-curve token-account concentration screen.
 * Conservative: incomplete top-20 coverage fails closed; fewer than ten
 * accounts are acceptable only when the returned list is complete.
 */
import {PublicKey} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {evaluateConcentrationPolicy} from './paper-concentration-policy';
import {parseMintAccountEvidence} from './paper-quicknode-mint-evidence';
import {assessQuickNodeEvidence} from './paper-quicknode-evidence';
const rpcUrl=process.env.CLODDS_RESEARCH_RPC_URL;
if(!rpcUrl||!rpcUrl.startsWith('https://'))throw Error('HTTPS research RPC required');
const mintPattern=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function loadCandidates():string[]{
 const verified=new Map<string,string>();
 for(const line of readFileSync('.paper-sessions/pump-verified-creations.jsonl','utf8').split('\n')){
  if(!line.trim())continue;
  try{
   const r=JSON.parse(line);
   if(typeof r.mint==='string') {
    if(r.status==='VERIFIED_PUMP_FUN'&&
       r.programId==='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'&&
       mintPattern.test(r.mint)&&typeof r.signature==='string'&&r.signature.length>0)
      verified.set(r.mint,r.signature);
    else verified.delete(r.mint);
   }
  }catch{/* malformed creation never qualifies */}
 }
 const latest=new Map<string,any>();
 for(const line of readFileSync('.paper-sessions/pump-rugcheck-full-review.jsonl','utf8').split('\n')){
  if(!line.trim())continue;
  try{const r=JSON.parse(line);
   if(typeof r.mint==='string')latest.set(r.mint,r);
  }catch{/* malformed review never qualifies */}
 }
 const now=Date.now();
 return [...latest].filter(([mint,r])=>verified.has(mint)&&
  r.rugcheckStageStatus==='REVIEW_FOR_DEXSCREENER'&&
  Array.isArray(r.rugcheckStageReasons)&&r.rugcheckStageReasons.length===0&&
  typeof r.checkedAt==='string'&&Number.isFinite(Date.parse(r.checkedAt))&&
  now>=Date.parse(r.checkedAt)&&now-Date.parse(r.checkedAt)<=300000)
  .slice(0,10).map(([mint])=>mint);
}
const mints=loadCandidates();
const curveDiscriminator=createHash('sha256').update('account:BondingCurve').digest().subarray(0,8);
function inspectCurveState(encoded:unknown):{realTokenReservesRaw:string;virtualTokenReservesRaw:string;realSolReservesRaw:string;virtualSolReservesRaw:string;tokenTotalSupplyRaw:string;complete:boolean}{
 if(!Array.isArray(encoded)||typeof encoded[0]!=='string'||encoded[1]!=='base64')
  throw Error('CURVE_STATE_ENCODING_UNVERIFIED');
 const bytes=Buffer.from(encoded[0],'base64');
 if(bytes.length<49||!bytes.subarray(0,8).equals(curveDiscriminator))
  throw Error('CURVE_STATE_DISCRIMINATOR_OR_LENGTH_INVALID');
 return {virtualTokenReservesRaw:bytes.readBigUInt64LE(8).toString(),
  virtualSolReservesRaw:bytes.readBigUInt64LE(16).toString(),
  realTokenReservesRaw:bytes.readBigUInt64LE(24).toString(),
  realSolReservesRaw:bytes.readBigUInt64LE(32).toString(),
  tokenTotalSupplyRaw:bytes.readBigUInt64LE(40).toString(),
  complete:bytes[48]===1};
}

const pump=new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const tokenProgram=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const token2022Program=new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const associatedProgram=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
let rpcRequests=0;
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
let lastRpcAt=0;
async function rpc(method:string,params:unknown[]):Promise<any>{
 for(let attempt=1;attempt<=3;attempt++){
  const pause=Math.max(0,350-(Date.now()-lastRpcAt));
  if(pause)await wait(pause);
  lastRpcAt=Date.now();
  rpcRequests++;
  try{
   const response=await fetch(rpcUrl!,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:rpcRequests,method,params}),signal:AbortSignal.timeout(8000)});
   if(response.status===429||[502,503,504].includes(response.status)){
    if(attempt===3)throw Error('RPC_RETRY_EXHAUSTED_HTTP_'+response.status);
    const header=response.headers.get('retry-after');
    const seconds=header&&/^\d+$/.test(header)?Number(header):null;
    await wait(seconds===null?1000*2**(attempt-1):Math.min(10000,seconds*1000));
    continue;
   }
   if(!response.ok)throw Error('RPC HTTP '+response.status);
   const data:any=await response.json();
   if(data.error||!data.result)throw Error('Invalid RPC response');
   return data.result;
  }catch(e){
   if(attempt===3)throw e;
   if(e instanceof Error&&e.message.startsWith('RPC_RETRY_EXHAUSTED_'))throw e;
   // Network timeouts are transient; malformed responses and permanent HTTP errors are not.
   if(e instanceof Error&&(/^(RPC HTTP |Invalid RPC response)/.test(e.message)))throw e;
   await wait(1000*2**(attempt-1));
  }
 }
 throw Error('RPC_RETRY_EXHAUSTED');
}

async function main():Promise<void>{
 if(!mints.length){console.log(JSON.stringify({mode:'READ_ONLY',screened:0,rpcRequests:0,reason:'NO_FRESH_VERIFIED_RUGCHECK_CANDIDATES',approvedForTrading:0}));return;}
 for(const mint of mints){
  const curve=PublicKey.findProgramAddressSync(
   [Buffer.from('bonding-curve'),new PublicKey(mint).toBuffer()],pump)[0].toBase58();
  let status='UNKNOWN',reason='INCOMPLETE_DATA',percent:number|null=null;
  let counted=0,curveAccounts=0;
  let outsideCurvePercent:number|null=null,curveSharePercent:number|null=null;
  let observedCurveBalanceRaw:string|null=null,mintSupplyRaw:string|null=null;
  let largestAccountsReturned=0;
  let curveAccountProgramOwned=false,canonicalCurveAtaObserved=false;
  let canonicalCurveAtaExists=false,canonicalCurveAtaBalanceRaw:string|null=null;
  let curveOwnedTokenAccounts:Array<{address:string;amountRaw:string}>=[];
  let curveCustodyEvidence='NOT_CHECKED';
  let bondingCurveState:ReturnType<typeof inspectCurveState>|null=null;
  let reserveReconciliation='NOT_CHECKED';
  let reserveVaultExcessRaw:string|null=null;
  let outsideCurveStatus='UNKNOWN';
  let mintAuthority:string|null|undefined=undefined;
  let freezeAuthority:string|null|undefined=undefined;
  let mintEvidenceReasons:string[]=['MINT_ACCOUNT_NOT_FETCHED'];
  let mintAccountResponse:unknown=null;
  let checkedAt=new Date().toISOString();
  try{
   const mintAccount=await rpc('getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'finalized'}]);
   const largest=await rpc('getTokenLargestAccounts',[mint,{commitment:'finalized'}]);
   const mintTokenProgram=mintAccount.value?.owner;
   if(mintTokenProgram!==tokenProgram.toBase58()&&mintTokenProgram!==token2022Program.toBase58())
    throw Error('UNSUPPORTED_MINT_TOKEN_PROGRAM');
   mintAccountResponse=mintAccount;
   checkedAt=new Date().toISOString();
   const curveAccount=await rpc('getAccountInfo',[curve,{encoding:'base64',commitment:'finalized'}]);
   curveAccountProgramOwned=curveAccount.value?.owner===pump.toBase58()&&
    curveAccount.value?.executable===false&&
    Array.isArray(curveAccount.value?.data)&&
    typeof curveAccount.value.data[0]==='string'&&curveAccount.value.data[0].length>0;
   if(curveAccountProgramOwned)bondingCurveState=inspectCurveState(curveAccount.value.data);
   const canonicalCurveAta=PublicKey.findProgramAddressSync([
    new PublicKey(curve).toBuffer(),
    new PublicKey(mintTokenProgram).toBuffer(),new PublicKey(mint).toBuffer()
   ],associatedProgram)[0].toBase58();
   curveCustodyEvidence=curveAccountProgramOwned?'CURVE_PDA_PROGRAM_OWNER_CONFIRMED':'CURVE_PDA_NOT_PROGRAM_OWNED';
   const canonicalAccount=await rpc('getAccountInfo',[canonicalCurveAta,{encoding:'jsonParsed',commitment:'finalized'}]);
   const canonicalInfo=canonicalAccount.value?.data?.parsed?.info;
   canonicalCurveAtaExists=canonicalAccount.value!==null;
   if(canonicalCurveAtaExists&&canonicalAccount.value?.owner===mintTokenProgram&&
      canonicalInfo?.mint===mint&&canonicalInfo?.owner===curve&&
      typeof canonicalInfo?.tokenAmount?.amount==='string'&&
      /^\d+$/.test(canonicalInfo.tokenAmount.amount))
    canonicalCurveAtaBalanceRaw=canonicalInfo.tokenAmount.amount;
   const owned=await rpc('getTokenAccountsByOwner',[curve,{mint},{encoding:'jsonParsed',commitment:'finalized'}]);
   if(!Array.isArray(owned.value))throw Error('CURVE_OWNED_ACCOUNTS_UNVERIFIED');
   for(const entry of owned.value){
    const info=entry?.account?.data?.parsed?.info;
    const amount=info?.tokenAmount?.amount;
    if(entry?.account?.owner!==mintTokenProgram||info?.mint!==mint||
       info?.owner!==curve||typeof amount!=='string'||!/^\d+$/.test(amount)||
       typeof entry.pubkey!=='string')throw Error('INVALID_CURVE_OWNED_TOKEN_ACCOUNT');
    curveOwnedTokenAccounts.push({address:entry.pubkey,amountRaw:amount});
   }
   const mintEvidence=parseMintAccountEvidence(mint,mintAccount);
   mintAuthority=mintEvidence.mintAuthority;
   freezeAuthority=mintEvidence.freezeAuthority;
   mintEvidenceReasons=mintEvidence.reasons;
   if(mintEvidence.reasons.length)throw Error('MINT_ACCOUNT_UNVERIFIED');
   const supplyRaw=mintAccount.value?.data?.parsed?.info?.supply;
   if(typeof supplyRaw!=='string'||!/^\d+$/.test(supplyRaw)||BigInt(supplyRaw)===0n)
    throw Error('INVALID_MINT_SUPPLY');
   if(!Array.isArray(largest.value))throw Error('MISSING_LARGEST_ACCOUNTS');
   largestAccountsReturned=largest.value.length;
   mintSupplyRaw=supplyRaw;
   const accounts=largest.value.slice(0,20);
   // Bound response sizes to avoid HTTP 413 from large jsonParsed batches.
   // Fail closed if any chunk cannot be inspected; no unbounded retries.
   const details:any[]=[];
   for(let start=0;start<accounts.length;start+=4){
    const chunk=accounts.slice(start,start+4);
    const response=await rpc('getMultipleAccounts',[
     chunk.map((a:any)=>a.address),{encoding:'jsonParsed',commitment:'finalized'}]);
    if(!Array.isArray(response.value)||response.value.length!==chunk.length)
     throw Error('INCOMPLETE_ACCOUNT_DETAILS');
    details.push(...response.value);
   }
   const eligible:Array<{address:string;amount:bigint}>=[];
   let observedCurveBalance=0n;
   for(let i=0;i<accounts.length;i++){
    const info=details[i]?.data?.parsed?.info;
    const owner=info?.owner;
    const raw=accounts[i]?.amount;
    const parsedAmount=info?.tokenAmount?.amount;
    const parsedMint=info?.mint;
    const accountProgram=details[i]?.owner;
    if(typeof owner!=='string'||typeof raw!=='string'||!/^\d+$/.test(raw))
     throw Error('UNPARSEABLE_TOKEN_ACCOUNT');
    if(parsedMint!==mint||parsedAmount!==raw)
     throw Error('TOKEN_ACCOUNT_MINT_OR_BALANCE_MISMATCH');
    if(accountProgram!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'&&
       accountProgram!=='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
     throw Error('UNEXPECTED_TOKEN_ACCOUNT_PROGRAM');
    if(owner===curve){
     if(accounts[i].address===canonicalCurveAta&&accountProgram===mintTokenProgram)
      canonicalCurveAtaObserved=true;
     // Custody is not excluded unless the account is demonstrably controlled
     // by the expected bonding-curve PDA for this exact mint.
     curveAccounts++;observedCurveBalance+=BigInt(raw);continue;
    }
    eligible.push({address:accounts[i].address,amount:BigInt(raw)});
   }
   observedCurveBalanceRaw=observedCurveBalance.toString();
   if(bondingCurveState){
    const real=BigInt(bondingCurveState.realTokenReservesRaw);
    const vault=curveOwnedTokenAccounts.reduce((sum,account)=>sum+BigInt(account.amountRaw),0n);
    reserveVaultExcessRaw=(vault-real).toString();
    reserveReconciliation=vault===real?'REAL_RESERVES_EQUAL_VAULT':
     vault>real?'VAULT_EXCEEDS_REPORTED_REAL_RESERVES_UNEXPLAINED':
     'REPORTED_REAL_RESERVES_EXCEED_VAULT_UNEXPLAINED';
   }
   curveCustodyEvidence=curveAccountProgramOwned&&curveOwnedTokenAccounts.length>0?
    'CURVE_PDA_AND_OWNED_TOKEN_ACCOUNTS_OBSERVED':
    'CURVE_CUSTODY_IDENTITY_INCOMPLETE';
   counted=Math.min(eligible.length,10);
   // The RPC returns at most 20 largest accounts. If fewer than 20 are
   // returned, the available set is complete; top-ten means up to ten.
   if(eligible.length<10&&accounts.length===20)
    throw Error('TOP_TEN_NON_CURVE_ACCOUNTS_NOT_COVERED');
   const total=eligible.slice(0,10).reduce((s,a)=>s+a.amount,0n);
   const supply=BigInt(supplyRaw);
   percent=Number(total*10000n/supply)/100;
   if(observedCurveBalance>0n&&observedCurveBalance<supply){
    const outsideSupply=supply-observedCurveBalance;
    outsideCurvePercent=Number(total*10000n/outsideSupply)/100;
    curveSharePercent=Number(observedCurveBalance*10000n/supply)/100;
    outsideCurveStatus=outsideCurvePercent>40?'HIGH_OUTSIDE_CURVE_CONCENTRATION_WARNING':'BELOW_OUTSIDE_CURVE_WARNING_THRESHOLD';
   }else if(observedCurveBalance===supply){outsideCurveStatus='ZERO_OBSERVED_OUTSIDE_CURVE_SUPPLY';
    throw Error('NO_OBSERVED_CIRCULATING_SUPPLY');}
   else if(observedCurveBalance>supply){outsideCurveStatus='INVALID_CURVE_BALANCE';
    throw Error('CURVE_BALANCE_EXCEEDS_MINT_SUPPLY');}
   else{outsideCurveStatus='CURVE_CUSTODY_NOT_OBSERVED';}
   status=percent>40?'HIGH_CONCENTRATION_RISK':'INCOMPLETE_VERIFICATION';
   reason=percent>40?'TOP_TEN_NON_CURVE_ACCOUNTS_OVER_40_PERCENT':
    'TOTAL_SUPPLY_METRIC_ONLY_OUTSIDE_CURVE_UNVERIFIED';
  }catch(e){status='UNKNOWN';reason=e instanceof Error?e.message:String(e);}
  const policyVerdict=evaluateConcentrationPolicy({
   topTenNonCurveSharePercent:percent,
   topTenShareOfObservedOutsideCurveSupplyPercent:outsideCurvePercent,
   excludedCurveAccounts:curveAccounts,nonCurveAccountsCounted:counted,
   distinctBeneficialOwnersVerified:false
  });
  const quickNodeVerdict=assessQuickNodeEvidence({mint,mintAccountResponse,checkedAt,
   nowMs:Date.now(),curveCustodyVerified:false,
   topTenNonCurveSharePercent:percent,topTenOutsideCurvePercent:outsideCurvePercent,
   excludedCurveAccounts:curveAccounts,nonCurveAccountsCounted:counted});
  console.log(JSON.stringify({mint,status,reason,policyVerdict,quickNodeVerdict,
   mintSupplyRaw,observedCurveBalanceRaw,largestAccountsReturned,
   curveAccountProgramOwned,canonicalCurveAtaObserved,canonicalCurveAtaExists,
   canonicalCurveAtaBalanceRaw,curveOwnedTokenAccounts,curveCustodyEvidence,
   bondingCurveState,reserveReconciliation,reserveVaultExcessRaw,
   topTenNonCurveSharePercent:percent,
   topTenShareOfObservedOutsideCurveSupplyPercent:outsideCurvePercent,
   observedCurveSharePercent:curveSharePercent,outsideCurveStatus,
   outsideCurveMetric:'ADVISORY_ONLY; curve custody not independently verified',
   nonCurveAccountsCounted:counted,excludedCurveAccounts:curveAccounts,
   denominator:'TOTAL_MINT_SUPPLY',thresholdPercent:40,
   mintAuthorityActive:mintAuthority!==null && mintAuthority!==undefined,
   freezeAuthorityActive:freezeAuthority!==null && freezeAuthority!==undefined,
   mintEvidenceReasons,distinctBeneficialOwnersVerified:false,token2022ExtensionsVerified:false,
   automatedTradingEligible:false}));
 }
 console.log(JSON.stringify({mode:'READ_ONLY',rpcRequests,approvedForTrading:0}));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
