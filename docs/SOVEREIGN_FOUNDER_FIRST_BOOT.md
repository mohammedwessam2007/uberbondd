# UberBond Sovereign Founder First Boot

This runbook exists for one transition only:

`SOURCE EXISTS -> OWNER-CONTROLLED MACHINE -> DIRECT FOUNDER DIALOGUE -> BOUNDED SELF-COMPLETION`

It does not create a second UberBond architecture. It composes the existing sovereign authoring node, owner-supplied offline llama runtime, Founder Console, isolated worker, independent verifier, local promoter and canonical bootstrap doctor.

## What must physically exist

On one owner-controlled Linux machine with systemd, Node.js >=20, npm, Git and the prerequisites already required by `ops/sovereign/install-authoring-node.sh`:

1. a clean exact UberBond checkout with prepared `node_modules`;
2. an owner-supplied `llama-server` executable;
3. an owner-supplied GGUF model file;
4. a stable model identity chosen by the owner;
5. optionally, the machine's specific RFC1918 LAN IPv4 address if the Founder Console should be reachable from an iPad/phone on the same trusted private network.

No model or binary is silently downloaded by the bootstrap. GitHub, Vercel and a public-cloud model are not dependencies of the resulting local self-completion brainstem.

## One command

The repository entrypoint is tracked as an executable file. From the clean source checkout:

```sh
sudo ./ops/sovereign/bootstrap-founder-node.sh \
  /path/to/uberbond \
  /path/to/llama-server \
  /path/to/model.gguf \
  YOUR_MODEL_ID \
  192.168.1.50
```

Omit the final IP to keep the Founder Console loopback-only.

When a private-LAN address is supplied, the existing private-console configurator generates a strong founder token and prints it once. Store that token in the owner's password manager. The server refuses wildcard/public bind addresses.

## What the command proves before it says READY

The wrapper refuses success unless the canonical bootstrap doctor independently observes all of these on the exact installed source:

- source stack complete;
- authoring host installed;
- authoring automation active;
- direct Founder Console reachable;
- owner-controlled local model attested;
- isolated worker ready;
- direct founder dialogue ready;
- self-completion loop ready.

It persists the doctor receipt at:

`/var/lib/uberbond-control/bootstrap-doctor.json`

It then performs one explicit wake and persists the result at:

`/var/lib/uberbond-control/bootstrap-first-wake.json`

The wake may dispatch a new task or resume an already-started digest-bound attempt. Continuation law forbids manufacturing a duplicate same-base task merely because the bootstrap issued another wake.

## Founder interaction

Open:

`http://<owner-machine-private-ip>:8787/`

Unlock with the founder token if private-LAN mode is enabled, then use normal language. For example:

`Keep working.`

Founder messages are founder intent, not automatic consequence authority. The local model can talk directly to the founder and the bounded engineering loop can work through exact-current canonical finite requirements. The worker, verifier, promoter, release signer and runtime deployment authority remain separated.

## Relationship to the whole UberBond vision

The current finite tribunal includes life-scale Personal Civilization and Sovereign Cognitive Continuum requirements, not only commercial software. The sovereign worker therefore attacks the declared internal engineering requirements that remain open in current canon while preserving external, owner, elapsed-time and lived-reality boundaries.

Perpetual Frontier / GENESIS remains the open-ended discovery layer beyond any declared finite engineering denominator. Finite source completion must never be mislabeled as final human, commercial, scientific or civilizational completion.

## What this cannot manufacture

Even a successful first boot does not itself prove:

- a separately signed sovereign runtime deployment rehearsal;
- real customer demand or cleared payment;
- accepted delivery or retention;
- longitudinal life improvement;
- correct forecasts over elapsed real time;
- system-level ASI or unrestricted autonomy.

Those require their own evidence. The purpose of this first boot is narrower and concrete: the founder stops needing ChatGPT, Claude, GitHub or Vercel as the mandatory continuation brainstem and can communicate with UberBond directly on owner-controlled compute while UberBond continues its bounded self-completion loop.
