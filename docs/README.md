# Documentation Index

- [Architecture](architecture.md)
- [API](api.md)
- [Conventions](conventions.md)
- [Workflow State Contract](workflow-state-contract.md) — Workflow state schema and durable state contract
- [Agent Source](agents-source.md) — Vendored agent source documentation
- [Decisions](decisions/)
  - [0001 — Legacy session/lock cleanup: no tooling](decisions/0001-legacy-session-lock-cleanup.md)
  - (0002–0009 and D-422-01 listed separately; see decisions/ for full catalog)
  - [D-419-01 — Parallelism v3 Part 1: one coordination kernel (serial = running-set max=1); Part 3: scheduler-default posture](decisions/D-419-01.md)
  - [D-419-02 — Parallelism v3 Part 2: lane-attributed disjoint write parallelism (#376 graduation); Part 4: consent-gated speculative gate overlap](decisions/D-419-02.md)
  - [D-420-01 — Goal-Driven Automation Part 1: autopilot loop (scout→claim→plan→run→finalize, confidence-threshold gating, typed stop conditions); Part 3: goal-conditioned bundles (optional `goal:` in `## Meta`, hash-covered, finalize AC-vs-goal check)](decisions/D-420-01.md)
  - [D-420-02 — Goal-Driven Automation Part 2: enriched consent-halt payload (offending paths, mechanical class, plan-repair diff); Part 4: release aggregator (`kaola-workflow-release.js --verify/--cut`, forge-neutral publish)](decisions/D-420-02.md)
- [Investigations](investigations/) — Investigation notes and analysis documents
- [Changelog](../CHANGELOG.md)
