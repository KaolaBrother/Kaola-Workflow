# doc-updater — bundle 940/941/942/943/944

**Verdict:** one remaining gap found and fixed (`docs/opencode-edition.md`, #941). **`docs/api.md`
NOT touched.** `README.md` NOT touched — measured accurate, see §3. The four-chain receipt is still
fresh after my edit (hash re-measured, §6).

## 1. Files changed

| File | Change | Reconciled against |
|---|---|---|
| `docs/opencode-edition.md` | new `### What --check tells you to do about a failure` subsection under `## Develop / regenerate` (after the CLI block) | four live probe runs of `sync-opencode-edition.js --check` on a scratch mirror + the 14 `mismatches.push` sites and `remediationLines()` in `scripts/sync-opencode-edition.js:787-826, 911-916` |

Nothing else was edited. That is the whole change set.

### Why this was the gap

`docs/opencode-edition.md` is the indexed home of the opencode edition (`docs/README.md:17`) and
already documents `--check` in seven places, including quoting the plugin-allowlist failure message
verbatim (line 176) and listing `--check` in the develop/regenerate CLI block (line 329). #941 changed
what `--check` **prints on failure** — a user-visible output change on a documented command — and no
doc said so. The `docs/api.md` row for this script (line 1487) documents neither its flags nor its
output, so it was not stale; this doc was.

### Ground truth transcribed (nothing invented)

Every string in the new example block is copied from a real run. Probes were made on an `rsync`
mirror of the worktree in the scratchpad — **the worktree itself was never mutated** (`git status`
after: 38 modified, zero untracked; the probe plugin file exists only in the mirror).

- **Probe 1 — WRITE only** (appended a byte to `.opencode/agent/doc-updater.md`): exit 1,
  `Fix: node scripts/sync-opencode-edition.js --forge=github --write`
- **Probe 2 — WRITE + WRITE_CONFIG mixture** (also appended to `opencode.json`): exit 1, names
  `--write-config` and the discard warning line.
- **Probe 3 — all three remedies** (also added `templates/opencode/plugins/probe-unregistered.js`):
  exit 1. **This is the block transcribed into the doc, verbatim.**
- **Probe 4 — SOURCE_EDIT alone** (restored the other two): exit 1, **no `Fix:` line at all** — only
  the `No flag of this script clears …` line. This is what the doc's third bullet states.

Class census, read off the push sites: 12 × `REMEDY.WRITE` (missing/drifted generated agent,
command, hook, plugin; four retired-artifact prune classes), 1 × `REMEDY.WRITE_CONFIG`
(`opencode.json` stale, line 909), 1 × `REMEDY.SOURCE_EDIT` (unregistered plugin, line 879). Matches
the brief. Two further facts pinned in the doc and verified in source: the offered flag always
carries the `--forge=` the check ran under (line 814), and exit code is 1 on any mismatch (line 915).

One wording correction I made to my own first draft: the WRITE bucket says "the generated tree", not
"`.opencode/`", because `treeLabel()` is `'.opencode' + forgeLayout.outSuffix(forge)` (line 622-624)
— `.opencode/` is only the github label.

## 2. Checked and deliberately left alone — with reasons

### `docs/api.md` — NO CHANGE (and it is test-consumed, so this matters)

- **Removed flag:** confirmed zero hits. `git grep -nP 'REASONING_FLOOR|isReasoningClass|enforceReasoningFloor|enforce-floor|reasoning_floor'`
  over `docs README.md AGENTS.md CLAUDE.md` returns **nothing in `docs/api.md`**. The `--enforce-floor`
  flag was never documented there, so its removal leaves nothing stale.
- **Resolver CLI surface:** `docs/api.md:1520-1531` documents the *resolution chain*, not the CLI
  flags — and that chain is still exactly right. I read the shipped resolver: after #940 the CLI is
  `<agent-name> [--raw|--json|--agent-arg] [--agent-dir DIR]` (`parseArgs`, lines 290-318; usage
  string line 330, exit 2). Those four flags are unchanged by this run and were never in `docs/api.md`
  — documenting them now would be new scope at the price of a chain re-run.
  (Note for whoever runs it: `--help` is not a flag. It falls through to the positional branch, is
  taken as the agent name, resolves to `''`, prints nothing and **exits 0**. That is pre-existing.)
- **Codex per-spawn table (`docs/api.md:1533-1542`):** still exactly correct. #944 did not change the
  tier→model/effort mapping; it changed *where the role→tier roster is carried*. The table does not
  enumerate the roster, so it cannot be stale.
- **#941:** the `sync-opencode-edition.js` row (line 1487) states a contract — "the additive runtime
  editions; not wired into `npm test` or the forge chains" — that #941 did not touch. No new flag was
  added; only `--check`'s failure output changed.

### `README.md` — NO CHANGE (nothing misdescribes reality)

- **The tier table (lines 143-158) is correct, verified against the kernel, 14/14.** I printed the
  real constants: `CODEX_PINNED_STANDARD_ROLES` = `code-explorer, investigator, knowledge-lookup,
  tdd-guide, implementer, doc-updater, metric-optimizer`; `CODEX_PINNED_REASONING_ROLES` = `planner,
  code-architect, build-error-resolver, code-reviewer, security-reviewer, adversarial-verifier,
  synthesizer`. Every row's Tier cell agrees. (The brief already noted this table is hand-maintained.)
- **The Codex paragraph (lines 179-182)** — "resolves them explicitly at each subagent spawn:
  `standard` … `medium`, `reasoning` … `xhigh`. Both mappings are fixed" — is true, and #944 made it
  *more* true rather than less. Same for the second Codex block at lines 823-845.
- **The `​```text` codex role catalog (lines 790-805)** lists the same 14 roles; #944 added no role, so
  the `validate-kaola-workflow-contracts.js` set-equality against
  `plugins/kaola-workflow/config/agents.toml` is unaffected.
- **No floor prose survives in README:** `git grep -niP 'guarantee|never below|minimum tier|floor'`
  over `README.md` returns **zero** hits. All three synthesizer descriptions (table line 157, prose
  line 189, Codex catalog note line 807) say "reasoning-class" with no floor claim — matching the new
  `synthesizer.toml` / `config/agents.toml` descriptions this run rewrote.

  **Discretionary call left to you:** README never says *where* the Codex runtime learns which role
  is which tier, and #944 is a `### Added` entry. A one-sentence addition would be legitimate. I did
  not make it because README is not wrong without it, and README is in `SELF_HOST_TEST_CONSUMED` —
  I measured that editing it stales the currently-fresh receipt (see §6). Your call, not mine.

### `docs/architecture.md` — NO CHANGE (structure did not change where this doc looks)

- **§ Model resolution (lines 324-348)** describes the chain and the Codex mapping. It never
  mentioned the floor (grep-confirmed), and the mapping is unchanged. Accurate as written.
- **#944's structural change is a new render edge** (`templates/routing/slots.js` now
  `require`s `scripts/kaola-workflow-adaptive-schema.js`). `architecture.md` **does not describe the
  routing-generation pipeline at all**: `git grep -nP 'generate-routing-surfaces|slots\.js|skeleton|rename-table'`
  over `docs/architecture.md` returns zero hits. That pipeline has exactly one documented home,
  `docs/conventions.md`, which you already updated with the render-input sentence. Adding a second
  home would create the divergence "one rule, one wording" forbids.

### `docs/README.md` — NO CHANGE

No docs file was added or removed by this run (`git status`: zero untracked, all doc changes are
`M`), so the index is complete. Its lines 34-37 already carry the standing clause that pre-0017
decision records "remain accurate as history … but where one describes … typed refusals, 0017
supersedes it" — which is what covers §4 below.

### `docs/kimi-edition.md` — NO CHANGE

#941 changed `sync-opencode-edition.js` only; `sync-kimi-edition.js` is untouched by this run, so
the kimi doc has nothing to reconcile.

### Inline comments where a public interface changed — NO CHANGE NEEDED

The resolver's own header and chain comments (`scripts/kaola-workflow-resolve-agent-model.js:8-12,
239-255`) were already rewritten by the #940 implementer and carry no floor reference; they now
describe the chain as `frontmatter -> DEFAULT_AGENT_MODELS` with the removed third step explained.
`slots.js` carries a full derivation comment for the new roster slot. Nothing left to write.

## 3. Exhaustive staleness sweep (how I know nothing else is stale)

`git grep -nP 'REASONING_FLOOR|isReasoningClass|enforceReasoningFloor|enforce-floor|reasoning_floor'`
over the **whole repo minus `CHANGELOG.md`, `docs/`, `kaola-workflow/`** returns exactly **one** hit:
`scripts/prose-census-baseline.json:401`. That file is a **frozen snapshot**, not a live expectation
— it declares `"captured_at_commit": "82dda9d1…"` and records `surface_count: 16` where today's
generator prints 18. A retired refusal code appearing in a dated census record is correct. **No
action, and none should be taken.**

A second, word-level sweep for `floor` across `hooks/ install*.sh uninstall.sh templates/ agents/
commands/ AGENTS.md plugins/ scripts/` found only unrelated senses — the Codex `0.145.0` **version**
floor, the archive **evidence** floor, `Math.floor`, and the test suites' **non-vacuity** floors.

## 4. Findings I am NOT fixing (out of my write scope) — for your routing

1. **`scripts/validate-workflow-contracts.js:1019` (and its 3 plugin copies) recommends retired
   vocabulary in a live failure message.** `VENDOR_MODEL_NOUN_BAN` tells an author to
   "Name the reasoning class instead (e.g. \"reasoning tier\", **\"reasoning-floor\"**, \"standard
   tier\")". After #940, `reasoning-floor` names nothing. This is **production code**, ×4 copies, and a
   cross-edition byte-identity surface — the brief says documentation only, so I left it. It is real
   but cosmetic: it steers a future prompt author toward a dead term. `docs/conventions.md` does
   **not** repeat this list (grep-confirmed), so the validator is the only carrier.
   The same phrase sits in the explanatory comment at line 942.
2. **`scripts/test-agent-model-resolver.js:94`** — comment "It is NOT a reasoning-floor role."
   Dangling reference to the removed concept. **Test file** → test custody says not mine.
3. **`scripts/test-opencode-edition.js:761`** — the quoted historical string `"Opus-floor
   synthesizer"`. This one is *correct as written*: it is a comment recording prose that once existed
   in a canonical body, explaining why a guard exists. No action.
4. **`docs/decisions/D-646-01.md` (lines 41-42, 83) and `docs/decisions/D-610-01.md` (19, 54)**
   describe `REASONING_FLOOR_ROLES` / the "reasoning-floor check" as extant. I judged these **frozen
   history and deliberately left them**, for three converging reasons: (a) `docs/README.md:34-37`
   already declares every pre-0017 record superseded where it describes typed refusals; (b) D-646-01
   is *already* comprehensively stale in a larger way — it is the only decision record mentioning
   `--profile`, retired at v8.0.0, and **no banner was added then**, which is the project's revealed
   convention for that file; (c) banner-ing the floor point alone would imply the surrounding
   `--profile=higher` machinery is current, making the doc *more* misleading, not less. Your D-687-01
   banner is the right and sufficient record because point 6 there described live machinery.
   If you disagree, this is a one-line banner in a receipt-invisible file — cheap to add.

## 5. `BLOCK:` items

None. Everything documented was measured or read from source.

## 6. Receipt impact — measured, not assumed

`kaola-workflow/bundle-940-941-942-943-944/.cache/chain-receipt.json` carries
`headSha d2ab06c2…`, `codeTreeHash 1f9961beb81719858800fad1971048bf16044bf978dcdf0af6fd8f08995e4b2a`,
`scope.decision all-four`, `changedFileCount 37`.

I re-ran `computeCodeTreeHash(worktree, 'bundle-940-941-942-943-944')` **after** my edit:

```
codeTreeHash after my edit: 1f9961beb81719858800fad1971048bf16044bf978dcdf0af6fd8f08995e4b2a
RECEIPT STILL FRESH: true
```

**The receipt is unaffected.** No test reads `docs/opencode-edition.md` (`git grep` over
`scripts plugins templates package.json` → exit 1, zero hits).

Per-path classification via `isValidationInvisible`, measured, for whoever edits next:

| Path | Effect on the receipt |
|---|---|
| `README.md`, `CHANGELOG.md`, `docs/api.md`, `docs/workflow-state-contract.md` | **CODE-VISIBLE — editing stales the receipt** |
| `docs/architecture.md`, `docs/README.md`, `docs/conventions.md`, `docs/decisions/**`, `docs/opencode-edition.md` | invisible — safe |

Your already-landed `docs/conventions.md` and `docs/decisions/` edits were likewise free; the
`CHANGELOG.md` edit was code-visible but was already in the tree when the 21:35 chains ran, which is
why the hash still matches.
