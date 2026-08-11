# Adversarial review — issue #953 (solution ladder)

Reviewer: adversarial-verifier (read-only). Worktree: `.kw/worktrees/bundle-952-953-954-955`, branch `workflow/bundle-952-953-954-955`, uncommitted.

## Claim under refutation

"The three code-producing roles (implementer, code-architect, planner) now carry one shared solution
ladder, rendered to every carrier across all four runtimes, harmonizing code-architect's previous
wording rather than adding a sixth one — and a parity-guard pin now makes a carrier that misses the
rule fail loudly."

Analytical stance: presumed FALSE until strong falsification attempts failed. They all failed.

verdict: pass
findings_blocking: 0

Analytical result: **not_refuted**. Execution result: all planned attacks ran to completion; none
was skipped. Confidence: high — every load-bearing sub-claim was tested against shipped bytes or by
mutation with real exit codes, not against the implementer's report.

## Attacks and results

### Attack 1 — does the rule reach every carrier? CLAIM-HOLDS (30/30)

BSD `grep -F -c 'Reuse or extend an existing mechanism before writing a second one.'` (not ugrep;
explicit absolute paths into the dot-directories):

- 12 tracked carriers: `agents/{implementer,code-architect,planner}.md` and
  `plugins/{kaola-workflow,-gitlab,-gitea}/agents/{implementer,code-architect,planner}.toml` — all 12
  contain the exact sentence exactly once.
- 18 generated carriers, PRESENT in the worktree (not absent):
  `.opencode{,-gitlab,-gitea}/agent/{implementer,code-architect,planner}.md` and
  `.kimi{,-gitlab,-gitea}/skills/kaola-role-{implementer,code-architect,planner}/SKILL.md` — all 18
  contain the exact sentence exactly once.
- Carrier-set completeness cross-checked by enumerating files carrying each role's body markers
  ("correct for every valid input", "Implementation Blueprint", "writing up your own plan is your
  only write") tree-wide: no unlisted carrier of any of the three roles exists. (Archive hits under
  `kaola-workflow/archive/` are historical run records, not prompt surfaces.)

### Attack 2 — is the pin armed? CLAIM-HOLDS (mutation-proven, four mutations)

Mirror: `scratchpad/rev953` (rsync of the worktree, `.git`/`node_modules` excluded); the real tree
was never mutated. Real exit codes via `node …; echo EXIT=$?` (unpiped).

- Positive control (unmutated): `agent-profile parity tests passed (808 assertions)`, EXIT=0.
- Mutation A — pinned sentence deleted from `agents/planner.md` (canonical; not used by the
  implementer's own proof): EXIT=1, `FAIL: role pin … is NO LONGER in agents/planner.md`. The
  presence-first assert makes a stale pin a named failure, not a silent self-disable.
- Mutation B — rung-2 line deleted from `plugins/kaola-workflow-gitlab/agents/implementer.toml`
  (different tree AND role than the prior gitea/code-architect proof): EXIT=1, TWO named failures —
  the pin (`md↔toml drift`) and three-way byte-identity.
- Mutation C — meaning flip `before`→`after` applied IDENTICALLY to all three implementer TOMLs so
  byte-identity stays green and only the pin can catch it: EXIT=1, three named pin failures. The
  guard's normalization does not swallow a word-content change.
- Mutation D — pinned sentence deleted from the GENERATED `.opencode/agent/planner.md` (outside the
  pin's reach): `test-opencode-edition.js` EXIT=1, `D0[github]: .opencode … has DRIFTED from
  canonical (sync --check exit 1)`, and the suite deliberately stops rather than self-repair.
- Mirror restored to worktree bytes between mutations (verified by `cmp` / control re-run EXIT=0).

Wiring: `test-agent-profile-parity.js` runs in both `test:kaola-workflow:claude` and `:full`
(`package.json:40,46`), and that wiring is itself pinned by `scripts/validate-workflow-contracts.js:884`
and `scripts/validate-kaola-workflow-contracts.js:588` (#422.3).

### Attack 3 — byte-identity of the pinned sentence: CLAIM-HOLDS, one scoping note

Byte-exact `grep -F` found the sentence in all 30 carriers — no smart quotes, no dash drift, no
doubled spaces, no missing period anywhere. Scoping note, non-blocking: the GUARD would tolerate
punctuation-level drift (`carriesRule` normalizes em dashes to `--`, straightens quotes, strips
`*`/backticks, folds case) — documented as deliberate, since the .toml twin is a licensed paraphrase.
No such drift exists in the shipped bytes today, and word-content drift is caught (Mutation C).

### Attack 4 — harmonized, not appended: CLAIM-HOLDS

Both old code-architect bullets ("choose the simplest architecture that meets the requirement",
"avoid speculative abstractions unless the repo already uses them") return grep exit 1 across the
ENTIRE worktree — agents/, plugins/, all six generated dot-trees, templates/, scripts/, docs/, and
the run archives. The `git diff` shows them deleted from `agents/code-architect.md` with their
content absorbed into rungs 2 and 5. No competing minimalism wording survives in any role carrier
(the "speculative …" hits in reviewer roles concern review-finding discipline, a different rule).
Non-blocking lifecycle note: installed copies under `~/` still carry the pre-bundle v9.6.0 wording
until the release reinstall — expected, for the finalize step to handle, not a defect of this change.

### Attack 5 — three-way byte-identity of codex TOML trees: CLAIM-HOLDS

`shasum -a 256` per role across `plugins/{kaola-workflow,-gitlab,-gitea}/agents/`:
implementer all three = `691bcc1a…`; code-architect all three = `5d63b114…`; planner all three =
`9c35a088…`.

### Attack 6 — collateral damage: CLAIM-HOLDS

- Full diff of the three `agents/*.md` read: the ladder is a new terminal `## Solution ladder` H2,
  not inside a code fence; the numbered list is well-formed; `### 2. Architecture Design` keeps one
  bullet after the two deletions (heading not orphaned).
- All 42 `plugins/*/agents/*.toml` parse under python `tomllib` (42× OK, exit 0).
- Both edition suites pass on the unmutated mirror with the drift check live:
  `opencode-edition test passed (563 assertions)` and `kimi-edition test passed (521 assertions)`,
  each reporting all 3 trees "present and in parity with canonical", EXIT=0.

### Attack 7 — constraint compliance: CLAIM-HOLDS

Every `+` line of `git diff -U0 -- agents/ plugins/` scanned for vendor/model/provenance tokens
(claude|codex|kimi|opencode|gpt|anthropic|openai|#9xx|issue|ponytail|adr): zero matches. The
rationale prose for the pins lives in the `ROLE_PINS` comment inside the TEST script — not an
agent-facing prompt surface, which is the allowed placement.

### Prose reading — does the ladder license doing less? No defect

Read `agents/implementer.md` whole. "Stop at the first rung that works" and "the minimum code that
works" inherit their definition of "works" from the objective section two headings up ("correct for
every valid input, not just for the inputs the tests name"), rung 1 targets speculative parts of the
brief rather than correctness obligations, and the ladder's closing sentence explicitly firewalls:
"This governs the solution you build, never how closely you read or verify — comprehension and
verification stay exactly as demanding as they were." As placed, it does not read as licence to
weaken correctness or verification.

## Non-blocking observations (no action demanded)

1. `ROLE_PINS` reaches only the 12 tracked carriers. The 18 generated carriers are made loud by the
   edition suites' D0 drift check instead (proven live by Mutation D) — and those suites sit outside
   `npm test` by the documented additive-edition design. The claim's "fail loudly" is therefore true
   of every carrier, but through two mechanisms, one of them pre-existing.
2. Installed copies under `~/` are pre-bundle until the release reinstall (Attack 4 note).
3. The guard tolerates punctuation-level paraphrase drift by documented design (Attack 3 note).

## Verdict

The claim survived every attack run: 30/30 carriers hold the exact sentence; the pin is
mutation-proven armed on carriers the prior proof did not touch, including the byte-identity-blind
case; the generated-carrier gap is closed by a live drift check; the old wording is extinct
tree-wide; the codex trees are hash-identical; nothing structural or parseable broke; the added text
is vendor-, model-, and provenance-free. No attack was skipped.
