import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyWatchCandidate,buildWatchlist} from '../../src/solana/paper-pump-watchlist';
const now=Date.parse('2026-11-03T12:00:00Z');
const mint='Z8GFFAwsEhiqLPmbdNp6hiu5qLbVDGjtb7cCmFTpump';
const verified={mint,status:'VERIFIED_PUMP_FUN',programId:'6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',createdAt:new Date(now-3600000).toISOString()};
const rug={mint,status:'RUGCHECK_RESEARCH_PASS',rugcheckStageStatus:'REVIEW_FOR_DEXSCREENER',rugcheckStageReasons:[],reasons:[],checkedAt:new Date(now-60000).toISOString()};
const market={mint,source:'DEXSCREENER_ADVISORY',active:true,pairAddress:'pair',liquidityUsd:12000,buys5m:10,sells5m:3,volume5mUsd:2500,checkedAt:new Date(now-60000).toISOString()};
test('watchlist admits only fresh verified risk and market evidence',()=>{
 assert.equal(classifyWatchCandidate(verified,rug,market,now).tier,'ACTIVE_WATCHLIST');
 assert.equal(classifyWatchCandidate(verified,undefined,market,now).tier,'PREQUALIFICATION');
 assert.equal(classifyWatchCandidate(verified,{...rug,rugcheckStageStatus:'REJECT_RISK'},market,now).tier,'REJECTED');
 assert.equal(classifyWatchCandidate(verified,rug,{...market,liquidityUsd:null},now).tier,'PREQUALIFICATION');
 assert.equal(classifyWatchCandidate({...verified,createdAt:new Date(now-7*3600000).toISOString()},rug,market,now).tier,'EXPIRED_OR_UNVERIFIED');
 assert.equal(classifyWatchCandidate({...verified,createdAt:new Date(now-60000).toISOString()},rug,market,now).tier,'PREQUALIFICATION');
});
test('watchlist deduplicates append-only records and never authorizes trades',()=>{
 const result=buildWatchlist([verified,verified],[rug],[market],now);
 assert.equal(result.active.length,1);
 assert.equal(result.prequalification.length,0);
 assert.equal(result.active[0].paperEntryEligible,false);
 assert.equal(result.active[0].automatedTradingEligible,false);
});
