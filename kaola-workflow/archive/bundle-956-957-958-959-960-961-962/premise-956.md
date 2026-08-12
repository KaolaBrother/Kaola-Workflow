# Premise check — issue #956

VERDICT: CONFIRMED-WITH-CORRECTION

The core claim is true and survives every falsification attempt: `docs/conventions.md` documents
`FEATURE_TOKENS` in `test-agent-profile-parity.js`, instructs the reader to add tokens to it, and the
constant was removed from the tree at `523f1241` with zero live-code survivors anywhere, including
all rendered edition trees. Two corrections, both material to the repair:

1. **The `281-293` range overstates the dead span.** Lines 287-289 (item 3, chain pinning) are
   accurate and live today — verified against `package.json:40` and all four
   `validate-*-contracts.js`. A 13-line cut (and the roadmap entry's "23-line block") would delete
   true documentation of an armed guard.
2. **The mechanism is not gone — it was re-armed at the same station.** `523f1241` replaced
   `FEATURE_TOKENS` with `ROLE_PINS` + `SAFETY_BASELINE_RULES` + a corpus-derived consensus baseline
   **in the same file, in the same commit**. The correct repair is a REWRITE of item 2 and the
   Workflow paragraph against the successor, not a deletion. The "test dies with its mechanism" rule
   does not apply: the test did not die, and the guard it documents is running in the claude chain
   today.

Measured at main `8742f5b8`, working tree clean, 2026-08-12. Read-only; no tracked file touched.

---

## 1. Does `FEATURE_TOKENS` exist anywhere in the tree today?

**In live code: zero, everywhere.** Every remaining hit is prose — docs, CHANGELOG history, the
roadmap entry for this very issue, and run archives.

Part A — tracked tree (`git grep -Pn 'FEATURE_TOKENS'`, full output captured; per-file line counts
via `git grep -c 'FEATURE_TOKENS'`):

```
CHANGELOG.md:2                                      (history entries for #767 and #422)
docs/audits/2026-08-11-subtraction-audit.md:1       (finding D1 itself)
docs/conventions.md:3                               (lines 282, 283, 292 — the block under test)
docs/decisions/D-422-01.md:5                        (lines 64, 66, 72, 112, 114 — ADR, history)
kaola-workflow/.roadmap/issue-956.md:2              (this issue's own text)
kaola-workflow/ROADMAP.md:1                         (mirror of the same)
kaola-workflow/archive/**: 24 more files            (run archives, all history)
```

Not one hit in `scripts/`, `plugins/`, `templates/`, `agents/`, `commands/`, or `hooks/`. Scoped
directly:

```
$ git grep -l 'FEATURE_TOKENS' -- 'scripts' 'plugins' 'templates' 'agents' 'commands' 'hooks'
(no output, exit 1)
```

Part B — untracked/dot trees, explicit `find` sweep (ugrep skips dot-directories on recursion, so
files were fed explicitly via `find -exec grep -l`):

```
.agents: 0        .cache: 0          .claude: 0          .codex: 0
.kimi: 0          .kimi-gitea: 0     .kimi-gitlab: 0
.opencode: 0      .opencode-gitea: 0 .opencode-gitlab: 0
plugins: 0        .kw: 31
```

The 31 `.kw` files are `.kw/worktrees/bundle-956-957-958-959-960-961-962/**` — this bundle's own
worktree, i.e. a second checkout of the same repo. Its hits are the same prose files (conventions.md,
D-422-01.md, CHANGELOG, ROADMAP, archives); **none of its 31 files is under `scripts/` or any code
directory.** All six rendered edition trees and both plugin surfaces: 0.

## 2. Was it removed at 523f1241 — removed or renamed?

**Removed, and replaced by a differently-named successor in the same commit and file.** Not a
rename.

```
$ git log -S 'FEATURE_TOKENS' --format='%h %ad %s' --date=short   (full output)
8742f5b8 2026-08-12 chore(roadmap): file #956–#962 ...            (prose: roadmap entry)
80e51982 2026-08-12 chore: archive bundle-952-953-954-955 [sink]  (prose: archives)
d521f1f0 2026-08-12 feat: solution ladder, ... subtraction audit  (prose: the audit doc)
523f1241 2026-08-01 fix(bundle): close the 2026-07-31 runtime-consistency audit — #881-#885
2c95a7ab ... and older commits back to 28183f2d 2026-06-12 (#422, where it was introduced)
```

Code presence before/after the commit (positive/negative pair):

```
$ git grep -l 'FEATURE_TOKENS' 523f1241^ -- scripts plugins templates agents commands hooks
523f1241^:scripts/test-agent-profile-parity.js
523f1241^:scripts/test-runtime-lexicon-parity.js
$ git grep -l 'FEATURE_TOKENS' 523f1241  -- scripts plugins templates agents commands hooks
(no output, exit 1)
```

The full 562-line diff of `scripts/test-agent-profile-parity.js` at `523f1241` (captured whole to
scratchpad, then searched) contains exactly two `FEATURE_TOKENS` lines, both deletions, no addition:

```
-const FEATURE_TOKENS = [
-  for (const token of FEATURE_TOKENS) {
```

What the commit added in their place, same file (`+` lines in the same diff):

```
+const ROLE_PINS = [
+const SAFETY_BASELINE_RULES = [
+const MIN_RULE_CHARS = 48;
+const CONSENSUS_NUMERATOR = 2;
+const CONSENSUS_DENOMINATOR = 3;
+for (const { role, token } of ROLE_PINS) {
```

(`scripts/test-runtime-lexicon-parity.js`, the second pre-commit carrier, was deleted wholesale at
the same commit — 635 lines, per the commit stat.) The archive record
(`kaola-workflow/archive/bundle-881-882-883-884-885/mission-list.md:92`) confirms intent: measured 41
of 43 tokens dead, `FEATURE_TOKENS` "deleted outright", replaced by `ROLE_PINS` polarity sentences.

**So: not renamed — replaced by a structurally different successor.** The repair consequence is the
same as for a rename, though: a successor exists, so rewrite, don't delete (see §6).

## 3. Positive control — CONFIG_HOOKS_FAMILY

Resolves in live code. Same two-part method as §1:

```
$ git grep -Pn 'CONFIG_HOOKS_FAMILY' -- (tracked tree; live-code hits only shown)
scripts/validate-script-sync.js:42, 309, 325, 348, 556, 617   ← 6 hits, incl. the
                                                                 definition (309), the check
                                                                 call (556), the export (617)
scripts/test-validate-script-sync.js:213                       ← 1 comment hit
```

6 hits in `validate-script-sync.js` — exactly the "still resolves 6×" the audit recorded. The find
sweep over the dot trees finds it only in the `.kw` worktree's copies of the same files. The method
distinguishes a dead identifier from a live one; it is not broken.

## 4. docs/conventions.md lines 270-300, verbatim

```
270
271	**Non-generated agent-profile md↔toml token-pin parity contract (#422, see
272	`docs/decisions/D-422-01.md`).**
273	Three-part machine-enforced contract:
274
275	1. **`.toml` triple byte-identity** — `validate-script-sync.js` `BYTE_IDENTICAL_GROUPS`
276	   includes a programmatic entry for every `plugins/kaola-workflow/agents/*.toml` file
277	   (built via `readdirSync`), covering every base-role profile.
278	   Any byte divergence between the three plugin-tree copies of a `.toml` reds the validation
279	   run. A new profile added to the codex tree is auto-covered.
280
281	2. **Feature-token mirroring** — for non-generated roles, `scripts/test-agent-profile-parity.js` enforces that any
282	   token in the curated `FEATURE_TOKENS` list that is present in an `agents/<name>.md` MUST
283	   also appear in all three `.toml` twins. Add a token to `FEATURE_TOKENS` only after it is
284	   GREEN at HEAD (present in both the `.md` and all three `.toml` twins). A drift between the
285	   `.md` and the twins reds the claude chain and is caught before the four-chain gate.
286
287	3. **Chain pinning** — `test-agent-profile-parity.js` is wired into the claude chain and
288	   pinned by all four `validate-*-contracts.js`, so a missing or renamed guard file reds
289	   every chain.
290
291	**Workflow:** For a non-generated role, mirror a new feature paragraph/token into all three `.toml`
292	twins first, then pin it in `FEATURE_TOKENS`. For the three generated reviewer roles, use the
293	canonical JSON + generator workflow above instead.
294
295	**`config/hooks.json` family (#418.1).** The three plugin-tree `config/hooks.json` files
296	(`plugins/kaola-workflow/`, `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/`)
297	are parity-checked by `validate-script-sync.js` `CONFIG_HOOKS_FAMILY` +
298	`normalizeConfigHooks()`. The files differ only in the forge-renamed compact-resume script
299	path (`kaola-workflow-codex-compact-resume` → `kaola-{forge}-workflow-codex-compact-resume`);
300	any other divergence reds the validation run.
```

(Section heading `## Agent profile parity` is line 269.)

## 5. The 9-vs-13 discrepancy, settled

**Neither number is exactly right, and the discrepancy dissolves once each line is tested
individually against the live tree:**

| lines | content | status today |
|---|---|---|
| 281-285 | item 2, `FEATURE_TOKENS` mirroring | **DEAD** — the constant and the conditional-on-presence mechanism are gone |
| 286 | blank separating 2 from 3 | goes with 281-285 |
| 287-289 | item 3, chain pinning | **TRUE AND LIVE** — `package.json:40` runs `test-agent-profile-parity.js` in the claude chain; pinned at `scripts/validate-workflow-contracts.js:884`, `scripts/validate-kaola-workflow-contracts.js:588`, gitlab contracts `:545`, gitea contracts `:547` (all four); the test's own header (lines 23-24) states the same |
| 291-293 | Workflow paragraph | **HALF-DEAD** — "then pin it in `FEATURE_TOKENS`" (292) is a dead instruction; "mirror into all three `.toml` twins" is still what a contributor does; the generated-reviewer sentence is accurate (the generator workflow section exists above at line 235, and `generate-reviewer-profiles.js:13` exports exactly three ROLES: `code-reviewer`, `adversarial-verifier`, `security-reviewer`) |
| 273 | "Three-part machine-enforced contract:" | true under a rewrite of item 2; false ("Two-part" + renumbering needed) under a pure deletion |
| 271-272, 275-279 | intro + item 1 | **TRUE AND LIVE** — the programmatic `readdirSync` entry exists at `scripts/validate-script-sync.js:261-269`; "token-pin" in the intro remains literally accurate of `ROLE_PINS` (`{ role, token }` entries) |

So: the 13-line reading (281-293 whole) over-deletes the three accurate item-3 lines; the 9-line
reading correctly excludes item 3 but still frames as deletable a Workflow paragraph of which two of
three lines survive. The truly dead material is **lines 281-286 (6 whole lines) plus the single
clause "then pin it in `FEATURE_TOKENS`" inside 291-292** — everything else in 269-300 is accurate
today. Under a pure cut, after deleting 281-286, line 273 must read "Two-part" and item "3." must
renumber to "2." — corrective edits, which is exactly why two honest readers produced 9 and 13 from
the same block. Under the recommended rewrite (below), net deletion is 0 and no renumbering occurs.

## 6. Delete or rewrite? — REWRITE. A successor exists and is running.

`scripts/test-agent-profile-parity.js` today (743 lines) enforces md↔toml parity for non-generated
roles by three live mechanisms, per its own header (lines 4-24) and body:

1. **Consensus baseline** (lines 145-146, `deriveBaseline`) — a rule sentence carried by ≥2/3 of the
   hand-maintained canonical `.md` profiles must appear in every hand-maintained `.md` (reverse) and
   in all three `.toml` twins of each (forward). Derived from the corpus; no curated list to forget.
2. **`ROLE_PINS`** (lines 37-68) — role-specific rules no consensus can reach (test custody,
   metric-optimizer scoped revert, the solution ladder's reuse rung), enforced presence-FIRST in the
   source `.md` so a stale pin fails loudly instead of self-disabling — the precise failure mode that
   rotted `FEATURE_TOKENS` to 41/43 dead.
3. **`SAFETY_BASELINE_RULES`** (lines 76-83) — the six prompt-defense sentences pinned verbatim as
   an absolute floor.

Parity is asserted over normalized sentences (`normalizeProse`, sentence-granular `ruleUnits`), not
bytes or tokens. Generated reviewer roles are excluded via the generator's own `ROLES` export.

**Therefore the block should be REWRITTEN, not deleted.** The dispatch's criterion — does a
successor mechanism actually exist in `test-agent-profile-parity.js` today — is met unambiguously.
The "a test is deleted with its mechanism" rule cuts the other way here: the test never died; only
the curated-list implementation did, replaced in the same commit. Deleting the whole block would
leave a live, chain-pinned, four-times-contract-pinned guard undocumented while its two accurate
neighbours (items 1 and 3) are cut with it. What died — the curated list — should vanish from the
doc; what replaced it should stand in its place.

---

## RECOMMENDED REPAIR

Replace lines 281-285 with (keeping "Three-part" at 273 true, no renumbering):

```
2. **Derived sentence parity** — for non-generated roles, `scripts/test-agent-profile-parity.js`
   derives its obligations from the corpus rather than a curated list: a rule sentence carried
   by at least two thirds of the hand-maintained canonical profiles must appear in every
   hand-maintained `.md` AND in all three `.toml` twins of each, and `ROLE_PINS` carries the
   role-specific rules no consensus can reach — each pin asserted present in its source `.md`
   first, so a pin whose source wording has moved fails loudly instead of enforcing nothing.
   A drift between the `.md` and the twins reds the claude chain before the four-chain gate.
```

Replace lines 291-293 with:

```
**Workflow:** For a non-generated role, mirror a new feature paragraph into all three `.toml`
twins; a rule shared by two thirds of the hand-maintained roles is enforced automatically, and a
role-specific rule needs a `ROLE_PINS` entry in `test-agent-profile-parity.js`. For the three
generated reviewer roles, use the canonical JSON + generator workflow above instead.
```

Leave 269-279 (heading, intro, item 1), 287-289 (item 3), and 295-300 (`CONFIG_HOOKS_FAMILY`)
untouched — all verified accurate. Optionally reword "token-pin" at 271 to "sentence-pin"; not
required for correctness since `ROLE_PINS` entries are literally `{ role, token }`.

Adjacent, explicitly out of #956's scope: `docs/decisions/D-422-01.md` still describes
`FEATURE_TOKENS` (5 lines) — it is an ADR, covered by the stated retention policy for
`docs/decisions/` ("accurate as history"), and needs no edit.

---

*Method notes: every sweep ran two-part (tracked `git grep -P` + explicit `find -exec` over all
eleven dot trees and `plugins/`); no evidence passed through `head`/`tail` — the one large capture
(the 562-line commit diff) was written whole to the scratchpad and searched in place; all pathspecs
quoted; positive and negative controls run for both the identifier sweep (§3) and the commit
before/after pair (§2).*
