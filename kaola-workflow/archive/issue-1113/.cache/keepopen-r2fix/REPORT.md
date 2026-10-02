# issue #1113 round-2 P1 repair

Worker: cursor-KW-i1113-r2fix. Host owns acceptance and the mission ledger. This report does not write the ledger and does not finalize, merge, close, or push.

Commit: `804c758b282af54595ef7026461228829ba1eb88`
Parent: `969b11b6bc7192361bfc5e6b840ef6773ebf655c`
Branch: `workflow/issue-1113` in `/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113`
Subject: `fix(#1113): recognize issue-URL references and refuse repository conflicts`
Author and committer: KaolaBrother `<yanleichen@hotmail.com>`. Raw commit has no trailer. Worktree is clean.

Codex mirror `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` is a byte copy of `scripts/kaola-workflow-sink-pr.js`. Line anchors below are the canonical file; the mirror matches.

## F1 — same-repository issue URLs

`closingIssueNumbers` still owns commit scan, OPEN body/title reuse, and the generated-body self-check. The bounded scanner adds one alternative to the existing keyword regex.

Regex (`scripts/kaola-workflow-sink-pr.js:175`), flag `i`:

```text
\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\b
[ \t:.,;!?'"()[\]{}*_~+\-]*
(?:https://github.com/OWNER/REPO/issues/N | OWNER/REPO#N | #N)
```

Groups: 1–3 URL owner/repo/number, 4–6 qualified owner/repo/number, 7 bare number. Only one alternative captures. The loop is `scripts/kaola-workflow-sink-pr.js:223-237`. A URL or qualified hit is kept only when `sameRepository` (`:215-218`) says so: empty identity counts; otherwise `OWNER/REPO` is compared case-insensitively with the run identity. A foreign hit is still consumed, so its trailing `#N` is not read as a bare reference.

Handled forms, same line only (the scanner splits lines first):

| Form | Counts when identity matches |
|---|---|
| `Fixes: https://github.com/OWNER/REPO/issues/N` | yes |
| `Fixes https://github.com/OWNER/REPO/issues/N` | yes |
| `Fixes https://github.com/OWNER/REPO/issues/N.` | yes; the period stays outside `\b` |
| surrounding text on that line, e.g. `context Fixes: URL remains.` | yes |
| `Fixes https://github.com/other/repo/issues/N` | no |
| `See https://github.com/OWNER/REPO/issues/N` | no; no closing keyword |
| unknown / empty identity | yes, fail-closed |

Scheme and host are `https://github.com`. The `i` flag makes the keyword, scheme, and host case-insensitive. `http://`, `www.github.com`, and `/pull/N` are not this form.

Native observations used: `.kaola/outer-review-1113/github-url-reference-observations.json`, nodejs/node pull requests 66406, 66240, 66371, and 66325 (`Fixes: URL`, trailing spaces, and `Fixes URL.`).

## F2 — state identity versus origin

`resolveClaimRepositoryIdentity` (`scripts/kaola-workflow-sink-pr.js:272-281`) is called only in explicit mode, at `scripts/kaola-workflow-sink-pr.js:796-798`, after the marker and OFFLINE gates and before base resolution, existing-PR lookup, closing scan, push, create, or placeholder. The state parser is unchanged. `originOwnerRepo` (`:255-264`) still accepts only the existing GitHub URL forms, and explicit mode always runs it.

| State identity | Origin identity | Result |
|---|---|---|
| present | present, equal ignoring case | state identity |
| present | present, different ignoring case | `explicit_keep_open_refused: repository_conflict` before any scan, push, create, or placeholder. Message names both: `State repository is <state>, origin repository is <origin>.` |
| present | empty (local path, non-GitHub host, unreadable remote) | state identity |
| empty (absent or disagreeing state lines) | present | origin identity |
| empty | empty | empty identity; qualified refs and issue URLs count |

## Tests added

All inside the existing `testExplicitKeepOpenPrP1Repairs`. No new framework.

- Scanner unit pins, `scripts/simulate-workflow-walkthrough.js:7992-8010`: colon, no colon, trailing period, surrounding text, foreign URL, no keyword, case-insensitive URL, unknown identity counts the URL.
- Create-lane refusals, `:8314-8330`: `Fixes: URL`, `Fixes URL`, `Fixes URL.` → `closing_linkage` before push, with the existing no-effect assertions.
- Create-lane controls, `:8332-8349`: foreign URL and `See` plus own URL succeed.
- `repo-conflict`, `:8352-8366`: state `Fixture-Owner/Fixture-Repo`, origin `https://github.com/other/repo.git`, commit `Fixes fixture-owner/fixture-repo#143` → `repository_conflict`, both identities in the message, no `gh` call, no-effect assertions. Fetch URL is the GitHub URL; push URL stays the local bare repo; `protocol.allow=never` and `protocol.file.allow=always`.
- `repo-match`, `:8368-8380`: state and lowercase GitHub origin agree; the existing safe commit still creates, and the push lands on the local push target.
- `reuse-url`, `:8382-8395`: OPEN title `Fixes: URL.` refuses `closing_linkage` with no further effect. This locks the shared body/title scan.

Existing controls in the same scenario still pass: partial-marker and OFFLINE refusals, clean create, bare and same-repository qualified refusals, unknown-identity and relative-origin fail-closed counts, clean OPEN reuse, native closing, auto-merge, and unmeasured native fields.

## Checks

| Command | Exit |
|---|---|
| `node scripts/edition-sync.js --write` | 0 (1 file: the Codex sink mirror) |
| `node scripts/validate-script-sync.js` | 0 |
| `node scripts/edition-sync.js --check` | 0 |
| `node scripts/generate-routing-surfaces.js --check` | 0 |
| `node scripts/validate-workflow-contracts.js` | 0 |
| `node scripts/simulate-workflow-walkthrough.js --only testExplicitKeepOpenPrP1Repairs --only testSinkPr` | 0 (21 scenarios, spawn-census 681) |

Docs updated in the same commit: ADR 0031 decision 10–11 (`docs/decisions/0031-explicit-github-keep-open-pr.md:64-89`) and the consequences paragraph; `docs/api.md`; `CHANGELOG.md` `[Unreleased]` (no release header); short sentences in `README.md` and `docs/architecture.md`. The old “full-URL remains an unverified gap” wording is removed.

## Probe re-run

The outer `round2-probe.cjs` was not executed in place and `.kaola/outer-review-1113` was not modified. A sandbox copy drove the existing v6 adapter against the repaired sink bytes. Summary: `kaola-workflow/issue-1113/.cache/keepopen-r2fix/probe-sandbox/reprobe-summary.json`. Checker exit: 0.

| Scenario | Outcome | Reason | Operations |
|---|---|---|---|
| `url-closing-create` | refused | `explicit_keep_open_refused: closing_linkage` | `pr.list` only. No push, create, record, or archive. |
| `stale-repository-create` | refused | `explicit_keep_open_refused: repository_conflict` | none. Stderr: `State repository is other/repo, origin repository is KaolaBrother/VRPCadCore.` |
| `own-qualified-refusal-control` | refused | `explicit_keep_open_refused: closing_linkage` | `pr.list` only. |

`url-closing-create` still lists open requests because a matching identity reaches the existing commit scan, which sits after discovery and before push. That is the same point as the qualified-reference refusal. `repository_conflict` is earlier and performs no `gh` call.

## Not done

- Full `npm test` was not run. The final chain is for the frozen candidate later.
- Mission ledger was not written. No finalize, merge, close, or push.
- GitLab and Gitea sink ports were not hand-edited. This mode is GitHub-only, and `edition-sync` does not generate those ports.
- `http://` and `www.github.com` issue URLs are outside the specified `https://github.com/OWNER/REPO/issues/N` form and are not recognized.
- No new parser framework and no identity registry.

No unresolved value choice. `HUMAN_DECISION_REQUIRED` was not needed.
