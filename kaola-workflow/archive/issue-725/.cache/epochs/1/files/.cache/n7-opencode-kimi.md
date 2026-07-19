evidence-binding: n7-opencode-kimi 2b3f8228b832
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: mechanical edition re-sync (glue) + assertion-retirement (behavior-preserving
edit to a hand-rolled test suite) — re-syncing the two additive gitignored runtime editions from
the now-retired canonical tree via their existing generators, and updating their own assertion
suites to the retired counts/surfaces, has no natural failing-unit-test shape: there is no new
behavior to TDD, only (a) mechanical regeneration of untracked generated artifacts from an
already-changed canonical source, and (b) retiring/deleting assertions that probed now-deleted
fast/full surfaces so the suite matches reality. The proof is the two scoped suites re-run green.
regression-green: test-opencode-edition.js (396 assertions) and test-kimi-edition.js (440 assertions) both exit 0 against the retired tree
<!-- regression-green|build-green|smoke-integration -->
regression-green:
`node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js` both exit 0 —
opencode-edition test passed (396 assertions); kimi-edition test passed (440 assertions). Zero
fast/phase1-5 command/skill probes remain that assert existence of a deleted surface; the
fast-compliance-backstop PIN probe narrows to its one surviving carrier (kaola-workflow-finalize).

upstream_read: n1-recon 30aed1d97859
upstream_read: n6-routing 662f27013d5a

## verification_tier

regression-green

## task

n7-opencode-kimi: opencode and kimi are ADDITIVE runtime editions (not wired into `npm test`).
Re-sync them from the now-retired canonical tree (`node scripts/sync-opencode-edition.js --write`
+ `node scripts/sync-kimi-edition.js --write`), confirm the stale fast/full generated command/skill
copies are dropped (untracked/gitignored, regenerated from canonical which n2 already deleted the
fast/phase1-5 sources from), and update `scripts/test-opencode-edition.js` +
`scripts/test-kimi-edition.js` assertions to the retired counts/surfaces so the two scoped suites
pass green.

## write_set (tracked files actually changed — exact match to the binding-constraint TRACKED subset)

- scripts/test-opencode-edition.js   (MODIFIED)
- scripts/test-kimi-edition.js       (MODIFIED)

Per the binding constraints, the 16 `.opencode/`/`.kimi/` entries in the n7-opencode-kimi plan row
are GITIGNORED generated artifacts (confirmed via `git status --porcelain --ignored`: `!! .opencode/`
/ `!! .kimi/`) — untracked, not part of the barrier-diffed tracked write set. No tracked file
outside the 2 above was touched by this leg: `git status --porcelain` after this leg shows exactly
these 2 additional ` M` entries beyond the pre-existing upstream (n2 `D` / n3-n6 `M`) changes.

## what the two syncs did

1. `node scripts/sync-opencode-edition.js --write`
   - Pre-check (`--check`) showed 2 stale files: `.opencode/command/kaola-workflow-finalize.md`,
     `.opencode/command/workflow-next.md` (both regenerate from the n6-routing-edited canonical
     `commands/kaola-workflow-finalize.md` / `commands/workflow-next.md`).
   - `--write` regenerated exactly those 2 files: "generated .opencode/command/kaola-workflow-finalize.md",
     "generated .opencode/command/workflow-next.md"; `opencode.json` preserved (user-owned).
   - `.opencode/command/` already held only 5 files pre-leg (kaola-workflow-adapt.md,
     kaola-workflow-finalize.md, kaola-workflow-plan-run.md, workflow-init.md, workflow-next.md) —
     `listCanonCommands()` scans the `commands/` dir directly, and n2 had already deleted
     `commands/kaola-workflow-{fast,phase1..5}.md` from canonical upstream of this leg, so the
     generator naturally never produced the stale fast/phase copies; no explicit prune was needed.
   - Post-write `--check`: "16 agent(s) + 5 command(s) + 1 plugin(s) in parity with canonical" —
     exit 0.
   - `find .opencode -iname "*fast*" -o -iname "*phase[1-5]*"` → zero matches. All GITIGNORED
     (untracked), confirmed via `git status --porcelain --ignored`.

2. `node scripts/sync-kimi-edition.js --write`
   - `.kimi/` did not exist in this worktree pre-leg (fully absent — gitignored, self-provisioning).
     Pre-check (`--check`) reported "PARITY FAILED (25 file(s))": all 16 `kaola-role-*` skills, all
     5 command skills (kaola-workflow-adapt/finalize/plan-run, workflow-init/next — no fast/phase
     entries, since `sync-kimi-edition.js` also derives its command set from canonical `commands/`),
     3 hook script copies, and the generated `kimi-hooks.toml` fragment — all "missing" (never
     generated).
   - `--write` generated all 25 (16 role skills + 5 command skills + 3 copied/adapted hooks + 1
     generated hooks.toml fragment): "sync-kimi-edition: write complete (25 file(s) updated)."
   - Post-write `--check`: "16 role skill(s) + 5 command skill(s) + 4 hook file(s) in parity with
     canonical" — exit 0.
   - `find .kimi -iname "*fast*" -o -iname "*phase[1-5]*"` → zero matches (combined with the
     opencode search above; both ran in one command, zero total hits). All GITIGNORED (untracked).

Both syncs wrote ONLY untracked `.opencode/`/`.kimi/` artifacts — `git status --porcelain` before
and after both `--write` runs shows no tracked-file delta from the syncs themselves (confirmed via
`git status --porcelain --ignored`: `.opencode/` and `.kimi/` both list as `!!` ignored, never as
`??` untracked-but-not-ignored or `M`/`A`). No STOP condition triggered — no sync wrote a tracked
file outside this node's set.

## per-file change summary (the 2 tracked test suites)

### scripts/test-opencode-edition.js

- **A9** (`emittedCommandTargets`): dropped `'kaola-workflow-fast'` / `'kaola-workflow-phase1'` —
  claim.js never emits a non-adaptive route target post-retirement (mirrors n6-routing's identical
  T1/T2 retirement in `test-route-reachability.js`). Shrinks to the 2 real adaptive targets
  (`PLAN_RUN_COMMAND`, `ADAPT_COMMAND`).
- **A20** (mirror T10, fast-compliance-backstop PIN probe): dropped `'kaola-workflow-fast'` from the
  probed-surface array (file n2-deleted); kept `'kaola-workflow-finalize'` — the PIN's one surviving
  carrier, force-kept alive as dormant legacy prose by the unowned `required-blocks.js`
  `fn-fast-compliance-backstop` manifest entry (per n6-routing's discovered write-set gap, recorded
  for a later phase).
- **A21** (mirror T11, adaptive-default-contract PIN probe) — **DELETED IN FULL**. Both surfaces it
  probed (`kaola-workflow-phase1`, `kaola-workflow-fast`) are n2-deleted; a repo-wide
  `grep -rl adaptive-default-contract` confirms the PIN has ZERO surviving tracked carrier
  post-retirement (only historical archive/decision docs and this test file itself reference the
  literal) — nothing left to lock in, retired alongside its only carriers. Mirrors n6-routing's
  full deletion of T10/T11 in `test-route-reachability.js`.
- **P1–P6/U1 block** (was L824-1205): header comment rewritten to record the retirement rationale
  and the GAP-3 (install-opencode.sh `--with-fast`/`--with-full` flag parsing itself is unowned/
  deferred, still present but now inert for deployment since the source commands don't exist)
  cross-reference. `FAST_ONLY`/`FULL_ONLY` arrays removed.
  - **F5**: simplified from `canon == adaptive-core ∪ fast ∪ full` to `canon == adaptive-core`
    exactly.
  - **P1**: kept (adaptive-only default-install lock-in); dropped its now-vacuous
    FAST_ONLY/FULL_ONLY-not-deployed loops (those arrays no longer exist).
  - **P2, P3, P4, P5** (--with-fast / --with-full / both / union-preserve-on-reinstall probes) —
    **DELETED IN FULL**. Every surface probed is n2-deleted; testing the (unowned, deferred)
    installer's residual flag-parsing behavior is out of this node's scope and not part of the
    Phase-A retired-surface contract.
  - **G1**: dropped the `FAST_ONLY.concat(FULL_ONLY)`-not-deployed loop (vacuous post-retirement).
  - **P6** (self-healing orphan-prune on reinstall) — **DELETED IN FULL**, same reasoning as P2-P5
    (no opt-in scenario left to narrow-then-prune).
  - **U1** — **RETAINED, narrowed**: dropped the `--with-fast` seeding and the fast-specific
    assertions; kept the real, fast-independent uninstall/reinstall contract (commands+agents+
    hooks-plugin removed, `opencode.json` preserved, `installed_paths` reset to `[]`, reinstall
    round-trips to exactly `ADAPTIVE_CORE`).
  - Removed the now-unused `writeFileSync` destructure (only P6 used it).
- Trap 1 honored: `grep -n "\bfast\b\|\bphase[1-5]\b"` post-edit shows only (a) comments documenting
  the RETIRED surfaces (mirrors n6's documentation style), (b) the still-live A20 finalize PIN probe,
  (c) the still-live A22 "NEVER downgrade to fast/full" adaptive-only-guard positive assertion +
  its "fast path"/"full review" canary-absence check (untouched — live adaptive vocabulary, same
  category as n1's trap disambiguation). No grep-and-delete of the substring "full" was performed;
  every edit was a surgical, hand-verified block replacement.

### scripts/test-kimi-edition.js

- **K8** (mirror of opencode A9, `emittedCommandTargets`): identical retirement — dropped
  `'kaola-workflow-fast'` / `'kaola-workflow-phase1'`, kept the 2 real adaptive targets.
- **Stale "11" count references** (header comment L12, `canonCommandNames` inline comment L78, K1
  block comment L84, K1 assertion message L98): all 4 corrected from the pre-existing stale "11
  command basenames/skills" (adaptive-core 5 + fast 1 + full 5 = 11, the pre-#725 count) to "5" —
  these were message/comment text only (K1's actual pass/fail logic already computed the count
  dynamically from `canonCommandNames.length`, so the suite was never functionally wrong here, only
  descriptively stale); corrected as part of the "retired counts/surfaces" mandate.
- **P1–P4/U1/A1 block** (was L457-700+): header comment rewritten (same GAP-3 cross-reference as
  opencode). `FAST_ONLY`/`FULL_ONLY` arrays removed.
  - **P0** (partition exhaustiveness, mirror of opencode F5): simplified to `canon == adaptive-core`
    exactly.
  - **P1**: kept; dropped the vacuous FAST_ONLY/FULL_ONLY-not-deployed loop.
  - **P2, P3** (--with-fast / --with-full opt-in probes) — **DELETED IN FULL**, same reasoning as
    opencode's P2-P5.
  - **P4** (idempotency), **U1** (uninstall/reinstall — never seeded `--with-fast` in the first
    place, so untouched), **A1** (Claude-path-leak scan), **K9+** (kimi reviewer-profile
    resolution, further down) — all fast/full-independent, left untouched (confirmed via a
    file-wide grep: no fast/phase[1-5] token exists past the P2/P3 deletion site).
  - `expectDeployed` helper retained (still used by P1).
- Trap 1 honored: post-edit `grep -n "\bfast\b\|\bphase[1-5]\b"` shows only comments documenting the
  retired surfaces and the P0/header retirement prose — no live probe of a deleted surface, no
  grep-and-delete of "full".

## verification_commands + outputs

1. `node scripts/sync-opencode-edition.js --check` (pre-write) → "PARITY FAILED (2 file(s))":
   `.opencode/command/kaola-workflow-finalize.md`, `.opencode/command/workflow-next.md` stale.
2. `node scripts/sync-opencode-edition.js --write` → "generated .opencode/command/kaola-workflow-finalize.md",
   "generated .opencode/command/workflow-next.md", "preserve opencode.json"; "write complete (2 file(s) updated)."
3. `node scripts/sync-kimi-edition.js --check` (pre-write) → "PARITY FAILED (25 file(s))" — all 25
   generated artifacts reported missing (fresh `.kimi/`, self-provisioning).
4. `node scripts/sync-kimi-edition.js --write` → "sync-kimi-edition: write complete (25 file(s) updated)."
5. `ls .opencode/command/` / `ls .kimi/skills/` → exactly the 5 adaptive-core commands / 5 command
   skills + 16 kaola-role-* skills; zero fast/phase[1-5] entries.
6. `find .opencode .kimi -iname "*fast*" -o -iname "*phase[1-5]*"` → zero matches.
7. `node scripts/sync-opencode-edition.js --check` (post-write) → exit 0, "16 agent(s) + 5
   command(s) + 1 plugin(s) in parity with canonical."
8. `node scripts/sync-kimi-edition.js --check` (post-write) → exit 0, "16 role skill(s) + 5 command
   skill(s) + 4 hook file(s) in parity with canonical."
9. `node -c scripts/test-opencode-edition.js` / `node -c scripts/test-kimi-edition.js` → both exit 0
   (syntax check post-edit).
10. `node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js` (the exact scoped
    verification command from the brief) → exit 0. "opencode-edition test passed (396 assertions)."
    / "kimi-edition test passed (440 assertions)."
11. `git status --porcelain` (post-leg) → exactly `scripts/test-opencode-edition.js` and
    `scripts/test-kimi-edition.js` newly ` M` beyond the pre-existing upstream (n2 `D` / n3-n6 `M`)
    set; `git diff --stat` on those 2 files shows 105 insertions(+), 250 deletions(-).
12. `git status --porcelain --ignored` → `.opencode/` and `.kimi/` both list as `!!` (ignored),
    confirming the sync-written artifacts never entered the tracked/staged surface.

## before_result

Serial-chain reality: at this leg's start, `.opencode/command/kaola-workflow-finalize.md` and
`.opencode/command/workflow-next.md` were stale (pre-dated n6-routing's canonical edits); `.kimi/`
was fully absent from the worktree (never generated). `node scripts/test-opencode-edition.js`
(pre-edit, but self-provisioning via its own internal `sync-opencode-edition.js --write` call) was
RED: `FAIL: A9: receipt-emitted command target "/kaola-workflow-fast" resolves to
.opencode/command/kaola-workflow-fast.md` (×2) followed by an uncaught `ENOENT` crash reading
`.opencode/command/kaola-workflow-fast.md` inside the A20/A21 block (that file is n2-deleted from
canonical, so the generator never produces it) — the suite could not even complete a full pass.
`node scripts/test-kimi-edition.js` was analogously broken on K8 + the P0/P1/P2/P3 fast/full
partition probes referencing n2-deleted commands. This is the expected upstream-broken transient
this leg converges (n1-recon + the frozen task direction both anticipated it).

## after_result

Both syncs converge their untracked artifact trees to parity with the now-retired canonical
(`--check` exit 0 for both, zero fast/phase remnants under `.opencode/`/`.kimi/`). Both scoped test
suites are fully green: `node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js`
exits 0 — 396 + 440 assertions passed, 0 failures. No tracked file outside
`scripts/test-opencode-edition.js` / `scripts/test-kimi-edition.js` was modified by this leg (the
16 `.opencode/`/`.kimi/` write-set entries stayed gitignored/untracked throughout, per binding
constraint). No STOP-condition sync-wrote-a-tracked-file event occurred. Per the brief and CLAUDE.md
Validation Policy, opencode/kimi are additive editions not wired into `npm test` — no four-edition
chain obligation from this leg; the scoped verification is exactly the two suites, both green. No
commit made.
