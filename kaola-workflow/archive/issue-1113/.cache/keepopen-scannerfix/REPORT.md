# Issue 1113 scanner fix — same-repository qualified closing references

Seat: grok-KW-i1113-scannerfix. Host: zcode-KW-orchestrator-keepopen-pr.
Worktree: `/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113`
Branch: `workflow/issue-1113`
Base: `6423042aa1679564db6ca317bb4cf448f316da5c`
Commit: `45e6deb17f57adc98e04e4cc56cd426d8b54a3f9`
Subject: `fix(#1113): count same-repository qualified closing references`
Author and committer: KaolaBrother <yanleichen@hotmail.com>. No trailers. Not pushed.
Worktree status after the commit: clean (`## workflow/issue-1113` only).

No new claim, worktree, branch, or ledger write. No finalize, merge, close, or push.
Specification: Host ruling 2 in `host-indqa-v4-acceptance.md`, measured in section 7 of
`keepopen-independent-pins-v4/REPORT.md`.

## Code change

Canonical file `scripts/kaola-workflow-sink-pr.js`. The Codex mirror
`plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` is the edition-sync byte copy of that
file. Line numbers below are the canonical file at `45e6deb1`.

The qualified alternative used to be matched and discarded, so every `owner/repo#N` was ignored.
`CLOSING_ASSOC_RE` (line 171) now captures owner, repo, and number for that alternative
(groups 1–3) and still captures a bare `#N` (group 4). The qualified form is still consumed, so
its trailing `#N` is not read as a bare reference.

- Header comment, lines 27–30: a qualified reference counts when it matches the run's own
  repository, does not count for another repository, and a full URL stays an unverified gap.
- Scanner comment, lines 157–170: same rule, plus the fail-closed note. When neither state nor
  origin yields an identity, every keyword-qualified reference counts. Over-refusal is the
  fail-closed direction.
- `asOwnerRepo`, lines 175–190. `sameRepository`, lines 192–195: empty identity counts the
  reference; otherwise owner/repo is compared case-insensitively.
- `closingIssueNumbers(text, repositoryIdentity)`, lines 199–212. A bare `#N` after the keyword
  still counts. A qualified reference counts only when `sameRepository` says so. A full URL is
  not matched (probed, not asserted in the walkthrough: `Fixes https://github.com/.../issues/143`
  and `Fixes https://github.com/owner/repo#143` both returned `[]`).
- `claimRepositoryFromTexts`, lines 214–228. `originOwnerRepo`, lines 230–239.
  `resolveClaimRepositoryIdentity`, lines 241–245.
- `keepOpenLinkageBody(issue, repositoryIdentity)`, line 284, passes that identity into the
  generated-body self-check (line 289).
- `assertNoClosingCommits(..., repositoryIdentity)`, line 413, is the `base..head` commit scan
  (line 416).
- `assertExplicitReuseSafe(..., repositoryIdentity)`, line 448, is the OPEN body/title scan
  (line 450).
- `main` computes one identity for explicit mode, lines 755–759, after the OFFLINE return, from
  the workflow-state texts already loaded (`keepOpenTexts`) and the main checkout `root`.
- Call sites that receive it: merged body/title note, line 823; OPEN reuse, lines 847–848;
  create-lane commit scan, generated body, and generated title, lines 873–876.

`module.exports` still exports `closingIssueNumbers`. The signature is now
`(text, repositoryIdentity)`.

## Identity derivation and fallback

1. Read every `claim_repository_id` line in the workflow-state texts the sink already loads
   (live, then archive). Normalize each value to `OWNER/REPO`:
   - `https://github.com/OWNER/REPO` with optional `.git` and one trailing slash
   - `git@github.com:OWNER/REPO` with optional `.git`
   - `ssh://` with an optional user (`git@`) then `github.com/OWNER/REPO`
   - `git://github.com/OWNER/REPO`
   - an already-normalized `OWNER/REPO`
2. If every parsed line is the same repository, case-insensitively, that is the identity.
   Disagreeing lines yield no state identity.
3. If state yields nothing, run `git remote get-url origin` on the main checkout root
   (`resolveMainRoot`) and parse that URL with the same function. A local path does not parse.
4. If that is also empty, `closingIssueNumbers` counts every keyword-qualified reference,
   including other repositories.

Close mode does not compute an identity and does not call the scanner. Explicit OFFLINE still
refuses before this lookup.

## Tests

Extended `testExplicitKeepOpenPrP1Repairs` in `scripts/simulate-workflow-walkthrough.js`
(starts line 7958). Fixture identity constructed by the test:
`claimRepo = fixture-owner/fixture-repo`,
`claim_repository_id = https://github.com/Fixture-Owner/Fixture-Repo.git`
(written into `explicitState`, lines 8014–8021).

- Create lane `Fixes fixture-owner/fixture-repo#143` (`scan-own`, lines 8136–8143):
  `explicit_keep_open_refused: closing_linkage` before push (`assertNoEffects`: no create, merge,
  queue probe, branch move, or OFFLINE placeholder). The state URL is mixed-case with `.git`, so
  this also checks normalization and case-insensitive match.
- Existing create control (line 8103) unchanged in text: `Fix #999; related #143` and
  `Fixes other/repo#143` still exit 0 with `sink_pr: created`.
- Helper, lines 7964–7988: `Fixes fixture-owner/fixture-repo#143` → `[143]`;
  `Fixes other/repo#143` → `[]`; `Fixes #143` → `[143]`. Also `closes #143` → `[143]` and
  `Fix #999; related #143` → `[999]`.
- Additional controls in the same scenario, not a new framework: case-insensitive qualified
  match; https, `git@`, `ssh://`, and `git://` forms passed as the helper identity;
  omitted identity makes `Fixes other/repo#143` → `[143]`; `scan-unknown` (lines 8145–8152)
  omits `claim_repository_id` so the fixture's local bare origin does not parse, and
  `Fixes other/repo#143` refuses `closing_linkage` before push.

Full-URL references are not asserted.

## Checks

All commands were run in the issue-1113 worktree.

| command | exit |
|---|---|
| `node scripts/simulate-workflow-walkthrough.js --only testExplicitKeepOpenPrP1Repairs --only testSinkPr` | 0 (21 scenarios, including `testExplicitKeepOpenPrP1Repairs`) |
| `node scripts/edition-sync.js --write` | 0 |
| `node scripts/validate-script-sync.js` | 0 |
| `node scripts/edition-sync.js --check` | 0 |
| `node scripts/generate-routing-surfaces.js --check` | 0 (24 surfaces) |
| `node scripts/validate-workflow-contracts.js` | 0 |

The walkthrough ran on the canonical scripts immediately before the mirror write. The write copied
only `scripts/kaola-workflow-sink-pr.js` to `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js`.
`validate-script-sync.js` then reported those copies in sync. No canonical byte changed between
the walkthrough and the commit.

Mirror regen: `codex-sync plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js`;
`edition-sync: write complete (1 file(s) updated).`

## Docs

- ADR 0031 decision 10, lines 64–71, and the consequences scanner sentences, lines 100–102:
  a qualified reference matching the run's own repository counts; another repository does not;
  the full-URL gap sentence is unchanged.
- CHANGELOG `[Unreleased]` Fixed bullet for #1113: the same qualified-reference sentence.
  No release header was added. The Added bullet did not state the old "not this repository" rule
  and was left as written.
- `docs/api.md` explicit-singleton scanner sentences: same rule, so the API doc matches the ADR.
  The full-URL sentence there is unchanged.

## Not done, and why

- Mission ledger was not written. The Host owns it. This seat resumed the existing issue-1113
  context and did not claim.
- No finalize, merge, issue close, or push.
- `npm test` was not run. A later seat re-binds that chain.
- Full-URL references are still not counted and were not asserted.
- A github.com string as the live `origin` remote was not given its own walkthrough case.
  Pointing the fixture origin at GitHub would make `defaultBranch` call `git remote show` when
  `origin/HEAD` is unset. The unknown-identity case does call `git remote get-url origin`; that
  URL is the local bare path, it does not parse, and the qualified reference is then counted.
  The https/ssh/git shapes are parsed by `asOwnerRepo`, which both the state reader and the
  origin fallback use, and the helper controls pass those URL strings in.
- Disagreeing `claim_repository_id` lines are not a separate scenario. They yield no state
  identity and then follow the origin fallback (lines 224–226 and 241–244).
- GitLab and Gitea sink ports were not edited. This mode is GitHub-only, and edition-sync does
  not generate those hand-ported sinks.
