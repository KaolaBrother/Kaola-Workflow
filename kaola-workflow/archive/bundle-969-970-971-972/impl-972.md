# Impl — #972: install-all refreshes Codex on content difference, not version equality alone

**Verification tier: `tests-green`.** The authored suite (`scripts/test-install-all.js`) passes at
full scope, having been RED on 9 assertions before the change.

Baseline commit `7e962bdc86d188e1da99af3309a13ae0dd3d9e97`, worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972`, branch
`workflow/bundle-969-970-971-972`.

## Files changed

- `install-all.sh` — the only file touched. `git status --porcelain -- install-all.sh` → ` M install-all.sh`.

No test file was modified. Other agents' in-flight edits in the shared worktree
(`scripts/simulate-workflow-walkthrough.js`, `scripts/test-bash-block-guards.js`,
`scripts/test-gap-sweep.js`, `scripts/test-opencode-edition.js`,
`scripts/validate-workflow-contracts.js`, and the `plugins/**` regenerations that appeared
mid-run) were left untouched.

## The trigger rule implemented

Refresh when **the installed version differs from the tree manifest's**, OR **the cache serves
content that differs from the tree's plugin directory and the marketplace is a local directory**.

Stated as the code reads it, at `install-all.sh:483-503`:

| condition | outcome |
|---|---|
| `installed != tree` | refresh (unchanged; **not** gated on local — S7/S8) |
| `installed == tree`, `marketplaceSource.sourceType == "local"`, content **differs** | refresh (new) |
| `installed == tree`, `sourceType == "local"`, content **agrees** | report current (unchanged) |
| `installed == tree`, `sourceType` anything else or absent | report current, zero mutating calls (unchanged) |
| `installed == tree`, local, content question **unanswerable** | report current, zero mutating calls |

The gate is **explicitly local**, not "not explicitly git": the third field of the plugin row is the
empty string when the row carries no `marketplaceSource`, and the empty string is not `local`.

The refresh path itself (`remove` best-effort, then `add`, both bounded) is **unchanged** — reused,
not reimplemented, exactly as briefed. No new status, no new degrade call site, no PARTIAL for the
git-marketplace case.

### Mechanism, in three pieces

1. `codex_installed_plugin_row()` now prints a third tab-separated field, the marketplace
   `sourceType` (`install-all.sh:317-354`). Empty when the row declares no provenance.
2. `codex_plugin_cache_dir()` (`install-all.sh:356-364`) derives
   `<codex home>/plugins/cache/<marketplace>/<plugin>/<version>/`, both halves split out of the
   installed row's own `pluginId` — never assumed from this tree. Verified against the live row:
   `kaola-workflow@kaolabrother-kaola-workflow` →
   `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.8.0/`.
3. `codex_cache_content_state()` (`install-all.sh:365-400`) walks both directories and compares
   every file byte for byte (size first, contents only when sizes agree). **Three-valued**: 0 agree,
   1 differ, 2 unanswerable. UNKNOWN is deliberately distinct from DIFFERS — a difference nobody
   could measure must never fire a refresh, or a box whose cache this wrapper reads wrongly would
   churn a remove+add on every single run. Cost on the real tree: one walk over 47 files (zero
   symlinks), milliseconds.

## How the re-read proof was made non-vacuous

The pre-existing proof at `install-all.sh:544-550` re-reads the **version** and fails if it did not
reach the tree's. On the content-triggered path the versions are equal *by construction* — that is
the whole premise of the defect — so that proof cannot fail there and would certify a runtime that
never converged.

So the proof now observes **the axis that was refreshed** (`install-all.sh:551-562`): when the
refresh was content-triggered, the cache directory at the post-refresh version must compare **equal**
to the tree. This is a positive requirement, not the absence of a detected difference — state 2
(unanswerable) fails it too, matching the file's existing stance one branch above ("plugin absent
after re-add — cannot confirm convergence"). A refresh whose result cannot be read is not a
convergence.

Test S5 is what pins this, and its two fixture controls are what make it a real proof: the refresh
genuinely leaves differing content, and the version matches the tree throughout. S5 was RED at
baseline and is GREEN now, and **only the new content proof can produce that transition** — the
version re-read sees `5.0.0 == 5.0.0` in that fixture. Likewise S2's green (remove+add issued at
equal versions) against S1/S3/S4's green (zero mutating calls with content differing in S3/S4)
discriminates the gate: if `sourceType` were never read, S2 would fail; if it always read `local`,
S3 and S4 would fail. Both hold.

## Success criteria — literal output

### 1. `node scripts/test-install-all.js`

Before (baseline `7e962bdc`, unmodified `install-all.sh`):

```
FAIL: S2: a runtime serving stale content is NOT reported current — tail: ================ install-all summary (unknown) ================ |   claude     PASS     (exit 0) |   opencode   PASS     (exit 0) |   codex      PASS     (exit 0)  — plugin 5.0.0 |   kimi       PASS     (exit 0) | ================================================================ | install-all: all runtimes OK |
FAIL: S2: `codex plugin remove <pluginId>` was issued — calls: ["plugin list --json"]
FAIL: S2: `codex plugin add <pluginId>` was issued — calls: ["plugin list --json"]
FAIL: S2: the runtime ends up SERVING the tree content — got "cache content: A run normally carries one issue\n"
FAIL: S5: the refresh was attempted — calls: ["plugin list --json"]
FAIL: S5: a refresh that did not converge the CONTENT makes the wrapper exit non-zero (got 0)
FAIL: S5: the un-converged runtime reads FAIL — tail: ================ install-all summary (unknown) ================ |   claude     PASS     (exit 0) |   opencode   PASS     (exit 0) |   codex      PASS     (exit 0)  — plugin 5.0.0 |   kimi       PASS     (exit 0) |
FAIL: S5: no PASS row for a runtime that did not converge
FAIL: S5: the all-clear sentinel is withheld when the served content is not at HEAD

install-all contract test FAILED: 9 failure(s), 161 passed.
```
exit code **1**.

After:

```
install-all contract test passed (170 assertions).
```
exit code **0**.

170 = the 161 that already passed + the 9 that were red. **Every pre-existing assertion still
passes** — no assertion was lost, and the count is the arithmetic proof of it.

### 2. `bash -n install.sh uninstall.sh install-all.sh`

Before: exit **0** (no output). After: exit **0** (no output).

### 3. `./install-all.sh --check`

Run from the worktree. Non-mutating by construction (`run_one` returns PLAN at `:220-223`, premise-972's `:217-220` before
my +3-line prose shift, before
executing anything; the convergence step's `--check` arm returns before `remove`/`add`; the content
walk is read-only).

```
install-all: reinstalling Kaola-Workflow runtimes from 7e962bdc
install-all: root=/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972 scope=global forge=github (dry-run)

>>> [claude] bash .../install.sh --forge=github

>>> [opencode] bash .../install-opencode.sh --forge=github --global

>>> [codex] node .../plugins/kaola-workflow/scripts/install-codex-agent-profiles.js --global

>>> [codex] PENDING marketplace plugin refresh: at 7.8.0, but the served content differs from the tree (kaola-workflow@kaolabrother-kaola-workflow)

>>> [kimi] bash .../install-kimi.sh --forge=github --global

================ install-all summary (7e962bdc) ================
  claude     PLAN     (exit -)
  opencode   PLAN     (exit -)
  codex      PLAN     (exit -)  — plugin refresh pending: served content differs at 7.8.0
  kimi       PLAN     (exit -)
================================================================
install-all: dry-run complete — no changes made
```
exit code **0**.

**The codex row, literally:** `  codex      PLAN     (exit -)  — plugin refresh pending: served content differs at 7.8.0`

At HEAD the same command printed `>>> [codex] marketplace plugin already at 7.8.0 (...)` and
`codex      PLAN     (exit -)  — plugin 7.8.0`. The live defect premise-972 reproduced is now
reported instead of concealed — on the real box, against the real cache, with no stub involved.

## The host `~/.codex` was NOT mutated

- No `codex plugin add` / `codex plugin remove` / non-dry `install-all` was ever issued. The only
  live codex invocations were `codex plugin list --json` (read) and the `--check` dry run.
- Whole-cache digest snapshot taken before the live runs and again after all work:
  `find ~/.codex/plugins/cache -type f -exec shasum -a 256 {} \;` over **1310 files** — `diff`
  between the two snapshots is **empty**.
- The file premise-972 used as the staleness witness is untouched:
  `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.8.0/skills/kaola-workflow-next/SKILL.md`
  still has mtime `8月 10 23:22` and sha256 `462c18a66edb94f2f076e9bfd555516436c832c435eb59ac62faf689b6ace530`
  — exactly the digest premise-972 recorded for the installed copy.
- The suite's own hermeticity holds: `HOME` and `CODEX_HOME` are redirected into the fixture on every
  invocation, and my new cache-path derivation reads `${CODEX_HOME:-${HOME:-}/.codex}`, so it follows
  that redirection rather than escaping it.

## Prose corrected (the code now answers what the comments claimed to own)

The section comment at `:252-259` claimed the wrapper owns "is this runtime at HEAD" while naming
only *a tree bump* as the failure. That was the discrepancy premise-972 called genuine-but-weaker.
It now names both ways the cache goes stale — a bump, and prose moving at an unchanged version,
"which no comparison of the two version strings can see". The file header (`:13-26`) and the `--help`
text (`:99-124`) described the old version-only mechanism and its version-only re-read; both are
corrected. The header's `PASS MEANS CONVERGED, NOT "EXITED 0"` sentence is untouched — it already
stated the intent and did not need restating.

Comments state the result (what must be true), not the method: the re-read comment says the proof is
taken on the axis that was refreshed and why a version re-read certifies nothing there, rather than
naming the function that does it.

## Findings and deliberate corners — for the orchestrator

1. **[RESOLVED — see the addendum at the end of this file. The orchestrator ruled the oracle must
   move, the test author landed W1/W2/W3 to pin it, and it is implemented. The paragraph below is
   the original flag, kept because it is the reasoning the ruling acted on.]**
   **The content oracle is `$ROOT/$CODEX_PLUGIN_DIR`, and a local marketplace can point elsewhere.**
   Implemented exactly as briefed. But the live row shows `marketplaceSource.source` =
   `/Users/ylpromax5/Workspace/Kaola-Workflow` (the **main** checkout) — so `codex plugin add`
   installs from main, not from whatever tree `install-all.sh` was invoked from. Consequence: running
   a full (non-dry) `install-all` **from a worktree** whose `plugins/` differs from main's would fire
   remove+add, get main's content back, still differ from the worktree, and report `codex FAIL` —
   every run. That is reachable today: this worktree's `plugins/` already differs from main's in 9
   files (other agents' in-flight edits).
   I did **not** deviate, for a reason: the version axis already behaves this way (a worktree at a
   bumped version already churns and FAILs against a main-rooted marketplace), so `$ROOT` is the
   file's existing model of "the tree" and splitting it per-axis would be worse. The one-line
   alternative, if you want it, is to compare against the row's own `source.path` (which is
   `<marketplace root>/plugins/<name>`, absolute, and present on the live row) instead of
   `$ROOT/$CODEX_PLUGIN_DIR` — the authored tests cannot discriminate the two, since the fixture sets
   them to the same path. **This is a judgement call I am flagging rather than taking.**
2. **State 2 (unanswerable) has no test.** No S-case exercises a missing cache directory. Its only
   effect is "behave exactly as today", so it is a conservative fallback rather than new behaviour —
   but it is unpinned, and I did not add a test (custody).
3. **An extra file appearing only in the cache would read as a difference forever.** The comparison
   is faithful — it has no ignore list — so e.g. a `.DS_Store` created inside the version-keyed cache
   directory would trigger a refresh whose `add` cannot remove it, giving a standing FAIL. Not
   observed (premise-972 measured `missingInInstall=0` and no extra-in-install files, and the
   1310-file snapshot is clean), so nothing was built for it. What would force a change: any report
   of a cache-only file.
4. **CHANGELOG not touched — centrally owned, per the orchestrator's ruling.** `## [Unreleased]` →
   `### Changed` exists at HEAD carrying the #968 entry. This is a user-visible behaviour change and
   CLAUDE.md's standing rule asks for an entry, but four issues land against one `[Unreleased]`
   section and the CHANGELOG must be written before the chain-receipt run or the receipt goes stale
   against it, so the orchestrator docks all four entries. I did not touch the file.

## The docs-docking surface for #972 is CHANGELOG only

Recorded here so it does not have to be re-derived at finalize. Swept with
`git grep -ln "install-all"` across the whole tree and
`git grep -n "version-keyed|plugin convergence|converge_codex|marketplace plugin"` outside
`install-all.sh` / `CHANGELOG.md` / `scripts/test-install-all.js`.

**Nothing outside `install-all.sh` describes the convergence mechanism, so nothing outside it goes
stale from this change.** The live prose surfaces that name `install-all.sh` describe only its
orchestrator role, all of which remains true: `README.md:225` (thin orchestrator, short SHA,
PASS/FAIL summary table, non-zero on any failure, `--skip`, `--check` preview),
`docs/opencode-edition.md:228-231`, `docs/kimi-edition.md:244`, `CLAUDE.md:147` (the command only).
Everything else is `kaola-workflow/archive/**` and `.roadmap/` history, which is a record and is not
docked.

**One live citation, and it is a pointer rather than a description — but it is anchored to a heading
I must not move.** `docs/architecture.md:328` cites this work by section name:

> `partial — the split stated at `install-all.sh` (§ Codex marketplace-plugin convergence)`

That anchor is the literal comment heading at `install-all.sh:250`,
`# Codex marketplace-plugin convergence.` It is a *pointer* to where the split is stated, so a
behaviour change does not stale it — but **renaming that heading would break the citation silently**
(the doc-claims convention from #955). My diff does not touch that line: `git diff -U0 -- install-all.sh
| grep -c "Codex marketplace-plugin convergence"` → **0**. The prose I corrected is the body
underneath it (`:252-259`), not the heading.

*(Correcting my earlier message to you, which said no doc surface outside `install-all.sh` describes
the mechanism. The substance holds — architecture.md does not describe it — but I had not yet found
that architecture.md **points at** it by heading, and that is the one thing a future edit here could
break.)*

## Other surfaces — none owed

`install-all.sh` has exactly one copy in the tree (no forge-ported variants; `find . -name
"install-all*"` returns one path), and `edition-sync.js` does not mention it, so no cross-edition
propagation is owed. No suite other than `test-install-all.js` reads the file —
`test-opencode-edition.js` and `test-kimi-edition.js` mention it only in comments, and
`simulate-workflow-walkthrough.js` has **0** references to it, so the walkthrough structurally cannot
observe this change; I did not run it, and could not have attributed its result anyway with other
agents editing it mid-run.

Worth knowing for chain scoping: **both of my verification commands are literal steps of the claude
chain.** `package.json:40` (and `:46` for `:full`) runs `bash -n install.sh uninstall.sh
install-all.sh` early and `node scripts/test-install-all.js` as the final step. Both are green here.
`install-all.sh` is also in the `files` array at `package.json:29`.

---

# Addendum — the oracle swap (finding #1, ruled and implemented)

**Ruling implemented:** the comparison oracle is the **directory the plugin is installed from**, as
the installed row declares it — not `$ROOT/$CODEX_PLUGIN_DIR`, the tree the wrapper happened to be
invoked from. The reason is that `codex plugin add` installs from that source, so a tree oracle can
demand a repair the repair mechanism provably cannot deliver.

Still `tests-green`. Same file, `install-all.sh`; no test file and no CHANGELOG touched.

## What I plumbed out of the row, and which field I read

`codex_installed_plugin_row()` emitted `version \t pluginId \t sourceType` and carried no path. It
now emits a fourth field, and **the field I read is `source.path`**:

```
version \t pluginId \t marketplaceSource.sourceType \t source.path
```

**Why `source.path` and not `marketplaceSource.source`.** The two are kept mutually consistent by the
fixture and are consistent on the live install, so the tests do not force the choice — it is mine,
and it turns on what each field *means*:

- `source.path` **is** the plugin directory: `/Users/ylpromax5/Workspace/Kaola-Workflow/plugins/kaola-workflow`
  on the live row. It is the row's own statement of where this plugin comes from, and it is exactly
  the directory to compare against. Nothing has to be derived.
- `marketplaceSource.source` is the marketplace **root**: `/Users/ylpromax5/Workspace/Kaola-Workflow`.
  Reaching the plugin directory from it means appending `plugins/<forge-selected-name>` — i.e.
  hardcoding an assumption about how a marketplace lays its plugins out internally. That assumption
  holds for this repo and would silently produce the wrong directory for a marketplace organised any
  other way, and a wrong directory reads as "unanswerable" (state 2) and quietly disables the check.

So: read the path that is stated, do not reconstruct a path that is implied. The **gate** still reads
`marketplaceSource.sourceType == "local"` exactly as constrained — the two fields answer different
questions (*is a local directory the arbiter at all?* vs *which directory?*).

An absent `source.path` needs no new branch: the empty string fails the existing `[[ -d "$2" ]]`
guard, yielding state 2 (unanswerable), which already means "change nothing".

## What moved

- `install-all.sh:356-357` — the row reader emits `source.path`.
- `install-all.sh:489-490` — parsed into `source_path` (pure parameter expansion, matching the
  existing style; a trailing empty field parses correctly).
- **The two comparison sites, which is the whole change**: the trigger at `:506-507` and the
  post-refresh proof at `:566-567` now pass `"$source_path"` where they passed
  `"$ROOT/$CODEX_PLUGIN_DIR"`. Nothing else was restructured — the local gate, the ungated version
  trigger, the refresh path, and the non-vacuous content re-read are all exactly as they were.
- `$CODEX_PLUGIN_DIR` now feeds **only** `CODEX_PLUGIN_MANIFEST` (the version source, `:162-166`),
  which is correct and deliberate: the version question is still asked of the invoking tree's
  manifest, per the standing constraint that the version trigger stays as it was (S7/S8).
- Messages now name the directory compared against rather than saying "the tree" — the `--check` row
  reads `served content differs from its source`, and the log line prints the actual path, so a
  reader can see *which* checkout arbitrated. No test pins any of these strings (verified before
  rewording).
- Prose corrected where the swap made it wrong: the helper contract comment, the file header, the
  `--help` text, and the trigger comment. The section comment gained one sentence naming the boundary
  a reader would otherwise get wrong — that "at HEAD" means the checkout the marketplace installs
  from, so running from a linked worktree answers about the marketplace and not about the worktree.
  **The heading `# Codex marketplace-plugin convergence.` is untouched**, so `docs/architecture.md:328`'s
  citation still resolves.

## Success criteria — literal output

### `node scripts/test-install-all.js`

Before (new W cases RED against the tree oracle):

```
FAIL: W1: a runtime already serving its source is NOT refreshed — calls: ["plugin list --json","plugin remove kaola-workflow@stub-market","plugin add kaola-workflow@stub-market","plugin list --json"]
FAIL: W1: it is reported current — tail:   claude     PASS     (exit 0) | ... |   codex      FAIL     (exit 0)  — plugin convergence FAILED: served content is not the tree's (plugin 5.0.0) | ...
FAIL: W1: the wrapper exits 0 (got 1)
FAIL: W1: codex reads PASS
FAIL: W1: a converged runtime is never FAIL just because the invoking tree differs from its source
FAIL: W1: all-clear on a converged box
FAIL: W2: `codex plugin remove <pluginId>` was issued — calls: ["plugin list --json"]
FAIL: W2: `codex plugin add <pluginId>` was issued — calls: ["plugin list --json"]
FAIL: W2: the runtime ends up serving what its configured source installs — got "worktree content: what the cache also carries\n"
FAIL: W3: the refresh CONVERGED, so the first run exits 0 (got 1) — tail: ...
FAIL: W3: the first run reads PASS
FAIL: W3: a second immediate invocation refreshes NOTHING — a converged runtime can never be asked to converge again — calls: ["plugin remove kaola-workflow@stub-market","plugin add kaola-workflow@stub-market"]
FAIL: W3: the second run exits 0 (got 1)
FAIL: W3: the second run reports the runtime current — tail: ...
FAIL: W3: no permanently-red row
FAIL: W3: the all-clear survives a repeat run

install-all contract test FAILED: 16 failure(s), 180 passed.
```
exit **1**. The W1 call log is the loop stated as evidence: remove+add issued, then `codex FAIL`.

After:

```
install-all contract test passed (196 assertions).
```
exit **0** — 180 + 16, the count the shadow proof predicted. All 170 assertions from the first round
still pass inside it.

### `bash -n install.sh uninstall.sh install-all.sh`

exit **0**, no output.

### `./install-all.sh --check`

Invoked **from the worktree**, so this is the divergent case itself: the oracle is now main, the
marketplace's checkout, rather than the worktree the command ran in.

```
install-all: root=/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972 scope=global forge=github (dry-run)
>>> [codex] PENDING marketplace plugin refresh: at 7.8.0, but the served content differs from /Users/ylpromax5/Workspace/Kaola-Workflow/plugins/kaola-workflow (kaola-workflow@kaolabrother-kaola-workflow)
  codex      PLAN     (exit -)  — plugin refresh pending: served content differs from its source at 7.8.0
install-all: dry-run complete — no changes made
```
exit **0** (captured without a pipe — a `| tail` reports the pager's status, not the wrapper's).

**The codex row, literally:**
`  codex      PLAN     (exit -)  — plugin refresh pending: served content differs from its source at 7.8.0`

The staleness it reports is real and is the filed defect: main's committed prose versus a cache last
written 08-10. Note the message now names the directory it compared against, which is the fact that
was ambiguous before the swap.

### `~/.codex` untouched — same digest method

`find ~/.codex/plugins/cache -type f -exec shasum -a 256 {} \; | sort`, **1310 files**, taken before
this round's live runs and again after: `diff` **empty**. Also diffed against the snapshot taken
before any of my work at all: **identical**. The witness file still reads mtime `8月 10 23:22`,
size 14803. No `codex plugin add` or `remove` was issued at any point in this session; the only live
codex invocations were `plugin list --json` and the two dry runs.

## What the swap costs, stated plainly

Running `install-all` from a linked worktree now reports on **the marketplace's checkout**, not on
the worktree. If your worktree's `plugins/` carries prose main does not have, the wrapper will say
the runtime is current — because it is current with respect to the only tree a refresh could install
from. That silence is the deliberate trade the ruling makes, and it is the same stance already
settled for a git marketplace: a difference this wrapper cannot arbitrate is not reported as
staleness. The section comment now says so in the file, so the next reader does not have to
rediscover it.

---

# Addendum 2 — review findings F1 and F2

Both fixed. Still `tests-green`, `install-all.sh` only; no test file, no CHANGELOG, host `~/.codex`
untouched. Final `install-all.sh` sha256 `e724cd1eca4359201b8f184f27e9ef039d33138d9b5dc2afcb45cc496c622961`.

**Both findings turned out to be the same principle applied to two places**, which is why the diff is
small: *everything the runtime is measured against comes from the directory it is installed from, and
a measurement that did not happen is never reported as one that succeeded.*

## F2 — the mixed oracle (Y1, Y2)

The trigger asked the content question of the install-from directory but the version question of the
invoking tree, so the two could disagree with no reachable fixed point. **Fixed at the source of the
divergence rather than at the two comparison sites**: once the row is parsed, the target version is
re-read from the install-from directory's own `.codex-plugin/plugin.json`
(`install-all.sh:498-511`). Both the trigger's version test and the post-refresh version proof then
read one oracle, because they read the same variable.

This is why the fix is ~6 lines rather than two edits: the version comparison at the trigger and the
proof at `:591` were never separately wrong — they were reading a value sourced from the wrong tree.
The invoking tree still selects *which* plugin is asked about (the forge edition) and still supplies
the version when the source declares none.

`codex_plugin_manifest_field()` grew an optional second argument (the manifest path, defaulting to
the forge-selected one) rather than gaining a second copy — `:271-284`.

## F1 — the silently-disabled check (X1..X4), and its scope (Z1)

State 2 now degrades: `install-all.sh:529-539`. A third `codex_degrade` call site, matching the
existing vocabulary (`plugin convergence SKIPPED` / `plugin convergence skipped: …`), no new status,
no new machinery. **No churn** — it returns before any refresh, because a difference nobody could
measure gives a refresh nothing to converge to. The printed reason names *both* paths that could not
be compared, so the user can see which side is wrong (X4's door is the cache, X1–X3's is the source).

**The scoping is structural, not conditional.** `cstate` is initialised 0 and can only be assigned by
the comparison, which only runs inside the `source_type == "local"` branch. So a git-sourced row and
a row with no provenance cannot reach 2: nothing was attempted, so nothing is incomplete, and they
stay a plain PASS. UNVERIFIED keeps meaning "I tried and could not tell".

## Mutation proof — all three properties are armed

You warned that X1–X4 passing is not evidence the scoping is right. Agreed, so I proved it rather
than asserted it. Scratch mirror (symlinked tree, real copies of `install-all.sh` and the suite), with
the **control digest-verified identical to the worktree file and reproducing 254/254 exactly** before
any mutant:

| mutant | what it breaks | result |
|---|---|---|
| degrade also when nothing was attempted (`\|\| "$source_type" != "local"`) | the scoping | **only Z1 reds** — Z1[git] ×4 + Z1[no-provenance] ×4 = 8; **X1–X4 stay green** |
| `if false` on the state-2 branch | the degrade itself | **X1, X2, X3, X4 red** — 16 assertions |
| drop the version override (`&& true`) | the one-oracle fix | **Y1 ×6 + Y2 ×3 red** — 11 assertions |

The first row reproduces your warning exactly: against the precise over-broad shape, Z1 is the only
observer in the suite. So Z1's green here is load-bearing evidence, not a coincidence.

## Comment audit — the check you asked for

Re-read every comment I have touched against the shipped code. **Two were made false by F2's fix and
are corrected**: the file header (`:19-31`) and the `--help` text (`:114-122`) both still said the
version is compared against *the tree's* `.codex-plugin/plugin.json`, which stopped being true the
moment the version target moved to the source. Both now state which directory each question is asked
of, and name the fallback rather than implying there is none. The one-oracle comment itself was
overstated in its first draft ("the invoking tree does not decide what the plugin should be serving")
and now says its version stands while the source declares none — which is what the code does.

Still true and left alone: the status table (`PARTIAL` is exactly this new case, and `PASS` now means
what it says on both axes), the re-read comment, and the section comment — whose "HEAD means the
checkout the marketplace installs from" sentence became *more* true, since both axes now honour it.
`.codex-plugin/plugin.json` still appears in the source, so Q's pin holds.

## Success criteria — literal output

Before (shipped bytes): exit **1**, `install-all contract test FAILED: 25 failure(s), 229 passed.` —
X1–X4 each printing `codex PASS (exit 0) — plugin 5.0.0`, byte-identical to the verified control row;
Y1 `plugin convergence FAILED: still 6.0.0, tree 5.0.0`; Y2 `kimi NOT-RUN`.

After:

```
install-all contract test passed (254 assertions).
```
exit **0**.

`bash -n install.sh uninstall.sh install-all.sh` → exit **0**, no output.

`./install-all.sh --check` → exit **0** (captured without a pipe):

```
  codex      PLAN     (exit -)  — plugin refresh pending: served content differs from its source at 7.8.0
```

Unchanged from round 2, which is the right outcome: this box's marketplace is local and readable, so
the comparison is answerable and the answer is still "stale" — the filed defect, still correctly
reported.

**Host `~/.codex` untouched**: 1310 files by the same digest method, `diff` empty across this round
and **identical to the snapshot taken before any of my work**. Witness file still mtime `8月 10 23:22`,
size 14803. No `codex plugin add`/`remove` at any point in this session.

**Note on the expected count.** You predicted ~245; the suite reports **254** (229 that were already
passing + the 25 that were red). Flagging the difference rather than letting it read as a mismatch —
exit 0 with zero failures is the outcome either way, but if 245 was measured on your shadow then your
shadow and this worktree's suite are not the same revision.

## One thing I could not explain, and did not paper over

While building the mutation mirror I copied `install-all.sh` out of the worktree and the copy was
**not my file**: it contained a different implementation of these same two findings (a `source_version`
local and an `else cstate=2`, i.e. the over-broad degrade), and it failed Z1 ×8 and S6 ×2. A fresh copy
taken moments later was byte-faithful, the worktree file's mtime predated the copy, and the divergent
artifact has since disappeared from the scratch directory, so I cannot reproduce it and I am not going
to invent a mechanism for it.

What I can state: the current file is mine (`grep -c source_version` → **0**), its sha is recorded
above, it passes 254/254, and the mutation proofs above ran against a control digest-verified against
it. **Recommendation for finalize: check `install-all.sh`'s digest against the value recorded here
before the chain run**, since a second implementation of this file demonstrably existed at some point
and the two differ in exactly the property Z1 guards.
