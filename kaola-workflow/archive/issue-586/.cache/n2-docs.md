evidence-binding: n2-docs 14f0d546fdb8

## Summary

Made every doc/routing surface truthful about the parallel-batch retirement (n1-remove deleted
`scripts/kaola-workflow-parallel-batch.js` ×4 editions + `scripts/test-parallel-batch.js`).

### A. `docs/plan-run-cards/frontier-batch.md` — rewritten (not deleted)
Every subcommand example (`open-ready --project P --json [--max N] [--speculative-consent]
[--write-overlap-consent]`, `close-node --project P --node-id N --json`,
`reconcile-running-set --project P --json`) is traceable to
`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` source (read `runOpenReady`,
`runCloseNode`/`closeGroupMember`, `runReconcileRunningSet` directly; verified flags against the
CLI's own `main()` arg-parsing and `--help` usage text, never guessed). Kept: the "frontier unit"
concept, `enterBatch`/`frontier` orient fields (verified still real — `degraded`/`batchNodes`
from the OLD card were NOT real fields anywhere in the live engine, confirmed absent by grep),
`FANOUT_CAP` (write, default 4, env `KAOLA_FANOUT_CAP`) vs `FANOUT_CAP_READONLY` (read, default
8, env `KAOLA_FANOUT_CAP_READONLY`) verified against `kaola-workflow-adaptive-schema.js`, the
lane-group/leg mechanics (`.kw/legs/<project>/<node-id>`, `legPathFor`), the group-barrier close
path (`deferred_to_group` / `group_passed`, `--group-barrier --group-id <id> [--merge-commit M
--project P]`), and `reconcile-running-set`'s 4 repair classes (interrupted open,
interrupted close, stale member, lane-group survival + orphan-leg sweep) read directly from
`runReconcileRunningSet` source.

### B. Six routing surfaces (3 Claude commands + 3 Codex SKILLs)
Updated the `<!-- CARD: frontier-batch -->` block's parenthetical (now: "covers `open-ready` /
`close-node` / `reconcile-running-set`; write-role lane-group co-open in isolated legs, the
synthesizer + group barrier close; the `opening` crash-safe marker; `FANOUT_CAP` vs
`KAOLA_FANOUT_CAP_READONLY`") and the fan-out-instructions bullet list (dropped `seal`/`join` →
`close-node` per member; dropped bare `top-up`-as-subcommand phrasing → "a top-up re-run of
`open-ready` drains wider frontiers as members close" — this exact literal wording restores the
`'top-up'` needle all four contract validators pin on this file via `assertConcept('...
adaptive execution + governance', [...])`, satisfied truthfully as a description of re-invoking
`open-ready`, not a claim that a `top-up` subcommand exists; dropped `reconcile` →
`reconcile-running-set`). `<!-- PIN: frontier unit -->` + the `frontier unit` literal,
`<!-- PIN: leg-isolation-recipe -->`, and `<!-- CARD: speculative-open -->` were left byte-exact
(not touched). All six carry byte-identical CARD-block wording. Grepped all six for
`#[0-9]{1,4}` / `D-[0-9]{3}-[0-9]{2}` after editing — no provenance introduced.

### C. Remaining docs
- `CLAUDE.md` — deleted the `kaola-workflow-parallel-batch.js` Key Scripts bullet whole (its
  trailing cross-reference sentence went with it); file stays at 135 lines (< 200 cap).
- `README.md` — reworded "never a parallel-batch member" (main-session-gate row) →
  "never a frontier fan-out member"; rewrote the "Parallel ready-set execution (#281)" section
  (responsibility split, read-only/write-role fan-out, running-set scheduler paragraphs) off
  `parallel-batch.js`/`open-batch`/`seal-member`/`join` onto `adaptive-node.js`/`open-ready`/
  `close-node`/the synthesizer+group-barrier close; added a one-line retirement note citing
  D-586-01.
- `docs/architecture.md` — collapsed the ~52-line "fourth aggregator (#281)" section (which
  described the now-deleted `active-batch.json` 4-state manifest + `open-batch`/`top-up`/
  `seal-member`/`seal`/`join`/`reconcile` CLI in detail) into a ~16-line historical/retired note;
  fixed the two residual comparisons in the still-current "running-set scheduler v2 (#377)"
  section that referenced the retired CLI ("exactly like `open-batch`" dropped; "the single-node
  and batch paths are unchanged" → "additive to the single-node path"; "as well as the batch
  member set" → clarified as vestigial backward-compat, not a live alternate path).
- `docs/conventions.md` — "five forge aggregator ports" (list included `parallel-batch`) → four
  (`adaptive-node,next-action,commit-node,adaptive-handoff`, matching `edition-sync.js`'s
  now-scrubbed `GENERATED_AGGREGATORS`); "four aggregators" hosting `OPERATOR_HINT_REGISTRY` →
  three; the `frontier-batch.md` card-table row reworded to the running-set scheduler.
- `docs/api.md` — "four aggregators" → three (2 sites: the vocabulary-contract paragraph + the
  guard-prologue paragraph); dropped `/parallel-batch` from the `resumeCheck.ok` dual-emit-shim
  consumer list; stripped the retired `open-batch`/`top-up` tokens from the
  `plan_integrity_failed`/`halt_pending`/`serial_node_live`/`scheduler_active` guard-reason-code
  subcommand lists (kept `batch_active` as-is — still a real, if now-vestigial, guard); reworded
  "excluded from parallel-batch membership" (main-session-gate grammar section) →
  "excluded from frontier fan-out membership".
- `docs/workflow-state-contract.md` — reworded the `active-batch.json` `.cache/` bullet from
  "parallel-batch manifest... reconcilable via the reconcile subcommand" (implying it's a live
  artifact) to "retired... no live component writes this file anymore... guard prologue still
  detects a residual file... purely as backward-compat crash detection".
- `docs/README.md` + `docs/plan-run-cards/README.md` — reworded the frontier-batch card
  one-liner off "batch subcommands"/"open-batch / top-up / seal" onto "running-set scheduler
  (open-ready / close-node / reconcile-running-set)"; added a D-586-01 line to the plan-run-cards
  README's "Related ADRs" list.
- `docs/plan-run-cards/repair-routing.md` — "four aggregators... carries an operator_hint" →
  three (dropped `parallel-batch.js`).

### D. `docs/decisions/D-586-01.md` (new)
Followed the D-587-01/D-580-01 format (Date/Status/Issue/Related header, Context/Decision/
Consequences/Alternatives-considered body). Verified the four cited crash-safety defects against
the DELETED source directly (`git show HEAD:scripts/kaola-workflow-parallel-batch.js` into a
scratch file, since the working tree no longer has it) rather than taking the workflow-plan.md's
Plan Notes summary on faith:
- **No `'sealing'` marker** — confirmed `BATCH_STATES = ['opening','open','sealed','joined']`
  (only 4 states, no intermediate transactional marker) and `runSeal` writes
  `writeFile(planPath,...)` (ledger+compliance) BEFORE the separate `writeFile(manifestPath,...)`
  that flips `state:'sealed'` — two non-atomic writes.
- **Double-applied compliance row on retry** — confirmed `sealOne` has no
  `complianceRowExists`-style guard anywhere in the file (grepped; zero hits), unlike
  `runCloseNode`'s idempotent re-close skip.
- **Non-atomic `--abort`** — confirmed `runReconcile`'s abort branch does 3 SEPARATE writes
  (ledger→pending, then a per-member `shell(validatorPath,[...,'--drop-base',...])` loop, then
  the manifest write/unlink) with no two-phase/journaled transaction.
- **Card documented a nonexistent CLI** — confirmed the real `main()` usage text only ever
  supported `--project`/`--max`/`--node-id`/`--json`/`--abort`; grepped the whole deleted source
  for `--batch-id`/`--nodes`/`--evidence-file`/`--ledger` — zero hits. The OLD frontier-batch.md
  card's examples using those flags were fabricated from authorship, not merely stale.
Also verified: adaptive-node.js's remaining "parallel-batch" mentions are prose comments only
(no `shell()`/`require()` call — confirmed by grepping every `shell(...)`/`require(...)` call
site plus every literal "parallel-batch" occurrence and manually cross-checking none coincide);
the plan-run skeleton's own Loop Skeleton step 2 already routed `enterBatch:true` to `open-ready`
before this retirement (so the retired card's `open-batch` instructions were unreachable via the
skeleton's own operative path, not just theoretically dead). Recorded the explicit scope
boundary (design-lineage comments + the `batch_active`/`active-batch.json` guard in
`adaptive-node.js` intentionally left untouched — scripts are outside n2's write set and the
issue's own dispatch constraint keeps the live engine off-limits).

### Verification (all exit 0, captured directly)
- `node scripts/test-route-reachability.js` → "Route-reachability test passed (185 assertions)."
- `node scripts/validate-workflow-contracts.js` → "Workflow contract validation passed" (RED
  once on first run — `commands/kaola-workflow-plan-run.md must document adaptive execution +
  governance; missing: top-up` — fixed per the anti-fabrication policy: reworded truthfully
  rather than editing the validator, see B above; GREEN on re-run).
- `node scripts/validate-kaola-workflow-contracts.js` → "Kaola-Workflow Codex contract
  validation passed"
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` →
  "Kaola-Workflow GitLab contract validation passed"
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` →
  "Kaola-Workflow Gitea contract validation passed"
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed"
  (ran twice, both exit 0)
- `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (1078 assertions)"
- Final `grep -rn 'parallel-batch\|open-batch\|seal-member' docs/ commands/ CLAUDE.md README.md
  plugins/*/commands/ plugins/*/skills/` → remaining hits are ONLY: `docs/investigations/*.md`
  (3 historical files, not in write set), `docs/decisions/{0008,0010,D-419-01,D-420-02,
  D-445-01}.md` (historical ADRs, not in write set), `docs/decisions/D-586-01.md` (the new ADR
  itself), `docs/architecture.md:121-123` (the deliberate retired-history paragraph I wrote),
  `docs/workflow-state-contract.md:92-93` (the deliberate retired-manifest bullet I wrote),
  `docs/plan-run-cards/README.md:39` (the D-586-01 line I added), `README.md:694` (the
  deliberate retirement footnote I wrote). No unaccounted hits.

### Write set
Touched exactly the 17 allowed files (verified via `git status --porcelain` — all other
modified/untracked paths in the tree are n1-remove's, pre-existing before this node started).
No script was edited. No CHANGELOG.md edit (finalize's job).