/** Join validated mint and concentration evidence; research-only, no RPC or wallet effects. */
import {parseMintAccountEvidence} from './paper-quicknode-mint-evidence';
import {assessQuickNodeStage, type QuickNodeStageResult} from './paper-quicknode-stage';

export interface QuickNodeCombinedInput {
  mint:string;
  mintAccountResponse:unknown;
  checkedAt:string;
  nowMs:number;
  curveCustodyVerified:boolean;
  topTenNonCurveSharePercent:number|null;
  topTenOutsideCurvePercent:number|null;
  excludedCurveAccounts:number;
  nonCurveAccountsCounted:number;
}
export function assessQuickNodeEvidence(input:QuickNodeCombinedInput):QuickNodeStageResult {
  const parsed=parseMintAccountEvidence(input.mint,input.mintAccountResponse);
  const stage=assessQuickNodeStage({
    mint:input.mint,accountMint:parsed.accountMint,
    checkedAt:input.checkedAt,nowMs:input.nowMs,
    mintAuthority:parsed.mintAuthority,freezeAuthority:parsed.freezeAuthority,
    curveCustodyVerified:input.curveCustodyVerified,
    topTenNonCurveSharePercent:input.topTenNonCurveSharePercent,
    topTenOutsideCurvePercent:input.topTenOutsideCurvePercent,
    excludedCurveAccounts:input.excludedCurveAccounts,
    nonCurveAccountsCounted:input.nonCurveAccountsCounted
  });
  if (!parsed.reasons.length) return stage;
  return {...stage,status:'REJECT_UNVERIFIED',
    reasons:[...new Set([...parsed.reasons,...stage.reasons])],
    paperEntryEligible:false,automatedTradingEligible:false};
}
