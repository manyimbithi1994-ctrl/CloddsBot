/** Pure read-only Pump.fun standard reserve reconciliation. Never authorizes trades. */
export function reconcileStandardPumpReserves(input: {
  curveTotalSupplyRaw: string;
  currentMintSupplyRaw: string;
  vaultBalanceRaw: string;
  realTokenReservesRaw: string;
}) {
  const values = [
    input.curveTotalSupplyRaw,
    input.currentMintSupplyRaw,
    input.vaultBalanceRaw,
    input.realTokenReservesRaw,
  ];
  if (values.some(value => typeof value !== 'string' || !/^[0-9]+$/.test(value))) {
    throw new Error('INVALID_RESERVE_AMOUNT');
  }
  const [curve, current, vault, real] = values.map(value => BigInt(value));
  const difference = vault - real;
  const matches = curve === 1000000000000000n &&
    difference === 206900000000000n &&
    current <= curve &&
    vault <= current &&
    real <= vault;
  return {
    status: matches
      ? 'STANDARD_PUMP_RESERVED_ALLOCATION_RECONCILED'
      : 'RESERVE_ALLOCATION_UNVERIFIED',
    differenceRaw: difference.toString(),
    supplyDifferenceRaw: (curve - current).toString(),
    matchesStandardAllocation: matches,
    paperEntryEligible: false,
    automatedTradingEligible: false,
  };
}
