# Premise check — issue #940

> "The reasoning floor is enforced for no role: `--enforce-floor` has zero production consumers"

**Verdict in one line:** the issue's *consequence* is correct and I reproduced it live. Three of its
five claims are precise; two need qualification (stale line numbers; "exactly one file" is true only
of executable code, and the hook glob undercounts the copies by one).

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow`, branch `main`, HEAD `d2ab06c2`
- `git status --porcelain` → `?? kaola-workflow/bundle-940-941-942-943-944/` only (tree otherwise clean)
- `node --version` → `v24.14.0`
- `grep` on this box is **ugrep 7.5.0** (skips dot-directories). All negatives below were taken with
  `git grep -nP` or `command grep -rn --binary-files=without-match`, never the shell's `grep` function.
- Throwaway probe root: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/e2e7977c-61d4-41bc-a290-3fc8f13cdf1e/scratchpad/hookprobe`
- No tracked file was modified. The only writes were this report and the scratchpad probe.

### Surface inventory (established before any claim was tested)

Resolver copies — **4 tracked, 3 installed**, `sha256`:

| copy | sha256 |
|---|---|
| `scripts/kaola-workflow-resolve-agent-model.js` | `49e8c1fc…` |
| `plugins/kaola-workflow/scripts/…` | `49e8c1fc…` |
| `plugins/kaola-workflow-gitlab/scripts/…` | `49e8c1fc…` |
| `plugins/kaola-workflow-gitea/scripts/…` | `49e8c1fc…` |
| `~/.claude/kaola-workflow/scripts/…` | `49e8c1fc…` |
| `~/.config/opencode/kaola-workflow/scripts/…` | `49e8c1fc…` |
| `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.5.5/scripts/…` | **`c22f3c81…`** |

The Codex plugin-cache copy is **stale**: it is byte-identical to `git show 54cbe8d3^:scripts/kaola-workflow-resolve-agent-model.js`
(same `c22f3c81…`), i.e. it predates `54cbe8d3` (the build-error-resolver / adversarial-verifier tier
move). This is the already-known #944 shape and it matters here only for line numbers — see Claim 1.

`.opencode*`, `.kimi*` (six untracked edition trees in the worktree) each carry the **hook** but carry
**no resolver**; `ls <tree>/scripts/kaola-workflow-resolve-agent-model.js` → `No such file or directory`
for all six. In those editions the hook's third search path (`$OPENCODE_CONFIG_DIR/kaola-workflow/scripts`)
is what resolves, and it does resolve on this box.

---

## Claim 1 — `REASONING_FLOOR_ROLES = new Set(['synthesizer'])` at `…resolve-agent-model.js:46`

**Verdict: PARTIALLY-CONFIRMED — the fact is exactly right; the line number is stale by +2 at HEAD.**

```
$ git grep -n "REASONING_FLOOR_ROLES" -- scripts/kaola-workflow-resolve-agent-model.js
scripts/kaola-workflow-resolve-agent-model.js:40:  // REASONING_FLOOR_ROLES). The post-G1 intent-verifier (adversarial-verifier on a merge) is held to
scripts/kaola-workflow-resolve-agent-model.js:48:const REASONING_FLOOR_ROLES = new Set(['synthesizer']);
scripts/kaola-workflow-resolve-agent-model.js:223:// #463 Slice 1 (AC14): ENFORCE the reasoning-class floor. For a REASONING_FLOOR_ROLES role, the
scripts/kaola-workflow-resolve-agent-model.js:247:  if (!REASONING_FLOOR_ROLES.has(name)) return { ok: true, role: name, model: model || '', floor: null };
scripts/kaola-workflow-resolve-agent-model.js:433:  REASONING_FLOOR_ROLES,
```

The declaration is at **`:48`**, and the set contains exactly `synthesizer` and nothing else. Where
`:46` comes from:

```
$ git show "54cbe8d3^":"scripts/kaola-workflow-resolve-agent-model.js" | grep -n "const REASONING_FLOOR_ROLES\|function isReasoningClass\|if (!isReasoningClass(model))\|^  isReasoningClass,"
46:const REASONING_FLOOR_ROLES = new Set(['synthesizer']);
54:function isReasoningClass(model) {
246:  if (!isReasoningClass(model)) {
432:  isReasoningClass,
```

`54cbe8d3` (*feat(agents,install): move build-error-resolver and adversarial-verifier to the reasoning
tier*) added two comment lines above the declaration. **Every line number in issue #940 is correct
against `54cbe8d3^` and off by +2 against HEAD** — and correct, today, against the copy actually
installed in the Codex plugin cache.

**Reading:** the substantive claim holds ×4 tracked copies. Do not re-quote `:46`; it now points at a
comment line.

---

## Claim 2 — `isReasoningClass` has exactly ONE executable call site (`:246`, in `enforceReasoningFloor`); its export at `:432` is imported by nothing

**Verdict: PARTIALLY-CONFIRMED — the substance is right; "repo-wide" is per-copy, and the line numbers are the same +2 stale.**

Every `isReasoningClass` hit outside `CHANGELOG.md`, `docs/` and `kaola-workflow/archive/`, classified:

| file | line | text | classification |
|---|---|---|---|
| `scripts/kaola-workflow-resolve-agent-model.js` | 56 | `function isReasoningClass(model) {` | **definition** |
| `scripts/kaola-workflow-resolve-agent-model.js` | 244 | `…so isReasoningClass(model) alone is the right…` | **comment** |
| `scripts/kaola-workflow-resolve-agent-model.js` | 248 | `if (!isReasoningClass(model)) {` | **executable call site** (inside `enforceReasoningFloor`, defined `:245`) |
| `scripts/kaola-workflow-resolve-agent-model.js` | 434 | `isReasoningClass,` | **export** |
| `plugins/kaola-workflow/scripts/…` | 56 / 244 / 248 / 434 | identical | definition / comment / **call site** / export |
| `plugins/kaola-workflow-gitlab/scripts/…` | 56 / 244 / 248 / 434 | identical | definition / comment / **call site** / export |
| `plugins/kaola-workflow-gitea/scripts/…` | 56 / 244 / 248 / 434 | identical | definition / comment / **call site** / export |

Remaining hits, all non-code: `CHANGELOG.md:2606,2620` (release prose);
`docs/investigations/2026-06-15-463-completeness-audit.md:46,69` (prose — and note it already records
"zero consumers" for the pre-Slice-1 state); five files under `kaola-workflow/archive/` (archived run
records, tracked but inert).

Strictly, "exactly ONE executable call site repo-wide" is **four** — one per byte-identical copy. Per
copy it is exactly one, and the copies are byte-identical (`49e8c1fc…`), so the claim's intent holds.

**Is the export imported by anything?**

```
$ git grep -nP "require\(.*resolve-agent-model" -- . ':!kaola-workflow/archive'
scripts/test-agent-model-resolver.js:9:const resolver = require('./kaola-workflow-resolve-agent-model.js');
scripts/test-agent-model-resolver.js:10:const codexResolver = require('../plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js');

$ git grep -nP "isReasoningClass" -- . ':!kaola-workflow/archive' ':!CHANGELOG.md' ':!docs' | grep -v "resolve-agent-model.js"
rc=1   (no hits)
```

Two `require()`s exist, both in the resolver's own test, and both take the whole module. The symbol
`isReasoningClass` is **never named outside the four resolver copies** — not in a destructuring
require, not in a test, not anywhere.

**Reading:** CONFIRMED. `isReasoningClass` is reachable only through `enforceReasoningFloor`, and
`enforceReasoningFloor` is reachable only through `resolveAgentModel({enforceFloor:true})` (`:340`)
or the `--enforce-floor` CLI branch (`:409`).

---

## Claim 3 — `enforceFloor` / `--enforce-floor` appears outside the four resolver copies in exactly ONE file: `scripts/test-agent-model-resolver.js`

**Verdict: PARTIALLY-CONFIRMED — true of executable code, false as literally worded (8 tracked files, not 1).**

```
$ git grep -lP "enforceFloor|--enforce-floor" -- . | grep -v "kaola-workflow-resolve-agent-model.js"
CHANGELOG.md
kaola-workflow/archive/issue-927/.cache/docs.md
kaola-workflow/archive/issue-935/.cache/item6-no-refusal-path.md
kaola-workflow/archive/issue-935/.cache/run-gaps-manual.md
kaola-workflow/archive/issue-935/.cache/run-gaps.json
kaola-workflow/archive/issue-935/finalization-summary.md
kaola-workflow/archive/issue-935/mission-list.md
scripts/test-agent-model-resolver.js
```

Classified: `CHANGELOG.md:2606` is release prose describing the Slice-1 build; the six
`kaola-workflow/archive/**` hits are the #935 run's own records (the report that filed this issue, its
gap JSON, its finalization summary and mission list) plus one #927 doc table — **prose and data, no
executable reference**. `scripts/test-agent-model-resolver.js` is the only file that *runs* the flag,
at `:509`, `:535`, `:549`, `:555`, `:572` (option form) — no CLI-flag form there; the CLI branch is
exercised by the option form through `resolveAgentModel`.

**And across what is installed** (the check that matters more than what was authored) —
`~/.claude/{kaola-workflow,agents,commands,skills,plugins,settings.json}`, `~/.codex`,
`~/.config/opencode`, every one searched recursively, resolver copies excluded:

```
(zero hits in every tree)
```

**Reading:** no shipped or installed artifact anywhere passes `--enforce-floor` or `{enforceFloor:true}`.
The claim is right about code and overstated about files.

---

## Claim 4 — the one runtime consumer is `plugins/*/hooks/kaola-workflow-subagent-dispatch-log.sh`, calls `--raw` with no `--enforce-floor`, fail-open by construction

**Verdict: CONFIRMED, with one correction — there are FOUR tracked hook copies, not three. The glob misses the root `hooks/` copy.**

```
$ git ls-files | grep "subagent-dispatch-log"
hooks/kaola-workflow-subagent-dispatch-log.sh            <-- NOT matched by plugins/*/hooks/
plugins/kaola-workflow-gitea/hooks/kaola-workflow-subagent-dispatch-log.sh
plugins/kaola-workflow-gitlab/hooks/kaola-workflow-subagent-dispatch-log.sh
plugins/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh
```

All four are byte-identical (`e404f148…`), **and so are all four installed copies** —
`~/.claude/kaola-workflow/hooks/`, `~/.codex/kaola-workflow/hooks/`,
`~/.codex/plugins/cache/…/7.5.5/hooks/`, `~/.config/opencode/hooks/` — same `e404f148…`. What ships
here *is* what was authored.

### Invocation and fail-openness (static)

`hooks/kaola-workflow-subagent-dispatch-log.sh:36`:

```sh
    MODEL_PLANNED=$(node "$_KW_RESOLVER" "$AGENT_TYPE" --raw 2>/dev/null || printf '')
```

No `--enforce-floor`. Note the double swallow: `2>/dev/null` **and** `|| printf ''`.

```
$ grep -n "exit " hooks/kaola-workflow-subagent-dispatch-log.sh
3:# SubagentStart delivers a JSON payload on STDIN; exit 0 always (fail-open).
6:[ -z "$HOOK_INPUT" ] && exit 0
11:[ -z "$AGENT_TYPE" ] && exit 0
51:[ -z "$HOOK_ROOT" ] && [ -z "$AGENT_ROOT" ] && exit 0
118:exit 0

$ grep -n "exit 1" hooks/kaola-workflow-subagent-dispatch-log.sh ; echo rc=$?
rc=1        (no match)
```

Four `exit 0`, zero `exit 1`. Exactly as claimed.

### Live run (throwaway repo, exit code captured on its own line)

Probe: `hookprobe/edition/{hooks,scripts}/` holding copies of the hook + resolver;
`hookprobe/repo/` a fresh `git init` with `kaola-workflow/probe-project/workflow-state.md`
containing `status: active`; payload piped on stdin.

| leg | agent_type | `KAOLA_AGENT_DIR` | exit code | `model_planned` logged |
|---|---|---|---|---|
| A | `synthesizer` | unset (default `~/.claude/agents`) | **0** | `"opus"` |
| B | `synthesizer` | scratch dir with `synthesizer.md` frontmatter `model: sonnet` | **0** | **`"sonnet"`** |
| C | `not-a-real-role-xyz` | unset | **0** | `""` |

Raw log lines:

```json
{"ts":"2026-08-10T10:59:28Z","agent_type":"synthesizer","agent_id":"probe-1","cwd":"…/repo","model":"","model_planned":"opus"}
{"ts":"2026-08-10T10:59:28Z","agent_type":"synthesizer","agent_id":"probe-1","cwd":"…/repo","model":"","model_planned":"sonnet"}
{"ts":"2026-08-10T10:59:28Z","agent_type":"not-a-real-role-xyz","agent_id":"probe-1","cwd":"…/repo","model":"","model_planned":""}
```

Leg **B is the discriminating one**: a `synthesizer` lowered to `sonnet` is logged as
`model_planned: "sonnet"` and the hook exits 0. Nothing refuses. Nothing warns.

### Positive control — the mechanism *is* capable of refusing

Same lowered agent dir, one axis varied (`--enforce-floor` present/absent), resolver invoked directly:

| leg | command | stdout/stderr | exit |
|---|---|---|---|
| P1 | `node <resolver> synthesizer --raw` | `sonnet` | **0** |
| P2 | `node <resolver> synthesizer --raw --enforce-floor` | `Role 'synthesizer' must resolve to a reasoning-class tier; resolved 'sonnet'.` | **1** |
| P3 | `node <resolver> synthesizer --json --enforce-floor` | `{"result":"refuse","reason":"reasoning_floor_violation","agent":"synthesizer","model":"sonnet","floor":"opus","operator_hint":"…"}` | **1** |
| P4 | `node <resolver> synthesizer --raw --enforce-floor` (default agent dir) | `opus` | **0** |
| P5 | `node <resolver> code-reviewer --raw --enforce-floor` (lowered to `sonnet`) | `sonnet` | **0** |

P2 vs P1 is the whole finding: identical input, one flag, exit 1 vs exit 0. P4 arms the control (a
satisfied floor passes, so P2's failure is not "the flag always fails"). P5 arms the other side (a
non-floor role is never constrained, so P2's failure is specific to the floor role).

**Reading:** CONFIRMED. The hook is the only runtime consumer, it does not pass the flag, it is
fail-open, and the refusal path is real but never asked for.

---

## Claim 5 — consequence: the floor is enforced for no role, including `synthesizer`; live only in its own test

**Verdict: CONFIRMED, and stronger than stated.**

```
$ node scripts/test-agent-model-resolver.js
Agent model resolver tests passed
exit_code=0
```

The suite is green and its floor block (`:183-186` comment, `:505-580` assertions) calls
`resolver.enforceReasoningFloor(...)` and `resolveAgentModel(..., {enforceFloor:true})` **directly** —
it never goes through any shipping path.

Two additions the issue does not make:

**(a) Wiring the flag into the hook would still not produce a refusal.** I ran a scratch copy of the
hook with `--enforce-floor` spliced into line 36 (`sed`, one-line change, scratchpad only):

```
36:    MODEL_PLANNED=$(node "$_KW_RESOLVER" "$AGENT_TYPE" --raw --enforce-floor 2>/dev/null || printf '')
```

| leg | agent_type | agent dir | exit code | `model_planned` |
|---|---|---|---|---|
| D | `synthesizer` | lowered to `sonnet` | **0** | **`""`** |

The resolver exits 1, and `2>/dev/null || printf ''` converts that into an empty string and an exit-0
hook. The one-line fix is measurably a no-op.

**(b) The production consumer was deleted, not never-built.** `CHANGELOG.md:2606` says the floor's
production seam was `kaola-workflow-next-action.js`. That file no longer exists:

```
$ git log --oneline --diff-filter=D -- scripts/kaola-workflow-next-action.js
c0b48043 docs(claude): rewrite CLAUDE.md onto the mission list; remove the banner

$ git show "c0b48043^":"scripts/kaola-workflow-next-action.js" | grep -n "enforceReasoningFloor"
35:const { enforceReasoningFloor, loadCodexSessionProof, isCodexPluginScriptDir } = require('./kaola-workflow-resolve-agent-model');
185:      const check = enforceReasoningFloor(n.role, n.model, { runtime, currentThreadId, sessionProof });

$ git show "c0b48043^":"scripts/test-next-action.js" | grep -c "FLOOR"
25
```

`c0b48043` (the ADR-0017 mission-list rewrite) deleted 9 DAG scripts and 10 of their suites in one
commit, `kaola-workflow-next-action.js` and `test-next-action.js` among them. The floor's only
enforcement seam and its FLOOR-1..4 acceptance tests went with the DAG executor; the primitive was
left standing. **The dead mechanism is a residue of the DAG removal, not an unfinished build.**

---

## Bonus question — every caller of `kaola-workflow-resolve-agent-model.js` anywhere in the shipped surface

Enumerated from `git grep -nP "resolve-agent-model"` over the whole tracked tree plus a
`command grep -rn` sweep of the worktree including dot-directories, then classified by hand.
"Caller" = executes or requires it. **None passes `--enforce-floor`.**

| # | caller | how | `--enforce-floor`? | kind |
|---|---|---|---|---|
| 1 | `hooks/kaola-workflow-subagent-dispatch-log.sh:36` (+3 plugin copies, +4 installed copies, all `e404f148…`) | `node "$_KW_RESOLVER" "$AGENT_TYPE" --raw` | **no** | **production / runtime — the only one** |
| 2 | `scripts/test-agent-model-resolver.js:9,10` | `require()` ×2 | passes `{enforceFloor:true}` in 5 assertions | test |
| 3 | `scripts/test-install-adaptive-config.js:181` | spawns `[resolver, 'implementer', …]` | no | test |
| 4 | `scripts/test-install-model-rendering.js:3048` | spawns `[resolver, role, '--agent-dir', …, '--raw']` | no | test |
| 5 | `scripts/simulate-workflow-walkthrough.js:13123-13125` | **copies** the hook + resolver into a fixture opencode tree, then executes the hook (`:13004, :13068, :13158`) | no | test (reaches the resolver only via caller 1) |

Non-callers that merely *name* the file (checked so they are not mistaken for consumers):

- **Contract validators, text-assert only** — `scripts/validate-workflow-contracts.js:329,331,334`;
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:329`;
  `scripts/validate-kaola-workflow-contracts.js:171,457,458`;
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:234,259,392,483,484`;
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:234,260,394,485,486`.
  These `assertIncludes(…, 'REASONING_FLOOR_ROLES')` — they pin the **token's presence as text**, not
  its behaviour. A guard that reads the string cannot see that nothing calls it.
- `scripts/validate-script-sync.js:159-164` — the 4-copy byte-identity group.
- `scripts/kaola-workflow-install-manifest.js:73` (+ plugin twin) — ships the file.
- `templates/routing/rename-table.js:21,30` — "stays un-renamed" per edition.
- **`install.sh` is NOT a caller.** `resolve_agent_model_for_install()` (`:526-534`) reads the agent
  markdown frontmatter with `awk` via `extract_agent_model`; it never invokes the JS resolver. Its
  comment at `:524` is explicit: "The source agent frontmatter is the ONLY model authority for the install."
- `.opencode*` / `.kimi*` edition trees carry the hook but no resolver; `sync-opencode-edition.js` does
  not reference the resolver at all.

**Answer: exactly one production caller exists (the dispatch-log hook, ×4 copies), and it passes `--raw`.**

---

## Is there even a role for the floor to guard?

Worth stating, because it bears on the fix decision. `synthesizer` still **ships**: it is in
`install.sh:40 REQUIRED_AGENTS`, `scripts/validate-vendored-agents.js:36`,
`plugins/*/config/agents.toml:61`, `agents/synthesizer.md` + three `.toml` twins, and it is installed
on this box at `~/.claude/agents/synthesizer.md`. `README.md:157,189,213,803` documents it as a
reachable role. But **no command or SKILL surface dispatches it** — the DAG that used to provision
legs and dispatch it is gone. Today it is reachable only by the orchestrator naming it in a free
dispatch, which is exactly the path with no tier check on it.

---

## What this means for the fix decision

Laying out both directions with the file lists measured, **not recommending either**.

### If the floor is to be wired into a shipping path

The hook is the wrong lever, and I measured that rather than assuming it (leg D): adding the flag to
line 36 changes nothing, because the hook discards the resolver's exit code twice over and ends in
`exit 0`. Making it bite would mean changing the hook's fail-open construction — which is
`SubagentStart`, i.e. it fires **at** dispatch, not before it, so even an armed hook is at best a
post-hoc report, not a prevention. Whether the runtime honours a non-zero SubagentStart exit is a
capability question I did not measure and cannot answer from this repo.

Files a real wiring would have to touch:

- **A new enforcement seam.** There is no aggregator left to host it — `kaola-workflow-next-action.js`,
  which hosted it, was deleted at `c0b48043`. Any new seam is new machinery, and CLAUDE.md's
  *derive additively* rule asks what observed failure demands it. I found no observed failure: nothing
  in the repo records a `synthesizer` ever having been dispatched at a lowered tier.
- **`hooks/kaola-workflow-subagent-dispatch-log.sh` ×4 tracked copies** (byte-identical; the root copy
  is easy to miss with a `plugins/*` glob) — plus the fail-open contract stated in its own line 3.
- Whatever new test would own the seam. Note the custody rule: `tdd-guide` writes it, not the implementer.

### If the machinery is to be removed

Removed set, in the four byte-identical resolver copies (`scripts/` + `plugins/{kaola-workflow,-gitlab,-gitea}/scripts/`):
`REASONING_FLOOR_ROLES` (`:48`), `isReasoningClass` (`:56-59`), `enforceReasoningFloor` (`:245-259`),
the `options.enforceFloor` branch in `resolveAgentModel` (`:339-349`), the `--enforce-floor` arg
(`:363`, `:374-375`), the usage string (`:401`), the CLI refusal branch (`:405-418`), and three export
entries (`:433-435`). `validate-script-sync.js:159-164` enforces the 4-copy byte identity, so all four
move together or the chains red.

**Tests and pins that fall out with it** — this is the list the CLAUDE.md rule *"a test is deleted with
its mechanism, never repaired ahead of it"* applies to:

| artifact | what dies |
|---|---|
| `scripts/test-agent-model-resolver.js` | the floor block: comment `:183-186`, export assertion `:187`, and assertions `:505-580` (the three `tmpFloor*` fixtures). ~80 of 581 lines. The rest of the file is unrelated and survives. |
| `scripts/validate-workflow-contracts.js:329` | `assertIncludes(…, 'REASONING_FLOOR_ROLES')` |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:329` | same (byte-pair twin) |
| `scripts/validate-kaola-workflow-contracts.js:171` | same, Codex plugin tree |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:392` | same, GitLab tree |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:394` | same, Gitea tree |
| `scripts/test-agent-profile-parity.js:51-52` | `{ role: 'synthesizer', token: 'REASONING_FLOOR_ROLES' }` — the md↔toml twin pin |

**Prose surfaces carrying the token, which would go false:** `agents/synthesizer.md:14`;
`plugins/{kaola-workflow,-gitlab,-gitea}/agents/synthesizer.toml:18` (identical sentence ×3);
`docs/conventions.md:208` (the surface table row). Those four agent files are what
`test-agent-profile-parity.js:52` reads, so the pin and the prose move together.

**Untouched either way:** `DEFAULT_AGENT_MODELS['synthesizer'] = 'opus'` (`:42`) is the *default*, not
the floor — it keeps working with no floor machinery at all, and it is what leg A measured
(`model_planned: "opus"`). Removing the floor does not lower anyone's default tier.

### The framing question the decision turns on

The floor's job was to stop a *plan* from authoring a lowered tier column for a node the executor would
then dispatch. There are no plans and no executor any more. Under a mission list the orchestrator
chooses the model at dispatch time, and CLAUDE.md's frame is that the workflow is bookkeeping for the
agent, never a judge. Whether a tier floor is a thing the system should still assert is the value call —
that belongs to the user, not to this measurement.

---

## Open / unmeasured

- **Whether Claude Code, Codex, or opencode honour a non-zero `SubagentStart` hook exit** as a dispatch
  block. Not measured — it needs a real runtime dispatch, not a shell probe, and the hook's own code
  makes the question moot today (it always exits 0).
- **Whether `synthesizer` has ever actually been dispatched** in this repo's history. I did not scan
  the dispatch logs; the question is about the fix's value, not its premise.
- **The stale Codex plugin-cache copy** (`c22f3c81…`, pre-`54cbe8d3`) is #944's territory. It is
  reported here only because it explains the issue's line numbers; I did not investigate it further.
