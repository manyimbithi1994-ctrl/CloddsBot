/** Read-only research evidence certificate validation.
 * An untrusted JSON object cannot authorize a virtual buy. The research
 * pipeline does not yet issue authenticated certificates.
 */
export interface PaperResearchCertificate {
  version: 1;
  mint: string;
  pairAddress: string;
  issuedAt: string;
  rugcheck: { verified: boolean; checkedAt: string };
  dexscreener: { verified: boolean; checkedAt: string };
  quickNode: {
    verified: boolean;
    checkedAt: string;
    topTenTotalSupplyPercent: number;
    topTenOutsideCurvePercent: number;
    curveCustodyVerified: boolean;
  };
}

export interface ResearchCertificateVerdict {
  status: 'BLOCK' | 'REVIEW';
  reasons: string[];
  paperEntryEligible: false;
  automatedTradingEligible: false;
}

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function inspectPaperResearchCertificate(
  value: unknown,
  expectedMint: string,
  expectedPair: string,
  nowMs = Date.now()
): ResearchCertificateVerdict {
  const reasons: string[] = [];
  if (!object(value) || value.version !== 1) {
    return { status: 'BLOCK', reasons: ['CERTIFICATE_MISSING_OR_INVALID'], paperEntryEligible: false, automatedTradingEligible: false };
  }
  if (value.mint !== expectedMint || value.pairAddress !== expectedPair)
    reasons.push('CERTIFICATE_MARKET_IDENTITY_MISMATCH');
  if (!Number.isFinite(nowMs)) reasons.push('INVALID_CLOCK');
  const issued = typeof value.issuedAt === 'string' ? Date.parse(value.issuedAt) : NaN;
  if (!Number.isFinite(issued) || nowMs - issued > 30000 || issued - nowMs > 5000)
    reasons.push('CERTIFICATE_STALE_OR_FUTURE');
  for (const key of ['rugcheck', 'dexscreener', 'quickNode']) {
    const stage = value[key];
    if (!object(stage) || stage.verified !== true) {
      reasons.push(key.toUpperCase() + '_NOT_VERIFIED');
      continue;
    }
    const checked = typeof stage.checkedAt === 'string' ? Date.parse(stage.checkedAt) : NaN;
    if (!Number.isFinite(checked) || checked > issued || issued - checked > 30000)
      reasons.push(key.toUpperCase() + '_EVIDENCE_NOT_FRESH');
  }
  const rpc = value.quickNode;
  if (object(rpc)) {
    const valid = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
    if (!valid(rpc.topTenTotalSupplyPercent) || !valid(rpc.topTenOutsideCurvePercent) || rpc.curveCustodyVerified !== true)
      reasons.push('CONCENTRATION_EVIDENCE_INCOMPLETE');
    else if ((rpc.topTenTotalSupplyPercent as number) > 40 || (rpc.topTenOutsideCurvePercent as number) > 40)
      reasons.push('CONCENTRATION_EXCEEDS_40_PERCENT');
  }
  // Crucial: the issuer and provenance are not authenticated yet.
  // Never authorize entry solely from user-editable JSON fields.
  reasons.push('CERTIFICATE_ISSUER_NOT_AUTHENTICATED');
  return { status: 'BLOCK', reasons: [...new Set(reasons)], paperEntryEligible: false, automatedTradingEligible: false };
}
