# PHOENIX: verified Docker and Chromium addendum (2026-10-22)

**LATEST LOCAL RUNTIME EVIDENCE; supplements/supersedes the Docker and browser environment-blocker statements in the prior Commercial Omega checkpoint and Claude review packet.** Initial source base PR #1536 head `250685ca414c392913f263d3bb6182ce74556fe0`; child PR #1537 source at the time of new test `883a33ecd5d930a49ae8706582aeb1df3f5bcd19`. This is a documentation-only evidence addendum; no subsequent source edits in this addendum. GitHub branch and PR truth must be refreshed.

## Isolated reproducible Actor Docker build: VERIFIED LOCALLY

The original system Docker daemon suffered ENOSPC at `/var/lib/containerd`. Without deleting or modifying its unrelated images, worktrees or archives, an independent Docker daemon was launched with data and exec roots under `/tmp`, socket `/tmp/omega-overlay.sock`, `overlay2` filesystem, no new payment or cloud infrastructure. The first temporary VFS attempt was cancelled due to wasteful layer copying; it did not produce a valid image and its temporary data was not a project source of truth.

**Two separate successful builds from `actors/verified-inquiry-defects/Dockerfile`, using `apify/actor-node-playwright-chrome:22`:**

- First full clean isolated build: exit 0, image `sha256:cd7d021dade4b6267b4c6661061344d0737b48945994f4ee389b63ebb5cd0f2b`.
- Second build with `--no-cache`: exit 0, image `sha256:f464aacca321ddedfe01df8e93073f299a80bb41239e12151e317fb082b80086`.
- Both ran Actor-specific locked `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` and installed 203 runtime packages. Image digests need not match because Docker filesystem timestamps/build outputs can vary; npm dependency resolution matched earlier in two clean installs.
- A real Actor cold start ran in the second image with an `https://example.com/` delivery-only input: **exit 0**, `SALE_RECEIPT.json` with **chargingMode DELIVERY_ONLY, requested=0, delivered=0, charged=0**, plus `AUDIT_REPORT_MARKDOWN.json` and `AUDIT_REPORT_HTML.json`. No provider payment, customer or spend.
- **Important container fixture contract:** The image runs as UID 996 `myuser`, working directory `/home/myuser`. The mock input must be mounted with readable permissions at `/home/myuser/storage/key_value_stores/default/INPUT.json`. Merely setting `APIFY_LOCAL_STORAGE_DIR=/tmp/local-actor-storage` for a bind mount did not make the SDK read that input; an initial container run failed the maxSites input check. Mounting under the working directory fixed the fixture and passed.

## Real browser smoke: VERIFIED LOCALLY, accuracy not certified

Host Playwright launch remained blocked by `SIGTRAP` / crashpad, but **Chromium executed successfully inside the actual Actor Docker image** using `witnessRuntimeTelLinks` on the public Reliant site. First smoke: exit 0; **pageLoads=1, blockedRequests=4, clicks=0, formSubmissions=0, messages=0** in about 2,039ms. This establishes practical browser startup and enforced read-only network routing, not that any target defect is independently accurate.

Actual container memory-tier, direct-browser-witness measurements (single public page, CPU 2 vCPUs, cgroup v2 memory.current sampled every ~35ms):

| Docker memory limit | Wall-clock | Peak sampled container memory | Page loads | Blocked requests | Calls/forms/messages |
|---|---:|---:|---:|---:|---:|
| 2 GB | 2,375ms | 303,165,440 bytes (~289 MiB) | 1 | 15 | 0 |
| 4 GB | 2,071ms | 345,800,704 bytes (~330 MiB) | 1 | 12 | 0 |

These were **separate local Docker container limits**, not Apify CU charges, not a statistically stable throughput estimate, and not a successful independent defect re-verification. Result witness items were empty in both direct runs; no finding was charged or confirmed.

Four static-probe Docker runs also operated at container memory limits 2GB and 4GB, with the browser option passed on/off, but every run reported `witnessUsed=false` because no contested link triggered it. They are therefore **not** browser-on cost comparisons. Exact wall durations: 2GB off 1,051ms, 2GB on 711ms (not invoked), 4GB off 358ms, 4GB on 674ms (not invoked). Do not infer speed benefit from these four uncontrolled single-site timings.

## Revised gate ledger

- **W1 Actor packaging: PASS LOCAL** (two actual clean Docker builds, one no-cache; Actor cold start and zero-charge receipt).
- **W2 Runtime and website defenses: PARTIAL** (positive live browser smoke and hostile unit fixtures; complete 10-case real hostile-browser matrix/long-run resource soak still missing).
- **W3 Reports: IMPLEMENTED LOCAL**, historical report remains a sample, not client accepted.
- **W4 Financial integrity: IMPLEMENTED LOCAL, CLAUDE REVIEW REQUIRED**, production provider authority not connected.
- **W5 Economics: PARTIAL**, real Docker 2GB/4GB container browser observations added, but billed Apify CU, 40-site browser witness, support and conversion distributions unknown; historical negative median and Store median scenario must not be overwritten.
- **W6 Independent quality: FAIL ACCEPTANCE**, 4 parser-corroborated syntactic observations, 0 human-supported business defects, buyer reproduction and precision unknown.
- **W7 Store readiness: PARTIAL**, no authorized price/provider/production PostgreSQL/Apify publish.
- **W8 Buyer pilot: PREPARED ONLY**, three drafts from PR #1535 still UNSENT and unapproved.

**Stage ledger:** ENGINEERING READY PARTIAL; STORE READY PARTIAL; PRODUCTION DEPLOYED NOT VERIFIED; BUYER VALIDATED NOT VERIFIED; DELIVERY ACCEPTED NOT VERIFIED; CLEARED CONTRIBUTION PROFIT $0. Full deterministic repository suite did not complete; final 108/108 affected test selection passed with real local PostgreSQL. Hosted PR CI may change and must be refreshed. Vercel account-level deployment was blocked when last checked.

**Environment preservation:** The live Chat On Steroids tunnel stopped polling while this addendum was being persisted, therefore no further shell/commit success is asserted beyond the explicit GitHub save receipt. The original dirty root checkout was not touched, no unrelated worktrees or files deleted, no external outreach/accounts/spend/payment activity, no merge. Claude independent review has **not** occurred.

**Next trusted retrieval:** Review this file together with `docs/commercialization/CLAUDE_REVIEW_OMEGA_2026-10-22.md`, `docs/commercialization/PHOENIX_OMEGA_2026-10-22.md`, draft PR #1537, latest GitHub CI, PR #1535 and PR #1536. Do not downgrade new Docker success to the earlier historical ENOSPC story; do not promote local smoke to production approval.
