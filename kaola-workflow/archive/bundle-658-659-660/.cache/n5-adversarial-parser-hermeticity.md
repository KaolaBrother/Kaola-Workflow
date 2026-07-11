evidence-binding: n5-adversarial-parser-hermeticity 01c82c8fc105
upstream_read: n3-review-bundle-contract aac646f8d545
upstream_read: n2-fence-parser-and-hermetic-fixtures 398b6320c00d
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=node_briefs_h3_parser_now_reuses_family_length_and_suffix_aware_fence_transition
finding: id=R2 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=brief_presence_hash_and_validation_now_distinguish_absent_present_and_ambiguous

# Adversarial replay — parser and GitLab fixture hermeticity

## Claim under test

For bundle issues #659 and #660, the current root, Codex, GitLab, and Gitea candidates are claimed
to share one authoritative Markdown fence contract across Meta, Nodes, Node Briefs, and Node Ledger.
In particular, the previously refuting Node Briefs inputs must keep fenced `### ghost` headings
non-authoritative, parse the genuine `### impl`, produce cross-edition-consistent hashes, freeze and
resume valid plans, reject duplicate/unclosed Briefs, and make a fenced-decoy-only Briefs heading
identical to no Briefs heading. The GitLab claim fixtures are claimed to remain local under empty
HOME, no credentials/environment, an always-fail forge CLI, and removed dependency stubs.

## Verdict

NOT-REFUTED — high confidence. The exact former counterexamples and additional fence variants all
passed in all four editions; the hostile GitLab controls also passed. No incomplete confirmation is
being treated as success: every requested parse/hash/freeze/resume and missing-stub path was executed.

## Exact former-counterexample replay

An in-memory four-edition matrix loaded each edition's real classifier and plan validator. Every
case used a valid plan containing Meta, Nodes, Node Ledger, an implementation node, mandatory review,
and finalize. It then called `sectionBodyState`, `parseNodeBriefs`, `computePlanHash`, `freezePlan`,
and `revalidateForResume` directly.

Inputs attempted:

- five-backtick `markdown` opener containing a shorter three-backtick line and fenced `### ghost`,
  then a genuine `### impl` after the five-backtick closer;
- four-tilde `text` opener containing a shorter three-tilde line and fenced ghost, then genuine impl;
- equal-length backtick and tilde delimiter lines with non-empty `not-a-close` suffixes before a
  fenced ghost;
- a different-family tilde fence inside a backtick fence and a longer valid backtick closer;
- a normal control with only genuine impl;
- duplicate genuine `## Node Briefs` sections;
- an unclosed five-backtick Briefs fence;
- a closed five-backtick preamble containing the only `## Node Briefs` decoy, compared with an
  otherwise identical plan with no Briefs heading.

Results were identical for root, Codex, GitLab, and Gitea:

- every valid fence variant returned section state `present`, parsed exactly `['impl']` with brief
  `implement safely`, froze, and resume-checked;
- each variant's plan hash was identical across all four editions (including
  `61cb1b16b94c001418944961d35cbaee5e2fc44caa8fae0447293eddc49fda9e` for the exact
  five-backtick/shorter-backtick replay and
  `f10dba2f952fbb8655f16f173cc3ad6dcae1084b92094b976ff761aa663ac5a6` for the tilde replay);
- duplicate genuine Briefs returned state `ambiguous`, validation reason
  `briefs_section_ambiguous`, and `freezePlan.frozen === false`;
- unclosed Briefs returned state `ambiguous` and the same typed refusal;
- fenced-decoy-only returned `nodeBriefsPresent === false` and `parseNodeBriefs === []`; absent and
  decoy-only hashes were equal at
  `0007d967b343a0d4f4c0ad7c688d1193121b2fe6369d96ce1a2a6908ae418d0e`, and both plans froze and
  resumed.

The prior failure mechanism is gone. Root/Codex classifiers at
`scripts/kaola-workflow-classifier.js:285-326` and the common copy, plus GitLab/Gitea classifiers at
`:228-269`, expose the family/run-length/empty-suffix-aware `markdownFenceTransition` and structured
`sectionBodyState`. Root/Codex `parseNodeBriefs` at
`scripts/kaola-workflow-plan-validator.js:1449-1471` and the common copy, plus forge validators at
`:1450-1472`, call that transition before recognizing an h3. Presence, hashing, and typed ambiguity
refusal share the same section state at root/Codex validator `:1441-1499` and forge `:1442-1500`.

## Full section-boundary and committed regressions

- `node scripts/simulate-workflow-walkthrough.js --only testNodeBriefAuthoritativeSectionMatrix`
  — PASS, exit 0. This committed real-source matrix replayed the long backtick/tilde fences,
  language tags, shorter delimiters, info-suffixed non-closers, fenced h3 ghosts, genuine impl,
  decoy-only hash identity, duplicate genuine Briefs, unclosed ambiguity, freeze, and resume across
  all editions.
- `node scripts/simulate-workflow-walkthrough.js --only testPlanConsumerFenceMatrix`
  — PASS, exit 0. This independently exercised fake Meta/Nodes/Briefs/Ledger headings before the
  genuine sections, a fenced h2 inside a real section, adjacent genuine boundaries, duplicate Nodes,
  unclosed fencing, identical cross-edition hashes, freeze, and resume.

Additional mixed-family and longer-closer inputs in the independent matrix found no state-machine,
parse, hash, freeze, or resume counterexample.

## GitLab empty-HOME hostile-CLI and missing-stub controls

Command:

`env -i HOME=/tmp/kw-adversarial-empty-home USERPROFILE=/tmp/kw-adversarial-empty-home PATH=<node-dir>:/usr/bin:/bin node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

Result: PASS, exit 0 in 17.50 seconds, ending `GitLab workflow script tests passed`. `env -i` removed
ambient credentials, forge variables, proxies, and user configuration. The driver installed its
always-fail exit-97 forge shim before loading forge consumers. The classification cases remained
green/blocked/indeterminate solely from local stubs, and the hostile CLI marker stayed absent.

The executed negative loop removed `viewIssue`, `discoverProject`, and `listIssueNotes` one at a
time. Each omission was caught before the callback by
`unexpected forge call: missing fixture dependency <name>` from
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:72-80`; the deletion/assertion
matrix is at `:714-724`. Captured output contained no remote, auth, host, 401, unknown-flag, or
unexpected-forge stderr. No hermeticity counterexample was found.

## Repository write audit

repository_writes_outside_bound_evidence: 0
authorized_bound_evidence_writes: 1

All custom plans were in-memory strings. Committed tests used only their self-cleaning temporary
directories. `git status --short` before and after the probes showed the same pre-existing product,
test, workflow-state, and cache path set; `git diff --check` remained green. This node changed no
product, test, documentation, plan/state, ledger, or other evidence file and did not close the node.

delegation_outcome: completed directly as dispatched; no sub-delegation; exact prior refutations replayed; no repository edits outside this bound evidence.
