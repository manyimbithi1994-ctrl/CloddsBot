/** Rugcheck-only stage decision; not a paper-entry authorization.
 * Downstream DexScreener and on-chain evidence remain mandatory.
 */
export interface RugcheckStageInput {
  mint: string;
  reportMint: string | null;
  apiError: string | null;
  risks: unknown;
  score: unknown;
  token: unknown;
  holders: unknown;
  markets: unknown;
}
export interface RugcheckStageDecision {
  stage: 'RUGCHECK';
  status: 'REJECT_UNVERIFIED' | 'REJECT_RISK' | 'REVIEW_FOR_DEXSCREENER';
  reasons: string[];
  paperEntryEligible: false;
  automatedTradingEligible: false;
}
const obj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
export function assessRugcheckStage(v: RugcheckStageInput): RugcheckStageDecision {
  const reasons: string[] = [];
  const riskReasons: string[] = [];
  if (v.apiError) reasons.push('RUGCHECK_API_UNVERIFIED');
  if (v.reportMint !== v.mint) reasons.push('RUGCHECK_MINT_MISMATCH');
  if (typeof v.score !== 'number' || !Number.isFinite(v.score) || v.score < 0)
    reasons.push('RUGCHECK_SCORE_UNVERIFIED');
  if (!obj(v.token)) reasons.push('RUGCHECK_TOKEN_UNVERIFIED');
  if (!Array.isArray(v.holders) || !v.holders.length)
    reasons.push('RUGCHECK_HOLDERS_UNVERIFIED');
  if (!Array.isArray(v.markets) || !v.markets.length)
    reasons.push('RUGCHECK_MARKETS_UNVERIFIED');
  if (!Array.isArray(v.risks)) reasons.push('RUGCHECK_RISKS_UNVERIFIED');
  else for (const risk of v.risks) {
    if (!obj(risk)) { reasons.push('RUGCHECK_RISK_FORMAT_UNVERIFIED'); continue; }
    const level = risk.level;
    if (typeof level !== 'number' || !Number.isFinite(level) || level < 0)
      reasons.push('RUGCHECK_RISK_LEVEL_UNVERIFIED');
    else if (level > 0) riskReasons.push('RUGCHECK_RISK_FINDING');
  }
  // A stage review is not an approval: absence of findings does not prove safety.
  const status = riskReasons.length ? 'REJECT_RISK' :
    reasons.length ? 'REJECT_UNVERIFIED' : 'REVIEW_FOR_DEXSCREENER';
  return {stage:'RUGCHECK',status,reasons:[...new Set([...reasons,...riskReasons])],
    paperEntryEligible:false,automatedTradingEligible:false};
}
