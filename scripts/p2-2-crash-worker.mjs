// Standalone child process for a real crash-recovery test (see tests/p2-2-postgres-race.test.mjs).
// Deliberately hangs mid-stage so the parent test can SIGKILL this process before any checkpoint
// for that stage is written, then verify a different process correctly resumes from scratch.
import { PostgresStore } from '../src/store.mjs';
import { runAutonomyCycle } from '../src/autonomy-cycle.mjs';

const databaseUrl = process.env.DATABASE_URL;
const runKey = process.env.P22_RUN_KEY || 'crash-worker-run';
const leaseOwner = process.env.P22_LEASE_OWNER || 'crash-worker';
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const store = new PostgresStore({ databaseUrl, ssl: false });
await store.init();

const hangingReader = {
  listMessages: () => new Promise(() => {}), // never resolves -- this process gets killed while awaiting this
  getMessage: async () => ({ data: {} })
};

process.stdout.write('crash-worker: starting cycle\n');
await runAutonomyCycle({
  store,
  cfg: {
    encryptionKey: 'key',
    inbound: {
      provider: 'test', enabled: true, gmailReadEnabled: true,
      limits: {
        maxPagesPerCycle: 5, maxMessagesPerPage: 25, maxMessageBytes: 2 * 1024 * 1024,
        maxMimeDepth: 10, maxMimePartCount: 200, maxDecodedBodyBytes: 262144,
        maxStageRuntimeMs: 60000, maxCycleRuntimeMs: 300000, maxStageRetries: 3,
        maxOwnerExceptionsPerCycle: 25, maxSummaryBytes: 8192, leaseTtlMs: 5000
      }
    }
  },
  runKey, leaseOwner, mailboxReader: hangingReader, accounts: [{ id: 'acct-1', tokens: {} }]
});
process.stdout.write('crash-worker: finished (should not print -- this process is expected to be killed)\n');
