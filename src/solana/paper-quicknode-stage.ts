/** Pure fail-closed QuickNode evidence assessment. Research only; no wallet or RPC side effects. */
import { evaluateConcentrationPolicy } from './paper-concentration-policy';

export interface QuickNodeStageInput {
  mint: string;
  accountMint: string | null;
  checkedAt: string;
  nowMs: number;
  mintAuthority: string | null | undefined;
  freezeAuthority: string | null | undefined;
  curveCustodyVerified: boolean;
  topTenNonCurveSharePercent: number | null;
  topTenOutsideCurvePercent: number | null;
  excludedCurveAccounts: number;
  nonCurveAccountsCounted: number;
}
export interface QuickNodeStageResult {
  stage: 'QUICKNODE';
  status: 'REJECT_UNVERIFIED' | 'REJECT_RISK' | 'REVIEW_COMPLETE';
  reasons: string[];
  paperEntryEligible: false;
  automatedTradingEligible: false;
}
export function assessQuickNodeStage(v: QuickNodeStageInput): QuickNodeStageResult {
  const missing: string[] = [];
  const risk: string[] = [];
  const checked = Date.parse(v.checkedAt);
  if (!Number.isFinite(v.nowMs) || !Number.isFinite(checked) ||
      v.nowMs - checked > 30000 || checked - v.nowMs > 5000)
    missing.push('RPC_EVIDENCE_STALE_OR_INVALID');
  if (v.accountMint !== v.mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.mint))
    missing.push('RPC_MINT_IDENTITY_UNVERIFIED');
  if (v.mintAuthority === undefined || v.freezeAuthority === undefined)
    missing.push('RPC_AUTHORITIES_UNVERIFIED');
  else {
    if (v.mintAuthority !== null) risk.push('RPC_MINT_AUTHORITY_ACTIVE');
    if (v.freezeAuthority !== null) risk.push('RPC_FREEZE_AUTHORITY_ACTIVE');
  }
  if (v.curveCustodyVerified !== true) missing.push('RPC_CURVE_CUSTODY_UNVERIFIED');
  const concentration = evaluateConcentrationPolicy({
    topTenNonCurveSharePercent: v.topTenNonCurveSharePercent,
    topTenShareOfObservedOutsideCurveSupplyPercent: v.topTenOutsideCurvePercent,
    excludedCurveAccounts: v.excludedCurveAccounts,
    nonCurveAccountsCounted: v.nonCurveAccountsCounted,
    distinctBeneficialOwnersVerified: false
  });
  if (concentration.status === 'UNKNOWN') missing.push(...concentration.reasons);
  if (concentration.status === 'BLOCK') risk.push(...concentration.reasons);
  const status = missing.length ? 'REJECT_UNVERIFIED' :
    risk.length ? 'REJECT_RISK' : 'REVIEW_COMPLETE';
  return {stage:'QUICKNODE',status,reasons:[...new Set([...missing,...risk])],
    paperEntryEligible:false,automatedTradingEligible:false};
}
