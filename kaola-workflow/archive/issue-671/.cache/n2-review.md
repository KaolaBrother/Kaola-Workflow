evidence-binding: n2-review 3d66e4812b23
verdict: pass
findings_blocking: 0

# n2-review (G1 gate) — issue #671 task-mirror EISDIR stderr hygiene

Reviewed diff: 5 files (4 task-mirror copies + scripts/test-adaptive-node.js), +86/-4.
git diff --name-only confirms exactly those 5; git status shows no staged/other changes
besides the untracked kaola-workflow/issue-671/ evidence dir.

## (a) Guard catches the write fault with a one-line envelope — PASS

scripts/kaola-workflow-task-mirror.js:150-155 wraps the sole fs.writeFileSync(outPath, ...)
in try/catch; on catch it calls emit(refuse('mirror_write_failed', { status, path: outPath,
message: e.message })) then process.exit(1). It reuses the file's EXISTING #355 emit/refuse
helpers (required at line 30 from kaola-workflow-adaptive-schema — refusals go to STDOUT as
one compact JSON line, matching the plan_not_found/plan_not_frozen/missing_arg precedent in
the same file). Not swallowed silently: exit code stays 1. Independently reproduced in a
scratchpad repo (frozen plan + workflow-tasks.json dir collision): patched CLI printed
exactly one stdout line {"result":"refuse","reason":"mirror_write_failed",...,"message":
"EISDIR: illegal operation on a directory, open '...'"} and exited 1 — no stack trace,
single-line message.

## (b) Fail-open PRESERVED; invoker untouched — PASS

git diff --name-only does NOT list scripts/kaola-workflow-adaptive-node.js (nor any plugin
copy of it). Read refreshTaskMirror at kaola-workflow-adaptive-node.js:463-474: it shells the
task-mirror CLI, catches a shell throw as { status: 'failed', path }, and on non-zero exit
returns { status: 'failed', path, reason: (res && res.reason) || null } — shellNode (line 445)
parses err.stdout, so the new mirror_write_failed reason flows through unmodified where the
old crash yielded reason: null (empty stdout). The documented fail-OPEN contract (comment at
lines 454-457: "a mirror-refresh failure must NEVER roll back a correct ledger transition")
is structurally intact — callers embed the taskMirror field in a result:'ok' response. The
pre-existing #588-TASKMIRROR-OPEN/CLOSE fail-open pins run green in the same suite run below.
A mirror write failure still never blocks a run.

## (c) Cross-edition parity — PASS

Ran node scripts/edition-sync.js --check myself: "edition-sync: 10 forge aggregator ports, 24
COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical." (exit 0).
cmp canonical vs plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js: BYTE-IDENTICAL.
diff canonical vs each RENAMED forge port (kaola-gitlab-…, kaola-gitea-…): the ONLY differing
line is the pre-existing forge-renamed require at line 25 (kaola-gitlab-/kaola-gitea-
workflow-plan-validator) — the #671 guard hunk is byte-identical in all four copies.

## (d) Regression genuinely distinguishes old vs new — PASS

Independently re-derived RED (no repo mutation): extracted HEAD's unpatched task-mirror into
the scratchpad alongside the full scripts dir and ran it against the same dir-collision repo —
it crash-dumped the raw multi-line stack trace (node:fs:2397, "at Object.writeFileSync",
"at Object.<anonymous> (.../kaola-workflow-task-mirror.js:143:6)", the Module._compile/load
chain) with EMPTY stdout. The new #671-MIRROR-CRASH-OBSERVABILITY block
(scripts/test-adaptive-node.js:7957-7989) spawns the CLI single-hop against a makeLaneRepo
fixture (frozen plan, so the CLI reaches the write site) with workflow-tasks.json mkdir'd as a
directory, and asserts: exit non-zero; NO "at Object.<anonymous>"/"at Module." frames; NO
"Error: EISDIR" followed by a stack frame; stdout exactly ONE line; that line parses to
{result:'refuse', reason:'mirror_write_failed'}; message contains no '\n'. Against the
observed old output, 5 of the 6 assertions fail (only the exit!=0 pin passes) — matching n1's
RED report — so a regression back to raw-throw is caught. GREEN confirmed in the full-suite
run under (f).

## (e) Surgical / additive — PASS

Read the full post-fix canonical file (165 lines): the ONLY behavioral change is the try/catch
at the :143 write site. Happy-path write + --json stdout echo (lines 157-159), the missing_arg
/plan_not_found/plan_not_frozen refusal paths (lines 116, 128, 138), generateMirror,
mapLedgerStatus, and module.exports are untouched. Repo-wide grep for mirror_write_failed
finds no other consumer enumerating task-mirror reasons — refreshTaskMirror passes res.reason
through untyped, so the new reason is purely additive. Test diff adds only the one new block.

## (f) Suites green — PASS

- node scripts/test-adaptive-node.js → "adaptive-node tests passed (1786 assertions)", exit 0
  (matches n1's post-fix count; a stray localized git stderr line from a pre-existing
  corrupted-index fixture appears mid-run — outside this diff, suite green).
- node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed",
  exit 0.

## Verdict

APPROVE. Zero blocking findings. The child now fails closed at its own process boundary with
the same typed one-line envelope every other refusal in the CLI uses, while the end-to-end
mirror-refresh contract stays fail-open with zero caller change; the guard is byte-identical
across all four editions; the regression is a genuine old/new discriminator (independently
re-proven RED); both suites green.
