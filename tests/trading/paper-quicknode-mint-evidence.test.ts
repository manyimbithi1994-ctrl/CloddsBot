import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {parseMintAccountEvidence} from '../../src/solana/paper-quicknode-mint-evidence';
const mint='Hq76LjXyS9eJeTXHqkMEjDAdMuzQ41K14Lx35yKQ5Y1b';
const owner='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const account=(info:Record<string,unknown>,program=owner)=>({value:{owner:program,data:{parsed:{type:'mint',info}}}});
const valid={supply:'1000000000',mintAuthority:null,freezeAuthority:null};
describe('QuickNode mint account parsing',()=>{
 it('parses revoked authorities and exact bigint supply',()=>{
  const r=parseMintAccountEvidence(mint,account(valid));
  assert.deepEqual(r.reasons,[]);assert.equal(r.accountMint,mint);
  assert.equal(r.supply,1000000000n);assert.equal(r.mintAuthority,null);
 });
 it('preserves active authorities for risk rejection',()=>{
  const r=parseMintAccountEvidence(mint,account({...valid,freezeAuthority:mint}));
  assert.equal(r.freezeAuthority,mint);
 });
 it('rejects missing authority fields',()=>{
  const r=parseMintAccountEvidence(mint,account({supply:'100'}));
  assert.equal(r.accountMint,null);assert.equal(r.mintAuthority,undefined);
 });
 it('rejects invalid mint supply',()=>assert.equal(parseMintAccountEvidence(mint,account({...valid,supply:'1.5'})).supply,null));
 it('rejects unexpected program owner',()=>assert.ok(parseMintAccountEvidence(mint,account(valid,mint)).reasons.includes('MINT_PROGRAM_UNVERIFIED')));
 it('rejects missing account',()=>assert.equal(parseMintAccountEvidence(mint,{value:null}).accountMint,null));
 it('rejects invalid authority addresses',()=>assert.equal(parseMintAccountEvidence(mint,account({...valid,mintAuthority:'invalid'})).mintAuthority,undefined));
});
