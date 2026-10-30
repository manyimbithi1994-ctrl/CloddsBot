/** Pure, fail-closed concentration policy for research-only screening.
 * Token accounts are not verified beneficial owners. No RPC or wallet access.
 */
export interface ConcentrationEvidence {
  topTenNonCurveSharePercent: number | null;
  topTenShareOfObservedOutsideCurveSupplyPercent: number | null;
  excludedCurveAccounts: number;
  nonCurveAccountsCounted: number;
  distinctBeneficialOwnersVerified: boolean;
}
export interface ConcentrationVerdict {
  status: 'BLOCK' | 'UNKNOWN' | 'REVIEW';
  reasons: string[];
  paperEntryEligible: false;
  automatedTradingEligible: false;
}
export function evaluateConcentrationPolicy(e: ConcentrationEvidence): ConcentrationVerdict {
  const reasons: string[] = [];
  const valid = (v: number | null) => typeof v === 'number' &&
    Number.isFinite(v) && v >= 0 && v <= 100;
  if (!valid(e.topTenNonCurveSharePercent) ||
      !valid(e.topTenShareOfObservedOutsideCurveSupplyPercent) ||
      !Number.isInteger(e.excludedCurveAccounts) || e.excludedCurveAccounts < 1 ||
      !Number.isInteger(e.nonCurveAccountsCounted) || e.nonCurveAccountsCounted < 1 ||
      e.nonCurveAccountsCounted > 10) {
    return {status:'UNKNOWN',reasons:['INCOMPLETE_OR_INVALID_CONCENTRATION_EVIDENCE'],
      paperEntryEligible:false,automatedTradingEligible:false};
  }
  if (e.topTenNonCurveSharePercent! > 40)
    reasons.push('TOP_TEN_OVER_40_PERCENT_TOTAL_SUPPLY');
  if (e.topTenShareOfObservedOutsideCurveSupplyPercent! > 40)
    reasons.push('TOP_TEN_OVER_40_PERCENT_OUTSIDE_CURVE');
  if (reasons.length)
    return {status:'BLOCK',reasons,paperEntryEligible:false,automatedTradingEligible:false};
  reasons.push('CONCENTRATION_THRESHOLDS_PASS_BUT_OTHER_SAFETY_GATES_REQUIRED');
  if (!e.distinctBeneficialOwnersVerified)
    reasons.push('BENEFICIAL_OWNERSHIP_NOT_VERIFIED');
  return {status:'REVIEW',reasons,paperEntryEligible:false,automatedTradingEligible:false};
}
