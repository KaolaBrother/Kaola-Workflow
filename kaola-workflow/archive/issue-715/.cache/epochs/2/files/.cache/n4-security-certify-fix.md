evidence-binding: n4-security-certify-fix 87ac23d2764e
contract_version: 2
plan_schema_version: 2
behavior_contract_version: 2
review_context_hash: 517d2f898eb106f50ba791ae4bce9f195679a79e2633fa71a8699859868adf24
behavior_contract_hash: 1c9771f6f29f9a130b65aaf491dff9cf1691402dbdce489254a6248361026584
resolved_profile_hash: a6f7566a03d5ccdc8d890da743b41915e2d18ff36e30e7058bfdd41459cf041d
candidate_digest: 166dc98b21a1f7b7dde0734287342d85cf2b71b762166406d4b23349ad2f5528
domain_outcome: approved
gate_mode: change_gate
gate_claim: the F1 repair introduces no security regression: every git invocation stays argument-array and pathspec-scoped to the actual archive dest with no shell interpolation of branch or path names, the base-branch guard cannot be spoofed into staging or committing outside the dest, the restore-gate exemption matches exactly the one path the release itself created, the treeDirty, parked-lane, foreign-dirt, and never-mutate-sibling protections are not weakened, and no secrets or unsafe trust of operator-controlled branch names are introduced across all four edition copies
gate_surface: the full epoch-2 claim.js delta in all four editions (helper, both call sites, restore-gate interplay) plus its interaction with the epoch-1 sink-preflight exemption surface, attacked for injection, path-traversal, staging-scope, and guard-weakening primitives
gate_aggregation: sequence
upstream_read: n3-code-certify-fix 45da7230e295

verdict: pass
findings_blocking: 0
review_summary: no_blocking_findings
review_attestation: full_review_completed

## Candidate and context

- Candidate = accumulated worktree diff vs HEAD (HEAD == claim_root_base cd28e8e52fb641cf2173ced57c91a042e3c13e1e, matching the review context). git status --porcelain shows exactly the 14 in-set modified files plus the untracked kaola-workflow/issue-715/ run tree: zero out-of-set writes. Security surface examined in full: the claim.js four-edition delta (treeDirty third parameter, commitDiscardArchive helper, cmdRelease restore gate + emit, cmdWatchPr sweep pre-read + cleanup entry, exports) and its interaction with the epoch-1 sink-preflight exemption hunk in the four sink-merge.js copies.
- Review context honored structurally: validation_obligations [] (empty, nothing extra owed), review_phase discovery, attempt_ordinal 1, prior_findings [] — recorded; all certifier_* values below are taken verbatim from the context and the seeded evidence file, none invented.
- Upstream n3-code-certify-fix read in full (nonce recorded above); its code-domain certification of the same candidate was consistent with what this reviewer independently re-derived from the diff.
- Role honored read-only: no repository file modified. Verification was Read/Grep/git diff plus execution of the shipped suites, which build fixtures under os.tmpdir() and clean up.

## Attack results (every vector in the gate surface, traced to code)

1. Shell/argument injection — CLOSED. Every git invocation in the delta is execFileSync with an argument array: helper rev-parse x2 (:2354, :2360), add (:2374), diff (:2380), commit (:2383), cat-file (:2385); treeDirty status (:564, args array with -uall concatenated as a literal element); restore checkout (:3364). grep of all added lines finds no exec/spawn/eval/Function/shell:true. Branch names (releaseBaseBranch, sweepBaseBranch, base) appear only as single argv elements or in string equality — never concatenated into a command string. The commit message embeds folder.project as one argv element ('chore: discard archive ' + project, :2383), so a hostile project name cannot reach a shell. Every mutating pathspec is preceded by a literal '--' separator (add/diff/commit), so a dest path beginning with '-' is not an option-injection primitive.
2. Base-branch guard spoofing — CLOSED. The guard (:2360-2372) resolves the current branch via rev-parse --abbrev-ref HEAD from the dest's own toplevel and compares by pure string equality to baseBranch BEFORE any staging; both call sites inherit it inside the helper. A crafted branch name cannot coerce equality; a symbolic ref resolves to its true target branch; a detached HEAD yields literal 'HEAD' and mismatches any real base (fail-closed skip); a branch named like a path is irrelevant to the helper, which performs no checkout (the one checkout at :3364 is epoch-1 behavior with only a variable hoist, target unchanged). Empty/unresolvable base refuses explicitly (:2363-2366). Even hypothetically past the guard, staging and commit are pathspec-scoped to rel: 'git commit -- <rel>' takes only working-tree content under rel and cannot sweep foreign staged changes elsewhere, so no primitive stages or commits outside the dest.
3. Path traversal / dest escape — CLOSED. The helper refuses a missing dest, an empty rel (dest == toplevel), and any rel starting with '..' (:2349-2358); rel is derived from the dest's own rev-parse --show-toplevel, so a dest outside the repository is refused before any git mutation. In cmdRelease the restore exemption admits only path.relative(root, result.dest) with the same '..' rejection (:3351-3357), and the dest is the ACTUAL archiveProjectDirSafely result.dest (collision-suffix safe, the #700 lesson), never a reconstructed plain path.
4. Restore-gate exemption widening — CLOSED. treeDirty (:537-573) applies the exemption segment-boundary exact: norm === e || norm.startsWith(e + '/') (:567-570) with symmetric normalization (backslash-to-slash, trailing-slash strip) on both exempt entries and porcelain paths. A prefix look-alike sibling does not match — covered by the executed pin (prefix look-alike NOT exempt). The exemption lives in treeDirty only; isParkedLanePath semantics are untouched (kaola-workflow-adaptive-schema.js is absent from the candidate diff; its seg === 'archive' never-parked rule at adaptive-schema.js:3391 stands, and the executed baseline pin proves archive/* still counts dirty with no exemption). The two other treeDirty callers (:1158, :1353) pass no exemption and are byte-unchanged in behavior.
5. treeDirty/-uall interplay — CLOSED. -uall is appended ONLY when an exemption is in play (:564); without one, the status command and semantics are byte-identical to pre-candidate. With -uall, a wholly-untracked tree enumerates individually, so the exempt dest cannot hide behind a collapsed ancestor AND a foreign untracked sibling beside it still surfaces as dirty (executed sibling-dirty-still-blocks pin). The catch path still returns true — fail closed on any probe error.
6. Parked-lane / foreign-dirt / never-mutate-sibling — INTACT. The dirty filter remains !isExempt(p) && !isParkedLanePath(p, owned) (:571): exemption subtracts exactly the one release-created dest, parked-lane ignores are unchanged, and every other path still blocks the restore, which in turn makes the helper refuse (committed:false, branch disclosed, archive left as recoverable residue). The epoch-1 sink-preflight exemption surface (sink-merge.js, all four copies) is the anchored single-segment regex ^kaola-workflow/(?:archive/)?[^/]+/\.cache/sink-receipt\.json$ — no prefix or glob escape (nested, trailing-slash, and suffix forms cannot match), and it deliberately does NOT exempt .discarded-* residue: an uncommitted archive stays bucket-3 foreign dirt that loudly blocks the next sink, matching the warning emitted on the skip path. The interaction degrades safely on every failure branch.
7. Secrets and operator-controlled trust — CLEAN. No secret-shaped strings anywhere in the candidate diff (scanned for key/token/credential patterns: none). Emitted detail strings disclose only branch names and repo-relative paths in operator-local JSON. No new trust of operator-controlled branch names: they are compared, not executed.
8. Four-edition parity of the security hunks — PROVEN, not inferred. Canonical vs codex plugin copy: diff empty (byte-identical) for both claim.js and sink-merge.js. commitDiscardArchive body md5-identical across canonical/gitlab/gitea (ca78cd6993e1d37ce0048f5fe6dfecf7); treeDirty executable body md5-identical (d9f91cdb60ee3eb09c9889fca794095f); every security-relevant call-site line (sweepBaseBranch pre-read + fallback, restoreExempt construction, both helper calls, discard_archive_committed/branch/commit_detail disclosures on both emit sites, treeDirty/commitDiscardArchive exports) verified present in both forge ports' candidate diffs.

## Corroborating execution (run by this reviewer in the worktree)

- node scripts/test-claim-hardening.js -> claim-hardening tests passed (464 assertions), including the 14 #715 pins covering baseline never-parked, exact-dest exempt, sibling-dirty blocks, prefix look-alike not exempt, off-base refusal with branch disclosure + residue on disk, and on-base commit with tree at HEAD. (The 'API rate limit exceeded' lines are gh-CLI noise from offline-tolerant fixtures; the suite result is pass.)
- node scripts/simulate-workflow-walkthrough.js -> Workflow walkthrough simulation passed, including testReleaseInPlaceOnFeatureBranchCommitsArchiveOnBase (commit lands at main:<rel>, feature branch deleted) and testWatchPrClosedSweepSkipsCommitOffBaseBranch (committed === false, BOTH ref tips byte-unchanged, one recoverable residue dir — direct evidence the guard cannot be spoofed into committing onto a non-base branch).

## Prior observations

Parent-epoch non-blocking observations O1/O2 bind to the epoch-1 sink-merge/warning surface this repair deliberately did not touch; they are not security defects and remain exactly as classified — not re-admitted here. No pre-existing weaknesses were repackaged as candidate defects.

findings_none: true

domain_outcome: approved

review_conclusion: the F1 repair introduces no security regression across all four edition copies — every git invocation stays execFileSync argument-array with '--'-separated pathspecs scoped to the actual result.dest, the in-helper base-branch equality guard cannot be spoofed by crafted branch names, symbolic refs, or detached HEAD into staging or committing outside the dest, the restore-gate exemption matches exactly the one release-created path segment-boundary with -uall unmasking any foreign sibling, the parked-lane, foreign-dirt, and never-mutate-sibling protections plus the anchored epoch-1 sink-preflight exemption are undiminished, no secrets or unsafe trust of operator-controlled branch names were introduced, parity is proven byte- and md5-exact, and both shipped suites re-ran green with zero admitted findings.
certifier_kind: security
certifier_aggregation: sequence
certifier_gate_digest: fe82af8cc955d05f57627bbfac445b365bf824ede91b0b317eb3cd83e554c74a
certifier_epoch_lineage_id: e7aca78f34436bc91971c55844464388d936ebbce2289dbe5ebe26a5ad66b3cd
certifier_inherited_frontier_digest: f8a6ef769e3f012d484dd2859f77ac81202e39124c5ab8cfb53c9634d0c1bd06
certified_candidate_digest: c1003bdea4548c520cd30054c5be286ec3fcfc6b6d7b6ed2d27d76c2599bafa2
