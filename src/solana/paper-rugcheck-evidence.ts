/** Fail-closed validation of Rugcheck report evidence. Research only. */
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const address=(v:unknown)=>typeof v==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
export function assessRugcheckReport(report:unknown,mint:string):{status:'BLOCK'|'REVIEW';reasons:string[];topTenReportedPercent:number|null}{
 const reasons:string[]=[];
 let topTenReportedPercent:number|null=null;
 if(!obj(report))return {status:'BLOCK',reasons:['INVALID_REPORT'],topTenReportedPercent};
 if(report.mint!==mint)reasons.push('MINT_MISMATCH');
 if(!finite(report.score)||report.score<0)reasons.push('INVALID_RISK_SCORE');
 if(!Array.isArray(report.risks))reasons.push('RISKS_MISSING');
 else for(const risk of report.risks){
  if(!obj(risk)||!finite(risk.level)||risk.level<0){reasons.push('UNINTERPRETABLE_RISK_LEVEL');continue;}
  // Nonzero severity must be interpreted against provider documentation before allowing a pass.
  if(risk.level>0)reasons.push('RISK_FINDING_REQUIRES_REVIEW');
 }
 if(!obj(report.token))reasons.push('TOKEN_METADATA_MISSING');
 else {
  if(!address(report.token.mint)&&report.token.mint!==undefined)reasons.push('INVALID_TOKEN_MINT');
  if(report.token.mint!==undefined&&report.token.mint!==mint)reasons.push('TOKEN_METADATA_MINT_MISMATCH');
 }
 if(!Array.isArray(report.topHolders)||report.topHolders.length===0)reasons.push('HOLDERS_MISSING_OR_EMPTY');
 else {
  const holders=report.topHolders;
  if(holders.some(h=>!obj(h)||!address(h.address)||!finite(h.pct)||h.pct<0||h.pct>100))
   reasons.push('HOLDER_RECORD_UNVERIFIED');
  else {
   const ordered=[...holders].sort((a,b)=>((b as Obj).pct as number)-((a as Obj).pct as number));
   const calculatedPercent=ordered.slice(0,10).reduce((s,h)=>s+((h as Obj).pct as number),0);
   topTenReportedPercent=calculatedPercent;
   if(calculatedPercent>100.01)reasons.push('HOLDER_TOTAL_INCONSISTENT');
   if(calculatedPercent>40)reasons.push('REPORTED_CONCENTRATION_REQUIRES_CURVE_CUSTODY_ATTRIBUTION');
  }
  if(holders.length<10)reasons.push('FEWER_THAN_TEN_REPORTED_HOLDERS');
 }
 if(!Array.isArray(report.markets)||report.markets.length===0)reasons.push('MARKETS_MISSING_OR_EMPTY');
 else if(report.markets.some(m=>!obj(m)))reasons.push('INVALID_MARKET_RECORD');
 // Critical authority and custody claims must be independently verified.
 reasons.push('TOKEN_AUTHORITIES_NOT_INDEPENDENTLY_VERIFIED');
 reasons.push('CURVE_CUSTODY_NOT_ATTRIBUTED');
 reasons.push('DEX_LIQUIDITY_NOT_VERIFIED');
 return {status:reasons.length?'BLOCK':'REVIEW',reasons:[...new Set(reasons)],topTenReportedPercent};
}
