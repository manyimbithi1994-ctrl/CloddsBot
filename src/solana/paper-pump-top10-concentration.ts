/** Read-only top-10 non-curve token-account concentration screen.
 * Conservative: top ten non-curve accounts require paging beyond the RPC top 20
 * when necessary; never claim a pass if fewer than ten are available.
 */
import {PublicKey} from '@solana/web3.js';
const rpcUrl=process.env.CLODDS_RESEARCH_RPC_URL;
if(!rpcUrl||!rpcUrl.startsWith('https://'))throw Error('HTTPS research RPC required');
const mints=['3msFLe2RXjfC6wHkkGjvXFFjfMf7Fvmc42HeaEBmpump','Hq76LjXyS9eJeTXHqkMEjDAdMuzQ41K14Lx35yKQ5Y1b'];
const pump=new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
let rpcRequests=0;
async function rpc(method:string,params:unknown[]):Promise<any>{
 rpcRequests++;
 const response=await fetch(rpcUrl!,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:rpcRequests,method,params}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('RPC HTTP '+response.status);
 const data:any=await response.json();
 if(data.error||!data.result)throw Error('Invalid RPC response');
 return data.result;
}
async function main():Promise<void>{
 for(const mint of mints){
  const curve=PublicKey.findProgramAddressSync(
   [Buffer.from('bonding-curve'),new PublicKey(mint).toBuffer()],pump)[0].toBase58();
  let status='UNKNOWN',reason='INCOMPLETE_DATA',percent:number|null=null;
  let counted=0,curveAccounts=0;
  try{
   const [mintAccount,largest]=await Promise.all([
    rpc('getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'finalized'}]),
    rpc('getTokenLargestAccounts',[mint,{commitment:'finalized'}])
   ]);
   const supplyRaw=mintAccount.value?.data?.parsed?.info?.supply;
   if(typeof supplyRaw!=='string'||!/^\d+$/.test(supplyRaw)||BigInt(supplyRaw)===0n)
    throw Error('INVALID_MINT_SUPPLY');
   if(!Array.isArray(largest.value))throw Error('MISSING_LARGEST_ACCOUNTS');
   const accounts=largest.value.slice(0,20);
   // One batched read to identify token owners; avoid one request per account.
   const details=await rpc('getMultipleAccounts',[
    accounts.map((a:any)=>a.address),{encoding:'jsonParsed',commitment:'finalized'}]);
   if(!Array.isArray(details.value)||details.value.length!==accounts.length)
    throw Error('INCOMPLETE_ACCOUNT_DETAILS');
   const eligible:Array<{address:string;amount:bigint}>=[];
   for(let i=0;i<accounts.length;i++){
    const info=details.value[i]?.data?.parsed?.info;
    const owner=info?.owner;
    const raw=accounts[i]?.amount;
    if(typeof owner!=='string'||typeof raw!=='string'||!/^\d+$/.test(raw))
     throw Error('UNPARSEABLE_TOKEN_ACCOUNT');
    if(owner===curve){curveAccounts++;continue;}
    eligible.push({address:accounts[i].address,amount:BigInt(raw)});
   }
   counted=Math.min(eligible.length,10);
   if(eligible.length<10&&accounts.length===20)
    throw Error('TOP_TEN_NON_CURVE_ACCOUNTS_NOT_COVERED');
   const total=eligible.slice(0,10).reduce((s,a)=>s+a.amount,0n);
   const supply=BigInt(supplyRaw);
   percent=Number(total*10000n/supply)/100;
   status=percent>40?'HIGH_CONCENTRATION_RISK':'PASS_PRELIMINARY';
   reason=percent>40?'TOP_TEN_NON_CURVE_ACCOUNTS_OVER_40_PERCENT':
    'TOP_TEN_NON_CURVE_ACCOUNTS_AT_OR_BELOW_40_PERCENT';
  }catch(e){status='UNKNOWN';reason=e instanceof Error?e.message:String(e);}
  console.log(JSON.stringify({mint,status,reason,topTenNonCurveSharePercent:percent,
   nonCurveAccountsCounted:counted,excludedCurveAccounts:curveAccounts,
   denominator:'TOTAL_MINT_SUPPLY',thresholdPercent:40,
   distinctBeneficialOwnersVerified:false,token2022ExtensionsVerified:false,
   automatedTradingEligible:false}));
 }
 console.log(JSON.stringify({mode:'READ_ONLY',rpcRequests,approvedForTrading:0}));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
