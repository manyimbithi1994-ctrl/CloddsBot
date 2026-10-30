/** Read-only diagnostic: identify largest token account and its token owner.
 * Does not establish beneficial ownership, assess extensions, or approve trading.
 */
import {PublicKey} from '@solana/web3.js';
const rpcUrl=process.env.CLODDS_RESEARCH_RPC_URL;
if(!rpcUrl||!rpcUrl.startsWith('https://'))throw Error('HTTPS research RPC required');
const mints=['3msFLe2RXjfC6wHkkGjvXFFjfMf7Fvmc42HeaEBmpump','Hq76LjXyS9eJeTXHqkMEjDAdMuzQ41K14Lx35yKQ5Y1b'];
const pump=new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
let requests=0;
async function rpc(method:string,params:unknown[]):Promise<any>{
 requests++;
 const r=await fetch(rpcUrl!,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:requests,method,params}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('RPC HTTP '+r.status);
 const j:any=await r.json();
 if(j.error||!j.result)throw Error('Invalid RPC result');
 return j.result;
}
async function main():Promise<void>{
 for(const mint of mints){
  const largest=await rpc('getTokenLargestAccounts',[mint,{commitment:'finalized'}]);
  const top=largest.value?.[0];
  if(!top?.address){console.log(JSON.stringify({mint,status:'UNKNOWN',reason:'NO_TOP_ACCOUNT'}));continue;}
  const account=await rpc('getAccountInfo',[top.address,{encoding:'jsonParsed',commitment:'finalized'}]);
  const info=account.value?.data?.parsed?.info;
  const tokenOwner=typeof info?.owner==='string'?info.owner:null;
  const expectedCurve=PublicKey.findProgramAddressSync(
   [Buffer.from('bonding-curve'),new PublicKey(mint).toBuffer()],pump)[0].toBase58();
  console.log(JSON.stringify({mint,largestTokenAccount:top.address,
   tokenOwner,expectedBondingCurve:expectedCurve,
   ownedByExpectedBondingCurve:tokenOwner===expectedCurve,
   accountAmount:top.amount??null,
   classification:tokenOwner===expectedCurve?'BONDING_CURVE_CUSTODY':'UNATTRIBUTED_TOKEN_ACCOUNT',
   beneficialOwnershipVerified:false,token2022ExtensionsVerified:false,
   automatedTradingEligible:false}));
 }
 console.log(JSON.stringify({mode:'READ_ONLY',rpcRequests:requests,approvedForTrading:0}));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
