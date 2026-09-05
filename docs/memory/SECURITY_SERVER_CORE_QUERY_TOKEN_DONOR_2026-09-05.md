# Security server-core query-token donor receipt

This receipt preserves the exact pre-hardening canonical `server-core.mjs` implementation and its explanatory provenance under UberBond's permanent no-amputation law.

- Source PR: #393
- Source branch: `gpt/admin-ephemeral-core-20260905`
- Pre-hardening branch head: `062e9e8f875e835d967bdffae961252948d7f3ea`
- Exact historical `server-core.mjs` blob: `635d0f610a4b011f57a0961bbd1eacb407b42bfd`
- Hardening commit: `c91ac12e685187313840a894eece9ade2ee1622c`

The historical blob remains recoverable byte-for-byte through Git history. Its server/store/queue/scheduler/routing mechanisms remain donated to the active implementation. The only mechanism intentionally superseded is privileged admin authentication through `?token=` query-string fallback. Public capability-token flows such as unsubscribe/report remain a separate authority class and are preserved.

The hardening commit also compressed comments in the callable copy while making the surgical auth change. Those comments remain recoverable in the exact historical blob above; this receipt prevents that provenance from being silently lost or mistaken for deleted capability.
