# World Capability Ecosystem Evidence Package — 2026-08-31

Research state: sufficient to support the foundation architecture; not a completed world-corpus import

Claim classes: official specification, peer-reviewed evidence, accepted paper, preprint, source-code evidence, creator claim, or UberBond measurement

## Executive findings

1. The public universe is already in the millions of skill-file occurrences, but directory and research-corpus counts are overlapping and non-comparable. UberBond must never sum them as a unique-capability count.
2. Exact copying is extensive. GitSkills reports 3,797,117 occurrences and 1,877,981 distinct content hashes, implying roughly half the occurrences are exact-content repeats. Repository counts therefore badly overstate behavioral diversity.
3. Registries solve discovery and namespace metadata, not safety, license compatibility, authority, runtime health, or economic value.
4. Retrieval is a separate technical problem. Title/description search is insufficient; typed multi-field retrieval, dependency graphs, reranking, full-body review, and execution evidence are required.
5. Natural-language instructions, executable code, dependencies, tool outputs, memory, and cross-tool composition all carry attack surface. No single scanner or sandbox run can confer safety.
6. Continual skill learning has no universal winner. Self-feedback can drift. Production improvement must remain a candidate/holdout/promotion/rollback pipeline.
7. Model routing works only when calibrated to representative local tasks. A small transparent configured supplier set can outperform a large opaque ensemble.
8. Generic benchmarks are useful engineering evidence but do not establish cleared contribution profit, customer acceptance, or 24/7 autonomy.

## Scale and directories

| System/evidence | Solves | Observed claim/evidence | Does not solve |
|---|---|---|---|
| [Agent Skills specification](https://agentskills.io/specification) and [reference repository](https://github.com/agentskills/agentskills) | Portable `SKILL.md` contract and progressive-disclosure structure | Official specification | Trust, behavioral equivalence, licensing conclusion, or authority |
| [Anthropic progressive skill loading](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) | Context-efficient skill loading | First-party engineering description | World identity, immune system, economic fitness |
| [Official MCP Registry](https://modelcontextprotocol.io/registry/about) | MCP server metadata, namespaces, and downstream discovery | Official preview registry; downstream clients expected | Safety certification or production admission |
| [SkillsMP](https://skillsmp.com/) | Large public skill-file directory | Creator claim: 2,872,898 collected files on observation date | Independently reproduced unique capability count or safety |
| [skills.sh](https://skills.sh/) and [Vercel skills repository](https://github.com/vercel-labs/skills) | Open discovery/install workflow | First-party directory/tooling | Activation proof, behavior equivalence, production authority |
| [GitSkills](https://arxiv.org/abs/2608.10906) | Large-scale research snapshot | Paper reports 3,797,117 occurrences from 282,200 repos and 1,877,981 content hashes | Live UberBond import or non-overlapping universe count |
| [GitHub `gh skill`](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/) | Source and installation provenance pattern | First-party product evidence | Safety, license conclusion, benchmark evidence |
| [OpenAI Codex skills](https://developers.openai.com/codex/build-skills) and [skills/plugins](https://developers.openai.com/codex/skills-and-plugins) | Agent-native capability packaging | First-party docs | Cross-ecosystem canonical identity |
| [Claude Code skills](https://code.claude.com/docs/en/skills) and [plugins](https://code.claude.com/docs/en/plugins-reference) | Skill and plugin packaging | First-party docs | Installation equals activation; a [reported issue](https://github.com/anthropics/claude-code/issues/59385) illustrates the distinction |
| [GitHub Copilot agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) | Skills in another major host | First-party docs | Unified capability graph |

Directory totals are retained with their own unit, date, source, and claim class. They are not additive. UberBond's measured world-import count remains zero.

## Retrieval, identity, dedupe, and composition

- [Retrieval Models Aren't Tool-Savvy](https://aclanthology.org/2025.findings-acl.1258/) is peer-reviewed evidence that conventional IR performs poorly on tool retrieval and that retrieval quality changes downstream success. It contributes 7,600 tasks over 43,000 tools.
- [Multi-Field Tool Retrieval](https://arxiv.org/abs/2602.05366) argues that function, input constraints, and output form deserve separate retrieval fields. UberBond therefore types atoms, inputs, outputs, permissions, dependencies, and environment.
- [SkillRet](https://arxiv.org/abs/2605.05726) reports 17,810 skills and 4,997 queries, supporting a dedicated held-out retrieval benchmark rather than a catalog-only test.
- [ToolRefiner](https://arxiv.org/abs/2409.02141) and [GRETEL](https://arxiv.org/abs/2510.17843) support a cheap-retrieval/deep-rerank/execution-feedback cascade. ToolBench's unnatural random multi-tool pairings weaken benchmark-only claims.
- [TaskBench](https://arxiv.org/abs/2311.18760), [ToolSandbox](https://aclanthology.org/2025.findings-naacl.65/), and [MCP-Universe](https://arxiv.org/abs/2508.14704) support dependency-aware, stateful evaluation with prohibited-effect minefields.
- [Latent Reuse in Agent Skills](https://arxiv.org/abs/2603.22447) combines metadata, instructions, and code and reports F1 0.939 on a 300-pair benchmark. Similarity identifies clone/substitute families; it does not establish copying direction or authoritative lineage.
- [GitHub's repository API](https://docs.github.com/en/rest/repos/repos) exposes fork parent/source, while [Software Heritage identifiers](https://docs.softwareheritage.org/devel/swh-model/persistent-identifiers.html) separate persistent content, directory, revision, release, and snapshot identity. Identity evidence does not prove trust.
- [Skills Are Not Islands](https://arxiv.org/abs/2607.01136) reports nonunique names and mixed skill/package/service dependencies and motivates a SkillBOM. UberBond treats names as aliases and keys dependencies to source/revision/hash.
- [SkillResolve](https://arxiv.org/abs/2606.10388), [SkillFlow](https://arxiv.org/html/2504.06188v2), [Graph-of-Skills](https://arxiv.org/html/2604.05333v3), and [group-structured retrieval](https://arxiv.org/html/2605.06978v1) were reviewed as adjacent approaches. Their useful mechanisms—structured resolution, workflow composition, graph retrieval, and group constraints—are supplier patterns, not production proof.

## Security and supply chain

- [OpenAI's agent safety guide](https://developers.openai.com/api/docs/guides/agent-builder-safety) and [MCP guidance](https://developers.openai.com/api/docs/mcp) describe prompt injection as an unresolved data-flow/authority problem: a benign-looking MCP may receive sensitive arguments and tool annotations may be false.
- The [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) requires audience validation and prohibits token passthrough. [MCP security practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices) document confused-deputy risk. OAuth does not constrain local stdio process privileges.
- [Do Not Mention This to the User](https://arxiv.org/abs/2602.06547), accepted at USENIX Security 2026, reports 157 confirmed malicious skills and 632 vulnerabilities among 98,380 skills from two registries using static and dynamic verification.
- [MalSkillBench](https://arxiv.org/abs/2606.07131) includes 3,944 malicious and 4,000 matched benign skills and reports that strong code-injection detectors can collapse on prompt/agent-control attacks. Code-only and prompt-only scanning each miss part of the threat model.
- [AgentDojo](https://arxiv.org/abs/2406.13352), [InjecAgent](https://aclanthology.org/2024.findings-acl.624/), and [Agent Security Bench](https://arxiv.org/abs/2410.02644) span indirect injection, user/tool attacks, memory attacks, and many tools. Their attack rates are configuration-specific; their coverage categories inform hostile fixtures.
- [ColluSkill](https://arxiv.org/abs/2608.09732) motivates composition-level security: independently benign suppliers may become unsafe in combination.
- [Zenity AI Total](https://zenity.io/research/ai-total) and its [skill-supply-chain analysis](https://labs.zenity.io/post/attackers-target-agents-via-the-skill-supply-chain) are vendor research, retained as a lower evidence class than peer-reviewed/independently reproduced results.

Complementary scanners include [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector), [Snyk agent-scan](https://github.com/snyk/agent-scan), [Cisco MCP Scanner](https://github.com/cisco-ai-defense/mcp-scanner), [AntGroup MCPScan](https://github.com/antgroup/MCPScan), [OSV-Scanner](https://github.com/google/osv-scanner), [Semgrep taint analysis](https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/overview), [CodeQL data-flow analysis](https://codeql.github.com/docs/writing-codeql-queries/about-data-flow-analysis/), and [Trivy filesystem scanning](https://trivy.dev/docs/latest/target/filesystem/). Version/hash pin each scanner. Snyk documents that scanning an MCP configuration may execute its defined command, so scanners themselves require isolation and explicit telemetry controls.

## Provenance and licensing

- [SLSA v1.2](https://slsa.dev/spec/v1.2/) and [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations) describe build provenance and signed claims.
- [SPDX 3.0.1](https://spdx.github.io/spdx-spec/v3.0.1/conformance/) and [CycloneDX](https://cyclonedx.org/specification/overview/) represent components, dependencies, services, and licenses.
- [in-toto](https://github.com/in-toto/in-toto) and [Sigstore/Cosign](https://docs.sigstore.dev/cosign/verifying/verify/) support signed step/material/product and identity/transparency-log evidence.

These standards are complementary. A signature or attestation proves a claim's identity/integrity, not benevolence, safety, commercial-license compatibility, or runtime behavior. SLSA acknowledges best-effort dependency resolution.

[GitHub licensing guidance](https://docs.github.com/articles/licensing-a-repository) confirms that absent a license, default copyright applies. [Licensee](https://github.com/licensee/licensee), [ScanCode](https://scancode-toolkit.readthedocs.io/en/stable/explanation/scancode-license-detection.html), [SPDX matching](https://spdx.github.io/spdx-spec/v2.3/license-matching-guidelines-and-templates/), [REUSE 3.2](https://reuse.software/spec-3.2/), and [ClearlyDefined](https://docs.clearlydefined.io/docs/curation/curation-guidelines) support complementary declared/detected/per-file/concluded evidence. Automated detection is not legal advice.

## Learning, routing, evaluation, and economics

- [SkillLearnBench](https://arxiv.org/abs/2604.20087) evaluates 20 verified tasks and finds no continual-learning method consistently best; external feedback helps while self-feedback can recursively drift. This supports candidate-only self-improvement.
- [Agent Workflow Memory](https://arxiv.org/abs/2409.07429) reports web-navigation gains from reusable workflows. Such memory remains a retrievable candidate under normal gates, never autonomous authority.
- [RouteLLM](https://www.lmsys.org/blog/2024-07-01-routellm/) demonstrates cost/quality tradeoffs but degrades out of domain without representative labels. [LLMRouterBench](https://aclanthology.org/2026.findings-acl.1881/) covers more than 400,000 instances, 21 datasets, and 33 models and reports that sophisticated routers often fail to reliably beat simple baselines. UberBond starts with transparent configured routes and local capability × model × task evidence.
- [BFCL v4](https://gorilla.cs.berkeley.edu/leaderboard.html) provides objective function-call and multi-turn evidence. It does not establish security or business value.
- [OpenAI's SWE-bench Verified analysis](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/), [Search-Time Contamination](https://arxiv.org/abs/2508.13180), and [LiveCodeBench](https://livecodebench.github.io/) support private rotating holdouts, time splits, canaries, retrieved-content logging, and stale-benchmark expiry.
- [OpenAI GDPval](https://openai.com/index/gdpval/) uses 1,320 tasks across 44 occupations and nine industries with experienced-professional review. [METR time horizons](https://metr.org/time-horizons/) explicitly measure human-task duration at a success probability, not wall-clock autonomous runtime, and warn that long messy work is underrepresented.
- [TheAgentCompany](https://arxiv.org/abs/2412.14161) and [Vending-Bench 2](https://andonlabs.com/evals/vending-bench-2) provide useful long-horizon stress tests. Simulated balances are never revenue.

## Adjacent production systems reviewed

| Class | Systems | Reusable mechanisms | Boundary |
|---|---|---|---|
| Durable orchestration | [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview), [Temporal](https://docs.temporal.io/ai), [Google ADK](https://google.github.io/adk-docs/), [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/), [CrewAI](https://docs.crewai.com/), [Mastra](https://mastra.ai/docs/) | state, retries, durable workflow, multi-agent contracts | orchestration is not capability admission or economic proof |
| Agent SDKs | [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/), [Anthropic Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk) | tool contracts, tracing, bounded workers | host-specific contracts do not resolve world identity |
| Model routing | [LiteLLM router](https://docs.litellm.ai/docs/routing), [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) | configured fallbacks, cost/latency routing | routing is not quota evasion and must preserve provider identity |
| Browser action | [Playwright](https://playwright.dev/), [Stagehand](https://docs.browserbase.com/welcome/quickstarts/stagehand) | deterministic and model-assisted browser suppliers | public access and action authority remain separate |
| Evaluation/observability | [Promptfoo](https://www.promptfoo.dev/docs/intro/), [Phoenix](https://arize.com/docs/phoenix), [Braintrust](https://www.braintrust.dev/docs/evaluate), [OpenTelemetry GenAI](https://opentelemetry.io/blog/2026/genai-observability/) | eval cases, traces, cost/latency evidence | observation can leak secrets if not data-classed |
| Existing UberBond seeds | [Claude-Mem](https://github.com/thedotmack/claude-mem), [Headroom](https://github.com/headroomlabs-ai/headroom), [OmniRoute](https://github.com/diegosouzapw/OmniRoute), [Agent Reach](https://github.com/Panniantong/agent-reach), [Strix](https://github.com/usestrix/strix) | memory, compression, routing, reach, security | registry/project integration is not installed/configured/healthy runtime proof |

Relevant open issues were retained as maintainer-health signals, not universal verdicts: [Claude-Mem #1251](https://github.com/thedotmack/claude-mem/issues/1251), [Headroom #1158](https://github.com/headroomlabs-ai/headroom/issues/1158), and OmniRoute [#258](https://github.com/diegosouzapw/OmniRoute/issues/258) / [#2863](https://github.com/diegosouzapw/OmniRoute/issues/2863).

## Rejected approaches

- **Install 50,000 skills:** rejected for context, dependency, conflict, security, maintenance, and authority burden.
- **Sum directory counts:** rejected because units, snapshots, overlap, and exact copies differ.
- **Trust popularity or registry admission:** rejected; neither is a security or economic certification.
- **One scanner:** rejected because instruction, code, dependency, runtime, memory, retrieval, and composition attacks differ.
- **Run frontier models over every raw artifact:** rejected; marginal information per dollar demands deterministic/hash/metadata/lexical/embedding/classifier cascades.
- **Use generic benchmark rank as business rank:** rejected; customer payment, acceptance, renewal, founder minutes, and contribution costs are separate evidence.
- **Silent self-editing from execution traces:** rejected due drift, poisoning, and missing holdout evidence.
- **Put raw corpus in Git or brain context:** rejected for scale, freshness, confidentiality, and context utility.
- **Clone whole supplier products:** rejected unless recurring atom economics justify native ownership.

## Cost and scale assumptions

The foundation deliberately avoids invented dollar totals. A scaled pilot must meter actual API calls, bytes, embeddings, model tokens, sandbox seconds, storage, egress, index size, and maintainer minutes. The intended cascade is:

`revision/hash/change filter -> deterministic manifest/license/package parsing -> exact/fork/package dedupe -> lexical index -> embeddings/cheap classifier -> deep semantic/security review -> sandbox/benchmark only for finalists`

Incremental refresh uses source cursors, revisions, hashes, and timestamps. Urgent signed revocation intelligence bypasses the normal cadence; unchanged artifacts are not reprocessed.

## Decisions supported by the evidence

The evidence supports the implemented foundation: typed full-body retrieval, immutable provenance, layered family dedupe, dependency/compatibility graph, independent security layers, deterministic authority admission, model-aware routing, rotating holdouts, candidate-only learning, explicit lifecycle/revocation, measured execution receipts, and creator-claim separation.

It does **not** support claims that UberBond has analyzed millions of artifacts, secured every supplier, activated the optional runtimes, proven contribution profit, or achieved unattended world refresh.
