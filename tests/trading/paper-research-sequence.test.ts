import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextPaperResearchStage } from '../../src/solana/paper-research-sequence';
import type { RugcheckStageDecision } from '../../src/solana/paper-rugcheck-stage';
import type { DexStageResult } from '../../src/solana/paper-dexscreener-stage';

const rug: RugcheckStageDecision = { stage:'RUGCHECK', status:'REVIEW_FOR_DEXSCREENER', reasons:[], paperEntryEligible:false, automatedTradingEligible:false };
const dex: DexStageResult = { stage:'DEXSCREENER', status:'REVIEW_FOR_QUICKNODE', reasons:[], pairAddress:'Hq76LjXyS9eJeTXHqkMEjDAdMuzQ41K14Lx35yKQ5Y1b', paperEntryEligible:false, automatedTradingEligible:false };
describe('research sequence', () => {
  it('starts at Rugcheck', () => assert.equal(nextPaperResearchStage(null,null),'RUGCHECK'));
  it('requires Rugcheck before DexScreener', () => assert.equal(nextPaperResearchStage(rug,null),'DEXSCREENER'));
  it('requires both reviews before QuickNode', () => assert.equal(nextPaperResearchStage(rug,dex),'QUICKNODE'));
  it('stops on Rugcheck rejection', () => assert.equal(nextPaperResearchStage({...rug,status:'REJECT_RISK'},dex),'STOP'));
  it('stops on DexScreener rejection', () => assert.equal(nextPaperResearchStage(rug,{...dex,status:'REJECT_UNVERIFIED'}),'STOP'));
  it('stops without pair identity', () => assert.equal(nextPaperResearchStage(rug,{...dex,pairAddress:null}),'STOP'));
});
