evidence-binding: n3-full-candidate-falsifier 0ecc2ee22756
verdict: pass
upstream_read: n2-full-integration-review 5d73c678366d
execution_mode: main-session-inline-user-directed

# Adversarial falsification — NOT REFUTED

No counterexample survived. This was explicit user-directed main-session adversarial self-checking,
not an independent delegated verifier. The verdict is grounded in destructive scratch mutations,
the full four-edition suite, journal inspection, and exact hash restoration.

## Generator attacks

- In an out-of-repo scratch copy, changed one generated GitHub plan-run command. `--check` failed
  with surface drift; `--write` restored all six plan-run hashes exactly and left all six `next`
  hashes unchanged.
- Separately replaced `repair_limit_reached` in the canonical skeleton. `--check` failed on exactly
  six plan-run surfaces. After generating the poisoned outputs, route reachability failed on the
  missing repair token. Restoring the original skeleton and regenerating restored exact plan-run
  and next hashes, and `--check` passed.

## Repair/journal attacks

- R25 exercises both public close commands, ordinary duplicate close, and a simulated crash after
  provisional plan/compliance persistence. The same provisional result replays while compliance,
  close timing, and nonce-bound provenance each occur exactly once.
- The existing adaptive suite re-exercises sequence and fan-out fail-closed settlement, immutable
  receipts/outcomes, unique-maximal writer proof, candidate/barrier binding, simultaneous failures,
  opener fences, repair crash seams, independent logical-gate limits, and ordinal-stable cleanup.
- Journal inspection found exactly two n2 logical-gate attempts: ordinal 1 is a settled failure with
  one repair selected/settled/consumed by `n1-routing-integration`; ordinal 2 is a settled pass.
  No unresolved attempt or unconsumed repair exists.
- No automatic writer selection, scheduler repair state, DAG rewrite, second state machine, or R17
  directory-fsync behavior was introduced.

## Full validation

- `npm test`: pass, sequential Claude → Codex → GitLab → Gitea chains, exit 0.
- Claude chain includes adaptive-node 2038 assertions, route reachability 578, profile parity 96,
  generator self-test 33, edition sync 41, contract validation, and the full workflow walkthrough.
- Codex, GitLab, and Gitea contract and native/Codex walkthroughs all pass; every chain ends with
  generated-surface freshness green.
- Public docs, ADR, repair card, and changelog remain byte-identical to approved `07f1532a`; no
  recovery prose was duplicated.
- Gap sweep produced exactly `in_run_repair` sample `n2-full-integration-review` and
  `manual:routing-surface-generator-drift` with sample `plan-run repair protocol outputs drifted
  because templates/routing/plan-run.skeleton.md omitted the canonical repair section`.
