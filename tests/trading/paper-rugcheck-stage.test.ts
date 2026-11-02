import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessRugcheckStage, type RugcheckStageInput } from '../../src/solana/paper-rugcheck-stage';

describe('Rugcheck stage progression stays separate from paper authorization', () => {
  const base: RugcheckStageInput = {
    mint:'mintA',reportMint:'mintA',apiError:null,score:0,risks:[],
    token:{},holders:[{}],markets:[{}]
  };
  it('allows downstream research but never entry on a complete no-risk report', () => {
    const result=assessRugcheckStage(base);
    assert.equal(result.status,'REVIEW_FOR_DEXSCREENER');
    assert.equal(result.paperEntryEligible,false);
  });
  it('rejects an API failure and mint mismatch', () => {
    const result=assessRugcheckStage({...base,apiError:'HTTP_429',reportMint:'mintB'});
    assert.equal(result.status,'REJECT_UNVERIFIED');
    assert.ok(result.reasons.includes('RUGCHECK_MINT_MISMATCH'));
  });
  it('rejects known risk findings', () => {
    assert.equal(assessRugcheckStage({...base,risks:[{level:1}]}).status,'REJECT_RISK');
  });
  it('rejects uninterpretable risk levels and missing markets', () => {
    const result=assessRugcheckStage({...base,risks:[{level:'high'}],markets:[]});
    assert.equal(result.status,'REJECT_UNVERIFIED');
  });
});
