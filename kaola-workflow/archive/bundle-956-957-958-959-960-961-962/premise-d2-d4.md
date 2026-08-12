D2: STILL LIVE | D4: STILL LIVE

# Premise check — the two unescalated subtraction-audit findings (D2, D4)

Measured at HEAD `8742f5b8` (main, clean tree), 2026-08-12. All sweeps run in two parts where it
matters: `git grep` over the tracked tree plus an explicit `find | xargs grep` over the untracked
dot-edition trees (`grep` here is ugrep and skips dot-directories; `git grep` cannot see gitignored
trees). No capture was piped through `head`/`tail`; the one oversized capture (10.2MB, caused by
`.opencode/node_modules`) was persisted in full and the sweep re-run with `node_modules` excluded.

**Both findings verified against today's tree, not just the audit's record.** Both are unrepaired,
and neither is named in any open issue. **Both are UNOWNED live work.**

---

## D2 — `docs/README.md` opencode index line sells a removed mechanism — STILL LIVE

### The audit's own description

`docs/audits/2026-08-11-subtraction-audit.md:82`:

> | D2 | `yagni:` | `docs/README.md:17` sells the opencode edition on a per-role model/effort
> mapping that was **removed, not deprecated** | 1 | found independently by both readers |

Both archived reader reports carry the full evidence:
`kaola-workflow/archive/bundle-952-953-954-955/reports/audit-952-docs.md:180-235` (F2) and
`.../audit-952-docs-b.md:264-328` (F3).

### The line today, verbatim

The audit cited line 17 at baseline `483a5e5e`; the #952–#955 bundle commit `d521f1f0` added three
lines to the Architecture entry above it, shifting it to **line 20** — byte-identical, untouched:

```
/Users/ylpromax5/Workspace/Kaola-Workflow/docs/README.md
20  - [opencode Edition](opencode-edition.md) — additive opencode runtime (`opencode.json` + `.opencode/` tree; provider-open two-tier effort mapping; installs via `install-opencode.sh`).
```

The claimed sentence **still exists**: "provider-open two-tier effort mapping". (The audit's summary
paraphrases it as "per-role model/effort mapping"; the exact on-disk phrase is the above, and it is
the vocabulary of the removed mechanism — `docs/decisions/D-544-01.md` describes the old design as
mapping each tier to an effort variant.)

### The mechanism does not exist — two-part sweep at HEAD

**Part 1 — tracked tree.** The four implementation symbols of the removed per-role effort tiering
(`mapTier` / `CONTRACT_EFFORT_TABLE` / `effortForProvider` / `contractForProvider`), swept with
`git grep -P` over `scripts`, `plugins`, `templates`, `hooks`, `install*.sh`, `opencode.json`:
**5 hits, all comments in `scripts/test-opencode-edition.js`** (lines 27, 504, 664, 757, 850), every
one recording the removal — e.g. line 27: "`effortForProvider` / `contractForProvider` /
`CONTRACT_EFFORT_TABLE`, all removed with per-role". Zero live code.

The tracked, seeded config `opencode.json` (26 lines, read in full): no `variants` block, no effort
key anywhere. Its comment block says the opposite of the index line: "DEFAULT: nothing is pinned, so
BOTH tiers inherit the model you are already using in opencode." The only two-tier structure is an
**opt-in per-tier model pin, entirely commented out** — `agent.<role>.model` overrides for the seven
reasoning roles. `grep -i -E 'variants?|effort' opencode.json` → exit 1, zero hits.

**Part 2 — untracked `.opencode` tree** (22 edition files after excluding `node_modules`; full file
list captured). Sweep for `"variants?"` / `variants?:` / `\beffort\b` minus prose "best effort":
5 hits, **all prose stating the inheritance**, i.e. the mechanism's absence —
`.opencode/command/kaola-workflow-finalize.md:28-33`: "## Model and effort are inherited … the task
tool … has no model or effort parameter at all." No variant key, no effort key, no per-role
model/effort mapping anywhere in the rendered edition.

**The doc the line links to states the removal itself** — `docs/opencode-edition.md:88` "## Model
and effort — inherited from the session"; `:102` "The edition previously seeded a per-role effort
tier — a `provider.*.variants` block and an `agent.<role>.variant` or `.options` entry for each
role. That is **removed**, not merely deprecated"; `:374` "**inherited** — a subagent runs the model
and reasoning effort of the session that dispatched it; a per-tier model pin is opt-in".

### Git history since the audit

`git log --oneline -- docs/README.md`: the only commit after the audit baseline is `d521f1f0`. Its
full diff for this file (shown below in its entirety) touches the Architecture entry only:

```
-- [Architecture](architecture.md) — system structure and data flow.
+- [Architecture](architecture.md) — system structure and data flow. Includes
+  [Runtime capability divergence](architecture.md#runtime-capability-divergence) — the one place the
+  four runtimes' differences are recorded (dispatch carrier, command/skill surface, hooks, model &
+  tier, install path), as a tier label plus a pointer per cell, never a restated mechanism.
```

The opencode line survived the bundle unchanged — exactly as reader B predicted in
`audit-952-docs-b.md:453` ("`docs/README.md`'s stale opencode line survives `impl-955`'s edit").
No later commit touches the file (`7f19ddb3`, `80e51982`, `8742f5b8` are archive/roadmap commits).

### Verdict: STILL LIVE

### Recommended repair (1 line, not test-consumed)

`docs/README.md` is not in `SELF_HOST_TEST_CONSUMED` (verified at
`scripts/kaola-workflow-adaptive-schema.js:905-911`: `README.md` there is the repo-root README, not
`docs/README.md`) — freely editable, no receipt impact.

Before (`docs/README.md:20`):

```markdown
- [opencode Edition](opencode-edition.md) — additive opencode runtime (`opencode.json` + `.opencode/` tree; provider-open two-tier effort mapping; installs via `install-opencode.sh`).
```

After:

```markdown
- [opencode Edition](opencode-edition.md) — additive opencode runtime (`opencode.json` + `.opencode/` tree; model and effort inherited from the session, opt-in per-tier model pin; installs via `install-opencode.sh`).
```

Rationale for the replacement clause: it is the linked doc's own vocabulary
(`docs/opencode-edition.md:88,374`). What survives of the two-tier structure is a **model** pin,
opt-in and off by default; the word that has to go is "effort" (reader B: "'provider-open' is
accurate" — it may be kept or dropped; the wording above drops it as redundant once no mapping is
claimed). Do not simply delete the clause: the sibling kimi line carries the equivalent
"inherit-only model tier" statement, which is accurate, and symmetry is worth one clause.

---

## D4 — `docs/api.md:1002-1003` attributes behaviour to `cmdSinkPr`, which never existed — STILL LIVE

### The audit's own description

`docs/audits/2026-08-11-subtraction-audit.md:84`:

> | D4 | `yagni:` | `docs/api.md` attributes behaviour to a function that never existed | 2 |
> **test-consumed doc** |

Full evidence in the archived reader report `audit-952-docs.md:286-325` (F4), which names the
function: **`cmdSinkPr`**.

### The passage today, verbatim

`docs/api.md` is **byte-identical from the audit baseline to HEAD**
(`git diff 483a5e5e 8742f5b8 -- docs/api.md` → empty, exit 0). The passage, in the "### PR sink"
section:

```
/Users/ylpromax5/Workspace/Kaola-Workflow/docs/api.md
1002  - `cmdSinkPr` emits no closure receipt — the authoritative receipt for a `sink: pr` project is
1003    emitted by the watcher at merge. This is documented behavior, not a gap.
```

### The function exists nowhere — two-part sweep at HEAD

**Part 1 — tracked tree.** `git grep -n -F "cmdSinkPr" -- .` over the entire tracked tree returns
hits in exactly three places, none of them code:
- `docs/api.md:1002` — the finding itself;
- `kaola-workflow/archive/bundle-952-953-954-955/reports/audit-952-docs.md` — the archived audit
  report *about* the finding;
- `kaola-workflow/archive/issue-164/` planning notes (`.cache/advisor-ideation.md`,
  `.cache/planner.md`, `phase1-research.md`, `phase2-ideation.md`) — the 2026-05-25 design documents
  the name came from. The planner note itself says "No `cmdSinkPr` in claim.js."

Zero hits in `scripts/` or `plugins/`. The only `cmdSink*` identifier in live code is
`cmdSinkFallback` (`git grep -P "cmdSink\w*"` over scripts+plugins: `cmdSinkFallback` in the three
claim scripts and two walkthroughs; nothing else).

**Part 2 — untracked dot-edition trees.** `find .opencode .kimi .claude .codex -type f | xargs
grep -l -F "cmdSinkPr"` → exit 1, zero hits across all four trees.

**Never existed, not removed** — `git log -S "cmdSinkPr"` (every commit that ever changed the
string's occurrence count) returns exactly three commits: `fa609dd0` (2026-05-25, #164 — wrote the
planning notes and the api.md line), `bbacd271` (2026-07-31, docs rewrite — moved the passage), and
`80e51982` (2026-08-12 — the sink archiving the audit report that *names* the finding). No commit
ever added it to a `.js` file.

The stated **result** remains true — `scripts/kaola-workflow-sink-pr.js` emits no closure receipt;
the receipt comes from the watcher at merge. Only the method attribution is fiction (the exact
failure `CLAUDE.md` names: "specify the result, never the method").

### Git history since the audit

None for this file: the `483a5e5e..8742f5b8` diff is empty (verified above). Most recent commit
touching `docs/api.md` is `705ab4a1`, well before the audit.

### Verdict: STILL LIVE

### Recommended repair (2 lines) — TEST-CONSUMED CONSTRAINT

Before (`docs/api.md:1002-1003`):

```markdown
- `cmdSinkPr` emits no closure receipt — the authoritative receipt for a `sink: pr` project is
  emitted by the watcher at merge. This is documented behavior, not a gap.
```

After:

```markdown
- The PR sink emits no closure receipt — the authoritative receipt for a `sink: pr` project is
  emitted by the watcher at merge. This is documented behavior, not a gap.
```

One token replaced; the true result is kept, the fabricated symbol removed, and no new mechanism
claim introduced. (The real script, `kaola-workflow-sink-pr.js`, is already named at the top of the
same section, `docs/api.md:993`.)

**Constraints, verified at HEAD:**
- `docs/api.md` is in both `SELF_HOST_TEST_CONSUMED`
  (`scripts/kaola-workflow-adaptive-schema.js:908`) and `TEST_CONSUMED_PATHS`
  (`scripts/kaola-workflow-validation-runner.js:32`). **Any edit changes `computeCodeTreeHash` and
  stales the chain receipt** — sequence this edit BEFORE the finalize chain-receipt run, never after.
- No assertion pins the passage: `cmdSinkPr` has zero hits in `scripts/`/`plugins/`, so no
  `assertConcept` token list or test names it. The edit cannot red a validator; it only moves the
  code-tree hash.

---

## Ownership: both findings are UNOWNED

`gh issue list --limit 100 --state open --json number,title` → exactly seven open issues:
#956–#962. All seven bodies were captured in full (113 lines) and read.

| issue | covers |
|---|---|
| #956 | D1 |
| #957 | D6 (its `docs/api.md:1535-1538` is the Codex tier-pair restatement — a different passage, not D4's 1002-1003) |
| #958 | D9 |
| #959 | D10 |
| #960 | S1 |
| #961 | S2 |
| #962 | S3, S4, S5, S6, D3, D5, D7, D8 — the docs list names D3/D5/D7/D8 and skips D2/D4; its "Recorded observation" is the opencode deletion-transform over-match gap, not either finding |

The strings `cmdSinkPr`, `README.md:17`, `README.md:20`, "two-tier effort mapping", "D2" and "D4"
appear in **none** of the seven bodies. Escalation coverage is therefore S1–S6 + D1, D3, D5–D10 =
14 of the audit's 16 findings; **D2 and D4 are the two without an issue, and neither is folded into
#962.**

**Conclusion: D2 and D4 are both live, unrepaired, and owned by no open issue — live unowned work.**
Both are small (1 line + 2 lines), both repairs keep a true result and remove only a false mechanism
claim, and only D4 carries a sequencing constraint (test-consumed: edit before the receipt run).
