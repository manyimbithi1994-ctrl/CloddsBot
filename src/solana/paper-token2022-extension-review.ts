/** Read-only Token-2022 extension audit. Unknown or unsupported extensions block approval. */
const rpcUrl=process.env.CLODDS_RESEARCH_RPC_URL;
if(!rpcUrl||!rpcUrl.startsWith('https://'))throw Error('HTTPS research RPC required');
const mints=['3msFLe2RXjfC6wHkkGjvXFFjfMf7Fvmc42HeaEBmpump','Hq76LjXyS9eJeTXHqkMEjDAdMuzQ41K14Lx35yKQ5Y1b'];
const token2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
async function main():Promise<void>{
 let rpcRequests=0;
 for(const mint of mints){
  rpcRequests++;
  let status='UNKNOWN',extensions:unknown[]|null=null,reason='UNVERIFIED';
  try{
   const response=await fetch(rpcUrl!,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:rpcRequests,method:'getAccountInfo',
     params:[mint,{encoding:'jsonParsed',commitment:'finalized'}]}),
    signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const json:any=await response.json();
   if(json.error)throw Error('RPC_ERROR');
   const account=json.result?.value;
   if(account?.owner!==token2022){reason='NOT_TOKEN_2022_OR_MISSING_ACCOUNT';}
   else if(account.data?.parsed?.type!=='mint'){reason='MINT_NOT_PARSED';}
   else{
    const info=account.data.parsed.info;
    extensions=Array.isArray(info?.extensions)?info.extensions:null;
    if(extensions===null){reason='EXTENSION_LIST_MISSING_OR_UNSUPPORTED';}
    else{
     const types=extensions.map((e:any)=>String(e?.extension??e?.type??'UNKNOWN'));
     const risky=types.filter(t=>/transferFee|transferHook|permanentDelegate|confidential|nonTransferable|defaultAccountState|pausable|interestBearing|unknown/i.test(t));
     status=risky.length?'BLOCK':'REVIEW_REQUIRED';
     reason=risky.length?'POTENTIALLY_RESTRICTIVE_EXTENSION':'EXTENSIONS_REPORTED_NEED_MANUAL_VALIDATION';
    }
   }
  }catch(e){reason=e instanceof Error?e.message:'RPC_UNAVAILABLE';}
  console.log(JSON.stringify({mint,status,reason,extensions,
   extensionSafetyVerified:false,automatedTradingEligible:false}));
 }
 console.log(JSON.stringify({mode:'READ_ONLY',rpcRequests,approvedForTrading:0}));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
