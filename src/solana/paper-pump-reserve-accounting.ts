/** Pure, read-only Pump.fun standard reserve reconciliation. Never authorizes trades. */
export function reconcileStandardPumpReserves(input:{
 curveTotalSupplyRaw:string;currentMintSupplyRaw:string;
 vaultBalanceRaw:string;realTokenReservesRaw:string
}){
 const values=Object.values(input);
 if(values.some(v=>typeof v!=='string'||!/^\\d+$/.test(v)))throw Error('INVALID_RESERVE_AMOUNT');
 const [curve,current,vault,real]=values.map(v=>BigInt(v));
 const difference=vault-real;
 const standard=curve===1000000000000000n;
 const matches=standard&&difference===206900000000000n&&
  current<=curve&&vault<=current&&real<=vault;
 return {status:matches?'STANDARD_PUMP_RESERVED_ALLOCATION_RECONCILED':
  'RESERVE_ALLOCATION_UNVERIFIED',
  differenceRaw:difference.toString(),
  supplyDifferenceRaw:(curve-current).toString(),
  matchesStandardAllocation:matches,
  paperEntryEligible:false,automatedTradingEligible:false};
}
