import assert from 'node:assert/strict';
import { screenDiscoveryCandidate } from './paper-token-discovery';

const base = {
  mint: 'So11111111111111111111111111111111111111112',
  chainId: 'solana' as const,
  description: null,
  profileUrl: null,
  liquidityUsd: 25000,
  volume24hUsd: 8000,
  buys24h: 100,
  sells24h: 90,
  pairAddress: 'test-pair',
  pairCreatedAt: '2020-01-01T00:00:00.000Z',
  volumeLiquidityRatio: 0.32,
  provenance: 'UNVERIFIED' as const
};
const eligible = screenDiscoveryCandidate(base);
assert.equal(eligible.eligible, true);
assert.equal(eligible.provenance, 'UNVERIFIED');
assert.equal(eligible.reasons.length, 0);
assert.ok(eligible.score > 0);

const missing = screenDiscoveryCandidate({
  ...base, liquidityUsd: null, volume24hUsd: null,
  buys24h: null, sells24h: null, pairAddress: null
});
assert.equal(missing.eligible, false);
assert.ok(missing.reasons.length >= 4);

const lowLiquidity = screenDiscoveryCandidate({ ...base, liquidityUsd: 9999 });
assert.equal(lowLiquidity.eligible, false);
assert.match(lowLiquidity.reasons.join(' '), /Liquidity/);

const lowVolume = screenDiscoveryCandidate({ ...base, volume24hUsd: 4999 });
assert.equal(lowVolume.eligible, false);
assert.match(lowVolume.reasons.join(' '), /volume/);

console.log('Paper token discovery screening tests passed');

const noSells = screenDiscoveryCandidate({ ...base, sells24h: 0 });
assert.equal(noSells.eligible, false);
assert.match(noSells.reasons.join(' '), /No recorded sells/);
const churn = screenDiscoveryCandidate({ ...base, volumeLiquidityRatio: 25 });
assert.equal(churn.eligible, false);
assert.match(churn.reasons.join(' '), /20x/);
const missingAge = screenDiscoveryCandidate({ ...base, pairCreatedAt: null });
assert.equal(missingAge.eligible, false);
const lowActivity = screenDiscoveryCandidate({ ...base, buys24h: 30, sells24h: 20 });
assert.equal(lowActivity.eligible, false);
