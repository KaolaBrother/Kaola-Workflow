fb5da0dd8d68
evidence-binding: n5-wire fb5da0dd8d68

## Changes made

### docs/README.md

Added two D-419 entries to the Decisions index, after the existing 0001 entry. Also added a one-line catalog note `(0002–0009 and D-422-01 listed separately; see decisions/ for full catalog)` to acknowledge the unlisted records without enumerating them. The two new entries are:

- `D-419-01 — Parallelism v3 Part 1: one coordination kernel (serial = running-set max=1); Part 3: scheduler-default posture`
- `D-419-02 — Parallelism v3 Part 2: lane-attributed disjoint write parallelism (#376 graduation); Part 4: consent-gated speculative gate overlap`

### docs/architecture.md

Inserted a new `**Parallelism v3 design (issue #419).**` paragraph immediately after the parallelism v2 block (after the sentence ending "the scripts never spawn agents, so they never overclaim concurrency." on line 192), and before the `**Enforcement boundary (script-enforced, #231).**` section. The paragraph cross-references D-419-01.md, D-419-02.md, all 25 [INV-1]..[INV-25] invariants, and `docs/investigations/2026-06-12-parallelism-v3-design.md`.

No other files were modified.

docs: complete
