# Premise check — #972: "install-all reports codex PASS on version equality"

## Setup

- Commit: `7e962bdc86d188e1da99af3309a13ae0dd3d9e97` (main, clean; `origin/main` identical)
- `codex-cli 0.147.0`; `install-all.sh` is 531 lines
- Live `~/.codex` inspected only — no mutating codex call was issued. The one wrapper run was
  `./install-all.sh --check` (verified non-mutating at `install-all.sh:217-220` before running).

**Headline: the issue's mechanism reproduces live, right now, on this box.** The substance of every
claim survives. Two claims are wrong in their details (a line number, and "no force path anywhere in
the file"), and one feasibility assumption behind the issue is materially better than it assumes:
the marketplace here is **local**, not remote.

---

## Claim 1 — "install-all.sh:426-430 decides currency with `if [[ "$installed" == "$tree" ]]`, pure version equality, then `return 0`, with no content comparison and no force path anywhere in the file"

**QUALIFIED** — the check is real and is pure version equality, but the line number is off by one and
"no force path anywhere in the file" is **false**.

The check is at `install-all.sh:425-430`, not 426-430:

```bash
425	  if [[ "$installed" == "$tree" ]]; then
426	    echo ""
427	    echo ">>> [codex] marketplace plugin already at $tree ($plugin_id)"
428	    R_NOTE[$idx]="plugin $tree"
429	    return 0
430	  fi
```

`$installed` comes from `codex plugin list --json` (`install-all.sh:315-344`), `$tree` from the
tree manifest's `version` field (`install-all.sh:258-270`). Both are version **strings**. No content,
hash, size or mtime is consulted. **"no content comparison" SURVIVES.**

**"no force path anywhere in the file" is REFUTED.** A full-file grep for
`force|refresh|hash|content|checksum|--reinstall|invalidate` returns 9 hits, and a real refresh path
exists at `install-all.sh:439-469`:

```bash
440	  echo ">>> [codex] marketplace plugin STALE: $installed -> $tree — refreshing $plugin_id"
445	  run_bounded "$CODEX_PLUGIN_OP_TIMEOUT_SECS" "$CODEX_BIN" plugin remove "$plugin_id" || true
446	  if ! run_bounded "$CODEX_PLUGIN_OP_TIMEOUT_SECS" "$CODEX_BIN" plugin add "$plugin_id"; then
```

followed by a proving re-read at 452-466. This matters more than a nitpick: **the mechanism the issue
asks for already exists and is already proven to work.** What is missing is only the *trigger* — it is
reachable solely when the two version strings differ. The `return 0` at line 429 is what makes it
unreachable for a same-version content change.

---

## Claim 2 — "after install-all on a tree carrying new routing prose at unchanged version 7.8.0, the cached SKILL still carried the retired rule with a two-day-old mtime, while claude/opencode/kimi carried the new rule"

**SURVIVES — reproduced live at HEAD, not merely re-derived.**

Marker strings: NEW = `three to five issues`; RETIRED = `A run normally carries one issue`.

| surface | file | new | old | mtime |
|---|---|---|---|---|
| REPO (codex plugin src) | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | 1 | 0 | 08-12 22:31 |
| **CODEX cache 7.8.0** | `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.8.0/skills/kaola-workflow-next/SKILL.md` | **0** | **1** | **08-10 23:22** |
| CLAUDE | `~/.claude/commands/workflow-next.md` | 1 | 0 | 08-12 22:53 |
| OPENCODE | `~/.config/opencode/command/workflow-next.md` | 1 | 0 | 08-12 22:53 |
| KIMI | `~/.kimi-code/skills/workflow-next/SKILL.md` | 1 | 0 | 08-12 22:53 |

The cached mtime `08-10 23:22` is **two days old** — exactly as filed. The other three were rewritten
`08-12 22:53`, i.e. an `install-all` ran *after* the prose commit and all three took it; Codex did not.

Full-tree hash comparison, repo `plugins/kaola-workflow/` vs the installed 7.8.0 cache:

```
DIFF  skills/kaola-workflow-finalize/SKILL.md
DIFF  skills/kaola-workflow-init/SKILL.md
DIFF  skills/kaola-workflow-next/SKILL.md
---- same=44 diff=3 missingInInstall=0
（no EXTRA-IN-INSTALL files）
```

Only the three SKILL.md files diverge; the 44 agents/scripts/hooks/config files are byte-identical.

The blob identities settle that this is *not* an unpushed-work artifact:

```
origin/main blob: 3605bf58517923664c4990d3a6405eed36874c4d51ca66834c0267547524b86d
worktree    : 3605bf58517923664c4990d3a6405eed36874c4d51ca66834c0267547524b86d
installed   : 462c18a66edb94f2f076e9bfd555516436c832c435eb59ac62faf689b6ace530
```

`origin/main == HEAD == 7e962bdc`; the remote already has the new prose. Only the cache is behind.

**Timeline (fully reconciles the mechanism):**

| time (08-12) | event |
|---|---|
| 14:28 | `12261cf8 chore: release 9.8.0 (codex 7.8.0)` — plugin manifest bumped 7.7.0 → 7.8.0 |
| 15:01–15:02 | install-all: version **mismatch** → remove+add fired → cache dir `7.8.0/` created |
| 22:29 | `fd00ef63 change: the bundle is a run's default shape…` — all three SKILL.md rewritten, **version untouched** |
| 22:53 | install-all: claude/opencode/kimi rewritten; codex hit `7.8.0 == 7.8.0` → skipped |

The dry run at HEAD emits the filed line verbatim:

```
>>> [codex] marketplace plugin already at 7.8.0 (kaola-workflow@kaolabrother-kaola-workflow)
  codex      PLAN     (exit -)  — plugin 7.8.0
install-all: dry-run complete — no changes made
```

(`--check` grades rows PLAN by design; a non-dry run reaches the identical 425-430 branch and the row
would read PASS with note `plugin 7.8.0`.)

---

## Claim 3 — "exactly one live Codex location; no standalone `~/.codex/skills` shadow; one version directory"

**QUALIFIED** — true for *these skills*, but "exactly one live Codex location" is too strong.

- **One version directory: SURVIVES.** `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/`
  contains exactly `7.8.0` (dir mtime 08-12 15:02). The cache prunes, as recorded.
- **No standalone shadow of these skills: SURVIVES.** `~/.codex/skills/` **does exist** (14 entries),
  but carries none of the kaola-workflow skills — the only `kaola`-matching entry is the unrelated
  `kaola-music-generation`. The `.system/` subdir holds only OpenAI's own skills.
- **"Exactly one live location": REFUTED as stated.** Two live kaola-workflow install roots exist:
  1. `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.8.0/` — the plugin (skills,
     agents, scripts, hooks, config)
  2. `~/.codex/kaola-workflow/` — `hooks/kaola-workflow-subagent-dispatch-log.sh` and
     `scripts/kaola-workflow-codex-compact-resume.js`, plus `~/.codex/agents/kaola-workflow`

  This is the documented two-part split (`install-all.sh:13-14`, `248-253`): agent profiles vs the
  plugin. Only the plugin half is version-keyed, so the issue's *argument* is unaffected — but a fix
  that assumes a single root would be wrong.
- A second marketplace `kaolabrother-private` exists in the cache but is **empty** — it serves nothing
  and does not trip the "more than one marketplace" branch (`install-all.sh:414`). `codex plugin list`
  returns exactly one kaola-workflow row.

---

## Claim 4 — "the header comment says the wrapper owns 'is this runtime at HEAD' and names the failure, while the code answers 'is the runtime at the declared VERSION'"

**QUALIFIED** — the quoted intent is real, but the phrase the issue attributes to the header is in a
mid-file section comment, and the specific failure the header *names* is the one the code **does**
handle.

File header, `install-all.sh:13-18` (verbatim):

> `# PASS MEANS CONVERGED, NOT "EXITED 0". Codex is the one runtime whose install is`
> `# genuinely two-part: agent profiles (install-codex-agent-profiles.js) PLUS the`
> `# marketplace plugin that carries the skill packs. That plugin cache is`
> `# VERSION-KEYED, so a tree bump keeps serving the previously-added version until`
> `# the plugin is re-added — an installer exit 0 is not evidence the runtime is at`
> `# HEAD.`

The phrase the issue quotes — "a tree bump keeps serving the previously-added version **forever**" —
is at `install-all.sh:250-253`, in the section comment, together with the ownership sentence:

> `# (~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/), so a tree bump keeps`
> `# serving the previously-added version forever. The wrapper — not the profile`
> `# installer — owns the "is this runtime at HEAD" question, so the check lives here`
> `# and install-codex-agent-profiles.js stays a pure agent-profile installer.`

Judgement: the issue's characterization is **accurate on the ownership sentence** — "is this runtime
at HEAD" is strictly broader than "is the runtime at the tree's declared version", and the gap between
them is precisely the reproduced defect. It is **inaccurate on the named failure**: both comments name
*a tree bump* as the trigger, and a tree bump is exactly what the equality check catches (proven by
the 15:02 convergence today). The uncovered case — content moving with **no** bump — is named nowhere
in the file. So the code does what its comments *describe*; it does not do what its comments *claim to
own*. That is a weaker but still genuine discrepancy.

---

## Claim 5 — "Codex is the only one of four runtimes whose surfaces ship through a version-keyed cache"

**SURVIVES.**

- `install.sh` (claude) renders each command unconditionally per run —
  `install.sh:614  render_command_file "$command_file" "$dest"` inside the loop at 608-617, and
  `install.sh:384  cp "$source" "$dest"` for agents. No version consulted.
- `install-opencode.sh:608  copy_tree "$DEST_ROOT" "$DEST_ROOT"` — unconditional tree copy.
- `install-kimi.sh:190  cp -R "${src_dir%/}" "$skills_dest/$base"` — unconditional recursive copy.
- Grepping all three installers for a version-equality skip (`already at`, `installed_version`,
  version-comparison patterns) returns **zero hits in each**.

Their `08-12 22:53` mtimes confirm the unconditional write empirically. Claude Code *does* have a
plugin/marketplace mechanism that could be version-keyed, but it is **not in use here** — no
`*kaola*` path exists anywhere under `~/.claude/plugins`, and `install.sh:153-167` actively refuses to
run alongside a plugin install. So on this box, three runtimes overwrite unconditionally and exactly
one is version-gated.

---

## Claim 6 — "the degraded arms above the equality check already carry reporting vocabulary"

**SURVIVES**, verbatim:

- `codex_degrade()` — `install-all.sh:351-357`; sets `R_NOTE` and drops PASS → `PARTIAL` (except under
  `--check`, which stays PLAN).
- `"plugin convergence SKIPPED"` — emitted at `install-all.sh:385`, `392`, `418`.
- `"PENDING marketplace plugin upgrade"` — `install-all.sh:434` (the `--check` arm).
- `codex_not_applicable()` — `install-all.sh:365-372`, the N/A-vs-UNVERIFIED distinction.
- The summary already renders PARTIAL distinctly (`install-all.sh:520-523`): *"installers OK, but
  convergence is UNVERIFIED for one or more runtimes"*.

A report-only fix therefore needs **no new vocabulary and no new status** — it is a third call site for
`codex_degrade`.

---

## The critical feasibility fact

**The marketplace is LOCAL, not remote.** This is the single most decision-relevant measurement, and
it is better news than the issue assumes.

```
$ codex plugin marketplace list
MARKETPLACE                  ROOT
kaolabrother-kaola-workflow  /Users/ylpromax5/Workspace/Kaola-Workflow

$ codex plugin list --json   (kaola row)
{"pluginId":"kaola-workflow@kaolabrother-kaola-workflow","version":"7.8.0","installed":true,
 "enabled":true,"source":{"source":"local","path":"/Users/.../Kaola-Workflow/plugins/kaola-workflow"},
 "marketplaceSource":{"sourceType":"local","source":"/Users/.../Kaola-Workflow"}, ...}
```

Consequences, measured:

- `codex plugin add` for this plugin copies from **the local working tree** at
  `plugins/kaola-workflow/`. No network, no push, no snapshot layer. A refresh would be a
  sub-second local file copy. (`install-all.sh:443`'s "a real `add` fetches over the network" is
  accurate for a *git* marketplace, not for this configuration — and `install-all.sh:249` already
  says "the **local** marketplace plugin".)
- The refresh path **is proven on this box**: it converged 7.7.0 → 7.8.0 at 15:02 today.

**Available mechanisms** (`codex plugin --help`, `add --help`, `remove --help`, `marketplace --help`):

| mechanism | exists | notes |
|---|---|---|
| `codex plugin add <PLUGIN@MARKETPLACE>` | yes | "Install a plugin from a configured marketplace snapshot". Flags: `-c`, `-m/--marketplace`, `--json`, `--enable`, `--disable`. **No `--force`.** |
| `codex plugin remove <PLUGIN@MARKETPLACE>` | yes | "Remove an installed plugin from local **config and cache**" — so remove+add genuinely repopulates the version-keyed cache dir. **No `--force`.** |
| `codex plugin marketplace upgrade` | yes | "Refresh configured **Git** marketplace snapshots" — not applicable to this local marketplace. |
| a direct cache-invalidate command | **no** | nothing in the CLI surface does this. |

**What I could NOT establish:** whether `codex plugin add` *alone*, at a version already present in
the cache, refuses / no-ops / overwrites. Settling it requires issuing a mutating call against the
live `~/.codex` install, which is outside my brief. **This does not block the decision**: the existing
code path is `remove` (best-effort) then `add`, and `remove` is documented to clear the cache, so the
established sequence is sufficient regardless of `add`'s standalone behaviour.

---

## Manifest versions

The "all 3 manifests share ONE version" invariant **holds**:

| manifest | name | version |
|---|---|---|
| `plugins/kaola-workflow/.codex-plugin/plugin.json` | `kaola-workflow` | 7.8.0 |
| `plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json` | `kaola-workflow-gitlab` | 7.8.0 |
| `plugins/kaola-workflow-gitea/.codex-plugin/plugin.json` | `kaola-workflow-gitea` | 7.8.0 |
| installed cache `7.8.0/.codex-plugin/plugin.json` | `kaola-workflow` | 7.8.0 |

`package.json` is **9.8.0** — deliberately a different number, as `install-all.sh:45-47` states. The
wrapper reads the forge-derived `.codex-plugin` manifest (`install-all.sh:154-160`), which is correct.

---

## The value call — for a human, not for me

Both options are cheap. They differ in what they promise the user and in what can go wrong.

### Option (a) — refresh the version-keyed cache in place

Change the trigger at `install-all.sh:425` from version-inequality to
`version-inequality OR content-difference`, reusing the existing remove+add path at 439-469 unchanged.

- **Feasibility: HIGH, demonstrated.** The comparison is exactly the walk I ran (47 files, 3 differ);
  it is a few lines of `shasum`/node over `plugins/kaola-workflow/` vs the cache dir. The refresh
  mechanism already exists, is already bounded, and already re-reads to prove it took.
- **Cost:** one hash walk over ~47 small files per run (milliseconds); a local remove+add on the rare
  run where content moved (sub-second, local copy). Test cost is the real expense: `test-install-all.js`
  models "the ONE property that matters: the installed marketplace-plugin version" (line 193) with a
  stub CLI that carries version state only. Content-based convergence needs the stub to grow a content
  dimension, and the ~21 existing cases re-checked. The re-read proof at 452-466 also becomes
  insufficient on its own — it compares versions, which are equal by construction in this case, so it
  would need a content re-read to remain a real proof rather than a vacuous one.
- **Hazards:**
  1. **Git-marketplace users get churn.** For a marketplace whose `sourceType` is git, `add` installs
     from the remote snapshot, so the tree is the wrong oracle: any uncommitted or unpushed local edit
     makes tree≠cache permanently, firing a remove+add every run that can never converge. Under a
     content re-read this becomes a **FAIL every run**. This box is local and immune; the code is not
     local-only. A fix should either gate on `marketplaceSource.sourceType == "local"` (readable from
     the JSON row I captured) or compare against the marketplace snapshot rather than the tree.
  2. **`remove` succeeds, `add` fails ⇒ the user loses the Codex skill surface entirely.** The current
     code already accepts this on a version bump (rare); triggering on content makes it routine,
     multiplying exposure. A live Codex session would see a transient absence.
- **What it buys:** the wrapper's PASS would mean what `install-all.sh:251-253` says it owns — "is this
  runtime at HEAD" — with no human step.

### Option (b) — report the staleness; a version bump is required to fix it

Add a third `codex_degrade` call site: on version equality, compare content, and on divergence report
PARTIAL with a reason naming the stale files.

- **Feasibility: HIGH, and lower-risk.** Same hash walk; **no mutating codex call is added at all.**
- **Cost:** lower. No new status, no new vocabulary (claim 6), and `install-all.sh:520-523` already
  prints the non-green summary line. The stub CLI still needs a content dimension for a test, but no
  mutation semantics have to be modelled.
- **Hazards:**
  1. Hazard 1 above applies in weakened form: a git-marketplace user with local edits gets a standing
     PARTIAL — noise, not damage. The same `sourceType` gate fixes it.
  2. **Every same-version prose change becomes a PARTIAL row until someone bumps the version.** In
     this repo prose changes at an unchanged plugin version are ordinary (today: commit `fd00ef63`), so
     this would be a frequently-lit row. A permanently-lit warning is the failure mode
     `codex_not_applicable` was introduced to remove (`install-all.sh:359-364`: *"reporting it as
     permanently UNVERIFIED was noise, not a signal"*) — so this option risks re-creating, in a new
     place, the exact noise a previous change removed.
- **What it buys:** the user is never falsely told Codex is current; the remedy stays a human decision.

### The axis the decision actually turns on

Not feasibility — both are easy, and (a)'s refresh path already exists and works. It is whether
**"the Codex plugin version is a release artifact that should only move at a release"** is a rule worth
keeping. Option (a) keeps the version meaningful and converges silently. Option (b) keeps the wrapper
purely observational and pushes a version bump onto every prose change — or accepts a standing PARTIAL.
That is a values question about what the plugin version *means*, and it is the user's to settle.

---

## Verdict summary

| claim | verdict |
|---|---|
| 1 — pure version equality, no content compare, no force path | **QUALIFIED**: 425-430 not 426-430; no-content-compare SURVIVES; **"no force path" REFUTED** (439-469 exists, only unreachable) |
| 2 — stale cached SKILL at unchanged 7.8.0, others current | **SURVIVES** — reproduced live at HEAD |
| 3 — one live location, no shadow, one version dir | **QUALIFIED**: one version dir and no shadow SURVIVE; **two** live install roots, not one |
| 4 — header claims "at HEAD", code answers "at VERSION" | **QUALIFIED**: ownership sentence accurate; the *named* failure (a tree bump) IS handled |
| 5 — Codex alone is version-keyed | **SURVIVES** |
| 6 — degrade vocabulary already present | **SURVIVES** |

**Net:** the defect is real and live. The issue understates the available machinery (a working refresh
path already exists) and overstates the isolation of the install (two roots). The correction that most
changes the engineering picture is that this marketplace is **local**, making option (a) far cheaper
than a network-fetch model would suggest — while introducing a git-marketplace hazard the issue does
not mention.

## Open

- Whether `codex plugin add` alone overwrites an already-cached version — requires mutating the live
  install; not established, and not decision-relevant given remove+add.
- Whether any *other* user of this repo runs a git-sourced marketplace. I measured one box.
