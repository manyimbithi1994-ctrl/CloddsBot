/**
 * Read-only, bounded Pump.fun creation-event collector.
 * One program subscription, limited getTransaction requests, no trading imports.
 * Events are CANDIDATES until transaction instruction and mint are checked.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { WebSocket } from 'ws';

const PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const MAX_FETCHES = 30;
const DURATION_MS = 120_000;
const OUT = resolve('.paper-sessions/pump-creation-events.jsonl');
const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const rpcUrl = process.env.CLODDS_RESEARCH_RPC_URL;
if (!rpcUrl || !rpcUrl.startsWith('https://')) throw new Error('HTTPS CLODDS_RESEARCH_RPC_URL required');
const wsUrl = new URL(rpcUrl);
wsUrl.protocol = 'wss:';
mkdirSync(dirname(OUT), { recursive: true });
const seen = new Set<string>();
try {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as { signature?: string };
      if (record.signature) seen.add(record.signature);
    } catch { /* skip damaged line; no trust assigned */ }
  }
} catch { /* first run */ }
const socket = new WebSocket(wsUrl.toString(), { handshakeTimeout: 8000 });
let fetches = 0;
let closed = false;
const queue: string[] = [];
const queued = new Set<string>();
function stop(): void {
  if (closed) return;
  closed = true;
  socket.close();
  console.log(JSON.stringify({ status: 'STOPPED', fetched: fetches, pending: queue.length, output: OUT }));
}
const timer = setTimeout(stop, DURATION_MS);
socket.on('open', () => {
  socket.send(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'logsSubscribe',
    params: [{ mentions: [PROGRAM] }, { commitment: 'finalized' }]
  }));
  console.log('READ-ONLY Pump creation research stream started (120 seconds, 30 fetches maximum)');
});
socket.on('message', raw => {
  let msg: any;
  try { msg = JSON.parse(raw.toString()); } catch { return; }
  if (msg.id === 1 && msg.error) { console.error('Subscription rejected'); stop(); return; }
  const value = msg.params?.result?.value;
  if (!value || value.err || typeof value.signature !== 'string' || !Array.isArray(value.logs)) return;
  // Cheap hint only; authoritative verification happens on the transaction.
  if (!value.logs.some((s: unknown) => typeof s === 'string' && /Instruction: Create(V2)?\b/i.test(s))) return;
  if (seen.has(value.signature) || queued.has(value.signature)) return;
  if (fetches + queue.length >= MAX_FETCHES) return;
  queued.add(value.signature);
  queue.push(value.signature);
  void processQueue();
});
let working = false;
async function processQueue(): Promise<void> {
  if (working) return;
  working = true;
  try {
    while (!closed && queue.length && fetches < MAX_FETCHES) {
      const signature = queue.shift()!;
      queued.delete(signature);
      if (seen.has(signature)) continue;
      fetches++;
      try {
        const response = await fetch(rpcUrl!, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: fetches, method: 'getTransaction',
            params: [signature, { encoding: 'jsonParsed', commitment: 'finalized',
              maxSupportedTransactionVersion: 0 }] }),
          signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) throw new Error('RPC HTTP ' + response.status);
        const payload: any = await response.json();
        if (payload.error || !payload.result || payload.result.meta?.err !== null)
          continue;
        const tx = payload.result;
        const instructions = [
          ...(tx.transaction?.message?.instructions ?? []),
          ...(tx.meta?.innerInstructions ?? []).flatMap((g: any) => g.instructions ?? [])
        ];
        for (const instruction of instructions) {
          if (instruction.programId !== PROGRAM || !Array.isArray(instruction.accounts)) continue;
          // The mint is account #1 for Pump creation instructions.
          // Do not accept arbitrary program calls: require decoded instruction
          // discriminator in a subsequent verification stage.
          const mint = instruction.accounts[0];
          if (typeof mint !== 'string' || !mintPattern.test(mint)) continue;
          const record = {
            signature, mint, programId: PROGRAM, observedAt: new Date().toISOString(),
            status: 'UNVERIFIED_CREATION_CANDIDATE', automatedTradingEligible: false
          };
          appendFileSync(OUT, JSON.stringify(record) + '\n', { flag: 'a' });
          seen.add(signature);
          console.log(JSON.stringify(record));
          break;
        }
      } catch {
        console.error('Transaction lookup failed; signature not verified');
      }
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    if (fetches >= MAX_FETCHES) stop();
  } finally { working = false; }
}
socket.on('error', () => { console.error('WebSocket error; stopping'); stop(); });
socket.on('close', () => { closed = true; clearTimeout(timer); });
process.on('SIGINT', () => { clearTimeout(timer); stop(); });
