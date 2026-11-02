import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {assessQuickNodeStage, type QuickNodeStageInput} from '../../src/solana/paper-quicknode-stage';
const mint='Hq76LjXyS9eJeTXHqkMEjDAdMuzQ41K14Lx35yKQ5Y1b';
const now=Date.parse('2026-11-01T10:00:00.000Z');
const good:QuickNodeStageInput={mint,accountMint:mint,checkedAt:new Date(now).toISOString(),
 nowMs:now,mintAuthority:null,freezeAuthority:null,curveCustodyVerified:true,
 topTenNonCurveSharePercent:25,topTenOutsideCurvePercent:35,
 excludedCurveAccounts:1,nonCurveAccountsCounted:10};
const check=(change:Partial<QuickNodeStageInput>={})=>assessQuickNodeStage({...good,...change});
describe('QuickNode research stage',()=>{
 it('permits review only and never authorizes entry',()=>{
  const r=check();assert.equal(r.status,'REVIEW_COMPLETE');
  assert.equal(r.paperEntryEligible,false);assert.equal(r.automatedTradingEligible,false);
 });
 it('rejects mint mismatch',()=>assert.equal(check({accountMint:'wrong'}).status,'REJECT_UNVERIFIED'));
 it('rejects stale evidence',()=>assert.equal(check({checkedAt:new Date(now-31000).toISOString()}).status,'REJECT_UNVERIFIED'));
 it('rejects active mint authority',()=>assert.equal(check({mintAuthority:mint}).status,'REJECT_RISK'));
 it('rejects active freeze authority',()=>assert.equal(check({freezeAuthority:mint}).status,'REJECT_RISK'));
 it('rejects unknown authorities',()=>assert.equal(check({mintAuthority:undefined}).status,'REJECT_UNVERIFIED'));
 it('rejects unverified curve custody',()=>assert.equal(check({curveCustodyVerified:false}).status,'REJECT_UNVERIFIED'));
 it('rejects total supply concentration over 40%',()=>assert.equal(check({topTenNonCurveSharePercent:41}).status,'REJECT_RISK'));
 it('rejects outside curve concentration over 40%',()=>assert.equal(check({topTenOutsideCurvePercent:41}).status,'REJECT_RISK'));
 it('rejects missing concentration data',()=>assert.equal(check({topTenOutsideCurvePercent:null}).status,'REJECT_UNVERIFIED'));
});
