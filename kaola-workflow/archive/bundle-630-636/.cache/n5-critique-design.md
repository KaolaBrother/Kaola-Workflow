evidence-binding: n5-critique-design 261d852605be
verdict: fail
findings_blocking: 3

## n5-critique-design — adversarial critique of Candidate D (the two-layer design)

Repo left BYTE-CLEAN (all mutations in an rsync scratch copy outside the repo). Investigation adversary → verdict-check EXEMPT; this fail FEEDS n6-converge (fold the 3 repairs in), does NOT block finalize.

### (a) Green base + empirical calibration
All six tools green on the real tree: edition-sync.js --check (10 ports), test-route-reachability.js (260 assertions), all four validate-*-contracts.js.
**The #624 mode is EMPIRICALLY ALIVE today:** deleted the whole `### Run-Gap Sweep Gate` block (21 lines, a real finalize gate) from `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` in the scratch copy → route-reachability (260/260), ALL FOUR validators, both gitea walkthroughs, validate-vendored-agents, edition-sync --check ALL STAYED GREEN. Control: deleting the pinned `<!-- PIN: closure-audit -->` block redded route-reachability T6 (exit 1). Side-finding: even the pinned drop was caught ONLY by test-route-reachability.js (claude chain only); the gitea validator stayed green. Validates the design's motivation + raises stakes on Layer 1.

### BLOCKING R1 — #636 write-set provably incomplete (empirically 4-chain-red)
n4 Run 1 says "write-set = n3's exact map." That map MISSES the **#611 unconditional-mandate pin family** — tokens living INSIDE the Codex-dispatch block (`commands/kaola-workflow-plan-run.md:229`,`:236`) pinned on ALL SIX plan-run surfaces incl the 3 COMMANDS:
- `scripts/validate-workflow-contracts.js:1017-1029` — `planRunSurfaces611ForkTurns` asserts `'on EVERY dispatch, tiered or not'` + `'the unconditional mandate applies identically to this dispatch mode'` on all 6 (comment: "so a partial drop reds this chain").
- `scripts/validate-kaola-workflow-contracts.js:811-818` — same two tokens on the root command (a loop n3 never lists; n3 lists only :642-644 for this file).
- gitlab-contracts.js:802-806 + gitea-contracts.js:807-811 — same tokens on command+SKILL pairs (inside the shared loops n3 flagged for T14 only).
- + byte mirror plugins/kaola-workflow/scripts/validate-workflow-contracts.js.
**PROVEN:** fencing the dispatch block (:221-239) out of the claude command in scratch redded route-reachability T5b ×4 (mapped) AND validate-kaola-workflow-contracts.js:815 (`on EVERY dispatch, tiered or not` — NOT in map) AND validate-workflow-contracts.js:957 (mapped), :1026 behind it. Executing #636 as mapped reds ALL FOUR chains. n3's "T5b command-side removal is a SINGLE deletion" is true for literal T5b tokens, materially FALSE for the fencing task. Fix: same loop-split shape but ONE additional loop per validator (the #611 family) → the write-set as frozen is wrong.

### BLOCKING R2 — Layer 1's crux (the presence-check) is UNDER-SPECIFIED; the "sentinel" reading re-opens the hole
n4 says the derived presence-check "REPLACES the hand-curated T-pins" + finalize gets "Layer-1 sentinels only" — but never specifies WHAT the check asserts per file. Under the sentinel/marker reading (the design's own word):
- **Emptied-block pass:** hollow a block leaving its marker (or under Layer 2, empty the canonical block → `--write` regenerates marker-only surfaces, byte-compare green by construction) → content gone on every surface, all 4 chains green. A block-goes-missing-yet-green scenario UNDER Candidate D.
- **Weaker-than-today migration:** replacing T5b/T6 + the #624-fix gate-flag pins (`--resume-check`/`--gate-verify`/`--barrier-check`/`--verdict-check`, added by commit 4a84e791 to both forge validators) with bare presence sentinels would REGRESS current needle coverage on the exact surfaces where #624 happened.
- **Manifest self-disarm:** deleting a manifest entry silently retires the obligation on all 18 (same class as deleting a T-pin, consolidated into one soft data edit). Prior art the project learned hard: T5's #505 self-disarm hardening; T3's structural red-proof (test-route-reachability.js:104-119).
By-construction holds ONLY IF (all four, NONE currently stated): (1) entries carry CONTENT tokens not bare markers; (2) migration proven NO-WEAKER than the current pin set; (3) the checker has a T3-style STRUCTURAL RED-PROOF; (4) the file universe DERIVES from the emitted-targets registries (T1/T2) so a new surface is auto-obligated + a bidirectional orphan-sentinel check.

### BLOCKING R3 — drift-class premise overstated + a booby-trap plank
- `git show 4a84e791` (#624 fix): primary defect was absence-class (57-line adaptive prereq block never propagated to the 2 forge-codex finalize SKILLs — manifest catches this). BUT the SAME commit also fixed a **content-divergence-while-present** bug: all 3 Claude finalize commands said "three gates" above an already-four-gate block. So n4's premise "drift class is whole-block-ABSENT NOT content-divergence" is empirically INCOMPLETE — both co-occurred inside #624. Layer-1-only finalize stays permanently exposed to the present-but-wrong class → must be an EXPLICITLY ACCEPTED residual risk, not defined away.
- The gitea `mr|pr)` n1 called "vestigial/unreachable DRIFT RESIDUE" and n4's Run-2 adversary plank orders the canonical NOT to reproduce is **DELIBERATELY machine-pinned**: gitea-contracts.js:303-304 + :342-343 ("Gitea Finalization command must dispatch canonical pr sink (mr|pr) case)"). Acting on that plank REDS the gitea chain; the plank is also inconsistent with D (finalize has no canonical under D). "Correct the drift" is a BOOBY TRAP unless the pin edits enter the write-set as a deliberate contract change.

### What SURVIVED (strong search evidence)
- (c) frontmatter slot-driven HOLDS: 3 command frontmatters byte-identical (`description:`+`argument-hint:`, 0 forge tokens); 3 SKILL byte-identical (`name:`+`description:`); only H1 carries forge suffix → a two-shape surface-type slot + H1 forge token suffices.
- (c) NO md↔toml obligation HOLDS: find plugins -name '*.toml' hits only agents/ + config/; skill dirs have only SKILL.md.
- (d) #636-as-PREREQUISITE HOLDS empirically: fenced command absent T5b relocation reds T5b ×4. Ship-#636-first + serialize-validator-writes both stand.
- (b) deleted-generated-surface attack FAILS against the design: edition-sync runCheck (edition-sync.js:120-122) reds `missing port`; T1/T2 existence checks independently cover surface existence.
- SKILL-side Teammate fence pin-clean beyond mapped T14 (mailbox/idle notification/When classic/hold IDENTICALLY — 0 validator hits); claude/gitlab sentence-reorder normalization pin-safe.
- Topic ratios verified: finalize 989:475 (~2:1), plan-run 458:490, next 531:446 → finalize-stays-hand-authored stands.
- opencode: .opencode/ not checked in (0 tracked; test-opencode-edition.js self-generates via --write) — no write-set gap.
- MINOR (non-blocking): n4 names `commands/kaola-workflow-next.md`; actual file is `commands/workflow-next.md`.

### Verdict
REFUTED (high confidence). The two-layer ARCHITECTURE (manifest presence + scoped generation, #636 first) survived every structural attack and is the RIGHT SHAPE. What fails is the design AS FROZEN: R1 (proven 4-chain-red #636 write-set gap — the #611 pin family), R2 (unspecified presence-check that re-admits block-gone-yet-green + could weaken #624-fix pins), R3 (drift-class premise contradicted by #624's own fix + a gitea-pinned-contract booby trap). n6-converge: carry the architecture forward WITH the three repairs folded in — do NOT discard.
