# impl — issue #962, finding S5: eight comment lines naming the deleted `plan-validator.js`

**Corrective, not subtractive. 0 net deletable lines; nothing deleted.** All eight sites keep the
fact they carried; only the referent changed. Landed in the worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-956-957-958-959-960-961-962/`
on branch `workflow/bundle-956-957-958-959-960-961-962`.

**Verification tier: `build-green`** — comment-only edits to two ported scripts. The check that
matters for this diff is the propagation/parity guard plus a parse check of every shipped copy;
per the dispatch I did not run `npm test` or the four chains (tree transiently inconsistent while
other agents work).

---

## Propagation mechanism — determined before editing, not guessed

The two files use **two different mechanisms**, and one of them is *not* the same for all three
plugin trees. Evidence, read from the code:

| file | canonical → codex (`plugins/kaola-workflow/scripts/`) | canonical → gitlab/gitea |
|---|---|---|
| `kaola-workflow-run-chains.js` | **byte copy**, enrolled in `COMMON_SCRIPTS` (`scripts/validate-script-sync.js:69`) | **GENERATED** from canonical — listed in `GENERATED_AGGREGATORS` (`scripts/edition-sync.js:64`), rendered by `renderForgePort()` (`edition-sync.js:118`) |
| `kaola-workflow-claim.js` | **byte copy**, enrolled in `COMMON_SCRIPTS` (`scripts/validate-script-sync.js:46`) | **HAND-PORTED** — `edition-sync.js:30-34` names claim explicitly: *"The data-layer forge ports (claim / sink-merge / sink-pr / active-folders / classifier / roadmap) stay HAND-PORTED … and are NOT touched here"* |

So: **edit canonical and regenerate for run-chains' forge ports; edit by hand for claim's forge
ports; both files' codex copies are byte copies of canonical.** The `validate-script-sync.js:68`
comment states the run-chains split in one line — *"Byte-identical claude↔codex; the gitlab/gitea
ports are GENERATED (edition-sync GENERATED_AGGREGATORS, promoted in #868)"* — and
`edition-sync.js:52-65` carries the same fact from the generator's side.

**How the propagation was executed.** `edition-sync.js --write` would have done the right thing for
my files, but it also byte-copies *every* `COMMON_SCRIPTS` entry and byte group, and other agents are
concurrently mid-edit on siblings (`kaola-workflow-install-manifest.js` is one). To avoid writing
their files I ran a scoped script that calls **edition-sync's own exported `renderForgePort` /
`forgeRel`**, so the generated ports are byte-identical to what `--write` produces — confirmed by
`edition-sync.js --check` passing afterwards. Script:
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/cbc61aa2-7a04-4ceb-9b2b-ff62797e69c7/scratchpad/propagate-962-s5.js`.

A detail worth recording: the rename pass makes the new `kaola-workflow-claim.js` token I added at
run-chains site 3 render **forge-correctly per tree** — `kaola-gitlab-workflow-claim.js` in the
gitlab port, `kaola-gitea-workflow-claim.js` in gitea (verified by reading the generated ports). The
`kaola-workflow/<project>/` state-directory token in the same sentence correctly stays un-renamed
(the rename regex requires a trailing hyphen).

---

## The eight canonical sites — before / after

### 1. `scripts/kaola-workflow-claim.js:2586` — barrier-ref tag sanitizer

**Before**
```
// #686: shared barrier-ref tag sanitizer — MUST mirror the projectTag computation adaptive-node.js /
// plan-validator.js use to anchor `refs/kaola-workflow/barrier/<tag>/<node>`
// (`path.basename(<projectDir>).replace(/[^A-Za-z0-9_-]/g, '_')`) so a ref this reaps/sweeps is
// EXACTLY the ref the barrier machinery anchored. Confirmed (grep across the whole tree) that
```

**After**
```
// #686: shared barrier-ref tag sanitizer — MUST reproduce the projectTag computation the retired
// DAG-era barrier machinery (adaptive-node.js / plan-validator.js, both since deleted) USED to anchor
// `refs/kaola-workflow/barrier/<tag>/<node>`
// (`path.basename(<projectDir>).replace(/[^A-Za-z0-9_-]/g, '_')`) so a ref this reaps/sweeps is
// EXACTLY the ref the barrier machinery anchored. The producers are gone; the refs they wrote are
// not, so this shape is pinned by those historical refs and not by any live caller — do not
// "modernize" it. Confirmed (grep across the whole tree) that
```

The name is kept deliberately, in the past tense — it is the historical referent that explains the
constraint. The added clause is the load-bearing half the dispatch flagged: once the producer is
deleted, a reader has no way to know the shape is still pinned. Without it the comment invites
exactly the "simplify this, nothing calls it" edit that would orphan the live refs.

### 2. `scripts/kaola-workflow-claim.js:5786` — case-fold rationale

**Before**
```
// dirent (projTag is recorded EXACTLY as given, plan-validator.js — never case-normalized), so an
// exact-case keep lookup misses it. The keep membership check below is CASE-FOLDED — a tag is kept
```

**After**
```
// dirent (projTag was recorded EXACTLY as given by the retired plan-validator.js — never
// case-normalized; the historical refs keep that shape), so an exact-case keep lookup misses it.
// The keep membership check below is CASE-FOLDED — a tag is kept
```

### 3. `scripts/kaola-workflow-run-chains.js:42` — RECEIPT PATH

**Before**
```
// RECEIPT PATH (#546): plan-validator --finalize-check reads the chain receipt from
// <plan-dir>/.cache/chain-receipt.json where plan-dir == path.dirname(<plan-path>). Run from the
// worktree root (the #466 contract), the producer's bare cwd default (.cache/chain-receipt.json)
// lands at the WORKTREE ROOT, not under kaola-workflow/<project>/ — so the gate reads nothing and
// refuses chains_unverified. Pass --project <issue-N> (or --plan <path>) to land the receipt where
// the gate reads it. Precedence when several are given: --output > --plan > --project > cwd default.
```

**After**
```
// RECEIPT PATH (#546): the finalize chain-receipt check — kaola-workflow-claim.js finalize calling
// adaptiveSchema.evaluateChainReceipt in process — reads the chain receipt from
// <project-dir>/.cache/chain-receipt.json, i.e. kaola-workflow/<project>/.cache/. Run from the
// worktree root (the #466 contract), the producer's bare cwd default (.cache/chain-receipt.json)
// lands at the WORKTREE ROOT, not under kaola-workflow/<project>/ — so the check reads nothing and
// reports chains_unverified. Pass --project <issue-N> (or --plan <path>) to land the receipt where
// the check reads it. Precedence when several are given: --output > --plan > --project > cwd default.
```

Two notes. (a) `<plan-dir> == path.dirname(<plan-path>)` was dropped because it defined the *plan*
path derivation, which the `--plan` usage line at `:32-33` already states; the directory it named is
the project dir the reader actually reads, so no fact was lost. (b) **`refuses` → `reports`**: the
dispatch scoped the enforced/reported swap to :125/:867/:1091, but `chains_unverified` is a
classification returned by `evaluateChainReceipt`, which is explicit at
`scripts/kaola-workflow-adaptive-schema.js:1210` — *"IT REPORTS; IT DOES NOT REFUSE … This function
returns a typed FINDING"*. Leaving "refuses" would have replaced a wrong referent with a wrong
mechanism. Flagging it as a judgement call beyond the literal dispatch.

### 4. `scripts/kaola-workflow-run-chains.js:125` — SELF-HOST-ONLY header

**Before**
```
// finalize gate is the agent-recorded `.cache/final-validation.md` evidence, enforced
// by `plan-validator --finalize-check` (consumer mode). The v6.2.0 `kaola-workflow/chains.json`
// consumer escape hatch is retired (Pure option A — no opt-in middle-ground).
```

**After**
```
// finalize evidence is the agent-recorded `.cache/final-validation.md`, reported
// by the finalize chain-receipt check (`adaptiveSchema.evaluateChainReceipt`, consumer mode).
// The v6.2.0 `kaola-workflow/chains.json` consumer escape hatch is retired (Pure option A — no
// opt-in middle-ground).
```

### 5. `scripts/kaola-workflow-run-chains.js:867` — resolveChains preamble

**Before**
```
// chains.json + re-runs a suite to produce a chain receipt; its finalize gate is the agent's
// recorded `.cache/final-validation.md` evidence ("Agent Owns Reasoning; Scripts Own Atomicity",
// #44), enforced by `plan-validator --finalize-check` in consumer mode. resolveChains therefore
// resolves ONLY the built-in npm edition chains for the KNOWN_CHAINS whose `test:kaola-workflow:<name>`
// script is declared in package.json (the self-host); otherwise a typed `chains_config_missing`
// refusal (a consumer repo simply never runs this producer).
```

**After**
```
// chains.json + re-runs a suite to produce a chain receipt; its finalize evidence is the agent's
// recorded `.cache/final-validation.md` ("Agent Owns Reasoning; Scripts Own Atomicity", #44),
// reported by the finalize chain-receipt check (`adaptiveSchema.evaluateChainReceipt`) in consumer
// mode. resolveChains therefore resolves ONLY the built-in npm edition chains for the KNOWN_CHAINS
// whose `test:kaola-workflow:<name>` script is declared in package.json (the self-host); otherwise
// a typed `chains_config_missing` refusal (a consumer repo simply never runs this producer).
```

(The trailing lines were re-wrapped only because the substitution changed the line's width; no
wording below `mode.` changed.)

### 6. `scripts/kaola-workflow-run-chains.js:1091` — `chains_config_missing` arm

**Before**
```
    // its finalize gate is the agent-recorded .cache/final-validation.md, enforced by
    // plan-validator --finalize-check in consumer mode. So the only refusal is chains_config_missing
    // (this repo declares no edition test scripts), and the hint points at the consumer contract.
```

**After**
```
    // its finalize evidence is the agent-recorded .cache/final-validation.md, reported by the
    // finalize chain-receipt check (adaptiveSchema.evaluateChainReceipt) in consumer mode. So the
    // only refusal is chains_config_missing (this repo declares no edition test scripts), and the
    // hint points at the consumer contract.
```

"So the only refusal is `chains_config_missing`" is kept verbatim — that one **is** a live typed
refusal in this producer (it returns 1 with no receipt), and it is the surviving refusal the
"Nothing refuses" principle explicitly preserves.

### 7. `scripts/kaola-workflow-run-chains.js:1231` — receipt-reader parenthetical

**Before** `// reader (the plan-validator finalize gate, an operator) can distinguish a timeout kill from a`
**After**  `// reader (the finalize chain-receipt check, an operator) can distinguish a timeout kill from a`

### 8. `scripts/kaola-workflow-run-chains.js:1233` — reader index keys

**Before** ``// decomposition. Readers index by name/exitCode/accepted_red (plan-validator --finalize-check,``
**After**  ``// decomposition. Readers index by name/exitCode/accepted_red (`adaptiveSchema.evaluateChainReceipt`,``

---

## Today's reader — re-verified independently, not taken from the dispatch

- Definition: `evaluateChainReceipt` at `scripts/kaola-workflow-adaptive-schema.js:1235`, under the
  header comment *"THE ONE VALIDATION VERDICT"* at `:1203`.
- Live caller: `scripts/kaola-workflow-claim.js:4038`,
  `const validation = adaptiveSchema.evaluateChainReceipt(gateRoot, { cacheDir, project });` inside
  `probeFinalizeValidationGate`. Same line number in the codex copy; `:3777` (gitlab) / `:3774` (gitea).
- Consumer mode is real and lives in that function — `:1217-1224` documents the DUAL-MODE split and
  the `final_validation_*` classification family.
- `plan-validator.js` is genuinely gone: `git ls-files | grep plan-validator` returns only three
  archived `.cache/` DATA artifacts under `kaola-workflow/archive/issue-666/`, no script.

---

## All four trees agree

32 shipped comment lines (8 sites × 4 trees). Verified in-process by
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/cbc61aa2-7a04-4ceb-9b2b-ff62797e69c7/scratchpad/verify-962-s5.js`
(exit 0, `ALL FOUR TREES AGREE`), with a positive control (`sanitizeBarrierTag`, 9 hits per claim
copy) proving the reads were live:

| tree | claim: `plan-validator` (expect 2, both past-tense) | claim: old strings | run-chains: `plan-validator` residue | run-chains: `chain-receipt check` | run-chains: `evaluateChainReceipt` | run-chains: `enforced by` |
|---|---|---|---|---|---|---|
| canonical | 2 | 0 | 0 | 5 | 5 | 0 |
| codex | 2 | 0 | 0 | 5 | 5 | 0 |
| gitlab | 2 | 0 | 0 | 5 | 5 | 0 |
| gitea | 2 | 0 | 0 | 5 | 5 | 0 |

(5 and 5, not 4 and 4: `chain-receipt check` lands at sites 3/4/5/6/7 and `evaluateChainReceipt` at
sites 3/4/5/6/8. My first checker expected 4 and reported four FAILs — the expectation was wrong,
the files were not.)

**Files changed (8):**

- `scripts/kaola-workflow-claim.js`
- `scripts/kaola-workflow-run-chains.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js`

Diffstat is symmetric across trees: claim +13/-8 each, run-chains +36/-28 each.

---

## Tombstone guards — explicitly NOT touched

Confirmed untouched (absent from `git status --short` for these paths) and still carrying their
`plan-validator` mentions:

| guard | mentions | status |
|---|---|---|
| `scripts/test-finalize-door.js` (T1/T5) | 7 | untouched |
| `scripts/validate-workflow-contracts.js:561` | 1 (in the retired-vocabulary `assertNotIncludes` list) | untouched |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | 1 | untouched |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 1 | untouched |

Neither guard could have been affected anyway, and I checked rather than assumed: T1's regex is
`/require\(\s*['"][^'"]*kaola-workflow-plan-validator[^'"]*['"]\s*\)/` (`test-finalize-door.js:453`)
— it matches a `require()`, not a comment; and `validate-workflow-contracts.js:561` asserts the token
is absent from `commands/kaola-workflow-finalize.md`, a file outside this diff.

Note: `scripts/validate-kaola-workflow-contracts.js` appears modified in `git status` — that is
another agent's concurrent work, not mine. It carries 0 `plan-validator` mentions and I did not
write to it. My writes were exactly the 8 files listed above.

---

## Verification commands

| # | command | exit | when |
|---|---|---|---|
| 1 | `node scripts/validate-script-sync.js` | **0** | before (baseline) |
| 2 | `node scripts/edition-sync.js --check` | **0** | before (baseline) |
| 3 | `node scripts/validate-script-sync.js` | **0** | after |
| 4 | `node scripts/edition-sync.js --check` | **0** | after |
| 5 | `node --check` × all 8 changed files | **0** (all 8) | after |
| 6 | `node -e "require(canonical claim.js); require(canonical run-chains.js)"` | **0** | after |
| 7 | `node …/verify-962-s5.js` (4-tree agreement + positive control) | **0** | after |

Real exit codes, captured with `echo "exit=$?"` directly after each command — nothing gated on a
pipe or on `head`/`tail`.

**before**

```
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
validate-script-sync exit=0

edition-sync: 8 forge aggregator ports in parity with canonical.
edition-sync: committed kernel parity verified at HEAD.
edition-sync-check exit=0
```

**after** (byte-identical output, which is the point — the diff is comment-only and the parity guards
stayed green across it)

```
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
validate-script-sync exit=0

edition-sync: 8 forge aggregator ports in parity with canonical.
edition-sync: committed kernel parity verified at HEAD.
edition-sync-check exit=0
```

`validate-script-sync.js` also `require()`s all four `claim.js` copies (its
`FORGE_EXPORT_SUPERSET_FAMILY` check), so its exit 0 is a **live module-load** of every claim copy,
not only a byte comparison. The four run-chains copies are not require()d by that guard, so they were
parse-checked separately with `node --check` (row 5).

## What I did not run, and why

`npm test` and the four chains, per the dispatch — the tree is transiently inconsistent while other
agents work (`scripts/run-chain-pool.js` and `scripts/fixtures-orphan-legality.js` are staged
deleted, several suites mid-edit), so a red there would not have been attributable to this diff.
`scripts/test-run-chains.js` was likewise left unrun for the same reason. That is the residual gap in
this tier: comment-only edits carry no behavioural risk, and no test in the tree pins any of the
strings I changed (swept for `RECEIPT PATH`, `MUST mirror the projectTag`, `never case-normalized`,
`plan-validator finalize gate` and `consumer mode` outside the two files — the only hits are decision
records under `docs/decisions/`, which are history by the stated retention policy and out of scope).
