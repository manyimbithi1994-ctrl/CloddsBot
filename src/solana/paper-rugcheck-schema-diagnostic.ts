/** Inspect Rugcheck response structure without exposing full reports or enabling trading.
 * Exactly one public HTTPS request; no QuickNode or wallet access.
 */
const mint='3msFLe2RXjfC6wHkkGjvXFFjfMf7Fvmc42HeaEBmpump';
async function main():Promise<void>{
 const response=await fetch('https://api.rugcheck.xyz/v1/tokens/'+mint+'/report/summary',{
   headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Rugcheck HTTP '+response.status);
 const raw:unknown=await response.json();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Unexpected response');
 const obj=raw as Record<string,unknown>;
 const fields=Object.keys(obj).sort();
 const token=obj.token&&typeof obj.token==='object'&&!Array.isArray(obj.token)
   ?obj.token as Record<string,unknown>:null;
 const reportedMint=typeof obj.mint==='string'?obj.mint:
   typeof token?.mint==='string'?token.mint:null;
 console.log(JSON.stringify({mode:'SCHEMA_DIAGNOSTIC_ONLY',requestedMint:mint,
  topLevelFields:fields,tokenFields:token?Object.keys(token).sort():[],
  mintLocation:typeof obj.mint==='string'?'mint':
    typeof token?.mint==='string'?'token.mint':'NOT_PRESENT',
  mintMatches:reportedMint===mint,scoreType:typeof obj.score,
  risksArray:Array.isArray(obj.risks),quickNodeRpcRequests:0,
  automatedTradingEligible:false},null,2));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
