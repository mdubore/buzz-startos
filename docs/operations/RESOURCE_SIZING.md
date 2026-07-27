# Production Resource Measurement

This protocol turns `RES-01` into a repeatable workload rather than a subjective
observation. Its machine-readable source is
[`RESOURCE_PROFILE.production-v1.json`](../testing/RESOURCE_PROFILE.production-v1.json).
The profile represents a small active workspace; it is not a maximum supported
capacity.

This protocol does not establish a hardware minimum until complete, reviewed
measurements exist. `hardwareMinimums` remains `null`, and the repository must not
publish CPU, memory, or disk minimums inferred from estimates or a partial run.

## Test Systems

Run the complete profile on physical x86_64 and physical aarch64 systems. For
each system, record:

- device and storage model, architecture, CPU model/core count, memory bytes, and
  storage kind/capacity;
- official stable StartOS `0.4.0` reported version, build ID, source, image hash,
  kernel, and available storage before the run;
- immutable Buzz candidate identity and native archive hash;
- ambient/thermal constraints, power mode, and any other running service;
- load-generator host, operating system, client versions, and network topology.

Use the same candidate and workload generator revision for both architectures.
Do not run unrelated workloads on the StartOS host. Synchronize clocks before
measurement.

## Fixed Workload

Create deterministic synthetic data with a retained generator seed:

| Dimension         |                                   Required scale |
| ----------------- | -----------------------------------------------: |
| Nostr identities  |          20 total: 1 owner, 2 admins, 17 members |
| Channels          |                                               10 |
| Signed events     |                                          100,000 |
| Media             |                    1,000 objects totaling 10 GiB |
| Git               | 5 repositories, 1,000 commits total, 2 GiB total |
| WebSockets        |                        20 concurrent connections |
| Active publishers |                                               10 |
| Active readers    |                                               10 |
| Media workers     |                                                2 |
| Git workers       |                                                2 |

Distribute deterministic events, media, and Git changes across every channel and
identity permitted by its role. Include representative messages, threads,
reactions, searches, membership reads, media GET/HEAD, repository clones/fetches,
and authenticated writes. Do not include private or production data.

Before measurement, verify every generated event signature, media SHA-256, and
Git ref/object ID. Store a sanitized inventory hash for later comparisons.

## Measurements

Collect five-second samples from the StartOS host and every package container for
the entire run. Retain raw, timestamped data and record:

- host and per-container CPU utilization;
- host memory and per-container resident memory;
- each persistent volume's used bytes and growth;
- disk read/write bytes and network receive/transmit bytes;
- time from start request to healthy status;
- request count, error count, and latency by WebSocket, HTTP/media, and Git
  operation;
- backup/restore elapsed time and transferred/stored bytes;
- unexpected process exits, restarts, health transitions, and client disconnects;
- state inventory hashes before and after persistence, backup, restore, and soak
  phases.

For latency, CPU, memory, and I/O summaries report count, min, max, mean, p50,
p95, and p99. Preserve raw samples so another reviewer can reproduce the
percentiles. Treat missing samples, clock discontinuities, generator errors, and
measurement-tool saturation as invalid-run issues.

Never collect environment variables, command lines containing credentials,
authentication headers, private Nostr keys, database contents, or unredacted
restore diagnostics.

## Protocol

### 1. Cold Start

With the fixed workload already stored, perform five clean service starts. For
each start, begin sampling before the request, wait for all private services and
Buzz health, record time to healthy, run one authenticated read from each data
plane, then stop cleanly.

Every start must become healthy within 180 seconds without manual intervention,
unexpected restart, or state mismatch.

### 2. Idle

After a ten-minute warm-up, keep clients disconnected for 30 minutes. Continue
sampling all resources and health transitions. Use this interval to establish
idle CPU, memory, I/O, and storage baselines, not to subtract inconvenient load
from later results.

### 3. Representative Load

Run the fixed concurrency for 60 minutes. Maintain 20 WebSockets while ten
publishers and ten readers exercise channel events; two media workers alternate
authenticated upload and content-addressed reads; two Git workers alternate
fetch, push, and clean clone. Record achieved operation counts and errors rather
than assuming the generator reached its configured rate.

Verify a sample of signatures, media bytes, and Git objects during the phase and
the complete inventory afterward.

### 4. Full Backup

Create a StartOS backup of the fully populated instance. Measure stop-to-backup
completion, archive/transfer bytes, peak resources, and time until the source
service is healthy again. Verify the backup metadata and retain its identifier.

### 5. Differential Backup

Add deterministic data equal to ten percent of each mutable workload dimension,
retain the new inventory hash, then create the next StartOS backup using the same
destination. Measure duration, bytes, peak resources, and source restart. Record
whether StartOS stored/transferred a differential or full representation; do not
claim incremental behavior solely from elapsed time.

### 6. Clean-Target Restore

Restore the verified backup to a clean architecture-matched StartOS target with
the original canonical address available. Measure restore duration, bytes, peak
resources, and time to healthy. Compare the complete state inventory, then run
authenticated event, media, and Git reads. The disposable Git cache may differ
on disk, but hydrated refs and object IDs must match.

### 7. Twenty-Four-Hour Soak

Run the representative concurrency continuously for 24 hours, rotating
deterministic read/write operations across all identities, channels, media, and
repositories. Keep five-second sampling active. Record periodic inventory
checkpoints and health probes at least hourly.

The soak fails for any unexplained process exit, health failure, state mismatch,
signature/object corruption, client-generator failure, or missing measurement
interval. Expected network fault injection belongs to `HLT-*`, not this phase.

## Acceptance And Reporting

`RES-01` passes only when both architecture runs:

- complete every phase with the exact profile and retained raw measurements;
- reach health within 180 seconds for all five cold starts and the clean restore;
- have zero unexpected failures and zero state inventory mismatches;
- complete full and differential backup plus clean-target restore;
- complete an uninterrupted measured 24-hour soak;
- receive independent review with no open high or critical issue.

Latency has no fabricated pass threshold in this first profile. Report achieved
rates and percentiles transparently; an operator or reviewer may reject an
obviously unusable result and link the issue, but must not rewrite the profile
after seeing results.

Create one report per architecture containing:

| Section         | Required content                                                 |
| --------------- | ---------------------------------------------------------------- |
| Candidate       | Tag, version, commits, signer, archive hash and size             |
| Host            | Full recorded hardware and stable StartOS build                  |
| Workload        | Profile ID, generator commit/seed, achieved counts               |
| Phases          | Start/end times, result, anomalies, evidence links               |
| Resources       | Raw-data hash and CPU, memory, storage, I/O, network summaries   |
| Service quality | Operation counts, errors, p50/p95/p99 latency                    |
| Recovery        | Backup/restore duration, bytes, inventory comparison             |
| Soak            | Duration, restarts, health transitions, hourly inventory results |
| Review          | Independent reviewer, decision, issues                           |

Link the report and raw sanitized metrics from the `RES-01` evidence record.

## Deriving Hardware Guidance

After both native runs pass, use observed peaks plus documented operating
headroom to propose hardware guidance in a separate reviewed change. Distinguish
minimum installability from a recommended production profile, include storage
growth assumptions and backup headroom, and state that the fixed workload is not
a supported maximum. Keep `hardwareMinimums` unset if results are incomplete,
non-reproducible, thermally constrained, or available from only one architecture.
