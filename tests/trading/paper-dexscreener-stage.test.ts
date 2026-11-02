import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessDexScreenerStage } from '../../src/solana/paper-dexscreener-stage';

describe('DexScreener research stage', () => {
  const now = Date.parse('2026-11-01T12:00:00.000Z');
  const mint = '3msFLe2RXjfC6wHkkGjvXFFjfMf7Fvmc42HeaEBmpump';
  const pair = { chainId:'solana', baseToken:{address:mint},
    pairAddress:'Hq76LjXyS9eJeTXHqkMEjDAdMuzQ41K14Lx35yKQ5Y1b',
    liquidity:{usd:15000},volume:{h24:6000},txns:{h24:{buys:90,sells:30}},
    pairCreatedAt:now-600000 };
  const check = (p:unknown,checkedAt=new Date(now).toISOString()) =>
    assessDexScreenerStage({mint,pair:p,checkedAt,nowMs:now});
  it('permits only further research on complete market evidence', () => {
    const r=check(pair);
    assert.equal(r.status,'REVIEW_FOR_QUICKNODE');
    assert.equal(r.paperEntryEligible,false);
  });
  it('rejects a mismatched token', () => {
    assert.equal(check({...pair,baseToken:{address:'other'}}).status,'REJECT_UNVERIFIED');
  });
  it('rejects missing liquidity', () => {
    assert.equal(check({...pair,liquidity:{}}).status,'REJECT_UNVERIFIED');
  });
  it('rejects low liquidity', () => {
    assert.equal(check({...pair,liquidity:{usd:100}}).status,'REJECT_RISK');
  });
  it('rejects stale market evidence', () => {
    assert.equal(check(pair,new Date(now-60000).toISOString()).status,'REJECT_UNVERIFIED');
  });
});
