import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertPaperOrderAllowed, DEFAULT_PAPER_RISK } from '../../src/solana/paper-risk';
describe('paper trading fail-closed risk limits', () => {
 const safe = { spendUsd: 4, cashUsd: 20, openPositions: 0, realizedDailyPnlUsd: 0, slippageBps: 100 };
 it('accepts a compliant virtual order', () => assert.doesNotThrow(() => assertPaperOrderAllowed(safe)));
 it('limits position size to 20% of the $20 virtual account', () => assert.throws(() => assertPaperOrderAllowed({...safe,spendUsd:4.01})));
 it('limits concurrent positions', () => assert.throws(() => assertPaperOrderAllowed({...safe,openPositions:1})));
 it('stops orders after a $2 daily loss', () => assert.throws(() => assertPaperOrderAllowed({...safe,realizedDailyPnlUsd:-2})));
 it('rejects losses beyond the limit', () => assert.throws(() => assertPaperOrderAllowed({...safe,realizedDailyPnlUsd:-2.01})));
 it('accepts losses below the limit', () => assert.doesNotThrow(() => assertPaperOrderAllowed({...safe,realizedDailyPnlUsd:-1.99})));
 it('rejects invalid daily loss settings', () => assert.throws(() => assertPaperOrderAllowed(safe,{...DEFAULT_PAPER_RISK,maxDailyLossUsd:0})));
 it('rejects excessive slippage', () => assert.throws(() => assertPaperOrderAllowed({...safe,slippageBps:301})));
 it('rejects NaN and infinity instead of bypassing comparisons', () => {
  assert.throws(() => assertPaperOrderAllowed({...safe,spendUsd:NaN}));
  assert.throws(() => assertPaperOrderAllowed({...safe,cashUsd:Infinity}));
 });
 it('rejects malformed policy', () => assert.throws(() => assertPaperOrderAllowed(safe,{...DEFAULT_PAPER_RISK,maxOrderUsd:100})));
});
