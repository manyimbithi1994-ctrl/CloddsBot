import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {assessQuickNodeEvidence,type QuickNodeCombinedInput} from '../../src/solana/paper-quicknode-evidence';
const mint='Hq76LjXyS9eJeTXHqkMEjDAdMuzQ41K14Lx35yKQ5Y1b';
const now=Date.parse('2026-11-01T10:00:00.000Z');
const account=(info:Record<string,unknown>,owner='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')=>
 ({value:{owner,data:{parsed:{type:'mint',info}}}});
const valid:QuickNodeCombinedInput={mint,nowMs:now,checkedAt:new Date(now).toISOString(),
 mintAccountResponse:account({supply:'1000000000',mintAuthority:null,freezeAuthority:null}),
 curveCustodyVerified:true,topTenNonCurveSharePercent:25,topTenOutsideCurvePercent:35,
 excludedCurveAccounts:1,nonCurveAccountsCounted:10};
const check=(v:Partial<QuickNodeCombinedInput>={})=>assessQuickNodeEvidence({...valid,...v});
describe('combined QuickNode RPC research evidence',()=>{
 it('accepts complete evidence for review but never authorizes trades',()=>{
  const r=check();assert.equal(r.status,'REVIEW_COMPLETE');assert.equal(r.paperEntryEligible,false);
 });
 it('rejects missing RPC account',()=>assert.equal(check({mintAccountResponse:{value:null}}).status,'REJECT_UNVERIFIED'));
 it('rejects malformed supply',()=>{
  const r=check({mintAccountResponse:account({supply:'NaN',mintAuthority:null,freezeAuthority:null})});
  assert.equal(r.status,'REJECT_UNVERIFIED');assert.ok(r.reasons.includes('MINT_SUPPLY_UNVERIFIED'));
 });
 it('rejects wrong token program',()=>assert.equal(check({
  mintAccountResponse:account({supply:'100',mintAuthority:null,freezeAuthority:null},mint)
 }).status,'REJECT_UNVERIFIED'));
 it('rejects active freeze authority',()=>assert.equal(check({
  mintAccountResponse:account({supply:'100',mintAuthority:null,freezeAuthority:mint})
 }).status,'REJECT_RISK'));
 it('rejects unverified curve custody',()=>assert.equal(check({curveCustodyVerified:false}).status,'REJECT_UNVERIFIED'));
 it('rejects insufficient holder evidence',()=>assert.equal(check({topTenOutsideCurvePercent:null}).status,'REJECT_UNVERIFIED'));
 it('rejects concentration exceeding 40 percent',()=>assert.equal(check({topTenOutsideCurvePercent:41}).status,'REJECT_RISK'));
});
