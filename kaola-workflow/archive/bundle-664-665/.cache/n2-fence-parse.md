evidence-binding: n2-fence-parse 404302258587

upstream_read: n1-repair-fold 7c50240a9817

RED: Two residual #660 consumers reproduced BEFORE any edit (real subprocess/direct-call runs
against the unpatched HEAD bytes, captured before touching either file):

Consumer 1 — `locateSection` (scripts/kaola-workflow-adaptive-schema.js): built a plan whose
`## Node Briefs` section for node `impl-core` carries a 5-backtick fence enclosing a single stray
3-backtick line, then a fenced `## Node Ledger` DECOY table (`| impl-core | pending |`), then the
REAL 5-backtick closer, then the GENUINE `## Node Ledger`. Direct call on the unpatched function:
  locateSection(decoyPlan, 'Node Ledger') -> { start: 519, next: -1 }
  sliced block: "\n## Node Ledger\n| id | status |\n| --- | --- |\n| impl-core | pending |\n`````\n\n## Node Ledger\n\n...(rest of doc to EOF)..."
  classifier.sectionBodyState ground truth (status:'present') body: "\n| id | status |\n| --- | --- |\n| impl-core | pending |\n| review | pending |\n| finalize | pending |\n\n"
  FAIL: the family-only closer let the interior 3-backtick line prematurely close the 5-backtick
  fence, so the DECOY heading was selected as "unfenced" and `next` ran all the way to EOF instead
  of stopping at the genuine section boundary — disagreeing with classifier.sectionBody.
End-to-end (real subprocess, hand-frozen plan + correct plan_hash via computePlanHash, real git
repo, node kaola-workflow-adaptive-node.js open-next):
  control --resume-check (pre-open): {"ok":true,...}  (sane baseline)
  open-next: {"result":"ok","opened":{"id":"impl-core",...}}  (silently "succeeds")
  post-open --resume-check: {"ok":false,"result":"refuse","reasonCode":"plan_hash_mismatch",
    "reason":"plan_hash mismatch — workflow-plan.md tampered after freeze",...}
  FAIL: spliceLedgerNode's row-replace, mis-scoped into the decoy's over-broad (mis-closed) block,
  mutated bytes INSIDE the hash-covered `## Node Briefs` body (flipping the decoy's
  `| impl-core | pending |` to `in_progress`) — a completely legitimate open-next now bricks every
  subsequent --resume-check / barrier check with a false "tampered" refusal. This is the
  hash-mismatch wedge the task named.

Consumer 2 — `unreleasedSection` (scripts/kaola-workflow-release.js): zero fence awareness at all
(`/^##[ \t]+/m` terminates on ANY `## ` line, fenced or not). Real subprocess
(node kaola-workflow-release.js --verify) against the unpatched HEAD bytes:
  (a) changelog = '## [Unreleased]\n\n```\n## fenced decoy heading\n```\n- Real fix (#741)\n',
      --issues-closed 741
      -> exit 1, {"result":"refuse","reason":"changelog_incomplete","missing":[741],
         "changelog_refs":[],...}
      FAIL: spurious changelog_incomplete — #741 IS documented, just after the fence; the fenced
      decoy heading truncated the section before reaching it.
  (b) changelog = '## [Unreleased]\n\n- Known (#654)\n```\n## fenced decoy heading\n```\n- Unknown (#999)\n',
      --issues-closed 654
      -> exit 0, {"result":"ok","changelog_refs":[654],...}
      FAIL: the unknown ref #999 is HIDDEN from the changelog_unknown_reference guard — same
      truncation, opposite direction (a bad reference silently slips through release verification).

GREEN: Both consumers fixed by adopting the #660 classifier's markdownFenceTransition transition
semantics LOCALLY (pure string ops, no cross-dependency — neither file may import the classifier):
a closer must be the SAME family AND have a run-length >= the OPENER's AND an empty/whitespace-only
suffix. FIRST-HIT heading selection is unchanged; a genuine duplicate unfenced heading (vanishingly
rare malformed input) is documented as a deliberate first-hit fallback in both files' comments,
since neither `locateSection`'s {start,next} offset-pair contract nor `unreleasedSection`'s
{section,refs} contract has an ambiguous-status channel the way classifier.sectionBodyState does,
and every existing caller already tolerates first-hit-wins.

Consumer 1 fix (scripts/kaola-workflow-adaptive-schema.js `locateSection`, applied byte-identically
to all 4 copies): captured fenceLen alongside fam at BOTH the opener and both scan loops
(start-search + next-search); a closer now requires `f === fam && len >= fenceLen && /^\s*$/.test(suffix)`.
Re-ran the RED reproduction on the FIXED code:
  locateSection(decoyPlan, 'Node Ledger') -> matches classifier.sectionBodyState exactly (sliced
  block sans heading === ground-truth body; decoy `` ````` `` block fully excluded).
  E2E: control --resume-check ok:true -> open-next opens impl-core -> POST-OPEN --resume-check
  ok:true (no more plan_hash_mismatch) -> record-evidence (RED/GREEN tokens) -> close-and-open-next
  closes impl-core / opens review -> FINAL --resume-check ok:true -> genuine ledger (via
  classifier.sectionBody ground truth) shows `| impl-core | complete |` / `| review | in_progress |`;
  the decoy inside `## Node Briefs` is never the splice target again.
New test T6c (#665) added to scripts/test-adaptive-node.js immediately after T6 (#354): a direct
locateSection-vs-classifier.sectionBody parity check plus the full real-subprocess
open -> splice -> close -> resume sequence above.
`node scripts/test-adaptive-node.js` -> "adaptive-node tests passed (1755 assertions)" (was 1744
before n1's #664 fix + this node's #665 additions; +11 new assertions, exit 0). (Two pre-existing,
unrelated EISDIR stderr traces from an unrelated #437 lane-settlement child-process fixture print
to stderr mid-run but do not affect pass/fail accounting or exit code — confirmed pre-existing,
outside this node's write set.)

Consumer 2 fix (scripts/kaola-workflow-release.js `unreleasedSection`, byte-identical
canonical<->codex + mirrored into the two rename-normalized forge ports
kaola-gitlab-workflow-release.js / kaola-gitea-workflow-release.js): line-scans the body after the
`[Unreleased]` heading tracking fam/fenceLen exactly as above; terminates only on an unfenced
`^##[ \t]+` line. Re-ran the RED reproduction on the FIXED code:
  (a) fencedComplete: exit 0, changelog_refs:[741] (no spurious changelog_incomplete).
  (b) fencedUnknown: exit 1, reason changelog_unknown_reference, unknown:[999] (guard restored).
Regression-checked the 3 existing structural-boundary cases (EOF/next-heading/heading-like-text)
byte-for-byte unchanged.
New assertions added to scripts/test-release.js in the existing "[Unreleased] references are
structurally bounded" block, immediately after the pre-existing `unknown` case.
`node scripts/test-release.js` -> "test-release: all 242 assertions passed" (was 240; +2 new
assertions, exit 0).

Full local check suite (all green):
  node scripts/test-adaptive-node.js       -> adaptive-node tests passed (1755 assertions)
  node scripts/test-release.js             -> test-release: all 242 assertions passed
  node scripts/simulate-workflow-walkthrough.js -> "Workflow walkthrough simulation passed" (exit 0)
  node scripts/validate-script-sync.js     -> "OK: 24 common scripts, 27 byte-identical groups,
    8 rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge
    export-superset families in sync."
  node scripts/edition-sync.js --check     -> "edition-sync: 10 forge aggregator ports, 24
    COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical."

scripts/simulate-workflow-walkthrough.js: declared-but-not-written (skip-reason) — the new T6c
(#665) test in test-adaptive-node.js already drives the exact real-subprocess
open -> record-evidence -> close-and-open-next -> resume-check lifecycle end-to-end (mirroring the
walkthrough's #654-style pattern), so no additional walkthrough scenario was needed; the walkthrough
itself (which already exercises many `## Node Ledger` / project-fixture read/write paths, incl.
testGateEvidenceNonceRotation654) was re-run as a pure regression check and passes unchanged.

Write set touched: scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js,
plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js,
plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js (byte-identical ×4, verified
via diff), scripts/kaola-workflow-release.js, plugins/kaola-workflow/scripts/kaola-workflow-release.js
(byte-identical canonical<->codex, verified via diff), plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js,
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js (rename-normalized ports,
same logic mirrored), scripts/test-adaptive-node.js, scripts/test-release.js. Did NOT touch
scripts/kaola-workflow-adaptive-node.js or its edition ports (n1's in-progress uncommitted changes,
per instruction) or scripts/simulate-workflow-walkthrough.js (skip-reason above).
