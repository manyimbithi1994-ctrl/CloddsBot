import {describe,it} from 'node:test';
import {strict as assert} from 'node:assert';
import {reconcileStandardPumpReserves as reconcile} from '../../src/solana/paper-pump-reserve-accounting';

const base={curveTotalSupplyRaw:'1000000000000000',currentMintSupplyRaw:'1000000000000000',
 vaultBalanceRaw:'1000000000000000',realTokenReservesRaw:'793100000000000'};
describe('Pump.fun reserve accounting stays fail closed',()=>{
 it('reconciles standard initial allocation without authorizing trading',()=>{
  const r=reconcile(base);
  assert.equal(r.status,'STANDARD_PUMP_RESERVED_ALLOCATION_RECONCILED');
  assert.equal(r.differenceRaw,'206900000000000');
  assert.equal(r.paperEntryEligible,false);
  assert.equal(r.automatedTradingEligible,false);
 });
 it('handles smaller current mint supply without assuming cause',()=>{
  const r=reconcile({...base,currentMintSupplyRaw:'999999642333453',
   vaultBalanceRaw:'999999642333453',realTokenReservesRaw:'793099642333453'});
  assert.equal(r.supplyDifferenceRaw,'357666547');
  assert.equal(r.matchesStandardAllocation,true);
 });
 it('rejects inconsistent vault or reserve accounting',()=>{
  assert.equal(reconcile({...base,vaultBalanceRaw:'792000000000000'}).matchesStandardAllocation,false);
  assert.equal(reconcile({...base,realTokenReservesRaw:'793100000000001'}).matchesStandardAllocation,false);
 });
 it('rejects nonstandard total supply',()=>{
  assert.equal(reconcile({...base,curveTotalSupplyRaw:'2000000000000000'}).matchesStandardAllocation,false);
 });
 it('rejects malformed numbers',()=>{
  assert.throws(()=>reconcile({...base,vaultBalanceRaw:'1e15'}));
  assert.throws(()=>reconcile({...base,vaultBalanceRaw:'-1'}));
 });
});
