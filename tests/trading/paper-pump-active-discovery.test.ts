import {describe,it} from 'node:test';
import {strict as assert} from 'node:assert';
import {evaluateActivePair} from '../../src/solana/paper-pump-active-discovery';

const now=1762100000000;
const base={chainId:'solana',pairCreatedAt:now-60*60000,
 txns:{m5:{buys:8,sells:4}},volume:{m5:2500,h1:12000},liquidity:{usd:15000}};
describe('active token discovery remains advisory',()=>{
 it('requires fresh two-sided market activity',()=>{
  assert.equal(evaluateActivePair(base,now).active,true);
 });
 it('rejects no sells',()=>{
  assert.equal(evaluateActivePair({...base,txns:{m5:{buys:8,sells:0}}},now).active,false);
 });
 it('rejects old and future pairs',()=>{
  assert.equal(evaluateActivePair({...base,pairCreatedAt:now-7*3600000},now).active,false);
  assert.equal(evaluateActivePair({...base,pairCreatedAt:now+1000},now).active,false);
 });
 it('rejects launch-phase tokens and weak momentum',()=>{
  assert.equal(evaluateActivePair({...base,pairCreatedAt:now-5*60000},now).active,false);
  assert.equal(evaluateActivePair({...base,volume:{m5:200,h1:12000}},now).active,false);
  assert.equal(evaluateActivePair({...base,liquidity:{usd:5000}},now).active,false);
 });
 it('rejects absent metrics and wrong chain',()=>{
  assert.equal(evaluateActivePair({},now).active,false);
  assert.equal(evaluateActivePair({...base,chainId:'ethereum'},now).active,false);
 });
});
