import { paperBuy, paperSell, type PaperAccount } from './paper-simulator';
import { assertPaperOrderAllowed, DEFAULT_PAPER_RISK, type PaperRiskPolicy } from './paper-risk';

/**
 * Offline-only stateful virtual trading engine. No wallet, RPC or network imports.
 * Not connected to the bot's live trading handlers.
 */
export class PaperTradingEngine {
  private account: PaperAccount;
  private positions = 0;
  private realizedDailyPnlUsd = 0;
  private readonly policy: PaperRiskPolicy;

  constructor(policy: PaperRiskPolicy = DEFAULT_PAPER_RISK) {
    this.policy = { ...policy };
    if (!Number.isFinite(policy.initialCashUsd) || policy.initialCashUsd <= 0) throw new Error('Invalid virtual balance');
    this.account = { cashUsd: policy.initialCashUsd, tokenQuantity: 0, entryCostUsd: 0 };
  }

  snapshot(): Readonly<PaperAccount & { openPositions: number; realizedDailyPnlUsd: number }> {
    return Object.freeze({ ...this.account, openPositions: this.positions, realizedDailyPnlUsd: this.realizedDailyPnlUsd });
  }

  restore(snapshot: ReturnType<PaperTradingEngine['snapshot']>): void {
    const {
      cashUsd,
      tokenQuantity,
      entryCostUsd,
      openPositions,
      realizedDailyPnlUsd
    } = snapshot;

    if (
      ![
        cashUsd,
        tokenQuantity,
        entryCostUsd,
        openPositions,
        realizedDailyPnlUsd
      ].every(value => typeof value === 'number' && Number.isFinite(value)) ||
      cashUsd < 0 ||
      tokenQuantity < 0 ||
      entryCostUsd < 0 ||
      ![0, 1].includes(openPositions) ||
      (openPositions === 0 && (tokenQuantity !== 0 || entryCostUsd !== 0)) ||
      (openPositions === 1 && (tokenQuantity <= 0 || entryCostUsd <= 0))
    ) {
      throw new Error('Invalid paper account snapshot');
    }

    this.account = {
      cashUsd,
      tokenQuantity,
      entryCostUsd
    };

    this.positions = openPositions;
    this.realizedDailyPnlUsd = realizedDailyPnlUsd;
  }

  buy(spendUsd: number, priceUsd: number, slippageBps = 100) {
    assertPaperOrderAllowed({
      spendUsd,
      cashUsd: this.account.cashUsd,
      openPositions: this.positions,
      realizedDailyPnlUsd: this.realizedDailyPnlUsd,
      slippageBps,
    }, this.policy);
    const fill = paperBuy(this.account, spendUsd, priceUsd, slippageBps);
    this.account = fill.account;
    this.positions += 1;
    return { quantity: fill.quantity, feeUsd: fill.feeUsd, executionPriceUsd: fill.executionPriceUsd };
  }

  sell(quantity: number, priceUsd: number, slippageBps = 100) {
    if (
      this.positions !== 1 ||
      !Number.isFinite(slippageBps) ||
      slippageBps < 0 ||
      slippageBps > this.policy.maxSlippageBps
    ) {
      throw new Error('Paper exit blocked');
    }
    const fill = paperSell(this.account, quantity, priceUsd, slippageBps);
    this.account = fill.account;
    this.realizedDailyPnlUsd += fill.realizedPnlUsd;
    if (fill.account.tokenQuantity === 0) this.positions = 0;
    return { realizedPnlUsd: fill.realizedPnlUsd, feeUsd: fill.feeUsd, executionPriceUsd: fill.executionPriceUsd };
  }
}
