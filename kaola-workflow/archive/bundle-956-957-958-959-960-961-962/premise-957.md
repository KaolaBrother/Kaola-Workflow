# Premise check — issue #957 (Codex tier pair: two unbound copies in docs/)

VERDICT: CONFIRMED-WITH-CORRECTION

The mechanics are all as filed: the constants exist at the cited lines with the cited values, both
doc copies restate them, both are currently value-correct (unbound but NOT drifted), the T19b check
pins effort-from-constants and leaves the model regex free, the installer cross-binding exists,
adaptive-schema.js holds role rosters only, and docs/api.md is test-consumed. **The correction is the
claim's headline word "SOLE": README.md:180-181 states the full pair in live, shipped, normative
prose and is bound by nothing.** The unbound live-prose set is three sites, not two. Two secondary
corrections: each of the two cited sites extends past its cited line range (a colloquial "Sol/medium"
restatement sits just below each), and docs/decisions/D-687-01.md + CHANGELOG.md also carry the pair
(defensibly exempt as declared history).

Analytical result, stated in the contract's terms: the compound claim is **refuted in its "sole"
component** by a concrete counterexample (finding R1); every other component is **not_refuted** after
the falsification attempts recorded below. Execution: all commands ran to completion; no execution
problem is being converted into an analytical result.

---

## 1. The four constants (source)

`sed`-free read of `scripts/kaola-workflow-codex-preflight.js:89-92` (Read tool, offset 70):

```
89	const CODEX_STANDARD_MODEL = 'gpt-5.6-sol';
90	const CODEX_STANDARD_EFFORT = 'medium';
91	const CODEX_REASONING_MODEL = 'gpt-5.6-sol';
92	const CODEX_REASONING_EFFORT = 'xhigh';
```

Exactly as the issue cites. Additionally, all four repo copies of the preflight file are
byte-identical right now, and a guard holds them so:

```
$ md5 -q scripts/kaola-workflow-codex-preflight.js \
    plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js \
    plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js \
    plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
4f447cbba0a3d9ebe08332006a542660   (all four identical)
$ grep -c 'preflight' scripts/validate-script-sync.js
8
```

`validate-script-sync.js` (header: "Drift guard: ensures scripts shared by both … trees stay
byte-identical. Fails CI when…") names the preflight file 8 times and runs at the head of every
chain (`package.json:40-46`). The constants at lines 89-92 of all four copies are identical
(grepped individually, all four print the same four lines).

## 2. The two doc copies — quoted, and value-correct today

`docs/api.md:1533-1542` (Read tool):

```
1533	Codex subagent dispatch uses the existing role tier as a separate per-spawn contract:
1534
1535	| Role tier | Codex model | Reasoning effort |
1536	|---|---|---|
1537	| `standard` | `gpt-5.6-sol` | `medium` |
1538	| `reasoning` | `gpt-5.6-sol` | `xhigh` |
1539
1540	The mappings are fixed for every Codex spawn. A `standard` role always receives Sol/medium and has no
1541	task-specific model or reasoning-effort escalation, downgrade, or other exception. This contract is
1542	Codex-only; the resolver and model routing for Claude Code, opencode, and Kimi are unchanged.
```

`docs/conventions.md:42-52` (Read tool):

```
42	- `role` — the installed agent role name (e.g. `code-reviewer`, `implementer`)
43	- `prompt` — the task prompt
44	- `cwd` — the working directory
45	- `model` — selected from the role's existing tier for this spawn: both tiers use `gpt-5.6-sol`
46	- `reasoning_effort` — paired with that model for this spawn: standard uses `medium` and reasoning uses
47	  `xhigh`
48
49	The mapping is fixed for every spawn. A standard-tier role always uses Sol/medium; task breadth,
50	latency, prior outcomes, and risk do not create an escalation or any other model/reasoning exception.
51
52	Do not present Claude `Agent(...)` call-syntax as the Codex runtime contract.
```

Both copies **currently MATCH the constants** (sol/medium, sol/xhigh). So the finding class is
"unbound and not yet drifted" — a drift-class repair, not a live-error repair; urgency is
mechanism-shaped, not correctness-shaped.

**Correction (secondary): the sites are larger than the cited ranges.** `docs/api.md:1540` and
`docs/conventions.md:49` each restate the standard pair colloquially ("Sol/medium"). A repair that
edits only 1535-1538 / 45-47 leaves a value restatement standing at each site. The repair scope per
site is api.md:1533-1542 and conventions.md:45-50.

## 3. The binding at test-route-reachability.js:530-545 — effort pinned, model free: CONFIRMED (with a sharpening)

Quoted (Read tool):

```
530	  // effortDefects — PURE. The tier->effort mapping, bound to the constants the Codex installer and
531	  // preflight validate installed profiles against, so the prose and the validator cannot drift
532	  // apart. T19 pins the same two sentences as literals; this is the binding to the constant, ...
534	  const effortDefects = (block, efforts) => {
535	    const flat = norm(block);
536	    return Object.entries(efforts)
537	      .filter(([tier, effort]) => !new RegExp(
538	        `${tier}-tier roles dispatch with \`model: "[^"]+"\` and \`reasoning_effort: "${effort}"\``, 'i')
539	        .test(flat))
540	      .map(([tier, effort]) => `${tier}-tier is not stated as reasoning_effort "${effort}"`);
541	  };
542	  const EXPECTED_EFFORTS = {
543	    standard: codexPreflight.CODEX_STANDARD_EFFORT,
544	    reasoning: codexPreflight.CODEX_REASONING_EFFORT,
545	  };
```

- Expected efforts are built **from the codexPreflight constants** — confirmed.
- The model in that regex is literally `"[^"]+"` — **any model string passes this check**. The
  issue's characterisation of the 530-545 check is **correct**.

**Sharpening (does not rescue the doc copies, but corrects the surface picture):** T19 — the sibling
check in the same file — pins the model **as a hardcoded literal sentence** on the same six SKILL
surfaces, with an armed mutation battery:

```
119	  return normalized.includes('Standard-tier roles dispatch with `model: "gpt-5.6-sol"` and `reasoning_effort: "medium"`.')
120	    && normalized.includes('Reasoning-tier roles dispatch with `model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`.')
...
365	          ['standard model', modelRoutingBlock.replace('gpt-5.6-sol', 'gpt-5.6-terra')],
...
375	          assert(!codexModelRoutingContractValid(content.replace(modelRoutingBlock, mutatedBlock)),
376	            `T19 model-routing mutation: ${label} reds ${file}`);
...
424	  assert(allModelRoutingBlocks.length === codexEditions.length * expectedDispatchSkills.length
425	    && allModelRoutingBlocks.every(block => block === allModelRoutingBlocks[0]),
426	    'T19 model routing: all six Codex next/finalize skills carry one byte-identical routing contract');
```

So on the SKILL surfaces the model IS pinned — by a test literal (a deliberate hand-typed pin), not
by the constant. A model drift on a shipped SKILL is caught (T19); a model change in the constant is
caught by the contract validator's literal (item 4). None of this reads a `docs/` file, which is
exactly why the issue's mutation proof held: with both doc copies set to `gpt-4o-mini`/`low`, the
fast gate stays green.

## 4. Cross-binding preflight → installer: CONFIRMED

`scripts/validate-kaola-workflow-contracts.js:444-453` (Read tool):

```
444	assert(codexInstaller.CODEX_STANDARD_MODEL === 'gpt-5.6-sol'
445	    && codexInstaller.CODEX_STANDARD_EFFORT === 'medium'
446	    && codexPreflight.CODEX_STANDARD_MODEL === codexInstaller.CODEX_STANDARD_MODEL
447	    && codexPreflight.CODEX_STANDARD_EFFORT === codexInstaller.CODEX_STANDARD_EFFORT,
448	  'Codex installer/preflight historical standard migration pair must be gpt-5.6-sol/medium');
449	assert(codexInstaller.CODEX_REASONING_MODEL === 'gpt-5.6-sol'
450	    && codexInstaller.CODEX_REASONING_EFFORT === 'xhigh'
451	    && codexPreflight.CODEX_REASONING_MODEL === codexInstaller.CODEX_REASONING_MODEL
452	    && codexPreflight.CODEX_REASONING_EFFORT === codexInstaller.CODEX_REASONING_EFFORT,
453	  'Codex installer/preflight historical reasoning migration pair must be gpt-5.6-sol/xhigh');
```

Confirmed — and note it also hardcodes the expected VALUES, so any change to the constants
themselves fails the codex chain until this validator is updated in the same commit. The gitlab and
gitea contract validators carry the same 4-literal block (`git grep -c 'gpt-5\.6-sol'`: 4 hits each
in `plugins/kaola-workflow-{gitlab,gitea}/scripts/validate-kaola-workflow-{gitlab,gitea}-contracts.js`).

## 5. Negative claim — adaptive-schema.js holds role rosters ONLY: CONFIRMED

```
$ grep -n -P 'gpt-5|xhigh|medium|CODEX_STANDARD|CODEX_REASONING|reasoning_effort' \
    scripts/kaola-workflow-adaptive-schema.js; echo "EXIT=$?"
EXIT=1        (zero matches)

$ grep -n -P 'CODEX_PINNED|CODEX_STANDARD|CODEX_REASONING' scripts/kaola-workflow-adaptive-schema.js
46:const CODEX_PINNED_STANDARD_ROLES = Object.freeze([
55:const CODEX_PINNED_REASONING_ROLES = Object.freeze([
1558:  CODEX_PINNED_STANDARD_ROLES,
1559:  CODEX_PINNED_REASONING_ROLES,
```

A broad first-pass sweep (`gpt-5|xhigh|sol|SOL|effort|EFFORT|model|MODEL`) returned only incidental
substring hits — `sol` inside "resolve/resolver", `effort` inside "best-effort". No model literal, no
effort literal, no `CODEX_*_MODEL`/`CODEX_*_EFFORT` constant. The file holds the two role ROSTERS
(consumed by `validate-kaola-workflow-contracts.js:432-443` for roster parity with installer and
preflight). **The issue's warning is right: do not send an implementer there for this pair.**

## 6. Full carrier enumeration — the "SOLE" test. REFUTED as worded; corrected below

Two-part sweep as briefed. Part 1, tracked files (full capture, no head/tail; counts via
`git grep -c`):

```
$ git grep -l -P 'gpt-5\.6-sol' -- . | wc -l
78
```

51 of the 78 are under `kaola-workflow/archive/**` (dispatch logs, run reports, finalization
summaries — frozen run records, not shipping surfaces). The **27 non-archive carriers**, each
classified:

| # | file (hits) | class | bound? by what |
|---|---|---|---|
| 1 | scripts/kaola-workflow-codex-preflight.js (2) | code | THE SOURCE; validator literal pin (item 4); 4 copies byte-guarded by validate-script-sync.js |
| 2-4 | plugins/{kaola-workflow,‑gitlab,‑gitea}/scripts/kaola-workflow-codex-preflight.js (2 ea) | code | byte-identical to #1 (md5 proven), validate-script-sync.js |
| 5-7 | plugins/{kaola-workflow,‑gitlab,‑gitea}/scripts/install-codex-agent-profiles.js (2 ea) | code | validate-*-contracts.js:444-453 equality to preflight |
| 8-9 | plugins/kaola-workflow-{gitlab,gitea}/scripts/validate-…-contracts.js (4 ea) | check | the binding itself |
| 10 | scripts/validate-kaola-workflow-contracts.js (4) | check | the binding itself |
| 11 | scripts/test-route-reachability.js (4) | check | the binding itself (T19 literal + T19b constants); model-mutation control armed (line 365) |
| 12-14 | scripts/test-agent-model-resolver.js (16), test-install-model-rendering.js (6), test-agent-profile-parity.js (1) | check fixtures | exercise resolver/installer rendering; not shipped prose |
| 15-20 | plugins/{3 editions}/skills/kaola-workflow-{next,finalize}/SKILL.md (2 ea) | **prose, ships** | **BOUND**: T19 (model+effort literal sentences, mutation-proven, byte-identical across all six) + T19b (effort from constants) |
| 21-22 | templates/routing/{next,finalize}.skeleton.md (2 ea) | **prose source** | **BOUND transitively**: `generate-routing-surfaces.js --check` (runs in all four chains, package.json:40-43,46) pins rendered==skeleton; rendered copies are T19/T19b-checked |
| 23 | docs/api.md (2) | **prose, ships** | **UNBOUND** — the issue's site 1 |
| 24 | docs/conventions.md (1) | **prose, ships** | **UNBOUND** — the issue's site 2 |
| 25 | **README.md:180-181 (2)** | **prose, ships** | **UNBOUND — the counterexample to "sole"** |
| 26 | docs/decisions/D-687-01.md:77,95-96,108 (4) | prose, history | unbound; declared history (docs/README.md retention policy; audit itself rejected filing against docs/decisions/) |
| 27 | CHANGELOG.md:267,2458 (2) | prose, history | unbound; release notes record "from X to Y" — binding history to current constants would be wrong |

Part 2, untracked edition trees (ugrep skips dot-dirs; explicit find):

```
$ find .opencode .kimi -type f \( -name '*.md' -o -name '*.js' -o -name '*.toml' -o -name '*.json' \) \
    -exec grep -l 'gpt-5.6-sol' {} + ; echo "FIND-EXIT=$?"
FIND-EXIT=1        (zero carriers)
$ git ls-files --others --exclude-standard plugins | wc -l
0                  (no untracked files under plugins/)
```

**The README counterexample, proven unbound exhaustively.** README.md:180-181 (Read tool):

```
180	spawn: `standard` dispatches as `gpt-5.6-sol` / `medium`, while `reasoning` dispatches as
181	`gpt-5.6-sol` / `xhigh`. Both mappings are fixed: standard-tier model and reasoning effort never
```

Live, normative ("Both mappings are fixed"), shipped (README is in `RELEASE_FILES` and both
test-consumed lists). Two independent sweeps establish no check reads that statement:

- Every script line touching README across `scripts/` and all three plugin script trees was
  enumerated (`git grep -P 'README'` + reader filter, full output captured). The only
  content-asserting readers are: `validate-kaola-workflow-contracts.js:475-502` (Codex role
  CATALOG — role set only; its own comment at 494 says the effort table was retired in #451 and
  "there is no effort row to pin"), `validate-workflow-contracts.js:438-441,596` (coordination
  concepts + manifest version lines), `validate-vendored-agents.js:141-144` (ECC lines),
  release scripts (version rewrite). None mentions the pair.
- The complete set of scripts containing `xhigh` is six files (`git grep -l`):
  codex-preflight, test-agent-model-resolver, test-install-model-rendering, test-opencode-edition
  (planner `reasoningEffort` fixture at 2073/2304 — a different mechanism), test-route-reachability,
  validate-kaola-workflow-contracts. None of the six reads README.

So as literally filed — "every prose surface the repo ships is bound to the constants except these
two" — the claim is **refuted**: README.md:180-181 is a third unbound live copy. If D-687-01 and
CHANGELOG are counted as shipping prose rather than declared history, the exception set is five; the
history classification is defensible and I recommend keeping it, which leaves **three live unbound
sites, not two**.

Bookkeeping correction: the audit's "22 carrier files in all" — measured today, 27 non-archive
tracked carriers (78 total including archives). 27 minus the five unbound/history prose files is 22,
which is likely what was counted; either way the number in the issue's lineage is not the tree's
number.

## 7. docs/api.md is test-consumed: CONFIRMED

`scripts/kaola-workflow-adaptive-schema.js:905-911`:

```
905	const SELF_HOST_TEST_CONSUMED = Object.freeze([
906	  'README.md',
907	  'CHANGELOG.md',
908	  'docs/api.md',
909	  'docs/workflow-state-contract.md',
910	  'docs/agents-source.md',
911	]);
```

`scripts/kaola-workflow-validation-runner.js:32-38` — identical five entries (`TEST_CONSUMED_PATHS`).
So: **editing docs/api.md stales the chain receipt** (codeTree hash treats it as CODE); write the doc
edit BEFORE the receipt run. Two facts the repair must respect: README.md is ALSO test-consumed
(same effect), and **docs/conventions.md is NOT on either list** — which matters for the repair
choice below.

## 8. RECOMMENDED REPAIR

Recommendation: **(a) delete the values and point at the constants** for the two docs sites, and
**extend the repair to README** — bind it where a validator already holds everything needed. Repair
option (b) for the docs carries a hidden cost the issue doesn't mention (below).

**Site 1 — docs/api.md:1533-1542.** Replace the value table and the "Sol/medium" sentence:

> Codex subagent dispatch uses the existing role tier as a separate per-spawn contract. The per-tier
> model/effort pair is defined once, by the four constants in
> `scripts/kaola-workflow-codex-preflight.js` (`CODEX_STANDARD_MODEL`/`CODEX_STANDARD_EFFORT`,
> `CODEX_REASONING_MODEL`/`CODEX_REASONING_EFFORT`) — cross-bound to the installer by
> `validate-kaola-workflow-contracts.js` and to the shipped Codex SKILL prose by
> `test-route-reachability.js`. This document does not restate the values.
>
> The mappings are fixed for every Codex spawn. A `standard` role always receives the standard-tier
> pair and has no task-specific model or reasoning-effort escalation, downgrade, or other exception.
> This contract is Codex-only; the resolver and model routing for Claude Code, opencode, and Kimi
> are unchanged.

Test-consumed: yes — sequence the edit before the receipt run.

**Site 2 — docs/conventions.md:45-50.** Replace lines 45-47 with:

> - `model` / `reasoning_effort` — selected from the role's existing tier for this spawn; the
>   per-tier pair is defined solely by the `CODEX_STANDARD_*`/`CODEX_REASONING_*` constants in
>   `kaola-workflow-codex-preflight.js` and shipped on the Codex next/finalize SKILLs

and lines 49-50 with:

> The mapping is fixed for every spawn. A standard-tier role always uses the standard-tier pair;
> task breadth, latency, prior outcomes, and risk do not create an escalation or any other
> model/reasoning exception.

**Site 3 (the correction) — README.md:180-181.** Two acceptable shapes; recommend the binding,
because README is the one surface where reader-facing values earn their keep:
`validate-kaola-workflow-contracts.js` already holds `readmeText` (line 475) and requires both
constant-bearing modules (lines 429-430). After the role-catalog block (~line 502), add asserts that
build the expected fragments FROM the constants against a whitespace-normalized README, e.g.
`` '`standard` dispatches as `' + codexPreflight.CODEX_STANDARD_MODEL + '` / `' + codexPreflight.CODEX_STANDARD_EFFORT + '`' ``
and the reasoning twin (the reasoning fragment wraps across lines 180-181 — normalize whitespace
before matching, per the `norm()` idiom in test-route-reachability.js). One-rule-one-wording flag
for the implementer: decide whether the gitlab/gitea contract validators mirror this assert (their
444-453 blocks are mirrored today) or whether README is treated as a root-edition surface
(`ROOT_EDITION_READ_FILES` in run-chains includes README) and pinned once. If pointer-izing README
instead, mirror the api.md wording.

**Why (a) and not (b) for the two docs sites:**
- The issue is filed `shrink:`; D5 in the same audit (LANE_STALENESS_MS "restated … rather than
  pointed at") establishes pointing as the repo's direction for this class.
- The (b) trap the issue does not state: docs/conventions.md is **not** in
  `SELF_HOST_TEST_CONSUMED`/`TEST_CONSUMED_PATHS`. A check that starts asserting on its content
  makes it verdict-affecting prose whose edits do NOT stale the chain receipt — a stale-green
  receipt class. Fixing that means adding it to both lists across the four byte-identical
  adaptive-schema copies and the validation-runner copies. Pointer-izing costs zero machinery;
  CLAUDE.md: "There is already too much in this project."
- After (a), no check needs to cover the two sites: there are no values left to drift. Residual
  risk is D1-class pointer rot (a constant rename leaves the doc naming dead identifiers); the
  constant NAMES are asserted by the contract validators, so a rename already reds the chain and
  the renamer sweeps mentions.

**Coverage after repair:** api.md/conventions.md — nothing to bind (values gone). README — bound by
the new constant-built asserts in a validator that runs in the codex chain (fast gate included via
`validate-workflow-contracts.js`'s sibling? No — the codex chain; if fast-gate coverage is wanted,
mirror into `validate-workflow-contracts.js`, which the claude chain runs and which already reads
README). D-687-01/CHANGELOG — deliberately left as history; no action.

---

## Canonical findings

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=README.md:180-181 is a third live shipped prose copy of the pair bound by no check — refutes the issue's "sole two docs/ copies"; fold into #957's repair scope (bind via validate-kaola-workflow-contracts.js constants-built asserts, or pointer-ize)
finding: id=R2 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=both cited sites extend past their cited ranges — colloquial "Sol/medium" restatements at docs/api.md:1540 and docs/conventions.md:49 must be inside the repair or a value survives at each site
finding: id=R3 scope=out_of_scope action=none status=open severity=info fix_role=none rationale=docs/decisions/D-687-01.md (4 sites) and CHANGELOG.md:267,2458 carry the pair unbound as declared history — non-blocking; binding history would be wrong; recorded so the orchestrator sees the full carrier set
finding: id=R4 scope=out_of_scope action=none status=open severity=info fix_role=none rationale=audit lineage says "22 carrier files"; measured 27 non-archive tracked carriers (78 with archives), .opencode/.kimi zero — bookkeeping only

verdict: fail
findings_blocking: 1

(Contract framing: "fail" here records that the claim as worded was refuted in its "sole" component —
R1 — not that the issue is worthless. Confidence: high on every numbered item; each rests on full-
capture command output quoted above, and the README-unbound proof is a two-way exhaustive sweep
(all README readers × all xhigh-carrying checks). The dispatch-vocabulary verdict on line 1,
CONFIRMED-WITH-CORRECTION, is the operative one for the premise pass: proceed with #957, with the
repair surface corrected to three live sites and two colloquial restatements.)
