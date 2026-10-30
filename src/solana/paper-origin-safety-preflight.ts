/** Manually run bounded origin + mint-safety inspection; never trades. */
import { discoverSolanaCandidates } from './paper-token-discovery';
import { inspectPumpOrigin } from './paper-origin-verifier';
import { inspectMintSafety } from './paper-mint-safety';

async function main(): Promise<void> {
  const rpc = process.env.CLODDS_RESEARCH_RPC_URL;
  if (!rpc || !rpc.startsWith('https://'))
    throw new Error('Set CLODDS_RESEARCH_RPC_URL to an HTTPS Solana RPC endpoint');
  const max = Number(process.argv[2] ?? 3);
  if (!Number.isSafeInteger(max) || max < 1 || max > 10)
    throw new Error('Specify 1..10 tokens');
  const discovery = await discoverSolanaCandidates();
  const candidates = discovery.candidates.slice(0, max);
  console.log('READ-ONLY origin/safety preflight:', candidates.length, 'candidates');
  for (const candidate of candidates) {
    const origin = await inspectPumpOrigin(candidate.mint, rpc);
    // Origin currently cannot be positively established. Do not perform
    // extra RPC calls for safety unless a creation proof is available.
    console.log(JSON.stringify({ mint: candidate.mint, origin,
      safety: 'DEFERRED_UNTIL_ORIGIN_VERIFIED', automatedTradingEligible: false }));
    if (origin.status === 'VERIFIED_PUMP_FUN') {
      const safety = await inspectMintSafety(candidate.mint, rpc);
      console.log(JSON.stringify({ mint: candidate.mint, safety,
        automatedTradingEligible: false }));
    }
    await new Promise<void>(resolve => setTimeout(resolve, 1200));
  }
}
void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Preflight failed');
  process.exitCode = 1;
});
