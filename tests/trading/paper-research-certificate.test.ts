import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inspectPaperResearchCertificate } from '../../src/solana/paper-research-certificate';

describe('paper research certificates fail closed', () => {
  const now = Date.parse('2026-11-01T12:00:00.000Z');
  const good = {
    version: 1, mint: 'mintA', pairAddress: 'pairA',
    issuedAt: new Date(now).toISOString(),
    rugcheck: { verified: true, checkedAt: new Date(now).toISOString() },
    dexscreener: { verified: true, checkedAt: new Date(now).toISOString() },
    quickNode: { verified: true, checkedAt: new Date(now).toISOString(),
      topTenTotalSupplyPercent: 10, topTenOutsideCurvePercent: 20, curveCustodyVerified: true }
  };
  const inspect = (v: unknown) => inspectPaperResearchCertificate(v, 'mintA', 'pairA', now);
  it('rejects missing evidence', () => {
    assert.equal(inspect(null).paperEntryEligible, false);
    assert.ok(inspect(null).reasons.includes('CERTIFICATE_MISSING_OR_INVALID'));
  });
  it('rejects mismatched token identity', () => {
    assert.ok(inspect({ ...good, mint: 'mintB' }).reasons.includes('CERTIFICATE_MARKET_IDENTITY_MISMATCH'));
  });
  it('rejects stale certificates', () => {
    assert.ok(inspect({ ...good, issuedAt: new Date(now - 60000).toISOString() }).reasons.includes('CERTIFICATE_STALE_OR_FUTURE'));
  });
  it('rejects incomplete provider evidence', () => {
    assert.ok(inspect({ ...good, rugcheck: { ...good.rugcheck, verified: false } }).reasons.includes('RUGCHECK_NOT_VERIFIED'));
  });
  it('rejects either concentration threshold above 40 percent', () => {
    assert.ok(inspect({ ...good, quickNode: { ...good.quickNode, topTenTotalSupplyPercent: 41 } }).reasons.includes('CONCENTRATION_EXCEEDS_40_PERCENT'));
    assert.ok(inspect({ ...good, quickNode: { ...good.quickNode, topTenOutsideCurvePercent: 41 } }).reasons.includes('CONCENTRATION_EXCEEDS_40_PERCENT'));
  });
  it('rejects forged self-declared approvals even when all fields look good', () => {
    assert.deepEqual(inspect(good).reasons, ['CERTIFICATE_ISSUER_NOT_AUTHENTICATED']);
    assert.equal(inspect(good).paperEntryEligible, false);
  });
});
