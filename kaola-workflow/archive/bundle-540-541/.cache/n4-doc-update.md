evidence-binding: n4-doc-update 863d77d2e671

# n4-doc-update — CHANGELOG entry for bundle-540-541

## Role
doc-updater. Write set: `CHANGELOG.md` ONLY.

## Edit applied
- File: `CHANGELOG.md`
- Location: top of `### Changed` under `## [Unreleased]` (new line 7; old #539 bullet shifts to line 9).
- Diff stat: `CHANGELOG.md | 2 ++` — 1 new bullet + 1 blank-line separator; **purely additive, 0 deletions** (no existing content modified).
- `git diff CHANGELOG.md` shows the single `+` hunk at `@@ -4,6 +4,8 @@` immediately under `### Changed`.

## Bullet text (full)
- **finalize + opencode-edition: two #539 finalization-summary follow-ups — (1) #540 purges the 3 stale inline `(Step 0a-1)` references #539's opencode path-flip (mechanism B) left in the GENERATED `.opencode/command/workflow-next.md` (~L72/L159/L464); (2) #541 forwards `--base` to the whole-plan `--barrier-check` call so shared/multi-issue-branch finalization passes BOTH gates end-to-end — landed as one same-scope bundle (#540, #541; `bundle-540-541`).** **(1) #540 (opencode-only enhancement, area:workflow-router; additive — D-530-02).** Post-#538 the "Step 0a-1 — Path Intent" step no longer exists, but #539's generation-time strip left 3 dangling inline `(Step 0a-1)` / `or Step 0a-1` refs in the generated command. Mechanism: extended the opencode-only strip-transform in `scripts/sync-opencode-edition.js` (`transformCommandBody`: `text.replace(/ \(Step 0a-1\)| or Step 0a-1/g, '')`) to strip the inline refs at generation time; added content-reachability assertion A22 to `scripts/test-opencode-edition.js` (the generated `workflow-next.md` must contain no `Step 0a-1`; TDD RED→GREEN, test count 283→284). **opencode-only / additive (D-530-02): NO canonical `commands/*.md` touch, NO #307 four-chain obligation.** Verified via `test-opencode-edition.js` + `sync-opencode-edition.js --check` (drift-free). **(2) #541 (canonical cross-edition bug, area:scripts; carries the #307 four-chain).** The finalize command prose ran the plan-validator's whole-plan `--barrier-check` (the adaptive prerequisite) WITHOUT `--base`; on a shared/multi-issue branch it diffs `main...HEAD` and refuses `foreign_archive` (prior issues' archived folders sweep in). The validator's whole-plan `--barrier-check` already accepted `--base` (`plan-validator.js:2161`/`2198`, default `origin/main`) but the prose never forwarded it. Fix: source `--base` from the `KAOLA_FINALIZE_BASE` env var (mirroring #539's `--finalize-check` `--base` sourcing in `cmdFinalize`, `claim.js:2028-2035`), **default unset → byte-equivalent** (the empty-array `"${BARRIER_BASE_ARG[@]}"` idiom expands to zero args), applied IDENTICALLY across the **4 surfaces** holding the call (canonical `commands/kaola-workflow-finalize.md`, github-Codex `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`, GitLab + Gitea `plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-finalize.md`; the GitLab/Gitea SKILL twins are excluded — no adaptive barrier branch). The per-node `--barrier-check` anti-laundering `--base` REJECTION (`plan-validator.js:2162-2165`) is **unchanged** — the same structural asymmetry as #539's `--finalize-check` `--base` (a per-node barrier cannot be laundered via `--base`). **Canonical `commands/*.md` edit propagating to the codex/gitlab/gitea twins → CARRIES the #307 four-chain obligation** (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`, run sequentially). Both were filed by #539's finalization-summary (R1→#540, R2→#541); landed as one same-scope bundle (`bundle-540-541`) on the shared `feature/opencode-support` branch.

## Style conformance (matches neighboring entries)
- **Bold lead** (`**finalize + opencode-edition: … (#540, #541; `bundle-540-541`).**`) — mirrors #539's `**finalize + opencode-edition: two additive #539 surfaces — … (#539).**` opener.
- **(1)/(2) compound structure** — mirrors #539's `**(1) finalize `--base` (cross-edition, …).** … **(2) opencode edition path-flip (mechanism B, additive).**`.
- **Issue tags** in parentheses at the end of the bold lead (`(#540, #541; `bundle-540-541`)`).
- **#307 four-chain notation** — explicitly named `carries the #307 four-chain` and spelled out `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}, run sequentially` (mirrors #538 entry's tail and the Validation Policy wording).
- **opencode additive / D-530-02 exclusion** — explicitly states `NO canonical commands/*.md touch, NO #307 four-chain obligation`, mirroring #539's "additive — no four-chain obligation" and #533's D-530-02 wording.
- **Cross-edition / ×4 surface notation** — explicit list of the 4 surfaces, mirrors #539's `(cross-edition, scripts/kaola-workflow-claim.js ×4)`.

## Ordering
- Placed at TOP of `### Changed` (newest-first: #540+#541 are the newest issues vs. #539, #538, #534-536, #530, #529, #528 below).

## Surgical scope
- `git diff --name-only` lists 8 files; **CHANGELOG.md is the ONLY one this role touched**. The other 7 (`.opencode/command/workflow-next.md`, `commands/kaola-workflow-finalize.md`, `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md`, `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`, `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`, `scripts/sync-opencode-edition.js`, `scripts/test-opencode-edition.js`) were modified by the prior bundle nodes (n1/n2/n3 code work), not this role.
- `git diff --stat CHANGELOG.md` = `2 ++` (0 deletions).
