# ChatGPT relay producer/reviewer

`src/chatgpt-relay-client.mjs` is the bounded ChatGPT-side socket for the
existing UberBond relay. It does not create a second task registry or run a
model. It performs four operations:

1. health-check the relay;
2. compile and enqueue one canonical `AgentTask` for `claude-code`;
3. read one task by issue number;
4. poll a bounded number of times for a validated worker receipt.

The client forces `LOCAL_PREPARATION`, fixes the producer identity to
`chatgpt`, fixes the default consumer to `claude-code`, and reuses the existing
secret scanner, task compiler, result validator, and zero-effect ledger. It
accepts only HTTPS `/api/agent-relay` endpoints. The bearer credential stays in
the client closure and is never returned or added to task state.

```js
import { createChatgptRelayClient } from './src/chatgpt-relay-client.mjs';

const relay = createChatgptRelayClient({
  endpoint: 'https://uberbond-relay.vercel.app/api/agent-relay',
  bearerToken: ownerSuppliedSecret
});

const queued = await relay.createTask({
  objective: 'Run the bounded repository verification gate.',
  requiredOutputs: ['outcome', 'tests actually run', 'truth table'],
  acceptanceTests: ['npm run check passes'],
  evidenceRefs: ['test:relay-verification'],
  budget: { maxTokens: 20000, maxCostCents: 0 }
});

const reviewed = await relay.waitForResult({
  issueNumber: queued.issueNumber,
  expectedTaskId: queued.taskId,
  maxPolls: 10,
  pollIntervalMs: 1000
});
```

This example is wiring documentation, not a live execution receipt. The
production relay remains unavailable until its separately controlled Vercel
secrets are configured and a real health check returns `READY`.
