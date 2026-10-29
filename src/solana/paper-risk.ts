/** Fail-closed limits for virtual USD-only trading. This module cannot submit transactions. */
export interface PaperRiskPolicy {
  initialCashUsd: number;
  maxOrderUsd: number;
  maxOpenPositions: number;
  maxSlippageBps: number;
}
export const DEFAULT_PAPER_RISK: Readonly<PaperRiskPolicy> = Object.freeze({
  initialCashUsd: 20,
  maxOrderUsd: 4,
  maxOpenPositions: 1,
  maxSlippageBps: 300,
});
export interface PaperOrderRequest {
  spendUsd: number;
  cashUsd: number;
  openPositions: number;
  realizedDailyPnlUsd: number;
  slippageBps: number;
}
export function assertPaperOrderAllowed(order: PaperOrderRequest, policy: PaperRiskPolicy = DEFAULT_PAPER_RISK): void {
  const numbers = [...Object.values(order), ...Object.values(policy)];
  if (!numbers.every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('Invalid numeric risk input');
  if (policy.initialCashUsd <= 0 || policy.maxOrderUsd <= 0 || policy.maxOrderUsd > policy.initialCashUsd ||
      policy.maxOpenPositions < 1 || !Number.isInteger(policy.maxOpenPositions) ||
policy.maxSlippageBps < 0 || policy.maxSlippageBps >= 10000) throw new Error('Invalid risk policy');
  if (order.spendUsd <= 0 || order.spendUsd > policy.maxOrderUsd || order.spendUsd > order.cashUsd ||
      order.cashUsd < 0 || !Number.isInteger(order.openPositions) || order.openPositions < 0 ||
      order.openPositions >= policy.maxOpenPositions || order.slippageBps < 0 || order.slippageBps > policy.maxSlippageBps)
    throw new Error('Paper order blocked by risk policy');
}
